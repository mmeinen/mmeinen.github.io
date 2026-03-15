# Architecture Research

**Domain:** Tactical orbital combat — v1.1 Realistic Scale & Fleet Combat
**Researched:** 2026-03-15
**Confidence:** HIGH

This document supersedes the v1.0 architecture research. It covers the integration points for
four new features — coordinate scale change, fleet system, radar UI, and warp speed — into the
existing v1.0 codebase. Every existing module is examined. New vs. modified status is explicit
for each. Build order accounts for the live game not breaking during the refactor.

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         index.html (game host)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  WebGL ctx   │  │  WASM module │  │  DOM / HUD elements      │   │
│  │  (single)    │  │  (planets    │  │  hull, weapons, wave,    │   │
│  │              │  │   0-5 pos)   │  │  radar canvas, warp btn  │   │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘   │
│         │                 │                       │                   │
│         ▼                 ▼                       ▼                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    Coordinate Layer                             │  │
│  │  SCALE_KM constant, worldToRender(), renderToWorld()          │  │
│  │  Camera-relative transform before every GL upload             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│         │                                         │                   │
│         ▼                                         ▼                   │
│  ┌─────────────────────────────┐   ┌──────────────────────────────┐  │
│  │   Simulation Layer (km)     │   │   Render Layer (render units)│  │
│  │                             │   │                              │  │
│  │  orbital.js  — transfers    │   │  shaders.js — GLSL sources   │  │
│  │  combat.js   — enemy SoA    │   │  enemy/ship/traj programs    │  │
│  │  weapons.js  — projectile   │   │  billboard explosions        │  │
│  │  missiles.js — PN guidance  │   │                              │  │
│  │  waves.js    — fleet spawn  │   │  [NEW] radar.js — 2D canvas  │  │
│  │  particles.js— FX           │   │  overlay on separate element │  │
│  │  math.js     — shared math  │   │                              │  │
│  └─────────────────────────────┘   └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

All components live in `js/scene/`. Global scope, no module system. Script load order
determines dependency resolution.

| Component | File | v1.1 Status | Responsibility |
|-----------|------|-------------|----------------|
| Coordinate helper | `js/scene/scale.js` | **NEW** | SCALE_KM, worldToRender, renderToWorld, collision thresholds |
| Orbital mechanics | `orbital.js` | **MODIFY** | SOI radii, Hohmann DV, body helpers — all distances become km |
| Enemy entity store | `combat.js` | **MODIFY** | SoA arrays, AI state machine, radial bins — all constants become km |
| Weapon physics | `weapons.js` | **MODIFY** | Muzzle speeds, hit radii, lifetime — all become km/s and km |
| Missile guidance | `missiles.js` | **MODIFY** | Speeds, fuel, detonation radius — become km/s and km |
| Wave/fleet spawner | `waves.js` | **MODIFY** | Wave composition replaced by fleet composition; 3 fleets max per wave |
| Impact particles | `particles.js` | **MODIFY** | Particle speed in km/s, particle size adjusted for new scale |
| Math helpers | `math.js` | **NO CHANGE** | Pure geometry, scale-independent |
| Shader strings | `shaders.js` | **MODIFY** | Planet/BH uniform scale, warp distortion pass, LOD thresholds |
| Radar mini-map | `js/scene/radar.js` | **NEW** | 2D canvas overlay, bodies + ships, expandable side panel |
| Warp speed | `js/scene/warp.js` | **NEW** | Spacebar toggle, time scale ramp, HUD indicator |
| Fleet definitions | `js/scene/fleets.js` | **NEW** | Fleet archetype tables, composition by difficulty |
| index.html | inline `<script>` | **MODIFY** | planetData orbit radii, BH event horizon, camera near/far |

---

## Recommended Project Structure

