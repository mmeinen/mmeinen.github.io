const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = 1200, H = 450;
const GRAVITY = 0.18;
const JUMP_FORCE = -8;
const MOVE_SPEED = 5;
const GROUND_Y = 360;
const PLAYER_W = 36, PLAYER_H = 36;
const SWORD_DURATION = 20;
const SWORD_COOLDOWN = 35;
const TRANSITION_FRAMES = 220;

// ─── LEVEL DATA ───────────────────────────────────────────────────────────────
const LEVEL1 = {
  levelWidth: 5500,
  finishX: 4950,
  skyTop: '#87CEEB', skyBot: '#D4EDFF',
  mountainColor: '#8FB56A',
  platforms: [
    { x: -200, y: GROUND_Y, w: 800,  h: 90, isGround: true },
    { x:  800, y: GROUND_Y, w: 400,  h: 90, isGround: true },
    { x: 1500, y: GROUND_Y, w: 300,  h: 90, isGround: true },
    { x: 2100, y: GROUND_Y, w: 400,  h: 90, isGround: true },
    { x: 2900, y: GROUND_Y, w: 400,  h: 90, isGround: true },
    { x: 3600, y: GROUND_Y, w: 400,  h: 90, isGround: true },
    { x: 4300, y: GROUND_Y, w: 800,  h: 90, isGround: true },
    { x:  300, y: 290, w: 160, h: 16 },
    { x:  670, y: 300, w: 130, h: 16 },
    { x:  960, y: 270, w: 160, h: 16 },
    { x: 1250, y: 290, w: 100, h: 16 },
    { x: 1380, y: 290, w: 100, h: 16 },
    { x: 1850, y: 275, w: 160, h: 16 },
    { x: 2560, y: 265, w: 110, h: 16 },
    { x: 2720, y: 265, w: 110, h: 16 },
    { x: 3360, y: 285, w: 160, h: 16 },
    { x: 4060, y: 270, w: 110, h: 16 },
    { x: 4195, y: 270, w: 100, h: 16 },
  ],
  bgMountains: [
    { x:  250, h: 190 }, { x:  600, h: 150 }, { x:  950, h: 220 },
    { x: 1300, h: 170 }, { x: 1700, h: 250 }, { x: 2100, h: 180 },
    { x: 2500, h: 210 }, { x: 2900, h: 195 }, { x: 3300, h: 240 },
    { x: 3750, h: 160 }, { x: 4150, h: 210 }, { x: 4600, h: 185 },
  ],
  clouds: [
    { x:  150, y: 55,  s: 1.0 }, { x:  480, y: 38,  s: 0.85 },
    { x:  860, y: 72,  s: 1.2  }, { x: 1220, y: 48,  s: 0.9  },
    { x: 1640, y: 68,  s: 1.1  }, { x: 2100, y: 44,  s: 0.8  },
    { x: 2620, y: 62,  s: 1.0  }, { x: 3100, y: 52,  s: 1.3  },
    { x: 3650, y: 40,  s: 0.9  }, { x: 4250, y: 68,  s: 1.1  },
  ],
};

const LEVEL2 = {
  levelWidth: 5000,
  finishX: 4100,
  skyTop: '#2C3E6A', skyBot: '#4A6080',
  mountainColor: '#2A4A2E',
  enemyPatrolLeft:  1800,
  enemyPatrolRight: 3000,
  enemyStartX: 1800,
  nuggetNpcX: 3600,
  platforms: [
    { x: -200, y: GROUND_Y, w: 800,  h: 90, isGround: true },
    { x:  800, y: GROUND_Y, w: 4200, h: 90, isGround: true },
    { x:  640, y: 295, w: 120, h: 16 },
    { x: 1100, y: 280, w: 140, h: 16 },
    { x: 1450, y: 265, w: 120, h: 16 },
    { x: 2200, y: 270, w: 130, h: 16 },
    { x: 2500, y: 255, w: 110, h: 16 },
    { x: 3100, y: 275, w: 140, h: 16 },
    { x: 3400, y: 260, w: 120, h: 16 },
    { x: 3800, y: 270, w: 130, h: 16 },
  ],
  bgMountains: [
    { x:  300, h: 180 }, { x:  700, h: 200 }, { x: 1100, h: 170 },
    { x: 1500, h: 230 }, { x: 1950, h: 190 }, { x: 2400, h: 215 },
    { x: 2800, h: 185 }, { x: 3250, h: 220 }, { x: 3700, h: 195 },
    { x: 4200, h: 210 }, { x: 4650, h: 175 },
  ],
  clouds: [
    { x:  200, y: 60,  s: 0.9  }, { x:  550, y: 42,  s: 0.75 },
    { x:  950, y: 75,  s: 1.1  }, { x: 1500, y: 50,  s: 0.85 },
    { x: 2200, y: 65,  s: 1.0  }, { x: 3000, y: 45,  s: 0.95 },
    { x: 3800, y: 70,  s: 1.05 },
  ],
};

const LEVEL3 = {
  levelWidth: 6000,
  finishX: 5500,
  skyTop: '#08081E',
  skyBot: '#101428',
  mountainColor: '#0C1E0E',
  starFriendX: 2300,
  platforms: [
    { x: -200, y: GROUND_Y, w: 900,  h: 90, isGround: true },
    { x:  900, y: GROUND_Y, w: 500,  h: 90, isGround: true },
    { x: 1700, y: GROUND_Y, w: 700,  h: 90, isGround: true },
    { x: 2700, y: GROUND_Y, w: 700,  h: 90, isGround: true },
    { x: 3700, y: GROUND_Y, w: 600,  h: 90, isGround: true },
    { x: 4600, y: GROUND_Y, w: 1000, h: 90, isGround: true },
    { x:  500, y: 290, w: 140, h: 16 },
    { x: 1100, y: 275, w: 130, h: 16 },
    { x: 1500, y: 265, w: 120, h: 16 },
    { x: 2050, y: 285, w: 140, h: 16 },
    { x: 3050, y: 270, w: 120, h: 16 },
    { x: 3350, y: 255, w: 110, h: 16 },
    { x: 4100, y: 275, w: 130, h: 16 },
    { x: 4850, y: 265, w: 120, h: 16 },
    { x: 5150, y: 280, w: 110, h: 16 },
  ],
  bgMountains: [
    { x:  350, h: 210 }, { x:  750, h: 175 }, { x: 1200, h: 235 },
    { x: 1700, h: 195 }, { x: 2200, h: 215 }, { x: 2800, h: 185 },
    { x: 3400, h: 225 }, { x: 4000, h: 195 }, { x: 4600, h: 210 },
    { x: 5200, h: 180 },
  ],
  clouds: [
    { x:  250, y: 55,  s: 0.85 }, { x:  650, y: 38,  s: 0.70 },
    { x: 1200, y: 68,  s: 1.0  }, { x: 1900, y: 46,  s: 0.80 },
    { x: 2700, y: 60,  s: 0.95 }, { x: 3500, y: 42,  s: 0.85 },
    { x: 4400, y: 62,  s: 1.0  }, { x: 5200, y: 50,  s: 0.75 },
  ],
};

