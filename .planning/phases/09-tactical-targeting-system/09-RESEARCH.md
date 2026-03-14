# Phase 9: Tactical Targeting System - Research

**Researched:** 2026-03-14
**Domain:** DOM overlay UI, input state management, coordinated weapon fire (vanilla JS/WebGL)
**Confidence:** HIGH

## Summary

Phase 9 adds a tactical targeting overlay to the existing combat view. The player presses T to toggle tactical mode, which overlays DOM-based enemy markers, supports click-to-select targeting with weapon assignment, and fires coordinated salvos via right-click. This is purely a DOM overlay + JS state management task -- no new WebGL rendering, no new shaders, no external libraries.

The codebase already has all the building blocks: the lock-on system (`lockState`, `addLockTarget`, `findLockTarget`), the screen projection formula, the off-screen indicator DOM pool pattern, the weapon cooldown tracking (`weaponCooldownEnd[4]`), per-frame HUD update section in the render loop, and the `selectedWeapon` state for weapon switching. The tactical system extends these existing patterns into a multi-weapon, multi-target assignment UI.

**Primary recommendation:** Build tactical mode as a thin state layer (`tacticalMode` boolean + `tacTargets[]` assignment array) that reuses existing screen projection, enemy iteration, and weapon fire patterns. DOM element pooling follows the established `lockReticleDivs[]` and `indicatorEls[]` patterns exactly.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Dedicated T key toggles tactical mode on/off
- Camera stays at same zoom/distance as normal combat -- no zoom change
- Player retains full pan/orbit camera control in tactical mode
- Tactical mode is a DOM overlay on the existing view, not a different camera position
- All enemies get labeled markers showing archetype abbreviation + distance (e.g., [G] 45u)
- Faint orbital range rings around the black hole for spatial reference
- Markers visible for all enemies (on-screen ones positioned over enemy, off-screen ones not directly selectable)
- Click enemy markers to select individual targets
- Shift+click for multi-select (add to selection)
- Click a selected target to deselect it
- Click empty space to deselect all
- Maximum 6-8 selectable targets at once
- Off-screen enemies are NOT directly selectable -- player must pan camera to bring them on-screen first
- Selected targets get bright colored ring (archetype color) plus expanded info tag: type, HP, distance
- Current weapon (selected via 1-4 keys or weapon box clicks) applies to clicked targets
- Mixed salvos supported: select kinetic, click A/B/C -> switch to missiles, click D/E -> fire sends kinetic at A/B/C and missiles at D/E
- Extends Phase 4 lock-on system (lock-on still works in normal combat mode)
- Each assigned target shows weapon abbreviation badge (KIN, PLS, MSL, NUK) color-coded to match weapon box
- Trajectory preview shown for currently highlighted/selected target only (not all at once)
- Right-click fires all assigned weapons as coordinated salvo (consistent with Phase 4)
- Weapon cooldowns apply normally -- targets whose weapon is on cooldown fire when ready (staggered salvo)
- Targets waiting on cooldown show dimmed weapon badge with remaining seconds (e.g., [KIN 2.1s])
- After firing, tactical mode stays active -- assignments clear, player can select new targets
- Press T to exit tactical mode