```
js/scene/
  math.js             — unchanged (pure geometry)
  shaders.js          — modify: scale uniforms, warp pass
  orbital.js          — modify: km distances throughout
  combat.js           — modify: km constants, AI detection radii
  weapons.js          — modify: km/s speeds, km hit radii
  missiles.js         — modify: km/s speeds, km detonation radius
  waves.js            — modify: fleet-structured wave definitions
  particles.js        — modify: km/s particle speeds

  scale.js            — NEW: coordinate helpers, SCALE_KM
  radar.js            — NEW: radar/orbital-chart rendering
  warp.js             — NEW: warp speed state and HUD
  fleets.js           — NEW: fleet archetype compositions

index.html
  planetData          — modify: oR and radius to km values
  BH_GM, BH_R         — modify: km-scale gravitational constant
  Camera near/far     — modify: km-scale clipping planes
  <canvas id="radar"> — NEW: separate 2D canvas for radar
  Script load order   — add scale.js before other scene files
```

### Structure Rationale

- **scale.js first in load order**: Every other module references `SCALE_KM` and the transform
  helpers. It must exist before any module that positions entities.
- **fleets.js before waves.js**: Fleet definitions are pure data tables; waves.js reads them.
- **radar.js independent of main GL context**: Radar uses a separate `<canvas>` with a 2D
  context to avoid contaminating WebGL state. It reads world positions and draws 2D circles.
- **warp.js independent of physics modules**: Warp only modifies the `simDt` multiplier. It
  touches nothing except the time scale and the HUD element. No physics code changes.

---

## Architectural Patterns

### Pattern 1: Camera-Relative Rendering

**What:** Simulation runs in km. The GPU receives positions relative to the camera, not absolute
world positions. Before uploading any position buffer, subtract the camera world position.

**When to use:** Every GL position upload in render passes 2-8 (everything after the ray march).
The ray march shader already works in its own unitless coordinate space and is unaffected.

**Why this is necessary:** A float32 has ~7 significant decimal digits. At 350,000 km scene
extent with ships positioned 1 km apart, absolute positions lose sub-km precision. Camera-relative
coordinates keep values in the 0-10,000 range where float32 is more than adequate.

**Trade-offs:** Every render function must receive or read `camWorldPos`. The instance buffer
packing functions must apply the subtraction. If forgotten, ships flicker or disappear.

**Example:**
```javascript
// In updateInstanceBuffer():
instanceData[base]     = enemies.posX[i] - camWorldX;  // camera-relative
instanceData[base + 1] = enemies.posY[i] - camWorldY;
instanceData[base + 2] = enemies.posZ[i] - camWorldZ;
```

### Pattern 2: Single SCALE_KM Constant, Never Inline Numbers

**What:** All scale-dependent constants in every module are derived from one root constant
(`SCALE_KM` in `scale.js`), not hardcoded inline.

**When to use:** Every distance constant, every speed constant, every radius constant, every
collision threshold. If it was `10.0` (abstract units) and should become `50000.0` (km), it
must become `SCALE_KM * SOME_RATIO` where `SOME_RATIO` is a named constant that documents the
physical meaning.

**Why:** Enables re-tuning without hunting through six files. The ratio documents intent
("Jupiter orbit in seconds → velocity in km/s"). Inline magic numbers make the next
refactor a grep exercise.

**Example:**
```javascript
// scale.js
const SCALE_KM = 1.0;           // 1 simulation unit = 1 km
const BH_RADIUS_KM = 10000;     // 20,000 km diameter
const JUPITER_ORBIT_KM = 50000; // first planet orbit
const PLAYER_SHIP_LENGTH_KM = 10;
const GRUNT_LENGTH_KM = 0.5;

// combat.js — derived, not hardcoded
const DETECT_RADIUS = JUPITER_ORBIT_KM * 0.5; // half an orbit spacing
const BH_DESPAWN_R2 = BH_RADIUS_KM * BH_RADIUS_KM;
```

### Pattern 3: Fleet as Structured Spawn Group

**What:** Replace individual enemy spawns with fleet-level spawn events. A fleet has a
commander (Capital), a role (escort, siege, raid), and a fixed composition. Fleets dock at
planets; individual fleet members have station-keeping offsets within the fleet formation.

**When to use:** Wave spawning only. Individual enemy AI still operates per-enemy after spawn.

