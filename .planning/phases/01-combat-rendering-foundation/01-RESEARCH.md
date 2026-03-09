# Phase 1: Combat Rendering Foundation - Research

**Researched:** 2026-03-09
**Domain:** WebGL 1.0 instanced rendering, entity data structures, spatial partitioning, procedural geometry
**Confidence:** HIGH

## Summary

Phase 1 builds the combat rendering backbone: an entity store for enemies, an instanced rendering pipeline (ANGLE_instanced_arrays), procedural geometry for the Grunt archetype, and a radial bin collision structure. All combat rendering happens as separate GL geometry passes composited after the existing ray march shader -- never inside it.

The existing codebase already has a working 3D geometry pipeline (shipPg for the player ship, missile rendering, trajectory points) that establishes the pattern: compile shader program via `cS()`, create buffers, compute MVP matrix, draw. The enemy system follows this exact pattern but uses instancing to render all 50 enemies in a single draw call instead of per-entity drawElements calls (which is how missiles currently work).

**Primary recommendation:** Use per-instance vec4 attributes (position+heading, color+scale) rather than per-instance mat4 to stay within WebGL 1.0's 8-attribute minimum budget. Construct the model matrix in the vertex shader from decomposed position, heading angle, and scale.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Angular/geometric shape language for enemy ships -- sharp edges, flat panels, polygonal silhouettes (wedges, diamond hulls, pointed fins)
- Per-archetype color scheme: Grunt red (255,80,60), Swarm yellow (255,220,60), Bomber orange (255,140,40), Sniper purple (180,60,255), Capital white (255,255,255)
- Phase 1 builds the Grunt archetype only; other archetypes added in Phase 7
- Medium poly geometry target: 50-100 triangles per enemy ship (vs 12 tris for current player ship)
- Rigid body geometry with subtle shader effects -- pulsing glow, engine glow, energy effects (no geometry animation)
- Ships face their direction of orbital travel (heading derived from velocity vector), not the camera
- Colored edge glow/outline on all enemies matching their archetype color -- ensures visibility against both dark space and bright lensing arcs
- Depth-tested against the black hole scene -- enemies can be occluded by planets and accretion disk (off-screen indicators added in Phase 6)
- Subtle vertex-shader scale warp for enemies near the event horizon -- stretching effect, cheap to compute
- Accretion disk glow lighting -- enemies near the disk pick up warm orange light based on distance-to-disk-plane (computed in vertex shader)
- Separate enemy shader program (enemyPg) -- not an extension of the existing shipPg
- enemyPg built for instancing from the start: per-instance transforms, per-instance color, edge glow, BH warp, accretion lighting
- All enemies rendered in one instanced draw call (ANGLE_instanced_arrays)
- shipPg remains unchanged for the player ship

### Claude's Discretion
- Enemy ship sizing relative to player (scale per archetype)
- Entity store data structure design (SoA vs AoS, typed arrays, etc.)
- Radial bin granularity and bin count
- Exact edge glow implementation (rim lighting, Fresnel, post-process outline)
- LOD distance thresholds for billboard vs full geometry
- Buffer pre-allocation strategy

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRF-01 | Maintains 30fps+ on GTX 1060 / RX 580 tier hardware with 30-50 enemies on screen | Instanced rendering pattern eliminates per-entity draw call overhead; single draw call for all enemies; attribute budget stays within WebGL 1.0 minimum |
| PRF-02 | All combat elements rendered as separate GL geometry passes -- never inside the ray march shader | Enemy shader program (enemyPg) is completely separate from the ray march program (pg); drawn after ray march completes, following existing shipPg pattern |
| PRF-03 | Instanced rendering used for enemies and projectiles (ANGLE_instanced_arrays) | ANGLE_instanced_arrays extension documented with full API; 92%+ browser support; decomposed attribute approach for WebGL 1.0 attribute budget |
| PRF-04 | Radial bin collision detection (O(n), not O(n^2)) | Radial bin structure designed for the 2D ecliptic plane; entities binned by orbital radius; collision checks only within same/adjacent bins |
| ENM-11 | Enemy ships have procedural shader geometry visuals (not sprites) | Grunt geometry generated procedurally (positions, normals, indices) following existing `createBoxGeometry()` pattern but with angular/wedge shape |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WebGL 1.0 | N/A (browser native) | Rendering context | Already in use; no framework overhead |
| ANGLE_instanced_arrays | WebGL 1 extension | Instanced draw calls | 92%+ browser support since 2016; required by PRF-03 |
| OES_standard_derivatives | WebGL 1 extension | fwidth() in shaders | Already enabled in codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Float32Array | ES6 built-in | Entity data storage, instance buffers | All per-entity data and GPU buffers |
| Uint16Array | ES6 built-in | Index buffers | Geometry indices (up to 65535 vertices) |
| DataView | ES6 built-in | WASM memory access | Existing pattern for camera/planet data |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ANGLE_instanced_arrays | Per-entity draw calls | Current missile pattern; works but O(n) draw calls kills perf at 50 entities |
| WebGL 1 | WebGL 2 | Built-in instancing, UBOs, but would require migrating entire codebase; unnecessary |
| Typed arrays SoA | JS object arrays | Simpler API but terrible cache performance and GC pressure |

