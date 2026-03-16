---
phase: 10-scale-foundation
plan: 02
subsystem: scene
tags: [crr, camera-relative-rendering, log-depth, EXT_frag_depth, float32-precision, z-fighting]

# Dependency graph
requires:
  - "10-01: js/scene/scale.js for ORBIT_SCALE, BH_GM_KM, BODY_SCALE constants"
provides:
  - "Camera-relative rendering (CRR) in all nav/combat render paths"
  - "Logarithmic depth buffer via EXT_frag_depth in 4 fragment shaders"
  - "Gated perspective matrix: flyMode [1.0, 600000] vs normal [0.1, 500]"
  - "CRR pattern: camera at origin, entities subtract camWX/Y/Z before GPU upload"
  - "km-scale nav physics (computeGravAccelKm, getBodyPositionKm, getBodyVelocityKm)"
  - "Runtime EXT_frag_depth fallback: tighter near/far [10.0, 300000]"
affects: [10-03, 10-04, nav, combat, weapons, missiles, particles, explosions]

# Tech tracking
tech-stack:
  added: [EXT_frag_depth]
  patterns: [camera-relative-rendering, log-depth-buffer, gated-perspective-matrix]

key-files:
  created: []
  modified: [index.html, js/scene/shaders.js, js/scene/combat.js, js/scene/weapons.js, js/scene/missiles.js, js/scene/particles.js, js/scene/explosions.js, js/scene/nav.js, js/scene/orbital.js]

key-decisions:
  - "CRR uses camera-at-origin approach: mat4LookAt([0,0,0], lookTarget-camPos, up) with all entity positions camera-relative"
  - "Log depth formula: gl_FragDepthEXT = log2(1+w) / log2(1+600000) using gl_FragCoord.w"
  - "#ifdef GL_EXT_frag_depth guard in all shaders for graceful fallback"
  - "Camera position written to data view in abstract units (divided by ORBIT_SCALE) for ray march shader isolation"
  - "CRR world position stored as float64 (let _camWX/Y/Z) to preserve precision during subtraction"

patterns-established:
  - "CRR render boundary: all positions subtract _camWX/Y/Z before GPU upload, view matrix uses origin"
  - "Log depth in every 3D geometry fragment shader (ship, enemy, trajectory, billboard)"
  - "Gated perspective: flyMode uses km-scale near/far, normal mode unchanged at [0.1, 500]"
  - "Render functions accept camX/camY/camZ params for CRR (renderProjectiles, renderParticles, etc.)"

requirements-completed: [SCALE-04, SCALE-05, SCALE-06]

# Metrics
duration: 10min
completed: 2026-03-16
---

# Phase 10 Plan 02: CRR + Log Depth Summary

**Camera-relative rendering with camera-at-origin view matrix and EXT_frag_depth logarithmic depth buffer across all nav/combat render paths**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-16T18:56:28Z
- **Completed:** 2026-03-16T19:07:05Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Implemented CRR across all 14 render paths: enemies, ship, projectiles, particles, explosions, missiles, shield pieces, breakup debris, trajectory preview, orbit rings, L-points, aim line, missile trails, lock/tactical markers
- Added logarithmic depth buffer to 4 fragment shaders (ship, enemy, trajectory, billboard) with #ifdef guard
- Gated perspective matrix ensures normal mode is completely unaffected
- Included km-scale nav/orbital helper functions (computeGravAccelKm, getBodyPositionKm, getBodyVelocityKm) needed for CRR coordinate system

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement CRR in all nav/combat render paths** - `fd49472` (feat)
2. **Task 2: Add logarithmic depth buffer via EXT_frag_depth** - `6126588` (feat)

## Files Created/Modified
- `index.html` - CRR view matrix (camera at origin), gated perspective, EXT_frag_depth acquisition, CRR in inline renders (missiles, shields, breakup, trails, rings, markers)
- `js/scene/shaders.js` - Log depth in shipFS, trajFS, enemyFS, billboardFS fragment shaders
- `js/scene/combat.js` - updateInstanceBuffer accepts camX/Y/Z, subtracts camera before GPU upload
- `js/scene/weapons.js` - renderProjectiles and renderWeaponPreview accept and apply CRR offsets
- `js/scene/particles.js` - renderParticles accepts and applies CRR offsets
- `js/scene/explosions.js` - renderExplosions accepts and applies CRR offsets
- `js/scene/nav.js` - km-scale gravity (computeGravAccelKm), km-scale body helpers, enterNavMode km conversion
- `js/scene/orbital.js` - getBodyVelocityKm helper for km-scale orbital velocities

## Decisions Made
- CRR uses camera-at-origin approach rather than keeping world camera and not offsetting entities -- consistent with RESEARCH.md Pitfall 6 recommendation
- Log depth uses gl_FragCoord.w (reciprocal of clip-space w) rather than passing clip-space z via a varying -- simpler, one line per shader
- Camera position written to data view in abstract units (divided by ORBIT_SCALE) to maintain ray march shader isolation
- CRR world position stored as JS float64 variables (not Float32Array) to preserve full precision during subtraction

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed updateNav call site missing simTime parameter**
- **Found during:** Task 1 (CRR implementation)
- **Issue:** Pre-existing nav.js changes added simTime parameter to updateNav() but call site in index.html was not updated
- **Fix:** Changed `updateNav(simDtSec)` to `updateNav(simDtSec,simTime)`
- **Files modified:** index.html
- **Committed in:** fd49472 (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed ray march shader receiving km-scale camera position**
- **Found during:** Task 1 (CRR implementation)
- **Issue:** Pre-existing nav.js changes made flyPos km-scale, but the camera position written to data view (0x030) was not converted back to abstract units for the ray march shader
- **Fix:** Divide camera position by ORBIT_SCALE before writing to data view; read back and multiply by ORBIT_SCALE for CRR
- **Files modified:** index.html
- **Committed in:** fd49472 (Task 1 commit)

**3. [Rule 3 - Blocking] Fixed BH position uniform not CRR-adjusted**
- **Found during:** Task 1 (CRR implementation)
- **Issue:** Enemy shader u_bhPos uniform was hardcoded to (0,0,0) which is wrong in camera-relative space
- **Fix:** Set u_bhPos to (-_camWX, -_camWY, -_camWZ) for camera-relative BH position
- **Files modified:** index.html
- **Committed in:** fd49472 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking)
**Impact on plan:** All fixes necessary for CRR correctness. Pre-existing uncommitted km-scale nav changes required integration fixes. No scope creep.

## Issues Encountered
- Pre-existing uncommitted changes in nav.js and orbital.js (km-scale conversion started in a prior session) required integration with CRR. These changes were included in the Task 1 commit since CRR depends on them.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CRR and log depth are ready for all subsequent nav/combat rendering
- Combat entity positions (enemies, projectiles, etc.) still need km-scale conversion (Plan 03/04)
- Wave system spawn positions need km conversion (Plan 03/04)
- All render function signatures now accept camera position params
- No blockers for Plan 03 (combat rebalancing + gravity re-derivation)

## Self-Check: PASSED

- FOUND: js/scene/shaders.js
- FOUND: js/scene/combat.js
- FOUND: js/scene/weapons.js
- FOUND: js/scene/particles.js
- FOUND: js/scene/explosions.js
- FOUND: js/scene/nav.js
- FOUND: js/scene/orbital.js
- FOUND: index.html
- FOUND: 10-02-SUMMARY.md
- FOUND: commit fd49472
- FOUND: commit 6126588

---
*Phase: 10-scale-foundation*
*Completed: 2026-03-16*
