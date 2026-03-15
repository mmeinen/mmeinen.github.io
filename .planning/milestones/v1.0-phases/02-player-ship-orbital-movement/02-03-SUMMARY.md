---
phase: 02-player-ship-orbital-movement
plan: 03
subsystem: physics
tags: [lagrange-points, orbital-mechanics, regression-tests, webgl, css]

# Dependency graph
requires:
  - phase: 02-player-ship-orbital-movement
    provides: orbital.js, nav.js orbit state machine, capital ship rendering
provides:
  - "Lagrange point markers with L-key toggle and HTML labels"
  - "L-point click-to-target with Hohmann transfer"
  - "L-point co-rotating orbit with altitude control"
  - "Mid-course guidance correction during transfers"
  - "Body-relative circularization (co-moving orbits)"
  - "Target orbit altitude adjustment during transfer"
  - "Orbital Mechanics regression test suite"
affects: [phase-03, index.html rendering, nav.js ship state]

# Tech tracking
tech-stack:
  added: []
  patterns: [lpoint-toggle-render, lpoint-click-transfer, body-relative-circularize, mid-course-guidance]

key-files:
  created: []
  modified:
    - index.html
    - js/scene/nav.js
    - js/scene/orbital.js
    - css/style.css
    - tests.html

key-decisions:
  - "L-point indexing: body indices >= 100, flatIndex = (planetIdx_in_LPOINT_PLANETS * 4) + lpointType"
  - "L-point capture: fixed SOI of 2.0 with LPOINT_ORBIT_GM = 0.5"
  - "Body-relative circularization: circularizeOrbit takes bodyVel so ship co-moves with orbited body"
  - "Mid-course guidance: proportional correction force based on off-course angle during TRANSFER"
  - "Target orbit altitude adjustable during transfer via up/down keys"
  - "Double-click guard: initiateTransfer ignores if target === orbitBody or transferTarget"
  - "Pure Hohmann coasting: removed user thrust control during transfer"
  - "Planet 0-5 positions read from WASM memory in getBodyPosition for shader consistency"

patterns-established:
  - "L-point rendering: GL_POINTS with dedicated lPointBuf, toggled by lagrangeVisible"
  - "L-point labels: 12 HTML divs positioned via 3D-to-screen projection"
  - "getBodyVelocity() returns orbital velocity of any body (planet, BH, L-point)"

requirements-completed: [MOV-06]

# Metrics
duration: ~45min (across multiple sessions with debugging)
completed: 2026-03-10
---

# Phase 2 Plan 3: Lagrange Points, Polish & Verification Summary

**L-point markers, click-to-target, co-rotating orbits, mid-course guidance, body-relative circularization, and regression tests**

## Performance

- **Completed:** 2026-03-10
- **Tasks:** 3 (2 auto + 1 human verify)
- **Files modified:** 5
- **Commits:** 7 (4a6cae4, f03c82a, 38e1833, 265e4a3, 1b5e5e7, 472d823, 3185114)

## Accomplishments
- Added Lagrange point markers (GL_POINTS) with L-key toggle, 12 HTML labels tracking 3D positions, and light blue CSS styling
- Implemented L-point click detection via ecliptic plane ray intersection, Hohmann transfer to L-points, SOI capture with co-rotating orbit
- Added getBodyVelocity() for body-relative circularization — orbits now properly co-move with their parent body
- Added mid-course guidance correction during transfers to handle multi-body perturbations
- Implemented target orbit altitude adjustment during transfer (up/down keys)
- Added double-click guard preventing teleport when clicking same target twice
- Read planet 0-5 positions from WASM memory for shader-consistent body positions
- Removed user thrust control in favor of pure Hohmann coasting
- Added 12 regression tests in Orbital Mechanics suite (tests.html)

## Task Commits

1. **Task 1: L-point rendering, labels, toggle, CSS** - `4a6cae4` (feat)
2. **Task 2: L-point click-to-target, orbit mechanics, tests** - `f03c82a` (feat)
3. **Fix: orbit ring L-point priority** - `38e1833` (fix)
4. **Fix: orbital transfer UX** - `265e4a3` (fix)
5. **Fix: inward transfer direction** - `1b5e5e7` (fix)
6. **Fix: pure Hohmann coasting** - `472d823` (fix)
7. **Fix: body-relative orbits, guidance, double-click guard** - `3185114` (fix)

## Files Created/Modified
- `index.html` - L-point marker rendering (lPointBuf, GL_POINTS), 12 lpoint-label divs, L-key toggle, L-point click detection, mid-course guidance in trajectory preview, target orbit altitude in ring/HUD
- `js/scene/nav.js` - L-point transfer/capture in initiateTransfer/checkSOICapture, targetOrbitAlt variable, body-relative updateAltitude, mid-course guidance in updateNav, double-click guard, WASM position reads
- `js/scene/orbital.js` - getBodyVelocity(), bodyVel parameter in circularizeOrbit()
- `css/style.css` - .lpoint-label styling (light blue, monospace, z-index 25)
- `tests.html` - Orbital Mechanics test suite (12 tests)

## Visual Verification (Task 3)
User confirmed all 6 MOV requirements working:
- MOV-01: Click planet → orbit ring appears
- MOV-02: Ship auto-burns transfer orbit
- MOV-03: Trajectory line visible during transit
- MOV-04: Pure Hohmann coasting (thrust control removed)
- MOV-05: Up/down arrows adjust orbit altitude with HUD
- MOV-06: L-key toggles markers, click L-point → transfer → orbit

## Issues Encountered
- Double-click on same planet caused teleport (ship already in SOI, re-initiating transfer caused instant capture) — fixed with guard in initiateTransfer
- Multiple iteration fixes needed for transfer direction, orbit ring priority, UX polish

## Next Phase Readiness
- Phase 2 complete: all MOV requirements verified
- Ready for Phase 3: Direct-Fire Weapons
- No blockers

## Self-Check: PASSED

---
*Phase: 02-player-ship-orbital-movement*
*Completed: 2026-03-10*
