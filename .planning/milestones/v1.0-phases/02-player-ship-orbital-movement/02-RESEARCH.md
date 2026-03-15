# Phase 2: Player Ship & Orbital Movement - Research

**Researched:** 2026-03-09
**Domain:** Orbital mechanics, transfer orbits, Lagrange points, procedural ship geometry, WebGL rendering
**Confidence:** HIGH

## Summary

Phase 2 transforms the existing free-thrust navigation mode into a strategic orbital transfer system. The player clicks a target body (black hole, planet, or Lagrange point), and the ship auto-computes and flies a transfer orbit to it. The existing leapfrog integrator, N-body gravity, and trajectory preview in `nav.js` provide strong foundations -- the key work is adding orbit state management, transfer orbit computation, sphere-of-influence capture logic, Lagrange point positions, altitude adjustment, and upgrading the ship geometry to a capital-class design.

The physics are "game-realistic" -- not true patched conics or Lambert solvers, but a simplified Hohmann-like approach that uses the existing N-body gravity simulation. Because the game already integrates real gravitational forces via leapfrog, the transfer orbit is computed as an initial delta-v burn direction and magnitude, then let gravity do the rest. Arrival detection uses sphere-of-influence radii. This approach avoids the complexity of analytic conic sections while leveraging the existing simulation infrastructure.

**Primary recommendation:** Use the existing `simulateTrajectory()` + `computeGravAccelAtTime()` pipeline for transfer orbit preview. Compute delta-v for Hohmann-like transfers analytically, but execute the transfer as a continuous-thrust burn within the existing leapfrog integrator. Detect orbit capture via Hill sphere radii. Lagrange points are computed as static positions in the rotating frame using the cube-root approximation for L1/L2 and equilateral triangle positions for L4/L5.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Click on body directly in 3D view to select as orbit target (reuses existing ray-sphere hover detection)
- No radial menu or keyboard list -- spatial clicking only
- Black hole is a valid orbit target (dangerous close orbit, tactically interesting)
- Selected body gets a glowing orbit ring highlight + predicted transfer trajectory (dotted curve) appears instantly from ship to target
- Lagrange points shown as markers toggled with a hotkey (hidden by default to keep scene clean)
- L-points are clickable targets when visible
- Auto-computed burn: click target -> ship computes transfer trajectory -> rotates to burn angle -> fires engine automatically
- Player controls thrust level during transfer (thrust slider, faster/slower transit)
- Auto-circularize on arrival: ship automatically enters circular orbit at default altitude when reaching target's sphere of influence
- Click new target anytime mid-transfer to retarget -- previous transfer is abandoned, new trajectory computed immediately
- Bullet time and fast forward both active during transfers
- Capital ship class -- same size as enemy Capital archetype, distinctly larger than Grunt/Swarm/etc.
- Distinct visual style from all enemy ships -- not angular/sharp like enemies. Smoother, sleeker silhouette
- Blue hull color matching HUD theme (rgba(60,140,255))
- Glowing engine points at the rear that intensify during thrust (no exhaust trail)
- No prograde/retrograde markers -- auto-burn handles orientation, trajectory line shows direction
- Ships face direction of orbital travel
- Up/down arrow keys to raise/lower orbit altitude once captured around a body
- Smooth continuous adjustment -- hold key for gradual altitude change, release to stop
- Natural limits: lower too far -> crash into body; raise too far -> escape orbit (enter free flight). No artificial clamping
- Altitude readout displayed on HUD as a number (distance from body surface)

