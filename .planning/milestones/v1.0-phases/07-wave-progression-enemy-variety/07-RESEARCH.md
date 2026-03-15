# Phase 7: Wave Progression & Enemy Variety - Research

**Researched:** 2026-03-12
**Domain:** Wave-based spawning systems, enemy archetype AI branching, procedural geometry (4 new archetypes), multi-geometry instanced rendering, difficulty scaling curves, boss encounter design
**Confidence:** HIGH

## Summary

Phase 7 transforms the combat from a static 8-Grunt encounter into a wave-based survival challenge with 5 distinct enemy archetypes, boss encounters, and scaling difficulty. The codebase is extremely well-prepared: the SoA enemy store in `combat.js` already parameterizes type, scale, HP, and color per slot. The instance buffer carries per-instance color/scale/flash so different archetypes need zero rendering pipeline changes -- they simply get different values in `ARCHETYPE_COLORS`, `ARCHETYPE_SCALES`, and `ARCHETYPE_HP`. The AI state machine is a single switch-on-state block that can branch on `enemies.type[i]` for archetype-specific behavior. The missile system in `missiles.js` provides ready-made PN-guided missiles that Bombers can fire at the player (currently player-only, but the SoA store has no owner constraint). The projectile system in `weapons.js` supports type=2 enemy kinetic rounds that Snipers can fire in bursts.

The **one significant architectural change** is rendering. Currently all enemies share a single Grunt geometry VBO/IBO, drawn in one `drawElementsInstancedANGLE` call. With 5 archetypes having different geometry, we need **multiple instanced draw calls** -- one per archetype that has live instances. This means: (1) create geometry VBOs for each archetype at init, (2) partition the instance buffer by archetype when packing, (3) issue separate instanced draws per archetype. This is the standard WebGL 1.0 pattern for multi-mesh instancing (WebGL 1.0 has no indirect draw or multi-draw). With at most 5 archetypes and 64 max enemies, the overhead of 5 draw calls is negligible.

The **second significant concern** is MAX_ENEMIES slot management. Capital ships spawn 2-3 Grunt minions every ~10s. With 64 slots total and potential wave sizes reaching 50+ enemies near wave 50, the spawner must reserve slots and the Capital AI must check `freeSlots.length` before spawning minions. The wave spawner should also cap its spawn count at available slots.

