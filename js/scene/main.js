'use strict';
// main.js — boot, the frame loop, the adaptive render scale and input. Loaded last.
//
// Boot is staged so the HUD's boot sequence (CSS-animated, so a busy main thread cannot stall it) covers it:
// queue every program (built in the background where KHR_parallel_shader_compile exists) -> bake Gargantua's
// geodesics a few tiles per frame -> run. Any failure hands over to HUD.fallback(): the game menu is plain HTML
// and keeps working without WebGL.

const QS = new URLSearchParams(location.search);
const SMALL = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 720;
if (SMALL) { BH.CUBE = 512; BH.budgetMs = 0.8; }  // 44 MB of bake targets instead of 176 MB on phones

const DPR_CAP = 1.25;
let renderScale = SMALL ? 0.6 : 1.0;
let cw = 2, ch = 2;                            // canvas size in device pixels
// film: the Nolan grade in post.js (0 at station, 0.5 at the helm, 1 armed); weave: the gate weave (px, cutaways only)
const LOOK = {bloom: 1, expo: 1, stretch: 0.05, warp: 0, flash: 0, film: 0, weave: [0, 0]};
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
// the dock layout (css/hud.css, hud.js DOCK): no cutaways there -- the mission sheet owns the screen
const DOCK_MQ = matchMedia('(max-width: 720px), (max-height: 520px) and (max-width: 1000px), (orientation: portrait) and (max-width: 1100px) and (pointer: coarse)');
const SCENE = {state: 'boot', why: '', t0: performance.now(), bake: 0, fps: 0};
window.SCENE = SCENE;

function sceneFail(why){
  if (SCENE.state === 'failed') return;
  SCENE.state = 'failed'; SCENE.why = why;
  console.warn('landing scene disabled:', why);
  HUD.fallback(why);
}

function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  cw = Math.max(2, Math.round(innerWidth*dpr)); ch = Math.max(2, Math.round(innerHeight*dpr));
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  const w = Math.max(2, Math.round(cw*renderScale)), h = Math.max(2, Math.round(ch*renderScale));
  if (!T || T.w !== w || T.h !== h) makeTargets(w, h);
  orbitResize(innerWidth, innerHeight);
}

/* ---- Adaptive render scale (ported from the previous landing page; tests.html 5d guards it) ------------------
   The heavy passes render at renderScale; the FXAA pass resolves them up to the canvas. The controller is built
   to SETTLE rather than track, because under vsync a frame costs one refresh or two and nothing in between:
     - it counts missed refreshes instead of comparing milliseconds (no absolute ms target is reachable);
     - it remembers the lowest scale that missed (rsCeiling) and parks just under it, so the steady state is
       "change nothing" instead of "keep hunting" -- a controller without that memory pumps the resolution;
     - every change is followed by a settle window, because the target realloc makes that frame slow and
       counting it as evidence drove the old loop to the floor.
   Never go below the 0.35 floor: sub-floor scaling was tried and rejected by the user.                          */
const RS_MIN = 0.35, RS_MAX = 1.0;
let vsyncMs = 16.7;          // estimated display refresh period, tracked from the fastest frames
let rsWarm = 60;             // ignore start-up frames (first paints, late shader work)
let rsSettle = 0;            // frames to ignore after a scale change (the target realloc costs one)
let rsMiss = 0, rsGood = 0;
let rsCeiling = RS_MAX;      // lowest scale observed to miss vsync; we stay just below it
let rsProbing = 0;           // frames left in which a miss counts as "that probe was too far"
let rsRelaxAge = 0, rsRelaxEvery = 1800;   // how often the ceiling is allowed to creep back up
let rsViewKey = 0;           // altitude / zoom the ceiling was measured at (they change the cost)

// what the frame cost tracks: altitude (how much of the screen is terrain), telescope zoom, the chase and hull views'
// ship pass, and a fight (its pass covers most of the screen). STATE only, never content: a key driven by what happens
// to be on screen would re-measure every few seconds and pump.
function viewKey(){
  const helm = HELM.mode !== 'station';
  return (helm ? Math.max(HELM.alt, 5e4) : ORB.ship.hTarget)/ORB.zoomTarget*(helm && HELM.view === 'chase' ? 1.6 : helm && HELM.view === 'hull' ? 2.1 : 1)*(COMBAT.hot ? 1.5 : 1);
}
function rsReset(){ rsCeiling = RS_MAX; rsMiss = 0; rsGood = 0; rsWarm = 30; rsSettle = 0; rsProbing = 0; rsRelaxAge = 0; rsRelaxEvery = 1800; rsViewKey = viewKey(); }