**Trade-offs:** Adds one level of indirection (fleet → members) but makes wave design
readable and makes the tactical layer legible to the player (see a fleet, understand threat).
The existing `assignBody` field in the enemy SoA already provides the anchor for fleet
station-keeping — no new SoA fields needed for basic fleet support.

**Example:**
```javascript
// fleets.js
const FLEET_TYPES = {
  RAID:  { capital: 0, grunts: 3, swarms: 2, bombers: 0, snipers: 0 },
  SIEGE: { capital: 1, grunts: 1, swarms: 0, bombers: 3, snipers: 1 },
  WOLF:  { capital: 0, grunts: 2, swarms: 4, bombers: 0, snipers: 0 },
};

function spawnFleet(fleetType, anchorBodyIdx, difficulty) {
  const def = FLEET_TYPES[fleetType];
  // spawn capital first (gets assignBody = anchorBodyIdx)
  // spawn each subordinate with staggered stationPhase offsets
  // each subordinate gets assignBody = anchorBodyIdx (same planet)
}
```

### Pattern 4: Radar as Read-Only Consumer of World State

**What:** The radar module reads from `enemies`, `flyPos`, `planetData`, and `getBodyPosition()`
but never writes to simulation state. It draws to its own `<canvas>` element using a 2D context.

**When to use:** Every frame, after the main GL frame. The 2D canvas is independent — no
state contamination with the WebGL context.

**Trade-offs:** Two canvas elements in the DOM. The radar canvas must be positioned over or
beside the main canvas via CSS. This is CSS positioning only, no performance concern.

**Example:**
```javascript
// radar.js
function renderRadar(radarCtx, worldToPx, bodies, enemies, flyPos) {
  radarCtx.clearRect(0, 0, radarCanvas.width, radarCanvas.height);
  // draw BH circle at center
  // draw each planet orbit ring
  // draw each planet dot
  // draw each enemy dot (colored by archetype)
  // draw player dot (white)
  // no writes to enemies, flyPos, bodies
}
```

---

## Data Flow

### Coordinate Transform Chain

```
Simulation state (km)
  posX, posZ in enemies SoA
  flyPos[0,2] for player
  WASM planet positions (already in doubled-oR units — must rescale)
       |
       | worldToRender(x, y, z)  (in scale.js)
       | applied PER FRAME at instance buffer pack time
       |
Camera-relative render coords
  Uploaded to GPU as instance attributes / uniforms
       |
       | GPU vertex shader applies viewProj matrix
       |
Clip space → NDC → screen pixels
```

The ray march shader does NOT receive simulation km values. It receives camera position,
forward vector, and planet uniforms all in its own internal "abstract units" that drive the
Verlet integrator. Planets must be passed to the ray march shader in its coordinate system,
not in km. This requires two sets of planet position values:

1. **Simulation positions (km)**: Used by orbital.js, combat.js, collision detection, AI
2. **Shader positions (abstract units)**: Passed as `u_planet0` through `u_planet6` uniforms,
   computed from `planetPosAtTime()` with the existing oR/ph/sp parameterization

These are the SAME data source (planetData array) evaluated two different ways. The scale
refactor must preserve this dual evaluation — it only changes how km-scale simulation uses them.

### Per-Frame Update Order (v1.1)

```
1. INPUT PHASE
   Spacebar → warp.js toggleWarp()
   O key    → radar.js toggleExpanded()
   F key    → combat mode toggle (existing)
   Mouse/keyboard → nav input (existing)

2. TIME SCALE PHASE  [NEW]
   warp.js computeWarpDt(rawDt) → simDt
   If warp active: simDt *= WARP_SCALE (up to 30x)
   Physics, AI, weapons all consume this scaled simDt

3. WASM FRAME
   planet positions 0-5 (in shader units)
   camera matrix, hover detection (existing)

4. PLANET POSITION SYNC  [MODIFIED]
   JS reads WASM positions → converts to km for simulation
   planet 6 (Mars) computed in JS (existing, now also km-scaled)

5. SHIP PHYSICS  (existing updateNav)
   Verlet integration with gravity (now in km/s²)
   Body collision: if flyPos within planet radius → redirect
   World boundary: if flyPos > MAX_ORBIT_KM → clamp

6. COMBAT UPDATES  (existing, now in km)
   updateEnemyAI(simDt)   — detection radii in km
   updateProjectiles(simDt)
   updateMissiles(simDt)
   checkProjectileHits()
   updateParticles(simDt)
   updateWaveSystem(simDt) — now spawns fleets

7. RENDER PHASE
   GL Pass 1: Ray march (existing, unaffected)
   GL Pass 2: Player ship (camera-relative km coords)
   GL Pass 3: Enemies instanced (camera-relative km coords)
   GL Pass 4: Projectiles/trails (camera-relative km coords)
   GL Pass 5: Missiles/explosions (camera-relative km coords)
   [2D] radar.js renderRadar() → radar <canvas>
   DOM: HUD updates (existing + warp indicator)
```

