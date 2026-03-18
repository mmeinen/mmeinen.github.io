---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Realistic Scale & Fleet Combat
status: in-progress
stopped_at: Completed 11-02-PLAN.md
last_updated: "2026-03-18T12:55:48.015Z"
last_activity: 2026-03-18 -- Completed 11-02 Enemy LOD system (billboard dots)
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 7
  completed_plans: 7
---

---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Realistic Scale & Fleet Combat
status: in-progress
stopped_at: Completed 11-02-PLAN.md
last_updated: "2026-03-18T03:20:16Z"
last_activity: 2026-03-18 -- Completed 11-02 Enemy LOD system (billboard dots)
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 7
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Tactical orbital combat that feels physically grounded -- ship movement follows real transfer orbits, weapons obey momentum and fuel constraints, and the black hole's gravity shapes every engagement.
**Current focus:** v1.1 Realistic Scale & Fleet Combat -- Phase 11 (Simulation Rescaling & Viewport Cleanup) complete

## Current Position

Phase: 11 of 16 (Simulation Rescaling & Viewport Cleanup)
Plan: 3 of 3 complete
Status: Phase Complete
Last activity: 2026-03-18 -- Completed 11-02 Enemy LOD system (billboard dots)

Progress: [##########] 100% (7/7 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 21 (v1.0)
- v1.1 plans completed: 7

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 10-scale-foundation | 4/4 | 55min | ~14min |
| 11-simulation-rescaling-viewport-cleanup | 3/3 | 10min | ~3min |

*Updated after each plan completion*
| Phase 11 P01 | 5min | 2 tasks | 3 files |
| Phase 11 P02 | 3min | 2 tasks | 2 files |
| Phase 11 P03 | 2min | 1 tasks | 1 files |

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

### Pending Todos

None.

### Blockers/Concerns

- Phase 10 has high risk concentration -- RESOLVED: all 4 plans completed successfully
- EXT_frag_depth availability on low-end hardware -- RESOLVED: runtime check with tighter near/far fallback [10.0, 300000]

## Session Continuity

Last session: 2026-03-18T03:20:16Z
Stopped at: Completed 11-02-PLAN.md
Resume file: .planning/phases/11-simulation-rescaling-viewport-cleanup/11-02-SUMMARY.md
