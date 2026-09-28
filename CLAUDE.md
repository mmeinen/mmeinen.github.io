# CLAUDE.md - Project Context for Claude Code

## Project Overview
Static GitHub Pages personal site at `https://mmeinen.github.io/`. The landing page is a spaceship's flight deck in
orbit around the ocean world MILLER, which itself orbits the supermassive black hole Gargantua; the family's games
are launched from the ship's crew manifest. No build tools, no npm, no framework — pure HTML/CSS/JS.

## Deployment
- **Method**: GitHub Pages, auto-deployed from `master` branch
- **URL**: https://mmeinen.github.io/
- Push to `master` = live deploy. Be careful with commits.

## Directory Structure
```
/                         Root (GitHub Pages serves from here)
├── index.html            Landing page: flight deck HUD + crew manifest (the game menu, plain links)
├── css/hud.css           Landing page styles (canopy, HUD panels, reticles, boot, jump, phone dock)
├── css/style.css         Game page styles (pong, minesweeper, the shared #canvas rule)
├── tests.html            Regression tests (landing page invariants + Pong); needs a server or file-access flag
├── js/scene/             Landing page renderer, classic scripts in this load order:
│   ├── gl.js             WebGL2 context, program/target helpers, V/M3 maths
│   ├── kerr.js           Kerr black-hole maths (pure): ZAMO camera, analytic shadow, critical curve, reference tracer
│   ├── gargantua.js      the black hole: Kerr bake (tile scheduler) + per-frame shading (demo's helpers, verbatim)
│   ├── planet.js         MILLER + moon: deferred terrain/clouds/atmosphere (shaders = demo's, verbatim)
│   ├── post.js           bloom, tone map, FXAA upscale + grain + launch warp
│   ├── orbit.js          system model, the station (scripted) orbit, camera framing, telemetry (no GL)
│   ├── flight.js         the HELM: fly the ship round MILLER (orbit assist, rails, autopilot, chase/cockpit cams)
│   ├── ships.js          the player's MSV MEINEN + friendly flybys (mesh builder + shaders = demo's, verbatim)
│   └── main.js           boot, frame loop, adaptive render scale, input
├── js/hud.js             HUD behaviour: menu, telemetry, reticles, tape, plot, log, boot, jump, audio
├── minesweeper.html      Minesweeper game (uses js/*.js)
├── pong.html             Pong game (uses js/pong.js)
├── js/                   Game JS files
│   ├── game.js, board.js, tile.js, bomb.js, Renderer.js  (Minesweeper)
│   └── md5-min.js
├── pool/                 "Pool Splash Lab" — 2D FLIP fluid sim (self-contained)
│   └── index.html        Solver + body coupling + optimiser + renderer, one file
├── demo/                 "COLLIDE" — a self-playing real-time film, WebGL2 (Dad's "Demo" menu entry)
│   ├── index.html        Markup, CSS, script tags (classic scripts: they load from file://)
│   └── js/               core, post, galaxy, deep, gargantua, ships, battle, film, main (load order)
├── edmund_game/          "Nugget Invasion" (self-contained game)
│   ├── index.html, game.js, style.css
├── beatrix_game/         "Jumping Axolotl Nuggets" (self-contained game)
│   ├── index.html, game.js
└── images/               Sprite sheets and backgrounds
```

## Architecture Patterns
- **Landing page**: WebGL2 scene (`js/scene/*`) behind a DOM/SVG HUD (`js/hud.js`, `css/hud.css`). The menu is
  static HTML — five `<details>` crew members, each a list of `<a class="mission">` links — so it works with no
  JavaScript and no WebGL (the page falls back to a painted backdrop: `body.nogl`, forced with `?nogl`).
- **Games**: Each game is a standalone HTML file or subdirectory with its own index.html. Self-contained with minimal code reuse.
- **Styling**: Space/sci-fi HUD theme. Blue palette (`rgba(60,140,255,*)`) on dark backgrounds.
- **No shared JS framework** — each game implements its own logic.

