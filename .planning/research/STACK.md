# Technology Stack

**Project:** Navigation Combat System — v1.1 Realistic Scale
**Researched:** 2026-03-14
**Confidence:** HIGH

---

## Context

This document covers **only what is NEW for v1.1**. The existing v1.0 stack (WebGL 1.0, ANGLE_instanced_arrays, OES_vertex_array_object, SoA typed arrays, radial bin collision, instanced enemy rendering, billboard explosion system) is already validated and documented in the prior STACK.md. This version focuses exclusively on:

1. Float32 precision management at km-scale coordinates (350,000+ km scene)
2. LOD rendering at 40,000:1 scale ratios in WebGL 1.0
3. Radar/minimap rendering (2D canvas overlay vs WebGL render-to-texture)
4. Warp speed (time acceleration) implementation patterns

---

## 1. Float32 Precision at Km Scale

### The Problem: Where Float32 Breaks

IEEE 754 single-precision float32 has 24 bits of mantissa (23 explicit + 1 implicit). This gives ~7 significant decimal digits of precision across the entire representable range.

**Precision at specific coordinate magnitudes:**

| Coordinate value | Precision per unit | Effect at 1 km/s velocity |
|-----------------|-------------------|--------------------------|
| 1,000 km | ~0.06 m | Barely visible jitter |
| 10,000 km | ~0.6 m | Visible vertex shimmer |
| 100,000 km | ~6 m | Severe geometry boiling on large objects |
| 350,000 km | ~20 m | Enemy ship (500 m) rendered with 4% quantization error |

**The formula:** At coordinate value `V`, the precision `P` (smallest representable difference) is approximately:
```
P = V * 2^(-23) ≈ V / 8,388,608
```

For V = 350,000 km:
```
P = 350,000 / 8,388,608 ≈ 0.0417 km = 41.7 m
```

A 500 m enemy ship at 350,000 km from world origin is represented with ~8% positional error per vertex. At 10 km (player ship) the error is 4x worse relative to ship size. **Geometry will visibly "boil" (vertices jittering between quantization steps as the ship orbits).**

**The 7-digit rule:** If world coordinates use 6-digit values (e.g., 350,000), only 1 digit of fractional precision remains. A 500 m object = 0.5 units at km scale = the fractional digit. This is right at the limit.

**Confidence: HIGH** — Derived directly from IEEE 754 specification (23-bit mantissa). The formula is exact. The 350,000 km scenario pushes hard against float32 limits.

---

### Solution 1: Camera-Relative Rendering (Recommended)

**What it is:** Never send world-space coordinates to the GPU. Instead, subtract the camera position from every entity position on the CPU, then upload camera-relative coordinates to the vertex buffer.

**Why it works:** Camera-relative coordinates are differences between two similar large values, which cancels the high-order bits. If the camera is at (250,000, 0, 0) and an enemy is at (250,001, 0, 0), the world-space coordinates require 6-digit precision. The camera-relative coordinate is (1, 0, 0) — requiring only 1 digit of precision. The mantissa is used for the actual geometry detail, not wasted on encoding the orbit position.

**Implementation (JS side):**
```javascript
// Each frame, before uploading instance data
const camX = cameraPos[0], camY = cameraPos[1], camZ = cameraPos[2];

for (let i = 0; i < activeEnemies; i++) {
  // Convert world-space km coords to camera-relative km coords
  // These are now small numbers (< ship separation distance, ~1000 km max)
  instanceData[i * STRIDE + 0] = enemyPool.x[i] - camX;
  instanceData[i * STRIDE + 1] = enemyPool.y[i] - camY;
  instanceData[i * STRIDE + 2] = enemyPool.z[i] - camZ;
}
```

**Precision result after applying CRR:**
At any camera-entity separation distance, the relative coordinate is at most ~1,000 km (enemies separated by more are in a different LOD tier anyway). At 1,000 km relative: precision = 1,000 / 8,388,608 ≈ 0.0001 km = 0.1 m. A 500 m enemy ship is represented with 0.02% error. Invisible at any frame rate.