**Installation:** None required. Pure browser APIs, no npm, no build tools.

## Architecture Patterns

### Recommended Project Structure
```
js/scene/
  shaders.js       (EXISTING - add enemyVS, enemyFS shader strings)
  math.js          (EXISTING - add createGruntGeometry() function)
  nav.js           (EXISTING - unchanged)
  missiles.js      (EXISTING - unchanged)
  combat.js        (NEW - entity store, radial bins, enemy management)
index.html         (EXISTING - add enemyPg setup, instance buffer creation, draw call in render loop)
```

### Pattern 1: Enemy Shader Program (enemyPg) -- Separate from shipPg
**What:** A dedicated shader program for instanced enemy rendering with per-instance attributes
**When to use:** Always for enemy rendering; never share with shipPg

The existing codebase establishes the shader program pattern:
1. Define VS/FS strings in `js/scene/shaders.js`
2. Compile via `cS(gl, source, type)` in `index.html`
3. Link program, cache attribute/uniform locations
4. Create and fill buffers
5. Draw in render loop

**Vertex shader attribute layout (8 attributes total, within WebGL 1.0 minimum budget):**

| Slot | Attribute | Type | Divisor | Purpose |
|------|-----------|------|---------|---------|
| 0 | a_position | vec3 | 0 (per-vertex) | Local-space vertex position |
| 1 | a_normal | vec3 | 0 (per-vertex) | Local-space vertex normal |
| 2 | a_instPos | vec3 | 1 (per-instance) | World position (x,y,z) |
| 3 | a_instHeading | float | 1 (per-instance) | Heading angle in radians (Y-axis rotation) |
| 4 | a_instColor | vec4 | 1 (per-instance) | Archetype color RGBA (A = glow intensity) |
| 5 | a_instScale | float | 1 (per-instance) | Uniform scale factor |

**Total: 6 attribute slots used.** This leaves 2 slots free (within the minimum 8), and avoids the mat4 approach which would consume 4 slots alone.

**Vertex shader constructs model matrix from decomposed attributes:**
```glsl
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec3 a_instPos;       // per-instance world position
attribute float a_instHeading;  // per-instance Y-rotation (radians)
attribute vec4 a_instColor;     // per-instance RGBA
attribute float a_instScale;    // per-instance scale

uniform mat4 u_viewProj;       // shared view-projection matrix
uniform vec3 u_lightDir;       // directional light in view space
uniform vec3 u_bhPos;          // black hole position for warp
uniform float u_time;          // for pulsing effects

varying vec3 v_normal;
varying vec3 v_worldPos;
varying vec4 v_color;
varying float v_rimFactor;

void main() {
  // Construct Y-rotation matrix from heading
  float c = cos(a_instHeading);
  float s = sin(a_instHeading);

  // Rotate + scale vertex position
  vec3 rotated = vec3(
    (a_position.x * c + a_position.z * s) * a_instScale,
    a_position.y * a_instScale,
    (-a_position.x * s + a_position.z * c) * a_instScale
  );

  // BH warp: subtle stretch toward black hole
  vec3 worldPos = rotated + a_instPos;
  vec3 toBH = u_bhPos - worldPos;
  float bhDist = length(toBH);
  float warpFactor = smoothstep(8.0, 2.0, bhDist) * 0.3;
  worldPos += normalize(toBH) * warpFactor;

  // Accretion disk glow (y-plane proximity)
  float diskProximity = exp(-worldPos.y * worldPos.y * 0.5)
                      * smoothstep(14.0, 4.0, length(worldPos.xz));

  // Rotate normal
  vec3 rotNormal = vec3(
    a_normal.x * c + a_normal.z * s,
    a_normal.y,
    -a_normal.x * s + a_normal.z * c
  );

  v_normal = rotNormal;
  v_worldPos = worldPos;
  v_color = a_instColor;
  v_rimFactor = diskProximity;

  gl_Position = u_viewProj * vec4(worldPos, 1.0);
}
```

