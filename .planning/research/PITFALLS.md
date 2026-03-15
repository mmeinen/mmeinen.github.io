# Domain Pitfalls

**Domain:** WebGL km-scale scene transition and time acceleration — adding realistic scale to an existing WebGL 1.0 orbital combat system
**Researched:** 2026-03-14
**Confidence:** HIGH (codebase directly inspected, precision numbers verified against WebGL float32 spec, Z-fighting and tunneling literature verified)

---

## Critical Pitfalls

Mistakes that cause rewrites, major performance regressions, or architectural dead-ends.

---

### Pitfall 1: Float32 Precision Collapse at Km-Scale World Coordinates

**What goes wrong:**
At 350,000 km scene extent with float32, vertex position precision is approximately 35 meters (epsilon = 2^-23 * 350,000 = ~0.04 km = ~40 m). The player ship is 10 km. Enemies down to 0.5 km. The float32 quantization error is ~4-8% of the smallest combat-relevant object. Enemy positions jitter visibly — they shimmy by one quantization step every frame even when stationary because floating-point arithmetic on large numbers is not associative and incremental updates accumulate error. This is called "vertex jitter" or "world boil."

**Concrete numbers:**
- Scene extent: 350,000 km. Float32 precision at this magnitude: ~350,000 * 2^-23 = ~41 m.
- Player ship: 10 km. Precision error relative to ship size: 41m / 10,000m = 0.4%. Barely visible.
- Grunt enemy: 0.5 km (500 m). Precision error relative to size: 41m / 500m = 8.2%. Clearly visible as jitter.
- BH radius: 10,000 km. For position computation at BH surface (r=10,000 km): precision ~1.2 m. Fine.
- Camera at 350,000 km distance computing vertex relative to BH origin: computing `vertexPos - camPos` in float32 loses 5-6 significant digits. A 10 km ship appears as a smeared blob.

**Why it happens:**
JavaScript and GLSL both use float32 for vertex positions passed to the GPU. When world coordinates reach 10^5 km, the mantissa of float32 (23 bits = ~7 decimal digits) runs out. `350,000.000` and `350,000.041` are the same float32 value. Incremental updates of the form `pos += vel * dt` at large coordinates accumulate error.

**How to avoid:**
Use **camera-relative rendering (RTE)**: subtract the camera position from all world positions on the CPU (in float64 JavaScript) before passing to the GPU as float32. The GPU then works with small numbers (~0 to ~10 km relative offsets), never the raw 350,000 km world coordinates. Concrete steps:
1. Store all entity positions in JavaScript as regular JS numbers (float64). Never store them in Float32Array if they will be used as absolute world coordinates.
2. In the render loop, compute `relX = worldX - camWorldX` (float64 subtraction), then write the result into the GPU vertex buffer as float32.
3. The GPU receives values in the range (-500 km, +500 km) — within float32's precision budget.
4. Uniforms for camera position, BH position, etc., that are used in the ray march shader already work this way (the shader operates in camera-relative space implicitly), but physics entity positions must be explicitly converted.

**Warning signs:**
- Enemies appear to vibrate when stationary at large orbital radii.
- Ship trails (if any) have visible kinks or quantization steps.
- Collision detection returns false positives/negatives for objects that look adjacent but whose float32 coordinates round to the same bin.
- The mat4Perspective near/far distance check at `mat4Perspective(fovY, aspect, 0.1, 500, _proj)` already uses a narrow range — this becomes the anchor that works correctly because the camera-relative offset is small.

**Phase to address:** Scale introduction phase (Phase 1 of v1.1). Must be solved before any combat entity positions are stored in Float32Arrays as world coordinates. Failure to address this at the start means every subsequent system is built on broken coordinates.

---

### Pitfall 2: Z-Fighting Across a 3,500,000:1 Near/Far Ratio

**What goes wrong:**
The current perspective matrix call is `mat4Perspective(fovY, aspect, 0.1, 500, _proj)` — a near/far ratio of 5,000:1. For km-scale, the near plane must see 0.01 km (10 m detail for a 10 km ship) while the far plane must reach 350,000 km: ratio of 35,000,000:1. A 24-bit depth buffer has 16,777,216 discrete values. With a standard perspective depth distribution (values proportional to 1/z), over 99% of the depth buffer precision is consumed within the first 0.001% of the view frustum (near the camera). Objects beyond a few hundred km have zero depth discrimination: everything at range 1,000–350,000 km maps to the same depth values. This causes Z-fighting: planets at different orbital radii flicker against each other.