**Vertex shader (no change needed):** The shader receives `a_instancePos` as camera-relative km, so `gl_Position = projMatrix * vec4(a_instancePos, 1.0)`. No world-space values ever enter the GPU.

**View matrix:** Constructed as if camera is at world origin. The model matrix uses camera-relative position. This is the standard Relative-to-Eye (RTE) pattern.

**CPU cost:** One subtraction per float3 per entity per frame. Negligible.

**Confidence: HIGH** — This is the standard solution for large-world WebGL rendering. Referenced by: Godot Engine LWC docs, Flax Engine large worlds, Deck.GL coordinate system, and the gltut tutorial "Perils of World Space." Multiple independent authoritative sources confirm this exact technique.

---

### Solution 2: Double-Single Precision Emulation (NOT Recommended for This Project)

**What it is:** Split each world coordinate into two float32 values (high-bits float + low-bits remainder) and do arithmetic in the shader to recover full precision.

**Why not here:** Requires rewriting all vertex shaders with DSP arithmetic (4-6 extra MAD operations per coordinate per vertex). The existing shader architecture uploads one `mat4` per instance — DSP would require uploading two `vec3` values per instance and modifying all instance attribute layouts. The complexity cost is disproportionate to the benefit when camera-relative rendering achieves the same result for zero shader complexity.

**Confidence: HIGH** — DSP is the alternative when you cannot use camera-relative (e.g., when two objects far from each other must interact in the same shader). That case does not apply here.

---

### What NOT to Do: Naive World-Space Coordinates

**The failure mode:** Store all entity positions in km from world origin (BH center), upload those coordinates directly to GPU via `bufferSubData`, and let the vertex shader handle them as `a_instancePos`.

**Why it breaks:** At 350,000 km, float32 provides ~40 m precision per vertex. A 500 m enemy ship has ~8% vertex error. As the ship orbits, each vertex quantizes to different integer-multiples of 40 m, causing the geometry to visibly "boil" (vertices randomly jumping by 40 m steps each frame). The effect is most severe at high orbital radii and at high zoom (because the camera is close to the ship, making the 40 m jitter occupy many screen pixels).

**No workaround at the shader level:** You cannot fix float32 vertex precision with `highp` in WebGL 1.0 vertex shaders — `highp` is not guaranteed in vertex shaders on WebGL 1.0 and even when available only expands the exponent range, not the mantissa precision.

**Confidence: HIGH** — Derived from IEEE 754 specification and confirmed by multiple sources including WebGL Fundamentals, Godot LWC docs, and Deck.GL engineering blog.

---

## 2. LOD Rendering at 40,000:1 Scale

### The Scale Ratio Problem

The v1.1 scene spans: BH radius 20,000 km, Jupiter radius 4,000 km, player ship 10 km, enemy ships 0.5-2 km. The orbital radii are 50,000-350,000 km. A planet and a nearby enemy ship can differ in visual size by 40,000:1. A single LOD system must handle both gracefully.

### Recommended: Three-Tier LOD with Explicit Instance Pools

The v1.0 STACK.md already defined three LOD tiers for enemies. In v1.1, the tier thresholds must be expressed in km, not abstract units. The visual rationale changes: it is no longer about polygon detail, it is about whether the object is large enough to resolve as geometry at all.

**LOD thresholds for km-scale:**

| Tier | Camera-relative distance | Rendering | Rationale |
|------|--------------------------|-----------|-----------|
| Full 3D | < 5,000 km | Instanced geometry with normals/lighting | At 5,000 km, a 500 m ship subtends ~0.006 degrees — still resolvable as a distinct shape |
| Billboard | 5,000–100,000 km | Instanced textured quad facing camera | At 100,000 km, a 500 m ship is 1-2 pixels — billboard captures icon-level appearance |
| Omit from 3D | > 100,000 km | Not rendered in main viewport (but shown on radar) | Below pixel threshold; skip draw call |