### Claude's Discretion
- Exact key choice for tactical mode (T suggested, but could be Tab or another key)
- Maximum target count (6 or 8) based on UI space and weapon capacity
- Range ring visual style (number of rings, opacity, color)
- Enemy marker DOM element design and positioning logic
- Transition animation when entering/exiting tactical mode (instant vs fade)
- How the overlay interacts with existing HUD elements (bottom bar stays visible)
- Selection ring size and animation
- How mixed-weapon salvos are sequenced when multiple weapons are ready simultaneously
- Whether kinetic/plasma weapons auto-aim at the assigned target or fire in the target's direction

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HUD-04 | Tactical zoom -- player can zoom out to see entire black hole system with all enemies highlighted | Enemy marker DOM pool + screen projection for all alive enemies; range rings via GL_LINE_LOOP (same pattern as orbit ring). Note: CONTEXT.md clarifies this is NOT a zoom-out -- it's same camera with info overlay |
| HUD-05 | In tactical zoom, player can select targets on the orbital plane and assign weapons | Click-to-select via `findLockTarget()` pattern + `tacTargets[]` assignment state tracking weapon index per target |
| HUD-06 | In tactical zoom, player can preview weapon assignment then issue fire command to launch salvo | Weapon badge display on markers + right-click fires coordinated salvo using existing `fireSelectedWeapon()`/`fireMissileSalvo()` per weapon type, with cooldown staggering |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS | ES6 | All logic | Project convention: no frameworks, no npm |
| WebGL 1.0 | -- | Range ring rendering (GL_LINE_LOOP) | Existing shader/render infrastructure |
| DOM API | -- | Marker overlay, selection UI | Existing HUD pattern (lock reticles, indicators) |
| CSS | -- | Tactical overlay styling | Existing HUD theme conventions |

### Supporting
No external libraries needed. Everything uses existing codebase patterns.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DOM markers | Canvas 2D overlay | DOM is established pattern; canvas overlay adds complexity |
| GL range rings | DOM SVG circles | GL_LINE_LOOP already used for orbit ring; consistent with existing rendering |

## Architecture Patterns

### State Model

The tactical system introduces a small, well-bounded state layer:

```javascript
// Tactical mode state (add to index.html script block)
let tacticalMode = false;
const TAC_MAX_TARGETS = 8;  // Max simultaneous selections

// Tactical assignment: each entry tracks an enemy + assigned weapon
const tacTargets = [];  // [{enemyIdx, weaponIdx}]

// Tactical marker DOM pool (like lockReticleDivs pattern)
const tacMarkerEls = [];  // one per MAX_ENEMIES, reused per frame
```

**Key invariant:** `tacTargets` is independent from `lockState` (missile locks). The tactical system builds its own target list, and on fire, dispatches weapon-appropriate fire calls. The existing `lockState` continues to work in normal combat mode.

### Recommended File Organization

No new JS files needed. Tactical logic integrates into existing files:

```
index.html          -- T key handler, tactical DOM elements, render loop marker update
css/style.css       -- Tactical marker/overlay styles
js/scene/weapons.js -- New fireTacticalSalvo() function
```

**Rationale:** The tactical system is primarily UI state + input handling (index.html concern) with one new fire function (weapons.js concern). Creating a separate `tactical.js` file would require careful script load ordering and global variable sharing -- the existing pattern keeps all mode state in the same scope.

### Pattern 1: DOM Element Pooling (Established)
**What:** Pre-allocate a fixed pool of DOM elements, show/hide and reposition per frame.
**When to use:** For any per-enemy UI element that needs world-to-screen tracking.
**Existing examples:**
```javascript
// Lock reticle pool (from index.html line ~443)
const lockReticleDivs = [];
for (let lr = 0; lr < 6; lr++) {
  const d = document.createElement('div');
  d.className = 'lock-reticle';
  d.innerHTML = '<span class="lock-count"></span>';
  d.style.display = 'none';
  lockReticlesContainer.appendChild(d);
  lockReticleDivs.push(d);
}

// Off-screen indicator pool (from index.html line ~446)
const indicatorEls = [];
for (let ii = 0; ii < MAX_ENEMIES; ii++) {
  const el = document.createElement('div');
  el.className = 'enemy-indicator';
  el.innerHTML = '<div class="indicator-chevron"></div><span class="indicator-dist"></span>';
  el.style.display = 'none';
  document.body.appendChild(el);
  indicatorEls[ii] = el;
}
```

**For tactical markers:** Pool of MAX_ENEMIES (64) marker elements, one per enemy slot. Each marker contains: archetype abbreviation, distance text, selection ring, weapon badge. Show/hide gated on `tacticalMode && enemies.alive[i]`.