function rsSet(v){
  v = Math.max(RS_MIN, Math.min(RS_MAX, Math.round(v*200)/200));   // 0.5% grid: no sub-pixel churn
  if (Math.abs(v - renderScale) < 0.004) return;
  renderScale = v; resize();
  rsSettle = 30; rsMiss = 0; rsGood = 0;
}

function updateRenderScale(ft){
  // Track the refresh period as the floor of observed frame times: approach a faster floor quickly, but let
  // near-period frames pull it back up, so one stray 8ms frame can't make every 16.7ms frame a dropped one.
  if (ft > 3 && ft < vsyncMs) vsyncMs += (ft - vsyncMs)*0.25;
  else if (ft < vsyncMs*1.25) vsyncMs += (ft - vsyncMs)*0.02;
  vsyncMs = Math.max(5, Math.min(34, vsyncMs));

  if (rsWarm > 0) { rsWarm--; return; }
  if (rsSettle > 0) { rsSettle--; return; }

  // Altitude and telescope zoom change how much of the screen is terrain, which is what the cost tracks -- so a
  // ceiling measured at another setting is stale. Re-measure on a real change (>25%) only: at rest and while
  // merely looking around this never fires, which is what keeps the idle state completely still.
  const key = viewKey();
  if (Math.abs(key - rsViewKey) > rsViewKey*0.25) {
    rsViewKey = key; rsCeiling = RS_MAX; rsRelaxEvery = 1800; rsRelaxAge = 0; rsProbing = 0; rsMiss = 0; rsGood = 0;
  }

  // A "miss" is a frame that needed an extra refresh. The absolute 30ms arm is a safety net in case the period
  // estimate latches onto a MULTIPLE of the true refresh. Leaky counter, so isolated hitches decay away.
  // 1.75x, not 1.5: a dropped frame costs exactly 2x, so the margin is free and rAF jitter never reads as a miss.
  if (ft > vsyncMs*1.75 || ft > 30) { rsMiss++; rsGood = 0; } else { rsGood++; rsMiss = Math.max(0, rsMiss - 0.05); }
  rsRelaxAge++; if (rsProbing > 0) rsProbing--;

  if (rsMiss >= 3 && renderScale > RS_MIN) {
    rsCeiling = Math.min(rsCeiling, renderScale);   // this scale is too heavy -- remember it
    // A miss just after a probe means only that the probe reached too far: retreat a hair, and make the next
    // probe rarer. A miss with no recent probe is a real load change and earns a decisive step.
    if (rsProbing > 0) { rsSet(renderScale*0.97); rsRelaxEvery = Math.min(rsRelaxEvery*3, 54000); }
    else { rsSet(renderScale*0.90); rsRelaxEvery = 1800; }
    rsProbing = 0; rsRelaxAge = 0;
    return;
  }
  if (rsGood >= 90) {
    const cap = Math.min(RS_MAX, rsCeiling*0.97);   // park just under the known-too-heavy scale
    // climb fast while far below the cap, then fine-step so the last probe is a small one
    if (renderScale < cap - 0.01) { rsSet(Math.min(cap, renderScale*(renderScale < cap*0.8 ? 1.12 : 1.04))); rsProbing = 300; }
    else rsGood = 0;                                 // at the cap and healthy -> hold. Settled.
  }
  // let the ceiling creep back rarely, so one heavy stretch does not cap quality for the rest of the session
  if (rsRelaxAge >= rsRelaxEvery && rsCeiling < RS_MAX) { rsRelaxAge = 0; rsCeiling = Math.min(RS_MAX, rsCeiling*1.03); }
}

