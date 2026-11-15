'use strict';
// kit.js — PLANET DEFENSE's ships as data: BASTION (the station), its rotating ring and the modules its upgrades bolt on,
// the four defence platforms and their trained parts, the Dominion's LOCUST bomber and MANTIS dropship, the AEGIS field,
// and the Defence Force livery.
//
// Loaded after ../js/scene/shipkit.js (Mesh, MAT, the armour and turret helpers) and BEFORE ../js/scene/ships.js: ships.js
// freezes LIVERIES into its hull shader (u_liv) and SHIP_LIV when it loads, so a livery pushed later would never reach the
// GPU. Same conventions as shipkit.js: metres, +Z bow, +Y dorsal, +X port; faces oriented away from a point inside their
// solid and wound with their normals (the ship pass culls back faces). Every hardpoint the war (war.js) or the renderer
// (view.js) needs lives in SHIP_KIT beside the hull it belongs to.

// ------------------------------------------------------------------------------------------ livery
// The Planetary Defence Force: pale grey plate, gunmetal, amber trim and lamps, blue-white drives, warm windows, lit decks.
// (two entries: LIV_DEF lights window rows where a plated hull allows them -- BASTION's decks; LIV_PLAT never does, so an
// uncrewed platform or a dish does not read as a building)
LIVERIES.push([[0.5, 0.51, 0.53], [0.075, 0.08, 0.09], [0.86, 0.4, 0.05], [0.5, 0.82, 1.9], [1.0, 0.84, 0.6], [1.0, 0.52, 0.12], [1, 0, 0.45], [0.46, 0.2, 0.34]]);
const LIV_DEF = LIVERIES.length - 1;
LIVERIES.push([[0.5, 0.51, 0.53], [0.075, 0.08, 0.09], [0.86, 0.4, 0.05], [0.5, 0.82, 1.9], [1.0, 0.84, 0.6], [1.0, 0.52, 0.12], [0, 0, 0.45], [0.46, 0.2, 0.34]]);
const LIV_PLAT = LIVERIES.length - 1;

// ------------------------------------------------------------------------------------------ helpers
// a turret or launcher mount's frame: the part's +Y is the mount's outward normal (a turret "stands" on its deck)
const MOUNT_Q = {up: [0, 0, 0, 1], down: [0, 0, 1, 0], port: [0, 0, -Math.SQRT1_2, Math.SQRT1_2], stbd: [0, 0, Math.SQRT1_2, Math.SQRT1_2]};
// a chamfered, bevelled deck ring for a turret: barbette cylinder and a trim lip, standing on y0 up to y1 (along +Y)
function barbette(m, x, z, y0, y1, r, seg = 16){
  m.cyl([x, y0, z], [x, y1, z], r*1.06, r, seg, MAT.DARK, 0.8, 0, true);
  m.cyl([x, y1 - 0.12*r, z], [x, y1, z], r*1.1, r*1.1, seg, MAT.TRIM, 1, 0, false);
}
// the same in any mount frame: build `fn` in a frame whose +Y is the mount's normal, standing on point p
function onMount(m, p, mount, fn){
  const roll = mount === 'down' ? Math.PI : mount === 'port' ? -Math.PI/2 : mount === 'stbd' ? Math.PI/2 : 0;
  m.push().xf(p, 0, 0, roll); fn(m); m.pop();
}
// a radiator panel between two corners in the XZ plane at height y (thickness t): black ribs, a dark frame
function radiator(m, x0, x1, z0, z1, y, t){
  m.box([(x0 + x1)/2, y, (z0 + z1)/2], [Math.abs(x1 - x0)/2, t/2, Math.abs(z1 - z0)/2], MAT.RAD, 0.95, 0);
  for (const z of [z0, z1]) m.bevelBox([(x0 + x1)/2, y, z], [Math.abs(x1 - x0)/2 + 0.6, t*0.8, 0.9], 0.3, MAT.DARK, 0.85);
  for (const x of [x0, x1]) m.bevelBox([x, y, (z0 + z1)/2], [0.9, t*0.8, Math.abs(z1 - z0)/2 + 0.6], 0.3, MAT.DARK, 0.85);
}
// a unit sphere (lathe about Z) of radius r at c
function ball(m, c, r, mat, seg = 16, ao = 1){
  const P = []; for (let i = 0; i <= 8; i++) { const a = Math.PI*i/8; P.push([c[2] - r*Math.cos(a), r*Math.sin(a), mat]); }
  P[0][1] = 0; P[8][1] = 0;
  m.lathe(P, seg, c[0], c[1], ao, 0);
}

