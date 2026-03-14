---
phase: 07-wave-progression-enemy-variety
plan: 03
subsystem: combat
tags: [enemy-ai, sniper, capital, boss-wave, burst-fire, minion-spawning, warp-in-vfx, wave-skip]

# Dependency graph
requires:
  - phase: 07-wave-progression-enemy-variety
    plan: 02
    provides: "Swarm/Bomber AI branches, enemyFireMissile(), archetype-branched AI pattern, getArchetypeStats() consumption"
  - phase: 07-wave-progression-enemy-variety
    plan: 01
    provides: "ETYPE definitions (5 archetypes), multi-geometry rendering, wave state machine, getArchetypeStats()"
  - phase: 05-enemy-behavior-combat-feedback
    provides: "Grunt AI state machine, enemyFireAt(), enemy kinetic projectiles"
provides:
  - "Sniper burst fire AI with extreme-range engagement and distance maintenance"
  - "Capital minion-spawning AI with warp-in VFX and station-keeping"
  - "Boss wave composition (solo Capital at wave 10, multi-Capital at wave 20+)"
  - "Capital warp-in scale ramp effect in updateInstanceBuffer"
  - "Wave skip cheat (999) for testing"
  - "Complete 5-archetype enemy variety system"
affects: [08-01, 08-02, 09-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sniper burst fire: 3-round angular-spread kinetic burst with accuracy override parameter"
    - "Capital auxTimer lifecycle: -1.0 to 0 = warp-in (no combat), 0+ = minion spawn timer"
    - "Boss wave composition: Capital count = min(3, floor(wave/10)) with support cast"
    - "Wave skip cheat: track last 3 keydown digits within 1s, kill all enemies on 999"

key-files:
  created: []
  modified:
    - js/scene/combat.js
    - js/scene/weapons.js
    - js/scene/waves.js
    - index.html

key-decisions:
  - "Sniper fires instant 3-round burst (all rounds in single call) with angular spread of 0.03 rad between rounds"
  - "Sniper uses 0.3x guidance in TRANSFER for minimal pursuit, flees at dist < stats.fireRange"
  - "Capital auxTimer -1.0 to 0 = warp-in phase with scale ramp, 0+ = minion spawn timer"
  - "Capital spawns 2-3 Grunt minions every stats.attackCooldown seconds, minions set to AI_ALERT immediately"
  - "Capital fires heavy shot at auxTimer crossing 5.0 (midpoint between minion spawns)"
  - "Boss wave 10 = solo Capital introduction, wave 20 = 2 Capitals + support cast, wave 30+ = 3 Capitals"
  - "Wave skip cheat (999) kills all current enemies to trigger wave progression for testing"

patterns-established:
  - "Sniper burst fire function with accuracyOverride parameter for archetype-specific accuracy"
  - "Capital warp-in scale ramp: clamp((auxTimer+1.0)/0.5, 0, 1) in updateInstanceBuffer"
  - "Boss wave Capital count formula: min(3, floor(waveNum/10))"
  - "All 5 archetypes consume getArchetypeStats() for wave-scaled parameters"

requirements-completed: [ENM-04, ENM-05, ENM-08]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 7 Plan 03: Sniper and Capital Archetype AI Summary

**Sniper 3-round burst fire AI with extreme-range engagement, Capital minion-spawning boss with warp-in VFX, boss wave composition, completing all 5 enemy archetypes**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T13:53:00Z
- **Completed:** 2026-03-14T01:13:03Z (including checkpoint verification)
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Implemented Sniper AI with extreme-range detection, 3-round burst fire, distance maintenance, and close-range fleeing
- Implemented Capital AI with warp-in scale ramp VFX, station-keeping, 2-3 Grunt minion spawning every ~10s, and heavy shots
- Boss wave composition: solo Capital at wave 10, multi-Capital + support cast at wave 20+
- Wave skip cheat (999) for rapid testing to higher waves
- Visual verification approved: all 5 archetypes functional with distinct geometry, colors, and behaviors across 10+ waves

## Task Commits

Each task was committed atomically:

1. **Task 1: Sniper burst fire and Capital minion-spawning AI** - `937131b` (feat)
2. **Task 2: Visual verification of complete Phase 7** - checkpoint:human-verify (approved, no code changes)

## Files Created/Modified
- `js/scene/combat.js` - Sniper AI (extreme range, burst fire, flee close), Capital AI (warp-in, station-keep, minion spawn, heavy shots), warp-in scale ramp in updateInstanceBuffer
- `js/scene/weapons.js` - enemySniperBurst() 3-round kinetic burst with angular spread and accuracyOverride parameter
- `js/scene/waves.js` - Boss wave composition (Capital count formula, support cast), Capital spawn auxTimer=-1.0 setup with explosion flash
- `index.html` - Wave skip cheat (999 keydown sequence within 1s kills all enemies)

## Decisions Made
- Sniper fires all 3 rounds in a single call (instant burst) with 0.03 rad angular spread between rounds -- natural spatial spread at range
- Sniper uses minimal guidance (0.3x) during transfer to avoid aggressive pursuit, maintaining long-range engagement
- Capital auxTimer lifecycle cleanly separates warp-in phase (-1.0 to 0) from minion spawn timing (0+)
- Capital fires heavy kinetic shot when auxTimer crosses 5.0 (midpoint between minion spawns) for continuous pressure
- Boss wave 10 is solo Capital introduction so player learns the mechanic without support cast overwhelming them
- Wave skip cheat tracks last 3 keydown digits + timestamps, resets on timeout -- minimal state for reliable detection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 enemy archetypes (Grunt, Swarm, Bomber, Sniper, Capital) fully operational with wave-scaled difficulty
- Phase 7 complete: wave progression, difficulty scaling, boss waves, and archetype variety all functional
- Ready for Phase 8 (Combat HUD) which depends on Phases 3, 6, and 7
- Wave system provides wave number, enemy counts, and archetype data needed by HUD elements

## Self-Check: PASSED

All 4 modified files verified on disk. Task 1 commit (937131b) verified in git log. Task 2 was checkpoint:human-verify (approved, no commit).

---
*Phase: 07-wave-progression-enemy-variety*
*Completed: 2026-03-14*
