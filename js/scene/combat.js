'use strict';
// combat.js — GUNS & TARGETS: the MSV MEINEN's weapons, the things you shoot at, and the director that stages each
// engagement like a film. Pure maths (no GL, no DOM), loaded after flight.js: ships.js draws it, hud.js shows it and
// plays its sound, main.js feeds it input, and the tests' sandbox flies it without a page.
//
// FRAME. Everything lives where the helm does: MILLER-relative float64 metres, velocities in SIM m/s (sim time = real x
// ORB.TC), under MILLER's real gravity. Tuning is authored in REAL units and divided by TC where it meets the physics.
// Arming captures the engagement's Hill frame from the ship's orbit (N = orbit normal, n0 = mean motion), and every
// assisted craft -- the AI, and the player through HELM.ref -- flies v -> n0 N x p + vcmd: rigid co-rotation with the
// orbit, so a craft that lets go holds its place beside you on all three axes and a command is a true relative velocity.
// Bolts, debris and FX are ballistic under the same gravity (a bolt without it sags 2.4 km behind its shooter in 2 s).
// Absolute positions move ~1.6 km a frame, so every hit test is a swept segment in the TARGET's own frame, and aim and
// lead use MILLER-frame (inertial) velocities: a target holding station 2 km away still moves 26 m/s inertially.
// Rounds and particles live in typed-array pools, no allocation per round or spark (GC hitches read as missed vsyncs).
//
// THE FILM. cmbArm() starts an engagement: THE RANGE (target drones, the first time only) -> CONTACT (a wing of fighters
// that shoot back) -> a capital ship that arrives in a cutaway, launches fighters, throws flak and dies in a chain of
// blasts on a locked-off wide shot -> a lull -> harder waves. Hull 0 is never game over: the ship tumbles, burning, and
// an emergency jump (main.js) takes it home. cmbSafe() stands the weapons down (G, the autopilot, a game launch).

// ------------------------------------------------------------------------------------------ tuning (REAL units)
const CMB = {
  VCAP: 240,                                            // m/s real while armed (shift x2.2); supercruise would be 168 km/s
  GUN_RATE: 14, GUN_SPEED: 2200, GUN_LIFE: 1.3, GUN_DMG: 1, GUN_SPREAD: 0.16*DEG, GUN_GIMBAL: 4*DEG,
  GUN_HEAT: 0.05, GUN_COOL: 0.42, GUN_RESET: 0.35,      // ~3.5 s of fire overheats; locked out until it cools to 35%
  MUZZLES: [[-1.6, -1.45, 18.3], [1.6, -1.45, 18.3]],   // the chin coilguns' tips (ships.js SHIP_CLASSES.meinen)
  TORP_MAX: 4, TORP_RELOAD: 9, TORP_SPEED: 950, TORP_ACC: 340, TORP_TURN: 3.2, TORP_LIFE: 7, TORP_DMG: 34, TORP_FUSE: 16,
  SEEK: 26*DEG, LOCK_CONE: 14*DEG, LOCK_KEEP: 22*DEG,   // auto-targeting cone; lock builds inside 14 deg, holds to 22
  SHIELD: 150, HULL: 100, REGEN: 16, REGEN_DELAY: 1.8, EXT: [13, 5, 22],
  NB: 1024, NFX: 4096,                                  // pool sizes: rounds, particles
};
// hit ellipsoid half extents (m), hull and shield, cruise speed (m/s real), turn rate (rad/s real), assist tau (s) and
// acceleration (m/s^2), lock time (s), explosion size (m)
const CMB_CLS = {
  drone:   {mesh: 'drone', name: 'TARGET DRONE', ext: [5, 4.5, 6], hp: 3, sh: 0, spd: 26, turn: 0.6, tau: 0.8, acc: 40, lock: 0.45, boom: 16},
  wasp:    {mesh: 'wasp', name: 'WASP', ext: [6, 5.5, 6], hp: 5, sh: 0, spd: 215, turn: 1.3, tau: 0.3, acc: 260, lock: 1.0, boom: 24, fighter: true,
            guns: [[-2.4, 0, 3.4], [2.4, 0, 3.4]], burst: 6, rate: 10, speed: 1800, spread: 1.1*DEG, dmg: 2, range: 1400, rest: 2.1},
  frigate: {mesh: 'frigate', name: 'FRIGATE', ext: [50, 30, 120], hp: 80, sh: 40, spd: 40, turn: 0.1, tau: 2, acc: 15, lock: 0.6, boom: 130, capital: true,
            turrets: [[0, 22, 36]], flak: 0.35, pods: [[-52, 0, -40], [52, 0, -40]]},
  cruiser: {mesh: 'cruiser', name: 'CRUISER', ext: [90, 70, 380], hp: 170, sh: 90, spd: 28, turn: 0.06, tau: 3, acc: 10, lock: 0.6, boom: 320, capital: true,
            turrets: [0, 1, 2, 3].flatMap(k => [[-48, 70, -121 + k*95], [48, 70, -121 + k*95]]), flak: 0.13,
            hangar: [[-88, -15, 30], [88, -15, 30]], launch: 17},
};
const CMB_FLAK = {speed: 1400, life: 5, fuse: 45, dmg: 5, direct: 10, spread: 3*DEG};        // capital turrets: proximity-fused
const CMB_MSL = {speed: 330, acc: 120, turn: 1.3, life: 12, fuse: 22, dmg: 18, ext: [3, 3, 5]};   // frigate missiles (shootable)
const CMB_WAVES = [{wing: 3, cap: 'frigate'}, {wing: 4, cap: 'cruiser'}, {wing: 5, cap: 'cruiser', escort: 'frigate'}];
const CMB_WORD = ['NO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'];
const CMB_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// Bolt pool rows: p(3) v(3) p-at-step-start(3) life team kind (kind 0 player round, 1 fighter round, 2 flak).
// FX rows: p(3) v(3) t0 life kind size grow seed colour(3) vec(3). Kinds: 0 glow, 1 flash, 2 fireball, 3 smoke,
// 4 shockwave ring (vec = its axis), 5 shield hit (vec = normal), 6 spark (vec = ejecta, m/s real), 7 warp (vec = the
// arrival direction), 8 ember. Sizes in metres.
const CMB_BS = 12, CMB_FS = 18;
const COMBAT = {
  hot: false, t: 0, frame: null, ents: [], torps: [], shards: [], events: [], shot: null, dir: null,
  B: new Float64Array(CMB.NB*CMB_BS), nb: 0, F: new Float64Array(CMB.NFX*CMB_FS), nf: 0,
  me: {p: [0, 0, 0], v: [0, 0, 0], po: null, f: [0, 0, 1], u: [0, 1, 0]},   // the player's ship, synced from HELM each step
  pl: null, input: {fire: 0, torp: 0}, score: {kills: 0, wave: 0}, engaged: 0, idN: 1,
  flash: 0, fired: 0, muzzle: null, rm: false, cineOK: true, rnd: mulberry(7331),
};

// ------------------------------------------------------------------------------------------ small helpers
const cmbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function cmbVref(p){ const F = COMBAT.frame, N = F.N, n = F.n0; return [(N[1]*p[2] - N[2]*p[1])*n, (N[2]*p[0] - N[0]*p[2])*n, (N[0]*p[1] - N[1]*p[0])*n]; }
// ship-local metres (+x = u x f as ships.js draws it, +y dorsal, +z bow) -> MILLER-relative metres
function cmbAt(e, l){
  const f = e.f, u = e.u, s = e.scale || 1, x = (u[1]*f[2] - u[2]*f[1])*l[0], y = (u[2]*f[0] - u[0]*f[2])*l[0], z = (u[0]*f[1] - u[1]*f[0])*l[0];
  return [e.p[0] + (x + u[0]*l[1] + f[0]*l[2])*s, e.p[1] + (y + u[1]*l[1] + f[1]*l[2])*s, e.p[2] + (z + u[2]*l[1] + f[2]*l[2])*s];
}
function cmbRandDir(){ const R = COMBAT.rnd, z = R()*2 - 1, a = R()*2*Math.PI, s = Math.sqrt(1 - z*z); return [s*Math.cos(a), s*Math.sin(a), z]; }
// d turned by up to `ang` in a random direction
function cmbJitter(d, ang){ const q = cmbRandDir(), k = Math.tan(ang)*Math.sqrt(COMBAT.rnd()); return V.norm(V.add(d, V.mul(V.sub(q, V.mul(d, V.dot(q, d))), k))); }
function cmbEv(type, o){ const e = o || {}; e.type = type; COMBAT.events.push(e); return e; }
function cmbKick(k){ if (!COMBAT.rm) HELM.kick = Math.min(1.5, Math.max(HELM.kick, k)); }

// Direction to fire a round of `speed` (m/s real, relative to the shooter) from p/v at a target at q/w (MILLER frame,
// sim velocities): the inertial intercept. Both fall together, so gravity cancels. null when it cannot catch up.
function cmbLead(p, v, q, w, speed){
  const TC = ORB.TC, rx = q[0] - p[0], ry = q[1] - p[1], rz = q[2] - p[2], ux = (w[0] - v[0])*TC, uy = (w[1] - v[1])*TC, uz = (w[2] - v[2])*TC;
  const a = ux*ux + uy*uy + uz*uz - speed*speed, b = 2*(rx*ux + ry*uy + rz*uz), c = rx*rx + ry*ry + rz*rz;
  let t;
  if (Math.abs(a) < 1e-6) t = b < 0 ? -c/b : -1;
  else { const D = b*b - 4*a*c; if (D < 0) return null; const s = Math.sqrt(D), t1 = (-b - s)/(2*a), t2 = (-b + s)/(2*a); t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : Math.max(t1, t2); }
  if (!(t > 0)) return null;
  const x = rx + ux*t, y = ry + uy*t, z = rz + uz*t, l = Math.hypot(x, y, z) || 1;
  return {dir: [x/l, y/l, z/l], t};
}

