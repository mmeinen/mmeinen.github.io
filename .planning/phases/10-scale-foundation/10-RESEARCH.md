# Phase 10: Scale Foundation - Research

**Researched:** 2026-03-16
**Domain:** WebGL 1.0 km-scale coordinate system, camera-relative rendering, logarithmic depth, Keplerian orbital mechanics, combat rebalancing
**Confidence:** HIGH

## Summary

Phase 10 converts the existing abstract-unit scene to physically realistic km-scale coordinates for the combat/nav system while keeping normal (non-nav) mode completely untouched. This is a coordinate-system refactor with simultaneous combat speed rebalancing due to bullet-time removal. The technical challenge concentrates in six areas: (1) establishing dual scale factors (BODY_SCALE=800 for sizes, ORBIT_SCALE=1316 for orbits), (2) implementing camera-relative rendering (CRR) to prevent float32 precision jitter at 113,000+ km orbital radii, (3) adding logarithmic depth buffer via EXT_frag_depth to prevent Z-fighting across the km-scale scene, (4) deriving all orbital velocities from Kepler's third law anchored to Jupiter's 60-second period, (5) removing bullet time and rebalancing all combat speeds for 1.0x real-time play, and (6) recalibrating the radial collision bin system for km distances.

The existing v1.1 project-level research (SUMMARY.md, PITFALLS.md, ARCHITECTURE.md, STACK.md) provides extensive background covering all six pitfall categories. This phase-level research synthesizes those findings into prescriptive implementation guidance specific to the CONTEXT.md decisions, with verified mathematical constants and concrete code patterns.

**Primary recommendation:** Implement in strict order: scale constants module first, then dual-coordinate planet position system, then CRR in all render paths, then gravity/orbital re-derivation, then combat rebalancing, then collision bin recalibration. Verify tests.html passes after every structural commit. Never pass km values to the ray march shader.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Body scale factor: KM_PER_UNIT = 800 (derived from Jupiter diameter: 2.5 x 2 x 800 = 4,000 km)
- All planet diameters proportional to current abstract radii x 800
- Black hole: 20,000 km diameter (collision/scale context only)
- Shader stays in abstract units -- 20,000 km is NOT passed to shader
- Two scale factors: BODY_SCALE = 800 (sizes), ORBIT_SCALE = 1,316 (orbits)
- Shader and WASM remain completely untouched -- keep current abstract units
- km layer exists only in combat/nav JS modules
- Conversion at boundary: shader uniforms = km_value / scale_factor
- Preserve current non-uniform orbit spacing (dense inner, sparse outer)
- SCALE-02 reinterpreted: "~50,000 km" refers to Jupiter's orbit radius, not uniform spacing between planets
- 500m floor for minimum enemy size (visibility guarantee)
- Archetype sizes: Swarm 500m, Sniper 600m, Grunt 500m, Bomber 650m, Capital 8km, Player 10km
- Weapon hit radii and projectile sizes tuned independently for gameplay feel, NOT derived from scale factor
- Bullet time (BULLET_TIME_SCALE = 0.03) removed entirely -- normal speed = 1.0x
- Only two time modes: normal (1.0x) and warp (Phase 14)
- Keplerian orbital periods (T proportional to r^1.5) with Jupiter = 60s anchor
- BH_GM re-derived from Kepler's law: GM = 4pi^2 x r^3 / T^2 at Jupiter's orbit
- Combat rebalancing happens in this phase (removing bullet time makes everything ~33x faster)
- Projectiles should feel snappier than current -- near-instant at combat range

