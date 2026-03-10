/* ---- Billboard Explosion System ---- */

/* Constants */
const MAX_EXPLOSIONS = 24;
const EXPLOSION_DURATION = 0.5;
const EXPLOSION_FRAME_COUNT = 6;
const EXPLOSION_FRAME_SIZE = 64;
const EXPLOSION_BASE_SIZE = 2.0;

/* Explosion SoA Store */
const explosion = {
  alive: new Uint8Array(MAX_EXPLOSIONS),
  posX:  new Float32Array(MAX_EXPLOSIONS),
  posY:  new Float32Array(MAX_EXPLOSIONS),
  posZ:  new Float32Array(MAX_EXPLOSIONS),
  age:   new Float32Array(MAX_EXPLOSIONS),
  size:  new Float32Array(MAX_EXPLOSIONS)
};
const explosionFreeSlots = [];
for (let i = MAX_EXPLOSIONS - 1; i >= 0; i--) explosionFreeSlots.push(i);
let explosionCount = 0;

/**
 * Spawn a billboard explosion at (x, y, z) with given size.
 * @returns {number} slot index, or -1 if full
 */
function spawnExplosion(x, y, z, size) {
  if (explosionFreeSlots.length === 0) return -1;
  const idx = explosionFreeSlots.pop();
  explosion.alive[idx] = 1;
  explosion.posX[idx] = x;
  explosion.posY[idx] = y;
  explosion.posZ[idx] = z;
  explosion.age[idx] = 0;
  explosion.size[idx] = size || EXPLOSION_BASE_SIZE;
  explosionCount++;
  return idx;
}

/**
 * Age all active explosions and remove expired ones.
 */
function updateExplosions(simDt) {
  for (let i = 0; i < MAX_EXPLOSIONS; i++) {
    if (!explosion.alive[i]) continue;
    explosion.age[i] += simDt;
    if (explosion.age[i] >= EXPLOSION_DURATION) {
      explosion.alive[i] = 0;
      explosionFreeSlots.push(i);
      explosionCount--;
    }
  }
}

/**
 * Generate a procedural sprite sheet: horizontal strip of FRAME_COUNT frames.
 * Animation: white flash -> yellow-orange fireball -> transparent fade.
 * @returns {HTMLCanvasElement} offscreen canvas (width = FRAME_COUNT * FRAME_SIZE, height = FRAME_SIZE)
 */
function generateExplosionSpriteSheet() {
  const FC = EXPLOSION_FRAME_COUNT;
  const SZ = EXPLOSION_FRAME_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = FC * SZ;
  canvas.height = SZ;
  const ctx = canvas.getContext('2d');

  for (let f = 0; f < FC; f++) {
    const t = f / (FC - 1);
    const cx = f * SZ + SZ / 2;
    const cy = SZ / 2;
    const radius = SZ * (0.1 + 0.4 * Math.sqrt(t));
    const alpha = Math.max(0, 1.0 - t * t);

    /* 1. White-hot flash core (early frames, t < 0.4) */
    if (t < 0.4) {
      const flashIntensity = 1.0 - t / 0.4;
      const flashR = radius * 0.5;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
      grad.addColorStop(0, 'rgba(255,255,230,' + (flashIntensity * alpha).toFixed(3) + ')');
      grad.addColorStop(0.5, 'rgba(255,245,200,' + (flashIntensity * alpha * 0.6).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(f * SZ, 0, SZ, SZ);
    }

    /* 2. Orange/yellow fireball (all frames) */
    const fbGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    fbGrad.addColorStop(0, 'rgba(255,240,120,' + (alpha * 0.9).toFixed(3) + ')');
    fbGrad.addColorStop(0.3, 'rgba(255,180,50,' + (alpha * 0.8).toFixed(3) + ')');
    fbGrad.addColorStop(0.65, 'rgba(200,100,30,' + (alpha * 0.5).toFixed(3) + ')');
    fbGrad.addColorStop(1, 'rgba(120,40,10,0)');
    ctx.fillStyle = fbGrad;
    ctx.fillRect(f * SZ, 0, SZ, SZ);
  }

  return canvas;
}

/* GL objects stored after init */
let bbPg = null;

/**
 * Initialize the billboard explosion rendering system.
 * Creates sprite sheet texture, compiles shaders, sets up GL buffers.
 * @param {WebGLRenderingContext} gl
 * @param {ANGLE_instanced_arrays} ext
 */
function initExplosionSystem(gl, ext) {
  /* Generate and upload sprite sheet texture */
  const spriteCanvas = generateExplosionSpriteSheet();
  const spriteTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, spriteTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, spriteCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.activeTexture(gl.TEXTURE0);

  /* Compile billboard shader program */
  const vs = cS(gl, billboardVS, gl.VERTEX_SHADER);
  const fs = cS(gl, billboardFS, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Billboard shader link error:', gl.getProgramInfoLog(program));
  }

  /* Attribute locations */
  const aCorner   = gl.getAttribLocation(program, 'a_corner');
  const aBBCenter = gl.getAttribLocation(program, 'a_bbCenter');
  const aBBFrame  = gl.getAttribLocation(program, 'a_bbFrame');
  const aBBSize   = gl.getAttribLocation(program, 'a_bbSize');

  /* Uniform locations */
  const uViewProj   = gl.getUniformLocation(program, 'u_bbViewProj');
  const uView       = gl.getUniformLocation(program, 'u_bbView');
  const uFrameCount = gl.getUniformLocation(program, 'u_bbFrameCount');
  const uSprite     = gl.getUniformLocation(program, 'u_bbSprite');

  /* Quad VBO: 4 vertices with corner coords */
  const cornerData = new Float32Array([
    -0.5, -0.5,
     0.5, -0.5,
     0.5,  0.5,
    -0.5,  0.5
  ]);
  const cornerBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cornerData, gl.STATIC_DRAW);

  /* Index buffer: two triangles [0,1,2, 0,2,3] */
  const indexData = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const indexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

  /* Instance data buffer: 5 floats per instance (centerXYZ + frame + size) */
  const instanceBuf = gl.createBuffer();

  /* Store all GL state */
  bbPg = {
    program: program,
    spriteTex: spriteTex,
    aCorner: aCorner,
    aBBCenter: aBBCenter,
    aBBFrame: aBBFrame,
    aBBSize: aBBSize,
    uViewProj: uViewProj,
    uView: uView,
    uFrameCount: uFrameCount,
    uSprite: uSprite,
    cornerBuf: cornerBuf,
    indexBuf: indexBuf,
    instanceBuf: instanceBuf,
    ext: ext
  };
}

