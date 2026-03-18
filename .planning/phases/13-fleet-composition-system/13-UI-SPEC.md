---
phase: 13
slug: fleet-composition-system
status: draft
shadcn_initialized: false
preset: none
created: 2026-03-18
---

# Phase 13 — UI Design Contract

> Visual and interaction contract for fleet composition HUD callouts, directional indicators, and canvas-rendered fleet role differentiation.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none (canvas + DOM HUD) |
| Icon library | none (CSS border-triangle shapes + canvas primitives) |
| Font stack (HUD) | `'Segoe UI', 'Helvetica Neue', Arial, sans-serif` |
| Font stack (monospace) | `'Consolas', 'Monaco', monospace` |

---

## Spacing Scale

8-point grid adapted for HUD overlay elements.

| Token | Value | Usage |
|-------|-------|-------|
| `sp-2` | 2px | Chevron-to-text inline gap minimum |
| `sp-4` | 4px | Internal sub-element margins |
| `sp-8` | 8px | Callout internal padding (vertical), gap between chevron and text |
| `sp-12` | 12px | Callout horizontal padding |
| `sp-16` | 16px | Vertical offset between wave announcement and fleet callout |
| `sp-24` | 24px | Callout horizontal padding outer |

### HUD Element Positioning

| Element | Position | Offset from Reference |
|---------|----------|----------------------|
| Fleet callout container | `position: fixed; top: 38%; left: 50%; transform: translateX(-50%)` | 8% below wave announcement (`top: 30%`) |
| Directional chevron | Inline, left of callout text | 8px gap (`gap: 8px`) |
| Staggered callout offset | Each subsequent callout shifts down | 32px vertical offset per callout (`top: calc(38% + N * 32px)`) |

---

## Typography

All fleet callout text uses the primary HUD font stack: `'Segoe UI', 'Helvetica Neue', Arial, sans-serif`.

| Element | Size | Weight | Letter-Spacing | Transform | Line-Height |
|---------|------|--------|----------------|-----------|-------------|
| Fleet callout text | 14px (`0.875em` relative to 16px base) | 600 | 0.2em | uppercase | 1.2 |
| Fleet type name within callout | 14px | 700 | 0.2em | uppercase | 1.2 |
| Directional label (optional bearing) | 10px | 600 | 0.15em | uppercase | 1 |

**Rationale:** Fleet callout is deliberately smaller than the wave announcement (2.5em / 700) to establish visual hierarchy. Wave announcement is the primary alert; fleet callout is secondary tactical information.

---

## Color

### Existing Palette (do not modify)

| Token | Value | Usage |
|-------|-------|-------|
| HUD Blue | `rgba(60, 140, 255, *)` | Primary HUD elements, weapon boxes, readouts |
| HUD Blue Text | `rgba(170, 210, 255, 0.9)` | Readout values, general HUD text |
| Warning Orange | `rgba(255, 160, 80, *)` | Warnings, combat mode, alert states |
| Danger Red | `rgba(255, 80, 60, *)` | Boss waves, lock reticles, damage |
| HUD Background | `rgba(0, 4, 16, 0.78)` | Readout box backgrounds |
| HUD Border | `rgba(60, 140, 255, 0.15)` | Default border on HUD panels |

### Fleet Callout Colors (new)

| Element | Color | Glow/Shadow |
|---------|-------|-------------|
| Fleet callout text (normal fleets) | `rgba(255, 160, 80, 0.95)` | `text-shadow: 0 0 12px rgba(255, 160, 80, 0.5)` |
| Fleet callout text (VANGUARD / boss fleets) | `rgba(255, 80, 60, 0.95)` | `text-shadow: 0 0 16px rgba(255, 80, 60, 0.6), 0 0 32px rgba(255, 80, 60, 0.3)` |
| Directional chevron (inherits from text) | `currentColor` | none (inherits text glow) |

**Rationale:** Normal fleet callouts use the established warning orange to match the existing combat-mode and fly-hud-mode color. Boss fleet callouts (VANGUARD with Capital) use danger red to match the `.wave-announce.boss` convention. Both colors are already in the palette -- no new colors introduced.

### Canvas-Rendered Fleet Role Colors

Fleet role differentiation is conveyed through size and existing enemy archetype rendering. No new colors are introduced for fleet roles in the canvas renderer because each enemy type already has its own visual identity (color, size, shape) from Phases 5 and 7. The fleet system groups these existing visuals -- it does not recolor them.

| Role | Visual Differentiation | Source |
|------|----------------------|--------|
| Anchor (Capital/Bomber) | Largest sprite, central position in cluster | Existing archetype scale: Capital=16.0, Bomber=1.3 |
| Screen (Grunt/Swarm) | Numerous small sprites, tight cluster | Existing archetype scale: Grunt=1.0, Swarm=1.0 |
| Striker (Sniper/Bomber) | Medium sprites, wider angular spread from cluster center | Existing archetype scale: Sniper=1.2, Bomber=1.3 |

