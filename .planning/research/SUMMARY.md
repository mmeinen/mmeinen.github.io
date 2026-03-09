# Project Research Summary

**Project:** Navigation Combat System
**Domain:** WebGL tactical orbital combat layered on existing black hole scene
**Researched:** 2026-03-09
**Confidence:** HIGH

## Executive Summary

This project adds a wave-based tactical combat system to an existing WebGL 1.0 black hole scene rendered via a fullscreen ray march shader. The existing codebase already has orbital mechanics (Verlet integration, N-body gravity), a ship with missile system, dynamic resolution scaling, and a 3-shader pipeline. The combat system introduces 30-50 instanced enemy ships, 4 weapon types (kinetic cannon, plasma gun, regular missile, nuclear missile), particle effects, collision detection, and wave progression. The recommended approach uses WebGL 1.0 universal extensions (ANGLE_instanced_arrays, OES_vertex_array_object) for instanced rendering, struct-of-arrays entity pools for zero-GC state management, and radial bin spatial partitioning tuned to the orbital geometry of the scene.

The defining differentiator is that combat happens in orbital space -- movement uses orbital transfers, not WASD free flight, and kinetic cannon rounds curve under the black hole's gravity. This makes positioning inherently strategic and gives the game an identity no other browser game has. The architecture must respect one hard constraint: the ray march shader consumes 20-28ms of the 33ms frame budget at 30fps. All combat rendering, physics, AI, and collision must fit in the remaining 5-10ms. Instanced rendering (1-2 draw calls for all enemies, not 50 individual calls) is non-negotiable, as is keeping all combat visuals out of the ray march loop.

The top risks are: accidentally contaminating ray march shader parameters with combat-mode values (has already happened once during nav mode development, causing 27-111% iteration increases), using per-entity draw calls instead of instancing (the existing missile code does this and it will not scale), and N-body gravity for every combat entity when black-hole-only gravity is sufficient. All three are preventable through architectural decisions made before implementation begins.

## Key Findings

### Recommended Stack

The combat system builds entirely on WebGL 1.0 with three universal extensions. No new frameworks, libraries, or build tools are needed -- this aligns with the project's zero-dependency constraint. All state management uses pre-allocated typed arrays matching the existing scratch buffer pattern. See [STACK.md](STACK.md) for full details.

**Core technologies:**
- **ANGLE_instanced_arrays**: Render 30-50 enemies in 1-2 draw calls instead of 50 individual calls -- universal WebGL 1.0 extension, the single most important performance decision
- **OES_vertex_array_object**: Snapshot vertex attribute state for fast switching between 4-6 render passes -- eliminates per-frame attribute rebinding overhead
- **Struct-of-arrays entity pools**: Pre-allocated Float32Array pools for enemies, projectiles, explosions -- zero GC, cache-friendly, uploads directly to GL buffers
- **Radial bin spatial partitioning**: Collision detection using concentric orbital rings instead of Cartesian grids -- matches the game's orbital geometry, reduces pair checks from ~1225 to ~648

**What NOT to use:** WebGL 2.0 (would require full shader rewrite), Three.js/Babylon (violates no-framework constraint), physics libraries (custom orbital gravity already exists), Web Workers (800 entities is trivially fast in a single thread), gl_PointSize for particles (hardware-capped at 63px on some GPUs).

### Expected Features

See [FEATURES.md](FEATURES.md) for the full feature landscape with dependency graph.

**Must have (table stakes):**
- 4 weapon types with distinct tradeoffs (kinetic, plasma, missile, nuclear)
- Weapon cooldowns and ammo management
- Target selection and weapon assignment (the defining mechanic of tactical combat)
- Visual damage feedback (hit flash, impact particles, health bar changes)
- Hull integrity display and death/restart flow
- 3+ enemy archetypes (Grunt, Bomber, Swarm at minimum)
- Wave progression with difficulty scaling
- Weapon status HUD (selected weapon, cooldowns, ammo)

**Should have (differentiators):**
- Orbital transfer movement (the single biggest differentiator -- no other combat game does this)
- Gravity-affected projectiles (kinetic rounds curving around the black hole)
- Trajectory preview before firing (pool-game guide line in orbital space)
- Tactical zoom-out with strategic overview
- Kinetic shields as physical debris objects (not generic energy barriers)
- Boss waves with multi-phase encounters

