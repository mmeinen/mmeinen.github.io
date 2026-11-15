'use strict';
// ships.js — the ship pass: friendly formations that overtake the ship now and then, the MSV MEINEN at the helm, and the
// fight (combat.js): hostile hulls, wrecks and debris, tracers, explosions, all lit by the disc and by the fight itself.
//
// The ships themselves -- meshes, designs and every hardpoint -- are data in shipkit.js; this file draws them. Hulls go
// to a 4x MSAA HDR target with LOGARITHMIC depth -- a linear buffer cannot hold a 16 m fighter and a hull 5 km behind
// it -- cleared, then composited over the planet image, and the pass only runs while something it draws is on screen.
// Faces are wound counter-clockwise seen from outside (shipkit.js), so back faces are culled. Over the hulls: engine
// plumes, shield shells where rounds strike (combat.js cmbShields), glows, the fight's sprites and beams, fighter trails.
// Hulls reflect a live 64^2 environment cube of MILLER (ENV) and the analytic disc.
// (Forked from demo/js/ships.js + battle.js, Sep 2026; the sprite and beam shaders are still the demo's.)

// --------------------------------------------------------------------------------- renderer
const LOGZ_NEAR = 1e-4, LOGZ_K = 1/Math.log2(1e8/LOGZ_NEAR + 1);      // km; depth = log2(d/near + 1)*K
const LOGZ_GLSL = `const float LZN = ${LOGZ_NEAR.toExponential()}; const float LZK = ${LOGZ_K.toFixed(8)};
float logDepth(float dKm){ return log2(dKm/LZN + 1.0)*LZK; }`;

// Instance rows are 8 vec4 (SHIP_ROW floats): i0 position (km, camera-relative) + scale (km per metre), i1 right + damage,
// i2 up + team, i3 forward + glow, i4 part rotation (quaternion; identity for a hull), i5 part pivot (ship metres) + part
// id, i6 shadow tile / warp stretch / clip z0 (or the stretch's anchor: the nose arriving, the tail leaving) / clip z1,
// i7 gun heat / livery / fire pulse / plate size (m; negative: armour plating, the capitals). A part is modelled in
// ship space at its rest pose and turned about its pivot, so it shares its ship's lighting data.
const VS_SHIP = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in vec4 a_att; layout(location=3) in vec2 a_uv;
layout(location=4) in vec4 i0; layout(location=5) in vec4 i1; layout(location=6) in vec4 i2; layout(location=7) in vec4 i3;
layout(location=8) in vec4 i4; layout(location=9) in vec4 i5; layout(location=10) in vec4 i6; layout(location=11) in vec4 i7;
uniform mat4 u_vp;                        // projection * camera rotation (positions are camera-relative, km)
out vec3 vW, vN, vL, vNL, vS, vNS; out vec2 vUV; out vec4 vA; flat out vec4 vI, vX, vT; flat out vec3 vRx, vRy, vRz;
vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }
void main(){
  vec3 lp = qrot(i4, a_pos - i5.xyz*(1.0 - i5.w)) + i5.xyz, ln = qrot(i4, a_nrm);   // part -> ship (i5.w 1: modelled round its own origin)
  if (i6.y > 0.0) lp.z = i6.z + (lp.z - i6.z)*(1.0 + i6.y);            // arriving from a jump: streaked back from the nose
  mat3 R = mat3(i1.xyz, i2.xyz, i3.xyz);  // ship local -> world axes
  vec3 w = R*(lp*i0.w) + i0.xyz;
  vW = w; vN = R*ln; vL = a_pos; vNL = a_nrm; vS = lp; vUV = a_uv; vA = a_att; vI = vec4(i1.w, i2.w, i3.w, i0.w); vX = i7; vT = i6; vNS = ln;
  vRx = R*qrot(i4, vec3(1.0, 0.0, 0.0)); vRy = R*qrot(i4, vec3(0.0, 1.0, 0.0)); vRz = R*qrot(i4, vec3(0.0, 0.0, 1.0));   // the surface's own axes, for bumps
  gl_Position = u_vp*vec4(w, 1.0);
}`;

// The hull shader, compiled three times (shipProgramList): BUCKET 0 painted surfaces (ceramic, paint, heat tiles, trim,
// stripes, decals, panel seams, portholes, battle damage), 1 bare metal and glass (gold foil, radiators, burnt titanium,
// coils, canopies), 2 unlit emitters (windows, engine throats, hangars, weapon emitters, lamps). Everything lit shares
// shade(): GGX + Schlick + the UE4-mobile environment BRDF under
//   - the key: Gargantua's disc, an extended source (~8 deg), so no highlight is ever a pin;
//   - MILLER: its analytic shadow on the key, its fill (wrapped by its angular size) and its reflection -- the live
//     environment cube (ENV, unit 6) once captured, else analytic (lit ocean world, terminator, atmosphere at the limb);
//   - the sky: the disc's glow round the hole and its band along the disc plane;
//   - up to 6 point lights (explosions, muzzles, torpedo motors, the MEINEN's engines).
const FS_HULL = `
precision highp float; precision highp int;
in vec3 vW, vN, vL, vNL, vS, vNS; in vec2 vUV; in vec4 vA; flat in vec4 vI, vX, vT; flat in vec3 vRx, vRy, vRz;
uniform vec3 u_L, u_Lcol, u_amb, u_pC, u_pCol, u_discN;   // key light (to the disc), planet centre (km, cam-rel)
uniform float u_pR, u_pSin, u_time;
uniform vec3 u_liv[${LIVERIES.length*LIV_SLOTS}];
uniform vec4 u_lp[6]; uniform vec3 u_lc[6]; uniform int u_nl;
uniform highp sampler2DShadow u_shadow;                 // the shadow atlas (SH): per tile, 3 rows camera-relative km ->
uniform vec4 u_shM[12], u_shK[4];                       // atlas uv + depth, and (normal offset km, texel uv, bias, -)
uniform highp sampler3D u_ao; uniform vec3 u_aoMin, u_aoInv; uniform float u_aoOff;   // the class's AO volume (ship metres)
uniform sampler2D u_decal;                                                             // hull lettering (unit 4)
uniform highp samplerCube u_env; uniform float u_envK;                                       // live MILLER + MILLER I (unit 6; ENV)
${LOGZ_GLSL}
out vec4 o;
const float PI = 3.14159265;
float h21(vec2 p){ uvec2 q = uvec2(ivec2(floor(p)))*uvec2(0x8da6b343u, 0xd8163841u); uint h = q.x ^ q.y;
  h ^= h >> 16u; h *= 0x85ebca6bu; h ^= h >> 13u; h *= 0xc2b2ae35u; h ^= h >> 16u; return float(h >> 8u)/16777215.0; }