---

## Copywriting Contract

All text is uppercase with letter-spacing for the HUD sci-fi aesthetic.

### Fleet Callout Text

| Fleet Template | Callout Text | Notes |
|----------------|-------------|-------|
| PATROL | `PATROL GROUP DETECTED` | Early-game, grunts only |
| RAID | `RAID FLEET INCOMING` | Fast attack, swarms + grunts |
| SIEGE | `SIEGE FLEET DETECTED` | Heavy assault, bomber anchor |
| VANGUARD | `VANGUARD FLEET INCOMING` | Capital-led boss fleet, uses danger red |

**Pattern:** `{FLEET_NAME} {FLEET|GROUP} {DETECTED|INCOMING}`

- Use "GROUP" for small fleets (PATROL: 3 members)
- Use "FLEET" for larger fleets (RAID, SIEGE, VANGUARD: 4+ members)
- Use "INCOMING" for aggressive fleets with strikers (RAID, VANGUARD)
- Use "DETECTED" for positional fleets (PATROL, SIEGE)

### Sequenced Multi-Fleet Callouts

When multiple fleets spawn in the same wave, callouts are staggered:

| Callout | Timing | Position |
|---------|--------|----------|
| Fleet 1 callout | `animation-delay: 0s` | `top: 38%` |
| Fleet 2 callout | `animation-delay: 1.2s` | `top: calc(38% + 32px)` |
| Fleet 3 callout | `animation-delay: 2.4s` | `top: calc(38% + 64px)` |

**Total multi-fleet callout duration:** 5.4s (last callout starts at 2.4s + 3s animation = 5.4s).

### Empty / Edge States

| State | Behavior |
|-------|----------|
| Single fleet wave | One callout at `top: 38%`, no stagger |
| MAX_ENEMIES reached mid-spawn | Callout still shows for the fleet template even if some members failed to spawn (callout is announcement, not confirmation) |
| Fleet at same planet as player | Same callout text, no special treatment (directional chevron will point to nearby position) |

---

## DOM Structure

### Fleet Callout Element

```html
<!-- Placed adjacent to #wave-announce in the HUD overlay -->
<div id="fleet-callout-0" class="fleet-callout">
  <div class="fleet-callout-chevron"></div>
  <span class="fleet-callout-text"></span>
</div>
<div id="fleet-callout-1" class="fleet-callout">
  <div class="fleet-callout-chevron"></div>
  <span class="fleet-callout-text"></span>
</div>
<div id="fleet-callout-2" class="fleet-callout">
  <div class="fleet-callout-chevron"></div>
  <span class="fleet-callout-text"></span>
</div>
```

**Rationale:** Three separate elements (one per max fleet) rather than a single reused element. This allows CSS `animation-delay` to stagger them without JS timer management. Matches the existing pattern of pre-allocated DOM elements (enemy indicators are pre-created in JS for the same reason).

---

## CSS Specification

### `.fleet-callout`

```css
.fleet-callout {
  position: fixed;
  top: 38%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 28;
  pointer-events: none;
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 600;
  font-size: 0.875em;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 160, 80, 0.95);
  text-shadow: 0 0 12px rgba(255, 160, 80, 0.5);
  opacity: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
```

### Stagger Offsets

```css
#fleet-callout-1 { top: calc(38% + 32px); }
#fleet-callout-2 { top: calc(38% + 64px); }
```

### Boss Fleet Modifier

```css
.fleet-callout.boss {
  color: rgba(255, 80, 60, 0.95);
  text-shadow: 0 0 16px rgba(255, 80, 60, 0.6), 0 0 32px rgba(255, 80, 60, 0.3);
}
```

### Visibility Animation

```css
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
```

**Keyframe rationale:** Identical curve to `@keyframes waveAnnounce` but at smaller scale overshoot (1.02 vs 1.05) to feel subordinate to the wave announcement. 3s total duration provides readable hold time (10%-70% = 1.8s of full opacity).

### Directional Chevron

```css
.fleet-callout-chevron {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 10px solid currentColor;
  flex-shrink: 0;
  transition: transform 0.3s ease;
  /* Rotation set via inline style: transform: rotate(Xdeg) */
}
```

**Chevron sizing:** 12px wide x 10px tall. Slightly smaller than the enemy indicator chevron (12px wide x 10px tall) to avoid confusion -- same proportions but at callout scale rather than edge-of-screen scale. Uses `currentColor` to inherit the callout text color (orange or red depending on fleet type).

**Rotation convention:** 0deg = pointing up (north/toward top of screen). Rotation is clockwise: 90deg = pointing right (east), 180deg = pointing down (south). Computed as `atan2(dx, dz) * 180 / PI + 180` where dx/dz is player-to-fleet-centroid vector.

