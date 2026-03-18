# Phase 11: Simulation Rescaling & Viewport Cleanup - Research

**Researched:** 2026-03-17
**Domain:** WebGL viewport cleanup, combat mode simplification, enemy LOD, BH close-up rendering
**Confidence:** HIGH

## Summary

Phase 11 has four distinct work areas: (1) combat mode simplification (removing the F key toggle, making combat always-on in nav mode), (2) viewport purification (removing orbit rings, Lagrange markers, transfer crosshairs, and tactical range rings from the 3D viewport), (3) BH close-up rendering improvements (distance-adaptive shader parameters), and (4) enemy LOD system (full geometry / billboard / skip transitions at km-scale distances).

All four areas are well-understood from codebase analysis. The codebase already has all the GL infrastructure needed -- the trajectory shader (`trajVS`/`trajFS`) is used for all the navigation overlays that must be removed, the billboard explosion shader provides an instancing pattern for billboard enemies, and the enemy instanced renderer already has camera-relative position computation. The shader already has `u_orbitScale` and `u_camDist` uniforms that enable distance-adaptive behavior.

**Primary recommendation:** Sequence the work as mode simplification first (smallest scope, touches foundational `combatMode` state), then viewport cleanup (removal-only, low risk), then altitude HUD formatting (small HUD change), then enemy LOD (most complex, needs new typed arrays and rendering path), then BH close-up tuning (shader-only, requires visual iteration).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Backtick enters nav mode with combat immediately active -- no separate F key toggle needed
- F key removed entirely -- combat is always on in nav mode
- HUD shows unified controls list combining nav + combat keys; remove "F -- COMBAT MODE" line
- After death/restart, player auto-restarts into nav+combat mode -- no need to press backtick again, seamless restart loop
- `combatMode` boolean effectively always true during nav mode; remove or hardwire
- **Remove from 3D viewport:** tactical range rings, Lagrange point GL markers and HTML labels, transfer orbit ring, transfer crosshair
- **Keep in 3D viewport:** weapon trajectory preview, all enemy rendering/projectiles/explosions, player ship, planet rendering
- Distance-adaptive shader parameters for BH close-up; must maintain 30fps floor; must not regress BH appearance at far distances
- Three LOD levels: full geometry, billboard (colored dots/diamonds), skip (not rendered)
- Billboard representation: GL_POINTS or small diamonds, colored by archetype type
- Billboard dots sized proportionally to archetype (Capitals = large, Grunts = small)
- Hard cut transitions between LOD levels -- no cross-fade or alpha blending

### Claude's Discretion
- BH close-up visual approach (accretion disk emphasis, photon ring sharpening, glow parameters)
- Exact LOD distance thresholds (likely full geometry <10,000 km, billboard <50,000 km, skip beyond)
- Billboard dot exact colors per archetype
- How to handle the transition from `combatMode` boolean -- remove vs hardwire
- Altitude HUD formatting details (km display precision, warning thresholds)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIEW-01 | Player is always in combat mode -- no separate nav/combat mode toggle | Mode simplification: hardwire `combatMode=true`, remove F key handler, update `enterNavMode()` and `resetCombat()` to auto-enable combat |
| VIEW-02 | Main 3D viewport is pure combat with no navigation overlays | Viewport cleanup: remove tactical range rings (lines 1840-1859), orbit ring (1693-1707), L-point markers (1720-1763), transfer crosshair (1708-1718) |
| VIEW-03 | Orbital height displayed in HUD with up/down controls for altitude adjustment | Already partially implemented (`flyHudAltEl`, `altValEl`); needs km formatting and display cleanup |
| REND-01 | Black hole dominates the viewport with rendering tuned for close-up detail | Shader `u_orbitScale` already gates distance-adaptive parameters; add finer distance-based tuning via new uniform or `u_camDist` |
| REND-04 | Enemy LOD thresholds recalibrated for km-scale distances | New LOD system in `updateInstanceBuffer()`: distance check per enemy, split into full-geometry vs billboard vs skip |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WebGL 1.0 | N/A | All rendering | Project constraint -- no build tools, pure JS |
| ANGLE_instanced_arrays | N/A | Instanced enemy rendering | Already used for enemies; billboard LOD will reuse same extension |
| GL_POINTS | N/A | Billboard enemy rendering | Simplest billboard approach; already used for projectiles, L-point markers |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| EXT_frag_depth | N/A | Log depth buffer | Already integrated; billboard enemies need it for correct depth sorting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GL_POINTS for billboard enemies | Instanced quads (billboardVS pattern) | More complex but allows texture; GL_POINTS is simpler and sufficient for colored dots |
| New shader for billboard enemies | Reuse trajVS/trajFS | trajVS/trajFS already handles GL_POINTS with color and size uniforms -- perfect fit |

