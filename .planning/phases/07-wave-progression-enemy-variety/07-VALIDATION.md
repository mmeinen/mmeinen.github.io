---
phase: 7
slug: wave-progression-enemy-variety
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Browser-based tests.html (regex extraction + visual checks) |
| **Config file** | None (tests.html is self-contained) |
| **Quick run command** | Open `http://localhost:8000/tests.html` in browser |
| **Full suite command** | Open tests.html + visual check of combat gameplay |
| **Estimated runtime** | ~30 seconds (manual visual) |

---

## Sampling Rate

- **After every task commit:** Visual gameplay check — enter nav mode, verify new archetype appears/behaves correctly
- **After every plan wave:** Full gameplay session from wave 1 through newest archetype's introduction wave
- **Before `/gsd:verify-work`:** Complete playthrough to wave 10+ confirming all archetypes, boss encounter, and scaling
- **Max feedback latency:** ~60 seconds (manual visual verification)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-xx | 01 | 1 | ENM-07 | manual-only | Visual: kill all enemies, observe breather + "WAVE X" text + next spawn | N/A | ⬜ pending |
| 07-02-xx | 02 | 1 | ENM-02 | manual-only | Visual: survive to wave 3, observe swarm converging rush | N/A | ⬜ pending |
| 07-02-xx | 02 | 1 | ENM-03 | manual-only | Visual: survive to wave 5, observe bomber missile salvos | N/A | ⬜ pending |
| 07-02-xx | 02 | 1 | ENM-04 | manual-only | Visual: survive to wave 8, observe sniper long-range burst fire | N/A | ⬜ pending |
| 07-02-xx | 02 | 1 | ENM-05 | manual-only | Visual: survive to wave 10, observe Capital + minion spawning | N/A | ⬜ pending |
| 07-03-xx | 03 | 2 | ENM-08 | manual-only | Visual: reach wave 10, observe boss encounter composition | N/A | ⬜ pending |
| 07-03-xx | 03 | 2 | ENM-09 | manual-only | Visual: compare wave 1 vs wave 15 for difficulty scaling | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `js/scene/waves.js` — new module, wave state machine + spawner + difficulty scaling
- [ ] Wave skip cheat code for testing (e.g., type specific digit sequence to jump to wave N)
- [ ] Visual verification of 4 new geometry shapes (each archetype must look distinct)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Swarm converging rush | ENM-02 | WebGL gameplay, no headless harness | Enter nav, survive to wave 3, observe 5-8 swarm enemies converging from different angles |
| Bomber missile salvos | ENM-03 | WebGL gameplay, no headless harness | Survive to wave 5, observe bomber approach + guided missile fire |
| Sniper burst fire | ENM-04 | WebGL gameplay, no headless harness | Survive to wave 8, observe long-range 3-round bursts |
| Capital minion spawning | ENM-05 | WebGL gameplay, no headless harness | Survive to wave 10, observe Capital ship + periodic Grunt spawning |
| Kill-triggered wave progression | ENM-07 | WebGL gameplay, no headless harness | Kill all enemies, observe 3-5s breather + "WAVE X" text + next spawn |
| Boss wave encounters | ENM-08 | WebGL gameplay, no headless harness | Reach wave 10, verify Capital ship boss + composition |
| Difficulty scaling | ENM-09 | WebGL gameplay, no headless harness | Compare wave 1 (all Grunts) vs wave 15 (mixed archetypes, harder stats) |

*Note: All tests are manual-only because the game runs in a browser WebGL context with no headless test harness. The `999` cheat code spawns enemies for quick testing. A wave-skip cheat should be added in Wave 0 for targeted validation.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
