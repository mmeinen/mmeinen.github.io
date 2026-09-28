'use strict';
// main.js — boot, the frame loop, the adaptive render scale and input. Loaded last.
//
// Boot is staged so the HUD's boot sequence (CSS-animated, so a busy main thread cannot stall it) covers it:
// queue every program (built in the background where KHR_parallel_shader_compile exists) -> bake Gargantua's
// geodesics a few tiles per frame -> run. Any failure hands over to HUD.fallback(): the game menu is plain HTML
// and keeps working without WebGL.

const QS = new URLSearchParams(location.search);
const SMALL = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 720;
if (SMALL) BH.CUBE = 512;                       // 44 MB of bake targets instead of 176 MB on phones

const DPR_CAP = 1.25;
let renderScale = SMALL ? 0.6 : 1.0;
let cw = 2, ch = 2;                            // canvas size in device pixels
const LOOK = {bloom: 1, expo: 1, stretch: 0.05, warp: 0, flash: 0};
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

function viewKey(){ return ORB.ship.hTarget/ORB.zoomTarget; }
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
  if (flyVisible()) img = flyRender(img, tSec);                  // the MSAA ship pass only runs while one is in view
  LOOK.warp = ORB.warp;
  postProcess(img, cw, ch, tSec, LOOK);
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
  if (jump) {                                   // the launch: tunnel out, flash, then navigate
    const k = clamp((now - jump.t0)/jump.ms, 0, 1);
    ORB.warp = k*k*(3 - 2*k); LOOK.flash = smooth01((k - 0.72)/0.28);
    if (k >= 1 && !jump.fired) { jump.fired = true; jump.done(); }
  }
  orbitStep(dt*(1 + 30*ORB.warp*ORB.warp));    // the jump also spins the world up
  const contact = flyStep(dt);
  if (contact) HUD.poke('contact', contact);
  // MILLER's orbit slowly carries the camera away from the bake point (height above the disc changes as the
  // inclined orbit turns): re-bake in place, a few tiles per frame, long before it could show
  if (BH.bake.done && bhBakeDrift(ORB.camM) > 0.02) bhStartBake(ORB.camM);
  if (!BH.bake.done) { bhBakeStep(3); rsSettle = Math.max(rsSettle, 2); }
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
    const done = bhBakeStep(SMALL ? 4 : 12);
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
// drag = look around (clamped by orbit.js so the hole stays on screen; springs back when idle),
// wheel / pinch = orbit-altitude burn, +/- keys too, Z = telescope
const ptr = new Map();
let pinch0 = 0;
function altitudeBy(k){ const s = ORB.ship; s.hTarget = clamp(s.hTarget*Math.exp(k), ORB.ALT_MIN, ORB.ALT_MAX); HUD.poke('burn'); }
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  ptr.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  ORB.look.idle = 0; document.body.classList.add('grabbing');
});
cv.addEventListener('pointermove', e => {
  const p = ptr.get(e.pointerId); if (!p) return;
  if (ptr.size === 1 && ORB.view) {
    const k = ORB.view.fov/ORB.H;                 // radians per CSS pixel: the scene follows the pointer
    ORB.look.yaw += (e.clientX - p.x)*k; ORB.look.pitch += (e.clientY - p.y)*k;
  }
  p.x = e.clientX; p.y = e.clientY; ORB.look.idle = 0;
  if (ptr.size === 2) {
    const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0 && d > 0) altitudeBy(Math.log(pinch0/d)*1.5);
    pinch0 = d;
  }
});
function endPtr(e){ ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; if (!ptr.size) document.body.classList.remove('grabbing'); }
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); altitudeBy(clamp(e.deltaY, -240, 240)*0.0022); }, {passive: false});
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target && e.target.closest && e.target.closest('input, textarea'))) return;
  if (e.key === '+' || e.key === '=' || e.key === 'PageDown') altitudeBy(-0.25);
  else if (e.key === '-' || e.key === '_' || e.key === 'PageUp') altitudeBy(0.25);
  else if (e.key === 'z' || e.key === 'Z') SCENE.telescope();
});
addEventListener('resize', () => { if (SCENE.state === 'run') { resize(); rsReset(); } else orbitResize(innerWidth, innerHeight); });
addEventListener('blur', () => { ptr.clear(); document.body.classList.remove('grabbing'); });
// back/forward cache: the page can come back mid-jump; put the ship back in orbit
addEventListener('pageshow', e => {
  if (!e.persisted) return;
  jump = null; ORB.warp = 0; LOOK.flash = 0;
  HUD.restored();
  if (SCENE.state === 'run') { last = performance.now(); schedule(); }
});

// ------------------------------------------------------------------------------------------ API for the HUD
SCENE.telescope = () => { ORB.zoomTarget = ORB.zoomTarget > 1 ? 1 : 2.6; HUD.poke(ORB.zoomTarget > 1 ? 'zoomIn' : 'zoomOut'); return ORB.zoomTarget > 1; };
SCENE.altitudeBy = altitudeBy;
// The jump to a game: returns false when there is no running scene (the HUD then just navigates).
SCENE.jump = (ms, done) => { if (SCENE.state !== 'run' || jump) return false; jump = {t0: performance.now(), ms, done, fired: false}; return true; };
SCENE.unjump = () => { jump = null; ORB.warp = 0; LOOK.flash = 0; };     // a navigation that never happened
// headless automation (tests / benchmarks): step the world, render synchronously, read the pixels back
SCENE.advance = sec => { for (let t = 0; t < sec; t += 0.05) orbitStep(Math.min(0.05, sec - t)); };
SCENE.renderNow = () => { render(performance.now()); return cv.toDataURL('image/png'); };
SCENE.bench = n => { const px = new Uint8Array(4); render(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now(); for (let i = 0; i < n; i++) render(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return +((performance.now() - t0)/n).toFixed(2); };
SCENE.setScale = s => { renderScale = s; resize(); rsWarm = 1e9; };      // pin the scale (benchmarks)
SCENE.gpu = () => { const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; };

boot();
