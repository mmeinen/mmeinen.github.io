# Phase 3: Direct-Fire Weapons - Research

**Researched:** 2026-03-10
**Domain:** WebGL 1.0 projectile physics, trajectory prediction, combat input modes, instanced point rendering
**Confidence:** HIGH

## Summary

Phase 3 adds two direct-fire weapons -- a gravity-affected kinetic cannon and a light-speed plasma gun -- with trajectory preview and hit detection. This is the first phase that creates new projectile entities, adds combat mode input separation, and extends the rendering pipeline with projectile visuals. The foundation from Phase 1 (SoA entity store, radial bins, instanced rendering) and Phase 2 (gravity simulation, trajectory prediction, aim direction computation) provides strong building blocks.

The existing codebase already has everything needed for this phase: `computeGravAccel()` and `simulateTrajectory()` for gravity-affected physics and trajectory prediction, `computeAimDir()` for mouse-to-ecliptic ray casting, the `trajPg` shader program for rendering GL_POINTS with circular discard, and the radial bin collision system (`getCollisionCandidates()`) for hit detection. The missile system in `missiles.js` demonstrates the projectile lifecycle pattern (spawn, update physics, check termination conditions, render trail). The key new work is: (1) a projectile SoA store with free-list, (2) a combat mode toggle that separates navigation clicks from weapon fire, (3) weapon selection state and cooldown logic, (4) two distinct physics models (gravity-affected kinetic vs near-straight-line plasma), (5) trajectory preview per weapon type, and (6) hit detection against enemies using radial bins.

**Primary recommendation:** Create a new `js/scene/weapons.js` module for projectile SoA storage, weapon state, firing logic, physics update, and hit detection. Extend the existing `trajPg` shader for projectile rendering (GL_POINTS with varying size and color). Add combat mode toggle and weapon selection to the existing input handlers in `index.html`. Reuse `simulateTrajectory()` for kinetic trajectory preview and implement a simpler linear-with-fade preview for plasma.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Crosshair aiming: mouse controls a crosshair on the orbital plane, weapons fire toward where crosshair points (reuse computeAimDir() ray-cast)
- Left-click to fire the currently selected weapon
- Number keys to select weapon: 1 = kinetic cannon, 2 = plasma gun (extends to 3/4 for missiles in Phase 4)
- Combat mode toggle (e.g., 'F' or 'Enter') switches between navigation mode (click = orbit transfer) and combat mode (click = fire weapon). Clear separation prevents accidental transfers mid-fight
- Kinetic cannon: bright tracer slug -- small fast-moving point with short fading trail. White/yellow color (255,240,180). Think anti-aircraft tracer fire
- Plasma gun: glowing energy bolt -- larger than kinetic, bright core with soft outer glow that fades + shrinks over distance showing energy dissipation. Cyan/electric blue color (0,220,255) with white-hot core
- Both weapon types are visually distinct from each other, from enemy archetype colors, and from the player's blue HUD
- Trajectory preview always visible in combat mode -- follows crosshair in real-time for the currently selected weapon
- Distinct preview per weapon: kinetic preview shows curved dotted line with gravity deflection (white/yellow dots); plasma preview shows straighter line with fade-out at max range (cyan dots shrinking)
- Preview extends full projectile lifetime -- kinetic shows entire arc until despawn, plasma shows line until fade-out range
- Hit prediction: if trajectory passes through an enemy's collision radius, show a bright marker at that point confirming the shot will connect
- Kinetic cannon: semi-auto with cooldown. Each click fires a volley of 5 kinetic rounds in rapid succession (~0.05s apart), same firing direction (sequential burst, not cone spread). Short cooldown between volleys
- Plasma gun: single powerful bolt per click with longer cooldown (~2-3s). Opposite rhythm to kinetic -- fewer shots, each one counts
- Unlimited ammo with cooldowns only -- no ammo count. WPN-12/13 (cooldown timers, ammo limits) are explicitly v2 scope

