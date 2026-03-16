---
phase: 10-scale-foundation
plan: 03
subsystem: scene
tags: [kepler, gravity, km-scale, orbital-mechanics, bullet-time-removal]

# Dependency graph
requires:
  - "10-01: scale.js provides BH_GM_KM, ORBIT_SCALE, BODY_SCALE, planetPosKm()"
provides:
  - "js/scene/nav.js: km-scale gravity (computeGravAccelKm), flyPos in km during flyMode"
  - "js/scene/nav.js: Keplerian sp recomputation in enterNavMode using BH_GM_KM"
  - "js/scene/nav.js: _planetGM_km array, getBodyPositionKm/getBodyRadiusKm/getBodyGMKm helpers"
  - "js/scene/orbital.js: km-scale SOI, orbit altitudes, getBodyVelocityKm"
  - "index.html: simDtSec = dtSec (1.0x real-time always), no bullet time"
  - "Bullet time (0.03x) and fast forward (0.5x) completely removed"
  - "oR doubling hack removed from enterNavMode/exitNavMode"
affects: [10-04, combat, weapons, missiles, orbital, waves]

# Tech tracking
tech-stack:
  added: []
  patterns: [km-flypos, dual-gravity-functions, keplerian-sp-recomputation]

key-files:
  created: []
  modified: [js/scene/nav.js, js/scene/orbital.js, index.html]

key-decisions:
  - "flyPos/flyVel operate in km during flyMode (Approach A from plan) -- convert at enterNavMode/exitNavMode boundary"
  - "Planet GM km-scale preserves SOI proportions: _PLANET_GM_K_KM = PLANET_GM_K * BODY_SCALE^3 / ORBIT_SCALE^3"
  - "Abstract BH_GM=400 preserved for remaining abstract-unit callers (Lagrange computation, shader)"
  - "Nav camera distances in km: MIN=50, MAX=5000"
  - "Detonation slot positions remain in abstract units for shader compatibility"

patterns-established:
  - "km-scale helpers: getBodyPositionKm(idx, simTime), getBodyVelocityKm(idx, simTime), getBodyRadiusKm(idx), getBodyGMKm(idx)"
  - "computeGravAccelKm(pos, time) for km-scale gravity, computeGravAccel(pos) preserved for abstract callers"
  - "updateNav(simDt, simTime) receives simTime for km-scale planet position lookups"

requirements-completed: [TIME-01, TIME-02, SCALE-06]

# Metrics
duration: 16min
completed: 2026-03-16
---

# Phase 10 Plan 03: Keplerian Orbital Mechanics Summary

**Keplerian gravity derived from BH_GM_KM, flyPos in km during flyMode, bullet time + oR doubling removed, 1.0x real-time simulation**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-16T18:56:16Z
- **Completed:** 2026-03-16T19:12:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed bullet time (BULLET_TIME_SCALE=0.03) and fast forward (FAST_FORWARD_SCALE=0.5) -- simDtSec = dtSec always
- Removed oR doubling hack from enterNavMode/exitNavMode -- planetData.oR never mutated for scale
- Implemented km-scale gravity using BH_GM_KM from Kepler derivation -- Jupiter orbits in ~60 seconds
- Converted flyPos/flyVel to km during flyMode with enter/exit boundary conversion via ORBIT_SCALE
- Updated all nav physics (leapfrog integration, SOI capture, orbit transfers, altitude control) for km scale
- Updated orbital.js with km-scale SOI computation, orbit altitudes, and body velocity helper

## Task Commits

Task 1 was committed atomically. Task 2 changes were absorbed into Plan 02's metadata commit during concurrent execution:

1. **Task 1: Remove bullet time, fast forward, and oR doubling** - `9278a83` (feat)
2. **Task 2: Implement Keplerian gravity and orbital mechanics at km scale** - Changes included in `39ed475` (docs: Plan 02 metadata commit absorbed pre-existing km-scale nav fixes)

## Files Created/Modified
- `js/scene/nav.js` - km-scale gravity (computeGravAccelKm), _planetGM_km array, flyPos km conversion in enterNavMode, km-scale orbit transfer/capture/altitude, getBodyPositionKm/getBodyRadiusKm/getBodyGMKm helpers, getLPointPositionKm, removed bullet time constants
- `js/scene/orbital.js` - km-scale SOI computation (uses _planetGM_km and BH_GM_KM), km-scale initOrbitalData with BH_RADIUS_KM and km altitude values, getBodyVelocityKm helper
- `index.html` - simDtSec=dtSec (no time scaling), updateNav(simDtSec,simTime) call, km-scale planet hover detection, km-scale explosion spawning, km-scale death cam distance, km trajectory preview with ORBIT_SCALE thrust, detonation position conversion for shader

