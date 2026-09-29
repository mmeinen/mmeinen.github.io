'use strict';
// flight.js — the HELM: fly the ship yourself round MILLER. Pure maths (no GL), loaded after orbit.js.
//
// Modes. STATION is orbit.js's scripted dawn-dusk orbit with the hero framing (the default; Gargantua always in view).
// HELM is yours: seeded from the station orbit, so taking the controls never jumps. AUTO flies you home: over ~5-12 s
// it blends from where you are to the station orbit (radius interpolated, direction slerped, so the path never cuts
// through MILLER), then hands back to STATION. orbitStep() keeps advancing the station orbit underneath the whole
// time; flightStep() runs after it and, outside STATION, overwrites the camera and the ship telemetry in ORB.
//
// Physics: MILLER-centred inertial frame, float64 metres, real gravity from MILLER alone (so the predicted orbit is
// exact), sim time = real time x ORB.TC, velocity Verlet in sub-steps of <= 0.25 s sim. ORBIT ASSIST (default on) is an
// acceleration steering the velocity to v_circ(p) + v_cmd: v_circ is the circular speed at your radius in your plane,
// v_cmd what you command -- "fly where you point" -- relaxing to zero when you let go. So letting go always settles
// you into a circular orbit wherever you are. Forward thrust speeds you along the orbit; point up to climb. With the
// assist off, thrust is plain Newtonian and the HUD shows the ellipse you are on. Speeds scale with altitude
// ("supercruise"), so a 150 km skim and a 100,000 km climb both take seconds. The rails: a soft floor from 110 km
// (PULL UP) at 70 km, inside the atmosphere (below 84 km: drag, plasma, shake) so a dive still burns, a hard floor at 50 km that skips you back out, and a
// ceiling at 120,000 km (MILLER's Hill sphere is ~145,000 km), enforced on the commanded climb rate, not by clamping.
//
// Attitude is rate-controlled in REAL time, and carried each step by the minimal rotation from the old local vertical
// to the new one: the horizon stays where you left it, with none of an LVLH frame's singularities. Checked in Node
// before it was written: a burn settles to e ~ 1e-3 within 8 s at 10-144 fps; energy drift with the assist off is
// 1.6e-10 per orbit.

const HELM = {
  mode: 'station', view: 'chase', assist: true, track: false,
  p: null, v: null, f: null, u: null, ub: null,   // ship: position/velocity rel. MILLER (m, m/s sim), nose, dorsal (+ banked)
  w: [0, 0, 0],                                   // body rates: pitch, yaw, roll (rad/s real)
  vcmd: [0, 0, 0], hdir: null,                    // commanded velocity relative to the circular orbit; last good tangent
  input: {pitch: 0, yaw: 0, roll: 0, thrust: 0, boost: 0, hold: 0},
  lag: null, camK: 0, chaseDist: 95, idle: 0, auto: null, shake: 0, shk: null,
  heat: 0, alt: 0, vmax: 0, thrustNow: 0, bank: 0, warn: '', events: [],
  // Hooks the weapons (combat.js) drive, so this file never has to know about them. ref = the engagement's Hill frame
  // {N, n0}: the assist then flies v -> n0 N x p + vcmd (rigid co-rotation), so offsets hold on all three axes and a
  // sideways command is a true relative velocity (the law below takes its horizontal from the ship's own velocity: a
  // sideways command is a plane change, which ran away to 1.1 km/s of drift in a 2 s strafe). vcap = a speed cap
  // (sim m/s) instead of supercruise; kick = a camera jolt (decays); disabled = knocked out, tumbling at `tumble`.
  ref: null, vcap: 0, kick: 0, disabled: false, tumble: [0, 0, 0],
  // tuning (sim units unless marked real)
  K_V: 0.02, BOOST: 4, VCAP_BOOST: 2.2, TAU_THRUST: 0.6, TAU_COAST: 1.0, TAU_HOLD: 0.25, TAU_OA: 0.5,     // taus in real seconds
  FLOOR: 5.0e4, SOFT: 7.0e4, ATMO: 8.4e4, CEIL: 1.2e8,
  RATE_PY: 60*DEG, RATE_R: 120*DEG, TAU_RATE: 0.12, IDLE_AUTO: 150, FOV: 58*DEG, LEN: 46,
  // the HULL camera: bolted to the dorsal spine behind the survey dish (ship metres: +x, +y dorsal, +z bow), looking
  // along the hull a little nose-down -- the Interstellar shot: the ship holds still in frame and the world moves
  HULL_CAM: [0, 4.9, -13.5], HULL_PITCH: 6*DEG, HULL_FOV: 64*DEG,
};
const HELM_VIEWS = ['chase', 'hull', 'cockpit'];

