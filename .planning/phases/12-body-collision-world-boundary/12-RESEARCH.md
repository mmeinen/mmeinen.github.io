# Phase 12: Body Collision & World Boundary - Research

**Researched:** 2026-03-18
**Domain:** 2D orbital collision detection (JavaScript, pure math -- no frameworks)
**Confidence:** HIGH

## Summary

Phase 12 adds physical collision between game entities (enemies, projectiles, missiles) and celestial bodies (7 planets + black hole), prevents the player ship from colliding with bodies via orbital mechanics clamping, enforces a world boundary at 1.2x the outermost orbit, and credits enemy body-collision kills toward the wave counter.

The existing codebase already has partial BH despawn logic (enemies and projectiles silently removed when `r < BH_RADIUS_KM`), but no planet surface collision, no player protection against body collision, no world boundary enforcement, and no kill credit for BH despawns. This phase extends the existing radial-distance checks to cover all 8 celestial bodies and adds the boundary fence.

**Primary recommendation:** Add a single `checkBodyCollisions()` function called once per frame in the game loop (after AI update, before projectile hit checks). This function iterates alive enemies, alive projectiles, and alive missiles against all 8 body positions. Player protection is handled via the existing `updateAltitude()` / orbit capture mechanics with a minimum-altitude floor. World boundary is a radial clamp in `updateNav()` for the player and a despawn check in `updateEnemyAI()` for enemies.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COLL-01 | Any entity (enemy, projectile) that contacts a planet surface or black hole event horizon is destroyed | Body collision check function against all 8 bodies; explosion + removeEnemy/removeProjectile/removeMissile on contact |
| COLL-02 | Player ship orbital mechanics prevent collision courses with planets and black hole -- player can never hit a body | Minimum altitude floor in updateAltitude(); safe-radius redirect on SOI capture; transfer guidance steers around bodies |
| COLL-03 | World boundary at 1.2x outermost orbit prevents entities from drifting beyond the play area | Update MAX_RADIUS_KM to 135,812 km (1.2 * 113,176); radial velocity reflect for enemies/projectiles; soft clamp for player |
| COLL-04 | Enemy collision with a body counts as a kill toward wave counter | Call recordEnemyKill() when an enemy is destroyed by body collision (not just silent removeEnemy) |
</phase_requirements>

## Standard Stack

### Core

No new libraries. This phase is pure JavaScript math -- distance checks and radial clamping. All code lives in the existing `js/scene/` modules.

| Module | Purpose | Why |
|--------|---------|-----|
| `js/scene/combat.js` | Enemy body collision check, enemy boundary check | Existing enemy SoA store and removeEnemy() |
| `js/scene/weapons.js` | Projectile body collision check | Existing projectile SoA store and removeProjectile() |
| `js/scene/missiles.js` | Missile body collision check | Existing missile SoA store and removeMissile() |
| `js/scene/nav.js` | Player body protection, world boundary for player | Existing updateNav() and updateAltitude() |
| `js/scene/scale.js` | MAX_RADIUS_KM update, body radius constants | Single source of truth for km-scale constants |
| `index.html` | Game loop integration, death sequence for body collision | Existing game loop calls combat/weapon/missile updates |

### Supporting

| Data | Location | Values |
|------|----------|--------|
| Planet radii (km) | `scale.js` PLANET_DIAMETER_KM / 2 | Jupiter=2000, Saturn=1600, Uranus=1200, Neptune=1120, Venus=432, Earth=480, Mars=1040 |
| BH radius (km) | `scale.js` BH_RADIUS_KM | 10,000 |
| Planet positions (km) | `nav.js` getBodyPositionKm(i, simTime) | Dynamic, computed from planetPosKm() |
| Body count | 8 total | 7 planets (indices 0-6) + BH (origin, radius=10,000 km) |
| Neptune orbit (km) | `scale.js` PLANET_ORBIT_KM[3] | 113,176 |

