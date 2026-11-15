'use strict';
// shipkit.js — the ships as data: the kitbash mesh builder, every design, and ONE hardpoint table per class (SHIP_KIT)
// that combat.js, flight.js, ships.js and tests.html all read, so a muzzle, an engine or the hull camera can never
// drift away from the hull it belongs to. Pure maths (no GL, no DOM), loaded after orbit.js: the tests' sandbox builds
// every design without a page.
//
// Ship space: metres, +Z bow, +Y dorsal, +X = Y x Z (so +X is PORT: seen from behind, the left side -- red light).
// Faces are oriented away from a reference point inside their solid, and the WINDING follows the normal (triangles are
// counter-clockwise seen from outside), so the renderer can cull back faces. Vertex: pos3 nrm3 att4 (material, ao,
// seed, decal) uv2.
//
// Forked from demo/js/ships.js (Sep 2026) and no longer kept in step with it: the demo's copy has random winding and
// the old designs.

// ------------------------------------------------------------------------------------------ mesh builder
// twice the signed area of a polygon [[x, y], ...] (> 0: counter-clockwise)
function polyArea(P){ let a = 0; for (let i = 0, n = P.length; i < n; i++) { const p = P[i], q = P[(i + 1)%n]; a += p[0]*q[1] - q[0]*p[1]; } return a; }
// Triangulate a simple polygon (concave allowed) by ear clipping: index triples wound as the polygon. Collinear and
// repeated points are dropped without a triangle; a self-intersecting polygon falls back to a fan.
function earClip(P){
  const s = Math.sign(polyArea(P)) || 1, idx = P.map((_, i) => i), out = [];
  const cr = (a, b, c) => ((b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0]))*s;
  const inside = (p, a, b, c) => cr(a, b, p) >= -1e-12 && cr(b, c, p) >= -1e-12 && cr(c, a, p) >= -1e-12;
  while (idx.length > 3) {
    let cut = false;
    for (let k = 0; k < idx.length && !cut; k++) {
      const n = idx.length, i0 = idx[(k + n - 1)%n], i1 = idx[k], i2 = idx[(k + 1)%n], a = P[i0], b = P[i1], c = P[i2], w = cr(a, b, c);
      const scale = Math.max(1e-9, Math.hypot(b[0] - a[0], b[1] - a[1])*Math.hypot(c[0] - b[0], c[1] - b[1]));
      if (Math.abs(w) <= 1e-9*scale) { idx.splice(k, 1); cut = true; break; }           // collinear: no triangle
      if (w < 0) continue;                                                             // reflex
      let ok = true;
      for (const j of idx) if (j !== i0 && j !== i1 && j !== i2 && inside(P[j], a, b, c) && !(P[j][0] === b[0] && P[j][1] === b[1])) { ok = false; break; }
      if (ok) { out.push([i0, i1, i2]); idx.splice(k, 1); cut = true; }
    }
    if (!cut) { for (let k = 1; k < idx.length - 1; k++) out.push([idx[0], idx[k], idx[k + 1]]); return out; }   // not simple: fan
  }
  if (idx.length === 3 && Math.abs(cr(P[idx[0]], P[idx[1]], P[idx[2]])) > 0) out.push(idx.slice());
  return out;
}
class Mesh {
  constructor(){ this.p = []; this.n = []; this.a = []; this.uv = []; this.i = []; this.m = [1,0,0, 0,1,0, 0,0,1]; this.t = [0,0,0]; this.stack = []; this.decal = 0; }
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
  vert(p, n, mat, ao, seed, uv){
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.a.push(mat, ao, seed, this.decal); this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
    return this.p.length/3 - 1;
  }
  // quad in LOCAL coords. `ref` = a local point inside the solid: the normal is flipped to face away from it, and the
  // winding with it, so mirrored (left-handed) corner orders cannot turn a face inside out. uv: [u0, v0, u1, v1] for
  // a decal (a -> (u0,v0), b -> (u1,v0), c -> (u1,v1), d -> (u0,v1)).
  quad(a, b, c, d, mat, ao = 1, seed = 0, ref, uv){
    const A = this.P(a), B = this.P(b), C = this.P(c), D = this.P(d);
    let n = V.norm(V.add(V.cross(V.sub(B, A), V.sub(C, A)), V.cross(V.sub(C, A), V.sub(D, A)))), flip = false;
    if (ref) { const R = this.P(ref), fc = V.mul(V.add(V.add(A, B), V.add(C, D)), 0.25); if (V.dot(n, V.sub(fc, R)) < 0) { n = V.mul(n, -1); flip = true; } }
    const k = this.vert(A, n, mat, ao, seed, uv && [uv[0], uv[1]]); this.vert(B, n, mat, ao, seed, uv && [uv[2], uv[1]]);
    this.vert(C, n, mat, ao, seed, uv && [uv[2], uv[3]]); this.vert(D, n, mat, ao, seed, uv && [uv[0], uv[3]]);
    if (flip) this.i.push(k, k+2, k+1, k, k+3, k+2); else this.i.push(k, k+1, k+2, k, k+2, k+3);
    return this;
  }
  tri(a, b, c, mat, ao = 1, seed = 0, ref){
    const A = this.P(a), B = this.P(b), C = this.P(c);
    let n = V.norm(V.cross(V.sub(B, A), V.sub(C, A))), flip = false;
    if (ref) { const R = this.P(ref), fc = V.mul(V.add(V.add(A, B), C), 1/3); if (V.dot(n, V.sub(fc, R)) < 0) { n = V.mul(n, -1); flip = true; } }
    const k = this.vert(A, n, mat, ao, seed); this.vert(B, n, mat, ao, seed); this.vert(C, n, mat, ao, seed);
    if (flip) this.i.push(k, k+2, k+1); else this.i.push(k, k+1, k+2);
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
  // Surface of revolution about the local Z axis through (cx, cy): profile [[z, r, mat, t], ...] (t: the material
  // ramp, uv.x -- e.g. a nozzle's heat tint). Normals are smooth along the profile unless a point is marked crease
  // ({crease: true} as its 5th entry); a profile that runs back toward -Z is an INNER surface and faces the axis.
  lathe(profile, seg, cx = 0, cy = 0, ao = 1, seed = 0){
    const n = profile.length, rings = [];
    const tan = i => { const a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)]; return V.norm([b[1] - a[1], b[0] - a[0], 0]); };   // (dr, dz)
    for (let i = 0; i < n; i++) {
      const [z, r, , t] = profile[i];
      const segN = (a, b) => { const dz = b[0] - a[0], dr = b[1] - a[1], l = Math.hypot(dz, dr) || 1; return [dz/l, -dr/l]; };   // (radial, axial) normal
      const nIn = i > 0 ? segN(profile[i - 1], profile[i]) : null, nOut = i < n - 1 ? segN(profile[i], profile[i + 1]) : null;
      const crease = profile[i][4] && profile[i][4].crease;
      const avg = (p, q) => { const x = (p ? p[0] : 0) + (q ? q[0] : 0), y = (p ? p[1] : 0) + (q ? q[1] : 0), l = Math.hypot(x, y) || 1; return [x/l, y/l]; };
      rings.push({z, r, t: t || 0, nA: crease ? (nIn || nOut) : avg(nIn, nOut), nB: crease ? (nOut || nIn) : avg(nIn, nOut)});
    }
    for (let i = 0; i < n - 1; i++) {
      const A = rings[i], B = rings[i + 1], mat = profile[i][2];
      if (A.r < 1e-6 && B.r < 1e-6) continue;
      for (let k = 0; k < seg; k++) {
        const t0 = k/seg*6.2831853, t1 = (k + 1)/seg*6.2831853, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
        const P = (R, c, s) => this.P([cx + c*R.r, cy + s*R.r, R.z]);
        const Nn = (nn, c, s) => this.N([c*nn[0], s*nn[0], nn[1]]);
        const v = [[P(A, c0, s0), Nn(A.nB, c0, s0), A.t], [P(A, c1, s1), Nn(A.nB, c1, s1), A.t], [P(B, c1, s1), Nn(B.nA, c1, s1), B.t], [P(B, c0, s0), Nn(B.nA, c0, s0), B.t]];
        const g = V.cross(V.sub(v[1][0], v[0][0]), V.sub(v[2][0], v[0][0])), g2 = V.cross(V.sub(v[2][0], v[0][0]), V.sub(v[3][0], v[0][0]));
        const nsum = V.add(V.add(v[0][1], v[1][1]), V.add(v[2][1], v[3][1])), flip = V.dot(V.add(g, g2), nsum) < 0;
        const base = this.p.length/3;
        for (const [p, nn, tt] of v) this.vert(p, nn, mat, ao, seed, [tt, k/seg]);
        if (flip) this.i.push(base, base+2, base+1, base, base+3, base+2); else this.i.push(base, base+1, base+2, base, base+2, base+3);
      }
    }
    return this;
  }
  // Loft: closed cross-sections [{z, pts: [[x, y], ...]}] (the same count each, any simple polygon: concave is fine),
  // faces flat; mats[j] = the material of the band from pts[j] to pts[j+1], null = leave that band open (something else
  // fills it). Each band faces out of its section by the section's own winding -- a centroid reference turns the faces
  // of a concave notch inside out, and the winding test cannot see it. caps: close the first / last section (ear-clipped).
  loft(secs, mats, ao = 1, seed = 0, caps = [true, true], capMat){
    const m = secs[0].pts.length, cen = s => { let x = 0, y = 0; for (const p of s.pts) { x += p[0]; y += p[1]; } return [x/m, y/m, s.z]; };
    const wind = secs.map(s => Math.sign(polyArea(s.pts)));
    // outward normal (x, y) of edge j of section i, by its winding (0 for a collapsed edge or section)
    const eN = (i, j) => { const p = secs[i].pts[j], q = secs[i].pts[(j + 1)%m], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
      return l > 1e-9 && wind[i] ? [dy/l*wind[i], -dx/l*wind[i]] : [0, 0]; };
    for (let i = 0; i < secs.length - 1; i++) {
      const A = secs[i], B = secs[i + 1];
      for (let j = 0; j < m; j++) {
        const mat = mats[j % mats.length]; if (mat == null) continue;
        const j1 = (j + 1)%m, a = [...A.pts[j], A.z], b = [...A.pts[j1], A.z], c = [...B.pts[j1], B.z], d = [...B.pts[j], B.z];
        const nA = eN(i, j), nB = eN(i + 1, j), n = [nA[0] + nB[0], nA[1] + nB[1]], fc = V.mul(V.add(V.add(a, b), V.add(c, d)), 0.25);
        const ref = n[0] || n[1] ? V.sub(fc, [n[0], n[1], 0]) : V.mul(V.add(cen(A), cen(B)), 0.5);   // a point just inside this band
        this.quad(a, b, c, d, mat, ao, seed, ref);
      }
    }
    for (const [e, on] of [[0, caps[0]], [secs.length - 1, caps[1]]]) if (on) {
      const S = secs[e], inside = cen(secs[e ? e - 1 : 1]);                 // (the neighbouring section: inside the solid)
      for (const [i0, i1, i2] of earClip(S.pts)) this.tri([...S.pts[i0], S.z], [...S.pts[i1], S.z], [...S.pts[i2], S.z], capMat ?? mats.find(x => x != null), ao, seed, inside);
    }
    return this;
  }
  // box with chamfered edges (b = the bevel), centred at cen with half sizes h: the highlight catches every edge
  bevelBox(cen, h, b, mat, ao = 1, seed = 0, capMat){
    b = Math.min(b, 0.45*Math.min(h[0], h[1], h[2]));                      // (a bevel wider than the box folds it inside out)
    const oct = (hx, hy) => [[hx - b, -hy], [hx, -hy + b], [hx, hy - b], [hx - b, hy], [-hx + b, hy], [-hx, hy - b], [-hx, -hy + b], [-hx + b, -hy]]
      .map(([x, y]) => [cen[0] + x, cen[1] + y]);
    const z0 = cen[2] - h[2], z1 = cen[2] + h[2];
    return this.loft([{z: z0, pts: oct(h[0] - b, h[1] - b)}, {z: z0 + b, pts: oct(h[0], h[1])}, {z: z1 - b, pts: oct(h[0], h[1])}, {z: z1, pts: oct(h[0] - b, h[1] - b)}],
      [mat], ao, seed, [true, true], capMat);
  }
  build(){
    const n = this.p.length/3, vb = new Float32Array(n*12), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    let r = 0;
    for (let k = 0; k < n; k++) {
      const o = k*12, x = this.p[k*3], y = this.p[k*3+1], z = this.p[k*3+2];
      vb[o] = x; vb[o+1] = y; vb[o+2] = z; vb[o+3] = this.n[k*3]; vb[o+4] = this.n[k*3+1]; vb[o+5] = this.n[k*3+2];
      vb[o+6] = this.a[k*4]; vb[o+7] = this.a[k*4+1]; vb[o+8] = this.a[k*4+2]; vb[o+9] = this.a[k*4+3]; vb[o+10] = this.uv[k*2]; vb[o+11] = this.uv[k*2+1];
      mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mn[2] = Math.min(mn[2], z); mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); mx[2] = Math.max(mx[2], z);
      r = Math.max(r, Math.hypot(x, y, z));
    }
    return {vb, ib: n > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i), radius: r, tris: this.i.length/3, verts: n, min: mn, max: mx};
  }
}
const SHIP_VSTRIDE = 12;               // floats per vertex

