'use strict';
// main.js — UI, input, captions, audio drone, render dispatch, overlay, frame loop and boot. Loaded last.

// --------------------------------------------------------------------------------------- UI / input
let tool = 'orbit', lastInput = -1e9;
const ptrs = new Map();
let drag = null;         // {mode, x, y, ...}
let shiftDown = false, mouse = {x:0, y:0, in:false};

function setTool(t){
  tool = t;
  $('tOrbit').classList.toggle('on', t === 'orbit');
  $('tLaunch').classList.toggle('on', t === 'launch');
  $('tBH').classList.toggle('on', t === 'bh');
  cv.className = t === 'launch' ? 'tool-launch' : t === 'bh' ? 'tool-bh' : '';
}
$('tOrbit').onclick = () => setTool('orbit');
$('tLaunch').onclick = () => setTool('launch');
$('tBH').onclick = () => setTool('bh');

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (e.button === 1) e.preventDefault();
  if (ptrs.size >= 2) return;                       // ignore a third finger
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  lastInput = performance.now();
  audioKick();
  if (ptrs.size === 2) { drag = {mode:'pinch', d:pinchDist(), mid:pinchMid()}; bh.active = false; return; }
  if (deep.focus > 0) { drag = {mode:'orbit', x:e.clientX, y:e.clientY, sx:e.clientX, sy:e.clientY}; return; }
  if (e.button === 2 || (e.button === 0 && e.altKey)) { drag = {mode:'pan', x:e.clientX, y:e.clientY}; settings.follow = false; $('cFollow').checked = false; return; }
  if (e.button === 1) { drag = {mode:'orbit', x:e.clientX, y:e.clientY}; return; }
  if (tool === 'launch') {
    const p = pickPlane(e.clientX, e.clientY);
    drag = {mode:'launch', start:p, sx:e.clientX, sy:e.clientY, ex:e.clientX, ey:e.clientY, end:p};
  } else if (tool === 'bh' || e.shiftKey) {
    drag = {mode:'bh'}; bh.active = true; bh.target = pickPlane(e.clientX, e.clientY);
    if (bh.strength < 0.02) bh.pos = bh.target.slice();
  } else drag = {mode:'orbit', x:e.clientX, y:e.clientY};
});
cv.addEventListener('pointermove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  const pp = ptrs.get(e.pointerId);
  if (pp) { pp.x = e.clientX; pp.y = e.clientY; }
  if (shiftDown && !drag && deep.focus === 0) { bh.active = true; bh.target = pickPlane(e.clientX, e.clientY); }
  if (!drag) return;
  lastInput = performance.now();
  if (drag.mode === 'orbit') {
    // over a planet the drag moves you across the ground, so scale it by altitude
    const k = deep.focus === 2 ? clamp(rangeM()/focusRadius()*1.5, 2e-5, 1) : 1;
    cam.yaw -= (e.clientX - drag.x)*0.005*k; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + (e.clientY - drag.y)*0.005*k));
    drag.x = e.clientX; drag.y = e.clientY;
  } else if (drag.mode === 'pan') {
    const s = cam.dist*0.0015;
    const right = V.norm(V.cross(cam.fwd, [0,1,0])), up = V.cross(right, cam.fwd);
    cam.target = V.add(cam.target, V.add(V.mul(right, -(e.clientX-drag.x)*s), V.mul(up, (e.clientY-drag.y)*s)));
    drag.x = e.clientX; drag.y = e.clientY;
  } else if (drag.mode === 'launch') {
    drag.ex = e.clientX; drag.ey = e.clientY; drag.end = pickPlane(e.clientX, e.clientY);
  } else if (drag.mode === 'bh') {
    bh.target = pickPlane(e.clientX, e.clientY);
  } else if (drag.mode === 'pinch' && ptrs.size === 2) {
    const d = pinchDist(), m = pinchMid();
    zoomBy(Math.log(drag.d/d), m.x, m.y);
    const k = deep.focus === 2 ? clamp(rangeM()/focusRadius()*1.5, 2e-5, 1) : 1;
    cam.yaw -= (m.x - drag.mid.x)*0.005*k; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + (m.y - drag.mid.y)*0.005*k));
    drag.d = d; drag.mid = m;
  }
});
function endPtr(e){
  ptrs.delete(e.pointerId);
  if (!drag) return;
  if (drag.mode === 'launch' && e.type === 'pointerup') { const v = launchVel(); if (v) launchGalaxy(drag.start, v); }
  if (drag.mode === 'orbit' && e.type === 'pointerup' && deep.focus > 0 && drag.sx != null &&
      Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) {
    const i = planetNearScreen(e.clientX, e.clientY, 30); if (i > 0) flyTo('planet', i);
  }
  if (drag.mode === 'bh' && !shiftDown) bh.active = false;
  if (drag.mode === 'pinch' && ptrs.size === 1) { const [p] = ptrs.values(); drag = {mode:'orbit', x:p.x, y:p.y}; return; }
  drag = null;
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('lostpointercapture', e => { if (ptrs.has(e.pointerId)) endPtr(e); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { ptrs.clear(); drag = null; bh.active = false; shiftDown = false; } });
cv.addEventListener('pointerleave', () => { mouse.in = false; });
function pinchDist(){ const [a,b] = [...ptrs.values()]; return Math.hypot(a.x-b.x, a.y-b.y) || 1; }
function pinchMid(){ const [a,b] = [...ptrs.values()]; return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
cv.addEventListener('wheel', e => {
  e.preventDefault(); lastInput = performance.now();
  zoomBy(clamp(e.deltaY, -300, 300)*0.0022, e.clientX, e.clientY);
}, {passive:false});

addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT' || (e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.repeat) return;
  if (e.key === 'Shift' && !shiftDown && deep.focus === 0) {
    shiftDown = true; audioKick();
    if (mouse.in) { bh.active = true; bh.target = pickPlane(mouse.x, mouse.y); if (bh.strength < 0.02) bh.pos = bh.target.slice(); }
  }
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  else if (e.key === 'r' || e.key === 'R') reset();
  else if (e.key === 'h' || e.key === 'H') toggleUI();
  else if (e.key === '1') setTool('orbit');
  else if (e.key === '2') setTool('launch');
  else if (e.key === '3') setTool('bh');
  else if (e.key === '=' || e.key === '+') zoomBy(-0.35, innerWidth/2, innerHeight/2);
  else if (e.key === '-' || e.key === '_') zoomBy(0.35, innerWidth/2, innerHeight/2);
});
addEventListener('keyup', e => { if (e.key === 'Shift') { shiftDown = false; if (!drag || drag.mode !== 'bh') bh.active = false; } });
addEventListener('blur', () => { shiftDown = false; bh.active = false; ptrs.clear(); drag = null; });