## Architecture Patterns

### Existing BH Despawn Pattern (to extend)

Three locations already check BH distance. These serve as the pattern for planet collision:

1. **`combat.js` line 679-683**: Enemy AI loop, after all AI states -- `if (er < BH_RADIUS_KM * BH_RADIUS_KM) removeEnemy(i)` -- silent despawn, no kill credit, no explosion.
2. **`weapons.js` line 520-521**: Projectile update -- `if (r2 < BH_RADIUS_KM * BH_RADIUS_KM) removeProjectile(i)` -- silent despawn.
3. **`missiles.js` line 311-313**: Missile update -- `if (r2 < BH_RADIUS_KM * BH_RADIUS_KM) removeMissile(i)` -- silent despawn.

### Recommended Architecture

```
Game Loop (index.html)
  |
  updateNav()           -- Player gravity + orbit + PLAYER BODY PROTECTION + BOUNDARY CLAMP
  updateMissiles()      -- Missile physics (existing BH despawn stays)
  updateExplosions()
  updateWaveSystem()
  updateEnemyAI()       -- Enemy physics (BH despawn upgraded to BODY COLLISION + BOUNDARY CHECK)
  rebinEntities()
  updateProjectiles()
  checkProjectileHits() -- Player/enemy projectile hit checks (existing)
  checkBodyCollisions() -- [NEW] Projectile + missile vs all 8 bodies
  updateParticles()
```

### Pattern 1: Body Collision Check for Enemies (inside updateEnemyAI)

**What:** Replace the existing BH-only despawn with a check against all 8 bodies.
**When:** At the end of the enemy AI loop, after all position updates.
**Why here:** Enemy positions are updated by AI states; checking after ensures we test the final position.

```javascript
// Replace existing BH despawn (combat.js lines 679-683) with:
// Body collision: check enemy vs all celestial bodies
const ex = enemies.posX[i], ez = enemies.posZ[i];
const er2 = ex * ex + ez * ez;

// BH check (origin, radius BH_RADIUS_KM)
if (er2 < BH_RADIUS_KM * BH_RADIUS_KM) {
  spawnExplosion(ex, 0, ez, EXPLOSION_BASE_SIZE);
  if (typeof recordEnemyKill === 'function') recordEnemyKill(); // COLL-04
  removeEnemy(i);
  continue; // skip remaining checks for this enemy
}

// Planet checks
for (let p = 0; p < 7; p++) {
  const bp = getBodyPositionKm(p, simTime);
  const br = getBodyRadiusKm(p);
  const dx = ex - bp[0], dz = ez - bp[2];
  if (dx * dx + dz * dz < br * br) {
    spawnExplosion(ex, 0, ez, EXPLOSION_BASE_SIZE);
    if (typeof recordEnemyKill === 'function') recordEnemyKill(); // COLL-04
    removeEnemy(i);
    break; // enemy destroyed, stop checking more planets
  }
}
```

### Pattern 2: Body Collision for Projectiles and Missiles (new function)

**What:** A standalone function called after `checkProjectileHits()` in the game loop.
**When:** Every frame, after projectile hit detection.
**Why standalone:** Projectiles and missiles are in separate SoA stores. A single function that loops both is cleaner than scattering checks.

