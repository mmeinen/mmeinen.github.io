'use strict';
// kerr.js — Kerr black-hole maths for the landing page. Pure: no GL, no DOM, so tests.html can run it in a sandbox.
//
// Units G = c = M = 1, spin a in [-1, 1]. The spin axis is world +y and the disc is the equatorial plane (xz), as
// everywhere in js/scene. Boyer-Lindquist (r, theta, phi) with theta measured from +y and phi RIGHT-HANDED about +y:
//   x = sqrt(r^2 + a^2) sin(theta) cos(phi),   y = r cos(theta),   z = -sqrt(r^2 + a^2) sin(theta) sin(phi)
// so a > 0 means the hole (and its prograde disc) turns toward +phi. The camera is a ZAMO (zero-angular-momentum
// observer): its orthonormal triad (e_r, e_theta, e_phi) is identified with world directions, which is how the flat
// renderer (planet, ships) and the curved one (lensing) share one sky.
//
// Photons are traced BACKWARD from the camera in Mino time sigma with the second-order polynomial form of the
// separated equations. Radially, in u = 1/r (in r the far field, where dr/dsigma ~ r^2, drifts badly enough to let rays
// inside the shadow escape):
//   u'' = (a^2 - L^2 - Q) u + 3 K u^2 - 2 a^2 Q u^3                       K = Q + (L - a)^2
// Angularly NOT in (theta, phi): phi' has an L / sin^2(theta) term that spikes into a peak narrower than a step for
// rays passing near the poles, and those rays drew a bead chain along the spin axis. Instead the unit position vector
// N is evolved on the sphere, without the frame dragging, then rotated about the spin axis by the frame-drag angle:
//   N'' = -(Q + L^2 + a^2 mu^2) N + a^2 mu (y - mu N),   mu = N.y     (y-component: mu'' = -(Q+L^2-a^2) mu - 2a^2 mu^3;
//                                                                       |N'|^2 = Q + L^2 + a^2 mu^2 is conserved)
//   dragPhi' = -[ a (1 + (a^2 - a L) u^2) / (1 - 2u + a^2 u^2) - a ]       direction = rotY(dragPhi) N
// Both are regular everywhere outside the horizon. L and Q are the photon's axial angular momentum and Carter constant
// (E = 1). The GLSL twin of trace() is FS_KERR_GEOM in gargantua.js, and of shadowDist() the shadow test in
// FS_KERR_SHADE: keep them in step.