**Fragment shader with edge glow and accretion lighting:**
```glsl
precision mediump float;

uniform vec3 u_lightDir;
uniform float u_time;

varying vec3 v_normal;
varying vec3 v_worldPos;
varying vec4 v_color;
varying float v_rimFactor;

void main() {
  vec3 n = normalize(v_normal);

  // Directional lighting
  float diff = max(dot(n, u_lightDir), 0.0);
  float amb = 0.12;

  // Edge glow (rim lighting) using archetype color
  float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);
  vec3 rimColor = v_color.rgb * rim * 0.6;

  // Pulsing glow
  float pulse = 0.8 + 0.2 * sin(u_time * 3.0);

  // Base color with lighting
  vec3 col = v_color.rgb * (amb + diff * 0.85) * pulse;

  // Add rim glow
  col += rimColor;

  // Accretion disk warm glow
  col += vec3(1.0, 0.6, 0.2) * v_rimFactor * 0.3;

  // Engine glow (back-facing triangles glow brighter)
  float engineGlow = max(-dot(n, vec3(0.0, 0.0, 1.0)), 0.0) * 0.4;
  col += v_color.rgb * engineGlow;

  gl_FragColor = vec4(col, 1.0);
}
```

### Pattern 2: Entity Store with Typed Arrays (Structure of Arrays)
**What:** Pre-allocated typed arrays for entity data, with a free-list for O(1) add/remove
**When to use:** All combat entity management

```javascript
// Structure of Arrays (SoA) entity store
const MAX_ENEMIES = 64;  // Pre-allocate for max expected

const enemies = {
  count: 0,
  // Per-entity state (CPU-side)
  alive:    new Uint8Array(MAX_ENEMIES),
  posX:     new Float32Array(MAX_ENEMIES),
  posY:     new Float32Array(MAX_ENEMIES),
  posZ:     new Float32Array(MAX_ENEMIES),
  velX:     new Float32Array(MAX_ENEMIES),
  velZ:     new Float32Array(MAX_ENEMIES),
  heading:  new Float32Array(MAX_ENEMIES),
  hp:       new Float32Array(MAX_ENEMIES),
  type:     new Uint8Array(MAX_ENEMIES),   // archetype enum
  scale:    new Float32Array(MAX_ENEMIES),

  // Instance buffer data (GPU-bound, packed for instanced rendering)
  // Stride: 8 floats per instance (pos.xyz + heading + color.rgba + scale)
  // = 32 bytes per instance
  instanceData: new Float32Array(MAX_ENEMIES * 8),
};

// Free list for O(1) slot reuse
const freeSlots = [];
for (let i = MAX_ENEMIES - 1; i >= 0; i--) freeSlots.push(i);
```

### Pattern 3: Instance Buffer Update (Per-Frame)
**What:** Pack live entity data into the instance buffer, upload to GPU
**When to use:** Every frame, before the instanced draw call