vec3 liv(int lv, int k){ return u_liv[lv*${LIV_SLOTS} + k]; }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p), u = f*f*(3.0 - 2.0*f);                 // smooth value noise
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0)), u.x), u.y); }
// ambient occlusion: the fraction of directions a point just off the surface can see, baked per class (shipAOBake); an
// open face sees half the sphere, so twice that, capped
float aoAt(){
#ifdef NO_AO
  return 1.0;
#else
  float v = clamp(texture(u_ao, (vS + normalize(vNS)*u_aoOff - u_aoMin)*u_aoInv).r*2.0, 0.0, 1.0);
  return v*sqrt(v);                                                      // (a little deeper in the corners)
#endif
}
// self-shadowing from the disc: this ship's tile of the atlas, 4 bilinear compares (16 texels), pushed off the surface
// along its normal by 1.5 texels; 1 outside every tile
float shadowAt(vec3 p, vec3 n){
#ifdef NO_SHADOW
  return 1.0;
#else
  int t = int(vT.x + 0.5); if (vT.x < -0.5) return 1.0;
  vec4 k = u_shK[t], q = vec4(p + n*k.x, 1.0);
  vec3 c = vec3(dot(u_shM[t*3], q), dot(u_shM[t*3 + 1], q), dot(u_shM[t*3 + 2], q) - k.z);
  float o = k.y*0.7;
  return 0.25*(texture(u_shadow, vec3(c.xy + vec2(-o, -o), c.z)) + texture(u_shadow, vec3(c.xy + vec2(o, -o), c.z))
             + texture(u_shadow, vec3(c.xy + vec2(-o, o), c.z)) + texture(u_shadow, vec3(c.xy + vec2(o, o), c.z)));
#endif
}
#if BUCKET < 2
vec3 envSky(vec3 R, float r){
  // (each lobe widens with roughness but keeps its energy: a matte hull must not reflect the disc from everywhere)
  float c = dot(R, u_L), w = r*r, wh = 0.09 + w*0.9, wc = 0.012 + w*0.45, wb = 0.0025 + w*0.25;
  float halo = exp((c - 1.0)/wh)*(0.09/wh), core = exp((c - 1.0)/wc)*(0.012/wc);
  float y = dot(R, u_discN) - dot(u_L, u_discN), band = exp(-y*y/wb)*sqrt(0.0025/wb)*smoothstep(-0.3, 1.0, c);
  return u_Lcol*(0.08*halo + 1.5*core + 0.3*band) + u_amb*0.6;
}
vec3 envPlanet(vec3 p, vec3 R, float r, out float cover){
  vec3 oc = p - u_pC; float b = dot(oc, R), q = dot(oc, oc);
  float d = sqrt(max(q - b*b, 0.0)), e = u_pR*(0.0015 + 0.18*r*r);
  cover = b < 0.0 ? 1.0 - smoothstep(u_pR - e, u_pR + e, d) : 0.0;
  if (cover <= 0.0) return vec3(0.0);
  vec3 n = normalize(oc + R*(-b - sqrt(max(b*b - q + u_pR*u_pR, 0.0))));
  float mu = dot(n, u_L), day = smoothstep(-0.08, 0.25, mu), limb = pow(1.0 - clamp(-dot(n, R), 0.0, 1.0), 4.0);
  return u_Lcol*(vec3(0.17, 0.22, 0.27)*day*(0.3 + 0.7*max(mu, 0.0)) + vec3(0.2, 0.4, 0.95)*limb*smoothstep(-0.3, 0.15, mu)*0.7)
       + vec3(0.006, 0.005, 0.004)*(1.0 - day);
}
vec3 envBRDF(vec3 F0, float r, float NoV){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022), c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 k = r*c0 + c1; float a004 = min(k.x*k.x, exp2(-9.28*NoV))*k.x + k.y;
  return F0*(-1.04*a004 + k.z) + (1.04*a004 + k.w);
}
vec3 shade(vec3 alb, float rough, float metal, vec3 F0, vec3 N, vec3 Vd, float ao, float shK){
  float NoV = max(dot(N, Vd), 1e-3), a = rough*rough;
  vec3 dx = dFdx(N), dy = dFdy(N);
  float a2 = clamp(a*a + min(2.0*(dot(dx, dx) + dot(dy, dy)), 0.3), 2e-4, 1.0);   // specular anti-aliasing
  vec3 oc = vW - u_pC; float bq = dot(oc, u_L), sh = shK;                           // MILLER's shadow on the key
  if (bq < 0.0) sh *= smoothstep(u_pR*0.992, u_pR*1.012, sqrt(max(dot(oc, oc) - bq*bq, 0.0)));
  vec3 H = normalize(u_L + Vd); float NoL = max(dot(N, u_L), 0.0), NoH = max(dot(N, H), 0.0), VoH = max(dot(Vd, H), 0.0);
  float aK = max(a2, 0.006), dd = NoH*NoH*(aK - 1.0) + 1.0, rk = sqrt(sqrt(aK)) + 1.0, k = rk*rk*0.125;   // the disc: ~8 deg across; UE4's k
  float spec = aK/(dd*dd)*0.25/((NoV*(1.0 - k) + k)*(NoL*(1.0 - k) + k));           // pi D V (radiance per E/pi)
  vec3 F = F0 + (1.0 - F0)*pow(1.0 - VoH, 5.0), kd = (1.0 - metal)*(1.0 - F);
  vec3 col = (kd*alb + spec*F)*u_Lcol*NoL*sh;
  vec3 toP = normalize(u_pC - vW);
  float lit = clamp(0.5 - 0.5*dot(toP, u_L), 0.0, 1.0), wrap = clamp((dot(N, toP) + u_pSin)/(1.0 + u_pSin), 0.0, 1.0);
  col += alb*(1.0 - metal)*(u_pCol*wrap*wrap*lit + u_amb)*ao;
#ifndef NO_ENV
  float re = sqrt(sqrt(a2)), cv; vec3 R = reflect(-Vd, N);
  vec3 env = envPlanet(vW, R, re, cv)*cv;                  // the planet: the live capture when there is one, else analytic
  if (u_envK > 0.0) env = textureLod(u_env, R, clamp(5.36 + 2.0*log2(max(re, 0.01)), 0.0, 6.0)).rgb*u_envK;
  col += (env + envSky(R, re)*(1.0 - cv)*(0.45 + 0.55*shK))*envBRDF(F0, re, NoV)*ao;   // (a shadowed face mostly loses the disc)
#endif
#ifndef NO_PLIGHTS
  for (int i = 0; i < 6; i++) {
    if (i >= u_nl) break;
    vec3 dl = u_lp[i].xyz - vW; float d2 = dot(dl, dl), R2 = u_lp[i].w*u_lp[i].w; vec3 l = dl*inversesqrt(d2 + 1e-12);
    float nl = max(dot(N, l), 0.0), at = R2/(d2 + R2), nh = max(dot(N, normalize(l + Vd)), 0.0), ap = max(a2, 0.04), de = nh*nh*(ap - 1.0) + 1.0;
    col += u_lc[i]*at*nl*(kd*alb*ao + F0*ap/(de*de)*0.25);
  }
#endif
  return col;
}
#endif
void main(){
  int mat = int(vA.x + 0.5), lv = int(vX.y + 0.5); float ao = vA.y, seed = vA.z;
  float damage = vI.x, glow = vI.z;
  vec3 N = normalize(vN), Vd = normalize(-vW);
  bool inside = !gl_FrontFacing;                                        // (only a wreck's cut shows back faces: CCW winding)
  if (inside) N = -N;
  float cut = 1e9;
  if (vT.y <= 0.0 && vT.w < 1e8) {                                      // a wreck section: keep its slab, jagged
    float zz = vS.z + (h21(floor(vS.xy*0.08) + 3.0) - 0.5)*18.0 + (h21(floor(vS.xy*0.33) + 9.0) - 0.5)*5.0;
    if (zz < vT.z || zz > vT.w) discard;
    cut = min(zz - vT.z, vT.w - zz);
  }
  // planar projection on the dominant local axis (the panels, tiles, foil and ribs all live in it) and its axes
  vec3 an = abs(vNL); bool ax = an.x > an.y && an.x > an.z, ay = !ax && an.y > an.z;
  vec2 uv = ax ? vL.zy : (ay ? vL.xz : vL.xy);
  vec3 Tu = ax ? vRz : vRx, Tv = ax ? vRy : (ay ? vRz : vRy);
  vec3 col = vec3(0.0);
#if BUCKET == 2
  vec3 eng = liv(lv, 3), win = liv(lv, 4);
  float wpx = max(max(fwidth(vL.x), fwidth(vL.z)), fwidth(vL.y))/1.8;      // window cells per pixel (before any branch)
  if (mat == 3) {                                                       // window strips (their mean when the cells are sub-pixel:
    vec2 wg = vec2((an.x > 0.5 ? vL.z : vL.x)/2.2, vL.y/1.8);           // lit next to black at 1-2 px aliased into crosses)
    col = win*mix(step(0.25, h21(floor(wg) + 9.0))*(0.6 + 0.8*h21(floor(wg) + 2.0)), 0.75, smoothstep(0.35, 1.2, wpx))*1.4;
  } else if (mat == 4) col = vA.w > 0.5 ? eng*(0.7 + 2.4*glow)*mix(2.4, 0.12, sqrt(clamp(vUV.x, 0.0, 1.0)))               // a nozzle, throat to rim
    : eng*(0.9 + 2.0*glow)*(0.55 + 0.45*smoothstep(1.0, 0.2, length(fract(vL.xy/8.0) - 0.5)*2.0));   // capital throats
  else if (mat == 5) col = win*step(0.7, fract(vL.y/7.0))*0.6 + vec3(0.004);                   // hangar mouths
  else if (mat == 6) col = eng*(0.15 + 9.0*glow*glow);                                         // weapon emitters charge up
  else col = liv(lv, 5)*2.5;                                                                   // lamps
#else
  vec3 hull = liv(lv, 0), dark = liv(lv, 1), fl = liv(lv, 6), emit = vec3(0.0), alb, F0;
  float rough = 0.5, metal = 0.0, shK = shadowAt(vW, normalize(vN)), aoK = ao*aoAt();
#if BUCKET == 0
  float decalA = texture(u_decal, vUV).a;                              // (sampled before any branch: derivatives stay defined)
  vec2 fwU = max(fwidth(uv), 1e-5);                                     // metres per pixel, likewise
  // panels: brick-offset plates; seams are GROOVES whose walls catch the light, fading out when sub-pixel. Capitals (a
  // negative plate size) wear armour plating instead: 2:1 panels, each whole or split across, along or in four by its
  // hash, rows offset irregularly, seams narrow grooves of a fixed width in metres that fade to their mean when thinner
  // than a pixel (a pixel-wide dark line on every plate read as masonry from afar)
  float P0 = max(abs(vX.w), 0.1), ps = mat == 1 ? P0*0.64 : mat == 8 ? 0.5 : P0;     // the class's plate size (m)
  bool arm = vX.w < 0.0 && mat != 8;
  vec2 cell = arm ? vec2(2.0*ps, ps) : vec2(ps*(mat == 8 ? 1.0 : 1.7), ps);
  vec2 g = uv/cell; g.x += arm ? 0.37*floor(g.y) : mat != 8 ? 0.5*floor(g.y) : 0.0;
  vec2 id = floor(g), f = fract(g);
  if (arm) {
    float k = h21(id + seed*13.0 + 31.0);
    vec2 sub = k < 0.3 ? vec2(1.0) : k < 0.62 ? vec2(2.0, 1.0) : k < 0.84 ? vec2(1.0, 2.0) : vec2(2.0);
    vec2 sg = f*sub; id = id*2.0 + floor(sg); f = fract(sg); cell /= sub;
  }
  vec2 fw = max(fwU/cell, 1e-4);
  float hp = h21(id + seed*17.0), hq = h21(id + seed*5.3 + 7.0);
  vec2 dE = min(f, 1.0 - f);
  float detail = clamp(1.0 - max(fw.x, fw.y)*1.5, 0.0, 1.0);
  float seam = (1.0 - smoothstep(0.6, 1.6, min(dE.x/fw.x, dE.y/fw.y)))*detail;
  if (arm) { float sw = 0.05*ps, px = max(fwU.x, fwU.y);
    seam = (1.0 - smoothstep(sw*0.5, sw*0.5 + px, min(dE.x*cell.x, dE.y*cell.y)))*min(1.0, sw/px)*0.55; }
#ifndef NO_DETAIL
  vec2 gw = max(vec2(0.018), fw*1.2), band = (1.0 - smoothstep(vec2(0.0), gw, dE))*(0.018/gw)*detail;
  N = normalize(N + (Tu*sign(f.x - 0.5)*band.x + Tv*sign(f.y - 0.5)*band.y)*0.9);
  if (arm) N = normalize(N + (Tu*(hp - 0.5) + Tv*(hq - 0.5))*0.04*detail);          // each plate sits a little askew
#endif
  bool tiles = mat == 8 || (mat == 0 && fl.y > 0.5 && vNL.y < -0.6);        // the MEINEN's belly: black heat tiles
  if (tiles) {
    alb = vec3(0.035, 0.036, 0.04)*(0.75 + 0.5*hp); rough = 0.62 + 0.2*hq;
  } else if (mat == 0) { alb = hull*mix(1.0, arm ? 0.94 + 0.12*hp : 0.88 + 0.24*hp, detail); rough = liv(lv, 7).x + liv(lv, 7).y*(hq - 0.5); }
  else if (mat == 1) { alb = dark*mix(1.0, arm ? 0.9 + 0.2*hp : 0.8 + 0.4*hp, detail); rough = liv(lv, 7).z + 0.1*hq; metal = 0.6; }
  else if (mat == 2) { alb = liv(lv, 2); rough = 0.35; }
  else if (mat == 7) { alb = dark*1.6; rough = 0.45; metal = 0.5; }
  else if (mat == 13) { alb = mix(vec3(0.02), vec3(0.85, 0.6, 0.05), step(0.5, fract((uv.x + uv.y)*0.9))); rough = 0.45; }   // hazard
  else if (mat == 15) {                                                  // lettering: ink over its ground (att.w picks the pair)
    int id = int(vA.w + 0.5);
    alb = mix(id == 1 ? hull : id == 2 ? vec3(0.03) : dark, id == 1 ? vec3(0.035) : id == 2 ? vec3(0.78) : liv(lv, 2), decalA);
    rough = 0.45;
  }
  else { alb = hull; }
  if (arm) alb *= 0.88 + 0.24*vn2(uv/(ps*7.0) + seed*3.0);           // broad tone patches over the plates
  alb *= 1.0 - (tiles ? 0.3 : 0.55)*seam;
  // grime: soot toward the stern and in the seams (on armour, soft streaks rather than blocks)
  alb *= 1.0 - fl.z*0.25*(arm ? smoothstep(0.35, 1.0, vn2(uv*vec2(0.05, 0.16) + 3.0)) : smoothstep(0.3, 1.0, h21(floor(uv*0.35) + 3.0))*detail);
  if (((mat == 0 && !tiles) || mat == 7) && !ay && (!arm || vA.w > 4.5)) {   // lit windows in deck rows give the eye the scale (armour: tagged hull only)
    vec2 wg = uv/vec2(3.2, 2.6); vec2 wid = floor(wg), wf = fract(wg);
    float deck = step(mod(wid.y + floor(seed*0.1), 4.0), 0.5), run = step(0.45, h21(vec2(floor(wid.x/7.0), wid.y) + seed));
    float on = fl.x*deck*run*step(0.22, h21(wid + seed*3.1 + 5.0));
    emit += liv(lv, 4)*on*smoothstep(0.5, 0.2, max(abs(wf.x - 0.5), abs(wf.y - 0.5)*1.4))*0.9*clamp(1.0 - max(fwidth(wg.x), fwidth(wg.y))*0.7, 0.15, 1.0);
  }
  if (damage > 0.0) {                                                   // burning damage: hot cracks that flicker
    float n = h21(floor(vL.xz/9.0) + seed)*h21(floor(vL.zy/13.0) + 3.0);
    emit += vec3(1.0, 0.35, 0.08)*smoothstep(1.0 - damage*0.45, 1.0, n)*(1.5 + sin(u_time*9.0 + n*40.0))*1.4;
    alb *= 1.0 - 0.7*smoothstep(1.0 - damage*0.8, 1.0, n);
  }
#else
  // bare metal and glass
  if (mat == 9) {                                                       // gold MLI foil: crumpled flat facets
    vec2 cg = uv*2.6 + seed; vec2 ci = floor(cg); float h1 = h21(ci), h2 = h21(ci + 17.0);
    float fd = clamp(1.0 - max(fwidth(cg.x), fwidth(cg.y))*0.8, 0.0, 1.0);
    N = normalize(N + (Tu*(h1 - 0.5) + Tv*(h2 - 0.5))*0.38*fd);
    alb = vec3(1.0, 0.74, 0.34)*(0.8 + 0.25*h21(ci + 5.0)); rough = 0.32 + 0.12*h1; metal = 1.0;
  } else if (mat == 10) {                                               // radiator: black ribbed panels that glow with heat
    float rv = fract(uv.x*2.5), rw = max(fwidth(uv.x*2.5), 1e-4);
    float rib = smoothstep(0.0, rw*1.5 + 0.08, rv)*smoothstep(0.0, rw*1.5 + 0.08, 1.0 - rv);
    N = normalize(N + Tu*(rv < 0.5 ? -1.0 : 1.0)*(1.0 - rib)*0.5*clamp(1.0 - rw*3.0, 0.0, 1.0));
    alb = vec3(0.028, 0.03, 0.034)*(0.8 + 0.4*rib); rough = 0.32; metal = 0.35;
    float heat = clamp(vX.x, 0.0, 1.0);
    emit = vec3(1.0, 0.18, 0.02)*heat*heat*(0.35 + 0.65*rib)*2.2 + vec3(1.0, 0.45, 0.1)*pow(heat, 4.0)*rib*2.0;
  } else if (mat == 11) {                                               // canopy glass: dark, glossy, faint instrument glow
    alb = vec3(0.012, 0.014, 0.018); rough = 0.05; metal = 0.0;
    vec2 ig = uv*9.0; emit = liv(lv, 4)*step(0.965, h21(floor(ig)))*smoothstep(0.35, 0.1, length(fract(ig) - 0.5))*0.03;
  } else if (mat == 12) {                                               // burnt titanium: the heat-tint ramp of a nozzle
    float t = clamp(vUV.x, 0.0, 1.0);
    alb = mix(mix(vec3(0.55, 0.42, 0.24), vec3(0.36, 0.2, 0.36), smoothstep(0.1, 0.45, t)), vec3(0.38, 0.4, 0.44), smoothstep(0.45, 0.9, t));
    rough = 0.28; metal = 1.0;
  } else {                                                              // coil windings (copper), glowing when the gun fires
    alb = vec3(0.95, 0.52, 0.32); rough = 0.3; metal = 1.0;
    emit = liv(lv, 3)*vX.z*step(0.5, fract(vL.z*3.0))*2.5;
  }
#endif
  F0 = mix(vec3(0.04), alb, metal);
  if (cut < 1e8) {                                                      // the torn edge still glows; the inside is dark and burning
    emit += vec3(2.4, 0.7, 0.15)*exp(-cut/6.0)*(0.8 + 0.4*sin(u_time*7.0 + vS.x*0.3)) + vec3(0.9, 0.25, 0.05)*exp(-cut/1.5)*2.0;
    if (inside) { alb *= 0.15; emit += vec3(0.5, 0.12, 0.02)*h21(floor(vS.xz*0.12))*1.2; }
  }
  if (vT.y > 0.0) emit += vec3(0.55, 0.8, 1.4)*min(vT.y*0.04, 1.6);   // a jump's arrival flash on the hull
#if defined(DBG_AO) || defined(DBG_SHADOW)
  o = vec4(vec3(DBG_AO_SH), 1.0); gl_FragDepth = logDepth(length(vW)); return;       // look development: AO or shadow alone
#endif
  col = shade(alb, rough, metal, F0, N, Vd, aoK, shK) + emit;
#endif
  o = vec4(col, 1.0);
  gl_FragDepth = logDepth(length(vW));
}`;

const SHIP_ROW = 32, SHIP_MAXI = 256;       // floats per instance row; instances per class per draw
const SHIPGL = {};           // class -> {vao, n, type, instBuf, inst, radius, tris, min, max}
function shipClassGL(name){
  if (SHIPGL[name]) return SHIPGL[name];
  if (name.endsWith('#w')) {                                             // wreck sections of a class: its mesh, their own rows
    const B = shipClassGL(name.slice(0, -2)), va = gl.createVertexArray(), S = SHIP_VSTRIDE*4; gl.bindVertexArray(va);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 24); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 40);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.ib);
    const instBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, SHIP_ROW*4*SHIP_MAXI, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 8; k++) { gl.enableVertexAttribArray(4 + k); gl.vertexAttribPointer(4 + k, 4, gl.FLOAT, false, SHIP_ROW*4, k*16); gl.vertexAttribDivisor(4 + k, 1); }
    gl.bindVertexArray(vao);
    return SHIPGL[name] = Object.assign({}, B, {name, vao: va, instBuf, inst: new Float32Array(SHIP_ROW*SHIP_MAXI), wreck: true, base: B.name});
  }
  const b = shipKitBuild(name), S = SHIP_VSTRIDE*4;
  const va = gl.createVertexArray(); gl.bindVertexArray(va);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, b.vb, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 40);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.ib, gl.STATIC_DRAW);
  const instBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, SHIP_ROW*4*SHIP_MAXI, gl.DYNAMIC_DRAW);
  for (let k = 0; k < 8; k++) { gl.enableVertexAttribArray(4 + k); gl.vertexAttribPointer(4 + k, 4, gl.FLOAT, false, SHIP_ROW*4, k*16); gl.vertexAttribDivisor(4 + k, 1); }
  gl.bindVertexArray(vao);
  const G = SHIPGL[name] = {name, vb, ib, vao: va, n: b.ib.length, type: b.ib instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, ao: null,
    instBuf, inst: new Float32Array(SHIP_ROW*SHIP_MAXI), radius: b.radius, tris: b.tris, min: b.min, max: b.max, buckets: b.buckets,
    isz: b.ib instanceof Uint32Array ? 4 : 2};
  if (P.aoCount && P.aoCount.u && !(SHIP_KIT[name] && SHIP_KIT[name].of)) shipAOBake(G);   // (parts with `of` use their ship's volume)
  return G;
}
// Boot: build and upload one class per call, the MEINEN first (a cruiser built on its first frame is a hitch at the
// worst moment -- its arrival). Returns true when all are done.
function shipPrebuildStep(){
  for (const c of SHIP_ORDER) if (!SHIPGL[c]) { shipClassGL(c); return false; }
  return true;
}
// quaternions [x, y, z, w]: product, and rotating a vector (as the vertex shader's qrot)
const qMul = (a, b) => [a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1], a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
  a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3], a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2]];
const qRot = (q, v) => { const t = V.mul(V.cross(q, v), 2); return V.add(V.add(v, V.mul(t, q[3])), V.cross(q, t)); };
// one instance row into a (Float32Array) at row n: rel (camera-relative km), scale (km per metre), axes r/u/f; the
// livery follows the class and team (SHIP_KIT)
function shipRow(d, n, cls, rel, k, r, u, f, damage, team, glow){
  cls = cls.replace('#w', '');
  const o = n*SHIP_ROW;
  d[o] = rel[0]; d[o+1] = rel[1]; d[o+2] = rel[2]; d[o+3] = k;
  d[o+4] = r[0]; d[o+5] = r[1]; d[o+6] = r[2]; d[o+7] = damage || 0;
  d[o+8] = u[0]; d[o+9] = u[1]; d[o+10] = u[2]; d[o+11] = team || 0;
  d[o+12] = f[0]; d[o+13] = f[1]; d[o+14] = f[2]; d[o+15] = glow || 0;
  d[o+16] = 0; d[o+17] = 0; d[o+18] = 0; d[o+19] = 1;                  // part rotation: identity
  d[o+20] = 0; d[o+21] = 0; d[o+22] = 0; d[o+23] = 0;                  // pivot, part id
  d[o+24] = -1; d[o+25] = 0; d[o+26] = -1e9; d[o+27] = 1e9;           // no shadow tile, no stretch, no clip
  const K = SHIP_KIT[cls];
  d[o+28] = 0; d[o+29] = K.livery[team ? 1 : 0]; d[o+30] = 0; d[o+31] = (K.plating ? -1 : 1)*(K.panel || 8);   // gun heat, livery, fire pulse, plate size (< 0: armour plating)
}

const VS_SPR = `#version 300 es
precision highp float;
layout(location=0) in vec4 i0; layout(location=1) in vec4 i1; layout(location=2) in vec4 i2; layout(location=3) in vec4 i3;
uniform mat4 u_vp; uniform vec3 u_R, u_U;
out vec2 vUV; out vec3 vCol; flat out vec4 vP; out float vDist;
void main(){
  int k = gl_VertexID; vec2 q = vec2(float(k & 1), float(k >> 1))*2.0 - 1.0;
  vec3 ax = i2.xyz, ay = i3.xyz;
  if (dot(ax, ax) < 1e-12) { ax = u_R; ay = u_U; }         // camera-facing unless oriented
  vec3 p = i0.xyz + (ax*q.x + ay*q.y)*i0.w;
  vUV = q; vCol = i1.rgb; vP = vec4(i1.w, i2.w, i3.w, i0.w); vDist = length(p);
  gl_Position = u_vp*vec4(p, 1.0);
}`;
const FS_SPR = `#version 300 es
precision highp float; precision highp int;
in vec2 vUV; in vec3 vCol; flat in vec4 vP; in float vDist;
uniform float u_time;
${LOGZ_GLSL}
out vec4 o;
const uvec3 HK = uvec3(0x8da6b343u, 0xd8163841u, 0xcb1ab31fu);
float hf(uint h){ h ^= h >> 16u; h *= 0x85ebca6bu; h ^= h >> 13u; h *= 0xc2b2ae35u; h ^= h >> 16u; return float(h >> 8u)/16777215.0; }
float vn3(vec3 x){ vec3 fl = floor(x), w = x - fl, u = w*w*(3.0 - 2.0*w); uvec3 p0 = uvec3(ivec3(fl))*HK, p1 = p0 + HK;
  return mix(mix(mix(hf(p0.x^p0.y^p0.z), hf(p1.x^p0.y^p0.z), u.x), mix(hf(p0.x^p1.y^p0.z), hf(p1.x^p1.y^p0.z), u.x), u.y),
             mix(mix(hf(p0.x^p0.y^p1.z), hf(p1.x^p0.y^p1.z), u.x), mix(hf(p0.x^p1.y^p1.z), hf(p1.x^p1.y^p1.z), u.x), u.y), u.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a*vn3(p); p = p*2.07 + 3.1; a *= 0.5; } return s; }