// ------------------------------------------------------------------------------------------ BASTION
// The station: ~540 m across its ring, 690 m from the stern to the Nova's muzzle. Its axis (+Z) points at Gargantua, so from
// the default camera (behind it) the hole is framed by the ring. Stern: the command block (bridge tier, the hangar mouth
// the Hawks launch from, docking ports, masts), the aft spine with its radiator wings, the hub the ring turns round, the
// fore spine, and the armoured bow citadel (belt plates over a trench) carrying the heavy batteries above and below.
// The ring (a part) turns about the axis: sixteen lit habitat modules on four spokes, joined by tubes, on a bearing collar.
const BASTION_R = 250;
SHIP_CLASSES.bastion = () => {
  const m = new Mesh(), T = MAT, rnd = mulberry(7007);
  // stern command block: chamfered octagon, the aft face lit (bridge above, hangar below)
  m.decal = 5;
  m.loft([oct8(-252, 30, -24, 24, 0.34), oct8(-246, 36, -30, 30, 0.3), oct8(-160, 36, -30, 30, 0.3), oct8(-150, 26, -21, 21, 0.3)],
    [T.DARK, T.HULL, T.SUPER, T.HULL, T.SUPER, T.HULL, T.DARK, T.DARK], 1, 11, [true, true], T.DARK);
  tier(m, -236, -176, 26, 20, 30, 50, 8, [T.HULL, T.SUPER, T.HULL], 12);
  tier(m, -230, -196, 17, 14, 50, 60, 5, [T.SUPER, T.HULL, T.SUPER], 13);
  m.decal = 0;
  m.quad([-19, 51, -236.2], [19, 51, -236.2], [18.2, 57, -232], [-18.2, 57, -232], T.WINDOW, 1, 0, [0, 50, -210]);        // the bridge, raked aft
  for (const s of [-1, 1]) {
    tierWindows(m, s, -232, -180, 26, 20, 30, 50, 0.55, 2.2); tierWindows(m, s, -226, -200, 17, 14, 50, 60, 0.5, 1.6);
    sidePanel(m, s, 36.05, 4, 10, -238, -168, T.WINDOW); sidePanel(m, s, 36.05, -12, -8, -232, -176, T.WINDOW);
    m.cyl([s*36, 16, -205], [s*44, 16, -205], 5.5, 5.5, 14, T.DARK, 0.9, 0, true);                                     // docking ports
    m.cyl([s*44, 16, -205], [s*45.5, 16, -205], 6.2, 6.2, 14, T.HAZARD, 1, 0, true);
    m.bevelBox([s*24, -30.6, -210], [7, 0.9, 26], 0.4, T.SUPER, 0.8);                                                   // keel strakes
  }
  m.quad([18, -24, -252.1], [-18, -24, -252.1], [-18, -6, -252.1], [18, -6, -252.1], T.HANGAR, 1, 0, [0, -15, -240]);  // hangar mouth
  m.bevelBox([0, -4.4, -253], [20, 1.2, 1.6], 0.4, T.TRIM); m.bevelBox([0, -25.6, -253], [20, 1.2, 1.6], 0.4, T.TRIM);
  for (const s of [-1, 1]) m.bevelBox([s*20.4, -15, -253], [1.2, 11.8, 1.6], 0.4, T.HAZARD);
  mast(m, [-12, 60, -212], 36, 1.3); mast(m, [12, 60, -222], 26, 1.1); mast(m, [0, 60, -204], 14, 0.9);
  // aft spine, radiator wings on pylons
  m.loft([oct8(-151, 21, -19, 19, 0.3), oct8(-44, 21, -19, 19, 0.3)], [T.DARK, T.HULL, T.SUPER, T.HULL, T.SUPER, T.HULL, T.DARK, T.SUPER], 1, 14);
  for (const s of [-1, 1]) {
    for (const z of [-126, -64]) m.bevelBox([s*33, 0, z], [12.5, 2.4, 3], 0.8, T.SUPER, 0.85);                          // pylons
    radiator(m, s*45, s*172, -138, -52, 0, 1.4);
    m.cyl([s*21, 12, -148], [s*21, 12, -46], 1.3, 1.3, 8, T.TITAN, 1, 0, true);                                          // conduits
    m.cyl([s*21, -12, -148], [s*21, -12, -46], 1.3, 1.3, 8, T.TITAN, 1, 0, true);
  }
  for (let k = 0; k < 6; k++) m.bevelBox([0, 19.8, -140 + k*17], [9, 0.9, 6], 0.3, k & 1 ? T.DARK : T.SUPER, 0.85);   // spine hatches
  m.greeble(rnd, [-14, 19.2, -146], [1, 0, 0], [0, 0, 1], 28, 96, [0, 1, 0], 22, 2.2, [T.DARK, T.SUPER, T.HULL], 0.6);
  m.greeble(rnd, [-14, -19.2, -146], [1, 0, 0], [0, 0, 1], 28, 96, [0, -1, 0], 16, 2.2, [T.DARK, T.SUPER], 0.6);
  // the hub the ring turns round, and the fore spine
  m.lathe([[-46, 0, T.DARK], [-46, 36, T.DARK, 0, {crease: true}], [-42, 45, T.HULL, 0, {crease: true}], [-26, 45, T.TRIM, 0, {crease: true}],
    [-24, 45, T.HULL, 0, {crease: true}], [24, 45, T.HULL, 0, {crease: true}], [26, 45, T.TRIM, 0, {crease: true}], [42, 45, T.HULL, 0, {crease: true}],
    [46, 36, T.DARK, 0, {crease: true}], [46, 0, T.DARK]], 32, 0, 0, 1, 15);
  m.loft([oct8(44, 20, -18, 18, 0.3), oct8(112, 20, -18, 18, 0.3)], [T.DARK, T.HULL, T.SUPER, T.HULL, T.SUPER, T.HULL, T.DARK, T.SUPER], 1, 16);
  for (let k = 0; k < 4; k++) m.bevelBox([0, 18.8, 56 + k*15], [7, 0.8, 5], 0.3, T.DARK, 0.85);
  // bow citadel: armoured sections, belt plates above a trench, barbettes for the heavy batteries above and below
  const st = [armSec(110, 34, -30, 30, {L: 3.2, dw: 0.7, kw: 0.7}), armSec(176, 34, -30, 30, {L: 3.2, dw: 0.7, kw: 0.7}), armSec(204, 18, -20, 18, {L: 1.8, dw: 0.6, kw: 0.6, b1: 0.52})];
  m.decal = 5; m.loft(st, armMats(), 1, 17, [true, true], T.DARK); m.decal = 0;
  for (const s of [-1, 1]) { beltPlates(m, st, s, 110, 196, 13, 1.2, 1.1, [], 2); beltStrip(m, st, s, 196, 204); trenchDetail(m, st, s, 112, 190, 0.7, 7); }
  const K = SHIP_KIT.bastion;
  for (const H of K.heavy) onMount(m, V.mul(H.pivot, 0), H.mount, q => barbette(q, H.pivot[0], H.pivot[2], Math.abs(H.pivot[1]) - 3.6, Math.abs(H.pivot[1]), 11));
  for (const H of K.pd) onMount(m, [0, 0, 0], H.mount, q => barbette(q, 0, H.pivot[2], (H.mount === 'port' || H.mount === 'stbd' ? Math.abs(H.pivot[0]) : Math.abs(H.pivot[1])) - 1.4, H.mount === 'port' || H.mount === 'stbd' ? Math.abs(H.pivot[0]) : Math.abs(H.pivot[1]), 3.6, 12));
  deckLamps(m, st, [120, 150, 180], 0.9);
  // beacons (red, the masts) and strobes
  return m;
};
// the ring: bearing collar, four spokes, sixteen habitat modules on tubes (a part: it turns about the axis, ships.js mode 0)
SHIP_CLASSES.bastionRing = () => {
  const m = new Mesh(), T = MAT, R = BASTION_R, N = 16;
  m.lathe([[-20, 50, T.DARK], [-20, 58, T.DARK, 0, {crease: true}], [-16, 62, T.HULL, 0, {crease: true}], [-3, 62, T.TRIM, 0, {crease: true}],
    [3, 62, T.TRIM, 0, {crease: true}], [16, 62, T.HULL, 0, {crease: true}], [20, 58, T.DARK, 0, {crease: true}], [20, 50, T.DARK]], 32, 0, 0, 1, 21);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI/4 + k*Math.PI/2;
    m.push().xf([0, 0, 0], 0, 0, a);
    m.bevelBox([(62 + R - 12)/2, 0, 0], [(R - 12 - 62)/2, 3.4, 4.2], 0.9, T.HULL, 0.95, 22);                               // the elevator shaft
    m.cyl([61, 0, 8.5], [R - 12, 0, 8.5], 1.3, 1.3, 8, T.TITAN, 1, 0, true);                                              // conduits
    m.cyl([61, 0, -8.5], [R - 12, 0, -8.5], 1.3, 1.3, 8, T.TITAN, 1, 0, true);
    for (let j = 1; j < 6; j++) m.bevelBox([62 + j*(R - 74)/6, 0, 0], [1.4, 4.2, 9.6], 0.4, T.DARK, 0.9);               // braces
    m.pop();
  }
  for (let k = 0; k < N; k++) {
    const a = k*2*Math.PI/N;
    m.push().xf([0, 0, 0], 0, 0, a);
    m.bevelBox([R, 0, 0], [11, 34, 16], 2.6, T.HULL, 1, 30 + k);                                                           // module
    m.bevelBox([R + 11.4, 0, 0], [0.6, 30, 9], 0.3, T.SUPER, 0.9);                                                         // outer deck plate
    m.quad([R + 12.05, -26, -1.1], [R + 12.05, 26, -1.1], [R + 12.05, 26, 1.1], [R + 12.05, -26, 1.1], T.WINDOW, 1, 0, [R, 0, 0]);   // observation strip
    for (const s of [-1, 1]) for (const r0 of [-5.2, -0.6, 3.8]) {                                                     // three decks, both faces
      m.quad([R + r0, -28, s*16.05], [R + r0 + 1.5, -28, s*16.05], [R + r0 + 1.5, 28, s*16.05], [R + r0, 28, s*16.05], T.WINDOW, 1, 0, [R, 0, 0]);
    }
    for (const s of [-1, 1]) {
      m.bevelBox([R, s*34.4, 0], [9, 0.6, 14], 0.3, T.TRIM, 1);                                                             // trim caps
    }
    m.cyl([R - 13, 0, 0], [R - 11, 0, 0], 3.2, 3.2, 10, T.DARK, 0.9, 0, true);                                             // spoke socket
    m.pop();
    // the tube to the next module
    const b = 2*Math.PI/N, c0 = [R*Math.cos(a), R*Math.sin(a), 0], c1 = [R*Math.cos(a + b), R*Math.sin(a + b), 0], t = V.norm(V.sub(c1, c0));
    const q0 = V.add(c0, V.mul(t, 34.8)), q1 = V.sub(c1, V.mul(t, 34.8));
    m.cyl(q0, q1, 4.4, 4.4, 12, T.DARK, 0.85, 0, false);
    m.cyl(V.add(q0, V.mul(t, 1)), V.add(q0, V.mul(t, 3)), 6, 6, 12, T.SUPER, 1, 0, true);
    m.cyl(V.sub(q1, V.mul(t, 3)), V.sub(q1, V.mul(t, 1)), 6, 6, 12, T.SUPER, 1, 0, true);
  }
  return m;
};
// upgrade modules (parts at rest in ship space, drawn only once bought; they share BASTION's shadow tile and AO volume)
// NOVA: the spinal cannon, 240 m out of the bow: capacitor collar, the barrel wound with coils (they glow as it charges,
// the instance's fire pulse), four rails, the emitter at the muzzle
SHIP_CLASSES.bastionNova = () => {
  const m = new Mesh(), T = MAT;
  m.lathe([[198, 0, T.DARK], [198, 16, T.DARK, 0, {crease: true}], [214, 17, T.SUPER, 0, {crease: true}], [222, 12, T.DARK, 0, {crease: true}],
    [430, 9.5, T.TITAN, 0.2, {crease: true}], [432, 12.5, T.DARK, 0, {crease: true}], [446, 12.5, T.DARK, 0, {crease: true}], [448, 9, T.EMITTER, 0, {crease: true}], [448, 0, T.EMITTER]], 24, 0, 0, 1, 40);
  for (let k = 0; k < 12; k++) { const z = 236 + k*16; m.cyl([0, 0, z], [0, 0, z + 5], 14.5 - k*0.2, 14.5 - k*0.2, 20, T.COIL, 1, 0, true); }
  for (let k = 0; k < 4; k++) { const a = Math.PI/4 + k*Math.PI/2; m.push().xf([0, 0, 0], 0, 0, a); m.bevelBox([12, 0, 330], [2.2, 2.6, 104], 0.6, T.SUPER, 0.9); m.pop(); }
  for (const s of [-1, 1]) { m.bevelBox([s*22, 0, 208], [5, 12, 9], 1.5, T.HULL, 0.9); m.box([s*34, 0, 210], [8, 0.5, 7], T.RAD, 0.9, 0); }
  return m;
};
// SENSORS: the long-range array, a 48 m dish on a mast over the command block
SHIP_CLASSES.bastionDish = () => {
  const m = new Mesh(), T = MAT;
  m.cyl([10, 60, -226], [10, 96, -226], 2.4, 1.6, 10, T.DARK, 0.9, 0, true);
  m.push().xf([10, 98, -226], 0, -0.6, 0);
  m.lathe([[3, 26, T.HULL, 0, {crease: true}], [-1.5, 18, T.HULL], [-4.5, 9, T.HULL], [-5.5, 0, T.HULL]], 28, 0, 0, 1, 0);
  m.lathe([[-7, 0, T.DARK], [-5.6, 12, T.DARK], [-1, 26, T.DARK, 0, {crease: true}], [3, 26.4, T.TRIM]], 28);
  for (let k = 0; k < 3; k++) { const a = k*2.094, p = [Math.cos(a)*24, Math.sin(a)*24, 2.4]; m.cyl(p, [0, 0, 18], 0.4, 0.4, 5, T.DARK, 1, 0, false); }
  m.cyl([0, 0, 16], [0, 0, 21], 1.8, 0.8, 10, T.DARK, 1, 0, true);
  m.pop();
  return m;
};
// REACTOR: a second pair of radiator wings, standing above and below the aft spine
SHIP_CLASSES.bastionRads = () => {
  const m = new Mesh(), T = MAT;
  for (const s of [-1, 1]) {
    for (const z of [-126, -64]) m.bevelBox([0, s*31, z], [2.4, 11, 3], 0.8, T.SUPER, 0.85);
    m.push().xf([0, 0, 0], 0, 0, Math.PI/2); radiator(m, s*40, s*128, -140, -50, 0, 1.2); m.pop();
  }
  return m;
};
// ARMOR: reactive plates over the aft spine and the command block's flanks
SHIP_CLASSES.bastionArmor = () => {
  const m = new Mesh(), T = MAT;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) { const z = -142 + k*20.5; m.bevelBox([s*22.4, 0, z], [1.4, 11, 9.4], 0.6, T.HULL, 0.9, 50 + k); }
    for (let k = 0; k < 4; k++) { const z = -240 + k*18.5; m.bevelBox([s*37.4, -2, z], [1.4, 14, 8.4], 0.6, T.HULL, 0.9, 60 + k); }
    for (let k = 0; k < 3; k++) { const z = 58 + k*18; m.bevelBox([s*21.4, 0, z], [1.4, 10, 8], 0.6, T.HULL, 0.9, 70 + k); }
  }
  return m;
};
// HANGAR: a launch bay slung under the command block, its mouth aft
SHIP_CLASSES.bastionBay = () => {
  const m = new Mesh(), T = MAT;
  m.loft([oct8(-248, 22, -52, -30, 0.3), oct8(-170, 22, -52, -30, 0.3), oct8(-156, 14, -46, -30, 0.35)], [T.DARK, T.HULL, T.DARK, null, T.DARK, T.HULL, T.DARK, T.SUPER], 1, 80, [true, true], T.DARK);
  m.quad([15, -49, -248.1], [-15, -49, -248.1], [-15, -33, -248.1], [15, -33, -248.1], T.HANGAR, 1, 0, [0, -41, -230]);
  for (const s of [-1, 1]) { m.bevelBox([s*16, -41, -249], [1, 9, 1.2], 0.3, T.HAZARD); sidePanel(m, s, 22.05, -44, -40, -240, -178, T.WINDOW); }
  return m;
};

