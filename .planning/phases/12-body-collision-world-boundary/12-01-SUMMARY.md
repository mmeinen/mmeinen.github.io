---
phase: 12-body-collision-world-boundary
plan: 01
subsystem: combat
tags: [collision-detection, physics, game-loop, celestial-bodies]

# Dependency graph
requires:
  - phase: 10-scale-foundation
    provides: "km-scale constants, getBodyPositionKm, getBodyRadiusKm"
provides:
  - "WORLD_BOUNDARY_KM constant in scale.js"
  - "Enemy body collision with explosion + kill credit for all 8 bodies"
  - "checkBodyCollisions() function for projectiles and missiles"
  - "Consolidated body collision in game loop (replaces scattered BH despawns)"
affects: [12-02-world-boundary-clamping, wave-system, combat-balance]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Cached body position lookup per frame via Float64Array", "Centralized body collision check after projectile hits"]

key-files:
  created: []
  modified: [js/scene/scale.js, js/scene/combat.js, js/scene/weapons.js, js/scene/missiles.js, index.html]

key-decisions:
  - "Station-keeping (AI_IDLE) enemies exempt from body collision to avoid false kills"
  - "Body positions cached once per frame in checkBodyCollisions to avoid redundant getBodyPositionKm calls"
  - "Scattered BH-only despawns consolidated into checkBodyCollisions for single responsibility"

patterns-established:
  - "Body collision: cache positions in Float64Array, check BH first (origin), then 7 planets in loop"
  - "checkBodyCollisions called after checkProjectileHits in game loop order"

requirements-completed: [COLL-01, COLL-04]

# Metrics
duration: 2min
completed: 2026-03-18
---

# Phase 12 Plan 01: Body Collision Summary

**Enemy, projectile, and missile collision with all 8 celestial bodies (7 planets + BH) with explosion FX, kill credit, and missile detonation on impact**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T16:09:09Z
- **Completed:** 2026-03-18T16:11:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Enemies hitting any celestial body are destroyed with explosion and counted as kills (wave progression)
- Projectiles silently removed on body contact; missiles detonate (regular: explosion, nuke: volumetric)
- Scattered BH-only despawns in weapons.js and missiles.js consolidated into single checkBodyCollisions()
- WORLD_BOUNDARY_KM constant and updated NUM_BINS_KM (24 -> 28) added to scale.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Add scale constants and upgrade enemy body collision in combat.js** - `baca4fc` (feat)
2. **Task 2: Add checkBodyCollisions for projectiles and missiles, wire into game loop** - `dfbb6be` (feat)

## Files Created/Modified
- `js/scene/scale.js` - Added WORLD_BOUNDARY_KM constant, updated NUM_BINS_KM from 24 to 28
- `js/scene/combat.js` - Replaced silent BH despawn with full body collision (explosion + kill credit for 8 bodies)
- `js/scene/weapons.js` - Added checkBodyCollisions() function, removed old BH despawn from updateProjectiles
- `js/scene/missiles.js` - Removed old BH despawn from updateMissiles (now handled by checkBodyCollisions)
- `index.html` - Wired checkBodyCollisions(simTime) into game loop after checkProjectileHits()

## Decisions Made
- Station-keeping (AI_IDLE) enemies exempt from body collision to prevent false kills on intentionally-stationed enemies
- Body positions cached once per frame in Float64Array to avoid redundant getBodyPositionKm calls across 128 projectiles + 24 missiles
- Scattered BH-only despawns in weapons.js and missiles.js removed and consolidated into centralized checkBodyCollisions()

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Body collision complete for all entity types
- WORLD_BOUNDARY_KM constant ready for Plan 02 (world boundary clamping/despawn)
- NUM_BINS_KM updated to 28, covering the expanded world boundary range

## Self-Check: PASSED

All 5 modified files verified present. Both task commits (baca4fc, dfbb6be) verified in git log.

---
*Phase: 12-body-collision-world-boundary*
*Completed: 2026-03-18*
