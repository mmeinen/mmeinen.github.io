# Roadmap: Navigation Combat System

## Overview

Transform the existing WebGL black hole navigation mode into a tactical orbital combat game. The build follows a strict dependency chain: rendering infrastructure first (enemies must exist before they can move), then player movement and weapons (must shoot before being shot), then enemy combat and survival mechanics, and finally wave progression, HUD, and the tactical targeting system that ties it all together. Each phase delivers a testable increment -- the game is playable (if incomplete) after Phase 5.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Combat Rendering Foundation** - Entity stores, instanced rendering pipeline, radial collision bins, and enemy procedural geometry
- [x] **Phase 2: Player Ship & Orbital Movement** - Visible ship with orbital transfers between bodies, trajectory preview, thrust and altitude control
- [x] **Phase 3: Direct-Fire Weapons** - Kinetic cannon with gravity-curved projectiles and plasma gun with distance fade, plus trajectory preview (completed 2026-03-10)
- [x] **Phase 4: Missile Systems & Explosions** - Guided regular missiles with fuel and proximity detonation, nuclear missiles, sprite billboard explosion renderer (completed 2026-03-11)
- [x] **Phase 5: Enemy Behavior & Combat Feedback** - Grunt archetype with orbital AI, enemy weapons firing at player, hit flash and impact particles (completed 2026-03-11)
- [x] **Phase 6: Player Defense & Survival** - Hull integrity, kinetic shields, ship destruction, game over with stats, restart flow, off-screen indicators (completed 2026-03-11)
- [x] **Phase 7: Wave Progression & Enemy Variety** - Kill-triggered waves, 4 additional enemy archetypes, boss waves, difficulty scaling (completed 2026-03-14)
- [ ] **Phase 8: Combat HUD** - Weapon status panel, wave counter, hull integrity bar, orbit info display
- [ ] **Phase 9: Tactical Targeting System** - Zoomed-out strategic view with target selection, weapon assignment, and fire command

## Phase Details

### Phase 1: Combat Rendering Foundation
**Goal**: Combat entities can be stored, created, removed, and drawn at 30fps+ using instanced rendering -- the architectural foundation every other phase builds on
**Depends on**: Nothing (first phase)
**Requirements**: PRF-01, PRF-02, PRF-03, PRF-04, ENM-11
**Success Criteria** (what must be TRUE):
  1. 50 placeholder enemy entities render on screen simultaneously at 30fps+ without affecting the ray march shader
  2. All combat entities (enemies, projectiles) are rendered as separate GL geometry passes composited after the ray march -- never inside it
  3. Enemy ships display procedural shader geometry (not sprites or flat quads) via the instanced enemy shader program
  4. A radial bin spatial structure accepts entity positions and returns candidate collision pairs in O(n) time
  5. The existing black hole scene (normal non-nav mode) renders identically -- no shader parameter regressions
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md -- Combat data layer: entity store, radial bins, Grunt geometry, enemy shaders
- [x] 01-02-PLAN.md -- Rendering integration: wire enemyPg into index.html, spawn 50 test enemies, Wave 0 regression tests

### Phase 2: Player Ship & Orbital Movement
**Goal**: Player commands a visible ship that transfers between any orbital body using physically-grounded trajectories, with full control over thrust and orbit altitude
**Depends on**: Phase 1
**Requirements**: MOV-01, MOV-02, MOV-03, MOV-04, MOV-05, MOV-06
**Success Criteria** (what must be TRUE):
  1. Player can click any orbital body (black hole, all 7 planets, Lagrange points) and the ship computes and flies a transfer orbit to it
  2. A dotted/curved trajectory line is visible during transit showing the ship's predicted path
  3. Player can increase or decrease thrust during transit to control transfer speed
  4. Once captured in orbit, player can raise or lower orbit altitude around the current body
  5. Player can select and orbit Lagrange points (L1-L5) between major bodies as valid destinations
**Plans:** 3 plans

Plans:
- [ ] 02-01-PLAN.md -- Orbital mechanics module (orbital.js), capital ship geometry, engine glow shader
- [ ] 02-02-PLAN.md -- Orbit state machine, transfer orbit execution, click-to-target, trajectory preview, altitude control
- [ ] 02-03-PLAN.md -- Lagrange point markers and orbiting, CSS polish, regression tests, visual verification