function togglePause(){ paused = !paused; $('bPause').classList.toggle('on', paused); $('bPause').firstChild.textContent = paused ? 'Resume ' : 'Pause '; }
function toggleUI(){ document.body.classList.toggle('noui'); }
$('bPause').onclick = togglePause;
$('bReset').onclick = () => reset();
$('bHide').onclick = toggleUI;
$('toggleUI').onclick = toggleUI;

SCENARIOS.forEach((s, i) => {
  const b = document.createElement('button'); b.textContent = s.label; b.onclick = () => reset(i);
  $('scen').appendChild(b);
});
function bindRange(id, key, fmt, cb){
  const el = $(id), o = $(id + 'O');
  const f = () => { settings[key] = +el.value; if (o) o.textContent = fmt(+el.value); cb && cb(+el.value); };
  el.addEventListener('input', f); f();
}
bindRange('speed', 'speed', v => v.toFixed(2) + '×');
bindRange('bhMass', 'bhMass', v => (v).toFixed(1) + 'e11', v => bh.mass = v);
const bindChk = (id, key, cb) => { const el = $(id); el.addEventListener('change', () => { settings[key] = el.checked; cb && cb(el.checked); }); settings[key] = el.checked; };
bindChk('cAuto', 'auto');
bindChk('cFollow', 'follow'); bindChk('cLabels', 'labels', rebuildLabels);
bindChk('cSound', 'sound', on => on ? audioStart() : audioStop());
$('count').addEventListener('change', e => { N = +e.target.value; reset(); });

