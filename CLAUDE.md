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
- **Navigation**: WebGL black hole scene in `index.html`. 4 orbiting planets are clickable links to games. Planet hover detection via CPU ray-sphere intersection; hover glow via `u_hoveredPlanet` shader uniform. HUD labels track planet screen positions.
- **Shader**: Fragment shader in `index.html` implements gravitational lensing with Verlet integration. Key constants have physical dependencies — see `.claude/rules/shader-conventions.md`.
- **Games**: Each game is a standalone HTML file or subdirectory with its own index.html. Self-contained with minimal code reuse.
- **Styling**: Space/sci-fi HUD theme. Blue palette (`rgba(60,140,255,*)`) on dark backgrounds.
- **No shared JS framework** — each game implements its own logic.

## Key Conventions
- All pages link back to `index.html`
- Game pages use `<canvas>` elements
- Color scheme: `rgba(60,140,255,*)` for blue HUD, `rgba(255,160,80,*)` for warnings
- Canvas z-index 1, HUD overlay z-index 10, planet labels z-index 25

## Adding a New Planet/Game Link
1. Add entry to `planetData` array in `index.html` with `oR`, `ph`, `sp`, `radius`, `name`, `href`
2. Add a new `u_planetN` uniform in shader and JS
3. Add corresponding `.planet-label` div in HTML
4. Update planet check range `if (r > LOW && r < HIGH ...)` in shader to cover new orbit
5. Verify early escape threshold (`r > 55.0`) still exceeds new planet's `oR + radius`
6. Run `tests.html` to verify all shader invariants still pass

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