// ------------------------------------------------------------------------------------------ small helpers
const QV = {
  slerp(a, b, t){ const d = clamp(V.dot(a, b), -1, 1), th = Math.acos(d); if (th < 1e-6) return V.norm(V.add(a, V.mul(V.sub(b, a), t)));
    const s = Math.sin(th); return V.norm(V.add(V.mul(a, Math.sin((1 - t)*th)/s), V.mul(b, Math.sin(t*th)/s))); },
  // rotate v by the minimal rotation taking unit a to unit b
  carry(v, a, b){ const ax = V.cross(a, b), s = V.len(ax); if (s < 1e-12) return v; return V.rot(v, V.mul(ax, 1/s), Math.atan2(s, V.dot(a, b))); },
  ortho(f, u){ f = V.norm(f); u = V.norm(V.sub(u, V.mul(f, V.dot(u, f)))); return [f, u]; },
};
function helmGM(){ return ORB.planet.GM; }
function circSpeed(r){ return Math.sqrt(helmGM()/r); }

// ------------------------------------------------------------------------------------------ mode changes
function helmAvailable(){ return typeof SCENE !== 'undefined' && SCENE.state === 'run'; }
function helmEnter(){
  const H = HELM, o = ORB;
  if (H.mode === 'helm' || !helmAvailable()) return false;
  if (H.mode === 'station') {                     // seed from the station orbit: same place, speed and view
    const P = o.bodies[1].pos, h = o.hud;
    H.p = V.sub(o.view.eye, P); H.v = V.mul(h.pro, circSpeed(V.len(H.p)));
    [H.f, H.u] = QV.ortho(o.view.b.f, o.view.b.u);
    H.lag = {f: H.f.slice(), u: H.u.slice()}; H.camK = 0; H.fovNow = o.view.fov;
    H.vcmd = [0, 0, 0]; H.hdir = V.norm(h.pro); H.w = [0, 0, 0];
  }
  H.mode = 'helm'; H.auto = null; H.idle = 0;
  if (typeof FLY !== 'undefined' && FLY.off) H.view = 'cockpit';
  H.events.push({type: 'helm'});
  return true;
}
// Fly home: pick the station phase nearest to us (and our altitude, within the station's range), then blend.
function helmAuto(reason){
  const H = HELM, o = ORB;
  if (H.mode !== 'helm' || H.disabled) return false;                                   // knocked out: nothing answers the helm
  const P = o.bodies[1].pos, s = o.ship, pl = o.planet, n = V.norm(H.p);
  // the station orbit plane: spanned by up0 and u2 (orbit.js); its phase theta measured from up0 toward u2
  const t = V.norm(V.mul(P, -1)), up0 = V.norm(V.sub([0, 1, 0], V.mul(t, t[1]))), side = V.cross(t, up0);
  const u2 = V.sub(V.mul(side, Math.cos(s.beta)), V.mul(t, Math.sin(s.beta)));
  s.theta = Math.atan2(V.dot(n, u2), V.dot(n, up0));
  s.h = s.hTarget = clamp(V.len(H.p) - pl.R, o.ALT_MIN, o.ALT_MAX);
  const ang = Math.acos(clamp(V.dot(n, V.add(V.mul(up0, Math.cos(s.theta)), V.mul(u2, Math.sin(s.theta)))), -1, 1));
  const dh = Math.abs(Math.log((V.len(H.p) - pl.R)/s.h));
  H.auto = {t: 0, T: clamp(4.5 + ang*3 + dh*2.5, 5, 12), why: reason || 'manual'};
  H.mode = 'auto'; H.idle = 0;
  H.events.push({type: 'auto', why: H.auto.why});
  return true;
}
// V: chase -> hull -> cockpit (with no ship pass there is no hull to see: cockpit only)
function helmToggleView(){ const H = HELM; if (typeof FLY !== 'undefined' && FLY.off) return H.view;
  H.view = HELM_VIEWS[(HELM_VIEWS.indexOf(H.view) + 1) % HELM_VIEWS.length]; H.events.push({type: 'view', view: H.view}); return H.view; }
