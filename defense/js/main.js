'use strict';
// main.js — PLANET DEFENSE: boot, the frame loop, the adaptive render scale and input. Loaded last.
//
// Boot is staged under the boot card (CSS-animated, so a busy main thread cannot stall it): queue every program (built in
// the background where KHR_parallel_shader_compile exists) -> bake Gargantua's geodesics a few tiles a frame while the
// ships build one class a frame -> run. Frame: the world (orbit.js, real time) -> the sector's place in it (view.js) -> the
// war (war.js, game time: real x speed, sub-stepped, frozen when paused) -> its events to the HUD and the camera -> the
// camera -> the hole's bake scheduler -> render. Any failure hands over to UI.fallback(): the page explains itself.

const QS = new URLSearchParams(location.search);
const SMALL = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 720;
if (SMALL) { BH.CUBE = 512; BH.budgetMs = 0.8; }

const DPR_CAP = 1.25;
let renderScale = SMALL ? 0.6 : 1.0;
let cw = 2, ch = 2;
// the film look (post.js): the print grade always on here, heavier in battle; the gate weave in cutaways only
const LOOK = {bloom: 1, expo: 1, stretch: 0.05, warp: 0, flash: 0, film: 0.6, weave: [0, 0]};
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const SCENE = {state: 'boot', why: '', t0: performance.now(), bake: 0, fps: 0};
window.SCENE = SCENE;

function sceneFail(why){
  if (SCENE.state === 'failed') return;
  SCENE.state = 'failed'; SCENE.why = why;
  console.warn('planet defense: renderer disabled:', why);
  UI.fallback(why);
}
function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  cw = Math.max(2, Math.round(innerWidth*dpr)); ch = Math.max(2, Math.round(innerHeight*dpr));
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  const w = Math.max(2, Math.round(cw*renderScale)), h = Math.max(2, Math.round(ch*renderScale));
  if (!T || T.w !== w || T.h !== h) makeTargets(w, h);
  orbitResize(innerWidth, innerHeight);
}

/* ---- Adaptive render scale: the flight deck's controller (js/scene/main.js), by the same rules --------------------
   Count missed refreshes, not milliseconds (under vsync a frame costs one refresh or two); latch the lowest scale that
   missed and park just under it; ignore the frames right after a change (the target realloc makes them slow); re-measure
   only when the view's state changes by >25%; never below the 0.35 floor (sub-floor scaling was rejected).            */
