/* ---- Missile System (SoA Store) ---- */

/* Constants (km-scale: speeds in km/s, distances in km, thrust in km/s^2) */
const MAX_MISSILES_ACTIVE = 24;
const MISSILE_THRUST = 2000;          // km/s^2 acceleration
const MISSILE_NAV_GAIN = 3.0;         // dimensionless proportional nav gain
const MISSILE_DET_RADIUS = 300;       // km -- proximity fuse detonation
const MISSILE_FUEL_REGULAR = 5.0;     // seconds (~15,000 km powered range)
const MISSILE_FUEL_NUKE = 8.0;        // seconds (~24,000 km powered range)
const MISSILE_COAST_DURATION = 1.5;   // seconds -- unchanged
const MISSILE_SPEED = 3000;           // km/s initial velocity
const NUKE_MISSILE_SPEED = 2500;      // km/s initial velocity
const MISSILE_COOLDOWN_REGULAR = 3.0; // seconds -- unchanged
const MISSILE_COOLDOWN_NUKE = 8.0;    // seconds -- unchanged
const MISSILE_HALF = [15, 4, 4];      // km -- missile visual half-extents
const MISSILE_COLOR = [0.85, 0.35, 0.15];
const NUKE_MISSILE_COLOR = [0.95, 0.85, 0.75];

/* SoA missile store */
const missile = {
  alive:     new Uint8Array(MAX_MISSILES_ACTIVE),
  posX:      new Float32Array(MAX_MISSILES_ACTIVE),
  posZ:      new Float32Array(MAX_MISSILES_ACTIVE),
  velX:      new Float32Array(MAX_MISSILES_ACTIVE),
  velZ:      new Float32Array(MAX_MISSILES_ACTIVE),
  fwdX:      new Float32Array(MAX_MISSILES_ACTIVE),
  fwdZ:      new Float32Array(MAX_MISSILES_ACTIVE),
  fuel:      new Float32Array(MAX_MISSILES_ACTIVE),
  age:       new Float32Array(MAX_MISSILES_ACTIVE),
  initFuel:  new Float32Array(MAX_MISSILES_ACTIVE),
  targetIdx: new Int16Array(MAX_MISSILES_ACTIVE),
  type:      new Uint8Array(MAX_MISSILES_ACTIVE),
  source:    new Uint8Array(MAX_MISSILES_ACTIVE)   // 0 = player, 1 = enemy
};

const missileFreeSlots = [];
for (let i = MAX_MISSILES_ACTIVE - 1; i >= 0; i--) missileFreeSlots.push(i);
let missileCount = 0;

/* UI element reference */
const missileFireBtn = document.getElementById('missile-fire-btn');

/* Lock-on targeting state */
const lockState = {
  targets: [],       // [{enemyIdx, count}]
  maxTargets: 6,
  maxPerTarget: 3
};

/**
 * Update lock limits based on current weapon type.
 * Call when switching between regular (selectedWeapon=2) and nuclear (selectedWeapon=3).
 */
function updateLockLimits() {
  if (typeof selectedWeapon !== 'undefined' && selectedWeapon === 3) {
    lockState.maxTargets = 3;
    lockState.maxPerTarget = 1;
  } else {
    lockState.maxTargets = 6;
    lockState.maxPerTarget = 3;
  }
  // Trim existing locks if they exceed new limits
  while (lockState.targets.length > lockState.maxTargets) {
    lockState.targets.pop();
  }
  for (let i = 0; i < lockState.targets.length; i++) {
    if (lockState.targets[i].count > lockState.maxPerTarget) {
      lockState.targets[i].count = lockState.maxPerTarget;
    }
  }
}

function addLockTarget(enemyIdx) {
  const maxT = lockState.maxTargets;
  const maxPer = lockState.maxPerTarget;
  for (let i = 0; i < lockState.targets.length; i++) {
    if (lockState.targets[i].enemyIdx === enemyIdx) {
      if (lockState.targets[i].count < maxPer) {
        lockState.targets[i].count++;
        return true;
      }
      return false;
    }
  }
  if (lockState.targets.length < maxT) {
    lockState.targets.push({ enemyIdx: enemyIdx, count: 1 });
    return true;
  }
  return false;
}

function removeLockTarget(enemyIdx) {
  for (let i = 0; i < lockState.targets.length; i++) {
    if (lockState.targets[i].enemyIdx === enemyIdx) {
      lockState.targets[i].count--;
      if (lockState.targets[i].count <= 0) lockState.targets.splice(i, 1);
      return;
    }
  }
}

function clearLocks() {
  lockState.targets.length = 0;
}

