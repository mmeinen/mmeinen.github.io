/* ---- Weapons System: Kinetic Cannon + Plasma Gun ---- */

/* Tunable constants */
const MAX_PROJECTILES = 128;
const KINETIC_SPEED = 80;           // muzzle speed in units/s
const KINETIC_LIFETIME = 3.0;       // seconds before despawn
const KINETIC_COOLDOWN = 1.0;       // volley cooldown (sim seconds)
const KINETIC_BURST_COUNT = 5;      // rounds per volley
const KINETIC_BURST_DELAY = 0.05;   // sim seconds between burst rounds
const PLASMA_SPEED = 200;           // bolt speed in units/s
const PLASMA_MAX_RANGE = 120;       // units before despawn
const PLASMA_FADE_START = 80;       // units where alpha/size fade begins
const PLASMA_COOLDOWN = 2.5;        // seconds between shots
const HIT_RADIUS_KINETIC = 1.5;     // generous hit area for kinetic
const HIT_RADIUS_PLASMA = 2.0;      // slightly larger for plasma bolt
const KINETIC_DAMAGE = 15;          // damage per kinetic hit
const PLASMA_DAMAGE = 35;           // damage per plasma hit
const ENEMY_KINETIC_SPEED = 60;     // enemy projectile speed

/* Combat mode state */
let combatMode = false;
let selectedWeapon = 0;   // 0=kinetic, 1=plasma, 2=regular missile, 3=nuclear missile

/* Weapon cooldown state (simTime-based) */
const weaponCooldownEnd = [0, 0, 0, 0];   // simTime when each weapon's cooldown expires
let kineticBurstRemaining = 0;      // rounds left in current burst
let kineticBurstTimer = 0;          // sim time accumulator for burst stagger

/* Projectile SoA store (following combat.js enemies pattern exactly) */
const proj = {
  alive:    new Uint8Array(MAX_PROJECTILES),
  posX:     new Float32Array(MAX_PROJECTILES),
  posZ:     new Float32Array(MAX_PROJECTILES),
  velX:     new Float32Array(MAX_PROJECTILES),
  velZ:     new Float32Array(MAX_PROJECTILES),
  type:     new Uint8Array(MAX_PROJECTILES),    // 0=kinetic, 1=plasma, 2=enemy kinetic
  age:      new Float32Array(MAX_PROJECTILES),
  distTrav: new Float32Array(MAX_PROJECTILES),  // for plasma fade
};
const projFreeSlots = [];
// Pre-fill free slots in reverse order (same pattern as combat.js)
for (let i = MAX_PROJECTILES - 1; i >= 0; i--) projFreeSlots.push(i);
let projCount = 0;

/**
 * Spawn a projectile. Pop from free list, initialize all SoA fields.
 * @param {number} type - 0=kinetic, 1=plasma
 * @param {number} px - initial X position
 * @param {number} pz - initial Z position
 * @param {number} vx - initial X velocity
 * @param {number} vz - initial Z velocity
 * @returns {number} slot index, or -1 if full
 */
function spawnProjectile(type, px, pz, vx, vz) {
  if (projFreeSlots.length === 0) return -1;
  const idx = projFreeSlots.pop();
  proj.alive[idx] = 1;
  proj.posX[idx] = px;
  proj.posZ[idx] = pz;
  proj.velX[idx] = vx;
  proj.velZ[idx] = vz;
  proj.type[idx] = type;
  proj.age[idx] = 0;
  proj.distTrav[idx] = 0;
  projCount++;
  return idx;
}

/**
 * Remove a projectile by slot index, returning the slot to the free-list.
 */
function removeProjectile(idx) {
  if (!proj.alive[idx]) return;
  proj.alive[idx] = 0;
  projFreeSlots.push(idx);
  projCount--;
}

/**
 * Fire a single kinetic round. Inherits ship velocity + muzzle velocity in aim direction.
 * CRITICAL: Must add flyVel to prevent rounds flying backward relative to ship (Pitfall 1).
 */