const RS_MIN = 0.35, RS_MAX = 1.0;
let vsyncMs = 16.7, rsWarm = 60, rsSettle = 0, rsMiss = 0, rsGood = 0, rsCeiling = RS_MAX, rsProbing = 0, rsRelaxAge = 0, rsRelaxEvery = 1800, rsViewKey = 0;
// what the frame cost tracks here: how much of the screen is MILLER (looking down) and whether a cutaway is running.
// STATE only, never content: a key driven by what happens to be on screen would re-measure every few seconds and pump.
function viewKey(){ return (1 + 2.5*Math.max(0, -Math.sin(CAM.pitch)))*(camCine() ? 1.6 : 1); }
function rsReset(){ rsCeiling = RS_MAX; rsMiss = 0; rsGood = 0; rsWarm = 30; rsSettle = 0; rsProbing = 0; rsRelaxAge = 0; rsRelaxEvery = 1800; rsViewKey = viewKey(); }
function rsSet(v){
  v = Math.max(RS_MIN, Math.min(RS_MAX, Math.round(v*200)/200));
  if (Math.abs(v - renderScale) < 0.004) return;
  renderScale = v; resize();
  rsSettle = 30; rsMiss = 0; rsGood = 0;
}
function updateRenderScale(ft){
  if (ft > 3 && ft < vsyncMs) vsyncMs += (ft - vsyncMs)*0.25;
  else if (ft < vsyncMs*1.25) vsyncMs += (ft - vsyncMs)*0.02;
  vsyncMs = Math.max(5, Math.min(34, vsyncMs));
  if (rsWarm > 0) { rsWarm--; return; }
  if (rsSettle > 0) { rsSettle--; return; }
  const key = viewKey();
  if (Math.abs(key - rsViewKey) > rsViewKey*0.25) { rsViewKey = key; rsCeiling = RS_MAX; rsRelaxEvery = 1800; rsRelaxAge = 0; rsProbing = 0; rsMiss = 0; rsGood = 0; }
  if (ft > vsyncMs*1.75 || ft > 30) { rsMiss++; rsGood = 0; } else { rsGood++; rsMiss = Math.max(0, rsMiss - 0.05); }
  rsRelaxAge++; if (rsProbing > 0) rsProbing--;
  if (rsMiss >= 3 && renderScale > RS_MIN) {
    rsCeiling = Math.min(rsCeiling, renderScale);
    if (rsProbing > 0) { rsSet(renderScale*0.97); rsRelaxEvery = Math.min(rsRelaxEvery*3, 54000); }
    else { rsSet(renderScale*0.90); rsRelaxEvery = 1800; }
    rsProbing = 0; rsRelaxAge = 0;
    return;
  }
  if (rsGood >= 90) {
    const cap = Math.min(RS_MAX, rsCeiling*0.97);
    if (renderScale < cap - 0.01) { rsSet(Math.min(cap, renderScale*(renderScale < cap*0.8 ? 1.12 : 1.04))); rsProbing = 300; }
    else rsGood = 0;
  }
  if (rsRelaxAge >= rsRelaxEvery && rsCeiling < RS_MAX) { rsRelaxAge = 0; rsCeiling = Math.min(RS_MAX, rsCeiling*1.03); }
}

// ------------------------------------------------------------------------------------------ frames
function render(now){
  const v = ORB.view, tSec = (now - SCENE.t0)/1000;
  bhShade(T.compFb, T.w, T.h, v.b, Math.tan(v.fov/2), tSec, ORB.camM);
  let img = systemPass(T, v, ORB.bodies, tSec, 1, 0.4);
  if (flyVisible()) {
    const tq = SCENE.tq; if (tq) gl.beginQuery(tq.ext.TIME_ELAPSED_EXT, tq.q);
    img = flyRender(img, tSec);
    if (tq) gl.endQuery(tq.ext.TIME_ELAPSED_EXT);
  }
  postProcess(img, cw, ch, tSec, LOOK);
}
// the film look: the grade deepens in battle; a big flash stops the lens down and it opens again; the gate weaves in cuts
function lookStep(dt){
  const hot = WAR.phase === 'wave' || !!WAR.over;
  LOOK.film += ((hot || camCine() ? 1 : 0.6) - LOOK.film)*(1 - Math.exp(-dt/1.5));
  const cf = WAR.rm ? 0 : WAR.flash;
  if (cf > 0.8 && LOOK.expo > 0.85) LOOK.expo = 0.62;
  LOOK.expo += (1 - LOOK.expo)*(1 - Math.exp(-dt/1.3));
  LOOK.flash = cf*0.3;
  if (camCine() && !WAR.rm) {
    const t = Math.floor(performance.now()/41.7);
    LOOK.weave = [Math.sin(t*1.7)*0.2 + Math.sin(t*0.61)*0.1, Math.sin(t*1.3 + 1)*0.16 + Math.sin(t*0.47 + 2)*0.1];
  } else LOOK.weave = [0, 0];
}
// the war in game time: real x speed, in steps of at most 1/30 s; paused, it holds (the world outside keeps turning)
function warAdvance(dt){
  WAR.rm = REDUCED.matches;
  if (WAR.paused) return;
  let g = dt*WAR.speed;
  while (g > 1e-6) { const h = Math.min(g, 1/30); warStep(h); g -= h; }
}
function worldStep(dt){
  orbitStep(dt); sectUpdate();
  warAdvance(dt);
  for (const ev of WAR.events.splice(0)) { UI.event(ev); camEvent(ev); }
  camStep(dt); viewSync();
}
let last = 0, rafId = 0;
function schedule(){ if (!rafId) rafId = requestAnimationFrame(t => { rafId = 0; frame(t); }); }
function frame(now){
  if (SCENE.state !== 'run') return;
  try { frameBody(now); } catch (e) { console.error(e); sceneFail(e.message); }
}
function frameBody(now){
  const ft = Math.min(now - last, 250); last = now;
  const dt = Math.min(ft, 100)/1000;
  worldStep(dt);
  lookStep(dt);
  bhUpdate(ORB.camM, dt);
  for (const ev of BH.spin.events.splice(0)) void ev;
  updateRenderScale(ft);
  render(now);
  SCENE.fps += (1000/Math.max(ft, 1) - SCENE.fps)*0.05;
  UI.frame(now, dt);
  schedule();
}

