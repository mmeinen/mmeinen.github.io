'use strict';
// battle.js — the fleet action over Miller: effects, simulation, choreography and its camera.
//
// Everything lives in the ARENA frame (km, float64; see ships.js). Effects are drawn inside the ships' MSAA
// pass, depth-tested against hulls and the planet (log depth), premultiplied-alpha blended: glows add
// (alpha 0), smoke darkens (alpha > 0). The simulation is deliberately simple -- pursuit steering, lead-aimed
// turrets, shields then hull -- and the SCRIPT forces the beats that must land on cue (the cruiser kill, the
// lance, the dreadnought's death) so every run tells the same story with different details.

// ------------------------------------------------------------------------------------------ shaders
const VS_BEAM = `#version 300 es
precision highp float;
layout(location=0) in vec4 i0; layout(location=1) in vec4 i1; layout(location=2) in vec4 i2;
uniform mat4 u_vp; uniform float u_pxK;                   // pixels per (km at 1 km)
out vec2 vUV; out vec3 vCol; out float vW; out float vDist; flat out float vCore;
void main(){
  vec3 a = i0.xyz, b = i1.xyz; float w = i0.w;
  int k = gl_VertexID; float s = float(k >> 1), side = float(k & 1)*2.0 - 1.0;
  vec3 p = mix(a, b, s), d = b - a;
  vec3 perp = cross(d, p); float pl = length(perp); perp = pl > 1e-12 ? perp/pl : vec3(0.0, 1.0, 0.0);
  float dist = max(length(p), 1e-6), px = w/dist*u_pxK;
  float wd = max(w, 1.3*dist/u_pxK);                      // never thinner than ~1.3 px: keeps flux, kills flicker
  vec3 ext = normalize(d)*wd*(s*2.0 - 1.0);
  p += perp*side*wd*2.5 + ext;
  vUV = vec2(side*2.5, s); vCol = i2.rgb*min(px/1.3, 1.0); vW = i2.a; vCore = i1.w; vDist = length(p);
  gl_Position = u_vp*vec4(p, 1.0);
}`;
const FS_BEAM = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vCol; in float vW; in float vDist; flat in float vCore;
${LOGZ_GLSL}
out vec4 o;
void main(){
  gl_FragDepth = logDepth(vDist);
  float v = vUV.x, core = exp(-v*v*6.0), glow = exp(-abs(v)*1.6)*0.35*(1.0 - smoothstep(1.5, 2.5, abs(v)));   // zero at the quad edge
  vec3 c = vCol*(core*vCore + glow)*vW + vec3(1.0)*core*core*vCore*0.6*vW*length(vCol)/1.7;
  o = vec4(c, 0.0);
}`;
const VS_SPR = `#version 300 es
precision highp float;
layout(location=0) in vec4 i0; layout(location=1) in vec4 i1; layout(location=2) in vec4 i2; layout(location=3) in vec4 i3;
uniform mat4 u_vp; uniform vec3 u_R, u_U;
out vec2 vUV; out vec3 vCol; flat out vec4 vP; out float vDist;
void main(){
  int k = gl_VertexID; vec2 q = vec2(float(k & 1), float(k >> 1))*2.0 - 1.0;
  vec3 ax = i2.xyz, ay = i3.xyz;
  if (dot(ax, ax) < 1e-12) { ax = u_R; ay = u_U; }         // camera-facing unless oriented
  vec3 p = i0.xyz + (ax*q.x + ay*q.y)*i0.w;
  vUV = q; vCol = i1.rgb; vP = vec4(i1.w, i2.w, i3.w, i0.w); vDist = length(p);
  gl_Position = u_vp*vec4(p, 1.0);
}`;
const FS_SPR = `#version 300 es
precision highp float; precision highp int;
in vec2 vUV; in vec3 vCol; flat in vec4 vP; in float vDist;
uniform float u_time;
${LOGZ_GLSL}
out vec4 o;
const uvec3 HK = uvec3(0x8da6b343u, 0xd8163841u, 0xcb1ab31fu);
float hf(uint h){ h ^= h >> 16u; h *= 0x85ebca6bu; h ^= h >> 13u; h *= 0xc2b2ae35u; h ^= h >> 16u; return float(h >> 8u)/16777215.0; }
float vn3(vec3 x){ vec3 fl = floor(x), w = x - fl, u = w*w*(3.0 - 2.0*w); uvec3 p0 = uvec3(ivec3(fl))*HK, p1 = p0 + HK;
  return mix(mix(mix(hf(p0.x^p0.y^p0.z), hf(p1.x^p0.y^p0.z), u.x), mix(hf(p0.x^p1.y^p0.z), hf(p1.x^p1.y^p0.z), u.x), u.y),
             mix(mix(hf(p0.x^p0.y^p1.z), hf(p1.x^p0.y^p1.z), u.x), mix(hf(p0.x^p1.y^p1.z), hf(p1.x^p1.y^p1.z), u.x), u.y), u.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a*vn3(p); p = p*2.07 + 3.1; a *= 0.5; } return s; }
