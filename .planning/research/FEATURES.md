# Feature Research

**Domain:** Tactical orbital space combat — v1.1 Realistic Scale & Fleet Combat
**Researched:** 2026-03-14
**Confidence:** MEDIUM (fleet/radar patterns from real games; time warp from KSP wiki; orbital UI from sim games)

---

> **Scope note:** This document supersedes the v1.0 FEATURES.md for the v1.1 milestone.
> v1.0 table stakes (weapons, hull, targeting, wave survival, 5 enemy archetypes) are shipped and not re-researched here.
> Focus is on the six NEW capability areas: fleet composition, radar/minimap, time acceleration, orbital height control UX, world boundary, and body collision.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that users of tactical space games expect in a fleet/scale expansion. Missing = the new milestone feels unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Structured fleet spawning (not random) | Wave survival games lose tactical texture when enemies arrive as random individuals. Homeworld, Endless Space 2, and GSB all spawn enemies in pre-defined groups with roles. Players notice when a wave has no internal coherence. | MEDIUM | Max 3 fleets per wave. Each fleet is a named template (e.g. "escort group", "assault wing", "capital task force"). Templates define ship count, archetype mix, and spawn offset. Depends on existing wave spawner. |
| Fleet cohesion behavior (ships act together) | Individually-scripted enemies in a labeled "fleet" feel dishonest. Players expect ships in a fleet to orbit near each other, cover each other, and die together. Homeworld's strike groups are the canonical reference. | MEDIUM | Shared anchor point per fleet (a body or Lagrange point). Each ship in the fleet orbits within ±15% of the anchor orbit radius. No explicit formation AI needed — proximity rules are enough. |
| Fleet role differentiation (tank, striker, support) | The vanguard/escort/capital pattern is universal in fleet games. Endless Space 2 uses attacker/protector ratios. NEBULOUS uses point-cost archetypes. Players expect ships in a fleet to have different roles that interact tactically. | MEDIUM | Three fleet roles map directly to existing archetypes: **Anchor** (Capital — high HP, draws fire), **Striker** (Bomber or Sniper — high damage, fragile), **Screen** (Grunt or Swarm — intercept player projectiles). Template definitions encode role ratios. |
| Radar/minimap always visible | Every space combat game from Elite Dangerous to Homeworld shows a permanent minimap. Players expect spatial awareness without zooming out. The prior anti-feature ruling ("tactical zoom IS the minimap") is invalidated by the realistic-scale goal — at km scale, zooming out to see the whole system takes the player out of combat. | MEDIUM | Permanent mini-map bottom-left. Circle, 120px diameter, HUD-color scheme (rgba 60,140,255). Shows player, planets as static dots, enemy fleet icons as triangles (hostile color). No zoom on the minimap itself — it is always at system scale. |
| Radar shows faction differentiation | Elite Dangerous color-codes contacts: green = friendly, red = hostile, yellow = neutral. Players expect to read the tactical situation from color alone, not icon shape alone. | LOW | Enemy fleet icons: red triangle. Player: white dot. Planets: dim blue circles. BH: black/grey dot center. Event horizon is implicit by the center icon. |
| Time acceleration toggle for transit | KSP established this as the canonical solution to "orbital transfers take too long." Players of any orbital game expect some form of time warp for transit between combats. The question is not whether to include it, but how to constrain it. | MEDIUM | Spacebar toggles. Single warp level (not multi-level like KSP). Accelerates simulation time uniformly. Visual indicator required (see differentiators for the signal design). |
| Warp disabled near enemies | SpaceBourne 2 uses proximity-based warp lock. KSP locks warp when under thrust. The pattern is universal: time compression and combat are mutually exclusive. Players accept this constraint as a fair tradeoff. | LOW | Enemy within detection radius (~30 km in world units) = warp disabled. HUD shows "WARP BLOCKED — CONTACT RANGE" in warning color. Uses same radial bin structure as existing collision detection. |
| Warp disabled near bodies | KSP prevents warp inside atmosphere. Spaceflight Simulator locks warp below minimum altitude. Players expect proximity to celestial bodies to override warp. | LOW | Warp locked within 1.5x a planet's radius. BH has a larger exclusion zone (3x event horizon radius). These are kill zones anyway, so the logic is shared: if you'd be destroyed, you can't warp. |
| Orbital height control UX | The existing orbit altitude system uses keyboard input. At realistic km scale, the player needs to know their current orbital radius in absolute terms (not game units). Dual Universe and Kerbal Alarm Clock both show live orbital parameters as numeric HUD elements. | LOW | Existing altitude display in HUD gains a km label. Apoapsis/periapsis display optional but low cost since orbital params are already computed. Altitude change controls (keys or buttons) unchanged. |
| World boundary behavior | Every survival game has an implicit or explicit play area. At realistic scale, the boundary needs a clear player signal (approach warning) and a bounce/return mechanic. Space games typically use deceleration fields or simple velocity reversal at the fence. | LOW | Invisible fence at 1.2x outermost orbit radius. Approaching within 10% of boundary: HUD warning "BOUNDARY PROXIMITY". At boundary: radial velocity component zeroed, tangential preserved (orbit-preserving reflect). No hard wall, no teleport. |
| Body collision destroys ships | Physics credibility requires that flying into a planet is lethal. KSP has always done this. Homeworld's planets are indestructible obstacles. Players accept body-as-kill-zone as physically correct. | LOW | Ships (player and enemy) destroyed on contact with planet surface + BH event horizon. Player gets brief warning "COLLISION IMMINENT" when closing velocity will result in impact within 3 seconds. Enemy collision counts as a kill (adds to wave kill counter). |

