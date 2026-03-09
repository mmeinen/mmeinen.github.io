# Technology Stack

**Project:** Navigation Combat System
**Researched:** 2026-03-09

## Context

This stack covers **only what is NEW for the combat system**. The existing codebase already has: WebGL 1.0 context, WASM module for planet positions, a fullscreen ray march shader, separate GL geometry passes for ship/missiles/trajectories, pre-allocated Float32Array scratch buffers, dynamic resolution scaling, a 3-shader pipeline (ray march, ship/solid geometry, trajectory/points), and a gravity simulation in JS with Verlet integration. None of that needs re-researching.

The combat system adds: 30-50 instanced enemy ships, 4 weapon systems with projectiles, particle effects for explosions, collision detection across orbital space, LOD switching, and a wave spawning system. This stack defines what additional WebGL capabilities, rendering patterns, and JS architectures are needed.

## Recommended Stack

### WebGL 1.0 Extensions (Required)

| Extension | Status | Purpose | Why |
|-----------|--------|---------|-----|
| `ANGLE_instanced_arrays` | Universal | Draw 30-50 enemy ships in 1-2 draw calls | MDN confirms "universal WebGL 1 extension" available since June 2016. Without instancing, 50 enemies = 50 draw calls with 50 program state changes. Instancing reduces this to 1 draw call per LOD tier. |
| `OES_vertex_array_object` | Universal | Snapshot vertex attribute state for fast switching between render passes | Also confirmed universal. Eliminates per-frame rebinding of attribute pointers when switching between enemy, projectile, and particle render passes. Critical because combat adds 4-6 distinct render passes. |
| `OES_element_index_uint` | Universal | 32-bit indices for enemy geometry with >65K vertices | Also universal. Needed if enemy ship meshes or combined instanced geometry exceed the 16-bit (65535) index limit. Safety net for complex procedural geometry. |
| `OES_standard_derivatives` | Already active | `fwidth()` in existing shader | Already enabled in index.html line 101. No action needed. |

**Confidence: HIGH** -- MDN WebGL best practices page explicitly lists all four as "universal WebGL 1 extensions" that "can be relied upon."

### WebGL 1.0 Extensions (Optional, Nice-to-Have)

| Extension | Purpose | Fallback | Why Optional |
|-----------|---------|----------|--------------|
| `OES_texture_float` | Float textures for particle data if needed | Use UNSIGNED_BYTE with encoding | Particles use CPU-side Float32Arrays with per-frame buffer uploads; float textures rarely needed |
| `WEBGL_depth_texture` | Read depth buffer for soft particle edges | Hard-edge particles (still look fine at game scale) | Visual polish only, not functional |
| `EXT_blend_minmax` | Advanced blend modes for additive particle FX | Standard additive blending (SRC_ALPHA, ONE) works | Already universal but additive blend covers 99% of particle needs |

**Confidence: MEDIUM** -- These are "nice to have" quality improvements. The combat system works without them.

### Instanced Rendering Architecture

The core pattern for drawing all enemies in a single draw call via `ANGLE_instanced_arrays`:

```javascript
// Setup (once at init)
const ext = gl.getExtension('ANGLE_instanced_arrays');
const vaoExt = gl.getExtension('OES_vertex_array_object');

// Per-instance data buffer (updated each frame)
// Layout: [mat4 modelViewProj (16 floats), vec4 color (4 floats)] per instance
const INSTANCE_STRIDE = 20 * 4; // 80 bytes per instance
const MAX_ENEMIES = 64;
const instanceBuf = gl.createBuffer();
const instanceData = new Float32Array(MAX_ENEMIES * 20); // pre-allocated

// VAO captures vertex state for instant switching
const enemyVAO = vaoExt.createVertexArrayOES();
vaoExt.bindVertexArrayOES(enemyVAO);
// ... bind mesh buffers, set per-vertex attributes (divisor 0) ...
// ... bind instanceBuf, set per-instance attributes (divisor 1) ...
// For mat4: needs 4 attribute slots (vec4 each), each with divisor 1
ext.vertexAttribDivisorANGLE(instanceMatLoc+0, 1);
ext.vertexAttribDivisorANGLE(instanceMatLoc+1, 1);
ext.vertexAttribDivisorANGLE(instanceMatLoc+2, 1);
ext.vertexAttribDivisorANGLE(instanceMatLoc+3, 1);
ext.vertexAttribDivisorANGLE(instanceColorLoc, 1);
vaoExt.bindVertexArrayOES(null);

// Render (each frame)
vaoExt.bindVertexArrayOES(enemyVAO);
// Update instanceData with this frame's transforms
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, activeEnemies * 20));
ext.drawElementsInstancedANGLE(gl.TRIANGLES, meshIndexCount, gl.UNSIGNED_SHORT, 0, activeEnemies);
vaoExt.bindVertexArrayOES(null);
```

