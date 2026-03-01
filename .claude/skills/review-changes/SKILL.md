---
description: "Review the current git changeset against project conventions and shader invariants"
context: fork
user-invocable: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Review Changes

Review the current changeset for this static GitHub Pages site. Focus on correctness, shader invariant safety, and convention consistency.

## Steps

1. Run `git diff` and `git diff --cached` to see all changes.
2. Read each modified file in full for context.
3. Check against the criteria below.
4. Report findings organized by severity.

## Criteria

### Shader Invariants (if index.html changed)
Extract current values and verify:
- Early escape threshold > max(planet oR + radius) for all planets
- Planet check range LOW < min(planet oR - radius) and HIGH > max(planet oR + radius)
- Step cap < min(planet radius) × 4
- Iteration budget > 2 × default camDist
- If `planetData` changed, verify shader uniforms and HTML labels match

### Convention Checks
- Blue HUD color: `rgba(60,140,255,*)`
- Z-index layers: canvas=1, HUD=10, labels=25
- Game pages are self-contained with back links to `index.html`
- No external dependencies or CDN imports added
- No build tools or npm introduced

### General Quality
- No obvious bugs or regressions
- Error handling for any async code
- No hardcoded secrets or credentials

## Output Format

### Critical (must fix before committing)
Issues that will cause visual bugs, broken navigation, or shader rendering failures.

### Warning (should fix)
Convention violations, maintainability concerns.

### Suggestion (consider)
Improvements to clarity or simplicity.

If no issues found, confirm the changeset looks clean.