// ------------------------------------------------------------------------------------------ frames
function render(now){
  const v = ORB.view, tSec = (now - SCENE.t0)/1000;
  bhShade(T.compFb, T.w, T.h, v.b, Math.tan(v.fov/2), tSec, ORB.camM);
  let img = systemPass(T, v, ORB.bodies, tSec, 1, 0.4);         // 0.4: the demo's sky gain beside a planet
  if (flyVisible()) {                                            // the MSAA ship pass only runs while one is in view
    // a fault in the fight must not take the flight deck with it: stand combat down and carry on without it
    try { img = flyRender(img, tSec); } catch (e) { if (!cmbActive()) throw e; combatFault(e); glReset(); }
  }
  // the jump's tunnel, or a faint smear while boosting at the helm
  LOOK.warp = Math.max(ORB.warp, HELM.mode === 'helm' && HELM.input.boost && HELM.thrustNow > 0 ? 0.07 : 0);
  postProcess(img, cw, ch, tSec, LOOK);
}
function glReset(){ gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST); gl.depthMask(true); gl.bindVertexArray(vao); }

// ------------------------------------------------------------------------------------------ the fight (combat.js)
// Its step runs after the helm's; its events go to the HUD (log, titles, sound); a cutaway then takes the camera.
// Cutaways never happen under reduced motion, on the dock layout, while a crew's missions are open, or during a launch.
function combatFault(e){
  console.warn('weapons stood down after a fault:', e);
  try { cmbReset(); } catch (_) {}
  COMBAT.events.length = 0; HUD.poke('combat:fault', {});
}
function combatFrame(dt){
  COMBAT.rm = REDUCED.matches;
  COMBAT.cineOK = !REDUCED.matches && !DOCK_MQ.matches && !document.body.classList.contains('crew-open') && !jump && !ejump;
  try { combatStep(dt); } catch (e) { combatFault(e); }
  for (const ev of COMBAT.events.splice(0)) {
    HUD.poke('combat:' + ev.type, ev);
    if (ev.type === 'ejump') emergencyJump(ev);                                          // (after the HUD has logged it)
  }
  // phones: give back the full-screen MSAA targets a fight grew, once it is over
  const act = cmbActive(); if (SMALL && combatFrame.was && !act) flyFreeTargets(); combatFrame.was = act;
  cineView();
}
// the cutaway camera: combat.js gives it MILLER-relative, the renderer wants the hole's frame
function cineView(){
  const s = cmbShotView(); if (!s) return;
  const eye = V.add(ORB.bodies[1].pos, s.eye);
  ORB.view = {eye, b: {r: s.r, u: s.u, f: s.f}, fov: s.fov};
  ORB.camM = V.mul(eye, 1/ORB.M);
}
// Hull 0: the jump drive fires on its own. The launch jump's tunnel and flash, but it lands at the station orbit (under
// the white) instead of leaving the page, then the white falls away. Reduced motion: straight home, no tunnel.
let ejump = null;
function emergencyJump(ev){
  if (ejump) return;
  if (REDUCED.matches || jump) { cmbReset(); helmStation(); HUD.poke('combat:recovered', ev); return; }
  ejump = {t0: performance.now(), ms: 1100, ev, fired: false, t1: 0};
}
function ejumpStep(now){
  const E = ejump;
  if (!E.fired) {
    const k = clamp((now - E.t0)/E.ms, 0, 1);
    ORB.warp = k*k*(3 - 2*k);
    if (k >= 1) { E.fired = true; E.t1 = now; cmbReset(); helmStation(); ORB.warp = 0; HUD.poke('combat:recovered', E.ev); }
    return smooth01((k - 0.55)/0.45);
  }
  const q = clamp((now - E.t1)/800, 0, 1);
  if (q >= 1) ejump = null;
  return 1 - smooth01(q);
}
// the film look: the Nolan grade fades in at the helm and fully when armed; a big flash stops the lens down and it opens
// again over a second; the gate weave runs only in cutaways (the HUD's symbology does not weave: it would swim)
function lookStep(dt, flash){
  LOOK.film += ((COMBAT.hot || COMBAT.shot ? 1 : HELM.mode !== 'station' ? 0.5 : 0) - LOOK.film)*(1 - Math.exp(-dt/1.5));
  const cf = REDUCED.matches ? 0 : COMBAT.flash;
  if (cf > 0.8 && LOOK.expo > 0.85) LOOK.expo = 0.6;
  LOOK.expo += (1 - LOOK.expo)*(1 - Math.exp(-dt/1.3));
  LOOK.flash = Math.max(flash, cf*0.35);
  if (COMBAT.shot && !REDUCED.matches) {
    const t = Math.floor(performance.now()/41.7);                     // 24 steps a second, like a film gate
    LOOK.weave = [Math.sin(t*1.7)*0.2 + Math.sin(t*0.61)*0.1, Math.sin(t*1.3 + 1)*0.16 + Math.sin(t*0.47 + 2)*0.1];
  } else LOOK.weave = [0, 0];
}

