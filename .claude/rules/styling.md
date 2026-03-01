---
paths:
  - "css/**"
  - "*.html"
description: "HUD styling and theme conventions"
---

# Styling Conventions

## Theme
- Background: dark space (#0a0e1a or black)
- Primary HUD color: `rgba(60, 140, 255, *)` (blue)
- Warning/accent color: `rgba(255, 160, 80, *)` (amber)
- Font: monospace / 'Courier New' for HUD elements

## Z-Index Layers
- Canvas (WebGL): z-index 1
- HUD overlay: z-index 10
- Planet labels: z-index 25

## Planet Labels
- Positioned absolutely by JS tracking planet screen coordinates
- Use `.planet-label` class with `.visible` and `.hovered` state classes
- Bracket decoration with `.pl-bracket` spans

## Game Pages
- Each game page is self-contained in styling
- All game pages include a `← Back to Menu` link to `index.html`
- Games use `<canvas>` elements for rendering

## Do Not
- Do not use CSS frameworks or preprocessors.
- Do not add external font imports — use system monospace.
- Do not change z-index layering without checking all overlapping elements.
