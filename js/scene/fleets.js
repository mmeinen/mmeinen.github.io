/* ---- Fleet Composition System ---- */

const FLEET_MAX_PER_WAVE = 3;

const FLEET_TEMPLATES = {
  PATROL: {
    name: 'PATROL',
    callout: 'PATROL GROUP DETECTED',
    isBoss: false,
    composition: [
      { role: 'screen', type: ETYPE.GRUNT, count: 3 }
    ]
  },
  RAID: {
    name: 'RAID',
    callout: 'RAID FLEET INCOMING',
    isBoss: false,
    composition: [
      { role: 'screen', type: ETYPE.SWARM, count: 3 },
      { role: 'screen', type: ETYPE.GRUNT, count: 2 }
    ]
  },
  SIEGE: {
    name: 'SIEGE',
    callout: 'SIEGE FLEET DETECTED',
    isBoss: false,
    composition: [
      { role: 'anchor', type: ETYPE.BOMBER, count: 1 },
      { role: 'screen', type: ETYPE.GRUNT, count: 3 },
      { role: 'striker', type: ETYPE.SNIPER, count: 1 }
    ]
  },
  VANGUARD: {
    name: 'VANGUARD',
    callout: 'VANGUARD FLEET INCOMING',
    isBoss: true,
    composition: [
      { role: 'anchor', type: ETYPE.CAPITAL, count: 1 },
      { role: 'screen', type: ETYPE.GRUNT, count: 2 },
      { role: 'striker', type: ETYPE.BOMBER, count: 1 }
    ]
  }
};

/**
 * Spawn a fleet at a specific planet with role-based arc placement.
 * @param {object} template - Fleet template from FLEET_TEMPLATES (may have scaled counts)
 * @param {number} anchorBodyIdx - Planet index (0-6) for station-keeping
 * @param {number} basePhase - Base angle offset for fleet placement
 * @returns {{ spawned: number[], centroidX: number, centroidZ: number, callout: string, isBoss: boolean }}
 */
function spawnFleet(template, anchorBodyIdx, basePhase) {
  const bodyPos = getBodyPositionKm(anchorBodyIdx, simTime);
  const bodyR = getBodyRadiusKm(anchorBodyIdx);
  const stR = bodyR + STATION_KEEP_ALT;
  const planetAngle = Math.atan2(bodyPos[0], bodyPos[2]);

  let totalMembers = 0;
  for (const slot of template.composition) totalMembers += slot.count;

  const spawned = [];
  for (const slot of template.composition) {
    // Role-based spread: anchor=0, screen=+/-0.5rad, striker=+/-1.0rad
    const arcWidth = slot.role === 'anchor' ? 0 :
                     slot.role === 'screen' ? 0.5 : 1.0;

    for (let c = 0; c < slot.count; c++) {
      if (freeSlots.length === 0) break; // Pitfall 1 safety

      let phaseOffset;
      if (arcWidth > 0) {
        if (slot.count === 1) {
          phaseOffset = 0;
        } else {
          phaseOffset = -arcWidth + (2 * arcWidth * c / Math.max(1, slot.count - 1));
        }
      } else {
        phaseOffset = 0;
      }

      const stPh = basePhase + phaseOffset;
      const angle = planetAngle + stPh;
      const x = bodyPos[0] + stR * Math.sin(angle);
      const z = bodyPos[2] + stR * Math.cos(angle);

      const idx = spawnEnemy(x, 0, z, slot.type, anchorBodyIdx, stPh);
      if (idx >= 0) {
        spawned.push(idx);
        if (slot.type === ETYPE.CAPITAL) {
          enemies.auxTimer[idx] = -1.0; // warp-in phase
          if (typeof spawnExplosion === 'function') spawnExplosion(x, 0, z, 4000);
        }
      }
    }
  }

  return {
    spawned,
    centroidX: bodyPos[0],
    centroidZ: bodyPos[2],
    callout: template.callout,
    isBoss: template.isBoss
  };
}

