# Phase 8: Combat HUD - Research

**Researched:** 2026-03-13
**Domain:** DOM-based HUD layout, CSS flexbox, per-frame state binding
**Confidence:** HIGH

## Summary

Phase 8 consolidates all scattered HUD elements into a single unified bottom bar. This is a pure DOM/CSS/JS task -- no WebGL, no shader work, no new libraries. The existing codebase already has all the game state variables needed (weapon cooldowns, wave state, HP, orbit info); this phase simply builds a new DOM structure to display them and rewires the render loop's HUD update section.

The primary challenge is surgical DOM migration: removing or hiding the old scattered HUD elements (fly-hud-speed, fly-hud-altitude, combat-mode-indicator, weapon-indicator, hp-bar-container) and replacing them with a new bottom bar layout, without breaking the render loop update code that references these elements by ID. The safest approach is to keep old DOM element IDs intact but reparent them into the new bar structure, or create new elements and update the JS references.

**Primary recommendation:** Build the bottom bar as a new `<div id="combat-hud-bar">` inside `.hud-overlay`, containing 5 sections (weapons, HP, wave counter, orbit info, mode toggle). Create new DOM elements for the 4 weapon boxes and wire them to existing `weaponCooldownEnd[]`, `selectedWeapon`, and `lockState` variables. Migrate HP bar, altitude, and speed data into the new bar. Update the render loop HUD section (~lines 1627-1712 of index.html) to populate new elements instead of old ones.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single unified bottom bar (~60-70px tall) across the full screen width
- All existing top-area nav HUD elements (speed, altitude, body name) consolidate into the bottom bar -- top of screen becomes completely clear
- FPS counter stays as a small standalone overlay in the top-right corner (not part of the bar)
- Spin/range debug readouts can be dropped from the HUD entirely
- Bottom bar is always visible whenever nav mode is active (both navigation and combat mode) -- no show/hide toggling
- Layout order left-to-right: [weapons] [HP bar] [wave counter] [orbit info] [mode toggle]
- 4 numbered weapon boxes with number key [1]-[4], weapon abbreviation (KIN, PLS, MSL, NUK)
- Cooldown fill bar inside each box -- fills to show ready, empties during cooldown with remaining seconds shown
- Selected weapon has bright blue border highlight
- Missile weapons (slots 3 & 4): box shows current lock count when selected
- Weapon boxes are clickable to select weapons
- Weapons always shown at full brightness regardless of nav/combat mode
- Wave counter format: "WAVE 5 . 12 ENEMIES" -- single line with dot separator
- Positioned in right section of bottom bar
- Enemy count updates live in real-time
- No boss wave styling on counter
- On wave clear: counter jumps immediately to next wave number
- Hull integrity bar stays at bottom center; existing 3-color threshold preserved; HP text displayed
- Orbit info format: "BODY . ALTu . STATE" (ORBITING/TRANSFER)
- During transfer: shows destination body
- Mode toggle text button "NAV" or "COMBAT" at far right edge, clickable, supplements F key

### Claude's Discretion
- Exact styling of weapon boxes (border styles, fill animation, color for cooldown)
- Bottom bar background opacity and styling (semi-transparent dark, solid, blur, etc.)
- Exact font sizes and spacing within the bar sections
- How existing scattered HUD elements are migrated (which DOM elements to repurpose vs recreate)
- HP bar width and proportions within the new bar layout
- Lock count display formatting within missile weapon boxes
- Mode toggle button hover/active states
- Whether clicking a weapon box in nav mode auto-enters combat mode
- Transition animation when entering/leaving nav mode (bar slide-in or instant)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HUD-01 | Weapon status panel showing all 4 weapons with selected weapon highlighted | Weapon boxes with cooldown fill bars; `weaponCooldownEnd[4]`, `selectedWeapon`, `lockState` already available in weapons.js/missiles.js |
| HUD-02 | Wave counter displaying current wave number and enemies remaining | `waveNumber` and `enemyCount` variables already available from waves.js and combat.js |
| HUD-03 | Hull integrity bar displayed prominently | Existing `hp-bar-container` with 3-color threshold; reparent into bottom bar |
| HUD-07 | Orbit info display showing current orbital body, altitude, and transfer status | `orbitState`, `orbitBody`, `orbitAltitude`, `transferTarget` from nav.js; `getTargetName()` helper exists |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla DOM | N/A | HTML elements for HUD | Project is no-framework, pure HTML/CSS/JS |
| CSS Flexbox | N/A | Bottom bar layout | Native browser layout; no external dependencies |
| CSS Custom Properties | N/A | Cooldown fill animation | `--fill` property drives `width` of inner fill bar |