const LEVELS = [LEVEL1, LEVEL2, LEVEL3];

// ─── PLAYER DEFINITIONS ───────────────────────────────────────────────────────
const NUGGET_DEF = {
  name: 'Nugget', label: 'P1: Nugget  [W/A/D]',
  startX: 80, startY: GROUND_Y - PLAYER_H,
  color: '#D4900A', bodyColor: '#E8A820',
  left: 'a', right: 'd', jump: 'w',
  hasSword: false,
};
const AXOLOTL_DEF = {
  name: 'Axolotl', label: 'P2: Axolotl [←↑→↓]',
  startX: 140, startY: GROUND_Y - PLAYER_H,
  color: '#FF85A2', bodyColor: '#FFB3C6',
  left: 'arrowleft', right: 'arrowright', jump: 'arrowup',
  hasSword: true,
};

// ─── STATE VARIABLES ──────────────────────────────────────────────────────────
let players = [];
let gameState = 'menu';
let currentLevel = 0;
let playerMode = '2p';
let swordUnlocked = false;
let enemy = null;
let nuggetNPC = null;
let transitionTimer = 0;
let frameCount = 0;
let menuSelection = 0;
let cameraX = 0;
let levelData = null;
let cheatPressCount = 0;
let l3Phase = 'explore';   // 'explore'|'met_star'|'strongman_enters'|'strongman_steals'|'bow_appears'|'strongman_flees'|'done'
let l3Timer = 0;
let starFriend = null;
let strongman = null;
let bowPickup = null;
let nuggetHasBow = false;

// ─── INPUT ────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!keys[k]) justPressed[k] = true;
  keys[k] = true;
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ─── DRAW HELPERS ─────────────────────────────────────────────────────────────
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawXEyes(sx, sy, lx, ly, rx, ry) {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  const d = 4;
  ctx.beginPath(); ctx.moveTo(sx+lx-d, sy+ly-d); ctx.lineTo(sx+lx+d, sy+ly+d); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx+lx+d, sy+ly-d); ctx.lineTo(sx+lx-d, sy+ly+d); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx+rx-d, sy+ry-d); ctx.lineTo(sx+rx+d, sy+ry+d); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx+rx+d, sy+ry-d); ctx.lineTo(sx+rx-d, sy+ry+d); ctx.stroke();
}

// ─── COLLISION ────────────────────────────────────────────────────────────────
function overlaps(p, pl) {
  return p.x < pl.x + pl.w && p.x + p.w > pl.x &&
         p.y < pl.y + pl.h && p.y + p.h > pl.y;
}

function resolveX(p, platforms) {
  for (const pl of platforms) {
    if (overlaps(p, pl)) {
      if (p.vx >= 0) p.x = pl.x - p.w;
      else            p.x = pl.x + pl.w;
      p.vx = 0;
    }
  }
}

function resolveY(p, platforms) {
  p.onGround = false;
  for (const pl of platforms) {
    if (overlaps(p, pl)) {
      if (p.vy >= 0) {
        p.y = pl.y - p.h;
        p.vy = 0;
        p.onGround = true;
      } else {
        p.y = pl.y + pl.h;
        p.vy = 0;
      }
    }
  }
}

// ─── INIT FUNCTIONS ───────────────────────────────────────────────────────────
function makePlayer(def, labelOverride) {
  return {
    ...def,
    label: labelOverride || def.label,
    x: def.startX, y: def.startY,
    vx: 0, vy: 0,
    w: PLAYER_W, h: PLAYER_H,
    onGround: false,
    finished: false,
    dead: false,
    deathTimer: 0,
    facingRight: true,
    swordTimer: 0,
    swordCooldown: 0,
  };
}

function initPlayers(mode) {
  if (mode === '1p') {
    players = [makePlayer(AXOLOTL_DEF, 'P1: Axolotl [←↑→↓]')];
  } else {
    players = [makePlayer(NUGGET_DEF), makePlayer(AXOLOTL_DEF)];
  }
}

function initEnemy() {
  enemy = {
    x: levelData.enemyStartX,
    y: GROUND_Y - 40,
    vx: 0, vy: 0,
    w: 32, h: 40,
    onGround: false,
    alive: true,
    flyingOff: false,
    flyAngle: 0,
    state: 'patrol',
    patrolDir: 1,
    speed: 2.0,
    chaseSpeed: 3.2,
  };
}

function initNuggetNPC() {
  nuggetNPC = {
    x: levelData.nuggetNpcX,
    y: GROUND_Y - PLAYER_H,
    w: PLAYER_W, h: PLAYER_H,
  };
}

function initLevel3() {
  l3Phase = 'explore';
  l3Timer = 0;
  nuggetHasBow = false;
  bowPickup = null;
  starFriend = {
    x: levelData.starFriendX,
    y: GROUND_Y - 36,
    w: 36, h: 36,
    visible: true,
  };
  strongman = {
    x: levelData.levelWidth + 100,
    y: GROUND_Y - 64,
    w: 52, h: 64,
    vx: 0,
    hasStar: false,
    visible: false,
  };
}

