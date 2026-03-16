/* ---- Orbital mechanics module ---- */
/* Provides SOI radii, Lagrange point positions, Hohmann delta-v formulas,
   and orbit state management for the navigation system.
   Depends on globals from nav.js: BH_GM, _planetGM, planetData, planetPosAtTime
   and from scale.js: BH_GM_KM, ORBIT_SCALE, BODY_SCALE */

const ORBIT_STATE = { ORBITING: 0, TRANSFER: 1, FREE: 2 };

/* ---- SOI and orbit altitude tables ---- */
// Filled by initOrbitalData() during enterNavMode()
const BODY_SOI = new Float32Array(8);       // index 0 = BH, 1-7 = planets 0-6
const DEFAULT_ORBIT_ALT = new Float32Array(8); // same indexing

// Map: body index (-1 = BH, 0-6 = planet) to table index (0-7)
function _tableIdx(bodyIndex) { return bodyIndex + 1; }

/* ---- SOI computation ---- */
function computeSOI(planetIndex) {
  // Hill sphere with gameplay floor: max(d * cbrt(planetGM / (3 * BH_GM)), radius * 2.5 + 1.0)
  const p = planetData[planetIndex];
  const d = p.oR; // abstract-unit orbit radius (no doubling)
  const planetGM = _planetGM[planetIndex];
  const hillR = d * Math.cbrt(planetGM / (3 * BH_GM));
  const floor = p.radius * 2.5 + 1.0;
  return Math.max(hillR, floor);
}

/* ---- Body property helpers ---- */
function getBodyGM(index) {
  // index -1 = black hole, 0-6 = planets
  if (index === -1) return BH_GM;
  return _planetGM[index];
}

function getBodyRadius(index) {
  // index -1 = black hole event horizon (~2.0), 0-6 = planet radius
  if (index === -1) return 2.0;
  return planetData[index].radius;
}

/* ---- Circular orbit velocity ---- */
function circularVelocity(GM, r) {
  return Math.sqrt(GM / r);
}

/* ---- Hohmann transfer delta-v ---- */
function computeHohmannDV(r1, r2, GM) {
  // Semi-major axis of transfer ellipse
  const a_transfer = (r1 + r2) / 2;
  // Current circular velocity
  const v_circ = Math.sqrt(GM / r1);
  // Velocity at periapsis of transfer ellipse (vis-viva equation)
  const v_transfer = Math.sqrt(GM * (2 / r1 - 1 / a_transfer));
  // Delta-v for departure burn
  const dv = v_transfer - v_circ;
  // Transfer time (half orbital period of transfer ellipse)
  const transferTime = Math.PI * Math.sqrt(a_transfer * a_transfer * a_transfer / GM);
  return { dv: dv, transferTime: transferTime };
}

/* ---- Body velocity helper ---- */
function getBodyVelocity(bodyIndex) {
  // Returns [vx, 0, vz] of the body itself (its orbital motion).
  // For a planet at position [px, 0, pz] with angular speed sp:
  //   velocity = [sp * pz, 0, -sp * px]
  if (bodyIndex === -1) return [0, 0, 0]; // BH is stationary
  if (bodyIndex >= 100) {
    // L-point co-rotates with its parent planet
    const fi = bodyIndex - 100;
    const pi = [0, 1, 3][Math.floor(fi / 4)]; // LPOINT_PLANETS mapping
    const sp = planetData[pi].sp;
    const pos = getLPointPosition(fi);
    return [sp * pos[2], 0, -sp * pos[0]];
  }
  const p = planetData[bodyIndex];
  const pos = getBodyPosition(bodyIndex);
  return [p.sp * pos[2], 0, -p.sp * pos[0]];
}

/* ---- Auto-circularize on SOI capture ---- */
function circularizeOrbit(flyPos, flyVel, bodyPos, bodyGM, bodyVel) {
  // Sets flyVel to body velocity + circular orbit velocity around body.
  // bodyVel is the body's own orbital velocity (so the ship co-moves with it).
  const dx = flyPos[0] - bodyPos[0];
  const dz = flyPos[2] - bodyPos[2];
  const r = Math.sqrt(dx * dx + dz * dz);
  if (r < 0.001) return;
  const v_circ = Math.sqrt(bodyGM / r);
  // Tangent direction (perpendicular to radius, prograde)
  const tx = -dz / r, tz = dx / r;
  const bvx = bodyVel ? bodyVel[0] : 0;
  const bvz = bodyVel ? bodyVel[2] : 0;
  flyVel[0] = bvx + tx * v_circ;
  flyVel[1] = 0;
  flyVel[2] = bvz + tz * v_circ;
}

/* ---- Lagrange point computation ---- */
// Only computed for major planets: Jupiter (0), Saturn (1), Neptune (3)
const LAGRANGE_PLANETS = [0, 1, 3];

function computeLagrangePoints(planetIndex, time) {
  // Only compute for major planets
  if (LAGRANGE_PLANETS.indexOf(planetIndex) === -1) return null;

  const p = planetData[planetIndex];
  const pos = planetPosAtTime(p, time);
  const d = Math.sqrt(pos[0] * pos[0] + pos[2] * pos[2]); // distance from BH
  if (d < 0.001) return null;

  const angle = Math.atan2(pos[0], pos[2]); // planet's orbital angle

  const planetGM = _planetGM[planetIndex];
  const r_hill = d * Math.cbrt(planetGM / (3 * BH_GM));

  // L1: Between BH and planet (closer to BH by r_hill)
  const r_L1 = d - r_hill;
  const L1 = [r_L1 * Math.sin(angle), 0, r_L1 * Math.cos(angle)];

  // L2: Beyond planet (farther from BH by r_hill)
  const r_L2 = d + r_hill;
  const L2 = [r_L2 * Math.sin(angle), 0, r_L2 * Math.cos(angle)];

  // L4: 60 degrees ahead of planet in orbit
  const a4 = angle + Math.PI / 3;
  const L4 = [d * Math.sin(a4), 0, d * Math.cos(a4)];

  // L5: 60 degrees behind planet in orbit
  const a5 = angle - Math.PI / 3;
  const L5 = [d * Math.sin(a5), 0, d * Math.cos(a5)];

  return { L1: L1, L2: L2, L4: L4, L5: L5, r_hill: r_hill };
}

/* ---- Initialize orbital data tables ---- */
// Called from enterNavMode()
function initOrbitalData() {
  // Black hole (index -1 -> table index 0)
  BODY_SOI[0] = 8.0;
  DEFAULT_ORBIT_ALT[0] = 5.0;

  // Planets (index 0-6 -> table index 1-7)
  for (let i = 0; i < 7; i++) {
    const soi = computeSOI(i);
    BODY_SOI[i + 1] = soi;
    // Default orbit altitude: roughly radius * 1.5, with per-planet tuning
    const r = planetData[i].radius;
    let alt;
    if (i === 0)      alt = 4.0;   // Jupiter
    else if (i === 1) alt = 3.5;   // Saturn
    else if (i === 2) alt = 3.0;   // Uranus
    else if (i === 3) alt = 3.0;   // Neptune
    else if (i === 4) alt = 1.0;   // Venus
    else if (i === 5) alt = 1.2;   // Earth
    else              alt = 2.5;   // Mars
    DEFAULT_ORBIT_ALT[i + 1] = alt;
  }
}

/* ---- Public SOI/altitude lookup ---- */
function getBodySOI(bodyIndex) {
  return BODY_SOI[_tableIdx(bodyIndex)];
}

function getDefaultOrbitAlt(bodyIndex) {
  return DEFAULT_ORBIT_ALT[_tableIdx(bodyIndex)];
}
