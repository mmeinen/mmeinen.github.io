'use strict';
// orbit.js — the system model: where everything is, where the camera looks, and the numbers the HUD reads.
// Pure maths (no GL), so the HUD keeps working when the renderer is unavailable.
//
// Frame: metres (float64), Gargantua at the origin, spin axis +y, disc in the xz plane -- the demo's frame, so
// the ported shaders apply unchanged. Only camera-relative values ever reach the GPU.
//
// MILLER circles the hole at 45 M, 4 degrees above the disc plane, at its real Schwarzschild rate (x time warp).
// The ship flies a circular DAWN-DUSK orbit round MILLER: the orbit plane is held perpendicular to the direction
// of the hole (a sun-synchronous orbit with Gargantua for a sun) and tilted from it by BETA. So the hole never
// sets: its elevation above the local horizontal swings between -BETA and +BETA while the limb lies DIP below the
// horizontal, and orbitCheck() asserts BETA < DIP - margin at every altitude the ship may fly. Over one orbit
// the local vertical turns a full circle round the line of sight, so the disc rolls from level to upright
// ("keyhole") and back, and the ground below swings between the dawn rim and the city-lit night side.
//
// The camera looks toward the hole, pitched so the hole sits in the upper part of the frame and the limb in the
// lower part; the vertical FOV widens when the two are too far apart to share the default frame. Look-around
// offsets are clamped so the hole can never leave the screen.

const DEG = Math.PI/180;
const SI = {c: 2.998e8, RE: 6.371e6, AU: 1.495979e11, GM_EARTH: 3.986e14};

const ORB = {
  TC: 12,                                  // time warp: simulated seconds per real second (shown on the HUD)
  ALT_MIN: 4.5e5, ALT_MAX: 6.0e6,
  planet: {name: 'MILLER', R: 1.05*SI.RE, aM: 45, inc: 4*DEG, phase: Math.PI/2, day: 5400, tilt: 1.35, seed: 421},
  // MILLER I is art-directed, not Keplerian: it crosses in front of the hole every `period` real seconds,
  // moving parallel to the disc, `gamma` above the line to the hole; the first crossing is `first` s in.
  moon: {name: 'MILLER I', R: 0.3*SI.RE, d: 6.0e7, period: 300, gamma: 1.6*DEG, first: 45},
  ship: {h: 7.0e5, hTarget: 7.0e5, theta: 0.3, beta: 8*DEG},
  look: {yaw: 0, pitch: 0, idle: 99},
  zoom: 1, zoomTarget: 1, warp: 0,
  tReal: 0, tSim: 0, W: 1, H: 1,
  view: null, camM: null, bodies: null, hud: {},           // outputs of orbitStep()
};

(function derive(){
  const pl = ORB.planet;
  pl.GM = SI.GM_EARTH*Math.pow(1.05, 3);             // Earth's density
  ORB.M = BH.M_KM*1e3;                               // metres per M (GM/c^2)
  ORB.GM_HOLE = ORB.M*SI.c*SI.c;
  pl.a = pl.aM*ORB.M;
  pl.omega = Math.sqrt(ORB.GM_HOLE/(pl.a*pl.a*pl.a)); // circular Schwarzschild orbits keep Kepler's law in coordinate time
  pl.vLocal = Math.sqrt(1/(pl.aM - 2));              // speed seen by a static observer there, in c
  pl.dil = 1/Math.sqrt(1 - 3/pl.aM);                 // distant (Earth) seconds per ship second on that orbit
  pl.periodS = 2*Math.PI/pl.omega;
  // angular radius of the shadow for a static observer at r: sin a = (3 sqrt 3 M / r) sqrt(1 - 2M/r)
  ORB.shadowRad = Math.asin(Math.sqrt(27)/pl.aM*Math.sqrt(1 - 2/pl.aM));
})();

// The hole may never set: the limb must stay well below it at every altitude the ship can reach.
function orbitCheck(){
  const dipMin = Math.acos(ORB.planet.R/(ORB.planet.R + ORB.ALT_MIN));
  if (ORB.ship.beta > dipMin - 5*DEG) throw new Error('orbit tilt lets Gargantua set below the limb');
}

