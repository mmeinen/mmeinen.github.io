'use strict';
// war.js — PLANET DEFENSE: the war for MILLER's drop corridor. Pure maths (no GL, no DOM): view.js draws it, ui.js shows and
// sounds it, main.js feeds it commands, and tests.html fights it in a sandbox without a page.
//
// THE SECTOR. Everything lives in BASTION's co-rotating frame: float64 metres, origin at the station, +Y up (away from
// MILLER), +Z prograde, +X the orbit normal -- on the dawn-dusk orbit that points at Gargantua (within 8 deg). There is no
// gravity here: over a wave's ranges (12 km) and flight times (seconds) the real orbit's tidal and Coriolis terms are tens of
// metres, and every craft keeps station anyway, so rounds fly straight and aim is a plain intercept. (The landing page's
// fight lives in MILLER's frame instead and has to carry the orbit: combat.js.) view.js puts the sector into the renderer's
// frame every frame from orbit.js's station orbit.
//
// THE WAR. The Dominion comes out of Gargantua's glare (+X) and, later, from every side. Its bombers run for the drop
// corridor below BASTION; each one that dives through it strikes MILLER's planetary shield (AEGIS). Its fighters escort
// them and hunt the defences; its capital ships stand off and pound the station. You spend credits -- kills, wave bonuses,
// the reactor -- on platforms at 16 build slots and their marks, Hawk squadrons from the hangar, and BASTION's upgrades.
// AEGIS 0 or BASTION 0 is defeat; twenty waves is victory, and the war goes on after it for as long as you hold.
//
// STEP ORDER (as combat.js): MOTION first -- everything that exists flies this frame, and what it hits it hits now -- then
// DECISIONS at the frame's end (arrivals, AI, targeting, fire, the director), so whatever is spawned first moves next frame.
// Rounds and particles live in Float64Array pools: no allocation per round or spark (GC hitches read as missed vsyncs).

// ------------------------------------------------------------------------------------------ tuning (seconds of game time)
const WAR_T = {
  NB: 2048, NFX: 4096,                                   // pools (the FX pool must fit ships.js's sprite and beam buffers)
  BREACH_Y: -4600, DIVE_Y: -10500, GATE_R: 1900,          // the corridor's mouth under BASTION, and how far a diving bomber must get
  BUILD_FIRST: 45, BUILD: 28, EARLY: 3,                   // build phase (s); credits for each second left when you launch early
  SELL: 0.6, INCOME: 1, INCOME_REACTOR: 2,                 // sale refund; credits per second in a wave (+ per reactor level)
  REPAIR: 0.2,                                            // share of BASTION's hull patched between waves
  AEGIS_REGEN: 6,                                         // AEGIS % restored for every wave held
};
const WAR_DIFF = {
  recruit: {name: 'RECRUIT', hp: 0.72, n: 0.75, dmg: 0.65, cr: 1250, pay: 1.2},
  veteran: {name: 'VETERAN', hp: 1, n: 1, dmg: 1, cr: 1000, pay: 1},
  admiral: {name: 'ADMIRAL', hp: 1.3, n: 1.25, dmg: 1.3, cr: 850, pay: 0.9},
};
// Every class: kind (station | platform | fighter | bomber | capital), team (0 the Defence Force, 1 the Dominion), hull,
// shield, flight (spd m/s, turn rad/s, tau s, acc m/s^2), reward (credits), breach (AEGIS % a bomber takes through the
// corridor), boom (explosion size, m). Hit ellipsoids and every hardpoint come from SHIP_KIT (kit.js, shipkit.js).
const WAR_CLS = {
  bastion:  {mesh: 'bastion', name: 'BASTION', kind: 'station', team: 0, hp: 1500, sh: 800, regen: 16, boom: 300},
  sentinel: {mesh: 'sentinel', name: 'SENTINEL', kind: 'platform', team: 0, role: 'AUTOCANNON', boom: 34, turn: 0.9},
  hydra:    {mesh: 'hydra', name: 'HYDRA', kind: 'platform', team: 0, role: 'MISSILE BATTERY', boom: 40, turn: 0.6},
  longbow:  {mesh: 'longbow', name: 'LONGBOW', kind: 'platform', team: 0, role: 'RAILGUN', boom: 60, turn: 0.32},
  aegis:    {mesh: 'aegis', name: 'AEGIS', kind: 'platform', team: 0, role: 'SHIELD PROJECTOR', boom: 40, turn: 0},
  hawk:     {mesh: 'hawk', name: 'HAWK', kind: 'fighter', team: 0, hp: 9, spd: 235, turn: 1.9, tau: 0.3, acc: 280, boom: 20,
             guns: SHIP_KIT.hawk.guns, rate: 9, speed: 2100, spread: 0.8*DEG, dmg: 1.1, range: 1150},
  wasp:     {mesh: 'wasp', name: 'WASP', kind: 'fighter', team: 1, hp: 8, spd: 210, turn: 1.35, tau: 0.3, acc: 260, reward: 10, boom: 22,
             guns: SHIP_KIT.wasp.guns, burst: 6, rate: 10, speed: 1800, spread: 1.1*DEG, dmg: 1.4, range: 1300, rest: 2.2},
  locust:   {mesh: 'locust', name: 'LOCUST', kind: 'bomber', team: 1, hp: 26, spd: 185, turn: 0.8, tau: 0.8, acc: 60, reward: 14, breach: 3, boom: 30},
  mantis:   {mesh: 'mantis', name: 'MANTIS', kind: 'bomber', team: 1, hp: 150, spd: 110, turn: 0.4, tau: 1.5, acc: 26, reward: 45, breach: 12, boom: 70, heavy: true},
  frigate:  {mesh: 'frigate', name: 'FRIGATE', kind: 'capital', team: 1, hp: 420, sh: 220, spd: 55, turn: 0.12, tau: 2, acc: 12, reward: 200, boom: 130,
             stand: [3300, 4300], flak: 0.45, missiles: 9},
  cruiser:  {mesh: 'cruiser', name: 'CRUISER', kind: 'capital', team: 1, hp: 1100, sh: 600, spd: 40, turn: 0.07, tau: 3, acc: 8, reward: 450, boom: 320,
             stand: [3800, 5000], flak: 0.16, heavy: true, launch: 16},
  sovereign:{mesh: 'cruiser', scale: 1.6, name: 'SOVEREIGN', kind: 'capital', team: 1, hp: 4500, sh: 2600, spd: 32, turn: 0.05, tau: 3.5, acc: 6, reward: 1200, boom: 520,
             stand: [5200, 6200], flak: 0.2, heavy: true, launch: 12, sunder: 24, boss: true},
};
// Platforms by mark (I, II, III): cost to build or refit, hull, and the weapon's numbers
const WAR_PLAT = {
  sentinel: {cost: [180, 160, 280], hp: [90, 130, 180], turrets: [1, 2, 4], rate: [8, 10, 12], dmg: [1.4, 1.7, 2.1], range: [1500, 1700, 1900], slew: [2.4, 2.8, 3.2],
             blurb: 'Rapid-fire autocannon. Shreds fighters, bombers and missiles at close range.'},
  hydra:    {cost: [340, 280, 420], hp: [110, 150, 200], salvo: [4, 5, 6], every: [8, 7, 6], dmg: [6, 7, 8], range: [5200, 5800, 6400],
             blurb: 'Homing missile salvos. Long reach against bombers and fighters.'},
  longbow:  {cost: [560, 420, 640], hp: [140, 190, 250], charge: [3.6, 3, 2.4], dmg: [70, 100, 140], range: [9000, 10000, 11500],
             blurb: 'Hypervelocity railgun for big targets only: capital ships and dropships. Punches through shields and armour.'},
  aegis:    {cost: [420, 320, 460], hp: [120, 160, 210], pool: [120, 200, 300], regen: [8, 12, 18], radius: [1100, 1350, 1600],
             blurb: 'Projects a shield bubble that stops fire aimed at anything inside it.'},
};
const WAR_MK = ['I', 'II', 'III'];
// BASTION's upgrade tracks: costs per level; what each level does is applied by warStats()
const WAR_UPG = {
  armor:   {name: 'ARMOR', costs: [300, 600, 1000], blurb: 'Reactive plating: +40% hull per level.'},
  shield:  {name: 'SHIELDS', costs: [350, 700, 1100], blurb: '+50% shield capacity and faster recharge per level.'},
  pd:      {name: 'POINT DEFENSE', costs: [250, 500, 800], blurb: 'Two more close-in turrets per level (2 to 8).'},
  battery: {name: 'HEAVY BATTERIES', costs: [400, 800, 1200], blurb: 'Heavy guns on the bow citadel for capital ships.'},
  hangar:  {name: 'HANGAR', costs: [300, 650, 1000], blurb: 'Room for another Hawk squadron per level; a second bay.'},
  reactor: {name: 'REACTOR', costs: [400, 800, 1300], blurb: '+2 credits a second in battle; abilities recharge faster.'},
  sensors: {name: 'SENSORS', costs: [300, 600], blurb: '+8% range for every gun per level. Long-range array.'},
  nova:    {name: 'NOVA CANNON', costs: [2200], blurb: 'Spinal superweapon. A beam that guts capital ships.'},
  lance:   {name: 'PLANETARY LANCE', costs: [1600, 1200], blurb: 'MILLER fires back: a beam from the surface.'},
};
const WAR_SQUAD = {cost: 350, n: 3};
// weapons that are not per mark: station point defence and heavies, Hawk guns, the enemies' flak, heavies and missiles,
// the abilities
const WAR_W = {
  pd:     {rate: 7, dmg: 1.2, range: 1400, speed: 2400, spread: 0.3*DEG, slew: 3},
  heavy:  {rate: [0.45, 0.45, 0.7], dmg: 14, range: 5200, speed: 3200, spread: 0.08*DEG, slew: 0.7},
  ac:     {speed: 2400, spread: 0.5*DEG, life: 1.5},
  rail:   {speed: 9000, life: 1.8},
  msl:    {speed: 620, acc: 380, turn: 2.8, life: 13, fuse: 18},
  flak:   {speed: 1400, life: 3, fuse: 40, dmg: 5, direct: 9, spread: 2.6*DEG, range: 3000},
  eheavy: {speed: 1500, life: 4.5, dmg: 7, range: 5200, spread: 0.6*DEG},
  emsl:   {speed: 330, acc: 120, turn: 1.4, life: 16, fuse: 22, dmg: 16, range: 7200},
  nova:   {charge: 2.4, cd: 70, dmg: 900, splash: 160, splashR: 320},
  lance:  {charge: 1.5, cd: [55, 40], dmg: [520, 760]},
  sunder: {charge: 4, dmg: 220},
};
// Build slots: 16 stations the platforms hold, in rings facing the enemy (+X), and round the corridor below.
const WAR_SLOTS = (() => {
  const S = [], ring = (x, r, n, a0, tag) => { for (let k = 0; k < n; k++) { const a = a0 + k*2*Math.PI/n; S.push({p: [x, r*Math.sin(a), r*Math.cos(a)], tag}); } };
  ring(1100, 1250, 4, Math.PI/4, 'INNER');
  ring(3000, 2100, 6, 0, 'FORWARD');
  for (let k = 0; k < 4; k++) { const a = Math.PI/4 + k*Math.PI/2; S.push({p: [1400*Math.cos(a) + 300, -2900, 1400*Math.sin(a)], tag: 'CORRIDOR'}); }
  S.push({p: [5600, 300, 2300], tag: 'PICKET'}, {p: [5600, 300, -2300], tag: 'PICKET'});
  return S.map((s, i) => Object.assign(s, {i}));
})();
// Where each approach vector brings the enemy in: centre, and the spread round it (m); and where their bombers cut in.
const WAR_VEC = {
  hole:   {name: 'GARGANTUA', c: [10800, 900, 0], s: [1200, 2200, 4200], mid: [2600, -1600, 0]},
  pro:    {name: 'PROGRADE', c: [1800, 600, 10500], s: [2600, 1800, 1000], mid: [900, -1800, 2400]},
  retro:  {name: 'RETROGRADE', c: [1800, 600, -10500], s: [2600, 1800, 1000], mid: [900, -1800, -2400]},
  zenith: {name: 'ZENITH', c: [2400, 9800, 0], s: [2600, 800, 2600], mid: [1600, 900, 0]},
  flank:  {name: 'ASTERN', c: [-10200, 1200, 0], s: [1000, 2000, 4000], mid: [-2200, -1800, 0]},
};
// the campaign: groups are [class, count, vector, seconds after the wave starts]
const WAR_WAVES = [
  {t: 'FIRST CONTACT', s: 'BOMBERS INBOUND FROM THE GLARE', g: [['locust', 4, 'hole', 3], ['wasp', 2, 'hole', 10]]},
  {t: 'THE SCREEN', s: 'FIGHTERS ESCORTING BOMBERS', g: [['locust', 6, 'hole', 3], ['wasp', 4, 'hole', 6], ['locust', 3, 'hole', 24]]},
  {t: 'PINCER', s: 'A SECOND FORMATION FROM PROGRADE', g: [['locust', 5, 'hole', 3], ['locust', 4, 'pro', 14], ['wasp', 5, 'hole', 6]]},
  {t: 'THE FRIGATE', s: 'DOMINION FRIGATE · SHIELDS UP · MISSILES', g: [['frigate', 1, 'hole', 2], ['locust', 6, 'hole', 8], ['wasp', 4, 'hole', 12]]},
  {t: 'SWARM', s: 'THEY ARE COMING FROM EVERYWHERE', g: [['locust', 10, 'hole', 3], ['wasp', 8, 'retro', 8], ['locust', 4, 'zenith', 24]]},
  {t: 'IRON RAIN', s: 'MANTIS DROPSHIPS · TROOPS FOR MILLER', g: [['mantis', 2, 'hole', 4], ['locust', 8, 'hole', 3], ['wasp', 6, 'hole', 9], ['locust', 4, 'pro', 26]]},
  {t: 'TWIN FRIGATES', s: 'TWO CAPITAL SHIPS', g: [['frigate', 2, 'hole', 2], ['locust', 8, 'pro', 10], ['wasp', 6, 'hole', 14], ['locust', 6, 'retro', 28]]},
  {t: 'THE CRUISER', s: 'DOMINION CRUISER · LAUNCHING FIGHTERS', g: [['cruiser', 1, 'hole', 2], ['locust', 10, 'hole', 10], ['mantis', 2, 'retro', 22]]},
  {t: 'STORM FRONT', s: 'THREE VECTORS AT ONCE', g: [['frigate', 1, 'retro', 2], ['locust', 14, 'hole', 4], ['wasp', 10, 'pro', 8], ['mantis', 3, 'hole', 18]]},
  {t: 'THE HAMMER', s: 'A BATTLE GROUP', boss: true, g: [['cruiser', 1, 'hole', 2], ['frigate', 2, 'hole', 8], ['locust', 12, 'hole', 12], ['wasp', 8, 'zenith', 16], ['mantis', 2, 'pro', 30]]},
  {t: 'NIGHTFALL', s: 'CONTACTS ASTERN · FROM MILLER\'S SHADOW', g: [['locust', 18, 'flank', 3], ['wasp', 13, 'flank', 8], ['frigate', 1, 'hole', 10]]},
  {t: 'LANDING PARTY', s: 'SIX DROPSHIPS', g: [['mantis', 8, 'hole', 4], ['locust', 13, 'pro', 8], ['wasp', 13, 'hole', 10], ['frigate', 1, 'retro', 16]]},
  {t: 'CROSSFIRE', s: 'CRUISERS PROGRADE AND RETROGRADE', g: [['cruiser', 1, 'pro', 2], ['cruiser', 1, 'retro', 6], ['locust', 16, 'hole', 10], ['wasp', 13, 'hole', 14]]},
  {t: 'THE GAUNTLET', s: 'THREE FRIGATES AND A SWARM', g: [['frigate', 3, 'hole', 2], ['locust', 26, 'hole', 6], ['mantis', 5, 'zenith', 20], ['wasp', 16, 'hole', 10]]},
  {t: 'THE SOVEREIGN', s: 'DOMINION DREADNOUGHT · SUNDER CANNON', boss: true, g: [['sovereign', 1, 'hole', 3], ['locust', 18, 'hole', 12], ['wasp', 16, 'hole', 16], ['mantis', 4, 'retro', 30]]},
  {t: 'SCORCHED SKY', s: 'TWO CRUISERS', g: [['cruiser', 2, 'hole', 2], ['locust', 12, 'pro', 8], ['locust', 12, 'retro', 8], ['wasp', 18, 'hole', 12]]},
  {t: 'NO QUARTER', s: 'FOUR FRIGATES · EVERY VECTOR', g: [['frigate', 2, 'pro', 2], ['frigate', 2, 'retro', 2], ['mantis', 8, 'hole', 10], ['locust', 26, 'flank', 14], ['wasp', 18, 'zenith', 18]]},
  {t: 'BLACK TIDE', s: 'THE FLEET COMMITS', g: [['cruiser', 1, 'hole', 2], ['frigate', 2, 'hole', 2], ['locust', 34, 'hole', 6], ['mantis', 8, 'pro', 18], ['wasp', 21, 'hole', 10]]},
  {t: 'LAST LIGHT', s: 'THE SOVEREIGN RETURNS', boss: true, g: [['sovereign', 1, 'retro', 3], ['cruiser', 1, 'pro', 6], ['locust', 29, 'hole', 10], ['mantis', 8, 'zenith', 20], ['wasp', 21, 'flank', 14]]},
  {t: 'THE ARMADA', s: 'EVERYTHING THEY HAVE', boss: true, g: [['sovereign', 1, 'hole', 3], ['cruiser', 2, 'hole', 8], ['frigate', 3, 'pro', 12], ['locust', 39, 'hole', 6],
    ['mantis', 10, 'retro', 20], ['wasp', 26, 'hole', 10], ['locust', 21, 'flank', 30]]},
];
const WAR_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// Bolt pool rows (WB): p(3) v(3) p-at-step-start(3) life team kind dmg streak shooter-id.  Kinds: 0 autocannon, 1 fighter round, 2 flak,
// 3 rail slug, 4 heavy slug (ours), 5 heavy round (theirs), 6 Hawk round.
// FX rows (WF, combat.js's layout, so the same sprite mapping draws them): p(3) v(3) t0 life kind size grow seed colour(3)
// vec(3). Kinds: 0 glow, 1 flash, 2 fireball, 3 smoke, 4 shockwave ring (vec = axis), 5 shield hit (vec = normal), 6 spark
// (vec = ejecta, m/s), 7 warp (vec = the way it came), 8 ember.
const WB = 15, WF = 18;
const WAR = {
  t: 0, phase: 'setup', diff: 'veteran', D: WAR_DIFF.veteran, speed: 1, paused: false,
  ents: [], msl: [], beams: [], streaks: [], shards: [], trails: [], strikes: [], events: [], fields: [],
  B: new Float64Array(WAR_T.NB*WB), nb: 0, F: new Float64Array(WAR_T.NFX*WF), nf: 0,
  slots: WAR_SLOTS.map(s => ({i: s.i, p: s.p, tag: s.tag, e: null})),
  cr: 0, aegis: 100, wave: 0, waveT: 0, buildT: 0, queue: [], station: null,
  up: {armor: 0, shield: 0, pd: 0, battery: 0, hangar: 0, reactor: 0, sensors: 0, nova: 0, lance: 0},
  squads: 0, ab: {nova: {cd: 0, charge: -1, tgt: null}, lance: {cd: 0, charge: -1, tgt: null, from: null}, sunder: []},
  stats: null, idN: 1, rnd: mulberry(1), flash: 0, rm: false, endless: false, over: null, streakN: 1,
};

