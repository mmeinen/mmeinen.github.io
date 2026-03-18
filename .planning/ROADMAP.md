# Roadmap: Navigation Combat System

## Milestones

- ✅ **v1.0 Navigation Combat System** — Phases 1-9 (shipped 2026-03-15)
- **v1.1 Realistic Scale & Fleet Combat** — Phases 10-16 (in progress)

## Phases

<details>
<summary>v1.0 Navigation Combat System (Phases 1-9) -- SHIPPED 2026-03-15</summary>

- [x] Phase 1: Combat Rendering Foundation (2/2 plans) — completed 2026-03-10
- [x] Phase 2: Player Ship & Orbital Movement (3/3 plans) — completed 2026-03-10
- [x] Phase 3: Direct-Fire Weapons (2/2 plans) — completed 2026-03-10
- [x] Phase 4: Missile Systems & Explosions (3/3 plans) — completed 2026-03-11
- [x] Phase 5: Enemy Behavior & Combat Feedback (2/2 plans) — completed 2026-03-11
- [x] Phase 6: Player Defense & Survival (3/3 plans) — completed 2026-03-11
- [x] Phase 7: Wave Progression & Enemy Variety (3/3 plans) — completed 2026-03-14
- [x] Phase 8: Combat HUD (1/1 plan) — completed 2026-03-14
- [x] Phase 9: Tactical Targeting System (2/2 plans) — completed 2026-03-14

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### v1.1 Realistic Scale & Fleet Combat

**Milestone Goal:** Transform the scene from abstract game-units to kilometer-scale space, restructure enemies into tactical fleets, and separate navigation (radar) from combat (main viewport).

- [x] **Phase 10: Scale Foundation** — km coordinate system, CRR, log depth buffer, collision bins, time anchor
- [x] **Phase 11: Simulation Rescaling & Viewport Cleanup** — All physics modules operating in km, viewport purified for combat, BH close-up tuning (completed 2026-03-18)
- [ ] **Phase 12: Body Collision & World Boundary** — Kill zones on planets/BH, player protection, world boundary fence
- [ ] **Phase 13: Fleet Composition System** — Structured fleet spawning with roles, anchor orbiting, HUD announcements
- [ ] **Phase 14: Warp Speed** — Time acceleration toggle, proximity locks, projectile suspension
- [ ] **Phase 15: Radar System** — Mini-map and expanded panel with orbit navigation
- [ ] **Phase 16: LOD & Visual Polish** — Planet billboard rendering, distance-based 3D transitions

## Phase Details

### Phase 10: Scale Foundation
**Goal**: Scene operates in physically realistic km-scale coordinates without precision artifacts or regressions
**Depends on**: Phase 9 (v1.0 complete)
**Requirements**: SCALE-01, SCALE-02, SCALE-03, SCALE-04, SCALE-05, SCALE-06, SCALE-07, TIME-01, TIME-02
**Success Criteria** (what must be TRUE):
  1. Black hole is visibly massive (~20,000 km diameter) and planets have proportional sizes with ~50,000 km orbit spacing -- scene reads as a realistic-scale solar system
  2. Player ship and enemies are correctly sized (10 km player, 8 km capital, 500 m grunt) and visible at appropriate zoom levels
  3. No geometry jitter or Z-fighting is visible at any orbital radius -- camera-relative rendering and log depth buffer eliminate precision artifacts
  4. Normal (non-nav) mode rendering is completely unchanged -- tests.html passes, planet labels at correct positions, black hole shader unaffected
  5. Jupiter completes one orbit in approximately 60 seconds and all other orbital velocities feel physically consistent
**Plans:** 4/4 plans complete
Plans:
- [x] 10-01-PLAN.md — Scale constants module (scale.js) and automated test suite
- [x] 10-02-PLAN.md — Camera-relative rendering and logarithmic depth buffer
- [x] 10-03-PLAN.md — Keplerian orbital mechanics and bullet time removal
- [x] 10-04-PLAN.md — Combat rebalancing, collision bins, and spawn system for km scale

### Phase 11: Simulation Rescaling & Viewport Cleanup
**Goal**: All combat simulation modules operate in km and the main 3D viewport shows only combat -- no navigation overlays
**Depends on**: Phase 10
**Requirements**: VIEW-01, VIEW-02, VIEW-03, REND-01, REND-04
**Success Criteria** (what must be TRUE):
  1. Player is always in combat mode with no nav/combat mode toggle -- entering nav mode goes straight to combat-ready state
  2. Main 3D viewport shows no orbit rings, trajectory lines, or Lagrange point markers -- it is pure combat view
  3. Orbital height is displayed in the HUD in km with up/down altitude adjustment controls
  4. Black hole dominates the viewport when nearby with rendering tuned for close-up detail
  5. Enemy LOD transitions (full geometry, billboard, skip) occur at appropriate km-scale distances without visible popping
**Plans:** 3/3 plans complete
Plans:
- [ ] 11-01-PLAN.md — Mode simplification, viewport purification, and altitude km formatting
- [ ] 11-02-PLAN.md — Enemy LOD system (full geometry, billboard, skip)
- [ ] 11-03-PLAN.md — Black hole close-up rendering with distance-adaptive shader parameters