### Claude's Discretion
- CRR implementation details (where camera subtraction happens)
- Logarithmic depth buffer implementation (EXT_frag_depth usage, fallback path)
- Collision bin width and count for km scale
- Exact projectile speed values in km/s (tuned for snappy feel)
- Combat rebalancing numbers (AI tick rates, missile fuel durations, etc.)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCALE-01 | Scene uses km-based coordinate system with BH diameter 20,000 km, Jupiter diameter 4,000 km, proportional planets | Verified: BODY_SCALE=800 gives Jupiter=4,000km, BH=20,000km. ORBIT_SCALE=1316 gives Jupiter orbit at 50,008km. All planet sizes verified in computation below. |
| SCALE-02 | Planet orbits approximately 50,000 km apart (reinterpreted: Jupiter orbits at ~50,000 km) | Verified: Jupiter oR=38 x 1316 = 50,008 km. Non-uniform spacing preserved from abstract units. |
| SCALE-03 | Player ship 10 km, Capital 8 km, Grunts 500 m, proportional archetypes | Verified: sizes defined in CONTEXT.md. 500m visibility floor for smallest enemies. |
| SCALE-04 | Camera-relative rendering prevents float32 precision jitter at all radii | CRR research in STACK.md: subtract camera world position in JS before GPU upload. At 10,000 km relative distance, precision = 1.2 m -- invisible on 500 m ships. |
| SCALE-05 | Logarithmic depth buffer prevents Z-fighting across km-scale scene | EXT_frag_depth extension available in WebGL 1.0. Formula: gl_FragDepthEXT = log2(1+fragDist)/log2(1+far). Fallback: multi-frustum if extension unavailable. |
| SCALE-06 | Normal (non-nav) mode rendering completely unaffected | Shader and WASM untouched. planetData array stays in abstract units. km layer only in combat/nav modules. tests.html must pass after every commit. |
| SCALE-07 | Collision detection bins recalibrated for km-scale distances | Current BIN_WIDTH=10, NUM_BINS=20 covers 0-200 units. At km scale need BIN_WIDTH=5000 km, NUM_BINS=24 to cover 0-120,000 km (beyond Neptune orbit). |
| TIME-01 | Ships orbit Jupiter in approximately 60 seconds | Jupiter period = 60s is the anchor. BH_GM_KM derived from Kepler's law. Verified: T(Jupiter) = 60.0s exactly. |
| TIME-02 | All orbital velocities and gravitational constants derived from Jupiter 60s anchor | BH_GM_KM = 4pi^2 x (50,008)^3 / (60)^2 = 1,371,436,467,948 km^3/s^2. All other periods follow T = 60 x (oR/38)^1.5. Verified computationally. |
</phase_requirements>

## Standard Stack

### Core
| Library/Tool | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| WebGL 1.0 | Existing | All 3D rendering | Already in use; no upgrade needed |
| ANGLE_instanced_arrays | Existing | Instanced enemy rendering | Already acquired; CRR applies to instance buffer |
| EXT_frag_depth | WebGL 1.0 ext | Logarithmic depth buffer in fragment shader | Confirmed available on all major desktop GPUs |
| Canvas 2D API | Built-in | (Future radar, not this phase) | N/A for Phase 10 |
| Pure JS (float64) | Built-in | Simulation-layer position arithmetic | JS numbers are float64; CRR subtraction happens here before float32 upload |

### Supporting
| Technique | Purpose | When to Use |
|-----------|---------|-------------|
| Camera-Relative Rendering (CRR) | Float32 precision at km scale | Every GL position upload in nav/combat mode |
| Logarithmic depth buffer | Z-fighting prevention | Combat/nav render passes only (not ray march) |
| Dual coordinate system | Shader isolation | Shader gets abstract units; simulation gets km |
| Keplerian mechanics | Orbital period derivation | All angular speeds derived from BH_GM_KM |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CRR (recommended) | DSP (dual-float) in shader | DSP requires shader rewrites + doubled attribute layout; CRR achieves same result with zero shader changes |
| EXT_frag_depth log depth | Multi-frustum rendering | Multi-frustum requires two render passes + depth clear between; more complex, no extension dependency |
| Separate scale constants | Inline magic numbers | Inline numbers make retuning a grep exercise; single-source constants enable proportional adjustments |

## Architecture Patterns

### Recommended Module Structure
```
js/scene/
  scale.js        -- NEW: KM_PER_UNIT, BODY_SCALE, ORBIT_SCALE, BH_GM_KM,
                      all body sizes in km, orbit radii in km,
                      archetype sizes in km, worldToRenderPos()
  math.js          -- NO CHANGE (pure geometry)
  shaders.js       -- MODIFY: log depth in enemy/ship/projectile fragment shaders only
  orbital.js       -- MODIFY: km gravity constants, km SOI, km orbit altitudes
  combat.js        -- MODIFY: km bin constants, km detection radii, km AI distances
  weapons.js       -- MODIFY: km/s speeds, km hit radii, real-time cooldowns
  missiles.js      -- MODIFY: km/s speeds, km thrust, km detonation radius
  particles.js     -- MODIFY: km/s particle speeds
  waves.js         -- MINOR: adjust spawn station-keeping altitude for km scale
  nav.js           -- MODIFY: remove bullet time, km gravity, km orbit mechanics
  explosions.js    -- MODIFY: km-scale explosion sizes
```