const KERR = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dot = (p, q) => p[0]*q[0] + p[1]*q[1] + p[2]*q[2];
  const comb = (p, s, q, t, w, v) => [p[0]*s + q[0]*t + w[0]*v, p[1]*s + q[1]*t + w[1]*v, p[2]*s + q[2]*t + w[2]*v];

  const horizon = a => 1 + Math.sqrt(Math.max(0, 1 - a*a));
  // innermost stable circular orbit for a disc turning toward +phi: prograde for a > 0, retrograde for a < 0
  function isco(a){
    const b = Math.min(Math.abs(a), 1), s = a < 0 ? -1 : 1;
    const Z1 = 1 + Math.cbrt(1 - b*b)*(Math.cbrt(1 + b) + Math.cbrt(1 - b)), Z2 = Math.sqrt(3*b*b + Z1*Z1);
    return 3 + Z2 - s*Math.sqrt(Math.max(0, (3 - Z1)*(3 + Z1 + 2*Z2)));
  }
  // circular photon orbit: dir +1 co-rotating with the hole, -1 counter-rotating (1 and 4 M at |a| = 1, 3 M at a = 0)
  const photonOrbit = (a, dir) => 2*(1 + Math.cos(2/3*Math.acos(clamp(-dir*Math.abs(a), -1, 1))));
  // radiative efficiency of a thin disc (1 - specific energy at the ISCO): 5.7% at a = 0, 32% at a = 0.998
  const efficiency = a => 1 - Math.sqrt(1 - 2/(3*isco(a)));
  // where the landing page's disc starts glowing: a little inside the ISCO (gas plunging in), 4.6 M at a = 0
  const rIn = a => { const h = horizon(a); return h + 0.65*(isco(a) - h); };
  // u^t of a circular equatorial orbit (prograde for a > 0): the time dilation of MILLER or of the disc's gas
  function ut(r, a){ const s = Math.sqrt(r), r15 = r*s, q = r15 - 3*s + 2*a; return q > 0 ? (r15 + a)/(Math.pow(r, 0.75)*Math.sqrt(q)) : Infinity; }
  // g = nu_seen/nu_emitted for a photon with axial angular momentum L leaving the disc's gas at radius r (observer at
  // infinity, like the shader: the camera's own 2% gravitational blueshift is left out)
  function redshift(r, L, a){ const q = Math.pow(r, 1.5) - 3*Math.sqrt(r) + 2*a; if (q <= 1e-4) return 0;
    const Om = 1/(Math.pow(r, 1.5) + a); return 1/(ut(r, a)*Math.max(1 - Om*L, 0.05)); }
  const radial = (r, L, Q, a) => { const K = Q + (L - a)*(L - a); return r*r*r*r + (a*a - L*L - Q)*r*r + 2*K*r - a*a*Q; };

  // ------------------------------------------------------------------------------------------ the camera
  // ZAMO at world position p (M). Returns the BL position, the metric factors and the triad (world unit vectors).
  function camera(p, a){
    const q2 = p[0]*p[0] + p[2]*p[2], y = p[1], k = q2 + y*y - a*a;
    const r = Math.sqrt(0.5*(k + Math.sqrt(k*k + 4*a*a*y*y)));
    const mu = clamp(y/r, -1, 1), st = Math.sqrt(Math.max(1e-12, 1 - mu*mu)), ph = Math.atan2(-p[2], p[0]);
    const cp = Math.cos(ph), sp = Math.sin(ph);
    const Sig = r*r + a*a*mu*mu, Del = r*r - 2*r + a*a, A = (r*r + a*a)*(r*r + a*a) - a*a*Del*st*st;
    const rho = Math.sqrt(Sig);
    return {a, r, mu, st, ph, Sig, Del, A, rho, alpha: Math.sqrt(Sig*Del/A), omega: 2*a*r/A, varpi: Math.sqrt(A)*st/rho,
      er: [st*cp, mu, -st*sp], eth: [mu*cp, -st, -mu*sp], eph: [-sp, 0, -cp]};
  }
  // The photon seen in world direction n (unit) arrives travelling along N = -n. Its constants of motion:
  function constants(c, n){
    const a = c.a, nr = dot(n, c.er), nth = dot(n, c.eth), nph = dot(n, c.eph);
    const EF = 1/(c.alpha - c.omega*c.varpi*nph);              // photon energy measured by the ZAMO (E = 1)
    const L = -EF*c.varpi*nph, pth = -EF*c.rho*nth;
    const Q = pth*pth + c.mu*c.mu*(L*L/(c.st*c.st) - a*a);
    return {L, Q, pth, EF, nr, nth, nph};
  }
  // Inverse: the world direction in which the camera sees a photon with constants (L, Q) that has come out from near
  // the hole (so it travels OUTWARD at the camera, and the camera looks back toward the hole); sgn picks the sign of
  // p_theta. null if that photon cannot reach the camera.
  function skyDir(c, L, Q, sgn){
    const a = c.a, Th = Q + a*a*c.mu*c.mu - L*L*c.mu*c.mu/(c.st*c.st), R = radial(c.r, L, Q, a);
    if (Th < 0 || R < 0) return null;
    const EF = (1 - c.omega*L)/c.alpha;
    const Nr = Math.sqrt(R/c.Del)/(c.rho*EF), Nth = sgn*Math.sqrt(Th)/(c.rho*EF), Nph = L/(c.varpi*EF);
    const l = Math.hypot(Nr, Nth, Nph);
    return comb(c.er, -Nr/l, c.eth, -Nth/l, c.eph, -Nph/l);
  }

  // ------------------------------------------------------------------------------------------ the shadow
  // Signed distance from the shadow's edge, in the photon's (L, p_theta) plane (~ impact-parameter units, M): < 0
  // captured, > 0 escaping. A backward ray from outside the photon orbits is captured iff it heads inward and the radial
  // potential R has no turning point outside the horizon, i.e. iff F = min over r >= r+ of R is positive. That minimum
  // sits at the largest root r3 of R' = 4r^3 + 2(a^2 - L^2 - Q) r + 2K (a depressed cubic, solved in closed form) or at
  // the horizon. The distance is found by two Newton steps on F along its gradient in (L, p_theta) (the partials of R at
  // r3, by the envelope theorem): it converges on b - 3 sqrt(3) at a = 0 and holds at high spin, where a plain
  // -R/(2 b Delta) is 5x too steep on the flat side.
  function edgeF(L, P, c){                 // F and its gradient at (L, p_theta)
    const a = c.a, m2 = c.mu*c.mu, s2 = c.st*c.st, Q = P*P + m2*(L*L/s2 - a*a), K = Q + (L - a)*(L - a), rp = horizon(a);
    const p = (a*a - L*L - Q)/2, q = K/2, D = 4*p*p*p + 27*q*q;
    let r3 = rp;
    if (D < 0) { const m = 2*Math.sqrt(-p/3), t = Math.acos(clamp((3*q/(2*p))*Math.sqrt(-3/p), -1, 1))/3; r3 = Math.max(rp, m*Math.cos(t)); }
    const Del = r3*r3 - 2*r3 + a*a, dQ = -Del;
    return {F: radial(r3, L, Q, a), gL: -2*a*(r3*r3 + a*a - a*L) - 2*Del*(L - a) + dQ*2*m2*L/s2, gP: dQ*2*P};
  }
  function shadowDist(k, c){
    if (k.nr >= 0) return Infinity;                               // outgoing from far outside the photon orbits
    let L = k.L, P = k.pth, d = 0;
    for (let i = 0; i < 2; i++) {
      const e = edgeF(L, P, c), g2 = e.gL*e.gL + e.gP*e.gP + 1e-12, s = -e.F/g2;
      d += s*Math.sqrt(g2); L += s*e.gL; P += s*e.gP;
    }
    return d;
  }
  // The shadow's edge as seen from camera c: world directions round a closed loop (Bardeen's critical curve through the
  // same ZAMO camera, so it matches the shader's shadow exactly). For |a| < 1e-3 the curve is a circle (the parametric
  // formulas divide by a).
  function criticalCurve(c, n = 96){
    const a = c.a, up = [], dn = [];
    if (Math.abs(a) < 1e-3) {                  // L^2 + Q = 27, i.e. (L/sin(theta))^2 + p_theta^2 = 27
      for (let i = 0; i < n; i++) {
        const psi = 2*Math.PI*i/n, L = Math.sqrt(27)*c.st*Math.cos(psi), pt = Math.sqrt(27)*Math.sin(psi);
        const d = skyDir(c, L, pt*pt + c.mu*c.mu*(L*L/(c.st*c.st) - a*a), pt >= 0 ? 1 : -1);
        if (d) up.push(d);
      }
      return up;
    }
    const lo = photonOrbit(a, 1), hi = photonOrbit(a, -1);
    for (let i = 0; i <= n/2; i++) {
      const r = lo + (hi - lo)*(0.5 - 0.5*Math.cos(Math.PI*i/(n/2)));        // dense near the ends, where it turns
      const lam = -(r*r*r - 3*r*r + a*a*r + a*a)/(a*(r - 1));
      const eta = -(r*r*r)*(r*r*r - 6*r*r + 9*r - 4*a*a)/(a*a*(r - 1)*(r - 1));
      const d1 = skyDir(c, lam, eta, 1), d2 = skyDir(c, lam, eta, -1);
      if (d1) up.push(d1); if (d2) dn.push(d2);
    }
    return up.concat(dn.reverse());
  }

  // ------------------------------------------------------------------------------------------ the reference tracer
  // Backward ray from camera c along world direction n. Returns {captured, steps, cross: [{r, phi, g, cosBend}],
  // dir (escape direction, world)}. opt.hc scales the step (1 = the shader's law), opt.maxSteps caps it.
  // State y = [u, u', N (3), N' (3), dragPhi]; direction of the ray's position = rotY(dragPhi) N.
  const rotY = (v, t) => { const c = Math.cos(t), s = Math.sin(t); return [c*v[0] + s*v[2], v[1], -s*v[0] + c*v[2]]; };  // phi += t
  function trace(c, n, opt = {}){
    const a = c.a, k = constants(c, n), L = k.L, Q = k.Q, K = Q + (L - a)*(L - a), a2 = a*a, b2 = Q + L*L;
    const hc = opt.hc || 1, maxSteps = opt.maxSteps || 900, rOut = opt.rOut || 34;
    const uH = 1/(horizon(a) + 0.01), uDisc = 1/(1.3*rOut);
    const drag = u => -(a*(1 + (a2 - a*L)*u*u)/(1 - 2*u + a2*u*u) - a);
    const f = y => { const u = y[0], m = y[3], kk = b2 + a2*m*m;
      return [y[1], (a2 - L*L - Q)*u + 3*K*u*u - 2*a2*Q*u*u*u, y[5], y[6], y[7],
              -kk*y[2] + a2*m*(0 - m*y[2]), -kk*y[3] + a2*m*(1 - m*y[3]), -kk*y[4] + a2*m*(0 - m*y[4]), drag(u)]; };
    const rk = (y, h) => { const k1 = f(y), k2 = f(y.map((v, i) => v + 0.5*h*k1[i])), k3 = f(y.map((v, i) => v + 0.5*h*k2[i])), k4 = f(y.map((v, i) => v + h*k3[i]));
      return y.map((v, i) => v + h/6*(k1[i] + 2*k2[i] + 2*k3[i] + k4[i])); };
    const du0 = -k.EF*c.rho*Math.sqrt(c.Del)*k.nr/(c.r*c.r), dm0 = -k.EF*c.rho*c.st*k.nth;
    const W0 = comb(c.eth, -dm0/c.st, c.eph, -L/c.st, [0, 0, 0], 0);       // N' = -(mu'/sin) e_theta + (L_back/sin) e_phi
    let y = [1/c.r, du0, c.er[0], c.er[1], c.er[2], W0[0], W0[1], W0[2], 0];
    const cross = [];
    for (let i = 0; i < maxSteps; i++) {
      const d = f(y), sp = Math.sqrt(y[5]*y[5] + y[6]*y[6] + y[7]*y[7]);
      // ~0.12 rad of arc per step, finer inside ~8 M; a cap on the frame-drag rate (it spikes near the horizon); and
      // |du| <= 0.1 u among the disc. Against a 30x finer trace: escape within ~0.01 deg, crossings within ~2e-5.
      let h = hc*Math.min(0.12/Math.max(sp, 1)*clamp(1/(8*y[0]), 0.3, 1), 0.2/Math.max(Math.abs(d[8]), 1e-9));
      if (y[0] > uDisc && Math.abs(y[1]) > 1e-12) h = Math.min(h, hc*0.1*y[0]/Math.abs(y[1]));
      if (y[0] + h*y[1] < 0) {                          // it reaches infinity inside this step: land on u = 0
        for (let j = 0; j < 3; j++) { if (y[1] >= 0) break; y = rk(y, -y[0]/y[1]); }
        const N = rotY([y[2], y[3], y[4]], y[8]), l = Math.hypot(N[0], N[1], N[2]);
        return {captured: false, steps: i + 1, cross, dir: [N[0]/l, N[1]/l, N[2]/l]};
      }
      const yn = rk(y, h);
      if (y[3]*yn[3] < 0) {                             // crossed the disc plane: Hermite on mu = N.y for the time
        const dn = f(yn), m0 = y[3], m1 = yn[3], s0 = y[6]*h, s1 = yn[6]*h;
        let t = m0/(m0 - m1);
        for (let j = 0; j < 4; j++) {
          const t2 = t*t, t3 = t2*t, m = (2*t3 - 3*t2 + 1)*m0 + (t3 - 2*t2 + t)*s0 + (-2*t3 + 3*t2)*m1 + (t3 - t2)*s1;
          const dm = (6*t2 - 6*t)*m0 + (3*t2 - 4*t + 1)*s0 + (-6*t2 + 6*t)*m1 + (3*t2 - 2*t)*s1;
          if (Math.abs(dm) > 1e-12) t = clamp(t - m/dm, 0, 1);
        }
        const t2 = t*t, t3 = t2*t, H0 = 2*t3 - 3*t2 + 1, H1 = (t3 - 2*t2 + t)*h, H2 = -2*t3 + 3*t2, H3 = (t3 - t2)*h;
        const Hm = i => H0*y[i] + H1*d[i] + H2*yn[i] + H3*dn[i], Lm = i => y[i] + (yn[i] - y[i])*t;
        const u = Hm(0), dragc = Hm(8), Nc = rotY([Hm(2), Hm(3), Hm(4)], dragc), Wc = rotY([Lm(5), Lm(6), Lm(7)], dragc);
        const nl = Math.hypot(Nc[0], Nc[1], Nc[2]), Nn = [Nc[0]/nl, Nc[1]/nl, Nc[2]/nl], ph = Math.atan2(-Nn[2], Nn[0]);
        const dd = d[8] + (dn[8] - d[8])*t, yx = [Nn[2], 0, -Nn[0]];   // y x N: the direction of increasing phi
        const v = comb(Nn, -Lm(1), Wc, u, yx, u*dd);                     // velocity ~ -u' N + u (W + drag' y x N)
        const vl = Math.hypot(v[0], v[1], v[2]) || 1, r = 1/u;
        cross.push({r, phi: ph, g: redshift(r, L, a), cosBend: dot(n, v)/vl});
      }
      y = yn;
      if (y[0] > uH) return {captured: true, steps: i + 1, cross};
    }
    return {captured: true, steps: maxSteps, cross, capped: true};    // wound round the photon orbit past the cap
  }

  return {horizon, isco, photonOrbit, efficiency, rIn, ut, redshift, radial, camera, constants, skyDir, shadowDist, criticalCurve, trace};
})();