## Architecture Patterns

### Recommended Approach: Mode Simplification

**What:** Hardwire `combatMode = true` at the start of `enterNavMode()` and after `resetCombat()`. Remove the F key handler entirely. Remove the `combatMode` toggle in the HUD mode button.

**Pattern:** Rather than deleting all `combatMode` checks (which are numerous), hardwire it to `true` so all conditional branches using `if (combatMode)` execute correctly. Then remove the F key toggle and the HUD button toggle that set it to false. The death sequence currently sets `combatMode = false` at line 977 -- this must be changed to keep it true.

**Key code sites (20 references to `combatMode` in index.html):**
1. `weapons.js:21` -- declaration: `let combatMode = false;` -> hardwire to `true`
2. `index.html:251` -- HUD mode toggle click: remove `combatMode=!combatMode`
3. `index.html:977` -- death handler: remove `combatMode=false`
4. `index.html:994` -- backtick exit: remove `combatMode=false`
5. `index.html:1002-1020` -- F key handler: remove entire block
6. `index.html:1021` -- `if(combatMode)` weapon select: remove condition (always true)
7. `nav.js:651` -- `resetCombat()`: remove `combatMode = false`
8. `weapons.js:243` -- `computeWeaponPreview()`: remove `if (!combatMode)` gate

**Restart seamlessness:** `resetCombat()` in `nav.js:651` currently sets `combatMode = false`. Remove this line. The game-over handler (index.html:966-987) calls `resetCombat()` on R key press -- after fix, player stays in combat mode automatically.

### Recommended Approach: Viewport Cleanup

**What:** Remove all navigation overlay rendering from the 3D viewport. This is purely subtractive -- delete rendering code, disable related state.

**Rendering blocks to remove (all in index.html render loop):**
1. **Transfer orbit ring** (lines 1680-1718): Ring buffer + crosshair rendering around target body during transfers
2. **Lagrange point markers** (lines 1720-1763): GL point markers + HTML label positioning
3. **Tactical range rings** (lines 1840-1859): Four concentric rings at abstract radii 30/50/70/90

**State to disable:**
- `lagrangeVisible` (line 258): Set to always `false`, disable L key handler (line 1033-1036)
- `_tacRingRadii` array (line 751): Can remove
- L-point HTML divs (lines 86-97): Hide with `display:none` or remove from DOM

**Keep intact:** `lPointPositions` array and `computeLagrangePoints()` -- these are still needed for L-point orbit capture logic (`checkSOICapture` uses `getLPointPositionKm`). Only the rendering is removed.

### Recommended Approach: Altitude HUD in km

**What:** Format altitude display in km with appropriate precision and units.

**Current code (index.html:1897-1912):**
- Orbiting: shows `orbitAltitude.toFixed(1)` with body name -- needs "km" suffix
- Transfer: shows `targetOrbitAlt.toFixed(1)` -- needs "km" suffix
- Free: shows `'FREE'` -- could show distance to BH in km
- Bottom bar orbit info (lines 1907-1915): Shows altitude with `u` suffix -- change to `km`

**Formatting recommendation:**
- Below 1,000 km: show 1 decimal place, e.g., "842.3 km"
- 1,000-99,999 km: show integer, e.g., "12,450 km" (use locale formatting or manual comma insertion)
- Above 100,000 km: show integer, e.g., "113,176 km"
- Warning threshold: altitude < body radius (already implemented with `.warning` class)

### Recommended Approach: Enemy LOD System

**What:** Three-tier LOD: full geometry (instanced mesh), billboard (GL_POINTS), skip (not rendered). Distance-based with hard cuts.

**Architecture:**
```
updateInstanceBuffer() modifications:
  For each alive enemy:
    1. Compute distance from camera: sqrt((posX-camX)^2 + (posZ-camZ)^2)
    2. If dist < LOD_FULL_THRESHOLD:  pack into instanceData (existing path)
    3. If dist < LOD_BILLBOARD_THRESHOLD: pack into billboardData (new buffer)
    4. Else: skip (not rendered)
```

