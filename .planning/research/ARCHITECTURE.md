# Architecture Patterns

**Domain:** Tactical orbital combat system layered on existing WebGL black hole scene
**Researched:** 2026-03-09

## Existing Architecture (What We Build On)

Before defining the combat architecture, here is how the current system works. Every design decision must respect these constraints.

### Current Render Pipeline (per frame)

```
requestAnimationFrame(render)
  |
  +-- Compute dt, simTime
  +-- Write cam/mouse to WASM shared memory
  +-- WASM frame(): planet positions, camera matrix, hover detection (planets 0-5)
  +-- JS: planet 6 position (not in WASM)
  +-- JS: updateNav(simDt) -- Verlet integration of ship physics
  +-- JS: updateMissiles(simDt) -- PN guidance, trail recording
  |
  +-- GL Pass 1: Full-screen ray march (pg program)
  |     - 250-iteration Verlet ray march per pixel
  |     - Accretion disk, planets, Saturn rings, detonations
  |     - THE bottleneck -- do not add anything here
  |
  +-- if (flyMode):
  |     GL Pass 2: Ship geometry (shipPg program)
  |       - Box geometry, MVP transform, Phong lighting
  |     GL Pass 3: Each missile (shipPg reused, per-missile draw call)
  |     GL Pass 4: Trajectory lines/points (trajPg program)
  |       - Trajectory preview, aim line, missile trails, target markers
  |       - Uses GL_POINTS and GL_LINES with alpha blend
  |
  +-- DOM updates: HUD text, planet labels, FPS counter
```

### Current GL Programs

| Program | Purpose | Vertex Format | Draw Type |
|---------|---------|---------------|-----------|
| `pg` | Ray march background | 2D quad (a_pos) | TRIANGLE_STRIP, 4 verts |
| `shipPg` | Ship + missiles | 3D box (a_shipPos, a_shipNormal) | ELEMENTS, 36 indices |
| `trajPg` | Lines/points overlay | 3D position (a_trajPos) | POINTS + LINES |

### Key Constraints Derived from Existing Code

1. **WebGL 1.0 only** -- no WebGL 2 features natively, but extensions available
2. **Single canvas, single GL context** -- all passes share one context
3. **Ray march is pass 1** -- combat passes must come AFTER, compositing via depth buffer clear + re-enable
4. **flyMode gate** -- all nav/combat rendering gated behind `if(flyMode)`
5. **Bullet time** -- simDt is already scaled by `BULLET_TIME_SCALE` (0.03x), combat must use same simDt
6. **Y=0 plane** -- ship and missiles are clamped to Y=0. Combat operates on the ecliptic plane (2.5D)
7. **Pre-allocated scratch arrays** -- zero per-frame allocation pattern already established
8. **WASM shared memory** -- planet positions read from DataView at known offsets

---

## Recommended Architecture

### System Overview