/**
 * Determine fleet composition for a wave number.
 * Selects fleet templates and scales counts to fit within enemy budget.
 * @param {number} waveNum - 1-based wave number
 * @returns {Array<{ template: object, scale: number }>}
 */
function getFleetComposition(waveNum) {
  const maxEnemies = Math.min(MAX_ENEMIES - 8, Math.floor(6 + waveNum * 1.2));
  const isBoss = waveNum >= 10 && waveNum % 10 === 0;

  let fleets = [];

  if (isBoss) {
    // Boss waves: VANGUARD-led
    fleets.push({ template: FLEET_TEMPLATES.VANGUARD });
    if (waveNum >= 20) fleets.push({ template: FLEET_TEMPLATES.SIEGE });
    if (waveNum >= 30) fleets.push({ template: FLEET_TEMPLATES.RAID });
  } else if (waveNum <= 2) {
    // Wave 1-2: single PATROL
    fleets.push({ template: FLEET_TEMPLATES.PATROL });
  } else if (waveNum <= 4) {
    // Wave 3-4: PATROL + RAID
    fleets.push({ template: FLEET_TEMPLATES.PATROL });
    fleets.push({ template: FLEET_TEMPLATES.RAID });
  } else if (waveNum <= 7) {
    // Wave 5-7: 2 fleets from [PATROL, RAID, SIEGE]
    const pool = [FLEET_TEMPLATES.PATROL, FLEET_TEMPLATES.RAID, FLEET_TEMPLATES.SIEGE];
    const a = Math.floor(Math.random() * pool.length);
    let b = Math.floor(Math.random() * (pool.length - 1));
    if (b >= a) b++;
    fleets.push({ template: pool[a] });
    fleets.push({ template: pool[b] });
  } else if (waveNum <= 14) {
    // Wave 8-14: 2-3 fleets from [PATROL, RAID, SIEGE]
    const pool = [FLEET_TEMPLATES.PATROL, FLEET_TEMPLATES.RAID, FLEET_TEMPLATES.SIEGE];
    const count = waveNum >= 10 ? 3 : 2;
    const indices = [];
    while (indices.length < count) {
      const idx = Math.floor(Math.random() * pool.length);
      indices.push(idx);
      if (indices.length < count) {
        // Allow repeats at 3 fleets since pool is only 3
      }
    }
    for (const idx of indices) fleets.push({ template: pool[idx] });
  } else {
    // Wave 15+: 2-3 fleets; VANGUARD may appear (10% chance)
    const count = 2 + (Math.random() < 0.5 ? 1 : 0);
    const hasVanguard = Math.random() < 0.1;
    if (hasVanguard) {
      fleets.push({ template: FLEET_TEMPLATES.VANGUARD });
    }
    const pool = [FLEET_TEMPLATES.RAID, FLEET_TEMPLATES.SIEGE];
    while (fleets.length < count) {
      fleets.push({ template: pool[Math.floor(Math.random() * pool.length)] });
    }
  }

  // Compute total base members across all fleets
  let totalBase = 0;
  for (const f of fleets) {
    for (const slot of f.template.composition) totalBase += slot.count;
  }

  // Scale screen/striker counts proportionally if total exceeds maxEnemies
  if (totalBase > maxEnemies && totalBase > 0) {
    // Count anchor vs non-anchor members
    let anchorTotal = 0;
    let nonAnchorTotal = 0;
    for (const f of fleets) {
      for (const slot of f.template.composition) {
        if (slot.role === 'anchor') anchorTotal += slot.count;
        else nonAnchorTotal += slot.count;
      }
    }
    const nonAnchorBudget = maxEnemies - anchorTotal;
    const scale = nonAnchorBudget > 0 && nonAnchorTotal > 0
      ? Math.min(1.0, nonAnchorBudget / nonAnchorTotal)
      : 1.0;
    for (const f of fleets) f.scale = scale;
  } else {
    for (const f of fleets) f.scale = 1.0;
  }

  return fleets;
}
