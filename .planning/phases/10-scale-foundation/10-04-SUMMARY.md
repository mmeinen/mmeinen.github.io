---
phase: 10-scale-foundation
plan: 04
subsystem: combat
tags: [km-scale, combat-rebalancing, collision-bins, weapons, missiles, ai-distances, spawn-system]

# Dependency graph
requires:
  - "10-01: scale.js provides BIN_WIDTH_KM, NUM_BINS_KM, MAX_RADIUS_KM, BODY_SCALE, ORBIT_SCALE, entity size constants"
  - "10-02: CRR ensures combat visuals render without jitter at km distances"
  - "10-03: nav.js provides km-scale flyPos, computeGravAccelKm, getBodyPositionKm"
provides:
  - "js/scene/weapons.js: km/s projectile speeds (kinetic 15000, plasma 30000, enemy 10000), km hit radii (500, 800)"
  - "js/scene/missiles.js: km/s missile speeds (3000 regular, 2500 nuke), km blast radii (2000, 8000)"
  - "js/scene/combat.js: km-scale collision bins (BIN_WIDTH_KM=5000, NUM_BINS_KM=24, covers 0-120,000 km)"
  - "js/scene/combat.js: km-scale AI distances (detect 20000, attack 7500, fire 5000)"
  - "js/scene/combat.js: ARCHETYPE_SCALES [1.0, 1.0, 1.3, 1.2, 16.0] mapping to km entity sizes"
  - "js/scene/waves.js: km-scale spawn positions using ORBIT_SCALE"
  - "js/scene/particles.js: km/s particle speeds"
  - "js/scene/explosions.js: km-scale explosion sizes"
  - "js/scene/nav.js: SHIP_HALF updated for 10 km player ship"
affects: [11-simulation-rescaling, combat, fleet-composition, warp-speed]

# Tech tracking
tech-stack:
  added: []
  patterns: [km-combat-constants, gameplay-tuned-hit-radii, km-collision-bins]

key-files:
  created: []
  modified: [js/scene/weapons.js, js/scene/missiles.js, js/scene/combat.js, js/scene/particles.js, js/scene/explosions.js, js/scene/waves.js, js/scene/nav.js, index.html]

key-decisions:
  - "Weapon hit radii tuned for gameplay feel (500-800 km), not derived from scale factor"
  - "ARCHETYPE_SCALES adjusted so Grunt=1.0x (0.5 km), Capital=16.0x (8 km)"
  - "Float32Array kept for enemy positions -- 8m precision at Neptune orbit is adequate for 500m+ entities"
  - "Collision bins use BIN_WIDTH_KM and NUM_BINS_KM from scale.js for single source of truth"
  - "Gravity for projectiles, missiles, and enemies uses computeGravAccelKm (km-scale) not abstract computeGravAccel"

patterns-established:
  - "Combat constants declared as named constants at file top, values in km or km/s"
  - "Collision bin parameters reference scale.js constants (BIN_WIDTH_KM, NUM_BINS_KM) rather than local hardcodes"
  - "AI distance thresholds declared as named constants (DETECT_RANGE, ATTACK_RANGE, FIRE_RANGE, etc.) in combat.js"

requirements-completed: [SCALE-03, SCALE-07]

# Metrics
duration: 25min
completed: 2026-03-16
---

# Phase 10 Plan 04: Combat Rebalancing Summary

**All combat constants (weapons, missiles, AI, collision bins, spawns) recalibrated to km-scale with gameplay-tuned hit radii and snappy real-time feel**

## Performance

- **Duration:** ~25 min (across checkpoint pause)
- **Started:** 2026-03-16T19:15:00Z
- **Completed:** 2026-03-16T21:27:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 8

## Accomplishments
- Rebalanced all weapon speeds to km/s (kinetic 15000, plasma 30000, enemy 10000) with gameplay-tuned hit radii (500-800 km)
- Recalibrated missile system with km/s speeds (3000 regular, 2500 nuke) and km blast radii (2000, 8000)
- Updated collision bins to km-scale (BIN_WIDTH_KM=5000, NUM_BINS_KM=24) covering 0-120,000 km play area
- Set AI distances for km scale (detect 20000, attack 7500, fire 5000, disengage 2500)
- Updated ARCHETYPE_SCALES to produce correct entity sizes (Grunt 0.5 km, Capital 8 km, Player 10 km)
- Updated wave spawn system to use km-scale orbit positions via ORBIT_SCALE
- Fixed gravity coordinate mismatch -- projectiles, missiles, and enemies now use computeGravAccelKm

