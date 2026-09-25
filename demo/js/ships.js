'use strict';
// ships.js — procedural fleets: a kitbash mesh builder, the ship designs, and their renderer.
//
// Ship space: metres, +Z bow, +Y dorsal, +X starboard. Every vertex carries a material id, an ambient-
// occlusion term baked from how buried it sits among the greebles, and a seed for panel variation.
// Materials: 0 hull, 1 dark metal, 2 trim/team colour, 3 window strip, 4 engine glow, 5 hangar mouth,
//            6 weapon (charge glow), 7 bare structure.
//
// Rendering: ships go to a 4x MSAA HDR target whose depth is first PRIMED from the planet's deferred hit
// buffer, with a LOGARITHMIC depth written per fragment (metres to 10^7 km at ~1e-6 relative precision:
// a 24-bit linear buffer cannot hold a hull 20 m in front of another 1000 km away).

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

// Blue coalition flagship "ARGO": a long sleek wedge with a spinal lance, 2.4 km.
SHIP_CLASSES.argo = () => {
  const m = new Mesh(), rnd = mulberry(1001);
  // main hull: stern block -> mid -> forward taper -> prow
  m.seg(-1180, 360, 230, 0, -760, 390, 250, 0, 0, 1, 11);
  m.seg(-760, 390, 250, 0, -150, 330, 210, -5, 0, 1, 12, 'b');
  m.seg(-150, 330, 210, -5, 520, 200, 140, -12, 0, 1, 13, 'b');
  m.seg(520, 200, 140, -12, 1020, 70, 60, -18, 0, 1, 14, 'b');
  // ventral keel and dorsal spine
  m.seg(-1100, 150, 60, -145, 700, 90, 40, -95, 1, 0.8, 21);
  m.seg(-900, 90, 70, 150, 600, 50, 30, 95, 2, 0.95, 22);
  // superstructure: stepped bridge tower
  m.box([0, 175, -880], [85, 55, 150], 0, 1, 31);
  m.box([0, 245, -915], [55, 30, 95], 0, 1, 32);
  m.box([0, 290, -935], [70, 16, 45], 7, 1, 33);
  m.quad([-66, 283, -889], [66, 283, -889], [66, 297, -889], [-66, 297, -889], 3, 1, 0, [0, 290, -935]);   // bridge windows
  m.cyl([0, 300, -960], [0, 420, -960], 6, 2, 6, 7, 1, 0);                                       // mast
  m.cyl([30, 300, -980], [30, 370, -980], 4, 1.5, 6, 7, 1, 0);
  // spinal lance barrel out of the prow, with emitter rings (mat 6 glows when charging)
  m.cyl([0, -18, 900], [0, -18, 1220], 34, 26, 20, 1, 0.9, 0);
  for (let k = 0; k < 5; k++) m.cyl([0, -18, 960 + k*55], [0, -18, 985 + k*55], 38, 38, 20, 6, 1, 0, false);
  m.cyl([0, -18, 1220], [0, -18, 1226], 22, 22, 20, 6, 1, 0, true, 6);
  // engines: 5 bells in a cross
  const eng = [[0, 0, 70], [-120, 55, 55], [120, 55, 55], [-120, -55, 55], [120, -55, 55]];
  for (const [x, y, r] of eng) engineBell(m, -1180, x, y, r, 70);
  // flank hangar mouths with light strips
  for (const s of [-1, 1]) {
    sidePanel(m, s, 197, -40, 30, -520, -300, 5);
    for (let k = 0; k < 6; k++) windowsStrip(m, -700 + k*140, -600 + k*140, 190 - k*8, 60, 5, s);
  }
  // turret batteries along the dorsal shoulders and flanks
  for (let k = 0; k < 9; k++) {
    const z = -620 + k*135, w = 195 - k*16;
    turret(m, rnd, [-w*0.72, 105 - k*6, z], 0, 11, true);
    turret(m, rnd, [w*0.72, 105 - k*6, z], 0, 11, true);
  }
  for (let k = 0; k < 4; k++) turret(m, rnd, [0, 118 - k*4, -300 + k*170], 0, 16, true);
  // greebles on the big flat faces
  const g = (o, u, v, su, sv, nn, cnt, sz) => m.greeble(rnd, o, u, v, su, sv, nn, cnt, sz, [0, 0, 1, 7, 2]);
  g([-170, 118, -740], [1, 0, 0], [0, 0, 1], 340, 560, [0, 1, 0], 180, 14);
  g([-150, 100, -140], [1, 0, 0], [0, 0.03, 1], 300, 620, [0, 1, 0], 150, 12);
  g([-160, -120, -740], [1, 0, 0], [0, 0, 1], 320, 1200, [0, -1, 0], 160, 14);
  for (const s of [-1, 1]) {
    g([s*197, -100, -1150], [0, 1, 0], [0, 0, 1], 200, 380, [s, 0, 0], 70, 12);
    g([s*170, -90, -120], [0, 1, 0], [0, 0, 1], 160, 600, [s, 0, 0], 70, 10);
  }
  return m;
};