// ------------------------------------------------------------------------------------------ materials and liveries
// Material ids (the vertex's att.x). Each belongs to one of ships.js's three hull programs -- painted surfaces, bare
// metal and glass, and unlit emitters -- so no one shader carries every material (the iGPU occupancy lesson).
const MAT = {HULL: 0, DARK: 1, TRIM: 2, WINDOW: 3, THROAT: 4, HANGAR: 5, EMITTER: 6, SUPER: 7, TILE: 8, GOLD: 9, RAD: 10,
  GLASS: 11, TITAN: 12, HAZARD: 13, COIL: 14, DECAL: 15, LAMP: 16};
const MAT_BUCKET = [0, 0, 0, 2, 2, 2, 2, 0, 0, 1, 1, 1, 1, 0, 1, 0, 2];     // 0 paint, 1 metal + glass, 2 emissive
// Hull lettering: one atlas (ships.js draws it with Canvas2D at boot), rects [u0, v0, u1, v1]; a DECAL quad's att.w picks
// the ink (1 dark on the hull colour, 2 white on black, 3 trim colour on dark)
const DECAL_TEXT = {msv: ['MSV', [0, 0, 0.3125, 0.5]], meinen: ['MEINEN', [0.3125, 0, 1, 0.5]], n01: ['01', [0, 0.5, 0.1875, 1]], nostep: ['NO STEP', [0.1875, 0.5, 0.6875, 1]]};
// Liveries: [hull, dark, trim, engine, windows, accent, flags (portholes, belly tiles, grime), finish (hull roughness,
// its spread, dark-metal roughness)], linear colours. The MEINEN's ceramic is matte like a shuttle's tiles; paint is not.
const LIVERIES = [
  [[0.42, 0.44, 0.47], [0.11, 0.12, 0.14], [0.12, 0.3, 0.72], [0.45, 0.75, 1.6], [1.0, 0.84, 0.62], [0.3, 0.6, 1.0], [1, 0, 0.5], [0.5, 0.2, 0.36]],      // 0 coalition
  [[0.17, 0.16, 0.155], [0.06, 0.058, 0.056], [0.75, 0.3, 0.07], [1.7, 0.62, 0.18], [1.0, 0.55, 0.22], [1.0, 0.18, 0.08], [1, 0, 1], [0.45, 0.25, 0.32]], // 1 dominion
  [[0.66, 0.65, 0.62], [0.1, 0.1, 0.11], [0.9, 0.33, 0.05], [0.5, 0.8, 1.9], [1.0, 0.85, 0.65], [0.95, 0.36, 0.06], [0, 1, 0.35], [0.74, 0.14, 0.4]],   // 2 MSV MEINEN
  [[0.6, 0.58, 0.55], [0.09, 0.09, 0.1], [0.95, 0.36, 0.03], [1.8, 0.7, 0.2], [1.0, 0.35, 0.1], [1.0, 0.5, 0.1], [0, 0, 0.3], [0.55, 0.2, 0.4]],       // 3 target drone
  [[0.62, 0.64, 0.67], [0.1, 0.11, 0.13], [0.1, 0.35, 0.9], [0.45, 0.75, 1.6], [0.6, 0.8, 1.0], [0.3, 0.6, 1.0], [0, 0, 0.3], [0.42, 0.18, 0.34]],     // 4 HAWK
];
const LIV_SLOTS = 8;