**Planet-specific LOD:** Planets (4,000 km diameter) and the BH (20,000 km) are not rendered as instanced geometry — they are rendered by the ray march shader. No new LOD logic needed for them. Their apparent angular size is handled entirely by the existing shader.

**LOD computation is CPU-side JS only (WebGL 1.0 has no geometry shaders, no mesh shaders):**
```javascript
function assignLOD(camRelDist) {
  // Hysteresis bands to prevent oscillation at tier boundaries
  if (camRelDist < 4500) return LOD_FULL;       // Enter full at 4500, exit at 5500
  if (camRelDist < 5500) return prevLOD;         // Hysteresis zone: keep previous tier
  if (camRelDist < 90000) return LOD_BILLBOARD;  // Enter billboard at 5500, exit at 110000
  if (camRelDist < 110000) return prevLOD;       // Hysteresis zone
  return LOD_SKIP;
}
```

**Why hysteresis:** Without hysteresis, an enemy at exactly the tier boundary oscillates between LOD_FULL and LOD_BILLBOARD every frame as minor camera or entity movement crosses the threshold. This creates visible popping. 20% hysteresis bands are standard game industry practice.

**Separate instance buffers per LOD tier:** Maintain two instance Float32Arrays — one for FULL geometry instances, one for BILLBOARD instances. Each frame: sort enemies into tiers, upload only their buffer, draw with separate instanced draw call per tier. This matches the existing v1.0 architecture directly.

**Confidence: HIGH** — LOD tier architecture was established in v1.0 STACK.md. The threshold values are new (km-scale) but the pattern is identical. Hysteresis is standard and well-documented.

---

### Warp-Speed LOD Adjustment

During warp (time acceleration at 30-1000x), the camera position does not teleport — the scene simply advances faster. LOD distances remain the same. However, at high warp the player ship may traverse 50,000 km in a single rendered frame, which means entity LOD assignments can jump multiple tiers in one frame (full geometry one frame, skip the next). This is acceptable — at high warp, visual pop is less jarring because time is visibly compressed.

**No special handling needed for LOD during warp.** The existing per-frame LOD assignment handles it correctly.

---

## 3. Radar / Minimap Rendering

### Recommendation: Separate 2D Canvas Overlay (Not WebGL Render-to-Texture)

**Decision:** Use a dedicated `<canvas id="radar-canvas">` element positioned absolutely over the main WebGL canvas via CSS, rendered using the Canvas 2D API. Do NOT use WebGL render-to-texture (RTT) framebuffer for the radar.

**Why NOT WebGL render-to-texture:**
- Requires `WEBGL_depth_texture` or manual framebuffer management for the minimap render pass
- Requires a second camera (orthographic, looking down the Y axis) with its own projection matrix
- Requires all entity positions to be rendered a second time into the FBO
- The main scene shader cannot be reused for a top-down orbital view
- Total added complexity: ~300 LOC of framebuffer setup + second render pass + texture blit
- The radar displays abstract icons (dots, rings, brackets), not a 3D view — all content is inherently 2D

**Why Canvas 2D overlay is correct:**
- Radar content is 2D: orbital rings as `arc()`, entity dots as `fillRect()`, player heading as `lineTo()`
- Canvas 2D API has no shader complexity, no GL state pollution
- Completely independent from the WebGL render loop — can be updated at a different rate (e.g., 15 fps for radar vs 30 fps for 3D)
- Already the established pattern in this codebase: planet labels are HTML elements positioned by JS over the WebGL canvas; extending that pattern to a Canvas 2D radar is natural
- Performance: A radar drawing ~20 circles + ~50 dots per frame costs <0.5ms in Canvas 2D. The crossover point where WebGL becomes faster is ~10,000 primitives (semisignal.com benchmark), far above what a minimap needs

