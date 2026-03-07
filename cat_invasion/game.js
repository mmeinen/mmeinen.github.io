const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 800, H = 600;

// Physics
const GRAVITY = 0.15;
const JUMP_FORCE = -9;
const MOVE_SPEED = 1;
const FRICTION = 0.85;
const PLAYER_W = 28, PLAYER_H = 32;
const ATTACK_DURATION = 12;
const ATTACK_COOLDOWN = 20;
const INVINCIBLE_FRAMES = 60;
const TRANSITION_FRAMES = 180;

// ── INPUT ────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!keys[k]) justPressed[k] = true;
  keys[k] = true;
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
let cheatBuf = '';
document.addEventListener('keydown', e => {
  if (e.key >= '0' && e.key <= '9') {
    cheatBuf += e.key;
    if (cheatBuf.length > 3) cheatBuf = cheatBuf.slice(-3);
    if (cheatBuf === '999' && gameState === 'playing') {
      cheatBuf = '';
      completeLevel();
    }
  } else { cheatBuf = ''; }
});

// ── STATE ────────────────────────────────────────────────────────────────────
let gameState = 'menu';
let currentLevel = 0;
let player = null;
let enemies = [];
let projectiles = [];
let collectibles = [];
let particles = [];
let cameraY = 0;
let transitionTimer = 0;
let frameCount = 0;
let score = 0;
let levelData = null;
let boss = null;
let bossFlashTimer = 0;

// ── LEVEL GENERATION HELPERS ─────────────────────────────────────────────────
function generatePlatforms(levelHeight, count, gapChance, minW, maxW) {
  const plats = [];
  // Floor
  plats.push({ x: 0, y: levelHeight - 20, w: W, h: 40 });
  const spacing = (levelHeight - 120) / count;
  for (let i = 0; i < count; i++) {
    const y = levelHeight - 60 - spacing * (i + 1);
    const pw = minW + Math.random() * (maxW - minW);
    const px = Math.random() * (W - pw);
    plats.push({ x: px, y: y, w: pw, h: 16 });
    // Add a second platform on some rows for wider coverage
    if (Math.random() > gapChance) {
      const pw2 = minW + Math.random() * (maxW - minW);
      const px2 = Math.random() * (W - pw2);
      if (Math.abs(px2 - px) > 60) {
        plats.push({ x: px2, y: y + (Math.random() - 0.5) * 30, w: pw2, h: 16 });
      }
    }
  }
  return plats;
}

function generateBgElements(theme, levelHeight) {
  const elems = [];
  const count = 8 + Math.floor(Math.random() * 8);
  for (let i = 0; i < count; i++) {
    elems.push({
      type: theme,
      x: Math.random() * W,
      y: Math.random() * levelHeight,
      size: 0.5 + Math.random() * 1.0,
    });
  }
  return elems;
}

// ── LEVEL DATA ───────────────────────────────────────────────────────────────
const LEVEL_DEFS = [
  // Level 1: Dungeon
  { levelHeight: 1200, finishY: 60, wallColor: '#1a1a3a', bgColor: '#0d0d25',
    floorName: 'FLOOR 1: DUNGEON', bgTheme: 'dungeon',
    storyText: 'Prince Puppy has been thrown into the dungeon!\nHe must climb the Evil Cat\'s tower to rescue the Princess!',
    platCount: 10, gapChance: 0.3, minW: 120, maxW: 200,
    enemyDefs: [
      { type: 'patrol', count: 1 },
    ],
    collectibleCount: 5, isBoss: false,
  },
  // Level 2: Cellars
  { levelHeight: 1400, finishY: 60, wallColor: '#1a1a40', bgColor: '#0a0a28',
    floorName: 'FLOOR 2: CELLARS', bgTheme: 'cellar',
    storyText: 'The cellars are damp and dark.\nWatch out for jumping cats!',
    platCount: 12, gapChance: 0.35, minW: 110, maxW: 180,
    enemyDefs: [
      { type: 'jumping', count: 1 },
    ],
    collectibleCount: 6, isBoss: false,
  },
  // Level 3: Kitchen
  { levelHeight: 1500, finishY: 60, wallColor: '#3a2a1a', bgColor: '#2a1a0a',
    floorName: 'FLOOR 3: KITCHEN', bgTheme: 'kitchen',
    storyText: 'The kitchen smells of fish... cat food!\nBeware the throwing cats!',
    platCount: 13, gapChance: 0.4, minW: 100, maxW: 170,
    enemyDefs: [
      { type: 'throwing', count: 1 },
    ],
    collectibleCount: 7, isBoss: false,
  },
  // Level 4: Armory
  { levelHeight: 1600, finishY: 60, wallColor: '#2a2a3a', bgColor: '#1a1a2a',
    floorName: 'FLOOR 4: ARMORY', bgTheme: 'armory',
    storyText: 'The armory is full of cat soldiers.\nArmored cats need two hits!',
    platCount: 14, gapChance: 0.4, minW: 90, maxW: 160,
    enemyDefs: [
      { type: 'armored', count: 1 },
    ],
    collectibleCount: 8, isBoss: false,
  },
  // Level 5: Great Hall
  { levelHeight: 1800, finishY: 60, wallColor: '#3a1a1a', bgColor: '#2a0a0a',
    floorName: 'FLOOR 5: GREAT HALL', bgTheme: 'hall',
    storyText: 'The great hall echoes with cat laughter.\nStay strong, Prince Puppy!',
    platCount: 16, gapChance: 0.35, minW: 100, maxW: 180,
    enemyDefs: [
      { type: 'fast', count: 1 },
    ],
    collectibleCount: 10, isBoss: false,
  },
  // Level 6: Kitchen
  { levelHeight: 1600, finishY: 60, wallColor: '#4a2a0a', bgColor: '#3a1a00',
    floorName: 'FLOOR 6: KITCHEN DEPTHS', bgTheme: 'kitchen',
    storyText: 'The kitchen depths are hot and dangerous.\nA fast cat guards the stairway!',
    platCount: 14, gapChance: 0.4, minW: 100, maxW: 170,
    enemyDefs: [
      { type: 'fast', count: 1 },
    ],
    collectibleCount: 6, isBoss: false,
  },
  // Level 7: Tower Gardens
  { levelHeight: 1800, finishY: 60, wallColor: '#1a2a3a', bgColor: '#0a1a2a',
    floorName: 'FLOOR 7: TOWER GARDENS', bgTheme: 'garden',
    storyText: 'The moonlit gardens are beautiful but dangerous.\nSwooping cats fly through the air!',
    platCount: 15, gapChance: 0.45, minW: 90, maxW: 160,
    enemyDefs: [
      { type: 'swooping', count: 1 },
    ],
    collectibleCount: 8, isBoss: false,
  },
  // Level 8: Haunted Gallery
  { levelHeight: 1800, finishY: 60, wallColor: '#2a1a3a', bgColor: '#1a0a2a',
    floorName: 'FLOOR 8: HAUNTED GALLERY', bgTheme: 'haunted',
    storyText: 'The gallery is full of ghostly paintings.\nGhost cats phase in and out!',
    platCount: 14, gapChance: 0.45, minW: 85, maxW: 155,
    enemyDefs: [
      { type: 'ghost', count: 1 },
    ],
    collectibleCount: 8, isBoss: false,
  },
  // Level 9: Guard Quarters
  { levelHeight: 1800, finishY: 60, wallColor: '#2a2a40', bgColor: '#1a1a30',
    floorName: 'FLOOR 9: GUARD QUARTERS', bgTheme: 'guards',
    storyText: 'The guards are on high alert!\nSpike cats can only be hit from behind!',
    platCount: 14, gapChance: 0.45, minW: 80, maxW: 150,
    enemyDefs: [
      { type: 'spike', count: 1 },
    ],
    collectibleCount: 8, isBoss: false,
  },
  // Level 10: Throne Approach
  { levelHeight: 2000, finishY: 60, wallColor: '#3a1a3a', bgColor: '#2a0a2a',
    floorName: 'FLOOR 10: THRONE APPROACH', bgTheme: 'throne',
    storyText: 'Almost there! The throne room approaches.\nEvery type of cat guard blocks the way!',
    platCount: 16, gapChance: 0.4, minW: 80, maxW: 160,
    enemyDefs: [
      { type: 'cannon', count: 1 },
    ],
    collectibleCount: 10, isBoss: false,
  },
  // Level 11: Guard Barracks
  { levelHeight: 2000, finishY: 60, wallColor: '#1a1a40', bgColor: '#0a0a30',
    floorName: 'FLOOR 11: GUARD BARRACKS', bgTheme: 'guards',
    storyText: 'The final guards stand between you and the Evil Cat!\nAlmost there!',
    platCount: 16, gapChance: 0.4, minW: 80, maxW: 160,
    enemyDefs: [
      { type: 'armored', count: 1 },
    ],
    collectibleCount: 8, isBoss: false,
  },
  // Level 12: Evil Cat's Lair — THE FINAL BOSS
  { levelHeight: 800, finishY: 60, wallColor: '#1a0a0a', bgColor: '#0a0000',
    floorName: 'FLOOR 12: EVIL CAT\'S LAIR', bgTheme: 'lair',
    storyText: 'The EVIL CAT awaits on his dark throne!\nThis is it — rescue the Princess!',
    platCount: 4, gapChance: 0.2, minW: 160, maxW: 250,
    enemyDefs: [],
    collectibleCount: 0, isBoss: true,
    bossType: 'evilcat', bossHp: 20,
  },
];

