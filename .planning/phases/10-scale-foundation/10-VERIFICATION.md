---
phase: 10-scale-foundation
verified: 2026-03-16T22:00:00Z
status: human_needed
score: 9/9 must-haves verified
re_verification: null
gaps: []
human_verification:
  - test: "Enter nav mode and time Jupiter completing one full orbit"
    expected: "Jupiter completes one full revolution in approximately 60 seconds"
    why_human: "Cannot run the browser game programmatically; orbital period requires live timing"
  - test: "Navigate to Neptune orbit (~113,000 km), observe ship and enemies"
    expected: "No visible float32 jitter on the ship model or enemy meshes at any distance"
    why_human: "Float32 precision jitter is a visual artifact requiring direct observation"
  - test: "Observe multiple entities at different orbital radii simultaneously"
    expected: "No Z-fighting (flickering/depth ordering artifacts) between any entities"
    why_human: "Z-fighting is a rendering artifact requiring direct visual inspection"
  - test: "Fire kinetic rounds at an enemy at 5,000 km range"
    expected: "Round arrives in under 0.5 seconds; combat feels snappy"
    why_human: "Subjective 'feel' and timing at scale require live play"
  - test: "Exit nav mode and inspect the black hole scene"
    expected: "Black hole, planets, and HUD labels render identically to before Phase 10"
    why_human: "Visual regression in normal mode requires direct observation"
---

# Phase 10: Scale Foundation Verification Report

**Phase Goal:** Migrate game world from abstract coordinates to km-scale using ORBIT_SCALE and BODY_SCALE factors, implement camera-relative rendering for float32 precision, add logarithmic depth buffer, establish Keplerian orbital mechanics anchored to Jupiter's 60s period, and rebalance all combat constants for the new scale.
**Verified:** 2026-03-16T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | scale.js exports all km-scale constants (BODY_SCALE, ORBIT_SCALE, BH_GM_KM, archetype sizes, collision bins) | VERIFIED | `js/scene/scale.js` exists, 97 lines, all constants present at global scope |
| 2  | BH_GM_KM is derived from Kepler's third law at Jupiter's 60s orbit, not hardcoded | VERIFIED | Line 56-57: `(4 * Math.PI * Math.PI * Math.pow(JUPITER_ORBIT_KM, 3)) / (JUPITER_PERIOD_S * JUPITER_PERIOD_S)` |
| 3  | tests.html validates scale constants and Kepler derivation automatically | VERIFIED | 9 assertions added in "Scale Foundation (Phase 10)" section covering SCALE-01/02/03/07/TIME-02 |
| 4  | Camera-relative rendering (CRR) applied to all nav/combat render paths | VERIFIED | `_camWX/Y/Z` subtracted in 14+ render sites; `mat4LookAt([0,0,0],...)` at line 1430 |
| 5  | Logarithmic depth buffer in all 3D geometry fragment shaders | VERIFIED | `GL_EXT_frag_depth` + `gl_FragDepthEXT` in shipFS, trajFS, enemyFS, billboardFS (shaders.js) |
| 6  | Normal mode rendering completely unaffected by km-scale changes | VERIFIED | All CRR and km-scale perspective inside `if(flyMode)` block (line 1411); normal mode untouched |
| 7  | Bullet time and fast forward removed; simDtSec = dtSec always | VERIFIED | Line 1192: `const simDtSec=dtSec;`; no BULLET_TIME_SCALE or FAST_FORWARD_SCALE in nav.js or index.html |
| 8  | Keplerian gravity operates in km; flyPos in km during flyMode | VERIFIED | `enterNavMode()` uses `flyPos[0]=cx*ORBIT_SCALE`; `updateNav` calls `computeGravAccelKm` |
| 9  | All combat constants (weapons, missiles, AI, bins) recalibrated to km scale | VERIFIED | KINETIC_SPEED=15000 km/s, MISSILE_SPEED=3000 km/s, BIN_WIDTH=BIN_WIDTH_KM=5000, DETECT_RADIUS=20000 km |

