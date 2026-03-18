---
phase: 11
slug: simulation-rescaling-viewport-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based (tests.html) + manual verification |
| **Config file** | tests.html |
| **Quick run command** | `open tests.html in browser` |
| **Full suite command** | `open tests.html in browser — all tests green` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `open tests.html in browser`
- **After every plan wave:** Run full suite — all tests green
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | VIEW-01 | manual | visual check — no nav overlays | N/A | ⬜ pending |
| 11-01-02 | 01 | 1 | VIEW-02 | manual | visual check — combat-only viewport | N/A | ⬜ pending |
| 11-02-01 | 02 | 1 | VIEW-03 | manual | verify altitude HUD shows km | N/A | ⬜ pending |
| 11-03-01 | 03 | 2 | REND-01 | manual | visual check — BH close-up detail | N/A | ⬜ pending |
| 11-04-01 | 04 | 2 | REND-04 | manual | visual check — LOD transitions smooth | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No nav overlays in viewport | VIEW-01, VIEW-02 | Visual rendering check | Load game, verify no orbit rings/trajectory lines/L-point markers visible |
| Altitude display in km | VIEW-03 | HUD text formatting | Check altitude readout shows value with "km" suffix |
| BH close-up rendering | REND-01 | Visual quality assessment | Fly near black hole, verify increased detail/glow |
| LOD transitions | REND-04 | Visual smoothness check | Observe enemies at varying distances, verify no popping |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