function orbitResize(W, H){ ORB.W = W; ORB.H = H; }

function orbitStep(dt){
  const o = ORB, pl = o.planet, s = o.ship, m = o.moon;
  o.tReal += dt; o.tSim += dt*o.TC;
  // --- MILLER round the hole, spinning on its tipped axis
  const th = pl.phase + pl.omega*o.tSim, a = pl.a;
  const P = [a*Math.cos(th), a*Math.sin(th)*Math.sin(pl.inc), -a*Math.sin(th)*Math.cos(pl.inc)];
  const l2w = M3.mul(M3.rx(pl.tilt), M3.ry(2*Math.PI*o.tSim/pl.day));
  // --- the ship's dawn-dusk orbit (altitude changes are eased burns; theta integrates the current rate)
  s.h += (s.hTarget - s.h)*(1 - Math.exp(-dt/1.1));
  const rs = pl.R + s.h, nMean = Math.sqrt(pl.GM/(rs*rs*rs));
  s.theta += nMean*dt*o.TC;
  const t = V.norm(V.mul(P, -1));                               // toward the hole
  const up0 = V.norm(V.sub([0, 1, 0], V.mul(t, t[1])));         // across the line of sight, on the disc-normal side
  const side = V.cross(t, up0);
  const u2 = V.sub(V.mul(side, Math.cos(s.beta)), V.mul(t, Math.sin(s.beta)));
  const ct = Math.cos(s.theta), st = Math.sin(s.theta);
  const e = V.add(V.mul(up0, ct), V.mul(u2, st));               // local vertical
  const pro = V.add(V.mul(up0, -st), V.mul(u2, ct));            // prograde
  const eye = V.add(P, V.mul(e, rs));
  // --- MILLER I
  const phi = 2*Math.PI*(o.tReal - m.first)/m.period;
  const w1 = V.add(V.mul(t, Math.cos(m.gamma)), V.mul(up0, Math.sin(m.gamma)));
  const Mp = V.add(P, V.add(V.mul(w1, m.d*Math.cos(phi)), V.mul(side, m.d*Math.sin(phi))));

  // --- framing
  const tE = V.norm(V.mul(eye, -1));
  const sinEl = clamp(V.dot(tE, e), -1, 1), el = Math.asin(sinEl);
  const dip = Math.acos(pl.R/rs), sep = el + dip;               // hole above the horizontal, limb below it
  const asp = o.W/o.H;
  const baseV = (asp >= 1 ? 50 : clamp(50/Math.sqrt(asp), 50, 74))*DEG;
  // keep the hole ~9 deg under the top edge and the limb ~4 deg over the bottom edge, widening if needed
  const Vh = Math.min(Math.max(baseV/2, (sep + 13*DEG)/2), 39*DEG);
  o.zoom += (o.zoomTarget - o.zoom)*(1 - Math.exp(-dt/0.6));
  const zk = clamp((o.zoom - 1)/1.8, 0, 1);                     // telescope: narrow and re-centre on the hole
  const VhZ = Math.atan(Math.tan(Vh)/o.zoom);
  // the hole's height above the frame centre: the limb 30% of the half-frame below centre (the planet owns the
  // bottom third), unless that pushes the hole (and its lensed arc) within 9 degrees of the top edge
  const yH = clamp(sep - 0.3*Vh, 0.18*Vh, Vh - 9*DEG)*(1 - zk);
  // (floored at 0: zoomed in a tall narrow window the margin exceeds the half-width, and a negative bound would
  // pin the view off to one side instead of centring the hole)
  const L = o.look, HhZ = Math.atan(Math.tan(VhZ)*asp), mH = Math.max(0, HhZ - 8*DEG), mV = Math.max(0, VhZ - 8*DEG);
  L.idle += dt;
  if (L.idle > 3.5) { const k = 1 - Math.exp(-dt/1.4); L.yaw -= L.yaw*k; L.pitch -= L.pitch*k; }
  L.yaw = clamp(L.yaw, -mH, mH); L.pitch = clamp(L.pitch, yH - mV, yH + mV);
  const br = o.tReal;                                            // a crewed ship never sits perfectly still
  const yaw = L.yaw + 0.006*Math.sin(br*0.21), pitch = L.pitch + 0.005*Math.sin(br*0.17 + 1.3);
  const aim = el - yH + pitch;
  const hdir = V.norm(V.sub(tE, V.mul(e, sinEl)));
  let f = V.norm(V.add(V.mul(hdir, Math.cos(aim)), V.mul(e, Math.sin(aim))));
  f = V.norm(V.rot(f, e, yaw));                                  // +yaw turns the view left
  let r = V.norm(V.cross(f, e)), u = V.cross(r, f);
  const roll = 0.028*Math.sin(br*0.083);                         // a slow, gentle bank
  { const c = Math.cos(roll), sn = Math.sin(roll), r2 = V.add(V.mul(r, c), V.mul(u, sn)); u = V.sub(V.mul(u, c), V.mul(r, sn)); r = r2; }
  let fov = 2*VhZ;
  if (o.warp > 0) fov += (112*DEG - fov)*o.warp*o.warp;          // the jump: the view tunnels out
  o.view = {eye, b: {r, u, f}, fov};
  o.camM = V.mul(eye, 1/o.M);
  o.bodies = [
    {type: B_BH, R: 0, seed: 1, light: 1, col: [1, 0.85, 0.66], pos: [0, 0, 0], l2w: [1, 0, 0, 0, 1, 0, 0, 0, 1]},
    {type: B_TERRAN, R: pl.R, seed: pl.seed, light: 1.15, col: [0.55, 0.72, 1], pos: P, l2w},
    {type: B_MOON, R: m.R, seed: 77, light: 1.15, col: [0.8, 0.8, 0.8], pos: Mp, l2w: M3.ry(phi)},
  ];
  // --- telemetry
  const hud = o.hud, toMoon = V.sub(Mp, eye), dMoon = V.len(toMoon);
  const q = M3.vec(M3.T(l2w), e);
  hud.alt = s.h; hud.vel = Math.sqrt(pl.GM/rs); hud.period = 2*Math.PI/nMean;
  hud.burn = Math.abs(s.hTarget - s.h) > 0.004*s.h; hud.climb = s.hTarget > s.h;
  hud.el = el; hud.dip = dip; hud.theta = s.theta;
  hud.lat = Math.asin(clamp(q[1], -1, 1)); hud.lon = Math.atan2(q[0], q[2]);
  hud.rangeHole = V.len(eye); hud.moonRange = dMoon - m.R;
  hud.met = o.tSim; hud.earth = o.tSim*pl.dil;
  hud.dirHole = tE; hud.dirMoon = V.mul(toMoon, 1/dMoon); hud.moonAng = Math.asin(m.R/dMoon);
  hud.pro = pro; hud.up = e; hud.fov = fov;
  hud.transitIn = (((-phi) % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)/(2*Math.PI)*m.period;   // real s to the next crossing
  hud.moonPhi = Math.atan2(Math.sin(phi), Math.cos(phi));
}

// unit direction (world) -> CSS pixels on the canvas; front = in front of the camera
function orbitProject(d){
  const v = ORB.view, b = v.b, z = V.dot(d, b.f), th = Math.tan(v.fov/2), asp = ORB.W/ORB.H, az = Math.max(Math.abs(z), 1e-6);
  const x = V.dot(d, b.r)/(az*th*asp), y = V.dot(d, b.u)/(az*th);
  return {x: (x*0.5 + 0.5)*ORB.W, y: (0.5 - y*0.5)*ORB.H, front: z > 0};
}
// bearing of a direction in the local horizontal frame, radians clockwise from prograde
function orbitBearing(d){
  const h = ORB.hud, up = h.up, dh = V.sub(d, V.mul(up, V.dot(d, up))), right = V.cross(h.pro, up);
  return Math.atan2(V.dot(dh, right), V.dot(dh, h.pro));
}
