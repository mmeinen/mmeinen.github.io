'use strict';
// galaxy.js — the collision simulation: particle shaders, galaxies, scenarios, core dynamics, events, particle + composite passes.

const SLOT_GLSL = `
uniform vec4 u_slotStart;   // first row of each slot (ascending)
uniform vec4 u_slotN;       // particle count of each slot
int slotOf(float row){ return int(row>=u_slotStart.y)+int(row>=u_slotStart.z)+int(row>=u_slotStart.w); }
`;

const FS_UPDATE = `#version 300 es
precision highp float; precision highp int;
uniform highp sampler2D u_pos, u_vel;
uniform vec4 u_core[5];      // xyz, mass. [4] = user black hole
uniform float u_eps[5];
uniform vec4 u_slotActive;
uniform float u_dt, u_capture2;
${SLOT_GLSL}
layout(location=0) out vec4 oPos;
layout(location=1) out vec4 oVel;
vec3 accel(int k, vec3 p){
  vec3 d = u_core[k].xyz - p;
  float r2 = dot(d,d) + u_eps[k]*u_eps[k];
  return u_core[k].w * d * inversesqrt(r2*r2*r2);
}
void main(){
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 p = texelFetch(u_pos, ij, 0), v = texelFetch(u_vel, ij, 0);
  float row = float(ij.y);
  int s = slotOf(row);
  if (u_slotActive[s] < 0.5 || v.w < -0.5) { oPos = p; oVel = v; return; }
  vec3 a = vec3(0);
  for (int k=0; k<5; k++) a += accel(k, p.xyz);
  float local = (row - u_slotStart[s])*${TEX_W}.0 + float(ij.x);
  float u = local / u_slotN[s];
  if (u >= ${T_BULGE} && u < ${T_GAS}) {
    // gas: tidal field of the OTHER galaxies (their pull here minus their pull on our own core).
    // A starburst is triggered by the tide RISING above its recent average (p.w, ~30 Myr memory):
    // a close passage shocks the gas; a settled remnant, however lopsided, does not.
    vec3 tp = vec3(0), tc = vec3(0);
    vec3 own = u_core[s].xyz;
    for (int k=0; k<4; k++) if (k != s) { tp += accel(k, p.xyz); tc += accel(k, own); }
    float tid = length(tp - tc);
    float surge = max(0.0, tid - 1.4*p.w - 0.015);
    v.w = min(4.0, (v.w + u_dt*6.0*surge) * exp(-u_dt/2.0));
    p.w += (tid - p.w)*min(1.0, u_dt/3.0);
  }
  v.xyz += a*u_dt;
  p.xyz += v.xyz*u_dt;
  vec3 db = p.xyz - u_core[4].xyz;
  if (u_core[4].w > 0.0 && dot(db,db) < u_capture2) v.w = -1.0;    // swallowed
  oPos = p; oVel = v;
}`;

