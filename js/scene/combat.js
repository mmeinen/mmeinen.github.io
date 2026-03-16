/* ---- Combat Entity System ---- */

/* Archetype definitions */
const ETYPE = { GRUNT: 0, SWARM: 1, BOMBER: 2, SNIPER: 3, CAPITAL: 4 };
const ARCHETYPE_COLORS = [
  [1.0, 0.314, 0.235, 1.0],  // Grunt: red (255,80,60)
  [1.0, 0.78, 0.15, 1.0],    // Swarm: yellow/amber
  [0.7, 0.2, 0.85, 1.0],     // Bomber: purple/magenta
  [0.0, 0.82, 0.82, 1.0],    // Sniper: cyan/teal
  [0.9, 0.9, 0.95, 1.0],     // Capital: white/silver
];
const ARCHETYPE_SCALES = [1.0, 1.0, 1.3, 1.2, 16.0]; // km-scale: Grunt=0.5km, Swarm=0.5km, Bomber=0.65km, Sniper=0.6km, Capital=8km
const ARCHETYPE_HP = [100, 30, 200, 60, 800]; // Swarm fragile, Capital beefy

/* Entity Store (Structure of Arrays) */
const MAX_ENEMIES = 64;

const enemies = {
  alive:   new Uint8Array(MAX_ENEMIES),
  posX:    new Float32Array(MAX_ENEMIES),
  posY:    new Float32Array(MAX_ENEMIES),
  posZ:    new Float32Array(MAX_ENEMIES),
  velX:    new Float32Array(MAX_ENEMIES),
  velZ:    new Float32Array(MAX_ENEMIES),
  heading: new Float32Array(MAX_ENEMIES),
  hp:      new Float32Array(MAX_ENEMIES),
  type:    new Uint8Array(MAX_ENEMIES),
  scale:   new Float32Array(MAX_ENEMIES),
  // AI state machine
  aiState:      new Uint8Array(MAX_ENEMIES),    // 0=idle,1=alert,2=transfer,3=attack,4=disengage,5=reorbit
  aiTimer:      new Float32Array(MAX_ENEMIES),
  assignBody:   new Int8Array(MAX_ENEMIES),     // planet index for station-keeping
  targetBody:   new Int8Array(MAX_ENEMIES),     // transfer destination
  hasFired:     new Uint8Array(MAX_ENEMIES),    // fired this attack pass?
  stationPhase: new Float32Array(MAX_ENEMIES),  // angle offset for station-keeping
  flash:        new Float32Array(MAX_ENEMIES),  // flash intensity [0-1]
  auxTimer:     new Float32Array(MAX_ENEMIES)   // archetype-specific timing
};

/* AI state constants */
const AI_IDLE=0, AI_ALERT=1, AI_TRANSFER=2, AI_ATTACK=3, AI_DISENGAGE=4, AI_REORBIT=5;

/* Instance buffer: 10 floats per instance (pos.xyz + heading + color.rgba + scale + flash) */
const ENEMY_INST_FLOATS = 10;
const instanceData = new Float32Array(MAX_ENEMIES * ENEMY_INST_FLOATS);

/* Free-list for O(1) slot allocation */
const freeSlots = [];
for (let i = MAX_ENEMIES - 1; i >= 0; i--) freeSlots.push(i);
let enemyCount = 0;

/**
 * Spawn an enemy at (x, y, z) of the given archetype type.
 * @param {number} assignBody - planet index for station-keeping (-1 if none)
 * @param {number} stationPhase - angle offset for station-keeping position
 * Returns the slot index, or -1 if the store is full.
 */
function spawnEnemy(x, y, z, type, assignBody, stationPhase) {
  if (freeSlots.length === 0) return -1;
  const idx = freeSlots.pop();
  enemies.alive[idx] = 1;
  enemies.posX[idx] = x;
  enemies.posY[idx] = y;
  enemies.posZ[idx] = z;
  enemies.velX[idx] = 0;
  enemies.velZ[idx] = 0;
  enemies.heading[idx] = 0;
  enemies.type[idx] = type;
  enemies.scale[idx] = ARCHETYPE_SCALES[type];
  enemies.hp[idx] = ARCHETYPE_HP[type];
  enemies.aiState[idx] = AI_IDLE;
  enemies.aiTimer[idx] = 0;
  enemies.assignBody[idx] = assignBody !== undefined ? assignBody : -1;
  enemies.targetBody[idx] = -1;
  enemies.hasFired[idx] = 0;
  enemies.stationPhase[idx] = stationPhase || 0;
  enemies.flash[idx] = 0;
  enemies.auxTimer[idx] = 10.0; // high initial value so first archetype trigger fires immediately
  enemyCount++;
  return idx;
}

