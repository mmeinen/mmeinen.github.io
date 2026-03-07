---
description: "Review the current git changeset — dispatches to specialized agents based on which files changed"
context: fork
user-invocable: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Review Changes (Dispatcher)

You are a changeset review dispatcher. Your job is to identify what changed and recommend (or run) the appropriate specialized agents.

## Steps

1. Run `git diff --name-only` and `git diff --cached --name-only` to list changed files.
2. Categorize each changed file into a domain.
3. Run the `code-reviewer` agent for convention checks on all changes.
4. Based on the file categories, list which specialized agents should be run.

## File-to-Agent Routing

| Changed File Pattern | Agent(s) to Run |
|---------------------|-----------------|
| `index.html` (shader code) | `planet-shader-reviewer`, `blackhole-shader-reviewer` |
| `index.html` (JS/navigation) | `navigation-reviewer` |
| `index.html` (performance) | `webgl-optimizer` |
| `index.html` (volumetric/cloud/particle fx) | `volumetric-fx` |
| `js/scene.wat`, `js/pong.wat` | `wat-reviewer` |
| `minesweeper.html`, `js/game.js`, `js/board.js`, `js/tile.js`, `js/bomb.js`, `js/Renderer.js` | `minesweeper-reviewer` |
| `pong.html`, `js/pong.js` | `pong-reviewer` |
| `freecell/**` | `freecell-reviewer` |
| `edmund_game/**` | `nugget-invasion-reviewer` |
| `beatrix_game/**` | `axolotl-reviewer` |
| `fps/**` | `travellers-reviewer` |
| `cat_invasion/**` | `cat-invasion-reviewer` |
| `css/style.css` | `code-reviewer` (convention check) |
| `tests.html` | `planet-shader-reviewer` (invariant alignment) |

## Quick Convention Check

Before dispatching, do a fast scan for:
- Any external dependencies or CDN imports added
- Any build tools or npm introduced
- Any missing back links on game pages
- Any z-index layer violations

## Output

### Changed Files
List all changed files.

### Convention Issues
Any project-wide issues found in the quick scan.

### Recommended Agents
List each specialized agent that should be run, with the specific files it should review.