// ------------------------------------------------------------------------------------------ hardpoints
// Everything that must sit ON a hull, per class, in ship metres. hit = the hit-ellipsoid half extents (combat.js);
// engines = nozzle exits {p, r} (exhaust along -Z); plume = how they burn {len (m at full throttle), core, outer colours};
// nav = port (+X, red) / starboard (-X, green) lights; rcs = attitude thrusters {p, d (the way the gas leaves)}; shield = the
// class has a shield shell (shellFit; masts above yMax pierce it); plating = armour plating in the hull shader (capitals).
const SHIP_KIT = {
  meinen: {name: 'MSV MEINEN', hit: [13.6, 3.5, 22], livery: [2, 2], panel: 2.4, shield: {yMax: 1e9}, parts: ['meinenDish', 'meinenBellP', 'meinenBellS'],
    muzzles: [[-1.6, -1.45, 18.3], [1.6, -1.45, 18.3]],            // the chin coilguns' tips
    engines: [{p: [6.4, -0.5, -20.65], r: 1.45, part: 'meinenBellP'}, {p: [-6.4, -0.5, -20.65], r: 1.45, part: 'meinenBellS'}],
    plume: {len: 26, core: [2.0, 2.7, 4.2], outer: [0.25, 0.45, 1.6]},
    nav: {port: [13.4, -0.45, -9.05], stbd: [-13.4, -0.45, -9.05]}, strobes: [[0, 3.36, -16.6]],
    rcs: [1, -1].flatMap(s => [{p: [s*1.3, -0.2, 19.0], d: [s, 0, 0]}, {p: [s*1.12, 0.18, 19.0], d: [0, 1, 0]}, {p: [s*1.12, -0.58, 19.0], d: [0, -1, 0]},
      {p: [s*3.4, 0.5, -15.5], d: [s, 0, 0]}, {p: [s*3.2, 0.88, -15.5], d: [0, 1, 0]}, {p: [s*3.2, 0.12, -15.5], d: [0, -1, 0]},
      {p: [s*13.4, -0.08, -12.8], d: [0, 1, 0]}, {p: [s*13.4, -0.82, -12.8], d: [0, -1, 0]}]),
    plasma: [0, 1, 2, 3, 4].map(k => [(k - 2)*1.5, -1.55, 18 - k*2.6]),   // re-entry glow along the belly
    torp: [0, -2.6, 3], vents: [5, 1.2, 14],                         // torpedo release point; the box smoke vents from
    hullCam: [0, 4.9, -13.5]},                                       // flight.js HULL camera, on the dorsal spine
  // the MEINEN's moving parts (ships.js turns them about their pivots; they share its shadow tile and AO volume)
  meinenDish: {name: 'MSV MEINEN', part: true, of: 'meinen', pivot: [1.45, 1.93, -4.5], hit: [2, 2, 2], livery: [2, 2], panel: 2.4},
  meinenBellP: {name: 'MSV MEINEN', part: true, of: 'meinen', pivot: [6.4, -0.5, -17.0], hit: [2, 2, 2], livery: [2, 2], panel: 2.4},
  meinenBellS: {name: 'MSV MEINEN', part: true, of: 'meinen', pivot: [-6.4, -0.5, -17.0], hit: [2, 2, 2], livery: [2, 2], panel: 2.4},
  drone: {name: 'TARGET DRONE', hit: [5, 4.5, 6], livery: [3, 3], panel: 1.5, engines: [{p: [0, 0, -4.6], r: 1.1}], strobes: [[0, 3.1, 0.5]],
    plume: {len: 7, core: [3.2, 1.8, 0.7], outer: [1.2, 0.35, 0.08]}},
  wasp: {name: 'WASP', fighter: true, hit: [6, 5.5, 6], livery: [1, 1], panel: 1.4, guns: [[-2.4, 0, 3.4], [2.4, 0, 3.4]], engines: [{p: [0, 0, -2.95], r: 0.9}],
    plume: {len: 14, core: [4.0, 1.7, 0.6], outer: [1.4, 0.25, 0.05]}},
  hawk: {name: 'HAWK WING', fighter: true, hit: [8, 1.5, 8.5], livery: [4, 4], panel: 1.8, engines: [{p: [1.5, 0, -7.35], r: 0.45}, {p: [-1.5, 0, -7.35], r: 0.45}],
    plume: {len: 11, core: [2.0, 2.6, 4.0], outer: [0.3, 0.5, 1.6]}},
  frigate: {name: 'FRIGATE', hit: [50, 32, 122], livery: [0, 1], panel: 6, plating: true, shield: {yMax: 42}, turretCls: 'turretS', beacons: [[0, 61.5, -70]],
    turrets: [{pivot: [0, 18, 20], tip: [0, 22, 36]}],               // tip = the barrels' ends, trained forward
    pods: [[-52, 0, -40], [52, 0, -40]],
    engines: [{p: [-14, 0, -136], r: 11}, {p: [14, 0, -136], r: 11}],
    plume: {len: 150, core: [3.0, 1.9, 0.9], outer: [1.2, 0.35, 0.08], coal: [[1.8, 2.3, 3.4], [0.25, 0.4, 1.4]]}},
  cruiser: {name: 'CRUISER', hit: [92, 95, 385], livery: [0, 1], panel: 10, plating: true, shield: {yMax: 156}, turretCls: 'turretL', beacons: [[-30, 210, -268], [30, 210, -268]],
    turrets: [0, 1, 2, 3].flatMap(k => [-48, 48].map(x => ({pivot: [x, 62, -150 + k*95], tip: [x, 70, -121 + k*95]}))),
    hangar: [[-88, -15, 30], [88, -15, 30]],
    engines: [{p: [-45, 25, -420], r: 30}, {p: [45, 25, -420], r: 30}, {p: [0, -25, -420], r: 30}],
    plume: {len: 380, core: [3.0, 1.9, 0.9], outer: [1.2, 0.35, 0.08], coal: [[1.8, 2.3, 3.4], [0.25, 0.4, 1.4]]}},
  turretL: {name: 'TURRET', part: true, hit: [9, 9, 9], livery: [0, 1], panel: 4, plating: true},
  turretS: {name: 'TURRET', part: true, hit: [5, 5, 5], livery: [0, 1], panel: 3, plating: true},
  shard: {name: 'DEBRIS', hit: [0.9, 0.4, 1.3], livery: [2, 1], panel: 0.5},
};

// ------------------------------------------------------------------------------------------ designs
// Each design returns a Mesh in metres.
const SHIP_CLASSES = {};

function turret(m, rnd, p, yaw, s, twin){
  m.push().xf(p, yaw);
  m.cyl([0, 0, 0], [0, 0.45*s, 0], 0.9*s, 0.75*s, 10, 1, 0.8, 0);
  m.box([0, 0.75*s, 0.1*s], [0.7*s, 0.35*s, 0.9*s], 0, 0.9, 7);
  const bx = twin ? [-0.28*s, 0.28*s] : [0];
  for (const x of bx) m.cyl([x, 0.8*s, 0.9*s], [x, 0.8*s, 3.2*s], 0.12*s, 0.1*s, 6, 1, 0.9, 0, true, 6);
  m.pop();
}
function engineBell(m, z, x, y, r, len, mat = MAT.DARK){
  m.cyl([x, y, z], [x, y, z - len], r*0.82, r, 16, mat, 0.9, 0, false);
  m.cyl([x, y, z - len*0.98], [x, y, z - len*0.99], r*0.97, r*0.97, 16, 4, 1, 0, true, 4);   // glowing throat
}
// a flat panel on the hull side x = s*x (s = +1 port, -1 starboard), facing outward
function sidePanel(m, s, x, y0, y1, z0, z1, mat){
  m.quad([s*x, y0, z0], [s*x, y0, z1], [s*x, y1, z1], [s*x, y1, z0], mat, 1, 0, [0, (y0 + y1)/2, (z0 + z1)/2]);
}
function windowsStrip(m, z0, z1, x, y, h, side){ sidePanel(m, side, x, y - h/2, y + h/2, z0, z1, 3); }

// ---- the Dominion (and the coalition's hulls in their own livery): layered, chamfered armour, lit decks, beacons ----
// a chamfered octagon section: half width w, belly yb, top yt, chamfer k (of the smaller of width/height)
function oct8(z, w, yb, yt, k = 0.22){ const c = Math.min(w, (yt - yb)/2)*k;
  return {z, pts: [[w - c, yb], [w, yb + c], [w, yt - c], [w - c, yt], [-w + c, yt], [-w, yt - c], [-w, yb + c], [-w + c, yb]]}; }
// A turret: its own part (modelled round its pivot at the origin, trained by combat.js): base ring, a chamfered house,
// twin barrels ending in emitters. s = the scale (the tips sit at [+-0.28 s, 0.8 s, 3.2 s]).
function turretPart(s){
  const m = new Mesh(), T = MAT;
  m.cyl([0, 0, 0], [0, 0.45*s, 0], 0.95*s, 0.8*s, 14, T.DARK, 0.8, 0, true);
  m.bevelBox([0, 0.75*s, 0.1*s], [0.72*s, 0.34*s, 0.95*s], 0.12*s, T.HULL, 0.9, 7);
  m.bevelBox([0, 1.12*s, -0.45*s], [0.38*s, 0.08*s, 0.3*s], 0.03*s, T.SUPER);
  for (const x of [-0.28*s, 0.28*s]) {
    m.lathe([[0.9*s, 0, T.DARK], [0.9*s, 0.13*s, T.DARK, 0, {crease: true}], [3.0*s, 0.1*s, T.EMITTER, 0, {crease: true}], [3.2*s, 0.1*s, T.EMITTER, 0, {crease: true}], [3.2*s, 0, T.EMITTER]], 8, x, 0.8*s);
  }
  return m;
}
SHIP_CLASSES.turretL = () => turretPart(9);
SHIP_CLASSES.turretS = () => turretPart(5);
// the deck the turrets and masts stand on, and a mast with a beacon at its top
function mast(m, p, h, r){ m.cyl(p, V.add(p, [0, h, 0]), r, r*0.5, 6, MAT.DARK, 1, 0, true); m.bevelBox(V.add(p, [0, h, 0]), [r*1.4, r*1.4, r*1.4], r*0.4, MAT.LAMP); }