### Pattern 1: Dual Coordinate System
**What:** Maintain two separate coordinate representations simultaneously. The ray march shader sees abstract units via `planetPosAtTime()` with original `oR/ph/sp` values. The combat/nav simulation sees km positions derived from the same `planetData` parameters multiplied by `ORBIT_SCALE`.

**When to use:** Every place that reads planet positions. The boundary is explicit: shader uniforms use abstract-unit positions; simulation code uses km positions.

**Example:**
```javascript
// scale.js
const BODY_SCALE = 800;    // abstract radius -> km radius
const ORBIT_SCALE = 1316;  // abstract oR -> km orbit radius

// Getting planet position in km for simulation
function planetPosKm(p, t) {
  const oR_km = p.oR * ORBIT_SCALE;
  const a = p.sp * t + p.ph;  // sp stays in abstract angular speed!
  return [oR_km * Math.sin(a), 0, oR_km * Math.cos(a)];
}

// Shader uniform upload (unchanged from current)
// abstract-unit position via WASM or planetPosAtTime()
gl.uniform4f(uPl[i], dv.getFloat32(b,true), dv.getFloat32(b+4,true),
             dv.getFloat32(b+8,true), planetData[i].radius);
```

**CRITICAL:** The `sp` (angular speed) values in `planetData` must be recalculated for Keplerian consistency. Currently they are artistic values. In nav mode, `enterNavMode()` already recomputes them as `sp_kep = sqrt(BH_GM) / oR^1.5`. For the km-scale combat layer, angular speeds must use `BH_GM_KM` with km-scale orbit radii.

### Pattern 2: Camera-Relative Rendering (CRR)
**What:** Before uploading any entity position to the GPU, subtract the camera world position (in km). The GPU only ever receives small camera-relative coordinates.

**When to use:** All nav/combat render paths. NOT the ray march shader (it has its own coordinate system).

**Where CRR must be applied (exhaustive list):**
1. `combat.js:updateInstanceBuffer()` -- enemy positions (lines 118-120)
2. `weapons.js:renderProjectiles()` -- projectile positions (lines 320-323, 337-339, 358-360, 378-380)
3. `weapons.js:renderWeaponPreview()` -- preview line positions (line 416)
4. `missiles.js` render code -- missile positions
5. `particles.js` render code -- particle positions
6. `index.html:~1413-1416` -- player ship model matrix (flyPos)
7. `index.html` -- explosion billboard positions
8. `index.html` -- missile trail positions

**Example:**
```javascript
// In updateInstanceBuffer(), add camPos parameter:
function updateInstanceBuffer(simTime, camX, camY, camZ) {
  // ...
  instanceData[base]     = enemies.posX[i] - camX;
  instanceData[base + 1] = enemies.posY[i] - camY;
  instanceData[base + 2] = enemies.posZ[i] - camZ;
  // ...
}
```

### Pattern 3: Logarithmic Depth Buffer
**What:** Replace the standard 1/z depth distribution with a logarithmic distribution in the fragment shader, giving equal depth precision per decade of distance.

**When to use:** All 3D geometry render passes in nav/combat mode (enemy shader, ship shader, projectile shader). NOT the ray march shader (it writes to the full-screen quad, depth is irrelevant).

**Example (fragment shader addition):**
```glsl
#extension GL_EXT_frag_depth : enable
// At end of fragment shader:
float far = 600000.0;  // 600,000 km far plane
gl_FragDepthEXT = log2(max(1e-6, 1.0 + gl_FragCoord.w)) / log2(1.0 + far);
```

**Runtime check required:**
```javascript
const extFragDepth = gl.getExtension('EXT_frag_depth');
// If null: fall back to tighter near/far planes or multi-frustum
```

**Performance note:** Disables early fragment test (early-Z). Typical 5-15% fragment shader slowdown on desktop GPUs. Acceptable for this project.

### Pattern 4: Bullet Time Removal and Real-Time Rebalancing
**What:** Remove BULLET_TIME_SCALE (0.03) and FAST_FORWARD_SCALE (0.5). The render loop time scaling becomes: `simDtSec = dtSec` (1.0x always in nav/combat mode). All combat speeds, AI timers, and weapon cooldowns must be rebalanced because they were previously tuned for 0.03x time.

**Current effective speeds (bullet time):**
- Kinetic: 80 units/s x 0.03 = 2.4 effective units/s
- Plasma: 200 units/s x 0.03 = 6.0 effective units/s
- Enemy kinetic: 60 units/s x 0.03 = 1.8 effective units/s
- Missile: 15 units/s x 0.03 = 0.45 effective units/s

