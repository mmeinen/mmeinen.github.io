'use strict';
// ui.js — PLANET DEFENSE's HUD: the top bar (wave, credits, AEGIS, BASTION), the selection panel (BASTION's upgrade tracks, a
// platform's refit and sale, a contact's readout), the tactical plot, the threat board and the combat log, the command bar
// (build, squadrons, abilities, the wave, time), holographic symbology projected into the view (build slots, weapon
// ranges, contacts, the drop corridor, the next wave's inbound vectors), floating credits, title cards, the title / end /
// help screens, the save, and the war's sounds (audio.js).
//
// The war (war.js) is the only state; this reads it every frame and sends it commands. Clicks on the view arrive from
// main.js (it owns the gestures). Nothing here needs WebGL: without it UI.fallback() says so and offers the way back.

const UI = (() => {
  const $ = id => document.getElementById(id), body = document.body, NS = 'http://www.w3.org/2000/svg';
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const setA = (e, a) => { for (const k in a) { const v = String(a[k]); if (e.getAttribute(k) !== v) e.setAttribute(k, v); } };
  const setText = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };
  const show = (e, on) => { if (!e) return; const d = on ? '' : 'none'; if (e.style.display !== d) e.style.display = d; };
  const fmt = n => Math.floor(Math.max(0, n)).toLocaleString('en-US');
  const cr = n => '₡' + fmt(n);
  const pad2 = n => String(Math.floor(n)).padStart(2, '0');
  const clock = s => { s = Math.max(0, s); return Math.floor(s/60) + ':' + pad2(s % 60); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  let online = false, failed = false, started = false;
  let sel = null, mode = null, hov = {x: -1, y: -1, slot: -1, ent: null}, lastInfo = '', infoT = 0, sideT = 0;
  let diff = safe(() => localStorage.getItem('meinen.defense.diff'), null) || 'veteran';
  const W = () => WAR;

  // ---------------------------------------------------------------------------------------------- log
  const logEl = $('log');
  function log(text, cls){
    const m = document.createElement('div'); m.className = 'msg new' + (cls ? ' ' + cls : '');
    const ts = document.createElement('span'); ts.className = 'ts'; ts.textContent = WAR.phase === 'wave' ? 'W' + pad2(WAR.wave) + ' ' + clock(WAR.waveT) : 'BUILD';
    const tx = document.createElement('span'); tx.className = 'tx'; tx.textContent = text;
    m.append(ts, tx); logEl.appendChild(m);
    const all = logEl.querySelectorAll('.msg');
    all.forEach((x, i) => { if (x !== m) { x.classList.remove('new'); x.classList.toggle('old', i < all.length - 3); } });
    if (all.length > 6) all[0].remove();
  }
  // ---------------------------------------------------------------------------------------------- title cards
  let titleTimer = 0;
  function card(t, s, cls){
    const c = $('ctitle'); c.classList.remove('show', 'red', 'gold'); void c.offsetWidth;
    setText(c.querySelector('.t'), t); setText(c.querySelector('.s'), s || '');
    if (cls) c.classList.add(cls);
    c.classList.add('show'); clearTimeout(titleTimer); titleTimer = setTimeout(() => c.classList.remove('show'), 4800);
  }
  // ---------------------------------------------------------------------------------------------- floaters (+credits)
  const flo = [], floEl = $('floaters');
  function floater(p, text, cls){
    if (!p) return;
    let f = flo.find(q => !q.live);
    if (!f) { if (flo.length > 40) return; const d = document.createElement('div'); d.className = 'flo'; floEl.appendChild(d); f = {el: d}; flo.push(f); }
    f.live = true; f.p = p.slice(); f.t0 = performance.now(); f.el.textContent = text; f.el.className = 'flo ' + (cls || '');
  }
  function floFrame(now){
    for (const f of flo) {
      if (!f.live) continue;
      const a = (now - f.t0)/1400; if (a > 1) { f.live = false; f.el.style.opacity = 0; continue; }
      const s = projS(f.p); if (!s.front) { f.el.style.opacity = 0; continue; }
      f.el.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y - 18 - a*38).toFixed(1)}px) translate(-50%, -50%)`;
      f.el.style.opacity = a < 0.15 ? a/0.15 : 1 - Math.max(0, (a - 0.6)/0.4);
    }
  }

  // ---------------------------------------------------------------------------------------------- holographic symbology
  const holo = $('holo');
  const gCorr = el('g', {class: 'corr'}, holo), corrRing = el('path', {class: 'ring'}, gCorr), corrLine = el('path', {class: 'drop'}, gCorr), corrTx = el('text', {class: 'lbl'}, gCorr);
  corrTx.textContent = 'DROP CORRIDOR';
  const gPaths = el('g', {class: 'paths'}, holo), PATHS = [];
  for (let i = 0; i < 10; i++) { const g = el('g', {}, gPaths); PATHS.push({g, p: el('path', {class: 'vec'}, g), t: el('text', {class: 'lbl'}, g), t2: el('text', {class: 'lbl2'}, g)}); }
  const gRange = el('g', {class: 'range'}, holo), rangeSph = el('circle', {class: 'sph'}, gRange), rangeRing = el('path', {class: 'ring'}, gRange);
  const gSlots = el('g', {class: 'slots'}, holo), SLOTS = WAR_SLOTS.map(s => { const g = el('g', {}, gSlots); return {g, ring: el('path', {class: 'ring'}, g), plus: el('path', {class: 'plus'}, g), t: el('text', {class: 'lbl'}, g)}; });
  const gFr = el('g', {class: 'friends'}, holo), FR = [];
  const gFoe = el('g', {class: 'foes'}, holo), FOE = [];
  const gEdge = el('g', {class: 'edges'}, holo), EDGE = [];
  const gSel = el('g', {class: 'sel'}, holo), selBox = el('path', {class: 'box'}, gSel), selTx = el('text', {class: 'lbl'}, gSel);
  const hovTx = el('text', {class: 'hov'}, holo);
  function foeMark(i){
    while (FOE.length <= i) { const g = el('g', {}, gFoe); FOE.push({g, m: el('path', {class: 'm'}, g), t: el('text', {class: 'lbl'}, g), sb: el('rect', {class: 'sb'}, g), s: el('rect', {class: 's'}, g), hb: el('rect', {class: 'hb'}, g), h: el('rect', {class: 'h'}, g)}); }
    return FOE[i];
  }
  function frMark(i){
    while (FR.length <= i) { const g = el('g', {}, gFr); FR.push({g, m: el('path', {class: 'm'}, g), hb: el('rect', {class: 'hb'}, g), h: el('rect', {class: 'h'}, g), t: el('text', {class: 'lbl'}, g)}); }
    return FR[i];
  }
  function edgeMark(i){ while (EDGE.length <= i) { const g = el('g', {}, gEdge); EDGE.push({g, a: el('path', {class: 'a'}, g), t: el('text', {class: 'lbl'}, g)}); } return EDGE[i]; }
  // a 3D circle (centre c, radius r, spanned by unit u, v) projected: an SVG path with gaps where it passes behind the eye
  function ring3(c, r, u, v, n = 40){
    let d = '', pen = false;
    for (let i = 0; i <= n; i++) {
      const a = i/n*2*Math.PI, p = V.add(c, V.add(V.mul(u, r*Math.cos(a)), V.mul(v, r*Math.sin(a)))), s = projS(p);
      if (!s.front || Math.abs(s.x) > 2e4 || Math.abs(s.y) > 2e4) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + s.x.toFixed(1) + ' ' + s.y.toFixed(1); pen = true;
    }
    return d;
  }
  function polyPath(pts){ let d = '', pen = false; for (const p of pts) { const s = projS(p); if (!s.front) { pen = false; continue; } d += (pen ? 'L' : 'M') + s.x.toFixed(1) + ' ' + s.y.toFixed(1); pen = true; } return d; }
  function holoFrame(){
    const Wr = WAR, Wd = ORB.W, Ht = ORB.H;
    setA(holo, {viewBox: `0 0 ${Wd} ${Ht}`});
    const inGame = started && !failed;
    show(holo, inGame);
    if (!inGame) return;
    // the drop corridor: a ring at the breach height, a plumb line from BASTION
    const cy = WAR_T.BREACH_Y, hot = Wr.ents.some(e => e.alive && e.kind === 'bomber' && e.p[1] < cy + 2500);
    setA(corrRing, {d: ring3([300, cy, 0], WAR_T.GATE_R, [1, 0, 0], [0, 0, 1], 48), class: 'ring' + (hot ? ' hot' : '')});
    setA(corrLine, {d: polyPath([[0, -60, -20], [300, cy, 0]])});
    { const s = projS([300 + WAR_T.GATE_R*0.72, cy, WAR_T.GATE_R*0.72]); setA(corrTx, {x: s.x.toFixed(1), y: s.y.toFixed(1), opacity: s.front ? 1 : 0}); }
    // the next wave's inbound vectors, during the build phase
    const plan = Wr.phase === 'build' && !Wr.over ? nextPlan() : null;
    for (let i = 0; i < PATHS.length; i++) {
      const P = PATHS[i], g = plan && plan.g[i];
      if (!g) { show(P.g, false); continue; }
      show(P.g, true);
      const V0 = WAR_VEC[g.vec], c = WAR_CLS[g.cls], cap = c.kind === 'capital', start = cap ? V.mul(V0.c, 0.72) : V0.c;
      const end = cap ? V.mul(V.norm(V0.c), (c.stand[0] + c.stand[1])/2) : [300, cy, 0], mid = cap ? V.mul(V.add(start, end), 0.5) : V0.mid;
      const pts = []; for (let k = 0; k <= 24; k++) { const t = k/24, a = V.add(V.mul(start, (1 - t)*(1 - t)), V.add(V.mul(mid, 2*t*(1 - t)), V.mul(end, t*t))); pts.push(a); }
      setA(P.p, {d: polyPath(pts), class: 'vec ' + c.kind});
      // one label per vector, at its first group's start: every group on it listed
      const first = plan.g.findIndex(q => q.vec === g.vec) === i, s = projS(start), vis = s.front && first ? 1 : 0;
      setA(P.t, {x: s.x.toFixed(1), y: (s.y - 8).toFixed(1), opacity: vis}); setA(P.t2, {x: s.x.toFixed(1), y: (s.y + 7).toFixed(1), opacity: vis});
      if (first) { setText(P.t, plan.g.filter(q => q.vec === g.vec).map(q => q.n + ' × ' + WAR_CLS[q.cls].name).join(' · ')); setText(P.t2, 'VECTOR ' + V0.name); }
    }
    // build slots: every empty one while placing (the one under the cursor lit), else only the hovered one
    const building = mode && mode.kind === 'build';
    for (let i = 0; i < SLOTS.length; i++) {
      const S = Wr.slots[i], M = SLOTS[i], vis = !S.e && (building || hov.slot === i);
      show(M.g, vis); if (!vis) continue;
      const s = projS(S.p), r = 70;
      setA(M.ring, {d: ring3(S.p, r, [1, 0, 0], [0, 0, 1], 28), class: 'ring' + (hov.slot === i ? ' on' : '')});
      const k = Math.max(5, Math.min(12, r*pxPerM(s.z)*0.4));
      setA(M.plus, {d: s.front ? `M${(s.x - k).toFixed(1)} ${s.y.toFixed(1)}H${(s.x + k).toFixed(1)}M${s.x.toFixed(1)} ${(s.y - k).toFixed(1)}V${(s.y + k).toFixed(1)}` : '', class: 'plus' + (hov.slot === i ? ' on' : '')});
      setA(M.t, {x: s.x.toFixed(1), y: (s.y + k + 13).toFixed(1), opacity: s.front && hov.slot === i ? 1 : 0});
      setText(M.t, S.tag);
    }
    // range: the selected platform's, or the one being placed at the hovered slot (a sphere: its outline and its equator)
    let rc = null, rr = 0, rcls = '';
    if (building && hov.slot >= 0 && !Wr.slots[hov.slot].e) { rc = Wr.slots[hov.slot].p; rr = platRange(mode.type, 0); rcls = mode.type; }
    else if (sel && sel.alive && sel.kind === 'platform') { rc = sel.p; rr = sel.cls === 'aegis' ? sel.fieldR : platRange(sel.cls, sel.mk); rcls = sel.cls; }
    show(gRange, !!rc);
    if (rc) {
      const s = projS(rc), R = rr*pxPerM(Math.max(s.z, rr*0.2));
      setA(rangeSph, {cx: s.x.toFixed(1), cy: s.y.toFixed(1), r: s.front ? R.toFixed(1) : 0, class: 'sph ' + rcls});
      setA(rangeRing, {d: ring3(rc, rr, [1, 0, 0], [0, 0, 1], 64), class: 'ring ' + rcls});
    }
    // contacts: brackets and bars on capitals, marks on everything else; edge arrows for capitals and bombers off screen
    let nf = 0, nr = 0, ne = 0;
    const margin = 40;
    for (const e of Wr.ents) {
      if (!e.alive || e.arrive > Wr.t || e.docked || e.wreck) continue;
      const s = projS(e.kind === 'station' ? [0, 0, -20] : e.p), c = WAR_CLS[e.cls];
      if (e.team === 1) {
        if (e.dying >= 0) continue;
        const onS = s.front && s.x > -margin && s.x < Wd + margin && s.y > -margin && s.y < Ht + margin;
        if (!onS) {
          if (c.kind !== 'capital' && !(c.kind === 'bomber' && e.p[1] < WAR_T.BREACH_Y + 2600)) continue;
          const M = edgeMark(ne++); show(M.g, true);
          let dx = s.x - Wd/2, dy = s.y - Ht/2; if (!s.front) { dx = -dx; dy = -dy; }
          const k = Math.min((Wd/2 - 34)/Math.max(Math.abs(dx), 1e-3), (Ht/2 - 34)/Math.max(Math.abs(dy), 1e-3)), x = Wd/2 + dx*k, y = Ht/2 + dy*k, a = Math.atan2(dy, dx);
          const ca = Math.cos(a), sa = Math.sin(a), pt = (u, v) => (x + ca*u - sa*v).toFixed(1) + ' ' + (y + sa*u + ca*v).toFixed(1);
          setA(M.a, {d: `M${pt(9, 0)}L${pt(-6, 7)}L${pt(-3, 0)}L${pt(-6, -7)}Z`, class: 'a ' + c.kind});
          setA(M.t, {x: (x - ca*20).toFixed(1), y: (y - sa*20 + 3).toFixed(1)}); setText(M.t, c.kind === 'capital' ? c.name : '');
          continue;
        }
        const M = foeMark(nf++); show(M.g, true);
        const big = c.kind === 'capital';
        if (big) {
          const R = Math.max(14, wRad(e)*pxPerM(s.z)*0.8), q = R*0.3, x0 = s.x - R, x1 = s.x + R, y0 = s.y - R, y1 = s.y + R;
          setA(M.m, {d: `M${x0} ${y0 + q}V${y0}H${x0 + q}M${x1 - q} ${y0}H${x1}V${y0 + q}M${x1} ${y1 - q}V${y1}H${x1 - q}M${x0 + q} ${y1}H${x0}V${y1 - q}`, class: 'm capital' + (e === sel ? ' sel' : '')});
          setA(M.t, {x: x0.toFixed(1), y: (y0 - 16).toFixed(1)}); setText(M.t, c.name + (c.boss ? ' · BOSS' : ''));
          const bw = Math.max(56, 2*R), sk = e.shMax ? e.sh/e.shMax : 0, hk = Math.max(0, e.hp/e.hpMax);
          setA(M.sb, {x: x0.toFixed(1), y: (y0 - 11).toFixed(1), width: bw.toFixed(1), height: 3}); setA(M.s, {x: x0.toFixed(1), y: (y0 - 11).toFixed(1), width: (bw*sk).toFixed(1), height: 3});
          setA(M.hb, {x: x0.toFixed(1), y: (y0 - 6).toFixed(1), width: bw.toFixed(1), height: 3}); setA(M.h, {x: x0.toFixed(1), y: (y0 - 6).toFixed(1), width: (bw*hk).toFixed(1), height: 3});
          show(M.sb, true); show(M.s, true); show(M.hb, true); show(M.h, true);
        } else {
          const r = c.kind === 'bomber' ? (e.cls === 'mantis' ? 7 : 5) : 3.5;
          const d = c.kind === 'bomber' ? `M${s.x - r} ${s.y - r*0.7}H${s.x + r}L${s.x} ${s.y + r}Z` : `M${s.x} ${s.y - r}L${s.x + r} ${s.y}L${s.x} ${s.y + r}L${s.x - r} ${s.y}Z`;
          setA(M.m, {d, class: 'm ' + c.kind + (e.dive ? ' dive' : '') + (e === sel ? ' sel' : '')});
          setA(M.t, {x: (s.x + 8).toFixed(1), y: (s.y - 6).toFixed(1)}); setText(M.t, e === sel || e.dive ? c.name : '');
          show(M.sb, false); show(M.s, false); show(M.hb, false); show(M.h, false);
        }
      } else if (e.kind === 'platform' || e.cls === 'hawk') {
        if (!s.front) continue;
        const M = frMark(nr++); show(M.g, true);
        const hk = Math.max(0, e.hp/e.hpMax), hurt = hk < 0.98 || e === sel || (hov.ent === e);
        if (e.cls === 'hawk') { setA(M.m, {d: `M${s.x - 2.5} ${s.y}H${s.x + 2.5}`, class: 'm hawk'}); show(M.hb, false); show(M.h, false); setText(M.t, ''); continue; }
        const r = Math.max(7, wRad(e)*pxPerM(s.z));
        setA(M.m, {d: e === sel ? '' : `M${s.x - r} ${s.y + r + 4}H${s.x + r}`, class: 'm plat ' + e.cls + (e.deploy > Wr.t ? ' dep' : '')});
        show(M.hb, hurt); show(M.h, hurt);
        if (hurt) { const bw = Math.max(26, 2*r); setA(M.hb, {x: (s.x - bw/2).toFixed(1), y: (s.y + r + 7).toFixed(1), width: bw.toFixed(1), height: 3});
          setA(M.h, {x: (s.x - bw/2).toFixed(1), y: (s.y + r + 7).toFixed(1), width: (bw*hk).toFixed(1), height: 3, class: 'h' + (hk < 0.35 ? ' low' : '')}); }
        setA(M.t, {x: s.x.toFixed(1), y: (s.y - r - 6).toFixed(1)}); setText(M.t, hov.ent === e && e !== sel ? WAR_CLS[e.cls].name + ' MK ' + WAR_MK[e.mk] : '');
      }
    }
    for (let i = nf; i < FOE.length; i++) show(FOE[i].g, false);
    for (let i = nr; i < FR.length; i++) show(FR[i].g, false);
    for (let i = ne; i < EDGE.length; i++) show(EDGE[i].g, false);
    // the selection: corner brackets and its name
    const se = sel && sel.alive !== false ? sel : null, target = mode && mode.kind === 'target';
    show(gSel, !!se || target);
    if (se) {
      const s = projS(se.kind === 'station' ? [0, 0, -20] : se.p), R = Math.max(12, wRad(se)*pxPerM(s.z)*(se.kind === 'station' ? 0.8 : 1.1)), q = Math.min(R*0.35, 16);
      if (s.front) { const x0 = s.x - R, x1 = s.x + R, y0 = s.y - R, y1 = s.y + R;
        setA(selBox, {d: `M${x0} ${y0 + q}V${y0}H${x0 + q}M${x1 - q} ${y0}H${x1}V${y0 + q}M${x1} ${y1 - q}V${y1}H${x1 - q}M${x0 + q} ${y1}H${x0}V${y1 - q}`, class: 'box ' + (se.team ? 'foe' : 'own')});
        setA(selTx, {x: x0.toFixed(1), y: (y1 + 14).toFixed(1)}); setText(selTx, se.kind === 'station' ? '' : WAR_CLS[se.cls].name + (se.kind === 'platform' ? ' MK ' + WAR_MK[se.mk] : '')); }
      else { setA(selBox, {d: ''}); setText(selTx, ''); }
    } else { setA(selBox, {d: ''}); setText(selTx, ''); }
    // hover label (contacts, BASTION)
    const he = hov.ent;
    if (he && he.alive && he !== sel && (he.team === 1 || he.kind === 'station')) { const s = projS(he.kind === 'station' ? [0, 0, -20] : he.p); setA(hovTx, {x: (s.x + 14).toFixed(1), y: (s.y - 12).toFixed(1)}); setText(hovTx, WAR_CLS[he.cls].name); }
    else setText(hovTx, '');
  }
  function platRange(cls, mk){ const P = WAR_PLAT[cls]; return cls === 'aegis' ? P.radius[mk] : P.range[mk]*(WAR.rangeK || 1); }
  let planCache = null;
  function nextPlan(){ const n = WAR.wave + 1; if (!planCache || planCache.n !== n || planCache.diff !== WAR.diff) planCache = {n, diff: WAR.diff, plan: warWavePlan(n)}; return planCache.plan; }

  // ---------------------------------------------------------------------------------------------- picking
  function pickSlot(x, y){
    let best = -1, bd = 1e9;
    for (const S of WAR.slots) { if (S.e) continue; const s = projS(S.p); if (!s.front) continue; const d = Math.hypot(s.x - x, s.y - y), lim = Math.max(26, 70*pxPerM(s.z)*1.2);
      if (d < lim && d < bd) { bd = d; best = S.i; } }
    return best;
  }
  function pickEnt(x, y, team){
    let best = null, bd = 1e9;
    for (const e of WAR.ents) {
      if (!e.alive || e.arrive > WAR.t || e.docked || e.wreck || (e.dying >= 0 && e.kind !== 'station')) continue;
      if (team != null && e.team !== team) continue;
      const s = projS(e.kind === 'station' ? [0, 0, -20] : e.p); if (!s.front) continue;
      const R = Math.max(e.kind === 'fighter' ? 14 : 18, wRad(e)*pxPerM(s.z)*(e.kind === 'station' ? 0.75 : 1)), d = Math.hypot(s.x - x, s.y - y);
      if (d < R && d/R < bd) { bd = d/R; best = e; }
    }
    return best;
  }
  function hover(x, y){
    hov.x = x; hov.y = y;
    if (x < 0 || !started) { hov.slot = -1; hov.ent = null; return; }
    hov.slot = mode && mode.kind === 'build' ? pickSlot(x, y) : -1;
    if (hov.slot < 0) { const s = pickSlot(x, y); hov.slot = s >= 0 && (!mode) ? s : hov.slot; }
    hov.ent = mode && mode.kind === 'build' ? null : pickEnt(x, y, mode && mode.kind === 'target' ? 1 : null);
    body.classList.toggle('pointy', hov.slot >= 0 || !!hov.ent);
  }
  function click(x, y, o){
    if (!started) return;
    AUDIO.sfx.blip(0.8);
    if (mode && mode.kind === 'build') {
      const s = pickSlot(x, y);
      if (s >= 0) { const e = warBuild(s, mode.type); if (e) { select(e); if (!o.shift) setMode(null); } else { AUDIO.sfx.deny(); log('NOT ENOUGH CREDITS', 'warn'); } }
      else if (o.button === 2) setMode(null);
      return;
    }
    if (mode && mode.kind === 'target') {
      const e = pickEnt(x, y, 1);
      if (e) { if (warAbility(mode.ab, e)) setMode(null); else AUDIO.sfx.deny(); }
      else setMode(null);
      return;
    }
    const e = pickEnt(x, y, null);
    if (e) { select(e); if (o.dbl) camFocus(e, e.kind === 'station' ? 2600 : e.kind === 'capital' ? wRad(e)*5 : e.kind === 'platform' ? 420 : 180); return; }
    const s = pickSlot(x, y);
    if (s >= 0) { setMode({kind: 'build', type: lastBuild}); hov.slot = s; return; }
    if (o.dbl) { camFocus(null); camReset(); }
    select(null);
  }
  let lastBuild = 'sentinel';
  function setMode(m){
    mode = m; if (m && m.kind === 'build') lastBuild = m.type;
    body.classList.toggle('placing', !!(m && m.kind === 'build')); body.classList.toggle('targeting', !!(m && m.kind === 'target'));
    const M = $('mode');
    if (!m) { M.classList.remove('show'); }
    else if (m.kind === 'build') { M.innerHTML = 'DEPLOY <b>' + WAR_CLS[m.type].name + '</b> · ' + cr(WAR_PLAT[m.type].cost[0]) + ' · CLICK A GLOWING SLOT · SHIFT TO PLACE MORE · ESC CANCELS'; M.classList.add('show'); }
    else { M.innerHTML = '<b>' + (m.ab === 'nova' ? 'NOVA CANNON' : 'PLANETARY LANCE') + '</b> · CLICK A HOSTILE · ' + (m.ab === 'nova' ? 'Q' : 'E') + ' AGAIN FOR THE BIGGEST THREAT · ESC CANCELS'; M.classList.add('show'); }
    document.querySelectorAll('#cmd [data-build]').forEach(b => b.classList.toggle('on', !!(m && m.kind === 'build' && m.type === b.dataset.build)));
    document.querySelectorAll('#cmd [data-ab]').forEach(b => b.classList.toggle('on', !!(m && m.kind === 'target' && m.ab === b.dataset.ab)));
  }
  function select(e){
    sel = e && e.kind !== 'station' ? e : null; lastInfo = ''; infoT = 0;
    if (e) AUDIO.sfx.select();
  }

  // ---------------------------------------------------------------------------------------------- the selection panel
  const iBody = $('iBody');
  function bars(items){ return '<div class="bars">' + items.map(([k, v, max, cls]) => `<div class="br ${cls || ''}"><span class="k">${k}</span><span class="bar"><b data-bar="${cls}" style="width:${(100*clamp(v/Math.max(max, 1e-6), 0, 1)).toFixed(1)}%"></b></span><span class="n" data-num="${cls}">${fmt(v)}</span></div>`).join('') + '</div>'; }
  function infoFrame(now){
    if (now - infoT < 120) return; infoT = now;
    const Wr = WAR, st = Wr.station; if (!st) return;
    const e = sel && sel.alive !== false && !(sel.dying >= 0 && sel.kind !== 'station') && !sel.docked ? sel : null;
    if (sel && !e) sel = null;
    let sig, html, name, role, num;
    if (!e) {
      // BASTION: its bars, then every upgrade track with its level and the next price
      const U = WAR_UPG, up = Wr.up;
      sig = 'st|' + Object.keys(U).map(k => up[k] + (warCost('upgrade', k) != null && Wr.cr >= warCost('upgrade', k) ? 'y' : 'n')).join('') + '|' + Wr.squads + (Wr.cr >= WAR_SQUAD.cost ? 'y' : 'n') + Wr.up.hangar + '|' + (Wr.over ? 1 : 0);
      name = 'BASTION'; role = 'ORBITAL FORTRESS'; num = '00';
      if (sig !== lastInfo) {
        const rows = Object.keys(U).map(k => {
          const lv = up[k], n = U[k].costs.length, c = warCost('upgrade', k), pips = Array.from({length: n}, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
          return `<button type="button" class="up${c == null ? ' max' : Wr.cr >= c ? '' : ' poor'}" data-act="upg:${k}" data-tip="${esc(U[k].blurb)}"><span class="nm">${U[k].name}</span><span class="pips">${pips}</span><span class="c">${c == null ? 'MAX' : cr(c)}</span></button>`;
        }).join('');
        const sq = Wr.squads, cap = 1 + Wr.up.hangar;
        html = bars([['SHIELD', st.sh, st.shMax, 'sh'], ['HULL', st.hp, st.hpMax, 'hull']])
          + `<div class="ups">${rows}</div>`
          + `<button type="button" class="up sq${sq >= cap ? ' max' : Wr.cr >= WAR_SQUAD.cost ? '' : ' poor'}" data-act="squad" data-tip="Three HAWK fighters. They launch from the hangar each wave and hunt bombers first. Losses are rebuilt between waves. The HANGAR upgrade adds room for more.">`
          + `<span class="nm">HAWK SQUADRONS</span><span class="pips">${Array.from({length: cap}, (_, i) => `<i class="${i < sq ? 'on' : ''}"></i>`).join('')}</span><span class="c">${sq >= cap ? 'FULL' : cr(WAR_SQUAD.cost)}</span></button>`;
      }
    } else if (e.kind === 'platform') {
      const P = WAR_PLAT[e.cls], mk = e.mk, c = warCost('refit', e), sell = warCost('sell', e);
      sig = 'p|' + e.id + '|' + mk + '|' + (c != null && Wr.cr >= c ? 'y' : 'n');
      name = WAR_CLS[e.cls].name + ' MK ' + WAR_MK[mk]; role = WAR_CLS[e.cls].role; num = pad2(e.slot + 1);
      if (sig !== lastInfo) {
        const rk = Wr.rangeK || 1;
        const st2 = e.cls === 'sentinel' ? [['TURRETS', P.turrets[mk]], ['RATE', P.rate[mk]*P.turrets[mk] + '/s'], ['DAMAGE', P.dmg[mk].toFixed(1)], ['RANGE', (P.range[mk]*rk/1000).toFixed(1) + ' km']]
          : e.cls === 'hydra' ? [['SALVO', P.salvo[mk] + ' missiles'], ['EVERY', P.every[mk] + ' s'], ['DAMAGE', P.dmg[mk] + ' each'], ['RANGE', (P.range[mk]*rk/1000).toFixed(1) + ' km']]
          : e.cls === 'longbow' ? [['CHARGE', P.charge[mk] + ' s'], ['DAMAGE', P.dmg[mk] + ''], ['RANGE', (P.range[mk]*rk/1000).toFixed(1) + ' km'], ['VS CAPITALS', '+30%']]
          : [['FIELD', (P.radius[mk]/1000).toFixed(2) + ' km'], ['CAPACITY', P.pool[mk]], ['RECHARGE', P.regen[mk] + '/s']];
        const next = c == null ? '' : e.cls === 'sentinel' ? (mk === 0 ? 'Adds the lower turret' : 'Adds both flank turrets') : e.cls === 'hydra' ? 'Bigger salvos, faster reloads' : e.cls === 'longbow' ? 'Faster charge, heavier slugs' : 'A wider, stronger field';
        html = bars(e.cls === 'aegis' ? [['FIELD', e.pool, e.poolMax, 'sh'], ['HULL', e.hp, e.hpMax, 'hull']] : [['HULL', e.hp, e.hpMax, 'hull']])
          + `<dl class="stats">${st2.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}<dt>KILLS</dt><dd data-kills>${e.kills || 0}</dd></dl>`
          + `<p class="blurb">${esc(P.blurb)}</p>`
          + `<div class="acts">`
          + (c == null ? `<button type="button" class="act max" disabled>MK III · MAX</button>` : `<button type="button" class="act${Wr.cr >= c ? '' : ' poor'}" data-act="refit" data-tip="${next}">REFIT MK ${WAR_MK[mk + 1]} · ${cr(c)}<kbd>U</kbd></button>`)
          + `<button type="button" class="act sell" data-act="sell">SELL · ${cr(sell)}</button><button type="button" class="act" data-act="follow">FOLLOW<kbd>F</kbd></button></div>`;
      }
    } else {
      const c = WAR_CLS[e.cls], foe = e.team === 1;
      sig = 'e|' + e.id + '|' + (Wr.ab.nova.cd <= 0 && Wr.up.nova ? 1 : 0) + (Wr.ab.lance.cd <= 0 && Wr.up.lance ? 1 : 0);
      name = c.name; role = foe ? ({fighter: 'DOMINION FIGHTER', bomber: 'DOMINION BOMBER', capital: c.boss ? 'DOMINION DREADNOUGHT' : 'DOMINION CAPITAL SHIP'}[c.kind]) : 'HAWK FIGHTER'; num = foe ? 'XX' : 'HK';
      if (sig !== lastInfo) {
        const desc = {wasp: 'Fast interceptor. Escorts the bombers and hunts your platforms and Hawks.', locust: 'Carries a planet-cracker for MILLER. Stop it before it dives through the corridor (AEGIS -' + c.breach + '%).',
          mantis: 'Armoured dropship full of troops. A breach costs AEGIS ' + c.breach + '%.', frigate: 'Shielded capital ship. Flak turret and missile pods; stands off and shells BASTION.',
          cruiser: 'Heavy capital ship. Eight turrets; launches Wasps from its hangar bays.', sovereign: 'Dreadnought. Its SUNDER cannon charges and strikes BASTION directly.', hawk: 'Your fighter. Hunts bombers first, then fighters.'}[e.cls] || '';
        html = bars(e.shMax ? [['SHIELD', e.sh, e.shMax, 'sh'], ['HULL', e.hp, e.hpMax, 'hull']] : [['HULL', e.hp, e.hpMax, 'hull']])
          + (foe ? `<dl class="stats"><dt>BOUNTY</dt><dd>${cr((c.reward || 0)*WAR.D.pay)}</dd><dt>RANGE</dt><dd>${(wDist(e.p, [0, 0, 0])/1000).toFixed(1)} km</dd></dl>` : `<dl class="stats"><dt>KILLS</dt><dd>${e.kills || 0}</dd></dl>`)
          + `<p class="blurb">${esc(desc)}</p>`
          + (foe ? `<div class="acts">${Wr.up.nova ? `<button type="button" class="act" data-act="ab:nova">NOVA<kbd>Q</kbd></button>` : ''}${Wr.up.lance ? `<button type="button" class="act" data-act="ab:lance">LANCE<kbd>E</kbd></button>` : ''}<button type="button" class="act" data-act="follow">FOLLOW<kbd>F</kbd></button></div>` : '');
      }
    }
    setText($('iName'), name); setText($('iRole'), role); setText($('iNum'), num);
    if (sig !== lastInfo) { iBody.innerHTML = html; lastInfo = sig; }
    // the live numbers
    const B = e || st, set = (cls, v, m) => { const b = iBody.querySelector(`[data-bar="${cls}"]`), n = iBody.querySelector(`[data-num="${cls}"]`); if (b) b.style.width = (100*clamp(v/Math.max(m, 1e-6), 0, 1)).toFixed(1) + '%'; if (n) setText(n, fmt(v)); };
    if (B.cls === 'aegis') set('sh', B.pool, B.poolMax); else if (B.shMax) set('sh', B.sh, B.shMax);
    set('hull', B.hp, B.hpMax);
    const kl = iBody.querySelector('[data-kills]'); if (kl) setText(kl, String(B.kills || 0));
  }
  iBody.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, Wr = WAR;
    if (a.startsWith('upg:')) { if (warUpgrade(a.slice(4))) { AUDIO.sfx.upgrade(); } else AUDIO.sfx.deny(); }
    else if (a === 'squad') { if (!warBuySquadron()) AUDIO.sfx.deny(); }
    else if (a === 'refit') { if (!warRefit(sel)) AUDIO.sfx.deny(); }
    else if (a === 'sell') { if (sel && warSell(sel)) { sel = null; } }
    else if (a === 'follow') { const e = sel || Wr.station; camFocus(e, e.kind === 'station' ? 2600 : e.kind === 'capital' ? wRad(e)*5 : e.kind === 'platform' ? 420 : 180); }
    else if (a.startsWith('ab:')) ability(a.slice(3), sel);
    lastInfo = ''; infoT = 0;
  });

  // ---------------------------------------------------------------------------------------------- the tactical side
  const radar = $('radar'), R_KM = 13, rk = 90/(R_KM*1000);
  const rg = el('g', {}, radar);
  for (const r of [3, 6, 9, 12]) el('circle', {cx: 0, cy: 0, r: r*1000*rk, class: 'rr'}, rg);
  el('path', {d: 'M0 -92V92M-92 0H92', class: 'rx'}, rg);
  el('text', {x: 0, y: -94, class: 'rt'}, rg).textContent = 'GARGANTUA';
  const rCorr = el('circle', {cx: 0, cy: -300*rk, r: WAR_T.GATE_R*rk, class: 'rc'}, rg);
  const rView = el('path', {class: 'rv'}, rg);
  const rSt = el('rect', {x: -3.5, y: -3.5, width: 7, height: 7, class: 'rs'}, rg);
  const rSlots = WAR_SLOTS.map(s => el('rect', {x: s.p[2]*rk - 2, y: -s.p[0]*rk - 2, width: 4, height: 4, class: 'rsl'}, rg));
  const rDots = el('g', {}, rg), RD = [];
  void rCorr; void rSt;
  // radar: +X (the hole) up, +Z right; a dot per craft
  function sideFrame(now){
    if (now - sideT < 90) return; sideT = now;
    const Wr = WAR, b = CAM.b;
    if (b) { const f = [b.f[0], b.f[2]], l = Math.hypot(f[0], f[1]) || 1, ang = Math.atan2(f[1]/l, f[0]/l), e = CAM.eye, ex = e[2]*rk, ey = -e[0]*rk, h = ORB.view.fov*0.7;
      const pt = a => [ex + Math.sin(a)*40, ey - Math.cos(a)*40];
      const p1 = pt(ang - h), p2 = pt(ang + h);
      setA(rView, {d: `M${ex.toFixed(1)} ${ey.toFixed(1)}L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}Z`}); }
    for (let i = 0; i < rSlots.length; i++) { const S = Wr.slots[i]; setA(rSlots[i], {class: 'rsl' + (S.e ? ' on ' + S.e.cls : '')}); }
    let n = 0;
    for (const e of Wr.ents) {
      if (!e.alive || e.arrive > Wr.t || e.docked || e.kind === 'station' || e.kind === 'platform') continue;
      if (n >= 160) break;
      while (RD.length <= n) RD.push(el('circle', {}, rDots));
      const x = clamp(e.p[2]*rk, -96, 96), y = clamp(-e.p[0]*rk, -96, 96), c = WAR_CLS[e.cls];
      setA(RD[n], {cx: x.toFixed(1), cy: y.toFixed(1), r: e.wreck ? 1.2 : c.kind === 'capital' ? 3.6 : c.kind === 'bomber' ? 2.2 : 1.5, class: e.wreck ? 'wr' : e.team ? c.kind : 'hawk'});
      show(RD[n], true); n++;
    }
    for (let i = n; i < RD.length; i++) show(RD[i], false);
    // the threat board
    const th = $('threats');
    if (Wr.phase === 'wave' && !Wr.over) {
      const cnt = {}; for (const e of Wr.ents) if (e.alive && e.team === 1 && e.dying < 0 && !e.wreck) cnt[e.cls] = (cnt[e.cls] || 0) + 1;
      for (const q of Wr.queue) cnt[q.cls] = (cnt[q.cls] || 0) + 1;
      const keys = Object.keys(cnt).sort((a, b) => WAR_CLS[b].hp*(WAR_CLS[b].kind === 'capital' ? 100 : 1) - WAR_CLS[a].hp*(WAR_CLS[a].kind === 'capital' ? 100 : 1));
      th.innerHTML = '<div class="th">HOSTILES</div>' + (keys.length ? keys.map(k => `<div class="tr ${WAR_CLS[k].kind}"><span>${WAR_CLS[k].name}</span><b>${cnt[k]}</b></div>`).join('') : '<div class="tr"><span>CLEARING</span><b>&mdash;</b></div>');
    } else if (Wr.phase === 'build' && !Wr.over) {
      const p = nextPlan(), cnt = {}; for (const g of p.g) cnt[g.cls] = (cnt[g.cls] || 0) + g.n;
      th.innerHTML = `<div class="th">NEXT · WAVE ${Wr.wave + 1}</div><div class="tn">${esc(p.t)}</div>` + Object.keys(cnt).map(k => `<div class="tr ${WAR_CLS[k].kind}"><span>${WAR_CLS[k].name}</span><b>${cnt[k]}</b></div>`).join('');
    } else th.innerHTML = '';
  }

  // ---------------------------------------------------------------------------------------------- the command bar
  const bWave = $('bWave');
  document.querySelectorAll('#cmd [data-build]').forEach(b => {
    const t = b.dataset.build; b.querySelector('[data-cost]').textContent = cr(WAR_PLAT[t].cost[0]);
    b.dataset.tip = WAR_CLS[t].name + ' · ' + WAR_CLS[t].role + ' · ' + WAR_PLAT[t].blurb;
    b.addEventListener('click', () => toggleBuild(t));
  });
  $('cSquad').textContent = cr(WAR_SQUAD.cost);
  $('bSquad').dataset.tip = 'HAWK SQUADRON · three fighters from BASTION’s hangar. Room for one; the HANGAR upgrade adds more.';
  $('bSquad').addEventListener('click', () => { if (warBuySquadron()) {} else { AUDIO.sfx.deny(); if (WAR.squads >= 1 + WAR.up.hangar) log('HANGAR FULL · UPGRADE THE HANGAR FOR ANOTHER SQUADRON', 'warn'); } });
  $('bNova').dataset.tip = 'NOVA CANNON · BASTION’s spinal superweapon. Buy it from BASTION’s upgrades; then Q and click a target.';
  $('bLance').dataset.tip = 'PLANETARY LANCE · a beam from MILLER’s surface. Buy it from BASTION’s upgrades; then E and click a target.';
  document.querySelectorAll('#cmd [data-ab]').forEach(b => b.addEventListener('click', () => ability(b.dataset.ab, null)));
  bWave.addEventListener('click', () => { if (WAR.phase === 'build' && !WAR.over) warLaunch(true); });
  $('bSpeed').addEventListener('click', cycleSpeed);
  $('bPause').addEventListener('click', togglePause);
  $('bCine').addEventListener('click', toggleCine);
  $('bAudio').addEventListener('click', () => { AUDIO.set(!AUDIO.on); syncToggles(); });
  $('bHelp').addEventListener('click', () => help(true));
  function toggleBuild(t){
    if (!started || WAR.over) return;
    if (mode && mode.kind === 'build' && mode.type === t) { setMode(null); return; }
    if (WAR.cr < WAR_PLAT[t].cost[0]) { AUDIO.sfx.deny(); log('NOT ENOUGH CREDITS FOR ' + WAR_CLS[t].name, 'warn'); return; }
    if (!WAR.slots.some(s => !s.e)) { AUDIO.sfx.deny(); log('EVERY SLOT IS TAKEN · SELL OR REFIT', 'warn'); return; }
    setMode({kind: 'build', type: t}); AUDIO.sfx.blip(1.3);
  }
  function ability(ab, tgt){
    if (!started || WAR.over) return;
    const A = WAR.ab[ab];
    if (!WAR.up[ab]) { AUDIO.sfx.deny(); log((ab === 'nova' ? 'NOVA CANNON' : 'PLANETARY LANCE') + ' NOT BUILT · BUY IT FROM BASTION’S UPGRADES', 'warn'); select(null); return; }
    if (A.cd > 0 || A.charge >= 0) { AUDIO.sfx.deny(); return; }
    if (WAR.phase !== 'wave' || !WAR.ents.some(e => e.alive && e.team === 1 && e.dying < 0 && !e.wreck && e.arrive <= WAR.t)) { AUDIO.sfx.deny(); log('NO TARGETS', 'warn'); return; }
    if (tgt && tgt.team === 1) { warAbility(ab, tgt); setMode(null); return; }
    if (mode && mode.kind === 'target' && mode.ab === ab) { warAbility(ab, null); setMode(null); return; }
    setMode({kind: 'target', ab});
  }
  const SPEEDS = [1, 2, 3];
  function cycleSpeed(){ WAR.speed = SPEEDS[(SPEEDS.indexOf(WAR.speed) + 1) % SPEEDS.length]; syncToggles(); }
  function togglePause(){ if (!started || WAR.over) return; WAR.paused = !WAR.paused; AUDIO.pause(WAR.paused); body.classList.toggle('paused', WAR.paused); syncToggles(); }
  function toggleCine(){ CAM.auto = !CAM.auto; if (!CAM.auto) camCut(); syncToggles(); log(CAM.auto ? 'CINEMA CAMERA · ANY INPUT TAKES IT BACK' : 'CAMERA · MANUAL'); }
  function syncToggles(){
    setText($('bSpeed'), '×' + WAR.speed);
    $('bPause').setAttribute('aria-pressed', WAR.paused ? 'true' : 'false');
    $('bCine').setAttribute('aria-pressed', CAM.auto ? 'true' : 'false');
    $('bAudio').setAttribute('aria-pressed', AUDIO.on ? 'true' : 'false');
  }
  function cmdFrame(){
    const Wr = WAR, free = Wr.slots.some(s => !s.e);
    document.querySelectorAll('#cmd [data-build]').forEach(b => { const c = WAR_PLAT[b.dataset.build].cost[0]; b.classList.toggle('poor', Wr.cr < c || !free); });
    const sq = $('bSquad'); sq.classList.toggle('poor', Wr.cr < WAR_SQUAD.cost || Wr.squads >= 1 + Wr.up.hangar);
    setText($('cSquad'), Wr.squads >= 1 + Wr.up.hangar ? 'FULL' : cr(WAR_SQUAD.cost));
    for (const ab of ['nova', 'lance']) {
      const A = Wr.ab[ab], B = $(ab === 'nova' ? 'bNova' : 'bLance'), owned = Wr.up[ab] > 0, cd = ab === 'nova' ? WAR_W.nova.cd*(1 - 0.12*Wr.up.reactor) : WAR_W.lance.cd[Math.max(0, Wr.up.lance - 1)]*(1 - 0.12*Wr.up.reactor);
      const ready = owned && A.cd <= 0 && A.charge < 0;
      B.classList.toggle('locked', !owned); B.classList.toggle('ready', ready); B.classList.toggle('charging', A.charge >= 0);
      setText($(ab === 'nova' ? 'nNova' : 'nLance'), !owned ? 'LOCKED' : A.charge >= 0 ? 'FIRING' : A.cd > 0 ? Math.ceil(A.cd) + ' s' : 'READY');
      B.querySelector('.ring i').style.transform = `scaleX(${owned ? (A.cd > 0 ? 1 - A.cd/cd : 1).toFixed(3) : 0})`;
    }
    { const c = $('bCine'), v = CAM.auto ? 'true' : 'false'; if (c.getAttribute('aria-pressed') !== v) c.setAttribute('aria-pressed', v); }
    if (Wr.phase === 'build' && !Wr.over) { setText($('bWaveT'), 'LAUNCH WAVE ' + (Wr.wave + 1)); setText($('bWaveS'), '+' + cr(Math.round(Wr.buildT*WAR_T.EARLY)) + ' · SPACE'); bWave.disabled = false; bWave.classList.add('ready'); }
    else { setText($('bWaveT'), Wr.over ? 'WAR OVER' : 'WAVE ' + Wr.wave + ' IN PROGRESS'); setText($('bWaveS'), Wr.over ? '' : wHostiles() + ' HOSTILES'); bWave.disabled = true; bWave.classList.remove('ready'); }
  }

  // ---------------------------------------------------------------------------------------------- the top bar
  let crShown = 0;
  function topFrame(dt){
    const Wr = WAR, st = Wr.station;
    crShown += (Wr.cr - crShown)*Math.min(1, dt*8); if (Math.abs(Wr.cr - crShown) < 1) crShown = Wr.cr;
    setText($('rCr'), cr(crShown));
    $('rAegis').style.width = Wr.aegis.toFixed(1) + '%'; setText($('rAegisN'), Math.ceil(Wr.aegis) + '%');
    $('res').classList.toggle('aegisLow', Wr.aegis < 35);
    if (st) { $('rSh').style.width = (100*st.sh/Math.max(st.shMax, 1)).toFixed(1) + '%'; $('rHull').style.width = (100*Math.max(0, st.hp)/st.hpMax).toFixed(1) + '%'; setText($('rHullN'), Math.ceil(100*Math.max(0, st.hp)/st.hpMax) + '%'); }
    const final = WAR_WAVES.length, endless = Wr.wave >= final || Wr.endless;
    if (Wr.phase === 'wave') {
      setText($('wLabel'), 'WAVE'); setText($('wNum'), pad2(Wr.wave)); setText($('wOf'), endless ? '' : '/' + final);
      setText($('wTitle'), Wr.plan ? Wr.plan.t : ''); setText($('wPhase'), Wr.over ? '' : clock(Wr.waveT) + ' · ' + wHostiles() + ' HOSTILES');
      const tot = Wr.plan ? Wr.plan.g.reduce((a, g) => a + g.n, 0) : 1; $('wBar').style.width = (100*(1 - wHostiles()/Math.max(tot, 1))).toFixed(1) + '%';
    } else if (Wr.phase === 'build') {
      setText($('wLabel'), 'NEXT'); setText($('wNum'), pad2(Wr.wave + 1)); setText($('wOf'), Wr.wave + 1 > final ? '' : '/' + final);
      setText($('wTitle'), nextPlan().t); setText($('wPhase'), (WAR.paused ? 'PAUSED · ' : '') + 'BUILD · ' + clock(Math.ceil(Wr.buildT)));
      $('wBar').style.width = (100*Wr.buildT/(Wr.wave ? WAR_T.BUILD : WAR_T.BUILD_FIRST)).toFixed(1) + '%';
    }
    body.classList.toggle('crit', started && (!!(st && st.hp < st.hpMax*0.25 && !Wr.over) || Wr.aegis < 20));
  }

  // ---------------------------------------------------------------------------------------------- events from the war
  const near = p => p ? wDist(p, CAM.eye) : 3000;
  function event(ev){
    const S = AUDIO.sfx;
    switch (ev.type) {
      case 'newWar': break;
      case 'waveStart':
        card(ev.final ? 'THE ARMADA' : 'WAVE ' + (WAR_ROMAN[ev.n] || ev.n), ev.t + (ev.s ? ' · ' + ev.s : ''), ev.boss ? 'red' : '');
        log('WAVE ' + ev.n + ' · ' + ev.t + ' · ' + ev.count + ' CONTACTS', 'warn');
        AUDIO.cue(ev.boss ? 'boss' : 'wave'); setMode(mode && mode.kind === 'target' ? null : mode); break;
      case 'waveClear':
        card('WAVE ' + (WAR_ROMAN[ev.n] || ev.n) + ' HELD', '+' + cr(ev.bonus) + ' · HULL PATCHED · AEGIS +' + ev.aegis + '%', 'gold');
        log('WAVE ' + ev.n + ' HELD · BONUS ' + cr(ev.bonus), 'good'); AUDIO.cue('clear');
        save(); break;
      case 'victory': setTimeout(() => endScreen('victory'), 5200); AUDIO.cue('victory'); camEvent({type: 'victory'}); break;
      case 'defeat': body.classList.add('lost'); log(ev.why === 'aegis' ? 'AEGIS HAS FAILED · MILLER IS OPEN' : 'BASTION IS BREAKING UP', 'bad'); AUDIO.cue('defeat'); S.klaxon();
        clearSave(); setMode(null); setTimeout(() => endScreen(ev.why), ev.why === 'aegis' ? 4200 : 7600); break;
      case 'kill':
        if (ev.pay) floater(ev.p, '+' + cr(ev.pay), ev.capital ? 'big' : '');
        if (ev.capital) { log(ev.name + ' DESTROYED · +' + cr(ev.pay), 'good'); } S.coin(); break;
      case 'capArrive': log((ev.boss ? 'DREADNOUGHT ' : '') + ev.name + ' ON SCOPE', 'warn'); AUDIO.cue(ev.boss ? 'boss' : 'capital'); S.warp(true, near(ev.p)); break;
      case 'capDying': log(ev.name + ' IS BREAKING UP', 'good'); break;
      case 'capWithdraw': log(ev.name + ' WITHDRAWS · NO BOUNTY', 'warn'); S.warp(true, near(ev.p)); break;
      case 'capBoom': AUDIO.cue('kill'); S.boom(400, near(ev.p)); CAM.shake = Math.max(CAM.shake, 1); break;
      case 'capShields': log(ev.name + ' SHIELDS DOWN', 'good'); S.shield(near(ev.p)); break;
      case 'breaching': floater(ev.p, 'BREACH', 'bad'); S.alarm(); break;
      case 'breach': log(ev.name + ' THROUGH THE CORRIDOR · AEGIS −' + ev.dmg + '%', 'bad'); S.breach(); if (ev.aegis < 30) S.klaxon(); break;
      case 'lost': log(ev.name + ' LOST', 'bad'); if (sel && !sel.alive) sel = null; break;
      case 'hawkLost': break;
      case 'shieldsDown': log('BASTION SHIELDS DOWN', 'bad'); S.klaxon(); break;
      case 'shieldsUp': log('BASTION SHIELDS RESTORED', 'good'); break;
      case 'stationCrit': log('BASTION HULL CRITICAL', 'bad'); S.klaxon(); AUDIO.crit(true); break;
      case 'stationStable': AUDIO.crit(false); break;
      case 'stationHit': S.hull(); CAM.shake = Math.max(CAM.shake, 0.4); break;
      case 'stationBoom': S.boom(600, 1500); CAM.shake = 2; break;
      case 'build': log(ev.name + ' DEPLOYING · ' + WAR.slots[ev.slot].tag + ' ' + (ev.slot + 1)); S.build(); break;
      case 'deployed': break;
      case 'refit': log(ev.name + ' REFIT · MK ' + WAR_MK[ev.mk]); S.upgrade(); break;
      case 'sell': floater(ev.p, '+' + cr(ev.amt), ''); log(ev.name + ' DECOMMISSIONED · +' + cr(ev.amt)); S.sell(); break;
      case 'upgrade': log('BASTION · ' + ev.name + (WAR_UPG[ev.track].costs.length > 1 ? ' ' + WAR_MK[ev.lv - 1] : ' ONLINE')); if (ev.track === 'nova' || ev.track === 'lance') card(ev.name, 'ONLINE · ' + (ev.track === 'nova' ? 'Q' : 'E') + ' TO FIRE', 'gold'); break;
      case 'squadron': log('HAWK SQUADRON ' + ev.n + ' ASSIGNED'); S.upgrade(); break;
      case 'credits': floater([0, 400, 0], '+' + cr(ev.amt), 'big'); log(ev.why + ' · +' + cr(ev.amt), 'good'); S.coin(); break;
      case 'rail': S.rail(near(ev.p)); break;
      case 'heavy': S.heavy(near(ev.p)); break;
      case 'salvo': S.salvo(near(ev.p)); break;
      case 'missile': S.missile(near(ev.p)); break;
      case 'warp': if (!ev.big) S.warp(false, near(ev.p)); break;
      case 'boom': S.boom(ev.size, near(ev.p)); if (ev.size > 60 && near(ev.p) < 2500) CAM.shake = Math.max(CAM.shake, 0.5); break;
      case 'launch': log('CRUISER LAUNCHING FIGHTERS', 'warn'); break;
      case 'novaCharge': log('NOVA CHARGING · ' + ev.name, 'warn'); S.nova(); break;
      case 'novaFire': S.novaFire(); CAM.shake = Math.max(CAM.shake, 1.2); break;
      case 'lanceCharge': log('MILLER GROUND DEFENCE · LANCE LOCKED ON ' + ev.name, 'warn'); S.lance(); break;
      case 'lanceFire': S.lanceFire(); break;
      case 'sunderCharge': log('SOVEREIGN CHARGING SUNDER CANNON', 'bad'); card('SUNDER', 'THE SOVEREIGN IS FIRING ON BASTION', 'red'); S.sunder(); break;
      case 'sunderFire': S.sunderFire(); CAM.shake = 2; break;
      case 'fieldDown': log('AEGIS FIELD COLLAPSED', 'bad'); break;
    }
  }

  // ---------------------------------------------------------------------------------------------- keys
  function key(e){
    if (!started) {
      if (e.key === 'Escape' && body.classList.contains('help')) { help(false); return true; }
      return false;
    }
    const k = e.key.toLowerCase();
    if (body.classList.contains('help')) { if (k === 'escape' || k === 'h') help(false); else if (k === ' ' || k === 'enter') return false; return true; }
    if (body.classList.contains('ended')) return false;
    if (e.repeat && k !== 'arrowleft' && k !== 'arrowright') return true;
    if (e.target && e.target.closest && e.target.closest('button, a') && e.target.matches(':focus-visible') && (k === ' ' || k === 'enter')) return false;   // (a keyboard-focused control)
    if (k === 'escape') { if (camCine()) camCut(); else if (mode) setMode(null); else select(null); return true; }
    if (/^[1-4]$/.test(k)) { toggleBuild(['sentinel', 'hydra', 'longbow', 'aegis'][+k - 1]); return true; }
    if (k === '5') { if (!warBuySquadron()) AUDIO.sfx.deny(); return true; }
    if (k === 'q') { ability('nova', sel && sel.team === 1 ? sel : null); return true; }
    if (k === 'e') { ability('lance', sel && sel.team === 1 ? sel : null); return true; }
    if (k === ' ') { if (WAR.phase === 'build' && !WAR.over) warLaunch(true); return true; }
    if (k === 'p') { togglePause(); return true; }
    if (k === 'tab') { cycleSpeed(); return true; }
    if (k === 'c') { toggleCine(); return true; }
    if (k === 'h' || k === '?') { help(true); return true; }
    if (k === 'm') { AUDIO.set(!AUDIO.on); syncToggles(); return true; }
    if (k === 'f') { const t = sel || WAR.station; camFocus(t, t.kind === 'station' ? 2600 : t.kind === 'capital' ? wRad(t)*5 : t.kind === 'platform' ? 420 : 180); return true; }
    if (k === 'u') { if (sel && sel.kind === 'platform' && !warRefit(sel)) AUDIO.sfx.deny(); return true; }
    if (k === 'delete' || k === 'backspace') { if (sel && sel.kind === 'platform') { if (sel.sellArm && performance.now() - sel.sellArm < 1500) { warSell(sel); sel = null; } else { sel.sellArm = performance.now(); log('PRESS AGAIN TO SELL · +' + cr(warCost('sell', sel)), 'warn'); } } return true; }
    if (k === 'b') { select(null); return true; }
    return false;
  }

  // ---------------------------------------------------------------------------------------------- screens
  function help(on){ body.classList.toggle('help', on); if (on) { if (started && !WAR.over && !WAR.paused) { WAR.paused = true; help.paused = true; body.classList.add('paused'); } $('hClose').focus({preventScroll: true}); }
    else if (help.paused) { help.paused = false; WAR.paused = false; body.classList.remove('paused'); } syncToggles(); }
  $('hClose').addEventListener('click', () => help(false));
  $('tHelp').addEventListener('click', () => help(true));
  const diffBtns = [...document.querySelectorAll('#title [data-diff]')];
  function setDiff(d){ diff = d; safe(() => localStorage.setItem('meinen.defense.diff', d)); diffBtns.forEach(b => { b.setAttribute('aria-checked', b.dataset.diff === d ? 'true' : 'false'); b.classList.toggle('on', b.dataset.diff === d); }); }
  diffBtns.forEach(b => b.addEventListener('click', () => { setDiff(b.dataset.diff); AUDIO.sfx.blip(1.2); }));
  setDiff(diff);
  function loadSave(){ return safe(() => JSON.parse(localStorage.getItem('meinen.defense.save') || 'null'), null); }
  function save(){ const s = warSave(); if (s) safe(() => localStorage.setItem('meinen.defense.save', JSON.stringify(s))); bestUpdate(); }
  function clearSave(){ safe(() => localStorage.removeItem('meinen.defense.save')); bestUpdate(); }
  function bestUpdate(){
    const b = safe(() => JSON.parse(localStorage.getItem('meinen.defense.best') || 'null'), null) || {};
    const n = WAR.stats ? WAR.stats.best : 0, k = WAR.diff;
    if (n > (b[k] || 0)) { b[k] = n; safe(() => localStorage.setItem('meinen.defense.best', JSON.stringify(b))); }
    return b;
  }
  function titleScreen(){
    body.classList.add('title'); body.classList.remove('ended', 'lost', 'crit', 'paused');
    started = false; sel = null; hov.ent = null; hov.slot = -1; setMode(null); AUDIO.pause(false); AUDIO.crit(false);
    if (WAR.over || WAR.phase !== 'setup') { warNew('veteran', null, 7); WAR.events.length = 0; }        // BASTION whole again behind the title
    WAR.paused = false;
    const s = loadSave(), c = $('tCont');
    c.hidden = !s; if (s) c.innerHTML = 'CONTINUE <small>WAVE ' + (s.wave + 1) + ' · ' + (WAR_DIFF[s.diff] || WAR_DIFF.veteran).name + '</small>';
    const b = bestUpdate(), parts = Object.keys(WAR_DIFF).filter(k => b[k]).map(k => WAR_DIFF[k].name + ' ' + b[k]);
    setText($('tBest'), parts.length ? 'BEST · WAVES HELD · ' + parts.join(' · ') : '');
    CAM.auto = true; CAM.dir = null; WAR.phase = 'setup';
    AUDIO.cue('title');
    setTimeout(() => $('tNew').focus({preventScroll: true}), 60);
  }
  function begin(resume){
    const s = resume ? loadSave() : null;
    if (resume && !s) return;
    warNew(s ? s.diff : diff, s, null);
    sel = null; hov.ent = null; hov.slot = -1; setMode(null);
    WAR.paused = false; AUDIO.pause(false); body.classList.remove('title', 'ended', 'lost', 'paused', 'crit'); started = true;
    CAM.auto = false; camCut(); camReset(); CAM.yaw = CAM.yawT; CAM.pitch = CAM.pitchT; CAM.dist = CAM.distT; CAM.f = CAM.fT.slice();
    AUDIO.cue('build'); AUDIO.crit(false);
    logEl.innerHTML = '';
    if (s) { log('CAMPAIGN RESUMED · WAVE ' + (s.wave + 1) + ' NEXT'); card('WAVE ' + (WAR_ROMAN[s.wave + 1] || s.wave + 1), 'THE WAR RESUMES', ''); }
    else {
      card('PLANET DEFENSE', 'BUILD YOUR DEFENCES · THE FIRST WAVE IS 45 SECONDS OUT', '');
      log('PICK A GUN (1–4), THEN A GLOWING SLOT'); setTimeout(() => started && log('SELECT BASTION TO UPGRADE THE STATION'), 1800);
      setTimeout(() => started && log('SPACE LAUNCHES THE WAVE EARLY FOR BONUS CREDITS'), 3600);
    }
    syncToggles(); lastInfo = ''; planCache = null;
  }
  $('tNew').addEventListener('click', () => begin(false));
  $('tCont').addEventListener('click', () => begin(true));
  function endScreen(why){
    if (!WAR.over && why !== 'victory') return;
    const Wr = WAR, s = Wr.stats, win = why === 'victory';
    bestUpdate();
    body.classList.add('ended');
    if (win) WAR.paused = true;                                                             // (the build timer would launch wave 21 behind it)
    setText($('eKick'), (win ? 'TWENTY WAVES HELD' : 'THE WAR ENDS AT WAVE ' + Wr.wave) + ' · ' + Wr.D.name);
    setText($('eTitle'), win ? 'MILLER HOLDS' : why === 'aegis' ? 'MILLER HAS FALLEN' : 'BASTION IS LOST');
    setText($('eLede'), win ? 'The Dominion fleet is broken against BASTION. The ocean world is safe, for now. The war goes on if you do.'
      : why === 'aegis' ? 'The planetary shield failed and the dropships are through. Build more guns in the corridor next time.' : 'The station broke apart under the guns of the fleet. Keep its shields up, and kill the capital ships sooner.');
    const byCls = Object.keys(s.byCls).sort((a, b) => s.byCls[b] - s.byCls[a]).map(k => WAR_CLS[k].name + ' ' + s.byCls[k]).join(' · ');
    $('eStats').innerHTML = [['WAVES HELD', win ? Wr.wave : Math.max(0, Wr.wave - 1)], ['KILLS', s.kills + (byCls ? ' <small>' + byCls + '</small>' : '')], ['BREACHES', s.breaches], ['PLATFORMS LOST', s.lost],
      ['CREDITS EARNED', cr(s.earned)], ['TIME', clock(s.time)]].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('eOn').hidden = !win;
    setTimeout(() => (win ? $('eOn') : $('eAgain')).focus({preventScroll: true}), 60);
  }
  $('eAgain').addEventListener('click', () => { clearSave(); begin(false); });
  $('eOn').addEventListener('click', () => { if (WAR.over) return; body.classList.remove('ended'); WAR.paused = false; syncToggles(); log('THE WAR GOES ON \u00b7 ENDLESS WAVES'); });
  $('eMenu').addEventListener('click', () => titleScreen());

  document.addEventListener('pointerup', e => { const b = e.target.closest && e.target.closest('#hud button, #hud a'); if (b) setTimeout(() => b.blur(), 0); });
  // ---------------------------------------------------------------------------------------------- tooltips
  const tip = $('tip');
  document.addEventListener('pointerover', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('show'); return; }
    tip.textContent = t.dataset.tip; tip.classList.add('show');
    const r = t.getBoundingClientRect(), w = Math.min(300, innerWidth - 20);
    tip.style.maxWidth = w + 'px';
    const x = clamp(r.left + r.width/2, w/2 + 10, innerWidth - w/2 - 10), above = r.top > innerHeight*0.5;
    tip.style.left = x + 'px'; tip.style.top = (above ? r.top - 10 : r.bottom + 10) + 'px'; tip.classList.toggle('above', above);
  });

  // ---------------------------------------------------------------------------------------------- boot and the frame
  function bootStatus(f){ const p = Math.round(f*100) + '%'; setText($('bootBake'), p); $('bootBar').style.width = p; }
  function onlineReq(){
    online = true; bootStatus(1);
    setTimeout(() => { body.classList.add('online'); body.classList.remove('booting'); titleScreen(); }, 500);
  }
  function fallback(why){
    failed = true; body.classList.add('nogl'); body.classList.remove('booting');
    const t = $('title'); body.classList.add('title');
    t.querySelector('.lede').textContent = 'PLANET DEFENSE needs WebGL2 and float render targets, and this browser or graphics driver refused them (' + String(why).slice(0, 80) + '). Try another browser, or head back to the flight deck.';
    t.querySelectorAll('.diff, #tNew, #tCont').forEach(x => { x.hidden = true; x.style.display = 'none'; });
  }
  function frame(now, dt){
    if (typeof keyOrbit === 'function') keyOrbit(dt);
    topFrame(dt); cmdFrame(); infoFrame(now); sideFrame(now); holoFrame(); floFrame(now);
    body.classList.toggle('cine', camCine());
    AUDIO.frame();
    if (sel && sel.kind === 'platform' && sel.alive === false) sel = null;
  }
  function hidden(){ if (started && !WAR.over && !WAR.paused) togglePause(); }
  syncToggles();
  return {bootStatus, online: onlineReq, fallback, frame, event, click, hover, key, hidden, log, get sel(){ return sel; }, select, setMode, begin, titleScreen, endScreen};
})();