/**
 * Remove an enemy by slot index, returning the slot to the free-list.
 */
function removeEnemy(idx) {
  if (!enemies.alive[idx]) return;
  enemies.alive[idx] = 0;
  enemies.aiState[idx] = 0;
  enemies.aiTimer[idx] = 0;
  enemies.assignBody[idx] = -1;
  enemies.targetBody[idx] = -1;
  enemies.hasFired[idx] = 0;
  enemies.stationPhase[idx] = 0;
  enemies.flash[idx] = 0;
  enemies.auxTimer[idx] = 0;
  freeSlots.push(idx);
  enemyCount--;
}

/* ---- Instance Buffer Packing ---- */

/**
 * Pack live entity data into instanceData for GPU upload, grouped by archetype type.
 * Layout per instance (10 floats): posX, posY, posZ, heading, colorR, colorG, colorB, colorA, scale, flash
 * Packs all Grunts first, then Swarms, Bombers, Snipers, Capitals.
 * @param {number} simTime - current simulation time (for low-HP flicker)
 * Returns {typeCounts: [gruntCount, swarmCount, bomberCount, sniperCount, capitalCount], totalCount}.
 */
const _typeCounts = [0, 0, 0, 0, 0];
function updateInstanceBuffer(simTime, camX, camY, camZ) {
  let offset = 0;
  _typeCounts[0] = _typeCounts[1] = _typeCounts[2] = _typeCounts[3] = _typeCounts[4] = 0;
  for (let t = 0; t < 5; t++) {
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!enemies.alive[i] || enemies.type[i] !== t) continue;
      const base = offset * ENEMY_INST_FLOATS;
      // CRR: subtract camera world position (float64 arithmetic) before float32 store
      instanceData[base]     = enemies.posX[i] - camX;
      instanceData[base + 1] = enemies.posY[i] - camY;
      instanceData[base + 2] = enemies.posZ[i] - camZ;
      instanceData[base + 3] = enemies.heading[i];
      const c = ARCHETYPE_COLORS[t];
      instanceData[base + 4] = c[0];
      instanceData[base + 5] = c[1];
      instanceData[base + 6] = c[2];
      // Low-HP flicker: below 30% HP, irregular alpha flicker
      let alpha = c[3];
      const hpRatio = enemies.hp[i] / ARCHETYPE_HP[t];
      if (hpRatio < 0.3) {
        const flicker = Math.sin(simTime * 15 + i * 7.3) * Math.sin(simTime * 23 + i * 13.1);
        alpha *= 0.3 + 0.7 * Math.max(0, flicker);
      }
      instanceData[base + 7] = alpha;
      // Capital warp-in scale ramp: auxTimer from -1.0 to -0.5 maps scale 0 to 1
      let finalScale = enemies.scale[i];
      if (t === ETYPE.CAPITAL && enemies.auxTimer[i] < 0) {
        const warpScale = Math.max(0, Math.min(1, (enemies.auxTimer[i] + 1.0) / 0.5));
        finalScale *= warpScale;
      }
      instanceData[base + 8] = finalScale;
      instanceData[base + 9] = enemies.flash[i];
      offset++;
      _typeCounts[t]++;
    }
  }
  return { typeCounts: _typeCounts, totalCount: offset };
}

/* ---- Radial Bin Collision Structure ---- */

const BIN_WIDTH = 10.0;
const NUM_BINS = 20;        // covers radius 0-200
const MAX_PER_BIN = 16;

const binCounts = new Uint8Array(NUM_BINS);
const binEntities = new Uint16Array(NUM_BINS * MAX_PER_BIN);

/**
 * Rebuild radial bins from alive enemy positions.
 * Bins by distance from origin on the XZ plane: bin = floor(r / BIN_WIDTH).
 */