**HTML/CSS Integration Pattern:**
```html
<!-- In index.html, sibling to #canvas -->
<canvas id="radar-canvas"></canvas>
```

```css
/* In css/style.css */
#canvas {
  position: absolute;
  z-index: 1;
}
#radar-canvas {
  position: absolute;
  bottom: 20px;
  left: 20px;
  width: 200px;
  height: 200px;
  z-index: 30;  /* Above planet labels (z-index 25) */
  pointer-events: none;  /* Click-through to WebGL canvas */
  border: 1px solid rgba(60,140,255,0.4);
  background: rgba(0,5,15,0.7);
}
#radar-canvas.expanded {
  width: 400px;
  height: 400px;
  /* O-key toggle: compact mini vs expanded side panel */
}
```

**Radar JS Update Function:**
```javascript
function updateRadar(simTime) {
  const ctx = radarCtx;
  const W = radarCanvas.width, H = radarCanvas.height;
  const cx = W / 2, cy = H / 2;

  ctx.clearRect(0, 0, W, H);

  // Draw orbital rings (proportional to actual km radii)
  const scale = (W * 0.45) / MAX_ORBIT_KM;  // fit outermost orbit in canvas
  for (const planet of planetData) {
    const r = planet.oR * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(60,140,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Draw BH at center
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,200,80,0.8)';
  ctx.fill();

  // Draw player ship
  const px = playerX * scale + cx;
  const py = -playerZ * scale + cy;  // flip Z: +Z = down in world, up in radar
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(60,200,255,1.0)';
  ctx.fill();

  // Draw enemies (color by archetype)
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemyPool.active[i]) continue;
    const ex = enemyPool.x[i] * scale + cx;
    const ey = -enemyPool.z[i] * scale + cy;
    ctx.fillStyle = ENEMY_COLORS[enemyPool.type[i]];
    ctx.fillRect(ex - 2, ey - 2, 4, 4);
  }
}
```

**Important: pointer-events: none on the radar canvas.** Mouse events for the game (drag to orbit, click for targeting) go to the WebGL canvas. If the radar canvas intercepts pointer events, dragging over it will stop working. Set `pointer-events: none` so all events fall through to the WebGL canvas below.

**Mouse event routing exception:** If the O-key expanded radar needs clickable elements (e.g., click a planet to set as navigation target), temporarily enable pointer events only on the expanded radar and handle them explicitly. In minimized state: always pointer-events none.

**Update rate:** The radar does not need to update every WebGL frame. Update every 2-4 rendered frames. Skip radar update if `simDt` is very small (bullet time). During high warp, the update rate matters more — consider updating every frame during warp so the player can see orbital progress.

**Confidence: HIGH** — The 2D canvas overlay pattern is confirmed by learnwebgl.brown37.net, the codebase's own established overlay pattern (HTML labels over WebGL), and fundamental WebGL constraints (a canvas element cannot have both a webgl and a 2d context). The performance trade-off analysis is backed by semisignal.com Canvas vs WebGL benchmarks.

---

## 4. Warp Speed (Time Acceleration) Implementation

### Recommendation: Scaled Accumulator with Physics Substepping

**What warp must achieve:** Transit time for orbital transfers at realistic km-scale can be 60+ seconds at 1x. The v1.1 spec says "max 30s transfers" — achieved by the "Jupiter orbit = 60 seconds" time definition. Warp speed compresses remaining transfer time further when the player initiates one. The requirement is to reach any destination in ≤30 real seconds regardless of scale.

