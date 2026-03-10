/* ---- Combat Entity System ---- */

/* Archetype definitions */
const ETYPE = { GRUNT: 0 };
const ARCHETYPE_COLORS = [[1.0, 0.314, 0.235, 1.0]]; // Grunt red (255,80,60) normalized, alpha=glow
const ARCHETYPE_SCALES = [1.0]; // Grunt baseline
const ARCHETYPE_HP = [100];

/* Entity Store (Structure of Arrays) */
const MAX_ENEMIES = 64;

const enemies = {
  alive:   new Uint8Array(MAX_ENEMIES),
  posX:    new Float32Array(MAX_ENEMIES),
  posY:    new Float32Array(MAX_ENEMIES),
  posZ:    new Float32Array(MAX_ENEMIES),
  velX:    new Float32Array(MAX_ENEMIES),
  velZ:    new Float32Array(MAX_ENEMIES),
  heading: new Float32Array(MAX_ENEMIES),
  hp:      new Float32Array(MAX_ENEMIES),
  type:    new Uint8Array(MAX_ENEMIES),
  scale:   new Float32Array(MAX_ENEMIES)
};

/* Instance buffer: 9 floats per instance (pos.xyz + heading + color.rgba + scale) */
const instanceData = new Float32Array(MAX_ENEMIES * 9);

/* Free-list for O(1) slot allocation */
const freeSlots = [];
for (let i = MAX_ENEMIES - 1; i >= 0; i--) freeSlots.push(i);
let enemyCount = 0;

/**
 * Spawn an enemy at (x, y, z) of the given archetype type.
 * Returns the slot index, or -1 if the store is full.
 */
function spawnEnemy(x, y, z, type) {
  if (freeSlots.length === 0) return -1;
  const idx = freeSlots.pop();
  enemies.alive[idx] = 1;
  enemies.posX[idx] = x;
  enemies.posY[idx] = y;
  enemies.posZ[idx] = z;
  enemies.velX[idx] = 0;
  enemies.velZ[idx] = 0;
  enemies.heading[idx] = 0;
  enemies.type[idx] = type;
  enemies.scale[idx] = ARCHETYPE_SCALES[type];
  enemies.hp[idx] = ARCHETYPE_HP[type];
  enemyCount++;
  return idx;
}

/**
 * Remove an enemy by slot index, returning the slot to the free-list.
 */
function removeEnemy(idx) {
  if (!enemies.alive[idx]) return;
  enemies.alive[idx] = 0;
  freeSlots.push(idx);
  enemyCount--;
}

/* ---- Instance Buffer Packing ---- */

/**
 * Pack live entity data into instanceData for GPU upload.
 * Layout per instance (9 floats): posX, posY, posZ, heading, colorR, colorG, colorB, colorA, scale
 * Returns the number of live instances packed.
 */
function updateInstanceBuffer() {
  let liveCount = 0;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    const base = liveCount * 9;
    instanceData[base]     = enemies.posX[i];
    instanceData[base + 1] = enemies.posY[i];
    instanceData[base + 2] = enemies.posZ[i];
    instanceData[base + 3] = enemies.heading[i];
    const c = ARCHETYPE_COLORS[enemies.type[i]];
    instanceData[base + 4] = c[0];
    instanceData[base + 5] = c[1];
    instanceData[base + 6] = c[2];
    instanceData[base + 7] = c[3];
    instanceData[base + 8] = enemies.scale[i];
    liveCount++;
  }
  return liveCount;
}

/* ---- Radial Bin Collision Structure ---- */

const BIN_WIDTH = 10.0;
const NUM_BINS = 20;        // covers radius 0-200
const MAX_PER_BIN = 16;

const binCounts = new Uint8Array(NUM_BINS);
const binEntities = new Uint16Array(NUM_BINS * MAX_PER_BIN);

/**
 * Rebuild radial bins from alive enemy positions.
 * Bins by distance from origin on the XZ plane: bin = floor(r / BIN_WIDTH).
 */
function rebinEntities() {
  binCounts.fill(0);
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    const r = Math.sqrt(enemies.posX[i] * enemies.posX[i] + enemies.posZ[i] * enemies.posZ[i]);
    const bin = Math.min(Math.floor(r / BIN_WIDTH), NUM_BINS - 1);
    const cnt = binCounts[bin];
    if (cnt < MAX_PER_BIN) {
      binEntities[bin * MAX_PER_BIN + cnt] = i;
      binCounts[bin]++;
    }
  }
}

/**
 * Get collision candidate entity indices from the bin containing radius r
 * and its two adjacent bins.
 */
function getCollisionCandidates(r) {
  const bin = Math.min(Math.floor(r / BIN_WIDTH), NUM_BINS - 1);
  const candidates = [];
  const lo = Math.max(0, bin - 1);
  const hi = Math.min(NUM_BINS - 1, bin + 1);
  for (let b = lo; b <= hi; b++) {
    const off = b * MAX_PER_BIN;
    for (let j = 0; j < binCounts[b]; j++) {
      candidates.push(binEntities[off + j]);
    }
  }
  return candidates;
}
