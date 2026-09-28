'use strict';
// gargantua.js — the black hole: a KERR hole whose spin drifts, lensing baked once and shaded every frame.
// Units G = c = M = 1. Spin axis world +y, disc = the equatorial plane. The maths (and its float64 twin, used by the
// HUD and tests.html) lives in kerr.js; read its header first.
//
// BH_COMMON and FS_BH_SHADE are demo/js/gargantua.js VERBATIM (tests.html checks it): the demo's hole is
// Schwarzschild, and this page reuses its disc / star shading helpers unchanged, splicing a Kerr main() in place of
// the demo's at program creation (the same string-injection rule as GEOM_CUBE). Only the geometry pass is new.
//
// Lensing is split into GEOMETRY and SHADING. The geometry pass (FS_KERR_GEOM) traces each ray backward from the
// camera -- Kerr null geodesics in Boyer-Lindquist coordinates, Mino time, u = 1/r, RK4 -- and records WHERE it went:
// the escape direction, up to two crossings of the disc plane with their redshift, and a volumetric haze integral. It
// is BAKED into four cube MRTs at the camera (the ship's whole flight envelope is < 1e-3 M across, and the disc is
// axisymmetric, so one bake at azimuth 0 serves the hole from anywhere on MILLER's orbit). The shading pass turns the
// stored geometry into light at full resolution every frame: lensed stars, the disc's turbulence advected at the
// Keplerian rate, Doppler-shifted blackbody colour, and the shadow + photon ring ANALYTIC in the photon's constants of
// motion (a filtered 0/1 capture flag draws scalloped texel edges).

const BH_COMMON = `
uniform float u_spin, u_rIn, u_rOut;
// u'' + u = 3M u^2 in Cartesian form. The path does not depend on |v|, and v_inf^2 = v^2 - 2 h^2 / r^3.
// (A weak-field Lense-Thirring term was tried for spin: it is wrong in the strong field -- it offset the
// photon ring from the shadow -- so the hole is non-rotating; u_spin only enters the disc's orbits.)
vec3 bhAccel(vec3 p, vec3 v, float h2){
  float r2 = dot(p, p), r = sqrt(r2);
  return -3.0*h2*p/(r2*r2*r);
}
float erfA(float x){ return tanh(1.12838*x + 0.10091*x*x*x); }
// How much of the disc is there at radius r (inner plunge fade, soft outer rim). Crossings are stored
// WEIGHTED by this, so an invisible rim hit cannot drag a filtered neighbour's coordinates onto itself.
float discEdge(float r){ return smoothstep(u_rIn*0.88, u_rIn*1.2, r)*(1.0 - smoothstep(u_rOut*0.62, u_rOut*1.01, r)); }
float hazeProfile(float r){
  return pow(u_rIn/r, 1.4)*smoothstep(u_rIn*0.75, u_rIn*1.15, r)*(1.0 - smoothstep(u_rOut*0.75, u_rOut*1.08, r));
}
`;

