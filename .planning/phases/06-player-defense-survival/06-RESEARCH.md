# Phase 6: Player Defense & Survival - Research

**Researched:** 2026-03-11
**Domain:** Player HP system, ablative shield debris, multi-stage ship destruction, game over UI, off-screen enemy indicators, game state reset, localStorage persistence
**Confidence:** HIGH

## Summary

Phase 6 closes the gameplay loop by giving the player a hull integrity value that enemy projectiles deplete, a kinetic shield wall of debris pieces that absorb incoming fire, a dramatic multi-stage death sequence culminating in the existing volumetric detonation, a game over screen with stats and high-score tracking, and off-screen enemy indicators for spatial awareness. The codebase is extremely well-prepared: `weapons.js:477-484` already has enemy projectile-to-player collision detection (type=2 check) that currently removes the projectile but applies no damage -- this is the exact placeholder to wire into. The `detSlots` array and volumetric detonation system can trigger ship death explosions. The `spawnExplosion()` billboard system and `spawnImpactParticles()` handle intermediate visual effects. The `createCapitalShipGeometry()` in `math.js` provides the ship mesh data for breakup pieces.

The phase has six distinct technical pillars: (1) a player HP state variable with damage application in the type=2 collision handler, (2) a shield debris SoA store following the established pattern (combat.js, particles.js) with instanced rendering and projectile hit detection, (3) a low-HP damage vignette implemented as a full-screen overlay quad or CSS vignette, (4) a multi-stage death sequence state machine (flicker, breakup, volumetric detonation, camera pull-out), (5) a DOM-based game over screen with stats tracking and localStorage high scores, and (6) DOM-based off-screen enemy indicator chevrons positioned at viewport edges.

The key architectural concern is the death sequence state machine and the restart flow. The death sequence needs to override camera control, spawn breakup debris and trigger a detonation slot, then transition to the game over screen. Restart must reset all game state (player HP, shields, enemies, projectiles, missiles, explosions, particles, wave counter) while preserving high scores. The `enterNavMode()` function provides a template for initialization, but a restart specifically must not re-double planet orbits (they are already doubled from the first `enterNavMode()` call).

