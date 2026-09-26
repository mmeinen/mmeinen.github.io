# CLAUDE.md - Project Context for Claude Code

## Project Overview
Static GitHub Pages personal site at `https://mmeinen.github.io/`. Interactive WebGL black hole scene with clickable planets linking to browser games. No build tools, no npm, no framework — pure HTML/CSS/JS.

## Deployment
- **Method**: GitHub Pages, auto-deployed from `master` branch
- **URL**: https://mmeinen.github.io/
- Push to `master` = live deploy. Be careful with commits.

## Directory Structure
```
/                         Root (GitHub Pages serves from here)
├── index.html            Landing page (WebGL black hole + planet navigation)
├── css/style.css         Global styles (HUD, labels, animations, game pages)
├── tests.html            Lensing regression tests (shader invariant checks)
├── minesweeper.html      Minesweeper game (uses js/*.js)
├── pong.html             Pong game (uses js/pong.js)
├── js/                   Game JS files
│   ├── game.js, board.js, tile.js, bomb.js, Renderer.js  (Minesweeper)
│   ├── pong.js                                            (Pong)
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
- **Navigation**: WebGL black hole scene in `index.html`. 5 orbiting planets (one per family member) are clickable; clicking opens a game-selection submenu. Planet hover detection via CPU ray-sphere intersection; hover glow via `u_hoveredPlanet` shader uniform. HUD labels track planet screen positions.
- **Shader**: Fragment shader (`fsSource` in `js/scene/shaders.js`) implements gravitational lensing with Verlet integration. Key constants have physical dependencies — see `.claude/rules/shader-conventions.md`.
- **Games**: Each game is a standalone HTML file or subdirectory with its own index.html. Self-contained with minimal code reuse.
- **Styling**: Space/sci-fi HUD theme. Blue palette (`rgba(60,140,255,*)`) on dark backgrounds.
- **No shared JS framework** — each game implements its own logic.

## Key Conventions
- All pages link back to `index.html`
- Game pages use `<canvas>` elements
- Color scheme: `rgba(60,140,255,*)` for blue HUD, `rgba(255,160,80,*)` for warnings
- Canvas z-index 1, HUD overlay z-index 10, planet labels z-index 25

## Adding a New Planet/Game Link
1. Add entry to `planetData` array in `index.html` with `oR`, `ph`, `sp`, `radius`, `name`, `person`, `games:[{t,h}]`
2. Grow the `uniform vec4 u_planets[N]` array in the shader and its `for (int p = 0; p < N; p++)`
   loop, plus the `i < 5` planet loops in `index.html` (upload, labels, hover). Planets are ONE
   array uniform, not `u_planetN` scalars — see "Ray-march hot loop" below.
3. Add corresponding `.planet-label` div in HTML
4. Update planet check range `if (r > LOW && r < HIGH ...)` in shader to cover new orbit
5. Verify both escape thresholds (zone `r > 100.0`, convergence `r > 90.0`) still exceed new planet's `oR + radius`
6. `u_planetSlab` needs no edit — it is derived from `planetData` radii at upload time
7. Run `tests.html` to verify all shader invariants still pass

## Ray-march hot loop (performance-critical)
The march loop in `fsSource` runs up to 250 iterations **per pixel**. Cost there is dominated by
register pressure, not arithmetic: a large function inlined into the loop inflates register
allocation and collapses GPU occupancy for *every* pixel, even when its branch almost never runs.
Measured on the Intel UHD iGPU, hoisting planet shading out of the loop alone was worth 2.1x.

Rules for anything touching that loop:
- **Never call a big shading function inside it.** Record the hit (position, weight, index) and
  shade once after the loop — an alpha-composited contribution is additive with a weight fixed at
  hit time, so late shading is numerically identical.
- **Gate before you compute.** All planets orbit the `y = 0` plane, so the `planetSlab` y-extent
  check rejects the whole 5-planet test using values already live in registers.
- Prefer array uniforms indexed by the loop counter over `(p==0)?a:(p==1)?b:...` select cascades.
- Step size comes from `stepSize()` and is curvature-adaptive; the CPU hover trace in
  `index.html` mirrors it and must be changed together with it.
- `tests.html` suites 2 and 6 enforce these; re-run it after any loop change.

## Adaptive render scale (owned by JS, not the WASM)
The heavy raymarch renders into a low-res offscreen target at `renderScale`; the FXAA pass
resolves it up. **`index.html` controls that scale — do not re-adopt the WASM's `0x06C` output.**
The WASM rule (`js/scene.wat`) steps ×1.05 below 20ms and ×0.85 above 28ms. Under vsync a frame
costs either one refresh (16.7ms) or two (33.3ms), so its 20–28ms hold band is unreachable: it
steps every frame and pumps the resolution across its whole range about once a second. It only
looked stable while the shader was slow enough to pin the scale at the 0.35 floor.

Rules for the JS controller (`updateRenderScale` in `index.html`, enforced by `tests.html` 5d):
- **Count missed refreshes, not milliseconds.** Any absolute ms target is unreachable on the
  vsync grid. `vsyncMs` tracks the observed period; a miss is `ft > vsyncMs*1.75`, with an
  absolute `ft > 30` arm in case the estimate latches onto a multiple of the true refresh.
- **Latch a ceiling and park under it** (`rsCeiling`) so the steady state is "change nothing".
  A controller with no memory of what was too heavy must keep re-probing, which pumps.
- **Ignore frames right after a change** (`rsSettle`). A change calls `resize()`, which reallocs
  the offscreen target and makes that frame slow — counting it drove the old loop to the floor.
- Re-measure only on window resize or a >25% `camDist` change; at idle nothing may move.
- Don't lower the 0.35 floor — the user rejected sub-floor scaling (see memory).

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
No test framework. `tests.html` validates shader/JS invariants via regex extraction.
```bash
python3 -m http.server 8000
# Open http://localhost:8000/tests.html — all tests should show green/PASS
# Open http://localhost:8000 — visual check of black hole scene
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
When compacting, always preserve: the list of modified files, active shader constants and their interdependencies, the current implementation plan, any constraints or decisions made during the session, and the planet data table.