**At 1.0x with km scale, these speeds must produce "snappy, near-instant at combat range" feel per CONTEXT.md.** Combat ranges in km scale will be ~5,000-30,000 km (detection radius to attack range). A "near-instant" kinetic round at 10,000 km should arrive in <1 second, so speed > 10,000 km/s.

### Anti-Patterns to Avoid
- **Mutating `planetData.oR` to km values:** NEVER. The shader reads these. Create derived km values via `oR * ORBIT_SCALE`.
- **Passing km values as shader uniforms:** The ray march shader expects abstract units. km values would break escape thresholds, planet detection ranges, step sizes.
- **Storing km world coordinates in Float32Array directly:** JS float64 for simulation; only convert to float32 at CRR render boundary.
- **Applying CRR to the ray march shader:** The ray march already works in camera-relative abstract space. CRR is only for the 3D geometry passes.
- **Reusing old BH_GM=400 with km positions:** Gravity would be wildly wrong. Must derive BH_GM_KM from Jupiter's 60s orbit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Float32 precision at km scale | Custom shader precision hacks | CRR (subtract camera pos in JS) | Single subtraction per entity; zero shader changes |
| Z-fighting across km distances | Custom depth sorting or manual polygon offset | EXT_frag_depth logarithmic depth | Standard extension; one line in fragment shader |
| Orbital period derivation | Manual speed tuning per planet | Kepler's third law: T = 60 * (oR/38)^1.5 | Physically consistent; one formula drives all |
| Gravity constant derivation | Guessing BH_GM for km scale | GM = (2pi)^2 * r^3 / T^2 | Exact Keplerian derivation; no tuning needed |

## Common Pitfalls

### Pitfall 1: Normal Mode Corruption
**What goes wrong:** Any change to `planetData` values, `BH_GM`, shader uniforms, or perspective matrix breaks the non-nav landing page.
**Why it happens:** Global state shared between normal and nav modes.
**How to avoid:** km-scale constants live in `scale.js` and are referenced ONLY inside nav/combat code paths gated by `flyMode`. `planetData` is never mutated for scale purposes. Perspective matrix near/far is gated: `const near = flyMode ? 1.0 : 0.1; const far = flyMode ? 600000 : 500;`
**Warning signs:** tests.html fails; planet labels at wrong positions; black hole scene renders incorrectly after entering and exiting nav mode.
**Verification:** Run tests.html after every commit. Enter and exit nav mode repeatedly.

### Pitfall 2: WASM Coordinate Mismatch
**What goes wrong:** WASM outputs planet positions at offsets 0x070+i*12 in abstract units. If combat code reads these and treats them as km, gravity vectors are ~1316x too small.
**Why it happens:** WASM binary is not modifiable; it outputs abstract-unit positions.
**How to avoid:** When reading WASM planet positions for combat simulation, multiply by ORBIT_SCALE. When reading for shader uniforms, use raw values (unchanged). Define a single wrapper function for km-scale WASM reads.
**Warning signs:** Ship accelerates toward wrong position; orbit feels too fast or too slow; gravity pull is negligible.

### Pitfall 3: Angular Speed Inconsistency
**What goes wrong:** The `sp` field in `planetData` is currently artistic (e.g., Jupiter sp=0.018). In nav mode, `enterNavMode()` recomputes sp Keplerian using `sqrt(BH_GM)/oR^1.5` with abstract BH_GM=400 and doubled oR. For the km combat layer, sp must produce a 60s Jupiter orbit.
**Why it happens:** Multiple sources of truth for angular speed.
**How to avoid:** In the km combat layer, angular speed is derived from `BH_GM_KM` and km orbit radius: `sp_km = sqrt(BH_GM_KM) / (oR_km)^1.5`. This gives Jupiter sp = 0.10472 rad/s (= 2*pi/60). The existing `enterNavMode()` approach of recomputing sp should be extended to use km-scale constants.
**Warning signs:** Jupiter does not orbit in 60 seconds; other planet periods are not Keplerian-proportional.

### Pitfall 4: Combat Speed Shock After Bullet Time Removal
**What goes wrong:** Removing BULLET_TIME_SCALE=0.03 makes the effective simulation 33x faster. If weapon speeds are not adjusted, projectiles cross the entire scene in one frame.
**Why it happens:** All existing combat constants were tuned for 0.03x time scale.
**How to avoid:** Rebalance all combat speeds simultaneously with the scale change. The new speed values should target "snappy at combat range" feel. See the Combat Rebalancing section below.
**Warning signs:** Projectiles are invisible (too fast); enemies die instantly; combat feels uncontrollable.