**Why this pattern:**
- 1 draw call for all enemies at same LOD level (vs. 50 individual calls)
- VAO eliminates per-frame attribute rebinding overhead
- Pre-allocated Float32Array matches existing codebase pattern (scratch arrays, zero GC)
- `bufferSubData` updates only the active portion, not the full buffer
- mat4 as per-instance attribute avoids per-instance uniform uploads

**Confidence: HIGH** -- This is the standard pattern. WebGL Fundamentals tutorial, Khronos spec, and TojiCode blog all demonstrate the same approach.

### LOD System

Three LOD tiers for enemy rendering, switching by distance from camera:

| Tier | Distance | Rendering | Draw Calls | Why |
|------|----------|-----------|------------|-----|
| Full geometry | < 50 units | Instanced 3D mesh with normals + lighting | 1 | Close enemies need visual detail; 3D geometry catches light |
| Billboard sprite | 50-200 units | Instanced textured quads facing camera | 1 | At this distance, 3D detail is invisible; a 2D quad is 10x cheaper |
| Skip | > 200 units | Not rendered | 0 | Beyond the orbital field of view; rendering wastes GPU cycles |

**Billboard implementation:** Use instanced quads (4 vertices) with per-instance position + size. Vertex shader computes camera-facing orientation using the view matrix axes. Do NOT use `gl_PointSize` / POINTS primitive -- the max point size is hardware-capped (often 63px or less on some GPUs) and clipping behavior at screen edges is inconsistent.

**Confidence: HIGH** -- LOD thresholds match PROJECT.md spec exactly. Billboard-over-points decision is supported by WebGL Fundamentals documentation on gl_PointSize limitations.

### Particle System Architecture

**Approach:** CPU-driven particle pool with GPU rendering via instanced billboard quads.

**Why NOT transform feedback:** WebGL 1.0 does not support transform feedback. That is a WebGL 2.0 feature. All particle state must live in CPU-side typed arrays.

**Why NOT gl_PointSize for particles:** Same capping issue as LOD billboards. Explosion particles can need 100+ pixel size at close range.

| Component | Implementation | Why |
|-----------|----------------|-----|
| Particle pool | Pre-allocated Float32Array, fixed max count (e.g., 512) | Zero allocation during gameplay; matches existing scratch array pattern |
| Per-particle state | [x, y, z, vx, vy, vz, age, maxAge, size, type] = 10 floats per particle | Minimal memory, simple iteration |
| GPU rendering | Single instanced draw call per particle type | All particles of same type (smoke, spark, debris) in one call |
| Animation | Sprite sheet texture atlas (4x4 or 8x8 grid) sampled by age in fragment shader | Standard WebGL sprite animation technique |
| Blending | Additive for sparks/plasma (`gl.blendFunc(gl.SRC_ALPHA, gl.ONE)`), alpha for smoke (`gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)`) | Visual accuracy: hot particles add light, smoke occludes |

**Particle budget per effect:**

