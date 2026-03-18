---
phase: 11-simulation-rescaling-viewport-cleanup
plan: 02
subsystem: rendering
tags: [lod, billboard, webgl, instancing, gl-points]

# Dependency graph
requires:
  - phase: 10-scale-foundation
    provides: km-scale enemy positions and CRR rendering pipeline
  - phase: 11-01
    provides: combat always-on and viewport purification
provides:
  - Three-tier enemy LOD system (full geometry, billboard dots, culled)
  - Billboard data arrays and per-archetype GL_POINTS rendering
  - LOD distance constants (LOD_FULL_DIST, LOD_BILLBOARD_DIST)
affects: [12-combat-ai-weapons, rendering-performance]

# Tech tracking
tech-stack:
  added: []
  patterns: [distance-based LOD with hard cuts, billboard GL_POINTS reusing trajectory shader]

key-files:
  created: []
  modified: [js/scene/combat.js, index.html]

key-decisions:
  - "XZ-plane distance for LOD thresholds (Y near 0 in 2D orbital game)"
  - "Billboard sizes: Grunt=3.0px, Swarm=2.5px, Bomber=4.0px, Sniper=3.5px, Capital=8.0px"
  - "Hard LOD cuts (no cross-fade) -- simple and sufficient for distant dots"
  - "Reuse trajPg shader for billboard rendering (GL_POINTS with uniform color/size)"

patterns-established:
  - "LOD distance split in updateInstanceBuffer: full-geo path packs instanceData, billboard path packs billboardData"
  - "Billboard rendering uses per-archetype draw calls with ARCHETYPE_COLORS and BILLBOARD_SIZES arrays"

requirements-completed: [REND-04]

# Metrics
duration: 3min
completed: 2026-03-18
---

# Phase 11 Plan 02: Enemy LOD Summary

**Three-tier enemy LOD: full geometry <10k km, colored billboard dots 10k-50k km, culled beyond 50k km**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-18T03:17:14Z
- **Completed:** 2026-03-18T03:20:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- LOD distance check splits enemies into full-geometry and billboard buffers in updateInstanceBuffer
- Billboard enemies render as archetype-colored GL_POINTS with distinct sizes (Capital 8px, Grunt 3px)
- Enemies beyond 50,000 km are fully culled (zero GPU cost)
- Billboard dots are depth-tested against full-geometry enemies for correct occlusion

## Task Commits

Each task was committed atomically:

1. **Task 1: Add LOD distance check and billboard data arrays to combat.js** - `cdd27a5` (feat)
2. **Task 2: Render billboard enemies as GL_POINTS in the render loop** - `1bd8f75` (feat)

## Files Created/Modified
- `js/scene/combat.js` - LOD constants, billboard data arrays, distance-split updateInstanceBuffer
- `index.html` - billboardGlBuf creation, billboard GL_POINTS rendering block after instanced enemy draw

## Decisions Made
- XZ-plane distance used for LOD (game is 2D orbital, Y always near 0)
- Billboard sizes chosen for visual hierarchy: Capital=8.0px clearly larger than Grunt=3.0px
- Hard LOD cuts with no cross-fade (intentional -- dots at 10k+ km don't need smooth transition)
- Billboard buffer placed inside enemyCount>0 scope alongside instResult for access to bbTotalCount/bbTypeCounts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Enemy LOD system complete with three tiers
- Ready for Phase 11-03 (already completed per STATE.md -- this was wave 2 dependency)
- Billboard rendering pattern available for reuse if other entity types need LOD

---
*Phase: 11-simulation-rescaling-viewport-cleanup*
*Completed: 2026-03-18*
