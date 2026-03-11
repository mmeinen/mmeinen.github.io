/* ---- Impact Particle System ---- */

/* Constants */
const MAX_PARTICLES = 256;
const PARTICLE_LIFETIME = 0.3; // seconds

/* Particle SoA Store (following established pattern from combat.js/weapons.js) */
const particle = {
  alive: new Uint8Array(MAX_PARTICLES),
  posX:  new Float32Array(MAX_PARTICLES),
  posZ:  new Float32Array(MAX_PARTICLES),
  velX:  new Float32Array(MAX_PARTICLES),
  velZ:  new Float32Array(MAX_PARTICLES),
  age:   new Float32Array(MAX_PARTICLES),
  r:     new Float32Array(MAX_PARTICLES),
  g:     new Float32Array(MAX_PARTICLES),
  b:     new Float32Array(MAX_PARTICLES),
};
const particleFreeSlots = [];
for (let i = MAX_PARTICLES - 1; i >= 0; i--) particleFreeSlots.push(i);
let particleCount = 0;

/**
 * Spawn a burst of impact particles at the hit point.
 * Color is derived from the enemy archetype (red for Grunts).
 * @param {number} hitX - impact X position
 * @param {number} hitZ - impact Z position
 * @param {number} enemyType - archetype index (0=Grunt)
 */
function spawnImpactParticles(hitX, hitZ, enemyType) {
  const color = ARCHETYPE_COLORS[enemyType] || ARCHETYPE_COLORS[0];
  const count = 5 + Math.floor(Math.random() * 4); // 5-8 particles
  for (let n = 0; n < count; n++) {
    if (particleFreeSlots.length === 0) return;
    const idx = particleFreeSlots.pop();
    particle.alive[idx] = 1;
    particle.posX[idx] = hitX;
    particle.posZ[idx] = hitZ;
    // Random direction and speed
    const angle = Math.random() * Math.PI * 2;
    const speed = 15 + Math.random() * 25; // 15-40 units/s
    particle.velX[idx] = Math.cos(angle) * speed;
    particle.velZ[idx] = Math.sin(angle) * speed;
    particle.age[idx] = 0;
    particle.r[idx] = color[0];
    particle.g[idx] = color[1];
    particle.b[idx] = color[2];
    particleCount++;
  }
}

/**
 * Update all alive particles: age, despawn, and position.
 * No gravity -- at 0.3s lifetime they won't travel far enough for it to matter.
 * @param {number} simDt - scaled delta time
 */
function updateParticles(simDt) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!particle.alive[i]) continue;
    particle.age[i] += simDt;
    if (particle.age[i] >= PARTICLE_LIFETIME) {
      // Dead: return to free list
      particle.alive[i] = 0;
      particleFreeSlots.push(i);
      particleCount--;
    } else {
      // Move in straight line
      particle.posX[i] += particle.velX[i] * simDt;
      particle.posZ[i] += particle.velZ[i] * simDt;
    }
  }
}

/* ---- Particle Rendering ---- */
const particleRenderBuf = new Float32Array(MAX_PARTICLES * 3);
let particleGlBuf = null; // lazy-created on first render

/**
 * Render all alive impact particles as GL_POINTS using the trajectory shader.
 * Uses additive blending for bright spark effect.
 * @param {WebGLRenderingContext} gl
 * @param {WebGLProgram} trajPg - trajectory shader program
 * @param {Object} trajLocs - attribute/uniform locations
 * @param {Float32Array} vpMat - view-projection matrix
 */
function renderParticles(gl, trajPg, trajLocs, vpMat) {
  if (particleCount === 0) return;

  // Lazy GL buffer creation
  if (!particleGlBuf) {
    particleGlBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particleGlBuf);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_PARTICLES * 3 * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // Pack alive particles into render buffer
  let pCount = 0;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!particle.alive[i]) continue;
    particleRenderBuf[pCount * 3]     = particle.posX[i];
    particleRenderBuf[pCount * 3 + 1] = 0;
    particleRenderBuf[pCount * 3 + 2] = particle.posZ[i];
    pCount++;
  }
  if (pCount === 0) return;

  gl.useProgram(trajPg);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive blending for bright sparks
  gl.uniformMatrix4fv(trajLocs.uMvp, false, vpMat);

  gl.bindBuffer(gl.ARRAY_BUFFER, particleGlBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, particleRenderBuf.subarray(0, pCount * 3));
  gl.enableVertexAttribArray(trajLocs.aPos);
  gl.vertexAttribPointer(trajLocs.aPos, 3, gl.FLOAT, false, 0, 0);

  // Grunt red color with slight alpha for additive blend
  gl.uniform4f(trajLocs.uColor, 1.0, 0.314, 0.235, 0.8);
  gl.uniform1f(trajLocs.uPtSize, 3.0);
  gl.drawArrays(gl.POINTS, 0, pCount);

  // Reset blending
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disableVertexAttribArray(trajLocs.aPos);
}