## Key Conventions
- All pages link back to `index.html`
- Game pages use `<canvas>` elements
- Color scheme: `rgba(60,140,255,*)` for blue HUD, `rgba(255,160,80,*)` for warnings
- Landing page layers: `#scene` canvas 1, `#canopy` 4, `#reticle` 8, `#hud` 10, `#boot` 50, `#jump` 60

## Adding a Game Link
Add `<li><a class="mission" href="…"><span class="mt">Title</span><span class="mc">M·NN</span></a></li>` to the crew
member's `<ul class="missions">` in `index.html`, and bump the `.cnt` in their `<summary>`. Add the href to the
`GAMES` list in `tests.html` so the "every game is in the crew manifest" check keeps guarding it.

## Landing page renderer (`js/scene/`, Sep 2026)
A lean port of the demo's Gargantua + planet pipeline (see "COLLIDE" below for how those work). **Shared shader
strings are the demo's, verbatim** — `tests.html` fails if `BH_COMMON`, `FS_BH_SHADE` or `FS_SYS_*` differ from
`demo/js/*`, so a fix in one copy is mirrored in the other. The split (documented in that test): the landing page's
hole SPINS, so its geometry pass is its own `FS_KERR_GEOM`, and its shading splices a Kerr `main()` (plus `discImageK`)
after `FS_BH_SHADE`'s helpers at program creation; the demo stays Schwarzschild.
- **Kerr Gargantua (Sep 2026, user request: "the rotation of the black hole changes the lensing and the disc")**:
  `kerr.js` is the maths, float64, and each GLSL loop has a JS twin there (tests.html checks it: a = 0 limits, 6.481°
  shadow from 45 M, critical curve on the edge, handedness). Rays run backward in Mino time in **u = 1/r** (in r the far
  field drifts and rays inside the shadow escape) and angularly as a **unit vector N on the sphere** (θ/φ has an
  L/sin²θ spike that drew a bead chain along the spin axis). The camera is a ZAMO (shadow 6.48° at a = 0, not the old
  6.63°). The shadow is analytic per pixel: 2 Newton steps on min R(r) along its gradient in (L, p_θ). The disc's flux
  follows its inner edge (r_in = r₊ + 0.65(ISCO − r₊)); dust lanes stay at fixed radii. Crossings are stored with the
  BL azimuth so the turbulence flows WITH the gas (the demo's advects against its own Doppler beaming — not fixed there).
- **Spin director + tile scheduler**: the spin eases along `SPIN_PLAN` (moves in ISCO space, holds between; `[` `]`
  nudge). The cube is 8×8 tiles/face; a tile is stale past half a texel (|Δa| > b²/5200 for its closest impact parameter)
  or 0.02 M of camera drift; `bhUpdate` bakes the stalest inside ~1.2 ms of GPU (timer-query calibrated). Tiles with
  b < 10 M re-bake every spin step and the analytic spin glides across the step as they land, so nothing seams. The
  scheduler must NOT hold `rsSettle` (it froze the render-scale controller). A full 1024² Kerr bake = 75 ms GPU (Intel).
- **The HELM (`flight.js`)**: STATION (scripted, hole always framed) / HELM / AUTO (blends home; also after 150 s idle).
  Orbit assist drives v → v_circ(p) + v_cmd, so letting go settles a circular orbit; speed ∝ altitude; floor 50 km
  (soft 70, plasma < 84), ceiling 120,000 km braked from 80%. Real-time dt for the ship (the jump warps only the world).
  Chase cam: offset in the ship's lagged frame (a world-space lag trails km behind). The ship pass renders into a target
  the size of the ships' screen rect; the player's hull is never drawn from inside (cockpit). Flybys live in MILLER's
  frame. Hooks: `SCENE.helm()`, `SCENE.input({...})`, `SCENE.setSpin(a)`; tests.html flies the model in a sandbox.
- Headless harness: emulate a desktop `screen` (CDP `screenWidth/screenHeight`), or the page takes its phone path
  (`SMALL`: 512² cube, renderScale 0.6) and every measurement is off.
- **World**: metres (float64), hole at the origin, disc in xz, M = 1 (`-3 h² x / r⁵`, never the r_s = 1 `-1.5`
  form). MILLER orbits at 45 M, 4° above the disc, at its real Schwarzschild rate × the time warp (`ORB.TC` 12).
- **The ship** flies a circular **dawn–dusk orbit** (plane kept ⟂ to the hole, tilted β 8°): the hole never sets
  (`orbitCheck()` asserts β < limb dip − 5° at the lowest altitude). Over an orbit the disc rolls level → upright
  ("keyhole") → level. Framing (`orbitStep`): the limb 30% below centre, the hole ≥ 9° under the top edge, the
  vertical FOV widening when both don't fit; drag = look-around clamped so the hole stays on screen.
- **Bake**: lensing geometry is baked at MILLER (4 cube MRTs; 1024² desktop, 512² phones). The disc is
  axisymmetric, so shading rotates by the planet's *current* azimuth; the tile scheduler (above) re-bakes what the
  spin or the camera's drift (> 0.02 M, MILLER's inclined orbit, ~20 min) has made stale.