// ---- capital hulls: stations of armoured sections, belt plates above a trench, stepped superstructure ----
// An armoured section: keel, a sloped lower flank, the armour belt (recessed by `inset`: belt plates stand on it, or dark
// strips close it), an inward ledge -- a long line of shadow with a trench behind it -- a sloped shoulder, the deck.
// w = the belt's half width, yb keel, yt deck; o: kw the keel's and dw the deck's half width (fractions of w), b0/b1 the
// belt's bottom/top and lh the notch's height (fractions of the section's height), L the ledge's depth (m). 14 points from
// the keel's centre round the port (+x) side to the deck's centre and down the starboard side; ARM_BAND names the bands.
const ARM_BAND = {keel: [0, 13], flank: [1, 12], belt: [2, 11], ledge: [3, 10], trench: [4, 9], shoulder: [5, 8], deck: [6, 7]};
function armSec(z, w, yb, yt, o = {}){
  const h = yt - yb, ins = o.inset ?? 0.5, L = clamp(o.L ?? 0.07*w, ins + 0.3, 0.35*w);
  const b0 = yb + (o.b0 ?? 0.22)*h, b1 = yb + (o.b1 ?? 0.56)*h, l1 = b1 + (o.lh ?? 0.08)*h, kw = (o.kw ?? 0.5)*w, dw = Math.min((o.dw ?? 0.62)*w, w - L - 0.2);
  const half = [[kw, yb], [w - ins, b0], [w - ins, b1], [w - L, b1], [w - L, l1], [dw, yt]];
  return {z, w, yb, yt, ins, L, b0, b1, l1, dw, pts: [[0, yb], ...half, [0, yt], ...half.slice().reverse().map(([x, y]) => [-x, y])]};
}
// the 14 band materials of an armoured loft; the belt band stays open (belt plates and strips close it)
function armMats(o = {}){
  const m = [];
  for (const [k, mat] of [['keel', MAT.DARK], ['flank', MAT.HULL], ['belt', null], ['ledge', MAT.DARK], ['trench', MAT.DARK], ['shoulder', MAT.HULL], ['deck', MAT.SUPER]])
    for (const j of ARM_BAND[k]) m[j] = k in o ? o[k] : mat;
  return m;
}
// an armoured hull's stations at z (linear, as the loft is): belt line x, belt bottom/top, ledge x, notch top, deck height
// and half width
function armAt(st, z){
  let i = 0; while (i < st.length - 2 && z > st[i + 1].z) i++;
  const a = st[i], b = st[i + 1], t = clamp((z - a.z)/(b.z - a.z), 0, 1), l = k => a[k] + (b[k] - a[k])*t;
  return {x: l('w') - l('ins'), b0: l('b0'), b1: l('b1'), xl: l('w') - l('L'), l1: l('l1'), yt: l('yt'), dw: l('dw')};
}
// a run [z0, z1] cut at every station inside it: plates, strips and conduits break there, so each follows the taper exactly
function armCuts(st, z0, z1){ return [z0, ...st.map(q => q.z).filter(z => z > z0 + 0.01 && z < z1 - 0.01), z1]; }
// the belt's height split into `rows` strakes: strake r's bottom and top at z (seams hg wide between strakes)
function armRow(A, r, rows, hg){ const h = (A.b1 - A.b0)/rows; return [A.b0 + h*r + (r ? hg : 0), A.b0 + h*(r + 1) - (r < rows - 1 ? hg : 0)]; }
// a dark strip closing the belt line on side s (+1 port, -1 starboard) between za and zb (inside one station interval),
// over strake r of `rows` (r < 0: the whole belt; `seam`: the seam above strake r)
function armStrip(m, st, s, za, zb, r = -1, rows = 1, hg = 0, seam = false){
  if (zb - za < 1e-3) return;
  const A = armAt(st, za), B = armAt(st, zb), span = Q => r < 0 ? [Q.b0, Q.b1] : seam ? [armRow(Q, r, rows, hg)[1], armRow(Q, r + 1, rows, hg)[0]] : armRow(Q, r, rows, hg);
  const [a0, a1] = span(A), [c0, c1] = span(B);
  m.quad([s*A.x, a0, za], [s*B.x, c0, zb], [s*B.x, c1, zb], [s*A.x, a1, za], MAT.DARK, 0.4, 0, [0, (a0 + a1)/2, (za + zb)/2]);
}
function beltStrip(m, st, s, z0, z1){ const c = armCuts(st, z0, z1); for (let i = 0; i < c.length - 1; i++) armStrip(m, st, s, c[i], c[i + 1]); }
// Belt armour on side s over [z0, z1]: `rows` strakes of plates about len long, standing t proud of the recessed belt line,
// chamfered, gap apart, each strake's joints staggered half a plate from the one below; the gaps, the seams between
// strakes, short station intervals and any slot touching a skip range (a hangar) are closed by dark strips instead.
function beltPlates(m, st, s, z0, z1, len, gap, t, skip = [], rows = 1){
  const c = Math.min(t*0.45, 1.4), cuts = armCuts(st, z0, z1), hg = gap*0.25;
  const sec = (z, o, r) => { const A = armAt(st, z), [y0, y1] = armRow(A, r, rows, hg), x = s*A.x, xo = s*(A.x + t - o);
    return {z, pts: [[x, y0], [xo, y0 + c], [xo, y1 - c], [x, y1]]}; };
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1], n = Math.max(1, Math.round((b - a)/(len + gap))), pl = (b - a)/n;
    if (b - a < len*0.5 || skip.some(([u, v]) => b > u && a < v && v - u >= b - a)) { armStrip(m, st, s, a, b); continue; }   // (all strip)
    for (let r = 1; r < rows; r++) armStrip(m, st, s, a, b, r - 1, rows, hg, true);                                        // strake seams
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? pl/2 : 0;
      for (let k = off ? -1 : 0; k < n; k++) {
        const p0 = Math.max(a, a + off + k*pl), p1 = Math.min(b, a + off + (k + 1)*pl), za = p0 + gap/2, zb = p1 - gap/2;
        if (p1 - p0 < 1e-3) continue;
        if (zb - za < 2*c + 0.5 || skip.some(([u, v]) => zb > u && za < v)) { armStrip(m, st, s, p0, p1, r, rows, hg); continue; }
        armStrip(m, st, s, p0, za, r, rows, hg); armStrip(m, st, s, zb, p1, r, rows, hg);
        const e = Math.min(c, (zb - za)*0.2);
        m.loft([sec(za, c, r), sec(za + e, 0, r), sec(zb - e, 0, r), sec(zb, c, r)], [MAT.HULL, MAT.HULL, MAT.HULL, null], 0.95, (k*37 + i*11 + r*101) & 255);
      }
    }
  }
}
// the trench behind the ledge on side s over [z0, z1]: a conduit (radius r) along the ledge against the trench wall, and
// ribs across the notch every `every` metres (per-vertex ao: the AO volume's voxels are several metres on a capital)
function trenchDetail(m, st, s, z0, z1, r, every){
  const cuts = armCuts(st, z0, z1);
  for (let i = 0; i < cuts.length - 1; i++) {
    const A = armAt(st, cuts[i]), B = armAt(st, cuts[i + 1]);
    m.cyl([s*(A.xl + r*1.15), A.b1 + r, cuts[i]], [s*(B.xl + r*1.15), B.b1 + r, cuts[i + 1]], r, r, 8, MAT.DARK, 0.55, 0, true);
  }
  for (let z = z0 + every/2; z < z1 - every*0.3; z += every) {
    const A = armAt(st, z), d = A.x - A.xl, hgt = (A.l1 - A.b1)*0.85;
    if (d > 0.2) m.box([s*(A.xl + d/2), A.b1 + hgt/2, z], [d/2, hgt/2, Math.max(0.25, every*0.05)], MAT.SUPER, 0.6, 0);
  }
}
// A superstructure tier: a block with sloped sides (half width wb at y0 -> wt at y1) over [z0, z1] whose front is raked
// back by `rake` metres over its upper two thirds. mats: [port side, top, starboard side] (its buried bottom stays open).
function tier(m, z0, z1, wb, wt, y0, y1, rake, mats, seed){
  const tr = (wB, wT, yT) => [[wB, y0], [wT, yT], [-wT, yT], [-wB, y0]], yk = y0 + (y1 - y0)*0.35, wk = wb + (wt - wb)*0.35;
  m.loft([{z: z0, pts: tr(wb, wt, y1)}, {z: z1 - rake, pts: tr(wb, wt, y1)}, {z: z1, pts: tr(wb, wk, yk)}], [...mats, null], 1, seed);
}
// a band of lit windows on a tier's sloped side s: centred at fraction f up the side, hh metres high, over [z0, z1]
function tierWindows(m, s, z0, z1, wb, wt, y0, y1, f, hh){
  const sx = wt - wb, sy = y1 - y0, l = Math.hypot(sx, sy), nx = sy/l, ny = -sx/l, P = k => [s*(wb + sx*k + nx*0.12), y0 + sy*k + ny*0.12];
  const a = P(f - hh/l), b = P(f + hh/l);
  m.quad([a[0], a[1], z0], [a[0], a[1], z1], [b[0], b[1], z1], [b[0], b[1], z0], MAT.WINDOW, 1, 0, [0, (y0 + y1)/2, (z0 + z1)/2]);
}
// greebles standing on an armoured hull's deck (at its height where each one lands)
function deckGreebles(m, rnd, st, x0, x1, z0, z1, n, size, mats){
  for (let k = 0; k < n; k++) { const x = x0 + rnd()*(x1 - x0), z = z0 + rnd()*(z1 - z0);
    m.greeble(rnd, [x, armAt(st, z).yt + 0.02, z], [1, 0, 0], [0, 0, 1], 0.01, 0.01, [0, 1, 0], 1, size, mats, 0.6); }
}
// Fittings on the sloped shoulder of side s, fraction t up it from the trench, at each z: fn(m) builds one in a local frame
// whose +y is the shoulder's outward normal (+z along the hull).
function onShoulder(m, st, s, zs, t, fn){
  for (const z of zs) {
    const A = armAt(st, z), dx = A.dw - A.xl, dy = A.yt - A.l1, l = Math.hypot(dx, dy), nx = dy/l, ny = -dx/l;
    m.push().xf([s*(A.xl + dx*t), A.l1 + dy*t, z], 0, 0, Math.atan2(-s*nx, ny)); fn(m); m.pop();
  }
}
// a point-defence mount (scale k): a ring, a small house, twin barrels with emitter tips
function pdMount(m, k){
  m.cyl([0, 0, 0], [0, 0.9*k, 0], 2.2*k, 1.9*k, 10, MAT.DARK, 0.8, 0, true);
  m.bevelBox([0, 1.5*k, 0.2*k], [1.3*k, 0.65*k, 1.6*k], 0.25*k, MAT.HULL, 0.9, 5);
  for (const x of [-0.45*k, 0.45*k]) m.cyl([x, 1.55*k, 1.6*k], [x, 1.55*k, 5.2*k], 0.18*k, 0.16*k, 6, MAT.DARK, 0.9, 0, true, MAT.EMITTER);
}
// running lights along the deck edges (LAMP: the livery's accent colour), at the given stations
function deckLamps(m, st, zs, r){ for (const z of zs) { const A = armAt(st, z); for (const s of [-1, 1]) m.bevelBox([s*(A.dw - r), A.yt + r*0.6, z], [r, r*0.6, r], r*0.25, MAT.LAMP); } }
// an engine collar round a bell's root (lathe: inner wall, rear rim, outer wall), r0..r1 the inner/outer radius
function engineCollar(m, x, y, z0, z1, r0, r1){
  m.lathe([[z0 - 1, r0, MAT.DARK], [z1, r0 + 0.3, MAT.DARK, 0, {crease: true}], [z1, r1, MAT.DARK, 0, {crease: true}], [z0 + 1, r1 + 0.6, MAT.DARK]], 20, x, y, 0.8, 0);
}