// Amber dominion dreadnought "TYRANT": a 3.2 km arrowhead with a stepped command ziggurat.
SHIP_CLASSES.tyrant = () => {
  const m = new Mesh(), rnd = mulberry(2002);
  const L = 3200, W = 1650, z0 = -1500;
  // flat arrowhead: dorsal and ventral slopes meeting at a mid rim
  const rim = [[-W/2, 0, z0], [W/2, 0, z0], [0, 0, z0 + L]];
  const top = [0, 190, z0 + 120], bot = [0, -170, z0 + 180], inside = [0, 0, z0 + 700];
  m.tri(rim[1], rim[0], top, 1, 0.9, 5, inside);
  m.tri(rim[0], rim[2], [0, 150, z0 + 900], 0, 1, 6, inside); m.tri(rim[0], [0, 150, z0 + 900], top, 0, 1, 6, inside);
  m.tri(rim[2], rim[1], [0, 150, z0 + 900], 0, 1, 7, inside); m.tri(rim[1], top, [0, 150, z0 + 900], 0, 1, 7, inside);
  m.tri(rim[0], bot, rim[2], 1, 0.8, 8, inside); m.tri(rim[1], rim[2], bot, 1, 0.8, 9, inside); m.tri(rim[0], rim[1], bot, 1, 0.8, 10, inside);
  // stern slab and engine block
  m.box([0, 30, z0 - 40], [W*0.42, 150, 40], 1, 0.9, 12);
  const bells = [];
  for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) bells.push([(k - 2)*190, r ? 70 : -40, r ? 62 : 70]);
  for (const [x, y, rr] of bells) engineBell(m, z0 - 70, x, y, rr, 90);
  // central trench walls + stepped ziggurat superstructure
  m.box([-70, 190, z0 + 700], [30, 40, 600], 0, 0.85, 14); m.box([70, 190, z0 + 700], [30, 40, 600], 0, 0.85, 15);
  m.box([0, 240, z0 + 330], [300, 70, 260], 0, 1, 16);
  m.box([0, 330, z0 + 290], [190, 40, 180], 0, 1, 17);
  m.box([0, 395, z0 + 260], [120, 30, 110], 7, 1, 18);
  m.box([0, 450, z0 + 250], [150, 22, 40], 1, 1, 19);                           // command bridge
  m.quad([-150, 440, z0 + 291], [150, 440, z0 + 291], [150, 462, z0 + 291], [-150, 462, z0 + 291], 3, 1, 0, [0, 450, z0 + 250]);
  for (const s of [-1, 1]) m.cyl([s*110, 472, z0 + 250], [s*110, 520, z0 + 250], 22, 22, 14, 1, 1, 0);   // sensor domes
  // window bands down the dorsal slopes
  for (let k = 0; k < 8; k++) {
    const z = z0 + 500 + k*230, w = (W/2)*(1 - (z - z0)/L)*0.8;
    m.quad([-w, 60, z], [w, 60, z], [w, 64, z + 8], [-w, 64, z + 8], 3, 1, 0, [0, 0, z + 200]);
  }
  // heavy turret batteries along both edges
  for (let k = 0; k < 11; k++) {
    const t = 0.12 + k*0.075, z = z0 + t*L, x = (W/2)*(1 - t)*0.82, y = 40 + 110*(1 - t);
    turret(m, rnd, [-x, y, z], -0.3, 22, true); turret(m, rnd, [x, y, z], 0.3, 22, true);
  }
  // greebles across the slopes
  const g = (o, u, v, su, sv, nn, cnt, sz) => m.greeble(rnd, o, u, v, su, sv, nn, cnt, sz, [0, 1, 1, 7]);
  for (const s of [-1, 1]) {
    const u = V.norm([s, -0.12, 0.45]), v = [0, 0.05, 1], nn = V.norm([s*0.12, 1, 0.05]);
    g([s*80, 130, z0 + 250], [s, -0.18, 0], v, 600, 1500, nn, 260, 16);
  }
  g([-400, -60, z0 + 300], [1, 0, 0], [0, -0.02, 1], 800, 1400, [0, -1, 0], 160, 18);
  return m;
};

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

