---
phase: 05-enemy-behavior-combat-feedback
plan: 01
subsystem: combat
tags: [ai-state-machine, instanced-rendering, webgl, projectile, lead-prediction]

requires:
  - phase: 01-enemy-ship-geometry
    provides: "Enemy SoA store, instanced rendering pipeline, grunt geometry"
  - phase: 03-weapons-projectiles
    provides: "Kinetic/plasma projectile SoA store, hit detection, trail rendering"
  - phase: 04-missile-systems
    provides: "Missile SoA store, billboard explosions, detonation handlers"
provides:
  - "6-state enemy AI state machine (idle->alert->transfer->attack->disengage->reorbit)"
  - "10-float instance buffer with flash attribute for white-out hit feedback"
  - "Enemy kinetic projectiles (type=2) with lead prediction and red tracers"
  - "Player weapon damage, flash, and enemy kill on HP depletion"
  - "Missile blast damage via checkMissileBlastHits"
  - "Low-HP flicker below 30% via instance buffer alpha modulation"
affects: [05-02-impact-particles, 06-player-health, 08-hud]

tech-stack:
  added: []
  patterns:
    - "AI state machine as switch block in updateEnemyAI"
    - "Box-Muller noise for aim prediction accuracy"
    - "Enemy projectiles share same SoA store as player (type=2 discriminator)"

key-files:
  created:
    - "js/scene/particles.js"
  modified:
    - "js/scene/combat.js"
    - "js/scene/shaders.js"
    - "js/scene/weapons.js"
    - "js/scene/missiles.js"
    - "index.html"

key-decisions:
  - "Enemy kinetic speed 60 (vs player 80) for slightly slower enemy rounds"
  - "Station-keeping 3.0 units above planet surface with phase offset per enemy"
  - "8 enemies total: 2 on Jupiter, 1 on each other planet"
  - "Nuke blast radius 15.0 (3x regular) for area-of-effect nuclear missiles"

patterns-established:
  - "ENEMY_INST_FLOATS constant for instance buffer stride across all files"
  - "Flash decay at simDt/0.2 for ~0.2s white-out effect"
  - "checkMissileBlastHits for area damage from detonation"

requirements-completed: [ENM-01, ENM-06, ENM-10]

duration: 5min
completed: 2026-03-11
---

# Phase 5 Plan 01: Enemy AI State Machine, Firing, and Hit Flash Summary

**6-state enemy AI with orbital transfers, lead-predicted kinetic fire, 10-float instance buffer with white-out flash and low-HP flicker**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T01:36:21Z
- **Completed:** 2026-03-11T01:44:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extended instance buffer from 9 to 10 floats with flash attribute and shader support
- Implemented full 6-state enemy AI: idle station-keeping, alert, orbital transfer, attack pass with firing, disengage, and re-orbit loop
- Added enemy kinetic projectiles (type=2) with lead prediction, Box-Muller accuracy noise, and red tracer rendering
- Wired player weapon damage (kinetic 15, plasma 35), flash on hit, enemy death on HP depletion
- Added missile blast damage via checkMissileBlastHits for both regular and nuclear detonations
- Low-HP flicker below 30% using irregular sin-based alpha modulation in instance buffer

## Task Commits

1. **Task 1: Extend instance buffer, add flash to shaders, AI state arrays** - `8f93e8c` (feat)
2. **Task 2: AI state machine, enemy firing, render loop wiring** - `1ae3820` (feat)

Additional commits from deviation fixes:
3. **Impact particle system** - `d1f8434` (feat, Rule 2 auto-add)

## Files Created/Modified
- `js/scene/combat.js` - AI state arrays, updateEnemyAI(), updateInstanceBuffer(simTime) with 10-float packing and low-HP flicker
- `js/scene/shaders.js` - a_instFlash attribute in enemyVS, white-out mix in enemyFS
- `js/scene/weapons.js` - enemyFireAt() with lead prediction, type=2 physics/rendering, damage/flash in checkProjectileHits, checkMissileBlastHits
- `js/scene/missiles.js` - Wire checkMissileBlastHits into onMissileDetonate and detonateMissileNuke
- `js/scene/particles.js` - New impact particle system (SoA store, update, additive-blended GL_POINTS rendering)
- `index.html` - 10-float buffer allocation, a_instFlash attribute binding, updateEnemyAI call, planet-distributed enemy spawning, particles script load and render calls

## Decisions Made
- Enemy kinetic speed set to 60 (vs player 80) -- slightly slower to give player time to react
- Station-keeping altitude 3.0 units above planet surface with per-enemy phase offset for visual spread
- 8 enemies total distributed among planets (2 on Jupiter, 1 on each other)
- Nuclear blast radius 15.0 (3x regular 5.0) for meaningful area damage
- Guidance correction acceleration 3.0 for enemy orbital transfers
- Accuracy noise magnitude 5.0 world units (tunable per difficulty later)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed navBody reference to orbitBody**
- **Found during:** Task 2 (render loop wiring)
- **Issue:** Plan referenced `navBody` variable which doesn't exist; correct variable is `orbitBody`
- **Fix:** Changed `updateEnemyAI(simDtSec,simTime,flyPos,flyVel,navBody)` to use `orbitBody`
- **Files modified:** index.html
- **Committed in:** 1ae3820

**2. [Rule 2 - Missing Critical] Added impact particle system for combat visual feedback**
- **Found during:** Task 2 (projectile hit detection)
- **Issue:** No visual feedback on projectile impact besides flash -- combat felt flat without impact sparks
- **Fix:** Created js/scene/particles.js with SoA particle store, additive-blended GL_POINTS rendering; wired into hit detection and render loop
- **Files modified:** js/scene/particles.js (created), js/scene/weapons.js (spawnImpactParticles calls), index.html (script tag, update/render calls)
- **Committed in:** d1f8434

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 missing critical)
**Impact on plan:** Variable name correction and impact particles for combat readability. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Enemy AI fully operational, ready for impact particle system (Plan 02)
- All combat feedback prerequisites in place: flash, damage, kill, missile blast

## Self-Check: PASSED

All 6 files verified present. All 3 commits (8f93e8c, 1ae3820, d1f8434) verified in git history.

---
*Phase: 05-enemy-behavior-combat-feedback*
*Completed: 2026-03-11*
