---
phase: 3
slug: direct-fire-weapons
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based regression tests (tests.html) + manual visual testing |
| **Config file** | tests.html (existing) |
| **Quick run command** | Open `http://localhost:8000/tests.html` in browser |
| **Full suite command** | Open `http://localhost:8000/tests.html` + manual play test |
| **Estimated runtime** | ~5 seconds (automated) + ~2 minutes (manual play test) |

---

## Sampling Rate

- **After every task commit:** Manual smoke test (toggle combat mode, fire both weapons, check preview)
- **After every plan wave:** Full manual test checklist + tests.html green
- **Before `/gsd:verify-work`:** Full suite must be green + all manual verifications passed
- **Max feedback latency:** 5 seconds (tests.html) + 2 minutes (manual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | WPN-01 | manual | Play test: enter combat mode, press 1, left-click to fire kinetic burst | N/A - manual | ⬜ pending |
| 03-01-02 | 01 | 1 | WPN-02 | manual | Play test: fire kinetic near planet/BH, observe curved trajectory | N/A - manual | ⬜ pending |
| 03-01-03 | 01 | 1 | WPN-03 | manual | Play test: press 2, left-click to fire plasma bolt | N/A - manual | ⬜ pending |
| 03-01-04 | 01 | 1 | WPN-04 | manual | Play test: fire plasma, observe size/alpha decrease over distance | N/A - manual | ⬜ pending |
| 03-02-01 | 02 | 1 | WPN-11 | manual | Play test: enter combat mode, move mouse, observe preview dots following crosshair | N/A - manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `js/scene/weapons.js` — new module for projectile SoA store, weapon state, firing logic
- [ ] Combat mode input handlers in index.html
- [ ] Projectile render calls in index.html render loop
- [ ] Combat mode HUD elements in index.html HTML and css/style.css

*Existing infrastructure (tests.html) covers shader invariant verification. No new test framework needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Kinetic rounds fire and travel with momentum | WPN-01 | Visual/interactive — requires real-time WebGL rendering | Enter combat mode (F), select kinetic (1), left-click to fire. Verify 5-round burst fires, rounds travel forward. |
| Kinetic rounds curve around gravity wells | WPN-02 | Physics visual — requires seeing trajectory curvature | Fire kinetic rounds near a planet or black hole. Verify rounds visibly curve toward gravity source. |
| Plasma gun fires energy blast | WPN-03 | Visual — requires seeing bolt appearance | Select plasma (2), left-click to fire. Verify large cyan bolt appears and travels toward crosshair. |
| Plasma fades over distance | WPN-04 | Visual — requires observing fade effect | Fire plasma and watch bolt travel. Verify size shrinks and alpha fades beyond ~80 units. |
| Trajectory preview follows crosshair | WPN-11 | Interactive — requires mouse movement in combat mode | Enter combat mode, move mouse. Verify dotted preview line updates in real-time. Switch weapons and verify preview style changes (curved kinetic vs straight plasma). |
| Hit detection registers on enemies | WPN-01, WPN-03 | Requires enemy presence + visual hit feedback | Fire both weapon types at enemies. Verify hits register (projectile removed on contact). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (automated) + 2 min (manual)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