// Geometry (bake). Writes 4 targets for the cube face / patch texel whose direction is u_F + ndc*(u_tanX u_R, u_tanY u_U):
//   o0 = escapeDir - rayDir, haze      o1 = x1*f, z1*f, g1*f, f (first disc crossing)      o2 = second crossing
//   o3 = cos of the total bend at each crossing (< 0: the ray had wound round the hole), spare
// Crossings are stored premultiplied by their coverage f so bilinear filtering averages only real hits, at
// (r cos phi, r sin phi) with phi the Boyer-Lindquist azimuth, so the shader's discTex flows WITH the gas (the demo's
// (x, z) convention advects the turbulence against its own Doppler beaming). The camera is a ZAMO at the bake point,
// azimuth 0 (u_camK, u_zamo, triad u_er/u_eth/u_eph). State: u = 1/r and u', the unit position vector N and N' WITHOUT
// frame dragging, and the frame-drag angle; the ray is at rotY(drag) N. kerr.js trace() is this loop in float64 --
// read its header for the equations and why N replaces (theta, phi).
const FS_KERR_GEOM = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 u_R, u_U, u_F, u_er, u_eth, u_eph;
uniform float u_tanX, u_tanY, u_rInCut, u_uH;
uniform vec4 u_camK;                                    // camera: r, cos(theta), sin(theta), sqrt(Delta)
uniform vec4 u_zamo;                                    // ZAMO: lapse alpha, frame drag omega, varpi, rho
uniform int u_maxSteps;
${BH_COMMON}
layout(location=0) out vec4 o0;
layout(location=1) out vec4 o1;
layout(location=2) out vec4 o2;
layout(location=3) out vec4 o3;
float A2, L_, B2, cA, cB, cC, cL;                        // a^2, L, Q + L^2 and the u'' coefficients of this ray
float fU(float u){ return ((cB - cC*u)*u + cA)*u; }     // u'' = (a^2-L^2-Q) u + 3K u^2 - 2a^2 Q u^3
vec3 fN(vec3 N){ float m = N.y; return -(B2 + A2*m*m)*N + A2*m*(vec3(0.0, 1.0, 0.0) - m*N); }
float fD(float u){ return -(u_spin*(1.0 + cL*u*u)/(1.0 - 2.0*u + A2*u*u) - u_spin); }   // frame-drag azimuth rate
vec3 rotYp(vec3 v, float t){ float c = cos(t), s = sin(t); return vec3(c*v.x + s*v.z, v.y, -s*v.x + c*v.z); }  // phi += t
float kerrG(float r){                                   // Kerr thin disc, circular prograde orbits; observer at infinity
  float s = sqrt(r), r15 = r*s, q = r15 - 3.0*s + 2.0*u_spin;
  if (q <= 1e-4) return 0.0;
  float ut = (r15 + u_spin)/(pow(r, 0.75)*sqrt(q));
  return 1.0/(ut*max(1.0 - L_/(r15 + u_spin), 0.05));
}
float edgeK(float r, float rin){ return smoothstep(rin*0.88, rin*1.2, r)*(1.0 - smoothstep(u_rOut*0.62, u_rOut*1.01, r)); }
void main(){
  vec2 ndc = vUv*2.0 - 1.0;
  vec3 rd = normalize(u_F + ndc.x*u_tanX*u_R + ndc.y*u_tanY*u_U);
  float a = u_spin; A2 = a*a;
  // the photon seen along rd arrives travelling along -rd: its constants of motion (E = 1)
  float nr = dot(rd, u_er), nth = dot(rd, u_eth), nph = dot(rd, u_eph);
  float EF = 1.0/(u_zamo.x - u_zamo.y*u_zamo.z*nph);
  float L = -EF*u_zamo.z*nph, pth = -EF*u_zamo.w*nth; L_ = L;
  float mu0 = u_camK.y, st0 = u_camK.z;
  float Q = pth*pth + mu0*mu0*(L*L/(st0*st0) - A2), K = Q + (L - a)*(L - a);
  B2 = Q + L*L; cA = A2 - L*L - Q; cB = 3.0*K; cC = 2.0*A2*Q; cL = A2 - a*L;
  float uDisc = 1.0/(1.3*u_rOut);
  float u = 1.0/u_camK.x, du = -EF*u_zamo.w*u_camK.w*nr*u*u, dr = 0.0;
  vec3 N = u_er, W = (EF*u_zamo.w*nth)*u_eth + (-L/st0)*u_eph;     // N' = -(mu'/sin) e_theta + (L_back/sin) e_phi
  vec4 hit1 = vec4(0.0), hit2 = vec4(0.0); int nh = 0;
  float haze = 0.0, bend1 = 1.0, bend2 = 1.0;
  bool done = false, captured = false;
  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxSteps) { captured = true; break; }    // still winding round the photon orbit: the analytic ring's job
    float fd1 = fD(u);
    // ~0.12 rad of arc per step, finer inside ~8 M; frame-drag rate capped (it spikes at the horizon); |du| <= 0.1u in the disc
    float h = min(0.12/max(length(W), 1.0)*clamp(1.0/(8.0*u), 0.3, 1.0), 0.2/max(abs(fd1), 1e-6));
    if (u > uDisc) h = min(h, 0.1*u/max(abs(du), 1e-9));
    if (u + h*du < 0.0) done = true;                    // reaches infinity inside this step: land on u = 0 below
    for (int j = 0; j < 3; j++) {
      if (done) { if (du >= 0.0) break; h = -u/du; fd1 = fD(u); }
      // RK4 on (u, u', N, N', drag)
      float fu1 = fU(u); vec3 fn1 = fN(N);
      float u2 = u + 0.5*h*du, du2 = du + 0.5*h*fu1; vec3 N2 = N + 0.5*h*W, W2 = W + 0.5*h*fn1;
      float fu2 = fU(u2), fd2 = fD(u2); vec3 fn2 = fN(N2);
      float u3 = u + 0.5*h*du2, du3 = du + 0.5*h*fu2; vec3 N3 = N + 0.5*h*W2, W3 = W + 0.5*h*fn2;
      float fu3 = fU(u3), fd3 = fD(u3); vec3 fn3 = fN(N3);
      float u4 = u + h*du3, du4 = du + h*fu3; vec3 N4 = N + h*W3, W4 = W + h*fn3;
      float fu4 = fU(u4), fd4 = fD(u4); vec3 fn4 = fN(N4);
      float un = u + h/6.0*(du + 2.0*du2 + 2.0*du3 + du4), dun = du + h/6.0*(fu1 + 2.0*fu2 + 2.0*fu3 + fu4);
      vec3 Nn = N + h/6.0*(W + 2.0*W2 + 2.0*W3 + W4), Wn = W + h/6.0*(fn1 + 2.0*fn2 + 2.0*fn3 + fn4);
      float drn = dr + h/6.0*(fd1 + 2.0*fd2 + 2.0*fd3 + fd4);
      // glowing slab round the disc plane, integrated exactly along the (straight) sub-segment
      float rm = 2.0/max(u + un, 1e-6);
      if (rm < u_rOut*1.1 && rm > u_rIn*0.7) {
        vec3 p0 = rotYp(N, dr)/max(u, 1e-6), p1 = rotYp(Nn, drn)/max(un, 1e-6);
        float H = 0.03*rm + 0.08, ds = length(p1 - p0), y0 = p0.y, y1 = p1.y, dy = y1 - y0;
        float I = abs(dy) > 1e-5*ds ? ds*(H*1.2533/abs(dy))*abs(erfA(y1/(1.41421*H)) - erfA(y0/(1.41421*H)))
                                    : ds*exp(-y0*y0/(2.0*H*H));
        haze += I*hazeProfile(rm);
      }
      // crossed the disc plane: one Newton step of the Hermite cubic in mu = N.y for the crossing time
      if (N.y*Nn.y < 0.0 && nh < 2) {
        float m0 = N.y, m1 = Nn.y, s0 = W.y*h, s1 = Wn.y*h, t = m0/(m0 - m1);
        float t2 = t*t, t3 = t2*t;
        float mt = (2.0*t3 - 3.0*t2 + 1.0)*m0 + (t3 - 2.0*t2 + t)*s0 + (-2.0*t3 + 3.0*t2)*m1 + (t3 - t2)*s1;
        float dmt = (6.0*t2 - 6.0*t)*m0 + (3.0*t2 - 4.0*t + 1.0)*s0 + (-6.0*t2 + 6.0*t)*m1 + (3.0*t2 - 2.0*t)*s1;
        if (abs(dmt) > 1e-9) t = clamp(t - mt/dmt, 0.0, 1.0);
        t2 = t*t; t3 = t2*t;
        float b0 = 2.0*t3 - 3.0*t2 + 1.0, b1 = (t3 - 2.0*t2 + t)*h, b2 = -2.0*t3 + 3.0*t2, b3 = (t3 - t2)*h;
        float fdE = fD(un);
        float uc = b0*u + b1*du + b2*un + b3*dun, drc = b0*dr + b1*fd1 + b2*drn + b3*fdE;
        vec3 Nc = normalize(rotYp(b0*N + b1*W + b2*Nn + b3*Wn, drc));
        float rc = 1.0/max(uc, 1e-6), w = edgeK(rc, u_rInCut);
        if (w > 0.002) {
          vec3 Wc = rotYp(mix(W, Wn, t), drc);
          vec3 v = -mix(du, dun, t)*Nc + uc*(Wc + mix(fd1, fdE, t)*vec3(Nc.z, 0.0, -Nc.x));
          float cb = dot(rd, normalize(v)), phc = atan(-Nc.z, Nc.x);
          vec4 hh = vec4(rc*cos(phc), rc*sin(phc), kerrG(rc), w);
          if (nh == 0) { hit1 = hh; bend1 = cb; } else { hit2 = hh; bend2 = cb; }
          nh++;
        }
      }
      u = un; du = dun; N = Nn; W = Wn; dr = drn;
      if (!done) break;
    }
    if (done) break;
    if (u > u_uH) { captured = true; break; }
  }
  if (captured || !done) o0 = vec4(0.0, 0.0, 0.0, haze);
  else o0 = vec4(normalize(rotYp(N, dr)) - rd, haze);    // at u = 0 the position direction IS the escape direction
  o1 = vec4(hit1.xyz*hit1.w, hit1.w);
  o2 = vec4(hit2.xyz*hit2.w, hit2.w);
  o3 = vec4(bend1, bend2, 0.0, 0.0);
}`;

// Shading. GEOM_CUBE selects the baked cubemaps; otherwise screen-space geometry buffers.
const FS_BH_SHADE = `#version 300 es
precision highp float; precision highp int;
in vec2 vUv;
uniform vec3 u_R, u_U, u_F;
uniform float u_tanX, u_tanY, u_time, u_az, u_discGain, u_starGain, u_hazeGain, u_ringGain, u_Tpeak, u_falloff, u_contrast;
#ifdef GEOM_CUBE
uniform samplerCube u_g0, u_g1, u_g2, u_g3;
#define G(s) texture(s, dB)
#else
uniform sampler2D u_g0, u_g1, u_g2, u_g3;
#define G(s) texture(s, vUv)
#endif
uniform samplerCube u_sky; uniform float u_skyGain;
uniform vec3 u_cam;                                      // camera, BH frame (M), for the exact shadow
uniform int u_dbg;                                       // 1 haze, 2 hit1, 4 hit2, 8 stars, 16 ring off
${BH_COMMON}
out vec4 o;

