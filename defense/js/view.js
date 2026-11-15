'use strict';
// view.js — PLANET DEFENSE on screen: the SECTOR placed in the renderer's frame, the tactical camera and its cinematic
// director, and the war as the ship pass draws it.
//
// ships.js draws "the fight" through combat.js's interface (the landing page's weapons). combat.js is not loaded on this
// page: these implement the same six functions and the COMBAT fields ships.js reads, from WAR (war.js) --
//   COMBAT {t, rm, hot, pl, flash} · cmbActive · cmbDrawList · cmbShields · cmbFxRows · cmbTrailRows · cmbLights
// (tests.html checks that ships.js calls nothing else of combat.js's.)
//
// Frames. The sector (war.js) is metres round BASTION, +Y up, +Z prograde, +X the orbit normal. orbitStep() puts the
// station on its dawn-dusk orbit; sectUpdate() reads its position and local axes from there, and toM() takes a sector
// point to MILLER-relative metres (the fight's frame in ships.js). The camera lives in the sector too and is written
// into ORB.view last, so the hole, the planet and the ships all see the same eye.

// ------------------------------------------------------------------------------------------ the sector in the world
const SECT = {o: [0, 7.4e6, 0], X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], P: [0, 0, 0]};
function sectUpdate(){
  const h = ORB.hud, Y = V.norm(h.up), Z = V.norm(V.sub(h.pro, V.mul(Y, V.dot(h.pro, Y))));
  SECT.Y = Y; SECT.Z = Z; SECT.X = V.cross(Y, Z); SECT.P = ORB.bodies[1].pos;
  SECT.o = V.sub(ORB.view.eye, SECT.P);                     // (orbitStep's eye is the station)
}
function toM(p){ const o = SECT.o, X = SECT.X, Y = SECT.Y, Z = SECT.Z; return [o[0] + X[0]*p[0] + Y[0]*p[1] + Z[0]*p[2], o[1] + X[1]*p[0] + Y[1]*p[1] + Z[1]*p[2], o[2] + X[2]*p[0] + Y[2]*p[1] + Z[2]*p[2]]; }
function toW(d){ const X = SECT.X, Y = SECT.Y, Z = SECT.Z; return [X[0]*d[0] + Y[0]*d[1] + Z[0]*d[2], X[1]*d[0] + Y[1]*d[1] + Z[1]*d[2], X[2]*d[0] + Y[2]*d[1] + Z[2]*d[2]]; }
function toS(d){ return [V.dot(d, SECT.X), V.dot(d, SECT.Y), V.dot(d, SECT.Z)]; }        // world direction -> sector
// MILLER's centre and radius in the sector (it sits straight below BASTION)
function sectPlanet(){ return {c: [0, -(ORB.planet.R + ORB.ship.h), 0], R: ORB.planet.R}; }

// ------------------------------------------------------------------------------------------ the camera
// Free: orbit a focus point (drag), zoom (wheel), pan (right-drag), follow a selected craft. yaw 0 = behind BASTION's
// stern looking along +X toward Gargantua, which the ring then frames. Up is the sector's +Y, so MILLER stays below.
// A SHOT (cutaway or the cinema director) overrides it: eye and look are functions, evaluated every frame.
const CAM = {f: [0, 0, -20], fT: [0, 0, -20], yaw: 0.38, pitch: 0.16, dist: 3300, yawT: 0.38, pitchT: 0.16, distT: 3300, fov: 52*DEG,
  follow: null, idle: 0, eye: [0, 0, 0], b: null, shot: null, cine: true, auto: false, dir: null, dirT: 0, fovNow: 52*DEG, shake: 0};