```javascript
// New function in weapons.js (or a new collision.js)
function checkBodyCollisions(sTime) {
  // Projectiles vs bodies
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i]) continue;
    const px = proj.posX[i], pz = proj.posZ[i];
    // BH
    if (px * px + pz * pz < BH_RADIUS_KM * BH_RADIUS_KM) {
      removeProjectile(i); continue;
    }
    // Planets
    for (let p = 0; p < 7; p++) {
      const bp = getBodyPositionKm(p, sTime);
      const br = getBodyRadiusKm(p);
      const dx = px - bp[0], dz = pz - bp[2];
      if (dx * dx + dz * dz < br * br) {
        removeProjectile(i); break;
      }
    }
  }

  // Missiles vs bodies
  for (let i = 0; i < MAX_MISSILES_ACTIVE; i++) {
    if (!missile.alive[i]) continue;
    const mx = missile.posX[i], mz = missile.posZ[i];
    // BH already checked in updateMissiles -- but we need planet checks
    for (let p = 0; p < 7; p++) {
      const bp = getBodyPositionKm(p, sTime);
      const br = getBodyRadiusKm(p);
      const dx = mx - bp[0], dz = mz - bp[2];
      if (dx * dx + dz * dz < br * br) {
        // Regular missile: spawn small explosion. Nuke: trigger detonation.
        if (missile.type[i] === 1) {
          detonateMissileNuke(i);
        } else {
          onMissileDetonate(i);
        }
        break;
      }
    }
  }
}
```

### Pattern 3: Player Body Protection (COLL-02)

**What:** The player cannot collide with bodies because orbital mechanics constrain the trajectory.
**How:** Three layers of protection already exist; one needs reinforcement:

1. **Orbit capture (existing):** `checkSOICapture()` circularizes the ship when it enters a body's SOI. This prevents free-fall into the body.
2. **Minimum altitude floor (existing):** `updateAltitude()` already redirects the player if `orbitAltitude < 0` -- resets to `defaultOrbitAlt`. This prevents the player from lowering orbit below the surface.
3. **Free-flight protection (NEW):** During `ORBIT_STATE.FREE` or `ORBIT_STATE.TRANSFER`, the player could theoretically drift into a body if SOI capture fails or is delayed. Add a hard safety check in `updateNav()`: if player distance from any body is less than `bodyRadius + safeMargin`, redirect outward.

```javascript
// In updateNav(), after position update and before SOI capture:
// Safety: prevent player from entering any body
for (let p = 0; p < 7; p++) {
  const bp = getBodyPositionKm(p, sTime);
  const br = getBodyRadiusKm(p);
  const safeR = br + 200; // 200 km safety margin
  const dx = flyPos[0] - bp[0], dz = flyPos[2] - bp[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < safeR) {
    // Push player to safe radius and circularize
    const angle = Math.atan2(dx, dz);
    flyPos[0] = bp[0] + safeR * Math.sin(angle);
    flyPos[2] = bp[2] + safeR * Math.cos(angle);
    circularizeOrbit(flyPos, flyVel, bp, getBodyGMKm(p), getBodyVelocityKm(p, sTime));
  }
}
// BH protection
const bhDist = Math.sqrt(flyPos[0] * flyPos[0] + flyPos[2] * flyPos[2]);
if (bhDist < BH_RADIUS_KM + 500) {
  const angle = Math.atan2(flyPos[0], flyPos[2]);
  const safeR = BH_RADIUS_KM + 500;
  flyPos[0] = safeR * Math.sin(angle);
  flyPos[2] = safeR * Math.cos(angle);
  const vorb = Math.sqrt(BH_GM_KM / safeR);
  const rx = flyPos[0] / safeR, rz = flyPos[2] / safeR;
  flyVel[0] = -rz * vorb; flyVel[2] = rx * vorb;
}
```

### Pattern 4: World Boundary (COLL-03)

**What:** Entities beyond 1.2x Neptune orbit are clamped/reflected.
**Current state:** `MAX_RADIUS_KM = 120,000` (1.06x Neptune orbit). Needs update to `~135,812` (1.2x).
**Implementation differs by entity type:**

- **Player:** Soft clamp -- if `r > WORLD_BOUNDARY_KM`, clamp position to boundary and set radial velocity to zero (keep tangential). No damage.
- **Enemies:** Hard despawn -- if `r > WORLD_BOUNDARY_KM`, remove without kill credit (drifted off, not a body collision). This keeps wave progression fair.
- **Projectiles:** Hard despawn -- remove when beyond boundary.
- **Missiles:** Hard despawn -- remove when beyond boundary.