// ------------------------------------------------------------------------------------------ platforms
// The Defence Force's guns: each a free-flying platform holding station at a build slot. Their weapons are parts trained by
// war.js (yaw about the mount's +Y, then pitch): turrets modelled round their own origin (ships.js mode 1).
SHIP_CLASSES.dturretS = () => turretPart(4.2);                            // SENTINEL's autocannon turret, BASTION's heavies at 9
SHIP_CLASSES.dturretL = () => turretPart(9);
SHIP_CLASSES.dturretPD = () => turretPart(3.2);                           // BASTION's point defence
// SENTINEL, 30 m: a chamfered armoured drum under its autocannon turret; barbettes above, below and on both flanks (Mk II
// adds the lower turret, Mk III the flank pair); radiator fins that glow with the guns' heat, a mast, hazard bands
SHIP_CLASSES.sentinel = () => {
  const m = new Mesh(), T = MAT, K = SHIP_KIT.sentinel;
  m.loft([oct8(-12, 6.5, -3.4, 3.4, 0.42), oct8(-10, 8.5, -4.4, 4.4, 0.36), oct8(9, 8.5, -4.4, 4.4, 0.36), oct8(12, 6, -3.2, 3.2, 0.42)],
    [T.DARK, T.HULL, T.SUPER, T.HULL, T.SUPER, T.HULL, T.DARK, T.DARK], 1, 101, [true, true], T.DARK);
  for (const H of K.turrets) onMount(m, [0, 0, 0], H.mount, q => {
    const up = H.mount === 'port' || H.mount === 'stbd' ? Math.abs(H.pivot[0]) : Math.abs(H.pivot[1]);
    barbette(q, 0, H.pivot[2], up - 1.3, up, 4.3, 14); });
  for (const s of [-1, 1]) {
    m.box([s*13.2, 0, -7.6], [3.8, 0.25, 3.4], T.RAD, 0.9, 0); m.bevelBox([s*9.1, 0, -7.6], [0.8, 0.8, 3.7], 0.2, T.DARK);
    m.box([s*8.52, 0, 6], [0.06, 1.2, 2.6], T.HAZARD, 1, 0);
  }
  m.cyl([0, 0, -12], [0, 0, -13.5], 2.6, 2.2, 12, T.DARK, 0.9, 0, true);
  mast(m, [5.5, 4.4, -11], 6, 0.3);
  for (const s of [-1, 1]) for (const z of [-9, 7]) m.bevelBox([s*6.6, 3.9, z], [0.5, 0.5, 0.5], 0.12, T.DARK);
  return m;
};
// LONGBOW, 120 m with its gun: the capacitor spine (banks in rows, a reactor sphere astern), radiator wings that glow after
// every shot, and a turntable carrying the gun (two parts: the mount turns in yaw, the gun in yaw and pitch on its trunnion)
SHIP_CLASSES.longbow = () => {
  const m = new Mesh(), T = MAT;
  m.loft([oct8(-26, 7, -6, 6, 0.4), oct8(-22, 10, -7.5, 7.5, 0.35), oct8(18, 10, -7.5, 7.5, 0.35), oct8(24, 6, -5, 5, 0.4)],
    [T.DARK, T.HULL, T.SUPER, T.HULL, T.SUPER, T.HULL, T.DARK, T.DARK], 1, 111, [true, true], T.DARK);
  ball(m, [0, 0, -30], 7.5, T.HULL, 16);
  m.cyl([0, 0, -37.2], [0, 0, -38.5], 3, 2, 12, T.DARK, 0.9, 0, true);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) m.cyl([s*10.2, -3, -18 + k*8], [s*10.2, 3, -18 + k*8], 2.2, 2.2, 10, T.DARK, 0.85, 0, true);   // capacitor banks
    m.bevelBox([s*13, 0, -8], [3, 1.6, 2.6], 0.5, T.SUPER, 0.85);
    radiator(m, s*16, s*44, -24, 8, 0, 0.9);
    m.box([s*10.06, -5.5, 12], [0.06, 1, 5], T.HAZARD, 1, 0);
  }
  barbette(m, 0, 4, 7, 8.4, 8.8, 20);
  mast(m, [-6, 7.5, -20], 9, 0.35);
  return m;
};
SHIP_CLASSES.longbowMount = () => {                                        // (yaw only) turntable and the yoke's cheeks
  const m = new Mesh(), T = MAT;
  m.cyl([0, 0, 0], [0, 1.6, 0], 8.4, 8.2, 20, T.HULL, 0.9, 0, true);
  for (const s of [-1, 1]) { m.bevelBox([s*6.2, 5, 0], [1.3, 4.6, 5], 0.5, T.SUPER, 0.9); m.cyl([s*7.6, 6.6, 0], [s*5, 6.6, 0], 2.2, 2.2, 12, T.DARK, 1, 0, true); }
  return m;
};
SHIP_CLASSES.longbowGun = () => {                                          // modelled round its trunnion; the barrel along +Z
  const m = new Mesh(), T = MAT;
  m.bevelBox([0, 0, -4], [4.8, 3.6, 9], 1, T.HULL, 0.9, 112);                // breech block
  m.bevelBox([0, 0, -14.5], [3.6, 2.8, 2.2], 0.6, T.DARK, 0.9);
  for (const s of [-1, 1]) m.bevelBox([s*1.9, 0, 32], [0.9, 2.3, 30], 0.3, T.SUPER, 0.95);    // the rails
  m.bevelBox([0, 2.5, 30], [2.6, 0.35, 27], 0.1, T.DARK, 0.9); m.bevelBox([0, -2.5, 30], [2.6, 0.35, 27], 0.1, T.DARK, 0.9);
  for (let k = 0; k < 9; k++) { const z = 7 + k*6; m.cyl([0, 0, z], [0, 0, z + 2], 4.1, 4.1, 14, T.COIL, 1, 0, true); }       // accelerator coils
  m.lathe([[61.5, 0, T.DARK], [61.5, 3.6, T.DARK, 0, {crease: true}], [64, 3.2, T.EMITTER, 0, {crease: true}], [64, 0, T.EMITTER]], 14);
  return m;
};
// HYDRA, 34 m: a hexagonal hull on a turntable; the launcher (a part: yaw and pitch) is a box of nine tubes whose mouths glow
// as a salvo leaves
SHIP_CLASSES.hydra = () => {
  const m = new Mesh(), T = MAT;
  const hx = (z, r, h) => ({z, pts: [0, 1, 2, 3, 4, 5].map(k => [Math.cos(k*Math.PI/3)*r, Math.sin(k*Math.PI/3)*h])});
  m.loft([hx(-13, 8, 4.5), hx(-11, 10.5, 5.8), hx(10, 10.5, 5.8), hx(13, 7.5, 4.2)], [T.HULL, T.SUPER, T.HULL, T.DARK, T.DARK, T.DARK], 1, 121, [true, true], T.DARK);
  barbette(m, 0, 0, 4.6, 5.8, 6.4, 16);
  for (const s of [-1, 1]) { m.box([s*13.5, -1.5, -3], [3.2, 0.25, 6.5], T.RAD, 0.9, 0); m.box([s*10.02, -2, 8], [0.06, 0.8, 2.6], T.HAZARD, 1, 0); }
  m.cyl([0, -5.6, 0], [0, -7.4, 0], 3.2, 2.2, 12, T.DARK, 0.9, 0, true);
  mast(m, [-5, 3, -10], 7, 0.3);
  return m;
};
SHIP_CLASSES.hydraLauncher = () => {                                       // modelled round its turntable (origin), tubes along +Z
  const m = new Mesh(), T = MAT;
  m.cyl([0, 0, 0], [0, 1.4, 0], 6, 5.8, 16, T.DARK, 0.85, 0, true);
  m.bevelBox([0, 6.2, 0.5], [6.6, 4.8, 7.4], 0.9, T.HULL, 0.9, 122);
  m.bevelBox([0, 11.2, -1.5], [4.4, 0.4, 4.6], 0.2, T.SUPER, 0.9);
  for (const s of [-1, 1]) m.bevelBox([s*6.9, 6.2, 0.5], [0.4, 4, 6.4], 0.15, T.SUPER, 0.9);
  for (const [x, y] of SHIP_KIT.hydraLauncher.tubes) {
    m.bevelBox([x, y, 7.6], [1.7, 1.25, 0.3], 0.2, T.DARK, 0.7);
    m.box([x, y, 7.95], [1.25, 0.85, 0.06], T.EMITTER, 1, 0);
  }
  return m;
};
// AEGIS, 40 m: the field projector -- a core sphere banded with emitters, three arms to projector nodes, and a slowly
// turning outrigger ring (a part) carrying six emitters
SHIP_CLASSES.aegis = () => {
  const m = new Mesh(), T = MAT;
  ball(m, [0, 0, 0], 7, T.HULL, 20);
  m.cyl([0, -0.7, 0], [0, 0.7, 0], 7.25, 7.25, 24, T.EMITTER, 1, 0, false);
  for (let k = 0; k < 3; k++) {
    const a = k*2*Math.PI/3 + Math.PI/2, d = [Math.cos(a), 0, Math.sin(a)];
    m.cyl(V.mul(d, 6), V.mul(d, 15), 1.3, 0.9, 8, T.DARK, 0.9, 0, true);
    m.cyl(V.mul(d, 15), V.mul(d, 19.5), 2.6, 0.6, 10, T.SUPER, 1, 0, true);
    m.cyl(V.mul(d, 19.4), V.mul(d, 20.2), 0.8, 0.2, 8, T.EMITTER, 1, 0, true);
  }
  m.cyl([0, 6.4, 0], [0, 11, 0], 1.6, 0.6, 10, T.DARK, 0.9, 0, true);
  m.cyl([0, -6.4, 0], [0, -12.5, 0], 3.4, 1.6, 12, T.SUPER, 0.9, 0, true);
  mast(m, [0, 11, 0], 3, 0.35);
  return m;
};
SHIP_CLASSES.aegisRing = () => {                                           // turns about +Y (a part, mode 1 round the core)
  const m = new Mesh(), T = MAT;
  for (let k = 0; k < 6; k++) {
    const a = k*Math.PI/3, b = a + Math.PI/3, p = [Math.cos(a)*12, 0, Math.sin(a)*12], q = [Math.cos(b)*12, 0, Math.sin(b)*12];
    m.cyl(p, q, 0.55, 0.55, 8, T.HULL, 1, 0, false);
    m.bevelBox(p, [1.1, 1.1, 1.1], 0.3, T.DARK, 0.9);
    m.cyl(V.add(p, [0, 1.1, 0]), V.add(p, [0, 2.3, 0]), 0.5, 0.15, 8, T.EMITTER, 1, 0, true);
    m.cyl(V.mul(V.norm(p), 7.2), V.mul(V.norm(p), 11), 0.3, 0.3, 6, T.DARK, 1, 0, false);
  }
  return m;
};
// the AEGIS field: never drawn as a hull, only its shell (a unit sphere: view.js scales the shell to the field's radius)
SHIP_CLASSES.bubble = () => { const m = new Mesh(); ball(m, [0, 0, 0], 1, MAT.HULL, 12); return m; };

