# Navigation Combat System

## What This Is

A tactical orbital combat game built into the existing WebGL black hole navigation mode. Players command a visible ship that transfers between orbits around the black hole, planets, and Lagrange points, engaging waves of enemy ships with four distinct weapon systems. Combat is tactical — zoom out to survey the field, assign weapons to targets, preview trajectories, and issue fire commands.

## Core Value

Tactical orbital combat that feels physically grounded — ship movement follows real transfer orbits, weapons obey momentum and fuel constraints, and the black hole's gravity shapes every engagement. Performance must stay at 30fps+ on mid-range discrete GPUs with 30-50 enemies on screen.

## Requirements

### Validated

- ✓ Orbital movement system — Phases 1-2
- ✓ Orbit altitude adjustment — Phase 2
- ✓ Visible player ship (third-person, camera follows) — Phase 2
- ✓ Kinetic shields — Phase 6
- ✓ Ship destruction with explosion and game over / restart flow — Phase 6
- ✓ Nuclear missile with volumetric explosion — Phase 4
- ✓ Regular missiles with sprite explosions, proximity detonation, fuel system — Phase 4
- ✓ Kinetic cannon (momentum-based, gravity-affected) — Phase 3
- ✓ Plasma gun (energy blast, distance fade) — Phase 3
- ✓ Tactical targeting mode (overlay, target selection, weapon assignment, salvo fire) — Phase 9
- ✓ Enemy ships with procedural shader geometry — Phase 1
- ✓ Kill-triggered wave spawning — Phase 7
- ✓ Boss waves every 10 waves — Phase 7
- ✓ Enemies fire projectiles with increasing difficulty — Phases 5, 7
- ✓ Difficulty scaling (count, aggression, accuracy, variety) — Phase 7
- ✓ HUD (hull, shields, weapons, wave counter, orbit info) — Phase 8
- ✓ Performance target: 30fps+ with 30-50 enemies — Phase 1

### Active

(All v1 requirements validated — see v2 requirements in REQUIREMENTS.md)

### Out of Scope

- Energy shields / force fields — shields are kinetic (physical objects), not energy barriers
- Free flight (WASD anywhere) — movement is orbital transfer-based, not free flight
- Multiplayer — single player only
- Mobile support for combat — existing nav mode already hidden on mobile
- Story/campaign mode — endless wave survival with boss milestones
- New planets or game links — combat is within existing navigation mode

## Context

- Built on existing WebGL black hole scene (`index.html`) with Verlet ray march shader
- Navigation mode already exists: ship spawning, thrust, trajectory preview, bullet time, missile salvos with proportional navigation guidance
- WASM module handles planet positions for planets 0-5; planet 6 computed in JS
- Detonation system: 6 shader slots for volumetric explosions (post ray-march, straight-line approximation)
- Fragment shader is the bottleneck — 250-iteration ray march on every pixel. All combat rendering must happen as separate GL geometry passes, NOT inside the ray march
- Noise LUT texture already replaces procedural vnoise3 calls
- Dynamic resolution scaling (`renderScale`) already exists and auto-adjusts
- Pre-allocated scratch arrays eliminate per-frame JS allocations
- Optimization history documented in `.claude/projects/.../memory/blackhole-shader-optimization.md` — 15 experiments, most failed to improve FPS. The ray march parameters are well-tuned; don't touch them

## Constraints

- **Tech stack**: Pure HTML/CSS/JS + WebGL 1.0 + existing WASM module — no frameworks, no npm, no build tools
- **Performance**: 30fps minimum on mid-range discrete GPU (GTX 1060 tier) with 30-50 enemies
- **Rendering architecture**: All combat elements (enemies, projectiles, explosions) rendered as separate GL geometry passes — never inside the ray march shader
- **Small explosions**: Screen-space billboard sprites (2D quads with animated texture), NOT volumetric shader
- **Volumetric explosions**: Reserved for nuclear missiles only, max 2-3 active simultaneously
- **Enemy rendering**: Instanced GL draw calls, LOD system (full geometry <50 units, billboard >50, skip >200)
- **Collision detection**: Radial bins (exploit orbital structure), not O(n²) pairwise
- **Gravity simplification**: Gravitational pull of space objects may be adjusted to make orbital transfers simpler to compute and more playable
- **Planet 6 (Mars)**: Always JS-computed, not in WASM memory layout
- **Backward compatibility**: Normal mode (non-nav) must remain unchanged — no shader parameter regressions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Orbital movement (not free flight) | Physically grounded feel, reduces control complexity, gravity shapes gameplay | ✓ Shipped — Phase 2 |
| Tactical targeting (zoom-out + assign) vs twitch aiming | Matches tactical sim feel, works with orbital scale of the scene | ✓ Shipped — Phase 9 |
| Kill-triggered waves (not timed) | Player controls pace, no pressure during orbital transfers | ✓ Shipped — Phase 7 |
| Small explosions as 2D sprites | Volumetric shader detonations too expensive at combat frequency; sprites are 1000x cheaper | ✓ Shipped — Phase 4 |
| Combat elements as separate GL passes | Ray march is the bottleneck; adding per-enemy checks inside it would destroy FPS | ✓ Shipped — Phase 1 |
| Kinetic shields (not energy) | Physical debris absorbing hits — more visually interesting and physically grounded | ✓ Shipped — Phase 6 |
| Instanced rendering for enemies | One draw call for all enemies via GL instancing, massive perf win over individual draw calls | ✓ Shipped — Phase 1 |
| Unified combat/tactical mode | Separate T key toggle was unnecessary friction; F key activates both simultaneously | ✓ Shipped — Phase 9 (CR1) |

---
*Last updated: 2026-03-14 after Phase 9 — v1.0 milestone complete*