### Pitfall 5: Collision Bin Overflow at km Scale
**What goes wrong:** Current BIN_WIDTH=10, NUM_BINS=20 covers only 0-200 abstract units. At km scale, all entities beyond ~200 km pile into the last bin.
**Why it happens:** Bin constants not updated with scale change.
**How to avoid:** Recalibrate bins: BIN_WIDTH=5000 km, NUM_BINS=24 covers 0-120,000 km (past Neptune orbit at 113,176 km).
**Warning signs:** getCollisionCandidates() returns all entities for any projectile; O(n^2) collision checks.

### Pitfall 6: View Matrix CRR Double-Application
**What goes wrong:** The `mat4LookAt` function already encodes camera position. If CRR is also applied to entity positions, the camera offset is subtracted twice.
**Why it happens:** Confusion about where CRR applies in the matrix pipeline.
**How to avoid:** With CRR, the view matrix must be constructed as if the camera is at origin: `mat4LookAt([0,0,0], lookTarget - camPos, up, _view)`. Entity model matrices use camera-relative positions. OR keep `mat4LookAt(camPos, ...)` and do NOT apply CRR to positions. Choose one approach consistently.
**Recommended:** Keep existing `mat4LookAt(_camP, _lookTarget, ...)` and apply CRR by making `_camP` the camera-relative camera position (which is [0,0,0]) and adjusting all world positions fed to the view/model pipeline.

## Code Examples

### Verified Constants (computed and verified)

```javascript
// scale.js -- All derived from CONTEXT.md decisions + Kepler's law

// Scale factors
const BODY_SCALE = 800;     // abstract radius unit -> km
const ORBIT_SCALE = 1316;   // abstract orbit radius -> km

// Body sizes (km) -- all derived from abstract radius * BODY_SCALE
const BH_DIAMETER_KM = 20000;   // 20,000 km
const BH_RADIUS_KM = 10000;
// Planet diameters: Jupiter=4000, Saturn=3200, Uranus=2400, Neptune=2240,
//                   Mars=2080, Earth=960, Venus=864

// Orbit radii (km) -- abstract oR * ORBIT_SCALE
// Venus=36848, Earth=43428, Jupiter=50008, Mars=59220,
// Saturn=68432, Uranus=89488, Neptune=113176

// Gravity: derived from Jupiter 60s period via Kepler's third law
// BH_GM = (2*pi)^2 * r_jupiter^3 / T_jupiter^2
// BH_GM = 39.4784 * (50008)^3 / 3600 = 1,371,436,467,948 km^3/s^2
const JUPITER_ORBIT_KM = 50008;
const JUPITER_PERIOD_S = 60.0;
const BH_GM_KM = (4 * Math.PI * Math.PI * Math.pow(JUPITER_ORBIT_KM, 3))
                 / (JUPITER_PERIOD_S * JUPITER_PERIOD_S);
// = ~1.371e12 km^3/s^2

// Circular velocity at Jupiter orbit: v = 2*pi*r/T = 5236.8 km/s
const JUPITER_CIRC_V = 2 * Math.PI * JUPITER_ORBIT_KM / JUPITER_PERIOD_S;

// Keplerian periods (seconds) -- T = 60 * (oR_abstract / 38)^1.5
// Venus: 38.0s, Earth: 48.6s, Jupiter: 60.0s, Mars: 77.3s
// Saturn: 96.0s, Uranus: 143.6s, Neptune: 204.3s

// Archetype sizes (km)
const PLAYER_SIZE_KM = 10.0;     // 10 km
const CAPITAL_SIZE_KM = 8.0;     // 8 km
const BOMBER_SIZE_KM = 0.65;     // 650 m
const SNIPER_SIZE_KM = 0.6;      // 600 m
const GRUNT_SIZE_KM = 0.5;       // 500 m
const SWARM_SIZE_KM = 0.5;       // 500 m

// World boundary
const MAX_RADIUS_KM = 120000;    // ~1.06x Neptune orbit
```

### Time Scale Change (render loop)

```javascript
// BEFORE (current code, index.html line 1183):
const simDtSec = flyMode
  ? (fastForward ? dtSec * FAST_FORWARD_SCALE : dtSec * BULLET_TIME_SCALE)
  : dtSec;

// AFTER (Phase 10):
const simDtSec = dtSec;  // 1.0x always. Warp handled in Phase 14.
// Remove: fastForward variable, BULLET_TIME_SCALE, FAST_FORWARD_SCALE
```