let last = 0, jump = null, rafId = 0;
// exactly one frame in flight: a page restored from the back/forward cache must not start a second loop
function schedule(){ if (!rafId) rafId = requestAnimationFrame(t => { rafId = 0; frame(t); }); }
function frame(now){
  if (SCENE.state !== 'run') return;
  // anything that throws in here (a render target the GPU refuses on resize, say) would silently stop the loop
  // with a frozen image: hand over to the fallback instead, which keeps the menu and instruments alive
  try { frameBody(now); } catch (e) { sceneFail(e.message); }
}
function frameBody(now){
  const ft = Math.min(now - last, 250); last = now;
  const dt = Math.min(ft, 100)/1000;
  let flash = 0;
  if (jump) {                                   // the launch: tunnel out, flash, then navigate
    const k = clamp((now - jump.t0)/jump.ms, 0, 1);
    ORB.warp = k*k*(3 - 2*k); flash = smooth01((k - 0.72)/0.28);
    if (k >= 1 && !jump.fired) { jump.fired = true; jump.done(); }
  } else if (ejump) flash = ejumpStep(now);
  orbitStep(dt*(1 + 30*ORB.warp*ORB.warp));    // the jump also spins the world up
  helmInput(dt); flightStep(dt);                 // ...but not the ship: the helm gets real time
  for (const ev of HELM.events.splice(0)) HUD.poke('helm:' + ev.type, ev);
  const contact = flyStep(dt);
  if (contact) HUD.poke('contact', contact);
  combatFrame(dt);
  lookStep(dt, flash);
  // Gargantua's spin drifts, and MILLER's inclined orbit slowly carries the camera away from the bake point: the
  // scheduler re-bakes the stalest cube tiles inside a ~1 ms GPU budget. That load is small and steady, so unlike the
  // old whole-cube re-bake it must NOT hold rsSettle: that froze the render-scale controller whenever a bake ran.
  bhUpdate(ORB.camM, dt);
  for (const ev of BH.spin.events.splice(0)) HUD.poke(ev.type, ev);
  updateRenderScale(ft);
  render(now);
  SCENE.fps += (1000/Math.max(ft, 1) - SCENE.fps)*0.05;
  HUD.frame(now, renderScale);
  schedule();
}

// ------------------------------------------------------------------------------------------ boot
let bootBaking = false;
function bootStep(){
  if (SCENE.state === 'failed') return;
  try {
    if (!bootBaking) {
      if (!programsReady()) { HUD.bootStatus(0); requestAnimationFrame(bootStep); return; }
      finishPrograms();
      resize(); rsReset();
      orbitStep(0);
      bhStartBake(ORB.camM);
      bootBaking = true;
    }
    const done = bhBakeStep(SMALL ? 16 : 48);
    SCENE.bake = BH.bake.next/BH.bake.total;
    HUD.bootStatus(SCENE.bake);
    if (!done) { requestAnimationFrame(bootStep); return; }
    resize();                                   // the window may have changed while the bake ran
    SCENE.state = 'run'; last = performance.now();
    render(last);
    HUD.online();
    schedule();
  } catch (e) { sceneFail(e.message); }
}
function boot(){
  if (!GLX.ok || QS.has('nogl')) { sceneFail(GLX.why || 'disabled (?nogl)'); return; }
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); sceneFail('the graphics context was lost'); });
  try { orbitCheck(); bhPrograms(); planetPrograms(); postPrograms(); shipPrograms(); }
  catch (e) { sceneFail(e.message); return; }
  requestAnimationFrame(bootStep);
}