const CAM_MIN = 120, CAM_MAX = 42000;
function camOffset(yaw, pitch){ return [-Math.cos(pitch)*Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)*Math.sin(yaw)]; }
function camReset(){ Object.assign(CAM, {fT: [0, 0, -20], yawT: 0.38, pitchT: 0.16, distT: 3300, follow: null}); }
function camOrbit(dx, dy){ CAM.yawT -= dx; CAM.pitchT = clamp(CAM.pitchT + dy, -1.35, 1.4); CAM.idle = 0; }
function camZoom(k){ CAM.distT = clamp(CAM.distT*Math.exp(k), CAM_MIN, CAM_MAX); CAM.idle = 0; }
function camPan(dx, dy){                                  // screen px -> the focus slides in the view's plane
  const b = CAM.b; if (!b) return; const k = CAM.dist*Math.tan(CAM.fov/2)*2/Math.max(ORB.H, 1);
  CAM.follow = null; CAM.fT = V.add(CAM.fT, V.add(V.mul(b.r, -dx*k), V.mul(b.u, dy*k))); CAM.idle = 0;
}
function camFocus(e, dist){ CAM.follow = e && e.p ? e : null; if (e && e.p) CAM.fT = e.p.slice(); if (dist) CAM.distT = clamp(dist, CAM_MIN, CAM_MAX); CAM.idle = 0; }
// eye, look (sector), fov -> CAM.eye/b and ORB.view
function camApply(eye, look, fov, up){
  let f = V.sub(look, eye); const l = V.len(f); f = l > 1e-6 ? V.mul(f, 1/l) : [1, 0, 0];
  const U = up || [0, 1, 0];
  let r = V.cross(f, U); if (V.len(r) < 1e-6) r = V.cross(f, [0, 0, 1]); r = V.norm(r);
  let u = V.cross(r, f);
  if (CAM.shake > 1e-3 && !WAR.rm) {                            // big hits jolt the camera a little
    const t = performance.now()/1000, a = CAM.shake*0.004;
    const q = [Math.sin(t*37)*a, Math.sin(t*41 + 1)*a, Math.sin(t*29 + 2)*a];
    f = V.norm(V.add(f, V.add(V.mul(r, q[0]), V.mul(u, q[1])))); r = V.norm(V.cross(f, u)); u = V.cross(r, f);
  }
  CAM.eye = eye; CAM.b = {r, u, f};
  const E = V.add(SECT.P, toM(eye));
  ORB.view = {eye: E, b: {r: toW(r), u: toW(u), f: toW(f)}, fov};
  ORB.camM = V.mul(E, 1/ORB.M);
}
function camStep(dt){
  CAM.idle += dt; CAM.shake *= Math.exp(-dt/0.4);
  if (CAM.follow) { if (CAM.follow.alive === false || CAM.follow.docked) CAM.follow = null; else CAM.fT = CAM.follow.kind === 'station' ? [0, 0, -20] : CAM.follow.p.slice(); }
  const k = 1 - Math.exp(-dt/0.22), kf = 1 - Math.exp(-dt/(CAM.follow ? 0.12 : 0.3));
  CAM.yaw += (CAM.yawT - CAM.yaw)*k; CAM.pitch += (CAM.pitchT - CAM.pitch)*k; CAM.dist *= Math.exp(Math.log(CAM.distT/CAM.dist)*k);
  CAM.f = V.add(CAM.f, V.mul(V.sub(CAM.fT, CAM.f), kf));
  // the cinema director takes over when asked (C), or after a while untouched in a wave
  CAM.autoOn = CAM.auto || (CAM.cine && CAM.idle > 40 && WAR.phase === 'wave' && !WAR.rm);
  let S = CAM.shot;
  if (S && (performance.now() - S.t0)/1000 > S.dur) { CAM.shot = S = null; }
  if (!S && CAM.autoOn) S = camDirector(dt);
  if (S) {
    const s = (performance.now() - S.t0)/1000, eye = S.eye(s), look = S.look(s);
    if (!eye || !look || !eye.every(Number.isFinite) || !look.every(Number.isFinite)) { CAM.shot = null; CAM.dir = null; }
    else { CAM.fovNow += ((S.fov || CAM.fov) - CAM.fovNow)*(S.cut ? 1 : 1 - Math.exp(-dt/0.3)); S.cut = false; camApply(eye, look, CAM.fovNow, S.up); return; }
  }
  if (CAM.dir && !CAM.autoOn) CAM.dir = null;
  CAM.fovNow += (CAM.fov - CAM.fovNow)*(1 - Math.exp(-dt/0.3));
  const eye = V.add(CAM.f, V.mul(camOffset(CAM.yaw, CAM.pitch), CAM.dist));
  camApply(eye, CAM.f, CAM.fovNow);
}
function camCine(){ return !!CAM.shot || (CAM.autoOn && !!CAM.dir); }
// ---- cutaways: short shots the war asks for; any input ends them
function camShot(kind, dur, eye, look, fov, o){
  if (!CAM.cine || WAR.rm) return false;
  CAM.shot = Object.assign({kind, t0: performance.now(), dur, eye, look, fov: fov || CAM.fov, cut: true}, o || {});
  return true;
}
function camCut(){ if (CAM.shot) { CAM.shot = null; } CAM.dir = null; CAM.idle = 0; CAM.auto = false; }   // (input takes the camera back, cinema mode too)
// the war's events -> cutaways (at most one at a time; the kill shot waits for the big one)
function camEvent(ev){
  if (!CAM.cine || WAR.rm) return;
  const st = WAR.station, busy = !!CAM.shot;
  if (ev.type === 'capArrive' && !busy) {
    const at = ev.p.slice(), side = V.norm(V.cross(V.norm(at), [0, 1, 0])), from = V.add(V.mul(V.norm(at), 700), V.add(V.mul(side, 380), [0, 120, 0]));
    camShot('arrival', 4.2, () => from, () => at, 26*DEG);
  } else if (ev.type === 'capDying') {
    const e = WAR.ents.find(x => x.id === ev.id) || null, p0 = ev.p.slice();
    const L = e ? wRad(e)*2 : 800, back = V.norm(V.sub([0, 0, 0], p0)), sd = V.norm(V.cross(back, [0, 1, 0])), off = V.add(V.add(V.mul(back, L*2.2), V.mul(sd, L*1.1)), [0, L*0.35, 0]);
    setTimeout(() => { if (!CAM.shot || CAM.shot.kind !== 'kill') camShot('kill', 5.2, () => V.add(p0, off), () => (e && e.alive) ? e.p : p0, 44*DEG); }, 2900);
  } else if (ev.type === 'novaCharge') {
    const t = WAR.ents.find(x => x.id === ev.tgt);
    camShot('nova', 3.6, s => wAt(st, [-70 + s*14, 70, -330]), () => t && t.alive ? t.p : wAt(st, [0, 0, 2000]), 34*DEG);
  } else if (ev.type === 'lanceCharge') {
    const t = WAR.ents.find(x => x.id === ev.tgt);
    if (t) { const p0 = t.p.slice(), off = [900, 1400, 1300]; camShot('lance', 3.4, s => V.add(t.alive ? t.p : p0, V.add(off, [0, s*60, 0])), () => V.add(t.alive ? t.p : p0, [0, -900, 0]), 48*DEG); }
  } else if (ev.type === 'sunderCharge' && !busy) {
    camShot('sunder', 5.4, s => wAt(st, [260 + s*10, 160, -500]), () => wAt(st, [0, 0, 300]), 50*DEG);
  } else if (ev.type === 'defeat') {
    camShot('defeat', 9, s => [-2400 - s*120, 700 + s*40, 1500 + s*60], () => [0, 0, -40], 46*DEG);
  } else if (ev.type === 'victory') {
    camShot('victory', 10, s => [-900 - s*260, 220 + s*70, -600 - s*60], () => [0, 0, -20], 50*DEG);
  }
}
// ---- the director: a shot every 7-10 s, chosen from what is happening; cuts, never blends
function camDirector(){
  const W = WAR, now = performance.now();
  if (CAM.dir && (now - CAM.dir.t0)/1000 < CAM.dir.dur && CAM.dir.alive()) return CAM.dir;
  const st = W.station, R = Math.random, foes = W.ents.filter(e => e.alive && e.team === 1 && e.dying < 0 && !e.wreck && e.arrive <= W.t);
  const caps = foes.filter(e => e.kind === 'capital'), bombers = foes.filter(e => e.kind === 'bomber' && !e.dive), hawks = W.ents.filter(e => e.cls === 'hawk' && e.alive && !e.docked && e.arrive <= W.t);
  const lb = W.ents.filter(e => e.cls === 'longbow' && e.alive && e.tur[0] && e.tur[0].tgt);
  const opts = [];
  opts.push(() => { const a0 = R()*6.28, r = 1600 + R()*900, h = 80 + R()*300; return {dur: 9, eye: s => [Math.cos(a0 + s*0.05)*r*0.6 - 900, h, Math.sin(a0 + s*0.05)*r], look: () => [0, 0, -20], fov: 44*DEG, alive: () => true}; });
  opts.push(() => { const tgt = caps[0] || bombers[0]; return {dur: 7, eye: s => wAt(st, [30, 58 + s*1.5, 150 + s*3]), look: () => tgt && tgt.alive ? tgt.p : [8000, 0, 0], fov: 40*DEG, alive: () => true}; });
  opts.push(() => { return {dur: 8, eye: s => [-16000 - s*80, 4200, 9000 - s*120], look: () => [2600, -800, 0], fov: 38*DEG, alive: () => true}; });
  if (bombers.length) opts.push(() => { const b = bombers[Math.floor(R()*bombers.length)]; return {dur: 6, eye: () => V.add(b.p, V.add(V.mul(b.f, -95), [0, 32, 0])), look: () => V.add(b.p, V.mul(b.f, 400)), fov: 56*DEG, alive: () => b.alive && !b.dive}; });
  if (hawks.length) opts.push(() => { const h = hawks[Math.floor(R()*hawks.length)]; return {dur: 6, eye: () => V.add(h.p, V.add(V.mul(h.f, -52), V.mul(h.u, 14))), look: () => V.add(h.p, V.mul(h.f, 300)), fov: 60*DEG, up: null, alive: () => h.alive && !h.docked}; });
  if (caps.length) opts.push(() => { const c = caps[Math.floor(R()*caps.length)], L = wRad(c); return {dur: 8, eye: s => V.add(c.p, V.add(V.mul(V.norm(c.p), L*1.6), [0, L*0.5 + s*4, L*0.9])), look: () => [0, 0, -20], fov: 34*DEG, alive: () => c.alive}; });
  if (lb.length) opts.push(() => { const e = lb[Math.floor(R()*lb.length)]; return {dur: 6, eye: () => wAt(e, [9, 30, -60]), look: () => e.tur[0].tgt && e.tur[0].tgt.alive !== false ? e.tur[0].tgt.p : wAt(e, [0, 0, 3000]), fov: 36*DEG, alive: () => e.alive}; });
  const pick = opts[Math.floor(R()*opts.length)]();
  CAM.dir = Object.assign(pick, {t0: now, cut: true});
  return CAM.dir;
}

