/* ---- Wave Progression System ---- */

/* Wave state constants */
const WAVE_IDLE = 0;
const WAVE_ACTIVE = 1;
const WAVE_BREATHER = 2;
const WAVE_SPAWNING = 3;

/* State variables */
let waveState = WAVE_IDLE;
let waveNumber = 0;
let waveBreatherTimer = 0;
const BREATHER_DURATION = 4.0;
let waveEnemyCount = 0; // tracks wave-spawned enemies (not Capital-spawned minions)

/* DOM reference (set after DOM ready) */
let waveAnnounceEl = null;

/**
 * Get wave composition for a given wave number.
 * Formula-driven: enemy count grows, archetype availability unlocks at thresholds.
 * @param {number} waveNum - 1-based wave number
 * @returns {{ enemies: Array<{type: number, count: number}>, isBoss: boolean }}
 */
function getWaveDefinition(waveNum) {
  const totalEnemies = Math.min(MAX_ENEMIES - 8, Math.floor(6 + waveNum * 1.2));
  const isBoss = waveNum >= 10 && waveNum % 10 === 0;

  if (isBoss) {
    // Boss wave: Capital ships + supporting cast
    // Wave 10: 1 Capital solo (introduction). Wave 20: 2 Capitals + support. Wave 30+: 3 Capitals max.
    const capitalCount = Math.min(3, Math.floor(waveNum / 10));
    const result = [{ type: ETYPE.CAPITAL, count: capitalCount }];

    // Wave 10: solo Capital (no supporting cast)
    if (waveNum === 10) {
      return { enemies: result, isBoss: true };
    }

    // Fill support with hardest available archetypes (weighted toward Snipers and Bombers)
    const supportCount = totalEnemies - capitalCount;
    let remaining = supportCount;
    if (remaining > 0) {
      const sniperCount = Math.min(Math.floor(remaining * 0.3), remaining);
      if (sniperCount > 0) result.push({ type: ETYPE.SNIPER, count: sniperCount });
      remaining -= sniperCount;
    }
    if (remaining > 0) {
      const bomberCount = Math.min(Math.floor(remaining * 0.3), remaining);
      if (bomberCount > 0) result.push({ type: ETYPE.BOMBER, count: bomberCount });
      remaining -= bomberCount;
    }
    if (remaining > 0) {
      const swarmCount = Math.min(Math.floor(remaining * 0.25), remaining);
      if (swarmCount > 0) result.push({ type: ETYPE.SWARM, count: swarmCount });
      remaining -= swarmCount;
    }
    if (remaining > 0) {
      result.push({ type: ETYPE.GRUNT, count: remaining });
    }
    return { enemies: result, isBoss: true };
  }

  // Normal wave: weighted random selection
  // Available archetypes based on wave number
  const weights = [];
  // Grunt: always available, weight decreases
  weights.push({ type: ETYPE.GRUNT, weight: Math.max(10, 50 - waveNum * 2) });
  // Swarm: wave 3+
  if (waveNum >= 3) weights.push({ type: ETYPE.SWARM, weight: Math.min(30, 5 + (waveNum - 3) * 3) });
  // Bomber: wave 5+
  if (waveNum >= 5) weights.push({ type: ETYPE.BOMBER, weight: Math.min(20, 3 + (waveNum - 5) * 2) });
  // Sniper: wave 8+
  if (waveNum >= 8) weights.push({ type: ETYPE.SNIPER, weight: Math.min(15, 2 + (waveNum - 8) * 1.5) });
  // Capital: wave 15+ (non-boss) -- rare appearance
  if (waveNum >= 15) weights.push({ type: ETYPE.CAPITAL, weight: Math.min(5, 1 + (waveNum - 15) * 0.3) });

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);

  // Distribute enemies by weighted selection
  const typeCounts = {};
  for (let i = 0; i < totalEnemies; i++) {
    let roll = Math.random() * totalWeight;
    let selectedType = ETYPE.GRUNT;
    for (const w of weights) {
      roll -= w.weight;
      if (roll <= 0) { selectedType = w.type; break; }
    }
    typeCounts[selectedType] = (typeCounts[selectedType] || 0) + 1;
  }

  const result = [];
  for (const [type, count] of Object.entries(typeCounts)) {
    result.push({ type: parseInt(type), count });
  }
  return { enemies: result, isBoss: false };
}

