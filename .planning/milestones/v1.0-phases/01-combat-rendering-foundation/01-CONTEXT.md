# Phase 1: Combat Rendering Foundation - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Entity storage, instanced rendering pipeline, radial collision bins, and enemy procedural geometry — the architectural backbone every combat phase builds on. 50 enemies rendering at 30fps+ without affecting the ray march shader. All combat entities rendered as separate GL geometry passes composited after the ray march.

</domain>

<decisions>
## Implementation Decisions

### Enemy ship visual design
- Angular/geometric shape language — sharp edges, flat panels, polygonal silhouettes (wedges, diamond hulls, pointed fins)
- Per-archetype color scheme: Grunt red (255,80,60), Swarm yellow (255,220,60), Bomber orange (255,140,40), Sniper purple (180,60,255), Capital white (255,255,255)
- Phase 1 builds the Grunt archetype only; other archetypes added in Phase 7
- Medium poly geometry target: 50-100 triangles per enemy ship (vs 12 tris for current player ship)
- Rigid body geometry with subtle shader effects — pulsing glow, engine glow, energy effects (no geometry animation)
- Ships face their direction of orbital travel (heading derived from velocity vector), not the camera

### Scene compositing
- Colored edge glow/outline on all enemies matching their archetype color — ensures visibility against both dark space and bright lensing arcs
- Depth-tested against the black hole scene — enemies can be occluded by planets and accretion disk (off-screen indicators added in Phase 6)
- Subtle vertex-shader scale warp for enemies near the event horizon — stretching effect, cheap to compute
- Accretion disk glow lighting — enemies near the disk pick up warm orange light based on distance-to-disk-plane (computed in vertex shader)

### Shader architecture
- Separate enemy shader program (enemyPg) — not an extension of the existing shipPg
- enemyPg built for instancing from the start: per-instance transforms, per-instance color, edge glow, BH warp, accretion lighting
- All enemies rendered in one instanced draw call (ANGLE_instanced_arrays)
- shipPg remains unchanged for the player ship

### Claude's Discretion
- Enemy ship sizing relative to player (scale per archetype)
- Entity store data structure design (SoA vs AoS, typed arrays, etc.)
- Radial bin granularity and bin count
- Exact edge glow implementation (rim lighting, Fresnel, post-process outline)
- LOD distance thresholds for billboard vs full geometry
- Buffer pre-allocation strategy

</decisions>

<specifics>
## Specific Ideas

- Player ship is 12 tris — enemy Grunt at 50-100 tris gives room for angular fins, panels, and engine nacelles while staying cheap at 50 instances
- Accretion disk glow lighting adds atmospheric immersion — warm orange near disk, transitioning to standard directional light away from it
- The BH vertex warp effect should be subtle (slight stretch), not a full lensing simulation
- Edge glow should use the archetype color so enemies are identifiable by color even at distance

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cS()` function (index.html:175): Compiles shaders — reuse for enemyPg
- `shipPg` shader program: Establishes the 3D geometry rendering pattern (MVP + normal matrix + lighting)
- Ship geometry generation: Procedural geometry with positions, normals, indices — pattern to follow for enemy geometry
- Missile geometry: Same pattern, second example of the 3D geometry pipeline

### Established Patterns
- Shader programs: vertex + fragment compiled via `cS()`, linked, attributes/uniforms cached in object
- Buffer setup: createBuffer → bindBuffer → bufferData for positions, normals, indices
- Render order: ray march fullscreen quad (pg) → 3D geometry (shipPg) → trajectory points (trajPg)
- Per-entity draw: current pattern is individual drawElements calls per entity — Phase 1 replaces this with instanced rendering for enemies

### Integration Points
- Render loop: enemies insert after the ray march draw (line ~623) and before/alongside ship draw (line ~647)
- GL context: single shared WebGL 1.0 context, need ANGLE_instanced_arrays extension
- View/projection matrices: already computed for shipPg — reuse for enemyPg
- Black hole position: available as uniform for computing BH warp distance

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-combat-rendering-foundation*
*Context gathered: 2026-03-09*
