# Phase 11: Simulation Rescaling & Viewport Cleanup - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

All combat simulation modules operating in km and the main 3D viewport shows only combat — no navigation overlays. Player is always in combat mode on nav entry (no separate toggle). Black hole rendering tuned for close-up detail with distance-adaptive parameters. Enemy LOD system with full geometry → billboard → skip transitions at km-scale distances.

</domain>

<decisions>
## Implementation Decisions

### Mode Simplification
- Backtick enters nav mode with combat immediately active — no separate F key toggle needed
- F key removed entirely — combat is always on in nav mode
- HUD shows unified controls list combining nav + combat keys; remove "F — COMBAT MODE" line
- After death/restart, player auto-restarts into nav+combat mode — no need to press backtick again, seamless restart loop
- `combatMode` boolean effectively always true during nav mode; remove or hardwire

### Viewport Purification
- **Remove from 3D viewport:**
  - Tactical range rings (4 concentric BH-centered rings at abstract radii 30, 50, 70, 90)
  - Lagrange point GL markers and HTML labels — L key does nothing until radar (Phase 15)
  - Transfer orbit ring (blue circle at target orbit during transfers) — remove now, radar will provide this
  - Transfer crosshair at target orbit center
- **Keep in 3D viewport:**
  - Weapon trajectory preview (kinetic gravity curve, plasma straight line) — combat aiming aid, stays
  - All enemy rendering, projectiles, explosions — combat elements stay
  - Player ship, planet rendering — scene elements stay

### BH Close-up Rendering
- Distance-adaptive shader parameters: closer to BH = more detail, farther = current look preserved
- Must maintain 30fps floor even with enemies on screen — adaptive quality steps back if frame budget tight
- Specific visual approach (accretion disk, photon ring, glow intensity) at Claude's discretion
- Constraint: must not regress BH appearance at far distances

### Enemy LOD System
- Three LOD levels: full geometry, billboard (colored dots/diamonds), skip (not rendered)
- Billboard representation: GL_POINTS or small diamonds, colored by archetype type
- Billboard dots sized proportionally to archetype (Capitals = large dot, Grunts = small dot) — gives distant spatial awareness of fleet composition
- Hard cut transitions between LOD levels — no cross-fade or alpha blending
- LOD distance thresholds at Claude's discretion — tune based on when enemies stop being visually distinguishable at km scale

### Claude's Discretion
- BH close-up visual approach (accretion disk emphasis, photon ring sharpening, glow parameters)
- Exact LOD distance thresholds (likely full geometry <10,000 km, billboard <50,000 km, skip beyond)
- Billboard dot exact colors per archetype
- How to handle the transition from `combatMode` boolean — remove vs hardwire
- Altitude HUD formatting details (km display precision, warning thresholds)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — VIEW-01, VIEW-02, VIEW-03, REND-01, REND-04 are the governing requirements for this phase

### Prior Phase Context
- `.planning/phases/10-scale-foundation/10-CONTEXT.md` — km scale constants (BODY_SCALE=800, ORBIT_SCALE≈1316), archetype sizes, coordinate system decisions

### Shader Conventions
- `.claude/rules/shader-conventions.md` — Shader invariant rules, critical for BH close-up tuning

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/scene/shaders.js`: Trajectory shader (trajVS/trajFS) used for orbit rings, range rings, L-point markers — removal targets
- `js/scene/shaders.js`: Billboard explosion shader (billboardVS/billboardFS) — pattern for billboard enemy rendering
- `js/scene/combat.js`: Enemy SoA store with posX/posZ, type arrays — LOD distance check integrates here
- `js/scene/weapons.js`: `combatMode` boolean and trajectory preview — mode simplification target
- `js/scale.js`: KM_PER_UNIT, BODY_SCALE, ORBIT_SCALE constants — LOD thresholds reference these

### Established Patterns
- Instanced rendering via ANGLE_instanced_arrays — enemy LOD must work with this (filter by distance before instance buffer upload)
- Camera-relative rendering (CRR) — all positions camera-relative before GPU upload, LOD distances computed from camera-relative coords
- SoA typed-array entity stores — LOD state can be a new typed array parallel to existing enemy arrays

### Integration Points
- `index.html:747-750`: ringBuf, RING_SEGMENTS, ringArray — orbit ring rendering to remove
- `index.html:1693-1707`: Transfer orbit ring rendering — remove this block
- `index.html:1720-1763`: Lagrange point marker rendering + label positioning — remove this block
- `index.html:1839-1859`: Tactical range ring rendering — remove this block
- `index.html:258`: `lagrangeVisible` state — disable/remove
- `index.html:1034-1036`: L key handler for Lagrange toggle — disable
- `js/scene/nav.js:409-462`: `enterNavMode()` — add combat auto-enable
- `js/scene/nav.js:464-498`: `exitNavMode()` — cleanup
- `js/scene/nav.js:648-654`: `resetCombat()` — change to auto-restart into combat mode
- `js/scene/weapons.js:21`: `combatMode` declaration — hardwire or remove
- `js/scene/nav.js:461`: HUD controls innerHTML — update to unified controls list
- `index.html:85-98`: L-point label HTML divs — hide or remove

</code_context>

<specifics>
## Specific Ideas

- Transfer orbit ring removed NOW (before radar exists) — player trusts the transfer based on ship movement
- Lagrange markers removed immediately, L key becomes no-op until radar ships
- Enemy billboard dots should convey fleet composition at a glance — size differentiation is key
- Death → restart should be seamless, no "lobby" feel between runs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-simulation-rescaling-viewport-cleanup*
*Context gathered: 2026-03-17*