/**
 * Spawn enemies for a wave, distributing across planets at station-keeping positions.
 * Capitals spawn at specific larger planets for dramatic presence.
 * @param {number} waveNum - 1-based wave number
 */
function spawnWave(waveNum) {
  const def = getWaveDefinition(waveNum);
  const planetIndices = [0, 1, 2, 3, 4, 5, 6];
  // Capital ships go on the 3 largest planets (Jupiter, Saturn, Uranus)
  const capitalPlanets = [0, 1, 2];
  let capitalPlanetIdx = 0;

  let totalSpawned = 0;
  for (const group of def.enemies) {
    for (let c = 0; c < group.count; c++) {
      let pIdx;
      if (group.type === ETYPE.CAPITAL) {
        pIdx = capitalPlanets[capitalPlanetIdx % capitalPlanets.length];
        capitalPlanetIdx++;
      } else {
        pIdx = planetIndices[(totalSpawned + c) % planetIndices.length];
      }
      const stPh = Math.random() * Math.PI * 2;
      const bodyPos = getBodyPosition(pIdx);
      const bodyR = getBodyRadius(pIdx);
      const stR = bodyR + STATION_KEEP_ALT;
      const planetAngle = Math.atan2(bodyPos[0], bodyPos[2]);
      const angle = planetAngle + stPh;
      const x = bodyPos[0] + stR * Math.sin(angle);
      const z = bodyPos[2] + stR * Math.cos(angle);
      const spawnedIdx = spawnEnemy(x, 0, z, group.type, pIdx, stPh);
      // Capital: set auxTimer to -1.0 for warp-in phase + spawn explosion flash
      if (group.type === ETYPE.CAPITAL && spawnedIdx >= 0) {
        enemies.auxTimer[spawnedIdx] = -1.0;
        if (typeof spawnExplosion === 'function') spawnExplosion(x, 0, z, 3.0);
      }
      totalSpawned++;
    }
  }
  waveEnemyCount = totalSpawned;
}

/**
 * Wave state machine update. Call once per frame.
 * @param {number} simDt - scaled delta time in seconds
 */
