'use strict';
// gl.js — WebGL2 context and GL/math helpers for the landing page renderer (js/scene/*).
// Ported from demo/js/core.js. Classic script (the page must open from file://, so no modules);
// every js/scene file shares one global scope, loaded in the order index.html lists them.
//
// Nothing here throws. If WebGL2 or float render targets are missing, GLX.ok stays false and main.js
// hands over to the fallback. The HUD and the game menu (js/hud.js) never depend on this file.

const cv = document.getElementById('scene');
const GLX = {ok: false, why: '', parallel: null};
let gl = null;
try {
  // antialias:false -- every pass is a fullscreen triangle, so MSAA would only cost bandwidth; edges are
  // anti-aliased by the FXAA upscale in post.js instead.
  gl = cv.getContext('webgl2', {antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance'});
  if (!gl) GLX.why = 'WebGL2 is not available';
  else if (!gl.getExtension('EXT_color_buffer_float')) GLX.why = 'float render targets are not available';
  else { GLX.ok = true; GLX.parallel = gl.getExtension('KHR_parallel_shader_compile'); }
} catch (e) { GLX.why = String((e && e.message) || e); }

// ------------------------------------------------------------------------------------------ programs
const VS_FULL = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2))*2.0-1.0;
  vUv = p*0.5+0.5; gl_Position = vec4(p,0,1);
}`;

const P = {};             // every program by name: {p, u: uniform locations (null until finished)}
const PENDING = [];
// Compile + link are only QUEUED here. With KHR_parallel_shader_compile the driver builds them in the
// background while the boot sequence plays; finishPrograms() is the first call that can block.
function program(name, vs, fs){
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const p = gl.createProgram(), v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  const Q = {p, u: null, v, f, name};
  P[name] = Q; PENDING.push(Q);
  return Q;
}
function programsReady(){
  return !GLX.parallel || PENDING.every(Q => gl.getProgramParameter(Q.p, GLX.parallel.COMPLETION_STATUS_KHR));
}
function finishPrograms(){
  for (const Q of PENDING.splice(0)) {
    if (!gl.getProgramParameter(Q.p, gl.LINK_STATUS)) {
      console.error('shader "' + Q.name + '":\n' + (gl.getShaderInfoLog(Q.v) || '') + (gl.getShaderInfoLog(Q.f) || '') + (gl.getProgramInfoLog(Q.p) || ''));
      throw new Error('shader "' + Q.name + '" failed to build');
    }
    const u = {}, n = gl.getProgramParameter(Q.p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(Q.p, i).name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(Q.p, nm); }
    Q.u = u;
    gl.deleteShader(Q.v); gl.deleteShader(Q.f);
  }
}

// ------------------------------------------------------------------------------------------ targets
function tex(w, h, ifmt, filter){
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, ifmt, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function fbo(texs){
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) { gl.deleteFramebuffer(f); throw new Error('render target unsupported'); }
  return f;
}
// frees every texture / framebuffer found among an object's own values (one level deep, plus arrays)
function freeGL(o){
  if (!o) return;
  const one = x => { if (x instanceof WebGLTexture) gl.deleteTexture(x); else if (x instanceof WebGLFramebuffer) gl.deleteFramebuffer(x); };
  for (const k in o) { const v = o[k]; if (Array.isArray(v)) v.forEach(x => (x && x.t) ? one(x.t) : one(x)); else one(v); }
}

let vao = null;
if (GLX.ok) { vao = gl.createVertexArray(); gl.bindVertexArray(vao); }
function fullscreen(){ gl.drawArrays(gl.TRIANGLES, 0, 3); }

// ------------------------------------------------------------------------------------------ maths
const V = {
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s], dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.hypot(a[0],a[1],a[2]), norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];},
  // rotate v about unit axis k by angle a (Rodrigues)
  rot:(v,k,a)=>{const c=Math.cos(a),s=Math.sin(a),d=(k[0]*v[0]+k[1]*v[1]+k[2]*v[2])*(1-c);
    return [v[0]*c+(k[1]*v[2]-k[2]*v[1])*s+k[0]*d, v[1]*c+(k[2]*v[0]-k[0]*v[2])*s+k[1]*d, v[2]*c+(k[0]*v[1]-k[1]*v[0])*s+k[2]*d];},
};
// row-major 3x3
const M3 = {
  mul:(a,b)=>{ const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r*3+c] = a[r*3]*b[c] + a[r*3+1]*b[3+c] + a[r*3+2]*b[6+c]; return o; },
  vec:(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]],
  T:m=>[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]],
  rx:a=>{ const c = Math.cos(a), s = Math.sin(a); return [1,0,0, 0,c,-s, 0,s,c]; },
  ry:a=>{ const c = Math.cos(a), s = Math.sin(a); return [c,0,s, 0,1,0, -s,0,c]; },
};
function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);   // seeded PRNG (ship greebles)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth01 = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };
const mix = (a, b, t) => a + (b - a)*t;
