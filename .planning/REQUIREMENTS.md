# Requirements: Navigation Combat System

**Defined:** 2026-03-15
**Core Value:** Tactical orbital combat that feels physically grounded — ship movement follows real transfer orbits, weapons obey momentum and fuel constraints, and the black hole's gravity shapes every engagement.

## v1.1 Requirements

Requirements for the Realistic Scale & Fleet Combat milestone. Each maps to roadmap phases.

### Scale

- [x] **SCALE-01**: Scene uses km-based coordinate system with black hole diameter 20,000 km, Jupiter diameter 4,000 km, and other planets scaled proportionally
- [x] **SCALE-02**: Planet orbits are approximately 50,000 km apart
- [x] **SCALE-03**: Player ship is 10 km long, Capital enemies 8 km, Grunts 500 m, other archetypes scaled proportionally
- [x] **SCALE-04**: Camera-relative rendering (CRR) prevents float32 precision jitter at all orbital radii
- [x] **SCALE-05**: Logarithmic depth buffer prevents Z-fighting across the km-scale scene
- [x] **SCALE-06**: Normal (non-nav) mode rendering is completely unaffected by km-scale changes
- [x] **SCALE-07**: Collision detection bins recalibrated for km-scale distances

### Time

- [x] **TIME-01**: Ships orbit Jupiter in approximately 60 seconds at normal speed
- [x] **TIME-02**: All orbital velocities and gravitational constants derived from the Jupiter 60s anchor

### Fleet

- [ ] **FLEET-01**: Enemies spawn as structured fleets with max 3 fleets per wave
- [ ] **FLEET-02**: Fleet compositions have defined roles (anchor, screen, striker) with named templates that scale with difficulty
- [ ] **FLEET-03**: Fleet members orbit near a shared anchor body within ±15% of anchor radius
- [ ] **FLEET-04**: Fleet spawn announced in HUD with 3-second callout and directional indicator

### Radar

- [ ] **RADAR-01**: Always-on radar mini-map in bottom-left corner showing player (blue dot), planets (colored dots), and enemy fleets (red icons)
- [ ] **RADAR-02**: Radar expands to side panel (left half of screen) when O key is pressed
- [ ] **RADAR-03**: In expanded radar, player can select orbit destinations (planets, Lagrange points) and ship transfers orbit as usual
- [ ] **RADAR-04**: Radar shows live orbit paths and Lagrange point positions
- [ ] **RADAR-05**: All orbit visuals (trajectory lines, orbit rings, Lagrange markers) confined to radar only — removed from main 3D viewport

### Viewport

- [x] **VIEW-01**: Player is always in combat mode — no separate nav/combat mode toggle
- [x] **VIEW-02**: Main 3D viewport is pure combat with no navigation overlays
- [x] **VIEW-03**: Orbital height displayed in HUD with up/down controls for altitude adjustment

### Warp

- [ ] **WARP-01**: Spacebar toggles warp speed with universal time acceleration (everything speeds up equally)
- [ ] **WARP-02**: Orbital transfers take no more than 30 real seconds during warp
- [ ] **WARP-03**: Warp automatically disabled when enemies are in proximity
- [ ] **WARP-04**: Warp HUD indicator shows active warp state with visual feedback
- [ ] **WARP-05**: Projectile physics suspended during warp to prevent tunneling

### Collision

- [ ] **COLL-01**: Any entity (enemy, projectile) that contacts a planet surface or black hole event horizon is destroyed
- [ ] **COLL-02**: Player ship orbital mechanics prevent collision courses with planets and black hole — player can never hit a body
- [ ] **COLL-03**: World boundary at 1.2x outermost orbit prevents entities from drifting beyond the play area
- [ ] **COLL-04**: Enemy collision with a body counts as a kill toward wave counter

### Rendering

- [x] **REND-01**: Black hole dominates the viewport with rendering tuned for close-up detail
- [ ] **REND-02**: Far planets rendered as 2D billboards when beyond a distance threshold
- [ ] **REND-03**: Planets transition to 3D rendering as player approaches
- [x] **REND-04**: Enemy LOD thresholds recalibrated for km-scale distances

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Radar Enhancements

- **RADAR-06**: Fleet health arcs on radar icons showing aggregate fleet HP
- **RADAR-07**: Fleet labels in expanded radar panel

### Visual Polish

- **WARP-06**: Warp star-streak post-process visual effect (radial UV stretch on background)
- **VFX-04**: Screen shake when player takes damage
- **VFX-05**: Detailed death stats screen (kill breakdown by weapon)

### Weapon Balance

- **WPN-12**: Cooldown timers for kinetic cannon and plasma gun
- **WPN-13**: Ammo count for regular missiles (limited supply per wave)
- **WPN-14**: Nuclear missiles gated by wave count

### Fleet Enhancements

- **FLEET-05**: Additional fleet templates (carrier group, ambush wing, siege flotilla)
- **FLEET-06**: Fleet retreat behavior when anchor is destroyed

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-level time warp (1x, 2x, 5x, 10x, 30x) | Single toggle (x30) is sufficient at 60s Jupiter period; multi-level adds UI buttons and wrong-level frustration |
| Radar zoom control | Play area already fits in radar at fixed scale; zoom reduces tactical value |
| 3D radar | Orbits are coplanar; 2D top-down is a perfect projection with zero information loss |
| Fleet AI formation flying | Dynamic formation maintenance is expensive and unreadable at radar scale; loose proximity coherence achieves the same perceived result |
| Energy shields / force fields | Shields are kinetic (physical objects), not energy barriers |
| Free flight (WASD anywhere) | Movement is orbital transfer-based, not free flight |
| Multiplayer | Single player only |
| Story/campaign mode | Endless wave survival with boss milestones |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCALE-01 | Phase 10 | Complete |
| SCALE-02 | Phase 10 | Complete |
| SCALE-03 | Phase 10 | Complete |
| SCALE-04 | Phase 10 | Complete |
| SCALE-05 | Phase 10 | Complete |
| SCALE-06 | Phase 10 | Complete |
| SCALE-07 | Phase 10 | Complete |
| TIME-01 | Phase 10 | Complete |
| TIME-02 | Phase 10 | Complete |
| FLEET-01 | Phase 13 | Pending |
| FLEET-02 | Phase 13 | Pending |
| FLEET-03 | Phase 13 | Pending |
| FLEET-04 | Phase 13 | Pending |
| RADAR-01 | Phase 15 | Pending |
| RADAR-02 | Phase 15 | Pending |
| RADAR-03 | Phase 15 | Pending |
| RADAR-04 | Phase 15 | Pending |
| RADAR-05 | Phase 15 | Pending |
| VIEW-01 | Phase 11 | Complete |
| VIEW-02 | Phase 11 | Complete |
| VIEW-03 | Phase 11 | Complete |
| WARP-01 | Phase 14 | Pending |
| WARP-02 | Phase 14 | Pending |
| WARP-03 | Phase 14 | Pending |
| WARP-04 | Phase 14 | Pending |
| WARP-05 | Phase 14 | Pending |
| COLL-01 | Phase 12 | Pending |
| COLL-02 | Phase 12 | Pending |
| COLL-03 | Phase 12 | Pending |
| COLL-04 | Phase 12 | Pending |
| REND-01 | Phase 11 | Complete |
| REND-02 | Phase 16 | Pending |
| REND-03 | Phase 16 | Pending |
| REND-04 | Phase 11 | Complete |

**Coverage:**
- v1.1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after roadmap creation*