```
                    INPUT
                      |
          +-----------+-----------+
          |                       |
    Mouse/Keyboard          Game Clock (simDt)
          |                       |
          v                       v
  +---------------+     +------------------+
  | Input Router  |     | Wave Spawner     |
  | (mode-aware)  |     | (kill-triggered) |
  +-------+-------+     +--------+---------+
          |                       |
          v                       v
  +---------------+     +------------------+
  | Targeting     |     | Entity Store     |
  | System        |<--->| (SoA arrays)     |
  +-------+-------+     +--------+---------+
          |                       |
          v                       v
  +---------------+     +------------------+
  | Weapon        |     | Physics System   |
  | Controller    |     | (gravity+motion) |
  +-------+-------+     +--------+---------+
          |                       |
          +----------+------------+
                     |
                     v
          +----------+----------+
          | Collision System    |
          | (radial bins)       |
          +----------+----------+
                     |
          +----------+----------+
          | Damage / Death      |
          | System              |
          +----------+----------+
                     |
        +------------+------------+
        |            |            |
        v            v            v
  +-----------+ +-----------+ +---------+
  | Enemy     | | Projectile| | Sprite  |
  | Renderer  | | Renderer  | | Renderer|
  | (instanced| | (instanced| | (explo- |
  |  boxes)   | |  lines)   | |  sions) |
  +-----------+ +-----------+ +---------+
        |            |            |
        +------------+------------+
                     |
                     v
              +------+------+
              | HUD Update  |
              | (DOM manip) |
              +-------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With | File |
|-----------|---------------|-------------------|------|
| **Entity Store** | SoA arrays for all combat entities (enemies, projectiles, shields) | Everything reads/writes | `js/scene/entities.js` |
| **Wave Spawner** | Decides when/where/what to spawn, difficulty scaling | Entity Store, Game State | `js/scene/waves.js` |
| **Input Router** | Extends existing keydown/mouse handlers for combat keybinds | Targeting, Weapon Controller | `js/scene/combat-input.js` |
| **Targeting System** | Tactical zoom-out view, enemy selection, target queue | Entity Store, Input, Weapon Controller | `js/scene/targeting.js` |
| **Weapon Controller** | Weapon selection, ammo/cooldown tracking, fire commands | Entity Store, Targeting | `js/scene/weapons.js` |
| **Physics System** | Gravity + velocity integration for enemies/projectiles | Entity Store, existing `computeGravAccel()` | `js/scene/combat-physics.js` |
| **Collision System** | Radial bin spatial partitioning, hit detection | Entity Store, Damage System | `js/scene/collision.js` |
| **Damage System** | Apply damage, track hull/shield, trigger death/explosion | Entity Store, Sprite Renderer, Wave Spawner | `js/scene/damage.js` |
| **Enemy Renderer** | Instanced draw call for all enemies | Entity Store, GL context | `js/scene/enemy-renderer.js` |
| **Projectile Renderer** | Instanced draw call for all projectiles | Entity Store, GL context | `js/scene/projectile-renderer.js` |
| **Sprite Renderer** | Billboard quads for small explosions | Entity Store, GL context | `js/scene/sprite-renderer.js` |
| **Combat HUD** | DOM-based hull/shield/ammo/wave display | Game State, DOM | `js/scene/combat-hud.js` |

### Why Not a Full ECS Framework

A formal ECS library (ape-ecs, bitecs, etc.) adds complexity and dependency for a system with only 3-4 entity types and ~10 components. Instead, use the **Structure of Arrays (SoA) pattern** -- the performance benefit of ECS (cache-friendly iteration) without the framework overhead. This is the right tradeoff for a no-npm, no-build-tools project with a bounded entity count (50-100 entities max).

---

## Data Flow

### Per-Frame Update Order

This is the critical ordering. Each step depends on outputs from the previous step.

```
1. INPUT PHASE
   - Process queued input events (already handled by DOM event listeners)
   - Update targeting state (selected targets, weapon selection)

2. SPAWN PHASE
   - Wave spawner checks: all enemies dead? -> spawn next wave
   - Create new entities in Entity Store

3. AI PHASE
   - Enemy decision: choose target, choose weapon, fire
   - Updates enemy intent (desired velocity, fire flag)

4. PHYSICS PHASE
   - For all entities with velocity: Verlet integration with gravity
   - Clamp to Y=0 plane
   - Update forward vectors from velocity

5. COLLISION PHASE
   - Rebuild radial bins from entity positions
   - Check projectile-vs-enemy hits
   - Check projectile-vs-player hits
   - Check projectile-vs-shield hits
   - Emit hit events (damage amount, position)

6. DAMAGE PHASE
   - Apply damage from collision hits
   - Destroy entities at 0 hull
   - Spawn explosion sprites at death positions
   - Update wave spawner kill count

7. CLEANUP PHASE
   - Remove dead entities (swap-remove from SoA arrays)
   - Remove expired explosion sprites
   - Remove out-of-bounds projectiles

8. RENDER PHASE (GL calls)
   - [existing] Ray march pass
   - [existing] Player ship pass
   - [new] Enemy instanced pass
   - [new] Projectile instanced pass
   - [existing] Trajectory/line pass
   - [new] Sprite billboard pass (explosions)
   - [existing+new] HUD DOM update
```

### Data Flow Diagram

```
Player Input -----> Targeting System ----> Weapon Controller ----> Entity Store
                         |                      |                  (new projectile)
                         |                      |
                    [target list]           [fire command]
                         |                      |
                         v                      v
                    Combat HUD            Physics System
                    (highlight              (integrate all
                     targets)                entities)
                                               |
                                               v
                                         Collision System
                                         (radial bins)
                                               |
                                          +----+----+
                                          |         |
                                          v         v
                                     Damage      Sprite
                                     System      Renderer
                                          |    (explosion)
                                          v
                                     Wave Spawner
                                     (check if
                                      wave clear)