// ------------------------------------------------------------------------------------------ projection (for the HUD)
// sector point -> CSS px {x, y, z (m along the view), front}
function projS(p){
  const b = CAM.b; if (!b) return {x: -1e4, y: -1e4, z: -1, front: false};
  const d = V.sub(p, CAM.eye), z = V.dot(d, b.f), th = Math.tan(ORB.view.fov/2), asp = ORB.W/ORB.H, az = Math.max(Math.abs(z), 1e-6);
  return {x: (V.dot(d, b.r)/(az*th*asp)*0.5 + 0.5)*ORB.W, y: (0.5 - V.dot(d, b.u)/(az*th)*0.5)*ORB.H, z, front: z > 1};
}
// pixels per metre at distance z (CSS)
function pxPerM(z){ return ORB.H/(2*Math.tan(ORB.view.fov/2)*Math.max(z, 1)); }
// the ray under a CSS pixel (sector): {o, d}
function rayAt(x, y){
  const b = CAM.b, th = Math.tan(ORB.view.fov/2), asp = ORB.W/ORB.H, nx = (x/ORB.W*2 - 1)*th*asp, ny = (1 - y/ORB.H*2)*th;
  return {o: CAM.eye, d: V.norm(V.add(b.f, V.add(V.mul(b.r, nx), V.mul(b.u, ny))))};
}