**Defer indefinitely:**
- Free flight / WASD movement (destroys the orbital identity)
- Crew management / subsystems (wrong scope for a portfolio game)
- Resource gathering / crafting (wrong genre)
- Multiplayer (incompatible with static GitHub Pages)
- Upgrade/progression between waves (scope trap)

### Architecture Approach

The combat system is a sub-mode of nav mode, activated by keypress. It adds ~12 new JS modules under `js/scene/` using global scope (matching the existing pattern). The update loop follows a strict 8-phase order: Input, Spawn, AI, Physics, Collision, Damage, Cleanup, Render. All rendering happens in separate GL passes AFTER the ray march, composited via depth buffer clear. Two new shader programs are needed (instanced geometry for enemies, billboard sprites for explosions), while existing programs are reused for projectiles and trajectories. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system diagram and data flow.

**Major components:**
1. **Entity Store** -- SoA typed arrays for enemies (64 max), projectiles (256 max), explosions (32 max), shields (8 max)
2. **Rendering Pipeline** -- 2 new shader programs (enemyPg, spritePg), instanced draw calls, LOD system with 3 tiers
3. **Collision System** -- 8 radial bins (15 world units wide), sphere-sphere narrow phase
4. **Wave Spawner** -- Kill-triggered progression, difficulty scaling via enemy count/type/accuracy
5. **Weapon Controller** -- 4 weapon types with independent cooldowns, ammo tracking, fire commands
6. **Enemy AI** -- Simple state machine (orbit/attack/flee) per archetype, BH-only gravity

### Critical Pitfalls

See [PITFALLS.md](PITFALLS.md) for all 16 pitfalls with detection and prevention strategies.

1. **Shader parameter contamination** -- Combat mode parameters applied unconditionally to the ray march cause 30-50% FPS drops in normal mode. Prevention: mode-gate every parameter with uniforms, capture iteration baselines before changes.
2. **Combat rendering in ray march loop** -- Adding enemy checks inside the 250-iteration loop is catastrophic (500M extra operations/frame). Prevention: enforce architectural boundary -- all combat is separate GL passes.
3. **Per-entity draw calls** -- 50 individual draw calls collapse WebGL performance. Prevention: ANGLE_instanced_arrays from day one, never per-object drawElements.
4. **N-body gravity for all entities** -- Full 8-source gravity for 70 entities wastes CPU. Prevention: BH-only gravity for enemies/projectiles, full N-body only for player.
5. **Depth buffer conflicts** -- Transparent effects with depth writes create visual holes. Prevention: opaque geometry first (depth write on), transparent effects second (depth write off, back-to-front sort).
6. **GC spikes on wave spawn** -- Creating 50 enemy objects at once causes frame hitches. Prevention: pre-allocated object pools, swap-remove deletion.

## Implications for Roadmap

Based on research, the build order follows a strict dependency chain. Each phase produces a testable increment. The critical path is: entity store -> rendering -> motion -> weapons -> collision -> damage -> waves.

### Phase 1: Combat Foundation
**Rationale:** Everything depends on having entities that can be stored, created, removed, and drawn. Instanced rendering must be established first because retrofitting it later is a rewrite.
**Delivers:** Entity store (SoA arrays), enemy instanced renderer (box geometry), ANGLE_instanced_arrays + VAO setup, GL state contract for combat passes
**Addresses:** Enemy rendering (table stakes), instanced batching architecture
**Avoids:** Pitfall #3 (per-entity draw calls), #5 (depth conflicts), #8 (GL state leaks), #13 (extension availability)

### Phase 2: Enemy Motion and AI
**Rationale:** Enemies must move before they can be shot. Orbital motion and basic AI state machine make the scene feel alive.
**Delivers:** BH-only gravity integration for enemies, circular orbit motion, basic AI (orbit/approach states), enemy spawner (static, no waves yet), LOD system with hysteresis
**Addresses:** Enemy variety setup (table stakes), orbital movement foundation (differentiator)
**Avoids:** Pitfall #4 (N-body for all entities), #9 (bullet time desync), #10 (LOD thrashing), #16 (integration drift)

