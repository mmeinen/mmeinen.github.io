# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Navigation Combat System

**Shipped:** 2026-03-15
**Phases:** 9 | **Plans:** 21 | **Commits:** 113
**Timeline:** 5 days (2026-03-09 → 2026-03-14)

### What Was Built
- Instanced combat rendering pipeline (SoA entity stores, radial bin collision, ANGLE_instanced_arrays)
- Physically-grounded orbital movement (Hohmann transfers, SOI mechanics, Lagrange points, altitude control)
- Four weapon systems (kinetic cannon, plasma gun, PN-guided missiles, nuclear missiles with volumetric detonation)
- Five enemy archetypes (Grunt, Swarm, Bomber, Sniper, Capital) with distinct AI state machines
- Full survival loop (250 HP hull, kinetic shield wall, death sequence, game over/restart, high scores)
- Tactical targeting (overlay markers, click-to-select, weapon assignment, coordinated salvo fire)
- Combat HUD (weapon cooldowns, HP bar, wave counter, orbit info)

### What Worked
- **SoA typed-array pattern:** Zero GC pressure across all combat entities. Established once in Phase 1 and reused through Phase 9 without modification.
- **Instanced rendering from day one:** Single draw call for all enemies paid off massively. Multi-geometry extension in Phase 7 was straightforward because the architecture was right from the start.
- **Separate GL passes (not inside ray march):** This constraint kept performance stable as combat complexity grew. Never had to debug a shader performance regression from combat additions.
- **Well-researched plans:** Average plan execution was 4-7 minutes when research was thorough. Phase 3 plans executed in 3.5 min average.
- **Dependency chain design:** Building rendering → movement → weapons → enemies → defense → waves → HUD → targeting meant each phase could be tested independently.

### What Was Inefficient
- **STATE.md accumulated too many historical entries:** The file grew with every plan completion, making it harder to parse. Should have been pruned more aggressively.
- **Phase 2 took longest (55 min for 3 plans):** Orbital mechanics required the most iteration. Hohmann transfer math, SOI transitions, and Lagrange point mechanics were domain-heavy.
- **Summary extraction tooling:** The gsd-tools summary-extract command failed on Windows due to /dev/stdin pipes. Had to fall back to grep.

### Patterns Established
- SoA typed-array entity stores with free-list allocation for all combat entities
- Instance buffer packing pattern: iterate alive slots, write contiguous floats for GPU upload
- Procedural geometry functions returning {verts, norms, idxs} objects
- Radial bin collision exploiting orbital structure (20 bins on XZ plane)
- Billboard explosion system for cheap visual effects (vs volumetric shader)
- Multi-geometry instanced rendering with shared buffer and per-archetype byte offsets
- Enemy AI state machine pattern (idle/alert/transfer/attack/disengage/re-orbit)

### Key Lessons
1. **Architectural constraints are features:** "Never inside the ray march" and "instanced rendering only" were constraints that prevented bad decisions and kept performance stable throughout.
2. **Physics grounding creates emergent gameplay:** Gravity-curved projectiles, orbital transfers, and Lagrange point positioning weren't just aesthetic — they created tactical depth without additional game design.
3. **Small explosions as sprites was the right call:** 1000x cheaper than volumetric, and at combat frequency (dozens per wave), volumetric would have destroyed FPS.
4. **Plan quality > plan speed:** The 3-minute plans were well-researched; the 18-minute plans had domain uncertainty. Invest in research to compress execution.

### Cost Observations
- Model mix: Primarily opus for planning/execution, sonnet for research agents
- Sessions: ~15 across 5 days
- Notable: 21 plans in 5 days is aggressive but sustainable with thorough research

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~15 | 9 | First milestone — established SoA, instancing, and separation-of-concerns patterns |

### Cumulative Quality

| Milestone | Tests | Coverage | Requirements |
|-----------|-------|----------|-------------|
| v1.0 | tests.html (shader invariants) | Shader-only | 48/48 complete |

### Top Lessons (Verified Across Milestones)

1. Architectural constraints prevent bad decisions better than code review catches them
2. Research investment compresses execution time proportionally