vec3 fire(float T){ return vec3(1.0, 0.45, 0.12)*smoothstep(0.0, 0.35, T) + vec3(0.0, 0.5, 0.3)*smoothstep(0.35, 0.7, T) + vec3(0.0, 0.1, 0.55)*smoothstep(0.7, 1.0, T); }
void main(){
  gl_FragDepth = logDepth(vDist);                         // same depth law as hulls and the planet
  int type = int(vP.x + 0.5); float age = vP.y, seed = vP.z;
  vec2 q = vUV; float r = length(q);
  float win = 1.0 - smoothstep(0.7, 1.0, r);               // every sprite fades to zero inside its quad
  vec4 c = vec4(0.0);
  if (type == 0) {                                        // glow
    float g = exp(-r*r*9.0) + 0.12*exp(-r*r*2.2);
    c = vec4(vCol*g*win, 0.0);
  } else if (type == 1) {                                 // flash with anamorphic-free spikes (6 + 2, JWST-like)
    float g = (exp(-r*r*40.0)*2.0 + exp(-r*r*6.0)*0.4 + 0.05*exp(-r*1.2))*win;
    float sp = 0.0;
    for (int i = 0; i < 3; i++) { float a = 1.5708 + float(i)*1.0472; vec2 d = vec2(cos(a), sin(a));
      float al = abs(dot(q, d)), pe = abs(dot(q, vec2(-d.y, d.x))); sp += exp(-pe*pe*5000.0)*pow(max(1.0 - al, 0.0), 3.0); }
    sp += 0.4*exp(-q.y*q.y*8000.0)*pow(max(1.0 - abs(q.x)*1.6, 0.0), 3.0);
    sp *= 1.0 - smoothstep(0.8, 1.0, max(abs(q.x), abs(q.y)));
    c = vec4(vCol*(g + sp*0.9), 0.0);
  } else if (type == 2) {                                 // fireball: noisy sphere, cooling from white to smoke
    if (r > 1.0) discard;
    float z = sqrt(1.0 - r*r);
    float n = fbm(vec3(q*2.4, z*1.5 + seed*7.0) + vec3(0.0, 0.0, age*0.9));
    float dens = smoothstep(0.1, 0.55, n + z*0.55 - r*0.45 - age*0.35);
    float T = clamp(1.25 - age*1.05 + (n - 0.5)*0.6 + z*0.25, 0.0, 1.0);
    vec3 em = fire(T)*T*T*2.6*vCol;
    float smoke = dens*smoothstep(0.25, 1.0, age)*0.85;
    c = vec4(em*dens + vec3(0.05, 0.045, 0.04)*smoke*0.3, smoke*0.9);
  } else if (type == 3) {                                 // smoke puff
    if (r > 1.0) discard;
    float n = fbm(vec3(q*2.0, seed*5.0 + age*0.4));
    float d = smoothstep(1.0, 0.3, r)*smoothstep(0.25, 0.65, n)*(1.0 - smoothstep(0.4, 1.0, age));
    c = vec4(vCol*d*0.15, d*0.55);
  } else if (type == 4) {                                 // shockwave ring (oriented quad)
    float w = 0.05 + 0.1*age, x = (r - (1.0 - w))/w;
    float ring = exp(-x*x*2.0)*(1.0 - smoothstep(0.7, 1.0, age))*(1.0 - smoothstep(0.9, 1.0, r));
    float n = 0.6 + 0.8*fbm(vec3(atan(q.y, q.x)*3.0, r*6.0, seed));
    c = vec4(vCol*ring*n, 0.0);
  } else if (type == 5) {                                 // shield hit: hex cells flaring round the impact
    vec2 h = q*6.0; h.x *= 1.1547; h.y += mod(floor(h.x), 2.0)*0.5;
    vec2 f = fract(h) - 0.5; float edge = smoothstep(0.38, 0.5, max(abs(f.x)*1.2, abs(f.y)));
    float fall = exp(-r*r*3.0)*(1.0 - age);
    c = vec4(vCol*(edge*0.9 + 0.25)*fall, 0.0);
  }
  o = c;
}`;

// ------------------------------------------------------------------------------------------ flybys (landing page)
// Every minute or so a friendly formation overtakes the ship and heads for the hole: the MSAA ship pass runs only
// while one (or the player's own ship, flight.js) is on screen. Formations live in MILLER's frame (metres, sim m/s:
// the fight's frame), spawned beside the ship with its orbital velocity plus their own, and fall round MILLER like it
// does -- placed relative to the camera instead they would stick to you at the helm (and in the hole's frame MILLER
// moves at 0.15 c). At STATION they fly in the station frame (orbit.js ORB.stBasis, turning with the hole's direction):
// only there is the scripted eye an exact Kepler circle, and formations falling freely in MILLER's own frame drifted
// ~10 km behind the camera in a pass. At the helm and on the autopilot they are inertial, as the ship is.
const SHIP_LIV = new Float32Array(LIVERIES.flat(2));          // every livery, flattened for u_liv (LIV_SLOTS vec3 each)
const FLY = {ships: [], next: 24, n: 0, t: 0, vao: null, buf: null, data: new Float32Array(16*128), contact: null, dbg: 0,
  pvao: null, pbuf: null, plume: new Float32Array(16*64), rcs: {puffs: [], w: null, t: 0}, basis: null, w: [0, 0, 0], wasStation: false,
  jumpAt: null, events: []};

// Tracers, sparks and warp streaks: demo/js/battle.js VS_BEAM / FS_BEAM, verbatim.
const VS_BEAM = `#version 300 es
precision highp float;
layout(location=0) in vec4 i0; layout(location=1) in vec4 i1; layout(location=2) in vec4 i2;
uniform mat4 u_vp; uniform float u_pxK;                   // pixels per (km at 1 km)
out vec2 vUV; out vec3 vCol; out float vW; out float vDist; flat out float vCore;
void main(){
  vec3 a = i0.xyz, b = i1.xyz; float w = i0.w;
  int k = gl_VertexID; float s = float(k >> 1), side = float(k & 1)*2.0 - 1.0;
  vec3 p = mix(a, b, s), d = b - a;
  vec3 perp = cross(d, p); float pl = length(perp); perp = pl > 1e-12 ? perp/pl : vec3(0.0, 1.0, 0.0);
  float dist = max(length(p), 1e-6), px = w/dist*u_pxK;
  float wd = max(w, 1.3*dist/u_pxK);                      // never thinner than ~1.3 px: keeps flux, kills flicker
  vec3 ext = normalize(d)*wd*(s*2.0 - 1.0);
  p += perp*side*wd*2.5 + ext;
  vUV = vec2(side*2.5, s); vCol = i2.rgb*min(px/1.3, 1.0); vW = i2.a; vCore = i1.w; vDist = length(p);
  gl_Position = u_vp*vec4(p, 1.0);
}`;
const FS_BEAM = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vCol; in float vW; in float vDist; flat in float vCore;
${LOGZ_GLSL}
out vec4 o;
void main(){
  gl_FragDepth = logDepth(vDist);
  float v = vUV.x, core = exp(-v*v*6.0), glow = exp(-abs(v)*1.6)*0.35*(1.0 - smoothstep(1.5, 2.5, abs(v)));   // zero at the quad edge
  vec3 c = vCol*(core*vCore + glow)*vW + vec3(1.0)*core*core*vCore*0.6*vW*length(vCol)/1.7;
  o = vec4(c, 0.0);
}`;
// Shadow casters: every hull and part, into one tile of the atlas (u_r0..2: camera-relative km -> the tile's NDC).
const VS_SHDEPTH = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=4) in vec4 i0; layout(location=5) in vec4 i1; layout(location=6) in vec4 i2; layout(location=7) in vec4 i3;
layout(location=8) in vec4 i4; layout(location=9) in vec4 i5; layout(location=10) in vec4 i6;
uniform vec4 u_r0, u_r1, u_r2;
vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }
void main(){
  vec3 lp = qrot(i4, a_pos - i5.xyz*(1.0 - i5.w)) + i5.xyz;
  if (i6.y > 0.0) lp.z = i6.z + (lp.z - i6.z)*(1.0 + i6.y);
  vec4 w = vec4(mat3(i1.xyz, i2.xyz, i3.xyz)*(lp*i0.w) + i0.xyz, 1.0);
  gl_Position = vec4(dot(u_r0, w), dot(u_r1, w), dot(u_r2, w), 1.0);
}`;
const FS_SHDEPTH = `#version 300 es
precision mediump float;
void main(){}`;
// AO bake, one z-slice of the volume: how many of the u_nd baked directions see this voxel's centre (u_dm: per direction
// 3 rows ship metres -> atlas uv + depth, compared in hardware)
const FS_AOCOUNT = `#version 300 es
precision highp float;
uniform highp sampler2DShadow u_sh; uniform vec4 u_dm[192]; uniform vec3 u_bmin, u_vox; uniform float u_z; uniform int u_nd;
out vec4 o;
void main(){
  vec4 q = vec4(u_bmin + vec3(gl_FragCoord.xy, u_z + 0.5)*u_vox, 1.0); float vis = 0.0;
  for (int i = 0; i < 64; i++) { if (i >= u_nd) break; vis += texture(u_sh, vec3(dot(u_dm[i*3], q), dot(u_dm[i*3 + 1], q), dot(u_dm[i*3 + 2], q))); }
  o = vec4(vis/float(u_nd), 0.0, 0.0, 1.0);
}`;
// Engine plumes: each one a quad covering its cone as seen from the camera (along the projected axis, or a square round
// the nozzle when seen end-on, which is how the chase camera sees the MEINEN's), and a raymarch through the cone:
// a fusion flame widening downstream, its hot core, and the shock diamonds of an exhaust leaving a nozzle. Additive,
// depth-tested against the hulls at the ray's entry. Rows (4 vec4): nozzle exit (km) + radius (km), exhaust axis +
// length (km), core colour + throttle, outer colour + seed.
const VS_PLUME = `#version 300 es
precision highp float;
layout(location=0) in vec4 i0; layout(location=1) in vec4 i1; layout(location=2) in vec4 i2; layout(location=3) in vec4 i3;
uniform mat4 u_vp;
out vec3 vP; flat out vec4 vA, vB, vC, vD;
void main(){
  int k = gl_VertexID; vec2 q = vec2(float(k & 1), float(k >> 1))*2.0 - 1.0;
  float r0 = i0.w, len = i1.w, rm = r0*1.7 + len*0.035;
  vec3 a = i0.xyz, b = a + i1.xyz*len, mid = 0.5*(a + b), vd = normalize(mid), d = b - a;
  vec3 dp = d - vd*dot(d, vd); float dl = length(dp);
  vec3 X = dl > 1e-9 ? dp/dl : normalize(cross(vd, abs(vd.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 Y = normalize(cross(vd, X));
  vP = mid + X*q.x*(dl*0.5 + rm*1.2) + Y*q.y*rm*1.2;
  vA = i0; vB = i1; vC = i2; vD = i3;
  gl_Position = u_vp*vec4(vP, 1.0);
}`;
const FS_PLUME = `#version 300 es
precision highp float;
in vec3 vP; flat in vec4 vA, vB, vC, vD;
uniform float u_time; uniform int u_steps;
${LOGZ_GLSL}
out vec4 o;
void main(){
  vec3 rd = normalize(vP), ax = vB.xyz, oc = -vA.xyz; float r0 = vA.w, len = vB.w, rm = r0*1.7 + len*0.035;
  float dz = dot(rd, ax), oz = dot(oc, ax); vec3 dpr = rd - ax*dz, opr = oc - ax*oz;
  float A = dot(dpr, dpr), B = 2.0*dot(dpr, opr), C = dot(opr, opr) - rm*rm, t0 = 0.0, t1 = 1e9;
  if (A > 1e-12) { float D = B*B - 4.0*A*C; if (D <= 0.0) discard; float s = sqrt(D); t0 = (-B - s)/(2.0*A); t1 = (-B + s)/(2.0*A); }
  else if (C > 0.0) discard;
  if (abs(dz) > 1e-7) { float za = -oz/dz, zb = (len - oz)/dz; t0 = max(t0, min(za, zb)); t1 = min(t1, max(za, zb)); }
  else if (oz < 0.0 || oz > len) discard;
  t0 = max(t0, 0.0); if (t1 <= t0) discard;
  float dt = (t1 - t0)/float(u_steps), j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + u_time*7.0)*43758.5453);
  vec3 L = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= u_steps) break;
    vec3 x = oc + rd*(t0 + (float(i) + j)*dt); float z = dot(x, ax), zr = clamp(z/len, 0.0, 1.0);
    float rho2 = dot(x - ax*z, x - ax*z), rz = r0*(0.5 + 0.7*sqrt(zr)) + len*0.018*zr;
    float den = exp(-rho2/(rz*rz)*2.2)*exp(-zr*4.0)*smoothstep(0.0, 0.02, zr);
    float dia = pow(0.5 + 0.5*cos(6.2832*z/(r0*2.4)), 10.0)*exp(-zr*6.0)*exp(-rho2/(r0*r0*0.18));   // shock diamonds
    L += (mix(vC.rgb, vD.rgb, clamp(sqrt(rho2)/rz*0.7 + zr*1.2, 0.0, 1.0))*den + vC.rgb*dia*2.0)*dt/r0;
  }
  L *= vC.w*(0.92 + 0.08*sin(u_time*41.0 + vD.w*20.0))*0.06;
  o = vec4(L/(1.0 + max(max(L.r, L.g), L.b)*0.35), 0.0);              // soft saturation: seen end-on, a plume stacks its length
  gl_FragDepth = logDepth(t0);
}`;
// Shield shells (combat.js cmbShields): an inflated low-poly proxy of the class's shell ellipsoid, and in the fragment
// shader the view ray against the exact ellipsoid -- the near surface in a front-face pass, the far one in a back-face pass
// -- so the silhouette, the fresnel and the (log) depth are exact. Per ripple: an expanding ring, a dim flare at the impact
// and hex cells in the impact's tangent plane; the collapse (shields failed) lights the whole shell in cells that blink
// out. Additive, premultiplied (alpha 0), depth-tested against the hulls.
const VS_SHIELD = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
uniform mat4 u_vp; uniform vec3 u_c, u_ax, u_ay, u_az;          // shell centre (km, camera-relative) and its axes x radii (km)
out vec3 vW;
void main(){ vec3 w = u_c + (u_ax*a_pos.x + u_ay*a_pos.y + u_az*a_pos.z)*1.07; vW = w; gl_Position = u_vp*vec4(w, 1.0); }`;
const FS_SHIELD = `#version 300 es
precision highp float;
in vec3 vW;
uniform vec3 u_c, u_r, u_col; uniform mat3 u_Mi;                 // u_Mi: world (km) -> the shell's unit sphere; u_r radii (m)
uniform vec4 u_hit[4]; uniform float u_fl[4];                    // ripples: direction (unit sphere) + age (s, < 0 none); since last flare
uniform float u_down, u_k, u_side, u_rm;                         // collapse age (< 0 none), shield left, pass (1 near, -1 far), reduced motion
${LOGZ_GLSL}
out vec4 o;
vec3 hexCell(vec2 p){ vec2 r = vec2(1.0, 1.7320508), h = r*0.5, a = mod(p, r) - h, b = mod(p - h, r) - h, g = dot(a, a) < dot(b, b) ? a : b, q = abs(g);
  return vec3(0.5 - max(dot(q, vec2(0.5, 0.8660254)), q.x), p - g); }    // (distance to the cell's edge: 0 there; the cell's centre)
void main(){
  vec3 rd = normalize(vW), o3 = u_Mi*(-u_c), d3 = u_Mi*rd;
  float A = dot(d3, d3), B = dot(o3, d3), D = B*B - A*(dot(o3, o3) - 1.0);
  if (D <= 0.0) discard;
  float t = (-B - u_side*sqrt(D))/A; if (t <= 0.0) discard;
  vec3 U = o3 + d3*t, S = U*u_r, N = normalize(transpose(u_Mi)*U);
  float rmax = max(u_r.x, max(u_r.y, u_r.z)), rmin = min(u_r.x, min(u_r.y, u_r.z)), cs = 0.07*rmin + 0.012*rmax, e = 0.0, act = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = u_hit[i].w; if (age < 0.0 || age > 1.2) continue;
    vec3 Si = u_hit[i].xyz*u_r, dv = S - Si, ni = normalize(u_hit[i].xyz/u_r);
    vec3 t1 = normalize(cross(ni, abs(ni.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(ni, t1);
    float dist = length(dv), fade = 1.0 - smoothstep(0.0, 1.2, age), R = age*0.5*rmax;
    float ring = u_rm > 0.5 ? 0.0 : exp(-pow((dist - R)/(0.05*rmax + 0.15*R), 2.0))*fade;
    float flare = exp(-dist*dist/(0.004*rmax*rmax + cs*cs))*exp(-u_fl[i]*6.0)*(u_rm > 0.5 ? 0.6 : 1.0);
    float cell = 1.0 - smoothstep(0.015, 0.07, hexCell(vec2(dot(dv, t1), dot(dv, t2))/cs).x);
    float glow = exp(-dist/(0.25*rmax))*fade;
    e += flare*0.9 + ring*0.5 + cell*(ring*1.1 + glow*0.45); act = max(act, fade);
  }
  if (u_down >= 0.0 && u_down < 0.9) {                           // the collapse: every cell lights, then they go out one by one
    float ca = u_down/0.9; vec3 aU = abs(U);
    vec3 hc = hexCell((aU.x > aU.y && aU.x > aU.z ? S.yz : aU.y > aU.z ? S.xz : S.xy)/cs);
    float alive = u_rm > 0.5 ? 1.0 : step(ca, fract(sin(dot(hc.yz, vec2(12.9898, 78.233)))*43758.5453));
    e += ((1.0 - smoothstep(0.015, 0.07, hc.x))*0.7 + 0.08)*alive*(1.0 - ca); act = max(act, 1.0 - ca);
  }
  float rim = pow(1.0 - abs(dot(N, rd)), 3.0)*act*(0.05 + 0.14*u_k);
  o = vec4(u_col*(e + rim)*(u_side > 0.0 ? 1.0 : 0.45)*smoothstep(0.0, 0.25, sqrt(D/A)), 0.0);   // (to zero at the silhouette)
  gl_FragDepth = logDepth(t);
}`;
// the shell proxy: an icosahedron split twice (320 faces) on the unit sphere, wound counter-clockwise from outside; VS_SHIELD
// inflates it 7% so its flat faces clear the true ellipsoid
function shieldProxy(){
  if (FLY.shell) return FLY.shell;
  const g = (1 + Math.sqrt(5))/2; let P = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]].map(V.norm);
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let it = 0; it < 2; it++) { const mid = {}, M = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (mid[k] == null) { mid[k] = P.length; P.push(V.norm(V.add(P[a], P[b]))); } return mid[k]; };
    F = F.flatMap(([a, b, c]) => { const ab = M(a, b), bc = M(b, c), ca = M(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; }); }
  F = F.map(([a, b, c]) => V.dot(V.cross(V.sub(P[b], P[a]), V.sub(P[c], P[a])), P[a]) < 0 ? [a, c, b] : [a, b, c]);   // outward CCW
  const vaoS = gl.createVertexArray(); gl.bindVertexArray(vaoS);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P.flat()), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(F.flat()), gl.STATIC_DRAW);
  gl.bindVertexArray(vao);
  return FLY.shell = {vao: vaoS, n: F.length*3};
}
// Fighter trails (combat.js cmbTrailRows): ribbon segments facing the camera. Like VS_BEAM, but a segment stops at its
// ends (the beam's end extension double-brightens every joint of a chain), with a width and brightness at each end and
// the same >= 1.3 px floor (flux kept when widened). Rows: a km + width, b km + width, colour + alpha at a, alpha at b.
const VS_TRAIL = `#version 300 es
precision highp float;
layout(location=0) in vec4 i0; layout(location=1) in vec4 i1; layout(location=2) in vec4 i2; layout(location=3) in vec4 i3;
uniform mat4 u_vp; uniform float u_pxK;
out float vV; out vec3 vCol; out float vDist;
void main(){
  int k = gl_VertexID; float s = float(k >> 1), side = float(k & 1)*2.0 - 1.0;
  vec3 p = mix(i0.xyz, i1.xyz, s), d = i1.xyz - i0.xyz, perp = cross(d, p); float pl = length(perp); perp = pl > 1e-12 ? perp/pl : vec3(0.0, 1.0, 0.0);
  float w = mix(i0.w, i1.w, s), wd = max(w, 1.3*max(length(p), 1e-6)/u_pxK);
  p += perp*side*wd*2.0;
  vV = side*2.0; vCol = i2.rgb*mix(i2.w, i3.x, s)*(w/wd); vDist = length(p);
  gl_Position = u_vp*vec4(p, 1.0);
}`;
const FS_TRAIL = `#version 300 es
precision highp float;
in float vV; in vec3 vCol; in float vDist;
${LOGZ_GLSL}
out vec4 o;
void main(){ gl_FragDepth = logDepth(vDist); o = vec4(vCol*exp(-vV*vV*1.6)*(1.0 - smoothstep(1.3, 2.0, abs(vV))), 0.0); }`;
// Live reflections: a 64^2 RGBA16F cube of MILLER and MILLER I over a black sky, one face a frame while the ship pass runs
// (systemPass into private 64^2 targets, blitted into the face), mipmapped for rough surfaces; FS_HULL samples it for the
// planet and keeps the tuned analytic lobe (envSky) for the disc -- a 64^2 capture of the lensed disc blurs its photon ring
// ~9x and is not calibrated to the key light. Anything the GPU refuses leaves the analytic environment (never the fallback
// page). Skipped on phones; ?shipdbg=256 turns it off for A/B.
const ENV = {S: 64, tex: null, fb: [], T: null, face: 0, ok: false, failed: false, t: -1, eye: null};
function envInit(){
  if (ENV.ok || ENV.failed) return ENV.ok;
  try {
    const S = ENV.S, t = {w: S, h: S};
    t.comp = tex(S, S, gl.RGBA16F, gl.LINEAR); t.compFb = fbo([t.comp]);                      // the sky: black (no bhShade)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.compFb); gl.clearBufferfv(gl.COLOR, 0, new Float32Array(4));
    t.comp2 = tex(S, S, gl.RGBA16F, gl.LINEAR); t.comp2Fb = fbo([t.comp2]);
    t.gb = tex(S, S, gl.RGBA32F, gl.NEAREST); t.sysFb = fbo([t.comp2, t.gb]);
    t.comp3 = tex(S, S, gl.RGBA16F, gl.LINEAR); t.comp3Fb = fbo([t.comp3]);
    ENV.T = t; ENV.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, ENV.tex);
    gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 7, gl.RGBA16F, S, S);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (let f = 0; f < 6; f++) { const b = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, b);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, ENV.tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('env face'); ENV.fb.push(b); }
    ENV.ok = true;
  } catch (e) { ENV.failed = true; ENV.ok = false; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return ENV.ok;
}
function envCapture(tSec, all){
  const S = ENV.S, T = ENV.T;
  for (let k = 0; k < (all ? 6 : 1); k++) {
    const f = ENV.face, F = CUBE_DIRS[f], r = V.norm(V.cross(F, CUBE_UPS[f])); ENV.face = (f + 1) % 6;
    gl.bindVertexArray(vao);
    const out = systemPass(T, {eye: ORB.view.eye, b: {r, u: V.cross(r, F), f: F}, fov: Math.PI/2}, ORB.bodies, tSec, 1, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, out === T.comp3 ? T.comp3Fb : T.comp2Fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, ENV.fb[f]);
    gl.blitFramebuffer(0, 0, S, S, 0, 0, S, S, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, ENV.tex); gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
// The resolved ship layer over the planet image, at the rect: premultiplied (hulls alpha 1, glows 0, smoke between).
const FS_SHIP_COMP = `#version 300 es
precision highp float;
uniform sampler2D u_src; uniform ivec2 u_off;
out vec4 o;
void main(){ o = texelFetch(u_src, ivec2(gl_FragCoord.xy) - u_off, 0); }`;
// every program of the ship pass: [name, vertex, fragment] (tests.html compiles the same list in a throwaway context)
// dbg: SCENE.shipDbg bits -- 1 no environment, 2 no surface detail, 4 no point lights, 8 no shadows, 16 no AO (ablation);
// 32 / 64 show the AO / the shadow alone
function shipProgramList(dbg = 0){
  const defs = (dbg & 1 ? '#define NO_ENV\n' : '') + (dbg & 2 ? '#define NO_DETAIL\n' : '') + (dbg & 4 ? '#define NO_PLIGHTS\n' : '') + (dbg & 8 ? '#define NO_SHADOW\n' : '') + (dbg & 16 ? '#define NO_AO\n' : '')
    + (dbg & 32 ? '#define DBG_AO\n#define DBG_AO_SH aoK\n' : dbg & 64 ? '#define DBG_SHADOW\n#define DBG_AO_SH shK\n' : '');
  const hull = b => '#version 300 es\n#define BUCKET ' + b + '\n' + defs + FS_HULL;
  return [['hull0', VS_SHIP, hull(0)], ['hull1', VS_SHIP, hull(1)], ['hull2', VS_SHIP, hull(2)],
    ['shDepth', VS_SHDEPTH, FS_SHDEPTH], ['aoCount', VS_FULL, FS_AOCOUNT], ['plume', VS_PLUME, FS_PLUME], ['shield', VS_SHIELD, FS_SHIELD], ['trail', VS_TRAIL, FS_TRAIL],
    ['spr', VS_SPR, FS_SPR], ['beam', VS_BEAM, FS_BEAM], ['shipComp', VS_FULL, FS_SHIP_COMP]];
}
function shipPrograms(dbg){ for (const [name, vs, fs] of shipProgramList(dbg)) program(name, vs, fs); }
function flyPerspective(fovy, asp, n, f){
  const t = 1/Math.tan(fovy/2), nf = 1/(n - f);
  return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]);
}
function flyMul(a, b){
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  return o;
}

