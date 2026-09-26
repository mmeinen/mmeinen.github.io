'use strict';
// film.js — COLLIDE as a film. Acts: the galaxies collide -> warp to the merged hole, Gargantua -> the fleets
// collide over its world -> a wreck falls and we follow it to the ground -> EVERYTHING COLLIDES -> loop.
// Any real input hands the camera to the viewer; the film resumes after a quiet spell.

const FILM = {on: false, started: false, act: null, t: 0, loop: 0, lastUser: -1e9, muted: false, beats: {}, aspect: 2.39};
const ACTS = ['galaxies', 'approach', 'battle', 'descent', 'title'];
const $f = id => document.getElementById(id);

// ------------------------------------------------------------------------------ captions & titles
let capT = 0;
function filmCaption(big, small, dur = 5){
  const el = $f('fcap'); el.innerHTML = '<div class="b">' + big + '</div>' + (small ? '<div class="s">' + small + '</div>' : '');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(capT); capT = setTimeout(() => el.classList.remove('show'), dur*1000);
}
function filmTitle(t, s, dur = 6){
  const el = $f('ftitle'); el.innerHTML = '<div class="t">' + t + '</div>' + (s ? '<div class="s">' + s + '</div>' : '');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur*1000);
}
function flash(k = 1){ const el = $f('fflash'); el.style.transition = 'none'; el.style.opacity = Math.min(1, k); void el.offsetWidth; el.style.transition = 'opacity 1.4s'; el.style.opacity = 0; }
function fade(to, ms = 900){ const el = $f('ffade'); el.style.transition = 'opacity ' + ms + 'ms'; el.style.opacity = to; }
function aspect(a){ FILM.aspect = a; document.documentElement.style.setProperty('--bar', a >= 2.3 ? 'calc((100vh - 100vw/2.39)/2)' : 'calc((100vh - 100vw/1.9)/2)'); }

// ------------------------------------------------------------------------------ acts
function startAct(name){
  FILM.act = name; FILM.t = 0; FILM.beats = {};
  if (name === 'galaxies') {
    BATTLE.on = false; cam.free = null;
    const sc = FILM.loop % 2 ? 1 : 0;                        // alternate MW x Andromeda / the Antennae
    reset(sc); paused = false; settings.follow = true; settings.auto = false; settings.speed = 1.2;
    cam.fov = deg(50); aspect(2.39); FILM.plunge = null;
    cam.dist = 34; cam.pitch = 0.32;
    Score.mood('calm');
    const s = SCENARIOS[sc];
    filmTitle(s.title, s.sub, 7);
  } else if (name === 'approach') {
    // the fleet is already there, frozen, while we fall in from ~2500 M: the lensing is traced live each frame
    paused = false; settings.speed = 1; aspect(2.39);
    bhDevPlanet(); arenaSetup(4.5e5, 0.2); battleSetup(); BATTLE.on = true; BATTLE.hold = true;
    FILM.appr = approachPath(); approachCamera(0);
    Score.mood('wonder'); Score.whoosh();
    setTimeout(() => filmTitle('GARGANTUA', 'THE MERGED BLACK HOLE · A HUNDRED MILLION SUNS', 7), 1400);
  } else if (name === 'battle') {
    if (!FILM.arrived) { flash(1); Score.boom(1.2); bhDevPlanet(); arenaSetup(4.5e5, 0.2); battleSetup(); }
    else Score.boom(0.9);
    FILM.arrived = false; Score.braam();
    BATTLE.on = true; BATTLE.hold = false; BATTLE.manual = null;
    paused = false;                  // the world keeps turning under the fleets (the galaxy sim is not stepped when deep)
    settings.speed = 1; battleCamera();
    Score.mood('tension');
  } else if (name === 'descent') {
    BATTLE.on = false; cam.free = null; paused = false; cam.fov = deg(50);
    if (!deep.sys || !deep.sys.bh) { bhDevPlanet(); arenaSetup(4.5e5, 0.2); cam.free = null; }
    // hand the camera to the deep zoom: above the arena point, then fly to the surface
    const up = ARENA.Y, W2L = M3.T(bodyL2W(1, deep.sysT)), loc = M3.vec(W2L, up);
    cam.yaw = Math.atan2(loc[0], loc[2]); cam.pitch = Math.asin(clamp(loc[1], -1, 1));
    deep.focus = 2; deep.body = 1; deep.glide = null; deep.D = deep.sys.bodies[1].R + 4.5e5;
    flyTo('surface'); if (flight) flight.dur = 16;
    Score.mood('wonder');
    filmCaption('MILLER', 'ONE WORLD · A HUNDRED MILLION SUNS ABOVE', 6);
  } else if (name === 'title') {
    aspect(1.9);
    filmTitle('EVERYTHING COLLIDES', 'GALAXIES · BLACK HOLES · FLEETS · WORLDS — ALL SIMULATED LIVE ON YOUR GPU', 8);
    Score.braam();
  }
}
function nextAct(){
  if (FILM.act === 'transition') return;                  // a fade is already under way
  const i = ACTS.indexOf(FILM.act), n = ACTS[(i + 1) % ACTS.length];
  if (n === 'galaxies') FILM.loop++;
  fade(1, 700);
  setTimeout(() => { startAct(n); fade(0, 1100); }, 720);
  FILM.act = 'transition';
}
function beat(k, cond, fn){ if (!FILM.beats[k] && cond) { FILM.beats[k] = true; fn(); } }