// ── INIT ─────────────────────────────────────────────────────────────────────
function initPlayer() {
  return {
    x: W / 2 - PLAYER_W / 2, y: 0,
    vx: 0, vy: 0,
    w: PLAYER_W, h: PLAYER_H,
    onGround: false,
    facingRight: true,
    attackTimer: 0,
    attackCooldown: 0,
    lives: 3,
    invincible: 0,
    dead: false,
    deathTimer: 0,
    walkFrame: 0,
    lastSafeX: 0, lastSafeY: 0,
  };
}

function startLevel(n) {
  currentLevel = n;
  const def = LEVEL_DEFS[n];
  // Generate platforms with a seeded random feel
  const savedRandom = Math.random;
  const platforms = generatePlatforms(def.levelHeight, def.platCount, def.gapChance, def.minW, def.maxW);
  const bgElements = generateBgElements(def.bgTheme, def.levelHeight);

  levelData = {
    ...def,
    platforms: platforms,
    bgElements: bgElements,
  };

  // Place player on bottom platform
  player.x = W / 2 - PLAYER_W / 2;
  player.y = def.levelHeight - 60 - PLAYER_H;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.attackTimer = 0;
  player.attackCooldown = 0;
  player.lives = 3;
  player.dead = false;
  player.deathTimer = 0;
  player.invincible = 30;
  player.lastSafeX = player.x;
  player.lastSafeY = player.y;

  cameraY = def.levelHeight - H;
  enemies = [];
  projectiles = [];
  collectibles = [];
  particles = [];
  boss = null;
  bossFlashTimer = 0;

  // Spawn enemies on platforms (skip floor platform)
  if (!def.isBoss) {
    const spawnPlatforms = platforms.filter((p, i) => i > 0 && p.y > 150);
    for (const eDef of def.enemyDefs) {
      for (let i = 0; i < eDef.count; i++) {
        if (spawnPlatforms.length === 0) break;
        const pi = Math.floor(Math.random() * spawnPlatforms.length);
        const plat = spawnPlatforms[pi];
        const e = createEnemy(eDef.type, plat.x + plat.w / 2, plat.y - 28, plat);
        enemies.push(e);
      }
    }
  } else {
    // Boss level
    boss = createBoss(def.bossType, def.bossHp);
  }

  // Spawn collectibles on platforms
  const collectPlatforms = platforms.filter((p, i) => i > 0 && p.y > 120);
  for (let i = 0; i < def.collectibleCount; i++) {
    if (collectPlatforms.length === 0) break;
    const pi = Math.floor(Math.random() * collectPlatforms.length);
    const plat = collectPlatforms[pi];
    collectibles.push({
      x: plat.x + Math.random() * (plat.w - 16),
      y: plat.y - 24,
      w: 16, h: 16,
      collected: false,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }
}

// ── ENEMY CREATION ───────────────────────────────────────────────────────────
function createEnemy(type, x, y, platform) {
  const base = {
    type: type,
    x: x, y: y,
    vx: 0, vy: 0,
    w: 24, h: 28,
    alive: true,
    facingRight: Math.random() > 0.5,
    platform: platform,
    hitFlash: 0,
    deathTimer: 0,
  };

  switch (type) {
    case 'patrol':
      return { ...base, speed: 1.2 };
    case 'jumping':
      return { ...base, speed: 1.2, jumpTimer: 60 + Math.floor(Math.random() * 60) };
    case 'fast':
      return { ...base, speed: 2.5, w: 22, h: 26 };
    case 'throwing':
      return { ...base, speed: 0, throwTimer: 90 + Math.floor(Math.random() * 60) };
    case 'armored':
      return { ...base, speed: 1.0, hp: 2, maxHp: 2 };
    case 'swooping':
      return { ...base, speed: 0, w: 26, h: 24, baseY: y, swoopPhase: Math.random() * Math.PI * 2, swoopAmplitude: 60 + Math.random() * 40, swoopSpeed: 0.03 + Math.random() * 0.02 };
    case 'ghost':
      return { ...base, speed: 1.0, visible: true, visTimer: 120 + Math.floor(Math.random() * 60), phaseTimer: 0 };
    case 'spike':
      return { ...base, speed: 1.0, shielded: true };
    case 'cannon':
      return { ...base, speed: 0, throwTimer: 120 + Math.floor(Math.random() * 60) };
    default:
      return { ...base, speed: 1.2 };
  }
}

function createBoss(type, hp) {
  const bx = W / 2;
  const by = levelData.levelHeight - 60 - 48;
  const base = {
    type: type,
    x: bx, y: by,
    vx: 0, vy: 0,
    w: 40, h: 48,
    hp: hp, maxHp: hp,
    alive: true,
    facingRight: false,
    phase: 0,
    attackState: 'idle',
    attackTimer: 60,
    stunTimer: 0,
    hitFlash: 0,
    deathTimer: 0,
    speed: 1.5,
    shockwave: null,
  };

  switch (type) {
    case 'kitchen':
      return { ...base, speed: 2.0 };
    case 'captain':
      return { ...base, speed: 1.8, w: 44, h: 52, summonTimer: 0 };
    case 'evilcat':
      return { ...base, speed: 2.5, w: 80, h: 96 };
    default:
      return base;
  }
}

// ── COLLISION ────────────────────────────────────────────────────────────────
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolvePlayerPlatforms() {
  player.onGround = false;
  for (const pl of levelData.platforms) {
    if (!overlaps(player, pl)) continue;

    const overlapLeft = (player.x + player.w) - pl.x;
    const overlapRight = (pl.x + pl.w) - player.x;
    const overlapTop = (player.y + player.h) - pl.y;
    const overlapBottom = (pl.y + pl.h) - player.y;

    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapTop && player.vy >= 0) {
      player.y = pl.y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else if (minOverlap === overlapBottom && player.vy < 0) {
      player.y = pl.y + pl.h;
      player.vy = 0;
    } else if (minOverlap === overlapLeft) {
      player.x = pl.x - player.w;
      player.vx = 0;
    } else if (minOverlap === overlapRight) {
      player.x = pl.x + pl.w;
      player.vx = 0;
    }
  }
}

// ── PLAYER UPDATE ────────────────────────────────────────────────────────────
function updatePlayer() {
  if (player.dead) {
    player.deathTimer++;
    if (player.deathTimer > 60) {
      player.lives--;
      if (player.lives <= 0) {
        gameState = 'gameover';
      } else {
        // Respawn
        player.dead = false;
        player.deathTimer = 0;
        player.x = player.lastSafeX;
        player.y = player.lastSafeY;
        player.vx = 0;
        player.vy = 0;
        player.invincible = INVINCIBLE_FRAMES;
      }
    }
    return;
  }

  // Movement
  const left = keys['arrowleft'] || keys['a'];
  const right = keys['arrowright'] || keys['d'];
  const jumpKey = keys['arrowup'] || keys['w'];
  const attackKey = justPressed[' '];

  if (left) {
    player.vx -= MOVE_SPEED * 0.3;
    player.facingRight = false;
  }
  if (right) {
    player.vx += MOVE_SPEED * 0.3;
    player.facingRight = true;
  }
  player.vx *= FRICTION;
  if (Math.abs(player.vx) < 0.1) player.vx = 0;

  // Jump
  if (jumpKey && player.onGround) {
    player.vy = JUMP_FORCE;
    player.onGround = false;
  }

  // Attack
  if (attackKey && player.attackTimer <= 0 && player.attackCooldown <= 0) {
    player.attackTimer = ATTACK_DURATION;
    player.attackCooldown = ATTACK_COOLDOWN;
  }
  if (player.attackTimer > 0) player.attackTimer--;
  if (player.attackCooldown > 0) player.attackCooldown--;
  if (player.invincible > 0) player.invincible--;

  // Gravity
  player.vy += GRAVITY;
  if (player.vy > 12) player.vy = 12;

  // Apply velocity
  player.x += player.vx;
  player.y += player.vy;

  // Wall bounds
  if (player.x < 0) { player.x = 0; player.vx = 0; }
  if (player.x + player.w > W) { player.x = W - player.w; player.vx = 0; }

  // Platform collision
  resolvePlayerPlatforms();

  // Track safe position
  if (player.onGround) {
    player.lastSafeX = player.x;
    player.lastSafeY = player.y;
  }

  // Walk animation
  if (Math.abs(player.vx) > 0.5 && player.onGround) {
    player.walkFrame += 0.15;
  }

  // Fall below camera = die
  if (player.y > cameraY + H + 50) {
    player.dead = true;
    player.deathTimer = 0;
  }

  // Check finish
  if (player.y < levelData.finishY && !levelData.isBoss) {
    completeLevel();
  }
  if (levelData.isBoss && boss && !boss.alive && boss.deathTimer > 90) {
    completeLevel();
  }

  // Attack hitbox
  if (player.attackTimer > 0) {
    const atkX = player.facingRight ? player.x + player.w : player.x - 20;
    const atkBox = { x: atkX, y: player.y + 4, w: 20, h: player.h - 8 };

    for (const e of enemies) {
      if (!e.alive || e.deathTimer > 0) continue;
      if (overlaps(atkBox, e)) {
        hitEnemy(e);
      }
    }
    if (boss && boss.alive && boss.stunTimer <= 0) {
      if (overlaps(atkBox, boss)) {
        hitBoss();
      }
    }
  }
}

function hitEnemy(e) {
  if (e.type === 'spike' && e.shielded) {
    // Can only hit from behind
    const behindRight = player.x < e.x && !e.facingRight;
    const behindLeft = player.x > e.x && e.facingRight;
    if (!behindRight && !behindLeft) {
      // Reflected - hurt player instead
      hurtPlayer();
      return;
    }
  }
  if (e.type === 'ghost' && !e.visible) return;

  if (e.type === 'armored') {
    e.hp--;
    e.hitFlash = 8;
    if (e.hp <= 0) {
      e.alive = false;
      e.deathTimer = 1;
      spawnDeathParticles(e.x + e.w / 2, e.y + e.h / 2, '#888');
      score += 20;
    }
  } else {
    e.alive = false;
    e.deathTimer = 1;
    spawnDeathParticles(e.x + e.w / 2, e.y + e.h / 2, '#f80');
    score += 10;
  }
}

function hitBoss() {
  boss.hp--;
  boss.hitFlash = 10;
  boss.stunTimer = 30;
  bossFlashTimer = 10;
  spawnDeathParticles(boss.x + boss.w / 2, boss.y + boss.h / 2, '#ff0');
  if (boss.hp <= 0) {
    boss.alive = false;
    boss.deathTimer = 1;
    score += 100;
    for (let i = 0; i < 20; i++) {
      spawnDeathParticles(boss.x + Math.random() * boss.w, boss.y + Math.random() * boss.h, '#ff0');
    }
  }
}

function hurtPlayer() {
  if (player.invincible > 0 || player.dead) return;
  player.invincible = INVINCIBLE_FRAMES;
  player.vy = -6;
  // Knockback
  player.vx = player.facingRight ? -4 : 4;
  player.lives--;
  if (player.lives <= 0) {
    player.dead = true;
    player.deathTimer = 0;
  }
}

function completeLevel() {
  if (currentLevel >= 11) {
    gameState = 'victory';
  } else {
    gameState = 'transition';
    transitionTimer = TRANSITION_FRAMES;
  }
}

function spawnDeathParticles(x, y, color) {
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6 - 2,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      color: color,
      size: 2 + Math.random() * 3,
    });
  }
}

