# Phase 3: Direct-Fire Weapons - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Player can engage enemies with two distinct direct-fire weapons — a gravity-affected kinetic cannon and a light-speed plasma gun — and preview trajectories before firing. Hit detection registers impacts (damage numbers applied in Phase 6). Requirements: WPN-01, WPN-02, WPN-03, WPN-04, WPN-11.

</domain>

<decisions>
## Implementation Decisions

### Aiming & firing controls
- Crosshair aiming: mouse controls a crosshair on the orbital plane, weapons fire toward where crosshair points (reuse computeAimDir() ray-cast)
- Left-click to fire the currently selected weapon
- Number keys to select weapon: 1 = kinetic cannon, 2 = plasma gun (extends to 3/4 for missiles in Phase 4)
- Combat mode toggle (e.g., 'F' or 'Enter') switches between navigation mode (click = orbit transfer) and combat mode (click = fire weapon). Clear separation prevents accidental transfers mid-fight

### Projectile visuals
- Kinetic cannon: bright tracer slug — small fast-moving point with short fading trail. White/yellow color (255,240,180). Think anti-aircraft tracer fire
- Plasma gun: glowing energy bolt — larger than kinetic, bright core with soft outer glow that fades + shrinks over distance showing energy dissipation. Cyan/electric blue color (0,220,255) with white-hot core
- Both weapon types are visually distinct from each other, from enemy archetype colors, and from the player's blue HUD

### Trajectory preview
- Always visible in combat mode — trajectory line follows crosshair in real-time for the currently selected weapon
- Distinct preview per weapon: kinetic preview shows curved dotted line with gravity deflection (white/yellow dots); plasma preview shows straighter line with fade-out at max range (cyan dots shrinking)
- Preview extends full projectile lifetime — kinetic shows entire arc until despawn, plasma shows line until fade-out range
- Hit prediction: if trajectory passes through an enemy's collision radius, show a bright marker at that point confirming the shot will connect

### Firing cadence & ammunition
- Kinetic cannon: semi-auto with cooldown. Each click fires a volley of 5 kinetic rounds in rapid succession (~0.05s apart), same firing direction (sequential burst, not cone spread). Short cooldown between volleys
- Plasma gun: single powerful bolt per click with longer cooldown (~2-3s). Opposite rhythm to kinetic — fewer shots, each one counts
- Unlimited ammo with cooldowns only — no ammo count. WPN-12/13 (cooldown timers, ammo limits) are explicitly v2 scope

### Claude's Discretion
- Exact cooldown durations (tune for gameplay feel)
- Kinetic projectile speed and lifetime
- Plasma bolt speed, fade distance, and effective range
- Combat mode toggle key choice
- Crosshair visual style
- Projectile trail length and fade rate
- Hit prediction marker visual style
- Projectile entity storage structure (extend missiles.js or new module)
- GL rendering approach for projectiles (instanced points, quads, etc.)

</decisions>

<specifics>
## Specific Ideas

- Kinetic 5-round volley should look dramatic: a stream of bright tracers curving through gravity wells in sequence
- Plasma bolt should feel weighty and impactful despite being energy — big, bright, satisfying
- The two weapons should feel completely different in rhythm: rapid volley burst (kinetic) vs deliberate single shot (plasma)
- Trajectory preview with hit prediction gives the tactical "plan your shot" feel from PROJECT.md
- Combat mode toggle is important — clear separation between "navigate to position" and "engage enemies"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeAimDir()` (nav.js): Mouse-to-ecliptic-plane ray cast — direct reuse for crosshair aiming
- `computeGravAccel()` / `computeGravAccelAtTime()` (nav.js): Gravity computation for kinetic projectile physics and trajectory preview
- `simulateTrajectory()` (nav.js): Up to 100-step trajectory prediction with thrust support — reuse for weapon trajectory preview
- Missile trail buffer pattern (missiles.js): 60-point trail with head index — reuse for kinetic tracer trails
- `trajPg` shader (shaders.js): GL_POINTS trajectory rendering with circular point discard — reuse for trajectory preview dots
- Radial bin collision (combat.js): `getCollisionCandidates(r)` for O(1) hit detection

### Established Patterns
- SoA entity storage with free-list allocation (combat.js) — follow for projectile storage
- Instanced rendering via ANGLE_instanced_arrays — use for multiple projectiles in flight
- Leapfrog integration for gravity-affected physics (nav.js, missiles.js)
- Ecliptic plane lock (Y=0) for all projectile physics
- Bullet time (0.03x) and fast forward (0.5x) affect all physics

### Integration Points
- Input handlers (index.html): Add combat mode toggle, weapon selection keys, left-click fire
- Render loop: projectiles render after enemies, before HUD
- Physics update: projectile updates alongside missile updates in the sim tick
- Collision: extend rebinEntities() or add separate projectile-vs-enemy check using radial bins

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-direct-fire-weapons*
*Context gathered: 2026-03-10*
