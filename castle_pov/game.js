/* Castle Siege 3D — first-person variant of castle_siege/. Same simulation
   (weighted-Dijkstra breach pathfinding over destructible walls, 50 waves,
   towers, knights, economy) ported verbatim in its original 2D "pixel" units;
   only rendering and player physics live in 3D world units. Renderer ported
   from fps/index.html (WebGL2, CPU-transformed box soup, one VBO per material).
   Sim→world mapping: wx = simX * S, wz = simY * S with S = 0.1 (TILE 40 → 4.0). */
(() => {
  'use strict';

  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
  if (!gl) { document.body.textContent = 'WebGL 2 required'; return; }
  const $ = id => document.getElementById(id);

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  addEventListener('resize', resize);
  resize();

  // ── Shaders ─────────────────────────────────────────────────────────────────
  const FOG_SNIPPET = `
  float dist = length(vWorldPos - uEye);
  float fog = exp(-dist * 0.004);
  col = mix(vec3(0.62, 0.76, 0.92), col, fog);`;

  const worldVS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
uniform mat4 uVP;
out vec3 vWorldPos;
out vec3 vNorm;
void main() {
  vWorldPos = aPos;
  vNorm = aNorm;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

  const skyVS = `#version 300 es
out vec2 vUV;
void main() {
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  vUV = vec2(x, y) * 0.5 + 0.5;
  gl_Position = vec4(x, y, 0.9999, 1.0);
}`;

  const skyFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform vec3 uSunDir;
out vec4 fragColor;
void main() {
  float t = vUV.y;
  vec3 horizon = vec3(0.62, 0.76, 0.92);
  vec3 zenith  = vec3(0.22, 0.42, 0.78);
  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.7, t));
  float sunDot = max(dot(normalize(vec3(vUV.x - 0.5, t - 0.3, 0.5)), uSunDir), 0.0);
  col += vec3(1.0, 0.95, 0.8) * pow(sunDot, 32.0) * 0.3;
  fragColor = vec4(col, 1.0);
}`;

  // Flat battlefield: grass noise, faint 4-unit grid, and a scorched red-brown
  // border ring marking the outer enemy-territory cells (unbuildable).
  const groundFS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
uniform vec3 uEye;
uniform vec3 uSunDir;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
void main() {
  float n1 = vnoise(vWorldPos.xz * 0.5);
  float n2 = vnoise(vWorldPos.xz * 2.3);
  float detail = n1 * 0.6 + n2 * 0.4;
  vec3 col = mix(vec3(0.14, 0.31, 0.08), vec3(0.24, 0.45, 0.13), detail);
  bool border = vWorldPos.x < 4.0 || vWorldPos.x > 92.0 || vWorldPos.z < 4.0 || vWorldPos.z > 60.0;
  if (border) col = mix(col, vec3(0.32, 0.15, 0.10), 0.75);
  vec2 g = fract(vWorldPos.xz / 4.0);
  float line = max(max(smoothstep(0.04, 0.0, g.x), smoothstep(0.96, 1.0, g.x)),
                   max(smoothstep(0.04, 0.0, g.y), smoothstep(0.96, 1.0, g.y)));
  col *= 1.0 - 0.13 * line;
  float diff = max(dot(normalize(vNorm), uSunDir), 0.0);
  col *= 0.30 + 0.70 * diff;
  ${FOG_SNIPPET}
  fragColor = vec4(col, 1.0);
}`;

  // Castle stone — the only 28-byte-stride material: per-vertex damage (0..1)
  // darkens and reddens battered structures.
  const stoneVS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in float aDmg;
uniform mat4 uVP;
out vec3 vWorldPos;
out vec3 vNorm;
out float vDmg;
void main() {
  vWorldPos = aPos;
  vNorm = aNorm;
  vDmg = aDmg;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

  const stoneFS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
in float vDmg;
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform vec3 uTint;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 N = normalize(vNorm);
  float detail = hash(floor(vWorldPos.xz * 3.0 + vWorldPos.yy * 2.0));
  vec3 col = uTint * (1.0 + 0.14 * (detail - 0.5));
  col *= 0.7 + 0.3 * max(N.y, 0.0);
  col = mix(col, vec3(0.15, 0.06, 0.05), vDmg * 0.65);
  float diff = max(dot(N, uSunDir), 0.0);
  col *= 0.30 + 0.70 * diff;
  ${FOG_SNIPPET}
  fragColor = vec4(col, 1.0);
}`;

  // Generic tinted material (actors, projectiles, ghosts, routes, effects).
  const tintFS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform vec3 uTint;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNorm);
  float detail = fract(sin(dot(floor(vWorldPos.xz * 2.0 + vWorldPos.yy), vec2(127.1,311.7))) * 43758.5453);
  float diff = max(dot(N, uSunDir), 0.0);
  vec3 col = uTint * (1.0 + 0.18 * (detail - 0.5));
  col *= 0.28 + 0.72 * diff;
  ${FOG_SNIPPET}
  fragColor = vec4(col, uAlpha);
}`;

  // Viewmodel (sword/crossbow) — rendered in view space, no fog.
  const vmVS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
uniform mat4 uProj;
uniform mat4 uModel;
out vec3 vNorm;
void main() {
  vec4 vp = uModel * vec4(aPos, 1.0);
  vNorm = mat3(uModel) * aNorm;
  gl_Position = uProj * vp;
}`;

  const vmFS = `#version 300 es
precision highp float;
in vec3 vNorm;
uniform vec3 uSunDir;
uniform vec3 uTint;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNorm);
  float diff = max(dot(N, uSunDir), 0.0);
  vec3 col = uTint * (0.35 + 0.65 * diff);
  fragColor = vec4(col, 1.0);
}`;

  function compileShader(src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  function linkProgram(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(vs, gl.VERTEX_SHADER));
    gl.attachShader(p, compileShader(fs, gl.FRAGMENT_SHADER));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
    return p;
  }
  const uni = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));

  const skyProg = linkProgram(skyVS, skyFS);
  const skyU = uni(skyProg, ['uSunDir']);
  const groundProg = linkProgram(worldVS, groundFS);
  const groundU = uni(groundProg, ['uVP', 'uEye', 'uSunDir']);
  const stoneProg = linkProgram(stoneVS, stoneFS);
  const stoneU = uni(stoneProg, ['uVP', 'uEye', 'uSunDir', 'uTint']);
  const tintProg = linkProgram(worldVS, tintFS);
  const tintU = uni(tintProg, ['uVP', 'uEye', 'uSunDir', 'uTint', 'uAlpha']);
  const vmProg = linkProgram(vmVS, vmFS);
  const vmU = uni(vmProg, ['uProj', 'uModel', 'uSunDir', 'uTint']);

  const sunDir = new Float32Array([0.4, 0.75, 0.3]);
  { const l = Math.hypot(sunDir[0], sunDir[1], sunDir[2]); sunDir[0] /= l; sunDir[1] /= l; sunDir[2] /= l; }

  // ── Matrix math (fps/index.html port; lookDir now normalizes, zero allocs) ──
  const M_PROJ = new Float32Array(16), M_VIEW = new Float32Array(16),
        M_VP = new Float32Array(16), M_VM = new Float32Array(16);
  function perspective(out, fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) * nf; out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  }
  function lookDir(out, eye, dir, up) {
    const f = [dir[0], dir[1], dir[2]]; normalize3(f);
    const r = cross(f, up); normalize3(r);
    const u = cross(r, f);
    out[0] = r[0]; out[1] = u[0]; out[2] = -f[0]; out[3] = 0;
    out[4] = r[1]; out[5] = u[1]; out[6] = -f[1]; out[7] = 0;
    out[8] = r[2]; out[9] = u[2]; out[10] = -f[2]; out[11] = 0;
    out[12] = -dot3(r, eye); out[13] = -dot3(u, eye); out[14] = dot3(f, eye); out[15] = 1;
    return out;
  }
  function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  function normalize3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0]/=l; v[1]/=l; v[2]/=l; }
  function mul4(out, a, b) {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        out[j*4+i] = a[i]*b[j*4] + a[4+i]*b[j*4+1] + a[8+i]*b[j*4+2] + a[12+i]*b[j*4+3];
    return out;
  }

  // ── Box helper + template stamping ──────────────────────────────────────────
  function makeBox(x0, y0, z0, x1, y1, z1) {
    const F = [
      [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],
      [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1]],
      [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0]],
      [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]],
      [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0]],
      [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]],
    ];
    const o = [];
    for (const [a, b, c, d, n] of F)
      for (const p of [a, b, c, a, c, d]) o.push(...p, ...n);
    return o;
  }

  // Yaw-rotate + translate a 6-float-stride template into a 6-float buffer.
  function stampRot(tpl, buf, vertOffset, wx, wy, wz, cosR, sinR) {
    const vCount = tpl.length / 6;
    for (let v = 0; v < vCount; v++) {
      const si = v * 6, di = (vertOffset + v) * 6;
      const lx = tpl[si], lz = tpl[si + 2];
      buf[di]     = lx * cosR - lz * sinR + wx;
      buf[di + 1] = tpl[si + 1] + wy;
      buf[di + 2] = lx * sinR + lz * cosR + wz;
      const nx = tpl[si + 3], nz = tpl[si + 5];
      buf[di + 3] = nx * cosR - nz * sinR;
      buf[di + 4] = tpl[si + 4];
      buf[di + 5] = nx * sinR + nz * cosR;
    }
    return vertOffset + vCount;
  }

  function makeVao(vbo, stride, hasDmg) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    if (hasDmg) {
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
    }
    return vao;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SIMULATION — ported from castle_siege/game.js. Everything below runs in the
  //  original 2D pixel units (TILE=40, world 960×640). Do not rescale.
  // ════════════════════════════════════════════════════════════════════════════

  // ── Grid / geometry ─────────────────────────────────────────────────────────
  const TILE = 40, COLS = 24, ROWS = 16;
  const center = (c, r) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const idx = (c, r) => r * COLS + c;
  const inBounds = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  const isBorder = (c, r) => c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1;

  const KEEP_C = 11, KEEP_R = 7;
  const KEEP_CELLS = [[11, 7], [12, 7], [11, 8], [12, 8]];
  const isKeepCell = (c, r) => c >= KEEP_C && c <= KEEP_C + 1 && r >= KEEP_R && r <= KEEP_R + 1;
  const KEEP_X = (KEEP_C + 1) * TILE, KEEP_Y = (KEEP_R + 1) * TILE;

  // ── Config ──────────────────────────────────────────────────────────────────
  const MAX_WAVES = 50, AUTO_DELAY = 5;
  const MAX_IN_FLIGHT = 3;
  const SPLASH_MAX = 5;
  const HP_BUCKET = 25, BREACH_STEP = 3;

  const DIFFICULTIES = {
    easy:   { name: 'EASY',   gold: 220, keepHp: 150, hpMul: 1.00, spdMul: 1.00, rewardMul: 1.00, bonusMul: 1.00 },
    normal: { name: 'NORMAL', gold: 180, keepHp: 120, hpMul: 1.35, spdMul: 1.08, rewardMul: 0.90, bonusMul: 0.85 },
    hard:   { name: 'HARD',   gold: 150, keepHp: 90,  hpMul: 1.80, spdMul: 1.16, rewardMul: 0.80, bonusMul: 0.70 },
    insane: { name: 'INSANE', gold: 120, keepHp: 60,  hpMul: 2.50, spdMul: 1.25, rewardMul: 0.72, bonusMul: 0.60 },
  };

  const BUILDS = {
    wall:     { name: 'Wall',     cost: 5,  hp: 100 },
    gate:     { name: 'Gate',     cost: 12, hp: 80 },
    archer:   { name: 'Archer',   cost: 40, hp: 120, isTower: true, range: 120, fireRate: 400,  damage: 9,  projSpeed: 480, kind: 'arrow', tint: [0.47, 0.86, 0.59] },
    mage:     { name: 'Mage',     cost: 70, hp: 100, isTower: true, range: 110, fireRate: 700,  damage: 6,  projSpeed: 300, kind: 'bolt', slowMul: 0.5, slowDur: 1200, tint: [0.47, 0.78, 1.0] },
    catapult: { name: 'Catapult', cost: 90, hp: 150, isTower: true, range: 150, fireRate: 1600, damage: 30, projSpeed: 240, kind: 'rock', splash: 55, tint: [1.0, 0.63, 0.31] },
  };
  const LVL_DMG = [0, 1, 1.65, 2.5], LVL_RANGE = [0, 0, 12, 24], LVL_RATE = [0, 1, 0.85, 0.72];

  const ENEMIES = {
    raider:  { name: 'Raider',  hp: 35,   speed: 60,  reward: 7,   bDmg: 6,  atkGap: 0.8, size: 11, tint: [0.84, 0.37, 0.27] },
    runner:  { name: 'Runner',  hp: 16,   speed: 130, reward: 6,   bDmg: 3,  atkGap: 0.7, size: 9,  tint: [0.94, 0.86, 0.35] },
    sapper:  { name: 'Sapper',  hp: 45,   speed: 55,  reward: 12,  bDmg: 25, atkGap: 1.0, size: 10, tint: [1.0, 0.59, 0.24] },
    ogre:    { name: 'Ogre',    hp: 170,  speed: 34,  reward: 20,  bDmg: 20, atkGap: 1.2, size: 15, tint: [0.59, 0.69, 0.43] },
    warlord: { name: 'Warlord', hp: 1400, speed: 28,  reward: 200, bDmg: 60, atkGap: 1.5, size: 21, tint: [0.78, 0.35, 0.86] },
  };
  const ENEMY_TYPES = ['raider', 'runner', 'sapper', 'ogre', 'warlord'];
  const KNIGHT = { cost: 30, hp: 90, speed: 85, dmg: 8, atkGap: 0.5, aggro: 110, leash: 150, size: 9, max: 10, tint: [0.24, 0.55, 1.0] };

  // ── State ───────────────────────────────────────────────────────────────────
  let gold, score, wave, keep, grid, buildings, enemies, knights, projectiles, effects;
  let started, paused, ended, victory;
  let spawnGroups, lastBonusedWave, autoTimer, nextSpawns;
  let selectedBuild, selectedBldg;
  let now = 0;
  let diffKey = 'easy';
  const diff = () => DIFFICULTIES[diffKey];

  let distField = new Float64Array(COLS * ROWS);
  let routes = [];
  let flowDirty = false;
  let castleDirty = true;   // castle VBO needs rebuild
  let routesDirty = true;   // route-ribbon VBO needs rebuild

  function reset() {
    const d = diff();
    gold = d.gold; score = 0; wave = 0;
    keep = { kind: 'keep', c: KEEP_C, r: KEEP_R, x: KEEP_X, y: KEEP_Y, hp: d.keepHp, maxHp: d.keepHp };
    grid = new Array(COLS * ROWS).fill(null);
    for (const [c, r] of KEEP_CELLS) grid[idx(c, r)] = keep;
    buildings = []; enemies = []; knights = []; projectiles = []; effects = [];
    started = false; paused = false; ended = false; victory = false;
    spawnGroups = []; lastBonusedWave = 0; autoTimer = -1;
    selectedBuild = null; selectedBldg = null;
    nextSpawns = pickSpawns(1);
    recomputeFlow(); flowDirty = false;
    castleDirty = true; routesDirty = true;
    resetPlayer();
    syncHud(); syncPalette(); syncDiff();
  }

  // ── Pathfinding: weighted Dijkstra flow field ───────────────────────────────
  function cellCost(c, r) {
    const b = grid[idx(c, r)];
    if (!b) return 1;
    if (b.kind === 'keep') return 1;
    if (b.kind === 'gate' && b.open) return 1;
    return 1 + Math.ceil(b.hp / HP_BUCKET) * BREACH_STEP;
  }

  function computeField() {
    const n = COLS * ROWS;
    const d = new Float64Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    for (const [c, r] of KEEP_CELLS) d[idx(c, r)] = 0;
    for (let iter = 0; iter < n; iter++) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && d[i] < bd) { bd = d[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      const uc = u % COLS, ur = (u / COLS) | 0;
      const viaU = bd + cellCost(uc, ur);
      for (const [dc, dr] of DIRS) {
        const nc = uc + dc, nr = ur + dr;
        if (!inBounds(nc, nr)) continue;
        const ni = idx(nc, nr);
        if (!done[ni] && d[ni] > viaU) d[ni] = viaU;
      }
    }
    distField = d;
  }

  const distAt = (c, r) => (inBounds(c, r) ? distField[idx(c, r)] : Infinity);

  function flowNext(c, r, lastDir) {
    let best = null, bestScore = Infinity;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (!inBounds(nc, nr)) continue;
      const nd = distField[idx(nc, nr)];
      if (nd === Infinity) continue;
      const score = nd + cellCost(nc, nr);
      if (score < bestScore ||
          (score === bestScore && lastDir && dc === lastDir.dc && dr === lastDir.dr)) {
        bestScore = score; best = { c: nc, r: nr, dc, dr };
      }
    }
    return best;
  }

  function traceRoute(sc, sr) {
    const pts = [center(sc, sr)], breaches = [];
    let c = sc, r = sr, last = null, guard = 0;
    while (!isKeepCell(c, r) && guard++ < COLS * ROWS) {
      const nx = flowNext(c, r, last);
      if (!nx) break;
      last = { dc: nx.dc, dr: nx.dr };
      c = nx.c; r = nx.r;
      pts.push(center(c, r));
      const b = grid[idx(c, r)];
      if (b && b.kind !== 'keep' && !(b.kind === 'gate' && b.open)) breaches.push(center(c, r));
    }
    return { pts, breaches };
  }

  function activeSpawns() {
    const seen = new Set(), out = [];
    const add = s => { const k = s.c + ',' + s.r; if (!seen.has(k)) { seen.add(k); out.push(s); } };
    for (const g of spawnGroups) for (const s of g.spawns) add(s);
    for (const s of nextSpawns) add(s);
    return out;
  }

  function recomputeFlow() {
    computeField();
    routes = activeSpawns().map(s => traceRoute(s.c, s.r));
    routesDirty = true;
    for (const e of enemies) if (!e.dead) { e.tgt = null; e.prevAttack = e.attackTarget || e.prevAttack; e.attackTarget = null; }
  }

  function markFlowDirty() { flowDirty = true; }

  function assignTarget(e) {
    const nx = flowNext(e.cellC, e.cellR, e.lastDir);
    if (!nx) return;
    const prev = e.prevAttack; e.prevAttack = null;
    const b = grid[idx(nx.c, nx.r)];
    if (b && !(b.kind === 'gate' && b.open)) {
      e.attackTarget = b;
      if (b !== prev) e.atkTimer = 0;
      e.attackDir = { dc: nx.dc, dr: nx.dr };
      return;
    }
    const p = center(nx.c, nx.r);
    e.tgt = { x: p.x, y: p.y, c: nx.c, r: nx.r, dir: { dc: nx.dc, dr: nx.dr } };
  }

  // ── Waves ───────────────────────────────────────────────────────────────────
  function buildWave(n) {
    const q = [];
    const push = (type, count, gap) => { for (let i = 0; i < count; i++) q.push({ type, gap }); };
    const isBoss = n % 10 === 0;
    const rush = n % 5 === 0 && !isBoss;
    const heavy = n % 7 === 0 && !isBoss;
    push('raider', Math.min(7 + Math.floor(n * 0.85), 30), Math.max(0.3, 0.7 - n * 0.004));
    if (n >= 2) push('runner', Math.min(3 + Math.floor(n * 0.5) + (rush ? 12 : 0), 30), Math.max(0.2, 0.45 - n * 0.003));
    if (n >= 4) push('sapper', Math.min(1 + Math.floor(n / 4) + (heavy ? 5 : 0), 16), Math.max(0.5, 1.0 - n * 0.005));
    if (n >= 6) push('ogre', Math.min(1 + Math.floor(n / 6) + (heavy ? 4 : 0), 14), Math.max(0.55, 1.1 - n * 0.006));
    if (isBoss) push('warlord', Math.min(1 + Math.floor(n / 30), 4), 2.2);
    return q;
  }

  function wavesInFlight() {
    const set = new Set();
    for (const g of spawnGroups) if (g.index < g.queue.length) set.add(g.wave);
    for (const e of enemies) set.add(e.wave);
    return set.size;
  }

  function pickSpawns(n) {
    const perEdge = n >= 12 ? 2 : 1;
    const pts = [];
    for (let k = 0; k < perEdge; k++) {
      pts.push({ c: 1 + Math.floor(Math.random() * (COLS - 2)), r: 0 });
      pts.push({ c: 1 + Math.floor(Math.random() * (COLS - 2)), r: ROWS - 1 });
      pts.push({ c: 0, r: 1 + Math.floor(Math.random() * (ROWS - 2)) });
      pts.push({ c: COLS - 1, r: 1 + Math.floor(Math.random() * (ROWS - 2)) });
    }
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    return pts;
  }

  function startWave() {
    if (ended || wave >= MAX_WAVES) return;
    if (wavesInFlight() >= MAX_IN_FLIGHT) return;
    const wasIdle = !started && wave === 0;
    started = true;
    autoTimer = -1;
    wave++;
    spawnGroups.push({ queue: buildWave(wave), index: 0, timer: 999, wave, spawns: nextSpawns });
    nextSpawns = pickSpawns(wave + 1);
    markFlowDirty();
    if (wasIdle) syncDiff();
    showBanner(wave % 10 === 0 ? 'WARLORD WAVE ' + wave : 'WAVE ' + wave);
    syncHud();
  }

  function spawnEnemy(type, waveNum, sp) {
    const base = ENEMIES[type], d = diff();
    const hpScale = type === 'warlord' ? 1 + (waveNum - 1) * 0.07 : 1 + (waveNum - 1) * 0.11;
    const hp = Math.round(base.hp * hpScale * d.hpMul);
    const reward = Math.max(1, Math.round(base.reward * (1 + (waveNum - 1) * 0.035) * d.rewardMul));
    const dc = sp.c === 0 ? 1 : sp.c === COLS - 1 ? -1 : 0;
    const dr = sp.r === 0 ? 1 : sp.r === ROWS - 1 ? -1 : 0;
    const p = center(sp.c, sp.r);
    enemies.push({
      type, wave: waveNum,
      x: p.x - dc * TILE, y: p.y - dr * TILE,
      cellC: sp.c - dc, cellR: sp.r - dr,
      tgt: { x: p.x, y: p.y, c: sp.c, r: sp.r, dir: { dc, dr } },
      lastDir: { dc, dr },
      hp, maxHp: hp, speed: base.speed * d.spdMul, reward,
      bDmg: base.bDmg, atkGap: base.atkGap, atkTimer: 0, attackTarget: null, attackDir: null, prevAttack: null,
      size: base.size, tint: base.tint, face: Math.atan2(dr, dc),
      traveled: 0, exitDist: Infinity, slowUntil: 0, slowMul: 1, pinUntil: 0, dead: false, hitFlash: 0,
      provoked: false, pAtkTimer: 0,
    });
  }

  // ── Combat helpers ──────────────────────────────────────────────────────────
  function towerStat(t) {
    const b = BUILDS[t.kind], L = t.level;
    return {
      range: b.range + LVL_RANGE[L],
      damage: b.damage * LVL_DMG[L],
      fireRate: b.fireRate * LVL_RATE[L],
    };
  }

  function findTarget(t, range) {
    let best = null, bestProg = Infinity, bestTrav = -1;
    const r2 = range * range;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - t.x, dy = e.y - t.y;
      if (dx * dx + dy * dy > r2) continue;
      if (e.exitDist < bestProg || (e.exitDist === bestProg && e.traveled > bestTrav)) {
        best = e; bestProg = e.exitDist; bestTrav = e.traveled;
      }
    }
    return best;
  }

  function damageEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hitFlash = now + 60;
    if (e.hp <= 0) {
      e.dead = true;
      gold += e.reward; score += e.reward;
      effects.push({ kind: 'boom', x: e.x, y: e.y, r0: e.size, r1: e.size + 18, t0: now, dur: 320, tint: e.tint });
    }
  }

  // Single funnel for all structure damage — owns the bucket-crossing re-plan rule.
  function damageBuilding(b, dmg) {
    const oldBucket = Math.ceil(b.hp / HP_BUCKET);
    b.hp -= dmg;
    if (b.kind === 'keep') {
      if (b.hp <= 0) { b.hp = 0; ended = true; victory = false; }
      if (Math.ceil(b.hp / HP_BUCKET) !== oldBucket) castleDirty = true;
      syncHud();
      return;
    }
    if (b.hp <= 0) destroyBuilding(b);
    else if (Math.ceil(b.hp / HP_BUCKET) !== oldBucket) { markFlowDirty(); castleDirty = true; }
  }

  function destroyBuilding(b) {
    b.removed = true;
    grid[idx(b.c, b.r)] = null;
    buildings = buildings.filter(x => x !== b);
    effects.push({ kind: 'dust', x: b.x, y: b.y, t0: now, dur: 450 });
    if (selectedBldg === b) selectedBldg = null;
    markFlowDirty();
    castleDirty = true;
  }

  // ── Knights ─────────────────────────────────────────────────────────────────
  function knightPlaceable(c, r) {
    return inBounds(c, r) && !isBorder(c, r) && !grid[idx(c, r)] && !enemyInCell(c, r) && !knightInCell(c, r);
  }
  function knightInCell(c, r) {
    return knights.some(k => !k.dead && Math.floor(k.x / TILE) === c && Math.floor(k.y / TILE) === r);
  }

  function placeKnight(c, r) {
    if (!knightPlaceable(c, r) || gold < KNIGHT.cost || knights.length >= KNIGHT.max) return;
    gold -= KNIGHT.cost;
    const p = center(c, r);
    knights.push({
      x: p.x, y: p.y, postX: p.x, postY: p.y,
      hp: KNIGHT.hp, maxHp: KNIGHT.hp, face: 0,
      target: null, atkTimer: 0, hurtTimer: 0, dead: false, hitFlash: 0,
    });
    syncHud();
  }

  // Straight-line steps with axis slide; never into a closed building cell.
  // Shared by knights and provoked enemies chasing the player.
  function moveActor(k, mx, my) {
    const tryMove = (nx, ny) => {
      const c = Math.floor(nx / TILE), r = Math.floor(ny / TILE);
      if (!inBounds(c, r)) return false;
      const b = grid[idx(c, r)];
      if (b && !(b.kind === 'gate' && b.open)) return false;
      k.x = nx; k.y = ny; return true;
    };
    if (!tryMove(k.x + mx, k.y + my) && !tryMove(k.x + mx, k.y)) tryMove(k.x, k.y + my);
  }

  function updateKnights(dt) {
    for (const k of knights) {
      if (k.dead) continue;
      let t = k.target;
      if (t) {
        const dx = t.x - k.postX, dy = t.y - k.postY;
        if (t.dead || dx * dx + dy * dy > KNIGHT.leash * KNIGHT.leash) t = null;
      }
      if (!t) {
        let bestD = KNIGHT.aggro * KNIGHT.aggro;
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - k.postX, dy = e.y - k.postY;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; t = e; }
        }
      }
      if (t !== k.target) { k.atkTimer = 0; k.hurtTimer = 0; }
      k.target = t;
      if (t) {
        const dx = t.x - k.x, dy = t.y - k.y;
        const d = Math.hypot(dx, dy);
        k.face = Math.atan2(dy, dx);
        const reach = KNIGHT.size + t.size + 3;
        if (d > reach) {
          moveActor(k, (dx / d) * KNIGHT.speed * dt, (dy / d) * KNIGHT.speed * dt);
        } else {
          t.pinUntil = now + 150;
          k.atkTimer += dt;
          if (k.atkTimer >= KNIGHT.atkGap) { k.atkTimer -= KNIGHT.atkGap; damageEnemy(t, KNIGHT.dmg); }
          k.hurtTimer += dt;
          if (k.hurtTimer >= t.atkGap) {
            k.hurtTimer -= t.atkGap;
            k.hp -= t.bDmg; k.hitFlash = now + 60;
            if (k.hp <= 0) {
              k.dead = true;
              effects.push({ kind: 'boom', x: k.x, y: k.y, r0: KNIGHT.size, r1: KNIGHT.size + 16, t0: now, dur: 320, tint: KNIGHT.tint });
            }
          }
        }
      } else {
        k.atkTimer = 0; k.hurtTimer = 0;
        const dx = k.postX - k.x, dy = k.postY - k.y;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          k.face = Math.atan2(dy, dx);
          const step = Math.min(KNIGHT.speed * dt, d);
          moveActor(k, (dx / d) * step, (dy / d) * step);
        }
      }
    }
  }

  function fire(t, target) {
    const s = towerStat(t);
    const b = BUILDS[t.kind];
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    projectiles.push({
      x: t.x, y: t.y, target, tx: target.x, ty: target.y,
      speed: b.projSpeed, damage: s.damage, kind: b.kind,
      splash: b.splash || 0, slowMul: b.slowMul || 0, slowDur: b.slowDur || 0,
      tint: b.tint, ang: t.angle, trav: 0,
      totDist: Math.hypot(target.x - t.x, target.y - t.y), dead: false,
    });
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function update(dt) {
    for (const g of spawnGroups) {
      if (g.index >= g.queue.length) continue;
      g.timer += dt;
      if (g.timer >= g.queue[g.index].gap) {
        spawnEnemy(g.queue[g.index].type, g.wave, g.spawns[g.index % g.spawns.length]);
        g.index++; g.timer = 0;
      }
    }

    updateKnights(dt);

    const psx = player.x / S, psy = player.z / S; // player position in sim units

    for (const e of enemies) {
      if (e.dead) continue;
      if (e.pinUntil > now) continue;

      // Provoked enemies break off the keep-rush to duel the player.
      if (e.provoked) {
        const pdx = psx - e.x, pdy = psy - e.y;
        const pd = Math.hypot(pdx, pdy);
        if (player.dead || pd > 100) {
          e.provoked = false;
          e.cellC = Math.floor(e.x / TILE); e.cellR = Math.floor(e.y / TILE);
          e.lastDir = null; e.tgt = null; e.attackTarget = null;
        } else {
          e.tgt = null; e.attackTarget = null;
          e.face = Math.atan2(pdy, pdx);
          const slow = e.slowUntil > now ? e.slowMul : 1;
          const reach = e.size + 14;
          if (pd > reach) {
            moveActor(e, (pdx / pd) * e.speed * slow * dt, (pdy / pd) * e.speed * slow * dt);
          } else {
            e.pAtkTimer += dt;
            if (e.pAtkTimer >= e.atkGap) { e.pAtkTimer -= e.atkGap; hurtPlayer(e.bDmg); }
          }
          e.cellC = Math.floor(e.x / TILE); e.cellR = Math.floor(e.y / TILE);
          e.exitDist = distAt(e.cellC, e.cellR);
          continue;
        }
      }

      if (e.attackTarget) {
        const b = e.attackTarget;
        if (b.removed || b.hp <= 0) { e.attackTarget = null; }
        else {
          e.atkTimer += dt;
          if (e.atkTimer >= e.atkGap) {
            e.atkTimer -= e.atkGap;
            effects.push({ kind: 'spark', x: (e.x + b.x) / 2, y: (e.y + b.y) / 2, t0: now, dur: 200 });
            damageBuilding(b, e.bDmg);
          }
          continue;
        }
      }
      const slow = e.slowUntil > now ? e.slowMul : 1;
      let step = e.speed * slow * dt;
      while (step > 0 && !e.dead) {
        if (!e.tgt && !e.attackTarget) assignTarget(e);
        if (!e.tgt) break;
        const dx = e.tgt.x - e.x, dy = e.tgt.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01) e.face = Math.atan2(dy, dx);
        if (d <= step) {
          e.x = e.tgt.x; e.y = e.tgt.y; e.traveled += d; step -= d;
          e.cellC = e.tgt.c; e.cellR = e.tgt.r; e.lastDir = e.tgt.dir;
          e.tgt = null;
        } else {
          e.x += (dx / d) * step; e.y += (dy / d) * step; e.traveled += step; step = 0;
        }
      }
      if (!e.dead) e.exitDist = distAt(e.cellC, e.cellR);
    }
    if (ended) { syncHud(); return; }

    // Towers fire
    for (const t of buildings) {
      if (!BUILDS[t.kind].isTower) continue;
      const s = towerStat(t);
      t.cd = (t.cd || 0) - dt * 1000;
      const target = findTarget(t, s.range);
      if (target) {
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        if (t.cd <= 0) { fire(t, target); t.cd = s.fireRate; }
      }
    }

    // Projectiles
    for (const p of projectiles) {
      if (p.dead) continue;
      if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step || d < 1) {
        p.dead = true;
        if (p.kind === 'rock') {
          effects.push({ kind: 'boom', x: p.tx, y: p.ty, r0: 4, r1: p.splash, t0: now, dur: 300, tint: p.tint });
          const r2 = p.splash * p.splash;
          const hits = [];
          for (const e of enemies) {
            if (e.dead) continue;
            const ex = e.x - p.tx, ey = e.y - p.ty;
            const d2 = ex * ex + ey * ey;
            if (d2 <= r2) hits.push({ e, d2 });
          }
          hits.sort((a, b) => a.d2 - b.d2);
          for (let i = 0; i < hits.length && i < SPLASH_MAX; i++) damageEnemy(hits[i].e, p.damage);
        } else if (p.target && !p.target.dead) {
          damageEnemy(p.target, p.damage);
          if (p.slowDur) { p.target.slowUntil = now + p.slowDur; p.target.slowMul = p.slowMul; }
        }
      } else {
        p.x += (dx / d) * step; p.y += (dy / d) * step; p.trav += step;
      }
    }

    // Cull
    enemies = enemies.filter(e => !e.dead);
    knights = knights.filter(k => !k.dead);
    projectiles = projectiles.filter(p => !p.dead);
    effects = effects.filter(f => now - f.t0 < f.dur);

    if (spawnGroups.some(g => g.index >= g.queue.length)) {
      spawnGroups = spawnGroups.filter(g => g.index < g.queue.length);
      markFlowDirty();
    }

    const clear = spawnGroups.length === 0 && enemies.length === 0;
    if (clear && started && !ended && lastBonusedWave < wave) {
      for (let w = lastBonusedWave + 1; w <= wave; w++) gold += Math.round((40 + w * 8) * diff().bonusMul);
      lastBonusedWave = wave;
      if (wave >= MAX_WAVES) { victory = true; ended = true; }
      else if (autoTimer < 0) autoTimer = AUTO_DELAY;
    }
    if (autoTimer >= 0 && !ended) {
      autoTimer -= dt;
      if (autoTimer <= 0) startWave();
    }

    syncHud();
  }

  // ── Build / interaction ─────────────────────────────────────────────────────
  function isOpenCell(c, r) {
    return inBounds(c, r) && !isBorder(c, r) && !grid[idx(c, r)];
  }
  function enemyInCell(c, r) {
    for (const e of enemies) {
      if (e.dead) continue;
      if ((e.cellC === c && e.cellR === r) || (e.tgt && e.tgt.c === c && e.tgt.r === r)) return true;
      if (Math.floor(e.x / TILE) === c && Math.floor(e.y / TILE) === r) return true;
    }
    return false;
  }
  function playerInCell(c, r) {
    return Math.floor(player.x / TILE3D) === c && Math.floor(player.z / TILE3D) === r;
  }
  // Buildable = open, and no live enemy/knight — or the player — in the cell.
  function isBuildable(c, r) {
    return isOpenCell(c, r) && !enemyInCell(c, r) && !knightInCell(c, r) && !playerInCell(c, r);
  }

  function placeBuilding(c, r) {
    const def = BUILDS[selectedBuild];
    if (!isBuildable(c, r) || gold < def.cost) return;
    const p = center(c, r);
    gold -= def.cost;
    const b = {
      kind: selectedBuild, c, r, x: p.x, y: p.y,
      hp: def.hp, maxHp: def.hp, level: 1, invested: def.cost,
      cd: 0, angle: -Math.PI / 2, open: false, removed: false,
    };
    grid[idx(c, r)] = b;
    buildings.push(b);
    markFlowDirty();
    castleDirty = true;
    syncHud();
  }

  function upgradeTower(t) {
    if (ended || !BUILDS[t.kind].isTower || t.level >= 3) return;
    const cost = Math.round(BUILDS[t.kind].cost * 0.75 * t.level);
    if (gold < cost) return;
    gold -= cost; t.invested += cost; t.level++;
    castleDirty = true;
    syncHud();
  }

  function sellBuilding(b) {
    if (ended || b.kind === 'keep') return;
    const refund = Math.round(b.invested * 0.6 * (b.hp / b.maxHp));
    gold += refund;
    b.removed = true;
    grid[idx(b.c, b.r)] = null;
    buildings = buildings.filter(x => x !== b);
    selectedBldg = null;
    markFlowDirty();
    castleDirty = true;
    syncHud();
  }

  function repairCost(b) {
    if (b.hp >= b.maxHp) return 0;
    if (b.kind === 'keep') return Math.ceil((b.maxHp - b.hp) * 0.5);
    return Math.max(1, Math.ceil((1 - b.hp / b.maxHp) * BUILDS[b.kind].cost * 0.6));
  }

  function repairBuilding(b) {
    const cost = repairCost(b);
    if (ended || !cost || gold < cost) return;
    const oldBucket = Math.ceil(b.hp / HP_BUCKET);
    gold -= cost;
    b.hp = b.maxHp;
    if (b.kind !== 'keep' && Math.ceil(b.hp / HP_BUCKET) !== oldBucket) markFlowDirty();
    castleDirty = true;
    syncHud();
  }

  function toggleGate(g) {
    if (ended || g.kind !== 'gate') return;
    if (g.open) {
      if (enemyInCell(g.c, g.r) || knightInCell(g.c, g.r) || playerInCell(g.c, g.r)) return;
      g.open = false;
    } else g.open = true;
    markFlowDirty();
    castleDirty = true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  3D WORLD — player, input, weapons, rendering (world units, y up, ground 0)
  // ════════════════════════════════════════════════════════════════════════════
  const S = 0.1, TILE3D = TILE * S;         // 4.0 world units per cell
  const EYE_H = 1.7, PLAYER_R = 0.35;
  const WALK = 7, SPRINT = 12, GRAV = 14, JUMP_V = 5.5;
  const BUILD_REACH = 12, SWORD_RANGE = 3.2, SWORD_DMG = 25, BOW_DMG = 12, BOW_RANGE = 60;
  const BLD_H = { wall: 2.9, gate: 2.8, archer: 3.9, mage: 5.6, catapult: 1.8, keep: 10.4 };

  const player = { x: 48, y: 0, z: 40, yaw: -Math.PI / 2, pitch: -0.05, vy: 0, onGround: true, hp: 100, dead: false, respawnT: 0 };
  const PITCH_LIMIT = Math.PI / 2 - 0.01;
  let hurtFlash = 0;

  function resetPlayer() {
    player.x = 48; player.z = 40; player.y = 0;
    player.yaw = -Math.PI / 2; player.pitch = -0.05;
    player.vy = 0; player.onGround = true;
    player.hp = 100; player.dead = false; player.respawnT = 0;
    hurtFlash = 0;
    weapon = 'sword'; swingTimer = 0; swordCd = 0; bowCd = 0; bowAnim = 0;
  }

  function blockedCell(c, r) {
    if (!inBounds(c, r)) return true; // world edge
    const b = grid[idx(c, r)];
    return !!(b && !(b.kind === 'gate' && b.open));
  }
  function posBlocked(wx, wz) {
    const c0 = Math.floor((wx - PLAYER_R) / TILE3D), c1 = Math.floor((wx + PLAYER_R) / TILE3D);
    const r0 = Math.floor((wz - PLAYER_R) / TILE3D), r1 = Math.floor((wz + PLAYER_R) / TILE3D);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (blockedCell(c, r)) return true;
    return false;
  }

  function updatePlayer(dt) {
    if (player.dead) {
      player.respawnT -= dt;
      if (player.respawnT <= 0) respawn();
      return;
    }
    const fwd = [Math.cos(player.yaw), 0, Math.sin(player.yaw)];
    const right = [-Math.sin(player.yaw), 0, Math.cos(player.yaw)];
    let mx = 0, mz = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    { mx += fwd[0]; mz += fwd[2]; }
    if (keys['KeyS'] || keys['ArrowDown'])  { mx -= fwd[0]; mz -= fwd[2]; }
    if (keys['KeyA'] || keys['ArrowLeft'])  { mx -= right[0]; mz -= right[2]; }
    if (keys['KeyD'] || keys['ArrowRight']) { mx += right[0]; mz += right[2]; }
    const l = Math.hypot(mx, mz);
    if (l > 0) {
      const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? SPRINT : WALK;
      const v = speed * dt / l;
      const nx = player.x + mx * v, nz = player.z + mz * v;
      if (!posBlocked(nx, player.z)) player.x = nx;
      if (!posBlocked(player.x, nz)) player.z = nz;
    }
    // gravity + jump (buildings are full-height blockers, so no roof-walking)
    if (keys['Space'] && player.onGround) { player.vy = JUMP_V; player.onGround = false; }
    if (!player.onGround) {
      player.vy -= GRAV * dt;
      player.y += player.vy * dt;
      if (player.y <= 0) { player.y = 0; player.vy = 0; player.onGround = true; }
    }
  }

  function hurtPlayer(d) {
    if (player.dead || ended) return;
    player.hp -= d;
    hurtFlash = 0.35;
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      player.respawnT = 4;
    }
    syncHud();
  }

  function respawn() {
    const spots = [[48, 40], [58, 32], [48, 24], [38, 32], [48, 44], [48, 20], [62, 32], [34, 32]];
    for (const [sx, sz] of spots) {
      if (!posBlocked(sx, sz)) { player.x = sx; player.z = sz; break; }
    }
    player.y = 0; player.vy = 0; player.onGround = true;
    player.hp = 100; player.dead = false;
    hurtFlash = 0;
    syncHud();
  }

  // ── Input ───────────────────────────────────────────────────────────────────
  const keys = {};
  let locked = false, inGame = false;
  const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  addEventListener('keydown', e => {
    if (locked && GAME_KEYS.has(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (!inGame || ended) return;
    switch (e.code) {
      case 'Digit1': selectBuild('wall'); break;
      case 'Digit2': selectBuild('gate'); break;
      case 'Digit3': selectBuild('archer'); break;
      case 'Digit4': selectBuild('mage'); break;
      case 'Digit5': selectBuild('catapult'); break;
      case 'Digit6': selectBuild('knight'); break;
      case 'KeyQ': if (selectedBuild) selectBuild(selectedBuild); break; // toggle off
      case 'KeyF': switchWeapon(); break;
      case 'KeyN': if (!paused) startWave(); break;
      case 'KeyP': setPause(!paused); break;
      // aimBldg can be one frame stale — a building razed this frame must not
      // still accept upgrade/repair/sell gold.
      case 'KeyE': if (!paused && aimBldg && !aimBldg.removed && aimBldg.kind === 'gate') toggleGate(aimBldg); break;
      case 'KeyU': if (!paused && aimBldg && !aimBldg.removed) upgradeTower(aimBldg); break;
      case 'KeyR': if (!paused && aimBldg && !aimBldg.removed) repairBuilding(aimBldg); break;
      case 'KeyX': if (!paused && aimBldg && !aimBldg.removed && aimBldg.kind !== 'keep') sellBuilding(aimBldg); break;
    }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function selectBuild(type) {
    selectedBuild = selectedBuild === type ? null : type;
    syncPalette();
  }
  function switchWeapon() {
    weapon = weapon === 'sword' ? 'bow' : 'sword';
    selectedBuild = null;
    syncPalette();
  }

  canvas.addEventListener('mousedown', e => {
    if (!locked) return;
    if (paused && !ended) { setPause(false); return; }
    if (paused || ended || player.dead) return;
    if (e.button === 2) { switchWeapon(); return; }
    if (e.button !== 0) return;
    if (selectedBuild) { tryPlace(); return; }
    attack();
  });
  addEventListener('contextmenu', e => e.preventDefault());

  addEventListener('mousemove', e => {
    if (!locked || paused) return;
    const mx = Math.max(-60, Math.min(60, e.movementX));
    const my = Math.max(-60, Math.min(60, e.movementY));
    player.yaw += mx * 0.002;
    player.pitch -= my * 0.002;
    player.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, player.pitch));
  });

  document.addEventListener('pointerlockchange', () => {
    locked = !!document.pointerLockElement;
    $('crosshair').style.display = locked ? 'block' : 'none';
    if (!locked) { for (const k in keys) keys[k] = false; }
    if (!locked && inGame && !ended) setPause(true);
  });
  document.addEventListener('pointerlockerror', () => {
    if (inGame && !ended) {
      $('pauseSub').textContent = 'Pointer lock failed — click again';
      setPause(true);
    }
  });

  function requestLock() { canvas.requestPointerLock(); }

  function setPause(v) {
    if (!inGame || ended) return;
    paused = v;
    $('pauseOverlay').classList.toggle('show', v);
    if (!v) {
      $('pauseSub').textContent = 'Click to resume';
      if (!locked) requestLock();
    }
  }

  // ── Aim: crosshair ray march against buildings and ground ───────────────────
  let aimBldg = null, aimCell = null;
  function viewDir() {
    return [
      Math.cos(player.pitch) * Math.cos(player.yaw),
      Math.sin(player.pitch),
      Math.cos(player.pitch) * Math.sin(player.yaw),
    ];
  }
  function computeAim() {
    aimBldg = null; aimCell = null;
    const dir = viewDir();
    const ex = player.x, ey = player.y + EYE_H, ez = player.z;
    for (let t = 0.4; t <= BUILD_REACH; t += 0.15) {
      const px = ex + dir[0] * t, py = ey + dir[1] * t, pz = ez + dir[2] * t;
      if (py <= 0) { // hit the ground: candidate build cell
        const c = Math.floor(px / TILE3D), r = Math.floor(pz / TILE3D);
        if (inBounds(c, r) && !isBorder(c, r) && !grid[idx(c, r)]) aimCell = { c, r };
        break;
      }
      const c = Math.floor(px / TILE3D), r = Math.floor(pz / TILE3D);
      if (inBounds(c, r)) {
        const b = grid[idx(c, r)];
        if (b && py < BLD_H[b.kind]) { aimBldg = b; break; }
      }
    }
    selectedBldg = aimBldg; // sim helpers key off selectedBldg
  }

  function tryPlace() {
    if (!aimCell || aimBldg) return;
    if (selectedBuild === 'knight') placeKnight(aimCell.c, aimCell.r);
    else placeBuilding(aimCell.c, aimCell.r);
  }

  // ── Weapons ─────────────────────────────────────────────────────────────────
  let weapon = 'sword';
  const SWING_DUR = 0.3;
  let swingTimer = 0, swordCd = 0, bowCd = 0, bowAnim = 0;

  function attack() {
    if (weapon === 'sword') {
      if (swordCd > 0) return;
      swordCd = 0.45;
      swingTimer = SWING_DUR;
      tryMelee();
    } else {
      if (bowCd > 0) return;
      bowCd = 0.8;
      bowAnim = 0.25;
      tryShoot();
    }
  }

  const enemyScale = e => (e.size / 11) * 1.17;

  // Melee cone test (fps/index.html): within range AND roughly in front.
  function tryMelee() {
    const dir = viewDir();
    const ex = player.x, ey = player.y + EYE_H, ez = player.z;
    let best = null, bestDist = SWORD_RANGE;
    for (const e of enemies) {
      if (e.dead) continue;
      const wx = e.x * S, wz = e.y * S, wy = 0.9 * enemyScale(e);
      const vx = wx - ex, vy = wy - ey, vz = wz - ez;
      const dist = Math.hypot(vx, vy, vz);
      if (dist > SWORD_RANGE) continue;
      const dot = (vx * dir[0] + vy * dir[1] + vz * dir[2]) / dist;
      if (dot < 0.4) continue;
      if (dist < bestDist) { bestDist = dist; best = e; }
    }
    if (best) {
      best.provoked = true;
      damageEnemy(best, SWORD_DMG);
    }
  }

  // Crossbow: hitscan. Walls stop bolts (coarse march), then analytic
  // ray-sphere against enemies (fps tryBreakRock pattern).
  function tryShoot() {
    const dir = viewDir();
    const ox = player.x, oy = player.y + EYE_H, oz = player.z;
    let tWall = BOW_RANGE;
    for (let t = 0.5; t <= BOW_RANGE; t += 0.5) {
      const px = ox + dir[0] * t, py = oy + dir[1] * t, pz = oz + dir[2] * t;
      if (py <= 0) { tWall = t; break; }
      const c = Math.floor(px / TILE3D), r = Math.floor(pz / TILE3D);
      if (!inBounds(c, r)) { tWall = t; break; }
      const b = grid[idx(c, r)];
      if (b && !(b.kind === 'gate' && b.open) && py < BLD_H[b.kind]) { tWall = t; break; }
    }
    let bestT = tWall, best = null;
    for (const e of enemies) {
      if (e.dead) continue;
      const sc = enemyScale(e);
      const wx = e.x * S, wz = e.y * S, wy = 0.85 * sc;
      const radius = Math.max(0.7, e.size * S * 1.3);
      const ocx = ox - wx, ocy = oy - wy, ocz = oz - wz;
      const b = 2 * (ocx * dir[0] + ocy * dir[1] + ocz * dir[2]);
      const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius;
      const disc = b * b - 4 * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / 2;
      if (t > 0 && t < bestT) { bestT = t; best = e; }
    }
    if (best) { best.provoked = true; damageEnemy(best, BOW_DMG); }
    // tracer effect (world-space endpoints)
    const rt = [-Math.sin(player.yaw), 0, Math.cos(player.yaw)];
    effects.push({
      kind: 'tracer', t0: now, dur: 130,
      ax: ox + rt[0] * 0.18 + dir[0] * 0.4, ay: oy - 0.14 + dir[1] * 0.4, az: oz + rt[2] * 0.18 + dir[2] * 0.4,
      bx: ox + dir[0] * bestT, by: oy + dir[1] * bestT, bz: oz + dir[2] * bestT,
    });
  }

  // ── Geometry: ground ────────────────────────────────────────────────────────
  const MAPW = COLS * TILE3D, MAPD = ROWS * TILE3D; // 96 × 64
  const groundVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, groundVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0,0,MAPD, 0,1,0,  MAPW,0,MAPD, 0,1,0,  MAPW,0,0, 0,1,0,
    0,0,MAPD, 0,1,0,  MAPW,0,0, 0,1,0,  0,0,0, 0,1,0,
  ]), gl.STATIC_DRAW);
  const groundVAO = makeVao(groundVBO, 24, false);
  const skyVAO = gl.createVertexArray();

  // ── Geometry: castle templates (local space, cell-centered) ─────────────────
  function merlons(y0, y1, ext, size) {
    const s = size, e = ext;
    return [
      ...makeBox(-e, y0, -e, -e + s, y1, -e + s), ...makeBox(e - s, y0, -e, e, y1, -e + s),
      ...makeBox(-e, y0, e - s, -e + s, y1, e), ...makeBox(e - s, y0, e - s, e, y1, e),
    ];
  }
  const WALL_T = new Float32Array([...makeBox(-1.9, 0, -1.9, 1.9, 2.2, 1.9), ...merlons(2.2, 2.9, 1.9, 0.8)]);
  const gatePosts = [
    ...makeBox(-1.9, 0, -1.9, -1.1, 2.3, -1.1), ...makeBox(1.1, 0, -1.9, 1.9, 2.3, -1.1),
    ...makeBox(-1.9, 0, 1.1, -1.1, 2.3, 1.9), ...makeBox(1.1, 0, 1.1, 1.9, 2.3, 1.9),
    ...makeBox(-1.9, 2.3, -1.9, 1.9, 2.8, 1.9),
  ];
  const GATE_OPEN_T = new Float32Array(gatePosts);
  const GATE_CLOSED_T = new Float32Array([...gatePosts, ...makeBox(-1.4, 0, -1.4, 1.4, 2.3, 1.4)]);
  function towerT(kind, level) {
    let a;
    if (kind === 'archer') {
      a = [...makeBox(-1.3, 0, -1.3, 1.3, 3.0, 1.3), ...makeBox(-1.7, 3.0, -1.7, 1.7, 3.4, 1.7), ...merlons(3.4, 3.9, 1.7, 0.55)];
      if (level >= 2) a.push(...makeBox(-1.45, 0.9, -1.45, 1.45, 1.15, 1.45));
      if (level >= 3) a.push(...makeBox(-1.45, 1.7, -1.45, 1.45, 1.95, 1.45));
    } else if (kind === 'mage') {
      a = [...makeBox(-0.95, 0, -0.95, 0.95, 4.2, 0.95), ...makeBox(-0.6, 4.2, -0.6, 0.6, 5.0, 0.6), ...makeBox(-0.3, 5.0, -0.3, 0.3, 5.6, 0.3)];
      if (level >= 2) a.push(...makeBox(-1.1, 1.2, -1.1, 1.1, 1.45, 1.1));
      if (level >= 3) a.push(...makeBox(-1.1, 2.2, -1.1, 1.1, 2.45, 1.1));
    } else { // catapult
      a = [...makeBox(-1.8, 0, -1.8, 1.8, 1.0, 1.8),
           ...makeBox(-0.9, 1.0, -1.2, -0.7, 1.5, 1.2), ...makeBox(0.7, 1.0, -1.2, 0.9, 1.5, 1.2),
           ...makeBox(-0.12, 1.2, -1.6, 0.12, 1.45, 1.6)];
      if (level >= 2) a.push(...makeBox(-1.85, 1.0, -1.85, 1.85, 1.2, 1.85));
      if (level >= 3) a.push(...makeBox(-0.3, 1.45, -0.3, 0.3, 1.9, 0.3));
    }
    return new Float32Array(a);
  }
  const TOWER_T = {};
  for (const k of ['archer', 'mage', 'catapult'])
    TOWER_T[k] = [null, towerT(k, 1), towerT(k, 2), towerT(k, 3)];
  const KEEP_T = new Float32Array([
    ...makeBox(-3.4, 0, -3.4, 3.4, 8, 3.4),
    ...makeBox(-2.7, 8, -2.7, 2.7, 9.6, 2.7),
    ...merlons(9.6, 10.4, 2.7, 0.8),
  ]);

  const CASTLE_KINDS = ['wall', 'gate', 'archer', 'mage', 'catapult', 'keep'];
  const STONE_TINT = {
    wall: [0.55, 0.53, 0.50], gate: [0.50, 0.40, 0.28], archer: [0.48, 0.58, 0.48],
    mage: [0.44, 0.50, 0.66], catapult: [0.60, 0.48, 0.36], keep: [0.62, 0.60, 0.58],
  };
  const MAX_CASTLE_VERTS = 120000;
  const castleBuf = new Float32Array(MAX_CASTLE_VERTS * 7); // pos3 + norm3 + dmg1
  const castleVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, castleVBO);
  gl.bufferData(gl.ARRAY_BUFFER, castleBuf.byteLength, gl.DYNAMIC_DRAW);
  const castleVAO = makeVao(castleVBO, 28, true);
  let castleRanges = []; // [{kind, start, count}]

  function stampCastle(tpl, wx, wz, dmg, vertOffset) {
    const vCount = tpl.length / 6;
    for (let v = 0; v < vCount; v++) {
      const si = v * 6, di = (vertOffset + v) * 7;
      castleBuf[di] = tpl[si] + wx;
      castleBuf[di + 1] = tpl[si + 1];
      castleBuf[di + 2] = tpl[si + 2] + wz;
      castleBuf[di + 3] = tpl[si + 3];
      castleBuf[di + 4] = tpl[si + 4];
      castleBuf[di + 5] = tpl[si + 5];
      castleBuf[di + 6] = dmg;
    }
    return vertOffset + vCount;
  }

  function buildingTemplate(b) {
    if (b.kind === 'wall') return WALL_T;
    if (b.kind === 'gate') return b.open ? GATE_OPEN_T : GATE_CLOSED_T;
    if (b.kind === 'keep') return KEEP_T;
    return TOWER_T[b.kind][b.level];
  }

  function rebuildCastle() {
    let off = 0;
    castleRanges = [];
    for (const kind of CASTLE_KINDS) {
      const start = off;
      const list = kind === 'keep' ? [keep] : buildings.filter(b => b.kind === kind);
      for (const b of list) {
        const tpl = buildingTemplate(b);
        if (off + tpl.length / 6 > MAX_CASTLE_VERTS) break;
        const dmg = Math.min(1, Math.max(0, 1 - b.hp / b.maxHp));
        off = stampCastle(tpl, b.x * S, b.y * S, dmg, off);
      }
      if (off > start) castleRanges.push({ kind, start, count: off - start });
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, castleVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, castleBuf.subarray(0, off * 7));
  }

  // ── Geometry: actors (enemies + knights), rebuilt every frame ───────────────
  function makePersonT(s, bulk) {
    const w = 0.28 * s * bulk, d = 0.17 * s * bulk;
    return new Float32Array([
      ...makeBox(-w, 0, -d, w, 1.05 * s, d),
      ...makeBox(-0.16 * s, 1.05 * s, -0.16 * s, 0.16 * s, 1.45 * s, 0.16 * s),
      ...makeBox(-0.07 * s, 0.55 * s, -0.42 * s * bulk, 0.07 * s, 0.78 * s, -d - 0.02),
      ...makeBox(-0.07 * s, 0.55 * s, d + 0.02, 0.07 * s, 0.78 * s, 0.42 * s * bulk),
    ]);
  }
  const ACTOR_T = {};
  for (const ty of ENEMY_TYPES) ACTOR_T[ty] = makePersonT((ENEMIES[ty].size / 11) * 1.17, ty === 'ogre' || ty === 'warlord' ? 1.35 : 1);
  ACTOR_T.knight = makePersonT((KNIGHT.size / 11) * 1.17, 1.1);
  const VERTS_PER_ACTOR = ACTOR_T.raider.length / 6; // all templates share the box count

  // 3 waves in flight late-game can exceed 280 live enemies + 10 knights.
  const MAX_ACTORS = 320;
  const actorBuf = new Float32Array(MAX_ACTORS * VERTS_PER_ACTOR * 6);
  const actorVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, actorVBO);
  gl.bufferData(gl.ARRAY_BUFFER, actorBuf.byteLength, gl.DYNAMIC_DRAW);
  const actorVAO = makeVao(actorVBO, 24, false);
  let actorRanges = []; // [{tint, start, count}]

  function rebuildActors() {
    let off = 0, actors = 0;
    actorRanges = [];
    const groups = [];
    for (const ty of ENEMY_TYPES) groups.push({ tint: ENEMIES[ty].tint, list: enemies.filter(e => !e.dead && e.type === ty && e.hitFlash <= now), tpl: ACTOR_T[ty], enemy: true });
    groups.push({ tint: KNIGHT.tint, list: knights.filter(k => !k.dead && k.hitFlash <= now), tpl: ACTOR_T.knight, enemy: false });
    // hit-flash pass: draw flashing actors white
    const flashE = enemies.filter(e => !e.dead && e.hitFlash > now);
    const flashK = knights.filter(k => !k.dead && k.hitFlash > now);
    for (const g of groups) {
      const start = off;
      for (const a of g.list) {
        if (actors >= MAX_ACTORS) break;
        off = stampRot(g.tpl, actorBuf, off, a.x * S, 0, a.y * S, Math.cos(a.face || 0), Math.sin(a.face || 0));
        actors++;
      }
      if (off > start) actorRanges.push({ tint: g.tint, start, count: off - start });
    }
    const fs = off;
    for (const a of flashE) {
      if (actors >= MAX_ACTORS) break;
      off = stampRot(ACTOR_T[a.type], actorBuf, off, a.x * S, 0, a.y * S, Math.cos(a.face || 0), Math.sin(a.face || 0));
      actors++;
    }
    for (const a of flashK) {
      if (actors >= MAX_ACTORS) break;
      off = stampRot(ACTOR_T.knight, actorBuf, off, a.x * S, 0, a.y * S, Math.cos(a.face || 0), Math.sin(a.face || 0));
      actors++;
    }
    if (off > fs) actorRanges.push({ tint: [1.6, 1.6, 1.6], start: fs, count: off - fs });
    gl.bindBuffer(gl.ARRAY_BUFFER, actorVBO);
    if (off > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, actorBuf.subarray(0, off * 6));
    return off;
  }

  // ── Geometry: projectiles ───────────────────────────────────────────────────
  const ARROW_T = new Float32Array(makeBox(-0.28, -0.03, -0.03, 0.28, 0.03, 0.03));
  const BOLT_T = new Float32Array(makeBox(-0.12, -0.12, -0.12, 0.12, 0.12, 0.12));
  const ROCK_T = new Float32Array(makeBox(-0.22, -0.22, -0.22, 0.22, 0.22, 0.22));
  const PROJ_T = { arrow: ARROW_T, bolt: BOLT_T, rock: ROCK_T };
  const MAX_PROJ = 200;
  const projBuf = new Float32Array(MAX_PROJ * 36 * 6);
  const projVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, projVBO);
  gl.bufferData(gl.ARRAY_BUFFER, projBuf.byteLength, gl.DYNAMIC_DRAW);
  const projVAO = makeVao(projVBO, 24, false);
  let projRanges = [];

  function rebuildProjectiles() {
    let off = 0, n = 0;
    projRanges = [];
    for (const kind of ['arrow', 'bolt', 'rock']) {
      const start = off;
      for (const p of projectiles) {
        if (p.dead || p.kind !== kind || n >= MAX_PROJ) continue;
        const t = p.totDist > 0 ? Math.min(1, p.trav / p.totDist) : 1;
        let h = 3.2 + (0.8 - 3.2) * t; // launch from tower top toward target chest
        if (kind === 'rock') h += 3.5 * 4 * t * (1 - t); // visual arc
        off = stampRot(PROJ_T[kind], projBuf, off, p.x * S, h, p.y * S, Math.cos(p.ang), Math.sin(p.ang));
        n++;
      }
      if (off > start) projRanges.push({ tint: BUILDS[kind === 'arrow' ? 'archer' : kind === 'bolt' ? 'mage' : 'catapult'].tint, start, count: off - start });
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, projVBO);
    if (off > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, projBuf.subarray(0, off * 6));
    return off;
  }

  // ── Geometry: route ribbons (breach previews) ───────────────────────────────
  const MAX_ROUTE_VERTS = 12000;
  const routeBuf = new Float32Array(MAX_ROUTE_VERTS * 6);
  const routeVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, routeVBO);
  gl.bufferData(gl.ARRAY_BUFFER, routeBuf.byteLength, gl.DYNAMIC_DRAW);
  const routeVAO = makeVao(routeVBO, 24, false);
  let routeVerts = 0, breachStart = 0, breachVerts = 0;

  function pushQuad(buf, off, ax, az, bx, bz, halfW, y) {
    let px = -(bz - az), pz = bx - ax;
    const l = Math.hypot(px, pz) || 1;
    px = px / l * halfW; pz = pz / l * halfW;
    const v = [ // CCW from above (+Y normal) so back-face culling keeps them
      [ax - px, y, az - pz], [bx + px, y, bz + pz], [bx - px, y, bz - pz],
      [ax - px, y, az - pz], [ax + px, y, az + pz], [bx + px, y, bz + pz],
    ];
    for (const p of v) {
      const di = off * 6;
      buf[di] = p[0]; buf[di + 1] = p[1]; buf[di + 2] = p[2];
      buf[di + 3] = 0; buf[di + 4] = 1; buf[di + 5] = 0;
      off++;
    }
    return off;
  }

  function rebuildRoutes() {
    let off = 0;
    for (const rt of routes) {
      for (let i = 0; i + 1 < rt.pts.length && off + 6 <= MAX_ROUTE_VERTS; i++) {
        const a = rt.pts[i], b = rt.pts[i + 1];
        off = pushQuad(routeBuf, off, a.x * S, a.y * S, b.x * S, b.y * S, 0.22, 0.03);
      }
    }
    breachStart = off;
    for (const rt of routes) {
      for (const bp of rt.breaches) {
        if (off + 6 > MAX_ROUTE_VERTS) break;
        off = pushQuad(routeBuf, off, bp.x * S - 0.9, bp.y * S, bp.x * S + 0.9, bp.y * S, 0.9, 0.04);
      }
    }
    routeVerts = breachStart;
    breachVerts = off - breachStart;
    gl.bindBuffer(gl.ARRAY_BUFFER, routeVBO);
    if (off > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, routeBuf.subarray(0, off * 6));
  }

  // ── Geometry: ghost + effects (blended scratch buffer) ──────────────────────
  const MAX_FX_VERTS = 6000;
  const fxBuf = new Float32Array(MAX_FX_VERTS * 6);
  const fxVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVBO);
  gl.bufferData(gl.ARRAY_BUFFER, fxBuf.byteLength, gl.DYNAMIC_DRAW);
  const fxVAO = makeVao(fxVBO, 24, false);
  let fxDraws = []; // [{start, count, tint, alpha}]

  function stampCube(off, cx, cy, cz, half) {
    const tpl = makeBox(cx - half, cy - half, cz - half, cx + half, cy + half, cz + half);
    for (let i = 0; i < tpl.length; i++) fxBuf[off * 6 + i] = tpl[i];
    return off + 36;
  }

  function rebuildFx() {
    let off = 0;
    fxDraws = [];
    // build ghost
    if (locked && !paused && !ended && !player.dead && selectedBuild && aimCell && !aimBldg) {
      const wx = (aimCell.c + 0.5) * TILE3D, wz = (aimCell.r + 0.5) * TILE3D;
      const canDo = selectedBuild === 'knight'
        ? (knightPlaceable(aimCell.c, aimCell.r) && gold >= KNIGHT.cost && knights.length < KNIGHT.max)
        : (isBuildable(aimCell.c, aimCell.r) && gold >= BUILDS[selectedBuild].cost);
      const h = selectedBuild === 'knight' ? 1.8 : Math.min(2.4, BLD_H[selectedBuild] || 2.4);
      const start = off;
      const tpl = makeBox(wx - 1.85, 0.02, wz - 1.85, wx + 1.85, h, wz + 1.85);
      for (let i = 0; i < tpl.length; i++) fxBuf[off * 6 + i] = tpl[i];
      off += 36;
      fxDraws.push({ start, count: off - start, tint: canDo ? [0.3, 1.0, 0.5] : [1.0, 0.25, 0.2], alpha: 0.3 });
    }
    // effects
    for (const f of effects) {
      if (off + 36 > MAX_FX_VERTS) break;
      const p = Math.min(1, (now - f.t0) / f.dur);
      const start = off;
      if (f.kind === 'boom') {
        const size = (f.r0 + (f.r1 - f.r0) * p) * S;
        off = stampCube(off, f.x * S, 0.7, f.y * S, size);
        fxDraws.push({ start, count: off - start, tint: f.tint || [1, 0.6, 0.3], alpha: 0.5 * (1 - p) });
      } else if (f.kind === 'dust') {
        off = stampCube(off, f.x * S, 0.6, f.y * S, 0.8 + 1.6 * p);
        fxDraws.push({ start, count: off - start, tint: [0.6, 0.57, 0.52], alpha: 0.42 * (1 - p) });
      } else if (f.kind === 'spark') {
        off = stampCube(off, f.x * S, 1.3, f.y * S, 0.28);
        fxDraws.push({ start, count: off - start, tint: [1, 0.72, 0.3], alpha: 0.8 * (1 - p) });
      } else if (f.kind === 'tracer') {
        // thin quad along the shot ray
        const dx = f.bx - f.ax, dy = f.by - f.ay, dz = f.bz - f.az;
        const perp = cross([dx, dy, dz], [0, 1, 0]);
        normalize3(perp);
        const w = 0.025;
        const v = [
          [f.ax - perp[0] * w, f.ay, f.az - perp[2] * w], [f.bx - perp[0] * w, f.by, f.bz - perp[2] * w], [f.bx + perp[0] * w, f.by, f.bz + perp[2] * w],
          [f.ax - perp[0] * w, f.ay, f.az - perp[2] * w], [f.bx + perp[0] * w, f.by, f.bz + perp[2] * w], [f.ax + perp[0] * w, f.ay, f.az + perp[2] * w],
        ];
        for (const pt of v) {
          const di = off * 6;
          fxBuf[di] = pt[0]; fxBuf[di + 1] = pt[1]; fxBuf[di + 2] = pt[2];
          fxBuf[di + 3] = 0; fxBuf[di + 4] = 1; fxBuf[di + 5] = 0;
          off++;
        }
        fxDraws.push({ start, count: off - start, tint: [1.4, 1.4, 1.2], alpha: 0.6 * (1 - p) });
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, fxVBO);
    if (off > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, fxBuf.subarray(0, off * 6));
  }

  // ── Geometry: viewmodel (sword + crossbow in one VBO) ───────────────────────
  const swordData = [
    ...makeBox(-0.012, -0.08, -0.012, 0.012, 0.08, 0.012),   // handle
    ...makeBox(-0.05, 0.07, -0.015, 0.05, 0.10, 0.015),      // crossguard
    ...makeBox(-0.010, 0.10, -0.005, 0.010, 0.55, 0.005),    // blade
  ];
  const bowData = [
    ...makeBox(-0.03, -0.03, -0.35, 0.03, 0.03, 0.15),       // stock
    ...makeBox(-0.28, -0.005, -0.33, 0.28, 0.02, -0.27),     // bow arm
    ...makeBox(-0.01, 0.035, -0.42, 0.01, 0.052, 0.05),      // bolt
  ];
  const vmData = new Float32Array([...swordData, ...bowData]);
  const vmVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vmVBO);
  gl.bufferData(gl.ARRAY_BUFFER, vmData, gl.STATIC_DRAW);
  const vmVAO = makeVao(vmVBO, 24, false);
  const SWORD_V = swordData.length / 6; // 108

  function vmModel(out, pitchA, rollA, tx, ty, tz) {
    const cp = Math.cos(pitchA), sp = Math.sin(pitchA);
    const cr = Math.cos(rollA), sr = Math.sin(rollA);
    out[0] = cr; out[1] = cp * sr; out[2] = sp * sr; out[3] = 0;
    out[4] = -sr; out[5] = cp * cr; out[6] = sp * cr; out[7] = 0;
    out[8] = 0; out[9] = -sp; out[10] = cp; out[11] = 0;
    out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
    return out;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  function render() {
    const ex = player.x, ey = player.y + EYE_H, ez = player.z;
    const dir = viewDir();
    const aspect = canvas.width / canvas.height;
    perspective(M_PROJ, Math.PI / 3, aspect, 0.1, 400);
    lookDir(M_VIEW, [ex, ey, ez], dir, [0, 1, 0]);
    mul4(M_VP, M_PROJ, M_VIEW);

    // sky (covers every pixel; no color clear needed). Depth must be cleared
    // FIRST — the viewmodel pass's clear is conditional, so last frame's depth
    // can otherwise leak into this frame's sky test.
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.depthMask(false);
    gl.useProgram(skyProg);
    gl.uniform3fv(skyU.uSunDir, sunDir);
    gl.bindVertexArray(skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    // ground
    gl.useProgram(groundProg);
    gl.uniformMatrix4fv(groundU.uVP, false, M_VP);
    gl.uniform3f(groundU.uEye, ex, ey, ez);
    gl.uniform3fv(groundU.uSunDir, sunDir);
    gl.bindVertexArray(groundVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // castle
    gl.useProgram(stoneProg);
    gl.uniformMatrix4fv(stoneU.uVP, false, M_VP);
    gl.uniform3f(stoneU.uEye, ex, ey, ez);
    gl.uniform3fv(stoneU.uSunDir, sunDir);
    gl.bindVertexArray(castleVAO);
    for (const rg of castleRanges) {
      const t = STONE_TINT[rg.kind];
      gl.uniform3f(stoneU.uTint, t[0], t[1], t[2]);
      gl.drawArrays(gl.TRIANGLES, rg.start, rg.count);
    }

    // actors + projectiles (tint program, opaque)
    gl.useProgram(tintProg);
    gl.uniformMatrix4fv(tintU.uVP, false, M_VP);
    gl.uniform3f(tintU.uEye, ex, ey, ez);
    gl.uniform3fv(tintU.uSunDir, sunDir);
    gl.uniform1f(tintU.uAlpha, 1.0);
    rebuildActors();
    gl.bindVertexArray(actorVAO);
    for (const rg of actorRanges) {
      gl.uniform3f(tintU.uTint, rg.tint[0], rg.tint[1], rg.tint[2]);
      gl.drawArrays(gl.TRIANGLES, rg.start, rg.count);
    }
    rebuildProjectiles();
    gl.bindVertexArray(projVAO);
    for (const rg of projRanges) {
      gl.uniform3f(tintU.uTint, rg.tint[0], rg.tint[1], rg.tint[2]);
      gl.drawArrays(gl.TRIANGLES, rg.start, rg.count);
    }

    // blended pass: routes, breach markers, ghost, effects. Cull off so the
    // arbitrarily-oriented tracer quads show from both sides.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(routeVAO);
    if (routeVerts > 0) {
      gl.uniform3f(tintU.uTint, 1.0, 0.63, 0.31);
      gl.uniform1f(tintU.uAlpha, 0.30);
      gl.drawArrays(gl.TRIANGLES, 0, routeVerts);
    }
    if (breachVerts > 0) {
      gl.uniform3f(tintU.uTint, 1.0, 0.5, 0.2);
      gl.uniform1f(tintU.uAlpha, 0.5);
      gl.drawArrays(gl.TRIANGLES, breachStart, breachVerts);
    }
    rebuildFx();
    gl.bindVertexArray(fxVAO);
    for (const d of fxDraws) {
      gl.uniform3f(tintU.uTint, d.tint[0], d.tint[1], d.tint[2]);
      gl.uniform1f(tintU.uAlpha, d.alpha);
      gl.drawArrays(gl.TRIANGLES, d.start, d.count);
    }
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // viewmodel — drawn over everything
    if (locked && !ended && !player.dead) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(vmProg);
      gl.uniformMatrix4fv(vmU.uProj, false, M_PROJ);
      gl.uniform3fv(vmU.uSunDir, sunDir);
      gl.bindVertexArray(vmVAO);
      if (weapon === 'sword') {
        const swingT = Math.max(0, swingTimer / SWING_DUR);
        const s = swingT > 0 ? (swingT < 0.5 ? swingT * 2 : 1.0 - (swingT - 0.5) * 2) : 0;
        const sw = s * s * (3 - 2 * s);
        vmModel(M_VM, -0.2 + sw * 0.9, -0.4 + sw * 1.5, 0.25 - sw * 0.55, -0.30 + sw * 0.15, -0.45 - sw * 0.35);
        gl.uniformMatrix4fv(vmU.uModel, false, M_VM);
        gl.uniform3f(vmU.uTint, 0.35, 0.22, 0.10);
        gl.drawArrays(gl.TRIANGLES, 0, 36);
        gl.uniform3f(vmU.uTint, 0.25, 0.20, 0.15);
        gl.drawArrays(gl.TRIANGLES, 36, 36);
        gl.uniform3f(vmU.uTint, 0.72, 0.74, 0.78);
        gl.drawArrays(gl.TRIANGLES, 72, 36);
      } else {
        const recoil = Math.max(0, bowAnim / 0.25);
        vmModel(M_VM, -0.04, 0, 0.22, -0.22, -0.5 + recoil * 0.12);
        gl.uniformMatrix4fv(vmU.uModel, false, M_VM);
        gl.uniform3f(vmU.uTint, 0.35, 0.22, 0.10);
        gl.drawArrays(gl.TRIANGLES, SWORD_V, 36);
        gl.uniform3f(vmU.uTint, 0.22, 0.18, 0.14);
        gl.drawArrays(gl.TRIANGLES, SWORD_V + 36, 36);
        if (bowCd < 0.45) { // bolt reappears once reloaded
          gl.uniform3f(vmU.uTint, 0.8, 0.78, 0.6);
          gl.drawArrays(gl.TRIANGLES, SWORD_V + 72, 36);
        }
      }
      gl.enable(gl.CULL_FACE);
    }

    // hurt flash (CSS inset shadow, from fps/)
    if (hurtFlash > 0) {
      canvas.style.boxShadow = `inset 0 0 ${60 + hurtFlash * 200}px rgba(255,0,0,${hurtFlash * 1.5})`;
    } else if (player.dead) {
      canvas.style.boxShadow = 'inset 0 0 220px rgba(120,0,0,0.8)';
    } else {
      canvas.style.boxShadow = 'none';
    }
  }

  // ── HUD sync (cached DOM writes) ────────────────────────────────────────────
  const hudCache = {};
  function setText(id, txt) {
    if (hudCache[id] !== txt) { hudCache[id] = txt; $(id).textContent = txt; }
  }
  function setHtml(id, html) {
    if (hudCache['#' + id] !== html) { hudCache['#' + id] = html; $(id).innerHTML = html; }
  }

  function syncHud() {
    setText('goldVal', String(Math.floor(gold)));
    setText('keepVal', Math.ceil(keep.hp) + '/' + keep.maxHp);
    setText('waveVal', wave + '/' + MAX_WAVES);
    setText('scoreVal', String(score));
    setText('hpVal', player.dead ? 'DOWN' : String(Math.ceil(player.hp)));
    const hpEl = $('hpVal');
    hpEl.className = 'val' + (player.hp <= 25 || player.dead ? ' crit' : player.hp <= 50 ? ' low' : '');

    let ws;
    if (ended) ws = '';
    else if (!started) ws = 'Build your defenses — [N] sends wave 1';
    else if (autoTimer >= 0) ws = 'Wave ' + wave + ' cleared! Next in ' + Math.ceil(autoTimer) + 's — [N] to send now';
    else if (wave >= MAX_WAVES) ws = 'FINAL WAVE — hold the line!';
    else if (wavesInFlight() >= MAX_IN_FLIGHT) ws = 'Max ' + MAX_IN_FLIGHT + ' waves in flight';
    else ws = '[N] send wave ' + (wave + 1) + ' early';
    setText('waveStatus', ws);
    syncPalette();
  }

  function syncPalette() {
    document.querySelectorAll('.slot').forEach(el => {
      const type = el.dataset.type;
      el.classList.toggle('sel', selectedBuild === type);
      const cost = type === 'knight' ? KNIGHT.cost : BUILDS[type].cost;
      el.classList.toggle('broke', gold < cost || (type === 'knight' && knights.length >= KNIGHT.max));
    });
  }

  function diffLocked() { return started || wave > 0; }
  function syncDiff() {
    const lockedD = diffLocked();
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.classList.toggle('sel', btn.dataset.diff === diffKey);
      btn.disabled = lockedD && btn.dataset.diff !== diffKey;
    });
  }

  function updateAimPanel() {
    let html = '';
    if (locked && !paused && !ended && !player.dead) {
      const b = aimBldg;
      if (b) {
        if (b.kind === 'keep') {
          html = '<b>The Keep</b> &middot; HP ' + Math.ceil(b.hp) + '/' + b.maxHp;
          if (b.hp < b.maxHp) html += ' &middot; <span class="key">[R]</span> repair ' + repairCost(b) + 'g';
        } else {
          const def = BUILDS[b.kind];
          html = '<b>' + def.name + (def.isTower ? ' Lv' + b.level : '') + '</b> &middot; HP ' + Math.ceil(b.hp) + '/' + b.maxHp;
          if (def.isTower) {
            const s = towerStat(b);
            html += ' &middot; DMG ' + s.damage.toFixed(0);
            if (b.level < 3) html += ' &middot; <span class="key">[U]</span> upgrade ' + Math.round(def.cost * 0.75 * b.level) + 'g';
          }
          if (b.kind === 'gate') html += ' &middot; <span class="key">[E]</span> ' + (b.open ? 'close' : 'open');
          if (b.hp < b.maxHp) html += ' &middot; <span class="key">[R]</span> repair ' + repairCost(b) + 'g';
          html += ' &middot; <span class="key">[X]</span> sell ' + Math.round(b.invested * 0.6 * (b.hp / b.maxHp)) + 'g';
        }
      } else if (selectedBuild) {
        const cost = selectedBuild === 'knight' ? KNIGHT.cost : BUILDS[selectedBuild].cost;
        const nm = selectedBuild === 'knight' ? 'Knight' : BUILDS[selectedBuild].name;
        if (!aimCell) html = '<b>' + nm + '</b> &middot; <span class="no">aim at open ground nearby</span>';
        else if (gold < cost) html = '<b>' + nm + '</b> &middot; <span class="no">need ' + cost + 'g</span>';
        else if (selectedBuild === 'knight' && knights.length >= KNIGHT.max) html = '<b>Knight</b> &middot; <span class="no">max ' + KNIGHT.max + ' knights</span>';
        else html = '<b>' + nm + '</b> ' + cost + 'g &middot; click to place &middot; <span class="key">[Q]</span> cancel';
      }
    }
    setHtml('aimInfo', html);
    $('crosshair').classList.toggle('build', !!selectedBuild);
  }

  // ── Banner ──────────────────────────────────────────────────────────────────
  let bannerUntil = 0;
  function showBanner(text) {
    $('banner').textContent = text;
    $('banner').classList.add('show');
    bannerUntil = now + 2600;
  }
  function updateBanner() {
    if (player.dead) {
      $('banner').textContent = 'YOU FELL — BACK UP IN ' + Math.ceil(player.respawnT) + '…';
      $('banner').classList.add('show');
      bannerUntil = 0;
    } else if (bannerUntil > 0 && now > bannerUntil) {
      $('banner').classList.remove('show');
      bannerUntil = 0;
    } else if (bannerUntil === 0 && !player.dead && $('banner').classList.contains('show')) {
      $('banner').classList.remove('show');
    }
  }

  // ── Minimap ─────────────────────────────────────────────────────────────────
  const mm = $('minimap').getContext('2d');
  const MM_S = 8; // px per cell
  const cssOf = t => 'rgb(' + ((t[0] * 255) | 0) + ',' + ((t[1] * 255) | 0) + ',' + ((t[2] * 255) | 0) + ')';
  const MM_TINT = {};
  for (const ty of ENEMY_TYPES) MM_TINT[ty] = cssOf(ENEMIES[ty].tint);

  function drawMinimap() {
    mm.fillStyle = '#0c1626';
    mm.fillRect(0, 0, 192, 128);
    mm.fillStyle = 'rgba(90,40,26,0.55)';
    mm.fillRect(0, 0, 192, MM_S); mm.fillRect(0, 128 - MM_S, 192, MM_S);
    mm.fillRect(0, 0, MM_S, 128); mm.fillRect(192 - MM_S, 0, MM_S, 128);
    for (const b of buildings) {
      mm.fillStyle = b.kind === 'wall' ? '#8a8880'
        : b.kind === 'gate' ? (b.open ? '#6a4a20' : '#a3742f')
        : cssOf(BUILDS[b.kind].tint);
      mm.fillRect(b.c * MM_S, b.r * MM_S, MM_S, MM_S);
    }
    mm.fillStyle = 'rgba(60,140,255,0.9)';
    mm.fillRect(KEEP_C * MM_S, KEEP_R * MM_S, MM_S * 2, MM_S * 2);
    // siege camps
    mm.fillStyle = 'rgba(255,160,80,0.9)';
    for (const sp of activeSpawns()) mm.fillRect(sp.c * MM_S + 1, sp.r * MM_S + 1, MM_S - 2, MM_S - 2);
    // knights + enemies
    mm.fillStyle = cssOf(KNIGHT.tint);
    for (const k of knights) if (!k.dead) mm.fillRect(k.x / TILE * MM_S - 1, k.y / TILE * MM_S - 1, 3, 3);
    for (const e of enemies) {
      if (e.dead) continue;
      mm.fillStyle = MM_TINT[e.type];
      const sz = e.type === 'warlord' ? 5 : 3;
      mm.fillRect(e.x / TILE * MM_S - sz / 2, e.y / TILE * MM_S - sz / 2, sz, sz);
    }
    // player arrow
    const px = player.x / TILE3D * MM_S, py = player.z / TILE3D * MM_S;
    mm.save();
    mm.translate(px, py);
    mm.rotate(player.yaw);
    mm.fillStyle = '#fff';
    mm.beginPath();
    mm.moveTo(4.5, 0); mm.lineTo(-3, -3); mm.lineTo(-3, 3);
    mm.closePath();
    mm.fill();
    mm.restore();
  }

  // ── Game flow / overlays ────────────────────────────────────────────────────
  function showEnd() {
    $('endTitle').textContent = victory ? 'VICTORY' : 'THE KEEP HAS FALLEN';
    $('endTitle').className = victory ? 'win' : 'lose';
    $('endSub').innerHTML = (victory
      ? 'All ' + MAX_WAVES + ' waves repelled on ' + diff().name + '.'
      : 'Overrun on wave ' + wave + ' (' + diff().name + ').')
      + '<br>Score: <b style="color:rgba(255,225,120,1)">' + score + '</b>';
    $('endOverlay').classList.add('show');
    $('pauseOverlay').classList.remove('show');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  document.querySelectorAll('.diff-btn').forEach(btn => btn.addEventListener('click', () => {
    if (diffLocked() || !DIFFICULTIES[btn.dataset.diff] || btn.dataset.diff === diffKey) return;
    diffKey = btn.dataset.diff;
    reset();
  }));
  $('playBtn').addEventListener('click', () => {
    inGame = true;
    $('startOverlay').classList.remove('show');
    requestLock();
  });
  $('restartBtn').addEventListener('click', () => {
    reset();
    $('endOverlay').classList.remove('show');
    requestLock();
  });
  $('pauseOverlay').addEventListener('click', () => setPause(false));

  // ── Loop ────────────────────────────────────────────────────────────────────
  let last = 0, endShown = false;
  let frameCount = 0, fpsAccum = 0, fpsVal = 0;

  function loop(ts) {
    requestAnimationFrame(loop);
    now = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;

    frameCount++; fpsAccum += dt;
    if (fpsAccum >= 0.5) { fpsVal = Math.round(frameCount / fpsAccum); frameCount = 0; fpsAccum = 0; setText('fpsHud', fpsVal + ' fps'); }

    if (flowDirty) { recomputeFlow(); flowDirty = false; }

    if (inGame && !paused && !ended) {
      updatePlayer(dt);
      computeAim();
      if (started) update(dt);
      else effects = effects.filter(f => now - f.t0 < f.dur); // pre-wave cleanup
      if (swordCd > 0) swordCd -= dt;
      if (bowCd > 0) bowCd -= dt;
      if (bowAnim > 0) bowAnim -= dt;
      if (swingTimer > 0) swingTimer -= dt;
      if (hurtFlash > 0) hurtFlash -= dt;
    }

    if (ended && !endShown) { endShown = true; showEnd(); }
    if (!ended) endShown = false;

    if (castleDirty) { rebuildCastle(); castleDirty = false; }
    if (routesDirty) { rebuildRoutes(); routesDirty = false; }

    render();
    updateAimPanel();
    updateBanner();
    drawMinimap();
  }

  reset();
  requestAnimationFrame(ts => { last = ts; requestAnimationFrame(loop); });
})();
