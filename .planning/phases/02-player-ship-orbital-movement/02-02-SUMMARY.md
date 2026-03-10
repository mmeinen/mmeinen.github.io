---
phase: 02-player-ship-orbital-movement
plan: 02
subsystem: physics
tags: [orbital-mechanics, state-machine, webgl, rendering, hud, capital-ship]

# Dependency graph
requires:
  - phase: 02-player-ship-orbital-movement
    provides: orbital.js (SOI, Hohmann, circularize, ORBIT_STATE), createCapitalShipGeometry(), ship shader engine glow
provides:
  - "Orbit state machine in nav.js (ORBITING/TRANSFER/FREE) with click-to-target, SOI capture, altitude control"
  - "Capital ship rendering with engine glow during thrust"
  - "Orbit ring visualization and transfer trajectory preview"
  - "Altitude HUD readout"
  - "Click-to-target input with mid-transfer retargeting"
affects: [02-03-PLAN, index.html rendering, nav.js ship state]

# Tech tracking
tech-stack:
  added: []
  patterns: [orbit-state-machine, click-to-target-transfer, orbit-ring-line-loop, nav-mode-hover-detection]

key-files:
  created: []
  modified:
    - js/scene/nav.js
    - index.html
    - css/style.css

key-decisions:
  - "State-aware delta-v: Hohmann formula for ORBITING state, vis-viva from actual velocity for TRANSFER/FREE retargeting"
  - "Continuous thrust during transfer in burn direction scaled by thrustPower (slider-controlled)"
  - "Nav-mode hover detection via screen-space projection with 20px minimum hit area"
  - "Orbit ring as GL_LINE_LOOP with 64 segments using trajectory shader program"
  - "Altitude HUD positioned above speed readout, shows numeric altitude/TRANSFER/FREE state"

patterns-established:
  - "Orbit state machine: orbitState/orbitBody/transferTarget drive physics, rendering, and HUD"
  - "Click-to-target: flyMode click checks hP for planet, screen distance for BH"
  - "initiateTransfer() callable from any orbit state for immediate retargeting"
  - "Ring rendering via trajPg shader with GL_LINE_LOOP mode"

requirements-completed: [MOV-01, MOV-02, MOV-03, MOV-04, MOV-05]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 2 Plan 2: Orbit State Machine & Navigation Integration Summary

**Orbit state machine with click-to-target transfers, capital ship rendering with engine glow, trajectory preview, orbit ring visualization, and altitude HUD**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T12:54:17Z
- **Completed:** 2026-03-10T12:59:36Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Built complete orbit state machine in nav.js with ORBITING/TRANSFER/FREE states, state-aware delta-v computation (Hohmann for circular orbits, vis-viva for retargeting), continuous thrust during transfer, SOI capture with auto-circularize, and altitude adjustment with crash/escape detection
- Integrated capital ship geometry (176 tris replacing 36-tri box), engine glow uniform, click-to-target input (planets and BH), orbit ring rendering (64-segment GL_LINE_LOOP), and transfer trajectory preview into index.html
- Added altitude HUD readout with blue theme styling, positioned above speed readout, showing numeric altitude when orbiting, TRANSFER during transit, FREE in free flight

## Task Commits

Each task was committed atomically:

1. **Task 1: Orbit state machine and transfer mechanics in nav.js** - `97d6980` (feat)
2. **Task 2: Capital ship rendering, click-to-target, orbit ring, trajectory preview, and HUD** - `395f407` (feat)

## Files Created/Modified
- `js/scene/nav.js` - Added orbit state machine (orbitState, orbitBody, transferTarget, altitude flags), initiateTransfer() with state-aware delta-v, checkSOICapture(), updateAltitude(), modified updateNav() for transfer/orbit/free states, updated enterNavMode()/exitNavMode() with initOrbitalData() and orbit state reset
- `index.html` - Added orbital.js script tag, swapped box geometry for createCapitalShipGeometry(), added u_thrustIntensity uniform, click-to-target handler for planets and BH, ArrowUp/ArrowDown keyboard handlers, nav-mode hover detection, transfer trajectory preview with brighter color, orbit ring rendering, altitude HUD element, ringBuf GL buffer
- `css/style.css` - Added .fly-hud-altitude styling (blue HUD theme, monospace, positioned above speed readout), warning state for crash detection, mobile hide rule

## Decisions Made
- State-aware delta-v: when initiating transfer from ORBITING state, use standard Hohmann delta-v (assumes circular velocity). When retargeting from TRANSFER or FREE state, use vis-viva equation with actual ship velocity for correct trajectory correction.
- Continuous thrust during TRANSFER state in the initial burn direction, scaled by thrustPower (controlled by thrust slider). This modulates transit speed -- higher slider = faster transfer.
- Nav-mode hover detection added using screen-space projection of planet positions from nav camera, with 20px minimum hit area for small/distant planets.
- Orbit ring rendered as GL_LINE_LOOP (64 segments) using existing trajectory shader program, colored rgba(60/255, 140/255, 255/255, 0.4) matching blue HUD theme.
- Aim line (SPACE thrust direction indicator) only shows in FREE state, not during TRANSFER (where burn direction is automatic).
- BH click detection uses 50px screen-space radius from projected BH center.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added nav-mode hover detection for flyMode**
- **Found during:** Task 2
- **Issue:** The plan specified click-to-target using `hP` (hovered planet), but in flyMode `hP` was hardcoded to -1 with no hover detection. Click-to-target would never detect a planet.
- **Fix:** Added nav-mode hover detection using screen-space projection of all 7 planet positions from the nav camera, with a 20px minimum hit area for small planets.
- **Files modified:** index.html
- **Verification:** hP is now computed per-frame in flyMode, cursor changes to pointer on hover
- **Committed in:** 395f407 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Auto-fix was essential for click-to-target functionality. Without nav-mode hover detection, the core mechanic would not work. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Orbit state machine fully wired: click any planet or BH to initiate transfer, auto-capture on SOI entry, altitude control via arrow keys
- Capital ship renders with engine glow responding to orbit state
- Orbit ring and trajectory preview provide visual feedback
- Ready for Plan 03 (Lagrange points, polish, visual refinements)
- No blockers

## Self-Check: PASSED

- FOUND: js/scene/nav.js
- FOUND: js/scene/orbital.js
- FOUND: index.html
- FOUND: css/style.css
- FOUND: 97d6980 (Task 1 commit)
- FOUND: 395f407 (Task 2 commit)

---
*Phase: 02-player-ship-orbital-movement*
*Completed: 2026-03-10*
