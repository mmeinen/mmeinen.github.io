/* -- Vertex Shader -- */
const vsSource = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/* -- Fragment Shader -- */
const fsSource = `
  #extension GL_OES_standard_derivatives : enable
  precision highp float;
  uniform vec2  u_resolution;
  uniform float u_time;
  uniform float u_camDist;
  uniform float u_spin;
  uniform vec3  u_camPos;
  uniform vec3  u_camFwd;
  uniform vec3  u_camRight;
  uniform vec3  u_camUp;
  uniform float u_rH;
  uniform float u_rIsco;
  uniform float u_hoveredPlanet;
  uniform float u_orbitScale;
  uniform vec4 u_planet0;
  uniform vec4 u_planet1;
  uniform vec4 u_planet2;
  uniform vec4 u_planet3;
  uniform vec4 u_planet4;
  uniform vec4 u_planet5;
  uniform sampler2D u_bbTex;
  uniform vec3  u_detPos[6];
  uniform float u_detAge[6];
  uniform int   u_detCount;

  vec3 acceleration(vec3 p, vec3 v, float h2, float a) {
    float r = length(p);
    float r2 = r * r;
    float r3 = r2 * r;
    float r5 = r2 * r3;
    vec3 acc = -1.5 * h2 * p / r5;
    if (abs(a) < 0.001) return acc;
    vec3 J = vec3(0.0, a, 0.0);
    vec3 rhat = p / r;
    vec3 omega_LT = (2.0 * J - 6.0 * dot(J, rhat) * rhat) / r3;
    acc += 2.0 * cross(omega_LT, v);
    return acc;
  }

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float hash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  vec4 hash34(vec3 p) {
    vec4 p4 = fract(vec4(p.xyzx) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float vnoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = mix(hash3(i), hash3(i + vec3(1,0,0)), f.x);
    float b = mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x);
    float c = mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x);
    float d = mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    mat3 rot = mat3(0.00, 0.80, 0.60,
                    -0.80, 0.36, -0.48,
                    -0.60, -0.48, 0.64);
    for (int i = 0; i < 4; i++) {
      v += a * vnoise3(p);
      if (i >= 2 && u_camDist < 50.0) break;
      p = rot * p * 2.0 + vec3(1.7, 9.2, 5.3);
      a *= 0.5;
    }
    return v;
  }

  vec3 blackbodyColor(float t) {
    return texture2D(u_bbTex, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
  }

  float fastAtan2(float y, float x) {
    float ax = abs(x), ay = abs(y);
    float mn = min(ax, ay), mx = max(ax, ay);
    float a = mn / (mx + 1e-20);
    float s = a * a;
    float r = (((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a);
    if (ay > ax) r = 1.5707963 - r;
    if (x < 0.0) r = 3.1415926 - r;
    if (y < 0.0) r = -r;
    return r;
  }

  vec4 diskShading(vec3 hitPos, float r_isco, float a, vec3 rayDir) {
    float r = length(hitPos.xz);
    float outerEdge = 14.0;
    float fw = fwidth(r);
    float innerFade = smoothstep(r_isco - 0.3 - fw, r_isco + 0.8 + fw, r);
    float outerFade = smoothstep(outerEdge + 1.0 + fw, outerEdge - 2.0 - fw, r);
    float diskMask = innerFade * outerFade;
    if (diskMask < 0.001) return vec4(0.0);

    float rRatio = r_isco / r;
    float T = inversesqrt(r * sqrt(r)) * sqrt(sqrt(max(1.0 - sqrt(rRatio), 0.0)));
    float Tpeak = inversesqrt(r_isco * sqrt(r_isco)) * 0.63;
    float Tnorm = clamp(T / max(Tpeak, 0.001), 0.0, 1.2);

    float vOrb = sqrt(1.0 / r);
    vec2 diskPos = hitPos.xz;
    float spinSign = a >= 0.0 ? 1.0 : -1.0;
    vec2 orbDir = normalize(vec2(-diskPos.y, diskPos.x)) * spinSign;
    vec2 rayDir2D = normalize(rayDir.xz);
    float cosAngle = dot(orbDir, rayDir2D);
    float gamma = 1.0 / sqrt(max(1.0 - vOrb * vOrb, 0.04));
    float gRaw = 1.0 / (gamma * max(1.0 - vOrb * cosAngle, 0.15));
    float dopplerFade = smoothstep(r_isco, r_isco + 2.0, r);
    float g = mix(1.0, gRaw, dopplerFade);
    float dopplerFlux = min(g * g * g * g, 6.0);

    float gGrav = sqrt(max(1.0 - 2.0 / r, 0.01));

    float detailFade = smoothstep(0.0, 5.0, r - r_isco);
    float logR = log(r);
    float flow = u_time * 0.04 * inversesqrt(r);
    float tAngle = fastAtan2(hitPos.z, hitPos.x) + flow;
    vec3 diskUV = vec3(cos(tAngle) * 3.0, sin(tAngle) * 3.0, logR * 5.0);

    float warpX = vnoise3(diskUV * 0.7);
    float warpY = (u_camDist < 50.0) ? warpX * 0.7 : vnoise3(diskUV * 0.7 + vec3(5.2, 1.3, 3.7));
    vec3 warpedUV = diskUV + vec3(warpX, warpY, 0.0) * 1.5;

    float density = fbm(warpedUV);

    float slabH = 6.0;
    float cosIncidence = abs(rayDir.y) + 0.2;
    float pathLen = min(slabH / cosIncidence, 12.0);

    float frontTau = max(density - 0.05, 0.0) * 8.0;
    float frontCloud = 1.0 - exp(-frontTau);
    float cloud;
    if (u_camDist >= 50.0) {
      vec3 parallax = vec3(rayDir.xz, 0.0) * 2.0 / (abs(rayDir.y) + 0.4);
      float backDensity = vnoise3((warpedUV + parallax) * 0.6);
      float backTau = max(backDensity - 0.1, 0.0) * 6.0;
      float backCloud = 1.0 - exp(-backTau);
      cloud = frontCloud + (1.0 - frontCloud) * backCloud * 0.85;
    } else {
      cloud = frontCloud;
    }

    float pathBoost = 0.4 + 0.6 * min(pathLen, 12.0) / 12.0;

    float structure = mix(1.0, cloud, detailFade);

    float Tshifted = Tnorm * clamp(g, 0.2, 3.0) * gGrav;
    vec3 col = blackbodyColor(Tshifted);

    float brightness = dopplerFlux * gGrav * T * 6.0 * mix(0.3, 1.0, structure) * pathBoost;

    float alpha = diskMask * mix(0.25, 0.95, structure) * pathBoost;

    return vec4(col * brightness, clamp(alpha, 0.0, 1.0));
  }

  vec4 detonationShading(vec3 hitPos, vec3 detCenter, float age) {
    float tau = 0.4;
    float tNorm = age / tau;
    float expand = 1.0 + tNorm;
    float invExp = 1.0 / expand;
    float R = 0.125 * expand;

    float shellFade = invExp * invExp;

    float gasT = invExp;
    float gasL = shellFade;

    float debrisT = clamp(0.45 - age * 0.025, 0.03, 0.45);
    float debrisL = shellFade;

    vec3 toHit = hitPos - detCenter;
    float dist = length(toHit);
    vec3 dir = toHit / max(dist, 0.001);

    float shellR = R * 0.9;
    float shellW = 0.05 + R * 0.15;
    float outerBound = max(R, shellR + shellW) + 0.2;
    if (dist > outerBound) return vec4(0.0);

    float noiseAge = min(age, 3.0);
    vec3 nc1 = dir * 4.0 + vec3(noiseAge * 1.5, noiseAge * 0.8, noiseAge * 1.2);
    vec3 nc2 = dir * 10.0 - vec3(noiseAge * 0.7, noiseAge * 1.4, noiseAge * 0.5);
    float n1 = vnoise3(nc1);
    float n2 = vnoise3(nc2);
    float structure = n1 * 0.6 + n2 * 0.4;

    float cloudPhase = smoothstep(1.5, 4.0, age);

    float fbSurface = R * (0.85 + 0.3 * structure);
    float fbDepth = smoothstep(fbSurface, fbSurface * 0.6, dist);
    float fbDensity = fbDepth * (1.0 - cloudPhase);

    float shellDist = (dist - shellR) / max(shellW, 0.01);
    float shellBase = exp(-shellDist * shellDist);
    float filaments = structure * 0.7 + 0.15;
    float cloudDensity = cloudPhase * shellBase * filaments;

    float particleMask = smoothstep(0.58, 0.78, structure) * shellBase * cloudPhase;

    vec3 fbCol = blackbodyColor(gasT) * fbDensity * gasL * 30.0 * (1.0 + fbDepth * 0.5);
    vec3 cloudCol = blackbodyColor(debrisT) * cloudDensity * debrisL * 20.0;
    float particleT = clamp(debrisT * 2.0, 0.0, 0.7);
    vec3 particleCol = blackbodyColor(particleT) * particleMask * debrisL * 40.0;
    vec3 col = fbCol + cloudCol + particleCol;

    float fbOpacity = fbDensity * gasL * 4.0;
    float cloudOpacity = cloudDensity * debrisL * 3.0;
    float opacity = fbOpacity + cloudOpacity;

    float outerEdge = mix(fbSurface, shellR + shellW, cloudPhase);
    float limbDist = max(0.0, dist - outerEdge);
    float glowL = mix(gasL, debrisL * 0.5, cloudPhase);
    float glow = exp(-limbDist * limbDist * 1.5) * glowL * 8.0;
    float T = mix(gasT, debrisT, cloudPhase);
    col += blackbodyColor(T) * glow * (1.0 - clamp(opacity, 0.0, 1.0));

    return vec4(col, clamp(opacity, 0.0, 1.0));
  }


  vec3 shadePlanet(vec3 hp, vec3 ctr, float rad, int idx) {
    vec3 n = normalize(hp - ctr);
    float lat = n.y;
    float lon = atan(n.z, n.x);
    vec3 ldir = normalize(-ctr);
    float ambient = u_orbitScale > 1.5 ? 0.10 : 0.02;
    float diff = max(dot(n, ldir), 0.0) * (1.0 - ambient) + ambient;
    vec3 col;
    if (idx == 0) {
      float rLon = lon - u_time * 0.12;
      float turb = vnoise(vec2(lat * 12.0, rLon * 2.5)) * 0.06;
      float latN = lat + turb;
      float seb = smoothstep(0.168, 0.0, abs(latN + 0.25));
      float neb = smoothstep(0.15, 0.0, abs(latN - 0.18));
      float stb = smoothstep(0.122, 0.0, abs(latN + 0.52));
      float ntb = smoothstep(0.122, 0.0, abs(latN - 0.45));
      float sstb = smoothstep(0.106, 0.0, abs(latN + 0.70));
      float nntb = smoothstep(0.106, 0.0, abs(latN - 0.62));
      float ez = smoothstep(0.254, 0.0, abs(latN));
      float fine = sin(latN * 50.0) * 0.04 * smoothstep(0.35, 0.65, abs(latN));
      float majorBelt = (seb + neb) * 0.4 + (stb + ntb + sstb + nntb) * 0.2 + fine;
      col = mix(vec3(0.92, 0.87, 0.76), vec3(0.62, 0.38, 0.20), clamp(majorBelt, 0.0, 1.0));
      col = mix(col, vec3(0.88, 0.82, 0.70), ez * 0.5);
      col *= clamp(0.78 + ez * 0.22 - majorBelt * 0.15, 0.45, 1.0);
      col = mix(col, vec3(0.48, 0.50, 0.58), smoothstep(0.68, 0.92, abs(lat)));
      float dLat = (lat + 0.37) * 2.5;
      float dLon = mod(rLon - 1.5 + 3.14159, 6.28318) - 3.14159;
      float grsR2 = dLat * dLat * 12.0 + dLon * dLon * 8.0;
      float grs = smoothstep(1.5, 0.0, sqrt(grsR2));
      vec3 grsCol = mix(vec3(0.78, 0.36, 0.22), vec3(0.82, 0.58, 0.38), smoothstep(0.3, 1.5, sqrt(grsR2)));
      col = mix(col, grsCol, grs * 0.85);
    } else if (idx == 1) {
      float rLon = lon - u_time * 0.10;
      float turb = vnoise(vec2(lat * 8.0, rLon * 2.0)) * 0.03;
      float latN = lat + turb;
      float bands = sin(latN * 25.0) * 0.04 + sin(latN * 12.0) * 0.06;
      float ez = exp(-latN * latN * 20.0) * 0.1;
      col = mix(vec3(0.88, 0.80, 0.62), vec3(0.75, 0.65, 0.48), clamp(0.5 - bands, 0.0, 1.0) * 0.2);
      col += vec3(0.05, 0.04, 0.02) * ez;
      col = mix(col, vec3(0.55, 0.62, 0.72), smoothstep(0.65, 0.90, lat) * 0.45);
      col = mix(col, vec3(0.62, 0.52, 0.38), smoothstep(0.65, 0.90, -lat) * 0.3);
    } else if (idx == 2) {
      float rLon = lon - u_time * 0.07;
      float turb = vnoise(vec2(lat * 6.0, rLon * 1.5)) * 0.015;
      float bands = sin((lat + turb) * 15.0) * 0.015;
      col = vec3(0.67, 0.82, 0.86) + vec3(-0.005, 0.008, 0.008) * bands;
      col += vec3(0.08, 0.06, 0.04) * smoothstep(0.50, 0.85, lat);
      col *= 1.0 - smoothstep(0.88, 1.0, abs(lat)) * 0.15;
    } else if (idx == 3) {
      float rLon = lon - u_time * 0.09;
      float turb = vnoise(vec2(lat * 10.0, rLon * 2.0)) * 0.04;
      float latN = lat + turb;
      col = vec3(0.28, 0.45, 0.78);
      col += vec3(0.03, 0.05, 0.06) * (sin(latN * 20.0) * 0.06 + sin(latN * 10.0) * 0.04);
      float b30s = smoothstep(0.194, 0.0, abs(latN + 0.50));
      float b30n = smoothstep(0.194, 0.0, abs(latN - 0.50));
      col += vec3(0.12, 0.14, 0.16) * (b30s * 0.12 + b30n * 0.10);
      float dLat = (lat + 0.34) * 2.0;
      float dLon = mod(rLon + 3.14159, 6.28318) - 3.14159;
      float gds = smoothstep(1.5, 0.0, sqrt(dLat * dLat * 10.0 + dLon * dLon * 6.0));
      col = mix(col, vec3(0.15, 0.22, 0.50), gds * 0.55);
      float cLat = lat + 0.49;
      float cLon = mod(rLon + 0.15 + 3.14159, 6.28318) - 3.14159;
      col += vec3(0.18, 0.18, 0.12) * smoothstep(1.5, 0.0, sqrt(cLat * cLat * 50.0 + cLon * cLon * 20.0));
      float cirrus = vnoise(vec2(rLon * 4.0, lat * 2.0 + 5.0));
      cirrus = smoothstep(0.65, 0.80, cirrus) * 0.12 * smoothstep(0.1, 0.3, abs(lat)) * smoothstep(0.8, 0.5, abs(lat));
      col += vec3(0.15, 0.15, 0.10) * cirrus;
      col += vec3(0.04, 0.04, 0.02) * smoothstep(0.60, 0.85, -lat);
    } else if (idx == 4) {
      float rLon = lon - u_time * 0.003;
      float turb = vnoise(vec2(lat * 8.0, rLon * 3.0)) * 0.04;
      float latN = lat + turb;
      float bands = sin(latN * 18.0) * 0.05 + sin(latN * 8.0) * 0.08;
      col = vec3(0.92, 0.85, 0.65) + vec3(-0.02, 0.01, 0.03) * bands;
      col *= 1.0 - smoothstep(0.6, 0.95, abs(lat)) * 0.15;
      float yPat = sin(rLon * 2.0 + lat * 3.0) * 0.03;
      col += vec3(-0.01, -0.01, 0.01) * yPat * smoothstep(0.5, 0.0, abs(lat));
    } else if (idx == 5) {
      float rLon = lon - u_time * 0.08;
      float turb = vnoise(vec2(lat * 10.0, rLon * 3.0)) * 0.05;
      float latN = lat + turb;
      float land = vnoise(vec2(rLon * 1.5 + 2.0, latN * 2.0));
      land += vnoise(vec2(rLon * 3.0 + 5.0, latN * 4.0)) * 0.4;
      land = smoothstep(0.55, 0.75, land);
      vec3 ocean = mix(vec3(0.05, 0.15, 0.45), vec3(0.10, 0.28, 0.55), vnoise(vec2(rLon * 4.0, latN * 3.0)));
      vec3 landCol = mix(vec3(0.18, 0.38, 0.12), vec3(0.42, 0.32, 0.18), smoothstep(0.2, 0.6, abs(latN)));
      col = mix(ocean, landCol, land);
      float polar = smoothstep(0.70, 0.90, abs(lat));
      col = mix(col, vec3(0.90, 0.92, 0.95), polar);
      float clouds = vnoise(vec2(rLon * 3.0 + u_time * 0.02, latN * 2.5));
      clouds = smoothstep(0.50, 0.70, clouds) * 0.45;
      col = mix(col, vec3(0.95, 0.95, 0.97), clouds);
    }
    if (abs(float(idx) - u_hoveredPlanet) < 0.5) {
      vec3 viewDir = normalize(u_camPos - hp);
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
      col += vec3(0.15, 0.35, 0.65) * rim * 0.8;
      col *= 1.3;
    }
    return col * diff;
  }

  vec2 galaxyProject(vec3 rd, vec3 dir, float scl, float tilt, float cosA) {
    vec3 up0 = normalize(cross(dir, vec3(0.0, 1.0, 0.1)));
    vec3 right0 = cross(up0, dir);
    vec2 offset = vec2(dot(rd - dir * cosA, right0), dot(rd - dir * cosA, up0)) * scl;
    float ct = cos(tilt), st = sin(tilt);
    return vec2(offset.x * ct - offset.y * st, offset.x * st + offset.y * ct);
  }

  vec3 renderSpiral(vec3 rd, vec3 dir, float scl, float tilt, float bright, vec3 tintCore, vec3 tintArm) {
    float cosA = dot(rd, dir);
    if (cosA < 0.95) return vec3(0.0);
    vec2 g = galaxyProject(rd, dir, scl, tilt, cosA);
    float gr = length(g);
    float ga = atan(g.y, g.x);
    float core = exp(-gr * gr * 0.8) * 1.2;
    float armWidth = 0.45;
    float arms = 0.0;
    for (int i = 0; i < 2; i++) {
      float off = float(i) * 3.14159;
      float spiralAngle = log(max(gr, 0.1)) * 2.8 + off;
      float diff = mod(ga - spiralAngle + 3.14159, 6.28318) - 3.14159;
      float arm = exp(-diff * diff / (armWidth * armWidth));
      arm *= smoothstep(0.0, 0.4, gr) * exp(-gr * 0.35);
      arms += arm;
    }
    float n = vnoise(vec2(g.x * 3.0, g.y * 3.0)) * 0.5
            + vnoise(vec2(g.x * 7.0, g.y * 7.0)) * 0.3;
    arms *= 0.6 + 0.8 * n;
    float disk = exp(-gr * 0.25) * 0.3;
    float total = (core + arms * 0.7 + disk) * smoothstep(0.95, 0.96, cosA);
    vec3 col = mix(tintArm, tintCore, exp(-gr * 0.5)) * total;
    float sfr = vnoise(vec2(g.x * 5.0 + 10.0, g.y * 5.0)) * arms;
    col += vec3(0.8, 0.3, 0.5) * sfr * 0.15;
    return col * bright;
  }

  vec3 renderElliptical(vec3 rd, vec3 dir, float scl, float tilt, float bright, float axisRatio, vec3 tint) {
    float cosA = dot(rd, dir);
    if (cosA < 0.95) return vec3(0.0);
    vec2 g = galaxyProject(rd, dir, scl, tilt, cosA);
    float er = length(vec2(g.x, g.y / axisRatio));
    float profile = exp(-3.5 * sqrt(sqrt(max(er, 0.01))));
    profile += exp(-er * 0.5) * 0.08;
    profile *= smoothstep(0.95, 0.96, cosA);
    vec3 col = mix(tint * 0.7, tint, exp(-er * 0.3)) * profile;
    return col * bright;
  }

  vec3 renderEdgeOn(vec3 rd, vec3 dir, float scl, float tilt, float bright, vec3 tint) {
    float cosA = dot(rd, dir);
    if (cosA < 0.95) return vec3(0.0);
    vec2 g = galaxyProject(rd, dir, scl, tilt, cosA);
    float dx = abs(g.x);
    float dy = abs(g.y);
    float bulge = exp(-(dx * dx * 0.6 + dy * dy * 2.0)) * 1.5;
    float diskThickness = 0.15 + 0.1 * exp(-dx * 0.3);
    float disk = exp(-dy * dy / (diskThickness * diskThickness)) * exp(-dx * 0.25);
    float dust = 1.0 - 0.6 * exp(-dy * dy / 0.01) * smoothstep(0.0, 0.5, dx);
    float total = (bulge + disk * 0.8) * dust * smoothstep(0.95, 0.96, cosA);
    vec3 col = mix(vec3(0.5, 0.6, 1.0) * tint, tint, exp(-dx * 0.3)) * total;
    return col * bright;
  }

  vec3 renderIrregular(vec3 rd, vec3 dir, float scl, float bright, vec3 tint) {
    float cosA = dot(rd, dir);
    if (cosA < 0.95) return vec3(0.0);
    vec2 g = galaxyProject(rd, dir, scl, 0.0, cosA);
    float gr = length(g);
    float base = exp(-gr * gr * 0.3) * 0.5;
    float blobs = vnoise(vec2(g.x * 2.5, g.y * 2.5)) * 0.6
                + vnoise(vec2(g.x * 5.0 + 7.0, g.y * 5.0 + 3.0)) * 0.4;
    blobs *= exp(-gr * 0.5);
    float knots = vnoise(vec2(g.x * 8.0 + 20.0, g.y * 8.0));
    knots = smoothstep(0.55, 0.8, knots) * exp(-gr * 0.4);
    float total = (base + blobs * 0.5) * smoothstep(0.95, 0.96, cosA);
    vec3 col = tint * total;
    col += vec3(0.4, 0.6, 1.0) * knots * 0.3;
    return col * bright;
  }

  vec3 galaxies(vec3 rd) {
    vec3 col = vec3(0.0);
    float scale = 4.0;
    vec3 p = rd * scale;
    vec3 fp = floor(p);
    for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++)
    for (int dz = -1; dz <= 1; dz++) {
      vec3 cell = fp + vec3(float(dx), float(dy), float(dz));
      vec4 h1 = hash34(cell);
      if (h1.x > 0.22) continue;
      vec3 gpos = cell + vec3(0.5);
      vec3 gdir = normalize(gpos);
      if (dot(rd, gdir) < 0.94) continue;
      vec4 h2 = hash34(cell + 10.0);
      vec4 h3 = hash34(cell + 50.0);
      float hType  = h2.x;
      float hScale = h2.y;
      float hTilt  = h2.z;
      float hBri   = h2.w;
      float hCol   = h3.x;
      float hExtra = h3.y;
      float scl  = 140.0 + hScale * 320.0;
      float tilt = hTilt * 6.28318;
      float bright = 0.06 + hBri * 0.30;
      vec3 coreCol = mix(vec3(1.0, 0.82, 0.5), vec3(1.0, 0.95, 0.82), hCol);
      vec3 armCol  = mix(vec3(0.45, 0.55, 1.0), vec3(0.7, 0.8, 0.95), hCol);
      vec3 tint    = mix(vec3(1.0, 0.78, 0.45), vec3(0.95, 0.88, 0.7), hCol);
      if (hType < 0.35) {
        col += renderSpiral(rd, gdir, scl, tilt, bright, coreCol, armCol);
      } else if (hType < 0.60) {
        float axisRatio = 0.4 + hExtra * 0.5;
        col += renderElliptical(rd, gdir, scl, tilt, bright, axisRatio, tint);
      } else if (hType < 0.80) {
        col += renderEdgeOn(rd, gdir, scl, tilt, bright, tint);
      } else {
        col += renderIrregular(rd, gdir, scl, bright, tint);
      }
    }
    col += vec3(0.005, 0.004, 0.008);
    return col;
  }

  vec3 acesToneMap(vec3 x) {
    return clamp(
      (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14),
      0.0, 1.0
    );
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
    float spin = u_spin;
    float absSpin = abs(spin);
    float r_h = u_rH;
    float r_isco = u_rIsco;

    vec3 rd = normalize(u_camFwd * 1.8 + u_camRight * uv.x + u_camUp * uv.y);
    vec3 pos = u_camPos;
    vec3 vel = rd;
    vec3 L = cross(pos, vel);
    float L2 = dot(L, L);

    vec3 accumulatedColor = vec3(0.0);
    float accumulatedAlpha = 0.0;
    bool didEscape = true;
    float prevY = pos.y;
    float minR = 1000.0;

    float dt0 = max(0.002, min(0.08 * (length(pos) - r_h), 5.0));
    vec3 vel_half = vel + 0.5 * dt0 * acceleration(pos, vel, L2, spin);
    float escapeR = max(50.0 * u_orbitScale, u_camDist + 20.0);
    float pixelAngle = 1.0 / (min(u_resolution.x, u_resolution.y) * 1.8);
    float convThresh = pixelAngle * pixelAngle * 0.0625;

    for (int i = 0; i < 250; i++) {
      float r = length(pos);
      minR = min(minR, r);
      if (accumulatedAlpha > 0.98) break;
      if (r < r_h * 1.05) {
        didEscape = false;
        break;
      }
      if (r > escapeR) break;
      if (r > mix(100.0, 175.0, step(1.5, u_orbitScale)) && dot(pos, vel) > 0.0) break;

      float stepCap = mix(5.0, 3.0, step(1.5, u_orbitScale) * (1.0 - step(70.0, r)));
      float dt = max(0.002, min(0.08 * (r - r_h), stepCap));
      vec3 prevPos = pos;
      pos += vel_half * dt;
      vec3 a = acceleration(pos, vel_half, L2, spin);
      vel = vel_half + 0.5 * dt * a;
      vel_half += dt * a;
      float newY = pos.y;

      if (prevY * newY < 0.0 && accumulatedAlpha < 0.98) {
        float frac = prevY / (prevY - newY);
        vec3 hitPos = mix(prevPos, pos, frac);
        float hitR = length(hitPos.xz);
        vec4 disk = diskShading(hitPos, r_isco, spin, vel);
        vec3 dCol = disk.rgb;
        float dAlpha = clamp(disk.a, 0.0, 1.0);
        accumulatedColor += dCol * dAlpha * (1.0 - accumulatedAlpha);
        accumulatedAlpha += dAlpha * (1.0 - accumulatedAlpha);
        if (accumulatedAlpha < 0.98) {
          vec3 satC = u_planet1.xyz;
          float sd = length(hitPos.xz - satC.xz);
          float ringPxW = length(u_camPos - hitPos) / (min(u_resolution.x, u_resolution.y) * 1.8);
          float rfPx = ringPxW / 2.5;
          if (sd > 3.0 - ringPxW * 2.0 && sd < 5.5 + ringPxW * 2.0) {
            float rf = (sd - 3.0) / 2.5;
            float w = max(0.02, rfPx * 1.0);
            float cR = smoothstep(-w, w, rf) * (1.0 - smoothstep(0.20 - w, 0.20 + w, rf));
            float bR = smoothstep(0.20 - w, 0.20 + w, rf) * (1.0 - smoothstep(0.56 - w, 0.56 + w, rf));
            float cas = smoothstep(0.56 - w, 0.56 + w, rf) * (1.0 - smoothstep(0.64 - w, 0.64 + w, rf));
            float aR = smoothstep(0.64 - w, 0.64 + w, rf) * (1.0 - smoothstep(0.96 - w, 0.96 + w, rf));
            float ringBright = cR * 0.35 + bR * 1.0 + aR * 0.75;
            float ringAlpha = cR * 0.30 + bR * 0.85 + cas * 0.05 + aR * 0.65;
            vec3 ringCol = mix(vec3(0.50, 0.45, 0.38), vec3(0.93, 0.89, 0.81), ringBright);
            float texAtten = 1.0 / (1.0 + ringPxW * ringPxW * 900.0);
            ringCol *= 0.88 + 0.12 * sin(sd * 30.0) * texAtten;
            // X-ray flash illumination from nearby detonations
            if (u_detCount > 0) for(int di=0; di<6; di++) {
              if (u_detAge[di] >= 0.0 && u_detAge[di] < 6.0) {
                float dToRing = length(hitPos - u_detPos[di]);
                float dExp = 1.0 + u_detAge[di] / 0.4;
                float dIllum = 1.0 / (dExp * dExp);
                dIllum *= 3.0 / (1.0 + dToRing * dToRing * 0.02);
                float dTemp = clamp(0.45 - u_detAge[di] * 0.025, 0.03, 0.45);
                ringCol += blackbodyColor(dTemp) * dIllum * 0.5;
              }
            }
            vec2 hp2 = hitPos.xz;
            vec2 sc2 = satC.xz;
            float tSh = dot(sc2, hp2) / dot(hp2, hp2);
            float shDist = length(sc2 - hp2 * tSh);
            float shadow = smoothstep(1.7, 2.3, shDist);
            shadow = mix(1.0, shadow, smoothstep(0.0, 0.01, tSh) * smoothstep(1.0, 0.99, tSh));
            ringCol *= mix(0.01, 1.0, shadow);
            accumulatedColor += ringCol * ringAlpha * (1.0 - accumulatedAlpha);
            accumulatedAlpha += ringAlpha * (1.0 - accumulatedAlpha);
          }
        }
        if (accumulatedAlpha > 0.98) break;
      }
      if (r > 16.0 && r < mix(100.0, 175.0, step(1.5, u_orbitScale)) && accumulatedAlpha < 0.98) {
        vec3 seg = pos - prevPos;
        float segL2 = dot(seg, seg);
        float edgeW = length(u_camPos - prevPos) / (min(u_resolution.x, u_resolution.y) * 1.8) * 1.5;
        float segLen = sqrt(segL2);
        vec3 segMid = 0.5 * (prevPos + pos);
        for (int p = 0; p < 6; p++) {
          vec4 pl = (p == 0) ? u_planet0 : (p == 1) ? u_planet1 : (p == 2) ? u_planet2 : (p == 3) ? u_planet3 : (p == 4) ? u_planet4 : u_planet5;
          vec3 pC = pl.xyz;
          float pr = pl.w;
          vec3 dP = segMid - pC;
          float thresh = pr + segLen * 0.5 + edgeW + 5.0;
          if (dot(dP, dP) > thresh * thresh) continue;
          vec3 oc = prevPos - pC;
          float bH = dot(oc, seg);
          float oc2 = dot(oc, oc);
          float tClose = clamp(-bH / segL2, 0.0, 1.0);
          vec3 cpVec = oc + seg * tClose;
          float dist2 = dot(cpVec, cpVec);
          float prE = pr + edgeW;
          if (dist2 < prE * prE) {
            float dist = sqrt(dist2);
            float alpha = smoothstep(prE, pr, dist);
            vec3 hitP = pC + normalize(cpVec) * pr;
            float disc = bH * bH - segL2 * (oc2 - pr * pr);
            if (disc > 0.0) {
              float sqD = sqrt(disc);
              float t1 = (-bH - sqD) / segL2;
              float t2 = (-bH + sqD) / segL2;
              float t = (t1 > 0.0) ? t1 : t2;
              if (t > 0.0 && t < 1.0) hitP = prevPos + seg * t;
            }
            vec3 pCol = shadePlanet(hitP, pC, pr, p);
            accumulatedColor += pCol * alpha * (1.0 - accumulatedAlpha);
            accumulatedAlpha += alpha * (1.0 - accumulatedAlpha);
            if (accumulatedAlpha > 0.98) break;
          }
        }
      }
      float aDt2 = dot(a, a) * dt * dt;
      if (aDt2 < convThresh * dot(vel, vel) && dot(pos, pos) > 3025.0 * u_orbitScale * u_orbitScale
          && dot(pos, vel) > 0.0 && pos.y * vel.y > 0.0) {
        break;
      }
      prevY = newY;
    }

    // Post-loop: volumetric detonation (straight-line ray approximation)
    if (u_detCount > 0 && accumulatedAlpha < 0.98) {
      for (int di = 0; di < 6; di++) {
        if (u_detAge[di] < 0.0) continue;
        float detExpP = 1.0 + u_detAge[di] / 0.4;
        float detRP = 0.125 * detExpP;
        float detShellRP = detRP * 0.9;
        float detShellWP = 0.05 + detRP * 0.15;
        float detRMaxP = max(detRP, detShellRP + detShellWP) + 0.2;
        vec3 toDetP = u_detPos[di] - u_camPos;
        float tRayP = max(dot(toDetP, rd), 0.0);
        vec3 nearPtP = u_camPos + rd * tRayP;
        vec3 diffP = nearPtP - u_detPos[di];
        if (dot(diffP, diffP) < detRMaxP * detRMaxP) {
          vec4 det = detonationShading(nearPtP, u_detPos[di], u_detAge[di]);
          accumulatedColor += det.rgb * max(det.a, 0.001) * (1.0 - accumulatedAlpha);
          accumulatedAlpha += det.a * (1.0 - accumulatedAlpha);
        }
        if (accumulatedAlpha > 0.98) break;
      }
    }

    vec3 bgCol = vec3(0.0);

    float captureWidth = r_h * 0.15;
    float captureFactor = 1.0 - smoothstep(r_h, r_h * 1.05 + captureWidth, minR);

    if (accumulatedAlpha < 1.0) {
      float photonR = 3.0 * (1.0 - absSpin * 0.3);
      float pTmp1 = (minR - photonR) * 2.0;
      float proximity = exp(-pTmp1 * pTmp1);
      vec3 ringCol = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.95, 0.9), proximity);
      bgCol += ringCol * proximity * 0.4;
      float pTmp2 = (minR - photonR) * 0.8;
      float haze = exp(-pTmp2 * pTmp2);
      bgCol += vec3(0.15, 0.06, 0.02) * haze;

      if (didEscape) {
        vec3 finalRd = normalize(vel);
        bgCol += galaxies(finalRd);
      }

      bgCol *= (1.0 - captureFactor);
    }

    vec3 finalColor = accumulatedColor + bgCol * (1.0 - accumulatedAlpha);

    // Nuclear detonation: screen-wide flash only (first ~0.3s)
    if (u_detCount > 0) for(int di=0; di<6; di++) {
      if (u_detAge[di] >= 0.0 && u_detAge[di] < 1.0) {
        float flash = exp(-u_detAge[di] * 8.0) * 5.0;
        finalColor += vec3(flash);
      }
    }

    float lum = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
    float bloomAmount = max(lum - 0.6, 0.0) * 0.5;
    finalColor += finalColor * bloomAmount;
    finalColor = acesToneMap(finalColor * 0.85);
    finalColor = pow(finalColor, vec3(0.4545));
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

/* -- Ship Shader -- */
const shipVS=`attribute vec3 a_shipPos;
attribute vec3 a_shipNormal;
uniform mat4 u_mvp;
uniform mat3 u_normalMatrix;
varying vec3 v_normal;
varying vec3 v_pos;
void main(){
  v_normal=normalize(u_normalMatrix*a_shipNormal);
  v_pos=a_shipPos;
  gl_Position=u_mvp*vec4(a_shipPos,1.0);
}`;
const shipFS=`precision mediump float;
uniform vec3 u_shipColor;
uniform vec3 u_lightDir;
varying vec3 v_normal;
varying vec3 v_pos;
void main(){
  vec3 n=normalize(v_normal);
  float diff=max(dot(n,u_lightDir),0.0);
  float amb=0.15;
  float rim=pow(1.0-max(dot(n,vec3(0.0,0.0,1.0)),0.0),3.0)*0.3;
  vec3 col=u_shipColor*(amb+diff*0.85)+vec3(0.3,0.5,0.8)*rim;
  gl_FragColor=vec4(col,1.0);
}`;

/* -- Trajectory Shader -- */
const trajVS=`attribute vec3 a_trajPos;
uniform mat4 u_trajMVP;
uniform float u_trajPtSize;
void main(){
  gl_Position=u_trajMVP*vec4(a_trajPos,1.0);
  gl_PointSize=u_trajPtSize;
}`;
const trajFS=`precision mediump float;
uniform vec4 u_trajColor;
void main(){
  vec2 c=gl_PointCoord-0.5;
  if(dot(c,c)>0.25)discard;
  gl_FragColor=u_trajColor;
}`;