vec3 fire(float T){ return vec3(1.0, 0.45, 0.12)*smoothstep(0.0, 0.35, T) + vec3(0.0, 0.5, 0.3)*smoothstep(0.35, 0.7, T) + vec3(0.0, 0.1, 0.55)*smoothstep(0.7, 1.0, T); }
void main(){
  gl_FragDepth = logDepth(vDist);                         // same depth law as hulls and the planet
  int type = int(vP.x + 0.5); float age = vP.y, seed = vP.z;
  vec2 q = vUV; float r = length(q);
  float win = 1.0 - smoothstep(0.7, 1.0, r);               // every sprite fades to zero inside its quad
  vec4 c = vec4(0.0);
  if (type == 0) {                                        // glow
    float g = exp(-r*r*9.0) + 0.12*exp(-r*r*2.2);
    c = vec4(vCol*g*win, 0.0);
  } else if (type == 1) {                                 // flash with anamorphic-free spikes (6 + 2, JWST-like)
    float g = (exp(-r*r*40.0)*2.0 + exp(-r*r*6.0)*0.4 + 0.05*exp(-r*1.2))*win;
    float sp = 0.0;
    for (int i = 0; i < 3; i++) { float a = 1.5708 + float(i)*1.0472; vec2 d = vec2(cos(a), sin(a));
      float al = abs(dot(q, d)), pe = abs(dot(q, vec2(-d.y, d.x))); sp += exp(-pe*pe*5000.0)*pow(max(1.0 - al, 0.0), 3.0); }
    sp += 0.4*exp(-q.y*q.y*8000.0)*pow(max(1.0 - abs(q.x)*1.6, 0.0), 3.0);
    sp *= 1.0 - smoothstep(0.8, 1.0, max(abs(q.x), abs(q.y)));
    c = vec4(vCol*(g + sp*0.9), 0.0);
  } else if (type == 2) {                                 // fireball: noisy sphere, cooling from white to smoke
    if (r > 1.0) discard;
    float z = sqrt(1.0 - r*r);
    float n = fbm(vec3(q*2.4, z*1.5 + seed*7.0) + vec3(0.0, 0.0, age*0.9));
    float dens = smoothstep(0.1, 0.55, n + z*0.55 - r*0.45 - age*0.35);
    float T = clamp(1.25 - age*1.05 + (n - 0.5)*0.6 + z*0.25, 0.0, 1.0);
    vec3 em = fire(T)*T*T*2.6*vCol;
    float smoke = dens*smoothstep(0.25, 1.0, age)*0.85;
    c = vec4(em*dens + vec3(0.05, 0.045, 0.04)*smoke*0.3, smoke*0.9);
  } else if (type == 3) {                                 // smoke puff
    if (r > 1.0) discard;
    float n = fbm(vec3(q*2.0, seed*5.0 + age*0.4));
    float d = smoothstep(1.0, 0.3, r)*smoothstep(0.25, 0.65, n)*(1.0 - smoothstep(0.4, 1.0, age));
    c = vec4(vCol*d*0.15, d*0.55);
  } else if (type == 4) {                                 // shockwave ring (oriented quad)
    float w = 0.05 + 0.1*age, x = (r - (1.0 - w))/w;
    float ring = exp(-x*x*2.0)*(1.0 - smoothstep(0.7, 1.0, age))*(1.0 - smoothstep(0.9, 1.0, r));
    float n = 0.6 + 0.8*fbm(vec3(atan(q.y, q.x)*3.0, r*6.0, seed));
    c = vec4(vCol*ring*n, 0.0);
  } else if (type == 5) {                                 // shield hit: hex cells flaring round the impact
    vec2 h = q*6.0; h.x *= 1.1547; h.y += mod(floor(h.x), 2.0)*0.5;
    vec2 f = fract(h) - 0.5; float edge = smoothstep(0.38, 0.5, max(abs(f.x)*1.2, abs(f.y)));
    float fall = exp(-r*r*3.0)*(1.0 - age);
    c = vec4(vCol*(edge*0.9 + 0.25)*fall, 0.0);
  }
  o = c;
}`;
P.beam = program(VS_BEAM, FS_BEAM);
P.spr = program(VS_SPR, FS_SPR);

// ------------------------------------------------------------------------------------------ fx buffers
const FX = {beams: [], sprites: [], beamBuf: null, sprBuf: null, bData: new Float32Array(12*4096), sData: new Float32Array(16*4096), vaoB: null, vaoS: null};
function fxInitGL(){
  if (FX.vaoB) return;
  FX.vaoB = gl.createVertexArray(); gl.bindVertexArray(FX.vaoB);
  FX.beamBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, FX.beamBuf); gl.bufferData(gl.ARRAY_BUFFER, FX.bData.byteLength, gl.DYNAMIC_DRAW);
  for (let k = 0; k < 3; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 4, gl.FLOAT, false, 48, k*16); gl.vertexAttribDivisor(k, 1); }
  FX.vaoS = gl.createVertexArray(); gl.bindVertexArray(FX.vaoS);
  FX.sprBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, FX.sprBuf); gl.bufferData(gl.ARRAY_BUFFER, FX.sData.byteLength, gl.DYNAMIC_DRAW);
  for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 4, gl.FLOAT, false, 64, k*16); gl.vertexAttribDivisor(k, 1); }
  gl.bindVertexArray(vao);
}
// beam: a,b (km arena), width km, colour (HDR), core 0..1, intensity
function fxBeam(a, b, w, col, core = 1, k = 1){ FX.beams.push([a, b, w, col, core, k]); }
// sprite: pos (km arena), size km, colour, type, age 0..1, seed, [ax, ay] oriented axes (arena) or null
function fxSprite(p, size, col, type, age = 0, seed = 0, ax = null, ay = null){ FX.sprites.push([p, size, col, type, age, seed, ax, ay]); }
function fxRender(now, vp, w, h){
  fxInitGL();
  const camA = cam.free.arena, b = cam.b;
  gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.blendEquation(gl.FUNC_ADD);
  // sprites first (fireballs/smoke), beams over them
  let n = 0; const S = FX.sData;
  for (const [p, size, col, type, age, seed, ax, ay] of FX.sprites) {
    if (n >= 4096) break;
    const rel = arenaDir(V.sub(p, camA)), X = ax ? V.mul(arenaDir(ax), 1) : [0, 0, 0], Y = ay ? arenaDir(ay) : [0, 0, 0];
    S.set([rel[0], rel[1], rel[2], size, col[0], col[1], col[2], type, X[0], X[1], X[2], age, Y[0], Y[1], Y[2], seed], n*16); n++;
  }
  if (n) {
    const Q = P.spr; gl.useProgram(Q.p);
    gl.uniformMatrix4fv(Q.u.u_vp, false, vp); gl.uniform3fv(Q.u.u_R, b.r); gl.uniform3fv(Q.u.u_U, b.u); gl.uniform1f(Q.u.u_time, now*0.001);
    gl.bindVertexArray(FX.vaoS); gl.bindBuffer(gl.ARRAY_BUFFER, FX.sprBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, S, 0, n*16);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
  n = 0; const B = FX.bData;
  for (const [a, bb, wd, col, core, k] of FX.beams) {
    if (n >= 4096) break;
    const ra = arenaDir(V.sub(a, camA)), rb = arenaDir(V.sub(bb, camA));
    B.set([ra[0], ra[1], ra[2], wd, rb[0], rb[1], rb[2], core, col[0], col[1], col[2], k], n*12); n++;
  }
  if (n) {
    const Q = P.beam; gl.useProgram(Q.p);
    gl.uniformMatrix4fv(Q.u.u_vp, false, vp); gl.uniform1f(Q.u.u_pxK, h/(2*Math.tan(cam.fov/2)));
    gl.bindVertexArray(FX.vaoB); gl.bindBuffer(gl.ARRAY_BUFFER, FX.beamBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, B, 0, n*12);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
  gl.bindVertexArray(vao);
  gl.disable(gl.BLEND); gl.depthMask(true);
}

// ------------------------------------------------------------------------------------------ simulation
const TEAM_COL = [[0.35, 0.65, 1.0], [1.0, 0.45, 0.12]];
const CLS = {           // radius km (hit ellipsoid ~ half extents), hp, shield, speed km/s, turn rad/s, guns
  argo:    {ext: [0.2, 0.15, 1.2], hp: 900, sh: 700, spd: 0.03, turn: 0.05, guns: 22, gunRate: 0.45, gunDmg: 6, size: 1},
  tyrant:  {ext: [0.8, 0.22, 1.6], hp: 1100, sh: 600, spd: 0.025, turn: 0.04, guns: 24, gunRate: 0.45, gunDmg: 6, size: 1},
  cruiser: {ext: [0.09, 0.07, 0.38], hp: 260, sh: 120, spd: 0.06, turn: 0.1, guns: 8, gunRate: 0.6, gunDmg: 4, size: 1},
  frigate: {ext: [0.05, 0.03, 0.12], hp: 90, sh: 40, spd: 0.09, turn: 0.2, guns: 2, gunRate: 0.8, gunDmg: 3, size: 1, missiles: true},
  hawk:    {ext: [0.008, 0.003, 0.008], hp: 6, sh: 0, spd: 0.42, turn: 1.6, guns: 1, gunRate: 2.2, gunDmg: 1.2, size: 1, fighter: true},
  wasp:    {ext: [0.006, 0.005, 0.006], hp: 5, sh: 0, spd: 0.46, turn: 1.8, guns: 1, gunRate: 2.2, gunDmg: 1.0, size: 1, fighter: true},
};
const BATTLE = {on: false, t: 0, ships: [], bolts: [], missiles: [], fx: [], lances: [], rnd: mulberry(77), script: null, shot: null, timeScale: 1, events: []};
function mkShip(cls, team, pos, fwd, name){
  const c = CLS[cls];
  return {cls, team, pos: pos.slice(), vel: V.mul(V.norm(fwd), c.spd), fwd: V.norm(fwd), up: [0, 1, 0], hp: c.hp, sh: c.sh, maxHp: c.hp, maxSh: c.sh,
          alive: true, vis: true, name: name || cls, cool: 0, target: null, dying: -1, glow: 0, seed: BATTLE.rnd(), wreck: false, spin: null};
}
function shipRot(s){ return orient(s.fwd, s.up); }
function worldPoint(s, local){ const [r, u, f] = shipRot(s); return V.add(s.pos, V.add(V.add(V.mul(r, local[0]), V.mul(u, local[1])), V.mul(f, local[2]))); }
function randomHullPoint(s, top){
  const e = CLS[s.cls].ext, R = BATTLE.rnd;
  return worldPoint(s, [(R()*2 - 1)*e[0]*0.8, (top ? R() : R()*2 - 1)*e[1], (R()*2 - 1)*e[2]*0.9]);
}
// segment vs ship ellipsoid: returns the hit fraction or -1
function hitShip(s, a, b){
  const [r, u, f] = shipRot(s), e = CLS[s.cls].ext;
  const la = V.sub(a, s.pos), lb = V.sub(b, s.pos);
  const A = [V.dot(la, r)/e[0], V.dot(la, u)/e[1], V.dot(la, f)/e[2]], Bv = [V.dot(lb, r)/e[0], V.dot(lb, u)/e[1], V.dot(lb, f)/e[2]];
  const d = V.sub(Bv, A), qa = V.dot(d, d), qb = 2*V.dot(A, d), qc = V.dot(A, A) - 1, D = qb*qb - 4*qa*qc;
  if (D < 0 || qa < 1e-18) return -1;
  const t = (-qb - Math.sqrt(D))/(2*qa);
  return t >= 0 && t <= 1 ? t : (qc < 0 ? 0 : -1);
}
function spawnBolt(from, dir, team, speed, dmg, owner, heavy){
  BATTLE.bolts.push({p: from.slice(), v: V.mul(V.norm(dir), speed), team, dmg, owner, life: heavy ? 5 : 1.2, heavy: !!heavy});
}
function explosion(p, size, vel, opts = {}){
  const R = BATTLE.rnd, t0 = BATTLE.t;
  BATTLE.fx.push({kind: 'flash', p: p.slice(), size: size*(opts.flash || 2.2), t0, life: 0.35, col: [1.4, 1.1, 0.8]});
  BATTLE.fx.push({kind: 'fire', p: p.slice(), v: vel ? V.mul(vel, 0.6) : [0, 0, 0], size: size, grow: size*1.2, t0, life: 1.6 + size*0.4, seed: R()});
  const nS = opts.sparks ?? Math.round(14 + 60*Math.min(size, 1.5));
  for (let k = 0; k < nS; k++) {
    const d = V.norm([R()*2 - 1, R()*2 - 1, R()*2 - 1]);
    BATTLE.fx.push({kind: 'spark', p: p.slice(), v: V.add(V.mul(d, size*(1.5 + R()*5)), vel ? V.mul(vel, 0.8) : [0, 0, 0]), t0, life: 0.6 + R()*1.4, w: size*0.004 + 0.0004});
  }
  for (let k = 0; k < (opts.smoke ?? 3); k++)
    BATTLE.fx.push({kind: 'smoke', p: V.add(p, V.mul([R() - 0.5, R() - 0.5, R() - 0.5], size)), v: V.mul([R() - 0.5, R() - 0.5, R() - 0.5], size*0.4), size: size*1.3, t0: t0 + 0.2, life: 3 + R()*2, seed: R()});
  if (opts.ring) {
    const n = V.norm([R() - 0.5, 1.5, R() - 0.5]), ax = V.norm(V.cross(n, [1, 0, 0])), ay = V.cross(n, ax);
    BATTLE.fx.push({kind: 'ring', p: p.slice(), size: size, grow: size*9, t0, life: 5, ax, ay, seed: R()});
  }
  BATTLE.events.push({type: 'boom', size, p: p.slice(), t: t0});
}
function damageShip(s, dmg, at){
  if (!s.alive || s.dying >= 0) return;
  if (s.sh > 0) {
    s.sh -= dmg;
    const n = V.norm(V.sub(at, s.pos)), ax = V.norm(V.cross(n, [0, 1, 0.01])), ay = V.cross(n, ax);
    const sz = Math.max(0.06, CLS[s.cls].ext[2]*0.18);
    BATTLE.fx.push({kind: 'shield', p: at.slice(), size: sz, t0: BATTLE.t, life: 0.5, ax, ay, col: s.team ? [1.4, 0.7, 0.2] : [0.3, 0.8, 1.6]});
    return;
  }
  s.hp -= dmg;
  if (s.armor) s.hp = Math.max(s.hp, s.maxHp*s.armor);     // plot armour: only the script kills heroes
  if (BATTLE.rnd() < 0.4 || CLS[s.cls].fighter) explosion(at, CLS[s.cls].fighter ? 0.02 : 0.05 + BATTLE.rnd()*0.05, s.vel, {sparks: 10, smoke: 1});
  if (s.hp <= 0) killShip(s);
}
function killShip(s){
  if (s.dying >= 0 || !s.alive) return;
  const c = CLS[s.cls];
  if (c.fighter) { explosion(s.pos, 0.035, s.vel, {sparks: 30, smoke: 2}); s.alive = false; s.vis = false; return; }
  s.dying = BATTLE.t;            // capital: chain of internal blasts, then the big one (see stepShips)
  BATTLE.events.push({type: 'dying', ship: s, t: BATTLE.t});
}
function nearestEnemy(s, pred){
  let best = null, bd = 1e9;
  for (const o of BATTLE.ships) if (o.alive && o.vis && !o.wreck && o.dying < 0 && o.team !== s.team && (!pred || pred(o))) {
    const d = V.len(V.sub(o.pos, s.pos)); if (d < bd) { bd = d; best = o; }
  }
  return best;
}
function steer(s, desired, dt){
  const c = CLS[s.cls], d = V.norm(desired), cosA = Math.max(-1, Math.min(1, V.dot(s.fwd, d)));
  const ang = Math.acos(cosA), maxA = c.turn*dt;
  if (ang > 1e-6) { const k = Math.min(1, maxA/ang); s.fwd = V.norm(V.add(V.mul(s.fwd, 1 - k), V.mul(d, k))); }
  // bank into the turn (fighters), keep roughly level otherwise
  const side = V.dot(V.cross(s.fwd, d), [0, 1, 0]);
  const upT = c.fighter ? V.norm(V.add([0, 1, 0], V.mul(V.cross(s.fwd, [0, 1, 0]), -side*6))) : [0, 1, 0];
  s.up = V.norm(V.add(V.mul(s.up, 1 - Math.min(1, dt*3)), V.mul(upT, Math.min(1, dt*3))));
}
function stepShips(dt){
  const R = BATTLE.rnd, T = BATTLE.t;
  for (const s of BATTLE.ships) {
    if (!s.alive) continue;
    const c = CLS[s.cls];
    if (s.dying >= 0) {                                   // capital death sequence
      const a = T - s.dying;
      s.vel = V.mul(s.vel, 1 - dt*0.2); s.pos = V.add(s.pos, V.mul(s.vel, dt));
      if (s.spin) { s.fwd = V.norm(V.add(s.fwd, V.mul(V.cross(s.spin, s.fwd), dt))); }
      if (a < 4.5 && R() < dt*(6 + a*4)) explosion(randomHullPoint(s), 0.06 + R()*0.18*(1 + a), s.vel, {sparks: 25, smoke: 2});
      s.damage = Math.min(1, 0.4 + a*0.15);
      if (a >= 4.5 && !s.boomed) {
        s.boomed = true;
        explosion(s.pos, c.ext[2]*0.9, s.vel, {ring: true, sparks: 260, smoke: 10, flash: 3.5});
        for (let k = 0; k < 6; k++) explosion(randomHullPoint(s), c.ext[2]*0.3, s.vel, {sparks: 30, smoke: 2});
        BATTLE.events.push({type: 'destroyed', ship: s, t: T});
        s.vis = false;
        // wreckage: burning hull sections drifting apart; the first one falls toward the planet
        for (let k = 0; k < 3; k++) {
          const w = mkShip('cruiser', s.team, randomHullPoint(s), V.norm([R() - 0.5, R() - 0.5, R() - 0.5]), 'WRECK');
          w.wreck = true; w.damage = 1; w.size = 1.6 - k*0.3; w.hp = 1e9; w.sh = 0; w.dying = -1;
          w.vel = V.add(V.mul(s.vel, 0.5), V.mul(V.norm([R() - 0.5, (k === 0 ? -1.4 : R() - 0.5), R() - 0.5]), 0.05 + R()*0.04));
          w.spin = V.mul(V.norm([R() - 0.5, R() - 0.5, R() - 0.5]), 0.15 + R()*0.2);
          BATTLE.ships.push(w); if (k === 0 && s === BATTLE.tyrant) BATTLE.faller = w;
        }
      }
      if (a > 9) s.alive = false;
      continue;
    }
    if (s.wreck) {
      s.pos = V.add(s.pos, V.mul(s.vel, dt));
      s.fwd = V.norm(V.add(s.fwd, V.mul(V.cross(s.spin, s.fwd), dt))); s.up = V.norm(V.add(s.up, V.mul(V.cross(s.spin, s.up), dt)));
      if (R() < dt*3) BATTLE.fx.push({kind: 'smoke', p: randomHullPoint(s), v: V.mul(s.vel, 0.5), size: 0.08, t0: T, life: 3, seed: R()});
      if (R() < dt*1.2) explosion(randomHullPoint(s), 0.05, s.vel, {sparks: 8, smoke: 1, flash: 1.2});
      continue;
    }
    if (c.fighter && s.hold) { s.pos = V.add(s.pos, V.mul(BATTLE.argo.vel, dt)); continue; }
    if (c.fighter) {
      // pursuit with lead; break off when too close; avoid capital hulls
      if (!s.target || !s.target.alive || s.target.dying >= 0 || R() < dt*0.08) s.target = nearestEnemy(s, o => CLS[o.cls].fighter) || nearestEnemy(s);
      let desired = s.fwd;
      if (s.target) {
        const tp = V.add(s.target.pos, V.mul(s.target.vel, 0.6)), to = V.sub(tp, s.pos), d = V.len(to);
        if (s.breakT > 0) { s.breakT -= dt; desired = s.breakDir; }
        else if (d < 0.18) { s.breakT = 1.2 + R(); s.breakDir = V.norm(V.add(V.mul(s.fwd, 0.4), [R() - 0.5, R() - 0.3, R() - 0.5])); }
        else desired = to;
        if (d < 2.5 && V.dot(s.fwd, V.norm(to)) > 0.985 && BATTLE.weapons) {
          s.cool -= dt;
          if (s.cool <= 0) { s.cool = 1/c.gunRate*(0.7 + R()*0.6); for (const sx of [-1, 1]) spawnBolt(worldPoint(s, [sx*0.007, 0, 0.009]), V.add(s.fwd, [(R() - 0.5)*0.01, (R() - 0.5)*0.01, 0]), s.team, 4.5, c.gunDmg, s); }
        }
      }
      for (const o of BATTLE.ships) if (o.alive && !CLS[o.cls].fighter && o.vis) {
        const away = V.sub(s.pos, o.pos), d = V.len(away), rr = CLS[o.cls].ext[2]*1.1 + 0.05;
        if (d < rr) desired = V.add(V.norm(desired), V.mul(V.norm(away), 2.5*(1 - d/rr)));
      }
      // stay in the arena
      if (V.len(s.pos) > 30) desired = V.add(V.norm(desired), V.mul(V.norm(s.pos), -1.5));
      steer(s, desired, dt);
      s.vel = V.mul(s.fwd, c.spd*(s.boost || 1));
      s.pos = V.add(s.pos, V.mul(s.vel, dt));
      continue;
    }
    // capitals: hold heading (the script moves them), turrets fire at whatever is in range
    if (s.goal) steer(s, V.sub(s.goal, s.pos), dt);
    s.vel = V.mul(s.fwd, c.spd*(s.throttle ?? 1));
    s.pos = V.add(s.pos, V.mul(s.vel, dt));
    if (!BATTLE.weapons) continue;
    s.cool -= dt;
    if (s.cool <= 0) {
      s.cool = 1/(c.gunRate*c.guns)*(0.6 + R()*0.8);
      const tgt = (s.focus && s.focus.alive && s.focus.dying < 0 && R() < 0.7) ? s.focus : (R() < 0.3 ? nearestEnemy(s, o => CLS[o.cls].fighter) : nearestEnemy(s, o => !CLS[o.cls].fighter)) || nearestEnemy(s);
      if (tgt) {
        const from = randomHullPoint(s, true), to = V.sub(tgt.pos, from), d = V.len(to), spd = 7;
        const aim = V.add(tgt.pos, V.mul(tgt.vel, d/spd));
        const sp = CLS[tgt.cls].fighter ? 0.05 : 0.012;
        spawnBolt(from, V.add(V.norm(V.sub(aim, from)), [(R() - 0.5)*sp, (R() - 0.5)*sp, (R() - 0.5)*sp]), s.team, spd, c.gunDmg, s, true);
      }
    }
    if (c.missiles && R() < dt*0.25) {
      const tgt = nearestEnemy(s, o => !CLS[o.cls].fighter);
      if (tgt) BATTLE.missiles.push({p: randomHullPoint(s, true), v: V.add(s.vel, V.mul(s.fwd, 0.3)), target: tgt, team: s.team, life: 14, trail: 0});
    }
  }
}
function stepProjectiles(dt){
  const T = BATTLE.t, keep = [];
  for (const b of BATTLE.bolts) {
    const a = b.p, e = V.add(a, V.mul(b.v, dt));
    let hit = null, ht = 2;
    for (const s of BATTLE.ships) if (s.alive && s.vis && s.team !== b.team && !s.wreck) { const t = hitShip(s, a, e); if (t >= 0 && t < ht) { ht = t; hit = s; } }
    if (hit) { const at = V.add(a, V.mul(V.sub(e, a), ht)); damageShip(hit, b.dmg, at); continue; }
    b.p = e; b.life -= dt;
    if (b.life > 0) keep.push(b);
  }
  BATTLE.bolts = keep;
  const km = [];
  for (const m of BATTLE.missiles) {
    m.life -= dt;
    if (m.target && m.target.alive && m.target.vis) {
      const to = V.sub(m.target.pos, m.p), d = V.norm(to);
      m.v = V.add(V.mul(m.v, 1 - dt*1.2), V.mul(d, dt*2.2));
      if (V.len(m.v) > 1.6) m.v = V.mul(V.norm(m.v), 1.6);
    }
    const e = V.add(m.p, V.mul(m.v, dt));
    let done = m.life <= 0;
    if (m.target && m.target.alive && hitShip(m.target, m.p, e) >= 0) { damageShip(m.target, 30, e); explosion(e, 0.12, m.target.vel, {sparks: 30, smoke: 2}); done = true; }
    m.p = e; m.trail += dt;
    if (m.trail > 0.05) { m.trail = 0; BATTLE.fx.push({kind: 'smoke', p: m.p.slice(), v: [0, 0, 0], size: 0.025, t0: T, life: 1.6, seed: BATTLE.rnd(), col: [0.4, 0.4, 0.45]}); }
    if (!done) km.push(m);
  }
  BATTLE.missiles = km;
}
function stepFx(){
  const T = BATTLE.t;
  BATTLE.fx = BATTLE.fx.filter(f => T - f.t0 < f.life);
}
// emit this frame's draw lists
function buildFx(){
  FX.beams.length = 0; FX.sprites.length = 0;
  const T = BATTLE.t;
  for (const b of BATTLE.bolts) {
    const col = V.mul(TEAM_COL[b.team], b.heavy ? 7 : 4), len = b.heavy ? 0.12 : 0.05;
    fxBeam(V.sub(b.p, V.mul(V.norm(b.v), len)), b.p, b.heavy ? 0.0035 : 0.0012, col, 1, 1);
  }
  for (const m of BATTLE.missiles) { fxSprite(m.p, 0.02, [3, 2.2, 1.6], 1, 0, 0); fxSprite(m.p, 0.05, [1.2, 0.5, 0.2], 0, 0, 0); }
  for (const L of BATTLE.lances) {
    const a = T - L.t0; if (a < 0 || a > L.dur) continue;
    const k = Math.min(1, a/0.15)*Math.min(1, (L.dur - a)/0.5), from = worldPoint(L.ship, L.local), to = L.to();
    const flick = 0.85 + 0.15*Math.sin(T*90) + 0.1*Math.sin(T*37);
    fxBeam(from, to, 0.028*k, V.mul(TEAM_COL[L.ship.team], 14*flick*k), 1, 1);
    fxBeam(from, to, 0.09*k, V.mul(TEAM_COL[L.ship.team], 2.5*k), 0.2, 1);
    fxSprite(from, 0.25*k, V.mul(TEAM_COL[L.ship.team], 8*k), 1, 0, 0);
    fxSprite(to, 0.4*k, [6, 5, 4], 1, 0, 0);
  }
  for (const f of BATTLE.fx) {
    const a = (T - f.t0)/f.life, age = T - f.t0; if (a < 0) continue;
    if (f.kind === 'flash') fxSprite(f.p, f.size*(1 + a), V.mul(f.col, Math.pow(1 - a, 2)*3), 1, a, 0);
    else if (f.kind === 'fire') fxSprite(V.add(f.p, V.mul(f.v, age)), f.size + f.grow*Math.sqrt(a), [1, 1, 1], 2, a, f.seed);
    else if (f.kind === 'smoke') fxSprite(V.add(f.p, V.mul(f.v, age)), f.size*(1 + a*1.5), f.col || [0.6, 0.5, 0.45], 3, a, f.seed);
    else if (f.kind === 'spark') { const p = V.add(f.p, V.mul(f.v, age*(1 - 0.3*a))); fxBeam(V.sub(p, V.mul(f.v, 0.03)), p, f.w, V.mul([4, 2.2, 0.9], (1 - a)*(1 - a)), 1, 1); }
    else if (f.kind === 'ring') fxSprite(f.p, f.size + f.grow*Math.pow(a, 0.6), [2.6, 1.9, 1.4], 4, a, f.seed, V.mul(f.ax, 1), V.mul(f.ay, 1));
    else if (f.kind === 'shield') fxSprite(f.p, f.size, V.mul(f.col, 2.2), 5, a, 0, f.ax, f.ay);
    else if (f.kind === 'warp') { fxSprite(f.p, f.size*(1 + 3*a), V.mul([2, 2.4, 3], (1 - a)*3), 1, a, 0); fxBeam(f.from, f.p, 0.01*(1 - a), V.mul([1.5, 2, 3], (1 - a)*4), 1, 1); }
  }
  // engine plumes: soft glows at the stern of everything that flies
  for (const s of BATTLE.ships) if (s.alive && s.vis && !s.wreck && s.dying < 0) {
    const e = CLS[s.cls].ext, ec = s.team ? [1.6, 0.6, 0.18] : [0.4, 0.75, 1.6];
    fxSprite(worldPoint(s, [0, 0, -e[2]*1.02]), e[0]*(CLS[s.cls].fighter ? 1.6 : 0.9), V.mul(ec, CLS[s.cls].fighter ? 2.5 : 1.2), 0, 0, 0);
  }
  // burning wrecks glow; the faller re-enters with a plasma sheath
  if (BATTLE.faller && BATTLE.faller.reentry > 0) {
    const f = BATTLE.faller, k = f.reentry;
    fxSprite(f.pos, 0.35*k, V.mul([2.5, 1.2, 0.5], 2*k), 0, 0, 0);
    fxBeam(f.pos, V.sub(f.pos, V.mul(V.norm(f.vel), 1.5*k)), 0.06*k, V.mul([2.6, 1.1, 0.4], 3*k), 0.5, 1);
  }
}

// ------------------------------------------------------------------------------------------ the script
// Each shot: [start, end, fn(tLocal01, tAbs) -> {pos, look, roll, fov}] in arena km.
const lerpV = (a, b, t) => V.add(a, V.mul(V.sub(b, a), t));
function S_smooth(t){ return t*t*(3 - 2*t); }
function battleSetup(){
  BATTLE.t = 0; BATTLE.ships = []; BATTLE.bolts = []; BATTLE.missiles = []; BATTLE.fx = []; BATTLE.lances = []; BATTLE.events = [];
  BATTLE.rnd = mulberry(77); BATTLE.weapons = false; BATTLE.faller = null; BATTLE.timeScale = 1; BATTLE.done = false;
  for (const k in BATTLE) if (k[0] === '_') delete BATTLE[k];          // once() flags: re-arm the script
  BATTLE.hero = BATTLE.tyrant = BATTLE.victim = null;
  const Z = [0, 0, 1], R = BATTLE.rnd;
  const argo = mkShip('argo', 0, [0, 0, 0], Z, 'ARGO'); argo.armor = 0.45;
  const blue = [argo, Object.assign(mkShip('cruiser', 0, [-3.0, -0.5, 1.5], Z, 'LANCER'), {armor: 0.25}), Object.assign(mkShip('cruiser', 0, [3.2, 0.4, 0.5], Z, 'VALIANT'), {armor: 0.25}),
                mkShip('frigate', 0, [-1.6, 0.8, 2.4], Z), mkShip('frigate', 0, [1.8, -0.9, 3.0], Z), mkShip('frigate', 0, [-4.2, 0.9, -0.8], Z)];
  for (let k = 0; k < 14; k++) { const s = mkShip('hawk', 0, [(R() - 0.5)*3, 0.3 + (R() - 0.5)*0.8, 1.3 + R()*1.5], Z); s.hold = true; blue.push(s); }
  BATTLE.ships.push(...blue);
  BATTLE.argo = argo;
}
function amberArrives(){
  const T = BATTLE.t, R = BATTLE.rnd, B = [0, 0, -1];
  const add = (s, delay) => { s.vis = false; s.arrive = T + delay; BATTLE.ships.push(s); return s; };
  BATTLE.tyrant = add(mkShip('tyrant', 1, [5.5, 1.8, 24], V.norm([-0.25, -0.03, -1]), 'TYRANT'), 0.2); BATTLE.tyrant.armor = 0.35;
  BATTLE.victim = add(mkShip('cruiser', 1, [11, 0.6, 19], B, 'SCOURGE'), 0.6);
  add(Object.assign(mkShip('cruiser', 1, [-2, 2.6, 21], B, 'RAPTOR'), {armor: 0.25}), 0.9);
  add(mkShip('frigate', 1, [8.5, -1.5, 20.5], B), 1.1); add(mkShip('frigate', 1, [0.5, -1.2, 22], B), 1.3);
  for (let k = 0; k < 16; k++) add(mkShip('wasp', 1, [4 + (R() - 0.5)*8, 1 + (R() - 0.5)*2, 18 + R()*3], B), 1.4 + R()*1.2);
}
function battleScriptStep(dt){
  const T = BATTLE.t;
  const once = (k, t, fn) => { if (T >= t && !BATTLE['_' + k]) { BATTLE['_' + k] = true; fn(); } };
  once('arrive', 6, amberArrives);
  for (const s of BATTLE.ships) if (s.arrive && !s.vis && T >= s.arrive && s.alive) {
    s.vis = true; s.arrive = 0;
    const size = CLS[s.cls].fighter ? 0.05 : CLS[s.cls].ext[2]*0.6;
    BATTLE.fx.push({kind: 'warp', p: s.pos.slice(), from: V.add(s.pos, V.mul(s.fwd, -30)), size, t0: T, life: 0.9});
    BATTLE.events.push({type: 'warp', t: T, big: !CLS[s.cls].fighter});
  }
  once('launch', 10.5, () => { for (const s of BATTLE.ships) if (s.hold) { s.hold = false; s.boost = 1.3; } BATTLE.weapons = true; BATTLE.events.push({type: 'weapons', t: T}); });
  if (BATTLE._launch) for (const s of BATTLE.ships) if (s.boost > 1) s.boost = Math.max(1, s.boost - 1.2*dt);
  once('focus', 12, () => { BATTLE.tyrant.focus = BATTLE.argo; BATTLE.argo.focus = BATTLE.tyrant; });
  once('killCruiser', 36, () => { const v = BATTLE.victim; v.sh = 0; v.hp = 1; killShip(v); v.spin = [0.05, 0.1, 0.2]; });
  // the lance: charge 58-64, fire 64-67, the Tyrant dies
  if (T >= 58 && T < 64) BATTLE.argo.glow = (T - 58)/6;
  once('fire', 64, () => {
    const ty = BATTLE.tyrant;
    BATTLE.lances.push({ship: BATTLE.argo, local: [0, -0.018, 1.23], t0: T, dur: 3.0, to: () => worldPoint(ty, [0.1, 0.1, -0.2])});
    BATTLE.events.push({type: 'lance', t: T});
  });
  if (T >= 64) BATTLE.argo.glow = Math.max(0, 1 - (T - 64)/3);
  once('tyrantDies', 65.2, () => { const ty = BATTLE.tyrant; ty.sh = 0; ty.hp = 1; killShip(ty); ty.spin = [0.02, 0.04, 0.03]; });
  // the falling wreck: once it exists, it is pulled toward the planet and starts to burn
  if (BATTLE.faller) { const f = BATTLE.faller; f.vel = V.add(f.vel, V.mul([0, -1, 0.1], 0.012*dt)); f.reentry = Math.min(1, Math.max(0, (T - 80)/6)); }
  if (T > 92) BATTLE.done = true;
}
// camera shots (arena km). Tracking shots read live ship positions.
const BATTLE_SHOTS = [
  [0, 6.2, (u) => { const a = BATTLE.argo.pos; return {pos: lerpV(V.add(a, [-0.42, 0.3, -1.75]), V.add(a, [-0.25, 0.2, 0.2]), S_smooth(u)), look: V.add(a, [0, 0.05, 9]), roll: -0.05, fov: 55}; }],
  [6.2, 10.5, (u) => ({pos: lerpV([-9, 1.4, 3], [-8.2, 1.6, 5.5], u), look: [5, 1.6, 22], roll: 0.03, fov: 42})],
  [10.5, 21, (u) => { const a = BATTLE.argo.pos; return {pos: V.add(a, lerpV([0.55, 0.42, -1.5], [0.4, 0.5, -0.9], u)), look: V.add(a, [0.5, 0.4, 12]), roll: 0.04, fov: 62}; }],
  [21, 34, (u, t) => {
    let f = BATTLE.hero; if (!f || !f.alive) { f = BATTLE.hero = BATTLE.ships.find(s => s.cls === 'hawk' && s.alive); }
    if (!f) return null;
    const [r, up, fw] = shipRot(f);
    return {pos: V.add(f.pos, V.add(V.mul(fw, -0.07), V.mul(up, 0.016))), look: V.add(f.pos, V.mul(fw, 0.6)), roll: 0, fov: 72, up};
  }],
  [34, 44, (u) => { const v = BATTLE.victim.pos; return {pos: V.add(v, lerpV([-3.2, 1.0, -3.6], [-2.8, 0.9, -3.1], u)), look: v, roll: -0.04, fov: 38}; }],
  [44, 58, (u) => ({pos: lerpV([-7.5, -1.2, 6], [-6.8, -0.9, 9], u), look: lerpV([3, 1.4, 16], [4, 1.5, 18], u), roll: 0.06, fov: 48})],
  [58, 66, (u) => { const a = BATTLE.argo.pos; return {pos: V.add(a, lerpV([0.9, 0.2, 0.9], [0.7, 0.12, 1.5], S_smooth(u))), look: V.add(a, lerpV([0, -0.02, 1.2], [0.8, 0.3, 8], S_smooth(Math.max(0, (u - 0.6)/0.4)))), roll: 0.02, fov: 44}; }],
  [66, 80, (u) => { const ty = BATTLE.tyrant.pos; return {pos: lerpV([-3.5, 0.6, 10], [-3.2, 0.7, 11], u), look: ty, roll: -0.03, fov: 50}; }],
  [80, 93, (u) => { const f = BATTLE.faller; if (!f) return null; return {pos: V.add(f.pos, [-0.6, 0.35, -0.9]), look: f.pos, roll: 0.05, fov: 52}; }],
];
function battleCamera(){
  const T = BATTLE.t;
  for (const [a, b, fn] of BATTLE_SHOTS) if (T >= a && T < b) {
    const s = fn((T - a)/(b - a), T); if (!s) break;
    cam.fov = s.fov*Math.PI/180;
    arenaCamera(s.pos, s.look, s.roll);
    BATTLE.shotIdx = a;
    return;
  }
}
function battleStep(fdt){
  if (!BATTLE.on || !deep.sys || !deep.sys.bh || deep.focus === 0) return;
  if (BATTLE.events.length > 300) BATTLE.events.splice(0, BATTLE.events.length - 100);
  if (paused) { battleCamera(); return; }
  // slow motion around the big moments
  const T = BATTLE.t;
  const target = (T > 64 && T < 66.5) ? 0.4 : (T > 69.5 && T < 72.5) ? 0.3 : 1;
  BATTLE.timeScale += (target - BATTLE.timeScale)*Math.min(1, fdt*4);
  const dt = Math.min(fdt, 0.05)*BATTLE.timeScale;
  BATTLE.t += dt;
  battleScriptStep(dt);
  stepShips(dt); stepProjectiles(dt); stepFx();
  battleCamera();
}
function battleShips(){
  const out = [];
  for (const s of BATTLE.ships) if (s.alive && s.vis) out.push({cls: s.cls, pos: s.pos, rot: shipRot(s), team: s.team, damage: s.wreck ? 1 : (s.damage || Math.max(0, 1 - s.hp/s.maxHp)*0.8), glow: s.glow, size: s.size || 1});
  return out;
}
function battleStart(){
  if (!deep.sys || !deep.sys.bh) bhDevPlanet();
  arenaSetup(4.5e5, 0.2);
  battleSetup(); BATTLE.on = true; battleCamera();
}
function battleRenderFrame(now, planetImg){
  buildFx();
  return battleRender(now, planetImg, battleShips());
}