// Straight back to station keeping, no blend (the emergency jump arrives there under cover of its white flash)
function helmStation(){ const H = HELM; H.mode = 'station'; H.auto = null; H.camK = 0; H.disabled = false; H.kick = 0; H.shk = null; H.events.push({type: 'station'}); }
function helmToggleAssist(){ const H = HELM; H.assist = !H.assist; H.events.push({type: 'assist', on: H.assist}); return H.assist; }
function helmToggleTrack(){ const H = HELM; H.track = !H.track; H.events.push({type: 'track', on: H.track}); return H.track; }

// ------------------------------------------------------------------------------------------ the step
// dt: REAL seconds, unwarped (the launch jump spins orbitStep up 31x; the ship must not). Runs after orbitStep().
function flightStep(dt){
  const H = HELM, o = ORB;
  if (H.mode === 'station' || !o.bodies) return;
  const pl = o.planet, R = pl.R, P = o.bodies[1].pos, In = H.input, TC = o.TC;
  const upOld = V.norm(H.p);
  // walk away and the autopilot brings the ship home (main.js zeroes idle on any input; the HUD counts down the last 10 s)
  if (H.mode === 'helm' && (H.idle += dt) > H.IDLE_AUTO) helmAuto('idle');
  // ---- attitude (real time): rates chase the stick, the nose tracks the hole if asked; knocked out, the ship tumbles
  const kr = 1 - Math.exp(-dt/(H.disabled ? 0.8 : H.TAU_RATE));
  const want = H.disabled ? H.tumble : [In.pitch*H.RATE_PY, In.yaw*H.RATE_PY, In.roll*H.RATE_R];
  for (let i = 0; i < 3; i++) H.w[i] += (want[i] - H.w[i])*kr;
  let f = H.f, u = H.u, r = V.cross(f, u);
  if (H.w[0]) { f = V.rot(f, r, H.w[0]*dt); u = V.rot(u, r, H.w[0]*dt); }              // pitch: nose up for +
  if (H.w[1]) { f = V.rot(f, u, H.w[1]*dt); }                                          // yaw: nose left for +
  if (H.w[2]) { u = V.rot(u, f, H.w[2]*dt); }                                           // roll: right wing down for +
  if (H.track && H.mode === 'helm' && !H.disabled) {                                    // T: keep Gargantua on the nose
    const toHole = V.norm(V.mul(V.add(P, H.p), -1)), ax = V.cross(f, toHole), s = V.len(ax);
    if (s > 1e-6) { const ang = Math.min(Math.atan2(s, V.dot(f, toHole)), 1.2*dt); f = V.rot(f, V.mul(ax, 1/s), ang); u = V.rot(u, V.mul(ax, 1/s), ang); }
  }
  // ---- translation (sim time)
  const alt0 = V.len(H.p) - R;
  H.vmax = H.vcap ? H.vcap*(In.boost ? H.VCAP_BOOST : 1) : H.K_V*Math.max(alt0, 5e4)*(In.boost ? H.BOOST : 1);
  const live = H.mode === 'helm' && !H.disabled, thr = live ? In.thrust : 0, hold = live && In.hold;
  H.thrustNow = thr;
  if (H.mode === 'helm') {
    const tau = hold ? H.TAU_HOLD : thr ? H.TAU_THRUST : H.TAU_COAST, k = 1 - Math.exp(-dt/tau);
    const target = hold ? [0, 0, 0] : V.mul(f, thr*H.vmax*(thr < 0 ? 0.35 : 1));
    H.vcmd = V.add(H.vcmd, V.mul(V.sub(target, H.vcmd), k));
  } else H.vcmd = V.mul(H.vcmd, Math.exp(-dt/0.5));
  // rails on the command: no pushing down through the soft floor, no climbing past the ceiling
  { const up = V.norm(H.p), vr = V.dot(H.vcmd, up);
    if (alt0 < H.SOFT && vr < 0) H.vcmd = V.sub(H.vcmd, V.mul(up, vr*clamp((H.SOFT - alt0)/(H.SOFT - H.FLOOR), 0, 1)));
    if (vr > 0) H.vcmd = V.sub(H.vcmd, V.mul(up, vr*(1 - clamp((H.CEIL - V.len(H.p))/(0.2*H.CEIL), 0, 1)))); }   // brake the climb from 80% of the ceiling
  const GM = helmGM(), tauOA = H.TAU_OA*TC, aMax = Math.max(H.vmax, 2000)/(0.8*TC);
  const acc = (p, v) => {
    const r2 = V.dot(p, p), rr = Math.sqrt(r2), up = V.mul(p, 1/rr);
    let a = V.mul(p, -GM/(r2*rr));
    const alt = rr - R;
    if (H.assist || H.mode !== 'helm') {
      const vh = V.sub(v, V.mul(up, V.dot(v, up))), hl = V.len(vh);
      if (hl > 1) H.hdir = V.mul(vh, 1/hl);
      else if (!H.hdir || Math.abs(V.dot(H.hdir, up)) > 0.5) H.hdir = V.norm(V.sub(f, V.mul(up, V.dot(f, up))));
      let vdes;
      if (H.ref) vdes = V.add(V.mul(V.cross(H.ref.N, p), H.ref.n0), H.vcmd);          // armed: co-rotate with the fight
      else { const hd = V.norm(V.sub(H.hdir, V.mul(up, V.dot(H.hdir, up)))); vdes = V.add(V.mul(hd, Math.sqrt(GM/rr)), H.vcmd); }
      if (alt < H.SOFT) vdes = V.add(vdes, V.mul(up, 900*clamp((H.SOFT - alt)/(H.SOFT - H.FLOOR), 0, 1.5)));   // auto pull-up
      if (rr > H.CEIL) vdes = V.sub(vdes, V.mul(up, H.vmax*0.3*clamp((rr - H.CEIL)/(0.05*H.CEIL), 0, 1)));      // and back in from the ceiling
      let ad = V.mul(V.sub(vdes, v), 1/tauOA); const l = V.len(ad); if (l > aMax) ad = V.mul(ad, aMax/l);
      a = V.add(a, ad);
    } else if (thr) a = V.add(a, V.mul(f, thr*(thr < 0 ? 0.35 : 1)*H.vmax/(4*TC)));
    if (alt < H.ATMO) {                                                                  // thin upper atmosphere: drag
      const rho = Math.exp(-(alt - H.FLOOR)/9e3), s = V.len(v);
      a = V.add(a, V.mul(v, -2e-6*rho*s));
    }
    return a;
  };
  let rem = dt*TC;
  while (rem > 1e-9) {
    const h = Math.min(rem, 0.25); rem -= h;
    const a0 = acc(H.p, H.v), vh = V.add(H.v, V.mul(a0, h/2));
    H.p = V.add(H.p, V.mul(vh, h));
    H.v = V.add(vh, V.mul(acc(H.p, vh), h/2));
  }
  // hard floor: skip off the atmosphere
  { const rr = V.len(H.p), up = V.mul(H.p, 1/rr);
    if (rr < R + H.FLOOR) { H.p = V.mul(up, R + H.FLOOR); const vr = V.dot(H.v, up);
      if (vr < 0) { H.v = V.sub(H.v, V.mul(up, 1.6*vr)); if (vr < -30 && o.tReal - (H.lastSkip || -9) > 2) { H.lastSkip = o.tReal; H.events.push({type: 'skip'}); } } } }
  // beyond the ceiling with the assist off: turned back like at the floor
  { const rr = V.len(H.p), up = V.mul(H.p, 1/rr), vr = V.dot(H.v, up);
    if (rr > H.CEIL*1.1 && vr > 0) H.v = V.sub(H.v, V.mul(up, 1.6*vr)); }
  // the moon: never inside it
  { const Mp = V.sub(o.bodies[2].pos, P), d = V.sub(H.p, Mp), dl = V.len(d), minD = o.moon.R + 3e4;
    if (dl < minD) { const n = V.mul(d, 1/dl); H.p = V.add(Mp, V.mul(n, minD)); const vn = V.dot(H.v, n); if (vn < 0) H.v = V.sub(H.v, V.mul(n, vn)); } }
  // carry the attitude with the local vertical: the horizon holds when you let go
  const upNew = V.norm(H.p);
  f = QV.carry(f, upOld, upNew); u = QV.carry(u, upOld, upNew);
  [H.f, H.u] = QV.ortho(f, u);
  const alt = V.len(H.p) - R; H.alt = alt;
  // heat (plasma) and warnings
  const rho = alt < H.ATMO ? Math.exp(-(alt - H.FLOOR)/9e3) : 0, sp = V.len(H.v);
  H.heat += (clamp(rho*Math.pow(sp/7000, 3)*2.4, 0, 1) - H.heat)*(1 - Math.exp(-dt/0.3));
  H.warn = alt < H.ATMO ? 'PLASMA' : (alt < H.SOFT && V.dot(H.v, upNew) < 0 ? 'PULL UP' : (V.len(H.p) > H.CEIL*0.97 ? 'HILL LIMIT' : ''));
  H.bank += ((H.mode === 'helm' && !H.disabled ? -H.w[1]*0.45 : 0) - H.bank)*(1 - Math.exp(-dt/0.35));
  H.shake = Math.max(H.heat*0.9, In.boost && thr > 0 ? 0.35 : 0);
  H.kick *= Math.exp(-dt/0.35);
  // One small rotation carries the shake (engine, plasma) and the jolts (hits, the guns: kick). The hull camera applies it
  // to the ship and itself together, so the hull holds still in frame and the world shakes, as a bolted-on camera sees it.
  H.shk = null;
  if (H.shake > 0 || H.kick > 1e-3) {
    const t = o.tReal, s = H.shake*0.004, q = Math.min(H.kick, 1.5)*0.02;
    const ax = [Math.sin(t*37)*s + Math.sin(t*27.3 + 0.3)*q, Math.sin(t*41 + 1)*s + Math.sin(t*23.9 + 1.9)*q, Math.sin(t*33 + 2)*s + Math.sin(t*31.7 + 4.1)*q];
    const a = V.len(ax); if (a > 1e-7) H.shk = {ax: V.mul(ax, 1/a), ang: a};
  }
  // ---- autopilot blend toward the station state (orbitStep keeps it current)
  let eyeShip = V.add(P, H.p), fS = H.f, uS = H.u, blend = 0;
  if (H.mode === 'auto') {
    const A = H.auto; A.t += dt;
    blend = smooth01(A.t/A.T);
    const st = o.view, sp0 = V.sub(st.eye, P);
    const dir = QV.slerp(V.norm(H.p), V.norm(sp0), blend), rad = V.len(H.p) + (V.len(sp0) - V.len(H.p))*blend;
    H.p = V.mul(dir, rad);
    H.v = V.add(V.mul(H.v, 1 - blend), V.mul(o.hud.pro, circSpeed(rad)*blend));
    fS = QV.slerp(H.f, st.b.f, blend); uS = QV.slerp(H.u, st.b.u, blend); [fS, uS] = QV.ortho(fS, uS);
    [H.f, H.u] = [fS, uS];
    eyeShip = V.add(P, H.p);
    if (A.t >= A.T) { H.mode = 'station'; H.auto = null; H.camK = 0; H.events.push({type: 'station'}); return; }
  }
  // ---- camera: chase rig (offset in the ship's LAGGED frame, only the attitude lags) or cockpit, blended in and out
  const kl = 1 - Math.exp(-dt/0.18);
  H.lag.f = QV.slerp(H.lag.f, fS, kl); H.lag.u = QV.slerp(H.lag.u, uS, kl); [H.lag.f, H.lag.u] = QV.ortho(H.lag.f, H.lag.u);
  const chase = H.view === 'chase', hullV = H.view === 'hull' && H.mode === 'helm';
  H.camK += ((H.mode === 'helm' && chase ? 1 : 0) - H.camK)*(1 - Math.exp(-dt/0.45));
  if (H.mode === 'auto') H.camK *= 1 - blend;
  H.ub = H.bank ? V.rot(uS, fS, H.bank) : uS;                                           // the attitude the ship is DRAWN with
  let eye, bf, bu;
  if (hullV) {
    // the hull camera is a cut, never a blend (a camera is bolted on or it is not): rigid on the drawn attitude
    let sf = fS, su = H.ub;
    if (H.shk) { sf = V.rot(sf, H.shk.ax, H.shk.ang); su = V.rot(su, H.shk.ax, H.shk.ang); }
    const m = H.HULL_CAM, sx = V.cross(su, sf);                                          // ship +x (ships.js: r = u x f)
    eye = V.add(eyeShip, V.add(V.add(V.mul(sx, m[0]), V.mul(su, m[1])), V.mul(sf, m[2])));
    const cr = V.cross(sf, su);
    bf = V.rot(sf, cr, -H.HULL_PITCH); bu = V.rot(su, cr, -H.HULL_PITCH); [bf, bu] = QV.ortho(bf, bu);
  } else {
    const d = H.chaseDist, lf = H.lag.f, lu = H.lag.u;
    const eyeChase = V.add(eyeShip, V.add(V.mul(lf, -d), V.mul(lu, d*0.24)));
    const look = V.add(eyeShip, V.mul(lf, d*1.6));
    let cf = V.norm(V.sub(look, eyeChase)), cu = lu;
    [cf, cu] = QV.ortho(cf, cu);
    const k = smooth01(H.camK);
    eye = V.add(eyeShip, V.mul(V.sub(eyeChase, eyeShip), k));
    bf = QV.slerp(fS, cf, k); bu = QV.slerp(uS, cu, k); [bf, bu] = QV.ortho(bf, bu);
    if (H.shk) { bf = V.rot(bf, H.shk.ax, H.shk.ang); bu = V.rot(bu, H.shk.ax, H.shk.ang); [bf, bu] = QV.ortho(bf, bu); }
  }
  const br = V.norm(V.cross(bf, bu));
  let fov = (hullV ? H.HULL_FOV : H.FOV) + (In.boost && thr > 0 ? 9*DEG : 0);
  if (H.mode === 'auto') fov = fov + (o.view.fov - fov)*blend;                      // o.view is still the station view here
  if (o.zoom > 1) fov = 2*Math.atan(Math.tan(fov/2)/o.zoom);
  H.fovNow = H.fovNow ? H.fovNow + (fov - H.fovNow)*(1 - Math.exp(-dt/0.25)) : fov;
  const fovOut = o.warp > 0 ? H.fovNow + (112*DEG - H.fovNow)*o.warp*o.warp : H.fovNow;   // the jump tunnels out
  o.view = {eye, b: {r: br, u: bu, f: bf}, fov: fovOut};
  o.camM = V.mul(eye, 1/o.M);
  // ---- telemetry the HUD reads (the station fields, recomputed for the ship)
  const hud = o.hud, up = V.norm(H.p), rr = V.len(H.p);
  const vh = V.sub(H.v, V.mul(up, V.dot(H.v, up)));
  hud.alt = alt; hud.vel = V.len(H.v); hud.up = up; hud.pro = V.len(vh) > 1 ? V.norm(vh) : (H.hdir || fS);
  const en = V.dot(H.v, H.v)/2 - GM/rr, sma = -GM/(2*en);
  hud.period = en < 0 ? 2*Math.PI*Math.sqrt(sma*sma*sma/GM) : Infinity;
  hud.burn = Math.abs(thr) > 0.05; hud.climb = V.dot(H.v, up) > 0;
  hud.dirHole = V.norm(V.mul(eye, -1)); hud.rangeHole = V.len(eye);
  const sinEl = clamp(V.dot(V.norm(V.mul(eyeShip, -1)), up), -1, 1); hud.el = Math.asin(sinEl); hud.dip = Math.acos(clamp(R/rr, -1, 1));
  const q = M3.vec(M3.T(o.bodies[1].l2w), up); hud.lat = Math.asin(clamp(q[1], -1, 1)); hud.lon = Math.atan2(q[0], q[2]);
  const toMoon = V.sub(o.bodies[2].pos, eye), dMoon = V.len(toMoon);
  hud.dirMoon = V.mul(toMoon, 1/dMoon); hud.moonRange = dMoon - o.moon.R; hud.moonAng = Math.asin(Math.min(1, o.moon.R/dMoon));
  hud.fov = o.view.fov;
  // orbit elements for the HUD (osculating) and what the assist will settle into
  const hv = V.cross(H.p, H.v), ev = V.sub(V.mul(V.cross(H.v, hv), 1/GM), up), e = V.len(ev);
  hud.ecc = e; hud.ap = en < 0 ? sma*(1 + e) - R : Infinity; hud.pe = (en < 0 ? sma*(1 - e) : V.dot(hv, hv)/GM/(1 + e)) - R;
  hud.inc = Math.acos(clamp(V.norm(hv)[1], -1, 1)); hud.rel = V.len(H.vcmd); hud.vmax = H.vmax; hud.heat = H.heat;
  hud.shipPos = eyeShip; hud.nose = fS; hud.helm = true;
}
// A ship pose the renderer draws (ships.js): world position, axes, engine glow, visual bank. null in STATION.
function helmShip(){
  const H = HELM;
  if (H.mode === 'station' || !ORB.hud.shipPos) return null;
  // never from inside the hull (the cockpit view, or the first moments of pulling out to the chase view); the hull
  // camera sits outside it on the spine, 14 m from the centre
  const hullV = H.view === 'hull' && H.mode === 'helm';
  if (!hullV && V.len(V.sub(ORB.view.eye, ORB.hud.shipPos)) < 40) return null;
  let u = H.u, f = H.f; if (H.bank) u = V.rot(u, f, H.bank);
  if (hullV && H.shk) { f = V.rot(f, H.shk.ax, H.shk.ang); u = V.rot(u, H.shk.ax, H.shk.ang); }      // shaken with its camera
  return {pos: ORB.hud.shipPos, f, u, glow: clamp(Math.abs(H.thrustNow) + (H.input.boost ? 0.6 : 0), 0, 1.6), heat: H.heat, boost: !!H.input.boost, hull: hullV};
}
