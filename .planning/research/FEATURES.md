# Feature Landscape

**Domain:** Tactical orbital space combat (wave-based survival, browser WebGL)
**Researched:** 2026-03-09
**Reference games:** FTL, Homeworld, Gratuitous Space Battles, Star Command, Endless Space 2

## Table Stakes

Features users expect in a tactical space combat game. Missing = combat feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multiple distinct weapon types | Every tactical combat game from FTL to Endless Space 2 has 3-5+ weapon categories with different tradeoffs (range, damage, accuracy, ammo). Players expect meaningful weapon choice. | High | PROJECT.md defines 4: nuclear missile, regular missile, kinetic cannon, plasma gun. This is exactly right -- 4 is the sweet spot for tactical variety without overwhelming a HUD. |
| Weapon cooldowns/ammo | Weapons that fire on demand with no constraint remove all tactical depth. FTL uses charge times + ammo for missiles; Endless Space uses cooldowns. Players expect resource management. | Low | Missiles need fuel/ammo count. Cannon and plasma need cooldown timers. Nuclear needs extreme scarcity (1-2 per run or wave-gated drops). |
| Target selection/assignment | The defining feature of tactical (vs twitch) combat. FTL lets you target specific rooms. Homeworld lets you assign squads to targets. Players must choose WHAT to shoot at. | Medium | Tactical targeting mode (zoom-out, select enemy, assign weapon, fire) is already in PROJECT.md. This is non-negotiable for the genre. |
| Visual damage feedback | Hit confirmation is universally expected -- screen flash, particle burst, damage numbers or health bar change. Without it, combat feels unresponsive. | Medium | Needs: hit flash on enemy, projectile impact particles, hull integrity bar on targeted enemy, screen shake on player hit. Audio is out of scope (no mention of audio system in codebase). |
| Health/hull system with clear display | Player needs to know how close they are to death. Every combat game shows this prominently. | Low | HUD hull integrity bar. Already specified in PROJECT.md. |
| Shield/defense system | Nearly universal in space combat. FTL has layered shields, Star Citizen has directional shields, Endless Space has armor types. Absence feels like a missing limb. | Medium | PROJECT.md specifies kinetic shields (physical debris, not energy barriers). This is a good differentiator while still hitting the table-stakes requirement. |
| Enemy variety (3-5 archetypes) | Level Design Book identifies 6 archetypes: Grunt, Squad, Leader, Tank, Swarm, Sniper. Games with only one enemy type get boring by wave 3. Minimum 3 types, ideally 5. | High | Start with 3 for MVP: Grunt (basic fighter), Bomber (slow, high damage), Swarm (fast, fragile, attacks in groups). Add 2 more post-MVP: Sniper (long range, low HP) and Tank/Capital (slow, heavy, minion-spawner). |
| Wave progression with difficulty scaling | Core loop of wave survival. Every wave-based game scales enemy count, enemy HP, enemy aggression, and/or introduces new enemy types as waves progress. Without scaling, no sense of progression. | Medium | Kill-triggered waves (PROJECT.md) is the right call -- player controls pace. Scale via: more enemies per wave, mix in tougher archetypes at higher waves, increase enemy accuracy/aggression. |
| Death and restart | Players need a failure state and clean restart path. "Game over" screen with stats (waves survived, kills) and restart button. | Low | Ship destruction with explosion already in PROJECT.md. Add: brief stats screen, restart button. |
| Weapon status HUD | Player must see at a glance: which weapon is selected, cooldown/ammo state for all weapons, whether weapons are ready to fire. Standard in every combat game from FTL to Starfield. | Medium | 4-weapon HUD panel. Show: selected weapon highlight, cooldown bar per weapon, ammo count for missiles, nuclear availability. Compact layout -- this is a browser game, not a 4K monitor. |
| Wave/enemy counter | Players need to know how many enemies remain and what wave they're on. Creates tension ("3 left!") and pacing ("wave 12!"). Universal in wave-based games. | Low | Simple HUD element: "WAVE 5 -- 8 HOSTILES". Already in PROJECT.md requirements. |

## Differentiators

