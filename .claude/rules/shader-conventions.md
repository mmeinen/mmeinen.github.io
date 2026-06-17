---
paths:
  - "index.html"
  - "tests.html"
  - "js/scene/shaders.js"
description: "WebGL shader invariants and gravitational lensing conventions"
---

# Shader Conventions — Gravitational Lensing

The fragment shader (`fsSource` in `js/scene/shaders.js` — NOT index.html) simulates
gravitational lensing around a Kerr black hole. Several constants have physical
interdependencies. Changing one without updating others will break far-side visibility or
planet detection.

Two escape conditions can each silently clip far-side planets if set below the farthest
planet's reach. Both are now invariant-tested. Values below are for **menu mode**
(`u_orbitScale = 1.0`); they scale with `orbitScale` for the (disabled) nav/fly mode.

Current planets reach `oR + radius = 86 + 1.4 = 87.4` (Neptune, the outermost).

## Critical Invariants

These are enforced by `tests.html`. Run it after any shader change.

### Zone Escape Threshold
The line `if (r > mix(LOW, HIGH, step(1.5, u_orbitScale)) && dot(pos, vel) > 0.0) break;`
terminates outward-moving rays once they leave the scene.
- LOW (menu) must exceed `max(planet oR + radius)` — else lensed rays aimed at far-side planets get killed early.
- LOW must exceed `outerEdge + margin` for the accretion disc.
- Currently: `mix(100.0, 175.0, …)` → `100.0` menu (max planet reach 87.4, disc outer 14.0).

### Convergence Escape Threshold  ← the one that caused the flat-bottom clipping bug
The line `if (aDt2 < convThresh*|vel|² && dot(pos, pos) > N * u_orbitScale² && … ) break;`
early-terminates rays that have straightened into a near-straight line and are leaving.
- `sqrt(N)` (the radius) must exceed `max(planet oR + radius)` — else outbound rays bound for
  far-side planets break **before reaching them**, clipping the planet's BH-facing edge.
- This check's `convThresh` scales with `1/resolution²`, so it fires far more readily at low
  render scale. It is NOT "dead code" — at 35% render scale it terminates most inner rays.
- Currently: `N = 8100.0` → `r > 90.0` menu (> 87.4 ✓); nav mode `r > 180` (> 172 outer orbit).

### Planet Check Range
The line `if (r > LOW && r < mix(HIGH, …) && accumulatedAlpha < 0.98)` gates planet tests.
- LOW must be less than `min(planet oR - radius)`.
- HIGH must be greater than `max(planet oR + radius)`.
- Currently: `16.0 < r < 100.0` menu (inner = 35.5 Jupiter, outer = 87.4 Neptune).

### Step Size Cap
`float dt = max(MIN, min(MULT * (r - r_h), stepCap))`, `stepCap = mix(CAP, …)`.
- CAP must be less than `min(planet radius) * 4` — else a single step can skip a planet.
- Currently: cap `5.0` < `1.3 * 4 = 5.2` (min planet radius is Mars at 1.3 — tight margin).

### Iteration Budget
The ray-march `for (int i = 0; i < N; i++)` loop count × average step must cover at least
2× default `camDist` for lensed ray round-trips.

## When Adding a Planet
1. Add to `planetData` array and add `u_planetN` uniform.
2. If new `oR + radius > 87.4`, raise the zone escape LOW, the convergence escape `sqrt(N)`, AND the planet check HIGH.
3. If new `oR - radius < 35.5`, decrease planet check LOW.
4. Verify step cap < new planet radius × 4 (current cap 5.0 needs radius > 1.25).
5. Run `tests.html`.

## When Optimizing Ray Marching
- Never lower the zone escape OR convergence escape threshold below the farthest planet reach.
- Never raise the step cap above the smallest planet's radius × 4.
- Never reduce iteration count below what's needed for the camera-to-origin round trip.
- Run `tests.html` after any optimization.
