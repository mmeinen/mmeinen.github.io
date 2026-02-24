# CLAUDE.md - Project Context for Claude Code

## Project Overview
Static GitHub Pages personal site at `https://mmeinen.github.io/`. Sci-fi HUD-themed radial menu linking to browser games and demos. No build tools, no npm, no framework — pure HTML/CSS/JS.

## Deployment
- **Method**: GitHub Pages, auto-deployed from `master` branch
- **URL**: https://mmeinen.github.io/
- Push to `master` = live deploy. Be careful with commits.

## Directory Structure
```
/                         Root (GitHub Pages serves from here)
├── index.html            Main landing page (radial HUD menu, 5 buttons)
├── css/style.css         Global styles (HUD, menu, animations, game pages)
├── minesweeper.html      Minesweeper game (uses js/*.js)
├── pong.html             Pong game (uses js/pong.js)
├── blackhole.html        WebGL black hole simulator (self-contained)
├── js/                   Minesweeper + Pong JS files
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
- **Menu system**: Radial menu in `index.html` uses CSS custom properties (`--angle`) with SVG HUD ring. Buttons positioned via `--deg: calc(var(--angle) * 72deg - 90deg)` at r=220px. Currently 5 nodes at 72° intervals.
- **Games**: Each game is either a standalone HTML file or a subdirectory with its own index.html. Games are self-contained with minimal code reuse.
- **Styling**: Space/sci-fi theme. Blue palette (`rgba(60,140,255,*)`) on dark backgrounds. HUD readouts in corners, animated SVG rings.
- **No shared JS framework** — each game implements its own logic.

## Key Conventions
- All pages link back to `index.html`
- Game pages use `<canvas>` elements
- CSS animations for HUD elements (rotating rings, pulsing nodes, blinking readouts)
- SVG coordinates in `index.html` use a viewBox of `-300 -300 600 600` centered at origin
- Color scheme: `rgba(60,140,255,*)` for blue HUD elements, `rgba(255,160,80,*)` for warnings

## Adding a New Menu Item
1. Add `<a href="newpage.html" class="menu-button" style="--angle: N">` in `index.html`
2. Update the angle divisor in `css/style.css` (`72deg` for 5 items → `60deg` for 6, etc.)
3. Recalculate SVG positions: nodes, arcs, connectors, brackets, diamonds at `360/N` degree intervals on r=220 circle
4. Add `.arc-delay-N` class in CSS if adding more arcs

## Testing
Open HTML files directly in a browser. No test framework. For local serving:
```bash
python3 -m http.server 8000
```
Then visit `http://localhost:8000`.