const VS_PART = `#version 300 es
precision highp float; precision highp int;
uniform highp sampler2D u_pos, u_vel;
uniform mat4 u_view, u_proj;
uniform vec4 u_slotActive, u_galLum;
uniform vec3 u_tint[4];
uniform float u_pxScale, u_flux, u_fluxDust, u_dustOn;
uniform vec3 u_holeC;           // deep zoom: particles near the chosen star fade out and
uniform float u_holeR, u_near, u_capStar, u_pointStars, u_weight;   // the local star field takes over
uniform float u_sn, u_snClock, u_gasCap;   // supernova rate (0 = off: deep zoom, cube bake), clock, gas sprite cap
${SLOT_GLSL}
out vec3 vCol; out float vDust; out float vGauss; out vec4 vSn;
void main(){
  int id = gl_VertexID;
  int row = id / ${TEX_W}; int col = id - row*${TEX_W};
  int s = slotOf(float(row));
  vec4 p = texelFetch(u_pos, ivec2(col,row), 0), v = texelFetch(u_vel, ivec2(col,row), 0);
  gl_Position = vec4(2,2,2,1); gl_PointSize = 0.0; vCol = vec3(0); vDust = 0.0; vGauss = 0.0; vSn = vec4(0.0);
  if (u_slotActive[s] < 0.5 || v.w < -0.5) return;
  vec4 vp = u_view*vec4(p.xyz,1);
  float d = -vp.z; if (d < u_near) return;
  float hw = 1.0;
  if (u_holeR > 0.0) { hw = smoothstep(u_holeR, 2.0*u_holeR, length(p.xyz - u_holeC)); if (hw <= 0.0) return; }
  float u = (float(row) - u_slotStart[s])*${TEX_W}.0/u_slotN[s] + float(col)/u_slotN[s];
  uint hs = uint(id)*747796405u + 2891336453u;
  hs = ((hs >> ((hs >> 28u) + 4u)) ^ hs)*277803737u; hs = (hs >> 22u) ^ hs;
  float seed = float(hs & 0xFFFFu)/65535.0;
  float ws, lum, dust = 0.0, cap; vec3 c;
  if (u < ${T_DISC}) {                    // disc stars: old yellow-white to blue-white
    ws = 0.016 + 0.012*seed; lum = 1.0; cap = 10.0;
    c = seed < 0.72 ? mix(vec3(1.0,0.74,0.48), vec3(1.0,0.9,0.76), seed/0.72) : mix(vec3(0.82,0.88,1.0), vec3(0.5,0.66,1.0), (seed-0.72)/0.28);
  } else if (u < ${T_BULGE}) {            // bulge: old, warm
    ws = 0.018; lum = 1.25; cap = 10.0;
    c = mix(vec3(1.0,0.6,0.32), vec3(1.0,0.8,0.55), seed);
  } else if (u < ${T_GAS}) {              // gas + dust: absorbs; glows when tidally shocked
    ws = 0.13 + 0.08*seed; cap = 20.0*u_gasCap;
    float h = max(v.w, 0.0);
    lum = 1.0;
    c = vec3(0.45,0.68,1.0)*h*2.2 + vec3(1.0,0.3,0.5)*(0.06 + 0.5*h*seed);
    dust = u_dustOn;
  } else {                                // young clusters + HII regions
    ws = 0.035; lum = 4.0; cap = 14.0;
    c = seed < 0.3 ? vec3(1.0,0.3,0.55)*1.2 : vec3(0.42,0.62,1.0);
  }
  // Supernovae: shock-heated gas (and, rarely, young clusters) flashes. Each particle rolls once per epoch
  // of the clock; a hit plays a fast-rise, exponential-decay light curve. Starbursts are where the heat is.
  float flash = 0.0;
  if (u_sn > 0.0) {
    float pSN = (u >= ${T_BULGE} && u < ${T_GAS}) ? smoothstep(0.3, 2.2, max(v.w, 0.0))*6e-4 : (u >= ${T_GAS} ? 4e-6 : 0.0);
    if (pSN > 0.0) {
      float ep = u_snClock + float((hs >> 12u) & 1023u)*(9.0/1023.0), e = floor(ep), f = ep - e;
      uint hh = (uint(id) ^ (uint(e)*2654435761u))*2246822519u; hh ^= hh >> 15u; hh *= 3266489917u; hh ^= hh >> 13u;
      if (float(hh & 0xFFFFFFu)/16777215.0 < pSN*u_sn) flash = f < 0.04 ? f/0.04 : exp(-(f - 0.04)*5.0);
    }
  }
  float ppu = u_pxScale/d;
  if (u < ${T_BULGE} || u >= ${T_GAS}) cap *= u_capStar;
  float raw = ws*ppu, size = clamp(raw, 1.0, cap);
  // a capped sprite keeps its SURFACE brightness, not its total flux: a particle is a smeared cloud of
  // ~1e5 stars, so seen up close it must stay a faint haze rather than become one blinding point
  float capK = raw > size ? (size*size)/(raw*raw) : 1.0;
  float g = smoothstep(1.0, 3.0, size);
  float norm = size*size*mix(1.0, 0.196, g);
  float f = u_flux*ppu*ppu*u_galLum[s]/norm*capK;
  vCol = c*u_tint[s]*lum*f*hw;
  vDust = min(dust*u_fluxDust*ppu*ppu*u_galLum[s]/norm*capK, 1e3)*hw;
  vGauss = g;
  gl_PointSize = size;
  if (u_pointStars > 0.0 && dust == 0.0) {
    // seen from inside a star system every particle is a STAR: a 1 px point whose total flux (1/d^2)
    // lands in one pixel, peak-capped; the band emerges from their density, never from blurry sprites
    float tot = u_flux*1e6/(d*d)*u_galLum[s]*lum*u_pointStars;   // 1/d^2 only: same at any resolution
    vCol = c*u_tint[s]*min(tot, 0.9)*hw;
    vGauss = 0.0;
    gl_PointSize = 1.0;
  }
  if (flash > 0.003) {
    vSn = vec4(vec3(0.82, 0.9, 1.0)*flash*min(ppu*ppu/1600.0, 3.0)*9.0, 1.0);
    gl_PointSize = max(gl_PointSize, clamp(10.0 + 30.0*flash*sqrt(ppu/40.0), 8.0, 64.0));
    vDust = 0.0;
  }
  vCol *= u_weight; vDust *= u_weight; vSn.rgb *= u_weight;
  gl_Position = u_proj*vp;
}`;

const FS_PART = `#version 300 es
precision highp float;
in vec3 vCol; in float vDust; in float vGauss; in vec4 vSn;
layout(location=0) out vec4 oL;
layout(location=1) out vec4 oD;
void main(){
  vec2 q = gl_PointCoord*2.0-1.0; float r2 = dot(q,q);
  if (vSn.a > 0.5) {                                // supernova: tight core + JWST-like 6+2 diffraction spikes
    float core = exp(-r2*60.0)*2.0 + exp(-r2*8.0)*0.25, sp = 0.0;
    for (int i = 0; i < 3; i++) { float a = 1.5708 + float(i)*1.0472; vec2 d = vec2(cos(a), sin(a));
      float al = abs(dot(q, d)), pe = abs(dot(q, vec2(-d.y, d.x))); sp += exp(-pe*pe*900.0)*pow(max(1.0 - al, 0.0), 2.5); }
    sp += 0.35*exp(-q.y*q.y*1500.0)*pow(max(1.0 - abs(q.x)*1.5, 0.0), 2.5);
    float win = 1.0 - smoothstep(0.85, 1.0, max(abs(q.x), abs(q.y)));
    oL = vec4(vCol*exp(-4.0*r2)*win, 0); oD = vec4(0.0, vSn.rgb*(core + sp*0.7)*win);
    return;
  }
  if (vGauss > 0.0 && r2 > 1.0) discard;
  float w = mix(1.0, exp(-4.0*r2), vGauss);
  oL = vec4(vCol*w, 0); oD = vec4(vDust*w, 0, 0, 0);
}`;

const FS_FADE = `#version 300 es
precision mediump float;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
void main(){ o0 = vec4(0); o1 = vec4(0); }`;

