/* Castle Siege — a self-contained tower defense game where you build a castle.
   Pure canvas + JS, no dependencies. Forked from tower_defense/ (Orbital Defense);
   the maze BFS is replaced with a weighted Dijkstra field over DESTRUCTIBLE walls:
   enemies path around strong walls but batter down weak ones, so a sealed castle
   is legal — the horde simply breaches the cheapest stone. */
(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // ── Grid / geometry ─────────────────────────────────────────────────────────
  const TILE = 40, COLS = 24, ROWS = 16;
  const W = COLS * TILE, H = ROWS * TILE;
  const center = (c, r) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const idx = (c, r) => r * COLS + c;
  const inBounds = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  // The outer ring of cells is enemy territory: spawns land there, nothing builds there.
  const isBorder = (c, r) => c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1;

  // The keep is a single 2×2 building dead center; all four grid cells point at it.
  const KEEP_C = 11, KEEP_R = 7;
  const KEEP_CELLS = [[11, 7], [12, 7], [11, 8], [12, 8]];
  const isKeepCell = (c, r) => c >= KEEP_C && c <= KEEP_C + 1 && r >= KEEP_R && r <= KEEP_R + 1;
  const KEEP_X = (KEEP_C + 1) * TILE, KEEP_Y = (KEEP_R + 1) * TILE;

  // ── Config ──────────────────────────────────────────────────────────────────
  const MAX_WAVES = 50, AUTO_DELAY = 5;
  const MAX_IN_FLIGHT = 3;  // most waves allowed on the field at once
  const SPLASH_MAX = 5;     // most enemies a single catapult rock can hit
  // Breach economics: entering a building cell costs 1 + ceil(hp/HP_BUCKET)*BREACH_STEP
  // "steps", so a fresh wall (100hp → 13) repels routing while a battered one (≤25hp → 4)
  // becomes the horde's chosen breach point. Bucketing means wall chip-damage only
  // re-plans the field when hp crosses a 25-point boundary, not on every swing.
  const HP_BUCKET = 25, BREACH_STEP = 3;

  const DIFFICULTIES = {
    easy:   { name: 'EASY',   gold: 220, keepHp: 150, hpMul: 1.00, spdMul: 1.00, rewardMul: 1.00, bonusMul: 1.00, desc: 'Generous gold, sturdy keep.' },
    normal: { name: 'NORMAL', gold: 180, keepHp: 120, hpMul: 1.35, spdMul: 1.08, rewardMul: 0.90, bonusMul: 0.85, desc: 'Tougher raiders, leaner economy.' },
    hard:   { name: 'HARD',   gold: 150, keepHp: 90,  hpMul: 1.80, spdMul: 1.16, rewardMul: 0.80, bonusMul: 0.70, desc: 'Beefy hordes, fragile keep.' },
    insane: { name: 'INSANE', gold: 120, keepHp: 60,  hpMul: 2.50, spdMul: 1.25, rewardMul: 0.72, bonusMul: 0.60, desc: 'Brutal HP & speed. Almost no margin.' },
  };

  // Every placeable piece is a "building": it occupies a cell, blocks movement, has HP,
  // and can be battered down. Towers are buildings that also shoot.
  const BUILDS = {
    wall:     { name: 'Wall',     cost: 5,  hp: 100 },
    gate:     { name: 'Gate',     cost: 12, hp: 80 },
    archer:   { name: 'Archer',   cost: 40, hp: 120, isTower: true, range: 120, fireRate: 400,  damage: 9,  projSpeed: 480, kind: 'arrow', color: 'rgba(120,220,150,1)' },
    mage:     { name: 'Mage',     cost: 70, hp: 100, isTower: true, range: 110, fireRate: 700,  damage: 6,  projSpeed: 300, kind: 'bolt', slowMul: 0.5, slowDur: 1200, color: 'rgba(120,200,255,1)' },
    catapult: { name: 'Catapult', cost: 90, hp: 150, isTower: true, range: 150, fireRate: 1600, damage: 30, projSpeed: 240, kind: 'rock', splash: 55, color: 'rgba(255,160,80,1)' },
  };
  // Per-level multipliers (index by tower level 1..3).
  const LVL_DMG = [0, 1, 1.65, 2.5], LVL_RANGE = [0, 0, 12, 24], LVL_RATE = [0, 1, 0.85, 0.72];

  // bDmg/atkGap: melee swing against buildings. Sappers hit a full HP bucket per swing.
  const ENEMIES = {
    raider:  { name: 'Raider',  hp: 35,   speed: 60,  reward: 7,   bDmg: 6,  atkGap: 0.8, size: 11, color: 'rgba(215,95,70,1)' },
    runner:  { name: 'Runner',  hp: 16,   speed: 130, reward: 6,   bDmg: 3,  atkGap: 0.7, size: 9,  color: 'rgba(240,220,90,1)' },
    sapper:  { name: 'Sapper',  hp: 45,   speed: 55,  reward: 12,  bDmg: 25, atkGap: 1.0, size: 10, color: 'rgba(255,150,60,1)' },
    ogre:    { name: 'Ogre',    hp: 170,  speed: 34,  reward: 20,  bDmg: 20, atkGap: 1.2, size: 15, color: 'rgba(150,175,110,1)' },
    warlord: { name: 'Warlord', hp: 1400, speed: 28,  reward: 200, bDmg: 60, atkGap: 1.5, size: 21, color: 'rgba(200,90,220,1)' },
  };

  // ── State ───────────────────────────────────────────────────────────────────
  let gold, score, wave, keep, grid, buildings, enemies, knights, projectiles, effects;
  let started, paused, ended, victory;
  let spawnGroups, lastBonusedWave, autoTimer, nextSpawns;
  let selectedBuild, selectedBldg;
  let mouseCell = { c: -1, r: -1 };
  let now = 0;
  let diffKey = 'easy';                 // persists across reset() so R retries same tier
  const diff = () => DIFFICULTIES[diffKey];

  let distField = new Float64Array(COLS * ROWS);
  let routes = [];        // cached breach-route previews, one per active spawn
  let flowDirty = false;  // set by any board change; settled once per frame in loop()

  function reset() {
    const d = diff();
    gold = d.gold; score = 0; wave = 0;
    keep = { kind: 'keep', c: KEEP_C, r: KEEP_R, x: KEEP_X, y: KEEP_Y, hp: d.keepHp, maxHp: d.keepHp };
    grid = new Array(COLS * ROWS).fill(null);
    for (const [c, r] of KEEP_CELLS) grid[idx(c, r)] = keep;
    buildings = []; enemies = []; knights = []; projectiles = []; effects = [];
    started = false; paused = false; ended = false; victory = false;
    spawnGroups = []; lastBonusedWave = 0; autoTimer = -1;
    selectedBuild = null; selectedBldg = null;
    nextSpawns = pickSpawns(1);
    recomputeFlow(); flowDirty = false;
    $('pauseBtn').textContent = 'PAUSE';
    syncHud(); syncPalette(); syncInfo(); syncDiff();
  }

  // ── Pathfinding: weighted Dijkstra flow field ───────────────────────────────
  // distField[i] = cost (open steps + breach surcharges) for an enemy standing at
  // cell i to reach the keep. Buildings are never impassable — just expensive — so
  // the field is finite everywhere and a fully walled-in keep still gets besieged.
  function cellCost(c, r) {
    const b = grid[idx(c, r)];
    if (!b) return 1;
    if (b.kind === 'keep') return 1;                 // uniform terminus; adjacency → attack
    if (b.kind === 'gate' && b.open) return 1;       // open gate: free passage
    return 1 + Math.ceil(b.hp / HP_BUCKET) * BREACH_STEP;
  }

  function computeField() {
    const n = COLS * ROWS;
    const d = new Float64Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    for (const [c, r] of KEEP_CELLS) d[idx(c, r)] = 0;
    // 384 cells: linear min-extraction beats heap bookkeeping at this size.
    for (let iter = 0; iter < n; iter++) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && d[i] < bd) { bd = d[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      const uc = u % COLS, ur = (u / COLS) | 0;
      // Cost is paid on ENTERING a cell: a neighbor stepping into u pays to break u.
      const viaU = bd + cellCost(uc, ur);
      for (const [dc, dr] of DIRS) {
        const nc = uc + dc, nr = ur + dr;
        if (!inBounds(nc, nr)) continue;
        const ni = idx(nc, nr);
        if (!done[ni] && d[ni] > viaU) d[ni] = viaU;
      }
    }
    distField = d;
  }

  const distAt = (c, r) => (inBounds(c, r) ? distField[idx(c, r)] : Infinity);

  // Best next cell from (c,r): minimize entry-cost + remaining field cost. Building
  // cells ARE candidates — stepping "into" one means besieging it. Ties keep heading.
  function flowNext(c, r, lastDir) {
    let best = null, bestScore = Infinity;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (!inBounds(nc, nr)) continue;
      const nd = distField[idx(nc, nr)];
      if (nd === Infinity) continue;
      const score = nd + cellCost(nc, nr);
      if (score < bestScore ||
          (score === bestScore && lastDir && dc === lastDir.dc && dr === lastDir.dr)) {
        bestScore = score; best = { c: nc, r: nr, dc, dr };
      }
    }
    return best;
  }

  // Trace a spawn's planned route to the keep, recording where it smashes through.
  function traceRoute(sc, sr) {
    const pts = [center(sc, sr)], breaches = [];
    let c = sc, r = sr, last = null, guard = 0;
    while (!isKeepCell(c, r) && guard++ < COLS * ROWS) {
      const nx = flowNext(c, r, last);
      if (!nx) break;
      last = { dc: nx.dc, dr: nx.dr };
      c = nx.c; r = nx.r;
      pts.push(center(c, r));
      const b = grid[idx(c, r)];
      if (b && b.kind !== 'keep' && !(b.kind === 'gate' && b.open)) breaches.push(center(c, r));
    }
    return { pts, breaches };
  }

  function activeSpawns() {
    const seen = new Set(), out = [];
    const add = s => { const k = s.c + ',' + s.r; if (!seen.has(k)) { seen.add(k); out.push(s); } };
    for (const g of spawnGroups) for (const s of g.spawns) add(s);
    for (const s of nextSpawns) add(s);
    return out;
  }

  function recomputeFlow() {
    computeField();
    routes = activeSpawns().map(s => traceRoute(s.c, s.r));
    // Force live enemies to re-plan: a fresh breach may open a cheaper road, or the
    // wall they were battering may no longer be the weak point. Remember who each
    // attacker was hitting so re-acquiring the same building keeps its swing timer —
    // otherwise every re-plan would reset slow units and gate-spam could stall sieges.
    for (const e of enemies) if (!e.dead) { e.tgt = null; e.prevAttack = e.attackTarget || e.prevAttack; e.attackTarget = null; }
  }

  // Board changed (place/sell/destroy/gate/HP-bucket). Settled once per frame in loop().
  function markFlowDirty() { flowDirty = true; }

  // Pick the enemy's next move: walk toward the cheapest neighbor, or lay siege to
  // whatever building stands in that cell.
  function assignTarget(e) {
    const nx = flowNext(e.cellC, e.cellR, e.lastDir);
    if (!nx) return; // field is finite everywhere, so this only fires off-grid; idle a frame
    const prev = e.prevAttack; e.prevAttack = null;
    const b = grid[idx(nx.c, nx.r)];
    if (b && !(b.kind === 'gate' && b.open)) {
      e.attackTarget = b;
      if (b !== prev) e.atkTimer = 0; // same wall as before the re-plan → keep swing progress
      e.attackDir = { dc: nx.dc, dr: nx.dr };
      return;
    }
    const p = center(nx.c, nx.r);
    e.tgt = { x: p.x, y: p.y, c: nx.c, r: nx.r, dir: { dc: nx.dc, dr: nx.dr } };
  }

  // ── Waves ───────────────────────────────────────────────────────────────────
  function buildWave(n) {
    const q = [];
    const push = (type, count, gap) => { for (let i = 0; i < count; i++) q.push({ type, gap }); };
    const isBoss = n % 10 === 0;          // warlord every 10th
    const rush = n % 5 === 0 && !isBoss;  // runner rush on 5,15,25,...
    const heavy = n % 7 === 0 && !isBoss; // sapper/ogre push on 7,14,...

    push('raider', Math.min(7 + Math.floor(n * 0.85), 30), Math.max(0.3, 0.7 - n * 0.004));
    if (n >= 2) push('runner', Math.min(3 + Math.floor(n * 0.5) + (rush ? 12 : 0), 30), Math.max(0.2, 0.45 - n * 0.003));
    if (n >= 4) push('sapper', Math.min(1 + Math.floor(n / 4) + (heavy ? 5 : 0), 16), Math.max(0.5, 1.0 - n * 0.005));
    if (n >= 6) push('ogre', Math.min(1 + Math.floor(n / 6) + (heavy ? 4 : 0), 14), Math.max(0.55, 1.1 - n * 0.006));
    if (isBoss) push('warlord', Math.min(1 + Math.floor(n / 30), 4), 2.2);
    return q;
  }

  // A wave is "in flight" while it is still spawning OR still has a living enemy.
  function wavesInFlight() {
    const set = new Set();
    for (const g of spawnGroups) if (g.index < g.queue.length) set.add(g.wave);
    for (const e of enemies) set.add(e.wave);
    return set.size;
  }

  // One siege camp on EVERY map edge (two per edge from wave 12), at random positions
  // with corners excluded — the assault comes from all directions, so the castle must
  // be walled all the way around. Shuffled so the round-robin mixes edges.
  function pickSpawns(n) {
    const perEdge = n >= 12 ? 2 : 1;
    const pts = [];
    for (let k = 0; k < perEdge; k++) {
      pts.push({ c: 1 + Math.floor(Math.random() * (COLS - 2)), r: 0 });
      pts.push({ c: 1 + Math.floor(Math.random() * (COLS - 2)), r: ROWS - 1 });
      pts.push({ c: 0, r: 1 + Math.floor(Math.random() * (ROWS - 2)) });
      pts.push({ c: COLS - 1, r: 1 + Math.floor(Math.random() * (ROWS - 2)) });
    }
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    return pts;
  }

  function startWave() {
    if (ended || wave >= MAX_WAVES) return;
    if (wavesInFlight() >= MAX_IN_FLIGHT) return; // cap concurrent waves on the field
    const wasIdle = !started && wave === 0;
    started = true;
    autoTimer = -1; // a manual send cancels any pending auto-start
    wave++;
    // Groups run concurrently; each brings its own siege camps (spawn cells).
    spawnGroups.push({ queue: buildWave(wave), index: 0, timer: 999, wave, spawns: nextSpawns });
    nextSpawns = pickSpawns(wave + 1);
    markFlowDirty(); // active spawn set changed → refresh breach previews
    if (wasIdle) syncDiff(); // first send locks the difficulty selector
    syncHud();
  }

  function spawnEnemy(type, waveNum, sp) {
    const base = ENEMIES[type], d = diff();
    const hpScale = type === 'warlord' ? 1 + (waveNum - 1) * 0.07 : 1 + (waveNum - 1) * 0.11;
    const hp = Math.round(base.hp * hpScale * d.hpMul);
    const reward = Math.max(1, Math.round(base.reward * (1 + (waveNum - 1) * 0.035) * d.rewardMul));
    // Inward direction from the spawn's edge; slide in from one tile off-screen.
    const dc = sp.c === 0 ? 1 : sp.c === COLS - 1 ? -1 : 0;
    const dr = sp.r === 0 ? 1 : sp.r === ROWS - 1 ? -1 : 0;
    const p = center(sp.c, sp.r);
    enemies.push({
      type, wave: waveNum,
      x: p.x - dc * TILE, y: p.y - dr * TILE,
      cellC: sp.c - dc, cellR: sp.r - dr,
      tgt: { x: p.x, y: p.y, c: sp.c, r: sp.r, dir: { dc, dr } },
      lastDir: { dc, dr },
      hp, maxHp: hp, speed: base.speed * d.spdMul, reward,
      bDmg: base.bDmg, atkGap: base.atkGap, atkTimer: 0, attackTarget: null, attackDir: null, prevAttack: null,
      size: base.size, color: base.color,
      traveled: 0, exitDist: Infinity, slowUntil: 0, slowMul: 1, pinUntil: 0, dead: false, hitFlash: 0,
    });
  }

  // ── Combat helpers ──────────────────────────────────────────────────────────
  function towerStat(t) {
    const b = BUILDS[t.kind], L = t.level;
    return {
      range: b.range + LVL_RANGE[L],
      damage: b.damage * LVL_DMG[L],
      fireRate: b.fireRate * LVL_RATE[L],
    };
  }

  function findTarget(t, range) {
    // Target the enemy nearest the keep within range: lowest flow-field cost,
    // breaking ties by distance already travelled.
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

  // Single funnel for all structure damage — owns the bucket-crossing re-plan rule.
  function damageBuilding(b, dmg) {
    const oldBucket = Math.ceil(b.hp / HP_BUCKET);
    b.hp -= dmg;
    if (b.kind === 'keep') {
      if (b.hp <= 0) { b.hp = 0; ended = true; victory = false; }
      syncHud();
      if (selectedBldg === b) syncInfo();
      return;
    }
    if (b.hp <= 0) destroyBuilding(b);
    else {
      if (Math.ceil(b.hp / HP_BUCKET) !== oldBucket) markFlowDirty();
      if (selectedBldg === b) syncInfo();
    }
  }

  function destroyBuilding(b) {
    b.removed = true;
    grid[idx(b.c, b.r)] = null;
    buildings = buildings.filter(x => x !== b);
    effects.push({ kind: 'dust', x: b.x, y: b.y, t0: now, dur: 450 });
    if (selectedBldg === b) { selectedBldg = null; syncInfo(); }
    markFlowDirty();
  }

  // ── Knights ─────────────────────────────────────────────────────────────────
  // Blue square guards. Not buildings: they don't occupy grid cells or block the
  // flow field. Each holds a post, charges any enemy that comes within aggro range
  // of that post, and PINS its quarry in melee — a pinned enemy stops marching (and
  // stops battering walls) to trade blows instead. Knights die in service: no sell.
  const KNIGHT = { cost: 30, hp: 90, speed: 85, dmg: 8, atkGap: 0.5, aggro: 110, leash: 150, size: 9, max: 10, color: 'rgba(60,140,255,1)' };

  function knightPlaceable(c, r) {
    // No dropping a knight onto an enemy (zero-travel instant pin) or another knight.
    return inBounds(c, r) && !isBorder(c, r) && !grid[idx(c, r)] && !enemyInCell(c, r) && !knightInCell(c, r);
  }
  function knightInCell(c, r) {
    return knights.some(k => !k.dead && Math.floor(k.x / TILE) === c && Math.floor(k.y / TILE) === r);
  }

  function placeKnight(c, r) {
    if (!knightPlaceable(c, r) || gold < KNIGHT.cost || knights.length >= KNIGHT.max) return;
    gold -= KNIGHT.cost;
    const p = center(c, r);
    knights.push({
      x: p.x, y: p.y, postX: p.x, postY: p.y,
      hp: KNIGHT.hp, maxHp: KNIGHT.hp,
      target: null, atkTimer: 0, hurtTimer: 0, dead: false, hitFlash: 0,
    });
    syncHud();
  }

  // Straight-line steps, but never into a closed building cell; when the direct
  // move is blocked, try sliding along one axis so knights hug walls, not clip them.
  function moveKnight(k, mx, my) {
    const tryMove = (nx, ny) => {
      const c = Math.floor(nx / TILE), r = Math.floor(ny / TILE);
      if (!inBounds(c, r)) return false;
      const b = grid[idx(c, r)];
      if (b && !(b.kind === 'gate' && b.open)) return false;
      k.x = nx; k.y = ny; return true;
    };
    if (!tryMove(k.x + mx, k.y + my) && !tryMove(k.x + mx, k.y)) tryMove(k.x, k.y + my);
  }

  function updateKnights(dt) {
    for (const k of knights) {
      if (k.dead) continue;
      // validate current quarry, else acquire the nearest live enemy near the POST
      let t = k.target;
      if (t) {
        const dx = t.x - k.postX, dy = t.y - k.postY;
        if (t.dead || dx * dx + dy * dy > KNIGHT.leash * KNIGHT.leash) t = null;
      }
      if (!t) {
        let bestD = KNIGHT.aggro * KNIGHT.aggro;
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - k.postX, dy = e.y - k.postY;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; t = e; }
        }
      }
      if (t !== k.target) { k.atkTimer = 0; k.hurtTimer = 0; } // fresh duel, fresh timers
      k.target = t;
      if (t) {
        const dx = t.x - k.x, dy = t.y - k.y;
        const d = Math.hypot(dx, dy);
        const reach = KNIGHT.size + t.size + 3;
        if (d > reach) {
          moveKnight(k, (dx / d) * KNIGHT.speed * dt, (dy / d) * KNIGHT.speed * dt);
        } else {
          t.pinUntil = now + 150; // held in melee; refreshed every frame while in reach
          k.atkTimer += dt;
          if (k.atkTimer >= KNIGHT.atkGap) { k.atkTimer -= KNIGHT.atkGap; damageEnemy(t, KNIGHT.dmg); }
          k.hurtTimer += dt;
          if (k.hurtTimer >= t.atkGap) {
            k.hurtTimer -= t.atkGap;
            k.hp -= t.bDmg; k.hitFlash = now + 60;
            if (k.hp <= 0) {
              k.dead = true;
              effects.push({ kind: 'boom', x: k.x, y: k.y, r0: KNIGHT.size, r1: KNIGHT.size + 16, t0: now, dur: 320, color: KNIGHT.color });
            }
          }
        }
      } else {
        k.atkTimer = 0; k.hurtTimer = 0;
        const dx = k.postX - k.x, dy = k.postY - k.y;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          const step = Math.min(KNIGHT.speed * dt, d);
          moveKnight(k, (dx / d) * step, (dy / d) * step);
        }
      }
    }
  }

  function fire(t, target) {
    const s = towerStat(t);
    const b = BUILDS[t.kind];
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    projectiles.push({
      x: t.x, y: t.y, target, tx: target.x, ty: target.y,
      speed: b.projSpeed, damage: s.damage, kind: b.kind,
      splash: b.splash || 0, slowMul: b.slowMul || 0, slowDur: b.slowDur || 0,
      color: b.color, ang: t.angle, trav: 0, dead: false,
    });
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function update(dt) {
    // Spawning — each active group advances on its own clock, so waves overlap.
    // Enemies round-robin across the group's siege camps.
    for (const g of spawnGroups) {
      if (g.index >= g.queue.length) continue;
      g.timer += dt;
      if (g.timer >= g.queue[g.index].gap) {
        spawnEnemy(g.queue[g.index].type, g.wave, g.spawns[g.index % g.spawns.length]);
        g.index++; g.timer = 0;
      }
    }

    // Knights first, so their melee pins apply before enemies move this frame.
    updateKnights(dt);

    // Enemies — walk the flow field, or stand and batter the building in the way.
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.pinUntil > now) continue; // locked in melee with a knight
      if (e.attackTarget) {
        const b = e.attackTarget;
        if (b.removed || b.hp <= 0) { e.attackTarget = null; }
        else {
          e.atkTimer += dt;
          if (e.atkTimer >= e.atkGap) {
            e.atkTimer -= e.atkGap;
            effects.push({ kind: 'spark', x: (e.x + b.x) / 2, y: (e.y + b.y) / 2, t0: now, dur: 200 });
            damageBuilding(b, e.bDmg);
          }
          continue;
        }
      }
      const slow = e.slowUntil > now ? e.slowMul : 1;
      let step = e.speed * slow * dt;
      while (step > 0 && !e.dead) {
        if (!e.tgt && !e.attackTarget) assignTarget(e);
        if (!e.tgt) break; // switched to siege mode
        const dx = e.tgt.x - e.x, dy = e.tgt.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= step) {
          e.x = e.tgt.x; e.y = e.tgt.y; e.traveled += d; step -= d;
          e.cellC = e.tgt.c; e.cellR = e.tgt.r; e.lastDir = e.tgt.dir;
          e.tgt = null;
        } else {
          e.x += (dx / d) * step; e.y += (dy / d) * step; e.traveled += step; step = 0;
        }
      }
      if (!e.dead) e.exitDist = distAt(e.cellC, e.cellR);
    }
    if (ended) { syncHud(); return; } // keep fell mid-swing

    // Towers fire
    for (const t of buildings) {
      if (!BUILDS[t.kind].isTower) continue;
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
      p.ang = Math.atan2(dy, dx);
      if (d <= step || d < 1) {
        p.dead = true;
        if (p.kind === 'rock') {
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
          if (p.slowDur) { p.target.slowUntil = now + p.slowDur; p.target.slowMul = p.slowMul; }
        }
      } else {
        p.x += (dx / d) * step; p.y += (dy / d) * step; p.trav += step;
      }
    }

    // Cull
    enemies = enemies.filter(e => !e.dead);
    knights = knights.filter(k => !k.dead);
    projectiles = projectiles.filter(p => !p.dead);
    effects = effects.filter(f => now - f.t0 < f.dur);

    // Drop each spawn group as soon as it has emitted all its enemies, so its siege
    // camps stop rendering as active threats. wavesInFlight still counts the group's
    // survivors via the enemies list.
    if (spawnGroups.some(g => g.index >= g.queue.length)) {
      spawnGroups = spawnGroups.filter(g => g.index < g.queue.length);
      markFlowDirty(); // spawn set shrank → refresh previews
    }

    // Field clear = every sent wave fully emitted and no enemies left alive. Pay any
    // not-yet-banked wave-clear bonuses, then start the 5s auto-advance countdown.
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

  // ── Isometric projection ────────────────────────────────────────────────────
  // Game logic stays in flat world pixels (960×640, TILE=40); only rendering and
  // mouse picking pass through this projection. Classic 2:1 dimetric view: each
  // tile is a 40×20 screen diamond, +z rises straight up the screen.
  const TW2 = 20, TH2 = 10;                     // half diamond width/height per tile
  const CW = canvas.width, CH = canvas.height;  // 960×560 screen
  const OX = 400, OY = 90;                      // world origin on screen
  function proj(wx, wy, z) {
    const u = wx / TILE, v = wy / TILE;
    return { x: OX + (u - v) * TW2, y: OY + (u + v) * TH2 - (z || 0) };
  }
  function unprojCell(sx, sy) {
    const A = (sx - OX) / TW2, B = (sy - OY) / TH2;
    return { c: Math.floor((A + B) / 2), r: Math.floor((B - A) / 2) };
  }
  const depthOf = (wx, wy) => (wx + wy) / TILE; // painter's-algorithm sort key

  // Screen path for the ground diamond of cell (c,r) at height z.
  function diamond(c, r, z) {
    const p0 = proj(c * TILE, r * TILE, z), p1 = proj((c + 1) * TILE, r * TILE, z),
      p2 = proj((c + 1) * TILE, (r + 1) * TILE, z), p3 = proj(c * TILE, (r + 1) * TILE, z);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
  }

  // Extruded box over the world rect (x1,y1)-(x2,y2), from height z0 up to z1.
  // Only the two south faces are visible from this camera. Returns top corners.
  function box(x1, y1, x2, y2, z0, z1, topCol, rightCol, leftCol, edgeCol) {
    const g = [proj(x1, y1, z0), proj(x2, y1, z0), proj(x2, y2, z0), proj(x1, y2, z0)];
    const t = [proj(x1, y1, z1), proj(x2, y1, z1), proj(x2, y2, z1), proj(x1, y2, z1)];
    ctx.fillStyle = rightCol; // SE face
    ctx.beginPath(); ctx.moveTo(t[1].x, t[1].y); ctx.lineTo(t[2].x, t[2].y); ctx.lineTo(g[2].x, g[2].y); ctx.lineTo(g[1].x, g[1].y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = leftCol;  // SW face
    ctx.beginPath(); ctx.moveTo(t[2].x, t[2].y); ctx.lineTo(t[3].x, t[3].y); ctx.lineTo(g[3].x, g[3].y); ctx.lineTo(g[2].x, g[2].y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = topCol;
    ctx.beginPath(); ctx.moveTo(t[0].x, t[0].y); ctx.lineTo(t[1].x, t[1].y); ctx.lineTo(t[2].x, t[2].y); ctx.lineTo(t[3].x, t[3].y); ctx.closePath(); ctx.fill();
    if (edgeCol) { ctx.strokeStyle = edgeCol; ctx.lineWidth = 1; ctx.stroke(); }
    return t;
  }

  // A world-space circle (radius R px) on the ground plane → screen ellipse.
  function groundEllipse(wx, wy, R, stroke, fill) {
    const p = proj(wx, wy, 0);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, R * 0.707, R * 0.354, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  // ── Ground (painted once to an offscreen canvas, blitted each frame) ────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Per-cell moonlit shade, shared by both camera modes so the terrain matches.
  const cellShade = (() => {
    const rng = mulberry32(99173);
    const a = new Float32Array(COLS * ROWS);
    for (let i = 0; i < a.length; i++) a[i] = 0.8 + rng() * 0.4;
    return a;
  })();
  const cellGrass = sh => 'rgb(' + Math.round(16 * sh) + ',' + Math.round(30 * sh) + ',' + Math.round(19 * sh) + ')';
  const cellEarth = sh => 'rgb(' + Math.round(38 * sh) + ',' + Math.round(24 * sh) + ',' + Math.round(17 * sh) + ')';

  const ground = document.createElement('canvas');
  ground.width = CW; ground.height = CH;
  (function paintGround() {
    const g = ground.getContext('2d');
    const rng = mulberry32(20260726);
    const grad = g.createRadialGradient(CW / 2, CH * 0.45, 60, CW / 2, CH * 0.45, 640);
    grad.addColorStop(0, '#0a1220');
    grad.addColorStop(1, '#04060c');
    g.fillStyle = grad; g.fillRect(0, 0, CW, CH);
    const P = (c, r) => ({ x: OX + (c - r) * TW2, y: OY + (c + r) * TH2 });
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const p0 = P(c, r), p1 = P(c + 1, r), p2 = P(c + 1, r + 1), p3 = P(c, r + 1);
      const border = c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1;
      const sh = cellShade[idx(c, r)];
      g.fillStyle = border ? cellEarth(sh) : cellGrass(sh);
      g.beginPath();
      g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(60,140,255,0.06)'; g.lineWidth = 1; g.stroke();
    }
    // grass tufts (interior only)
    g.strokeStyle = 'rgba(90,140,80,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      const wx = TILE + rng() * (W - 2 * TILE), wy = TILE + rng() * (H - 2 * TILE);
      const x = OX + (wx / TILE - wy / TILE) * TW2, y = OY + (wx / TILE + wy / TILE) * TH2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1 + rng() * 2, y - 2 - rng() * 3); g.stroke();
    }
  })();

  // ── Rendering ───────────────────────────────────────────────────────────────
  function draw() {
    ctx.drawImage(ground, 0, 0);

    // Breach previews on the ground: where each siege camp plans to march and smash.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,160,80,0.25)'; ctx.lineWidth = 3;
    ctx.setLineDash([3, 9]);
    for (const rt of routes) {
      if (rt.pts.length < 2) continue;
      ctx.beginPath();
      let p = proj(rt.pts[0].x, rt.pts[0].y, 0);
      ctx.moveTo(p.x, p.y);
      for (let i = 1; i < rt.pts.length; i++) { p = proj(rt.pts[i].x, rt.pts[i].y, 0); ctx.lineTo(p.x, p.y); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const rt of routes) for (const b of rt.breaches) groundEllipse(b.x, b.y, 10, 'rgba(255,160,80,0.5)');

    // Siege camp markers on the border
    for (const s of activeSpawns()) {
      const p0 = center(s.c, s.r), p = proj(p0.x, p0.y, 0);
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
      const sg = ctx.createRadialGradient(0, 0, 3, 0, 0, 24);
      sg.addColorStop(0, 'rgba(255,120,70,0.55)'); sg.addColorStop(1, 'rgba(255,120,70,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Build hints on open cells
    if (selectedBuild) {
      ctx.fillStyle = 'rgba(60,140,255,0.10)';
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (isOpenCell(c, r)) { diamond(c, r, 0); ctx.fill(); }
      }
    }

    // Selected tower range ring (ground level, under the blocks)
    if (selectedBldg && BUILDS[selectedBldg.kind] && BUILDS[selectedBldg.kind].isTower) {
      groundEllipse(selectedBldg.x, selectedBldg.y, towerStat(selectedBldg).range, 'rgba(60,140,255,0.5)', 'rgba(60,140,255,0.06)');
    }

    // World objects, depth-sorted far → near so blocks occlude correctly.
    const items = [];
    for (const b of buildings) items.push({ d: b.c + b.r + 1, f: drawBuilding, a: b });
    items.push({ d: KEEP_C + KEEP_R + 3.5, f: drawKeep, a: null }); // 2×2 footprint depth
    for (const e of enemies) items.push({ d: depthOf(e.x, e.y), f: drawEnemy, a: e });
    for (const k of knights) items.push({ d: depthOf(k.x, k.y), f: drawKnight, a: k });
    for (const p of projectiles) items.push({ d: depthOf(p.x, p.y) + 0.01, f: drawProjectile, a: p });
    for (const f of effects) items.push({ d: depthOf(f.x, f.y) + 0.02, f: drawEffect, a: f });
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.f(it.a);

    // Build ghost (translucent, drawn over the scene)
    if (selectedBuild && mouseCell.c >= 0 && inBounds(mouseCell.c, mouseCell.r)) {
      const c = mouseCell.c, r = mouseCell.r;
      const p = center(c, r);
      const x1 = c * TILE + 4, y1 = r * TILE + 4, x2 = c * TILE + TILE - 4, y2 = r * TILE + TILE - 4;
      if (selectedBuild === 'knight') {
        const ok = knightPlaceable(c, r) && gold >= KNIGHT.cost && knights.length < KNIGHT.max;
        groundEllipse(p.x, p.y, KNIGHT.aggro, ok ? 'rgba(60,140,255,0.4)' : 'rgba(255,80,80,0.4)');
        ctx.globalAlpha = 0.55;
        if (ok) box(p.x - 8, p.y - 8, p.x + 8, p.y + 8, 0, 14, 'rgba(90,165,255,1)', 'rgba(60,140,255,1)', 'rgba(40,100,200,1)');
        else box(p.x - 8, p.y - 8, p.x + 8, p.y + 8, 0, 14, 'rgba(255,110,110,0.9)', 'rgba(230,80,80,0.9)', 'rgba(200,60,60,0.9)');
        ctx.globalAlpha = 1;
      } else {
        const def = BUILDS[selectedBuild];
        const ok = isBuildable(c, r) && gold >= def.cost;
        if (def.isTower) groundEllipse(p.x, p.y, def.range, ok ? 'rgba(60,140,255,0.4)' : 'rgba(255,80,80,0.4)');
        const h = selectedBuild === 'wall' ? 22 : selectedBuild === 'gate' ? 20 : 28;
        ctx.globalAlpha = 0.55;
        if (ok) box(x1, y1, x2, y2, 0, h, '#4a5364', '#39414f', '#2b323d');
        else box(x1, y1, x2, y2, 0, h, 'rgba(255,110,110,0.9)', 'rgba(230,80,80,0.9)', 'rgba(200,60,60,0.9)');
        ctx.globalAlpha = 1;
      }
    }

    drawOverlays();
  }

  function drawOverlays() {
    if (!started) overlay('CASTLE SIEGE', 'Difficulty: ' + diff().name + ' — ' + diff().desc + '\nThey come from every direction. Wall in your keep,\nraise towers, muster knights, then press START WAVE.');
    else if (ended) overlay(victory ? 'VICTORY' : 'THE KEEP HAS FALLEN', victory
      ? 'All ' + MAX_WAVES + ' sieges repelled!  Score: ' + score + '\nPress R to play again.'
      : 'The horde razed your castle.\nReached wave ' + wave + '.  Press R to retry.'
    );
    else if (paused) overlay('PAUSED', 'Press P to resume.');
  }

  function drawBuilding(b) {
    if (b.kind === 'wall') drawWall(b);
    else if (b.kind === 'gate') drawGate(b);
    else drawTower(b);
  }

  // Floating HP bar above a building's block top.
  function drawHpBar(b, z) {
    if (b.hp >= b.maxHp) return;
    const p = proj(b.x, b.y, z + 8);
    const w = 26, frac = Math.max(0, b.hp / b.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - w / 2, p.y, w, 3);
    ctx.fillStyle = frac > 0.5 ? 'rgba(120,230,120,1)' : frac > 0.25 ? 'rgba(255,225,120,1)' : 'rgba(255,90,90,1)';
    ctx.fillRect(p.x - w / 2, p.y, w * frac, 3);
  }

  // Stable per-cell cracks running down the visible faces; seeded so no flicker.
  function drawCracksIso(b, h) {
    const frac = b.hp / b.maxHp;
    if (frac >= 0.66) return;
    const rng = mulberry32(idx(b.c, b.r) * 7919 + 17);
    const x1 = b.c * TILE + 2, y1 = b.r * TILE + 2, x2 = b.c * TILE + TILE - 2, y2 = b.r * TILE + TILE - 2;
    const a = proj(x2, y1, h), m = proj(x2, y2, h), d = proj(x1, y2, h);
    ctx.strokeStyle = 'rgba(8,10,16,0.9)'; ctx.lineWidth = 1.2;
    const n = frac < 0.33 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const s = 0.15 + rng() * 0.7;
      const p0 = i % 2 === 0
        ? { x: a.x + (m.x - a.x) * s, y: a.y + (m.y - a.y) * s }   // SE face
        : { x: m.x + (d.x - m.x) * s, y: m.y + (d.y - m.y) * s };  // SW face
      let px = p0.x, py = p0.y + 2;
      ctx.beginPath(); ctx.moveTo(px, py);
      for (let k = 0; k < 3; k++) { px += (rng() - 0.5) * 6; py += h / 3 - 1; ctx.lineTo(px, py); }
      ctx.stroke();
    }
  }

  function drawWall(b) {
    const x = b.c * TILE, y = b.r * TILE;
    const battered = b.hp / b.maxHp < 0.33;
    box(x + 2, y + 2, x + TILE - 2, y + TILE - 2, 0, 22,
      battered ? '#3a4150' : '#4a5364', battered ? '#2d333e' : '#39414f', battered ? '#22272f' : '#2b323d',
      'rgba(15,18,26,0.8)');
    // mortar seam along the SE face
    const s1 = proj(x + TILE - 2, y + 2, 11), s2 = proj(x + TILE - 2, y + TILE - 2, 11);
    ctx.strokeStyle = 'rgba(14,17,25,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
    drawCracksIso(b, 22);
    drawHpBar(b, 22);
  }

  function drawGate(b) {
    const x = b.c * TILE, y = b.r * TILE;
    if (b.open) {
      // passable threshold + two jamb posts the leaves are swung against
      ctx.fillStyle = 'rgba(60,45,28,0.5)';
      diamond(b.c, b.r, 0); ctx.fill();
      box(x + 2, y + 2, x + 10, y + 10, 0, 16, '#6b5230', '#5a4429', '#46351f', 'rgba(30,22,12,0.9)');
      box(x + TILE - 10, y + TILE - 10, x + TILE - 2, y + TILE - 2, 0, 16, '#6b5230', '#5a4429', '#46351f', 'rgba(30,22,12,0.9)');
      drawHpBar(b, 16);
    } else {
      box(x + 2, y + 2, x + TILE - 2, y + TILE - 2, 0, 20, '#6b5230', '#5a4429', '#43331d', 'rgba(30,22,12,0.9)');
      // iron bands across the SE face
      const a = proj(x + TILE - 2, y + 2, 0), m = proj(x + TILE - 2, y + TILE - 2, 0);
      ctx.strokeStyle = 'rgba(130,140,160,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 6); ctx.lineTo(m.x, m.y - 6);
      ctx.moveTo(a.x, a.y - 14); ctx.lineTo(m.x, m.y - 14);
      ctx.stroke();
      drawCracksIso(b, 20);
      drawHpBar(b, 20);
    }
  }

  function drawTower(b) {
    const col = BUILDS[b.kind].color;
    const x = b.c * TILE, y = b.r * TILE;
    box(x + 5, y + 5, x + TILE - 5, y + TILE - 5, 0, 28, '#454e5e', '#3d4554', '#2e3542', 'rgba(14,17,25,0.8)');
    // turret on the roof, aimed along the tower's world angle
    const top = proj(b.x, b.y, 28);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(top.x, top.y, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    const ang = b.angle || 0;
    const tip = proj(b.x + Math.cos(ang) * 16, b.y + Math.sin(ang) * 16, 31);
    ctx.strokeStyle = col; ctx.lineWidth = b.kind === 'catapult' ? 4 : 2.5;
    ctx.beginPath(); ctx.moveTo(top.x, top.y - 3); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    if (b.kind === 'mage') { // crystal glint
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(top.x, top.y - 6, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    if (b.level > 1) {
      ctx.fillStyle = 'rgba(255,225,120,1)';
      ctx.font = '9px Courier New';
      for (let i = 0; i < b.level - 1; i++) ctx.fillText('*', top.x - 6 + i * 6, top.y - 12);
    }
    drawCracksIso(b, 28);
    drawHpBar(b, 32);
  }

  function drawKeep() {
    const x = KEEP_C * TILE, y = KEEP_R * TILE, S = TILE * 2;
    // main mass with a soft HUD-blue glow
    ctx.save();
    ctx.shadowColor = 'rgba(60,140,255,0.4)'; ctx.shadowBlur = 14;
    box(x + 3, y + 3, x + S - 3, y + S - 3, 0, 46, '#4d5669', '#454e60', '#37404f', 'rgba(18,22,32,0.9)');
    ctx.restore();
    // crenellation teeth along the two visible parapet edges
    ctx.fillStyle = '#565f73';
    for (let i = 0; i < 4; i++) {
      const s = (i + 0.5) / 4;
      const e1 = proj(x + S - 3, y + 3 + (S - 6) * s, 46);
      const e2 = proj(x + 3 + (S - 6) * s, y + S - 3, 46);
      ctx.fillRect(e1.x - 3, e1.y - 6, 6, 6);
      ctx.fillRect(e2.x - 3, e2.y - 6, 6, 6);
    }
    // central tower + banner
    box(x + S * 0.32, y + S * 0.32, x + S * 0.68, y + S * 0.68, 46, 70, '#5a6478', '#525c70', '#434c5c', 'rgba(18,22,32,0.9)');
    const bp = proj(x + S / 2, y + S / 2, 70);
    ctx.strokeStyle = 'rgba(200,210,230,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bp.x, bp.y); ctx.lineTo(bp.x, bp.y - 20); ctx.stroke();
    ctx.fillStyle = 'rgba(60,140,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(bp.x, bp.y - 20); ctx.lineTo(bp.x + 13, bp.y - 16); ctx.lineTo(bp.x, bp.y - 12);
    ctx.closePath(); ctx.fill();
    // wide HP bar once damaged
    if (keep.hp < keep.maxHp) {
      const p = proj(KEEP_X, KEEP_Y, 96);
      const w = 60, frac = Math.max(0, keep.hp / keep.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(p.x - w / 2, p.y, w, 5);
      ctx.fillStyle = frac > 0.5 ? 'rgba(120,230,120,1)' : frac > 0.25 ? 'rgba(255,225,120,1)' : 'rgba(255,90,90,1)';
      ctx.fillRect(p.x - w / 2, p.y, w * frac, 5);
    }
  }

  function drawEnemy(e) {
    const s = e.size;
    // siege lunge: bob toward the wall being battered, synced to the swing timer
    let ox = 0, oy = 0;
    if (e.attackTarget && e.attackDir) {
      const kk = Math.sin(Math.min(1, e.atkTimer / e.atkGap) * Math.PI);
      ox = e.attackDir.dc * kk * 6; oy = e.attackDir.dr * kk * 6;
    }
    const wx = e.x + ox, wy = e.y + oy;
    groundEllipse(wx, wy, s * 1.1, null, 'rgba(0,0,0,0.35)');
    if (e.slowUntil > now) groundEllipse(wx, wy, s + 5, 'rgba(120,220,255,0.8)');
    const p = proj(wx, wy, s + 4); // billboard body floats above its shadow
    ctx.save(); ctx.translate(p.x, p.y);
    const flash = e.hitFlash > now;
    ctx.fillStyle = flash ? 'rgba(255,255,255,0.95)' : e.color;
    ctx.shadowColor = e.color; ctx.shadowBlur = 8;
    ctx.beginPath();
    if (e.type === 'raider') { ctx.arc(0, 0, s, 0, Math.PI * 2); }
    else if (e.type === 'runner') { ctx.moveTo(s * 1.4, 0); ctx.lineTo(-s, -s * 0.85); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s, s * 0.85); ctx.closePath(); }
    else if (e.type === 'sapper' || e.type === 'ogre') { ctx.rect(-s, -s, s * 2, s * 2); }
    else { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const fn = i ? 'lineTo' : 'moveTo'; ctx[fn](Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath(); }
    ctx.fill();
    ctx.shadowBlur = 0;
    // markings: raider shield rim, sapper pick
    if (e.type === 'raider') {
      ctx.strokeStyle = 'rgba(70,30,20,0.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, s - 2, Math.PI * 0.65, Math.PI * 1.35); ctx.stroke();
    } else if (e.type === 'sapper') {
      ctx.strokeStyle = 'rgba(70,40,15,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.5); ctx.lineTo(s * 0.7, -s * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.6, 3.5, Math.PI * 0.6, Math.PI * 1.6); ctx.stroke();
    }
    ctx.restore();
    // hp bar
    const hb = proj(wx, wy, s * 2 + 14);
    const w = s * 2, frac = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(hb.x - w / 2, hb.y, w, 4);
    ctx.fillStyle = frac > 0.5 ? 'rgba(120,230,120,1)' : frac > 0.25 ? 'rgba(255,225,120,1)' : 'rgba(255,90,90,1)';
    ctx.fillRect(hb.x - w / 2, hb.y, w * frac, 4);
  }

  function drawKnight(k) {
    groundEllipse(k.x, k.y, 11, null, 'rgba(0,0,0,0.35)');
    const flash = k.hitFlash > now;
    // the blue square, now a blue cube
    box(k.x - 8, k.y - 8, k.x + 8, k.y + 8, 0, 14,
      flash ? 'rgba(255,255,255,0.95)' : 'rgba(96,168,255,1)',
      flash ? 'rgba(255,255,255,0.9)' : 'rgba(60,140,255,1)',
      flash ? 'rgba(225,232,245,0.9)' : 'rgba(38,98,196,1)',
      'rgba(15,35,80,0.9)');
    // sword glint on the helm
    const p = proj(k.x, k.y, 14);
    ctx.strokeStyle = 'rgba(235,245,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x - 4, p.y + 2); ctx.lineTo(p.x + 5, p.y - 4); ctx.stroke();
    if (k.hp < k.maxHp) {
      const hb = proj(k.x, k.y, 26);
      const w = 18, frac = Math.max(0, k.hp / k.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(hb.x - w / 2, hb.y, w, 4);
      ctx.fillStyle = frac > 0.5 ? 'rgba(120,230,120,1)' : frac > 0.25 ? 'rgba(255,225,120,1)' : 'rgba(255,90,90,1)';
      ctx.fillRect(hb.x - w / 2, hb.y, w * frac, 4);
    }
  }

  function drawProjectile(p) {
    // No shadowBlur here: projectiles are the most numerous draw in a dense late wave.
    if (p.kind === 'arrow') {
      const a = proj(p.x - Math.cos(p.ang) * 6, p.y - Math.sin(p.ang) * 6, 16);
      const b = proj(p.x + Math.cos(p.ang) * 6, p.y + Math.sin(p.ang) * 6, 16);
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (p.kind === 'rock') {
      // parabolic lob: visual lift above the flight line, plus a ground shadow
      const d = Math.hypot(p.tx - p.x, p.ty - p.y);
      const prog = p.trav / Math.max(1, p.trav + d);
      const lift = Math.sin(prog * Math.PI) * Math.min(46, (p.trav + d) * 0.25);
      groundEllipse(p.x, p.y, 7, null, 'rgba(0,0,0,0.35)');
      const q = proj(p.x, p.y, lift + 12);
      ctx.fillStyle = '#8b8f99';
      ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    } else {
      const q = proj(p.x, p.y, 16);
      ctx.fillStyle = 'rgba(120,200,255,0.35)';
      ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawEffect(f) {
    const k = (now - f.t0) / f.dur;
    if (f.kind === 'boom') {
      const r = f.r0 + (f.r1 - f.r0) * k;
      const p = proj(f.x, f.y, 8);
      ctx.strokeStyle = f.color; ctx.lineWidth = 2.5 * (1 - k); ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.85, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'spark') {
      const p = proj(f.x, f.y, 14);
      ctx.strokeStyle = 'rgba(255,200,120,' + (1 - k) + ')'; ctx.lineWidth = 1.5;
      const r = 3 + k * 6;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.6;
        ctx.moveTo(p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2);
        ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
      ctx.stroke();
    } else if (f.kind === 'dust') {
      groundEllipse(f.x, f.y, 8 + k * 22, null, 'rgba(150,140,120,' + 0.4 * (1 - k) + ')');
    }
  }

  function overlay(title, sub) {
    ctx.fillStyle = 'rgba(5,8,16,0.78)'; ctx.fillRect(0, 0, CW, CH);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(60,140,255,1)';
    ctx.shadowColor = 'rgba(60,140,255,0.6)'; ctx.shadowBlur = 18;
    ctx.font = 'bold 42px Courier New';
    ctx.fillText(title, CW / 2, CH / 2 - 30);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(200,220,255,0.85)';
    ctx.font = '16px Courier New';
    sub.split('\n').forEach((line, i) => ctx.fillText(line, CW / 2, CH / 2 + 18 + i * 26));
    ctx.textAlign = 'left';
  }

  // ── King's View: first-person perspective from atop the keep ────────────────
  // A second camera over the SAME world state. The king stands on the central
  // tower; drag the mouse or hold ◄ ► (or A/D) to survey the battlefield. Build
  // interactions are disabled here — press V (or the button) to return.
  const EYE_H = 88, FOCAL = 420, PITCH = 0.34, NEAR = 18;
  const COS_P = Math.cos(PITCH), SIN_P = Math.sin(PITCH);
  const HORIZON_Y = CH / 2 - FOCAL * Math.tan(PITCH);
  let kingView = false, yaw = 0.9;
  let lookDrag = null;
  const keysHeld = {};

  function kingProject(wx, wy, wz) {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const rx = wx - KEEP_X, ry = wy - KEEP_Y;
    const cz0 = rx * cosY + ry * sinY;   // forward
    const cx = -rx * sinY + ry * cosY;   // right
    const cy0 = wz - EYE_H;              // up, relative to the eye
    const cz = cz0 * COS_P - cy0 * SIN_P;
    if (cz < NEAR) return null;
    const s = FOCAL / cz;
    return { x: CW / 2 + cx * s, y: CH / 2 - (cy0 * COS_P + cz0 * SIN_P) * s, z: cz, s };
  }

  // Perspective extruded box; visible side faces chosen by outward-normal test.
  function kingBox(x1, y1, x2, y2, h, topCol, brightCol, darkCol, edgeCol) {
    const bc = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    const b = bc.map(q => kingProject(q[0], q[1], 0));
    const t = bc.map(q => kingProject(q[0], q[1], h));
    if (b.some(p => !p) || t.some(p => !p)) return;
    const nrm = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const mx = (bc[i][0] + bc[j][0]) / 2, my = (bc[i][1] + bc[j][1]) / 2;
      if ((KEEP_X - mx) * nrm[i][0] + (KEEP_Y - my) * nrm[i][1] <= 0) continue; // faces away
      ctx.fillStyle = (i === 1 || i === 2) ? brightCol : darkCol; // moonlight from the SE
      ctx.beginPath();
      ctx.moveTo(b[i].x, b[i].y); ctx.lineTo(b[j].x, b[j].y);
      ctx.lineTo(t[j].x, t[j].y); ctx.lineTo(t[i].x, t[i].y);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = topCol;
    ctx.beginPath(); ctx.moveTo(t[0].x, t[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(t[i].x, t[i].y);
    ctx.closePath(); ctx.fill();
    if (edgeCol) { ctx.strokeStyle = edgeCol; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function kingBar(wx, wy, h, hp, maxHp, w0) {
    if (hp >= maxHp) return;
    const p = kingProject(wx, wy, h);
    if (!p) return;
    const w = Math.min(64, w0 * p.s), frac = Math.max(0, hp / maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - w / 2, p.y, w, 3);
    ctx.fillStyle = frac > 0.5 ? 'rgba(120,230,120,1)' : frac > 0.25 ? 'rgba(255,225,120,1)' : 'rgba(255,90,90,1)';
    ctx.fillRect(p.x - w / 2, p.y, w * frac, 3);
  }

  function kingBuilding(b) {
    const x = b.c * TILE, y = b.r * TILE;
    if (b.kind === 'wall') {
      const battered = b.hp / b.maxHp < 0.33;
      kingBox(x + 2, y + 2, x + TILE - 2, y + TILE - 2, 22,
        battered ? '#3a4150' : '#4a5364', battered ? '#39414f' : '#49525f', battered ? '#22272f' : '#2b323d',
        'rgba(15,18,26,0.8)');
      kingBar(b.x, b.y, 30, b.hp, b.maxHp, 26);
    } else if (b.kind === 'gate') {
      if (b.open) {
        kingBox(x + 2, y + 2, x + 10, y + 10, 16, '#6b5230', '#5a4429', '#46351f', 'rgba(30,22,12,0.9)');
        kingBox(x + TILE - 10, y + TILE - 10, x + TILE - 2, y + TILE - 2, 16, '#6b5230', '#5a4429', '#46351f', 'rgba(30,22,12,0.9)');
        kingBar(b.x, b.y, 24, b.hp, b.maxHp, 26);
      } else {
        kingBox(x + 2, y + 2, x + TILE - 2, y + TILE - 2, 20, '#6b5230', '#5a4429', '#43331d', 'rgba(30,22,12,0.9)');
        kingBar(b.x, b.y, 28, b.hp, b.maxHp, 26);
      }
    } else {
      const col = BUILDS[b.kind].color;
      kingBox(x + 5, y + 5, x + TILE - 5, y + TILE - 5, 28, '#454e5e', '#434c5b', '#2e3542', 'rgba(14,17,25,0.8)');
      const top = kingProject(b.x, b.y, 30);
      if (top) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(top.x, top.y, 7 * top.s, 3.5 * top.s, 0, 0, Math.PI * 2); ctx.fill();
      }
      kingBar(b.x, b.y, 36, b.hp, b.maxHp, 26);
    }
  }

  function kingEnemy(e) {
    const p0 = kingProject(e.x, e.y, 0);
    if (!p0) return;
    const sc = Math.min(3, p0.s);
    const s = e.size;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(p0.x, p0.y, s * sc, s * sc * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(p0.x, p0.y - (s + 4) * sc);
    ctx.scale(sc, sc);
    const flash = e.hitFlash > now;
    ctx.fillStyle = flash ? 'rgba(255,255,255,0.95)' : e.color;
    ctx.beginPath();
    if (e.type === 'raider') { ctx.arc(0, 0, s, 0, Math.PI * 2); }
    else if (e.type === 'runner') { ctx.moveTo(s * 1.4, 0); ctx.lineTo(-s, -s * 0.85); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s, s * 0.85); ctx.closePath(); }
    else if (e.type === 'sapper' || e.type === 'ogre') { ctx.rect(-s, -s, s * 2, s * 2); }
    else { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const fn = i ? 'lineTo' : 'moveTo'; ctx[fn](Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath(); }
    ctx.fill();
    ctx.restore();
    if (e.slowUntil > now) {
      ctx.strokeStyle = 'rgba(120,220,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p0.x, p0.y, (s + 5) * sc, (s + 5) * sc * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    }
    kingBar(e.x, e.y, s * 2 + 14, e.hp, e.maxHp, s * 2);
  }

  function kingKnight(k) {
    const flash = k.hitFlash > now;
    kingBox(k.x - 8, k.y - 8, k.x + 8, k.y + 8, 14,
      flash ? 'rgba(255,255,255,0.95)' : 'rgba(96,168,255,1)',
      flash ? 'rgba(255,255,255,0.9)' : 'rgba(60,140,255,1)',
      flash ? 'rgba(225,232,245,0.9)' : 'rgba(38,98,196,1)',
      'rgba(15,35,80,0.9)');
    kingBar(k.x, k.y, 24, k.hp, k.maxHp, 18);
  }

  function kingProjectile(p) {
    if (p.kind === 'arrow') {
      const a = kingProject(p.x - Math.cos(p.ang) * 6, p.y - Math.sin(p.ang) * 6, 16);
      const b = kingProject(p.x + Math.cos(p.ang) * 6, p.y + Math.sin(p.ang) * 6, 16);
      if (!a || !b) return;
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.min(4, 2 * a.s);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (p.kind === 'rock') {
      const d = Math.hypot(p.tx - p.x, p.ty - p.y);
      const prog = p.trav / Math.max(1, p.trav + d);
      const lift = Math.sin(prog * Math.PI) * Math.min(46, (p.trav + d) * 0.25);
      const q = kingProject(p.x, p.y, lift + 12);
      if (!q) return;
      ctx.fillStyle = '#8b8f99';
      ctx.beginPath(); ctx.arc(q.x, q.y, Math.min(14, 5 * q.s), 0, Math.PI * 2); ctx.fill();
    } else {
      const q = kingProject(p.x, p.y, 16);
      if (!q) return;
      const r = Math.min(9, 3 * q.s);
      ctx.fillStyle = 'rgba(120,200,255,0.35)';
      ctx.beginPath(); ctx.arc(q.x, q.y, r * 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function kingEffect(f) {
    const k = (now - f.t0) / f.dur;
    const p = kingProject(f.x, f.y, 8);
    if (!p) return;
    const sc = Math.min(2.5, p.s);
    if (f.kind === 'boom') {
      const r = (f.r0 + (f.r1 - f.r0) * k) * sc;
      ctx.strokeStyle = f.color; ctx.lineWidth = 2.5 * (1 - k); ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'spark') {
      ctx.strokeStyle = 'rgba(255,200,120,' + (1 - k) + ')'; ctx.lineWidth = 1.5;
      const r = (3 + k * 6) * sc;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.6;
        ctx.moveTo(p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2);
        ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
      ctx.stroke();
    } else if (f.kind === 'dust') {
      ctx.fillStyle = 'rgba(150,140,120,' + 0.4 * (1 - k) + ')';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, (8 + k * 22) * sc, (8 + k * 22) * sc * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawKing() {
    // night sky
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 60);
    sky.addColorStop(0, '#020309'); sky.addColorStop(1, '#0c1430');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, CH);
    // stars pan with the view
    const srng = mulberry32(777);
    for (let i = 0; i < 90; i++) {
      const az = srng() * Math.PI * 2, alt = 0.06 + srng() * 0.5, tw = srng();
      let da = az - yaw;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const cosA = Math.cos(alt);
      const cz0 = Math.cos(da) * cosA, cx = Math.sin(da) * cosA, cy0 = Math.sin(alt);
      const cz = cz0 * COS_P - cy0 * SIN_P;
      if (cz < 0.05) continue;
      const x = CW / 2 + (cx / cz) * FOCAL, y = CH / 2 - ((cy0 * COS_P + cz0 * SIN_P) / cz) * FOCAL;
      if (y > HORIZON_Y - 4 || x < 0 || x > CW) continue;
      ctx.globalAlpha = 0.35 + 0.6 * tw;
      ctx.fillStyle = 'rgba(220,230,255,0.9)';
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    // compass on the horizon
    ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(140,170,220,0.7)';
    const dirs = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];
    for (const [nm, dxw, dyw] of dirs) {
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const cz0 = dxw * cosY + dyw * sinY, cx = -dxw * sinY + dyw * cosY;
      const cz = cz0 * COS_P;
      if (cz < 0.05) continue;
      const x = CW / 2 + (cx / cz) * FOCAL;
      if (x < 10 || x > CW - 10) continue;
      ctx.fillText(nm, x, HORIZON_Y - 8);
    }
    ctx.textAlign = 'left';

    // ground plane, cell by cell
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const q0 = kingProject(c * TILE, r * TILE, 0), q1 = kingProject((c + 1) * TILE, r * TILE, 0),
        q2 = kingProject((c + 1) * TILE, (r + 1) * TILE, 0), q3 = kingProject(c * TILE, (r + 1) * TILE, 0);
      if (!q0 || !q1 || !q2 || !q3) continue;
      const sh = cellShade[idx(c, r)];
      ctx.fillStyle = isBorder(c, r) ? cellEarth(sh) : cellGrass(sh);
      ctx.beginPath();
      ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y);
      ctx.closePath(); ctx.fill();
    }

    // breach previews on the ground
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,160,80,0.3)'; ctx.lineWidth = 2;
    ctx.setLineDash([4, 10]);
    for (const rt of routes) {
      ctx.beginPath();
      let started0 = false;
      for (const pt of rt.pts) {
        const q = kingProject(pt.x, pt.y, 1);
        if (!q) { started0 = false; continue; }
        if (!started0) { ctx.moveTo(q.x, q.y); started0 = true; }
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // siege camp glows
    for (const s of activeSpawns()) {
      const p0 = center(s.c, s.r), q = kingProject(p0.x, p0.y, 0);
      if (!q) continue;
      const rr = Math.min(60, 24 * q.s);
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(1, 0.4);
      const sg = ctx.createRadialGradient(0, 0, 2, 0, 0, rr);
      sg.addColorStop(0, 'rgba(255,120,70,0.5)'); sg.addColorStop(1, 'rgba(255,120,70,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // world objects, far → near (the keep's own mass is the plinth we stand on)
    const items = [];
    const pushItem = (wx, wy, f) => { const p = kingProject(wx, wy, 0); if (p) items.push({ z: p.z, f }); };
    for (const b of buildings) pushItem(b.x, b.y, () => kingBuilding(b));
    pushItem(KEEP_X, KEEP_Y, () => kingBox(KEEP_C * TILE + 3, KEEP_R * TILE + 3, KEEP_C * TILE + 2 * TILE - 3, KEEP_R * TILE + 2 * TILE - 3, 46, '#4d5669', '#4b5466', '#37404f', 'rgba(18,22,32,0.9)'));
    for (const e of enemies) pushItem(e.x, e.y, () => kingEnemy(e));
    for (const k of knights) pushItem(k.x, k.y, () => kingKnight(k));
    for (const p of projectiles) pushItem(p.x, p.y, () => kingProjectile(p));
    for (const f of effects) pushItem(f.x, f.y, () => kingEffect(f));
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.f();

    // foreground parapet — the tower rim the king stands behind; slides as you turn
    const off = (((-yaw / (Math.PI * 2)) * 720) % 48 + 48) % 48;
    ctx.fillStyle = '#2c3340';
    ctx.fillRect(0, CH - 26, CW, 26);
    for (let x = -48; x < CW + 48; x += 48) ctx.fillRect(x + off, CH - 44, 26, 18);
    ctx.strokeStyle = 'rgba(15,18,26,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, CH - 25); ctx.lineTo(CW, CH - 25); ctx.stroke();

    // view hint
    ctx.fillStyle = 'rgba(140,170,220,0.75)';
    ctx.font = '12px Courier New';
    ctx.fillText('KING\'S VIEW — drag or ◄ ► to look around · V to return and build', 14, 20);

    drawOverlays();
  }

  // ── Build / interaction ─────────────────────────────────────────────────────
  function isOpenCell(c, r) {
    return inBounds(c, r) && !isBorder(c, r) && !grid[idx(c, r)];
  }
  function enemyInCell(c, r) {
    for (const e of enemies) {
      if (e.dead) continue;
      // Last arrived cell, the cell being walked into, AND the cell under the body —
      // a pinned enemy can sit mid-segment with tgt nulled by a flow recompute.
      if ((e.cellC === c && e.cellR === r) || (e.tgt && e.tgt.c === c && e.tgt.r === r)) return true;
      if (Math.floor(e.x / TILE) === c && Math.floor(e.y / TILE) === r) return true;
    }
    return false;
  }
  // Buildable = open and no live enemy or knight in (or walking into) the cell.
  // Sealing the castle is allowed — the flow field just prices in the breach.
  function isBuildable(c, r) { return isOpenCell(c, r) && !enemyInCell(c, r) && !knightInCell(c, r); }

  function placeBuilding(c, r) {
    const def = BUILDS[selectedBuild];
    if (!isBuildable(c, r) || gold < def.cost) return;
    const p = center(c, r);
    gold -= def.cost;
    const b = {
      kind: selectedBuild, c, r, x: p.x, y: p.y,
      hp: def.hp, maxHp: def.hp, level: 1, invested: def.cost,
      cd: 0, angle: -Math.PI / 2, open: false, removed: false,
    };
    grid[idx(c, r)] = b;
    buildings.push(b);
    markFlowDirty();
    syncHud(); syncPalette();
  }

  function upgradeTower(t) {
    if (ended || !BUILDS[t.kind].isTower || t.level >= 3) return;
    const cost = Math.round(BUILDS[t.kind].cost * 0.75 * t.level);
    if (gold < cost) return;
    gold -= cost; t.invested += cost; t.level++;
    syncHud(); syncInfo();
  }

  function sellBuilding(b) {
    if (ended || b.kind === 'keep') return;
    const refund = Math.round(b.invested * 0.6 * (b.hp / b.maxHp));
    gold += refund;
    b.removed = true;
    grid[idx(b.c, b.r)] = null;
    buildings = buildings.filter(x => x !== b);
    selectedBldg = null;
    markFlowDirty();
    syncHud(); syncInfo();
  }

  function repairCost(b) {
    if (b.hp >= b.maxHp) return 0;
    if (b.kind === 'keep') return Math.ceil((b.maxHp - b.hp) * 0.5);
    return Math.max(1, Math.ceil((1 - b.hp / b.maxHp) * BUILDS[b.kind].cost * 0.6));
  }

  function repairBuilding(b) {
    const cost = repairCost(b);
    if (ended || !cost || gold < cost) return;
    const oldBucket = Math.ceil(b.hp / HP_BUCKET);
    gold -= cost;
    b.hp = b.maxHp;
    if (b.kind !== 'keep' && Math.ceil(b.hp / HP_BUCKET) !== oldBucket) markFlowDirty();
    syncHud(); syncInfo();
  }

  function toggleGate(g) {
    if (ended || g.kind !== 'gate') return;
    if (g.open) {
      if (enemyInCell(g.c, g.r) || knightInCell(g.c, g.r)) return; // can't slam it on someone inside
      g.open = false;
    } else g.open = true;
    markFlowDirty();
    syncInfo();
  }

  // ── HUD sync ────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  function syncHud() {
    $('goldVal').textContent = Math.floor(gold);
    $('keepVal').textContent = Math.ceil(keep.hp) + '/' + keep.maxHp;
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
    syncPalette(); // gold moves on kills/bonuses/sells too, so affordability tracks here
  }
  function syncPalette() {
    document.querySelectorAll('.twr-btn').forEach(btn => {
      const type = btn.dataset.type;
      btn.classList.toggle('sel', selectedBuild === type);
      const cost = type === 'knight' ? KNIGHT.cost : BUILDS[type].cost;
      btn.classList.toggle('broke', gold < cost || (type === 'knight' && knights.length >= KNIGHT.max));
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
    const b = selectedBldg;
    if (!b) { el.innerHTML = ''; return; }
    let html;
    if (b.kind === 'keep') {
      html = '<b style="color:rgba(60,140,255,1)">The Keep</b> &middot; HP ' + Math.ceil(b.hp) + '/' + b.maxHp;
    } else {
      const def = BUILDS[b.kind];
      html = '<b style="color:' + (def.color || 'rgba(170,190,220,1)') + '">' + def.name
        + (def.isTower ? ' Lv' + b.level : '') + '</b> &middot; HP ' + Math.ceil(b.hp) + '/' + b.maxHp;
      if (def.isTower) {
        const s = towerStat(b);
        html += ' &middot; DMG ' + s.damage.toFixed(0)
          + ' &middot; RNG ' + s.range.toFixed(0)
          + ' &middot; RATE ' + (1000 / s.fireRate).toFixed(1) + '/s';
        if (b.level < 3) html += ' <button class="ibtn" id="upBtn">UPGRADE (' + Math.round(def.cost * 0.75 * b.level) + 'g)</button>';
        else html += ' <span style="color:rgba(255,225,120,1)">MAX LEVEL</span>';
      }
      if (b.kind === 'gate') html += ' <button class="ibtn" id="gateBtn">' + (b.open ? 'CLOSE GATE' : 'OPEN GATE') + '</button>';
    }
    if (b.hp < b.maxHp) html += ' <button class="ibtn" id="repBtn">REPAIR (' + repairCost(b) + 'g)</button>';
    if (b.kind !== 'keep') html += ' <button class="ibtn sell" id="sellBtn">SELL (' + Math.round(b.invested * 0.6 * (b.hp / b.maxHp)) + 'g)</button>';
    el.innerHTML = html;
    const up = $('upBtn'); if (up) up.onclick = () => upgradeTower(b);
    const gt = $('gateBtn'); if (gt) gt.onclick = () => toggleGate(b);
    const rp = $('repBtn'); if (rp) rp.onclick = () => repairBuilding(b);
    const sl = $('sellBtn'); if (sl) sl.onclick = () => sellBuilding(b);
  }

  // ── Input ───────────────────────────────────────────────────────────────────
  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    return unprojCell(sx, sy); // screen → iso ground cell (may be out of bounds)
  }

  canvas.addEventListener('mousedown', e => {
    if (kingView) lookDrag = { x: e.clientX, yaw };
  });
  window.addEventListener('mouseup', () => { lookDrag = null; });
  canvas.addEventListener('mousemove', e => {
    if (kingView) {
      if (lookDrag) yaw = lookDrag.yaw + (e.clientX - lookDrag.x) * 0.005;
      return;
    }
    mouseCell = cellFromEvent(e);
  });
  canvas.addEventListener('mouseleave', () => { mouseCell = { c: -1, r: -1 }; });

  canvas.addEventListener('click', e => {
    if (kingView || ended) return;
    const { c, r } = cellFromEvent(e);
    if (!inBounds(c, r)) return;
    const b = grid[idx(c, r)];
    if (b) {
      if (b.kind === 'gate' && selectedBldg === b) toggleGate(b); // second click toggles
      selectedBldg = b; selectedBuild = null;
      syncPalette(); syncInfo();
      return;
    }
    if (selectedBuild) {
      if (selectedBuild === 'knight') placeKnight(c, r);
      else placeBuilding(c, r);
      return;
    }
    selectedBldg = null; syncInfo();
  });

  function selectBuild(type) {
    selectedBuild = selectedBuild === type ? null : type;
    selectedBldg = null;
    syncPalette(); syncInfo();
  }
  function selectDifficulty(key) {
    if (diffLocked() || !DIFFICULTIES[key] || key === diffKey) return;
    diffKey = key;
    reset(); // re-applies starting gold/keep HP and re-syncs the selector
  }
  document.querySelectorAll('.twr-btn').forEach(btn => btn.addEventListener('click', () => selectBuild(btn.dataset.type)));
  document.querySelectorAll('.diff-btn').forEach(btn => btn.addEventListener('click', () => selectDifficulty(btn.dataset.diff)));
  function togglePause() {
    if (!started || ended) return;
    paused = !paused;
    $('pauseBtn').textContent = paused ? 'RESUME' : 'PAUSE';
  }
  function toggleView() {
    kingView = !kingView;
    lookDrag = null;
    if (kingView) { selectedBuild = null; selectedBldg = null; syncPalette(); syncInfo(); }
    $('viewBtn').textContent = kingView ? 'BUILD VIEW' : 'KING VIEW';
  }
  $('startBtn').addEventListener('click', startWave);
  $('pauseBtn').addEventListener('click', togglePause);
  $('viewBtn').addEventListener('click', toggleView);

  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keysHeld[k] = true;
    if (kingView && (k === 'arrowleft' || k === 'arrowright')) e.preventDefault();
    if (k === 'v') { toggleView(); return; }
    if (k === '1') selectBuild('wall');
    else if (k === '2') selectBuild('gate');
    else if (k === '3') selectBuild('archer');
    else if (k === '4') selectBuild('mage');
    else if (k === '5') selectBuild('catapult');
    else if (k === '6') selectBuild('knight');
    else if (k === ' ') { e.preventDefault(); startWave(); }
    else if (k === 'p') togglePause();
    else if (k === 'escape') { selectedBuild = null; selectedBldg = null; syncPalette(); syncInfo(); }
    else if (k === 'r') { reset(); }
  });
  document.addEventListener('keyup', e => { keysHeld[e.key.toLowerCase()] = false; });

  // ── Loop ────────────────────────────────────────────────────────────────────
  let last = 0;
  function loop(ts) {
    now = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    // Settle the flow field at most once per frame, even while paused / pre-wave,
    // so building during setup refreshes the breach previews immediately.
    if (flowDirty) { recomputeFlow(); flowDirty = false; }
    // king's-view look keys stay live even while paused
    if (kingView) {
      const rot = ((keysHeld['arrowright'] || keysHeld['d']) ? 1 : 0) - ((keysHeld['arrowleft'] || keysHeld['a']) ? 1 : 0);
      if (rot) yaw += rot * 1.8 * dt;
    }
    if (started && !paused && !ended) update(dt);
    if (kingView) drawKing(); else draw();
    requestAnimationFrame(loop);
  }

  reset();
  requestAnimationFrame(ts => { last = ts; requestAnimationFrame(loop); });
})();