```

---

## Entity Store: Structure of Arrays (SoA)

Use typed arrays for all entity data. This avoids GC pressure and enables cache-friendly iteration.

### Entity Types

```javascript
// Maximum entity counts (pre-allocated)
const MAX_ENEMIES = 64;
const MAX_PROJECTILES = 256;  // player + enemy projectiles combined
const MAX_EXPLOSIONS = 32;
const MAX_SHIELDS = 8;        // kinetic shield debris pieces

// Enemy SoA
const enemyCount = { value: 0 };
const enemyPosX   = new Float32Array(MAX_ENEMIES);
const enemyPosZ   = new Float32Array(MAX_ENEMIES);
const enemyVelX   = new Float32Array(MAX_ENEMIES);
const enemyVelZ   = new Float32Array(MAX_ENEMIES);
const enemyFwdX   = new Float32Array(MAX_ENEMIES);
const enemyFwdZ   = new Float32Array(MAX_ENEMIES);
const enemyHull   = new Float32Array(MAX_ENEMIES);  // hit points
const enemyType   = new Uint8Array(MAX_ENEMIES);    // 0=grunt, 1=fast, 2=heavy, 3=boss
const enemyState  = new Uint8Array(MAX_ENEMIES);    // 0=orbit, 1=attack, 2=flee
const enemyCooldown = new Float32Array(MAX_ENEMIES); // weapon cooldown timer
const enemyOrbitBody = new Int8Array(MAX_ENEMIES);   // -1=BH, 0-6=planet index
const enemyOrbitR = new Float32Array(MAX_ENEMIES);   // current orbit radius
const enemyOrbitPh = new Float32Array(MAX_ENEMIES);  // current orbit phase

// Projectile SoA
const projCount = { value: 0 };
const projPosX   = new Float32Array(MAX_PROJECTILES);
const projPosZ   = new Float32Array(MAX_PROJECTILES);
const projVelX   = new Float32Array(MAX_PROJECTILES);
const projVelZ   = new Float32Array(MAX_PROJECTILES);
const projType   = new Uint8Array(MAX_PROJECTILES);  // 0=kinetic, 1=plasma, 2=missile, 3=enemy
const projOwner  = new Int8Array(MAX_PROJECTILES);   // -1=player, 0-63=enemy index
const projLife   = new Float32Array(MAX_PROJECTILES); // remaining lifetime/fuel
const projDamage = new Float32Array(MAX_PROJECTILES);

// Explosion SoA (sprite billboard)
const exploCount = { value: 0 };
const exploPosX  = new Float32Array(MAX_EXPLOSIONS);
const exploPosZ  = new Float32Array(MAX_EXPLOSIONS);
const exploAge   = new Float32Array(MAX_EXPLOSIONS);
const exploSize  = new Float32Array(MAX_EXPLOSIONS);  // max radius
const exploType  = new Uint8Array(MAX_EXPLOSIONS);    // 0=small, 1=medium
```

### Why SoA Instead of AoS

- **Cache lines**: Iterating `enemyPosX[0..n]` loads contiguous memory. An array of objects scatters position data across heap allocations.
- **SIMD-friendly**: Typed arrays can be uploaded directly to GL buffers.
- **Zero GC**: No object creation/destruction per frame. Swap-remove to "delete" entities.
- **Matches GL instanced rendering**: The position arrays can feed directly into vertex attribute buffers.

---

## Collision System: Radial Bins

The orbital structure of the game provides a natural spatial partitioning scheme. Instead of a 2D grid, use **radial bins** based on distance from the black hole.

### Why Radial Bins

All entities orbit the black hole. Their positions cluster along radial shells. A radial bin scheme exploits this by dividing space into concentric rings:

```
        +---------+
       /   bin 5   \      r > 80
      /  +---------+ \
     /  /   bin 4   \ \   60 < r < 80
    /  /  +-------+  \ \
   /  /  /  bin 3  \  \ \  40 < r < 60
  /  /  / +------+  \  \ \
 /  /  / / bin 2  \  \  \ \ 20 < r < 40
