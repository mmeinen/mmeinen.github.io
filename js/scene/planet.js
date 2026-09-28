'use strict';
// planet.js — MILLER and its moon: the deferred planet renderer, lit by Gargantua's disc.
//
// PORTED from demo/js/deep.js. The shader strings below are the demo's, unchanged except where marked
// "index:" (the ring program is left out: MILLER has no rings), so a fix in either copy can be mirrored by
// diffing them. The JS drives them from an explicit body list built by orbit.js instead of the demo's
// deep-zoom state.
//
// Why deferred: one monolithic planet shader throttled every pixel through register pressure (sky pixels paid
// for terrain they never ran). A lean BASE pass finds the nearest body per pixel and writes a hit buffer; one
// small program per material, scissored to that body's projected rect, shades it; the habitable world's
// clouds + atmosphere composite last. See memory/igpu-shader-perf-lessons.

// ------------------------------------------------------------------------------ shaders (from demo/js/deep.js)
// Star system, DEFERRED. One huge shader throttled every pixel (register pressure: sky pixels paid for
// terrain they never ran), so it is split: a lean BASE pass finds the nearest body per pixel and writes
// a hit buffer; then one small pass per material, scissored to that body's projected bounds, shades it;
// rings blend over; the habitable world's clouds + atmosphere composite last.
// All positions arrive camera-relative in km; |oc|^2 - R^2 is precomputed in float64 so the stable
// root is exact at 1 km altitude. The focus body's noise uses a split-precision ANCHOR (terrain()).
const FS_SYS_COMMON = `#version 300 es
precision highp float; precision highp int;
in vec2 vUv;
uniform sampler2D u_sky;
uniform vec3 u_camR, u_camU, u_camF;
uniform float u_tanHalf, u_aspect, u_pixAng, u_time, u_skyGain, u_dotVis;
uniform int u_n, u_focus, u_ringBody, u_atmBody;
uniform vec4 u_bPos[10];     // centre rel. camera (km), radius (km)
uniform vec4 u_bInfo[10];    // type, seed, c = |oc|^2 - R^2 (km^2), light
uniform vec3 u_bSun[10];     // unit vector body -> star
uniform vec3 u_bCol[10];     // colour as a point of light
uniform mat3 u_bRot[10];     // world -> body-local (spinning)
uniform vec3 u_starCol, u_lightCol;
uniform float u_skyDim;                          // how hard daylight hides the background (1 stars, low for a hole)       // light colour: white for stars, warm for Gargantua's disc
uniform float u_starPt, u_starRad, u_ringIn, u_ringOut;
uniform vec3 u_aHi, u_aLo, u_camRel;
uniform int u_dbg, u_body;
uniform highp sampler2D u_gb;       // deferred hit buffer: (body index, t km)
uniform sampler2D u_tLUT;           // sun optical depth (mu, height), includes the planet's shadow

uint pcgh(uint v){ uint s = v*747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s)*277803737u; return (w >> 22u) ^ w; }
uint h3(ivec3 c){ uvec3 u = uvec3(c); uint h = u.x*73856093u ^ u.y*19349663u ^ u.z*83492791u; h ^= h >> 13u; h *= 0x5bd1e995u; return h ^ (h >> 15u); }
// Lattice hash: one multiply per AXIS (neighbours are +K, an add), then a cheap finaliser per corner.
// Intel iGPUs run 32-bit integer multiplies at reduced rate; this needs 3 + 16 instead of 32.
const uvec3 HK = uvec3(0x8da6b343u, 0xd8163841u, 0xcb1ab31fu);
float hf(uint h){ h ^= h >> 16u; h *= 0x85ebca6bu; h ^= h >> 13u; h *= 0xc2b2ae35u; h ^= h >> 16u; return float(h >> 8u)*(2.0/16777215.0) - 1.0; }
float hv(ivec3 c){ uvec3 u = uvec3(c)*HK; return hf(u.x ^ u.y ^ u.z); }
vec3 hv3(ivec3 c){ uint h = h3(c); return vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u))/1023.0; }
float h1(float x){ return float(pcgh(uint(int(x)) + 7919u) >> 8u)/16777215.0; }

// value noise + analytic gradient (quintic); lattice cell = I + floor(F)
vec4 noised(ivec3 I, vec3 F){
  vec3 fl = floor(F); ivec3 c = I + ivec3(fl); vec3 w = F - fl;
  vec3 u = w*w*w*(w*(w*6.0-15.0)+10.0);
  vec3 du = 30.0*w*w*(w*(w-2.0)+1.0);
  uvec3 p0 = uvec3(c)*HK, p1 = p0 + HK;
  float a = hf(p0.x ^ p0.y ^ p0.z), b = hf(p1.x ^ p0.y ^ p0.z), cc = hf(p0.x ^ p1.y ^ p0.z), d = hf(p1.x ^ p1.y ^ p0.z),
        e = hf(p0.x ^ p0.y ^ p1.z), f = hf(p1.x ^ p0.y ^ p1.z), g = hf(p0.x ^ p1.y ^ p1.z), h = hf(p1.x ^ p1.y ^ p1.z);
  float k1 = b-a, k2 = cc-a, k3 = e-a, k4 = a-b-cc+d, k5 = a-cc-e+g, k6 = a-b-e+f, k7 = -a+b+cc-d+e-f-g+h;
  return vec4(a + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z,
    du*vec3(k1 + k4*u.y + k6*u.z + k7*u.y*u.z, k2 + k5*u.z + k4*u.x + k7*u.z*u.x, k3 + k6*u.x + k5*u.y + k7*u.x*u.y));
}
// value noise on the same cheap lattice hash (a 64^3 texture was tried: its period and 8-bit filter
// weights showed up as tiling and contour rims in the clouds)
float vnoise(vec3 x){
  vec3 fl = floor(x), w = x - fl, u = w*w*(3.0 - 2.0*w);
  uvec3 p0 = uvec3(ivec3(fl))*HK, p1 = p0 + HK;
  return mix(mix(mix(hf(p0.x ^ p0.y ^ p0.z), hf(p1.x ^ p0.y ^ p0.z), u.x), mix(hf(p0.x ^ p1.y ^ p0.z), hf(p1.x ^ p1.y ^ p0.z), u.x), u.y),
             mix(mix(hf(p0.x ^ p0.y ^ p1.z), hf(p1.x ^ p0.y ^ p1.z), u.x), mix(hf(p0.x ^ p1.y ^ p1.z), hf(p1.x ^ p1.y ^ p1.z), u.x), u.y), u.z);
}
// octave count from the pixel footprint: stop once a feature would be smaller than ~2 pixels
float octs(float fp, float base, float mx){ return clamp(log2(0.5/(fp*base)) + 1.0, 1.0, mx); }
float fbmV(vec3 p, float oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 12; i++) { float fi = float(i); if (fi >= oct) break;
    s += a*vnoise(p)*clamp(oct - fi, 0.0, 1.0); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
float vn1(float x){ float i = floor(x), f = x - i; f = f*f*(3.0-2.0*f); return mix(h1(i), h1(i+1.0), f); }

// Terrain height + gradient on the unit sphere. For the focus body (anch) the sample point is
// anchor + dq with the anchor split into hi/lo floats: frequencies are powers of two, so aHi*f is
// EXACT and only the small dq*f carries rounding. That is what keeps 22 octaves stable at 1 km.
float terrain(vec3 q, vec3 dq, bool anch, float oct, int seed, out vec3 g, out float hd){
  float h = 0.0, a = 0.5; vec3 ds = vec3(0.0); g = vec3(0.0); hd = 0.0;
  for (int i = 0; i < 22; i++) {
    float fi = float(i); if (fi >= oct) break;
    float f = exp2(fi + 1.0);
    ivec3 off = ivec3(i*1013 + seed, i*7919 - seed, i*3571);
    if (h + a*1.2 < -0.02) break;                    // deep ocean: later octaves can't reach sea level
    vec4 n;
    if (anch) { vec3 X = u_aHi*f; vec3 Xi = floor(X); n = noised(ivec3(Xi) + off, (X - Xi) + u_aLo*f + dq*f); }
    else n = noised(off, q*f);
    float w = clamp(oct - fi, 0.0, 1.0);
    if (i >= 5) {                                    // ridged octaves on high ground: mountain ranges
      // soft |n| (sqrt(n^2 + e)): a hard crease at low octaves drew razor edges across whole continents
      float m = 0.85*smoothstep(0.04, 0.2, h), sa = sqrt(n.x*n.x + 0.004), v = 1.0 - sa;
      n = mix(n, vec4(v*v - 0.35, -2.0*v*(n.x/sa)*n.yzw), m);
    }
    if (i < 7) ds += n.yzw;
    float ero = 1.0/(1.0 + 0.25*dot(ds, ds));          // erosion-like: steep low octaves damp detail
    h += w*a*n.x*ero;
    g += w*a*f*n.yzw*ero*(i >= 7 ? 1.7 : 1.0);     // rougher at small scales, as real ground is
    if (i >= 6) hd += w*n.x*0.35;
    a *= 0.5;                                        // equal slope per octave: detail at every zoom
  }
  return h;
}

float cloudD(vec3 q, float oct, float soft){
  vec3 p = q*2.6 + vec3(u_time*0.0025, 0.0, 0.0);
  p += vec3(vnoise(p*1.7 + 3.1), vnoise(p*1.7 + 8.3), vnoise(p*1.7 + 1.9))*0.35;
  float s = 0.0, a = 0.55;
  for (int i = 0; i < 11; i++) { float fi = float(i); if (fi >= oct) break;
    s += a*vnoise(p)*clamp(oct - fi, 0.0, 1.0); p = p*2.1 + vec3(3.3, 1.1, 7.7); a *= 0.52; }
  float lat = abs(q.y);
  float bias = -0.1 + 0.14*smoothstep(0.12, 0.32, lat) - 0.12*smoothstep(0.55, 0.85, lat) + 0.1*smoothstep(0.0, 0.08, 0.08 - lat);
  return smoothstep(0.08 - soft, 0.3 + soft, s + bias);
}

vec3 shadeTerran(vec3 q, vec3 dq, bool anch, vec3 Nw, float fp, vec3 rd, vec3 L, float light, mat3 M, int seed){
  float oct = octs(fp, 2.0, (u_dbg & 4) != 0 ? 8.0 : 22.0);
  vec3 g; float hd; float h = terrain(q, dq, anch, oct, seed, g, hd) - 0.01;
  vec3 Ll = M*L;
  float lat = abs(q.y);
  float moist = vnoise(q*3.3 + 11.0)*0.6 + vnoise(q*7.1 + 2.0)*0.3;
  float temp = 1.0 - lat*1.2 - max(h, 0.0)*1.1 + vnoise(q*5.0)*0.1;
  vec3 Nl = q, col;
  bool ocean = h < 0.0;
  if (!ocean) {
    vec3 gt = g - q*dot(g, q);
    Nl = normalize(q - 0.16*gt);
    float slope = 1.0 - dot(Nl, q);
    vec3 desert = vec3(0.36,0.27,0.17), forest = vec3(0.035,0.075,0.028), grass = vec3(0.10,0.15,0.05),
         tundra = vec3(0.19,0.18,0.14), rock = vec3(0.17,0.155,0.14), snow = vec3(0.85,0.88,0.92), sand = vec3(0.45,0.40,0.29);
    col = mix(desert, mix(grass, forest, smoothstep(0.05, 0.45, moist)), smoothstep(-0.3, 0.05, moist));
    col = mix(tundra, col, smoothstep(0.12, 0.34, temp));
    col = mix(col, rock, smoothstep(0.08, 0.25, slope));
    col = mix(col, forest, smoothstep(0.1, 0.5, vnoise(q*37.0)*0.5 + hd*0.8)*smoothstep(-0.1, 0.2, moist)*smoothstep(0.35, 0.6, temp)*(1.0 - smoothstep(0.08, 0.2, slope)));
    col *= 0.78 + 0.44*clamp(0.5 + hd, 0.0, 1.0);
    col = mix(col, sand, 1.0 - smoothstep(0.0, 0.01, h));
    col = mix(col, snow, clamp(smoothstep(0.1, 0.0, temp) + smoothstep(0.3, 0.45, h)*smoothstep(0.3, 0.1, slope), 0.0, 1.0));
  } else {
    col = mix(vec3(0.02,0.13,0.18), vec3(0.004,0.022,0.07), smoothstep(0.0, 0.1, -h));
    col = mix(col, vec3(0.82,0.88,0.94), smoothstep(0.06, -0.04, temp));
  }
  vec3 N = transpose(M)*Nl;
  float dS = dot(Nw, L);
  float cs = (u_dbg & 8) == 0 && dot(q, Ll) > -0.1 ? 1.0 - 0.45*cloudD(normalize(q + Ll*0.0018/max(dot(q, Ll), 0.2)), min(oct, 3.0), 0.18) : 1.0;
  float dif = max(dot(N, L), 0.0)*smoothstep(-0.06, 0.12, dS);
  vec3 c = col*(dif*1.7*light*cs*u_lightCol + 0.012);
  if (ocean) {
    vec3 wv = vec3(0.0); float fq = 3000.0;
    for (int k = 0; k < 4; k++) {
      float lod = smoothstep(0.5, 0.1, fp*fq);
      if (lod <= 0.0) break;
      vec3 gw = noised(ivec3(k*97, 11, 5), q*fq + vec3(0.0, 0.0, u_time*0.02*fq/3000.0)).yzw;
      wv += lod*gw; fq *= 3.7;
    }
    vec3 Nwv = normalize(q - 0.06*(wv - q*dot(wv, q)));
    vec3 Nw2 = transpose(M)*Nwv;
    vec3 H = normalize(L - rd);
    float nh = max(dot(Nw2, H), 0.0);
    c += vec3(1.0,0.93,0.8)*u_lightCol*(pow(nh, 400.0)*9.0 + pow(nh, 40.0)*0.12)*light*cs*smoothstep(0.0, 0.1, dS);
    c += vec3(0.2,0.35,0.6)*0.08*pow(1.0 - max(dot(Nw2, -rd), 0.0), 5.0)*smoothstep(-0.1, 0.2, dS);
  } else if (dS < 0.05) {
    float night = smoothstep(0.05, -0.18, dS);
    float mask = smoothstep(0.62, 0.85, vnoise(q*9.0 + 5.0)*0.5 + 0.5 + moist*0.15)
               * smoothstep(0.18, 0.4, temp)*(1.0 - smoothstep(0.015, 0.12, h));
    float lights = 0.0, fq = 90.0, am = 0.5;
    for (int k = 0; k < 4; k++) {
      float lod = smoothstep(0.6, 0.15, fp*fq);
      lights += am*mix(0.1, smoothstep(0.55, 0.85, vnoise(q*fq)*0.5 + 0.5), lod);
      fq *= 4.0; am *= 0.75;
    }
    c += vec3(1.0,0.62,0.28)*mask*lights*night*0.9;
  }
  return c;
}

vec3 shadeGas(vec3 q, float fp, int seed, bool ice, vec3 tint){
  float oct = octs(fp, 3.0, 10.0);
  vec3 sc = normalize(vec3(0.55, -0.33, 0.77));
  float dsd = distance(q, sc), sw = 4.0*exp(-dsd*dsd/0.006);
  float cs = cos(sw), sn = sin(sw);
  vec3 p = q*cs + cross(sc, q)*sn + sc*dot(sc, q)*(1.0 - cs);
  float lat = p.y, drift = u_time*0.004*sin(lat*23.0);
  vec3 pp = vec3(p.x*cos(drift) - p.z*sin(drift), p.y, p.x*sin(drift) + p.z*cos(drift));
  float t = fbmV(pp*vec3(3.0, 11.0, 3.0) + float(seed), oct);
  float band = lat*(ice ? 3.5 : 8.5) + t*(ice ? 0.22 : 0.55);
  float b1 = sin(band*6.2831)*0.5 + 0.5, b2 = sin(band*19.5 + 1.3)*0.5 + 0.5;
  vec3 col = ice ? mix(vec3(0.55,0.78,0.86), vec3(0.40,0.64,0.80), b1*0.6 + b2*0.2)
                 : mix(mix(vec3(0.87,0.78,0.63), vec3(0.70,0.50,0.34), b1), vec3(0.96,0.93,0.85), b2*0.35);
  if (!ice) col = mix(col, vec3(0.74,0.30,0.17), smoothstep(0.075, 0.03, dsd)*0.85);
  return mix(col, col*tint*1.4, 0.35);
}

float crater(vec3 p, out vec3 g){
  vec3 fl = floor(p); ivec3 c = ivec3(fl); vec3 f = p - fl;
  float bd = 8.0, brad = 0.3; vec3 bv = vec3(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec3 cc = c + ivec3(x, y, z); vec3 hp = hv3(cc);
    vec3 r = vec3(x, y, z) + hp - f; float d = dot(r, r);
    if (d < bd) { bd = d; bv = r; brad = 0.12 + 0.28*fract(hp.x*7.13 + hp.z*3.1); }
  }
  float d = sqrt(bd), x = d/brad; vec3 dir = -bv/max(d, 1e-5);
  float h, dh;
  if (x < 1.0) { h = x*x - 1.0; dh = 2.0*x/brad; }
  else { float y = (x - 1.0)/0.5; float e = exp(-3.0*y*y); h = 0.3*e; dh = 0.3*e*(-6.0*y)/(0.5*brad); }
  g = dir*dh; return h;
}

vec3 shadeRock(vec3 q, float fp, int seed, int type, out vec3 Nl, out vec3 emit){
  float oct = octs(fp, 4.0, 12.0);
  float alb = fbmV(q*4.0 + float(seed), oct);
  vec3 g = vec3(0.0); float hc = 0.0;
  for (int k = 0; k < 3; k++) {
    float fr = 5.0*pow(3.3, float(k));
    if (fp*fr > 0.25) break;
    vec3 gk; hc += crater(q*fr + float(seed + k*31), gk)/fr; g += gk*(k == 0 ? 0.6 : 0.4);
  }
  Nl = normalize(q - 0.035*(g - q*dot(g, q)));
  emit = vec3(0.0);
  vec3 col;
  if (type == 6) col = mix(vec3(0.10,0.098,0.095), vec3(0.24,0.235,0.225), smoothstep(-0.3, 0.3, alb));
  else if (type == 2) {
    col = mix(vec3(0.07,0.06,0.06), vec3(0.2,0.16,0.14), smoothstep(-0.3, 0.3, alb));
    float cr = abs(vnoise(q*9.0 + float(seed))) + 0.5*abs(vnoise(q*23.0));
    emit = vec3(1.0,0.32,0.05)*3.0*(1.0 - smoothstep(0.0, 0.07, cr));
  } else col = mix(vec3(0.24,0.13,0.07), vec3(0.36,0.25,0.16), smoothstep(-0.3, 0.3, alb + hc*0.3));
  return col;
}

vec3 shadeStar(vec3 q, vec3 Nw, vec3 rd, float fp, int seed){
  float mu = max(dot(Nw, -rd), 0.0);
  float limb = 0.3 + 0.7*pow(mu, 0.55);
  float gr = fbmV(q*32.0 + vec3(0.0, u_time*0.01, 0.0), octs(fp, 32.0, 7.0));
  float spot = smoothstep(0.32, 0.46, vnoise(q*5.0 + float(seed)))*smoothstep(0.5, 0.15, abs(q.y));
  return u_starCol*u_starRad*limb*(0.82 + 0.4*gr)*(1.0 - 0.8*spot);
}

float ringDens(float r, float fp){
  float span = u_ringOut - u_ringIn, x = (r - u_ringIn)/span;
  if (x <= 0.0 || x >= 1.0) return 0.0;
  float oct = clamp(log2(0.5*span/(fp*40.0)) + 1.0, 1.0, 9.0);
  float s = 0.0, a = 0.5, f = 40.0;
  for (int i = 0; i < 9; i++) { float fi = float(i); if (fi >= oct) break;
    s += a*(vn1(x*f) - 0.5)*clamp(oct - fi, 0.0, 1.0); f *= 2.3; a *= 0.62; }
  float d = 0.62 + 1.1*s;
  d *= smoothstep(0.0, 0.05, x)*smoothstep(1.0, 0.92, x);
  d *= smoothstep(0.012, 0.03, abs(x - 0.64));
  d *= smoothstep(0.002, 0.006, abs(x - 0.89));
  d *= mix(0.3, 1.0, smoothstep(0.1, 0.28, x));
  return clamp(d, 0.0, 0.95);
}

// Rayleigh + Mie single scattering, Earth coefficients in planet-radius units.
vec3 atmo(vec3 ro, vec3 rd, float tMax, vec3 L, out vec3 tr){
  const float RA = 1.0125, HR = 0.00135, HM = 0.00022;
  const vec3 BR = vec3(37.0, 86.0, 211.0); const float BM = 95.0;
  tr = vec3(1.0);
  float b = dot(ro, rd), c = dot(ro, ro) - RA*RA, disc = b*b - c;
  if (disc <= 0.0) return vec3(0.0);
  float s = sqrt(disc), t0 = max(0.0, -b - s), t1 = min(tMax, -b + s);
  if (t1 <= t0) return vec3(0.0);
  vec3 tauV = vec3(0.0), sR = vec3(0.0), sM = vec3(0.0);
  float span = t1 - t0, prev = 0.0;
  for (int i = 0; i < 8; i++) {
    float x1 = (float(i) + 1.0)/8.0; x1 *= x1;                  // dense near the camera
    float ds = (x1 - prev)*span, tm = t0 + (prev + x1)*0.5*span; prev = x1;
    vec3 p = ro + rd*tm;
    float hgt = max(length(p) - 1.0, 0.0);
    float dR = exp(-hgt/HR)*ds, dM = exp(-hgt/HM)*ds;
    vec3 stepTau = BR*dR + BM*1.1*dM;
    tauV += stepTau;
    float mu = dot(p, L)/length(p);
    vec2 lu = vec2(clamp((mu + 0.35)/1.35, 0.0, 1.0), sqrt(clamp(hgt/(RA - 1.0), 0.0, 1.0)));
    vec3 tauL = texture(u_tLUT, (lu*vec2(127.0, 47.0) + 0.5)/vec2(128.0, 48.0)).rgb;   // LUT is 128x48, built at i/(N-1)
    vec3 att = exp(-(tauV - stepTau*0.5 + tauL));
    sR += att*dR; sM += att*dM;
  }
  float mu = dot(rd, L), gg = 0.76;
  float pR = 0.0597*(1.0 + mu*mu);
  float pM = 0.1194*(1.0 - gg*gg)*(1.0 + mu*mu)/((2.0 + gg*gg)*pow(1.0 + gg*gg - 2.0*gg*mu, 1.5));
  tr = exp(-tauV);
  return 5.3*(sR*BR*pR + sM*BM*pM);
}

vec3 rayDir(){
  vec2 ndc = vUv*2.0 - 1.0;
  return normalize(u_camF + ndc.x*u_tanHalf*u_aspect*u_camR + ndc.y*u_tanHalf*u_camU);
}
`;

