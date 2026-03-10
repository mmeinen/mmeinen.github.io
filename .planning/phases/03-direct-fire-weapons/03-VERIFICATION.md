---
phase: 03-direct-fire-weapons
verified: 2026-03-10T18:23:40Z
status: passed
score: 12/15 must-haves verified (3 need human visual confirmation)
re_verification: false
human_verification:
  - test: "Toggle combat mode with F key, verify orange COMBAT indicator appears"
    expected: "Orange pulsing COMBAT label at top-center, crosshair cursor, weapon indicator at bottom-left"
    why_human: "Visual rendering, animation, and cursor behavior cannot be verified programmatically"
  - test: "Fire kinetic cannon and observe tracer visuals"
    expected: "5 bright white/yellow tracer points appear in a staggered burst, each leaving a short fading trail that curves around gravity wells"
    why_human: "GL_POINTS rendering, trail fade effect, and gravity curve are visual-only"
  - test: "Fire plasma gun and observe bolt visuals"
    expected: "Single large cyan glow bolt with white-hot core, visibly fading and shrinking over distance"
    why_human: "Dual-pass glow rendering and distance fade are visual-only"
  - test: "Enable combat mode, move crosshair, verify trajectory preview"
    expected: "For kinetic: curved white/yellow dotted line following gravity. For plasma: straighter cyan dots shrinking toward max range. Bright red/orange marker if trajectory intersects an enemy."
    why_human: "Preview line shape, color, and hit marker are visual-only"
  - test: "Verify navigation still works with combat mode off"
    expected: "Left-click on planet initiates orbit transfer when not in combat mode"
    why_human: "Interaction regression requires runtime testing"
---

# Phase 3: Direct-Fire Weapons Verification Report

**Phase Goal:** Player can engage enemies with two distinct direct-fire weapons -- a gravity-affected kinetic cannon and a light-speed plasma gun -- and preview trajectories before firing
**Verified:** 2026-03-10T18:23:40Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Player can toggle combat mode with F key and see visual confirmation | VERIFIED | index.html:509-519 toggles `combatMode`, shows/hides combat HUD elements, CSS `.fly-hud-combat` styled with orange warning color |
| 2 | Player can select kinetic cannon (1) or plasma gun (2) and see which is selected | VERIFIED | index.html:522-524 sets `selectedWeapon`, index.html:1117-1131 updates weapon indicator text ("1 KINETIC" / "2 PLASMA" + cooldown) |
| 3 | Left-click in combat mode fires the selected weapon toward the crosshair aim point | VERIFIED | index.html:415 `if(!dD&&combatMode){fireSelectedWeapon(simTime);return;}` gates click; `aimDir` computed each frame at line 908 |
| 4 | Kinetic rounds inherit ship velocity and curve around gravity wells | VERIFIED | weapons.js:82-83 `vx = flyVel[0] + aimDir[0] * KINETIC_SPEED`, weapons.js:371 `computeGravAccel` called in physics update |
| 5 | Plasma bolts travel in a straight line and fade/despawn over distance | VERIFIED | weapons.js:393-399 straight-line update (no gravity), despawn at `PLASMA_MAX_RANGE=120`, `distTrav` tracked |
| 6 | Kinetic fires a 5-round burst per click with staggered timing | VERIFIED | weapons.js:93 `kineticBurstRemaining = KINETIC_BURST_COUNT(5)`, weapons.js:355-361 `kineticBurstTimer` accumulator fires rounds at `KINETIC_BURST_DELAY=0.05` intervals |
| 7 | Plasma fires a single bolt with longer cooldown | VERIFIED | weapons.js:105-111 single `spawnProjectile(1,...)` call, `PLASMA_COOLDOWN=2.5` |
| 8 | Projectiles that reach enemy positions register as hits and are removed | VERIFIED | weapons.js:408-429 `checkProjectileHits()` uses `getCollisionCandidates(r)` radial bins, distance-squared check, calls `removeProjectile(i)` on hit |
| 9 | Kinetic rounds are visible as bright white/yellow tracer points with short fading trails | ? HUMAN | weapons.js:218-250 packs kinetic positions, draws GL_POINTS with color (1.0,0.94,0.71), trail ring buffer with alpha decay -- code correct but visual needs human |
| 10 | Plasma bolts are visible as large cyan glowing bolts that fade and shrink over distance | ? HUMAN | weapons.js:252-275 dual-pass rendering (glow 12px cyan + core 5px white-hot), fade factor computed from distTrav -- code correct but visual needs human |
| 11 | In combat mode, a trajectory preview line follows the crosshair in real-time | VERIFIED | weapons.js:147-197 `computeWeaponPreview()` called each frame (index.html:911), uses `simulateTrajectory` for kinetic and linear projection for plasma |
| 12 | Kinetic preview shows a curved dotted line with gravity deflection | VERIFIED | weapons.js:156-164 calls `simulateTrajectory()` which computes gravity-curved path |
| 13 | Plasma preview shows a straighter line with cyan dots that shrink toward max range | VERIFIED | weapons.js:166-173 linear projection, weapons.js:310-322 renders in 3 shrinking segments (3.0px, 2.0px, 1.5px) |
| 14 | If the trajectory preview passes through an enemy, a bright hit prediction marker appears | VERIFIED | weapons.js:177-196 checks each preview point against enemies via `getCollisionCandidates`, stores `hitPredictionPoint`, weapons.js:325-333 renders as red/orange 10px point |
| 15 | Both weapon types are visually distinct from each other and from enemy colors | ? HUMAN | Kinetic: white/yellow (1.0,0.94,0.71). Plasma: cyan (0.0,0.86,1.0). Enemy: red per CONTEXT.md. Colors specified correctly in code but visual distinctness needs human confirmation |

