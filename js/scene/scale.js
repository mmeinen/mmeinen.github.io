// ============================================================
// scale.js -- Single source of truth for km-scale constants
// Phase 10: Scale Foundation
//
// All constants derived from CONTEXT.md locked decisions:
//   BODY_SCALE = 800 (Jupiter diameter: 2.5 * 2 * 800 = 4,000 km)
//   ORBIT_SCALE = 1316 (Jupiter orbit: 38 * 1316 = 50,008 km)
//   BH_GM_KM from Kepler's law at Jupiter's 60s orbit
//
// This file does NOT reference or import planetData.
// It receives planetData entries as function parameters.
// ============================================================

// --- Scale factors ---
const BODY_SCALE  = 800;   // abstract radius unit -> km
const ORBIT_SCALE = 1316;  // abstract orbit radius -> km

// --- Black hole dimensions (km) ---
const BH_DIAMETER_KM = 20000;
const BH_RADIUS_KM   = 10000;

// --- Planet body diameters (km) ---
// Parallel to planetData indices: Jupiter=0, Saturn=1, Uranus=2,
// Neptune=3, Venus=4, Earth=5, Mars=6
// Derived from abstract radius * 2 * BODY_SCALE
const PLANET_DIAMETER_KM = [
  4000,   // Jupiter: 2.5 * 2 * 800
  3200,   // Saturn:  2.0 * 2 * 800
  2400,   // Uranus:  1.5 * 2 * 800
  2240,   // Neptune: 1.4 * 2 * 800
  864,    // Venus:   0.54 * 2 * 800
  960,    // Earth:   0.6 * 2 * 800
  2080    // Mars:    1.3 * 2 * 800
];

// --- Planet orbit radii (km) ---
// Parallel to planetData indices
// Derived from abstract oR * ORBIT_SCALE
const PLANET_ORBIT_KM = [
  50008,   // Jupiter: 38.0 * 1316
  68432,   // Saturn:  52.0 * 1316
  89488,   // Uranus:  68.0 * 1316
  113176,  // Neptune: 86.0 * 1316
  36848,   // Venus:   28.0 * 1316
  43428,   // Earth:   33.0 * 1316
  59220    // Mars:    45.0 * 1316
];

// --- Keplerian orbital mechanics ---
// Jupiter orbit is the anchor: 60 seconds at 50,008 km
const JUPITER_ORBIT_KM  = 50008;
const JUPITER_PERIOD_S  = 60.0;

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
const BIN_WIDTH_KM = 5000;   // Each bin covers 5,000 km radial band
const NUM_BINS_KM  = 28;     // 28 bins covers 0-140,000 km (past world boundary)

// --- World boundary ---
const MAX_RADIUS_KM = 120000;  // ~1.06x Neptune orbit
// World boundary: 1.2x outermost orbit (Neptune at 113,176 km)
const WORLD_BOUNDARY_KM = Math.ceil(PLANET_ORBIT_KM[3] * 1.2); // ~135,812 km

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