// ------------------------------------------------------------------------------------------ small helpers
const wDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function wRandDir(){ const R = WAR.rnd, z = R()*2 - 1, a = R()*2*Math.PI, s = Math.sqrt(1 - z*z); return [s*Math.cos(a), s*Math.sin(a), z]; }
function wJitter(d, ang){ const q = wRandDir(), k = Math.tan(ang)*Math.sqrt(WAR.rnd()); return V.norm(V.add(d, V.mul(V.sub(q, V.mul(d, V.dot(q, d))), k))); }
function wEv(type, o){ const e = o || {}; e.type = type; WAR.events.push(e); return e; }
// ship-local metres (+x = u x f, +y dorsal, +z bow) -> sector metres; and directions
function wAt(e, l){
  const f = e.f, u = e.u, s = e.scale || 1, rx = u[1]*f[2] - u[2]*f[1], ry = u[2]*f[0] - u[0]*f[2], rz = u[0]*f[1] - u[1]*f[0];
  return [e.p[0] + (rx*l[0] + u[0]*l[1] + f[0]*l[2])*s, e.p[1] + (ry*l[0] + u[1]*l[1] + f[1]*l[2])*s, e.p[2] + (rz*l[0] + u[2]*l[1] + f[2]*l[2])*s];
}
function wDir(e, l){ const f = e.f, u = e.u, r = V.cross(u, f); return V.add(V.add(V.mul(r, l[0]), V.mul(u, l[1])), V.mul(f, l[2])); }
function wToLocal(e, d){ const r = V.cross(e.u, e.f); return [V.dot(d, r), V.dot(d, e.u), V.dot(d, e.f)]; }
// quaternions [x, y, z, w] (ships.js's convention)
const wQMul = (a, b) => [a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1], a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
  a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3], a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2]];
const wQRot = (q, v) => { const t = V.mul(V.cross(q, v), 2); return V.add(V.add(v, V.mul(t, q[3])), V.cross(q, t)); };
const wQInv = q => [-q[0], -q[1], -q[2], q[3]];
// a vector v in a turret's frame trained to (yaw about +y, then pitch up): as ships.js draws it (qYaw * qPitch(-pitch))
function wTurn2(v, yaw, pitch){
  const cp = Math.cos(pitch), sp = Math.sin(pitch), y1 = v[1]*cp + v[2]*sp, z1 = -v[1]*sp + v[2]*cp, cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [v[0]*cy + z1*sy, y1, -v[0]*sy + z1*cy];
}
function wYPQuat(yaw, pitch){ const hy = yaw/2, hp = -pitch/2, a = Math.cos(hy), b = Math.sin(hy), c = Math.cos(hp), s = Math.sin(hp); return [a*s, b*c, -b*s, a*c]; }

// Direction to fire a round of `speed` from p (moving at v) at a target at q moving at w: the intercept; null if it cannot.
function wLead(p, v, q, w, speed){
  const rx = q[0] - p[0], ry = q[1] - p[1], rz = q[2] - p[2], ux = w[0] - v[0], uy = w[1] - v[1], uz = w[2] - v[2];
  const a = ux*ux + uy*uy + uz*uz - speed*speed, b = 2*(rx*ux + ry*uy + rz*uz), c = rx*rx + ry*ry + rz*rz;
  let t;
  if (Math.abs(a) < 1e-6) t = b < 0 ? -c/b : -1;
  else { const D = b*b - 4*a*c; if (D < 0) return null; const s = Math.sqrt(D), t1 = (-b - s)/(2*a), t2 = (-b + s)/(2*a); t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : Math.max(t1, t2); }
  if (!(t > 0)) return null;
  const x = rx + ux*t, y = ry + uy*t, z = rz + uz*t, l = Math.hypot(x, y, z) || 1;
  return {dir: [x/l, y/l, z/l], t};
}
// Fly an assisted craft dt: v -> vcmd with time constant tau and an acceleration limit (no gravity in the sector)
function wFly(e, dt, tau, acc){
  const c = e.vcmd, k = Math.min(1, dt/tau);
  let ax = (c[0] - e.v[0])*k/dt, ay = (c[1] - e.v[1])*k/dt, az = (c[2] - e.v[2])*k/dt;
  const l = Math.hypot(ax, ay, az); if (l > acc) { const s = acc/l; ax *= s; ay *= s; az *= s; }
  const vx = e.v[0] + ax*dt, vy = e.v[1] + ay*dt, vz = e.v[2] + az*dt;
  e.p = [e.p[0] + (e.v[0] + vx)*0.5*dt, e.p[1] + (e.v[1] + vy)*0.5*dt, e.p[2] + (e.v[2] + vz)*0.5*dt];
  e.v = [vx, vy, vz];
}
// turn e's nose toward unit `want` by at most maxA rad; the dorsal settles toward the sector's up (fighters bank into turns)
function wTurn(e, want, maxA, bank, dt){
  const f = e.f, c = clamp(V.dot(f, want), -1, 1), ang = Math.acos(c);
  if (ang > 1e-6) {
    let ax = V.cross(f, want), l = V.len(ax);
    if (l < 1e-9) { ax = e.u; l = 1; }
    const k = Math.min(ang, maxA), axis = V.mul(ax, 1/l);
    e.f = V.norm(V.rot(f, axis, k)); e.u = V.rot(e.u, axis, k);
  }
  const up = [0, 1, 0], side = V.cross(e.f, up);
  let ut = V.sub(up, V.mul(e.f, V.dot(up, e.f)));
  if (bank) ut = V.add(ut, V.mul(side, clamp(V.dot(want, side)*bank*3, -2.5, 2.5)));
  if (V.len(ut) < 1e-6) ut = e.u;
  const kk = 1 - Math.exp(-dt*(bank ? 4 : 1.5));
  e.u = V.add(e.u, V.mul(V.sub(V.norm(ut), e.u), kk));
  [e.f, e.u] = QV.ortho(e.f, e.u);
}
// Swept segment a -> b (relative to e.p, metres) against e's hit ellipsoid (grown by `grow`): the hit fraction or -1
function wSegHit(ax, ay, az, bx, by, bz, e, grow){
  const K = SHIP_KIT[WAR_CLS[e.cls].mesh], ext = K.hit, s = (e.scale || 1)*(grow || 1), ex = ext[0]*s, ey = ext[1]*s, ez = ext[2]*s;
  if (K.hitC) { const c = wDir(e, K.hitC), sc = e.scale || 1; ax -= c[0]*sc; ay -= c[1]*sc; az -= c[2]*sc; bx -= c[0]*sc; by -= c[1]*sc; bz -= c[2]*sc; }
  const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx*dx + dy*dy + dz*dz;
  const tc = L2 > 1e-12 ? clamp(-(ax*dx + ay*dy + az*dz)/L2, 0, 1) : 0, cx = ax + dx*tc, cy = ay + dy*tc, cz = az + dz*tc, rm = Math.max(ex, ey, ez);
  if (cx*cx + cy*cy + cz*cz > rm*rm) return -1;
  const f = e.f, u = e.u, rx = u[1]*f[2] - u[2]*f[1], ry = u[2]*f[0] - u[0]*f[2], rz = u[0]*f[1] - u[1]*f[0];
  const A0 = (ax*rx + ay*ry + az*rz)/ex, A1 = (ax*u[0] + ay*u[1] + az*u[2])/ey, A2 = (ax*f[0] + ay*f[1] + az*f[2])/ez;
  const D0 = (dx*rx + dy*ry + dz*rz)/ex, D1 = (dx*u[0] + dy*u[1] + dz*u[2])/ey, D2 = (dx*f[0] + dy*f[1] + dz*f[2])/ez;
  const qa = D0*D0 + D1*D1 + D2*D2, qb = 2*(A0*D0 + A1*D1 + A2*D2), qc = A0*A0 + A1*A1 + A2*A2 - 1;
  if (qc < 0) return 0;
  const D = qb*qb - 4*qa*qc;
  if (D < 0 || qa < 1e-18) return -1;
  const t = (-qb - Math.sqrt(D))/(2*qa);
  return t >= 0 && t <= 1 ? t : -1;
}
// the target's centre for aiming (a hull with an offset hit ellipsoid: its middle)
function wAim(e){ const K = SHIP_KIT[WAR_CLS[e.cls].mesh]; return K.hitC ? wAt(e, K.hitC) : e.p; }
// the size of a hull (m): the hit ellipsoid's largest half extent
function wRad(e){ const h = SHIP_KIT[WAR_CLS[e.cls].mesh].hit; return Math.max(h[0], h[1], h[2])*(e.scale || 1); }