- **Frame**: `bhShade` → `comp` (the sky) → `systemPass` (base hit pass + scissored terran/rock passes + clouds &
  atmosphere) → optional `flyRender` (MSAA ship pass, only while a formation is on screen) → `postProcess`
  (bloom + tone map at render scale, then FXAA/grain/warp to the canvas).
- **MILLER I** is art-directed: it transits in front of the hole every 5 min (first at 45 s) — the dark silhouette
  from `black_hole.jpg`. Flybys (`ships.js`) co-move with the ship: positions are relative to the *current* eye,
  because in the hole's frame MILLER moves at 0.15 c.
- An early-out for sky pixels behind the planet was tried and measured no faster (A/B, one page): don't redo it.
- Cost on the Intel UHD (headless, 1600×900, full scale): ~9 ms at 1,500 km, ~13–17 ms at 700 km; the planet
  passes dominate at low orbit. Headless timings drift ±2× with machine load — A/B within one page load only.

## Adaptive render scale (owned by JS)
The heavy passes render at `renderScale`; the FXAA pass resolves them up to the canvas (`updateRenderScale` in
`js/scene/main.js`, enforced by `tests.html`). The controller was built for the old WASM landing page, whose rule
(×1.05 below 20 ms, ×0.85 above 28 ms) could never hold under vsync — a frame costs one refresh or two — and pumped
the resolution across its range about once a second.

Rules for the controller:
- **Count missed refreshes, not milliseconds.** Any absolute ms target is unreachable on the
  vsync grid. `vsyncMs` tracks the observed period; a miss is `ft > vsyncMs*1.75`, with an
  absolute `ft > 30` arm in case the estimate latches onto a multiple of the true refresh.
- **Latch a ceiling and park under it** (`rsCeiling`) so the steady state is "change nothing".
  A controller with no memory of what was too heavy must keep re-probing, which pumps.
- **Ignore frames right after a change** (`rsSettle`). A change calls `resize()`, which reallocs
  the offscreen targets and makes that frame slow — counting it drove the old loop to the floor.
- Re-measure only on window resize or a >25% change of altitude/zoom (`viewKey`); at idle nothing may move.
- Don't lower the 0.35 floor — the user rejected sub-floor scaling (see memory).
- Headless Chrome renders unsynced, so it settles far lower than a real vsync display: pin the scale
  (`SCENE.setScale`) for screenshots and benchmarks.