### CRR Application to Instance Buffer

```javascript
// combat.js - updateInstanceBuffer with camera-relative transform
function updateInstanceBuffer(simTime, camX, camY, camZ) {
  let offset = 0;
  _typeCounts[0] = _typeCounts[1] = _typeCounts[2] = _typeCounts[3] = _typeCounts[4] = 0;
  for (let t = 0; t < 5; t++) {
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!enemies.alive[i] || enemies.type[i] !== t) continue;
      const base = offset * ENEMY_INST_FLOATS;
      // Camera-relative positions (float64 subtraction, then stored as float32)
      instanceData[base]     = enemies.posX[i] - camX;
      instanceData[base + 1] = enemies.posY[i] - camY;
      instanceData[base + 2] = enemies.posZ[i] - camZ;
      // ... rest unchanged
    }
  }
}
```

### Logarithmic Depth Buffer

```javascript
// At WebGL init:
const extFragDepth = gl.getExtension('EXT_frag_depth');

// In enemy/ship/projectile fragment shaders (shaders.js), add:
// At top: #extension GL_EXT_frag_depth : enable
// At bottom of main():
//   float logDepthFar = 600000.0;
//   gl_FragDepthEXT = log2(max(1e-6, 1.0 + gl_FragCoord.w)) / log2(1.0 + logDepthFar);

// If extFragDepth is null, fall back to tighter near/far:
// near = 10.0, far = 300000.0 (accept some Z-fighting at extreme ranges)
```

### Gravity Computation in km

```javascript
// nav.js - computeGravAccel adapted for km scale
function computeGravAccelKm(pos) {
  let dx = -pos[0], dy = -pos[1], dz = -pos[2];
  let r2 = dx*dx + dy*dy + dz*dz;
  let r = Math.sqrt(r2);
  let r3 = r2 * r;
  let ax = 0, ay = 0, az = 0;
  if (r3 > 0.001) {
    ax += BH_GM_KM * dx / r3;
    ay += BH_GM_KM * dy / r3;
    az += BH_GM_KM * dz / r3;
  }
  // Planet gravity with km-scale positions and GMs
  for (let i = 0; i < 7; i++) {
    const pp = planetPosKm(planetData[i], simTime);
    dx = pp[0] - pos[0]; dy = pp[1] - pos[1]; dz = pp[2] - pos[2];
    r2 = dx*dx + dy*dy + dz*dz; r = Math.sqrt(r2); r3 = r2 * r;
    if (r3 > 0.001) {
      ax += _planetGM_km[i] * dx / r3;
      ay += _planetGM_km[i] * dy / r3;
      az += _planetGM_km[i] * dz / r3;
    }
  }
  return [ax, ay, az];
}
```

## Combat Rebalancing Reference

The following table provides recommended km/s speed values. These are starting points to be tuned during implementation for "snappy, near-instant at combat range" feel.

### Combat Engagement Distances (km scale)
| AI State | Abstract Units | km Equivalent | Notes |
|----------|---------------|---------------|-------|
| DETECT_RADIUS | 40 | ~20,000 km | Half a planet spacing |
| ATTACK_RANGE | 15 | ~7,500 km | Close enough to engage |
| FIRE_RANGE | 10 | ~5,000 km | Weapons free |
| DISENGAGE_DIST | 5 | ~2,500 km | Too close, break off |
| REORBIT_DIST | 20 | ~10,000 km | Safe to circularize |
| STATION_KEEP_ALT | 3 | ~1,500 km | Hover near planet |

### Weapon Speeds (km/s)
| Weapon | Old Speed (abstract/s) | Effective at 0.03x | New Speed (km/s) | Time to hit at 5,000 km |
|--------|----------------------|--------------------|--------------------|------------------------|
| Kinetic | 80 | 2.4 | ~15,000 | 0.33s |
| Plasma | 200 | 6.0 | ~30,000 | 0.17s |
| Enemy kinetic | 60 | 1.8 | ~10,000 | 0.5s |
| Missile | 15 | 0.45 | ~3,000 | 1.67s |
| Nuke missile | 12 | 0.36 | ~2,500 | 2.0s |

