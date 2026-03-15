# Phase 5: Enemy Behavior & Combat Feedback - Research

**Researched:** 2026-03-10
**Domain:** Enemy AI state machines, orbital transfer mechanics for NPCs, lead-prediction aiming, WebGL 1.0 instanced particle systems, per-instance flash attributes
**Confidence:** HIGH

## Summary

Phase 5 transforms enemies from static orbiting placeholders into reactive combatants with a multi-state AI, and adds visual feedback (hit flash, impact particles) to confirm player weapons are connecting. The codebase is well-prepared: `combat.js` has the SoA enemy store with free-list and radial bins, `weapons.js` has the projectile store with type field extendable for enemy rounds, `explosions.js` demonstrates instanced billboard rendering, and `orbital.js` / `nav.js` provide all the gravity and velocity helpers needed for enemy transfer orbits.

The phase has five technical pillars: (1) an AI state machine per enemy (idle/alert/transfer/attack/disengage/re-orbit) stored as SoA arrays in `combat.js`, (2) orbital transfer logic for enemies using simplified Hohmann transfers (reusing `computeHohmannDV` and `computeGravAccel`), (3) enemy weapon firing with lead prediction and tunable noise, (4) a flash intensity attribute added as a 10th float in the instance buffer with corresponding shader modification, and (5) a new particle system for impact sparks using GL_POINTS with additive blending.

The most architecturally sensitive change is extending the instance buffer stride from 9 to 10 floats. This touches the SoA packing in `combat.js`, the GL buffer allocation in `index.html`, every `vertexAttribPointer` call for enemy attributes, and the enemy vertex/fragment shaders. All offsets shift when stride changes, so this must be done atomically.