```javascript
function updateInstanceBuffer() {
  let liveCount = 0;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    const base = liveCount * 8;
    enemies.instanceData[base]     = enemies.posX[i];
    enemies.instanceData[base + 1] = enemies.posY[i];
    enemies.instanceData[base + 2] = enemies.posZ[i];
    enemies.instanceData[base + 3] = enemies.heading[i];
    // Color based on archetype type
    const c = ARCHETYPE_COLORS[enemies.type[i]];
    enemies.instanceData[base + 4] = c[0];
    enemies.instanceData[base + 5] = c[1];
    enemies.instanceData[base + 6] = c[2];
    enemies.instanceData[base + 7] = enemies.scale[i];
    liveCount++;
  }
  return liveCount;
}
```

### Pattern 4: Radial Bin Collision Structure
**What:** Entities binned by orbital radius for O(n) broad-phase collision
**When to use:** Every frame for collision checks between enemies and projectiles

Since all combat happens on the 2D ecliptic plane (y=0) around a central black hole, entities naturally occupy radial shells. A radial bin divides the plane into concentric rings by distance from origin. Collision pairs only need checking within the same or adjacent bins.

```javascript
const BIN_WIDTH = 10.0;  // Units per radial bin
const NUM_BINS = 20;     // Covers radius 0-200
const MAX_PER_BIN = 16;  // Max entities per bin

// Bin arrays
const binCounts = new Uint8Array(NUM_BINS);
const binEntities = new Uint16Array(NUM_BINS * MAX_PER_BIN);

function rebinEntities() {
  binCounts.fill(0);
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies.alive[i]) continue;
    const r = Math.sqrt(enemies.posX[i] ** 2 + enemies.posZ[i] ** 2);
    const bin = Math.min(Math.floor(r / BIN_WIDTH), NUM_BINS - 1);
    const idx = binCounts[bin];
    if (idx < MAX_PER_BIN) {
      binEntities[bin * MAX_PER_BIN + idx] = i;
      binCounts[bin]++;
    }
  }
}

function getCollisionCandidates(r) {
  const bin = Math.min(Math.floor(r / BIN_WIDTH), NUM_BINS - 1);
  const candidates = [];
  for (let b = Math.max(0, bin - 1); b <= Math.min(NUM_BINS - 1, bin + 1); b++) {
    for (let j = 0; j < binCounts[b]; j++) {
      candidates.push(binEntities[b * MAX_PER_BIN + j]);
    }
  }
  return candidates;
}
```

### Pattern 5: Render Loop Integration
**What:** Where enemy drawing fits in the existing render pipeline
**When to use:** Always -- this is the core rendering order

```
Existing render order (index.html render function):
  1. WASM frame computation (planet positions, camera, hover)
  2. Ray march fullscreen quad: gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)  [line ~623]
  3. IF flyMode:
     a. gl.clear(DEPTH_BUFFER_BIT)
     b. gl.enable(DEPTH_TEST)
     c. Draw player ship (shipPg, individual drawElements)            [line ~647-660]
     d. Draw missiles (shipPg, per-missile drawElements loop)         [line ~665-687]
     e. Draw trajectory points (trajPg)                                [line ~691-751]
     f. gl.disable(DEPTH_TEST)
     g. Restore ray march program (pg)

New render order with enemies:
  1. WASM frame computation (unchanged)
  2. Ray march fullscreen quad (unchanged)
  3. IF flyMode:
     a. gl.clear(DEPTH_BUFFER_BIT)
     b. gl.enable(DEPTH_TEST)
     c. === NEW: Update enemy instance buffer ===
     d. === NEW: Draw all enemies (enemyPg, single instanced draw call) ===
     e. Draw player ship (shipPg, unchanged)
     f. Draw missiles (shipPg, unchanged)
     g. Draw trajectory points (trajPg, unchanged)
     h. gl.disable(DEPTH_TEST)
     i. Restore ray march program (pg)
```

Enemies draw BEFORE the player ship so depth testing works correctly -- enemies behind planets/disk get occluded, and the player ship draws on top of enemies at same depth.