// ------------------------------------------------------------------------------------------ pools
function wBolt(p, v, team, kind, life, dmg, streak, src){
  const W = WAR; if (W.nb >= WAR_T.NB) return;
  const B = W.B, o = W.nb++*WB;
  B[o] = B[o+6] = p[0]; B[o+1] = B[o+7] = p[1]; B[o+2] = B[o+8] = p[2]; B[o+3] = v[0]; B[o+4] = v[1]; B[o+5] = v[2];
  B[o+9] = life; B[o+10] = team; B[o+11] = kind; B[o+12] = dmg; B[o+13] = streak || 0; B[o+14] = src || 0;
}
function wFx(kind, p, v, life, size, grow, col, vec, seed){
  const W = WAR; if (W.nf >= WAR_T.NFX) return;
  const F = W.F, o = W.nf++*WF, v0 = v || [0, 0, 0];
  F[o] = p[0]; F[o+1] = p[1]; F[o+2] = p[2]; F[o+3] = v0[0]; F[o+4] = v0[1]; F[o+5] = v0[2];
  F[o+6] = W.t; F[o+7] = life; F[o+8] = kind; F[o+9] = size; F[o+10] = grow || 0; F[o+11] = seed == null ? W.rnd() : seed;
  F[o+12] = col ? col[0] : 1; F[o+13] = col ? col[1] : 1; F[o+14] = col ? col[2] : 1;
  F[o+15] = vec ? vec[0] : 0; F[o+16] = vec ? vec[1] : 0; F[o+17] = vec ? vec[2] : 0;
}
// Flash, fireball, sparks, smoke, an optional shockwave ring and burning debris, all moving with the thing that blew up
function wBoom(p, v, size, o){
  o = o || {};
  const W = WAR, R = W.rnd, v0 = v || [0, 0, 0];
  wFx(1, p, v0, 0.3 + size*0.0012, size*(o.flash || 2.2), 0, o.col || [1.4, 1.1, 0.8]);
  wFx(2, p, v0, 1.4 + size*0.004, size, size*1.2, [1, 1, 1]);
  const ns = o.sparks == null ? Math.round(12 + 40*Math.min(size/100, 1.5)) : o.sparks;
  for (let k = 0; k < ns; k++) { const d = wRandDir(), s = size*(1.5 + R()*5); wFx(6, p, V.add(v0, V.mul(d, s)), 0.6 + R()*1.4, size*0.004 + 0.4, 0, null, V.mul(d, s)); }
  for (let k = 0; k < (o.smoke == null ? 3 : o.smoke); k++) {
    const q = V.add(p, V.mul(wRandDir(), size*0.5*R()));
    wFx(3, q, V.add(v0, V.mul(wRandDir(), size*0.4*R())), 2.2 + R()*1.6, size*0.75, size*1.1, [0.5, 0.46, 0.43]);
  }
  if (o.ring) wFx(4, p, v0, 5, size, size*9, [2.6, 1.9, 1.4], V.norm(V.add([0, 1, 0], V.mul(wRandDir(), 0.5))));
  for (let k = 0; k < (o.shards || 0) && W.shards.length < 120; k++) {
    const d = wRandDir(), s = size*(0.6 + R()*2.2);
    W.shards.push({p: V.add(p, V.mul(d, size*0.2)), v: V.add(v0, V.mul(d, s)), f: wRandDir(), u: wRandDir(), spin: V.mul(wRandDir(), 1 + R()*4),
      scale: size*(0.03 + R()*0.06)*(o.shardK || 1), t0: W.t, life: 5 + R()*6, team: o.team == null ? 1 : o.team});
  }
  if (!o.quiet) wEv('boom', {size, p});
}
function wWarpFx(p, size, dir, out){ wFx(7, p, [0, 0, 0], 0.9, Math.max(size, 12), 0, out ? [1.6, 2.0, 2.8] : [2, 2.4, 3], dir); }

// ------------------------------------------------------------------------------------------ fighter trails
// Points dropped at 45 Hz along the frame's path, left at rest in the sector (the gas stops; the craft flies on); 0.9 s long.
const WAR_TRAIL = {n: 48, rate: 45, life: 0.9};
function wTrails(e, dt){
  const T = WAR_TRAIL, W = WAR, K = SHIP_KIT[WAR_CLS[e.cls].mesh];
  let tr = e.tr; if (!tr) tr = e.tr = {P: new Float64Array(T.n*3), T: new Float64Array(T.n).fill(-99), head: 0, acc: 0, e, team: e.team};
  const q = wAt(e, K.engines[0].p), off = [q[0] - e.p[0], q[1] - e.p[1], q[2] - e.p[2]];
  tr.acc += dt;
  while (tr.acc >= 1/T.rate) {
    tr.acc -= 1/T.rate;
    const k = dt > 0 ? 1 - tr.acc/dt : 1, o = tr.head*3;
    for (let i = 0; i < 3; i++) tr.P[o+i] = e.po[i] + (e.p[i] - e.po[i])*k + off[i];
    tr.T[tr.head] = W.t - tr.acc; tr.head = (tr.head + 1) % T.n;
  }
}

// ------------------------------------------------------------------------------------------ shields
// A shielded hull wears a shell (shipkit.js shellFit; the AEGIS field a scaled unit sphere) and keeps up to 4 ripples {d:
// unit-sphere direction in the shell's frame, t0, fl}: where the round's path ENTERED the shell, or straight in from a burst.
function wShellDir(S, e, a, b, sc){
  const x = V.cross(e.u, e.f), loc = p => [(V.dot(p, x)/sc - S.c[0])/S.r[0], (V.dot(p, e.u)/sc - S.c[1])/S.r[1], (V.dot(p, e.f)/sc - S.c[2])/S.r[2]], A = loc(a);
  if (b) { const Bq = loc(b), d = V.sub(Bq, A), qa = V.dot(d, d), qb = 2*V.dot(A, d), qc = V.dot(A, A) - 1, D = qb*qb - 4*qa*qc;
    if (qa > 1e-12 && D >= 0) { const t = (-qb - Math.sqrt(D))/(2*qa); if (t >= 0 && t <= 1) return V.norm(V.add(A, V.mul(d, t))); }
    return V.norm(Bq); }
  return V.norm(A);
}
function wRipple(R, S, e, a, b, sc){
  const d = wShellDir(S, e, a, b, sc || 1), t = WAR.t, near = Math.cos(15*DEG);
  for (const q of R) if (t - q.t0 < 0.2 && V.dot(q.d, d) > near) { q.fl = t; return; }
  let k = R.length; if (k >= 4) { k = 0; for (let i = 1; i < R.length; i++) if (R[i].t0 < R[k].t0) k = i; }
  R[k] = {d, t0: t, fl: t};
}
function wShell(e){ const b = shipKitBuild(WAR_CLS[e.cls].mesh); return b.shell || null; }

// ------------------------------------------------------------------------------------------ the campaign
function warStats(){
  const W = WAR, up = W.up, st = W.station;
  if (!st) return;
  const hp0 = WAR_CLS.bastion.hp*(1 + 0.4*up.armor), sh0 = WAR_CLS.bastion.sh*(1 + 0.5*up.shield);
  if (st.hpMax) { st.hp *= hp0/st.hpMax; st.sh = Math.min(sh0, st.sh*sh0/Math.max(st.shMax, 1)); } else { st.hp = hp0; st.sh = sh0; }
  st.hpMax = hp0; st.shMax = sh0; st.regen = WAR_CLS.bastion.regen*(1 + 0.4*up.shield);
  const pd = Math.min(8, 2 + 2*up.pd), K = SHIP_KIT.bastion;
  while (st.tur.length < pd + 2) { const T = st.tur.length < 2 ? K.heavy[st.tur.length] : K.pd[st.tur.length - 2]; st.tur.push(wTurret(T, st.tur.length < 2 ? 'dturretL' : 'dturretPD')); }
  for (let i = 0; i < st.tur.length; i++) st.tur[i].on = i < 2 ? i < Math.min(2, up.battery) : i - 2 < pd;
  W.rangeK = 1 + 0.08*up.sensors;
}
function wTurret(T, cls){ return {pivot: T.pivot, mount: T.mount, q: MOUNT_Q[T.mount], cls, yaw: 0, pitch: 0.05, cool: WAR.rnd()*0.5, tgt: null, reT: 0, side: 0, on: true, heat: 0, pulse: 0}; }
// a new war (diff: recruit | veteran | admiral); a save to resume instead, if given
function warNew(diff, save, seed){
  const W = WAR;
  W.diff = WAR_DIFF[diff] ? diff : 'veteran'; W.D = WAR_DIFF[W.diff];
  W.rnd = mulberry(seed == null ? (Date.now() & 0x7fffffff) : seed);
  W.t = 0; W.ents = []; W.msl = []; W.beams = []; W.streaks = []; W.shards = []; W.trails = []; W.strikes = []; W.events = []; W.nb = 0; W.nf = 0;
  W.slots.forEach(s => { s.e = null; }); W.queue = []; W.over = null; W.endless = false; W.flash = 0; W.paused = false;
  W.up = {armor: 0, shield: 0, pd: 0, battery: 0, hangar: 0, reactor: 0, sensors: 0, nova: 0, lance: 0};
  W.squads = 0; W.ab = {nova: {cd: 0, charge: -1, tgt: null}, lance: {cd: 0, charge: -1, tgt: null, from: null}, sunder: []};
  W.stats = {kills: 0, byCls: {}, lost: 0, breaches: 0, earned: 0, spent: 0, time: 0, best: 0};
  W.cr = W.D.cr; W.aegis = 100; W.wave = 0;
  const st = W.station = wSpawn('bastion', [0, 0, 0], [1, 0, 0], 0);
  st.tur = []; st.ring = 0; st.hpMax = 0; st.shMax = 0; warStats();
  if (save) warLoad(save);
  W.phase = 'build'; W.buildT = save ? WAR_T.BUILD : WAR_T.BUILD_FIRST;
  wHawksDock(true);
  wEv('newWar', {diff: W.diff, wave: W.wave + 1, resumed: !!save});
  return true;
}
// what the next wave brings: [{cls, n, vec, at}] (count scaled by difficulty; capitals never multiply)
function warWavePlan(n){
  const W = WAR, D = W.D;
  let def = WAR_WAVES[n - 1];
  if (!def) {                                                                  // endless: a budget, doubling every ~6 waves
    const R = mulberry(n*7919), k = Math.min(3, Math.pow(1.12, n - 20)), vec = ['hole', 'pro', 'retro', 'zenith', 'flank'], pick = () => vec[Math.floor(R()*vec.length)];   // (capped: a class draws at most 256)
    def = {t: 'WAVE ' + n, s: 'THE WAR GOES ON', g: [['locust', Math.round(26*k), pick(), 4], ['wasp', Math.round(16*k), pick(), 10], ['mantis', Math.round(6*k), pick(), 16],
      ['cruiser', 1 + Math.floor(R()*2*k), 'hole', 2], ['frigate', 2 + Math.floor(R()*2*k), pick(), 8]].concat(n % 5 === 0 ? [['sovereign', 1, pick(), 3]] : []), boss: n % 5 === 0};
  }
  return {t: def.t, s: def.s, boss: !!def.boss, g: def.g.map(([cls, cnt, vec, at]) => ({cls, vec, at, n: WAR_CLS[cls].kind === 'capital' ? cnt : Math.max(1, Math.round(cnt*D.n))}))};
}
function warLaunch(early){
  const W = WAR;
  if (W.phase !== 'build') return false;
  if (early && W.buildT > 1) { const b = Math.round(W.buildT*WAR_T.EARLY); W.cr += b; W.stats.earned += b; wEv('credits', {amt: b, why: 'EARLY LAUNCH'}); }
  W.wave++; W.phase = 'wave'; W.waveT = 0;
  const plan = warWavePlan(W.wave);
  W.queue = [];
  for (const g of plan.g) {
    const V0 = WAR_VEC[g.vec], R = W.rnd, capital = WAR_CLS[g.cls].kind === 'capital';
    const c = [V0.c[0] + (R() - 0.5)*V0.s[0], V0.c[1] + (R() - 0.5)*V0.s[1], V0.c[2] + (R() - 0.5)*V0.s[2]];
    if (capital) { const k = 0.72; c[0] *= k; c[1] *= k; c[2] *= k; }                // capitals jump in closer: they come to stand off
    const lead = {n: g.n, vec: g.vec, c, id: W.idN++};
    for (let k = 0; k < g.n; k++) {
      const sp = capital ? 380*k : 260, off = capital ? [(R() - 0.5)*2*sp, (R() - 0.5)*sp, (R() - 0.5)*2*sp] : [(R() - 0.5)*2*sp*Math.sqrt(g.n), (R() - 0.5)*sp*Math.sqrt(g.n), (R() - 0.5)*2*sp*Math.sqrt(g.n)];
      W.queue.push({cls: g.cls, at: g.at + k*(capital ? 5 : 0.32) + R()*0.2, p: V.add(c, off), vec: g.vec, grp: lead});
    }
  }
  W.queue.sort((a, b) => a.at - b.at);
  W.plan = plan;
  wHawksLaunch();
  wEv('waveStart', {n: W.wave, t: plan.t, s: plan.s, boss: plan.boss, count: W.queue.length, final: W.wave === WAR_WAVES.length});
  return true;
}
function wWaveOver(){
  const W = WAR, n = W.wave, bonus = Math.round((120 + 22*n)*W.D.pay);
  W.cr += bonus; W.stats.earned += bonus;
  const st = W.station, fix = Math.min(st.hpMax - st.hp, st.hpMax*WAR_T.REPAIR);
  if (fix > 0) st.hp += fix;
  const ag = Math.min(100 - W.aegis, WAR_T.AEGIS_REGEN); W.aegis += ag;
  st.sh = st.shMax;
  W.stats.best = Math.max(W.stats.best, n);
  W.phase = 'build'; W.buildT = WAR_T.BUILD;
  wHawksDock(false);
  wEv('waveClear', {n, bonus, repair: Math.round(fix), aegis: ag});
  if (n === WAR_WAVES.length && !W.endless) { W.endless = true; wEv('victory', {n}); }
}