// Step an assisted craft h sim-seconds: v -> v_ref(p) + vcmd with time constant tau (s real) and acceleration limit acc
// (m/s^2 real), velocity Verlet as flight.js does it (the assist is evaluated at the half-step velocity).
function cmbFly(e, h, tau, acc){
  const TC = ORB.TC, T = tau*TC, aMax = acc/(TC*TC), GM = ORB.planet.GM, F = COMBAT.frame, N = F.N, n = F.n0, c = e.vcmd;
  const A = (p, v) => {
    const r2 = p[0]*p[0] + p[1]*p[1] + p[2]*p[2], k = -GM/(r2*Math.sqrt(r2));
    let ax = ((N[1]*p[2] - N[2]*p[1])*n + c[0] - v[0])/T, ay = ((N[2]*p[0] - N[0]*p[2])*n + c[1] - v[1])/T, az = ((N[0]*p[1] - N[1]*p[0])*n + c[2] - v[2])/T;
    const l = Math.sqrt(ax*ax + ay*ay + az*az); if (l > aMax) { const s = aMax/l; ax *= s; ay *= s; az *= s; }
    return [p[0]*k + ax, p[1]*k + ay, p[2]*k + az];
  };
  const a0 = A(e.p, e.v), vh = [e.v[0] + a0[0]*h/2, e.v[1] + a0[1]*h/2, e.v[2] + a0[2]*h/2];
  e.p = [e.p[0] + vh[0]*h, e.p[1] + vh[1]*h, e.p[2] + vh[2]*h];
  const a1 = A(e.p, vh); e.v = [vh[0] + a1[0]*h/2, vh[1] + a1[1]*h/2, vh[2] + a1[2]*h/2];
}
// ballistic: gravity only
function cmbCoast(e, h){
  const GM = ORB.planet.GM, g = p => { const r2 = p[0]*p[0] + p[1]*p[1] + p[2]*p[2], k = -GM/(r2*Math.sqrt(r2)); return [p[0]*k, p[1]*k, p[2]*k]; };
  const a0 = g(e.p), vh = [e.v[0] + a0[0]*h/2, e.v[1] + a0[1]*h/2, e.v[2] + a0[2]*h/2];
  e.p = [e.p[0] + vh[0]*h, e.p[1] + vh[1]*h, e.p[2] + vh[2]*h];
  const a1 = g(e.p); e.v = [vh[0] + a1[0]*h/2, vh[1] + a1[1]*h/2, vh[2] + a1[2]*h/2];
}
// turn e's nose toward unit `want` by at most `maxA` rad, then settle its dorsal: fighters bank into the turn (about the
// local vertical: the demo's version assumed +y was up), everything else stays level with the horizon
function cmbTurn(e, want, maxA, bank, dt){
  const f = e.f, c = clamp(V.dot(f, want), -1, 1), ang = Math.acos(c);
  if (ang > 1e-6) {
    let ax = V.cross(f, want), l = V.len(ax);
    if (l < 1e-9) { ax = e.u; l = 1; }                                                  // straight behind: turn about the dorsal
    const k = Math.min(ang, maxA), axis = V.mul(ax, 1/l);
    e.f = V.norm(V.rot(f, axis, k)); e.u = V.rot(e.u, axis, k);
  }
  const up = V.norm(e.p), side = V.cross(e.f, up);                                     // side = the craft's right
  let ut = V.sub(up, V.mul(e.f, V.dot(up, e.f)));
  if (bank) ut = V.add(ut, V.mul(side, clamp(V.dot(want, side)*bank*3, -2.5, 2.5)));   // dorsal leans into the turn
  if (V.len(ut) < 1e-6) ut = e.u;
  const kk = 1 - Math.exp(-dt*(bank ? 4 : 1.5));
  e.u = V.add(e.u, V.mul(V.sub(V.norm(ut), e.u), kk));
  [e.f, e.u] = QV.ortho(e.f, e.u);
}
// Swept segment a -> b (relative to e's centre, metres) against e's hit ellipsoid (optionally grown): the hit fraction
// in [0, 1], or -1. A bounding-sphere test rejects the misses first.
function cmbSegHit(ax, ay, az, bx, by, bz, e, grow){
  const ext = e.ext || CMB_CLS[e.cls].ext, s = (e.scale || 1)*(grow || 1), ex = ext[0]*s, ey = ext[1]*s, ez = ext[2]*s;
  const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx*dx + dy*dy + dz*dz;
  const tc = L2 > 1e-12 ? clamp(-(ax*dx + ay*dy + az*dz)/L2, 0, 1) : 0, cx = ax + dx*tc, cy = ay + dy*tc, cz = az + dz*tc, rm = Math.max(ex, ey, ez);
  if (cx*cx + cy*cy + cz*cz > rm*rm) return -1;
  const f = e.f, u = e.u, rx = u[1]*f[2] - u[2]*f[1], ry = u[2]*f[0] - u[0]*f[2], rz = u[0]*f[1] - u[1]*f[0];
  const A0 = (ax*rx + ay*ry + az*rz)/ex, A1 = (ax*u[0] + ay*u[1] + az*u[2])/ey, A2 = (ax*f[0] + ay*f[1] + az*f[2])/ez;
  const D0 = (dx*rx + dy*ry + dz*rz)/ex, D1 = (dx*u[0] + dy*u[1] + dz*u[2])/ey, D2 = (dx*f[0] + dy*f[1] + dz*f[2])/ez;
  const qa = D0*D0 + D1*D1 + D2*D2, qb = 2*(A0*D0 + A1*D1 + A2*D2), qc = A0*A0 + A1*A1 + A2*A2 - 1;
  if (qc < 0) return 0;                                                                   // started inside
  const D = qb*qb - 4*qa*qc;
  if (D < 0 || qa < 1e-18) return -1;
  const t = (-qb - Math.sqrt(D))/(2*qa);
  return t >= 0 && t <= 1 ? t : -1;
}

// ------------------------------------------------------------------------------------------ pools
function cmbBolt(p, v, team, kind, life){
  const C = COMBAT; if (C.nb >= CMB.NB) return;
  const B = C.B, o = C.nb++*CMB_BS;
  B[o] = B[o+6] = p[0]; B[o+1] = B[o+7] = p[1]; B[o+2] = B[o+8] = p[2]; B[o+3] = v[0]; B[o+4] = v[1]; B[o+5] = v[2];
  B[o+9] = life; B[o+10] = team; B[o+11] = kind;
}
function cmbFx(kind, p, v, life, size, grow, col, vec, seed){
  const C = COMBAT; if (C.nf >= CMB.NFX) return;
  const F = C.F, o = C.nf++*CMB_FS;
  F[o] = p[0]; F[o+1] = p[1]; F[o+2] = p[2]; F[o+3] = v[0]; F[o+4] = v[1]; F[o+5] = v[2];
  F[o+6] = C.t; F[o+7] = life; F[o+8] = kind; F[o+9] = size; F[o+10] = grow || 0; F[o+11] = seed == null ? C.rnd() : seed;
  F[o+12] = col ? col[0] : 1; F[o+13] = col ? col[1] : 1; F[o+14] = col ? col[2] : 1;
  F[o+15] = vec ? vec[0] : 0; F[o+16] = vec ? vec[1] : 0; F[o+17] = vec ? vec[2] : 0;
}
// ballistic Verlet over a strided pool, in place (x at o, v at o + 3), with no allocation
function cmbCoastPool(A, n, stride, h){
  const GM = ORB.planet.GM;
  for (let i = 0; i < n; i++) {
    const o = i*stride;
    let x = A[o], y = A[o+1], z = A[o+2], r2 = x*x + y*y + z*z, k = -GM/(r2*Math.sqrt(r2))*h/2;
    const vx = A[o+3] + x*k, vy = A[o+4] + y*k, vz = A[o+5] + z*k;
    x += vx*h; y += vy*h; z += vz*h; r2 = x*x + y*y + z*z; k = -GM/(r2*Math.sqrt(r2))*h/2;
    A[o] = x; A[o+1] = y; A[o+2] = z; A[o+3] = vx + x*k; A[o+4] = vy + y*k; A[o+5] = vz + z*k;
  }
}

// ------------------------------------------------------------------------------------------ explosions
// Flash, fireball, sparks, smoke, an optional shockwave ring and burning debris, all moving with the thing that blew up
// (v, sim) -- in this frame a fireball left behind by even 1% of the orbital speed would be 80 m a second astern.
function cmbBoom(p, v, size, o){
  o = o || {};
  const C = COMBAT, R = C.rnd, TC = ORB.TC, v0 = v || [0, 0, 0];
  cmbFx(1, p, v0, 0.3 + size*0.0012, size*(o.flash || 2.2), 0, o.col || [1.4, 1.1, 0.8]);
  cmbFx(2, p, v0, 1.4 + size*0.004, size, size*1.2, [1, 1, 1]);
  const ns = o.sparks == null ? Math.round(12 + 40*Math.min(size/100, 1.5)) : o.sparks;
  for (let k = 0; k < ns; k++) {
    const d = cmbRandDir(), s = size*(1.5 + R()*5);
    cmbFx(6, p, V.add(v0, V.mul(d, s/TC)), 0.6 + R()*1.4, size*0.004 + 0.4, 0, null, V.mul(d, s));
  }
  for (let k = 0; k < (o.smoke == null ? 3 : o.smoke); k++) {
    const q = V.add(p, V.mul(cmbRandDir(), size*0.5*R()));
    cmbFx(3, q, V.add(v0, V.mul(cmbRandDir(), size*0.4*R()/TC)), 2.2 + R()*1.6, size*0.75, size*1.1, [0.5, 0.46, 0.43]);
  }
  if (o.ring) { const n = V.norm(V.add(V.norm(p), V.mul(cmbRandDir(), 0.5))); cmbFx(4, p, v0, 5, size, size*9, [2.6, 1.9, 1.4], n); }
  for (let k = 0; k < (o.shards || 0) && C.shards.length < 90; k++) {
    const d = cmbRandDir(), s = size*(0.6 + R()*2.2);
    C.shards.push({p: V.add(p, V.mul(d, size*0.2)), v: V.add(v0, V.mul(d, s/TC)), f: cmbRandDir(), u: cmbRandDir(), spin: V.mul(cmbRandDir(), 1 + R()*4),
      scale: size*(0.03 + R()*0.06)*(o.shardK || 1), t0: C.t, life: 5 + R()*6, team: o.team == null ? 1 : o.team});
  }
  if (!o.quiet) cmbEv('boom', {size, dist: cmbDist(p, C.me.p)});
}
function cmbWarpFx(p, v, size, dir, out){
  // arrival: a flash and a streak along the way it came; departure: the same, streaking away
  cmbFx(7, p, v, 0.9, Math.max(size, 12), 0, out ? [1.6, 2.0, 2.8] : [2, 2.4, 3], dir);
}

