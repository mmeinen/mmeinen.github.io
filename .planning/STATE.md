---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Realistic Scale & Fleet Combat
status: unknown
stopped_at: Completed 13-02-PLAN.md
last_updated: "2026-03-21T18:36:21.422Z"
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 11
  completed_plans: 11
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Tactical orbital combat that feels physically grounded -- ship movement follows real transfer orbits, weapons obey momentum and fuel constraints, and the black hole's gravity shapes every engagement.
**Current focus:** Phase 13 — fleet-composition-system

## Current Position

Phase: 13 (fleet-composition-system) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity:**

- Total plans completed: 21 (v1.0)
- v1.1 plans completed: 10

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 10-scale-foundation | 4/4 | 55min | ~14min |
| 11-simulation-rescaling-viewport-cleanup | 3/3 | 10min | ~3min |
| 12-body-collision-world-boundary | 2/2 | 4min | ~2min |
| 13-fleet-composition-system | 1/2 | 3min | ~3min |

*Updated after each plan completion*
| Phase 11 P01 | 5min | 2 tasks | 3 files |
| Phase 11 P02 | 3min | 2 tasks | 2 files |
| Phase 11 P03 | 2min | 1 tasks | 1 files |
| Phase 12 P01 | 2min | 2 tasks | 5 files |
| Phase 12 P02 | 2min | 2 tasks | 3 files |
| Phase 13 P01 | 3min | 2 tasks | 3 files |
| Phase 13 P02 | 4min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.1 roadmap]: 7 phases (10-16), scale foundation first due to 6 simultaneous failure modes
- [v1.1 roadmap]: Phase 10 is highest-risk phase -- six pitfalls are rewrite triggers if missed
- [10-01]: BH_GM_KM computed from Kepler formula, not hardcoded
- [10-01]: Planet arrays indexed parallel to planetData (Jupiter=0 through Mars=6)
- [10-01]: scale.js uses const at file scope for global access via script tag (no ES modules)
- [10-01]: Angular speed (sp) stays abstract in planetPosKm -- only orbit radius is scaled
- [10-02]: CRR uses camera-at-origin approach (mat4LookAt([0,0,0], ...)) with all entity positions camera-relative
- [10-02]: Log depth uses gl_FragCoord.w with #ifdef guard for graceful fallback
- [10-02]: Camera position written to data view in abstract units for ray march shader isolation
- [10-02]: CRR world position stored as float64 (let _camWX/Y/Z) to preserve precision
- [10-03]: flyPos/flyVel in km during flyMode (Approach A -- convert at enter/exit boundary)
- [10-03]: Planet GM km-scale uses proportional scaling: PLANET_GM_K * BODY_SCALE^3 / ORBIT_SCALE^3
- [10-03]: Abstract BH_GM=400 preserved for Lagrange computation and shader detonation effects
- [10-03]: Detonation slot positions in abstract units for shader; death detonation converts from km
- [10-04]: Weapon hit radii (500-800 km) gameplay-tuned, not derived from scale factor
- [10-04]: ARCHETYPE_SCALES: Grunt=1.0, Swarm=1.0, Bomber=1.3, Sniper=1.2, Capital=16.0
- [10-04]: Float32Array kept for enemy positions -- 8m precision adequate at max orbit
- [10-04]: Gravity for combat entities uses computeGravAccelKm, not abstract computeGravAccel
- [10-04]: Collision bins reference scale.js constants (BIN_WIDTH_KM, NUM_BINS_KM) as single source of truth
- [11-01]: combatMode hardwired true -- re-set on enterNavMode/resetCombat for defense-in-depth
- [11-01]: L-point position computation extracted to run unconditionally (orbit capture depends on it)
- [11-01]: lagrangeVisible changed from let to const false -- prevents accidental re-enable
- [11-01]: fmtKm(val): <1000 uses toFixed(1)+' km', >=1000 uses toLocaleString()+' km'
- [11-02]: XZ-plane distance for LOD thresholds (Y near 0 in 2D orbital game)
- [11-02]: Billboard sizes: Grunt=3.0px, Swarm=2.5px, Bomber=4.0px, Sniper=3.5px, Capital=8.0px
- [11-02]: Hard LOD cuts (no cross-fade) -- simple and sufficient for distant dots
- [11-02]: Reuse trajPg shader for billboard rendering (GL_POINTS with uniform color/size)
- [11-03]: closeupFactor = smoothstep(30.0, 5.0, u_camDist) drives all BH close-up enhancements
- [11-03]: FBM octave gate uses u_camDist > 10.0 threshold directly (not closeupFactor) since fbm() is separate function
- [12-01]: Station-keeping (AI_IDLE) enemies exempt from body collision to avoid false kills
- [12-01]: Body positions cached once per frame in Float64Array for checkBodyCollisions performance
- [12-01]: Scattered BH-only despawns consolidated into centralized checkBodyCollisions()
- [12-02]: BH safety margin 500 km, planet safety margin 200 km -- generous buffers for forgiving gameplay
- [12-02]: Player boundary clamp strips outward radial velocity only, preserving tangential orbit
- [12-02]: Enemy boundary despawn gives no kill credit -- drifting off is not a combat event
- [13-01]: Fleet is spawn-time only -- no fleetId on enemies, no runtime fleet tracking
- [13-01]: Role-based arc widths: anchor=0rad, screen=0.5rad, striker=1.0rad for visual spread
- [13-01]: getWaveDefinition() preserved as legacy reference but no longer called by spawnWave()
- [13-01]: Fisher-Yates shuffle on planet pool prevents same-planet fleet clustering
- [Phase 13]: 3 pre-allocated fleet-callout DOM elements reused per wave, no dynamic DOM creation
- [Phase 13]: Fleet callout sequencing relies on wave state machine timing: 4s BREATHER gap ensures no overlap with wave announcement

### Pending Todos

None.

### Blockers/Concerns

- Phase 10 has high risk concentration -- RESOLVED: all 4 plans completed successfully
- EXT_frag_depth availability on low-end hardware -- RESOLVED: runtime check with tighter near/far fallback [10.0, 300000]

## Session Continuity

Last session: 2026-03-21T18:36:21.418Z
Stopped at: Completed 13-02-PLAN.md
Resume file: None
