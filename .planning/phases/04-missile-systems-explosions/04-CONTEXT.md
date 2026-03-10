# Phase 4: Missile Systems & Explosions - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Two missile weapon types — guided regular missiles with fuel constraints and proximity detonation, and nuclear missiles with volumetric explosions — plus a sprite-based billboard explosion renderer for all non-nuclear combat detonations. Requirements: WPN-05, WPN-06, WPN-07, WPN-08, WPN-09, WPN-10, VFX-03.

</domain>

<decisions>
## Implementation Decisions

### Missile targeting flow
- Enemy lock-on targeting: crosshair over enemy -> lock indicator appears -> fire sends missiles to locked targets
- Multi-lock salvo system: lock up to 6 enemies, 3 missiles per locked target (up to 18 missiles per salvo)
- Tracking reticle on each locked enemy: diamond/bracket overlay that follows them, showing lock count (e.g., x3 missiles assigned)
- Weapon selection: key 3 = regular missiles, key 4 = nuclear missiles (extends Phase 3's 1=kinetic, 2=plasma)
- Both regular and nuclear missiles use the same lock-on targeting flow

### Nuclear missile specifics
- Lock-on targeting same as regular missiles (not area target)
- No confirmation step — same fire flow as regular missiles, just bigger boom
- Multi-lock up to 3 enemies, one nuke per target (uses up to 3 of 6 detonation shader slots)
- Larger missile body than regular missiles + brighter/whiter engine trail (visibly distinct in flight)
- Detonation uses existing volumetric shader system (detonationShading, detSlots)

### Sprite explosion visuals
- Orange/yellow fireball palette: bright white flash -> yellow-orange fireball -> transparent fade
- Size: 1-1.5x enemy size (tight, contained blasts — keeps battlefield readable during heavy salvos)
- Animation: flash -> expand -> fade, 4-6 frame sprite sheet, ~0.5s duration
- Sprite sheet generated procedurally at init time (canvas -> texture). No external image files — pure JS, consistent with codebase conventions
- Billboard quads always face camera, rendered as separate GL pass (not volumetric shader)

### Fuel system & missile death
- 5-8 seconds of burn time — effective at medium range, long-range shots are risky
- When fuel depletes: engine cuts out (no more thrust/guidance) -> missile coasts ballistically for 1-2s -> if not near target, fizzles out silently (no explosion)
- Visual cue: engine trail dims/sputters then goes dark when fuel empty. Missile body continues coasting visibly without trail
- Proximity fuse stays active during coast phase — if coasting missile drifts close enough to target, it still detonates
- Self-destruct without detonation only when fuel exhausted AND trajectory won't intersect target (WPN-08)

### Claude's Discretion
- Control scheme details (which key fires salvo, how lock-on integrates with existing combat mode controls)
- Missile speed, fuel burn rate, and proximity detonation radius tuning
- Lock-on detection radius (how close crosshair must be to enemy to lock)
- Reticle visual style (diamond, brackets, etc.)
- Sprite sheet frame count and exact procedural generation approach
- Billboard quad sizing at various camera distances
- Nuke missile body geometry (larger variant of existing missile box)
- Nuke trail rendering approach (brighter/whiter variant of existing trail)
- Coast duration before self-destruct
- Maximum number of simultaneous sprite explosions

</decisions>

<specifics>
## Specific Ideas

- Multi-lock salvo of 18 missiles (6 targets x 3 each) should look dramatic: a swarm of guided missiles fanning out to different targets
- Tight 1-1.5x explosions keep the battlefield readable even during a full 18-missile salvo
- Engine flame-out visual tells a story: bright thrust -> sputtering -> dark coast -> silent fizzle or surprise proximity hit
- Nuke missiles should be visibly threatening in flight — larger body and brighter trail makes them stand out
- The tracking reticle on locked enemies adds to the tactical "plan your strike" feel before committing the salvo

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `missiles.js`: Complete proportional navigation guidance, trail rendering (60-point ring buffer), proximity detonation (MISSILE_DET_RADIUS=0.5), missile state machine (idle/targeting/fired/cooldown)
- `detonateMissile()`: Already connects missiles to volumetric detonation shader slots — reuse for nuclear missiles
- `detSlots` (6 slots): Volumetric detonation system with u_detPos/u_detAge uniforms — nuclear missiles use these directly
- `weapons.js`: SoA projectile store pattern, firing/cooldown pattern, trajectory preview with hit prediction — follow same patterns for missile store
- `trajPg` shader: GL_POINTS trajectory rendering — reuse for missile lock indicators and trajectory preview
- `shipPg`/`enemyPg` shader: 3D geometry rendering pattern — reuse for billboard quad rendering
- `computeGravAccel()`: Gravity for missile physics (current missiles already use this)

### Established Patterns
- SoA entity store with free-list allocation (combat.js, weapons.js) — follow for missile entity store
- Instanced rendering via ANGLE_instanced_arrays — use for multiple missiles in flight
- Leapfrog integration for gravity-affected physics (nav.js, missiles.js)
- Ecliptic plane lock (Y=0) for all projectile physics
- Bullet time / fast forward affects all physics via simDt scaling
- Additive blending for bright effects (weapons.js: gl.blendFunc(gl.SRC_ALPHA, gl.ONE))
- Per-frame bufferSubData updates (not bufferData) for dynamic geometry

### Integration Points
- Weapon selection: extend selectedWeapon (0=kinetic, 1=plasma) to include 2=regular missile, 3=nuclear
- Combat mode: missile targeting integrates into existing combatMode flow
- Enemy rendering: lock reticles render as overlay on locked enemies (after enemy draw, before HUD)
- Render loop: sprite explosions render after enemies, alongside projectile rendering
- Collision: missile proximity checks via existing radial bin system (getCollisionCandidates)
- Existing missile UI: .missile-fire-btn and missileState machine may be refactored or replaced

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-missile-systems-explosions*
*Context gathered: 2026-03-10*