**Primary recommendation:** Extend ETYPE with 4 new archetype constants. Create 4 new geometry functions in math.js. Refactor enemy rendering to multi-geometry instanced draws (one per archetype). Add archetype-specific AI branches inside `updateEnemyAI()`. Build a wave spawner module that replaces `spawnTestEnemies()`. Use a formula-driven wave definition system (not table-driven) for scaling to 50+ waves.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Swarm** (wave 3+): Converging rush -- group of 5-8 spawns spread out, then all converge on player simultaneously from different angles. No projectiles -- close-range burst/ram damage. Individually fragile, dangerous in a pack
- **Bomber** (wave 5+): Missile salvos -- approaches slowly on transfer orbit, stops at medium range, fires guided missiles (reuse Phase 4 missile system). High damage per salvo, long reload between salvos. Must be prioritized or player faces sustained missile fire
- **Sniper** (wave 8+): Long-range kinetic volley -- fires a burst of 3 kinetic rounds from extreme range. More accurate than Grunts. Stays far away. Reuses existing kinetic projectile system with higher accuracy and burst fire
- **Capital** (wave 10+): Large slow mini-boss -- sits at planet orbit, periodically spawns 2-3 Grunts every ~10s that launch immediately to attack. Capital itself fires slow heavy shots. Player must decide: kill Capital to stop minion flow, or clear Grunts first to reduce incoming fire
- Very distinct procedural geometry per archetype -- each gets its own create*Geometry() function in math.js
- Swarm: small dart/wedge shape (fast, minimal)
- Bomber: bulky wide hull (heavy ordnance carrier)
- Sniper: long thin needle shape (precision, range)
- Capital: large multi-section cruiser, entirely new geometry distinct from player's capital ship. 200-300 tris since only 1-2 spawn per wave
- Capital rendered at 4-5x Grunt scale -- massive battlefield presence
- Grunt: red (255,80,60) -- already exists
- Swarm: yellow/amber -- fast, warning
- Bomber: purple/magenta -- heavy ordnance
- Sniper: cyan/teal -- cold precision
- Capital: bright white/silver -- boss presence
- Off-screen indicator colors in Phase 6 already support 5-color array -- wire these in
- Kill-triggered: clearing all enemies in current wave triggers next wave after 3-5 second breather
- Brief "WAVE X" text flash during the breather gap
- Enemies spawn distributed across planets in station-keeping positions (like current spawnTestEnemies()), then activate AI
- Replace hardcoded spawnTestEnemies() with wave-driven spawner
- Start at 6-8 enemies (wave 1, all Grunts)
- Enemy count grows slowly -- ~+1 per wave on average, reaching MAX_ENEMIES (64) around wave 50
- Difficulty ramp is steep through archetype mix and per-archetype stats, not raw numbers
- Archetype introductions: Swarm@3, Bomber@5, Sniper@8, Capital@10+
- Each wave increases the ratio of harder archetypes in the mix
- Each archetype has its own accuracy/aggression profile that scales independently with wave number
- No single global difficulty factor -- each type gets tuned separately
- Boss waves every 10 waves (10, 20, 30...)
- Boss wave = 1+ Capital ships with minion spawning + supporting cast of hardest unlocked archetypes
- Wave 10 (first boss): 1 Capital solo with its spawned minions only
- Later bosses: more Capitals + heavier support
- Capital ships get a localized warp-in visual effect at their spawn location

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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENM-02 | Swarm enemy archetype -- fast, fragile, attacks in groups of 5-8 (introduced wave 3) | New ETYPE.SWARM constant; createSwarmGeometry() for dart/wedge mesh; AI converging rush behavior branch; ram/burst damage on close proximity; yellow/amber archetype color |
| ENM-03 | Bomber enemy archetype -- slow approach, fires high-damage missiles, dangerous if ignored (introduced wave 5) | New ETYPE.BOMBER constant; createBomberGeometry() for bulky hull; AI branch for slow approach + stop + missile salvo; enemy-fired missiles via missile SoA store (source=enemy); purple/magenta color |
| ENM-04 | Sniper enemy archetype -- stays at extreme range, fires accurate shots, low HP (introduced wave 8) | New ETYPE.SNIPER constant; createSniperGeometry() for needle shape; AI branch for hold-at-range behavior; burst fire 3 kinetic rounds (type=2) with reduced noise; cyan/teal color |
| ENM-05 | Capital enemy archetype -- large, slow, high HP, spawns Grunt minions as mini-boss (introduced wave 10+) | New ETYPE.CAPITAL constant; createEnemyCapitalGeometry() for cruiser mesh at 200-300 tris; AI branch for station-keeping + minion spawning every ~10s; heavy shot firing; 4-5x scale; white/silver color; warp-in VFX |
| ENM-07 | Kill-triggered wave spawning -- clearing current wave triggers next wave | Wave state machine (waiting/active/breather) tracking enemyCount; breather timer 3-5s; "WAVE X" announcement text; replaces spawnTestEnemies() |
| ENM-08 | Boss waves appear every N waves as special encounters | Boss detection via wave % 10 === 0; Capital count scales with boss tier; supporting cast from hardest unlocked archetypes; wave 10 = solo Capital introduction |
| ENM-09 | Difficulty scales with wave number -- increasing enemy count, aggression, accuracy, and archetype variety | Per-archetype stat curves (accuracy noise, detection range, attack frequency, lead prediction quality); enemy count formula ~6 + wave*1.2 clamped to 64; archetype ratio shifts toward harder types |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WebGL 1.0 | Browser native | All rendering | Already in use; no dependencies |
| ANGLE_instanced_arrays | WebGL 1 ext | Multi-geometry instanced enemy draw | Already in use; extend to per-archetype draw calls |
| Float32Array / Uint8Array | ES6 built-in | SoA entity stores | Established pattern across combat.js, weapons.js, missiles.js, particles.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS transitions | Browser native | Wave announcement text fade | "WAVE X" flash during breather |
| localStorage | Browser native | High score persistence | Already wired in Phase 6 for wavesSurvived tracking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-archetype draw calls | Combined super-mesh with vertex offset per archetype | Less overhead but complex geometry management; not worth it for 5 archetypes |
| Formula-driven wave definitions | Table-driven wave arrays | Tables are explicit but unwieldy for 50+ waves; formulas are concise and infinitely scalable |
| DOM wave announcement | WebGL text rendering | DOM is simpler, already used for HUD elements; no need for bitmap font system |

