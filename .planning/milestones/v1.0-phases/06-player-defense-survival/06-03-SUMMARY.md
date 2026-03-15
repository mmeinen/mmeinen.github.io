---
phase: 06-player-defense-survival
plan: 03
subsystem: combat
tags: [webgl, indicators, dom-overlay, spatial-awareness, off-screen]

# Dependency graph
requires:
  - phase: 06-player-defense-survival
    provides: "playerState with alive/deathPhase, enemy SoA with posX/posZ/type, camera vectors, showGameOverScreen"
provides:
  - "Off-screen enemy indicator DOM pool with per-frame camera-vector projection"
  - "CSS chevron indicators with archetype-colored distance readout"
  - "hideAllIndicators() function for death/game over/exit cleanup"
affects: [07-enemy-variety]

# Tech tracking
tech-stack:
  added: []
  patterns: ["CSS triangle chevron via border trick with currentColor inheritance", "Camera-vector dot-product projection for screen-space positioning (consistent with lock reticle pattern)"]

key-files:
  created: []
  modified: ["index.html", "css/style.css", "js/scene/nav.js"]

key-decisions:
  - "Used camera-vector dot-product projection instead of _mvp matrix (plan specified _mvp which includes ship model transform)"
  - "Indicator chevron uses CSS border-bottom triangle with currentColor for automatic archetype color inheritance"
  - "Behind-camera enemies handled via atan2 of negated camera-space coordinates to place indicator on opposite screen side"

patterns-established:
  - "Off-screen indicator pattern: project to screen, check bounds, clamp to edge with margin, rotate chevron to point at target"

requirements-completed: [DEF-06]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 06 Plan 03: Off-Screen Enemy Indicators Summary

**DOM-based off-screen enemy indicators with CSS chevron arrows clamped to viewport edges, distance readout in game units, and archetype color support for Phase 7 enemy types**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T16:08:28Z
- **Completed:** 2026-03-11T16:12:15Z
- **Tasks:** 1 auto + 1 checkpoint
- **Files modified:** 3

## Accomplishments
- 64-element DOM indicator pool with CSS triangle chevrons pointing toward off-screen enemies
- Per-frame screen-space projection using camera-vector dot-product method (matching lock reticle pattern)
- Edge clamping with 40px margin, distance labels in game units (e.g., "45u"), 200-unit detection range
- Indicators automatically hidden during death sequence, game over, and nav mode exit
- Archetype color array extensible for Phase 7 enemy types (currently red for Grunt type 0)

## Task Commits

Each task was committed atomically:

1. **Task 1: Off-screen enemy indicator DOM pool, projection, and edge clamping** - `80a3eb2` (feat)

## Files Created/Modified
- `index.html` - Indicator DOM pool (64 elements), INDICATOR_RANGE constant, updateEnemyIndicators() with camera-vector projection and edge clamping, positionIndicator() with chevron rotation and archetype colors, hideAllIndicators(), render loop integration gated on playerState.alive, game over cleanup
- `css/style.css` - .enemy-indicator (fixed position, z-index 25, monospace), .indicator-chevron (CSS border triangle with currentColor), .indicator-dist (text-shadow glow), mobile responsive hide rule
- `js/scene/nav.js` - hideAllIndicators() call in exitNavMode (with typeof guard for script load order)

## Decisions Made
- Used camera-vector dot-product projection instead of _mvp matrix multiplication -- the plan specified _mvp but that includes the ship model transform, which would give incorrect world-to-screen results for enemy positions. The camera-vector approach matches the existing lock reticle pattern.
- Behind-camera enemies are handled by projecting their direction into camera-space right/up coordinates, then using atan2 to determine the correct screen edge position.
- Indicator color array is pre-allocated with 5 colors, indexed by enemy type. Type 0 (Grunt) is red, extensible for Phase 7 archetypes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used camera-vector projection instead of _mvp matrix**
- **Found during:** Task 1
- **Issue:** Plan specified using `_mvp` for world-to-screen projection, but `_mvp` = proj * view * model (includes ship model transform at line 1169). Using it would produce incorrect results for enemy world positions.
- **Fix:** Used camera-vector dot-product method (_camF, _camR, _camU, _camP) matching the existing lock reticle projection pattern
- **Files modified:** index.html (updateEnemyIndicators function)
- **Committed in:** 80a3eb2

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential correctness fix. The _mvp matrix would have produced visually wrong indicator positions. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 6 complete: HP, shields, death sequence, game over, restart, off-screen indicators all functional
- Enemy type color array ready for Phase 7 enemy variety
- Indicator system reuses existing camera-vector projection pattern, no new rendering concepts

## Self-Check: PASSED

All files exist, commit verified, all key content present (indicatorEls DOM pool, updateEnemyIndicators function, .enemy-indicator CSS, hideAllIndicators in exitNavMode).

---
*Phase: 06-player-defense-survival*
*Completed: 2026-03-11*
