---
phase: 03-direct-fire-weapons
plan: 02
subsystem: combat
tags: [weapons, projectiles, rendering, trails, trajectory-preview, hit-prediction, webgl]

# Dependency graph
requires:
  - phase: 03-direct-fire-weapons
    plan: 01
    provides: Projectile SoA store, weapon fire functions, combat mode toggle, hit detection
  - phase: 02-player-ship-orbital-movement
    provides: simulateTrajectory, computeGravAccel, computeAimDir, flyPos, flyVel, aimDir
  - phase: 01-combat-rendering-foundation
    provides: Trajectory shader program (trajPg), getCollisionCandidates radial bins, enemy store
provides:
  - "Kinetic tracer rendering with white/yellow GL_POINTS and fading trail ring buffer"
  - "Plasma bolt dual-pass rendering (cyan glow + white-hot core) with distance fade"
  - "Real-time trajectory preview following crosshair in combat mode"
  - "Hit prediction marker at first enemy intersection point"
  - "Combat mode gates orbit trajectory preview (no visual overlap)"
affects: [04-missile-systems, 05-enemy-behavior, 08-combat-hud]

# Tech tracking
tech-stack:
  added: []
  patterns: [trail-ring-buffer, dual-pass-glow-rendering, trajectory-preview-with-hit-prediction, combat-mode-render-gate]

key-files:
  created: []
  modified: [js/scene/weapons.js, index.html]

key-decisions:
  - "Trail ring buffer (512 points) shared across all kinetic rounds for memory efficiency"
  - "Plasma bolts rendered individually (per-bolt draw calls) since max 2-3 active simultaneously"
  - "Trajectory preview uses simulateTrajectory for kinetic (gravity curves) and linear projection for plasma"
  - "Orbit trajectory preview hidden during combat mode to avoid visual overlap"

patterns-established:
  - "Trail ring buffer: shared Float32Array with alpha decay, ring head pointer, modular slot reuse"
  - "Dual-pass glow: large low-alpha point + smaller white-hot point for energy weapon effect"
  - "Combat-mode render gate: wrap non-combat rendering in if(!combatMode) blocks"

requirements-completed: [WPN-11, WPN-01, WPN-02, WPN-03, WPN-04]

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 3 Plan 02: Projectile Rendering + Trajectory Preview Summary

**Kinetic tracer trails via 512-point ring buffer, dual-pass plasma glow rendering, real-time trajectory preview with hit prediction markers, and combat-mode render gating**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T18:09:09Z
- **Completed:** 2026-03-10T18:12:18Z
- **Tasks:** 1 (of 2; Task 2 is human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- Kinetic rounds render as bright white/yellow GL_POINTS (4px) with fading trail dots (2px, 512-point ring buffer)
- Plasma bolts render with dual-pass technique: large cyan glow (12px) + white-hot core (5px), both fading with distance
- Trajectory preview computed each frame in combat mode: gravity-curved for kinetic (via simulateTrajectory), linear for plasma
- Hit prediction checks each preview point against enemy positions, renders bright red/orange marker at first intersection
- Existing orbit trajectory preview gated behind !combatMode to prevent visual overlap

## Task Commits

Each task was committed atomically:

1. **Task 1: Projectile rendering + trail buffer + trajectory preview + hit prediction** - `8f87cc0` (feat)

## Files Created/Modified
- `js/scene/weapons.js` - Trail ring buffer (512 points with alpha decay), trajectory preview computation (80 steps), hit prediction logic, renderProjectiles() with kinetic heads/trails/plasma glow, renderWeaponPreview() with kinetic/plasma preview dots and hit marker
- `index.html` - projGlBuf GL buffer creation, computeWeaponPreview/renderProjectiles/renderWeaponPreview calls in render loop, combatMode gate around orbit trajectory preview

## Decisions Made
- Trail ring buffer (512 points) shared across all kinetic rounds -- single allocation, no per-projectile trail arrays
- Plasma bolts rendered per-bolt (individual draw calls) since cooldown ensures max 2-3 active simultaneously, allowing per-bolt fade factor
- Plasma preview uses 3-segment shrinking (3.0px, 2.0px, 1.5px) since trajFS uniform point size is per-draw-call, not per-vertex
- Trail alpha decays at simDt * 4.0 (~0.25s fade), matching the fast-moving nature of kinetic rounds

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 3 WPN requirements (WPN-01 through WPN-04, WPN-11) are now functionally and visually complete
- Task 2 (human-verify checkpoint) awaits user confirmation of visual correctness and gameplay feel
- Phase 4 (missile systems) can build on the rendering patterns established here (dual-pass glow, trail ring buffer)

## Self-Check: PASSED

- FOUND: js/scene/weapons.js
- FOUND: index.html
- FOUND: .planning/phases/03-direct-fire-weapons/03-02-SUMMARY.md
- FOUND: commit 8f87cc0

---
*Phase: 03-direct-fire-weapons*
*Completed: 2026-03-10*
