# Project Research Summary

**Project:** Navigation Combat System — v1.1 Realistic Scale & Fleet Combat
**Domain:** WebGL km-scale orbital combat with fleet mechanics
**Researched:** 2026-03-15
**Confidence:** HIGH

## Executive Summary

This milestone transitions an existing WebGL 1.0 orbital combat game from abstract coordinate units to a physically realistic km-scale solar system (350,000 km scene extent) while simultaneously adding fleet-structured enemy spawning, a persistent radar mini-map, and a warp speed transit mechanic. The core technical challenge is not new feature code — it is the scale transition itself. Float32 precision at 350,000 km provides only ~40 m vertex accuracy, which causes visible geometry boiling on 500 m enemy ships. The mandatory fix is camera-relative rendering (CRR): subtract camera world position from all entity positions in JavaScript before GPU upload. This must be the first implementation step before anything else is built on the new coordinate system.

The recommended build order follows hard dependencies: establish the scale layer (`scale.js`) first, then rescale all simulation modules, then apply the CRR transform to all GL upload sites, then add the four new features (body collision, fleet spawning, warp speed, radar) in any order. The fleet composition system is the critical path for new features because the radar displays fleet icons rather than individual dots, and fleet health arcs depend on HP aggregation across fleet members. Warp speed and world boundary are independent and can proceed in parallel once the scale foundation is verified.

The principal risks are concentrated in the scale transition phase: corrupting the existing ray march shader (which uses its own internal coordinate system incompatible with km values), mutating `planetData` in-place and breaking the normal navigation mode, and failing to update collision bin constants (making hit detection silently miss at large orbital radii). Each is a potential rewrite trigger. All three have clear preventions documented in the research: keep the ray march shader untouched and maintain dual coordinate representations, derive `kmPlanetData` without mutating the original array, and update `BIN_WIDTH`/`NUM_BINS` simultaneously with the scale change.

## Key Findings

### Recommended Stack

No new WebGL extensions or libraries are required for v1.1. The entire feature set builds on the existing WebGL 1.0 + ANGLE_instanced_arrays foundation. Three new JS modules handle the core new concerns: `scale.js` (single SCALE_KM constant and coordinate transform helpers), `warp.js` (time dilation state and accumulator), and `radar.js` (2D canvas overlay, separate from the WebGL context). A fourth data module `fleets.js` defines fleet composition tables consumed by the wave spawner. See [STACK.md](STACK.md) for full details.

**Core techniques:**
- **Camera-relative rendering (CRR)**: subtract camera world position in JS before uploading entity positions to the GPU — zero shader changes required, resolves float32 precision at any orbital radius
- **Separate `<canvas id="radar-canvas">` with 2D API at z-index 30**: radar content is inherently 2D; Canvas 2D is faster than WebGL RTT for under 10,000 primitives; no GL state pollution; pointer-events: none so WebGL canvas receives all input
- **Scaled accumulator + physics substepping (cap 8 substeps/frame)**: prevents Verlet integration divergence during time acceleration; rail mode (analytic Keplerian orbits) for warp above 10x to avoid energy accumulation errors
- **LOD tiers calibrated to km scale**: full 3D under 5,000 km camera-relative distance; billboard quads 5,000–100,000 km; skip above 100,000 km; 20% hysteresis bands prevent per-frame tier oscillation
- **Logarithmic depth buffer via `EXT_frag_depth`** (confirmed WebGL 1.0 extension): solves Z-fighting at the 35,000,000:1 near/far ratio required by km-scale scene

**What NOT to use:** World-space float32 coordinates direct to GPU (visible vertex boiling at 350,000 km), GLSL `double` (not in WebGL 1.0), DSP dual-float emulation (CRR is sufficient with zero shader changes), WebGL RTT for radar (300 LOC overhead for inherently 2D content), single large physics dt for warp (Verlet divergence), `highp` as a precision fix (extends exponent range not mantissa — wrong tool).

### Expected Features

See [FEATURES.md](FEATURES.md) for the full feature landscape with dependency graph.