// ------------------------------------------------------------------------------------------ input
// STATION: drag = look around (clamped by orbit.js so the hole stays on screen; springs back when idle), wheel / pinch =
// orbit-altitude burn, +/- keys too, Z = telescope, [ ] = Gargantua's spin.
// HELM (flight.js): drag = a virtual stick (the nose turns toward the drag, faster the further from where you pressed),
// wheel / pinch = chase distance. Any flight key takes the helm; F toggles it; H or Esc fly home.
// WEAPONS (combat.js): G arms them (from anywhere: it takes the helm) and stands them down; Space or the right mouse
// button fires (the first shot arms them too), R launches a torpedo at what you have locked. Space fires only when it is
// not activating something focused -- a crew, a mission, a button -- so the menu keeps working from the keyboard.
// Escape or a click cuts a cutaway short.
const ptr = new Map();
let pinch0 = 0, stick = null, stickHold = false, rmb = false, fireTest = null;
const keys = new Set();
const FLIGHT_KEYS = new Set(['w', 's', 'a', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const hudStick = s => { if (HUD.stick) HUD.stick(s); };
function altitudeBy(k){ const s = ORB.ship; s.hTarget = clamp(s.hTarget*Math.exp(k), ORB.ALT_MIN, ORB.ALT_MAX); HUD.poke('burn'); }
function chaseBy(k){ HELM.chaseDist = clamp(HELM.chaseDist*Math.exp(k), 55, 900); HELM.idle = 0; }
// held keys + the stick -> HELM.input (SCENE.input overrides it for tests); the trigger -> COMBAT.input
function helmInput(){
  const tp = window.HELM_TOUCH || {};
  COMBAT.input.fire = COMBAT.hot ? (fireTest != null ? fireTest : keys.has(' ') || rmb || tp.fire ? 1 : 0) : 0;
  if (stickHold) return;
  if (HELM.mode !== 'helm') {                     // nothing steers outside the helm, and a held stick ends with it
    const I = HELM.input; I.pitch = I.yaw = I.roll = I.thrust = I.boost = I.hold = 0;
    if (stick) { stick = null; hudStick(null); }
    return;
  }
  const k = c => keys.has(c) ? 1 : 0, I = HELM.input, t = window.HELM_TOUCH || {};   // hud.js's touch pad (phones)
  I.pitch = clamp(k('arrowup') - k('arrowdown') + (stick ? stick.py : 0), -1, 1);
  I.yaw = clamp(k('arrowleft') + k('a') - k('arrowright') - k('d') + (stick ? stick.yx : 0), -1, 1);
  I.roll = k('e') - k('q'); I.thrust = clamp(k('w') - k('s') + (t.thrust || 0) - (t.reverse || 0), -1, 1);
  I.boost = k('shift') || t.boost || 0; I.hold = k('x') || t.hold || 0;
  if (keys.size || stick || rmb || t.thrust || t.reverse || t.boost || t.hold || t.fire) HELM.idle = 0;
}
// G, the WEAPONS button, the first shot: arm, taking the helm first if need be
function armWeapons(){
  if (SCENE.state !== 'run' || FLY.off || ejump || jump) return false;
  if (HELM.mode !== 'helm') helmEnter();
  return cmbArm();
}
cv.addEventListener('contextmenu', e => e.preventDefault());                         // the right button is a trigger here
cv.addEventListener('pointerdown', e => {
  if (COMBAT.shot) cmbCineCancel();
  if (e.pointerType === 'mouse' && e.button === 2) {                                   // right button: fire (and arm)
    rmb = true; try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    if (HELM.mode === 'helm' && !COMBAT.hot) armWeapons();
    return;
  }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  ptr.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); stick = null; hudStick(null); }
  else if (HELM.mode === 'helm') { stick = {x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, py: 0, yx: 0}; HELM.idle = 0; hudStick(stick); }
  ORB.look.idle = 0; document.body.classList.add('grabbing');
});
cv.addEventListener('pointermove', e => {
  HELM.idle = 0;                                  // any sign of life postpones the idle autopilot
  // a right press or release while the left is held arrives only here (pointer events send one down / up per pointer)
  if (e.pointerType === 'mouse') {
    const r = !!(e.buttons & 2), l = !!(e.buttons & 1), has = ptr.has(e.pointerId);
    if (r && !rmb && HELM.mode === 'helm' && !COMBAT.hot) armWeapons();
    rmb = r;
    if (l && !has) {                                                                   // left pressed during a right hold: steer too
      ptr.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (HELM.mode === 'helm') { stick = {x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, py: 0, yx: 0}; hudStick(stick); }
    } else if (!l && has && r) { ptr.delete(e.pointerId); stick = null; hudStick(null); }   // left let go, right still firing
  }
  const p = ptr.get(e.pointerId); if (!p) return;
  if (ptr.size === 1 && stick) {
    const R = Math.max(90, Math.min(ORB.W, ORB.H)*0.16);
    stick.x = e.clientX; stick.y = e.clientY;
    stick.yx = clamp(-(e.clientX - stick.x0)/R, -1, 1); stick.py = clamp(-(e.clientY - stick.y0)/R, -1, 1);
    hudStick(stick);
  } else if (ptr.size === 1 && ORB.view && HELM.mode === 'station') {
    const k = ORB.view.fov/ORB.H;                 // radians per CSS pixel: the scene follows the pointer
    ORB.look.yaw += (e.clientX - p.x)*k; ORB.look.pitch += (e.clientY - p.y)*k;
  }
  p.x = e.clientX; p.y = e.clientY; ORB.look.idle = 0;
  if (ptr.size === 2) {
    const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0 && d > 0) { const k = Math.log(pinch0/d)*1.5; HELM.mode === 'station' ? altitudeBy(k) : chaseBy(k); }
    pinch0 = d;
  }
});
function endPtr(e){
  if (e.pointerType === 'mouse') rmb = !!(e.buttons & 2);
  ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; if (!ptr.size) { document.body.classList.remove('grabbing'); stick = null; hudStick(null); }
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); HELM.idle = 0; const k = clamp(e.deltaY, -240, 240)*0.0022; HELM.mode === 'station' ? altitudeBy(k) : chaseBy(k); }, {passive: false});
// capture phase: this runs before hud.js's keydown, which closes the crew menu on Escape -- so Escape can tell whether
// it was closing a menu (then it only does that) or asking for the autopilot
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target && e.target.closest && e.target.closest('input, textarea'))) return;
  const key = e.key.toLowerCase();
  HELM.idle = 0;
  if (e.repeat && ['f', 'v', 'o', 't', 'h', 'g', 'r'].includes(key)) return;  // toggles must not flicker on key repeat
  if (key.startsWith('arrow') && e.target && e.target.closest && e.target.closest('#crew')) return;   // arrows scroll the manifest
  // Escape cuts a cutaway short (and only that); a crew menu it closes is hud.js's business
  if (key === 'escape' && COMBAT.shot && !document.querySelector('#crew details[open]')) { cmbCineCancel(); return; }
  if (SCENE.state === 'run') {
    if (key === ' ' && HELM.mode === 'helm' && !(e.target && e.target.closest && e.target.closest('button, a, summary'))) {
      e.preventDefault(); keys.add(' ');
      if (!COMBAT.hot) armWeapons();
      return;
    }
    if (key === 'g') { if (COMBAT.hot) cmbSafe('manual'); else armWeapons(); return; }
    if (key === 'r' && COMBAT.hot) { COMBAT.input.torp = 1; return; }
    if (FLIGHT_KEYS.has(key) || key === 'shift' || key === 'x') {
      keys.add(key);
      if (FLIGHT_KEYS.has(key) && HELM.mode !== 'helm') helmEnter();       // from STATION, or taking back an AUTO flight
      if (HELM.mode === 'helm' && key.startsWith('arrow')) e.preventDefault();      // arrows would scroll the manifest
      return;
    }
    if (key === 'f') { SCENE.helm(); return; }
    if (HELM.mode === 'helm') {
      if (key === 'h') { helmAuto('manual'); return; }
      if (key === 'escape' && !document.querySelector('#crew details[open]')) { helmAuto('manual'); return; }
      if (key === 'v') { helmToggleView(); return; }
      if (key === 'o') { helmToggleAssist(); return; }
      if (key === 't') { helmToggleTrack(); return; }
    }
  }
  if (HELM.mode === 'station' && (e.key === '+' || e.key === '=' || e.key === 'PageDown')) altitudeBy(-0.25);
  else if (HELM.mode === 'station' && (e.key === '-' || e.key === '_' || e.key === 'PageUp')) altitudeBy(0.25);
  else if (key === 'z') { if (SCENE.state === 'run') SCENE.telescope(); }                  // no scene, no telescope
  else if (e.key === '[' || e.key === ']') { if (SCENE.state === 'run') bhSpinNudge(e.key === ']' ? 0.1 : -0.1); }   // the old page's spin keys
}, true);
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => { if (SCENE.state === 'run') { resize(); rsReset(); } else orbitResize(innerWidth, innerHeight); });
// a key released while the page was hidden never sends its keyup: forget everything held
function clearInput(){
  keys.clear(); ptr.clear(); stick = null; pinch0 = 0; rmb = false; COMBAT.input.fire = 0; document.body.classList.remove('grabbing'); hudStick(null);
  const t = window.HELM_TOUCH; if (t) for (const k in t) t[k] = 0;                  // the touch pad too
  document.querySelectorAll('#touchPad .tp.on').forEach(b => b.classList.remove('on'));
}
addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
addEventListener('pagehide', clearInput);
// back/forward cache: the page can come back mid-jump (or mid-fight); put the ship back in orbit, the fight gone
addEventListener('pageshow', e => {
  if (!e.persisted) return;
  jump = null; ejump = null; ORB.warp = 0; LOOK.flash = 0; LOOK.expo = 1;
  if (cmbActive()) { cmbReset(); COMBAT.events.length = 0; }
  HUD.restored();
  if (SCENE.state === 'run') { last = performance.now(); schedule(); }
});

