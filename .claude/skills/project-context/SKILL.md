---
description: "Explore the codebase to answer questions about architecture, shader physics, or game implementations"
context: fork
agent: Explore
user-invocable: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Project Context Explorer

You are exploring the codebase of a static GitHub Pages site at `https://mmeinen.github.io/`. The site features an interactive WebGL black hole with gravitational lensing as the main navigation interface, linking to browser games.

## If invoked with arguments

The user asked about: **$ARGUMENTS**

Explore the codebase to answer their question. Search relevant files, read code, and return structured findings with file paths and line references.

## If invoked without arguments

Provide a high-level overview of the project architecture.

## Key Architecture

### Navigation Scene (`index.html`)
- **WebGL shader**: Fragment shader implements Kerr black hole gravitational lensing via Verlet integration. Rays march through curved spacetime, detecting: accretion disc (y-plane crossings), planets (ray-sphere segment tests), galaxy background.
- **Planet system**: 6 planets orbit the black hole. Data in `planetData` array (oR, ph, sp, radius, name, href). Positions computed by `getPlanetWorldPos()`. Shader receives positions as `u_planet0-5` vec4 uniforms.
- **Interaction**: Mouse drag orbits camera, scroll zooms, arrow keys control black hole spin. Planet hover via JS lensed ray trace (Verlet integration matching shader physics). Click navigates to game.
- **Navigation mode**: Fly mode with thrust physics, HUD slider, bullet time, trajectory visualization.
- **HUD**: CSS overlay with readouts (spin, range, FPS) and planet labels positioned by JS.

### WASM Modules
- **`js/scene.wat`** — Camera state, planet projection, hover detection (base64-embedded in index.html)
- **`js/pong.wat`** — Ball/paddle physics for Pong game

### Shader Critical Constants
| Constant | Location | Value | Depends On |
|----------|----------|-------|------------|
| Early escape | `if (r > X ...)` | 90.0 | Must > max planet reach (87.4) |
| Planet range | `if (r > L && r < H ...)` | 16.0-100.0*scale | Must cover all planet oR +/- radius |
| Step cap | `min(M*(r-r_h), C)` | 3.0 | Must < min planet radius * 4 (2.16) |
| Loop count | `for (i < N)` | 250 | Budget must > 2x camDist |

### Planet Data
| Planet | idx | oR | radius | Link |
|--------|-----|------|--------|------|
| Jupiter | 0 | 38.0 | 2.5 | minesweeper.html |
| Saturn | 1 | 52.0 | 2.0 | pong.html |
| Uranus | 2 | 68.0 | 1.5 | edmund_game/index.html |
| Neptune | 3 | 86.0 | 1.4 | beatrix_game/index.html |
| Venus | 4 | 28.0 | 0.54 | fps/index.html |
| Earth | 5 | 33.0 | 0.6 | freecell/index.html |

### Games
- **Minesweeper** (`minesweeper.html`): Uses `js/game.js`, `js/board.js`, `js/tile.js`, `js/bomb.js`, `js/Renderer.js`. Castle theme.
- **Pong** (`pong.html`): Uses `js/pong.js`, `js/pong.wat` (WASM physics).
- **Nugget Invasion** (`edmund_game/`): Self-contained space shooter.
- **Jumping Axolotl Nuggets** (`beatrix_game/`): Self-contained platformer.
- **Travellers** (`fps/`): Self-contained FPS rescue game.
- **Freecell** (`freecell/`): Self-contained card game with drag-and-drop.

### Testing
- `tests.html`: Browser-based regression tests. Fetches `index.html`, extracts shader/JS constants via regex, validates invariants (early escape, planet range, step cap, iteration budget).