function getLockCount() {
  let total = 0;
  for (let i = 0; i < lockState.targets.length; i++) total += lockState.targets[i].count;
  return total;
}

/* Lock-on detection: find enemy under crosshair */
function findLockTarget(mouseX, mouseY, camP, camF, camR, camU, mD) {
  let bestIdx = -1, bestDist = Infinity;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    const dx = enemies.posX[i] - camP[0];
    const dy = enemies.posY[i] - camP[1];
    const dz = enemies.posZ[i] - camP[2];
    const dp = dx * camF[0] + dy * camF[1] + dz * camF[2];
    if (dp <= 0) continue;
    const sx = baseWidth * 0.5 + (dx * camR[0] + dy * camR[1] + dz * camR[2]) / dp * 1.8 * mD;
    const sy = baseHeight * 0.5 - (dx * camU[0] + dy * camU[1] + dz * camU[2]) / dp * 1.8 * mD;
    const projSize = Math.max((enemies.scale[i] / dp) * mD * 1.8, 25);
    const tdx = mouseX - sx, tdy = mouseY - sy;
    const d2 = tdx * tdx + tdy * tdy;
    if (d2 < projSize * projSize && d2 < bestDist) {
      bestDist = d2;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/* Spawn a missile */
function spawnMissile(type, targetIdx) {
  if (missileFreeSlots.length === 0) return -1;
  const idx = missileFreeSlots.pop();
  const speed = type === 0 ? MISSILE_SPEED : NUKE_MISSILE_SPEED;
  const initFuel = type === 0 ? MISSILE_FUEL_REGULAR : MISSILE_FUEL_NUKE;
  missile.alive[idx] = 1;
  missile.posX[idx] = flyPos[0];
  missile.posZ[idx] = flyPos[2];
  missile.velX[idx] = flyVel[0] + (aimDir ? aimDir[0] * speed : 0);
  missile.velZ[idx] = flyVel[2] + (aimDir ? aimDir[2] * speed : 0);
  const spd = Math.sqrt(missile.velX[idx] ** 2 + missile.velZ[idx] ** 2);
  missile.fwdX[idx] = spd > 0.01 ? missile.velX[idx] / spd : 0;
  missile.fwdZ[idx] = spd > 0.01 ? missile.velZ[idx] / spd : 1;
  missile.fuel[idx] = initFuel;
  missile.initFuel[idx] = initFuel;
  missile.age[idx] = 0;
  missile.targetIdx[idx] = targetIdx;
  missile.type[idx] = type;
  missile.source[idx] = 0; // player missile
  missileCount++;
  return idx;
}

/* Remove a missile */
function removeMissile(idx) {
  if (!missile.alive[idx]) return;
  missile.alive[idx] = 0;
  missile.source[idx] = 0;
  missileFreeSlots.push(idx);
  missileCount--;
}

/**
 * Fire an enemy missile targeting the player.
 * @param {number} enemyIdx - index of the firing enemy
 * @returns {number} missile slot index, or -1 if pool is full
 */
function enemyFireMissile(enemyIdx) {
  if (missileFreeSlots.length === 0) return -1;
  const idx = missileFreeSlots.pop();
  const ex = enemies.posX[enemyIdx], ez = enemies.posZ[enemyIdx];
  // Aim toward player
  let dx = flyPos[0] - ex, dz = flyPos[2] - ez;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 1.0) { dx /= d; dz /= d; } else { dx = 0; dz = 1; }
  const enemySpd = MISSILE_SPEED * 0.7;  // slightly slower than player missiles
  missile.alive[idx] = 1;
  missile.posX[idx] = ex;
  missile.posZ[idx] = ez;
  missile.velX[idx] = enemies.velX[enemyIdx] + dx * enemySpd;
  missile.velZ[idx] = enemies.velZ[enemyIdx] + dz * enemySpd;
  const spd = Math.sqrt(missile.velX[idx] * missile.velX[idx] + missile.velZ[idx] * missile.velZ[idx]);
  missile.fwdX[idx] = spd > 0.01 ? missile.velX[idx] / spd : 0;
  missile.fwdZ[idx] = spd > 0.01 ? missile.velZ[idx] / spd : 1;
  missile.fuel[idx] = 5.0;
  missile.initFuel[idx] = 5.0;
  missile.age[idx] = 0;
  missile.targetIdx[idx] = -1; // special: target is player
  missile.type[idx] = 0;       // regular (not nuke)
  missile.source[idx] = 1;     // enemy missile
  missileCount++;
  return idx;
}

/* Fire a salvo of all locked targets */
function fireMissileSalvo(st) {
  const wIdx = selectedWeapon; // 2 = regular, 3 = nuke
  if (st < weaponCooldownEnd[wIdx]) return;
  if (lockState.targets.length === 0) return;
  const missileType = wIdx === 3 ? 1 : 0;
  for (let t = 0; t < lockState.targets.length; t++) {
    const lock = lockState.targets[t];
    for (let c = 0; c < lock.count; c++) {
      const spawned = spawnMissile(missileType, lock.enemyIdx);
      if (spawned >= 0 && typeof recordShotFired === 'function') recordShotFired();
      if (spawned >= 0 && c > 0) {
        // Fan-out: add perpendicular velocity offset for spread
        const perpX = -missile.fwdZ[spawned];
        const perpZ = missile.fwdX[spawned];
        const offset = (c - 0.5) * 500.0;  // km -- fan-out spread
        missile.velX[spawned] += perpX * offset;
        missile.velZ[spawned] += perpZ * offset;
      }
    }
  }
  weaponCooldownEnd[wIdx] = st + (missileType === 0 ? MISSILE_COOLDOWN_REGULAR : MISSILE_COOLDOWN_NUKE);
  clearLocks();
}

/* Detonate nuclear missile into volumetric shader slot */
function detonateMissileNuke(idx) {
  const slot = detSlots.find(s => !s.active);
  if (!slot) { removeMissile(idx); return; }
  const mx = missile.posX[idx], mz = missile.posZ[idx];
  slot.pos[0] = mx;
  slot.pos[1] = 0;
  slot.pos[2] = mz;
  slot.startSimTime = simTime;
  slot.active = true;
  // Apply blast damage to nearby enemies
  checkMissileBlastHits(mx, mz, MISSILE_DAMAGE_NUKE, NUKE_BLAST_RADIUS);
  removeMissile(idx);
}

/**
 * Called when a regular missile detonates on proximity hit.
 * Spawns a billboard sprite explosion at the missile position + blast damage.
 */
function onMissileDetonate(idx) {
  const mx = missile.posX[idx], mz = missile.posZ[idx];
  spawnExplosion(mx, 0, mz, EXPLOSION_BASE_SIZE);
  // Apply blast damage to nearby enemies
  checkMissileBlastHits(mx, mz, MISSILE_DAMAGE_REGULAR);
  removeMissile(idx);
}

/* Update all alive missiles */
function updateMissiles(simDt) {
  if (!flyMode) return;
  for (let i = 0; i < MAX_MISSILES_ACTIVE; i++) {
    if (!missile.alive[i]) continue;
    missile.age[i] += simDt;

    // Validate target and read live position
    const ti = missile.targetIdx[i];
    let tX, tZ;
    if (ti === -1) {
      // Enemy missile targeting player
      if (typeof playerState !== 'undefined' && !playerState.alive) {
        removeMissile(i); continue;
      }
      tX = flyPos[0]; tZ = flyPos[2];
    } else if (ti < 0 || !enemies.alive[ti]) {
      // Target dead/invalid: remove silently (fizzle)
      removeMissile(i);
      continue;
    } else {
      tX = enemies.posX[ti]; tZ = enemies.posZ[ti];
    }

    let dx = tX - missile.posX[i], dz = tZ - missile.posZ[i];
    let dist = Math.sqrt(dx * dx + dz * dz);

    // Proximity check
    if (dist < MISSILE_DET_RADIUS) {
      if (missile.source[i] === 1) {
        // Enemy missile detonation: check shields first, then hull
        const mx = missile.posX[i], mz = missile.posZ[i];
        let shieldAbsorbed = false;
        if (typeof shield !== 'undefined' && typeof destroyShieldPiece === 'function') {
          for (let si = 0; si < MAX_SHIELD_PIECES; si++) {
            if (!shield.alive[si]) continue;
            const sdx = mx - shield.posX[si];
            const sdz = mz - shield.posZ[si];
            if (sdx * sdx + sdz * sdz < SHIELD_HIT_RADIUS_SQ) {
              shieldAbsorbed = true;
              destroyShieldPiece(si);
              break;
            }
          }
        }
        if (typeof spawnExplosion === 'function') spawnExplosion(mx, 0, mz, EXPLOSION_BASE_SIZE);
        if (!shieldAbsorbed) {
          if (typeof applyPlayerDamage === 'function') applyPlayerDamage(40);
          if (typeof spawnImpactParticles === 'function') spawnImpactParticles(mx, mz, 0);
        }
        removeMissile(i);
      } else if (missile.type[i] === 1) {
        detonateMissileNuke(i);
      } else {
        onMissileDetonate(i);
      }
      continue;
    }

    // BH despawn (km-scale: BH_RADIUS_KM from scale.js)
    const r2 = missile.posX[i] * missile.posX[i] + missile.posZ[i] * missile.posZ[i];
    if (r2 < BH_RADIUS_KM * BH_RADIUS_KM) { removeMissile(i); continue; }

    // BH-only gravity at km scale (always active)
    const mx = missile.posX[i], mzg = missile.posZ[i];
    const mr2 = mx * mx + mzg * mzg;
    const mr = Math.sqrt(mr2);
    const mr3 = mr2 * mr;
    const g = mr3 > 1.0 ? [-BH_GM_KM * mx / mr3, 0, -BH_GM_KM * mzg / mr3] : [0, 0, 0];

    if (missile.fuel[i] > 0) {
      // Powered flight: PN guidance + thrust
      missile.fuel[i] -= simDt;
      const losX = dx / (dist || 1), losZ = dz / (dist || 1);
      const vDotLos = missile.velX[i] * losX + missile.velZ[i] * losZ;
      const crossX = missile.velX[i] - vDotLos * losX;
      const crossZ = missile.velZ[i] - vDotLos * losZ;
      const crossSpeed = Math.sqrt(crossX * crossX + crossZ * crossZ);
      const losRate = crossSpeed / (dist || 1);
      const closingSpeed = Math.max(-vDotLos, 100.0);
      const perpX = -losZ, perpZ = losX;
      const pnSign = (crossX * perpX + crossZ * perpZ) > 0 ? -1 : 1;
      const pnMag = MISSILE_NAV_GAIN * closingSpeed * losRate;
      const ax = g[0] + MISSILE_THRUST * losX + pnSign * pnMag * perpX;
      const az = g[2] + MISSILE_THRUST * losZ + pnSign * pnMag * perpZ;
      missile.velX[i] += ax * simDt;
      missile.velZ[i] += az * simDt;
    } else {
      // Coast phase: gravity only
      missile.velX[i] += g[0] * simDt;
      missile.velZ[i] += g[2] * simDt;

      // Self-destruct check: fuel depleted + coast duration exceeded + moving away
      if (missile.age[i] > missile.initFuel[i] + MISSILE_COAST_DURATION) {
        const vToward = missile.velX[i] * dx + missile.velZ[i] * dz;
        if (vToward < 0 && dist > MISSILE_DET_RADIUS * 3) {
          removeMissile(i); continue;
        }
      }
    }

    // Position update
    missile.posX[i] += missile.velX[i] * simDt;
    missile.posZ[i] += missile.velZ[i] * simDt;

    // Update forward direction
    const spd = Math.sqrt(missile.velX[i] * missile.velX[i] + missile.velZ[i] * missile.velZ[i]);
    if (spd > 0.01) {
      missile.fwdX[i] = missile.velX[i] / spd;
      missile.fwdZ[i] = missile.velZ[i] / spd;
    }
  }
}

/* Missile UI update */
function updateMissileUI() {
  if (!flyMode) { missileFireBtn.className = 'missile-fire-btn'; return; }
  // Only show missile UI when in missile weapon mode (selectedWeapon 2 or 3)
  if (typeof selectedWeapon === 'undefined' || selectedWeapon < 2) {
    missileFireBtn.className = 'missile-fire-btn';
    return;
  }
  const lockCount = getLockCount();
  const inFlight = missileCount;
  const wIdx = selectedWeapon;
  const cdRemain = (typeof weaponCooldownEnd !== 'undefined' ? weaponCooldownEnd[wIdx] : 0) - simTime;
  const typeName = wIdx === 3 ? 'NUKE' : 'MISSILE';
  if (cdRemain > 0) {
    missileFireBtn.className = 'missile-fire-btn cooldown';
    missileFireBtn.textContent = typeName + ' COOLDOWN ' + cdRemain.toFixed(1) + 's';
  } else if (inFlight > 0) {
    missileFireBtn.className = 'missile-fire-btn in-flight';
    missileFireBtn.textContent = typeName + ' IN FLIGHT [' + inFlight + ']';
  } else if (lockCount > 0) {
    missileFireBtn.className = 'missile-fire-btn active';
    missileFireBtn.textContent = typeName + ' FIRE SALVO [' + lockCount + '] [RMB]';
  } else {
    missileFireBtn.className = 'missile-fire-btn idle-hint';
    missileFireBtn.textContent = typeName + ' MODE: CLICK TO LOCK';
  }
}