const FS_SYS_BASE = FS_SYS_COMMON + `
layout(location=0) out vec4 o;
layout(location=1) out vec4 oG;
void main(){
  vec3 rd = rayDir();
  vec3 col = texture(u_sky, vUv).rgb*u_skyGain;
  float tHit = 1e30; int hit = -1;
  for (int i = 0; i < 10; i++) {
    if (i >= u_n) break;
    vec3 C = u_bPos[i].xyz; float c = u_bInfo[i].z;
    float B = dot(C, rd), disc = B*B - c;
    if (u_bPos[i].w < 0.25*u_pixAng*length(C)) continue;     // sub-pixel: drawn as a point of light
    if (c > 0.0 && B > 0.0 && disc > 0.0) { float t = c/(B + sqrt(disc)); if (t < tHit) { tHit = t; hit = i; } }
  }
  // unresolved planets are points of light ("wandering stars")
  for (int i = 1; i < 10; i++) {
    if (i >= u_n) break;
    vec3 C = u_bPos[i].xyz; float dist = length(C);
    if (dot(C, rd) <= 0.0 || (hit >= 0 && tHit < dist)) continue;
    float ar = u_bPos[i].w/dist;
    if (ar > 2.0*u_pixAng) continue;
    float ang = length(cross(rd, C))/dist;
    float fl = u_bInfo[i].w*ar*ar/(u_pixAng*u_pixAng)*0.7 + 0.4*u_dotVis;
    col += u_bCol[i]*fl*exp(-ang*ang/(u_pixAng*u_pixAng*1.3));
  }
  // the star: a point source when far, a glare halo when near
  {
    vec3 C = u_bPos[0].xyz; float dist = length(C);
    if (hit != 0 && !(hit > 0 && tHit < dist) && dot(C, rd) > 0.0) {
      float ar = u_bPos[0].w/dist, ang = length(cross(rd, C))/dist;
      col += u_starCol*(u_starPt*exp(-ang*ang/(u_pixAng*u_pixAng*1.6))
                      + u_starRad*0.012*pow(ar/max(ang, ar), 1.6));
    }
  }
  o = vec4(min(col, vec3(6e4)), 1);
  oG = vec4(float(hit), tHit, 0.0, 0.0);
}`;