### Claude's Discretion
- Exact transfer orbit computation (Hohmann-like, Lambert solver, or simplified approach)
- Lagrange point calculation method and which L-points to include per body pair
- Sphere of influence radii for each body
- Default capture orbit altitude
- Ship geometry design (tri count, exact shape -- must read as "capital ship" and be distinct from enemies)
- Orbit ring rendering style
- Hotkey choice for L-point toggle
- Altitude change rate and key repeat behavior

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOV-01 | Player can select any orbital body (black hole, 7 planets, Lagrange points) as an orbit target | Extend existing ray-sphere hover detection for target selection; add Lagrange point markers as clickable targets |
| MOV-02 | Ship computes and flies a physically accurate transfer orbit to the selected body | Hohmann-like delta-v computation + existing leapfrog integrator; sphere-of-influence capture detection |
| MOV-03 | Transfer trajectory is shown as a dotted/curved line during transit | Extend existing `simulateTrajectory()` with thrust parameters; render via existing trajectory shader |
| MOV-04 | Player can control thrust to adjust transit speed | Existing thrust slider modulates burn magnitude; higher thrust = faster transfer but same trajectory shape |
| MOV-05 | Player can adjust orbit altitude once captured in orbit around a body | Prograde/retrograde micro-burns via up/down arrow keys; orbit radius adjusts continuously |
| MOV-06 | Player can orbit Lagrange points (L1-L5) between major bodies | Compute L-point positions using Hill sphere approximation; treat as virtual bodies with small SOI |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WebGL 1.0 | N/A | All rendering | Project constraint: no frameworks |
| Vanilla JS | ES6 | All logic | Project constraint: pure JS |
| Existing WASM | N/A | Planet positions (0-5) | Already embedded in index.html |

### Supporting (existing, to extend)
| Module | File | Purpose | How Extended |
|--------|------|---------|--------------|
| nav.js | js/scene/nav.js | Ship physics, gravity, trajectory | Add orbit state machine, transfer computation, capture detection |
| math.js | js/scene/math.js | Vector/matrix math, geometry | Add capital ship geometry function |
| shaders.js | js/scene/shaders.js | Ship/trajectory shaders | Add engine glow uniform, orbit ring shader |
| combat.js | js/scene/combat.js | Entity system | Reference for capital ship scale |
| index.html | index.html | Render loop, input, HUD | Add click-to-target, altitude controls, L-point toggle, orbit ring rendering |

### No New Dependencies
This phase adds zero new libraries. Everything is built on existing infrastructure.

## Architecture Patterns

### Recommended State Machine for Ship Orbit

The ship needs a state machine to manage its orbital lifecycle:

```
ORBITING -> TRANSFER -> ORBITING
    |           |           |
    v           v           v
 (altitude    (retarget)  (altitude
  adjust)                  adjust)
```

States:
- **ORBITING**: Ship is in circular orbit around a body. Velocity is tangent to orbit. Altitude adjustable via up/down keys.
- **TRANSFER**: Ship is executing a transfer burn toward a target body. Thrust is applied automatically in computed burn direction. Player can adjust thrust magnitude. Can retarget at any time.
- **FREE**: Ship has escaped orbit (raised altitude too high). Can click any body to initiate transfer.

```javascript
// Ship orbit state (add to nav.js)
const ORBIT_STATE = { ORBITING: 0, TRANSFER: 1, FREE: 2 };
let orbitState = ORBIT_STATE.FREE;
let orbitBody = -1;        // Index into planetData, -1 = black hole, -2 = L-point
let orbitAltitude = 0;     // Distance from body surface
let transferTarget = -1;   // Target body index
let transferBurnDir = [0, 0, 0]; // Auto-computed burn direction
let transferBurnMag = 0;   // Auto-computed delta-v magnitude
```

### Recommended Project Structure Changes

```
js/scene/
├── math.js          # + createCapitalShipGeometry()
├── nav.js           # + orbit state machine, transfer computation, SOI detection
├── orbital.js       # NEW: Lagrange points, SOI radii, Hohmann delta-v formulas
├── shaders.js       # + engine glow, orbit ring shader
├── combat.js        # (unchanged)
└── missiles.js      # (unchanged)
```

### Pattern 1: Hohmann-Like Transfer Computation

**What:** Compute delta-v for a transfer between two circular orbits around the same central body (black hole).

**When to use:** Player clicks a target body while orbiting a different body.

**Approach:** Use the vis-viva equation to compute the required velocity change. Because the game uses N-body gravity with a dominant central mass (BH_GM = 400), a simplified Hohmann approach works well:

```javascript
// Source: Standard orbital mechanics (vis-viva equation)
function computeTransferDeltaV(r1, r2, GM) {
    // r1 = current orbit radius, r2 = target orbit radius
    // Semi-major axis of transfer ellipse
    const a_transfer = (r1 + r2) / 2;

    // Current circular velocity
    const v_circ = Math.sqrt(GM / r1);

    // Velocity at periapsis of transfer ellipse (vis-viva)
    const v_transfer = Math.sqrt(GM * (2 / r1 - 1 / a_transfer));

    // Delta-v for departure burn
    const dv1 = v_transfer - v_circ;

    // Transfer time (half orbital period of transfer ellipse)
    const t_transfer = Math.PI * Math.sqrt(a_transfer * a_transfer * a_transfer / GM);

    return { dv: dv1, transferTime: t_transfer };
}
```