// The shadow atlas: a depth texture of 2x2 tiles (1024^2 each; 512^2 on phones), compared in hardware (sampler2DShadow,
// bilinear). Each frame the few hulls largest on screen get a tile, sized to their pixels, rendered from the disc's
// direction around their bounding sphere and a good way toward the light (so a fighter can shadow a cruiser).
const SH = {fb: null, tex: null, size: 0, ok: false, M: new Float32Array(48), K: new Float32Array(16), n: 0, R: []};
function ensureShadowAtlas(){
  if (SH.fb) return SH.ok;
  const S = (typeof SMALL !== 'undefined' && SMALL) ? 1024 : 2048;
  SH.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, SH.tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT16, S, S);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  SH.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, SH.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, SH.tex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  SH.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; SH.size = S;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return SH.ok;                 // incomplete: no self-shadowing, nothing else changes
}
// Assign the tiles (before the rows are uploaded: each instance learns its tile). cand: [{cls, row, c (camera-relative
// km), rad (km), px (screen radius)}]; L: unit, toward the disc. Fills SH.M/K (sampling) and SH.R (render rows).
function shadowAssign(cand, L, off){
  SH.n = 0; SH.R = [];
  if (off || !cand.length || !ensureShadowAtlas() || !SH.ok) return;
  cand.sort((a, b) => b.px - a.px);
  const S = SH.size, T0 = S/2, lx = V.norm(Math.abs(L[1]) < 0.9 ? V.cross(L, [0, 1, 0]) : V.cross(L, [1, 0, 0])), ly = V.cross(L, lx), EK = 4;
  for (const cd of cand) {
    if (SH.n >= 4 || cd.px < 22) break;
    if (SHIPGL[cd.cls].inst[cd.row*SHIP_ROW + 25] > 0) continue;                 // mid-jump (streaked): no tile
    const t = SH.n++, s = Math.min(T0, cd.px < 70 ? 256 : cd.px < 200 ? 512 : 1024), ox = (t & 1)*T0, oy = (t >> 1)*T0, r = cd.rad, c = cd.c;
    const dz = 2/((EK + 1)*r), r0 = [lx[0]/r, lx[1]/r, lx[2]/r, -V.dot(c, lx)/r], r1 = [ly[0]/r, ly[1]/r, ly[2]/r, -V.dot(c, ly)/r];
    const r2 = [-L[0]*dz, -L[1]*dz, -L[2]*dz, (EK*r + V.dot(c, L))*dz - 1];
    SH.R.push({ox, oy, s, r0, r1, r2});
    // sampling: NDC -> this tile's rect of the atlas, and depth to [0, 1]
    const su = s/S*0.5, bu = ox/S + su, bv = oy/S + su, M = SH.M, o = t*12;
    for (let i = 0; i < 4; i++) { M[o + i] = r0[i]*su + (i === 3 ? bu : 0); M[o + 4 + i] = r1[i]*su + (i === 3 ? bv : 0); M[o + 8 + i] = r2[i]*0.5 + (i === 3 ? 0.5 : 0); }
    SH.K[t*4] = 1.5*2*r/s; SH.K[t*4 + 1] = 1/S; SH.K[t*4 + 2] = 0.0004; SH.K[t*4 + 3] = 0;
    SHIPGL[cd.cls].inst[cd.row*SHIP_ROW + 24] = t;                                            // the instance samples this tile
  }
}
// Render the assigned tiles: every hull and part casts into every tile (a few thousand triangles each)
function shadowRender(cnt){
  if (!SH.n) return;
  const Q = P.shDepth; gl.useProgram(Q.p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, SH.fb); gl.enable(gl.SCISSOR_TEST); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
  gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3.0);
  for (const T of SH.R) {
    gl.viewport(T.ox, T.oy, T.s, T.s); gl.scissor(T.ox, T.oy, T.s, T.s); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniform4fv(Q.u.u_r0, T.r0); gl.uniform4fv(Q.u.u_r1, T.r1); gl.uniform4fv(Q.u.u_r2, T.r2);
    for (const cls in cnt) { const G = SHIPGL[cls]; if (G.wreck) continue; gl.bindVertexArray(G.vao); gl.drawElementsInstanced(gl.TRIANGLES, G.n, G.type, 0, cnt[cls]); }
  }
  gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.SCISSOR_TEST);
}