function fireOneKinetic() {
  if (!aimDir) return;
  const vx = flyVel[0] + aimDir[0] * KINETIC_SPEED;
  const vz = flyVel[2] + aimDir[2] * KINETIC_SPEED;
  spawnProjectile(0, flyPos[0], flyPos[2], vx, vz);
}

/**
 * Initiate a kinetic burst (5 rounds staggered). Guard on cooldown.
 * @param {number} st - current simTime
 */
function fireKineticBurst(st) {
  if (!aimDir || st < weaponCooldownEnd[0]) return;
  kineticBurstRemaining = KINETIC_BURST_COUNT;
  kineticBurstTimer = 0;
  // Fire the first round immediately
  fireOneKinetic();
  kineticBurstRemaining--;
  weaponCooldownEnd[0] = st + KINETIC_COOLDOWN;
  if (typeof recordShotFired === 'function') recordShotFired();
}

/**
 * Fire a single plasma bolt. Straight-line, no ship velocity inheritance (energy, not mass).
 * @param {number} st - current simTime
 */
function firePlasma(st) {
  if (!aimDir || st < weaponCooldownEnd[1]) return;
  const vx = aimDir[0] * PLASMA_SPEED;
  const vz = aimDir[2] * PLASMA_SPEED;
  spawnProjectile(1, flyPos[0], flyPos[2], vx, vz);
  weaponCooldownEnd[1] = st + PLASMA_COOLDOWN;
  if (typeof recordShotFired === 'function') recordShotFired();
}

/**
 * Fire the currently selected weapon.
 * @param {number} st - current simTime
 */
function fireSelectedWeapon(st) {
  if (selectedWeapon === 0) {
    fireKineticBurst(st);
  } else if (selectedWeapon === 1) {
    firePlasma(st);
  } else if (selectedWeapon === 2 || selectedWeapon === 3) {
    fireMissileSalvo(st);
  }
}

/**
 * Fire a lead-predicted kinetic round from an enemy toward the player.
 * Type=2 projectile (enemy kinetic) with red tracer.
 * @param {number} enemyIdx - enemy slot index
 * @param {Float32Array} playerPos - player position [x,y,z]
 * @param {Float32Array} playerVel - player velocity [x,y,z]
 */
function enemyFireAt(enemyIdx, playerPos, playerVel) {
  const ex = enemies.posX[enemyIdx], ez = enemies.posZ[enemyIdx];
  const dx = playerPos[0] - ex, dz = playerPos[2] - ez;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;
  // Lead prediction: estimate time-of-flight
  const tof = dist / ENEMY_KINETIC_SPEED;
  // Predict player position
  let predX = playerPos[0] + playerVel[0] * tof;
  let predZ = playerPos[2] + playerVel[2] * tof;
  // Add accuracy noise via Box-Muller
  const u1 = Math.random(), u2 = Math.random();
  const mag = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * ACCURACY_NOISE;
  const theta = u2 * 6.283185;
  predX += Math.cos(theta) * mag;
  predZ += Math.sin(theta) * mag;
  // Aim direction from enemy to predicted position
  const adx = predX - ex, adz = predZ - ez;
  const adist = Math.sqrt(adx * adx + adz * adz);
  if (adist < 0.01) return;
  const aimX = adx / adist, aimZ = adz / adist;
  // Spawn type=2 enemy kinetic round (inherit enemy velocity + muzzle velocity)
  spawnProjectile(2, ex, ez,
    enemies.velX[enemyIdx] + aimX * ENEMY_KINETIC_SPEED,
    enemies.velZ[enemyIdx] + aimZ * ENEMY_KINETIC_SPEED);
}

/**
 * Fire a 3-round kinetic burst from a Sniper enemy toward the player.
 * All 3 rounds fire in a single call with slight angular spread between rounds.
 * @param {number} enemyIdx - enemy slot index
 * @param {Float32Array} playerPos - player position [x,y,z]
 * @param {Float32Array} playerVel - player velocity [x,y,z]
 * @param {number} [accuracyOverride] - optional accuracy noise override (from getArchetypeStats)
 */