### Phase 12: Body Collision & World Boundary
**Goal**: Celestial bodies and the play area boundary are physical obstacles that destroy entities on contact
**Depends on**: Phase 10
**Requirements**: COLL-01, COLL-02, COLL-03, COLL-04
**Success Criteria** (what must be TRUE):
  1. Any enemy or projectile that contacts a planet surface or the black hole event horizon is visibly destroyed
  2. Player ship orbital mechanics prevent collision courses -- the player can never fly into a planet or the black hole
  3. An invisible boundary at 1.2x the outermost orbit prevents entities from drifting beyond the play area
  4. Enemies destroyed by body collision count as kills toward the wave counter and trigger the next wave when thresholds are met
**Plans**: TBD

### Phase 13: Fleet Composition System
**Goal**: Enemies spawn as structured fleets with defined roles rather than as individual ships
**Depends on**: Phase 11
**Requirements**: FLEET-01, FLEET-02, FLEET-03, FLEET-04
**Success Criteria** (what must be TRUE):
  1. Each wave spawns up to 3 distinct fleets, each appearing as a coordinated group rather than scattered individuals
  2. Fleet compositions have visible role differentiation -- anchor ships are large and central, screen ships are numerous and close, strikers arrive from wider orbits
  3. Fleet members orbit near their shared anchor body within a tight radius band, maintaining spatial coherence
  4. Fleet spawn is announced in the HUD with a 3-second callout naming the fleet type and a directional indicator pointing toward the spawn location
**Plans**: TBD

### Phase 14: Warp Speed
**Goal**: Players can accelerate time to cross the km-scale scene without tedious transit waits
**Depends on**: Phase 11, Phase 12
**Requirements**: WARP-01, WARP-02, WARP-03, WARP-04, WARP-05
**Success Criteria** (what must be TRUE):
  1. Pressing Spacebar toggles warp speed -- everything in the scene (orbits, enemies, player transfers) speeds up equally with a smooth ramp
  2. The longest orbital transfer in the system completes in no more than 30 real seconds during warp
  3. Warp automatically disengages when enemies are within detection proximity or the player approaches a planet -- preventing accidental collisions
  4. A clear HUD indicator shows when warp is active with visual feedback (border pulse, "WARP" label)
  5. No projectile tunneling occurs during warp -- projectile physics are suspended and resume correctly when warp ends
**Plans**: TBD

### Phase 15: Radar System
**Goal**: Players have persistent spatial awareness through a radar that replaces all navigation overlays removed from the 3D viewport
**Depends on**: Phase 13
**Requirements**: RADAR-01, RADAR-02, RADAR-03, RADAR-04, RADAR-05
**Success Criteria** (what must be TRUE):
  1. A radar mini-map is always visible in the bottom-left corner showing the player as a blue dot, planets as colored dots, and enemy fleets as red icons
  2. Pressing O expands the radar to a side panel covering the left half of the screen with more detail
  3. In the expanded radar, the player can click orbit destinations (planets, Lagrange points) to initiate orbital transfers -- same transfer mechanics as before
  4. Radar shows live orbit paths and Lagrange point positions, providing the orbital context removed from the 3D view
  5. All orbit visualization (trajectory lines, orbit rings, Lagrange markers) exists only in the radar -- none of it appears in the main 3D viewport
**Plans**: TBD

### Phase 16: LOD & Visual Polish
**Goal**: Distant planets render efficiently as billboards and transition smoothly to 3D as the player approaches
**Depends on**: Phase 11
**Requirements**: REND-02, REND-03
**Success Criteria** (what must be TRUE):
  1. Planets beyond a distance threshold render as 2D billboard sprites instead of 3D geometry, maintaining visual presence without rendering cost
  2. As the player approaches a planet, it transitions smoothly from billboard to 3D rendering with no visible pop or flicker
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order. Phases 12 and 16 can run in parallel with Phase 11 (both depend only on Phase 10), but default execution is sequential.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Combat Rendering Foundation | v1.0 | 2/2 | Complete | 2026-03-10 |
| 2. Player Ship & Orbital Movement | v1.0 | 3/3 | Complete | 2026-03-10 |
| 3. Direct-Fire Weapons | v1.0 | 2/2 | Complete | 2026-03-10 |
| 4. Missile Systems & Explosions | v1.0 | 3/3 | Complete | 2026-03-11 |
| 5. Enemy Behavior & Combat Feedback | v1.0 | 2/2 | Complete | 2026-03-11 |
| 6. Player Defense & Survival | v1.0 | 3/3 | Complete | 2026-03-11 |
| 7. Wave Progression & Enemy Variety | v1.0 | 3/3 | Complete | 2026-03-14 |
| 8. Combat HUD | v1.0 | 1/1 | Complete | 2026-03-14 |
| 9. Tactical Targeting System | v1.0 | 2/2 | Complete | 2026-03-14 |
| 10. Scale Foundation | v1.1 | Complete    | 2026-03-17 | 2026-03-16 |
| 11. Simulation Rescaling & Viewport Cleanup | 3/3 | Complete    | 2026-03-18 | - |
| 12. Body Collision & World Boundary | v1.1 | 0/? | Not started | - |
| 13. Fleet Composition System | v1.1 | 0/? | Not started | - |
| 14. Warp Speed | v1.1 | 0/? | Not started | - |
| 15. Radar System | v1.1 | 0/? | Not started | - |
| 16. LOD & Visual Polish | v1.1 | 0/? | Not started | - |
