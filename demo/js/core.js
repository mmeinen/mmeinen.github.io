'use strict';
// core.js — GL context, shared constants, GL + math helpers. Loaded first; every other module builds on it.

// =====================================================================================================
// COLLIDE — real-time galaxy collisions.
//
// Model: restricted N-body (Toomre & Toomre 1972). Each galaxy is a Plummer-sphere "core" carrying the
// galaxy's whole mass; cores feel each other (CPU, with a Chandrasekhar-style dynamical-friction drag so
// they actually merge). Stars and gas are test particles that feel only the cores — O(N·cores), which is
// what lets a million of them run on the GPU while still producing real tidal tails, bridges and rings.
//
// Units: G = 1, mass 1e11 Msun, length 3.5 kpc  =>  time 9.78 Myr, velocity 350 km/s.
//
// Particle state lives in two RGBA32F textures (pos.xyz+seed, vel.xyz+heat) ping-ponged through an MRT
// fullscreen pass. Texture rows are split into 4 SLOTS, one per galaxy; a particle's slot is its row
// band and its type (disc / bulge / gas / young) is its fractional index within the slot. Launching a
// galaxy rewrites only its slot's rows, so the running simulation is never disturbed.
// =====================================================================================================

const MYR_PER_T = 9.78, KPC_PER_L = 3.5, KMS_PER_V = 350;
const TEX_W = 1024, MAX_GAL = 4;
const T_DISC = 0.60, T_BULGE = 0.76, T_GAS = 0.94;   // type thresholds on slot-local index fraction
const FRICTION = 0.04;                               // tuned: 2-3 passages before merger (see header)
const BASE_RATE = 1.6;                               // sim time units per real second at 1x
const MAX_SUB_DT = 0.02;

const $ = id => document.getElementById(id);
const cv = $('gl'), ov = $('ov'), octx = ov.getContext('2d');

function fail(msg){
  const e = $('err'); e.style.display = 'flex';
  e.innerHTML = '<div>' + msg + '<br><br><a href="../index.html">&larr; Back to Menu</a></div>';
  throw new Error(msg);
}

const gl = cv.getContext('webgl2', {antialias:false, alpha:false, depth:false, stencil:false,
  premultipliedAlpha:false, preserveDrawingBuffer:false, powerPreference:'high-performance'});
if (!gl) fail('This demo needs WebGL2, which your browser does not provide.');
if (!gl.getExtension('EXT_color_buffer_float')) fail('This demo needs floating-point render targets (EXT_color_buffer_float).');
cv.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true;
  const el = $('err'); el.style.display = 'flex';
  el.innerHTML = '<div>The GPU dropped the graphics context (often from memory pressure at high star counts).<br><br><a href="" onclick="location.reload();return false">Reload</a> &nbsp;·&nbsp; <a href="../index.html">&larr; Back to Menu</a></div>'; });
let contextLost = false;
const HAS_FBLEND = !!gl.getExtension('EXT_float_blend');
const HAS_FLIN = !!gl.getExtension('OES_texture_float_linear');