| Effect | Particles | Lifetime | Notes |
|--------|-----------|----------|-------|
| Small missile explosion | 20-30 | 0.5-1.5s | Billboard sprite, no volumetric |
| Kinetic cannon impact | 5-10 sparks | 0.3-0.8s | Tiny bright dots |
| Plasma hit | 8-15 | 0.2-0.6s | Additive glow, fast fade |
| Ship destruction | 40-60 | 1.0-3.0s | Debris chunks + sparks |
| Engine trail | 3-5/frame | 0.3-0.5s | Continuous emit, fast recycle |

**Confidence: MEDIUM** -- Particle budgets are estimates that need profiling. The architecture pattern (CPU pool + instanced billboards) is well-established.

### Collision Detection: Radial Bin Partitioning

**Why radial bins instead of uniform grid or quadtree:**
- All gameplay happens in concentric orbital rings around the black hole (radii 28-86 units)
- Objects cluster by orbital radius, not by Cartesian position
- A Cartesian grid would waste most cells (empty space between orbits) and split orbital arcs across many cells
- Radial bins naturally group objects that are close in the orbital sense

**Implementation:**

```
Radial bins:  [0-20] [20-35] [35-50] [50-70] [70-90] [90+]
              inner   Venus   Jupiter  Saturn  Uranus  outer
                      Earth   Mars
```

Each bin is a simple array (pre-allocated, fixed max size). Objects are assigned by `sqrt(x*x + z*z)` (2D radial distance in the ecliptic plane since all combat is planar).

**Collision pairs:** Only check within same bin + adjacent bins. With 6 bins and 50 enemies + projectiles, worst case is ~15 objects per bin, yielding ~105 pair checks instead of ~1225 (brute force).

**Angular subdivision (optional optimization):** If a single radial bin gets too crowded, subdivide into angular sectors (e.g., 4-8 sectors per ring). But start without this -- 50 entities across 6 bins is already fast enough.

**Narrow phase:** Simple sphere-sphere intersection. All combat entities are small relative to orbital distances, so bounding spheres are sufficient. No need for SAT, GJK, or mesh-level collision.

**Confidence: MEDIUM** -- Radial bins are a custom approach tailored to this game's orbital structure. The concept is sound (spatial partitioning is well-studied) but the specific bin boundaries and performance characteristics need profiling.

### Render Pipeline (Extended)

The existing render pipeline is:

1. Fullscreen quad ray march (black hole + accretion disk + planets + detonations)
2. `gl.clear(gl.DEPTH_BUFFER_BIT)` -- clears depth, keeps color from ray march
3. Enable depth test
4. Ship geometry pass (shipPg shader)
5. Missile geometry pass (shipPg shader, per-missile draw call)
6. Trajectory/target marker pass (trajPg shader, points + lines)
7. Disable depth test, restore ray march state

The combat system extends this to:

1. Fullscreen quad ray march (unchanged)
2. `gl.clear(gl.DEPTH_BUFFER_BIT)`
3. Enable depth test
4. **Player ship** (shipPg, 1 draw call)
5. **Enemy ships -- full LOD** (enemyPg, 1 instanced draw call)
6. **Projectiles** (projectilePg or reuse trajPg, 1 instanced draw call per weapon type)
7. **Kinetic shields** (shipPg, instanced, 1 draw call)
8. Disable depth write, keep depth test
9. **Enemy ships -- billboard LOD** (billboardPg, 1 instanced draw call)
10. **Particle effects** (particlePg, 1 instanced draw call per particle type, blended)
11. **Trajectory/markers/HUD geometry** (trajPg)
12. Disable depth test, restore ray march state

**Total new draw calls:** ~6-10 per frame (vs. current ~4-8). Each is instanced, so object count does not multiply draw calls.

**Shader programs needed:**

| Program | Exists? | Purpose | Vertex Attributes |
|---------|---------|---------|-------------------|
| Ray march (pg) | Yes | Background scene | a_pos (vec2) |
| Solid geometry (shipPg) | Yes | Player ship, kinetic shields | a_shipPos, a_shipNormal + uniforms |
| **Instanced geometry (enemyPg)** | **NEW** | Enemy ships (full LOD) | a_pos, a_normal (per-vertex) + a_instanceMat, a_instanceColor (per-instance) |
| **Billboard (billboardPg)** | **NEW** | Enemy LOD billboards, particles | a_corner (per-vertex) + a_instancePos, a_instanceSize, a_instanceUV (per-instance) |
| Points/lines (trajPg) | Yes | Trajectories, target markers | a_trajPos |
| **Projectile (reuse trajPg or new)** | **Maybe** | Kinetic/plasma projectiles | Likely reuse trajPg for simple glowing points/lines |

