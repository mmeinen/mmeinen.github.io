'use strict';
// ships.js — friendly formations that overtake the ship now and then, lit by the disc.
//
// PORTED from demo/: the kitbash Mesh builder, the cruiser / frigate / hawk designs, the ship shader, the depth
// priming pass and the glow-sprite shader are demo/js/ships.js + demo/js/battle.js verbatim (mirror fixes by
// diffing). Ship space: metres, +Z bow, +Y dorsal. Hulls go to a 4x MSAA HDR target whose depth is primed from
// the planet's deferred hit buffer with LOGARITHMIC depth -- a linear buffer cannot hold a 16 m fighter in front
// of a planet 700 km away -- and the pass only runs while a formation is actually on screen.

// --------------------------------------------------------------------------------- mesh builder
class Mesh {
  constructor(){ this.p = []; this.n = []; this.a = []; this.i = []; this.m = [1,0,0, 0,1,0, 0,0,1]; this.t = [0,0,0]; this.stack = []; }
  push(){ this.stack.push([this.m.slice(), this.t.slice()]); return this; }
  pop(){ [this.m, this.t] = this.stack.pop(); return this; }
  // compose a local frame: translate by t (in current frame), then rotate by (yaw about Y, pitch about X, roll about Z)
  xf(t, yaw = 0, pitch = 0, roll = 0){
    this.t = V.add(this.t, M3.vec(this.m, t));
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const Ry = [cy,0,sy, 0,1,0, -sy,0,cy], Rx = [1,0,0, 0,cp,-sp, 0,sp,cp], Rz = [cr,-sr,0, sr,cr,0, 0,0,1];
    this.m = M3.mul(this.m, M3.mul(Ry, M3.mul(Rx, Rz)));
    return this;
  }
  P(v){ return V.add(M3.vec(this.m, v), this.t); }
  N(v){ return V.norm(M3.vec(this.m, v)); }
  vert(p, n, mat, ao, seed){ this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.a.push(mat, ao, seed, 0); return this.p.length/3 - 1; }
  // quad in LOCAL coords. `ref` = a local point inside the solid: the normal is flipped to face away from
  // it, so winding and mirrored (left-handed) frames cannot turn a face inside out.
  quad(a, b, c, d, mat, ao = 1, seed = 0, ref){
    const A = this.P(a), B = this.P(b), C = this.P(c), D = this.P(d);
    let n = V.norm(V.add(V.cross(V.sub(B, A), V.sub(C, A)), V.cross(V.sub(C, A), V.sub(D, A))));
    if (ref) { const R = this.P(ref), fc = V.mul(V.add(V.add(A, B), V.add(C, D)), 0.25); if (V.dot(n, V.sub(fc, R)) < 0) n = V.mul(n, -1); }
    const k = this.vert(A, n, mat, ao, seed); this.vert(B, n, mat, ao, seed); this.vert(C, n, mat, ao, seed); this.vert(D, n, mat, ao, seed);
    this.i.push(k, k+1, k+2, k, k+2, k+3);
    return this;
  }
  tri(a, b, c, mat, ao = 1, seed = 0, ref){
    const A = this.P(a), B = this.P(b), C = this.P(c);
    let n = V.norm(V.cross(V.sub(B, A), V.sub(C, A)));
    if (ref) { const R = this.P(ref), fc = V.mul(V.add(V.add(A, B), C), 1/3); if (V.dot(n, V.sub(fc, R)) < 0) n = V.mul(n, -1); }
    const k = this.vert(A, n, mat, ao, seed); this.vert(B, n, mat, ao, seed); this.vert(C, n, mat, ao, seed);
    this.i.push(k, k+1, k+2);
    return this;
  }
  // hexahedron from 8 local corners c[x][y][z] (x,y,z in {0,1}); faces[] may skip sides (e.g. buried ones)
  hex(c, mat, ao = 1, seed = 0, skip = ''){
    const C = (x, y, z) => c[x*4 + y*2 + z];
    const ref = V.mul(c.reduce((acc, v) => V.add(acc, v), [0, 0, 0]), 1/8);
    if (!skip.includes('l')) this.quad(C(0,0,0), C(0,0,1), C(0,1,1), C(0,1,0), mat, ao, seed, ref);
    if (!skip.includes('r')) this.quad(C(1,0,0), C(1,1,0), C(1,1,1), C(1,0,1), mat, ao, seed, ref);
    if (!skip.includes('d')) this.quad(C(0,0,0), C(1,0,0), C(1,0,1), C(0,0,1), mat, ao, seed, ref);
    if (!skip.includes('u')) this.quad(C(0,1,0), C(0,1,1), C(1,1,1), C(1,1,0), mat, ao, seed, ref);
    if (!skip.includes('b')) this.quad(C(0,0,0), C(0,1,0), C(1,1,0), C(1,0,0), mat, ao, seed, ref);
    if (!skip.includes('f')) this.quad(C(0,0,1), C(1,0,1), C(1,1,1), C(0,1,1), mat, ao, seed, ref);
    return this;
  }
  // box centred at cen with half sizes h (local)
  box(cen, h, mat, ao = 1, seed = 0, skip = ''){
    const c = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++)
      c.push([cen[0] + (x ? h[0] : -h[0]), cen[1] + (y ? h[1] : -h[1]), cen[2] + (z ? h[2] : -h[2])]);
    return this.hex(c, mat, ao, seed, skip);
  }
  // tapered segment along Z from z0 (width w0, height h0, centre y0) to z1 (w1, h1, y1); keel flat or not
  seg(z0, w0, h0, y0, z1, w1, h1, y1, mat, ao = 1, seed = 0, skip = ''){
    const c = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      const w = z ? w1 : w0, h = z ? h1 : h0, yc = z ? y1 : y0;
      c.push([(x ? 1 : -1)*w/2, yc + (y ? 1 : -1)*h/2, z ? z1 : z0]);
    }
    return this.hex(c, mat, ao, seed, skip);
  }
  // cylinder/frustum from a to b (local), radii r0 -> r1
  cyl(a, b, r0, r1, n, mat, ao = 1, seed = 0, caps = true, capMat){
    const ax = V.norm(V.sub(b, a)), t0 = V.norm(Math.abs(ax[1]) < 0.9 ? V.cross(ax, [0,1,0]) : V.cross(ax, [1,0,0])), t1 = V.cross(ax, t0);
    const ring = (c, r, k) => { const th = k/n*6.2831853; return V.add(c, V.add(V.mul(t0, Math.cos(th)*r), V.mul(t1, Math.sin(th)*r))); };
    const mid = V.mul(V.add(a, b), 0.5);
    for (let k = 0; k < n; k++) this.quad(ring(a, r0, k), ring(a, r0, k+1), ring(b, r1, k+1), ring(b, r1, k), mat, ao, seed, mid);
    if (caps) for (let k = 0; k < n; k++) {
      this.tri(a, ring(a, r0, k+1), ring(a, r0, k), capMat ?? mat, ao, seed, mid);
      this.tri(b, ring(b, r1, k), ring(b, r1, k+1), capMat ?? mat, ao, seed, mid);
    }
    return this;
  }
  // scatter greebles on a local rectangle: origin o, unit axes u & v spanning su x sv, outward normal nn
  greeble(rnd, o, u, v, su, sv, nn, count, size, mats, aoLow = 0.55){
    for (let k = 0; k < count; k++) {
      const x = rnd()*su, y = rnd()*sv, s = size*(0.25 + rnd()*rnd()*1.6), hgt = size*(0.1 + rnd()*0.6);
      const p = V.add(o, V.add(V.mul(u, x), V.mul(v, y)));
      const hu = s*(0.4 + rnd()), hv = s*(0.4 + rnd());
      const c = [];
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let e = 0; e < 2; e++)
        c.push(V.add(p, V.add(V.add(V.mul(u, (a ? 1 : -1)*hu/2), V.mul(nn, e ? hgt : -0.2*hgt)), V.mul(v, (b ? 1 : -1)*hv/2))));
      // c indexing must be [x][y][z] = [u][n][v]
      const cc = []; for (let a = 0; a < 2; a++) for (let e = 0; e < 2; e++) for (let b = 0; b < 2; b++) cc.push(c[a*4 + b*2 + e]);
      this.hex(cc, mats[Math.floor(rnd()*mats.length)], aoLow + (1 - aoLow)*rnd(), Math.floor(rnd()*255), 'd');
    }
    return this;
  }
  build(){
    const n = this.p.length/3;
    const vb = new Float32Array(n*10);
    for (let k = 0; k < n; k++) {
      vb.set([this.p[k*3], this.p[k*3+1], this.p[k*3+2], this.n[k*3], this.n[k*3+1], this.n[k*3+2], this.a[k*4], this.a[k*4+1], this.a[k*4+2], this.a[k*4+3]], k*10);
    }
    let r = 0; for (let k = 0; k < n; k++) r = Math.max(r, Math.hypot(this.p[k*3], this.p[k*3+1], this.p[k*3+2]));
    return {vb, ib: n > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i), radius: r, tris: this.i.length/3};
  }
}

