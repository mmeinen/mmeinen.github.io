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

/* Combat mode state */
let combatMode = false;
let selectedWeapon = 0;   // 0=kinetic, 1=plasma

/* Weapon cooldown state (simTime-based) */
const weaponCooldownEnd = [0, 0];   // simTime when each weapon's cooldown expires
let kineticBurstRemaining = 0;      // rounds left in current burst
let kineticBurstTimer = 0;          // sim time accumulator for burst stagger

/* Projectile SoA store (following combat.js enemies pattern exactly) */
const proj = {
  alive:    new Uint8Array(MAX_PROJECTILES),
  posX:     new Float32Array(MAX_PROJECTILES),
  posZ:     new Float32Array(MAX_PROJECTILES),
  velX:     new Float32Array(MAX_PROJECTILES),
  velZ:     new Float32Array(MAX_PROJECTILES),
  type:     new Uint8Array(MAX_PROJECTILES),    // 0=kinetic, 1=plasma
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
}

/**
 * Fire the currently selected weapon.
 * @param {number} st - current simTime
 */
function fireSelectedWeapon(st) {
  if (selectedWeapon === 0) {
    fireKineticBurst(st);
  } else {
    firePlasma(st);
  }
}

/**
 * Update all alive projectiles: physics, despawn, and kinetic burst continuation.
 * IMPORTANT: simDt is already scaled by BULLET_TIME_SCALE or FAST_FORWARD_SCALE (Pitfall 2).
 * @param {number} simDt - scaled delta time
 * @param {number} st - current simTime
 */
function updateProjectiles(simDt, st) {
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

    if (proj.type[i] === 0) {
      // KINETIC: full gravity, leapfrog integration
      const g = computeGravAccel([proj.posX[i], 0, proj.posZ[i]]);
      proj.velX[i] += g[0] * simDt;
      proj.velZ[i] += g[2] * simDt;
      proj.posX[i] += proj.velX[i] * simDt;
      proj.posZ[i] += proj.velZ[i] * simDt;

      // Despawn: lifetime exceeded
      if (proj.age[i] > KINETIC_LIFETIME) { removeProjectile(i); continue; }
      // Despawn: fell into BH (radius < 2.0)
      const r2 = proj.posX[i] * proj.posX[i] + proj.posZ[i] * proj.posZ[i];
      if (r2 < 4.0) { removeProjectile(i); continue; }

    } else {
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
 * Check all alive projectiles against enemy positions using radial bins.
 * On hit: remove the projectile. Damage is deferred to Phase 6.
 */
function checkProjectileHits() {
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i]) continue;
    const r = Math.sqrt(proj.posX[i] * proj.posX[i] + proj.posZ[i] * proj.posZ[i]);
    const candidates = getCollisionCandidates(r);
    const hitRadSq = proj.type[i] === 0
      ? HIT_RADIUS_KINETIC * HIT_RADIUS_KINETIC
      : HIT_RADIUS_PLASMA * HIT_RADIUS_PLASMA;

    for (let j = 0; j < candidates.length; j++) {
      const ci = candidates[j];
      if (!enemies.alive[ci]) continue;
      const dx = proj.posX[i] - enemies.posX[ci];
      const dz = proj.posZ[i] - enemies.posZ[ci];
      if (dx * dx + dz * dz < hitRadSq) {
        // HIT! Remove projectile. Damage applied in Phase 6.
        // TODO Phase 6: enemies.hp[ci] -= damage
        removeProjectile(i);
        break;
      }
    }
  }
}