function startLevel(n) {
  currentLevel = n;
  levelData = LEVELS[n];
  cameraX = 0;
  cheatPressCount = 0;
  enemy = null;
  nuggetNPC = null;
  initPlayers(playerMode);
  if (n === 1) {
    initEnemy();
    if (playerMode === '1p') initNuggetNPC();
  }
  if (n === 2) initLevel3();
  gameState = 'playing';
}

function startGame(mode) {
  playerMode = mode;
  swordUnlocked = false;
  startLevel(0);
}

// ─── MENU ─────────────────────────────────────────────────────────────────────
function updateMenu() {
  if (justPressed['arrowup'] || justPressed['arrowdown']) {
    menuSelection = menuSelection === 0 ? 1 : 0;
  }
  if (justPressed['1']) { startGame('1p'); return; }
  if (justPressed['2']) { startGame('2p'); return; }
  if (justPressed['enter'] || justPressed[' ']) {
    startGame(menuSelection === 0 ? '1p' : '2p');
  }
}

function drawMenu() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a1a2e');
  sky.addColorStop(1, '#16213e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const starSeeds = [
    [80,40],[200,70],[350,25],[500,55],[650,35],[750,80],
    [120,120],[300,100],[450,90],[600,110],[730,60],
    [50,150],[170,180],[400,140],[700,130],[550,160],[720,190],
  ];
  for (const [sx, sy] of starSeeds) {
    const twinkle = 0.5 + Math.sin(frameCount * 0.05 + sx) * 0.5;
    ctx.globalAlpha = twinkle;
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Title
  ctx.textAlign = 'center';
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('JUMPING AXOLOTL NUGGETS', W/2, 100);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFB3C6';
  ctx.font = '16px sans-serif';
  ctx.fillText('A 2-Level Adventure!', W/2, 130);

  // Buttons
  const btnW = 260, btnH = 52, btnGap = 18;
  const totalH = btnH * 2 + btnGap;
  const startY = H/2 - totalH/2 + 20;
  const btnLabels = ['1 PLAYER  (Axolotl only)', '2 PLAYERS  (Nugget + Axolotl)'];

  for (let i = 0; i < 2; i++) {
    const bx = W/2 - btnW/2;
    const by = startY + i * (btnH + btnGap);
    const selected = menuSelection === i;

    ctx.fillStyle = selected ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.06)';
    roundRect(bx, by, btnW, btnH, 8);
    ctx.fill();

    ctx.strokeStyle = selected ? '#FFD700' : '#555';
    ctx.lineWidth = selected ? 3 : 1.5;
    roundRect(bx, by, btnW, btnH, 8);
    ctx.stroke();

    if (selected) {
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = selected ? '#FFD700' : '#aaa';
    ctx.font = selected ? 'bold 18px sans-serif' : '17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(btnLabels[i], W/2, by + btnH/2 + 7);
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = '#555';
  ctx.font = '12px sans-serif';
  ctx.fillText('↑ ↓ to select  ·  1 or 2  ·  Enter / Space to start', W/2, H - 22);
}

// ─── TRANSITION SCREEN ────────────────────────────────────────────────────────
function updateTransition() {
  transitionTimer--;
  if (transitionTimer <= 0) {
    swordUnlocked = true;
    startLevel(1);
  }
}

function drawTransition() {
  ctx.fillStyle = '#080818';
  ctx.fillRect(0, 0, W, H);

  // Drifting stars
  for (let i = 0; i < 35; i++) {
    const bx = ((i * 79 + frameCount * 0.2) % W);
    const by = ((i * 53) % (H - 60));
    const br = Math.max(0.3, 0.8 + Math.sin(frameCount * 0.08 + i) * 0.5);
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(frameCount*0.06+i)*0.3})`;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.textAlign = 'center';

  // Banner
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('LEVEL 1 COMPLETE!', W/2, 120);
  ctx.shadowBlur = 0;

  // Sword unlock text
  ctx.shadowColor = '#4499FF';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#88CCFF';
  ctx.font = 'bold 21px sans-serif';
  ctx.fillText('\u26A1 Blue Flame Sword Unlocked!', W/2, 165);
  ctx.shadowBlur = 0;

  // Animated sword
  const progress = Math.min(1, (TRANSITION_FRAMES - transitionTimer) / 55);
  const swordLeft = W/2 - 120;
  const swordRight = swordLeft + 240 * progress;
  const swordY = 225;

  // Glow trail
  ctx.save();
  ctx.shadowColor = '#4488FF';
  ctx.shadowBlur = 22;
  ctx.strokeStyle = '#4488FF';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(swordLeft, swordY);
  ctx.lineTo(swordRight, swordY);
  ctx.stroke();

  // Bright edge
  ctx.strokeStyle = '#CCE8FF';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(swordLeft, swordY);
  ctx.lineTo(swordRight, swordY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Flame particles along blade
  if (progress > 0.05) {
    const bladeLen = swordRight - swordLeft;
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const px = swordLeft + bladeLen * t;
      const py = swordY + Math.sin(frameCount * 0.35 + i * 1.3) * 7;
      const alpha = 0.4 + Math.sin(frameCount * 0.22 + i) * 0.3;
      ctx.fillStyle = `rgba(110,190,255,${Math.max(0, alpha)})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.5 + Math.sin(frameCount * 0.18 + i) * 1.2, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Hilt
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(swordLeft - 5, swordY - 10, 8, 20);
  ctx.fillStyle = '#AA8800';
  ctx.fillRect(swordLeft - 9, swordY - 3, 16, 6);

  ctx.fillStyle = '#aaa';
  ctx.font = '14px sans-serif';
  ctx.shadowBlur = 0;
  ctx.fillText('Press \u2193 to swing the sword in Level 2!', W/2, 280);

  // Progress bar
  const barW = 300;
  const barFrac = transitionTimer / TRANSITION_FRAMES;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(W/2 - barW/2, H - 48, barW, 8);
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(W/2 - barW/2, H - 48, barW * barFrac, 8);
  ctx.fillStyle = '#555';
  ctx.font = '12px sans-serif';
  ctx.fillText('Loading Level 2...', W/2, H - 22);
}