function filmStep(fdt){
  if (!FILM.on || FILM.act === 'transition' || !FILM.act) return;
  FILM.t += fdt;
  const t = FILM.t;
  if (FILM.act === 'galaxies' && FILM.plunge != null) {
    const s = Math.min(1, (t - FILM.plunge)/3.6), e = s*s*(3 - 2*s);
    settings.follow = false; settings.speed += (0.3 - settings.speed)*Math.min(1, fdt*3);
    const A = cores[QSO.a], B = cores[QSO.b];
    const c = QSO.t0 >= 0 && A.active && B.active ? V.mul(V.add(V.mul(A.x, A.g.m), V.mul(B.x, B.g.m)), 1/(A.g.m + B.g.m)) : comCores();
    cam.target = lerp3(cam.target, c, Math.min(1, fdt*3));
    cam.dist = Math.exp(Math.log(FILM.pd0) + (Math.log(GAL_MIN*1.05) - Math.log(FILM.pd0))*e);
    const w = $f('fflash'); w.style.transition = 'none'; w.style.opacity = smooth01((s - 0.55)/0.45);
    if (s >= 1) { FILM.plunge = null; FILM.act = 'transition'; startAct('approach'); flash(1); }
    return;
  }
  if (FILM.act === 'galaxies') {
    // cinematic time: brisk approach, slow motion through each passage, then the merger
    const P1 = FILM.loop % 2 ? 12.7 : 19.9, P2 = FILM.loop % 2 ? 25.2 : 34.5, M = FILM.loop % 2 ? 33.4 : 39.8;
    const near = x => Math.abs(simT - x) < 1.3;
    const tgt = near(P1) ? 0.3 : near(P2) ? 0.45 : simT > M ? 0.8 : 1.35;
    settings.speed += (tgt - settings.speed)*Math.min(1, fdt*2);
    // never closer than ~18 units: the gas sprites' RGBA32F blend is fill-bound (55 ms at 13 units on the iGPU)
    const want = simT < P1 - 4 ? 32 : simT < P1 + 3 ? 19 : simT < P2 - 3 ? 26 : 18;
    cam.dist += (want - cam.dist)*Math.min(1, fdt*0.35);
    cam.yaw += fdt*0.035; cam.pitch += ((simT > P1 ? 0.55 : 0.32) - cam.pitch)*fdt*0.2;
    beat('p1', simT > P1 - 1.2, () => { filmCaption('FIRST PASSAGE', Math.round(P1*MYR_PER_T) + ' MILLION YEARS · TIDES TEAR THE DISCS OPEN'); Score.mood('tension'); });
    beat('p1b', simT > P1, () => { Score.boom(1); shake(0.5); });
    beat('sb', simT > P1 + 4, () => filmCaption('STARBURST', 'SHOCKED GAS IGNITES — A MILLION NEW SUNS'));
    beat('p2', simT > P2 - 0.8, () => { filmCaption('SECOND PASSAGE', 'THEY FALL BACK TOGETHER'); Score.boom(0.8); });
    beat('m', simT > M, () => { filmCaption('THE CORES MERGE', 'TWO SUPERMASSIVE BLACK HOLES BECOME ONE'); Score.braam(); flash(0.35); });
    beat('go', simT > M + 5, () => { FILM.plunge = t; FILM.pd0 = cam.dist; Score.whoosh(); filmCaption('INTO THE HEART', 'WHERE TWO BLACK HOLES BECAME ONE', 4); });
  } else if (FILM.act === 'approach') {
    const s = Math.min(1, t/12);
    approachCamera(s);
    if (s >= 1) { FILM.arrived = true; startAct('battle'); }
  } else if (FILM.act === 'battle') {
    const T = BATTLE.t;
    beat('warp', T > 6.2, () => { filmCaption('HOSTILE FLEET', 'DROPPING OUT OF WARP'); Score.whoosh(); });
    beat('fire', T > 10.5, () => { Score.mood('battle'); });
    beat('lance', T > 58, () => filmCaption('ARGO', 'SPINAL LANCE CHARGING'));
    beat('imax', T > 63.5, () => aspect(1.9));
    beat('ty', T > 69.4, () => { Score.braam(); shake(1); });
    beat('imax2', T > 80, () => aspect(2.39));
    for (const e of BATTLE.events.splice(0)) Score.event(e);
    if (BATTLE.done) beat('end', true, nextAct);
  } else if (FILM.act === 'descent') {
    beat('land', !flight && t > 4, () => { filmCaption('THREE KILOMETRES UP', "GOLDEN HOUR UNDER GARGANTUA'S DISC", 7); });
    beat('go', (!flight && t > 13) || t > 34, nextAct);
  } else if (FILM.act === 'title') {
    beat('go', t > 9, () => { aspect(2.39); nextAct(); });
  }
}
// The approach: from ~2500 M out, behind the planet and a little to its side (so the world hangs beside the
// hole, as in the Interstellar still), distance falling logarithmically; in the last stretch the camera swings
// up over the night side onto the battle's first shot, so the hand-over is seamless.
function approachPath(){
  const P = bodyPos(1, deep.sysT), toBH = V.norm(V.mul(P, -1)), Mm = BH.M_KM*1e3, D0 = 2500*Mm;
  const side = V.norm(V.cross(toBH, [0, 1, 0]));
  const E0 = V.add(P, V.add(V.add(V.mul(toBH, -D0), V.mul(side, 0.13*D0)), V.mul([0, 1, 0], 0.05*D0)));
  const s0 = BATTLE_SHOTS[0][2](0), E1 = arenaToS(s0.pos), f1 = V.norm(arenaDir(V.sub(s0.look, s0.pos)));
  return {P, E1, f1, fov1: s0.fov, d0: V.len(V.sub(E0, P)), d1: V.len(V.sub(E1, P)), dir0: V.norm(V.sub(E0, P)), dir1: V.norm(V.sub(E1, P))};
}
function approachCamera(s){
  // two falls with a held breath between: Gargantua swells (2500 M -> 15 M), then the dive to the world
  const A = FILM.appr, Mm = BH.M_KM*1e3, L0 = Math.log10(A.d0/Mm), Lm = Math.log10(15), L1 = Math.log10(A.d1/Mm);
  const Ls = s < 0.45 ? L0 + (Lm - L0)*smooth01(s/0.45) : Lm + (L1 - Lm)*smooth01((s - 0.45)/0.55);
  const d = Math.pow(10, Ls)*Mm;
  const k = smooth01((s - 0.78)/0.22);
  const dir = V.norm(V.add(V.mul(A.dir0, 1 - k), V.mul(A.dir1, k)));
  const eye = V.add(A.P, V.mul(dir, d));
  const f = V.norm(V.add(V.mul(V.norm(V.mul(eye, -1)), 1 - k), V.mul(A.f1, k)));
  const up = V.norm(V.add(V.mul([0, 1, 0], 1 - k), V.mul(ARENA.Y, k)));
  const r = V.norm(V.cross(f, up)), u = V.cross(r, f);
  const rel = V.mul(V.sub(eye, ARENA.A), 1e-3);
  cam.free = {eye, r, u, f, arena: [V.dot(rel, ARENA.X), V.dot(rel, ARENA.Y), V.dot(rel, ARENA.Z)]};
  cam.fov = (40 + (A.fov1 - 40)*k)*Math.PI/180;
}
// small camera shake for impacts (galaxy view and battle both read cam.shake)
function shake(k){ FILM.shake = Math.max(FILM.shake || 0, k); }

