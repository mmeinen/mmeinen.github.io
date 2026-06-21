/* Orbital Defense — a self-contained tower defense game.
   Pure canvas + JS, no dependencies. Space / blue-HUD theme to match the site. */
(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // ── Grid / geometry ─────────────────────────────────────────────────────────
  const TILE = 40, COLS = 20, ROWS = 15;
  const W = COLS * TILE, H = ROWS * TILE;

  // Enemy path as tile waypoints (axis-aligned segments). Off-grid ends let
  // enemies slide on/off screen. Center coords are derived in PATH.
  const WAYPOINTS = [
    { c: -1, r: 7 }, { c: 4, r: 7 }, { c: 4, r: 11 }, { c: 9, r: 11 },
    { c: 9, r: 3 }, { c: 14, r: 3 }, { c: 14, r: 11 }, { c: 20, r: 11 },
  ];
  const center = (c, r) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
  const PATH = WAYPOINTS.map(w => center(w.c, w.r));

  // Cells covered by the path are not buildable.
  const pathCells = new Set();
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const a = WAYPOINTS[i], b = WAYPOINTS[i + 1];
    const dc = Math.sign(b.c - a.c), dr = Math.sign(b.r - a.r);
    let c = a.c, r = a.r;
    pathCells.add(c + ',' + r);
    while (c !== b.c || r !== b.r) { c += dc; r += dr; pathCells.add(c + ',' + r); }
  }

  // ── Config ──────────────────────────────────────────────────────────────────
  const START_GOLD = 160, START_LIVES = 20, MAX_WAVES = 15;

  const TOWERS = {
    blaster: { name: 'Blaster', cost: 50, range: 118, fireRate: 340, damage: 11, projSpeed: 420, kind: 'bolt', color: 'rgba(60,140,255,1)' },
    cannon:  { name: 'Cannon',  cost: 120, range: 108, fireRate: 1150, damage: 34, splash: 48, projSpeed: 300, kind: 'shell', color: 'rgba(255,160,80,1)' },
    frost:   { name: 'Frost',   cost: 80, range: 104, fireRate: 520, damage: 5, slowMul: 0.45, slowDur: 1200, kind: 'beam', color: 'rgba(120,220,255,1)' },
  };
  // Per-level multipliers (index by tower level 1..3).
  const LVL_DMG = [0, 1, 1.65, 2.5], LVL_RANGE = [0, 0, 12, 24], LVL_RATE = [0, 1, 0.85, 0.72];

  const ENEMIES = {
    drone: { name: 'Drone', hp: 32, speed: 62, reward: 7, leak: 1, size: 11, shape: 'diamond', color: 'rgba(90,200,255,1)' },
    scout: { name: 'Scout', hp: 18, speed: 118, reward: 6, leak: 1, size: 9, shape: 'tri', color: 'rgba(240,220,90,1)' },
    tank:  { name: 'Tank',  hp: 150, speed: 38, reward: 18, leak: 2, size: 14, shape: 'square', color: 'rgba(255,135,70,1)' },
    boss:  { name: 'Boss',  hp: 1300, speed: 30, reward: 180, leak: 10, size: 21, shape: 'hex', color: 'rgba(230,90,220,1)' },
  };

  // ── State ───────────────────────────────────────────────────────────────────
  let gold, lives, score, wave, towers, enemies, projectiles, effects;
  let waveActive, started, paused, ended, victory;
  let spawnQueue, spawnIndex, spawnTimer;
  let selectedBuild, selectedTower;
  let mouseCell = { c: -1, r: -1 };
  let now = 0;

  function reset() {
    gold = START_GOLD; lives = START_LIVES; score = 0; wave = 0;
    towers = []; enemies = []; projectiles = []; effects = [];
    waveActive = false; started = false; paused = false; ended = false; victory = false;
    spawnQueue = []; spawnIndex = 0; spawnTimer = 0;
    selectedBuild = null; selectedTower = null;
    syncHud(); syncPalette(); syncInfo();
  }

  // ── Waves ───────────────────────────────────────────────────────────────────
  function buildWave(n) {
    const q = [];
    const push = (type, count, gap) => { for (let i = 0; i < count; i++) q.push({ type, gap }); };
    push('drone', 5 + Math.floor(n * 1.4), 0.6);
    if (n >= 2) push('scout', 2 + Math.floor(n * 0.8), 0.4);
    if (n >= 4) push('tank', 1 + Math.floor(n / 3), 0.95);
    if (n === 8 || n === 12) push('tank', 3, 0.8);
    if (n === 10 || n === MAX_WAVES) push('boss', 1, 1.4);
    return q;
  }

  function startWave() {
    if (ended) return;
    if (waveActive || wave >= MAX_WAVES) return;
    started = true;
    wave++;
    spawnQueue = buildWave(wave);
    spawnIndex = 0;
    spawnTimer = 999; // spawn first enemy immediately
    waveActive = true;
    syncHud();
  }

  function spawnEnemy(type) {
    const base = ENEMIES[type];
    const hpScale = type === 'boss' ? 1 + (wave - 1) * 0.05 : 1 + (wave - 1) * 0.12;
    const hp = Math.round(base.hp * hpScale);
    enemies.push({
      type, x: PATH[0].x, y: PATH[0].y, wp: 1,
      hp, maxHp: hp, speed: base.speed, reward: base.reward, leak: base.leak,
      size: base.size, shape: base.shape, color: base.color,
      dist: 0, slowUntil: 0, slowMul: 1, dead: false, hitFlash: 0,
    });
  }

  function endWave() {
    waveActive = false;
    const bonus = 20 + wave * 5;
    gold += bonus;
    if (wave >= MAX_WAVES) { victory = true; ended = true; }
    syncHud();
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
    // Target the enemy furthest along the path within range (classic "first").
    let best = null, bestDist = -1;
    const r2 = range * range;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - t.x, dy = e.y - t.y;
      if (dx * dx + dy * dy <= r2 && e.dist > bestDist) { best = e; bestDist = e.dist; }
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
    // Spawning
    if (waveActive) {
      spawnTimer += dt;
      if (spawnIndex < spawnQueue.length && spawnTimer >= spawnQueue[spawnIndex].gap) {
        spawnEnemy(spawnQueue[spawnIndex].type);
        spawnIndex++; spawnTimer = 0;
      }
    }

    // Enemies
    for (const e of enemies) {
      if (e.dead) continue;
      const slow = e.slowUntil > now ? e.slowMul : 1;
      let step = e.speed * slow * dt;
      while (step > 0 && !e.dead) {
        const wpt = PATH[e.wp];
        const dx = wpt.x - e.x, dy = wpt.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= step) {
          e.x = wpt.x; e.y = wpt.y; e.dist += d; step -= d; e.wp++;
          if (e.wp >= PATH.length) { // reached the core
            e.dead = true;
            lives -= e.leak;
            effects.push({ kind: 'leak', x: W, y: PATH[PATH.length - 1].y, t0: now, dur: 280 });
            if (lives <= 0) { lives = 0; ended = true; victory = false; }
          }
        } else {
          e.x += (dx / d) * step; e.y += (dy / d) * step; e.dist += step; step = 0;
        }
      }
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
          for (const e of enemies) {
            if (e.dead) continue;
            const ex = e.x - p.tx, ey = e.y - p.ty;
            if (ex * ex + ey * ey <= r2) damageEnemy(e, p.damage);
          }
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

    // Wave end
    if (waveActive && spawnIndex >= spawnQueue.length && enemies.length === 0) endWave();

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

    // path track
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(40,70,130,0.55)'; ctx.lineWidth = 30;
    pathPolyline();
    ctx.strokeStyle = 'rgba(60,140,255,0.18)'; ctx.lineWidth = 30;
    ctx.setLineDash([2, 14]); pathPolyline(); ctx.setLineDash([]);

    // core / exit
    const exit = PATH[PATH.length - 1];
    const cgx = ctx.createRadialGradient(W - 6, exit.y, 4, W - 6, exit.y, 34);
    cgx.addColorStop(0, 'rgba(120,200,255,0.9)'); cgx.addColorStop(1, 'rgba(60,140,255,0)');
    ctx.fillStyle = cgx;
    ctx.beginPath(); ctx.arc(W - 6, exit.y, 34, 0, Math.PI * 2); ctx.fill();

    // build hints on empty buildable cells
    if (selectedBuild) {
      ctx.fillStyle = 'rgba(60,140,255,0.12)';
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (isBuildable(c, r)) ctx.fillRect(c * TILE + 4, r * TILE + 4, TILE - 8, TILE - 8);
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

    if (!started) overlay('ORBITAL DEFENSE', 'Build towers, then press START WAVE.\nStop ' + MAX_WAVES + ' waves from reaching the core.');
    else if (ended) overlay(victory ? 'VICTORY' : 'CORE LOST', victory
      ? 'All ' + MAX_WAVES + ' waves repelled!  Score: ' + score + '\nPress R to play again.'
      : 'The swarm overran your core.\nReached wave ' + wave + '.  Press R to retry.');
    else if (paused) overlay('PAUSED', 'Press P to resume.');
  }

  function pathPolyline() {
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
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
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'shell' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawEffect(f) {
    const k = (now - f.t0) / f.dur;
    if (f.kind === 'beam') {
      ctx.strokeStyle = f.color; ctx.lineWidth = 3 * (1 - k);
      ctx.globalAlpha = 1 - k;
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
  function isBuildable(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    if (pathCells.has(c + ',' + r)) return false;
    return !towerAt(c, r);
  }
  function towerAt(c, r) { return towers.find(t => t.c === c && t.r === r); }

  function placeTower(c, r) {
    const def = TOWERS[selectedBuild];
    if (!isBuildable(c, r) || gold < def.cost) return;
    const p = center(c, r);
    gold -= def.cost;
    towers.push({ type: selectedBuild, c, r, x: p.x, y: p.y, level: 1, cd: 0, angle: -Math.PI / 2, invested: def.cost });
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
    syncHud(); syncInfo();
  }

  // ── HUD sync ────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  function syncHud() {
    $('goldVal').textContent = Math.floor(gold);
    $('livesVal').textContent = lives;
    $('waveVal').textContent = wave + '/' + MAX_WAVES;
    $('scoreVal').textContent = score;
    $('startBtn').textContent = waveActive ? 'WAVE ' + wave : (wave >= MAX_WAVES ? 'DONE' : 'START WAVE');
    $('startBtn').disabled = waveActive || ended;
  }
  function syncPalette() {
    document.querySelectorAll('.twr-btn').forEach(btn => {
      const type = btn.dataset.type;
      btn.classList.toggle('sel', selectedBuild === type);
      btn.classList.toggle('broke', gold < TOWERS[type].cost);
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
  document.querySelectorAll('.twr-btn').forEach(btn => btn.addEventListener('click', () => selectBuild(btn.dataset.type)));
  $('startBtn').addEventListener('click', startWave);
  $('pauseBtn').addEventListener('click', () => { if (started && !ended) paused = !paused; });

  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === '1') selectBuild('blaster');
    else if (k === '2') selectBuild('cannon');
    else if (k === '3') selectBuild('frost');
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
