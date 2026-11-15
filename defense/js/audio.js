'use strict';
// audio.js — PLANET DEFENSE's sound: synthesized WebAudio, nothing loaded (the page opens from file://). ON by default here
// (it is a game; the flight deck's menu starts silent), remembered, and like every page it waits for the first gesture.
//
// Everything goes through a compressor and a short convolution reverb. The score is the flight deck's language (hud.js
// AUDIO.combat): a clock that ticks faster as the threat grows, a low drone, a Shepard tone under a boss, a BRAAM when a
// capital ship arrives, silence at a capital's death and an organ after it; a pad between waves. Effects are placed by
// distance from the camera (sector metres) so a fight across the sector is a rumble and one beside you is a slam.

const AUDIO = (() => {
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };
  let on = safe(() => localStorage.getItem('meinen.defense.audio') !== '0', true);
  let ac = null, out = null, bus = null, wet = null, music = null, noise = null, pad = null, drone = null, shepG = null, shep = [];
  let tickP = 0, tickT = 0, ph = 0, heart = false, hbT = 0;
  const last = {};
  function init(){
    if (ac) return true;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return false; }
    out = ac.createGain(); out.gain.value = on ? 0.85 : 0; out.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(out);
    bus = ac.createGain(); bus.connect(comp);
    const n = ac.sampleRate*2.6, ir = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const x = i/n; lp += ((Math.random()*2 - 1) - lp)*(0.5 - 0.4*x); d[i] = lp*Math.pow(1 - x, 2.6); } }
    const rv = ac.createConvolver(); rv.buffer = ir; wet = ac.createGain(); wet.gain.value = 0.42; wet.connect(rv); rv.connect(bus);
    const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random()*2 - 1; noise = nb;
    music = ac.createGain(); music.gain.value = 1; music.connect(bus); music.connect(wet);
    // the pad (between waves): a soft fifth through a slow filter; the drone and the Shepard tone (battle)
    pad = ac.createGain(); pad.gain.value = 0; const pl = ac.createBiquadFilter(); pl.type = 'lowpass'; pl.frequency.value = 600; pl.Q.value = 0.7; pl.connect(pad); pad.connect(music);
    for (const [f, t] of [[110, 'sine'], [110.4, 'triangle'], [164.8, 'sine'], [220.3, 'sine'], [329.6, 'sine']]) { const o = ac.createOscillator(), g = ac.createGain(); o.type = t; o.frequency.value = f; g.gain.value = f > 300 ? 0.08 : 0.22; o.connect(g); g.connect(pl); o.start(); }
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 260; lfo.connect(lg); lg.connect(pl.frequency); lfo.start();
    drone = ac.createGain(); drone.gain.value = 0; const dl = ac.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 230; dl.connect(drone); drone.connect(music);
    for (const f of [55, 55.35, 82.4]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(dl); o.start(); }
    shepG = ac.createGain(); shepG.gain.value = 0; shepG.connect(music);
    for (let i = 0; i < 6; i++) { const o = ac.createOscillator(), g = ac.createGain(); g.gain.value = 0; o.connect(g); g.connect(shepG); o.start(); shep.push({o, g}); }
    return true;
  }
  const live = () => on && ac && ac.state === 'running';
  function set(v){ on = v; safe(() => localStorage.setItem('meinen.defense.audio', v ? '1' : '0')); if (v) init(); if (ac) { if (v) ac.resume(); out.gain.setTargetAtTime(v ? 0.85 : 0, ac.currentTime, 0.1); } }
  const GEST = ['pointerup', 'click', 'keydown'];
  const first = () => { if (!on) return; init(); if (ac && ac.state !== 'running') ac.resume(); if (ac && ac.state === 'running') GEST.forEach(t => removeEventListener(t, first, true)); };
  GEST.forEach(t => addEventListener(t, first, true));
  // ---- voices
  function tone(freq, dur, gain, type = 'sine', slide = 0, delay = 0, dest){
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || bus); o.start(t); o.stop(t + dur + 0.05);
  }
  function nz(t, dur, f, q, gain, type, dest, f1){
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; const b = ac.createBiquadFilter(); b.type = type || 'bandpass'; b.frequency.setValueAtTime(f, t); b.Q.value = q;
    if (f1) b.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(b); b.connect(g); g.connect(dest || bus); s.start(t, Math.random()*0.5); s.stop(t + dur + 0.02);
  }
  function thud(t, f0, f1, dur, gain, dest){ const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest || bus); o.start(t); o.stop(t + dur + 0.05); }
  function braam(k = 1){
    const t = ac.currentTime, ws = ac.createWaveShaper(), c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = Math.tanh(2.2*(i/511.5 - 1)); ws.curve = c;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(140, t); lp.frequency.exponentialRampToValueAtTime(1300, t + 0.2); lp.frequency.exponentialRampToValueAtTime(260, t + 3);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3*k, t + 0.06); g.gain.setValueAtTime(0.3*k, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    for (const f of [36.7, 73.4, 110, 146.8]) for (const d of [-9, 9]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(ws); o.start(t); o.stop(t + 4.6); }
    ws.connect(lp); lp.connect(g); g.connect(music);
  }
  function organ(notes, delay, len, lvl){
    const t = ac.currentTime + delay, g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lvl, t + len*0.26); g.gain.setValueAtTime(lvl, t + len*0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(music);
    for (const f of notes) for (const [m, a] of [[1, 1], [2, 0.4], [4, 0.15]]) { const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = f*m; og.gain.value = a*0.2; o.connect(og); og.connect(g); o.start(t); o.stop(t + len + 0.2); }
  }
  const gate = (k, ms) => { const n = performance.now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return true; };
  const far = d => 1/(1 + (d || 0)/2600);                     // distance falloff (m)
  const delayOf = d => Math.min(0.5, (d || 0)/9000);
  const S = {
    ac(d){ if (!live() || !gate('ac', 55)) return; const t = ac.currentTime, k = far(d); thud(t, 180, 60, 0.07, 0.12*k); nz(t, 0.025, 3200, 1.4, 0.035*k); },
    pd(d){ if (!live() || !gate('pd', 60)) return; const t = ac.currentTime, k = far(d); thud(t, 240, 90, 0.05, 0.08*k); nz(t, 0.02, 4200, 1.8, 0.03*k); },
    hawk(d){ if (!live() || !gate('hawk', 70)) return; const t = ac.currentTime, k = far(d); thud(t, 300, 120, 0.04, 0.06*k); },
    rail(d){ if (!live() || !gate('rail', 90)) return; const t = ac.currentTime + delayOf(d)*0.3, k = far(d*0.6);
      nz(t, 0.35, 6000, 0.7, 0.28*k, 'highpass'); thud(t, 90, 26, 0.9, 0.45*k); tone(2400, 0.4, 0.05*k, 'sawtooth', 300, 0); nz(t + 0.05, 1.4, 900, 0.8, 0.12*k, 'lowpass', wet); },
    charge(d){ if (!live() || !gate('charge', 400)) return; const k = far(d); tone(180, 1.6, 0.03*k, 'sawtooth', 1400); },
    heavy(d){ if (!live() || !gate('heavy', 120)) return; const t = ac.currentTime, k = far(d); thud(t, 110, 30, 0.6, 0.35*k); nz(t, 0.4, 700, 0.9, 0.14*k, 'lowpass'); },
    salvo(d){ if (!live() || !gate('salvo', 200)) return; const t = ac.currentTime, k = far(d); for (let i = 0; i < 4; i++) nz(t + i*0.09, 0.9, 1800, 1.2, 0.08*k, 'bandpass', null, 400); },
    missile(d){ if (!live() || !gate('emsl', 300)) return; const t = ac.currentTime, k = far(d); nz(t, 1.2, 1200, 1.4, 0.1*k, 'bandpass', null, 300); },
    boom(size, d){ if (!live() || !gate('boom' + (size > 60 ? 'B' : 's'), size > 60 ? 60 : 35)) return; const t = ac.currentTime + delayOf(d), g = Math.min(0.9, (0.18 + size/150))*far(d);
      thud(t, 72, 22, 1 + size/200, g); nz(t, 0.7 + size/250, 380, 0.7, g*0.5, 'lowpass'); if (size > 100) nz(t, 2.6, 160, 0.6, g*0.5, 'lowpass', wet); },
    shield(d){ if (!live() || !gate('shield', 70)) return; const t = ac.currentTime, k = far(d); nz(t, 0.2, 3200, 0.8, 0.07*k, 'highpass'); thud(t, 540, 180, 0.18, 0.04*k); },
    hull(){ if (!live() || !gate('hull', 120)) return; const t = ac.currentTime; thud(t, 95, 30, 0.5, 0.35); nz(t, 0.4, 900, 1.4, 0.14); },
    warp(big, d){ if (!live() || !gate('warp', 90)) return; const t = ac.currentTime, k = far(d*0.5); nz(t, big ? 1.8 : 0.8, big ? 400 : 1600, 1.2, (big ? 0.3 : 0.1)*k, 'bandpass', null, big ? 60 : 300); if (big) thud(t + 0.05, 60, 24, 2.2, 0.4*k); },
    alarm(){ if (!live() || !gate('alarm', 900)) return; for (let i = 0; i < 3; i++) tone(880, 0.13, 0.05, 'sawtooth', 620, i*0.2); },
    klaxon(){ if (!live() || !gate('klaxon', 2500)) return; for (let i = 0; i < 2; i++) tone(440, 0.45, 0.06, 'square', 330, i*0.6); },
    build(){ if (!live()) return; const t = ac.currentTime; thud(t, 140, 60, 0.3, 0.2); tone(660, 0.12, 0.04, 'triangle', 0, 0.12); tone(990, 0.2, 0.04, 'triangle', 0, 0.22); },
    upgrade(){ if (!live()) return; [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 0.04, 'triangle', 0, i*0.07)); },
    sell(){ if (!live()) return; tone(784, 0.12, 0.04, 'triangle', 0, 0); tone(523, 0.2, 0.04, 'triangle', 0, 0.1); },
    coin(){ if (!live() || !gate('coin', 70)) return; tone(1760, 0.08, 0.018, 'triangle'); tone(2637, 0.12, 0.012, 'triangle', 0, 0.04); },
    deny(){ if (!live()) return; tone(180, 0.18, 0.06, 'square', 140); },
    blip(k = 1){ if (!live() || !gate('blip', 40)) return; tone(1320*k, 0.05, 0.03); },
    select(){ if (!live()) return; tone(660, 0.08, 0.04); tone(990, 0.11, 0.04, 'sine', 0, 0.06); },
    nova(){ if (!live()) return; const t = ac.currentTime; tone(90, 2.4, 0.06, 'sawtooth', 1800); nz(t, 2.4, 300, 2, 0.08, 'bandpass', null, 5000); },
    novaFire(){ if (!live()) return; const t = ac.currentTime; thud(t, 55, 18, 3.4, 0.9); nz(t, 2.2, 2400, 0.5, 0.5, 'lowpass', null, 120); nz(t, 4, 140, 0.7, 0.4, 'lowpass', wet); },
    lance(){ if (!live()) return; for (let i = 0; i < 8; i++) tone(1200, 0.06, 0.03, 'square', 0, i*0.18); },
    lanceFire(){ if (!live()) return; const t = ac.currentTime; thud(t, 70, 22, 2.6, 0.7); nz(t, 1.8, 5000, 0.4, 0.35, 'highpass', null, 400); nz(t, 3, 200, 0.8, 0.3, 'lowpass', wet); },
    sunder(){ if (!live()) return; const t = ac.currentTime; tone(40, 4, 0.2, 'sawtooth', 160); nz(t, 4, 120, 3, 0.1, 'bandpass', null, 900); },
    sunderFire(){ if (!live()) return; const t = ac.currentTime; thud(t, 48, 16, 3, 0.9); nz(t, 2.4, 600, 0.6, 0.45, 'lowpass', null, 80); },
    breach(){ if (!live() || !gate('breach', 500)) return; const t = ac.currentTime + 2.4; thud(t, 50, 20, 2.4, 0.5); nz(t, 2.2, 260, 0.6, 0.2, 'lowpass', wet); },
  };
  // ---- the score
  function cue(k){
    if (!live()) return;
    const t = ac.currentTime, set = (p, v, tau) => p.setTargetAtTime(v, t, tau);
    if (k === 'title') { tickP = 0; set(pad.gain, 0.05, 3); set(drone.gain, 0, 2); set(shepG.gain, 0, 2); }
    else if (k === 'build') { tickP = 0; heart = false; set(pad.gain, 0.06, 2.5); set(drone.gain, 0.012, 3); set(shepG.gain, 0, 1.5); }
    else if (k === 'wave') { tickP = 0.9; set(pad.gain, 0.012, 2); set(drone.gain, 0.055, 1); set(shepG.gain, 0.008, 3); }
    else if (k === 'capital') { tickP = 0.62; braam(); set(drone.gain, 0.07, 0.5); set(shepG.gain, 0.022, 4); }
    else if (k === 'boss') { tickP = 0.45; braam(1.3); setTimeout(() => { if (live()) braam(1); }, 2600); set(drone.gain, 0.085, 0.5); set(shepG.gain, 0.04, 3); }
    else if (k === 'kill') {
      music.gain.cancelScheduledValues(t); music.gain.setValueAtTime(0.0001, t); music.gain.setTargetAtTime(1, t + 1.1, 0.4);
      thud(t, 42, 20, 3.5, 0.5); organ([110, 164.8, 220, 261.6, 329.6], 1.2, 10, 0.06);
    }
    else if (k === 'clear') { tickP = 0; set(drone.gain, 0.01, 2); set(shepG.gain, 0, 1.5); organ([130.8, 196, 261.6, 329.6, 392], 0.2, 7, 0.05); set(pad.gain, 0.05, 4); }
    else if (k === 'victory') { tickP = 0; set(drone.gain, 0, 1); set(shepG.gain, 0, 1); organ([98, 146.8, 196, 246.9, 293.7, 392], 0.5, 14, 0.09); organ([130.8, 196, 261.6, 329.6, 392, 523.3], 5.5, 12, 0.08); }
    else if (k === 'defeat') { tickP = 0; heart = false; set(pad.gain, 0, 1); set(shepG.gain, 0, 0.3); set(drone.gain, 0.09, 0.3); setTimeout(() => { if (live()) { set(drone.gain, 0, 4); organ([55, 82.4, 110, 130.8], 1, 12, 0.07); } }, 3000); }
    else if (k === 'lull') { tickP = 0; set(shepG.gain, 0, 1.5); set(drone.gain, 0.02, 2); }
  }
  function frame(){
    if (!live()) return;
    const t = ac.currentTime;
    if (tickP > 0) { if (tickT < t) tickT = t + 0.05; while (tickT < t + 0.25) { nz(tickT, 0.03, 2900, 5, 0.08, 'bandpass', music); thud(tickT, 1300, 1150, 0.03, 0.03, music); tickT += tickP; } }
    ph = (ph + 1/600) % 1;
    for (let i = 0; i < 6; i++) { const x = (i + ph)/6, Sh = shep[i]; Sh.o.frequency.setTargetAtTime(55*Math.pow(2, 6*x), t, 0.05); Sh.g.gain.setTargetAtTime(0.5 - 0.5*Math.cos(2*Math.PI*x), t, 0.05); }
    if (heart && t > hbT) { hbT = t + 0.95; thud(t, 60, 40, 0.14, 0.35); thud(t + 0.22, 55, 38, 0.16, 0.26); }
  }
  return {get on(){ return on; }, set, sfx: S, cue, frame, crit(v){ heart = !!v; }, pause(p){ if (ac && on) out.gain.setTargetAtTime(p ? 0.25 : 0.85, ac.currentTime, 0.2); }};
})();