**New data structures:**
```javascript
// LOD thresholds (km)
const LOD_FULL_GEO_DIST = 10000;      // Full mesh below 10,000 km
const LOD_BILLBOARD_DIST = 50000;       // Billboard dots 10,000-50,000 km
// Beyond 50,000 km: skip (not rendered)

// Billboard data buffer: per-enemy [posX, posY, posZ, colorR, colorG, colorB, pointSize]
const BILLBOARD_FLOATS = 7;
const billboardData = new Float32Array(MAX_ENEMIES * BILLBOARD_FLOATS);

// Billboard point sizes by archetype (screen pixels)
const BILLBOARD_SIZES = [3.0, 2.5, 4.0, 3.5, 8.0]; // Grunt, Swarm, Bomber, Sniper, Capital
```

**Rendering path:**
1. Full geometry: existing `drawArraysInstancedANGLE()` call, unchanged
2. Billboard: Use `trajPg` shader (already has `u_trajColor`, `u_trajPtSize`, `a_trajPos`). Pack billboard positions into a buffer, draw as `GL_POINTS`. Need to render per-archetype group for different colors, OR pack color into position buffer and modify shader.

**Simpler billboard approach (recommended):** Render billboard enemies in groups by archetype type, reusing the trajectory shader (`trajPg`). Each group gets a different color and point size. This avoids creating a new shader.

```javascript
// In the render loop, after full-geometry instanced draw:
// For each archetype type with billboard enemies:
//   Set uColor = ARCHETYPE_COLORS[type]
//   Set uPtSize = BILLBOARD_SIZES[type]
//   Upload camera-relative positions
//   drawArrays(gl.POINTS, 0, count)
```

**Integration with existing code:**
- `updateInstanceBuffer()` already iterates all enemies by type. Add distance check to split into full-geo vs billboard buffers.
- Return value gains a `billboardCounts` array parallel to `typeCounts`.
- Rendering loop uses same `trajPg` program already bound for projectile rendering.

### Recommended Approach: BH Close-up Rendering

**What:** Distance-adaptive shader parameters that increase detail when camera is near the BH and preserve current appearance at far distances.

**Current shader distance awareness:**
- `u_camDist` uniform: already passed, used in `fbm()` octave count (`if (i >= 2 && u_camDist < 50.0) break;`)
- `u_orbitScale` uniform: set to `2.0` in flyMode, `1.0` otherwise; gates step cap, escape radius, planet check range
- `escapeR = max(50.0 * u_orbitScale, u_camDist + 20.0)`: adapts to camera distance

**Distance-adaptive parameters to tune (all shader-side):**
1. **FBM octave count:** Currently 4 octaves, drops to 2 at `u_camDist < 50`. For close-up BH, could use all 4 octaves even when close.
2. **Step size cap:** Currently `mix(5.0, 3.0, ...)`. Smaller cap = more detail = slower. For very close camera, reduce cap further.
3. **Accretion disk detail:** `diskShading()` uses warp domain noise. Could increase warp complexity at close range.
4. **Photon ring sharpening:** `(minR - photonR) * 2.0` controls ring width. Sharper at close range = more dramatic.
5. **Glow intensity:** Post-loop bloom amount could increase when close to BH.

**Performance guard:** The shader already has frame budget awareness via the 250-iteration cap. For BH close-up, the iteration count naturally drops (fewer steps needed at close range since the ray starts near the interesting region). The concern is per-step cost from extra FBM octaves.

**Recommended approach:** Use `u_camDist` to drive a `closeupFactor = smoothstep(30.0, 5.0, u_camDist)` in the shader. Apply this factor to:
- FBM octave gate: remove early break when `closeupFactor > 0`
- Disk noise warp: slightly increase warp intensity with `closeupFactor`
- Photon ring: sharpen ring width proportional to `closeupFactor`
- Post-loop glow: boost glow amount proportional to `closeupFactor`

This is all gated behind distance checks, so performance at far distances is unchanged.

**30fps safety:** If frame time exceeds budget, the per-frame quality could be stepped down. However, the nav-mode camera in orbit around a planet is typically far from the BH (minimum ~28,000 km at Venus orbit, which is ~21 abstract units). The BH close-up will only trigger during BH orbit or transfer near BH. With 250 max iterations and the natural early-exit for close-range rays, this should be fine.