**Must have (v1.1 table stakes):**
- Fleet templates (3 named templates, max 3 fleets per wave) — fleet coherence is the milestone's core promise; without it the "fleet combat" label is hollow
- Fleet anchor behavior (ships orbit within ±15% of anchor radius) — makes fleets feel like coordinated units, not random individuals
- Radar mini-map (200px circle, always-on, bottom-left) — every space combat game provides spatial awareness without requiring zoom-out; at km scale the zoom-out approach is no longer viable
- Warp toggle (Spacebar, x30 max, 0.2s transition, 1.0s ramp) — mandatory for km-scale transit; single toggle avoids multi-level UI complexity
- Warp proximity locks (enemy within detection radius, or within 1.5x planet radius) — universal pattern, players accept it as physically correct
- Body collision kill zones (player + enemies destroyed on contact with planet surface or BH event horizon) — physics credibility
- World boundary with radial velocity reflect at 1.2x outermost orbit — play area integrity
- Fleet spawn HUD announcement (3-second callout, directional arrow) — required at small radar scale where new contacts are hard to spot
- Warp HUD indicator (border pulse + "WARP x30" label) — clarity and feedback

**Should have (post-validation, v1.1.x):**
- Radar expanded panel (280–400px, O key toggle to side panel with orbit rings and fleet labels) — adds orbital context without leaving combat view
- Fleet health arcs on radar icons — strategic at-a-glance fleet status; depends on fleet composition system being stable first
- Orbital height UX (km labels, apoapsis/periapsis display) — low effort, high clarity once scale is finalized
- Warp star-streak post-process pass (radial UV stretch on background) — highest visual impact differentiator; defer until functional systems are solid

**Defer (v2+):**
- Additional fleet templates (carrier group, ambush wing, siege flotilla)
- Fleet retreat behavior (requires warp-capable enemy AI — significant scope)
- Named recurring fleets with cross-wave persistent state (requires save state architecture)

**Anti-features (do not implement):**
- Multi-level time warp (adds UI buttons and wrong-level frustration; x30 single toggle is sufficient at 60s Jupiter period)
- Radar zoom control (play area already fits in radar at fixed scale; zoom reduces tactical value)
- 3D radar (orbits are coplanar; 2D top-down is a perfect projection with zero information loss)
- Fleet AI formation flying (dynamic formation maintenance is expensive and unreadable at radar scale; loose proximity coherence achieves the same perceived result)

### Architecture Approach

The architecture follows a strict separation between three layers: the simulation layer (all distances in km, float64 JS numbers), the coordinate transform layer (camera-relative CRR applied per-frame before any GL upload), and the render layer (GPU receives small camera-relative values, never raw km world coordinates). The ray march shader is explicitly isolated: it continues operating in its own internal abstract coordinate system, receives planet positions via `planetPosAtTime()` in abstract units, and is never passed km-scale values. Two independent coordinate representations of planet positions are maintained simultaneously — this is intentional and must not be collapsed. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system diagram, data flow, and per-file change inventory.

**Major components:**
1. `js/scene/scale.js` (NEW) — SCALE_KM constant, all physical body sizes and orbit radii in km, BH_GM_KM derived from Jupiter 60s orbital period, `worldToRenderPos()` transform helper; must be first in script load order
2. `js/scene/fleets.js` (NEW) — `FLEET_ARCHETYPES` data table, `getFleetComposition(waveNum, difficulty)`, `spawnFleet(spec, anchorBodyIdx)`; fleets are spawn-time only, individual AI runs independently after spawn
3. `js/scene/radar.js` (NEW) — reads world state without writing to simulation; draws to separate `<canvas id="radar-canvas">` with 2D context; mini mode (200px circle) and expanded mode (400px panel, O key)
4. `js/scene/warp.js` (NEW) — `warpActive` flag, `WARP_SCALE = 30`, `WARP_RAMP_TIME = 1.0s`, `computeWarpDt(rawDt)`; advances only physics simulation time, not shader `u_time` (which tracks wall clock)
5. Modified simulation modules (`orbital.js`, `combat.js`, `weapons.js`, `missiles.js`, `particles.js`, `waves.js`) — all distance/velocity/radius constants updated to km; `updateInstanceBuffer()` in combat.js adds CRR subtraction; collision bins updated to BIN_WIDTH=20,000 km, NUM_BINS=80