### Weapon Parameters (recommended starting values)
| Parameter | Old Value | New Value | Rationale |
|-----------|-----------|-----------|-----------|
| KINETIC_SPEED | 80 | 15000 km/s | <0.5s at 5,000 km range |
| KINETIC_LIFETIME | 3.0s | 2.0s | 30,000 km max range |
| KINETIC_COOLDOWN | 1.0s | 0.8s | Slightly faster at real-time |
| PLASMA_SPEED | 200 | 30000 km/s | Near-instant |
| PLASMA_MAX_RANGE | 120 | 60000 km | ~2s travel time |
| PLASMA_COOLDOWN | 2.5s | 2.0s | Slightly faster |
| HIT_RADIUS_KINETIC | 1.5 | 500 km | Generous for gameplay |
| HIT_RADIUS_PLASMA | 2.0 | 800 km | Slightly larger |
| ENEMY_KINETIC_SPEED | 60 | 10000 km/s | Slightly slower than player |
| MISSILE_THRUST | 12 | 2000 km/s^2 | Strong acceleration |
| MISSILE_SPEED | 15 | 3000 km/s | Initial velocity |
| MISSILE_DET_RADIUS | 1.5 | 300 km | Proximity fuse |
| MISSILE_FUEL_REGULAR | 7.0s | 5.0s | ~15,000 km powered range |
| MISSILE_FUEL_NUKE | 10.0s | 8.0s | ~24,000 km powered range |
| MISSILE_BLAST_RADIUS | 5.0 | 2000 km | Regular blast |
| NUKE_BLAST_RADIUS | 15.0 | 8000 km | Nuke blast |
| ACCURACY_NOISE | 5.0 | 2000 km | Lead prediction scatter |

### Collision Bin Parameters
| Parameter | Old Value | New Value | Coverage |
|-----------|-----------|-----------|----------|
| BIN_WIDTH | 10.0 | 5000 km | Each bin covers 5,000 km radial band |
| NUM_BINS | 20 | 24 | Covers 0-120,000 km (past Neptune) |
| MAX_PER_BIN | 16 | 16 | Unchanged |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Abstract game units | km-scale coordinates | This phase | All combat distances, speeds, radii change |
| Bullet time (0.03x) | Real-time (1.0x) | This phase | 33x effective speed increase; all combat rebalanced |
| Artistic planet speeds | Keplerian orbital mechanics | This phase | Physically consistent orbital periods |
| Standard depth buffer | Logarithmic depth buffer | This phase | Z-fighting eliminated at km distances |
| Direct world coords to GPU | Camera-relative rendering | This phase | Float32 precision preserved at all orbital radii |
| BH_GM=400 (abstract) | BH_GM_KM=1.371e12 (km^3/s^2) | This phase | Gravity produces correct orbital velocities |

## Open Questions

1. **EXT_frag_depth fallback path complexity**
   - What we know: Extension is available on all major desktop GPUs. The site targets desktop browsers.
   - What's unclear: Whether any significant user base accesses via mobile WebGL where the extension may be unavailable.
   - Recommendation: Implement log depth with runtime check. If extension unavailable, use tighter near/far (near=10, far=300000) and accept minor Z-fighting at extreme ranges. Do not implement multi-frustum unless Z-fighting is reported.

2. **Exact combat speed tuning**
   - What we know: Starting values are derived proportionally. CONTEXT.md says "snappy, near-instant at combat range."
   - What's unclear: Whether the computed values actually feel good in play.
   - Recommendation: Implement starting values from the table above. Tune interactively during implementation. The key metric: kinetic rounds should arrive at FIRE_RANGE (~5,000 km) in <0.5s.

3. **enterNavMode() oR doubling interaction with km scale**
   - What we know: Currently `enterNavMode()` doubles all planet oR values and recomputes sp Keplerian. This was a visual zoom-out effect.
   - What's unclear: Whether this doubling is still needed at km scale where the scene is already large.
   - Recommendation: Remove the oR doubling. In km scale, the orbit radii are already at the desired distances. The nav camera zoom parameters handle visual scale. This simplifies the coordinate system significantly -- no more "doubled oR" special case.

4. **Planet GM derivation at km scale**
   - What we know: Currently `_planetGM[i] = PLANET_GM_K * r^3` where PLANET_GM_K=50 and r is abstract radius.
   - What's unclear: The exact PLANET_GM_K value for km scale.
   - Recommendation: Derive as `PLANET_GM_K_KM = PLANET_GM_K * BODY_SCALE^3 / ORBIT_SCALE^3` (proportional scaling) or define per-planet values for physically realistic SOI. The planet GMs primarily affect SOI capture and orbit mechanics, so they need tuning for gameplay feel.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based regression (tests.html) |