// ------------------------------------------------------------------------------------------ the player
function cmbFreshPlayer(){
  return {sh: CMB.SHIELD, hull: CMB.HULL, heat: 0, over: false, torps: CMB.TORP_MAX, reload: 0, lastHit: -99, down: -1, crit: false,
    tgt: null, lockT: 0, locked: false, lead: null, aim: null, aimR: 900, fireT: 0, side: 0, hitT: -9, killT: -9};
}
function cmbSync(){
  const C = COMBAT, H = HELM, me = C.me;
  me.po = C.prevP || H.p; me.p = H.p; me.v = H.v; me.f = H.f; me.u = H.ub || H.u;
}
// the player takes a hit: shields first, then hull; nothing lands while a cutaway holds the screen or after hull 0
function cmbHurt(amt, at, src){
  const C = COMBAT, P = C.pl, me = C.me;
  if (!P || P.down >= 0 || C.shot || !C.hot) return;
  P.lastHit = C.t;
  const n = V.norm(V.sub(at, me.p));
  if (P.sh > 0) {
    P.sh = Math.max(0, P.sh - amt);
    cmbFx(5, V.add(me.p, V.mul(n, Math.min(18, cmbDist(at, me.p)))), me.v, 0.45, 14, 0, [0.3, 0.8, 1.6], n);   // the shield flares where it was struck
    cmbKick(0.3); cmbEv('hurt', {amt, shield: true, dir: n, src});
    if (P.sh <= 0) cmbEv('shieldsDown');
    return;
  }
  P.hull = Math.max(0, P.hull - amt);
  cmbBoom(V.add(me.p, V.mul(n, 6)), me.v, 5 + amt, {sparks: 10, smoke: 1, flash: 1.4, quiet: true});
  cmbKick(0.7); cmbEv('hurt', {amt, shield: false, dir: n, src});
  if (P.hull <= 25 && !P.crit) { P.crit = true; cmbEv('hullCrit'); }
  if (P.hull <= 0) cmbDown();
}
// Hull 0: knocked out, not killed. The ship tumbles, burning, a wide shot holds on it, then the emergency jump.
function cmbDown(){
  const C = COMBAT, P = C.pl, me = C.me, R = C.rnd;
  if (P.down >= 0) return;
  P.down = C.t; C.input.fire = 0;
  HELM.disabled = true; HELM.tumble = C.rm ? [0, 0, 0] : [0.8 + R()*0.5, 0.3, 1.4 + R()*0.6];
  cmbBoom(me.p, me.v, 22, {sparks: 60, smoke: 4, shards: 10, shardK: 0.5, team: 0});
  cmbKick(1.2); if (!C.rm) C.flash = Math.max(C.flash, 0.35);
  if (C.cineOK) {                                                  // a locked-off wide shot of the MEINEN going under
    // (every camera rides something co-moving: a point fixed in MILLER's frame is 1.6 km behind the fight a frame later)
    const up = V.norm(me.p), side = V.norm(V.cross(me.f, up)), off = V.add(V.add(V.mul(side, 150), V.mul(up, 48)), V.mul(me.f, -70));
    C.shot = {kind: 'down', t0: C.t, t1: C.t + 2.7, eye: () => V.add(COMBAT.me.p, off), look: () => COMBAT.me.p, up, fov: 40*DEG};
    cmbEv('cine', {kind: 'down', on: true});
  }
  cmbEv('down'); cmbEv('music', {cue: 'down'});
}

// ------------------------------------------------------------------------------------------ arming
function cmbArm(){
  const C = COMBAT, H = HELM;
  if (C.hot || H.mode !== 'helm' || !H.p || H.disabled) return false;
  C.hot = true;
  C.frame = {N: V.norm(V.cross(H.p, H.v)), n0: Math.sqrt(ORB.planet.GM/Math.pow(V.len(H.p), 3))};
  H.ref = C.frame; H.vcap = CMB.VCAP/ORB.TC;
  // drop out of supercruise: the command AND the ship's own motion relative to the fight (arming 2 s into a burn left the
  // ship 155 km/s adrift, and the range's drones 225 km behind)
  const l = V.len(H.vcmd), cap = H.vcap*H.VCAP_BOOST; if (l > cap) H.vcmd = V.mul(H.vcmd, cap/l);
  const vr = cmbVref(H.p), dv = V.sub(H.v, vr), dl = V.len(dv); if (dl > cap) H.v = V.add(vr, V.mul(dv, cap/dl));
  cmbCineCancel();
  C.pl = cmbFreshPlayer(); C.score = {kills: 0, wave: 0}; C.prevP = null; C.engaged++;
  C.ents = C.ents.filter(e => e.wreck); C.torps = []; C.nb = 0;
  C.dir = C.engaged === 1 ? {stage: 'range', t: 0, wave: 0} : {stage: 'lull', t: 0, lull: 2.2, next: 'wing', wave: 0};
  cmbSync();
  cmbEv('arm', {first: C.engaged === 1});
  return true;
}
// Weapons safe: the hostiles jump out, the rounds in flight vanish, the helm gets its supercruise back.
function cmbSafe(why){
  const C = COMBAT;
  if (!C.hot) return false;
  if (C.pl && C.pl.down >= 0 && why !== 'launch') return false;                      // knocked out: the jump drive decides
  cmbCineCancel();
  C.hot = false; HELM.ref = null; HELM.vcap = 0; C.input.fire = 0; C.input.torp = 0;
  if (HELM.disabled) HELM.disabled = false;
  for (const e of C.ents) if (e.alive && !e.wreck) {
    if (!e.arrive && e.dying < 0) cmbWarpFx(e.p, e.v, CMB_CLS[e.cls].ext[2], V.mul(e.f, -1), true);
    e.alive = false;
  }
  C.ents = C.ents.filter(e => e.alive); C.torps = []; C.nb = 0;
  C.dir = null; if (C.pl) { C.pl.tgt = null; C.pl.locked = false; }
  cmbEv('safe', {why, kills: C.score.kills, wave: C.score.wave}); cmbEv('music', {cue: 'safe'});
  return true;
}
// after the emergency jump (and on a bfcache restore): nothing left anywhere
function cmbReset(){
  const C = COMBAT;
  if (C.hot) { C.hot = false; HELM.ref = null; HELM.vcap = 0; }
  HELM.disabled = false; C.ents = []; C.torps = []; C.shards = []; C.nb = 0; C.nf = 0; C.shot = null; C.shotAt = null; C.dir = null;
  C.input.fire = 0; C.input.torp = 0; C.flash = 0; C.muzzle = null; C.prevP = null;
  if (C.pl) { C.pl.tgt = null; C.pl.locked = false; C.pl.down = -1; }
}
function cmbActive(){ const C = COMBAT; return C.hot || C.ents.length > 0 || C.torps.length > 0 || C.shards.length > 0 || C.nb > 0 || C.nf > 0 || !!C.shot || !!C.shotAt; }