// ------------------------------------------------------------------------------------------ API for the HUD
SCENE.telescope = () => { ORB.zoomTarget = ORB.zoomTarget > 1 ? 1 : 2.6; HUD.poke(ORB.zoomTarget > 1 ? 'zoomIn' : 'zoomOut'); return ORB.zoomTarget > 1; };
SCENE.altitudeBy = altitudeBy;
// The jump to a game: returns false when there is no running scene (the HUD then just navigates). A launch stands the
// weapons down first: nothing may land on the ship during the 3 s it takes to leave.
SCENE.jump = (ms, done) => {
  if (SCENE.state !== 'run' || jump || ejump) return false;
  if (COMBAT.hot) cmbSafe('launch'); cmbCineCancel();
  jump = {t0: performance.now(), ms, done, fired: false}; return true;
};
SCENE.unjump = () => { jump = null; ORB.warp = 0; LOOK.flash = 0; };     // a navigation that never happened
// headless automation (tests / benchmarks): step the world, render synchronously, read the pixels back
SCENE.advance = sec => { for (let t = 0; t < sec; t += 0.05) { const d = Math.min(0.05, sec - t);
  if (fireTest != null) COMBAT.input.fire = COMBAT.hot ? fireTest : 0;
  orbitStep(d); flightStep(d); combatFrame(d); lookStep(d, 0); } };