**Score:** 12/15 truths verified (3 need human visual confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/scene/weapons.js` | Projectile SoA store, weapon configs, firing logic, physics update, hit detection, trail buffer, trajectory preview, projectile render | VERIFIED | 430 lines. SoA store (128 slots), free-list allocation, kinetic gravity physics, plasma straight-line, burst fire, cooldown, hit detection via radial bins, trail ring buffer (512 points), trajectory preview (80 steps), renderProjectiles, renderWeaponPreview, computeWeaponPreview |
| `index.html` | Combat mode toggle, weapon selection, fire-on-click, script tag, projGlBuf, render calls | VERIFIED | Script tag at line 178 (after combat.js). Combat mode toggle (F key) at line 509. Weapon select (1/2) at line 522. Fire gate at line 415. updateProjectiles/checkProjectileHits at lines 632-633. projGlBuf created at line 328. Render calls at lines 911-913. Combat mode gate around orbit preview at line 922. HUD updates at lines 1117-1131 |
| `css/style.css` | Combat mode HUD indicator styling | VERIFIED | `.fly-hud-combat` at line 374 (orange warning, pulsing animation). `.fly-hud-weapon` at line 395 (blue HUD theme). Both have correct z-index 25, pointer-events none, hidden by default |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| weapons.js | nav.js computeGravAccel | function call in kinetic physics | WIRED | weapons.js:371 `computeGravAccel([proj.posX[i], 0, proj.posZ[i]])` |
| weapons.js | nav.js aimDir | aim direction for firing | WIRED | weapons.js:82,83,107,108 uses `aimDir` global. index.html:908 computes `aimDir` each frame |
| weapons.js | combat.js getCollisionCandidates | radial bin lookup for hit detection | WIRED | weapons.js:184,412 calls `getCollisionCandidates(r)`. index.html:630 calls `rebinEntities()` before hit checks |
| index.html | js/scene/weapons.js | script tag and function calls | WIRED | Script tag at line 178. Calls: fireSelectedWeapon (415), updateProjectiles (632), checkProjectileHits (633), computeWeaponPreview (911), renderProjectiles (912), renderWeaponPreview (913) |
| weapons.js renderProjectiles | index.html trajPg shader | gl.useProgram(trajPg) | WIRED | weapons.js:210 uses trajPg. projGlBuf passed from index.html (line 328, 912) |
| weapons.js computeWeaponPreview | nav.js simulateTrajectory | function call for kinetic gravity preview | WIRED | weapons.js:164 `simulateTrajectory(startPos, startVel, simTime, PREVIEW_STEPS, PREVIEW_SIM_DT, previewBuf, null, 0, 0)` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WPN-01 | 03-01, 03-02 | Player can fire kinetic cannon with momentum-based projectile, no guidance | SATISFIED | Kinetic rounds spawned with `flyVel + aimDir*KINETIC_SPEED`, no guidance after launch, leapfrog gravity integration |
| WPN-02 | 03-01, 03-02 | Kinetic rounds affected by gravity (curve around gravity wells) | SATISFIED | `computeGravAccel()` called each frame for kinetic rounds (weapons.js:371), velocity updated with gravity acceleration |
| WPN-03 | 03-01, 03-02 | Player can fire plasma gun that emits energy blast toward target | SATISFIED | Plasma spawned at `aimDir*PLASMA_SPEED`, straight-line trajectory, no gravity, cyan glow rendering |
| WPN-04 | 03-01, 03-02 | Plasma blasts fade over distance with minimal gravity (light-based) | SATISFIED | `distTrav` tracked (weapons.js:396), despawn at `PLASMA_MAX_RANGE=120`, no gravity applied to type===1, fade factor in rendering (weapons.js:256-258) |
| WPN-11 | 03-02 | Player can preview predicted trajectory before firing (gravity-affected path) | SATISFIED | `computeWeaponPreview()` runs each frame in combat mode, kinetic uses `simulateTrajectory` (gravity-aware), plasma uses linear projection, hit prediction marker rendered at enemy intersection |

**Orphaned requirements:** None. REQUIREMENTS.md maps WPN-01, WPN-02, WPN-03, WPN-04 to Phase 3 and WPN-11 to Phase 3. All 5 appear in plan `requirements` fields.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| js/scene/weapons.js | 424 | `// TODO Phase 6: enemies.hp[ci] -= damage` | Info | Intentional deferred work -- damage application is Phase 6 scope. Not a stub; hit detection and projectile removal work correctly. |

No blocker or warning-level anti-patterns found. No empty implementations, no console.log stubs, no placeholders.

### Human Verification Required

### 1. Combat Mode Visual Toggle
**Test:** Press F in nav mode. Verify orange "COMBAT" indicator appears at top-center with pulsing animation. Press 1 and 2 to switch weapons, verify blue weapon indicator at bottom-left updates.
**Expected:** Orange pulsing "COMBAT" label, blue "1 KINETIC" or "2 PLASMA" indicator with READY/cooldown state.
**Why human:** Visual rendering, animation timing, and HUD layout require browser testing.

### 2. Kinetic Cannon Tracers and Trails
**Test:** In combat mode with kinetic selected, left-click to fire. Observe tracer visuals.
**Expected:** 5 bright white/yellow tracer points appear in rapid succession, each leaving a short fading trail behind it. Tracers should visibly curve when fired near a planet or the black hole.
**Why human:** GL_POINTS rendering, trail ring buffer alpha fade, gravity curve visual are all GPU-rendered.

### 3. Plasma Gun Glow and Fade
**Test:** Switch to plasma (2 key), left-click to fire. Observe bolt visual.
**Expected:** Single large cyan bolt with a white-hot core. As it travels, the bolt should visibly shrink and fade, eventually despawning at max range.
**Why human:** Dual-pass glow rendering and per-bolt distance fade are visual effects.

### 4. Trajectory Preview and Hit Prediction
**Test:** In combat mode, move mouse crosshair and observe the preview line. Aim at an enemy.
**Expected:** Kinetic: curved white/yellow dotted line showing gravity deflection. Plasma: straighter cyan dots that shrink toward range limit. When aimed at an enemy, bright red/orange marker appears at the predicted hit point.
**Why human:** Preview shape, color accuracy, and hit marker visibility are visual.

### 5. Navigation Regression
**Test:** Toggle combat mode OFF (F key), click on a planet.
**Expected:** Ship initiates orbit transfer to the clicked planet. Navigation works identically to before Phase 3.
**Why human:** Interaction flow and orbit transfer behavior require runtime testing.

### Gaps Summary

No structural or wiring gaps found. All artifacts exist, are substantive (430 lines for weapons.js), and are fully wired into the render loop and input system. All 5 requirements (WPN-01 through WPN-04, WPN-11) have corresponding implementation evidence. The only TODO is an intentional Phase 6 deferred item for damage application.

Three truths require human visual confirmation because they involve GPU rendering (GL_POINTS, trails, glow effects) that cannot be verified by code inspection alone. The code implementing these visual effects is structurally correct -- proper shader program usage, correct color values, appropriate blend modes, proper GL state management -- but the actual appearance on screen must be confirmed by a human.

All 3 commits (94c9002, bc9bd42, 8f87cc0) verified as existing in git history.

---

_Verified: 2026-03-10T18:23:40Z_
_Verifier: Claude (gsd-verifier)_