// ── ENEMY UPDATE ─────────────────────────────────────────────────────────────
function updateEnemies() {
  for (const e of enemies) {
    if (!e.alive) {
      if (e.deathTimer > 0) e.deathTimer++;
      continue;
    }
    if (e.hitFlash > 0) e.hitFlash--;

    switch (e.type) {
      case 'patrol':
      case 'fast':
        updatePatrolEnemy(e);
        break;
      case 'jumping':
        updateJumpingEnemy(e);
        break;
      case 'throwing':
        updateThrowingEnemy(e);
        break;
      case 'armored':
        updatePatrolEnemy(e);
        break;
      case 'swooping':
        updateSwoopingEnemy(e);
        break;
      case 'ghost':
        updateGhostEnemy(e);
        break;
      case 'spike':
        updatePatrolEnemy(e);
        break;
      case 'cannon':
        updateCannonEnemy(e);
        break;
    }

    // Hurt player on contact
    if (e.alive && overlaps(player, e) && !player.dead) {
      if (e.type === 'ghost' && !e.visible) continue;
      hurtPlayer();
    }
  }
}

function updatePatrolEnemy(e) {
  if (!e.platform) return;
  const speed = e.speed;
  e.x += e.facingRight ? speed : -speed;
  if (e.x <= e.platform.x) { e.x = e.platform.x; e.facingRight = true; }
  if (e.x + e.w >= e.platform.x + e.platform.w) { e.x = e.platform.x + e.platform.w - e.w; e.facingRight = false; }
}

function updateJumpingEnemy(e) {
  updatePatrolEnemy(e);
  e.jumpTimer--;
  if (e.jumpTimer <= 0) {
    e.vy = -7;
    e.jumpTimer = 90 + Math.floor(Math.random() * 60);
  }
  e.vy += GRAVITY * 0.7;
  e.y += e.vy;
  if (e.platform && e.y + e.h > e.platform.y) {
    e.y = e.platform.y - e.h;
    e.vy = 0;
  }
}

