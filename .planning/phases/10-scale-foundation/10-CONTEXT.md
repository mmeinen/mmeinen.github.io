# Phase 10: Scale Foundation - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the scene from abstract game-units to physically realistic km-scale coordinates. Implement camera-relative rendering (CRR) and logarithmic depth buffer to eliminate precision artifacts. Recalibrate collision bins for km distances. Anchor all orbital velocities to Jupiter's 60-second period via Keplerian mechanics. Remove bullet time — normal speed becomes 1.0×. Rebalance all combat speeds/timings for real-time play. Normal (non-nav) mode rendering must be completely unaffected.

</domain>

<decisions>
## Implementation Decisions

### Planet & BH Sizing
- Body scale factor: KM_PER_UNIT = 800 (derived from Jupiter diameter: 2.5 × 2 × 800 = 4,000 km)
- All planet diameters proportional to current abstract radii × 800:
  - Jupiter: 4,000 km (anchor)
  - Saturn: 3,200 km
  - Uranus: 2,400 km
  - Neptune: 2,240 km
  - Mars: 2,080 km
  - Earth: 960 km
  - Venus: 864 km
- Black hole: 20,000 km diameter (collision/scale context only)
- Shader stays in abstract units — 20,000 km is NOT passed to shader. Visual size controlled by camera zoom

### Coordinate System
- Two scale factors: BODY_SCALE = 800 (sizes), ORBIT_SCALE ≈ 1,316 (orbits)
- Shader and WASM remain completely untouched — keep current abstract units (oR=38 for Jupiter, etc.)
- km layer exists only in combat/nav JS modules
- Conversion at boundary: shader uniforms = km_value / scale_factor

### Orbit Layout
- Preserve current non-uniform orbit spacing (dense inner, sparse outer)
- Orbit radii derived from current abstract values × ORBIT_SCALE (≈1,316):
  - Venus: 36,848 km
  - Earth: 43,428 km
  - Jupiter: 50,008 km (anchor — satisfies SCALE-02 reinterpreted as "Jupiter orbits at ~50,000 km")
  - Mars: 59,220 km
  - Saturn: 68,432 km
  - Uranus: 89,488 km
  - Neptune: 113,176 km
- SCALE-02 reinterpreted: "~50,000 km" refers to Jupiter's orbit radius, not uniform spacing between planets
- Planets are relatively small compared to orbit gaps (body scale 800 vs orbit scale 1,316) — intentionally realistic

### Archetype Sizing
- 500m floor for minimum enemy size (visibility guarantee)
- Swarm: 500 m (bumped from 300m proportional)
- Sniper: 600 m (bumped from 400m proportional)
- Grunt: 500 m (base)
- Bomber: 650 m
- Capital: 8,000 m (8 km — matches SCALE-03 requirement, 16× grunt, nearly player-sized)
- Player: 10,000 m (10 km)
- Weapon hit radii and projectile sizes tuned independently for gameplay feel, NOT derived from scale factor

### Time Scale & Orbital Speed
- Bullet time (BULLET_TIME_SCALE = 0.03) removed entirely — normal speed = 1.0×
- Only two time modes: normal (1.0×) and warp (Phase 14)
- Keplerian orbital periods (T ∝ r^1.5) with Jupiter = 60s anchor:
  - Venus: ~27s
  - Earth: ~35s
  - Jupiter: 60s (anchor)
  - Mars: ~78s
  - Saturn: ~97s
  - Uranus: ~145s
  - Neptune: ~206s
- BH_GM re-derived from Kepler's law: GM = 4π² × r³ / T² at Jupiter's orbit
- Planet GM re-derived with km-scale constant

### Combat Rebalancing (in this phase)
- Removing bullet time makes everything 33× faster — must rebalance simultaneously
- Weapon speeds, enemy AI tick rates, projectile lifetimes, missile thrust/fuel all rebalanced for 1.0× real-time
- Projectiles should feel snappier than current — near-instant at combat range, reduced dodge window
- Exact km/s values tuned during implementation for feel

### Claude's Discretion
- CRR implementation details (where camera subtraction happens)
- Logarithmic depth buffer implementation (EXT_frag_depth usage, fallback path)
- Collision bin width and count for km scale
- Exact projectile speed values in km/s (tuned for snappy feel)
- Combat rebalancing numbers (AI tick rates, missile fuel durations, etc.)

</decisions>

<specifics>
## Specific Ideas

- "Bullet time should go away. There will only be normal time scale and the warp time scale"
- Projectiles should feel faster/snappier than current — more like near-instant hits at combat range
- Capital ships at 8 km should feel imposing — nearly player-sized, dramatic visual contrast with 500m grunts

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `nav.js`: Orbital mechanics module with `circularVelocity()`, trajectory preview — needs km constants but structure reusable
- `combat.js`: Radial bin collision system (BIN_WIDTH=10, NUM_BINS=20) — recalibrate for km, logic stays
- `weapons.js`: Projectile physics with speed/lifetime/hit-radius constants — update values, keep architecture
- `missiles.js`: Missile thrust/fuel/detonation system — update values, keep architecture
- WASM module: Handles planet positions 0-5, memory layout at 0x100+i*16 — stays untouched

### Established Patterns
- SoA typed-array entity stores with free-list allocation for all combat entities
- Instanced rendering via ANGLE_instanced_arrays for enemies + projectiles
- BH-only gravity for enemies/projectiles (full N-body too expensive)
- Planet 6 (Mars) always JS-computed, not in WASM

### Integration Points
- `index.html:1409`: `mat4Perspective(fovY, aspect, 0.1, 500, _proj)` — needs log depth buffer conversion
- `index.html:1413-1429`: Model/view/proj matrix pipeline — needs CRR (subtract camPos before GPU upload)
- `nav.js:10-11`: BH_GM=400, PLANET_GM_K=50 — re-derive for km
- `nav.js:14-17`: BULLET_TIME_SCALE=0.03 — remove entirely
- `combat.js:151-156`: BIN_WIDTH=10, NUM_BINS=20 — recalibrate for km
- `weapons.js:5-18`: All projectile speed/radius constants — rebalance for 1.0× real-time
- `missiles.js:5-17`: All missile speed/thrust/fuel constants — rebalance for 1.0× real-time
- Shader uniforms: planet positions divided by scale factor at boundary — shader never sees km values

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-scale-foundation*
*Context gathered: 2026-03-14*