### Differentiators (Competitive Advantage)

Features that go beyond the expected and create notable moments.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Radar expands to side panel (O key) | The standard pattern is minimap-only (e.g. Elite Dangerous) or fullscreen map (KSP map mode). A persistent side panel that expands without leaving the combat view is uncommon. Deep Space Battle Simulator's "Radar Table" update was explicitly requested by players. | MEDIUM | O key toggles radar from 120px circle (bottom-left) to 280px panel (left side, full height). Panel mode adds: orbit rings for each planet, warp-speed trails, fleet labels. Panel replaces the orbit info panel when open, or coexists with HUD if space allows. Depends on existing HUD layout. |
| Warp visual feedback via star-streak shader | Star Trek established the visual language of warp: stars stretch into lines. No browser space game currently does this with a real-time shader effect. A radial blur or UV-stretch on the star field during warp would be instantly recognizable and spectacular. | HIGH | During warp: apply radial UV stretch to background star/BH texture (not inside the ray march — as a post-process pass). Streak magnitude scales with warp speed multiplier. Deactivate during combat. Performance cost: one extra fullscreen pass, likely < 2ms on GTX 1060. |
| Fleet health bars on radar | Individual ship health bars are standard. Showing aggregate fleet health on the radar icon (as a thin arc) is uncommon and gives the player strategic information at a glance — which fleet is weakened, which is fresh. | MEDIUM | Radar fleet icons (triangles) get a colored arc underlay representing total fleet HP fraction. Green at full, orange at 50%, red at 25%. Computed from fleet entity sums. Depends on fleet composition system. |
| Warp rate HUD indicator | KSP shows the warp multiplier as a text number on screen. A more satisfying approach shows warp as a distinctive HUD state change — color shift, mode label, animated pulse. Players want to know at a glance that they are in warp. | LOW | When warp active: HUD border pulses (dim blue → bright blue, 0.5s period). Top-center displays "WARP x30" in warning color. Normal play: no indicator (clean HUD). Entering warp: 0.2s transition (star field begins to stretch). |
| Fleet spawn announcement | Homeworld uses audio cues and dialogue for fleet arrivals. Without audio, a visual equivalent is needed. Dead Space uses text callouts for enemy events. Players need to know a fleet just spawned, not discover it incidentally. | LOW | Fleet spawn triggers a 3-second HUD callout: "HOSTILE FLEET DETECTED — [FLEET NAME]" with a directional arrow to the spawn point. Uses existing HUD overlay system. Requires no new rendering infrastructure. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like natural extensions but create disproportionate problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-level time warp (x2, x10, x100 like KSP) | KSP players expect granular warp control. More levels = more control. | At this game's orbital scale, Jupiter orbit is already 60 seconds. A single x30 level is enough to make any transfer take under 30 seconds. Multi-level adds UI buttons, level tracking, and the "wrong level" frustration of accidentally going x100 and missing a maneuver. | Single toggle: normal speed / x30. Spacebar in, spacebar out. Clean. |
| Radar zoom control | Players familiar with minimap zoom expect it. | At system scale, the radar is already showing the entire play area. Zoom in reduces tactical value (you see less). Zoom out hits the world boundary. There is nothing useful to zoom to. | Fixed scale. Radar circle = full system. Panel = same scale with more overlay info. |
| 3D radar (like Warframe's archwing requests) | Deep space is 3D; a 2D radar misrepresents positions. | Orbital combat in this game is effectively 2D (all orbits coplanar). The BH-centric orbital structure means a 2D top-down radar is a perfect projection. 3D radar adds implementation complexity for zero tactical gain. | 2D top-down radar is correct and sufficient. |
| Fleet AI formation flying | Fleets that maintain geometric formations (V-shape, line-abreast) look impressive. | Dynamic formation flying requires per-ship steering to maintain relative positions, expensive pathfinding corrections when the formation is disrupted, and becomes unreadable at small radar scale. Homeworld only makes this work via pause-and-issue-orders. | Loose proximity behavior: ships orbit within a radial band of the fleet anchor point. Formation is implied, not enforced. Players read it as fleet coherence without the complexity. |
| Persistent fleet identifiers across waves | Named fleets that return wave after wave ("Red Wing returns!") create narrative continuity. | Fleet wave tracking requires persistent fleet state across the wave boundary. The current wave system resets on wave end. Adding cross-wave state complicates the wave spawner and save state significantly. | Named fleet templates per wave (e.g., wave 5 spawns "Assault Wing Alpha") without cross-wave persistence. Same name may recur; players experience it as narrative without requiring state persistence. |
| Radar as command interface (click to order) | Clicking radar to navigate or issue commands reduces cognitive load of zooming in/out. | Making the radar clickable/interactive requires a separate input layer, coordinate transformation from radar space to world space, and conflicts with the existing canvas input model (drag = orbit camera, click = target selection in combat). | Radar is display-only. Navigation via existing controls. Expand panel (O) for more visibility; tactical zoom (F) for target assignment. |
| Automatic warp-out when enemy detected | Quality-of-life: warp drops automatically when combat starts. | Automatic warp exit removes player agency over *when* to engage. Players transiting the system may intentionally pass near enemies without engaging. Auto-exit forces combat at enemy convenience, not player choice. | Manual only: warp blocks when enemy is in detection range; player must have already exited warp before reaching that range. HUD warning ("CONTACT RANGE") alerts the player. |

## Feature Dependencies

```
Fleet Composition System
    ├── requires ──> Existing Wave Spawner (kill-triggered, already built)
    ├── requires ──> Existing Enemy Archetypes (5 archetypes, already built)
    ├── provides ──> Fleet Templates (named groups with role ratios)
    └── provides ──> Fleet Anchor Behavior (proximity orbit)
            │
            ▼
Radar / Minimap
    ├── requires ──> Fleet Composition (to show fleet icons, not individual ships)
    ├── requires ──> Planet positions (already computed by WASM + JS)
    ├── provides ──> Mini (120px circle, always-on)
    └── provides ──> Panel (280px, O key toggle)
            │
            ▼
Fleet Health on Radar
    ├── requires ──> Fleet Composition System (fleet HP aggregation)
    └── requires ──> Radar Panel (display surface)

Warp Speed System
    ├── requires ──> Existing orbital simulation (time step scaling)
    ├── requires ──> Fleet Composition (for enemy proximity detection scope)
    ├── requires ──> Body Collision system (shared kill-zone logic for warp lock)
    ├── provides ──> Time multiplier (uniform, single level)
    └── provides ──> Warp visual state (star stretch, HUD pulse)

Body Collision
    ├── requires ──> Existing radial bin collision detection
    ├── provides ──> Kill-zone data (used by warp lock AND by collision kill events)
    └── provides ──> Player warning system (countdown to impact)

World Boundary
    ├── requires ──> Outermost orbit radius (static from planetData)
    └── provides ──> Radial velocity reflection (independent, no other dependencies)

Orbital Height Control UX
    └── requires ──> Existing altitude display (already in HUD)
        (this is a UX enhancement only, no new systems)

Fleet Spawn Announcement
    ├── requires ──> Fleet Composition System (spawn event)
    └── requires ──> Existing HUD overlay
```

### Dependency Notes

- **Fleet composition before radar:** Radar shows fleet icons, not individual ships. Without fleet grouping, radar would show 20+ individual dots — unreadable at 120px.
- **Body collision before warp lock:** Warp lock near bodies reuses the kill-zone radius from the collision system. Build collision first, warp lock is a one-liner addition.
- **Fleet composition is the critical path:** Everything else in the milestone either depends on it (radar, fleet health, spawn announcement) or is independent (warp, boundary, collision). Build fleet composition first.
- **Warp visual effects are independent:** Star-stretch shader pass and HUD warp indicator can be built any time after the warp toggle exists. They don't block anything.

## MVP Definition

### Launch With (v1.1 milestone)

The minimum that makes the "Realistic Scale & Fleet Combat" milestone feel real.

- [ ] Fleet templates: 3 named templates, max 3 fleets per wave — fleet coherence is the milestone's core promise
- [ ] Fleet anchor behavior: ships orbit within ±15% of anchor radius — makes fleets feel like units, not random enemies
- [ ] Radar circle (120px, always-on): player + planets + fleet icons — spatial awareness without combat interruption
- [ ] Warp toggle (Spacebar, x30): enters/exits with 0.2s transition, blocked by enemy proximity and body proximity — closes the "long transit" problem
- [ ] Warp HUD indicator: border pulse + "WARP x30" label — required for clarity, trivial to implement
- [ ] Body collision kill zones: player and enemies destroyed on contact — physics credibility
- [ ] World boundary with warning: radial velocity reflect at fence — play area integrity
- [ ] Fleet spawn HUD announcement: 3-second callout with direction — required since radar is small

### Add After Validation (v1.1.x)

Features that improve the experience once the core is working.

- [ ] Radar panel (280px, O key toggle) — add when it's clear players want more orbital context
- [ ] Fleet health arcs on radar — add after fleet composition is stable and radar exists
- [ ] Orbital height UX (km labels, apoapsis/periapsis display) — add when scale numbers are finalized
- [ ] Warp star-streak shader effect — add as a polish pass after all functional systems ship

### Future Consideration (v2+)

- [ ] Additional fleet templates (carrier group, ambush wing, siege flotilla) — defer until wave variety needs expanding
- [ ] Fleet retreat behavior (fleet warps out when below 30% HP) — interesting but requires warp-capable enemy AI, significant scope
- [ ] Named recurring fleets ("Red Wing") with persistent state — requires cross-wave state save, scope risk

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Fleet templates (3 named, max 3/wave) | HIGH | MEDIUM | P1 |
| Fleet anchor behavior | HIGH | MEDIUM | P1 |
| Radar circle (always-on, 120px) | HIGH | MEDIUM | P1 |
| Warp toggle + proximity lock | HIGH | MEDIUM | P1 |
| Body collision kill zones | HIGH | LOW | P1 |
| World boundary + warning | MEDIUM | LOW | P1 |
| Fleet spawn HUD announcement | MEDIUM | LOW | P1 |
| Warp HUD indicator (pulse + label) | MEDIUM | LOW | P1 |
| Radar panel (expanded, O key) | HIGH | MEDIUM | P2 |
| Fleet health arcs on radar | MEDIUM | MEDIUM | P2 |
| Orbital height UX (km labels) | LOW | LOW | P2 |
| Warp star-streak shader | MEDIUM | HIGH | P2 |

**Priority key:** P1 = ships with v1.1 milestone, P2 = add after validation, P3 = future only

## Competitor Feature Analysis

| Feature | KSP | Elite Dangerous | Homeworld | Endless Space 2 | Our Approach |
|---------|-----|-----------------|-----------|-----------------|--------------|
| Fleet spawning | N/A (solo ship) | NPC wings (2-4 ships, fixed) | Player-controlled squads | AI-controlled flotillas (3 lanes) | Named templates, max 3/wave, role-based mix |
| Fleet behavior | N/A | Loose formation, engage nearest | Explicit formation types | Phase-based advance to range | Anchor-orbit proximity band, no formation geometry |
| Radar | No in-flight minimap | Always-on 2D disc (center = player) | 3D sensor display | Galaxy map (separate screen) | Always-on circle; O key for panel |
| Radar info density | N/A | Contact type, faction, hardpoints | Ship class, health bars | Fleet power ratings | Fleet icon + health arc + faction color |
| Time acceleration | Multi-level (x1–x100000), toggle | No time warp (real-time) | Pause only | N/A (turn-based) | Single level x30, toggle, proximity lock |
| Warp visual | On-rails position jump, no FX | Hyperspace tunnel | N/A | N/A | Star-stretch post-process pass |
| Body collision | Death on contact + respawn | Exclusion zone (no approach) | Indestructible obstacles | N/A | Destroy both player and enemies on contact |
| World boundary | No hard boundary | Bubble ~1000 Ls from arrival | Map edge hard stop | N/A | Radial fence at 1.2x outermost orbit |

## Sources

- [Kerbal Space Program Time Warp Wiki](https://kerbalspaceprogram.fandom.com/wiki/Time_Warp) — warp restrictions, physics vs on-rails modes
- [Kitten Space Agency Time Warp Wiki](https://kittenspaceagency.wiki.gg/wiki/Time_warp) — alt implementation reference
- [SpaceBourne 2 — warp during combat discussion](https://steamcommunity.com/app/1646850/discussions/0/3771239049941978385/) — proximity-based warp lock in practice
- [Elite Dangerous Radar Guide (Steam)](https://steamcommunity.com/app/359320/discussions/0/1735462352467757359/) — contact colors, height indicators, scanner range
- [Elite Dangerous HUD/Center Wiki](https://elite-dangerous.fandom.com/wiki/HUD/Center) — radar layout, contact type encoding
- [Homeworld Formations Wiki](https://homeworld.fandom.com/wiki/Formations) — formation types, strike craft vs capital behavior
- [Homeworld Fleet Composition (Steam)](https://steamcommunity.com/app/244160/discussions/0/617329150699902200/) — vanguard/cannon fodder/escort patterns
- [Endless Space 2 Combat Wiki](https://endless-space-2.fandom.com/wiki/Combat) — flotilla phases, attacker/protector ratios
- [NEBULOUS: Fleet Command Wiki](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/NEBULOUS:_Fleet_Command) — point-cost fleet design, role specialization
- [Gratuitous Space Battles — Wikipedia](https://en.wikipedia.org/wiki/Gratuitous_Space_Battles) — pre-battle fleet planning, AI orders
- [Deep Space Battle Simulator radar update](https://store.steampowered.com/news/app/1055610/view/1804194883968092286) — minimap as community-requested feature
- [Warframe 3D radar discussion](https://forums.warframe.com/topic/334517-archwing-we-need-a-3d-radar-instead-of-the-minimap-for-deep-space-combat/) — why 3D radar fails in practice for orbital games
- [Standard Sci-Fi Fleet (Tropedia)](https://tropedia.fandom.com/wiki/Standard_Sci-Fi_Fleet) — fleet role archetypes in genre
- [Star Trek warp visual timeline (Nerdist)](https://nerdist.com/article/star-trek-warp-speed-visual-timeline/) — canonical visual language for warp effects

---
*Feature research for: Tactical orbital space combat — v1.1 fleet/radar/warp milestone*
*Researched: 2026-03-14*
