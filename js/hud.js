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
    // ---- the fight (combat.js, through poke): hull-conducted guns and hits, and a Zimmer-ish score -- a clock that
    // ticks faster as the threat grows, a Shepard tone under a capital ship, a BRAAM when one arrives, silence at the
    // big flash and an organ after it. Built on first use, one noise buffer for everything, nothing without AUDIO on.
    let cb = null;
    function cbInit(){
      if (cb) return cb;
      if (!init()) return null;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      const bus = ac.createGain(); bus.connect(comp); comp.connect(fx);
      const n = ac.sampleRate*3, ir = ac.createBuffer(2, n, ac.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const x = i/n; lp += ((Math.random()*2 - 1) - lp)*(0.5 - 0.4*x); d[i] = lp*Math.pow(1 - x, 2.4); } }
      const rv = ac.createConvolver(); rv.buffer = ir; const wet = ac.createGain(); wet.gain.value = 0.5; wet.connect(rv); rv.connect(bus);
      const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random()*2 - 1;
      const music = ac.createGain(); music.gain.value = 1; music.connect(bus); music.connect(wet);
      // the bed: a low detuned drone through a lowpass (gain 0 until a cue), and a Shepard tone (six octave-spaced sines)
      const dg = ac.createGain(); dg.gain.value = 0; const dl = ac.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 240; dl.connect(dg); dg.connect(music);
      for (const f of [55, 55.4, 82.4]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(dl); o.start(); }
      const sg = ac.createGain(); sg.gain.value = 0; sg.connect(music);
      const shep = []; for (let i = 0; i < 6; i++) { const o = ac.createOscillator(), g = ac.createGain(); g.gain.value = 0; o.connect(g); g.connect(sg); o.start(); shep.push({o, g}); }
      cb = {bus, wet, music, noise: nb, drone: dg, shepG: sg, shep, ph: 0, tickP: 0, tickT: 0, lastGun: 0, lastHit: 0, heart: false, hbT: 0};
      return cb;
    }
    const live = () => on && cbInit() && ac.state === 'running';
    function nz(t, dur, f, q, gain, type, dest){ const s = ac.createBufferSource(); s.buffer = cb.noise; const b = ac.createBiquadFilter(); b.type = type || 'bandpass'; b.frequency.value = f; b.Q.value = q;
      const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(b); b.connect(g); g.connect(dest || cb.bus); s.start(t, Math.random()*0.5); s.stop(t + dur + 0.02); }
    function thud(t, f0, f1, dur, gain, dest){ const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest || cb.bus); o.start(t); o.stop(t + dur + 0.05); }
    function braam(){
      const t = ac.currentTime, ws = ac.createWaveShaper(), c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = Math.tanh(2.2*(i/511.5 - 1)); ws.curve = c;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(140, t); lp.frequency.exponentialRampToValueAtTime(1300, t + 0.2); lp.frequency.exponentialRampToValueAtTime(260, t + 3);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.06); g.gain.setValueAtTime(0.3, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      for (const f of [36.7, 73.4, 110, 146.8]) for (const d of [-9, 9]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(ws); o.start(t); o.stop(t + 4.6); }
      ws.connect(lp); lp.connect(g); g.connect(cb.music);
    }
    function organ(){                                              // A minor, pipes: each note with its octave and fifteenth
      const t = ac.currentTime + 1.2, g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 2.6); g.gain.setValueAtTime(0.07, t + 6); g.gain.exponentialRampToValueAtTime(0.0001, t + 10);
      g.connect(cb.music);
      for (const f of [110, 164.8, 220, 261.6, 329.6]) for (const [m, a] of [[1, 1], [2, 0.4], [4, 0.15]]) {
        const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = f*m; og.gain.value = a*0.2; o.connect(og); og.connect(g); o.start(t); o.stop(t + 10.2);
      }
    }
    const COMBAT_SND = {
      gun(){ if (!live()) return; const t = ac.currentTime; if (t - cb.lastGun < 0.05) return; cb.lastGun = t; thud(t, 120, 40, 0.09, 0.2); nz(t, 0.03, 2600, 1.2, 0.05); },
      hit(shield){ if (!live()) return; const t = ac.currentTime; if (t - cb.lastHit < 0.07) return; cb.lastHit = t; tone(shield ? 700 : 2100, 0.05, 0.035, 'triangle'); },
      boom(size, dist){ if (!live()) return; const t = ac.currentTime + Math.min(0.6, dist/4000), g = Math.min(0.8, (0.2 + size/160)/(1 + dist/1600));
        thud(t, 72, 24, 1 + size/220, g); nz(t, 0.7 + size/300, 380, 0.7, g*0.55, 'lowpass'); },
      shield(){ if (!live()) return; const t = ac.currentTime; nz(t, 0.22, 3000, 0.8, 0.1, 'highpass'); thud(t, 520, 170, 0.2, 0.05); },
      hull(){ if (!live()) return; const t = ac.currentTime; thud(t, 95, 32, 0.55, 0.42); nz(t, 0.45, 900, 1.4, 0.18); },
      torp(){ if (!live()) return; const t = ac.currentTime; thud(t, 170, 60, 0.14, 0.18); nz(t + 0.3, 1.2, 1400, 1.5, 0.12); },
      lock(){ if (!live()) return; tone(1480, 0.08, 0.04, 'square'); tone(1480, 0.08, 0.04, 'square', 0, 0.11); tone(1975, 0.22, 0.04, 'square', 0, 0.22); },
      alarm(){ if (!live()) return; for (let i = 0; i < 3; i++) tone(880, 0.12, 0.04, 'sawtooth', 660, i*0.18); },
      whoosh(){ if (!live()) return; nz(ac.currentTime, 1.4, 900, 1.2, 0.16); },
      // the score's cues: range | wing | capital | kill | lull | safe | down
      cue(k){
        if (!live()) return;
        const t = ac.currentTime, set = (p, v, tau) => p.setTargetAtTime(v, t, tau);
        if (k === 'range') { cb.tickP = 1.25; set(cb.drone.gain, 0.035, 2); set(cb.shepG.gain, 0, 1); }
        else if (k === 'wing') { cb.tickP = 0.9; set(cb.drone.gain, 0.06, 1); set(cb.shepG.gain, 0.012, 3); }
        else if (k === 'capital') { cb.tickP = 0.62; braam(); set(cb.drone.gain, 0.07, 0.5); set(cb.shepG.gain, 0.03, 4); }
        else if (k === 'kill') {                                   // silence at the flash, a sub you feel, then the organ
          cb.tickP = 0; cb.music.gain.cancelScheduledValues(t); cb.music.gain.setValueAtTime(0.0001, t);
          cb.music.gain.setTargetAtTime(1, t + 1.1, 0.4); set(cb.drone.gain, 0, 0.05); set(cb.shepG.gain, 0, 0.05);
          thud(t, 42, 20, 3.5, 0.55); organ();
        }
        else if (k === 'lull') { cb.tickP = 0; set(cb.shepG.gain, 0, 1.5); set(cb.drone.gain, 0.02, 2); }
        else if (k === 'down') { cb.tickP = 0; cb.heart = true; set(cb.shepG.gain, 0, 0.3); set(cb.drone.gain, 0, 0.5); }
        else { cb.tickP = 0; cb.heart = false; set(cb.drone.gain, 0, 0.6); set(cb.shepG.gain, 0, 0.6); }   // safe
      },
      crit(onOff){ if (cb) cb.heart = !!onOff; },
      // per frame: schedule the clock's ticks a little ahead, glide the Shepard tone up, the heartbeat when the hull is failing
      frame(){
        if (!cb || !on || !ac || ac.state !== 'running') return;
        const t = ac.currentTime;
        if (cb.tickP > 0) { if (cb.tickT < t) cb.tickT = t + 0.05; while (cb.tickT < t + 0.25) { nz(cb.tickT, 0.03, 2900, 5, 0.1, 'bandpass', cb.music); thud(cb.tickT, 1300, 1150, 0.03, 0.035, cb.music); cb.tickT += cb.tickP; } }
        cb.ph = (cb.ph + 1/600) % 1;                                 // an octave every ~10 s at 60 fps; frame-rate dependence is harmless
        for (let i = 0; i < 6; i++) { const x = (i + cb.ph)/6, S = cb.shep[i]; S.o.frequency.setTargetAtTime(55*Math.pow(2, 6*x), t, 0.05); S.g.gain.setTargetAtTime(0.5 - 0.5*Math.cos(2*Math.PI*x), t, 0.05); }
        if (cb.heart && t > cb.hbT) { cb.hbT = t + 0.95; thud(t, 60, 40, 0.14, 0.4); thud(t + 0.22, 55, 38, 0.16, 0.3); }
      },
    };
    return {
      get on(){ return on; }, set, apply, combat: COMBAT_SND,
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

  // ---------------------------------------------------------------------------------------------- keep-outs
  // The target symbology (the #reticle SVG) is drawn UNDER the HUD, so its labels must stay out of the HUD's boxes:
  // panels, bars, the helm's readouts and touch pad. Their rects are read at the top of frame(), before that frame
  // writes anything, and only when something may have moved them (resize, a panel changing size, the helm or the
  // menu opening), plus once a second for anything missed. Hidden elements measure 0 x 0 and are skipped.
  const KO = '#telemetry, #crew, .bar-top .ident, .bar-top .tape, .bar-top .clocks, .bar-bottom .mfd, .bar-bottom .tog, #touchPad';
  const KO_HELM = ', #helmHud .hbox, #helmHud .hwarn, #helmHud .hauto, #helmHud .cscore';
  let keepOut = [], koDirty = true, koT = 0;
  function readKeepOut(now){
    koDirty = false; koT = now; keepOut = [];
    for (const e of document.querySelectorAll(KO + (body.classList.contains('helm') ? KO_HELM : ''))) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) keepOut.push({x0: r.left, y0: r.top, x1: r.right, y1: r.bottom});
    }
  }
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { koDirty = true; });
    document.querySelectorAll('#telemetry, #crew, #touchPad, .bar-top, .bar-bottom, #helmHud .hwarn, #helmHud .hauto').forEach(e => ro.observe(e));
  }
  addEventListener('resize', () => { koDirty = true; });
  const overlap = (a, b, p) => a.x0 < b.x1 + p && a.x1 > b.x0 - p && a.y0 < b.y1 + p && a.y1 > b.y0 - p;
  // does box b (CSS px) leave the screen or touch the HUD (or one of the extra boxes)?
  function hits(b, extra, pad = 6){
    if (b.x0 < pad || b.y0 < pad || b.x1 > ORB.W - pad || b.y1 > ORB.H - pad) return true;
    return keepOut.some(k => overlap(b, k, pad)) || (extra || []).some(k => overlap(b, k, pad));
  }
  // the y nearest `want` in [lo, hi] at which a box spanning x0..x1 and y +- hh clears the HUD; null if none does
  function freeY(x0, x1, want, lo, hi, hh, pad = 8){
    const iv = keepOut.filter(k => k.x0 < x1 + pad && k.x1 > x0 - pad).map(k => [k.y0 - hh - pad, k.y1 + hh + pad]);
    const free = y => y >= lo && y <= hi && !iv.some(([a, b]) => y > a && y < b);
    if (free(want)) return want;
    let best = null;
    for (const y of [lo, hi, ...iv.flat()]) if (free(y) && (best === null || Math.abs(y - want) < Math.abs(best - want))) best = y;
    return best;
  }

  // ---------------------------------------------------------------------------------------------- crew manifest
  const crews = [...document.querySelectorAll('#crew details.crew')];
  crews.forEach(d => {
    d.addEventListener('toggle', () => {
      body.classList.toggle('crew-open', crews.some(c => c.open));      // the dock's sheet covers the helm controls
      koDirty = true;
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
    launching = false; body.classList.remove('jumping', 'flash', 'armed', 'cine', 'crit', 'glitch');
    const ct = $('ctitle'); if (ct) ct.classList.remove('show');
    if (AUDIO.combat) AUDIO.combat.cue('safe');
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
  const DOCK = matchMedia('(max-width: 720px), (max-height: 520px) and (max-width: 1000px), (orientation: portrait) and (max-width: 1100px) and (pointer: coarse)');
  document.addEventListener('pointerdown', e => {
    if (DOCK.matches && !(e.target && e.target.closest && e.target.closest('#crew'))) crews.forEach(d => { d.open = false; });
  });
  $('bAudio').addEventListener('click', () => { AUDIO.set(!AUDIO.on); log(AUDIO.on ? 'COCKPIT AUDIO ON' : 'COCKPIT AUDIO OFF'); });
  $('bScope').addEventListener('click', () => { if (window.SCENE && SCENE.state === 'run') $('bScope').setAttribute('aria-pressed', SCENE.telescope() ? 'true' : 'false'); });
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
    failed = true; body.classList.add('nogl'); body.classList.remove('booting', 'helm', 'chase', 'armed', 'cine', 'crit', 'glitch');   // a scene lost mid-flight (or mid-fight)
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
  const sMoonOrb = el('path', {class: 'orb orb-moon'}, schem);
  const sArrow = el('path', {class: 'arrow'}, schem);
  const sArrowT = el('text', {class: 'lbl amber'}, schem); sArrowT.textContent = 'GARGANTUA';
  const sOrbBack = el('path', {class: 'orb back'}, schem);
  const sPlanet = el('circle', {r: 22, cx: 0, cy: 0, fill: 'url(#plg)', class: 'planet'}, schem);
  const sOrbFront = el('path', {class: 'orb'}, schem);
  const sShip = el('circle', {r: 3, class: 'ship'}, schem);
  const sMoon = el('circle', {r: 3.2, class: 'moon'}, schem);
  const sScan = el('line', {x1: -100, x2: 100, class: 'scan'}, schem);

  // ---------------------------------------------------------------------------------------------- reticles
  const R = $('reticle');
  const gHole = el('g', {}, R);
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
  const lT = el('text', {class: 'blu-f t-sm', y: -10, 'text-anchor': 'middle'}, gLimb);   // over the bracket: against sky, not glint
  const gBore = el('g', {}, R);
  el('path', {class: 'blu', d: 'M-22 0H-8M8 0H22M0 -8V-4M0 4V8', opacity: 0.8}, gBore);
  el('circle', {class: 'blu', r: 3, opacity: 0.8}, gBore);
  const gCon = el('g', {}, R);                                // friendly formations (js/scene/ships.js)
  const cBox = el('path', {class: 'blu'}, gCon);
  const cT1 = el('text', {class: 'blu-f t-sm'}, gCon), cT2 = el('text', {class: 'blu-f t-sm'}, gCon);
  const gPro = el('g', {}, R);
  const pArrow = el('path', {class: 'blu'}, gPro);
  const pT = el('text', {class: 'blu-f t-sm'}, gPro); pT.textContent = 'PROGRADE';

  // The Kerr shadow's edge as seen from here (kerr.js: the critical curve through the same ZAMO camera the shader
  // uses, so it hugs the drawn shadow): world directions, recomputed when the spin moves or the camera drifts. Its
  // centre and size place the lock ring and give the SHADOW readout. (It is not drawn: laid over the photon ring, a
  // traced outline hid the sharpest edge in the picture.)
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

  // Gargantua's name and data block. Slots round the ring in order of preference -- side slots hang off a leader at
  // +-0.3 rad, the others centre above or below the ring -- and the first that stays on screen and clear of the HUD
  // wins. The current slot is kept while it still fits, so the block does not hop about, and a preferred one takes over
  // again once it has fitted for 2 s. Phones: two lines, above or below the ring.
  const SLOTS_WIDE = ['Ru', 'Lu', 'Rd', 'Ld', 'B', 'T'], SLOTS_NARROW = ['T', 'B'];
  const LW = [[hT1, 126, ''], [hT2, 185, ''], [hT3, 206, '']];   // [text, width px (estimated until measured), text measured]
  let holeSlot = '', holeBetterT = 0;
  function labelWidth(wide){
    for (const e of LW) {                                         // measured while shown, whenever the text changes
      const t = e[0].textContent;
      if (e[2] !== t && t && e[0].style.display !== 'none') { const w = e[0].getComputedTextLength(); if (w > 0) { e[1] = w; e[2] = t; } }
    }
    return Math.max(LW[0][1], LW[1][1], wide ? LW[2][1] : 0) + 4;
  }
  // the block's box for slot k, relative to the ring centre (r2 = the outer ring's radius, w = the block's width)
  function slotBox(k, r2, w, wide){
    if (k === 'T') return wide ? {x0: -w/2, x1: w/2, y0: -r2 - 60, y1: -r2 - 12} : {x0: -w/2, x1: w/2, y0: -r2 - 40, y1: -r2 - 6};
    if (k === 'B') return wide ? {x0: -w/2, x1: w/2, y0: r2 + 16, y1: r2 + 64} : {x0: -w/2, x1: w/2, y0: r2 + 12, y1: r2 + 46};
    const s = k[0] === 'R' ? 1 : -1, tx = s*(r2 + 38), ly = (k[1] === 'u' ? -1 : 1)*r2*0.34;
    return {x0: s > 0 ? tx : tx - w, x1: s > 0 ? tx + w : tx, y0: ly - 21, y1: ly + 32};
  }
  function holeLabel(ph, rs, r2, W, extra){
    const wide = W >= 700, slots = wide ? SLOTS_WIDE : SLOTS_NARROW, w = labelWidth(wide);
    const fits = k => { const b = slotBox(k, r2, w, wide); return !hits({x0: ph.x + b.x0, x1: ph.x + b.x1, y0: ph.y + b.y0, y1: ph.y + b.y1}, extra); };
    const best = slots.find(fits) || '', now = performance.now();
    if (!slots.includes(holeSlot) || !fits(holeSlot)) { holeSlot = best; holeBetterT = 0; }
    else if (best && slots.indexOf(best) < slots.indexOf(holeSlot)) {
      if (!holeBetterT) holeBetterT = now; else if (now - holeBetterT > 2000) { holeSlot = best; holeBetterT = 0; }
    } else holeBetterT = 0;
    const k = holeSlot, mid = {x: 0, 'text-anchor': 'middle'};
    hT2.style.display = k ? '' : 'none'; hT3.style.display = k && wide ? '' : 'none';
    if (!k) {                         // nowhere clear (the telescope's ring fills the view): the name inside the shadow's top
      hLead.setAttribute('d', '');
      const y = -rs + 34, hw = LW[0][1]/2;
      hT1.style.display = rs > 60 && !hits({x0: ph.x - hw, x1: ph.x + hw, y0: ph.y + y - 16, y1: ph.y + y + 4}, extra) ? '' : 'none';
      setA(hT1, {...mid, y: f1(y)});
      return;
    }
    hT1.style.display = '';
    if (k === 'T' || k === 'B') {
      hLead.setAttribute('d', '');
      const y = k === 'T' ? (wide ? -r2 - 46 : -r2 - 26) : (wide ? r2 + 30 : r2 + 26);
      setA(hT1, {...mid, y: f1(y)}); setA(hT2, {...mid, y: f1(y + (wide ? 16 : 15))}); setA(hT3, {...mid, y: f1(y + 30)});
      return;
    }
    const s = k[0] === 'R' ? 1 : -1, v = k[1] === 'u' ? 1 : -1, lx = s*(r2 + 34), ly = -v*r2*0.34, tx = lx + s*4;
    hLead.setAttribute('d', 'M' + f1(s*r2*Math.cos(0.3)) + ' ' + f1(-v*r2*Math.sin(0.3)) + 'L' + f1(lx) + ' ' + f1(ly) + 'H' + f1(lx + s*(w + 6)));
    const at = {x: f1(tx), 'text-anchor': s > 0 ? 'start' : 'end'};
    setA(hT1, {...at, y: f1(ly - 7)}); setA(hT2, {...at, y: f1(ly + 15)}); setA(hT3, {...at, y: f1(ly + 29)});
  }

  function reticles(){
    const v = ORB.view, h = ORB.hud, W = ORB.W, H = ORB.H;
    const pxPerRad = H/2/Math.tan(v.fov/2);
    gBore.style.display = combatReticles(performance.now(), pxPerRad) ? 'none' : '';     // armed: the pipper replaces it
    gBore.setAttribute('transform', 'translate(' + f1(W/2) + ',' + f1(H/2) + ')');
    const extra = [{x0: W/2 - 26, y0: H/2 - 12, x1: W/2 + 26, y1: H/2 + 12}];      // labels keep off the boresight too
    // prograde: an edge arrow at its height (orbitProject keeps the sign of x and y for directions behind the camera,
    // so the side is right either way), slid along its column where the HUD is in the way
    const pp = orbitProject(h.pro), side = pp.x > W/2 ? 1 : -1, px2 = side > 0 ? W - 104 : 104;
    const px0 = side > 0 ? px2 - 84 : px2 - 12, px1 = side > 0 ? px2 + 12 : px2 + 84;
    const py2 = W < 700 ? null : freeY(px0, px1, clamp(pp.y, H*0.3, H*0.7), H*0.2, H*0.8, 11);
    gPro.style.display = py2 === null ? 'none' : '';
    if (py2 !== null) {
      gPro.setAttribute('transform', 'translate(' + px2 + ',' + f1(py2) + ')');
      pArrow.setAttribute('d', side > 0 ? 'M0 -7L9 0L0 7M-10 -7L-1 0L-10 7' : 'M0 -7L-9 0L0 7M10 -7L1 0L10 7');
      setA(pT, {x: side > 0 ? -18 : 18, y: 4, 'text-anchor': side > 0 ? 'end' : 'start'});
      extra.push({x0: px0, y0: py2 - 11, x1: px1, y1: py2 + 11});
    }
    // Gargantua: lock ring round the shadow, centred on its (Kerr, D-shaped when fast) outline
    const so = shadowOutline();
    const ph = orbitProject(so ? so.centre : h.dirHole), rs = Math.tan(so ? so.rad : ORB.shadowRad)*pxPerRad;
    const r1 = rs*1.28, r2 = rs*1.46;
    const onScreen = ph.front && ph.x > -r2 && ph.x < W + r2 && ph.y > -r2 && ph.y < H + r2;
    gHole.style.display = onScreen ? '' : 'none';
    if (onScreen) {
      gHole.setAttribute('transform', 'translate(' + f1(ph.x) + ',' + f1(ph.y) + ')');
      setA(hRing, {r: f1(r1)}); setA(hSpin, {r: f1(r2)});
      const a = f1(r1), b = f1(r1 + 11);
      hTicks.setAttribute('d', 'M' + a + ' 0H' + b + 'M-' + a + ' 0H-' + b + 'M0 ' + a + 'V' + b + 'M0 -' + a + 'V-' + b);
      holeLabel(ph, rs, r2, W, extra);
    }
    // MILLER I: the marker wherever it is on screen; its label right of it, or left, or (neither clear of the HUD) none
    const pm = orbitProject(h.dirMoon), rm = Math.max(7, Math.tan(h.moonAng)*pxPerRad + 7);
    const mOn = pm.front && pm.x > 20 && pm.x < W - 20 && pm.y > 20 && pm.y < H - 20;
    gMoon.style.display = mOn ? '' : 'none';
    if (mOn) {
      const transit = Math.abs(h.moonPhi) < 0.09, mTxt = (transit ? 'TRANSIT · ' : '') + num(h.moonRange/1e3) + ' km';
      const lw = Math.max(62, mTxt.length*7.2) + 8, y0 = pm.y - 13, y1 = pm.y + 15;
      const side = !hits({x0: pm.x + rm + 4, x1: pm.x + rm + lw, y0, y1}, extra) ? 1 : !hits({x0: pm.x - rm - lw, x1: pm.x - rm - 4, y0, y1}, extra) ? -1 : 0;
      gMoon.setAttribute('transform', 'translate(' + f1(pm.x) + ',' + f1(pm.y) + ')');
      mBox.setAttribute('d', 'M0 -' + f1(rm) + 'L' + f1(rm) + ' 0L0 ' + f1(rm) + 'L-' + f1(rm) + ' 0Z');
      mT1.style.display = mT2.style.display = side ? '' : 'none';
      if (side) {
        const at = {x: f1(side*(rm + 8)), 'text-anchor': side > 0 ? 'start' : 'end'};
        setA(mT1, {...at, y: -3}); setA(mT2, {...at, y: 11});
        setText(mT2, mTxt); mT2.classList.toggle('transit', transit);
      }
    }
    // the limb straight below the hole; its name over the bracket unless that is under the HUD
    const up = h.up, hd = V.norm(V.sub(h.dirHole, V.mul(up, V.dot(h.dirHole, up))));
    const limb = orbitProject(V.norm(V.sub(V.mul(hd, Math.cos(h.dip)), V.mul(up, Math.sin(h.dip)))));
    const lOn = limb.front && limb.y < H - 30 && limb.y > 40;
    gLimb.style.display = lOn ? '' : 'none';
    if (lOn) {
      gLimb.setAttribute('transform', 'translate(' + f1(limb.x) + ',' + f1(limb.y - 10) + ')');
      lT.style.display = hits({x0: limb.x - 58, x1: limb.x + 58, y0: limb.y - 30, y1: limb.y - 16}, extra) ? 'none' : '';
    }
    // contact bracket on the lead ship of a passing formation, labelled on whichever side is clear
    const c = typeof FLY !== 'undefined' && FLY.contact, pc = c ? orbitProject(c.dir) : null;
    const cOn = !!(pc && pc.front && pc.x > 30 && pc.x < W - 30 && pc.y > 30 && pc.y < H - 30);
    gCon.style.display = cOn ? '' : 'none';
    if (cOn) {
      const s = clamp(0.3/(c.range/1e3)*pxPerRad, 12, 90), k = s*0.4, y0 = pc.y - s - 2, y1 = pc.y - s + 24;
      const side = !hits({x0: pc.x + s + 4, x1: pc.x + s + 178, y0, y1}, extra) ? 1 : !hits({x0: pc.x - s - 178, x1: pc.x - s - 4, y0, y1}, extra) ? -1 : 0;
      gCon.setAttribute('transform', 'translate(' + f1(pc.x) + ',' + f1(pc.y) + ')');
      cBox.setAttribute('d', 'M-' + s + ' -' + (s - k) + 'V-' + s + 'H-' + (s - k) + 'M' + (s - k) + ' -' + s + 'H' + s + 'V-' + (s - k) +
        'M' + s + ' ' + (s - k) + 'V' + s + 'H' + (s - k) + 'M-' + (s - k) + ' ' + s + 'H-' + s + 'V' + (s - k));
      cT1.style.display = cT2.style.display = side ? '' : 'none';
      if (side) {
        const at = {x: f1(side*(s + 8)), 'text-anchor': side > 0 ? 'start' : 'end'};
        setA(cT1, {...at, y: f1(-s + 8)}); setA(cT2, {...at, y: f1(-s + 21)});
        setText(cT1, 'CONTACT · FRIENDLY'); setText(cT2, c.name + (c.n > 1 ? ' +' + (c.n - 1) : '') + ' · ' + num(c.range/1e3, 1) + ' km');
      }
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
    setText(E.per, isFinite(h.period) ? dur(h.period) : 'ESCAPE');
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
    // (the frame is built from t, so the arrow always lies at the same place: ~(25, 6) to (61, 14), right of MILLER)
    const a0 = pj(V.mul(t, pl.R*1.4)), a1 = pj(V.mul(t, pl.R*3.4));
    sArrow.setAttribute('d', 'M' + f1(a0[0]) + ' ' + f1(a0[1]) + 'L' + f1(a1[0]) + ' ' + f1(a1[1]) + 'm-6 -3l6 3l-6 3');
    setA(sArrowT, {x: 97, y: f1(a1[1] - 8), 'text-anchor': 'end'});    // over the arrow, clear of the planet
    const sc = ((now || performance.now())/40) % 144 - 72; setA(sScan, {y1: f1(sc), y2: f1(sc)});
  }

  // ---------------------------------------------------------------------------------------------- the helm
  // Readouts round the centre, warnings, the autopilot countdown, the drag stick, the touch pad (phones), the controls
  // card on the first time at the helm. flight.js owns the numbers; this only shows them.
  const HH = {rel: $('hRel'), thr: $('hThr'), alt: $('hAlt'), vs: $('hVs'), warn: $('hWarn'), auto: $('hAuto'), card: $('hCard'),
    orbit: $('tOrbit'), help: $('help'), btn: $('bHelm')};
  const HELP_STATION = HH.help ? HH.help.innerHTML : '';
  const HELP_HELM = 'W · THRUST &nbsp; DRAG · STEER &nbsp; SHIFT · BOOST &nbsp; X · HOLD ORBIT &nbsp; V · VIEW &nbsp; T · TRACK &nbsp; H · HOME';
  const gStick = el('g', {}, R), sRing = el('circle', {class: 'blu', r: 38, opacity: 0.6}, gStick);
  const sLine = el('path', {class: 'blu', opacity: 0.7}, gStick), sDot = el('circle', {class: 'blu-f', r: 6}, gStick);
  gStick.style.display = 'none';
  function stick(s){
    if (!s) { gStick.style.display = 'none'; return; }
    gStick.style.display = ''; setA(sRing, {cx: f1(s.x0), cy: f1(s.y0)}); setA(sDot, {cx: f1(s.x), cy: f1(s.y)});
    sLine.setAttribute('d', 'M' + f1(s.x0) + ' ' + f1(s.y0) + 'L' + f1(s.x) + ' ' + f1(s.y));
  }
  const TOUCH = {thrust: 0, boost: 0, reverse: 0, hold: 0, fire: 0};
  window.HELM_TOUCH = TOUCH;
  document.querySelectorAll('#touchPad .tp').forEach(b => {
    const k = b.dataset.in;
    const on = e => {
      e.preventDefault();
      if (window.SCENE && SCENE.state === 'run' && typeof HELM !== 'undefined' && HELM.mode !== 'helm') SCENE.helm();
      if ((k === 'fire' || k === 'torp') && window.SCENE && SCENE.combat && !COMBAT.hot) SCENE.combat('arm');   // the trigger arms them
      if (k === 'torp') { if (typeof COMBAT !== 'undefined' && COMBAT.hot) COMBAT.input.torp = 1; b.classList.add('on'); return; }
      TOUCH[k] = 1; b.classList.add('on');
    };
    const off = () => { TOUCH[k] = 0; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => b.addEventListener(t, off));
  });
  HH.btn.addEventListener('click', () => { if (window.SCENE && SCENE.helm) SCENE.helm(); });
  $('bWpn').addEventListener('click', () => { if (window.SCENE && SCENE.combat) SCENE.combat('toggle'); });
  // a toggle clicked with the pointer gives its focus back, or Space -- the trigger -- would press it again
  document.querySelectorAll('#hud .tog').forEach(b => b.addEventListener('click', e => { if (e.detail > 0) b.blur(); }));
  HH.card.addEventListener('click', () => HH.card.classList.remove('show'));
  let cardDone = false, lastHelm = false;
  function helmFrame(){
    const on = typeof HELM !== 'undefined' && HELM.mode !== 'station';
    if (on !== lastHelm) {
      lastHelm = on; body.classList.toggle('helm', on); koDirty = true;
      HH.help.innerHTML = on ? HELP_HELM : HELP_STATION;
      setText(HH.btn, on ? 'AUTOPILOT' : 'TAKE HELM'); HH.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && !cardDone) { cardDone = true; HH.card.classList.add('show'); setTimeout(() => HH.card.classList.remove('show'), 9000); }
      if (!on) setText(HH.orbit, 'DAWN–DUSK · 8.0°');
    }
    body.classList.toggle('chase', on && ((HELM.view === 'chase' && HELM.camK > 0.5) || (HELM.view === 'hull' && HELM.mode === 'helm')));   // no canopy: outside the ship
    DM.wpn.setAttribute('aria-pressed', typeof COMBAT !== 'undefined' && COMBAT.hot ? 'true' : 'false');
    if (!on) return;
    const h = ORB.hud, vr = V.dot(HELM.v, h.up);
    const armed = typeof COMBAT !== 'undefined' && COMBAT.hot;
    setText(HH.rel, armed ? num(h.rel*ORB.TC) + ' m/s' : num(h.rel/1e3, 2) + ' km/s');
    HH.thr.style.width = Math.round(clamp(h.rel/Math.max(h.vmax, 1), 0, 1)*100) + '%';
    HH.thr.classList.toggle('boost', !!HELM.input.boost);
    setText(HH.alt, num(h.alt/1e3) + ' km');
    setText(HH.vs, (vr >= 0 ? '▲ ' : '▼ ') + num(Math.abs(vr)/1e3, 2) + ' km/s');
    const warn = HELM.warn || (HELM.assist ? '' : 'ORBIT ASSIST OFF');
    setText(HH.warn, warn); HH.warn.className = 'hwarn' + (HELM.warn ? ' hot' : warn ? ' on' : '');
    const left = HELM.IDLE_AUTO - HELM.idle;
    setText(HH.auto, HELM.mode === 'auto' ? 'AUTOPILOT · RETURNING TO STATION' : left < 10 ? 'AUTOPILOT IN ' + Math.ceil(left) + ' s · ANY KEY TO STAY' : (HELM.track ? 'TRACKING GARGANTUA' : ''));
    setText(HH.orbit, h.ecc < 0.01 ? 'CIRCULAR · ' + num(h.alt/1e3) + ' km' : 'AP ' + (isFinite(h.ap) ? num(h.ap/1e3) : '∞') + ' · PE ' + num(h.pe/1e3) + ' km');
  }

  // ---------------------------------------------------------------------------------------------- the fight
  // combat.js owns the fight; this draws it: the pipper where your rounds are going, a bracket on every hostile in view
  // (the one you have: name, range, shields and hull, the lead diamond, the lock ring closing on it), arrows at the edge
  // for the rest and for missiles coming at you, ticks round the pipper for every hit. SVG elements are pooled.
  const gC = el('g', {}, R); gC.style.display = 'none';
  const cPip = el('g', {}, gC), cPipC = el('circle', {class: 'pip', r: 14}, cPip);
  el('path', {class: 'pip', d: 'M-23 0H-16M16 0H23M0 -23V-16M0 16V23'}, cPip); el('circle', {class: 'pip', r: 1.4}, cPip);
  const cLead = el('path', {class: 'hot', d: 'M0 -7L7 0L0 7L-7 0Z'}, gC), cLock = el('circle', {class: 'lock'}, gC), cLockT = el('text', {class: 'hot-f t-sm', 'text-anchor': 'middle'}, gC);
  const cHit = el('path', {class: 'hitm', d: 'M-19 -19L-10 -10M19 -19L10 -10M-19 19L-10 10M19 19L10 10'}, cPip);
  const cWarn = el('text', {class: 'hot-f', 'text-anchor': 'middle'}, gC);
  const BRK = [], ARR = [];
  for (let i = 0; i < 16; i++) { const g = el('g', {}, gC); BRK.push({g, box: el('path', {class: 'hot'}, g), t1: el('text', {class: 'hot-f t-sm'}, g), t2: el('text', {class: 'hot-f t-sm'}, g),
    hb: el('rect', {class: 'hpb', height: 3}, g), hf: el('rect', {class: 'hpf', height: 3}, g), sb: el('rect', {class: 'hpb', height: 3}, g), sf: el('rect', {class: 'shf', height: 3}, g)}); }
  for (let i = 0; i < 12; i++) ARR.push(el('path', {class: 'hot', d: 'M-6 -7L8 0L-6 7Z'}, gC));
  let hitT = -9, killT = -9, firedSeen = 0, dmgA = 0;
  const DM = {shield: $('cSh'), hull: $('cHull'), heat: $('cHeat'), hot: $('cHot'), torp: $('cTorp'), score: $('cScore'), vig: $('dmgv'), title: $('ctitle'), wpn: $('bWpn')};
  const best = () => safe(() => +localStorage.getItem('meinen.combat.best') || 0, 0);
  const fmtR = m => m < 1000 ? Math.round(m) + ' m' : num(m/1e3, 1) + ' km';
  function combatReticles(now, pxPerRad){
    const C = typeof COMBAT !== 'undefined' ? COMBAT : null, on = !!(C && C.hot && C.pl && C.pl.down < 0 && !C.shot && ORB.bodies);
    gC.style.display = on ? '' : 'none';
    if (!on) return false;
    const v = ORB.view, W = ORB.W, H = ORB.H, eye = V.sub(v.eye, ORB.bodies[1].pos), P = C.pl, me = C.me;
    const proj = p => orbitProject(V.norm(V.sub(p, eye)));                     // MILLER-relative point -> CSS px
    const pp = proj(V.add(me.p, V.mul(P.aim || me.f, P.aimR || 900)));
    cPip.style.display = pp.front ? '' : 'none';
    cPip.setAttribute('transform', 'translate(' + f1(pp.x) + ',' + f1(pp.y) + ')');
    const onTgt = !!(P.tgt && P.aim && P.aim !== me.f);                       // the gimbal has it
    cPipC.classList.toggle('on', onTgt);
    const hk = now - hitT, kk = now - killT;
    cHit.style.opacity = kk < 260 ? 1 : hk < 110 ? 0.9 : 0;
    cHit.setAttribute('transform', kk < 260 ? 'scale(1.5)' : '');
    let nb = 0, na = 0;
    const edge = (p, cls) => {                                                 // an arrow at the screen's edge toward p
      if (na >= ARR.length) return;
      const q = proj(p), dx = q.x - W/2, dy = q.y - H/2, rx = W/2 - 70, ry = H/2 - 70, k = 1/Math.max(Math.hypot(dx/rx, dy/ry), 1e-6);
      const a = ARR[na++]; a.style.display = ''; a.setAttribute('class', cls);
      a.setAttribute('transform', 'translate(' + f1(W/2 + dx*k) + ',' + f1(H/2 + dy*k) + ') rotate(' + f1(Math.atan2(dy, dx)/DEG) + ')');
    };
    for (const e of C.ents) {
      if (!e.alive || e.arrive || e.wreck || e.dying >= 0) continue;
      const c = CMB_CLS[e.cls], q = proj(e.p), d = cmbDist(e.p, me.p);
      if (!(q.front && q.x > 24 && q.x < W - 24 && q.y > 24 && q.y < H - 24)) { edge(e.p, 'hot'); continue; }
      if (nb >= BRK.length) continue;
      const B = BRK[nb++], s = clamp(Math.max(c.ext[0], c.ext[1], c.ext[2])/d*pxPerRad*1.15, 8, 150), k = Math.max(4, s*0.35), isT = e === P.tgt;
      B.g.style.display = ''; B.g.setAttribute('transform', 'translate(' + f1(q.x) + ',' + f1(q.y) + ')');
      B.box.setAttribute('d', 'M-' + s + ' -' + (s - k) + 'V-' + s + 'H-' + (s - k) + 'M' + (s - k) + ' -' + s + 'H' + s + 'V-' + (s - k) +
        'M' + s + ' ' + (s - k) + 'V' + s + 'H' + (s - k) + 'M-' + (s - k) + ' ' + s + 'H-' + s + 'V' + (s - k));
      B.box.style.opacity = isT ? 1 : 0.6;
      B.t1.style.display = B.t2.style.display = isT ? '' : 'none';
      const bw = Math.max(34, s*1.6), showBars = isT || c.capital;
      [B.hb, B.hf].forEach(r => r.style.display = showBars ? '' : 'none'); [B.sb, B.sf].forEach(r => r.style.display = showBars && c.sh ? '' : 'none');
      if (showBars) {
        setA(B.hb, {x: f1(-bw/2), y: f1(s + 6), width: f1(bw)}); setA(B.hf, {x: f1(-bw/2), y: f1(s + 6), width: f1(bw*clamp(e.hp/c.hp, 0, 1))});
        if (c.sh) { setA(B.sb, {x: f1(-bw/2), y: f1(s + 11), width: f1(bw)}); setA(B.sf, {x: f1(-bw/2), y: f1(s + 11), width: f1(bw*clamp(e.sh/c.sh, 0, 1))}); }
      }
      if (isT) {
        const side = q.x < W - 200 ? 1 : -1, at = {x: f1(side*(s + 8)), 'text-anchor': side > 0 ? 'start' : 'end'};
        setA(B.t1, {...at, y: f1(-s + 8)}); setA(B.t2, {...at, y: f1(-s + 21)});
        setText(B.t1, c.name); setText(B.t2, fmtR(d) + (P.locked ? ' · LOCK' : ''));
      }
    }
    for (let i = nb; i < BRK.length; i++) BRK[i].g.style.display = 'none';
    // the target: lead diamond (where to put the pipper) and the lock ring closing on it
    const t = P.tgt, c = t && CMB_CLS[t.cls];
    const tq = t ? proj(t.p) : null, ok = !!(tq && tq.front);
    cLead.style.display = ok && P.lead ? '' : 'none';
    if (ok && P.lead) { const lq = proj(V.add(me.p, V.mul(P.lead.dir, cmbDist(t.p, me.p)))); cLead.setAttribute('transform', 'translate(' + f1(lq.x) + ',' + f1(lq.y) + ')'); }
    cLock.style.display = cLockT.style.display = ok && P.lockT > 0 ? '' : 'none';
    if (ok && P.lockT > 0) {
      const s = clamp(Math.max(c.ext[0], c.ext[1], c.ext[2])/cmbDist(t.p, me.p)*pxPerRad*1.15, 8, 150), r = s + 12 + (P.locked ? 0 : 18*(1 - P.lockT/c.lock));
      setA(cLock, {cx: f1(tq.x), cy: f1(tq.y), r: f1(r), 'stroke-dasharray': P.locked ? 'none' : f1(2*Math.PI*r*P.lockT/c.lock) + ' 999'});
      setA(cLockT, {x: f1(tq.x), y: f1(tq.y + r + 13)}); setText(cLockT, P.locked ? 'LOCK' : '');
    }
    // missiles coming for you: an edge arrow each, and the warning
    let inc = 0;
    for (const m of C.torps) if (m.team === 1) { inc++; edge(m.p, 'lock'); }
    for (let i = na; i < ARR.length; i++) ARR[i].style.display = 'none';
    cWarn.style.display = inc ? '' : 'none';
    if (inc) { setA(cWarn, {x: f1(W/2), y: f1(H/2 + 118)}); setText(cWarn, 'MISSILE'); cWarn.style.opacity = Math.floor(now/180) % 2 ? 1 : 0.35; }
    return true;
  }
  // the readouts under REL and ALT, the tally, and the gun thumps (combat.js counts the rounds fired)
  function combatStatus(now){
    const C = typeof COMBAT !== 'undefined' ? COMBAT : null; if (!C || !C.pl) return;
    const P = C.pl;
    if (C.fired !== firedSeen) { if (C.fired > firedSeen) AUDIO.combat.gun(); firedSeen = C.fired; }
    AUDIO.combat.frame();
    dmgA = Math.max(0, dmgA - 0.04); DM.vig.style.opacity = dmgA.toFixed(2);
    if (!C.hot) return;
    const bar = (e, x, low, over) => { e.style.setProperty('--v', (clamp(x, 0, 1)*100).toFixed(1) + '%'); e.classList.toggle('low', !!low); e.classList.toggle('over', !!over); };
    bar(DM.shield, P.sh/CMB.SHIELD, P.sh < CMB.SHIELD*0.25); bar(DM.hull, P.hull/CMB.HULL, P.hull < 30); bar(DM.heat, P.heat, P.heat > 0.8, P.over);
    setText(DM.hot, P.over ? 'OVERHEAT' : '');
    if (DM.torp.childElementCount !== CMB.TORP_MAX) { DM.torp.textContent = ''; for (let i = 0; i < CMB.TORP_MAX; i++) DM.torp.appendChild(document.createElement('i')); }
    [...DM.torp.children].forEach((e, i) => e.classList.toggle('on', i < P.torps));
    const b = Math.max(best(), C.score.kills);
    setText(DM.score, 'KILLS ' + pad(C.score.kills) + ' · WAVE ' + (CMB_ROMAN[C.score.wave] || C.score.wave || '—') + ' · BEST ' + pad(b));
  }
  let titleT = 0;
  function title(t, s){
    const e = DM.title; setText(e.firstElementChild, t); setText(e.lastElementChild, s || '');
    e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
    clearTimeout(titleT); titleT = setTimeout(() => e.classList.remove('show'), 4700);
  }
  function hurt(k){ dmgA = Math.min(0.9, dmgA + k); if (k > 0.3 && !RM) { body.classList.remove('glitch'); void body.offsetWidth; body.classList.add('glitch'); } }
  function saveBest(k){ if (k > best()) safe(() => localStorage.setItem('meinen.combat.best', String(k))); }
  function combatPoke(type, a){
    const S = AUDIO.combat;
    if (type === 'arm') {
      body.classList.add('armed'); koDirty = true; AUDIO.select();
      log('WEAPONS HOT · TWIN COILGUNS · ' + CMB.TORP_MAX + ' TORPEDOES', true);
      if (!AUDIO.on && !combatPoke.hinted) { combatPoke.hinted = true; setTimeout(() => log('FOR THE SCORE · SWITCH AUDIO ON'), 2500); }
    }
    else if (type === 'safe') { body.classList.remove('armed', 'crit'); koDirty = true; S.cue('safe'); saveBest(a.kills);
      log(a.why === 'launch' ? 'WEAPONS SAFE · JUMP DRIVE ENGAGED' : 'WEAPONS SAFE · ' + a.kills + ' KILL' + (a.kills === 1 ? '' : 'S') + (a.wave ? ' · WAVE ' + (CMB_ROMAN[a.wave] || a.wave) : '') + ' · HOSTILES JUMPING OUT'); }
    else if (type === 'fault') { body.classList.remove('armed', 'cine', 'crit'); koDirty = true; S.cue('safe'); log('WEAPONS OFFLINE · SYSTEM FAULT', true); }
    else if (type === 'title') title(a.t, a.s);
    else if (type === 'music') S.cue(a.cue);
    else if (type === 'cine') body.classList.toggle('cine', !!a.on);
    else if (type === 'hit') { hitT = performance.now(); S.hit(a.shield); }
    else if (type === 'kill') { killT = performance.now(); log('SPLASH · ' + a.name + ' · ' + a.kills + (a.kills === 1 ? ' KILL' : ' KILLS')); }
    else if (type === 'boom') S.boom(a.size, a.dist);
    else if (type === 'hurt') { if (a.shield) { S.shield(); hurt(0.18); } else { S.hull(); hurt(0.45); } }
    else if (type === 'shieldsDown') log('SHIELDS DOWN', true);
    else if (type === 'hullCrit') { log('HULL CRITICAL', true); body.classList.add('crit'); S.crit(true); }
    else if (type === 'repair') { log('DAMAGE CONTROL · HULL +' + a.amt + '%'); body.classList.remove('crit'); S.crit(false); }
    else if (type === 'lock') { if (a.on) S.lock(); }
    else if (type === 'torp') { S.torp(); log('TORPEDO AWAY' + (a.guided ? ' · GUIDED' : ' · UNGUIDED')); }
    else if (type === 'torpEmpty') log('TORPEDOES RELOADING');
    else if (type === 'overheat') log('GUNS OVERHEATED · COOLING', true);
    else if (type === 'warp') { if (a.big) S.whoosh(); }
    else if (type === 'capArrive') log('CONTACT · DOMINION ' + a.name + ' · DROPPING OUT OF WARP', true);
    else if (type === 'capShields') log(a.name + ' SHIELDS DOWN · HULL EXPOSED', true);
    else if (type === 'capDying') log(a.name + ' BREAKING UP', true);
    else if (type === 'capBoom') log(a.name + ' DESTROYED');
    else if (type === 'missile') { log('MISSILE LAUNCH · INCOMING', true); S.alarm(); }
    else if (type === 'launch') log('CRUISER LAUNCHING FIGHTERS');
    else if (type === 'down') { log('HULL BREACH · SYSTEMS FAILING', true); hurt(0.9); }
    else if (type === 'ejump') { log('EMERGENCY JUMP', true); AUDIO.jump(); saveBest(a.kills); }
    else if (type === 'recovered') {
      body.classList.remove('armed', 'cine', 'crit'); koDirty = true; S.cue('safe');
      title('EMERGENCY JUMP', a.kills + ' KILL' + (a.kills === 1 ? '' : 'S') + ' · WAVE ' + (CMB_ROMAN[a.wave] || a.wave || '—') + ' · BEST ' + pad(Math.max(best(), a.kills)));
      log('MSV MEINEN RECOVERED · STATION KEEPING · HULL REPAIRED');
      AUDIO.apply();                                                     // the jump faded the cockpit hum out: bring it back
    }
  }

  // ---------------------------------------------------------------------------------------------- per frame
  function frame(now, scale){
    if (!ORB.view) return;
    if (koDirty || now - koT > 1000) readKeepOut(now);          // first: nothing written yet this frame
    helmFrame();
    combatStatus(now);
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
    else if (kind === 'helm:helm') { log('HELM · MANUAL CONTROL · ORBIT ASSIST ' + (HELM.assist ? 'ON' : 'OFF'), true); AUDIO.select(); }
    else if (kind === 'helm:auto') { log(arg.why === 'idle' ? 'AUTOPILOT ENGAGED · NO INPUT · RETURNING TO STATION' : 'AUTOPILOT · RETURNING TO STATION'); AUDIO.blip(0.8); }
    else if (kind === 'helm:station') log('STATION KEEPING · DAWN–DUSK ORBIT · ' + num(ORB.ship.h/1e3) + ' km');
    else if (kind === 'helm:view') log(arg.view === 'chase' ? 'VIEW · CHASE CAMERA' : arg.view === 'hull' ? 'VIEW · HULL CAMERA' : 'VIEW · COCKPIT');
    else if (kind.startsWith('combat:')) combatPoke(kind.slice(7), arg || {});
    else if (kind === 'helm:assist') log('ORBIT ASSIST ' + (arg.on ? 'ON · LET GO TO SETTLE INTO ORBIT' : 'OFF · NEWTONIAN FLIGHT'), !arg.on);
    else if (kind === 'helm:track') log(arg.on ? 'TRACKING GARGANTUA' : 'TRACKING OFF');
    else if (kind === 'helm:skip') { log('ATMOSPHERIC SKIP · HULL TEMP NOMINAL', true); AUDIO.ping(); }
  }

  return {bootStatus, online: onlineReq, fallback, frame, poke, restored, log, stick};
})();
