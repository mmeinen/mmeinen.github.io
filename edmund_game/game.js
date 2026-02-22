// ─── Constants ───────────────────────────────────────────────────────────────
const W = 800, H = 600;
const ENEMY_COLS = 10, ENEMY_ROWS = 4;
const ENEMY_W = 44, ENEMY_H = 34;
const ENEMY_PADDING_X = 14, ENEMY_PADDING_Y = 16;
const ENEMY_START_X = 40, ENEMY_START_Y = 40;

// ─── Canvas setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ─── Input ───────────────────────────────────────────────────────────────────
const keys = {};
let cheatBuffer = 0;
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); game.switchWeapon(); }
  if (e.code === 'Space') { e.preventDefault(); game.attack(); }
  if (e.code === 'Enter') { e.preventDefault(); game.handleEnter(); }

  if (e.key === '1' && game.state === 'shop') { e.preventDefault(); game.buyWeapon('bow'); }
  if (e.key === '2' && game.state === 'shop') { e.preventDefault(); game.buyWeapon('bomb'); }

  if (e.key === '9' && game.state === 'playing') {
    cheatBuffer++;
    if (cheatBuffer >= 3) {
      cheatBuffer = 0;
      game.wave = 12;
      game.enemies = [];
    }
  } else {
    cheatBuffer = 0;
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ─── Mountain terrain generator ──────────────────────────────────────────────
function generateMountainLayer(numPeaks, minY, maxY, seed) {
  // Use seeded-ish values by offsetting with seed so layers differ
  const pts = [{ x: 0, y: H }];
  for (let i = 0; i <= numPeaks; i++) {
    const x = (W / numPeaks) * i + (seed * 7 % 20) - 10;
    // Alternate peaks and valleys for natural look
    const t = (i % 2 === 0) ? 0.1 : 0.9;
    const y = minY + t * (maxY - minY) + (Math.sin(i * 2.3 + seed) * 20);
    pts.push({ x: Math.max(0, Math.min(W, x)), y });
  }
  pts.push({ x: W, y: H });
  return pts;
}

function drawMountainLayer(pts, fillStyle) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    // Smooth with midpoints
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function drawBackground(terrain) {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  sky.addColorStop(0, '#0d1b3e');
  sky.addColorStop(0.5, '#1a3560');
  sky.addColorStop(1, '#3a6080');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars (upper portion only)
  ctx.fillStyle = '#fff';
  for (const s of terrain.stars) {
    ctx.globalAlpha = s.b;
    ctx.fillRect(s.x, s.y, s.sz, s.sz);
  }
  ctx.globalAlpha = 1;

  // Moon
  ctx.fillStyle = '#e8e0c0';
  ctx.beginPath();
  ctx.arc(680, 55, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d0c898';
  ctx.beginPath();
  ctx.arc(670, 48, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(692, 62, 4, 0, Math.PI * 2);
  ctx.fill();

  // Far mountains — pale blue-grey snow peaks
  drawMountainLayer(terrain.far, '#4a6070');
  // Snow caps on far mountains
  ctx.save();
  ctx.globalAlpha = 0.6;
  for (let i = 1; i < terrain.far.length - 2; i += 2) {
    const p = terrain.far[i];
    if (p.y < H * 0.45) {
      ctx.fillStyle = '#c8d8e0';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 18, p.y + 22);
      ctx.lineTo(p.x + 18, p.y + 22);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // Mid mountains — dark blue-green
  drawMountainLayer(terrain.mid, '#2a4030');

  // Near hills — darkest, greenish-brown
  drawMountainLayer(terrain.near, '#1a2a18');

  // Ground strip
  const ground = ctx.createLinearGradient(0, H - 30, 0, H);
  ground.addColorStop(0, '#2a3a20');
  ground.addColorStop(1, '#1a2010');
  ctx.fillStyle = ground;
  ctx.fillRect(0, H - 30, W, 30);

  // Subtle fog at mountain base
  const fog = ctx.createLinearGradient(0, H * 0.6, 0, H * 0.75);
  fog.addColorStop(0, 'rgba(40,70,80,0)');
  fog.addColorStop(1, 'rgba(20,40,60,0.35)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, H * 0.6, W, H * 0.15);
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────
function drawNugget(x, y, w, h, highlight) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);

  const base  = highlight ? '#d4900a' : '#a86010';
  const crust = highlight ? '#e8b040' : '#c07820';
  const dark  = highlight ? '#c07820' : '#804000';

  // Main body — chunky irregular rectangle with slight rounding
  const hw = w / 2 - 2, hh = h / 2 - 2;
  ctx.beginPath();
  ctx.moveTo(-hw + 4,  -hh);
  ctx.lineTo( hw - 4,  -hh);
  ctx.lineTo( hw,      -hh + 4);
  ctx.lineTo( hw,       hh - 4);
  ctx.lineTo( hw - 6,   hh);
  ctx.lineTo(-hw + 6,   hh);
  ctx.lineTo(-hw,       hh - 4);
  ctx.lineTo(-hw,      -hh + 4);
  ctx.closePath();
  ctx.fillStyle = base;
  ctx.fill();

  // Breaded crust — uneven patches on top face
  ctx.fillStyle = crust;
  // Top-left patch
  ctx.fillRect(-hw + 3, -hh + 2, Math.floor(w * 0.35), Math.floor(h * 0.28));
  // Bottom-right patch
  ctx.fillRect(Math.floor(w * 0.05), Math.floor(h * 0.1), Math.floor(w * 0.3), Math.floor(h * 0.25));
  // Top-right small patch
  ctx.fillRect(Math.floor(w * 0.28), -hh + 2, Math.floor(w * 0.18), Math.floor(h * 0.18));

  // Dark crust crevices
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-hw + 8, -hh + 6);
  ctx.lineTo(hw - 10, -hh + 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-hw + 5, 2);
  ctx.lineTo(hw - 14, 4);
  ctx.stroke();

  // Outline
  ctx.strokeStyle = '#5a2e00';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-hw + 4,  -hh);
  ctx.lineTo( hw - 4,  -hh);
  ctx.lineTo( hw,      -hh + 4);
  ctx.lineTo( hw,       hh - 4);
  ctx.lineTo( hw - 6,   hh);
  ctx.lineTo(-hw + 6,   hh);
  ctx.lineTo(-hw,       hh - 4);
  ctx.lineTo(-hw,      -hh + 4);
  ctx.closePath();
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(-8, -5, 5, 5);
  ctx.fillRect(3,  -5, 5, 5);
  ctx.fillStyle = '#111';
  ctx.fillRect(-7, -4, 3, 3);
  ctx.fillRect(4,  -4, 3, 3);
  // Eye shine
  ctx.fillStyle = '#fff';
  ctx.fillRect(-6, -4, 1, 1);
  ctx.fillRect(5,  -4, 1, 1);

  // Angry brows
  ctx.strokeStyle = '#3a1000';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-4, -7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10,  -8); ctx.lineTo( 4, -7); ctx.stroke();

  // Mouth — scowl
  ctx.strokeStyle = '#3a1000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-5, 6);
  ctx.lineTo(-2, 8);
  ctx.lineTo(2,  8);
  ctx.lineTo(5,  6);
  ctx.stroke();

  ctx.restore();
}

function drawPlayer(p) {
  const x = p.x, y = p.y;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + p.h - 2, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#3a6ea8';
  ctx.fillRect(x - 10, y + p.h - 20, 9, 20);
  ctx.fillRect(x + 1,  y + p.h - 20, 9, 20);

  // Body
  ctx.fillStyle = '#4a90d9';
  ctx.fillRect(x - 13, y + 12, 26, 26);

  // Belt
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x - 13, y + 32, 26, 5);
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(x - 4, y + 33, 8, 4);

  // Arms
  ctx.fillStyle = '#4a90d9';
  if (p.weapon === 'sword' && p.swordSwing > 0) {
    ctx.fillRect(x + 13, y + 10, 10, 8);
  } else {
    ctx.fillRect(x - 23, y + 14, 10, 8);
    ctx.fillRect(x + 13, y + 14, 10, 8);
  }

  // Head
  ctx.fillStyle = '#f5c89a';
  ctx.fillRect(x - 11, y, 22, 20);
  // Hair
  ctx.fillStyle = '#5a3010';
  ctx.fillRect(x - 11, y, 22, 7);
  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 8, y + 7, 5, 5);
  ctx.fillRect(x + 3, y + 7, 5, 5);
  ctx.fillStyle = '#222';
  ctx.fillRect(x - 7, y + 8, 3, 3);
  ctx.fillRect(x + 4, y + 8, 3, 3);

  if (p.weapon === 'sword') drawSword(p);
  else if (p.weapon === 'bow') drawBow(p);
  else drawBombItem(p);
}