// Surface shading for one body (u_body); SURF_KIND is substituted per material program.
const FS_SYS_SURF = FS_SYS_COMMON + `
out vec4 o;
void main(){
  vec4 G = texelFetch(u_gb, ivec2(gl_FragCoord.xy), 0);
  int hit = int(floor(G.x + 0.5));
  if (hit != u_body) discard;
  vec3 rd = rayDir(); float tHit = G.y;
  vec3 C = u_bPos[hit].xyz; float R = u_bPos[hit].w;
  int type = int(u_bInfo[hit].x + 0.5), seed = int(u_bInfo[hit].y + 0.5);
  float light = u_bInfo[hit].w;
  vec3 Nw = normalize(rd*tHit - C);
  mat3 M = u_bRot[hit];
  vec3 q = normalize(M*Nw);
  float fp = u_pixAng*tHit/R/max(dot(Nw, -rd), 0.25);
  vec3 L = u_bSun[hit];
  bool anch = hit == u_focus;
  vec3 dq = u_camRel + (M*rd)*(tHit/R);
  vec3 col;
#if SURF_KIND == 0
  col = shadeStar(q, Nw, rd, fp, seed);
#elif SURF_KIND == 3
  col = shadeTerran(q, dq, anch, Nw, fp, rd, L, light, M, seed);
#elif SURF_KIND == 4
  vec3 base = shadeGas(q, fp, seed, type == 5, u_bCol[hit]);
  float dif = clamp((dot(Nw, L) + 0.08)/1.08, 0.0, 1.0);
  float limb = 0.55 + 0.45*pow(max(dot(Nw, -rd), 0.0), 0.45);
  float rs = 1.0;
  if (hit == u_ringBody) {                                     // ring shadow on the cloud tops
    vec3 Ll = M*L;
    if (abs(Ll.y) > 1e-4) { float t = -q.y/Ll.y;
      if (t > 0.0) { float rr = length((q + Ll*t).xz); rs = 1.0 - 0.75*ringDens(rr, fp); } }
  }
  col = base*0.62*(dif*1.6*light*rs*u_lightCol + 0.01)*limb;
#else
  vec3 Nl, emit; vec3 alb = shadeRock(q, fp, seed, type, Nl, emit);
  vec3 N = transpose(M)*Nl;
  col = alb*(max(dot(N, L), 0.0)*1.7*light*u_lightCol*smoothstep(-0.05, 0.1, dot(Nw, L)) + 0.006) + emit;
#endif
  o = vec4(min(col, vec3(6e4)), 1);
}`;
const sysSurf = kind => FS_SYS_SURF.replace('precision highp float; precision highp int;', 'precision highp float; precision highp int;\n#define SURF_KIND ' + kind);