// ─── ENEMY ────────────────────────────────────────────────────────────────────
function updateEnemy() {
  if (!enemy || !enemy.alive) return;
  const plats = levelData.platforms;

  if (enemy.flyingOff) {
    enemy.x += enemy.vx;
    enemy.y += enemy.vy;
    enemy.vy += GRAVITY;
    enemy.flyAngle += 0.2;
    if (enemy.y > H + 120 || enemy.x < -300 || enemy.x > levelData.levelWidth + 300) {
      enemy.alive = false;
    }
    return;
  }

  // Determine target
  let target = null;
  if (playerMode === '2p' && players.length > 0) {
    target = players[0]; // Nugget
  } else if (nuggetNPC) {
    target = nuggetNPC;
  }

  const dist = target ? Math.abs((enemy.x + enemy.w/2) - (target.x + target.w/2)) : Infinity;

  if (dist < 500) enemy.state = 'chase';
  else if (dist > 620) enemy.state = 'patrol';

  if (enemy.state === 'patrol') {
    enemy.vx = enemy.patrolDir * enemy.speed;
    if (enemy.x <= levelData.enemyPatrolLeft)  enemy.patrolDir =  1;
    if (enemy.x >= levelData.enemyPatrolRight) enemy.patrolDir = -1;
  } else {
    if (target) {
      enemy.vx = ((target.x + target.w/2) > (enemy.x + enemy.w/2) ? 1 : -1) * enemy.chaseSpeed;
    }
  }

  enemy.vy += GRAVITY;
  enemy.x += enemy.vx;
  enemy.x = Math.max(0, Math.min(levelData.levelWidth - enemy.w, enemy.x));
  resolveX(enemy, plats);
  enemy.y += enemy.vy;
  resolveY(enemy, plats);

  if (enemy.y > H + 80) {
    enemy.alive = false;
    return;
  }

  // Catch nugget
  if (target && !target.dead && !target.finished) {
    const hit = enemy.x < target.x + target.w && enemy.x + enemy.w > target.x &&
                enemy.y < target.y + target.h && enemy.y + enemy.h > target.y;
    if (hit) gameState = 'gameover';
  }
}

// ─── SWORD ────────────────────────────────────────────────────────────────────
function updateSword(p) {
  if (!p.hasSword || !swordUnlocked) return;
  if (p.swordCooldown > 0) p.swordCooldown--;
  if (p.swordTimer > 0) p.swordTimer--;

  if (justPressed['arrowdown'] && p.swordCooldown === 0 && p.swordTimer === 0) {
    p.swordTimer = SWORD_DURATION;
    p.swordCooldown = SWORD_COOLDOWN;
  }

  if (p.swordTimer > 0 && enemy && enemy.alive && !enemy.flyingOff) {
    const hitX = p.facingRight ? p.x + p.w : p.x - 58;
    const hitBox = { x: hitX, y: p.y + 8, w: 58, h: 20 };
    const hit = hitBox.x < enemy.x + enemy.w && hitBox.x + hitBox.w > enemy.x &&
                hitBox.y < enemy.y + enemy.h && hitBox.y + hitBox.h > enemy.y;
    if (hit) {
      enemy.flyingOff = true;
      enemy.vx = p.facingRight ? 9 : -9;
      enemy.vy = -11;
    }
  }
}

// ─── UPDATE PLAYER ────────────────────────────────────────────────────────────
function updatePlayer(p) {
  const plats = levelData.platforms;

  if (p.finished) return;

  if (p.dead) {
    p.deathTimer--;
    if (p.deathTimer <= 0) {
      p.x = p.startX; p.y = p.startY;
      p.vx = 0; p.vy = 0;
      p.dead = false; p.onGround = false;
    }
    return;
  }

  const goLeft  = keys[p.left];
  const goRight = keys[p.right];
  const doJump  = keys[p.jump];

  if (goLeft)       { p.vx = -MOVE_SPEED; p.facingRight = false; }
  else if (goRight) { p.vx =  MOVE_SPEED; p.facingRight = true;  }
  else              { p.vx *= 0.65; }

  if (doJump && p.onGround) {
    p.vy = JUMP_FORCE;
    p.onGround = false;
  }

  updateSword(p);

  p.vy += GRAVITY;
  p.x += p.vx;
  p.x = Math.max(0, Math.min(levelData.levelWidth - p.w, p.x));
  resolveX(p, plats);
  p.y += p.vy;
  resolveY(p, plats);

  if (p.y > H + 80) {
    p.dead = true;
    p.deathTimer = 70;
  }

  if (p.x + p.w >= levelData.finishX && (currentLevel !== 2 || l3Phase === 'done')) p.finished = true;
}