// --------------------------------------------------------------------------------------- labels / captions
function rebuildLabels(){
  const box = $('labels'); box.innerHTML = '';
  cores.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'glabel'; d.id = 'gl' + i;
    if (c.active && settings.labels) d.innerHTML = c.g.name + '<small>' + (c.g.m*1e11).toExponential(1).replace('e+', '×10^') + ' M☉</small>';
    d.innerHTML = d.innerHTML.replace(/\^(\d+)/, (_, n) => n.split('').map(ch => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+ch]).join(''));
    box.appendChild(d);
  });
}
let capTimer = 0;
function caption(t){ const c = $('caption'); c.textContent = t; c.classList.add('show'); clearTimeout(capTimer); capTimer = setTimeout(() => c.classList.remove('show'), 4200); }
let cardTimer = 0;
function showCard(t, s, d){
  $('cardT').textContent = t; $('cardS').textContent = s; $('cardD').textContent = d;
  const c = $('card'); c.classList.add('show'); clearTimeout(cardTimer); cardTimer = setTimeout(() => c.classList.remove('show'), 6500);
}

// --------------------------------------------------------------------------------------- audio
// An evolving drone: detuned saws through a low-pass whose cutoff opens as galaxies close in.
let AC = null, aNodes = null;
function audioKick(){ if (AC && AC.state === 'suspended') AC.resume(); }
function audioStart(){
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    audioKick();
    const out = AC.createGain(); out.gain.value = 0;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 6;
    const dl = AC.createDelay(1.5); dl.delayTime.value = 0.61; const fb = AC.createGain(); fb.gain.value = 0.45;
    lp.connect(out); lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(out); out.connect(AC.destination);
    const osc = [55, 55.3, 82.4, 110.6, 164.8].map((f, i) => {
      const o = AC.createOscillator(); o.type = i < 3 ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      const g = AC.createGain(); g.gain.value = [0.3,0.3,0.18,0.12,0.06][i]; o.connect(g); g.connect(lp); o.start(); return o;
    });
    const lfo = AC.createOscillator(); lfo.frequency.value = 0.07; const lg = AC.createGain(); lg.gain.value = 60;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    out.gain.linearRampToValueAtTime(0.13, AC.currentTime + 2.5);
    aNodes = {out, lp, osc, lfo};
  } catch (e) { console.warn(e); }
}
function audioStop(){
  if (!aNodes) return;
  const n = aNodes; aNodes = null;
  n.out.gain.cancelScheduledValues(AC.currentTime); n.out.gain.setTargetAtTime(0, AC.currentTime, 0.3);
  setTimeout(() => { n.osc.forEach(o => o.stop()); n.lfo.stop(); n.out.disconnect(); }, 1500);
}
function audioUpdate(minSep){
  if (!aNodes) return;
  const x = Math.max(0, Math.min(1, 1.6/(minSep + 0.4)));
  aNodes.lp.frequency.setTargetAtTime(160 + 1500*x*x + (bh.strength*900), AC.currentTime, 0.4);
}

// --------------------------------------------------------------------------------------- render
function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  const w = Math.max(2, Math.round(innerWidth*dpr)), h = Math.max(2, Math.round(innerHeight*dpr));
  if (cv.width !== w || cv.height !== h || !tg) { cv.width = w; cv.height = h; makeTargets(); }
  const d2 = Math.min(window.devicePixelRatio || 1, 2);
  ov.width = Math.round(innerWidth*d2); ov.height = Math.round(innerHeight*d2);
  octx.setTransform(d2, 0, 0, d2, 0, 0);
}
addEventListener('resize', resize);