const FS_SYS_ATMO = FS_SYS_COMMON + `
uniform sampler2D u_src;
out vec4 o;
void main(){
  vec4 G = texelFetch(u_gb, ivec2(gl_FragCoord.xy), 0);
  int hit = int(floor(G.x + 0.5)); float tHit = G.y;
  vec3 col = texelFetch(u_src, ivec2(gl_FragCoord.xy), 0).rgb;
  vec3 rd = rayDir();
  int a = u_atmBody; vec3 C = u_bPos[a].xyz; float R = u_bPos[a].w; mat3 M = u_bRot[a]; vec3 L = u_bSun[a];
  vec3 ro = -C/R;
  float tSurf = hit >= 0 ? tHit/R : 1e9;
  const float RC = 1.0018;
  float b = dot(ro, rd), cc = dot(ro, ro) - RC*RC, disc = b*b - cc;
  if (disc > 0.0 && (u_dbg & 2) == 0) {
    float s = sqrt(disc), tc = cc > 0.0 ? -b - s : -b + s;
    if (tc > 0.0 && tc < tSurf) {
      vec3 pc = ro + rd*tc;
      float dn = cloudD(normalize(M*pc), octs(u_pixAng*tc, 2.6, 8.0), 0.0);
      float lit = smoothstep(-0.12, 0.25, dot(normalize(pc), L));
      col = mix(col, u_lightCol*(lit*1.6*u_bInfo[a].w) + 0.015, dn*0.94);
    }
  }
  if ((u_dbg & 1) == 0) {
    vec3 tr; vec3 ins = atmo(ro, rd, tSurf, L, tr)*u_bInfo[a].w*u_lightCol;
    if (hit < 0) col *= exp(-30.0*u_skyDim*dot(ins, vec3(0.3, 0.6, 0.1)));
    col = col*tr + ins;
  }
  o = vec4(min(col, vec3(6e4)), 1);
}`;