// ------------------------------------------------------------------------------------------ the Dominion's new hulls
// LOCUST, 28 m: a flat armoured wedge on stubby swept wings, a planet-cracker slung under its belly (the emitter ring glows
// when it is armed, below the corridor's mouth), two engines, a red sensor eye.
SHIP_CLASSES.locust = () => {
  const m = new Mesh(), T = MAT;
  m.loft([oct8(-12, 4.8, -1.6, 1.6, 0.4), oct8(-9, 7.2, -2.2, 2.2, 0.36), oct8(3, 6.4, -2.1, 2.5, 0.36), oct8(10, 3.2, -1.3, 1.4, 0.4), oct8(13.6, 0.7, -0.5, 0.35, 0.45)],
    [T.DARK, T.SUPER, T.HULL, T.SUPER, T.HULL, T.SUPER, T.DARK, T.DARK], 1, 131, [true, true], T.DARK);
  m.bevelBox([0, 2.7, 1.5], [2.2, 0.8, 4.2], 0.4, T.SUPER, 0.9);
  m.bevelBox([0, 2.5, 6.2], [0.9, 0.35, 0.5], 0.1, T.LAMP);
  for (const s of [-1, 1]) {
    m.hex([[s*6.2, -0.35, -9], [s*6.2, -0.35, 2], [s*6.2, 0.35, -9], [s*6.2, 0.35, 2], [s*14, -0.2, -11.5], [s*14, -0.2, -7.5], [s*14, 0.2, -11.5], [s*14, 0.2, -7.5]]
      .map((v, i, a) => a[s < 0 ? [4, 5, 6, 7, 0, 1, 2, 3][i] : i]), T.HULL, 1, 132);
    m.hex([[s*13.6, -0.3, -11.6], [s*13.6, -0.3, -7.4], [s*13.6, 0.3, -11.6], [s*13.6, 0.3, -7.4], [s*14.4, -0.3, -11.6], [s*14.4, -0.3, -7.4], [s*14.4, 0.3, -11.6], [s*14.4, 0.3, -7.4]]
      .map((v, i, a) => a[s < 0 ? [4, 5, 6, 7, 0, 1, 2, 3][i] : i]), T.TRIM, 1, 0);
    engineBell(m, -11.5, s*3.1, 0, 1.25, 1.6);
  }
  // the bomb: a long cylinder in a cradle, its emitter ring
  m.lathe([[-8, 0, T.DARK], [-8, 1.3, T.DARK, 0, {crease: true}], [-6.5, 1.6, T.SUPER], [5, 1.6, T.SUPER, 0, {crease: true}], [7.5, 0.9, T.DARK], [8.6, 0, T.DARK]], 12, 0, -3.3);
  m.cyl([0, -3.3, -1.2], [0, -3.3, 0.2], 1.72, 1.72, 12, T.EMITTER, 1, 0, false);
  for (const z of [-5, 3]) m.bevelBox([0, -2.1, z], [0.6, 0.5, 0.7], 0.15, T.DARK);
  return m;
};
// MANTIS, 64 m: a heavy dropship -- a blunt armoured hull with a raised command bridge, four drop pods clamped along its
// flanks (the troops MILLER must never see), four engines in an armoured tail
SHIP_CLASSES.mantis = () => {
  const m = new Mesh(), T = MAT, rnd = mulberry(1414);
  m.loft([oct8(-30, 9, -6, 6, 0.35), oct8(-26, 12, -8.5, 8.5, 0.3), oct8(18, 12, -8.5, 8.5, 0.3), oct8(28, 8.5, -6, 6.5, 0.35), oct8(33, 3.5, -2.8, 2.6, 0.45)],
    [T.DARK, T.SUPER, T.HULL, T.SUPER, T.HULL, T.SUPER, T.DARK, T.DARK], 1, 141, [true, true], T.DARK);
  m.decal = 5; tier(m, -8, 14, 7, 5.4, 8.5, 12.5, 3, [T.HULL, T.SUPER, T.HULL], 142); m.decal = 0;
  m.quad([-4.6, 11.2, 13.8], [4.6, 11.2, 13.8], [4.3, 12.3, 12.2], [-4.3, 12.3, 12.2], T.WINDOW, 1, 0, [0, 10, 4]);
  for (const s of [-1, 1]) {
    for (const z of [-14, 6]) {                                                          // drop pods and their clamps
      m.lathe([[z - 9, 0, T.DARK], [z - 9, 2.2, T.DARK, 0, {crease: true}], [z - 7.5, 3.2, T.HULL], [z + 6, 3.2, T.HULL, 0, {crease: true}], [z + 8.5, 1.4, T.TRIM], [z + 9.2, 0, T.TRIM]], 12, s*15.4, -1.5, 1, 143);
      m.bevelBox([s*12.6, -1.5, z - 3], [1.4, 1, 1.2], 0.3, T.DARK); m.bevelBox([s*12.6, -1.5, z + 3], [1.4, 1, 1.2], 0.3, T.DARK);
    }
    for (const y of [-3.5, 3.5]) engineBell(m, -30, s*5.2, y, 2.1, 2.6);
    m.bevelBox([s*12.4, 4, -24], [0.5, 3, 5], 0.2, T.TRIM);
  }
  m.greeble(rnd, [-9, 8.5, -24], [1, 0, 0], [0, 0, 1], 18, 14, [0, 1, 0], 10, 1.6, [T.DARK, T.SUPER], 0.6);
  m.bevelBox([0, 0, 33.4], [1, 0.5, 0.4], 0.1, T.LAMP);
  return m;
};