## Architecture Patterns

### Recommended Module Structure
```
js/scene/
  combat.js     # Extend: ETYPE enum, ARCHETYPE_* arrays, AI branches, Capital minion spawning
  math.js       # Add: createSwarmGeometry(), createBomberGeometry(), createSniperGeometry(), createEnemyCapitalGeometry()
  waves.js      # NEW: Wave state machine, wave spawner, difficulty scaling, boss wave logic
  weapons.js    # Extend: enemy burst fire for Sniper, enemy missile firing for Bomber
  missiles.js   # Extend: enemy-fired missiles (source tracking, player-target)
index.html      # Extend: multi-geometry instanced rendering, wave announcement DOM, warp-in VFX
```

### Pattern 1: Multi-Geometry Instanced Rendering
**What:** One instanced draw call per archetype with different geometry VBOs
**When to use:** When different enemy types need distinct meshes but share the same shader
**Example:**
```javascript
// At init: create geometry buffers per archetype
const archetypeGeo = [
  createGruntGeoBuffers(gl),      // type 0
  createSwarmGeoBuffers(gl),      // type 1
  createBomberGeoBuffers(gl),     // type 2
  createSniperGeoBuffers(gl),     // type 3
  createCapitalGeoBuffers(gl),    // type 4
];

// At render: partition instanceData by type, draw each
for (let t = 0; t < archetypeGeo.length; t++) {
  const count = packInstancesByType(t, instanceData, tempBuf);
  if (count === 0) continue;
  const geo = archetypeGeo[t];
  gl.bindBuffer(gl.ARRAY_BUFFER, geo.posBuf);
  gl.vertexAttribPointer(enemyLocs.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, geo.nrmBuf);
  gl.vertexAttribPointer(enemyLocs.aNorm, 3, gl.FLOAT, false, 0, 0);
  // Upload partitioned instance data
  gl.bindBuffer(gl.ARRAY_BUFFER, enemyInstBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, tempBuf.subarray(0, count * ENEMY_INST_FLOATS));
  // ... set instance attrib pointers ...
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.idxBuf);
  iExt.drawElementsInstancedANGLE(gl.TRIANGLES, geo.idxCount, gl.UNSIGNED_SHORT, 0, count);
}
```

### Pattern 2: Archetype-Branched AI State Machine
**What:** Type-switch inside existing AI states for archetype-specific behavior
**When to use:** Each archetype behaves differently within the same state machine framework
**Example:**
```javascript
// Inside updateEnemyAI(), at AI_ATTACK state:
case AI_ATTACK: {
  const type = enemies.type[i];
  if (type === ETYPE.SWARM) {
    // Converging rush: accelerate directly toward player
    // Ram damage on close proximity
  } else if (type === ETYPE.BOMBER) {
    // Stop at medium range, fire missile salvo
    // Long reload between salvos
  } else if (type === ETYPE.SNIPER) {
    // Hold at extreme range, fire 3-round burst
    // High accuracy (low noise)
  } else if (type === ETYPE.CAPITAL) {
    // Station-keep, fire slow heavy shots
    // Periodically spawn Grunt minions
  } else {
    // Default Grunt behavior (existing code)
  }
  break;
}
```

### Pattern 3: Formula-Driven Wave Definitions
**What:** Compute wave composition from wave number using formulas, not static tables
**When to use:** When wave count is unbounded (50+ waves) and scaling must be smooth
**Example:**
```javascript
function getWaveDefinition(waveNum) {
  const totalEnemies = Math.min(MAX_ENEMIES, Math.floor(6 + waveNum * 1.2));

  // Boss wave check
  if (waveNum % 10 === 0 && waveNum >= 10) {
    return buildBossWave(waveNum, totalEnemies);
  }

  // Archetype availability by wave
  const types = [ETYPE.GRUNT];
  if (waveNum >= 3) types.push(ETYPE.SWARM);
  if (waveNum >= 5) types.push(ETYPE.BOMBER);
  if (waveNum >= 8) types.push(ETYPE.SNIPER);

  // Weighted random selection (harder types get more weight at higher waves)
  return buildWaveFromWeights(waveNum, totalEnemies, types);
}
```