### Supporting
No external libraries. This phase is 100% DOM/CSS/JS.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DOM HUD | Canvas 2D overlay | Would require second canvas, manual text rendering; DOM is simpler for text-heavy HUD |
| CSS fill animation | JS-driven width changes | CSS transitions are smoother but can't track simTime precisely; use direct JS width setting per frame |

## Architecture Patterns

### Recommended DOM Structure
```html
<!-- Inside .hud-overlay, replaces scattered elements -->
<div id="combat-hud-bar" class="combat-hud-bar">
  <!-- Section 1: Weapons (left) -->
  <div class="hud-weapons">
    <div class="weapon-box" data-weapon="0" id="wpn-box-0">
      <span class="wpn-key">1</span>
      <span class="wpn-name">KIN</span>
      <div class="wpn-fill"></div>
      <span class="wpn-cd"></span>
    </div>
    <div class="weapon-box" data-weapon="1" id="wpn-box-1">...</div>
    <div class="weapon-box" data-weapon="2" id="wpn-box-2">...</div>
    <div class="weapon-box" data-weapon="3" id="wpn-box-3">...</div>
  </div>
  <!-- Section 2: HP bar (left-center) -->
  <div class="hud-hp">
    <div class="hud-hp-bar-bg">
      <div class="hud-hp-bar-fill" id="hud-hp-fill"></div>
    </div>
    <span class="hud-hp-text" id="hud-hp-text">250</span>
  </div>
  <!-- Section 3: Wave counter (center-right) -->
  <div class="hud-wave" id="hud-wave">WAVE 1 &middot; 8 ENEMIES</div>
  <!-- Section 4: Orbit info (right) -->
  <div class="hud-orbit" id="hud-orbit">JUPITER &middot; 38u &middot; ORBITING</div>
  <!-- Section 5: Mode toggle (far right) -->
  <button class="hud-mode-toggle" id="hud-mode-toggle">NAV</button>
</div>
```

### Pattern 1: Bottom Bar Flexbox Layout
**What:** Single flex container with `justify-content: space-between` and `align-items: center`, fixed to bottom of screen.
**When to use:** All HUD display in nav mode.
**Example:**
```css
.combat-hud-bar {
  display: none; /* shown via .nav-active */
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 60px;
  z-index: 26; /* above planet labels (25) */
  background: rgba(0, 4, 16, 0.88);
  border-top: 1px solid rgba(60, 140, 255, 0.25);
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 300;
  font-size: 0.85em;
  letter-spacing: 0.12em;
  color: rgba(170, 210, 255, 0.9);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
  pointer-events: auto;
}
.nav-active .combat-hud-bar { display: flex; }
```