function enemySniperBurst(enemyIdx, playerPos, playerVel, accuracyOverride) {
  const ex = enemies.posX[enemyIdx], ez = enemies.posZ[enemyIdx];
  const dx = playerPos[0] - ex, dz = playerPos[2] - ez;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;
  // Lead prediction: estimate time-of-flight
  const tof = dist / ENEMY_KINETIC_SPEED;
  // Predict player position
  let predX = playerPos[0] + playerVel[0] * tof;
  let predZ = playerPos[2] + playerVel[2] * tof;
  // Add accuracy noise via Box-Muller (use override or default)
  const noise = (accuracyOverride !== undefined) ? accuracyOverride : ACCURACY_NOISE;
  const u1 = Math.random(), u2 = Math.random();
  const mag = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * noise;
  const theta = u2 * 6.283185;
  predX += Math.cos(theta) * mag;
  predZ += Math.sin(theta) * mag;
  // Base aim direction from enemy to predicted position
  const adx = predX - ex, adz = predZ - ez;
  const adist = Math.sqrt(adx * adx + adz * adz);
  if (adist < 0.01) return;
  const baseAimX = adx / adist, baseAimZ = adz / adist;
  // Fire 3 rounds with angular spread
  for (let round = 0; round < 3; round++) {
    if (projFreeSlots.length === 0) break;
    const spreadAngle = (round - 1) * 0.03; // -0.03, 0, +0.03 radians
    let aimX, aimZ;
    if (spreadAngle === 0) {
      aimX = baseAimX;
      aimZ = baseAimZ;
    } else {
      const cosA = Math.cos(spreadAngle), sinA = Math.sin(spreadAngle);
      aimX = baseAimX * cosA - baseAimZ * sinA;
      aimZ = baseAimX * sinA + baseAimZ * cosA;
    }
    spawnProjectile(2, ex, ez,
      enemies.velX[enemyIdx] + aimX * ENEMY_KINETIC_SPEED,
      enemies.velZ[enemyIdx] + aimZ * ENEMY_KINETIC_SPEED);
  }
  // Muzzle flash
  if (typeof spawnExplosion === 'function') spawnExplosion(ex, 0, ez, 0.5);
}

/* ---- Trail buffer (shared ring buffer for all kinetic tracers) ---- */
const TRAIL_MAX_POINTS = 512;
const trailBuf = new Float32Array(TRAIL_MAX_POINTS * 3);  // xyz positions
const trailAlpha = new Float32Array(TRAIL_MAX_POINTS);     // per-point alpha
let trailHead = 0, trailCount = 0;

/* ---- Trajectory preview state ---- */
const PREVIEW_STEPS = 80;
const PREVIEW_SIM_DT = 0.5;  // covers ~40s of flight time for kinetic
const previewBuf = new Float32Array(PREVIEW_STEPS * 3);  // xyz positions
let previewCount = 0;
let hitPredictionPoint = null;  // [x, 0, z] if trajectory intersects enemy
let hitPredictionIdx = -1;      // enemy index if hit predicted

/* ---- Projectile render data ---- */
const projRenderBuf = new Float32Array(MAX_PROJECTILES * 3);  // packed positions for draw calls

/**
 * Compute weapon trajectory preview with hit prediction.
 * Called each frame in combat mode to show where shots will go.
 * @param {number} simTime - current simulation time
 */