// ------------------------------------------------------------------------------------------ what ships.js reads
const COMBAT = {t: 0, rm: false, hot: false, pl: null, flash: 0};
function viewSync(){ COMBAT.t = WAR.t; COMBAT.rm = WAR.rm; COMBAT.flash = WAR.flash; }
function cmbActive(){ return !!WAR.station; }
const QZ = a => [0, 0, Math.sin(a/2), Math.cos(a/2)], QY = a => [0, Math.sin(a/2), 0, Math.cos(a/2)];
const UPG_PART = [['armor', 'bastionArmor', 2], ['sensors', 'bastionDish', 1], ['reactor', 'bastionRads', 1], ['nova', 'bastionNova', 1], ['hangar', 'bastionBay', 2]];
// hulls to draw: {cls (mesh), p (MILLER m), f, u, scale, damage, team, glow, thr, stretch, clip, heat, pulse} and the parts
// after their hull: {cls, p, f, u, pose: {q, pivot, mode}}
function cmbDrawList(){
  const W = WAR, out = [], t = W.t, rm = W.rm;
  const part = (e, P, cls, q, pivot, mode, glow, heat, pulse) => out.push({cls, p: P.p, f: P.f, u: P.u, scale: e.scale || 1, damage: e.damage || 0, team: e.team, glow: glow || 0,
    stretch: P.stretch, pose: {q, pivot, mode}, heat: heat || 0, pulse: pulse || 0});
  for (const e of W.ents) {
    if (!e.alive || e.arrive > t || e.docked || (e.kind === 'station' && e.gone)) continue;
    const c = WAR_CLS[e.cls], mesh = c.mesh, K = SHIP_KIT[mesh];
    const ia = e.inAt == null ? 9 : t - e.inAt, stretch = e.team === 1 && !e.wreck && ia < 0.45 && !rm ? Math.pow(1 - ia/0.45, 3)*(c.kind === 'capital' ? 40 : 18) : 0;
    const p = toM(e.clip ? V.sub(e.p, V.mul(e.f, e.zc)) : e.p), f = toW(e.f), u = toW(e.u);
    let thr = 0, glow = e.glow;
    if (!e.wreck) {
      if (e.kind === 'fighter') thr = e.ai.mode === 'break' ? 1.25 : e.ai.mode === 'launch' ? 1.4 : 1;
      else if (e.kind === 'bomber') thr = e.dive ? 1.6 : 0.8;
      else if (e.kind === 'capital') thr = e.dying >= 0 ? (Math.random() < 0.7 ? 0.2 + 0.3*Math.random() : 0) : 0.55;
      if (e.kind === 'platform') glow = e.deploy > t ? 0.3 + 0.3*Math.sin(t*9) : 0.15;
      if (e.cls === 'aegis') glow = 0.25 + (t - (e.fieldHit || -9) < 0.6 ? 0.6 : 0) + (e.pool > 0 ? 0 : -0.2);
    } else glow = 0;
    const P = {p, f, u, stretch};
    out.push({cls: mesh, p, f, u, scale: e.scale || 1, damage: e.damage || 0, team: e.team, glow, ext: K.hit, thr, stretch, clip: e.clip, heat: e.heat || 0, pulse: 0});
    if (e.wreck || e.dying >= 0 && c.kind === 'capital') continue;
    if (e.kind === 'station') {
      part(e, P, 'bastionRing', QZ(e.ring || 0), [0, 0, 0], 0, 0);
      for (const [track, cls, lv] of UPG_PART) if (W.up[track] >= lv) part(e, P, cls, [0, 0, 0, 1], [0, 0, 0], 0, 0, e.heat, cls === 'bastionNova' ? novaPulse() : 0);
      for (const T of e.tur) if (T.on) part(e, P, T.cls, wQMul(T.q, wYPQuat(T.yaw, T.pitch)), T.pivot, 1, T.pulse*0.35, 0, 0);
    } else if (e.kind === 'platform') {
      if (e.cls === 'sentinel') for (const T of e.tur) part(e, P, 'dturretS', wQMul(T.q, wYPQuat(T.yaw, T.pitch)), T.pivot, 1, T.pulse*0.3);
      else if (e.cls === 'longbow' && e.tur[0]) { const T = e.tur[0];
        part(e, P, 'longbowMount', QY(T.yaw), K.mount.pivot, 1, 0);
        part(e, P, 'longbowGun', wYPQuat(T.yaw, T.pitch), K.gun.pivot, 1, T.charge >= 1 ? 0.35 : T.charge*0.25, 0, T.pulse); }
      else if (e.cls === 'hydra' && e.tur[0]) { const T = e.tur[0]; part(e, P, 'hydraLauncher', wYPQuat(T.yaw, T.pitch), K.launcher.pivot, 1, 0.1 + T.pulse*0.4); }
      else if (e.cls === 'aegis') part(e, P, 'aegisRing', QY(e.ringA || 0), K.ring.pivot, 1, glow);
    } else if (c.kind === 'capital' && K.turretCls) {
      for (const T of e.tur) { const hy = T.yaw/2, hp = -T.pitch/2, a = Math.cos(hy), b = Math.sin(hy), c2 = Math.cos(hp), s2 = Math.sin(hp);
        part(e, P, K.turretCls, [a*s2, b*c2, -b*s2, a*c2], T.pivot, 1, 0); }
    }
  }
  for (const s of W.shards) out.push({cls: 'shard', p: toM(s.p), f: toW(s.f), u: toW(s.u), scale: s.scale, damage: 1, team: s.team, glow: 0, ext: [1, 1, 1]});
  return out;
}
function novaPulse(){ const A = WAR.ab.nova; return A.charge >= 0 ? Math.min(1, A.charge/WAR_W.nova.charge) : A.cd > 0 ? 0 : 0.12 + 0.05*Math.sin(WAR.t*2); }
// shield shells being struck: BASTION's, the capitals', the AEGIS fields (a unit-sphere shell scaled to the field)
function cmbShields(){
  const W = WAR, t = W.t, out = [], busy = (R, down) => (R && R.some(q => t - q.fl < 1.2)) || (down != null && t - down < 0.9);
  for (const e of W.ents) {
    if (!e.alive || e.arrive > t || e.wreck || e.dying >= 0) continue;
    if ((e.kind === 'station' || e.kind === 'capital') && busy(e.shR, e.shDown))
      out.push({cls: WAR_CLS[e.cls].mesh, p: toM(e.p), f: toW(e.f), u: toW(e.u), R: e.shR || [], down: e.shDown, k: e.shMax ? e.sh/e.shMax : 0, team: e.team, scale: e.scale || 1});
    else if (e.cls === 'aegis' && busy(e.fR, e.fDown)) {
      const S = shipKitBuild('bubble').shell;
      out.push({cls: 'bubble', p: toM(e.p), f: toW([0, 0, 1]), u: toW([0, 1, 0]), R: e.fR || [], down: e.fDown, k: e.poolMax ? e.pool/e.poolMax : 0, team: 0, scale: e.fieldR/S.r[0]});
    }
  }
  return out;
}
// sprite rows (16 floats: pos km, size km, colour, type, axis x + age, axis y + seed) and beam rows (12: a km, width km, b km,
// core, colour, k), camera-relative, for everything the war draws that is not a hull. Returns [sprites, beams].
function cmbFxRows(S, Bm, eyeRel){
  const W = WAR, F = W.F, Bo = W.B, t = W.t, NS = S.length/16, NBm = Bm.length/12, e0 = CAM.eye, X = SECT.X, Y = SECT.Y, Z = SECT.Z;
  let ns = 0, nb = 0;
  const cx = (x, y, z) => (X[0]*(x - e0[0]) + Y[0]*(y - e0[1]) + Z[0]*(z - e0[2]))*1e-3, cy = (x, y, z) => (X[1]*(x - e0[0]) + Y[1]*(y - e0[1]) + Z[1]*(z - e0[2]))*1e-3,
        cz = (x, y, z) => (X[2]*(x - e0[0]) + Y[2]*(y - e0[1]) + Z[2]*(z - e0[2]))*1e-3;
  const spr = (x, y, z, size, r, g, b, type, age, seed, ax, ay) => {
    if (ns >= NS) return;
    const o = ns++*16;
    S[o] = cx(x, y, z); S[o+1] = cy(x, y, z); S[o+2] = cz(x, y, z); S[o+3] = size*1e-3;
    S[o+4] = r; S[o+5] = g; S[o+6] = b; S[o+7] = type;
    const A = ax ? toW(ax) : null, B2 = ay ? toW(ay) : null;
    S[o+8] = A ? A[0] : 0; S[o+9] = A ? A[1] : 0; S[o+10] = A ? A[2] : 0; S[o+11] = age;
    S[o+12] = B2 ? B2[0] : 0; S[o+13] = B2 ? B2[1] : 0; S[o+14] = B2 ? B2[2] : 0; S[o+15] = seed;
  };
  const beam = (ax, ay, az, bx, by, bz, w, r, g, b, core) => {
    if (nb >= NBm) return;
    const o = nb++*12;
    Bm[o] = cx(ax, ay, az); Bm[o+1] = cy(ax, ay, az); Bm[o+2] = cz(ax, ay, az); Bm[o+3] = w*1e-3;
    Bm[o+4] = cx(bx, by, bz); Bm[o+5] = cy(bx, by, bz); Bm[o+6] = cz(bx, by, bz); Bm[o+7] = core;
    Bm[o+8] = r; Bm[o+9] = g; Bm[o+10] = b; Bm[o+11] = 1;
  };
  const dist = p => Math.hypot(p[0] - e0[0], p[1] - e0[1], p[2] - e0[2]);
  // particles (combat.js's mapping)
  for (let i = 0; i < W.nf; i++) {
    const o = i*WF, a = clamp((t - F[o+6])/F[o+7], 0, 1), kind = F[o+8], size = F[o+9], seed = F[o+11];
    const x = F[o], y = F[o+1], z = F[o+2], cr = F[o+12], cg = F[o+13], cb = F[o+14];
    if (kind === 1) { const k = (1 - a)*(1 - a)*3; spr(x, y, z, size*(1 + a), cr*k, cg*k, cb*k, 1, a, seed); }
    else if (kind === 2) spr(x, y, z, size + F[o+10]*Math.sqrt(a), cr, cg, cb, 2, a, seed);
    else if (kind === 3) spr(x, y, z, size + F[o+10]*a, cr, cg, cb, 3, a, seed);
    else if (kind === 0 || kind === 8) { const k = kind === 8 ? (1 - a) : 1; spr(x, y, z, size, cr*k, cg*k, cb*k, 0, a, seed); }
    else if (kind === 6) { const k = (1 - a)*(1 - a), s = 0.03*(1 - 0.3*a); beam(x - F[o+15]*s, y - F[o+16]*s, z - F[o+17]*s, x, y, z, size, 4*k, 2.2*k, 0.9*k, 1); }
    else if (kind === 4 || kind === 5) {
      const n = [F[o+15], F[o+16], F[o+17]], ax = V.norm(V.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), ay = V.cross(n, ax);
      if (kind === 4) spr(x, y, z, size + F[o+10]*Math.pow(a, 0.6), cr, cg, cb, 4, a, seed, ax, ay); else spr(x, y, z, size, cr*2.2, cg*2.2, cb*2.2, 5, a, 0, ax, ay);
    } else if (kind === 7) {
      const k = 1 - a; spr(x, y, z, size*(1 + 3*a), cr*k*3, cg*k*3, cb*k*3, 1, a, seed);
      const L = 30000*(1 - a*0.5); beam(x - F[o+15]*L, y - F[o+16]*L, z - F[o+17]*L, x, y, z, size*0.25*k, cr*k*4, cg*k*4, cb*k*4, 1);
    }
  }
  // rounds: tracers along their motion, never longer than they have flown; each kind its own colour and weight
  const TR = [[46, 0.9, 2.2, 3.4, 6.4], [32, 0.9, 6.4, 2.2, 0.8], [70, 2.6, 7, 3.4, 1.2], [700, 2.4, 4.5, 6, 11], [140, 2.2, 5, 4, 2.6], [110, 2.4, 7, 2.2, 0.7], [36, 0.8, 2.4, 3, 5.6]];
  const LIFE = [WAR_W.ac.life, 1.2, WAR_W.flak.life, WAR_W.rail.life, 2.6, WAR_W.eheavy.life, 1.1];
  for (let i = 0; i < W.nb; i++) {
    const o = i*WB, kind = Bo[o+11], x = Bo[o], y = Bo[o+1], z = Bo[o+2];
    let dx = Bo[o+3], dy = Bo[o+4], dz = Bo[o+5]; const sp = Math.hypot(dx, dy, dz) || 1;
    const T = TR[kind] || TR[0], age = LIFE[kind] - Bo[o+9], len = Math.min(T[0], age*sp); dx /= sp; dy /= sp; dz /= sp;
    beam(x - dx*len, y - dy*len, z - dz*len, x, y, z, T[1], T[2], T[3], T[4], 1);
    if (kind === 2) spr(x, y, z, 7, 1.4, 0.6, 0.2, 0, 0, 0);
    else if (kind === 3) spr(x, y, z, 14 + dist([x, y, z])*0.004, 1.6, 2.2, 3.6, 0, 0, 0);
    else if (kind === 5) spr(x, y, z, 10, 1.8, 0.6, 0.2, 0, 0, 0);
    else if (kind === 4) spr(x, y, z, 8, 1.5, 1.2, 0.8, 0, 0, 0);
  }
  // railgun slugs leave an ion trail that glows and fades
  for (const s of W.streaks) {
    const k = s.end < 0 ? 1 : Math.max(0, 1 - (t - s.end)/0.9), kk = k*k;
    if (kk < 0.01) continue;
    beam(s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], 1.3, 0.5*kk, 0.8*kk, 1.6*kk, 0.4);
  }
  // missiles: the motor's flare and a glow
  for (const m of W.msl) {
    if (m.t < 0) continue;
    const q = V.sub(m.p, V.mul(m.f, 3)), on = m.t >= m.ign, fl = 0.85 + 0.15*Math.sin(t*80 + m.p[0]);
    if (on) { const w = m.team ? [3, 2.4, 1.8] : [2.4, 2.8, 3.4]; spr(q[0], q[1], q[2], 5, w[0]*fl, w[1]*fl, w[2]*fl, 1, 0, 0); spr(q[0], q[1], q[2], 12 + dist(q)*0.0016, m.team ? 1.3 : 0.7, m.team ? 0.6 : 0.9, m.team ? 0.25 : 1.4, 0, 0, 0); }
    else spr(m.p[0], m.p[1], m.p[2], 2, 0.4, 0.4, 0.45, 0, 0, 0);
  }
  // beam weapons: the NOVA (blue-white), the PLANETARY LANCE (from MILLER's surface, white-gold), the SUNDER (red)
  const BW = {nova: [2.2, 3.2, 6.4], lance: [5, 4.2, 2.6], sunder: [7, 1.6, 0.6]};
  for (const b of W.beams) {
    const a = (t - b.t0)/b.life, k = a < 0.08 ? a/0.08 : Math.pow(1 - (a - 0.08)/0.92, 1.6), c = BW[b.kind];
    beam(b.a[0], b.a[1], b.a[2], b.b[0], b.b[1], b.b[2], b.w*(0.6 + 0.4*k), c[0]*k*2, c[1]*k*2, c[2]*k*2, 1);
    beam(b.a[0], b.a[1], b.a[2], b.b[0], b.b[1], b.b[2], b.w*3.5, c[0]*k*0.25, c[1]*k*0.25, c[2]*k*0.25, 0);
    spr(b.b[0], b.b[1], b.b[2], b.w*6*(1 + a), c[0]*k, c[1]*k, c[2]*k, 1, a, 0);
    if (b.kind !== 'lance') spr(b.a[0], b.a[1], b.a[2], b.w*3, c[0]*k*1.2, c[1]*k*1.2, c[2]*k*1.2, 1, a, 0);
    else { const n = V.norm(V.sub(b.a, sectPlanet().c)); spr(b.a[0], b.a[1], b.a[2], 26000*(0.6 + a), c[0]*k*0.5, c[1]*k*0.5, c[2]*k*0.5, 0, 0, 0); void n; }
  }
  // charging: the NOVA's muzzle gathers light, the LANCE paints its target, the SUNDER's bow glows red
  const st = W.station;
  if (st && W.ab.nova.charge >= 0) { const q = wAt(st, SHIP_KIT.bastion.novaMuzzle), k = W.ab.nova.charge/WAR_W.nova.charge; spr(q[0], q[1], q[2], 20 + 120*k*k, 1.2*k, 1.8*k, 3.2*k, 1, 0.2, 0); }
  if (W.ab.lance.charge >= 0 && W.ab.lance.tgt && W.ab.lance.from) { const a = W.ab.lance.from, b = wAim(W.ab.lance.tgt), k = 0.4 + 0.6*Math.abs(Math.sin(t*20));
    beam(a[0], a[1], a[2], b[0], b[1], b[2], 3, 2.4*k, 2*k, 1.2*k, 1); spr(a[0], a[1], a[2], 14000, 1.5*k, 1.2*k, 0.7*k, 0, 0, 0); }
  // MILLER struck: the planetary shield flares where a bomber broke through (on the side we can see)
  const Pl = sectPlanet();
  for (const s of W.strikes) {
    const a = (t - s.at)/3; if (a < 0 || a > 1) continue;
    const n = V.norm(V.sub(s.p, Pl.c)), q = V.add(Pl.c, V.mul(n, Pl.R + 30000));
    if (V.dot(n, V.sub(e0, q)) < 0) continue;
    const ax = V.norm(V.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), ay = V.cross(n, ax), k = 1 - a;
    spr(q[0], q[1], q[2], (s.big ? 120000 : 70000)*(0.6 + 0.6*a), 0.9*k, 1.4*k, 2.6*k, 5, a, 0, ax, ay);
    spr(q[0], q[1], q[2], (s.big ? 60000 : 36000)*(1 + a), 3*k*k, 2.2*k*k, 1.4*k*k, 1, a, 0);
  }
  // lights on the hulls: engine glows that hold their size far off, nav lights, beacons, lamps
  const blink = (k, ph) => Math.pow(0.5 + 0.5*Math.sin(t*k + ph), 16);
  for (const e of W.ents) {
    if (!e.alive || e.arrive > t || e.docked || e.dying >= 0 || e.wreck) continue;
    const c = WAR_CLS[e.cls], K = SHIP_KIT[c.mesh], d = dist(e.p), sc = e.scale || 1;
    if (e.kind === 'fighter' || e.kind === 'bomber') {
      const col = e.team ? [3.2, 1.2, 0.4] : [0.8, 1.4, 3.2], gk = e.dive ? 2 : 1;
      for (const E of K.engines) { const q = wAt(e, E.p); spr(q[0], q[1], q[2], E.r*2.2 + d*0.0026, col[0]*0.6*gk, col[1]*0.6*gk, col[2]*0.6*gk, 0, 0, 0); }
      if (e.cls === 'locust') { const q = wAt(e, K.eye); spr(q[0], q[1], q[2], 1.2 + d*0.0008, 3, 0.25, 0.1, 0, 0, 0); }
      if (e.cls === 'locust' && e.p[1] < WAR_T.BREACH_Y + 1500) { const q = wAt(e, K.bomb), k = 0.5 + 0.5*Math.sin(t*12); spr(q[0], q[1], q[2], 4 + d*0.001, 3*k, 0.8*k, 0.2*k, 0, 0, 0); }
    } else if (e.kind === 'capital') {
      const k = WAR_CLS[e.cls].boss ? 1.4 : 1;
      for (const E of K.engines) { const q = wAt(e, E.p); spr(q[0], q[1], q[2], E.r*sc*1.1, 1.7, 0.62, 0.18, 0, 0, 0); }
      const bl = 0.25 + blink(2.2, e.seed*7)*(W.rm ? 0.4 : 2.2);
      for (const q0 of K.beacons || []) { const q = wAt(e, q0); spr(q[0], q[1], q[2], K.hit[0]*sc*0.09 + d*0.0012, 2.4*bl*k, 0.25*bl, 0.12*bl, 0, 0, 0); }
      const la = e.ai.launchT == null ? 9 : t - e.ai.launchT;
      if (la < 1.6 && K.hangar) for (const hq of K.hangar) { const q = wAt(e, hq), k2 = (1 - la/1.6)**2; spr(q[0], q[1], q[2], K.hit[0]*sc*0.5, 2.6*k2, 1.6*k2, 0.9*k2, 0, 0, 0); }
      if (e.ai.charging != null) { const q = wAt(e, [0, 0, K.hit[2]]), k3 = Math.min(1, (t - e.ai.charging)/WAR_W.sunder.charge); spr(q[0], q[1], q[2], 30 + 260*k3*k3, 4*k3, 0.8*k3, 0.3*k3, 1, 0.2, 0); }
    } else if (e.kind === 'platform' || e.kind === 'station') {
      for (const q0 of K.lamps || []) { const q = wAt(e, q0); spr(q[0], q[1], q[2], 0.9 + d*0.0007, 2.4, 1.2, 0.3, 0, 0, 0); }
      if (K.nav) { const q1 = wAt(e, K.nav.port), q2 = wAt(e, K.nav.stbd), bk = 0.35 + 1.5*blink(3.1, e.seed*5);
        spr(q1[0], q1[1], q1[2], 0.9 + d*0.0006, 2.2*bk, 0.15*bk, 0.1*bk, 0, 0, 0); spr(q2[0], q2[1], q2[2], 0.9 + d*0.0006, 0.1*bk, 2*bk, 0.4*bk, 0, 0, 0); }
      if (e.kind === 'station') {
        const bl = blink(1.1, 0);
        for (const q0 of K.beacons) { const q = wAt(e, q0); spr(q[0], q[1], q[2], 3 + d*0.0008, 2.6*(0.2 + bl*2), 0.2*(0.2 + bl*2), 0.1, 0, 0, 0); }
        for (const q0 of K.strobes) { const q = wAt(e, q0); spr(q[0], q[1], q[2], 4 + d*0.0008, 2.4*blink(1.3, 2), 2.4*blink(1.3, 2), 2.4*blink(1.3, 2), 1, 0, 0); }
        const bay = wAt(e, K.hangar); spr(bay[0], bay[1], bay[2], 28, 0.35, 0.3, 0.2, 0, 0, 0);
      }
    }
  }
  return [ns, nb];
}
// trail segments (16 floats: a km + width km, b km + width km, colour + alpha at a, alpha at b), camera-relative
function cmbTrailRows(D, eyeRel){
  const W = WAR, T = WAR_TRAIL, cap = D.length/16, e0 = CAM.eye, X = SECT.X, Y = SECT.Y, Z = SECT.Z; let n = 0;
  const w = (x, y, z, i) => (X[i]*(x - e0[0]) + Y[i]*(y - e0[1]) + Z[i]*(z - e0[2]))*1e-3;
  const one = tr => {
    let px = 0, py = 0, pz = 0, pw = 0.5, pa = 0, have = false;
    const col = tr.team ? [1.0, 0.42, 0.13] : [0.35, 0.62, 1.3];
    if (tr.e && tr.e.alive && !tr.e.docked) { const K = SHIP_KIT[WAR_CLS[tr.e.cls].mesh], q = wAt(tr.e, K.engines[0].p); px = q[0]; py = q[1]; pz = q[2]; have = true; }
    for (let j = 1; j <= T.n; j++) {
      const i = (tr.head - j + T.n) % T.n, age = W.t - tr.T[i]; if (age > T.life || age < 0) break;
      const k = clamp(age/T.life, 0, 1), wd = 0.5 + 1.8*k, a = (1 - k)*(1 - k)*(1 - k)*smooth01(age/0.1)*0.4;
      const x = tr.P[i*3], y = tr.P[i*3+1], z = tr.P[i*3+2];
      if (have && n < cap && pa + a >= 0.01) { const o = n++*16;
        D[o] = w(px, py, pz, 0); D[o+1] = w(px, py, pz, 1); D[o+2] = w(px, py, pz, 2); D[o+3] = pw*1e-3;
        D[o+4] = w(x, y, z, 0); D[o+5] = w(x, y, z, 1); D[o+6] = w(x, y, z, 2); D[o+7] = wd*1e-3;
        D[o+8] = col[0]; D[o+9] = col[1]; D[o+10] = col[2]; D[o+11] = pa; D[o+12] = a; D[o+13] = 0; D[o+14] = 0; D[o+15] = 0; }
      px = x; py = y; pz = z; pw = wd; pa = a; have = true;
    }
  };
  for (const tr of W.trails) one(tr);
  for (const e of W.ents) if (e.tr && e.alive && !e.docked) one(e.tr);
  return n;
}
// up to `max` point lights on the hulls (explosions, muzzles, motors, beams), camera-relative km
function cmbLights(eyeRel, pos4, col3, max){
  const W = WAR, F = W.F, t = W.t, cand = [], e0 = CAM.eye;
  const add = (p, R, c, k) => cand.push([p, R, c, k, k*R*R/((p[0] - e0[0])**2 + (p[1] - e0[1])**2 + (p[2] - e0[2])**2 + 1)]);
  for (const e of W.ents) if (e.muzzle && t - e.muzzle.t < 0.07) add(e.muzzle.p, e.muzzle.big ? 90 : 30, [0.7, 0.85, 1.2], e.muzzle.big ? 2 : 1.1);
  for (let i = 0; i < W.nf; i++) {
    const o = i*WF, kind = F[o+8];
    if (kind !== 1 && kind !== 2) continue;
    const a = (t - F[o+6])/F[o+7]; if (a > (kind === 1 ? 0.8 : 0.45)) continue;
    const size = F[o+9]; if (size < 6) continue;
    add([F[o], F[o+1], F[o+2]], size*(kind === 1 ? 1.2 : 2.5), kind === 1 ? [1.5, 1.1, 0.75] : [1.6, 0.8, 0.35], kind === 1 ? (1 - a)*(1 - a)*2.2 : (1 - a/0.45)*1.4);
  }
  for (const m of W.msl) if (m.t >= m.ign) add(m.p, 40, [1.2, 0.75, 0.4], 0.9);
  for (const b of W.beams) { const k = 1 - (t - b.t0)/b.life; add(b.b, 600, b.kind === 'sunder' ? [2, 0.5, 0.2] : [1, 1.3, 2], 3*k); if (b.kind !== 'lance') add(b.a, 400, [1, 1.3, 2], 2*k); }
  cand.sort((A, B) => B[4] - A[4]);
  const X = SECT.X, Y = SECT.Y, Z = SECT.Z, n = Math.min(max, cand.length);
  for (let i = 0; i < n; i++) {
    const [p, R, c, k] = cand[i], d = [p[0] - e0[0], p[1] - e0[1], p[2] - e0[2]];
    for (let j = 0; j < 3; j++) pos4[i*4 + j] = (X[j]*d[0] + Y[j]*d[1] + Z[j]*d[2])*1e-3;
    pos4[i*4+3] = R*1e-3; col3[i*3] = c[0]*k; col3[i*3+1] = c[1]*k; col3[i*3+2] = c[2]*k;
  }
  return n;
}