### Claude's Discretion
- Exact cooldown durations (tune for gameplay feel)
- Kinetic projectile speed and lifetime
- Plasma bolt speed, fade distance, and effective range
- Combat mode toggle key choice
- Crosshair visual style
- Projectile trail length and fade rate
- Hit prediction marker visual style
- Projectile entity storage structure (extend missiles.js or new module)
- GL rendering approach for projectiles (instanced points, quads, etc.)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WPN-01 | Player can fire a kinetic cannon that launches a projectile carried by momentum with no guidance | Projectile SoA store + `computeAimDir()` for firing direction + leapfrog integration for physics. Momentum-only means no thrust after launch -- just initial velocity + gravity |
| WPN-02 | Kinetic cannon rounds are affected by gravity (curve around gravity wells) | Reuse `computeGravAccel()` in projectile physics update, same leapfrog integrator as nav.js |
| WPN-03 | Player can fire a plasma gun that emits an energy blast toward a target | Same SoA store, different projectile type flag. High speed, straight-line with minimal gravity |
| WPN-04 | Plasma blasts fade over distance and have minimal gravity effect (light-based) | Track distance traveled or lifetime; reduce alpha/size over distance. Apply gravity at ~5% strength or skip entirely |
| WPN-11 | Player can preview predicted trajectory of a weapon before firing (gravity-affected path) | Reuse `simulateTrajectory()` for kinetic preview. For plasma, compute linear path with range fade. Hit prediction via checking trajectory points against enemy positions |

</phase_requirements>

## Standard Stack

### Core (Existing -- No New Dependencies)

| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| WebGL 1.0 | Browser native | All rendering | Already in use; no alternatives |
| ANGLE_instanced_arrays | Extension | Batch projectile rendering | Already loaded as `iExt` in index.html |
| Float32Array/Uint8Array | ES6 | SoA projectile store | Established pattern from combat.js |

### Existing Code to Reuse

| Module | Function/Pattern | Reuse For |
|--------|-----------------|-----------|
| nav.js | `computeAimDir(mouseX, mouseY, camP, camF, camR, camU, fovY, aspect)` | Firing direction from mouse position |
| nav.js | `computeGravAccel(pos)` | Kinetic round gravity physics |
| nav.js | `computeGravAccelAtTime(pos, time)` | Trajectory preview prediction |
| nav.js | `simulateTrajectory(startPos, startVel, startTime, steps, simDt, outArray, thrDir, thrPow, thrDur)` | Kinetic trajectory preview (with thrDir=null, thrPow=0) |
| combat.js | `getCollisionCandidates(r)` | Hit detection -- get nearby enemies for projectile collision checks |
| combat.js | `rebinEntities()` | Already called each frame; projectiles query bins |
| combat.js | SoA + free-list pattern | Projectile store follows same pattern |
| missiles.js | Trail buffer pattern (60-point ring buffer with head index) | Kinetic tracer trail storage |
| shaders.js | `trajPg` (trajectory shader) | Projectile rendering as GL_POINTS with circular discard |
| index.html | Render loop structure, `_vpMat`, blend mode setup | Integration points for projectile rendering |

### No New Files Needed Beyond

| New File | Purpose |
|----------|---------|
| `js/scene/weapons.js` | Projectile SoA, weapon state machine, fire/update/render/hit-detect |

This keeps things simple -- one new module for all weapon functionality. The alternative of splitting across weapons.js, projectile-renderer.js, collision.js per the ARCHITECTURE.md plan is premature at this stage. Phase 3 is scoped to player-fired projectiles only; enemy projectiles (Phase 5) and full collision orchestration (Phase 6) will motivate the split later.

## Architecture Patterns

### Recommended Project Structure

