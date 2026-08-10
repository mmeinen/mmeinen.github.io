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