function computeWeaponPreview(simTime) {
  hitPredictionPoint = null;
  hitPredictionIdx = -1;

  if (!combatMode || !aimDir) {
    previewCount = 0;
    return;
  }

  // Missiles are guided -- no trajectory preview (lock reticles serve this purpose)
  if (selectedWeapon >= 2) {
    previewCount = 0;
    return;
  }

  if (selectedWeapon === 0) {
    // KINETIC: gravity-curved trajectory via simulateTrajectory
    const startPos = [flyPos[0], 0, flyPos[2]];
    const startVel = [
      flyVel[0] + aimDir[0] * KINETIC_SPEED,
      0,
      flyVel[2] + aimDir[2] * KINETIC_SPEED
    ];
    previewCount = simulateTrajectory(startPos, startVel, simTime, PREVIEW_STEPS, PREVIEW_SIM_DT, previewBuf, null, 0, 0);
  } else {
    // PLASMA: straight-line preview
    for (let s = 0; s < PREVIEW_STEPS; s++) {
      const dist = s * (PLASMA_MAX_RANGE / PREVIEW_STEPS);
      previewBuf[s * 3]     = flyPos[0] + aimDir[0] * dist;
      previewBuf[s * 3 + 1] = 0;
      previewBuf[s * 3 + 2] = flyPos[2] + aimDir[2] * dist;
    }
    previewCount = PREVIEW_STEPS;
  }

  // Hit prediction: check each preview point for enemy intersection
  const hitRadSq = selectedWeapon === 0
    ? HIT_RADIUS_KINETIC * HIT_RADIUS_KINETIC
    : HIT_RADIUS_PLASMA * HIT_RADIUS_PLASMA;
  for (let s = 0; s < previewCount; s++) {
    const px = previewBuf[s * 3];
    const pz = previewBuf[s * 3 + 2];
    const r = Math.sqrt(px * px + pz * pz);
    const candidates = getCollisionCandidates(r);
    for (let j = 0; j < candidates.length; j++) {
      const ci = candidates[j];
      if (!enemies.alive[ci]) continue;
      const dx = px - enemies.posX[ci];
      const dz = pz - enemies.posZ[ci];
      if (dx * dx + dz * dz < hitRadSq) {
        hitPredictionPoint = [px, 0, pz];
        hitPredictionIdx = ci;
        return;  // first hit found, done
      }
    }
  }
}

/**
 * Render all projectiles (kinetic tracers + trails, plasma glow bolts).
 * @param {WebGLRenderingContext} gl
 * @param {WebGLProgram} trajPg - trajectory shader program
 * @param {Object} trajLocs - attribute/uniform locations
 * @param {Float32Array} vpMat - view-projection matrix
 * @param {WebGLBuffer} projGlBuf - pre-allocated GL buffer for projectile data
 */
function renderProjectiles(gl, trajPg, trajLocs, vpMat, projGlBuf, camX, camY, camZ) {
  if (projCount === 0 && trailCount === 0) return;

  gl.useProgram(trajPg);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);  // additive blend for bright tracers
  gl.uniformMatrix4fv(trajLocs.uMvp, false, vpMat);

  gl.bindBuffer(gl.ARRAY_BUFFER, projGlBuf);
  gl.enableVertexAttribArray(trajLocs.aPos);

  // --- Kinetic round heads (white/yellow bright points) ---
  let kCount = 0;
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i] || proj.type[i] !== 0) continue;
    // CRR: subtract camera world position before GPU upload
    projRenderBuf[kCount * 3]     = proj.posX[i] - camX;
    projRenderBuf[kCount * 3 + 1] = 0 - camY;
    projRenderBuf[kCount * 3 + 2] = proj.posZ[i] - camZ;
    kCount++;
  }
  if (kCount > 0) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, projRenderBuf.subarray(0, kCount * 3));
    gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(trajLocs.uColor, 1.0, 0.94, 0.71, 1.0);  // white/yellow
    gl.uniform1f(trajLocs.uPtSize, 4.0);
    gl.drawArrays(gl.POINTS, 0, kCount);
  }

  // --- Kinetic trails (faded white/yellow points) ---
  let tCount = 0;
  for (let i = 0; i < TRAIL_MAX_POINTS; i++) {
    if (trailAlpha[i] <= 0) continue;
    // CRR: subtract camera world position
    projRenderBuf[tCount * 3]     = trailBuf[i * 3] - camX;
    projRenderBuf[tCount * 3 + 1] = trailBuf[i * 3 + 1] - camY;
    projRenderBuf[tCount * 3 + 2] = trailBuf[i * 3 + 2] - camZ;
    tCount++;
  }
  if (tCount > 0) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, projRenderBuf.subarray(0, tCount * 3));
    gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(trajLocs.uColor, 1.0, 0.94, 0.71, 0.5);  // dimmer
    gl.uniform1f(trajLocs.uPtSize, 2.0);
    gl.drawArrays(gl.POINTS, 0, tCount);
  }

  // --- Plasma bolt heads (cyan glow + white-hot core) ---
  // Render each plasma bolt individually (typically 1-2 active) for per-bolt fade
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i] || proj.type[i] !== 1) continue;
    const fade = proj.distTrav[i] < PLASMA_FADE_START
      ? 1.0
      : Math.max(0, 1.0 - (proj.distTrav[i] - PLASMA_FADE_START) / (PLASMA_MAX_RANGE - PLASMA_FADE_START));

    // CRR: subtract camera world position
    projRenderBuf[0] = proj.posX[i] - camX;
    projRenderBuf[1] = 0 - camY;
    projRenderBuf[2] = proj.posZ[i] - camZ;
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, projRenderBuf.subarray(0, 3));
    gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);

    // Glow pass: large, low-alpha cyan
    gl.uniform4f(trajLocs.uColor, 0.0, 0.86, 1.0, 0.3 * fade);
    gl.uniform1f(trajLocs.uPtSize, 12.0 * fade);
    gl.drawArrays(gl.POINTS, 0, 1);

    // Core pass: smaller, white-hot
    gl.uniform4f(trajLocs.uColor, 0.9, 0.95, 1.0, fade);
    gl.uniform1f(trajLocs.uPtSize, 5.0 * fade);
    gl.drawArrays(gl.POINTS, 0, 1);
  }

  // --- Enemy kinetic round heads (red points, type=2) ---
  let eCount = 0;
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i] || proj.type[i] !== 2) continue;
    // CRR: subtract camera world position
    projRenderBuf[eCount * 3]     = proj.posX[i] - camX;
    projRenderBuf[eCount * 3 + 1] = 0 - camY;
    projRenderBuf[eCount * 3 + 2] = proj.posZ[i] - camZ;
    eCount++;
  }
  if (eCount > 0) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, projRenderBuf.subarray(0, eCount * 3));
    gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(trajLocs.uColor, 1.0, 0.314, 0.235, 0.9);  // enemy red
    gl.uniform1f(trajLocs.uPtSize, 3.0);
    gl.drawArrays(gl.POINTS, 0, eCount);
  }

  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);  // restore normal blend
  gl.disableVertexAttribArray(trajLocs.aPos);
}