**Core pattern — scaled accumulator:**
```javascript
// Game loop (requestAnimationFrame)
const PHYSICS_DT = 1/120;  // 120 Hz physics tick in sim time (at 1x)
const MAX_WARP = 100;       // 100x maximum time acceleration
const MAX_SUBSTEPS = 8;     // Hard cap: never run more than 8 physics ticks per frame
const MAX_FRAME_TIME = 0.1; // Cap real frameTime to prevent spiral-of-death

function gameLoop(timestamp) {
  const wallDt = Math.min((timestamp - lastTimestamp) / 1000, MAX_FRAME_TIME);
  lastTimestamp = timestamp;

  // Accumulate sim time (warpFactor is a float: 1.0 = realtime, 100.0 = 100x)
  accumulator += wallDt * warpFactor;

  let substeps = 0;
  while (accumulator >= PHYSICS_DT && substeps < MAX_SUBSTEPS) {
    physicsStep(PHYSICS_DT);
    accumulator -= PHYSICS_DT;
    substeps++;
  }

  // Render at whatever time state we reached
  render();

  requestAnimationFrame(gameLoop);
}
```

**Why substepping instead of a single large dt:** Verlet integration (used by the existing orbital mechanics) is numerically stable only when dt is small relative to the orbital period. At 100x warp, a single `physicsStep(100 * 0.016)` = `physicsStep(1.6s)` would use a 1.6s step for orbital mechanics with a ~60s orbital period — a step-to-period ratio of ~2.7%, which introduces integration error. With 8 substeps of PHYSICS_DT=1/120, the effective sim advance per frame is 8/120 = 0.067s at 1x, or 6.7s at 100x warp. The step-to-period ratio stays at ~0.1% — negligible.

**The MAX_SUBSTEPS cap is critical:** At 100x warp, one frame of wall time (0.016s) = 1.6s of sim time = 192 physics ticks. Without a cap this would take ~1.6s of CPU time — causing the spiral of death. Cap at 8 substeps. This means at 100x warp, the sim falls behind real time — it runs at 100x nominal but ~12x actual throughput per frame. The scene will visually skip ahead. This is intentional: warp speed is not meant to be physically accurate, it is a fast-forward mode for player convenience.

**Alternative for very high warp (> 10x): Rail mode.** For warp factors above a threshold, switch from physics integration to analytic Keplerian orbit calculation:
```javascript
if (warpFactor > 10) {
  // Analytic circular orbit position (exact, no integration error)
  const orbitPeriod = 2 * Math.PI * Math.sqrt(r*r*r / BH_GM);
  const phase = (initialPhase + 2 * Math.PI * elapsedSimTime / orbitPeriod) % (2 * Math.PI);
  playerX = r * Math.cos(phase);
  playerZ = r * Math.sin(phase);
} else {
  // Physics integration for precise maneuvering
  physicsStep(PHYSICS_DT);
}
```
Rail mode is how Kerbal Space Program handles high time warp: physics off, analytic orbit equations on. This gives exact positions at any time multiplier without accumulation error. KSP uses rails above 4x and restricts engine use in rail mode — the same restriction applies here (no weapons firing, no orbit changes during high warp).

**warpFactor transitions:** Do not allow instantaneous jumps from 1x to 100x. Ramp the warpFactor over 0.5s of wall time. This prevents visual discontinuities and allows the player to bail out before committing to a long transit.

**HUD display during warp:** Show "WARP x100" indicator. The existing `fly-bullet-time` CSS class can be reused with different text. Suppress HUD elements that are meaningless during warp (weapon status, targeting overlay).

**Confidence: HIGH** — The accumulator/substepping pattern is from Gaffer on Games "Fix Your Timestep" (canonical reference for game physics loops). The rail-mode approach is confirmed by Kerbal Space Program's documented warp behavior. The specific threshold and cap values need game-design tuning but the architecture is sound.

---

## 5. Coordinate System Design for km Scale

### World Coordinate Units: Kilometers

All entity positions, velocities, and orbit parameters are stored in km (from BH center). This is a direct search-and-replace from the existing abstract "units" — multiply all existing oR values by their km equivalents.

**Existing abstract units → km mapping:**