const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_light, u_dust;
uniform mat4 u_invVP;
uniform vec2 u_res;
uniform float u_aspect, u_dustK, u_pixAng, u_time;
uniform vec4 u_bh;           // uv, theta_E (uv-y units), strength
uniform vec4 u_cores[4];     // uv, radius (uv-y units), intensity
uniform vec4 u_qso;          // uv, intensity, core size (px): the merged black hole switched on
uniform vec3 u_coreCol[4];
out vec4 o;
float hash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x), mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x), mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 sky(vec3 d){
  vec3 c = vec3(0);
  for (int i=0; i<3; i++) {
    float sc = 70.0 + float(i)*95.0;
    vec3 p = d*sc, id = floor(p), f = fract(p) - 0.5;
    float h = hash13(id + float(i)*17.0);
    float thr = 0.965;
    if (h > thr) {
      vec3 r = hash33(id);
      vec3 off = (r - 0.5)*0.55;
      float pw = max(u_pixAng*sc*0.9, 0.02);
      float dd = length(f - off);
      float b = pow((h-thr)/(1.0-thr), 3.0) * 0.8;
      vec3 sc3 = mix(vec3(1.0,0.75,0.55), vec3(0.7,0.82,1.0), r.z);
      c += sc3 * b * exp(-dd*dd/(pw*pw)) / max(1.0, pw*pw*60.0);
    }
  }
  // faint nebular haze + a band, so the void isn't dead black
  float n = vnoise(d*2.3)*0.55 + vnoise(d*5.1)*0.3 + vnoise(d*11.0)*0.15;
  float band = exp(-pow(dot(d, normalize(vec3(0.3,1.0,-0.4)))*3.2, 2.0));
  c += (vec3(0.04,0.05,0.12)*n*n*n + vec3(0.08,0.05,0.10)*band*n*n*n*n) * 0.12;
  return c;
}
void main(){
  vec2 uv = vUv;
  float shadow = 1.0; vec3 ring = vec3(0);
  if (u_bh.w > 0.001) {
    vec2 q = (uv - u_bh.xy)*vec2(u_aspect,1.0);
    float r = length(q), tE = u_bh.z;
    float rs = tE*0.42;
    // point-lens mapping: image at theta shows the source at theta*(1 - tE^2/theta^2)
    vec2 src = q*(1.0 - u_bh.w*tE*tE/max(r*r, 1e-6));
    uv = u_bh.xy + src/vec2(u_aspect,1.0);
    shadow = mix(1.0, smoothstep(rs*0.92, rs*1.08, r), u_bh.w);
    float pr = (r - rs*1.1)/(tE*0.05);
    ring = vec3(1.0,0.75,0.45)*exp(-pr*pr)*0.9*u_bh.w + vec3(0.35,0.55,1.0)*exp(-pow((r-tE)/(tE*0.35),2.0))*0.05*u_bh.w;
  }
  vec3 L = min(texture(u_light, uv).rgb, vec3(6e4));
  float tau = min(texture(u_dust, uv).r * u_dustK, 60.0);
  vec4 w = u_invVP*vec4(uv*2.0-1.0, 1.0, 1.0);
  vec3 dir = normalize(w.xyz/w.w);
  vec3 col = (L + sky(dir)) * exp(-tau) + vec3(0.10,0.05,0.03)*(1.0-exp(-tau))*0.04;
  col += texture(u_dust, uv).gba*exp(-tau*0.25);     // supernova flashes shine through most of the dust
  for (int k=0; k<4; k++) {
    if (u_cores[k].w <= 0.0) continue;
    vec2 q = (uv - u_cores[k].xy)*vec2(u_aspect,1.0);
    float rr = dot(q,q), s2 = u_cores[k].z*u_cores[k].z;
    col += u_coreCol[k]*u_cores[k].w*(exp(-rr/s2) + 0.06*s2/(rr+s2)) * exp(-tau*0.5);
  }
  if (u_qso.z > 0.0) {
    vec2 d = (vUv - u_qso.xy)*u_res; float r2 = dot(d, d), w = u_qso.w, sp = 0.0;
    for (int i = 0; i < 3; i++) { float a = 1.5708 + float(i)*1.0472; vec2 e = vec2(cos(a), sin(a));
      float al = abs(dot(d, e)), pe = abs(dot(d, vec2(-e.y, e.x))); sp += exp(-pe*pe/1.3)*exp(-al/(w*30.0)); }
    sp += 0.35*exp(-d.y*d.y/1.1)*exp(-abs(d.x)/(w*14.0));
    col += vec3(0.78, 0.88, 1.0)*u_qso.z*(exp(-r2/(w*w)) + 0.06*exp(-sqrt(r2)/(w*7.0)) + 0.5*sp);
  }
  col = col*shadow + ring;
  o = vec4(min(col, vec3(6e4)), 1);
}`;

P.update = program(VS_FULL, FS_UPDATE);
P.part = program(VS_PART, FS_PART);
P.fade = program(VS_FULL, FS_FADE);
P.comp = program(VS_FULL, FS_COMP);

let sim = null;          // {rows, N, pos:[t,t], vel:[t,t], fb:[f,f], cur}
function makeSim(N){
  drop(sim);
  const rows = N / TEX_W;
  const s = {rows, N, pos:[], vel:[], fb:[], cur:0};
  for (let i = 0; i < 2; i++) {
    s.pos[i] = tex(TEX_W, rows, gl.RGBA32F, gl.NEAREST);
    s.vel[i] = tex(TEX_W, rows, gl.RGBA32F, gl.NEAREST);
    s.fb[i] = fbo([s.pos[i], s.vel[i]]);
    if (!s.fb[i]) fail('Could not create float simulation targets.');
  }
  sim = s;
}

// --------------------------------------------------------------------------------------- galaxies
// A galaxy = a core (CPU body) + a slot of particles. Normal from (incl, pa) relative to the +y orbit axis:
// incl 0 = disc spinning prograde in the orbit plane, 180 = retrograde.
function makeGal(o){
  const m = o.m ?? 1;
  const g = {
    name:o.name||'GALAXY', m, lum:o.lum ?? m,
    rd:o.rd ?? 0.8*Math.sqrt(m), eps:o.eps ?? 0.35*Math.pow(m,0.4),
    arms:o.arms ?? 2, pitch:o.pitch ?? deg(20+rand()*10),
    n: o.normal ? V.norm(o.normal) : V.norm([Math.sin(deg(o.incl||0))*Math.sin(deg(o.pa||0)), Math.cos(deg(o.incl||0)), Math.sin(deg(o.incl||0))*Math.cos(deg(o.pa||0))]),
    tint:o.tint || [1,1,1], pos:o.pos||[0,0,0], vel:o.vel||[0,0,0],
  };
  g.bulgeR = o.bulgeR ?? g.rd*0.28; g.rmax = g.rd*5.2; g.rh = 3.0*Math.sqrt(m);
  return g;
}
function vcirc(g, r){ return Math.sqrt(g.m*r*r/Math.pow(r*r + g.eps*g.eps, 1.5)); }

function genGalaxy(g, count, pos, vel){
  const n = g.n;
  const e1 = V.norm(Math.abs(n[1]) < 0.9 ? V.cross(n,[0,1,0]) : V.cross(n,[1,0,0])), e2 = V.cross(n, e1);
  const tanP = Math.tan(g.pitch), armOff = rand()*6.283;
  for (let i = 0; i < count; i++) {
    const u = i/count;
    let px, py, pz, vx, vy, vz;
    if (u >= T_DISC && u < T_BULGE) {              // bulge: Plummer sphere, hot and slowly rotating
      let r; do { r = g.bulgeR/Math.sqrt(Math.pow(rand(), -2/3) - 1); } while (r > g.bulgeR*5);
      const ct = 2*rand()-1, ph = rand()*6.283, st = Math.sqrt(1-ct*ct);
      const d = [st*Math.cos(ph), st*Math.sin(ph), ct];
      d[1] *= 0.75; const dn = V.norm(d);
      const vc = vcirc(g, r);
      let t = V.norm(V.cross(dn, V.norm([gauss(),gauss(),gauss()])));
      const rot = V.cross(n, dn);
      if (V.len(rot) > 0.1) t = V.norm(V.add(V.mul(t, 0.8), V.mul(V.norm(rot), 0.6)));
      const vr = gauss()*0.25*vc;
      px = dn[0]*r; py = dn[1]*r; pz = dn[2]*r;
      vx = t[0]*vc*0.88 + dn[0]*vr; vy = t[1]*vc*0.88 + dn[1]*vr; vz = t[2]*vc*0.88 + dn[2]*vr;
    } else {                                       // disc, gas, young: exponential disc with spiral arms
      const type = u < T_DISC ? 0 : (u < T_GAS ? 2 : 3);
      const rd = type === 2 ? g.rd*1.3 : g.rd;
      let r; do { r = -rd*Math.log(rand()*rand()); } while (r > g.rmax || r < 0.03);
      const armP = type === 0 ? 0.35 : type === 2 ? 0.75 : 0.92;
      const spread = type === 0 ? 0.45 : 0.2;
      let th;
      if (rand() < armP && r > g.bulgeR) th = armOff + 6.283*Math.floor(rand()*g.arms)/g.arms + Math.log(r/rd)/tanP + gauss()*spread;
      else th = rand()*6.283;
      const hz = type === 0 ? 0.05*rd*(0.6 + 0.4*r/rd) : 0.022*rd;
      const z = gauss()*hz;
      const c = Math.cos(th), s = Math.sin(th);
      const rad = [e1[0]*c + e2[0]*s, e1[1]*c + e2[1]*s, e1[2]*c + e2[2]*s];
      const tan = V.cross(n, rad);
      const vc = vcirc(g, r);
      const sg = (type === 0 ? 0.07 : 0.035)*vc;
      const vt = vc + gauss()*sg*0.5, vr = gauss()*sg, vz2 = gauss()*sg*0.5;
      px = rad[0]*r + n[0]*z; py = rad[1]*r + n[1]*z; pz = rad[2]*r + n[2]*z;
      vx = tan[0]*vt + rad[0]*vr + n[0]*vz2; vy = tan[1]*vt + rad[1]*vr + n[1]*vz2; vz = tan[2]*vt + rad[2]*vr + n[2]*vz2;
    }
    const k = i*4;
    pos[k] = g.pos[0] + px; pos[k+1] = g.pos[1] + py; pos[k+2] = g.pos[2] + pz; pos[k+3] = 0;
    vel[k] = g.vel[0] + vx; vel[k+1] = g.vel[1] + vy; vel[k+2] = g.vel[2] + vz; vel[k+3] = 0;
  }
}

// Two galaxies on a Kepler orbit with pericentre rp, starting at separation D, excess speed vinf
// (0 = parabolic). Orbital angular momentum along +y.
function orbitPair(g0, g1, D, rp, vinf){
  const mu = g0.m + g1.m;
  const v = Math.sqrt(2*mu/D + vinf*vinf), vp = Math.sqrt(2*mu/Math.max(rp,1e-3) + vinf*vinf);
  const vt = Math.min(v, rp*vp/D), vr = -Math.sqrt(Math.max(0, v*v - vt*vt));
  const rel = [D,0,0], rv = [vr,0,-vt];
  const f0 = g1.m/mu, f1 = g0.m/mu;
  g0.pos = V.mul(rel, -f0); g0.vel = V.mul(rv, -f0);
  g1.pos = V.mul(rel, f1);  g1.vel = V.mul(rv, f1);
}

const SCENARIOS = [
  { key:'mwm31', label:'Milky Way × M31', title:'MILKY WAY × ANDROMEDA', sub:'4.5 BILLION YEARS FROM NOW',
    desc:'Andromeda is falling toward us at 110 km/s. After two close passes the pair merges into one giant elliptical — "Milkomeda".',
    cam:{yaw:0.5, pitch:0.55, dist:26},
    build(){ const a = makeGal({name:'MILKY WAY', m:1.0, incl:25, pa:10, tint:[1,0.97,0.92]});
             const b = makeGal({name:'ANDROMEDA', m:1.35, rd:1.0, incl:55, pa:-50, tint:[1,0.92,0.86]});
             orbitPair(a, b, 14, 2.1, 0); return [a,b]; } },
  { key:'ant', label:'The Antennae', title:'THE ANTENNAE', sub:'NGC 4038 / 4039 · 45 MILLION LIGHT-YEARS',
    desc:'Two equal spirals on a prograde encounter throw out a pair of long tidal tails — the insect\'s "antennae". Watch the gas ignite.',
    cam:{yaw:-0.4, pitch:0.75, dist:22},
    build(){ const a = makeGal({name:'NGC 4038', m:1, incl:60, pa:-30});
             const b = makeGal({name:'NGC 4039', m:1, incl:60, pa:-30, tint:[1,0.94,0.9]});
             orbitPair(a, b, 10, 1.3, 0); return [a,b]; } },
  { key:'mice', label:'The Mice', title:'THE MICE', sub:'NGC 4676 A / B · 300 MILLION LIGHT-YEARS',
    desc:'A near face-on and a tilted disc graze each other. One tail stays thin and straight — the mouse\'s tail — because we see it edge-on.',
    cam:{yaw:0.9, pitch:0.45, dist:22},
    build(){ const a = makeGal({name:'NGC 4676 A', m:1, incl:15, pa:0});
             const b = makeGal({name:'NGC 4676 B', m:1, incl:62, pa:90, tint:[0.95,0.95,1]});
             orbitPair(a, b, 10, 1.1, 0); return [a,b]; } },
  { key:'cart', label:'Cartwheel ring', title:'THE CARTWHEEL', sub:'ESO 350-40 · A BULLET THROUGH THE HEART',
    desc:'A compact dwarf plunges straight through a disc. The sudden pull and release launches a ring-shaped density wave that sweeps outward.',
    cam:{yaw:1.05, pitch:0.4, dist:17},
    build(){ const a = makeGal({name:'CARTWHEEL', m:1.1, rd:0.8, normal:[0.96,0.22,0.12], tint:[0.95,0.97,1]});
             const b = makeGal({name:'INTRUDER', m:0.32, rd:0.22, eps:0.16, incl:40, lum:0.25, tint:[1,0.85,0.7]});
             orbitPair(a, b, 9, 0.25, 0.75); return [a,b]; } },
  { key:'m51', label:'Whirlpool M51', title:'THE WHIRLPOOL', sub:'M51 · NGC 5194 / 5195',
    desc:'A small companion swings past a big spiral. Its tides pump up a textbook two-armed "grand design" and pull a bridge of stars between them.',
    cam:{yaw:0.2, pitch:1.15, dist:20},
    build(){ const a = makeGal({name:'M51a', m:1, rd:0.85, incl:10, pa:0, arms:2});
             const b = makeGal({name:'M51b', m:0.3, rd:0.3, incl:50, pa:30, lum:0.28, tint:[1,0.85,0.7]});
             orbitPair(a, b, 12, 2.6, 0); return [a,b]; } },
  { key:'tri', label:'Triple collision', title:'TRIPLE COLLISION', sub:'A COMPACT GROUP GOES CHAOTIC',
    desc:'Three spirals falling together. The three-body dance is chaotic — no two runs of real groups end the same way.',
    cam:{yaw:0.3, pitch:0.8, dist:30},
    build(){
      const gs = [], ms = [0.9, 0.8, 0.6], names = ['NGC 7317','NGC 7318','NGC 7319'];
      for (let i = 0; i < 3; i++) {
        const a = i*2.094 + 0.3, r = 6;
        const p = [Math.cos(a)*r, (i-1)*1.2, Math.sin(a)*r];
        const t = [-Math.sin(a), 0, Math.cos(a)];
        const v = V.add(V.mul(t, 0.15), V.mul(V.norm(p), -0.12));
        gs.push(makeGal({name:names[i], m:ms[i], incl:[20,75,140][i], pa:[0,60,-40][i], pos:p, vel:v, tint:[[1,1,1],[1,0.93,0.86],[0.92,0.95,1]][i]}));
      }
      const M = gs.reduce((s,g)=>s+g.m,0);
      const pc = gs.reduce((s,g)=>V.add(s,V.mul(g.pos,g.m/M)),[0,0,0]), vc = gs.reduce((s,g)=>V.add(s,V.mul(g.vel,g.m/M)),[0,0,0]);
      gs.forEach(g => { g.pos = V.sub(g.pos, pc); g.vel = V.sub(g.vel, vc); });
      return gs; } },
  { key:'sand', label:'Sandbox', title:'SANDBOX', sub:'ONE GALAXY · THREE LAUNCHES',
    desc:'Pick LAUNCH and drag a slingshot to throw galaxies at it — the dotted line predicts their path. Hold Shift for a black hole.',
    cam:{yaw:0.0, pitch:0.75, dist:28},
    build(){ return [makeGal({name:'HOME', m:1.2, incl:20, pa:0})]; } },
];

// --------------------------------------------------------------------------------------- state
const cores = [];        // per slot: {g, x:[3], v:[3], active, spawn}
let slotStart = [0,0,0,0], slotRows = [0,0,0,0];
let simT = 0, paused = false, scenario = 0, spawnCounter = 0;
let N = 1048576;
const bh = {active:false, strength:0, pos:[0,0,0], target:[0,0,0], mass:1.2, hover:false};
let events = {};         // pair tracking, keyed by slot pair + spawn ids
let SN_CLOCK = 0;        // supernova epochs advance only while the galaxy view runs
const QSO = {t0: -1, a: 0, b: 1};   // the merged black hole lights up as a quasar
const settings = {speed:1, expo:1, bloom:1, dust:true, trails:false, auto:true, follow:true, labels:true};

function layoutSlots(nGal, gals){
  const R = sim.rows;
  let share;
  if (nGal >= 4) share = gals.map(g => Math.sqrt(g.m));
  else {
    const presetFrac = nGal === 1 ? 0.4 : 0.8;
    const w = gals.map(g => Math.sqrt(g.m)), ws = w.reduce((a,b)=>a+b,0);
    share = [];
    for (let i = 0; i < 4; i++) share[i] = i < nGal ? presetFrac*w[i]/ws : (1-presetFrac)/(4-nGal);
  }
  const tot = share.reduce((a,b)=>a+b,0);
  let acc = 0;
  for (let i = 0; i < 4; i++) {
    slotStart[i] = acc;
    slotRows[i] = i === 3 ? R - acc : Math.max(1, Math.round(R*share[i]/tot));
    acc += slotRows[i];
  }
}

function writeSlot(i, g){
  const count = slotRows[i]*TEX_W;
  const pos = new Float32Array(count*4), vel = new Float32Array(count*4);
  genGalaxy(g, count, pos, vel);
  const c = sim.cur;
  gl.bindTexture(gl.TEXTURE_2D, sim.pos[c]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, slotStart[i], TEX_W, slotRows[i], gl.RGBA, gl.FLOAT, pos);
  gl.bindTexture(gl.TEXTURE_2D, sim.vel[c]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, slotStart[i], TEX_W, slotRows[i], gl.RGBA, gl.FLOAT, vel);
  cores[i] = {g, x:g.pos.slice(), v:g.vel.slice(), active:true, spawn:spawnCounter++};
}

function reset(idx){
  if (idx != null) scenario = idx;
  const sc = SCENARIOS[scenario];
  if (!sim || sim.N !== N) makeSim(N);
  deep.focus = 0; deep.glide = null; flight = null; deep.cubeValid = false;
  const gals = sc.build();
  layoutSlots(gals.length, gals);
  for (let i = 0; i < 4; i++) cores[i] = {g:null, x:[0,0,0], v:[0,0,0], active:false, spawn:-1};
  gals.forEach((g, i) => writeSlot(i, g));
  simT = 0; events = {}; QSO.t0 = -1;
  if (typeof BATTLE !== 'undefined') BATTLE.on = false;
  cam.free = null;
  cam.yaw = sc.cam.yaw; cam.pitch = sc.cam.pitch; cam.dist = sc.cam.dist; cam.target = comCores();
  bh.strength = 0;
  if (tg) tg.fresh = true;
  showCard(sc.title, sc.sub, sc.desc);
  document.querySelectorAll('#scen button').forEach((b, i) => b.classList.toggle('on', i === scenario));
  $('subCount').textContent = N.toLocaleString() + ' STARS · RESTRICTED N-BODY · WEBGL2';
  rebuildLabels();
}

function comCores(){
  let M = 0, p = [0,0,0];
  cores.forEach(c => { if (c.active) { M += c.g.m; p = V.add(p, V.mul(c.x, c.g.m)); } });
  return M ? V.mul(p, 1/M) : [0,0,0];
}

// ----------------------------------------------------------------------------- core dynamics (CPU)
// Mutual Plummer gravity + dynamical friction (momentum-conserving pair drag, strongest where the halos
// overlap). The user's black hole acts on cores with a wide softening so it tugs rather than slingshots.
function coreAccels(list, bhOn){
  const n = list.length, a = list.map(() => [0,0,0]);
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) {
    const A = list[i], B = list[j];
    const dx = B.x[0]-A.x[0], dy = B.x[1]-A.x[1], dz = B.x[2]-A.x[2], r2 = dx*dx+dy*dy+dz*dz;
    const e2 = (A.g.eps*A.g.eps + B.g.eps*B.g.eps)/2, inv = 1/Math.pow(r2+e2, 1.5);
    a[i][0] += B.g.m*dx*inv; a[i][1] += B.g.m*dy*inv; a[i][2] += B.g.m*dz*inv;
    a[j][0] -= A.g.m*dx*inv; a[j][1] -= A.g.m*dy*inv; a[j][2] -= A.g.m*dz*inv;
    const rh2 = (A.g.rh*A.g.rh + B.g.rh*B.g.rh)/2, w = FRICTION/Math.pow(1 + r2/rh2, 2);
    const vx = A.v[0]-B.v[0], vy = A.v[1]-B.v[1], vz = A.v[2]-B.v[2];
    a[i][0] -= w*B.g.m*vx; a[i][1] -= w*B.g.m*vy; a[i][2] -= w*B.g.m*vz;
    a[j][0] += w*A.g.m*vx; a[j][1] += w*A.g.m*vy; a[j][2] += w*A.g.m*vz;
  }
  if (bhOn && bhOn.m > 0) for (let i = 0; i < n; i++) {
    const d = V.sub(bhOn.x, list[i].x), r2 = V.dot(d,d) + 0.16, inv = bhOn.m/Math.pow(r2, 1.5);
    a[i][0] += d[0]*inv; a[i][1] += d[1]*inv; a[i][2] += d[2]*inv;
  }
  return a;
}
function stepCores(list, dt, bhOn){
  const a = coreAccels(list, bhOn);
  list.forEach((c, i) => { for (let k = 0; k < 3; k++) { c.v[k] += a[i][k]*dt; c.x[k] += c.v[k]*dt; } });
}

// --------------------------------------------------------------------------------------- camera
const cam = {yaw:0.5, pitch:0.6, dist:26, target:[0,0,0], fov:deg(50), eye:[0,0,0], view:null, proj:null, vp:null};
function project(p){
  const m = cam.vp, x = m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], y = m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
        w = m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];
  if (w <= 0.01) return null;
  return {u:x/w*0.5+0.5, v:y/w*0.5+0.5, w};
}
// Point under the cursor on the plane through the camera target facing the camera.
function pickPlane(cx, cy){
  const r = cv.getBoundingClientRect();
  const nx = (cx - r.left)/r.width*2-1, ny = 1-(cy - r.top)/r.height*2;
  const inv = minv(cam.vp);
  const un = (x,y,z) => { const w = inv[3]*x+inv[7]*y+inv[11]*z+inv[15];
    return [(inv[0]*x+inv[4]*y+inv[8]*z+inv[12])/w, (inv[1]*x+inv[5]*y+inv[9]*z+inv[13])/w, (inv[2]*x+inv[6]*y+inv[10]*z+inv[14])/w]; };
  const a = un(nx,ny,-1), b = un(nx,ny,1), d = V.norm(V.sub(b,a));
  const t = V.dot(V.sub(cam.target, a), cam.fwd)/V.dot(d, cam.fwd);
  return V.add(a, V.mul(d, t));
}

// --------------------------------------------------------------------------------------- launch
const LAUNCH_NAMES = ['NGC 1300','M83','M101','NGC 2997','M74','NGC 6744','M100','NGC 4414','M33','NGC 7331','NGC 1232','M61'];
function launchVel(){
  if (!drag || drag.mode !== 'launch') return null;
  const d = V.sub(drag.start, drag.end);
  if (Math.hypot(drag.ex - drag.sx, drag.ey - drag.sy) < 8) return null;
  return V.mul(d, 0.14);
}
function pickSlot(){
  for (let i = 0; i < 4; i++) if (!cores[i].active) return i;
  let best = -1, bs = 1e9;
  for (let i = 0; i < 4; i++) if (cores[i].g.launched && cores[i].spawn < bs) { bs = cores[i].spawn; best = i; }
  if (best >= 0) return best;
  let small = 0; for (let i = 1; i < 4; i++) if (slotRows[i] < slotRows[small]) small = i;
  return small;
}
function launchGalaxy(p, v){
  const m = +$('launchSize').value;
  const i = pickSlot();
  const g = makeGal({name:LAUNCH_NAMES[Math.floor(rand()*LAUNCH_NAMES.length)], m, incl:rand()*180, pa:rand()*360,
    pos:p, vel:v, tint:[0.93+rand()*0.1, 0.93+rand()*0.07, 0.9+rand()*0.12]});
  g.launched = true;
  writeSlot(i, g);
  rebuildLabels();
  caption('LAUNCHED ' + g.name + ' · ' + Math.round(V.len(v)*KMS_PER_V) + ' km/s');
}
// Forward-integrate every core plus the candidate to draw the aiming line.
function predict(p, v, m){
  const list = cores.filter(c => c.active).map(c => ({g:c.g, x:c.x.slice(), v:c.v.slice()}));
  const me = {g:makeGalLite(m), x:p.slice(), v:v.slice()};
  list.push(me);
  const paths = list.map(() => []);
  for (let s = 0; s < 900; s++) {
    stepCores(list, 0.06, null);
    if (s % 3 === 0) list.forEach((c, i) => paths[i].push(c.x.slice()));
  }
  return paths;
}
function makeGalLite(m){ return {m, eps:0.35*Math.pow(m,0.4), rh:3*Math.sqrt(m)}; }

function trackEvents(){
  const act = cores.map((c,i)=>[c,i]).filter(([c]) => c.active);
  for (let a = 0; a < act.length; a++) for (let b = a+1; b < act.length; b++) {
    const [A, i] = act[a], [B, j] = act[b], key = i + '-' + j + ':' + A.spawn + ':' + B.spawn;
    const d = V.len(V.sub(A.x, B.x)), dv = V.len(V.sub(A.v, B.v));
    const e = events[key] || (events[key] = {prev:d, dec:false, merged:false, passes:0, apo:d});
    const talk = typeof FILM === 'undefined' || !FILM.on;
    if (!e.merged && !e.dec && d < e.prev && e.passes >= 1 && e.apo < 1.0) {     // apocentre inside 1 unit: one body
      e.merged = true; if (QSO.t0 < 0) { QSO.t0 = simT; QSO.a = i; QSO.b = j; }
      if (talk) caption('MERGER · ' + A.g.name + ' + ' + B.g.name + ' COALESCE AT ' + Math.round(simT*MYR_PER_T) + ' Myr');
    }
    if (d > e.prev && e.dec && e.prev < 6) {
      // the cores slosh inside each other's softened cores after the second pass: only a pericentre that
      // follows a real apocentre (> 2 units, ~7 kpc) is a passage
      if (e.passes === 0 || e.apo > 2.0) {
        e.passes++;
        const kpc = Math.round(e.prev*KPC_PER_L);
        if (!e.merged && talk) caption((e.passes === 1 ? 'FIRST PASSAGE' : 'PASSAGE ' + e.passes) + ' · ' + A.g.name + ' × ' + B.g.name + ' · ' + kpc + ' kpc');
      }
      e.apo = 0;
    }
    e.apo = Math.max(e.apo, d);
    e.dec = d < e.prev; e.prev = d;
  }
}

const coreBuf = new Float32Array(20), epsBuf = new Float32Array(5);
function uploadCores(prog){
  for (let i = 0; i < 4; i++) {
    const c = cores[i];
    coreBuf[i*4] = c.x[0]; coreBuf[i*4+1] = c.x[1]; coreBuf[i*4+2] = c.x[2]; coreBuf[i*4+3] = c.active ? c.g.m : 0;
    epsBuf[i] = c.active ? c.g.eps : 1;
  }
  coreBuf[16] = bh.pos[0]; coreBuf[17] = bh.pos[1]; coreBuf[18] = bh.pos[2]; coreBuf[19] = bh.mass*bh.strength;
  epsBuf[4] = 0.08;
  gl.uniform4fv(prog.u.u_core, coreBuf); gl.uniform1fv(prog.u.u_eps, epsBuf);
}
function slotUniforms(prog){
  gl.uniform4f(prog.u.u_slotStart, slotStart[0], slotStart[1], slotStart[2], slotStart[3]);
  gl.uniform4f(prog.u.u_slotN, slotRows[0]*TEX_W, slotRows[1]*TEX_W, slotRows[2]*TEX_W, slotRows[3]*TEX_W);
  gl.uniform4f(prog.u.u_slotActive, +cores[0].active, +cores[1].active, +cores[2].active, +cores[3].active);
}

function simStep(dt){
  const U = P.update;
  gl.useProgram(U.p);
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.fb[1 - sim.cur]);
  gl.viewport(0, 0, TEX_W, sim.rows);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sim.pos[sim.cur]); gl.uniform1i(U.u.u_pos, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sim.vel[sim.cur]); gl.uniform1i(U.u.u_vel, 1);
  uploadCores(U); slotUniforms(U);
  gl.uniform1f(U.u.u_dt, dt);
  const cr = 0.11*Math.sqrt(bh.mass);
  gl.uniform1f(U.u.u_capture2, cr*cr*bh.strength);
  fullscreen();
  sim.cur = 1 - sim.cur;
  // cores follow the same substep so the GPU always sees them where the CPU has them
  const act = cores.filter(c => c.active);
  stepCores(act, dt, bh.strength > 0.001 ? {x:bh.pos, m:bh.mass*bh.strength} : null);
}

// ------------------------------------------------------------------------------ passes
// opt: {fade, holeC, capStar, holeR, pointStars, fluxK, weight, keep (add to what is there)}
function drawParticles(fb, w, h, view, proj, opt){
  const {fade, holeC, capStar, holeR, pointStars, fluxK, weight, keep} = opt || {};
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, w, h);
  if (keep) {} else if (fade) {
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA); gl.blendColor(0,0,0,0.9);
    gl.useProgram(P.fade.p); fullscreen();
  } else {
    gl.clearBufferfv(gl.COLOR, 0, [0,0,0,0]); gl.clearBufferfv(gl.COLOR, 1, [0,0,0,0]);
  }
  const Q = P.part;
  gl.useProgram(Q.p);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.blendEquation(gl.FUNC_ADD);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sim.pos[sim.cur]); gl.uniform1i(Q.u.u_pos, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sim.vel[sim.cur]); gl.uniform1i(Q.u.u_vel, 1);
  gl.uniformMatrix4fv(Q.u.u_view, false, view); gl.uniformMatrix4fv(Q.u.u_proj, false, proj);
  slotUniforms(Q);
  const lum = [0,1,2,3].map(i => cores[i].active ? cores[i].g.lum*262144/(slotRows[i]*TEX_W) : 0);
  gl.uniform4f(Q.u.u_galLum, lum[0], lum[1], lum[2], lum[3]);
  const tint = new Float32Array(12);
  for (let i = 0; i < 4; i++) if (cores[i].active) tint.set(cores[i].g.tint, i*3);
  gl.uniform3fv(Q.u.u_tint, tint);
  gl.uniform1f(Q.u.u_pxScale, proj[5]*h*0.5);
  const trailK = settings.trails && deep.focus === 0 ? 0.1 : fluxK != null ? fluxK : holeC ? 0.55 : 1;
  gl.uniform1f(Q.u.u_flux, 1.4e-5*trailK);
  gl.uniform1f(Q.u.u_fluxDust, 1.4e-5*trailK);
  gl.uniform1f(Q.u.u_dustOn, settings.dust ? 1 : 0);
  gl.uniform3f(Q.u.u_holeC, holeC ? holeC[0] : 0, holeC ? holeC[1] : 0, holeC ? holeC[2] : 0);
  gl.uniform1f(Q.u.u_holeR, holeC ? (holeR || HOLE_R) : 0);
  gl.uniform1f(Q.u.u_pointStars, pointStars || 0);
  gl.uniform1f(Q.u.u_weight, weight != null ? weight : 1);
  gl.uniform1f(Q.u.u_near, holeC ? 0.002 : 0.03);
  gl.uniform1f(Q.u.u_capStar, capStar || (holeC ? 1.8 : 1));   // inside the galaxy: big, faint, overlapping
  gl.uniform1f(Q.u.u_sn, holeC ? 0 : 1); gl.uniform1f(Q.u.u_snClock, SN_CLOCK);
  // close shots: smaller gas sprites (surface brightness is kept by capK) -- the RGBA32F blend is fill-bound
  gl.uniform1f(Q.u.u_gasCap, holeC ? 1 : clamp(cam.dist/30, 0.4, 1));
  gl.drawArrays(gl.POINTS, 0, sim.N);
}

function composite(fb, w, h, light, dust, view, proj, now, extras){
  gl.disable(gl.BLEND);
  const C = P.comp;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, w, h);
  gl.useProgram(C.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, light); gl.uniform1i(C.u.u_light, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, dust); gl.uniform1i(C.u.u_dust, 1);
  const rot = view.slice(); rot[12] = rot[13] = rot[14] = 0;
  gl.uniformMatrix4fv(C.u.u_invVP, false, minv(mmul(proj, rot)));
  gl.uniform2f(C.u.u_res, w, h);
  gl.uniform1f(C.u.u_aspect, w/h);
  gl.uniform1f(C.u.u_dustK, 9.0);
  gl.uniform1f(C.u.u_pixAng, 2/(proj[5]*h));
  gl.uniform1f(C.u.u_time, now*0.001);
  const cb = new Float32Array(16), cc = new Float32Array(12);
  gl.uniform4f(C.u.u_bh, 0, 0, 0, 0);
  if (extras) {
    const pxScale = proj[5]*h*0.5;
    const bp = project(bh.pos);
    if (bp && bh.strength > 0.001) {
      const tE = 0.55*Math.sqrt(bh.mass)*(pxScale/bp.w)/h;
      gl.uniform4f(C.u.u_bh, bp.u, bp.v, Math.min(tE, 0.35), bh.strength);
    }
    for (let i = 0; i < 4; i++) {
      const c = cores[i]; if (!c.active) continue;
      const p = project(c.x); if (!p) continue;
      cb[i*4] = p.u; cb[i*4+1] = p.v; cb[i*4+2] = Math.max(1.2/h, 0.035*c.g.rd*(pxScale/p.w)/h);
      cb[i*4+3] = 0.9*c.g.lum; cc.set([1.0*c.g.tint[0], 0.85*c.g.tint[1], 0.68*c.g.tint[2]], i*3);
    }
  }
  gl.uniform4fv(C.u.u_cores, cb); gl.uniform3fv(C.u.u_coreCol, cc);
  gl.uniform4f(C.u.u_qso, 0, 0, 0, 1);
  if (extras && QSO.t0 >= 0 && cores[QSO.a].active && cores[QSO.b].active) {
    const A = cores[QSO.a], B = cores[QSO.b], m = A.g.m + B.g.m;
    const p = project(V.mul(V.add(V.mul(A.x, A.g.m), V.mul(B.x, B.g.m)), 1/m));
    const k = smooth01((simT - QSO.t0)/2.5);
    if (p) gl.uniform4f(C.u.u_qso, p.u, p.v, k*(26 + 6*Math.sin(now*0.0031)), 1.6);
  }
  fullscreen();
}

