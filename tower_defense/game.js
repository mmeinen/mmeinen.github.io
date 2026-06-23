/* Orbital Defense — a self-contained tower defense game.
   Pure canvas + JS, no dependencies. Space / blue-HUD theme to match the site. */
(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // ── Grid / geometry ─────────────────────────────────────────────────────────
  const TILE = 40, COLS = 20, ROWS = 15;
  const W = COLS * TILE, H = ROWS * TILE;

  // ── Pathfinding maze ─────────────────────────────────────────────────────────
  // No fixed path: enemies flow from the ENTRY (left edge) to the EXIT (right edge),
  // routing around whatever towers the player builds. A breadth-first flood from the
  // EXIT gives every open cell its step-distance to the core (distField); enemies walk
  // down that gradient. Towers reshape the maze but can never fully seal it — placeTower
  // rejects any build that would strand the spawn or trap a live enemy.
  const center = (c, r) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
  const ENTRY = { c: 0, r: 7 };
  const EXIT  = { c: COLS - 1, r: 7 };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const idx = (c, r) => r * COLS + c;
  const inBounds = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

  let distField = new Array(COLS * ROWS).fill(Infinity); // open cells → steps to EXIT
  let routePts = [];                                      // cached ENTRY→EXIT guide line

  // BFS flood from EXIT over all non-tower cells. (bc,br) optionally blocks one extra
  // cell, to test a tentative tower placement without mutating the board.
  function computeFlow(bc, br) {
    const d = new Array(COLS * ROWS).fill(Infinity);
    const blocked = (c, r) => (c === bc && r === br) || !!towerAt(c, r);
    const q = [EXIT]; let head = 0;
    d[idx(EXIT.c, EXIT.r)] = 0;
    while (head < q.length) {
      const cur = q[head++], base = d[idx(cur.c, cur.r)];
      for (const [dc, dr] of DIRS) {
        const nc = cur.c + dc, nr = cur.r + dr;
        if (!inBounds(nc, nr) || blocked(nc, nr)) continue;
        if (d[idx(nc, nr)] > base + 1) { d[idx(nc, nr)] = base + 1; q.push({ c: nc, r: nr }); }
      }
    }
    return d;
  }

  const distAt = (c, r) => (inBounds(c, r) ? distField[idx(c, r)] : Infinity);

  // Best neighbour to step to from (c,r): the open cell nearest the EXIT. Ties favour
  // keeping the current heading, then horizontal motion, to keep routes from zig-zagging.
  function flowNext(c, r, lastDir) {
    const cands = [];
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (!inBounds(nc, nr) || towerAt(nc, nr)) continue;
      const nd = distField[idx(nc, nr)];
      if (nd === Infinity) continue;
      cands.push({ c: nc, r: nr, dc, dr, nd });
    }
    if (!cands.length) return null;
    let min = Infinity;
    for (const k of cands) if (k.nd < min) min = k.nd;
    const top = cands.filter(k => k.nd === min);
    if (top.length > 1 && lastDir) {
      const keep = top.find(k => k.dc === lastDir.dc && k.dr === lastDir.dr);
      if (keep) return keep;
    }
    return top.find(k => k.dc !== 0) || top[0];
  }

  // The polyline the swarm currently takes, ENTRY→EXIT, for the on-screen guide.
  function tracePath() {
    const pts = [center(ENTRY.c, ENTRY.r)];
    let c = ENTRY.c, r = ENTRY.r, last = null, guard = 0;
    while (!(c === EXIT.c && r === EXIT.r) && guard++ < COLS * ROWS) {
      const nx = flowNext(c, r, last);
      if (!nx) break;
      last = { dc: nx.dc, dr: nx.dr };
      c = nx.c; r = nx.r;
      pts.push(center(c, r));
    }
    return pts;
  }

  // Recompute the flow field + guide route after any tower change, and force live enemies
  // to re-pick their next step so they re-route around new walls.
  function recomputeFlow() {
    distField = computeFlow(-1, -1);
    routePts = tracePath();
    for (const e of enemies) if (!e.dead) e.tgt = null;
  }

  // A tentative tower at (c,r) is legal only if the spawn AND every live enemy can still
  // reach the EXIT afterward — the maze is never fully sealed and nothing gets trapped.
  function pathOkWith(c, r) {
    const d = computeFlow(c, r);
    if (d[idx(ENTRY.c, ENTRY.r)] === Infinity) return false;
    for (const e of enemies) {
      if (e.dead) continue;
      const ec = Math.max(0, Math.min(COLS - 1, Math.floor(e.x / TILE)));
      const er = Math.max(0, Math.min(ROWS - 1, Math.floor(e.y / TILE)));
      if (d[idx(ec, er)] === Infinity) return false;
    }
    return true;
  }

  // Pick the next cell-center target for an enemy from the flow field.
  function assignTarget(e) {
    if (e.cellC === EXIT.c && e.cellR === EXIT.r) {
      // glide off the right edge through the core, then leak
      e.tgt = { x: W + TILE, y: center(EXIT.c, EXIT.r).y, c: EXIT.c + 1, r: EXIT.r, dir: { dc: 1, dr: 0 }, leak: true };
      return;
    }
    const nx = flowNext(e.cellC, e.cellR, e.lastDir);
    const cell = nx || EXIT; // safety net: head straight for the core if boxed in
    const p = center(cell.c, cell.r);
    e.tgt = { x: p.x, y: p.y, c: cell.c, r: cell.r, dir: { dc: cell.c - e.cellC, dr: cell.r - e.cellR } };
  }

  // ── Config ──────────────────────────────────────────────────────────────────
  const MAX_WAVES = 100, AUTO_DELAY = 5;
  const MAX_IN_FLIGHT = 3;  // most waves allowed on the field at once
  const SPLASH_MAX = 5;     // most enemies a single Cannon shell can hit

  // Difficulty tiers. "Easy" is the original tuning; harder tiers lean the economy
  // (less starting gold/lives, smaller rewards & wave bonuses) and beef the swarm
  // (more HP, faster movement). Picked before the first wave, then locked for the run.
  const DIFFICULTIES = {
    easy:   { name: 'EASY',   gold: 160, lives: 20, hpMul: 1.00, spdMul: 1.00, rewardMul: 1.00, bonusMul: 1.00, desc: 'Generous gold & lives. Forgiving swarm.' },
    normal: { name: 'NORMAL', gold: 130, lives: 15, hpMul: 1.35, spdMul: 1.08, rewardMul: 0.90, bonusMul: 0.85, desc: 'Tougher, faster enemies. Leaner economy.' },
    hard:   { name: 'HARD',   gold: 110, lives: 10, hpMul: 1.80, spdMul: 1.16, rewardMul: 0.80, bonusMul: 0.70, desc: 'Beefy swarms, few lives, tight gold.' },
    insane: { name: 'INSANE', gold: 90,  lives: 5,  hpMul: 2.50, spdMul: 1.28, rewardMul: 0.72, bonusMul: 0.60, desc: 'Brutal HP & speed. Almost no margin.' },
  };
  const DIFF_ORDER = ['easy', 'normal', 'hard', 'insane'];

  const TOWERS = {
    blaster: { name: 'Blaster', cost: 50, range: 118, fireRate: 340, damage: 11, projSpeed: 420, kind: 'bolt', color: 'rgba(60,140,255,1)' },
    cannon:  { name: 'Cannon',  cost: 120, range: 108, fireRate: 1150, damage: 34, splash: 48, projSpeed: 300, kind: 'shell', color: 'rgba(255,160,80,1)' },
    frost:   { name: 'Frost',   cost: 80, range: 104, fireRate: 520, damage: 5, slowMul: 0.45, slowDur: 1200, kind: 'beam', color: 'rgba(120,220,255,1)' },
    rail:    { name: 'Rail Gun', cost: 150, range: 175, fireRate: 1000, damage: 30, kind: 'rail', pierce: 5, beamWidth: 9, color: 'rgba(190,120,255,1)' },
  };
  // Per-level multipliers (index by tower level 1..3).
  const LVL_DMG = [0, 1, 1.65, 2.5], LVL_RANGE = [0, 0, 12, 24], LVL_RATE = [0, 1, 0.85, 0.72];

  const ENEMIES = {
    drone: { name: 'Drone', hp: 32, speed: 62, reward: 7, leak: 1, size: 11, shape: 'diamond', color: 'rgba(90,200,255,1)' },
    scout: { name: 'Scout', hp: 18, speed: 118, reward: 6, leak: 1, size: 9, shape: 'tri', color: 'rgba(240,220,90,1)' },
    racer: { name: 'Racer', hp: 14, speed: 178, reward: 9, leak: 1, size: 8, shape: 'dart', color: 'rgba(120,255,160,1)' },
    tank:  { name: 'Tank',  hp: 150, speed: 38, reward: 18, leak: 2, size: 14, shape: 'square', color: 'rgba(255,135,70,1)' },
    boss:  { name: 'Boss',  hp: 1300, speed: 30, reward: 180, leak: 10, size: 21, shape: 'hex', color: 'rgba(230,90,220,1)' },
  };

  // ── State ───────────────────────────────────────────────────────────────────
  let gold, lives, score, wave, towers, enemies, projectiles, effects;
  let started, paused, ended, victory;
  let spawnGroups, lastBonusedWave, autoTimer;
  let selectedBuild, selectedTower;
  let mouseCell = { c: -1, r: -1 };
  let now = 0;
  let diffKey = 'easy';                 // persists across reset() so R retries same tier
  const diff = () => DIFFICULTIES[diffKey];

  function reset() {
    const d = diff();
    gold = d.gold; lives = d.lives; score = 0; wave = 0;
    towers = []; enemies = []; projectiles = []; effects = [];
    started = false; paused = false; ended = false; victory = false;
    spawnGroups = []; lastBonusedWave = 0; autoTimer = -1;
    selectedBuild = null; selectedTower = null;
    recomputeFlow();
    syncHud(); syncPalette(); syncInfo(); syncDiff();
  }

  // ── Waves ───────────────────────────────────────────────────────────────────
  // Wave composition scales across 100 waves. Counts are *capped* so the field never
  // floods (keeps it performant & readable); past the caps, difficulty comes from the
  // per-wave HP scaling in spawnEnemy and from more frequent / multiple bosses.
  function buildWave(n) {
    const q = [];
    const push = (type, count, gap) => { for (let i = 0; i < count; i++) q.push({ type, gap }); };
    const isBoss = n % 10 === 0;          // boss wave every 10th
    const rush = n % 5 === 0 && !isBoss;  // scout rush on 5,15,25,...
    const heavy = n % 7 === 0 && !isBoss; // tank-heavy on 7,14,...

    push('drone', Math.min(8 + Math.floor(n * 0.9), 34), Math.max(0.26, 0.6 - n * 0.0035));
    if (n >= 2) {
      let scouts = 3 + Math.floor(n * 0.55) + (rush ? 14 : 0);
      push('scout', Math.min(scouts, 34), Math.max(0.18, 0.4 - n * 0.0025));
    }
    if (n >= 6) {
      let racers = 2 + Math.floor(n * 0.4) + (rush ? 8 : 0);
      push('racer', Math.min(racers, 24), Math.max(0.2, 0.45 - n * 0.003));
    }
    if (n >= 4) {
      let tanks = 1 + Math.floor(n / 5) + (heavy ? 6 : 0);
      push('tank', Math.min(tanks, 20), Math.max(0.45, 0.95 - n * 0.005));
    }
    if (isBoss) push('boss', Math.min(1 + Math.floor(n / 30), 4), 2.0);
    return q;
  }

  // A wave is "in flight" while it is still spawning OR still has a living enemy.
  function wavesInFlight() {
    const set = new Set();
    for (const g of spawnGroups) if (g.index < g.queue.length) set.add(g.wave);
    for (const e of enemies) set.add(e.wave);
    return set.size;
  }

  function startWave() {
    if (ended || wave >= MAX_WAVES) return;
    if (wavesInFlight() >= MAX_IN_FLIGHT) return; // cap concurrent waves on the field
    const wasIdle = !started && wave === 0;
    started = true;
    autoTimer = -1; // a manual send cancels any pending auto-start
    wave++;
    // Push a new spawn group. Groups run concurrently, so the player can send the
    // next wave while the current one is still on the field. timer:999 = spawn now.
    spawnGroups.push({ queue: buildWave(wave), index: 0, timer: 999, wave });
    if (wasIdle) syncDiff(); // first send locks the difficulty selector
    syncHud();
  }

  function spawnEnemy(type, waveNum) {
    const base = ENEMIES[type], d = diff();
    const hpScale = type === 'boss' ? 1 + (waveNum - 1) * 0.07 : 1 + (waveNum - 1) * 0.11;
    const hp = Math.round(base.hp * hpScale * d.hpMul);
    const reward = Math.max(1, Math.round(base.reward * (1 + (waveNum - 1) * 0.035) * d.rewardMul));
    const sp = center(ENTRY.c, ENTRY.r);
    enemies.push({
      type, wave: waveNum,
      x: sp.x - TILE, y: sp.y,           // slide in from off-screen left
      cellC: ENTRY.c - 1, cellR: ENTRY.r,
      tgt: { x: sp.x, y: sp.y, c: ENTRY.c, r: ENTRY.r, dir: { dc: 1, dr: 0 } },
      lastDir: { dc: 1, dr: 0 },
      hp, maxHp: hp, speed: base.speed * d.spdMul, reward, leak: base.leak,
      size: base.size, shape: base.shape, color: base.color,
      traveled: 0, exitDist: Infinity, slowUntil: 0, slowMul: 1, dead: false, hitFlash: 0,
    });
  }

  // ── Combat helpers ──────────────────────────────────────────────────────────
  function towerStat(t) {
    const b = TOWERS[t.type], L = t.level;
    return {
      range: b.range + LVL_RANGE[L],
      damage: b.damage * LVL_DMG[L],
      fireRate: b.fireRate * LVL_RATE[L],
    };
  }

  function findTarget(t, range) {
    // Target the enemy nearest the core within range (classic "first"): lowest
    // flow-distance to the EXIT, breaking ties by distance already travelled.
    let best = null, bestProg = Infinity, bestTrav = -1;
    const r2 = range * range;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - t.x, dy = e.y - t.y;
      if (dx * dx + dy * dy > r2) continue;
      if (e.exitDist < bestProg || (e.exitDist === bestProg && e.traveled > bestTrav)) {
        best = e; bestProg = e.exitDist; bestTrav = e.traveled;
      }
    }
    return best;
  }

  function damageEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hitFlash = now + 60;
    if (e.hp <= 0) {
      e.dead = true;
      gold += e.reward; score += e.reward;
      effects.push({ kind: 'boom', x: e.x, y: e.y, r0: e.size, r1: e.size + 18, t0: now, dur: 320, color: e.color });
    }
  }

  function fire(t, target) {
    const s = towerStat(t);
    const b = TOWERS[t.type];
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    if (b.kind === 'beam') {
      damageEnemy(target, s.damage);
      target.slowUntil = now + b.slowDur; target.slowMul = b.slowMul;
      effects.push({ kind: 'beam', x1: t.x, y1: t.y, x2: target.x, y2: target.y, t0: now, dur: 130, color: b.color });
    } else if (b.kind === 'rail') {
      // Hitscan: fire a straight line toward the target; pierce the first `pierce`
      // enemies it crosses (those within beamWidth of the ray, nearest first).
      const dx = Math.cos(t.angle), dy = Math.sin(t.angle), range = s.range;
      const hits = [];
      for (const e of enemies) {
        if (e.dead) continue;
        const ex = e.x - t.x, ey = e.y - t.y;
        const along = ex * dx + ey * dy;            // distance projected along the beam
        if (along < 0 || along > range) continue;   // behind the tower or out of range
        const perp = Math.abs(ex * dy - ey * dx);   // perpendicular offset from the beam
        if (perp <= b.beamWidth + e.size * 0.5) hits.push({ e, along });
      }
      hits.sort((h1, h2) => h1.along - h2.along);
      for (let i = 0; i < hits.length && i < b.pierce; i++) damageEnemy(hits[i].e, s.damage);
      effects.push({ kind: 'rail', x1: t.x, y1: t.y, x2: t.x + dx * range, y2: t.y + dy * range, t0: now, dur: 200, color: b.color });
    } else {
      projectiles.push({
        x: t.x, y: t.y, target, tx: target.x, ty: target.y,
        speed: b.projSpeed, damage: s.damage, kind: b.kind,
        splash: b.splash || 0, color: b.color, dead: false,
      });
    }
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function update(dt) {
    // Spawning — each active group advances on its own clock, so waves overlap.
    for (const g of spawnGroups) {
      if (g.index >= g.queue.length) continue;
      g.timer += dt;
      if (g.timer >= g.queue[g.index].gap) {
        spawnEnemy(g.queue[g.index].type, g.wave);
        g.index++; g.timer = 0;
      }
    }

    // Enemies — follow the flow field cell-by-cell toward the EXIT.
    for (const e of enemies) {
      if (e.dead) continue;
      const slow = e.slowUntil > now ? e.slowMul : 1;
      let step = e.speed * slow * dt;
      while (step > 0 && !e.dead) {
        if (!e.tgt) assignTarget(e);
        const dx = e.tgt.x - e.x, dy = e.tgt.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= step) {
          e.x = e.tgt.x; e.y = e.tgt.y; e.traveled += d; step -= d;
          if (e.tgt.leak) { // crossed the core
            e.dead = true; lives -= e.leak;
            effects.push({ kind: 'leak', x: W, y: center(EXIT.c, EXIT.r).y, t0: now, dur: 280 });
            if (lives <= 0) { lives = 0; ended = true; victory = false; }
            break;
          }
          e.cellC = e.tgt.c; e.cellR = e.tgt.r; e.lastDir = e.tgt.dir;
          e.tgt = null;
        } else {
          e.x += (dx / d) * step; e.y += (dy / d) * step; e.traveled += step; step = 0;
        }
      }
      if (!e.dead) e.exitDist = distAt(e.cellC, e.cellR);
    }

    // Towers fire
    for (const t of towers) {
      const s = towerStat(t);
      t.cd = (t.cd || 0) - dt * 1000;
      const target = findTarget(t, s.range);
      if (target) {
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        if (t.cd <= 0) { fire(t, target); t.cd = s.fireRate; }
      }
    }

    // Projectiles
    for (const p of projectiles) {
      if (p.dead) continue;
      if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step || d < 1) {
        p.dead = true;
        if (p.kind === 'shell') {
          effects.push({ kind: 'boom', x: p.tx, y: p.ty, r0: 4, r1: p.splash, t0: now, dur: 300, color: p.color });
          const r2 = p.splash * p.splash;
          // Splash hits at most SPLASH_MAX enemies — the ones closest to the impact.
          const hits = [];
          for (const e of enemies) {
            if (e.dead) continue;
            const ex = e.x - p.tx, ey = e.y - p.ty;
            const d2 = ex * ex + ey * ey;
            if (d2 <= r2) hits.push({ e, d2 });
          }
          hits.sort((a, b) => a.d2 - b.d2);
          for (let i = 0; i < hits.length && i < SPLASH_MAX; i++) damageEnemy(hits[i].e, p.damage);
        } else if (p.target && !p.target.dead) {
          damageEnemy(p.target, p.damage);
        }
      } else {
        p.x += (dx / d) * step; p.y += (dy / d) * step;
      }
    }

    // Cull
    enemies = enemies.filter(e => !e.dead);
    projectiles = projectiles.filter(p => !p.dead);
    effects = effects.filter(f => now - f.t0 < f.dur);

    // Drop spawn groups that have finished emitting all their enemies.
    if (spawnGroups.length && spawnGroups.every(g => g.index >= g.queue.length)) spawnGroups = [];

    // Field clear = every sent wave fully emitted and no enemies left alive. Pay any
    // not-yet-banked wave-clear bonuses (one per completed wave, covers early sends),
    // then begin the 5s auto-advance countdown — unless that was the final wave.
    const clear = spawnGroups.length === 0 && enemies.length === 0;
    if (clear && started && !ended && lastBonusedWave < wave) {
      for (let w = lastBonusedWave + 1; w <= wave; w++) gold += Math.round((40 + w * 8) * diff().bonusMul);
      lastBonusedWave = wave;
      if (wave >= MAX_WAVES) { victory = true; ended = true; }
      else if (autoTimer < 0) autoTimer = AUTO_DELAY;
    }
    if (autoTimer >= 0 && !ended) {
      autoTimer -= dt;
      if (autoTimer <= 0) startWave(); // startWave resets autoTimer to -1
    }

    syncHud();
  }

  // ── Rendering ───────────────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = 'rgba(60,140,255,0.06)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * TILE, 0); ctx.lineTo(c * TILE, H); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * TILE); ctx.lineTo(W, r * TILE); ctx.stroke(); }

    // current route the swarm takes (entry → exit), recomputed as towers change
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (routePts.length) {
      ctx.strokeStyle = 'rgba(40,70,130,0.55)'; ctx.lineWidth = 26;
      drawRoute();
      ctx.strokeStyle = 'rgba(60,140,255,0.18)'; ctx.lineWidth = 26;
      ctx.setLineDash([2, 14]); drawRoute(); ctx.setLineDash([]);
    }

    // entry portal
    const ent = center(ENTRY.c, ENTRY.r);
    const eg = ctx.createRadialGradient(2, ent.y, 3, 2, ent.y, 30);
    eg.addColorStop(0, 'rgba(120,255,170,0.8)'); eg.addColorStop(1, 'rgba(60,200,140,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(2, ent.y, 30, 0, Math.PI * 2); ctx.fill();

    // core / exit
    const exit = center(EXIT.c, EXIT.r);
    const cgx = ctx.createRadialGradient(W - 6, exit.y, 4, W - 6, exit.y, 34);
    cgx.addColorStop(0, 'rgba(120,200,255,0.9)'); cgx.addColorStop(1, 'rgba(60,140,255,0)');
    ctx.fillStyle = cgx;
    ctx.beginPath(); ctx.arc(W - 6, exit.y, 34, 0, Math.PI * 2); ctx.fill();

    // build hints on empty cells (ghost flags the few that would seal the maze)
    if (selectedBuild) {
      ctx.fillStyle = 'rgba(60,140,255,0.12)';
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (isOpenCell(c, r)) ctx.fillRect(c * TILE + 4, r * TILE + 4, TILE - 8, TILE - 8);
      }
    }

    towers.forEach(drawTower);
    if (selectedTower) drawRange(selectedTower, towerStat(selectedTower).range, 'rgba(60,140,255,0.5)');

    // build ghost
    if (selectedBuild && mouseCell.c >= 0) {
      const c = mouseCell.c, r = mouseCell.r;
      const ok = isBuildable(c, r) && gold >= TOWERS[selectedBuild].cost;
      const p = center(c, r);
      ctx.globalAlpha = 0.55;
      drawTowerShape(p.x, p.y, selectedBuild, 0, ok ? TOWERS[selectedBuild].color : 'rgba(255,80,80,1)');
      ctx.globalAlpha = 1;
      drawRange({ x: p.x, y: p.y }, TOWERS[selectedBuild].range, ok ? 'rgba(60,140,255,0.4)' : 'rgba(255,80,80,0.4)');
    }

    projectiles.forEach(drawProjectile);
    enemies.forEach(drawEnemy);
    effects.forEach(drawEffect);

    if (!started) overlay('ORBITAL DEFENSE', 'Difficulty: ' + diff().name + ' — ' + diff().desc + '\nBuild towers to maze the swarm, then press START WAVE.');
    else if (ended) overlay(victory ? 'VICTORY' : 'CORE LOST', victory
      ? 'All ' + MAX_WAVES + ' waves repelled!  Score: ' + score + '\nPress R to play again.'
      : 'The swarm overran your core.\nReached wave ' + wave + '.  Press R to retry.');
    else if (paused) overlay('PAUSED', 'Press P to resume.');
  }

  function drawRoute() {
    const a = routePts[0], b = routePts[routePts.length - 1];
    ctx.beginPath();
    ctx.moveTo(0, a.y);                 // extend off the left edge (entry)
    for (let i = 0; i < routePts.length; i++) ctx.lineTo(routePts[i].x, routePts[i].y);
    ctx.lineTo(W, b.y);                 // extend off the right edge (core)
    ctx.stroke();
  }

  function drawRange(t, range, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, range, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.06)');
    ctx.fill();
  }

  function drawTower(t) {
    drawTowerShape(t.x, t.y, t.type, t.angle || 0, TOWERS[t.type].color);
    if (t.level > 1) {
      ctx.fillStyle = 'rgba(255,225,120,1)';
      ctx.font = '9px Courier New';
      for (let i = 0; i < t.level - 1; i++) ctx.fillText('*', t.x - 6 + i * 6, t.y + TILE / 2 - 3);
    }
  }

  function drawTowerShape(x, y, type, angle, color) {
    const b = TOWERS[type];
    // base
    ctx.fillStyle = 'rgba(25,45,80,0.95)';
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    roundRect(x - 15, y - 15, 30, 30, 6); ctx.fill(); ctx.stroke();
    // turret
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = color;
    if (type === 'cannon') {
      ctx.fillRect(0, -5, 18, 10);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'frost') {
      ctx.fillRect(0, -3, 16, 6);
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke();
    } else if (type === 'rail') {
      ctx.fillRect(0, -2.5, 23, 5);          // long thin barrel
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(19, -1.5, 5, 3);          // bright muzzle tip
    } else {
      ctx.fillRect(0, -3, 17, 6);
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    const s = e.size;
    ctx.save(); ctx.translate(e.x, e.y);
    const flash = e.hitFlash > now;
    ctx.fillStyle = flash ? 'rgba(255,255,255,0.95)' : e.color;
    ctx.shadowColor = e.color; ctx.shadowBlur = 8;
    ctx.beginPath();
    if (e.shape === 'diamond') { ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath(); }
    else if (e.shape === 'tri') { ctx.moveTo(s, 0); ctx.lineTo(-s, -s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); }
    else if (e.shape === 'square') { ctx.rect(-s, -s, s * 2, s * 2); }
    else if (e.shape === 'dart') { ctx.moveTo(s * 1.4, 0); ctx.lineTo(-s, -s * 0.85); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s, s * 0.85); ctx.closePath(); }
    else { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const fn = i ? 'lineTo' : 'moveTo'; ctx[fn](Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath(); }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    // slow tint ring
    if (e.slowUntil > now) {
      ctx.strokeStyle = 'rgba(120,220,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, s + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // hp bar
    const w = s * 2, frac = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y - s - 8, w, 4);
    ctx.fillStyle = frac > 0.5 ? 'rgba(120,230,120,1)' : frac > 0.25 ? 'rgba(255,225,120,1)' : 'rgba(255,90,90,1)';
    ctx.fillRect(e.x - w / 2, e.y - s - 8, w * frac, 4);
  }

  function drawProjectile(p) {
    // No shadowBlur here: projectiles are by far the most numerous draw in a dense
    // late-wave maze, and glow is the costliest canvas op. Bright fill reads fine.
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'shell' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
    if (p.kind === 'shell') { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function drawEffect(f) {
    const k = (now - f.t0) / f.dur;
    if (f.kind === 'beam') {
      ctx.strokeStyle = f.color; ctx.lineWidth = 3 * (1 - k);
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'rail') {
      const a = 1 - k;
      ctx.globalAlpha = a;
      ctx.strokeStyle = f.color; ctx.lineWidth = 4 * a + 1;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5 * a;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'boom') {
      const r = f.r0 + (f.r1 - f.r0) * k;
      ctx.strokeStyle = f.color; ctx.lineWidth = 2.5 * (1 - k); ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'leak') {
      ctx.fillStyle = 'rgba(255,80,80,' + (1 - k) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, 30 * (1 - k) + 10, 0, Math.PI * 2); ctx.fill();
    }
  }

  function overlay(title, sub) {
    ctx.fillStyle = 'rgba(5,8,16,0.78)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(60,140,255,1)';
    ctx.shadowColor = 'rgba(60,140,255,0.6)'; ctx.shadowBlur = 18;
    ctx.font = 'bold 42px Courier New';
    ctx.fillText(title, W / 2, H / 2 - 30);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(200,220,255,0.85)';
    ctx.font = '16px Courier New';
    sub.split('\n').forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + 18 + i * 26));
    ctx.textAlign = 'left';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ── Build / interaction ─────────────────────────────────────────────────────
  // Empty, in-bounds, and not the entry/exit gateway — but says nothing about sealing.
  function isOpenCell(c, r) {
    if (!inBounds(c, r)) return false;
    if ((c === ENTRY.c && r === ENTRY.r) || (c === EXIT.c && r === EXIT.r)) return false;
    return !towerAt(c, r);
  }
  // Buildable = open AND placing here keeps a route open for the spawn and every enemy.
  function isBuildable(c, r) { return isOpenCell(c, r) && pathOkWith(c, r); }
  function towerAt(c, r) { return towers.find(t => t.c === c && t.r === r); }

  function placeTower(c, r) {
    const def = TOWERS[selectedBuild];
    if (!isBuildable(c, r) || gold < def.cost) return;
    const p = center(c, r);
    gold -= def.cost;
    towers.push({ type: selectedBuild, c, r, x: p.x, y: p.y, level: 1, cd: 0, angle: -Math.PI / 2, invested: def.cost });
    recomputeFlow(); // reshape the maze and re-route live enemies
    syncHud(); syncPalette();
  }

  function upgradeTower(t) {
    if (t.level >= 3) return;
    const cost = Math.round(TOWERS[t.type].cost * 0.75 * t.level);
    if (gold < cost) return;
    gold -= cost; t.invested += cost; t.level++;
    syncHud(); syncInfo();
  }

  function sellTower(t) {
    const refund = Math.round(t.invested * 0.6);
    gold += refund;
    towers = towers.filter(x => x !== t);
    selectedTower = null;
    recomputeFlow(); // opening a cell can shorten the route for live enemies
    syncHud(); syncInfo();
  }

  // ── HUD sync ────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  function syncHud() {
    $('goldVal').textContent = Math.floor(gold);
    $('livesVal').textContent = lives;
    $('waveVal').textContent = wave + '/' + MAX_WAVES;
    $('scoreVal').textContent = score;
    const btn = $('startBtn');
    const inProgress = enemies.length > 0 || spawnGroups.length > 0;
    if (ended) { btn.textContent = 'DONE'; btn.disabled = true; }
    else if (wave >= MAX_WAVES) { btn.textContent = 'ALL SENT'; btn.disabled = true; }
    else if (autoTimer >= 0) { btn.textContent = 'NEXT IN ' + Math.ceil(autoTimer) + 's'; btn.disabled = false; }
    else if (inProgress) {
      if (wavesInFlight() >= MAX_IN_FLIGHT) { btn.textContent = 'MAX ' + MAX_IN_FLIGHT + ' IN FLIGHT'; btn.disabled = true; }
      else { btn.textContent = 'SEND WAVE ' + (wave + 1); btn.disabled = false; }
    }
    else { btn.textContent = 'START WAVE'; btn.disabled = false; }
  }
  function syncPalette() {
    document.querySelectorAll('.twr-btn').forEach(btn => {
      const type = btn.dataset.type;
      btn.classList.toggle('sel', selectedBuild === type);
      btn.classList.toggle('broke', gold < TOWERS[type].cost);
    });
  }
  // Difficulty can only be changed before the run begins; lock the selector after that.
  function diffLocked() { return started || wave > 0; }
  function syncDiff() {
    const locked = diffLocked();
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.classList.toggle('sel', btn.dataset.diff === diffKey);
      btn.disabled = locked && btn.dataset.diff !== diffKey;
      btn.classList.toggle('locked', locked);
    });
  }
  function syncInfo() {
    const el = $('info');
    if (!selectedTower) { el.innerHTML = ''; return; }
    const t = selectedTower, b = TOWERS[t.type], s = towerStat(t);
    let html = '<b style="color:' + b.color + '">' + b.name + ' Lv' + t.level + '</b>'
      + ' &middot; DMG ' + s.damage.toFixed(0)
      + ' &middot; RNG ' + s.range.toFixed(0)
      + ' &middot; RATE ' + (1000 / s.fireRate).toFixed(1) + '/s';
    if (t.level < 3) {
      const ucost = Math.round(b.cost * 0.75 * t.level);
      html += ' <button class="ibtn" id="upBtn">UPGRADE (' + ucost + 'g)</button>';
    } else html += ' <span style="color:rgba(255,225,120,1)">MAX LEVEL</span>';
    html += ' <button class="ibtn sell" id="sellBtn">SELL (' + Math.round(t.invested * 0.6) + 'g)</button>';
    el.innerHTML = html;
    const up = $('upBtn'); if (up) up.onclick = () => upgradeTower(t);
    $('sellBtn').onclick = () => sellTower(t);
  }

  // ── Input ───────────────────────────────────────────────────────────────────
  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
  }

  canvas.addEventListener('mousemove', e => { mouseCell = cellFromEvent(e); });
  canvas.addEventListener('mouseleave', () => { mouseCell = { c: -1, r: -1 }; });

  canvas.addEventListener('click', e => {
    if (ended) return;
    const { c, r } = cellFromEvent(e);
    const existing = towerAt(c, r);
    if (existing) { selectedTower = existing; selectedBuild = null; syncPalette(); syncInfo(); return; }
    if (selectedBuild) { placeTower(c, r); return; }
    selectedTower = null; syncInfo();
  });

  function selectBuild(type) {
    selectedBuild = selectedBuild === type ? null : type;
    selectedTower = null;
    syncPalette(); syncInfo();
  }
  function selectDifficulty(key) {
    if (diffLocked() || !DIFFICULTIES[key] || key === diffKey) return;
    diffKey = key;
    reset(); // re-applies starting gold/lives and re-syncs the selector
  }
  document.querySelectorAll('.twr-btn').forEach(btn => btn.addEventListener('click', () => selectBuild(btn.dataset.type)));
  document.querySelectorAll('.diff-btn').forEach(btn => btn.addEventListener('click', () => selectDifficulty(btn.dataset.diff)));
  $('startBtn').addEventListener('click', startWave);
  $('pauseBtn').addEventListener('click', () => { if (started && !ended) paused = !paused; });

  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === '1') selectBuild('blaster');
    else if (k === '2') selectBuild('cannon');
    else if (k === '3') selectBuild('frost');
    else if (k === '4') selectBuild('rail');
    else if (k === ' ') { e.preventDefault(); startWave(); }
    else if (k === 'p') { if (started && !ended) paused = !paused; }
    else if (k === 'escape') { selectedBuild = null; selectedTower = null; syncPalette(); syncInfo(); }
    else if (k === 'r') { reset(); }
  });

  // ── Loop ────────────────────────────────────────────────────────────────────
  let last = 0;
  function loop(ts) {
    now = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    if (started && !paused && !ended) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  reset();
  requestAnimationFrame(ts => { last = ts; requestAnimationFrame(loop); });
})();
