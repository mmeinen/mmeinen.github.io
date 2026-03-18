---
phase: 12
slug: body-collision-world-boundary
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based regression tests (tests.html) + manual visual checks |
| **Config file** | tests.html |
| **Quick run command** | `Open http://localhost:8000/tests.html in browser` |
| **Full suite command** | `Open http://localhost:8000/tests.html + visual check in nav mode` |
| **Estimated runtime** | ~10 seconds (page load + visual scan) |

---

## Sampling Rate

- **After every task commit:** Open tests.html to verify no shader invariant regressions
- **After every plan wave:** Full visual test — enter nav mode, observe body collisions, verify wave progression
- **Before `/gsd:verify-work`:** Full suite must be green + all 4 COLL requirements verified visually
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | COLL-01 | manual | Visual: enemies destroyed on planet/BH contact | N/A | ⬜ pending |
| 12-01-02 | 01 | 1 | COLL-04 | manual | Visual: wave counter increments on body-collision kills | N/A | ⬜ pending |
| 12-02-01 | 02 | 1 | COLL-02 | manual | Visual: attempt orbit into planet surface, observe redirect | N/A | ⬜ pending |
| 12-02-02 | 02 | 1 | COLL-02 | manual | Visual: attempt free-flight into BH, observe redirect | N/A | ⬜ pending |
| 12-03-01 | 03 | 1 | COLL-03 | manual | Visual: fly to outermost orbit, observe boundary clamp | N/A | ⬜ pending |
| 12-03-02 | 03 | 1 | COLL-03 | manual | Visual: enemies beyond boundary despawn | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or stubs needed.

- tests.html already validates shader invariants
- All COLL requirements are verified through visual/manual checks of runtime behavior

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Enemies destroyed on planet contact | COLL-01 | Runtime 2D physics behavior, not static invariant | Enter nav mode, spawn enemies near planet, observe destruction + explosion |
| Player cannot collide with bodies | COLL-02 | Orbital mechanics behavior, requires interactive testing | Lower orbit toward planet surface, attempt free-flight into BH, verify redirect |
| World boundary clamp | COLL-03 | Requires player to reach boundary edge | Transfer to outermost orbit, fly outward, verify position clamp |
| Body collision kill credit | COLL-04 | Wave counter progression, requires enemy interaction | Lure enemies into planet, observe wave counter increment |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
