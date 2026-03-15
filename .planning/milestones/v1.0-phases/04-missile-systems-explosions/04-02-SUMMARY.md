---
phase: 04-missile-systems-explosions
plan: 02
subsystem: rendering
tags: [webgl, billboard, sprite-sheet, instanced-rendering, explosion-fx]

# Dependency graph
requires:
  - phase: 01-combat-rendering-foundation
    provides: "Instanced rendering pipeline (ANGLE_instanced_arrays), SoA entity store pattern, cS shader compile helper"
provides:
  - "Billboard explosion SoA store (spawnExplosion, updateExplosions, renderExplosions)"
  - "Procedural 6-frame sprite sheet texture (flash -> fireball -> fade)"
  - "Billboard vertex/fragment shader strings (billboardVS, billboardFS)"
  - "initExplosionSystem(gl, ext) for GL resource setup"
affects: [04-03-rendering-integration, 05-enemy-behavior]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Billboard camera-facing quads via view matrix column extraction", "Procedural Canvas 2D sprite sheet generation at init time"]

key-files:
  created: [js/scene/explosions.js]
  modified: [js/scene/shaders.js]

key-decisions:
  - "Billboard shaders defined as const strings in shaders.js, compiled at runtime by initExplosionSystem using global cS helper"
  - "Sprite sheet uses texture unit 1 to avoid conflicting with blackbody/noise textures on unit 0"
  - "Additive blending (SRC_ALPHA, ONE) for bright fireball visual effect"
  - "depthMask(false) during billboard draw to prevent transparent billboards from occluding"

patterns-established:
  - "Billboard rendering: extract camRight/camUp from view matrix columns [0] and [1]"
  - "Sprite sheet UV: horizontal strip with texel inset (0.5 / (frameCount * frameSize)) to prevent frame bleeding"
  - "Explosion lifecycle: SoA store with free-list, age-based frame selection, auto-remove at duration expiry"

requirements-completed: [WPN-09, VFX-03]

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 4 Plan 02: Billboard Explosion System Summary

**Instanced billboard explosion renderer with procedural 6-frame sprite sheet (flash -> fireball -> fade), SoA store for 24 simultaneous explosions, and camera-facing quads via view matrix extraction**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T19:08:16Z
- **Completed:** 2026-03-10T19:11:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Billboard vertex/fragment shaders added to shaders.js with camera-facing orientation and sprite sheet UV mapping
- Complete explosion SoA store (24 slots) with free-list allocation and age-based lifecycle management
- Procedural 6-frame sprite sheet generated at init: white flash core -> yellow-orange fireball -> transparent fade
- Instanced rendering via drawElementsInstancedANGLE draws all active explosions in a single draw call

## Task Commits

Each task was committed atomically:

1. **Task 1: Add billboard shader source strings to shaders.js** - `e1632fe` (feat)
2. **Task 2: Create explosions.js -- SoA store, procedural sprite sheet, billboard rendering** - `866c921` (feat)

## Files Created/Modified
- `js/scene/shaders.js` - Added billboardVS and billboardFS shader source strings (32 lines appended, no existing shaders modified)
- `js/scene/explosions.js` - Complete billboard explosion system: SoA store, sprite sheet generator, GL init, instanced render (278 lines)

## Decisions Made
- Used global `cS` shader compile helper from index.html (available at runtime when initExplosionSystem is called)
- Sprite sheet uploaded to texture unit 1 to avoid conflicting with existing blackbody/noise textures on unit 0
- Additive blending (SRC_ALPHA, ONE) chosen for visually bright fireball appearance
- Added depthMask(false) during billboard draw to prevent transparent billboards from writing to depth buffer
- Attribute divisors reset to 0 after draw and vertex attribs disabled to prevent GL state leak (per Phase 1 convention)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Billboard explosion system is complete and ready for integration in Plan 04-03
- spawnExplosion(x, y, z, size) is the public API for triggering explosions
- initExplosionSystem(gl, ext) must be called from index.html during GL setup
- renderExplosions(gl, ext, viewMat, viewProjMat) must be called each frame in the render loop
- explosions.js script tag must be added to index.html (Plan 04-03 handles this)

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 04-missile-systems-explosions*
*Completed: 2026-03-10*