### Pattern 4: Wave State Machine
**What:** Simple state machine managing wave lifecycle
**When to use:** Kill-triggered progression with breather periods
**Example:**
```javascript
const WAVE_IDLE = 0;      // No wave active (pre-game)
const WAVE_ACTIVE = 1;    // Wave in progress, enemies alive
const WAVE_BREATHER = 2;  // Breather gap between waves
const WAVE_SPAWNING = 3;  // Spawning next wave

let waveState = WAVE_IDLE;
let waveNumber = 0;
let waveBreatherTimer = 0;

function updateWaveSystem(simDt) {
  switch (waveState) {
    case WAVE_ACTIVE:
      if (enemyCount === 0) {
        waveState = WAVE_BREATHER;
        waveBreatherTimer = 0;
        showWaveAnnouncement(waveNumber + 1);
      }
      break;
    case WAVE_BREATHER:
      waveBreatherTimer += simDt;
      if (waveBreatherTimer >= BREATHER_DURATION) {
        waveNumber++;
        spawnWave(waveNumber);
        waveState = WAVE_ACTIVE;
      }
      break;
  }
}
```

### Anti-Patterns to Avoid
- **Hardcoded wave tables for 50+ waves:** Becomes unmaintainable. Use formulas with explicit archetype introduction thresholds.
- **Single global difficulty multiplier:** Loses per-archetype tuning. Each archetype must scale independently.
- **Spawning all enemies at once with Capital minions present:** Can exceed MAX_ENEMIES. Reserve slots for Capital minion spawns.
- **New SoA arrays in combat.js for every archetype-specific field:** Wastes memory across all 64 slots. Reuse existing fields (e.g., `aiTimer` for Bomber reload, `hasFired` for burst count) or add only universally needed fields.
- **Separate shader programs per archetype:** Unnecessary. The enemy shader already handles per-instance color/scale/flash. Different geometry is the only change, handled by different VBOs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Guided enemy missiles | Custom missile guidance for Bombers | Reuse `missiles.js` PN guidance (swap target from enemy to player) | PN guidance is already tuned and handles fuel, proximity detonation, coast phase |
| Enemy burst fire | Custom burst system for Snipers | Extend existing `kineticBurstRemaining` pattern from weapons.js | Burst timing, stagger, and projectile spawning already solved |
| Procedural geometry | Complex mesh generators | Follow `createGruntGeometry()` pattern exactly: tri/quad helpers, flat-shading normals | The Grunt geometry function is the template; consistent style matters |
| Wave announcement | WebGL text rendering | DOM element with CSS animation | HUD is already DOM-based; CSS transitions for fade-in/out are trivial |
| Spawn location selection | Complex distribution algorithm | Reuse `spawnTestEnemies()` pattern: iterate planets, place at station-keeping positions | The existing pattern distributes enemies naturally across the orbital system |

**Key insight:** This phase extends existing systems far more than it creates new ones. The missile system, projectile system, AI state machine, SoA pattern, and rendering pipeline all already exist. The new code is primarily wave management logic and archetype-specific AI branches.

## Common Pitfalls

### Pitfall 1: MAX_ENEMIES Exhaustion from Capital Minion Spawns
**What goes wrong:** Capital ships spawn minions every ~10s. If 2 Capitals are active and the wave already has 60 enemies, minion spawns silently fail (spawnEnemy returns -1) or worse, the wave never clears because minions keep replacing killed enemies.
**Why it happens:** The spawner doesn't account for Capital minion production when planning wave size.
**How to avoid:** (1) The wave spawner must reserve slots: `waveSize = min(totalEnemies, MAX_ENEMIES - capitalCount * 6)` to leave room for minion production. (2) Capital minion spawning must check `freeSlots.length > 0`. (3) Minions spawned by Capitals count toward wave kills -- when the Capital dies, its remaining future minions don't need to be killed.
**Warning signs:** Waves that never clear because new minions replace killed enemies indefinitely.