| Planet | Old oR (units) | New oR (km) |
|--------|---------------|-------------|
| Venus | 28 | 28,000 |
| Earth | 33 | 33,000 |
| Jupiter | 38 | 38,000 |
| Mars | 45 | 45,000 |
| Saturn | 52 | 52,000 |
| Uranus | 68 | 68,000 |
| Neptune | 86 | 86,000 |

The time scaling (Jupiter orbit = 60 seconds) then defines all velocities:
```javascript
// Jupiter circular orbital velocity at 38,000 km from BH
const JUPITER_ORBIT_PERIOD = 60;  // seconds
const JUPITER_ORBIT_CIRCUMFERENCE = 2 * Math.PI * 38000;  // km
const JUPITER_ORBITAL_SPEED = JUPITER_ORBIT_CIRCUMFERENCE / JUPITER_ORBIT_PERIOD;  // ~3981 km/s

// BH GM derived from Jupiter orbit (circular orbit: v² = GM/r)
const BH_GM = JUPITER_ORBITAL_SPEED * JUPITER_ORBITAL_SPEED * 38000;  // km³/s²
```

**Physics time unit: seconds.** Velocities in km/s, accelerations in km/s². The existing Verlet integrator receives dt in seconds (from the accumulator above). No unit conversion needed mid-loop.

**What changes at the shader boundary:** The ray march shader uses its own internal units (the existing black hole radius, orbit radii etc.). The shader does NOT need to know about km-scale world coordinates — it renders the background independently of the entity simulation. Only the entity rendering passes (enemy instanced draw, player ship draw, projectile draw) need camera-relative km coordinates. The shader and the entity renderer remain decoupled by design.

**Confidence: HIGH** — The coordinate choice is architectural, derived directly from the v1.1 spec and the existing PROJECT.md. The BH_GM derivation from Jupiter orbital period is basic orbital mechanics.

---

## Stack Summary: New Additions for v1.1

| Component | Technique | Why |
|-----------|-----------|-----|
| Float32 precision | Camera-relative rendering (CRR) in JS pre-upload | Cancels high-order bits; entities always within ~1,000 km of camera = ~0.1m precision |
| LOD thresholds | 0-5,000 km: full 3D; 5,000-100,000 km: billboard; >100,000 km: skip | Calibrated to 500m enemy ship pixel size at each tier |
| LOD transitions | 20% hysteresis bands | Prevents per-frame tier oscillation at boundary |
| Radar rendering | Separate `<canvas>` with 2D API, z-index 30, pointer-events none | Radar content is inherently 2D; Canvas 2D is simpler and fast enough |
| Radar update | Every 2-4 rendered frames (every frame during warp) | Decoupled from 3D render rate; reduces overhead |
| Time acceleration | Scaled accumulator + physics substepping (cap: 8/frame) + rail mode above 10x | Substep prevents integration error; rail mode handles high warp exactly |
| World coordinates | km, from BH center; velocity in km/s | Matches spec; clean scaling from Jupiter orbit period |
| Shader boundary | Ray march uses own internal units; entity passes get camera-relative km | Decoupled: shader unchanged, only entity geometry passes updated |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| World-space coordinates direct to GPU | Float32 provides ~40 m precision at 350,000 km — visible vertex boiling on 500 m ships | Camera-relative rendering: subtract camera position in JS before upload |
| Double-precision GLSL (`double` keyword in shaders) | Not supported in WebGL 1.0 GLSL ES 1.00; would require WebGL 2 + shader rewrites | Camera-relative rendering achieves the same result with zero shader changes |
| DSP (dual-float emulation in shader) | ~4-6 extra MAD operations per vertex, requires doubled upload layout for translations | CRR is sufficient; DSP adds complexity for no benefit when CRR already limits relative coords to <1,000 km |
| WebGL render-to-texture for radar | Requires second camera, second render pass, FBO management, depth texture; ~300 LOC overhead | Separate 2D canvas overlay: zero GL complexity, correct for 2D radar content |
| Single large physics dt for warp | Verlet integration with dt > 1% of orbital period accumulates energy errors | Substepping: cap dt at 1/120s sim time, max 8 substeps/frame; rail mode for warp >10x |
| Instantaneous warpFactor changes | Large jump in accumulated time causes visible discontinuity | Ramp warpFactor over 0.5s wall time |
| `highp` as a precision fix | `highp` in vertex shaders is not guaranteed in WebGL 1.0; even when present it extends exponent range not mantissa precision | Camera-relative rendering: the actual fix for large-world vertex position precision |