### Pattern 2: Weapon Box with Cooldown Fill
**What:** Each weapon is a box with a fill bar that represents cooldown progress. Fill width is computed per frame from `simTime` and `weaponCooldownEnd[i]`.
**When to use:** For all 4 weapon slots.
**Example:**
```javascript
// Per-frame in render loop:
const WPN_CD_DURATIONS = [KINETIC_COOLDOWN, PLASMA_COOLDOWN, MISSILE_COOLDOWN_REGULAR, MISSILE_COOLDOWN_NUKE];
for (let w = 0; w < 4; w++) {
  const cdEnd = weaponCooldownEnd[w];
  const cdRemain = Math.max(0, cdEnd - simTime);
  const fillPct = cdRemain > 0 ? (1 - cdRemain / WPN_CD_DURATIONS[w]) * 100 : 100;
  wpnFillEls[w].style.width = fillPct + '%';
  // Show remaining seconds if on cooldown
  wpnCdEls[w].textContent = cdRemain > 0 ? cdRemain.toFixed(1) : '';
  // Selected highlight
  wpnBoxEls[w].classList.toggle('selected', w === selectedWeapon);
  // Lock count for missile weapons
  if (w >= 2 && w === selectedWeapon) {
    const lc = getLockCount();
    wpnLockEls[w].textContent = lc > 0 ? lc + '/' + lockState.maxTargets + ' LOCKS' : '';
  }
}
```

### Pattern 3: State-Driven Text Updates
**What:** Wave counter and orbit info are simple text elements updated per frame from game state.
**When to use:** Wave count, enemy count, orbit body/altitude/state.
**Example:**
```javascript
// Wave counter
hudWaveEl.textContent = 'WAVE ' + waveNumber + ' \u00B7 ' + enemyCount + ' ENEMIES';

// Orbit info
if (orbitState === ORBIT_STATE.ORBITING) {
  const bodyName = getTargetName(orbitBody).toUpperCase();
  hudOrbitEl.textContent = bodyName + ' \u00B7 ' + orbitAltitude.toFixed(0) + 'u \u00B7 ORBITING';
} else if (orbitState === ORBIT_STATE.TRANSFER) {
  const tgtName = getTargetName(transferTarget).toUpperCase();
  hudOrbitEl.textContent = tgtName + ' \u00B7 ' + targetOrbitAlt.toFixed(0) + 'u \u00B7 TRANSFER';
} else {
  hudOrbitEl.textContent = 'FREE FLIGHT';
}
```

### Anti-Patterns to Avoid
- **Creating DOM elements per frame:** Never use `createElement` or `innerHTML` in the render loop. Create all elements once at startup, update `textContent` and `style` properties per frame.
- **Querying DOM per frame:** Never use `document.getElementById()` or `querySelector()` in the render loop. Cache all element references at initialization.
- **Animating cooldown with CSS transitions:** CSS transitions can't track `simTime` (which runs at variable bullet-time/fast-forward rates). Must set fill `width` directly via JS each frame.
- **Breaking old element references:** Other code (resetCombat, missiles.js) references `hpBarEl`, `hpTextEl`, etc. If replacing these elements, update the references or reuse the same elements.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Flexbox layout | Manual absolute positioning per section | CSS flexbox on the bar container | Handles resize, spacing, alignment automatically |
| Cooldown percentage | Frame counter based timing | `(weaponCooldownEnd[w] - simTime) / cdDuration` | Stays synced with simTime including bullet-time/fast-forward |
| Click-to-select weapon | Custom hit testing | Standard DOM click events on weapon boxes | Boxes are HTML elements with `pointer-events: auto` |

## Common Pitfalls

### Pitfall 1: Bullet-Time/Fast-Forward Cooldown Display
**What goes wrong:** Cooldown fill bar desyncs from actual weapon readiness because it uses `Date.now()` or raw `dt` instead of `simTime`.
**Why it happens:** The game uses scaled sim time (0.03x bullet time, 0.5x fast forward). Cooldowns are stored as `simTime` endpoints.
**How to avoid:** Always compute cooldown fill from `(cdEnd - simTime) / cdDuration`. The `simTime` is the only source of truth.
**Warning signs:** Weapon appears ready on HUD but won't fire, or vice versa.

### Pitfall 2: Stale enemyCount After Wave Clear
**What goes wrong:** Wave counter shows "0 ENEMIES" briefly then jumps to next wave count during the breather period.
**Why it happens:** The `waveState` transitions through BREATHER where `enemyCount === 0` for `BREATHER_DURATION` (4s) before spawning next wave.
**How to avoid:** When `waveState === WAVE_BREATHER`, show the next wave number (waveNumber + 1) and "INCOMING" or similar text instead of "0 ENEMIES".
**Warning signs:** Counter flickers between 0 and new count.