**Build order (hard dependencies):**
Phase A (scale.js + planetData km values + clipping planes) → Phase B (module rescaling, one file at a time) → Phase C (CRR in all GL upload sites) → Phases D–G independent: body collision, fleet system, warp speed, radar → Phase H: LOD and visual tuning.

### Critical Pitfalls

See [PITFALLS.md](PITFALLS.md) for all 10 pitfalls with concrete numbers, detection signs, recovery costs, and phase mapping.

1. **Float32 precision collapse at km-scale world coordinates** — store all entity world positions as float64 JS numbers; convert to float32 only at render time via CRR; never store raw km coordinates in Float32Array. Warning sign: stationary enemies appear to vibrate at large orbital radii.

2. **Normal-mode corruption from in-place `planetData` mutation** — never mutate `planetData.oR` in place; derive a separate `kmPlanetData` array; keep `BH_GM` for nav mode and define separate `BH_GM_KM` for combat. Run `tests.html` after every scale-related commit. Warning sign: planet labels at wrong positions in normal mode.

3. **Ray march shader broken by km-scale constants** — the shader's `escapeR`, `outerEdge`, and step parameters are calibrated to abstract units where BH radius ≈ 2.0; passing km values (10,000) would cause escape at step 0, rendering a black scene. Never pass km coordinates to ray march uniforms. Warning sign: scene renders all black except stars.

4. **Physics tunneling during warp** — at 30x warp, a kinetic round at 8,000 km/s moves 240,000 km per real second; it skips past planets in one frame. Disable projectile physics entirely during warp (warp is transit-only); use swept ray-sphere tests for planet/BH collision during warp. Warning sign: ship passes through planet visually with no collision response.

5. **Collision bin system silently misses contacts** — with old BIN_WIDTH=10 (now 10 km), all entities beyond 200 km pile into the last bin causing O(n²) false candidates and genuine misses. Update to BIN_WIDTH_KM=20,000, NUM_BINS=80 simultaneously with the scale change. Warning sign: `getCollisionCandidates()` returns 30+ candidates for a single projectile.

## Implications for Roadmap

Based on research, the build order follows hard technical dependencies. The scale transition is a prerequisite for all subsequent systems.

### Phase 1: Scale Foundation
**Rationale:** Float32 precision loss, Z-fighting, normal-mode corruption, WASM offset mismatches, and broken collision bins are all Phase 1 failures that compound if deferred. This phase must be completed and verified — including a `tests.html` pass — before any entity positions are stored in km. Building anything else on top of broken coordinates forces a rewrite.
**Delivers:** `scale.js` with all physical constants; km values in derived `kmPlanetData` (never mutating `planetData`); updated clipping planes with logarithmic depth buffer via `EXT_frag_depth`; CRR transform applied to all GL entity uploads; collision bins updated to km scale (BIN_WIDTH=20,000, NUM_BINS=80); WASM offset reads wrapped with scale conversion; dual coordinate representations for planet positions confirmed
**Addresses:** World coordinate units, float32 precision, Z-fighting, WASM scale conversion, bin system
**Avoids:** Pitfalls 1 (vertex jitter), 2 (Z-fighting), 4 (shader breakage), 5 (WASM corruption), 6 (normal mode corruption), 7 (bin miss at scale) — all the potential rewrites are in this phase

### Phase 2: Simulation Layer Rescaling
**Rationale:** Once scale.js exists, each simulation module can be updated independently with visual verification after each file. This is the most mechanical phase — search-and-replace constants with km equivalents derived from scale.js. Physics substepping for warp must be implemented here before the warp multiplier is ever applied, to prevent Verlet divergence.
**Delivers:** `orbital.js`, `combat.js`, `weapons.js`, `missiles.js`, `particles.js` all operating in km; enemy AI detection radii and engagement distances physically plausible at km scale; warp sub-step accumulator implemented in the physics loop (cap 8 substeps/frame)
**Avoids:** Pitfall 8 (Verlet divergence at large dt) — substepping is in place before warp is turned on

