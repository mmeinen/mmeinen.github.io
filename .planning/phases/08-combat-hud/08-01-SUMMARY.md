---
phase: 08-combat-hud
plan: 01
subsystem: ui
tags: [dom, css-flexbox, hud, combat, per-frame-update]

# Dependency graph
requires:
  - phase: 03-direct-fire
    provides: weapon cooldown system (weaponCooldownEnd, KINETIC_COOLDOWN, PLASMA_COOLDOWN)
  - phase: 04-missiles
    provides: missile lock system (lockState, getLockCount, MISSILE_COOLDOWN_REGULAR, MISSILE_COOLDOWN_NUKE)
  - phase: 06-defense
    provides: player HP system (playerState.hp, hpBarEl, 3-color threshold)
  - phase: 07-waves
    provides: wave system (waveNumber, waveState, enemyCount)
provides:
  - unified bottom bar HUD with weapon boxes, HP bar, wave counter, orbit info, mode toggle
  - clickable weapon selection via DOM events
  - clickable combat/nav mode toggle
  - per-frame cooldown fill bars synced to simTime
affects: [09-tactical-targeting]

# Tech tracking
tech-stack:
  added: []
  patterns: [bottom-bar-flexbox-layout, per-frame-dom-update-from-game-state, cooldown-fill-from-simTime]

key-files:
  created: []
  modified: [index.html, css/style.css, js/scene/nav.js]

key-decisions:
  - "Old HUD elements hidden via CSS (display:none !important) rather than removed, preserving backward compatibility"
  - "Old combat indicator show/hide logic kept but simplified -- CSS hides the elements, JS just toggles display property harmlessly"
  - "WPN_CD_DURATIONS array declared inside render loop block scope to avoid global namespace pollution"
  - "Both old and new HP bar elements updated in parallel for safe resetCombat compatibility"

patterns-established:
  - "Bottom bar pattern: fixed-bottom flexbox container with z-index 26, shown via .nav-active parent class"
  - "Weapon box pattern: data-weapon attribute for click delegation, wpn-fill width set per frame from simTime"
  - "Dual-update pattern: new HUD elements updated alongside old ones during transition period"

requirements-completed: [HUD-01, HUD-02, HUD-03, HUD-07]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 8 Plan 01: Combat HUD Bottom Bar Summary

**Unified bottom bar with 4 weapon cooldown boxes, HP bar, wave counter, orbit info, and mode toggle -- all updating per-frame from game state**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T15:05:39Z
- **Completed:** 2026-03-14T15:09:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Built complete bottom bar DOM with 5 sections (weapons, HP, wave counter, orbit info, mode toggle) inside .hud-overlay
- All 4 weapon boxes show per-frame cooldown fill bars computed from simTime and weapon-specific durations
- Wave counter live-updates with enemy count, wave number, and INCOMING state during breather
- Orbit info displays current body/altitude/state or transfer destination name
- Click handlers for weapon selection (delegated on .hud-weapons) and mode toggle
- Old scattered HUD elements hidden via CSS when nav-active, without breaking existing JS references

## Task Commits

Each task was committed atomically:

1. **Task 1: Bottom bar DOM structure and CSS** - `c7435b0` (feat)
2. **Task 2: Per-frame render loop wiring and old reference cleanup** - `8ba9a5f` (feat)

## Files Created/Modified
- `index.html` - Bottom bar DOM structure, cached element references, click handlers, per-frame render loop updates for all 5 bar sections
- `css/style.css` - Bottom bar flexbox layout, weapon box styles with cooldown fills, HP bar with warning/critical classes, mode toggle, old HUD element hiding rules, mobile responsive rule
- `js/scene/nav.js` - resetCombat() now resets both old and new HP bar elements

## Decisions Made
- Old HUD elements hidden via CSS rather than removed from DOM, preserving backward compatibility with existing JS references
- Old combat mode indicator show/hide logic simplified but kept (CSS hides the elements anyway)
- WPN_CD_DURATIONS lookup array scoped inside render loop block to avoid global pollution
- Wave counter shows "INCOMING" during breather state rather than "0 ENEMIES"
- Enemy count uses singular "ENEMY" when count is 1

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Bottom bar provides complete situational awareness for Phase 9 (Tactical Targeting System)
- All weapon status, wave state, and orbit info consolidated into single bottom bar
- Mode toggle button provides mouse-driven combat/nav switching alongside F key

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 08-combat-hud*
*Completed: 2026-03-14*