**Primary recommendation:** Implement the AI state machine as parallel SoA arrays (aiState, aiTimer, assignedBody, targetBody) in `combat.js`. Extend the projectile type enum to include type=2 for enemy kinetic rounds. Add flashIntensity as float index 9 in the instance buffer. Build the particle system as a new SoA store following the same pattern as explosions.js.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Station-keeping near planets when idle -- enemies hover at a fixed point relative to their assigned planet (not actively orbiting)
- Proximity-based detection -- enemy detects player within a radius and transitions to engagement
- Orbital transfer approach -- once triggered, enemy computes a transfer orbit to player's body, consistent with the game's orbital mechanics theme
- Hit-and-run combat style -- enemies make attack passes: approach, fire during close-range window, then pull away to re-orbit. Creates breathing room between attacks
- State machine: idle (station-keeping) -> alert (player detected) -> transfer (moving to player's body) -> attack pass (approach + fire) -> disengage (pull away) -> re-orbit -> attack pass again
- Enemy kinetic rounds -- reuse existing kinetic projectile system from weapons.js SoA store but with red tracers matching Grunt archetype color (255,80,60)
- Lead prediction + error -- enemies predict where player will be and aim at predicted position, but add noise to the prediction. Better accuracy = less noise (tunable per difficulty)
- Single shot per attack pass -- one well-aimed shot during each approach run
- Brief red flash at enemy when firing -- small bright flash at enemy position gives player a split-second warning. Reuse billboard explosion at tiny scale
- White-out flash -- enemy briefly flashes bright white for ~0.2s then returns to red archetype color. Add a 10th float (flashIntensity) to the instance buffer; shader mixes white based on intensity
- Flash + explosion on missile hits -- enemy flashes white AND an explosion plays at impact point for double feedback on heavier weapons
- Smoke/sputter at low HP -- below 30% HP, enemy's edge glow flickers and dims irregularly, giving a visual cue they're almost dead
- Particle spray -- burst of small bright sparks/debris that spray outward from impact point. New particle system needed
- Enemy archetype color -- Grunt impacts produce red sparks that look like hull debris breaking off
- Small burst (5-8 particles) -- quick directional spray away from impact, short-lived (~0.3s)
- Simple outward fade -- particles spray outward in straight lines and fade to zero. No gravity effect

### Claude's Discretion
- Detection radius for player proximity (tune for gameplay feel)
- Transfer orbit computation details (simplified vs full Hohmann for enemy transfers)
- Attack pass distance and speed thresholds
- Disengage distance and re-orbit behavior
- Lead prediction algorithm specifics
- Accuracy noise magnitude per difficulty level
- Firing cooldown between attack passes
- Low-HP flicker rate and intensity
- Particle rendering approach (instanced GL_POINTS, billboard quads, etc.)
- Particle speed and size variation within the burst
- Instance buffer restructuring details for the 10th float

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENM-01 | Grunt enemy archetype -- medium speed, low HP, fires at player when in range (introduced wave 1) | AI state machine provides behavior; lead prediction + noise provides firing; enemy projectile type=2 in weapons.js SoA store provides rounds |
| ENM-06 | Enemies orbit bodies using orbital mechanics (not just flying straight at player) | Station-keeping near assigned planet (idle state); Hohmann transfer for engagement approach; re-orbit after attack pass; all using computeGravAccel leapfrog integration |
| ENM-10 | Enemies fire projectiles at the player with accuracy that increases per wave | Lead prediction with Gaussian noise; noise magnitude is the tunable accuracy parameter; per-difficulty accuracy tables |
| VFX-01 | Hit flash on enemies when projectiles connect | 10th float flashIntensity in instance buffer; shader mixes white based on intensity; decay over ~0.2s |
| VFX-02 | Projectile impact particles at hit location | New particle SoA store; GL_POINTS rendering with additive blending; red sparks for Grunt hits; 5-8 particles, ~0.3s lifetime |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WebGL 1.0 | Browser native | All rendering | Already in use; no dependencies |
| ANGLE_instanced_arrays | WebGL 1 ext | Instanced enemy + particle draw | Already in use for enemies; extend for particles if needed |
| Float32Array / Uint8Array | ES6 built-in | SoA entity stores | Established pattern across combat.js, weapons.js, missiles.js, explosions.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| computeGravAccel() | nav.js | BH-only gravity for enemy physics | Enemy position updates in transfer and re-orbit states |
| computeHohmannDV() | orbital.js | Transfer orbit delta-v | Enemy transfer burn computation |
| getBodyPosition() / getBodyVelocity() | nav.js / orbital.js | Body state lookup | Station-keeping position, transfer target |
| spawnExplosion() | explosions.js | Muzzle flash + missile hit feedback | Billboard at tiny scale (0.3x) for firing, normal scale for missile hits |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GL_POINTS for particles | Billboard quads (like explosions.js) | GL_POINTS is far simpler for tiny short-lived sparks; billboard quads are overkill for 0.3s particles |
| SoA arrays for AI state | Object per enemy | SoA is established pattern; object allocation causes GC pressure with 50+ enemies |
| Simplified Hohmann for enemies | Full N-body trajectory prediction | Full prediction is expensive per enemy per frame; simplified Hohmann with mid-course correction matches player transfer pattern |

## Architecture Patterns

### New Files
```
js/scene/
  combat.js          # MODIFIED: Add AI state arrays, flash arrays, AI tick function
  weapons.js         # MODIFIED: Add enemy projectile type=2, enemy-vs-player hit check
  particles.js       # NEW: Impact particle SoA store + GL_POINTS rendering
```

### Enemy AI State Machine (SoA Extension to combat.js)

```
State flow:
  IDLE ─── player enters detection radius ──> ALERT
  ALERT ── brief pause (0.5s) ──────────────> TRANSFER
  TRANSFER ─ arrive at player's body ───────> ATTACK_PASS
  ATTACK_PASS ─ fire + close range ─────────> DISENGAGE
  DISENGAGE ── pull away from player ───────> REORBIT
  REORBIT ── stabilize orbit ───────────────> ATTACK_PASS (loop)
```

New SoA arrays added to `enemies` object:
```javascript
// AI state machine
enemies.aiState    = new Uint8Array(MAX_ENEMIES);    // 0=idle,1=alert,2=transfer,3=attack,4=disengage,5=reorbit
enemies.aiTimer    = new Float32Array(MAX_ENEMIES);   // time in current state
enemies.assignBody = new Int8Array(MAX_ENEMIES);      // planet index assigned for station-keeping (-1=BH)
enemies.targetBody = new Int8Array(MAX_ENEMIES);      // planet the player is near (transfer destination)
enemies.hasFired   = new Uint8Array(MAX_ENEMIES);     // fired during this attack pass?

// Visual feedback
enemies.flash      = new Float32Array(MAX_ENEMIES);   // flash intensity [0-1], decays over time
```

### Pattern 1: AI State Tick (Per-Frame Update)
**What:** Each frame, iterate alive enemies and execute state-specific behavior.
**When to use:** Every frame when enemyCount > 0.

```javascript
// Replaces the simple circular orbit loop in index.html render()
function updateEnemyAI(simDt, playerPos, playerVel, playerBody) {
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    enemies.aiTimer[i] += simDt;

    // Flash decay (always runs)
    if (enemies.flash[i] > 0) {
      enemies.flash[i] = Math.max(0, enemies.flash[i] - simDt / 0.2); // 0.2s decay
    }

    switch (enemies.aiState[i]) {
      case AI_IDLE:    tickIdle(i, simDt, playerPos); break;
      case AI_ALERT:   tickAlert(i, simDt); break;
      case AI_TRANSFER: tickTransfer(i, simDt); break;
      case AI_ATTACK:  tickAttack(i, simDt, playerPos, playerVel); break;
      case AI_DISENGAGE: tickDisengage(i, simDt); break;
      case AI_REORBIT: tickReorbit(i, simDt, playerPos); break;
    }
  }
}
```

### Pattern 2: Station-Keeping (Idle State)
**What:** Enemy hovers at a fixed offset relative to their assigned planet.
**When to use:** Idle state -- before player is detected.

```javascript
function tickIdle(i, simDt, playerPos) {
  // Co-rotate with assigned planet
  const bodyIdx = enemies.assignBody[i];
  const bodyPos = getBodyPosition(bodyIdx);
  const bodyVel = getBodyVelocity(bodyIdx);

  // Station-keep: maintain fixed relative position
  // Stored as angle offset from planet center, at fixed radius
  const stationR = getBodyRadius(bodyIdx) + STATION_KEEP_ALT; // e.g., radius + 3.0
  const planetAngle = Math.atan2(bodyPos[0], bodyPos[2]);
  const stationAngle = planetAngle + enemies.stationPhase[i]; // per-enemy phase offset
  enemies.posX[i] = bodyPos[0] + stationR * Math.sin(stationAngle);
  enemies.posZ[i] = bodyPos[2] + stationR * Math.cos(stationAngle);

  // Velocity matches body orbital motion (for heading calculation)
  enemies.velX[i] = bodyVel[0];
  enemies.velZ[i] = bodyVel[2];
  enemies.heading[i] = Math.atan2(bodyVel[0], bodyVel[2]);

  // Detection: check distance to player
  const dx = playerPos[0] - enemies.posX[i];
  const dz = playerPos[2] - enemies.posZ[i];
  if (dx * dx + dz * dz < DETECT_RADIUS_SQ) {
    enemies.aiState[i] = AI_ALERT;
    enemies.aiTimer[i] = 0;
  }
}
```

### Pattern 3: Lead Prediction with Noise
**What:** Predict player future position and add accuracy-dependent noise.
**When to use:** Attack pass state when ready to fire.

```javascript
function computeLeadAim(enemyIdx, playerPos, playerVel) {
  const dx = playerPos[0] - enemies.posX[enemyIdx];
  const dz = playerPos[2] - enemies.posZ[enemyIdx];
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Time-to-target estimate (projectile speed)
  const tof = dist / KINETIC_SPEED;

  // Predicted position
  let predX = playerPos[0] + playerVel[0] * tof;
  let predZ = playerPos[2] + playerVel[2] * tof;

  // Add Gaussian-ish noise (Box-Muller approximation)
  // ACCURACY_NOISE is the tunable per-difficulty parameter (lower = more accurate)
  const u1 = Math.random(), u2 = Math.random();
  const mag = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * ACCURACY_NOISE;
  const angle = u2 * Math.PI * 2;
  predX += Math.cos(angle) * mag;
  predZ += Math.sin(angle) * mag;

  // Aim direction from enemy to predicted position
  const aimDx = predX - enemies.posX[enemyIdx];
  const aimDz = predZ - enemies.posZ[enemyIdx];
  const aimLen = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
  return [aimDx / aimLen, 0, aimDz / aimLen];
}
```

### Pattern 4: Instance Buffer Extension (9 -> 10 Floats)
**What:** Add flashIntensity as the 10th per-instance float.
**When to use:** Applied to combat.js updateInstanceBuffer() and index.html rendering setup.

```javascript
// combat.js: Pack 10 floats per instance
const instanceData = new Float32Array(MAX_ENEMIES * 10); // was 9

function updateInstanceBuffer() {
  let liveCount = 0;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    const base = liveCount * 10; // was 9
    instanceData[base]     = enemies.posX[i];
    instanceData[base + 1] = enemies.posY[i];
    instanceData[base + 2] = enemies.posZ[i];
    instanceData[base + 3] = enemies.heading[i];
    const c = ARCHETYPE_COLORS[enemies.type[i]];
    instanceData[base + 4] = c[0];
    instanceData[base + 5] = c[1];
    instanceData[base + 6] = c[2];
    instanceData[base + 7] = c[3]; // alpha used for glow intensity
    instanceData[base + 8] = enemies.scale[i];
    instanceData[base + 9] = enemies.flash[i]; // NEW: flash intensity
    liveCount++;
  }
  return liveCount;
}
```

```javascript
// index.html: Buffer allocation changes
gl.bufferData(gl.ARRAY_BUFFER, MAX_ENEMIES * 10 * 4, gl.DYNAMIC_DRAW); // was 9*4

// Attribute pointers: INST_STRIDE becomes 10*4 = 40 bytes
const INST_STRIDE = 10 * 4; // was 9*4 = 36
// a_instPos:     3 floats at offset 0   (unchanged)
// a_instHeading: 1 float  at offset 12  (unchanged)
// a_instColor:   4 floats at offset 16  (unchanged)
// a_instScale:   1 float  at offset 32  (unchanged)
// a_instFlash:   1 float  at offset 36  (NEW)
```

### Pattern 5: Shader Flash Mix
**What:** Enemy fragment shader mixes white based on flash intensity.
**When to use:** Continuous -- reads per-instance attribute.

```glsl
// Enemy vertex shader: add attribute + varying
attribute float a_instFlash;
varying float v_flash;
// In main(): v_flash = a_instFlash;

// Enemy fragment shader: add varying
varying float v_flash;
// At end of main(), before gl_FragColor:
col = mix(col, vec3(3.0), v_flash); // white-out when flash = 1.0
```

### Pattern 6: Low-HP Flicker
**What:** Below 30% HP, enemy glow flickers irregularly.
**When to use:** Computed in updateInstanceBuffer or shader.

```javascript
// In updateInstanceBuffer, modify alpha (glow intensity):
const hpRatio = enemies.hp[i] / ARCHETYPE_HP[enemies.type[i]];
let alpha = c[3]; // base glow
if (hpRatio < 0.3) {
  // Irregular flicker using cheap hash of time + enemy index
  const flicker = Math.sin(simTime * 15 + i * 7.3) * Math.sin(simTime * 23 + i * 13.1);
  alpha *= 0.3 + 0.7 * Math.max(0, flicker); // dims to 30% of base, flickering
}
instanceData[base + 7] = alpha;
```

### Anti-Patterns to Avoid
- **Allocating objects in the AI tick loop:** No `new Array()`, no object literals per frame. Use pre-allocated scratch arrays for intermediate calculations.
- **Full N-body gravity for 50 enemies:** Use BH-only gravity for enemy physics (existing project decision). `computeGravAccel` already handles this correctly.
- **Separate draw call per particle:** Must batch all particles into a single GL_POINTS draw call with a shared buffer.
- **Modifying instance stride without updating ALL attribute offsets:** The stride change from 36 to 40 bytes affects every vertexAttribPointer and divisor call. Miss one and you get corrupted rendering.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gravity computation | Custom gravity for enemies | `computeGravAccel()` from nav.js | Already handles BH + planet gravity with WASM positions; tested and battle-hardened |
| Hohmann delta-v | Manual orbit math | `computeHohmannDV()` from orbital.js | Vis-viva equation already correct; returns dv + transferTime |
| Body positions | Track planet positions separately | `getBodyPosition()` / `getBodyVelocity()` from nav.js/orbital.js | Handles BH, planets 0-5 (WASM), planet 6 (JS), L-points |
| Muzzle flash visual | New flash rendering system | `spawnExplosion(x, 0, z, 0.6)` from explosions.js | Billboard system already exists; spawn at tiny scale for muzzle flash effect |
| Missile hit explosion | Custom explosion for missiles | `spawnExplosion()` at normal scale + flash the enemy | Already wired; just need to call both on hit |
| Random number distribution | Complex RNG | Box-Muller with Math.random() | Gaussian-ish distribution sufficient for aim noise; no need for proper PRNG |

**Key insight:** The codebase has a rich set of orbital mechanics helpers that were built for the player ship. Enemy AI should reuse these same functions, not re-derive the math. The main adaptation is calling them per-enemy rather than once per frame.

## Common Pitfalls

### Pitfall 1: Instance Buffer Stride Mismatch
**What goes wrong:** Changing instance data from 9 to 10 floats per instance without updating ALL six locations that reference the stride: (1) instanceData array size, (2) GL buffer allocation, (3) INST_STRIDE constant, (4) bufferSubData length calculation, (5) each vertexAttribPointer offset. Missing any one causes garbled rendering.
**Why it happens:** The stride is a local `const` inside the render function, not a shared constant. Easy to miss the allocation or subarray slicing.
**How to avoid:** Make the instance stride a module-level constant (e.g., `const ENEMY_INST_FLOATS = 10`) and derive all sizes/offsets from it. Change once, affects everywhere.
**Warning signs:** Enemies render as stretched/distorted shapes, or flash data bleeds into position data.

### Pitfall 2: AI State Desync on Enemy Death
**What goes wrong:** Enemy dies (removeEnemy) mid-attack-pass but still has a projectile in flight referencing it. Or enemy is removed but AI timer keeps running because alive check is inconsistent.
**Why it happens:** Free-list reuse means slot index can be reused for a new enemy. Old references to that slot now point to the new enemy.
**How to avoid:** Always check `enemies.alive[i]` at the start of every AI tick. Clear all state arrays in `removeEnemy()`. For projectile ownership, check alive status when the projectile hits (already done in checkProjectileHits).
**Warning signs:** Enemies suddenly teleport to different positions, or newly spawned enemies start mid-attack-pass.

### Pitfall 3: Station-Keeping Drift
**What goes wrong:** Enemies in idle state slowly drift away from their assigned planet because planet position is computed from time-varying phase (sp * simTime + ph) and any floating-point accumulation causes drift.
**Why it happens:** Computing enemy position as planet_pos + offset each frame uses the current planet position, which is correct. But if you try to do physics integration for idle enemies (velocity-based), the position will drift due to numerical errors.
**How to avoid:** In idle state, set enemy position directly from planet position + offset each frame (kinematic, not physics-based). Only switch to physics integration when transitioning to transfer state.
**Warning signs:** Idle enemies slowly drift away from their planet over 30+ seconds.

### Pitfall 4: Enemy Projectiles Hitting Other Enemies
**What goes wrong:** Enemy rounds (type=2) pass through radial bin collision checks and hit other enemies instead of the player.
**Why it happens:** `checkProjectileHits()` currently checks ALL projectiles against ALL enemies. It doesn't distinguish between player projectiles (should hit enemies) and enemy projectiles (should hit player only).
**How to avoid:** In the hit detection loop, filter by projectile type: type 0/1 (player kinetic/plasma) check against enemies. Type 2 (enemy kinetic) checks against player position only.
**Warning signs:** Enemies kill each other; player never takes damage (which doesn't exist yet, but the hit detection should be correct for Phase 6).

### Pitfall 5: simDt Scaling Not Applied to AI Timers
**What goes wrong:** AI state transitions happen at wrong times because timers use raw dt instead of simDt (which is scaled by BULLET_TIME_SCALE or FAST_FORWARD_SCALE).
**Why it happens:** The render loop passes simDtSec to updateProjectiles/updateMissiles/updateNav, but a new AI update function might accidentally use raw dtSec.
**How to avoid:** The AI update function receives simDt (already scaled), same as all other update functions. All timers/cooldowns use simTime (accumulated sim time), not wall clock time.
**Warning signs:** Enemies behave at different speeds depending on bullet-time/fast-forward state.

### Pitfall 6: Transfer Orbit Overshooting
**What goes wrong:** Enemy transfer orbit overshoots the target body because simplified Hohmann assumes circular starting orbit, but enemy might be coming from station-keeping at a different velocity.
**Why it happens:** Station-keeping velocity is the planet's orbital velocity (co-rotation), not a circular orbit around the BH at that radius. The Hohmann dv calculation assumes circular BH orbit.
**How to avoid:** Use the vis-viva approach (same as player retargeting in nav.js): compute actual enemy velocity, then required transfer velocity, take the difference. Add mid-course guidance correction (same pattern as player transfers).
**Warning signs:** Enemies fly past the target body and keep going, never arriving at the player.

## Code Examples

### Enemy Projectile Firing
```javascript
// Spawn enemy kinetic round (type=2) with red tracer color
function enemyFireAt(enemyIdx, aimDir) {
  const vx = enemies.velX[enemyIdx] + aimDir[0] * KINETIC_SPEED;
  const vz = enemies.velZ[enemyIdx] + aimDir[2] * KINETIC_SPEED;
  spawnProjectile(2, enemies.posX[enemyIdx], enemies.posZ[enemyIdx], vx, vz);

  // Muzzle flash: spawn tiny billboard explosion at enemy position
  spawnExplosion(enemies.posX[enemyIdx], 0, enemies.posZ[enemyIdx], 0.6);
}
```

### Hit Detection Extension (Player Projectile -> Enemy + Enemy Projectile -> Player)
```javascript
function checkProjectileHits() {
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    if (!proj.alive[i]) continue;

    if (proj.type[i] <= 1) {
      // PLAYER projectile: check against enemies (existing logic)
      const r = Math.sqrt(proj.posX[i] ** 2 + proj.posZ[i] ** 2);
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
          // HIT: apply damage + flash + particles
          const dmg = proj.type[i] === 0 ? KINETIC_DAMAGE : PLASMA_DAMAGE;
          enemies.hp[ci] -= dmg;
          enemies.flash[ci] = 1.0; // trigger white-out flash
          spawnImpactParticles(proj.posX[i], proj.posZ[i], enemies.type[ci]);
          if (enemies.hp[ci] <= 0) removeEnemy(ci);
          removeProjectile(i);
          break;
        }
      }
    } else if (proj.type[i] === 2) {
      // ENEMY projectile: check against player only
      const dx = proj.posX[i] - flyPos[0];
      const dz = proj.posZ[i] - flyPos[2];
      if (dx * dx + dz * dz < HIT_RADIUS_KINETIC * HIT_RADIUS_KINETIC) {
        // Player hit! (damage deferred to Phase 6, but register the hit)
        removeProjectile(i);
      }
    }
  }
}
```

### Particle System (New: particles.js)
```javascript
const MAX_PARTICLES = 256;
const PARTICLE_LIFETIME = 0.3;

const particle = {
  alive: new Uint8Array(MAX_PARTICLES),
  posX:  new Float32Array(MAX_PARTICLES),
  posZ:  new Float32Array(MAX_PARTICLES),
  velX:  new Float32Array(MAX_PARTICLES),
  velZ:  new Float32Array(MAX_PARTICLES),
  age:   new Float32Array(MAX_PARTICLES),
  r:     new Float32Array(MAX_PARTICLES), // color red
  g:     new Float32Array(MAX_PARTICLES), // color green
  b:     new Float32Array(MAX_PARTICLES), // color blue
};
const particleFreeSlots = [];
for (let i = MAX_PARTICLES - 1; i >= 0; i--) particleFreeSlots.push(i);
let particleCount = 0;

function spawnImpactParticles(hitX, hitZ, enemyType) {
  const color = ARCHETYPE_COLORS[enemyType];
  const count = 5 + Math.floor(Math.random() * 4); // 5-8 particles
  for (let n = 0; n < count; n++) {
    if (particleFreeSlots.length === 0) return;
    const idx = particleFreeSlots.pop();
    const angle = Math.random() * Math.PI * 2;
    const speed = 15 + Math.random() * 25; // 15-40 units/s outward
    particle.alive[idx] = 1;
    particle.posX[idx] = hitX;
    particle.posZ[idx] = hitZ;
    particle.velX[idx] = Math.cos(angle) * speed;
    particle.velZ[idx] = Math.sin(angle) * speed;
    particle.age[idx] = 0;
    particle.r[idx] = color[0];
    particle.g[idx] = color[1];
    particle.b[idx] = color[2];
    particleCount++;
  }
}

function updateParticles(simDt) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!particle.alive[i]) continue;
    particle.age[i] += simDt;
    if (particle.age[i] >= PARTICLE_LIFETIME) {
      particle.alive[i] = 0;
      particleFreeSlots.push(i);
      particleCount--;
      continue;
    }
    particle.posX[i] += particle.velX[i] * simDt;
    particle.posZ[i] += particle.velZ[i] * simDt;
  }
}
```

### Particle Rendering (GL_POINTS, additive blend)
```javascript
// Render particles using the existing trajectory shader (trajPg)
// Same pattern as renderProjectiles() in weapons.js
function renderParticles(gl, trajPg, trajLocs, vpMat, projGlBuf) {
  if (particleCount === 0) return;

  gl.useProgram(trajPg);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive for bright sparks
  gl.uniformMatrix4fv(trajLocs.uMvp, false, vpMat);
  gl.bindBuffer(gl.ARRAY_BUFFER, projGlBuf);
  gl.enableVertexAttribArray(trajLocs.aPos);

  // Pack alive particles into render buffer
  // Group by color for batched draw calls (typically only 1 color for Grunts)
  let count = 0;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!particle.alive[i]) continue;
    const alpha = 1.0 - particle.age[i] / PARTICLE_LIFETIME;
    projRenderBuf[count * 3]     = particle.posX[i];
    projRenderBuf[count * 3 + 1] = 0;
    projRenderBuf[count * 3 + 2] = particle.posZ[i];
    count++;
  }
  if (count > 0) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, projRenderBuf.subarray(0, count * 3));
    gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);
    // Grunt red color for sparks
    gl.uniform4f(trajLocs.uColor, 1.0, 0.314, 0.235, 0.8);
    gl.uniform1f(trajLocs.uPtSize, 3.0);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disableVertexAttribArray(trajLocs.aPos);
}
```

### Enemy Transfer Orbit (Simplified Hohmann)
```javascript
function initiateEnemyTransfer(enemyIdx, targetBodyIdx) {
  const ePos = [enemies.posX[enemyIdx], 0, enemies.posZ[enemyIdx]];
  const eVel = [enemies.velX[enemyIdx], 0, enemies.velZ[enemyIdx]];

  // Current orbital radius from BH
  const shipR = Math.sqrt(ePos[0] * ePos[0] + ePos[2] * ePos[2]);

  // Target body orbital radius
  const targetPos = getBodyPosition(targetBodyIdx);
  const targetR = Math.sqrt(targetPos[0] * targetPos[0] + targetPos[2] * targetPos[2]);

  // Vis-viva: required transfer velocity at current radius
  const a_transfer = (shipR + targetR) / 2;
  const v_transfer = Math.sqrt(BH_GM * (2 / shipR - 1 / a_transfer));

  // Current speed
  const v_current = Math.sqrt(eVel[0] * eVel[0] + eVel[2] * eVel[2]);
  const dv = v_transfer - v_current;

  // Prograde burn direction
  const spd = v_current || 1;
  const burnDirX = eVel[0] / spd;
  const burnDirZ = eVel[2] / spd;

  // Apply impulse
  enemies.velX[enemyIdx] += burnDirX * dv;
  enemies.velZ[enemyIdx] += burnDirZ * dv;

  // Store target for mid-course guidance
  enemies.targetBody[enemyIdx] = targetBodyIdx;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Simple circular orbit (Phase 1 test) | AI state machine with orbital transfers | Phase 5 | Enemies are reactive combatants, not passive targets |
| 9-float instance buffer (no flash) | 10-float instance buffer with flash | Phase 5 | Enables per-enemy visual feedback without uniform overhead |
| Player-only hit detection | Bidirectional hit detection (player<->enemy) | Phase 5 | Enemy projectiles can register hits; player projectiles deal damage |
| No enemy weapons | Type=2 enemy kinetic rounds | Phase 5 | Enemies fight back, creating actual combat |

**What stays the same:**
- SoA entity store pattern (combat.js) -- extended, not replaced
- Radial bin collision (combat.js) -- used for both player and enemy projectiles
- Leapfrog integration for gravity-affected physics -- used for enemy transfers
- Ecliptic plane lock (Y=0) for all entities

## Design Recommendations (Claude's Discretion Areas)

### Detection Radius
**Recommendation:** 40 world units. At nav-mode scale (oR values 28-86 doubled to 56-172), this is roughly half the distance between adjacent planet orbits. Enemies detect the player when they enter the "neighborhood" of the planet, not when they're across the system.

### Transfer Orbit Approach
**Recommendation:** Simplified Hohmann with vis-viva delta-v (same approach as player retargeting). Add mid-course guidance correction identical to the player's (`GUIDANCE_ACCEL = 3.0`, off-course correction). This reuses tested code and gives enemies realistic-looking curved approach paths.

### Attack Pass Distance/Speed
**Recommendation:** Attack pass begins when enemy is within 15 units of the player. Enemy fires when within 10 units (single shot). Disengage triggers when enemy passes within 5 units OR after firing. Enemy speed during attack ~80% of circular orbit velocity at that radius (fast but not faster than kinetic rounds).

### Disengage and Re-orbit
**Recommendation:** On disengage, apply a small retrograde impulse to push the enemy into a wider orbit (raising apoapsis). After 2-3 seconds of coasting, check if enemy is > 20 units from player -- if so, transition to re-orbit. Re-orbit circularizes at current radius using `circularizeOrbit()` from orbital.js, then immediately transitions back to attack pass for the next run.

### Lead Prediction Details
**Recommendation:** Linear extrapolation (position + velocity * time-of-flight). TOF estimated as distance / KINETIC_SPEED. No iterative refinement needed -- the noise makes precise prediction unnecessary. The player moves slowly enough in orbit that linear extrapolation is sufficient.

### Accuracy Noise
**Recommendation:** Noise magnitude in world units, applied to the predicted position:
- Easy: 8.0 (barely hits at close range)
- Normal: 4.0 (hits ~50% at medium range)
- Hard: 2.0 (hits ~80%, punishing)
For Phase 5, use a single constant (e.g., `ACCURACY_NOISE = 5.0`) and defer difficulty scaling to Phase 7 (wave system).

### Firing Cooldown Between Passes
**Recommendation:** Not a cooldown per se -- the natural orbital mechanics create the cooldown. An attack pass takes ~3-5 seconds (approach + fire + disengage + re-orbit). This is the inherent breathing room. No artificial timer needed beyond the state machine transitions.

### Low-HP Flicker
**Recommendation:** Compute in `updateInstanceBuffer()` using a cheap oscillation: `sin(simTime*15 + idx*7.3) * sin(simTime*23 + idx*13.1)`. This produces irregular-looking flicker without expensive noise. Apply only to the alpha channel of the instance color (which controls glow intensity in the shader). HP threshold: < 30% of max HP.

### Particle Rendering Approach
**Recommendation:** GL_POINTS using the existing trajectory shader program (`trajPg`). This is the simplest approach -- particles are just colored points with additive blending, exactly like kinetic round heads. No new shader needed. 256-slot SoA store (4x the max 64 enemies, since each hit spawns 5-8 particles).

### Particle Speed/Size
**Recommendation:** Speed 15-40 units/s (random per particle), point size 3.0 pixels (bright), fading to 0 over 0.3s lifetime. Particles are purely visual -- no collision, no gravity (per user decision). Color matches the archetype color of the hit enemy (red for Grunts).

## Open Questions

1. **Enemy spawn locations for Phase 5 testing**
   - What we know: Phase 1 test spawns 50 enemies randomly across 20-70 radius. Phase 5 needs enemies assigned to specific planets for station-keeping to work.
   - What's unclear: Should spawnTestEnemies be updated to distribute enemies among planets, or should a proper spawn system be built?
   - Recommendation: Update spawnTestEnemies to assign 7-8 enemies per planet with random stationPhase offsets. Proper wave spawning is Phase 7 scope.

2. **Enemy projectile rendering color**
   - What we know: User decided on red tracers matching Grunt color (255,80,60). Current kinetic rendering in renderProjectiles uses white/yellow.
   - What's unclear: Should enemy rounds use the same render path with different color, or separate render pass?
   - Recommendation: Separate batch within renderProjectiles -- after player kinetic heads, iterate type=2 projectiles and draw with red color uniform. Minimal code addition.

3. **Damage values for player weapons**
   - What we know: checkProjectileHits currently has "TODO Phase 6: enemies.hp[ci] -= damage". Phase 5 needs damage to trigger flash and death.
   - What's unclear: What damage values should kinetic/plasma/missile weapons deal? Enemy HP is 100 (ARCHETYPE_HP[GRUNT]).
   - Recommendation: Set initial values for testing: kinetic=15 (7 hits to kill), plasma=35 (3 hits), regular missile=50 (2 hits), nuclear=100+ (1 hit). These can be retuned in Phase 7 balance pass.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based regression tests (tests.html) + visual inspection |
| Config file | tests.html |
| Quick run command | Open `http://localhost:8000/tests.html` in browser |
| Full suite command | Same + manual visual test in nav mode |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENM-01 | Grunt enemies fire at player in range | manual | Visual: enter nav mode, approach enemies, observe firing | N/A |
| ENM-06 | Enemies orbit bodies using orbital mechanics | manual | Visual: observe idle enemies co-rotating with planets, transfer approach | N/A |
| ENM-10 | Enemies fire projectiles with tunable accuracy | manual | Visual: observe enemy shots landing near player with spread | N/A |
| VFX-01 | Hit flash on enemies when projectiles connect | manual | Visual: fire at enemy, observe white flash | N/A |
| VFX-02 | Impact particles at hit location | manual | Visual: fire at enemy, observe red spark burst | N/A |

### Sampling Rate
- **Per task commit:** Visual inspection in browser (nav mode, approach enemies, fire weapons, observe feedback)
- **Per wave merge:** Full visual test of all behaviors + tests.html for shader invariant regression
- **Phase gate:** All 5 behaviors visually confirmed + tests.html green

### Wave 0 Gaps
- [ ] `js/scene/particles.js` -- new file for impact particle system (SoA store + rendering)
- [ ] Enemy AI state arrays added to `combat.js` -- extend existing SoA store
- [ ] Instance buffer stride change (9->10) -- atomic change across combat.js, shaders.js, index.html
- [ ] Enemy shader modification -- add a_instFlash attribute and white-mix logic

*(All are implementation tasks, not test infrastructure gaps. No automated test framework changes needed.)*

## Sources

### Primary (HIGH confidence)
- `js/scene/combat.js` -- Current enemy SoA store structure, instance buffer packing, radial bins
- `js/scene/weapons.js` -- Projectile SoA store, checkProjectileHits, renderProjectiles pattern
- `js/scene/explosions.js` -- Billboard explosion pattern (reuse for muzzle flash)
- `js/scene/nav.js` -- computeGravAccel, flyVel/flyPos globals, leapfrog integration, simDt scaling
- `js/scene/orbital.js` -- computeHohmannDV, circularizeOrbit, getBodyVelocity, getBodyPosition
- `js/scene/shaders.js` -- Enemy vertex/fragment shader source, trajectory shader (trajPg)
- `index.html` -- Render loop, enemy update section (lines 619-633), instance buffer setup, attribute binding

### Secondary (MEDIUM confidence)
- `.planning/phases/01-combat-rendering-foundation/01-RESEARCH.md` -- Instance buffer design rationale, attribute budget analysis
- `.planning/phases/04-missile-systems-explosions/04-RESEARCH.md` -- Billboard explosion system design, additive blending pattern

### Tertiary (LOW confidence)
- None -- all findings derived directly from codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools are existing codebase patterns, no new libraries
- Architecture: HIGH -- all patterns derived from direct code reading of combat.js, weapons.js, nav.js, orbital.js
- Pitfalls: HIGH -- identified from actual code structure (instance stride, hit detection filtering, simDt scaling)
- AI design: MEDIUM -- state machine design is standard game AI pattern, but tuning values (detection radius, noise, speeds) need gameplay testing

**Research date:** 2026-03-10
**Valid until:** No expiration (codebase-specific research, no external dependency versioning)