const uvec3 HK = uvec3(0x8da6b343u, 0xd8163841u, 0xcb1ab31fu);
float hf(uint h){ h ^= h >> 16u; h *= 0x85ebca6bu; h ^= h >> 13u; h *= 0xc2b2ae35u; h ^= h >> 16u; return float(h >> 8u)*(1.0/16777215.0); }
float vn3(vec3 x){
  vec3 fl = floor(x), w = x - fl, u = w*w*(3.0 - 2.0*w);
  uvec3 p0 = uvec3(ivec3(fl))*HK, p1 = p0 + HK;
  return mix(mix(mix(hf(p0.x ^ p0.y ^ p0.z), hf(p1.x ^ p0.y ^ p0.z), u.x), mix(hf(p0.x ^ p1.y ^ p0.z), hf(p1.x ^ p1.y ^ p0.z), u.x), u.y),
             mix(mix(hf(p0.x ^ p0.y ^ p1.z), hf(p1.x ^ p0.y ^ p1.z), u.x), mix(hf(p0.x ^ p1.y ^ p1.z), hf(p1.x ^ p1.y ^ p1.z), u.x), u.y), u.z);
}
vec3 hash33(vec3 p){ uvec3 q = uvec3(ivec3(floor(p)))*HK; uint h = q.x ^ q.y ^ q.z; return vec3(hf(h), hf(h*0x27d4eb2du + 1u), hf(h*0x165667b1u + 7u)); }
vec3 blackbody(float T){                                // Kelvin -> linear RGB, max channel 1
  float t = clamp(T, 1000.0, 40000.0)/100.0; vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.2929*pow(t - 60.0, -0.1332), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.3901*log(t) - 0.6318, 0.0, 1.0) : clamp(1.1298*pow(t - 60.0, -0.0755), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432*log(t - 10.0) - 1.1963, 0.0, 1.0));
  return pow(c, vec3(2.2));
}
// rotY(v, a) takes (R,0,0) to (R cos a, 0, -R sin a): world = rotY(bake, -az), bake = rotY(world, az)
vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c*v.x + s*v.z, v.y, -s*v.x + c*v.z); }