## COLLIDE galaxy demo (`demo/`)
**It is a film now** (Sep 25 2026): gate -> galaxies collide -> plunge into the merged core -> the APPROACH
(12 s fall from 2500 M to the battle's first shot, lensing traced live each frame: `bhShadeFree`, half-res
geometry; `bhSky` switches to the baked cube within 0.05 M of the bake point) -> fleets fight over MILLER
(input grabs an orbit camera, `BATTLE.manual`; scripted shots return after 8 s idle) -> follow a wreck
down to the surface -> "EVERYTHING COLLIDES" -> loop. `BATTLE.hold` keeps the fleet frozen while we arrive.
`js/film.js` owns the acts (`startAct`, `nextAct`, beats keyed to sim time / `BATTLE.t`), captions, the
letterbox (`aspect(2.39|1.9)`), manual takeover (any input; 30 s idle resumes) and the synthesized `Score`.
The old control panels still exist but are hidden by `body.playing` CSS — their bindings are live.
Dev views: `?scene=bh | planet | ships | battle`, `?gate=0` skips the gate. Hooks: `COLLIDE.startAct`,
`nextAct`, `battleRun(sec)`, `FILM`, `BATTLE`. Scripts share one global scope: boot code only in main.js.
- **Gargantua** (`gargantua.js`): units M = 1, force `-3 h^2 x / r^5` (the landing page's `-1.5` is the same
  law in r_s = 1 units — mixing them offsets the ring). Geodesics are BAKED once (RK4, ~0.25 s) into four
  cube MRTs around the planet (escape-direction delta + haze, two disc crossings stored PREMULTIPLIED by the
  disc-edge weight, bend cosines); the camera moves ~1e-5 M in a scene so the bake is exact. The shadow and
  photon ring are ANALYTIC from the impact parameter (a filtered 0/1 capture flag draws scalloped edges).
  Crossings from rays that wound round the hole, and filtered coordinates that jump between images, are
  faded — both drew speckles/lines. `rotY` convention: world = rotY(bake, -az). Spin is 0 (the weak-field
  Lense-Thirring term is wrong in the strong field).
- **Black-hole system**: `makeBHSystem()` (body 0 = hole, R 0, never shaded as a sphere), `cam.free`
  {eye (m), r,u,f} in `updateCamera`, `u_lightCol` warms the planet shaders, no star glare; render branch
  `deep.focus>0 && deep.sys.bh` draws the lensed hole into `tg.comp` as the planet pass's sky.
- **Battle** (`ships.js`, `battle.js`): procedural kitbashed meshes (faces orient away from a ref point —
  mirrored greebles otherwise light inside out), instanced into a 4x MSAA RGBA16F target whose depth is
  primed from the planet hit buffer `tg.gb`, with LOG depth (`logDepth`, 0.1 m .. 1e8 km). Arena frame in
  km (`arenaSetup/arenaCamera/orient`). Effects are premultiplied (glow alpha 0, smoke alpha > 0) and every
  sprite must fade to zero inside its quad. Heroes carry `armor` (hp floor): only the script kills them.
- **Supernovae / quasar**: flash light goes to the dust target's spare `.gba` channels (so dust cannot eat
  it) and is disabled whenever `holeC` is set (deep zoom and the cube bake must never freeze a flash).
  `trackEvents` counts a passage only after a real apocentre (> 2 units) and calls a merger when the
  apocentre stays under 1 — the old rule spammed ~76 passages and merged ~800 Myr late.
- Perf (Intel UHD headless, 1600x900): galaxy view is fill-bound by gas sprites (22 ms at 18 units, 55 ms at
  13) — the film keeps >= 18 units and caps gas sprites when close; Gargantua + planet ~12 ms; battle ~16 ms.

Restricted N-body (Toomre & Toomre 1972). Up to 4 galaxy CORES (Plummer spheres carrying the whole
galaxy mass) integrate on the CPU with mutual gravity plus a momentum-conserving dynamical-friction
drag (`FRICTION`, tuned so equal-mass pairs make 2-3 passages before merging). Up to 2M stars/gas are
test particles on the GPU that feel only the cores plus the Shift black hole. Units: G=1, 1e11 Msun,
3.5 kpc, so 1 time unit = 9.78 Myr and 1 velocity unit = 350 km/s.
- Particle state: two RGBA32F textures (pos.xyz + gas tidal average, vel.xyz + starburst heat/-1 dead),
  ping-ponged via MRT. The colour seed is an integer hash of `gl_VertexID`, NOT stored.
- Texture rows are split into 4 SLOTS (`slotStart`/`slotRows`), one per galaxy. A particle's type
  (disc / bulge / gas / young) is its fractional index in its slot — the `T_DISC/T_BULGE/T_GAS`
  thresholds must match between `genGalaxy()` and both shaders. Launching rewrites one slot only.