**Key insight:** The existing `simulateTrajectory()` can preview this transfer by including the burn as a thrust direction/magnitude parameter (it already supports `thrDir`, `thrPow`, `thrDur`). The actual execution just sets `flyVel` to the post-burn velocity and lets the leapfrog integrator handle the rest.

### Pattern 2: Sphere of Influence (SOI) Detection

**What:** Detect when the ship enters a body's gravitational sphere of influence for orbit capture.

**When to use:** Every physics frame during TRANSFER state.

**Approach:** Use the Hill sphere formula: `r_SOI = d * (m / (3 * M))^(1/3)` where d is the body's distance from the black hole, m is the body's GM, and M is the black hole's GM.

```javascript
// Source: Hill sphere formula
function computeSOI(planetIndex) {
    const p = planetData[planetIndex];
    const d = p.oR * 2; // Nav-mode doubled orbit radius
    const planetGM = _planetGM[planetIndex];
    return d * Math.cbrt(planetGM / (3 * BH_GM));
}
```

For the black hole itself, SOI is effectively infinite (it's the central body). The "capture" radius for BH orbit should be a gameplay-tuned value (e.g., 5-8 units from center).

### Pattern 3: Auto-Circularization on Capture

**What:** When the ship enters a body's SOI, automatically adjust velocity to circular orbit.

**When to use:** Ship crosses SOI boundary during transfer.

```javascript
// Source: Circular orbit velocity formula v = sqrt(GM/r)
function circularizeOrbit(bodyPos, bodyGM) {
    const dx = flyPos[0] - bodyPos[0];
    const dz = flyPos[2] - bodyPos[2];
    const r = Math.sqrt(dx * dx + dz * dz);
    const v_circ = Math.sqrt(bodyGM / r);
    // Tangent direction (perpendicular to radius, in orbital direction)
    const tx = -dz / r, tz = dx / r;
    flyVel[0] = tx * v_circ;
    flyVel[1] = 0;
    flyVel[2] = tz * v_circ;
}
```

### Pattern 4: Lagrange Point Computation

**What:** Compute L1-L5 positions for each planet relative to the black hole.

**When to use:** On L-point toggle, and each frame for marker position updates (since planets orbit).

**Approach:** Only compute L1, L2, L4, L5 for each planet (L3 is on the far side of the black hole, tactically uninteresting and clutters the scene). Use the cube-root approximation for L1/L2 and equilateral triangle geometry for L4/L5.

```javascript
// Source: Lagrange point approximation formulas
function computeLagrangePoints(planetIndex, time) {
    const p = planetData[planetIndex];
    const pos = planetPosAtTime(p, time);
    const d = Math.sqrt(pos[0] * pos[0] + pos[2] * pos[2]); // Distance from BH
    const angle = Math.atan2(pos[0], pos[2]); // Planet's orbital angle

    const planetGM = _planetGM[planetIndex];
    const r_hill = d * Math.cbrt(planetGM / (3 * BH_GM));

    // L1: Between BH and planet (closer to BH by r_hill)
    const r_L1 = d - r_hill;
    const L1 = [r_L1 * Math.sin(angle), 0, r_L1 * Math.cos(angle)];

    // L2: Beyond planet (farther from BH by r_hill)
    const r_L2 = d + r_hill;
    const L2 = [r_L2 * Math.sin(angle), 0, r_L2 * Math.cos(angle)];

    // L4: 60 degrees ahead of planet in orbit
    const a4 = angle + Math.PI / 3;
    const L4 = [d * Math.sin(a4), 0, d * Math.cos(a4)];

    // L5: 60 degrees behind planet in orbit
    const a5 = angle - Math.PI / 3;
    const L5 = [d * Math.sin(a5), 0, d * Math.cos(a5)];

    return { L1, L2, L4, L5, r_hill };
}
```

### Pattern 5: Capital Ship Geometry

**What:** Procedural geometry for the player's capital ship, distinct from the angular Grunt enemies.

**When to use:** Ship initialization (geometry created once, reused every frame).

**Approach:** Build geometry using the same `tri()`/`quad()` helper pattern as `createGruntGeometry()` in math.js. The capital ship should be:
- Scale: ~3-4x the Grunt geometry size (Grunt fits in a ~1.0 x 0.4 x 0.24 bounding box)
- Silhouette: Rounded wedge shape (smooth curves vs. Grunt's angular diamond)
- Features: Main hull, two engine nacelles (wider spacing than Grunt), bridge/command section on top, wider flanking wings
- Triangle count: ~120-180 tris (double the Grunt's 62 but still performant for a single draw call)

The current ship is a simple box (`createBoxGeometry(0.08, 0.025, 0.04)` at line 256 of index.html). This will be replaced with the capital ship geometry.

### Pattern 6: Orbit Ring Rendering

**What:** Glowing ring around the selected target body showing the predicted capture orbit.

**When to use:** When a target body is selected (TRANSFER state or body hover).

**Approach:** Generate a circle of GL_POINTS or GL_LINE_STRIP vertices at the predicted orbit altitude around the target body. Render using the existing trajectory shader program (`trajPg`) with a different color (bright blue glow). Regenerate positions each frame since planets move.

```javascript
// Generate orbit ring vertices (2D circle on ecliptic)
const RING_SEGMENTS = 64;
const ringArray = new Float32Array(RING_SEGMENTS * 3);

function updateOrbitRing(bodyPos, radius) {
    for (let i = 0; i < RING_SEGMENTS; i++) {
        const angle = (i / RING_SEGMENTS) * Math.PI * 2;
        ringArray[i * 3]     = bodyPos[0] + radius * Math.cos(angle);
        ringArray[i * 3 + 1] = 0;
        ringArray[i * 3 + 2] = bodyPos[2] + radius * Math.sin(angle);
    }
}
```

### Anti-Patterns to Avoid

- **Lambert solver complexity:** A full Lambert solver handles arbitrary point-to-point transfers with time constraints. Far too complex for this game. The simplified Hohmann approach + existing N-body simulation is sufficient.
- **Patched conics:** Traditional patched conic approximation treats each SOI transition as a separate two-body problem. Since the game already has N-body gravity in the leapfrog integrator, this adds complexity without benefit.
- **Analytic orbit propagation:** Don't try to compute the transfer trajectory analytically. The existing `simulateTrajectory()` with leapfrog integration already handles multi-body gravity. Just add the initial burn as a velocity change.
- **Per-frame Lagrange point recomputation for all planets:** Only compute L-points for visible planets. Since L-points are toggled by hotkey and default to hidden, skip computation when hidden.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transfer trajectory preview | Custom orbit propagator | Existing `simulateTrajectory()` in nav.js | Already handles N-body gravity, leapfrog integration, 100-step preview |
| N-body gravity | Custom gravity function | Existing `computeGravAccel()` / `computeGravAccelAtTime()` | Already handles BH + 7 planets correctly |
| Ray-sphere planet selection | Custom click detection | Existing hover detection in render loop (lines 569-643 of index.html) | Already detects planet hover with ray-sphere intersection |
| Trajectory line rendering | Custom line shader | Existing `trajPg` shader program | Already renders dotted trajectory as GL_POINTS with transparency |
| View-projection matrices | Manual matrix math | Existing `mat4Perspective` + `mat4LookAt` + `mat4Mul` | Already used for ship/missile rendering |

**Key insight:** Phase 1 established the rendering infrastructure. Phase 2 is primarily a physics/state-management phase that leverages existing rendering pipelines.

## Common Pitfalls

### Pitfall 1: Transfer Orbit Overshooting Target
**What goes wrong:** Ship computes Hohmann delta-v but N-body perturbations from other planets cause it to miss the target.
**Why it happens:** Hohmann formula assumes two-body (ship + BH). Other planets perturb the trajectory.
**How to avoid:** Use the existing `simulateTrajectory()` to preview the actual path under N-body gravity. If the preview doesn't arrive near the target, iteratively adjust the burn direction/magnitude. Alternatively, add small correction burns during transfer (station-keeping).
**Warning signs:** Trajectory preview line doesn't terminate near the target body.

### Pitfall 2: SOI Radius Too Small or Too Large
**What goes wrong:** Hill sphere formula gives physically correct but gameplay-wrong SOI radii. Small planets have tiny SOIs that are hard to hit; large planets dominate too much space.
**Why it happens:** Hill sphere scales as `d * (m/3M)^(1/3)`. With BH_GM=400 and PLANET_GM_K=50, planet GMs are small relative to BH.
**How to avoid:** Use the Hill sphere formula as a baseline, then apply a gameplay minimum (e.g., `max(r_hill, planet.radius * 3)`). Tune the constant after testing. The SOI is a gameplay mechanic, not a physics simulation.
**Warning signs:** Ship flies through small planets without capturing; ship captures to large planets from far away.

### Pitfall 3: Orbit Altitude Adjustment Destabilizing
**What goes wrong:** Up/down arrow altitude adjustments create unstable oscillations instead of smooth orbit changes.
**Why it happens:** Directly modifying orbit radius without adjusting velocity creates an elliptical orbit that oscillates between periapsis and apoapsis.
**How to avoid:** Altitude adjustment should apply small prograde/retrograde velocity changes (delta-v), not position changes. Prograde burn raises orbit; retrograde burn lowers it. The existing leapfrog integrator naturally propagates the resulting orbit.
**Warning signs:** Ship oscillates radially after altitude change; orbit decays or spirals.

### Pitfall 4: Engine Glow Rendering Order
**What goes wrong:** Engine glow (additive blend) renders incorrectly against the black hole ray march background.
**Why it happens:** The ray march shader writes to the framebuffer first, then ship renders with depth test. Additive blend on top of ray march output can create artifacts.
**How to avoid:** Render engine glow as part of the ship shader pass (not a separate pass). Add a uniform for thrust intensity; the fragment shader adds glow to engine nozzle vertices based on their position (z < -0.3, near nacelles).
**Warning signs:** Bright white squares at engine positions; glow visible through ship hull.

### Pitfall 5: Click Target Conflicting with Camera Drag
**What goes wrong:** Left-click to select orbit target also starts camera drag.
**Why it happens:** Existing mousedown handler uses left-click for camera orbit in nav mode.
**How to avoid:** Use the existing `dD` (drag detected) flag. If mouse up fires without drag (click), check for body hit. This pattern already exists for planet navigation in non-nav mode (line 381: `if(!dD&&hP>=0...)`).
**Warning signs:** Clicking a planet starts camera drag instead of selecting target; camera jumps when selecting target.

### Pitfall 6: Lagrange Point Markers Z-Fighting with Ecliptic Plane
**What goes wrong:** L-point markers at Y=0 z-fight with the accretion disk or other ecliptic-plane elements.
**Why it happens:** Markers are at the same Y coordinate as the ecliptic plane.
**How to avoid:** Render L-point markers slightly above the ecliptic (Y=0.1) or as GL_POINTS with a larger point size (4-6px). They're navigational aids, not physical objects.
**Warning signs:** Flickering markers, invisible markers at certain camera angles.

## Code Examples

### Transfer Orbit Initiation (core algorithm)

```javascript
// When player clicks a target body to initiate transfer
function initiateTransfer(targetIndex) {
    transferTarget = targetIndex;
    orbitState = ORBIT_STATE.TRANSFER;

    // Get target position (current time for preview)
    const targetPos = getBodyPosition(targetIndex, simTime);
    const targetR = Math.sqrt(targetPos[0] ** 2 + targetPos[2] ** 2);

    // Current ship orbit radius
    const shipR = Math.sqrt(flyPos[0] ** 2 + flyPos[2] ** 2);

    // Hohmann delta-v (simplified, BH-centric)
    const a_t = (shipR + targetR) / 2;
    const v_current = Math.sqrt(BH_GM / shipR);
    const v_transfer = Math.sqrt(BH_GM * (2 / shipR - 1 / a_t));
    const dv = v_transfer - v_current;

    // Burn direction: prograde (tangent to current orbit)
    // Ship velocity direction IS the prograde direction
    const spd = v3len(flyVel);
    if (spd > 0.01) {
        transferBurnDir[0] = flyVel[0] / spd;
        transferBurnDir[1] = 0;
        transferBurnDir[2] = flyVel[2] / spd;
    }
    transferBurnMag = Math.abs(dv);

    // Apply the burn as an instant velocity change
    flyVel[0] += transferBurnDir[0] * dv;
    flyVel[2] += transferBurnDir[2] * dv;
}
```

### SOI Capture Check (per-frame)

```javascript
// Check each frame during TRANSFER state
function checkSOICapture() {
    if (orbitState !== ORBIT_STATE.TRANSFER) return;

    const targetPos = getBodyPosition(transferTarget, simTime);
    const dx = flyPos[0] - targetPos[0];
    const dz = flyPos[2] - targetPos[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    const soi = getBodySOI(transferTarget);

    if (dist < soi) {
        // Captured! Auto-circularize
        const bodyGM = getBodyGM(transferTarget);
        circularizeOrbit(targetPos, bodyGM);
        orbitState = ORBIT_STATE.ORBITING;
        orbitBody = transferTarget;
        orbitAltitude = dist - getBodyRadius(transferTarget);
        transferTarget = -1;
    }
}
```

### Altitude Adjustment (key-held behavior)

```javascript
// In updateNav(), when ORBITING and keys held
function updateAltitude(simDt) {
    if (orbitState !== ORBIT_STATE.ORBITING) return;

    const ALT_RATE = 2.0; // Units per second of delta-v
    let dvMag = 0;

    if (altUpHeld) dvMag = ALT_RATE * simDt;     // Prograde = raise orbit
    if (altDownHeld) dvMag = -ALT_RATE * simDt;   // Retrograde = lower orbit

    if (dvMag !== 0) {
        const spd = v3len(flyVel);
        if (spd > 0.01) {
            flyVel[0] += (flyVel[0] / spd) * dvMag;
            flyVel[2] += (flyVel[2] / spd) * dvMag;
        }
    }

    // Check escape: if orbit radius > SOI, transition to FREE
    const bodyPos = getBodyPosition(orbitBody, simTime);
    const dx = flyPos[0] - bodyPos[0];
    const dz = flyPos[2] - bodyPos[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    const bodyRadius = getBodyRadius(orbitBody);

    orbitAltitude = dist - bodyRadius;

    if (orbitAltitude < 0) {
        // Crashed into body!
        handleCrash();
    }
    if (dist > getBodySOI(orbitBody)) {
        orbitState = ORBIT_STATE.FREE;
        orbitBody = -1;
    }
}
```

## Design Decisions (Claude's Discretion)

### Transfer Orbit Computation: Simplified Hohmann

**Decision:** Use Hohmann delta-v formula for the initial burn, then let the N-body leapfrog integrator handle trajectory propagation. No Lambert solver, no patched conics.

**Rationale:** The existing `simulateTrajectory()` already handles N-body gravity preview. The Hohmann formula gives the correct initial delta-v for a two-body transfer. Multi-body perturbations will slightly deviate the trajectory from a pure ellipse, but this actually makes the game feel more physically authentic. The trajectory preview line shows the actual path the ship will follow.

**Confidence:** HIGH -- the existing gravity infrastructure makes this the natural choice.

### Lagrange Points: L1, L2, L4, L5 Only (Skip L3)

**Decision:** Compute L1, L2, L4, L5 for the 3 largest planets only (Jupiter/idx 0, Saturn/idx 1, Neptune/idx 3). Skip L3 (opposite side of BH from planet -- tactically boring) and skip L-points for smaller planets (too close together, clutters scene).

**Rationale:** L3 is always on the far side of the central body and offers no tactical advantage. Small planets (Venus/idx 4, Earth/idx 5) have such small Hill spheres that their L-points overlap with the planet itself. Including L-points for 3 major planets gives 12 total L-points -- enough for strategic variety without visual clutter.

**Confidence:** MEDIUM -- the specific planet selection may need tuning based on the actual SOI radii in the game's scale.

### Sphere of Influence Radii

**Decision:** Use Hill sphere formula with a gameplay minimum floor.

Computed SOI radii (nav-mode, orbits doubled):

| Body | oR (nav) | GM | Hill r | Gameplay SOI | Default Orbit Alt |
|------|----------|-----|--------|--------------|-------------------|
| BH | 0 (center) | 400 | infinite | 8.0 | 5.0 |
| Jupiter (0) | 76.0 | 781.25 | 6.8 | 7.0 | 4.0 |
| Saturn (1) | 104.0 | 400.0 | 6.3 | 6.5 | 3.5 |
| Uranus (2) | 136.0 | 168.75 | 6.0 | 6.0 | 3.0 |
| Neptune (3) | 172.0 | 137.2 | 6.3 | 6.5 | 3.0 |
| Venus (4) | 56.0 | 7.87 | 1.3 | 2.0 | 1.0 |
| Earth (5) | 66.0 | 10.8 | 1.5 | 2.0 | 1.2 |
| Mars (6) | 90.0 | 109.85 | 5.1 | 5.5 | 2.5 |

Planet GM formula: `PLANET_GM_K * r^3` where `PLANET_GM_K = 50.0` and `r = planetData[i].radius`.

Nav-mode orbit radius: `oR * 2` (doubled in enterNavMode).

Hill sphere: `d * cbrt(planetGM / (3 * BH_GM))`.

Gameplay SOI: `max(hillR, planetRadius * 2.5 + 1.0)`.

Default orbit altitude: roughly `planetRadius * 1.5`.

**Confidence:** MEDIUM -- the exact SOI values need gameplay testing.

### Ship Geometry: Capital-Class Wedge

**Decision:** ~150 triangle procedural capital ship with a smooth wedge silhouette, twin wide-set nacelles, bridge tower, and forward-swept wings.

Key design differences from Grunt enemy:
- Grunt: diamond cross-section nose, dorsal fin, narrow nacelles, angular silhouette
- Capital: rounded wedge nose, bridge tower (not fin), wide nacelles, forward-swept wing plates

Scale: Bounding box ~1.2 x 0.3 x 0.8 (vs Grunt's ~0.4 x 0.4 x 1.0). The capital ship is wider and longer but flatter.

Engine glow: The ship fragment shader gets a new `u_thrustIntensity` uniform (0.0-1.0). Vertices near the engine nacelle rear faces (z < -0.35) receive additive emission color `vec3(0.3, 0.5, 1.0) * thrustIntensity`.

**Confidence:** HIGH -- follows established createGruntGeometry() pattern.

### Orbit Ring Style

**Decision:** Render as a GL_LINE_LOOP of 64 segments with a pulsing blue color `rgba(60, 140, 255, 0.4)`. Use the existing trajectory shader program. The ring represents the predicted circular orbit the ship will enter upon capture.

**Confidence:** HIGH -- uses existing shader infrastructure.

### L-Point Toggle Hotkey

**Decision:** `L` key toggles Lagrange point visibility. Mnemonic, not conflicting with existing bindings (SPACE=thrust, B=bullet time, C=clear targets, 1/2=camera distance, backtick=exit nav).

**Confidence:** HIGH -- no conflicts with existing keybindings.

### Altitude Change Rate

**Decision:** 2.0 units/second of delta-v when arrow key held. This gives responsive but controllable altitude changes. At typical orbit velocities (5-20 units/s), this means ~10% velocity change per second -- noticeable but not jarring.

Key repeat: Use `keydown`/`keyup` flags (like existing `thrusting` flag), not `keypress` repeat events. This gives smooth continuous adjustment.

**Confidence:** MEDIUM -- rate needs gameplay tuning.

## State of the Art

| Old Approach (Phase 1) | New Approach (Phase 2) | Impact |
|------------------------|------------------------|--------|
| Free thrust: SPACE key + mouse aim direction | Auto-computed transfer: click target, ship burns automatically | Movement becomes strategic, not twitch |
| Box geometry ship (36 triangles) | Capital ship geometry (~150 triangles) | Ship reads as command vessel, distinct from enemies |
| Passive trajectory preview (current velocity only) | Active transfer trajectory preview (including burn) | Player sees where they're going before committing |
| No orbit concept (continuous free flight) | Orbit state machine (orbiting/transfer/free) | Enables altitude control, capture mechanics |
| No Lagrange points | L1/L2/L4/L5 for major planets | Strategic positioning options |

## Open Questions

1. **Black hole "orbit" behavior**
   - What we know: BH is a valid target, orbiting it is "dangerous"
   - What's unclear: What happens at very close orbits? The existing gravity pulls strongly. Should there be a minimum safe altitude or does the ship just get sucked in?
   - Recommendation: Set BH capture SOI at 8.0, default orbit at 5.0. Below ~3.0 (near event horizon rH ~2.0), gravity is extreme and the ship will likely spiral in. This IS the danger -- no artificial protection needed.

2. **Transfer orbit to moving targets**
   - What we know: Planets orbit the BH. Hohmann assumes fixed endpoints.
   - What's unclear: Should the transfer aim at the planet's current position or predicted future position?
   - Recommendation: For simplicity, aim at current position. The trajectory preview shows the actual N-body path. If the planet moves significantly during transfer, the ship will need a small correction -- this is realistic and adds gameplay depth. If testing shows it's frustrating, add lead-angle computation.

3. **Retargeting mid-transfer behavior**
   - What we know: "Click new target anytime mid-transfer to retarget"
   - What's unclear: Does retargeting apply a new Hohmann burn from current velocity, or does it only change the target for SOI capture detection?
   - Recommendation: Apply a new burn. The ship's current velocity may not be optimal for the new target. Compute a new delta-v from current state to new target's orbit radius.

4. **Crash behavior**
   - What we know: "Lower too far -> crash into body"
   - What's unclear: Phase 2 doesn't include DEF-01 (hull HP) or DEF-02 (ship destruction). What happens on crash?
   - Recommendation: Reset ship to a safe orbit around the same body (altitude = default). Display a warning flash. Proper crash destruction comes in Phase 6 (Defense).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based visual testing (tests.html pattern) |
| Config file | tests.html (existing) |
| Quick run command | Open tests.html in browser, verify all green |
| Full suite command | Open tests.html + visual checks of nav mode |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOV-01 | Click any body to select as target | manual | Visual: enter nav mode, click planet, verify orbit ring appears | N/A |
| MOV-02 | Transfer orbit computation and flight | manual | Visual: select target, verify trajectory line, verify arrival | N/A |
| MOV-03 | Trajectory line visible during transit | manual | Visual: initiate transfer, verify dotted line renders | N/A |
| MOV-04 | Thrust control during transit | manual | Visual: adjust thrust slider during transfer, verify speed change | N/A |
| MOV-05 | Altitude adjustment in orbit | manual | Visual: orbit body, press up/down arrows, verify altitude readout changes | N/A |
| MOV-06 | L-point orbiting | manual | Visual: press L to toggle, click L-point marker, verify orbit | N/A |

### Sampling Rate
- **Per task commit:** Visual inspection of nav mode behavior
- **Per wave merge:** Full visual test of all MOV requirements
- **Phase gate:** All 6 MOV requirements demonstrable in browser

### Wave 0 Gaps
- [ ] No automated tests possible for orbital mechanics behavior (all visual/interactive)
- [ ] Consider adding console assertions for SOI calculations and delta-v computations
- [ ] Existing tests.html only covers shader invariants, not nav mode logic

## Sources

### Primary (HIGH confidence)
- Existing codebase: `nav.js`, `math.js`, `shaders.js`, `combat.js`, `index.html` -- direct code analysis
- Vis-viva equation: Standard orbital mechanics formula, well-established
- Hill sphere formula: `r = d * (m / 3M)^(1/3)` -- standard celestial mechanics

### Secondary (MEDIUM confidence)
- [Hohmann Transfer -- Orbital Mechanics](https://orbital-mechanics.space/orbital-maneuvers/hohmann-transfer.html) -- delta-v formulas
- [Lagrange point -- Wikipedia](https://en.wikipedia.org/wiki/Lagrange_point) -- L-point geometry (equilateral triangle for L4/L5)
- [Hill sphere -- Wikipedia](https://en.wikipedia.org/wiki/Hill_sphere) -- SOI radius formula
- [Finding Lagrange points L1 and L2](https://www.johndcook.com/blog/2021/12/28/lagrange-points-l1-and-l2/) -- Cube root approximation validation

### Tertiary (LOW confidence)
- Capital ship geometry design -- based on game design principles, no authoritative source. Will need visual iteration.
- Altitude change rate (2.0 units/s) -- gameplay estimate, needs testing.
- SOI gameplay minimums -- tuning values, needs playtesting.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- extending existing codebase, no new dependencies
- Architecture: HIGH -- orbit state machine pattern is well-understood; existing gravity infrastructure is proven
- Physics (Hohmann, SOI): HIGH -- standard orbital mechanics formulas adapted for game context
- Lagrange points: MEDIUM -- formulas are standard, but which planets get L-points and exact positions need tuning
- Ship geometry: MEDIUM -- follows established pattern, but visual design needs iteration
- Pitfalls: HIGH -- identified from direct code analysis of existing nav.js and render loop
- Gameplay tuning (SOI sizes, altitude rates): LOW -- requires playtesting

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain, no external dependencies)