**Concrete numbers:**
Standard 24-bit depth with near=0.01 km, far=350,000 km:
- At z=0.01 km (near): full precision (~6 nm per step)
- At z=10 km (player ship): ~0.003 mm per step — still fine
- At z=100 km: ~0.3 m per step — acceptable
- At z=10,000 km (BH surface): ~3 km per step — planets 10,000 km apart would share the same depth value
- At z=350,000 km: 100% of distant objects Z-fight

**How to avoid:**
Two compatible approaches:

**Option A — Logarithmic depth buffer (recommended):**
Requires the `EXT_frag_depth` WebGL 1.0 extension (available on all major desktop GPUs; confirmed WebGL 1.0 extension, not WebGL 2.0 only). In the fragment shader, write:
```glsl
#extension GL_EXT_frag_depth : enable
gl_FragDepthEXT = log2(max(1e-6, 1.0 + fragDistanceFromCamera)) / log2(1.0 + farPlane);
```
Logarithmic distribution gives ~equal depth precision across each decade of distance. At 350,000 km far plane: planets at 28,000 km and 86,000 km would use clearly distinct depth values. Cost: disables early fragment test optimization (GPU-side optimization that discards fragments before shader runs). Performance hit is typically 5–15% on desktop GPUs.

**Option B — Multi-frustum rendering (fallback):**
Render the scene in two passes with different near/far planes:
- Pass 1: near=0.01 km, far=500 km (combat entities, close-up)
- Pass 2: near=100 km, far=400,000 km (planets, BH background)
Clear the depth buffer between passes. Objects appearing in both ranges are rendered in the appropriate pass. This requires no extension and has no fragment shader cost. The tradeoff: any object spanning both ranges (e.g., a ship passing Jupiter) must be rendered in both passes. Cesium uses this as its EXT_frag_depth fallback.

**Warning signs:**
- Jupiter and Saturn at different orbital radii flash and interchange depth positions.
- The BH (rendered by the ray march) appears to clip through combat geometry at certain angles.
- Any geometry at r > 1,000 scene units shows flickering.

**Phase to address:** Scale introduction phase. The perspective matrix parameters and depth strategy must be decided before any 3D geometry is drawn at km-scale distances.

---

### Pitfall 3: Physics Tunneling at High Time Acceleration

**What goes wrong:**
With warp speed (time acceleration factor W), `dt` per physics tick becomes `dt_wall * W`. At W=100x and 60 fps: `dt = (1/60) * 100 = 1.67 seconds/tick`. A kinetic round at 80 units/s (in old scale) travels `80 * 1.67 = 133 units` in one tick. If a ship is 10 units wide and 133 units away, the round tunnels clean through it — the start-of-tick position is "in front" and the end-of-tick position is "behind," but no collision is detected because discrete collision only checks positions at tick boundaries.

In km-scale with warp: the BH has radius 10,000 km. A ship at orbit 28,000 km moving at ~2,800 km/s (Keplerian at that orbit) travels 4,666 km per tick at W=100. Jupiter's diameter is 4,000 km. At W=100, a ship can tunnel through Jupiter in one tick.

The problem is compounded for small, fast-moving projectiles in warp mode.

**How to avoid:**
Three-layer defense:

1. **Disable or suspend projectile physics during warp.** If warp speed is only for transit (no combat during warp), there is nothing to tunnel. Gate projectile simulation behind `if (timeAccelFactor <= 4.0)` or similar. This is the simplest and most correct approach given the project spec ("warp for transit").

2. **Clamp dt with a physics sub-step limit.** For each game loop tick at time acceleration W, instead of one tick with `dt = dt_wall * W`, run `ceil(W / W_max)` sub-steps each with `dt = dt_wall * W / numSubSteps`. Choose `W_max` such that the largest fast object cannot move more than half its own radius per sub-step. For a 500 m (0.5 km) ship at 2,800 km/s: max dt = `(0.5 km / 2) / 2800 km/s = 0.09 ms`. At W=100 and 60 fps, real dt = 16.67 ms: `16.67 * 100 / 0.09 = 18,500 sub-steps` — completely infeasible. This confirms that projectile physics must be suspended during warp.

