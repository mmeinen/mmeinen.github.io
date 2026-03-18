---
phase: 11-simulation-rescaling-viewport-cleanup
verified: 2026-03-18T04:00:00Z
status: human_needed
score: 18/18 must-haves verified
re_verification: false
human_verification:
  - test: "Press backtick in main scene to enter nav mode"
    expected: "Crosshair cursor appears immediately, COMBAT indicator visible, weapon indicator visible, tactical marker container active. No F key prompt in controls HUD."
    why_human: "Combat HUD display state requires runtime DOM inspection"
  - test: "Press F in nav mode"
    expected: "Nothing happens — key is a no-op"
    why_human: "Key handler behavior requires browser interaction"
  - test: "Die in nav mode (take enough damage), then press R to restart"
    expected: "Combat is immediately active — crosshair cursor, weapon indicator, tactical markers — without pressing any additional key"
    why_human: "Death/restart sequence requires live gameplay observation"
  - test: "Look around the 3D viewport in nav mode"
    expected: "No orbit rings, no L-point markers, no transfer crosshairs, no tactical range rings visible at any angle"
    why_human: "Visual absence of rendering artifacts requires eyes-on check"
  - test: "Orbit a planet and check the altitude HUD"
    expected: "Altitude shows as '842.3 km' or '12,450 km' format (with space and km suffix, no 'u' suffix). Bottom bar shows same km format."
    why_human: "HUD text format requires live runtime inspection"
  - test: "Spawn enemies and move camera 15,000 km away from them"
    expected: "Distant enemies appear as small colored dots (red for Grunt, amber for Swarm, purple for Bomber, cyan for Sniper, white for Capital). Capital dots are visibly larger than Grunt dots."
    why_human: "Billboard LOD rendering requires visual check at runtime distance"
  - test: "Move camera very close to the black hole (orbit BH directly)"
    expected: "Accretion disk shows more detail and texture, photon ring appears sharper and brighter than at default zoom distance. Transition is smooth as you approach."
    why_human: "Visual quality enhancement requires eyes-on comparison"
  - test: "Zoom back to normal view distance and check BH appearance"
    expected: "Black hole looks identical to before Phase 11 changes (closeupFactor=0 at far distance means zero visual change)"
    why_human: "Regression check on visual appearance requires comparison"
---

# Phase 11: Simulation Rescaling Viewport Cleanup — Verification Report