// ------------------------------------------------------------------------------ manual takeover
function userInput(){
  FILM.lastUser = performance.now();
  // the battle keeps playing; input there grabs an orbit camera around the flagship (see battleCamera)
  if (FILM.act === 'battle') { if (!BATTLE.manual) battleGrab(); return; }
  if (FILM.act === 'transition' || FILM.act === 'approach') return;
  if (FILM.on && FILM.started) { FILM.on = false; document.body.classList.add('manual'); settings.speed = 1; }
}
function resumeFilm(){ document.body.classList.remove('manual'); FILM.on = true; fade(1, 500); setTimeout(() => { startAct(FILM.act && ACTS.includes(FILM.act) ? FILM.act : 'galaxies'); fade(0, 900); }, 520); }
function filmIdle(now){
  if (FILM.started && !FILM.on && now - FILM.lastUser > 30000) resumeFilm();
}

// ------------------------------------------------------------------------------ the score (all synthesized)
const Score = (() => {
  let ac = null, out, wet, dry, pad = [], padF, sub, noise, muted = false, moodName = 'calm', lastZap = 0;
  const midi = n => 440*Math.pow(2, (n - 69)/12);
  const CH = {calm: [38, 45, 52, 57, 64], tension: [34, 41, 50, 53, 60], battle: [36, 43, 51, 55, 62], wonder: [50, 57, 62, 64, 69]};
  function ir(sec){ const n = ac.sampleRate*sec, b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const x = i/n; lp += ((Math.random()*2 - 1) - lp)*(0.5 - 0.4*x); d[i] = lp*Math.pow(1 - x, 2.4)*(i < 400 ? i/400 : 1); } }
    return b; }
  function start(){
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      out = ac.createGain(); out.gain.value = muted ? 0 : 0.8; out.connect(comp); comp.connect(ac.destination);
      const rv = ac.createConvolver(); rv.buffer = ir(5.5); wet = ac.createGain(); wet.gain.value = 0.55; wet.connect(rv); rv.connect(out);
      dry = ac.createGain(); dry.gain.value = 0.9; dry.connect(out);
      const nb = ac.createBuffer(1, ac.sampleRate*2, ac.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random()*2 - 1; noise = nb;
      padF = ac.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 700; padF.Q.value = 0.8;
      const pg = ac.createGain(); pg.gain.value = 0.05; padF.connect(pg); pg.connect(dry); pg.connect(wet);
      for (let v = 0; v < 5; v++) for (const dt of [-7, 7]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.detune.value = dt; o.frequency.value = midi(CH.calm[v]); o.connect(padF); o.start(); pad.push({o, v}); }
      sub = ac.createOscillator(); sub.frequency.value = midi(26); const sg = ac.createGain(); sg.gain.value = 0.12; sub.connect(sg); sg.connect(dry); sub.start();
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.05; const lg = ac.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(padF.frequency); lfo.start();
    } catch (e) { console.warn(e); ac = null; }
  }
  function mood(name){
    moodName = name; if (!ac) return;
    const ch = CH[name] || CH.calm, t = ac.currentTime;
    for (const p of pad) p.o.frequency.setTargetAtTime(midi(ch[p.v]), t, 1.2);
    padF.frequency.setTargetAtTime(name === 'battle' ? 1500 : name === 'tension' ? 1000 : name === 'wonder' ? 1800 : 650, t, 2);
  }
  function env(g, t, a, peak, dec){ g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function boom(size = 1, pan = 0){
    if (!ac) return; const t = ac.currentTime;
    const o = ac.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(26, t + 1.5);
    const g = ac.createGain(); env(g, t, 0.01, 0.7*Math.min(size, 1.5), 3.2); o.connect(g); g.connect(dry); g.connect(wet); o.start(t); o.stop(t + 3.5);
    const n = ac.createBufferSource(); n.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.2);
    const ng = ac.createGain(); env(ng, t, 0.005, 0.45*Math.min(size, 1.5), 1.6); const pn = ac.createStereoPanner(); pn.pan.value = pan;
    n.connect(f); f.connect(ng); ng.connect(pn); pn.connect(dry); pn.connect(wet); n.start(t); n.stop(t + 1.8);
  }
  function braam(){
    if (!ac) return; const t = ac.currentTime;
    const ws = ac.createWaveShaper(), c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i/511.5 - 1; c[i] = Math.tanh(2.2*x); } ws.curve = c;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(140, t); lp.frequency.exponentialRampToValueAtTime(1300, t + 0.2); lp.frequency.exponentialRampToValueAtTime(260, t + 3);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.06); g.gain.setValueAtTime(0.32, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    for (const f of [36.7, 73.4, 110, 146.8]) for (const d of [-9, 9]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(ws); o.start(t); o.stop(t + 4.6); }
    ws.connect(lp); lp.connect(g); g.connect(dry); g.connect(wet);
  }
  function whoosh(){
    if (!ac) return; const t = ac.currentTime, n = ac.createBufferSource(); n.buffer = noise; n.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3500, t + 1.2);
    const g = ac.createGain(); env(g, t, 0.9, 0.25, 1.2); n.connect(f); f.connect(g); g.connect(wet); g.connect(dry); n.start(t); n.stop(t + 2.4);
  }
  function zap(team, dist){
    if (!ac) return; const t = ac.currentTime; if (t - lastZap < 0.07) return; lastZap = t;
    const o = ac.createOscillator(); o.type = team ? 'sawtooth' : 'square'; const f0 = team ? 700 : 1100;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0*0.25, t + 0.18);
    const g = ac.createGain(); env(g, t, 0.004, 0.05/Math.max(1, dist), 0.2); const lp = ac.createBiquadFilter(); lp.frequency.value = 2400;
    o.connect(lp); lp.connect(g); g.connect(dry); g.connect(wet); o.start(t); o.stop(t + 0.25);
  }
  function event(e){
    if (!ac) return;
    const cp = cam.free ? cam.free.arena : null;
    if (e.type === 'boom') { const d = cp ? V.len(V.sub(e.p, cp)) : 10; if (e.size > 0.04 && Math.random() < 0.6) boom(Math.min(1.6, e.size*8/Math.max(1, d*0.3)), 0); }
    else if (e.type === 'warp' && e.big) whoosh();
    else if (e.type === 'lance') { braam(); boom(1.4); }
    else if (e.type === 'destroyed') boom(1.6);
  }
  return {start, mood, boom, braam, whoosh, zap, event,
    mute(m){ muted = m; if (out) { out.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.2); if (!m) ac.resume(); } },
    kick(){ if (ac && ac.state === 'suspended' && !muted) ac.resume(); },
    get muted(){ return muted; }, suspend(){ if (ac) ac.suspend(); }, resume(){ if (ac && !muted) ac.resume(); }};
})();