**Why 2 new shader programs, not more:**
- State changes (program switches) are among the most expensive WebGL operations
- Sort render calls by shader program to minimize switches
- The 2 new programs cover all combat entities: solid instanced geometry + billboard instanced sprites
- Reuse existing trajPg for simple projectile rendering (glowing dots/lines)

**Confidence: HIGH** -- The render pipeline extension follows directly from the existing architecture. The depth buffer strategy (clear depth, render 3D, disable depth write for transparent) is standard WebGL practice confirmed by MDN and LearnWebGL.

### Orbital Mechanics (JS-only, no new tech)

No new technology needed -- the existing codebase already has:
- N-body gravity computation (`computeGravAccel`, `computeGravAccelAtTime`)
- Verlet integration for trajectory prediction (`simulateTrajectory`)
- Planet position computation at arbitrary time (`planetPosAtTime`)
- Pre-computed planet GMs (`_planetGM`)

**What to add (pure JS, no libraries):**

| Feature | Implementation | Why No Library |
|---------|----------------|----------------|
| Orbital transfer computation | Reuse `simulateTrajectory` with thrust parameters | Already exists, just needs UI to select destination body and compute burn |
| Orbit altitude adjustment | Tangential velocity change at current position | Simple v += dv along orbit tangent, then let gravity sim take over |
| Enemy orbit assignment | Place enemies at radius + random phase, give circular velocity | `v_circular = sqrt(BH_GM / r)`, perpendicular to radial direction |
| Projectile trajectories | Reuse gravity sim for kinetic cannon; ignore gravity for plasma | Kinetic: same integration as missiles. Plasma: straight line with distance fade |
| Missile fuel system | Track fuel as float, self-destruct when fuel <= 0 and off-target | Simple counter, no physics library needed |

**Confidence: HIGH** -- The existing gravity simulation covers all orbital mechanics needs. Adding orbital transfers is a UI/gameplay problem, not a technology problem.

### Game State Management (JS-only)

**Architecture: Simple struct-of-arrays with object pools.**

Do NOT use ECS (Entity-Component-System). Rationale:
- ECS adds architectural complexity for games with >1000 entities and dozens of component types
- This game has ~5 entity types (player, enemy, projectile, particle, shield) with ~50-100 active entities
- A simple typed-array pool per entity type is faster, simpler, and matches the existing codebase style
- No npm, no frameworks, no build tools -- ECS libraries add dependencies

**Entity pools:**

```javascript
// Pre-allocated enemy pool
const MAX_ENEMIES = 64;
const enemyPool = {
  active: new Uint8Array(MAX_ENEMIES),        // 0/1 alive flag
  x: new Float32Array(MAX_ENEMIES),           // position
  z: new Float32Array(MAX_ENEMIES),
  vx: new Float32Array(MAX_ENEMIES),          // velocity
  vz: new Float32Array(MAX_ENEMIES),
  hp: new Float32Array(MAX_ENEMIES),          // hull points
  type: new Uint8Array(MAX_ENEMIES),          // enemy type index
  orbitR: new Float32Array(MAX_ENEMIES),      // current orbital radius
  orbitPhase: new Float32Array(MAX_ENEMIES),  // current angular position
  count: 0                                     // active count
};
```

**Why struct-of-arrays over array-of-structs:**
- Better CPU cache locality when iterating all enemies for physics/rendering
- Float32Arrays can be subarray'd and uploaded directly to GL buffers
- Zero garbage collection -- arrays are allocated once at startup
- Matches existing `detSlots`, `missiles`, and scratch array patterns

**Confidence: HIGH** -- This is the idiomatic pattern for the existing codebase. No new architectural concepts needed.