// ------------------------------------------------------------------------------------------ entities
function wSpawn(cls, p, f, arrive, o){
  const W = WAR, c = WAR_CLS[cls], D = W.D;
  const up = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const e = {id: W.idN++, cls, team: c.team, kind: c.kind, p: p.slice(), v: [0, 0, 0], po: p.slice(), f: V.norm(f), u: V.norm(V.sub(up, V.mul(f, V.dot(up, V.norm(f))))),
    vcmd: [0, 0, 0], hp: 1, hpMax: 1, sh: 0, shMax: 0, alive: true, dying: -1, arrive: arrive || 0, inAt: arrive ? null : W.t, damage: 0, glow: 0.2,
    scale: c.scale || 1, seed: W.rnd(), hitT: -9, lastHit: -9, shR: null, shDown: null, ai: {mode: 'go', t: 0}, tur: [], kills: 0, w: {}};
  if (c.team === 1) { const g = 1 + 0.04*Math.max(0, W.wave - 1); e.hpMax = e.hp = c.hp*D.hp*g; e.shMax = e.sh = (c.sh || 0)*D.hp*g; }
  else if (c.hp) { e.hpMax = e.hp = c.hp; }
  if (c.kind === 'fighter' || c.kind === 'bomber') e.v = V.mul(e.f, c.spd*0.8);
  if (c.kind === 'capital') {
    const K = SHIP_KIT[c.mesh];
    e.tur = (K.turrets || []).map((q, i) => ({pivot: q.pivot, off: V.sub(q.tip, q.pivot), yaw: 0, pitch: 0.1, cool: 1 + W.rnd()*3, heavy: c.heavy && i % 2 === 0, q: [0, 0, 0, 1]}));
  }
  if (o) Object.assign(e, o);
  W.ents.push(e);
  return e;
}
function wHostiles(pred){ let n = 0; for (const e of WAR.ents) if (e.alive && e.team === 1 && e.dying < 0 && !e.wreck && (!pred || pred(WAR_CLS[e.cls]))) n++; return n + (pred ? 0 : WAR.queue.length); }
// arrivals from the queue: a warp flash and a streak along the way they came, the hull stretched from the nose
function wArrivals(){
  const W = WAR;
  while (W.queue.length && W.queue[0].at <= W.waveT) {
    const q = W.queue.shift(), c = WAR_CLS[q.cls], to = c.kind === 'bomber' ? WAR_VEC[q.vec].mid : [0, 0, 0];
    const f = V.norm(V.sub(to, q.p));
    const e = wSpawn(q.cls, q.p, f, W.t + 0.05, {grp: q.grp, vec: q.vec});
    e.ai = c.kind === 'bomber' ? {mode: 'run', wp: 0, path: wBomberPath(q), t: 0} : c.kind === 'fighter' ? {mode: 'escort', t: 0} : {mode: 'approach', t: 0};
    if (c.kind === 'capital') { e.ai.stand = wStandOff(q.vec, c); wEv('capArrive', {cls: q.cls, name: c.name, p: e.p, boss: !!c.boss}); }
  }
}
function wBomberPath(q){
  const R = WAR.rnd, V0 = WAR_VEC[q.vec], mid = V.add(V0.mid, [(R() - 0.5)*1800, (R() - 0.5)*900, (R() - 0.5)*1800]);
  const a = R()*2*Math.PI, r = Math.sqrt(R())*WAR_T.GATE_R*0.7, gate = [300 + r*Math.cos(a), WAR_T.BREACH_Y - 400, r*Math.sin(a)];
  return [mid, gate, [gate[0]*0.6, WAR_T.DIVE_Y - 2000, gate[2]*0.6]];
}
function wStandOff(vec, c){
  const R = WAR.rnd, V0 = WAR_VEC[vec], d = V.norm(V.mul(V0.c, 1)), side = V.norm(V.cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const r = c.stand[0] + R()*(c.stand[1] - c.stand[0]);
  return V.add(V.add(V.mul(d, r), V.mul(side, (R() - 0.5)*2400)), [0, 300 + R()*700, 0]);
}

// ------------------------------------------------------------------------------------------ building
function warBuild(slot, type){
  const W = WAR, S = W.slots[slot], P = WAR_PLAT[type];
  if (!S || S.e || !P || W.phase === 'setup' || W.over) return false;
  const cost = P.cost[0]; if (W.cr < cost) return false;
  W.cr -= cost; W.stats.spent += cost;
  const e = wSpawn(type, S.p, [1, 0, 0], W.t + 0.4, {slot, mk: 0, invest: cost, deploy: W.t + 2.6});
  e.hpMax = e.hp = P.hp[0]; wPlatformFit(e);
  S.e = e;
  wEv('build', {type, slot, name: WAR_CLS[type].name, p: S.p, cost});
  return e;
}
// the platform's weapons as the mark sets them
function wPlatformFit(e){
  const P = WAR_PLAT[e.cls], mk = e.mk, K = SHIP_KIT[e.cls];
  if (e.cls === 'sentinel') { while (e.tur.length < P.turrets[mk]) { const T = wTurret(K.turrets[e.tur.length], 'dturretS'); if (T.mount === 'port' || T.mount === 'stbd') T.lim = [-0.3, 1.3, 2.6]; e.tur.push(T); } }
  else if (e.cls === 'longbow') { if (!e.tur.length) e.tur.push({pivot: K.gun.pivot, mount: 'up', q: MOUNT_Q.up, cls: 'longbowGun', yaw: 0, pitch: 0, cool: 0, charge: 0, tgt: null, reT: 0, on: true, heat: 0, pulse: 0}); }
  else if (e.cls === 'hydra') { if (!e.tur.length) e.tur.push({pivot: K.launcher.pivot, mount: 'up', q: MOUNT_Q.up, cls: 'hydraLauncher', yaw: 0, pitch: 0.12, cool: 2, tgt: null, reT: 0, on: true, heat: 0, pulse: 0, fired: -9}); }
  else if (e.cls === 'aegis') { e.pool = e.poolMax = P.pool[mk]; e.fieldR = P.radius[mk]; }
}
function warRefit(e){
  const W = WAR, P = e && WAR_PLAT[e.cls];
  if (!P || !e.alive || e.mk >= 2 || W.over || W.slots[e.slot].e !== e) return false;
  const cost = P.cost[e.mk + 1]; if (W.cr < cost) return false;
  W.cr -= cost; W.stats.spent += cost; e.invest += cost;
  e.mk++; const f = P.hp[e.mk]/e.hpMax; e.hpMax = P.hp[e.mk]; e.hp = Math.min(e.hpMax, e.hp*f + (P.hp[e.mk] - P.hp[e.mk - 1]));
  wPlatformFit(e); e.deploy = W.t + 1.2;
  wFx(4, e.p, null, 1.1, wRad(e), wRad(e)*6, [0.6, 1, 1.8], [0, 1, 0]);
  wEv('refit', {type: e.cls, mk: e.mk, name: WAR_CLS[e.cls].name, p: e.p, cost});
  return true;
}
function warSell(e){
  const W = WAR;
  if (!e || !e.alive || e.kind !== 'platform' || W.over || W.slots[e.slot].e !== e) return false;
  const back = Math.round(e.invest*WAR_T.SELL);
  W.cr += back; W.stats.spent -= back;
  wWarpFx(e.p, wRad(e)*1.5, V.norm(V.sub(e.p, [0, 0, 0])), true);
  e.alive = false; W.slots[e.slot].e = null;
  wEv('sell', {type: e.cls, name: WAR_CLS[e.cls].name, amt: back, p: e.p});
  return true;
}
function warUpgrade(track){
  const W = WAR, U = WAR_UPG[track];
  if (!U || W.over || W.phase === 'setup') return false;
  const lv = W.up[track]; if (lv >= U.costs.length) return false;
  const cost = U.costs[lv]; if (W.cr < cost) return false;
  W.cr -= cost; W.stats.spent += cost; W.up[track]++;
  warStats();
  wFx(4, [0, 0, -20], null, 1.4, 60, 520, [0.5, 0.9, 1.6], [1, 0, 0]);                     // a ring runs out round the hub
  wEv('upgrade', {track, name: U.name, lv: W.up[track], cost});
  return true;
}
function warBuySquadron(){
  const W = WAR;
  if (W.over || W.phase === 'setup' || W.squads >= 1 + W.up.hangar || W.cr < WAR_SQUAD.cost) return false;
  W.cr -= WAR_SQUAD.cost; W.stats.spent += WAR_SQUAD.cost; W.squads++;
  wEv('squadron', {n: W.squads});
  if (W.phase === 'wave') wHawksLaunch(); else wHawksDock(true);
  return true;
}
// what things cost / refund, for the UI
function warCost(what, a){
  if (what === 'build') return WAR_PLAT[a].cost[0];
  if (what === 'refit') return a.mk < 2 ? WAR_PLAT[a.cls].cost[a.mk + 1] : null;
  if (what === 'sell') return Math.round(a.invest*WAR_T.SELL);
  if (what === 'upgrade') { const U = WAR_UPG[a]; return WAR.up[a] < U.costs.length ? U.costs[WAR.up[a]] : null; }
  if (what === 'squad') return WAR_SQUAD.cost;
  return null;
}

// ------------------------------------------------------------------------------------------ Hawks
// A squadron lives in the hangar between waves; each wave it launches out of the stern bay (toward the camera) and swings
// round. Lost Hawks are rebuilt by the next build phase. After a wave they fly home and dock.
function wHawksLaunch(){
  const W = WAR, want = W.squads*WAR_SQUAD.n, have = W.ents.filter(e => e.cls === 'hawk' && e.alive && e.dying < 0);
  const K = SHIP_KIT.bastion, bays = W.up.hangar >= 2 ? [K.hangar, K.hangar2] : [K.hangar];
  let k = 0;
  for (const h of have) { if (h.docked) { h.docked = false; wHawkOut(h, bays[k % bays.length], k); k++; } else if (h.ai.mode === 'home') h.ai = {mode: 'patrol', t: 0}; }
  for (let i = have.length; i < want; i++) { const h = wSpawn('hawk', [0, 0, 0], [-1, 0, 0], 0, {sq: Math.floor(i/WAR_SQUAD.n)}); wHawkOut(h, bays[k % bays.length], k); k++; }
}
function wHawkOut(h, bay, k){
  const W = WAR, st = W.station, p = wAt(st, bay);
  h.p = p.slice(); h.po = p.slice(); h.f = [-1, 0, 0]; h.u = [0, 1, 0]; h.v = [-120, 0, 0]; h.vcmd = [-150, 0, 0];
  h.hp = h.hpMax = WAR_CLS.hawk.hp; h.arrive = W.t + 0.2 + k*0.55; h.inAt = null; h.docked = false;
  h.ai = {mode: 'launch', t: 1.6 + W.rnd()*0.6, dir: V.norm([-1, (W.rnd() - 0.3)*0.5, (W.rnd() - 0.5)*0.8])};
  if (h.tr) { h.tr.T.fill(-99); }
}
function wHawksDock(now){
  const W = WAR, want = W.squads*WAR_SQUAD.n;
  let have = 0;
  for (const h of W.ents) if (h.cls === 'hawk' && h.alive && h.dying < 0) { have++; if (now) { h.docked = true; h.ai = {mode: 'docked', t: 0}; } else h.ai = {mode: 'home', t: 0}; }
  for (let i = have; i < want; i++) wSpawn('hawk', [0, 0, 0], [-1, 0, 0], 0, {docked: true, ai: {mode: 'docked', t: 0}, sq: Math.floor(i/WAR_SQUAD.n)});
}

// ------------------------------------------------------------------------------------------ targets
// candidates of the other side, alive and in the fight; score = distance scaled by a class preference (lower is better)
function wPick(from, team, range, pref, cur, withMsl){
  const W = WAR; let best = null, bs = Infinity;
  const r2 = range*range;
  for (const e of W.ents) {
    if (!e.alive || e.team === team || e.dying >= 0 || e.arrive > W.t || e.docked || e.dive > 1) continue;
    const dx = e.p[0] - from[0], dy = e.p[1] - from[1], dz = e.p[2] - from[2], d2 = dx*dx + dy*dy + dz*dz;
    if (d2 > r2) continue;
    const kk = pref[e.kind] != null ? pref[e.kind] : (pref.heavy != null && WAR_CLS[e.cls].heavy && e.kind === 'bomber') ? pref.heavy : null, k = kk == null ? 9 : kk; if (k >= 9) continue;
    const s = Math.sqrt(d2)*(1 + k) - (e === cur ? 400 : 0);
    if (s < bs) { bs = s; best = e; }
  }
  if (withMsl) for (const m of W.msl) {
    if (m.team === team || m.hp <= 0) continue;
    const d = wDist(m.p, from); if (d > range) continue;
    const s = d*(1 + (pref.missile == null ? 9 : pref.missile)); if (s < bs) { bs = s; best = m; }
  }
  return best;
}
const PREF_AC = {missile: 0, bomber: 0.2, fighter: 0.5, capital: 3};
const PREF_MSL = {bomber: 0, fighter: 0.4, capital: 2.5};
const PREF_RAIL = {capital: 0, heavy: 0.6};                              // (railguns never waste a slug on small craft)
const PREF_HEAVY = {capital: 0, bomber: 0.8, fighter: 6};
const PREF_HAWK = {bomber: 0, fighter: 0.3, capital: 8};
const PREF_FOE = {fighter: 0, platform: 0.4, station: 1.2};                // what Dominion guns go for
// a target's (inertial) velocity: missiles and hulls alike
const wVel = t => t.v || [0, 0, 0];

// ------------------------------------------------------------------------------------------ damage
// dmg to e (at `at`); kind: 'ac' | 'rail' | 'heavy' | 'msl' | 'beam' | 'enemy'; seg: the round's segment relative to e.p
function wDamage(e, dmg, at, kind, seg, by){
  const W = WAR, c = WAR_CLS[e.cls];
  if (!e.alive || e.dying >= 0 || e.arrive > W.t) return;
  e.hitT = W.t; e.lastHit = W.t;
  if (e.team === 1) {
    if (e.sh > 0) {
      const k = kind === 'ac' ? 0.6 : kind === 'rail' ? 0.8 : 1;
      e.sh = Math.max(0, e.sh - dmg*k);
      const S = wShell(e); if (S) wRipple(e.shR || (e.shR = []), S, e, seg ? seg[0] : V.sub(at, e.p), seg && seg[1], e.scale);
      if (e.sh <= 0) { e.shDown = W.t; wEv('capShields', {name: c.name, p: e.p}); }
      return;
    }
    const k = kind === 'rail' && c.kind === 'capital' ? 1.3 : 1;
    e.hp -= dmg*k;
    e.damage = Math.max(e.damage, (1 - Math.max(0, e.hp)/e.hpMax)*0.8);
    if (c.kind === 'capital' ? W.rnd() < 0.3 : W.rnd() < 0.6) wBoom(at, e.v, c.kind === 'capital' ? 8 + W.rnd()*10 : 4, {sparks: c.kind === 'capital' ? 12 : 6, smoke: c.kind === 'capital' ? 1 : 0, flash: 1.2, quiet: true});
    if (e.hp <= 0) wKill(e, by);
    return;
  }
  // ours: BASTION's shield first, then hull
  if (e.kind === 'station' && e.sh > 0) {
    e.sh = Math.max(0, e.sh - dmg);
    const S = wShell(e); if (S) wRipple(e.shR || (e.shR = []), S, e, seg ? seg[0] : V.sub(at, e.p), seg && seg[1], 1);
    if (e.sh <= 0) { e.shDown = W.t; wEv('shieldsDown', {}); }
    return;
  }
  e.hp -= dmg;
  e.damage = Math.max(e.damage, (1 - Math.max(0, e.hp)/e.hpMax)*0.8);
  if (W.rnd() < 0.5) wBoom(at, e.v, e.kind === 'station' ? 10 + W.rnd()*12 : 4 + W.rnd()*3, {sparks: 8, smoke: 1, flash: 1.3, quiet: true});
  if (e.kind === 'station') { wEv('stationHit', {amt: dmg}); if (e.hp <= e.hpMax*0.25 && !e.crit) { e.crit = true; wEv('stationCrit', {}); } }
  if (e.hp <= 0) wKill(e, by);
}
function wKill(e, by){
  const W = WAR, c = WAR_CLS[e.cls];
  if (e.team === 1) {
    const pay = Math.round((c.reward || 0)*W.D.pay);
    W.cr += pay; W.stats.earned += pay; W.stats.kills++; W.stats.byCls[e.cls] = (W.stats.byCls[e.cls] || 0) + 1;
    if (by && by.alive) by.kills = (by.kills || 0) + 1;
    wEv('kill', {cls: e.cls, name: c.name, p: e.p, pay, capital: c.kind === 'capital', by: by ? by.cls : null});
  } else {
    if (e.kind === 'platform') { W.slots[e.slot].e = null; W.stats.lost++; wEv('lost', {cls: e.cls, name: c.name, p: e.p}); }
    else if (e.kind === 'fighter') { W.stats.lost++; wEv('hawkLost', {p: e.p}); }
    else if (e.kind === 'station') { wStationDown(e); return; }
  }
  if (c.kind === 'capital') {
    e.dying = W.t; e.spin = V.mul(wRandDir(), 0.03 + W.rnd()*0.05);
    wEv('capDying', {name: c.name, p: e.p, id: e.id, boss: !!c.boss});
    return;
  }
  e.alive = false;
  wBoom(e.p, e.v, c.boom*(e.scale || 1), {sparks: e.kind === 'platform' ? 60 : 36, smoke: e.kind === 'platform' ? 4 : 2, shards: e.kind === 'platform' ? 10 : c.kind === 'fighter' ? 6 : 4,
    team: e.team, ring: e.kind === 'platform'});
}
// a capital that has lost its hull: fires inside it for 4.5 s, then the big one, and its wreck breaks up and drifts
function wDying(e, c, dt){
  const W = WAR, R = W.rnd, a = W.t - e.dying, sc = e.scale || 1;
  e.vcmd = V.mul(e.vcmd, Math.exp(-dt/2));
  if (e.spin) { const l = V.len(e.spin), ax = V.mul(e.spin, 1/l); e.f = V.rot(e.f, ax, l*dt); e.u = V.rot(e.u, ax, l*dt); [e.f, e.u] = QV.ortho(e.f, e.u); }
  e.damage = Math.min(1, 0.45 + a*0.15);
  const ext = SHIP_KIT[c.mesh].hit;
  if (a < 4.5 && R() < dt*(5 + a*4)) {
    const q = wAt(e, [(R()*2 - 1)*ext[0]*0.8, (R()*2 - 1)*ext[1], (R()*2 - 1)*ext[2]*0.9]);
    wBoom(q, e.v, ext[2]*sc*(0.05 + R()*0.1)*(1 + a*0.4), {sparks: 16, smoke: 1, shards: 1, shardK: 0.6});
  }
  if (a >= 4.5 && e.alive) {
    const big = ext[2]*sc;
    wBoom(e.p, e.v, big*0.9, {ring: true, sparks: 240, smoke: 10, flash: 3.4, shards: 24, shardK: 0.8});
    for (let k = 0; k < 6; k++) wBoom(wAt(e, [(R()*2 - 1)*ext[0], (R()*2 - 1)*ext[1], (R()*2 - 1)*ext[2]]), e.v, big*0.3, {sparks: 30, smoke: 2, quiet: true});
    const zs = [-ext[2]*1.2, -ext[2]*0.3 + (R() - 0.5)*ext[2]*0.2, ext[2]*0.35 + (R() - 0.5)*ext[2]*0.2, ext[2]*1.2];
    for (let k = 0; k < 3; k++) {
      const zc = (Math.max(zs[k], -ext[2]) + Math.min(zs[k + 1], ext[2]))/2, q = wAt(e, [0, 0, zc]), away = V.norm(V.add(V.mul(e.f, (k - 1)*1.4), V.mul(wRandDir(), 0.6)));
      W.ents.push({id: W.idN++, cls: e.cls, team: 1, kind: 'wreck', p: q, v: V.add(e.v, V.mul(away, 10 + R()*14)), po: q, f: e.f, u: e.u, vcmd: [0, 0, 0],
        hp: 1e9, hpMax: 1e9, sh: 0, alive: true, dying: -1, arrive: 0, damage: 1, glow: 0, scale: sc, wreck: true, t0: W.t, spin: V.mul(wRandDir(), 0.04 + R()*0.07), ai: {}, tur: [], seed: R(),
        clip: [zs[k], zs[k + 1]], zc: zc*sc});
    }
    e.alive = false; W.flash = Math.max(W.flash, 1);
    wEv('capBoom', {name: c.name, p: e.p, boss: !!c.boss});
  }
}
function wStationDown(e){
  const W = WAR;
  if (W.over) return;
  e.dying = W.t; e.hp = 0;
  W.over = {why: 'bastion', t: W.t, wave: W.wave};
  wEv('defeat', {why: 'bastion', wave: W.wave});
}

// ------------------------------------------------------------------------------------------ the Defence Force's guns
// a turret on hull e trains toward the lead on its target at `slew` rad/s and fires when on it; returns the barrel direction
// (sector) and tip when it may fire this frame, else null
function wTrain(e, T, dt, aimDir, slew, lim){
  const d = wQRot(wQInv(T.q), wToLocal(e, aimDir)), ty = Math.atan2(d[0], d[2]), tp0 = Math.atan2(d[1], Math.hypot(d[0], d[2]));
  const tp = clamp(tp0, lim ? lim[0] : -0.14, lim ? lim[1] : 1.3), ymax = lim && lim[2] != null ? lim[2] : 9;
  const tyC = clamp(Math.atan2(Math.sin(ty), Math.cos(ty)), -ymax, ymax);
  const dy = Math.atan2(Math.sin(tyC - T.yaw), Math.cos(tyC - T.yaw)), mx = slew*dt;
  T.yaw += clamp(dy, -mx, mx); T.pitch += clamp(tp - T.pitch, -mx, mx);
  return Math.abs(dy) < 0.04 && Math.abs(tp0 - T.pitch) < 0.04 && Math.abs(ty - tyC) < 1e-6;
}
function wBarrel(e, T, tip){
  const K = SHIP_KIT[T.cls], local = V.add(T.pivot, wQRot(T.q, wTurn2(tip || K.tip || [0, 0, 1], T.yaw, T.pitch))), dir = wQRot(T.q, wTurn2([0, 0, 1], T.yaw, T.pitch));
  return {at: wAt(e, local), dir: wDir(e, dir)};
}
// autocannon (Sentinel turrets, BASTION's point defence): alternate barrels, lead the target, rounds that hit missiles too
function wAutocannon(e, T, dt, range, rate, dmg, slew, team){
  const W = WAR;
  T.cool = Math.max(T.cool - dt, -dt); T.reT -= dt;                                        // (an idle gun banks no rounds)
  const pivotW = wAt(e, T.pivot);
  if (T.reT <= 0 || !T.tgt || (T.tgt.alive === false) || (T.tgt.hp != null && T.tgt.hp <= 0) || T.tgt.dying >= 0) { T.reT = 0.2; T.tgt = wPick(pivotW, team, range, PREF_AC, T.tgt, true); }
  const t = T.tgt; if (!t) { T.pulse *= Math.exp(-dt*6); return; }
  const L = wLead(pivotW, [0, 0, 0], t.p, wVel(t), WAR_W.ac.speed);
  if (!L || wDist(t.p, pivotW) > range*1.05) { T.tgt = null; return; }
  const on = wTrain(e, T, dt, L.dir, slew, T.lim);
  T.pulse *= Math.exp(-dt*8); T.heat = Math.max(0, T.heat - dt*0.35);
  if (!on || e.deploy > W.t) return;
  while (T.cool <= 0) {
    T.cool += 1/rate; T.side ^= 1;
    const K = SHIP_KIT[T.cls], B = wBarrel(e, T, K.tips[T.side]);
    wBolt(B.at, V.mul(wJitter(B.dir, WAR_W.ac.spread), WAR_W.ac.speed), 0, 0, WAR_W.ac.life, dmg, 0, e.id);
    wFx(1, B.at, null, 0.05, K.tip[1] > 5 ? 3 : 1.8, 0, [1.9, 2.3, 3.0]);
    T.pulse = 1; T.heat = Math.min(1, T.heat + 0.02);
    e.muzzle = {p: B.at, t: W.t};
  }
}
function wSentinel(e, dt){
  const P = WAR_PLAT.sentinel, mk = e.mk, rk = WAR.rangeK;
  const t0 = e.tur[0] && e.tur[0].tgt;
  wFace(e, t0 && t0.alive !== false ? V.norm(V.sub(t0.p, e.p)) : null, dt, WAR_CLS.sentinel.turn);
  for (const T of e.tur) wAutocannon(e, T, dt, P.range[mk]*rk, P.rate[mk], P.dmg[mk], P.slew[mk], 0);
  e.heat = Math.max(...e.tur.map(T => T.heat));
}
// a platform's hull swings (station-keeping thrusters) so its bow faces the fight; back to its rest attitude when idle
function wFace(e, want, dt, rate){
  if (!rate) return;
  const w = want || [1, 0, 0];
  const c = clamp(V.dot(e.f, w), -1, 1), ang = Math.acos(c);
  if (ang > 1e-4) { let ax = V.cross(e.f, w), l = V.len(ax); if (l < 1e-9) { ax = e.u; l = 1; } const k = Math.min(ang, rate*dt), a = V.mul(ax, 1/l);
    e.f = V.norm(V.rot(e.f, a, k)); e.u = V.rot(e.u, a, k); }
  let ut = V.sub([0, 1, 0], V.mul(e.f, e.f[1])); if (V.len(ut) < 1e-4) ut = e.u;
  e.u = V.add(e.u, V.mul(V.sub(V.norm(ut), e.u), 1 - Math.exp(-dt*1.2)));
  [e.f, e.u] = QV.ortho(e.f, e.u);
}
// LONGBOW: the hull turns its bow onto the target, the gun fine-aims (+-20 deg), the coils charge, the slug leaves at 9 km/s
function wLongbow(e, dt){
  const W = WAR, P = WAR_PLAT.longbow, mk = e.mk, T = e.tur[0], range = P.range[mk]*W.rangeK;
  T.reT -= dt;
  if (T.reT <= 0 || !T.tgt || !T.tgt.alive || T.tgt.dying >= 0) { T.reT = 0.5; T.tgt = wPick(e.p, 0, range, PREF_RAIL, T.tgt, false); }
  const t = T.tgt;
  T.charge = Math.min(1, T.charge + dt/P.charge[mk]); T.pulse = T.charge*T.charge; T.heat = Math.max(0, T.heat - dt*0.18);
  if (!t) { wFace(e, null, dt, WAR_CLS.longbow.turn); T.yaw *= Math.exp(-dt); T.pitch *= Math.exp(-dt); return; }
  const B0 = wBarrel(e, T, SHIP_KIT.longbow.gun.muzzle), L = wLead(B0.at, [0, 0, 0], wAim(t), wVel(t), WAR_W.rail.speed);
  if (!L) return;
  wFace(e, L.dir, dt, WAR_CLS.longbow.turn);
  const on = wTrain(e, T, dt, L.dir, 0.6, [-0.1, 0.36, 0.35]);
  if (!on || T.charge < 1 || e.deploy > W.t) return;
  const B = wBarrel(e, T, SHIP_KIT.longbow.gun.muzzle), sid = W.streakN++;
  wBolt(B.at, V.mul(B.dir, WAR_W.rail.speed), 0, 3, WAR_W.rail.life, P.dmg[mk], sid, e.id);
  W.streaks.push({id: sid, a: B.at, b: B.at, t0: W.t, end: -1, w: 2.2});
  T.charge = 0; T.heat = 1; T.fired = W.t;
  wFx(1, B.at, null, 0.12, 26, 0, [1.8, 2.2, 3.2]); wFx(4, B.at, null, 0.7, 6, 60, [1.2, 1.6, 2.4], B.dir);
  for (let k = 0; k < 10; k++) { const d = wJitter(B.dir, 0.5), s = 60 + W.rnd()*140; wFx(6, B.at, V.mul(d, s), 0.3 + W.rnd()*0.4, 0.5, 0, null, V.mul(d, s)); }
  e.muzzle = {p: B.at, t: W.t, big: true};
  wEv('rail', {p: B.at});
}
// HYDRA: the launcher trains on the target group; a salvo ripples out of the tubes, each missile its own target
function wHydra(e, dt){
  const W = WAR, P = WAR_PLAT.hydra, mk = e.mk, T = e.tur[0], range = P.range[mk]*W.rangeK;
  T.cool -= dt; T.reT -= dt; T.pulse *= Math.exp(-dt*3);
  if (T.reT <= 0 || !T.tgt || !T.tgt.alive || T.tgt.dying >= 0) { T.reT = 0.4; T.tgt = wPick(e.p, 0, range, PREF_MSL, T.tgt, false); }
  const t = T.tgt; if (!t) { T.yaw *= Math.exp(-dt*0.5); return; }
  const d = V.norm(V.sub(t.p, e.p));
  wFace(e, d, dt, WAR_CLS.hydra.turn);
  const on = wTrain(e, T, dt, V.norm(V.add(d, [0, 0.25, 0])), 1.4, [0, 0.2, 1.2]);
  if (T.cool > 0 || !on || e.deploy > W.t) return;
  T.cool = P.every[mk];
  // pick up to salvo/2 targets near the first, missiles shared among them
  const tg = [t]; for (const o of W.ents) { if (tg.length >= Math.ceil(P.salvo[mk]/2)) break; if (o !== t && o.alive && o.team === 1 && o.dying < 0 && o.arrive <= W.t && (o.kind === 'bomber' || o.kind === 'fighter') && wDist(o.p, t.p) < 1500) tg.push(o); }
  const tubes = SHIP_KIT.hydraLauncher.tubes;
  for (let k = 0; k < P.salvo[mk]; k++) {
    const tb = tubes[k % tubes.length], B = wBarrel(e, T, [tb[0], tb[1], 8.2]);
    W.msl.push({team: 0, kind: 'hydra', p: B.at, po: B.at, v: V.mul(B.dir, 60), f: B.dir, u: e.u, tgt: tg[k % tg.length], t: -k*0.14, ign: 0.25, spd: 60, trail: 0,
      hp: 1, dmg: P.dmg[mk], life: WAR_W.msl.life, src: e});
  }
  T.pulse = 1; T.fired = W.t;
  wEv('salvo', {p: e.p, n: P.salvo[mk]});
}
// AEGIS: the field regenerates; the ring turns faster while it is taking fire
function wAegis(e, dt){
  const P = WAR_PLAT.aegis;
  if (WAR.t - (e.fieldHit || -9) > 2) e.pool = Math.min(e.poolMax, e.pool + P.regen[e.mk]*dt);
  e.spinW = (e.spinW || 0.25) + ((WAR.t - (e.fieldHit || -9) < 1 ? 1.6 : 0.25) - (e.spinW || 0.25))*(1 - Math.exp(-dt*2));
  e.ringA = (e.ringA || 0) + e.spinW*dt;
}
// BASTION: the ring turns, point defence and the heavy batteries fight, the shield recharges, the Nova and the Lance fire
function wStation(e, dt){
  const W = WAR, rk = W.rangeK;
  e.ring = (e.ring || 0) + 0.075*dt;
  if (e.crit && e.hp > e.hpMax*0.3) { e.crit = false; wEv('stationStable', {}); }
  if (W.t - e.lastHit > 3 && e.sh < e.shMax && e.shDown == null) e.sh = Math.min(e.shMax, e.sh + e.regen*dt);
  if (e.shDown != null && W.t - e.shDown > 8) { e.shDown = null; e.sh = Math.max(e.sh, e.shMax*0.1); wEv('shieldsUp', {}); }
  let heat = 0;
  for (let i = 0; i < e.tur.length; i++) {
    const T = e.tur[i]; if (!T.on) { T.pulse = 0; continue; }
    if (i < 2) wHeavy(e, T, dt, rk); else wAutocannon(e, T, dt, WAR_W.pd.range*rk, WAR_W.pd.rate, WAR_W.pd.dmg, WAR_W.pd.slew, 0);
    heat = Math.max(heat, T.heat || 0);
  }
  e.heat = heat;
}
function wHeavy(e, T, dt, rk){
  const W = WAR, H = WAR_W.heavy;
  T.cool -= dt; T.reT -= dt; T.pulse *= Math.exp(-dt*4); T.heat = Math.max(0, (T.heat || 0) - dt*0.25);
  const pivotW = wAt(e, T.pivot);
  if (T.reT <= 0 || !T.tgt || !T.tgt.alive || T.tgt.dying >= 0) { T.reT = 0.5; T.tgt = wPick(pivotW, 0, H.range*rk, PREF_HEAVY, T.tgt, false); }
  const t = T.tgt; if (!t) return;
  const L = wLead(pivotW, [0, 0, 0], wAim(t), wVel(t), H.speed); if (!L) return;
  const on = wTrain(e, T, dt, L.dir, H.slew);
  if (!on || T.cool > 0) return;
  T.cool = 1/H.rate[Math.max(0, W.up.battery - 1)]; T.side ^= 1;
  const K = SHIP_KIT.dturretL, B = wBarrel(e, T, K.tips[T.side]);
  wBolt(B.at, V.mul(wJitter(B.dir, H.spread), H.speed), 0, 4, 2.6, H.dmg, 0, e.id);
  wFx(1, B.at, null, 0.1, 14, 0, [2.4, 2.0, 1.6]); wFx(3, B.at, V.mul(B.dir, 30), 1.2, 6, 20, [0.5, 0.5, 0.52]);
  T.pulse = 1; T.heat = Math.min(1, T.heat + 0.25);
  e.muzzle = {p: B.at, t: W.t, big: true};
  wEv('heavy', {p: B.at});
}
// abilities: the NOVA cannon (from the bow, charges 2.4 s) and the PLANETARY LANCE (from MILLER's surface)
function warAbility(name, tgt){
  const W = WAR, A = W.ab[name];
  if (!A || W.over || W.phase === 'setup' || !W.up[name] || A.cd > 0 || A.charge >= 0) return false;
  if (!tgt || !tgt.alive || tgt.team !== 1 || tgt.dying >= 0) tgt = warBiggest();
  if (!tgt) return false;
  A.tgt = tgt; A.charge = 0;
  if (name === 'lance') {                                                       // a battery on the surface below the target
    const R = ORB.planet.R, C = [0, -(R + ORB.ship.h), 0], dir = V.norm(V.add(V.norm(V.sub(tgt.p, C)), V.mul(V.norm([W.rnd() - 0.5, 0, W.rnd() - 0.5]), 0.06)));
    A.from = V.add(C, V.mul(dir, R + 2000));
  }
  wEv(name + 'Charge', {tgt: tgt.id, name: WAR_CLS[tgt.cls].name});
  return true;
}
function warBiggest(){ let b = null, bs = -1; for (const e of WAR.ents) { if (!e.alive || e.team !== 1 || e.dying >= 0 || e.arrive > WAR.t || e.wreck) continue;
  const s = (e.kind === 'capital' ? 1e6 : e.kind === 'bomber' ? 1e3 : 1)*(e.hp + e.sh)/(1 + wDist(e.p, [0, 0, 0])/1e4); if (s > bs) { bs = s; b = e; } } return b; }
function wAbilities(dt){
  const W = WAR, st = W.station, rk = 1 - 0.12*W.up.reactor;
  for (const name of ['nova', 'lance']) {
    const A = W.ab[name]; if (A.cd > 0) A.cd = Math.max(0, A.cd - dt);
    if (A.charge < 0) continue;
    const t = A.tgt, alive = t && t.alive && t.dying < 0;
    A.charge += dt;
    const need = name === 'nova' ? WAR_W.nova.charge : WAR_W.lance.charge;
    if (A.charge < need) { if (!alive) { A.tgt = warBiggest(); if (!A.tgt) { A.charge = -1; A.cd = 3; } } continue; }
    A.charge = -1;
    if (!alive) { A.cd = 3; continue; }
    if (name === 'nova') {
      const from = wAt(st, SHIP_KIT.bastion.novaMuzzle), to = wAim(t), N = WAR_W.nova;
      W.beams.push({kind: 'nova', a: from, b: to, t0: W.t, life: 1.1, w: 26});
      wDamage(t, N.dmg, to, 'beam', null, st);
      for (const o of W.ents) if (o !== t && o.alive && o.team === 1 && o.dying < 0 && wDist(o.p, to) < N.splashR) wDamage(o, N.splash, o.p, 'beam', null, st);
      wBoom(to, t.v, 60, {flash: 3, sparks: 80, smoke: 3, quiet: true}); wFx(4, to, t.v, 2.5, 40, 900, [2.2, 2.6, 3.2], V.norm(V.sub(to, from)));
      wFx(1, from, null, 0.4, 120, 0, [1.6, 2.2, 3.2]);
      A.cd = N.cd*rk; W.flash = Math.max(W.flash, 0.6);
      wEv('novaFire', {from, to, name: WAR_CLS[t.cls].name});
    } else {
      const L = WAR_W.lance, lv = Math.max(0, W.up.lance - 1), to = wAim(t);
      W.beams.push({kind: 'lance', a: A.from, b: to, t0: W.t, life: 1.3, w: 40});
      wDamage(t, L.dmg[lv], to, 'beam', null, st);
      wBoom(to, t.v, 50, {flash: 3, sparks: 70, smoke: 3, quiet: true});
      A.cd = L.cd[lv]*rk; W.flash = Math.max(W.flash, 0.5);
      wEv('lanceFire', {from: A.from, to, name: WAR_CLS[t.cls].name});
    }
  }
}

// ------------------------------------------------------------------------------------------ the Dominion
// steer clear of the other hulls: nothing here collides, so nothing may fly through anything
function wAvoid(e, want){
  const W = WAR; let w = want;
  const push = (q, rr, k) => { const dx = e.p[0] - q[0], dy = e.p[1] - q[1], dz = e.p[2] - q[2], l = Math.hypot(dx, dy, dz); if (l < rr && l > 1e-3) w = V.add(w, V.mul([dx, dy, dz], k*(1 - l/rr)/l)); };
  for (const o of W.ents) {
    if (o === e || !o.alive || o.arrive > W.t || o.docked || o.wreck) continue;
    if (o.kind === 'station') push(wAt(o, [0, 0, -30]), 420, 3);
    else if (o.kind === 'capital') push(o.p, wRad(o)*1.1 + 60, 2.5);
    else if (o.kind === 'platform') push(o.p, wRad(o) + 70, 2);
  }
  return V.norm(w);
}
// dogfighter (Wasps, Hawks): close on the target's lead, fire in range, break off when too close, extend, come round again
function wDogfight(e, c, t, dt){
  const W = WAR, R = W.rnd, A = e.ai, tp = wAim(t), rel = V.sub(tp, e.p), d = V.len(rel) || 1, to = V.mul(rel, 1/d);
  let want;
  A.t -= dt;
  if (A.mode === 'attack') {
    const vr = V.sub(wVel(t), e.v), tl = Math.min(2, d/(c.spd + 1))*0.5;
    want = V.norm(V.add(rel, V.mul(vr, tl)));
    const close = t.kind === 'station' ? 700 : t.kind === 'capital' ? wRad(t) + 200 : t.kind === 'platform' ? 260 : 300;
    if (d < close || A.t < -14) {
      const side = V.norm(V.cross(to, [0, 1, 0])), s = R() < 0.5 ? -1 : 1;
      A.mode = 'break'; A.t = 1.1 + R()*1.2; A.dir = V.norm(V.add(V.add(V.mul(side, s), V.mul([0, 1, 0], R() - 0.4)), V.mul(to, 0.2)));
    }
  } else if (A.mode === 'break') { want = A.dir; if (A.t <= 0) { A.mode = 'extend'; A.t = 2 + R()*2.5; } }
  else { want = V.norm(V.add(V.mul(to, -1), V.mul(A.dir || [0, 1, 0], 0.7))); if (d > 1300 + e.seed*800 || A.t <= 0) { A.mode = 'attack'; A.t = 0; } }
  wFighterGuns(e, c, t, d, dt, A.mode === 'attack');
  want = wAvoid(e, want);
  wTurn(e, want, c.turn*dt, 0.8, dt);
  e.vcmd = V.mul(e.f, c.spd*(A.mode === 'break' ? 1.2 : A.mode === 'extend' ? 1.1 : 1));
}
function wFighterGuns(e, c, t, d, dt, attacking){
  const W = WAR, R = W.rnd, team = e.team, tp = wAim(t);
  if (team === 1) {                                                                     // Wasps fire in bursts
    if (e.burst > 0) {
      e.bt -= dt;
      while (e.burst > 0 && e.bt <= 0) {
        e.bt += 1/c.rate; e.burst--; e.gi ^= 1;
        const from = wAt(e, c.guns[e.gi]), L = wLead(from, e.v, tp, wVel(t), c.speed), dir = wJitter(L ? L.dir : e.f, c.spread);
        wBolt(from, V.add(e.v, V.mul(dir, c.speed)), 1, 1, 1.2, c.dmg*W.D.dmg);
        wFx(1, from, e.v, 0.05, 1.8, 0, [3, 1.3, 0.5]);
      }
      return;
    }
    e.cool = (e.cool == null ? R()*2 : e.cool) - dt;
    if (!attacking || e.cool > 0 || d > c.range) return;
    const L = wLead(e.p, e.v, tp, wVel(t), c.speed);
    if (L && V.dot(e.f, L.dir) > Math.cos(5*DEG)) { e.burst = c.burst; e.bt = 0; e.gi = e.gi || 0; e.cool = c.rest + R()*1.6; }
    return;
  }
  // Hawks: steady fire while the lead is within 3 deg of the nose
  e.gc = Math.max((e.gc || 0) - dt, -dt);
  if (!attacking || d > c.range) return;
  const L = wLead(e.p, e.v, tp, wVel(t), c.speed);
  if (!L || V.dot(e.f, L.dir) < Math.cos(3*DEG)) return;
  while (e.gc <= 0) {
    e.gc += 1/c.rate; e.gi = (e.gi || 0) ^ 1;
    const from = wAt(e, c.guns[e.gi]);
    wBolt(from, V.add(e.v, V.mul(wJitter(L.dir, c.spread), c.speed)), 0, 6, 1.1, c.dmg, 0, e.id);
    wFx(1, from, e.v, 0.05, 1.6, 0, [1.8, 2.2, 3]);
  }
}
// Wasps: escort their group's bombers until something of ours comes near, then hunt it; with no bombers left, hunt anything
function wWasp(e, c, dt){
  const W = WAR, A = e.ai;
  A.re = (A.re || 0) - dt;
  if (A.re <= 0 || !A.tgt || !A.tgt.alive || A.tgt.dying >= 0 || A.tgt.docked) {
    A.re = 0.6;
    const near = wPick(e.p, 1, 2400, PREF_FOE, A.tgt, false);
    const lead = W.ents.find(o => o.alive && o.grp === e.grp && o.kind === 'bomber' && o.dying < 0);
    A.tgt = near || (lead ? null : wPick(e.p, 1, 30000, PREF_FOE, A.tgt, false));
    A.lead = lead || null;
    if (A.tgt && A.mode === 'escort') { A.mode = 'attack'; A.t = 0; }
  }
  if (A.tgt) { if (A.mode === 'escort') A.mode = 'attack'; wDogfight(e, c, A.tgt, dt); return; }
  A.mode = 'escort';
  const L = A.lead, goal = L ? V.add(L.p, V.add(V.mul(L.f, -160), [Math.sin(e.seed*40)*220, 90 + e.seed*120, Math.cos(e.seed*40)*220])) : [0, 0, 0];
  const to = V.sub(goal, e.p), dl = V.len(to);
  const want = wAvoid(e, dl > 1 ? V.mul(to, 1/dl) : e.f);
  wTurn(e, want, c.turn*dt, 0.8, dt);
  e.vcmd = V.mul(e.f, Math.min(c.spd*1.1, (L ? WAR_CLS[L.cls].spd : 0) + dl*0.4));
}
// Bombers: fly their path (a cut-in beside BASTION, then the corridor's mouth), weaving; below the mouth they dive for MILLER
function wBomber(e, c, dt){
  const W = WAR, A = e.ai;
  if (e.p[1] < WAR_T.BREACH_Y && !e.dive) { e.dive = 1; e.glow = 1.2; wEv('breaching', {cls: e.cls, name: c.name, p: e.p}); }
  if (e.dive) {
    const want = V.norm([e.f[0]*0.2, -1, e.f[2]*0.2]);
    wTurn(e, want, c.turn*1.5*dt, 0, dt);
    e.vcmd = V.mul(e.f, Math.min(1800, V.len(e.v) + 900*dt));
    if (e.p[1] < WAR_T.DIVE_Y) {                                                   // through: MILLER is hit
      e.alive = false; e.dive = 2;
      const dmg = c.breach; W.aegis = Math.max(0, W.aegis - dmg); W.stats.breaches++;
      W.strikes.push({p: e.p.slice(), t0: W.t, at: W.t + 2.6 + W.rnd()*1.5, big: c.kind === 'bomber' && dmg > 6});
      wEv('breach', {cls: e.cls, name: c.name, dmg, aegis: W.aegis, p: e.p});
      if (W.aegis <= 0 && !W.over) { W.over = {why: 'aegis', t: W.t, wave: W.wave}; wEv('defeat', {why: 'aegis', wave: W.wave}); }
    }
    return;
  }
  const P = A.path, wp = P[Math.min(A.wp, P.length - 1)];
  const to = V.sub(wp, e.p), dl = V.len(to);
  if (dl < 500 && A.wp < P.length - 1) A.wp++;
  const t = W.t, s = e.seed*6.283, weave = V.mul(V.norm(V.cross(to, [0, 1, 0])), 0.25*Math.sin(t*0.7 + s));
  if (t - e.hitT < 3 && (A.jt == null || t > A.jt)) { A.jt = t + 0.9 + W.rnd()*1.2; A.jink = V.mul(wRandDir(), 0.55); }   // evasive: under fire
  const jk = A.jink && t < A.jt ? A.jink : [0, 0, 0];
  const want = wAvoid(e, V.norm(V.add(V.add(V.mul(to, 1/Math.max(dl, 1)), weave), jk)));
  wTurn(e, want, c.turn*dt, 0.5, dt);
  e.vcmd = V.mul(e.f, c.spd);
  e.glow = e.p[1] < WAR_T.BREACH_Y + 1500 ? 0.8 : 0.25;
}
// Capitals: close to a stand-off point, turn broadside, fight with every turret; frigates throw missiles, cruisers launch
// Wasps, the Sovereign charges its SUNDER cannon at BASTION
function wCapital(e, c, dt){
  const W = WAR, R = W.rnd, A = e.ai, st = W.station, D = W.D;
  // a capital that cannot finish the job withdraws (no bounty): a wave never outlasts the patience of its fleet
  if (e.inAt != null && W.t - e.inAt > (c.boss ? 240 : 160) && !W.over) {
    e.alive = false; wWarpFx(e.p, SHIP_KIT[c.mesh].hit[2]*(e.scale || 1)*0.6, V.mul(e.f, -1), true);
    wEv('capWithdraw', {name: c.name, p: e.p}); return;
  }
  if (!A.stand || (A.t -= dt) <= 0) { A.t = 14 + R()*8; if (A.stand && R() < 0.5) A.stand = V.add(A.stand, [(R() - 0.5)*800, (R() - 0.5)*400, (R() - 0.5)*800]); }
  const to = V.sub(A.stand, e.p), dist = V.len(to);
  e.vcmd = dist > 60 ? V.mul(to, Math.min(c.spd, dist*0.04)/dist) : [0, 0, 0];
  const los = V.norm(V.sub(st.p, e.p));
  let face = dist > 700 ? V.norm(to) : V.norm(V.cross(los, [0, 1, 0]));
  if (V.dot(face, e.f) < 0 && dist <= 700) face = V.mul(face, -1);
  wTurn(e, face, c.turn*dt, 0, dt);
  e.inRange = dist < 1200;
  const sc = e.scale || 1;
  for (const T of e.tur) {
    T.cool -= dt;
    const pivotW = wAt(e, T.pivot), heavy = T.heavy;
    const tgt = heavy ? (wDist(st.p, pivotW) < WAR_W.eheavy.range ? st : wPick(pivotW, 1, WAR_W.eheavy.range, {platform: 0, station: 0.3}, T.tgt, false))
                      : wPick(pivotW, 1, WAR_W.flak.range, {fighter: 0, platform: 0.3, station: 2}, T.tgt, false);
    T.tgt = tgt;
    if (!tgt) { T.cool = Math.max(T.cool, 0.3); continue; }
    const spd = heavy ? WAR_W.eheavy.speed : WAR_W.flak.speed, L = wLead(pivotW, e.v, wAim(tgt), wVel(tgt), spd);
    if (!L) continue;
    const rx = V.cross(e.u, e.f), lx = V.dot(L.dir, rx), ly = V.dot(L.dir, e.u), lz = V.dot(L.dir, e.f);
    const ty = Math.atan2(lx, lz), tp0 = Math.atan2(ly, Math.hypot(lx, lz)), tp = clamp(tp0, -0.14, 1.3);
    const dy = Math.atan2(Math.sin(ty - T.yaw), Math.cos(ty - T.yaw)), mx = 0.9*dt;
    T.yaw += clamp(dy, -mx, mx); T.pitch += clamp(tp - T.pitch, -mx, mx);
    if (T.cool > 0 || Math.abs(dy) > 0.05 || Math.abs(tp0 - T.pitch) > 0.05 || !e.inAt || W.t - e.inAt < 3) continue;
    const from = wAt(e, V.add(T.pivot, wTurn2(T.off, T.yaw, T.pitch))), b = wTurn2([0, 0, 1], T.yaw, T.pitch);
    const bw = V.norm(V.add(V.add(V.mul(rx, b[0]), V.mul(e.u, b[1])), V.mul(e.f, b[2])));
    if (heavy) { T.cool = 2 + R()*1.2; wBolt(from, V.add(e.v, V.mul(wJitter(bw, WAR_W.eheavy.spread), spd)), 1, 5, WAR_W.eheavy.life, WAR_W.eheavy.dmg*D.dmg); wFx(1, from, e.v, 0.1, 10*sc, 0, [3, 1.5, 0.5]); }
    else { T.cool = (0.6 + R()*0.9)/c.flak; wBolt(from, V.add(e.v, V.mul(wJitter(bw, WAR_W.flak.spread), spd)), 1, 2, WAR_W.flak.life, WAR_W.flak.dmg*D.dmg); wFx(1, from, e.v, 0.08, 7, 0, [3, 1.6, 0.6]); }
  }
  if (c.missiles && (A.mt = (A.mt == null ? 5 : A.mt) - dt) <= 0) {                    // frigate: a missile pair
    A.mt = c.missiles + R()*3;
    const tgt = wDist(st.p, e.p) < WAR_W.emsl.range ? (R() < 0.6 ? st : wPick(e.p, 1, WAR_W.emsl.range, {platform: 0}, null, false) || st) : wPick(e.p, 1, WAR_W.emsl.range, {platform: 0}, null, false);
    if (tgt) {
      for (const q of SHIP_KIT[c.mesh].pods) { const p = wAt(e, q); W.msl.push({team: 1, kind: 'emsl', p, po: p, v: V.add(e.v, V.mul(e.f, 25)), f: e.f, u: e.u, tgt, t: 0, ign: 0.4, spd: 60, trail: 0, hp: 1, dmg: WAR_W.emsl.dmg*D.dmg, life: WAR_W.emsl.life}); }
      wEv('missile', {p: e.p});
    }
  }
  if (c.launch && (A.lt = (A.lt == null ? 5 : A.lt) - dt) <= 0) {                        // cruisers: Wasps out of the hangar bays
    A.lt = c.launch; A.ln = (A.ln || 0) + 1;
    if (A.ln <= (c.boss ? 6 : 4) && wHostiles(k => k.kind === 'fighter') < 18) for (const q of SHIP_KIT[c.mesh].hangar) {   // (a hangar empties)
      const p = wAt(e, q), out = V.norm(V.sub(p, e.p)), w = wSpawn('wasp', p, out, 0, {grp: e.grp});
      w.v = V.add(e.v, V.mul(out, 90)); w.ai = {mode: 'break', t: 1.5, dir: out};
    }
    A.launchT = W.t; wEv('launch', {p: e.p});
  }
  if (c.sunder && e.inAt && W.t - e.inAt > 6) {                                          // the Sovereign's SUNDER: telegraphed, then a beam at BASTION
    if (A.sunder == null) A.sunder = W.t + 10;
    if (A.charging == null && W.t >= A.sunder) { A.charging = W.t; wEv('sunderCharge', {p: e.p}); }
    if (A.charging != null && W.t - A.charging >= WAR_W.sunder.charge) {
      A.charging = null; A.sunder = W.t + c.sunder;
      const from = wAt(e, [0, 0, SHIP_KIT.cruiser.hit[2]]), to = wAt(st, [0, 0, -20]);
      W.beams.push({kind: 'sunder', a: from, b: to, t0: W.t, life: 1.4, w: 22});
      wDamage(st, WAR_W.sunder.dmg*D.dmg, to, 'enemy', [V.sub(from, st.p), V.sub(to, st.p)], e);
      wBoom(V.add(st.p, V.mul(V.norm(V.sub(from, st.p)), 300)), [0, 0, 0], 50, {flash: 2.6, sparks: 60, smoke: 2, quiet: true});
      W.flash = Math.max(W.flash, 0.7);
      wEv('sunderFire', {from, to});
    }
  }
}

// ------------------------------------------------------------------------------------------ Hawks' minds
function wHawk(e, c, dt){
  const W = WAR, A = e.ai, st = W.station;
  if (A.mode === 'docked') return;
  if (A.mode === 'launch') { A.t -= dt; wTurn(e, A.dir, c.turn*0.6*dt, 0.5, dt); e.vcmd = V.mul(e.f, c.spd*0.8); if (A.t <= 0) { A.mode = 'patrol'; A.t = 0; } return; }
  if (A.mode === 'home') {                                                               // back into the bay, then docked
    const bay = wAt(st, SHIP_KIT.bastion.hangar), to = V.sub(bay, e.p), d = V.len(to);
    wTurn(e, wAvoidHome(e, V.mul(to, 1/Math.max(d, 1))), c.turn*dt, 0.6, dt); e.vcmd = V.mul(e.f, Math.min(c.spd, 40 + d*0.25));
    if (d < 60) { e.docked = true; A.mode = 'docked'; wFx(1, e.p, null, 0.3, 14, 0, [1, 1.4, 2]); }
    return;
  }
  A.re = (A.re || 0) - dt;
  if (A.re <= 0 || !A.tgt || !A.tgt.alive || A.tgt.dying >= 0 || A.tgt.dive > 1) {
    A.re = 0.5;
    let best = null, bs = Infinity;                                                      // near BASTION, nearest to me
    const claims = new Map(); for (const h of W.ents) if (h !== e && h.cls === 'hawk' && h.alive && !h.docked && h.ai.tgt) claims.set(h.ai.tgt, (claims.get(h.ai.tgt) || 0) + 1);
    for (const o of W.ents) {
      if (!o.alive || o.team !== 1 || o.dying >= 0 || o.arrive > W.t || o.wreck || o.dive > 1) continue;
      const k = PREF_HAWK[o.kind]; if (k == null || k >= 9 || V.len(o.p) > 9000) continue;
      const s = wDist(o.p, e.p)*(1 + k) - (o === A.tgt ? 500 : 0) + (claims.get(o) || 0)*900;
      if (s < bs) { bs = s; best = o; }
    }
    A.tgt = best;
    if (A.tgt && A.mode === 'patrol') { A.mode = 'attack'; A.t = 0; }
  }
  if (A.tgt) { if (A.mode === 'patrol') A.mode = 'attack'; wDogfight(e, c, A.tgt, dt); return; }
  A.mode = 'patrol';                                                                      // a wide circle round the bow
  const ang = W.t*0.12 + (e.sq || 0)*2.1 + e.seed*0.8, goal = [1600 + 400*Math.sin(ang*0.7), 500*Math.sin(ang*1.3), 1800*Math.cos(ang)];
  const to = V.sub(goal, e.p), dl = V.len(to);
  wTurn(e, wAvoid(e, V.mul(to, 1/Math.max(dl, 1))), c.turn*0.7*dt, 0.8, dt);
  e.vcmd = V.mul(e.f, c.spd*0.75);
}
function wAvoidHome(e, want){ return want; }

// ------------------------------------------------------------------------------------------ missiles
function wMissiles(dt){
  const W = WAR, R = W.rnd, keep = [];
  for (const m of W.msl) {
    m.t += dt; m.po = m.p;
    const player = m.team === 0, M = player ? WAR_W.msl : WAR_W.emsl;
    let tgt = m.tgt && m.tgt.alive && m.tgt.dying < 0 && !m.tgt.docked ? m.tgt : null;
    if (!tgt && player && m.t > 0.4) { tgt = m.tgt = wPick(m.p, 0, 4000, PREF_MSL, null, false); }
    if (m.t < 0) { keep.push(m); continue; }                                              // still in its tube
    if (m.t < m.ign) m.p = V.add(m.p, V.mul(m.v, dt));
    else {
      m.spd = Math.min(M.speed, m.spd + M.acc*dt);
      if (tgt) {
        const L = wLead(m.p, m.v, wAim(tgt), wVel(tgt), Math.max(m.spd, 200)), want = L ? L.dir : V.norm(V.sub(wAim(tgt), m.p));
        wTurn(m, want, M.turn*dt, 0, dt);
      }
      m.vcmd = V.mul(m.f, m.spd);
      wFly(m, dt, 0.12, 900);
      if ((m.trail += dt) > (player ? 0.035 : 0.03)) { m.trail = 0; wFx(3, V.sub(m.p, V.mul(m.f, 3)), V.mul(m.v, 0.05), 1.3 + R()*0.8, 2.6, 7, player ? [0.55, 0.56, 0.6] : [0.5, 0.45, 0.4]); }
    }
    let boom = m.t > m.life || m.hp <= 0, hitE = null;
    if (!boom && tgt && m.t >= m.ign) {
      const r = wRad(tgt);
      if (tgt.kind === 'station' || tgt.kind === 'capital') { if (wSegHit(m.po[0] - tgt.po[0], m.po[1] - tgt.po[1], m.po[2] - tgt.po[2], m.p[0] - tgt.p[0], m.p[1] - tgt.p[1], m.p[2] - tgt.p[2], tgt, 1.05) >= 0) { boom = true; hitE = tgt; } }
      else if (wDist(m.p, tgt.p) < M.fuse + r*0.5) { boom = true; hitE = tgt; }
    }
    if (!boom && m.team === 1) {                                                          // an AEGIS field stops it
      const F = wFieldHit(m.po, m.p); if (F) { wFieldAbsorb(F.e, m.dmg, F.at, m.po, m.p); boom = true; }
    }
    if (boom) {
      wBoom(m.p, tgt ? wVel(tgt) : m.v, player ? 12 : 12, {sparks: 20, smoke: 1, shards: 1, flash: 2.2, quiet: !hitE});
      if (hitE) wDamage(hitE, m.dmg, m.p, player ? 'msl' : 'enemy', null, m.src);
      continue;
    }
    keep.push(m);
  }
  W.msl = keep;
}
// the AEGIS fields: a hostile round or missile entering one (a -> b crosses the sphere inward) is stopped there
function wFieldHit(a, b){
  for (const e of WAR.fields) {
    if (!e.alive || !(e.pool > 0)) continue;
    const R = e.fieldR, ax = a[0] - e.p[0], ay = a[1] - e.p[1], az = a[2] - e.p[2];
    if (ax*ax + ay*ay + az*az < R*R) continue;                                              // started inside: fired from within
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], qa = dx*dx + dy*dy + dz*dz, qb = 2*(ax*dx + ay*dy + az*dz), qc = ax*ax + ay*ay + az*az - R*R, D = qb*qb - 4*qa*qc;
    if (D < 0 || qa < 1e-12) continue;
    const t = (-qb - Math.sqrt(D))/(2*qa); if (t < 0 || t > 1) continue;
    return {e, at: [a[0] + dx*t, a[1] + dy*t, a[2] + dz*t]};
  }
  return null;
}
function wFieldAbsorb(e, dmg, at, a, b){
  e.pool = Math.max(0, e.pool - dmg); e.fieldHit = WAR.t;
  const S = shipKitBuild('bubble').shell;
  wRipple(e.fR || (e.fR = []), S, {f: [0, 0, 1], u: [0, 1, 0]}, V.sub(a, e.p), V.sub(b, e.p), e.fieldR/S.r[0]);
  if (e.pool <= 0) { e.fDown = WAR.t; wEv('fieldDown', {p: e.p}); }
  void at;
}

