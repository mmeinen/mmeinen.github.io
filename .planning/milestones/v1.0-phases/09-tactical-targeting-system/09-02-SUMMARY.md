---
phase: 09-tactical-targeting-system
plan: 02
subsystem: ui
tags: [click-targeting, weapon-assignment, salvo-fire, multi-select, trajectory-preview, tactical-hud]

# Dependency graph
requires:
  - phase: 09-01-tactical-overlay
    provides: tactical marker DOM pool, T key toggle, per-frame marker positioning, tacTargets array, WEAPON_ABBREVS
  - phase: 03-direct-fire
    provides: fireKineticBurst, firePlasma, aimDir, weaponCooldownEnd
  - phase: 04-missiles
    provides: addLockTarget, clearLocks, fireMissileSalvo, lockState, updateLockLimits
  - phase: 08-combat-hud
    provides: bottom bar weapon UI, selectedWeapon state
provides:
  - click-to-select enemy targeting with shift-multi-select (up to 8 targets)
  - per-target weapon assignment with visual weapon badge
  - fireTacticalSalvo() coordinated multi-weapon fire via right-click
  - trajectory preview for most recently selected target
  - cooldown-aware weapon badges with dimmed styling
  - dead-target auto-cleanup from tacTargets
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [click-to-select-targeting, weapon-assignment-badges, coordinated-salvo-dispatch, tactical-trajectory-preview]

key-files:
  created: []
  modified: [index.html, css/style.css, js/scene/weapons.js, js/scene/nav.js]

key-decisions:
  - "Tactical click handler intercepts before normal combat click when tacticalMode active"
  - "fireTacticalSalvo groups targets by weapon type, saves/restores weapon state around dispatch"
  - "Missile/nuke salvos save and restore lockState to avoid corrupting normal lock-on flow"
  - "Assignments clear after firing but tactical mode stays active for immediate re-targeting"
  - "Tactical mode merged into combat mode as unified toggle (CR1) rather than separate mode"
  - "Marker info revealed on hover rather than always-visible to reduce visual clutter (CR2)"
  - "Missile lock-on targeting preserved when tactical overlay active (CR3 fix)"

patterns-established:
  - "Tactical target management: addTacTarget/removeTacTarget/clearTacTargets/getTacEntry for selection state"
  - "Coordinated salvo pattern: group by weapon type, dispatch each group with appropriate fire function, restore state"
  - "Weapon badge display: WEAPON_ABBREVS indexed by weaponIdx with cooldown-aware dimmed state"

requirements-completed: [HUD-05, HUD-06]

# Metrics
duration: 12min
completed: 2026-03-14
---

# Phase 9 Plan 02: Tactical Targeting and Salvo Fire Summary

**Click-to-select enemy targeting with weapon assignment badges, shift-multi-select up to 8 targets, and right-click coordinated salvo fire dispatching kinetic/plasma/missile/nuke at assigned targets**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-14T20:00:00Z
- **Completed:** 2026-03-14T20:12:00Z
- **Tasks:** 2 (1 implementation + 1 verification checkpoint)
- **Files modified:** 4

## Accomplishments
- Complete tactical targeting loop: select targets, assign weapons, preview trajectory, fire salvo, reassign
- Click-to-select with shift-multi-select supporting up to 8 simultaneous targets with per-target weapon assignment
- fireTacticalSalvo() dispatches coordinated multi-weapon salvos grouping by weapon type (kinetic auto-aim, plasma auto-aim, missile lock-on, nuke lock-on)
- Weapon badges show assigned weapon per target with cooldown-aware dimmed state showing remaining seconds
- Three post-implementation code review fixes: unified tactical/combat toggle, hover-to-reveal info, missile lock-on preservation

## Task Commits

Each task was committed atomically:

1. **Task 1: Target selection, weapon assignment, and salvo fire logic** - `99f1166` (feat)
   - CR1: Merge tactical mode into combat mode - `273501f` (fix)
   - CR2: Fix text selection blocking clicks + hover-to-reveal - `5420d60` (fix)
   - CR3: Fix missile lock-on targeting broken by tactical overlay - `cc230b5` (fix)
2. **Task 2: Visual verification** - checkpoint approved by user

## Files Created/Modified
- `index.html` - Tactical target management functions (addTacTarget, removeTacTarget, clearTacTargets, getTacEntry), click handler tactical mode branch with shift-multi-select, right-click salvo dispatch, per-frame selection state rendering with weapon badges and info panels, trajectory preview for selected targets, dead target cleanup
- `css/style.css` - Selection state styling (.tac-marker.selected .tac-ring), weapon badge (.tac-wpn with dimmed cooldown), info panel (.tac-info with HP display), hover-to-reveal interaction, user-select prevention on markers
- `js/scene/weapons.js` - fireTacticalSalvo() function grouping targets by weapon type and dispatching via appropriate fire functions with state save/restore
- `js/scene/nav.js` - Tactical mode reset integration in resetCombat()

## Decisions Made
- Tactical click handler intercepts before normal combat click logic when tacticalMode is active, with early return to prevent fall-through
- fireTacticalSalvo saves and restores selectedWeapon, aimDir, and lockState around each weapon group dispatch to avoid corrupting normal combat state
- Merged tactical mode into combat mode as a unified toggle (code review fix CR1) -- pressing T in combat toggles tactical rather than requiring separate mode
- Switched from always-visible info panels to hover-to-reveal interaction (code review fix CR2) to reduce visual clutter when many enemies are selected
- Fixed missile lock-on targeting that was broken by tactical overlay intercepting clicks (code review fix CR3) to preserve core gameplay functionality

## Deviations from Plan

### Auto-fixed Issues

**1. [CR1 - Rule 1 Bug] Tactical mode was a separate toggle from combat mode**
- **Found during:** Code review after Task 1
- **Issue:** Tactical mode and combat mode were separate toggles, creating confusing UX
- **Fix:** Merged tactical as a sub-mode within combat, unified T key toggle
- **Files modified:** index.html, js/scene/nav.js
- **Committed in:** `273501f`

**2. [CR2 - Rule 1 Bug] Text selection blocking clicks and visual clutter**
- **Found during:** Code review after Task 1
- **Issue:** Marker text was selectable (blocking click events) and info panels always visible on selection
- **Fix:** Added user-select: none to markers, switched to hover-to-reveal for info panels
- **Files modified:** css/style.css, index.html
- **Committed in:** `5420d60`

**3. [CR3 - Rule 1 Bug] Missile lock-on targeting broken by tactical overlay**
- **Found during:** Code review after Task 1
- **Issue:** Tactical click handler intercepted all clicks in combat+tactical mode, preventing missile lock-on
- **Fix:** Adjusted click handler logic to preserve missile targeting when tactical mode active
- **Files modified:** index.html, css/style.css
- **Committed in:** `cc230b5`

---

**Total deviations:** 3 auto-fixed (3 bug fixes from code review)
**Impact on plan:** All fixes necessary for correct UX and gameplay. No scope creep.

## Issues Encountered

None beyond the code review fixes documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 9 is the final phase. All v1 requirements are now complete.
- The full navigation combat system is playable: orbital mechanics, 4 weapon types, 5 enemy archetypes, wave progression, HUD, and tactical targeting.
- All 48 v1 requirements satisfied across 9 phases and 21 plans.

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 09-tactical-targeting-system*
*Completed: 2026-03-14*
