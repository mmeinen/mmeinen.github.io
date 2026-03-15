# Phase 2: Player Ship & Orbital Movement - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Player commands a visible ship that transfers between any orbital body (black hole, all 7 planets, Lagrange points L1-L5) using auto-computed transfer orbits with trajectory preview. Full control over thrust level during transit and orbit altitude once captured. Ship gets a capital-class visual upgrade.

</domain>

<decisions>
## Implementation Decisions

### Orbit selection & targeting
- Click on body directly in 3D view to select as orbit target (reuses existing ray-sphere hover detection)
- No radial menu or keyboard list — spatial clicking only
- Black hole is a valid orbit target (dangerous close orbit, tactically interesting)
- Selected body gets a glowing orbit ring highlight + predicted transfer trajectory (dotted curve) appears instantly from ship to target
- Lagrange points shown as markers toggled with a hotkey (hidden by default to keep scene clean)
- L-points are clickable targets when visible

### Transfer orbit mechanics
- Auto-computed burn: click target → ship computes transfer trajectory → rotates to burn angle → fires engine automatically
- Player controls thrust level during transfer (thrust slider, faster/slower transit)
- Auto-circularize on arrival: ship automatically enters circular orbit at default altitude when reaching target's sphere of influence
- Click new target anytime mid-transfer to retarget — previous transfer is abandoned, new trajectory computed immediately
- Bullet time and fast forward both active during transfers (slow for precision, fast to skip long coasts)

### Ship visual identity
- Capital ship class — same size as enemy Capital archetype, distinctly larger than Grunt/Swarm/etc.
- Distinct visual style from all enemy ships — not angular/sharp like enemies. Smoother, sleeker silhouette that's instantly recognizable as the player
- Blue hull color matching HUD theme (rgba(60,140,255)) — consistent with scene's visual language
- Glowing engine points at the rear that intensify during thrust (no exhaust trail)
- No prograde/retrograde markers — auto-burn handles orientation, trajectory line shows direction
- Ships face direction of orbital travel (carried forward from Phase 1 decision)

### Orbit altitude control
- Up/down arrow keys to raise/lower orbit altitude once captured around a body
- Smooth continuous adjustment — hold key for gradual altitude change, release to stop
- Natural limits: lower too far → crash into body; raise too far → escape orbit (enter free flight). No artificial clamping
- Altitude readout displayed on HUD as a number (distance from body surface), alongside existing speed/position readout

### Claude's Discretion
- Exact transfer orbit computation (Hohmann-like, Lambert solver, or simplified approach)
- Lagrange point calculation method and which L-points to include per body pair
- Sphere of influence radii for each body
- Default capture orbit altitude
- Ship geometry design (tri count, exact shape — must read as "capital ship" and be distinct from enemies)
- Orbit ring rendering style
- Hotkey choice for L-point toggle
- Altitude change rate and key repeat behavior

</decisions>

<specifics>
## Specific Ideas

- Player ship is a capital ship — should feel commanding and large compared to enemy fighters
- Ship style should be visually distinct from enemy angular/sharp aesthetic — smoother, sleeker, recognizable at a glance
- Auto-burn approach means movement is strategic (pick destination) not twitch (aim and thrust). Fits the tactical sim vision from PROJECT.md
- Natural orbit limits (crash/escape) over artificial clamping — consequences make it feel physically real
- L-point hotkey toggle keeps the scene clean while allowing advanced players to use strategic positions

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeGravAccel()` (nav.js:42-60): Full N-body gravity (BH + 7 planets) — reuse for transfer trajectory computation
- `computeGravAccelAtTime()` (nav.js:62-76): Gravity at arbitrary future time — essential for trajectory prediction
- `simulateTrajectory()` (nav.js:78-100): 100-step leapfrog trajectory preview — extend for transfer orbit preview
- `planetPosAtTime()` (nav.js:37-40): Analytical planet position at any time — needed for intercept computation
- Ray-sphere hover detection (index.html): Already detects planet hover — extend to select orbit target
- `shipPg` shader program: Current ship rendering pipeline — replace geometry, keep shader pattern
- `createBoxGeometry()` (math.js:56-73): Procedural geometry builder — pattern to follow for new ship geometry

### Established Patterns
- Leapfrog integration for ship physics (nav.js:194-219) — same integrator for transfer burns
- Ecliptic plane lock (Y=0) — all orbital mechanics stay in 2D plane
- Planet orbit scaling in nav mode (oR doubled, sp adjusted via Kepler) — L-points scale naturally with this
- Third-person spherical camera tracking ship (index.html:553-566) — works as-is for capital ship
- Bullet time (0.03x) and fast forward (0.5x) time scales already implemented

### Integration Points
- Ship state: `flyPos`, `flyVel`, `flyFwd` in nav.js — add orbit state (target body, transfer phase, captured flag)
- Render loop: ship draw at index.html:681-796 — replace geometry, add engine glow pass
- HUD elements: `.fly-hud-speed` readout — extend with altitude display
- Input handlers: index.html:318-390 — add click-to-target, up/down for altitude, L-point toggle hotkey
- Trajectory rendering: index.html:800-823 — extend for transfer trajectory (currently passive prediction only)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-player-ship-orbital-movement*
*Context gathered: 2026-03-09*