Features that set this apart from generic space shooters. Not expected, but create "this is special" moments.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Orbital transfer movement | Almost no combat game uses orbital mechanics for movement. KSP has orbits but no combat. Most space shooters use free flight (WASD). Orbital transfers create a fundamentally different tactical feel -- you commit to maneuvers, position matters relative to gravity wells, and escape is not instant. | Very High | This is the single biggest differentiator. The black hole and 7 planets create a rich gravitational playground. Transfer orbits as the movement model mean positioning IS strategy. |
| Gravity-affected projectiles | Kinetic cannon rounds curving around the black hole. Missiles burning fuel to maintain course against gravity. This is physics-grounded combat that players haven't seen elsewhere. | High | Kinetic cannon already specified as gravity-affected. Plasma gun specified as minimal gravity effect. This creates weapon choice based on geometry -- kinetic works best on targets near you in the gravity well, plasma works at any range but fades. |
| Trajectory preview before firing | Showing the predicted path of a kinetic round before you fire it, accounting for gravity. Like a pool game's guide line but in orbital space. Exists in games like Angry Birds Space but not in tactical combat. | Medium | Natural extension of the nav mode trajectory system that already exists. Apply same line-drawing to weapon projectile paths. Huge tactical depth -- you can see if your shot will curve into the target or miss into the black hole. |
| Black hole as environmental hazard | The black hole is not just scenery -- it eats projectiles, pulls ships, and creates no-go zones. Players must account for it in every engagement. Very few games have a central gravity well as an active combat element. | Medium | Already present as the scene's centerpiece. Combat near the event horizon is high-risk/high-reward. Enemies can be lured into it. Projectiles near it curve unpredictably. |
| Volumetric nuclear detonations | The existing detonation shader is spectacular -- real volumetric fireballs with debris shells and bloom. Most browser games have sprite explosions. Having a visceral, physically-modeled nuclear explosion as a rare super-weapon is a standout moment. | Already built | 6 detonation shader slots exist. Nuclear missile system partially built. This is a differentiator that's already done. |
| Boss waves with unique mechanics | Every N waves, a capital ship / special encounter. Bosses with multiple phases (shields first, then hull, then weak point), minion spawning, and unique attack patterns. FTL's flagship is a 3-phase boss that's the highlight of the game. | High | Multi-phase bosses that use the orbital environment: a boss that orbits close to the black hole forcing you to fight in high-gravity, or one that deploys shield drones you must destroy first. |
| Tactical zoom (macro view) | Zooming out to see the entire system, with all enemies as icons, planning weapon assignments, then zooming back in. Homeworld's strategic zoom is beloved. Most browser games don't have this scale. | Medium | Already conceptualized in PROJECT.md as "tactical targeting mode." The orbital scale of the scene (black hole + 7 planets) makes this feel grand rather than gimmicky. |
| Kinetic shields as physical objects | Instead of an energy barrier that absorbs damage abstractly, physical debris objects that block projectiles by being in the way. Visible, destructible, repositionable. More tactile than a glowing shield bubble. | High | Specified in PROJECT.md. This is unusual -- most games use energy shields. Physical shields create interesting tradeoffs: they block your own fire too, they have blind spots, they can be destroyed individually. |

## Anti-Features

