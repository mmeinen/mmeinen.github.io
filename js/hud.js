'use strict';
// hud.js — the flight deck: crew manifest (the game menu), telemetry, target symbology, heading tape, orbit plot,
// ship log, the boot sequence, the launch jump and optional cockpit audio.
//
// Needs no WebGL. The menu is plain HTML in index.html and works even if this file never runs; this only adds
// behaviour. Numbers come from orbit.js (pure maths). main.js calls HUD.frame() once per rendered frame; without a
// scene (HUD.fallback) the HUD runs its own light loop so the instruments still move.

const HUD = (() => {
  const $ = id => document.getElementById(id);
  const body = document.body;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };
  const returning = safe(() => sessionStorage.getItem('meinen.boarded') === '1', false);
  safe(() => sessionStorage.setItem('meinen.boarded', '1'));
  if (returning) body.classList.add('returning');
  const T0 = performance.now();
  let online = false, failed = false;

  // ---------------------------------------------------------------------------------------------- formatting
  const pad = n => String(Math.floor(n)).padStart(2, '0');
  const clock = s => { s = Math.max(0, s); return 'T+' + pad(s/3600) + ':' + pad(s/60 % 60) + ':' + pad(s % 60); };
  const num = (x, d = 0) => x.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
  const dur = s => { const h = Math.floor(s/3600), m = Math.floor(s/60 % 60); return h ? h + ' h ' + pad(m) + ' m' : m + ' min'; };
  const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const setA = (e, attrs) => { for (const k in attrs) e.setAttribute(k, attrs[k]); };
  const f1 = x => x.toFixed(1);

  // ---------------------------------------------------------------------------------------------- audio
  // Synthesized WebAudio, OFF by default (the HUD's AUDIO button; remembered). Browsers only allow sound after a
  // user gesture, so a remembered "on" waits for the first click or key.
  const AUDIO = (() => {
    let ac = null, hum = null, fx = null, on = safe(() => localStorage.getItem('meinen.audio') === '1', false);
    function init(){
      if (ac) return true;
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return false; }
      hum = ac.createGain(); hum.gain.value = 0; hum.connect(ac.destination);
      fx = ac.createGain(); fx.gain.value = 0.9; fx.connect(ac.destination);
      // cockpit hum: detuned low saws through a breathing low-pass, plus soft "air handling" noise
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130; lp.Q.value = 4;
      const lg = ac.createGain(); lg.gain.value = 0.32; lp.connect(lg); lg.connect(hum);
      [[43.65, 'sawtooth', 0.5], [43.9, 'sawtooth', 0.5], [87.3, 'sine', 0.3]].forEach(([f, ty, g]) => {
        const o = ac.createOscillator(), og = ac.createGain(); o.type = ty; o.frequency.value = f; og.gain.value = g; o.connect(og); og.connect(lp); o.start();
      });
      const nb = ac.createBuffer(1, ac.sampleRate*2, ac.sampleRate), d = nb.getChannelData(0);
      let b = 0; for (let i = 0; i < d.length; i++) { b = 0.985*b + 0.015*(Math.random()*2 - 1); d[i] = b*4; }
      const ns = ac.createBufferSource(); ns.buffer = nb; ns.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
      const ng = ac.createGain(); ng.gain.value = 0.16; ns.connect(bp); bp.connect(ng); ng.connect(hum); ns.start();
      const lfo = ac.createOscillator(), lfg = ac.createGain(); lfo.frequency.value = 0.07; lfg.gain.value = 45; lfo.connect(lfg); lfg.connect(lp.frequency); lfo.start();
      return true;
    }
    function apply(){
      const b = $('bAudio'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!ac) return;
      if (on) ac.resume();
      hum.gain.setTargetAtTime(on ? 0.5 : 0, ac.currentTime, on ? 0.6 : 0.15);
    }
    function set(v){ on = v; safe(() => localStorage.setItem('meinen.audio', v ? '1' : '0')); if (v) init(); apply(); }
    function tone(freq, dur, gain, type = 'sine', slide = 0, delay = 0){
      if (!on || !ac || ac.state !== 'running') return;
      const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(fx); o.start(t); o.stop(t + dur + 0.05);
    }
    let lastBlip = 0;
    // Not every event counts as user activation (a touch pointerdown or Escape does not), so keep trying on each
    // gesture until the context actually runs.
    const GEST = ['pointerup', 'click', 'keydown'];
    const firstGesture = () => {
      if (!on) return;
      init(); apply();
      if (ac && ac.state === 'running') GEST.forEach(t => removeEventListener(t, firstGesture, true));
    };
    GEST.forEach(t => addEventListener(t, firstGesture, true));
    return {
      get on(){ return on; }, set, apply,
      blip(k = 1){ const n = performance.now(); if (n - lastBlip < 45) return; lastBlip = n; tone(1320*k, 0.05, 0.035); },
      select(){ tone(660, 0.09, 0.05); tone(990, 0.12, 0.05, 'sine', 0, 0.07); },
      ping(){ tone(1760, 0.7, 0.05); tone(2637, 0.9, 0.025, 'sine', 0, 0.02); },
      jump(){
        if (!on || !ac) return;
        const t = ac.currentTime, n = ac.createBufferSource(), len = ac.sampleRate*1.6, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random()*2 - 1;
        n.buffer = buf; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
        bp.frequency.setValueAtTime(160, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 1.1);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        n.connect(bp); bp.connect(g); g.connect(fx); n.start(t); n.stop(t + 1.6);
        tone(90, 1.2, 0.3, 'sine', 32, 0.85);
        hum.gain.setTargetAtTime(0, t + 0.9, 0.2);
      },
    };
  })();

  // ---------------------------------------------------------------------------------------------- ship log
  const comms = $('comms');
  function log(text, warn){
    if (!comms) return;
    const m = document.createElement('div');
    m.className = 'msg new' + (warn ? ' warn' : '');
    const ts = document.createElement('span'); ts.className = 'ts'; ts.textContent = clock(typeof ORB !== 'undefined' && ORB.hud.met || 0);
    const tx = document.createElement('span'); tx.className = 'tx'; tx.textContent = text;
    m.append(ts, tx); comms.appendChild(m);
    const all = comms.querySelectorAll('.msg');
    all.forEach((x, i) => { if (x !== m) { x.classList.remove('new'); x.classList.toggle('old', i < all.length - 2); } });
    if (all.length > 4) all[0].remove();
  }

  // ---------------------------------------------------------------------------------------------- crew manifest
  const crews = [...document.querySelectorAll('#crew details.crew')];
  crews.forEach(d => {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      crews.forEach(o => { if (o !== d && o.open) o.open = false; });    // one at a time where name= is unsupported
      AUDIO.select();
      log('CREW · ' + d.querySelector('.who').textContent + ' · ' + d.querySelector('.role').textContent + ' · '
        + d.querySelectorAll('.mission').length + ' MISSION' + (d.querySelectorAll('.mission').length > 1 ? 'S' : ''));
    });
    d.querySelector('summary').addEventListener('pointerenter', () => AUDIO.blip(1));
  });
  let launching = false, jumpTimers = [];
  function launch(a){
    if (launching) return;
    launching = true;
    const href = a.href, name = a.querySelector('.mt').textContent;
    let gone = false;
    // If the navigation is cancelled (Stop, Esc while the game loads) no pageshow ever comes back: undo the jump
    // ourselves unless the page actually went away.
    const go = () => {
      if (gone) return; gone = true; location.href = href;
      jumpTimers.push(setTimeout(() => { if (!pageLeft) { restored(); if (window.SCENE && SCENE.unjump) SCENE.unjump(); } }, 6000));
    };
    if (RM) { go(); return; }
    setText($('jumpName'), name);
    body.classList.add('jumping');
    AUDIO.jump();
    log('COURSE LAID IN · ' + name.toUpperCase(), true);
    jumpTimers.push(setTimeout(() => {
      const ok = window.SCENE && SCENE.jump && SCENE.jump(820, go);
      if (!ok) { body.classList.add('flash'); jumpTimers.push(setTimeout(go, 480)); }
    }, 380));
    jumpTimers.push(setTimeout(go, 3000));                 // whatever happens, go
  }
  document.querySelectorAll('#crew a.mission').forEach(a => {
    a.addEventListener('pointerenter', () => AUDIO.blip(1.5));
    a.addEventListener('click', e => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;   // new tab / window: the browser's job
      e.preventDefault(); launch(a);
    });
  });
  function restored(){                                       // back from a game via the back/forward cache
    jumpTimers.forEach(clearTimeout); jumpTimers = [];
    launching = false; body.classList.remove('jumping', 'flash');
    if (AUDIO.on) AUDIO.apply();
  }
  let pageLeft = false;
  addEventListener('pagehide', () => { pageLeft = true; });
  addEventListener('pageshow', e => { pageLeft = false; if (e.persisted) restored(); });
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { crews.forEach(d => { d.open = false; }); if (!online && !failed) skipBoot(); return; }
    if (/^[1-5]$/.test(e.key) && crews[+e.key - 1] && !launching) {
      const d = crews[+e.key - 1]; d.open = !d.open;
      if (d.open) d.querySelector('summary').focus({preventScroll: true});
    }
  });
  // on the dock layout (same query as css/hud.css) the missions open as a sheet over the view: tapping anywhere
  // outside the manifest closes it -- listened on the document, because without WebGL there is no canvas to tap
  const DOCK = matchMedia('(max-width: 720px), (max-height: 520px) and (max-width: 1000px)');
  document.addEventListener('pointerdown', e => {
    if (DOCK.matches && !(e.target && e.target.closest && e.target.closest('#crew'))) crews.forEach(d => { d.open = false; });
  });
  $('bAudio').addEventListener('click', () => { AUDIO.set(!AUDIO.on); log(AUDIO.on ? 'COCKPIT AUDIO ON' : 'COCKPIT AUDIO OFF'); });
  $('bScope').addEventListener('click', () => { if (window.SCENE && SCENE.telescope) $('bScope').setAttribute('aria-pressed', SCENE.telescope() ? 'true' : 'false'); });
  AUDIO.apply();

  // ---------------------------------------------------------------------------------------------- boot
  const MIN_BOOT = returning ? 300 : 1500;
  function skipBoot(){ body.classList.add('skip'); }
  $('boot').addEventListener('click', skipBoot);
  setTimeout(() => { if (!online) skipBoot(); }, 9000);      // a slow GPU never holds the menu hostage
  function bootStatus(f){ const p = Math.round(f*100) + '%'; setText($('bootBake'), p); $('bootBar').style.width = p; }
  function goOnline(){
    if (online) return;
    online = true; body.classList.add('online'); body.classList.remove('booting');
    const h = ORB.hud;
    log('NAV LOCK · GARGANTUA · ' + num(h.rangeHole/SI.AU, 1) + ' AU');
    log('ORBIT · MILLER · ' + num(h.alt/1e3) + ' km · DAWN–DUSK SYNC');
    setTimeout(() => log('WELCOME ABOARD · SELECT CREW, CHOOSE A MISSION'), 1400);
  }
  function onlineReq(){ bootStatus(1); setTimeout(goOnline, Math.max(0, MIN_BOOT - (performance.now() - T0))); }
  function fallback(why){
    failed = true; body.classList.add('nogl'); body.classList.remove('booting');
    log('OPTICS OFFLINE · ' + String(why).toUpperCase().slice(0, 48), true);
    log('CREW MANIFEST ONLINE · SELECT A MISSION');
    if (typeof orbitStep !== 'function') return;
    // keep the instruments alive without a scene
    orbitResize(innerWidth, innerHeight);
    let last = performance.now();
    const tick = now => {
      const dt = Math.min(0.1, (now - last)/1000); last = now;
      try { orbitStep(dt); instruments(now, null); } catch (e) { return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------------------------- heading tape
  const PXD = 480/90;                                         // tape: 90 degrees across 480 units
  const tape = $('tape'), tapeG = el('g', {}, tape), tapeM = el('g', {}, tape);
  for (let d = -360; d <= 360; d += 5) {
    const x = d*PXD, big = d % 15 === 0;
    el('line', {x1: x, x2: x, y1: big ? 21 : 25, y2: 30, class: big ? 'tk big' : 'tk'}, tapeG);
    if (big) {
      const w = ((d % 360) + 360) % 360, t = el('text', {x, y: 15, 'text-anchor': 'middle', class: 'tl'}, tapeG);
      t.textContent = w === 0 ? 'PRO' : w === 180 ? 'RET' : String(w).padStart(3, '0');
    }
  }
  el('line', {x1: -240, x2: 240, y1: 30.5, y2: 30.5, class: 'tk'}, tape);
  el('path', {d: 'M-5 37L0 31L5 37Z', class: 'caret'}, tape);
  const tapeHole = el('path', {d: 'M0 -5L5 0L0 5L-5 0Z', class: 'mk-hole'}, tapeM);
  const tapeMoon = el('path', {d: 'M0 -4L4 0L0 4L-4 0Z', class: 'mk-moon'}, tapeM);

  // ---------------------------------------------------------------------------------------------- orbit plot
  const schem = $('schem');
  const defs = el('defs', {}, schem);
  const grad = el('radialGradient', {id: 'plg', cx: '50%', cy: '50%', r: '75%', fx: '70%', fy: '40%'}, defs);
  el('stop', {offset: '0%', 'stop-color': 'rgba(255,214,160,.95)'}, grad);
  el('stop', {offset: '38%', 'stop-color': 'rgba(120,150,190,.6)'}, grad);
  el('stop', {offset: '75%', 'stop-color': 'rgba(14,26,48,.95)'}, grad);
  const sMoonOrb = el('path', {class: 'orb moon'}, schem);
  const sArrow = el('path', {class: 'arrow'}, schem);
  const sArrowT = el('text', {class: 'lbl amber'}, schem); sArrowT.textContent = 'GARGANTUA';
  const sOrbBack = el('path', {class: 'orb ship back'}, schem);
  const sPlanet = el('circle', {r: 22, cx: 0, cy: 0, fill: 'url(#plg)', class: 'planet'}, schem);
  const sOrbFront = el('path', {class: 'orb ship'}, schem);
  const sShip = el('circle', {r: 3, class: 'ship'}, schem);
  const sMoon = el('circle', {r: 3.2, class: 'moon'}, schem);
  const sScan = el('line', {x1: -100, x2: 100, class: 'scan'}, schem);

  // ---------------------------------------------------------------------------------------------- reticles
  const R = $('reticle');
  const gHole = el('g', {}, R);
  const hEdge = el('path', {class: 'amb edge'}, gHole);
  const hRing = el('circle', {class: 'amb', cx: 0, cy: 0}, gHole);
  const hSpin = el('circle', {class: 'amb spin', cx: 0, cy: 0, 'stroke-dasharray': '1.5 9', opacity: 0.75}, gHole);
  const hTicks = el('path', {class: 'amb'}, gHole);
  const hLead = el('path', {class: 'amb', opacity: 0.75}, gHole);
  const hT1 = el('text', {class: 'amb-f t-big'}, gHole); hT1.textContent = 'GARGANTUA';
  const hT2 = el('text', {class: 'amb-f t-sm'}, gHole); hT2.textContent = 'TGT 01 · SMBH · 1.0×10⁸ M☉';
  const hT3 = el('text', {class: 'amb-f t-sm'}, gHole);
  const gMoon = el('g', {}, R);
  const mBox = el('path', {class: 'blu'}, gMoon);
  const mT1 = el('text', {class: 'blu-f'}, gMoon); mT1.textContent = 'MILLER I';
  const mT2 = el('text', {class: 'blu-f t-sm'}, gMoon);
  const gLimb = el('g', {}, R);
  const lMark = el('path', {class: 'blu', d: 'M-16 -6V0H16V-6M0 0V7'}, gLimb);
  const lT = el('text', {class: 'blu-f t-sm', y: 20, 'text-anchor': 'middle'}, gLimb);
  const gBore = el('g', {}, R);
  el('path', {class: 'blu', d: 'M-22 0H-8M8 0H22M0 -8V-4M0 4V8', opacity: 0.8}, gBore);
  el('circle', {class: 'blu', r: 3, opacity: 0.8}, gBore);
  const gHzL = el('path', {class: 'blu', opacity: 0.55}, R), gHzR = el('path', {class: 'blu', opacity: 0.55}, R);
  const gCon = el('g', {}, R);                                // friendly formations (js/scene/ships.js)
  const cBox = el('path', {class: 'blu'}, gCon);
  const cT1 = el('text', {class: 'blu-f t-sm'}, gCon), cT2 = el('text', {class: 'blu-f t-sm'}, gCon);
  const gPro = el('g', {}, R);
  const pArrow = el('path', {class: 'blu'}, gPro);
  const pT = el('text', {class: 'blu-f t-sm'}, gPro); pT.textContent = 'PROGRADE';

  // The Kerr shadow's edge as seen from here (kerr.js: the critical curve through the same ZAMO camera the shader
  // uses, so it hugs the drawn shadow): world directions, recomputed when the spin moves or the camera drifts.
  let shadowCache = null;
  function shadowOutline(){
    if (typeof KERR === 'undefined' || !ORB.camM) return null;
    const a = typeof bhSpin === 'function' ? bhSpin() : 0, now = ORB.tReal;
    if (!shadowCache || Math.abs(shadowCache.a - a) > 5e-4 || now - shadowCache.t > 2) {
      const c = KERR.camera(ORB.camM, a), dirs = KERR.criticalCurve(c, 72);
      let m = [0, 0, 0]; for (const d of dirs) m = V.add(m, d); m = V.norm(m);
      let rad = 0; for (const d of dirs) rad = Math.max(rad, Math.acos(clamp(V.dot(d, m), -1, 1)));
      let md = 1; for (const d of dirs) for (const e of dirs) md = Math.min(md, V.dot(d, e));
      shadowCache = {a, t: now, dirs, centre: m, rad, width: Math.acos(clamp(md, -1, 1))};
    }
    return shadowCache;
  }

  function reticles(){
    const v = ORB.view, h = ORB.hud, W = ORB.W, H = ORB.H;
    const pxPerRad = H/2/Math.tan(v.fov/2);
    // Gargantua: lock ring round the shadow, centred on its (Kerr, D-shaped when fast) outline, which is traced too
    const so = shadowOutline();
    const ph = orbitProject(so ? so.centre : h.dirHole), rs = Math.tan(so ? so.rad : ORB.shadowRad)*pxPerRad;
    const r1 = rs*1.28, r2 = rs*1.46;
    const onScreen = ph.front && ph.x > -r2 && ph.x < W + r2 && ph.y > -r2 && ph.y < H + r2;
    gHole.style.display = onScreen ? '' : 'none';
    if (onScreen) {
      gHole.setAttribute('transform', 'translate(' + f1(ph.x) + ',' + f1(ph.y) + ')');
      setA(hRing, {r: f1(r1)}); setA(hSpin, {r: f1(r2)});
      let d = '';
      if (so) so.dirs.forEach((dir, i) => { const q = orbitProject(dir); d += (i ? 'L' : 'M') + f1(q.x - ph.x) + ' ' + f1(q.y - ph.y); });
      hEdge.setAttribute('d', d ? d + 'Z' : '');
      const a = r1, b = r1 + 11;
      hTicks.setAttribute('d', 'M' + a + ' 0H' + b + 'M-' + a + ' 0H-' + b + 'M0 ' + a + 'V' + b + 'M0 -' + a + 'V-' + b);
      if (W < 700) {                                     // phones: a short title over the ring
        hLead.setAttribute('d', ''); hT3.style.display = 'none';
        setA(hT1, {x: 0, y: f1(-r2 - 26), 'text-anchor': 'middle'}); setA(hT2, {x: 0, y: f1(-r2 - 11), 'text-anchor': 'middle'});
      } else {
        // data block level with the ring's upper half, clear of the heading tape; flips left near the right edge
        const left = ph.x + r2 + 250 > W - 340, s = left ? -1 : 1, ca = Math.cos(0.3), sa = Math.sin(0.3);
        const lx = s*(r2 + 34), ly = -r2*0.34;
        hLead.setAttribute('d', 'M' + f1(s*r2*ca) + ' ' + f1(-r2*sa) + 'L' + f1(lx) + ' ' + f1(ly) + 'H' + f1(lx + s*176));
        const anchor = left ? 'end' : 'start', tx = lx + s*4;
        hT3.style.display = '';
        setA(hT1, {x: f1(tx), y: f1(ly - 7), 'text-anchor': anchor});
        setA(hT2, {x: f1(tx), y: f1(ly + 15), 'text-anchor': anchor});
        setA(hT3, {x: f1(tx), y: f1(ly + 29), 'text-anchor': anchor});
      }
    }
    // MILLER I
    const pm = orbitProject(h.dirMoon), rm = Math.max(7, Math.tan(h.moonAng)*pxPerRad + 7);
    const mOn = pm.front && pm.x > 20 && pm.x < W - 20 && pm.y > 20 && pm.y < H - 20;
    gMoon.style.display = mOn ? '' : 'none';
    if (mOn) {
      gMoon.setAttribute('transform', 'translate(' + f1(pm.x) + ',' + f1(pm.y) + ')');
      mBox.setAttribute('d', 'M0 -' + f1(rm) + 'L' + f1(rm) + ' 0L0 ' + f1(rm) + 'L-' + f1(rm) + ' 0Z');
      setA(mT1, {x: f1(rm + 8), y: -3}); setA(mT2, {x: f1(rm + 8), y: 11});
      const transit = Math.abs(h.moonPhi) < 0.09;
      mT2.textContent = transit ? 'TRANSIT · ' + num(h.moonRange/1e3) + ' km' : num(h.moonRange/1e3) + ' km';
      mT2.classList.toggle('transit', transit);
    }
    // the limb straight below the hole, and the local horizon at the screen edges
    const up = h.up, hd = V.norm(V.sub(h.dirHole, V.mul(up, V.dot(h.dirHole, up))));
    const limb = orbitProject(V.norm(V.sub(V.mul(hd, Math.cos(h.dip)), V.mul(up, Math.sin(h.dip)))));
    const lOn = limb.front && limb.y < H - 30 && limb.y > 40;
    gLimb.style.display = lOn ? '' : 'none';
    if (lOn) { gLimb.setAttribute('transform', 'translate(' + f1(limb.x) + ',' + f1(limb.y - 10) + ')'); }
    const hz0 = orbitProject(hd), hz1 = orbitProject(V.norm(V.rot(hd, up, 0.12)));
    if (hz0.front && hz1.front) {
      let dx = hz1.x - hz0.x, dy = hz1.y - hz0.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const cx = W/2, t0 = ((cx - hz0.x)*dx + (H/2 - hz0.y)*dy), px = hz0.x + dx*t0, py = hz0.y + dy*t0;   // horizon point nearest the centre
      const seg = (a, b) => 'M' + f1(px + dx*a) + ' ' + f1(py + dy*a) + 'L' + f1(px + dx*b) + ' ' + f1(py + dy*b) + 'M' + f1(px + dx*b) + ' ' + f1(py + dy*b) + 'l' + f1(-dy*6) + ' ' + f1(dx*6);
      gHzL.setAttribute('d', seg(-W*0.27, -W*0.22)); gHzR.setAttribute('d', seg(W*0.27, W*0.22));
    }
    // prograde: always well off to the side -- an edge arrow at its height (orbitProject keeps the sign of x and
    // y for directions behind the camera, so the side is right either way)
    gPro.style.display = W < 700 ? 'none' : '';
    const pp = orbitProject(h.pro), side = pp.x > W/2 ? 1 : -1;
    const py2 = clamp(pp.y, H*0.3, H*0.7), px2 = side > 0 ? W - 104 : 104;
    gPro.setAttribute('transform', 'translate(' + px2 + ',' + f1(py2) + ')');
    pArrow.setAttribute('d', side > 0 ? 'M0 -7L9 0L0 7M-10 -7L-1 0L-10 7' : 'M0 -7L-9 0L0 7M10 -7L1 0L10 7');
    setA(pT, {x: side > 0 ? -18 : 18, y: 4, 'text-anchor': side > 0 ? 'end' : 'start'});
    gBore.setAttribute('transform', 'translate(' + f1(W/2) + ',' + f1(H/2) + ')');
    // contact bracket on the lead ship of a passing formation
    const c = typeof FLY !== 'undefined' && FLY.contact, pc = c ? orbitProject(c.dir) : null;
    const cOn = !!(pc && pc.front && pc.x > 30 && pc.x < W - 30 && pc.y > 30 && pc.y < H - 30);
    gCon.style.display = cOn ? '' : 'none';
    if (cOn) {
      const s = clamp(0.3/(c.range/1e3)*pxPerRad, 12, 90), k = s*0.4;
      gCon.setAttribute('transform', 'translate(' + f1(pc.x) + ',' + f1(pc.y) + ')');
      cBox.setAttribute('d', 'M-' + s + ' -' + (s - k) + 'V-' + s + 'H-' + (s - k) + 'M' + (s - k) + ' -' + s + 'H' + s + 'V-' + (s - k) +
        'M' + s + ' ' + (s - k) + 'V' + s + 'H' + (s - k) + 'M-' + (s - k) + ' ' + s + 'H-' + s + 'V' + (s - k));
      setA(cT1, {x: f1(s + 8), y: f1(-s + 8)}); setA(cT2, {x: f1(s + 8), y: f1(-s + 21)});
      setText(cT1, 'CONTACT · FRIENDLY'); setText(cT2, c.name + (c.n > 1 ? ' +' + (c.n - 1) : '') + ' · ' + num(c.range/1e3, 1) + ' km');
    }
  }

  // ---------------------------------------------------------------------------------------------- instruments (10 Hz)
  const E = {alt: $('tAlt'), vel: $('tVel'), per: $('tPer'), ground: $('tGround'), side: $('tSide'), range: $('tRange'), shadow: $('tShadow'),
    spin: $('tSpin'), isco: $('tIsco'), peak: $('tPeak'), dil: $('tDil'), met: $('cMet'), earth: $('cEarth'), delta: $('cDelta'), res: $('sRes'), fps: $('sFps')};
  // Gargantua's spin as the picture shows it, and what follows from it (kerr.js); a = 0.6 if the scene never ran
  const spinNow = () => typeof bhSpin === 'function' ? bhSpin() : 0.6;
  const discPeakK = a => typeof BH !== 'undefined' && typeof KERR !== 'undefined' ? BH.gain.Tpeak*Math.pow(Math.pow(BH.rHaze/KERR.rIn(a), BH.gain.fluxExp), 0.25) : 7500;
  let lastText = 0, sideState = '', transitArmed = true, transitNear = true, nextFlavor = 40;
  const FLAVOR = [
    () => 'GEODESIC CACHE · ' + num(6*BH.CUBE*BH.CUBE) + ' RAYS · VALID',
    () => 'PHOTON ORBITS · r = ' + num(KERR.photonOrbit(spinNow(), 1), 2) + ' / ' + num(KERR.photonOrbit(spinNow(), -1), 2) + ' M · PRO / RETRO',
    () => 'EARTH CLOCK +' + num(ORB.hud.earth - ORB.hud.met, 0) + ' s AHEAD OF SHIP',
    () => 'LAST PACKET FROM EARTH · ' + num(ORB.hud.rangeHole/SI.c/3600, 1) + ' LIGHT-HOURS OUT FROM THE HOLE',
    () => 'MILLER · OCEAN WORLD · 1.05 R⊕ · 1.05 g',
    () => 'DISC · ' + num(discPeakK(spinNow()), 0) + ' K PEAK · INNER EDGE ' + num(KERR.rIn(spinNow()), 2) + ' M',
    () => 'FRAME DRAGGING · a = ' + num(spinNow(), 3) + ' · HORIZON ' + num(KERR.horizon(spinNow()), 3) + ' M',
    () => 'DISC EFFICIENCY ' + num(KERR.efficiency(spinNow())*100, 1) + '% · MASS INTO LIGHT',
    () => 'HAWKING TEMPERATURE · 6×10⁻¹⁶ K',
    () => 'HULL 291 K · LIFE SUPPORT NOMINAL',
    () => 'MILLER ORBITS GARGANTUA AT ' + num(ORB.planet.vLocal, 3) + ' c',
  ];
  let flavorI = Math.floor(Math.random()*FLAVOR.length);
  function instruments(now, scale){
    const h = ORB.hud, pl = ORB.planet;
    setText(E.alt, num(h.alt/1e3) + ' km' + (h.burn ? (h.climb ? ' ▲' : ' ▼') : ''));
    E.alt.classList.toggle('warn', !!h.burn);
    setText(E.vel, num(h.vel/1e3, 2) + ' km/s');
    setText(E.per, dur(h.period));
    const lat = h.lat/DEG, lon = h.lon/DEG;
    setText(E.ground, num(Math.abs(lat), 1) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' + num(Math.abs(lon), 1) + '°' + (lon >= 0 ? 'E' : 'W'));
    const side = h.el > 1.5*DEG ? 'DAYSIDE' : h.el < -1.5*DEG ? 'NIGHT SIDE' : 'TERMINATOR';
    setText(E.side, side);
    setText(E.range, num(h.rangeHole/SI.AU, 1) + ' AU');
    const so = shadowOutline(), a = spinNow(), S = typeof BH !== 'undefined' && BH.spin;
    setText(E.shadow, '⌀ ' + num((so ? so.width : 2*ORB.shadowRad)/DEG, 2) + '°');
    setText(E.spin, 'a ' + num(a, 3) + (S && S.move ? (S.move.a1 > a ? ' ▲' : ' ▼') : ''));
    E.spin.classList.toggle('warn', !!(S && S.move));
    setText(E.isco, typeof KERR !== 'undefined' ? num(KERR.isco(a), 2) + ' M' : '—');
    setText(E.peak, num(discPeakK(a), 0) + ' K');
    setText(E.dil, '×' + num(typeof KERR !== 'undefined' ? KERR.ut(pl.aM, a) : pl.dil, 4));
    setText(E.met, clock(h.met));
    setText(E.earth, clock(h.earth));
    setText(E.delta, '+' + num(h.earth - h.met, 1) + ' s');
    if (scale != null) { setText(E.res, Math.round(scale*100) + '%'); setText(E.fps, String(Math.round(window.SCENE ? SCENE.fps : 0))); }
    setText(hT3, num(h.rangeHole/SI.AU, 1) + ' AU · ' + num(h.rangeHole/SI.c/3600, 1) + ' LIGHT-HR · LOCK');
    setText(lT, 'MILLER · ' + num(h.alt/1e3) + ' km');
    // tape
    const hdg = orbitBearing(ORB.view.b.f)/DEG, wrap = d => ((d + 540) % 360) - 180;
    tapeG.setAttribute('transform', 'translate(' + f1(-hdg*PXD) + ',0)');
    const bh = wrap(orbitBearing(h.dirHole)/DEG - hdg), bm = wrap(orbitBearing(h.dirMoon)/DEG - hdg);
    tapeHole.setAttribute('transform', 'translate(' + f1(clamp(bh, -44, 44)*PXD) + ',34)');
    tapeMoon.setAttribute('transform', 'translate(' + f1(clamp(bm, -44, 44)*PXD) + ',34)');
    tapeMoon.style.opacity = Math.abs(bm) < 44 ? 1 : 0.35;
    plot(now);
    // events for the log
    if (online || failed) {
      if (side !== sideState) {
        if (sideState) log(side === 'NIGHT SIDE' ? 'NIGHT SIDE · CITY LIGHTS BELOW' : side === 'DAYSIDE' ? 'DAYSIDE · GARGANTUA HIGH' : 'CROSSING THE TERMINATOR');
        sideState = side;
      }
      if (h.transitIn < 30 && h.transitIn > 25 && transitArmed) { transitArmed = false; log('MILLER I · TRANSIT IN ' + Math.round(h.transitIn) + ' s'); }
      if (h.transitIn > 40) transitArmed = true;
      if (h.transitIn < 2.5 && transitNear) { transitNear = false; log('MILLER I CROSSING GARGANTUA', true); AUDIO.ping(); }
      if (h.transitIn > 10) transitNear = true;
      if (ORB.tReal > nextFlavor) { nextFlavor = ORB.tReal + 28 + Math.random()*24; log(FLAVOR[flavorI++ % FLAVOR.length]()); }
    }
  }
  // oblique view of MILLER from off to one side: the hole to the right, the ship's orbit round it, the moon's
  function plot(now){
    const h = ORB.hud, pl = ORB.planet, P = ORB.bodies[1].pos, Mp = ORB.bodies[2].pos;
    const t = h.dirHole, up0 = V.norm(V.sub([0, 1, 0], V.mul(t, t[1]))), side = V.cross(t, up0);
    // orthographic: turn 0.95 rad about the local up, then tilt 0.33 rad to look down a little. (side, up0, t) is a
    // LEFT-handed frame (side x up0 = -t), so q[2] > 0 is the FAR side of MILLER.
    const cy = Math.cos(0.95), sy = Math.sin(0.95), cx = Math.cos(0.33), sx = Math.sin(0.33), k = 22/pl.R;
    const pj = v => { const a = V.dot(v, side), b = V.dot(v, up0), c = V.dot(v, t);
      const x = a*cy + c*sy, z = -a*sy + c*cy; return [x*k, -(b*cx - z*sx)*k, b*sx + z*cx]; };
    const hidden = q => q[2] > 0 && Math.hypot(q[0], q[1]) < 22;
    // the ship's orbit: the circle through the current radius in the orbit plane, split where MILLER hides it.
    // Altitude is drawn exaggerated (a 700 km orbit would hug the disc); the shape and phase are true.
    const rs = pl.R*(1 + 1.25*Math.pow(h.alt/pl.R, 0.6)), e = h.up, pr = h.pro;
    let front = '', back = '', prev = null;
    for (let i = 0; i <= 64; i++) {
      const a = i/64*2*Math.PI, q = pj(V.add(V.mul(e, rs*Math.cos(a)), V.mul(pr, rs*Math.sin(a))));
      if (prev) { const seg = 'M' + f1(prev[0]) + ' ' + f1(prev[1]) + 'L' + f1(q[0]) + ' ' + f1(q[1]); if (hidden(q) || hidden(prev)) back += seg; else front += seg; }
      prev = q;
    }
    sOrbFront.setAttribute('d', front); sOrbBack.setAttribute('d', back);
    const qs = pj(V.mul(e, rs));
    setA(sShip, {cx: f1(qs[0]), cy: f1(qs[1])}); sShip.style.opacity = hidden(qs) ? 0.3 : 1;
    // the moon's orbit, drawn compressed (it is ~9 planet radii out)
    const dm = V.sub(Mp, P), dl = V.len(dm), mr = 58/k;
    const n = V.norm(V.cross(dm, side)), u1 = V.norm(dm), u2 = V.cross(n, u1);
    let md = '';
    for (let i = 0; i <= 48; i++) { const a = i/48*2*Math.PI, q = pj(V.add(V.mul(u1, mr*Math.cos(a)), V.mul(u2, mr*Math.sin(a)))); md += (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]); }
    sMoonOrb.setAttribute('d', md);
    const qm = pj(V.mul(u1, mr)); setA(sMoon, {cx: f1(qm[0]), cy: f1(qm[1])});
    // lit side toward the hole
    const qh = pj(V.mul(t, pl.R));
    setA(grad, {fx: f1(50 + qh[0]/22*42) + '%', fy: f1(50 + qh[1]/22*42) + '%'});
    const a0 = pj(V.mul(t, pl.R*1.25)), a1 = pj(V.mul(t, pl.R*3.4));
    sArrow.setAttribute('d', 'M' + f1(a0[0]) + ' ' + f1(a0[1]) + 'L' + f1(a1[0]) + ' ' + f1(a1[1]) + 'm-6 -3l6 3l-6 3');
    setA(sArrowT, {x: f1(a1[0] - 4), y: f1(a1[1] - 8), 'text-anchor': 'end'});
    const sc = ((now || performance.now())/40) % 144 - 72; setA(sScan, {y1: f1(sc), y2: f1(sc)});
  }

  // ---------------------------------------------------------------------------------------------- per frame
  function frame(now, scale){
    if (!ORB.view) return;
    reticles();
    if (now - lastText > 100) { lastText = now; instruments(now, scale); }
  }
  let pokeT = 0;
  function poke(kind, arg){
    if (kind === 'burn') { clearTimeout(pokeT); pokeT = setTimeout(() => log('ORBIT ADJUST · TARGET ' + num(ORB.ship.hTarget/1e3) + ' km'), 500); }
    else if (kind === 'zoomIn') { log('TELESCOPE DEPLOYED · ×2.6'); $('bScope').setAttribute('aria-pressed', 'true'); AUDIO.select(); }
    else if (kind === 'zoomOut') { log('TELESCOPE STOWED'); $('bScope').setAttribute('aria-pressed', 'false'); AUDIO.blip(0.8); }
    else if (kind === 'contact') { log('CONTACT · FRIENDLY ' + arg.kind.toUpperCase() + ' GROUP OVERTAKING TO ' + (arg.side < 0 ? 'PORT' : 'STARBOARD')); AUDIO.ping(); }
    else if (kind === 'spinMove') { log('GARGANTUA ' + (arg.to > arg.from ? 'SPINNING UP' : 'SPINNING DOWN') + ' · a ' + num(arg.from, 2) + ' → ' + num(arg.to, 2), true); AUDIO.select(); }
    else if (kind === 'spinHold') log('SPIN STEADY · a = ' + num(arg.a, 3) + ' · ISCO ' + num(KERR.isco(arg.a), 2) + ' M');
  }

  return {bootStatus, online: onlineReq, fallback, frame, poke, restored, log};
})();