function updateThrowingEnemy(e) {
  e.throwTimer--;
  // Face toward player
  e.facingRight = player.x > e.x;
  if (e.throwTimer <= 0) {
    e.throwTimer = 90 + Math.floor(Math.random() * 60);
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 400 && dist > 10) {
      projectiles.push({
        x: e.x + e.w / 2, y: e.y + e.h / 2,
        vx: (dx / dist) * 3,
        vy: (dy / dist) * 3,
        w: 8, h: 8,
        type: 'yarn',
        life: 120,
      });
    }
  }
}

function updateSwoopingEnemy(e) {
  e.swoopPhase += e.swoopSpeed;
  e.y = e.baseY + Math.sin(e.swoopPhase) * e.swoopAmplitude;
  e.x += Math.cos(e.swoopPhase * 0.7) * 1.5;
  if (e.x < 10) e.x = 10;
  if (e.x > W - e.w - 10) e.x = W - e.w - 10;
  e.facingRight = Math.cos(e.swoopPhase * 0.7) > 0;
}

function updateGhostEnemy(e) {
  updatePatrolEnemy(e);
  e.phaseTimer++;
  if (e.phaseTimer >= e.visTimer) {
    e.visible = !e.visible;
    e.phaseTimer = 0;
    e.visTimer = 60 + Math.floor(Math.random() * 90);
  }
}

function updateCannonEnemy(e) {
  e.throwTimer--;
  e.facingRight = player.x > e.x;
  if (e.throwTimer <= 0) {
    e.throwTimer = 120 + Math.floor(Math.random() * 60);
    const dx = player.x - e.x;
    const dy = player.y - e.y - 40;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 500 && dist > 10) {
      projectiles.push({
        x: e.x + e.w / 2, y: e.y,
        vx: (dx / dist) * 2.5,
        vy: -4,
        w: 12, h: 12,
        type: 'cannonball',
        life: 180,
        gravity: true,
      });
    }
  }
}

// ── BOSS UPDATE ──────────────────────────────────────────────────────────────
function updateBoss() {
  if (!boss || !boss.alive) {
    if (boss) boss.deathTimer++;
    return;
  }
  if (boss.hitFlash > 0) boss.hitFlash--;
  if (boss.stunTimer > 0) { boss.stunTimer--; return; }

  boss.attackTimer--;
  boss.facingRight = player.x > boss.x;

  switch (boss.type) {
    case 'kitchen': updateKitchenBoss(); break;
    case 'captain': updateCaptainBoss(); break;
    case 'evilcat': updateEvilCatBoss(); break;
  }

  // Boss collision hurts player
  if (boss.alive && overlaps(player, boss) && !player.dead) {
    hurtPlayer();
  }

  // Boss stays on floor
  boss.vy += GRAVITY;
  boss.y += boss.vy;
  for (const pl of levelData.platforms) {
    if (overlaps(boss, pl) && boss.vy >= 0) {
      boss.y = pl.y - boss.h;
      boss.vy = 0;
    }
  }
  if (boss.x < 10) boss.x = 10;
  if (boss.x + boss.w > W - 10) boss.x = W - boss.w - 10;
}

function updateKitchenBoss() {
  if (boss.attackTimer <= 0) {
    if (boss.attackState === 'idle') {
      if (Math.random() > 0.5) {
        boss.attackState = 'charge';
        boss.attackTimer = 60;
        boss.vx = boss.facingRight ? 5 : -5;
      } else {
        boss.attackState = 'throw';
        boss.attackTimer = 40;
      }
    } else if (boss.attackState === 'charge') {
      boss.attackState = 'idle';
      boss.attackTimer = 40;
      boss.vx = 0;
    } else if (boss.attackState === 'throw') {
      const dx = player.x - boss.x;
      const dy = player.y - boss.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      projectiles.push({
        x: boss.x + boss.w / 2, y: boss.y + boss.h / 2,
        vx: (dx / dist) * 4,
        vy: (dy / dist) * 4,
        w: 10, h: 10,
        type: 'yarn',
        life: 120,
      });
      boss.attackState = 'idle';
      boss.attackTimer = 50;
    }
  }
  boss.x += boss.vx;
  boss.vx *= 0.95;
}

function updateCaptainBoss() {
  if (boss.attackTimer <= 0) {
    const phase = boss.hp <= 3 ? 1 : 0;
    if (boss.attackState === 'idle') {
      const r = Math.random();
      if (r < 0.35) {
        boss.attackState = 'charge';
        boss.attackTimer = 50;
        boss.vx = boss.facingRight ? 6 : -6;
      } else if (r < 0.65) {
        boss.attackState = 'stomp';
        boss.attackTimer = 30;
        boss.vy = -8;
      } else {
        boss.attackState = 'summon';
        boss.attackTimer = 60;
      }
    } else if (boss.attackState === 'charge') {
      boss.attackState = 'idle';
      boss.attackTimer = 30 - phase * 10;
      boss.vx = 0;
    } else if (boss.attackState === 'stomp') {
      // Shockwave when landing
      if (boss.vy >= 0 && boss.y >= levelData.levelHeight - 60 - boss.h - 5) {
        boss.shockwave = { x: boss.x + boss.w / 2, y: boss.y + boss.h, radius: 0, maxRadius: 200 };
        boss.attackState = 'idle';
        boss.attackTimer = 40 - phase * 10;
      }
    } else if (boss.attackState === 'summon') {
      // Summon 1-2 patrol cats
      const count = phase ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const sx = boss.x + (Math.random() - 0.5) * 100;
        const plat = levelData.platforms[0]; // floor
        enemies.push(createEnemy('fast', sx, plat.y - 28, plat));
      }
      boss.attackState = 'idle';
      boss.attackTimer = 60 - phase * 15;
    }
  }
  boss.x += boss.vx;
  boss.vx *= 0.95;

  // Update shockwave
  if (boss.shockwave) {
    boss.shockwave.radius += 8;
    if (boss.shockwave.radius >= boss.shockwave.maxRadius) {
      boss.shockwave = null;
    } else {
      // Hurt player if in shockwave range and on ground
      const dx = player.x + player.w / 2 - boss.shockwave.x;
      if (Math.abs(dx) < boss.shockwave.radius + 20 && Math.abs(dx) > boss.shockwave.radius - 30 && player.onGround) {
        hurtPlayer();
      }
    }
  }
}