// ------------------------------------------------------------------------------------------ rounds in flight
function wBolts(dt){
  const W = WAR, B = W.B;
  W.fields = W.ents.filter(e => e.cls === 'aegis' && e.alive && e.dying < 0 && e.arrive <= W.t);
  let n = W.nb;
  for (let i = 0; i < n; i++) { const o = i*WB; B[o+6] = B[o]; B[o+7] = B[o+1]; B[o+8] = B[o+2]; B[o] += B[o+3]*dt; B[o+1] += B[o+4]*dt; B[o+2] += B[o+5]*dt; }
  const seg = (o, e) => [[B[o+6] - e.po[0], B[o+7] - e.po[1], B[o+8] - e.po[2]], [B[o] - e.p[0], B[o+1] - e.p[1], B[o+2] - e.p[2]]];
  const relHit = (o, e, t) => { const ax = B[o+6] - e.po[0], ay = B[o+7] - e.po[1], az = B[o+8] - e.po[2];
    return [e.p[0] + ax + (B[o] - e.p[0] - ax)*t, e.p[1] + ay + (B[o+1] - e.p[1] - ay)*t, e.p[2] + az + (B[o+2] - e.p[2] - az)*t]; };
  for (let i = 0; i < n; ) {
    const o = i*WB;
    let dead = (B[o+9] -= dt) <= 0, hitAt = null;
    if (!dead) {
      const team = B[o+10], kind = B[o+11], dmg = B[o+12];
      let hitE = null, ht = 2;
      for (const e of W.ents) {
        if (!e.alive || e.team === team || e.arrive > W.t || e.wreck || e.docked || e.dying >= 0) continue;
        const dx = B[o] - e.p[0], dy = B[o+1] - e.p[1], dz = B[o+2] - e.p[2], rr = wRad(e) + Math.abs(B[o+3]*dt) + Math.abs(B[o+4]*dt) + Math.abs(B[o+5]*dt) + 50;
        if (dx*dx + dy*dy + dz*dz > rr*rr) continue;
        const sc = e.kind === 'station' && e.sh > 0 ? 1.12 : 1;
        const t = wSegHit(B[o+6] - e.po[0], B[o+7] - e.po[1], B[o+8] - e.po[2], B[o] - e.p[0], B[o+1] - e.p[1], B[o+2] - e.p[2], e, sc*(kind === 6 || kind === 1 ? 1.3 : 1));
        if (t >= 0 && t < ht) { ht = t; hitE = e; }
      }
      if (team === 0) for (const m of W.msl) {                                          // our rounds kill their missiles
        if (m.team !== 1 || m.hp <= 0) continue;
        const dx = B[o] - m.p[0], dy = B[o+1] - m.p[1], dz = B[o+2] - m.p[2]; if (dx*dx + dy*dy + dz*dz > 250*250) continue;
        const ax = B[o+6] - m.po[0], ay = B[o+7] - m.po[1], az = B[o+8] - m.po[2], bx = B[o] - m.p[0], by = B[o+1] - m.p[1], bz = B[o+2] - m.p[2];
        const ex = bx - ax, ey = by - ay, ez = bz - az, L2 = ex*ex + ey*ey + ez*ez, tc = L2 > 0 ? clamp(-(ax*ex + ay*ey + az*ez)/L2, 0, 1) : 0;
        if (Math.hypot(ax + ex*tc, ay + ey*tc, az + ez*tc) < 7 && tc < ht) { ht = tc; hitE = m; }
      }
      if (team === 1) {                                                                 // theirs: an AEGIS field in the way
        const F = wFieldHit([B[o+6], B[o+7], B[o+8]], [B[o], B[o+1], B[o+2]]);
        if (F) { const fd = wDist(F.at, [B[o+6], B[o+7], B[o+8]]), full = wDist([B[o], B[o+1], B[o+2]], [B[o+6], B[o+7], B[o+8]]) || 1;
          if (fd/full < ht) { wFieldAbsorb(F.e, dmg*(kind === 2 ? 1.5 : 1), F.at, [B[o+6], B[o+7], B[o+8]], [B[o], B[o+1], B[o+2]]); wFx(1, F.at, null, 0.12, kind === 5 ? 14 : 7, 0, [0.8, 1.6, 3]); hitE = null; dead = true; hitAt = F.at; } }
      }
      if (!dead && hitE) {
        if (hitE.cls) {
          const at = relHit(o, hitE, ht), k = kind === 3 ? 'rail' : kind === 4 ? 'heavy' : kind <= 2 || kind === 5 ? (team === 0 ? 'ac' : 'enemy') : 'ac';
          wDamage(hitE, dmg, at, team === 1 ? 'enemy' : k, seg(o, hitE), B[o+14] ? W.ents.find(x => x.id === B[o+14]) : null);
          if (kind === 2) wBoom(at, wVel(hitE), 9, {sparks: 14, smoke: 1, quiet: true});
          if (kind === 3 || kind === 4) wBoom(at, wVel(hitE), kind === 3 ? 22 : 12, {sparks: 30, smoke: 1, flash: 2.4, quiet: true});
          hitAt = at;
        } else { hitE.hp = 0; }
        dead = true;
      } else if (!dead && kind === 2) {                                                  // flak: burst on closest approach
        for (const e of W.ents) {
          if (!e.alive || e.team !== 0 || e.arrive > W.t || e.docked || e.dying >= 0 || e.kind === 'station') continue;
          const ax = B[o+6] - e.po[0], ay = B[o+7] - e.po[1], az = B[o+8] - e.po[2], bx = B[o] - e.p[0], by = B[o+1] - e.p[1], bz = B[o+2] - e.p[2];
          const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx*dx + dy*dy + dz*dz, tc = L2 > 0 ? clamp(-(ax*dx + ay*dy + az*dz)/L2, 0, 1) : 0;
          const cx = ax + dx*tc, cy = ay + dy*tc, cz = az + dz*tc, dm = Math.hypot(cx, cy, cz), fuse = WAR_W.flak.fuse + wRad(e)*0.6;
          if (dm < fuse && tc < 1) { const at = [e.p[0] + cx, e.p[1] + cy, e.p[2] + cz]; wBoom(at, e.v, 11, {sparks: 18, smoke: 1, flash: 2});
            wDamage(e, dmg*(1 - dm/fuse) + 1, at, 'enemy', null, null); dead = true; hitAt = at; break; }
        }
      }
    }
    if (B[o+13]) { const id = B[o+13]; for (const s of W.streaks) if (s.id === id) { s.b = hitAt || [B[o], B[o+1], B[o+2]]; if (dead) s.end = W.t; break; } }
    if (dead) { n--; if (i < n) B.copyWithin(o, n*WB, n*WB + WB); continue; }
    i++;
  }
  W.nb = n;
}
function wParticles(dt){
  const W = WAR, F = W.F, t = W.t;
  let n = W.nf;
  for (let i = 0; i < n; ) {
    const o = i*WF;
    if (t - F[o+6] > F[o+7]) { n--; if (i < n) F.copyWithin(o, n*WF, n*WF + WF); continue; }
    F[o] += F[o+3]*dt; F[o+1] += F[o+4]*dt; F[o+2] += F[o+5]*dt;
    i++;
  }
  W.nf = n;
  const R = W.rnd, keep = [];
  for (const s of W.shards) {
    if (t - s.t0 > s.life) continue;
    s.p = V.add(s.p, V.mul(s.v, dt));
    const l = V.len(s.spin), ax = V.mul(s.spin, 1/l); s.f = V.rot(s.f, ax, l*dt); s.u = V.rot(s.u, ax, l*dt); [s.f, s.u] = QV.ortho(s.f, s.u);
    if (t - s.t0 < 2.2 && R() < dt*14) wFx(8, s.p, s.v, 0.5 + R()*0.6, s.scale*1.4, 0, [2.2, 0.9, 0.3]);
    keep.push(s);
  }
  W.shards = keep;
  W.streaks = W.streaks.filter(s => s.end < 0 ? t - s.t0 < WAR_W.rail.life + 0.1 : t - s.end < 0.9);
  W.beams = W.beams.filter(b => t - b.t0 < b.life);
  W.strikes = W.strikes.filter(s => t - s.at < 3);
}