```javascript
// scale.js update:
const NEPTUNE_ORBIT_KM = 113176;
const WORLD_BOUNDARY_KM = Math.ceil(NEPTUNE_ORBIT_KM * 1.2); // 135,812 km
// MAX_RADIUS_KM stays for collision bin coverage -- update if needed

// Player boundary (in updateNav):
const playerR = Math.sqrt(flyPos[0] * flyPos[0] + flyPos[2] * flyPos[2]);
if (playerR > WORLD_BOUNDARY_KM) {
  // Clamp to boundary
  const nx = flyPos[0] / playerR, nz = flyPos[2] / playerR;
  flyPos[0] = nx * WORLD_BOUNDARY_KM;
  flyPos[2] = nz * WORLD_BOUNDARY_KM;
  // Remove radial velocity (keep tangential)
  const radV = flyVel[0] * nx + flyVel[2] * nz;
  if (radV > 0) { // only if moving outward
    flyVel[0] -= radV * nx;
    flyVel[2] -= radV * nz;
  }
}
```

### Anti-Patterns to Avoid

- **DO NOT use swept/ray-sphere tests for normal-speed body collision.** At normal game speed, entity velocities are ~1,000-15,000 km/s with dt ~0.016s, meaning per-frame displacement is 16-240 km. The smallest planet (Venus) has radius 432 km. No entity can tunnel through a planet in a single frame at normal speed. Simple distance checks are sufficient. Swept tests are needed only for warp speed (Phase 14, not this phase).
- **DO NOT destroy the player on body contact.** The requirement says "orbital mechanics prevent collision courses." The player should be mechanically prevented from reaching a body, not killed on contact. This differs from enemy behavior.
- **DO NOT add body collision to the shader.** All collision is CPU-side in the game loop. The shader only renders.
- **DO NOT use the existing radial bin system for body collision.** Bins are for entity-vs-entity checks. Body positions are known precisely -- iterate them directly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Planet positions | Custom position tracking | `getBodyPositionKm(i, simTime)` | Already computed every frame by existing orbital code |
| Planet radii | Separate radius array | `getBodyRadiusKm(i)` | Reads from planetData * BODY_SCALE, already exists |
| Kill tracking | Custom kill counter | `recordEnemyKill()` | Already increments playerState.stats.enemiesKilled |
| Explosion on destroy | Custom visual | `spawnExplosion(x, 0, z, size)` | Existing billboard explosion system |
| Player ship redirect | Custom physics | `circularizeOrbit()` | Existing function that sets circular orbit velocity |

## Common Pitfalls

### Pitfall 1: BH Despawn Loses Kill Credit (COLL-04 regression)

**What goes wrong:** The existing BH despawn in `combat.js` line 681 silently removes enemies without calling `recordEnemyKill()`. If left unchanged, enemies falling into the BH don't count as kills, so waves never progress if enemies drift into the BH.
**Why it happens:** The original BH despawn was a safety net, not a gameplay mechanic.
**How to avoid:** Add `recordEnemyKill()` and `spawnExplosion()` calls to the BH despawn path.
**Warning signs:** Wave counter stalls despite enemies visibly disappearing into the BH.

### Pitfall 2: Planet Position Staleness

**What goes wrong:** Body collision check uses planet positions computed at a different time than when the enemy/projectile position was updated.
**Why it happens:** Planets orbit. If collision is checked with stale positions (e.g., from the previous frame), a fast-moving entity could appear to miss/hit incorrectly.
**How to avoid:** Pass `simTime` to the collision function and call `getBodyPositionKm(p, simTime)` inside the check loop. Since planets move slowly relative to entity speeds, this is a minor precision issue, but correctness requires fresh positions.
**Warning signs:** Entities occasionally pass through the leading edge of fast inner planets (Venus at sp=0.025).

### Pitfall 3: Double-Removal of Enemies

