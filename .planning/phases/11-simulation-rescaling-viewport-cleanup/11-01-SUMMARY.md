---
phase: 11-simulation-rescaling-viewport-cleanup
plan: 01
subsystem: ui
tags: [combat-mode, viewport, hud, altitude, km-formatting]

# Dependency graph
requires:
  - phase: 10-scale-foundation
    provides: km-scale coordinate system, ORBIT_SCALE, BH_GM_KM
provides:
  - combatMode hardwired to true (always-on in nav mode)
  - F key toggle removed, L key disabled
  - 3D viewport purified of navigation overlays (orbit rings, L-point markers, tactical rings, transfer crosshairs)
  - L-point positions computed unconditionally for orbit capture
  - fmtKm() altitude formatting helper (842.3 km, 12,450 km)
affects: [phase-12, phase-15-radar]

# Tech tracking
tech-stack:
  added: []
  patterns: [always-on-combat, fmtKm-altitude-display]

key-files:
  created: []
  modified:
    - js/scene/weapons.js
    - js/scene/nav.js
    - index.html

key-decisions:
  - "combatMode hardwired to true at declaration and re-set on enterNavMode/resetCombat for defense-in-depth"
  - "L-point position computation extracted to run unconditionally before rendering section (orbit capture depends on it)"
  - "lagrangeVisible changed from let to const false to prevent accidental re-enable"
  - "L-point click handler left gated on lagrangeVisible (const false) as clean no-op"

patterns-established:
  - "fmtKm(val): <1000 uses toFixed(1)+' km', >=1000 uses toLocaleString()+' km'"
  - "Navigation overlays removed but data computation preserved for gameplay systems"

requirements-completed: [VIEW-01, VIEW-02, VIEW-03]

# Metrics
duration: 5min
completed: 2026-03-18
---

# Phase 11 Plan 01: Viewport Purification Summary

**Combat mode always-on with F key removed, 3D viewport purified of all navigation overlays, altitude formatted in km**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T03:08:54Z
- **Completed:** 2026-03-18T03:14:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Combat mode is always active when entering nav mode -- no F key toggle, immediate crosshair/weapons/tactical markers
- 3D viewport shows only combat elements (enemies, projectiles, explosions, weapon preview, player ship, planets)
- Altitude HUD displays "842.3 km" or "12,450 km" format instead of raw numbers with "u" suffix
- L-point orbit capture still functions (positions computed every frame unconditionally)

## Task Commits

Each task was committed atomically:

1. **Task 1: Mode simplification -- hardwire combatMode and remove F key toggle** - `ad32cac` (feat)
2. **Task 2: Viewport purification -- remove nav overlays and format altitude in km** - `b3b8f85` (feat)

## Files Created/Modified
- `js/scene/weapons.js` - combatMode init changed from false to true
- `js/scene/nav.js` - enterNavMode() and resetCombat() now enable combat HUD immediately; lagrangeVisible assignment removed from exitNavMode
- `index.html` - F key handler removed, weapon select ungated, orbit ring/L-point marker/tactical ring rendering removed, L-point computation extracted, fmtKm() helper added, altitude displays updated

## Decisions Made
- combatMode hardwired at declaration AND re-set in enterNavMode/resetCombat for defense-in-depth
- L-point position computation extracted and runs unconditionally (orbit capture depends on lPointPositions array)
- lagrangeVisible changed from `let` to `const false` -- prevents accidental re-enable, L-point click handler naturally disabled
- Dead code (ringBuf, ringArray, _tacRingRadii declarations) left in place to avoid unnecessary churn

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed lagrangeVisible const assignment in exitNavMode**
- **Found during:** Task 2 (viewport cleanup)
- **Issue:** Plan changed lagrangeVisible from `let` to `const false` in index.html, but exitNavMode() in nav.js still assigns `lagrangeVisible=false` -- would throw TypeError at runtime
- **Fix:** Replaced assignment with comment in nav.js exitNavMode()
- **Files modified:** js/scene/nav.js
- **Verification:** No remaining `lagrangeVisible=` assignments outside the const declaration
- **Committed in:** b3b8f85 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- VIEW-01, VIEW-02, VIEW-03 requirements complete
- Viewport is purified for combat-only display
- fmtKm pattern established for future altitude/distance displays
- L-point data pipeline preserved for Phase 15 radar system

---
*Phase: 11-simulation-rescaling-viewport-cleanup*
*Completed: 2026-03-18*