// ------------------------------------------------------------------------------------------ spawning
function cmbSpawn(cls, p, f, arrive){
  const C = COMBAT, c = CMB_CLS[cls], up = V.norm(p);
  const e = {id: C.idN++, cls, team: 1, p, v: cmbVref(p), po: p, f, u: V.norm(V.sub(up, V.mul(f, V.dot(up, f)))), vcmd: [0, 0, 0],
    hp: c.hp, sh: c.sh, alive: true, dying: -1, arrive: arrive || 0, damage: 0, glow: 0.25, scale: 1, cool: 1 + C.rnd()*2, burst: 0, bt: 0, gi: 0,
    ai: {mode: 'attack', t: 0, dir: null}, seed: C.rnd(), tur: (c.turrets || []).map(q => ({p: q, cool: 1 + C.rnd()*3})), hitT: -9, wreck: false, spin: null};
  if (c.fighter) e.v = V.add(e.v, V.mul(f, c.spd/ORB.TC));
  C.ents.push(e);
  return e;
}
// a unit direction turned from the camera's forward by yaw / pitch (rad): spawns land where you are looking
function cmbAhead(yaw, pitch){ const b = ORB.view.b; return V.norm(V.add(V.add(b.f, V.mul(b.r, Math.tan(yaw))), V.mul(b.u, Math.tan(pitch)))); }
function cmbHole(){ return V.norm(V.mul(ORB.bodies[1].pos, -1)); }                          // MILLER -> Gargantua
function cmbHostiles(pred){ let n = 0; for (const e of COMBAT.ents) if (e.alive && e.team === 1 && !e.wreck && e.dying < 0 && (!pred || pred(CMB_CLS[e.cls]))) n++; return n; }
function cmbRange(){
  const C = COMBAT, me = C.me, R = C.rnd;
  for (let k = 0; k < 6; k++) {
    const d = cmbAhead((k - 2.5)*0.15 + (R() - 0.5)*0.06, 0.03 + (R() - 0.5)*0.14);
    const p = V.add(me.p, V.mul(d, 620 + R()*520));
    cmbSpawn('drone', p, V.norm(V.sub(me.p, p)), C.t + 0.25 + k*0.18);
  }
}
function cmbWing(n){
  const C = COMBAT, me = C.me, R = C.rnd, b = ORB.view.b;
  for (let k = 0; k < n; k++) {
    const pair = k >> 1, np = Math.ceil(n/2);
    const d = cmbAhead((pair - (np - 1)/2)*0.34 + (R() - 0.5)*0.12, 0.06 + (R() - 0.5)*0.18);
    const p = V.add(me.p, V.add(V.mul(d, 2300 + R()*600), V.mul(b.r, (k & 1)*80 - 40)));
    cmbSpawn('wasp', p, V.norm(V.sub(me.p, p)), C.t + 0.6 + pair*0.85 + (k & 1)*0.18);
  }
}
// where a capital holds, relative to you: between you and Gargantua and a little high, so the disc backlights it
function cmbStandOff(){
  const C = COMBAT, me = C.me, R = C.rnd, up = V.norm(me.p), h = cmbHole(), hh = V.norm(V.sub(h, V.mul(up, V.dot(h, up)))), side = V.cross(hh, up);
  return V.add(V.add(V.mul(hh, 4600 + R()*900), V.mul(up, 500 + R()*400)), V.mul(side, (R() - 0.5)*1600));
}
function cmbCapital(cls, escort){
  const C = COMBAT, me = C.me, D = C.dir, R = C.rnd;
  const rel = cmbStandOff(), p = V.add(me.p, V.mul(rel, 1.12));
  const up = V.norm(p), los = V.norm(V.sub(me.p, p)), f = V.norm(V.cross(los, up));         // broadside on arrival
  const e = cmbSpawn(cls, p, f, C.t + 1.1);
  e.ai.stand = rel; e.ai.t = 8;
  D.cap = e;
  if (escort) { const q = V.add(p, V.add(V.mul(f, -900), V.mul(up, -400))); const s = cmbSpawn(escort, q, f, C.t + 1.8); s.ai.stand = V.add(rel, V.add(V.mul(f, -900), V.mul(up, -400))); s.ai.t = 8; }
  if (C.cineOK) {                                    // over the MEINEN's shoulder toward the arrival, a long lens
    const toC = V.norm(V.sub(p, me.p)), mu = V.norm(me.p), sd = V.norm(V.cross(toC, mu)), off = V.add(V.add(V.mul(toC, -92), V.mul(mu, 22)), V.mul(sd, 30));
    C.shot = {kind: 'arrival', t0: C.t, t1: C.t + 4.4, eye: () => V.add(COMBAT.me.p, off), look: () => V.add(e.p, V.mul(V.norm(e.p), -120)), up: mu, fov: 30*DEG};
    cmbEv('cine', {kind: 'arrival', on: true});
  }
}

// ------------------------------------------------------------------------------------------ the director
function cmbLull(sec, next){ const D = COMBAT.dir; D.stage = 'lull'; D.t = 0; D.lull = sec; D.next = next; cmbEv('music', {cue: 'lull'}); }
function cmbDirector(dt){
  const C = COMBAT, D = C.dir; if (!D) return;
  D.t += dt;
  if (D.stage === 'range') {
    if (!D.spawned && D.t > 0.7) {
      D.spawned = true; cmbRange();
      cmbEv('title', {t: 'THE RANGE', s: 'SIX TARGET DRONES · WEAPONS FREE'}); cmbEv('music', {cue: 'range'});
    }
    if (D.spawned && D.t > 2 && (!cmbHostiles() || D.t > 60)) cmbLull(4.5, 'wing');
  } else if (D.stage === 'lull') {
    if (D.t >= D.lull) { D.stage = D.next; D.t = 0; D.spawned = false; }
  } else if (D.stage === 'wing') {
    if (!D.spawned) {
      D.spawned = true; D.wave++; C.score.wave = D.wave;
      const W = CMB_WAVES[Math.min(D.wave, CMB_WAVES.length) - 1], n = Math.min(7, W.wing + Math.max(0, D.wave - CMB_WAVES.length));
      cmbWing(n);
      cmbEv('title', {t: D.wave === 1 ? 'CONTACT' : 'WAVE ' + (CMB_ROMAN[D.wave] || D.wave), s: 'HOSTILE WING · ' + CMB_WORD[n] + ' FIGHTERS'});
      cmbEv('music', {cue: 'wing'}); cmbEv('wave', {n: D.wave});
    }
    if (D.t > 3 && !cmbHostiles()) cmbLull(4, 'capital');
  } else if (D.stage === 'capital') {
    if (!D.spawned) {
      D.spawned = true; D.capDead = -1;
      const W = CMB_WAVES[Math.min(D.wave, CMB_WAVES.length) - 1], name = CMB_CLS[W.cap].name;
      cmbCapital(W.cap, W.escort);
      D.titleAt = C.t + (C.shot ? 4.5 : 1.4); D.title = {t: 'THE ' + name, s: 'DOMINION ' + name + ' · SHIELDS UP' + (W.cap === 'cruiser' ? ' · LAUNCHING FIGHTERS' : '')};
      cmbEv('music', {cue: 'capital'}); cmbEv('capArrive', {cls: W.cap, name});
    }
    if (D.title && C.t >= D.titleAt) { cmbEv('title', D.title); D.title = null; }
    // the wave is won when the capital is gone and everything it brought with it (after the kill shot has played out);
    // damage control patches the hull a little before the next
    if (D.capDead >= 0 && C.t - D.capDead > 3.5 && !C.shot && !C.shotAt && !cmbHostiles()) {
      const P = C.pl, fix = Math.min(35, CMB.HULL - P.hull);
      if (fix > 0.5) { P.hull += fix; cmbEv('repair', {amt: Math.round(fix)}); }
      cmbLull(6, 'wing');
    }
  }
}