**Primary recommendation:** Add a `playerState` object to manage HP, shield debris, combat stats, and death sequence state. Wire damage into the existing type=2 placeholder in `checkProjectileHits()`. Build shield debris as a new SoA store rendered via instanced GL_POINTS or the ship shader. Implement the game over screen as DOM overlay with CSS transitions. Use `localStorage` for high score persistence.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hull integrity 200-300 HP (tanky) -- player is significantly tougher than individual Grunt enemies (100 HP)
- Enemy kinetic rounds deal damage on hit (currently placeholder in weapons.js:482)
- Low HP warning: red/orange vignette creeping in from screen edges below ~30% HP, intensifying as HP drops
- Forward shield wall -- cluster of debris pieces held in formation in front of the ship (facing movement direction)
- 8-12 pieces -- substantial wall that absorbs sustained fire across multiple attack passes
- One-time only -- shields do not regenerate. Creates rising tension as shields thin out over waves
- On hit: piece shatters into smaller fragments that scatter outward (reuse impact particle system from Phase 5), then disappears
- Each piece absorbs one projectile hit before shattering
- Multi-stage breakup with volumetric finale: (1) Ship flickers/sparks for ~1s, (2) Hull breaks into 3-4 pieces that tumble outward, (3) Volumetric shader detonation triggers at ship position (uses 1 detonation slot)
- Camera: slow pull-out zoom during death sequence (~3-4s), revealing wider battlefield as cinematic farewell shot
- Game over overlay appears after explosion settles
- Full screen takeover -- scene fades to dark/black background
- Large "GAME OVER" text with detailed stats below: enemies killed, waves survived, time survived, damage dealt, shots fired, accuracy %
- High score tracking: persist best run record (highest wave, most kills) shown on game over screen
- Restart: Press R to restart (specific key prevents accidental restarts). Also show "ESC to exit" to return to normal navigation mode
- Full gameplay reset on restart: hull to full, shields restored, enemies cleared, wave counter to 1, stats zeroed. Best stats persist across restarts
- Red chevrons (arrows) at screen edges pointing toward off-screen enemies
- Numeric distance shown next to each chevron (e.g., "45u")
- Range-limited -- only show enemies within a reasonable range (Claude picks the threshold)
- Color matches enemy archetype color (red for Grunt, future-proofed for Phase 7 enemy types)
- Show all enemies within range -- no cap on indicator count

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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEF-01 | Player ship has a hull integrity (HP) value displayed on HUD | Player state object with HP, damage vignette overlay, HUD bar (Phase 8 handles full HUD panel, this phase needs at least a visible HP indicator) |
| DEF-02 | Player ship is destroyed with an explosion when hull reaches zero | Multi-stage death sequence state machine: flicker -> breakup -> volumetric detonation -> game over |
| DEF-03 | Game over screen shows stats (waves survived, enemies killed) | DOM overlay with combat stats tracker, localStorage for high scores |
| DEF-04 | Player can restart from game over screen | Full state reset function, R key handler, re-initialization of all SoA stores |
| DEF-05 | Kinetic shields -- physical debris objects positioned in front of the ship that absorb projectile hits | Shield SoA store, instanced rendering, projectile-to-shield collision before hull check |
| DEF-06 | Off-screen enemy indicators -- chevrons at screen edge pointing toward enemies outside viewport | DOM-based indicators with 3D-to-screen projection, edge clamping, rotation toward target |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WebGL 1.0 | n/a | All rendering (shield debris, breakup pieces, vignette) | Project standard; no WebGL2 |
| ANGLE_instanced_arrays | ext | Instanced rendering for shield debris pieces | Established pattern for enemies, explosions |
| localStorage | Web API | High score persistence | Simplest persistence mechanism for static site |
| CSS transforms/transitions | n/a | Game over screen, vignette overlay, indicator positioning | DOM overlay pattern established for lock reticles, planet labels |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing `shipPg` shader | n/a | Render shield debris with same lighting model as ship | Shield pieces should look like hull fragments |
| Existing `trajPg` shader | n/a | Render damage vignette as full-screen quad overlay | Point-based rendering with color/alpha uniforms |
| Existing billboard system | n/a | Sparks during death flicker phase | `spawnExplosion()` at small scale |
| Existing particle system | n/a | Shield shatter fragments | `spawnImpactParticles()` with ship-colored particles |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DOM vignette overlay | Shader post-process | Shader is more performant but requires second render pass; CSS box-shadow inset or radial gradient overlay is trivial to implement and composites for free |
| DOM indicators | GL-rendered indicators | GL would be more integrated but the project already uses DOM for lock reticles and labels; DOM is simpler for text + rotation |
| localStorage | In-memory only | In-memory loses scores on page refresh; localStorage is appropriate for a portfolio game |

## Architecture Patterns

### Recommended Project Structure
```
js/scene/
  combat.js      # (existing) Enemy SoA + AI + radial bins
  weapons.js     # (modify)   Wire damage into type=2 handler, shield collision check
  particles.js   # (existing) Reuse for shield shatter sparks
  explosions.js  # (existing) Reuse for death sparks
  nav.js         # (modify)   Add resetCombat() for restart flow
  missiles.js    # (existing) Already has removeMissile() for cleanup
  shaders.js     # (modify)   Add shield debris vertex/fragment if not reusing shipPg
  math.js        # (modify)   Add shield formation geometry helper

index.html       # (modify)   Player state, shield rendering, death sequence,
                 #             game over DOM, indicator DOM, restart keybinding,
                 #             vignette overlay element, camera override during death
css/style.css    # (modify)   Game over screen, vignette, indicator chevron styles
```

