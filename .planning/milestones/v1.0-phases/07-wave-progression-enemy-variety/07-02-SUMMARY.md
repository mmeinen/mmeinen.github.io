---
phase: 07-wave-progression-enemy-variety
plan: 02
subsystem: combat
tags: [enemy-ai, swarm, bomber, missiles, archetype-behavior, wave-scaling]

# Dependency graph
requires:
  - phase: 07-wave-progression-enemy-variety
    plan: 01
    provides: "ETYPE definitions, getArchetypeStats() contract, auxTimer SoA field, multi-geometry rendering"
  - phase: 06-player-defense-survival
    provides: "Shield absorption pattern, applyPlayerDamage, destroyShieldPiece"
  - phase: 04-missiles-explosions
    provides: "Missile SoA store, PN guidance, spawnExplosion, onMissileDetonate"
provides:
  - "Swarm converging rush AI with ram damage (ETYPE.SWARM branch in updateEnemyAI)"
  - "Bomber missile salvo AI with hold-position behavior (ETYPE.BOMBER branch in updateEnemyAI)"
  - "enemyFireMissile() for enemy-spawned player-targeting missiles"
  - "missile.source SoA field distinguishing player vs enemy missiles"
  - "Shield absorption of enemy missiles before hull damage"
affects: [07-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Archetype-branched AI: switch on eType within each AI state for distinct behaviors"
    - "Enemy missile targeting: targetIdx=-1 convention for player-targeting missiles"
    - "Shield-before-hull absorption: shared pattern for enemy projectiles and enemy missiles"

key-files:
  created: []
  modified:
    - js/scene/combat.js
    - js/scene/missiles.js

key-decisions:
  - "Swarm uses continuous thrust toward player in both TRANSFER and ATTACK states for aggressive rushing"
  - "Swarm ram damage 15 HP per hit with wave-scaled cooldown via auxTimer"
  - "Bomber fires 3-missile salvos with +/-5 degree angular spread for visual variety"
  - "Enemy missiles use 70% of MISSILE_SPEED with 5.0s fuel (shorter than player missiles)"
  - "Enemy missile detonation deals 40 HP damage, absorbed by shield pieces first"
  - "Bomber retreats at dist < 10 and needs 30 units distance before re-engaging"
  - "auxTimer initialized to 10.0 in spawnEnemy so first trigger fires immediately"

patterns-established:
  - "getArchetypeStats() consumption: stats retrieved once per enemy per frame at top of AI loop"
  - "Guidance multiplier pattern: guidanceMul scales GUIDANCE_ACCEL_ENEMY per archetype"
  - "missile.source field: 0=player, 1=enemy for detonation routing"

requirements-completed: [ENM-02, ENM-03]

# Metrics
duration: 7min
completed: 2026-03-12
---

# Phase 7 Plan 02: Swarm and Bomber Archetype AI Summary

**Swarm converging rush with ram damage and Bomber missile salvo AI with enemy-fired player-targeting missiles and shield absorption**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-12T17:41:08Z
- **Completed:** 2026-03-12T17:48:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Implemented Swarm AI with aggressive convergence (2x guidance, continuous thrust) and ram damage (15 HP per hit)
- Implemented Bomber AI with medium-range hold-position behavior and 3-missile salvo attacks
- Added enemyFireMissile() for enemy-spawned missiles targeting the player via flyPos
- Extended missile pipeline with source field and player-targeting support (targetIdx=-1)
- Shield pieces absorb enemy missiles before hull damage, matching existing projectile shield pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Swarm converging rush AI with ram damage** - `bb68567` (feat)
2. **Task 2: Bomber missile salvo AI and enemy-fired missiles** - `bdbe69e` (feat)

## Files Created/Modified
- `js/scene/combat.js` - Archetype-branched AI in updateEnemyAI: Swarm rush/ram, Bomber hold/salvo, wave-scaled stats
- `js/scene/missiles.js` - missile.source SoA, enemyFireMissile(), targetIdx=-1 handling, enemy missile shield absorption

## Decisions Made
- Swarm uses continuous 2.0 thrust toward player in both TRANSFER and ATTACK states, creating relentless rush behavior
- Swarm stays in TRANSFER until dist < 3.0 (bypassing normal ATTACK_RANGE transition) for close-range ramming
- Ram damage (15 HP) is gated by wave-scaled cooldown from getArchetypeStats, with auxTimer initialized to 10.0 so first trigger is immediate
- Bomber 3-missile salvo uses angular spread (-5, 0, +5 degrees) applied via rotation matrix on initial velocity
- Enemy missiles are 70% speed with 5.0s fuel, making them dodgeable but dangerous
- Shield absorption check for enemy missiles replicates the exact pattern from weapons.js checkProjectileHits type=2 handler
- Bomber disengage threshold increased to 30 units (vs 20 for Grunt) for more dramatic repositioning arcs
- Bomber AI included in Task 1 combat.js commit for code continuity (shared switch block)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Included Bomber AI in combat.js during Task 1**
- **Found during:** Task 1 (Swarm AI)
- **Issue:** The Bomber AI_ATTACK and AI_DISENGAGE branches share the same switch block as Swarm; splitting them across tasks would require two edits to the same function
- **Fix:** Included Bomber AI branches in the combat.js edit during Task 1, then wired enemy missile support in Task 2
- **Files modified:** js/scene/combat.js
- **Verification:** Both Swarm and Bomber branches syntactically valid, typeof guards on cross-file calls
- **Committed in:** bb68567 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Minor code organization change. Bomber AI behavior in combat.js was included with Swarm for code continuity since they share the same switch block. All functionality matches plan specification.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Swarm and Bomber archetypes fully operational with wave-scaled difficulty
- Plan 03 can implement Sniper and Capital AI branches using the same archetype-branched pattern
- enemyFireMissile() available for any archetype that needs to fire missiles
- getArchetypeStats() consumed correctly by all archetype branches

## Self-Check: PASSED

All 2 modified files verified on disk. Both task commits (bb68567, bdbe69e) verified in git log.

---
*Phase: 07-wave-progression-enemy-variety*
*Completed: 2026-03-12*
