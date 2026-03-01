---
paths:
  - "index.html"
  - "tests.html"
description: "WebGL shader invariants and gravitational lensing conventions"
---

# Shader Conventions — Gravitational Lensing

The fragment shader in `index.html` simulates gravitational lensing around a Kerr black hole. Several constants have physical interdependencies. Changing one without updating others will break far-side visibility or planet detection.

## Critical Invariants

These are enforced by `tests.html`. Run it after any shader change.

### Early Escape Threshold
The line `if (r > THRESHOLD && dot(pos, vel) > 0.0) break;` terminates rays moving outward.
- THRESHOLD must exceed `max(planet oR + radius)` for all planets — otherwise lensed rays aimed at far-side planets get killed early.
- THRESHOLD must exceed `outerEdge + margin` for the accretion disc.
- Currently: `55.0` (max planet reach = 49.4, disc outer = 14.0).

### Planet Check Range
The line `if (r > LOW && r < HIGH && accumulatedAlpha < 0.98)` gates planet intersection tests.
- LOW must be less than `min(planet oR - radius)`.
- HIGH must be greater than `max(planet oR + radius)`.
- Currently: `22.0 < r < 51.0` (inner = 22.5, outer = 49.4).

### Step Size Cap
The line `float dt = max(MIN, min(MULT * (r - r_h), CAP))` controls ray march step size.
- CAP must be less than `min(planet radius) * 4` — otherwise a single step can skip a planet entirely.
- Currently: cap `5.0` < `1.4 * 4 = 5.6`.

### Iteration Budget
The `for (int i = 0; i < N; i++)` loop count × average step must cover at least 2× default `camDist` for lensed ray round-trips.

## When Adding a Planet
1. Add to `planetData` array and add `u_planetN` uniform.
2. If new `oR + radius > 49.4`, increase early escape threshold and planet check HIGH.
3. If new `oR - radius < 22.5`, decrease planet check LOW.
4. Verify step cap < new planet radius × 4.
5. Run `tests.html`.

## When Optimizing Ray Marching
- Never lower the early escape threshold below the farthest planet reach.
- Never raise the step cap above the smallest planet's radius × 4.
- Never reduce iteration count below what's needed for the camera-to-origin round trip.
- Run `tests.html` after any optimization.