// the helm, for the HUD buttons and headless tests
SCENE.helm = () => { if (HELM.mode !== 'helm') { helmEnter(); return true; } helmAuto('manual'); return false; };   // AUTO can be taken back
SCENE.input = o => { Object.assign(HELM.input, o); HELM.idle = 0; stickHold = !!o && Object.keys(o).length > 0; };
// the weapons, for the HUD's WEAPONS button and headless tests: 'arm' | 'safe' | 'toggle'; SCENE.fire(1/0/null) holds
// the trigger for tests (null hands it back to the keys)
SCENE.combat = cmd => cmd === 'safe' || (cmd === 'toggle' && COMBAT.hot) ? cmbSafe('manual') : cmd === 'arm' || cmd === 'toggle' ? armWeapons() : COMBAT;
SCENE.fire = on => { fireTest = on == null ? null : on ? 1 : 0; };
SCENE.renderNow = () => { render(performance.now()); return cv.toDataURL('image/png'); };
SCENE.bench = n => { const px = new Uint8Array(4); render(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now(); for (let i = 0; i < n; i++) render(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return +((performance.now() - t0)/n).toFixed(2); };
SCENE.setScale = s => { renderScale = s; resize(); rsWarm = 1e9; };      // pin the scale (benchmarks)
// jump straight to spin a, fully baked (tests / screenshots); the director then holds it
SCENE.setSpin = a => { bhStartBake(ORB.camM, a); while (!bhBakeStep(64)) {} BH.spin.hold = 1e9; return bhSpin(); };
SCENE.gpu = () => { const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; };

boot();