/**
 * Render weapon trajectory preview and hit prediction marker.
 * @param {WebGLRenderingContext} gl
 * @param {WebGLProgram} trajPg - trajectory shader program
 * @param {Object} trajLocs - attribute/uniform locations
 * @param {Float32Array} vpMat - view-projection matrix
 * @param {WebGLBuffer} projGlBuf - pre-allocated GL buffer
 */
function renderWeaponPreview(gl, trajPg, trajLocs, vpMat, projGlBuf, camX, camY, camZ) {
  if (previewCount === 0) return;

  gl.useProgram(trajPg);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniformMatrix4fv(trajLocs.uMvp, false, vpMat);

  gl.bindBuffer(gl.ARRAY_BUFFER, projGlBuf);
  gl.enableVertexAttribArray(trajLocs.aPos);

  // CRR: apply camera-relative offset to preview points before upload
  for (let s = 0; s < previewCount; s++) {
    projRenderBuf[s * 3]     = previewBuf[s * 3]     - camX;
    projRenderBuf[s * 3 + 1] = previewBuf[s * 3 + 1] - camY;
    projRenderBuf[s * 3 + 2] = previewBuf[s * 3 + 2] - camZ;
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, projRenderBuf.subarray(0, previewCount * 3));
  gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);

  if (selectedWeapon === 0) {
    // Kinetic preview: curved white/yellow dots
    gl.uniform4f(trajLocs.uColor, 1.0, 0.94, 0.71, 0.4);
    gl.uniform1f(trajLocs.uPtSize, 2.5);
    gl.drawArrays(gl.POINTS, 0, previewCount);
  } else {
    // Plasma preview: cyan dots that shrink toward max range (3 segments)
    const seg = Math.floor(previewCount / 3);
    // First third: largest
    gl.uniform4f(trajLocs.uColor, 0.0, 0.86, 1.0, 0.35);
    gl.uniform1f(trajLocs.uPtSize, 3.0);
    gl.drawArrays(gl.POINTS, 0, seg);
    // Second third: medium
    gl.uniform1f(trajLocs.uPtSize, 2.0);
    gl.drawArrays(gl.POINTS, seg, seg);
    // Last third: smallest
    gl.uniform1f(trajLocs.uPtSize, 1.5);
    gl.drawArrays(gl.POINTS, seg * 2, previewCount - seg * 2);
  }

  // Hit prediction marker
  if (hitPredictionPoint) {
    // CRR: subtract camera world position
    projRenderBuf[0] = hitPredictionPoint[0] - camX;
    projRenderBuf[1] = hitPredictionPoint[1] - camY;
    projRenderBuf[2] = hitPredictionPoint[2] - camZ;
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, projRenderBuf.subarray(0, 3));
    gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(trajLocs.uColor, 1.0, 0.3, 0.2, 0.9);  // bright red/orange
    gl.uniform1f(trajLocs.uPtSize, 10.0);
    gl.drawArrays(gl.POINTS, 0, 1);
  }

  gl.disableVertexAttribArray(trajLocs.aPos);
}