### Key Data Flows

1. **Scale change cascade**: `SCALE_KM` in scale.js → distance constants in every module →
   velocity constants derived from km/s → collision radii in km. One constant drives all.

2. **Warp speed flow**: `warp.js toggleWarp()` sets `warpActive` flag → `computeWarpDt(rawDt)`
   returns scaled simDt → all physics/AI consume scaled time → renders at higher simTime per
   real second → HUD shows warp indicator. Camera is not moved; only simulation time advances.

3. **Fleet spawn flow**: `waves.js spawnWave()` calls `fleets.js getFleetComposition()` →
   returns array of `{type, count}` groups → `spawnFleet()` places each member at
   `bodyPos + stationKeepOffset(stationPhase)` → members get `assignBody` set to fleet anchor.
   After spawn, individual AI takes over (existing AI code unchanged).

4. **Radar data flow**: Every frame, `radar.js renderRadar()` reads (does not write):
   `getBodyPosition(i)` for each planet, `enemies.posX/Z[i]` for all alive enemies,
   `flyPos[0,2]` for player. Maps world km coordinates to radar pixel coordinates.
   Separate 2D canvas → zero interference with WebGL state.

5. **Body collision flow** [NEW]: Every frame during ship physics, check if
   `dist(flyPos, bodyPos) < bodyRadius + PLAYER_SHIP_LENGTH_KM`. If true, apply elastic
   deflection or hard stop. Enemy collision with bodies: `dist(enemyPos, bodyPos) < bodyRadius`
   → `removeEnemy(i)`. Projectiles: `dist(projPos, bodyPos) < bodyRadius` → `removeProjectile(i)`.

---

## Integration Points: New vs Modified

### Files Modified

**`index.html` (inline `<script>` block)**

| What changes | Why | How |
|-------------|-----|-----|
| `planetData` array oR/radius values | Must become km | Jupiter oR: 38→50000, radius: 2.5→2000 |
| `BH_GM` constant | Gravitational parameter in km³/s² | Derived from Jupiter 60s orbit period |
| Camera near/far clipping planes | km-scale depth range | near: 0.1→1, far: 500→600000 |
| `enterNavMode()` doubles oR | Was 2x abstract units, now km | Remove the 2x or adjust to km |
| `initOrbitalData()` hardcoded alts | Per-planet orbit alts in km | Scale from abstract to km |
| Script load order | Add scale.js first | `<script src="js/scene/scale.js"></script>` first |

**`js/scene/combat.js`**

| What changes | Why | How |
|-------------|-----|-----|
| `BIN_WIDTH`, `NUM_BINS` | Bins must cover 350,000 km range | BIN_WIDTH=20000, NUM_BINS=20 |
| `DETECT_RADIUS`, `ATTACK_RANGE`, `FIRE_RANGE` | All distances in km | Scale proportionally |
| `STATION_KEEP_ALT` | Offset from planet surface in km | Was 3.0 → now ~3000 (3 ship lengths) |
| `GUIDANCE_ACCEL_ENEMY` | Acceleration in km/s² | Rescale from abstract |
| `ACCURACY_NOISE` | Lead prediction scatter in km | Rescale |
| BH despawn check `er < 4.0` | BH radius now 10000 km | `er < BH_RADIUS_KM * BH_RADIUS_KM` |
| `updateInstanceBuffer()` | Camera-relative subtraction | Subtract camWorldPos from positions |