### Pitfall 3: z-index Collision with Existing HUD
**What goes wrong:** Bottom bar appears behind planet labels, lock reticles, or wave announcement.
**Why it happens:** Planet labels are z-index 25, lock reticles z-index 25, wave announcement z-index 28.
**How to avoid:** Bottom bar z-index should be 26 (above planet labels, below wave announcements). Interactive elements (weapon boxes, mode toggle) need `pointer-events: auto` since `.hud-overlay` has `pointer-events: none`.
**Warning signs:** Can't click weapon boxes, bar hidden behind labels.

### Pitfall 4: HP Bar Reference Breakage
**What goes wrong:** `resetCombat()` sets `hpBarEl.style.width` and `hpBarEl.className` but the old element has been removed.
**Why it happens:** Old `hp-bar-container` is removed/hidden but references in index.html (lines 329-330, 1642-1646) and nav.js (lines 615-621) still point to old elements.
**How to avoid:** Either (a) keep old element IDs and reparent them into the bottom bar, or (b) create new elements and update ALL JS references (hpBarEl, hpTextEl in index.html, resetCombat in nav.js).
**Warning signs:** Errors on game restart, HP bar not resetting.

### Pitfall 5: Cooldown Duration Lookup for Fill Calculation
**What goes wrong:** Cooldown fill bar shows wrong progress for missile/nuke weapons.
**Why it happens:** The fill percentage needs the total cooldown duration to compute `(1 - remain/total)`, but the constants are in different files.
**How to avoid:** Use a lookup array: `const WPN_CD_DURATIONS = [KINETIC_COOLDOWN, PLASMA_COOLDOWN, MISSILE_COOLDOWN_REGULAR, MISSILE_COOLDOWN_NUKE]`. Constants are: `KINETIC_COOLDOWN=1.0` (weapons.js), `PLASMA_COOLDOWN=2.5` (weapons.js), `MISSILE_COOLDOWN_REGULAR=3.0` (missiles.js), `MISSILE_COOLDOWN_NUKE=8.0` (missiles.js). All are globals, all accessible from the render loop.
**Warning signs:** Fill bar jumps or shows wrong percentage for missile/nuke weapons.

### Pitfall 6: Bottom Bar Overlaps Game Over Screen
**What goes wrong:** Bottom bar is visible during game over screen.
**Why it happens:** The bar is always shown when `.nav-active` is set, but game over screen overlays on top.
**How to avoid:** Hide the bottom bar during death phase (playerState.deathPhase > 0) or let the game-over-screen (z-index 30) simply cover it. Since game-over-screen has z-index 30 and covers the full viewport, it naturally covers the bar. No special handling needed.
**Warning signs:** HUD visible behind game over text.

### Pitfall 7: Nuke Button and Missile Fire Button Orphaned
**What goes wrong:** Existing `.nuke-btn` and `.missile-fire-btn` are currently placed in `.fly-nav-group` and become orphaned or misplaced.
**Why it happens:** `enterNavMode()` reparents `missileFireBtn` into `flyNavGroup`. With the new bottom bar, these elements need new homes or the code needs updating.
**How to avoid:** The nuke button and missile fire button can stay as they are (separate from the bottom bar) OR be integrated. The weapon boxes replace the old weapon indicator text, but the fire button may still be needed for right-click feedback. Consider keeping these as overlays or removing the missile fire button entirely since weapon boxes + right-click already handle the workflow.
**Warning signs:** Buttons floating at wrong positions, click events not firing.