// --------------------------------------------------------------------------------- designs
// Each design returns a Mesh in metres; `ext` = rough half extents used for hit tests and shield shells.
const SHIP_CLASSES = {};

function turret(m, rnd, p, yaw, s, twin){
  m.push().xf(p, yaw);
  m.cyl([0, 0, 0], [0, 0.45*s, 0], 0.9*s, 0.75*s, 10, 1, 0.8, 0);
  m.box([0, 0.75*s, 0.1*s], [0.7*s, 0.35*s, 0.9*s], 0, 0.9, 7);
  const bx = twin ? [-0.28*s, 0.28*s] : [0];
  for (const x of bx) m.cyl([x, 0.8*s, 0.9*s], [x, 0.8*s, 3.2*s], 0.12*s, 0.1*s, 6, 1, 0.9, 0, true, 6);
  m.pop();
}
function engineBell(m, z, x, y, r, len, mat = 1){
  m.cyl([x, y, z], [x, y, z - len], r*0.82, r, 16, mat, 0.9, 0, false);
  m.cyl([x, y, z - len*0.98], [x, y, z - len*0.99], r*0.97, r*0.97, 16, 4, 1, 0, true, 4);   // glowing throat
}
// a flat panel on the hull side x = s*x (s = +1 starboard, -1 port), facing outward
function sidePanel(m, s, x, y0, y1, z0, z1, mat){
  m.quad([s*x, y0, z0], [s*x, y0, z1], [s*x, y1, z1], [s*x, y1, z0], mat, 1, 0, [0, (y0 + y1)/2, (z0 + z1)/2]);
}
function windowsStrip(m, z0, z1, x, y, h, side){ sidePanel(m, side, x, y - h/2, y + h/2, z0, z1, 3); }


