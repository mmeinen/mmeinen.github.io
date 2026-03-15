---
phase: 4
slug: missile-systems-explosions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based visual + shader invariant tests (tests.html) |
| **Config file** | tests.html (regex extraction of shader constants) |
| **Quick run command** | Open `http://localhost:8000/tests.html` in browser |
| **Full suite command** | Open tests.html + visual check of index.html in browser |
| **Estimated runtime** | ~10 seconds (manual visual check) |

---

## Sampling Rate

- **After every task commit:** Visual check in browser (missiles fire, track, explode correctly)
- **After every plan wave:** Full visual test + tests.html shader invariants
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-xx | 01 | 1 | WPN-05 | manual-only | Visual: fire missiles at orbiting enemy, verify curved PN tracking | N/A | ⬜ pending |
| 04-01-xx | 01 | 1 | WPN-07 | manual-only | Visual: long-range missile trail dims/sputters, engine cuts out | N/A | ⬜ pending |
| 04-01-xx | 01 | 1 | WPN-08 | manual-only | Visual: fuel-depleted missile far from target fizzles silently | N/A | ⬜ pending |
| 04-02-xx | 02 | 1 | WPN-09 | manual-only | Visual: explosions are flat quads facing camera | N/A | ⬜ pending |
| 04-02-xx | 02 | 1 | VFX-03 | manual-only | Visual: orbit around explosion, verify it always faces camera | N/A | ⬜ pending |
| 04-02-xx | 02 | 1 | WPN-06 | manual-only | Visual: missile detonates near target, sprite explosion appears | N/A | ⬜ pending |
| 04-03-xx | 03 | 2 | WPN-10 | manual-only | Visual: nuke produces expanding fireball/debris using existing shader | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `js/scene/explosions.js` — new file, covers WPN-09 and VFX-03
- [ ] Billboard shader strings in `js/scene/shaders.js` — new shader program
- [ ] Procedural sprite sheet texture generation — new at-init code

*These must be created before tasks referencing them can be verified.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Missiles guide toward locked enemy using PN | WPN-05 | Visual trajectory validation only | Fire missiles at orbiting enemy, verify curved tracking path |
| Proximity detonation near target | WPN-06 | Visual timing check | Missile detonates before hitting enemy, sprite explosion appears |
| Fuel depletes during flight | WPN-07 | Visual trail/engine observation | Long-range missile trail dims/sputters, engine cuts out |
| Self-destruct on fuel exhaustion (miss) | WPN-08 | Visual behavior observation | Fuel-depleted missile far from target fizzles silently (no explosion) |
| Sprite billboard explosions | WPN-09 | Visual rendering quality | Explosions are flat quads facing camera, not volumetric |
| Nuclear volumetric detonation | WPN-10 | Visual volumetric effect | Nuke produces expanding fireball/debris using existing shader |
| Billboard rendering at various distances/angles | VFX-03 | Visual orientation check | Orbit around explosion, verify it always faces camera |

---

## Validation Sign-Off

- [ ] All tasks have manual verify instructions
- [ ] Sampling continuity: visual check per task commit
- [ ] Wave 0 covers all new file references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
