'use strict';
// deep.js — the deep zoom: galaxy -> one star -> its planets -> 1 km above a surface.

// ------------------------------------------------------------------------------ deep-zoom shaders
// Local star field: real point sources in LIGHT-YEARS around the chosen star, flux = L/d^2.
const VS_LOCAL = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_col;       // rgb, luminosity (Lsun)
uniform mat4 u_view, u_proj;
uniform float u_gain;
out vec3 vCol; out float vDust; out float vGauss;
void main(){
  vec4 vp = u_view*vec4(a_pos,1);
  float d = -vp.z;
  vDust = 0.0; vGauss = 1.0;
  if (d < 1e-3) { gl_Position = vec4(2,2,2,1); gl_PointSize = 0.0; vCol = vec3(0); return; }
  float f = u_gain*a_col.w/(d*d);
  // a star is a POINT: ~2 px sprite whose PEAK is capped, so a bright star saturates to a crisp white
  // dot instead of blooming into a fuzzy disc; brightness above the cap shows as a slightly larger core
  float size = 1.6 + 0.9*smoothstep(0.0, 2.0, log(1.0 + f));
  vCol = a_col.rgb*min(f/(size*size*0.196), 2.2);
  gl_PointSize = size;
  gl_Position = u_proj*vp;
}`;

// Sky from the baked cubemap (galaxy + dust + local stars; parallax-free inside a star system).
const FS_SKY = `#version 300 es
precision highp float;
in vec2 vUv; uniform samplerCube u_cube; uniform mat4 u_invVP; out vec4 o;
void main(){
  vec4 w = u_invVP*vec4(vUv*2.0-1.0, 1.0, 1.0);
  o = vec4(texture(u_cube, normalize(w.xyz/w.w)).rgb, 1);
}`;

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
uniform vec3 u_starCol, u_lightCol;       // light colour: white for stars, warm for Gargantua's disc
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

const FS_SYS_RING = FS_SYS_COMMON + `
out vec4 o;
void main(){
  vec4 G = texelFetch(u_gb, ivec2(gl_FragCoord.xy), 0);
  float tHit = G.x < -0.5 ? 1e30 : G.y;
  vec3 rd = rayDir();
  int rb = u_ringBody; vec3 C = u_bPos[rb].xyz; float R = u_bPos[rb].w; mat3 M = u_bRot[rb];
  vec3 ol = M*(-C)/R, dl = M*rd;
  if (abs(dl.y) < 1e-7) discard;
  float tr = -ol.y/dl.y;
  if (tr <= 0.0 || tr*R >= tHit) discard;
  vec3 pr = ol + dl*tr; float r = length(pr.xz);
  if (r <= u_ringIn || r >= u_ringOut) discard;
  float dn = ringDens(r, u_pixAng*tr/max(abs(dl.y), 0.06));
  vec3 Ll = M*u_bSun[rb];
  float bb = dot(pr, Ll), cc = dot(pr, pr) - 1.0;
  float sh = (bb < 0.0 && bb*bb - cc > 0.0) ? 0.04 : 1.0;
  vec3 rc = mix(vec3(0.74,0.66,0.52), vec3(0.95,0.9,0.8), vn1(r*57.0))*(0.25 + 0.75*abs(Ll.y))*sh*u_bInfo[rb].w*1.5*u_lightCol;
  o = vec4(rc, dn);
}`;

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
    if (hit < 0) col *= exp(-30.0*dot(ins, vec3(0.3, 0.6, 0.1)));
    col = col*tr + ins;
  }
  o = vec4(min(col, vec3(6e4)), 1);
}`;

P.local = program(VS_LOCAL, FS_PART);
P.sky = program(VS_FULL, FS_SKY);
P.sysBase = program(VS_FULL, FS_SYS_BASE);
P.surf = [program(VS_FULL, sysSurf(0)), program(VS_FULL, sysSurf(1)), program(VS_FULL, sysSurf(3)), program(VS_FULL, sysSurf(4))];
P.ring = program(VS_FULL, FS_SYS_RING);
P.atmo = program(VS_FULL, FS_SYS_ATMO);

// =====================================================================================================
// DEEP ZOOM: galaxy -> one star -> its planets -> 1 km above a surface.
//
// Two frames, both float64 in JS: the GALAXY frame (units of 3.5 kpc) and the STAR frame (metres, origin
// at the chosen star, same axes). Doubles hold sub-millimetre precision across a whole planetary system,
// so there is no third frame; the GPU only ever receives camera-relative quantities.
//
// Tricks that keep it fast: the galaxy sim freezes below galaxy scale (10 Myr per time unit is a blink
// there); inside ~600 AU the whole sky (1M particles + dust + local stars) is baked ONCE into a cubemap;
// planet detail comes from pixel-footprint LOD, so a distant planet costs 2 octaves and the ground at
// 1 km costs ~20, and atmosphere/cloud/ring work only runs on pixels whose ray touches them.
// =====================================================================================================
const UNIT_M = 1.0799e20, LY_M = 9.4607e15, AU_M = 1.495979e11, RE_M = 6.371e6, RSUN_M = 6.957e8;
const GAL_MIN = 1.2, GAL_RELEASE = 1.7;          // galaxy units: pick a star below, let go above
const CUBE_R = 600*AU_M, CUBE_SIZE = 1536;
const HOLE_R = 0.012;                            // galaxy particles fade within this of the star (units)
const LOCAL_R_LY = 230, N_LOCAL = 120000, LOCAL_GAIN = 80;
const B_STAR = 0, B_ROCK = 1, B_LAVA = 2, B_TERRAN = 3, B_GAS = 4, B_ICE = 5, B_MOON = 6;
const TYPE_NAME = ['STAR', 'ROCKY WORLD', 'LAVA WORLD', 'OCEAN WORLD', 'GAS GIANT', 'ICE GIANT', 'MOON'];
const deep = {focus:0, star:null, sys:null, body:0, D:0, sysT:0, glide:null, eye:[0,0,0],
  cube:null, cubeValid:false, lastBand:0, local:null};