// Ambient occlusion volumes, one R8 3D texture per class, baked once (boot, shipPrebuildStep): the mesh at rest is drawn
// from 64 directions into the shadow atlas (8 x 8 tiles), then each z-slice of the volume counts, per voxel centre, the
// directions that see it. Voxels ~1/112 of the ship's longest side (half on phones). A class without one gets AO_WHITE.
// the lettering atlas (DECAL_TEXT rects in a 512 x 128 canvas), mipmapped and anisotropic: read at a glancing angle
let DECAL_TEX = null;
function decalTexture(){
  if (DECAL_TEX) return DECAL_TEX;
  DECAL_TEX = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, DECAL_TEX);
  let img = null;
  try {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const k in DECAL_TEXT) { const [t, r] = DECAL_TEXT[k], w = (r[2] - r[0])*512, h = (r[3] - r[1])*128, cx = (r[0] + r[2])/2*512, cy = (r[1] + r[3])/2*128;
      let fs = h*0.78; x.font = '900 ' + fs + 'px "Arial Black", "Segoe UI Black", Impact, sans-serif';
      const tw = x.measureText(t).width; if (tw > w*0.9) { fs *= w*0.9/tw; x.font = '900 ' + fs + 'px "Arial Black", "Segoe UI Black", Impact, sans-serif'; }
      x.fillText(t, cx, cy + fs*0.04); }
    img = c;
  } catch (e) {}
  if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const an = gl.getExtension('EXT_texture_filter_anisotropic');
  if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return DECAL_TEX;
}
let AO_WHITE = null;
function aoWhite(){
  if (AO_WHITE) return AO_WHITE;
  AO_WHITE = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, AO_WHITE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 1, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([128]));
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return AO_WHITE;
}
function shipAOBake(G){
  G.ao = {tex: aoWhite(), min: [0, 0, 0], inv: [1, 1, 1], off: 0};
  if (!P.aoCount || !P.aoCount.u || !ensureShadowAtlas() || !SH.ok) return false;
  const K = SHIP_KIT[G.name] || {}, withP = (K.parts || []).map(c => SHIPGL[c]).filter(Boolean), all = [G, ...withP];   // a ship bakes with its parts at rest
  const bmin = [0, 1, 2].map(i => Math.min(...all.map(g => g.min[i]))), bmax = [0, 1, 2].map(i => Math.max(...all.map(g => g.max[i])));
  const small = typeof SMALL !== 'undefined' && SMALL, pad = 0.04, ext = [0, 1, 2].map(i => bmax[i] - bmin[i]);
  const L = Math.max(...ext), vox = L/(small ? 56 : 112), mn = [0, 1, 2].map(i => bmin[i] - ext[i]*pad - 2*vox);
  const dims = [0, 1, 2].map(i => Math.max(8, Math.min(128, Math.ceil((ext[i]*(1 + 2*pad) + 4*vox)/vox))));
  const c = [0, 1, 2].map(i => mn[i] + dims[i]*vox/2), rho = Math.hypot(dims[0]*vox, dims[1]*vox, dims[2]*vox)/2;
  const S = SH.size, ts = S/8, ND = 64, dm = new Float32Array(ND*12);
  // an identity instance: the mesh in its own metres
  for (const g of all) { const d = g.inst; d.fill(0, 0, SHIP_ROW); d[3] = 1; d[4] = 1; d[9] = 1; d[14] = 1; d[19] = 1; d[24] = -1;
    gl.bindBuffer(gl.ARRAY_BUFFER, g.instBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, SHIP_ROW); }
  const Q = P.shDepth; gl.useProgram(Q.p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, SH.fb); gl.enable(gl.SCISSOR_TEST); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
  gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.0, 2.0);
  for (let i = 0; i < ND; i++) {
    const z = 1 - 2*(i + 0.5)/ND, rr = Math.sqrt(1 - z*z), ph = i*2.39996323, dir = [rr*Math.cos(ph), z, rr*Math.sin(ph)];   // Fibonacci sphere
    const lx = V.norm(Math.abs(dir[1]) < 0.9 ? V.cross(dir, [0, 1, 0]) : V.cross(dir, [1, 0, 0])), ly = V.cross(dir, lx);
    const r0 = [lx[0]/rho, lx[1]/rho, lx[2]/rho, -V.dot(c, lx)/rho], r1 = [ly[0]/rho, ly[1]/rho, ly[2]/rho, -V.dot(c, ly)/rho];
    const r2 = [-dir[0]/rho, -dir[1]/rho, -dir[2]/rho, V.dot(c, dir)/rho];
    const ox = (i & 7)*ts, oy = (i >> 3)*ts;
    gl.viewport(ox, oy, ts, ts); gl.scissor(ox, oy, ts, ts); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniform4fv(Q.u.u_r0, r0); gl.uniform4fv(Q.u.u_r1, r1); gl.uniform4fv(Q.u.u_r2, r2);
    for (const g of all) { gl.bindVertexArray(g.vao); gl.drawElementsInstanced(gl.TRIANGLES, g.n, g.type, 0, 1); }
    const su = ts/S*0.5, bu = ox/S + su, bv = oy/S + su, o = i*12;
    for (let k = 0; k < 4; k++) { dm[o + k] = r0[k]*su + (k === 3 ? bu : 0); dm[o + 4 + k] = r1[k]*su + (k === 3 ? bv : 0); dm[o + 8 + k] = r2[k]*0.5 + (k === 3 ? 0.5 : 0); }
  }
  gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.DEPTH_TEST);
  // count, slice by slice, into the volume
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, dims[0], dims[1], dims[2]);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, 0); gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  let ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  if (ok) {
    const A = P.aoCount; gl.useProgram(A.p);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, SH.tex); gl.uniform1i(A.u.u_sh, 3); gl.activeTexture(gl.TEXTURE0);
    gl.uniform4fv(A.u.u_dm, dm); gl.uniform3fv(A.u.u_bmin, mn); gl.uniform3f(A.u.u_vox, vox, vox, vox); gl.uniform1i(A.u.u_nd, ND);
    gl.viewport(0, 0, dims[0], dims[1]); gl.scissor(0, 0, dims[0], dims[1]); gl.bindVertexArray(vao);
    for (let z = 0; z < dims[2]; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, z);
      gl.uniform1f(A.u.u_z, z); fullscreen();
    }
  }
  gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.bindVertexArray(vao);
  if (!ok) { gl.deleteTexture(tex); return false; }
  G.ao = {tex, min: mn, inv: [1/(dims[0]*vox), 1/(dims[1]*vox), 1/(dims[2]*vox)], off: 1.2*vox, dims, vox};
  return true;
}

