'use strict';
// gargantua.js — the black hole. Units: G = c = M = 1: horizon 2, photon sphere 3, shadow edge b = 3*sqrt(3).
//
// Lensing is split into GEOMETRY and SHADING. The geometry pass integrates each ray backwards from the
// camera (Schwarzschild null geodesics in Cartesian form, x'' = -3M h^2 x / r^5 -- the landing page's
// -1.5 is the same law in r_s = 1 units; RK4, curvature-adaptive steps, analytic weak-field tails beyond
// u_Rs) and
// records WHERE it went: the escape direction, up to two crossings of the disc plane with their redshift,
// and a volumetric haze integral. The shading pass turns that into light at full resolution every frame:
// lensed stars evaluated per pixel (so they stay point-sharp and stretch into arcs), the disc's turbulence
// advected at the Keplerian rate, Doppler-shifted blackbody colour.
//
// A planet in orbit sits at a fixed point relative to the hole for the whole battle (the camera moves by
// ~1e-5 M), so the geometry is BAKED ONCE into cubemaps around that point and the per-frame cost is only the
// shading. The disc is axisymmetric about +y, so the bake is done at azimuth 0 and reused at any azimuth.

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

// Geometry. Writes 4 targets (cube faces when baking, a screen buffer when approaching):
//   o0 = escapeDir - rayDir, haze      o1 = x1*f, z1*f, g1*f, f (first disc crossing)      o2 = second crossing
//   o3 = cos of the total bend at each crossing (< 0: the ray had wound round the hole), spare
// Crossings are stored premultiplied by their coverage f so bilinear filtering averages only real hits.
// The shadow is NOT stored: whether a ray is captured depends only on its impact parameter, which the
// shading pass computes exactly per pixel -- a filtered 0/1 capture flag draws scalloped texel edges.
const FS_BH_GEOM = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 u_cam, u_R, u_U, u_F;
uniform float u_tanX, u_tanY, u_eps, u_Rs;
uniform int u_maxSteps;
${BH_COMMON}
layout(location=0) out vec4 o0;
layout(location=1) out vec4 o1;
layout(location=2) out vec4 o2;
layout(location=3) out vec4 o3;
vec3 turn(vec3 v, vec3 p, float ang){                   // rotate unit v toward the hole (at -p) by ang
  vec3 n = dot(p, v)*v - p; float l = length(n);
  if (l < 1e-9) return v;
  n /= l; return normalize(v*cos(ang) + n*sin(ang));
}
float redshift(vec3 hp, vec3 v, float h2){              // Kerr thin disc, circular prograde orbits
  float r = length(hp.xz);
  float vinf = sqrt(max(dot(v, v) - 2.0*h2/(r*r*r), 1e-6));
  float b = -(hp.z*v.x - hp.x*v.z)/vinf;               // forward photon's L_y / E
  float rs = sqrt(r), r15 = r*rs;
  float Om = 1.0/(r15 + u_spin);
  float q = r15 - 3.0*rs + 2.0*u_spin;
  if (q <= 1e-4) return 0.0;
  float ut = (r15 + u_spin)/(pow(r, 0.75)*sqrt(q));
  return 1.0/(ut*max(1.0 - Om*b, 0.05));
}
void main(){
  vec2 ndc = vUv*2.0 - 1.0;
  vec3 rd = normalize(u_F + ndc.x*u_tanX*u_R + ndc.y*u_tanY*u_U);
  vec3 p = u_cam, v = rd;
  const float rH = 2.0;
  float r = length(p);
  vec3 dBend = vec3(0.0);
  // outside the numeric sphere: straight line + weak-field bend to its entry point (or to infinity)
  if (r > u_Rs) {
    float B = dot(p, v), C = r*r - u_Rs*u_Rs, D = B*B - C;
    float b = length(cross(p, v));
    float sc = B;                                        // signed path position of the camera
    if (D <= 0.0 || B > 0.0) {
      float ang = (2.0/max(b, 1e-3))*(1.0 - sc/sqrt(sc*sc + b*b));
      vec3 e = turn(v, p, ang);
      o0 = vec4(e - rd, 0.0); o1 = vec4(0.0); o2 = vec4(0.0); o3 = vec4(1.0, 1.0, 0.0, 0.0);
      return;
    }
    float t = -B - sqrt(D);
    vec3 pe = p + v*t;
    float se = -sqrt(max(u_Rs*u_Rs - b*b, 0.0));
    float ang = (2.0/max(b, 1e-3))*(se/u_Rs - sc/sqrt(sc*sc + b*b));
    v = turn(v, p, ang); p = pe; r = u_Rs;
  }
  vec3 L = cross(p, v); float h2 = dot(L, L);
  vec4 hit1 = vec4(0.0), hit2 = vec4(0.0); int nh = 0;
  float haze = 0.0, bend1 = 1.0, bend2 = 1.0;
  bool captured = false;
  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxSteps) break;
    if (r < rH*1.01) { captured = true; break; }
    if (r > u_Rs && dot(p, v) > 0.0) break;
    float dt = u_eps*r*r*r*r/(1.5*h2 + 1e-3);
    dt = min(dt, 0.2*(r - rH));
    if (r < u_rOut*1.3) dt = min(dt, 0.1*r + 0.05);
    dt = clamp(dt, 0.003, 80.0);
    vec3 k1v = bhAccel(p, v, h2), k1p = v;
    vec3 k2p = v + 0.5*dt*k1v, k2v = bhAccel(p + 0.5*dt*k1p, k2p, h2);
    vec3 k3p = v + 0.5*dt*k2v, k3v = bhAccel(p + 0.5*dt*k2p, k3p, h2);
    vec3 k4p = v + dt*k3v,     k4v = bhAccel(p + dt*k3p, k4p, h2);
    vec3 pn = p + dt/6.0*(k1p + 2.0*k2p + 2.0*k3p + k4p);
    vec3 vn = v + dt/6.0*(k1v + 2.0*k2v + 2.0*k3v + k4v);
    // glowing slab around the disc plane, integrated exactly along the (straight) sub-segment
    vec3 pm = 0.5*(p + pn); float rm = length(pm);
    if (rm < u_rOut*1.1 && rm > u_rIn*0.7) {
      float H = 0.03*rm + 0.08, ds = length(pn - p), dy = pn.y - p.y;
      float I = abs(dy) > 1e-5*ds ? ds*(H*1.2533/abs(dy))*abs(erfA(pn.y/(1.41421*H)) - erfA(p.y/(1.41421*H)))
                                  : ds*exp(-p.y*p.y/(2.0*H*H));
      haze += I*hazeProfile(rm);
    }
    if (p.y*pn.y < 0.0 && nh < 2) {
      float f = p.y/(p.y - pn.y);
      vec3 hp = mix(p, pn, f), hv = mix(v, vn, f);
      float rr = length(hp.xz), w = discEdge(rr);
      if (w > 0.002) {
        float g = redshift(hp, hv, h2);
        vec4 h = vec4(hp.x, hp.z, g, w);
        float cb = dot(rd, normalize(hv));
        if (nh == 0) { hit1 = h; bend1 = cb; } else { hit2 = h; bend2 = cb; }
        nh++;
      }
    }
    p = pn; v = vn; r = length(p);
  }
  if (captured) o0 = vec4(0.0, 0.0, 0.0, haze);
  else {
    vec3 vh = normalize(v);
    float b = length(cross(p, vh)), s = dot(p, vh);
    vec3 e = turn(vh, p, (2.0/max(b, 1e-3))*(1.0 - s/max(r, 1e-3)));   // remaining far-field bend
    o0 = vec4(e - rd, haze);
  }
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