// Dominion fighter "WASP": hex pod between two tall blade wings, 12 m.
SHIP_CLASSES.wasp = () => {
  const m = new Mesh();
  m.cyl([0, 0, -2.4], [0, 0, 2.6], 1.4, 1.1, 6, 1, 1, 0);
  m.cyl([0, 0, 2.6], [0, 0, 3.4], 1.1, 0.4, 6, 3, 1, 0);
  for (const s of [-1, 1]) {
    m.box([s*2.2, 0, 0], [0.9, 0.25, 0.35], 1, 1, 0);
    m.hex([[s*3.0, -4.5, -1.8], [s*3.0, -4.5, 0.6], [s*3.0, 4.5, -1.8], [s*3.0, 4.5, 0.6], [s*3.3, -4.5, -1.8], [s*3.3, -4.5, 0.6], [s*3.3, 4.5, -1.8], [s*3.3, 4.5, 0.6]]
          .map((v, i, a) => a[s < 0 ? [4,5,6,7,0,1,2,3][i] : i]), 1, 1, 71);
    m.box([s*3.35, 0, -0.6], [0.06, 3.6, 0.9], 2, 1, 0);
  }
  m.cyl([0, 0, -2.4], [0, 0, -2.5], 0.9, 0.9, 6, 4, 1, 0, true, 4);
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
P.ship = program(VS_SHIP, FS_SHIP);
P.battleBg = program(VS_FULL, FS_BATTLE_BG);

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

// Arena: a frame hovering over the world. X right, Y up (away from the planet), Z toward the hole along the
// horizon. Positions in km, float64; the GPU only ever sees camera-relative values.
const ARENA = {A: null, X: null, Y: null, Z: null};
function arenaSetup(alt, night){
  const c = bhHorizonCamera(alt, 0, 0, 0, night);
  const up = V.norm(V.sub(c.eye, bodyPos(1, deep.sysT)));
  const Z = V.norm(V.sub(c.f, V.mul(up, V.dot(c.f, up))));
  ARENA.A = c.eye; ARENA.Y = up; ARENA.Z = Z; ARENA.X = V.cross(up, Z);
}
const arenaDir = v => [ARENA.X[0]*v[0] + ARENA.Y[0]*v[1] + ARENA.Z[0]*v[2], ARENA.X[1]*v[0] + ARENA.Y[1]*v[1] + ARENA.Z[1]*v[2], ARENA.X[2]*v[0] + ARENA.Y[2]*v[1] + ARENA.Z[2]*v[2]];
const arenaToS = p => V.add(ARENA.A, V.mul(arenaDir(p), 1000));
// the director's camera: position and look-at target in km (arena), optional roll
function arenaCamera(pos, look, roll = 0){
  const f = V.norm(arenaDir(V.sub(look, pos)));
  let r = V.norm(V.cross(f, ARENA.Y)), u = V.cross(r, f);
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll); [r, u] = [V.add(V.mul(r, c), V.mul(u, s)), V.sub(V.mul(u, c), V.mul(r, s))]; }
  cam.free = {eye: arenaToS(pos), r, u, f, arena: pos.slice()};
}
// ship orientation from forward + up (arena axes): columns right, up, forward
function orient(fwd, up){ const f = V.norm(fwd), r = V.norm(V.cross(up, f)), u = V.cross(f, r); return [r, u, f]; }