// Cruiser, 800 m: armoured stations -- an engine block, a narrow waist under the command tower, the raised citadel with the
// turret deck, a long tapering fore-hull, a ram bow -- belted with armour plates above a trench. Barbettes under the
// turrets, a stepped tower (lit tiers, a raked bridge with wings, a sensor dome, beacon masts), flank hangar bays (they
// flare when fighters launch), radiator fins on the engine deck, engine collars, running lights, a keel, three bells.
SHIP_CLASSES.cruiser = () => {
  const m = new Mesh(), T = MAT, rnd = mulberry(3003);
  const st = [armSec(-380, 80, -58, 56, {L: 7}), armSec(-300, 82, -60, 58, {L: 7}), armSec(-286, 66, -50, 44, {L: 5}), armSec(-214, 66, -50, 44, {L: 5}),
    armSec(-196, 86, -64, 62, {L: 7.5}), armSec(110, 86, -64, 62, {L: 7.5}), armSec(170, 77, -60, 56, {L: 6.5}), armSec(260, 52, -50, 40, {L: 4.5}),
    armSec(330, 26, -40, 22, {L: 2.4, b1: 0.5}), armSec(372, 5, -26, 4, {L: 0.8, inset: 0.3})];
  m.decal = 5;                                                      // (att.w 5: lit windows allowed -- not on the belt plates)
  m.loft(st, armMats(), 1, 41, [true, true], T.DARK);
  // command tower on the waist: stepped tiers, lit window bands, the raked bridge and its wings, a sensor dome
  tier(m, -300, -204, 40, 32, 40, 96, 14, [T.HULL, T.SUPER, T.HULL], 44);
  tier(m, -292, -218, 29, 23, 96, 124, 10, [T.HULL, T.SUPER, T.HULL], 45);
  tier(m, -284, -234, 22, 20, 124, 140, 6, [T.SUPER, T.HULL, T.SUPER], 46);
  m.decal = 0;
  m.bevelBox([0, 131, -252], [50, 3.2, 7], 1.2, T.SUPER);
  m.quad([-17, 131, -234.7], [17, 131, -234.7], [16.6, 137, -238.2], [-16.6, 137, -238.2], T.WINDOW, 1, 0, [0, 130, -262]);   // bridge windows, on the rake
  m.push().xf([0, 140, -262], 0, -Math.PI/2).lathe([[0, 9, T.HULL], [3, 8.5, T.HULL], [6, 6.5, T.HULL], [8.2, 3.5, T.HULL], [9, 0, T.HULL]], 18, 0, 0, 1, 0).pop();
  for (const s of [-1, 1]) {
    beltPlates(m, st, s, -380, 318, 36, 3, 2.6, [[-4, 64]], 2); beltStrip(m, st, s, 318, 372);
    trenchDetail(m, st, s, -376, 300, 1.4, 14);
    // hangar bay: a lit mouth on the recessed belt line between trims (SHIP_KIT.cruiser.hangar)
    const H = armAt(st, 30);
    m.quad([s*(H.x + 0.08), -34, 2], [s*(H.x + 0.08), -34, 58], [s*(H.x + 0.08), 3, 58], [s*(H.x + 0.08), 3, 2], T.HANGAR, 1, 0, [0, -15, 30]);
    m.bevelBox([s*(H.x + 1.2), 5.2, 30], [1.4, 1.2, 31], 0.4, T.TRIM); m.bevelBox([s*(H.x + 1.2), -36.2, 30], [1.4, 1.2, 31], 0.4, T.TRIM);
    tierWindows(m, s, -296, -212, 40, 32, 40, 96, 0.62, 2.5); tierWindows(m, s, -296, -212, 40, 32, 40, 96, 0.3, 1.8);
    tierWindows(m, s, -288, -222, 29, 23, 96, 124, 0.5, 2.2);
    m.quad([s*50.2, 129.2, -258], [s*50.2, 129.2, -246], [s*50.2, 132.8, -246], [s*50.2, 132.8, -258], T.WINDOW, 1, 0, [0, 131, -252]);   // wing ends
    mast(m, [s*30, 140, -268], 70, 2.4);
    for (let k = 0; k < 3; k++) m.box([s*(22 + k*9), 57 + 7, -338], [0.6, 7, 30], T.RAD, 0.85, 0);                                     // radiator fins
    // the shoulders: point-defence mounts, access hatches and vents between them
    onShoulder(m, st, s, [-168, -98, -28, 42, 112, 182, 246], 0.52, q => pdMount(q, 2.2));
    onShoulder(m, st, s, [-360, -330, -133, -63, 7, 77, 147, 214, 276], 0.3, q => q.bevelBox([0, 0.25, 0], [4.5, 0.45, 7], 0.3, T.SUPER, 0.8, 0));
    onShoulder(m, st, s, [-345, -150, -80, -10, 60, 130, 200], 0.78, q => { for (let k = 0; k < 4; k++) q.box([0, 0.3, (k - 1.5)*2.4], [2.6, 0.35, 0.7], T.DARK, 0.6, 0); });
  }
  for (const q of SHIP_KIT.cruiser.turrets) { const p = q.pivot, A = armAt(st, p[2]);                                                  // barbettes
    m.cyl([p[0], A.yt - 1, p[2]], [p[0], p[1] - 0.3, p[2]], 11.5, 10.8, 18, T.DARK, 0.8, 0, true);
    m.cyl([p[0], p[1] - 1.1, p[2]], [p[0], p[1] - 0.4, p[2]], 11.9, 11.9, 18, T.TRIM, 1, 0, false); }
  for (const [x, y] of [[-45, 25], [45, 25], [0, -25]]) {
    engineCollar(m, x, y, -380, -392, 30.6, 33.5);
    m.decal = 1; m.lathe([[-381, 0, T.THROAT, 0], [-381, 22, T.THROAT, 0.3], [-418, 29, T.TITAN, 1, {crease: true}], [-414, 32, T.TITAN, 0.8], [-380, 26, T.TITAN, 0.3]], 20, x, y); m.decal = 0;
  }
  // the keel, buried in the hull's flat bottom
  const trap = (wb, wt, yb, yt) => [[wb, yb], [wt, yt], [-wt, yt], [-wb, yb]];
  m.loft([{z: -340, pts: trap(16, 26, -92, -55)}, {z: 190, pts: trap(12, 20, -84, -54)}, {z: 300, pts: trap(2.5, 4, -50, -40)}], [T.DARK, null, T.DARK, T.SUPER], 0.85, 43, [true, true], T.DARK);
  deckGreebles(m, rnd, st, -33, 33, -188, 104, 60, 7, [T.DARK, T.SUPER, T.HULL]);
  deckGreebles(m, rnd, st, -14, 14, -372, -306, 14, 5, [T.DARK, T.SUPER]);
  deckLamps(m, st, [-360, -250, -140, -30, 80, 190, 290], 1.1);
  return m;
};
// Frigate / missile boat, 250 m: an armoured dagger hull belted with plates above a trench, flank missile pods on pylons
// (lit hatches), a stepped bridge with a beacon mast, a barbette under the turret, a keel fin, engine collars, radiator
// fins, running lights.
SHIP_CLASSES.frigate = () => {
  const m = new Mesh(), T = MAT, rnd = mulberry(4004);
  const st = [armSec(-120, 24, -15, 15, {L: 2.4}), armSec(-72, 27, -18, 18, {L: 2.6}), armSec(-20, 26, -17, 17, {L: 2.6}), armSec(30, 22, -15, 16, {L: 2.2}),
    armSec(82, 13, -10, 9, {L: 1.3, b1: 0.52}), armSec(124, 2, -3, 1, {L: 0.4, inset: 0.15})];
  m.decal = 5;                                                      // (att.w 5: lit windows allowed -- not on the belt plates)
  m.loft(st, armMats(), 1, 51, [true, true], T.DARK);
  tier(m, -86, -40, 15, 12, 14, 30, 6, [T.HULL, T.SUPER, T.HULL], 54);
  tier(m, -80, -52, 10, 8, 30, 39.5, 4, [T.SUPER, T.HULL, T.SUPER], 56);
  m.decal = 0;
  m.quad([-9.8, 31, -52.4], [9.8, 31, -52.4], [9.2, 36.5, -54.7], [-9.2, 36.5, -54.7], T.WINDOW, 1, 0, [0, 34, -66]);                   // bridge windows, on the rake
  for (const s of [-1, 1]) {
    beltPlates(m, st, s, -120, 84, 15, 1.1, 1.0, [], 2); beltStrip(m, st, s, 84, 124);
    trenchDetail(m, st, s, -118, 76, 0.5, 6.5);
    // missile pod on two pylons: an armoured body tapering to a chamfered nose and tail, two rows of launch doors down its
    // outer face with a lit slit each (SHIP_KIT.frigate.pods launch from there), a battery of hatches on top
    const pod = (z, w, h, k) => { const S = oct8(z, w, -h, h, k); return {z, pts: S.pts.map(([x, y]) => [x + s*42, y])}; };
    m.loft([pod(-100, 5, 8, 0.45), pod(-90, 10, 14, 0.32), pod(16, 10, 14, 0.32), pod(30, 7, 10, 0.4), pod(38, 2.5, 4, 0.45)],
      [T.DARK, T.SUPER, T.HULL, T.SUPER, T.HULL, T.SUPER, T.DARK, T.DARK], 0.85, 53);
    for (const z of [-66, -2]) m.bevelBox([s*29.5, 0, z], [4.2, 3.2, 8], 0.8, T.SUPER, 0.8);
    for (let k = 0; k < 10; k++) { const y = k%2 ? 6 : -6, z = -78 + Math.floor(k/2)*21;
      m.box([s*52.2, y, z], [0.45, 4.4, 8.2], T.SUPER, 0.85, 0); m.box([s*52.62, y, z], [0.1, 0.28, 6.8], T.EMITTER, 1, 0); }
    for (let k = 0; k < 12; k++) m.box([s*(42 + (k%2 ? 3.4 : -3.4)), 14.25, -80 + Math.floor(k/2)*16], [2.7, 0.35, 2.7], T.DARK, 0.7, 0);
    tierWindows(m, s, -84, -44, 15, 12, 14, 30, 0.55, 1.6);
    for (let k = 0; k < 3; k++) m.box([s*(4 + k*4), 16.2 + 3, -102], [0.25, 3, 12], T.RAD, 0.85, 0);                                    // radiator fins
  }
  const tp = SHIP_KIT.frigate.turrets[0].pivot, A = armAt(st, tp[2]);                                                                 // the barbette
  m.cyl([tp[0], A.yt - 0.5, tp[2]], [tp[0], tp[1] - 0.2, tp[2]], 6.4, 6, 16, T.DARK, 0.8, 0, true);
  m.cyl([tp[0], tp[1] - 0.7, tp[2]], [tp[0], tp[1] - 0.25, tp[2]], 6.6, 6.6, 16, T.TRIM, 1, 0, false);
  m.hex([[-1.2, -15, -100], [-1.2, -15, 20], [-1.2, -34, -96], [-1.2, -34, -40], [1.2, -15, -100], [1.2, -15, 20], [1.2, -34, -96], [1.2, -34, -40]], T.SUPER, 0.9, 55);
  mast(m, [0, 39.5, -70], 22, 1.1);
  for (const x of [-14, 14]) {
    engineCollar(m, x, 0, -120, -128, 11, 12.4);
    m.decal = 1; m.lathe([[-120.5, 0, T.THROAT, 0], [-120.5, 8, T.THROAT, 0.3], [-135.6, 10.6, T.TITAN, 1, {crease: true}], [-134, 11.6, T.TITAN, 0.8], [-120, 9.5, T.TITAN, 0.3]], 16, x, 0); m.decal = 0;
  }
  deckGreebles(m, rnd, st, -10, 10, -36, 8, 18, 2.6, [T.DARK, T.SUPER]);
  deckGreebles(m, rnd, st, -8, 8, 36, 74, 10, 2, [T.DARK, T.SUPER]);
  deckLamps(m, st, [-110, -20, 60], 0.5);
  return m;
};
// Dominion fighter WASP, 12 m: a hexagonal pod with a red sensor eye, two tall forward-swept blade wings with amber edges.
SHIP_CLASSES.wasp = () => {
  const m = new Mesh(), T = MAT;
  const hx = (z, r) => ({z, pts: [0, 1, 2, 3, 4, 5].map(k => [Math.cos(k*Math.PI/3 + Math.PI/6)*r, Math.sin(k*Math.PI/3 + Math.PI/6)*r*0.85])});
  m.loft([hx(-2.4, 0.95), hx(-1.7, 1.38), hx(1.3, 1.3), hx(2.8, 0.85), hx(3.55, 0.32)], [T.DARK, T.SUPER, T.DARK, T.SUPER, T.DARK, T.SUPER], 1, 0, [true, true], T.DARK);
  m.bevelBox([0, 0, 3.5], [0.3, 0.2, 0.1], 0.05, T.LAMP);
  m.bevelBox([0, 0.95, 0.7], [0.45, 0.22, 0.85], 0.1, T.GLASS);
  for (const s of [-1, 1]) {
    m.bevelBox([s*2.0, 0, -0.3], [0.8, 0.2, 0.42], 0.06, T.DARK);
    m.hex([[s*2.9, -4.6, -2.1], [s*2.9, -4.6, -0.5], [s*2.9, 4.6, -1.3], [s*2.9, 4.6, 0.7], [s*3.2, -4.6, -2.1], [s*3.2, -4.6, -0.5], [s*3.2, 4.6, -1.3], [s*3.2, 4.6, 0.7]], T.SUPER, 1, 71);
    m.hex([[s*2.87, -4.6, -0.62], [s*2.87, -4.6, -0.42], [s*2.87, 4.6, 0.58], [s*2.87, 4.6, 0.78], [s*3.23, -4.6, -0.62], [s*3.23, -4.6, -0.42], [s*3.23, 4.6, 0.58], [s*3.23, 4.6, 0.78]], T.TRIM, 1, 0);
    m.lathe([[0.2, 0, T.DARK], [0.2, 0.2, T.DARK, 0, {crease: true}], [3.2, 0.14, T.EMITTER, 0, {crease: true}], [3.4, 0.12, T.EMITTER, 0, {crease: true}], [3.4, 0, T.EMITTER]], 8, s*2.4, 0);
  }
  m.decal = 1; m.lathe([[-2.45, 0, T.THROAT, 0], [-2.45, 0.55, T.THROAT, 0.3], [-2.95, 0.88, T.TITAN, 1, {crease: true}], [-2.9, 0.98, T.TITAN, 0.8], [-2.4, 0.8, T.TITAN, 0.3]], 12, 0, 0); m.decal = 0;
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

// Target drone for the range (combat.js): an octagonal body under a sensor dome, four swept fins, a hazard-orange band
// and nose, 11 m, in its own livery.
SHIP_CLASSES.drone = () => {
  const m = new Mesh();
  m.cyl([0, 0, -3.2], [0, 0, 3.0], 2.2, 2.0, 8, 0, 1, 81);                          // body
  m.cyl([0, 0, 3.0], [0, 0, 4.7], 2.0, 0.8, 8, 2, 1, 82);                           // nose cone
  m.cyl([0, 0, -1.1], [0, 0, 0.3], 2.32, 2.32, 8, 2, 1, 83, false);                 // band
  m.cyl([0, 1.9, 0.5], [0, 2.8, 0.5], 0.95, 0.5, 8, 1, 1, 0);                        // sensor dome
  for (let k = 0; k < 4; k++) {
    const a = k*Math.PI/2 + Math.PI/4, c = Math.cos(a), s = Math.sin(a), cs = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      const r = y ? 4.8 : 1.9, zz = y ? (z ? -2.3 : -3.6) : (z ? -0.5 : -3.1), th = (x ? 0.13 : -0.13)*(y ? 0.5 : 1);
      cs.push([c*r - s*th, s*r + c*th, zz]);
    }
    m.hex(cs, 1, 1, 84 + k);
  }
  engineBell(m, -3.2, 0, 0, 1.1, 1.4);
  return m;
};