### Pitfall 2: Instance Buffer Partitioning Order Mismatch
**What goes wrong:** The multi-geometry rendering partitions enemies by type to issue separate draw calls. If the partition packing order doesn't match the geometry VBO binding, enemies render with the wrong mesh.
**Why it happens:** The `updateInstanceBuffer()` function currently packs all enemies in slot order regardless of type. With per-archetype draws, it must pack by type.
**How to avoid:** Refactor `updateInstanceBuffer()` to return per-type counts. Pack instances grouped by type: all Grunts first, then all Swarms, etc. Each draw call uses the correct geometry VBO with the correct slice of the instance buffer.
**Warning signs:** Enemies appearing with the wrong geometry (dart-shaped enemy that acts like a Capital).

### Pitfall 3: Enemy-Fired Missiles Targeting Dead Player
**What goes wrong:** Bomber fires missiles targeting player position. Player dies. Missiles continue seeking the dead player's last position, or worse, crash when accessing flyPos of a dead player.
**Why it happens:** The existing missile system targets enemies by slot index. Enemy-fired missiles targeting "the player" don't have an index -- they target a position.
**How to avoid:** Enemy-fired missiles should either: (1) use a special targetIdx value (e.g., -1 = player) and read flyPos live, or (2) self-destruct when `!playerState.alive`. The `updateMissiles()` function already handles invalid targets by removing the missile.
**Warning signs:** Missiles orbiting the player's death location, or null reference errors on player position.

### Pitfall 4: Swarm Ram Damage Applied Every Frame
**What goes wrong:** Swarm enemies deal ram damage on close proximity. Without a damage cooldown, a Swarm touching the player deals damage every frame (60 DPS at 1 damage/frame).
**Why it happens:** Proximity check runs in the update loop without a per-enemy damage cooldown.
**How to avoid:** Add a ram damage cooldown per Swarm enemy (e.g., `aiTimer` tracks time since last ram damage, minimum 0.5s between hits). Or: Swarm deals a single burst of damage on entering close range, then must disengage and re-approach.
**Warning signs:** Player HP dropping to zero in a single frame from a Swarm pack.

### Pitfall 5: Wave Announcement Blocking Input
**What goes wrong:** The "WAVE X" text is a DOM overlay that captures pointer events, blocking player clicks during the breather period.
**Why it happens:** New DOM elements default to capturing pointer events.
**How to avoid:** Set `pointer-events: none` on the wave announcement element.
**Warning signs:** Player unable to click, fire, or navigate during wave transitions.

### Pitfall 6: Sniper Burst Fire Consuming Too Many Projectile Slots
**What goes wrong:** Multiple Snipers firing 3-round bursts simultaneously exhaust the 128-slot projectile store. Player kinetic bursts then fail to spawn.
**Why it happens:** 10 Snipers firing simultaneously = 30 type=2 projectiles. Combined with player bursts and Grunt shots, easily hits 128.
**How to avoid:** Snipers should stagger their firing with randomized delays. The burst itself is sequential (reuse the kineticBurstRemaining pattern with per-enemy timers). Monitor projFreeSlots.length before spawning.
**Warning signs:** Player shots "not firing" in late waves with many Snipers.

### Pitfall 7: Capital Warp-In Effect Conflicts with Detonation Slots
**What goes wrong:** Using volumetric detonation shader slots for Capital warp-in effects means fewer slots available for actual nuclear detonations during boss fights.
**Why it happens:** There are only 6 detonation slots. Boss waves with 2+ Capitals could consume slots.
**How to avoid:** Implement Capital warp-in as a lightweight billboard flash + screen-space distortion, NOT a volumetric detonation slot. Use a simple expanding ring or bright flash at spawn position that fades over 1-2 seconds.
**Warning signs:** Nuclear missiles failing to detonate because all slots are in use for warp-in effects.

## Code Examples

Verified patterns from the existing codebase:

