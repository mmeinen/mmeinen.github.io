---
phase: 9
slug: tactical-targeting-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based visual testing (tests.html + manual gameplay) |
| **Config file** | tests.html |
| **Quick run command** | `Open http://localhost:8000/tests.html` |
| **Full suite command** | `Open http://localhost:8000 — visual gameplay check` |
| **Estimated runtime** | ~30 seconds (manual visual verification) |

---

## Sampling Rate

- **After every task commit:** Visual inspection in browser (toggle tactical mode, verify markers)
- **After every plan wave:** Full gameplay test (enter nav, reach combat, toggle tactical, assign/fire)
- **Before `/gsd:verify-work`:** All 3 HUD requirements verified via gameplay test
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | HUD-04 | manual | Visual: press T in combat, verify markers on all enemies | N/A manual | ⬜ pending |
| 09-01-02 | 01 | 1 | HUD-04 | manual | Visual: verify range rings visible in tactical mode | N/A manual | ⬜ pending |
| 09-02-01 | 02 | 1 | HUD-05 | manual | Visual: click targets, verify selection ring + weapon badge | N/A manual | ⬜ pending |
| 09-02-02 | 02 | 1 | HUD-05 | manual | Visual: shift+click for multi-select, click to deselect | N/A manual | ⬜ pending |
| 09-02-03 | 02 | 1 | HUD-06 | manual | Visual: assign targets, right-click fire, verify coordinated salvo | N/A manual | ⬜ pending |
| 09-02-04 | 02 | 1 | HUD-06 | manual | Visual: verify cooldown badges + staggered fire on cooldown targets | N/A manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or test files needed — this phase is purely visual UI testing.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tactical overlay shows all enemy markers with type + distance | HUD-04 | DOM overlay on WebGL canvas — requires visual inspection | 1. Enter nav mode, fly to combat 2. Press T 3. Verify all enemies have [X] Nnu markers |
| Target selection via click/shift+click | HUD-05 | Mouse interaction with DOM elements over canvas | 1. In tactical mode, click enemy marker 2. Verify bright selection ring appears 3. Shift+click another → both selected 4. Click selected → deselects |
| Weapon assignment badges on targets | HUD-05 | Visual weapon badge rendering | 1. Select weapon via 1-4 keys 2. Click target 3. Verify weapon abbreviation badge (KIN/PLS/MSL/NUK) appears |
| Coordinated salvo fire | HUD-06 | Projectile trajectories and impact require visual check | 1. Assign KIN to targets A,B 2. Assign MSL to target C 3. Right-click 4. Verify kinetic bursts fire at A,B and missile fires at C |
| Cooldown staggering display | HUD-06 | Timer UI requires visual verification | 1. Fire kinetic burst 2. Assign new target with KIN 3. Verify dimmed badge shows remaining cooldown |

---

## Validation Sign-Off

- [ ] All tasks have manual verification instructions
- [ ] Sampling continuity: visual check after every task commit
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