const TEST = new URLSearchParams(location.search).get('scene');   // dev views: ?scene=bh
function render(now){
  if (TEST === 'bh') { renderBHView(now); return; }
  updateCamera();
  const w = tg.w, h = tg.h;
  if (deep.focus > 0 && deep.sys.bh) {            // Gargantua: the lensed hole is the sky
    bhSky(now);
    tg.fresh = true;
    let img = systemPass(now);
    if (BATTLE.on) img = battleRenderFrame(now, img);
    else if (TEST === 'ships') img = battleRender(now, img, SHIP_TEST);
    bloomFinal(img, now);
    return;
  }
  if (deep.focus === 0) {
    drawParticles(tg.sceneFb, w, h, cam.view, cam.proj, {fade:settings.trails && !tg.fresh});
    tg.fresh = false;
    composite(tg.compFb, w, h, tg.light, tg.dust, cam.view, cam.proj, now, true);
    bloomFinal(tg.comp, now);
    return;
  }
  const eyeLen = V.len(deep.eye);
  if (eyeLen < CUBE_R && !deep.cubeValid) bakeSky(now);
  if (deep.cubeValid && eyeLen < CUBE_R) {
    skyFromCube();
    // nearby stars drawn live at screen resolution, so they stay crisp points at every zoom
    gl.bindFramebuffer(gl.FRAMEBUFFER, tg.compFb); gl.viewport(0, 0, w, h);
    drawLocal(cam.localView, cam.localProj, LOCAL_GAIN);
    gl.disable(gl.BLEND);
  }
  else {
    // No hard switches: from galaxy scale (~1.2 units) down to ~0.05 the sprite size cap and brightness
    // ease from their galaxy values to the inside-the-galaxy ones, and between ~0.2 and ~0.03 units the
    // soft sprites CROSSFADE into point stars (two weighted draws that sum to one).
    const le = Math.log10(Math.max(eyeLen/UNIT_M, 1e-9));
    const kFar = smooth01((le - Math.log10(0.05))/(Math.log10(1.2) - Math.log10(0.05)));
    const pt = 1 - smooth01((le - Math.log10(0.03))/(Math.log10(0.2) - Math.log10(0.03)));
    const base = {holeC:deep.star.SG, capStar:1.8 + (1 - 1.8)*kFar, fluxK:0.55 + (1 - 0.55)*kFar};
    if (pt < 0.999) drawParticles(tg.sceneFb, w, h, cam.view, cam.proj, {...base, weight:1 - pt});
    if (pt > 0.001) drawParticles(tg.sceneFb, w, h, cam.view, cam.proj, {...base, pointStars:0.08, weight:pt, keep:pt < 0.999});
    const lg = LOCAL_GAIN*(1 - smooth01((eyeLen/UNIT_M - 0.04)/0.25));
    drawLocal(cam.localView, cam.localProj, lg);
    composite(tg.compFb, w, h, tg.light, tg.dust, cam.view, cam.proj, now, false);
  }
  tg.fresh = true;
  bloomFinal(systemPass(now), now);
}


