# Phase 4: Missile Systems & Explosions - Research

**Researched:** 2026-03-10
**Domain:** Guided missile physics (proportional navigation), WebGL 1.0 billboard sprite explosions, procedural sprite sheet generation, lock-on targeting UX
**Confidence:** HIGH

## Summary

Phase 4 transforms the existing missile system from a simple point-and-click launcher into a full lock-on targeting system with two missile types (regular and nuclear), adds fuel constraints and proximity detonation to regular missiles, and introduces sprite-based billboard explosions for non-nuclear combat. The codebase already has a working missile system in `missiles.js` with proportional navigation guidance, trail rendering, and proximity detonation tied to the volumetric shader system. The key work is: (1) refactoring the missile system from targeting ground positions to locking onto enemies, (2) adding multi-lock salvo capability (up to 6 targets, 3 missiles each), (3) implementing fuel depletion with visual feedback, (4) creating a separate nuclear missile variant that uses existing `detSlots`, (5) building a billboard explosion rendering pipeline with procedurally generated sprite sheets, and (6) adding weapon slots 3/4 to extend the existing `selectedWeapon` system.

The existing `missiles.js` is a solid foundation but needs significant rework. The current system targets static ground positions (`{x, z}` pairs), but Phase 4 requires targeting live enemies (dynamic positions from the `enemies` SoA store). The proportional navigation guidance code is already there and working -- it just needs to track moving targets instead of fixed coordinates. The detonation system (`detSlots` with 6 volumetric shader slots) is already wired up via `detonateMissile()` and will be reused directly for nuclear missiles. The projectile rendering patterns from `weapons.js` (SoA store, free-list, GL_POINTS with `trajPg`) provide the template for missile SoA storage. Billboard quad explosions are a new rendering primitive that requires a dedicated shader program (not the existing `trajPg` which only does points/lines).