// ------------------------------------------------------------------------------------------ boot
let bootBaking = false;
function shipBuildStep(){ for (const c of DEF_ORDER) if (!SHIPGL[c]) { shipClassGL(c); return false; } return true; }
function bootStep(){
  if (SCENE.state === 'failed') return;
  try {
    if (!bootBaking) {
      if (!programsReady()) { UI.bootStatus(0); requestAnimationFrame(bootStep); return; }
      finishPrograms();
      resize(); rsReset();
      ORB.ship.h = ORB.ship.hTarget = 7.0e5;
      orbitStep(0); sectUpdate(); camStep(0);
      bhStartBake(ORB.camM);
      bootBaking = true;
    }
    const done = bhBakeStep(SMALL ? 16 : 48, ORB.camM) & shipBuildStep();
    SCENE.bake = BH.bake.next/BH.bake.total;
    UI.bootStatus(SCENE.bake);
    if (!done) { requestAnimationFrame(bootStep); return; }
    resize();
    SCENE.state = 'run'; last = performance.now();
    worldStep(0); render(last);
    UI.online();
    schedule();
  } catch (e) { console.error(e); sceneFail(e.message); }
}
function boot(){
  warNew('veteran', null, 7); WAR.phase = 'setup';                 // BASTION on screen behind the title
  if (!GLX.ok || QS.has('nogl')) { sceneFail(GLX.why || 'disabled (?nogl)'); return; }
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); sceneFail('the graphics context was lost'); });
  try { orbitCheck(); bhPrograms(); planetPrograms(); postPrograms(); FLY.dbg = +QS.get('shipdbg') || 0; shipPrograms(FLY.dbg); }
  catch (e) { sceneFail(e.message); return; }
  requestAnimationFrame(bootStep);
}

// ------------------------------------------------------------------------------------------ input
// Drag orbits the camera (right or shift drag pans), the wheel or a pinch zooms, a click goes to the HUD (select, build,
// target), a double click follows. Keys: ui.js's hotkeys first, then the camera's (arrows, +/-, Home).
const ptr = new Map();
let pinch0 = 0, pmid = null, drag = null, lastClick = {t: 0, x: 0, y: 0};
const keysHeld = new Set();
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  ptr.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pmid = [(a.x + b.x)/2, (a.y + b.y)/2]; drag = null; }
  else drag = {x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0, pan: e.button === 2 || e.shiftKey, button: e.button};
  if (camCine()) camCut();
  CAM.idle = 0; document.body.classList.add('grabbing');
});
cv.addEventListener('pointermove', e => {
  UI.hover(e.clientX, e.clientY);
  const p = ptr.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (ptr.size === 1 && drag) {
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 5) { if (drag.pan) camPan(dx, dy); else camOrbit(dx*0.0055, dy*0.0045); }
  } else if (ptr.size === 2) {
    p.x = e.clientX; p.y = e.clientY;
    const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = [(a.x + b.x)/2, (a.y + b.y)/2];
    if (pinch0 > 0 && d > 0) camZoom(Math.log(pinch0/d)*1.4);
    if (pmid) camPan(mid[0] - pmid[0], mid[1] - pmid[1]);
    pinch0 = d; pmid = mid; return;
  }
  p.x = e.clientX; p.y = e.clientY;
});
function endPtr(e){
  const d = drag;
  ptr.delete(e.pointerId); if (ptr.size < 2) { pinch0 = 0; pmid = null; }
  if (!ptr.size) document.body.classList.remove('grabbing');
  if (d && ptr.size === 0 && e.type === 'pointerup' && d.moved <= 5 && performance.now() - d.t0 < 600) {
    const now = performance.now(), dbl = now - lastClick.t < 380 && Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 12;
    lastClick = {t: now, x: e.clientX, y: e.clientY};
    UI.click(e.clientX, e.clientY, {button: d.button, dbl, shift: e.shiftKey});
  }
  if (!ptr.size) drag = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => UI.hover(-1, -1));