let flight = null;



// ------------------------------------------------------------------------------ procedural system
function makeSystem(idx, ptype){
  const r = mulberry(idx*7919 + 12345);
  let T, Rs;
  if (ptype === 'young') { T = 7600 + r()*7000; Rs = 1.7 + r()*1.3; }
  else if (ptype === 'bulge') { T = 3700 + r()*1100; Rs = 0.6 + r()*0.25; }
  else { T = 5000 + r()*1300; Rs = 0.85 + r()*0.35; }
  const L = Rs*Rs*Math.pow(T/5778, 4), HZ = Math.sqrt(L), FROST = 2.7*HZ;
  const name = r() < 0.5 ? 'HD ' + (1000 + Math.floor(r()*98000)) : 'KEPLER-' + (10 + Math.floor(r()*1900));
  const bodies = [{type:B_STAR, R:Rs*RSUN_M, T, L, name, parent:-1, spinP:900, tilt:0.1, seed:Math.floor(r()*997), col:bbColor(T), light:1}];
  const n = 5 + Math.floor(r()*3), a0 = HZ*(0.33 + r()*0.1), ratio = 1.65 + r()*0.25;
  const as = []; for (let i = 0; i < n; i++) as.push(a0*Math.pow(ratio, i));
  let terr = 0, bd = 1e9;
  as.forEach((a, i) => { const d = Math.abs(Math.log(a/HZ)); if (d < bd) { bd = d; terr = i; } });
  as[terr] = HZ*(0.97 + r()*0.08);
  let giants = 0, ringed = false;
  const COL = {[B_ROCK]:[0.85,0.66,0.5], [B_LAVA]:[1,0.55,0.35], [B_TERRAN]:[0.55,0.72,1], [B_GAS]:[1,0.86,0.66], [B_ICE]:[0.62,0.86,1], [B_MOON]:[0.8,0.8,0.8]};
  for (let i = 0; i < n; i++) {
    const a = as[i];
    const type = i === terr ? B_TERRAN : a < 0.5*HZ ? B_LAVA : a < FROST ? B_ROCK : (giants++ < 2 ? B_GAS : B_ICE);
    const R = RE_M*(type === B_TERRAN ? 1 : type === B_LAVA ? 0.4 + 0.35*r() : type === B_ROCK ? 0.45 + 0.5*r() : type === B_GAS ? 9 + 2.5*r() : 3.6 + 0.5*r());
    const b = {type, R, a:a*AU_M, P:240*Math.pow(a, 1.5), phase:r()*6.283, inc:(r() - 0.5)*0.05, parent:0,
      spinP: type === B_GAS ? 70 + r()*30 : 160 + r()*200, tilt:r()*0.35, seed:Math.floor(r()*997),
      light:clamp(Math.sqrt(HZ/a), 0.55, 1.8), name:name + ' ' + 'bcdefghij'[i], col:COL[type].map(v => v*(0.9 + r()*0.2)), aAU:a};
    if (type === B_GAS && !ringed) { b.rings = true; b.tilt = 0.42; ringed = true; }
    bodies.push(b);
  }
  const ti = 1 + terr;
  bodies.push({type:B_MOON, R:0.27*RE_M, a:30*RE_M, P:70, phase:r()*6.283, inc:0.09, parent:ti, spinP:70, tilt:0.05,
    seed:Math.floor(r()*997), light:bodies[ti].light, name:bodies[ti].name + ' I', col:COL[B_MOON], aAU:30*RE_M/AU_M});
  return {bodies, terran:ti, HZ, L, T, name, n, extent:as[n-1]*AU_M};
}
function bodyPos(i, t){
  const b = deep.sys.bodies[i]; if (b.parent < 0) return [0,0,0];
  const th = b.phase + 6.283185307*t/b.P, c = Math.cos(th), s = Math.sin(th);
  const pp = bodyPos(b.parent, t);
  return [pp[0] + b.a*c, pp[1] + b.a*s*Math.sin(b.inc), pp[2] - b.a*s*Math.cos(b.inc)];
}
function bodyL2W(i, t){ const b = deep.sys.bodies[i]; return M3.mul(M3.rx(b.tilt), M3.ry(6.283185307*t/b.spinP)); }

function buildLocalStars(seed){
  const r = mulberry(seed ^ 0x9e3779b9), arr = new Float32Array(N_LOCAL*7);
  let n = 0;
  for (let i = 0; i < N_LOCAL; i++) {
    const rr = LOCAL_R_LY*Math.cbrt(r()); if (rr < 2.5) continue;
    const ct = 2*r() - 1, ph = r()*6.283, st = Math.sqrt(1 - ct*ct);
    const u = r(); let T, L;
    if (u < 0.74) { T = 2800 + r()*1000; L = Math.pow(10, -3 + 2*r()); }
    else if (u < 0.89) { T = 3900 + r()*1300; L = Math.pow(10, -1 + 0.8*r()); }
    else if (u < 0.97) { T = 5300 + r()*1900; L = Math.pow(10, -0.2 + 0.9*r()); }
    else if (u < 0.993) { T = 7500 + r()*2500; L = Math.pow(10, 1 + 0.8*r()); }
    else if (u < 0.997) { T = 3400 + r()*1100; L = Math.pow(10, 2 + 0.8*r()); }      // red giants
    else { T = 10000 + r()*15000; L = Math.pow(10, 2.2 + 1.6*r()); }
    L *= 1 - smooth01((rr - 170)/60);
    const c = bbColor(T), k = n*7;
    arr[k] = rr*st*Math.cos(ph); arr[k+1] = rr*ct*0.75; arr[k+2] = rr*st*Math.sin(ph);
    arr[k+3] = c[0]; arr[k+4] = c[1]; arr[k+5] = c[2]; arr[k+6] = L;
    n++;
  }
  if (!deep.local) { deep.local = {vao:gl.createVertexArray(), buf:gl.createBuffer(), n:0}; }
  const L2 = deep.local;
  gl.bindVertexArray(L2.vao); gl.bindBuffer(gl.ARRAY_BUFFER, L2.buf);
  gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, n*7), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  gl.bindVertexArray(vao);
  L2.n = n;
}