// Cruiser: a blocky gun platform (both fleets, different tint), 760 m.
SHIP_CLASSES.cruiser = () => {
  const m = new Mesh(), rnd = mulberry(3003);
  m.seg(-380, 150, 110, 0, 120, 170, 120, 0, 0, 1, 41);
  m.seg(120, 170, 120, 0, 380, 60, 50, -10, 0, 1, 42, 'b');
  m.seg(-360, 70, 40, -80, 250, 40, 30, -60, 1, 0.85, 43);
  m.box([0, 90, -240], [45, 30, 70], 0, 1, 44); m.box([0, 125, -250], [30, 12, 40], 7, 1, 45);
  m.quad([-28, 122, -209], [28, 122, -209], [28, 132, -209], [-28, 132, -209], 3, 1, 0, [0, 125, -250]);
  for (const [x, y] of [[-45, 25], [45, 25], [0, -25]]) engineBell(m, -380, x, y, 30, 40);
  for (let k = 0; k < 4; k++) { turret(m, rnd, [-48, 62, -150 + k*95], 0, 9, true); turret(m, rnd, [48, 62, -150 + k*95], 0, 9, true); }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) windowsStrip(m, -300 + k*150, -220 + k*150, 76 + (k > 1 ? 4 : 0), 20, 3, s);
  m.greeble(rnd, [-75, 60, -370], [1, 0, 0], [0, 0, 1], 150, 480, [0, 1, 0], 120, 7, [0, 1, 7, 2]);
  m.greeble(rnd, [-80, -60, -370], [1, 0, 0], [0, 0, 1], 160, 500, [0, -1, 0], 80, 7, [0, 1, 7]);
  return m;
};