|  |  | | bin 1  | |  |  |  10 < r < 20
|  |  | |  BH    | |  |  |  r < 10 (death zone)
 \  \  \ \       /  /  / /
  \  \  \ +------+ /  / /
   \  \  +--------+  / /
    \  +-----------+ / /
     +---------------+
```

### Implementation

```javascript
const RADIAL_BIN_COUNT = 8;
const RADIAL_BIN_WIDTH = 15.0;  // each bin covers 15 world units of radius
const RADIAL_BIN_MIN = 5.0;     // bin 0 starts at r=5

// Each bin stores indices into entity arrays
const binEnemies = new Array(RADIAL_BIN_COUNT);  // arrays of indices
const binProjectiles = new Array(RADIAL_BIN_COUNT);

function getBin(x, z) {
  const r = Math.sqrt(x * x + z * z);
  const bin = Math.floor((r - RADIAL_BIN_MIN) / RADIAL_BIN_WIDTH);
  return Math.max(0, Math.min(RADIAL_BIN_COUNT - 1, bin));
}

// Collision check: only test entities in same bin and adjacent bins
function checkCollisions() {
  rebuildBins();
  for (let b = 0; b < RADIAL_BIN_COUNT; b++) {
    const projInBin = binProjectiles[b];
    // Check against enemies in bins b-1, b, b+1
    for (let db = -1; db <= 1; db++) {
      const eb = b + db;
      if (eb < 0 || eb >= RADIAL_BIN_COUNT) continue;
      const enemiesInBin = binEnemies[eb];
      // Pairwise check within these small sets
      testProjectilesVsEnemies(projInBin, enemiesInBin);
    }
  }
}
```

### Complexity

With 50 enemies and 100 projectiles spread across 8 bins, average per-bin count is ~6 enemies and ~12 projectiles. Pairwise checks within adjacent bins: ~18 enemies x ~36 projectiles = ~648 checks per frame, versus 5000 for brute-force O(n^2). The overhead of bin rebuild is O(n) which is negligible.

---

## Rendering Architecture

### Enemy Renderer: Instanced Drawing

Use `ANGLE_instanced_arrays` extension for WebGL 1.0 to render all enemies in a single draw call.

```
Setup:
  1. Get ANGLE_instanced_arrays extension
  2. Create enemy shader program (enemyPg)
  3. Create shared box geometry buffers (reuse createBoxGeometry)
  4. Create instance data buffer (positions + colors + scales)

Per frame:
  1. Pack enemy positions into Float32Array instance buffer
  2. Upload to GPU via gl.bufferSubData
  3. Set vertex attribute divisors (1 = per-instance)
  4. Call drawElementsInstancedANGLE(gl.TRIANGLES, 36, type, 0, enemyCount)
```

**LOD System** (from PROJECT.md constraints):
- Distance < 50 units from camera: Full box geometry (instanced)
- Distance 50-200: Billboard quad (instanced, different program)
- Distance > 200: Skip rendering entirely

This means two instanced draw calls per frame at most: one for nearby enemies (boxes), one for distant enemies (billboards). Both are single draw calls regardless of enemy count.

### Projectile Renderer: Instanced Points/Lines

Kinetic cannon rounds and plasma bolts are small enough to render as GL_POINTS with the trajectory shader program (`trajPg`), extended with instancing:

```
- Kinetic rounds: GL_POINTS, size 3-4px, white/gray
- Plasma bolts: GL_POINTS, size 6-8px, with glow color
- Missile trails: GL_LINES (existing pattern)
```

Since projectiles are tiny, no box geometry needed. Points are sufficient and extremely cheap.

### Sprite Renderer: Billboard Explosions

Small explosions use screen-space billboards -- textured quads that always face the camera.

```
Per explosion:
  1. Compute screen position from world position (same VP matrix)
  2. Generate billboard quad vertices (4 verts, 2 tris)
  3. Texture from procedural animation (age-based UV or color shift)

Alternative (simpler, recommended for v1):
  - Use GL_POINTS with large gl_PointSize
  - Fragment shader draws a radial gradient that fades with age
  - No texture atlas needed initially
  - Upgrade to textured billboards later if needed