### Pattern 1: Player State Object
**What:** Centralized player state for HP, shields, death, and stats
**When to use:** Always -- this is the single source of truth for player status
**Example:**
```javascript
const playerState = {
  hp: 250,
  maxHp: 250,
  alive: true,
  deathPhase: 0,      // 0=alive, 1=flicker, 2=breakup, 3=detonation, 4=gameOver
  deathTimer: 0,
  // Combat stats (reset per run)
  stats: {
    enemiesKilled: 0,
    wavesSurvived: 1,
    timeSurvived: 0,
    damageDealt: 0,
    shotsFired: 0,
    shotsHit: 0,
  },
  // High scores (persist via localStorage)
  best: {
    wavesSurvived: 0,
    enemiesKilled: 0,
  },
};
```

### Pattern 2: Shield Debris SoA Store
**What:** SoA entity store for shield pieces following established pattern
**When to use:** Shield pieces are small entities that need per-frame position updates and collision checks
**Example:**
```javascript
const MAX_SHIELD_PIECES = 12;
const shield = {
  alive:  new Uint8Array(MAX_SHIELD_PIECES),
  posX:   new Float32Array(MAX_SHIELD_PIECES),
  posY:   new Float32Array(MAX_SHIELD_PIECES),
  posZ:   new Float32Array(MAX_SHIELD_PIECES),
  // Offset from ship center (in ship-local space)
  offX:   new Float32Array(MAX_SHIELD_PIECES),
  offZ:   new Float32Array(MAX_SHIELD_PIECES),
};
let shieldCount = 0;
```

### Pattern 3: Death Sequence State Machine
**What:** Multi-phase state machine controlling the death animation
**When to use:** When `playerState.hp <= 0` triggers the sequence
**Example:**
```javascript
// In the render loop / update:
if (playerState.deathPhase === 1) {
  // Flicker phase: ~1s of sparks and alpha flicker
  playerState.deathTimer += simDtSec;
  if (playerState.deathTimer > 1.0) {
    playerState.deathPhase = 2;
    playerState.deathTimer = 0;
    // Spawn breakup pieces
  }
} else if (playerState.deathPhase === 2) {
  // Breakup phase: pieces tumble outward
  playerState.deathTimer += simDtSec;
  if (playerState.deathTimer > 1.5) {
    playerState.deathPhase = 3;
    playerState.deathTimer = 0;
    // Trigger volumetric detonation at ship position
    triggerDetonationAtShip();
  }
} else if (playerState.deathPhase === 3) {
  // Detonation phase: camera pulls out, volumetric explosion plays
  playerState.deathTimer += simDtSec;
  if (playerState.deathTimer > 3.0) {
    playerState.deathPhase = 4; // game over
    showGameOverScreen();
  }
}
```

### Pattern 4: Off-Screen Indicator via DOM
**What:** Position a rotated chevron at the viewport edge pointing toward an off-screen enemy
**When to use:** Each frame for every enemy that is off-screen but within detection range
**Example:**
```javascript
// For each enemy:
// 1. Project enemy world position to screen coords
// 2. If outside viewport, clamp to edge and compute angle
const sx = /* screen X from projection */;
const sy = /* screen Y from projection */;
const offScreen = sx < 0 || sx > baseWidth || sy < 0 || sy > baseHeight;
if (offScreen) {
  // Clamp to viewport edge with margin
  const cx = baseWidth / 2, cy = baseHeight / 2;
  const dx = sx - cx, dy = sy - cy;
  const angle = Math.atan2(dy, dx);
  const margin = 30;
  // Clamp to edge using angle
  const edgeX = Math.max(margin, Math.min(baseWidth - margin, cx + Math.cos(angle) * (baseWidth / 2 - margin)));
  const edgeY = Math.max(margin, Math.min(baseHeight - margin, cy + Math.sin(angle) * (baseHeight / 2 - margin)));
  // Position and rotate indicator div
  indicator.style.left = edgeX + 'px';
  indicator.style.top = edgeY + 'px';
  indicator.style.transform = 'translate(-50%,-50%) rotate(' + (angle * 180 / Math.PI) + 'deg)';
}
```

