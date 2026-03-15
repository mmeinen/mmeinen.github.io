# Phase 9: Tactical Targeting System - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Player can activate a tactical targeting overlay on the existing combat view to select enemy targets, assign weapons, preview engagements, and issue coordinated fire commands as salvos. The tactical system extends (does not replace) the existing missile lock-on system from Phase 4. Requirements: HUD-04, HUD-05, HUD-06.

</domain>

<decisions>
## Implementation Decisions

### Tactical view & camera
- Dedicated T key toggles tactical mode on/off
- Camera stays at the same zoom/distance as normal combat — no zoom change
- Player retains full pan/orbit camera control in tactical mode
- Tactical mode is a DOM overlay on the existing view, not a different camera position
- All enemies get labeled markers showing archetype abbreviation + distance (e.g., [G] 45u)
- Faint orbital range rings around the black hole for spatial reference
- Markers visible for all enemies (on-screen ones positioned over the enemy, off-screen ones not directly selectable)

### Target selection
- Click enemy markers to select individual targets
- Shift+click for multi-select (add to selection)
- Click a selected target to deselect it
- Click empty space to deselect all
- Maximum 6-8 selectable targets at once
- Off-screen enemies are NOT directly selectable — player must pan camera to bring them on-screen first
- Selected targets get a bright colored ring (archetype color) plus expanded info tag: type, HP, distance

### Weapon assignment
- Current weapon (selected via 1-4 keys or weapon box clicks) applies to clicked targets
- Mixed salvos supported: select kinetic, click enemies A/B/C → switch to missiles, click D/E → fire sends kinetic at A/B/C and missiles at D/E
- Extends the existing Phase 4 lock-on system (lock-on still works in normal combat mode)
- Each assigned target shows a weapon abbreviation badge (KIN, PLS, MSL, NUK) color-coded to match weapon box in bottom bar
- Trajectory preview shown for the currently highlighted/selected target only (not all at once)

### Fire command & aftermath
- Right-click fires all assigned weapons as a coordinated salvo (consistent with Phase 4's right-click-to-fire)
- Weapon cooldowns apply normally — targets whose assigned weapon is on cooldown fire when ready (staggered salvo)
- Targets waiting on cooldown show dimmed weapon badge with remaining seconds (e.g., [KIN 2.1s])
- After firing, tactical mode stays active — assignments clear (targets deselected), player can select new targets for another salvo
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

</decisions>

<specifics>
## Specific Ideas

- Tactical mode is NOT a zoomed-out overhead view — it's the same close-to-ship camera with a targeting overlay. The "tactical" feel comes from the information layer and coordinated fire, not a different perspective
- Enemy markers with [G], [B], [S], [C] type abbreviations + distance give quick enemy identification
- Weapon badge on targets (color-coded [KIN], [PLS], [MSL], [NUK]) gives at-a-glance salvo composition before firing
- Dimmed badge + countdown timer on cooldown targets tells a story: "these weapons are queued, wait for them or fire what's ready"
- Mixed salvos (different weapons at different targets) are the core tactical depth — plan a kinetic barrage on close enemies and missiles on distant ones in a single fire command
- Stay-in-tactical after firing enables rapid follow-up salvos without mode-switching overhead

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lockState` / `findLockTarget()` / `addLockTarget()` (missiles.js): Lock-on targeting system — tactical selection extends this pattern
- `lockReticleDivs[]` (index.html): DOM pool of 6 reticle elements — follow same pooling pattern for tactical markers
- Enemy indicator system (index.html): Off-screen chevrons with archetype colors — reuse color mapping and screen-edge clamping
- Screen projection function: `sx = baseWidth*0.5 + (dx*camR[0]+dy*camR[1]+dz*camR[2])/dp*1.8*mD` — used everywhere for 3D-to-DOM positioning
- `weaponCooldownEnd[4]` (weapons.js): Per-weapon cooldown tracking — use for dimmed badge timers
- `selectedWeapon` (weapons.js): Current weapon index 0-3 — drives which weapon badge is assigned on click
- `combatMode` boolean (weapons.js): Existing mode toggle — tactical mode adds a third state or overlays on combat mode
- `simulateTrajectory()` (nav.js): Trajectory prediction — reuse for selected target preview

### Established Patterns
- DOM overlay for HUD elements (planet labels, lock reticles, indicators) with absolute positioning
- Blue HUD theme `rgba(60,140,255,*)` for borders, text, active states
- SoA enemy store with 64 max slots (combat.js) — iterate for marker generation
- Per-frame `bufferSubData` updates for dynamic rendering
- CSS class toggling for mode-dependent visibility (`.nav-active`)
- Archetype color array for enemy type visual distinction (5 colors)

### Integration Points
- Input handlers (index.html): T key for tactical toggle, click handling changes in tactical mode, right-click fires salvo
- Render loop HUD update section: Update marker positions, selection state, weapon badges each frame
- `enterNavMode()` / `exitNavMode()` (nav.js): Tactical mode disabled when not in nav mode
- Bottom bar (Phase 8): Stays visible in tactical mode, weapon boxes still functional for weapon selection
- `resetCombat()`: Clear tactical state on restart

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-tactical-targeting-system*
*Context gathered: 2026-03-14*
