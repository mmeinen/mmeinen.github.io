# Requirements: Navigation Combat System

**Defined:** 2026-03-09
**Core Value:** Tactical orbital combat that feels physically grounded — ship movement follows real transfer orbits, weapons obey momentum and fuel constraints, and the black hole's gravity shapes every engagement.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Movement

- [x] **MOV-01**: Player can select any orbital body (black hole, 7 planets, Lagrange points) as an orbit target
- [x] **MOV-02**: Ship computes and flies a physically accurate transfer orbit to the selected body
- [x] **MOV-03**: Transfer trajectory is shown as a dotted/curved line during transit
- [x] **MOV-04**: Player can control thrust to adjust transit speed
- [x] **MOV-05**: Player can adjust orbit altitude once captured in orbit around a body
- [x] **MOV-06**: Player can orbit Lagrange points (L1-L5) between major bodies

### Weapons

- [x] **WPN-01**: Player can fire a kinetic cannon that launches a projectile carried by momentum with no guidance
- [x] **WPN-02**: Kinetic cannon rounds are affected by gravity (curve around gravity wells)
- [x] **WPN-03**: Player can fire a plasma gun that emits an energy blast toward a target
- [x] **WPN-04**: Plasma blasts fade over distance and have minimal gravity effect (light-based)
- [x] **WPN-05**: Player can fire regular missiles with proportional navigation guidance toward a target
- [x] **WPN-06**: Regular missiles detonate when within blast radius of their target (proximity detonation)
- [x] **WPN-07**: Regular missiles have a fuel supply that depletes during flight
- [x] **WPN-08**: Missiles self-destruct without detonation when fuel is exhausted and trajectory will not intersect target
- [x] **WPN-09**: Regular missile explosions are sprite-based (billboard), not volumetric
- [x] **WPN-10**: Player can fire nuclear missiles with existing volumetric detonation shader
- [x] **WPN-11**: Player can preview the predicted trajectory of a weapon before firing (gravity-affected path)

### Enemies

- [x] **ENM-01**: Grunt enemy archetype — medium speed, low HP, fires at player when in range (introduced wave 1)
- [ ] **ENM-02**: Swarm enemy archetype — fast, fragile, attacks in groups of 5-8 (introduced wave 3)
- [ ] **ENM-03**: Bomber enemy archetype — slow approach, fires high-damage missiles, dangerous if ignored (introduced wave 5)
- [ ] **ENM-04**: Sniper enemy archetype — stays at extreme range, fires accurate shots, low HP (introduced wave 8)
- [ ] **ENM-05**: Capital enemy archetype — large, slow, high HP, spawns Grunt minions as mini-boss (introduced wave 10+)
- [x] **ENM-06**: Enemies orbit bodies using orbital mechanics (not just flying straight at player)
- [ ] **ENM-07**: Kill-triggered wave spawning — clearing current wave triggers next wave
- [ ] **ENM-08**: Boss waves appear every N waves as special encounters
- [ ] **ENM-09**: Difficulty scales with wave number — increasing enemy count, aggression, accuracy, and archetype variety
- [x] **ENM-10**: Enemies fire projectiles at the player with accuracy that increases per wave
- [x] **ENM-11**: Enemy ships have procedural shader geometry visuals (not sprites)

### Defense

- [ ] **DEF-01**: Player ship has a hull integrity (HP) value displayed on HUD
- [ ] **DEF-02**: Player ship is destroyed with an explosion when hull reaches zero
- [ ] **DEF-03**: Game over screen shows stats (waves survived, enemies killed)
- [ ] **DEF-04**: Player can restart from game over screen
- [ ] **DEF-05**: Kinetic shields — physical debris objects positioned in front of the ship that absorb projectile hits
- [ ] **DEF-06**: Off-screen enemy indicators — chevrons at screen edge pointing toward enemies outside the viewport

### Targeting & HUD

- [ ] **HUD-01**: Weapon status panel showing all 4 weapons with selected weapon highlighted
- [ ] **HUD-02**: Wave counter displaying current wave number and enemies remaining
- [ ] **HUD-03**: Hull integrity bar displayed prominently
- [ ] **HUD-04**: Tactical zoom — player can zoom out to see entire black hole system with all enemies highlighted
- [ ] **HUD-05**: In tactical zoom, player can select targets on the orbital plane and assign weapons
- [ ] **HUD-06**: In tactical zoom, player can preview weapon assignment then issue fire command to launch salvo
- [ ] **HUD-07**: Orbit info display showing current orbital body, altitude, and transfer status

### Visual Effects