### Anti-Patterns to Avoid
- **Modifying the ray march shader for vignette:** The vignette should be a DOM overlay or a separate GL pass AFTER the ray march. Modifying the main shader is fragile and violates PRF-02 (combat elements never inside ray march).
- **Shield as shader effect:** Shields must be physical 3D objects with collision detection, not visual-only. They are "kinetic shields" (physical debris) per the design.
- **Resetting state by calling exitNavMode()+enterNavMode():** This would re-double planet orbits and respawn enemies from scratch. Instead, build a dedicated `resetCombat()` function that clears entities without touching orbital scaling.
- **Blocking the render loop during death sequence:** The death sequence must be non-blocking (state machine driven by delta time), not a setTimeout chain, to keep the render loop running for animations.
- **Using requestAnimationFrame-independent timers for death sequence:** All timing must go through `simDtSec` to respect bullet time / fast forward, keeping the death animation time-scale consistent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shield rendering | Custom shader program | Reuse `shipPg` shader (same lighting model) | Shield pieces are hull fragments; they should look like ship material with the same lighting |
| Shield shatter particles | New particle system | `spawnImpactParticles()` with ship color | Existing particle system handles 256 particles at 5-8 per burst; shield hits are identical use case |
| Death explosion | New explosion effect | `spawnExplosion()` for sparks + `detSlots` for volumetric | Both systems already exist and have proven performance |
| Screen-space projection | Custom projection math | Reuse pattern from lock reticle positioning (index.html:1197-1209) | Exact same operation: world pos -> camera-relative -> screen coords |
| State persistence | Custom serialization | `localStorage.setItem/getItem` with `JSON.stringify/parse` | Web standard, zero dependencies, survives page refresh |

**Key insight:** This phase primarily wires together existing systems (collision detection, particles, explosions, detonation slots, DOM overlays) with new game state (HP, shields, death sequence, stats). Very little new rendering infrastructure is needed.

## Common Pitfalls

### Pitfall 1: Shield Collision Must Come Before Hull Check
**What goes wrong:** If you check hull collision in the same loop pass as shield collision, a projectile might damage the hull even when shields are in the way.
**Why it happens:** The type=2 handler in `checkProjectileHits()` currently checks only `flyPos`. Adding shield checks must happen BEFORE the hull check.
**How to avoid:** In the type=2 branch, first iterate shield pieces for proximity. If a shield piece absorbs the hit, destroy the shield piece, remove the projectile, and `continue` before reaching the hull check.
**Warning signs:** Player takes damage when shield is visually blocking the shot.

### Pitfall 2: Restart Must Not Re-Double Planet Orbits
**What goes wrong:** Planet `oR` values are doubled on first `enterNavMode()` call. If restart calls `exitNavMode()` then `enterNavMode()`, orbits halve then double -- but any rounding or state mismatch corrupts the orbital system.
**Why it happens:** `enterNavMode()` mutates `planetData[i].oR *= 2` and stores originals. Calling it again without proper exit would double again.
**How to avoid:** Build a `resetCombat()` function that resets player state, clears all entity SoA stores, and respawns enemies WITHOUT touching `enterNavMode()`/`exitNavMode()`. The nav mode orbital scaling stays active.
**Warning signs:** After restart, planets are at wrong distances or enemies spawn at incorrect positions.

### Pitfall 3: Death Sequence Camera Override Must Be Reversible
**What goes wrong:** If the camera pull-out modifies `navCamDist` directly, restart won't know what the original distance was.
**Why it happens:** Camera state is global (`navCamAz`, `navCamEl`, `navCamDist`).
**How to avoid:** Store the camera state before death sequence begins. During death, override camera computation in the render loop (check `playerState.deathPhase`). On restart, restore the saved camera state.
**Warning signs:** After restart, camera is zoomed way out instead of at normal distance.

### Pitfall 4: Ship Rendering Must Stop After Breakup
**What goes wrong:** The ship mesh continues to render at `flyPos` even after the hull "broke apart."
**Why it happens:** The ship rendering in the render loop is unconditional when `flyMode` is true.
**How to avoid:** Gate ship rendering on `playerState.alive` or `playerState.deathPhase < 2`. After breakup phase starts, ship mesh stops drawing; breakup debris pieces draw instead.
**Warning signs:** Ship mesh visible alongside breakup debris and detonation.