// Overlay: slingshot + predicted paths, black-hole reticle, galaxy labels; orbits + names when deep.
function drawOverlay(){
  const W = innerWidth, H = innerHeight;
  octx.clearRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const el = $('gl' + i); if (!el) continue;
    const c = cores[i], q = deep.focus === 0 && c.active && settings.labels ? project(c.x) : null;
    if (!q) { el.style.opacity = 0; continue; }
    el.style.opacity = 1; el.style.left = q.u*W + 'px'; el.style.top = (1 - q.v)*H + 'px';
  }
  if (deep.focus > 0) { drawDeepOverlay(W, H); return; }
  const toPx = p => { const q = project(p); return q ? [q.u*W, (1-q.v)*H] : null; };
  if (drag && drag.mode === 'launch') {
    const v = launchVel(), a = toPx(drag.start);
    if (a) {
      octx.strokeStyle = 'rgba(255,170,90,.9)'; octx.lineWidth = 1.5; octx.setLineDash([4,4]);
      octx.beginPath(); octx.moveTo(a[0], a[1]); octx.lineTo(drag.ex, drag.ey); octx.stroke(); octx.setLineDash([]);
      octx.beginPath(); octx.arc(a[0], a[1], 9, 0, 6.283); octx.stroke();
    }
    if (v) {
      const paths = predict(drag.start, v, +$('launchSize').value);
      paths.forEach((path, pi) => {
        const mine = pi === paths.length - 1;
        octx.lineWidth = mine ? 2 : 1;
        let prev = null;
        path.forEach((p, k) => {
          const q = toPx(p); if (!q) { prev = null; return; }
          if (prev) {
            const f = 1 - k/path.length;
            octx.strokeStyle = mine ? `rgba(120,190,255,${0.95*f})` : `rgba(255,255,255,${0.3*f})`;
            octx.beginPath(); octx.moveTo(prev[0], prev[1]); octx.lineTo(q[0], q[1]); octx.stroke();
          }
          prev = q;
        });
      });
      octx.fillStyle = 'rgba(200,225,255,.95)'; octx.font = '11px Segoe UI, sans-serif';
      if (a) octx.fillText(Math.round(V.len(v)*KMS_PER_V) + ' km/s', a[0] + 14, a[1] - 12);
    }
  }
  if (tool === 'bh' && mouse.in && !bh.active) {
    octx.strokeStyle = 'rgba(255,160,80,.8)'; octx.lineWidth = 1;
    octx.beginPath(); octx.arc(mouse.x, mouse.y, 10, 0, 6.283); octx.stroke();
    octx.beginPath(); octx.moveTo(mouse.x-16, mouse.y); octx.lineTo(mouse.x-6, mouse.y); octx.moveTo(mouse.x+6, mouse.y); octx.lineTo(mouse.x+16, mouse.y);
    octx.moveTo(mouse.x, mouse.y-16); octx.lineTo(mouse.x, mouse.y-6); octx.moveTo(mouse.x, mouse.y+6); octx.lineTo(mouse.x, mouse.y+16); octx.stroke();
  }
  if (cam.dist <= GAL_MIN*1.3 && mouse.in) {
    octx.fillStyle = 'rgba(160,205,255,.85)'; octx.font = '10px Segoe UI, sans-serif';
    octx.fillText('KEEP SCROLLING TO ENTER A STAR SYSTEM', mouse.x + 14, mouse.y + 18);
  }
}
function drawDeepOverlay(W, H){
  if (!settings.labels) return;
  const sys = deep.sys, t = deep.sysT, dStar = V.len(deep.eye);
  const orbA = smooth01((Math.log10(dStar) - Math.log10(0.004*AU_M))/0.8)*(1 - smooth01((Math.log10(dStar) - Math.log10(4000*AU_M))/0.6));
  octx.font = '10px Segoe UI, sans-serif';
  if (orbA > 0.01) {
    for (let i = 1; i < sys.bodies.length; i++) {
      const b = sys.bodies[i];
      if (b.parent !== 0 && !(deep.focus === 2 && (deep.body === i || deep.body === b.parent))) continue;
      const focused = deep.focus === 2 && deep.body === i;
      const pc = bodyPos(b.parent, t);
      octx.strokeStyle = `rgba(${focused ? '255,170,100' : '90,160,255'},${(focused ? 0.55 : 0.28)*orbA})`;
      octx.lineWidth = 1;
      octx.beginPath();
      let pen = false;
      for (let k = 0; k <= 160; k++) {
        const th = k/160*6.283185;
        const p = [pc[0] + b.a*Math.cos(th), pc[1] + b.a*Math.sin(th)*Math.sin(b.inc), pc[2] - b.a*Math.sin(th)*Math.cos(b.inc)];
        const q = projectDeep(p);
        if (!q) { pen = false; continue; }
        if (!pen) { octx.moveTo(q[0], q[1]); pen = true; } else octx.lineTo(q[0], q[1]);
      }
      octx.stroke();
    }
  }
  const th = Math.tan(cam.fov/2), pxPerRad = H/(2*th);
  for (let i = 0; i < sys.bodies.length; i++) {
    const b = sys.bodies[i], p = bodyPos(i, t), q = projectDeep(p);
    if (!q) continue;
    const dist = V.len(V.sub(p, deep.eye)), rpx = b.R/dist*pxPerRad;
    if (rpx > 60) continue;
    let a;
    if (i === 0) a = dStar > 2*AU_M ? 1 : 0;
    else a = orbA*(b.parent === 0 || deep.focus === 2 ? 1 : 0);
    if (a < 0.02) continue;
    const off = Math.max(8, rpx + 6);
    octx.fillStyle = `rgba(170,210,255,${0.9*a})`;
    octx.fillText(b.name, q[0] + off, q[1] - 2);
    octx.fillStyle = `rgba(170,210,255,${0.5*a})`;
    octx.fillText(i === 0 ? specClass(sys.T) + '-TYPE STAR' : TYPE_NAME[b.type], q[0] + off, q[1] + 10);
    if (i === 0 && dStar > 0.05*LY_M) {
      octx.strokeStyle = `rgba(255,170,100,${0.7*a})`;
      octx.beginPath(); octx.arc(q[0], q[1], 7, 0, 6.283); octx.stroke();
    }
  }
}