let BT = null;               // MSAA colour + depth sized to the ships' screen rect (grow-only), and its resolve target
function ensureShipTargets(rw, rh){
  const w = Math.min(T.w, Math.ceil(rw/64)*64), h = Math.min(T.h, Math.ceil(rh/64)*64);
  if (BT && BT.w >= w && BT.h >= h) return;
  const W = Math.max(w, BT ? BT.w : 0), H = Math.max(h, BT ? BT.h : 0);
  if (BT) { gl.deleteFramebuffer(BT.msFb); gl.deleteRenderbuffer(BT.col); gl.deleteRenderbuffer(BT.dep); gl.deleteFramebuffer(BT.resFb); gl.deleteTexture(BT.tex); }
  const fs = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
  const S = Math.min(4, fs && fs.length ? fs[0] : 0), b = {w: W, h: H};
  b.col = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, b.col); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, S, gl.RGBA16F, W, H);
  b.dep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, b.dep); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, S, gl.DEPTH_COMPONENT24, W, H);
  b.msFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, b.msFb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, b.col);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, b.dep);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  b.tex = tex(W, H, gl.RGBA16F, gl.NEAREST); b.resFb = fbo([b.tex]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  BT = ok ? b : null;
  if (!ok) {                 // no multisampled float targets: no ships, everything else unaffected (the helm flies cockpit-only)
    gl.deleteFramebuffer(b.msFb); gl.deleteRenderbuffer(b.col); gl.deleteRenderbuffer(b.dep); gl.deleteFramebuffer(b.resFb); gl.deleteTexture(b.tex);
    FLY.off = true; FLY.ships = []; FLY.contact = null;
  }
}
// A formation: a lead and its wingmen overtaking on one side, flying on toward the hole. Offsets and velocities are
// set in the ship's local frame at spawn (toward-the-hole horizontal, local up, and their cross). The lead starts just
// behind the camera plane, abeam at a distance that keeps it off the lens (a cruiser is 800 m long), and slides into
// frame from the side within a few seconds; the fighters fly on the near side of it.
function flySpawn(){
  const h = ORB.hud, up = h.up, fwd = V.norm(V.sub(h.dirHole, V.mul(up, V.dot(h.dirHole, up)))), right = V.cross(fwd, up);
  const side = FLY.n++ % 2 ? 1 : -1, kind = FLY.n % 3 === 0 ? "cruiser" : "frigate", big = kind === 'cruiser';
  const lead = {cls: kind, off: big ? [side*1.15, -0.2, -0.1] : [side*0.46, -0.09, -0.22], v: [-side*0.01, -0.002, big ? 0.3 : 0.26]};   // km, km per REAL s in (right, up, fwd)
  const wing = (big ? [[-side*0.42, 0.06, -0.12], [-side*0.55, -0.04, -0.22]]
                    : [[-side*0.13, 0.05, -0.05], [-side*0.19, -0.035, -0.11], [side*0.09, 0.07, -0.14], [-side*0.25, 0.02, -0.19]]);
  const list = [lead].concat(wing.slice(0, kind === 'cruiser' ? 2 : 4).map(o => ({cls: 'hawk', off: V.add(lead.off, o), v: lead.v})));
  const P = ORB.bodies[1].pos, base = V.sub(ORB.view.eye, P), TC = ORB.TC;
  const vShip = HELM.mode === 'station' ? V.mul(h.pro, Math.sqrt(ORB.planet.GM/V.len(base))) : HELM.v;
  const W = l => V.add(V.add(V.mul(right, l[0]), V.mul(up, l[1])), V.mul(fwd, l[2]));
  FLY.ships = list.map(s => ({cls: s.cls, p: V.add(base, V.mul(W(s.off), 1000)), v: V.add(vShip, V.mul(W(s.v), 1000/TC)),
    dir: V.norm(W(s.v)), up, t0: FLY.t}));
  return {side, kind};
}
// world position (m) of ship s now: MILLER's position + its own orbit round MILLER
function flyPos(s){ return V.add(ORB.bodies[1].pos, s.p); }
function flyStep(dt){
  if (FLY.off) return null;
  FLY.t += dt;
  // The station frame's turn since the last step, tracked in every mode (a turn saved up over a helm session must never
  // land at once): Q v = sum new_i (old_i . v). At STATION the formation turns with it; FLY.w = its rate (rad per sim s).
  const B0 = FLY.basis, B1 = ORB.stBasis, station = HELM.mode === 'station', TC = ORB.TC;
  FLY.basis = B1; FLY.w = [0, 0, 0]; FLY.h = dt*TC;
  if (station && B0 && B1 && B0 !== B1 && dt > 0) {
    const Q = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 3; i++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) Q[r*3 + c] += B1[i][r]*B0[i][c];
    const k = 0.5/(dt*TC), w = FLY.w = [(Q[7] - Q[5])*k, (Q[2] - Q[6])*k, (Q[3] - Q[1])*k];   // Q's small-angle rotation vector
    for (const s of FLY.ships) {
      s.p = M3.vec(Q, s.p); s.v = M3.vec(Q, s.v); s.dir = M3.vec(Q, s.dir); s.up = M3.vec(Q, s.up);
      // back at STATION from an inertial mode (the autopilot, the emergency jump): the frame's own velocity comes out of
      // theirs, so they keep moving as they were
      if (!FLY.wasStation) s.v = V.sub(s.v, V.cross(w, s.p));
    }
  }
  FLY.wasStation = station;
  // motion first, then decisions (as combat.js): a formation spawned and then integrated in the same step was born a
  // frame of orbital motion (1.5-4 km) ahead of where it was placed
  const GM = ORB.planet.GM, acc = p => V.mul(p, -GM/Math.pow(V.dot(p, p), 1.5));
  for (const s of FLY.ships) {                 // velocity Verlet round MILLER, real dt x the time warp
    let rem = dt*TC;
    while (rem > 1e-9) { const h = Math.min(rem, 1); rem -= h;
      const vh = V.add(s.v, V.mul(acc(s.p), h/2)); s.p = V.add(s.p, V.mul(vh, h)); s.v = V.add(vh, V.mul(acc(s.p), h/2)); }
  }
  let ev = null;
  if (FLY.ships.length) flyJump(station);
  if (!FLY.ships.length && FLY.t > FLY.next && HELM.mode !== 'auto' && !(typeof COMBAT !== 'undefined' && COMBAT.hot)) ev = flySpawn();   // no flybys through a fight
  const lead = FLY.ships.find(s => !s.gone);
  if (lead) { const rel = V.sub(flyPos(lead), ORB.view.eye), d = V.len(rel);
    FLY.contact = {dir: V.mul(rel, 1/d), range: d, name: SHIP_KIT[lead.cls].name, n: FLY.ships.filter(s => !s.gone).length}; }
  else FLY.contact = null;
  return ev;
}
// The formation's exit. At STATION once the lead is 6 km out (or after 30 s); at the helm after 34 s, and only if one of
// them is on screen (supercruise rarely leaves them ahead; out of sight they just go). Wingmen first, then the lead, 0.22 s
// apart: each hull stretches forward from its tail for 0.45 s (flyList: i6.y/z, the hull flashes), then is gone in the
// fight's warp FX, a small flash and a streak ahead (it keeps the pass alive while it fades). Departed ships are marked,
// not removed, until the last one goes. Reduced motion: no stretch or flash, a soft glow where each one was.
const FLY_JUMP = {far: 6000, tStation: 30, tHelm: 34, gap: 0.22, stretch: 0.45};
function flyJump(station){
  const S = FLY.ships, lead = S[0];
  if (FLY.jumpAt == null) {
    const t = FLY.t - lead.t0;
    if (station ? V.len(V.sub(flyPos(lead), ORB.view.eye)) > FLY_JUMP.far || t > FLY_JUMP.tStation : t > FLY_JUMP.tHelm) {
      if (!station && !S.some(s => flyOnScreen(flyPos(s), 0))) { flyEnd(); return; }
      FLY.jumpAt = FLY.t;
      S.forEach((s, i) => { s.jump = FLY.t + (i ? i - 1 : S.length - 1)*FLY_JUMP.gap; });
      FLY.events.push({type: 'jump', kind: lead.cls, name: SHIP_KIT[lead.cls].name, n: S.length});
    }
    return;
  }
  const rm = typeof COMBAT !== 'undefined' && COMBAT.rm;
  for (const s of S) {
    if (s.gone || FLY.t < s.jump || (!rm && FLY.t < s.jump + FLY_JUMP.stretch)) continue;
    s.gone = true;
    // (the FX coast inertially, and the fight's step -- after this one -- flies them a frame on: born a frame back)
    const size = SHIP_KIT[s.cls].fighter ? 14 : s.cls === 'cruiser' ? 110 : 60, v = V.add(s.v, V.cross(FLY.w, s.p)), p = V.sub(s.p, V.mul(v, FLY.h || 0));
    if (rm) cmbFx(8, p, v, 0.9, size*0.8, 0, [0.5, 0.7, 1.1]);
    else cmbWarpFx(p, v, size, V.mul(s.dir, -1), true);
  }
  if (S.every(s => s.gone)) flyEnd();
}
function flyEnd(){ FLY.ships = []; FLY.jumpAt = null; FLY.next = FLY.t + 50 + Math.random()*30; FLY.contact = null; }
// a point (world m) within the view (grown by margin m)?
function flyOnScreen(pos, margin){
  const b = ORB.view.b, th = Math.tan(ORB.view.fov/2), asp = ORB.W/ORB.H, r = V.sub(pos, ORB.view.eye), z = V.dot(r, b.f);
  return z > 0 && Math.abs(V.dot(r, b.r)) < z*th*asp + margin && Math.abs(V.dot(r, b.u)) < z*th + margin;
}
// The MEINEN's attitude thrusters: when the pilot starts a turn, the nozzles whose thrust gives that angular acceleration
// puff (a flash at the nozzle and a small cloud of cold gas leaving it). Puffs keep a world-axis offset from the ship
// (they must co-move with it: the ship moves 7.9 km/s round MILLER) and their own drift. Rendering time drives them.
function rcsPuffs(s, rel, r, u, f, at, t, sprites){
  const R = FLY.rcs, K = SHIP_KIT.meinen, H = HELM, dt = clamp(t - R.t, 0, 0.1); R.t = t;
  const w = [-H.w[0], H.w[1], H.w[2]];                                   // body rates as a ship-axis vector (pitch is about -x)
  if (R.w && dt > 0 && !(typeof COMBAT !== 'undefined' && COMBAT.rm)) {
    const al = V.mul(V.sub(w, R.w), 1/dt), la = V.len(al);
    if (la > 0.15) for (const N of K.rcs) {
      const tq = V.cross(N.p, V.mul(N.d, -1)), k = V.dot(V.norm(tq), al)/la;                  // this nozzle's share of the torque
      if (k > 0.35 && Math.random() < dt*40*k*Math.min(1, la/1.2) && R.puffs.length < 40) {
        const o = V.add(V.add(V.mul(r, N.p[0]), V.mul(u, N.p[1])), V.mul(f, N.p[2])), dw = V.add(V.add(V.mul(r, N.d[0]), V.mul(u, N.d[1])), V.mul(f, N.d[2]));
        R.puffs.push({o, v: V.mul(dw, 18 + Math.random()*10), t0: t, life: 0.45 + Math.random()*0.3});
      }
    }
  }
  R.w = w;
  R.puffs = R.puffs.filter(q => t - q.t0 < q.life);
  for (const q of R.puffs) {
    const a = (t - q.t0)/q.life, p = V.add(rel, V.mul(V.add(q.o, V.mul(q.v, t - q.t0)), 1e-3));
    if (a < 0.12) sprites.push([p, 0.0007, [2.6, 2.7, 3.0].map(c => c*(1 - a/0.12)), 1, null, null]);
    sprites.push([p, (0.35 + 2.4*Math.sqrt(a))*1e-3, [2.2, 2.25, 2.4], 3, null, null, a]);
  }
}
// every ship the pass may draw this frame: {cls, pos (world m), f, u, glow, team?, player?, heat?, boost?, damage?}
function flyList(){
  const out = [], rm = typeof COMBAT !== 'undefined' && COMBAT.rm;
  for (const s of FLY.ships) {
    if (s.gone) continue;
    const a = s.jump == null || rm ? 0 : clamp((FLY.t - s.jump)/FLY_JUMP.stretch, 0, 1);   // jumping out: stretched from the tail
    out.push({cls: s.cls, pos: flyPos(s), f: s.dir, u: s.up, glow: 0.15, depart: a > 0 ? a*a*a*(SHIP_KIT[s.cls].fighter ? 18 : 40) : 0});
  }
  const hg = FLY.hangar;                              // look development (SCENE.hangar): one ship posed before the camera
  if (hg) { const b = ORB.view.b, f0 = V.mul(b.f, -1), ya = V.rot(f0, b.u, hg.yaw), f = V.rot(ya, b.r, hg.pitch), u = V.rot(b.u, b.r, hg.pitch);
    out.push({cls: hg.cls, pos: V.add(ORB.view.eye, V.add(V.mul(b.f, hg.dist), V.add(V.mul(b.r, hg.dx || 0), V.mul(b.u, hg.dy || 0)))), f, u: QV.ortho(f, u)[1],
      glow: hg.glow || 0, team: hg.team || 0, damage: hg.damage || 0}); }
  const me = typeof helmShip === 'function' ? helmShip() : null;
  const hurt = typeof COMBAT !== 'undefined' && COMBAT.hot && COMBAT.pl ? clamp(1 - COMBAT.pl.hull/CMB.HULL, 0, 1)*0.9 : 0;   // the MEINEN's hull burns as it fails
  if (me) out.push({cls: 'meinen', pos: me.pos, f: me.f, u: me.u, glow: me.glow, player: true, heat: me.heat, boost: me.boost, damage: hurt, hull: me.hull});
  return out;
}
function flyVisible(){
  if (FLY.off) return false;
  if (FLY.hangar) return true;
  if (typeof cmbActive === 'function' && cmbActive()) return true;        // a fight: the pass trims itself to what it covers
  const list = flyList(); if (!list.length) return false;
  return list.some(s => flyOnScreen(s.pos, SHIP_KIT[s.cls].fighter ? 60 : 400*(1 + (s.depart || 0))));
}
// combat FX: sprites and beams (demo/js/battle.js fxRender's buffers), filled in place by combat.js cmbFxRows
const FXG = {sv: null, sb: null, bv: null, bb: null, tv: null, tb: null, spr: new Float32Array(16*4096), beam: new Float32Array(12*4096), trail: new Float32Array(16*2048),
  lp: new Float32Array(24), lc: new Float32Array(18), clr0: new Float32Array([0, 0, 0, 0]), clr1: new Float32Array([1]),
  shHit: new Float32Array(16), shFl: new Float32Array(4), shMi: new Float32Array(9)};