// ------------------------------------------------------------------------------------------ hardpoints
// turrets: {pivot (the part's origin on the hull), mount (which way the deck faces)}; tips are the part's barrel ends
Object.assign(SHIP_KIT, {
  bastion: {name: 'BASTION', hit: [272, 272, 240], hitC: [0, 0, -24], livery: [LIV_DEF, LIV_DEF], panel: 7, plating: true, shield: {yMax: 1e9}, parts: ['bastionRing'],
    // heavy batteries (dturretL) on the bow citadel's deck and keel; point defence (dturretPD) in the order they come online
    heavy: [{pivot: [0, 33.6, 150], mount: 'up'}, {pivot: [0, -33.6, 150], mount: 'down'}],
    pd: [{pivot: [0, 20.2, -104], mount: 'up'}, {pivot: [0, -19.2, 86], mount: 'down'}, {pivot: [0, 19.2, 86], mount: 'up'}, {pivot: [0, -20.2, -104], mount: 'down'},
         {pivot: [36.6, 0, -186], mount: 'port'}, {pivot: [-36.6, 0, -186], mount: 'stbd'}, {pivot: [20.6, 0, 70], mount: 'port'}, {pivot: [-20.6, 0, 70], mount: 'stbd'}],
    hangar: [0, -15, -262], hangar2: [0, -41, -258], novaMuzzle: [0, 0, 452],
    beacons: [[-12, 97, -212], [12, 87, -222], [0, 75, -204]], strobes: [[45.6, 16, -205], [-45.6, 16, -205]],
    lamps: [[172, 0, -52], [-172, 0, -52], [172, 0, -138], [-172, 0, -138]]},
  bastionRing: {name: 'BASTION', part: true, of: 'bastion', pivot: [0, 0, 0], hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], panel: 7},
  bastionNova: {name: 'BASTION', part: true, of: 'bastion', pivot: [0, 0, 0], hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], plating: true, panel: 6},
  bastionDish: {name: 'BASTION', part: true, of: 'bastion', pivot: [0, 0, 0], hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], panel: 4},
  bastionRads: {name: 'BASTION', part: true, of: 'bastion', pivot: [0, 0, 0], hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], panel: 6},
  bastionArmor: {name: 'BASTION', part: true, of: 'bastion', pivot: [0, 0, 0], hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], plating: true, panel: 5},
  bastionBay: {name: 'BASTION', part: true, of: 'bastion', pivot: [0, 0, 0], hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], plating: true, panel: 6},
  dturretS: {name: 'TURRET', part: true, hit: [4, 4, 4], livery: [LIV_PLAT, 1], panel: 2.2, plating: true, tip: [0, 3.36, 13.44], tips: [[1.18, 3.36, 13.44], [-1.18, 3.36, 13.44]]},
  dturretL: {name: 'TURRET', part: true, hit: [9, 9, 9], livery: [LIV_PLAT, 1], panel: 4, plating: true, tip: [0, 7.2, 28.8], tips: [[2.52, 7.2, 28.8], [-2.52, 7.2, 28.8]]},
  dturretPD: {name: 'TURRET', part: true, hit: [3, 3, 3], livery: [LIV_PLAT, 1], panel: 1.8, plating: true, tip: [0, 2.56, 10.24], tips: [[0.9, 2.56, 10.24], [-0.9, 2.56, 10.24]]},
  sentinel: {name: 'SENTINEL', hit: [9, 5.5, 13], livery: [LIV_PLAT, LIV_PLAT], panel: 2.2, plating: true, lamps: [[5.5, 10.4, -11]], nav: {port: [17.0, 0, -7.6], stbd: [-17.0, 0, -7.6]},
    turrets: [{pivot: [0, 5.7, 2], mount: 'up'}, {pivot: [0, -5.7, 2], mount: 'down'}, {pivot: [9.8, 0, 2], mount: 'port'}, {pivot: [-9.8, 0, 2], mount: 'stbd'}]},
  longbow: {name: 'LONGBOW', hit: [22, 8.5, 34], livery: [LIV_PLAT, LIV_PLAT], panel: 3, plating: true, lamps: [[-6, 17.2, -20]], nav: {port: [44.6, 0, -8], stbd: [-44.6, 0, -8]},
    mount: {pivot: [0, 8.4, 4]}, gun: {pivot: [0, 15, 4], muzzle: [0, 0, 64]}},
  longbowMount: {name: 'LONGBOW', part: true, of: 'longbow', hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], panel: 3, plating: true},
  longbowGun: {name: 'LONGBOW', part: true, of: 'longbow', hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], panel: 3, plating: true},
  hydra: {name: 'HYDRA', hit: [12, 6.5, 14], livery: [LIV_PLAT, LIV_PLAT], panel: 2.4, plating: true, lamps: [[-5, 10.7, -10]], nav: {port: [16.8, -1.5, -3], stbd: [-16.8, -1.5, -3]},
    launcher: {pivot: [0, 5.8, 0]}},
  hydraLauncher: {name: 'HYDRA', part: true, of: 'hydra', hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], panel: 2.4, plating: true,
    tubes: [[-4.2, 3.4], [0, 3.4], [4.2, 3.4], [-4.2, 6.2], [0, 6.2], [4.2, 6.2], [-4.2, 9], [0, 9], [4.2, 9]]},
  aegis: {name: 'AEGIS', hit: [16, 9, 16], livery: [LIV_PLAT, LIV_PLAT], panel: 2, plating: true, lamps: [[0, 14.8, 0]], ring: {pivot: [0, 3.6, 0]}},
  aegisRing: {name: 'AEGIS', part: true, of: 'aegis', hit: [2, 2, 2], livery: [LIV_PLAT, LIV_PLAT], panel: 2, plating: true},
  bubble: {name: 'AEGIS FIELD', hit: [1, 1, 1], livery: [LIV_PLAT, LIV_PLAT], panel: 1, shield: {yMax: 1e9}},
  locust: {name: 'LOCUST', hit: [11, 3.4, 13], livery: [1, 1], panel: 1.8, engines: [{p: [3.1, 0, -13.1], r: 1.25}, {p: [-3.1, 0, -13.1], r: 1.25}],
    plume: {len: 22, core: [3.4, 1.6, 0.6], outer: [1.3, 0.3, 0.06]}, eye: [0, 2.5, 6.8], bomb: [0, -3.3, -0.5]},
  mantis: {name: 'MANTIS', hit: [17, 9, 31], livery: [1, 1], panel: 3, engines: [[5.2, -3.5], [-5.2, -3.5], [5.2, 3.5], [-5.2, 3.5]].map(([x, y]) => ({p: [x, y, -32.6], r: 2.1})),
    plume: {len: 40, core: [3.2, 1.8, 0.8], outer: [1.3, 0.34, 0.07]}, beacons: [[0, 0, 33.9], [12.4, 7.2, -24], [-12.4, 7.2, -24]]},
});
// the hawk's wingtip guns (shipkit.js models them; the landing page never fires them)
SHIP_KIT.hawk.guns = SHIP_KIT.hawk.guns || [[7.8, 0, -1.4], [-7.8, 0, -1.4]];

// the order the page builds them at boot (the station first: it is on screen from the first frame)
const DEF_ORDER = ['bastionRing', 'bastion', 'bastionNova', 'bastionDish', 'bastionRads', 'bastionArmor', 'bastionBay', 'dturretPD', 'dturretL', 'dturretS',
  'sentinel', 'longbowMount', 'longbowGun', 'longbow', 'hydraLauncher', 'hydra', 'aegisRing', 'aegis', 'hawk', 'wasp', 'locust', 'mantis',
  'turretS', 'turretL', 'frigate', 'cruiser', 'shard'];