| Config file | tests.html (inline, no config file) |
| Quick run command | `Open http://localhost:8000/tests.html in browser` |
| Full suite command | `Open http://localhost:8000/tests.html + visual check of index.html` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCALE-01 | km-based coordinate system with correct body sizes | unit | tests.html extracts planetData and validates sizes | Extend tests.html |
| SCALE-02 | Jupiter orbits at ~50,000 km | unit | tests.html validates Jupiter oR * ORBIT_SCALE ~= 50,000 | Extend tests.html |
| SCALE-03 | Ship sizes correct (10km player, 8km capital, 500m grunt) | unit | tests.html checks scale.js constants | Extend tests.html |
| SCALE-04 | CRR prevents jitter at all radii | manual-only | Visual inspection: stationary enemies at Neptune orbit should not jitter | N/A |
| SCALE-05 | Log depth prevents Z-fighting | manual-only | Visual inspection: planets at different orbits should not flicker | N/A |
| SCALE-06 | Normal mode unaffected | automated | Existing tests.html shader invariant suite must pass unchanged | Exists (tests.html) |
| SCALE-07 | Collision bins recalibrated | unit | tests.html checks BIN_WIDTH and NUM_BINS in combat.js | Extend tests.html |
| TIME-01 | Jupiter orbits in ~60 seconds | manual-only | Enter nav mode, observe Jupiter, time one full orbit | N/A |
| TIME-02 | All velocities from Jupiter anchor | unit | tests.html validates BH_GM_KM derivation from Jupiter orbit | Extend tests.html |

### Sampling Rate
- **Per task commit:** Open tests.html in browser -- all tests must pass
- **Per wave merge:** Full test suite + visual check of normal mode + visual check of nav mode combat
- **Phase gate:** Full suite green + manual verification of all 5 success criteria

### Wave 0 Gaps
- [ ] `tests.html` -- extend with scale.js constant validation tests (SCALE-01, SCALE-02, SCALE-03)
- [ ] `tests.html` -- extend with BH_GM_KM Kepler derivation check (TIME-02)
- [ ] `tests.html` -- extend with collision bin constant check (SCALE-07)
- [ ] `js/scene/scale.js` -- new file, must be created before all other modifications

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `index.html`, `js/scene/nav.js`, `js/scene/combat.js`, `js/scene/weapons.js`, `js/scene/missiles.js`, `js/scene/orbital.js`, `js/scene/math.js`, `js/scene/shaders.js`, `js/scene/waves.js`, `tests.html` (verified 2026-03-16)
- `.planning/research/SUMMARY.md` -- v1.1 project-level research (verified 2026-03-15)
- `.planning/research/PITFALLS.md` -- 10 domain pitfalls with concrete numbers (verified 2026-03-14)
- `.planning/research/ARCHITECTURE.md` -- system diagram, data flow, per-file change inventory (verified 2026-03-15)
- `.planning/research/STACK.md` -- CRR, LOD, radar, warp speed techniques (verified 2026-03-14)
- `.planning/phases/10-scale-foundation/10-CONTEXT.md` -- user decisions (verified 2026-03-14)
- IEEE 754 single-precision specification -- float32 precision formula (exact mathematical derivation)
- Kepler's third law -- T^2 proportional to r^3 (exact physics)
- Computational verification of all derived constants (node.js, 2026-03-16)

### Secondary (MEDIUM confidence)
- [Cesium: Hybrid Multi-Frustum Logarithmic Depth Buffer](https://cesium.com/blog/2018/05/24/logarithmic-depth/) -- log depth with EXT_frag_depth
- [MDN: EXT_frag_depth](https://developer.mozilla.org/en-US/docs/Web/API/EXT_frag_depth) -- confirmed WebGL 1.0 extension
- [Godot Engine: Large World Coordinates](https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html) -- CRR confirmation

### Tertiary (LOW confidence)
- None. All findings verified against codebase or exact mathematical derivation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries; all techniques verified in project-level research
- Architecture: HIGH -- directly derived from codebase inspection and CONTEXT.md locked decisions
- Pitfalls: HIGH -- all six pitfall categories from project research apply; concrete prevention strategies documented
- Combat rebalancing: MEDIUM -- speed values are derived proportionally but need playtesting for feel
- Keplerian constants: HIGH -- exact mathematical derivation, computationally verified

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable domain; only invalidated by CONTEXT.md decision changes)
