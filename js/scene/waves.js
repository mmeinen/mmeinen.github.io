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

/* Fleet spawn results for HUD callout system (consumed by Plan 02) */
let _lastFleetResults = [];

/* LEGACY: replaced by getFleetComposition() in fleets.js
 * Preserved for reference. No longer called by spawnWave().
 */
function getWaveDefinition(waveNum) {
  /* LEGACY: replaced by getFleetComposition() in fleets.js */
  const totalEnemies = Math.min(MAX_ENEMIES - 8, Math.floor(6 + waveNum * 1.2));
  const isBoss = waveNum >= 10 && waveNum % 10 === 0;

  if (isBoss) {
    const capitalCount = Math.min(3, Math.floor(waveNum / 10));
    const result = [{ type: ETYPE.CAPITAL, count: capitalCount }];
    if (waveNum === 10) return { enemies: result, isBoss: true };
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
    if (remaining > 0) result.push({ type: ETYPE.GRUNT, count: remaining });
    return { enemies: result, isBoss: true };
  }

  const weights = [];
  weights.push({ type: ETYPE.GRUNT, weight: Math.max(10, 50 - waveNum * 2) });
  if (waveNum >= 3) weights.push({ type: ETYPE.SWARM, weight: Math.min(30, 5 + (waveNum - 3) * 3) });
  if (waveNum >= 5) weights.push({ type: ETYPE.BOMBER, weight: Math.min(20, 3 + (waveNum - 5) * 2) });
  if (waveNum >= 8) weights.push({ type: ETYPE.SNIPER, weight: Math.min(15, 2 + (waveNum - 8) * 1.5) });
  if (waveNum >= 15) weights.push({ type: ETYPE.CAPITAL, weight: Math.min(5, 1 + (waveNum - 15) * 0.3) });
  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
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
 * Spawn enemies for a wave using fleet-based composition.
 * Each fleet is placed at a different planet with role-based positioning.
 * @param {number} waveNum - 1-based wave number
 */
function spawnWave(waveNum) {
  const fleetSpecs = getFleetComposition(waveNum);

  // Shuffle planet indices to ensure no two fleets share a planet (Pitfall 2)
  const planetPool = [0, 1, 2, 3, 4];
  for (let i = planetPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [planetPool[i], planetPool[j]] = [planetPool[j], planetPool[i]];
  }

  let totalSpawned = 0;
  _lastFleetResults = [];

  for (let fleetIdx = 0; fleetIdx < Math.min(fleetSpecs.length, FLEET_MAX_PER_WAVE); fleetIdx++) {
    const spec = fleetSpecs[fleetIdx];
    const anchorBody = planetPool[fleetIdx % planetPool.length];
    const basePhase = Math.random() * Math.PI * 2;

    // Apply scaling if needed: create a scaled copy of the template
    let template = spec.template;
    if (spec.scale !== undefined && spec.scale < 1) {
      template = {
        name: spec.template.name,
        callout: spec.template.callout,
        isBoss: spec.template.isBoss,
        composition: spec.template.composition.map(function(slot) {
          if (slot.role === 'anchor') return slot; // never reduce anchor count
          return {
            role: slot.role,
            type: slot.type,
            count: Math.max(1, Math.floor(slot.count * spec.scale))
          };
        })
      };
    }

    const result = spawnFleet(template, anchorBody, basePhase);
    totalSpawned += result.spawned.length;
    _lastFleetResults.push({
      callout: result.callout,
      isBoss: result.isBoss,
      centroidX: result.centroidX,
      centroidZ: result.centroidZ
    });
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
        if (typeof showFleetCallouts === 'function' && _lastFleetResults.length > 0) {
          showFleetCallouts(_lastFleetResults);
        }
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
  if (typeof showFleetCallouts === 'function' && _lastFleetResults.length > 0) {
    showFleetCallouts(_lastFleetResults);
  }
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
        detectRadius: 20000 + waveScale * 10000,    // 20,000 -> 30,000 km
        attackRange: 7500 + waveScale * 2500,        // 7,500 -> 10,000 km
        fireRange: 5000 + waveScale * 2500,          // 5,000 -> 7,500 km
        accuracyNoise: 2000 - waveScale * 1200,      // 2,000 -> 800 km
        attackCooldown: 1.0 - waveScale * 0.4,       // 1.0 -> 0.6 (seconds, unchanged)
      };

    case ETYPE.SWARM:
      return {
        detectRadius: 25000 + waveScale * 15000,    // 25,000 -> 40,000 km (aggressive)
        attackRange: 4000 + waveScale * 2000,        // 4,000 -> 6,000 km (close range)
        fireRange: 2500 + waveScale * 1500,          // 2,500 -> 4,000 km
        accuracyNoise: 4000 - waveScale * 2000,      // 4,000 -> 2,000 km (less accurate)
        attackCooldown: 0.5 - waveScale * 0.2,       // 0.5 -> 0.3 (very fast)
      };

    case ETYPE.BOMBER:
      return {
        detectRadius: 22500 + waveScale * 7500,     // 22,500 -> 30,000 km
        attackRange: 12500 + waveScale * 5000,       // 12,500 -> 17,500 km (long range)
        fireRange: 10000 + waveScale * 5000,         // 10,000 -> 15,000 km
        accuracyNoise: 1600 - waveScale * 800,       // 1,600 -> 800 km
        attackCooldown: 3.0 - waveScale * 1.0,       // 3.0 -> 2.0 (slow reload)
      };

    case ETYPE.SNIPER:
      return {
        detectRadius: 30000 + waveScale * 15000,    // 30,000 -> 45,000 km (long range)
        attackRange: 17500 + waveScale * 7500,       // 17,500 -> 25,000 km (extreme range)
        fireRange: 15000 + waveScale * 7500,         // 15,000 -> 22,500 km
        accuracyNoise: 800 - waveScale * 600,        // 800 -> 200 km (highly accurate)
        attackCooldown: 2.0 - waveScale * 0.5,       // 2.0 -> 1.5
      };

    case ETYPE.CAPITAL:
      return {
        detectRadius: 30000 + waveScale * 10000,    // 30,000 -> 40,000 km
        attackRange: 10000 + waveScale * 5000,       // 10,000 -> 15,000 km
        fireRange: 7500 + waveScale * 5000,          // 7,500 -> 12,500 km
        accuracyNoise: 1200 - waveScale * 600,       // 1,200 -> 600 km
        attackCooldown: 5.0 - waveScale * 2.0,       // 5.0 -> 3.0 (slow)
      };

    default:
      return {
        detectRadius: 20000,
        attackRange: 7500,
        fireRange: 5000,
        accuracyNoise: 2000,
        attackCooldown: 1.0,
      };
  }
}