// ------------------------------------------------------------------------------------------ AI
// steer clear of the other hulls, and of yours: nothing here collides, so nothing may fly through anything
function cmbAvoid(e, want){
  const C = COMBAT; let w = want;
  const push = (q, rr, k) => { const d = V.sub(e.p, q), l = V.len(d); if (l < rr && l > 1e-3) w = V.add(w, V.mul(d, k*(1 - l/rr)/l)); };
  for (const o of C.ents) {
    if (o === e || !o.alive || o.arrive || o.wreck) continue;
    const c = CMB_CLS[o.cls];
    push(o.p, c.capital ? c.ext[2]*1.15 + 60 : 70, c.capital ? 2.5 : 1.2);
  }
  push(C.me.p, 110, 2.2);
  return V.norm(w);
}
function cmbWasp(e, c, dt){
  const C = COMBAT, me = C.me, R = C.rnd, TC = ORB.TC, A = e.ai;
  const rel = V.sub(me.p, e.p), d = V.len(rel) || 1, toMe = V.mul(rel, 1/d);
  A.t -= dt; e.cool -= dt;
  let want;
  if (A.mode === 'attack') {
    const vr = V.mul(V.sub(me.v, e.v), TC), tl = Math.min(2, d/(c.spd + 1))*0.5;         // close on where you will be
    want = V.norm(V.add(rel, V.mul(vr, tl)));
    if (d < 380 || A.t < -14) {                                                           // too close, or circling: break off
      const up = V.norm(e.p), side = V.norm(V.cross(toMe, up)), s = R() < 0.5 ? -1 : 1;
      A.mode = 'break'; A.t = 1.1 + R()*1.2; A.dir = V.norm(V.add(V.add(V.mul(side, s), V.mul(up, R() - 0.35)), V.mul(toMe, 0.25)));
    }
  } else if (A.mode === 'break') {
    want = A.dir; if (A.t <= 0) { A.mode = 'extend'; A.t = 2 + R()*2.5; }
  } else {
    want = V.norm(V.add(V.mul(toMe, -1), V.mul(A.dir, 0.7)));
    if (d > 1450 + e.seed*900 || A.t <= 0) { A.mode = 'attack'; A.t = 0; }
  }
  cmbWaspGuns(e, c, d, dt, A.mode === 'attack');                                         // a burst in progress finishes
  want = cmbAvoid(e, want);
  cmbTurn(e, want, c.turn*dt, 0.8, dt);
  e.vcmd = V.mul(e.f, c.spd*(A.mode === 'break' ? 1.2 : A.mode === 'extend' ? 1.1 : 1)/TC);
}
function cmbWaspGuns(e, c, d, dt, attacking){
  const C = COMBAT, me = C.me, R = C.rnd, TC = ORB.TC;
  if (e.burst > 0) {
    e.bt -= dt;
    while (e.burst > 0 && e.bt <= 0) {
      e.bt += 1/c.rate; e.burst--; e.gi ^= 1;
      const from = cmbAt(e, c.guns[e.gi]), L = cmbLead(from, e.v, me.p, me.v, c.speed), dir = cmbJitter(L ? L.dir : e.f, c.spread);
      cmbBolt(from, V.add(e.v, V.mul(dir, c.speed/TC)), 1, 1, 1.2);
      cmbFx(1, from, e.v, 0.05, 1.8, 0, [3, 1.3, 0.5]);
    }
    return;
  }
  if (!attacking || e.cool > 0 || d > c.range || !C.pl || C.pl.down >= 0 || C.shot) return;
  const L = cmbLead(e.p, e.v, me.p, me.v, c.speed);
  if (L && V.dot(e.f, L.dir) > Math.cos(5*DEG)) { e.burst = c.burst; e.bt = 0; e.cool = c.rest + R()*1.6; }
}
function cmbDrone(e, c, dt){
  const t = COMBAT.t, s = e.seed*6.283, up = V.norm(e.p), side = V.norm(V.cross(e.f, up));
  // a lazy figure of eight, so they hang there like targets and never quite sit still
  e.vcmd = V.mul(V.add(V.mul(side, Math.sin(t*0.5 + s)), V.mul(up, 0.5*Math.sin(t*0.9 + s*1.3))), c.spd/ORB.TC);
  if (e.jink) { e.vcmd = V.add(e.vcmd, V.mul(e.jink, 1/ORB.TC)); e.jink = V.mul(e.jink, Math.exp(-dt/0.6)); }
  e.f = V.rot(e.f, up, (e.seed > 0.5 ? 0.3 : -0.3)*dt);
  cmbTurn(e, e.f, 0, 0, dt);
}
function cmbCapitalAI(e, c, dt){
  const C = COMBAT, me = C.me, R = C.rnd, TC = ORB.TC, A = e.ai;
  if (!A.stand || (A.t -= dt) <= 0) { A.t = 7 + R()*5; A.stand = cmbStandOff(); }
  const goal = V.add(me.p, A.stand), to = V.sub(goal, e.p), dist = V.len(to);
  e.vcmd = dist > 60 ? V.mul(to, Math.min(c.spd, dist*0.04)/(dist*TC)) : [0, 0, 0];
  const up = V.norm(e.p), los = V.norm(V.sub(me.p, e.p));
  let face = dist > 900 ? V.norm(to) : V.cross(los, up);                                   // far: go; there: broadside
  if (V.dot(face, e.f) < 0 && dist <= 900) face = V.mul(face, -1);
  cmbTurn(e, V.norm(face), c.turn*dt, 0, dt);
  if (C.shot || !C.pl || C.pl.down >= 0) return;
  const d = cmbDist(me.p, e.p);
  for (const T of e.tur) {                                                                // flak: proximity-fused heavy rounds
    T.cool -= dt;
    if (T.cool > 0 || d > 7000) continue;
    T.cool = (0.6 + R()*0.9)/c.flak;
    const from = cmbAt(e, T.p), L = cmbLead(from, e.v, me.p, me.v, CMB_FLAK.speed);
    if (L) { cmbBolt(from, V.add(e.v, V.mul(cmbJitter(L.dir, CMB_FLAK.spread), CMB_FLAK.speed/TC)), 1, 2, CMB_FLAK.life); cmbFx(1, from, e.v, 0.08, 7, 0, [3, 1.6, 0.6]); }
  }
  if (c.pods && d < 6500 && (A.mt = (A.mt == null ? 4 : A.mt) - dt) <= 0) {              // frigate: a missile pair
    A.mt = 8 + R()*4;
    for (const q of c.pods) { const p = cmbAt(e, q); C.torps.push({team: 1, p, v: V.add(e.v, V.mul(e.f, 25/TC)), po: p, f: e.f, u: e.u, target: 'me', t: 0, ign: 0.4, spd: 60, trail: 0, vcmd: [0, 0, 0], hp: 1, ext: CMB_MSL.ext}); }
    cmbEv('missile');
  }
  if (c.hangar && (A.lt = (A.lt == null ? 6 : A.lt) - dt) <= 0) {                         // cruiser: launch a pair of fighters
    A.lt = c.launch;
    if (cmbHostiles(k => k.fighter) < 4) for (const q of c.hangar) {
      const p = cmbAt(e, q), out = V.norm(V.sub(p, e.p)), w = cmbSpawn('wasp', p, out, 0);
      w.v = V.add(e.v, V.mul(out, 90/TC)); w.ai.mode = 'extend'; w.ai.t = 1.5; w.ai.dir = out;
    }
    cmbEv('launch');
  }
}
// a capital that has lost its hull: fires inside it for 4.5 s, then the big one, and its wreck breaks up and drifts
function cmbDying(e, c, dt){
  const C = COMBAT, R = C.rnd, a = C.t - e.dying;
  e.vcmd = V.mul(e.vcmd, Math.exp(-dt/2));
  if (e.spin) { const l = V.len(e.spin), ax = V.mul(e.spin, 1/l); e.f = V.rot(e.f, ax, l*dt); e.u = V.rot(e.u, ax, l*dt); [e.f, e.u] = QV.ortho(e.f, e.u); }
  e.damage = Math.min(1, 0.45 + a*0.15);
  const ext = c.ext;
  if (a < 4.5 && R() < dt*(5 + a*4)) {
    const q = cmbAt(e, [(R()*2 - 1)*ext[0]*0.8, (R()*2 - 1)*ext[1], (R()*2 - 1)*ext[2]*0.9]);
    cmbBoom(q, e.v, ext[2]*(0.05 + R()*0.1)*(1 + a*0.4), {sparks: 16, smoke: 1, shards: 1, shardK: 0.6});
  }
  if (a >= 4.5 && e.alive) {
    const big = ext[2];
    cmbBoom(e.p, e.v, big*0.9, {ring: true, sparks: 240, smoke: 10, flash: 3.4, shards: 24, shardK: 0.8});
    for (let k = 0; k < 6; k++) cmbBoom(cmbAt(e, [(R()*2 - 1)*ext[0], (R()*2 - 1)*ext[1], (R()*2 - 1)*ext[2]]), e.v, big*0.3, {sparks: 30, smoke: 2, quiet: true});
    for (let k = 0; k < 3; k++) {                                                          // hull sections, burning, tumbling apart
      const q = cmbAt(e, [(R()*2 - 1)*ext[0]*0.5, (R()*2 - 1)*ext[1]*0.5, (k - 1)*ext[2]*0.55]);
      const w = {id: C.idN++, cls: e.cls, team: 1, p: q, v: V.add(e.v, V.mul(cmbRandDir(), (18 + R()*22)/ORB.TC)), po: q, f: e.f, u: e.u, vcmd: [0, 0, 0],
        hp: 1e9, sh: 0, alive: true, dying: -1, arrive: 0, damage: 1, glow: 0, scale: 0.55 - k*0.1, wreck: true, t0: C.t, spin: V.mul(cmbRandDir(), 0.1 + R()*0.18), ai: {}, tur: [], seed: R()};
      C.ents.push(w);
    }
    e.alive = false; C.flash = Math.max(C.flash, 1);
    if (C.dir && C.dir.cap === e) C.dir.capDead = C.t;
    cmbEv('capBoom', {name: CMB_CLS[e.cls].name, dist: cmbDist(e.p, C.me.p)});
    cmbEv('music', {cue: 'kill'});
  }
}

// ------------------------------------------------------------------------------------------ damage
function cmbDamage(e, dmg, at, byTorp){
  const C = COMBAT, c = CMB_CLS[e.cls];
  if (!e.alive || e.dying >= 0 || e.wreck || e.arrive) return;
  e.hitT = C.t;
  if (e.sh > 0) {
    e.sh = Math.max(0, e.sh - dmg*(byTorp ? 1.5 : 1));
    const n = V.norm(V.sub(at, e.p));
    cmbFx(5, at, e.v, 0.5, Math.max(12, c.ext[2]*0.14), 0, [1.6, 0.8, 0.25], n);
    cmbEv('hit', {shield: true, cls: e.cls});
    if (e.sh <= 0) cmbEv('capShields', {name: c.name});
    return;
  }
  e.hp -= dmg*(byTorp && c.capital ? 2 : 1);
  e.damage = Math.max(e.damage, (1 - Math.max(0, e.hp)/c.hp)*0.8);
  if (c.capital ? C.rnd() < 0.35 : true) cmbBoom(at, e.v, c.capital ? 8 + C.rnd()*10 : 4, {sparks: c.capital ? 12 : 6, smoke: c.capital ? 1 : 0, flash: 1.2, quiet: true});
  if (e.cls === 'drone') e.jink = V.mul(cmbRandDir(), 30);
  if (e.hp <= 0) cmbKill(e);
  else cmbEv('hit', {shield: false, cls: e.cls});
}
function cmbKill(e){
  const C = COMBAT, c = CMB_CLS[e.cls];
  C.score.kills++; C.pl.killT = C.t;
  cmbEv('kill', {cls: e.cls, name: c.name, kills: C.score.kills});
  if (c.capital) {
    e.dying = C.t; e.spin = V.mul(cmbRandDir(), 0.04 + C.rnd()*0.05);
    cmbEv('capDying', {name: c.name});
    // the kill shot: a locked-off wide from your side of it, the disc behind, from just before the big one to after
    if (C.cineOK) {
      const me = C.me, up = V.norm(e.p), L = c.ext[2]*2, back = V.norm(V.sub(me.p, e.p)), sd = V.norm(V.cross(back, up));
      // it rides a ballistic anchor released with the hull (the hull itself is gone after the big one)
      const off = V.add(V.add(V.mul(back, L*2.3), V.mul(sd, L*1.1)), V.mul(up, L*0.35)), anchor = {p: e.p, v: e.v};
      C.shotAt = {t: C.t + 3.1, shot: {kind: 'kill', t0: 0, t1: 0, dur: 5.2, anchor, eye: () => V.add(anchor.p, off), look: () => e.alive ? e.p : anchor.p, up, fov: 44*DEG}};
    }
    return;
  }
  e.alive = false;
  cmbBoom(e.p, e.v, c.boom, {sparks: 36, smoke: 2, shards: c.fighter ? 6 : 4});
}