function rebinEntities() {
  binCounts.fill(0);
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    const r = Math.sqrt(enemies.posX[i] * enemies.posX[i] + enemies.posZ[i] * enemies.posZ[i]);
    const bin = Math.min(Math.floor(r / BIN_WIDTH), NUM_BINS - 1);
    const cnt = binCounts[bin];
    if (cnt < MAX_PER_BIN) {
      binEntities[bin * MAX_PER_BIN + cnt] = i;
      binCounts[bin]++;
    }
  }
}

/**
 * Get collision candidate entity indices from the bin containing radius r
 * and its two adjacent bins.
 */
function getCollisionCandidates(r) {
  const bin = Math.min(Math.floor(r / BIN_WIDTH), NUM_BINS - 1);
  const candidates = [];
  const lo = Math.max(0, bin - 1);
  const hi = Math.min(NUM_BINS - 1, bin + 1);
  for (let b = lo; b <= hi; b++) {
    const off = b * MAX_PER_BIN;
    for (let j = 0; j < binCounts[b]; j++) {
      candidates.push(binEntities[off + j]);
    }
  }
  return candidates;
}

/* ---- Enemy AI State Machine ---- */

/* AI tuning constants (km-scale distances) */
const DETECT_RADIUS = 20000;          // km -- triggers alert
const DETECT_RADIUS_SQ = DETECT_RADIUS * DETECT_RADIUS;
const ALERT_PAUSE = 0.5;              // seconds -- unchanged
const ATTACK_RANGE = 7500;            // km -- transition to attack
const FIRE_RANGE = 5000;              // km -- weapons free
const DISENGAGE_DIST = 2500;          // km -- too close, break off
const REORBIT_DIST = 10000;           // km -- safe to circularize
const STATION_KEEP_ALT = 1500;        // km -- hover near planet surface
const GUIDANCE_ACCEL_ENEMY = 3000;    // km/s^2 -- mid-course correction
const ACCURACY_NOISE = 2000;          // km -- lead prediction scatter

/* Scratch arrays for vector calculations (avoid per-frame allocation) */
const _aiScratch = [0, 0, 0];

/**
 * Update enemy AI state machine for all alive enemies.
 * @param {number} simDt - scaled delta time
 * @param {number} simTime - current simulation time
 * @param {Float32Array} playerPos - player position [x,y,z]
 * @param {Float32Array} playerVel - player velocity [x,y,z]
 * @param {number} playerBody - body index player is nearest to
 */
