---
phase: 10
slug: scale-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based regression (tests.html) |
| **Config file** | tests.html (inline, no config file) |
| **Quick run command** | `Open http://localhost:8000/tests.html in browser` |
| **Full suite command** | `Open http://localhost:8000/tests.html + visual check of index.html` |
| **Estimated runtime** | ~5 seconds (browser page load + test execution) |

---

## Sampling Rate

- **After every task commit:** Open tests.html in browser — all tests must pass
- **After every plan wave:** Full test suite + visual check of normal mode + visual check of nav mode combat
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | SCALE-01 | unit | tests.html validates planetData sizes via BODY_SCALE | Extend tests.html | ⬜ pending |
| 10-01-02 | 01 | 1 | SCALE-02 | unit | tests.html validates Jupiter oR * ORBIT_SCALE ~= 50,000 | Extend tests.html | ⬜ pending |
| 10-01-03 | 01 | 1 | SCALE-03 | unit | tests.html checks scale.js archetype constants | Extend tests.html | ⬜ pending |
| 10-01-04 | 01 | 1 | TIME-02 | unit | tests.html validates BH_GM_KM derivation from Kepler | Extend tests.html | ⬜ pending |
| 10-01-05 | 01 | 1 | SCALE-07 | unit | tests.html checks BIN_WIDTH and NUM_BINS in combat.js | Extend tests.html | ⬜ pending |
| 10-02-01 | 02 | 1 | SCALE-04 | manual-only | Visual: stationary enemies at Neptune should not jitter | N/A | ⬜ pending |
| 10-02-02 | 02 | 1 | SCALE-05 | manual-only | Visual: planets at different orbits no Z-flicker | N/A | ⬜ pending |
| 10-02-03 | 02 | 1 | SCALE-06 | automated | Existing tests.html shader invariant suite must pass | ✅ exists | ⬜ pending |
| 10-03-01 | 03 | 2 | TIME-01 | manual-only | Enter nav mode, time Jupiter orbit ~60s | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests.html` — extend with scale.js constant validation tests (SCALE-01, SCALE-02, SCALE-03)
- [ ] `tests.html` — extend with BH_GM_KM Kepler derivation check (TIME-02)
- [ ] `tests.html` — extend with collision bin constant check (SCALE-07)
- [ ] `js/scene/scale.js` — new file, must be created before all other modifications

*Wave 0 creates the test harness and foundational module before implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CRR prevents jitter at all radii | SCALE-04 | Requires visual inspection of sub-pixel rendering | Enter nav mode, navigate to Neptune orbit, observe stationary enemies — no jitter should be visible |
| Log depth prevents Z-fighting | SCALE-05 | Requires visual inspection of depth ordering | Enter nav mode, observe planets at different orbits — no flickering/fighting |
| Jupiter orbits in ~60 seconds | TIME-01 | Requires timing observation in real-time | Enter nav mode, mark Jupiter position, time one full orbit — should be ~60s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