// ------------------------------------------------------------------------------------------ your weapons
function cmbSeek(dt){
  const C = COMBAT, P = C.pl, me = C.me;
  let best = null, bs = Infinity;
  for (const e of C.ents) {
    if (!e.alive || e.team !== 1 || e.arrive || e.dying >= 0 || e.wreck) continue;
    const d = V.sub(e.p, me.p), L = V.len(d), ang = Math.acos(clamp(V.dot(d, me.f)/L, -1, 1));
    if (ang > CMB.SEEK) continue;
    const s = ang + L/40000 - (e === P.tgt ? 0.04 : 0);                                   // nearest the nose; keep the one you have
    if (s < bs) { bs = s; best = e; }
  }
  if (best !== P.tgt) { P.tgt = best; P.lockT = 0; if (P.locked) { P.locked = false; cmbEv('lock', {on: false}); } }
  P.lead = null;
  if (!P.tgt) return;
  const t = P.tgt, c = CMB_CLS[t.cls], d = V.sub(t.p, me.p), ang = Math.acos(clamp(V.dot(d, me.f)/V.len(d), -1, 1));
  if (ang < CMB.LOCK_CONE) P.lockT = Math.min(c.lock, P.lockT + dt);
  else if (!P.locked || ang > CMB.LOCK_KEEP) P.lockT = Math.max(0, P.lockT - 2*dt);
  const was = P.locked; P.locked = P.lockT >= c.lock && ang < CMB.LOCK_KEEP;
  if (P.locked !== was) cmbEv('lock', {on: P.locked});
  P.lead = cmbLead(me.p, me.v, t.p, t.v, CMB.GUN_SPEED);
}
function cmbGuns(dt){
  const C = COMBAT, P = C.pl, me = C.me, R = C.rnd, TC = ORB.TC;
  P.heat = Math.max(0, P.heat - CMB.GUN_COOL*dt);
  if (P.over && P.heat < CMB.GUN_RESET) { P.over = false; cmbEv('cool'); }
  // where the rounds go: the nose, or gimballed onto the lead point when it is within 4 degrees of it
  const tg = P.tgt; P.aim = me.f; P.aimR = tg ? cmbDist(tg.p, me.p) : 900;
  if (P.lead && V.dot(P.lead.dir, me.f) > Math.cos(CMB.GUN_GIMBAL)) P.aim = P.lead.dir;
  if (!C.input.fire || P.over || P.down >= 0 || C.shot) { P.fireT = 0; return; }
  P.fireT -= dt;
  while (P.fireT <= 0) {
    P.fireT += 1/CMB.GUN_RATE; P.side ^= 1;
    const from = cmbAt(me, CMB.MUZZLES[P.side]);
    let dir = P.aim;
    if (tg && P.aim !== me.f) { const L = cmbLead(from, me.v, tg.p, tg.v, CMB.GUN_SPEED); if (L && V.dot(L.dir, me.f) > Math.cos(CMB.GUN_GIMBAL)) dir = L.dir; }
    cmbBolt(from, V.add(me.v, V.mul(cmbJitter(dir, CMB.GUN_SPREAD), CMB.GUN_SPEED/TC)), 0, 0, CMB.GUN_LIFE);
    cmbFx(1, from, me.v, 0.05, 2.2, 0, [1.9, 2.3, 3.0]);                                   // small and dim: 14 Hz is a strobe
    C.muzzle = {p: from, t: C.t}; C.fired++;
    cmbKick(0.05 + R()*0.03);
    P.heat += CMB.GUN_HEAT;
    if (P.heat >= 1) { P.heat = 1; P.over = true; cmbEv('overheat'); P.fireT = 0; break; }
  }
}
function cmbTorpedo(){
  const C = COMBAT, P = C.pl, me = C.me, TC = ORB.TC;
  if (!P || P.down >= 0 || C.shot) return;
  if (P.torps <= 0) { cmbEv('torpEmpty'); return; }
  P.torps--;
  const p = cmbAt(me, [0, -2.6, 3]), down = V.mul(V.norm(me.p), -1);
  C.torps.push({team: 0, p, po: p, v: V.add(me.v, V.add(V.mul(down, 14/TC), V.mul(me.f, 40/TC))), f: me.f, u: me.u, target: P.locked ? P.tgt : null,
    t: 0, ign: 0.35, spd: 40, trail: 0, vcmd: [0, 0, 0], hp: 1, ext: CMB_MSL.ext});
  cmbEv('torp', {guided: !!P.locked});
}
function cmbTorps(dt){
  const C = COMBAT, R = C.rnd, TC = ORB.TC, keep = [];
  for (const m of C.torps) {
    m.t += dt; m.po = m.p;
    const player = m.team === 0, tgt = m.target === 'me' ? C.me : (m.target && m.target.alive && m.target.dying < 0 ? m.target : null);
    const life = player ? CMB.TORP_LIFE : CMB_MSL.life;
    if (m.t < m.ign) { for (let rem = dt*TC; rem > 1e-9; rem -= 0.25) cmbCoast(m, Math.min(rem, 0.25)); }
    else {
      m.spd = Math.min(player ? CMB.TORP_SPEED : CMB_MSL.speed, m.spd + (player ? CMB.TORP_ACC : CMB_MSL.acc)*dt);
      if (tgt) {
        const L = cmbLead(m.p, m.v, tgt.p, tgt.v, Math.max(m.spd, 200)), want = L ? L.dir : V.norm(V.sub(tgt.p, m.p));
        cmbTurn(m, want, (player ? CMB.TORP_TURN : CMB_MSL.turn)*dt, 0, dt);
      }
      m.vcmd = V.mul(m.f, m.spd/TC);
      for (let rem = dt*TC; rem > 1e-9; rem -= 0.25) cmbFly(m, Math.min(rem, 0.25), 0.12, 900);
      if ((m.trail += dt) > 0.03) {                                                        // exhaust: a smoke puff every 30 ms
        m.trail = 0;
        cmbFx(3, V.sub(m.p, V.mul(m.f, 4)), m.v, 1.6 + R(), 3.5, 9, player ? [0.55, 0.55, 0.6] : [0.5, 0.45, 0.4]);
      }
    }
    // detonation: the proximity fuse against its target (or anything hostile, unguided), a direct hit on a capital
    let boom = m.t > life, hitE = null;
    if (player) {
      for (const e of C.ents) {
        if (!e.alive || e.team !== 1 || e.arrive || e.dying >= 0 || e.wreck) continue;
        if (tgt && e !== tgt) continue;
        const c = CMB_CLS[e.cls];
        const hit = c.capital ? cmbSegHit(m.po[0] - e.po[0], m.po[1] - e.po[1], m.po[2] - e.po[2], m.p[0] - e.p[0], m.p[1] - e.p[1], m.p[2] - e.p[2], e, 1.05) >= 0
                              : cmbDist(m.p, e.p) < CMB.TORP_FUSE;
        if (hit) { hitE = e; boom = true; break; }
      }
    } else if (tgt && cmbDist(m.p, tgt.p) < CMB_MSL.fuse) { boom = true; hitE = 'me'; }
    if (m.hp <= 0) boom = true;
    if (boom) {
      cmbBoom(m.p, m.v, player ? 20 : 12, {sparks: 30, smoke: 2, shards: 2, flash: 2.6});
      if (hitE === 'me') cmbHurt(CMB_MSL.dmg, m.p, 'missile');
      else if (hitE) cmbDamage(hitE, CMB.TORP_DMG, m.p, true);
      continue;
    }
    keep.push(m);
  }
  C.torps = keep;
}

// ------------------------------------------------------------------------------------------ rounds in flight
// Every round flies this frame, then is tested against the other side in each target's own frame. Hit points are taken
// relative to the target and put back at its END-of-frame position: that is where everything spawned now is born.
function cmbBolts(dt, h){
  const C = COMBAT, B = C.B, me = C.me, self = {ext: CMB.EXT, f: me.f, u: me.u};
  let n = C.nb;
  for (let i = 0; i < n; i++) { const o = i*CMB_BS; B[o+6] = B[o]; B[o+7] = B[o+1]; B[o+8] = B[o+2]; }
  cmbCoastPool(B, n, CMB_BS, h);
  const relHit = (o, q, qo, t) => { const ax = B[o+6] - qo[0], ay = B[o+7] - qo[1], az = B[o+8] - qo[2];
    return [q[0] + ax + (B[o] - q[0] - ax)*t, q[1] + ay + (B[o+1] - q[1] - ay)*t, q[2] + az + (B[o+2] - q[2] - az)*t]; };
  for (let i = 0; i < n; ) {
    const o = i*CMB_BS;
    let dead = (B[o+9] -= dt) <= 0;
    if (!dead) {
      const team = B[o+10], kind = B[o+11];
      if (team === 0) {                                                                     // yours: hostiles and their missiles
        let hitE = null, ht = 2;
        for (const e of C.ents) {
          if (!e.alive || e.team !== 1 || e.arrive || e.wreck) continue;
          const t = cmbSegHit(B[o+6] - e.po[0], B[o+7] - e.po[1], B[o+8] - e.po[2], B[o] - e.p[0], B[o+1] - e.p[1], B[o+2] - e.p[2], e, 1);
          if (t >= 0 && t < ht) { ht = t; hitE = e; }
        }
        for (const m of C.torps) {
          if (m.team !== 1) continue;
          const t = cmbSegHit(B[o+6] - m.po[0], B[o+7] - m.po[1], B[o+8] - m.po[2], B[o] - m.p[0], B[o+1] - m.p[1], B[o+2] - m.p[2], m, 1.6);
          if (t >= 0 && t < ht) { ht = t; hitE = m; }
        }
        if (hitE) {
          if (hitE.cls) cmbDamage(hitE, CMB.GUN_DMG, relHit(o, hitE.p, hitE.po, ht), false); else { hitE.hp = 0; cmbEv('hit', {shield: false, cls: 'missile'}); }
          dead = true;
        }
      } else if (C.pl && C.pl.down < 0 && C.hot) {                                          // theirs: you
        const ax = B[o+6] - me.po[0], ay = B[o+7] - me.po[1], az = B[o+8] - me.po[2], bx = B[o] - me.p[0], by = B[o+1] - me.p[1], bz = B[o+2] - me.p[2];
        const t = cmbSegHit(ax, ay, az, bx, by, bz, self, kind === 2 ? 1 : 1.1);
        if (t >= 0) {
          const at = relHit(o, me.p, me.po, t);
          if (kind === 2) cmbBoom(at, me.v, 9, {sparks: 14, smoke: 1, quiet: true});
          cmbHurt(kind === 2 ? CMB_FLAK.direct : CMB_CLS.wasp.dmg, at, kind === 2 ? 'flak' : 'guns'); dead = true;
        } else if (kind === 2) {                                                            // flak: burst on closest approach
          const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx*dx + dy*dy + dz*dz, tc = L2 > 0 ? clamp(-(ax*dx + ay*dy + az*dz)/L2, 0, 1) : 0;
          const cx = ax + dx*tc, cy = ay + dy*tc, cz = az + dz*tc, dmin = Math.hypot(cx, cy, cz);
          if (dmin < CMB_FLAK.fuse && tc < 1) {
            const at = [me.p[0] + cx, me.p[1] + cy, me.p[2] + cz];
            cmbBoom(at, me.v, 11, {sparks: 18, smoke: 1, flash: 2});
            cmbHurt(CMB_FLAK.dmg*(1 - dmin/CMB_FLAK.fuse) + 1, at, 'flak'); dead = true;
          }
        }
      }
    }
    if (dead) { n--; if (i < n) B.copyWithin(o, n*CMB_BS, n*CMB_BS + CMB_BS); continue; }
    i++;
  }
  C.nb = n;
}
function cmbParticles(dt, h){
  const C = COMBAT, F = C.F, t = C.t;
  let n = C.nf;
  for (let i = 0; i < n; ) {
    const o = i*CMB_FS;
    if (t - F[o+6] > F[o+7]) { n--; if (i < n) F.copyWithin(o, n*CMB_FS, n*CMB_FS + CMB_FS); continue; }
    i++;
  }
  C.nf = n;
  cmbCoastPool(F, n, CMB_FS, h);
  // debris: ballistic, tumbling, trailing embers while hot
  const R = C.rnd, keep = [];
  for (const s of C.shards) {
    if (t - s.t0 > s.life) continue;
    cmbCoast(s, h);
    const l = V.len(s.spin), ax = V.mul(s.spin, 1/l);
    s.f = V.rot(s.f, ax, l*dt); s.u = V.rot(s.u, ax, l*dt); [s.f, s.u] = QV.ortho(s.f, s.u);
    if (t - s.t0 < 2.2 && R() < dt*14) cmbFx(8, s.p, s.v, 0.5 + R()*0.6, s.scale*1.4, 0, [2.2, 0.9, 0.3]);
    keep.push(s);
  }
  C.shards = keep;
}