cv.addEventListener('wheel', e => { e.preventDefault(); if (camCine()) camCut(); camZoom(clamp(e.deltaY, -240, 240)*0.0016); }, {passive: false});
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (UI.key(e)) { e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) { keysHeld.add(k); e.preventDefault(); if (camCine()) camCut(); }
  else if (k === '+' || k === '=' || k === 'pagedown') camZoom(-0.3);
  else if (k === '-' || k === '_' || k === 'pageup') camZoom(0.3);
  else if (k === 'home') { camCut(); camReset(); }
});
addEventListener('keyup', e => keysHeld.delete(e.key.toLowerCase()));
// held arrows / WASD orbit the camera (read each frame from UI.frame via this)
function keyOrbit(dt){
  if (!keysHeld.size) return;
  const h = (a, b) => (keysHeld.has(a) || keysHeld.has(b) ? 1 : 0);
  camOrbit((h('arrowright', 'd') - h('arrowleft', 'a'))*1.4*dt, (h('arrowup', 'w') - h('arrowdown', 's'))*1.0*dt);
}
addEventListener('resize', () => { if (SCENE.state === 'run') { resize(); rsReset(); } else orbitResize(innerWidth, innerHeight); });
function clearInput(){ ptr.clear(); keysHeld.clear(); drag = null; pinch0 = 0; document.body.classList.remove('grabbing'); }
addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); UI.hidden(); } });
addEventListener('pageshow', e => { if (e.persisted && SCENE.state === 'run') { last = performance.now(); schedule(); } });

// ------------------------------------------------------------------------------------------ automation (tests, benchmarks)
// step the world and the war, render synchronously, read pixels back; pin the render scale
SCENE.advance = sec => { for (let t = 0; t < sec; t += 1/30) worldStep(Math.min(1/30, sec - t)); };
SCENE.renderNow = () => { render(performance.now()); return cv.toDataURL('image/png'); };
SCENE.bench = n => { const px = new Uint8Array(4); render(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now(); for (let i = 0; i < n; i++) render(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return +((performance.now() - t0)/n).toFixed(2); };
SCENE.shipTimes = async n => {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return null;
  const q = gl.createQuery(), ms = [];
  try {
    for (let i = 0; i < n; i++) {
      SCENE.tq = {ext, q}; render(performance.now()); SCENE.tq = null;
      for (let k = 0; k < 400 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await new Promise(r => setTimeout(r, 2));
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT)/1e6);
    }
  } finally { SCENE.tq = null; gl.deleteQuery(q); }
  ms.sort((a, b) => a - b); return ms.length ? +ms[ms.length >> 1].toFixed(3) : null;
};
SCENE.setScale = s => { renderScale = s; resize(); rsWarm = 1e9; };
SCENE.setSpin = a => { bhStartBake(ORB.camM, a); while (!bhBakeStep(64, ORB.camM)) {} BH.spin.hold = 1e9; return bhSpin(); };
SCENE.gpu = () => { const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; };

boot();
