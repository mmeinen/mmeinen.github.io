# Isle of Wandering

A browser-based 3D **survival** adventure built with [Three.js](https://threejs.org/).
You wake up in your own house in a seaside village and have to survive: keep
your health, hunger, thirst and warmth up, gather and craft, trade with the
villagers, and get warm before the cold night. The world is an **endless**, procedurally generated world of smooth mountains, forests,
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
> you just double-click the file. (This is why `index.html` is ~2.8 MB.)

## Controls

| Action | Keys |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Run | hold `Shift` |
| Look | move the mouse (pointer is captured) |
| Use what you're looking at | `E` or left click — open doors, talk, chop, pick, drink, cook, board a boat |
| Eat / use the item in your hand | `F` or right click — eat, drink, place a campfire, fish |
| Pick an item | `1`–`9` or the mouse wheel |
| Craft | `C` |
| Steer a boat | `W` / `S` throttle, `A` / `D` turn |
| Pause (and save) | `Esc` |

## Surviving

- **Your house**: you start beside your bed. Open the door with `E`. The chest
  holds spare things; sleep in the bed once it gets dark (that also saves).
- **Bars**: ❤️ health, 🍗 hunger, 💧 thirst, 🔥 warmth. Hunger and thirst drop all
  the time; warmth drops at night outdoors (and fast in the sea). An empty bar
  hurts your health; fairly full bars heal it. At 0 health you faint and wake
  up in your bed the next morning, keeping your things.
- **Food**: berries (round bushes), mushrooms (under trees), apples and bread
  (trades), fish (craft a rod, face the sea, press `F`). Cook fish and
  mushrooms on a campfire for much more food.
- **Water**: drink at any village **well** — the sea is salty. Craft a flask
  and fill it at a well to carry water.
- **Gather**: chop trees for wood (5 swings, 2 with an axe), pick up sticks and
  stones, break big rocks with a pickaxe. Everything grows back after a while.
- **Craft** (`C`): axe, pickaxe, torch (light + warmth while held), campfire,
  flask, fishing rod.
- **Day & night**: a day lasts 12 minutes (about 7½ of daylight). Villagers go
  home at night and their windows light up.
- **Villages** sit on most islands (one per ~520 m of land): a well, market
  stalls and people — baker, fisher, smith, potter, farmer, elder and kids.
  Talk to them (`E`) for tips and trades; the elder gives you bread once a day.
- **Saving** is automatic (every minute, on sleep, on pause) in the browser's
  local storage. The start screen offers *Continue* or *Start a new game*.
- Tuning lives in `index.html`: `DAY_SEC`, the drain rates in
  `createSurvival().update`, `RECIPES`, `TRADES`, and `villageAt` (village
  density: the `0.85` chance per cell).

There are no invisible walls. On foot you can wade into the sea, but it's slow —
the open water is best crossed by boat. Walk up to one of the sailboats moored
near the shore and press `E` to climb aboard, then steer it across to another
island and press `E` again to step onto the beach.

## What's in the world

- **Villages and people** — procedural low-poly houses (doors that open, beds,
  tables, windows that glow at night), wells, market stalls and lantern posts.
  Each village is pure data computed from its patch of the world, so its walls
  are solid and the forest leaves a clearing. Villagers are built from boxes and
  stroll between the well, the stalls and their homes.

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
  - **Foxes** — Khronos glTF sample *Fox*, rigged with Walk/Survey animations
  - **Cats** — prowling the meadows
  - **Birds** — three.js *Parrot* and *Flamingo* wheeling overhead with flapping wings
- **Sailboats** bobbing on the water near the spawn island — walk up and press
  `E` to board and sail one across the sea.
- **Atmosphere** — physical sky + sun, soft shadows that follow you, exponential
  fog, an animated reflective ocean, and drifting clouds (all of which travel
  with you across the endless world).

The animals wander the grassland, follow the terrain, steer away from water and
cliffs, and blend between their walk and idle animations as they move and stop.
Because the world is endless, the wildlife lives in a **bubble around you**
(~100 ground animals within 240 m, 30 birds): an animal that ends up outside it
is moved to fresh land inside it, out of sight, so while you sail the whole
pool gathers on the island ahead and every island you land on is teeming. If
fewer than two animals are in view (within 60 m, ahead, not behind a hill) for
a moment, the furthest one trots out of the trees in front of you. Tune it in
`createWildlife`: `POOL`, `BIRDS`, `NEAR`, `SEE2`, `WANT`. Idle boats are
recycled the same way, 1 km out.

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
- **Fox** by **PixelMannen** (CC0), rigged and animated by **tomkranis** (CC BY 4.0), from the Khronos glTF sample models
- **Parrot, Flamingo** — from the three.js examples
