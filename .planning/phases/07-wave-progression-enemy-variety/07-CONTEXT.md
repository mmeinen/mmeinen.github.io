# Phase 7: Wave Progression & Enemy Variety - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Wave-based survival with kill-triggered progression, 4 new enemy archetypes (Swarm, Bomber, Sniper, Capital), boss encounters every 10 waves, and difficulty scaling that ramps through archetype mix and per-archetype stats over ~50 waves. Requirements: ENM-02, ENM-03, ENM-04, ENM-05, ENM-07, ENM-08, ENM-09.

</domain>

<decisions>
## Implementation Decisions

### Archetype behaviors
- **Swarm** (wave 3+): Converging rush — group of 5-8 spawns spread out, then all converge on player simultaneously from different angles. No projectiles — close-range burst/ram damage. Individually fragile, dangerous in a pack
- **Bomber** (wave 5+): Missile salvos — approaches slowly on transfer orbit, stops at medium range, fires guided missiles (reuse Phase 4 missile system). High damage per salvo, long reload between salvos. Must be prioritized or player faces sustained missile fire
- **Sniper** (wave 8+): Long-range kinetic volley — fires a burst of 3 kinetic rounds from extreme range. More accurate than Grunts. Stays far away. Reuses existing kinetic projectile system with higher accuracy and burst fire
- **Capital** (wave 10+): Large slow mini-boss — sits at planet orbit, periodically spawns 2-3 Grunts every ~10s that launch immediately to attack. Capital itself fires slow heavy shots. Player must decide: kill Capital to stop minion flow, or clear Grunts first to reduce incoming fire

### Archetype visual identity
- Very distinct procedural geometry per archetype — each gets its own create*Geometry() function in math.js
- Swarm: small dart/wedge shape (fast, minimal)
- Bomber: bulky wide hull (heavy ordnance carrier)
- Sniper: long thin needle shape (precision, range)
- Capital: large multi-section cruiser, entirely new geometry distinct from player's capital ship. 200-300 tris since only 1-2 spawn per wave
- Capital rendered at 4-5x Grunt scale — massive battlefield presence, dramatically larger than all other enemies

### Archetype colors (threat-coded)
- Grunt: red (255,80,60) — already exists
- Swarm: yellow/amber — fast, warning
- Bomber: purple/magenta — heavy ordnance
- Sniper: cyan/teal — cold precision
- Capital: bright white/silver — boss presence
- Off-screen indicator colors in Phase 6 already support 5-color array — wire these in

### Wave spawning
- Kill-triggered: clearing all enemies in current wave triggers next wave after 3-5 second breather
- Brief "WAVE X" text flash during the breather gap
- Enemies spawn distributed across planets in station-keeping positions (like current spawnTestEnemies()), then activate AI
- Replace hardcoded spawnTestEnemies() with wave-driven spawner

### Wave scaling
- Start at 6-8 enemies (wave 1, all Grunts)
- Enemy count grows slowly — ~+1 per wave on average, reaching MAX_ENEMIES (64) around wave 50
- Difficulty ramp is steep through archetype mix and per-archetype stats, not raw numbers
- Archetype introductions: Swarm@3, Bomber@5, Sniper@8, Capital@10+
- Each wave increases the ratio of harder archetypes in the mix

### Difficulty scaling (archetype-driven)
- Each archetype has its own accuracy/aggression profile that scales independently with wave number
- Snipers always high accuracy, Swarm always high aggression, etc.
- Per-archetype stats (detection range, attack frequency, lead prediction noise) scale with wave
- No single global difficulty factor — each type gets tuned separately

### Boss waves
- Boss waves every 10 waves (10, 20, 30...)
- Boss wave = 1+ Capital ships with minion spawning + supporting cast of hardest unlocked archetypes
- Wave 10 (first boss): 1 Capital solo with its spawned minions only — clean introduction of the Capital mechanic
- Later bosses: more Capitals + heavier support. Capital count increases at higher boss tiers
- Capital ships get a localized warp-in visual effect at their spawn location (distortion/flash), not just a pop-in

