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
planet's reach. Both are invariant-tested.

Current planets reach `oR + radius = 86 + 1.4 = 87.4` (Neptune, the outermost).

## Critical Invariants

These are enforced by `tests.html`. Run it after any shader change.

### Zone Escape Threshold
The line `if (r > LOW && dot(pos, vel) > 0.0) break;`
terminates outward-moving rays once they leave the scene.
- LOW must exceed `max(planet oR + radius)` — else lensed rays aimed at far-side planets get killed early.
- LOW must exceed `outerEdge + margin` for the accretion disc.
- Currently: `100.0` (max planet reach 87.4, disc outer 14.0).

### Convergence Escape Threshold  ← the one that caused the flat-bottom clipping bug
The line `if (aDt2 < convThresh*|vel|² && dot(pos, pos) > N && … ) break;`
early-terminates rays that have straightened into a near-straight line and are leaving.
- `sqrt(N)` (the radius) must exceed `max(planet oR + radius)` — else outbound rays bound for
  far-side planets break **before reaching them**, clipping the planet's BH-facing edge.
- This check's `convThresh` scales with `1/resolution²`, so it fires far more readily at low
  render scale. It is NOT "dead code" — at 35% render scale it terminates most inner rays.
- Currently: `N = 8100.0` → `r > 90.0` (> 87.4 ✓).

### Planet Check Range
The line `if (max(r, rNew) > LOW && min(r, rNew) < HIGH && accumulatedAlpha < 0.98)` gates planet tests.
- LOW must be less than `min(planet oR - radius)`.
- HIGH must be greater than `max(planet oR + radius)`.
- Currently: `16.0 … 100.0` (inner = 35.5 Jupiter, outer = 87.4 Neptune).
- It must test the **segment span** (`r` and `rNew`), not just the start radius. Steps are now
  curvature-adaptive and can span tens of units, so a segment can start outside the band and
  cross it entirely — gating on the start radius alone silently clips far-side planets.

### Step Size — `stepSize(r, r_h, L2)`
Curvature-adaptive, NOT a fixed fraction of radius. `|acc| = 1.5*L2/r^4`, so `dt = EPS/|acc|`
holds the deflection per step constant instead of over-resolving the far field (the old fixed
fraction spent 5-unit steps on stretches bending by ~1e-4 rad). Worth ~1.9x on its own.

    dtCurv = EPS * r^4 / (1.5*L2)     EPS      = 0.04 rad/step
    dt     = min(dtCurv, F * (r-r_h))  F        = 0.25   (DT_R_FRAC)
    if (r < DETAIL_R) dt = min(dt, 0.08*(r-r_h))   DETAIL_R = 20.0
    dt     = clamp(dt, 0.002, 40.0)

- **The old "cap < min planet radius × 4" rule is GONE and must not be reinstated.** It existed
  because a coarse step could step *over* a planet. That was never the actual failure mode: the
  planet test is a segment–sphere closest-approach test, exact for a straight segment of any
  length. The cap does not bound planet detection.
- What replaces it: `F` bounds the chord sagitta to about `r*F²/8`. The planet gate uses
  `min(r, rNew)` as the segment's inner reach, which overstates it by at most that sagitta. So
  `HIGH − max(planet reach)` must stay well above it. Currently `0.78` vs a `12.6` margin.
- `F` must stay ≤ 0.5 so a step can never charge the horizon.
- `DETAIL_R` must exceed the disc `outerEdge + 2`: disc hit positions are interpolated along the
  segment, so the disc needs fine steps.
- The CPU hover trace in `index.html` mirrors this function. **Change both together** — if they
  diverge, the ray you can click drifts from the ray you can see.
- All of the above are enforced by `tests.html` (suite 2).

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
- Keep the planet gate testing the segment's radial span, and keep the sagitta margin above.
- Never reduce iteration count below what's needed for the camera-to-origin round trip.
- Iteration count is NOT the lever: cutting the cap 250 → 125 measured zero change, because the
  loop already exits on the escape conditions long before the cap. Look at occupancy instead.
- Run `tests.html` after any optimization.

### Hot-loop occupancy (the dominant cost — measured Aug 2026)
On the target Intel UHD iGPU this shader is limited by **register pressure**, not arithmetic.
A big function inlined into the march loop inflates register allocation and collapses occupancy
for every pixel, even if its branch is taken by almost none. Attribution at 560×315, default view:

| change | frame time |
|---|---|
| baseline | 18.0 ms |
| defer `shadePlanet` out of the loop | 8.4 ms |
| + fold out the dead `fbm`/`noiseLUT` chain | 5.0 ms |

Reducing the iteration cap 250 → 125 changed nothing — the loop already exits early on the
escape conditions, so iteration count is NOT the lever. Enforced by `tests.html` suite 6:
- Shading functions stay OUT of the loop; record the hit and shade once afterwards. The
  contribution is additive with a weight fixed at hit time, so deferring is exact.
- Planets are `uniform vec4 u_planets[N]` indexed by the loop counter, never a select cascade.
- The planet test is gated by `planetSlab`, a y-extent check using already-live registers
  (all orbits lie in the `y = 0` plane).

### u_noiseTex is NOT bound
`u_noiseTex` is declared and sampled by `noiseLUT2` (planet bands, galaxies) but **no caller ever
binds a texture to it**, so it resolves to unit 0 — the 256×1 blackbody LUT — and returns that
ramp's saturated tail (~1.0) for nearly every input. The accretion disc's `fbm` cloud chain was
therefore a constant, and its output proved sensitive to unrelated code motion (the compiler's
scheduling changed what the degenerate sampling returned). It has been folded to `structure = 1.0`.
Before "restoring" turbulence, bind a real 256×256 REPEAT-wrapped noise texture — otherwise any
noise-driven visual is undefined behaviour, not a design.