### Pitfall 8: enterNavMode/exitNavMode classList Drift
**What goes wrong:** Old HUD elements still get `.active` class toggled, causing display glitches.
**Why it happens:** `enterNavMode()` (nav.js lines 411-418) adds `.active` to `flyNavGroup`, `flyHudMode`, `flyCrosshair`, `flyHudSpeed`, `flyHudAltEl`. `exitNavMode()` removes them. If these elements are removed from DOM but references remain, classList operations are no-ops (safe but wasteful). If elements are repurposed, stale class toggling could conflict.
**How to avoid:** When removing old HUD elements, also remove the corresponding classList operations from `enterNavMode()` and `exitNavMode()` in nav.js. Or hide old elements with `display: none !important` via CSS when `.nav-active` is set.
**Warning signs:** Old HUD elements briefly visible, elements appearing in wrong places.

## Code Examples

### Example 1: Bottom Bar HTML Structure
```html
<div id="combat-hud-bar" class="combat-hud-bar">
  <div class="hud-weapons" id="hud-weapons">
    <div class="weapon-box selected" data-weapon="0" id="wpn-box-0">
      <span class="wpn-key">1</span>
      <span class="wpn-name">KIN</span>
      <div class="wpn-fill-bg"><div class="wpn-fill" id="wpn-fill-0"></div></div>
      <span class="wpn-cd" id="wpn-cd-0"></span>
      <span class="wpn-locks" id="wpn-locks-0"></span>
    </div>
    <div class="weapon-box" data-weapon="1" id="wpn-box-1">
      <span class="wpn-key">2</span>
      <span class="wpn-name">PLS</span>
      <div class="wpn-fill-bg"><div class="wpn-fill" id="wpn-fill-1"></div></div>
      <span class="wpn-cd" id="wpn-cd-1"></span>
      <span class="wpn-locks" id="wpn-locks-1"></span>
    </div>
    <div class="weapon-box" data-weapon="2" id="wpn-box-2">
      <span class="wpn-key">3</span>
      <span class="wpn-name">MSL</span>
      <div class="wpn-fill-bg"><div class="wpn-fill" id="wpn-fill-2"></div></div>
      <span class="wpn-cd" id="wpn-cd-2"></span>
      <span class="wpn-locks" id="wpn-locks-2"></span>
    </div>
    <div class="weapon-box" data-weapon="3" id="wpn-box-3">
      <span class="wpn-key">4</span>
      <span class="wpn-name">NUK</span>
      <div class="wpn-fill-bg"><div class="wpn-fill" id="wpn-fill-3"></div></div>
      <span class="wpn-cd" id="wpn-cd-3"></span>
      <span class="wpn-locks" id="wpn-locks-3"></span>
    </div>
  </div>
  <div class="hud-hp" id="hud-hp-section">
    <div class="hud-hp-bar-bg">
      <div class="hud-hp-bar-fill" id="hud-hp-fill"></div>
    </div>
    <span class="hud-hp-text" id="hud-hp-text">250</span>
  </div>
  <div class="hud-wave" id="hud-wave">WAVE 1 &middot; 8 ENEMIES</div>
  <div class="hud-orbit" id="hud-orbit">FREE FLIGHT</div>
  <button class="hud-mode-toggle" id="hud-mode-toggle">NAV</button>
</div>
```

### Example 2: Weapon Box CSS
```css
.weapon-box {
  position: relative;
  width: 56px;
  height: 44px;
  border: 1px solid rgba(60, 140, 255, 0.3);
  border-radius: 3px;
  background: rgba(0, 8, 24, 0.6);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: auto;
  transition: border-color 0.15s;
}
.weapon-box.selected {
  border-color: rgba(60, 140, 255, 0.9);
  box-shadow: 0 0 8px rgba(60, 140, 255, 0.3);
}
.wpn-key {
  font-size: 0.7em;
  color: rgba(60, 140, 255, 0.6);
}
.wpn-name {
  font-size: 0.8em;
  font-weight: 600;
  color: rgba(170, 210, 255, 0.9);
  letter-spacing: 0.1em;
}
.wpn-fill-bg {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 4px;
  background: rgba(60, 140, 255, 0.15);
}
.wpn-fill {
  height: 100%;
  width: 100%;
  background: rgba(60, 140, 255, 0.7);
}
.wpn-cd {
  position: absolute;
  bottom: 6px;
  font-size: 0.65em;
  color: rgba(255, 160, 80, 0.9);
}
```

