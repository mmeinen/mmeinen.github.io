---
paths:
  - "index.html"
  - "tests.html"
  - "js/scene/*.js"
  - "demo/js/gargantua.js"
  - "demo/js/deep.js"
  - "demo/js/ships.js"
description: "Shader and renderer invariants for the landing page (js/scene/*) and the demo shaders it shares"
---

# Shader Conventions — Landing Page (`js/scene/*`) and COLLIDE (`demo/js/*`)

The landing page renderer is a port of the demo's Gargantua + planet pipeline. The old WebGL1 lensing shader
(`js/scene/shaders.js`, Verlet march, `planetData`, WASM camera) was replaced in Sep 2026; its history is in git.
`tests.html` enforces the invariants below — run it after any shader or renderer change.

## Shared shader sources must stay identical
`BH_COMMON`, `FS_BH_SHADE` (`js/scene/gargantua.js` ⇄ `demo/js/gargantua.js`) and `FS_SYS_COMMON`,
`FS_SYS_BASE`, `FS_SYS_SURF`, `FS_SYS_ATMO` (`js/scene/planet.js` ⇄ `demo/js/deep.js`) are byte-identical copies.
Change both, or document the divergence in the parity test. Landing-page-only variants are built by string
injection at program creation (`#define GEOM_CUBE`, `SURF_KIND`), never by editing the copied source.

## Units: M = 1 everywhere
Geodesics are `x'' = -3 h² x / r⁵` with horizon 2, photon sphere 3, shadow edge b = 3√3. The old landing page's
`-1.5` is the same law in r_s = 1 units; mixing the two offset the photon ring from the shadow. `v_inf² = v² - 2h²/r³`.

## Bake, don't march
The camera stays within ~1e-4 M of MILLER, so lensing geometry is baked once into four cube MRTs (escape direction +
haze, two premultiplied disc crossings, bend cosines). Only shading runs per frame. The disc is axisymmetric: one
bake at azimuth 0 serves any azimuth (`world = rotY(bake, -az)`). Re-bake when the camera's radius or height drifts
> 0.02 M. The shadow and photon ring are analytic in the impact parameter — never filter a 0/1 capture flag.

## The landing page's hole is KERR (Sep 2026); the demo's is not
The landing page's geometry pass is its own `FS_KERR_GEOM` and its shading splices a Kerr `main()` after
`FS_BH_SHADE`'s verbatim helpers. Every GLSL loop has a float64 twin in `js/scene/kerr.js` — change both. Trace in Mino
time, radially in u = 1/r and angularly as a unit vector on the sphere (never θ/φ: its L/sin²θ spike draws a bead
chain along the spin axis). The camera is a ZAMO. The shadow is analytic in (L, p_θ) via the radial potential.
While the spin moves, a tile scheduler re-bakes only stale tiles (|Δa| > b²/5200, or 0.02 M drift) inside ~1 ms of GPU;
the analytic parts use the spin the near-hole tiles were baked at. It must never hold `rsSettle`.

## GPU occupancy (Intel UHD iGPU)
- The planet renderer is DEFERRED: a lean base pass writes a hit buffer; each material is its own small program
  scissored to the body's `sphereRect`; clouds + atmosphere composite last. Never inline terrain, clouds or
  scattering into the base pass (a monolithic shader throttled every pixel through register pressure).
- Hashing: one uint multiply per axis plus a finaliser (`HK`, `hf`); Intel runs 32-bit int multiplies slowly.
  Don't swap hash noise for a small 3D texture (tiles visibly; 8-bit weights draw contour rims).
- Attribute cost before optimising (monkey-patch pass functions, pin `SCENE.setScale`, A/B in one page load).
  Measured dead ends: cutting iteration caps; an early-out for sky hidden behind the planet.

## Depth for ships
Ships render into a 4x MSAA RGBA16F target whose depth is primed from the planet hit buffer with LOGARITHMIC depth
(`logDepth`, 0.1 m .. 1e8 km); a linear 24-bit buffer cannot separate a fighter from a planet 700 km away. Additive
sprites must fade to zero inside their quads. Kitbash faces orient away from a reference point inside the solid.