```
js/scene/
  weapons.js          (NEW - all weapon logic for Phase 3)
  combat.js           (EXISTING - enemy store, bins; extend rebinEntities if needed)
  nav.js              (EXISTING - gravity, trajectory; no changes)
  missiles.js         (EXISTING - nuclear missiles; no changes)
  shaders.js          (EXISTING - may add projectile shader or extend trajPg)
  math.js             (EXISTING - no changes needed)
  orbital.js          (EXISTING - no changes needed)

index.html
  - Add <script src="js/scene/weapons.js"></script> after combat.js
  - Add combat mode toggle input handler
  - Add weapon selection key handlers (1, 2)
  - Add left-click fire handler (combat mode only)
  - Add projectile render calls in flyMode render block
  - Add trajectory preview render calls in flyMode render block
  - Add combat mode HUD elements (weapon indicator, cooldown, crosshair change)
```

### Pattern 1: Projectile SoA Store with Free-List

**What:** Structure-of-Arrays typed arrays for projectile entities, following the exact pattern of combat.js enemies.

**When to use:** For all projectile state storage and iteration.

**Example:**
```javascript
// Source: Pattern from combat.js enemy store
const MAX_PROJECTILES = 128;

const proj = {
  alive:     new Uint8Array(MAX_PROJECTILES),
  posX:      new Float32Array(MAX_PROJECTILES),
  posZ:      new Float32Array(MAX_PROJECTILES),
  velX:      new Float32Array(MAX_PROJECTILES),
  velZ:      new Float32Array(MAX_PROJECTILES),
  type:      new Uint8Array(MAX_PROJECTILES),   // 0=kinetic, 1=plasma
  age:       new Float32Array(MAX_PROJECTILES),  // time since spawn
  distTrav:  new Float32Array(MAX_PROJECTILES),  // distance traveled (for plasma fade)
};

const projFreeSlots = [];
for (let i = MAX_PROJECTILES - 1; i >= 0; i--) projFreeSlots.push(i);
let projCount = 0;
```

### Pattern 2: Combat Mode State Machine

**What:** A mode flag that separates navigation interaction (click = orbit transfer) from combat interaction (click = fire weapon). Extends the existing `flyMode` gate.

**When to use:** All input handling in nav mode.

**Example:**
```javascript
// Source: Extends existing flyMode pattern in nav.js/index.html
let combatMode = false;
let selectedWeapon = 0; // 0=kinetic, 1=plasma

// Combat mode toggle (F key or similar)
// When combatMode=true:
//   - Left-click = fire selected weapon (instead of orbit transfer)
//   - Trajectory preview shown for selected weapon
//   - Crosshair changes appearance to indicate combat mode
// When combatMode=false:
//   - Left-click = orbit transfer (existing behavior)
//   - Trajectory preview shows orbit path (existing behavior)
```

### Pattern 3: Weapon Cooldown State

**What:** Per-weapon cooldown timers using simTime comparison (same pattern as missile cooldown in missiles.js).

**When to use:** Fire rate limiting.

**Example:**
```javascript
// Source: Pattern from missiles.js MISSILE_COOLDOWN
const WEAPONS = [
  { name: 'KINETIC', cooldown: 1.2, speed: 80, lifetime: 3.0, burstCount: 5, burstDelay: 0.05 },
  { name: 'PLASMA',  cooldown: 2.5, speed: 200, maxRange: 120, fadeStart: 80 }
];
let weaponCooldownEnd = [0, 0]; // simTime when cooldown expires
let kineticBurstRemaining = 0;
let kineticBurstTimer = 0;
```

### Pattern 4: Dual Physics Models

**What:** Kinetic rounds use full gravity integration (leapfrog with `computeGravAccel`). Plasma bolts travel in nearly straight lines with distance-based fade.

**When to use:** Projectile physics update loop.

**Example:**
```javascript
function updateProjectiles(simDt) {
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

      // Despawn: lifetime exceeded or fell into BH
      if (proj.age[i] > KINETIC_LIFETIME) { removeProjectile(i); continue; }
      const r2 = proj.posX[i] * proj.posX[i] + proj.posZ[i] * proj.posZ[i];
      if (r2 < 4) { removeProjectile(i); continue; }

    } else {
      // PLASMA: minimal gravity (5% or none), constant speed, distance fade
      proj.posX[i] += proj.velX[i] * simDt;
      proj.posZ[i] += proj.velZ[i] * simDt;
      proj.distTrav[i] += Math.sqrt(proj.velX[i] ** 2 + proj.velZ[i] ** 2) * simDt;

      // Despawn: exceeded max range
      if (proj.distTrav[i] > PLASMA_MAX_RANGE) { removeProjectile(i); continue; }
    }
  }
}
```

