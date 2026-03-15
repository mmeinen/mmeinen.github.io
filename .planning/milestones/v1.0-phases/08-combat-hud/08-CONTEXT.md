# Phase 8: Combat HUD - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Unified bottom-bar HUD providing full situational awareness — weapon readiness for all 4 weapons, persistent wave/enemy counter, hull integrity bar, orbit info, and a clickable mode toggle. Consolidates the existing scattered nav HUD elements (speed, altitude, body name) into the bottom bar. Requirements: HUD-01, HUD-02, HUD-03, HUD-07.

</domain>

<decisions>
## Implementation Decisions

### HUD layout
- Single unified bottom bar (~60-70px tall) across the full screen width
- All existing top-area nav HUD elements (speed, altitude, body name) consolidate into the bottom bar — top of screen becomes completely clear
- FPS counter stays as a small standalone overlay in the top-right corner (not part of the bar)
- Spin/range debug readouts can be dropped from the HUD entirely
- Bottom bar is always visible whenever nav mode is active (both navigation and combat mode) — no show/hide toggling
- Layout order left-to-right: [weapons] [HP bar] [wave counter] [orbit info] [mode toggle]

### Weapon status panel
- 4 numbered boxes in a horizontal row on the left side of the bottom bar
- Each box shows: number key [1]-[4], weapon abbreviation (KIN, PLS, MSL, NUK)
- Cooldown fill bar inside each box — fills to show ready, empties during cooldown with remaining seconds shown
- Selected weapon has bright blue border highlight
- For missile weapons (slots 3 & 4): box also shows current lock count (e.g., "3/6 LOCKS") when that weapon is selected
- Weapon boxes are clickable to select weapons (in addition to 1-2-3-4 keys)
- Weapons always shown at full brightness regardless of nav/combat mode — no dimming

### Wave & enemy counter
- Format: "WAVE 5 · 12 ENEMIES" — single line with dot separator
- Positioned in the right section of the bottom bar
- Enemy count updates live in real-time as enemies are killed (ticks down)
- No special boss wave styling on the counter — wave announcement flash handles boss drama
- On wave clear: counter jumps immediately to next wave number (no "WAVE CLEAR" state, no countdown)

### Hull integrity bar
- Stays at bottom center of the bar (existing position, integrated into the new bar layout)
- Existing 3-color threshold preserved: blue >50%, orange 25-50%, red <25%
- HP text value displayed alongside the bar

### Orbit info display
- Format: "BODY · ALTu · STATE" — e.g., "JUPITER · 38u · ORBITING" or "SATURN · 52u · TRANSFER"
- During transfer: shows destination body (where you're heading), not origin
- Positioned between wave counter and mode toggle in the bottom bar

### Mode toggle button
- Text button reading "NAV" or "COMBAT" at the far right edge of the bottom bar
- Clickable to toggle between navigation and combat mode (supplements F key)
- Text changes to reflect current mode

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

</decisions>

<specifics>
## Specific Ideas

- The bottom bar is the single source of truth for all game state — player should never need to look elsewhere except the viewport itself
- Weapon boxes with cooldown fill bars give at-a-glance weapon readiness without reading text
- Making everything always visible (no combat-only hiding) means the player always knows their state
- Clickable weapon boxes and mode toggle make the HUD interactive, not just a display — mouse-driven players can use it instead of keyboard shortcuts
- FPS counter stays in the corner as a diagnostic, separate from the game HUD

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hp-bar-container` (index.html): Existing HP bar DOM element — reposition into bottom bar
- `weapon-indicator` (index.html): Current weapon text display — replace with 4-box panel
- `combat-mode-indicator` (index.html): "COMBAT" label — replace with mode toggle button
- `fly-hud-altitude` (index.html): Altitude/body readout — migrate content into orbit info section
- `fly-hud-speed` (index.html): Speed readout — migrate into bar or drop
- `wave-announce` (index.html): Wave flash announcement — keep as overlay, add persistent counter
- `weaponCooldownEnd[4]` (weapons.js): Per-weapon cooldown array — use for cooldown fill calculations
- `selectedWeapon` (weapons.js): Current weapon index — use for highlight state
- `combatMode` (weapons.js): Boolean mode flag — wire to toggle button
- `waveNumber`, `waveState` (waves.js): Wave state — feed persistent counter
- `enemyCount` (combat.js): Live enemy count — feed enemy counter
- `orbitState`, `orbitBody`, `orbitAltitude`, `transferTarget` (nav.js): Orbit state — feed orbit info display
- `playerState.hp` (index.html): Hull HP — already wired to HP bar

### Established Patterns
- DOM overlay for HUD elements (planet labels, lock reticles, indicators) — follow for bottom bar
- Blue HUD theme `rgba(60,140,255,*)` for borders, text, active states
- Warning color `rgba(255,160,80,*)` for low HP, cooldown states
- CSS transitions for smooth state changes (existing `.wave-announce` fade)
- HUD z-index 10, planet labels z-index 25 — bottom bar should be z-index 10+

### Integration Points
- Render loop HUD update section (index.html ~line 1640-1708): Update weapon boxes, wave counter, orbit info each frame
- `combatMode` toggle (weapons.js): Wire mode toggle button click to existing toggle logic
- `selectWeapon()` (weapons.js): Wire weapon box clicks to existing weapon selection
- `enterNavMode()` / `exitNavMode()` (nav.js): Show/hide bottom bar on nav mode entry/exit
- `resetCombat()` (nav.js): Reset HUD state on restart

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-combat-hud*
*Context gathered: 2026-03-13*