### Pattern 2: Screen Projection (Established)
**What:** Project 3D enemy position to screen coordinates for DOM element positioning.
**Formula (used everywhere in codebase):**
```javascript
// Camera vectors from WASM memory
const _camP = [dv.getFloat32(0x030,true), dv.getFloat32(0x034,true), dv.getFloat32(0x038,true)];
const _camF = [dv.getFloat32(0x03C,true), dv.getFloat32(0x040,true), dv.getFloat32(0x044,true)];
const _camR = [dv.getFloat32(0x048,true), dv.getFloat32(0x04C,true), dv.getFloat32(0x050,true)];
const _camU = [dv.getFloat32(0x054,true), dv.getFloat32(0x058,true), dv.getFloat32(0x05C,true)];
const mD = Math.min(baseWidth, baseHeight);

// For each enemy:
const dx = enemies.posX[i] - _camP[0];
const dy = (enemies.posY[i] || 0) - _camP[1];
const dz = enemies.posZ[i] - _camP[2];
const dp = dx * _camF[0] + dy * _camF[1] + dz * _camF[2]; // depth
if (dp <= 0) { /* behind camera */ }
const sx = baseWidth * 0.5 + (dx * _camR[0] + dy * _camR[1] + dz * _camR[2]) / dp * 1.8 * mD;
const sy = baseHeight * 0.5 - (dx * _camU[0] + dy * _camU[1] + dz * _camU[2]) / dp * 1.8 * mD;
```

### Pattern 3: Input Mode Layering (Established)
**What:** Mode-gated input handling in the keydown/click handlers.
**Existing pattern:**
```javascript
// From index.html keydown handler
if (flyMode) {
  if (e.key === 'f' || e.key === 'F') { combatMode = !combatMode; }
  if (combatMode) {
    if (e.key === '1') selectedWeapon = 0;
    // ...
  }
}
```

**For tactical mode:** Add `tacticalMode` check layered on top of `flyMode`:
```javascript
if (flyMode) {
  if (e.key === 't' || e.key === 'T') { toggleTacticalMode(); }
  // ...
}
```

Click handler must differentiate: in tactical mode, clicks target-select rather than fire weapons or navigate.

### Pattern 4: Range Ring Rendering (Extends Orbit Ring)
**What:** Faint concentric rings at fixed orbital radii for spatial reference.
**Existing orbit ring pattern (from render loop):**
```javascript
// Orbit ring as GL_LINE_LOOP using trajectory shader
gl.useProgram(trajPg);
gl.uniformMatrix4fv(trajLocs.uMvp, false, vpMat);
gl.uniform4f(trajLocs.uColor, r, g, b, alpha);
gl.uniform1f(trajLocs.uPtSize, 1.0);
// Fill buffer with circle vertices, draw as LINE_LOOP
```

**For range rings:** Draw 3-5 GL_LINE_LOOP circles at fixed radii (e.g., 40, 60, 80, 100, 120 units) when `tacticalMode` is active. Very faint alpha (0.08-0.12) so they don't compete with combat visuals.

### Anti-Patterns to Avoid
- **Creating a separate "tactical camera":** CONTEXT.md explicitly says same camera position. Do NOT modify `navCamDist` or `navCamEl`.
- **Replacing lockState:** The tactical system is separate from missile lock-on. Both should work independently in their respective modes.
- **Iterating enemies twice per frame:** Combine marker positioning with the existing enemy indicator update loop, or replace it in tactical mode (indicators become redundant since markers show all enemies).
- **Heavy per-frame DOM manipulation:** Use `style.display = 'none'` / `'block'` toggling and `style.transform` for positioning (GPU-composited, no layout thrash). Avoid `innerHTML` changes per frame.
- **Firing kinetic/plasma AT a target position:** These weapons fire in the aim direction from the ship. For tactical fire, the ship should auto-aim toward the target before firing (set `aimDir` toward target).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Screen projection | Custom matrix math | Existing `sx/sy` formula from WASM cam vectors | Used in 5+ places already, tested |
| Enemy detection under mouse | New raycasting | `findLockTarget()` from missiles.js | Already handles screen-space hit detection with projected sizes |
| DOM element pooling | Dynamic createElement/remove | Pre-allocated pool pattern (lockReticleDivs) | Avoids GC pressure during combat |
| Weapon cooldown tracking | New timer system | `weaponCooldownEnd[4]` array | Already tracks all 4 weapon cooldowns |
| Trajectory simulation | New physics | `simulateTrajectory()` from nav.js | Handles gravity-curved paths correctly |
| Archetype colors | New color table | `ARCHETYPE_COLORS[]` from combat.js | Already maps type index to RGBA |
| Archetype type names | New lookup | `ETYPE` enum + abbreviation map | G/S/B/N/C from CONTEXT.md |