### Claude's Discretion
- Exact geometry designs for each archetype (tri counts, proportions, profile shapes)
- Swarm ram/burst damage values and close-range threshold
- Bomber missile count per salvo, reload timing, and approach distance
- Sniper burst fire timing, accuracy noise per wave, and range threshold
- Capital heavy shot type (kinetic or unique), spawn interval tuning, HP value
- Wave definition data format (table-driven vs formula-driven)
- Exact enemy count formula per wave (targeting ~64 at wave 50)
- Per-archetype scaling curves (linear, logarithmic, etc.)
- Spawn location selection algorithm (which planets, distribution)
- Warp-in visual effect implementation (shader distortion, billboard flash, etc.)
- Breather duration tuning (3-5s range)
- Wave announcement text styling and duration
- MAX_ENEMIES slot management when Capital minion spawns push toward limit

</decisions>

<specifics>
## Specific Ideas

- Swarm converging rush should feel overwhelming in numbers — multiple angles of approach, player must decide which cluster to thin first
- Bomber as a "priority target" archetype — if you ignore them, guided missiles keep coming. Creates target prioritization gameplay
- Sniper burst of 3 rounds from extreme range makes them a persistent annoyance that forces repositioning
- Capital periodic minion spawning creates a ticking clock — the longer the Capital lives, the more Grunts flood the field
- Capital at 4-5x Grunt scale should be an unmistakable battlefield landmark — you see it and know what you're dealing with
- Capital warp-in effect localized to the enemy's position gives a dramatic entrance without global screen effects
- Wave 10 first boss is a clean Capital solo — teaches the mechanic without overwhelming. Later bosses scale up
- Difficulty comes from archetype mix, not just numbers — wave 20 with Snipers + Bombers + Swarm is harder than wave 20 with just more Grunts
- Long climb to MAX_ENEMIES (~50 waves) means performance stays stable for the vast majority of play sessions

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `combat.js` SoA enemy store: 64-slot store with ETYPE, ARCHETYPE_COLORS, ARCHETYPE_SCALES, ARCHETYPE_HP arrays — extend with 4 new archetype entries
- `spawnEnemy(x, y, z, type, assignBody, stationPhase)`: Already accepts type parameter — new archetypes just need new type values
- `createGruntGeometry()` (math.js): Template for procedural enemy geometry — follow pattern for 4 new create*Geometry() functions
- `missiles.js` missile SoA store with PN guidance: Reuse directly for Bomber missile salvos (enemy-fired missiles)
- `weapons.js` kinetic projectile SoA: Reuse for Sniper burst fire (type=2 enemy rounds already exist)
- `spawnTestEnemies()` (index.html): Current hardcoded spawn logic — replace with wave spawner
- `particles.js` ARCHETYPE_COLORS array: Already indexed by enemy type for impact spark colors
- Off-screen indicator colors (nav.js): 5-color array already prepared for Phase 7 archetypes
- `updateEnemyAI()` (combat.js): 6-state AI machine — extend with archetype-specific behavior branches
- Instance buffer (10 floats per instance): Supports per-instance scale and color — new archetypes just need different ARCHETYPE_SCALES/COLORS values

### Established Patterns
- SoA entity store with free-list allocation (combat.js, weapons.js, missiles.js, particles.js)
- Instanced rendering via ANGLE_instanced_arrays for all combat entities
- Leapfrog integration for gravity-affected physics
- AI state machine pattern: idle→alert→transfer→attack→disengage→reorbit
- Enemy shader: instanced vertex/fragment with per-instance color, scale, flash
- Additive blending for bright effects
- Billboard explosion system for combat detonations

### Integration Points
- Wave spawner replaces spawnTestEnemies() — called from game loop when wave cleared
- New geometry functions registered alongside createGruntGeometry() — selected per archetype type at render time
- Archetype AI branches inside updateEnemyAI() — type-switch for Swarm rush, Bomber salvo, Sniper volley, Capital spawn
- Bomber missiles: enemy-fired missiles added to missile SoA with enemy as source
- Sniper burst: enemy-fired kinetic rounds added to weapons SoA projectile store
- Wave state (current wave, enemies remaining) tracked for Phase 8 HUD consumption
- resetCombat() (nav.js): Reset wave counter and spawner state on restart

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-wave-progression-enemy-variety*
*Context gathered: 2026-03-12*