---

## Version Compatibility

No new WebGL extensions are needed for v1.1. All new features (CRR, LOD, radar, warp) are pure JS or separate Canvas 2D — zero new GL extension requirements beyond what v1.0 already uses.

| Feature | WebGL Extensions Required | Already Enabled in v1.0 |
|---------|--------------------------|------------------------|
| Camera-relative rendering | None — pure JS math | N/A |
| LOD system | ANGLE_instanced_arrays (already required) | Yes |
| 2D canvas radar | None (separate canvas element) | N/A |
| Warp speed accumulator | None — pure JS | N/A |

---

## Sources

- [IEEE 754 Single-Precision Floating-Point Format — Wikipedia](https://en.wikipedia.org/wiki/Single-precision_floating-point_format) — mantissa bits (23 explicit + 1 implicit = 24 bits), precision formula (HIGH confidence)
- [Godot Engine: Emulating Double Precision on the GPU](https://godotengine.org/article/emulating-double-precision-gpu-render-large-worlds/) — DSP technique, precision numbers at 1M units (~1m precision), camera-relative vs DSP tradeoffs (HIGH confidence)
- [Godot Engine: Large World Coordinates Tutorial](https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html) — Relative-to-Eye rendering confirmation (HIGH confidence)
- [gltut: The Perils of World Space](https://paroj.github.io/gltut/Positioning/Tut07%20The%20Perils%20of%20World%20Space.html) — Combined model-to-camera matrix technique, RTE naming, CPU double-precision then float32 upload pattern (HIGH confidence)
- [Deck.GL / SegmentFault: WebGL Geographic Precision](https://segmentfault.com/a/1190000040332266/en) — Offset coordinates GLSL implementation, 0.33m error at DeckGL zoom-level 12 threshold, shader code example (HIGH confidence)
- [LearnWebGL: Overlays](http://learnwebgl.brown37.net/11_advanced_rendering/overlays.html) — Multiple canvas layering technique, z-index stacking, mouse event routing when overlaying canvases (HIGH confidence)
- [semisignal.com: Canvas 2D vs WebGL Performance](https://semisignal.com/a-look-at-2d-vs-webgl-canvas-performance/) — Crossover point benchmarks; Canvas 2D faster below ~10,000 primitives (MEDIUM confidence — benchmark is from 2020 but the GPU threshold hasn't changed fundamentally)
- [Gaffer on Games: Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) — Canonical accumulator/substepping pattern, MAX_FRAME_TIME cap, spiral-of-death warning (HIGH confidence)
- [KSP Steam Forums: Warp Under Acceleration](https://steamcommunity.com/app/220200/discussions/0/1744483505461805761/) — KSP rails warp description: analytic Keplerian orbits above 4x, physics integration below (MEDIUM confidence — community forum, but consistent with KSP's documented behavior)
- [MDN WebGL Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) — Buffer upload strategies, extension availability (HIGH confidence)
- [WebGL2 Fundamentals: Precision Issues](https://webgl2fundamentals.org/webgl/lessons/webgl-precision-issues.html) — highp not guaranteed in vertex shaders for WebGL 1.0, `gl.getShaderPrecisionFormat()` (HIGH confidence)

---
*Stack research for: WebGL 1.0 km-scale rendering, float32 precision management, LOD, radar UI, warp speed*
*Researched: 2026-03-14*