**Score:** 9/9 truths verified (automated checks)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/scene/scale.js` | All km-scale constants, Kepler-derived BH_GM_KM | VERIFIED | 97 lines; BODY_SCALE=800, ORBIT_SCALE=1316, BH_GM_KM formula-derived, all archetype/bin constants |
| `tests.html` | SCALE-01/02/03/07/TIME-02 automated tests | VERIFIED | `<script src="js/scene/scale.js">` at line 75; 9 assertions in Scale Foundation section (lines 1006-1091) |
| `js/scene/shaders.js` | Log depth in enemy/ship/trajectory/billboard fragment shaders | VERIFIED | `GL_EXT_frag_depth` + `gl_FragDepthEXT` in 4 fragment shader strings |
| `js/scene/combat.js` | CRR-aware updateInstanceBuffer, BIN_WIDTH_KM, AI distances in km | VERIFIED | `updateInstanceBuffer(simTime, camX, camY, camZ)` at line 111; BIN_WIDTH=BIN_WIDTH_KM at line 152; DETECT_RADIUS=20000 at line 198 |
| `index.html` | EXT_frag_depth acquisition, CRR view matrix, scale.js script tag | VERIFIED | `getExtension('EXT_frag_depth')` at line 181; `mat4LookAt([0,0,0],...)` at line 1430; `<script src="js/scene/scale.js">` at line 415 |
| `js/scene/nav.js` | BH_GM_KM gravity, flyPos km conversion in enterNavMode, no oR doubling | VERIFIED | `enterNavMode` uses `ORBIT_SCALE` for km conversion (line 412); `computeGravAccelKm` called in `updateNav`; no `oR*=2` found |
| `js/scene/orbital.js` | ORBIT_SCALE in SOI computation, getBodyVelocityKm | VERIFIED | `computeSOI` uses `p.oR * ORBIT_SCALE` (line 21); `getBodyVelocityKm` defined (line 80) |
| `js/scene/weapons.js` | km/s projectile speeds, km hit radii | VERIFIED | KINETIC_SPEED=15000, PLASMA_SPEED=30000, HIT_RADIUS_KINETIC=500, HIT_RADIUS_PLASMA=800 |
| `js/scene/missiles.js` | km/s missile speeds, km detonation radius | VERIFIED | MISSILE_SPEED=3000, NUKE_MISSILE_SPEED=2500, MISSILE_DET_RADIUS=300; BH_GM_KM inline gravity |
| `js/scene/particles.js` | km/s particle speeds, CRR-aware render function | VERIFIED | Speed 500-2000 km/s (line 41); `renderParticles(gl, ..., camX, camY, camZ)` with CRR subtraction |
| `js/scene/explosions.js` | km-scale explosion sizes, CRR-aware render function | VERIFIED | EXPLOSION_BASE_SIZE=1000 km (line 8); `renderExplosions(gl, ..., camX, camY, camZ)` with CRR |
| `js/scene/waves.js` | km-scale spawn positions using getBodyPositionKm | VERIFIED | `spawnWave` calls `getBodyPositionKm(pIdx, simTime)` + `getBodyRadiusKm` + `STATION_KEEP_ALT` (1500 km) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `js/scene/scale.js` | `planetData (index.html)` | ORBIT_SCALE derivation | VERIFIED | `ORBIT_SCALE` present; `planetPosKm(p, t)` uses `p.oR * ORBIT_SCALE` (scale.js line 83) |
| `tests.html` | `js/scene/scale.js` | `<script src="js/scene/scale.js">` | VERIFIED | tests.html line 75 |
| `index.html (render loop)` | `js/scene/combat.js (updateInstanceBuffer)` | Passes camera world position | VERIFIED | Line 1447: `updateInstanceBuffer(simTime,_camWX,_camWY,_camWZ)` |
| `index.html (flyMode block)` | `mat4Perspective` | Gated km near/far | VERIFIED | Line 1426 inside `if(flyMode)`: uses extFragDepth-conditional near/far (1.0/10.0 to 600000/300000) |
| `js/scene/shaders.js (enemy fragment)` | EXT_frag_depth extension | `gl_FragDepthEXT` log formula | VERIFIED | `GL_EXT_frag_depth` + `gl_FragDepthEXT` present in enemyFS, shipFS, trajFS, billboardFS |
| `js/scene/nav.js` | `js/scene/scale.js` | Uses BH_GM_KM for gravity | VERIFIED | `computeGravAccelKm` uses `BH_GM_KM` (line 98); `enterNavMode` uses `ORBIT_SCALE` |
| `index.html (render loop)` | `js/scene/nav.js (updateNav)` | Passes simDtSec=dtSec | VERIFIED | Line 1233: `updateNav(simDtSec,simTime)` where `simDtSec=dtSec` |
| `js/scene/nav.js (enterNavMode)` | `planetData` | Recomputes sp Keplerian WITHOUT doubling oR | VERIFIED | `enterNavMode` has no `oR*=2`; Keplerian sp = `Math.sqrt(BH_GM_KM)/Math.pow(oR_km,1.5)` |
| `js/scene/combat.js (enemy AI)` | `js/scene/scale.js` | Uses km-scale detection/attack ranges | VERIFIED | DETECT_RADIUS=20000 km, ATTACK_RANGE=7500 km, FIRE_RANGE=5000 km (lines 198-202) |
| `js/scene/combat.js (collision bins)` | `js/scene/scale.js` | Uses BIN_WIDTH_KM, NUM_BINS_KM | VERIFIED | Lines 152-153: `const BIN_WIDTH = BIN_WIDTH_KM; const NUM_BINS = NUM_BINS_KM` |
| `js/scene/weapons.js` | `js/scene/scale.js` | Uses km/s speed constants | PARTIAL | KINETIC_SPEED=15000 (km/s) declared locally, not imported from scale.js; BH_GM_KM used inline for gravity (not via computeGravAccelKm) — functionally correct |

**Note on PARTIAL key link:** The PLAN expected weapons.js to reference `KINETIC_SPEED` from scale.js. In practice, `KINETIC_SPEED=15000` is a local constant in weapons.js (not in scale.js). The physics is correct — `BH_GM_KM` is used directly inline for gravity in weapons.js and missiles.js rather than via `computeGravAccelKm`. The SUMMARY incorrectly characterized this as "switched to computeGravAccelKm." The actual implementation uses a local `_bhGravKm()` helper in combat.js and inline `BH_GM_KM` arithmetic in weapons.js and missiles.js. This is functionally equivalent and intentional (BH-only gravity for projectiles is a deliberate design choice).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SCALE-01 | Plan 01 | km coordinate system, BH diameter 20,000 km, Jupiter diameter 4,000 km | SATISFIED | scale.js: BH_DIAMETER_KM=20000, PLANET_DIAMETER_KM[0]=4000; tests validate |
| SCALE-02 | Plan 01 | Planet orbits ~50,000 km apart | SATISFIED | ORBIT_SCALE * 38 = 50008 km; tests validate range 49500-50500 |
| SCALE-03 | Plans 01 + 04 | Player=10km, Capital=8km, Grunts=500m | SATISFIED | PLAYER_SIZE_KM=10, CAPITAL_SIZE_KM=8, GRUNT_SIZE_KM=0.5 in scale.js; ARCHETYPE_SCALES=[1.0,1.0,1.3,1.2,16.0] in combat.js |
| SCALE-04 | Plan 02 | CRR prevents float32 jitter | SATISFIED (human verify) | _camWX/Y/Z float64 vars; all entity positions subtract cam before GPU upload; view matrix camera-at-origin |
| SCALE-05 | Plan 02 | Logarithmic depth buffer prevents Z-fighting | SATISFIED (human verify) | GL_EXT_frag_depth + gl_FragDepthEXT in 4 fragment shaders; extFragDepth acquired at init |
| SCALE-06 | Plans 02 + 03 | Normal mode rendering unaffected | SATISFIED (human verify) | All km-scale code inside `if(flyMode)`; simDtSec=dtSec is safe for both modes |
| SCALE-07 | Plans 01 + 04 | Collision bins recalibrated for km scale | SATISFIED | BIN_WIDTH=BIN_WIDTH_KM=5000, NUM_BINS=NUM_BINS_KM=24; covers 0-120,000 km; tests validate |
| TIME-01 | Plan 03 | Jupiter orbits in ~60 seconds | SATISFIED (human verify) | Keplerian sp = sqrt(BH_GM_KM)/oR_km^1.5 set in enterNavMode; requires live timing to confirm |
| TIME-02 | Plans 01 + 03 | All velocities derived from Jupiter 60s anchor | SATISFIED | BH_GM_KM formula-derived; _planetGM_km scales from BH_GM_KM via BODY_SCALE/ORBIT_SCALE; tests validate Kepler round-trip |

All 9 requirements for Phase 10 are accounted for. No orphaned requirements found (REQUIREMENTS.md traceability table marks all 9 as Phase 10 / Complete).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `index.html` | 220 | `flyBulletTime` DOM element declared but never used to add/toggle active state | Info | Stale DOM reference; no functional impact; the element no longer serves a purpose after bullet time removal |
| `10-03-SUMMARY.md` | 73 | Task 2 commit absorbed into Plan 02's metadata commit `39ed475` | Info | Bookkeeping anomaly; changes are present in codebase and verified correct |

No blocker or warning anti-patterns found. No TODO/FIXME/placeholder comments found in modified files. No empty implementations or stub handlers found.

### Human Verification Required

#### 1. Jupiter 60-Second Orbit

**Test:** Enter nav mode and time Jupiter completing one full orbit using a stopwatch.
**Expected:** Approximately 60 seconds per revolution (acceptable range: 55-65s to account for visual measurement imprecision).
**Why human:** Orbital period requires running the browser game with live timing. Cannot be verified programmatically from static code.

#### 2. No Float32 Jitter at Neptune Orbit

**Test:** In nav mode, navigate out to Neptune's orbit (~113,000 km). Observe the ship model and any enemy units from various camera angles.
**Expected:** Ship model and enemy meshes hold steady position with no visible shimmer, drift, or jitter.
**Why human:** Float32 precision artifacts at large distances are visual phenomena requiring direct observation.

#### 3. No Z-Fighting Across Orbital Radii

**Test:** In nav mode, position enemies at different orbital radii (e.g., one near Jupiter, one near Neptune) and zoom to observe both simultaneously.
**Expected:** No flickering, depth-fighting, or incorrect draw order between entities at different depths.
**Why human:** Z-fighting is a rendering artifact requiring direct visual inspection.

#### 4. Combat Feel at Real-Time Speed

**Test:** In nav mode, enter combat and fire kinetic rounds at an enemy approximately 5,000 km away.
**Expected:** Kinetic rounds appear to travel fast (arrive in ~0.3s). Combat feels snappy, not sluggish. Plasma bolts are near-instant.
**Why human:** Subjective "snappiness" and travel-time feel require live play at the correct scale.

#### 5. Normal Mode Regression Check

**Test:** Load the site normally (no nav mode). Observe the black hole scene for 30 seconds.
**Expected:** Black hole lensing, planet orbits, planet labels, and HUD readouts are identical to before Phase 10. No visual changes in normal mode.
**Why human:** Visual regression in the ray-march shader scene requires direct observation.

### Gaps Summary

No gaps found in automated checks. All 9 must-have truths are verified against the codebase. The 5 items above require human eyes to confirm visual and behavioral correctness that cannot be established through static code analysis.

**One clarification for the record:** The SUMMARY for Plan 04 states that gravity for projectiles and missiles was "switched to `computeGravAccelKm`." The actual implementation uses inline `BH_GM_KM` arithmetic (a local `_bhGravKm()` helper in combat.js, and direct inline formulas in weapons.js and missiles.js). This is functionally correct — BH-only km-scale gravity was the intended design — but the SUMMARY's description is imprecise. This is not a gap; it is a documentation inaccuracy.

---

_Verified: 2026-03-16T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