### Pitfall 5: Stat Tracking Must Hook Into Existing Damage/Kill Code
**What goes wrong:** Stats are inaccurate because some kills/damage happen through missile blasts or other paths not hooked.
**Why it happens:** Damage is applied in multiple places: `checkProjectileHits()`, `checkMissileBlastHits()`, and potentially the volumetric nuke system.
**How to avoid:** Create helper functions like `recordPlayerDamageDealt(amount)` and `recordEnemyKill()` that are called from ALL damage/kill paths. Grep all `removeEnemy()` calls and all `enemies.hp[ci] -= dmg` lines to ensure coverage.
**Warning signs:** Accuracy % doesn't match observed gameplay, kill count is lower than actual.

### Pitfall 6: Input Must Be Blocked During Death/Game Over
**What goes wrong:** Player fires weapons or initiates transfers while dead or on game over screen.
**Why it happens:** Input handlers don't check `playerState.alive`.
**How to avoid:** Gate combat input (weapon fire, lock targeting) and navigation input (orbit transfer, altitude) on `playerState.alive`. On game over screen, only R (restart) and Escape (exit) should be active.
**Warning signs:** Weapons fire from dead ship position, orbit transfers happen during game over.

## Code Examples

### Wiring Damage Into Existing Placeholder (weapons.js:477-484)
```javascript
// BEFORE (current code):
if (proj.type[i] === 2) {
  const dx = proj.posX[i] - flyPos[0];
  const dz = proj.posZ[i] - flyPos[2];
  if (dx * dx + dz * dz < HIT_RADIUS_KINETIC * HIT_RADIUS_KINETIC) {
    // Hit player (damage deferred to Phase 6 player HP system)
    removeProjectile(i);
  }
  continue;
}

// AFTER (Phase 6 implementation):
if (proj.type[i] === 2) {
  // Check shields first
  let shieldAbsorbed = false;
  for (let si = 0; si < MAX_SHIELD_PIECES; si++) {
    if (!shield.alive[si]) continue;
    const sdx = proj.posX[i] - shield.posX[si];
    const sdz = proj.posZ[i] - shield.posZ[si];
    if (sdx * sdx + sdz * sdz < SHIELD_HIT_RADIUS_SQ) {
      // Shield absorbs the hit
      shieldAbsorbed = true;
      destroyShieldPiece(si);
      removeProjectile(i);
      break;
    }
  }
  if (shieldAbsorbed) continue;
  // Then check hull
  const dx = proj.posX[i] - flyPos[0];
  const dz = proj.posZ[i] - flyPos[2];
  if (dx * dx + dz * dz < HIT_RADIUS_KINETIC * HIT_RADIUS_KINETIC) {
    applyPlayerDamage(ENEMY_KINETIC_DAMAGE);
    removeProjectile(i);
  }
  continue;
}
```

### Shield Formation Update (per frame)
```javascript
// Shield pieces are positioned relative to ship heading
// Formation: arc in front of the ship, offset by ship-local coordinates
function updateShieldPositions() {
  const fwdX = flyFwd[0], fwdZ = flyFwd[2];
  // Right vector (perpendicular to forward in XZ plane)
  const rightX = -fwdZ, rightZ = fwdX;
  for (let i = 0; i < MAX_SHIELD_PIECES; i++) {
    if (!shield.alive[i]) continue;
    // Convert local offset to world position
    shield.posX[i] = flyPos[0] + fwdX * shield.offZ[i] + rightX * shield.offX[i];
    shield.posZ[i] = flyPos[2] + fwdZ * shield.offZ[i] + rightZ * shield.offX[i];
    shield.posY[i] = 0;
  }
}
```