// A shard of hull (combat.js debris, instanced at any scale): an irregular slab with one molten face (weapon-emitter
// material, so the instance's glow sets how hot it still is), about 2 units long.
SHIP_CLASSES.shard = () => {
  const m = new Mesh(), R = mulberry(9091), j = k => (R() - 0.5)*k, c = [];
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++)
    c.push([(x ? 0.62 : -0.62) + j(0.5), (y ? 0.22 : -0.22) + j(0.16), (z ? 1 : -1) + j(0.6)]);
  m.hex(c, 0, 0.9, 91, 'f');
  m.quad(c[1], c[5], c[7], c[3], 6, 1, 0, [0, 0, 0]);                                // the torn end, still glowing
  return m;
};

// MSV MEINEN, the family's deep-survey ship, 44 m, NASA-punk: a lofted lifting body (white ceramic above, black heat tiles
// below, an orange stripe on each chine), a wraparound canopy, a dorsal equipment spine, twin nacelles on gold-foil
// pylons (orange intake lips, a gold wrap, a burnt-titanium engine section), black radiator wings out to wingtip pods, a
// small tail fin carrying the strobe, chin coilguns ringed with coils, RCS blocks, a docking collar. Its survey dish and
// its two nozzles are PARTS (meinenDish, meinenBellP/S): modelled here in ship space at rest, turned by ships.js.
const MEINEN_ST = [[-17, 2.9, -1.15, -0.3, 1.0, 1.5], [-12, 3.5, -1.4, -0.25, 1.25, 1.85], [-3, 3.8, -1.55, -0.2, 1.35, 2.0],
  [5, 3.5, -1.55, -0.25, 1.3, 1.95], [11, 2.8, -1.45, -0.3, 1.1, 1.6], [16, 2.0, -1.25, -0.35, 0.75, 1.1],
  [20, 1.15, -0.95, -0.38, 0.35, 0.6], [23.2, 0.32, -0.62, -0.42, -0.12, 0.06]];   // z, half width, belly, chine, shoulder, crown