// ------------------------------------------------------------------------------------------ the step
// dt: GAME seconds (real x speed; main.js sub-steps it). Motion, then decisions.
function warStep(dt){
  const W = WAR;
  if (W.phase === 'setup') { W.t += dt; if (W.station) W.station.ring = (W.station.ring || 0) + 0.075*dt; wParticles(dt); return; }
  W.t += dt; W.stats.time += dt;
  // ---- 1. motion
  wParticles(dt);
  for (const e of W.ents) e.po = e.p;
  for (const e of W.ents) {
    if (!e.alive || e.arrive > W.t || e.docked) continue;
    const c = WAR_CLS[e.cls];
    if (e.wreck) { e.p = V.add(e.p, V.mul(e.v, dt)); continue; }
    if (e.kind === 'fighter' || e.kind === 'bomber' || e.kind === 'capital') wFly(e, dt, c.tau, e.dive ? 900 : c.acc);
  }
  for (const e of W.ents) if (e.alive && !e.docked && e.arrive <= W.t && (e.kind === 'fighter' || (e.kind === 'bomber' && e.cls === 'locust'))) wTrails(e, dt);
  W.trails = W.trails.filter(tr => W.t - Math.max(...tr.T) < WAR_TRAIL.life);
  wMissiles(dt);
  wBolts(dt);
  // ---- 2. decisions
  if (W.phase === 'build' && !W.over) { W.buildT -= dt; if (W.buildT <= 0) warLaunch(false); }
  else if (W.phase === 'wave') {
    W.waveT += dt;
    wArrivals();
    W.cr += (WAR_T.INCOME + WAR_T.INCOME_REACTOR*W.up.reactor)*dt*W.D.pay;
    if (!W.over && !W.queue.length && !wHostiles() && !W.ents.some(e => e.alive && e.dying >= 0 && e.team === 1)) wWaveOver();
  }
  for (const e of W.ents) {
    if (!e.alive) continue;
    const c = WAR_CLS[e.cls];
    if (e.arrive > W.t) continue;
    if (e.inAt == null) {                                                                  // arrived this frame
      e.inAt = W.t;
      if (e.team === 1) { wWarpFx(e.p, SHIP_KIT[c.mesh].hit[2]*(e.scale || 1)*(c.kind === 'capital' ? 0.6 : 1.5), e.f, false); wEv('warp', {cls: e.cls, p: e.p, big: c.kind === 'capital'}); }
      else if (e.kind === 'platform') { wWarpFx(e.p, wRad(e)*1.6, V.norm(V.sub(e.p, [0, 0, 0])), false); wEv('deployed', {cls: e.cls, p: e.p}); }
    }
    if (e.wreck) {
      const l = V.len(e.spin), ax = V.mul(e.spin, 1/l); e.f = V.rot(e.f, ax, l*dt); e.u = V.rot(e.u, ax, l*dt); [e.f, e.u] = QV.ortho(e.f, e.u);
      const ext = SHIP_KIT[c.mesh].hit, hz = e.clip ? (Math.min(e.clip[1], ext[2]) - Math.max(e.clip[0], -ext[2]))/2*(e.scale || 1) : ext[2]*0.5, R = W.rnd;
      if (R() < dt*3) wFx(3, wAt(e, [(R()*2 - 1)*ext[0]*0.5, (R()*2 - 1)*ext[1]*0.5, 0]), e.v, 3 + R()*2, hz*0.24, hz*0.5, [0.45, 0.4, 0.37]);
      if (R() < dt*0.9) wBoom(wAt(e, [0, 0, 0]), e.v, ext[2]*0.06*(e.scale || 1), {sparks: 8, smoke: 1, quiet: true});
      if (W.t - e.t0 > 30 || wDist(e.p, [0, 0, 0]) > 30000) e.alive = false;
      continue;
    }
    if (e.dying >= 0) { if (c.kind === 'capital') wDying(e, c, dt); else if (e.kind === 'station') wStationDying(e, dt); continue; }
    if (e.docked) continue;
    if (e.kind === 'station') wStation(e, dt);
    else if (e.kind === 'platform') { if (e.cls === 'sentinel') wSentinel(e, dt); else if (e.cls === 'longbow') wLongbow(e, dt); else if (e.cls === 'hydra') wHydra(e, dt); else wAegis(e, dt); }
    else if (e.cls === 'hawk') wHawk(e, c, dt);
    else if (e.cls === 'wasp') wWasp(e, c, dt);
    else if (c.kind === 'bomber') wBomber(e, c, dt);
    else if (c.kind === 'capital') wCapital(e, c, dt);
  }
  wAbilities(dt);
  for (const e of W.ents) if (!e.alive && e.tr) { e.tr.e = null; W.trails.push(e.tr); e.tr = null; }
  W.ents = W.ents.filter(e => e.alive);
  W.flash = Math.max(0, W.flash - dt/0.6);
}
// BASTION going under: explosions walk along the hull for six seconds, then the reactor
function wStationDying(e, dt){
  const W = WAR, R = W.rnd, a = W.t - e.dying;
  e.damage = Math.min(1, 0.5 + a*0.1); e.ring = (e.ring || 0) + 0.075*dt*Math.max(0, 1 - a/6);
  if (a < 6 && R() < dt*(6 + a*3)) wBoom(wAt(e, [(R()*2 - 1)*200, (R()*2 - 1)*150, -250 + R()*450]), [0, 0, 0], 20 + R()*40 + a*8, {sparks: 20, smoke: 2, shards: 2, shardK: 1.2, team: 0});
  if (a >= 6 && !e.gone) { e.gone = true; wBoom(e.p, [0, 0, 0], 420, {ring: true, sparks: 300, smoke: 12, flash: 3.6, shards: 30, team: 0}); W.flash = 1; wEv('stationBoom', {}); }
}