// ─── LEVEL 3 SCRIPT ───────────────────────────────────────────────────────────
function updateLevel3Script() {
  if (l3Phase === 'explore') {
    const leadX = players.reduce((m, p) => Math.max(m, p.x + p.w), 0);
    if (leadX >= levelData.starFriendX - 240) {
      l3Phase = 'met_star';
      l3Timer = 160;
    }
  } else if (l3Phase === 'met_star') {
    l3Timer--;
    if (l3Timer <= 0) {
      l3Phase = 'strongman_enters';
      strongman.visible = true;
      strongman.x = cameraX + W + 60;
      strongman.vx = -5;
    }
  } else if (l3Phase === 'strongman_enters') {
    strongman.x += strongman.vx;
    strongman.y = GROUND_Y - strongman.h;
    if (strongman.x <= levelData.starFriendX - 20) {
      strongman.x = levelData.starFriendX - 20;
      strongman.vx = 0;
      l3Phase = 'strongman_steals';
      l3Timer = 90;
      starFriend.visible = false;
      strongman.hasStar = true;
    }
  } else if (l3Phase === 'strongman_steals') {
    l3Timer--;
    if (l3Timer <= 0) {
      if (playerMode === '2p') {
        l3Phase = 'bow_appears';
        l3Timer = 900;
        bowPickup = { x: players[0].x + 60, y: GROUND_Y - 30, w: 30, h: 30 };
      } else {
        l3Phase = 'strongman_flees';
        strongman.vx = 9;
      }
    }
  } else if (l3Phase === 'bow_appears') {
    l3Timer--;
    const nugget = players[0];
    if (bowPickup && !nugget.dead) {
      const hit = nugget.x < bowPickup.x + bowPickup.w && nugget.x + nugget.w > bowPickup.x &&
                  nugget.y < bowPickup.y + bowPickup.h && nugget.y + nugget.h > bowPickup.y;
      if (hit) {
        nuggetHasBow = true;
        bowPickup = null;
        l3Phase = 'strongman_flees';
        strongman.vx = 9;
      }
    }
    if (l3Timer <= 0) {
      l3Phase = 'strongman_flees';
      strongman.vx = 9;
    }
  } else if (l3Phase === 'strongman_flees') {
    strongman.x += strongman.vx;
    strongman.y = GROUND_Y - strongman.h;
    if (strongman.x > levelData.levelWidth + 300) l3Phase = 'done';
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────
function update() {
  if (gameState === 'menu') { updateMenu(); return; }
  if (gameState === 'transition') { updateTransition(); return; }

  if (gameState === 'gameover' || gameState === 'victory') {
    if (justPressed['r']) {
      if (gameState === 'gameover') startLevel(1);
      else gameState = 'menu';
    }
    if (justPressed['m']) gameState = 'menu';
    return;
  }

  if (gameState !== 'playing') return;

  if (justPressed['9']) {
    cheatPressCount++;
    if (cheatPressCount >= 3) {
      if (currentLevel === 2) l3Phase = 'done';
      for (const p of players) p.finished = true;
      cheatPressCount = 0;
    }
  }

  for (const p of players) updatePlayer(p);
  updateEnemy();
  if (currentLevel === 2) updateLevel3Script();

  // Camera follows average of living players
  const alive = players.filter(p => !p.dead);
  if (alive.length > 0) {
    const avgX = alive.reduce((s, p) => s + p.x + p.w/2, 0) / alive.length;
    cameraX += (avgX - W/2 - cameraX) * 0.1;
    cameraX = Math.max(0, Math.min(levelData.levelWidth - W, cameraX));
  }

  if (players.every(p => p.finished)) {
    if (currentLevel === 0) {
      gameState = 'transition';
      transitionTimer = TRANSITION_FRAMES;
    } else if (currentLevel === 1) {
      startLevel(2);
    } else {
      gameState = 'victory';
    }
  }
}

// ─── DRAW CHARACTERS ──────────────────────────────────────────────────────────
function drawNugget(p) {
  const sx = Math.round(p.x - cameraX);
  const sy = Math.round(p.y);
  ctx.save();
  ctx.fillStyle = p.dead ? '#888' : p.color;
  roundRect(sx, sy, p.w, p.h, 8);
  ctx.fill();
  if (!p.dead) {
    ctx.fillStyle = '#A0660A';
    for (const [ox, oy, r] of [[8,8,4],[22,5,3],[29,16,4],[11,23,3],[25,24,3]]) {
      ctx.beginPath(); ctx.arc(sx+ox, sy+oy, r, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(sx+10, sy+14, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx+25, sy+14, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(sx+11, sy+14, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx+26, sy+14, 3, 0, Math.PI*2); ctx.fill();
  } else {
    drawXEyes(sx, sy, 10, 14, 25, 14);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NUGGET', sx + p.w/2, sy - 5);
  ctx.restore();
}

function drawAxolotl(p) {
  const sx = Math.round(p.x - cameraX);
  const sy = Math.round(p.y);
  ctx.save();
  ctx.fillStyle = p.dead ? '#aaa' : '#FF6B8A';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(sx + 7 + i * 11, sy - 5, 4, 8, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.fillStyle = p.dead ? '#aaa' : p.color;
  roundRect(sx, sy, p.w, p.h, 10);
  ctx.fill();
  ctx.fillStyle = p.dead ? '#c0c0c0' : p.bodyColor;
  roundRect(sx + 6, sy + 11, p.w - 12, p.h - 15, 7);
  ctx.fill();
  if (!p.dead) {
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(sx+10, sy+13, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx+26, sy+13, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(sx+11, sy+13, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx+27, sy+13, 3, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#C0407A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx+18, sy+22, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else {
    drawXEyes(sx, sy, 10, 13, 26, 13);
  }
  ctx.fillStyle = p.dead ? '#aaa' : p.color;
  ctx.beginPath();
  ctx.ellipse(sx + p.w + 6, sy + p.h - 10, 9, 5, Math.PI/5, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AXOLOTL', sx + p.w/2, sy - 5);
  ctx.restore();
}

// ─── DRAW ENEMY ───────────────────────────────────────────────────────────────
function drawEnemy() {
  if (!enemy || !enemy.alive) return;
  const sx = Math.round(enemy.x - cameraX);
  const sy = Math.round(enemy.y);
  if (sx + enemy.w < -60 || sx > W + 60) return;

  ctx.save();
  ctx.translate(sx + enemy.w/2, sy + enemy.h/2);
  if (enemy.flyingOff) ctx.rotate(enemy.flyAngle);

  const ew = enemy.w, eh = enemy.h;
  const ox = -ew/2, oy = -eh/2;

  // Cloak body
  ctx.fillStyle = '#2A1A3E';
  roundRect(ox, oy, ew, eh, 6);
  ctx.fill();

  // Hood
  ctx.fillStyle = '#1A0A2E';
  ctx.beginPath();
  ctx.ellipse(0, oy + 8, ew/2 + 5, 13, 0, 0, Math.PI*2);
  ctx.fill();

  // Glowing red eyes
  ctx.shadowColor = '#FF0000';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#FF2200';
  ctx.beginPath(); ctx.arc(ox + 8,  oy + 14, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(ox + 24, oy + 14, 3, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  // Label (only when not flying)
  if (!enemy.flyingOff) {
    ctx.fillStyle = 'rgba(255,60,60,0.95)';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SNATCHER', 0, oy - 5);
  }

  ctx.restore();
}

// ─── DRAW NUGGET NPC ──────────────────────────────────────────────────────────
function drawNuggetNPC() {
  if (!nuggetNPC) return;
  const sx = Math.round(nuggetNPC.x - cameraX);
  const sy = Math.round(nuggetNPC.y + Math.sin(frameCount * 0.3) * 3);
  if (sx + PLAYER_W < -20 || sx > W + 20) return;

  ctx.save();

  // Body
  ctx.fillStyle = '#D4900A';
  roundRect(sx, sy, PLAYER_W, PLAYER_H, 8);
  ctx.fill();

  // Spots
  ctx.fillStyle = '#A0660A';
  for (const [ox, oy, r] of [[8,8,4],[22,5,3],[29,16,4],[11,23,3],[25,24,3]]) {
    ctx.beginPath(); ctx.arc(sx+ox, sy+oy, r, 0, Math.PI*2); ctx.fill();
  }

  // Scared wide eyes
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(sx+10, sy+14, 6, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(sx+25, sy+14, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(sx+11, sy+14, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(sx+26, sy+14, 3, 0, Math.PI*2); ctx.fill();

  // Speech bubble
  const bx = sx - 8, bby = sy - 33;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  roundRect(bx, bby, 52, 22, 5);
  ctx.fill();
  // Tail
  ctx.beginPath();
  ctx.moveTo(sx + 8,  sy - 11);
  ctx.lineTo(sx + 13, sy - 1);
  ctx.lineTo(sx + 20, sy - 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#CC0000';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Help!', bx + 26, bby + 15);

  // Name
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('NUGGET', sx + PLAYER_W/2, sy - 38);

  ctx.restore();
}

// ─── DRAW SWORD ───────────────────────────────────────────────────────────────
function drawSword(p) {
  if (!p.hasSword || !swordUnlocked || p.swordTimer <= 0) return;
  const sx = Math.round(p.x - cameraX);
  const sy = Math.round(p.y);
  const hx = p.facingRight ? sx + p.w : sx - 58;
  const hy = sy + 8;

  ctx.save();
  ctx.shadowColor = '#4488FF';
  ctx.shadowBlur = 18;

  // Blade glow
  ctx.strokeStyle = '#2255CC';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(hx, hy + 10);
  ctx.lineTo(hx + 58, hy + 10);
  ctx.stroke();

  // Bright blade
  const grad = ctx.createLinearGradient(hx, 0, hx + 58, 0);
  grad.addColorStop(0, '#CCECFF');
  grad.addColorStop(0.5, '#4499FF');
  grad.addColorStop(1, '#CCECFF');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx, hy + 10);
  ctx.lineTo(hx + 58, hy + 10);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Flame particles
  for (let i = 0; i < 9; i++) {
    const t = i / 9;
    const px = hx + 58 * t;
    const py = hy + 10 + Math.sin(frameCount * 0.4 + i * 1.6) * 6;
    const alpha = Math.max(0, 0.4 + Math.sin(frameCount * 0.3 + i) * 0.35);
    ctx.fillStyle = `rgba(110,190,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, 2.5 + Math.abs(Math.sin(frameCount * 0.2 + i)) * 1.2, 0, Math.PI*2);
    ctx.fill();
  }

  // Hilt
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(hx - 2, hy + 4, 6, 12);

  ctx.restore();
}

// ─── DRAW LEVEL 3 ─────────────────────────────────────────────────────────────
function drawStarShape(cx, cy, outerR, innerR) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    else         ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}

function drawStarFriend() {
  if (!starFriend || !starFriend.visible) return;
  const sx = Math.round(starFriend.x - cameraX);
  const sy = Math.round(starFriend.y + Math.sin(frameCount * 0.08) * 4);
  if (sx + 60 < 0 || sx - 60 > W) return;
  const cx = sx + 18, cy = sy + 18;
  ctx.save();
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#FFE900';
  drawStarShape(cx, cy, 20, 9);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFFAAA';
  drawStarShape(cx, cy, 11, 5);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(cx - 5, cy, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, cy, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy + 4, 3, 0.1, Math.PI - 0.1); ctx.stroke();
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STAR', cx, sy - 8);
  ctx.restore();
}

function drawStrongman() {
  if (!strongman || !strongman.visible) return;
  const sx = Math.round(strongman.x - cameraX);
  const sy = Math.round(strongman.y);
  if (sx + strongman.w + 80 < 0 || sx - 80 > W) return;
  const ew = strongman.w, eh = strongman.h;
  const fleeing = l3Phase === 'strongman_flees';
  ctx.save();
  // Legs
  ctx.fillStyle = '#6B1A00';
  ctx.fillRect(sx + 8,       sy + eh - 20, 15, 20);
  ctx.fillRect(sx + ew - 23, sy + eh - 20, 15, 20);
  // Body
  ctx.fillStyle = '#8B2500';
  roundRect(sx + 2, sy + 22, ew - 4, eh - 28, 6);
  ctx.fill();
  // Arms (big & muscular)
  ctx.fillStyle = '#7B2000';
  ctx.beginPath(); ctx.ellipse(sx - 14, sy + 36, 12, 23, -0.22, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx + ew + 14, sy + 36, 12, 23, 0.22, 0, Math.PI*2); ctx.fill();
  // Head
  ctx.fillStyle = '#A03010';
  ctx.beginPath(); ctx.ellipse(sx + ew/2, sy + 13, 24, 19, 0, 0, Math.PI*2); ctx.fill();
  // Angry brow
  ctx.strokeStyle = '#400'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(sx + ew/2 - 17, sy + 4); ctx.lineTo(sx + ew/2 - 5, sy + 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx + ew/2 + 17, sy + 4); ctx.lineTo(sx + ew/2 + 5, sy + 10); ctx.stroke();
  // Eyes
  if (fleeing) {
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(sx + ew/2 - 9, sy + 13, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + ew/2 + 9, sy + 13, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(sx + ew/2 - 9, sy + 13, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + ew/2 + 9, sy + 13, 2.5, 0, Math.PI*2); ctx.fill();
  } else {
    ctx.shadowColor = '#FF0000'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#FF2200';
    ctx.beginPath(); ctx.arc(sx + ew/2 - 9, sy + 13, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + ew/2 + 9, sy + 13, 4, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  // Stolen Star (held in right arm)
  if (strongman.hasStar) {
    const hx = sx + ew + 24, hy = sy + 16;
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#FFE900';
    drawStarShape(hx, hy, 13, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = fleeing ? 'rgba(255,180,0,0.9)' : 'rgba(255,55,0,0.95)';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STRONGMAN', sx + ew/2, sy - 6);
  ctx.restore();
}

function drawBowPickup() {
  if (!bowPickup) return;
  const sx = Math.round(bowPickup.x - cameraX);
  const sy = Math.round(bowPickup.y + Math.sin(frameCount * 0.14) * 5);
  if (sx + 40 < 0 || sx - 40 > W) return;
  const cx = sx + 15, cy = sy + 15;
  ctx.save();
  ctx.shadowColor = '#FF8800';
  ctx.shadowBlur = 18;
  // Bow arc
  ctx.strokeStyle = '#FF8800'; ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 11, -Math.PI * 0.75, Math.PI * 0.75);
  ctx.stroke();
  // Bowstring
  const bx1 = cx + 11 * Math.cos(-Math.PI * 0.75), by1 = cy + 11 * Math.sin(-Math.PI * 0.75);
  const bx2 = cx + 11 * Math.cos( Math.PI * 0.75), by2 = cy + 11 * Math.sin( Math.PI * 0.75);
  ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke();
  // Arrow shaft
  ctx.strokeStyle = '#CC8800'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.stroke();
  // Arrowhead
  ctx.fillStyle = '#FFB300';
  ctx.beginPath(); ctx.moveTo(cx + 16, cy); ctx.lineTo(cx + 10, cy - 4); ctx.lineTo(cx + 10, cy + 4); ctx.closePath(); ctx.fill();
  // Flame particles
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const px = cx - 10 + t * 22;
    const py = cy + Math.sin(frameCount * 0.35 + i * 1.4) * 4;
    const a = Math.max(0, 0.45 + Math.sin(frameCount * 0.25 + i) * 0.35);
    ctx.fillStyle = `rgba(255,${100 + i * 26},0,${a})`;
    ctx.beginPath(); ctx.arc(px, py, 2.8, 0, Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FLAMING BOW!', cx, sy - 5);
  ctx.restore();
}

function drawL3Overlay() {
  let msg = null, sub = null;
  if (l3Phase === 'met_star') {
    msg = 'You found STAR!';
    sub = 'Something is coming from the right...';
  } else if (l3Phase === 'strongman_enters') {
    msg = 'THE STRONGMAN APPROACHES!';
  } else if (l3Phase === 'strongman_steals') {
    msg = 'STRONGMAN stole STAR!';
  } else if (l3Phase === 'bow_appears') {
    msg = 'Nugget! Pick up the Flaming Bow!';
  } else if (l3Phase === 'strongman_flees') {
    msg = nuggetHasBow ? 'The Strongman fears the Flaming Bow!' : 'The Strongman is running away!';
    sub = 'Reach the finish line!';
  }
  if (!msg) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  roundRect(W/2 - 230, H - 95, 460, 58, 8);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(msg, W/2, H - 65);
  if (sub) {
    ctx.fillStyle = '#ccc';
    ctx.font = '12px sans-serif';
    ctx.fillText(sub, W/2, H - 47);
  }
  ctx.restore();
}

// ─── DRAW WORLD ───────────────────────────────────────────────────────────────
function drawBackground() {
  const ld = levelData;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, ld.skyTop);
  sky.addColorStop(1, ld.skyBot);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Dusk sun for level 2
  if (currentLevel === 1) {
    const sunX = 140 - cameraX * 0.04;
    ctx.save();
    ctx.shadowColor = '#FF8844';
    ctx.shadowBlur = 50;
    ctx.fillStyle = '#FF9955';
    ctx.beginPath();
    ctx.arc(sunX, 85, 26, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Full moon + twinkling stars for level 3
  if (currentLevel === 2) {
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const bx = (i * 137 + 50) % W;
      const by = (i * 89 + 20) % 165;
      const tw = 0.3 + Math.sin(frameCount * 0.05 + i * 0.9) * 0.3;
      ctx.fillStyle = `rgba(200,210,255,${tw})`;
      ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, Math.PI*2); ctx.fill();
    }
    const moonX = W - 150 - cameraX * 0.02;
    ctx.shadowColor = '#FFFDE0';
    ctx.shadowBlur = 38;
    ctx.fillStyle = '#FFFDE0';
    ctx.beginPath(); ctx.arc(moonX, 62, 28, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Mountains
  ctx.fillStyle = ld.mountainColor;
  for (const m of ld.bgMountains) {
    const mx = m.x - cameraX * 0.35;
    ctx.beginPath();
    ctx.moveTo(mx - 130, GROUND_Y);
    ctx.lineTo(mx, GROUND_Y - m.h);
    ctx.lineTo(mx + 130, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  // Clouds
  const cloudAlpha = currentLevel === 1 ? 0.38 : currentLevel === 2 ? 0.20 : 0.88;
  ctx.fillStyle = `rgba(255,255,255,${cloudAlpha})`;
  for (const c of ld.clouds) {
    const cx = c.x - cameraX * 0.18;
    const s = c.s;
    ctx.beginPath();
    ctx.arc(cx,        c.y,       30*s, 0, Math.PI*2);
    ctx.arc(cx + 26*s, c.y-10*s,  22*s, 0, Math.PI*2);
    ctx.arc(cx + 52*s, c.y,       28*s, 0, Math.PI*2);
    ctx.fill();
  }
}

function drawPlatforms() {
  const ld = levelData;
  const lvl = currentLevel;
  for (const pl of ld.platforms) {
    const sx = pl.x - cameraX;
    if (sx + pl.w < 0 || sx > W) continue;
    if (pl.isGround) {
      ctx.fillStyle = lvl === 1 ? '#3A5C35' : lvl === 2 ? '#1A3A1E' : '#4A7C3F';
      ctx.fillRect(sx, pl.y, pl.w, 14);
      ctx.fillStyle = lvl === 1 ? '#5A3820' : lvl === 2 ? '#201408' : '#7B4F28';
      ctx.fillRect(sx, pl.y + 14, pl.w, pl.h - 14);
    } else {
      ctx.fillStyle = lvl === 1 ? '#504848' : lvl === 2 ? '#282845' : '#6E6E60';
      roundRect(sx, pl.y, pl.w, pl.h, 4);
      ctx.fill();
      ctx.fillStyle = lvl === 1 ? '#706060' : lvl === 2 ? '#404068' : '#9A9A8A';
      ctx.fillRect(sx + 4, pl.y + 2, pl.w - 8, 4);
    }
  }
}

function drawFinish() {
  const fx = levelData.finishX - cameraX;
  if (fx < -50 || fx > W + 50) return;
  ctx.fillStyle = '#555';
  ctx.fillRect(fx, 255, 5, 110);
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.moveTo(fx + 5, 258);
  ctx.lineTo(fx + 45, 273);
  ctx.lineTo(fx + 5, 288);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FINISH', fx + 20, 248);
}

function drawPitWarnings() {
  ctx.fillStyle = '#222';
  for (const pl of levelData.platforms) {
    if (!pl.isGround) continue;
    const sx = pl.x - cameraX;
    if (sx + pl.w < W && sx + pl.w > 0) ctx.fillRect(sx + pl.w - 8, pl.y, 8, 6);
    if (sx > 0 && sx < W)               ctx.fillRect(sx, pl.y, 8, 6);
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function drawHUD() {
  // Level indicator (center top)
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(W/2 - 50, 10, 100, 22, 5);
  ctx.fill();
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`LEVEL ${currentLevel + 1}`, W/2, 25);

  // P1 Nugget box (2P only)
  if (playerMode === '2p') {
    const p0 = players[0];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(10, 10, 155, 38, 5);
    ctx.fill();
    ctx.fillStyle = p0.color;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(p0.label, 16, 25);
    ctx.fillStyle = p0.finished ? '#5CDB5C' : p0.dead ? '#FF6B6B' : '#ccc';
    ctx.font = '10px sans-serif';
    ctx.fillText(p0.finished ? '\u2605 FINISHED!' : p0.dead ? 'Respawning...' : 'Playing', 16, 40);
  }

  // Axolotl box (right)
  const axo = players[playerMode === '1p' ? 0 : 1];
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(W - 165, 10, 155, 38, 5);
  ctx.fill();
  ctx.fillStyle = axo.color;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(axo.label, W - 16, 25);
  ctx.fillStyle = axo.finished ? '#5CDB5C' : axo.dead ? '#FF6B6B' : '#ccc';
  ctx.font = '10px sans-serif';
  ctx.fillText(axo.finished ? '\u2605 FINISHED!' : axo.dead ? 'Respawning...' : 'Playing', W - 16, 40);

  // Sword status (level 2 only)
  if (swordUnlocked && axo.hasSword) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(W - 165, 53, 155, 22, 5);
    ctx.fill();
    if (axo.swordTimer > 0) {
      ctx.shadowColor = '#4499FF';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#88CCFF';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('\u26A1 SWORD ACTIVE!', W - 16, 68);
      ctx.shadowBlur = 0;
    } else if (axo.swordCooldown > 0) {
      const prog = 1 - axo.swordCooldown / SWORD_COOLDOWN;
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(W - 148, 60, 124, 8);
      ctx.fillStyle = '#4499FF';
      ctx.fillRect(W - 148, 60, 124 * prog, 8);
      ctx.fillStyle = '#aaa';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('\u26A1 Sword cooldown', W - 16, 58);
    } else {
      ctx.fillStyle = '#88CCFF';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('\u26A1 Sword: READY [\u2193]', W - 16, 68);
    }
  }

  // Flaming bow status (level 3, 2P Nugget)
  if (currentLevel === 2 && playerMode === '2p' && nuggetHasBow) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(10, 53, 155, 22, 5);
    ctx.fill();
    ctx.shadowColor = '#FF8800';
    ctx.shadowBlur = 7;
    ctx.fillStyle = '#FFB300';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FLAMING BOW READY!', 16, 68);
    ctx.shadowBlur = 0;
  }
}

// ─── END SCREENS ──────────────────────────────────────────────────────────────
function drawGameOver() {
  ctx.fillStyle = 'rgba(160,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.shadowColor = '#FF0000';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('THE SNATCHER GOT THE NUGGET!', W/2, H/2 - 32);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFF';
  ctx.font = '20px sans-serif';
  ctx.fillText('Nugget has been snatched away...', W/2, H/2 + 10);
  ctx.fillStyle = '#FFB3C6';
  ctx.font = '14px sans-serif';
  ctx.fillText('R = Retry Level 2   \u00B7   M = Back to Menu', W/2, H/2 + 46);
}

function drawVictoryScreen() {
  ctx.fillStyle = 'rgba(0,0,0,0.68)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('YOU WIN!', W/2, H/2 - 38);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFF';
  ctx.font = '22px sans-serif';
  const msg = playerMode === '1p' ? 'Axolotl rescued the Nugget!' : 'Nugget & Axolotl made it!';
  ctx.fillText(msg, W/2, H/2 + 10);
  ctx.fillStyle = '#aaa';
  ctx.font = '14px sans-serif';
  ctx.fillText('R = Play Again from Menu   \u00B7   M = Back to Menu', W/2, H/2 + 48);
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, W, H);

  if (gameState === 'menu')       { drawMenu();       return; }
  if (gameState === 'transition') { drawTransition(); return; }

  drawBackground();
  drawPlatforms();
  drawPitWarnings();
  drawFinish();
  drawNuggetNPC();
  if (currentLevel === 2) { drawStarFriend(); drawStrongman(); drawBowPickup(); }

  for (const p of players) {
    if (p.dead) continue;
    if (p.hasSword) {
      drawSword(p);
      drawAxolotl(p);
    } else {
      drawNugget(p);
    }
  }

  drawEnemy();
  if (currentLevel === 2) drawL3Overlay();
  drawHUD();

  if (gameState === 'gameover') drawGameOver();
  if (gameState === 'victory')  drawVictoryScreen();
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────
function gameLoop() {
  frameCount++;
  update();
  // Clear justPressed after update so each key triggers exactly once
  for (const k in justPressed) delete justPressed[k];
  render();
  requestAnimationFrame(gameLoop);
}

gameLoop();