### Anti-Patterns to Avoid
- **Deleting `combatMode` variable entirely:** Too many references (20+ sites). Hardwiring to `true` is safer and faster than a search-and-replace refactor.
- **Removing L-point position computation:** Only the rendering is removed. The position arrays are still needed for orbit capture.
- **Billboard rendering with a new shader:** Overkill -- the existing trajectory shader handles GL_POINTS with per-group color/size uniforms.
- **Per-frame distance sort for LOD:** Unnecessary -- hard cuts don't need sorting, and the existing per-type grouping in `updateInstanceBuffer` is sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Billboard facing | Custom billboard rotation | GL_POINTS with gl_PointSize | Points auto-face camera, no billboard matrix needed |
| LOD cross-fade | Alpha blending between LOD levels | Hard cut (user decision) | Simpler, no blend artifacts, explicit user constraint |
| Distance formatting | Manual comma insertion | `toLocaleString()` or `toFixed()` | Browser handles locale-appropriate number formatting |

## Common Pitfalls

### Pitfall 1: Breaking Weapon Preview by Removing combatMode Guard
**What goes wrong:** `computeWeaponPreview()` at `weapons.js:243` checks `if (!combatMode)` and returns early. If `combatMode` is hardwired but this check isn't updated, preview might not work.
**Why it happens:** The guard `if (!combatMode || !aimDir)` will now always pass the combatMode check (good), but verify that all code paths expecting combatMode to be false are handled.
**How to avoid:** After hardwiring, search all `!combatMode` and `else` branches to ensure none have important side effects that are now unreachable.
**Warning signs:** Weapon preview disappears, trajectory lines don't render, tactical markers don't show.

### Pitfall 2: L-point Orbit Capture Breaks After Marker Removal
**What goes wrong:** Removing L-point rendering code also removes the `computeLagrangePoints()` calls that populate `lPointPositions`. Then `getLPointPositionKm()` returns stale/zero positions, and L-point SOI capture fails.
**Why it happens:** L-point position computation is interleaved with rendering in lines 1720-1735.
**How to avoid:** Extract the position computation loop (lines 1724-1735) and move it to the physics update section, NOT the rendering section. The rendering (GL draw calls + HTML labels, lines 1737-1763) can be removed.
**Warning signs:** Player can't capture into L-point orbits; positions read as [0,0,0].

### Pitfall 3: Billboard Enemies Not Depth-Tested Against Full-Geo Enemies
**What goes wrong:** Billboard enemies rendered as GL_POINTS may appear in front of full-geometry enemies if depth testing is not enabled.
**Why it happens:** The trajectory shader rendering sections toggle depth test and blend modes.
**How to avoid:** Ensure `gl.enable(gl.DEPTH_TEST)` is active during billboard enemy rendering. The trajectory shader already has the `gl_FragDepthEXT` log depth output.
**Warning signs:** Distant dots appear in front of nearby 3D enemy meshes.

### Pitfall 4: Altitude Display Shows Abstract Units Instead of km
**What goes wrong:** `orbitAltitude` is already in km (set by nav.js km-scale code), but the display at line 1909 shows `u` suffix and `toFixed(0)`.
**Why it happens:** The suffix text was written before the km conversion was complete.
**How to avoid:** Simply update the suffix from `u` to `km` and adjust formatting precision.
**Warning signs:** HUD shows "3200u" instead of "3,200 km".

### Pitfall 5: Seamless Restart Loop Fails Because enterNavMode Not Re-Called
**What goes wrong:** After death + R restart, `resetCombat()` repositions the ship and clears enemies, but doesn't re-invoke `enterNavMode()`. The planet angular speeds might have drifted, or the HUD controls text might not be refreshed.
**Why it happens:** `resetCombat()` assumes it's called while `flyMode` is still true and the mode is set up. Currently combat mode is reset to false and the player has to press F again.
**How to avoid:** Verify that `resetCombat()` maintains `flyMode = true` and re-enables all combat HUD elements. Add `combatMode = true` at the end if hardwiring approach is used. Verify HUD controls text includes unified nav+combat keys.
**Warning signs:** After restart, tactical markers or weapon select don't work until player presses F.

## Code Examples

### Mode Simplification: Hardwire combatMode
```javascript
// weapons.js line 21: Change from
let combatMode = false;
// To:
let combatMode = true;  // VIEW-01: always combat mode in nav

// nav.js enterNavMode() line ~451: Add after enemies spawn
combatMode = true;
canvas.style.cursor = 'crosshair';
combatIndicatorEl.style.display = 'block';
weaponIndicatorEl.style.display = 'block';
tacMarkerContainer.style.display = 'block';

// nav.js resetCombat() line ~651: Remove
// combatMode = false;  // DELETE THIS LINE
```