/**
 * Update all alive projectiles: physics, despawn, and kinetic burst continuation.
 * IMPORTANT: simDt is already scaled by BULLET_TIME_SCALE or FAST_FORWARD_SCALE (Pitfall 2).
 * @param {number} simDt - scaled delta time
 * @param {number} st - current simTime
 */
function updateProjectiles(simDt, st) {
  // Decay all trail point alphas (fade over ~0.25s)
  for (let t = 0; t < TRAIL_MAX_POINTS; t++) {
    if (trailAlpha[t] > 0) {
      trailAlpha[t] -= simDt * 4.0;
      if (trailAlpha[t] <= 0) { trailAlpha[t] = 0; trailCount = Math.max(0, trailCount - 1); }
    }
  }

  // Handle kinetic burst continuation (staggered firing)
  if (kineticBurstRemaining > 0) {
    kineticBurstTimer += simDt;
    while (kineticBurstRemaining > 0 && kineticBurstTimer >= KINETIC_BURST_DELAY) {
      fireOneKinetic();
      kineticBurstRemaining--;
      kineticBurstTimer -= KINETIC_BURST_DELAY;
    }
  }

  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i]) continue;

    proj.age[i] += simDt;

    if (proj.type[i] === 0 || proj.type[i] === 2) {
      // KINETIC (player type=0) or ENEMY KINETIC (type=2): gravity, leapfrog
      const g = computeGravAccel([proj.posX[i], 0, proj.posZ[i]]);
      proj.velX[i] += g[0] * simDt;
      proj.velZ[i] += g[2] * simDt;
      proj.posX[i] += proj.velX[i] * simDt;
      proj.posZ[i] += proj.velZ[i] * simDt;

      // Trail ring buffer (player kinetic only, not enemy)
      if (proj.type[i] === 0) {
        trailBuf[trailHead * 3]     = proj.posX[i];
        trailBuf[trailHead * 3 + 1] = 0;
        trailBuf[trailHead * 3 + 2] = proj.posZ[i];
        if (trailAlpha[trailHead] <= 0) trailCount++;
        trailAlpha[trailHead] = 1.0;
        trailHead = (trailHead + 1) % TRAIL_MAX_POINTS;
      }

      // Despawn: lifetime exceeded
      if (proj.age[i] > KINETIC_LIFETIME) { removeProjectile(i); continue; }
      // Despawn: fell into BH (radius < 2.0)
      const r2 = proj.posX[i] * proj.posX[i] + proj.posZ[i] * proj.posZ[i];
      if (r2 < 4.0) { removeProjectile(i); continue; }

    } else if (proj.type[i] === 1) {
      // PLASMA: straight line, no gravity, constant speed
      proj.posX[i] += proj.velX[i] * simDt;
      proj.posZ[i] += proj.velZ[i] * simDt;
      const speed = Math.sqrt(proj.velX[i] * proj.velX[i] + proj.velZ[i] * proj.velZ[i]);
      proj.distTrav[i] += speed * simDt;

      // Despawn: exceeded max range
      if (proj.distTrav[i] > PLASMA_MAX_RANGE) { removeProjectile(i); continue; }
    }
  }
}