### Anti-Patterns to Avoid
- **Per-entity draw calls for enemies:** The existing missile render loop uses individual `drawElements` per missile. This works for 6 missiles but NOT for 50 enemies. Always use instanced drawing.
- **Mat4 per-instance attribute:** Consumes 4 of the 8 minimum attribute slots. Use decomposed position + heading + scale instead.
- **Modifying the ray march shader (pg) for enemy rendering:** Locked decision -- all combat rendering is separate GL passes.
- **Using regular JS arrays for entity data:** Creates GC pressure from object allocation. Use typed arrays.
- **Allocating typed arrays per frame:** Pre-allocate all buffers at init time. The existing codebase already follows this pattern (see `_camP`, `_proj`, `_mvp` scratch arrays).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Matrix math | Custom mat4 library | Existing `mat4Perspective`, `mat4LookAt`, `mat4Mul` in math.js | Already correct and tested |
| Shader compilation | Custom shader setup | Existing `cS()` function | Battle-tested in 3 shader programs |
| Geometry format | New buffer layout | Follow existing `createBoxGeometry()` pattern returning {positions, normals, indices} | Consistent with shipPg buffer binding |
| View-projection matrix | Separate calculation | Reuse `_vpMat` already computed for shipPg | Computed once per frame, shared |

**Key insight:** The existing codebase has a working 3D rendering pipeline. The enemy system should follow the exact same patterns (compile shader, create buffers, draw) -- the only new technique is instancing via ANGLE_instanced_arrays.

## Common Pitfalls

### Pitfall 1: Attribute Divisor State Leak
**What goes wrong:** After drawing enemies with instanced attributes (divisor=1), forgetting to reset divisors to 0 before drawing non-instanced geometry (shipPg, trajPg).
**Why it happens:** `vertexAttribDivisorANGLE` is per-attribute global state, not per-program.
**How to avoid:** After the instanced draw call, call `ext.vertexAttribDivisorANGLE(loc, 0)` for every instanced attribute, then `gl.disableVertexAttribArray(loc)` for each.
**Warning signs:** Player ship or trajectory points disappear or render incorrectly after enemy draw.

### Pitfall 2: Buffer Binding State Conflict
**What goes wrong:** The ray march program (pg) has attribute `aP` (2D position) permanently bound. Enemy rendering requires binding different buffers to different attributes. If state isn't properly restored, the ray march breaks on the next frame.
**Why it happens:** The render loop ends with restoring `pg` state -- if enemy rendering changes buffer bindings without cleanup, subsequent frames fail.
**How to avoid:** Follow the existing pattern at the end of the flyMode block (lines ~752-758): disable enemy attributes, rebind `bf` to ARRAY_BUFFER, re-enable `aP`, restore pg.
**Warning signs:** Black screen or corrupted ray march after first frame with enemies.

### Pitfall 3: Depth Buffer Not Cleared
**What goes wrong:** Enemies leave depth artifacts from previous frames, causing z-fighting or invisible geometry.
**Why it happens:** The ray march draws a fullscreen quad that doesn't write depth. The existing code already calls `gl.clear(gl.DEPTH_BUFFER_BIT)` before ship rendering.
**How to avoid:** Enemies draw after the depth clear (which already happens at line ~644). No extra work needed, but don't move the enemy draw before the depth clear.

### Pitfall 4: Instance Buffer Upload Every Frame
**What goes wrong:** Creating a new buffer or calling `gl.bufferData` (which reallocates) every frame when only the data changes.
**Why it happens:** Misunderstanding gl.DYNAMIC_DRAW vs buffer reallocation.
**How to avoid:** Create the instance buffer once at init with `gl.bufferData(gl.ARRAY_BUFFER, MAX_ENEMIES * 32, gl.DYNAMIC_DRAW)`. Each frame, use `gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, liveCount * 8))` to update only the live portion.
**Warning signs:** Increasing memory usage over time, performance degradation.

### Pitfall 5: Forgetting OES_standard_derivatives for Enemy Shader
**What goes wrong:** `fwidth()` not available in enemy fragment shader if extension not requested.
**Why it happens:** The extension is enabled globally but only requested once. Each shader program that uses it needs `#extension GL_OES_standard_derivatives : enable` in the source.
**How to avoid:** The enemy shader does not currently need `fwidth()` -- the rim lighting approach for edge glow doesn't require it. But if anti-aliasing is added later, include the extension pragma.

