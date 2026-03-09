# Domain Pitfalls

**Domain:** WebGL tactical orbital combat layered on an existing fullscreen ray march shader
**Researched:** 2026-03-09

---

## Critical Pitfalls

Mistakes that cause rewrites, major performance regressions, or architectural dead-ends.

### Pitfall 1: Shader Parameter Contamination Across Modes

**What goes wrong:** Adding combat mode parameters to the ray march shader that accidentally apply to normal (non-combat) mode, causing massive iteration count increases in the default scene.

**Why it happens:** This project has already experienced this exact failure (optimization history entry #13). Nav mode needed `stepCap=3.0`, `convergenceEscape=r>90`, and `escapeRadius=max(100,...)` for doubled orbits. These were applied unconditionally, causing 27-111% more iterations in normal mode. Combat mode will introduce further parameter variations (camera distances, possibly new escape thresholds for tactical zoom-out). The temptation to hardcode "just one more" parameter change is high.

**Consequences:** Normal mode FPS drops by 30-50%+ with no visual change. The regression is silent -- there is no crash, just worse performance that is hard to attribute to a specific change. Users in the default scene (the most common state) suffer for a mode they are not using.

**Prevention:**
- Every ray march parameter that differs between modes MUST use `u_orbitScale` or a new combat-mode uniform to switch values: `mix(normalVal, combatVal, step(threshold, u_modeUniform))`.
- Before ANY shader change, capture baseline iteration counts in normal mode using the Python simulation method from entry #13.
- After ANY shader change, verify normal mode iterations have not increased.
- Add a test to `tests.html` that validates key shader parameters are mode-gated.

**Detection:** FPS drop in normal mode after a combat-related change. Compare `git show HEAD~1:js/scene/shaders.js` shader constants against current.

**Phase:** Must be enforced from the very first phase that touches the shader. Establish the mode-gating pattern before any combat rendering code.

---

### Pitfall 2: Combat Rendering Inside the Ray March Loop

**What goes wrong:** Adding per-enemy checks, projectile intersection tests, or combat visual effects inside the 250-iteration ray march loop, even behind uniform gates.

**Why it happens:** The ray march naturally lenses everything -- enemies rendered inside it would be gravitationally lensed, which sounds cool. Developers think "I'll just add one more sphere check per iteration, it's only 7 planets already." But planets are a fixed count compiled into the shader. Enemy counts vary per frame, requiring either a fixed maximum array (wasting registers even when empty) or dynamic loop bounds (not supported in GLSL ES 1.0).

**Consequences:**
- GLSL ES 1.0 requires constant loop bounds. You cannot `for(int i=0; i<u_enemyCount; i++)` -- the loop bound must be a compile-time constant.
- Even with a fixed array like `uniform vec4 u_enemies[50]`, the GPU compiler allocates registers for the worst case. With 50 enemies * 4 floats * possible register spill, GPU occupancy drops dramatically.
- Optimization history entry #10 shows that even 6 detonation slots inside the ray march had hypothesized register pressure issues (though on this hardware the compiler handled it). 50 enemies will NOT be handled gracefully.
- Per-iteration branching for enemy checks causes warp divergence (different pixels see different enemies at different distances).

**Prevention:**
- Enforce the architectural rule from PROJECT.md: all combat elements are separate GL geometry passes, NEVER inside the ray march.
- Enemies, projectiles, and small explosions are rendered as 3D geometry or billboards AFTER the ray march fullscreen quad.
- Only nuclear detonations (max 6, already implemented) use the in-shader volumetric path.
- Combat elements will NOT be gravitationally lensed. This is the correct tradeoff -- enemies orbit at r=28-86 where lensing is minimal anyway.

**Detection:** Any code review that finds `u_enemy` or combat-related uniforms referenced inside the `for (int i = 0; i < 250; i++)` loop in `shaders.js`.

**Phase:** Architecture phase -- establish the multi-pass rendering pipeline before implementing any combat visuals.

---

### Pitfall 3: Per-Enemy Draw Calls Instead of Instanced Batching

**What goes wrong:** Drawing each enemy ship with individual `gl.drawElements()` calls, each requiring its own model matrix uniform upload, buffer bind, and state setup. At 50 enemies, this means 50+ draw calls with 200+ GL state changes per frame.

**Why it happens:** The existing missile rendering code (in `index.html` lines 665-687) already does this: it loops over `missiles[]` and makes individual draw calls with individual matrix computations. This pattern works fine for 6 missiles but will collapse at 50 enemies, because each GL call in WebGL has validation overhead that native OpenGL does not.

**Consequences:**
- At 50 enemies with per-enemy draw calls: ~50 `useProgram` or uniform uploads, ~100 `bindBuffer` calls, ~50 `drawElements` calls = ~200 GL calls just for enemies. On WebGL, each call has CPU-side validation overhead.
- The CPU becomes the bottleneck instead of the GPU. The ray march shader finishes but the JS/GL command stream cannot keep up.
- The existing pattern of computing per-object MVP matrices in JS (`mat4Model`, `mat4Mul` x3, `mat3NormalFromMat4`) allocates or fills scratch arrays. At 50 enemies this is ~750 typed array operations per frame (already pre-allocated, but still CPU work).

**Prevention:**
- Use `ANGLE_instanced_arrays` extension (WebGL 1.0) from day one. The extension is widely available -- check for it at init and have a fallback.
- Pack per-instance data (position, orientation, scale, color/type) into a single Float32Array buffer. Upload once per frame with `gl.bufferSubData()`.
- Use `vertexAttribDivisorANGLE(attr, 1)` for instance attributes, `drawArraysInstancedANGLE()` for the draw call.
- One draw call for ALL enemies of the same mesh type. If there are 3 enemy types, that is 3 draw calls maximum.
- Pre-allocate the instance buffer at maximum enemy capacity (e.g., 64 enemies * stride). Never resize with `bufferData` at runtime -- use `bufferSubData` into the existing allocation.

**Detection:** More than 5 `gl.drawElements` or `gl.drawArrays` calls for enemy rendering in the render loop. Any loop over enemies that calls `gl.bindBuffer` inside.

**Phase:** Must be designed in the architecture phase and implemented in the first enemy rendering phase. Retrofitting instancing onto per-object draw calls is a rewrite.

---

### Pitfall 4: N-Body Gravity for Every Combat Entity

**What goes wrong:** Computing gravitational acceleration from the black hole + 7 planets for every enemy ship and every projectile every frame, using the same `computeGravAccel()` function used for the player ship.

**Why it happens:** The existing `computeGravAccel()` and `computeGravAccelAtTime()` functions work correctly and are already written. The natural instinct is to reuse them for all entities. But they perform 8 gravity source evaluations (1 BH + 7 planets), each with a `Math.sqrt` and division. For 50 enemies + 20 projectiles = 70 entities: 70 * 8 = 560 sqrt calls + 560 divisions per physics tick. With Verlet integration requiring 2 evaluations per step: 1120 sqrt + 1120 div per tick.

**Consequences:**
- At bullet time scale (0.03x), physics ticks are small but frequent. At fast-forward (0.5x), ticks are larger.
- With 70 entities and 2-pass Verlet: ~1120 sqrt and ~1120 div per physics frame. At 60fps: ~67,200 sqrt/s. This is not catastrophic on modern CPUs but is wasteful.
- The real danger is trajectory prediction: `simulateTrajectory()` runs 100 forward steps for the player. If weapons need trajectory preview (kinetic cannon arcs, missile paths), and you want previews for multiple weapons simultaneously, the computation explodes: 4 weapons * 100 steps * 2 passes * 8 sources = 6400 gravity evals per frame just for previews.

**Prevention:**
- **Enemies:** Use BH-only gravity (single source). Planetary perturbation at the orbital distances enemies operate is negligible for gameplay. One sqrt + one div per entity per pass.
- **Projectiles:** BH-only for kinetic cannon and missiles. Plasma gun has no gravity effect per spec.
- **Trajectory preview:** Cache and update every N frames (e.g., every 3rd frame like hover detection). Use BH-only for preview simulation.
- **Player ship:** Keep full n-body (BH + 7 planets) since it is a single entity and the precision matters for orbital transfers.
- Document the gravity model hierarchy explicitly: player=full, enemies=BH-only, projectiles=BH-only or none.

**Detection:** `computeGravAccel()` called inside a loop over enemies or projectiles. Any function doing `for(let i=0;i<7;i++)` planet iteration for non-player entities.

**Phase:** Physics/movement phase. Must be decided before implementing enemy movement.

---

### Pitfall 5: Depth Buffer Conflicts Between Fullscreen Quad and 3D Geometry

**What goes wrong:** The fullscreen ray march quad writes to the depth buffer at z=0 (since it is a 2D quad with `gl_Position = vec4(a_pos, 0.0, 1.0)`). When 3D combat geometry is rendered afterward with depth testing enabled, the depth comparison against the quad's z=0 causes geometry to be either always-visible or always-occluded depending on depth function.

**Why it happens:** The existing nav mode code already handles this correctly by doing `gl.clear(gl.DEPTH_BUFFER_BIT)` after the ray march and before 3D geometry (line 644 in index.html). But combat adds complexity: transparent effects (explosions, plasma trails, shields) need blending, and blending + depth testing interact poorly. Additionally, combat entities at vastly different distances (r=28 to r=86) need correct depth ordering relative to each other AND relative to planets/accretion disk rendered by the shader.

**Consequences:**
- Transparent sprites (explosion effects, plasma bolts) rendered with depth writes will occlude geometry behind them with their invisible pixels.
- Without depth writes, transparent objects cannot correctly occlude each other.
- Enemies near the camera may appear to float in front of the accretion disk or planets, breaking the illusion that they exist in the same scene.
- The ray march renders planets and the disk in a completely different coordinate space than the 3D geometry pass. There is no shared depth buffer between them.

**Prevention:**
- Accept that the ray march pass and the geometry pass have independent depth: combat geometry uses its own depth buffer (cleared after ray march, as already done).
- Render opaque combat geometry (enemy ships, player ship, projectiles) first with depth test + depth write.
- Render transparent combat effects (explosions, trails, shields) second with depth test but NO depth write, sorted back-to-front.
- For the rare case where an enemy visually overlaps a planet: the planet is rendered by the shader at a known screen position. Accept the z-ordering artifact or implement screen-space masking (complex, probably not worth it).
- Billboard sprites (small explosions) should use `gl.depthMask(false)` + `gl.enable(gl.BLEND)`.

**Detection:** Visual artifacts where enemies appear in front of the accretion disk when they should be behind it, or transparent effects creating rectangular "holes" in the scene.

**Phase:** Architecture phase (rendering pipeline design) and first visual effects phase.

---

### Pitfall 6: Spawning 50 Enemies at Frame Boundaries Causing GC Spikes

**What goes wrong:** Creating 50 new enemy objects (each with position arrays, velocity arrays, state objects, trail buffers) when a new wave spawns, causing a garbage collection spike that drops frames for 100-200ms.

**Why it happens:** JavaScript's V8 GC handles small, short-lived allocations well (as proven in optimization history entry #11 where 4000 allocs/sec had no measurable impact). But wave spawning is bursty: 0 allocations most frames, then 50 complex objects all at once. Each enemy needs Float32Array for position (3), velocity (3), forward direction (3), potentially trail buffer (180 floats for 60-point trail). That is ~200 floats * 4 bytes * 50 enemies = 40KB of typed arrays in one frame.

**Consequences:**
- Single-frame allocation burst triggers minor GC collection.
- On lower-end hardware or with browser memory pressure, this can cause a visible hitch.
- Worse: if enemies are destroyed and recreated each wave, the old arrays become garbage. Over many waves, the nursery fills faster.

**Prevention:**
- **Object pool for enemies:** Pre-allocate a pool of 64 (or max enemy count) enemy objects at game init. Each has pre-allocated typed arrays.
- **Pool API:** `pool.acquire()` returns a deactivated enemy, resets its state. `pool.release(enemy)` marks it available. No `new` during gameplay.
- **Instance buffer:** Pre-allocate the GPU-side instance buffer at max capacity. `bufferSubData` writes only active enemy data each frame.
- **Projectile pool:** Same pattern for projectiles. Pre-allocate max projectile count (e.g., 100).
- The existing missile code already uses a simple array (`missiles[]`) with `alive` flags -- this is a partial pool pattern. Formalize it.

**Detection:** Frame time spike on wave transition visible in FPS counter. `performance.memory` (Chrome) showing sawtooth pattern correlating with wave spawns.

**Phase:** Enemy system phase. Must be implemented from the start, not retrofitted.

---

## Moderate Pitfalls

### Pitfall 7: Collision Detection Scaling to O(n^2)

**What goes wrong:** Checking every projectile against every enemy for collision: 20 projectiles * 50 enemies = 1000 distance checks per frame. Each check involves subtraction + dot product + sqrt = ~10 FLOPs. Total: ~10,000 FLOPs. This is not catastrophic alone, but combined with gravity computation and trajectory prediction, it pushes JS toward its per-frame budget.

**Prevention:**
- Use radial bins as specified in PROJECT.md. Enemies orbit at known radii -- bin them by orbital radius bands (e.g., 5-unit bands). A projectile at r=45 only checks enemies in the r=40-50 bin.
- Radial binning is natural for this scene because all motion is roughly coplanar (y=0 plane). A 1D radial partition is sufficient.
- Update bin assignments only when an enemy crosses a bin boundary, not every frame.
- For enemy-vs-player collision: check only enemies in the player's current radial bin.

**Detection:** Frame time increasing linearly with enemy count squared rather than linearly.

**Phase:** Combat collision phase. Design bin structure when implementing projectile-enemy interaction.

---

### Pitfall 8: GL State Leaks Between Render Passes

**What goes wrong:** The combat render pass leaves GL state (blend mode, depth test, active program, bound buffers, vertex attrib arrays) that corrupts the next frame's ray march pass or vice versa.

**Why it happens:** The existing code already manages state transitions carefully (lines 644-758 in index.html): it enables depth test and blend for nav mode, then disables them and rebinds the ray march program/buffers at the end. But combat adds more passes: enemy instanced draw, projectile draw, explosion billboard draw, UI overlay draw. Each pass may use different programs, blend modes, and vertex layouts. Missing a single `gl.disable(gl.BLEND)` or `gl.disableVertexAttribArray()` will cause the ray march to render incorrectly on the next frame.

**Prevention:**
- Define a "clean state" contract: after ALL combat rendering, the GL state must be restored to exactly what the ray march expects. Currently this is: program=`pg`, buffer=`bf`, attrib 0=enabled with 2-float pointer, blend=disabled, depth test=disabled.
- Use a state restoration function called at the end of combat rendering, not inline state management scattered across draw calls.
- Alternatively, use the `OES_vertex_array_object` extension for WebGL 1.0 to capture vertex attrib state in VAOs, reducing the number of `enableVertexAttribArray`/`vertexAttribPointer` calls needed during state transitions.
- Test by toggling combat on/off rapidly -- if the ray march flickers or renders incorrectly, state is leaking.

**Detection:** Visual glitches (black screen, wrong colors, missing elements) that only appear when combat mode is active AND the ray march is rendering.

**Phase:** Architecture phase. Define the state contract before implementing any new render passes.

---

### Pitfall 9: Bullet Time Physics Desync with Combat Entities

**What goes wrong:** The bullet time system (0.03x time scale) and fast-forward (0.5x) affect the player ship's physics, but enemy and projectile physics use a different or incorrect time scale, causing desynchronization.

**Why it happens:** The existing `updateNav()` receives `simDt` which is already scaled by bullet time. But combat adds multiple physics systems: enemy AI movement, enemy projectile flight, weapon cooldowns, wave timers. If any of these use wall-clock time instead of sim time, or use a fixed dt instead of the scaled dt, entities move at wrong speeds relative to the player.

**Consequences:**
- Enemies move at normal speed while the player is in bullet time -- unfair and disorienting.
- Weapon cooldowns count down in real time instead of sim time, letting the player fire faster in bullet time than intended.
- Wave spawn timers tick in real time, spawning the next wave while the player is still in slow-motion examining the field.

**Prevention:**
- ALL game logic (enemy movement, projectile flight, cooldowns, wave timers) must use the same `simDt` that the player physics uses.
- Define a single `gameTime` (accumulated sim time) and `gameDt` (per-frame sim time delta). Every system reads from these.
- Bullet time affects `gameDt`, which affects ALL systems uniformly.
- Exception: UI animations (HUD transitions, text fades) should use wall-clock time so they remain responsive during bullet time.
- The existing wave system is kill-triggered (not timed), which naturally avoids the wave timer issue. Keep it that way.

**Detection:** Enter bullet time and observe: do enemies slow down proportionally? Do weapon cooldowns stretch? Does the wave counter behave correctly?

**Phase:** Physics integration phase. Must be established when implementing the first non-player entity that moves.

---

### Pitfall 10: LOD System Thrashing at Distance Boundaries

**What goes wrong:** Enemies near a LOD boundary (e.g., 50 units for full geometry vs billboard) oscillate between representations frame-to-frame as the camera or enemy moves slightly, causing visible popping.

**Why it happens:** PROJECT.md specifies LOD thresholds: full geometry <50 units from camera, billboard >50, skip >200. An enemy orbiting at exactly 50 units from the camera will flip between geometry and billboard every frame as minor camera movement crosses the threshold.

**Prevention:**
- Add hysteresis to LOD transitions: switch from geometry to billboard at 55 units, but switch back at 45 units. The 10-unit dead zone prevents oscillation.
- Fade between LOD levels over 2-3 frames using alpha blending (render both and crossfade) for the transition.
- Alternatively, use a single frame of "grace period" -- once an LOD level is assigned, it persists for at least N frames before reconsidering.
- The skip threshold (>200) should also have hysteresis: skip at 210, resume at 190.

**Detection:** Visual popping/flickering of enemies at medium distance. LOD counter showing rapid switches.

**Phase:** Enemy rendering phase, when implementing the LOD system.

---

### Pitfall 11: Instanced Rendering Buffer Overrun

**What goes wrong:** The pre-allocated instance buffer holds 64 enemy slots, but a boss wave spawns 65 enemies, writing past the buffer end and causing a WebGL error or silent data corruption.

**Prevention:**
- Cap the maximum active entity count in the wave spawner, not just the buffer. The spawner must never create more entities than the pool supports.
- Use `bufferSubData` with explicit offset and length. Never write more than `maxInstances * instanceStride` bytes.
- Log a warning (not crash) if the spawner attempts to exceed capacity, and defer excess spawns to the next frame.
- Define capacity constants in one place: `MAX_ENEMIES = 64`, `MAX_PROJECTILES = 128`, `MAX_EXPLOSIONS = 32`. All systems reference these.

**Detection:** WebGL errors in console about buffer overrun, or enemies appearing with corrupted positions/colors.

**Phase:** Enemy system phase and wave spawning phase. Must be designed together.

---

### Pitfall 12: Tactical Zoom-Out Camera Exposing Ray March Quality Issues

**What goes wrong:** Tactical targeting mode zooms the camera far out to see the entire black hole system. At extreme distances (camDist > 200), the ray march runs fewer iterations per pixel (rays escape faster), but the accretion disk and photon ring shrink to a few pixels, causing visual artifacts from aliasing.

**Why it happens:** The ray march is tuned for `camDist` in the range of 40-120 (normal mode) to 60-200 (nav mode). Tactical zoom-out might push `camDist` to 300+. At these distances, the escape radius `max(50*orbitScale, camDist+20)` becomes very large, and the step size at the camera position is `0.08 * (300 - r_h) = ~24`, far above the step cap of 5.0. The cap kicks in immediately, meaning ALL iterations use the maximum step size. This is actually fine for iteration count -- rays escape quickly. But the black hole shrinks to ~20px and the disk to ~5px, making aliasing severe.

**Consequences:**
- Accretion disk appears as noisy scattered pixels at extreme zoom.
- Photon ring becomes a single pixel with frame-to-frame jitter.
- The scene looks "broken" at the exact moment the player is supposed to have a tactical overview.

**Prevention:**
- Set a maximum `camDist` for tactical mode that keeps the black hole scene visually coherent. Test at various distances to find the threshold.
- At extreme zoom, consider rendering the black hole as a simplified sprite/icon rather than the full ray march. The ray march is designed for beauty at close range, not for tactical readability.
- Alternatively, render the ray march at a lower resolution (the dynamic `renderScale` system already exists) and overlay tactical UI elements (orbit lines, enemy markers, weapon ranges) as crisp vector graphics.
- The tactical view's value is strategic information, not shader beauty. Invest in clear UI overlays, not shader quality at 300 units.

**Detection:** Enter tactical view and check if the black hole looks like a noisy mess vs a recognizable feature.

**Phase:** Tactical targeting mode phase. Test camera distance limits early.

---

## Minor Pitfalls

### Pitfall 13: WebGL Extension Availability Assumptions

**What goes wrong:** Assuming `ANGLE_instanced_arrays` or `OES_vertex_array_object` is available without checking, causing a crash on devices that lack them.

**Prevention:**
- Check for extensions at initialization. `ANGLE_instanced_arrays` is available on 97%+ of WebGL 1.0 implementations, but not 100%.
- Have a fallback path: if instancing is unavailable, fall back to batched `drawArrays` with per-batch uniform updates (slower but functional).
- Cache extension references: `const instExt = gl.getExtension('ANGLE_instanced_arrays');`

**Detection:** White screen or console error on older browsers/devices.

**Phase:** Architecture phase, during rendering pipeline setup.

---

### Pitfall 14: HUD Element Overflow in Combat Mode

**What goes wrong:** Combat adds many HUD elements (hull integrity, shield status, 4 weapon statuses, wave counter, orbit info) that overlap with existing HUD elements (spin, range, FPS, nav controls) on small screens.

**Prevention:**
- Hide non-essential normal-mode HUD elements during combat (spin readout, helm controls).
- Design combat HUD layout at the minimum supported resolution.
- Use the existing `.nav-active` CSS class pattern to toggle HUD sections.
- Group related combat HUD info (all weapon statuses in one panel, not scattered).

**Detection:** HUD elements overlapping at 1280x720 or smaller.

**Phase:** HUD/UI phase.

---

### Pitfall 15: Weapon Trajectory Preview Performance

**What goes wrong:** Computing trajectory previews for 4 different weapon types simultaneously (kinetic cannon arc, missile path, plasma range indicator, nuclear blast radius), each requiring forward simulation.

**Prevention:**
- Only preview the currently selected weapon, not all four.
- Kinetic cannon: simulate 50 steps forward with BH-only gravity. Cache and update every 3 frames.
- Missile: show straight line to target (PN guidance makes actual path unpredictable before launch).
- Plasma: show range ring (no simulation needed -- it is a line-of-sight weapon with distance fade).
- Nuclear: show blast radius circle at target (no trajectory -- it reuses the existing missile code).
- Reuse the existing `simulateTrajectory()` infrastructure and scratch arrays.

**Detection:** FPS drop when weapon preview is active, especially with multiple weapons selected.

**Phase:** Weapon system phase.

---

### Pitfall 16: Enemy AI Gravity Integration Drift

**What goes wrong:** Enemies using simple Euler integration for orbital motion accumulate energy errors, causing orbits to spiral inward or outward over time. After 10+ waves, enemies have drifted significantly from their intended orbital bands.

**Prevention:**
- Use Verlet integration for enemy orbits (same as the player ship), which is symplectic and conserves energy long-term.
- Alternatively, for enemies on stable patrol orbits: compute their position analytically (`r*sin(omega*t + phase)`) and only switch to physics simulation when they are maneuvering (attacking, evading).
- Hybrid approach: "rail" orbits for passive enemies, physics for active combat.

**Detection:** Enemies bunching up near the black hole or drifting to infinity after many waves.

**Phase:** Enemy AI/movement phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Rendering pipeline setup | #2 (combat in ray march), #3 (per-entity draws), #5 (depth conflicts), #8 (state leaks), #13 (extension availability) | Design multi-pass pipeline with instancing from day one. Define GL state contract. |
| Enemy rendering | #3 (per-entity draws), #10 (LOD thrashing), #11 (buffer overrun) | Use instanced rendering, add LOD hysteresis, enforce capacity limits. |
| Enemy movement/AI | #4 (n-body for all entities), #9 (bullet time desync), #16 (integration drift) | BH-only gravity for enemies, unified simDt, Verlet or analytic orbits. |
| Wave spawning | #6 (GC spikes), #11 (buffer overrun) | Pre-allocated object pool, capacity enforcement in spawner. |
| Collision detection | #7 (O(n^2) scaling) | Radial bins from the start. |
| Weapon systems | #15 (preview performance), #9 (cooldown timing) | Preview only selected weapon, use simDt for all timers. |
| Tactical targeting mode | #12 (zoom-out quality), #14 (HUD overflow) | Cap camera distance, invest in UI overlays over shader beauty. |
| Shader integration | #1 (parameter contamination), #2 (combat in ray march) | Mode-gate ALL parameters, enforce architecture boundary. |

## Sources

- [Optimization history from this project](blackhole-shader-optimization.md) -- entries #10, #11, #12, #13, #14, #15 are directly relevant
- [Hover detection history from this project](hover-detection.md) -- demonstrates ray march architectural constraints
- [MDN WebGL Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) -- state management, draw call batching, buffer strategies
- [Emscripten WebGL Optimization Guide](https://emscripten.org/docs/optimizing/Optimizing-WebGL.html) -- buffer upload strategies, state change minimization
- [MDN ANGLE_instanced_arrays](https://developer.mozilla.org/en-US/docs/Web/API/ANGLE_instanced_arrays) -- WebGL 1.0 instancing extension
- [WebGL Fundamentals - Instanced Drawing](https://webglfundamentals.org/webgl/lessons/webgl-instanced-drawing.html) -- instancing patterns
- [Game Programming Patterns - Spatial Partition](https://gameprogrammingpatterns.com/spatial-partition.html) -- collision detection partitioning
- [TojiCode - WebGL instancing](https://blog.tojicode.com/2013/07/webgl-instancing-with.html) -- ANGLE_instanced_arrays practical usage
- [WebGL and Alpha / Transparency](https://webglfundamentals.org/webgl/lessons/webgl-and-alpha.html) -- depth buffer and blending interactions
- [William Henderson - GC in V8 with WebGL](https://whenderson.dev/blog/webgl-garbage-collection/) -- object pooling to avoid GC frame drops
- [KSP Forum - N-body CPU intensity](https://forum.kerbalspaceprogram.com/topic/82212-whats-so-cpu-intensive-about-n-body-physics/) -- gravity simplification strategies for games