// ------------------------------------------------------------------------------------------ shaders
const VS_FULL = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2))*2.0-1.0;
  vUv = p*0.5+0.5; gl_Position = vec4(p,0,1);
}`;

function compile(type, src){
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s); console.error(log, src);
    fail('Shader compile failed:<br><small>' + log.replace(/</g,'&lt;') + '</small>');
  }
  return s;
}
function program(vs, fs){
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) fail('Program link failed: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return {p, u};
}
const P = {};           // every module registers its programs here
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);

// --------------------------------------------------------------------------------------- GL targets
function tex(w, h, ifmt, filter, data){
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fmt = ifmt === gl.R16F ? gl.RED : gl.RGBA;
  const ty = (ifmt === gl.RGBA32F) ? gl.FLOAT : gl.HALF_FLOAT;
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, ty === gl.FLOAT ? gl.FLOAT : gl.HALF_FLOAT, data || null);
  return t;
}
function fbo(texs){
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) gl.deleteFramebuffer(f);
  return ok ? f : null;
}
function drop(o){ if (!o) return; for (const k in o) { const v = o[k];
  if (v instanceof WebGLTexture) gl.deleteTexture(v); else if (v instanceof WebGLFramebuffer) gl.deleteFramebuffer(v);
  else if (Array.isArray(v)) v.forEach(x => { if (x instanceof WebGLTexture) gl.deleteTexture(x); else if (x instanceof WebGLFramebuffer) gl.deleteFramebuffer(x); else if (x && typeof x === 'object') drop(x); }); } }

// ------------------------------------------------------------------------------------ math helpers
const V = {
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s], dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.hypot(a[0],a[1],a[2]), norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];},
};
function perspective(fovy, asp, n, f){
  const t = 1/Math.tan(fovy/2), nf = 1/(n-f);
  return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]);
}
function lookAt(e, c, up){
  const z = V.norm(V.sub(e,c)), x = V.norm(V.cross(up,z)), y = V.cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -V.dot(x,e),-V.dot(y,e),-V.dot(z,e),1]);
}
function mmul(a, b){
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  return o;
}
function minv(m){
  const a = m, o = new Float32Array(16);
  const b00=a[0]*a[5]-a[1]*a[4], b01=a[0]*a[6]-a[2]*a[4], b02=a[0]*a[7]-a[3]*a[4], b03=a[1]*a[6]-a[2]*a[5],
        b04=a[1]*a[7]-a[3]*a[5], b05=a[2]*a[7]-a[3]*a[6], b06=a[8]*a[13]-a[9]*a[12], b07=a[8]*a[14]-a[10]*a[12],
        b08=a[8]*a[15]-a[11]*a[12], b09=a[9]*a[14]-a[10]*a[13], b10=a[9]*a[15]-a[11]*a[13], b11=a[10]*a[15]-a[11]*a[14];
  const d = 1/(b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06);
  o[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*d; o[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*d; o[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*d; o[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*d;
  o[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*d; o[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*d; o[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*d; o[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*d;
  o[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*d; o[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*d; o[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*d; o[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*d;
  o[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*d; o[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*d; o[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*d; o[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*d;
  return o;
}
const rand = Math.random;
function gauss(){ let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2*Math.log(u))*Math.cos(6.283185*rand()); }
const deg = d => d*Math.PI/180;

// generic helpers (were in the deep-zoom section)
const M3 = {
  mul:(a,b)=>{ const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r*3+c] = a[r*3]*b[c] + a[r*3+1]*b[3+c] + a[r*3+2]*b[6+c]; return o; },
  vec:(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]],
  T:m=>[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]],
  rx:a=>{ const c = Math.cos(a), s = Math.sin(a); return [1,0,0, 0,c,-s, 0,s,c]; },
  ry:a=>{ const c = Math.cos(a), s = Math.sin(a); return [c,0,s, 0,1,0, -s,0,c]; },
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth01 = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };
const ease = x => x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2;
const lerp3 = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
function bbColor(T){
  const t = T/100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47*Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52*Math.log(t - 10) - 305.04; }
  else { r = 329.7*Math.pow(t - 60, -0.1332); g = 288.12*Math.pow(t - 60, -0.0755); b = 255; }
  const c = [r, g, b].map(v => clamp(v, 0, 255)/255), m = Math.max(...c);
  return c.map(v => v/m);
}
function specClass(T){ return T > 30000 ? 'O' : T > 10000 ? 'B' : T > 7500 ? 'A' : T > 6000 ? 'F' : T > 5200 ? 'G' : T > 3700 ? 'K' : 'M'; }
function viewFromBasis(r, u, f, e){
  return new Float32Array([r[0],u[0],-f[0],0, r[1],u[1],-f[1],0, r[2],u[2],-f[2],0,
    -V.dot(r,e), -V.dot(u,e), V.dot(f,e), 1]);
}
function fmtRange(m){
  if (m < 1e4) return (m/1e3).toFixed(1) + ' km';
  if (m < 1e8) return Math.round(m/1e3).toLocaleString() + ' km';
  if (m < 0.02*AU_M) return (m/1e9).toFixed(2) + ' million km';
  if (m < 0.2*LY_M) return (m/AU_M).toFixed(m < 10*AU_M ? 2 : 0) + ' AU';
  if (m < 2000*LY_M) return (m/LY_M).toFixed(m < 10*LY_M ? 2 : 0) + ' ly';
  return (m/LY_M/1000).toFixed(1) + ' kly';
}

function fullscreen(){ gl.drawArrays(gl.TRIANGLES, 0, 3); }