**`js/scene/orbital.js`**

| What changes | Why | How |
|-------------|-----|-----|
| `BODY_SOI`, `DEFAULT_ORBIT_ALT` arrays | Distances in km | Scale all values |
| `getBodyRadius()` BH event horizon `2.0` | Must become 10000 km | Return `BH_RADIUS_KM` |
| `getBodySOI()` computed values | km-scale Hill sphere | computeSOI() inputs are already km once oR is km |
| `initOrbitalData()` hardcoded alts | km-scale per-planet values | Replace with km values |
| `computeSOI()` | Works if oR is already km | No logic change, inputs change |

**`js/scene/weapons.js`**

| What changes | Why | How |
|-------------|-----|-----|
| `KINETIC_SPEED` (80 abstract/s) | Must be km/s | ~8000 km/s (hypervelocity rounds) |
| `KINETIC_LIFETIME` (3s) | Governs range | Increase to cover km-scale ranges |
| `PLASMA_SPEED` (200 abstract/s) | km/s | ~40000 km/s (near-lightspeed) |
| `PLASMA_MAX_RANGE`, `PLASMA_FADE_START` | km | Proportional scale |
| `HIT_RADIUS_KINETIC`, `HIT_RADIUS_PLASMA` | km | ~2 km for kinetic, ~5 km for plasma |
| `KINETIC_DAMAGE`, `PLASMA_DAMAGE` | Unchanged (HP is abstract) | No change |
| `ENEMY_KINETIC_SPEED` | km/s | Proportional scale |

**`js/scene/missiles.js`**

| What changes | Why | How |
|-------------|-----|-----|
| `MISSILE_THRUST` (12 abstract/s²) | km/s² | Scale proportionally |
| `MISSILE_SPEED` (15 abstract/s) | km/s | Scale proportionally |
| `MISSILE_DET_RADIUS` (1.5 abstract) | km | ~3 km |
| `MISSILE_BLAST_RADIUS` (5 abstract) | km | ~5000 km |
| BH despawn `r2 < 4.0` | km² | `r2 < BH_RADIUS_KM * BH_RADIUS_KM` |

**`js/scene/particles.js`**

| What changes | Why | How |
|-------------|-----|-----|
| Particle speed `15 + Math.random() * 25` | km/s | Scale to km/s |
| Particle render point size | Unchanged (screen pixels) | No change |

**`js/scene/waves.js`**

| What changes | Why | How |
|-------------|-----|-----|
| `spawnWave()` entire function | Now spawns fleets, not individuals | Replace with fleet-based spawn |
| `getWaveDefinition()` | Fleet composition per wave | Delegate to `fleets.js` |
| Max 3 fleets per wave | New constraint | `getWaveDefinition()` caps at 3 fleet objects |

**`js/scene/shaders.js`**

| What changes | Why | How |
|-------------|-----|-----|
| Enemy vertex shader BH warp thresholds | `smoothstep(8.0, 2.0, ...)` in abstract units | Scale to km |
| Enemy vertex shader disk proximity | `smoothstep(14.0, 4.0, ...)` | Scale to km |
| Fragment shader (the main ray march `fsSource`) | Planet uniforms already in abstract units | No change |
| `escapeR` in main shader loop | Already computed from camera distance | No change |

**`css/style.css`**

| What changes | Why | How |
|-------------|-----|-----|
| Radar panel element styles | New radar UI | Add `.radar-panel`, `.radar-canvas` classes |
| Warp indicator element | New warp HUD | Add `.warp-indicator` class |

### Files Created

**`js/scene/scale.js`** — Coordinate and scale constants

