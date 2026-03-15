---
phase: 02-player-ship-orbital-movement
plan: 01
subsystem: physics
tags: [orbital-mechanics, geometry, webgl, shaders, procedural]

# Dependency graph
requires:
  - phase: 01-combat-rendering-foundation
    provides: ship shader pipeline (shipVS/shipFS), createGruntGeometry pattern, nav.js gravity infrastructure
provides:
  - "Orbital mechanics module with SOI, Lagrange points, Hohmann transfer, orbit state enum"
  - "Capital ship procedural geometry (176 tris, smooth wedge silhouette)"
  - "Ship shader engine glow via u_thrustIntensity uniform"
affects: [02-02-PLAN, 02-03-PLAN, nav.js orbit state machine, index.html ship rendering]

# Tech tracking
tech-stack:
  added: []
  patterns: [orbital-mechanics-module, initOrbitalData-lazy-init, engine-glow-object-space-mask]

key-files:
  created:
    - js/scene/orbital.js
  modified:
    - js/scene/math.js
    - js/scene/shaders.js

key-decisions:
  - "Hill sphere SOI with gameplay floor: max(hillR, radius*2.5+1.0)"
  - "Lagrange points only for 3 major planets (Jupiter, Saturn, Neptune) to avoid scene clutter"
  - "Capital ship 176 tris with octagonal hull cross-section for smooth wedge profile"
  - "Engine glow via object-space z threshold (smoothstep at z=-0.35) in ship fragment shader"

patterns-established:
  - "Orbital module globals pattern: references BH_GM, _planetGM, planetData from nav.js"
  - "initOrbitalData() called after enterNavMode() doubles oR -- lazy table initialization"
  - "Engine glow via v_objPos varying + smoothstep mask on nacelle rear vertices"

requirements-completed: [MOV-06]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 2 Plan 1: Orbital Mechanics Foundation Summary

**Orbital mechanics module with SOI/Hohmann/Lagrange formulas, 176-triangle capital ship geometry, and ship shader engine glow uniform**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T12:44:34Z
- **Completed:** 2026-03-10T12:50:11Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created orbital mechanics module (orbital.js) with ORBIT_STATE enum, SOI computation using Hill sphere with gameplay floor, Hohmann transfer delta-v, circular velocity, auto-circularize, and Lagrange point positions for 3 major planets
- Built capital ship procedural geometry (176 triangles) with smooth octagonal-cross-section wedge hull, bridge tower, wide-set engine nacelles, forward-swept wing plates -- visually distinct from Grunt's angular diamond silhouette
- Added engine glow shader support via u_thrustIntensity uniform with object-space position masking on nacelle rear vertices (z < -0.35)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create orbital mechanics module (orbital.js)** - `c17b8cf` (feat)
2. **Task 2: Capital ship geometry + engine glow shader** - `f75ba15` (feat)

## Files Created/Modified
- `js/scene/orbital.js` - Orbital mechanics: ORBIT_STATE, SOI, Lagrange points, Hohmann delta-v, circularize, body helpers, initOrbitalData
- `js/scene/math.js` - Added createCapitalShipGeometry() with 176-tri smooth wedge capital ship
- `js/scene/shaders.js` - Updated shipVS (v_objPos varying) and shipFS (u_thrustIntensity + engine glow)

## Decisions Made
- Used Hill sphere formula with gameplay floor (max(hillR, radius*2.5+1.0)) for SOI radii -- physically grounded but gameplay-tunable
- Lagrange points computed only for Jupiter (0), Saturn (1), Neptune (3) -- the 3 largest planets. Smaller planets have Hill spheres too small for meaningful L-points
- Capital ship uses octagonal cross-section hull with 7 longitudinal stations for smooth tapering profile (vs Grunt's diamond cross-section)
- Nacelle rear faces at z=-0.42, well below the -0.35 smoothstep threshold, ensuring clear engine glow region
- initOrbitalData() designed to be called after enterNavMode() doubles orbit radii -- lazy initialization pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial capital ship geometry was 186 triangles (6 over the 180 max). Removed bridge bevel decorations and pylon top/bottom faces to bring to 176 triangles within spec.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- orbital.js ready for Plan 02 (nav.js orbit state machine) to import constants and formulas
- Capital ship geometry ready for Plan 03 (index.html rendering integration) to replace box geometry
- Ship shader u_thrustIntensity ready for Plan 02/03 to wire up thrust visualization
- No blockers for Plans 02 or 03

## Self-Check: PASSED

- FOUND: js/scene/orbital.js
- FOUND: js/scene/math.js
- FOUND: js/scene/shaders.js
- FOUND: c17b8cf (Task 1 commit)
- FOUND: f75ba15 (Task 2 commit)

---
*Phase: 02-player-ship-orbital-movement*
*Completed: 2026-03-10*