## Common Pitfalls

### Pitfall 1: Click Event Conflicts with Drag
**What goes wrong:** Click handler fires even after dragging the camera, causing accidental target selection.
**Why it happens:** Mouse click event fires on mouseup regardless of prior drag.
**How to avoid:** The codebase already solves this with the `dD` (drag-detected) flag. Tactical click handling MUST check `!dD` before processing, exactly like existing combat click handling (index.html line ~764).
**Warning signs:** Targets get selected/deselected when rotating camera.

### Pitfall 2: Right-Click Default Behavior
**What goes wrong:** Right-click opens context menu instead of firing salvo.
**Why it happens:** Browser default contextmenu behavior.
**How to avoid:** Already handled: `canvas.addEventListener('contextmenu', e => { if (flyMode) e.preventDefault(); })`. Tactical right-click fire hooks into the existing right-click mousedown handler.
**Warning signs:** Browser context menu appears when trying to fire.

### Pitfall 3: Stale Target References
**What goes wrong:** Tactical assignment references a dead enemy; firing at a killed target crashes or wastes ammo.
**Why it happens:** Enemy dies between assignment and fire command.
**How to avoid:** Validate `enemies.alive[enemyIdx]` at fire time. Remove dead enemies from `tacTargets` during per-frame update (same pattern as missile target validation in `updateMissiles()`).
**Warning signs:** Missiles spawning with invalid targetIdx, or weapons firing at origin (position 0,0,0).

### Pitfall 4: Mixed Salvo Fire Sequencing
**What goes wrong:** All weapons fire simultaneously, but kinetic/plasma have different fire mechanics than missiles.
**Why it happens:** Kinetic fires bursts, plasma fires single bolts, missiles fire guided salvos -- different code paths.
**How to avoid:** Process `tacTargets` by weapon type: collect all kinetic targets, fire bursts at each (setting `aimDir` per target); collect plasma targets, fire at each; collect missile targets, feed into missile lock system then fire salvo.
**Warning signs:** Kinetic rounds flying in wrong direction, plasma bolts aimed incorrectly.

### Pitfall 5: Aim Direction for Non-Guided Weapons
**What goes wrong:** Kinetic and plasma fire toward the mouse cursor, not toward the tactical target.
**Why it happens:** `aimDir` is computed from mouse position, not from target position.
**How to avoid:** When firing tactical salvo, temporarily override `aimDir` to point from ship toward each target's position. Restore after firing sequence.
**Warning signs:** Kinetic bursts and plasma bolts missing their assigned targets.

### Pitfall 6: Mode Interaction Confusion
**What goes wrong:** Player toggles tactical mode while in missile lock mode, causing dual targeting state.
**Why it happens:** `combatMode` and `tacticalMode` are separate booleans with overlapping click behaviors.
**How to avoid:** Tactical mode should override combat mode's click behavior. When tactical mode is active, clicks select targets (not fire weapons or add missile locks). Combat mode can remain active (weapons still selected via 1-4), but click behavior changes. Clear `lockState` on entering tactical mode if any missile locks exist.
**Warning signs:** Both lock reticles AND tactical markers visible simultaneously on same enemy.