**What goes wrong:** An enemy is removed by body collision AND by a projectile hit in the same frame, causing freeSlots to be pushed twice for the same index.
**Why it happens:** `removeEnemy(i)` is called in the body collision check, then `checkProjectileHits()` runs and finds the same enemy (now dead) still in the collision bin.
**How to avoid:** `removeEnemy()` already checks `if (!enemies.alive[idx]) return;` (line 95). The radial bin check in `checkProjectileHits()` also checks `if (!enemies.alive[ci]) continue;` (line 581 of weapons.js). Both guards prevent double-removal. No additional code needed, but VERIFY the guards are present.
**Warning signs:** `freeSlots.length > MAX_ENEMIES` or negative `enemyCount`.

### Pitfall 4: Collision Bin Coverage vs World Boundary

**What goes wrong:** Updating WORLD_BOUNDARY_KM to 135,812 km but not updating collision bin coverage (currently NUM_BINS_KM=24 * BIN_WIDTH_KM=5000 = 120,000 km max).
**Why it happens:** The bins only cover up to 120,000 km. Entities between 120,000 and 135,812 km fall into the last bin.
**How to avoid:** Update `NUM_BINS_KM` from 24 to 28 (28 * 5000 = 140,000 km) to cover the expanded boundary. Or leave at 24 and accept that the last bin accumulates entities near the boundary. Since boundary entities are about to be despawned anyway, the current 24-bin setup is sufficient -- entities at the boundary edge just share the last bin. The performance impact is negligible with max 64 enemies.
**Warning signs:** None significant, but update the constant for correctness.

### Pitfall 5: Station-Keeping Enemies Inside Planets

**What goes wrong:** Enemies in `AI_IDLE` state use `STATION_KEEP_ALT = 1500` km from planet surface for station-keeping. This is fine for large planets but for Venus (radius 432 km) it places enemies at 1932 km from center. If the station-keeping logic has a bug, enemies could end up inside the planet and get immediately destroyed by body collision.
**Why it happens:** Station-keeping uses `bodyR + STATION_KEEP_ALT` which gives adequate clearance. But if `getBodyPositionKm` returns wrong values or `stationPhase` is extreme, the computed position might fall inside.
**How to avoid:** The body collision check should have a grace period or only apply to enemies NOT in `AI_IDLE` state (station-keeping enemies are intentionally near planets). Better approach: station-keeping overrides position every frame, so even if body collision fires, the enemy will be repositioned next frame. Let body collision kill enemies only during TRANSFER, ATTACK, DISENGAGE, and REORBIT states.
**Warning signs:** Enemies instantly dying after spawn at their assigned planet.

## Code Examples

### Complete Body Collision Function