function meinenAt(z, k){                                  // a station value (k: 1 half width .. 5 crown), linear in z
  const S = MEINEN_ST; if (z <= S[0][0]) return S[0][k];
  for (let i = 1; i < S.length; i++) if (z <= S[i][0]) { const a = S[i - 1], b = S[i], t = (z - a[0])/(b[0] - a[0]); return a[k] + (b[k] - a[k])*t; }
  return S[S.length - 1][k];
}
const MEINEN_NAC = 6.4, MEINEN_NY = -0.5, MEINEN_DISH = [1.45, 1.93, -4.5];   // nacelle x (+-) and y; the dish mast's foot
SHIP_CLASSES.meinen = () => {
  const m = new Mesh(), T = MAT, rnd = mulberry(5150);
  const sec = ([z, w, yb, yc, ys, yt]) => { const half = [[0.78*w, yb], [w, yb + 0.3*(yc - yb)], [w, yc], [0.92*w, yc + 0.22], [0.72*w, ys], [0.35*w, yt - 0.04]];
    return {z, pts: [[0, yb], ...half, [0, yt], ...half.slice().reverse().map(([x, y]) => [-x, y])]}; };
  m.loft(MEINEN_ST.map(sec), [T.TILE, T.TILE, T.DARK, T.TRIM, T.HULL, T.HULL, T.HULL, T.HULL, T.HULL, T.HULL, T.TRIM, T.DARK, T.TILE, T.TILE], 1, 71, [true, true], T.DARK);
  const crown = z => meinenAt(z, 5);
  // canopy: glass on a low frame, a centre bar and sills
  const cz = [[7.2, 1.7, 0.9, 0.0], [8.7, 2.15, 1.3, 0.5], [12.2, 1.95, 1.05, 0.44], [14.6, 1.1, 0.4, 0.03]];
  m.loft(cz.map(([z, bw, tw, hh]) => { const y0 = crown(z) - 0.08; return {z, pts: [[-bw/2, y0], [bw/2, y0], [tw/2, y0 + hh], [-tw/2, y0 + hh]]}; }), [T.GLASS], 1, 0, [true, true], T.GLASS);
  m.bevelBox([0, crown(10.4) + 0.43, 10.4], [0.07, 0.05, 1.8], 0.02, T.HULL);
  for (const s of [-1, 1]) m.bevelBox([s*0.98, crown(10.4) - 0.02, 10.6], [0.07, 0.06, 1.9], 0.02, T.HULL);
  // dorsal spine: white top, dark flanks, conduits, vents
  const sp = z => { const y0 = crown(z) - 0.06, w = 0.95 - 0.25*(z + 15.5)/19.5; return {z, pts: [[-w, y0], [w, y0], [w*0.78, y0 + 0.55], [-w*0.78, y0 + 0.55]]}; };
  m.loft([sp(-15.5), sp(-8), sp(4)], [T.DARK, T.DARK, T.HULL, T.DARK], 1, 74);
  for (const s of [-1, 1]) m.cyl([s*0.98, crown(-15) + 0.18, -15], [s*0.86, crown(3) + 0.18, 3], 0.09, 0.09, 6, T.TITAN, 1, 0, true);
  for (let k = 0; k < 5; k++) m.bevelBox([0, crown(-13 + k*3.6) + 0.52, -13 + k*3.6], [0.42, 0.08, 0.6], 0.03, k & 1 ? T.DARK : T.HULL);
  m.cyl([0, crown(-10) + 0.5, -10], [0, crown(-10) + 1.9, -10], 0.04, 0.02, 5, T.DARK, 1, 0, true);                // whip antenna
  // the dish mast's turntable (the dish itself is a part)
  m.cyl(MEINEN_DISH, V.add(MEINEN_DISH, [0, 0.22, 0]), 0.5, 0.45, 14, T.DARK, 0.9, 0, true);
  // docking collar and its hazard ring
  m.cyl([0, crown(1.5) - 0.05, 1.5], [0, crown(1.5) + 0.2, 1.5], 0.78, 0.74, 18, T.DARK, 1, 0, true);
  m.cyl([0, crown(1.5) + 0.2, 1.5], [0, crown(1.5) + 0.26, 1.5], 0.74, 0.74, 18, T.HAZARD, 1, 0, true);
  // nacelles on gold-foil pylons: rear cap, titanium engine section, gold wrap, ceramic, the orange intake lip, the fan
  for (const s of [-1, 1]) {
    m.lathe([[-17.0, 0.0, T.DARK], [-17.0, 1.2, T.DARK, 0, {crease: true}], [-16.4, 1.4, T.TITAN, 0.35, {crease: true}], [-13.8, 1.56, T.TITAN, 0.9],
      [-10.0, 1.62, T.HULL, 0, {crease: true}], [-9.8, 1.68, T.GOLD, 0, {crease: true}], [-4.2, 1.68, T.HULL, 0, {crease: true}], [-4.0, 1.63, T.HULL, 0, {crease: true}],
      [1.8, 1.58, T.TRIM, 0, {crease: true}], [2.4, 1.4, T.TRIM], [2.55, 1.0, T.DARK, 0, {crease: true}], [1.9, 0.95, T.DARK, 0, {crease: true}], [1.9, 0.0, T.DARK]],
      22, s*MEINEN_NAC, MEINEN_NY, 1, 76);
    m.lathe([[1.95, 0.0, T.DARK], [1.95, 0.35, T.DARK], [2.35, 0.0, T.DARK]], 12, s*MEINEN_NAC, MEINEN_NY);   // spinner
    m.bevelBox([s*4.85, -0.72, -7.4], [1.35, 0.3, 4.1], 0.1, T.GOLD, 0.9, 75);                                       // pylon
    m.bevelBox([s*4.85, -0.72, -3.15], [1.35, 0.32, 0.22], 0.08, T.HULL);
    // radiator wing, its white leading edge and dark trailing edge, and the wingtip pod
    m.hex([[s*7.8, -0.56, -13.5], [s*7.8, -0.56, -3.5], [s*7.8, -0.34, -13.5], [s*7.8, -0.34, -3.5],
           [s*13.2, -0.52, -15.2], [s*13.2, -0.52, -10.5], [s*13.2, -0.38, -15.2], [s*13.2, -0.38, -10.5]], T.RAD, 1, 77);
    const le = [s*10.5, -0.45, -7.0], ld = [s*5.4, 0, -7.0], ll = V.len(ld), te = [s*10.5, -0.45, -14.35], td = [s*5.4, 0, -1.7], tl = V.len(td);
    m.push().xf(le, Math.atan2(ld[0], ld[2])).bevelBox([0, 0, 0], [0.2, 0.13, ll/2], 0.05, T.HULL).pop();
    m.push().xf(te, Math.atan2(td[0], td[2])).bevelBox([0, 0, 0], [0.12, 0.12, tl/2], 0.04, T.DARK).pop();
    m.lathe([[-15.8, 0.0, T.DARK], [-15.8, 0.22, T.HULL, 0, {crease: true}], [-15.4, 0.34, T.HULL], [-10.4, 0.34, T.TRIM, 0, {crease: true}], [-9.4, 0.12, T.TRIM], [-9.1, 0.0, T.TRIM]],
      12, s*13.4, -0.45, 1, 0);
    // chin coilgun: barrel, coils, rails, the emitter tip (SHIP_KIT.meinen.muzzles), and its mount under the belly
    m.lathe([[8.8, 0.0, T.DARK], [8.8, 0.3, T.DARK, 0, {crease: true}], [17.7, 0.26, T.EMITTER, 0, {crease: true}], [18.3, 0.24, T.EMITTER, 0, {crease: true}], [18.3, 0.0, T.EMITTER]],
      12, s*1.6, -1.45, 0.95, 0);
    for (let k = 0; k < 6; k++) m.cyl([s*1.6, -1.45, 10.4 + k*1.1], [s*1.6, -1.45, 10.75 + k*1.1], 0.37, 0.37, 12, T.COIL, 1, 0, true);
    for (const y of [0.36, -0.36]) m.bevelBox([s*1.6, -1.45 + y, 13.3], [0.07, 0.05, 4.4], 0.02, T.DARK);
    m.bevelBox([s*1.6, -1.27, 10.8], [0.34, 0.26, 1.8], 0.08, T.HULL, 0.85);
    // RCS blocks: nose, tail
    m.bevelBox([s*1.12, -0.2, 19.0], [0.16, 0.36, 0.3], 0.04, T.DARK);
    m.bevelBox([s*3.2, 0.5, -15.5], [0.18, 0.36, 0.34], 0.04, T.DARK);
  }
  // tail fin with an orange band (the strobe on its tip), the stern: an APU nozzle and tail lights
  m.hex([[-0.1, crown(-17) - 0.1, -17], [-0.1, crown(-17) - 0.1, -13.9], [-0.1, 3.25, -17.4], [-0.1, 3.25, -15.8],
         [0.1, crown(-17) - 0.1, -17], [0.1, crown(-17) - 0.1, -13.9], [0.1, 3.25, -17.4], [0.1, 3.25, -15.8]], T.HULL, 1, 78);
  m.hex([[-0.115, 2.75, -17.34], [-0.115, 2.75, -15.35], [-0.115, 3.0, -17.37], [-0.115, 3.0, -15.6],
         [0.115, 2.75, -17.34], [0.115, 2.75, -15.35], [0.115, 3.0, -17.37], [0.115, 3.0, -15.6]], T.TRIM, 1, 0);
  m.decal = 1;
  m.lathe([[-17.05, 0.0, T.THROAT, 0], [-17.05, 0.28, T.THROAT, 0.3], [-17.7, 0.46, T.TITAN, 1, {crease: true}], [-17.6, 0.54, T.TITAN, 0.8], [-17.0, 0.4, T.TITAN, 0.4]], 14, 0, 0.35, 1, 0);
  m.decal = 0;
  for (const s of [-1, 1]) m.bevelBox([s*2.1, 0.95, -17.02], [0.28, 0.1, 0.06], 0.02, T.LAMP);
  // lettering 1 cm proud of the surfaces, reading from behind (the chase camera): MSV on the port wing, MEINEN on the
  // starboard, 01 on the stern, NO STEP beside the spine
  const wy = x => -0.34 + (-0.38 + 0.34)*(Math.abs(x) - 7.8)/5.4 + 0.012, D = (id, k, a, b, c, d, ref) => { m.decal = id; m.quad(a, b, c, d, T.DECAL, 1, 0, ref || [(a[0] + c[0])/2, a[1] - 1, (a[2] + c[2])/2], DECAL_TEXT[k][1]); m.decal = 0; };
  D(2, 'msv', [12.4, wy(12.4), -11.3], [10.4, wy(10.4), -11.3], [10.4, wy(10.4), -12.1], [12.4, wy(12.4), -12.1]);
  D(2, 'meinen', [-8.5, wy(8.5), -11.1], [-12.9, wy(12.9), -11.1], [-12.9, wy(12.9), -11.9], [-8.5, wy(8.5), -11.9]);
  D(3, 'n01', [0.62, 1.32, -17.012], [-0.62, 1.32, -17.012], [-0.62, 0.78, -17.012], [0.62, 0.78, -17.012], [0, 1, -16]);
  for (const x of [1.25, -1.25]) { const y = meinenAt(-6, 5) + 0.01; D(1, 'nostep', [x + 0.55, y, -5.4], [x - 0.55, y, -5.4], [x - 0.55, y, -5.62], [x + 0.55, y, -5.62]); }
  // torpedo bay doors (SHIP_KIT.meinen.torp drops from under them)
  m.bevelBox([0, -1.57, 3], [0.9, 0.05, 1.5], 0.02, T.DARK);
  for (const z of [1.45, 4.55]) m.bevelBox([0, -1.58, z], [0.92, 0.05, 0.1], 0.01, T.HAZARD);
  m.greeble(rnd, [-2.2, crown(-9) - 0.02, -15], [1, 0, 0], [0, 0, 1], 4.4, 13, [0, 1, 0], 16, 0.35, [T.DARK, T.HULL, T.TITAN], 0.6);
  return m;
};
// the survey dish on its mast (turns about the mast): white reflector, dark back, feed on three struts
SHIP_CLASSES.meinenDish = () => {
  const m = new Mesh(), T = MAT, B = MEINEN_DISH;
  m.cyl(V.add(B, [0, 0.2, 0]), V.add(B, [0, 1.25, 0]), 0.13, 0.1, 8, T.DARK, 1, 0, true);
  m.push().xf(V.add(B, [0, 1.3, 0]), 0, -35*Math.PI/180);
  m.lathe([[0.05, 1.55, T.HULL, 0, {crease: true}], [-0.12, 1.05, T.HULL], [-0.3, 0.5, T.HULL], [-0.36, 0.0, T.HULL]], 20, 0, 0, 1, 0);
  m.lathe([[-0.46, 0.0, T.DARK], [-0.36, 0.7, T.DARK], [-0.05, 1.55, T.DARK, 0, {crease: true}], [0.05, 1.58, T.TITAN]], 20);
  for (let k = 0; k < 3; k++) { const a = k*2.094, p = [Math.cos(a)*1.45, Math.sin(a)*1.45, 0.0]; m.cyl(p, [0, 0, 1.05], 0.025, 0.025, 4, T.DARK, 1, 0, false); }
  m.cyl([0, 0, 0.95], [0, 0, 1.25], 0.12, 0.05, 8, T.DARK, 1, 0, true);
  m.pop();
  return m;
};
// the nozzles, gimballed at their throats: a glowing inner bell (THROAT, bright at the throat), a burnt-titanium outer bell
function meinenBell(s){
  const m = new Mesh(), T = MAT;
  m.decal = 1;                                              // (the emissive shader's cue: a throat-to-rim gradient)
  m.lathe([[-17.1, 0.0, T.THROAT, 0], [-17.1, 0.72, T.THROAT, 0.05], [-18.6, 1.02, T.THROAT, 0.5], [-20.55, 1.44, T.TITAN, 1.0, {crease: true}],
    [-20.7, 1.52, T.TITAN, 0.95, {crease: true}], [-20.55, 1.58, T.TITAN, 0.8, {crease: true}], [-19.4, 1.36, T.TITAN, 0.4], [-17.6, 1.0, T.TITAN, 0.15], [-16.9, 0.85, T.TITAN, 0.1]],
    22, s*MEINEN_NAC, MEINEN_NY, 1, 0);
  return m;
}
SHIP_CLASSES.meinenBellP = () => meinenBell(1);
SHIP_CLASSES.meinenBellS = () => meinenBell(-1);

