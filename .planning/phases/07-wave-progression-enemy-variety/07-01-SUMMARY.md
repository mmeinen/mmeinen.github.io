---
phase: 07-wave-progression-enemy-variety
plan: 01
subsystem: combat
tags: [wave-system, enemy-archetypes, instanced-rendering, geometry, webgl]

# Dependency graph
requires:
  - phase: 05-enemy-behavior-combat-feedback
    provides: "Enemy SoA store, AI state machine, instanced rendering pipeline"
  - phase: 06-player-defense-survival
    provides: "Off-screen indicators with archetype color array, game over/restart flow"
provides:
  - "Wave state machine with kill-triggered progression"
  - "5 enemy archetypes (GRUNT/SWARM/BOMBER/SNIPER/CAPITAL) with distinct geometry"
  - "Multi-geometry instanced rendering pipeline (per-archetype draw calls)"
  - "getArchetypeStats() contract for Plans 02/03 AI branches"
  - "getWaveDefinition() formula-driven wave composition"
  - "Wave announcement DOM/CSS with boss wave styling"
affects: [07-02, 07-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-geometry instanced rendering: per-archetype geometry VBOs with shared instance buffer"
    - "Type-grouped instance packing: updateInstanceBuffer sorts by ETYPE for efficient draw calls"
    - "Formula-driven wave composition with weighted random archetype selection"

key-files:
  created:
    - js/scene/waves.js
  modified:
    - js/scene/combat.js
    - js/scene/math.js
    - js/scene/nav.js
    - index.html
    - css/style.css

key-decisions:
  - "updateInstanceBuffer packs instances grouped by type (not slot order) for per-archetype draw calls"
  - "Multi-geometry rendering uses shared instance buffer with byte offset per archetype type"
  - "Wave breather duration is 4.0 seconds between waves"
  - "Enemy count formula: min(MAX_ENEMIES-8, floor(6 + wave*1.2)), reserving 8 slots for Capital minions"
  - "Boss waves at wave 10 and every 10th wave after with 1+ Capital ships"
  - "Archetype stats scale independently over 50 waves via getArchetypeStats()"

patterns-established:
  - "archetypeGeo array: 5-element array of {posBuf, nrmBuf, idxBuf, idxCount} for multi-geometry rendering"
  - "createGeoBuffers helper: converts geometry object to GL buffer set"
  - "Wave state machine pattern: IDLE->ACTIVE->BREATHER->ACTIVE cycle"

requirements-completed: [ENM-07, ENM-09]

# Metrics
duration: 10min
completed: 2026-03-12
---

# Phase 7 Plan 01: Wave Foundation Summary

**Wave state machine with kill-triggered progression, 5 enemy archetypes with distinct procedural geometry, and multi-geometry instanced rendering pipeline**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-12T17:26:43Z
- **Completed:** 2026-03-12T17:37:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extended ETYPE to 5 archetypes with distinct colors, scales, and HP values
- Created 4 new geometry functions: Swarm (dart), Bomber (bulky hull), Sniper (needle), Enemy Capital (hex cruiser)
- Built wave state machine with kill-triggered progression and breather periods
- Replaced single-geometry enemy rendering with per-archetype multi-geometry instanced draw loop
- Added wave announcement DOM with CSS fade animation and boss wave styling

## Task Commits

Each task was committed atomically:

1. **Task 1: ETYPE extension, archetype arrays, and 4 new geometry functions** - `0e485fe` (feat)
2. **Task 2: Wave module, multi-geo rendering, DOM wiring, and announcement CSS** - `8524a66` (feat)

## Files Created/Modified
- `js/scene/waves.js` - Wave state machine, spawner, difficulty scaling, getArchetypeStats()
- `js/scene/combat.js` - Extended ETYPE/ARCHETYPE arrays to 5 entries, auxTimer SoA, type-grouped instance packing
- `js/scene/math.js` - 4 new geometry functions (Swarm, Bomber, Sniper, Enemy Capital)
- `js/scene/nav.js` - Wire resetWaveSystem into resetCombat, set enemiesSpawned=false
- `index.html` - Multi-geo rendering loop, waves.js script tag, wave DOM, indicator colors, wave update call
- `css/style.css` - Wave announcement styling with fade animation and boss variant

## Decisions Made
- updateInstanceBuffer packs by type (all Grunts, then Swarms, etc.) and returns per-type counts for efficient multi-geometry draw calls
- Multi-geometry rendering uses shared instance buffer with calculated byte offsets per archetype, avoiding per-type buffer uploads
- Wave breather set to 4.0s for dramatic pacing between waves
- Enemy count grows at 1.2 per wave from base 6, capping at MAX_ENEMIES-8 to reserve slots for Capital minion spawns
- Boss waves every 10th wave starting at wave 10, with Capital count scaling by boss tier
- Archetype stats scale independently over 50 waves via getArchetypeStats() -- Snipers always accurate, Swarm always aggressive
- Enemy Capital ship uses hexagonal hull cross-section (vs player's octagonal) for visual distinction

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave system operational with Grunt-only early waves
- Multi-geometry pipeline ready for all 5 archetypes to render correctly
- getArchetypeStats() contract ready for Plans 02/03 AI branch consumption
- Plans 02/03 can now implement archetype-specific AI behaviors knowing geometry and rendering is in place

## Self-Check: PASSED

All 6 created/modified files verified on disk. Both task commits (0e485fe, 8524a66) verified in git log.

---
*Phase: 07-wave-progression-enemy-variety*
*Completed: 2026-03-12*
