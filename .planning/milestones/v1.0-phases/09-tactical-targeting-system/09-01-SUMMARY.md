---
phase: 09-tactical-targeting-system
plan: 01
subsystem: ui
tags: [dom-pool, css, webgl, tactical-overlay, per-frame-update, range-rings]

# Dependency graph
requires:
  - phase: 06-defense
    provides: off-screen enemy indicator DOM pool pattern, ARCHETYPE_COLORS, enemy SoA store
  - phase: 07-waves
    provides: wave system, enemy archetype variety (5 types), resetWaveSystem
  - phase: 08-combat-hud
    provides: bottom bar HUD (z-index 26, stays visible in tactical mode)
provides:
  - tacticalMode boolean toggle via T key (requires combat mode)
  - 64-element tactical marker DOM pool with cached sub-element references
  - per-frame marker positioning via screen projection for all alive enemies
  - archetype abbreviation and distance display on each marker
  - 4 GL range rings on XZ plane for spatial reference
  - CSS foundation for selection rings, weapon badges, info panels (Plan 02 activates)
affects: [09-02-tactical-selection-fire]

# Tech tracking
tech-stack:
  added: []
  patterns: [tactical-dom-overlay, per-frame-marker-projection, gl-range-rings, tac-hidden-class-toggle]

key-files:
  created: []
  modified: [index.html, css/style.css, js/scene/nav.js]

key-decisions:
  - "Tactical mode gated on combatMode -- T key does nothing outside combat"
  - "Off-screen enemies hidden entirely in tactical mode (no edge markers)"
  - "Reuse existing ringBuf/ringArray for range ring rendering (zero allocation)"
  - "Range ring radii [30, 50, 70, 90] covering inner through outer orbital zones"
  - "Cached sub-element references (el._typeSpan etc.) to avoid querySelector per frame"
  - "Archetype-specific marker text color from ARCHETYPE_COLORS array"

patterns-established:
  - "Tactical marker pool pattern: 64 DOM elements with cached child refs, positioned via CSS transform per frame"
  - "tac-hidden class pattern: toggle on indicatorEls to hide regular indicators when tactical active"
  - "Tactical state reset: all mode exits (F key, backtick, Escape, resetCombat) reset tacticalMode/tacTargets/tac-hidden"

requirements-completed: [HUD-04]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 9 Plan 01: Tactical Overlay Foundation Summary

**T-key tactical overlay with DOM marker pool for all enemies showing archetype abbreviation + distance, per-frame screen projection positioning, and 4 GL range rings on the orbital plane**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T19:49:18Z
- **Completed:** 2026-03-14T19:53:39Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Built complete tactical marker CSS with styles for type text, distance, selection ring, weapon badge, and info panel
- Created 64-element tactical marker DOM pool with cached sub-element references for zero-querySelector render loop
- Implemented per-frame marker positioning using standard camera vector screen projection formula
- Added 4 GL range rings at radii [30, 50, 70, 90] reusing existing ring buffer infrastructure
- Wired T key toggle gated on combat mode, with comprehensive state reset across all exit paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Tactical DOM structure, marker pool, CSS, and T key toggle** - `fdf4513` (feat)
2. **Task 2: Per-frame marker positioning and GL range rings** - `59157f1` (feat)

## Files Created/Modified
- `css/style.css` - Tactical marker styles (.tac-marker, .tac-type, .tac-dist, .tac-ring, .tac-wpn, .tac-info, .tac-hp), tac-hidden indicator rule
- `index.html` - Tactical state variables, DOM pool creation with cached refs, toggleTacticalMode(), T key handler, per-frame marker update in render loop, GL range ring drawing, tactical reset in all exit paths
- `js/scene/nav.js` - Tactical mode reset in resetCombat() function

## Decisions Made
- Tactical mode requires combat mode active (T key ignored otherwise) -- prevents confusion about when tactical is available
- Off-screen enemies are hidden entirely in tactical mode (not shown at edges) -- per user decision from CONTEXT.md
- Reused existing ringBuf/ringArray for range ring rendering to avoid per-frame allocation
- Set range ring alpha to 0.08 (very faint) so rings provide context without visual clutter
- Cached querySelector results as el._typeSpan etc. during pool creation for render loop performance
- Archetype text color uses ARCHETYPE_COLORS array for type-specific coloring (red for Grunt, amber for Swarm, etc.)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Tactical marker DOM pool ready for Plan 02 click-to-select targeting
- All CSS classes for selection state (.selected, .tac-ring, .tac-wpn, .tac-info) defined and hidden by default
- tacTargets array ready for Plan 02 weapon assignment state
- Bottom bar remains fully functional during tactical mode

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 09-tactical-targeting-system*
*Completed: 2026-03-14*
