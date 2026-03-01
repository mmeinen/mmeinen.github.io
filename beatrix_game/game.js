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

const LEVEL4 = {
  levelWidth: 6500,
  finishX: 6000,
  skyTop: '#020B1A', skyBot: '#0A3060',
  mountainColor: '#0A2A3A',
  sharkPositions: [1800, 3200, 4800],
  crabBossX: 5200,
  platforms: [
    { x: -200, y: GROUND_Y, w: 900,  h: 90, isGround: true },
    { x:  900, y: GROUND_Y, w: 600,  h: 90, isGround: true },
    { x: 1800, y: GROUND_Y, w: 500,  h: 90, isGround: true },
    { x: 2600, y: GROUND_Y, w: 600,  h: 90, isGround: true },
    { x: 3500, y: GROUND_Y, w: 500,  h: 90, isGround: true },
    { x: 4300, y: GROUND_Y, w: 600,  h: 90, isGround: true },
    { x: 5200, y: GROUND_Y, w: 1300, h: 90, isGround: true },
    { x:  450, y: 290, w: 150, h: 16 },
    { x:  780, y: 270, w: 120, h: 16 },
    { x: 1200, y: 280, w: 140, h: 16 },
    { x: 1550, y: 265, w: 130, h: 16 },
    { x: 2100, y: 275, w: 120, h: 16 },
    { x: 2400, y: 260, w: 110, h: 16 },
    { x: 3050, y: 270, w: 130, h: 16 },
    { x: 3350, y: 255, w: 110, h: 16 },
    { x: 3900, y: 275, w: 140, h: 16 },
    { x: 4150, y: 260, w: 120, h: 16 },
  ],
  bgMountains: [
    { x:  300, h: 160 }, { x:  700, h: 200 }, { x: 1100, h: 170 },
    { x: 1500, h: 210 }, { x: 2000, h: 180 }, { x: 2500, h: 220 },
    { x: 3000, h: 190 }, { x: 3500, h: 210 }, { x: 4000, h: 175 },
    { x: 4500, h: 200 }, { x: 5100, h: 185 }, { x: 5600, h: 195 },
  ],
  clouds: [
    { x:  200, y: 50,  s: 1.0 }, { x:  600, y: 35,  s: 0.8 },
    { x: 1100, y: 60,  s: 1.1 }, { x: 1700, y: 42,  s: 0.9 },
    { x: 2400, y: 55,  s: 1.0 }, { x: 3100, y: 38,  s: 0.85 },
    { x: 3800, y: 65,  s: 1.05 }, { x: 4500, y: 45, s: 0.9 },
    { x: 5300, y: 58,  s: 1.0 },
  ],
};

const LEVEL5 = {
  levelWidth: 7000,
  finishX: 6500,
  skyTop: '#1A0800', skyBot: '#4A1800',
  mountainColor: '#2A1008',
  salamanderX: 2400,
  strongmanBossX: 5500,
  starCageX: 5800,
  platforms: [
    { x: -200, y: GROUND_Y, w: 700,  h: 90, isGround: true },
    { x:  800, y: GROUND_Y, w: 500,  h: 90, isGround: true },
    { x: 1600, y: GROUND_Y, w: 600,  h: 90, isGround: true },
    { x: 2500, y: GROUND_Y, w: 500,  h: 90, isGround: true },
    { x: 3300, y: GROUND_Y, w: 400,  h: 90, isGround: true },
    { x: 4000, y: GROUND_Y, w: 500,  h: 90, isGround: true },
    { x: 4800, y: GROUND_Y, w: 600,  h: 90, isGround: true },
    { x: 5700, y: GROUND_Y, w: 1300, h: 90, isGround: true },
    { x:  400, y: 290, w: 140, h: 16 },
    { x:  680, y: 270, w: 120, h: 16 },
    { x: 1100, y: 280, w: 130, h: 16 },
    { x: 1400, y: 265, w: 110, h: 16 },
    { x: 2050, y: 275, w: 140, h: 16 },
    { x: 2350, y: 260, w: 120, h: 16 },
    { x: 2900, y: 270, w: 130, h: 16 },
    { x: 3150, y: 255, w: 110, h: 16 },
    { x: 3650, y: 275, w: 140, h: 16 },
    { x: 4450, y: 265, w: 120, h: 16 },
    { x: 5350, y: 280, w: 130, h: 16 },
  ],
  bgMountains: [
    { x:  300, h: 200 }, { x:  700, h: 170 }, { x: 1100, h: 230 },
    { x: 1500, h: 190 }, { x: 2000, h: 210 }, { x: 2500, h: 180 },
    { x: 3000, h: 225 }, { x: 3500, h: 195 }, { x: 4000, h: 215 },
    { x: 4500, h: 185 }, { x: 5100, h: 200 }, { x: 5600, h: 210 },
  ],
  clouds: [
    { x:  200, y: 50,  s: 1.0  }, { x:  600, y: 35,  s: 0.8  },
    { x: 1100, y: 55,  s: 1.1  }, { x: 1700, y: 40,  s: 0.9  },
    { x: 2400, y: 50,  s: 1.0  }, { x: 3100, y: 38,  s: 0.85 },
    { x: 3800, y: 58,  s: 1.05 }, { x: 4500, y: 42,  s: 0.9  },
    { x: 5300, y: 52,  s: 1.0  },
  ],
};

const SALAMANDER_HINT = [
  'Psst! Little ones, listen closely...',
  'The Strongman awaits in his fortress ahead.',
  'He\'ll POUND the ground — jump to dodge the shockwave!',
  'He\'ll CHARGE at you — leap over him!',
  'He\'ll THROW rocks — watch out from afar!',
  'Strike him 7 times with the sword to win!',
  'Good luck... rescue Star!',
];

const SHARK_RIDDLES = [
  ['Ahoy, little ones... Seek the beast below:',
   'An armored crimson shell it wears,',
   'With pincers sharp beyond compare,',
   'It lurks where coral towers rise—',
   'Beware its snapping, fierce surprise!'],
  ['You draw closer... Listen well:',
   'Past the coral towers tall,',
   'Where the ocean floor grows wide,',
   'The crimson guardian holds its ground—',
   'Its claws can crush from either side!'],
  ['The final truth, brave travelers:',
   'Upon the great plateau it waits,',
   'Five strikes to shatter armored plates!',
   'Steel your nerves, raise your blade—',
   'End the tyrant\'s crusade!'],
];

const LEVELS = [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5];

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
let l4Phase = 'explore';
let l4Timer = 0;
let shark = null;
let giantCrab = null;
let bubbles = [];
let seaweedPositions = [];
let l5Phase = 'explore';
let l5Timer = 0;
let lavaSalamander = null;
let strongmanBoss = null;
let starCage = null;
let embers = [];
let rockProjectiles = [];
let shockwave = null;

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

function initLevel4() {
  l4Phase = 'explore';
  l4Timer = 0;
  shark = { x: 0, y: 0, w: 140, h: 70, visible: false };
  giantCrab = {
    x: levelData.crabBossX,
    y: GROUND_Y - 50,
    w: 70, h: 50,
    hp: 5, maxHp: 5,
    alive: true, visible: false,
    stunTimer: 0,
    attackState: 'idle',
    attackTimer: 0,
    cooldown: 0,
    facingRight: false,
    defeatTimer: 0,
    emergeTimer: 0,
    clawSnap: 0,
  };
  bubbles = [];
  for (let i = 0; i < 40; i++) {
    bubbles.push({
      x: Math.random() * levelData.levelWidth,
      y: Math.random() * H,
      r: 2 + Math.random() * 4,
      speed: 0.3 + Math.random() * 0.5,
      wobble: Math.random() * Math.PI * 2,
    });
  }
  seaweedPositions = [];
  for (const pl of levelData.platforms) {
    if (!pl.isGround) continue;
    for (let sx = pl.x + 30; sx < pl.x + pl.w - 30; sx += 60 + Math.random() * 80) {
      seaweedPositions.push({ x: sx, h: 25 + Math.random() * 35, phase: Math.random() * Math.PI * 2 });
    }
  }
}