/**
 * Check all alive projectiles for hits.
 * Player projectiles (type 0,1) check against enemies -- apply damage, flash, kill.
 * Enemy projectiles (type 2) check against player position (flyPos).
 */
function checkProjectileHits() {
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i]) continue;

    if (proj.type[i] === 2) {
      // Enemy kinetic: check shields first, then hull
      let shieldAbsorbed = false;
      for (let si = 0; si < MAX_SHIELD_PIECES; si++) {
        if (!shield.alive[si]) continue;
        const sdx = proj.posX[i] - shield.posX[si];
        const sdz = proj.posZ[i] - shield.posZ[si];
        if (sdx * sdx + sdz * sdz < SHIELD_HIT_RADIUS_SQ) {
          shieldAbsorbed = true;
          destroyShieldPiece(si);
          removeProjectile(i);
          break;
        }
      }
      if (shieldAbsorbed) continue;
      // Then check hull
      const dx = proj.posX[i] - flyPos[0];
      const dz = proj.posZ[i] - flyPos[2];
      if (dx * dx + dz * dz < HIT_RADIUS_KINETIC * HIT_RADIUS_KINETIC) {
        applyPlayerDamage(ENEMY_KINETIC_DAMAGE);
        if (typeof spawnImpactParticles === 'function') spawnImpactParticles(flyPos[0], flyPos[2], 0);
        removeProjectile(i);
      }
      continue;
    }

    // Player projectiles (type 0 kinetic, type 1 plasma): check against enemies
    const r = Math.sqrt(proj.posX[i] * proj.posX[i] + proj.posZ[i] * proj.posZ[i]);
    const candidates = getCollisionCandidates(r);
    const hitRadSq = proj.type[i] === 0
      ? HIT_RADIUS_KINETIC * HIT_RADIUS_KINETIC
      : HIT_RADIUS_PLASMA * HIT_RADIUS_PLASMA;
    const dmg = proj.type[i] === 0 ? KINETIC_DAMAGE : PLASMA_DAMAGE;

    for (let j = 0; j < candidates.length; j++) {
      const ci = candidates[j];
      if (!enemies.alive[ci]) continue;
      const dx = proj.posX[i] - enemies.posX[ci];
      const dz = proj.posZ[i] - enemies.posZ[ci];
      if (dx * dx + dz * dz < hitRadSq) {
        // HIT: apply damage, trigger flash, spawn impact particles
        enemies.hp[ci] -= dmg;
        enemies.flash[ci] = 1.0;
        if (typeof recordDamageDealt === 'function') recordDamageDealt(dmg);
        if (typeof recordShotHit === 'function') recordShotHit();
        if (typeof spawnImpactParticles === 'function') {
          spawnImpactParticles(proj.posX[i], proj.posZ[i], enemies.type[ci]);
        }
        if (enemies.hp[ci] <= 0) {
          spawnExplosion(enemies.posX[ci], 0, enemies.posZ[ci], 1.2);
          if (typeof recordEnemyKill === 'function') recordEnemyKill();
          removeEnemy(ci);
        }
        removeProjectile(i);
        break;
      }
    }
  }
}

/* ---- Missile blast damage ---- */
const MISSILE_DAMAGE_REGULAR = 50;
const MISSILE_DAMAGE_NUKE = 150;
const MISSILE_BLAST_RADIUS = 5.0;
const NUKE_BLAST_RADIUS = 15.0;

/**
 * Check missile blast against enemies. Called from missile detonation handlers.
 * @param {number} x - blast center X
 * @param {number} z - blast center Z
 * @param {number} damage - damage per hit
 * @param {number} [blastRadius] - optional blast radius override (default MISSILE_BLAST_RADIUS)
 */