// ------------------------------------------------------------------------------------------ driver
const B_TERRAN = 3, B_MOON = 6, B_BH = 7;
const LIGHT_COL = [1.0, 0.86, 0.68];      // the disc's light: warm, as in the demo's black-hole system

function planetPrograms(){
  program('sysBase', VS_FULL, FS_SYS_BASE);
  program('surfRock', VS_FULL, sysSurf(1));
  program('surfTerran', VS_FULL, sysSurf(3));
  program('atmo', VS_FULL, FS_SYS_ATMO);
}

let tLutTex = null;
function ensureLUT(){
  if (tLutTex) return;
  // sun optical depth from height h (0..RA-1) looking along cos(mu) (-0.35..1), integrated in float64
  const RA = 1.0125, HR = 0.00135, HM = 0.00022, BR = [37, 86, 211], BM = 95*1.1, NU = 128, NV = 48;
  const lut = new Float32Array(NU*NV*4);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const h = Math.pow(j/(NV - 1), 2)*(RA - 1), mu = -0.35 + 1.35*i/(NU - 1), r = 1 + h;
    const px = 0, py = r, dx = Math.sqrt(1 - mu*mu), dy = mu;
    const b = py*dy, cG = r*r - 1, k = (j*NU + i)*4;
    if (b < 0 && b*b - cG > 0) { lut[k] = lut[k+1] = lut[k+2] = 60; lut[k+3] = 1; continue; }   // sun below the horizon
    const tEnd = -b + Math.sqrt(b*b - (r*r - RA*RA)), n = 96;
    let oR = 0, oM = 0;
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5)/n*tEnd, x = px + dx*t, y = py + dy*t, hh = Math.max(Math.hypot(x, y) - 1, 0);
      oR += Math.exp(-hh/HR)*tEnd/n; oM += Math.exp(-hh/HM)*tEnd/n;
    }
    lut[k] = Math.min(60, BR[0]*oR + BM*oM); lut[k+1] = Math.min(60, BR[1]*oR + BM*oM); lut[k+2] = Math.min(60, BR[2]*oR + BM*oM); lut[k+3] = 1;
  }
  tLutTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tLutTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, NU, NV, 0, gl.RGBA, gl.FLOAT, lut);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