### Pitfall 7: DOM Pool Size Mismatch
**What goes wrong:** More enemies alive than marker elements in the pool.
**Why it happens:** Pool too small for MAX_ENEMIES (64).
**How to avoid:** Pool exactly MAX_ENEMIES markers. Each marker corresponds 1:1 with an enemy slot index.
**Warning signs:** Some enemies missing markers, or markers appearing in wrong positions.

## Code Examples

### Tactical Target Data Structure
```javascript
// Tactical assignment entry
// tacTargets: array of { enemyIdx: number, weaponIdx: number }
// weaponIdx: 0=KIN, 1=PLS, 2=MSL, 3=NUK (matches selectedWeapon)
const tacTargets = [];

function addTacTarget(enemyIdx, weaponIdx) {
  if (tacTargets.length >= TAC_MAX_TARGETS) return false;
  // Check if already assigned
  for (let i = 0; i < tacTargets.length; i++) {
    if (tacTargets[i].enemyIdx === enemyIdx) return false; // already targeted
  }
  tacTargets.push({ enemyIdx, weaponIdx });
  return true;
}

function removeTacTarget(enemyIdx) {
  for (let i = tacTargets.length - 1; i >= 0; i--) {
    if (tacTargets[i].enemyIdx === enemyIdx) {
      tacTargets.splice(i, 1);
      return true;
    }
  }
  return false;
}

function clearTacTargets() {
  tacTargets.length = 0;
}
```

### Tactical Marker DOM Structure
```javascript
// Marker HTML structure per enemy
// <div class="tac-marker">
//   <div class="tac-ring"></div>
//   <span class="tac-type">[G]</span>
//   <span class="tac-dist">45u</span>
//   <span class="tac-wpn">[KIN]</span>
//   <div class="tac-info">
//     <span class="tac-hp">HP 80/100</span>
//   </div>
// </div>

const ARCHETYPE_ABBREVS = ['G', 'S', 'B', 'N', 'C']; // Grunt, Swarm, Bomber, sNiper, Capital
const WEAPON_ABBREVS = ['KIN', 'PLS', 'MSL', 'NUK'];

// Create pool
const tacMarkerContainer = document.createElement('div');
tacMarkerContainer.id = 'tac-markers';
tacMarkerContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:25;display:none;';
document.getElementById('hud-overlay').appendChild(tacMarkerContainer);

const tacMarkerEls = [];
for (let i = 0; i < MAX_ENEMIES; i++) {
  const el = document.createElement('div');
  el.className = 'tac-marker';
  el.innerHTML = '<div class="tac-ring"></div><span class="tac-type"></span><span class="tac-dist"></span><span class="tac-wpn"></span><div class="tac-info"><span class="tac-hp"></span></div>';
  el.style.display = 'none';
  // Enable pointer events on markers for click targeting
  el.style.pointerEvents = 'auto';
  el.dataset.enemyIdx = i;
  tacMarkerContainer.appendChild(el);
  tacMarkerEls[i] = el;
}
```