```javascript
// Canonical scale: 1 simulation unit = 1 km
const SCALE_KM = 1.0;

// Physical body sizes
const BH_RADIUS_KM      = 10000;   // 20,000 km diameter
const JUPITER_RADIUS_KM = 2000;    // 4,000 km diameter / 2
const PLAYER_SHIP_KM    = 10;      // player ship length
const CAPITAL_SHIP_KM   = 8;       // enemy capital length
const GRUNT_SHIP_KM     = 0.5;     // grunt ship length

// Orbit radii (km from BH center)
const ORBIT_JUPITER_KM  = 50000;
const ORBIT_SPACING_KM  = 50000;   // each planet ~50,000 km further out

// Time scale anchor: Jupiter orbit period = 60s
// Circular velocity at ORBIT_JUPITER_KM: v = 2π * r / T
// BH_GM derived from: v² = BH_GM / r → BH_GM = v² * r
const JUPITER_PERIOD_S  = 60.0;
const JUPITER_CIRC_V    = (2 * Math.PI * ORBIT_JUPITER_KM) / JUPITER_PERIOD_S; // ~5236 km/s
const BH_GM_KM          = JUPITER_CIRC_V * JUPITER_CIRC_V * ORBIT_JUPITER_KM; // km³/s²

// World boundary
const MAX_ORBIT_KM       = 400000; // fence beyond outermost orbit

// Camera-relative transform (subtract before GL upload)
function worldToRenderPos(wx, wy, wz, camX, camY, camZ, out) {
  out[0] = wx - camX;
  out[1] = wy - camY;
  out[2] = wz - camZ;
}
```

**`js/scene/radar.js`** — Radar/orbital-chart mini-map

Key responsibilities:
- Holds reference to a separate `<canvas id="radar-canvas">` element
- Mini-map mode (bottom-left, ~200px): always visible during combat
- Expanded mode (side panel, ~400px, O key): full orbital chart
- `renderRadar(simTime)`: clear canvas, draw bodies, enemy dots, player dot
- `toggleRadarExpanded()`: toggle between mini/panel
- No writes to simulation state

**`js/scene/warp.js`** — Warp speed time dilation

Key responsibilities:
- `warpActive` boolean flag
- `WARP_SCALE` = 30 (max 30x time acceleration)
- `WARP_RAMP_TIME` = 1.0s (smooth acceleration to avoid physics explosion)
- `toggleWarp()`: spacebar handler
- `computeWarpDt(rawDt)`: returns simDt (ramped warpScale × rawDt, or rawDt if inactive)
- `updateWarpHUD()`: update DOM element showing warp factor
- Constraint: warp disables when combat active (enemies present), or provide visual-only warp warning

**`js/scene/fleets.js`** — Fleet composition tables

Key responsibilities:
- `FLEET_ARCHETYPES` data table: `{name, roles, composition{type,count}[], formationRadius}`
- `getFleetComposition(waveNum, difficulty)`: returns array of fleet specs for this wave
- `spawnFleet(fleetSpec, anchorBodyIdx)`: places all members using staggered station phases
- Max 3 fleets per wave (hard cap at `FLEET_MAX_PER_WAVE = 3`)

---

## Build Order

Dependencies flow downward. Later phases must not break earlier phases while in progress.

