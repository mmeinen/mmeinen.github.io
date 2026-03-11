---
phase: 5
slug: enemy-behavior-combat-feedback
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based regression tests (tests.html) + visual inspection |
| **Config file** | tests.html |
| **Quick run command** | Open `http://localhost:8000/tests.html` in browser |
| **Full suite command** | Same + manual visual test in nav mode |
| **Estimated runtime** | ~5 seconds (tests.html) + ~60 seconds (visual inspection) |

---

## Sampling Rate

- **After every task commit:** Visual inspection in browser (nav mode, approach enemies, fire weapons, observe feedback) + `tests.html` for shader invariant regression
- **After every plan wave:** Full visual test of all behaviors + tests.html green
- **Before `/gsd:verify-work`:** All 5 behaviors visually confirmed + tests.html green
- **Max feedback latency:** ~5 seconds (tests.html auto-runs)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-XX | 01 | 1 | ENM-01, ENM-06 | manual | Visual: enemies station-keep near planets, detect player, fire | N/A | ⬜ pending |
| 05-01-XX | 01 | 1 | ENM-10 | manual | Visual: observe enemy shots with spread near player | N/A | ⬜ pending |
| 05-02-XX | 02 | 1 | VFX-01 | manual | Visual: fire at enemy, observe white flash | N/A | ⬜ pending |
| 05-02-XX | 02 | 1 | VFX-02 | manual | Visual: fire at enemy, observe red spark burst | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: Task IDs are placeholders — will be filled after plans are created.*

---

## Wave 0 Requirements

- [ ] `js/scene/particles.js` — new file for impact particle system (SoA store + rendering)
- [ ] Enemy AI state arrays added to `combat.js` — extend existing SoA store
- [ ] Instance buffer stride change (9→10) — atomic change across combat.js, shaders.js, index.html
- [ ] Enemy shader modification — add a_instFlash attribute and white-mix logic

*All are implementation tasks, not test infrastructure gaps. No automated test framework changes needed — existing tests.html covers shader invariant regression.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grunt enemies fire at player in range | ENM-01 | Visual/gameplay behavior — requires player interaction | Enter nav mode, approach enemies near a planet, observe them detecting and firing |
| Enemies orbit bodies using orbital mechanics | ENM-06 | Visual — orbital motion requires observation over time | Observe idle enemies co-rotating with assigned planets; trigger transfer, observe curved approach |
| Enemies fire with tunable accuracy | ENM-10 | Visual — noise distribution requires observing multiple shots | Approach enemies multiple times, observe shots landing near player with visible spread |
| Hit flash on enemy when projectile connects | VFX-01 | Visual — brief flash effect requires real-time observation | Fire kinetic/plasma at enemy, observe ~0.2s white flash on hit |
| Impact particles at hit location | VFX-02 | Visual — particle burst is transient | Fire at enemy, observe red spark burst (5-8 particles) spraying outward from impact |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
