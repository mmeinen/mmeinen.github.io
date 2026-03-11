/* ---- Missile System (SoA Store) ---- */

/* Constants */
const MAX_MISSILES_ACTIVE = 24;
const MISSILE_THRUST = 12.0;
const MISSILE_NAV_GAIN = 3.0;
const MISSILE_DET_RADIUS = 1.5;
const MISSILE_FUEL_REGULAR = 7.0;
const MISSILE_FUEL_NUKE = 10.0;
const MISSILE_COAST_DURATION = 1.5;
const MISSILE_SPEED = 15.0;
const NUKE_MISSILE_SPEED = 12.0;
const MISSILE_COOLDOWN_REGULAR = 3.0;
const MISSILE_COOLDOWN_NUKE = 8.0;
const MISSILE_HALF = [0.03, 0.008, 0.008];
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
  type:      new Uint8Array(MAX_MISSILES_ACTIVE)
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
  missileCount++;
  return idx;
}

/* Remove a missile */
function removeMissile(idx) {
  if (!missile.alive[idx]) return;
  missile.alive[idx] = 0;
  missileFreeSlots.push(idx);
  missileCount--;
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
        const offset = (c - 0.5) * 2.0;
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

    // Validate target
    const ti = missile.targetIdx[i];
    if (ti < 0 || !enemies.alive[ti]) {
      // Target dead/invalid: remove silently (fizzle)
      removeMissile(i);
      continue;
    }

    // Read live target position
    const tX = enemies.posX[ti], tZ = enemies.posZ[ti];
    let dx = tX - missile.posX[i], dz = tZ - missile.posZ[i];
    let dist = Math.sqrt(dx * dx + dz * dz);

    // Proximity check
    if (dist < MISSILE_DET_RADIUS) {
      if (missile.type[i] === 1) {
        detonateMissileNuke(i);
      } else {
        onMissileDetonate(i);
      }
      continue;
    }

    // BH despawn
    const r2 = missile.posX[i] * missile.posX[i] + missile.posZ[i] * missile.posZ[i];
    if (r2 < 4.0) { removeMissile(i); continue; }

    // Gravity (always active)
    const g = computeGravAccel([missile.posX[i], 0, missile.posZ[i]]);

    if (missile.fuel[i] > 0) {
      // Powered flight: PN guidance + thrust
      missile.fuel[i] -= simDt;
      const losX = dx / (dist || 1), losZ = dz / (dist || 1);
      const vDotLos = missile.velX[i] * losX + missile.velZ[i] * losZ;
      const crossX = missile.velX[i] - vDotLos * losX;
      const crossZ = missile.velZ[i] - vDotLos * losZ;
      const crossSpeed = Math.sqrt(crossX * crossX + crossZ * crossZ);
      const losRate = crossSpeed / (dist || 1);
      const closingSpeed = Math.max(-vDotLos, 1.0);
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