// Frigate / missile boat, 240 m.
SHIP_CLASSES.frigate = () => {
  const m = new Mesh(), rnd = mulberry(4004);
  m.seg(-120, 50, 36, 0, 70, 44, 30, 0, 0, 1, 51);
  m.seg(70, 44, 30, 0, 120, 14, 12, -4, 0, 1, 52, 'b');
  for (const s of [-1, 1]) m.box([s*42, 0, -30], [10, 18, 60], 1, 0.85, 53);                 // missile pods
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) m.box([s*52.5, -9 + (k%2)*18, -70 + Math.floor(k/2)*40], [0.6, 6, 12], 6, 1, 0);
  m.box([0, 26, -60], [14, 9, 22], 0, 1, 54);
  engineBell(m, -120, -14, 0, 11, 16); engineBell(m, -120, 14, 0, 11, 16);
  turret(m, rnd, [0, 18, 20], 0, 5, true);
  m.greeble(rnd, [-22, 18.2, -110], [1, 0, 0], [0, 0, 1], 44, 170, [0, 1, 0], 40, 3, [0, 1, 7]);
  return m;
};

// Coalition fighter "HAWK": 16 m swept wings, twin engines.
SHIP_CLASSES.hawk = () => {
  const m = new Mesh();
  m.seg(-7, 1.8, 1.4, 0, 5, 1.2, 1.1, 0.1, 0, 1, 61);
  m.seg(5, 1.2, 1.1, 0.1, 9, 0.2, 0.3, 0, 0, 1, 62, 'b');
  m.box([0, 0.9, 2.5], [0.55, 0.35, 1.3], 3, 1, 0);                                  // canopy
  for (const s of [-1, 1]) {
    m.hex([[s*0.8, -0.12, -5], [s*0.8, -0.12, 2], [s*0.8, 0.12, -5], [s*0.8, 0.12, 2], [s*8, -0.08, -6.5], [s*8, -0.08, -4.5], [s*8, 0.08, -6.5], [s*8, 0.08, -4.5]]
          .map((v, i, a) => a[s < 0 ? [4,5,6,7,0,1,2,3][i] : i]), 2, 1, 63);
    m.cyl([s*1.5, 0, -3], [s*1.5, 0, -7.4], 0.55, 0.5, 8, 1, 1, 0);
    m.cyl([s*1.5, 0, -7.3], [s*1.5, 0, -7.35], 0.45, 0.45, 8, 4, 1, 0, true, 4);
    m.cyl([s*7.8, 0, -6.2], [s*7.8, 0, -1.5], 0.12, 0.08, 5, 1, 1, 0, true, 6);    // wingtip gun
  }
  return m;
};


// --------------------------------------------------------------------------------- renderer
const LOGZ_NEAR = 1e-4, LOGZ_K = 1/Math.log2(1e8/LOGZ_NEAR + 1);      // km; depth = log2(d/near + 1)*K
const LOGZ_GLSL = `const float LZN = ${LOGZ_NEAR.toExponential()}; const float LZK = ${LOGZ_K.toFixed(8)};
float logDepth(float dKm){ return log2(dKm/LZN + 1.0)*LZK; }`;

const VS_SHIP = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in vec4 a_att;
layout(location=3) in vec4 i0; layout(location=4) in vec4 i1; layout(location=5) in vec4 i2; layout(location=6) in vec4 i3;
uniform mat4 u_vp;                        // projection * camera rotation (positions are camera-relative, km)
out vec3 vW, vN, vL, vNL; out vec4 vA; flat out vec4 vI;
void main(){
  mat3 R = mat3(i1.xyz, i2.xyz, i3.xyz);  // ship local -> world axes
  vec3 w = R*(a_pos*i0.w) + i0.xyz;
  vW = w; vN = R*a_nrm; vL = a_pos; vNL = a_nrm; vA = a_att; vI = vec4(i1.w, i2.w, i3.w, i0.w);
  gl_Position = u_vp*vec4(w, 1.0);
}`;

const FS_SHIP = `#version 300 es
precision highp float;
in vec3 vW, vN, vL, vNL; in vec4 vA; flat in vec4 vI;
uniform vec3 u_L, u_Lcol, u_amb, u_pC, u_pCol;       // key light (to the disc), planet centre (km, cam-rel)
uniform float u_pR, u_time;
uniform vec3 u_hull[2], u_dark[2], u_trim[2], u_eng[2], u_win[2];
${LOGZ_GLSL}
out vec4 o;
float h21(vec2 p){ uvec2 q = uvec2(ivec2(floor(p)))*uvec2(0x8da6b343u, 0xd8163841u); uint h = q.x ^ q.y;
  h ^= h >> 16u; h *= 0x85ebca6bu; h ^= h >> 13u; h *= 0xc2b2ae35u; h ^= h >> 16u; return float(h >> 8u)/16777215.0; }