### Phase 3: Direct-Fire Weapons
**Goal**: Player can engage enemies with two distinct direct-fire weapons -- a gravity-affected kinetic cannon and a light-speed plasma gun -- and preview trajectories before firing
**Depends on**: Phase 1, Phase 2
**Requirements**: WPN-01, WPN-02, WPN-03, WPN-04, WPN-11
**Success Criteria** (what must be TRUE):
  1. Player can fire the kinetic cannon and its projectile travels on a momentum-based trajectory that visibly curves around gravity wells
  2. Player can fire the plasma gun and its energy blast travels toward a target, fading over distance with minimal gravity deflection
  3. Before firing either weapon, the player can see a predicted trajectory line showing where the projectile will go (accounting for gravity)
  4. Kinetic rounds and plasma blasts that reach an enemy position register as hits (damage applied in Phase 6)
**Plans:** 2/2 plans complete

Plans:
- [x] 03-01-PLAN.md -- Weapons module (weapons.js): projectile SoA store, kinetic/plasma firing logic, physics update, hit detection, combat mode toggle and input integration
- [x] 03-02-PLAN.md -- Projectile rendering (kinetic tracers with trails, plasma glow bolts), trajectory preview with hit prediction, visual verification

### Phase 4: Missile Systems & Explosions
**Goal**: Player has two missile types -- guided regular missiles with fuel constraints and proximity detonation, and nuclear missiles with volumetric explosions -- plus a sprite-based explosion renderer for all non-nuclear combat detonations
**Depends on**: Phase 1, Phase 3
**Requirements**: WPN-05, WPN-06, WPN-07, WPN-08, WPN-09, WPN-10, VFX-03
**Success Criteria** (what must be TRUE):
  1. Player can fire regular missiles that guide toward a target using proportional navigation
  2. Regular missiles detonate when within blast radius of their target (proximity fuse), producing a sprite-based billboard explosion
  3. Regular missiles consume fuel during flight and self-destruct without detonation when fuel is exhausted and trajectory will miss the target
  4. Player can fire nuclear missiles that produce the existing volumetric shader detonation effect
  5. Sprite billboard explosions render correctly at various distances and camera angles for all non-nuclear combat detonations
**Plans:** 3/3 plans complete

Plans:
- [x] 04-01-PLAN.md -- Missile SoA store, lock-on targeting with multi-lock salvo, fuel depletion, PN guidance with enemy tracking, weapon slots 3/4
- [x] 04-02-PLAN.md -- Billboard explosion system: procedural sprite sheet, billboard shaders, explosion SoA store with instanced rendering
- [x] 04-03-PLAN.md -- Rendering integration: missile bodies/trails, proximity detonation wiring (sprite + volumetric), lock reticle overlays, visual verification

### Phase 5: Enemy Behavior & Combat Feedback
**Goal**: Enemies are alive -- Grunt enemies orbit bodies, approach the player, fire projectiles, and provide clear visual feedback when hit
**Depends on**: Phase 1, Phase 2
**Requirements**: ENM-01, ENM-06, ENM-10, VFX-01, VFX-02
**Success Criteria** (what must be TRUE):
  1. Grunt enemies orbit bodies using orbital mechanics (circular orbits, not straight-line flight)
  2. Grunt enemies fire projectiles at the player when in range with accuracy that can be tuned per difficulty
  3. When a projectile hits an enemy, the enemy flashes visibly to confirm the hit
  4. Projectile impacts produce visible particle effects at the hit location
**Plans:** 2/2 plans complete

Plans:
- [x] 05-01-PLAN.md -- Enemy AI state machine (idle/alert/transfer/attack/disengage/re-orbit), instance buffer extension (9->10 floats for flash), enemy firing with lead prediction, shader flash support
- [x] 05-02-PLAN.md -- Impact particle system (particles.js), combat feedback wiring (sparks on hit, explosion on missile hit), visual verification

### Phase 6: Player Defense & Survival
**Goal**: Player can take damage, defend with kinetic shields, and experience a complete death-and-restart loop with stats tracking
**Depends on**: Phase 5
**Requirements**: DEF-01, DEF-02, DEF-03, DEF-04, DEF-05, DEF-06
**Success Criteria** (what must be TRUE):
  1. Player ship has a hull integrity value that decreases when hit by enemy projectiles
  2. Kinetic shields (physical debris objects in front of the ship) absorb incoming projectile hits before they reach the hull
  3. When hull integrity reaches zero, the ship is destroyed with a visible explosion
  4. A game over screen appears showing combat stats (waves survived, enemies killed) with a restart option
  5. Off-screen enemy indicators (chevrons at screen edge) point toward enemies outside the viewport