### Pitfall 6: WebGL Attribute Limit Exceeded
**What goes wrong:** Shader fails to link because too many attribute slots are used.
**Why it happens:** WebGL 1.0 guarantees only 8 attribute slots minimum. A mat4 attribute uses 4 slots.
**How to avoid:** Use decomposed per-instance attributes (position vec3 + heading float + color vec4 + scale float = 6 slots total with per-vertex pos and normal). Check `gl.getParameter(gl.MAX_VERTEX_ATTRIBS)` at init.
**Warning signs:** Shader link failure on mobile or Intel integrated GPUs.

## Code Examples

Verified patterns from the existing codebase:

### Shader Program Creation (existing pattern)
```javascript
// Source: index.html lines 175-178
function cS(g,s,t){
  const sh=g.createShader(t);
  g.shaderSource(sh,s);
  g.compileShader(sh);
  if(!g.getShaderParameter(sh,g.COMPILE_STATUS)){
    console.error(g.getShaderInfoLog(sh));
    g.deleteShader(sh);
    return null;
  }
  return sh;
}

// Ship program creation pattern (index.html lines 224-235)
const sVS=cS(gl,shipVS,gl.VERTEX_SHADER);
const sFS=cS(gl,shipFS,gl.FRAGMENT_SHADER);
const shipPg=gl.createProgram();
gl.attachShader(shipPg,sVS);gl.attachShader(shipPg,sFS);gl.linkProgram(shipPg);
if(!gl.getProgramParameter(shipPg,gl.LINK_STATUS))
  console.error(gl.getProgramInfoLog(shipPg));
const shipLocs={
  aPos:gl.getAttribLocation(shipPg,'a_shipPos'),
  aNorm:gl.getAttribLocation(shipPg,'a_shipNormal'),
  uMvp:gl.getUniformLocation(shipPg,'u_mvp'),
  uNorm:gl.getUniformLocation(shipPg,'u_normalMatrix'),
  uColor:gl.getUniformLocation(shipPg,'u_shipColor'),
  uLight:gl.getUniformLocation(shipPg,'u_lightDir')
};
```

### Geometry Buffer Creation (existing pattern)
```javascript
// Source: index.html lines 236-251
const shipGeo=createBoxGeometry(SHIP_HALF[0],SHIP_HALF[1],SHIP_HALF[2]);
const shipPosBuf=gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,shipPosBuf);
gl.bufferData(gl.ARRAY_BUFFER,shipGeo.positions,gl.STATIC_DRAW);
const shipNrmBuf=gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,shipNrmBuf);
gl.bufferData(gl.ARRAY_BUFFER,shipGeo.normals,gl.STATIC_DRAW);
const shipIdxBuf=gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,shipIdxBuf);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,shipGeo.indices,gl.STATIC_DRAW);
```

### Ship Draw Call (existing pattern to follow)
```javascript
// Source: index.html lines 647-660
gl.useProgram(shipPg);
gl.uniformMatrix4fv(shipLocs.uMvp,false,_mvp);
gl.uniformMatrix3fv(shipLocs.uNorm,false,_normM);
gl.uniform3f(shipLocs.uColor,SHIP_COLOR[0],SHIP_COLOR[1],SHIP_COLOR[2]);
gl.uniform3f(shipLocs.uLight,_toLV[0],_toLV[1],_toLV[2]);
gl.disableVertexAttribArray(aP);  // Disable ray march attribute
gl.bindBuffer(gl.ARRAY_BUFFER,shipPosBuf);
gl.enableVertexAttribArray(shipLocs.aPos);
gl.vertexAttribPointer(shipLocs.aPos,3,gl.FLOAT,false,0,0);
gl.bindBuffer(gl.ARRAY_BUFFER,shipNrmBuf);
gl.enableVertexAttribArray(shipLocs.aNorm);
gl.vertexAttribPointer(shipLocs.aNorm,3,gl.FLOAT,false,0,0);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,shipIdxBuf);
gl.drawElements(gl.TRIANGLES,36,gl.UNSIGNED_SHORT,0);
// Cleanup
gl.disableVertexAttribArray(shipLocs.aPos);
gl.disableVertexAttribArray(shipLocs.aNorm);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);
```