function fxInitGL(){
  if (FXG.sv) return;
  FXG.sv = gl.createVertexArray(); gl.bindVertexArray(FXG.sv);
  FXG.sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, FXG.sb); gl.bufferData(gl.ARRAY_BUFFER, FXG.spr.byteLength, gl.DYNAMIC_DRAW);
  for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 4, gl.FLOAT, false, 64, k*16); gl.vertexAttribDivisor(k, 1); }
  FXG.bv = gl.createVertexArray(); gl.bindVertexArray(FXG.bv);
  FXG.bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, FXG.bb); gl.bufferData(gl.ARRAY_BUFFER, FXG.beam.byteLength, gl.DYNAMIC_DRAW);
  for (let k = 0; k < 3; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 4, gl.FLOAT, false, 48, k*16); gl.vertexAttribDivisor(k, 1); }
  FXG.tv = gl.createVertexArray(); gl.bindVertexArray(FXG.tv);
  FXG.tb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, FXG.tb); gl.bufferData(gl.ARRAY_BUFFER, FXG.trail.byteLength, gl.DYNAMIC_DRAW);
  for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 4, gl.FLOAT, false, 64, k*16); gl.vertexAttribDivisor(k, 1); }
  gl.bindVertexArray(vao);
}
// Draws the ships and the fight over the planet image, inside the screen rect they cover. Nothing this pass draws is ever
// behind a planet pixel (a fight stays within ~30 km of you, the surface is 50 km away at the floor and the horizon 800),
// so the MSAA target is CLEARED rather than primed with the image and the planet's depth: hulls, glows, smoke and tracers
// go onto transparent black, and the resolved rect is composited over the image with premultiplied alpha (hulls alpha 1,
// glows 0, smoke in between). The pass costs what the ships and the fight cover, not the whole screen.
function flyRender(img, timeSec){
  if (FLY.off) return img;
  // the live reflections: one face of the environment cube a frame, all six when the pass starts again or the camera jumps
  const envOn = !(typeof SMALL !== 'undefined' && SMALL) && !(FLY.dbg & 257) && envInit();
  if (envOn) { const fresh = !(timeSec - ENV.t < 0.25) || !ENV.eye || V.len(V.sub(ORB.view.eye, ENV.eye)) > 5e4; envCapture(timeSec, fresh); ENV.t = timeSec; ENV.eye = ORB.view.eye; }
  const w = T.w, h = T.h, v = ORB.view, b = v.b, eye = v.eye, list = flyList();
  const dstFb = img === T.comp3 ? T.comp3Fb : img === T.comp2 ? T.comp2Fb : null;
  if (!dstFb) return img;
  const fight = typeof cmbActive === 'function' && cmbActive(), eyeRel = V.sub(eye, ORB.bodies[1].pos);   // MILLER-relative: the fight's frame
  // instances + sprites, camera-relative km; the union of what they cover on screen (framebuffer px)
  const cnt = {}, sprites = [], th = Math.tan(v.fov/2), asp = w/h, br = b.r, bu = b.u, bf = b.f;
  let X0 = w, Y0 = h, X1 = 0, Y1 = 0;
  const all = () => { X0 = 0; Y0 = 0; X1 = w; Y1 = h; };
  // a sphere (camera-relative km): conservative rad/(z - rad); straddling the camera plane -> the whole screen. keep: count
  // it even off screen (a beam's ends: the streak between them may still cross the view)
  const sph = (x, y, z, rad, keep) => {
    const zc = x*bf[0] + y*bf[1] + z*bf[2];
    if (zc <= rad*1.05) { if (zc > -rad || keep) all(); return; }
    const sx = (x*br[0] + y*br[1] + z*br[2])/(zc*th*asp), sy = (x*bu[0] + y*bu[1] + z*bu[2])/(zc*th), rx = rad/((zc - rad)*th*asp), ry = rad/((zc - rad)*th);
    const a0 = ((sx - rx)*0.5 + 0.5)*w, a1 = ((sx + rx)*0.5 + 0.5)*w, c0 = ((sy - ry)*0.5 + 0.5)*h, c1 = ((sy + ry)*0.5 + 0.5)*h;
    if (!keep && (a1 < 0 || c1 < 0 || a0 > w || c0 > h)) return;
    if (a0 < X0) X0 = a0; if (a1 > X1) X1 = a1; if (c0 < Y0) Y0 = c0; if (c1 > Y1) Y1 = c1;
  };
  // a hull's rect from the 8 corners of its oriented bounding box (ship metres mn..mx, k km per metre); a bounding sphere
  // badly overstates a ship seen end-on
  const addBox = (c, r, u, f, mn, mx, k) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let q = 0; q < 8; q++) {
      const lx = (q & 1 ? mx[0] : mn[0])*k, ly = (q & 2 ? mx[1] : mn[1])*k, lz = (q & 4 ? mx[2] : mn[2])*k;
      const px = c[0] + r[0]*lx + u[0]*ly + f[0]*lz, py = c[1] + r[1]*lx + u[1]*ly + f[1]*lz, pz = c[2] + r[2]*lx + u[2]*ly + f[2]*lz;
      const z = px*bf[0] + py*bf[1] + pz*bf[2]; if (z <= 1e-3) { all(); return; }
      const x = ((px*br[0] + py*br[1] + pz*br[2])/(z*th*asp)*0.5 + 0.5)*w, y = ((px*bu[0] + py*bu[1] + pz*bu[2])/(z*th)*0.5 + 0.5)*h;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || y1 < 0 || x0 > w || y0 > h) return;
    X0 = Math.min(X0, x0 - 2); Y0 = Math.min(Y0, y0 - 2); X1 = Math.max(X1, x1 + 2); Y1 = Math.max(Y1, y1 + 2); };
  const addRect = (c, rad) => sph(c[0], c[1], c[2], rad, false);
  // one hull instance of class cls (rel: camera-relative km; k km per metre): its row, and its screen rect
  const shc = [], pxK = h/(2*th), pl16 = FLY.plume; let np = 0;
  // an engine plume: nozzle exit rel (km), exhaust axis ax, exit radius r (km), length (km), colours, throttle
  const plume = (rel, ax, r, len, core, outer, thr) => {
    if (np >= 64 || thr < 0.02 || len < r*0.5) return;
    const d = V.len(rel); if ((r*1.7 + len*0.035)/d*pxK < 1.5) return;                // sub-pixel: the glow sprite covers it
    const o = np++*16; pl16.set([rel[0], rel[1], rel[2], r, ax[0], ax[1], ax[2], len, core[0], core[1], core[2], thr, outer[0], outer[1], outer[2], np*0.37], o);
  };
  const engines = (cls, rel, k, r, u, f, thr, team) => {                               // every engine of a hull (k: km per metre)
    const K = SHIP_KIT[cls], pm = K.plume; if (!pm || !K.engines) return;
    const col = team === 0 && pm.coal ? pm.coal : [pm.core, pm.outer], ax = V.mul(f, -1);
    for (const E of K.engines) {
      let lp = E.p, ex = ax; const P = E.part && PQ[E.part];
      if (P) { lp = V.add(P.pivot, qRot(P.q, V.sub(E.p, P.pivot))); const d = qRot(P.q, [0, 0, -1]); ex = V.add(V.add(V.mul(r, d[0]), V.mul(u, d[1])), V.mul(f, d[2])); }
      const q = V.add(rel, V.add(V.add(V.mul(r, lp[0]*k), V.mul(u, lp[1]*k)), V.mul(f, lp[2]*k)));
      plume(q, ex, E.r*k, pm.len*k*(0.25 + 0.75*thr), col[0], col[1], Math.min(1.6, thr));
    }
  };
  const parts = [];                                                          // [part cls, row, ship cls, ship row]
  const hull = (cls, rel, k, r, u, f, damage, team, glow, pose) => {
    const G = shipClassGL(cls), n = cnt[cls] || 0;
    if (n >= SHIP_MAXI) return -1;                                             // the instance buffer holds SHIP_MAXI
    shipRow(G.inst, n, cls, rel, k, r, u, f, damage, team, glow); cnt[cls] = n + 1;
    if (pose) { G.inst.set(pose.q, n*SHIP_ROW + 16); G.inst.set(pose.pivot, n*SHIP_ROW + 20); G.inst[n*SHIP_ROW + 23] = pose.mode || 0; parts.push([cls, n, pose.of, pose.row]);
      const pv = pose.pivot, pc = V.add(rel, V.mul(V.add(V.add(V.mul(r, pv[0]), V.mul(u, pv[1])), V.mul(f, pv[2])), k));
      const ex = V.len(V.sub(G.max, G.min))*0.5 + 0.5; addBox(pose.mode ? pc : rel, r, u, f, pose.mode ? [-ex, -ex, -ex] : V.sub(G.min, [1, 1, 1]), pose.mode ? [ex, ex, ex] : V.add(G.max, [1, 1, 1]), k);
      return n; }
    addBox(rel, r, u, f, G.min, G.max, k);
    if (cls !== 'shard' && !G.wreck) { const rad = G.radius*k, d = V.len(rel); shc.push({cls, row: n, c: rel, rad, px: rad/Math.max(d - rad, rad*0.5)*pxK}); }
    return n;
  };
  // a ship's moving parts: the MEINEN's dish turns, its nozzles gimbal with the stick (and their plumes with them)
  const PQ = {};
  const withParts = (cls, row, rel, k, r, u, f, damage, team, glow, t, stick) => {
    for (const pc of SHIP_KIT[cls].parts || []) {
      const PK = SHIP_KIT[pc]; let q = [0, 0, 0, 1];
      if (pc === 'meinenDish') { const a = t*0.35; q = [0, Math.sin(a/2), 0, Math.cos(a/2)]; }
      else if (stick) { const ax = -stick[0]*0.09, ay = stick[1]*0.09; q = qMul([Math.sin(ax/2), 0, 0, Math.cos(ax/2)], [0, Math.sin(ay/2), 0, Math.cos(ay/2)]); }
      PQ[pc] = {q, pivot: PK.pivot};
      hull(pc, rel, k, r, u, f, damage, team, glow, {q, pivot: PK.pivot, of: cls, row});
    }
  };
  // the fight's hulls: hostiles, wrecks (their own hull, scaled), debris
  let lastHull = null;
  if (fight) for (const s of cmbDrawList()) {
    const f = s.f, r = V.norm(V.cross(s.u, f)), u = V.cross(f, r), rel = V.mul(V.sub(s.p, eyeRel), 1e-3), k = s.scale || 1;
    if (s.pose) { if (lastHull) { const pr = hull(s.cls, rel, 0.001*k, r, u, f, s.damage, s.team, s.glow, Object.assign({of: lastHull[0], row: lastHull[1]}, s.pose));
      if (pr >= 0 && s.stretch > 0) { const G = SHIPGL[s.cls], PG = SHIPGL[lastHull[0]]; G.inst[pr*SHIP_ROW + 25] = s.stretch; G.inst[pr*SHIP_ROW + 26] = PG.max[2]; }
      if (pr >= 0 && (s.heat || s.pulse)) { const G = SHIPGL[s.cls]; G.inst[pr*SHIP_ROW + 28] = s.heat || 0; G.inst[pr*SHIP_ROW + 30] = s.pulse || 0; } } continue; }
    const key = s.clip ? s.cls + '#w' : s.cls, row = hull(key, rel, 0.001*k, r, u, f, s.damage, s.team, s.glow), G = SHIPGL[key];
    lastHull = [key, row];
    // (a fight entry may carry radiator heat and a fire pulse, as the MEINEN's row does below: defense/'s railguns and radiators)
    if (row >= 0 && (s.heat || s.pulse)) { G.inst[row*SHIP_ROW + 28] = s.heat || 0; G.inst[row*SHIP_ROW + 30] = s.pulse || 0; }
    if (row >= 0 && s.clip) { G.inst[row*SHIP_ROW + 26] = s.clip[0]; G.inst[row*SHIP_ROW + 27] = s.clip[1]; }
    if (row >= 0 && s.stretch > 0) { const zN = G.max[2]; G.inst[row*SHIP_ROW + 25] = s.stretch; G.inst[row*SHIP_ROW + 26] = zN;
      addBox(rel, r, u, f, [G.min[0], G.min[1], zN + (G.min[2] - zN)*(1 + s.stretch)], G.max, 0.001*k); }
    if (s.thr) engines(s.cls, rel, 0.001*k, r, u, f, s.thr, s.team);
  }
  const eng = [], I = HELM.input, gk = 1 - Math.exp(-Math.max(0, Math.min(0.1, timeSec - (FLY.gimT || timeSec)))/0.25); FLY.gimT = timeSec;
  FLY.gim = FLY.gim || [0, 0]; FLY.gim[0] += ((HELM.mode === 'helm' ? I.pitch : 0) - FLY.gim[0])*gk; FLY.gim[1] += ((HELM.mode === 'helm' ? I.yaw : 0) - FLY.gim[1])*gk;
  let mePose = null;
  for (const s of list) {
    const f = s.f, r = V.norm(V.cross(s.u, f)), u = V.cross(f, r), rel = V.mul(V.sub(s.pos, eye), 1e-3), K = SHIP_KIT[s.cls];
    if (s.player) mePose = {rel, r, u, f, hull: s.hull};
    const row = hull(s.cls, rel, 0.001, r, u, f, s.damage, s.team || 0, s.glow), dep = row >= 0 && s.depart > 0, zT = dep ? SHIPGL[s.cls].min[2] : 0;
    if (dep) { const G = SHIPGL[s.cls]; G.inst[row*SHIP_ROW + 25] = s.depart; G.inst[row*SHIP_ROW + 26] = zT;   // jumping out: stretched forward
      addBox(rel, r, u, f, G.min, [G.max[0], G.max[1], zT + (G.max[2] - zT)*(1 + s.depart)], 0.001); }        // from its tail
    if (row >= 0 && K.turretCls) for (const T of K.turrets) {                     // a flyby's turrets, trained forward
      const pr = hull(K.turretCls, rel, 0.001, r, u, f, s.damage, s.team || 0, s.glow, {q: [-0.05, 0, 0, 0.9987], pivot: T.pivot, mode: 1, of: s.cls, row});
      if (pr >= 0 && dep) { const TG = SHIPGL[K.turretCls]; TG.inst[pr*SHIP_ROW + 25] = s.depart; TG.inst[pr*SHIP_ROW + 26] = zT; }
    }
    if (row >= 0 && SHIP_KIT[s.cls].parts) withParts(s.cls, row, rel, 0.001, r, u, f, s.damage, s.team || 0, s.glow, timeSec, s.player ? FLY.gim : null);
    if (row >= 0 && s.player) {                                                  // the radiators run hot with the guns; the coils pulse
      const C = typeof COMBAT !== 'undefined' ? COMBAT : null, o = row*SHIP_ROW, G = SHIPGL[s.cls];
      G.inst[o + 28] = C && C.hot && C.pl ? C.pl.heat : 0;
      G.inst[o + 30] = C && C.hot && C.muzzle ? Math.max(0.12, 1 - (C.t - C.muzzle.t)/0.15) : C && C.hot ? 0.12 : 0;
    }
    engines(s.cls, rel, 0.001, r, u, f, s.player ? 0.12 + 0.88*Math.min(s.glow, 1.6) : s.thr == null ? 0.8 : s.thr, s.team || 0);
    const at = p => V.add(rel, V.add(V.add(V.mul(r, p[0]*1e-3), V.mul(u, p[1]*1e-3)), V.mul(f, p[2]*1e-3)));
    if (s.player) {
      const g = s.glow, col = s.boost ? [0.6, 1.0, 2.6] : [0.45, 0.8, 1.9], toCam = V.norm(V.mul(rel, -1));
      for (const E of K.engines) if (eng.length < 2) eng.push([at(V.add(E.p, [0, 0, -2.5])), 0.006, V.mul(col, 0.08 + 0.3*g)]);   // the engines light the stern
      rcsPuffs(s, rel, r, u, f, at, timeSec, sprites);
      const side = V.norm(V.cross(f, toCam));
      for (const E of K.engines) sprites.push([at(E.p), 0.0018 + 0.0012*g, V.mul(col, 0.5 + 1.2*g), 0, null, null]);   // hot throat (the plume is its own pass)
      const blink = (k, ph) => Math.pow(0.5 + 0.5*Math.sin(timeSec*k + ph), 16);
      sprites.push([at(K.nav.port), 0.0016, [2.2, 0.15, 0.1].map(c => c*(0.35 + 1.5*blink(3.1, 0))), 0, null, null]);   // port (+x), red
      sprites.push([at(K.nav.stbd), 0.0016, [0.1, 2.0, 0.4].map(c => c*(0.35 + 1.5*blink(3.1, 0))), 0, null, null]);    // starboard, green
      for (const q of K.strobes) sprites.push([at(q), 0.0014, [2.4, 2.4, 2.4].map(c => c*blink(1.3, 2)), 1, null, null]);  // strobe
      if (s.heat > 0.02) K.plasma.forEach((p, k) => {                                                                     // re-entry plasma
        const fl = 0.8 + 0.2*Math.sin(timeSec*23 + k*1.7);
        sprites.push([at(p), 0.009 + 0.004*k, V.mul([1.8, 0.62, 0.22], s.heat*fl), 2, null, null, 0.1 + 0.15*k]);
      });
    } else if (K.plume) { const d = V.len(rel), pc = (s.team || 0) === 0 && K.plume.coal ? K.plume.coal[0] : K.plume.core;   // a flyby's engines: a
      for (const E of K.engines) sprites.push([at(E.p), E.r*1e-3*(K.fighter ? 2.2 : 1.2) + d*0.0022, V.mul(pc, 0.5), 0, null, null]); }   // glow that holds its size far off
  }
  // shield shells being struck: the player's on its drawn pose, and only in the chase view and cutaways (the hull camera sits
  // on the shell, the cockpit inside it). A shell may be scaled with its hull (sh.scale: defense/'s Sovereign and AEGIS fields).
  const shells = [];
  if (fight) for (const sh of cmbShields()) {
    let rel, r, u, f;
    if (sh.player) { if (!mePose || mePose.hull) continue; ({rel, r, u, f} = mePose); }
    else { f = sh.f; r = V.norm(V.cross(sh.u, f)); u = V.cross(f, r); rel = V.mul(V.sub(sh.p, eyeRel), 1e-3); }
    const S = shipKitBuild(sh.cls).shell; if (!S) continue;
    const sc = sh.scale || 1, c = V.add(rel, V.mul(V.add(V.add(V.mul(r, S.c[0]), V.mul(u, S.c[1])), V.mul(f, S.c[2])), 1e-3*sc));
    shells.push({sh, S, c, r, u, f, sc}); addBox(c, r, u, f, V.mul(S.r, -1.07), V.mul(S.r, 1.07), 0.001*sc);
  }
  for (const [p, size, , , ax, ay] of sprites) addRect(p, ax ? Math.max(V.len(ax), V.len(ay || [0, 0, 0]))*size : size);
  for (let i = 0; i < np; i++) { const o = i*16, L = pl16[o+7], rm = pl16[o+3]*1.7 + L*0.035;   // a plume: its two ends, widened
    sph(pl16[o], pl16[o+1], pl16[o+2], rm*1.2, false); sph(pl16[o] + pl16[o+4]*L, pl16[o+1] + pl16[o+5]*L, pl16[o+2] + pl16[o+6]*L, rm*1.2, false);
    sph(pl16[o] + pl16[o+4]*L*0.5, pl16[o+1] + pl16[o+5]*L*0.5, pl16[o+2] + pl16[o+6]*L*0.5, rm*1.2 + L*0.5, false); }
  // the fight's sprites (a quad reaches ~1.42 x its size) and beams (both ends, kept even off screen)
  let ns = 0, nb = 0, nt = 0;
  if (fight) {
    [ns, nb] = cmbFxRows(FXG.spr, FXG.beam, eyeRel);
    const S = FXG.spr, Bm = FXG.beam;
    for (let i = 0; i < ns; i++) { const o = i*16; sph(S[o], S[o+1], S[o+2], S[o+3]*1.42, false); }
    for (let i = 0; i < nb; i++) { const o = i*12, r = Bm[o+3]*3; sph(Bm[o], Bm[o+1], Bm[o+2], r, true); sph(Bm[o+4], Bm[o+5], Bm[o+6], r, true); }
    nt = cmbTrailRows(FXG.trail, eyeRel); const Tr = FXG.trail;
    for (let i = 0; i < nt; i++) { const o = i*16; sph(Tr[o], Tr[o+1], Tr[o+2], Tr[o+3]*2.2, false); sph(Tr[o+4], Tr[o+5], Tr[o+6], Tr[o+7]*2.2, false); }
  }
  const x0 = Math.max(0, Math.floor(X0) - 4), y0 = Math.max(0, Math.floor(Y0) - 4), x1 = Math.min(w, Math.ceil(X1) + 4), y1 = Math.min(h, Math.ceil(Y1) + 4);
  if (x1 <= x0 || y1 <= y0) return img;
  const rw = x1 - x0, rh = y1 - y0;
  FLY.rect = [x0, y0, rw, rh];
  ensureShipTargets(rw, rh);
  if (!BT) return img;
  const toBH = V.norm(V.mul(eye, -1));
  shadowAssign(shc, toBH, FLY.dbg & 8);
  for (const [pc, pr, sc, sr] of parts) SHIPGL[pc].inst[pr*SHIP_ROW + 24] = SHIPGL[sc].inst[sr*SHIP_ROW + 24];
  for (const cls in cnt) {                                                                  // upload each class's rows once
    const G = SHIPGL[cls]; gl.bindBuffer(gl.ARRAY_BUFFER, G.instBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, G.inst, 0, cnt[cls]*SHIP_ROW);
  }
  shadowRender(cnt);
  gl.bindFramebuffer(gl.FRAMEBUFFER, BT.msFb); gl.viewport(0, 0, rw, rh);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, rw, rh);
  gl.disable(gl.BLEND); gl.depthMask(true);
  gl.clearBufferfv(gl.COLOR, 0, FXG.clr0); gl.clearBufferfv(gl.DEPTH, 0, FXG.clr1);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
  const rot = new Float32Array([b.r[0], b.u[0], -b.f[0], 0, b.r[1], b.u[1], -b.f[1], 0, b.r[2], b.u[2], -b.f[2], 0, 0, 0, 0, 1]);
  // the full-screen projection, re-mapped so the rect's NDC range fills the small target
  const nx0 = x0/w*2 - 1, nx1 = x1/w*2 - 1, ny0 = y0/h*2 - 1, ny1 = y1/h*2 - 1, sx = 2/(nx1 - nx0), sy = 2/(ny1 - ny0);
  const K = new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, -sx*(nx0 + nx1)/2, -sy*(ny0 + ny1)/2, 0, 1]);
  const vp = flyMul(K, flyMul(flyPerspective(v.fov, w/h, LOGZ_NEAR, 1e8), rot));
  // the hull programs (one per material bucket) share the frame's lighting: set it on each, then draw every class's
  // buckets instanced
  const pl = ORB.bodies[1], pC = V.mul(V.sub(pl.pos, eye), 1e-3), pd = V.len(pC);
  let nl = 0;                                                                              // the MEINEN's engines, then the fight
  for (const [p, rad, c] of eng) { FXG.lp.set([p[0], p[1], p[2], rad], nl*4); FXG.lc.set(c, nl*3); nl++; }
  if (fight) nl += cmbLights(eyeRel, FXG.lp.subarray(nl*4), FXG.lc.subarray(nl*3), 6 - nl);
  const HP = [P.hull0, P.hull1, P.hull2];
  for (const Q of HP) {
    gl.useProgram(Q.p);
    gl.uniformMatrix4fv(Q.u.u_vp, false, vp);
    if (Q.u.u_L) { gl.uniform3fv(Q.u.u_L, toBH); gl.uniform3fv(Q.u.u_Lcol, V.mul(LIGHT_COL, 1.25)); }
    if (Q.u.u_amb) { gl.uniform3f(Q.u.u_amb, 0.018, 0.02, 0.028); gl.uniform3fv(Q.u.u_pC, pC); gl.uniform1f(Q.u.u_pR, pl.R*1e-3);
      gl.uniform3f(Q.u.u_pCol, 0.12, 0.2, 0.3); gl.uniform1f(Q.u.u_pSin, Math.min(1, pl.R*1e-3/pd)); gl.uniform3f(Q.u.u_discN, 0, 1, 0); }
    if (Q.u.u_time) gl.uniform1f(Q.u.u_time, timeSec);
    gl.uniform3fv(Q.u.u_liv, SHIP_LIV);
    if (Q.u.u_nl) { gl.uniform1i(Q.u.u_nl, nl); if (nl) { gl.uniform4fv(Q.u.u_lp, FXG.lp); gl.uniform3fv(Q.u.u_lc, FXG.lc); } }
    if (Q.u.u_shadow) { gl.uniform1i(Q.u.u_shadow, 3); gl.uniform4fv(Q.u.u_shM, SH.M); gl.uniform4fv(Q.u.u_shK, SH.K); }
    if (Q.u.u_decal) gl.uniform1i(Q.u.u_decal, 4);
    if (Q.u.u_env) { gl.uniform1i(Q.u.u_env, 6); gl.uniform1f(Q.u.u_envK, envOn ? 1 : 0); }
  }
  ensureShadowAtlas();                                          // (a depth texture must be bound even with no tiles)
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, SH.tex);                       // (unit 3: shadows only)
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, decalTexture());                                // (unit 4: lettering)
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_CUBE_MAP, envOn ? ENV.tex : null); gl.activeTexture(gl.TEXTURE0);   // (unit 6: live env)
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);                                            // (shipkit.js winds faces CCW)
  for (let bk = 0; bk < 3; bk++) {
    const Q = HP[bk]; gl.useProgram(Q.p);
    if (Q.u.u_ao) gl.uniform1i(Q.u.u_ao, 5);
    for (const cls in cnt) {
      const G = SHIPGL[cls], [start, count] = G.buckets[bk]; if (!count) continue;
      if (G.wreck) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
      if (Q.u.u_ao) { const of = SHIP_KIT[G.base || cls].of, A = (of && SHIPGL[of] ? SHIPGL[of].ao : G.ao) || {tex: aoWhite(), min: [0, 0, 0], inv: [1, 1, 1], off: 0};
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_3D, A.tex); gl.activeTexture(gl.TEXTURE0);
        gl.uniform3fv(Q.u.u_aoMin, A.min); gl.uniform3fv(Q.u.u_aoInv, A.inv); gl.uniform1f(Q.u.u_aoOff, A.off); }
      gl.bindVertexArray(G.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, count, G.type, start*G.isz, cnt[cls]);
    }
  }
  gl.disable(gl.CULL_FACE);
  // plumes, then glows: additive, depth-tested (no depth writes) against the hulls
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
  if (np && !(FLY.dbg & 128)) {
    if (!FLY.pvao) {
      FLY.pvao = gl.createVertexArray(); gl.bindVertexArray(FLY.pvao);
      FLY.pbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, FLY.pbuf); gl.bufferData(gl.ARRAY_BUFFER, FLY.plume.byteLength, gl.DYNAMIC_DRAW);
      for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 4, gl.FLOAT, false, 64, k*16); gl.vertexAttribDivisor(k, 1); }
    }
    const Qp = P.plume; gl.useProgram(Qp.p);
    gl.uniformMatrix4fv(Qp.u.u_vp, false, vp); gl.uniform1f(Qp.u.u_time, timeSec); gl.uniform1i(Qp.u.u_steps, (typeof SMALL !== 'undefined' && SMALL) ? 7 : 12);
    gl.bindVertexArray(FLY.pvao); gl.bindBuffer(gl.ARRAY_BUFFER, FLY.pbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, FLY.plume, 0, np*16);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, np);
  }
  // shield shells: the far surface, then the near one (additive: the far side's ripples show through, dimmer)
  if (shells.length && !(FLY.dbg & 128)) {
    const Q = P.shield, SP = shieldProxy(), t = COMBAT.t, hit = FXG.shHit, fl = FXG.shFl, Mi = FXG.shMi;
    gl.useProgram(Q.p); gl.uniformMatrix4fv(Q.u.u_vp, false, vp); gl.uniform1f(Q.u.u_rm, COMBAT.rm ? 1 : 0);
    gl.bindVertexArray(SP.vao); gl.enable(gl.CULL_FACE);
    for (const {sh, S, c, r, u, f, sc} of shells) {
      const kx = S.r[0]*1e-3*sc, ky = S.r[1]*1e-3*sc, kz = S.r[2]*1e-3*sc;
      for (let j = 0; j < 3; j++) { Mi[j*3] = r[j]/kx; Mi[j*3 + 1] = u[j]/ky; Mi[j*3 + 2] = f[j]/kz; }   // world -> unit sphere (column-major)
      for (let i = 0; i < 4; i++) { const q = sh.R[i]; if (q) { hit.set([q.d[0], q.d[1], q.d[2], t - q.t0], i*4); fl[i] = t - q.fl; } else { hit.set([0, 0, 1, -1], i*4); fl[i] = 9; } }
      gl.uniform3fv(Q.u.u_c, c); gl.uniform3fv(Q.u.u_ax, V.mul(r, kx)); gl.uniform3fv(Q.u.u_ay, V.mul(u, ky)); gl.uniform3fv(Q.u.u_az, V.mul(f, kz));
      gl.uniform3fv(Q.u.u_r, V.mul(S.r, sc)); gl.uniform3fv(Q.u.u_col, sh.team ? [1.6, 0.8, 0.25] : [0.3, 0.8, 1.6]); gl.uniformMatrix3fv(Q.u.u_Mi, false, Mi);
      gl.uniform4fv(Q.u.u_hit, hit); gl.uniform1fv(Q.u.u_fl, fl); gl.uniform1f(Q.u.u_down, sh.down == null ? -1 : t - sh.down); gl.uniform1f(Q.u.u_k, sh.k);
      gl.cullFace(gl.FRONT); gl.uniform1f(Q.u.u_side, -1); gl.drawElements(gl.TRIANGLES, SP.n, gl.UNSIGNED_SHORT, 0);
      gl.cullFace(gl.BACK); gl.uniform1f(Q.u.u_side, 1); gl.drawElements(gl.TRIANGLES, SP.n, gl.UNSIGNED_SHORT, 0);
    }
    gl.disable(gl.CULL_FACE);
  }
  // glows: soft additive sprites, depth-tested, fading to zero inside their quads (oriented when an axis pair is given)
  if (!FLY.vao) {
    FLY.vao = gl.createVertexArray(); gl.bindVertexArray(FLY.vao);
    FLY.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, FLY.buf); gl.bufferData(gl.ARRAY_BUFFER, FLY.data.byteLength, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 4, gl.FLOAT, false, 64, k*16); gl.vertexAttribDivisor(k, 1); }
  }
  let n = 0;
  for (const [p, size, col, type, ax, ay, age] of sprites) {
    if (n >= 128) break;
    const A = ax || [0, 0, 0], Bv = ay || [0, 0, 0];
    FLY.data.set([p[0], p[1], p[2], size, col[0], col[1], col[2], type, A[0], A[1], A[2], age || 0, Bv[0], Bv[1], Bv[2], n*0.37], n*16); n++;
  }
  const S = P.spr; gl.useProgram(S.p);
  gl.uniformMatrix4fv(S.u.u_vp, false, vp); gl.uniform3fv(S.u.u_R, b.r); gl.uniform3fv(S.u.u_U, b.u); gl.uniform1f(S.u.u_time, timeSec);
  gl.bindVertexArray(FLY.vao); gl.bindBuffer(gl.ARRAY_BUFFER, FLY.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, FLY.data, 0, n*16);
  if (n) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  // the fight: fireballs, smoke, flashes and glows, then tracers, sparks and warp streaks over them
  if (ns || nb) {
    fxInitGL();
    if (ns) {
      gl.bindVertexArray(FXG.sv); gl.bindBuffer(gl.ARRAY_BUFFER, FXG.sb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, FXG.spr, 0, ns*16);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, ns);
    }
    if (nb) {
      const Bq = P.beam; gl.useProgram(Bq.p);
      gl.uniformMatrix4fv(Bq.u.u_vp, false, vp); gl.uniform1f(Bq.u.u_pxK, h/(2*th));          // full-screen pixel scale (the rect remap keeps it)
      gl.bindVertexArray(FXG.bv); gl.bindBuffer(gl.ARRAY_BUFFER, FXG.bb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, FXG.beam, 0, nb*12);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nb);
    }
  }
  if (nt) {                                                     // fighter trails
    fxInitGL(); const Tq = P.trail; gl.useProgram(Tq.p);
    gl.uniformMatrix4fv(Tq.u.u_vp, false, vp); gl.uniform1f(Tq.u.u_pxK, h/(2*th));
    gl.bindVertexArray(FXG.tv); gl.bindBuffer(gl.ARRAY_BUFFER, FXG.tb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, FXG.trail, 0, nt*16);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nt);
  }
  gl.bindVertexArray(vao);
  gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
  // resolve the small target (a multisample resolve must not move), then lay it over the planet image at the rect
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, BT.msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, BT.resFb);
  gl.blitFramebuffer(0, 0, rw, rh, 0, 0, rw, rh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dstFb); gl.viewport(0, 0, w, h);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, y0, rw, rh);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const Cq = P.shipComp; gl.useProgram(Cq.p); gl.uniform2i(Cq.u.u_off, x0, y0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, BT.tex); gl.uniform1i(Cq.u.u_src, 0);
  fullscreen();
  gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return img;
}
// after a fight on a phone: give back the full-screen MSAA targets it grew (they only ever grow)
function flyFreeTargets(){
  if (!BT) return;
  gl.deleteFramebuffer(BT.msFb); gl.deleteRenderbuffer(BT.col); gl.deleteRenderbuffer(BT.dep); gl.deleteFramebuffer(BT.resFb); gl.deleteTexture(BT.tex);
  BT = null;
}