### Per-Frame Marker Update
```javascript
// Inside render loop, after camera vector extraction
if (tacticalMode && playerState.alive) {
  tacMarkerContainer.style.display = 'block';
  const mD = Math.min(baseWidth, baseHeight);
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) { tacMarkerEls[i].style.display = 'none'; continue; }

    // Screen projection (same formula as lock reticles)
    const dx = enemies.posX[i] - _camP[0];
    const dy = (enemies.posY[i] || 0) - _camP[1];
    const dz = enemies.posZ[i] - _camP[2];
    const dp = dx * _camF[0] + dy * _camF[1] + dz * _camF[2];

    if (dp <= 0) { tacMarkerEls[i].style.display = 'none'; continue; }

    const sx = baseWidth * 0.5 + (dx * _camR[0] + dy * _camR[1] + dz * _camR[2]) / dp * 1.8 * mD;
    const sy = baseHeight * 0.5 - (dx * _camU[0] + dy * _camU[1] + dz * _camU[2]) / dp * 1.8 * mD;

    // Off-screen check: show marker but mark as off-screen (no pointer events)
    const onScreen = sx >= 0 && sx <= baseWidth && sy >= 0 && sy <= baseHeight;

    // Position marker
    tacMarkerEls[i].style.display = 'block';
    tacMarkerEls[i].style.transform = 'translate(' + (sx - 20) + 'px, ' + (sy - 20) + 'px)';
    tacMarkerEls[i].style.pointerEvents = onScreen ? 'auto' : 'none';

    // Update content
    const eType = enemies.type[i];
    const dist = Math.sqrt(
      (enemies.posX[i] - flyPos[0]) ** 2 + (enemies.posZ[i] - flyPos[2]) ** 2
    );
    tacMarkerEls[i].querySelector('.tac-type').textContent = '[' + ARCHETYPE_ABBREVS[eType] + ']';
    tacMarkerEls[i].querySelector('.tac-dist').textContent = Math.floor(dist) + 'u';

    // Selection state
    const tacEntry = tacTargets.find(t => t.enemyIdx === i);
    if (tacEntry) {
      tacMarkerEls[i].classList.add('selected');
      tacMarkerEls[i].querySelector('.tac-wpn').textContent = '[' + WEAPON_ABBREVS[tacEntry.weaponIdx] + ']';
      tacMarkerEls[i].querySelector('.tac-hp').textContent = 'HP ' + Math.ceil(enemies.hp[i]) + '/' + ARCHETYPE_HP[eType];
      tacMarkerEls[i].querySelector('.tac-info').style.display = 'block';
    } else {
      tacMarkerEls[i].classList.remove('selected');
      tacMarkerEls[i].querySelector('.tac-wpn').textContent = '';
      tacMarkerEls[i].querySelector('.tac-info').style.display = 'none';
    }
  }
} else {
  tacMarkerContainer.style.display = 'none';
}
```

### Tactical Salvo Fire
```javascript
function fireTacticalSalvo(simTime) {
  if (tacTargets.length === 0) return;

  // Group targets by weapon type
  const groups = [[], [], [], []]; // [kinetic[], plasma[], missile[], nuke[]]
  for (const t of tacTargets) {
    if (!enemies.alive[t.enemyIdx]) continue;
    groups[t.weaponIdx].push(t.enemyIdx);
  }

  // Fire kinetic at each target: override aimDir, fire burst
  for (const enemyIdx of groups[0]) {
    if (simTime < weaponCooldownEnd[0]) break; // cooldown check
    const dx = enemies.posX[enemyIdx] - flyPos[0];
    const dz = enemies.posZ[enemyIdx] - flyPos[2];
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.01) {
      aimDir = [dx / len, 0, dz / len];
      fireKineticBurst(simTime);
    }
  }

  // Fire plasma at each target: override aimDir, fire bolt
  for (const enemyIdx of groups[1]) {
    if (simTime < weaponCooldownEnd[1]) break;
    const dx = enemies.posX[enemyIdx] - flyPos[0];
    const dz = enemies.posZ[enemyIdx] - flyPos[2];
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.01) {
      aimDir = [dx / len, 0, dz / len];
      firePlasma(simTime);
    }
  }

  // Fire missiles: set up lockState from tactical assignments, then fire
  if (groups[2].length > 0 || groups[3].length > 0) {
    // Save/restore lock state
    const savedLocks = [...lockState.targets];
    clearLocks();
    for (const enemyIdx of groups[2]) {
      selectedWeapon = 2;
      updateLockLimits();
      addLockTarget(enemyIdx);
    }
    if (getLockCount() > 0) {
      selectedWeapon = 2;
      fireMissileSalvo(simTime);
    }
    clearLocks();
    for (const enemyIdx of groups[3]) {
      selectedWeapon = 3;
      updateLockLimits();
      addLockTarget(enemyIdx);
    }
    if (getLockCount() > 0) {
      selectedWeapon = 3;
      fireMissileSalvo(simTime);
    }
    // Restore
    lockState.targets.length = 0;
    lockState.targets.push(...savedLocks);
  }

  // Clear tactical assignments after firing
  clearTacTargets();
}
```