### Example 3: Per-Frame HUD Update (replaces lines ~1660-1678 in index.html)
```javascript
// --- Bottom bar HUD updates ---
// Weapon boxes
const WPN_CD_DURATIONS = [KINETIC_COOLDOWN, PLASMA_COOLDOWN, MISSILE_COOLDOWN_REGULAR, MISSILE_COOLDOWN_NUKE];
for (let w = 0; w < 4; w++) {
  const cdEnd = weaponCooldownEnd[w];
  const cdRemain = Math.max(0, cdEnd - simTime);
  const fillPct = cdRemain > 0 ? ((1 - cdRemain / WPN_CD_DURATIONS[w]) * 100) : 100;
  wpnFillEls[w].style.width = fillPct.toFixed(1) + '%';
  wpnCdEls[w].textContent = cdRemain > 0 ? cdRemain.toFixed(1) : '';
  wpnBoxEls[w].classList.toggle('selected', w === selectedWeapon);
  // Lock count for missile weapons when selected
  if (w >= 2 && w === selectedWeapon) {
    const lc = getLockCount();
    wpnLockEls[w].textContent = lc > 0 ? lc + '/' + lockState.maxTargets : '';
  } else {
    wpnLockEls[w].textContent = '';
  }
}

// Wave counter
if (waveState === WAVE_BREATHER) {
  hudWaveEl.textContent = 'WAVE ' + (waveNumber + 1) + ' \u00B7 INCOMING';
} else if (waveState === WAVE_IDLE) {
  hudWaveEl.textContent = '';
} else {
  hudWaveEl.textContent = 'WAVE ' + waveNumber + ' \u00B7 ' + enemyCount + ' ENEMIES';
}

// Orbit info
if (orbitState === ORBIT_STATE.ORBITING) {
  const bodyName = getTargetName(orbitBody).toUpperCase();
  hudOrbitEl.textContent = bodyName + ' \u00B7 ' + orbitAltitude.toFixed(0) + 'u \u00B7 ORBITING';
} else if (orbitState === ORBIT_STATE.TRANSFER) {
  const tgtName = getTargetName(transferTarget).toUpperCase();
  hudOrbitEl.textContent = tgtName + ' \u00B7 ' + targetOrbitAlt.toFixed(0) + 'u \u00B7 TRANSFER';
} else {
  hudOrbitEl.textContent = 'FREE FLIGHT';
}

// Mode toggle text
hudModeToggleEl.textContent = combatMode ? 'COMBAT' : 'NAV';
```

### Example 4: Weapon Box Click Handler
```javascript
// One-time setup (in index.html after DOM ready)
document.getElementById('hud-weapons').addEventListener('click', function(e) {
  const box = e.target.closest('.weapon-box');
  if (!box) return;
  const wIdx = parseInt(box.dataset.weapon);
  if (isNaN(wIdx) || wIdx < 0 || wIdx > 3) return;
  selectedWeapon = wIdx;
  if (typeof updateMissileLimits === 'function') updateMissileLimits(wIdx);
});
```