// JS port of the GLSL terrain (same uint hash, same octave offsets) so a dive can land on sunlit land.
const SEA = 0.01;
function pcghJ(v){ const s = (Math.imul(v, 747796405) + 2891336453) >>> 0; const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0; return ((w >>> 22) ^ w) >>> 0; }
function hvJ(x, y, z){
  let h = (Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0; h = Math.imul(h, 0x85ebca6b) >>> 0; h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 0xc2b2ae35) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  return (h >>> 8)*(2/16777215) - 1;
}
function noisedJ(I, F){
  const fx = Math.floor(F[0]), fy = Math.floor(F[1]), fz = Math.floor(F[2]);
  const cx = I[0] + fx, cy = I[1] + fy, cz = I[2] + fz, wx = F[0] - fx, wy = F[1] - fy, wz = F[2] - fz;
  const q5 = w => w*w*w*(w*(w*6 - 15) + 10), d5 = w => 30*w*w*(w*(w - 2) + 1);
  const ux = q5(wx), uy = q5(wy), uz = q5(wz), dx = d5(wx), dy = d5(wy), dz = d5(wz);
  const a = hvJ(cx,cy,cz), b = hvJ(cx+1,cy,cz), c = hvJ(cx,cy+1,cz), d = hvJ(cx+1,cy+1,cz),
        e = hvJ(cx,cy,cz+1), f = hvJ(cx+1,cy,cz+1), g = hvJ(cx,cy+1,cz+1), h = hvJ(cx+1,cy+1,cz+1);
  const k1 = b-a, k2 = c-a, k3 = e-a, k4 = a-b-c+d, k5 = a-c-e+g, k6 = a-b-e+f, k7 = -a+b+c-d+e-f-g+h;
  return [a + k1*ux + k2*uy + k3*uz + k4*ux*uy + k5*uy*uz + k6*uz*ux + k7*ux*uy*uz,
    dx*(k1 + k4*uy + k6*uz + k7*uy*uz), dy*(k2 + k5*uz + k4*ux + k7*uz*ux), dz*(k3 + k6*ux + k5*uy + k7*ux*uy)];
}
function vnoiseJ(x, y, z){
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z), wx = x - fx, wy = y - fy, wz = z - fz;
  const ux = wx*wx*(3 - 2*wx), uy = wy*wy*(3 - 2*wy), uz = wz*wz*(3 - 2*wz), L = (a, b, t) => a + (b - a)*t;
  const T = hvJ;
  return L(L(L(T(fx,fy,fz), T(fx+1,fy,fz), ux), L(T(fx,fy+1,fz), T(fx+1,fy+1,fz), ux), uy),
           L(L(T(fx,fy,fz+1), T(fx+1,fy,fz+1), ux), L(T(fx,fy+1,fz+1), T(fx+1,fy+1,fz+1), ux), uy), uz);
}
function terrainJ(q, oct, seed, gOut){
  let h = 0, a = 0.5; const ds = [0,0,0], g = [0,0,0];
  for (let i = 0; i < oct; i++) {
    if (h + a*1.2 < -0.02) break;
    const f = Math.pow(2, i + 1);
    let n = noisedJ([i*1013 + seed, i*7919 - seed, i*3571], [q[0]*f, q[1]*f, q[2]*f]);
    if (i >= 5) {
      const m = 0.85*smooth01((h - 0.04)/0.16), sa = Math.sqrt(n[0]*n[0] + 0.004), v = 1 - sa, sg = n[0]/sa;
      n = [n[0] + (v*v - 0.35 - n[0])*m, n[1] + (-2*v*sg*n[1] - n[1])*m, n[2] + (-2*v*sg*n[2] - n[2])*m, n[3] + (-2*v*sg*n[3] - n[3])*m];
    }
    if (i < 7) { ds[0] += n[1]; ds[1] += n[2]; ds[2] += n[3]; }
    const ero = 1/(1 + 0.25*(ds[0]*ds[0] + ds[1]*ds[1] + ds[2]*ds[2]));
    const gk = a*f*ero*(i >= 7 ? 1.7 : 1);
    h += a*n[0]*ero; g[0] += gk*n[1]; g[1] += gk*n[2]; g[2] += gk*n[3];
    a *= 0.5;
  }
  if (gOut) { const d = V.dot(g, q); gOut[0] = g[0] - q[0]*d; gOut[1] = g[1] - q[1]*d; gOut[2] = g[2] - q[2]*d; }
  return h - SEA;
}
// Where to come down: land (not too high, not polar) with the sun ~10-33 degrees up at arrival time.
function findLanding(i, tArrive){
  const b = deep.sys.bodies[i];
  const sunW = V.norm(V.sub(bodyPos(0, tArrive), bodyPos(i, tArrive)));
  const sunL = M3.vec(M3.T(bodyL2W(i, tArrive)), sunW);
  const r = mulberry(b.seed*31 + 7);
  let best = null, bs = 1e9;
  for (let k = 0; k < 1500; k++) {
    const ct = 2*r() - 1, ph = r()*6.283, st = Math.sqrt(1 - ct*ct), q = [st*Math.cos(ph), ct, st*Math.sin(ph)];
    const el = V.dot(q, sunL); if (el < 0.18 || el > 0.55 || Math.abs(q[1]) > 0.6) continue;
    const g = [0,0,0], h = terrainJ(q, 10, b.seed, g);
    if (h < 0.06 || h > 0.28) continue;
    const moist = vnoiseJ(q[0]*3.3 + 11, q[1]*3.3 + 11, q[2]*3.3 + 11)*0.6 + vnoiseJ(q[0]*7.1 + 2, q[1]*7.1 + 2, q[2]*7.1 + 2)*0.3;
    const temp = 1 - Math.abs(q[1])*1.2 - h*1.1 + vnoiseJ(q[0]*5, q[1]*5, q[2]*5)*0.1;
    if (temp < 0.4) continue;                                   // no snowfields
    const rough = V.len(g);
    if (moist < -0.05) continue;                                // no deserts
    const sc = -rough - 0.5*Math.min(moist, 0.3) + 0.8*Math.abs(el - 0.32);
    if (sc < bs) { bs = sc; best = q; }
  }
  return best;
}