### Range Ring Rendering
```javascript
// In render loop, after orbit ring drawing, when tacticalMode is active
if (tacticalMode) {
  gl.useProgram(trajPg);
  gl.uniformMatrix4fv(trajLocs.uMvp, false, vpMat);
  gl.bindBuffer(gl.ARRAY_BUFFER, projGlBuf);
  gl.enableVertexAttribArray(trajLocs.aPos);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const RING_RADII = [40, 60, 80, 100, 120]; // in nav-mode doubled units
  const RING_SEGMENTS = 64;
  const ringBuf = new Float32Array(RING_SEGMENTS * 3);

  for (const radius of RING_RADII) {
    for (let s = 0; s < RING_SEGMENTS; s++) {
      const angle = (s / RING_SEGMENTS) * Math.PI * 2;
      ringBuf[s * 3]     = radius * Math.cos(angle);
      ringBuf[s * 3 + 1] = 0;
      ringBuf[s * 3 + 2] = radius * Math.sin(angle);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, ringBuf);
    gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(trajLocs.uColor, 0.235, 0.549, 1.0, 0.1); // faint blue
    gl.uniform1f(trajLocs.uPtSize, 1.0);
    gl.drawArrays(gl.LINE_LOOP, 0, RING_SEGMENTS);
  }

  gl.disableVertexAttribArray(trajLocs.aPos);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single weapon fire (click = fire) | Lock-on targeting (click = lock, right-click = fire) | Phase 4 | Tactical extends this: click = assign, right-click = fire salvo |
| Per-weapon fire only | Mixed weapon salvos | Phase 9 (this phase) | New tactical state tracks weapon type per target |
| Off-screen indicators only | Full enemy markers with type/distance | Phase 9 (this phase) | Tactical overlay provides battlefield awareness |

**Existing assets that tactical mode extends:**
- `lockState` / `addLockTarget()` / `fireMissileSalvo()` -- missile targeting pipeline
- `findLockTarget()` -- screen-space enemy detection (works for any weapon)
- `lockReticleDivs[]` -- DOM pool pattern to copy
- `indicatorEls[]` / `updateEnemyIndicators()` -- per-enemy DOM positioning
- `weaponCooldownEnd[4]` -- per-weapon cooldown tracking
- `selectedWeapon` -- current weapon index for assignment
- Orbit ring GL_LINE_LOOP -- pattern for range rings
- `simulateTrajectory()` -- trajectory preview for selected target

## Key Data References

### Enemy Archetype Mapping
| ETYPE | Name | Abbrev | Color (RGBA) | HP |
|-------|------|--------|-------------|-----|
| 0 | Grunt | G | (255,80,60) red | 100 |
| 1 | Swarm | S | (255,200,40) amber | 30 |
| 2 | Bomber | B | (180,50,217) purple | 200 |
| 3 | Sniper | N | (0,210,210) cyan | 60 |
| 4 | Capital | C | (230,230,242) white | 800 |

### Weapon Mapping
| Index | Name | Abbrev | Cooldown | Fire Mechanic |
|-------|------|--------|----------|---------------|
| 0 | Kinetic | KIN | 1.0s | Burst (5 rounds, aim-direction) |
| 1 | Plasma | PLS | 2.5s | Single bolt (aim-direction) |
| 2 | Regular Missile | MSL | 3.0s | Guided (lock-on targeting) |
| 3 | Nuclear Missile | NUK | 8.0s | Guided (lock-on targeting) |

### CSS Z-Index Layers (must respect)
| Element | Z-Index |
|---------|---------|
| Canvas (WebGL) | 1 |
| HUD overlay | 10 |
| Planet labels, indicators, lock reticles | 25 |
| Bottom bar (combat-hud-bar) | 26 |
| Wave announcement | 28 |
| Tactical markers (new) | 25 (same as indicators -- replaces them in tac mode) |

## Open Questions

1. **Kinetic/Plasma auto-aim accuracy**
   - What we know: Kinetic and plasma fire based on `aimDir` (ship-to-cursor direction). For tactical fire, we need to aim at a target position.
   - What's unclear: Should the aim be perfectly accurate (point directly at target) or use the prediction system from `enemyFireAt()` (lead prediction)?
   - Recommendation: Use direct aim at current enemy position. Kinetic rounds curve with gravity, so direct aim at current position provides natural inaccuracy at range. This is simpler and more consistent with the "fire command" feel of tactical mode.

2. **Cooldown staggering UX**
   - What we know: Multiple kinetic targets in a salvo would each need a separate burst, but kinetic cooldown is 1.0s between bursts. Multiple targets means sequential bursts.
   - What's unclear: Should the system fire at the first target immediately and queue the rest, or refuse to fire until all weapons are ready?
   - Recommendation: Fire what's ready immediately, queue the rest. Show dimmed badges with countdown timers on queued targets. This creates interesting tactical decisions (fire now with partial salvo vs wait for full readiness).

3. **Trajectory preview for non-guided weapons**
   - What we know: CONTEXT.md says "trajectory preview shown for currently highlighted/selected target only."
   - What's unclear: For kinetic, the trajectory depends on aim direction. When a target is selected, should we show the gravity-curved path from ship to target?
   - Recommendation: Show `simulateTrajectory()` result from ship position with velocity aimed at the target. This reuses existing infrastructure and gives the player useful feedback about gravity effects on the shot.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based visual testing (tests.html) |
| Config file | tests.html |
| Quick run command | `Open http://localhost:8000/tests.html` |
| Full suite command | `Open http://localhost:8000 -- visual check` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HUD-04 | Tactical overlay shows all enemies with markers | manual | Visual: press T in combat, verify markers on all enemies | N/A manual |
| HUD-05 | Click selects targets, shift+click multi-select, weapon assignment | manual | Visual: click targets, verify selection ring + weapon badge | N/A manual |
| HUD-06 | Right-click fires coordinated salvo, cooldown display | manual | Visual: assign targets, right-click, verify weapons fire at assigned targets | N/A manual |