// ------------------------------------------------------------------------------------------ the step
// dt: REAL seconds. Runs after flightStep() and before the cutaway camera override (cmbShotView). The ship has already
// moved this frame, so the step goes MOTION first -- everything that exists flies this frame, and what it hits it hits
// now -- then DECISIONS at the frame's end: arrivals, the director, your guns, the AI. Whatever is spawned is born at an
// end-of-frame position and first moves next frame. (Spawning and then integrating in the same frame put every round a
// frame's orbital motion, 1.6 km, ahead of the gun that fired it; ships waiting to warp in must fly unseen for the same
// reason, or the orbit carries you 30 km from where they appear.)
function combatStep(dt){
  const C = COMBAT;
  if (!C.hot && !cmbActive()) { C.t += dt; return; }
  const H = HELM, TC = ORB.TC, h = dt*TC;
  C.t += dt;
  if (C.hot && H.mode !== 'helm') cmbSafe(H.mode === 'auto' ? 'auto' : 'station');
  if (H.p) cmbSync();
  const P = C.pl;
  // ---- 1. motion
  cmbParticles(dt, h);
  for (const e of C.ents) e.po = e.p;
  for (let rem = h; rem > 1e-9; rem -= 0.25) {                                            // sub-steps of <= 0.25 s sim, as the helm
    const s = Math.min(rem, 0.25);
    for (const e of C.ents) {
      if (!e.alive) continue;
      if (e.wreck || !C.frame) cmbCoast(e, s);
      else { const c = CMB_CLS[e.cls]; cmbFly(e, s, c.tau, c.acc); }
    }
  }
  // nothing collides, so nothing may pass through your hull: a small craft inside 45 m is set back out along the line
  for (const e of C.ents) {
    if (!e.alive || e.arrive || e.wreck || CMB_CLS[e.cls].capital) continue;
    const d = V.sub(e.p, C.me.p), l = V.len(d);
    if (l < 45 && l > 1e-6) { const n = V.mul(d, 1/l), vn = V.dot(V.sub(e.v, C.me.v), n); e.p = V.add(C.me.p, V.mul(n, 45)); if (vn < 0) e.v = V.sub(e.v, V.mul(n, vn)); }
  }
  for (const a of [C.shot && C.shot.anchor, C.shotAt && C.shotAt.shot.anchor]) if (a) for (let rem = h; rem > 1e-9; rem -= 0.25) cmbCoast(a, Math.min(rem, 0.25));
  cmbTorps(dt);
  cmbBolts(dt, h);
  // ---- 2. decisions, at the frame's end
  // the cutaway: a scheduled one starts, a running one ends
  if (C.shotAt && C.t >= C.shotAt.t) { const s = C.shotAt.shot; C.shotAt = null; if (C.cineOK && !C.shot) { s.t0 = C.t; s.t1 = C.t + s.dur; C.shot = s; cmbEv('cine', {kind: s.kind, on: true}); } }
  if (C.shot && C.t >= C.shot.t1) { const k = C.shot.kind; C.shot = null; cmbEv('cine', {kind: k, on: false}); }
  if (C.hot && P) {
    // hull 0: the emergency jump once the wide shot has played (main.js runs the tunnel and calls cmbReset at its peak)
    if (P.down >= 0 && !P.jumped && C.t - P.down > 2.6) { P.jumped = true; cmbEv('ejump', {kills: C.score.kills, wave: C.score.wave}); }
    if (P.down < 0) {
      cmbDirector(dt);
      cmbSeek(dt); cmbGuns(dt);
      if (C.input.torp) { C.input.torp = 0; cmbTorpedo(); }
      if (P.torps < CMB.TORP_MAX && (P.reload += dt) >= CMB.TORP_RELOAD) { P.torps++; P.reload = 0; cmbEv('reload'); }
      if (C.t - P.lastHit > CMB.REGEN_DELAY) P.sh = Math.min(CMB.SHIELD, P.sh + CMB.REGEN*dt);
      if (P.crit && P.hull > 25) P.crit = false;
    }
    // a wounded ship vents: smoke and embers off the hull (and a lot of both once it is going under)
    if ((P.crit || P.down >= 0) && C.rnd() < dt*(P.down >= 0 ? 16 : 5)) {
      const R = C.rnd, me = C.me, q = cmbAt(me, [(R()*2 - 1)*6, (R()*2 - 1)*1.5, (R()*2 - 1)*14]);
      cmbFx(3, q, V.add(me.v, V.mul(cmbRandDir(), 5/TC)), 1.8 + R(), 2.5, 9, [0.42, 0.4, 0.38]);
      if (R() < 0.4) cmbFx(8, q, me.v, 0.35 + R()*0.3, 2.2, 0, [2.6, 1.1, 0.4]);
    }
  }
  C.input.torp = 0;
  // arrivals, the AI (which fires), the dying, and the wrecks' smoke
  for (const e of C.ents) {
    if (!e.alive) continue;
    const c = CMB_CLS[e.cls], R = C.rnd;
    if (e.arrive) {
      if (C.t < e.arrive) continue;
      e.arrive = 0;
      if (e.cls === 'drone') cmbFx(1, e.p, e.v, 0.45, 14, 0, [1.2, 1.6, 2.4]);           // the range's targets just light up
      else { cmbWarpFx(e.p, e.v, c.ext[2]*(c.capital ? 0.6 : 1.5), e.f, false); cmbEv('warp', {big: !!c.capital, cls: e.cls, dist: cmbDist(e.p, C.me.p)}); }
    }
    if (e.wreck) {                                                                          // burning, breaking up, gone once far or cold
      const l = V.len(e.spin), ax = V.mul(e.spin, 1/l); e.f = V.rot(e.f, ax, l*dt); e.u = V.rot(e.u, ax, l*dt); [e.f, e.u] = QV.ortho(e.f, e.u);
      if (R() < dt*3) cmbFx(3, cmbAt(e, [(R()*2 - 1)*c.ext[0]*0.5, (R()*2 - 1)*c.ext[1]*0.5, (R()*2 - 1)*c.ext[2]*0.5]), e.v, 3 + R()*2, c.ext[2]*0.12*e.scale, c.ext[2]*0.25*e.scale, [0.45, 0.4, 0.37]);
      if (R() < dt*0.9) cmbBoom(cmbAt(e, [0, 0, (R()*2 - 1)*c.ext[2]*0.5]), e.v, c.ext[2]*0.06*e.scale, {sparks: 8, smoke: 1, quiet: true});
      if (C.t - e.t0 > 30 || cmbDist(e.p, C.me.p) > 16000) e.alive = false;
      continue;
    }
    if (e.dying >= 0) cmbDying(e, c, dt);
    else if (C.hot) { if (c.fighter) cmbWasp(e, c, dt); else if (c.capital) cmbCapitalAI(e, c, dt); else cmbDrone(e, c, dt); }
  }
  C.ents = C.ents.filter(e => e.alive);
  C.flash = Math.max(0, C.flash - dt/0.6);
  C.prevP = H.p;
}