function updateEvilCatBoss() {
  const phase = boss.hp <= 6 ? 2 : boss.hp <= 13 ? 1 : 0;
  if (boss.attackTimer <= 0) {
    if (boss.attackState === 'idle') {
      const r = Math.random();
      if (r < 0.3) {
        boss.attackState = 'charge';
        boss.attackTimer = 40 - phase * 8;
        boss.vx = boss.facingRight ? (6 + phase) : -(6 + phase);
      } else if (r < 0.55) {
        boss.attackState = 'throw';
        boss.attackTimer = 20 - phase * 5;
      } else if (r < 0.75) {
        boss.attackState = 'stomp';
        boss.attackTimer = 30;
        boss.vy = -10;
      } else {
        boss.attackState = 'barrage';
        boss.attackTimer = 10;
        boss.barrageCount = 3 + phase;
      }
    } else if (boss.attackState === 'charge') {
      boss.attackState = 'idle';
      boss.attackTimer = 25 - phase * 5;
      boss.vx = 0;
    } else if (boss.attackState === 'throw') {
      const dx = player.x - boss.x;
      const dy = player.y - boss.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      projectiles.push({
        x: boss.x + boss.w / 2, y: boss.y + boss.h / 2,
        vx: (dx / dist) * (4 + phase),
        vy: (dy / dist) * (4 + phase),
        w: 10, h: 10,
        type: 'yarn',
        life: 120,
      });
      boss.attackState = 'idle';
      boss.attackTimer = 30 - phase * 8;
    } else if (boss.attackState === 'stomp') {
      if (boss.vy >= 0 && boss.y >= levelData.levelHeight - 60 - boss.h - 5) {
        boss.shockwave = { x: boss.x + boss.w / 2, y: boss.y + boss.h, radius: 0, maxRadius: 250 };
        boss.attackState = 'idle';
        boss.attackTimer = 30 - phase * 8;
      }
    } else if (boss.attackState === 'barrage') {
      // Fire projectile in spread
      for (let i = 0; i < 2 + phase; i++) {
        const angle = Math.atan2(player.y - boss.y, player.x - boss.x) + (Math.random() - 0.5) * 0.6;
        projectiles.push({
          x: boss.x + boss.w / 2, y: boss.y + boss.h / 2,
          vx: Math.cos(angle) * 4,
          vy: Math.sin(angle) * 4,
          w: 8, h: 8,
          type: 'yarn',
          life: 100,
        });
      }
      boss.barrageCount--;
      if (boss.barrageCount <= 0) {
        boss.attackState = 'idle';
        boss.attackTimer = 40 - phase * 10;
      } else {
        boss.attackTimer = 12;
      }
    }
  }
  boss.x += boss.vx;
  boss.vx *= 0.95;

  if (boss.shockwave) {
    boss.shockwave.radius += 8;
    if (boss.shockwave.radius >= boss.shockwave.maxRadius) {
      boss.shockwave = null;
    } else {
      const dx = player.x + player.w / 2 - boss.shockwave.x;
      if (Math.abs(dx) < boss.shockwave.radius + 20 && Math.abs(dx) > boss.shockwave.radius - 30 && player.onGround) {
        hurtPlayer();
      }
    }
  }
}

// ── PROJECTILE UPDATE ────────────────────────────────────────────────────────
function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx;
    p.y += p.vy;
    if (p.gravity) p.vy += 0.15;
    p.life--;
    if (p.life <= 0 || p.x < -20 || p.x > W + 20 || p.y > cameraY + H + 50) {
      projectiles.splice(i, 1);
      continue;
    }
    // Hurt player
    if (!player.dead && overlaps(player, p)) {
      hurtPlayer();
      projectiles.splice(i, 1);
    }
  }
}

// ── PARTICLE UPDATE ──────────────────────────────────────────────────────────
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ── CAMERA ───────────────────────────────────────────────────────────────────
function updateCamera() {
  const targetY = player.y - H * 0.4;
  const maxY = levelData.levelHeight - H;
  const minY = 0;
  const desired = Math.max(minY, Math.min(maxY, targetY));
  cameraY += (desired - cameraY) * 0.1;
}

// ── COLLECTIBLE UPDATE ───────────────────────────────────────────────────────
function updateCollectibles() {
  for (const c of collectibles) {
    if (c.collected) continue;
    c.bobPhase += 0.05;
    if (overlaps(player, { x: c.x, y: c.y + Math.sin(c.bobPhase) * 3, w: c.w, h: c.h })) {
      c.collected = true;
      score += 5;
      spawnDeathParticles(c.x + c.w / 2, c.y + c.h / 2, '#FFD700');
    }
  }
}

