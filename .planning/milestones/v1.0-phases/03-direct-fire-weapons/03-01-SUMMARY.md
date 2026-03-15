---
phase: 03-direct-fire-weapons
plan: 01
subsystem: combat
tags: [weapons, projectiles, kinetic, plasma, soa, combat-mode, hit-detection]

# Dependency graph
requires:
  - phase: 01-combat-rendering-foundation
    provides: SoA entity store pattern, radial bin collision (getCollisionCandidates), enemy store
  - phase: 02-player-ship-orbital-movement
    provides: computeGravAccel, computeAimDir, flyPos, flyVel, aimDir, leapfrog integration
provides:
  - "Projectile SoA store (128 slots) with free-list allocation"
  - "Kinetic cannon: gravity-affected 5-round burst with ship velocity inheritance"
  - "Plasma gun: straight-line single bolt with distance-based despawn"
  - "Combat mode toggle (F key) separating fire from navigation"
  - "Weapon selection state (1/2 keys) with cooldown tracking"
  - "Projectile-vs-enemy hit detection using radial bins"
affects: [04-missile-systems, 05-enemy-behavior, 06-player-defense, 08-combat-hud]

# Tech tracking
tech-stack:
  added: []
  patterns: [projectile-soa-store, combat-mode-input-gate, weapon-cooldown-state-machine, burst-fire-with-simdt-stagger]

key-files:
  created: [js/scene/weapons.js]
  modified: [index.html, css/style.css, js/scene/nav.js]

key-decisions:
  - "Kinetic burst handled via simDt accumulator for correct bullet-time/fast-forward scaling"
  - "rebinEntities() called each frame in render loop to keep radial bins current for hit detection"
  - "1/2 keys gated on combatMode: weapon select in combat, camera presets when not in combat"
  - "Combat mode resets on exitNavMode to prevent stale state"

patterns-established:
  - "Combat mode input gate: check combatMode before orbit transfer in click handler"
  - "Weapon cooldown via simTime comparison (same pattern as missile cooldown)"
  - "Projectile SoA with free-list matching combat.js enemy store pattern"

requirements-completed: [WPN-01, WPN-02, WPN-03, WPN-04]

# Metrics
duration: 4min
completed: 2026-03-10
---

# Phase 3 Plan 01: Direct-Fire Weapons Core Summary

**Projectile SoA store with dual weapon types (gravity-kinetic + straight-line plasma), combat mode input separation, and radial-bin hit detection against enemies**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-10T18:00:39Z
- **Completed:** 2026-03-10T18:04:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created weapons.js module with full projectile lifecycle: spawn, physics update, despawn, hit detection
- Two distinct weapon types: kinetic cannon (gravity-affected, 5-round burst, ship velocity inheritance) and plasma gun (straight-line, single bolt, distance fade)
- Combat mode toggle cleanly separates weapon firing from orbit transfer navigation
- Hit detection uses existing radial bin system from combat.js for efficient spatial queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Create weapons.js -- projectile SoA, weapon configs, fire/update/hit-detect** - `94c9002` (feat)
2. **Task 2: Combat mode integration -- toggle, weapon select, fire-on-click, HUD** - `bc9bd42` (feat)

## Files Created/Modified
- `js/scene/weapons.js` - Projectile SoA store (128 slots), weapon configs, spawn/remove, kinetic burst, plasma fire, physics update with gravity, hit detection
- `index.html` - weapons.js script tag, combat mode F-key toggle, 1/2 weapon select, click-to-fire gate, updateProjectiles/checkProjectileHits in render loop, combat HUD elements, rebinEntities call
- `css/style.css` - .fly-hud-combat (orange warning indicator) and .fly-hud-weapon (blue HUD weapon selector) styles, mobile media query exclusions
- `js/scene/nav.js` - Updated controls help text with F and 1/2 key descriptions

## Decisions Made
- Kinetic burst uses simDt accumulator (`kineticBurstTimer`) so burst cadence scales correctly with bullet time and fast forward (Pitfall 5 from RESEARCH)
- Added `rebinEntities()` call each frame after enemy position updates, before hit detection -- required for `getCollisionCandidates()` to return correct candidates
- Gated 1/2 keys on `combatMode` flag so camera presets (navCamDist) still work when not in combat
- Combat mode resets (combatMode=false, HUD hidden) on exitNavMode to prevent stale state when toggling nav mode off

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added rebinEntities() call in render loop**
- **Found during:** Task 2 (render loop integration)
- **Issue:** `checkProjectileHits()` calls `getCollisionCandidates(r)` which reads radial bins, but `rebinEntities()` was never called in the render loop -- bins would be empty/stale
- **Fix:** Added `rebinEntities()` call after enemy position updates and before projectile updates
- **Files modified:** index.html
- **Verification:** Code review confirms bins are rebuilt each frame before hit detection queries
- **Committed in:** bc9bd42 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added combat mode reset on exitNavMode**
- **Found during:** Task 2 (combat mode toggle)
- **Issue:** If player exits nav mode (backtick key) while in combat mode, combatMode would stay true and HUD elements would remain visible
- **Fix:** Added `combatMode=false` and HUD hide calls after `exitNavMode()` in the keydown handler
- **Files modified:** index.html
- **Verification:** Code review confirms clean state reset
- **Committed in:** bc9bd42 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both auto-fixes essential for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Projectile SoA store is functional but invisible (no rendering yet)
- Plan 02 (03-02-PLAN.md) will add projectile rendering (kinetic tracers with trails, plasma glow bolts), trajectory preview with hit prediction, and crosshair visual
- WPN-11 (trajectory preview) deferred to Plan 02 as designed

---
*Phase: 03-direct-fire-weapons*
*Completed: 2026-03-10*