### Pattern 5: Trajectory Preview with Hit Prediction

**What:** Simulate projectile path forward in time, check each step against enemy positions, mark hit point.

**When to use:** Every frame in combat mode, for the selected weapon.

**Example:**
```javascript
function computeWeaponPreview(aimDir, weaponType) {
  const startPos = [flyPos[0], 0, flyPos[2]];
  let hitEnemyIdx = -1, hitPoint = null;

  if (weaponType === 0) {
    // KINETIC: use simulateTrajectory() with gravity
    const startVel = [
      flyVel[0] + aimDir[0] * KINETIC_SPEED,
      0,
      flyVel[2] + aimDir[2] * KINETIC_SPEED
    ];
    const steps = simulateTrajectory(startPos, startVel, simTime,
      TRAJ_STEPS, TRAJ_SIM_DT, previewArray, null, 0, 0);

    // Check each step for enemy intersection
    for (let s = 0; s < steps; s++) {
      const px = previewArray[s * 3], pz = previewArray[s * 3 + 2];
      const r = Math.sqrt(px * px + pz * pz);
      const candidates = getCollisionCandidates(r);
      for (const ci of candidates) {
        const dx = px - enemies.posX[ci], dz = pz - enemies.posZ[ci];
        if (dx * dx + dz * dz < HIT_RADIUS_SQ) {
          hitEnemyIdx = ci;
          hitPoint = [px, 0, pz];
          return { steps, hitEnemyIdx, hitPoint };
        }
      }
    }
    return { steps, hitEnemyIdx, hitPoint };

  } else {
    // PLASMA: linear path with range fade, dot markers shrinking
    const speed = PLASMA_SPEED;
    const maxDist = PLASMA_MAX_RANGE;
    const stepDist = maxDist / TRAJ_STEPS;
    for (let s = 0; s < TRAJ_STEPS; s++) {
      const d = s * stepDist;
      previewArray[s * 3]     = startPos[0] + aimDir[0] * d;
      previewArray[s * 3 + 1] = 0;
      previewArray[s * 3 + 2] = startPos[2] + aimDir[2] * d;
      // Hit check at each step...
    }
    return { steps: TRAJ_STEPS, hitEnemyIdx, hitPoint };
  }
}
```

### Anti-Patterns to Avoid

- **Object-per-projectile:** Do NOT create JS objects like the missile system does. Use SoA typed arrays. With 5-round kinetic bursts firing rapidly, object creation causes GC pressure.
- **Per-projectile draw calls:** Do NOT loop and draw each projectile individually. Batch all projectiles into a single GL_POINTS draw call (or at most two -- one for kinetic, one for plasma with different point sizes).
- **Modifying existing input handlers directly:** Do NOT inline combat mode logic into the existing click handler. Gate on `combatMode` flag and call weapon functions.
- **Separate trajectory shader for weapons:** The existing `trajPg` already supports colored GL_POINTS with configurable size. Reuse it -- do not create a new shader program.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gravity on projectiles | Custom gravity function | `computeGravAccel()` from nav.js | Same gravity constants, consistent with ship physics |
| Trajectory prediction | New simulation loop | `simulateTrajectory()` from nav.js | Already handles leapfrog integration with gravity at arbitrary time |
| Mouse-to-world-plane ray cast | Custom ray-plane intersection | `computeAimDir()` from nav.js | Already computes ecliptic plane intersection from mouse coords |
| Spatial collision lookup | Brute-force O(n^2) | `getCollisionCandidates(r)` from combat.js | Radial bins already populated for enemies |
| Point rendering with circular discard | New projectile shader | `trajPg` from shaders.js | Already renders GL_POINTS with `gl_PointCoord` discard |