// ── DRAW FUNCTIONS ───────────────────────────────────────────────────────────
function drawBackground() {
  const def = levelData;
  // Gradient background
  const grad = ctx.createLinearGradient(0, -cameraY, 0, def.levelHeight - cameraY);
  grad.addColorStop(0, def.bgColor);
  grad.addColorStop(1, def.wallColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Background elements
  for (const el of def.bgElements) {
    const sy = el.y - cameraY;
    if (sy < -50 || sy > H + 50) continue;
    const sx = el.x;
    ctx.globalAlpha = 0.15;
    switch (el.type) {
      case 'dungeon':
      case 'cellar':
        drawTorch(sx, sy, el.size);
        break;
      case 'kitchen':
        drawShelf(sx, sy, el.size);
        break;
      case 'armory':
        drawBanner(sx, sy, el.size, '#666');
        break;
      case 'hall':
        drawBanner(sx, sy, el.size, '#800');
        break;
      case 'garden':
        drawTree(sx, sy, el.size);
        break;
      case 'haunted':
        drawCobweb(sx, sy, el.size);
        break;
      case 'guards':
        drawBanner(sx, sy, el.size, '#448');
        break;
      case 'throne':
        drawPillar(sx, sy, el.size);
        break;
      case 'lair':
        drawTorch(sx, sy, el.size);
        break;
    }
    ctx.globalAlpha = 1.0;
  }

  // Wall edges
  ctx.fillStyle = 'rgba(40,40,60,0.3)';
  ctx.fillRect(0, 0, 8, H);
  ctx.fillRect(W - 8, 0, 8, H);
}

function drawTorch(x, y, s) {
  ctx.fillStyle = '#654';
  ctx.fillRect(x - 2 * s, y, 4 * s, 20 * s);
  ctx.fillStyle = '#f80';
  ctx.beginPath();
  ctx.arc(x, y - 2 * s, 6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff0';
  ctx.beginPath();
  ctx.arc(x, y - 3 * s, 3 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawShelf(x, y, s) {
  ctx.fillStyle = '#654';
  ctx.fillRect(x - 15 * s, y, 30 * s, 3 * s);
  ctx.fillRect(x - 15 * s, y, 2 * s, 15 * s);
  ctx.fillRect(x + 13 * s, y, 2 * s, 15 * s);
}

function drawBanner(x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, y);
  ctx.lineTo(x + 8 * s, y);
  ctx.lineTo(x + 6 * s, y + 25 * s);
  ctx.lineTo(x, y + 20 * s);
  ctx.lineTo(x - 6 * s, y + 25 * s);
  ctx.closePath();
  ctx.fill();
}

function drawTree(x, y, s) {
  ctx.fillStyle = '#543';
  ctx.fillRect(x - 3 * s, y, 6 * s, 25 * s);
  ctx.fillStyle = '#2a5a2a';
  ctx.beginPath();
  ctx.arc(x, y - 5 * s, 15 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawCobweb(x, y, s) {
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 20 * s, y + Math.sin(a) * 20 * s);
    ctx.stroke();
  }
}

function drawPillar(x, y, s) {
  ctx.fillStyle = '#555';
  ctx.fillRect(x - 5 * s, y, 10 * s, 40 * s);
  ctx.fillRect(x - 8 * s, y, 16 * s, 4 * s);
  ctx.fillRect(x - 8 * s, y + 36 * s, 16 * s, 4 * s);
}

function drawPlatforms() {
  for (const pl of levelData.platforms) {
    const sy = pl.y - cameraY;
    if (sy > H + 10 || sy + pl.h < -10) continue;
    ctx.fillStyle = levelData.wallColor;
    ctx.fillRect(pl.x, sy, pl.w, pl.h);
    // Top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(pl.x, sy, pl.w, 2);
    // Bottom shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(pl.x, sy + pl.h - 2, pl.w, 2);
  }
}

// ── CHARACTER DRAWING ────────────────────────────────────────────────────────
function drawPrincePuppy(x, y, facingRight, walkFrame, attacking, invincible, dead) {
  const sy = y - cameraY;
  if (sy > H + 40 || sy < -40) return;

  ctx.save();
  if (invincible > 0 && Math.floor(invincible / 4) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  const cx = x + PLAYER_W / 2;
  const dir = facingRight ? 1 : -1;

  ctx.save();
  ctx.translate(cx, sy + PLAYER_H / 2);
  ctx.scale(dir, 1);

  // Body
  ctx.fillStyle = dead ? '#888' : '#D4A050';
  ctx.beginPath();
  ctx.ellipse(0, 2, 10, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = dead ? '#999' : '#E8B860';
  ctx.beginPath();
  ctx.arc(2, -10, 8, 0, Math.PI * 2);
  ctx.fill();

  // Ears (floppy)
  ctx.fillStyle = dead ? '#777' : '#C09040';
  ctx.beginPath();
  ctx.ellipse(-5, -16, 4, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7, -17, 4, 7, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  if (dead) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-1, -12); ctx.lineTo(3, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -12); ctx.lineTo(-1, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -12); ctx.lineTo(9, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9, -12); ctx.lineTo(5, -8); ctx.stroke();
  } else {
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(0, -10, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -11, 2, 0, Math.PI * 2);
    ctx.fill();
    // Nose
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(9, -8, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crown
  if (!dead) {
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(-5, -17);
    ctx.lineTo(-4, -22);
    ctx.lineTo(-1, -18);
    ctx.lineTo(2, -23);
    ctx.lineTo(5, -18);
    ctx.lineTo(8, -22);
    ctx.lineTo(9, -17);
    ctx.closePath();
    ctx.fill();
  }

  // Legs (animated)
  const legPhase = Math.sin(walkFrame) * 4;
  ctx.fillStyle = dead ? '#777' : '#C09040';
  ctx.fillRect(-6, 10 + (dead ? 0 : legPhase), 5, 6);
  ctx.fillRect(3, 10 + (dead ? 0 : -legPhase), 5, 6);

  // Tail (wagging)
  if (!dead) {
    const tailWag = Math.sin(frameCount * 0.15) * 15;
    ctx.strokeStyle = '#C09040';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    const tailAngle = (Math.PI + tailWag * Math.PI / 180);
    ctx.quadraticCurveTo(-16, -5 + Math.sin(frameCount * 0.15) * 3, -18, -3);
    ctx.stroke();
  }

  // Attack swipe — paw extends out
  if (attacking) {
    // Extended arm
    ctx.fillStyle = dead ? '#888' : '#D4A050';
    ctx.beginPath();
    ctx.ellipse(16, -2, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Paw
    ctx.fillStyle = dead ? '#999' : '#E8B860';
    ctx.beginPath();
    ctx.arc(24, -2, 5, 0, Math.PI * 2);
    ctx.fill();
    // Claws
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    for (let c = -1; c <= 1; c++) {
      ctx.beginPath();
      ctx.moveTo(28, -2 + c * 3);
      ctx.lineTo(33, -4 + c * 3);
      ctx.stroke();
    }
    // Swipe arcs
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(18, -2, 14, -0.8, 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(20, 0, 11, -0.5, 0.5);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

function drawCat(x, y, w, h, facingRight, color, accessories, alpha) {
  const sy = y - cameraY;
  if (sy > H + 40 || sy < -40) return;

  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;

  const cx = x + w / 2;
  const dir = facingRight ? 1 : -1;

  ctx.save();
  ctx.translate(cx, sy + h / 2);
  ctx.scale(dir, 1);

  const s = w / 24; // scale factor

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 2 * s, 10 * s, 11 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(2 * s, -9 * s, 7 * s, 0, Math.PI * 2);
  ctx.fill();

  // Pointed ears
  ctx.beginPath();
  ctx.moveTo(-4 * s, -14 * s);
  ctx.lineTo(-2 * s, -21 * s);
  ctx.lineTo(1 * s, -14 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4 * s, -14 * s);
  ctx.lineTo(7 * s, -21 * s);
  ctx.lineTo(9 * s, -14 * s);
  ctx.closePath();
  ctx.fill();

  // Inner ears
  ctx.fillStyle = '#faa';
  ctx.beginPath();
  ctx.moveTo(-3 * s, -14 * s);
  ctx.lineTo(-2 * s, -19 * s);
  ctx.lineTo(0, -14 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5 * s, -14 * s);
  ctx.lineTo(7 * s, -19 * s);
  ctx.lineTo(8 * s, -14 * s);
  ctx.closePath();
  ctx.fill();

  // Slit eyes
  ctx.fillStyle = '#ff0';
  ctx.beginPath();
  ctx.ellipse(0, -9 * s, 2 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(5 * s, -10 * s, 2 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(-0.5 * s, -12 * s, 1 * s, 6 * s);
  ctx.fillRect(4.5 * s, -13 * s, 1 * s, 6 * s);

  // Tail
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath();
  ctx.moveTo(-9 * s, 0);
  ctx.quadraticCurveTo(-15 * s, -8 * s, -12 * s, -14 * s);
  ctx.stroke();

  // Legs
  ctx.fillStyle = color;
  ctx.fillRect(-6 * s, 10 * s, 4 * s, 5 * s);
  ctx.fillRect(3 * s, 10 * s, 4 * s, 5 * s);

  // Accessories
  if (accessories) {
    if (accessories.armor) {
      ctx.fillStyle = 'rgba(160,160,180,0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 2 * s, 11 * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (accessories.spike) {
      ctx.fillStyle = '#888';
      // Shield in front
      ctx.beginPath();
      ctx.moveTo(8 * s, -6 * s);
      ctx.lineTo(14 * s, 0);
      ctx.lineTo(8 * s, 8 * s);
      ctx.closePath();
      ctx.fill();
    }
    if (accessories.wings) {
      ctx.fillStyle = 'rgba(100,100,150,0.5)';
      ctx.beginPath();
      ctx.ellipse(-8 * s, -2 * s, 12 * s, 6 * s, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (accessories.ghost) {
      // Ghostly glow
      ctx.fillStyle = 'rgba(180,180,255,0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, 16 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    if (accessories.cannon) {
      ctx.fillStyle = '#555';
      ctx.fillRect(6 * s, -2 * s, 10 * s, 5 * s);
    }
    if (accessories.crown) {
      ctx.fillStyle = '#c00';
      ctx.beginPath();
      ctx.moveTo(-5 * s, -20 * s);
      ctx.lineTo(-3 * s, -26 * s);
      ctx.lineTo(0, -21 * s);
      ctx.lineTo(3 * s, -27 * s);
      ctx.lineTo(5 * s, -21 * s);
      ctx.lineTo(8 * s, -26 * s);
      ctx.lineTo(10 * s, -20 * s);
      ctx.closePath();
      ctx.fill();
    }
    if (accessories.cape) {
      ctx.fillStyle = accessories.capeColor || '#600';
      ctx.beginPath();
      ctx.moveTo(-4 * s, -6 * s);
      ctx.quadraticCurveTo(-14 * s, 5 * s, -10 * s, 16 * s);
      ctx.lineTo(0, 12 * s);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
  ctx.restore();
}

function drawPrincessPuppy(x, y) {
  ctx.save();
  ctx.translate(x, y);

  // Body
  ctx.fillStyle = '#FFB3C6';
  ctx.beginPath();
  ctx.ellipse(0, 2, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#FFD4E0';
  ctx.beginPath();
  ctx.arc(0, -12, 10, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = '#FF85A2';
  ctx.beginPath();
  ctx.ellipse(-7, -20, 4, 7, -0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7, -20, 4, 7, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes with eyelashes
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(-3, -12, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3, -12, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyelashes
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(-7, -17); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-3, -15); ctx.lineTo(-3, -18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, -14); ctx.lineTo(7, -17); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3, -15); ctx.lineTo(3, -18); ctx.stroke();

  // Nose
  ctx.fillStyle = '#FF85A2';
  ctx.beginPath();
  ctx.arc(0, -9, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Tiara
  ctx.fillStyle = '#C0C0C0';
  ctx.beginPath();
  ctx.moveTo(-8, -20);
  ctx.lineTo(-6, -27);
  ctx.lineTo(-2, -22);
  ctx.lineTo(0, -28);
  ctx.lineTo(2, -22);
  ctx.lineTo(6, -27);
  ctx.lineTo(8, -20);
  ctx.closePath();
  ctx.fill();
  // Gem
  ctx.fillStyle = '#FF69B4';
  ctx.beginPath();
  ctx.arc(0, -24, 2, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#FF85A2';
  ctx.fillRect(-6, 12, 5, 6);
  ctx.fillRect(3, 12, 5, 6);

  ctx.restore();
}

function drawEvilCatBoss(x, y, w, h, facingRight, hp, maxHp, hitFlash, phase) {
  const accessories = {
    crown: true,
    cape: true,
    capeColor: phase >= 2 ? '#400' : '#600',
  };
  const color = hitFlash > 0 ? '#fff' : (phase >= 2 ? '#1a0000' : '#222');
  drawCat(x, y, w, h, facingRight, color, accessories);

  // Red glowing eyes for Evil Cat
  const sy = y - cameraY;
  const cx = x + w / 2;
  const dir = facingRight ? 1 : -1;
  const s = w / 24;
  ctx.save();
  ctx.translate(cx, sy + h / 2);
  ctx.scale(dir, 1);
  ctx.fillStyle = '#f00';
  ctx.beginPath();
  ctx.arc(0, -9 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(5 * s, -10 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(e) {
  if (!e.alive && e.deathTimer > 15) return;

  let color, accessories = {}, alpha = 1.0;

  switch (e.type) {
    case 'patrol': color = '#666'; break;
    case 'jumping': color = '#558'; break;
    case 'fast': color = '#855'; break;
    case 'throwing': color = '#585'; break;
    case 'armored': color = '#778'; accessories.armor = true; break;
    case 'swooping': color = '#557'; accessories.wings = true; break;
    case 'ghost':
      color = '#99b';
      accessories.ghost = true;
      alpha = e.visible ? 0.9 : 0.15;
      break;
    case 'spike': color = '#776'; accessories.spike = true; break;
    case 'cannon': color = '#665'; accessories.cannon = true; break;
    default: color = '#666';
  }

  if (e.hitFlash > 0) color = '#fff';

  drawCat(e.x, e.y, e.w, e.h, e.facingRight, color, accessories, alpha);
}

function drawBoss() {
  if (!boss) return;
  if (!boss.alive && boss.deathTimer > 60) return;

  const phase = boss.type === 'evilcat' ? (boss.hp <= 3 ? 2 : boss.hp <= 6 ? 1 : 0) : 0;

  if (boss.type === 'evilcat') {
    drawEvilCatBoss(boss.x, boss.y, boss.w, boss.h, boss.facingRight, boss.hp, boss.maxHp, boss.hitFlash, phase);
  } else {
    const color = boss.hitFlash > 0 ? '#fff' : (boss.type === 'captain' ? '#334' : '#543');
    const acc = {};
    if (boss.type === 'captain') { acc.armor = true; acc.crown = true; acc.capeColor = '#224'; acc.cape = true; }
    if (boss.type === 'kitchen') { acc.cape = true; acc.capeColor = '#420'; }
    drawCat(boss.x, boss.y, boss.w, boss.h, boss.facingRight, color, acc);
  }

  // Boss HP bar
  if (boss.alive) {
    const sy = boss.y - cameraY - 15;
    const barW = boss.w + 20;
    const barX = boss.x + boss.w / 2 - barW / 2;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, sy, barW, 6);
    const hpFrac = boss.hp / boss.maxHp;
    ctx.fillStyle = hpFrac > 0.5 ? '#0a0' : hpFrac > 0.25 ? '#aa0' : '#a00';
    ctx.fillRect(barX + 1, sy + 1, (barW - 2) * hpFrac, 4);
  }

  // Shockwave
  if (boss.shockwave) {
    const sw = boss.shockwave;
    const swy = sw.y - cameraY;
    ctx.strokeStyle = 'rgba(255,100,50,' + (1 - sw.radius / sw.maxRadius) * 0.8 + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sw.x - sw.radius, swy);
    ctx.lineTo(sw.x + sw.radius, swy);
    ctx.stroke();
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    const sy = p.y - cameraY;
    if (sy > H + 10 || sy < -10) continue;
    if (p.type === 'yarn') {
      ctx.fillStyle = '#c44';
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, sy + p.h / 2, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, sy + p.h / 2, p.w / 2 - 1, 0, Math.PI);
      ctx.stroke();
    } else if (p.type === 'cannonball') {
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, sy + p.h / 2, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCollectibles() {
  for (const c of collectibles) {
    if (c.collected) continue;
    const sy = c.y + Math.sin(c.bobPhase) * 3 - cameraY;
    if (sy > H + 10 || sy < -10) continue;
    // Bone treat
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(c.x + 4, sy + 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(c.x + 2, sy + 2, 12, 4);
    ctx.beginPath();
    ctx.arc(c.x + 12, sy + 4, 4, 0, Math.PI * 2);
    ctx.fill();
    // Sparkle
    ctx.fillStyle = '#fff';
    const sp = Math.sin(frameCount * 0.1 + c.bobPhase) * 0.5 + 0.5;
    ctx.globalAlpha = sp * 0.6;
    ctx.beginPath();
    ctx.arc(c.x + 8, sy + 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

function drawParticles() {
  for (const p of particles) {
    const sy = p.y - cameraY;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillRect(p.x - p.size / 2, sy - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1.0;
}

function drawHUD() {
  // Lives (hearts)
  for (let i = 0; i < player.lives; i++) {
    drawHeart(15 + i * 28, 15, 10, '#f44');
  }

  // Floor name
  ctx.fillStyle = 'rgba(60,140,255,0.9)';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(levelData.floorName, W / 2, 20);

  // Score
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('★ ' + score, W - 15, 20);
  ctx.textAlign = 'left';

  // Finish arrow at top when no boss
  if (!levelData.isBoss) {
    const arrowY = Math.max(10, levelData.finishY - cameraY);
    if (arrowY < H) {
      ctx.fillStyle = 'rgba(60,255,60,0.6)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▲ EXIT ▲', W / 2, arrowY);
      ctx.textAlign = 'left';
    }
    // Arrow indicator if exit is above screen
    if (levelData.finishY < cameraY) {
      ctx.fillStyle = 'rgba(60,255,60,0.5)';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 8, 35);
      ctx.lineTo(W / 2 + 8, 35);
      ctx.lineTo(W / 2, 28);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawHeart(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.bezierCurveTo(x, y, x - size, y, x - size, y + size * 0.3);
  ctx.bezierCurveTo(x - size, y + size * 0.7, x, y + size, x, y + size * 1.2);
  ctx.bezierCurveTo(x, y + size, x + size, y + size * 0.7, x + size, y + size * 0.3);
  ctx.bezierCurveTo(x + size, y, x, y, x, y + size * 0.3);
  ctx.fill();
}

// ── SCREEN DRAWING ───────────────────────────────────────────────────────────
function drawMenuScreen() {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);

  // Stars
  for (let i = 0; i < 50; i++) {
    const sx = (i * 137 + 50) % W;
    const sy = (i * 97 + 30) % H;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.sin(frameCount * 0.02 + i) * 0.3) + ')';
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Tower silhouette
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(W / 2 - 60, 120, 120, 350);
  ctx.fillRect(W / 2 - 70, 110, 140, 20);
  // Windows
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = '#FFD700';
    ctx.globalAlpha = 0.3 + Math.sin(frameCount * 0.05 + i) * 0.2;
    ctx.fillRect(W / 2 - 40, 150 + i * 50, 15, 20);
    ctx.fillRect(W / 2 + 25, 150 + i * 50, 15, 20);
  }
  ctx.globalAlpha = 1.0;

  // Title
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("CAT INVASION", W / 2, 60);

  ctx.fillStyle = '#aaa';
  ctx.font = '16px monospace';
  ctx.fillText('RESCUE THE PRINCESS PUPPY!', W / 2, 85);

  // Prince Puppy
  drawPrincePuppy(W / 2 - PLAYER_W / 2, 490, true, frameCount * 0.05, false, 0, false);

  // Princess in tower top window
  ctx.fillStyle = '#FF69B4';
  ctx.globalAlpha = 0.6 + Math.sin(frameCount * 0.03) * 0.3;
  ctx.beginPath();
  ctx.arc(W / 2, 135, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Start prompt
  const blink = Math.sin(frameCount * 0.06) > 0;
  if (blink) {
    ctx.fillStyle = 'rgba(60,140,255,0.9)';
    ctx.font = '18px monospace';
    ctx.fillText('PRESS ENTER TO START', W / 2, 560);
  }
  ctx.textAlign = 'left';
}

function drawTransitionScreen() {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(LEVEL_DEFS[currentLevel].floorName + ' COMPLETE!', W / 2, 150);

  // Progress bar
  ctx.fillStyle = '#333';
  ctx.fillRect(W / 2 - 150, 200, 300, 20);
  const progress = (currentLevel + 1) / 12;
  ctx.fillStyle = 'rgba(60,140,255,0.8)';
  ctx.fillRect(W / 2 - 149, 201, 298 * progress, 18);
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText('FLOOR ' + (currentLevel + 1) + ' / 12', W / 2, 215);

  // Story text for next level
  if (currentLevel + 1 < 12) {
    const nextDef = LEVEL_DEFS[currentLevel + 1];
    ctx.fillStyle = '#aaa';
    ctx.font = '14px monospace';
    const lines = nextDef.storyText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, 280 + i * 24);
    }
  }

  // Score
  ctx.fillStyle = '#FFD700';
  ctx.font = '16px monospace';
  ctx.fillText('SCORE: ' + score, W / 2, 370);

  // Continue prompt
  const blink = Math.sin(frameCount * 0.06) > 0;
  if (blink && transitionTimer <= 0) {
    ctx.fillStyle = 'rgba(60,140,255,0.9)';
    ctx.font = '16px monospace';
    ctx.fillText('PRESS ENTER TO CONTINUE', W / 2, 450);
  }
  ctx.textAlign = 'left';
}

function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(10,0,0,0.85)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#f44';
  ctx.font = 'bold 40px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', W / 2, 220);

  // Dead puppy
  drawPrincePuppy(W / 2 - PLAYER_W / 2, 280 + cameraY, true, 0, false, 0, true);

  ctx.fillStyle = '#aaa';
  ctx.font = '16px monospace';
  ctx.fillText('SCORE: ' + score, W / 2, 370);
  ctx.fillText('REACHED: ' + LEVEL_DEFS[currentLevel].floorName, W / 2, 400);

  const blink = Math.sin(frameCount * 0.06) > 0;
  if (blink) {
    ctx.fillStyle = 'rgba(60,140,255,0.9)';
    ctx.font = '16px monospace';
    ctx.fillText('R - RETRY LEVEL  |  M - MENU', W / 2, 480);
  }
  ctx.textAlign = 'left';
}

function drawVictoryScreen() {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);

  // Floating hearts
  for (let i = 0; i < 12; i++) {
    const hx = W / 2 + Math.sin(frameCount * 0.02 + i * 0.5) * 150;
    const hy = 100 + Math.cos(frameCount * 0.015 + i * 0.7) * 50 + i * 10;
    ctx.globalAlpha = 0.4 + Math.sin(frameCount * 0.03 + i) * 0.3;
    drawHeart(hx, hy, 8 + Math.sin(i) * 3, '#FF69B4');
  }
  ctx.globalAlpha = 1.0;

  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PRINCESS RESCUED!', W / 2, 80);

  // Prince and Princess side by side
  const princeCX = W / 2 - 40;
  const princessCX = W / 2 + 40;

  drawPrincePuppy(princeCX - PLAYER_W / 2, 350 + cameraY, true, frameCount * 0.05, false, 0, false);
  drawPrincessPuppy(princessCX, 350);

  // Heart between them
  const heartScale = 1 + Math.sin(frameCount * 0.08) * 0.2;
  ctx.save();
  ctx.translate(W / 2, 340);
  ctx.scale(heartScale, heartScale);
  drawHeart(0, 0, 12, '#f44');
  ctx.restore();

  ctx.fillStyle = '#aaa';
  ctx.font = '16px monospace';
  ctx.fillText('FINAL SCORE: ' + score, W / 2, 440);

  ctx.fillStyle = '#FFD700';
  ctx.font = '14px monospace';
  ctx.fillText('The Evil Cat has been defeated!', W / 2, 480);
  ctx.fillText('Prince Puppy and Princess Puppy are reunited!', W / 2, 504);

  const blink = Math.sin(frameCount * 0.06) > 0;
  if (blink) {
    ctx.fillStyle = 'rgba(60,140,255,0.9)';
    ctx.font = '16px monospace';
    ctx.fillText('PRESS M FOR MENU', W / 2, 560);
  }
  ctx.textAlign = 'left';
}

// ── MAIN LOOP ────────────────────────────────────────────────────────────────
function update() {
  frameCount++;

  switch (gameState) {
    case 'menu':
      if (justPressed['enter']) {
        player = initPlayer();
        score = 0;
        startLevel(0);
        gameState = 'playing';
      }
      break;

    case 'playing':
      updatePlayer();
      updateEnemies();
      updateBoss();
      updateProjectiles();
      updateCollectibles();
      updateParticles();
      updateCamera();
      break;

    case 'transition':
      transitionTimer--;
      if (transitionTimer <= 0 && justPressed['enter']) {
        startLevel(currentLevel + 1);
        gameState = 'playing';
      }
      break;

    case 'gameover':
      if (justPressed['r']) {
        player = initPlayer();
        startLevel(currentLevel);
        gameState = 'playing';
      }
      if (justPressed['m']) {
        gameState = 'menu';
      }
      break;

    case 'victory':
      if (justPressed['m']) {
        gameState = 'menu';
      }
      break;
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);

  switch (gameState) {
    case 'menu':
      drawMenuScreen();
      break;

    case 'playing':
      ctx.save();
      // Apply camera transform for game world
      drawBackground();
      drawPlatforms();
      drawCollectibles();
      drawProjectiles();
      for (const e of enemies) drawEnemy(e);
      drawBoss();
      drawPrincePuppy(player.x, player.y, player.facingRight, player.walkFrame,
        player.attackTimer > 0, player.invincible, player.dead);
      drawParticles();
      ctx.restore();
      drawHUD();
      break;

    case 'transition':
      drawTransitionScreen();
      break;

    case 'gameover':
      drawGameOverScreen();
      break;

    case 'victory':
      drawVictoryScreen();
      break;
  }
}

function gameLoop() {
  update();
  // Clear justPressed after update
  for (const k in justPressed) delete justPressed[k];
  render();
  requestAnimationFrame(gameLoop);
}

gameLoop();