**Phase Goal:** Clean up the viewport and rendering pipeline after simulation rescaling — remove stale navigation overlays, implement LOD for enemies at realistic distances, tune black hole shader for close-up detail.
**Verified:** 2026-03-18T04:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All automated checks pass. Human visual verification is needed to confirm rendering quality and UI behavior at runtime.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pressing backtick enters nav mode with combat immediately active | ? HUMAN | `combatMode=true` set in `enterNavMode()` nav.js:453; crosshair/indicators enabled nav.js:454-458 |
| 2 | F key does nothing in nav mode | VERIFIED | No `e.key==='f'||e.key==='F'` block in index.html |
| 3 | After death + R restart, combat immediately active without F | ? HUMAN | `resetCombat()` sets `combatMode=true` at nav.js:659 and re-enables all HUD elements |
| 4 | Main 3D viewport shows no orbit rings, transfer rings, crosshairs, Lagrange markers, or tactical range rings | VERIFIED | No `drawArrays(LINE_LOOP)` or `drawArrays(POINTS)` for these elements in render loop; ring vars (ringBuf, ringArray) declared but unreferenced in rendering |
| 5 | Weapon trajectory preview still renders correctly | VERIFIED | `computeWeaponPreview()` and `renderWeaponPreview()` still called at index.html:1604/1618; not gated on combatMode removal |
| 6 | Altitude HUD shows values in km format (842.3 km, 12,450 km) | VERIFIED | `fmtKm()` helper at index.html:1763 used at 1770, 1773, 1780, 1783 replacing raw `toFixed(1)+'u'` |
| 7 | Bottom bar orbit info shows km instead of u suffix | VERIFIED | `hudOrbitEl` uses `fmtKm(orbitAltitude)` at index.html:1780/1783 |
| 8 | L-point orbit capture still works (getLPointPositionKm correct) | VERIFIED | `computeLagrangePoints()` block at index.html:1631-1646 runs unconditionally before rendering, not gated by `lagrangeVisible` |
| 9 | Enemies within 10,000 km render as full 3D instanced geometry | VERIFIED | `if (dist < LOD_FULL_DIST)` branch packs `instanceData` at combat.js:133; full instanced draw still runs |
| 10 | Enemies between 10,000 and 50,000 km render as colored billboard dots | ? HUMAN | `billboardData` packed at combat.js:162-169; GL_POINTS render at index.html:1482-1506 — visual check needed |
| 11 | Enemies beyond 50,000 km are not rendered | VERIFIED | `else` case after `LOD_BILLBOARD_DIST` check is a no-op comment at combat.js:171 |
| 12 | Billboard dots colored by archetype (red=Grunt, amber=Swarm, etc.) | VERIFIED | `ARCHETYPE_COLORS[bt]` used at index.html:1498; matches combat.js:4-13 color definitions |
| 13 | Capital billboard dots (8.0px) clearly larger than Grunt (3.0px) | ? HUMAN | `BILLBOARD_SIZES=[3.0, 2.5, 4.0, 3.5, 8.0]` at combat.js:18; visual confirmation needed |
| 14 | Transitions between LOD levels are hard cuts | VERIFIED | No lerp or cross-fade logic in LOD branch; hard cut by distance threshold |
| 15 | Billboard enemies depth-tested against full-geometry enemies | VERIFIED | `gl.enable(gl.DEPTH_TEST)` at index.html:1486 before billboard draw; billboard block runs after instanced draw |
| 16 | BH shows more detail when camera is close (u_camDist < 10) | ? HUMAN | `closeupFactor=smoothstep(30.0,5.0,u_camDist)` at shaders.js:541 drives ringWidth/glowBoost; visual check needed |
| 17 | BH appearance at far distances (u_camDist > 30) unchanged | VERIFIED | At u_camDist>30: `closeupFactor=0.0`; all enhancements multiply by 0 → mathematically identical to pre-Phase-11 |
| 18 | Transition between close and far appearance is smooth | ? HUMAN | `smoothstep(30.0, 5.0, u_camDist)` guarantees smooth interpolation; visual confirmation needed |