### Wave System (JS-only)

No technology decision needed. Simple state machine:

```
IDLE -> SPAWNING -> ACTIVE -> CLEARED -> (increment wave) -> SPAWNING
```

Difficulty scaling is pure data: `enemyCount = baseCount + wave * 2`, `enemyAccuracy = min(0.3 + wave * 0.02, 0.9)`, etc.

Boss waves: every N waves, spawn a single high-HP enemy with unique behavior. No special tech needed.

**Confidence: HIGH** -- Standard game pattern, no tech choices involved.

## What NOT to Use (and Why)

| Technology | Why Not |
|------------|---------|
| **WebGL 2.0** | The existing scene uses WebGL 1.0 (`canvas.getContext('webgl')`). Switching to WebGL 2 would require rewriting every shader (GLSL 100 -> 300 es, `varying` -> `in/out`, `texture2D` -> `texture`, etc.), retesting the ray march shader, and potentially breaking mobile compatibility. WebGL 1.0 with universal extensions provides everything needed. |
| **Three.js / Babylon.js** | The project constraint is "no frameworks, no npm, no build tools." These libraries are 500KB+ minified and would fundamentally change the architecture. The existing hand-rolled GL code is more performant for this specific use case. |
| **Physics libraries (cannon.js, ammo.js)** | Orbital mechanics require custom gravity (N-body with black hole). General-purpose physics engines use rigid body dynamics, springs, and contact resolution -- none of which apply. The existing `computeGravAccel` function handles all physics needs. |
| **Transform feedback** | WebGL 1.0 only. Does not exist. |
| **Geometry shaders** | WebGL does not support geometry shaders at all (neither 1.0 nor 2.0). Billboard expansion must happen in the vertex shader. |
| **Compute shaders** | WebGL does not support compute shaders. GPU-side particle simulation is not possible. All particle physics runs on CPU. |
| **Web Workers for physics** | Adds complexity (message passing, shared memory coordination) for marginal gain. 50 enemies + 200 projectiles + 512 particles = ~800 entities. A single JS frame at 30fps has 33ms budget. N-body gravity for 800 entities takes <1ms on modern CPUs. Not worth the architecture cost. |
| **WASM for combat sim** | The existing WASM module is a tiny inline binary for planet position computation. Extending it for combat would require a WASM toolchain (Rust/C compiler), which conflicts with "no build tools." JS is fast enough for the entity counts involved. |
| **gl_PointSize for particles** | Hardware-capped (often 63px max, varies by GPU). Clipping at screen edges is inconsistent (point center must be on screen). Use instanced quads instead -- no size limit, correct clipping, same draw call count. |
| **RGB8 textures** | MDN explicitly warns "RGB8 is often surprisingly slow" due to alpha channel masking overhead. Always use RGBA8. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Enemy rendering | Instanced geometry (ANGLE_instanced_arrays) | Individual draw calls per enemy | 50 draw calls + 50 program state changes = 5-10ms wasted per frame |
| Particle rendering | Instanced billboard quads | gl.POINTS with gl_PointSize | Max size capped at 63px on some GPUs; screen-edge clipping bugs |
| Collision detection | Radial bin partitioning | Uniform Cartesian grid | Wasted cells in empty space between orbital rings; radial bins match game geometry |
| Collision detection | Radial bin partitioning | Quadtree | Quadtree has higher overhead for small entity counts (<100); overkill for this game |
| State management | Struct-of-arrays pools | ECS framework | 5 entity types, 50-100 entities -- ECS adds complexity without benefit at this scale |
| State management | Struct-of-arrays pools | Array-of-objects | Objects cause GC pressure; typed arrays are cache-friendly and upload directly to GL |
| Orbital mechanics | Custom JS (existing code) | Kepler equation solver library | Existing Verlet integration already works; Kepler equation is analytic but less flexible for gameplay tuning |
| Billboard orientation | View matrix axis extraction in vertex shader | CPU-side billboard matrix computation | GPU-side is free (view matrix already available); CPU-side adds per-billboard matrix math |