### Phase 3: Body Collision and World Boundary
**Rationale:** Low complexity, no dependencies beyond Phase 1. Building collision kill zones before warp speed means the planet exclusion radius data is available for warp proximity lock logic — build the data once, use it in two features.
**Delivers:** Player and enemy destruction on body contact; player "COLLISION IMMINENT" warning 3 seconds before impact; world boundary radial velocity reflection at 1.2x outermost orbit; "BOUNDARY PROXIMITY" HUD warning; enemy collision counted as kill toward wave counter
**Addresses:** Body collision kill zones (P1 table stake), world boundary (P1 table stake)
**Avoids:** Pitfall 3 (tunneling) — swept ray-sphere body collision logic established here is reused by warp

### Phase 4: Fleet Composition System
**Rationale:** Fleet is the critical path for new features. The radar needs fleet groupings to show fleet icons (not 20+ individual dots). Fleet health arcs depend on HP aggregation. Spawn announcements need fleet events. Building fleet before radar unlocks all downstream radar features.
**Delivers:** `fleets.js` with 3 named FLEET_ARCHETYPES (RAID, SIEGE, WOLF — roles: Capital/Anchor, Grunt+Swarm/Screen, Bomber+Sniper/Striker); `waves.js` updated to call `spawnFleet()` instead of individual spawns; fleet anchor behavior (all members get `assignBody` = anchor planet, orbit within ±15% of anchor radius); fleet spawn HUD announcement (3-second callout with directional arrow)
**Addresses:** Fleet templates (P1), fleet anchor behavior (P1), fleet spawn announcement (P1)
**Avoids:** Anti-pattern of fleet-awareness in the AI state machine — fleets are spawn-time only, individual AI unchanged after spawn

### Phase 5: Warp Speed
**Rationale:** Independent of fleet and radar; depends on physics loop (Phase 2) and body collision kill-zone data (Phase 3) for proximity locking. The accumulator and sub-step cap must be verified functional before visual effects are layered on.
**Delivers:** `warp.js` with Spacebar toggle, 30x time acceleration, 1.0s ramp, enemy proximity lock (~30 km detection radius), planet proximity lock (1.5x body radius); warp HUD indicator (border pulse + "WARP x30" label); projectile physics suspended during warp; planet/BH swept collision active during warp; `u_time` shader uniform continues tracking wall clock (not sim time) so disk/detonation visuals are unaffected
**Addresses:** Warp toggle (P1), warp proximity locks (P1), warp HUD indicator (P1)
**Avoids:** Pitfalls 3 (tunneling), 8 (Verlet divergence), 10 (orbital timing distortion during warp)

### Phase 6: Radar Mini-Map
**Rationale:** Depends on fleet composition (Phase 4) for fleet icons to be meaningful. Depends on scale foundation (Phase 1) for correct km coordinate mapping to radar pixels. With fleet groupings available, the radar shows ~3 fleet triangles rather than ~20 individual dots — readable at 200px.
**Delivers:** `radar.js`; `<canvas id="radar-canvas">` at z-index 30 with pointer-events: none; mini mode (200px circle, always-on) showing player dot, planet dots, fleet triangle icons (hostile red); hybrid scale representation (bodies true-scale relative to radar extent, ships minimum 4px to prevent sub-pixel invisibility); update rate decoupled from 3D render (every 2–4 frames, every frame during warp)
**Addresses:** Radar mini-map (P1)
**Avoids:** Pitfall 9 (radar coordinate mismatch — hybrid representation prevents sub-pixel ships)

### Phase 7: LOD and Visual Tuning (Optional)
**Rationale:** All functional systems are complete after Phase 6. This phase improves visual quality at km scale and adds the radar expanded panel and polish features, but does not affect game mechanics.
**Delivers:** Updated LOD tier thresholds in enemy shader (full 3D < 5,000 km, billboard 5,000–100,000 km, skip above); 20% hysteresis bands; radar expanded panel (400px side panel, O key toggle, orbit rings + fleet labels + fleet health arcs); warp star-streak post-process pass (radial UV stretch on background, scales with warp factor); orbital height UX (km labels, apoapsis/periapsis display)
**Addresses:** Radar expanded panel (P2), fleet health arcs (P2), orbital height UX (P2), warp star-streak (P2)

