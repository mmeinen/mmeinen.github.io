# Phase 5: Enemy Behavior & Combat Feedback - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Grunt enemies come alive — they station-keep near planets, detect the player by proximity, perform orbital transfers to approach, execute hit-and-run attack passes with lead-predicted kinetic rounds, and provide clear visual feedback (white-out flash + particle spray) when hit. Requirements: ENM-01, ENM-06, ENM-10, VFX-01, VFX-02.

</domain>

<decisions>
## Implementation Decisions

### Enemy orbital AI
- Station-keeping near planets when idle — enemies hover at a fixed point relative to their assigned planet (not actively orbiting)
- Proximity-based detection — enemy detects player within a radius and transitions to engagement
- Orbital transfer approach — once triggered, enemy computes a transfer orbit to player's body, consistent with the game's orbital mechanics theme
- Hit-and-run combat style — enemies make attack passes: approach, fire during close-range window, then pull away to re-orbit. Creates breathing room between attacks
- State machine: idle (station-keeping) → alert (player detected) → transfer (moving to player's body) → attack pass (approach + fire) → disengage (pull away) → re-orbit → attack pass again

### Enemy weapons
- Enemy kinetic rounds — reuse existing kinetic projectile system from weapons.js SoA store but with red tracers matching Grunt archetype color (255,80,60)
- Lead prediction + error — enemies predict where player will be and aim at predicted position, but add noise to the prediction. Better accuracy = less noise (tunable per difficulty)
- Single shot per attack pass — one well-aimed shot during each approach run. Fewer projectiles to track, each shot matters. Fits hit-and-run AI style
- Brief red flash at enemy when firing — small bright flash at enemy position gives player a split-second warning. Reuse billboard explosion at tiny scale

### Hit flash feedback
- White-out flash — enemy briefly flashes bright white for ~0.2s then returns to red archetype color. Add a 10th float (flashIntensity) to the instance buffer; shader mixes white based on intensity
- Flash + explosion on missile hits — enemy flashes white AND an explosion plays at impact point for double feedback on heavier weapons
- Smoke/sputter at low HP — below 30% HP, enemy's edge glow flickers and dims irregularly, giving a visual cue they're almost dead

### Impact particles
- Particle spray — burst of small bright sparks/debris that spray outward from impact point. New particle system needed
- Enemy archetype color — Grunt impacts produce red sparks that look like hull debris breaking off. Color matches what was hit
- Small burst (5-8 particles) — quick directional spray away from impact, short-lived (~0.3s). Clean and not visually noisy with many simultaneous hits
- Simple outward fade — particles spray outward in straight lines and fade to zero. No gravity effect (at 0.3s lifetime they won't travel far enough for gravity to matter)

### Claude's Discretion
- Detection radius for player proximity (tune for gameplay feel)
- Transfer orbit computation details (simplified vs full Hohmann for enemy transfers)
- Attack pass distance and speed thresholds
- Disengage distance and re-orbit behavior
- Lead prediction algorithm specifics
- Accuracy noise magnitude per difficulty level
- Firing cooldown between attack passes
- Low-HP flicker rate and intensity
- Particle rendering approach (instanced GL_POINTS, billboard quads, etc.)
- Particle speed and size variation within the burst
- Instance buffer restructuring details for the 10th float

</decisions>

<specifics>
## Specific Ideas

- Hit-and-run attack passes should feel like fighter jet strafing runs — enemies close fast, fire during the window, then pull away. Player has time to react between passes
- Lead prediction gives enemies a "smart" feel — they're not just shooting where you are, they're shooting where you'll be. Noise on the prediction is the difficulty knob
- Single shot per pass keeps things readable even with many enemies. Each incoming round is a distinct threat to track
- Red muzzle flash serves as a brief warning — player gets a split-second "incoming!" signal before the projectile arrives
- Low-HP flicker/sputter tells a damage story without needing health bars (those come in Phase 8 HUD)
- Red hull debris particles on impact sell the physical feel — you're chipping pieces off their ship

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `weapons.js` SoA projectile store: 128-slot store with type field — add type=2 for enemy kinetic rounds with red color
- `checkProjectileHits()` (weapons.js): Radial bin hit detection already works — extend to also check enemy projectiles vs player
- `explosions.js` billboard system: Spawn at tiny scale (~0.3x) for muzzle flash effect
- `combat.js` SoA enemy store: 64-slot store with hp, type, alive arrays — extend with flash state, AI state, target body
- `updateInstanceBuffer()` (combat.js): Currently packs 9 floats per enemy — extend to 10 for flashIntensity
- Enemy vertex/fragment shader: Already has pulsing glow (`0.8 + 0.2*sin(u_time*3.0)`) — add white mix based on flashIntensity attribute
- `computeGravAccel()` / `getBodyVelocity()` (nav.js/orbital.js): Gravity and body velocity for transfer orbit computation
- Radial bins (combat.js): `getCollisionCandidates(r)` for proximity checks (enemy-to-player distance)

### Established Patterns
- SoA entity store with free-list allocation (combat.js, weapons.js) — follow for particle system
- Instanced rendering via ANGLE_instanced_arrays — use for particles
- Leapfrog integration for gravity-affected physics — use for enemy transfers
- Ecliptic plane lock (Y=0) for all entity physics
- Bullet time / fast forward affects all physics via simDt scaling
- Additive blending for bright effects (gl.blendFunc(SRC_ALPHA, ONE))
- Per-frame bufferSubData updates for dynamic instance data

### Integration Points
- Enemy physics update: add AI state machine tick alongside existing enemy position updates
- Projectile system: extend weapons.js to support enemy-fired projectiles (same store, different type)
- Hit detection: extend checkProjectileHits() for enemy-projectile-vs-player and player-projectile-vs-enemy damage + flash
- Render loop: particles render after enemies alongside existing projectile rendering
- Instance buffer: extend stride from 9 to 10 floats, update all attribute pointer offsets
- Shader: add a_instFlash attribute to enemy vertex shader, mix white in fragment shader

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-enemy-behavior-combat-feedback*
*Context gathered: 2026-03-10*