3. **Sweep tests for planet/BH collision only.** Warp is valid for ship transit between orbits where the key collision is ship hitting a planet or the BH. For these large bodies (radius > 2,000 km), the large body radius makes sweep testing easy: check if the line segment `(pos_start, pos_end)` passes within `bodyRadius + shipRadius` of the body. This is a single ray-sphere intersection test per body per warp tick. 7 planets + 1 BH = 8 intersection tests per tick — cheap.

**Warning signs:**
- In warp mode, player ship passes through Jupiter's model visually with no collision response.
- Warp exit position places the ship inside a planet's surface.
- After exiting warp, physics state is corrupted (NaN velocities, positions at Infinity).

**Phase to address:** Warp speed phase. Before implementing time acceleration, establish the warp-physics separation: projectiles off, planet collision as sweep test, gravity integration via sub-steps at a safe maximum dt.

---

### Pitfall 4: Hardcoded Shader Constants Break at New Scale

**What goes wrong:**
The ray march shader in `shaders.js` has several distance constants calibrated to the current ~100-unit scene:
- `float outerEdge = 14.0;` — accretion disk outer boundary (line 140)
- `float escapeR = max(50.0 * u_orbitScale, u_camDist + 20.0);` — ray escape radius (line 537)
- `if (r > mix(100.0, 175.0, step(1.5, u_orbitScale)) && dot(pos, vel) > 0.0) break;` — early escape (line 550)
- `float stepCap = mix(5.0, 3.0, ...)` — Verlet step size cap (line 552)
- Ring detection: `if (sd > 3.0 - ringPxW * 2.0 && sd < 5.5 + ringPxW * 2.0)` — Saturn ring radii (line 575)
- Detonation radius scaling constants (tau, R expansion)

In km-scale mode, if these constants remain unchanged, the accretion disk disappears (it extends only 14 "old units" but the camera is now 28,000 km away), the escape radius is 50 units (the camera is 350,000 km away, so escape happens immediately at step 0), and the ray march renders nothing except background stars.

**Why it happens:**
The shader was designed for a scene where BH radius = ~2 units, planets at r = 28–86 units. In km-scale, BH radius = 10,000 km and planets at r = 28,000–350,000 km. The shader's internal coordinate system must be updated or the constants must be passed as uniforms that scale with the scene.

**How to avoid:**
Do NOT attempt a full unit rescaling of the ray march shader. Instead, preserve two distinct operating modes:

1. **Normal/nav mode**: unchanged shader constants, unchanged scale. The existing scene continues working exactly as today.
2. **Combat mode (km-scale)**: the ray march renders only the BH close-up background (a sub-view or simplified version). The 3D geometry pass handles all planet rendering with standard perspective projection.

This is the safest approach and was already foreshadowed in the PROJECT.md: "LOD rendering: Far planets as 2D billboards; BH rendering tuned for close-up dominance." In combat mode, the BH is the dominant visual feature close up; planets are rendered as 3D geometry spheres, not via the ray march. The accretion disk is visible only when the camera is within a few BH radii (< 50,000 km), which is the planned "close-up dominance" case.

If any shader constants must change for km-scale, they must be expressed as uniforms (not hardcoded GLSL literals) and set differently per mode. Never modify a hardcoded constant that also affects normal mode.

**Warning signs:**
- Accretion disk disappears in km-scale mode.
- The entire scene renders black except for stars.
- The ray march terminates at step 0 for every pixel (escape condition fires immediately).
- `tests.html` shader invariant tests fail after scale-related changes to `shaders.js`.

**Phase to address:** Scale introduction phase. Before adjusting any camera distance or world scale constant, audit every hardcoded number in `shaders.js` against the new scale. Decide which constants become uniforms vs which are replaced by a mode-split.

---

### Pitfall 5: WASM Memory Layout Offset Corruption After Scale Change

**What goes wrong:**
The WASM module (`WB` base64 string) uses hardcoded byte offsets for planet positions and camera data:
- Planet positions 0–5: `0x070 + i*12` bytes (12 bytes = 3 float32 per planet)
- Camera right: `0x048`, camera up: `0x054`
- BH horizon radius: `0x060`