**Key insight:** Phase 3 is largely an assembly task. Every major subsystem (gravity, trajectory prediction, aiming, collision lookup, point rendering) already exists. The work is connecting them through a new projectile store, combat mode input routing, and weapon state logic.

## Common Pitfalls

### Pitfall 1: Kinetic Velocity Inheritance
**What goes wrong:** Kinetic rounds are launched with only the aim direction velocity, ignoring the ship's orbital velocity. Result: rounds appear to fly backward relative to the ship.
**Why it happens:** Natural tendency to set `vel = aimDir * speed` without adding `flyVel`.
**How to avoid:** Kinetic round initial velocity = ship velocity + aim direction * muzzle speed. This is physically correct (momentum transfer) and visually satisfying (rounds curve with the ship's orbit).
**Warning signs:** Rounds fly in unexpected directions when ship is in fast orbit.

### Pitfall 2: Bullet Time Interaction
**What goes wrong:** Projectiles move at wall-clock speed instead of sim time, making them impossibly fast in bullet time or too slow in fast-forward.
**Why it happens:** Using raw `dt` instead of `simDtSec` (which is already scaled by BULLET_TIME_SCALE or FAST_FORWARD_SCALE).
**How to avoid:** All projectile physics must use the same `simDtSec` passed to `updateNav()` and `updateMissiles()`. This is already the established pattern.
**Warning signs:** Projectiles behave differently in bullet time vs fast-forward.

### Pitfall 3: Combat Mode vs Navigation Click Conflict
**What goes wrong:** Left-click fires weapon AND initiates orbit transfer simultaneously.
**Why it happens:** The existing click handler in index.html directly calls `initiateTransfer()`. If combat mode doesn't gate this, both actions fire.
**How to avoid:** In the click handler, check `combatMode` first. If true, call weapon fire and return early. Only fall through to orbit transfer logic if `combatMode` is false.
**Warning signs:** Ship suddenly transfers to a planet when player meant to fire at an enemy.

### Pitfall 4: Projectile-Enemy Collision Radius
**What goes wrong:** Hits never register, or register at unreasonable distances.
**Why it happens:** Enemy collision radius is either too small (pixel-precise hit on a 1-unit enemy is nearly impossible) or too large (cheap hits with no skill).
**How to avoid:** Use a generous collision radius (~1.5x visual radius) for kinetic rounds and slightly larger for plasma. The existing enemy scale is 1.0 (Grunt), and the geometry bounding sphere is roughly 0.5 units. A collision radius of 1.0-1.5 units provides a fair hit area. Tune after playtesting.
**Warning signs:** Players consistently miss direct shots, or hits register when visually nowhere near the enemy.

### Pitfall 5: Kinetic Burst Timing with simDt
**What goes wrong:** The 5-round burst fires all rounds in the same frame instead of staggered over ~0.25s.
**Why it happens:** Burst delay of 0.05s is shorter than a single frame's simDt in fast-forward mode (simDt could be ~0.05s at 60fps with 0.5x scale). In bullet time, simDt is tiny (~0.0005s) so the burst takes hundreds of frames.
**How to avoid:** Track burst state with a counter and timer. Decrement the burst timer by simDt each frame, fire next round when timer reaches zero. Accept that burst cadence scales with time scale -- this is correct behavior (bullet time means slower burst, fast-forward means faster burst).
**Warning signs:** All 5 kinetic rounds appear at exactly the same position, or burst takes unreasonably long.

### Pitfall 6: Trajectory Preview Stale Data
**What goes wrong:** Hit prediction marker appears at an enemy's old position; by the time the round arrives, the enemy has moved.
**Why it happens:** Preview simulates projectile path against current enemy positions, but enemies are orbiting.
**How to avoid:** For the preview, this is acceptable -- it shows "where the shot will go if you fire now." The user learns to lead targets. Do NOT try to predict enemy future positions in the preview -- that would make aiming trivially easy and remove skill. The preview should show projectile path only, and mark intersection with CURRENT enemy positions.
**Warning signs:** N/A -- this is expected and intentional behavior.

## Code Examples

### Example 1: Spawning a Kinetic Round
```javascript
// Source: Follows combat.js spawnEnemy() pattern
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

function fireKineticBurst() {
  if (!aimDir || simTime < weaponCooldownEnd[0]) return;
  kineticBurstRemaining = 5;
  kineticBurstTimer = 0;
  // First round fires immediately
  fireOneKinetic();
  kineticBurstRemaining--;
  weaponCooldownEnd[0] = simTime + KINETIC_COOLDOWN;
}

function fireOneKinetic() {
  const speed = KINETIC_SPEED;
  const vx = flyVel[0] + aimDir[0] * speed;
  const vz = flyVel[2] + aimDir[2] * speed;
  spawnProjectile(0, flyPos[0], flyPos[2], vx, vz);
}
```

### Example 2: Rendering Projectiles via trajPg
```javascript
// Source: Follows existing trajectory rendering in index.html render loop
function renderProjectiles(vpMat) {
  if (projCount === 0) return;

  gl.useProgram(trajPg);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniformMatrix4fv(trajLocs.uMvp, false, vpMat);

  // Pack all projectile positions into a single buffer
  let kCount = 0, pCount = 0;
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i]) continue;
    if (proj.type[i] === 0) {
      // Kinetic: white/yellow points
      projRenderBuf[kCount * 3]     = proj.posX[i];
      projRenderBuf[kCount * 3 + 1] = 0;
      projRenderBuf[kCount * 3 + 2] = proj.posZ[i];
      kCount++;
    }
    // Plasma packed separately (different color/size)
  }

  if (kCount > 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, projGlBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, projRenderBuf.subarray(0, kCount * 3));
    gl.enableVertexAttribArray(trajLocs.aPos);
    gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(trajLocs.uColor, 1.0, 0.94, 0.71, 1.0); // white/yellow
    gl.uniform1f(trajLocs.uPtSize, 3.0);
    gl.drawArrays(gl.POINTS, 0, kCount);
  }
  // Similar for plasma with cyan color and larger point size
}
```

### Example 3: Combat Mode Input Integration
```javascript
// Source: Extends existing keydown handler in index.html
// In the flyMode block of keydown handler:
if (e.key === 'f' || e.key === 'F') {
  combatMode = !combatMode;
  // Update HUD to reflect mode change
}
if (combatMode) {
  if (e.key === '1') selectedWeapon = 0; // kinetic
  if (e.key === '2') selectedWeapon = 1; // plasma
}

// In the click handler, at the top of the flyMode block:
if (combatMode) {
  if (!dD) fireSelectedWeapon();
  return; // Skip orbit transfer logic
}
// ... existing orbit transfer code ...
```

### Example 4: Hit Detection Using Radial Bins
```javascript
// Source: Uses existing getCollisionCandidates() from combat.js
function checkProjectileHits() {
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i]) continue;
    const r = Math.sqrt(proj.posX[i] ** 2 + proj.posZ[i] ** 2);
    const candidates = getCollisionCandidates(r);
    for (const ci of candidates) {
      if (!enemies.alive[ci]) continue;
      const dx = proj.posX[i] - enemies.posX[ci];
      const dz = proj.posZ[i] - enemies.posZ[ci];
      const hitRadSq = (enemies.scale[ci] * 1.5) ** 2; // generous hit area
      if (dx * dx + dz * dz < hitRadSq) {
        // HIT! Register hit (damage applied in Phase 6)
        removeProjectile(i);
        // TODO Phase 6: enemies.hp[ci] -= projDamage;
        break;
      }
    }
  }
}
```

## Recommended Parameter Values

These are discretionary values for tuning. All should be easily adjustable constants at the top of `weapons.js`.

### Kinetic Cannon

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Muzzle speed | 80 units/s | Fast enough to be useful across typical engagement distances (20-60 units). Ship orbital velocity at Jupiter orbit (~76 units from BH in nav mode) is ~2.3 units/s, so projectile dominates. |
| Lifetime | 3.0s | At 80 u/s, max range is ~240 units without gravity. Gravity will curve rounds significantly before that. |
| Burst count | 5 rounds | Per context decision |
| Burst delay | 0.05s sim time | Per context decision. Entire burst over 0.25s sim time. |
| Volley cooldown | 1.0s sim time | Short enough for rapid engagement, long enough to feel like a deliberate action |
| Visual: point size | 3.0 px | Small, fast tracer look |
| Visual: color | rgba(1.0, 0.94, 0.71, 1.0) | Warm white/yellow (255,240,180) per context |
| Trail length | 8 positions | Short fading trail behind each round |
| Trail interval | 0.02s sim time | Tighter than missile trail (0.05s) for faster projectile |
| Hit radius | 1.5 units | ~3x enemy Grunt visual bounding radius. Generous but requires aiming. |

### Plasma Gun

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Speed | 200 units/s | 2.5x kinetic speed. Near-instant at close range, but not literally instant (light speed in game units would be too fast to see). |
| Max range | 120 units | Covers most combat distances but not infinite. Fade forces closer engagement. |
| Fade start | 80 units | Energy dissipation begins at 2/3 max range. Visual shrink + alpha fade. |
| Cooldown | 2.5s sim time | Long enough to make each shot deliberate |
| Gravity effect | 0% (skip gravity entirely) | "Light-based" per WPN-04. Minimal deflection means zero for gameplay clarity. |
| Visual: point size | 8.0 px (at spawn), fading to 3.0 px at max range | Large, impactful bolt |
| Visual: color | rgba(0.0, 0.86, 1.0, 1.0) core, soft glow | Cyan/electric blue (0,220,255) per context |
| Hit radius | 2.0 units | Slightly larger than kinetic -- plasma bolt is bigger |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-missile objects (missiles.js) | SoA typed arrays (combat.js) | Phase 1 | Projectiles MUST use SoA, not the missiles.js object pattern |
| Per-entity draw calls (missile rendering) | Instanced draw calls (enemy rendering) | Phase 1 | Projectiles batch into single draw calls, not per-projectile loops |
| Free-flight aiming (fps/index.html) | Ecliptic-plane crosshair aiming (nav.js computeAimDir) | Phase 2 | All combat on Y=0 plane, mouse maps to orbital plane position |

**Note on missiles.js:** The existing missile system uses object-per-missile with arrays (AoS pattern). This was built before the Phase 1 SoA decision. Direct-fire weapons MUST use the newer SoA pattern from combat.js. When Phase 4 adds guided missiles, the existing missiles.js should likely be refactored to match, but that is out of scope for Phase 3.

## Open Questions

1. **Kinetic trail rendering approach**
   - What we know: Context calls for "short fading trail" behind kinetic tracers. Missile system uses a 60-point ring buffer per missile with trail rendered as GL_POINTS via trajPg.
   - What's unclear: Should each kinetic round have its own trail buffer (like missiles), or should there be a single shared trail buffer? With 5 rounds per burst and 128 max projectiles, per-projectile trails could mean 128 * 8 * 3 = 3072 floats of trail data.
   - Recommendation: Use a single shared trail ring buffer (e.g., 512 points). Each frame, for each alive kinetic round, push its current position. Render entire buffer as GL_POINTS with a single draw call. Older points naturally fade by being overwritten. This is simpler than per-projectile trails and batches better.

2. **Plasma glow effect rendering**
   - What we know: Context says "larger than kinetic, bright core with soft outer glow." The trajPg shader renders circular points with hard discard at radius 0.5.
   - What's unclear: Can we achieve a glow effect with trajPg, or do we need a new shader?
   - Recommendation: Render each plasma bolt as two passes -- a large transparent point (glow, alpha 0.3) and a smaller opaque point (core, alpha 1.0) using the same trajPg program with different sizes and colors. Alternatively, add a simple fragment shader modification to trajPg that computes a radial gradient instead of hard discard. The latter is cleaner but modifies shared code.

3. **Combat mode visual indicator**
   - What we know: Need clear visual distinction between nav mode and combat mode.
   - What's unclear: Exact HUD design for combat mode indicator.
   - Recommendation: Change the crosshair appearance (color, shape), add a "COMBAT MODE" label next to the existing "NAVIGATION MODE" label (flyHudMode element), and change the cursor style. Use the existing HUD CSS class pattern with `.combat-active` modifier.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based regression tests (tests.html) + manual visual testing |
| Config file | tests.html (existing) |
| Quick run command | Open `http://localhost:8000/tests.html` in browser |
| Full suite command | Open `http://localhost:8000/tests.html` + manual play test |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WPN-01 | Kinetic cannon fires momentum-based projectile | manual | Play test: enter combat mode, press 1, left-click to fire kinetic burst | No - manual |
| WPN-02 | Kinetic rounds curve around gravity wells | manual | Play test: fire kinetic near planet/BH, observe curved trajectory | No - manual |
| WPN-03 | Plasma gun fires energy blast | manual | Play test: press 2, left-click to fire plasma bolt | No - manual |
| WPN-04 | Plasma fades over distance, minimal gravity | manual | Play test: fire plasma, observe size/alpha decrease over distance | No - manual |
| WPN-11 | Trajectory preview shows predicted path | manual | Play test: enter combat mode, move mouse, observe preview dots following crosshair | No - manual |

### Sampling Rate
- **Per task commit:** Manual smoke test (enter nav mode, toggle combat, fire both weapons, check preview)
- **Per wave merge:** Full manual test checklist + tests.html green
- **Phase gate:** All 5 WPN requirements verified via play test + no tests.html regressions

### Wave 0 Gaps
- [ ] `js/scene/weapons.js` -- new module for all weapon logic
- [ ] Combat mode input handlers in index.html
- [ ] Projectile render calls in index.html render loop
- [ ] Combat mode HUD elements in index.html HTML and css/style.css

**Note:** This project has no unit test framework (intentional per CLAUDE.md: "No test framework"). All validation is via browser-based regression tests (tests.html for shader invariants) and manual play testing. tests.html should remain green -- weapon changes should not affect shader invariants.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `js/scene/combat.js` -- SoA entity store pattern, radial bin collision, free-list allocation
- Existing codebase: `js/scene/nav.js` -- `computeGravAccel()`, `simulateTrajectory()`, `computeAimDir()`, leapfrog integration
- Existing codebase: `js/scene/missiles.js` -- Missile lifecycle, trail buffer pattern, cooldown state machine
- Existing codebase: `js/scene/shaders.js` -- `trajPg` shader (GL_POINTS with circular discard), enemy shader (instanced rendering)
- Existing codebase: `index.html` -- Render loop, input handlers, GL buffer management, MVP matrix pipeline
- `.planning/research/ARCHITECTURE.md` -- Overall combat system architecture, SoA rationale, render order, entity store design

### Secondary (MEDIUM confidence)
- `.planning/phases/01-combat-rendering-foundation/01-RESEARCH.md` -- Phase 1 instancing patterns, attribute divisor management
- `.planning/phases/02-player-ship-orbital-movement/02-RESEARCH.md` -- Phase 2 orbit mechanics, trajectory preview approach
- `.planning/phases/03-direct-fire-weapons/03-CONTEXT.md` -- User decisions for weapon behavior, visuals, controls

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All building blocks exist in the codebase; no new libraries or APIs needed
- Architecture: HIGH - Clear pattern to follow from combat.js (SoA), nav.js (physics), and existing render loop
- Pitfalls: HIGH - Based on direct code reading of existing systems and their integration points
- Parameter tuning: MEDIUM - Speed/lifetime/cooldown values are educated estimates; will need gameplay tuning

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- no external dependencies to become outdated)