function updateWaveSystem(simDt) {
  switch (waveState) {
    case WAVE_IDLE:
      // No-op: waits for startWaveSystem() call
      break;

    case WAVE_ACTIVE:
      // Check if all wave-spawned enemies are dead
      // Count all alive enemies as wave enemies (including Capital-spawned minions)
      if (enemyCount === 0) {
        waveState = WAVE_BREATHER;
        waveBreatherTimer = 0;
        // Update stats
        if (typeof playerState !== 'undefined') {
          playerState.stats.wavesSurvived = waveNumber;
        }
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

    case WAVE_SPAWNING:
      // Immediate transition to active (for initial wave)
      waveState = WAVE_ACTIVE;
      break;
  }
}

/**
 * Start the wave system. Called once when entering nav mode.
 * Sets wave 1 and spawns it.
 */
function startWaveSystem() {
  waveNumber = 1;
  spawnWave(1);
  waveState = WAVE_ACTIVE;
  showWaveAnnouncement(1);
}

/**
 * Reset the wave system to idle. Called from resetCombat().
 */
function resetWaveSystem() {
  waveState = WAVE_IDLE;
  waveNumber = 0;
  waveBreatherTimer = 0;
  waveEnemyCount = 0;
}

/**
 * Show wave announcement text with fade animation.
 * @param {number} waveNum - wave number to announce
 */
function showWaveAnnouncement(waveNum) {
  if (!waveAnnounceEl) waveAnnounceEl = document.getElementById('wave-announce');
  if (!waveAnnounceEl) return;
  _setupWaveAnnounceListener();

  const isBoss = waveNum >= 10 && waveNum % 10 === 0;
  waveAnnounceEl.textContent = isBoss ? 'BOSS WAVE ' + waveNum : 'WAVE ' + waveNum;

  // Toggle boss class for color change
  if (isBoss) {
    waveAnnounceEl.classList.add('boss');
  } else {
    waveAnnounceEl.classList.remove('boss');
  }

  // Trigger animation by removing and re-adding visible class
  waveAnnounceEl.classList.remove('visible');
  // Force reflow to restart animation
  void waveAnnounceEl.offsetWidth;
  waveAnnounceEl.classList.add('visible');
}

// Listen for animation end to clean up visible class
// Setup runs when showWaveAnnouncement first grabs the element
function _setupWaveAnnounceListener() {
  if (!waveAnnounceEl) return;
  if (waveAnnounceEl._listenerSet) return;
  waveAnnounceEl.addEventListener('animationend', function() {
    waveAnnounceEl.classList.remove('visible');
  });
  waveAnnounceEl._listenerSet = true;
}

/**
 * Difficulty scaling function: returns per-archetype tuning parameters.
 * These scale with wave number per-archetype.
 * CONTRACT: Plans 02/03 AI branches MUST call getArchetypeStats(type, waveNum).
 * @param {number} type - ETYPE value
 * @param {number} waveNum - current wave number
 * @returns {{ detectRadius: number, attackRange: number, fireRange: number, accuracyNoise: number, attackCooldown: number }}
 */
function getArchetypeStats(type, waveNum) {
  const waveScale = Math.min(waveNum / 50, 1.0); // 0 to 1 over 50 waves

  switch (type) {
    case ETYPE.GRUNT:
      return {
        detectRadius: 40 + waveScale * 20,      // 40 -> 60
        attackRange: 15 + waveScale * 5,          // 15 -> 20
        fireRange: 10 + waveScale * 5,            // 10 -> 15
        accuracyNoise: 5.0 - waveScale * 3.0,     // 5.0 -> 2.0
        attackCooldown: 1.0 - waveScale * 0.4,     // 1.0 -> 0.6
      };

    case ETYPE.SWARM:
      return {
        detectRadius: 50 + waveScale * 30,      // 50 -> 80 (aggressive)
        attackRange: 8 + waveScale * 4,           // 8 -> 12 (close range)
        fireRange: 5 + waveScale * 3,             // 5 -> 8
        accuracyNoise: 8.0 - waveScale * 4.0,     // 8.0 -> 4.0 (less accurate)
        attackCooldown: 0.5 - waveScale * 0.2,     // 0.5 -> 0.3 (very fast)
      };

    case ETYPE.BOMBER:
      return {
        detectRadius: 45 + waveScale * 15,      // 45 -> 60
        attackRange: 25 + waveScale * 10,         // 25 -> 35 (long range)
        fireRange: 20 + waveScale * 10,           // 20 -> 30
        accuracyNoise: 4.0 - waveScale * 2.0,     // 4.0 -> 2.0
        attackCooldown: 3.0 - waveScale * 1.0,     // 3.0 -> 2.0 (slow reload)
      };

    case ETYPE.SNIPER:
      return {
        detectRadius: 60 + waveScale * 30,      // 60 -> 90 (long range)
        attackRange: 35 + waveScale * 15,         // 35 -> 50 (extreme range)
        fireRange: 30 + waveScale * 15,           // 30 -> 45
        accuracyNoise: 2.0 - waveScale * 1.5,     // 2.0 -> 0.5 (highly accurate)
        attackCooldown: 2.0 - waveScale * 0.5,     // 2.0 -> 1.5
      };

    case ETYPE.CAPITAL:
      return {
        detectRadius: 60 + waveScale * 20,      // 60 -> 80
        attackRange: 20 + waveScale * 10,         // 20 -> 30
        fireRange: 15 + waveScale * 10,           // 15 -> 25
        accuracyNoise: 3.0 - waveScale * 1.5,     // 3.0 -> 1.5
        attackCooldown: 5.0 - waveScale * 2.0,     // 5.0 -> 3.0 (slow)
      };

    default:
      return {
        detectRadius: 40,
        attackRange: 15,
        fireRange: 10,
        accuracyNoise: 5.0,
        attackCooldown: 1.0,
      };
  }
}