## Task Commits

Each task was committed atomically:

1. **Task 1: Rebalance weapon, missile, and entity constants for km scale** - `2d3fc4a` (feat)
2. **Task 2: Recalibrate collision bins and spawn system for km scale** - `0f2667a` (feat)
3. **Task 3: Verify complete km-scale combat system** - human-verify checkpoint (approved)

**Deviation fix:** `13894e1` (fix) - gravity coordinate mismatch for projectiles/missiles/enemies
**Post-checkpoint fix:** `2e8e7a0` (fix) - missing scale.js script tag in index.html

## Files Created/Modified
- `js/scene/weapons.js` - Projectile speeds (km/s), hit radii (km), render sizes for km-scale visibility
- `js/scene/missiles.js` - Missile speeds (km/s), blast radii (km), visual sizes for km-scale
- `js/scene/combat.js` - Collision bins (BIN_WIDTH_KM, NUM_BINS_KM), AI distances (km), ARCHETYPE_SCALES
- `js/scene/particles.js` - Particle speeds and sizes in km
- `js/scene/explosions.js` - Explosion sizes in km
- `js/scene/waves.js` - Spawn positions using ORBIT_SCALE for km coordinates
- `js/scene/nav.js` - SHIP_HALF updated for 10 km player ship
- `index.html` - scale.js script tag added before dependent combat modules

## Decisions Made
- Weapon hit radii (500-800 km) are gameplay-tuned, not derived from scale factor -- per CONTEXT.md locked decision
- ARCHETYPE_SCALES adjusted: Swarm bumped from 0.6 to 1.0 (meeting 500m floor), Capital from 4.5 to 16.0 (8 km target)
- Float32Array kept for enemy positions -- 8m precision at max orbit is negligible vs 500m entity sizes
- Gravity for combat entities switched to computeGravAccelKm rather than abstract computeGravAccel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gravity coordinate mismatch for projectiles, missiles, and enemies**
- **Found during:** Task 2 (collision bin recalibration)
- **Issue:** combat.js, weapons.js, and missiles.js called computeGravAccel (abstract-unit gravity) while entity positions were in km, causing incorrect gravitational acceleration
- **Fix:** Switched all gravity calls to computeGravAccelKm which operates in km-scale coordinates
- **Files modified:** js/scene/combat.js, js/scene/weapons.js, js/scene/missiles.js
- **Verification:** Combat entities now follow correct orbital trajectories at km scale
- **Committed in:** `13894e1`

**2. [Rule 3 - Blocking] Missing scale.js script tag in index.html**
- **Found during:** Task 3 checkpoint (user testing)
- **Issue:** scale.js was not loaded via script tag in index.html, causing BIN_WIDTH_KM and other constants to be undefined at runtime
- **Fix:** Added `<script src="js/scene/scale.js"></script>` before dependent combat module script tags
- **Files modified:** index.html
- **Verification:** Combat loads and runs correctly with km-scale constants
- **Committed in:** `2e8e7a0`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were essential for correctness. The gravity mismatch would have caused incorrect combat physics, and the missing script tag prevented combat from loading. No scope creep.

## Issues Encountered
- Gravity function duality (computeGravAccel vs computeGravAccelKm) required careful audit of all callers -- the abstract-unit function must be preserved for Lagrange computation and shader, but all km-scale entity physics must use the km variant.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 (Scale Foundation) is now complete -- all 4 plans executed
- Scene operates in km-scale coordinates with CRR, log depth, Keplerian orbits, and rebalanced combat
- Phase 11 (Simulation Rescaling & Viewport Cleanup) can proceed -- all combat modules operate in km
- Phase 12 (Body Collision & World Boundary) can also proceed in parallel (depends only on Phase 10)

## Self-Check: PASSED

- All 8 modified files verified present on disk
- All 4 commit hashes (2d3fc4a, 0f2667a, 13894e1, 2e8e7a0) verified in git log

---
*Phase: 10-scale-foundation*
*Completed: 2026-03-16*