### Viewport Cleanup: Remove Tactical Range Rings
```javascript
// index.html lines 1840-1859: DELETE entire block
// Before:
if(combatMode){
  gl.bindBuffer(gl.ARRAY_BUFFER,ringBuf);
  // ... range ring rendering ...
}
// After: block removed entirely
```

### Altitude HUD: km Formatting
```javascript
// Helper function for km display
function fmtKm(val) {
  if (val < 1000) return val.toFixed(1) + ' km';
  return Math.round(val).toLocaleString() + ' km';
}

// index.html line 1899: Change from
altValEl.textContent = orbitAltitude.toFixed(1) + (bodyName ? ' \u00B7 ' + bodyName : '');
// To:
altValEl.textContent = fmtKm(orbitAltitude) + (bodyName ? ' \u00B7 ' + bodyName : '');
```

### Enemy LOD: Distance-Based Split in updateInstanceBuffer
```javascript
// combat.js: Modified updateInstanceBuffer with LOD
const LOD_FULL_DIST = 10000;     // km
const LOD_BILLBOARD_DIST = 50000; // km
const BILLBOARD_SIZES = [3.0, 2.5, 4.0, 3.5, 8.0];
const billboardBuf = new Float32Array(MAX_ENEMIES * 3); // xyz positions only
const _bbTypeCounts = [0, 0, 0, 0, 0];

function updateInstanceBuffer(simTime, camX, camY, camZ) {
  let offset = 0;
  let bbOffset = 0;
  _typeCounts[0] = _typeCounts[1] = _typeCounts[2] = _typeCounts[3] = _typeCounts[4] = 0;
  _bbTypeCounts[0] = _bbTypeCounts[1] = _bbTypeCounts[2] = _bbTypeCounts[3] = _bbTypeCounts[4] = 0;

  for (let t = 0; t < 5; t++) {
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!enemies.alive[i] || enemies.type[i] !== t) continue;
      // CRR distance from camera
      const dx = enemies.posX[i] - camX;
      const dz = enemies.posZ[i] - camZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < LOD_FULL_DIST) {
        // Full geometry: existing path
        const base = offset * ENEMY_INST_FLOATS;
        instanceData[base] = dx;
        instanceData[base + 1] = enemies.posY[i] - camY;
        instanceData[base + 2] = enemies.posZ[i] - camZ;
        // ... rest of existing packing ...
        offset++;
        _typeCounts[t]++;
      } else if (dist < LOD_BILLBOARD_DIST) {
        // Billboard: just pack position (CRR already applied)
        billboardBuf[bbOffset * 3] = dx;
        billboardBuf[bbOffset * 3 + 1] = enemies.posY[i] - camY;
        billboardBuf[bbOffset * 3 + 2] = enemies.posZ[i] - camZ;
        bbOffset++;
        _bbTypeCounts[t]++;
      }
      // else: skip (beyond LOD_BILLBOARD_DIST)
    }
  }
  return { typeCounts: _typeCounts, totalCount: offset,
           bbTypeCounts: _bbTypeCounts, bbTotalCount: bbOffset };
}
```