// ------------------------------------------------------------------------------ boot glue
function filmBegin(){
  if (FILM.started) return;
  FILM.started = true; FILM.on = true;
  document.body.classList.add('playing');
  Score.start();
  aspect(2.39);
  $f('gate').classList.add('gone');
  startAct('galaxies');
}
function filmInit(){
  $f('gate').onclick = filmBegin;
  $f('iNext').onclick = e => { e.stopPropagation(); if (!FILM.on) { document.body.classList.remove('manual'); FILM.on = true; } nextAct(); };
  $f('iMute').onclick = e => { e.stopPropagation(); Score.mute(!Score.muted); $f('iMute').classList.toggle('off', Score.muted); };
  $f('iFull').onclick = e => { e.stopPropagation(); const d = document.documentElement; if (!document.fullscreenElement) d.requestFullscreen && d.requestFullscreen(); else document.exitFullscreen(); };
  $f('iResume').onclick = e => { e.stopPropagation(); resumeFilm(); };
  const markUser = e => { Score.kick(); if (e.target && e.target.closest && e.target.closest('.ficon, #gate')) return; if (FILM.started) userInput(); };
  cv.addEventListener('pointerdown', markUser); cv.addEventListener('wheel', markUser, {passive: true});
  let px = null;
  cv.addEventListener('pointermove', e => {
    const M = BATTLE.manual;
    if (M && e.buttons && px) { M.yaw -= (e.clientX - px[0])*0.005; M.pitch = clamp(M.pitch + (e.clientY - px[1])*0.005, -1.45, 1.45); FILM.lastUser = performance.now(); }
    px = [e.clientX, e.clientY];
  });
  cv.addEventListener('wheel', e => { const M = BATTLE.manual; if (M) { M.dist = clamp(M.dist*Math.exp(clamp(e.deltaY, -300, 300)*0.002), 0.08, 45); FILM.lastUser = performance.now(); } }, {passive: true});
  addEventListener('keydown', e => {
    if (e.repeat) return;
    Score.kick();
    if (!FILM.started) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); filmBegin(); } return; }
    if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') { $f('iNext').click(); return; }
    if (e.key === 'm' || e.key === 'M') { $f('iMute').click(); return; }
    if (e.key === 'f' || e.key === 'F') { $f('iFull').click(); return; }
    if (e.key !== 'h' && e.key !== 'H') userInput();
  });
  document.addEventListener('visibilitychange', () => document.hidden ? Score.suspend() : Score.resume());
  const q = new URLSearchParams(location.search);
  if (q.get('gate') === '0') filmBegin();
}
