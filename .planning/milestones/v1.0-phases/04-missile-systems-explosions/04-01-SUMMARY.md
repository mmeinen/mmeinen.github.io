---
phase: 04-missile-systems-explosions
plan: 01
subsystem: weapons
tags: [missiles, soa, proportional-navigation, lock-on, fuel-system, webgl]

# Dependency graph
requires:
  - phase: 03-direct-fire-weapons
    provides: "Projectile SoA store pattern, weapons.js combat mode, selectedWeapon routing"
  - phase: 01-combat-rendering-foundation
    provides: "Enemy SoA store (enemies.posX/posZ/alive), radial bins, instanced rendering"
provides:
  - "Missile SoA store (24 slots) with free-list allocation, fuel, targetIdx, type fields"
  - "Lock-on targeting state machine (addLockTarget, removeLockTarget, clearLocks, updateLockLimits)"
  - "findLockTarget: screen-space enemy detection for crosshair lock-on"
  - "PN guidance reading live enemy positions each frame"
  - "Fuel depletion with coast phase and self-destruct logic (WPN-08)"
  - "Nuclear missile detonation via detSlots volumetric shader system"
  - "4-weapon selection (kinetic, plasma, regular missile, nuclear missile)"
  - "Lock reticle CSS classes for Plan 03 rendering"
affects: [04-02, 04-03, phase-5-enemy-behavior, phase-6-player-defense]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Missile SoA with fuel/coast lifecycle", "Lock-on state machine with weapon-type-dependent limits"]

key-files:
  created: []
  modified:
    - "js/scene/missiles.js"
    - "js/scene/weapons.js"
    - "index.html"
    - "css/style.css"
    - "js/scene/nav.js"

key-decisions:
  - "Missile SoA store named 'missile' (singular) to distinguish from old 'missiles' AoS array"
  - "Lock-on limits are weapon-type-dependent: regular=6 targets x 3 per, nuclear=3 targets x 1 per"
  - "Left-click adds lock, right-click fires salvo (in missile mode)"
  - "onMissileDetonate is a stub -- Plan 02/03 wires explosion visuals"
  - "Old AoS missile trail rendering removed entirely -- Plan 03 adds SoA-based trail rendering"
  - "Nuclear missiles rendered 1.8x larger than regular with whiter color"

patterns-established:
  - "Lock-on state machine pattern: addLockTarget/removeLockTarget/clearLocks/updateLockLimits"
  - "Weapon-type-dependent parameters via updateLockLimits() on weapon switch"
  - "Missile fuel lifecycle: powered (PN guidance + thrust) -> coast (gravity only) -> self-destruct"

requirements-completed: [WPN-05, WPN-07, WPN-08, WPN-10]

# Metrics
duration: 13min
completed: 2026-03-10
---

# Phase 4 Plan 01: Missile Core Flight Logic Summary

**Missile SoA store with PN guidance tracking live enemy positions, fuel/coast lifecycle, lock-on salvo targeting, and 4-weapon selection**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-10T19:08:44Z
- **Completed:** 2026-03-10T19:21:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Complete missiles.js rewrite from array-of-objects to SoA store with 24 slots and free-list
- Lock-on targeting state machine with weapon-type-dependent limits (regular: 6x3, nuclear: 3x1)
- PN guidance reads live enemy positions each frame, with fuel depletion and coast/self-destruct
- 4-weapon selection system (keys 1-4) with per-weapon cooldown tracking
- Left-click lock, right-click fire salvo control scheme for missile modes

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite missiles.js -- SoA store, lock-on state, fuel system, PN guidance** - `dbffb62` (feat)
2. **Task 2: Extend weapon selection to 4 slots and wire lock-on + salvo into index.html** - `95262ca` (feat)

## Files Created/Modified
- `js/scene/missiles.js` - Complete SoA missile store, lock-on state machine, PN guidance, fuel system, detonation functions
- `js/scene/weapons.js` - Extended weaponCooldownEnd to 4 slots, fireSelectedWeapon routes missiles, computeWeaponPreview skips missile modes
- `index.html` - Key 3/4 handlers, left-click lock targeting, right-click salvo fire, SoA missile body rendering, lock target markers, 4-weapon HUD
- `css/style.css` - Lock reticle and lock count overlay CSS classes
- `js/scene/nav.js` - enterNavMode/exitNavMode reset new missile SoA state, updated controls help text

## Decisions Made
- Missile SoA store named `missile` (singular) to clearly distinguish from the old `missiles` AoS array
- Lock-on limits vary by weapon type: regular missiles allow 6 targets with 3 missiles each (18 max), nuclear allows 3 targets with 1 each (3 max)
- Left-click adds lock targets, right-click fires salvo -- this preserves left-click for direct-fire weapons when not in missile mode
- `onMissileDetonate` is intentionally a stub -- Plan 02 will implement sprite explosions and wire them in
- Old AoS missile trail rendering was removed entirely rather than adapted, since Plan 03 will add proper SoA-based trail rendering
- Nuclear missiles rendered 1.8x larger than regular with `NUKE_MISSILE_COLOR` (whiter) to be visually distinct

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed runtime reference safety for cross-file globals**
- **Found during:** Task 1 (missiles.js rewrite)
- **Issue:** missiles.js loads before weapons.js, so `selectedWeapon` and `weaponCooldownEnd` are undefined at parse time
- **Fix:** Added `typeof` guards in updateMissileUI and fireMissileSalvo for defensive runtime access
- **Files modified:** js/scene/missiles.js
- **Verification:** Functions safely handle missing globals during initial load
- **Committed in:** dbffb62 (Task 1 commit)

**2. [Rule 3 - Blocking] Updated nav.js references to new missile API**
- **Found during:** Task 2 (index.html integration)
- **Issue:** enterNavMode/exitNavMode referenced old `missileState`, `missileTargets`, `missiles` variables that no longer exist
- **Fix:** Replaced with `clearLocks()` and SoA missile removal loop
- **Files modified:** js/scene/nav.js
- **Verification:** No remaining references to old missile variables in any file
- **Committed in:** 95262ca (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary to prevent runtime errors. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Missile flight logic complete and integrated -- missiles spawn, guide, fuel-deplete, and detonate
- Plan 02 (sprite explosions) can now wire `onMissileDetonate` to `spawnExplosion()`
- Plan 03 (rendering integration) can now add SoA-based trail rendering and lock reticle positioning
- All old AoS missile code cleaned up -- no stale references remain

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 04-missile-systems-explosions*
*Completed: 2026-03-10*