### Phase Ordering Rationale

- Phase 1 before everything: float32 precision and normal-mode integrity cannot be patched retroactively without a revert; all subsequent systems assume CRR and km units are in place
- Phase 2 before Phase 5: warp sub-stepping lives in the physics loop; the loop must operate in km before the warp multiplier is applied
- Phase 3 before Phase 5: warp proximity lock reuses body collision kill-zone radii — build the data once, use it in two places
- Phase 4 before Phase 6: radar fleet icons require fleet identity on each enemy entity; without fleet grouping the radar loses strategic legibility
- Phases 3–6 are otherwise independent of each other after Phases 1 and 2 are verified; they can proceed in any order within sessions

### Research Flags

Phases likely needing deeper research or careful sub-step planning during execution:
- **Phase 1:** High risk — six simultaneous failure modes, all are rewrite triggers if missed. Consider splitting into Phase 1a (scale.js + derived kmPlanetData, no module changes) and Phase 1b (CRR transform in all render paths). Verify `tests.html` passes after Phase 1a before proceeding.
- **Phase 5 (warp):** The rail-mode Keplerian orbit computation for warp > 10x needs calibration against the specific BH_GM_KM value derived from Jupiter's 60s period. Verify analytic orbit stays in sync with Verlet integration at the 10x crossover to prevent position discontinuity on warp exit.

Phases with standard patterns (can skip research-phase during planning):
- **Phase 3 (body collision):** Ray-sphere intersection and radial velocity reflection are well-documented primitives; implementation is mechanical once kill-zone radii are defined.
- **Phase 4 (fleet system):** Fleet-as-spawn-group pattern is fully specified in ARCHITECTURE.md with concrete code examples; no design ambiguity.
- **Phase 6 (radar):** Canvas 2D radar pattern is fully specified in STACK.md with complete reference implementation; no additional research needed.
- **Phase 7 (LOD/visual):** LOD thresholds and hysteresis are fully specified; warp star-streak is additive and isolated to a post-process pass with known implementation pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core techniques (CRR, Canvas 2D radar, accumulator warp, EXT_frag_depth, LOD hysteresis) verified against IEEE 754 spec, WebGL2Fundamentals, Gaffer on Games, Godot LWC docs, Cesium engineering blog — multiple independent authoritative sources with consistent conclusions |
| Features | MEDIUM | Fleet/radar patterns from real game documentation (KSP wiki, Elite Dangerous wiki, Homeworld wiki, Endless Space 2 wiki); warp constraints from KSP and SpaceBourne 2 community sources; core patterns are consistent across references but exact balance values (warp factor ceiling, detection radii) require playtesting |
| Architecture | HIGH | Derived directly from codebase inspection of all existing JS modules (verified 2026-03-15); build order and integration points are grounded in actual code structure, not speculation; anti-patterns confirmed by inspecting existing constants (BIN_WIDTH=10, near=0.1, far=500, WASM offsets 0x070+i*12) |
| Pitfalls | HIGH | Critical pitfalls verified against IEEE 754 mantissa formula (exact), codebase constants (directly inspected), and external literature (Cesium depth buffer analysis, Gaffer on Games timestep); recovery costs are concrete estimates, not guesses |

**Overall confidence:** HIGH

### Gaps to Address

- **Warp factor ceiling value:** Research recommends x30 but the actual ceiling should be computed from the longest Hohmann transfer in the system (Neptune to Venus or similar). Compute analytically from BH_GM_KM before setting WARP_SCALE. The value may need to be lower or higher than x30 to guarantee 30-second transfers.
- **Enemy AI detection radii in km:** The km equivalents for `DETECT_RADIUS`, `ATTACK_RANGE`, `FIRE_RANGE` are derived proportionally from abstract units. The resulting engagement feel at km scale is unvalidated until playtested. May need significant tuning.
- **EXT_frag_depth availability on target hardware:** Research rates this HIGH for desktop GPUs. If the site is used on low-end or mobile WebGL, the multi-frustum fallback (Option B in PITFALLS.md) needs to be implemented as a code path. Check `gl.getExtension('EXT_frag_depth')` at runtime and gate the logarithmic depth implementation on availability.
- **Radar update rate during warp:** Research recommends every-frame Canvas 2D updates during warp. The 2ms Canvas 2D estimate is from a 2020 benchmark. Validate actual overhead on target hardware before committing to every-frame rate — if overhead is measurable, drop to every-other-frame even during warp.