```
PHASE A: Scale Foundation  [prerequisite for everything]
  1. Write scale.js with all constants (BH_RADIUS_KM, BH_GM_KM, etc.)
  2. Update index.html: add scale.js first in script load order
  3. Update BH_GM in inline script to use BH_GM_KM from scale.js
  4. Update planetData oR/radius to km values
  5. Update camera near/far clipping planes
  RESULT: Scene still works (existing combat uses old constants until later)

PHASE B: Simulation Layer Rescale  [modify existing modules]
  1. orbital.js: update all distance/velocity constants to km
  2. combat.js: update BIN_WIDTH, detection radii, despawn checks
  3. weapons.js: update speeds, ranges, hit radii
  4. missiles.js: update speeds, thrust, detonation radii
  5. particles.js: update particle speeds
  CRITICAL: Run visual tests after each file. Combat must remain functional.
  Each file is independent after scale.js exists.

PHASE C: Instance Buffer Camera-Relative Transform
  1. Identify all GL position uploads (combat.js updateInstanceBuffer,
     weapons.js renderProjectiles, missiles.js render, particles.js renderParticles)
  2. Thread camWorldPos to each render function
  3. Apply worldToRenderPos subtraction at each upload site
  RESULT: Rendering correct at km scale. This is the main visual correctness phase.

PHASE D: Body Collision  [new behavior, no existing code to break]
  1. Add body collision check to ship physics loop (index.html updateNav)
  2. Add enemy vs body check at end of updateEnemyAI loop
  3. Add projectile vs body check in checkProjectileHits()
  4. World boundary fence in updateNav

PHASE E: Fleet System  [replaces wave spawning logic only]
  1. Write fleets.js with FLEET_ARCHETYPES table
  2. Write spawnFleet() using existing spawnEnemy()
  3. Modify waves.js spawnWave() to call spawnFleet() instead of direct spawnEnemy()
  4. Keep wave state machine (WAVE_IDLE/ACTIVE/BREATHER) intact
  RESULT: Enemies spawn in formation groups. All AI/weapons/collisions unchanged.

PHASE F: Warp Speed  [additive, no existing code changes]
  1. Write warp.js with warpActive flag and computeWarpDt()
  2. Replace direct rawDt usage in render() with computeWarpDt(rawDt)
  3. Add warp spacebar handler
  4. Add warp HUD element to index.html
  5. Add warp indicator style to css/style.css
  RESULT: Spacebar toggles 30x time acceleration. All existing combat unaffected.

PHASE G: Radar  [additive, no existing code changes]
  1. Write radar.js
  2. Add `<canvas id="radar-canvas">` to index.html
  3. Add radar CSS layout
  4. Add renderRadar() call after main GL frame in render()
  5. Add O key handler for expand/collapse
  6. Remove orbit circle rendering from main 3D viewport (optional cleanup)
  RESULT: Bottom-left mini-map. Navigation fully moved to radar.

PHASE H: LOD and Visual Tuning  [optional, last]
  1. Update LOD thresholds in enemy shader to km values
  2. Tune BH disk shader for close-up dominance at new scale
  3. Add planet LOD: 2D billboard shader for distant planets
  4. Visual polish: warp distortion overlay, fleet formation visuals
```

### Critical Path

The critical path through the refactor is **A → B → C**. Phase A (scale.js + planetData) is
the prerequisite. Phase B (module rescaling) can proceed file by file — each file is independent
once scale.js exists. Phase C (camera-relative rendering) is the make-or-break visual step.

Phases D-H are independent of each other once A-C are complete. They can proceed in any order
or in parallel if multiple sessions are available.

### What Cannot Break During Refactor

The following must remain functional throughout all phases:

- The ray march shader (phases A-H do not touch `fsSource` or `pg` program)
- Normal navigation mode (the `flyMode` gate protects it)
- Planet hover detection via WASM (WASM offsets are unchanged)
- Existing HUD elements (hull, shields, wave counter, weapon status)
- `tests.html` shader invariants (the ray march is untouched)

---

## Anti-Patterns

### Anti-Pattern 1: Changing the Ray March Shader for Scale

**What people do:** Pass km-scale planet positions directly as `u_planet0` through `u_planet6`
uniforms to the ray march shader.

**Why it's wrong:** The ray march shader uses its own coordinate system tuned to its 250-step
Verlet integrator. The `escapeR`, `r_h`, step size `0.08*(r-r_h)`, and disk shading function
all expect positions in "abstract units" where the event horizon is ~2.0. Passing km values
(10000.0 for BH radius) would break every threshold in the shader and produce garbage output.

**Do this instead:** Maintain two separate position representations. The ray march shader
receives positions from `planetPosAtTime()` in abstract units (existing system, unchanged).
The simulation uses km positions derived from the same `planetData` parameters.

### Anti-Pattern 2: Global Scale Factor Applied to Shader Uniforms

**What people do:** Multiply all shader uniforms by a global `SCALE` factor at upload time.

**Why it's wrong:** Some shader uniforms are in abstract units (planet positions for the ray
march), some are already in screen space (point sizes), some are in render units (enemy
positions after camera-relative transform). A blanket multiplier creates inconsistency and
makes debugging impossible.

