'use strict';
// post.js — screen targets, bloom, tone map (all at the render scale), then the FXAA upscale to the canvas.
//
// Bloom and tone map are ported from demo/js/post.js (asinh stretch, ACES, lateral colour, vignette). Unlike
// the demo, the scene here renders at an adaptive renderScale (main.js), so the tone-mapped image goes to an
// LDR target and a full-resolution FXAA pass anti-aliases it WHILE upscaling; film grain and the launch warp
// are applied in that pass too, so they stay crisp at any render scale.
//
// Unlike the demo, only light brighter than ~1 blooms (FS_BLOOM_PRE, a soft knee on the first downsample). The
// demo's thresholdless bloom added ~70% of a blurred copy of the whole frame back onto itself: Gargantua's shadow
// read 47/255 instead of ~12 (its corona haze), and a ship in front of the ocean glint lost its dark hull (174/255
// instead of 18). With the prefilter the shadow is black, the photon ring crisp, and the highlights still glow.

const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D u_src; uniform vec2 u_texel; out vec4 o;
void main(){
  vec3 c = texture(u_src, vUv + u_texel*vec2(-1,-1)).rgb + texture(u_src, vUv + u_texel*vec2(1,-1)).rgb
         + texture(u_src, vUv + u_texel*vec2(-1, 1)).rgb + texture(u_src, vUv + u_texel*vec2(1, 1)).rgb;
  o = vec4(min(c*0.25, vec3(400.0)), 1);
}`;

// FS_DOWN plus a soft-knee threshold on the brightest channel: nothing below 0.5 blooms, a quadratic ramp to 1.5,
// then everything above 1 (knee 1.0). Level 0 of the bloom chain only; the rest downsample with FS_DOWN.
const FS_BLOOM_PRE = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D u_src; uniform vec2 u_texel; out vec4 o;
void main(){
  vec3 c = texture(u_src, vUv + u_texel*vec2(-1,-1)).rgb + texture(u_src, vUv + u_texel*vec2(1,-1)).rgb
         + texture(u_src, vUv + u_texel*vec2(-1, 1)).rgb + texture(u_src, vUv + u_texel*vec2(1, 1)).rgb;
  c = max(min(c*0.25, vec3(400.0)), vec3(0.0));
  float l = max(max(c.r, c.g), c.b), s = clamp(l - 0.5, 0.0, 1.0);
  o = vec4(c*(max(s*s*0.5, l - 1.0)/max(l, 1e-4)), 1);
}`;

const FS_UP = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D u_src; uniform vec2 u_texel; out vec4 o;
void main(){
  vec2 t = u_texel;
  vec3 c = texture(u_src, vUv).rgb*4.0
    + (texture(u_src, vUv+vec2(t.x,0)).rgb + texture(u_src, vUv-vec2(t.x,0)).rgb
     + texture(u_src, vUv+vec2(0,t.y)).rgb + texture(u_src, vUv-vec2(0,t.y)).rgb)*2.0
    + texture(u_src, vUv+t).rgb + texture(u_src, vUv-t).rgb
    + texture(u_src, vUv+vec2(t.x,-t.y)).rgb + texture(u_src, vUv+vec2(-t.x,t.y)).rgb;
  o = vec4(c/16.0, 1);
}`;

// demo/js/post.js FS_FINAL minus the grain (moved to the full-resolution pass below); the bloom weight is doubled
// (0.12 -> 0.24) because the prefiltered chain carries only the highlights.
// u_film (0 at station, 0.5 at the helm, 1 in a fight) blends in the print-film look of an IMAX 70 mm release:
// halation (the red glow film lays round a highlight, light scattered back through the base into the red layer), the
// glow running warm, a little desaturation, a gentle S, warm highlights over neutral-cool shadows, a deeper vignette.
const FS_TONE = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D u_scene, u_bloom;
uniform float u_bloomStr, u_expo, u_stretch, u_film;
out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec2 dq = vUv - 0.5; float ca = 0.006*dot(dq, dq);        // a lens's lateral colour, strongest at the edges
  vec3 bl = texture(u_bloom, vUv).rgb;
  vec3 c = vec3(texture(u_scene, vUv - dq*ca).r, texture(u_scene, vUv).g, texture(u_scene, vUv + dq*ca).b)
         + bl*u_bloomStr*0.24*mix(vec3(1.0), vec3(1.12, 0.93, 0.8), u_film)
         + bl*vec3(0.5, 0.1, 0.02)*0.12*u_film;
  // astronomer's asinh stretch: lifts faint detail, compresses the cores, keeps hue
  c *= u_expo;
  float L = max(dot(c, vec3(0.2126,0.7152,0.0722)), 1e-5);
  c *= asinh(L*u_stretch)/(asinh(u_stretch)*L);
  c = aces(c*1.1);
  c = pow(c, vec3(1.0/2.2));
  if (u_film > 0.001) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 g = mix(vec3(l), c, 0.87);
    g = mix(g, g*g*(3.0 - 2.0*g), 0.3);
    g *= mix(vec3(0.975, 0.99, 1.025), vec3(1.045, 1.0, 0.94), smoothstep(0.25, 0.9, l));
    c = mix(c, g, u_film);
  }
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q,q)*(0.55 + 0.25*u_film);
  o = vec4(c, 1);
}`;