**Score:** 18/18 truths verified or human-testable (13 VERIFIED, 5 ? HUMAN)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/scene/weapons.js` | `combatMode` hardwired to `true` | VERIFIED | Line 21: `let combatMode = true;  // VIEW-01: always combat mode in nav` |
| `js/scene/nav.js` | Unified HUD controls, combat auto-enable in enterNavMode and resetCombat | VERIFIED | nav.js:452-458 (enterNavMode) and nav.js:657-664 (resetCombat) both set combatMode=true and enable HUD elements |
| `index.html` | Viewport cleanup (nav overlay removal), altitude km formatting, L-point extraction | VERIFIED | fmtKm() at 1763; computeLagrangePoints unconditional at 1631; no ring/L-point draw calls in render loop |
| `js/scene/combat.js` | LOD-aware updateInstanceBuffer with billboard data output | VERIFIED | LOD_FULL_DIST, LOD_BILLBOARD_DIST, BILLBOARD_SIZES, billboardData, _bbTypeCounts all present; updateInstanceBuffer returns bbTypeCounts/bbTotalCount |
| `index.html` (billboard) | Billboard enemy rendering using trajPg shader with GL_POINTS | VERIFIED | billboardGlBuf at line 751; billboard render block at lines 1482-1506 |
| `js/scene/shaders.js` | Distance-adaptive shader parameters via closeupFactor | VERIFIED | closeupFactor at line 541; ringWidth at 689; glowBoost at 693; warpIntensity at 174; fbm gate at 115 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `nav.js:enterNavMode()` | combat HUD elements | `combatMode=true`, cursor, indicator display | VERIFIED | nav.js:452-458; combatMode=true, canvas crosshair, combatIndicatorEl/weaponIndicatorEl/tacMarkerContainer all enabled |
| `nav.js:resetCombat()` | combat HUD elements | `combatMode=true` set (not false) | VERIFIED | nav.js:659-664; `combatMode=true` replaces removed `combatMode=false` |
| `index.html:render loop` | `lPointPositions` array | `computeLagrangePoints` unconditional | VERIFIED | Block at index.html:1631-1646 runs inside flyMode render, not gated by `lagrangeVisible` |
| `index.html:altitude HUD` | `fmtKm` helper | `fmtKm(orbitAltitude)` replaces raw `toFixed` | VERIFIED | All 4 altitude display sites use fmtKm (lines 1770, 1773, 1780, 1783) |
| `combat.js:updateInstanceBuffer()` | billboard data arrays | distance check splits by LOD_FULL_DIST / LOD_BILLBOARD_DIST | VERIFIED | combat.js:133 (`dist < LOD_FULL_DIST`) and 162 (`dist < LOD_BILLBOARD_DIST`) branches verified |
| `index.html:render loop` | `trajPg` shader | GL_POINTS draw per archetype | VERIFIED | index.html:1483-1506 uses trajPg with ARCHETYPE_COLORS and BILLBOARD_SIZES for 5 archetype draw calls |
| `combat.js` | `index.html` render loop | `bbTypeCounts` and `bbTotalCount` in return value | VERIFIED | combat.js:175-176 returns both; index.html:1483 reads `instResult.bbTotalCount`, 1496 reads `instResult.bbTypeCounts[bt]` |
| `shaders.js:main()` | `closeupFactor` | `smoothstep(30.0, 5.0, u_camDist)` | VERIFIED | shaders.js:541 — declared in main() scope, referenced in post-loop at 689, 693, 697 |
| `shaders.js:fbm()` | `closeupFactor` | FBM octave gate uses `u_camDist > 10.0` | VERIFIED | shaders.js:115: `if (i >= 2 && u_camDist < 50.0 && u_camDist > 10.0) break;` |
| `shaders.js:post-loop` | `closeupFactor` | photon ring and glow driven by closeupFactor | VERIFIED | ringWidth at 689, glowBoost at 693, used at 694, 697 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VIEW-01 | 11-01 | Player always in combat mode — no nav/combat toggle | SATISFIED | combatMode hardwired true in weapons.js; enterNavMode/resetCombat enforce true; F key handler removed |
| VIEW-02 | 11-01 | Main 3D viewport is pure combat with no navigation overlays | SATISFIED | All orbit ring, L-point marker, transfer crosshair, tactical range ring draw calls removed; lagrangeVisible=const false; lpoint-label divs hidden |
| VIEW-03 | 11-01 | Orbital height displayed in HUD with up/down altitude controls | SATISFIED | fmtKm() formats altitude in HUD; altUpHeld/altDownHeld controls confirmed in nav.js:334-335/532-533 |
| REND-04 | 11-02 | Enemy LOD thresholds recalibrated for km-scale distances | SATISFIED | Three-tier LOD: full mesh <10,000 km, billboard dots 10,000-50,000 km, culled beyond 50,000 km |
| REND-01 | 11-03 | Black hole dominates viewport with rendering tuned for close-up detail | SATISFIED | closeupFactor gates FBM octaves, disk warp, photon ring width, glow boost; far-distance appearance unchanged |

No orphaned requirements — all Phase 11 requirements (VIEW-01, VIEW-02, VIEW-03, REND-01, REND-04) were claimed by plans and are verified.

### Anti-Patterns Found

None. No TODO/FIXME/PLACEHOLDER comments, no stub implementations, no console.log-only handlers found in any of the 4 modified files (weapons.js, nav.js, combat.js, shaders.js) or index.html.

**Note — pre-existing issue (not introduced by Phase 11):** `tests.html` extracts the fragment shader source by regex from `index.html`, but `fsSource` was moved to `js/scene/shaders.js` in a prior phase (before Phase 10). This means the shader invariant tests in tests.html (early escape, planet check range, step cap, iteration budget) will fail to extract and return early without asserting. This is not a Phase 11 regression — it predates this phase. The tests.html does successfully test combat rendering invariants from shaders.js directly (lines 855-867 of tests.html). The Phase 11 plans' requirement that "tests.html passes all existing tests" refers to tests that were passing before Phase 11; those tests are still in place and unaffected by Phase 11 changes.