// ------------------------------------------------------------------------------------------ building
const SHIP_BUILT = {};
// the class's geometry, built once: {vb (SHIP_VSTRIDE floats a vertex), ib (triangles sorted by material bucket), buckets
// ([start, count] indices per bucket), radius, tris, verts, min, max (metres), shell (shielded classes: shellFit)}
function shipKitBuild(cls){
  if (SHIP_BUILT[cls]) return SHIP_BUILT[cls];
  const b = SHIP_CLASSES[cls]().build(), ib = b.ib, nt = ib.length/3, by = [[], [], []];
  for (let t = 0; t < nt; t++) by[MAT_BUCKET[Math.round(b.vb[ib[t*3]*SHIP_VSTRIDE + 6])] || 0].push(t);
  const out = new ib.constructor(ib.length), buckets = []; let k = 0;
  for (const list of by) { buckets.push([k, list.length*3]); for (const t of list) { out[k++] = ib[t*3]; out[k++] = ib[t*3+1]; out[k++] = ib[t*3+2]; } }
  b.ib = out; b.buckets = buckets;
  SHIP_BUILT[cls] = b;
  if (SHIP_KIT[cls] && SHIP_KIT[cls].shield) b.shell = shellFit(cls, b);
  return b;
}
// The shield shell of a shielded class (combat.js places the ripples on it, ships.js draws it): the smallest axis-aligned
// ellipsoid, centred on the keel line, round the hull, its parts over their whole swing (the dish turns) and its turrets'
// reach, by a coarse-to-fine search over the centre's height and the two aspect ratios. Masts above K.shield.yMax pierce
// it. {c: [0, cy, cz], r: [rx, ry, rz]} in metres.
function shellFit(cls, b){
  const K = SHIP_KIT[cls], yMax = K.shield.yMax, cell = Math.max(...b.max.map((x, i) => x - b.min[i]))/36, seen = new Set(), P = [];
  const add = (x, y, z) => { if (y > yMax) return; const key = Math.round(x/cell) + ',' + Math.round(y/cell) + ',' + Math.round(z/cell); if (!seen.has(key)) { seen.add(key); P.push(x, y, z); } };
  const walk = (g, fn) => { for (let v = 0; v < g.verts; v++) fn(g.vb[v*SHIP_VSTRIDE], g.vb[v*SHIP_VSTRIDE + 1], g.vb[v*SHIP_VSTRIDE + 2]); };
  walk(b, add);
  for (const pc of K.parts || []) { const pv = SHIP_KIT[pc].pivot;
    for (let a = 0; a < 6.28; a += 0.785) { const c = Math.cos(a), s = Math.sin(a); walk(shipKitBuild(pc), (x, y, z) => { const dx = x - pv[0], dz = z - pv[2]; add(pv[0] + dx*c + dz*s, y, pv[2] - dx*s + dz*c); }); } }
  if (K.turretCls) { const tr = shipKitBuild(K.turretCls).radius;
    for (const T of K.turrets) for (let i = 0; i < 24; i++) { const y = -0.14 + 1.14*(i%4)/3, a = i*0.785, h = Math.sqrt(1 - y*y);
      add(T.pivot[0] + Math.cos(a)*h*tr, T.pivot[1] + y*tr, T.pivot[2] + Math.sin(a)*h*tr); } }
  const n = P.length/3, cz = (b.min[2] + b.max[2])/2, hx = Math.max(-b.min[0], b.max[0]), hy = (Math.min(yMax, b.max[1]) - b.min[1])/2, hz = (b.max[2] - b.min[2])/2;
  const fit = (cy, ay, az) => { let m = 0; for (let i = 0; i < n; i++) { const x = P[i*3], y = (P[i*3+1] - cy)/ay, z = (P[i*3+2] - cz)/az, q = x*x + y*y + z*z; if (q > m) m = q; }
    const rx = Math.sqrt(m); return {vol: rx*rx*rx*ay*az, cy, ay, az, rx}; };
  let lo = [b.min[1], 0.2*hy/hx, 0.6*hz/hx], hi = [b.min[1] + 2*hy, 3*hy/hx, 1.8*hz/hx], best = null;
  for (let lv = 0; lv < 4; lv++) {                                      // (a few ms per class at boot)
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 4; k++) {
      const f = fit(lo[0] + (hi[0] - lo[0])*i/4, lo[1] + (hi[1] - lo[1])*j/4, lo[2] + (hi[2] - lo[2])*k/4); if (!best || f.vol < best.vol) best = f; }
    const v = [best.cy, best.ay, best.az];
    for (let q = 0; q < 3; q++) { const w = (hi[q] - lo[q])/4; lo[q] = v[q] - w; hi[q] = v[q] + w; if (q) lo[q] = Math.max(lo[q], 0.02); }
  }
  const k = 1.04;
  return {c: [0, best.cy, cz], r: [best.rx*k, best.rx*best.ay*k, best.rx*best.az*k]};
}
const SHIP_ORDER = ['meinenDish', 'meinenBellP', 'meinenBellS', 'meinen', 'drone', 'wasp', 'shard', 'turretS', 'turretL', 'frigate', 'cruiser', 'hawk'];   // boot pre-build: the one you fly first
