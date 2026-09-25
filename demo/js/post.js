'use strict';
// post.js — screen targets, bloom chain and the final tone-map pass.

const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D u_src; uniform vec2 u_texel; out vec4 o;
void main(){
  vec3 c = texture(u_src, vUv + u_texel*vec2(-1,-1)).rgb + texture(u_src, vUv + u_texel*vec2(1,-1)).rgb
         + texture(u_src, vUv + u_texel*vec2(-1, 1)).rgb + texture(u_src, vUv + u_texel*vec2(1, 1)).rgb;
  o = vec4(min(c*0.25, vec3(400.0)), 1);
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

const FS_FINAL = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D u_scene, u_bloom;
uniform float u_bloomStr, u_expo, u_time, u_stretch; uniform vec2 u_res;
out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec3 c = texture(u_scene, vUv).rgb + texture(u_bloom, vUv).rgb*u_bloomStr*0.12;
  // astronomer's asinh stretch: lifts faint tidal tails, compresses the cores, keeps hue
  c *= u_expo;
  float L = max(dot(c, vec3(0.2126,0.7152,0.0722)), 1e-5);
  c *= asinh(L*u_stretch)/(asinh(u_stretch)*L);
  c = aces(c*1.1);
  c = pow(c, vec3(1.0/2.2));
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q,q)*0.55;
  float n = fract(sin(dot(gl_FragCoord.xy + fract(u_time)*97.0, vec2(12.9898,78.233)))*43758.5453);
  c += (n - 0.5)/255.0*1.5;
  o = vec4(c, 1);
}`;

P.down = program(VS_FULL, FS_DOWN);
P.up = program(VS_FULL, FS_UP);
P.final = program(VS_FULL, FS_FINAL);

// per-scene tone overrides (null = the galaxy/deep-zoom defaults)
const LOOK = {expo: null, stretch: null};

let tg = null;           // screen targets
function makeTargets(){
  drop(tg);
  const w = cv.width, h = cv.height;
  const t = {w, h};
  const tryFmt = (fmt) => {
    t.light = tex(w, h, fmt, (fmt === gl.RGBA32F && !HAS_FLIN) ? gl.NEAREST : gl.LINEAR);
    t.dust  = tex(w, h, gl.RGBA16F, gl.LINEAR);
    t.sceneFb = fbo([t.light, t.dust]);
    if (!t.sceneFb) { gl.deleteTexture(t.light); gl.deleteTexture(t.dust); }
    else t.lightFmt = fmt;
    return !!t.sceneFb;
  };
  // additive accumulation of ~10^6 tiny contributions: half floats lose them, so prefer fp32 when blendable
  if (!(HAS_FBLEND && tryFmt(gl.RGBA32F)) && !tryFmt(gl.RGBA16F)) fail('Could not create HDR render targets.');
  t.comp = tex(w, h, gl.RGBA16F, gl.LINEAR); t.compFb = fbo([t.comp]);
  t.comp2 = tex(w, h, gl.RGBA16F, gl.LINEAR); t.comp2Fb = fbo([t.comp2]);
  t.gb = tex(w, h, gl.RGBA32F, gl.NEAREST); t.sysFb = fbo([t.comp2, t.gb]);
  t.comp3 = tex(w, h, gl.RGBA16F, gl.LINEAR); t.comp3Fb = fbo([t.comp3]);
  t.mips = []; t.mipFb = [];
  let mw = w, mh = h;
  for (let i = 0; i < 6; i++) {
    mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
    const m = tex(mw, mh, gl.RGBA16F, gl.LINEAR);
    t.mips.push({t:m, w:mw, h:mh}); t.mipFb.push(fbo([m]));
  }
  t.fresh = true;
  tg = t;
}

function bloomFinal(srcTex, now){
  const w = tg.w, h = tg.h;
  let src = srcTex, sw = w, sh = h;
  gl.disable(gl.BLEND);
  gl.useProgram(P.down.p);
  for (let i = 0; i < tg.mips.length; i++) {
    const m = tg.mips[i];
    gl.bindFramebuffer(gl.FRAMEBUFFER, tg.mipFb[i]); gl.viewport(0, 0, m.w, m.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(P.down.u.u_src, 0);
    gl.uniform2f(P.down.u.u_texel, 1/sw, 1/sh);
    fullscreen(); src = m.t; sw = m.w; sh = m.h;
  }
  gl.useProgram(P.up.p);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = tg.mips.length - 2; i >= 0; i--) {
    const m = tg.mips[i], s = tg.mips[i+1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, tg.mipFb[i]); gl.viewport(0, 0, m.w, m.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.t); gl.uniform1i(P.up.u.u_src, 0);
    gl.uniform2f(P.up.u.u_texel, 1/s.w, 1/s.h);
    fullscreen();
  }
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, cv.width, cv.height);
  const F = P.final;
  gl.useProgram(F.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(F.u.u_scene, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tg.mips[0].t); gl.uniform1i(F.u.u_bloom, 1);
  gl.uniform1f(F.u.u_bloomStr, settings.bloom);
  let stretch = 5, adapt = 1;
  if (deep.focus === 2) { const b = deep.sys.bodies[deep.body]; stretch = 0.05 + 4.95*smooth01((Math.log10(rangeM()/b.R) - 0.3)/1.2); }
  if (deep.focus > 0 && !deep.sys.bh) {
    // eye adaptation near the star: the brighter the disc (the bigger it looks), the lower the exposure
    const ar = deep.sys.bodies[0].R/Math.max(1, V.len(deep.eye));
    adapt = 1/(1 + 45*Math.max(0, ar - 0.01));
    stretch = Math.min(stretch, 0.05 + 4.95*smooth01((0.08 - ar)/0.07));
  }
  if (LOOK.stretch != null) stretch = LOOK.stretch;
  gl.uniform1f(F.u.u_expo, LOOK.expo != null ? LOOK.expo : settings.expo*adapt);
  gl.uniform1f(F.u.u_stretch, stretch);
  gl.uniform1f(F.u.u_time, now*0.001);
  gl.uniform2f(F.u.u_res, cv.width, cv.height);
  fullscreen();
}