// ------------------------------------------------------------------------------------------ what the others read
// the cutaway camera, MILLER-relative: {eye, f, u, fov} or null
function cmbShotView(){
  const S = COMBAT.shot; if (!S) return null;
  const eye = typeof S.eye === 'function' ? S.eye() : S.eye;
  const look = typeof S.look === 'function' ? S.look() : S.look;
  const f = V.norm(V.sub(look, eye)), r = V.norm(V.cross(f, S.up)), u = V.cross(r, f);
  return {eye, f, u, r, fov: S.fov, kind: S.kind};
}
function cmbCineCancel(){ const C = COMBAT; if (C.shot) { const k = C.shot.kind; C.shot = null; cmbEv('cine', {kind: k, on: false}); } C.shotAt = null; }
// hulls to draw: {cls (mesh), p (MILLER m), f, u, scale, damage, team, glow}
function cmbDrawList(){
  const C = COMBAT, out = [];
  for (const e of C.ents) {
    if (!e.alive || e.arrive) continue;
    const c = CMB_CLS[e.cls];
    out.push({cls: c.mesh, p: e.p, f: e.f, u: e.u, scale: e.scale || 1, damage: e.damage || 0, team: 1, glow: e.dying >= 0 || e.wreck ? 0 : 0.25, ext: c.ext});
  }
  for (const s of C.shards) out.push({cls: 'shard', p: s.p, f: s.f, u: s.u, scale: s.scale, damage: 1, team: s.team, glow: 0, ext: [1, 1, 1]});
  return out;
}
// Sprite rows (16 floats: pos km, size km, colour, type, axis x + age, axis y + seed) and beam rows (12 floats: a km,
// width km, b km, core, colour, k) for everything combat draws, camera-relative (eye: MILLER-relative metres).
// Returns [sprites, beams].
function cmbFxRows(S, Bm, eye){
  const C = COMBAT, F = C.F, B = C.B, t = C.t, ex = eye[0], ey = eye[1], ez = eye[2], NS = S.length/16, NBm = Bm.length/12, TC = ORB.TC;
  let ns = 0, nb = 0;
  const spr = (x, y, z, size, r, g, b, type, age, seed, ax, ay) => {
    if (ns >= NS) return;
    const o = ns++*16;
    S[o] = (x - ex)*1e-3; S[o+1] = (y - ey)*1e-3; S[o+2] = (z - ez)*1e-3; S[o+3] = size*1e-3;
    S[o+4] = r; S[o+5] = g; S[o+6] = b; S[o+7] = type;
    S[o+8] = ax ? ax[0] : 0; S[o+9] = ax ? ax[1] : 0; S[o+10] = ax ? ax[2] : 0; S[o+11] = age;
    S[o+12] = ay ? ay[0] : 0; S[o+13] = ay ? ay[1] : 0; S[o+14] = ay ? ay[2] : 0; S[o+15] = seed;
  };
  const beam = (ax, ay, az, bx, by, bz, w, r, g, b, core) => {
    if (nb >= NBm) return;
    const o = nb++*12;
    Bm[o] = (ax - ex)*1e-3; Bm[o+1] = (ay - ey)*1e-3; Bm[o+2] = (az - ez)*1e-3; Bm[o+3] = w*1e-3;
    Bm[o+4] = (bx - ex)*1e-3; Bm[o+5] = (by - ey)*1e-3; Bm[o+6] = (bz - ez)*1e-3; Bm[o+7] = core;
    Bm[o+8] = r; Bm[o+9] = g; Bm[o+10] = b; Bm[o+11] = 1;
  };
  // particles (the demo's buildFx, in metres)
  for (let i = 0; i < C.nf; i++) {
    const o = i*CMB_FS, a = clamp((t - F[o+6])/F[o+7], 0, 1), kind = F[o+8], size = F[o+9], seed = F[o+11];
    const x = F[o], y = F[o+1], z = F[o+2], cr = F[o+12], cg = F[o+13], cb = F[o+14];
    if (kind === 1) { const k = (1 - a)*(1 - a)*3; spr(x, y, z, size*(1 + a), cr*k, cg*k, cb*k, 1, a, seed); }
    else if (kind === 2) spr(x, y, z, size + F[o+10]*Math.sqrt(a), cr, cg, cb, 2, a, seed);
    else if (kind === 3) spr(x, y, z, size + F[o+10]*a, cr, cg, cb, 3, a, seed);
    else if (kind === 0 || kind === 8) { const k = kind === 8 ? (1 - a) : 1; spr(x, y, z, size, cr*k, cg*k, cb*k, 0, a, seed); }
    else if (kind === 6) {                                                                // spark: a streak along its ejecta
      const k = (1 - a)*(1 - a), s = 0.03*(1 - 0.3*a);
      beam(x - F[o+15]*s, y - F[o+16]*s, z - F[o+17]*s, x, y, z, size, 4*k, 2.2*k, 0.9*k, 1);
    } else if (kind === 4 || kind === 5) {                                                // ring / shield hit: oriented quads
      const n = [F[o+15], F[o+16], F[o+17]], ax = V.norm(V.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), ay = V.cross(n, ax);
      if (kind === 4) spr(x, y, z, size + F[o+10]*Math.pow(a, 0.6), cr, cg, cb, 4, a, seed, ax, ay);
      else spr(x, y, z, size, cr*2.2, cg*2.2, cb*2.2, 5, a, 0, ax, ay);
    } else if (kind === 7) {                                                              // warp: a flash and the streak it came along
      const k = 1 - a;
      spr(x, y, z, size*(1 + 3*a), cr*k*3, cg*k*3, cb*k*3, 1, a, seed);
      const L = 30000*(1 - a*0.5);
      beam(x - F[o+15]*L, y - F[o+16]*L, z - F[o+17]*L, x, y, z, size*0.25*k, cr*k*4, cg*k*4, cb*k*4, 1);
    }
  }
  // rounds: tracers along their motion relative to the fight (the co-rotating frame), never longer than they have flown
  for (let i = 0; i < C.nb; i++) {
    const o = i*CMB_BS, kind = B[o+11], x = B[o], y = B[o+1], z = B[o+2];
    const vr = C.frame ? cmbVref([x, y, z]) : [0, 0, 0];
    let dx = (B[o+3] - vr[0])*TC, dy = (B[o+4] - vr[1])*TC, dz = (B[o+5] - vr[2])*TC; const sp = Math.hypot(dx, dy, dz) || 1;
    const age = (kind === 2 ? CMB_FLAK.life : kind === 1 ? 1.2 : CMB.GUN_LIFE) - B[o+9];
    const len = Math.min(kind === 2 ? 70 : kind === 1 ? 32 : 46, age*sp); dx /= sp; dy /= sp; dz /= sp;
    if (kind === 0) { beam(x - dx*len, y - dy*len, z - dz*len, x, y, z, 0.9, 2.2, 3.4, 6.4, 1); }
    else if (kind === 1) { beam(x - dx*len, y - dy*len, z - dz*len, x, y, z, 0.9, 6.4, 2.2, 0.8, 1); }
    else { beam(x - dx*len, y - dy*len, z - dz*len, x, y, z, 2.6, 7, 3.4, 1.2, 1); spr(x, y, z, 7, 1.4, 0.6, 0.2, 0, 0, 0); }
  }
  // torpedoes and missiles: the motor's flare, a glow
  for (const m of C.torps) {
    const q = V.sub(m.p, V.mul(m.f, 3)), on = m.t >= m.ign, fl = 0.85 + 0.15*Math.sin(t*80 + m.p[0]);
    if (on) { spr(q[0], q[1], q[2], 5, 3*fl, 2.4*fl, 1.8*fl, 1, 0, 0); spr(q[0], q[1], q[2], 14, 1.3, 0.6, 0.25, 0, 0, 0); }
    else spr(m.p[0], m.p[1], m.p[2], 2, 0.4, 0.4, 0.45, 0, 0, 0);
  }
  // engines, beacons, damage glows on the hulls
  for (const e of C.ents) {
    if (!e.alive || e.arrive) continue;
    const c = CMB_CLS[e.cls];
    if (e.wreck) { const q = cmbAt(e, [0, 0, 0]); spr(q[0], q[1], q[2], c.ext[2]*0.35*e.scale, 1.8, 0.7, 0.25, 0, 0, 0); continue; }
    if (e.dying >= 0) continue;
    if (c.fighter) { const q = cmbAt(e, [0, 0, -2.8]); spr(q[0], q[1], q[2], 8, 4.2, 1.6, 0.5, 0, 0, 0); }
    else if (e.cls === 'drone') {                                                         // hazard strobe and fin-tip beacons
      const bl = Math.pow(0.5 + 0.5*Math.sin(t*4.1 + e.seed*9), 12), q = cmbAt(e, [0, 3.1, 0.5]);
      spr(q[0], q[1], q[2], 3.4, 3.2*bl + 0.1, 0.9*bl + 0.05, 0.2*bl, 1, 0, 0);
      const q2 = cmbAt(e, [0, 0, -3.8]); spr(q2[0], q2[1], q2[2], 4, 1.2, 0.5, 0.2, 0, 0, 0);
    } else {
      const k = c.ext[0]*0.33;
      for (const x of [-0.5, 0, 0.5]) { const q = cmbAt(e, [x*c.ext[0]*0.6, 0, -c.ext[2]*1.04]); spr(q[0], q[1], q[2], k, 1.7, 0.62, 0.18, 0, 0, 0); }
    }
  }
  return [ns, nb];
}
// up to `max` point lights on the hulls (explosions, the guns, torpedo motors), camera-relative km: pos4 = xyz + radius,
// col3 = colour x intensity. Returns the count.
function cmbLights(eye, pos4, col3, max){
  const C = COMBAT, F = C.F, t = C.t, cand = [];
  // rank by what the camera will see lit: brightness x reach^2 over distance^2
  const add = (p, R, c, k) => cand.push([p, R, c, k, k*R*R/((p[0] - eye[0])**2 + (p[1] - eye[1])**2 + (p[2] - eye[2])**2 + 1)]);
  if (C.muzzle && t - C.muzzle.t < 0.06) add(C.muzzle.p, 30, [0.6, 0.8, 1.2], 1.2);
  for (let i = 0; i < C.nf; i++) {
    const o = i*CMB_FS, kind = F[o+8];
    if (kind !== 1 && kind !== 2) continue;
    const a = (t - F[o+6])/F[o+7]; if (a > (kind === 1 ? 0.8 : 0.45)) continue;
    const size = F[o+9]; if (size < 6) continue;                                          // muzzle and gun flashes: the muzzle light covers them
    add([F[o], F[o+1], F[o+2]], size*(kind === 1 ? 1.2 : 2.5), kind === 1 ? [1.5, 1.1, 0.75] : [1.6, 0.8, 0.35], kind === 1 ? (1 - a)*(1 - a)*2.2 : (1 - a/0.45)*1.4);
  }
  for (const m of C.torps) if (m.t >= m.ign) add(m.p, 45, [1.2, 0.75, 0.4], 1.1);
  cand.sort((A, B) => B[4] - A[4]);
  const n = Math.min(max, cand.length);
  for (let i = 0; i < n; i++) {
    const [p, R, c, k] = cand[i];
    pos4[i*4] = (p[0] - eye[0])*1e-3; pos4[i*4+1] = (p[1] - eye[1])*1e-3; pos4[i*4+2] = (p[2] - eye[2])*1e-3; pos4[i*4+3] = R*1e-3;
    col3[i*3] = c[0]*k; col3[i*3+1] = c[1]*k; col3[i*3+2] = c[2]*k;
  }
  return n;
}