- [x] **VFX-01**: Hit flash on enemies when projectiles connect
- [x] **VFX-02**: Projectile impact particles at hit location
- [x] **VFX-03**: Sprite-based billboard explosions for regular combat (not volumetric)

### Performance

- [x] **PRF-01**: Maintains 30fps+ on GTX 1060 / RX 580 tier hardware with 30-50 enemies on screen
- [x] **PRF-02**: All combat elements (enemies, projectiles, explosions) rendered as separate GL geometry passes — never inside the ray march shader
- [x] **PRF-03**: Instanced rendering used for enemies and projectiles (ANGLE_instanced_arrays)
- [x] **PRF-04**: Radial bin collision detection (O(n), not O(n^2))

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Weapon Balance

- **WPN-12**: Cooldown timers for kinetic cannon and plasma gun
- **WPN-13**: Ammo count for regular missiles (limited supply per wave)
- **WPN-14**: Nuclear missiles gated by wave count (available every N waves)

### Visual Polish

- **VFX-04**: Screen shake when player takes damage
- **VFX-05**: Detailed death stats screen (kill breakdown by weapon, damage taken timeline)

### Enemy Behavior

- **ENM-12**: Enemies use gravity assists for evasive maneuvers
- **ENM-13**: Enemy formations pre-scripted per wave definition

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Free flight (WASD movement) | Breaks orbital mechanics differentiator; reduces space to "underwater airplane" |
| Energy shields / force fields | Generic; kinetic shields are more physically grounded and visually interesting |
| Crew management / subsystems | FTL-level complexity bloat for a browser portfolio game |
| Resource gathering / crafting | Wrong genre — breaks wave survival flow |
| Fleet command / multiple ships | Requires squad AI, formations, pathfinding — massive scope |
| Multiplayer / PvP | Requires server infrastructure; incompatible with static GitHub Pages |
| Upgrades between waves | Roguelite meta-loop is a huge design + UI undertaking |
| Minimap / radar overlay | Tactical zoom IS the minimap; separate radar duplicates information |
| Story / campaign / dialogue | Narrative requires writing, dialogue UI, mission structure, save states |
| Audio / sound effects | No audio system exists in the codebase; visual-only feedback |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MOV-01 | Phase 2 | Complete |
| MOV-02 | Phase 2 | Complete |
| MOV-03 | Phase 2 | Complete |
| MOV-04 | Phase 2 | Complete |
| MOV-05 | Phase 2 | Complete |
| MOV-06 | Phase 2 | Complete |
| WPN-01 | Phase 3 | Complete |
| WPN-02 | Phase 3 | Complete |
| WPN-03 | Phase 3 | Complete |
| WPN-04 | Phase 3 | Complete |
| WPN-05 | Phase 4 | Complete |
| WPN-06 | Phase 4 | Complete |
| WPN-07 | Phase 4 | Complete |
| WPN-08 | Phase 4 | Complete |
| WPN-09 | Phase 4 | Complete |
| WPN-10 | Phase 4 | Complete |
| WPN-11 | Phase 3 | Complete |
| ENM-01 | Phase 5 | Complete |
| ENM-02 | Phase 7 | Pending |
| ENM-03 | Phase 7 | Pending |
| ENM-04 | Phase 7 | Pending |
| ENM-05 | Phase 7 | Pending |
| ENM-06 | Phase 5 | Complete |
| ENM-07 | Phase 7 | Pending |
| ENM-08 | Phase 7 | Pending |
| ENM-09 | Phase 7 | Pending |
| ENM-10 | Phase 5 | Complete |
| ENM-11 | Phase 1 | Complete |
| DEF-01 | Phase 6 | Pending |
| DEF-02 | Phase 6 | Pending |
| DEF-03 | Phase 6 | Pending |
| DEF-04 | Phase 6 | Pending |
| DEF-05 | Phase 6 | Pending |
| DEF-06 | Phase 6 | Pending |
| HUD-01 | Phase 8 | Pending |
| HUD-02 | Phase 8 | Pending |
| HUD-03 | Phase 8 | Pending |
| HUD-04 | Phase 9 | Pending |
| HUD-05 | Phase 9 | Pending |
| HUD-06 | Phase 9 | Pending |
| HUD-07 | Phase 8 | Pending |
| VFX-01 | Phase 5 | Complete |
| VFX-02 | Phase 5 | Complete |
| VFX-03 | Phase 4 | Complete |
| PRF-01 | Phase 1 | Complete |
| PRF-02 | Phase 1 | Complete |
| PRF-03 | Phase 1 | Complete |
| PRF-04 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 after roadmap creation*
