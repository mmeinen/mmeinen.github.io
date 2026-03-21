---
phase: 13-fleet-composition-system
plan: 02
subsystem: combat
tags: [fleet-callout, hud, directional-indicator, css-animation, wave-announcement]

# Dependency graph
requires:
  - phase: 13-fleet-composition-system
    provides: _lastFleetResults array from spawnWave() with callout, isBoss, centroidX, centroidZ per fleet
provides:
  - Fleet callout HUD with 3-second animated announcements per fleet spawn
  - Directional chevrons pointing toward fleet spawn locations
  - Boss fleet danger-red callout styling (VANGUARD)
  - Staggered multi-fleet announcements (1.2s between each)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [CSS keyframe animation with JS reflow trigger, directional chevron via CSS border triangle with transform rotation, staggered animationDelay]

key-files:
  created: []
  modified: [css/style.css, index.html, js/scene/waves.js]

key-decisions:
  - "3 pre-allocated fleet-callout DOM elements reused per wave (no dynamic creation/destruction)"
  - "Chevron angle computed from player-to-fleet centroid using Math.atan2(dx, dz) matching enemy indicator pattern"
  - "Sequencing relies on wave state machine timing: wave announce fires at BREATHER start, fleet callouts fire at BREATHER end (4s later)"

patterns-established:
  - "Reflow trick for CSS animation restart: classList.remove, void offsetWidth, classList.add"
  - "Boss styling via .boss CSS class toggled per-callout based on fleet isBoss flag"

requirements-completed: [FLEET-04]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 13 Plan 02: Fleet Callout HUD Summary

**Fleet spawn HUD callouts with directional chevrons, staggered multi-fleet announcements, and boss danger-red styling integrated into wave state machine**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T18:31:00Z
- **Completed:** 2026-03-21T18:35:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added fleet callout CSS with 3-second keyframe animation (scale bounce + fade), vertical staggering (32px offsets), and boss danger-red variant
- Created 3 pre-allocated fleet-callout DOM elements with directional chevron child elements and showFleetCallouts() JS function
- Wired callout trigger into wave system (both startWaveSystem and BREATHER->ACTIVE transition) ensuring callouts fire after wave announcement completes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add fleet callout CSS, DOM elements, and JS callout function** - `1efa256` (feat)
2. **Task 2: Visual verification** - checkpoint approved by user (no code commit)

## Files Created/Modified
- `css/style.css` - Fleet callout styles (.fleet-callout, .fleet-callout.boss, .fleet-callout-chevron), @keyframes fleetCallout animation, mobile hide rule
- `index.html` - 3 fleet-callout DOM elements after wave-announce div, showFleetCallouts() function with directional chevron angle computation and staggered animation
- `js/scene/waves.js` - showFleetCallouts(_lastFleetResults) calls in startWaveSystem() and BREATHER case after spawnWave()

## Decisions Made
- 3 pre-allocated fleet-callout DOM elements reused per wave -- avoids dynamic DOM creation/destruction overhead
- Chevron angle computed from player-to-fleet centroid using Math.atan2(dx, dz), consistent with existing enemy indicator angle math
- Temporal sequencing relies on wave state machine timing gap: wave announce fires at BREATHER start (3s animation), fleet callouts fire at BREATHER end (4s later) -- natural 1s gap, no explicit delay needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 13 is fully complete: fleet composition system (Plan 01) + fleet callout HUD (Plan 02)
- All FLEET requirements (FLEET-01 through FLEET-04) satisfied
- Ready for Phase 14 (Warp Speed) or Phase 15 (Radar System)

## Self-Check: PASSED

- [x] css/style.css exists
- [x] index.html exists
- [x] js/scene/waves.js exists
- [x] 13-02-SUMMARY.md exists
- [x] Commit 1efa256 found

---
*Phase: 13-fleet-composition-system*
*Completed: 2026-03-21*