### Mobile Override

```css
@media (max-width: 600px) {
  .fleet-callout { display: none !important; }
}
```

**Rationale:** Combat is desktop-only. The existing mobile media query already hides `.wave-announce` and all combat HUD elements. Fleet callout follows the same pattern.

---

## Animation / Timing Contract

| Event | Animation | Duration | Easing | Delay |
|-------|-----------|----------|--------|-------|
| Fleet callout appear | `fleetCallout` keyframes (scale 0.8 -> 1.02 -> 1.0, opacity 0 -> 1 -> 0) | 3s | ease-in-out | 0s / 1.2s / 2.4s per slot |
| Chevron rotation | CSS `transition: transform 0.3s ease` | 0.3s | ease | none |
| Callout cleanup | `animationend` event removes `.visible` class | instant | n/a | fires at 3s |

### Sequencing with Wave Announcement

| Time | Event |
|------|-------|
| t=0.0s | Wave breather phase starts. `showWaveAnnouncement()` fires. "WAVE N" appears at `top: 30%`. |
| t=3.0s | Wave announcement fades out. Breather phase ends. `spawnWave()` fires. |
| t=3.0s | Fleet 1 callout appears at `top: 38%`. `showFleetCallout()` called for first fleet. |
| t=4.2s | Fleet 2 callout appears at `top: calc(38% + 32px)`. |
| t=5.4s | Fleet 3 callout appears at `top: calc(38% + 64px)`. |
| t=6.0s | Fleet 1 callout fades out. |
| t=7.2s | Fleet 2 callout fades out. |
| t=8.4s | Fleet 3 callout fades out. All callouts complete. |

**Key constraint:** Fleet callouts start AFTER wave announcement completes (t=3.0s), avoiding the overlap pitfall identified in 13-RESEARCH.md Pitfall 3.

---

## Interaction Contract

### Fleet Callout

| Interaction | Behavior |
|-------------|----------|
| Pointer events | `pointer-events: none` -- callouts are non-interactive |
| Hover | None |
| Click | None (passthrough to canvas) |
| Keyboard | None |
| Screen reader | Not applicable (game canvas context) |

### z-index Layer

| Layer | z-index | Elements |
|-------|---------|----------|
| Canvas | 1 | `#canvas` (WebGL renderer) |
| HUD overlay | 10 | `.hud-overlay` |
| Damage vignette | 15 | `.damage-vignette` |
| Planet labels / HUD elements | 25 | `.planet-label`, `.hud-readout`, `.enemy-indicator`, `.tac-marker` |
| Combat HUD bar | 26 | `.combat-hud-bar` |
| Announcements | 28 | `.wave-announce`, `.fleet-callout` |
| Game over | 30 | `.game-over-screen` |

Fleet callouts sit at z-index 28, sharing the announcement layer with `.wave-announce`. This is correct because they never overlap temporally (sequencing contract above).

---

## Canvas Rendering Contract

Fleet role differentiation in the 3D canvas is achieved entirely through existing archetype rendering. No new canvas drawing code is needed for visual role differentiation.

| Property | Anchor Role | Screen Role | Striker Role |
|----------|------------|-------------|--------------|
| Enemy types | Capital (16.0x), Bomber (1.3x) | Grunt (1.0x), Swarm (1.0x) | Sniper (1.2x), Bomber (1.3x) |
| Spawn arc width | 0 radians (center point) | +/-0.5 radians (~30 deg) | +/-1.0 radians (~57 deg) |
| Visual cluster impression | Single large ship at cluster center | Dense cluster of small ships around center | Sparse flanking ships at wider angles |
| Billboard size (distant LOD) | 8.0px (Capital) / 4.0px (Bomber) | 3.0px (Grunt) / 2.5px (Swarm) | 3.5px (Sniper) / 4.0px (Bomber) |

**No new rendering required.** The existing enemy rendering pipeline (full geometry at close range, billboard at distance, skip when far) already differentiates archetypes visually. The fleet system creates spatial grouping that makes these existing differences readable as a coordinated unit.

---

## Registry Safety

N/A -- no package manager. Pure HTML/CSS/JS project with no dependencies.

---

## Checker Sign-Off

| Dimension | Status | Notes |
|-----------|--------|-------|
| Spacing | [ ] | 8-point grid, 6 tokens defined, HUD positioning specified |
| Typography | [ ] | 2 sizes (14px callout, 10px bearing), 2 weights (600, 700) |
| Color | [ ] | 2 callout colors (warning orange, danger red), 0 new palette entries |
| Copywriting | [ ] | 4 fleet callout strings, multi-fleet sequencing, edge states |
| Animation | [ ] | 1 keyframe animation (3s), 1 transition (0.3s chevron), timing sequence |
| Registry | [x] | N/A -- no package manager |