### Extending ETYPE and Archetype Arrays
```javascript
// In combat.js -- extend existing constants
const ETYPE = { GRUNT: 0, SWARM: 1, BOMBER: 2, SNIPER: 3, CAPITAL: 4 };
const ARCHETYPE_COLORS = [
  [1.0, 0.314, 0.235, 1.0],   // Grunt: red (255,80,60)
  [1.0, 0.78, 0.15, 1.0],     // Swarm: yellow/amber (255,200,40)
  [0.7, 0.2, 0.85, 1.0],      // Bomber: purple/magenta (180,50,217)
  [0.0, 0.82, 0.82, 1.0],     // Sniper: cyan/teal (0,210,210)
  [0.9, 0.9, 0.95, 1.0],      // Capital: white/silver (230,230,242)
];
const ARCHETYPE_SCALES = [1.0, 0.6, 1.3, 0.8, 4.5]; // Capital is 4.5x Grunt
const ARCHETYPE_HP = [100, 30, 200, 60, 800]; // Swarm fragile, Capital beefy
```

### Updating Indicator Colors
```javascript
// In index.html line 949 -- replace existing 5-color array
// Must match ARCHETYPE_COLORS order (Grunt, Swarm, Bomber, Sniper, Capital)
const _indicatorColors = [
  'rgba(255,80,60,0.9)',    // Grunt: red
  'rgba(255,200,40,0.9)',   // Swarm: yellow/amber
  'rgba(180,50,217,0.9)',   // Bomber: purple/magenta
  'rgba(0,210,210,0.9)',    // Sniper: cyan/teal
  'rgba(230,230,242,0.9)',  // Capital: white/silver
];
```

### Enemy-Fired Missile (Bomber Salvo)
```javascript
// Extend missiles.js: spawn missile from enemy position toward player
function enemyFireMissile(enemyIdx) {
  if (missileFreeSlots.length === 0) return -1;
  const idx = missileFreeSlots.pop();
  const ex = enemies.posX[enemyIdx], ez = enemies.posZ[enemyIdx];
  // Aim toward player
  const dx = flyPos[0] - ex, dz = flyPos[2] - ez;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const speed = MISSILE_SPEED * 0.8; // slightly slower than player missiles
  missile.alive[idx] = 1;
  missile.posX[idx] = ex;
  missile.posZ[idx] = ez;
  missile.velX[idx] = enemies.velX[enemyIdx] + (dx / dist) * speed;
  missile.velZ[idx] = enemies.velZ[enemyIdx] + (dz / dist) * speed;
  const spd = Math.sqrt(missile.velX[idx] ** 2 + missile.velZ[idx] ** 2);
  missile.fwdX[idx] = spd > 0.01 ? missile.velX[idx] / spd : 0;
  missile.fwdZ[idx] = spd > 0.01 ? missile.velZ[idx] / spd : 1;
  missile.fuel[idx] = 5.0; // shorter fuel for enemy missiles
  missile.initFuel[idx] = 5.0;
  missile.age[idx] = 0;
  missile.targetIdx[idx] = -1; // special: -1 = target player
  missile.type[idx] = 2; // new type: enemy missile
  missileCount++;
  return idx;
}
```

### Capital Minion Spawning in AI Loop
```javascript
// Inside updateEnemyAI(), Capital-specific behavior:
if (enemies.type[i] === ETYPE.CAPITAL && enemies.aiState[i] >= AI_ATTACK) {
  // Check spawn timer (reuse aiTimer or add capitalSpawnTimer)
  if (enemies.aiTimer[i] > CAPITAL_SPAWN_INTERVAL) {
    const minionCount = 2 + Math.floor(Math.random() * 2); // 2-3 Grunts
    for (let m = 0; m < minionCount; m++) {
      if (freeSlots.length === 0) break;
      const angle = Math.random() * Math.PI * 2;
      const spawnR = 3.0;
      const mx = enemies.posX[i] + Math.cos(angle) * spawnR;
      const mz = enemies.posZ[i] + Math.sin(angle) * spawnR;
      const mIdx = spawnEnemy(mx, 0, mz, ETYPE.GRUNT, -1, 0);
      if (mIdx >= 0) {
        // Immediately set to ALERT so they engage the player
        enemies.aiState[mIdx] = AI_ALERT;
        enemies.aiTimer[mIdx] = ALERT_PAUSE; // skip alert pause
      }
    }
    enemies.aiTimer[i] = 0; // reset spawn timer
  }
}
```

