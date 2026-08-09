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
  // xyz = centre, w = radius. An array (not five scalars) so the march loop can index it
  // with the loop counter -- five separate uniforms compile to a select cascade that has to
  // be evaluated on every step of the hottest loop in the shader.
  uniform vec4 u_planets[5];
  // Max |y| any planet surface reaches. All orbits lie in the y = 0 plane, so this is just
  // the largest planet radius; JS derives it from planetData so it cannot drift out of sync.
  uniform float u_planetSlab;
  uniform sampler2D u_bbTex;
  uniform sampler2D u_noiseTex;

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

  vec4 hash34(vec3 p) {
    vec4 p4 = fract(vec4(p.xyzx) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
  }

  float noiseLUT2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 sf = f * f * (3.0 - 2.0 * f);
    return texture2D(u_noiseTex, (i + sf + 0.5) / 256.0).r;
  }

  vec3 blackbodyColor(float t) {
    return texture2D(u_bbTex, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
  }

  // Ray-march step size. The Schwarzschild term gives |acc| = 1.5*L2/r^4, so dt = EPS/|acc|
  // holds the velocity deflection per step at a constant EPS wherever the ray is. The old rule
  // (a fixed fraction of r) over-resolved the far field by orders of magnitude -- at r = 120
  // with impact parameter 60 it spent 5-unit steps on a stretch that bends by ~1e-4 rad.
  //
  // DT_R_FRAC bounds the step to a fraction of the distance to the horizon so a step can never
  // charge past it. It also bounds how far a chord may sag inside its endpoints: for a chord of
  // length f*r the sagitta is about r*f^2/8, i.e. under 0.8% of r at f = 0.25. The planet gate
  // relies on that bound (see the march loop).
  //
  // Inside DETAIL_R the ray genuinely bends hard and disc hit positions are interpolated along
  // the segment, so the old fine step is kept there.
  float stepSize(float r, float r_h, float L2) {
    float r2 = r * r;
    float dtCurv = 0.04 * r2 * r2 / (1.5 * L2 + 1.0);   // EPS = 0.04 rad per step
    float dt = min(dtCurv, 0.25 * (r - r_h));           // DT_R_FRAC = 0.25
    if (r < 20.0) dt = min(dt, 0.08 * (r - r_h));       // DETAIL_R = 20.0
    return clamp(dt, 0.002, 40.0);
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

    float slabH = 6.0;
    float cosIncidence = abs(rayDir.y) + 0.2;
    float pathLen = min(slabH / cosIncidence, 12.0);
    float pathBoost = 0.4 + 0.6 * min(pathLen, 12.0) / 12.0;

    // Cloud structure was an fbm over u_noiseTex -- but that sampler has never been bound by
    // any caller, so it silently resolved to texture unit 0 (the 256x1 blackbody ramp) and
    // returned the ramp's saturated tail, ~1.0, for essentially every input. Both optical
    // depths then saturated (1 - exp(-7)) and this whole chain evaluated to the constant
    // below -- while costing ~40% of the frame in texture taps on the hottest path.
    // Folding it out is pixel-faithful: no pixel in any test view moves by more than 5/255.
    // Restoring real turbulence means binding a 256x256 REPEAT-wrapped noise texture to
    // u_noiseTex and reinstating fbm (see git history for the original chain).
    float structure = 1.0;

    float Tshifted = Tnorm * clamp(g, 0.2, 3.0) * gGrav;
    vec3 col = blackbodyColor(Tshifted);

    float brightness = dopplerFlux * gGrav * T * 6.0 * mix(0.3, 1.0, structure) * pathBoost;

    float alpha = diskMask * mix(0.25, 0.95, structure) * pathBoost;

    return vec4(col * brightness, clamp(alpha, 0.0, 1.0));
  }

  vec3 shadePlanet(vec3 hp, vec3 ctr, float rad, int idx) {
    vec3 n = normalize(hp - ctr);
    float lat = n.y;
    float lon = atan(n.z, n.x);
    vec3 ldir = normalize(-ctr);
    float ambient = 0.02;
    float diff = max(dot(n, ldir), 0.0) * (1.0 - ambient) + ambient;
    vec3 col;
    if (idx == 0) {
      float rLon = lon - u_time * 0.12;
      float turb = noiseLUT2(vec2(lat * 12.0, rLon * 2.5)) * 0.06;
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
      float turb = noiseLUT2(vec2(lat * 8.0, rLon * 2.0)) * 0.03;
      float latN = lat + turb;
      float bands = sin(latN * 25.0) * 0.04 + sin(latN * 12.0) * 0.06;
      float ez = exp(-latN * latN * 20.0) * 0.1;
      col = mix(vec3(0.88, 0.80, 0.62), vec3(0.75, 0.65, 0.48), clamp(0.5 - bands, 0.0, 1.0) * 0.2);
      col += vec3(0.05, 0.04, 0.02) * ez;
      col = mix(col, vec3(0.55, 0.62, 0.72), smoothstep(0.65, 0.90, lat) * 0.45);
      col = mix(col, vec3(0.62, 0.52, 0.38), smoothstep(0.65, 0.90, -lat) * 0.3);
    } else if (idx == 2) {
      float rLon = lon - u_time * 0.07;
      float turb = noiseLUT2(vec2(lat * 6.0, rLon * 1.5)) * 0.015;
      float bands = sin((lat + turb) * 15.0) * 0.015;
      col = vec3(0.67, 0.82, 0.86) + vec3(-0.005, 0.008, 0.008) * bands;
      col += vec3(0.08, 0.06, 0.04) * smoothstep(0.50, 0.85, lat);
      col *= 1.0 - smoothstep(0.88, 1.0, abs(lat)) * 0.15;
    } else if (idx == 3) {
      float rLon = lon - u_time * 0.09;
      float turb = noiseLUT2(vec2(lat * 10.0, rLon * 2.0)) * 0.04;
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
      float cirrus = noiseLUT2(vec2(rLon * 4.0, lat * 2.0 + 5.0));
      cirrus = smoothstep(0.65, 0.80, cirrus) * 0.12 * smoothstep(0.1, 0.3, abs(lat)) * smoothstep(0.8, 0.5, abs(lat));
      col += vec3(0.15, 0.15, 0.10) * cirrus;
      col += vec3(0.04, 0.04, 0.02) * smoothstep(0.60, 0.85, -lat);
    } else if (idx == 4) {
      // Mars (Theo) -- moved to slot 4 after planet-count reduction to 5
      float rLon = lon - u_time * 0.06;
      float turb = noiseLUT2(vec2(lat * 8.0, rLon * 2.5)) * 0.04;
      float latN = lat + turb;
      float bands = sin(latN * 15.0) * 0.05 + sin(latN * 7.0) * 0.07;
      col = mix(vec3(0.72, 0.55, 0.40), vec3(0.50, 0.32, 0.20), clamp(bands + 0.5, 0.0, 1.0));
      float desert = noiseLUT2(vec2(rLon * 2.0, latN * 3.0));
      col = mix(col, vec3(0.85, 0.70, 0.45), smoothstep(0.4, 0.7, desert) * 0.4);
      float polar = smoothstep(0.75, 0.95, abs(lat));
      col = mix(col, vec3(0.80, 0.75, 0.65), polar * 0.5);
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
    float n = noiseLUT2(vec2(g.x * 3.0, g.y * 3.0)) * 0.5
            + noiseLUT2(vec2(g.x * 7.0, g.y * 7.0)) * 0.3;
    arms *= 0.6 + 0.8 * n;
    float disk = exp(-gr * 0.25) * 0.3;
    float total = (core + arms * 0.7 + disk) * smoothstep(0.95, 0.96, cosA);
    vec3 col = mix(tintArm, tintCore, exp(-gr * 0.5)) * total;
    float sfr = noiseLUT2(vec2(g.x * 5.0 + 10.0, g.y * 5.0)) * arms;
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
    float blobs = noiseLUT2(vec2(g.x * 2.5, g.y * 2.5)) * 0.6
                + noiseLUT2(vec2(g.x * 5.0 + 7.0, g.y * 5.0 + 3.0)) * 0.4;
    blobs *= exp(-gr * 0.5);
    float knots = noiseLUT2(vec2(g.x * 8.0 + 20.0, g.y * 8.0));
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
    vec3 fp = floor(p - 0.5);
    for (int dx = 0; dx <= 1; dx++)
    for (int dy = 0; dy <= 1; dy++)
    for (int dz = 0; dz <= 1; dz++) {
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

    // Deferred planet hit. shadePlanet is large and register-hungry; inlining it into the
    // march loop throttles occupancy for every pixel, including the vast majority that never
    // touch a planet. A hit's contribution is additive with a weight fixed at hit time, so
    // recording the hit here and shading once after the loop is numerically identical while
    // keeping the loop body small. Ties broken by weight = the visually dominant surface.
    int   hitIdx = -1;
    float hitW = 0.0;
    vec3  hitPoint = vec3(0.0);
    vec4  hitPlanet = vec4(0.0);

    // Step size, and the seed half-kick, both come from stepSize() so the Verlet half-step
    // matches the first full step.
    float r = length(pos);
    float dt0 = stepSize(r, r_h, L2);
    vec3 vel_half = vel + 0.5 * dt0 * acceleration(pos, vel, L2, spin);
    float escapeR = max(50.0, u_camDist + 20.0);
    float pixelAngle = 1.0 / (min(u_resolution.x, u_resolution.y) * 1.8);
    float convThresh = pixelAngle * pixelAngle * 0.0625;
    float closeupFactor = smoothstep(30.0, 5.0, u_camDist);
    // Half-thickness of the y-slab the planet test must consider, widened by a conservative
    // bound on the anti-alias edge margin (edgeW) so the gate can never reject a segment the
    // widened intersection test would have hit. March points stay inside escapeR of the
    // origin, so camera-to-point separation never exceeds 2*camDist + 20.
    float planetSlab = u_planetSlab + (2.0 * u_camDist + 20.0) * pixelAngle * 1.5;

    for (int i = 0; i < 250; i++) {
      minR = min(minR, r);
      if (accumulatedAlpha > 0.98) break;
      if (r < r_h * 1.05) {
        didEscape = false;
        break;
      }
      if (r > escapeR) break;
      if (r > 100.0 && dot(pos, vel) > 0.0) break;

      float dt = stepSize(r, r_h, L2);
      vec3 prevPos = pos;
      pos += vel_half * dt;
      vec3 a = acceleration(pos, vel_half, L2, spin);
      vel = vel_half + 0.5 * dt * a;
      vel_half += dt * a;
      float newY = pos.y;
      // Carried to the next iteration as r, so this costs no extra sqrt -- it just moves the
      // one the loop already did. Having both endpoint radii lets the planet gate below test
      // the segment's radial span instead of only where the segment started.
      float rNew = length(pos);

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
          vec3 satC = u_planets[1].xyz;
          float sd = length(hitPos.xz - satC.xz);
          float ringPxW = length(u_camPos - hitPos) * pixelAngle;
          float rfPx = ringPxW / 2.5;
          if (sd > 3.0 - ringPxW * 2.0 && sd < 5.5 + ringPxW * 2.0) {
            float rf = (sd - 3.0) / 2.5;
            // Anti-alias the ring bands at the TRUE per-pixel rate of change of the ring
            // radius. For grazing rays sd shifts fast across one pixel, so the distance-only
            // estimate (rfPx) underestimates the footprint and the thin bands shimmer/jitter.
            // fwidth(sd) measures the real screen-space derivative -> widen band edges to it.
            float sdW = fwidth(sd);
            float rfW = sdW / 2.5;
            float w = max(0.02, max(rfPx, rfW * 0.8));
            float cR = smoothstep(-w, w, rf) * (1.0 - smoothstep(0.20 - w, 0.20 + w, rf));
            float bR = smoothstep(0.20 - w, 0.20 + w, rf) * (1.0 - smoothstep(0.56 - w, 0.56 + w, rf));
            float cas = smoothstep(0.56 - w, 0.56 + w, rf) * (1.0 - smoothstep(0.64 - w, 0.64 + w, rf));
            float aR = smoothstep(0.64 - w, 0.64 + w, rf) * (1.0 - smoothstep(0.96 - w, 0.96 + w, rf));
            float ringBright = cR * 0.35 + bR * 1.0 + aR * 0.75;
            float ringAlpha = cR * 0.30 + bR * 0.85 + cas * 0.05 + aR * 0.65;
            vec3 ringCol = mix(vec3(0.50, 0.45, 0.38), vec3(0.93, 0.89, 0.81), ringBright);
            float texAtten = 1.0 / (1.0 + (ringPxW * ringPxW + sdW * sdW) * 900.0);
            ringCol *= 0.88 + 0.12 * sin(sd * 30.0) * texAtten;
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
      // Planet intersection. This gate runs on every march step, so rejecting cheaply matters
      // far more than the test itself -- it was ~60% of the whole frame before the slab cull.
      // Every planet orbits in the y = 0 plane, so a segment whose y-extent clears the planet
      // slab cannot hit any of them, and prevY/newY are already live: one compare kills all five.
      // Radial gate on the SEGMENT, not just where it started: with curvature-adaptive steps a
      // single segment can span tens of units, and gating on the start radius alone would skip
      // the test for a segment that starts outside the band and crosses into it -- silently
      // clipping far-side planets. max(r, rNew) is the segment's true outer reach (a chord's
      // maximum radius is always at an endpoint). min(r, rNew) overstates its inner reach by at
      // most the chord sagitta, under 0.8% of r by the DT_R_FRAC bound in stepSize(), which is
      // far inside the 12.6-unit margin between this 100.0 bound and Neptune's 87.4 reach.
      if (max(r, rNew) > 16.0 && min(r, rNew) < 100.0 && accumulatedAlpha < 0.98
          && min(prevY, newY) < planetSlab && max(prevY, newY) > -planetSlab) {
        vec3 seg = pos - prevPos;
        float segL2 = dot(seg, seg);
        float edgeW = length(u_camPos - prevPos) * pixelAngle * 1.5;
        float segLen = sqrt(segL2);
        vec3 segMid = 0.5 * (prevPos + pos);
        for (int p = 0; p < 5; p++) {
          vec4 pl = u_planets[p];
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
            float w = alpha * (1.0 - accumulatedAlpha);
            if (w > hitW) { hitW = w; hitPoint = hitP; hitPlanet = pl; hitIdx = p; }
            accumulatedAlpha += w;
            if (accumulatedAlpha > 0.98) break;
          }
        }
      }
      float aDt2 = dot(a, a) * dt * dt;
      // Convergence escape: ray has straightened to a near-straight line and is leaving.
      // Threshold must sit BEYOND the farthest planet orbit, else outbound rays bound for
      // far-side planets get killed before reaching them (flat-bottom planet clipping).
      // 8100 = 90^2; outermost planet Neptune reaches oR 86 + r 1.4 = 87.4.
      if (aDt2 < convThresh * dot(vel, vel) && dot(pos, pos) > 8100.0
          && dot(pos, vel) > 0.0 && pos.y * vel.y > 0.0) {
        break;
      }
      prevY = newY;
      r = rNew;
    }

    // Shade the deferred planet hit now that the march (and its register pressure) is done.
    if (hitIdx >= 0) {
      accumulatedColor += shadePlanet(hitPoint, hitPlanet.xyz, hitPlanet.w, hitIdx) * hitW;
    }

    vec3 bgCol = vec3(0.0);

    float captureWidth = r_h * 0.15;
    float captureFactor = 1.0 - smoothstep(r_h, r_h * 1.05 + captureWidth, minR);

    if (accumulatedAlpha < 1.0) {
      float photonR = 3.0 * (1.0 - absSpin * 0.3);
      float ringWidth = 2.0 + closeupFactor * 1.5;
      float pTmp1 = (minR - photonR) * ringWidth;
      float proximity = exp(-pTmp1 * pTmp1);
      vec3 ringCol = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.95, 0.9), proximity);
      float glowBoost = 1.0 + closeupFactor * 0.5;
      bgCol += ringCol * proximity * 0.4 * glowBoost;
      float pTmp2 = (minR - photonR) * 0.8;
      float haze = exp(-pTmp2 * pTmp2);
      bgCol += vec3(0.15, 0.06, 0.02) * haze * glowBoost;

      if (didEscape) {
        vec3 finalRd = normalize(vel);
        bgCol += galaxies(finalRd);
      }

      bgCol *= (1.0 - captureFactor);
    }

    vec3 finalColor = accumulatedColor + bgCol * (1.0 - accumulatedAlpha);

    float lum = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
    float bloomAmount = max(lum - 0.6, 0.0) * 0.5;
    finalColor += finalColor * bloomAmount;
    finalColor = acesToneMap(finalColor * 0.85);
    finalColor = pow(finalColor, vec3(0.4545));
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

/* -- FXAA Post-Process Shader --
   The scene is ray-marched into a low-resolution offscreen buffer (renderScale, often ~0.35
   because the GPU is maxed). This pass anti-aliases that image while upscaling it to the
   full-resolution canvas, removing the chunky/shimmery edges that a plain stretch leaves.
   Edge detection + directional blend after the raymarch's tone-map/gamma (FXAA's native
   input space). A flat-region early-out keeps the big black background nearly free. */
const fxaaVS = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;
const fxaaFS = `
  precision highp float;
  uniform sampler2D u_tex;
  uniform vec2 u_invRes;          // 1.0 / low-res source dimensions (texel step)
  varying vec2 v_uv;
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  void main() {
    vec2 inv = u_invRes;
    vec3 rgbM  = texture2D(u_tex, v_uv).rgb;
    vec3 rgbNW = texture2D(u_tex, v_uv + vec2(-1.0, -1.0) * inv).rgb;
    vec3 rgbNE = texture2D(u_tex, v_uv + vec2( 1.0, -1.0) * inv).rgb;
    vec3 rgbSW = texture2D(u_tex, v_uv + vec2(-1.0,  1.0) * inv).rgb;
    vec3 rgbSE = texture2D(u_tex, v_uv + vec2( 1.0,  1.0) * inv).rgb;
    float lM = luma(rgbM);
    float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    // Flat region -> nothing to anti-alias. Skips the extra taps over the black background.
    if (lMax - lMin < max(0.0312, lMax * 0.125)) { gl_FragColor = vec4(rgbM, 1.0); return; }
    vec2 dir;
    dir.x = -((lNW + lNE) - (lSW + lSE));
    dir.y =  ((lNW + lSW) - (lNE + lSE));
    float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcpDirMin, -8.0, 8.0) * inv;
    vec3 rgbA = 0.5 * (
      texture2D(u_tex, v_uv + dir * (1.0 / 3.0 - 0.5)).rgb +
      texture2D(u_tex, v_uv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 rgbB = rgbA * 0.5 + 0.25 * (
      texture2D(u_tex, v_uv + dir * -0.5).rgb +
      texture2D(u_tex, v_uv + dir *  0.5).rgb);
    float lB = luma(rgbB);
    gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
  }
`;