function drawSword(p) {
  ctx.save();
  const cx = p.x + 18, cy = p.y + 18;
  // Rest: point upper-right. Swing: sweeps up and across to upper-left
  const swingFrac = p.swordSwing / 15; // 1 at start, 0 at end
  const angle = -Math.PI / 4 - (1 - swingFrac) * (Math.PI * 0.85);
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  // Blade — longer for extended reach
  ctx.fillStyle = '#d8e0f0';
  ctx.fillRect(-3, -70, 6, 70);
  // Blade edge highlight
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-1, -70, 2, 70);
  // Guard
  ctx.fillStyle = '#c8a000';
  ctx.fillRect(-11, -5, 22, 5);
  // Handle
  ctx.fillStyle = '#7a3a10';
  ctx.fillRect(-3, 0, 6, 16);
  ctx.restore();
}

function drawBow(p) {
  ctx.save();
  ctx.translate(p.x - 18, p.y + 20);
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 18, -Math.PI * 0.7, Math.PI * 0.7);
  ctx.stroke();
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(0, 14);
  ctx.stroke();
  ctx.restore();
}

function drawBombItem(p) {
  // Held bomb in left hand
  ctx.save();
  ctx.translate(p.x - 16, p.y + 22);
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  // Fuse
  ctx.strokeStyle = '#c8a020';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(4, -6);
  ctx.quadraticCurveTo(10, -14, 6, -18);
  ctx.stroke();
  // Spark
  const spark = Math.floor(Date.now() / 120) % 2 === 0;
  if (spark) {
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.arc(6, -18, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawThrownBomb(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  // Spin with trajectory
  ctx.rotate(b.angle);
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Fuse
  ctx.strokeStyle = '#c8a020';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(5, -7);
  ctx.quadraticCurveTo(11, -15, 7, -19);
  ctx.stroke();
  // Spark (flickers faster when fuse is short)
  const flickerRate = b.fuse < 30 ? 60 : 120;
  if (Math.floor(Date.now() / flickerRate) % 2 === 0) {
    ctx.fillStyle = b.fuse < 30 ? '#ff2200' : '#ff8800';
    ctx.beginPath();
    ctx.arc(7, -19, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBlast(b) {
  const t = 1 - b.life / b.maxLife; // 0 at start, 1 at end

  // ── Blinding white flash at detonation ───────────────────────────────────
  if (t < 0.14) {
    const fa = (1 - t / 0.14) * 0.95;
    ctx.save();
    ctx.globalAlpha = fa;
    const fg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius * 0.65);
    fg.addColorStop(0, '#ffffff');
    fg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Fireball core ─────────────────────────────────────────────────────────
  if (t < 0.58) {
    const cr = b.radius * 0.55 * (1 - t * 0.5);
    const ca = (1 - t / 0.58) * 0.92;
    const cg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, cr);
    cg.addColorStop(0,   `rgba(255,255,210,${ca})`);
    cg.addColorStop(0.3, `rgba(255,180,30,${ca * 0.9})`);
    cg.addColorStop(0.7, `rgba(220,60,0,${ca * 0.6})`);
    cg.addColorStop(1,   `rgba(180,40,0,0)`);
    ctx.save();
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(b.x, b.y, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Primary shockwave ring ────────────────────────────────────────────────
  const rr = b.radius * (0.1 + t * 0.9);
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,150,10,${(1 - t) * 0.95})`;
  ctx.lineWidth = 14 * (1 - t) + 1;
  ctx.stroke();
  ctx.restore();

  // ── Secondary outer ring (slightly delayed) ───────────────────────────────
  if (t > 0.08) {
    const t2 = (t - 0.08) / 0.92;
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 1.35 * t2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,220,80,${(1 - t2) * 0.55})`;
    ctx.lineWidth = 5 * (1 - t2) + 1;
    ctx.stroke();
    ctx.restore();
  }

  // ── Debris particles flying outward ──────────────────────────────────────
  for (const p of b.particles) {
    const dist = p.speed * t * b.radius;
    const px = b.x + Math.cos(p.angle) * dist;
    const py = b.y + Math.sin(p.angle) * dist + t * t * 35;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.95;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(px, py, p.r * (1 - t * 0.55), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Rising smoke puffs ────────────────────────────────────────────────────
  if (t > 0.25) {
    const st = (t - 0.25) / 0.75;
    for (const s of b.smokes) {
      const sx = b.x + s.ox + s.vx * st * 25;
      const sy = b.y + s.oy - st * s.rise * 50;
      ctx.save();
      ctx.globalAlpha = (1 - st) * 0.38;
      ctx.fillStyle = `rgb(${70 + s.sh},${70 + s.sh},${75 + s.sh})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.r + st * s.r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawArrow(a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(a.vx || 0, a.speed)); // tilt to match flight direction
  ctx.strokeStyle = '#c8a060';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.stroke();
  ctx.fillStyle = '#bbb';
  ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(0, -8); ctx.fill();
  ctx.fillStyle = '#e44';
  ctx.beginPath(); ctx.moveTo(-3, 18); ctx.lineTo(0, 22); ctx.lineTo(3, 18); ctx.fill();
  ctx.restore();
}

function drawSwordSwipe(p) {
  if (p.swordSwing <= 0) return;
  const swingFrac = p.swordSwing / 15;        // 1→0 as animation plays out
  const done = 1 - swingFrac;                 // 0→1

  ctx.save();
  ctx.translate(p.x + 18, p.y + 18);

  // Arc sweeps from -π/4 (upper-right) counterclockwise by up to ~155°
  const startAngle = -Math.PI / 4;
  const endAngle   = startAngle - done * (Math.PI * 0.85);
  const radius = 105;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, radius, endAngle, startAngle);
  ctx.closePath();
  ctx.fillStyle = `rgba(180,230,255,${0.22 * swingFrac})`;
  ctx.fill();
  // Bright leading edge
  ctx.beginPath();
  ctx.arc(0, 0, radius, endAngle - 0.08, endAngle + 0.08);
  ctx.strokeStyle = `rgba(220,240,255,${0.8 * swingFrac})`;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

function drawExplosion(e) {
  const t = 1 - e.life / e.maxLife;
  for (const p of e.particles) {
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(e.x + p.vx * t * 35, e.y + p.vy * t * 35, p.r * (1 - t * 0.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Game object ─────────────────────────────────────────────────────────────
const game = {
  state: 'title',
  score: 0,
  wave: 1,
  lives: 10,
  coins: 0,
  unlockedWeapons: ['sword'],

  player: null,
  enemies: [],
  arrows: [],
  bombs: [],
  blasts: [],
  explosions: [],
  terrain: null,
  winSparkles: [],

  init() {
    this.score = 0;
    this.wave = 1;
    this.lives = 10;
    this.coins = 0;
    this.unlockedWeapons = ['sword'];
    this.arrows = [];
    this.bombs = [];
    this.blasts = [];
    this.explosions = [];
    this.winSparkles = [];
    this.player = {
      x: W / 2, y: H - 70,
      w: 26, h: 56,
      speed: 4,
      weapon: 'sword',
      swordSwing: 0,
      swordCooldown: 0,
      bowCooldown: 0,
      bombCooldown: 0,
      invincible: 0,
    };
    this.buildTerrain();
    this.spawnWave(1);
    this.updateHUD();
  },

  buildTerrain() {
    // Generate mountain layers once; they stay static
    this.terrain = {
      far:  generateMountainLayer(12, H * 0.18, H * 0.52, 1),
      mid:  generateMountainLayer(8,  H * 0.35, H * 0.60, 5),
      near: generateMountainLayer(6,  H * 0.50, H * 0.70, 9),
      stars: [],
    };
    for (let i = 0; i < 100; i++) {
      this.terrain.stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.55,
        sz: Math.random() < 0.8 ? 1 : 2,
        b: 0.3 + Math.random() * 0.7,
      });
    }
  },

  spawnWave(waveNum) {
    this.enemies = [];
    // Wave 1 = 5 nuggets, +3 per wave (max 12 waves)
    const count = 5 + (waveNum - 1) * 3;
    // Speed is fixed — only the count grows
    const baseVy = 0.25;
    const baseVx = 0.5;

    for (let i = 0; i < count; i++) {
      // Spread them randomly across the top, staggered in depth
      const x = 30 + Math.random() * (W - 30 - ENEMY_W);
      const y = 20 + Math.random() * 120;
      const vx = (Math.random() * 2 - 1) * baseVx;
      const vy = baseVy + Math.random() * 0.3;
      this.enemies.push({
        x, y,
        w: ENEMY_W, h: ENEMY_H,
        alive: true,
        vx,
        vy,
        wanderTimer: Math.floor(Math.random() * 90) + 60,
        baseVx,
        grounded: false,
      });
    }
  },

  switchWeapon() {
    if (this.state !== 'playing') return;
    const p = this.player;
    const idx = this.unlockedWeapons.indexOf(p.weapon);
    p.weapon = this.unlockedWeapons[(idx + 1) % this.unlockedWeapons.length];
    const names = { sword: 'Sword', bow: 'Bow & Arrow', bomb: 'Bomb' };
    document.getElementById('weapon').textContent = names[p.weapon];
  },

  buyWeapon(weapon) {
    const prices = { bow: 5, bomb: 8 };
    const cost = prices[weapon];
    if (this.unlockedWeapons.includes(weapon)) return;
    if (this.coins < cost) return;
    this.coins -= cost;
    this.unlockedWeapons.push(weapon);
    document.getElementById('coins').textContent = this.coins;
  },

  attack() {
    if (this.state !== 'playing') return;
    const p = this.player;
    if (p.weapon === 'sword') {
      if (p.swordCooldown <= 0) {
        p.swordSwing = 15;
        p.swordCooldown = 28;
      }
    } else if (p.weapon === 'bow') {
      if (p.bowCooldown <= 0) {
        // Slight auto-aim: lean arrow horizontally toward nearest enemy
        let vx = 0;
        const target = this.getNearestEnemy();
        if (target) {
          const dx = (target.x + target.w / 2) - p.x;
          const dy = (target.y + target.h / 2) - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          vx = (dx / dist) * 2.5; // small horizontal nudge, capped by the ratio
        }
        this.arrows.push({ x: p.x, y: p.y - 10, speed: 9, vx, active: true });
        p.bowCooldown = 18;
      }
    } else if (p.weapon === 'bomb') {
      if (p.bombCooldown <= 0) {
        // Aim vx so bomb reaches nearest enemy's x when fuse runs out
        const fuse = 70;
        let vx = (Math.random() * 2 - 1) * 1.5; // fallback: random spread
        const target = this.getNearestEnemy();
        if (target) {
          const targetCx = target.x + target.w / 2;
          vx = Math.max(-8, Math.min(8, (targetCx - p.x) / fuse));
        }
        this.bombs.push({
          x: p.x, y: p.y,
          vx, vy: -11,
          angle: 0, fuse,
          active: true,
        });
        p.bombCooldown = 120;
      }
    }
  },

  getNearestEnemy() {
    const p = this.player;
    let nearest = null, minDist = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = (e.x + e.w / 2) - p.x;
      const dy = (e.y + e.h / 2) - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; nearest = e; }
    }
    return nearest;
  },

  handleEnter() {
    if (this.state === 'shop') {
      this.wave++;
      document.getElementById('wave').textContent = this.wave;
      this.arrows = [];
      this.spawnWave(this.wave);
      this.state = 'playing';
      return;
    }
    if (this.state === 'title' || this.state === 'gameover' || this.state === 'win') {
      this.state = 'playing';
      this.init();
    }
  },

  updateHUD() {
    document.getElementById('score').textContent = this.score;
    document.getElementById('wave').textContent = this.wave;
    document.getElementById('lives').textContent = this.lives;
    document.getElementById('coins').textContent = this.coins;
    const names = { sword: 'Sword', bow: 'Bow & Arrow', bomb: 'Bomb' };
    document.getElementById('weapon').textContent =
      names[this.player?.weapon] ?? 'Sword';
  },

  checkSwordHits() {
    const p = this.player;
    if (p.swordSwing <= 0) return;
    // Pivot at right shoulder; blade sweeps a large arc upward
    const cx = p.x + 18, cy = p.y + 18;
    const r = 108; // matches visual radius + some leniency

    // Arc sweep: from -π/4 counterclockwise up to -π/4 - 0.85π
    const swingDone = 1 - p.swordSwing / 15;
    const arcStart  = -Math.PI / 4;
    const arcEnd    = arcStart - swingDone * (Math.PI * 0.85);

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
      const dx = ex - cx, dy = ey - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r + e.w / 2) continue;
      // Check if enemy center angle is within swept arc
      const angle = Math.atan2(dy, dx);
      // Normalize angle into range [arcEnd, arcStart]
      const lo = arcEnd, hi = arcStart;
      if (angle >= lo - 0.3 && angle <= hi + 0.3) {
        this.killEnemy(e);
      }
    }
  },

  checkArrowHits() {
    for (const a of this.arrows) {
      if (!a.active) continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (a.x > e.x && a.x < e.x + e.w && a.y > e.y && a.y < e.y + e.h) {
          a.active = false;
          this.detonateArrow(a.x, a.y);
          break;
        }
      }
    }
  },

  detonateArrow(x, y) {
    const RADIUS = 65;
    // Kill all enemies in the small blast radius
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = (e.x + e.w / 2) - x, dy = (e.y + e.h / 2) - y;
      if (Math.sqrt(dx * dx + dy * dy) < RADIUS + e.w / 2) this.killEnemy(e);
    }
    const colors = ['#ffee44','#ff8800','#ff4400','#aaddff','#ffffff','#ffcc00'];
    const particles = [];
    for (let i = 0; i < 14; i++) {
      particles.push({
        angle: (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
        speed: 0.4 + Math.random() * 0.65,
        r: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    const smokes = [];
    for (let i = 0; i < 4; i++) {
      smokes.push({
        ox: (Math.random() - 0.5) * 22,
        oy: (Math.random() - 0.5) * 22,
        vx: (Math.random() - 0.5) * 1.2,
        rise: 0.5 + Math.random() * 0.8,
        r: 8 + Math.random() * 10,
        sh: Math.floor(Math.random() * 40),
      });
    }
    this.blasts.push({ x, y, radius: RADIUS, life: 35, maxLife: 35, particles, smokes });
  },

  killEnemy(e) {
    e.alive = false;
    this.score += 10;
    document.getElementById('score').textContent = this.score;
    this.coins++;
    document.getElementById('coins').textContent = this.coins;
    const particles = [];
    const colors = ['#ffcc44', '#e09a30', '#ff8800', '#fff8e0', '#c8841a'];
    for (let i = 0; i < 14; i++) {
      particles.push({
        vx: (Math.random() - 0.5) * 2.2,
        vy: (Math.random() - 0.5) * 2.2,
        r: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    this.explosions.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, life: 22, maxLife: 22, particles });
  },

  updateBombs() {
    const BLAST_RADIUS = 170;
    for (const b of this.bombs) {
      if (!b.active) continue;
      b.vy += 0.15; // gentle gravity so it arcs high
      b.x += b.vx;
      b.y += b.vy;
      b.angle += 0.14;
      b.fuse--;

      // Proximity trigger — detonate if close enough to any nugget
      if (b.fuse > 5) { // short grace period so it clears the player first
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
          const dx = ex - b.x, dy = ey - b.y;
          if (Math.sqrt(dx * dx + dy * dy) < 50) { b.fuse = 0; break; }
        }
      }

      if (b.fuse <= 0) { // fuse expired or proximity triggered
        b.active = false;
        // Kill all enemies in blast radius (player immune)
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
          const dx = ex - b.x, dy = ey - b.y;
          if (Math.sqrt(dx * dx + dy * dy) < BLAST_RADIUS + e.w / 2) {
            this.killEnemy(e);
          }
        }
        // Build debris particles
        const debrisColors = ['#ffee44','#ff8800','#ff4400','#ffffff','#ffcc00','#ff6600','#ffaa00'];
        const particles = [];
        for (let i = 0; i < 24; i++) {
          particles.push({
            angle: (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
            speed: 0.45 + Math.random() * 0.7,
            r: 4 + Math.random() * 8,
            color: debrisColors[Math.floor(Math.random() * debrisColors.length)],
          });
        }
        // Build smoke puffs
        const smokes = [];
        for (let i = 0; i < 10; i++) {
          smokes.push({
            ox: (Math.random() - 0.5) * 50,
            oy: (Math.random() - 0.5) * 50,
            vx: (Math.random() - 0.5) * 1.8,
            rise: 0.6 + Math.random() * 1.2,
            r: 18 + Math.random() * 22,
            sh: Math.floor(Math.random() * 50),
          });
        }
        this.blasts.push({
          x: b.x, y: b.y,
          radius: BLAST_RADIUS,
          life: 55, maxLife: 55,
          particles, smokes,
        });
      }
    }
    this.bombs = this.bombs.filter(b => b.active);
    for (const b of this.blasts) b.life--;
    this.blasts = this.blasts.filter(b => b.life > 0);
  },

  updateEnemies() {
    const alive = this.enemies.filter(e => e.alive);

    if (alive.length === 0) {
      if (this.wave >= 12) {
        this.state = 'win';
        return;
      }
      this.state = 'shop';
      return;
    }

    const floorY = this.player.y + 25;
    const chaseSpeed = 0.9;

    for (const e of alive) {
      if (e.grounded) {
        // Slide horizontally toward the player
        const centerX = e.x + e.w / 2;
        const dir = this.player.x > centerX ? 1 : -1;
        e.x += dir * chaseSpeed;
        if (e.x < 5) e.x = 5;
        if (e.x + e.w > W - 5) e.x = W - 5 - e.w;
      } else {
        // Normal falling + sideways wander
        e.x += e.vx;
        e.y += e.vy;

        if (e.x < 5) { e.x = 5; e.vx = Math.abs(e.vx); }
        if (e.x + e.w > W - 5) { e.x = W - 5 - e.w; e.vx = -Math.abs(e.vx); }

        e.wanderTimer--;
        if (e.wanderTimer <= 0) {
          const maxVx = e.baseVx * 2;
          e.vx = (Math.random() * 2 - 1) * maxVx;
          e.wanderTimer = Math.floor(Math.random() * 90) + 60;
        }

        // Reached the player's level — lock to floor and start chasing
        if (e.y + e.h >= floorY) {
          e.y = floorY - e.h;
          e.vy = 0;
          e.grounded = true;
        }
      }
    }
  },

  checkEnemyCollision() {
    const p = this.player;
    if (p.invincible > 0) return;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (
        p.x - p.w / 2 < e.x + e.w &&
        p.x + p.w / 2 > e.x &&
        p.y < e.y + e.h &&
        p.y + p.h > e.y
      ) {
        this.loseLife();
        return;
      }
    }
  },

  loseLife() {
    this.lives--;
    document.getElementById('lives').textContent = this.lives;
    if (this.lives <= 0) {
      this.state = 'gameover';
    } else {
      this.player.invincible = 120;
      this.spawnWave(this.wave);
    }
  },

  update() {
    if (this.state !== 'playing') return;
    const p = this.player;

    if (keys['ArrowLeft'] || keys['KeyA'])
      p.x = Math.max(p.w / 2 + 5, p.x - p.speed);
    if (keys['ArrowRight'] || keys['KeyD'])
      p.x = Math.min(W - p.w / 2 - 5, p.x + p.speed);

    if (p.swordCooldown > 0) p.swordCooldown--;
    if (p.bowCooldown > 0)   p.bowCooldown--;
    if (p.bombCooldown > 0)  p.bombCooldown--;
    if (p.swordSwing > 0)    p.swordSwing--;
    if (p.invincible > 0)    p.invincible--;

    for (const a of this.arrows) {
      if (a.active) { a.y -= a.speed; a.x += a.vx; }
      if (a.y < -20) a.active = false;
    }
    this.arrows = this.arrows.filter(a => a.active);

    this.checkSwordHits();
    this.checkArrowHits();
    this.updateBombs();
    this.updateEnemies();
    this.checkEnemyCollision();

    for (const e of this.explosions) e.life--;
    this.explosions = this.explosions.filter(e => e.life > 0);
  },

  draw() {
    ctx.clearRect(0, 0, W, H);

    if (this.state === 'title') { this.drawTitle(); return; }
    if (this.state === 'shop') { this.drawShop(); return; }

    drawBackground(this.terrain);

    for (const e of this.enemies) {
      if (e.alive) drawNugget(e.x, e.y, e.w, e.h, false);
    }

    for (const a of this.arrows) drawArrow(a);
    for (const b of this.bombs) drawThrownBomb(b);
    for (const bl of this.blasts) drawBlast(bl);

    for (const exp of this.explosions) drawExplosion(exp);

    const p = this.player;
    const visible = p.invincible === 0 || Math.floor(p.invincible / 6) % 2 === 0;
    if (visible) {
      drawSwordSwipe(p);
      drawPlayer(p);
    }

    if (this.state === 'gameover') this.drawGameOver();
    if (this.state === 'win') this.drawWin();
  },

  drawTitle() {
    // Use terrain if built, otherwise plain dark
    if (this.terrain) drawBackground(this.terrain);
    else { ctx.fillStyle = '#0d1b3e'; ctx.fillRect(0, 0, W, H); }

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(120, 120, W - 240, 320);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0c040';
    ctx.font = 'bold 52px "Courier New"';
    ctx.fillText('NUGGET INVASION', W / 2, 185);

    ctx.fillStyle = '#ccc';
    ctx.font = '17px "Courier New"';
    ctx.fillText('Defend the mountains from the Chicken Nugget Armada!', W / 2, 222);

    ctx.fillStyle = '#fff';
    ctx.font = '17px "Courier New"';
    ctx.fillText('← →  Move', W / 2, 268);
    ctx.fillText('Tab  Switch Weapon  |  Buy upgrades in shop', W / 2, 294);
    ctx.fillText('Space  Attack', W / 2, 320);

    const blink = Math.floor(Date.now() / 600) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#f0c040';
      ctx.font = 'bold 22px "Courier New"';
      ctx.fillText('Press ENTER to Start', W / 2, 390);
    }

    drawNugget(W / 2 - 22, 415, ENEMY_W, ENEMY_H, true);
    ctx.textAlign = 'left';
  },

  drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 52px "Courier New"';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 40);
    ctx.fillStyle = '#fff';
    ctx.font = '24px "Courier New"';
    ctx.fillText(`Score: ${this.score}`, W / 2, H / 2 + 10);
    const blink = Math.floor(Date.now() / 600) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#f0c040';
      ctx.font = '20px "Courier New"';
      ctx.fillText('Press ENTER to Play Again', W / 2, H / 2 + 60);
    }
    ctx.textAlign = 'left';
  },

  drawShop() {
    // Background
    if (this.terrain) drawBackground(this.terrain);
    else { ctx.fillStyle = '#0d1b3e'; ctx.fillRect(0, 0, W, H); }

    ctx.fillStyle = 'rgba(0,0,0,0.70)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';

    // Header
    ctx.fillStyle = '#f0c040';
    ctx.font = 'bold 40px "Courier New"';
    ctx.fillText(`WAVE ${this.wave} COMPLETE!`, W / 2, 110);

    ctx.fillStyle = '#ffee44';
    ctx.font = '24px "Courier New"';
    ctx.fillText(`Coins: ${this.coins}`, W / 2, 148);

    // Shop title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Courier New"';
    ctx.fillText('SHOP', W / 2, 205);

    // Helper to draw one item row
    const drawItem = (key, label, price, weapon, rowY) => {
      const owned = this.unlockedWeapons.includes(weapon);
      const canAfford = this.coins >= price;

      // Row box
      ctx.fillStyle = owned ? 'rgba(40,80,40,0.55)' : canAfford ? 'rgba(60,60,20,0.55)' : 'rgba(60,20,20,0.45)';
      ctx.fillRect(W / 2 - 260, rowY - 30, 520, 58);
      ctx.strokeStyle = owned ? '#44aa44' : canAfford ? '#f0c040' : '#aa4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 260, rowY - 30, 520, 58);

      // Key badge
      ctx.fillStyle = '#333';
      ctx.fillRect(W / 2 - 244, rowY - 14, 26, 26);
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.strokeRect(W / 2 - 244, rowY - 14, 26, 26);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px "Courier New"';
      ctx.fillText(key, W / 2 - 231, rowY + 5);

      // Item name
      ctx.font = '20px "Courier New"';
      ctx.fillStyle = owned ? '#88cc88' : canAfford ? '#f0c040' : '#cc6666';
      ctx.textAlign = 'left';
      ctx.fillText(label, W / 2 - 200, rowY + 6);
      ctx.textAlign = 'center';

      // Status tag
      if (owned) {
        ctx.fillStyle = '#44cc44';
        ctx.font = 'bold 16px "Courier New"';
        ctx.fillText('[OWNED]', W / 2 + 160, rowY + 6);
      } else {
        ctx.fillStyle = canAfford ? '#f0c040' : '#cc4444';
        ctx.font = '16px "Courier New"';
        ctx.fillText(`[${price} coins]`, W / 2 + 160, rowY + 6);
      }
    };

    drawItem('1', 'Bow & Arrow', 5, 'bow', 280);
    drawItem('2', 'Bomb',        8, 'bomb', 360);

    // Continue prompt
    const blink = Math.floor(Date.now() / 600) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#f0c040';
      ctx.font = 'bold 20px "Courier New"';
      ctx.fillText('Press ENTER to continue →', W / 2, 460);
    }

    ctx.textAlign = 'left';
  },

  drawWin() {
    ctx.fillStyle = 'rgba(0,0,0,0.70)';
    ctx.fillRect(0, 0, W, H);

    // ── Sparkles ──────────────────────────────────────────────────────────────
    const SPARKLE_COLORS = ['#f0c040', '#fff8aa', '#ffffff', '#ffe080', '#ffd700', '#c8f0ff'];
    const MAX_SPARKLES = 70;

    // Seed the pool on first frame
    if (this.winSparkles.length === 0) {
      for (let i = 0; i < MAX_SPARKLES; i++) {
        const maxLife = 80 + Math.random() * 100;
        this.winSparkles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -0.4 - Math.random() * 0.9,
          size: 2 + Math.random() * 3,
          life: Math.floor(Math.random() * maxLife), // stagger so they don't all pop at once
          maxLife,
          color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
        });
      }
    }

    // Respawn dead sparkles, update live ones
    for (const s of this.winSparkles) {
      s.life++;
      if (s.life >= s.maxLife) {
        // Respawn at a random x along the bottom half, drifting upward
        s.x = Math.random() * W;
        s.y = H + 4;
        s.vx = (Math.random() - 0.5) * 0.7;
        s.vy = -0.4 - Math.random() * 0.9;
        s.size = 2 + Math.random() * 3;
        s.maxLife = 80 + Math.random() * 100;
        s.life = 0;
        s.color = SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)];
      }
      s.x += s.vx;
      s.y += s.vy;

      const fade = 20;
      const alpha = s.life < fade
        ? s.life / fade
        : s.life > s.maxLife - fade
          ? (s.maxLife - s.life) / fade
          : 1;

      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = s.color;

      // 4-pointed star shape
      const sz = s.size;
      const inner = sz * 0.35;
      ctx.beginPath();
      for (let p = 0; p < 8; p++) {
        const angle = (p * Math.PI) / 4 - Math.PI / 2;
        const r = p % 2 === 0 ? sz : inner;
        const px = s.x + Math.cos(angle) * r;
        const py = s.y + Math.sin(angle) * r;
        p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Text ──────────────────────────────────────────────────────────────────
    ctx.textAlign = 'center';

    ctx.fillStyle = '#f0c040';
    ctx.font = 'bold 52px "Courier New"';
    ctx.fillText('YOU WIN!', W / 2, H / 2 - 150);

    ctx.fillStyle = '#fff';
    ctx.font = '20px "Courier New"';
    ctx.fillText('All 12 waves defeated!', W / 2, H / 2 - 105);
    ctx.fillText(`Final Score: ${this.score}`, W / 2, H / 2 - 75);

    // ── Trophy (moved down) ───────────────────────────────────────────────────
    const cx = W / 2;
    const ty = H / 2 + 60;

    // Cup body
    ctx.fillStyle = '#f0c040';
    ctx.beginPath();
    ctx.moveTo(cx - 38, ty - 60);
    ctx.lineTo(cx - 44, ty - 60);
    ctx.quadraticCurveTo(cx - 58, ty - 30, cx - 44, ty);
    ctx.lineTo(cx - 22, ty);
    ctx.lineTo(cx - 16, ty + 20);
    ctx.lineTo(cx + 16, ty + 20);
    ctx.lineTo(cx + 22, ty);
    ctx.lineTo(cx + 44, ty);
    ctx.quadraticCurveTo(cx + 58, ty - 30, cx + 44, ty - 60);
    ctx.lineTo(cx + 38, ty - 60);
    ctx.closePath();
    ctx.fill();

    // Cup shine
    ctx.fillStyle = '#fff8aa';
    ctx.beginPath();
    ctx.moveTo(cx - 28, ty - 55);
    ctx.lineTo(cx - 34, ty - 55);
    ctx.quadraticCurveTo(cx - 46, ty - 30, cx - 34, ty - 5);
    ctx.lineTo(cx - 28, ty - 5);
    ctx.quadraticCurveTo(cx - 38, ty - 30, cx - 28, ty - 55);
    ctx.closePath();
    ctx.fill();

    // Base stem
    ctx.fillStyle = '#d4a820';
    ctx.fillRect(cx - 12, ty + 20, 24, 14);

    // Base plate
    ctx.fillStyle = '#f0c040';
    ctx.fillRect(cx - 32, ty + 34, 64, 12);

    // Star on cup
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px serif';
    ctx.fillText('★', cx, ty - 22);

    const blink = Math.floor(Date.now() / 600) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#f0c040';
      ctx.font = 'bold 20px "Courier New"';
      ctx.fillText('Press ENTER to Play Again', W / 2, H / 2 + 175);
    }
    ctx.textAlign = 'left';
  },

  loop() {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.loop());
  },

  start() {
    this.buildTerrain();
    this.loop();
  },
};

game.start();