### Wave Spawner Core Logic
```javascript
// In new waves.js module
function spawnWave(waveNum) {
  const def = getWaveDefinition(waveNum);
  // def = { counts: { GRUNT: N, SWARM: N, ... }, bossWave: bool }

  // Select planets for spawn distribution
  const planets = [0, 1, 2, 3, 4, 5, 6];
  let totalToSpawn = 0;
  for (const type in def.counts) totalToSpawn += def.counts[type];

  // Distribute across planets evenly
  let spawned = 0;
  for (const typeKey in def.counts) {
    const type = ETYPE[typeKey];
    let remaining = def.counts[typeKey];
    while (remaining > 0 && freeSlots.length > 0) {
      const pIdx = planets[spawned % planets.length];
      const bodyPos = getBodyPosition(pIdx);
      const bodyR = getBodyRadius(pIdx);
      const stR = bodyR + STATION_KEEP_ALT;
      const stPh = Math.random() * Math.PI * 2;
      const angle = Math.atan2(bodyPos[0], bodyPos[2]) + stPh;
      const x = bodyPos[0] + stR * Math.sin(angle);
      const z = bodyPos[2] + stR * Math.cos(angle);
      spawnEnemy(x, 0, z, type, pIdx, stPh);
      remaining--;
      spawned++;
    }
  }
  playerState.stats.wavesSurvived = waveNum;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single geometry for all enemies | Multi-geometry per-archetype instanced draws | This phase | Enables visual enemy variety; 5 draw calls instead of 1 |
| Hardcoded spawnTestEnemies() | Formula-driven wave spawner | This phase | Enables 50+ wave progression; no static tables to maintain |
| Single Grunt AI path | Type-branched AI within same state machine | This phase | Each archetype plays differently while sharing infrastructure |
| Player-only missiles | Bidirectional missile system (player + enemy) | This phase | Bombers fire guided missiles at player; reuses PN guidance |
| Static 8-enemy encounter | Kill-triggered wave progression | This phase | Core gameplay loop: clear wave, breather, next wave |

## Open Questions

1. **SoA Field Reuse vs. New Fields for Archetype-Specific State**
   - What we know: The existing SoA has `aiTimer`, `hasFired`, `stationPhase` that could be dual-purposed. Capital needs a minion spawn timer; Sniper needs a burst count; Bomber needs a salvo reload timer.
   - What's unclear: Whether reusing `aiTimer` for all these purposes (since it resets between states) is safe, or if we need 1-2 new SoA fields like `auxTimer` and `auxCount`.
   - Recommendation: Add one `auxTimer` Float32Array to the enemy SoA for archetype-specific timing (Capital spawn interval, Bomber reload, Sniper burst cooldown). This costs 256 bytes for 64 enemies -- negligible. Keeps the per-state `aiTimer` clean for state transition timing.

2. **Enemy Missile Target Resolution**
   - What we know: Current missiles track enemies by SoA slot index. Enemy-fired missiles need to track the player, which isn't an index.
   - What's unclear: Best encoding for "target is the player" within the existing `missile.targetIdx` Int16Array.
   - Recommendation: Use `targetIdx = -1` as "target player." In `updateMissiles()`, when `targetIdx < 0`, read `flyPos` directly instead of `enemies.posX[ti]`. When `!playerState.alive`, remove the missile (same as target-dead behavior). Add `missile.source` Uint8Array to distinguish player missiles from enemy missiles for hit detection.

3. **Warp-In Visual Effect Implementation**
   - What we know: Capital ships should have a dramatic warp-in at spawn, not just pop in. Must not consume detonation slots.
   - What's unclear: Best visual approach within WebGL 1.0 constraints.
   - Recommendation: Use a billboard flash (expanding bright ring + flash) at spawn position, similar to the explosion billboard system. Add a `warpIn` age field that decays over 1-2 seconds. The enemy shader can apply a scale ramp (0 to full size over the first 0.5s) for a "materializing" effect using the existing per-instance scale attribute.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based tests.html (regex extraction + visual checks) |
| Config file | None (tests.html is self-contained) |
| Quick run command | Open `http://localhost:8000/tests.html` in browser |
| Full suite command | Open tests.html + visual check of combat gameplay |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENM-02 | Swarm enemies spawn at wave 3, converge on player | manual-only | Visual: enter nav, survive to wave 3, observe swarm rush | N/A |
| ENM-03 | Bomber enemies spawn at wave 5, fire guided missiles | manual-only | Visual: survive to wave 5, observe missile salvos | N/A |
| ENM-04 | Sniper enemies spawn at wave 8, fire accurate bursts from range | manual-only | Visual: survive to wave 8, observe long-range burst fire | N/A |
| ENM-05 | Capital enemies spawn at wave 10, spawn minions, large scale | manual-only | Visual: survive to wave 10, observe Capital + minion spawning | N/A |
| ENM-07 | Clearing wave triggers next wave after breather | manual-only | Visual: kill all enemies, observe breather + "WAVE X" text + next spawn | N/A |
| ENM-08 | Boss waves at wave 10, 20, 30 with Capital ships | manual-only | Visual: reach wave 10, observe boss encounter composition | N/A |
| ENM-09 | Difficulty increases with wave number | manual-only | Visual: compare wave 1 (all Grunts) vs wave 15 (mixed archetypes, harder) | N/A |