void main(){
  int mat = int(vA.x + 0.5); float ao = vA.y, seed = vA.z;
  float damage = vI.x, glow = vI.z; int t = int(vI.y + 0.5);
  vec3 N = normalize(vN), Vd = normalize(-vW);
  if (dot(N, Vd) < 0.0) N = -N;
  // panels: planar projection on the dominant local axis, brick-offset rows, AA seams from the footprint
  vec3 an = abs(vNL);
  vec2 uv = an.x > an.y && an.x > an.z ? vL.zy : (an.y > an.z ? vL.xz : vL.xy);
  float ps = mat == 1 ? 7.0 : 11.0;
  vec2 g = uv/vec2(ps*1.7, ps); g.x += 0.5*floor(g.y);
  vec2 id = floor(g), f = fract(g), fw = max(fwidth(g), 1e-4);
  float hp = h21(id + seed*17.0);
  vec2 sd = min(f, 1.0 - f)/fw;
  float seam = 1.0 - smoothstep(0.6, 1.6, min(sd.x, sd.y));
  float detail = clamp(1.0 - max(fw.x, fw.y)*1.5, 0.0, 1.0);          // panels fade to the average when sub-pixel
  vec3 alb; vec3 emit = vec3(0.0); float rough = 0.55, metal = 0.2;
  if (mat == 0) alb = u_hull[t]*mix(1.0, 0.86 + 0.28*hp, detail);
  else if (mat == 1) { alb = u_dark[t]*mix(1.0, 0.8 + 0.4*hp, detail); rough = 0.38; metal = 0.6; }
  else if (mat == 2) alb = u_trim[t];
  else if (mat == 7) { alb = u_dark[t]*1.6; rough = 0.45; metal = 0.5; }
  else alb = vec3(0.03);
  alb *= 1.0 - 0.55*seam*detail;
  // scattered lit portholes: thousands of rooms give the eye the scale
  if (mat == 0 || mat == 7) {
    vec2 wg = uv/vec2(3.2, 2.6); vec2 wid = floor(wg), wf = fract(wg);
    float on = step(0.93, h21(wid + seed*3.1 + 5.0));
    float px = smoothstep(0.5, 0.2, max(abs(wf.x - 0.5), abs(wf.y - 0.5)*1.4));
    emit += u_win[t]*on*px*0.9*clamp(1.0 - max(fwidth(wg.x), fwidth(wg.y))*0.7, 0.15, 1.0);
  }
  if (mat == 3) {                                                       // window strips
    vec2 wg = vec2((an.x > 0.5 ? vL.z : vL.x)/2.2, vL.y/1.8);
    float on = step(0.25, h21(floor(wg) + 9.0));
    emit = u_win[t]*on*(0.6 + 0.8*h21(floor(wg) + 2.0))*1.4;
  }
  if (mat == 4) emit = u_eng[t]*(0.9 + 2.0*glow)*(0.55 + 0.45*smoothstep(1.0, 0.2, length(fract(vL.xy/8.0) - 0.5)*2.0));   // engine throats
  if (mat == 5) { alb = vec3(0.02); emit = u_win[t]*step(0.7, fract(vL.y/7.0))*0.6; }
  if (mat == 6) emit = u_eng[t]*(0.15 + 9.0*glow*glow);                // weapon emitters charge up
  // burning damage: hot cracks that flicker
  if (damage > 0.0 && mat < 3) {
    float n = h21(floor(vL.xz/9.0) + seed)*h21(floor(vL.zy/13.0) + 3.0);
    float burn = smoothstep(1.0 - damage*0.45, 1.0, n);
    emit += vec3(1.0, 0.35, 0.08)*burn*(1.5 + sin(u_time*9.0 + n*40.0))*1.4;
    alb *= 1.0 - 0.7*smoothstep(1.0 - damage*0.8, 1.0, n);
  }
  // lighting: the disc (key), the planet below (bounce), faint sky; the planet's shadow is analytic
  vec3 oc = vW - u_pC; float bq = dot(oc, u_L);
  float sh = 1.0;
  if (bq < 0.0) { float dmin = sqrt(max(dot(oc, oc) - bq*bq, 0.0)); sh = smoothstep(u_pR*0.992, u_pR*1.012, dmin); }
  float NL = max(dot(N, u_L), 0.0);
  vec3 toP = normalize(u_pC - vW);
  float lit = clamp(0.5 - 0.5*dot(toP, u_L), 0.0, 1.0);
  vec3 H = normalize(u_L + Vd);
  float sp = pow(max(dot(N, H), 0.0), mix(160.0, 22.0, rough))*mix(0.04, 0.5, metal)*(1.0 - rough*0.6);
  float fres = pow(1.0 - max(dot(N, Vd), 0.0), 5.0);
  vec3 col = alb*(u_Lcol*NL*sh + u_pCol*max(dot(N, toP), 0.0)*lit + u_amb)*ao
           + u_Lcol*sp*sh*4.0 + u_Lcol*fres*0.05*sh + emit;
  o = vec4(col, 1.0);
  gl_FragDepth = logDepth(length(vW));
}`;

// Copies the planet image into the MSAA target and primes its depth from the deferred hit buffer.
const FS_BATTLE_BG = `#version 300 es
precision highp float;
uniform sampler2D u_img; uniform highp sampler2D u_gb;
${LOGZ_GLSL}
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  o = vec4(texelFetch(u_img, p, 0).rgb, 0.0);
  vec4 G = texelFetch(u_gb, p, 0);
  gl_FragDepth = G.x > -0.5 ? logDepth(G.y) : 1.0;
}`;

const FLEET_LOOK = {
  hull: [[0.42, 0.44, 0.47], [0.17, 0.16, 0.155]], dark: [[0.11, 0.12, 0.14], [0.06, 0.058, 0.056]],
  trim: [[0.12, 0.3, 0.72], [0.75, 0.3, 0.07]], eng: [[0.45, 0.75, 1.6], [1.7, 0.62, 0.18]], win: [[1.0, 0.84, 0.62], [1.0, 0.55, 0.22]],
};

const SHIPGL = {};           // class -> {vao, n, type, instBuf, inst, radius}
function shipClassGL(name){
  if (SHIPGL[name]) return SHIPGL[name];
  const b = SHIP_CLASSES[name]().build();
  const va = gl.createVertexArray(); gl.bindVertexArray(va);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, b.vb, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.ib, gl.STATIC_DRAW);
  const instBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, 64*256, gl.DYNAMIC_DRAW);
  for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(3 + k); gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, 64, k*16); gl.vertexAttribDivisor(3 + k, 1); }
  gl.bindVertexArray(vao);
  return SHIPGL[name] = {vao: va, n: b.ib.length, type: b.ib instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    instBuf, inst: new Float32Array(16*256), radius: b.radius, tris: b.tris};
}


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

// ------------------------------------------------------------------------------------------ flybys (landing page)
// Every minute or so a friendly formation overtakes the ship and heads for the hole: the MSAA ship pass runs only
// while one is on screen. Positions are world metres (float64); the GPU gets camera-relative km, like the planet.
const FLY_CLS = {   // half extents (km) for plumes and the HUD contact, as demo/js/battle.js CLS
  frigate: {ext: [0.05, 0.03, 0.12], name: 'FRIGATE'}, cruiser: {ext: [0.09, 0.07, 0.38], name: 'CRUISER'}, hawk: {ext: [0.008, 0.003, 0.008], name: 'HAWK WING', fighter: true},
};
const FLY = {ships: [], next: 24, n: 0, t: 0, vao: null, buf: null, data: new Float32Array(16*64), contact: null};

function shipPrograms(){
  program('ship', VS_SHIP, FS_SHIP);
  program('shipBg', VS_FULL, FS_BATTLE_BG);
  program('spr', VS_SPR, FS_SPR);
}
function flyPerspective(fovy, asp, n, f){
  const t = 1/Math.tan(fovy/2), nf = 1/(n - f);
  return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]);
}
function flyMul(a, b){
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  return o;
}

let BT = null;               // MSAA colour + depth at the render scale, and the resolve texture
function ensureShipTargets(w, h){
  if (BT && BT.w === w && BT.h === h) return;
  if (BT) { gl.deleteFramebuffer(BT.msFb); gl.deleteFramebuffer(BT.resFb); gl.deleteRenderbuffer(BT.col); gl.deleteRenderbuffer(BT.dep); gl.deleteTexture(BT.tex); }
  const fs = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
  const S = Math.min(4, fs && fs.length ? fs[0] : 0), b = {w, h};
  b.col = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, b.col); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, S, gl.RGBA16F, w, h);
  b.dep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, b.dep); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, S, gl.DEPTH_COMPONENT24, w, h);
  b.msFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, b.msFb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, b.col);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, b.dep);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  b.tex = tex(w, h, gl.RGBA16F, gl.LINEAR); b.resFb = fbo([b.tex]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  BT = ok ? b : null;
  if (!ok) {                 // no multisampled float targets: no flybys, everything else unaffected
    gl.deleteFramebuffer(b.msFb); gl.deleteFramebuffer(b.resFb); gl.deleteRenderbuffer(b.col); gl.deleteRenderbuffer(b.dep); gl.deleteTexture(b.tex);
    FLY.off = true; FLY.ships = []; FLY.contact = null;
  }
}

// A formation: a lead and its wingmen overtaking on one side, flying on toward the hole. The frame is the ship's
// orbital frame at spawn (toward-the-hole horizontal, local up, and their cross), fixed in space for the pass --
// both they and we are in orbit, so for the ~40 s it lasts a straight line is exact enough.
function flySpawn(){
  const h = ORB.hud, up = h.up, fwd = V.norm(V.sub(h.dirHole, V.mul(up, V.dot(h.dirHole, up)))), right = V.cross(fwd, up);
  const side = FLY.n++ % 2 ? 1 : -1, kind = FLY.n % 3 === 0 ? "cruiser" : "frigate";
  const lead = {cls: kind, off: [side*0.5, -0.12, -0.9], v: [-side*0.02, -0.004, 0.2]};   // km, km/s in (right, up, fwd)
  const wing = [[side*0.16, 0.05, -0.06], [side*0.24, -0.03, -0.12], [side*-0.12, 0.08, -0.16], [side*0.34, 0.02, -0.2]];
  const list = [lead].concat(wing.slice(0, kind === 'cruiser' ? 2 : 4).map(o => ({cls: 'hawk', off: V.add(lead.off, o), v: lead.v})));
  FLY.ships = list.map(s => ({cls: s.cls, v: s.v, p0: s.off, fwd, up, right, t0: FLY.t}));
  return {side, kind};
}
// world position (m) of ship s now. The formation shares our orbit, so it is placed relative to where WE are now:
// in the hole's frame MILLER moves at 0.15 c, and anything fixed there would be left behind within a frame.
function flyPos(s){
  const t = FLY.t - s.t0, l = V.add(s.p0, V.mul(s.v, t));
  return V.add(ORB.view.eye, V.mul(V.add(V.add(V.mul(s.right, l[0]), V.mul(s.up, l[1])), V.mul(s.fwd, l[2])), 1000));
}
function flyStep(dt){
  if (FLY.off) return null;
  FLY.t += dt;
  let ev = null;
  if (!FLY.ships.length && FLY.t > FLY.next) { ev = flySpawn(); }
  if (FLY.ships.length) {
    const t = FLY.t - FLY.ships[0].t0;
    if (t > 42) { FLY.ships = []; FLY.next = FLY.t + 50 + Math.random()*30; FLY.contact = null; }
    else {
      const p = flyPos(FLY.ships[0]), rel = V.sub(p, ORB.view.eye), d = V.len(rel);
      FLY.contact = {dir: V.mul(rel, 1/d), range: d, name: FLY_CLS[FLY.ships[0].cls].name, n: FLY.ships.length};
    }
  }
  return ev;
}
function flyVisible(){
  if (!FLY.ships.length || FLY.off) return false;
  const b = ORB.view.b, th = Math.tan(ORB.view.fov/2)*1.3, asp = ORB.W/ORB.H;
  return FLY.ships.some(s => { const r = V.sub(flyPos(s), ORB.view.eye), z = V.dot(r, b.f); if (z <= 0) return false;
    return Math.abs(V.dot(r, b.r)) < z*th*asp + 400 && Math.abs(V.dot(r, b.u)) < z*th + 400; });
}
// Draws the formation over the planet image (depth primed from its hit buffer). Returns the texture to post.
function flyRender(img, timeSec){
  ensureShipTargets(T.w, T.h);
  if (!BT) return img;
  const w = BT.w, h = BT.h, v = ORB.view, b = v.b, eye = v.eye;
  gl.bindFramebuffer(gl.FRAMEBUFFER, BT.msFb); gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.ALWAYS);
  const B = P.shipBg; gl.useProgram(B.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, img); gl.uniform1i(B.u.u_img, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.gb); gl.uniform1i(B.u.u_gb, 1);
  gl.activeTexture(gl.TEXTURE0);
  fullscreen();
  gl.depthFunc(gl.LESS);
  const rot = new Float32Array([b.r[0], b.u[0], -b.f[0], 0, b.r[1], b.u[1], -b.f[1], 0, b.r[2], b.u[2], -b.f[2], 0, 0, 0, 0, 1]);
  const vp = flyMul(flyPerspective(v.fov, w/h, LOGZ_NEAR, 1e8), rot);
  const Q = P.ship; gl.useProgram(Q.p);
  gl.uniformMatrix4fv(Q.u.u_vp, false, vp);
  const pl = ORB.bodies[1], pC = V.mul(V.sub(pl.pos, eye), 1e-3), toBH = V.norm(V.mul(eye, -1));
  gl.uniform3fv(Q.u.u_L, toBH); gl.uniform3fv(Q.u.u_Lcol, V.mul(LIGHT_COL, 1.25));
  gl.uniform3f(Q.u.u_amb, 0.018, 0.02, 0.028); gl.uniform3fv(Q.u.u_pC, pC); gl.uniform1f(Q.u.u_pR, pl.R*1e-3);
  gl.uniform3f(Q.u.u_pCol, 0.12, 0.2, 0.3); gl.uniform1f(Q.u.u_time, timeSec);
  for (const k of ['hull', 'dark', 'trim', 'eng', 'win']) gl.uniform3fv(Q.u['u_' + k], FLEET_LOOK[k].flat());
  const byCls = {};
  for (const s of FLY.ships) (byCls[s.cls] = byCls[s.cls] || []).push(s);
  const sprites = [];
  for (const [cls, list] of Object.entries(byCls)) {
    const G = shipClassGL(cls), d = G.inst;
    let n = 0;
    for (const s of list) {
      const dv = V.norm(s.v), f = V.norm(V.add(V.add(V.mul(s.right, dv[0]), V.mul(s.up, dv[1])), V.mul(s.fwd, dv[2])));
      const r = V.norm(V.cross(s.up, f)), u = V.cross(f, r), rel = V.mul(V.sub(flyPos(s), eye), 1e-3);
      d.set([rel[0], rel[1], rel[2], 0.001, r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, f[0], f[1], f[2], 0.15], n*16); n++;
      const e = FLY_CLS[cls].ext, fighter = !!FLY_CLS[cls].fighter, stern = V.sub(rel, V.mul(f, e[2]*1.02));
      sprites.push([stern, e[0]*(fighter ? 1.6 : 0.9), V.mul([0.4, 0.75, 1.6], fighter ? 2.5 : 1.2)]);
    }
    gl.bindVertexArray(G.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.instBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n*16);
    gl.drawElementsInstanced(gl.TRIANGLES, G.n, G.type, 0, n);
  }
  // engine plumes: soft additive glows, depth-tested, fading to zero inside their quads
  if (!FLY.vao) {
    FLY.vao = gl.createVertexArray(); gl.bindVertexArray(FLY.vao);
    FLY.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, FLY.buf); gl.bufferData(gl.ARRAY_BUFFER, FLY.data.byteLength, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 4, gl.FLOAT, false, 64, k*16); gl.vertexAttribDivisor(k, 1); }
  }
  let n = 0;
  for (const [p, size, col] of sprites) { FLY.data.set([p[0], p[1], p[2], size, col[0], col[1], col[2], 0, 0, 0, 0, 0, 0, 0, 0, 0], n*16); n++; }
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
  const S = P.spr; gl.useProgram(S.p);
  gl.uniformMatrix4fv(S.u.u_vp, false, vp); gl.uniform3fv(S.u.u_R, b.r); gl.uniform3fv(S.u.u_U, b.u); gl.uniform1f(S.u.u_time, timeSec);
  gl.bindVertexArray(FLY.vao); gl.bindBuffer(gl.ARRAY_BUFFER, FLY.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, FLY.data, 0, n*16);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  gl.bindVertexArray(vao);
  gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, BT.msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, BT.resFb);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return BT.tex;
}
