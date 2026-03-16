---
phase: 10-scale-foundation
plan: 01
subsystem: scene
tags: [scale, km-coordinates, kepler, constants, orbital-mechanics]

# Dependency graph
requires: []
provides:
  - "js/scene/scale.js: single source of truth for all km-scale constants"
  - "BODY_SCALE=800, ORBIT_SCALE=1316 scale factors"
  - "BH_GM_KM derived from Kepler at Jupiter 60s orbit"
  - "Planet diameters and orbit radii in km arrays"
  - "Archetype sizes (player=10km, capital=8km, grunt=500m)"
  - "planetPosKm() and periodFromOr() helper functions"
  - "Collision bin constants: BIN_WIDTH_KM=5000, NUM_BINS_KM=24"
  - "9 automated scale validation tests in tests.html"
affects: [10-02, 10-03, 10-04, nav, combat, weapons, missiles, orbital]

# Tech tracking
tech-stack:
  added: []
  patterns: [dual-scale-factor, kepler-derivation, parallel-index-arrays]

key-files:
  created: [js/scene/scale.js]
  modified: [tests.html]

key-decisions:
  - "BH_GM_KM computed from Kepler formula, not hardcoded -- ensures Jupiter 60s orbit is exact"
  - "Planet arrays indexed parallel to planetData (Jupiter=0 through Mars=6)"
  - "scale.js uses const at file scope for global access via script tag (no ES modules)"
  - "Angular speed (sp) stays in abstract units in planetPosKm -- only orbit radius is scaled"

patterns-established:
  - "Dual scale factors: BODY_SCALE=800 for sizes, ORBIT_SCALE=1316 for orbits"
  - "km constants module receives planetData entries as parameters, never references the global"
  - "Scale tests loaded via script tag in tests.html head, validated alongside shader invariants"

requirements-completed: [SCALE-01, SCALE-02, SCALE-03, TIME-02]

# Metrics
duration: 4min
completed: 2026-03-16
---

# Phase 10 Plan 01: Scale Constants Summary

**km-scale constants module with Kepler-derived BH_GM, dual scale factors (800/1316), and 9 automated validation tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T18:49:17Z
- **Completed:** 2026-03-16T18:52:58Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created js/scene/scale.js as single source of truth for all km-scale constants
- BH_GM_KM formula-derived from Kepler's third law -- T(Jupiter) round-trips to exactly 60.000000 seconds
- Extended tests.html with 9 new assertions across 5 test groups (SCALE-01, SCALE-02, SCALE-03, TIME-02, SCALE-07)
- All existing shader invariant and behavioral tests preserved unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Create js/scene/scale.js with all km-scale constants** - `80fe730` (feat)
2. **Task 2: Extend tests.html with scale constant validation tests** - `57fc5df` (test)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `js/scene/scale.js` - All km-scale constants, Kepler-derived BH_GM_KM, planetPosKm() and periodFromOr() helpers
- `tests.html` - 9 new scale validation assertions in "Scale Foundation" test section, plus script tag for scale.js

## Decisions Made
- BH_GM_KM = 4*pi^2 * 50008^3 / 60^2 (~1.3714e12 km^3/s^2) -- formula-derived, not hardcoded
- Planet arrays use parallel indexing to planetData (Jupiter=0, Saturn=1, Uranus=2, Neptune=3, Venus=4, Earth=5, Mars=6)
- Used `const` at file scope rather than ES modules since the project uses script tags
- Angular speed (sp) remains in abstract rad/s units in planetPosKm -- it's angular, not linear, so no scaling needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- scale.js is ready for import by all subsequent plans (10-02, 10-03, 10-04)
- Constants verified computationally: Kepler round-trip exact, all planet values match CONTEXT.md
- tests.html provides automated regression coverage for scale constants
- No blockers for Plan 02 (dual-coordinate planet positions and CRR)

## Self-Check: PASSED

- FOUND: js/scene/scale.js
- FOUND: tests.html
- FOUND: 10-01-SUMMARY.md
- FOUND: commit 80fe730
- FOUND: commit 57fc5df

---
*Phase: 10-scale-foundation*
*Completed: 2026-03-16*