let last = performance.now(), fpsS = 60, hudT = 0;
function frame(now){
  const fdt = Math.min(0.05, Math.max(0.001, (now - last)/1000)); last = now;
  fpsS += (1/fdt - fpsS)*0.05;

  // black hole: ease strength in/out, spring toward the cursor so it never teleports
  bh.strength += ((bh.active ? 1 : 0) - bh.strength)*Math.min(1, fdt*5);
  if (bh.strength < 0.002 && !bh.active) bh.strength = 0;
  for (let k = 0; k < 3; k++) bh.pos[k] += (bh.target[k] - bh.pos[k])*Math.min(1, fdt*8);

  if (deep.focus > 0) {
    // below galaxy scale the collision is frozen; the planetary system runs on its own clock
    if (!paused) deep.sysT += fdt*settings.speed;
    if (deep.glide) { deep.glide.t += fdt; if (deep.glide.t >= deep.glide.dur) deep.glide = null; }
    if (settings.auto && now - lastInput > 5000) {
      const k = deep.focus === 2 ? clamp(rangeM()/focusRadius(), 2e-5, 1) : 1;
      cam.yaw += 0.02*k*fdt;
    }
  } else if (!paused) {
    // at most 6 substeps of at most MAX_SUB_DT: a slow frame slows sim time rather than enlarging dt
    let adv = settings.speed*BASE_RATE*fdt;
    const n = Math.min(6, Math.max(1, Math.ceil(adv/MAX_SUB_DT)));
    adv = Math.min(adv, n*MAX_SUB_DT);
    for (let s = 0; s < n; s++) simStep(adv/n);
    SN_CLOCK += fdt*0.8;
    simT += adv;
    trackEvents();
  }
  if (deep.focus === 0) {
    if (settings.follow && !flight) { const t = comCores(), f = Math.min(1, fdt*1.2); for (let k = 0; k < 3; k++) cam.target[k] += (t[k] - cam.target[k])*f; }
    if (settings.auto && now - lastInput > 5000) cam.yaw += 0.025*fdt;
  }
  updateFlight(fdt);
  battleStep(fdt);
  filmStep(fdt); filmIdle(now);
  if (FILM.shake > 0.001) {                      // impact shake: a few hundredths of a degree, decaying
    const k = FILM.shake*0.012; FILM.shake *= Math.exp(-fdt*3.5);
    if (cam.free) { const j = [Math.sin(now*0.061)*k, Math.sin(now*0.047 + 1)*k, 0]; cam.free.f = V.norm(V.add(cam.free.f, V.add(V.mul(cam.free.r, j[0]), V.mul(cam.free.u, j[1])))); }
    else if (deep.focus === 0) { cam.yaw += Math.sin(now*0.07)*k*0.4; cam.pitch += Math.sin(now*0.053)*k*0.3; }
  }
  bandCaptions();

  render(now);
  if (!TEST) drawOverlay();

  let minSep = 99, relV = 0;
  const act = cores.filter(c => c.active);
  for (let i = 0; i < act.length; i++) for (let j = i+1; j < act.length; j++) {
    const d = V.len(V.sub(act[i].x, act[j].x));
    if (d < minSep) { minSep = d; const dx = V.sub(act[j].x, act[i].x), dv = V.sub(act[j].v, act[i].v); relV = -V.dot(dx, dv)/(d||1); }
  }
  audioUpdate(minSep);
  if (now - hudT > 120) {
    hudT = now;
    $('tBig').textContent = Math.round(simT*MYR_PER_T).toLocaleString() + ' Myr';
    $('tLbl').textContent = deep.focus ? 'ELAPSED · FROZEN' : 'ELAPSED';
    $('mRange').textContent = fmtRange(rangeM());
    $('ladMark').style.top = ladY(Math.log10(Math.max(1, rangeM())))*100 + '%';
    $('mSep').textContent = act.length > 1 ? (minSep*KPC_PER_L).toFixed(1) + ' kpc' : '—';
    $('mVel').textContent = act.length > 1 ? Math.round(relV*KMS_PER_V) + ' km/s' : '—';
    $('mGal').textContent = act.length;
    $('mStars').textContent = act.reduce((s, c) => s + slotRows[cores.indexOf(c)]*TEX_W, 0).toLocaleString();
    $('mFps').textContent = fpsS.toFixed(0) + ' fps';
  }
  if (!contextLost) requestAnimationFrame(frame);
}