### ANGLE_instanced_arrays Extension Setup (new, verified from MDN)
```javascript
// Source: MDN ANGLE_instanced_arrays documentation
const ext = gl.getExtension('ANGLE_instanced_arrays');
if (!ext) {
  console.error('ANGLE_instanced_arrays not supported');
}

// Per-instance attribute setup
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
gl.enableVertexAttribArray(instancePosLoc);
gl.vertexAttribPointer(instancePosLoc, 3, gl.FLOAT, false, 32, 0);  // stride=32 bytes
ext.vertexAttribDivisorANGLE(instancePosLoc, 1);  // advance per instance

// Instanced draw call
ext.drawElementsInstancedANGLE(
  gl.TRIANGLES,
  indexCount,        // triangles * 3
  gl.UNSIGNED_SHORT,
  0,
  liveEnemyCount     // number of instances
);

// CRITICAL: Reset divisors after instanced draw
ext.vertexAttribDivisorANGLE(instancePosLoc, 0);
gl.disableVertexAttribArray(instancePosLoc);
```

### Procedural Grunt Geometry (new, following createBoxGeometry pattern)
```javascript
// Grunt ship: angular wedge with fins, 50-100 triangles
// Follows existing createBoxGeometry() return format: {positions, normals, indices}
function createGruntGeometry() {
  const p = []; // positions (vec3 per vertex)
  const n = []; // normals (vec3 per vertex)
  const idx = []; // triangle indices

  // Main fuselage: elongated diamond/wedge shape
  // Front point (0,0,0.5), rear point (0,0,-0.4)
  // Side points at z=0: (+/-0.15, 0, 0)
  // Top/bottom at z=0: (0, +/-0.06, 0)

  // ... vertex definitions following angular shape language ...
  // Each face: push 3-4 vertices with their face normal, then indices

  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    indices: new Uint16Array(idx)
  };
}
```

### Recommended Grunt Ship Dimensions
```
Scale relative to player ship:
  Player ship half-extents: [0.08, 0.025, 0.04] (very small)
  Grunt should be ~3-4x player size
  Grunt half-extents recommendation: ~[0.25, 0.08, 0.12]

  With instanced scale attribute, this can be tuned per-archetype:
  - Grunt: scale 1.0 (baseline)
  - Swarm: scale 0.6 (smaller, faster)
  - Bomber: scale 1.4 (larger, heavier)
  - Capital: scale 3.0 (boss-sized)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-entity drawElements loop (current missiles) | ANGLE_instanced_arrays single draw call | Available since 2016, 92%+ support | 50 enemies in 1 draw call vs 50 |
| JS object arrays for entities | Float32Array SoA | Best practice since typed arrays standardized | Zero GC pressure, cache-friendly |
| CPU-computed model matrices (mat4 per entity) | GPU-computed model from position + heading + scale | Common optimization | Saves 16 floats per instance, reconstructed in vertex shader |

**Deprecated/outdated:**
- Nothing in WebGL 1 is deprecated that affects this work. The ANGLE prefix is cosmetic -- the extension works universally.

## Open Questions

1. **LOD Billboard Threshold**
   - What we know: At very far distances, a 50-tri mesh is overkill -- a simple colored quad could suffice
   - What's unclear: At what distance (in world units) enemies become small enough on screen that a billboard is indistinguishable from full geometry
   - Recommendation: Defer LOD to Phase 7 when many enemies are on screen. For Phase 1 with 50 Grunts, full geometry at all distances is fine performance-wise.

2. **Interleaved vs Separate Instance Buffers**
   - What we know: Interleaved (position + heading + color + scale in one buffer with stride) reduces buffer bind calls to 1. Separate buffers is simpler but requires multiple binds.
   - What's unclear: Whether the performance difference matters at 50 instances
   - Recommendation: Use interleaved buffer (single buffer with stride offsets). It is the standard approach for instanced rendering and scales better. The stride/offset pattern is well-documented.

3. **Enemy Visibility During Non-Nav Mode**
   - What we know: Combat only happens in nav mode (flyMode=true). The existing render loop only draws the ship/missiles/trajectories when flyMode is true.
   - What's unclear: Whether enemies should be visible in the default observation mode
   - Recommendation: Only render enemies when flyMode is true, matching the existing pattern. Combat is a nav-mode feature.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Browser-based regression tests (tests.html) |
| Config file | tests.html (existing) |
| Quick run command | Open `http://localhost:8000/tests.html` in browser |
| Full suite command | Same (all tests run on page load) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRF-01 | 50 enemies render at 30fps+ | manual-only | Visual check: open index.html, enter nav mode, verify FPS counter | N/A |
| PRF-02 | Combat entities as separate GL passes, not in ray march | unit | Regex test: fsSource must not contain enemy-related uniforms | Wave 0 |
| PRF-03 | ANGLE_instanced_arrays used for enemy rendering | unit | Regex test: index.html contains `getExtension('ANGLE_instanced_arrays')` and `drawElementsInstancedANGLE` | Wave 0 |
| PRF-04 | Radial bin collision O(n) | unit | JS sandbox test: create 50 entities, verify binning produces candidates without pairwise comparisons | Wave 0 |
| ENM-11 | Procedural shader geometry (not sprites) | unit | Regex test: enemyVS/enemyFS defined in shaders.js, `createGruntGeometry` exists in math.js | Wave 0 |

