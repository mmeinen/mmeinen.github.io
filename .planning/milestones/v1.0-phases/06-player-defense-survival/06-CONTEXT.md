# Phase 6: Player Defense & Survival - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Player can take damage from enemy projectiles, defend with kinetic shields (physical debris wall), and experience a complete death-and-restart loop with detailed stats and high-score tracking. Off-screen enemy indicators provide spatial awareness. Requirements: DEF-01, DEF-02, DEF-03, DEF-04, DEF-05, DEF-06.

</domain>

<decisions>
## Implementation Decisions

### Hull integrity
- 200-300 HP (tanky) — player is significantly tougher than individual Grunt enemies (100 HP)
- Enemy kinetic rounds deal damage on hit (currently placeholder in weapons.js:482)
- Low HP warning: red/orange vignette creeping in from screen edges below ~30% HP, intensifying as HP drops

### Kinetic shields
- Forward shield wall — cluster of debris pieces held in formation in front of the ship (facing movement direction)
- 8-12 pieces — substantial wall that absorbs sustained fire across multiple attack passes
- One-time only — shields do not regenerate. Creates rising tension as shields thin out over waves
- On hit: piece shatters into smaller fragments that scatter outward (reuse impact particle system from Phase 5), then disappears
- Each piece absorbs one projectile hit before shattering

### Ship destruction sequence
- Multi-stage breakup with volumetric finale:
  1. Ship flickers/sparks for ~1s
  2. Hull breaks into 3-4 pieces that tumble outward
  3. Volumetric shader detonation triggers at ship position (uses 1 detonation slot)
- Camera: slow pull-out zoom during death sequence (~3-4s), revealing wider battlefield as cinematic farewell shot
- Game over overlay appears after explosion settles

### Game over screen
- Full screen takeover — scene fades to dark/black background
- Large "GAME OVER" text with detailed stats below:
  - Enemies killed
  - Waves survived
  - Time survived
  - Damage dealt
  - Shots fired
  - Accuracy %
- High score tracking: persist best run record (highest wave, most kills) shown on game over screen. Gives a score to chase
- Restart: Press R to restart (specific key prevents accidental restarts). Also show "ESC to exit" to return to normal navigation mode
- Full gameplay reset on restart: hull to full, shields restored, enemies cleared, wave counter to 1, stats zeroed. Best stats persist across restarts

### Off-screen enemy indicators
- Red chevrons (arrows) at screen edges pointing toward off-screen enemies
- Numeric distance shown next to each chevron (e.g., "45u")
- Range-limited — only show enemies within a reasonable range (Claude picks the threshold)
- Color matches enemy archetype color (red for Grunt, future-proofed for Phase 7 enemy types)
- Show all enemies within range — no cap on indicator count

### Claude's Discretion
- Exact hull HP value within 200-300 range
- Shield piece geometry and visual style (rock chunks, metal plates, etc.)
- Shield wall positioning and formation shape relative to ship heading
- Shield piece hit detection approach (extend radial bins or separate check)
- Death sequence timing details (flicker duration, breakup speed, camera zoom rate)
- Vignette shader implementation (post-process pass or overlay)
- Stats persistence mechanism (localStorage or in-memory only)
- Off-screen indicator range threshold
- Indicator stacking/overlap behavior when multiple enemies are in similar directions
- Damage values for enemy projectile types
- Ship hit flash effect (if any, on taking damage)
- High score display formatting on game over screen

</decisions>

<specifics>
## Specific Ideas

- Shield wall should feel like ablative armor — you're physically protected by debris, and watching pieces shatter off under fire tells a damage story
- One-time shields create a survival arc: early waves feel safe behind the wall, later waves feel increasingly exposed
- Multi-stage death with volumetric finale is the dramatic payoff — ship breaks apart, then the reactor goes critical
- Slow camera pull-out during death gives the player a moment to process and see the battlefield they fought in
- Full screen takeover for game over creates a clean break between "playing" and "reviewing"
- Detailed stats + high scores give competitive motivation for replaying
- Press R to restart is deliberate — player has time to read stats before choosing to go again
- Off-screen chevrons with distance give spatial awareness without needing a minimap (tactical zoom in Phase 9 serves that role)
- Archetype-colored indicators future-proof for Phase 7 where knowing enemy type matters for threat assessment

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `weapons.js:482`: Enemy projectile-to-player collision detection already built (type=2 check) — currently placeholder, wire in damage application
- `spawnExplosion(x, y, z, size)` (explosions.js): Billboard explosion system — use for intermediate effects during death sequence
- Volumetric detonation system (`detSlots`, `u_detPos`, `u_detAge`): Use 1 slot for ship death explosion
- `spawnImpactParticles()` (particles.js): 256-slot SoA particle system — reuse for shield shatter sparks
- `enemies.posX[i]`, `enemies.posZ[i]` (combat.js): Direct access to all enemy positions for indicator calculations
- `_mvp` matrix (index.html render loop): Available for world-to-screen projection for indicators
- `enterNavMode()` / `exitNavMode()` (nav.js): Reset hooks for restart flow
- `shipPg` shader program (index.html): Ship rendering with `u_thrustIntensity` — extend for damage visuals
- `createCapitalShipGeometry()` (math.js): Ship 3D model for breakup pieces

### Established Patterns
- SoA entity store with free-list allocation (combat.js, weapons.js, particles.js) — follow for shield debris store
- Instanced rendering via ANGLE_instanced_arrays — use for shield debris pieces
- Enemy damage flow: `enemies.hp[ci] -= dmg; enemies.flash[ci] = 1.0; if (hp <= 0) { spawnExplosion(); removeEnemy(); }` — mirror for player
- Additive blending for bright effects (`gl.blendFunc(SRC_ALPHA, ONE)`)
- HUD elements use existing blue theme `rgba(60,140,255,*)`, warnings use `rgba(255,160,80,*)`
- Instance buffer stride pattern: extend with additional per-instance data as needed
- DOM overlay for HUD elements (planet labels, lock reticles) — follow for indicators and game over screen

### Integration Points
- Enemy projectile hit: extend `weapons.js` type=2 collision handler to apply hull damage
- Shield hit detection: check enemy projectiles against shield debris positions before checking hull
- Render loop: shield debris renders alongside ship; indicators render as HUD overlay
- Death trigger: when `playerHP <= 0`, initiate death sequence state machine
- Restart: call `exitNavMode()` then re-enter with fresh state
- Camera control: override camera during death sequence for pull-out zoom

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-player-defense-survival*
*Context gathered: 2026-03-11*