### BH Close-up: Shader Distance Adaptation
```glsl
// In main() after existing setup, before ray march loop:
float closeupFactor = smoothstep(30.0, 5.0, u_camDist);

// In fbm() -- modify octave gate:
// Replace: if (i >= 2 && u_camDist < 50.0) break;
// With:    if (i >= 2 && u_camDist < 50.0 && closeupFactor < 0.1) break;
// This keeps full octaves when very close to BH

// Photon ring sharpening:
float ringWidth = mix(2.0, 3.5, closeupFactor);  // sharper ring when close
float pTmp1 = (minR - photonR) * ringWidth;

// Post-loop glow boost:
float glowBoost = 1.0 + closeupFactor * 0.5;
bgCol += ringCol * proximity * 0.4 * glowBoost;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `combatMode` toggle with F key | Always-on combat mode | This phase | Simplifies controls, removes mode confusion |
| Nav overlays in 3D viewport | Radar-only nav overlays (Phase 15) | This phase removes; Phase 15 replaces | Clean combat viewport |
| Abstract-unit altitude display | km-formatted altitude | This phase | Consistent with km scale from Phase 10 |
| All enemies at full geometry | 3-tier LOD (full/billboard/skip) | This phase | Enables km-scale distances without visual overload |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based regression tests (tests.html) |
| Config file | tests.html (loads scale.js, regex-parses index.html shaders) |
| Quick run command | Open `http://localhost:8000/tests.html` in browser |
| Full suite command | Same (all tests run on page load) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIEW-01 | Combat always on in nav mode | manual | Visual: enter nav mode, verify crosshair + weapons work without F key | N/A |
| VIEW-02 | No nav overlays in 3D viewport | manual | Visual: enter nav mode, verify no rings/L-points/crosshairs visible | N/A |
| VIEW-03 | Altitude in km with controls | manual | Visual: orbit a planet, check HUD shows "km" suffix, up/down arrows work | N/A |
| REND-01 | BH close-up detail | manual | Visual: orbit BH, verify accretion disk detail increases, no fps drop below 30 | N/A |
| REND-04 | Enemy LOD at km distances | manual | Visual: zoom out from enemies, verify transition to dots then disappear | N/A |

### Sampling Rate
- **Per task commit:** Open `tests.html` (shader invariant regression)
- **Per wave merge:** `tests.html` + visual inspection of all 5 requirement behaviors
- **Phase gate:** All tests green + visual confirmation of all success criteria

### Wave 0 Gaps
- None for automated tests -- existing `tests.html` covers shader invariants
- All phase requirements are visual/behavioral and require manual verification
- Shader changes (REND-01) must pass existing `tests.html` invariant checks (early escape threshold, step cap, planet check range)

## Open Questions

1. **BH close-up visual tuning requires iteration**
   - What we know: The shader parameters that affect appearance are well-identified. The `u_camDist` uniform is already available.
   - What's unclear: Exact parameter values for "dramatic close-up BH" -- need visual iteration in browser.
   - Recommendation: Implement the `closeupFactor` mechanism, then tune values visually. Start conservative (subtle changes) and increase.

2. **LOD distance thresholds need gameplay tuning**
   - What we know: At 10,000 km, a 500m Grunt subtends ~0.003 radians (~0.17 degrees) -- barely visible. At 5,000 km it's ~0.006 radians (~0.34 degrees) -- small but visible.
   - What's unclear: Whether 10,000 km is the right full-geometry cutoff. Capital ships (8 km) are 16x larger and may deserve higher threshold.
   - Recommendation: Use per-archetype LOD thresholds. Capital: 15,000 km full-geo; smaller enemies: 8,000 km full-geo. Billboard out to 50,000 km for all. Tune during implementation.

3. **Billboard enemy color distinctiveness**
   - What we know: `ARCHETYPE_COLORS` already defines distinct colors per type (red, amber, purple, cyan, white).
   - What's unclear: Whether these colors are distinguishable as small dots against the dark space background.
   - Recommendation: Use the existing `ARCHETYPE_COLORS` as-is. If they're too dim as small dots, boost brightness by 1.3x for billboard rendering. This can be tuned visually.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `index.html`, `js/scene/weapons.js`, `js/scene/combat.js`, `js/scene/nav.js`, `js/scene/shaders.js`, `js/scene/orbital.js`, `js/scene/scale.js`
- `.planning/phases/11-simulation-rescaling-viewport-cleanup/11-CONTEXT.md` -- user decisions
- `.planning/phases/10-scale-foundation/10-CONTEXT.md` -- km scale constants
- `.claude/rules/shader-conventions.md` -- shader invariant rules

### Secondary (MEDIUM confidence)
- [WebGL Instanced Drawing Fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-instanced-drawing.html) -- instancing pattern reference
- [GL_POINTS rendering](http://webgl.brown37.net/12_advanced_rendering/07_rendering_points.html) -- point billboard technique

### Tertiary (LOW confidence)
- None -- all findings verified from codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all code is in the existing codebase, no new dependencies
- Architecture: HIGH -- patterns are well-established (instanced rendering, GL_POINTS, shader uniforms)
- Pitfalls: HIGH -- identified from direct code analysis of actual rendering pipeline
- LOD thresholds: MEDIUM -- visual subtend angle math is sound but exact thresholds need gameplay tuning
- BH close-up: MEDIUM -- mechanism is clear but visual parameters need iteration

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable codebase, no external dependencies)