```

### GL Program Summary (After Combat)

| Program | Purpose | New? | Draw Type |
|---------|---------|------|-----------|
| `pg` | Ray march background | Existing | fullscreen quad |
| `shipPg` | Player ship | Existing | elements, box |
| `enemyPg` | All enemies (instanced) | **New** | instanced elements |
| `trajPg` | Trajectories + projectiles | Extended | points + lines |
| `spritePg` | Explosion billboards | **New** | instanced points or quads |

### Render Order Within Frame

```
1. pg (ray march) -- fullscreen quad, no depth test
2. gl.clear(DEPTH_BUFFER_BIT) + gl.enable(DEPTH_TEST)
3. shipPg -- player ship (single draw)
4. enemyPg -- all enemies (1-2 instanced draws)
5. shipPg reused -- each player missile (existing per-missile loop)
6. trajPg -- trajectory preview, aim line, missile trails
7. trajPg extended -- projectile points (instanced or batched)
8. gl.enable(BLEND) + spritePg -- explosion sprites
9. gl.disable(BLEND) + gl.disable(DEPTH_TEST)
10. Restore pg state for next frame
```

---

## Game Loop Integration

The combat system integrates into the existing `render()` function. The existing pattern uses variable timestep with Verlet integration. Combat should use the same `simDt` that already accounts for bullet time scaling.

### Modified render() Structure

```javascript
function render() {
  // ... existing dt calculation ...
  const simDtSec = (flyMode && bulletTime) ? dtSec * BULLET_TIME_SCALE : dtSec;
  simTime += simDtSec;

  // ... existing WASM frame, camera setup ...

  updateNav(simDtSec);          // existing
  updateMissiles(simDtSec);     // existing

  if (combatActive) {
    updateEnemyAI(simDtSec);    // NEW: enemy decisions
    updateCombatPhysics(simDtSec); // NEW: all entity motion
    updateCollisions();          // NEW: hit detection
    updateDamage();              // NEW: apply hits, deaths
    updateWaveSpawner();         // NEW: check wave clear
    updateExplosions(simDtSec);  // NEW: age explosion sprites
    cleanupEntities();           // NEW: remove dead entities
  }

  // ... existing ray march draw ...

  if (flyMode) {
    // ... existing ship, missile rendering ...

    if (combatActive) {
      renderEnemies();           // NEW: instanced draw
      renderProjectiles();       // NEW: instanced points
      renderExplosions();        // NEW: billboard sprites
    }

    // ... existing trajectory rendering ...
  }

  if (combatActive) {
    updateCombatHUD();           // NEW: DOM updates
  }

  // ... existing HUD updates, FPS counter ...
  requestAnimationFrame(render);
}
```

### Combat Mode Activation

Combat mode is a sub-mode of nav mode. You must be in nav mode (flyMode=true) to enter combat:

```
Normal mode (planet browsing)
  |
  ` key --> Nav mode (flyMode=true)
              |
              C key --> Combat mode (combatActive=true)
                          |
                          ESC --> Back to nav mode
```

---

## Patterns to Follow

### Pattern 1: Swap-Remove for Entity Deletion

**What:** When an entity dies, swap it with the last entity in the array and decrement count. O(1) deletion with no holes.

**When:** Every time an entity is removed (death, out of bounds, expired).

**Example:**
```javascript
function removeEnemy(index) {
  const last = enemyCount.value - 1;
  if (index !== last) {
    enemyPosX[index] = enemyPosX[last];
    enemyPosZ[index] = enemyPosZ[last];
    enemyVelX[index] = enemyVelX[last];
    enemyVelZ[index] = enemyVelZ[last];
    // ... all other arrays ...
  }
  enemyCount.value--;
}
```

### Pattern 2: Pre-allocated Instance Buffers

**What:** Allocate GL buffers for maximum entity count at init time. Use `bufferSubData` to update, never `bufferData` with new size.

**When:** All instanced rendering.

**Example:**
```javascript
// At init time:
const enemyInstanceBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, enemyInstanceBuf);
gl.bufferData(gl.ARRAY_BUFFER, MAX_ENEMIES * BYTES_PER_INSTANCE, gl.DYNAMIC_DRAW);

// Per frame (only upload active count):
gl.bindBuffer(gl.ARRAY_BUFFER, enemyInstanceBuf);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, enemyCount.value * FLOATS_PER_INSTANCE));
```

### Pattern 3: Reuse Existing Gravity

**What:** Use `computeGravAccel()` from nav.js for all entity physics. Do not duplicate gravity code.

**When:** Enemy and projectile motion.

**Why:** Gravity consistency. If gravity constants change, everything stays in sync.