const SY = {pos:new Float32Array(40), info:new Float32Array(40), sun:new Float32Array(30), col:new Float32Array(30), rot:new Float32Array(90)};
const SYS = {};
// Screen rect (framebuffer px) covering a sphere given camera-relative centre (km) and radius; null = offscreen.
function sphereRect(C, R){
  const b = SYS.b, th = SYS.th, asp = SYS.w/SYS.h;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < 8; k++) {
    const c = [C[0] + (k & 1 ? R : -R), C[1] + (k & 2 ? R : -R), C[2] + (k & 4 ? R : -R)];
    const z = V.dot(c, b.f);
    if (z <= 1e-6*R) return [0, 0, SYS.w, SYS.h];
    const x = V.dot(c, b.r)/(z*th*asp), y = V.dot(c, b.u)/(z*th);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const X0 = Math.max(0, Math.floor((x0*0.5 + 0.5)*SYS.w) - 2), X1 = Math.min(SYS.w, Math.ceil((x1*0.5 + 0.5)*SYS.w) + 2);
  const Y0 = Math.max(0, Math.floor((y0*0.5 + 0.5)*SYS.h) - 2), Y1 = Math.min(SYS.h, Math.ceil((y1*0.5 + 0.5)*SYS.h) + 2);
  return X1 > X0 && Y1 > Y0 ? [X0, Y0, X1 - X0, Y1 - Y0] : null;
}
function sysUniforms(Q){
  gl.useProgram(Q.p);
  gl.uniform3fv(Q.u.u_camR, SYS.b.r); gl.uniform3fv(Q.u.u_camU, SYS.b.u); gl.uniform3fv(Q.u.u_camF, SYS.b.f);
  gl.uniform1f(Q.u.u_tanHalf, SYS.th); gl.uniform1f(Q.u.u_aspect, SYS.w/SYS.h); gl.uniform1f(Q.u.u_pixAng, SYS.pixAng);
  gl.uniform1f(Q.u.u_time, SYS.t);
  gl.uniform1i(Q.u.u_n, SYS.n);
  gl.uniform4fv(Q.u.u_bPos, SY.pos); gl.uniform4fv(Q.u.u_bInfo, SY.info);
  gl.uniform3fv(Q.u.u_bSun, SY.sun); gl.uniform3fv(Q.u.u_bCol, SY.col);
  gl.uniformMatrix3fv(Q.u.u_bRot, false, SY.rot);
  gl.uniform1i(Q.u.u_ringBody, -1); gl.uniform1i(Q.u.u_atmBody, SYS.atm);
  gl.uniform1f(Q.u.u_ringIn, 1.35); gl.uniform1f(Q.u.u_ringOut, 2.35);
  gl.uniform3fv(Q.u.u_starCol, [1, 1, 1]); gl.uniform1f(Q.u.u_starRad, 0); gl.uniform1f(Q.u.u_starPt, 0);
  gl.uniform3fv(Q.u.u_lightCol, LIGHT_COL); gl.uniform1f(Q.u.u_skyDim, 0.1);
  gl.uniform1f(Q.u.u_dotVis, 1); gl.uniform1f(Q.u.u_skyGain, SYS.skyGain);
  gl.uniform1i(Q.u.u_focus, SYS.focus);
  gl.uniform3fv(Q.u.u_aHi, SYS.aHi); gl.uniform3fv(Q.u.u_aLo, SYS.aLo); gl.uniform3fv(Q.u.u_camRel, SYS.camRel);
  gl.uniform1i(Q.u.u_dbg, 0);
  gl.uniform1i(Q.u.u_sky, 0); gl.uniform1i(Q.u.u_tLUT, 2);
  gl.uniform1i(Q.u.u_gb, 3); gl.uniform1i(Q.u.u_src, 4);
}
// T: screen targets (post.js). view: {eye (m, BH frame), b: {r,u,f}, fov}. bodies: [{type, R (m), seed, light,
// col, pos (m, BH frame), l2w (row-major body-local -> world)}] with body 0 = the hole (R 0: never a sphere;
// T.comp already holds it as the sky). focus = the body whose terrain gets the split-precision anchor.
// Returns the texture holding the finished HDR frame.
function systemPass(T, view, bodies, timeSec, focus, skyGain){
  const eye = view.eye;
  SYS.w = T.w; SYS.h = T.h; SYS.b = view.b;
  SYS.th = Math.tan(view.fov/2); SYS.pixAng = 2*SYS.th/T.h; SYS.t = timeSec; SYS.skyGain = skyGain;
  const n = bodies.length; SYS.n = n;
  let atm = -1;
  const Cs = [];
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    const C = V.mul(V.sub(b.pos, eye), 1e-3), Rk = b.R*1e-3, d = V.len(C);
    Cs.push(C);
    SY.pos.set([C[0], C[1], C[2], Rk], i*4);
    SY.info.set([b.type, b.seed, V.dot(C, C) - Rk*Rk, b.light], i*4);     // |oc|^2 - R^2 in float64: exact at low altitude
    SY.sun.set(i === 0 ? [0, 1, 0] : V.norm(V.mul(b.pos, -1)), i*3);      // light comes from the hole's disc
    SY.col.set(b.col, i*3);
    SY.rot.set(b.l2w, i*9);                                                // row-major L2W == column-major W2L
    if (b.type === B_TERRAN && Rk/d > 1.5*SYS.pixAng) atm = i;
  }
  SYS.atm = atm;
  const fb = bodies[focus], W2L = M3.T(fb.l2w);
  const camLocal = V.mul(M3.vec(W2L, V.sub(eye, fb.pos)), 1/fb.R);
  const an = V.norm(camLocal), hi = an.map(Math.fround);
  SYS.focus = focus; SYS.aHi = hi; SYS.aLo = [an[0] - hi[0], an[1] - hi[1], an[2] - hi[2]];
  SYS.camRel = V.sub(camLocal, an);

  ensureLUT();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.comp);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tLutTex);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.gb);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, T.comp2);
  gl.activeTexture(gl.TEXTURE0);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, T.w, T.h);

  // 1. base: sky (the lensed hole) and the per-pixel nearest hit
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.sysFb);
  sysUniforms(P.sysBase); fullscreen();
  // (unit 4 = comp2 is only sampled by the atmosphere pass, never while comp2 is the target)

  // 2. one small material pass per visible body, scissored to its projected bounds
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.comp2Fb);
  gl.enable(gl.SCISSOR_TEST);
  for (let i = 0; i < n; i++) {
    const Rk = SY.pos[i*4+3], d = V.len(Cs[i]);
    if (Rk/d < 0.25*SYS.pixAng) continue;                  // the hole (R 0), or sub-pixel
    const rect = sphereRect(Cs[i], Rk); if (!rect) continue;
    const Q = bodies[i].type === B_TERRAN ? P.surfTerran : P.surfRock;
    sysUniforms(Q); gl.uniform1i(Q.u.u_body, i);
    gl.scissor(rect[0], rect[1], rect[2], rect[3]); fullscreen();
  }
  gl.disable(gl.SCISSOR_TEST);
  if (atm < 0) return T.comp2;
  // 3. clouds + atmosphere of the habitable world: comp2 -> comp3 inside its shell's bounds
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.comp2Fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.comp3Fb);
  gl.blitFramebuffer(0, 0, T.w, T.h, 0, 0, T.w, T.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  const rect = sphereRect(Cs[atm], SY.pos[atm*4+3]*1.0125);
  if (rect) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.comp3Fb);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(rect[0], rect[1], rect[2], rect[3]);
    sysUniforms(P.atmo); fullscreen();
    gl.disable(gl.SCISSOR_TEST);
  }
  return T.comp3;
}