```javascript
/**
 * Check enemies, projectiles, and missiles for collision with celestial bodies.
 * Called once per frame in the game loop after rebinEntities().
 * - Enemies: destroyed + explosion + kill credit (COLL-01, COLL-04)
 * - Projectiles: silently removed (COLL-01)
 * - Missiles: detonate on impact (COLL-01)
 * @param {number} sTime - current simulation time
 */
function checkBodyCollisions(sTime) {
  // Cache body positions for this frame (avoid 8 * N redundant calls)
  const _bpX = new Float64Array(7), _bpZ = new Float64Array(7), _br2 = new Float64Array(7);
  for (let p = 0; p < 7; p++) {
    const bp = getBodyPositionKm(p, sTime);
    _bpX[p] = bp[0]; _bpZ[p] = bp[2];
    const br = getBodyRadiusKm(p);
    _br2[p] = br * br;
  }
  const _bhR2 = BH_RADIUS_KM * BH_RADIUS_KM;

  // --- Enemies vs bodies ---
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    // Skip enemies in station-keeping (AI_IDLE) -- they're intentionally near planets
    if (enemies.aiState[i] === AI_IDLE) continue;
    const ex = enemies.posX[i], ez = enemies.posZ[i];
    // BH
    if (ex * ex + ez * ez < _bhR2) {
      spawnExplosion(ex, 0, ez, EXPLOSION_BASE_SIZE);
      if (typeof recordEnemyKill === 'function') recordEnemyKill();
      removeEnemy(i);
      continue;
    }
    // Planets
    for (let p = 0; p < 7; p++) {
      const dx = ex - _bpX[p], dz = ez - _bpZ[p];
      if (dx * dx + dz * dz < _br2[p]) {
        spawnExplosion(ex, 0, ez, EXPLOSION_BASE_SIZE);
        if (typeof recordEnemyKill === 'function') recordEnemyKill();
        removeEnemy(i);
        break;
      }
    }
  }

  // --- Projectiles vs bodies ---
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i]) continue;
    const px = proj.posX[i], pz = proj.posZ[i];
    // BH (already checked in updateProjectiles for kinetic -- but plasma is not)
    if (px * px + pz * pz < _bhR2) {
      removeProjectile(i); continue;
    }
    // Planets
    for (let p = 0; p < 7; p++) {
      const dx = px - _bpX[p], dz = pz - _bpZ[p];
      if (dx * dx + dz * dz < _br2[p]) {
        removeProjectile(i); break;
      }
    }
  }

  // --- Missiles vs bodies ---
  for (let i = 0; i < MAX_MISSILES_ACTIVE; i++) {
    if (!missile.alive[i]) continue;
    const mx = missile.posX[i], mz = missile.posZ[i];
    // BH already checked in updateMissiles
    // Planets
    for (let p = 0; p < 7; p++) {
      const dx = mx - _bpX[p], dz = mz - _bpZ[p];
      if (dx * dx + dz * dz < _br2[p]) {
        if (missile.type[i] === 1) {
          detonateMissileNuke(i);
        } else {
          onMissileDetonate(i);
        }
        break;
      }
    }
  }
}
```

### World Boundary Constants Update

```javascript
// scale.js additions:
const NEPTUNE_ORBIT_KM = PLANET_ORBIT_KM[3]; // 113,176 km
const WORLD_BOUNDARY_KM = Math.ceil(NEPTUNE_ORBIT_KM * 1.2); // 135,812 km
// Update NUM_BINS_KM to cover boundary:
const NUM_BINS_KM = 28; // 28 * 5000 = 140,000 km (covers 135,812 boundary)
```

### Enemy Boundary Check (inside updateEnemyAI)