### Example 5: Mode Toggle Click Handler
```javascript
document.getElementById('hud-mode-toggle').addEventListener('click', function() {
  combatMode = !combatMode;
  if (!combatMode) {
    // Reset combat state when leaving combat mode
    if (typeof clearLocks === 'function') clearLocks();
    selectedWeapon = 0;
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Scattered HUD elements (speed at bottom-center, altitude above, weapon at bottom-left, combat indicator at top-center) | Unified bottom bar with all info | Phase 8 | Single place to look for all game state |
| Text-only weapon indicator ("1 KINETIC READY") | 4 visual boxes with fill bars | Phase 8 | At-a-glance cooldown awareness for all weapons |
| No persistent wave counter (only flash announcement) | Always-visible wave and enemy count | Phase 8 | Continuous situational awareness |
| Scattered orbit info (altitude HUD, speed HUD, separate elements) | Single orbit info line in bottom bar | Phase 8 | Cleaner screen, all info consolidated |

## Existing Elements to Migrate/Remove

| Old Element | ID | Current Location | Action |
|-------------|-----|-----------------|--------|
| HP bar | `hp-bar-container` | Fixed bottom-center | Rebuild as new elements inside bottom bar; update `hpBarEl`, `hpTextEl` references |
| Weapon indicator | `weapon-indicator` | Fixed bottom-left | Replace with 4 weapon boxes; remove old element |
| Combat mode indicator | `combat-mode-indicator` | Fixed top-center | Replace with mode toggle button; remove old element |
| Speed HUD | `fly-hud-speed` | Fixed bottom-center | Hide (data not needed -- orbit info provides context) |
| Altitude HUD | `fly-hud-altitude` | Fixed bottom-center offset | Replace with orbit info section; remove old element |
| Nav mode label | `fly-hud-mode` | Bottom-left group | Remove (mode toggle replaces) |
| Nav group | `fly-nav-group` | Bottom-left | Remove or hide (was container for mode label + buttons) |
| SPIN readout | `hud-readout-tl` | Top-left | Hide in nav mode (user decided to drop) |
| RANGE readout | `hud-readout-tr` | Top-right | Keep as FPS-only corner |
| Helm controls | `hud-readout-bl` | Bottom-left | Hide in nav mode (bar replaces) |
| Nuke button | `nuke-btn` | Inside hud-overlay | Keep as-is (separate purpose from weapon system) |
| Missile fire button | `missile-fire-btn` | In fly-nav-group | Keep but reparent; or integrate feedback into weapon boxes |

## Integration Points

### Files Modified
1. **index.html** -- New DOM structure for bottom bar (inside `.hud-overlay`); new JS references cached at init; updated render loop HUD section (~lines 1627-1712); weapon box click handler; mode toggle click handler
2. **css/style.css** -- New styles for `.combat-hud-bar` and all child elements; hide old scattered HUD elements in nav mode; mobile responsive rule for bottom bar
3. **js/scene/nav.js** -- Update `enterNavMode()` and `exitNavMode()` to stop toggling old HUD elements that no longer exist; update `resetCombat()` HP bar references to new element IDs

### Key Variables Already Available (globals)
| Variable | Source | Type | Value | Use |
|----------|--------|------|-------|-----|
| `selectedWeapon` | weapons.js | number | 0-3 | Highlight active weapon box |
| `weaponCooldownEnd[4]` | weapons.js | array | simTime endpoints | Cooldown fill calculation |
| `combatMode` | weapons.js | boolean | true/false | Mode toggle text |
| `waveNumber` | waves.js | number | 1+ | Wave counter display |
| `waveState` | waves.js | number | 0-3 (IDLE/ACTIVE/BREATHER/SPAWNING) | Wave counter state awareness |
| `enemyCount` | combat.js | number | 0-64 | Enemy counter display |
| `orbitState` | nav.js | number | 0=ORBITING, 1=TRANSFER, 2=FREE | Orbit info state |
| `orbitBody` | nav.js | number | -2 to 6, or 100+ for L-points | Current orbit body index |
| `orbitAltitude` | nav.js | number | distance units | Current altitude |
| `transferTarget` | nav.js | number | -2 to 6, or 100+ | Transfer destination body |
| `targetOrbitAlt` | nav.js | number | distance units | Target altitude during transfer |
| `simTime` | index.html | number | seconds | Cooldown calculations |
| `playerState.hp` | index.html | number | 0-250 | HP bar fill |
| `playerState.maxHp` | index.html | number | 250 | HP bar max |
| `lockState` | missiles.js | object | {targets[], maxTargets, maxPerTarget} | Lock count for missile weapons |
| `KINETIC_COOLDOWN` | weapons.js | constant | 1.0 | Cooldown duration for fill calc |
| `PLASMA_COOLDOWN` | weapons.js | constant | 2.5 | Cooldown duration for fill calc |
| `MISSILE_COOLDOWN_REGULAR` | missiles.js | constant | 3.0 | Cooldown duration for fill calc |
| `MISSILE_COOLDOWN_NUKE` | missiles.js | constant | 8.0 | Cooldown duration for fill calc |
| `getTargetName(idx)` | nav.js | function | returns string | Body name from index |
| `getLockCount()` | missiles.js | function | returns number | Total lock count |
| `updateMissileLimits(wIdx)` | missiles.js | function | void | Updates lock limits on weapon switch |

## Open Questions

1. **Nuke Button Fate**
   - What we know: `nuke-btn` currently triggers a nuclear detonation near Saturn. It's separate from the weapon system.
   - What's unclear: Should it remain as a standalone button or be removed now that nuke weapon (slot 4) is in the weapon boxes?
   - Recommendation: Keep it as-is for now. It serves a different purpose (detonation demo) than the weapon system. Can be cleaned up later.

2. **Missile Fire Button Fate**
   - What we know: `missile-fire-btn` shows lock/fire/cooldown state and is reparented between `.hud-overlay` and `.fly-nav-group`.
   - What's unclear: Whether the weapon boxes + right-click workflow make this button redundant.
   - Recommendation: Keep it for now but evaluate. The weapon boxes show lock count. Right-click fires. The button may still be useful as visual feedback for "FIRE SALVO" / "IN FLIGHT" states. Can be positioned in the bottom bar or kept as overlay.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based visual testing (tests.html) + manual visual verification |
| Config file | tests.html (shader invariants only -- no HUD tests exist) |
| Quick run command | `Open http://localhost:8000 in browser, enter nav mode (click planet), verify bottom bar` |
| Full suite command | `Open http://localhost:8000/tests.html -- shader invariants still pass` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HUD-01 | 4 weapon boxes, selected highlighted, cooldown fill | manual-only | Visual: enter nav mode, press 1-4, fire weapons, check cooldown bars | N/A |
| HUD-02 | Wave counter shows wave number and enemy count | manual-only | Visual: enter nav mode, kill enemies, verify counter decrements and wave increments | N/A |
| HUD-03 | HP bar in bottom bar, 3-color threshold | manual-only | Visual: take damage, verify bar color changes at 50%/25% thresholds | N/A |
| HUD-07 | Orbit info shows body, altitude, state | manual-only | Visual: click planet to orbit, verify "JUPITER . 38u . ORBITING"; initiate transfer, verify shows destination | N/A |

