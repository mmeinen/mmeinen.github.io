# Phase 13: Fleet Composition System - Research

**Researched:** 2026-03-18
**Domain:** Wave-based fleet spawning, structured group composition, HUD callout UI (JavaScript, pure DOM -- no frameworks)
**Confidence:** HIGH

## Summary

Phase 13 replaces the current individual-enemy wave spawning system with structured fleet spawning. Currently, `waves.js` uses `getWaveDefinition()` to produce a flat list of `{type, count}` groups and `spawnWave()` distributes enemies across planets in a round-robin fashion. This phase introduces a new `fleets.js` module that defines fleet templates (raid, patrol, siege) with role differentiation (anchor, screen, striker), and modifies `waves.js` to spawn up to 3 fleets per wave. Each fleet is placed at a single planet (the anchor body), with all members station-keeping within a tight orbital radius band (+/-15% of the anchor body's orbital radius from the BH center). A 3-second HUD callout announces each fleet spawn with a directional indicator pointing toward the spawn location.

The architecture is deliberately spawn-time only. Per the v1.1 architecture research (Anti-Pattern 4), fleets are NOT a runtime concept -- `spawnFleet()` places enemies with correct `assignBody` and `stationPhase`, and after spawn each enemy runs its existing individual AI independently. Fleet coherence emerges from all members being anchored to the same planet. No new SoA fields are needed for basic fleet support. The existing `assignBody` field in the enemy SoA already provides the anchor. The existing AI state machine (6 states, per-archetype behaviors) is untouched.

**Primary recommendation:** Create `js/scene/fleets.js` with fleet template definitions and a `spawnFleet()` function. Modify `waves.js` to replace `getWaveDefinition()` and `spawnWave()` with fleet-based composition. Add a fleet callout HUD element to `index.html` and callout CSS animation to `style.css`. The directional indicator reuses the same screen-edge projection math already proven in `updateEnemyIndicators()`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLEET-01 | Enemies spawn as structured fleets with max 3 fleets per wave | New `fleets.js` module with `FLEET_TEMPLATES` data table; modified `waves.js getWaveDefinition()` returns array of up to 3 fleet specs; `spawnWave()` iterates fleet specs calling `spawnFleet()` for each |
| FLEET-02 | Fleet compositions have defined roles (anchor, screen, striker) with named templates that scale with difficulty | `FLEET_TEMPLATES` table with named types (e.g., PATROL, RAID, SIEGE, VANGUARD) each specifying role slots; `getFleetComposition(waveNum)` selects and scales templates based on wave number and archetype unlock thresholds |
| FLEET-03 | Fleet members orbit near a shared anchor body within +/-15% of anchor radius | `spawnFleet()` assigns all members the same `assignBody` and distributes `stationPhase` angles within a tight arc; station-keeping altitude varied slightly per member for visual spread but all remain within the +/-15% orbital radius band |
| FLEET-04 | Fleet spawn announced in HUD with 3-second callout and directional indicator | New `fleet-callout` DOM element with CSS animation (3s duration matching existing `waveAnnounce` pattern); directional chevron using screen-edge projection math from `updateEnemyIndicators()` |
</phase_requirements>

## Standard Stack

### Core

No new libraries. This phase is pure JavaScript data tables and DOM manipulation. All code lives in the existing `js/scene/` modules plus one new file.

| Module | Status | Purpose | Why |
|--------|--------|---------|-----|
| `js/scene/fleets.js` | **NEW** | Fleet template definitions, `spawnFleet()`, `getFleetComposition()` | Separates fleet data from wave state machine per architecture pattern |
| `js/scene/waves.js` | **MODIFY** | Replace `getWaveDefinition()` and `spawnWave()` with fleet-based versions | Wave state machine (IDLE/ACTIVE/BREATHER/SPAWNING) stays intact |
| `index.html` | **MODIFY** | Add `<script src="js/scene/fleets.js">` tag, add fleet callout DOM element, add fleet callout display logic | Script ordering: fleets.js before waves.js (fleets.js is pure data, waves.js consumes it) |
| `css/style.css` | **MODIFY** | Add `.fleet-callout` styles with directional indicator | Follows existing wave-announce animation pattern |

### Script Load Order

```
js/scene/scale.js          (constants)
js/scene/orbital.js        (body helpers)
js/scene/nav.js            (getBodyPositionKm, getBodyRadiusKm)
js/scene/combat.js         (enemy SoA, spawnEnemy, AI)
js/scene/fleets.js    <--- NEW: before waves.js
js/scene/waves.js          (wave state machine, now calls fleets.js)
js/scene/weapons.js        (projectiles)
js/scene/explosions.js     (VFX)
js/scene/particles.js      (particles)
js/scene/missiles.js       (missiles)
```

## Architecture Patterns

### Pattern: Fleet as Spawn-Time Data Only

**What:** Fleets are a spawn-time concept, not a runtime entity. `spawnFleet()` places enemies with correct `assignBody`, `stationPhase`, and type. After spawn, each enemy runs its existing individual AI independently. No fleet ID stored on enemies. No runtime fleet tracking.

**Why:** The existing AI state machine (6 states, 5 archetypes) is battle-tested across 9 phases. Embedding fleet awareness would add coupling that must be debugged every time AI behavior changes. Fleet coherence emerges naturally from all members being anchored to the same planet.

**Source:** Architecture research Anti-Pattern 4 (verified in `.planning/research/ARCHITECTURE.md` line 611-623).

### Pattern: Role-Based Fleet Templates

**What:** Each fleet template defines slots by role:
- **Anchor** (0-1): Capital or Bomber -- large, central, high HP. Spawns at the planet's station-keeping position. Defines the "center" of the fleet.
- **Screen** (2-6): Grunts and Swarms -- numerous, close to the anchor. Small orbit offsets around the anchor body. Provide the fleet's visible mass.
- **Striker** (1-3): Snipers and Bombers -- fewer, wider orbit offsets from the anchor body. Arrive from wider angles when triggered.

**When to use:** Fleet definition time. Role determines spawn position parameters (station-keeping altitude offset, angle spread).

### Pattern: Radius Band Placement

**What:** FLEET-03 requires all fleet members within +/-15% of the anchor body's orbital radius. For Jupiter at 50,008 km orbit: band = [42,507 km, 57,509 km]. Station-keeping places enemies at `bodyPos + (bodyR + STATION_KEEP_ALT) * direction`. Since `STATION_KEEP_ALT = 1,500 km` and body radii range from 432-2,000 km, station-keeping altitude is ~2,000-3,500 km from body center. This is well within +/-15% of any planet's orbit radius (smallest planet Venus orbit is 36,848 km; +/-15% = 5,527 km band).

**Key insight:** The existing station-keeping mechanism already satisfies FLEET-03 for any fleet anchored to a single planet. The +/-15% constraint is automatically met because `STATION_KEEP_ALT` (1,500 km) + max body radius (2,000 km) = 3,500 km, which is far smaller than 15% of any orbit radius (minimum 15% * 36,848 = 5,527 km). No new position logic needed beyond assigning all fleet members to the same `assignBody`.

### Pattern: Staggered Station Phases for Visual Spread

**What:** Fleet members get evenly distributed `stationPhase` values within a limited angular arc (e.g., +/-30 degrees around the anchor member's phase). This creates a visible cluster rather than a single point. Different roles get different arcs:
- Anchor: phase = 0 (reference point)
- Screen: phase = evenly spaced within +/-0.5 radians (~30 deg) of anchor
- Striker: phase = evenly spaced within +/-1.0 radians (~57 deg) of anchor -- wider orbit for flanking

### Pattern: Fleet Callout with Directional Indicator

**What:** When a fleet spawns, a HUD callout element appears for 3 seconds showing the fleet type name and a directional chevron pointing toward the spawn location. The callout uses screen-edge projection similar to `updateEnemyIndicators()` in index.html (line 1108-1151).

**How it works:**
1. `spawnFleet()` returns the average spawn position (centroid of fleet members)
2. A new `showFleetCallout(fleetName, worldX, worldZ)` function:
   - Sets callout text (e.g., "RAID FLEET INCOMING" or "SIEGE GROUP DETECTED")
   - Computes angle from player to spawn position
   - Sets a CSS custom property or inline style for the chevron rotation
   - Adds `.visible` class to trigger 3s CSS animation
3. The callout element is positioned near the wave announcement area (center-top of screen) with the directional chevron as a sub-element

**Existing pattern reference:** The `showWaveAnnouncement()` function in waves.js uses the same `.visible` class + `animationend` listener cleanup pattern. The fleet callout follows this exact same pattern.

### Recommended File Structure

```
js/scene/
  fleets.js           NEW: fleet templates + spawnFleet() + getFleetComposition()
  waves.js            MODIFY: spawnWave() delegates to fleets.js
css/
  style.css           MODIFY: add .fleet-callout styles
index.html            MODIFY: add <script> tag, add callout DOM element
```

### Anti-Patterns to Avoid

- **Fleet runtime tracking:** Do NOT add a `fleetId` field to the enemy SoA. Do NOT track which enemies belong to which fleet after spawn. Fleet coherence is spawn-time only.
- **Fleet-aware AI:** Do NOT modify `updateEnemyAI()` to check fleet membership. Each enemy's individual AI handles all combat behavior.
- **Dynamic formation flying:** Explicitly out of scope per REQUIREMENTS.md Out of Scope section. "Loose proximity coherence achieves the same perceived result."
- **Modifying the wave state machine:** The WAVE_IDLE/ACTIVE/BREATHER/SPAWNING state machine in `updateWaveSystem()` is correct and tested. Only the `getWaveDefinition()` and `spawnWave()` functions change -- the state transitions stay identical.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Screen-edge direction indicator | Custom projection math | Copy `updateEnemyIndicators()` angle calculation (index.html L1108-1151) | Already handles behind-camera, off-screen clamping, and edge positioning |
| 3-second timed callout with fade | Custom timer + opacity animation | CSS animation + `animationend` event (same pattern as `showWaveAnnouncement()`) | Proven pattern, no JS timer management needed |
| Enemy placement at planet | New position computation | Existing `getBodyPositionKm()` + `STATION_KEEP_ALT` + `spawnEnemy()` | Already handles body-relative positioning with angle offset |
| Difficulty-scaled composition | Complex formula per fleet | Wave number thresholds for archetype unlock (reuse from current `getWaveDefinition()`) | Current wave system already has unlock thresholds: Swarm@3, Bomber@5, Sniper@8, Capital@15 |

## Common Pitfalls

### Pitfall 1: Exceeding MAX_ENEMIES (64)

**What goes wrong:** With 3 fleets of 8-12 members each, plus Capital-spawned minions, the 64-slot limit can be hit quickly at higher waves. `spawnEnemy()` silently returns -1 when full.
**Why it happens:** Fleet templates are defined with fixed member counts but don't account for existing alive enemies from Capital minion spawning.
**How to avoid:** `spawnFleet()` must check `freeSlots.length` before each `spawnEnemy()` call and stop early if slots are exhausted. `getFleetComposition()` should cap total enemy count at `MAX_ENEMIES - 8` (reserve 8 slots for Capital minion spawns), matching the existing cap in `getWaveDefinition()`.
**Warning signs:** Enemies failing to appear in later waves; fleet visually incomplete.

### Pitfall 2: All Fleets at Same Planet

**What goes wrong:** If all 3 fleets anchor to the same planet, they form an indistinguishable blob. The player sees one large group, not 3 distinct fleets.
**Why it happens:** Planet selection without coordination between fleet spawns.
**How to avoid:** `spawnWave()` must assign each fleet to a different planet. Use planet selection that avoids repeats (e.g., shuffle planet indices and assign in order). Exception: boss waves may intentionally cluster at one planet.
**Warning signs:** Fleets visually merge; player cannot identify distinct groups.

### Pitfall 3: Fleet Callout Overlapping Wave Announcement

**What goes wrong:** The existing `showWaveAnnouncement()` fires during the breather phase. If fleet callouts also fire at spawn time, both text elements appear simultaneously and overlap visually.
**Why it happens:** Wave announcement shows during BREATHER; fleet spawn happens at the end of BREATHER transitioning to ACTIVE.
**How to avoid:** Sequence the callouts: wave announcement plays during BREATHER (existing 3s), fleet callouts start after wave announcement completes (at spawn time). Alternatively, combine fleet names into the wave announcement text. Or position fleet callouts below the wave announcement with vertical offset.
**Warning signs:** Overlapping text on screen; unreadable announcements.

### Pitfall 4: Station Phase Clustering

**What goes wrong:** If station phases are all identical (e.g., 0), all fleet members stack at the same position, making the fleet look like a single enemy.
**Why it happens:** `spawnEnemy()` receives `stationPhase` but the fleet code doesn't distribute it.
**How to avoid:** Calculate evenly-spaced station phases for fleet members: `basePhase + (memberIndex / totalMembers) * spreadArc`. Use different arc widths for different roles (screen: narrow, striker: wide).
**Warning signs:** Fleet looks like one large enemy; individual members only visible after AI activation scatters them.

### Pitfall 5: Script Load Order

**What goes wrong:** `fleets.js` references `ETYPE` constants from `combat.js`, or `waves.js` calls `spawnFleet()` from `fleets.js`. If script order is wrong, references are undefined.
**Why it happens:** Global scope dependency in script-tag-loaded files (no module system).
**How to avoid:** Script load order must be: combat.js (defines ETYPE, spawnEnemy) -> fleets.js (uses ETYPE, spawnEnemy) -> waves.js (uses spawnFleet, getFleetComposition). This matches the existing pattern where combat.js loads before waves.js.
**Warning signs:** `ReferenceError: ETYPE is not defined` or `spawnFleet is not a function` in console.

## Code Examples

### Fleet Template Definition (fleets.js)

```javascript
// Source: architecture research Pattern 3, adapted to current codebase
const FLEET_MAX_PER_WAVE = 3;

const FLEET_TEMPLATES = {
  PATROL: {
    name: 'PATROL',
    // Small early-game fleet: grunts only
    composition: [
      { role: 'screen', type: ETYPE.GRUNT, count: 3 }
    ]
  },
  RAID: {
    name: 'RAID',
    // Fast attack fleet: swarms + grunts
    composition: [
      { role: 'screen', type: ETYPE.SWARM, count: 3 },
      { role: 'screen', type: ETYPE.GRUNT, count: 2 }
    ]
  },
  SIEGE: {
    name: 'SIEGE',
    // Heavy assault: bomber anchor + grunt screen + sniper strikers
    composition: [
      { role: 'anchor', type: ETYPE.BOMBER, count: 1 },
      { role: 'screen', type: ETYPE.GRUNT, count: 3 },
      { role: 'striker', type: ETYPE.SNIPER, count: 1 }
    ]
  },
  VANGUARD: {
    name: 'VANGUARD',
    // Capital-led: capital anchor + mixed support
    composition: [
      { role: 'anchor', type: ETYPE.CAPITAL, count: 1 },
      { role: 'screen', type: ETYPE.GRUNT, count: 2 },
      { role: 'striker', type: ETYPE.BOMBER, count: 1 }
    ]
  }
};
```

### Fleet Spawn Function (fleets.js)

```javascript
// Source: existing spawnWave() in waves.js, restructured for fleet grouping
function spawnFleet(template, anchorBodyIdx, basePhase) {
  const bodyPos = getBodyPositionKm(anchorBodyIdx, simTime);
  const bodyR = getBodyRadiusKm(anchorBodyIdx);
  const stR = bodyR + STATION_KEEP_ALT;
  const planetAngle = Math.atan2(bodyPos[0], bodyPos[2]);
  let memberIdx = 0;
  let totalMembers = 0;
  for (const slot of template.composition) totalMembers += slot.count;

  const spawned = [];
  for (const slot of template.composition) {
    // Role-based spread: anchor=0, screen=+/-0.5rad, striker=+/-1.0rad
    const arcWidth = slot.role === 'anchor' ? 0 :
                     slot.role === 'screen' ? 0.5 : 1.0;
    for (let c = 0; c < slot.count; c++) {
      if (freeSlots.length === 0) break;
      const phaseOffset = arcWidth > 0
        ? -arcWidth + (2 * arcWidth * c / Math.max(1, slot.count - 1))
        : 0;
      const stPh = basePhase + phaseOffset;
      const angle = planetAngle + stPh;
      const x = bodyPos[0] + stR * Math.sin(angle);
      const z = bodyPos[2] + stR * Math.cos(angle);
      const idx = spawnEnemy(x, 0, z, slot.type, anchorBodyIdx, stPh);
      if (idx >= 0) {
        spawned.push(idx);
        if (slot.type === ETYPE.CAPITAL) {
          enemies.auxTimer[idx] = -1.0; // warp-in phase
          if (typeof spawnExplosion === 'function') spawnExplosion(x, 0, z, 4000);
        }
      }
      memberIdx++;
    }
  }
  return { spawned, centroidX: bodyPos[0], centroidZ: bodyPos[2] };
}
```

### Fleet Composition per Wave (fleets.js)

```javascript
// Source: adapted from existing getWaveDefinition() wave-scaling logic
function getFleetComposition(waveNum) {
  const fleets = [];
  const maxEnemies = Math.min(MAX_ENEMIES - 8, Math.floor(6 + waveNum * 1.2));

  // Boss waves: single VANGUARD fleet (Capital-led)
  const isBoss = waveNum >= 10 && waveNum % 10 === 0;
  if (isBoss) {
    fleets.push({ template: FLEET_TEMPLATES.VANGUARD, scaled: true });
    // ... additional fleets for later boss waves
    return fleets;
  }

  // Normal waves: select 1-3 fleet templates based on wave number
  // Wave 1-2: 1 PATROL fleet
  // Wave 3-4: 1-2 fleets (PATROL + RAID)
  // Wave 5-7: 2 fleets (mix of PATROL, RAID, SIEGE)
  // Wave 8+: 2-3 fleets (all templates available)
  // Wave 15+: VANGUARD may appear as one of the 3 fleets
  // ... template selection logic based on waveNum and archetype unlocks
  return fleets;
}
```

### Fleet Callout HUD (index.html + style.css)

```html
<!-- Added near wave-announce element -->
<div id="fleet-callout" class="fleet-callout">
  <div class="fleet-callout-chevron"></div>
  <span class="fleet-callout-text"></span>
</div>
```

```css
/* Source: follows existing .wave-announce pattern */
.fleet-callout {
  position: fixed;
  top: 38%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 28;
  pointer-events: none;
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 600;
  font-size: 1.2em;
  letter-spacing: 0.2em;
  color: rgba(255, 160, 80, 0.95); /* warning/accent color */
  text-shadow: 0 0 12px rgba(255, 160, 80, 0.5);
  opacity: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.fleet-callout.visible {
  animation: fleetCallout 3s ease-in-out forwards;
}
@keyframes fleetCallout {
  0%   { opacity: 0; transform: translateX(-50%) scale(0.8); }
  10%  { opacity: 1; transform: translateX(-50%) scale(1.02); }
  15%  { transform: translateX(-50%) scale(1); }
  70%  { opacity: 1; }
  100% { opacity: 0; }
}
.fleet-callout-chevron {
  width: 0; height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 12px solid currentColor;
  /* Rotated via inline style to point toward spawn location */
}
```

```javascript
// Source: follows showWaveAnnouncement() pattern in waves.js
function showFleetCallout(fleetName, spawnX, spawnZ) {
  const el = document.getElementById('fleet-callout');
  if (!el) return;
  // Set text
  el.querySelector('.fleet-callout-text').textContent = fleetName + ' DETECTED';
  // Compute direction from player to spawn
  const dx = spawnX - flyPos[0];
  const dz = spawnZ - flyPos[2];
  const angle = Math.atan2(dx, dz); // world-space angle
  // Rotate chevron to point toward spawn
  const chevron = el.querySelector('.fleet-callout-chevron');
  chevron.style.transform = 'rotate(' + ((angle * 180 / Math.PI) + 180) + 'deg)';
  // Trigger animation
  el.classList.remove('visible');
  void el.offsetWidth; // force reflow
  el.classList.add('visible');
}
```

## State of the Art

| Old Approach (current) | New Approach (Phase 13) | Impact |
|------------------------|------------------------|--------|
| `getWaveDefinition()` returns flat `{type, count}[]` | `getFleetComposition()` returns array of fleet specs with templates | Structured, role-aware spawning |
| `spawnWave()` distributes enemies round-robin across all planets | `spawnFleet()` places all fleet members at one planet with role-based spread | Spatial coherence per fleet |
| `showWaveAnnouncement()` shows "WAVE X" text only | Additional fleet callouts with directional indicator per fleet | Player gets tactical awareness of where threats are appearing |
| Enemy positions random around planets | Enemy positions clustered by fleet with role-based arc widths | Visible role differentiation in each fleet |

## Open Questions

1. **Fleet callout sequencing for multiple fleets**
   - What we know: Up to 3 fleets spawn per wave. Each needs a callout.
   - What's unclear: Should callouts be sequential (1s each, total 3s)? Simultaneous (3 callouts at once)? Or staggered (0.5s delay between each)?
   - Recommendation: Stagger callouts with 1s delay between each. Total display time: ~5s for 3 fleets. This gives player time to read each one. Use a simple queue with setTimeout or animation delay.

2. **Fleet template scaling at high wave numbers**
   - What we know: Current system scales enemy count to `6 + waveNum * 1.2`, capped at `MAX_ENEMIES - 8`. Archetype weights shift over waves.
   - What's unclear: Should fleet templates have fixed member counts, or should counts scale with wave number?
   - Recommendation: Fleet templates define base composition. A difficulty multiplier increases counts for screen/striker roles at higher waves. Anchor count stays fixed (0-1 per fleet). Cap total spawned enemies at `MAX_ENEMIES - 8` across all fleets.

3. **Planet selection for fleet anchoring**
   - What we know: 7 planets available. Some are closer to BH (Venus at 36,848 km) and some far (Neptune at 113,176 km).
   - What's unclear: Should fleet placement prefer certain planets? Should difficulty affect which planets get fleets (inner = more dangerous)?
   - Recommendation: Random selection from available planets, ensuring no two fleets in the same wave share a planet. Boss fleets (VANGUARD with Capital) prefer the 3 largest planets (Jupiter, Saturn, Uranus) matching the existing Capital placement logic.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based regression tests (tests.html) |
| Config file | `tests.html` (regex-based invariant extraction) |
| Quick run command | Open `http://localhost:8000/tests.html` in browser |
| Full suite command | Same as quick run (all tests run in single page load) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLEET-01 | Max 3 fleets per wave, structured composition | manual-only | Visual: enter combat, observe wave spawns form distinct groups | N/A |
| FLEET-02 | Role differentiation visible (anchor large/central, screen numerous, strikers wider) | manual-only | Visual: observe fleet at planet -- anchor is largest, screen surrounds it, strikers at wider angles | N/A |
| FLEET-03 | Fleet members within +/-15% of anchor body orbit radius | manual-only | Visual: all fleet members cluster near one planet, not scattered across orbits | N/A |
| FLEET-04 | HUD callout with 3s display and directional chevron | manual-only | Visual: watch for fleet callout text + rotating chevron when wave spawns | N/A |

**Justification for manual-only:** The project has no unit test framework (pure browser JS, no npm, no build tools). All validation is visual/behavioral through browser testing. The existing `tests.html` validates shader invariants only, not game logic. Adding automated game logic tests would require a test framework that is out of scope for this project.

### Sampling Rate
- **Per task commit:** Visual check in browser (start combat, observe 3+ wave transitions)
- **Per wave merge:** Full visual playthrough to wave 10+ to verify fleet scaling
- **Phase gate:** All 4 requirements visually confirmed before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `js/scene/fleets.js` -- new file, covers FLEET-01, FLEET-02, FLEET-03
- [ ] `css/style.css` fleet-callout styles -- covers FLEET-04
- [ ] `index.html` fleet-callout DOM element and `<script>` tag -- covers FLEET-04

## Sources

### Primary (HIGH confidence)
- `js/scene/waves.js` -- Current wave system implementation (verified 2026-03-18)
- `js/scene/combat.js` -- Enemy SoA store, spawnEnemy(), AI state machine (verified 2026-03-18)
- `js/scene/scale.js` -- km-scale constants, planet orbit radii (verified 2026-03-18)
- `js/scene/orbital.js` -- Body position helpers, station-keeping (verified 2026-03-18)
- `js/scene/nav.js` -- getBodyPositionKm(), getBodyRadiusKm() (verified 2026-03-18)
- `.planning/research/ARCHITECTURE.md` -- v1.1 architecture: fleet pattern, anti-patterns, build order (verified 2026-03-18)
- `.planning/REQUIREMENTS.md` -- FLEET-01 through FLEET-04 requirements, out-of-scope exclusions (verified 2026-03-18)
- `css/style.css` -- wave-announce animation, enemy-indicator styling (verified 2026-03-18)
- `index.html` -- HUD structure, script load order, enemy indicator logic (verified 2026-03-18)

### Secondary (MEDIUM confidence)
- `.planning/milestones/v1.0-phases/07-wave-progression-enemy-variety/07-RESEARCH.md` -- Original wave system design decisions (verified 2026-03-18)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all code is in-project JavaScript, no external dependencies, architecture pre-researched
- Architecture: HIGH -- fleet spawn pattern explicitly documented in ARCHITECTURE.md with anti-patterns identified
- Pitfalls: HIGH -- derived from direct analysis of existing codebase constraints (MAX_ENEMIES=64, script load order, HUD overlap)

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- no external dependencies to become stale)
