---
phase: 11-simulation-rescaling-viewport-cleanup
plan: 03
subsystem: rendering
tags: [glsl, shader, distance-adaptive, fbm, photon-ring, black-hole]

# Dependency graph
requires:
  - phase: 10-scale-foundation
    provides: u_camDist uniform and camera distance tracking
provides:
  - Distance-adaptive black hole close-up rendering via closeupFactor
  - Full FBM octaves at close range for accretion disk detail
  - Sharper photon ring and brighter glow proportional to camera proximity
affects: [11-simulation-rescaling-viewport-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [closeupFactor smoothstep gate pattern for distance-adaptive shader parameters]

key-files:
  created: []
  modified: [js/scene/shaders.js]

key-decisions:
  - "closeupFactor uses smoothstep(30.0, 5.0, u_camDist) -- 0.0 at far, 1.0 at close, smooth transition"
  - "FBM octave gate uses u_camDist directly (not closeupFactor) since fbm() is a separate function"
  - "diskShading warpIntensity uses inline smoothstep since closeupFactor is main()-scoped"

patterns-established:
  - "closeupFactor pattern: multiply enhancement by closeupFactor to preserve far-distance appearance"
  - "Distance-adaptive parameter tuning via smoothstep gates in shader"

requirements-completed: [REND-01]

# Metrics
duration: 2min
completed: 2026-03-18
---

# Phase 11 Plan 03: BH Close-Up Detail Summary

**Distance-adaptive black hole shader with closeupFactor-driven FBM octaves, disk warp boost, sharper photon ring, and 1.5x glow at close range**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T03:09:00Z
- **Completed:** 2026-03-18T03:11:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added closeupFactor = smoothstep(30.0, 5.0, u_camDist) for smooth distance-based enhancement
- FBM octave early-break relaxed at u_camDist <= 10.0 (full 4 octaves for accretion disk detail)
- Disk warp intensity boosted from 1.5 to 2.0 at close range for more visible turbulence structure
- Photon ring sharpened (ringWidth 2.0 to 3.5) and glow boosted 1.5x when camera is close
- Far-distance appearance is mathematically identical to before (all enhancements multiply by closeupFactor=0.0)
- All shader invariants preserved (early escape, planet check range, step cap, iteration budget)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add closeupFactor and apply distance-adaptive shader parameters** - `d6ef9ce` (feat)

## Files Created/Modified
- `js/scene/shaders.js` - Fragment shader fsSource: added closeupFactor, modified fbm() octave gate, diskShading() warp intensity, and post-loop photon ring/glow

## Decisions Made
- closeupFactor is declared in main() scope so it's accessible in the post-loop section; fbm() and diskShading() use u_camDist directly since they're separate functions
- FBM gate uses `u_camDist > 10.0` threshold (not closeupFactor) for a clean boolean break vs. the 30->5 smoothstep transition
- Warp intensity uses inline smoothstep in diskShading() to avoid passing closeupFactor as a parameter

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- REND-01 (black hole dominates viewport with close-up detail) is satisfied
- Close-up rendering enhancements are live and smoothly transition based on camera distance
- All shader invariants preserved; tests.html should pass without changes

## Self-Check: PASSED

- FOUND: js/scene/shaders.js
- FOUND: 11-03-SUMMARY.md
- FOUND: d6ef9ce (Task 1 commit)

---
*Phase: 11-simulation-rescaling-viewport-cleanup*
*Completed: 2026-03-18*