### Pattern 4: Event-less Communication

**What:** Instead of event emitters or observer patterns, use simple flag arrays and direct function calls between systems.

**When:** All inter-system communication. This is a single-file-origin project with global scope -- embrace it.

**Example:** Collision system writes hit indices into a scratch array. Damage system reads that array. No events, no callbacks, no indirection.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Object-per-Entity

**What:** Creating a JavaScript object for each enemy/projectile.

**Why bad:** GC pressure on entity creation/destruction. Cache-unfriendly. The existing missile system already suffers from this (each missile is an object with trail array) -- do not replicate for 50+ enemies.

**Instead:** SoA typed arrays as described above.

### Anti-Pattern 2: Per-Entity Draw Calls

**What:** Looping through enemies and issuing one `drawElements` per enemy (like the current missile rendering does).

**Why bad:** 50 draw calls with state changes. GPU driver overhead dominates.

**Instead:** Instanced rendering. One draw call for all enemies.

### Anti-Pattern 3: Adding Combat to the Ray March Shader

**What:** Adding enemy sphere intersections or projectile glow inside the 250-iteration ray march loop.

**Why bad:** Every per-pixel instruction inside that loop is multiplied by 250 iterations x every pixel. Adding even 1 sphere test per iteration would cost ~250 sphere tests per pixel x ~2M pixels = 500M extra operations per frame.

**Instead:** Separate GL passes with their own shaders, composited via depth buffer.

### Anti-Pattern 4: DOM-based Entity Rendering

**What:** Using HTML elements (divs) positioned via CSS transforms for enemies.

**Why bad:** DOM layout thrashing with 50+ elements repositioned every frame. GPU compositing layer limits.

**Instead:** All combat entities rendered via GL draw calls. Only the HUD uses DOM.

---

## Scalability Considerations

| Concern | 10 enemies | 30 enemies | 50 enemies |
|---------|------------|------------|------------|
| Physics | <0.1ms | ~0.3ms | ~0.5ms |
| Collision (radial bins) | <0.1ms | ~0.2ms | ~0.3ms |
| Enemy instanced draw | 1 draw call | 1 draw call | 1 draw call |
| Projectile rendering | ~20 points | ~60 points | ~100 points |
| JS update budget (at 30fps) | 33ms total | 33ms total | 33ms total |
| Estimated combat JS overhead | <1ms | ~2ms | ~3ms |

The ray march shader consumes 20-28ms of the 33ms budget on target hardware (GTX 1060). Combat JS + additional GL passes must fit in the remaining ~5-10ms. The estimates above show this is achievable with 50 enemies.

### Performance Safety Valves

1. **Dynamic resolution scaling** -- already exists, auto-reduces render resolution if FPS drops
2. **LOD distance culling** -- enemies beyond 200 units not rendered
3. **Projectile lifetime cap** -- projectiles auto-expire after N seconds, preventing unbounded growth
4. **Explosion pool limit** -- MAX_EXPLOSIONS caps active sprite count
5. **Enemy cap per wave** -- wave spawner respects MAX_ENEMIES

---

## Suggested Build Order

Dependencies flow downward. Each layer requires the layers above it.

```
Phase 1: Foundation (no combat yet)
  +-- Entity Store (SoA arrays, add/remove)
  +-- Enemy Renderer (instanced boxes, test with static dummy enemies)
  +-- ANGLE_instanced_arrays setup

Phase 2: Motion
  +-- Combat Physics (gravity integration for enemies)
  +-- Basic Enemy AI (orbit a body, simple state machine)
  +-- Enemy spawner (place N enemies in orbit, no waves yet)

Phase 3: Weapons (player attacks enemies)
  +-- Weapon Controller (4 weapon types, ammo/cooldown)
  +-- Projectile physics (kinetic: gravity-affected, plasma: straight line fade)
  +-- Projectile Renderer (instanced points)
  +-- Collision System (radial bins, projectile-vs-enemy)
  +-- Damage System (enemy hull, death)

Phase 4: Explosions + Feedback
  +-- Sprite Renderer (billboard explosions)
  +-- Combat HUD (hull, shields, ammo, wave counter)
  +-- Death effects (explosion on kill)

Phase 5: Enemy Combat (enemies attack back)
  +-- Enemy weapons (fire at player)
  +-- Player damage (hull integrity)
  +-- Kinetic shields (physical debris objects)
  +-- Ship destruction + game over

Phase 6: Waves + Polish
  +-- Wave spawner (kill-triggered waves)
  +-- Difficulty scaling
  +-- Boss waves
  +-- Targeting system (tactical zoom-out view)

Phase 7: Orbital Movement
  +-- Transfer orbit computation
  +-- Orbit capture / altitude adjustment
  +-- Visual trajectory preview for transfers
```