function checkMissileBlastHits(x, z, damage, blastRadius) {
  const br = blastRadius || MISSILE_BLAST_RADIUS;
  const r = Math.sqrt(x * x + z * z);
  const candidates = getCollisionCandidates(r);
  const blastRadSq = br * br;
  for (let j = 0; j < candidates.length; j++) {
    const ci = candidates[j];
    if (!enemies.alive[ci]) continue;
    const dx = x - enemies.posX[ci];
    const dz = z - enemies.posZ[ci];
    if (dx * dx + dz * dz < blastRadSq) {
      enemies.hp[ci] -= damage;
      enemies.flash[ci] = 1.0;
      if (typeof recordDamageDealt === 'function') recordDamageDealt(damage);
      if (typeof spawnImpactParticles === 'function') {
        spawnImpactParticles(enemies.posX[ci], enemies.posZ[ci], enemies.type[ci]);
      }
      if (enemies.hp[ci] <= 0) {
        spawnExplosion(enemies.posX[ci], 0, enemies.posZ[ci], 1.2);
        if (typeof recordEnemyKill === 'function') recordEnemyKill();
        removeEnemy(ci);
      }
    }
  }
}

/**
 * Fire a coordinated tactical salvo. Groups tacTargets by weapon type and
 * fires each group using the appropriate fire function.
 * @param {number} st - current simTime
 */
function fireTacticalSalvo(st) {
  if (typeof tacTargets === 'undefined' || tacTargets.length === 0) return;

  // Group targets by weapon type
  const groups = [[], [], [], []]; // kinetic, plasma, missile, nuke
  for (const t of tacTargets) {
    if (!enemies.alive[t.enemyIdx]) continue;
    groups[t.weaponIdx].push(t.enemyIdx);
  }

  // Save current weapon state
  const savedWeapon = selectedWeapon;
  const savedAimDir = aimDir ? [aimDir[0], aimDir[1], aimDir[2]] : null;

  // Fire kinetic bursts at each target (subject to cooldown)
  for (const enemyIdx of groups[0]) {
    if (st < weaponCooldownEnd[0]) continue;
    const dx = enemies.posX[enemyIdx] - flyPos[0];
    const dy = (enemies.posY ? enemies.posY[enemyIdx] : 0) - flyPos[1];
    const dz = enemies.posZ[enemyIdx] - flyPos[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 0.01) {
      aimDir = [dx / len, dy / len, dz / len];
      fireKineticBurst(st);
    }
  }

  // Fire plasma bolts at each target (subject to cooldown)
  for (const enemyIdx of groups[1]) {
    if (st < weaponCooldownEnd[1]) continue;
    const dx = enemies.posX[enemyIdx] - flyPos[0];
    const dy = (enemies.posY ? enemies.posY[enemyIdx] : 0) - flyPos[1];
    const dz = enemies.posZ[enemyIdx] - flyPos[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 0.01) {
      aimDir = [dx / len, dy / len, dz / len];
      firePlasma(st);
    }
  }

  // Fire regular missiles: use lock-on system
  if (groups[2].length > 0) {
    const savedLocks = lockState.targets.map(t => ({enemyIdx: t.enemyIdx, count: t.count}));
    clearLocks();
    selectedWeapon = 2;
    updateLockLimits();
    for (const enemyIdx of groups[2]) {
      addLockTarget(enemyIdx);
    }
    if (getLockCount() > 0) {
      fireMissileSalvo(st);
    }
    clearLocks();
    lockState.targets.length = 0;
    for (const t of savedLocks) lockState.targets.push(t);
  }

  // Fire nuclear missiles: use lock-on system
  if (groups[3].length > 0) {
    const savedLocks = lockState.targets.map(t => ({enemyIdx: t.enemyIdx, count: t.count}));
    clearLocks();
    selectedWeapon = 3;
    updateLockLimits();
    for (const enemyIdx of groups[3]) {
      addLockTarget(enemyIdx);
    }
    if (getLockCount() > 0) {
      fireMissileSalvo(st);
    }
    clearLocks();
    lockState.targets.length = 0;
    for (const t of savedLocks) lockState.targets.push(t);
  }

  // Restore state
  selectedWeapon = savedWeapon;
  aimDir = savedAimDir;

  // Clear tactical assignments after firing (mode stays active)
  if (typeof clearTacTargets === 'function') clearTacTargets();
}