Features to explicitly NOT build. Each would be a trap that adds complexity without proportional value.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Free flight (WASD movement) | Breaks the orbital mechanics differentiator. Free flight reduces space to "underwater airplane." Orbital transfers force commitment and planning -- the whole tactical identity. Also, camera/control system would need a complete rewrite. | Orbital transfer only. Select a body, compute transfer, fly the trajectory. Altitude adjustment within an orbit for fine positioning. |
| Energy shields / force fields | Generic and overdone. Energy shields are invisible damage sponges that add nothing visually. The kinetic shield concept (physical debris objects) is far more interesting and physically grounded. | Kinetic shields: visible debris objects that physically block projectiles. Players can see them get destroyed, understand coverage gaps. |
| Crew management / subsystems | FTL's depth comes from crew + subsystems, but it's a fundamentally different game. Adding rooms, crew, power routing, and subsystem targeting would bloat scope enormously for a browser game embedded in a portfolio site. | Treat the ship as a single entity with hull HP, shields, and weapons. No internal systems to manage. |
| Resource gathering / crafting | Out of scope for wave survival. Gathering asteroids or crafting weapons mid-combat breaks flow and requires inventory systems, crafting UI, resource economies. Massive scope increase. | Weapons are fixed at game start. Ammo/fuel for missiles could regenerate slowly or drop from kills, but no crafting/gathering loop. |
| Fleet command / multiple ships | Homeworld and GSB are fleet games, but commanding multiple ships requires squad AI, formations, pathfinding, and a completely different control scheme. One ship is enough for a browser game. | Single player ship. The "fleet" feel comes from many enemies, not many friendlies. |
| Multiplayer / PvP | Requires server infrastructure, netcode, matchmaking, latency compensation. Incompatible with a static GitHub Pages site. | Single player wave survival only. |
| Upgrade/progression between waves | Shop screens, upgrade trees, and persistent progression between waves add a roguelite meta-loop that's a huge design + UI undertaking. | Keep it pure survival -- difficulty comes from wave scaling, not from upgrades. If rewards feel needed later, a simple ammo/fuel resupply between waves is enough. |
| Minimap / radar | The tactical zoom IS the minimap. A separate radar overlay would clutter the HUD and duplicate information the zoom-out view already provides. | Tactical zoom to see full system. Enemy indicators at screen edges when zoomed in (chevrons pointing toward off-screen enemies). |
| Complex formation/stance system | Homeworld's formations and tactics stances require multi-unit selection and AI behavior trees. Overkill for a single-ship game. | No formations. Player controls one ship. Enemy formations can be pre-scripted per wave definition rather than AI-driven. |
| Story / campaign / dialogue | Narrative requires writing, potentially art, dialogue UI, mission structure, save states. This is a portfolio site game, not a narrative RPG. | Endless wave survival. Story is emergent: "I survived 25 waves near the black hole." |

## Feature Dependencies

```
Orbital Movement ──────────────────────────────────────┐
  ├── Transfer Orbit Computation                       │
  ├── Orbit Altitude Adjustment                        │
  └── Trajectory Preview (nav mode, already exists)    │
                                                       ▼
Target Selection ──► Weapon Assignment ──► Fire Command ──► Projectile Simulation
       │                    │                                     │
       │                    ▼                                     ▼
       │            Cooldown/Ammo System              Gravity-Affected Flight
       │                                                     │
       ▼                                                     ▼
Enemy Rendering ──► Enemy AI (approach, attack, evade) ──► Collision Detection
       │                    │                                     │
       │                    ▼                                     ▼
       │            Wave Spawning System              Hit Detection + Damage
       │                    │                                     │
       │                    ▼                                     ▼
       │            Difficulty Scaling                Visual Damage Feedback
       │                    │                              │
       │                    ▼                              ▼
       │            Boss Wave System               Ship Destruction + Game Over
       │                                                  │
       ▼                                                  ▼
Enemy Variety ──────────────────────────────────── Restart Flow
(archetypes added incrementally)

Shield System (independent, can be added any time after core combat works)
  ├── Kinetic Shield Objects (physical debris)
  ├── Shield Damage / Destruction
  └── Shield Coverage Gaps (directional vulnerability)

HUD (parallel track, can develop alongside combat systems)
  ├── Hull Integrity Bar
  ├── Weapon Status Panel (4 weapons + cooldowns/ammo)
  ├── Wave Counter + Enemy Count
  ├── Shield Status Indicator
  └── Orbit Info (current body, altitude, transfer status)
```

## MVP Recommendation

The minimum viable combat experience that feels complete:

**Priority 1 -- Core Loop (must ship together):**
1. Player ship visible and moving via orbital transfers (differentiator, foundational)
2. One weapon working end-to-end: kinetic cannon (fire, gravity-affected flight, hit detection, enemy damage, enemy death)
3. Basic enemy type (Grunt) that approaches and fires at player
4. Hull integrity + death + restart
5. Wave spawning (kill all enemies -> next wave, scaling enemy count)
6. Minimal HUD: hull bar, wave counter, weapon status

**Priority 2 -- Tactical depth (makes it a real game):**
7. All 4 weapon types working (kinetic, plasma, missile, nuclear)
8. Tactical zoom with target selection
9. Cooldown/ammo system
10. 3 enemy archetypes (Grunt, Bomber, Swarm)
11. Visual damage feedback (hit flash, impact particles, screen shake)