// ------------------------------------------------------------------------------------------ save / load
function warSave(){
  const W = WAR;
  if (W.phase !== 'build' || W.over || !W.station) return null;
  return {v: 1, diff: W.diff, wave: W.wave, cr: Math.floor(W.cr), aegis: W.aegis, hull: W.station.hp/W.station.hpMax, up: Object.assign({}, W.up), squads: W.squads,
    slots: W.slots.filter(s => s.e).map(s => [s.i, s.e.cls, s.e.mk, s.e.invest]), stats: Object.assign({}, W.stats, {byCls: Object.assign({}, W.stats.byCls)}), endless: W.endless};
}
function warLoad(s){
  const W = WAR;
  if (!s || s.v !== 1) return false;
  W.wave = s.wave | 0; W.cr = s.cr; W.aegis = s.aegis; W.endless = !!s.endless;
  Object.assign(W.up, s.up || {}); W.squads = s.squads | 0;
  if (s.stats) W.stats = Object.assign(W.stats, s.stats);
  warStats(); W.station.hp = W.station.hpMax*clamp(s.hull == null ? 1 : s.hull, 0.05, 1);
  for (const [i, cls, mk, inv] of s.slots || []) {
    const S = W.slots[i]; if (!S || !WAR_PLAT[cls]) continue;
    const e = wSpawn(cls, S.p, [1, 0, 0], W.t + 0.2 + i*0.08, {slot: i, mk: 0, invest: inv || WAR_PLAT[cls].cost[0], deploy: 0});
    e.mk = clamp(mk | 0, 0, 2); e.hpMax = e.hp = WAR_PLAT[cls].hp[e.mk]; wPlatformFit(e); S.e = e;
  }
  return true;
}