// --------------------------------------------------------------------------------------- boot
(function boot(){
  const q = new URLSearchParams(location.search);
  const small = matchMedia('(pointer:coarse)').matches && Math.min(innerWidth, innerHeight) < 800;
  N = small ? 262144 : 1048576;
  const qn = q.get('n'); if (qn) { const v = {'256k':262144,'512k':524288,'1m':1048576,'2m':2097152}[qn.toLowerCase()]; if (v) N = v; }
  const maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  while (N/TEX_W > maxT) N >>= 1;
  $('count').value = String(N);
  const sq = q.get('s'); const si = SCENARIOS.findIndex(s => s.key === sq);
  resize();
  reset(si >= 0 ? si : 0);
  if (TEST) { paused = true; document.body.classList.add('noui'); }
  else { paused = true; settings.auto = true; lastInput = -1e9; filmInit(); }
  if (TEST === 'planet') bhDevPlanet();
  if (TEST === 'ships') shipDevScene();
  if (TEST === 'battle') battleStart();
  LEVELS.forEach(l => { const d = document.createElement('div'); d.className = 'lt'; d.textContent = l.label;
    d.style.top = ladY(l.log)*100 + '%'; d.onclick = () => flyTo(l.k); $('ladTrack').appendChild(d); });
  $('bDive').onclick = () => flyTo('surface');
  $('bUp').onclick = () => flyTo('galaxy');
  // debug / automation hooks
  window.COLLIDE = {
    reset, SCENARIOS, settings, cores, cam, bh,
    advance(t){ const n = Math.ceil(t/MAX_SUB_DT); for (let i = 0; i < n; i++) simStep(t/n); simT += t; },
    bench(n){ const px = new Uint8Array(4); render(performance.now()); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
      const t0 = performance.now(); for (let i = 0; i < n; i++) render(performance.now()); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); return +((performance.now()-t0)/n).toFixed(2); },
    renderNow(){ render(performance.now()); return cv.toDataURL('image/png'); },
    get simT(){ return simT; },
    hdr(x, y){ gl.bindFramebuffer(gl.FRAMEBUFFER, tg.comp2Fb); const a = new Float32Array(4);
      gl.readPixels(Math.round(x*tg.w), Math.round(y*tg.h), 1, 1, gl.RGBA, gl.FLOAT, a); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return Array.from(a).map(v => +v.toFixed(4)); },
    FILM, startAct, nextAct, filmBegin, BATTLE, battleRun(sec, dt = 1/30){ for (let t = 0; t < sec; t += dt) battleStep(dt); return BATTLE.t; },
    deep, flyTo, zoomBy, terrainJ, findLanding, rangeM, setRange, acquireBody, pickStar, acquireStar,
    finishFlight(){ let n = 0; while (flight && n++ < 2000) { updateFlight(0.25); if (deep.glide) { deep.glide.t += 0.25; if (deep.glide.t >= deep.glide.dur) deep.glide = null; } } },
    heatStats(){
      gl.bindFramebuffer(gl.FRAMEBUFFER, sim.fb[sim.cur]); gl.readBuffer(gl.COLOR_ATTACHMENT1);
      const a = new Float32Array(TEX_W*sim.rows*4); gl.readPixels(0, 0, TEX_W, sim.rows, gl.RGBA, gl.FLOAT, a);
      gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      let mx = 0, sum = 0, n = 0, dead = 0, hot = 0;
      for (let i = 3; i < a.length; i += 4) { const h = a[i]; if (h < -0.5) dead++; else if (h > 0) { n++; sum += h; if (h > mx) mx = h; if (h > 0.5) hot++; } }
      return {max:mx, mean:n ? sum/n : 0, heated:n, hot, dead};
    },
  };
  requestAnimationFrame(frame);
})();

