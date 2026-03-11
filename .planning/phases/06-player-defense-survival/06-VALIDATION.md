---
phase: 6
slug: player-defense-survival
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based tests.html (regex extraction + invariant checks) |
| **Config file** | tests.html |
| **Quick run command** | Open `http://localhost:8000/tests.html` in browser |
| **Full suite command** | Open `http://localhost:8000/tests.html` + visual gameplay check |
| **Estimated runtime** | ~5 seconds (automated) + manual gameplay verification |

---

## Sampling Rate

- **After every task commit:** Open `http://localhost:8000/tests.html` to verify shader invariants not broken
- **After every plan wave:** Full visual check: enter nav mode, test combat, let shields absorb, take damage, die, check game over, restart
- **Before `/gsd:verify-work`:** All 6 DEF requirements verified via manual gameplay test
- **Max feedback latency:** 5 seconds (automated shader tests)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DEF-01 | manual | Visual: enter nav mode, let enemies fire, observe HP bar decrease | N/A | ⬜ pending |
| 06-01-02 | 01 | 1 | DEF-05 | manual | Visual: observe shield pieces absorb projectiles before HP drops | N/A | ⬜ pending |
| 06-02-01 | 02 | 1 | DEF-02 | manual | Visual: let HP reach 0, observe flicker → breakup → detonation | N/A | ⬜ pending |
| 06-02-02 | 02 | 1 | DEF-03 | manual | Visual: die, observe game over screen with correct stats | N/A | ⬜ pending |
| 06-02-03 | 02 | 1 | DEF-04 | manual | Visual: press R on game over, confirm fresh state | N/A | ⬜ pending |
| 06-03-01 | 03 | 1 | DEF-06 | manual | Visual: zoom in close, observe chevrons at edges pointing to enemies | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. The `tests.html` shader invariant suite verifies any shader-touching changes. All DEF requirements are verified through manual gameplay testing.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HP decreases on enemy hit | DEF-01 | Requires real-time WebGL combat gameplay | Enter nav mode, let Grunts fire, watch HP bar decrease |
| Shield absorbs projectiles | DEF-05 | Physical 3D collision in live scene | Observe shield pieces in front of ship, let enemy fire, see pieces shatter |
| Death sequence plays correctly | DEF-02 | Multi-stage visual animation timing | Let HP reach 0, observe flicker → breakup → volumetric detonation → camera pull-out |
| Game over screen with stats | DEF-03 | DOM overlay with computed stats | Die, verify game over screen shows enemies killed, waves survived, time, accuracy |
| Restart resets all state | DEF-04 | Full gameplay loop verification | Press R on game over, confirm HP full, shields restored, enemies cleared, wave 1 |
| Off-screen indicators point to enemies | DEF-06 | Requires 3D spatial awareness check | Zoom in close, verify red chevrons at screen edges point toward off-screen enemies with distance labels |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