// ------------------------------------------------------------------------------ focus changes
function readParticles(){
  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.fb[sim.cur]); gl.readBuffer(gl.COLOR_ATTACHMENT0);
  const a = new Float32Array(TEX_W*sim.rows*4);
  gl.readPixels(0, 0, TEX_W, sim.rows, gl.RGBA, gl.FLOAT, a);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return a;
}
// A star to dive into: under the cursor, or (auto) a disc star 1-2 scale lengths out in the biggest galaxy.
function pickStar(cx, cy){
  const a = readParticles();
  let best = -1;
  if (cx == null) {
    let gi = -1; for (let i = 0; i < 4; i++) if (cores[i].active && (gi < 0 || cores[i].g.m > cores[gi].g.m)) gi = i;
    if (gi < 0) return null;
    const c = cores[gi], base = slotStart[gi]*TEX_W, n = Math.floor(slotRows[gi]*TEX_W*T_DISC);
    let bs = 1e9;
    for (let k = 0; k < 6000; k++) {
      const idx = base + Math.floor(rand()*n);
      const r = Math.hypot(a[idx*4] - c.x[0], a[idx*4+1] - c.x[1], a[idx*4+2] - c.x[2]);
      const s = Math.abs(r - 1.5*c.g.rd); if (s < bs) { bs = s; best = idx; }
      if (s < 0.3*c.g.rd) break;
    }
  } else {
    const W = innerWidth, H = innerHeight, m = cam.vp;
    let bs = 1e18;
    for (let s = 0; s < 4; s++) {
      if (!cores[s].active) continue;
      const base = slotStart[s]*TEX_W, n = slotRows[s]*TEX_W;
      for (let l = 0; l < n; l++) {
        const u = l/n; if (u >= T_BULGE && u < T_GAS) continue;          // not gas
        const k = (base + l)*4, x = a[k], y = a[k+1], z = a[k+2];
        const w = m[3]*x + m[7]*y + m[11]*z + m[15]; if (w <= 0.01) continue;
        const sx = ((m[0]*x + m[4]*y + m[8]*z + m[12])/w*0.5 + 0.5)*W - cx;
        const sy = (0.5 - (m[1]*x + m[5]*y + m[9]*z + m[13])/w*0.5)*H - cy;
        const d2 = sx*sx + sy*sy + w*0.05;                                  // nearer wins ties
        if (d2 < bs) { bs = d2; best = base + l; }
      }
    }
  }
  if (best < 0) return null;
  let s = 0; const row = Math.floor(best/TEX_W); for (let k = 1; k < 4; k++) if (row >= slotStart[k]) s = k;
  const u = (best - slotStart[s]*TEX_W)/(slotRows[s]*TEX_W);
  return {idx:best, SG:[a[best*4], a[best*4+1], a[best*4+2]], type: u < T_DISC ? 'disc' : u < T_BULGE ? 'bulge' : 'young'};
}
function acquireStar(st){
  deep.star = st;
  deep.sys = makeSystem(st.idx, st.type);
  buildLocalStars(st.idx);
  deep.D = cam.dist*UNIT_M;
  deep.glide = {from:V.mul(V.sub(cam.target, st.SG), UNIT_M), t:0, dur:2.5};
  deep.focus = 1; deep.body = 0; deep.sysT = 0; deep.cubeValid = false; deep.lastBand = 0;
  bh.active = false; bh.strength = 0; if (drag && drag.mode !== 'pinch' && drag.mode !== 'orbit') drag = null;
  const s = deep.sys, b0 = s.bodies[0];
  showCard(s.name, specClass(s.T) + '-TYPE STAR · ' + Math.round(s.T).toLocaleString() + ' K · ' + s.n + ' PLANETS',
    'One of the simulation\'s million points, opened up. The collision is frozen: at this scale ten million years pass in the blink of an eye.');
}
function yawPitchFrom(d){ cam.yaw = Math.atan2(d[0], d[2]); cam.pitch = Math.asin(clamp(d[1], -1, 1)); cam.pitch = clamp(cam.pitch, -1.5, 1.5); }
function dirYP(){ const cp = Math.cos(cam.pitch); return [cp*Math.sin(cam.yaw), Math.sin(cam.pitch), cp*Math.cos(cam.yaw)]; }
function worldDir(){ return deep.focus === 2 ? M3.vec(bodyL2W(deep.body, deep.sysT), dirYP()) : dirYP(); }
function focusTarget(){ return deep.focus === 2 ? bodyPos(deep.body, deep.sysT) : [0,0,0]; }
function focusPoint(){
  const tp = focusTarget(); const g = deep.glide;
  return g ? lerp3(g.from, tp, ease(Math.min(1, g.t/g.dur))) : tp;
}
function focusRadius(){ return deep.focus === 0 ? 0 : deep.sys.bodies[deep.focus === 1 ? 0 : deep.body].R; }
function minAlt(){
  if (deep.focus === 1) return 0.35*deep.sys.bodies[0].R;
  const b = deep.sys.bodies[deep.body];
  return b.type === B_GAS || b.type === B_ICE ? 0.03*b.R : 800;
}
function rangeM(){ return deep.focus === 0 ? cam.dist*UNIT_M : deep.D - focusRadius(); }
function setRange(r){
  if (deep.focus === 0) cam.dist = clamp(r/UNIT_M, GAL_MIN, 150);
  else deep.D = focusRadius() + Math.max(r, minAlt());
}
// Release distance for a body; selection happens at half of it, so the two can never alternate.
function releaseDist(i){
  const b = deep.sys.bodies[i], aEff = b.parent === 0 ? b.a : b.a + deep.sys.bodies[b.parent].a;
  return Math.max(4*aEff, 60*b.R);
}
function currentUp(){ return deep.focus === 2 ? M3.vec(bodyL2W(deep.body, deep.sysT), [0,1,0]) : [0,1,0]; }
function acquireBody(i){
  const w = worldDir(), from = focusPoint(), upFrom = currentUp();
  deep.focus = 2; deep.body = i;
  yawPitchFrom(M3.vec(M3.T(bodyL2W(i, deep.sysT)), w));
  deep.glide = {from, upFrom, t:0, dur:3};
  const b = deep.sys.bodies[i];
  const extra = b.type === B_MOON ? (30).toFixed(0) + ' R⊕ FROM ITS PLANET' : b.aAU.toFixed(2) + ' AU FROM ' + deep.sys.name;
  showCard(b.name, TYPE_NAME[b.type] + ' · ' + (b.R/RE_M).toFixed(2) + ' R⊕ · ' + extra, BODY_DESC[b.type]);
}
const BODY_DESC = {
  [B_TERRAN]:'Oceans, weather and a blue sky, in the habitable zone. Keep scrolling: the terrain gains detail all the way down to about a kilometre.',
  [B_GAS]:'A hydrogen giant with banded jet streams and a storm bigger than a world.',
  [B_ICE]:'A cold giant of water, ammonia and methane ices under a hazy blue atmosphere.',
  [B_ROCK]:'A barren, cratered world with no atmosphere to speak of.',
  [B_LAVA]:'Too close to its star: a crust cracked open over molten rock.',
  [B_MOON]:'A cratered moon, tidally locked to its planet.',
};
function releaseToStar(){
  const w = worldDir(), from = focusPoint(), upFrom = currentUp();
  deep.focus = 1; deep.body = 0;
  yawPitchFrom(w);
  deep.glide = {from, upFrom, t:0, dur:2.5};
}
function releaseToGalaxy(){
  const w = worldDir(), fp = focusPoint();
  yawPitchFrom(w);
  cam.target = V.add(deep.star.SG, V.mul(fp, 1/UNIT_M));
  cam.dist = Math.max(GAL_MIN*1.01, deep.D/UNIT_M);
  deep.focus = 0; deep.glide = null;
  if (tg) tg.fresh = true;
  caption('BACK TO GALACTIC TIME · THE COLLISION RESUMES');
}
function planetNearScreen(cx, cy, maxPx){
  let best = -1, bd = maxPx*maxPx;
  for (let i = 1; i < deep.sys.bodies.length; i++) {
    const q = projectDeep(bodyPos(i, deep.sysT)); if (!q) continue;
    const d = (q[0] - cx)**2 + (q[1] - cy)**2; if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function checkTransitions(zoomingIn, cx, cy){
  if (deep.focus === 1) {
    if (deep.D > GAL_RELEASE*UNIT_M && (!flight || flight.level === 'galaxy')) { releaseToGalaxy(); return; }
    if (zoomingIn && cx != null && deep.D < 3000*AU_M) { const i = planetNearScreen(cx, cy, 45); if (i > 0 && deep.D < 0.5*releaseDist(i)) acquireBody(i); }
  } else if (deep.focus === 2) {
    const b = deep.sys.bodies[deep.body];
    if (deep.D > releaseDist(deep.body)) releaseToStar();
  }
}
function zoomBy(k, cx, cy){
  flight = null;
  if (deep.focus === 0) {
    if (k < 0 && cam.dist <= GAL_MIN*1.001) {
      const st = pickStar(cx, cy); if (st) acquireStar(st);
      return;
    }
    cam.dist = clamp(cam.dist*Math.exp(k), GAL_MIN, 150);
    return;
  }
  setRange(rangeM()*Math.exp(k));
  checkTransitions(k < 0, cx, cy);
}

// Scripted flights along log(range). Focus changes happen on the way, exactly as scrolling would do them.
const LAD_TOP = 22.2, LAD_BOT = 3.0;
function ladY(lg){ return clamp((LAD_TOP - lg)/(LAD_TOP - LAD_BOT), 0, 1); }
const LEVELS = [
  {k:'galaxy', label:'GALAXIES', log:21.0},
  {k:'neigh', label:'NEIGHBOURHOOD', log:Math.log10(150*LY_M)},
  {k:'system', label:'STAR SYSTEM', log:13.2},
  {k:'planet', label:'PLANET', log:Math.log10(3.2*RE_M)},
  {k:'surface', label:'SURFACE', log:Math.log10(3000)},
];
function flyTo(level, bodyIdx){
  if (level !== 'galaxy' && deep.focus === 0) {
    if (cores.every(c => !c.active)) return;
    cam.dist = Math.max(cam.dist, GAL_MIN);
    const st = pickStar(null); if (!st) return;
    acquireStar(st);
  }
  let to, want = null;
  if (level === 'galaxy') to = LEVELS[0].log;
  else if (level === 'neigh') to = LEVELS[1].log;
  else if (level === 'system') to = Math.log10(deep.sys.extent*1.6);
  else {
    want = bodyIdx != null ? bodyIdx : deep.sys.terran;
    const b = deep.sys.bodies[want];
    to = level === 'surface' && (b.type !== B_GAS && b.type !== B_ICE) ? Math.log10(3000) : Math.log10(b.R*(level === 'surface' ? 0.08 : 2.2));
  }
  const from = Math.log10(Math.max(1, rangeM()));
  flight = {level, want, from, to, t:0, dur:clamp(2.5 + 1.6*Math.abs(to - from), 3, 30)};
  lastInput = performance.now();
}
function updateFlight(fdt){
  if (!flight) return;
  flight.t += fdt;
  const s = ease(Math.min(1, flight.t/flight.dur));
  setRange(Math.pow(10, flight.from + (flight.to - flight.from)*s));
  if (flight.want != null && deep.focus >= 1 && !(deep.focus === 2 && deep.body === flight.want)) {
    const b = deep.sys.bodies[flight.want], a = b.parent === 0 ? b.a : b.a + deep.sys.bodies[b.parent].a;
    if (deep.D < 0.5*releaseDist(flight.want)) acquireBody(flight.want);
  }
  if (flight && flight.want != null && deep.focus === 2 && deep.body === flight.want) {
    let aim;
    const bt = deep.sys.bodies[deep.body].type;
    if (flight.level === 'surface' && bt === B_TERRAN) {
      if (!flight.land) flight.land = findLanding(deep.body, deep.sysT + (flight.dur - flight.t)*settings.speed) || [0,0,1];
      aim = flight.land;
    } else {
      const sunW = V.norm(V.sub(bodyPos(0, deep.sysT), bodyPos(deep.body, deep.sysT)));
      const sunL = M3.vec(M3.T(bodyL2W(deep.body, deep.sysT)), sunW);
      let side = V.cross(sunL, [0,1,0]); side = V.len(side) < 1e-3 ? [1,0,0] : V.norm(side);
      aim = V.norm(V.add(V.add(V.mul(sunL, 0.8), V.mul(side, 0.5)), [0, 0.3, 0]));
    }
    const ay = Math.atan2(aim[0], aim[2]), ap = Math.asin(clamp(aim[1], -1, 1));
    let dy = ay - cam.yaw; dy -= 6.283185307*Math.round(dy/6.283185307);
    const k = Math.min(1, fdt*(0.35 + 1.5*smooth01((flight.t/flight.dur - 0.55)/0.35)));
    cam.yaw += dy*k; cam.pitch += (ap - cam.pitch)*k;
  }
  checkTransitions(false);
  if (flight && flight.t >= flight.dur) flight = null;
}
const BANDS = [19.9, 18.0, 16.2, 13.6, 9.6, 6.4, 4.2];
function bandCaptions(){
  if (deep.focus === 0) { deep.lastBand = 0; return; }
  const lr = Math.log10(Math.max(1, rangeM()));
  let b = 0; while (b < BANDS.length && lr < BANDS[b]) b++;
  if (b > deep.lastBand) {
    const s = deep.sys;
    const txt = [null,
      'INSIDE THE GALAXY · TIME FROZEN — HERE 10 MILLION YEARS IS A BLINK',
      '100 LIGHT-YEARS · EVERY POINT OF LIGHT IS A SUN',
      '1 LIGHT-YEAR · ' + s.name + ' IS STILL JUST A STAR',
      'THE ' + s.name + ' SYSTEM · ' + s.n + ' PLANETS',
      deep.focus === 2 ? s.bodies[deep.body].name : 'THE INNER SYSTEM',
      'LOW ORBIT',
      'ONE KILOMETRE UP'][b];
    if (txt) caption(txt);
  }
  deep.lastBand = b;
}

// ------------------------------------------------------------------------------ cameras
function updateCamera(){
  const asp = cv.width/cv.height;
  if (deep.focus === 0) {
    const cp = Math.cos(cam.pitch);
    cam.eye = V.add(cam.target, [cam.dist*cp*Math.sin(cam.yaw), cam.dist*Math.sin(cam.pitch), cam.dist*cp*Math.cos(cam.yaw)]);
    cam.view = lookAt(cam.eye, cam.target, [0,1,0]);
    cam.proj = perspective(cam.fov, asp, 0.02, 800);
    cam.vp = mmul(cam.proj, cam.view);
    cam.fwd = V.norm(V.sub(cam.target, cam.eye));
    const v = cam.view;
    cam.b = {r:[v[0],v[4],v[8]], u:[v[1],v[5],v[9]], f:[-v[2],-v[6],-v[10]]};
    return;
  }
  let eye, f, u, r;
  if (cam.free) {                  // director / battle camera: eye in the star frame (m) + its own basis
    eye = cam.free.eye; f = cam.free.f; u = cam.free.u; r = cam.free.r;
    deep.D = V.len(V.sub(eye, focusTarget()));
  } else {
  const fp = focusPoint();
  let dir = dirYP(), up = [0,1,0];
  if (deep.focus === 2) { const L2W = bodyL2W(deep.body, deep.sysT); dir = M3.vec(L2W, dir); up = M3.vec(L2W, [0,1,0]); }
  if (deep.glide && deep.glide.upFrom) up = V.norm(lerp3(deep.glide.upFrom, up, ease(Math.min(1, deep.glide.t/deep.glide.dur))));
  eye = V.add(fp, V.mul(dir, deep.D));
  f = V.mul(dir, -1);
  if (deep.focus === 2) {
    // near the ground the view tilts from straight down toward the horizon
    const alt = Math.max(1, deep.D - focusRadius());
    const tilt = 1.32*smooth01((Math.log10(3e5) - Math.log10(alt))/(Math.log10(3e5) - Math.log10(2.5e3)));
    let tan = V.sub(up, V.mul(dir, V.dot(up, dir)));
    tan = V.len(tan) < 1e-6 ? V.norm(V.cross(dir, [1,0,0])) : V.norm(tan);
    f = V.norm(V.add(V.mul(dir, -Math.cos(tilt)), V.mul(tan, Math.sin(tilt))));
    u = V.add(V.mul(tan, Math.cos(tilt)), V.mul(dir, Math.sin(tilt)));
  } else u = up;
  r = V.cross(f, u); if (V.len(r) < 1e-9) r = [1,0,0];
  r = V.norm(r); u = V.cross(r, f);
  }
  cam.b = {r, u, f};
  deep.eye = eye;
  const inner = V.len(eye) < 1e-3*UNIT_M;
  const eyeG = inner ? deep.star.SG.slice() : V.add(deep.star.SG, V.mul(eye, 1/UNIT_M));
  cam.eye = eyeG; cam.fwd = f;
  cam.view = viewFromBasis(r, u, f, eyeG);
  cam.proj = perspective(cam.fov, asp, 0.002, 800);
  cam.vp = mmul(cam.proj, cam.view);
  cam.localView = viewFromBasis(r, u, f, V.mul(eye, 1/LY_M));
  cam.localProj = perspective(cam.fov, asp, 1e-3, 1e5);
}
function projectDeep(p){
  const b = cam.b, v = V.sub(p, deep.eye), z = V.dot(v, b.f);
  if (z <= 0) return null;
  const th = Math.tan(cam.fov/2), asp = innerWidth/innerHeight;
  const x = V.dot(v, b.r)/(z*th*asp), y = V.dot(v, b.u)/(z*th);
  return [(x*0.5 + 0.5)*innerWidth, (0.5 - y*0.5)*innerHeight, z];
}

function drawLocal(view, proj, gain){
  if (!deep.local || gain <= 0) return;
  const Q = P.local;
  gl.useProgram(Q.p);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.uniformMatrix4fv(Q.u.u_view, false, view); gl.uniformMatrix4fv(Q.u.u_proj, false, proj);
  gl.uniform1f(Q.u.u_gain, gain);
  gl.bindVertexArray(deep.local.vao);
  gl.drawArrays(gl.POINTS, 0, deep.local.n);
  gl.bindVertexArray(vao);
}

function ensureCube(){
  if (deep.cube) return;
  const S = CUBE_SIZE, c = {};
  c.tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, c.tex);
  gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 1, gl.RGBA16F, S, S);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  c.faceFb = [];
  for (let i = 0; i < 6; i++) {
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, c.tex, 0);
    c.faceFb.push(f);
  }
  c.light = tex(S, S, tg.lightFmt, gl.NEAREST);
  c.dust = tex(S, S, gl.RGBA16F, gl.LINEAR);
  c.sceneFb = fbo([c.light, c.dust]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  deep.cube = c;
}
const CUBE_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const CUBE_UPS = [[0,-1,0],[0,-1,0],[0,0,1],[0,0,-1],[0,-1,0],[0,-1,0]];
function bakeSky(now){
  ensureCube();
  const S = CUBE_SIZE, c = deep.cube;
  const proj = perspective(Math.PI/2, 1, 0.002, 800), projL = perspective(Math.PI/2, 1, 1e-3, 1e5);
  for (let i = 0; i < 6; i++) {
    const f = CUBE_DIRS[i], r = V.norm(V.cross(f, CUBE_UPS[i])), u = V.cross(r, f);
    const viewG = viewFromBasis(r, u, f, deep.star.SG);
    drawParticles(c.sceneFb, S, S, viewG, proj, {holeC:deep.star.SG, pointStars:0.08});   // particles as point stars
    composite(c.faceFb[i], S, S, c.light, c.dust, viewG, proj, now, false);
  }
  deep.cubeValid = true;
}
function skyFromCube(){
  const Q = P.sky;
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, tg.compFb); gl.viewport(0, 0, tg.w, tg.h);
  gl.useProgram(Q.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, deep.cube.tex); gl.uniform1i(Q.u.u_cube, 0);
  const rot = cam.view.slice(); rot[12] = rot[13] = rot[14] = 0;
  gl.uniformMatrix4fv(Q.u.u_invVP, false, minv(mmul(cam.proj, rot)));
  fullscreen();
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
// Screen rect (framebuffer px) covering a sphere given camera-relative centre (km) and radius; null = offscreen.
function sphereRect(C, R){
  const b = cam.b, th = Math.tan(cam.fov/2), asp = tg.w/tg.h;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < 8; k++) {
    const c = [C[0] + (k & 1 ? R : -R), C[1] + (k & 2 ? R : -R), C[2] + (k & 4 ? R : -R)];
    const z = V.dot(c, b.f);
    if (z <= 1e-6*R) return [0, 0, tg.w, tg.h];
    const x = V.dot(c, b.r)/(z*th*asp), y = V.dot(c, b.u)/(z*th);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const X0 = Math.max(0, Math.floor((x0*0.5 + 0.5)*tg.w) - 2), X1 = Math.min(tg.w, Math.ceil((x1*0.5 + 0.5)*tg.w) + 2);
  const Y0 = Math.max(0, Math.floor((y0*0.5 + 0.5)*tg.h) - 2), Y1 = Math.min(tg.h, Math.ceil((y1*0.5 + 0.5)*tg.h) + 2);
  return X1 > X0 && Y1 > Y0 ? [X0, Y0, X1 - X0, Y1 - Y0] : null;
}
const SYS = {};
function sysUniforms(Q){
  gl.useProgram(Q.p);
  gl.uniform3fv(Q.u.u_camR, cam.b.r); gl.uniform3fv(Q.u.u_camU, cam.b.u); gl.uniform3fv(Q.u.u_camF, cam.b.f);
  gl.uniform1f(Q.u.u_tanHalf, SYS.th); gl.uniform1f(Q.u.u_aspect, tg.w/tg.h); gl.uniform1f(Q.u.u_pixAng, SYS.pixAng);
  gl.uniform1f(Q.u.u_time, SYS.t);
  gl.uniform1i(Q.u.u_n, SYS.n);
  gl.uniform4fv(Q.u.u_bPos, SY.pos); gl.uniform4fv(Q.u.u_bInfo, SY.info);
  gl.uniform3fv(Q.u.u_bSun, SY.sun); gl.uniform3fv(Q.u.u_bCol, SY.col);
  gl.uniformMatrix3fv(Q.u.u_bRot, false, SY.rot);
  gl.uniform1i(Q.u.u_ringBody, SYS.ring); gl.uniform1i(Q.u.u_atmBody, SYS.atm);
  gl.uniform1f(Q.u.u_ringIn, 1.35); gl.uniform1f(Q.u.u_ringOut, 2.35);
  gl.uniform3fv(Q.u.u_starCol, SYS.starCol); gl.uniform1f(Q.u.u_starRad, SYS.starRad); gl.uniform1f(Q.u.u_starPt, SYS.starPt);
  gl.uniform3fv(Q.u.u_lightCol, SYS.lightCol);
  gl.uniform1f(Q.u.u_dotVis, SYS.dotVis); gl.uniform1f(Q.u.u_skyGain, SYS.skyGain);
  gl.uniform1i(Q.u.u_focus, SYS.focus);
  gl.uniform3fv(Q.u.u_aHi, SYS.aHi); gl.uniform3fv(Q.u.u_aLo, SYS.aLo); gl.uniform3fv(Q.u.u_camRel, SYS.camRel);
  gl.uniform1i(Q.u.u_dbg, window.DBG || 0);
  gl.uniform1i(Q.u.u_sky, 0); gl.uniform1i(Q.u.u_tLUT, 2);
  gl.uniform1i(Q.u.u_gb, 3); gl.uniform1i(Q.u.u_src, 4);
}
// Returns the texture holding the finished HDR frame.
function systemPass(now){
  const sys = deep.sys, t = deep.sysT, eye = deep.eye, h = tg.h;
  SYS.th = Math.tan(cam.fov/2); SYS.pixAng = 2*SYS.th/h; SYS.t = t;
  const n = sys.bodies.length; SYS.n = n;
  let atm = -1, ring = -1;
  const Cs = [];
  for (let i = 0; i < n; i++) {
    const b = sys.bodies[i], P0 = bodyPos(i, t);
    const C = V.mul(V.sub(P0, eye), 1e-3), Rk = b.R*1e-3, d = V.len(C);
    Cs.push(C);
    SY.pos.set([C[0], C[1], C[2], Rk], i*4);
    SY.info.set([b.type, b.seed, V.dot(C, C) - Rk*Rk, b.light], i*4);
    SY.sun.set(i === 0 ? [0,1,0] : V.norm(V.mul(P0, -1)), i*3);
    SY.col.set(b.col, i*3);
    SY.rot.set(bodyL2W(i, t), i*9);                // row-major L2W == column-major W2L
    if (b.type === B_TERRAN && Rk/d > 1.5*SYS.pixAng) atm = i;
    if (b.rings) ring = i;
  }
  SYS.atm = atm; SYS.ring = ring;
  const s0 = sys.bodies[0], dStar = V.len(eye), ar = s0.R/dStar, dly = dStar/LY_M;
  SYS.starCol = s0.col;
  SYS.starPt = Math.min(LOCAL_GAIN*sys.L/(dly*dly), 400)*(1 - smooth01((ar/SYS.pixAng - 0.5)/1.5));
  SYS.starRad = 30; SYS.lightCol = [1, 1, 1];
  if (sys.bh) { SYS.starPt = 0; SYS.starRad = 0; SYS.lightCol = sys.lightCol; }   // the hole is drawn by gargantua.js
  SYS.dotVis = 1 - smooth01((Math.log10(dStar) - Math.log10(3000*AU_M))/1.5);
  SYS.skyGain = deep.focus === 2 ? 0.4 + 0.6*smooth01((Math.log10(deep.D - focusRadius()) - 7)/1.5) : 1;
  if (deep.focus === 2) {
    const b = sys.bodies[deep.body], W2L = M3.T(bodyL2W(deep.body, t));
    const camLocal = V.mul(M3.vec(W2L, V.sub(eye, bodyPos(deep.body, t))), 1/b.R);
    const an = V.norm(camLocal), hi = an.map(Math.fround);
    SYS.focus = deep.body; SYS.aHi = hi; SYS.aLo = [an[0] - hi[0], an[1] - hi[1], an[2] - hi[2]];
    SYS.camRel = V.sub(camLocal, an);
  } else { SYS.focus = -1; SYS.aHi = [0,0,0]; SYS.aLo = [0,0,0]; SYS.camRel = [0,0,0]; }

  ensureLUT();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tg.comp);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tLutTex);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tg.gb);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, tg.comp2);
  gl.activeTexture(gl.TEXTURE0);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, tg.w, h);

  // 1. base: sky, points of light, star glare, and the per-pixel nearest hit
  gl.bindFramebuffer(gl.FRAMEBUFFER, tg.sysFb);
  sysUniforms(P.sysBase); fullscreen();
  // (unit 4 = comp2 is only sampled by the atmosphere pass, never while comp2 is the target)

  // 2. one small material pass per visible body, scissored to its projected bounds
  gl.bindFramebuffer(gl.FRAMEBUFFER, tg.comp2Fb);
  gl.enable(gl.SCISSOR_TEST);
  for (let i = 0; i < n; i++) {
    const Rk = SY.pos[i*4+3], d = V.len(Cs[i]);
    if (Rk/d < 0.25*SYS.pixAng) continue;                  // sub-pixel: the base pass drew it as a point
    const rect = sphereRect(Cs[i], Rk); if (!rect) continue;
    const ty = sys.bodies[i].type;
    const Q = P.surf[ty === B_STAR ? 0 : ty === B_TERRAN ? 2 : (ty === B_GAS || ty === B_ICE) ? 3 : 1];
    sysUniforms(Q); gl.uniform1i(Q.u.u_body, i);
    gl.scissor(rect[0], rect[1], rect[2], rect[3]); fullscreen();
  }
  // 3. rings, alpha-blended over whatever is behind them
  if (ring >= 0) {
    const rect = sphereRect(Cs[ring], SY.pos[ring*4+3]*2.4);
    if (rect) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      sysUniforms(P.ring); gl.scissor(rect[0], rect[1], rect[2], rect[3]); fullscreen();
      gl.disable(gl.BLEND);
    }
  }
  gl.disable(gl.SCISSOR_TEST);
  if (atm < 0) return tg.comp2;
  // 4. clouds + atmosphere of the habitable world: comp2 -> comp3 inside its shell's bounds
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, tg.comp2Fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, tg.comp3Fb);
  gl.blitFramebuffer(0, 0, tg.w, h, 0, 0, tg.w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  const rect = sphereRect(Cs[atm], SY.pos[atm*4+3]*1.0125);
  if (rect) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, tg.comp3Fb);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(rect[0], rect[1], rect[2], rect[3]);
    sysUniforms(P.atmo); fullscreen();
    gl.disable(gl.SCISSOR_TEST);
  }
  return tg.comp3;
}