**Primary recommendation:** Refactor `missiles.js` into a full missile weapon module with SoA storage, fuel state, and enemy-tracking guidance. Create a new billboard shader program for sprite explosions. Generate the explosion sprite sheet procedurally at init time using a 2D canvas. Extend `selectedWeapon` to support 4 weapons (0=kinetic, 1=plasma, 2=regular missile, 3=nuclear missile) with keys 3/4.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Enemy lock-on targeting: crosshair over enemy -> lock indicator appears -> fire sends missiles to locked targets
- Multi-lock salvo system: lock up to 6 enemies, 3 missiles per locked target (up to 18 missiles per salvo)
- Tracking reticle on each locked enemy: diamond/bracket overlay that follows them, showing lock count (e.g., x3 missiles assigned)
- Weapon selection: key 3 = regular missiles, key 4 = nuclear missiles (extends Phase 3's 1=kinetic, 2=plasma)
- Both regular and nuclear missiles use the same lock-on targeting flow
- Nuclear missile lock-on targeting same as regular missiles (not area target)
- No confirmation step for nuclear -- same fire flow as regular missiles, just bigger boom
- Nuclear multi-lock up to 3 enemies, one nuke per target (uses up to 3 of 6 detonation shader slots)
- Larger nuclear missile body than regular missiles + brighter/whiter engine trail (visibly distinct in flight)
- Nuclear detonation uses existing volumetric shader system (detonationShading, detSlots)
- Sprite explosion palette: bright white flash -> yellow-orange fireball -> transparent fade
- Sprite explosion size: 1-1.5x enemy size (tight, contained blasts)
- Animation: flash -> expand -> fade, 4-6 frame sprite sheet, ~0.5s duration
- Sprite sheet generated procedurally at init time (canvas -> texture). No external image files
- Billboard quads always face camera, rendered as separate GL pass (not volumetric shader)
- 5-8 seconds of fuel burn time
- When fuel depletes: engine cuts out -> missile coasts ballistically for 1-2s -> fizzles out silently if not near target
- Visual cue: engine trail dims/sputters then goes dark when fuel empty
- Proximity fuse stays active during coast phase
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WPN-05 | Player can fire regular missiles with proportional navigation guidance toward a target | Existing PN guidance in missiles.js needs refactoring from static targets to enemy tracking; SoA store pattern from weapons.js |
| WPN-06 | Regular missiles detonate when within blast radius of their target (proximity detonation) | Existing MISSILE_DET_RADIUS proximity check in updateMissiles(); extend to check enemy positions via radial bins |
| WPN-07 | Regular missiles have a fuel supply that depletes during flight | New fuel field in missile SoA store; fuel decrement per simDt; thrust zeroed when fuel empty |
| WPN-08 | Missiles self-destruct without detonation when fuel exhausted and trajectory will not intersect target | Coast phase with trajectory-miss detection; dot product of velocity toward target determines intersection likelihood |
| WPN-09 | Regular missile explosions are sprite-based (billboard), not volumetric | New billboard shader program; procedural sprite sheet texture; explosion SoA store with age-based frame selection |
| WPN-10 | Player can fire nuclear missiles with existing volumetric detonation shader | Reuse detonateMissile() -> detSlots pipeline; larger missile body variant; weapon slot 3 |
| VFX-03 | Sprite-based billboard explosions for regular combat (not volumetric) | Billboard quad shader with camera-right/up extraction from view matrix; textured quad with alpha blending |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WebGL 1.0 | N/A | All rendering (billboard quads, missile bodies, trails) | Project standard -- no WebGL 2 |
| ANGLE_instanced_arrays | ext | Instanced rendering for missiles in flight | Already used for enemies in combat.js |
| Canvas 2D API | N/A | Procedural sprite sheet generation at init | No external images -- matches codebase convention |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| GLSL ES 1.0 | N/A | Billboard vertex shader (camera-facing) + textured fragment | Billboard explosion rendering |
| Existing trajPg | N/A | Missile trail points, lock reticle rendering | Reuse for all point/line rendering |
| Existing shipPg | N/A | Missile body rendering (box geometry) | Both regular and nuclear missile bodies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Billboard quads (2 triangles) | gl_PointSize sprites | Points are simpler but limited to gl_PointSize max (typically 64-256px); quads allow arbitrary size and proper UV mapping for sprite sheet frames |
| Procedural canvas sprite sheet | Pre-drawn PNG | Procedural matches no-external-assets convention; PNG would be simpler but breaks codebase pattern |
| SoA missile store | Current array-of-objects missiles[] | SoA is established project pattern (combat.js, weapons.js); current missiles[] uses AoS which is inconsistent |

## Architecture Patterns

### Recommended Project Structure
```
js/scene/
  missiles.js     # REFACTORED: missile SoA store, guidance, fuel, targeting state machine
  weapons.js      # EXTENDED: weapon slots 3/4, fireSelectedWeapon() additions
  combat.js       # UNCHANGED: enemy store, radial bins
  explosions.js   # NEW: sprite explosion SoA store, billboard rendering, procedural sprite sheet
  shaders.js      # EXTENDED: billboard vertex/fragment shader strings
  nav.js          # MINOR: lock-on detection helper
  math.js         # UNCHANGED
```

### Pattern 1: Missile SoA Store (replaces current AoS missiles[])
**What:** Structure-of-Arrays for missile entities following the established combat.js/weapons.js pattern
**When to use:** All missile state management (regular + nuclear)
**Example:**
```javascript
const MAX_MISSILES_ACTIVE = 24; // 6 targets x 3 regular + buffer for nuclear
const missile = {
  alive:    new Uint8Array(MAX_MISSILES_ACTIVE),
  posX:     new Float32Array(MAX_MISSILES_ACTIVE),
  posZ:     new Float32Array(MAX_MISSILES_ACTIVE),
  velX:     new Float32Array(MAX_MISSILES_ACTIVE),
  velZ:     new Float32Array(MAX_MISSILES_ACTIVE),
  fwdX:     new Float32Array(MAX_MISSILES_ACTIVE),
  fwdZ:     new Float32Array(MAX_MISSILES_ACTIVE),
  fuel:     new Float32Array(MAX_MISSILES_ACTIVE),
  targetIdx: new Int16Array(MAX_MISSILES_ACTIVE),  // enemy index in SoA store
  type:     new Uint8Array(MAX_MISSILES_ACTIVE),    // 0=regular, 1=nuclear
  age:      new Float32Array(MAX_MISSILES_ACTIVE),
};
const missileFreeSlots = [];
for (let i = MAX_MISSILES_ACTIVE - 1; i >= 0; i--) missileFreeSlots.push(i);
```

### Pattern 2: Lock-On Targeting State Machine
**What:** Multi-step targeting flow: idle -> selecting targets -> locked -> fired -> cooldown
**When to use:** Both regular and nuclear missile fire flow
**Example:**
```javascript
// Lock state per weapon type
const lockState = {
  targets: [],       // [{enemyIdx, count}] -- which enemies are locked and missile count per
  maxTargets: 6,     // regular missiles: 6 targets
  maxPerTarget: 3,   // regular: 3 missiles each
  state: 'idle',     // 'idle' | 'locking' | 'fired' | 'cooldown'
};
// Nuclear override:
// maxTargets: 3, maxPerTarget: 1, uses detSlots for detonation
```

### Pattern 3: Billboard Quad Rendering (Camera-Facing)
**What:** Extract camera right/up vectors from view matrix in vertex shader to orient quads toward camera
**When to use:** Sprite-based explosions at arbitrary 3D positions
**Example:**
```glsl
// Billboard vertex shader
attribute vec3 a_center;      // explosion world position
attribute vec2 a_offset;      // quad corner offset (-0.5 to 0.5)
attribute vec2 a_uv;          // sprite sheet UV coordinates
uniform mat4 u_viewProj;
uniform mat4 u_view;          // need view matrix to extract camera vectors
uniform float u_size;         // explosion size
varying vec2 v_uv;

void main() {
  // Extract camera right and up from view matrix columns
  vec3 camRight = vec3(u_view[0][0], u_view[1][0], u_view[2][0]);
  vec3 camUp    = vec3(u_view[0][1], u_view[1][1], u_view[2][1]);

  vec3 worldPos = a_center
    + camRight * a_offset.x * u_size
    + camUp * a_offset.y * u_size;

  gl_Position = u_viewProj * vec4(worldPos, 1.0);
  v_uv = a_uv;
}
```

### Pattern 4: Procedural Sprite Sheet via Canvas 2D
**What:** Generate explosion animation frames at init time using 2D canvas, then upload as WebGL texture
**When to use:** Sprite explosion texture creation (no external image files)
**Example:**
```javascript
function generateExplosionSpriteSheet(frameCount, frameSize) {
  const canvas = document.createElement('canvas');
  canvas.width = frameCount * frameSize;
  canvas.height = frameSize;
  const ctx = canvas.getContext('2d');

  for (let f = 0; f < frameCount; f++) {
    const t = f / (frameCount - 1); // 0..1 animation progress
    const cx = f * frameSize + frameSize / 2;
    const cy = frameSize / 2;
    const radius = frameSize * 0.1 + frameSize * 0.4 * t; // expanding
    const alpha = 1.0 - t * t; // quadratic fade

    // White flash core (frame 0-1)
    if (t < 0.3) {
      const flashAlpha = (1 - t / 0.3) * alpha;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.5);
      grad.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
      grad.addColorStop(1, `rgba(255,200,100,0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(f * frameSize, 0, frameSize, frameSize);
    }

    // Orange/yellow fireball (all frames)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(255,200,80,${alpha * 0.9})`);
    grad.addColorStop(0.4, `rgba(255,120,20,${alpha * 0.7})`);
    grad.addColorStop(0.7, `rgba(200,60,10,${alpha * 0.4})`);
    grad.addColorStop(1, `rgba(100,30,5,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas; // Upload to WebGL texture via gl.texImage2D
}
```

### Anti-Patterns to Avoid
- **Rendering explosions inside ray march shader:** Violates PRF-02 (all combat elements as separate GL passes). Billboard explosions must be their own draw call.
- **Per-missile draw call for bodies:** With up to 18 missiles in a salvo, per-missile draw calls are expensive. Use instanced rendering (ANGLE_instanced_arrays) like enemies.
- **Allocating per-frame:** No `new` in the update/render loop. Pre-allocate all Float32Arrays at init. Current missiles[] creates `new Float32Array(MISSILE_TRAIL_LEN*3)` per missile -- refactor to pre-allocated SoA.
- **Tracking static positions instead of enemy indices:** Current missiles target `{x, z}` coordinates. Phase 4 missiles must track `enemyIdx` and read live positions from `enemies.posX[idx]`/`enemies.posZ[idx]` each frame.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Volumetric nuclear explosions | Custom explosion shader | Existing `detonationShading()` + `detSlots` | Already implemented, tested, and performant with 6 shader slots |
| Radial collision detection | Linear scan of all enemies | `getCollisionCandidates(r)` from combat.js | O(n) via radial bins already built |
| Camera-facing math | CPU billboard matrix per explosion | GPU billboard in vertex shader (extract from view matrix) | One vertex shader handles all billboard orientation; no CPU matrix math per explosion |
| Gravity-affected missile physics | New gravity function | `computeGravAccel()` from nav.js | Already used by current missiles and kinetic projectiles |
| Screen-space enemy projection | New projection code | Existing camera projection in render loop (lines 650-669 of index.html) | Same pattern used for planet hover detection and L-point labels |

**Key insight:** This phase has unusually high code reuse potential. The proportional navigation, detonation pipeline, radial bins, and rendering infrastructure all exist. The main new work is the lock-on targeting UX, fuel system, and billboard explosion renderer.

## Common Pitfalls

### Pitfall 1: Dead Enemy Reference
**What goes wrong:** Missile targets an enemy by index, but that enemy dies (from other weapons) before missile arrives. Missile reads stale/garbage data from the SoA store, or the slot gets reused for a new enemy.
**Why it happens:** Free-list allocation reuses slots. A missile's `targetIdx` could point to a dead or respawned enemy.
**How to avoid:** Every frame, check `enemies.alive[missile.targetIdx[i]]` before reading target position. If target is dead, missile either self-destructs (fizzle) or retargets to nearest enemy within proximity.
**Warning signs:** Missiles suddenly veering toward random positions, or flying to (0,0,0).

### Pitfall 2: Missile Fuel + Bullet Time Interaction
**What goes wrong:** Fuel depletes at wall-clock rate instead of sim-time rate. In bullet time (0.2x speed), missiles burn fuel 5x faster relative to the game state. In fast-forward (4x), they barely use fuel.
**Why it happens:** Using `dtSec` instead of `simDt` for fuel decrement.
**How to avoid:** All fuel decrements must use `simDt` (the time-scaled delta), not raw frame time. This matches projectile physics (Pitfall 2 from Phase 3).
**Warning signs:** Missiles dying too fast in bullet time or living too long in fast-forward.

### Pitfall 3: Billboard Z-Fighting with Ray March Background
**What goes wrong:** Billboard quads render behind or flicker against the full-screen ray march quad.
**Why it happens:** The ray march shader draws a full-screen quad at z=0. Billboard quads at world positions need depth testing to render in front.
**How to avoid:** Render billboard explosions in the same depth-tested block as missiles/enemies/projectiles (after `gl.clear(gl.DEPTH_BUFFER_BIT)` and `gl.enable(gl.DEPTH_TEST)`). Use alpha blending (`SRC_ALPHA, ONE`) for additive glow.
**Warning signs:** Explosions invisible or flickering.

### Pitfall 4: Lock-On Detection Missing Enemies at Distance
**What goes wrong:** Crosshair is over an enemy, but lock-on doesn't trigger because screen-space hit area is too small at far zoom.
**Why it happens:** Using fixed pixel radius for lock detection. Enemies shrink on screen at distance.
**How to avoid:** Scale lock detection radius by projected size (same approach as planet hover detection at line 667: `Math.max(baseRadius, 20px min)`). Use a minimum pixel radius (e.g., 20px) to ensure enemies are always lockable.
**Warning signs:** Can't lock enemies when zoomed out.

### Pitfall 5: Trail Buffer Allocation Per Missile
**What goes wrong:** Current missiles.js creates `new Float32Array(MISSILE_TRAIL_LEN*3)` for each missile. With an 18-missile salvo, that's 18 allocations per fire event, plus GC pressure.
**Why it happens:** AoS pattern with per-object allocations.
**How to avoid:** Pre-allocate trail storage as part of the SoA store. Either a large flat buffer indexed by missile slot (like weapons.js shared trail ring buffer), or per-slot pre-allocated arrays in the SoA.
**Warning signs:** GC pauses during salvo fire.

### Pitfall 6: Sprite Sheet UV Calculation Off-By-One
**What goes wrong:** Explosion animation shows edges of adjacent frames bleeding into view.
**Why it happens:** UV coordinates not properly clamped to frame boundaries, or floating-point imprecision at frame edges.
**How to avoid:** Add a small UV inset (0.5 texels) at frame boundaries. Use `floor()` for frame index calculation, not `round()`. Ensure sprite sheet is power-of-2 width if possible.
**Warning signs:** Thin lines of the next frame visible at explosion edges.

### Pitfall 7: Nuclear Missile Using Regular Explosion
**What goes wrong:** Nuclear missile detonates with a sprite explosion instead of the volumetric shader effect, or vice versa.
**Why it happens:** Missile type not checked at detonation time.
**How to avoid:** Check `missile.type[idx]` at proximity trigger: type 0 spawns sprite explosion, type 1 calls `detonateMissile()` into detSlots.
**Warning signs:** All missiles producing the same explosion type.

## Code Examples

### Missile Guidance with Enemy Tracking (adapted from existing PN code)
```javascript
// In updateMissiles(), for each alive missile:
const tIdx = missile.targetIdx[i];
// Pitfall 1: validate target is still alive
if (tIdx < 0 || !enemies.alive[tIdx]) {
  // Target dead -- try retarget or fizzle
  missile.alive[i] = 0;
  continue;
}
// Read LIVE target position (dynamic, not static)
const tgtX = enemies.posX[tIdx];
const tgtZ = enemies.posZ[tIdx];
let dx = tgtX - missile.posX[i];
let dz = tgtZ - missile.posZ[i];
let dist = Math.sqrt(dx * dx + dz * dz);

// Proximity check
if (dist < MISSILE_DET_RADIUS) {
  if (missile.type[i] === 0) {
    spawnSpriteExplosion(missile.posX[i], missile.posZ[i]); // WPN-09
  } else {
    detonateMissileNuke(i); // WPN-10: into detSlots
  }
  removeMissile(i);
  continue;
}

// Fuel system (WPN-07)
if (missile.fuel[i] > 0) {
  missile.fuel[i] -= simDt; // Pitfall 2: use simDt, not dtSec
  // Proportional navigation guidance (existing code pattern)
  // ... (PN acceleration + thrust)
} else {
  // Coast phase: no thrust, no guidance, just gravity
  // WPN-08: check if trajectory will miss target
  const dotToTarget = missile.velX[i] * dx + missile.velZ[i] * dz;
  if (dotToTarget < 0 && missile.age[i] > missile.fuel[i] + COAST_DURATION) {
    // Moving away from target, coast time exceeded -> fizzle
    removeMissile(i);
    continue;
  }
}
```

### Billboard Explosion Vertex Shader (WebGL 1.0)
```glsl
attribute vec3 a_center;   // explosion world position (instanced)
attribute vec2 a_corner;   // quad corner: (-0.5,-0.5), (0.5,-0.5), (0.5,0.5), (-0.5,0.5)
attribute float a_frame;   // current animation frame (instanced)
attribute float a_size;    // explosion size (instanced)
uniform mat4 u_viewProj;
uniform mat4 u_view;
uniform float u_frameCount;
varying vec2 v_uv;

void main() {
  vec3 camRight = vec3(u_view[0][0], u_view[1][0], u_view[2][0]);
  vec3 camUp    = vec3(u_view[0][1], u_view[1][1], u_view[2][1]);

  vec3 worldPos = a_center
    + camRight * a_corner.x * a_size
    + camUp * a_corner.y * a_size;

  gl_Position = u_viewProj * vec4(worldPos, 1.0);

  // UV: horizontal strip sprite sheet, frame 0 at left
  float frameWidth = 1.0 / u_frameCount;
  v_uv = vec2(
    (a_frame + a_corner.x + 0.5) * frameWidth,
    a_corner.y + 0.5
  );
}
```

### Billboard Explosion Fragment Shader
```glsl
precision mediump float;
uniform sampler2D u_spriteSheet;
varying vec2 v_uv;

void main() {
  vec4 texel = texture2D(u_spriteSheet, v_uv);
  if (texel.a < 0.01) discard;
  gl_FragColor = texel;
}
```

### Procedural Sprite Sheet Generation
```javascript
function generateExplosionSheet() {
  const FRAMES = 6, SIZE = 64; // 6 frames, 64x64 each
  const c = document.createElement('canvas');
  c.width = FRAMES * SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');

  for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1);
    const cx = f * SIZE + SIZE / 2;
    const cy = SIZE / 2;
    const r = SIZE * (0.1 + 0.4 * Math.sqrt(t)); // expanding radius
    const alpha = Math.max(0, 1 - t * t); // quadratic fade

    // White-hot flash core (early frames)
    if (t < 0.4) {
      const flashStr = 1 - t / 0.4;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.3);
      g.addColorStop(0, `rgba(255,255,240,${flashStr * alpha})`);
      g.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = g;
      ctx.fillRect(f * SIZE, 0, SIZE, SIZE);
    }

    // Orange/yellow fireball
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,220,100,${alpha * 0.95})`);
    g.addColorStop(0.35, `rgba(255,140,30,${alpha * 0.8})`);
    g.addColorStop(0.65, `rgba(220,70,10,${alpha * 0.5})`);
    g.addColorStop(1, 'rgba(120,30,5,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return c; // Pass to gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
}
```

### Lock-On Detection (screen-space enemy hover)
```javascript
function findLockTarget(mouseX, mouseY, camP, camF, camR, camU, mD) {
  let bestIdx = -1, bestDist = Infinity;
  const LOCK_RADIUS_MIN = 25; // minimum px for lock detection

  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    const dx = enemies.posX[i] - camP[0];
    const dy = enemies.posY[i] - camP[1];
    const dz = enemies.posZ[i] - camP[2];
    const dp = dx * camF[0] + dy * camF[1] + dz * camF[2];
    if (dp <= 0) continue; // behind camera

    const sx = baseWidth * 0.5 + (dx * camR[0] + dy * camR[1] + dz * camR[2]) / dp * 1.8 * mD;
    const sy = baseHeight * 0.5 - (dx * camU[0] + dy * camU[1] + dz * camU[2]) / dp * 1.8 * mD;
    const projRadius = Math.max((enemies.scale[i] / dp) * mD * 1.8, LOCK_RADIUS_MIN);

    const tdx = mouseX - sx, tdy = mouseY - sy;
    const screenDist = tdx * tdx + tdy * tdy;
    if (screenDist < projRadius * projRadius && screenDist < bestDist) {
      bestDist = screenDist;
      bestIdx = i;
    }
  }
  return bestIdx;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AoS missiles[] array | SoA missile store (Phase 4) | This phase | Consistent with combat.js/weapons.js pattern; no per-missile allocations |
| Static target positions | Enemy index tracking | This phase | Missiles track moving targets via enemies SoA |
| Single missile type | Regular + nuclear variants | This phase | Type field determines explosion behavior |
| Volumetric-only explosions | Sprite billboard + volumetric | This phase | Regular missiles get lightweight sprite explosions; nukes keep volumetric |
| Point-and-click targeting | Lock-on with reticle overlay | This phase | Tactical targeting flow replaces ground-click targeting |

**Deprecated/outdated after this phase:**
- `missileTargets[]` (array of `{x, z}` ground positions) -- replaced by enemy lock-on system
- `missileState` state machine ('idle'|'targeting'|'fired'|'cooldown') -- replaced per-weapon-type lock state
- `missiles[]` (array of missile objects) -- replaced by SoA `missile` store
- `missileFireBtn` button -- replaced by integrated weapon fire flow
- Current right-click missile targeting in index.html -- replaced by lock-on detection

## Open Questions

1. **Instanced vs Per-Missile Billboard Explosions**
   - What we know: ANGLE_instanced_arrays works for enemies. Billboard quads need 4 vertices + 6 indices per explosion. With up to ~18 simultaneous explosions, instancing is beneficial.
   - What's unclear: Whether to instance the quad (4 verts shared, instance data for position/frame/size) or batch all explosions into a single vertex buffer.
   - Recommendation: Use instancing. Share a single 4-vertex quad VBO. Per-instance data: center position (3 floats), frame index (1 float), size (1 float). This gives 5 floats per instance, 18 instances max = 360 bytes. Minimal overhead.

2. **Trail Rendering for 18 Missiles**
   - What we know: Current trail is a per-missile ring buffer of 60 points, rendered individually with `gl.drawArrays(gl.POINTS)` per missile.
   - What's unclear: With 18 missiles, 18 individual trail draw calls may be expensive.
   - Recommendation: Use a shared trail ring buffer (like weapons.js TRAIL_MAX_POINTS pattern) for all missile trails combined. Size: 1024 points should suffice for 18 missiles. Single draw call for all trails.

3. **Maximum Simultaneous Sprite Explosions**
   - What we know: An 18-missile salvo could produce up to 18 near-simultaneous explosions if targets are close together.
   - What's unclear: Whether 18 billboard quads with alpha blending causes performance issues.
   - Recommendation: Cap at 24 simultaneous sprite explosions. At 4 vertices each with instancing, this is trivial for the GPU. The real constraint is fill rate from overlapping alpha blending, which at 1-1.5x enemy size is small enough to be fine.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based visual + shader invariant tests (tests.html) |
| Config file | tests.html (regex extraction of shader constants) |
| Quick run command | Open `http://localhost:8000/tests.html` in browser |
| Full suite command | Open tests.html + visual check of index.html in browser |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WPN-05 | Missiles guide toward locked enemy using PN | manual-only | Visual: fire missiles at orbiting enemy, verify curved tracking | N/A |
| WPN-06 | Proximity detonation when near target | manual-only | Visual: missile detonates before hitting enemy, sprite explosion appears | N/A |
| WPN-07 | Fuel depletes during flight | manual-only | Visual: long-range missile trail dims/sputters, engine cuts out | N/A |
| WPN-08 | Self-destruct when fuel exhausted + no intersection | manual-only | Visual: fuel-depleted missile far from target fizzles silently (no explosion) | N/A |
| WPN-09 | Sprite billboard explosions for regular missiles | manual-only | Visual: explosions are flat quads facing camera, not volumetric | N/A |
| WPN-10 | Nuclear missiles produce volumetric detonation | manual-only | Visual: nuke produces expanding fireball/debris using existing shader | N/A |
| VFX-03 | Billboard explosions render at various distances/angles | manual-only | Visual: orbit around explosion, verify it always faces camera | N/A |

### Sampling Rate
- **Per task commit:** Visual check in browser (missiles fire, track, explode correctly)
- **Per wave merge:** Full visual test + tests.html shader invariants
- **Phase gate:** All 7 requirements visually verified + tests.html green

### Wave 0 Gaps
- [ ] `js/scene/explosions.js` -- new file, covers WPN-09 and VFX-03
- [ ] Billboard shader strings in `js/scene/shaders.js` -- new shader program
- [ ] Procedural sprite sheet texture generation -- new at-init code

## Sources

### Primary (HIGH confidence)
- Existing codebase: `js/scene/missiles.js` -- current PN guidance, trail rendering, detonation pipeline
- Existing codebase: `js/scene/weapons.js` -- SoA store pattern, projectile lifecycle, rendering
- Existing codebase: `js/scene/combat.js` -- enemy SoA store, radial bin collision
- Existing codebase: `js/scene/shaders.js` -- ship/enemy/trajectory shader programs
- Existing codebase: `index.html` -- render loop order, detSlots system, input handlers
- [OpenGL Billboard Tutorial](http://www.opengl-tutorial.org/intermediate-tutorials/billboards-particles/billboards/) -- camera right/up extraction from view matrix

### Secondary (MEDIUM confidence)
- [WebGL Billboard Particle Tutorial](https://www.chinedufn.com/webgl-particle-effect-billboard-tutorial/) -- WebGL-specific billboard implementation
- [WebGL Point Sprites Tutorial](https://dev.to/samthor/webgl-point-sprites-a-tutorial-4m6p) -- alternative point-sprite approach
- [Proportional Navigation - Wikipedia](https://en.wikipedia.org/wiki/Proportional_navigation) -- PN algorithm reference
- [GameDev PN Tutorial](https://www.moddb.com/members/blahdy/blogs/gamedev-introduction-to-proportional-navigation-part-i) -- game-specific PN implementation

### Tertiary (LOW confidence)
- None -- all findings verified against existing codebase or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all technologies already in use in the codebase; no new dependencies
- Architecture: HIGH -- SoA pattern, instanced rendering, and GL pass structure all established in phases 1-3
- Pitfalls: HIGH -- derived from direct analysis of existing code patterns and known WebGL 1.0 constraints
- Billboard rendering: MEDIUM -- approach verified against multiple tutorials but not yet implemented in this codebase
- Procedural sprite sheet: MEDIUM -- Canvas 2D to WebGL texture is well-documented but specific visual quality depends on tuning

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (codebase is stable; no external dependency changes expected)