## Sources

### Primary (HIGH confidence)
- [IEEE 754 Single-Precision Floating-Point Format — Wikipedia](https://en.wikipedia.org/wiki/Single-precision_floating-point_format) — mantissa bits formula used for float32 precision analysis
- [Gaffer on Games: Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) — accumulator/substepping pattern for warp physics loop
- [Godot Engine: Large World Coordinates Tutorial](https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html) — camera-relative rendering confirmation
- [Godot Engine: Emulating Double Precision on GPU](https://godotengine.org/article/emulating-double-precision-gpu-render-large-worlds/) — RTE vs DSP tradeoff analysis
- [Cesium: Hybrid Multi-Frustum Logarithmic Depth Buffer](https://cesium.com/blog/2018/05/24/logarithmic-depth/) — logarithmic depth with EXT_frag_depth and multi-frustum fallback
- [WebGL2 Fundamentals: Precision Issues](https://webgl2fundamentals.org/webgl/lessons/webgl-precision-issues.html) — highp limitations in WebGL 1.0 vertex shaders
- [LearnWebGL: Overlays](http://learnwebgl.brown37.net/11_advanced_rendering/overlays.html) — multiple canvas layering and mouse event routing
- [MDN: EXT_frag_depth](https://developer.mozilla.org/en-US/docs/Web/API/EXT_frag_depth) — confirmed WebGL 1.0 extension
- [gltut: The Perils of World Space](https://paroj.github.io/gltut/Positioning/Tut07%20The%20Perils%20of%20World%20Space.html) — RTE naming and combined model-to-camera matrix technique
- [Deck.GL / SegmentFault: WebGL Geographic Precision](https://segmentfault.com/a/1190000040332266/en) — offset coordinates GLSL implementation
- Direct codebase inspection: `combat.js`, `orbital.js`, `weapons.js`, `missiles.js`, `waves.js`, `shaders.js`, `nav.js`, `index.html` (verified 2026-03-15)

### Secondary (MEDIUM confidence)
- [KSP Time Warp Wiki](https://kerbalspaceprogram.fandom.com/wiki/Time_Warp) — warp restrictions and physics vs on-rails mode behavior
- [Elite Dangerous HUD/Center Wiki](https://elite-dangerous.fandom.com/wiki/HUD/Center) — radar layout and contact encoding patterns
- [Homeworld Formations Wiki](https://homeworld.fandom.com/wiki/Formations) — fleet behavior and role differentiation
- [Endless Space 2 Combat Wiki](https://endless-space-2.fandom.com/wiki/Combat) — flotilla phase and attacker/protector role ratio patterns
- [SpaceBourne 2 warp during combat discussion](https://steamcommunity.com/app/1646850/discussions/0/3771239049941978385/) — proximity-based warp lock in practice
- [semisignal.com Canvas 2D vs WebGL benchmark](https://semisignal.com/a-look-at-2d-vs-webgl-canvas-performance/) — performance crossover at ~10,000 primitives
- [NEBULOUS: Fleet Command Wiki](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/NEBULOUS:_Fleet_Command) — point-cost fleet design and role specialization

### Tertiary (LOW confidence)
- [KSP Steam Forums: Warp Under Acceleration](https://steamcommunity.com/app/220200/discussions/0/1744483505461805761/) — KSP rails warp description (community forum, consistent with documented KSP behavior)
- [Warframe 3D radar discussion](https://forums.warframe.com/topic/334517-archwing-we-need-a-3d-radar-instead-of-the-minimap-for-deep-space-combat/) — why 3D radar fails for coplanar orbital games

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*