- The CPU cores step in lockstep with every GPU substep (`simStep`); never advance one without the other.
- Starbursts trigger on the tide RISING above its running average, not on its magnitude — a magnitude
  trigger saturates every gas particle permanently once two cores overlap.
- `window.COLLIDE` exposes `advance(t)`, `renderNow()` (PNG data URL), `heatStats()`, `flyTo(level)`,
  `finishFlight()`, `setRange(m)`, `bench(n)` (synced ms/frame) and `hdr(x,y)` (raw HDR pixel) for
  headless checks. `window.DBG` bit flags switch off atmosphere (1), clouds (2), terrain octaves >8 (4)
  and cloud shadows (8) for cost attribution.

**Deep zoom (galaxy -> star -> planet surface, ~19 decades).**
- Two frames, both float64 in JS: galaxy units and the STAR frame (metres, origin at the chosen star).
  The GPU only ever gets camera-relative values. Focus = 0 galaxy / 1 star / 2 planet; changing focus
  GLIDES the focus point (and blends the up vector), never the camera. Planet focus co-rotates with
  the planet. A body is selected only inside HALF its `releaseDist()`, so select/release can't
  alternate; flights never force a release, since the range is measured from the focus surface.
- Below galaxy scale the collision sim FREEZES. Inside `CUBE_R` (600 AU) the whole sky (1M particles +
  dust + 120K local stars) is baked once into a cubemap and no particles are drawn.
- The system renderer is DEFERRED on purpose: one monolithic shader throttled every pixel (register
  pressure: 23 ms for a sky-only view). The base pass writes a hit buffer (`tg.gb`, RGBA32F); one small
  program per material is scissored to that body's `sphereRect`; rings blend; the habitable world's
  clouds + atmosphere composite last (comp2 -> comp3). Give new materials their own pass.
- Noise hash: one uint multiply per AXIS plus a murmur3 finaliser (`HK`, `hf`). Intel iGPUs run 32-bit
  int multiplies at reduced rate; the naive per-corner hash cost ~2x. A 64^3 noise TEXTURE was tried
  and removed: its period tiles visibly and its 8-bit filter weights draw contour rims in clouds.
- The focus body's terrain samples around a split hi/lo ANCHOR (power-of-two frequencies make
  `aHi*f` exact), which keeps 22 octaves stable at 1 km. `|oc|^2-R^2` is precomputed in doubles.
- `terrainJ`/`noisedJ`/`hvJ` are a bit-exact JS port used to pick a sunlit, temperate, hilly landing
  spot. Any change to the GLSL terrain or hash MUST be mirrored there.
- Radiometry: ground radiance is albedo*1.7 (= E/pi), so the atmosphere's sun is 5.3. The final pass's
  asinh stretch goes linear near a planet, and exposure adapts to the star's apparent size.
- Seen from within ~340 ly of the star (and in the baked cube), every galaxy particle is drawn as a 1 px
  POINT star with a peak-capped 1/d^2 flux (`u_pointStars`); the band emerges from their density. No
  hard switches: between ~0.2 and ~0.03 galaxy units the sprites CROSSFADE into points (two weighted
  draws, `u_weight`), and the sprite cap and brightness ease from their galaxy-scale values. Point flux
  is resolution-independent, so the live view and the cube match at the 600 AU handover.
  Sprites of any size looked like fuzzy bokeh here, and a blurred glow cube was blocky, so neither is
  used. Local stars are drawn LIVE every frame (never baked) so they stay crisp at screen resolution.
  Farther out, sprites keep SURFACE brightness when they hit their size cap (`capK`).
- There are no look settings (exposure, bloom, dust, long exposure); the tuned values are fixed.

## Pool Splash Lab (`pool/index.html`)
Self-contained 2D FLIP/PIC fluid sim answering "which body shape makes the biggest splash".
Takeoff speed is locked, so entry speed is invariant across launch angles and only shape and
attitude vary. Score = peak potential energy of water lifted above the still line (J per metre).