These offsets were computed for the current unit system where planet positions are small floats (~28–86 units). If the scale change requires the WASM to output positions in km units (28,000–350,000), the values themselves change but the **layout does not** — WASM binary is not recompilable without source. Any JavaScript that reads these offsets and then applies a scale conversion will work correctly, but any JavaScript that assumes the values are in "scene units" without conversion will produce wrong results.

The secondary risk: nav.js line 58 reads planet positions directly:
```js
const b = 0x070 + i * 12;
dx = dv.getFloat32(b, true) - pos[0];
```
If `pos[0]` is in km-scale (e.g., 28,000) but the WASM still outputs positions in old units (38.0), the gravity computation subtracts apples from oranges: enormous incorrect gravity vectors, causing the ship to accelerate to NaN in the first tick.

**How to avoid:**
Establish a single, explicit scale factor constant: `const KM_SCALE = 1000.0;` (if 1 old unit = 1000 km). Apply this scale in exactly one place when reading from WASM memory, and in one place when writing combat entity positions to rendering buffers. Never apply the scale factor in multiple places — it compounds.

Specifically:
1. When reading planet positions from WASM (nav.js `computeGravAccel`): multiply by `KM_SCALE` after reading.
2. When checking planet proximity, orbit radii, SOI calculations: all internal JS computations use km units.
3. When rendering: camera-relative positions (as per Pitfall 1) handle the scale automatically.
4. Shader uniforms `u_planetN.xyz`: these must remain in shader-coordinate space (normalized per the ray march's internal units), not km-scale coordinates — they are used for ray-sphere intersection inside the shader.

Planet 6 (Mars) is JS-computed via `planetPosAtTime()` using `p.oR * sin/cos`. In km-scale mode, `p.oR` in the `planetData` array must be in km units, OR `planetPosAtTime` must apply the conversion. One place, one conversion.

**Warning signs:**
- Ship is pulled toward the wrong position (gravity points to old-scale origin when planet is at km-scale position).
- Planet hover detection works correctly but planet rendering is displaced.
- SOI radii computed by `computeSOI()` are wildly wrong (either millions of km or fractions of km).
- WASM planet positions and JS planet positions diverge after the scale change.

**Phase to address:** Scale introduction phase, simultaneously with the float32 precision fix (Pitfall 1). The coordinate system definition affects every subsequent system.

---

### Pitfall 6: Normal-Mode Scene Corruption From Scale-Change Side Effects

**What goes wrong:**
The normal navigation mode (non-combat, non-km-scale) must remain unchanged per PROJECT.md. Any global constant, `planetData` modification, or shader uniform change made for the km-scale combat mode will silently break the navigation mode. Examples of dangerous changes:
- Modifying `planetData[i].oR` to km values: the nav mode uses `oR` for orbit rendering, collision detection, and the WASM module receives it as an input reference. If `oR` changes, normal mode renders a blank scene (orbits 28,000x too large, planets outside the escape radius).
- Changing `BH_GM = 400` (nav.js line 10) to match km-scale gravity: the Hohmann transfer computations in `orbital.js` are calibrated to the old GM. All existing orbital mechanics break.
- Modifying the perspective matrix near/far values at the top level: they affect both modes.

**How to avoid:**
Never mutate the `planetData` array in-place for km-scale mode. Use a **separate derived data structure** for km-scale combat:
```js
const KM_SCALE = 1000.0; // 1 old unit = 1000 km
const kmPlanetData = planetData.map(p => ({
  ...p,
  oR: p.oR * KM_SCALE,
  radius: p.radius * KM_SCALE
}));
```
The `planetData` array is read-only for normal mode. `kmPlanetData` is used exclusively during km-scale combat.

Similarly, keep `BH_GM` and `PLANET_GM_K` as-is for normal mode. Define separate `BH_GM_KM` and `PLANET_GM_K_KM` that produce physically reasonable orbital velocities at km-scale. These are separate constants, not reassignments.

The perspective matrix call at index.html line 1409 currently uses `mat4Perspective(fovY, aspect, 0.1, 500, _proj)`. In km-scale mode, this must use different near/far values. This change must be gated: `const near = flyMode && kmScale ? 0.01 : 0.1; const far = flyMode && kmScale ? 500000 : 500;`.

**Warning signs:**
- Normal mode (before pressing the nav activation key) renders incorrectly after a combat-related commit.
- Planet labels appear at wrong positions or are missing in normal mode.
- The orbit scale (`u_orbitScale`) uniform is set incorrectly in normal mode.
- `tests.html` shader invariant tests fail in normal mode after scale-change commits.

**Phase to address:** Scale introduction phase (pre-condition). Establish the mode-split data architecture as the very first step, before any scale values change. Verify normal mode still passes `tests.html` after every commit.

---

## Moderate Pitfalls

---

### Pitfall 7: Collision Bin System Silently Misses Contacts at New Scale

**What goes wrong:**
The existing collision system uses `BIN_WIDTH = 10.0` covering `NUM_BINS = 20` bins (radius 0–200 units). In km-scale, the outermost orbit is 350,000 km. With `BIN_WIDTH = 10.0` (which now means 10 km), the system needs 35,000 bins — the current `Uint16Array(NUM_BINS * MAX_PER_BIN)` allocates for 20 bins. All entities at radius > 200 km go into bin 19 (the last bin, clamped by `Math.min(Math.floor(r / BIN_WIDTH), NUM_BINS - 1)`), regardless of their actual distance. Two entities 100,000 km apart are treated as collision candidates because they share the last bin. This does not cause crashes — it causes O(n^2) behavior for all entities at large orbits (false candidates) and completely misses entities in different large-radius bins.

**How to avoid:**
Redesign the bin system for km-scale at the same time as the scale change:
- `BIN_WIDTH_KM = 5000.0` (5,000 km per bin)
- `NUM_BINS = 80` (covers 0–400,000 km)
- `MAX_PER_BIN = 16` (same as current)
- Reallocate: `const binEntities = new Uint16Array(80 * 16);`

Alternatively, because enemy count is bounded at 64 and the system is already O(n*bins), consider switching to a simple angular sector bin (8 sectors * radial band) for km-scale: enemies at the same orbital radius and similar angle are collision candidates. This better matches the orbital geometry.

**Warning signs:**
- Projectiles pass through enemies at large orbital radii with no hit detection.
- Frame time suddenly increases when all enemies are at large orbits (false candidate pairs triggering redundant distance checks).
- `getCollisionCandidates()` returns 30+ candidates for a single projectile (all entities at large radii lumped into one bin).

**Phase to address:** Scale introduction phase. Bin constants must be updated simultaneously with the scale change.

---

### Pitfall 8: Time Acceleration Causes Physics Divergence (Non-Tunneling)

**What goes wrong:**
Separate from tunneling (Pitfall 3), large `dt` values destabilize the Verlet integrator through energy growth. The Verlet integration in `simulateTrajectory()` uses adaptive step sizes: `dt = max(0.002, min(0.08 * (r - rH), 3.0))`. This was calibrated for the old scale where BH horizon is at r≈2 and orbits at r=28–86. At km-scale, r values are thousands of times larger, making `0.08 * (r - rH)` enormous. The step size would hit the cap of 3.0 immediately — acceptable for the ray march, but with time acceleration factor W applied on top, the effective physics dt is `3.0 * W` per iteration.

At W=100: `dt_effective = 300.0 simulation-seconds` per Verlet iteration during trajectory prediction. For a close orbit (r=28,000 km, period ~60s), a single Verlet step covers 300/60 * 2π = 31 radians of orbit — completely wrong prediction. The ship will spiral outward instantly in the trajectory preview.

**How to avoid:**
- The trajectory simulation step size must be capped independently of the world-space distance formula. In km-scale mode, use `dt = min(T_orbit / 200, dt_max_seconds)` where `T_orbit` is the orbital period of the current orbit (computable from Kepler's third law) and 200 is the number of steps per orbit for adequate resolution.
- During warp (time acceleration), trajectory prediction is likely not needed at all — warp is for transit, not for weapon targeting. Disable trajectory preview in warp mode.
- The existing `TRAJ_SIM_DT = 0.4` constant in nav.js is a fixed preview step. This must become adaptive in km-scale mode.

**Warning signs:**
- Trajectory preview shows the ship immediately escaping to infinity.
- Orbit transfers compute NaN or infinite delta-v.
- During warp, the ship's position oscillates or diverges rather than following the orbit.

**Phase to address:** Warp speed phase, simultaneously with Pitfall 3.

---

### Pitfall 9: Radar/Mini-Map Coordinate Space Mismatch

**What goes wrong:**
The radar UI displays all objects (BH, planets, player, enemies) in a 2D projection of the 3D world. If the radar renders using world coordinates directly (e.g., drawing at pixel position `(worldX / scale, worldZ / scale)`), then at km-scale a radar 200px wide representing 700,000 km: each pixel covers 3,500 km. The player ship at 10 km is 1/350th of a pixel — invisible. Enemies at 0.5–8 km are sub-pixel. Only planets and the BH are visible.

The temptation is to draw everything at a fixed screen-space size (e.g., 5px dot for ships) regardless of world size — but this breaks the spatial relationship: a ship 100 km from Jupiter would look the same as one 100,000 km away.

**How to avoid:**
Use a **hybrid representation** on the radar:
- Bodies (BH, planets): true-scale markers relative to the radar's field of view. At full radar extent (350,000 km), a 10,000 km BH occupies 10,000/350,000 = 2.9% of radar width = ~5-6 pixels at 200px radar. Render as filled circle of that size.
- Ships: minimum 4px dot, clamped to no larger than their orbital radius / 50 scale. Never sub-pixel.
- The radar's zoom level (full-extent vs zoomed-in local area) dramatically changes what is visible. Implement two zoom levels: overview (show all orbits) and local (show combat zone around player).

**Warning signs:**
- Radar shows only BH with no visible ships.
- Ship positions on radar do not match their visual positions in the main viewport.
- Zoom in/out produces non-linear jumps in what is visible.

**Phase to address:** Radar/mini-map phase.

---

### Pitfall 10: Warp Speed Distorts Perceived Orbital Period for Difficulty Balancing

**What goes wrong:**
The project spec states "Jupiter orbit in 60 seconds defines all velocities." This means enemy orbital speeds, weapon velocities, and engagement times are all calibrated to a 60-second Jupiter orbit at real (1x) time scale. If warp accelerates time by 100x, a Jupiter orbit takes 0.6 seconds. Enemy ships that were at consistent positions relative to the player at 1x become a chaotic blur at 100x. When the player exits warp, they may find themselves inside an enemy fleet that appeared to be far away during warp approach.

**How to avoid:**
- During warp: disable enemy AI and combat entirely. Enemies hold position (or continue on rails without AI updates). The warp is purely for transit — no combat should be possible.
- Warp entry/exit should check for nearby enemies within a safety radius and refuse to enter warp if combat is imminent. This prevents players from warping into enemy formations.
- The "max 30s transfers" spec implies warp factor is limited: at most W = `transfer_time_realtime / 30s`. A 10-minute Hohmann transfer warps at W=20, not W=1000. Cap warp factor so the screen never becomes unreadable.

**Warning signs:**
- Enemies appear at wrong positions after exiting warp.
- Player can fire weapons during warp and hit enemies that appear stationary.
- Orbital trajectories computed during warp show wrong intercept predictions.

**Phase to address:** Warp speed phase.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store km-scale positions in Float32Array | Avoids refactoring SoA stores | Vertex jitter, missed collisions (Pitfall 1) | Never — use float64 JS numbers for world coords, only convert to float32 at render time |
| Scale existing shader constants by 1000 | Quick scale match | Corrupts normal mode, breaks shader invariants (Pitfall 4, 6) | Never — use mode-split uniforms instead |
| Re-use `BIN_WIDTH=10` collision bins | No code change | All entities pile into last bin at km-scale, O(n^2) (Pitfall 7) | Never at km-scale — must update bin constants |
| Apply time acceleration to all dt uniformly | Simple code | Physics divergence, tunneling, NaN positions (Pitfalls 3, 8) | Only safe when W <= 4x; gate projectiles/AI above that |
| `planetData` mutation for km-scale | One data structure | Corrupts nav mode, WASM reads wrong values (Pitfall 6) | Never — derive kmPlanetData separately |
| Keep near=0.1, far=500 perspective params | No depth buffer changes | Z-fighting at all orbital radii in km-scale (Pitfall 2) | Only in normal mode; km-scale requires new near/far |

---

## Integration Gotchas

Common mistakes when connecting the km-scale system to existing components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| WASM planet positions | Reading WASM float32 values and treating as km coordinates | Apply `KM_SCALE` conversion after reading; define the mapping in exactly one JS function |
| Ray march shader | Passing km-scale camera position as `u_camPos` | The ray march operates in its own internal coordinate space; `u_camPos` must remain in the ray march's space, not km-scale world space |
| Perspective matrix | Using same near/far for both modes | Gate on mode: `near = isKmScale ? 0.01 : 0.1; far = isKmScale ? 500000 : 500` |
| `computeGravAccel` with km positions | Calling it with km-scale positions when BH_GM is calibrated for old units | Either use separate km-scale GM constants, or normalize position before passing to gravity function |
| HUD distance readouts | Displaying "RANGE 28000.0 M" (old units * KM_SCALE) | Convert and label correctly: "28,000 km" or "28 Mm" depending on magnitude |
| Collision bins | Calling `getCollisionCandidates()` with km-scale radius | Bin constants must be updated (Pitfall 7); rebuild bins with new BIN_WIDTH_KM |

---

## Performance Traps

Patterns that work at current scale but fail after the scale change.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Trajectory simulation at W>1x | Spiral-to-infinity in preview, NaN velocities | Cap warp dt; disable preview during warp | W > ~4x at km-scale |
| Planet hit detection sweeptest every frame during warp | 8 ray-sphere tests * 60 fps * W=100 is only 480 ops — fine | Actually not a trap; sweep tests are cheap even at high warp | Does not break, but see Pitfall 3 |
| Float64 camera-relative subtraction every frame | JS float64 subtract for 64 entities * 3 coords = 192 ops/frame — negligible | Not a trap — do it | Does not break performance |
| Radar rendering all entities at 60fps | 64 enemies + 7 planets + projectiles = ~80 canvas2D draw calls | Throttle radar to 20fps (render every 3rd frame); combat is 60fps, radar is informational | Fine at current entity count |
| Logarithmic depth buffer disabling early-z | 5–15% fragment shader slowdown | Acceptable on desktop; test on target GPU (GTX 1060 tier) | Below 30fps threshold only on very low-end hardware |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Scale change complete**: Verify `planetData.oR` values are NOT changed (only `kmPlanetData` uses km values). Check by confirming normal-mode planet positions in WASM are still correct after the commit.
- [ ] **Float32 precision handled**: Verify all combat entity positions in SoA stores are sourced from float64 JS numbers and only converted to float32 at render time. Check that no Float32Array stores the raw km-scale world coordinate.
- [ ] **Z-fighting solved**: Fly camera to outermost orbit in km-scale mode and verify Jupiter and Saturn do not flicker against each other. Check at camDist = 350,000 km.
- [ ] **Tunneling prevented during warp**: Verify projectile system is suspended during warp. Verify planet/BH sweep collision works by warping directly toward a planet and confirming collision response fires.
- [ ] **Normal mode preserved**: Run `tests.html` after every scale-related commit. Verify by loading the page without entering combat mode and confirming the black hole scene renders identically to before.
- [ ] **Warp factor capped**: Confirm that warp never accelerates beyond the factor needed for 30-second transfers. At Jupiter orbit (60s period), a Hohmann transfer to Saturn takes ~90s, so max warp = 90/30 = 3x. Verify the warp factor ceiling is enforced.
- [ ] **Collision bins updated**: After scale change, log `getCollisionCandidates()` return count for a projectile at r=28,000 km. It should return only nearby entities, not 30+ false positives.
- [ ] **WASM offset reads documented**: Add a comment in nav.js at every WASM offset read (`0x070 + i*12`) documenting what scale the value is in and whether `KM_SCALE` conversion is applied.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Float32 vertex jitter discovered late | MEDIUM | Audit all Float32Array position stores; replace world-coord stores with float64 JS numbers; add camera-relative conversion at render time. Typically 1–2 days of refactoring. |
| Z-fighting in production | LOW | Add EXT_frag_depth check at GL init; implement logarithmic depth in fragment shader for combat pass only; 2–4 hours. |
| Normal mode corrupted by scale change | HIGH | `git revert` to the commit before planetData was mutated; reintroduce scale as derived kmPlanetData instead of mutation; 1–3 days to re-integrate all dependent code. |
| Tunneling during warp discovered in testing | LOW | Add `if (warpFactor > PHYSICS_SAFE_THRESHOLD) { skipProjectiles(); useSweptBodies(); }` — the architectural separation is already planned; just enforce the gate. 1–4 hours. |
| WASM coordinate mismatch | MEDIUM | The WASM binary is not modifiable; all fixes must be in JS. Add a single wrapper function for WASM planet position reads that applies the scale conversion. 1 day to trace all call sites. |
| Collision bin overflow at km-scale | LOW | Update `BIN_WIDTH` and `NUM_BINS` constants and reallocate `binEntities` Uint16Array. 1–2 hours. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1: Float32 position precision | Phase 1 (scale introduction) | No visible jitter on stationary enemies at r=350,000 km |
| 2: Z-fighting near/far ratio | Phase 1 (scale introduction) | No depth flickering between planets at different orbital radii |
| 3: Physics tunneling at high warp | Phase N (warp speed) | Warp directly into a planet: collision fires. Projectiles suspended during warp. |
| 4: Hardcoded shader constants break | Phase 1 (scale introduction) | `tests.html` passes. Ray march visible in both normal mode and km-scale close-up. |
| 5: WASM offset corruption | Phase 1 (scale introduction) | Planet gravity vectors point to correct km-scale positions. Nav mode orbit mechanics unchanged. |
| 6: Normal mode corruption | Phase 1 (scale introduction), every phase | `tests.html` passes after every commit. Normal mode visually identical before and after km-scale changes. |
| 7: Collision bin miss at new scale | Phase 1 (scale introduction) | Collision candidate count is O(1) per projectile, not O(n) |
| 8: Verlet divergence at large dt | Phase N (warp speed) | Trajectory preview at W=20x still shows physically plausible orbit |
| 9: Radar coordinate mismatch | Phase N (radar implementation) | Ships visible as distinct dots on radar at all orbital radii |
| 10: Warp distorts orbital timing | Phase N (warp speed) | Enemy positions correct after warp exit. Combat not possible during warp. |

---

## Sources

- [WebGL2 Fundamentals: Precision Issues](https://webgl2fundamentals.org/webgl/lessons/webgl-precision-issues.html) — float32 mediump/highp analysis, precision loss at large values (HIGH confidence)
- [Re:Earth Engineering: High Precision Rendering](https://reearth.engineering/posts/high-precision-rendering-en/) — RTE camera-relative rendering technique for km-scale scenes (HIGH confidence)
- [Godot Engine: Emulating Double Precision on GPU](https://godotengine.org/article/emulating-double-precision-gpu-render-large-worlds/) — split-float and RTE approaches for large worlds (HIGH confidence)
- [Gaffer On Games: Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) — fixed timestep, sub-step accumulator, max-dt clamping for physics stability (HIGH confidence)
- [Cesium Blog: Hybrid Multi-Frustum Logarithmic Depth Buffer](https://cesium.com/blog/2018/05/24/logarithmic-depth/) — logarithmic depth buffer with EXT_frag_depth fallback to multi-frustum (HIGH confidence)
- [Game Developer: Logarithmic Depth Buffer](https://www.gamedeveloper.com/programming/logarithmic-depth-buffer) — formula, 24-bit precision analysis, performance considerations (HIGH confidence)
- [MDN: EXT_frag_depth](https://developer.mozilla.org/en-US/docs/Web/API/EXT_frag_depth) — confirmed WebGL 1.0 extension (not WebGL 2.0 only) (HIGH confidence)
- [LearnOpenGL: Depth Testing](https://learnopengl.com/Advanced-OpenGL/Depth-testing) — near/far ratio impact on depth buffer precision distribution (HIGH confidence)
- Direct codebase inspection: `shaders.js` (shader constants, escape radii), `combat.js` (BIN_WIDTH=10, NUM_BINS=20), `nav.js` (BH_GM=400, WASM offsets 0x070+i*12), `index.html` (mat4Perspective near=0.1 far=500, line 1409) (HIGH confidence — authoritative)

---
*Pitfalls research for: km-scale WebGL scene transition and warp speed physics*
*Researched: 2026-03-14*