function updateEnemyAI(simDt, simTime, playerPos, playerVel, playerBody) {
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;

    // Decay flash
    enemies.flash[i] = Math.max(0, enemies.flash[i] - simDt / 0.2);

    // Increment AI timer
    enemies.aiTimer[i] += simDt;

    // Increment auxTimer (Swarm ram cooldown, Bomber salvo reload, Sniper burst cooldown, Capital warp-in/spawn timer)
    enemies.auxTimer[i] += simDt;

    // Distance to player
    const dpx = playerPos[0] - enemies.posX[i];
    const dpz = playerPos[2] - enemies.posZ[i];
    const distSq = dpx * dpx + dpz * dpz;
    const dist = Math.sqrt(distSq);

    // Get wave-scaled archetype stats
    const stats = (typeof getArchetypeStats === 'function') ? getArchetypeStats(enemies.type[i], waveNumber) : null;
    const eType = enemies.type[i];

    switch (enemies.aiState[i]) {
      case AI_IDLE: {
        // Station-keeping: hover near assigned planet (km-scale positions)
        const bodyIdx = enemies.assignBody[i];
        if (bodyIdx >= 0 && bodyIdx < 7) {
          const bodyPos = getBodyPositionKm(bodyIdx, simTime);
          const bodyR = getBodyRadiusKm(bodyIdx);
          const stationR = bodyR + STATION_KEEP_ALT;
          const planetAngle = Math.atan2(bodyPos[0], bodyPos[2]);
          const angle = planetAngle + enemies.stationPhase[i];
          enemies.posX[i] = bodyPos[0] + stationR * Math.sin(angle);
          enemies.posZ[i] = bodyPos[2] + stationR * Math.cos(angle);
          enemies.posY[i] = 0;
          // Match body orbital velocity (km/s)
          const bv = getBodyVelocityKm(bodyIdx, simTime);
          enemies.velX[i] = bv[0];
          enemies.velZ[i] = bv[2];
          // Set heading from velocity
          const spd = Math.sqrt(bv[0] * bv[0] + bv[2] * bv[2]);
          if (spd > 1.0) enemies.heading[i] = Math.atan2(bv[0], bv[2]);
        }
        // Detect player proximity (wave-scaled detect radius)
        const detectR = stats ? stats.detectRadius : DETECT_RADIUS;
        if (distSq < detectR * detectR) {
          enemies.aiState[i] = AI_ALERT;
          enemies.aiTimer[i] = 0;
        }
        break;
      }

      case AI_ALERT: {
        // Brief pause before engaging (Swarm: 0.2s, Capital: 1.0s, others: 0.5s)
        let alertTime = ALERT_PAUSE;
        if (eType === ETYPE.SWARM) alertTime = 0.2;
        else if (eType === ETYPE.CAPITAL) alertTime = 1.0;
        if (enemies.aiTimer[i] >= alertTime) {
          // Capital skips TRANSFER -- goes straight to ATTACK (station-keeping)
          if (eType === ETYPE.CAPITAL) {
            enemies.aiState[i] = AI_ATTACK;
            enemies.aiTimer[i] = 0;
            enemies.hasFired[i] = 0;
            break;
          }
          // Determine target body (use player's current body or nearest planet)
          enemies.targetBody[i] = playerBody >= 0 ? playerBody : -1;
          // Compute transfer: vis-viva based impulse
          const er = Math.sqrt(enemies.posX[i] * enemies.posX[i] + enemies.posZ[i] * enemies.posZ[i]);
          const pr = Math.sqrt(playerPos[0] * playerPos[0] + playerPos[2] * playerPos[2]);
          const targetR = pr > 0.1 ? pr : er;
          const a_transfer = (er + targetR) / 2;
          const v_transfer = Math.sqrt(BH_GM_KM * (2 / er - 1 / Math.max(a_transfer, 1.0)));
          const v_current = Math.sqrt(enemies.velX[i] * enemies.velX[i] + enemies.velZ[i] * enemies.velZ[i]);
          const dv_burn = v_transfer - v_current;
          // Prograde direction
          const spd = v_current > 0.01 ? v_current : 1;
          const pdx = enemies.velX[i] / spd;
          const pdz = enemies.velZ[i] / spd;
          enemies.velX[i] += pdx * dv_burn;
          enemies.velZ[i] += pdz * dv_burn;
          enemies.aiState[i] = AI_TRANSFER;
          enemies.aiTimer[i] = 0;
          enemies.hasFired[i] = 0;
        }
        break;
      }

      case AI_TRANSFER: {
        // Capital should never be in TRANSFER -- redirect to ATTACK
        if (eType === ETYPE.CAPITAL) {
          enemies.aiState[i] = AI_ATTACK;
          enemies.aiTimer[i] = 0;
          break;
        }
        // Sniper: if already within FIRE_RANGE, skip to DISENGAGE (flee close range)
        if (eType === ETYPE.SNIPER && dist < FIRE_RANGE) {
          enemies.aiState[i] = AI_DISENGAGE;
          enemies.aiTimer[i] = 0;
          break;
        }
        // Gravity
        _aiScratch[0] = enemies.posX[i]; _aiScratch[1] = 0; _aiScratch[2] = enemies.posZ[i];
        const ga = computeGravAccel(_aiScratch);
        // Mid-course guidance: correction toward player
        let gx = 0, gz = 0;
        if (dist > 500) {
          const tdx = dpx / dist, tdz = dpz / dist;
          const espd = Math.sqrt(enemies.velX[i] * enemies.velX[i] + enemies.velZ[i] * enemies.velZ[i]);
          if (espd > 0.01) {
            const evdx = enemies.velX[i] / espd, evdz = enemies.velZ[i] / espd;
            const dot = evdx * tdx + evdz * tdz;
            const offCourse = Math.max(0, 1 - dot);
            // Swarm: 2x guidance; Bomber: 0.5x; Sniper: 0.3x (minimal approach)
            let guidanceMul = 1.0;
            if (eType === ETYPE.SWARM) guidanceMul = 2.0;
            else if (eType === ETYPE.BOMBER) guidanceMul = 0.5;
            else if (eType === ETYPE.SNIPER) guidanceMul = 0.3;
            gx = tdx * offCourse * GUIDANCE_ACCEL_ENEMY * guidanceMul;
            gz = tdz * offCourse * GUIDANCE_ACCEL_ENEMY * guidanceMul;
          }
          // Swarm: continuous thrust toward player for higher approach speed (km/s^2)
          if (eType === ETYPE.SWARM) {
            gx += tdx * 2000;
            gz += tdz * 2000;
          }
        }
        // Leapfrog integration
        enemies.velX[i] += (ga[0] + gx) * simDt;
        enemies.velZ[i] += (ga[2] + gz) * simDt;
        enemies.posX[i] += enemies.velX[i] * simDt;
        enemies.posZ[i] += enemies.velZ[i] * simDt;
        enemies.posY[i] = 0;
        // Update heading from velocity
        const tspd = Math.sqrt(enemies.velX[i] * enemies.velX[i] + enemies.velZ[i] * enemies.velZ[i]);
        if (tspd > 1.0) enemies.heading[i] = Math.atan2(enemies.velX[i], enemies.velZ[i]);
        // Transition: Swarm stays in transfer until very close (dist < 3.0)
        // Bomber transitions at stats.attackRange (medium range)
        // Sniper transitions at stats.attackRange (extreme range)
        // Default (Grunt/others) at ATTACK_RANGE
        if (eType === ETYPE.SWARM) {
          if (dist < DISENGAGE_DIST) {
            enemies.aiState[i] = AI_ATTACK;
            enemies.aiTimer[i] = 0;
          }
        } else {
          const atkRange = ((eType === ETYPE.BOMBER || eType === ETYPE.SNIPER) && stats) ? stats.attackRange : ATTACK_RANGE;
          if (dist < atkRange) {
            enemies.aiState[i] = AI_ATTACK;
            enemies.aiTimer[i] = 0;
          }
        }
        break;
      }

      case AI_ATTACK: {
        if (eType === ETYPE.SWARM) {
          // ---- SWARM ATTACK: ram damage, no ranged weapons ----
          // Continue physics with gravity + thrust toward player
          _aiScratch[0] = enemies.posX[i]; _aiScratch[1] = 0; _aiScratch[2] = enemies.posZ[i];
          const gaS = computeGravAccel(_aiScratch);
          // Always accelerate toward player (rush behavior) -- km/s^2
          let rushX = 0, rushZ = 0;
          if (dist > 10) {
            rushX = (dpx / dist) * 2000;
            rushZ = (dpz / dist) * 2000;
          }
          enemies.velX[i] += (gaS[0] + rushX) * simDt;
          enemies.velZ[i] += (gaS[2] + rushZ) * simDt;
          enemies.posX[i] += enemies.velX[i] * simDt;
          enemies.posZ[i] += enemies.velZ[i] * simDt;
          enemies.posY[i] = 0;
          // Update heading toward player
          if (dist > 10) enemies.heading[i] = Math.atan2(dpx, dpz);
          // Ram damage on close proximity (km-scale)
          if (dist < 500) {
            const ramCooldown = stats ? stats.attackCooldown : 0.5;
            if (enemies.auxTimer[i] >= ramCooldown) {
              if (typeof applyPlayerDamage === 'function') applyPlayerDamage(15);
              enemies.auxTimer[i] = 0;
              enemies.flash[i] = 0.5;
              if (typeof spawnImpactParticles === 'function') spawnImpactParticles(enemies.posX[i], enemies.posZ[i], ETYPE.SWARM);
            }
          }
          // Disengage: player moved away after ram, or timeout without ram
          if (dist > ATTACK_RANGE || (enemies.aiTimer[i] > 3.0 && enemies.auxTimer[i] > 0.5)) {
            enemies.aiState[i] = AI_DISENGAGE;
            enemies.aiTimer[i] = 0;
          }
        } else if (eType === ETYPE.BOMBER) {
          // ---- BOMBER ATTACK: hold position, fire missile salvos ----
          // Gravity + braking to hold position at medium range
          _aiScratch[0] = enemies.posX[i]; _aiScratch[1] = 0; _aiScratch[2] = enemies.posZ[i];
          const gaB = computeGravAccel(_aiScratch);
          enemies.velX[i] *= 0.98; // braking force
          enemies.velZ[i] *= 0.98;
          enemies.velX[i] += gaB[0] * simDt;
          enemies.velZ[i] += gaB[2] * simDt;
          enemies.posX[i] += enemies.velX[i] * simDt;
          enemies.posZ[i] += enemies.velZ[i] * simDt;
          enemies.posY[i] = 0;
          // Update heading toward player
          if (dist > 10) enemies.heading[i] = Math.atan2(dpx, dpz);
          // Fire missile salvo when cooldown is met
          const salvoCooldown = stats ? stats.attackCooldown : 3.0;
          if (enemies.auxTimer[i] >= salvoCooldown) {
            // Fire 3-missile salvo with angular spread
            if (typeof enemyFireMissile === 'function') {
              for (let m = 0; m < 3; m++) {
                const mIdx = enemyFireMissile(i);
                if (mIdx >= 0) {
                  // Add angular spread: -5, 0, +5 degrees
                  const spreadAngle = (m - 1) * (5.0 * Math.PI / 180.0);
                  if (spreadAngle !== 0) {
                    const cosA = Math.cos(spreadAngle), sinA = Math.sin(spreadAngle);
                    const ovx = missile.velX[mIdx], ovz = missile.velZ[mIdx];
                    missile.velX[mIdx] = ovx * cosA - ovz * sinA;
                    missile.velZ[mIdx] = ovx * sinA + ovz * cosA;
                  }
                }
              }
            }
            enemies.auxTimer[i] = 0;
            enemies.hasFired[i] = 1;
            if (typeof spawnExplosion === 'function') spawnExplosion(enemies.posX[i], 0, enemies.posZ[i], 300);
          }
          // Disengage: player closing in, or after firing + timeout
          if (dist < FIRE_RANGE || (enemies.hasFired[i] && enemies.aiTimer[i] > 3.0)) {
            enemies.aiState[i] = AI_DISENGAGE;
            enemies.aiTimer[i] = 0;
          }
        } else if (eType === ETYPE.SNIPER) {
          // ---- SNIPER ATTACK: extreme range burst fire, maintain distance ----
          // Continue physics (gravity + leapfrog)
          _aiScratch[0] = enemies.posX[i]; _aiScratch[1] = 0; _aiScratch[2] = enemies.posZ[i];
          const gaSnp = computeGravAccel(_aiScratch);
          enemies.velX[i] += gaSnp[0] * simDt;
          enemies.velZ[i] += gaSnp[2] * simDt;
          // Mild retrograde thrust to maintain distance if player closes in (km/s^2)
          if (dist < 15000 && dist > 10) {
            const awayX = -dpx / dist, awayZ = -dpz / dist;
            enemies.velX[i] += awayX * 500 * simDt;
            enemies.velZ[i] += awayZ * 500 * simDt;
          }
          enemies.posX[i] += enemies.velX[i] * simDt;
          enemies.posZ[i] += enemies.velZ[i] * simDt;
          enemies.posY[i] = 0;
          // Keep heading aimed at player
          if (dist > 10) enemies.heading[i] = Math.atan2(dpx, dpz);
          // Burst fire on cooldown
          const sniperCooldown = stats ? stats.attackCooldown : 2.0;
          if (enemies.auxTimer[i] >= sniperCooldown) {
            if (typeof enemySniperBurst === 'function') {
              enemySniperBurst(i, playerPos, playerVel, stats ? stats.accuracyNoise : 2.0);
            }
            enemies.auxTimer[i] = 0;
            enemies.hasFired[i] = 1;
          }
          // If player closes within fireRange, flee immediately
          const sniperFleeR = stats ? stats.fireRange : FIRE_RANGE;
          if (dist < sniperFleeR) {
            enemies.aiState[i] = AI_DISENGAGE;
            enemies.aiTimer[i] = 0;
          }
        } else if (eType === ETYPE.CAPITAL) {
          // ---- CAPITAL ATTACK: station-keep, spawn minions, heavy shots ----
          // Store old auxTimer for threshold crossing detection
          const oldAux = enemies.auxTimer[i] - simDt; // approximate previous value
          // If auxTimer < 0: Capital is still warping in, do station-keeping only
          if (enemies.auxTimer[i] < 0) {
            // Station-keep at assigned body during warp-in
            const capBody = enemies.assignBody[i];
            if (capBody >= 0 && capBody < 7) {
              const bodyP = getBodyPositionKm(capBody, simTime);
              const bodyRc = getBodyRadiusKm(capBody);
              const stR = bodyRc + STATION_KEEP_ALT;
              const pAngle = Math.atan2(bodyP[0], bodyP[2]);
              const aangle = pAngle + enemies.stationPhase[i];
              enemies.posX[i] = bodyP[0] + stR * Math.sin(aangle);
              enemies.posZ[i] = bodyP[2] + stR * Math.cos(aangle);
              enemies.posY[i] = 0;
              const bvel = getBodyVelocityKm(capBody, simTime);
              enemies.velX[i] = bvel[0];
              enemies.velZ[i] = bvel[2];
            }
            // Aim at player during warp-in
            if (dist > 10) enemies.heading[i] = Math.atan2(dpx, dpz);
            break; // Skip all combat actions during warp-in
          }
          // auxTimer >= 0: Capital is fully materialized
          // Station-keep at assigned body
          const capBody2 = enemies.assignBody[i];
          if (capBody2 >= 0 && capBody2 < 7) {
            const bodyP2 = getBodyPositionKm(capBody2, simTime);
            const bodyR2 = getBodyRadiusKm(capBody2);
            const stR2 = bodyR2 + STATION_KEEP_ALT;
            const pAngle2 = Math.atan2(bodyP2[0], bodyP2[2]);
            const aangle2 = pAngle2 + enemies.stationPhase[i];
            enemies.posX[i] = bodyP2[0] + stR2 * Math.sin(aangle2);
            enemies.posZ[i] = bodyP2[2] + stR2 * Math.cos(aangle2);
            enemies.posY[i] = 0;
            const bvel2 = getBodyVelocityKm(capBody2, simTime);
            enemies.velX[i] = bvel2[0];
            enemies.velZ[i] = bvel2[2];
          }
          // Aim at player
          if (dist > 10) enemies.heading[i] = Math.atan2(dpx, dpz);
          // Heavy shot: fire when auxTimer crosses 5.0 on its way to attackCooldown
          const capCooldown = stats ? stats.attackCooldown : 5.0;
          if (oldAux < capCooldown * 0.5 && enemies.auxTimer[i] >= capCooldown * 0.5) {
            if (typeof enemyFireAt === 'function') {
              enemyFireAt(i, playerPos, playerVel);
              if (typeof spawnExplosion === 'function') spawnExplosion(enemies.posX[i], 0, enemies.posZ[i], 500);
            }
          }
          // Minion spawning: when auxTimer >= attackCooldown
          if (enemies.auxTimer[i] >= capCooldown) {
            const minionCount = 2 + Math.floor(Math.random() * 2); // 2-3 minions
            for (let m = 0; m < minionCount; m++) {
              if (freeSlots.length === 0) break;
              const mAngle = Math.random() * Math.PI * 2;
              const mx = enemies.posX[i] + Math.cos(mAngle) * 2000;
              const mz = enemies.posZ[i] + Math.sin(mAngle) * 2000;
              const mIdx = spawnEnemy(mx, 0, mz, ETYPE.GRUNT, -1, 0);
              if (mIdx >= 0) {
                enemies.aiState[mIdx] = AI_ALERT;
                enemies.aiTimer[mIdx] = 0.5;
              }
            }
            enemies.auxTimer[i] = 0;
            // Hangar bay launch flash (km-scale visual)
            if (typeof spawnExplosion === 'function') spawnExplosion(enemies.posX[i], 0, enemies.posZ[i], 800);
          }
          // Capital does NOT disengage or reorbit -- stays in ATTACK until killed
        } else {
          // ---- GRUNT: default attack behavior ----
          // Continue physics (gravity + leapfrog, no guidance)
          _aiScratch[0] = enemies.posX[i]; _aiScratch[1] = 0; _aiScratch[2] = enemies.posZ[i];
          const ga2 = computeGravAccel(_aiScratch);
          enemies.velX[i] += ga2[0] * simDt;
          enemies.velZ[i] += ga2[2] * simDt;
          enemies.posX[i] += enemies.velX[i] * simDt;
          enemies.posZ[i] += enemies.velZ[i] * simDt;
          enemies.posY[i] = 0;
          // Update heading toward player
          if (dist > 10) enemies.heading[i] = Math.atan2(dpx, dpz);
          // Fire if close enough and hasn't fired yet
          const fRange = stats ? stats.fireRange : FIRE_RANGE;
          if (!enemies.hasFired[i] && dist < fRange) {
            enemyFireAt(i, playerPos, playerVel);
            enemies.hasFired[i] = 1;
            spawnExplosion(enemies.posX[i], 0, enemies.posZ[i], 200); // muzzle flash
          }
          // Disengage condition
          if (dist < DISENGAGE_DIST || (enemies.hasFired[i] && enemies.aiTimer[i] > 1.0)) {
            enemies.aiState[i] = AI_DISENGAGE;
            enemies.aiTimer[i] = 0;
          }
        }
        break;
      }

      case AI_DISENGAGE: {
        // Capital does not disengage; redirect to ATTACK
        if (eType === ETYPE.CAPITAL) {
          enemies.aiState[i] = AI_ATTACK;
          enemies.aiTimer[i] = 0;
          break;
        }
        // First frame: reduce speed (retrograde impulse)
        if (enemies.aiTimer[i] < simDt * 1.5) {
          // Sniper flees fastest (0.5x), Bomber (0.6x), others normal (0.8x)
          let retro = 0.8;
          if (eType === ETYPE.SNIPER) retro = 0.5;
          else if (eType === ETYPE.BOMBER) retro = 0.6;
          enemies.velX[i] *= retro;
          enemies.velZ[i] *= retro;
        }
        // Continue physics
        _aiScratch[0] = enemies.posX[i]; _aiScratch[1] = 0; _aiScratch[2] = enemies.posZ[i];
        const ga3 = computeGravAccel(_aiScratch);
        enemies.velX[i] += ga3[0] * simDt;
        enemies.velZ[i] += ga3[2] * simDt;
        enemies.posX[i] += enemies.velX[i] * simDt;
        enemies.posZ[i] += enemies.velZ[i] * simDt;
        enemies.posY[i] = 0;
        // Update heading
        const dspd = Math.sqrt(enemies.velX[i] * enemies.velX[i] + enemies.velZ[i] * enemies.velZ[i]);
        if (dspd > 1.0) enemies.heading[i] = Math.atan2(enemies.velX[i], enemies.velZ[i]);
        // Transition to reorbit: Sniper 17500, Bomber 15000, others at REORBIT_DIST (10000)
        let reorbitR = REORBIT_DIST;
        if (eType === ETYPE.SNIPER) reorbitR = 17500;
        else if (eType === ETYPE.BOMBER) reorbitR = 15000;
        if (dist > reorbitR || enemies.aiTimer[i] > 3.0) {
          enemies.aiState[i] = AI_REORBIT;
          enemies.aiTimer[i] = 0;
        }
        break;
      }

      case AI_REORBIT: {
        // Circularize: compute circular velocity at current radius (km-scale)
        const er2 = Math.sqrt(enemies.posX[i] * enemies.posX[i] + enemies.posZ[i] * enemies.posZ[i]);
        if (er2 > 100) {
          const vCirc = Math.sqrt(BH_GM_KM / er2);
          // Tangent direction (prograde)
          const tx = -enemies.posZ[i] / er2, tz = enemies.posX[i] / er2;
          enemies.velX[i] = tx * vCirc;
          enemies.velZ[i] = tz * vCirc;
        }
        // Immediately transition back to attack for another pass
        enemies.aiState[i] = AI_ATTACK;
        enemies.aiTimer[i] = 0;
        enemies.hasFired[i] = 0;
        break;
      }
    }

    // BH despawn: if enemy falls into black hole (km-scale)
    const er = enemies.posX[i] * enemies.posX[i] + enemies.posZ[i] * enemies.posZ[i];
    if (er < BH_RADIUS_KM * BH_RADIUS_KM) {
      removeEnemy(i);
    }
  }
}