let BT = null;               // battle targets: MSAA colour + depth, resolve texture
function ensureBattleTargets(){
  if (BT && BT.w === tg.w && BT.h === tg.h) return;
  if (BT) { gl.deleteFramebuffer(BT.msFb); gl.deleteFramebuffer(BT.resFb); gl.deleteRenderbuffer(BT.col); gl.deleteRenderbuffer(BT.dep); gl.deleteTexture(BT.tex); }
  const w = tg.w, h = tg.h, S = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  const b = {w, h};
  b.col = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, b.col); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, S, gl.RGBA16F, w, h);
  b.dep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, b.dep); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, S, gl.DEPTH_COMPONENT24, w, h);
  b.msFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, b.msFb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, b.col);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, b.dep);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fail('Multisampled HDR targets are unsupported on this GPU.');
  b.tex = tex(w, h, gl.RGBA16F, gl.LINEAR); b.resFb = fbo([b.tex]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  BT = b;
}
// ships: [{cls, pos (km, arena), rot: [r,u,f] (arena), team, damage, glow, size}]
function battleRender(now, planetTex, ships){
  ensureBattleTargets();
  const w = BT.w, h = BT.h, cf = cam.free;
  gl.bindFramebuffer(gl.FRAMEBUFFER, BT.msFb); gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.ALWAYS);
  const B = P.battleBg; gl.useProgram(B.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, planetTex); gl.uniform1i(B.u.u_img, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tg.gb); gl.uniform1i(B.u.u_gb, 1);
  gl.activeTexture(gl.TEXTURE0);
  fullscreen();
  gl.depthFunc(gl.LESS);
  // camera rotation (world axes -> view) and projection; everything is camera-relative, in km
  const b = cam.b, rot = new Float32Array([b.r[0], b.u[0], -b.f[0], 0, b.r[1], b.u[1], -b.f[1], 0, b.r[2], b.u[2], -b.f[2], 0, 0, 0, 0, 1]);
  const vp = mmul(perspective(cam.fov, w/h, LOGZ_NEAR, 1e8), rot);
  const Q = P.ship; gl.useProgram(Q.p);
  gl.uniformMatrix4fv(Q.u.u_vp, false, vp);
  const Pp = bodyPos(1, deep.sysT), eye = cf.eye;
  const pC = V.mul(V.sub(Pp, eye), 1e-3), toBH = V.norm(V.mul(eye, -1));
  gl.uniform3fv(Q.u.u_L, toBH); gl.uniform3fv(Q.u.u_Lcol, V.mul(deep.sys.lightCol, 1.25));
  gl.uniform3f(Q.u.u_amb, 0.018, 0.02, 0.028); gl.uniform3fv(Q.u.u_pC, pC); gl.uniform1f(Q.u.u_pR, deep.sys.bodies[1].R*1e-3);
  gl.uniform3f(Q.u.u_pCol, 0.12, 0.2, 0.3); gl.uniform1f(Q.u.u_time, now*0.001);
  for (const k of ['hull', 'dark', 'trim', 'eng', 'win']) gl.uniform3fv(Q.u['u_' + k], FLEET_LOOK[k].flat());
  const byCls = {}, camA = cf.arena;
  for (const s of ships) (byCls[s.cls] = byCls[s.cls] || []).push(s);
  for (const [cls, list] of Object.entries(byCls)) {
    const G = shipClassGL(cls), d = G.inst;
    let n = 0;
    for (const s of list) {
      if (n >= 256) break;
      const rel = arenaDir(V.sub(s.pos, camA)), R = s.rot.map(arenaDir);
      d.set([rel[0], rel[1], rel[2], 0.001*(s.size || 1), R[0][0], R[0][1], R[0][2], s.damage || 0,
             R[1][0], R[1][1], R[1][2], s.team, R[2][0], R[2][1], R[2][2], s.glow || 0], n*16);
      n++;
    }
    gl.useProgram(Q.p);
    gl.bindVertexArray(G.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.instBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n*16);
    gl.drawElementsInstanced(gl.TRIANGLES, G.n, G.type, 0, n);
  }
  gl.bindVertexArray(vao);
  if (typeof fxRender === 'function') fxRender(now, vp, w, h);
  gl.disable(gl.DEPTH_TEST); gl.depthMask(true);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, BT.msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, BT.resFb);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return BT.tex;
}

// ?scene=ships : a static line-up over the world, for look development
const SHIP_TEST = [];
function shipDevScene(){
  bhDevPlanet();
  arenaSetup(4.5e5, 0.2);
  const F = [0, 0, 1], B = [0, 0, -1], U = [0, 1, 0];
  SHIP_TEST.push({cls: 'argo', pos: [0, 0, 0], rot: orient(V.norm([0.25, 0, 1]), U), team: 0});
  SHIP_TEST.push({cls: 'tyrant', pos: [9, 2.5, 26], rot: orient(V.norm([-0.3, -0.05, -1]), U), team: 1});
  SHIP_TEST.push({cls: 'cruiser', pos: [-3.2, -0.6, 2.5], rot: orient(F, U), team: 0});
  SHIP_TEST.push({cls: 'cruiser', pos: [14, 1.2, 22], rot: orient(B, U), team: 1});
  SHIP_TEST.push({cls: 'frigate', pos: [2.4, 0.9, 1.6], rot: orient(F, U), team: 0});
  for (let k = 0; k < 6; k++) SHIP_TEST.push({cls: 'hawk', pos: [-0.6 + k*0.09, 0.35 + (k%2)*0.04, -0.5 + k*0.06], rot: orient(F, U), team: 0});
  for (let k = 0; k < 6; k++) SHIP_TEST.push({cls: 'wasp', pos: [7 + k*0.1, 2 + (k%3)*0.05, 20 - k*0.1], rot: orient(B, U), team: 1});
  arenaCamera([-2.2, 0.7, -3.2], [0.2, 0, 0.6]);
}