### Vignette Overlay (CSS approach)
```css
.damage-vignette {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 15; /* above HUD overlay (10), below labels (25) */
  box-shadow: inset 0 0 150px rgba(255, 60, 30, var(--vignette-alpha, 0));
  transition: box-shadow 0.3s ease;
}
```
```javascript
// Update each frame:
const hpRatio = playerState.hp / playerState.maxHp;
if (hpRatio < 0.3) {
  const intensity = 1.0 - (hpRatio / 0.3); // 0 at 30%, 1 at 0%
  vignetteEl.style.setProperty('--vignette-alpha', (intensity * 0.7).toFixed(2));
} else {
  vignetteEl.style.setProperty('--vignette-alpha', '0');
}
```

### Game Over Screen DOM Structure
```html
<div class="game-over-screen" id="game-over-screen">
  <div class="game-over-title">GAME OVER</div>
  <div class="game-over-stats" id="game-over-stats"></div>
  <div class="game-over-best" id="game-over-best"></div>
  <div class="game-over-prompt">
    <span class="game-over-key">R</span> RESTART
    <span class="game-over-key">ESC</span> EXIT
  </div>
</div>
```

### Off-Screen Indicator CSS
```css
.enemy-indicator {
  position: fixed;
  pointer-events: none;
  z-index: 25;
  font-family: monospace;
  font-size: 11px;
  white-space: nowrap;
}
.enemy-indicator::before {
  content: '';
  display: block;
  width: 0; height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 10px solid currentColor;
  margin: 0 auto 2px;
}
.enemy-indicator .dist {
  text-align: center;
}
```

### Detonation Slot Trigger for Ship Death
```javascript
// Reuse the existing detonation system for the volumetric death explosion
function triggerDetonationAtShip() {
  const slot = detSlots.find(s => !s.active);
  if (!slot) return;
  slot.pos[0] = flyPos[0];
  slot.pos[1] = 0;
  slot.pos[2] = flyPos[2];
  slot.startSimTime = simTime;
  slot.active = true;
}
```

### localStorage High Score Persistence
```javascript
function loadHighScores() {
  try {
    const data = localStorage.getItem('meinenspace_best');
    if (data) {
      const parsed = JSON.parse(data);
      playerState.best.wavesSurvived = parsed.wavesSurvived || 0;
      playerState.best.enemiesKilled = parsed.enemiesKilled || 0;
    }
  } catch (e) { /* ignore parse errors */ }
}

function saveHighScores() {
  try {
    localStorage.setItem('meinenspace_best', JSON.stringify(playerState.best));
  } catch (e) { /* ignore storage errors */ }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No player HP | Player takes no damage from enemy fire | Phase 5 | Type=2 projectiles detected but damage deferred |
| No shields | No defensive mechanism | Pre-Phase 6 | Phase 6 adds kinetic shield wall |
| No death/restart | Combat has no fail state | Pre-Phase 6 | Phase 6 closes the gameplay loop |
| No game state tracking | No stats or persistence | Pre-Phase 6 | Phase 6 adds combat stats + localStorage |

**Current codebase affordances:**
- `checkProjectileHits()` type=2 branch is the exact insertion point for player damage
- `detSlots` array has 6 slots (plenty for one ship death detonation)
- `enemies.posX/posZ` arrays provide direct access for indicator calculations
- `_camP`, `_camF`, `_camR`, `_camU` are available globally for screen projection
- `createCapitalShipGeometry()` returns positions/normals/indices usable for breakup pieces
- The existing lock reticle DOM pool pattern (index.html:204-206) is the exact model for indicator divs

## Open Questions

1. **Shield piece rendering approach: individual draw calls vs instanced?**
   - What we know: With 8-12 pieces, either approach works. Instanced rendering matches the enemy pattern but individual draws (like missiles) work fine for < 20 entities.
   - What's unclear: Whether shield pieces need the full ship lighting model or can be simpler GL_POINTS.
   - Recommendation: Use the `shipPg` shader with individual draw calls (like missile rendering at index.html:897-931). At 8-12 pieces, the overhead is negligible, and the pieces get proper lighting. Use `createBoxGeometry()` for small rectangular debris pieces.

2. **Vignette implementation: CSS vs GL?**
   - What we know: CSS `box-shadow: inset` creates a vignette effect with zero GL overhead. A GL post-process quad would be more precise but requires a second full-screen pass.
   - What's unclear: Whether CSS `box-shadow` with `rgba` produces a convincing enough vignette on all browsers.
   - Recommendation: Use CSS `box-shadow: inset` with a `<div>` overlay. The `pointer-events: none` property keeps it non-interactive. This is the simplest approach and matches the project's DOM overlay pattern. Fall back to a GL quad only if visual quality is insufficient.

3. **How to handle ship breakup debris rendering?**
   - What we know: The death breakup shows 3-4 hull fragments tumbling outward. These need to be rendered for ~1.5s then replaced by the detonation.
   - What's unclear: Whether to extract sub-meshes from `createCapitalShipGeometry()` or generate simpler box shapes.
   - Recommendation: Use 3-4 `createBoxGeometry()` pieces at different scales and orientations, rendered with `shipPg`. Simpler than trying to slice the ship mesh, and the detonation replaces them quickly anyway.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based tests.html (regex extraction + invariant checks) |
| Config file | tests.html |
| Quick run command | Open `http://localhost:8000/tests.html` in browser |
| Full suite command | Open `http://localhost:8000/tests.html` + visual check of black hole scene |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEF-01 | Player HP decreases when hit by enemy projectile | manual | Visual: enter nav mode, let enemies fire, observe HP bar decrease | N/A |
| DEF-02 | Ship destroyed with explosion at hull=0 | manual | Visual: let HP reach 0, observe flicker -> breakup -> detonation sequence | N/A |
| DEF-03 | Game over screen with stats | manual | Visual: die, observe game over screen with correct stats | N/A |
| DEF-04 | Restart from game over | manual | Visual: press R on game over, confirm fresh state | N/A |
| DEF-05 | Shield debris absorbs projectiles | manual | Visual: observe shield pieces, let enemy fire, see pieces shatter before HP drops | N/A |
| DEF-06 | Off-screen enemy indicators | manual | Visual: zoom in close, observe chevrons at edges pointing to enemies | N/A |

