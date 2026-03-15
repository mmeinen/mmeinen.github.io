---
phase: 1
slug: combat-rendering-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based regression tests (tests.html) |
| **Config file** | tests.html (existing) |
| **Quick run command** | Open `http://localhost:8000/tests.html` in browser |
| **Full suite command** | Same (all tests run on page load) |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Open `tests.html` — all existing + new tests green
- **After every plan wave:** `tests.html` + visual check of enemies in nav mode
- **Before `/gsd:verify-work`:** Full suite must be green + FPS check with 50 enemies
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PRF-02 | unit | Regex: fsSource must not contain enemy uniforms | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | PRF-03 | unit | Regex: `getExtension('ANGLE_instanced_arrays')` + `drawElementsInstancedANGLE` in index.html | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | ENM-11 | unit | Regex: enemyVS/enemyFS defined, `createGruntGeometry` exists | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | PRF-04 | unit | JS sandbox: 50 entities binned, candidates returned without pairwise | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | PRF-01 | manual-only | Visual: enter nav mode, verify FPS counter shows 30+ with 50 enemies | N/A | ⬜ pending |
| 01-03-02 | 03 | 2 | PRF-02 | unit | Regex: no enemy code inside ray march fsSource | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests.html` — Add test: verify ANGLE_instanced_arrays usage (regex for extension + instanced draw calls)
- [ ] `tests.html` — Add test: verify enemyPg shader exists separate from pg/shipPg
- [ ] `tests.html` — Add test: verify no enemy-related code inside fsSource (ray march unchanged)
- [ ] `tests.html` — Add test: verify createGruntGeometry returns valid {positions, normals, indices}
- [ ] `tests.html` — Add test: verify radial bin structure produces collision candidates

*Existing test infrastructure (tests.html) covers all framework needs. No new framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 50 enemies render at 30fps+ | PRF-01 | Performance requires real GPU rendering | Open index.html, enter nav mode, spawn 50 enemies, verify FPS counter ≥30 |
| Existing black hole scene unchanged | Success Criteria 5 | Visual regression check | Compare scene with/without combat code loaded, verify identical appearance |
| Enemy ships display angular procedural geometry | ENM-11 | Visual quality assessment | Enter nav mode, zoom to enemy, verify wedge/angular shape language |
| Enemies occluded by planets and accretion disk | Context decision | Depth test visual check | Fly behind a planet, verify enemies behind it are not visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