## Texture Assets Needed

| Texture | Format | Size | Purpose |
|---------|--------|------|---------|
| Explosion sprite sheet | RGBA8 PNG | 512x512 (8x8 grid = 64 frames) | Small missile/projectile explosions |
| Smoke/debris sprite sheet | RGBA8 PNG | 256x256 (4x4 grid = 16 frames) | Ship destruction smoke |
| Plasma glow | RGBA8 PNG | 64x64 (single sprite) | Plasma gun projectile |
| Engine trail | RGBA8 PNG | 32x32 (single sprite) | Ship/missile engine exhaust |
| Enemy hull | RGBA8 procedural (generated at init) | 64x64 | Simple hull texture for enemy ships |

**Texture atlas strategy:** Combine all particle sprites into one 512x512 atlas to minimize texture bind changes during particle rendering.

**Confidence: MEDIUM** -- Texture sizes are estimates. May need adjustment after visual testing. Procedural enemy textures may not need a texture at all if shader-only coloring looks good enough (the existing ship uses flat color + Lambertian lighting).

## Performance Budget

| Render Pass | Target Time | Notes |
|-------------|-------------|-------|
| Ray march (existing) | ~20ms | The bottleneck. Cannot be reduced without visual regression. Dynamic resolution scaling handles this. |
| Enemy instanced draw | < 1ms | Single draw call, 50 instances, simple shader |
| Projectile instanced draw | < 0.5ms | Single draw call, up to 200 instances, point/line primitives |
| Particle instanced draw | < 1ms | Single draw call, up to 512 instances, simple billboard shader |
| JS physics update | < 2ms | Gravity for ~800 entities, radial bin collision check |
| JS game logic | < 1ms | Wave management, AI decisions, state updates |
| **Total combat overhead** | < 5ms | Leaves 28ms for ray march at 30fps target |

**Confidence: MEDIUM** -- Estimates based on typical WebGL instanced rendering costs. Need profiling on GTX 1060 tier hardware to validate.

## Sources

- [MDN: ANGLE_instanced_arrays](https://developer.mozilla.org/en-US/docs/Web/API/ANGLE_instanced_arrays) -- Extension API, browser compatibility, universal status
- [MDN: WebGL Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) -- Universal extensions list, state change costs, buffer management, shader optimization
- [WebGL Fundamentals: Instanced Drawing](https://webglfundamentals.org/webgl/lessons/webgl-instanced-drawing.html) -- Instancing pattern with ANGLE_instanced_arrays
- [WebGL Fundamentals: gl_PointSize Limitations](https://webglfundamentals.org/webgl/lessons/webgl-qna-working-around-gl_pointsize-limitations-webgl.html) -- Max 63px on some hardware, quad workaround
- [Khronos: ANGLE_instanced_arrays Specification](https://registry.khronos.org/webgl/extensions/ANGLE_instanced_arrays/) -- Official spec
- [MDN: OES_vertex_array_object](https://developer.mozilla.org/en-US/docs/Web/API/OES_vertex_array_object) -- VAO extension API
- [Game Programming Patterns: Spatial Partition](https://gameprogrammingpatterns.com/spatial-partition.html) -- Spatial partitioning theory
- [Game Programming Patterns: Object Pool](https://gameprogrammingpatterns.com/object-pool.html) -- Object pool pattern
- [Web Game Dev: Spatial Partitioning](https://www.webgamedev.com/performance/spatial-partitioning) -- Web game spatial partitioning overview
- [Chinedufn: WebGL Particle Billboard Tutorial](https://www.chinedufn.com/webgl-particle-effect-billboard-tutorial/) -- Billboard particle technique
- [TojiCode: WebGL Instancing](https://blog.tojicode.com/2013/07/webgl-instancing-with.html) -- Practical instancing examples
- [Geeks3D: Point Sprites vs Geometry Instancing](https://www.geeks3d.com/20140929/test-particle-rendering-point-sprites-vs-geometry-instancing-based-billboards/) -- Performance comparison