### Phase 3: Player Weapons and Projectiles
**Rationale:** A game where you can shoot but not be shot is playable for testing. Weapons require projectile physics, collision detection, and damage -- three interdependent systems that must ship together.
**Delivers:** 4 weapon types (kinetic, plasma, missile, nuclear), projectile renderer (instanced points), radial bin collision system, damage and death for enemies, weapon cooldowns and ammo
**Addresses:** Multiple weapon types (table stakes), cooldowns/ammo (table stakes), gravity-affected projectiles (differentiator)
**Avoids:** Pitfall #7 (O(n^2) collision), #11 (buffer overrun), #15 (preview performance)

### Phase 4: Visual Feedback and Explosions
**Rationale:** Combat without feedback feels broken. This phase makes hits feel impactful.
**Delivers:** Sprite billboard renderer (explosions), hit flash on enemies, impact particles, screen shake on player hit, ship destruction animation
**Addresses:** Visual damage feedback (table stakes), death effects (table stakes)
**Avoids:** Pitfall #5 (depth conflicts with transparent sprites), #6 (GC spikes from particle allocation)

### Phase 5: Enemy Combat (Enemies Fight Back)
**Rationale:** The game becomes a real survival challenge. Enemy weapons, player damage, and shields create the core survival loop.
**Delivers:** Enemy weapon firing, player hull damage, kinetic shield objects, ship destruction + game over screen, restart flow
**Addresses:** Shield/defense system (table stakes), health/hull display (table stakes), death and restart (table stakes), kinetic shields (differentiator)
**Avoids:** Pitfall #9 (bullet time desync for enemy weapons)

### Phase 6: Waves, Progression, and HUD
**Rationale:** Wave progression is a meta-system over the core combat loop. It only makes sense after combat is fully functional.
**Delivers:** Kill-triggered wave spawner, difficulty scaling (count, types, accuracy), 3 enemy archetypes (Grunt, Bomber, Swarm), full combat HUD (hull, shields, ammo, wave counter, weapon status), wave counter display
**Addresses:** Wave progression (table stakes), enemy variety (table stakes), weapon status HUD (table stakes), wave/enemy counter (table stakes)
**Avoids:** Pitfall #6 (GC on wave spawn), #11 (buffer overrun from spawner), #14 (HUD overflow)

### Phase 7: Tactical Targeting and Polish
**Rationale:** Tactical zoom and target assignment are high-value differentiators but depend on all combat systems being functional first. Boss waves add endgame depth.
**Delivers:** Tactical zoom-out view, target selection UI, weapon assignment to targets, trajectory preview for weapons, boss waves (every N waves), 2 more enemy archetypes (Sniper, Capital), death stats screen, off-screen enemy indicators
**Addresses:** Target selection (table stakes), tactical zoom (differentiator), trajectory preview (differentiator), boss waves (differentiator)
**Avoids:** Pitfall #12 (tactical zoom exposing ray march quality issues)

### Phase Ordering Rationale

- Phases 1-3 form the minimum playable combat: enemies exist, move, and die when shot. This is testable at each step.
- Phase 4 (visual feedback) is separated from Phase 3 (weapons/collision) because the mechanics must work before the polish can be tested.
- Phase 5 (enemy combat) before Phase 6 (waves) because wave difficulty is meaningless if enemies cannot fight back.
- Phase 7 (tactical targeting) is last because it is the most complex UI/UX system and the game is fully playable without it -- tactical zoom is a differentiator, not table stakes.
- Orbital transfer movement (the biggest differentiator) is NOT a separate phase -- the existing nav mode already provides orbital movement. Combat phases use the existing system and extend it incrementally.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Instanced rendering setup with VAOs requires careful attribute binding. The STACK.md code samples are solid but integration with the existing 3-pass pipeline needs hands-on prototyping.
- **Phase 3:** Radial bin collision system is a custom spatial partitioning approach. Bin boundaries and performance need profiling with actual entity counts.
- **Phase 7:** Tactical zoom camera distance limits and UI overlay design need experimentation. The ray march degrades at extreme zoom distances.