### Sampling Rate
- **Per task commit:** Open `http://localhost:8000/tests.html` to verify shader invariants not broken
- **Per wave merge:** Full visual check: enter nav mode, test combat, let shields absorb, take damage, die, check game over, restart
- **Phase gate:** All 6 DEF requirements verified via manual gameplay test

### Wave 0 Gaps
None -- this phase relies entirely on manual visual/gameplay testing. The existing `tests.html` shader invariant suite covers any shader modifications (if vignette is done as GL). No new automated test infrastructure is needed.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `weapons.js:477-484` (type=2 placeholder), `combat.js` (SoA pattern), `particles.js` (particle system for reuse), `explosions.js` (billboard + sprite sheet), `nav.js` (enterNavMode/exitNavMode for restart reference), `missiles.js` (SoA missile store), `index.html` render loop (camera, ship rendering, detonation slots)
- `css/style.css` (HUD styling patterns, lock reticle DOM pattern, z-index layers)
- `.claude/rules/shader-conventions.md` (shader invariants -- early escape threshold, step cap)
- `.claude/rules/styling.md` (HUD theme colors, z-index layers)

### Secondary (MEDIUM confidence)
- WebGL 1.0 `box-shadow: inset` vignette approach -- widely used CSS technique, verified to work with `pointer-events: none`
- `localStorage` API -- standard Web API with broad browser support, appropriate for simple key-value persistence

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- entirely reuses existing project patterns and systems
- Architecture: HIGH -- all integration points identified from direct code reading
- Pitfalls: HIGH -- derived from specific code analysis (e.g., orbit doubling in enterNavMode, type=2 placeholder)
- Shield collision: HIGH -- straightforward extension of existing radial check pattern
- Death sequence: MEDIUM -- multi-phase state machine is well-understood but timing tuning will need iteration
- Game over screen: HIGH -- DOM overlay is a well-established pattern in this project

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable -- internal codebase, no external dependency changes)