**Note:** All tests are manual-only because the game runs in a browser WebGL context with no headless test harness. The existing tests.html validates shader invariants via regex but cannot simulate gameplay. The cheat code `999` (type digits rapidly) can spawn close enemies for quick testing. A similar cheat could be added to skip to specific wave numbers for targeted validation.

### Sampling Rate
- **Per task commit:** Visual gameplay check -- enter nav mode, verify new archetype appears/behaves correctly
- **Per wave merge:** Full gameplay session from wave 1 through the newest archetype's introduction wave
- **Phase gate:** Complete playthrough to wave 10+ confirming all archetypes, boss encounter, and scaling

### Wave 0 Gaps
- [ ] `js/scene/waves.js` -- new module, wave state machine + spawner + difficulty scaling
- [ ] Wave skip cheat code for testing (e.g., type specific digit sequence to jump to wave N)
- [ ] Visual verification of 4 new geometry shapes (each archetype must look distinct)

## Sources

### Primary (HIGH confidence)
- `js/scene/combat.js` -- Existing SoA enemy store, ETYPE, ARCHETYPE_* arrays, AI state machine, spawnEnemy(), removeEnemy(), updateInstanceBuffer()
- `js/scene/math.js` -- createGruntGeometry() pattern, createCapitalShipGeometry() reference for complex procedural meshes
- `js/scene/weapons.js` -- Projectile SoA store, enemyFireAt() pattern, burst fire mechanics (kineticBurstRemaining)
- `js/scene/missiles.js` -- Missile SoA store with PN guidance, spawnMissile(), updateMissiles(), detonation handlers
- `js/scene/nav.js` -- resetCombat() for game state reset, enterNavMode() for initialization, spawnTestEnemies() call site
- `js/scene/shaders.js` -- enemyVS/enemyFS shader source showing per-instance attribute handling
- `js/scene/particles.js` -- ARCHETYPE_COLORS reference for impact spark colors
- `index.html` lines 575-587 -- Geometry buffer creation and instanced rendering setup
- `index.html` lines 1253-1307 -- Enemy instanced rendering pass (single geometry, all instances)
- `index.html` line 949 -- Off-screen indicator colors array (5 entries, ready for 5 archetypes)
- `index.html` lines 890-912 -- spawnTestEnemies() function to be replaced

### Secondary (MEDIUM confidence)
- Phase 5 RESEARCH.md and implementation summaries -- established patterns for SoA stores, AI state machine, instance buffer stride
- Phase 6 RESEARCH.md -- playerState, resetCombat(), death sequence, indicator system architecture

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all technologies already in use, no new dependencies
- Architecture: HIGH -- all extension points verified by reading existing code; multi-geometry instanced rendering is the only structural change and it follows standard WebGL 1.0 patterns
- Pitfalls: HIGH -- identified from direct analysis of data flow (MAX_ENEMIES limits, missile targeting, instance buffer partitioning, damage per frame)
- Geometry design: MEDIUM -- tri counts and proportions are discretionary and will need visual tuning

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- no external dependency changes expected)