Phases with standard patterns (skip deep research):
- **Phase 2:** Enemy AI state machines and circular orbit motion are well-documented game patterns.
- **Phase 4:** Billboard sprite rendering and particle effects are standard WebGL techniques.
- **Phase 5:** Enemy weapons reuse projectile systems from Phase 3. Player damage is straightforward hull decrement.
- **Phase 6:** Wave spawning is a simple state machine with data-driven difficulty tables.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | WebGL 1.0 extensions confirmed universal by MDN. Instanced rendering pattern verified across 4+ authoritative sources. No new dependencies needed. |
| Features | HIGH | Feature landscape grounded in 5+ reference games (FTL, Homeworld, Endless Space 2, etc.). Weapon-enemy interaction matrix ensures balanced tactical depth. Anti-features list is decisive. |
| Architecture | HIGH | Architecture builds directly on existing codebase patterns (SoA arrays, scratch buffers, multi-pass rendering). Build order derived from concrete dependencies. File organization follows existing conventions. |
| Pitfalls | HIGH | 6 critical pitfalls identified, 3 of which are backed by this project's own optimization history (shader contamination, register pressure, GC behavior). Prevention strategies are specific and testable. |

**Overall confidence:** HIGH

The high confidence comes from three factors: (1) the technology is well-understood WebGL 1.0 with universal extensions, not bleeding-edge APIs; (2) the architecture extends an existing working system rather than building from scratch; (3) multiple pitfalls were discovered through this project's own history, making prevention strategies battle-tested.

### Gaps to Address

- **Particle budgets:** The per-explosion particle counts (20-60 particles) and total pool size (512) are estimates. Need profiling on target hardware (GTX 1060 tier) to validate they fit in the ~5ms combat budget.
- **Texture assets:** Explosion sprite sheets, plasma glow, and engine trail textures are specified but not created. Procedural shader-only effects may suffice for v1 (the existing ship uses flat color + Lambertian lighting with no textures).
- **Enemy archetype balance:** The weapon-enemy interaction matrix is theoretically sound but untested. Wave difficulty scaling parameters (enemy count per wave, accuracy ramp) need gameplay tuning.
- **Tactical zoom camera limits:** The maximum camDist for tactical mode needs empirical testing. The ray march produces visual artifacts at extreme distances, and the threshold is unknown until tested.
- **Performance on lower-end hardware:** All performance estimates target GTX 1060. Mobile GPUs and integrated graphics have not been profiled. Dynamic resolution scaling provides a safety valve, but combat JS overhead (physics + collision + AI) has no equivalent fallback.

## Sources

### Primary (HIGH confidence)
- [MDN: ANGLE_instanced_arrays](https://developer.mozilla.org/en-US/docs/Web/API/ANGLE_instanced_arrays) -- Extension API, universal availability confirmation
- [MDN: WebGL Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) -- State management, draw call batching, universal extensions list
- [MDN: OES_vertex_array_object](https://developer.mozilla.org/en-US/docs/Web/API/OES_vertex_array_object) -- VAO extension API
- [MDN: Anatomy of a Video Game](https://developer.mozilla.org/en-US/docs/Games/Anatomy) -- Game loop architecture
- [WebGL Fundamentals: Instanced Drawing](https://webglfundamentals.org/webgl/lessons/webgl-instanced-drawing.html) -- Instancing patterns
- [Game Programming Patterns: Spatial Partition](https://gameprogrammingpatterns.com/spatial-partition.html) -- Collision detection theory
- [Game Programming Patterns: Object Pool](https://gameprogrammingpatterns.com/object-pool.html) -- Pool pattern for zero-GC
- [Khronos: ANGLE_instanced_arrays Specification](https://registry.khronos.org/webgl/extensions/ANGLE_instanced_arrays/) -- Official spec

### Secondary (MEDIUM confidence)
- [FTL Weapons Wiki](https://ftl.fandom.com/wiki/Weapons) -- Weapon category design reference
- [Enemy Design - Level Design Book](https://book.leveldesignbook.com/process/combat/enemy) -- 6 enemy archetypes framework
- [Chinedufn: WebGL Billboard Tutorial](https://www.chinedufn.com/webgl-particle-effect-billboard-tutorial/) -- Billboard particle technique
- [TojiCode: WebGL Instancing](https://blog.tojicode.com/2013/07/webgl-instancing-with.html) -- Practical instancing examples
- [Emscripten WebGL Optimization](https://emscripten.org/docs/optimizing/Optimizing-WebGL.html) -- Buffer upload strategies

### Tertiary (LOW confidence)
- Particle budgets and performance estimates -- need validation through profiling
- Radial bin boundary values (15 world units per bin, 8 bins) -- need tuning with real entity distributions

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
