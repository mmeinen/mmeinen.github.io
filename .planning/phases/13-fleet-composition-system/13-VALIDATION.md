---
phase: 13
slug: fleet-composition-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based regression tests (tests.html) |
| **Config file** | `tests.html` (regex-based invariant extraction) |
| **Quick run command** | Open `http://localhost:8000/tests.html` in browser |
| **Full suite command** | Same as quick run (all tests run in single page load) |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Visual check in browser (start combat, observe 3+ wave transitions)
- **After every plan wave:** Full visual playthrough to wave 10+ to verify fleet scaling
- **Before `/gsd:verify-work`:** All 4 requirements visually confirmed
- **Max feedback latency:** ~5 seconds (browser reload)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | FLEET-01 | manual-only | Visual: enter combat, observe wave spawns form distinct groups | N/A | ⬜ pending |
| 13-01-02 | 01 | 1 | FLEET-02 | manual-only | Visual: observe fleet at planet -- anchor is largest, screen surrounds it, strikers at wider angles | N/A | ⬜ pending |
| 13-01-03 | 01 | 1 | FLEET-03 | manual-only | Visual: all fleet members cluster near one planet, not scattered across orbits | N/A | ⬜ pending |
| 13-01-04 | 01 | 1 | FLEET-04 | manual-only | Visual: watch for fleet callout text + rotating chevron when wave spawns | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `js/scene/fleets.js` — new file, covers FLEET-01, FLEET-02, FLEET-03
- [ ] `css/style.css` fleet-callout styles — covers FLEET-04
- [ ] `index.html` fleet-callout DOM element and `<script>` tag — covers FLEET-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Max 3 fleets per wave, structured composition | FLEET-01 | No unit test framework (pure browser JS, no npm) | Enter combat, observe wave spawns form distinct groups |
| Role differentiation visible | FLEET-02 | Visual behavior requires human judgment | Observe fleet at planet — anchor largest, screen surrounds, strikers wider |
| Fleet spatial coherence | FLEET-03 | Spatial clustering requires visual verification | All fleet members cluster near one planet, not scattered |
| HUD callout with directional indicator | FLEET-04 | HUD element timing/positioning requires visual check | Watch for fleet callout text + rotating chevron on wave spawn |

---

## Validation Sign-Off

- [ ] All tasks have manual verify instructions
- [ ] Sampling continuity: visual check after every task commit
- [ ] Wave 0 covers all new file creation
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