// Point stars, evaluated at the lensed direction. fp = footprint of one pixel in escape-direction space:
// where lensing compresses the sky the footprint shrinks and a star smears into a bright arc, which is
// exactly the magnification (surface brightness is conserved).
vec3 stars(vec3 e, float fp){
  vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float sc = 60.0 + float(i)*110.0;
    vec3 p = e*sc, id = floor(p), f = p - id - 0.5;
    vec3 h = hash33(id + float(i)*31.0);
    if (h.x > 0.955 - float(i)*0.012) {
      vec3 off = (hash33(id*1.7 + 13.0) - 0.5)*0.6;
      float w = max(fp*sc*0.85, 0.028);
      float d2 = dot(f - off, f - off);
      float b = pow((h.x - 0.9)/0.1, 4.0)*(0.5 + 1.5*h.y)/max(1.0, w*w*55.0);
      vec3 sc3 = blackbody(2800.0 + 9000.0*h.z*h.z);
      c += sc3*b*exp(-d2/(w*w));
    }
  }
  return c;
}
float fbmDisc(vec3 q){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a*vn3(q); q = q*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
// Turbulence in (azimuth, log r) advected at the Keplerian rate. Two phases half a period apart are
// cross-faded so the differential rotation never winds the pattern into aliasing.
float discTex(float r, float phi, float lr){
  float Om = 1.0/(pow(r, 1.5) + u_spin);
  float P = 26.0, tt = u_time*3.2/P;
  float t1 = fract(tt), t2 = fract(tt + 0.5), w1 = 1.0 - abs(2.0*t1 - 1.0);
  float a1 = phi - Om*t1*P, a2 = phi - Om*t2*P;
  float n1 = fbmDisc(vec3(cos(a1)*2.6, sin(a1)*2.6, lr*11.0) + 3.7);
  float n2 = fbmDisc(vec3(cos(a2)*2.6, sin(a2)*2.6, lr*11.0) + 17.1);
  return mix(n2, n1, w1);
}
// One disc image: emission (premultiplied by coverage) and opacity.
vec4 discImage(vec4 g4, float incid){      // incid: |cos| of the view to the disc normal (opacity only)
  if (g4.w < 1e-3) return vec4(0.0);
  vec3 h = g4.xyz/g4.w; float cov = g4.w;
  vec2 xz = h.xy; float g = h.z;
  float r = length(xz);
  if (r < u_rIn*0.8 || r > u_rOut*1.08 || g <= 0.0) return vec4(0.0);
  float phi = atan(xz.y, xz.x) + u_az, lr = log(r);
  float n = discTex(r, phi, lr);
  float streak = vn3(vec3(cos(phi)*1.1, sin(phi)*1.1, lr*42.0) + 5.0);
  float x = r/u_rIn;
  float F = max(1.0 - sqrt(1.0/x), 0.0)/(x*x*x);         // Novikov-Thorne-like flux, peak 0.0568 at x = 1.36
  float Fn = F/0.0568;
  float T = u_Tpeak*pow(max(Fn, 1e-4), 0.25)*g;
  // where neighbouring pixels land on different images (rays winding round the photon orbit, or the
  // switch between the rim and the lensed underside) the filtered coordinates are meaningless: fade out
  float jump = length(fwidth(xz))/r;
  float edge = 1.0 - smoothstep(0.25, 0.6, jump);
  float dens = edge*clamp(0.06 + u_contrast*pow(n, 2.6) + 0.55*streak*n, 0.0, 1.8);
  float I = pow(max(Fn, 1e-5), u_falloff)*g*g*g;          // softened beaming and falloff: the outer disc stays visible
  vec3 em = blackbody(T)*I*dens*u_discGain;
  // cooler, dusty outer disc: brown filaments that absorb more than they glow
  float dust = smoothstep(u_rIn*2.2, u_rIn*5.5, r)*smoothstep(0.42, 0.72, n + 0.25*streak);
  em *= 1.0 - 0.75*dust;
  em += vec3(0.30, 0.15, 0.07)*dust*0.35*u_discGain*edge*pow(max(Fn, 1e-5), 0.3);
  float thick = clamp(0.22/max(incid, 0.05), 1.0, 3.0);   // grazing views see more of the slab (opacity only)
  float a = clamp(dens*0.8*thick, 0.0, 0.985)*edge;
  return vec4(em*cov, a*cov);
}
void main(){
  vec2 ndc = vUv*2.0 - 1.0;
  vec3 d = normalize(u_F + ndc.x*u_tanX*u_R + ndc.y*u_tanY*u_U);
  vec3 dB = rotY(d, u_az);                               // into the bake's azimuth
  vec4 G0 = G(u_g0), G1 = G(u_g1), G2 = G(u_g2), G3 = G(u_g3);
  // exact shadow: an ingoing ray is captured iff its impact parameter b = h / v_inf is below 3 sqrt(3)
  float rc = length(u_cam), h = length(cross(u_cam, d));
  float b = h/sqrt(max(1.0 - 2.0*h*h/(rc*rc*rc), 1e-4));
  float db = dot(u_cam, d) < 0.0 ? b - 5.19615 : 1e3;
  float fwb = max(fwidth(db), 1e-5);
  float esc = smoothstep(-fwb, fwb, db);
  vec3 e = rotY(normalize(dB + G0.xyz), -u_az);
  float fp = max(length(dFdx(e)), length(dFdy(e)));
  vec3 bg = (((u_dbg & 8) != 0 ? vec3(0.0) : stars(e, fp)*u_starGain) + texture(u_sky, e).rgb*u_skyGain)*esc;
  // images from rays that had already wound round the hole (bend > 90 deg) are the n >= 1 rings: near the
  // edge they alias between texels, so they hand over to the analytic ring below
  float wind = smoothstep(0.05, 0.4, db);
  G1 *= mix(wind, 1.0, smoothstep(-0.3, 0.1, G3.x)); G2 *= mix(wind, 1.0, smoothstep(-0.3, 0.1, G3.y));
  vec4 i1 = (u_dbg & 2) != 0 ? vec4(0.0) : discImage(G1, 0.2), i2 = (u_dbg & 4) != 0 ? vec4(0.0) : discImage(G2, 0.3);
  vec3 col = i1.rgb + (1.0 - i1.a)*(i2.rgb + (1.0 - i2.a)*bg);
  // photon ring: rays just outside the critical impact parameter wind round the photon orbit and carry
  // the stacked higher-order images of the disc; each order is ~e^-pi thinner -> an exponential wall
  float ringW = max(0.03, 1.5*fwb);
  float ring = db > 0.0 ? exp(-db/ringW) + 0.22*exp(-db/0.16) : 0.0;
  if ((u_dbg & 16) == 0) col += blackbody(u_Tpeak*0.85)*ring*u_ringGain*smoothstep(-fwb, 2.0*fwb, db);
  // the glowing corona around the disc plane (kept out of the shadow: rays falling in see little of it)
  if ((u_dbg & 1) == 0) col += blackbody(u_Tpeak*0.62)*G0.w*u_hazeGain*(1.0 - 0.6*i1.a)*mix(0.12, 1.0, esc);
  o = vec4(min(col, vec3(6e4)), 1.0);
}`;

// The landing page's shading pass: FS_BH_SHADE's uniforms and helpers verbatim, with this main() in place of the
// demo's. The shadow is analytic in the photon's (L, p_theta), from the ZAMO camera the page is actually at (u_z*):
// kerr.js shadowDist() is this code in float64 (read its comment for the maths).
const KERR_SHADE_MAIN = `
uniform vec3 u_zr, u_zth, u_zph;                        // the camera's ZAMO triad, world frame
uniform vec4 u_zamo;                                    // lapse alpha, frame drag omega, varpi, rho
uniform vec4 u_zcam;                                    // r, cos(theta), sin(theta), horizon r+
uniform float u_rInCut;                                 // inner edge the crossings were baked with
uniform float u_rDust, u_fluxK;                         // dust-lane radius scale (4.6 M); flux scale (4.6/r_in)^3, softened
float edgeK(float r, float rin){ return smoothstep(rin*0.88, rin*1.2, r)*(1.0 - smoothstep(u_rOut*0.62, u_rOut*1.01, r)); }
// discImage() for a spinning hole. The demo's ties the flux AND the dusty outer lanes to r_in; with r_in moving from
// 4.6 to 1.35 M that dimmed the whole disc and dusted it over. A thin disc's flux far out does not care where the disc
// ends, so here the flux is scaled by (4.6/r_in)^3 (u_fluxK: the outer disc keeps its a = 0 brightness, the inner edge
// burns hotter) and the dust keys to fixed radii (u_rDust). At a = 0 (u_fluxK = 1, u_rDust = r_in) it IS discImage().
vec4 discImageK(vec4 g4, float incid){
  if (g4.w < 1e-3) return vec4(0.0);
  vec3 h = g4.xyz/g4.w; float cov = g4.w;
  vec2 xz = h.xy; float g = h.z;
  float r = length(xz);
  if (r < u_rIn*0.8 || r > u_rOut*1.08 || g <= 0.0) return vec4(0.0);
  float phi = atan(xz.y, xz.x) + u_az, lr = log(r);
  float n = discTex(r, phi, lr);
  float streak = vn3(vec3(cos(phi)*1.1, sin(phi)*1.1, lr*42.0) + 5.0);
  float x = r/u_rIn;
  float F = max(1.0 - sqrt(1.0/x), 0.0)/(x*x*x);
  float Fn = F/0.0568*u_fluxK;
  float T = u_Tpeak*pow(max(Fn, 1e-4), 0.25)*g;
  float jump = length(fwidth(xz))/r;
  float edge = 1.0 - smoothstep(0.25, 0.6, jump);
  float dens = edge*clamp(0.06 + u_contrast*pow(n, 2.6) + 0.55*streak*n, 0.0, 1.8);
  float I = pow(max(Fn, 1e-5), u_falloff)*g*g*g;
  vec3 em = blackbody(T)*I*dens*u_discGain;
  float dust = smoothstep(u_rDust*2.2, u_rDust*5.5, r)*smoothstep(0.42, 0.72, n + 0.25*streak);
  em *= 1.0 - 0.75*dust;
  em += vec3(0.30, 0.15, 0.07)*dust*0.35*u_discGain*edge*pow(max(Fn, 1e-5), 0.3);
  float thick = clamp(0.22/max(incid, 0.05), 1.0, 3.0);
  float a = clamp(dens*0.8*thick, 0.0, 0.985)*edge;
  return vec4(em*cov, a*cov);
}
// F = min over r >= r+ of the radial potential R, and its gradient in (L, p_theta)
float edgeF(float L, float P, out float gL, out float gP){
  float a = u_spin, a2 = a*a, m2 = u_zcam.y*u_zcam.y, s2 = u_zcam.z*u_zcam.z;
  float Q = P*P + m2*(L*L/s2 - a2), K = Q + (L - a)*(L - a);
  float p = 0.5*(a2 - L*L - Q), q = 0.5*K, D = 4.0*p*p*p + 27.0*q*q;
  float r3 = u_zcam.w;
  if (D < 0.0) r3 = max(r3, 2.0*sqrt(-p/3.0)*cos(acos(clamp((1.5*q/p)*sqrt(-3.0/p), -1.0, 1.0))/3.0));
  float Del = r3*r3 - 2.0*r3 + a2;
  gL = -2.0*a*(r3*r3 + a2 - a*L) - 2.0*Del*(L - a) - Del*2.0*m2*L/s2;
  gP = -2.0*Del*P;
  return ((r3*r3 + (a2 - L*L - Q))*r3 + 2.0*K)*r3 - a2*Q;
}
// signed distance from the shadow's edge (M, < 0 inside): two Newton steps along the gradient
float shadowDist(float L, float P){
  float d = 0.0;
  for (int i = 0; i < 2; i++) {
    float gL, gP, F = edgeF(L, P, gL, gP), g = sqrt(gL*gL + gP*gP) + 1e-9, s = -F/g;
    d += s;
    if (abs(d) > 3.0) break;                             // far from the edge: one step is plenty
    L += s*gL/g; P += s*gP/g;
  }
  return d;
}
void main(){
  vec2 ndc = vUv*2.0 - 1.0;
  vec3 d = normalize(u_F + ndc.x*u_tanX*u_R + ndc.y*u_tanY*u_U);
  vec3 dB = rotY(d, u_az);                               // into the bake's azimuth
  vec4 G0 = G(u_g0), G1 = G(u_g1), G2 = G(u_g2), G3 = G(u_g3);
  // exact shadow from the photon's constants of motion (it arrives travelling along -d)
  float nr = dot(d, u_zr), nth = dot(d, u_zth), nph = dot(d, u_zph);
  float EF = 1.0/(u_zamo.x - u_zamo.y*u_zamo.z*nph);
  float db = nr < 0.0 ? shadowDist(-EF*u_zamo.z*nph, -EF*u_zamo.w*nth) : 1e3;
  db = clamp(db == db ? db : -50.0, -50.0, 50.0);
  float fwb = clamp(fwidth(db), 1e-5, 0.25);              // capped: F can jump deep inside the shadow, far from its edge
  float esc = smoothstep(-fwb, fwb, db);
  vec3 e = rotY(normalize(dB + G0.xyz), -u_az);
  float fp = max(length(dFdx(e)), length(dFdy(e)));
  vec3 bg = (((u_dbg & 8) != 0 ? vec3(0.0) : stars(e, fp)*u_starGain) + texture(u_sky, e).rgb*u_skyGain)*esc;
  // images from rays that had already wound round the hole (bend > 90 deg) are the n >= 1 rings: near the
  // edge they alias between texels, so they hand over to the analytic ring below
  float wind = smoothstep(0.05, 0.4, db);
  G1 *= mix(wind, 1.0, smoothstep(-0.3, 0.1, G3.x)); G2 *= mix(wind, 1.0, smoothstep(-0.3, 0.1, G3.y));
  // crossings were baked down to u_rInCut (the inner edge at the fastest spin): re-weight them to the edge at THIS spin
  if (G1.w > 1e-3) { float r = length(G1.xy/G1.w); G1 *= clamp(discEdge(r)/max(edgeK(r, u_rInCut), 1e-3), 0.0, 1.0); }
  if (G2.w > 1e-3) { float r = length(G2.xy/G2.w); G2 *= clamp(discEdge(r)/max(edgeK(r, u_rInCut), 1e-3), 0.0, 1.0); }
  vec4 i1 = (u_dbg & 2) != 0 ? vec4(0.0) : discImageK(G1, 0.2), i2 = (u_dbg & 4) != 0 ? vec4(0.0) : discImageK(G2, 0.3);
  vec3 col = i1.rgb + (1.0 - i1.a)*(i2.rgb + (1.0 - i2.a)*bg);
  // photon ring: rays just outside the critical curve wind round the photon orbit and carry the stacked
  // higher-order images of the disc; each order is ~e^-pi thinner -> an exponential wall
  float ringW = max(0.03, 1.5*fwb);
  float ring = db > 0.0 ? exp(-db/ringW) + 0.22*exp(-db/0.16) : 0.0;
  if ((u_dbg & 16) == 0) col += blackbody(u_Tpeak*0.85)*ring*u_ringGain*smoothstep(-fwb, 2.0*fwb, db);
  // the glowing corona around the disc plane (kept out of the shadow: rays falling in see little of it)
  if ((u_dbg & 1) == 0) col += blackbody(u_Tpeak*0.62)*G0.w*u_hazeGain*(1.0 - 0.6*i1.a)*mix(0.12, 1.0, esc);
  o = vec4(min(col, vec3(6e4)), 1.0);
}`;
const FS_KERR_SHADE = FS_BH_SHADE.slice(0, FS_BH_SHADE.indexOf('void main(){'))
  .replace('precision highp float; precision highp int;', 'precision highp float; precision highp int;\n#define GEOM_CUBE') + KERR_SHADE_MAIN;

// ------------------------------------------------------------------------------------------ state
const BH = {
  M_KM: 1.477e8,              // GM/c^2 of a 1e8 solar-mass hole, in km (1 M ~ 1 AU)
  rOut: 34.0, rHaze: 4.6,     // disc outer edge; the corona keeps the a = 0 inner edge (hazeProfile scales as r_in^1.4)
  A_MAX: 0.99,                // fastest spin the director uses; crossings are baked down to its inner edge
  CUBE: 1024, TILES: 8,       // bake resolution per face (main.js drops it to 512 on phones), tiles per face side
  cube: null, bake: null,     // bake = {cam: [rxz, y, 0], next (tiles fresh), total, done}; per-tile state in BH.tiles
  // look: the disc's flux follows its inner edge like a real thin disc's, (4.6/r_in)^3, softened to ^fluxExp so the
  // fastest spin's blaze stays on the right side of the tone map
  gain: {disc: 1.0, star: 1.0, haze: 0.05, ring: 1.0, sky: 0.0, Tpeak: 7500, falloff: 1.2, contrast: 2.6, fluxExp: 2.4},
  emptySky: null, dbg: 0,
};
const CUBE_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const CUBE_UPS = [[0,-1,0],[0,-1,0],[0,0,1],[0,0,-1],[0,-1,0],[0,-1,0]];

// (An early-out for the sky hidden behind MILLER -- ~40% of the frame at low orbit -- was tried and measured no
// faster on the Intel iGPU, A/B in one page: the cube fetches that need derivatives run regardless. Not kept.)
function bhPrograms(){
  program('bhGeom', VS_FULL, FS_KERR_GEOM);
  program('bhShade', VS_FULL, FS_KERR_SHADE);
}
function bhEnsureCube(){
  if (BH.cube) return;
  const S = BH.CUBE, c = {tex: [], fb: []};
  const fmts = [gl.RGBA16F, gl.RGBA16F, gl.RGBA16F, gl.RG16F];
  for (let k = 0; k < 4; k++) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
    gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 1, fmts[k], S, S);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    c.tex.push(t);
  }
  for (let f = 0; f < 6; f++) {
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    for (let k = 0; k < 4; k++) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, c.tex[k], 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('black-hole bake targets unsupported');
    c.fb.push(fb);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  BH.cube = c;
  // a 1x1 black cube stands in for a sky texture
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
  gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 1, gl.RGBA16F, 1, 1);
  BH.emptySky = t;
}
// ------------------------------------------------------------------------------------------ baking while the spin moves
// The cube is TILES x TILES tiles per face, each remembering the spin and the camera (r_xz, y) it was baked with. A tile
// is STALE when the spin has moved more than it can show -- half a texel: |da| <= b^2/5200 for the tile's closest
// impact parameter b (spin effects fall off like 1/b^2) -- or when the camera has drifted 0.02 M (MILLER's inclined
// orbit, ~20 min). Each frame bakes the stalest tiles inside a small GPU budget, so a spin move costs ~1 ms a frame and
// a hold costs nothing; a full re-bake is 75 ms of GPU on the Intel iGPU, far too much for one frame.
// The spin moves in steps of a few thousandths. The handful of tiles round the hole (b < 10 M: the shadow, the photon
// ring, the inner disc) re-bake every step, and the spin the ANALYTIC parts use (shadow, ring, the disc's inner edge)
// glides from the step's start to its end as those tiles land -- so geometry and analytic parts never disagree by more
// than half a texel, and nothing seams.
const SPIN_PLAN = [0.97, 0.25, 0.99, 0.02, 0.85, 0.45];     // the director's itinerary after the a = 0.6 start
BH.tiles = [];
BH.spin = {a: 0.6, from: 0.6, to: 0.6, target: 0.6, move: null, plan: 0, hold: 40, manual: 0, events: []};
BH.budgetMs = 1.2;            // GPU time a frame may spend re-baking (ms); main.js lowers it on phones
BH.tileMs = 0.2;              // estimated GPU ms per tile, refined by EXT_disjoint_timer_query_webgl2 when present
const B_NEAR = 10;            // tiles closer than this impact parameter (M) re-bake at every spin step

// Per tile: its smallest impact parameter from bake camera cam (M) -> spin tolerance; near = rebake every step.
function bhTileSetup(cam){
  const T = BH.TILES, r = Math.hypot(cam[0], cam[1]), hole = V.norm([-cam[0], -cam[1], 0]);
  BH.tiles = [];
  for (let face = 0; face < 6; face++) {
    const f = CUBE_DIRS[face], ri = V.norm(V.cross(f, CUBE_UPS[face])), u = V.cross(ri, f);
    const hz = V.dot(hole, f), hx = hz > 0 ? V.dot(hole, ri)/hz : 9, hy = hz > 0 ? V.dot(hole, u)/hz : 9;   // hole on this face
    for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
      const x0 = -1 + 2*tx/T, y0 = -1 + 2*ty/T, x1 = x0 + 2/T, y1 = y0 + 2/T;
      let best = Math.PI;
      if (hx >= x0 && hx <= x1 && hy >= y0 && hy <= y1) best = 0;
      else for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        if (i > 0 && i < 4 && j > 0 && j < 4) continue;                  // the edges bound the closest direction
        const d = V.norm(V.add(f, V.add(V.mul(ri, x0 + (x1 - x0)*i/4), V.mul(u, y0 + (y1 - y0)*j/4))));
        best = Math.min(best, Math.acos(clamp(V.dot(d, hole), -1, 1)));
      }
      const b = best < Math.PI/2 ? r*Math.sin(best) : r;
      BH.tiles.push({face, tx, ty, a: NaN, rxz: 0, y: 0, tol: Math.max(0.002, b*b/5200), near: b < B_NEAR});
    }
  }
}
// How stale tile t is for spin a and camera cam ([rxz, y]); >= 1 means re-bake it.
function bhStale(t, a, cam){
  if (!(t.a === t.a)) return Infinity;
  const drift = Math.max(Math.abs(cam[0] - t.rxz), Math.abs(cam[1] - t.y))/0.02;
  return Math.max(t.near ? (t.a === a ? 0 : Infinity) : Math.abs(a - t.a)/t.tol, drift);
}
// Start a full bake for a camera at camM (BH frame, M) and spin a: every tile goes stale. Used at boot (and by tests):
// bhBakeStep() then works through them. Only r and the height above the disc matter: the camera is rotated to azimuth 0
// and the shading pass rotates back.
function bhStartBake(camM, a){
  bhEnsureCube();
  const cam = [Math.hypot(camM[0], camM[2]), camM[1], 0];
  if (a != null) { const S = BH.spin; S.a = S.from = S.to = S.target = a; S.move = null; }
  bhTileSetup(cam);
  BH.bake = {cam, next: 0, total: BH.tiles.length, done: false};
}
// Largest tile drift from camM (M): the 0.02 M rule, for tests and the HUD.
function bhBakeDrift(camM){
  let d = 0; const rxz = Math.hypot(camM[0], camM[2]);
  for (const t of BH.tiles) d = Math.max(d, t.a === t.a ? Math.max(Math.abs(rxz - t.rxz), Math.abs(camM[1] - t.y)) : 1e9);
  return BH.tiles.length ? d : 1e9;
}
// Geometry-pass uniforms for a ZAMO camera at bake-frame position cam (azimuth 0) and spin a.
function bhGeomUniforms(Q, cam, a){
  const z = KERR.camera(cam, a);
  gl.useProgram(Q.p);
  gl.uniform4f(Q.u.u_camK, z.r, z.mu, z.st, Math.sqrt(z.Del));
  gl.uniform4f(Q.u.u_zamo, z.alpha, z.omega, z.varpi, z.rho);
  gl.uniform3fv(Q.u.u_er, z.er); gl.uniform3fv(Q.u.u_eth, z.eth); gl.uniform3fv(Q.u.u_eph, z.eph);
  gl.uniform1f(Q.u.u_spin, a); gl.uniform1f(Q.u.u_rIn, BH.rHaze); gl.uniform1f(Q.u.u_rOut, BH.rOut);
  gl.uniform1f(Q.u.u_rInCut, KERR.rIn(BH.A_MAX)); gl.uniform1f(Q.u.u_uH, 1/(KERR.horizon(a) + 0.01));
  gl.uniform1i(Q.u.u_maxSteps, 900);
  gl.uniform1f(Q.u.u_tanX, 1); gl.uniform1f(Q.u.u_tanY, 1);
}
// Bake up to n of the stalest tiles at the current step's spin and the bake camera. Returns true when none is stale.
let bhTimer = null;
function bhBakeStep(n, camM){
  const b = BH.bake; if (!b) return false;
  if (camM) b.cam = [Math.hypot(camM[0], camM[2]), camM[1], 0];
  const a = BH.spin.to, cam = b.cam, list = [];
  for (const t of BH.tiles) { const s = bhStale(t, a, cam); if (s >= 1) list.push([s, t]); }
  if (!list.length) { b.done = true; return true; }
  list.sort((p, q) => q[0] - p[0]);
  const S = BH.CUBE, T = BH.TILES, ts = S/T, Q = P.bhGeom, m = Math.min(n, list.length);
  gl.disable(gl.BLEND); gl.enable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, S, S);
  bhGeomUniforms(Q, cam, a);
  const tq = bhTimer && !bhTimer.pending ? bhTimer : null;
  if (tq) { gl.beginQuery(tq.ext.TIME_ELAPSED_EXT, tq.q); }
  for (let k = 0; k < m; k++) {
    const t = list[k][1], f = CUBE_DIRS[t.face], r = V.norm(V.cross(f, CUBE_UPS[t.face])), u = V.cross(r, f);
    gl.bindFramebuffer(gl.FRAMEBUFFER, BH.cube.fb[t.face]);
    gl.uniform3fv(Q.u.u_R, r); gl.uniform3fv(Q.u.u_U, u); gl.uniform3fv(Q.u.u_F, f);
    gl.scissor(t.tx*ts, t.ty*ts, ts, ts);
    fullscreen();
    t.a = a; t.rxz = cam[0]; t.y = cam[1];
  }
  if (tq) { gl.endQuery(tq.ext.TIME_ELAPSED_EXT); tq.pending = m; }
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  b.next = BH.tiles.filter(t => bhStale(t, a, cam) < 1).length;
  b.done = m === list.length;
  return b.done;
}
// Timer-query refinement of the per-tile cost (the budget's unit). Harmless where the extension is missing.
function bhTimerPoll(){
  if (bhTimer === null) { const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); bhTimer = ext ? {ext, q: gl.createQuery(), pending: 0} : false; }
  if (!bhTimer || !bhTimer.pending) return;
  if (!gl.getQueryParameter(bhTimer.q, gl.QUERY_RESULT_AVAILABLE)) return;
  const ok = !gl.getParameter(bhTimer.ext.GPU_DISJOINT_EXT), ms = gl.getQueryParameter(bhTimer.q, gl.QUERY_RESULT)/1e6;
  if (ok && ms > 0) BH.tileMs += (clamp(ms/bhTimer.pending, 0.01, 20) - BH.tileMs)*0.3;
  bhTimer.pending = 0;
}

// The spin director: holds a spin, then eases to the next one on SPIN_PLAN. Moves are parameterised in ISCO radius,
// which slows them where the geometry changes fastest (a -> 1). `[` / `]` (main.js) nudge the target and pause it.
function spinFromIsco(x){ let lo = 0, hi = BH.A_MAX; for (let i = 0; i < 30; i++) { const m = 0.5*(lo + hi); (KERR.isco(m) > x ? (lo = m) : (hi = m)); } return 0.5*(lo + hi); }
function bhSpinTo(target, seconds){
  const S = BH.spin, a0 = S.target, a1 = clamp(target, 0, BH.A_MAX);
  if (Math.abs(a1 - a0) < 1e-3) return;
  S.move = {x0: KERR.isco(a0), x1: KERR.isco(a1), a1, t: 0, dur: seconds || (14 + 9*Math.abs(KERR.isco(a1) - KERR.isco(a0)))};
  S.events.push({type: 'spinMove', from: a0, to: a1});
}
function bhSpinNudge(d){ const S = BH.spin; S.manual = 90; bhSpinTo((S.move ? S.move.a1 : S.target) + d, 5); }
function spinDirector(dt){
  const S = BH.spin;
  if (S.move) {
    const m = S.move; m.t += dt;
    const k = smooth01(m.t/m.dur);
    S.target = k >= 1 ? m.a1 : spinFromIsco(m.x0 + (m.x1 - m.x0)*k);
    if (m.t >= m.dur) { S.move = null; S.hold = 45 + 30*Math.random(); S.events.push({type: 'spinHold', a: m.a1}); }
  } else if (S.manual > 0) S.manual -= dt;
  else if ((S.hold -= dt) <= 0) { bhSpinTo(SPIN_PLAN[S.plan % SPIN_PLAN.length]); S.plan++; }
}
// Largest spin step: the prograde photon orbit may move <= 0.012 M (~0.3 texel) per step.
function spinStep(a){ const d = (KERR.photonOrbit(Math.min(a + 1e-3, 1), 1) - KERR.photonOrbit(Math.max(a - 1e-3, 0), 1))/2e-3; return clamp(0.012/Math.max(Math.abs(d), 1e-6), 0.0015, 0.02); }
// Per frame (main.js): steer the spin, advance it one step at a time, bake the stalest tiles inside the budget.
function bhUpdate(camM, dt){
  const S = BH.spin, b = BH.bake; if (!b) return;
  bhTimerPoll();
  spinDirector(dt);
  if (S.from === S.to && Math.abs(S.target - S.to) > 1e-4) { const st = spinStep(S.to); S.to = S.from + clamp(S.target - S.from, -st, st); }
  const n = clamp(Math.floor(BH.budgetMs/Math.max(BH.tileMs, 0.02)), 1, 24);
  bhBakeStep(n, camM);
  // the analytic parts glide across the step as its near tiles land
  let near = 0, done = 0;
  for (const t of BH.tiles) if (t.near) { near++; if (t.a === S.to) done++; }
  const k = near ? done/near : 1;
  S.a = S.from + (S.to - S.from)*k;
  if (k >= 1) S.from = S.to;
}
// The spin the picture shows (the shadow, ring and disc edge must agree with the baked geometry).
function bhSpin(){ return BH.spin.a; }
// Shade the hole into fb. camM = the camera in the BH frame (M); the baked geometry is valid for it as long as
// bhBakeDrift(camM) is small, at ANY azimuth: the pass rotates the view into the bake's frame by camM's own az.
function bhShade(fb, w, h, basis, tanHalf, timeSec, camM){
  const g = BH.gain, Q = P.bhShade, az = Math.atan2(camM[2], camM[0]), a = bhSpin(), z = KERR.camera(camM, a);
  const rin = KERR.rIn(a), k = BH.rHaze/rin;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
  gl.useProgram(Q.p);
  for (let i = 0; i < 4; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_CUBE_MAP, BH.cube.tex[i]); }
  gl.uniform1i(Q.u.u_g0, 0); gl.uniform1i(Q.u.u_g1, 1); gl.uniform1i(Q.u.u_g2, 2); gl.uniform1i(Q.u.u_g3, 3);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_CUBE_MAP, BH.emptySky); gl.uniform1i(Q.u.u_sky, 4);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform3fv(Q.u.u_R, basis.r); gl.uniform3fv(Q.u.u_U, basis.u); gl.uniform3fv(Q.u.u_F, basis.f);
  gl.uniform1f(Q.u.u_tanX, tanHalf*w/h); gl.uniform1f(Q.u.u_tanY, tanHalf);
  gl.uniform1f(Q.u.u_az, az); gl.uniform1f(Q.u.u_time, timeSec);
  gl.uniform3fv(Q.u.u_zr, z.er); gl.uniform3fv(Q.u.u_zth, z.eth); gl.uniform3fv(Q.u.u_zph, z.eph);
  gl.uniform4f(Q.u.u_zamo, z.alpha, z.omega, z.varpi, z.rho); gl.uniform4f(Q.u.u_zcam, z.r, z.mu, z.st, KERR.horizon(a));
  gl.uniform1f(Q.u.u_spin, a); gl.uniform1f(Q.u.u_rIn, rin); gl.uniform1f(Q.u.u_rOut, BH.rOut); gl.uniform1f(Q.u.u_rInCut, KERR.rIn(BH.A_MAX));
  gl.uniform1i(Q.u.u_dbg, BH.dbg | 0);
  gl.uniform1f(Q.u.u_discGain, g.disc); gl.uniform1f(Q.u.u_starGain, g.star); gl.uniform1f(Q.u.u_hazeGain, g.haze);
  gl.uniform1f(Q.u.u_ringGain, g.ring); gl.uniform1f(Q.u.u_Tpeak, g.Tpeak); gl.uniform1f(Q.u.u_falloff, g.falloff); gl.uniform1f(Q.u.u_contrast, g.contrast);
  gl.uniform1f(Q.u.u_rDust, BH.rHaze); gl.uniform1f(Q.u.u_fluxK, Math.pow(k, g.fluxExp));
  gl.uniform1f(Q.u.u_skyGain, 0);
  fullscreen();
}
