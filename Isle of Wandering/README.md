# Isle of Wandering

A browser-based 3D adventure world built with [Three.js](https://threejs.org/).
An **endless**, procedurally generated world of smooth mountains, forests,
beaches and an open sea scattered with islands — populated with real animated
3D animals and sailboats — that you explore on foot in first-person, or by
boarding a boat and sailing to the next island. There is no edge: the terrain
streams in around you as you travel, so you can wander in any direction forever.

## Run it

**Just double-click `index.html`** (or drag it into a browser tab). No server,
no build step, no install.

> The first time you open it you need an internet connection so the 3D engine
> (Three.js) can load from a CDN — browsers allow ES-module imports from
> `https` even for a page opened from disk. After the first load it's cached.
>
> The **animal/boat models are embedded directly in `index.html`** (as base64)
> and decoded in-page, so they need no network at all. This is deliberate:
> browsers block `fetch()`/`XHR` from `file://` pages, so models *cannot* be
> downloaded at runtime — embedding them is what makes the wildlife work when
> you just double-click the file. (This is why `index.html` is ~2.4 MB.)

## Controls

| Action | Keys |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Run | hold `Shift` |
| Look | move the mouse (pointer is captured) |
| Board / leave a boat | `E` (when standing next to a moored boat) |
| Steer a boat | `W` / `S` throttle, `A` / `D` turn |
| Release mouse | `Esc` |

There are no invisible walls. On foot you can wade into the sea, but it's slow —
the open water is best crossed by boat. Walk up to one of the sailboats moored
near the shore and press `E` to climb aboard, then steer it across to another
island and press `E` again to step onto the beach.

## What's in the world

- **Endless procedural terrain** — a seeded simplex-noise world where a
  low-frequency "continent" field decides where land and sea are, so islands
  and open water repeat forever. It's streamed in square chunks around you (with
  seamless per-vertex normals, no faceting and no seams), so there is no
  boundary — beaches, grassland, rocky slopes and snow-capped peaks in every
  direction.
- **Forests** — each island chunk grows its own instanced pine and broadleaf
  trees, plus boulders.
- **Animated wildlife** (imported glTF models, not hand-built):
  - **Deer** — Quaternius *Stag*, rigged with Walk/Idle animations
  - **Rabbits** — Quaternius *Bunny*, rigged with Walk/Idle animations
  - **Cats** — prowling the meadows
  - **Birds** — three.js *Parrot* and *Flamingo* wheeling overhead with flapping wings
- **Sailboats** bobbing on the water near the spawn island — walk up and press
  `E` to board and sail one across the sea.
- **Atmosphere** — physical sky + sun, soft shadows that follow you, exponential
  fog, an animated reflective ocean, and drifting clouds (all of which travel
  with you across the endless world).

The animals wander the grassland, follow the terrain, steer away from water and
cliffs, and blend between their walk and idle animations as they move and stop.
Because the world is endless, wildlife and idle boats are **recycled around
you**: anything that falls far behind as you travel is quietly respawned on
valid ground (or open water) out in the fog ahead, so every island you reach is
populated and the total entity count never grows.

## Tweaking

Open `index.html` in a text editor:

- `CFG.SEED` — change for a completely different world.
- `continentMask` (terrain section) — the thresholds in its final `smoothstep`
  control the land-to-sea ratio; the origin bias keeps the spawn area solid land.
- `createTerrainStreamer` — `CHUNK` / `SEG` (terrain detail), `VIEW` (how far the
  world is drawn before fog hides it), and `VEG_CANDIDATES` (forest density).
- `createSailing` — boat handling (`ACCEL`, `TURN`, `MAX_FWD`, …) and `BOAT_YAW`,
  which you nudge by `Math.PI` or `±Math.PI/2` if a boat ever looks sideways.
- `ASSETS` (the wildlife section) — swap model URLs, counts, or sizes. Each
  creature has a `yaw` value; if one ever appears to walk backwards or sideways,
  nudge its `yaw` by `Math.PI` (180°) or `±Math.PI/2` (90°).
- Sun elevation/azimuth (in `sun.setFromSphericalCoords`) — try a low elevation
  for a sunset.

To **change or add models**, edit the `SOURCES` map in `build-embed.mjs` (and the
matching `ASSETS` entry in `index.html`), then run `node build-embed.mjs` to
re-embed them. The script downloads each `.glb`, base64-encodes it, and injects
it into the `#model-data` block in `index.html`. It's the only build step, and
it's only needed when you swap models — not to play.

## Model credits

All models load at runtime from [poly.pizza](https://poly.pizza) and the
[three.js](https://github.com/mrdoob/three.js) repository:

- **Stag, Bunny, Sail Boat** by **Quaternius** — CC0 (public domain)
- **Cat** by **Poly by Google** — CC BY
- **Parrot, Flamingo** — from the three.js examples
