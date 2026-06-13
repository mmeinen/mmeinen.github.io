// ============================================================
// scale.js -- Single source of truth for km-scale constants
//
// This file does NOT reference or import planetData.
// It receives planetData entries as function parameters.
// ============================================================

// --- Scale factors ---
const BODY_SCALE  = 4000;   // abstract radius unit -> km (5x)
const ORBIT_SCALE = 13160;  // abstract orbit radius -> km (10x)

// --- Black hole dimensions (km) ---
const BH_DIAMETER_KM = 100000;
const BH_RADIUS_KM   = 50000;

// --- Planet body diameters (km) ---
// Parallel to planetData indices (5 planets, one per family member):
// Jupiter=0 (Dad), Saturn=1 (Beatrix), Uranus=2 (Edmund), Neptune=3 (Madeline), Mars=4 (Theo)
// Derived from abstract radius * 2 * BODY_SCALE
const PLANET_DIAMETER_KM = [
  20000,  // Jupiter (Dad):      2.5 * 2 * 4000
  16000,  // Saturn  (Beatrix):  2.0 * 2 * 4000
  12000,  // Uranus  (Edmund):   1.5 * 2 * 4000
  11200,  // Neptune (Madeline): 1.4 * 2 * 4000
  10400   // Mars    (Theo):     1.3 * 2 * 4000
];

// --- Planet orbit radii (km) ---
// Parallel to planetData indices (Neptune stays at index 3 -- WORLD_BOUNDARY_KM depends on it)
// Derived from abstract oR * ORBIT_SCALE
const PLANET_ORBIT_KM = [
  500080,   // Jupiter (Dad):      38.0 * 13160
  684320,   // Saturn  (Beatrix):  52.0 * 13160
  894880,   // Uranus  (Edmund):   68.0 * 13160
  1131760,  // Neptune (Madeline): 86.0 * 13160
  592200    // Mars    (Theo):     45.0 * 13160
];

// --- Keplerian orbital mechanics ---
// Jupiter orbit is the anchor: 300 seconds (5 min) at new orbit radius
// Slower orbits sell the sense of scale -- things drift, not zip
const JUPITER_ORBIT_KM  = 500080;
const JUPITER_PERIOD_S  = 300.0;

// BH_GM_KM derived from Kepler's third law: GM = 4 * pi^2 * r^3 / T^2
// NOT hardcoded -- computed from the formula at Jupiter's orbit
const BH_GM_KM = (4 * Math.PI * Math.PI * Math.pow(JUPITER_ORBIT_KM, 3))
                 / (JUPITER_PERIOD_S * JUPITER_PERIOD_S);

// --- Archetype sizes (km) ---
const PLAYER_SIZE_KM  = 10.0;    // 10 km
const CAPITAL_SIZE_KM = 8.0;     // 8 km
const BOMBER_SIZE_KM  = 0.65;    // 650 m
const SNIPER_SIZE_KM  = 0.6;     // 600 m
const GRUNT_SIZE_KM   = 0.5;     // 500 m
const SWARM_SIZE_KM   = 0.5;     // 500 m

// --- Collision bins (km-scale) ---
const BIN_WIDTH_KM = 50000;  // Each bin covers 50,000 km radial band (10x)
const NUM_BINS_KM  = 28;     // 28 bins covers 0-1,400,000 km (past world boundary)

// --- World boundary ---
const MAX_RADIUS_KM = 1200000;  // ~1.06x Neptune orbit
// World boundary: 1.2x outermost orbit (Neptune at 1,131,760 km)
const WORLD_BOUNDARY_KM = Math.ceil(PLANET_ORBIT_KM[3] * 1.2); // ~1,358,112 km

// --- Helper functions ---

/**
 * Compute planet position in km from a planetData entry and sim time.
 * @param {Object} p - A planetData entry with oR, ph, sp fields
 * @param {number} t - Simulation time in seconds
 * @returns {number[]} [x, 0, z] position in km
 */
function planetPosKm(p, t) {
  const oR_km = p.oR * ORBIT_SCALE;
  const angle = p.sp * t + p.ph;  // sp is angular speed (rad/s) -- stays abstract
  return [oR_km * Math.sin(angle), 0, oR_km * Math.cos(angle)];
}

/**
 * Compute Keplerian orbital period from abstract oR value.
 * Uses Jupiter 60s orbit as anchor: T = 60 * (oR / 38)^1.5
 * @param {number} oR - Abstract orbit radius (from planetData)
 * @returns {number} Period in seconds
 */
function periodFromOr(oR) {
  return 60.0 * Math.pow(oR / 38.0, 1.5);
}