**Plans:** 3/3 plans complete

Plans:
- [x] 06-01-PLAN.md -- Player state (250 HP), shield SoA (10 pieces), shield rendering, damage wiring with shield-before-hull collision, vignette overlay, HP bar, stat tracking hooks
- [x] 06-02-PLAN.md -- Multi-stage death sequence (flicker/breakup/detonation), camera pull-out, game over screen with stats and localStorage high scores, restart flow (R key), exit flow (Escape)
- [x] 06-03-PLAN.md -- Off-screen enemy indicators (DOM chevrons at viewport edges with distance readout), visual verification of complete Phase 6

### Phase 7: Wave Progression & Enemy Variety
**Goal**: Combat is a wave-based survival challenge with 5 distinct enemy archetypes, boss encounters, and scaling difficulty that keeps every wave interesting
**Depends on**: Phase 5, Phase 6
**Requirements**: ENM-02, ENM-03, ENM-04, ENM-05, ENM-07, ENM-08, ENM-09
**Success Criteria** (what must be TRUE):
  1. Clearing all enemies in a wave triggers the next wave to spawn (kill-triggered, not timed)
  2. Four additional enemy archetypes appear at their introduction waves: Swarm (wave 3), Bomber (wave 5), Sniper (wave 8), Capital (wave 10+)
  3. Boss waves appear every N waves as special encounters with distinct challenge
  4. Each successive wave increases in difficulty: more enemies, higher accuracy, greater aggression, and more archetype variety
  5. Capital enemies spawn Grunt minions as a mini-boss mechanic
**Plans:** 3/3 plans complete

Plans:
- [ ] 07-01-PLAN.md -- Wave system foundation: ETYPE extension (5 archetypes), 4 new geometry functions, multi-geometry instanced rendering, wave state machine (waves.js), wave announcement, indicator colors
- [ ] 07-02-PLAN.md -- Swarm and Bomber archetypes: converging rush + ram damage AI, missile salvo AI, enemy-fired missiles in missiles.js
- [ ] 07-03-PLAN.md -- Sniper and Capital archetypes: burst fire AI, minion-spawning AI, boss wave logic, Capital warp-in VFX, visual verification

### Phase 8: Combat HUD
**Goal**: Player has full situational awareness through a combat HUD showing weapon readiness, wave status, hull condition, and current orbit
**Depends on**: Phase 3, Phase 6, Phase 7
**Requirements**: HUD-01, HUD-02, HUD-03, HUD-07
**Success Criteria** (what must be TRUE):
  1. A weapon status panel displays all 4 weapons with the currently selected weapon highlighted
  2. A wave counter shows the current wave number and number of enemies remaining
  3. A hull integrity bar is prominently displayed and updates in real-time as the player takes damage
  4. Orbit info display shows the current orbital body, altitude, and transfer status
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

### Phase 9: Tactical Targeting System
**Goal**: Player can zoom out to survey the entire battlefield, select targets on the orbital plane, assign weapons, and issue fire commands for coordinated salvos
**Depends on**: Phase 3, Phase 4, Phase 8
**Requirements**: HUD-04, HUD-05, HUD-06
**Success Criteria** (what must be TRUE):
  1. Player can activate tactical zoom to see the entire black hole system with all enemies highlighted
  2. In tactical zoom, player can select individual enemies as targets on the orbital plane
  3. Player can assign specific weapons to selected targets and preview the predicted engagement
  4. Player can issue a fire command that launches the assigned weapons as a coordinated salvo
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Combat Rendering Foundation | 2/2 | Complete | 2026-03-10 |
| 2. Player Ship & Orbital Movement | 3/3 | Complete | 2026-03-10 |
| 3. Direct-Fire Weapons | 2/2 | Complete   | 2026-03-10 |
| 4. Missile Systems & Explosions | 3/3 | Complete   | 2026-03-11 |
| 5. Enemy Behavior & Combat Feedback | 2/2 | Complete   | 2026-03-11 |
| 6. Player Defense & Survival | 3/3 | Complete   | 2026-03-11 |
| 7. Wave Progression & Enemy Variety | 3/3 | Complete   | 2026-03-14 |
| 8. Combat HUD | 0/2 | Not started | - |
| 9. Tactical Targeting System | 0/2 | Not started | - |