```javascript
// At end of enemy AI loop, after body collision:
// World boundary: despawn enemies beyond play area (no kill credit)
const enemyR2 = enemies.posX[i] * enemies.posX[i] + enemies.posZ[i] * enemies.posZ[i];
if (enemyR2 > WORLD_BOUNDARY_KM * WORLD_BOUNDARY_KM) {
  removeEnemy(i); // silent removal -- drifted off, not a combat kill
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BH-only silent despawn | Full body collision with kill credit | Phase 12 | Enemies count as kills; physics credibility |
| No world boundary | Radial boundary at 1.2x Neptune | Phase 12 | Play area integrity; prevents infinite drift |
| MAX_RADIUS_KM = 120,000 | WORLD_BOUNDARY_KM = 135,812 | Phase 12 | Matches 1.2x requirement |
| NUM_BINS_KM = 24 | NUM_BINS_KM = 28 | Phase 12 | Bin coverage includes boundary zone |

## Open Questions

1. **Should missiles detonate on planet impact or silently despawn?**
   - What we know: Requirements say "destroyed." Nuclear missiles have special detonation behavior (volumetric shader effect).
   - Recommendation: Regular missiles should call `onMissileDetonate()` (explosion + blast damage to nearby enemies). Nuclear missiles should call `detonateMissileNuke()` (full volumetric effect). This creates interesting tactical scenarios -- luring enemies near a planet and launching missiles at the planet surface.

2. **Should the existing BH despawn code in updateProjectiles/updateMissiles be removed or kept?**
   - What we know: The new `checkBodyCollisions()` also checks BH. Having both is redundant but harmless.
   - Recommendation: Keep the existing BH checks in updateProjectiles and updateMissiles for defense-in-depth. The new function adds planet checks. Remove the standalone BH check from `updateEnemyAI` since the new function handles it with kill credit. Or consolidate all body collision into the new function and remove the scattered BH checks. The cleaner option is consolidation.

3. **Should player collision with BH be lethal (instant death) rather than a redirect?**
   - What we know: COLL-02 says "orbital mechanics prevent collision courses." The player should never reach the BH. The safety redirect is a last-resort catch.
   - Recommendation: Keep the redirect (non-lethal). If the player somehow reaches the BH despite orbital mechanics, it's a bug, not a gameplay event. Killing the player would mask the bug.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Browser-based regression tests (tests.html) + manual visual checks |
| Config file | tests.html |
| Quick run command | Open `http://localhost:8000/tests.html` in browser |
| Full suite command | Open `http://localhost:8000/tests.html` + visual check in nav mode |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COLL-01 | Enemies/projectiles destroyed on body contact | manual | Visual: fly near planet, observe enemy destruction | N/A |
| COLL-02 | Player cannot collide with bodies | manual | Visual: attempt to lower orbit into planet surface; attempt to fly into BH | N/A |
| COLL-03 | World boundary at 1.2x Neptune | manual | Visual: transfer to outermost orbit and observe boundary clamp | N/A |
| COLL-04 | Enemy body collision counts as kill | manual | Visual: lure enemies into planet, observe wave counter progression | N/A |

### Sampling Rate

- **Per task commit:** Open tests.html to verify no shader invariant regressions
- **Per wave merge:** Full visual test -- enter nav mode, observe body collisions, verify wave progression
- **Phase gate:** All 4 COLL requirements verified visually

### Wave 0 Gaps

- No test infrastructure gaps -- all tests are visual/manual for this phase
- tests.html already exists for shader invariant checks
- No new automated tests needed (collision is runtime behavior, not static invariant)

## Sources

### Primary (HIGH confidence)

- `js/scene/combat.js` -- enemy SoA store, AI state machine, BH despawn pattern, removeEnemy(), rebinEntities()
- `js/scene/weapons.js` -- projectile SoA store, hit detection pattern, removeProjectile()
- `js/scene/missiles.js` -- missile SoA store, detonation handlers, BH despawn
- `js/scene/nav.js` -- player physics (updateNav), orbit capture (checkSOICapture), altitude management (updateAltitude), getBodyPositionKm(), getBodyRadiusKm()
- `js/scene/scale.js` -- all km-scale constants, body dimensions, orbit radii, MAX_RADIUS_KM
- `js/scene/waves.js` -- wave state machine, kill threshold check (`enemyCount === 0`)
- `js/scene/explosions.js` -- spawnExplosion() API
- `index.html` -- game loop order, playerState, applyPlayerDamage(), recordEnemyKill(), death sequence

### Secondary (HIGH confidence)

- `.planning/research/ARCHITECTURE.md` -- body collision flow specification (line 317-320), phase D build plan
- `.planning/research/FEATURES.md` -- body collision requirements, world boundary design
- `.planning/research/SUMMARY.md` -- phase rationale, tunneling pitfall discussion
- `.planning/research/PITFALLS.md` -- swept test guidance for warp (not needed for normal speed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all code locations identified, no new libraries needed
- Architecture: HIGH -- extends existing patterns (BH despawn, orbit capture, radial bin)
- Pitfalls: HIGH -- all identified from direct code reading, no speculation
- Body collision math: HIGH -- simple distance checks, well-understood primitives

**Research date:** 2026-03-18
**Valid until:** Indefinite (this is project-specific code analysis, not library version research)