/* Pre-allocated instance data buffer (5 floats per explosion: cx, cy, cz, frame, size) */
const _bbInstanceData = new Float32Array(MAX_EXPLOSIONS * 5);

/**
 * Render all active billboard explosions.
 * @param {WebGLRenderingContext} gl
 * @param {ANGLE_instanced_arrays} ext
 * @param {Float32Array} viewMat - 4x4 view matrix (column-major)
 * @param {Float32Array} viewProjMat - 4x4 view-projection matrix (column-major)
 */
function renderExplosions(gl, ext, viewMat, viewProjMat) {
  if (explosionCount === 0 || !bbPg) return;

  /* Pack instance data for all alive explosions */
  let liveCount = 0;
  for (let i = 0; i < MAX_EXPLOSIONS; i++) {
    if (!explosion.alive[i]) continue;
    const off = liveCount * 5;
    _bbInstanceData[off]     = explosion.posX[i];
    _bbInstanceData[off + 1] = explosion.posY[i];
    _bbInstanceData[off + 2] = explosion.posZ[i];
    _bbInstanceData[off + 3] = Math.min(
      Math.floor(explosion.age[i] / EXPLOSION_DURATION * EXPLOSION_FRAME_COUNT),
      EXPLOSION_FRAME_COUNT - 1
    );
    _bbInstanceData[off + 4] = explosion.size[i];
    liveCount++;
  }

  if (liveCount === 0) return;

  gl.useProgram(bbPg.program);

  /* Enable additive blending for bright fireballs */
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  /* Disable depth write (transparent billboards should not occlude) */
  gl.depthMask(false);

  /* Bind sprite sheet on texture unit 1 */
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, bbPg.spriteTex);
  gl.activeTexture(gl.TEXTURE0);

  /* Set uniforms */
  gl.uniformMatrix4fv(bbPg.uViewProj, false, viewProjMat);
  gl.uniformMatrix4fv(bbPg.uView, false, viewMat);
  gl.uniform1f(bbPg.uFrameCount, EXPLOSION_FRAME_COUNT);
  gl.uniform1i(bbPg.uSprite, 1);

  /* Bind quad corner VBO (shared geometry, divisor 0) */
  gl.bindBuffer(gl.ARRAY_BUFFER, bbPg.cornerBuf);
  gl.enableVertexAttribArray(bbPg.aCorner);
  gl.vertexAttribPointer(bbPg.aCorner, 2, gl.FLOAT, false, 0, 0);
  ext.vertexAttribDivisorANGLE(bbPg.aCorner, 0);

  /* Upload and bind instance data (divisor 1) */
  gl.bindBuffer(gl.ARRAY_BUFFER, bbPg.instanceBuf);
  gl.bufferData(gl.ARRAY_BUFFER, _bbInstanceData.subarray(0, liveCount * 5), gl.DYNAMIC_DRAW);

  /* a_bbCenter: 3 floats at offset 0, stride 20 bytes (5 floats * 4 bytes) */
  gl.enableVertexAttribArray(bbPg.aBBCenter);
  gl.vertexAttribPointer(bbPg.aBBCenter, 3, gl.FLOAT, false, 20, 0);
  ext.vertexAttribDivisorANGLE(bbPg.aBBCenter, 1);

  /* a_bbFrame: 1 float at offset 12 bytes */
  gl.enableVertexAttribArray(bbPg.aBBFrame);
  gl.vertexAttribPointer(bbPg.aBBFrame, 1, gl.FLOAT, false, 20, 12);
  ext.vertexAttribDivisorANGLE(bbPg.aBBFrame, 1);

  /* a_bbSize: 1 float at offset 16 bytes */
  gl.enableVertexAttribArray(bbPg.aBBSize);
  gl.vertexAttribPointer(bbPg.aBBSize, 1, gl.FLOAT, false, 20, 16);
  ext.vertexAttribDivisorANGLE(bbPg.aBBSize, 1);

  /* Bind index buffer and draw instanced */
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bbPg.indexBuf);
  ext.drawElementsInstancedANGLE(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, liveCount);

  /* Restore state: reset divisors to 0 to prevent state leak */
  ext.vertexAttribDivisorANGLE(bbPg.aBBCenter, 0);
  ext.vertexAttribDivisorANGLE(bbPg.aBBFrame, 0);
  ext.vertexAttribDivisorANGLE(bbPg.aBBSize, 0);

  /* Disable attribs to prevent state leak */
  gl.disableVertexAttribArray(bbPg.aCorner);
  gl.disableVertexAttribArray(bbPg.aBBCenter);
  gl.disableVertexAttribArray(bbPg.aBBFrame);
  gl.disableVertexAttribArray(bbPg.aBBSize);

  /* Restore blend mode and depth mask */
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(true);
}