### Sampling Rate
- **Per task commit:** Open tests.html, verify all existing tests still pass (no shader regression)
- **Per wave merge:** tests.html + visual check of 50 enemies rendering in nav mode
- **Phase gate:** All tests green, FPS counter shows 30+ with 50 enemies

### Wave 0 Gaps
- [ ] Add test in tests.html: verify ANGLE_instanced_arrays usage (regex check for extension acquisition and instanced draw calls)
- [ ] Add test in tests.html: verify enemyPg shader source exists separate from pg/shipPg
- [ ] Add test in tests.html: verify no enemy-related code inside fsSource (ray march shader unchanged)
- [ ] Add test in tests.html: verify createGruntGeometry returns valid {positions, normals, indices}
- [ ] Add test in tests.html: verify radial bin structure produces O(n) collision candidates (JS sandbox test)

## Sources

### Primary (HIGH confidence)
- [MDN ANGLE_instanced_arrays](https://developer.mozilla.org/en-US/docs/Web/API/ANGLE_instanced_arrays) - Full API documentation, browser support, usage examples
- [MDN vertexAttribDivisorANGLE](https://developer.mozilla.org/en-US/docs/Web/API/ANGLE_instanced_arrays/vertexAttribDivisorANGLE) - Divisor semantics
- [MDN drawElementsInstancedANGLE](https://developer.mozilla.org/en-US/docs/Web/API/ANGLE_instanced_arrays/drawElementsInstancedANGLE) - Draw call API
- [WebGL Fundamentals - Instanced Drawing](https://webglfundamentals.org/webgl/lessons/webgl-instanced-drawing.html) - Complete tutorial with mat4 attribute setup
- Existing codebase: `index.html`, `js/scene/shaders.js`, `js/scene/math.js`, `js/scene/nav.js` - Established patterns

### Secondary (MEDIUM confidence)
- [Game Programming Patterns - Spatial Partition](https://gameprogrammingpatterns.com/spatial-partition.html) - General spatial partitioning principles
- [LearnOpenGL - Instancing](https://learnopengl.com/Advanced-OpenGL/Instancing) - OpenGL instancing concepts (applicable to WebGL)
- [Khronos ANGLE_instanced_arrays spec](https://registry.khronos.org/webgl/extensions/ANGLE_instanced_arrays/) - Official extension specification

### Tertiary (LOW confidence)
- Radial bin specifics (bin width, count): Derived from codebase analysis of planet orbit radii (28-86 units). Needs tuning during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - WebGL 1.0 + ANGLE_instanced_arrays is the only option; well-documented, universally supported
- Architecture: HIGH - Follows existing codebase patterns exactly; shader program setup, buffer management, render loop integration all verified against source
- Pitfalls: HIGH - Attribute divisor state leak and buffer binding conflicts are well-documented WebGL 1 issues; verified against MDN
- Entity store: MEDIUM - SoA with typed arrays is standard practice but specific field layout needs tuning during implementation
- Radial bins: MEDIUM - Concept is sound for radial game world but bin width/count needs tuning based on actual entity distribution

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable technology, no moving parts)