**Do this instead:** Each uniform has a documented coordinate space. Transform at the source
(worldToRenderPos for entity positions), not at a global middleware layer.

### Anti-Pattern 3: Warp Speed Affects Camera or Rendering Time

**What people do:** Advance `simTime` faster than `realTime` for warp, causing the ray march
shader time uniform (`u_time`) to advance faster too.

**Why it's wrong:** `u_time` drives accretion disk rotation, planet shader animations, and
detonation aging. Accelerating it distorts visual fidelity in unexpected ways (disk spins 30x
faster, explosions flash and die instantly).

**Do this instead:** Warp speed advances only the *physics simulation time* (`simTime` for
entity positions). The shader's `u_time` continues to track real wall-clock time. These are
already separate if `u_time` uses `performance.now()` and `simTime` uses the accumulated
simDt. Confirm they are separate before implementing warp.

### Anti-Pattern 4: Fleet System Replaces AI State Machine

**What people do:** Add fleet-level coordination logic into the enemy AI update loop,
making each enemy aware of its fleet.

**Why it's wrong:** The existing AI state machine (6 states, per-archetype behaviors) works
correctly and is tested across 9 phases of development. Embedding fleet awareness there adds
coupling that must be debugged every time AI behavior changes.

**Do this instead:** Fleets are a *spawn-time* concept only. `spawnFleet()` places enemies
at formation positions with the correct `assignBody` and `stationPhase`. After spawn, each
enemy runs its individual AI independently. Fleet coherence emerges from all members being
anchored to the same planet — no runtime fleet tracking needed.

---

## Scalability Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (0-50 enemies) | Everything fits in existing typed arrays. No changes needed. |
| km-scale scene | Camera-relative rendering prevents float32 precision loss. Required. |
| 3 fleets, 30 enemies | Existing MAX_ENEMIES=64 is sufficient. BIN_WIDTH and NUM_BINS need update. |
| Warp speed 30x | Physics timestep 30x larger. Verlet integration still stable if no sub-frame collisions missed. Check: projectile speed × simDt must not exceed body radius. |
| Radar overlay | 2D canvas draw, O(n) where n=bodies+enemies. Negligible. |

### Performance Safety Notes

**Warp speed and physics stability:** At 30x warp, a kinetic round at 8000 km/s moves
240,000 km per second of real time. At 30fps, one real frame = 33ms = 8000 km real travel.
At 30x warp that is 240,000 km per real frame. With planets at 50,000 km orbit spacing, a
projectile could skip past a planet in one frame. Mitigation: disable warp speed when
projectiles are in flight, or disable warp when enemies are within a threshold distance.

**Radial bin update at km scale:** `BIN_WIDTH` must be large enough that no entity crosses
more than one bin per frame even at maximum simDt. At 30x warp: max enemy velocity ~orbital
at 50,000 km orbit ≈ 5000 km/s × 1s (warp frame) = 5000 km/frame. `BIN_WIDTH = 20000 km`
ensures no entity crosses more than 1 bin per frame.

---

## Sources

All findings derived from primary source: the existing codebase.

- `js/scene/combat.js` — SoA entity store, AI state machine, radial bin system (verified 2026-03-15)
- `js/scene/orbital.js` — SOI, Hohmann, body helpers (verified 2026-03-15)
- `js/scene/weapons.js` — projectile physics, hit detection (verified 2026-03-15)
- `js/scene/missiles.js` — PN guidance, fuel system (verified 2026-03-15)
- `js/scene/waves.js` — wave state machine, archetype spawning (verified 2026-03-15)
- `js/scene/particles.js` — impact particle system (verified 2026-03-15)
- `js/scene/math.js` — vector/matrix math, geometry builders (verified 2026-03-15)
- `js/scene/shaders.js` — all GLSL source strings (verified 2026-03-15)
- `.planning/PROJECT.md` — v1.1 feature requirements and constraints (verified 2026-03-15)
- `.planning/research/ARCHITECTURE.md` (v1.0) — existing architecture baseline (verified 2026-03-15)

---
*Architecture research for: v1.1 Realistic Scale & Fleet Combat*
*Researched: 2026-03-15*