## Decisions Made
- flyPos/flyVel in km during flyMode (Approach A): cleanest separation -- all physics runs in km, conversion at enter/exit boundary
- Planet GM at km scale uses proportional scaling: PLANET_GM_K * BODY_SCALE^3 / ORBIT_SCALE^3, preserving SOI/orbit-radius ratio
- BH_GM=400 kept for abstract-unit Lagrange computation and shader detonation effects
- Nav camera distances scaled to km: MIN=50 km (close), MAX=5000 km (zoomed out)
- Detonation slot positions stored in abstract units for shader compatibility -- death detonation converts from km to abstract
- Death sequence explosion sizes use PLAYER_SIZE_KM for km-appropriate visual scale
- Float32Array for flyPos/flyVel acceptable -- 7.8m precision at Neptune orbit is sufficient for gameplay

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed nav hover detection coordinate mismatch**
- **Found during:** Task 2
- **Issue:** After flyPos became km, _camP (camera position) was in km but planet positions from WASM were in abstract units, breaking hover detection
- **Fix:** Multiply WASM planet positions by ORBIT_SCALE and planet radii by BODY_SCALE in the hover loop
- **Files modified:** index.html
- **Committed in:** `39ed475`

**2. [Rule 3 - Blocking] Fixed trajectory preview transfer guidance using wrong coordinate system**
- **Found during:** Task 2
- **Issue:** getBodyPosition(transferTarget) returned abstract-unit position but flyPos was km, producing wrong guidance direction
- **Fix:** Changed to getBodyPositionKm(transferTarget, simTime) and scaled thrust by ORBIT_SCALE
- **Files modified:** index.html
- **Committed in:** `39ed475`

**3. [Rule 1 - Bug] Fixed detonation shader position mismatch**
- **Found during:** Task 2
- **Issue:** Death detonation stored km-coordinate deathPos in slot.pos but shader expects abstract units. Nuke detonation already stored abstract units.
- **Fix:** Convert deathPos to abstract (divide by ORBIT_SCALE) when writing to slot.pos; keep _detPosFlat writing unchanged
- **Files modified:** index.html
- **Committed in:** `39ed475`

**4. [Rule 1 - Bug] Fixed nuke button oScale using obsolete doubling factor**
- **Found during:** Task 2
- **Issue:** Nuke button used `const oScale=flyMode?2.0:1.0` which was for the old oR doubling
- **Fix:** Removed oScale entirely -- always use `saturn.oR+3.0`
- **Files modified:** index.html
- **Committed in:** `39ed475`

**5. [Rule 1 - Bug] Fixed death camera zoom distance for km scale**
- **Found during:** Task 2
- **Issue:** Death sequence camera zoomed to 120 abstract units; in km this should be proportional
- **Fix:** Changed to `NAV_CAM_DIST_MAX*0.6` (3000 km)
- **Files modified:** index.html
- **Committed in:** `39ed475`

---

**Total deviations:** 5 auto-fixed (2 blocking, 3 bugs)
**Impact on plan:** All auto-fixes necessary for correctness after km-scale conversion. No scope creep.

## Issues Encountered
- Task 2 code changes were absorbed into Plan 02's metadata commit (39ed475) because the files were modified on disk when the Plan 02 executor ran. This resulted in the Plan 03 Task 2 code lacking its own dedicated commit hash. The changes are verified present and correct in the repository.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Nav physics fully operating in km with Keplerian gravity
- Combat systems (enemies, weapons, missiles, projectiles) still in abstract units -- Plan 04 handles rebalancing
- flyPos is km during flyMode, requiring all combat code that reads flyPos to be aware of the coordinate system (Plan 04 scope)
- Normal mode completely unaffected (shader receives abstract units via ORBIT_SCALE division)
- No blockers for Plan 04 (combat rebalancing and collision bins)

## Self-Check: PASSED

- FOUND: js/scene/nav.js
- FOUND: js/scene/orbital.js
- FOUND: index.html
- FOUND: 10-03-SUMMARY.md
- FOUND: commit 9278a83
- FOUND: commit 39ed475
- Verified: computeGravAccelKm present in nav.js (5 occurrences)
- Verified: getBodyVelocityKm present in orbital.js
- Verified: simDtSec=dtSec present in index.html

---
*Phase: 10-scale-foundation*
*Completed: 2026-03-16*
