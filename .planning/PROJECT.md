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

See REQUIREMENTS.md for v1.1 scope.

## Current Milestone: v1.1 Realistic Scale & Fleet Combat

**Goal:** Transform the scene from abstract game-units to kilometer-scale space, restructure enemies into tactical fleets, and separate navigation (radar) from combat (main viewport).

**Target features:**
- Realistic scale: BH 20,000 km, Jupiter 4,000 km, 50,000 km orbit spacing, 10 km player ship
- Time scale: Jupiter orbit in 60 seconds defines all velocities
- Fleet system: Structured enemy groups (max 3/wave), difficulty-scaling compositions
- Radar/orbital chart: Mini-map (bottom-left) expands to side panel (O key), all navigation here
- Warp speed: Spacebar toggles universal time acceleration for transit (max 30s transfers)
- Body collision: Anything hitting a planet/BH is destroyed; player prevented from collision
- World boundary: Invisible fence beyond outermost orbit
- LOD rendering: Far planets as 2D billboards; BH rendering tuned for close-up dominance
- Viewport cleanup: Main 3D view is pure combat, no orbit visuals

### Out of Scope

- Energy shields / force fields — shields are kinetic (physical objects), not energy barriers
- Free flight (WASD anywhere) — movement is orbital transfer-based, not free flight
- Multiplayer — single player only
- Mobile support for combat — existing nav mode already hidden on mobile
- Story/campaign mode — endless wave survival with boss milestones
- New planets or game links — combat is within existing navigation mode

## Context

**Shipped v1.0** with ~3,400 LOC across 7 combat modules (combat.js, orbital.js, weapons.js, missiles.js, particles.js, waves.js, explosions.js) plus HUD and shader additions.

**Tech stack:** Pure HTML/CSS/JS + WebGL 1.0 + WASM. No frameworks, no npm, no build tools.

**Architecture:**
- WebGL black hole scene (`index.html`) with Verlet ray march shader (250-iteration bottleneck)
- All combat rendering as separate GL geometry passes after ray march (never inside it)
- Instanced rendering via ANGLE_instanced_arrays for enemies + projectiles
- SoA typed-array entity stores with free-list allocation for all combat entities
- Radial bin collision detection exploiting orbital structure
- 5 enemy archetypes with distinct procedural geometry and AI state machines
- Billboard explosion system for regular combat; volumetric shader reserved for nuclear missiles
- WASM handles planet positions 0-5; planet 6 (Mars) computed in JS

**Performance:** 30fps+ with 50 enemies on mid-range discrete GPU (GTX 1060 tier). Dynamic resolution scaling auto-adjusts.

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
| SoA typed arrays (not AoS objects) | Cache-friendly iteration, zero GC pressure, O(1) free-list allocation | ✓ Good — all phases |
| Multi-geometry instanced rendering | One shared instance buffer, per-archetype byte offsets, minimal draw calls | ✓ Good — Phase 7 |
| BH-only gravity for enemies/projectiles | Full N-body too expensive; BH dominates anyway at orbital scale | ✓ Good — Phase 1 |

---
*Last updated: 2026-03-15 after v1.1 milestone started*