### Why This Order

1. **Entity Store + Renderer first** because everything else depends on having entities that can be created, stored, and drawn.
2. **Motion before weapons** because you need enemies that move before you can shoot them.
3. **Player weapons before enemy weapons** because a game where you can shoot but not be shot is playable for testing; the reverse is not.
4. **Explosions after weapons** because explosions are triggered by weapon hits.
5. **Waves after everything else** because waves are a progression system over the core combat loop.
6. **Orbital movement last** because it is the most complex system and the game is playable without it (enemies can use simpler circular orbit motion initially).

---

## File Organization

```
js/scene/
  nav.js              (existing - ship physics, nav mode)
  missiles.js         (existing - missile system)
  math.js             (existing - vector/matrix math)
  shaders.js          (existing - all GLSL sources)

  entities.js         (NEW - SoA entity store, add/remove/swap-remove)
  combat-physics.js   (NEW - gravity integration for combat entities)
  collision.js        (NEW - radial bin spatial partitioning)
  weapons.js          (NEW - weapon types, fire commands, ammo/cooldown)
  damage.js           (NEW - hit processing, death, hull/shield)
  enemy-ai.js         (NEW - enemy state machine, targeting, firing)
  waves.js            (NEW - wave spawner, difficulty scaling)
  targeting.js        (NEW - tactical view, target selection UI)
  enemy-renderer.js   (NEW - instanced enemy drawing)
  projectile-renderer.js (NEW - instanced projectile drawing)
  sprite-renderer.js  (NEW - billboard explosion sprites)
  combat-hud.js       (NEW - DOM-based combat UI)
  combat.js           (NEW - top-level combat update orchestrator)
```

All new files loaded via `<script>` tags in index.html, after existing scripts, before the main `<script>` block. Order matters due to global scope dependencies:

```html
<script src="js/scene/shaders.js"></script>
<script src="js/scene/math.js"></script>
<script src="js/scene/nav.js"></script>
<script src="js/scene/missiles.js"></script>
<!-- Combat system -->
<script src="js/scene/entities.js"></script>
<script src="js/scene/combat-physics.js"></script>
<script src="js/scene/collision.js"></script>
<script src="js/scene/weapons.js"></script>
<script src="js/scene/damage.js"></script>
<script src="js/scene/enemy-ai.js"></script>
<script src="js/scene/waves.js"></script>
<script src="js/scene/targeting.js"></script>
<script src="js/scene/enemy-renderer.js"></script>
<script src="js/scene/projectile-renderer.js"></script>
<script src="js/scene/sprite-renderer.js"></script>
<script src="js/scene/combat-hud.js"></script>
<script src="js/scene/combat.js"></script>
```

---

## Sources

- [ANGLE_instanced_arrays - MDN](https://developer.mozilla.org/en-US/docs/Web/API/ANGLE_instanced_arrays) -- Extension API, browser compatibility (HIGH confidence: official docs)
- [WebGL Instanced Drawing - WebGL Fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-instanced-drawing.html) -- Setup patterns for instanced rendering (HIGH confidence: authoritative tutorial)
- [Spatial Partition - Game Programming Patterns](https://gameprogrammingpatterns.com/spatial-partition.html) -- Spatial partitioning theory and implementation (HIGH confidence: canonical reference)
- [Anatomy of a Video Game - MDN](https://developer.mozilla.org/en-US/docs/Games/Anatomy) -- Game loop architecture for browser games (HIGH confidence: official docs)
- [WebGL Particle Billboard Tutorial](https://www.chinedufn.com/webgl-particle-effect-billboard-tutorial/) -- Billboard rendering technique (MEDIUM confidence: tutorial)
- Existing codebase: `index.html`, `js/scene/nav.js`, `js/scene/missiles.js`, `js/scene/math.js`, `js/scene/shaders.js` (HIGH confidence: primary source)