### Sampling Rate
- **Per task commit:** Visual inspection of bottom bar in browser
- **Per wave merge:** Full visual walkthrough + `tests.html` shader invariants
- **Phase gate:** All 4 HUD requirements visually confirmed + `tests.html` green

### Wave 0 Gaps
None -- this phase is DOM/CSS/JS only with manual visual testing. No test framework needed beyond existing `tests.html` for shader invariants.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `index.html`, `css/style.css`, `js/scene/weapons.js`, `js/scene/waves.js`, `js/scene/combat.js`, `js/scene/nav.js`, `js/scene/missiles.js`
- `.planning/phases/08-combat-hud/08-CONTEXT.md` -- User decisions and locked choices
- `.planning/REQUIREMENTS.md` -- HUD-01, HUD-02, HUD-03, HUD-07 requirement definitions

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` -- Accumulated project decisions informing integration points

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase inspection (no external research needed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- pure DOM/CSS/JS, no external dependencies, verified from codebase
- Architecture: HIGH -- all state variables confirmed present in codebase, integration points mapped with exact variable names, file locations, and line numbers
- Pitfalls: HIGH -- identified from direct code inspection of render loop, state management, z-index hierarchy, and module cross-references

**Research date:** 2026-03-13
**Valid until:** No expiry -- codebase-specific findings, not library version dependent