**Priority 3 -- Polish and differentiation:**
12. Kinetic shields
13. Trajectory preview for weapons
14. Boss waves every N waves
15. 5 enemy archetypes (add Sniper, Capital)
16. Death stats screen (waves survived, enemies killed, time survived)
17. Off-screen enemy indicators

**Defer indefinitely:**
- Upgrades/progression between waves (scope trap)
- Multiple player ships (scope trap)
- Resource gathering (wrong genre for this game)

## Enemy Archetype Details

Based on the Level Design Book's enemy design framework (Near, Far, Swarmer, Heavy) adapted for orbital space combat:

| Archetype | Behavior | Speed | HP | Damage | Attack Range | When Introduced |
|-----------|----------|-------|-----|--------|-------------|-----------------|
| **Grunt** | Orbits nearby body, fires at player when in range. Basic enemy. | Medium | Low | Low | Medium | Wave 1 |
| **Swarm** | Fast, fragile, attacks in groups of 5-8. Overwhelms through numbers. | High | Very Low | Low | Short | Wave 3 |
| **Bomber** | Slow approach, fires high-damage missiles. Dangerous if ignored. | Slow | Medium | High | Long | Wave 5 |
| **Sniper** | Stays at extreme range, fires accurate shots. Must be hunted. | Low | Low | Medium | Very Long | Wave 8 |
| **Capital** | Large, slow, high HP. Spawns Grunt minions. Mini-boss. | Very Slow | Very High | Medium | Medium | Wave 10+ |

Key design principle: each archetype demands a different weapon response. Grunts are kinetic cannon targets (easy to lead). Swarms demand plasma gun (area/fast fire). Bombers need missiles (reach them before their missiles reach you). Snipers need missiles or long-range plasma. Capitals need sustained kinetic fire + nuclear for phase transitions.

## Weapon-Enemy Interaction Matrix

| Weapon | vs Grunt | vs Swarm | vs Bomber | vs Sniper | vs Capital |
|--------|----------|----------|-----------|-----------|------------|
| Kinetic Cannon | Excellent (easy to lead) | Poor (too fast/small) | Good (slow target) | Poor (too far) | Good (sustained damage) |
| Plasma Gun | Good | Excellent (fast fire, area) | Fair | Good (long range) | Fair (fades over distance) |
| Regular Missile | Overkill | Poor (waste of ammo) | Excellent (counter-missile) | Excellent (guided) | Good (multiple needed) |
| Nuclear Missile | Overkill | Excellent (area wipe) | Overkill | N/A | Excellent (boss killer) |

This matrix ensures no single weapon dominates. Players must switch weapons based on the enemy mix in each wave, which is the core of tactical combat.

## Sources

- [FTL Weapons Wiki](https://ftl.fandom.com/wiki/Weapons) -- weapon categories and shield-piercing mechanics
- [FTL Systems Wiki](https://ftl.fandom.com/wiki/Systems) -- combat subsystems design
- [Gratuitous Space Battles - Wikipedia](https://en.wikipedia.org/wiki/Gratuitous_Space_Battles) -- pre-battle planning, fleet composition
- [Star Command - Wikipedia](https://en.wikipedia.org/wiki/Star_Command_(2013_video_game)) -- weapon types and targeting mini-games
- [Homeworld Formations Wiki](https://homeworld.fandom.com/wiki/Formations) -- squad control and tactical stances
- [Homeworld Tactics Wiki](https://homeworld.fandom.com/wiki/Tactics) -- aggressive/evasive behavior settings
- [Endless Space 2 Weapons](https://endless-space-2.fandom.com/wiki/Modules/Weapon) -- weapon type categories and defense counters
- [Enemy Design - Level Design Book](https://book.leveldesignbook.com/process/combat/enemy) -- 6 enemy archetypes, design principles
- [Wave Survival Design - Medium](https://medium.com/@victormct/unleashing-chaos-mastering-enemy-waves-9be16f92e673) -- difficulty scaling, spawn patterns
- [Boss Battle Design - Game Developer](https://www.gamedeveloper.com/design/boss-battle-design-and-structure) -- multi-phase boss design
- [Damage Feedback in Games - CBR](https://www.cbr.com/video-game-damage-feedback/) -- hit confirmation, visual feedback principles
- [Juicy Damage Feedback - Medium](https://acagamic.medium.com/juicy-damage-feedback-in-games-7c1758d69a42) -- feedback techniques for combat
