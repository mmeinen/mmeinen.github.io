---
phase: 8
slug: combat-hud
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based visual testing (tests.html) + manual visual verification |
| **Config file** | tests.html (shader invariants only -- no HUD tests exist) |
| **Quick run command** | `Open http://localhost:8000 in browser, enter nav mode (click planet), verify bottom bar` |
| **Full suite command** | `Open http://localhost:8000/tests.html -- shader invariants still pass` |
| **Estimated runtime** | ~5 seconds (visual inspection) |

---

## Sampling Rate

- **After every task commit:** Visual inspection of bottom bar in browser
- **After every plan wave:** Full visual walkthrough + `tests.html` shader invariants
- **Before `/gsd:verify-work`:** Full visual walkthrough + tests.html green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-XX | 01 | 1 | HUD-01 | manual-only | Visual: enter nav mode, press 1-4, fire weapons, check cooldown bars | N/A | ⬜ pending |
| 08-01-XX | 01 | 1 | HUD-02 | manual-only | Visual: enter nav mode, kill enemies, verify counter decrements and wave increments | N/A | ⬜ pending |
| 08-01-XX | 01 | 1 | HUD-03 | manual-only | Visual: take damage, verify bar color changes at 50%/25% thresholds | N/A | ⬜ pending |
| 08-01-XX | 01 | 1 | HUD-07 | manual-only | Visual: click planet to orbit, verify body/altitude/state display | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

No test framework needed beyond existing `tests.html` for shader invariants. This phase is DOM/CSS/JS only with manual visual testing.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 4 weapon boxes with selected highlight and cooldown fill | HUD-01 | Visual DOM/CSS rendering, animation timing | Enter nav mode, press 1-4 to switch weapons, fire each, verify cooldown bars animate |
| Wave counter shows wave number and enemy count | HUD-02 | Requires game state progression (killing enemies) | Enter nav mode, kill enemies, verify counter decrements; survive to next wave, verify wave increments |
| HP bar with 3-color threshold | HUD-03 | Visual color transition at damage thresholds | Take damage, verify bar color changes at 50% (yellow) and 25% (red) |
| Orbit info shows body, altitude, state | HUD-07 | Requires orbital navigation interaction | Click planet to orbit, verify displays body name, altitude, and state; initiate transfer, verify shows destination |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
