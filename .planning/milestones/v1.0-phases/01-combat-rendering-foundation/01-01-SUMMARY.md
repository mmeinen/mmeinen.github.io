---
phase: 01-combat-rendering-foundation
plan: 01
subsystem: rendering
tags: [webgl, instancing, entity-store, typed-arrays, spatial-partitioning, glsl]

# Dependency graph
requires: []
provides:
  - "SoA entity store with O(1) free-list allocation (combat.js)"
  - "Radial bin collision structure for O(n) broad-phase (combat.js)"
  - "Instance buffer packing for GPU upload -- 9 floats/instance (combat.js)"
  - "createGruntGeometry() -- angular wedge ship, 62 triangles (math.js)"
  - "enemyVS/enemyFS instanced enemy shader strings (shaders.js)"
affects: [01-02, phase-2, phase-5, phase-7]

# Tech tracking
tech-stack:
  added: []
  patterns: [SoA-typed-arrays, free-list-allocation, radial-bin-collision, flat-shaded-procedural-geometry, instanced-shader-attributes]

key-files:
  created: [js/scene/combat.js]
  modified: [js/scene/math.js, js/scene/shaders.js]

key-decisions:
  - "Instance stride is 9 floats (pos.xyz + heading + color.rgba + scale) per the plan's corrected layout"
  - "Grunt geometry uses 62 triangles with flat-shaded face normals following createBoxGeometry pattern"
  - "Dorsal fin given slight width (0.01 units) for bilateral visibility"

patterns-established:
  - "SoA entity store: parallel typed arrays with free-list for slot reuse"
  - "Instance buffer packing: iterate alive entities, write contiguous floats for GPU upload"
  - "Procedural geometry: tri/quad helpers with auto-computed face normals"
  - "Enemy shader program: per-instance attributes (divisor 1) with decomposed transforms"

requirements-completed: [PRF-04, ENM-11]

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 1 Plan 01: Combat Data Layer Summary

**SoA entity store with free-list allocation, radial bin collision, 62-triangle Grunt wedge geometry, and instanced enemy shaders with BH warp, accretion glow, and rim lighting**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T00:19:00Z
- **Completed:** 2026-03-10T00:22:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Entity store with SoA typed arrays, free-list O(1) allocation, and spawn/remove for up to 64 enemies
- Instance buffer packing (9 floats/instance) ready for GPU upload via ANGLE_instanced_arrays
- Radial bin collision structure partitions XZ plane into 20 bins for O(n) broad-phase candidate retrieval
- Procedural angular wedge Grunt geometry (62 triangles) with fuselage, engine nacelles, dorsal fin, ventral plate
- Instanced enemy vertex/fragment shaders with per-instance transforms, BH warp, accretion disk glow, rim lighting, and pulsing effects

## Task Commits

Each task was committed atomically:

1. **Task 1: Entity store, radial bins, and instance buffer packing** - `fcc5bf8` (feat)
2. **Task 2: Grunt geometry and enemy shader strings** - `7beda0d` (feat)

## Files Created/Modified
- `js/scene/combat.js` - Entity store (SoA typed arrays), spawn/remove with free-list, instance buffer packing (9 floats/instance), radial bin collision (20 bins, adjacent-bin queries)
- `js/scene/math.js` - Appended createGruntGeometry(): angular wedge ship with 62 flat-shaded triangles
- `js/scene/shaders.js` - Appended enemyVS (instanced vertex shader with BH warp, accretion glow) and enemyFS (directional + rim + engine glow, pulsing)

## Decisions Made
- Instance buffer stride set to 9 floats per the plan's corrected layout (pos.xyz + heading + color.rgba + scale)
- Grunt geometry finalized at 62 triangles (within 60-80 target) using tri/quad face-builder helpers with auto-computed flat normals
- Dorsal fin given 0.01-unit width for bilateral visibility (zero-width triangle would be invisible from one side)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All data structures and shader strings ready for Plan 02 to wire into index.html
- Plan 02 will: add script tags, create enemyPg shader program, set up instance buffers, spawn 50 test enemies, add instanced draw call to render loop
- No blockers or concerns

## Self-Check: PASSED

- FOUND: js/scene/combat.js
- FOUND: js/scene/math.js
- FOUND: js/scene/shaders.js
- FOUND: commit fcc5bf8
- FOUND: commit 7beda0d

---
*Phase: 01-combat-rendering-foundation*
*Completed: 2026-03-10*
