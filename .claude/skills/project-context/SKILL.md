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
- **Planet system**: 4 planets orbit the black hole. Data in `planetData` array (oR, ph, sp, radius, name, href). Positions computed by `getPlanetWorldPos()`. Shader receives positions as `u_planet0-3` vec4 uniforms.
- **Interaction**: Mouse drag orbits camera, scroll zooms, arrow keys control black hole spin. Planet hover via CPU ray-sphere intersection → cursor change + shader glow. Click navigates to game.
- **HUD**: CSS overlay with readouts (spin, range, FPS) and planet labels positioned by JS.

### Shader Critical Constants
| Constant | Location | Value | Depends On |
|----------|----------|-------|------------|
| Early escape | `if (r > X ...)` | 55.0 | Must > max planet reach (49.4) |
| Planet range | `if (r > L && r < H ...)` | 22.0–51.0 | Must cover all planet oR ± radius |
| Step cap | `min(M*(r-r_h), C)` | 5.0 | Must < min planet radius × 4 (5.6) |
| Loop count | `for (i < N)` | 100 | Budget must > 2× camDist (240) |

### Games
- **Minesweeper** (`minesweeper.html`): Uses `js/game.js`, `js/board.js`, `js/tile.js`, `js/bomb.js`, `js/Renderer.js`
- **Pong** (`pong.html`): Uses `js/pong.js`
- **Nugget Invasion** (`edmund_game/`): Self-contained with own `index.html`, `game.js`, `style.css`
- **Jumping Axolotl Nuggets** (`beatrix_game/`): Self-contained with own `index.html`, `game.js`

### Testing
- `tests.html`: Browser-based regression tests. Fetches `index.html`, extracts shader/JS constants via regex, validates invariants (early escape, planet range, step cap, iteration budget).
