# Navigation Combat System

## What This Is

A tactical orbital combat game built into the existing WebGL black hole navigation mode. Players command a visible ship that transfers between orbits around the black hole, planets, and Lagrange points, engaging waves of enemy ships with four distinct weapon systems. Combat is tactical — zoom out to survey the field, assign weapons to targets, preview trajectories, and issue fire commands.

## Core Value

Tactical orbital combat that feels physically grounded — ship movement follows real transfer orbits, weapons obey momentum and fuel constraints, and the black hole's gravity shapes every engagement. Performance must stay at 30fps+ on mid-range discrete GPUs with 30-50 enemies on screen.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Orbital movement system — select any body (black hole, 7 planets, Lagrange points) to orbit, ship computes and flies a physically accurate transfer orbit shown as a trajectory line, thrust controls transit speed
- [ ] Orbit altitude adjustment once captured in orbit around a body
- [ ] Visible player ship (third-person, camera follows)
- [ ] Kinetic shields — physical debris/armor objects in front of the ship that absorb projectile hits
- [ ] Ship destruction with explosion and game over / restart flow
- [ ] Nuclear missile (existing) — massive volumetric explosion, rare use
- [ ] Regular missiles — smaller sprite-based explosion, proximity detonation within blast radius, fuel system (self-destruct without detonation when fuel exhausted and off-target)
- [ ] Kinetic cannon — fires projectile carried by momentum, no guidance, gravity-affected
- [ ] Plasma gun — energy blast toward target, fades over distance, minimal gravity effect (light-based)
- [ ] Tactical targeting mode — zoomed-out view of entire black hole system, enemy ships highlighted, select targets on orbital plane, preview weapons, issue fire command to launch salvo
- [ ] Enemy ships with procedural shader geometry visuals
- [ ] Kill-triggered wave spawning — clear current wave to trigger next
- [ ] Boss waves every N waves (milestone encounters)
- [ ] Enemies fire projectiles at player with increasing difficulty per wave
- [ ] Difficulty scaling — enemy count, aggression, accuracy, and variety increase with waves
- [ ] HUD: ship hull integrity, kinetic shield status, weapon status (ammo/cooldowns/selected), wave counter (current wave + enemies remaining), orbit info (current orbit, altitude, transfer status)
- [ ] Performance target: 30fps+ on GTX 1060 / RX 580 tier hardware with 30-50 enemies

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
| Orbital movement (not free flight) | Physically grounded feel, reduces control complexity, gravity shapes gameplay | — Pending |
| Tactical targeting (zoom-out + assign) vs twitch aiming | Matches tactical sim feel, works with orbital scale of the scene | — Pending |
| Kill-triggered waves (not timed) | Player controls pace, no pressure during orbital transfers | — Pending |
| Small explosions as 2D sprites | Volumetric shader detonations too expensive at combat frequency; sprites are 1000x cheaper | — Pending |
| Combat elements as separate GL passes | Ray march is the bottleneck; adding per-enemy checks inside it would destroy FPS | — Pending |
| Kinetic shields (not energy) | Physical debris absorbing hits — more visually interesting and physically grounded | — Pending |
| Instanced rendering for enemies | One draw call for all enemies via GL instancing, massive perf win over individual draw calls | — Pending |

---
*Last updated: 2026-03-09 after initialization*