// FXAA (from the old landing page's resolve pass) + film grain + the launch warp. u_warp 0..1 smears the image
// radially toward the centre (the jump), u_flash fades to white. In film mode (u_film) the grain runs heavier and steps at
// 24 frames a second, as film does, and the gate weaves (u_weave, UV; cutaways only -- the HUD does not weave).
const FS_RESOLVE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_tex; uniform vec2 u_invRes, u_weave; uniform float u_time, u_warp, u_flash, u_film;
out vec4 o;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fxaa(vec2 uv){
  vec2 inv = u_invRes;
  vec3 rgbM  = texture(u_tex, uv).rgb;
  vec3 rgbNW = texture(u_tex, uv + vec2(-1.0, -1.0)*inv).rgb;
  vec3 rgbNE = texture(u_tex, uv + vec2( 1.0, -1.0)*inv).rgb;
  vec3 rgbSW = texture(u_tex, uv + vec2(-1.0,  1.0)*inv).rgb;
  vec3 rgbSE = texture(u_tex, uv + vec2( 1.0,  1.0)*inv).rgb;
  float lM = luma(rgbM), lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax*0.125)) return rgbM;       // flat region: nothing to smooth
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float dirReduce = max((lNW + lNE + lSW + lSE)*0.25*0.125, 1.0/128.0);
  float rcpDirMin = 1.0/(min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir*rcpDirMin, -8.0, 8.0)*inv;
  vec3 rgbA = 0.5*(texture(u_tex, uv + dir*(1.0/3.0 - 0.5)).rgb + texture(u_tex, uv + dir*(2.0/3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA*0.5 + 0.25*(texture(u_tex, uv + dir*-0.5).rgb + texture(u_tex, uv + dir*0.5).rgb);
  float lB = luma(rgbB);
  return (lB < lMin || lB > lMax) ? rgbA : rgbB;
}
void main(){
  vec3 c;
  if (u_warp > 0.001) {
    vec2 d = vUv - 0.5; c = vec3(0.0);
    for (int i = 0; i < 16; i++) { float t = float(i)/15.0; c += texture(u_tex, 0.5 + d*(1.0 - u_warp*0.45*t)).rgb; }
    c *= (1.0 + 2.2*u_warp*u_warp)/16.0;
  } else c = fxaa(vUv + u_weave);
  c = mix(c, vec3(1.0), u_flash);
  float gt = u_film > 0.5 ? floor(u_time*24.0)/24.0 : u_time;
  float n = fract(sin(dot(gl_FragCoord.xy + fract(gt)*97.0, vec2(12.9898,78.233)))*43758.5453);
  c += (n - 0.5)/255.0*(1.5 + 1.6*u_film);
  c *= 1.0 + (n - 0.5)*(0.05 + 0.05*u_film)*(1.0 - c.g);     // film grain, mostly in the shadows and mids
  o = vec4(c, 1);
}`;

function postPrograms(){
  program('bloomPre', VS_FULL, FS_BLOOM_PRE);
  program('down', VS_FULL, FS_DOWN);
  program('up', VS_FULL, FS_UP);
  program('tone', VS_FULL, FS_TONE);
  program('resolve', VS_FULL, FS_RESOLVE);
}

let T = null;             // render-scale targets
function makeTargets(w, h){
  const t = {w, h};
  t.comp = tex(w, h, gl.RGBA16F, gl.LINEAR); t.compFb = fbo([t.comp]);          // the lensed hole (the sky)
  t.comp2 = tex(w, h, gl.RGBA16F, gl.LINEAR); t.comp2Fb = fbo([t.comp2]);       // + surfaces
  t.gb = tex(w, h, gl.RGBA32F, gl.NEAREST); t.sysFb = fbo([t.comp2, t.gb]);      // deferred hit buffer
  t.comp3 = tex(w, h, gl.RGBA16F, gl.LINEAR); t.comp3Fb = fbo([t.comp3]);       // + clouds and atmosphere
  t.ldr = tex(w, h, gl.RGBA8, gl.LINEAR); t.ldrFb = fbo([t.ldr]);               // tone mapped, for FXAA
  t.mips = []; t.mipFb = [];
  let mw = w, mh = h;
  for (let i = 0; i < 6; i++) {
    mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
    const m = tex(mw, mh, gl.RGBA16F, gl.LINEAR);
    t.mips.push({t: m, w: mw, h: mh}); t.mipFb.push(fbo([m]));
  }
  const old = T; T = t; freeGL(old);          // built first: if the GPU refuses a target, the old set stays valid
}

// src: the finished HDR frame (T.w x T.h). Draws to the canvas (cw x ch).
function postProcess(src, cw, ch, timeSec, look){
  const w = T.w, h = T.h;
  let s = src, sw = w, sh = h;
  gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
  for (let i = 0; i < T.mips.length; i++) {
    const m = T.mips[i], Q = i ? P.down : P.bloomPre;           // the first level keeps only the highlights
    gl.useProgram(Q.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.mipFb[i]); gl.viewport(0, 0, m.w, m.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s); gl.uniform1i(Q.u.u_src, 0);
    gl.uniform2f(Q.u.u_texel, 1/sw, 1/sh);
    fullscreen(); s = m.t; sw = m.w; sh = m.h;
  }
  gl.useProgram(P.up.p);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = T.mips.length - 2; i >= 0; i--) {
    const m = T.mips[i], n = T.mips[i+1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.mipFb[i]); gl.viewport(0, 0, m.w, m.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, n.t); gl.uniform1i(P.up.u.u_src, 0);
    gl.uniform2f(P.up.u.u_texel, 1/n.w, 1/n.h);
    fullscreen();
  }
  gl.disable(gl.BLEND);
  // tone map at the render scale
  const F = P.tone;
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.ldrFb); gl.viewport(0, 0, w, h);
  gl.useProgram(F.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(F.u.u_scene, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.mips[0].t); gl.uniform1i(F.u.u_bloom, 1);
  gl.uniform1f(F.u.u_bloomStr, look.bloom); gl.uniform1f(F.u.u_expo, look.expo); gl.uniform1f(F.u.u_stretch, look.stretch);
  gl.uniform1f(F.u.u_film, look.film || 0);
  fullscreen();
  // FXAA upscale + grain + warp, full resolution
  const Rz = P.resolve;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch);
  gl.useProgram(Rz.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.ldr); gl.uniform1i(Rz.u.u_tex, 0);
  gl.uniform2f(Rz.u.u_invRes, 1/w, 1/h);
  gl.uniform1f(Rz.u.u_time, timeSec); gl.uniform1f(Rz.u.u_warp, look.warp || 0); gl.uniform1f(Rz.u.u_flash, look.flash || 0);
  gl.uniform1f(Rz.u.u_film, look.film || 0);
  const wv = look.weave || [0, 0]; gl.uniform2f(Rz.u.u_weave, wv[0]/cw, wv[1]/ch);           // px -> UV
  fullscreen();
}