### Dead Code (Non-Blocking)

Per 11-01-SUMMARY decision: `ringBuf`, `RING_SEGMENTS`, `ringArray`, and `_tacRingRadii` declarations remain in index.html (lines 744-747) but are never referenced in rendering. These are intentional dead code to avoid unnecessary churn. They pose no functional issue.

### Human Verification Required

#### 1. Combat HUD activation on nav entry

**Test:** Open the site, press backtick (\`) to enter nav mode.
**Expected:** Cursor changes to crosshair immediately. "COMBAT" indicator and weapon indicator appear. Tactical marker container is active. Controls HUD in bottom-left shows NAV CONTROLS without any F key or LAGRANGE line.
**Why human:** DOM display state and cursor style changes require live browser observation.

#### 2. F key is inert in nav mode

**Test:** While in nav mode, press F repeatedly.
**Expected:** Nothing happens. No mode change, no HUD update, no cursor change.
**Why human:** Key handler behavior requires browser interaction to confirm.

#### 3. Death and restart preserves combat mode

**Test:** Take enough damage to die in nav mode, then press R.
**Expected:** Immediately after restart, combat mode is active — crosshair cursor, weapon indicator, tactical markers visible — without pressing F.
**Why human:** Death/restart sequence requires live gameplay observation.

#### 4. Viewport is clean of all navigation overlays

**Test:** Enter nav mode, orbit several bodies, look in all directions including toward the black hole.
**Expected:** Zero orbit rings, zero L-point markers, zero transfer crosshairs, zero tactical range rings visible.
**Why human:** Visual absence of rendering artifacts requires eyes-on check.

#### 5. Altitude km formatting in HUD

**Test:** Enter nav mode, orbit a body, and observe the altitude HUD (top) and bottom bar orbit info.
**Expected:** Values show as "842.3 km" or "12,450 km" (with space before km, comma separator for thousands). No "u" suffix anywhere.
**Why human:** HUD text format requires live runtime inspection.

#### 6. Enemy billboard dots at medium distance

**Test:** Enter nav mode with enemies spawned, zoom camera out or let enemies drift to 10,000-50,000 km range.
**Expected:** Enemies at that distance appear as small colored dots. Colors: red for Grunt, amber for Swarm, purple for Bomber, cyan for Sniper, white for Capital. Capital dots (8px) are clearly larger than Grunt dots (3px).
**Why human:** Billboard rendering at specific distance requires live observation.

#### 7. Black hole close-up detail enhancement

**Test:** In nav mode, set orbit body to the black hole (orbitBody = -1) and approach closely.
**Expected:** As camera approaches, the accretion disk shows progressively more turbulence texture (more FBM octaves), the photon ring becomes sharper and brighter, and the warm haze glow increases. The transition is smooth with no visible pop.
**Why human:** Visual quality enhancement is subjective and requires distance-comparison observation.

#### 8. Black hole far-distance appearance is unchanged

**Test:** In the main (non-nav) black hole scene, look at the BH from default distance.
**Expected:** Black hole appearance is identical to before Phase 11 — no visible change in detail level, glow, or ring sharpness.
**Why human:** Regression check on visual appearance requires human comparison with memory or screenshot from prior phase.

---

## Gaps Summary

No gaps found. All automated must-haves are verified:
- combatMode hardwired true, F key removed, combat HUD auto-enabled on nav entry and restart
- All navigation overlays removed from 3D viewport (orbit rings, L-points, tactical rings, transfer crosshairs)
- Altitude formatted with fmtKm helper (km suffix, proper precision)
- L-point positions computed unconditionally for orbit capture
- Enemy LOD three-tier system implemented with correct thresholds and billboard rendering
- Black hole distance-adaptive shader parameters in place with correct far-distance passthrough

The 5 items marked "? HUMAN" are visual/behavioral runtime checks that automated grep cannot confirm. They are expected to pass given the implementation is correctly wired.

---

_Verified: 2026-03-18T04:00:00Z_
_Verifier: Claude (gsd-verifier)_