P.bhGeom = program(VS_FULL, FS_BH_GEOM);
P.bhShadeCube = program(VS_FULL, FS_BH_SHADE.replace('precision highp int;', 'precision highp int;\n#define GEOM_CUBE'));
P.bhShade2D = program(VS_FULL, FS_BH_SHADE);

// ------------------------------------------------------------------------------------------ state
const BH = {
  M_KM: 1.477e8,              // GM/c^2 of a 1e8 solar-mass hole, in km (1 M ~ 1 AU)
  spin: 0.0, rIn: 4.6, rOut: 34.0,     // the disc glows a little inside the ISCO (6 M): gas plunging in
  CUBE: 1024, TILES: 4,       // bake resolution per face, tiles per face side
  cube: null, bake: null,     // bake = {cam:[3], next:0, total, done}
  gain: {disc: 1.0, star: 1.0, haze: 0.05, ring: 1.0, sky: 0.0, Tpeak: 7500, falloff: 1.2, contrast: 2.6},
  emptySky: null,
};
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
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fail('Black-hole bake targets are unsupported on this GPU.');
    c.fb.push(fb);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  BH.cube = c;
  // a 1x1 black cube stands in for the galaxy sky until a real one is bound
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
  gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 1, gl.RGBA16F, 1, 1);
  BH.emptySky = t;
}
function bhGeomUniforms(Q, camM, R, U, F, tanX, tanY, eps, maxSteps){
  gl.useProgram(Q.p);
  gl.uniform3fv(Q.u.u_cam, camM); gl.uniform3fv(Q.u.u_R, R); gl.uniform3fv(Q.u.u_U, U); gl.uniform3fv(Q.u.u_F, F);
  gl.uniform1f(Q.u.u_tanX, tanX); gl.uniform1f(Q.u.u_tanY, tanY);
  gl.uniform1f(Q.u.u_eps, eps); gl.uniform1f(Q.u.u_Rs, 400.0); gl.uniform1i(Q.u.u_maxSteps, maxSteps);
  gl.uniform1f(Q.u.u_spin, BH.spin); gl.uniform1f(Q.u.u_rIn, BH.rIn); gl.uniform1f(Q.u.u_rOut, BH.rOut);
}
// Start a bake for a camera at camM (BH frame, M units). Only r and the height above the disc matter:
// the camera is rotated to azimuth 0 and the shading pass rotates back.
function bhStartBake(camM){
  bhEnsureCube();
  const rxz = Math.hypot(camM[0], camM[2]);
  BH.bake = {cam: [rxz, camM[1], 0], az: Math.atan2(camM[2], camM[0]), next: 0, total: 6*BH.TILES*BH.TILES, done: false};
}
// Render up to n bake tiles (one tile = a TILES x TILES part of one face). Returns true when complete.
function bhBakeStep(n){
  const b = BH.bake; if (!b || b.done) return !!(b && b.done);
  const S = BH.CUBE, T = BH.TILES, ts = S/T;
  gl.disable(gl.BLEND); gl.enable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, S, S);
  for (let k = 0; k < n && b.next < b.total; k++, b.next++) {
    const face = Math.floor(b.next/(T*T)), tile = b.next % (T*T), tx = tile % T, ty = Math.floor(tile/T);
    const f = CUBE_DIRS[face], r = V.norm(V.cross(f, CUBE_UPS[face])), u = V.cross(r, f);
    gl.bindFramebuffer(gl.FRAMEBUFFER, BH.cube.fb[face]);
    bhGeomUniforms(P.bhGeom, b.cam, r, u, f, 1, 1, 0.05, 900);
    gl.scissor(tx*ts, ty*ts, ts, ts);
    fullscreen();
  }
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (b.next >= b.total) b.done = true;
  return b.done;
}
// ------------------------------------------------------------------------------ the black-hole system
// Body 0 is the hole (never drawn as a sphere: gargantua.js paints it as the background), body 1 the world
// the battle is fought over, parked 45 M out and 4 degrees above the disc so the disc is seen nearly edge-on.
// Its orbital period is effectively infinite: over a scene the hole must stay put for the baked lensing.
const B_BH = 7; TYPE_NAME[B_BH] = 'BLACK HOLE';
function makeBHSystem(){
  const Mm = BH.M_KM*1e3, a = 45*Mm, inc = 4*Math.PI/180;
  const bodies = [
    {type: B_BH, R: 0, T: 6500, L: 1, name: 'GARGANTUA', parent: -1, spinP: 1e12, tilt: 0, seed: 1, col: [1, 0.85, 0.66], light: 1},
    // tipped over (spin axis ~77 deg from the hole's) so the camera above the disc-facing side sees the
    // temperate belt, not the pole
    {type: B_TERRAN, R: RE_M*1.05, a, P: 1e15, phase: Math.PI/2, inc, parent: 0, spinP: 5400, tilt: 1.35, seed: 421, light: 1.15,
     name: 'MILLER', col: [0.55, 0.72, 1], aAU: a/AU_M},
    {type: B_MOON, R: 0.3*RE_M, a: 40*RE_M, P: 2600, phase: 2.1, inc: 0.12, parent: 1, spinP: 2600, tilt: 0.04, seed: 77, light: 1.15,
     name: 'MILLER I', col: [0.8, 0.8, 0.8], aAU: 40*RE_M/AU_M},
  ];
  return {bodies, terran: 1, HZ: a/AU_M, L: 1, T: 6500, name: 'GARGANTUA', n: 2, extent: a*1.3, bh: true,
          lightCol: [1.0, 0.86, 0.68]};
}
function bhCamM(eyeM){ const s = 1/(BH.M_KM*1e3); return [eyeM[0]*s, eyeM[1]*s, eyeM[2]*s]; }
// Background layer for a black-hole system: bakes on first use (~0.3 s of GPU, spread over frames).
function bhSky(now){
  if (!BH.bake) bhStartBake(bhCamM(bodyPos(deep.sys.terran, deep.sysT)));
  if (!BH.bake.done) bhBakeStep(24);
  bhShade(tg.compFb, tg.w, tg.h, cam.b, Math.tan(cam.fov/2), now, null);
}
// A camera `alt` metres above the point of the world where the hole sits on the horizon, looking at it.
// "Up" there is the hole's spin axis made perpendicular to the line of sight, so the disc lies along the
// horizon (roll turns it; a quarter turn gives the vertical 'keyhole').
// night > 0 moves the camera that many radians round onto the night side: the hole then rises over a lit
// dawn rim above a dark, city-lit globe.
function bhHorizonCamera(alt, pitchDown, sideways, roll, night){
  const Pp = bodyPos(1, deep.sysT), toBH = V.norm(V.mul(Pp, -1));
  let n = V.norm(V.sub([0, 1, 0], V.mul(toBH, toBH[1])));
  if (night) n = V.norm(V.sub(V.mul(n, Math.cos(night)), V.mul(toBH, Math.sin(night))));
  const eye = V.add(Pp, V.mul(n, deep.sys.bodies[1].R + alt));
  const fwd = V.norm(V.sub(toBH, V.mul(n, V.dot(toBH, n))));     // toward the hole, level with the local horizon
  const f = V.norm(V.add(V.add(fwd, V.mul(n, -Math.tan(pitchDown))), V.mul(V.cross(fwd, n), sideways || 0)));
  let r = V.norm(V.cross(f, n)), u = V.cross(r, f);
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll); [r, u] = [V.add(V.mul(r, c), V.mul(u, s)), V.sub(V.mul(u, c), V.mul(r, s))]; }
  return {eye, r, u, f};
}
function bhDevPlanet(){
  deep.sys = makeBHSystem(); deep.star = {SG: [0, 0, 0], idx: 0, type: 'bh'};
  deep.focus = 2; deep.body = 1; deep.sysT = 0; deep.glide = null; flight = null;
  cam.free = bhHorizonCamera(1.0e6, 0.26, 0);
  if (BH.bake && BH.bake.done) return;
  bhStartBake(bhCamM(bodyPos(1, 0)));
  const px = new Uint8Array(4);
  while (!BH.bake.done) { bhBakeStep(8); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
}

// ------------------------------------------------------------------------------ ?scene=bh dev view
// Looks at the hole from the battle's vantage point: r = 40 M, 6 degrees above the disc plane.
const BH_VIEW = {cam: [60*Math.cos(0.044), 60*Math.sin(0.044), 0], yaw: 0, pitch: 0, roll: 0, fov: 40*Math.PI/180};
function bhViewAt(D, elevDeg){ const e = elevDeg*Math.PI/180; BH_VIEW.cam = [D*Math.cos(e), D*Math.sin(e), 0];
  const d = V.norm(V.mul(BH_VIEW.cam, -1)); BH_VIEW.yaw = Math.atan2(d[0], d[2]); BH_VIEW.pitch = Math.asin(d[1]); bhStartBake(BH_VIEW.cam); }
(function(){ const d = V.norm(V.mul(BH_VIEW.cam, -1)); BH_VIEW.yaw = Math.atan2(d[0], d[2]); BH_VIEW.pitch = Math.asin(d[1]); })();
function bhViewBasis(v){
  const cp = Math.cos(v.pitch), f = [cp*Math.sin(v.yaw), Math.sin(v.pitch), cp*Math.cos(v.yaw)];
  let r = V.norm(V.cross(f, [0,1,0])), u = V.cross(r, f);
  const c = Math.cos(v.roll), s = Math.sin(v.roll);
  return {r: V.add(V.mul(r, c), V.mul(u, s)), u: V.sub(V.mul(u, c), V.mul(r, s)), f};
}
function renderBHView(now){
  if (!BH.bake) bhStartBake(BH_VIEW.cam);
  if (!BH.bake.done) bhBakeStep(3);
  bhShade(tg.compFb, tg.w, tg.h, bhViewBasis(BH_VIEW), Math.tan(BH_VIEW.fov/2), now, null);
  bloomFinal(tg.comp, now);
}

// Shade the hole into fb. basis = {r,u,f} in the BH frame; az = camera azimuth used for the bake.
function bhShade(fb, w, h, basis, tanHalf, now, skyCube){
  const Q = P.bhShadeCube, g = BH.gain;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND);
  gl.useProgram(Q.p);
  for (let k = 0; k < 4; k++) { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_CUBE_MAP, BH.cube.tex[k]); }
  gl.uniform1i(Q.u.u_g0, 0); gl.uniform1i(Q.u.u_g1, 1); gl.uniform1i(Q.u.u_g2, 2); gl.uniform1i(Q.u.u_g3, 3);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyCube || BH.emptySky); gl.uniform1i(Q.u.u_sky, 4);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform3fv(Q.u.u_R, basis.r); gl.uniform3fv(Q.u.u_U, basis.u); gl.uniform3fv(Q.u.u_F, basis.f);
  gl.uniform1f(Q.u.u_tanX, tanHalf*w/h); gl.uniform1f(Q.u.u_tanY, tanHalf);
  const bc = BH.bake.cam, az = BH.bake.az;           // true camera = bake camera turned to its azimuth
  gl.uniform3f(Q.u.u_cam, bc[0]*Math.cos(az), bc[1], bc[0]*Math.sin(az));
  gl.uniform1f(Q.u.u_time, now*0.001); gl.uniform1f(Q.u.u_az, BH.bake ? BH.bake.az : 0);
  gl.uniform1f(Q.u.u_spin, BH.spin); gl.uniform1f(Q.u.u_rIn, BH.rIn); gl.uniform1f(Q.u.u_rOut, BH.rOut);
  gl.uniform1i(Q.u.u_dbg, BH.dbg | 0);
  gl.uniform1f(Q.u.u_discGain, g.disc); gl.uniform1f(Q.u.u_starGain, g.star); gl.uniform1f(Q.u.u_hazeGain, g.haze);
  gl.uniform1f(Q.u.u_ringGain, g.ring); gl.uniform1f(Q.u.u_Tpeak, g.Tpeak); gl.uniform1f(Q.u.u_falloff, g.falloff); gl.uniform1f(Q.u.u_contrast, g.contrast); gl.uniform1f(Q.u.u_skyGain, skyCube ? g.sky : 0);
  fullscreen();
}