function initLevel5() {
  l5Phase = 'explore';
  l5Timer = 0;
  lavaSalamander = {
    x: levelData.salamanderX,
    y: GROUND_Y - 24,
    w: 32, h: 24,
    visible: false,
    hintLine: 0,
  };
  strongmanBoss = {
    x: levelData.strongmanBossX,
    y: GROUND_Y - 64,
    w: 52, h: 64,
    hp: 7, maxHp: 7,
    alive: true, visible: false,
    stunTimer: 0,
    attackState: 'idle',
    attackTimer: 0,
    cooldown: 0,
    facingRight: false,
    defeatTimer: 0,
    emergeTimer: 0,
    chargeDir: 0,
  };
  starCage = {
    x: levelData.starCageX,
    y: GROUND_Y - 50,
    w: 48, h: 50,
    broken: false,
  };
  embers = [];
  for (let i = 0; i < 50; i++) {
    embers.push({
      x: Math.random() * levelData.levelWidth,
      y: Math.random() * H,
      speed: 0.4 + Math.random() * 0.8,
      wobble: Math.random() * Math.PI * 2,
      size: 1.5 + Math.random() * 2.5,
    });
  }
  rockProjectiles = [];
  shockwave = null;
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
  if (n === 3) initLevel4();
  if (n === 4) initLevel5();
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
  ctx.fillText('A 5-Level Adventure!', W/2, 130);

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

  // Crab boss hit detection (level 4)
  if (p.swordTimer > 0 && giantCrab && giantCrab.alive && giantCrab.visible &&
      l4Phase === 'boss_fight' && giantCrab.stunTimer <= 0) {
    const hitX = p.facingRight ? p.x + p.w : p.x - 58;
    const hitBox = { x: hitX, y: p.y + 8, w: 58, h: 20 };
    const cHit = hitBox.x < giantCrab.x + giantCrab.w && hitBox.x + hitBox.w > giantCrab.x &&
                 hitBox.y < giantCrab.y + giantCrab.h && hitBox.y + hitBox.h > giantCrab.y;
    if (cHit) {
      giantCrab.hp--;
      giantCrab.stunTimer = 45;
      giantCrab.x += p.facingRight ? 25 : -25;
      giantCrab.x = Math.max(0, Math.min(levelData.levelWidth - giantCrab.w, giantCrab.x));
      if (giantCrab.hp <= 0) {
        giantCrab.alive = false;
        l4Phase = 'boss_defeated';
        l4Timer = 120;
      }
    }
  }

  // Strongman boss hit detection (level 5)
  if (p.swordTimer > 0 && strongmanBoss && strongmanBoss.alive && strongmanBoss.visible &&
      l5Phase === 'boss_fight' && strongmanBoss.stunTimer <= 0) {
    const hitX = p.facingRight ? p.x + p.w : p.x - 58;
    const hitBox = { x: hitX, y: p.y + 8, w: 58, h: 20 };
    const sHit = hitBox.x < strongmanBoss.x + strongmanBoss.w && hitBox.x + hitBox.w > strongmanBoss.x &&
                 hitBox.y < strongmanBoss.y + strongmanBoss.h && hitBox.y + hitBox.h > strongmanBoss.y;
    if (sHit) {
      strongmanBoss.hp--;
      strongmanBoss.stunTimer = 50;
      strongmanBoss.x += p.facingRight ? 30 : -30;
      strongmanBoss.x = Math.max(0, Math.min(levelData.levelWidth - strongmanBoss.w, strongmanBoss.x));
      strongmanBoss.attackState = 'idle';
      strongmanBoss.attackTimer = 0;
      rockProjectiles = [];
      if (strongmanBoss.hp <= 0) {
        strongmanBoss.alive = false;
        l5Phase = 'boss_defeated';
        l5Timer = 120;
      }
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

  // Freeze players while the shark/salamander is speaking
  if (l4Phase === 'clue1' || l4Phase === 'clue2' || l4Phase === 'clue3' || l5Phase === 'salamander') {
    p.vx = 0;
    p.vy += GRAVITY;
    p.y += p.vy;
    resolveY(p, plats);
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

  if (p.x + p.w >= levelData.finishX &&
      (currentLevel !== 2 || l3Phase === 'done') &&
      (currentLevel !== 3 || l4Phase === 'done') &&
      (currentLevel !== 4 || l5Phase === 'done')) p.finished = true;
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

// ─── LEVEL 4 SCRIPT ──────────────────────────────────────────────────────────
function updateLevel4Script() {
  const leadX = players.reduce((m, p) => Math.max(m, p.x + p.w), 0);

  if (l4Phase === 'explore') {
    if (leadX >= 1600) {
      l4Phase = 'clue1';
      l4Timer = 240;
      shark.x = levelData.sharkPositions[0];
      shark.y = GROUND_Y - 90;
      shark.visible = true;
    }
  } else if (l4Phase === 'clue1') {
    if (justPressed['enter'] || justPressed[' ']) { l4Phase = 'search1'; shark.visible = false; }
  } else if (l4Phase === 'search1') {
    if (leadX >= 3000) {
      l4Phase = 'clue2';
      l4Timer = 240;
      shark.x = levelData.sharkPositions[1];
      shark.y = GROUND_Y - 90;
      shark.visible = true;
    }
  } else if (l4Phase === 'clue2') {
    if (justPressed['enter'] || justPressed[' ']) { l4Phase = 'search2'; shark.visible = false; }
  } else if (l4Phase === 'search2') {
    if (leadX >= 4600) {
      l4Phase = 'clue3';
      l4Timer = 280;
      shark.x = levelData.sharkPositions[2];
      shark.y = GROUND_Y - 90;
      shark.visible = true;
    }
  } else if (l4Phase === 'clue3') {
    if (justPressed['enter'] || justPressed[' ']) {
      l4Phase = 'boss_reveal';
      l4Timer = 90;
      shark.visible = false;
      giantCrab.visible = true;
      giantCrab.emergeTimer = 90;
    }
  } else if (l4Phase === 'boss_reveal') {
    l4Timer--;
    giantCrab.emergeTimer = l4Timer;
    if (l4Timer <= 0) { l4Phase = 'boss_fight'; giantCrab.cooldown = 60; }
  } else if (l4Phase === 'boss_fight') {
    updateGiantCrab();
  } else if (l4Phase === 'boss_defeated') {
    l4Timer--;
    giantCrab.defeatTimer = l4Timer;
    if (l4Timer <= 0) l4Phase = 'done';
  }

  // Update bubbles
  for (const b of bubbles) {
    b.y -= b.speed;
    b.wobble += 0.03;
    if (b.y + b.r < 0) {
      b.y = H + b.r;
      b.x = Math.random() * levelData.levelWidth;
    }
  }
}

function updateGiantCrab() {
  const crab = giantCrab;
  if (!crab.alive) return;

  if (crab.stunTimer > 0) {
    crab.stunTimer--;
    crab.attackState = 'idle';
    crab.cooldown = 60;
    return;
  }

  // Find closest player
  let closest = null, closestDist = Infinity;
  for (const p of players) {
    if (p.dead || p.finished) continue;
    const d = Math.abs((p.x + p.w/2) - (crab.x + crab.w/2));
    if (d < closestDist) { closestDist = d; closest = p; }
  }

  if (!closest) return;
  crab.facingRight = (closest.x + closest.w/2) > (crab.x + crab.w/2);

  if (crab.attackState === 'idle') {
    if (crab.cooldown > 0) { crab.cooldown--; return; }
    if (closestDist < 55) {
      crab.attackState = 'claw';
      crab.attackTimer = 30;
      crab.clawSnap = 30;
    } else {
      crab.attackState = 'charge';
      crab.attackTimer = 60;
    }
  } else if (crab.attackState === 'charge') {
    const dir = crab.facingRight ? 1 : -1;
    crab.x += dir * 4.5;
    crab.x = Math.max(0, Math.min(levelData.levelWidth - crab.w, crab.x));
    crab.attackTimer--;
    // Kill on contact
    for (const p of players) {
      if (p.dead || p.finished) continue;
      if (p.x < crab.x + crab.w && p.x + p.w > crab.x &&
          p.y < crab.y + crab.h && p.y + p.h > crab.y) {
        p.dead = true;
        p.deathTimer = 70;
      }
    }
    if (crab.attackTimer <= 0) { crab.attackState = 'idle'; crab.cooldown = 90; }
  } else if (crab.attackState === 'claw') {
    crab.attackTimer--;
    crab.clawSnap = crab.attackTimer;
    // Close-range claw hit
    if (crab.attackTimer > 15) {
      const clawReach = 35;
      const cx = crab.facingRight ? crab.x + crab.w : crab.x - clawReach;
      for (const p of players) {
        if (p.dead || p.finished) continue;
        if (p.x < cx + clawReach && p.x + p.w > cx &&
            p.y < crab.y + crab.h && p.y + p.h > crab.y) {
          p.dead = true;
          p.deathTimer = 70;
        }
      }
    }
    if (crab.attackTimer <= 0) { crab.attackState = 'idle'; crab.cooldown = 90; }
  }
}

// ─── LEVEL 5 SCRIPT ──────────────────────────────────────────────────────────
function updateLevel5Script() {
  const leadX = players.reduce((m, p) => Math.max(m, p.x + p.w), 0);

  if (l5Phase === 'explore') {
    if (leadX >= 2200) {
      l5Phase = 'salamander';
      lavaSalamander.visible = true;
      lavaSalamander.hintLine = 0;
    }
  } else if (l5Phase === 'salamander') {
    if (justPressed['enter'] || justPressed[' ']) {
      lavaSalamander.hintLine++;
      if (lavaSalamander.hintLine >= SALAMANDER_HINT.length) {
        l5Phase = 'search';
        lavaSalamander.visible = false;
      }
    }
  } else if (l5Phase === 'search') {
    if (leadX >= 5200) {
      l5Phase = 'boss_reveal';
      l5Timer = 90;
      strongmanBoss.visible = true;
      strongmanBoss.emergeTimer = 90;
    }
  } else if (l5Phase === 'boss_reveal') {
    l5Timer--;
    strongmanBoss.emergeTimer = l5Timer;
    if (l5Timer <= 0) { l5Phase = 'boss_fight'; strongmanBoss.cooldown = 60; }
  } else if (l5Phase === 'boss_fight') {
    updateStrongmanBoss();
    updateRockProjectiles();
    updateShockwave();
  } else if (l5Phase === 'boss_defeated') {
    l5Timer--;
    strongmanBoss.defeatTimer = l5Timer;
    if (l5Timer <= 0) {
      l5Phase = 'star_rescued';
      l5Timer = 180;
      starCage.broken = true;
    }
  } else if (l5Phase === 'star_rescued') {
    l5Timer--;
    if (l5Timer <= 0) l5Phase = 'done';
  }

  // Update embers
  for (const e of embers) {
    e.y -= e.speed;
    e.wobble += 0.04;
    if (e.y + e.size < 0) {
      e.y = H + e.size;
      e.x = Math.random() * levelData.levelWidth;
    }
  }
}

function updateStrongmanBoss() {
  const boss = strongmanBoss;
  if (!boss.alive) return;

  if (boss.stunTimer > 0) {
    boss.stunTimer--;
    boss.attackState = 'idle';
    boss.cooldown = 60;
    return;
  }

  let closest = null, closestDist = Infinity;
  for (const p of players) {
    if (p.dead || p.finished) continue;
    const d = Math.abs((p.x + p.w/2) - (boss.x + boss.w/2));
    if (d < closestDist) { closestDist = d; closest = p; }
  }

  if (!closest) return;
  boss.facingRight = (closest.x + closest.w/2) > (boss.x + boss.w/2);

  const enraged = boss.hp <= 3;
  const cooldownTime = enraged ? 50 : 80;

  if (boss.attackState === 'idle') {
    if (boss.cooldown > 0) { boss.cooldown--; return; }
    if (closestDist < 100) {
      // Ground pound
      boss.attackState = 'ground_pound_rise';
      boss.attackTimer = 30;
    } else if (closestDist < 250) {
      // Charge
      boss.attackState = 'charge';
      boss.attackTimer = 50;
      boss.chargeDir = boss.facingRight ? 1 : -1;
    } else {
      // Rock throw
      boss.attackState = 'rock_windup';
      boss.attackTimer = 25;
    }
  } else if (boss.attackState === 'ground_pound_rise') {
    boss.attackTimer--;
    boss.y = GROUND_Y - boss.h - (30 - boss.attackTimer);
    if (boss.attackTimer <= 0) {
      boss.attackState = 'ground_pound_slam';
      boss.attackTimer = 12;
    }
  } else if (boss.attackState === 'ground_pound_slam') {
    boss.attackTimer--;
    boss.y = GROUND_Y - boss.h - (boss.attackTimer * 2.5);
    if (boss.attackTimer <= 0) {
      boss.y = GROUND_Y - boss.h;
      // Create shockwave
      shockwave = { x: boss.x + boss.w/2, timer: 20, maxTimer: 20 };
      // Kill grounded players within 80px
      for (const p of players) {
        if (p.dead || p.finished) continue;
        if (p.onGround && Math.abs((p.x + p.w/2) - (boss.x + boss.w/2)) < 80) {
          p.dead = true;
          p.deathTimer = 70;
        }
      }
      boss.attackState = 'idle';
      boss.cooldown = cooldownTime;
    }
  } else if (boss.attackState === 'charge') {
    boss.x += boss.chargeDir * 5;
    boss.x = Math.max(0, Math.min(levelData.levelWidth - boss.w, boss.x));
    boss.attackTimer--;
    for (const p of players) {
      if (p.dead || p.finished) continue;
      if (p.x < boss.x + boss.w && p.x + p.w > boss.x &&
          p.y < boss.y + boss.h && p.y + p.h > boss.y) {
        p.dead = true;
        p.deathTimer = 70;
      }
    }
    if (boss.attackTimer <= 0) { boss.attackState = 'idle'; boss.cooldown = cooldownTime; }
  } else if (boss.attackState === 'rock_windup') {
    boss.attackTimer--;
    if (boss.attackTimer <= 0) {
      // Launch rock toward closest player
      if (closest) {
        const dx = (closest.x + closest.w/2) - (boss.x + boss.w/2);
        const dir = dx > 0 ? 1 : -1;
        rockProjectiles.push({
          x: boss.x + boss.w/2 + dir * 30,
          y: boss.y + 20,
          vx: dir * 6,
          vy: -2,
          size: 10,
          timer: 120,
        });
      }
      boss.attackState = 'idle';
      boss.cooldown = cooldownTime;
    }
  }
}

function updateRockProjectiles() {
  for (let i = rockProjectiles.length - 1; i >= 0; i--) {
    const r = rockProjectiles[i];
    r.x += r.vx;
    r.y += r.vy;
    r.vy += 0.08; // slight arc
    r.timer--;
    // Kill players on contact
    for (const p of players) {
      if (p.dead || p.finished) continue;
      if (p.x < r.x + r.size && p.x + p.w > r.x - r.size &&
          p.y < r.y + r.size && p.y + p.h > r.y - r.size) {
        p.dead = true;
        p.deathTimer = 70;
        r.timer = 0;
      }
    }
    if (r.timer <= 0 || r.y > H + 50) {
      rockProjectiles.splice(i, 1);
    }
  }
}

function updateShockwave() {
  if (shockwave) {
    shockwave.timer--;
    if (shockwave.timer <= 0) shockwave = null;
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
      if (currentLevel === 3) l4Phase = 'done';
      if (currentLevel === 4) l5Phase = 'done';
      for (const p of players) p.finished = true;
      cheatPressCount = 0;
    }
  }

  for (const p of players) updatePlayer(p);
  updateEnemy();
  if (currentLevel === 2) updateLevel3Script();
  if (currentLevel === 3) updateLevel4Script();
  if (currentLevel === 4) updateLevel5Script();

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
    } else if (currentLevel === 2) {
      startLevel(3);
    } else if (currentLevel === 3) {
      startLevel(4);
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

// ─── DRAW LEVEL 4 ─────────────────────────────────────────────────────────────
function drawUnderwaterBG() {
  // Light rays from above
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const rx = (i * 280 + 100) - cameraX * 0.08;
    const grad = ctx.createLinearGradient(rx, 0, rx + 60, H);
    grad.addColorStop(0, 'rgba(80,160,220,0.10)');
    grad.addColorStop(1, 'rgba(80,160,220,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx + 60, 0);
    ctx.lineTo(rx + 120, H);
    ctx.lineTo(rx + 30, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawSeaweed() {
  ctx.save();
  for (const sw of seaweedPositions) {
    const sx = sw.x - cameraX;
    if (sx < -30 || sx > W + 30) continue;
    const sway = Math.sin(frameCount * 0.025 + sw.phase) * 8;
    ctx.strokeStyle = '#1A8040';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx, GROUND_Y);
    ctx.quadraticCurveTo(sx + sway, GROUND_Y - sw.h * 0.6, sx + sway * 1.3, GROUND_Y - sw.h);
    ctx.stroke();
    ctx.strokeStyle = '#22A050';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx + 3, GROUND_Y);
    ctx.quadraticCurveTo(sx + 3 + sway * 0.8, GROUND_Y - sw.h * 0.5, sx + 3 + sway, GROUND_Y - sw.h * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBubbles() {
  ctx.save();
  for (const b of bubbles) {
    const bx = b.x - cameraX + Math.sin(b.wobble) * 6;
    if (bx < -10 || bx > W + 10) continue;
    ctx.strokeStyle = 'rgba(120,200,255,0.35)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(120,200,255,0.08)';
    ctx.beginPath();
    ctx.arc(bx, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Highlight
    ctx.fillStyle = 'rgba(200,240,255,0.25)';
    ctx.beginPath();
    ctx.arc(bx - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShark() {
  if (!shark || !shark.visible) return;
  const sx = Math.round(shark.x - cameraX);
  const bob = Math.sin(frameCount * 0.03) * 6;
  const sy = Math.round(shark.y + bob);
  if (sx + 220 < 0 || sx - 60 > W) return;

  const cx = sx + 80; // center x of the shark body

  ctx.save();

  // Ominous dark aura / shadow pool
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, sy + 82, 80, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── TAIL ── massive forked tail with ragged edges
  ctx.fillStyle = '#2A3540';
  ctx.beginPath();
  ctx.moveTo(sx - 16, sy + 32);
  ctx.lineTo(sx - 58, sy - 2);
  ctx.lineTo(sx - 48, sy + 14);
  ctx.lineTo(sx - 54, sy + 8);
  ctx.lineTo(sx - 36, sy + 32);
  ctx.lineTo(sx - 54, sy + 56);
  ctx.lineTo(sx - 48, sy + 50);
  ctx.lineTo(sx - 58, sy + 66);
  ctx.lineTo(sx - 16, sy + 38);
  ctx.closePath();
  ctx.fill();

  // ── MAIN BODY ── massive dark torpedo
  ctx.fillStyle = '#2C3E48';
  ctx.beginPath();
  ctx.ellipse(cx, sy + 35, 88, 35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Darker upper half
  ctx.fillStyle = '#1E2E38';
  ctx.beginPath();
  ctx.ellipse(cx, sy + 28, 86, 26, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // Pale scarred belly
  ctx.fillStyle = '#6A8898';
  ctx.beginPath();
  ctx.ellipse(cx + 10, sy + 50, 58, 16, 0.04, 0, Math.PI * 2);
  ctx.fill();

  // ── GILL SLITS ── five vertical slashes
  ctx.strokeStyle = '#1A2028';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const gx = cx + 34 + i * 7;
    ctx.beginPath();
    ctx.moveTo(gx, sy + 28);
    ctx.lineTo(gx - 1, sy + 44);
    ctx.stroke();
  }

  // ── DEEP SCARS ── long gashes with reddish tissue
  ctx.lineWidth = 3;
  const scars = [
    [cx - 30, sy + 14, cx - 8, sy + 42],
    [cx - 14, sy + 10, cx + 12, sy + 40],
    [cx + 6, sy + 12, cx + 24, sy + 38],
    [cx - 48, sy + 26, cx - 22, sy + 48],
  ];
  for (const [x1, y1, x2, y2] of scars) {
    // Dark gash
    ctx.strokeStyle = 'rgba(40,10,10,0.6)';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // Red inflamed tissue along edges
    ctx.strokeStyle = 'rgba(160,40,40,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1 + 2, y1 + 1); ctx.lineTo(x2 + 2, y2 + 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 - 1, y1 - 1); ctx.lineTo(x2 - 1, y2 - 1); ctx.stroke();
    ctx.lineWidth = 3;
  }

  // ── BARNACLE CLUSTERS ── crusty growths on skin
  const barnacles = [
    [cx - 40, sy + 20], [cx - 50, sy + 34], [cx - 22, sy + 52],
    [cx + 50, sy + 18], [cx - 60, sy + 40], [cx + 36, sy + 54],
  ];
  for (const [bx, by] of barnacles) {
    ctx.fillStyle = '#5A6058';
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#78786E';
    ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3A3E38';
    ctx.beginPath(); ctx.arc(bx, by, 1, 0, Math.PI * 2); ctx.fill();
  }

  // ── DORSAL FIN ── tall, torn, and ragged with notches
  ctx.fillStyle = '#1E2E38';
  ctx.beginPath();
  ctx.moveTo(cx - 24, sy + 2);
  ctx.lineTo(cx - 14, sy - 44);
  ctx.lineTo(cx - 10, sy - 30);  // notch
  ctx.lineTo(cx - 4, sy - 40);
  ctx.lineTo(cx + 2, sy - 28);   // torn notch
  ctx.lineTo(cx + 8, sy - 36);
  ctx.lineTo(cx + 14, sy - 22);  // ragged tear
  ctx.lineTo(cx + 18, sy - 26);
  ctx.lineTo(cx + 22, sy + 2);
  ctx.closePath();
  ctx.fill();
  // Fin scar
  ctx.strokeStyle = 'rgba(120,40,40,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 8, sy - 20); ctx.lineTo(cx + 10, sy - 6); ctx.stroke();

  // ── PECTORAL FINS ── large, blade-like
  ctx.fillStyle = '#2A3A44';
  ctx.beginPath();
  ctx.moveTo(cx + 14, sy + 50);
  ctx.lineTo(cx - 18, sy + 78);
  ctx.lineTo(cx - 6, sy + 72);
  ctx.lineTo(cx + 32, sy + 52);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 40, sy + 50);
  ctx.lineTo(cx + 68, sy + 78);
  ctx.lineTo(cx + 62, sy + 72);
  ctx.lineTo(cx + 52, sy + 50);
  ctx.closePath();
  ctx.fill();

  // ── SNOUT ── blunt megalodon-style, slightly upturned
  ctx.fillStyle = '#2C3E48';
  ctx.beginPath();
  ctx.moveTo(cx + 84, sy + 22);
  ctx.quadraticCurveTo(cx + 128, sy + 28, cx + 120, sy + 36);
  ctx.lineTo(cx + 84, sy + 50);
  ctx.closePath();
  ctx.fill();
  // Nose ridges
  ctx.strokeStyle = '#1A2830';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx + 100, sy + 26); ctx.lineTo(cx + 116, sy + 30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 98, sy + 28); ctx.lineTo(cx + 112, sy + 32); ctx.stroke();

  // ── GAPING MAW ── wide-open mouth with dark interior
  // Mouth cavity
  ctx.fillStyle = '#2A0808';
  ctx.beginPath();
  ctx.moveTo(cx + 56, sy + 32);
  ctx.lineTo(cx + 116, sy + 32);
  ctx.quadraticCurveTo(cx + 120, sy + 40, cx + 114, sy + 50);
  ctx.lineTo(cx + 54, sy + 50);
  ctx.closePath();
  ctx.fill();
  // Red gums — upper
  ctx.fillStyle = '#8A1818';
  ctx.beginPath();
  ctx.moveTo(cx + 56, sy + 32);
  ctx.lineTo(cx + 116, sy + 32);
  ctx.lineTo(cx + 114, sy + 36);
  ctx.lineTo(cx + 56, sy + 36);
  ctx.closePath();
  ctx.fill();
  // Red gums — lower
  ctx.beginPath();
  ctx.moveTo(cx + 56, sy + 46);
  ctx.lineTo(cx + 114, sy + 46);
  ctx.lineTo(cx + 114, sy + 50);
  ctx.lineTo(cx + 54, sy + 50);
  ctx.closePath();
  ctx.fill();

  // Upper teeth — two rows, some broken
  const upperTeeth = [
    { x: 0, h: 8 }, { x: 7, h: 9 }, { x: 14, h: 7 }, { x: 21, h: 10 },
    { x: 28, h: 5 }, { x: 35, h: 9 }, { x: 42, h: 8 }, { x: 49, h: 6 },
  ];
  for (const t of upperTeeth) {
    const tx = cx + 58 + t.x;
    // Back row (slightly offset, smaller)
    ctx.fillStyle = '#C8B898';
    ctx.beginPath();
    ctx.moveTo(tx + 1, sy + 35);
    ctx.lineTo(tx + 3, sy + 35 + t.h * 0.6);
    ctx.lineTo(tx + 5, sy + 35);
    ctx.closePath();
    ctx.fill();
    // Front row
    ctx.fillStyle = '#E8DCC8';
    ctx.beginPath();
    ctx.moveTo(tx, sy + 36);
    ctx.lineTo(tx + 3, sy + 36 + t.h);
    ctx.lineTo(tx + 6, sy + 36);
    ctx.closePath();
    ctx.fill();
  }
  // Lower teeth
  const lowerTeeth = [
    { x: 3, h: 7 }, { x: 10, h: 8 }, { x: 17, h: 6 }, { x: 24, h: 9 },
    { x: 31, h: 4 }, { x: 38, h: 8 }, { x: 45, h: 7 },
  ];
  for (const t of lowerTeeth) {
    const tx = cx + 58 + t.x;
    ctx.fillStyle = '#E8DCC8';
    ctx.beginPath();
    ctx.moveTo(tx, sy + 46);
    ctx.lineTo(tx + 3, sy + 46 - t.h);
    ctx.lineTo(tx + 6, sy + 46);
    ctx.closePath();
    ctx.fill();
  }

  // ── EYE ── bloodshot, menacing
  // Bloodshot sclera
  ctx.fillStyle = '#D8C8A0';
  ctx.beginPath(); ctx.arc(cx + 66, sy + 22, 9, 0, Math.PI * 2); ctx.fill();
  // Blood veins in the eye
  ctx.strokeStyle = 'rgba(180,30,30,0.6)';
  ctx.lineWidth = 0.8;
  const veins = [[-6, -3, -2, -7], [5, -4, 2, -8], [-5, 4, -1, 8], [6, 3, 2, 7], [-7, 0, -3, -4]];
  for (const [vx1, vy1, vx2, vy2] of veins) {
    ctx.beginPath();
    ctx.moveTo(cx + 66 + vx1, sy + 22 + vy1);
    ctx.lineTo(cx + 66 + vx2, sy + 22 + vy2);
    ctx.stroke();
  }
  // Glowing amber iris
  ctx.shadowColor = '#FF4400';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#DD6600';
  ctx.beginPath(); ctx.arc(cx + 66, sy + 22, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  // Inner fiery ring
  ctx.strokeStyle = '#FFAA22';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx + 66, sy + 22, 3.5, 0, Math.PI * 2); ctx.stroke();
  // Slit pupil
  ctx.fillStyle = '#080000';
  ctx.beginPath();
  ctx.ellipse(cx + 66, sy + 22, 2, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── MONOCLE ── gold, cracked lens over the eye
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx + 66, sy + 22, 13, 0, Math.PI * 2); ctx.stroke();
  // Crack in the lens
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx + 60, sy + 16); ctx.lineTo(cx + 70, sy + 28); ctx.stroke();
  // Chain
  ctx.strokeStyle = '#DAA520';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx + 55, sy + 32);
  ctx.quadraticCurveTo(cx + 36, sy + 54, cx + 10, sy + 56);
  ctx.stroke();

  // ── WHISKERS ── thick, gnarled
  ctx.strokeStyle = 'rgba(220,220,210,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + 110, sy + 36); ctx.quadraticCurveTo(cx + 130, sy + 28, cx + 144, sy + 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 110, sy + 40); ctx.quadraticCurveTo(cx + 132, sy + 40, cx + 146, sy + 42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 108, sy + 46); ctx.quadraticCurveTo(cx + 128, sy + 52, cx + 140, sy + 56); ctx.stroke();

  // ── LABEL ──
  ctx.fillStyle = '#40C8A0';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WISE OLD SHARK', cx, sy - 48);

  // ── SPEECH BUBBLE ──
  const riddle = l4Phase === 'clue1' ? SHARK_RIDDLES[0] :
                 l4Phase === 'clue2' ? SHARK_RIDDLES[1] :
                 l4Phase === 'clue3' ? SHARK_RIDDLES[2] : null;
  if (riddle) {
    const bw = 300, bh = 86;
    const bbx = cx - bw / 2;
    const bby = sy - 60 - bh;
    // Dark parchment-style background
    ctx.fillStyle = 'rgba(240,235,220,0.96)';
    ctx.strokeStyle = '#2A6060';
    ctx.lineWidth = 2.5;
    roundRect(bbx, bby, bw, bh, 10);
    ctx.fill();
    roundRect(bbx, bby, bw, bh, 10);
    ctx.stroke();
    // Tail
    ctx.fillStyle = 'rgba(240,235,220,0.96)';
    ctx.beginPath();
    ctx.moveTo(cx - 10, bby + bh);
    ctx.lineTo(cx, bby + bh + 14);
    ctx.lineTo(cx + 10, bby + bh);
    ctx.closePath();
    ctx.fill();
    // Text
    ctx.textAlign = 'center';
    for (let i = 0; i < riddle.length; i++) {
      ctx.font = i === 0 ? 'bold 12px sans-serif' : '10px sans-serif';
      ctx.fillStyle = i === 0 ? '#1A3A3A' : '#2A4A4A';
      ctx.fillText(riddle[i], cx, bby + 17 + i * 14);
    }
  }
  ctx.restore();
}

function drawGiantCrab() {
  if (!giantCrab || !giantCrab.visible) return;
  const crab = giantCrab;
  const sx = Math.round(crab.x - cameraX);
  const sy = Math.round(crab.y);
  if (sx + crab.w + 40 < 0 || sx - 40 > W) return;

  // Emerge animation: rise from below
  const emergeOffset = crab.emergeTimer > 0 ? (crab.emergeTimer / 90) * 60 : 0;
  const drawY = sy + emergeOffset;

  const defeated = !crab.alive;
  const stunned = crab.stunTimer > 0;

  ctx.save();

  // Flash white when stunned
  if (stunned && Math.floor(frameCount / 3) % 2 === 0) {
    ctx.globalAlpha = 0.6;
  }

  // 6 legs (3 per side)
  const legColor = defeated ? '#6A4A30' : '#A03020';
  ctx.strokeStyle = legColor;
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const ly = drawY + 22 + i * 9;
    const lx1 = sx - 4 - i * 3;
    const lx2 = sx + crab.w + 4 + i * 3;
    // Left legs
    ctx.beginPath();
    ctx.moveTo(sx + 8, ly);
    ctx.lineTo(lx1, ly + 12);
    ctx.stroke();
    // Right legs
    ctx.beginPath();
    ctx.moveTo(sx + crab.w - 8, ly);
    ctx.lineTo(lx2, ly + 12);
    ctx.stroke();
  }

  // Shell body
  const shellColor = defeated ? '#7A5A40' : stunned ? '#CC5040' : '#C83820';
  ctx.fillStyle = shellColor;
  ctx.beginPath();
  ctx.ellipse(sx + crab.w / 2, drawY + crab.h / 2, crab.w / 2, crab.h / 2 - 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Darker stripe pattern
  ctx.fillStyle = defeated ? '#604830' : '#9A2818';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(sx + crab.w / 2, drawY + 14 + i * 10, crab.w / 2 - 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Claws
  const clawOpen = crab.clawSnap > 15 ? 0.4 : 0;
  const clawColor = defeated ? '#7A5A40' : '#D84030';
  ctx.fillStyle = clawColor;
  // Left claw
  const lcx = sx - 12, lcy = drawY + 10;
  ctx.beginPath();
  ctx.ellipse(lcx, lcy, 14, 10, -0.3 - clawOpen, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(lcx - 3, lcy - 8, 10, 6, -0.5 + clawOpen, 0, Math.PI * 2);
  ctx.fill();
  // Right claw
  const rcx = sx + crab.w + 12, rcy = drawY + 10;
  ctx.beginPath();
  ctx.ellipse(rcx, rcy, 14, 10, 0.3 + clawOpen, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(rcx + 3, rcy - 8, 10, 6, 0.5 - clawOpen, 0, Math.PI * 2);
  ctx.fill();

  // Eye stalks
  ctx.strokeStyle = defeated ? '#6A4A30' : '#A03020';
  ctx.lineWidth = 3;
  const leyX = sx + 18, reyX = sx + crab.w - 18;
  const eyeTopY = drawY - 8;
  ctx.beginPath(); ctx.moveTo(leyX, drawY + 5); ctx.lineTo(leyX - 4, eyeTopY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(reyX, drawY + 5); ctx.lineTo(reyX + 4, eyeTopY); ctx.stroke();

  if (defeated) {
    // X-eyes
    drawXEyes(0, 0, leyX - 4, eyeTopY, reyX + 4, eyeTopY);
  } else {
    // Yellow eyes
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(leyX - 4, eyeTopY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(reyX + 4, eyeTopY, 4, 0, Math.PI * 2); ctx.fill();
    // Dark pupils
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(leyX - 4, eyeTopY, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(reyX + 4, eyeTopY, 2, 0, Math.PI * 2); ctx.fill();
  }

  ctx.globalAlpha = 1;

  // HP bar
  if (crab.alive && l4Phase === 'boss_fight') {
    const barW = 60, barH = 6;
    const barX = sx + crab.w / 2 - barW / 2;
    const barY = drawY - 20;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = crab.hp > 2 ? '#44CC44' : crab.hp > 1 ? '#CCCC44' : '#CC4444';
    ctx.fillRect(barX, barY, barW * (crab.hp / crab.maxHp), barH);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
  }

  // Label
  ctx.fillStyle = defeated ? '#8A6A50' : '#FF4444';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(defeated ? 'DEFEATED' : 'GIANT CRAB', sx + crab.w / 2, drawY - 26);

  ctx.restore();
}

function drawL4Overlay() {
  let msg = null, sub = null;
  if (l4Phase === 'clue1' || l4Phase === 'clue2' || l4Phase === 'clue3') {
    msg = 'The Wise Shark speaks...';
    sub = 'Press Enter or Space to continue';
  } else if (l4Phase === 'boss_reveal') {
    msg = 'THE GIANT CRAB EMERGES!';
    sub = 'Prepare for battle!';
  } else if (l4Phase === 'boss_fight') {
    msg = `GIANT CRAB  HP: ${giantCrab.hp} / ${giantCrab.maxHp}`;
    sub = 'Hit it with the sword! [\u2193]';
  } else if (l4Phase === 'boss_defeated') {
    msg = 'THE GIANT CRAB IS DEFEATED!';
    sub = 'The ocean floor is safe... Reach the finish!';
  }
  if (!msg) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,20,40,0.75)';
  roundRect(W / 2 - 230, H - 95, 460, 58, 8);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = l4Phase === 'boss_defeated' ? '#44DDAA' : '#40C8FF';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(msg, W / 2, H - 65);
  if (sub) {
    ctx.fillStyle = '#AAD0E0';
    ctx.font = '12px sans-serif';
    ctx.fillText(sub, W / 2, H - 47);
  }
  ctx.restore();
}

function drawUnderwaterTint() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,40,80,0.12)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ─── DRAW LEVEL 5 ─────────────────────────────────────────────────────────────
function drawVolcanicBG() {
  // Distant volcano silhouette with glowing crater
  ctx.save();
  const vx = 3500 - cameraX * 0.15;
  ctx.fillStyle = '#1A0800';
  ctx.beginPath();
  ctx.moveTo(vx - 200, GROUND_Y);
  ctx.lineTo(vx - 40, 60);
  ctx.lineTo(vx + 40, 60);
  ctx.lineTo(vx + 200, GROUND_Y);
  ctx.closePath();
  ctx.fill();
  // Glowing crater
  ctx.shadowColor = '#FF4400';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#FF6600';
  ctx.beginPath();
  ctx.ellipse(vx, 65, 36, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Inner glow
  ctx.fillStyle = '#FFAA00';
  ctx.beginPath();
  ctx.ellipse(vx, 65, 18, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLavaInGaps() {
  ctx.save();
  const plats = levelData.platforms.filter(p => p.isGround);
  plats.sort((a, b) => a.x - b.x);
  for (let i = 0; i < plats.length - 1; i++) {
    const gapStart = plats[i].x + plats[i].w;
    const gapEnd = plats[i + 1].x;
    if (gapEnd - gapStart < 20) continue;
    const sx = gapStart - cameraX;
    const gw = gapEnd - gapStart;
    if (sx + gw < 0 || sx > W) continue;
    // Lava gradient
    const grad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    grad.addColorStop(0, '#FF4400');
    grad.addColorStop(0.3, '#FF6600');
    grad.addColorStop(0.7, '#CC2200');
    grad.addColorStop(1, '#880000');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, GROUND_Y, gw, H - GROUND_Y);
    // Animated surface bubbles
    for (let j = 0; j < 3; j++) {
      const bx = sx + gw * (j + 0.5) / 3 + Math.sin(frameCount * 0.06 + j * 2) * 8;
      const by = GROUND_Y + 4 + Math.sin(frameCount * 0.1 + j) * 3;
      ctx.fillStyle = '#FFAA00';
      ctx.beginPath();
      ctx.arc(bx, by, 3 + Math.sin(frameCount * 0.08 + j) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawEmbers() {
  ctx.save();
  for (const e of embers) {
    const ex = e.x - cameraX + Math.sin(e.wobble) * 8;
    if (ex < -10 || ex > W + 10) continue;
    const alpha = 0.5 + Math.sin(frameCount * 0.1 + e.wobble) * 0.3;
    ctx.shadowColor = '#FF6600';
    ctx.shadowBlur = 6;
    ctx.fillStyle = `rgba(255,${140 + Math.floor(Math.sin(e.wobble) * 40)},0,${Math.max(0.1, alpha)})`;
    ctx.beginPath();
    ctx.arc(ex, e.y, e.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawLavaSalamander() {
  if (!lavaSalamander || !lavaSalamander.visible) return;
  const sal = lavaSalamander;
  const sx = Math.round(sal.x - cameraX);
  const sy = Math.round(sal.y);
  if (sx + 60 < 0 || sx - 20 > W) return;

  ctx.save();
  // Body (orange-red)
  ctx.fillStyle = '#E85020';
  ctx.beginPath();
  ctx.ellipse(sx + 16, sy + 12, 16, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Spots
  ctx.fillStyle = '#FF8800';
  for (const [ox, oy] of [[8, 8], [20, 6], [14, 16]]) {
    ctx.beginPath(); ctx.arc(sx + ox, sy + oy, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Head
  ctx.fillStyle = '#D84818';
  ctx.beginPath();
  ctx.ellipse(sx + 30, sy + 10, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Golden eyes
  ctx.fillStyle = '#FFD700';
  ctx.beginPath(); ctx.arc(sx + 28, sy + 7, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(sx + 33, sy + 7, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(sx + 28, sy + 7, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(sx + 33, sy + 7, 1.5, 0, Math.PI * 2); ctx.fill();
  // Tiny legs
  ctx.fillStyle = '#D84818';
  ctx.fillRect(sx + 6, sy + 18, 4, 6);
  ctx.fillRect(sx + 14, sy + 18, 4, 6);
  ctx.fillRect(sx + 22, sy + 18, 4, 6);
  // Curling tail
  ctx.strokeStyle = '#E85020';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, sy + 12);
  ctx.quadraticCurveTo(sx - 10, sy + 6, sx - 8, sy + 16);
  ctx.stroke();
  // Name
  ctx.fillStyle = '#FFB060';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SALAMANDER', sx + 16, sy - 4);

  // Speech bubble
  const line = sal.hintLine;
  if (line < SALAMANDER_HINT.length) {
    const bw = 280, bh = 32;
    const bbx = sx + 16 - bw / 2;
    const bby = sy - 50;
    ctx.fillStyle = 'rgba(255,245,220,0.96)';
    ctx.strokeStyle = '#AA6030';
    ctx.lineWidth = 2;
    roundRect(bbx, bby, bw, bh, 8);
    ctx.fill();
    roundRect(bbx, bby, bw, bh, 8);
    ctx.stroke();
    // Tail
    ctx.fillStyle = 'rgba(255,245,220,0.96)';
    ctx.beginPath();
    ctx.moveTo(sx + 10, bby + bh);
    ctx.lineTo(sx + 16, bby + bh + 10);
    ctx.lineTo(sx + 22, bby + bh);
    ctx.closePath();
    ctx.fill();
    // Text
    ctx.fillStyle = '#4A2A10';
    ctx.font = line === 0 ? 'bold 11px sans-serif' : '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(SALAMANDER_HINT[line], sx + 16, bby + 20);
    // Continue prompt
    ctx.fillStyle = '#8A6A40';
    ctx.font = '8px sans-serif';
    ctx.fillText('Press Enter or Space...', sx + 16, bby + bh + 22);
  }
  ctx.restore();
}

function drawStrongmanBoss() {
  if (!strongmanBoss || !strongmanBoss.visible) return;
  const boss = strongmanBoss;
  const sx = Math.round(boss.x - cameraX);
  const sy = Math.round(boss.y);
  if (sx + boss.w + 80 < 0 || sx - 80 > W) return;

  const emergeOffset = boss.emergeTimer > 0 ? (boss.emergeTimer / 90) * 60 : 0;
  const drawY = sy + emergeOffset;
  const ew = boss.w, eh = boss.h;
  const defeated = !boss.alive;
  const stunned = boss.stunTimer > 0;
  const enraged = boss.hp <= 3 && boss.alive;

  ctx.save();

  // Flash white when stunned
  if (stunned && Math.floor(frameCount / 3) % 2 === 0) {
    ctx.globalAlpha = 0.6;
  }

  // Legs
  ctx.fillStyle = defeated ? '#5A4A30' : '#6B1A00';
  ctx.fillRect(sx + 8, drawY + eh - 20, 15, 20);
  ctx.fillRect(sx + ew - 23, drawY + eh - 20, 15, 20);
  // Body
  ctx.fillStyle = defeated ? '#6A4A30' : enraged ? '#AA3000' : '#8B2500';
  roundRect(sx + 2, drawY + 22, ew - 4, eh - 28, 6);
  ctx.fill();
  // Arms
  ctx.fillStyle = defeated ? '#5A3A20' : enraged ? '#9A2800' : '#7B2000';
  ctx.beginPath(); ctx.ellipse(sx - 14, drawY + 36, 12, 23, -0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx + ew + 14, drawY + 36, 12, 23, 0.22, 0, Math.PI * 2); ctx.fill();
  // Head
  ctx.fillStyle = defeated ? '#7A5A40' : enraged ? '#B83818' : '#A03010';
  ctx.beginPath(); ctx.ellipse(sx + ew / 2, drawY + 13, 24, 19, 0, 0, Math.PI * 2); ctx.fill();
  // Angry brow
  ctx.strokeStyle = defeated ? '#444' : '#400'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(sx + ew / 2 - 17, drawY + 4); ctx.lineTo(sx + ew / 2 - 5, drawY + 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx + ew / 2 + 17, drawY + 4); ctx.lineTo(sx + ew / 2 + 5, drawY + 10); ctx.stroke();

  if (defeated) {
    drawXEyes(sx, drawY, ew / 2 - 9, 13, ew / 2 + 9, 13);
  } else {
    // Eyes (glow brighter when enraged)
    ctx.shadowColor = enraged ? '#FF4400' : '#FF0000';
    ctx.shadowBlur = enraged ? 16 : 10;
    ctx.fillStyle = enraged ? '#FF4400' : '#FF2200';
    ctx.beginPath(); ctx.arc(sx + ew / 2 - 9, drawY + 13, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + ew / 2 + 9, drawY + 13, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = 1;

  // HP bar
  if (boss.alive && l5Phase === 'boss_fight') {
    const barW = 70, barH = 7;
    const barX = sx + ew / 2 - barW / 2;
    const barY = drawY - 22;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    const hpFrac = boss.hp / boss.maxHp;
    ctx.fillStyle = hpFrac > 0.5 ? '#44CC44' : hpFrac > 0.3 ? '#CCCC44' : '#CC4444';
    ctx.fillRect(barX, barY, barW * hpFrac, barH);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
  }

  // Label
  ctx.fillStyle = defeated ? '#8A6A50' : enraged ? '#FF6600' : '#FF4444';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(defeated ? 'DEFEATED' : enraged ? 'ENRAGED!' : 'STRONGMAN', sx + ew / 2, drawY - 28);

  ctx.restore();
}

function drawStarCage() {
  if (!starCage) return;
  const sx = Math.round(starCage.x - cameraX);
  const sy = Math.round(starCage.y);
  if (sx + 80 < 0 || sx - 20 > W) return;

  const cx = sx + 24, cy = sy + 20;
  ctx.save();

  if (starCage.broken) {
    // Freed Star — larger glow, happy face, rises slightly
    const rise = l5Phase === 'star_rescued' ? Math.min(20, (180 - l5Timer) * 0.15) : 20;
    const starY = cy - rise;
    const pulse = 1 + Math.sin(frameCount * 0.1) * 0.15;
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 30 * pulse;
    ctx.fillStyle = '#FFE900';
    drawStarShape(cx, starY, 24 * pulse, 11 * pulse);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FFFAAA';
    drawStarShape(cx, starY, 14 * pulse, 6 * pulse);
    ctx.fill();
    // Happy face
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx - 5, starY, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, starY, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, starY + 4, 4, 0.1, Math.PI - 0.1); ctx.stroke();
    // Name
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STAR', cx, starY - 18);

    // Scattered cage bars (broken)
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const bx = sx + i * 14 + (i % 2 ? 8 : -5);
      const angle = (i - 1.5) * 0.4;
      ctx.save();
      ctx.translate(bx, sy + 40);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -20);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // Cage with Star inside
    // Star (smaller, gentle bob)
    const bob = Math.sin(frameCount * 0.06) * 3;
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFE900';
    drawStarShape(cx, cy + bob, 14, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FFFAAA';
    drawStarShape(cx, cy + bob, 8, 3.5);
    ctx.fill();
    // Star eyes
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx - 3, cy + bob, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 3, cy + bob, 1.5, 0, Math.PI * 2); ctx.fill();

    // Cage bars
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const bx = sx + 4 + i * 10;
      ctx.beginPath();
      ctx.moveTo(bx, sy);
      ctx.lineTo(bx, sy + starCage.h);
      ctx.stroke();
    }
    // Horizontal bars
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + starCage.w, sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy + starCage.h); ctx.lineTo(sx + starCage.w, sy + starCage.h); ctx.stroke();
    // Star label
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STAR', cx, sy - 6);
  }
  ctx.restore();
}

function drawRockProjectiles() {
  ctx.save();
  for (const r of rockProjectiles) {
    const rx = r.x - cameraX;
    if (rx < -20 || rx > W + 20) continue;
    ctx.fillStyle = '#5A4030';
    ctx.beginPath();
    ctx.arc(rx, r.y, r.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3A2A1A';
    ctx.beginPath();
    ctx.arc(rx - 2, r.y - 2, r.size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShockwave() {
  if (!shockwave) return;
  ctx.save();
  const sx = shockwave.x - cameraX;
  const progress = 1 - (shockwave.timer / shockwave.maxTimer);
  const radius = progress * 80;
  const alpha = Math.max(0, 0.6 - progress * 0.6);
  ctx.strokeStyle = `rgba(255,140,0,${alpha})`;
  ctx.lineWidth = 4 - progress * 3;
  ctx.beginPath();
  ctx.arc(sx, GROUND_Y, radius, Math.PI, Math.PI * 2);
  ctx.stroke();
  // Ground crack lines
  ctx.strokeStyle = `rgba(255,80,0,${alpha * 0.7})`;
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    const lx = sx + i * 20 * progress;
    ctx.beginPath();
    ctx.moveTo(lx, GROUND_Y);
    ctx.lineTo(lx + i * 5, GROUND_Y + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawL5Overlay() {
  let msg = null, sub = null;
  if (l5Phase === 'salamander') {
    msg = 'The Lava Salamander speaks...';
    sub = 'Press Enter or Space to continue';
  } else if (l5Phase === 'boss_reveal') {
    msg = 'THE STRONGMAN EMERGES!';
    sub = 'Prepare for the final battle!';
  } else if (l5Phase === 'boss_fight') {
    const enraged = strongmanBoss.hp <= 3;
    msg = enraged ? `STRONGMAN (ENRAGED!)  HP: ${strongmanBoss.hp} / ${strongmanBoss.maxHp}` :
                    `STRONGMAN  HP: ${strongmanBoss.hp} / ${strongmanBoss.maxHp}`;
    sub = 'Hit him with the sword! [\u2193]';
  } else if (l5Phase === 'boss_defeated') {
    msg = 'THE STRONGMAN IS DEFEATED!';
    sub = 'Star is about to be freed!';
  } else if (l5Phase === 'star_rescued') {
    msg = 'STAR IS RESCUED!';
    sub = 'You did it! Reach the finish line!';
  }
  if (!msg) return;
  ctx.save();
  ctx.fillStyle = 'rgba(40,10,0,0.75)';
  roundRect(W / 2 - 230, H - 95, 460, 58, 8);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = l5Phase === 'star_rescued' ? '#FFD700' : l5Phase === 'boss_defeated' ? '#FF8844' : '#FF6644';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(msg, W / 2, H - 65);
  if (sub) {
    ctx.fillStyle = '#DDA080';
    ctx.font = '12px sans-serif';
    ctx.fillText(sub, W / 2, H - 47);
  }
  ctx.restore();
}

function drawVolcanicTint() {
  ctx.save();
  ctx.fillStyle = 'rgba(80,20,0,0.08)';
  ctx.fillRect(0, 0, W, H);
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

  // Mountains / Coral reefs
  ctx.fillStyle = ld.mountainColor;
  for (const m of ld.bgMountains) {
    const mx = m.x - cameraX * 0.35;
    if (currentLevel === 3) {
      // Branching coral silhouettes
      ctx.fillStyle = '#0A2A3A';
      ctx.beginPath();
      ctx.moveTo(mx - 60, GROUND_Y);
      ctx.lineTo(mx - 20, GROUND_Y - m.h * 0.7);
      ctx.lineTo(mx - 40, GROUND_Y - m.h);
      ctx.lineTo(mx - 10, GROUND_Y - m.h * 0.85);
      ctx.lineTo(mx + 10, GROUND_Y - m.h);
      ctx.lineTo(mx + 20, GROUND_Y - m.h * 0.6);
      ctx.lineTo(mx + 40, GROUND_Y - m.h * 0.8);
      ctx.lineTo(mx + 30, GROUND_Y - m.h * 0.5);
      ctx.lineTo(mx + 60, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    } else if (currentLevel === 4) {
      // Jagged volcanic rock shapes
      ctx.fillStyle = '#2A1008';
      ctx.beginPath();
      ctx.moveTo(mx - 80, GROUND_Y);
      ctx.lineTo(mx - 50, GROUND_Y - m.h * 0.5);
      ctx.lineTo(mx - 30, GROUND_Y - m.h * 0.7);
      ctx.lineTo(mx - 10, GROUND_Y - m.h);
      ctx.lineTo(mx + 15, GROUND_Y - m.h * 0.85);
      ctx.lineTo(mx + 30, GROUND_Y - m.h * 0.65);
      ctx.lineTo(mx + 55, GROUND_Y - m.h * 0.4);
      ctx.lineTo(mx + 80, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(mx - 130, GROUND_Y);
      ctx.lineTo(mx, GROUND_Y - m.h);
      ctx.lineTo(mx + 130, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Clouds / Bubble clusters
  if (currentLevel === 3) {
    // Bubble clusters instead of clouds
    for (const c of ld.clouds) {
      const cx = c.x - cameraX * 0.18;
      const s = c.s;
      ctx.strokeStyle = 'rgba(100,180,220,0.20)';
      ctx.fillStyle = 'rgba(100,180,220,0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const bx = cx + (i - 2) * 18 * s;
        const by = c.y + Math.sin(i * 1.7) * 8 * s;
        const br = (8 + i * 3) * s;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    }
  } else if (currentLevel === 4) {
    // Dark smoke clouds
    ctx.fillStyle = 'rgba(80,40,20,0.35)';
    for (const c of ld.clouds) {
      const cx = c.x - cameraX * 0.18;
      const s = c.s;
      ctx.beginPath();
      ctx.arc(cx,        c.y,       30*s, 0, Math.PI*2);
      ctx.arc(cx + 26*s, c.y-10*s,  22*s, 0, Math.PI*2);
      ctx.arc(cx + 52*s, c.y,       28*s, 0, Math.PI*2);
      ctx.fill();
    }
  } else {
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
}

function drawPlatforms() {
  const ld = levelData;
  const lvl = currentLevel;
  for (const pl of ld.platforms) {
    const sx = pl.x - cameraX;
    if (sx + pl.w < 0 || sx > W) continue;
    if (pl.isGround) {
      ctx.fillStyle = lvl === 1 ? '#3A5C35' : lvl === 2 ? '#1A3A1E' : lvl === 3 ? '#3A6A50' : lvl === 4 ? '#4A2A18' : '#4A7C3F';
      ctx.fillRect(sx, pl.y, pl.w, 14);
      ctx.fillStyle = lvl === 1 ? '#5A3820' : lvl === 2 ? '#201408' : lvl === 3 ? '#6A5830' : lvl === 4 ? '#2A1508' : '#7B4F28';
      ctx.fillRect(sx, pl.y + 14, pl.w, pl.h - 14);
    } else {
      ctx.fillStyle = lvl === 1 ? '#504848' : lvl === 2 ? '#282845' : lvl === 3 ? '#1A6060' : lvl === 4 ? '#5A3A28' : '#6E6E60';
      roundRect(sx, pl.y, pl.w, pl.h, 4);
      ctx.fill();
      ctx.fillStyle = lvl === 1 ? '#706060' : lvl === 2 ? '#404068' : lvl === 3 ? '#2A8080' : lvl === 4 ? '#7A5A40' : '#9A9A8A';
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
  const msg = playerMode === '1p' ? 'Axolotl rescued Star!' : 'Nugget & Axolotl rescued Star!';
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
  if (currentLevel === 3) { drawUnderwaterBG(); drawSeaweed(); }
  if (currentLevel === 4) { drawVolcanicBG(); drawLavaInGaps(); }
  drawPlatforms();
  drawPitWarnings();
  drawFinish();
  drawNuggetNPC();
  if (currentLevel === 2) { drawStarFriend(); drawStrongman(); drawBowPickup(); }
  if (currentLevel === 3) { drawBubbles(); drawShark(); drawGiantCrab(); }
  if (currentLevel === 4) { drawEmbers(); drawLavaSalamander(); drawStarCage(); drawStrongmanBoss(); drawRockProjectiles(); drawShockwave(); }

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
  if (currentLevel === 3) { drawL4Overlay(); drawUnderwaterTint(); }
  if (currentLevel === 4) { drawL5Overlay(); drawVolcanicTint(); }
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