**Body model.** Segment lengths follow Dempster/Winter anthropometry: 1.78 m tall, 0.365 m^2
sagittal silhouette, 359 kg per metre of pool width. `BODY_DEPTH` (0.206 m = real volume /
silhouette area) converts that to the 74 kg person shown in the HUD; it is a derived constant,
not a tuning knob. Mass goes as the cube of BODY SIZE.

**Water-entry physics.** Three terms, and all three are needed:
- **Drag** uses the TRUE silhouette shadow — the extent of the capsule endpoints perpendicular to
  the flow — shared out among capsules for torque. Summing a per-slab projected width instead
  double-counts, because slabs behind one another shadow each other: it over-damped a pencil dive
  6.3x and an ordinary feet-first jump 5.0x while leaving a belly flop at 0.94x, so calibrating
  CD against a belly flop baked the error in and nothing else could punch into the water.
- **Added mass** (`ADDED_MASS_K`) is what actually stops a flat entry. For a plate of width W the
  2D added mass is rho*pi*W^2/4 — for a belly flop that is ~7x the body's own inertia, for a
  pencil dive 0.17x. That W-squared scaling is why no single CD can fit both.
- **Momentum deposit** (`depositWake`) hands the water what drag and added mass take off the body.
  Without it the coupling leaks momentum: the body stops correctly but nothing pushes back on the
  pool and splash scores collapse to a quarter of their proper size.

Calibrated against real entry depths, not by eye — belly flop COM 0.33 m stopping in 0.10 s,
cannonball 0.96 m, pencil dive feet reaching the floor.

**Solver invariants**, each found by measurement and each of which silently destroys the sim when
violated. They are documented at their call sites — read those comments before touching the
solver:
- `uPrev` is snapshotted inside `solve()`, NOT in `toGrid()`. Snapshotting before the particle
  splat double-counts every force the particles carry and compounds geometrically.
- Submersion is measured against the still level, not the local surface, which the body's own
  cavity destroys within two frames of contact.
- Drag samples `ambientVel()` (a far-field ring), not adjacent cells. The boundary condition
  accelerates neighbouring water to the body's own speed, so local sampling zeroes the drag.
- Over-relaxation is 1.5. The textbook 1.9 diverges on this domain.
- Kinematic bodies (swimmers) get almost no entrainment and must turn via a continuous heading
  angle — a `+/-1` facing flag swaps capsule endpoints and reports omega ~ pi/dt.
- Swimmers stay at the far end (x0 7.85-9.85), clear of the diving zone; a jumper landing on one
  absorbs the impact and silently scores zero.

Invariant to check after any change: peak splash energy must stay below the jumper's kinetic
energy at entry, for every preset. That single check catches nearly all coupling regressions.

## Testing
No test framework. `tests.html` checks the landing page (every game still in the menu and resolving, file:// safety,
Kerr lensing maths via kerr.js, shader parity with demo/, lean base pass, the tile scheduler, render-scale controller, the
helm flown in a sandbox: settles, floor, ceiling, energy, autopilot) and Pong behaviour.
It fetches files, so it needs a local server or Chrome's `--allow-file-access-from-files` (the headless harness).
```bash
python3 -m http.server 8000
# Open http://localhost:8000/tests.html — all tests should show green/PASS
# Open index.html directly (file://) — visual check of the flight deck
```

## Subagents
- **code-reviewer** — Reviews diffs for bugs, shader invariant violations, and convention drift. Use after any non-trivial change. Read-only.

## Skills
- **/project-context [topic]** — Explores the codebase to answer questions about architecture, shader physics, or game implementations. Use for orientation.
- **/review-changes** — Reviews the current git changeset against project conventions and shader invariants. Use before committing.

## Working Guidelines
- Always use plan mode first for non-trivial changes.
- If an approach seems wrong or risks breaking shader invariants, push back and suggest alternatives rather than blindly implementing.
- If you discover an undocumented pattern or convention, suggest a CLAUDE.md or rule update.
- After major changes, run the code-reviewer agent and update project-context if architecture shifted.

## Compaction Priorities
When compacting, always preserve: the list of modified files, active shader constants and their interdependencies, the current implementation plan, any constraints or decisions made during the session, and the crew/game menu in index.html.