### Sampling Rate
- **Per task commit:** Visual inspection in browser
- **Per wave merge:** Full gameplay test (enter nav, reach combat, toggle tactical, assign/fire)
- **Phase gate:** All 3 HUD requirements verified via gameplay test

### Wave 0 Gaps
- No automated test infrastructure needed (visual UI testing domain)
- Existing `tests.html` validates shader invariants, which this phase does not modify

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `js/scene/weapons.js`, `js/scene/missiles.js`, `js/scene/combat.js`, `js/scene/nav.js`
- Codebase inspection: `index.html` (input handlers lines 718-960, render loop lines 1090-1830)
- Codebase inspection: `css/style.css` (lock reticle styles, indicator styles, combat HUD bar)
- Phase context: `.planning/phases/09-tactical-targeting-system/09-CONTEXT.md`

### Secondary (MEDIUM confidence)
- Project memory: `.claude/projects/.../memory/MEMORY.md` (planet data, architecture patterns)
- Project decisions: `.planning/STATE.md` (all accumulated decisions from phases 1-8)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Pure vanilla JS/CSS/DOM, no external dependencies to verify
- Architecture: HIGH - All patterns directly observed in existing codebase, no novel techniques
- Pitfalls: HIGH - Based on documented pitfalls from phases 3-4 (aim direction, drag conflicts, stale refs)
- Code examples: MEDIUM - Examples are derived from existing patterns but untested; exact implementation details may need adjustment

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable domain -- vanilla JS patterns don't change)
