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

You are exploring the codebase of a static GitHub Pages site at `https://mmeinen.github.io/`. The landing page is a spaceship flight deck orbiting a planet beside the black hole Gargantua; its crew manifest links to the browser games.

## If invoked with arguments

The user asked about: **$ARGUMENTS**

Explore the codebase to answer their question. Search relevant files, read code, and return structured findings with file paths and line references.

## If invoked without arguments

Provide a high-level overview of the project architecture.

## Key Architecture

### Landing page (`index.html`, Sep 2026)
- A spaceship flight deck in a dawn-dusk orbit round the ocean world MILLER, which orbits the black hole Gargantua.
- Renderer `js/scene/*.js` (classic scripts, load order gl → gargantua → planet → post → orbit → ships → main):
  baked Schwarzschild geodesics + per-frame disc shading, a deferred planet (terrain, clouds, atmosphere), bloom +
  tone map + FXAA, occasional friendly-formation flybys. Shader strings are byte-identical copies of `demo/`'s.
- `js/scene/orbit.js` is pure maths: the system model, camera framing (the hole always in view) and telemetry.
- HUD `js/hud.js` + `css/hud.css`. The game menu is static HTML: five crew `<details>` with `<a class="mission">`
  links (works with no JS / no WebGL; `?nogl` forces the fallback).
- Invariants: `.claude/rules/shader-conventions.md` and CLAUDE.md "Landing page renderer".

### WASM Modules
- **`js/pong.wat`** — Ball/paddle physics for Pong game (the landing page's old `js/scene.wat` was removed)

### Games
- **Minesweeper** (`minesweeper.html`): Uses `js/game.js`, `js/board.js`, `js/tile.js`, `js/bomb.js`, `js/Renderer.js`. Castle theme.
- **Pong** (`pong.html`): Uses `js/pong.js`, `js/pong.wat` (WASM physics).
- **Nugget Invasion** (`edmund_game/`): Self-contained space shooter.
- **Jumping Axolotl Nuggets** (`beatrix_game/`): Self-contained platformer.
- **Travellers** (`fps/`): Self-contained FPS rescue game.
- **Freecell** (`freecell/`): Self-contained card game with drag-and-drop.

### Testing
- `tests.html`: fetches the landing page sources and checks the menu (every game present and resolving), file://
  safety, M = 1 lensing, shader parity with demo/, the lean base pass, re-baking and the render-scale controller;
  plus Pong behaviour. Needs a local server or Chrome's `--allow-file-access-from-files`.
