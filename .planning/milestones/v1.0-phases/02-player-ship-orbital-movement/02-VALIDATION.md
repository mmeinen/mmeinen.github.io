---
phase: 2
slug: player-ship-orbital-movement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based visual testing (tests.html pattern) |
| **Config file** | tests.html (existing) |
| **Quick run command** | Open tests.html in browser, verify all green |
| **Full suite command** | Open tests.html + visual checks of nav mode |
| **Estimated runtime** | ~10 seconds (manual visual checks) |

---

## Sampling Rate

- **After every task commit:** Visual inspection of nav mode behavior
- **After every plan wave:** Full visual test of all MOV requirements
- **Before `/gsd:verify-work`:** All 6 MOV requirements demonstrable in browser
- **Max feedback latency:** ~10 seconds (browser refresh)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | MOV-01 | manual | Visual: enter nav mode, click planet, verify orbit ring appears | N/A | ⬜ pending |
| 02-02-01 | 02 | 1 | MOV-02 | manual | Visual: select target, verify trajectory line, verify arrival | N/A | ⬜ pending |
| 02-02-02 | 02 | 1 | MOV-03 | manual | Visual: initiate transfer, verify dotted line renders | N/A | ⬜ pending |
| 02-03-01 | 03 | 1 | MOV-04 | manual | Visual: adjust thrust slider during transfer, verify speed change | N/A | ⬜ pending |
| 02-03-02 | 03 | 2 | MOV-05 | manual | Visual: orbit body, press up/down arrows, verify altitude readout changes | N/A | ⬜ pending |
| 02-03-03 | 03 | 2 | MOV-06 | manual | Visual: press L to toggle, click L-point marker, verify orbit | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Consider adding console assertions for SOI calculations and delta-v computations
- [ ] Existing tests.html only covers shader invariants, not nav mode logic

*No automated test framework needed — all phase behaviors are visual/interactive and validated via browser testing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Click body to select orbit target | MOV-01 | Interactive 3D click detection requires visual browser testing | Enter nav mode, click any planet, verify orbit ring highlight appears |
| Transfer orbit flight | MOV-02 | Orbital trajectory requires visual verification of physical accuracy | Select target, verify ship flies curved path, arrives at target body |
| Trajectory line rendering | MOV-03 | Visual rendering output can only be checked visually | Initiate transfer, verify dotted/curved line visible from ship to target |
| Thrust control | MOV-04 | Interactive slider behavior requires manual testing | During transfer, adjust thrust, verify ship speed changes |
| Altitude adjustment | MOV-05 | Continuous key-hold behavior requires manual testing | In orbit, hold up/down arrows, verify altitude readout changes smoothly |
| Lagrange point orbiting | MOV-06 | L-point marker visibility and click targeting require visual check | Press L key, verify markers appear, click one, verify ship transfers and orbits |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
