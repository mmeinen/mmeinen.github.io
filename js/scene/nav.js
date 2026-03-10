/* ---- Nav mode state ---- */
let flyMode=false;
const flyPos=new Float32Array(3);
const flyFwd=new Float32Array(3);
const flyUp=new Float32Array(3);
const flyVel=new Float32Array(3);
const SHIP_HALF=[0.08,0.025,0.04], SHIP_COLOR=[0.25,0.35,0.55];
const FLY_SENSITIVITY=0.003;
// Gravity constants
const BH_GM=400;
const PLANET_GM_K=50.0;
// Altitude thrust (internal, not user-controllable)
const ALT_THRUST=2.0;
// Time scale: default is bullet time (0.03x), "b" toggles fast forward (0.5x)
let fastForward=false;
const BULLET_TIME_SCALE=0.03;
const FAST_FORWARD_SCALE=0.5;
// Trajectory preview
const TRAJ_STEPS=100;
const TRAJ_SIM_DT=0.4;
const trajArray=new Float32Array(TRAJ_STEPS*3);
const previewArray=new Float32Array(TRAJ_STEPS*3);
// Nav camera (spherical orbit around ship)
let navCamAz=0, navCamEl=0.5;
let navCamDist=3;
const NAV_CAM_DIST_MIN=15, NAV_CAM_DIST_MAX=200;
// Cached aim direction (updated each frame from mouse)
let aimDir=null;
// Orbit state machine (uses ORBIT_STATE from orbital.js)
let orbitState=2; // ORBIT_STATE.FREE (2), set after orbital.js loads
let orbitBody=-2;           // -1=BH, 0-6=planet index, -2=no body
let orbitAltitude=0;        // distance from body surface
let transferTarget=-2;      // target body index (-1=BH, 0-6=planet, -2=none)
let transferBurnDir=[0,0,0];
let transferBurnMag=0;
let targetOrbitAlt=-1;      // desired orbit altitude during transfer (-1 = use default)
let altUpHeld=false;        // up arrow key held
let altDownHeld=false;      // down arrow key held

/* ---- Gravity & trajectory simulation ---- */
// Precomputed planet GMs (radius-cubed * constant)
const _planetGM=new Float32Array(7);
for(let i=0;i<7;i++){const pr=planetData[i].radius;_planetGM[i]=PLANET_GM_K*pr*pr*pr;}

function planetPosAtTime(p,t){
  const a=p.sp*t+p.ph;
  return [p.oR*Math.sin(a), 0, p.oR*Math.cos(a)];
}
// Gravity using WASM planet positions (current frame only)
function computeGravAccel(pos){
  let dx=-pos[0], dy=-pos[1], dz=-pos[2];
  let r2=dx*dx+dy*dy+dz*dz;
  let r=Math.sqrt(r2);
  let r3=r2*r;
  let ax=0,ay=0,az=0;
  if(r3>0.001){ax+=BH_GM*dx/r3;ay+=BH_GM*dy/r3;az+=BH_GM*dz/r3;}
  for(let i=0;i<6;i++){
    const b=0x070+i*12;
    dx=dv.getFloat32(b,true)-pos[0];dy=dv.getFloat32(b+4,true)-pos[1];dz=dv.getFloat32(b+8,true)-pos[2];
    r2=dx*dx+dy*dy+dz*dz;r=Math.sqrt(r2);r3=r2*r;
    if(r3>0.001){ax+=_planetGM[i]*dx/r3;ay+=_planetGM[i]*dy/r3;az+=_planetGM[i]*dz/r3;}
  }
  {const pp=planetPosAtTime(planetData[6],simTime);
   dx=pp[0]-pos[0];dy=pp[1]-pos[1];dz=pp[2]-pos[2];
   r2=dx*dx+dy*dy+dz*dz;r=Math.sqrt(r2);r3=r2*r;
   if(r3>0.001){ax+=_planetGM[6]*dx/r3;ay+=_planetGM[6]*dy/r3;az+=_planetGM[6]*dz/r3;}}
  return [ax,ay,az];
}
// Gravity at arbitrary time (for trajectory prediction)
function computeGravAccelAtTime(pos,time){
  let dx=-pos[0], dy=-pos[1], dz=-pos[2];
  let r2=dx*dx+dy*dy+dz*dz;
  let r=Math.sqrt(r2);
  let r3=r2*r;
  let ax=0,ay=0,az=0;
  if(r3>0.001){ax+=BH_GM*dx/r3;ay+=BH_GM*dy/r3;az+=BH_GM*dz/r3;}
  for(let i=0;i<7;i++){
    const pp=planetPosAtTime(planetData[i],time);
    dx=pp[0]-pos[0];dy=pp[1]-pos[1];dz=pp[2]-pos[2];
    r2=dx*dx+dy*dy+dz*dz;r=Math.sqrt(r2);r3=r2*r;
    if(r3>0.001){ax+=_planetGM[i]*dx/r3;ay+=_planetGM[i]*dy/r3;az+=_planetGM[i]*dz/r3;}
  }
  return [ax,ay,az];
}
const _simPos=[0,0,0]; // reusable scratch for trajectory sim
function simulateTrajectory(startPos,startVel,startTime,steps,simDt,outArray,thrDir,thrPow,thrDur){
  let px=startPos[0],py=startPos[1],pz=startPos[2];
  let vx=startVel[0],vy=startVel[1],vz=startVel[2];
  let t=startTime, elapsed=0;
  let n=0;
  for(let i=0;i<steps;i++){
    outArray[n++]=px;outArray[n++]=py;outArray[n++]=pz;
    _simPos[0]=px;_simPos[1]=py;_simPos[2]=pz;
    const a1=computeGravAccelAtTime(_simPos,t);
    let ax1=a1[0],az1=a1[2];
    if(thrDir&&elapsed<thrDur){ax1+=thrDir[0]*thrPow;az1+=thrDir[2]*thrPow;}
    vx+=0.5*ax1*simDt;vy+=0.5*a1[1]*simDt;vz+=0.5*az1*simDt;
    px+=vx*simDt;py+=vy*simDt;pz+=vz*simDt;
    t+=simDt;elapsed+=simDt;
    _simPos[0]=px;_simPos[1]=py;_simPos[2]=pz;
    const a2=computeGravAccelAtTime(_simPos,t);
    let ax2=a2[0],az2=a2[2];
    if(thrDir&&elapsed<thrDur){ax2+=thrDir[0]*thrPow;az2+=thrDir[2]*thrPow;}
    vx+=0.5*ax2*simDt;vy+=0.5*a2[1]*simDt;vz+=0.5*az2*simDt;
    if(px*px+py*py+pz*pz<4){break;}
  }
  return n/3;
}
function computeAimDir(mouseX,mouseY,camP,camF,camR,camU,fovY,aspect){
  const ndcX=(2*mouseX/baseWidth-1)*aspect*Math.tan(fovY/2);
  const ndcY=(1-2*mouseY/baseHeight)*Math.tan(fovY/2);
  const rdx=camR[0]*ndcX+camU[0]*ndcY+camF[0];
  const rdy=camR[1]*ndcX+camU[1]*ndcY+camF[1];
  const rdz=camR[2]*ndcX+camU[2]*ndcY+camF[2];
  if(Math.abs(rdy)<0.0001)return null;
  const t=-camP[1]/rdy;
  if(t<0)return null;
  const hitX=camP[0]+rdx*t;
  const hitZ=camP[2]+rdz*t;
  const dx=hitX-flyPos[0], dz=hitZ-flyPos[2];
  const len=Math.sqrt(dx*dx+dz*dz);
  if(len<0.001)return null;
  return [dx/len, 0, dz/len];
}

/* ---- Target name helper ---- */
function getTargetName(idx) {
  if (idx === -2) return '';
  if (idx === -1) return 'Black Hole';
  if (idx >= 100) {
    const fi = idx - 100;
    const pi = Math.floor(fi / 4);
    const li = fi % 4;
    const pNames = ['Jupiter', 'Saturn', 'Neptune'];
    const lNames = ['L1', 'L2', 'L4', 'L5'];
    return pNames[pi] + ' ' + lNames[li];
  }
  return planetData[idx].name;
}

/* ---- L-point orbit constants ---- */
const LPOINT_SOI = 2.0;
const LPOINT_DEFAULT_ALT = 1.0;
const LPOINT_ORBIT_GM = 0.5; // tiny effective GM for orbiting an L-point

/* ---- Orbit transfer and capture ---- */
function getLPointPosition(flatIndex) {
  // Get L-point world position from the lPointPositions array (set by render loop)
  return [lPointPositions[flatIndex*3], lPointPositions[flatIndex*3+1], lPointPositions[flatIndex*3+2]];
}

function getBodyPosition(bodyIndex) {
  // Returns current position of body matching what the shader renders.
  // Planets 0-5: read from WASM memory (same source as shader uniforms)
  // Planet 6: JS-computed (not in WASM). BH: origin. L-points: from lPointPositions.
  if (bodyIndex >= 100) return getLPointPosition(bodyIndex - 100);
  if (bodyIndex === -1) return [0, 0, 0];
  if (bodyIndex >= 0 && bodyIndex < 6) {
    const b = 0x070 + bodyIndex * 12;
    return [dv.getFloat32(b, true), dv.getFloat32(b + 4, true), dv.getFloat32(b + 8, true)];
  }
  return planetPosAtTime(planetData[bodyIndex], simTime);
}

function initiateTransfer(targetIndex) {
  // Ignore if already orbiting or transferring to the same body
  if (targetIndex === orbitBody || targetIndex === transferTarget) return;
  transferTarget = targetIndex;
  orbitState = ORBIT_STATE.TRANSFER;

  // Get target orbit radius (distance from BH center)
  let targetR;
  if (targetIndex >= 100) {
    // L-point target: compute distance from BH to L-point position
    const lPos = getLPointPosition(targetIndex - 100);
    targetR = Math.sqrt(lPos[0] * lPos[0] + lPos[2] * lPos[2]);
  } else if (targetIndex === -1) {
    targetR = 8.0; // BH capture radius
  } else {
    targetR = planetData[targetIndex].oR; // already doubled in nav mode
  }

  // Current ship orbit radius
  const shipR = Math.sqrt(flyPos[0] ** 2 + flyPos[2] ** 2);

  // State-aware delta-v computation
  let dv_burn;
  if (orbitBody >= -1 && orbitBody !== -2) {
    // From ORBITING state: standard Hohmann delta-v (ship velocity is circular)
    const hoh = computeHohmannDV(shipR, targetR, BH_GM);
    dv_burn = hoh.dv;
  } else {
    // From TRANSFER or FREE state: compute from actual velocity
    const a_transfer = (shipR + targetR) / 2;
    const v_transfer = Math.sqrt(BH_GM * (2 / shipR - 1 / a_transfer));
    const v_current = Math.sqrt(flyVel[0] ** 2 + flyVel[2] ** 2);
    dv_burn = v_transfer - v_current;
  }

  // Compute prograde burn direction from current velocity (XZ plane)
  const spd = Math.sqrt(flyVel[0] ** 2 + flyVel[2] ** 2);
  if (spd > 0.01) {
    transferBurnDir[0] = flyVel[0] / spd;
    transferBurnDir[1] = 0;
    transferBurnDir[2] = flyVel[2] / spd;
  } else {
    // Fallback: tangent direction from position
    const pr = Math.sqrt(flyPos[0] ** 2 + flyPos[2] ** 2) || 1;
    transferBurnDir[0] = -flyPos[2] / pr;
    transferBurnDir[1] = 0;
    transferBurnDir[2] = flyPos[0] / pr;
  }

  // Apply delta-v as instant velocity change
  flyVel[0] += transferBurnDir[0] * dv_burn;
  flyVel[2] += transferBurnDir[2] * dv_burn;

  // Flip burn direction for inward transfers so continuous thrust pushes the right way
  if (dv_burn < 0) {
    transferBurnDir[0] = -transferBurnDir[0];
    transferBurnDir[2] = -transferBurnDir[2];
  }

  // Store burn magnitude for trajectory preview and continuous thrust direction
  transferBurnMag = Math.abs(dv_burn);

  // Initialize target orbit altitude to body default
  if (targetIndex >= 100) {
    targetOrbitAlt = LPOINT_DEFAULT_ALT;
  } else {
    targetOrbitAlt = getDefaultOrbitAlt(targetIndex);
  }

  // Clear orbit body (no longer orbiting)
  orbitBody = -2;
}

function checkSOICapture() {
  if (orbitState !== ORBIT_STATE.TRANSFER || transferTarget === -2) return;

  const targetPos = getBodyPosition(transferTarget);
  const dx = flyPos[0] - targetPos[0];
  const dz = flyPos[2] - targetPos[2];
  const dist = Math.sqrt(dx * dx + dz * dz);

  const bodyVel = getBodyVelocity(transferTarget);
  if (transferTarget >= 100) {
    // L-point capture: fixed SOI
    if (dist < LPOINT_SOI) {
      // Place ship at targetOrbitAlt from L-point center
      const captureR = LPOINT_MARKER_RADIUS + targetOrbitAlt;
      const angle = Math.atan2(dx, dz);
      flyPos[0] = targetPos[0] + captureR * Math.sin(angle);
      flyPos[2] = targetPos[2] + captureR * Math.cos(angle);
      circularizeOrbit(flyPos, flyVel, targetPos, LPOINT_ORBIT_GM, bodyVel);
      orbitState = ORBIT_STATE.ORBITING;
      orbitBody = transferTarget;
      orbitAltitude = targetOrbitAlt;
      transferTarget = -2;
      transferBurnMag = 0;
    }
  } else {
    const soi = getBodySOI(transferTarget);
    if (dist < soi) {
      // Place ship at targetOrbitAlt from body surface
      const bodyR = getBodyRadius(transferTarget);
      const captureR = bodyR + targetOrbitAlt;
      const angle = Math.atan2(dx, dz);
      flyPos[0] = targetPos[0] + captureR * Math.sin(angle);
      flyPos[2] = targetPos[2] + captureR * Math.cos(angle);
      circularizeOrbit(flyPos, flyVel, targetPos, getBodyGM(transferTarget), bodyVel);
      orbitState = ORBIT_STATE.ORBITING;
      orbitBody = transferTarget;
      orbitAltitude = targetOrbitAlt;
      transferTarget = -2;
      transferBurnMag = 0;
    }
  }
}

function updateAltitude(simDt) {
  if (orbitState !== ORBIT_STATE.ORBITING || orbitBody === -2) return;

  const ALT_RATE = 8.0; // delta-v units per second
  let dvMag = 0;

  if (altUpHeld) dvMag = ALT_RATE * simDt;    // Prograde = raise orbit
  if (altDownHeld) dvMag = -ALT_RATE * simDt;  // Retrograde = lower orbit

  if (dvMag !== 0) {
    // Apply delta-v prograde relative to the orbited body (not absolute velocity)
    const bv = getBodyVelocity(orbitBody);
    const relVx = flyVel[0] - bv[0], relVz = flyVel[2] - bv[2];
    const relSpd = Math.sqrt(relVx * relVx + relVz * relVz);
    if (relSpd > 0.01) {
      flyVel[0] += (relVx / relSpd) * dvMag;
      flyVel[2] += (relVz / relSpd) * dvMag;
    }
  }

  // L-point orbiting: co-rotate with parent planet
  if (orbitBody >= 100) {
    const fi = orbitBody - 100;
    const bodyPos = getLPointPosition(fi);
    const lpVel = getBodyVelocity(orbitBody);
    const dx = flyPos[0] - bodyPos[0];
    const dz = flyPos[2] - bodyPos[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    orbitAltitude = dist - LPOINT_MARKER_RADIUS;

    // Re-circularize each frame to co-rotate with the moving L-point
    circularizeOrbit(flyPos, flyVel, bodyPos, LPOINT_ORBIT_GM, lpVel);

    // Crash detection
    if (orbitAltitude < 0) {
      const safeR = LPOINT_MARKER_RADIUS + LPOINT_DEFAULT_ALT;
      const angle = Math.atan2(dx, dz);
      flyPos[0] = bodyPos[0] + safeR * Math.sin(angle);
      flyPos[2] = bodyPos[2] + safeR * Math.cos(angle);
      circularizeOrbit(flyPos, flyVel, bodyPos, LPOINT_ORBIT_GM, lpVel);
      orbitAltitude = LPOINT_DEFAULT_ALT;
      if (typeof flyHudAltEl !== 'undefined' && flyHudAltEl) {
        flyHudAltEl.classList.add('warning');
        setTimeout(() => flyHudAltEl.classList.remove('warning'), 1000);
      }
    }

    // Escape detection
    if (dist > LPOINT_SOI) {
      orbitState = ORBIT_STATE.FREE;
      orbitBody = -2;
    }
    return;
  }

  // Standard body orbiting (planets and BH)
  const bodyPos = getBodyPosition(orbitBody);
  const dx = flyPos[0] - bodyPos[0];
  const dz = flyPos[2] - bodyPos[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const bodyRadius = getBodyRadius(orbitBody);

  orbitAltitude = dist - bodyRadius;

  // Crash detection: altitude below zero
  if (orbitAltitude < 0) {
    // Reset ship to default orbit altitude around same body
    const defaultAlt = getDefaultOrbitAlt(orbitBody);
    const safeR = bodyRadius + defaultAlt;
    // Reposition ship at safe radius from body
    const angle = Math.atan2(dx, dz);
    flyPos[0] = bodyPos[0] + safeR * Math.sin(angle);
    flyPos[2] = bodyPos[2] + safeR * Math.cos(angle);
    circularizeOrbit(flyPos, flyVel, bodyPos, getBodyGM(orbitBody), getBodyVelocity(orbitBody));
    orbitAltitude = defaultAlt;
    // Flash warning (handled by HUD -- set a flag)
    if (typeof flyHudAltEl !== 'undefined' && flyHudAltEl) {
      flyHudAltEl.classList.add('warning');
      setTimeout(() => flyHudAltEl.classList.remove('warning'), 1000);
    }
  }

  // Escape detection: if distance exceeds SOI
  if (dist > getBodySOI(orbitBody)) {
    orbitState = ORBIT_STATE.FREE;
    orbitBody = -2;
  }
}

function enterNavMode(){
  const cx=dv.getFloat32(0x030,true), cz=dv.getFloat32(0x038,true);
  flyPos[0]=cx;flyPos[1]=0;flyPos[2]=cz;
  const r=Math.sqrt(cx*cx+cz*cz);
  const vorb=r>0.1?Math.sqrt(BH_GM/r):0;
  const rx=cx/(r||1), rz=cz/(r||1);
  flyVel[0]=-rz*vorb;flyVel[1]=0;flyVel[2]=rx*vorb;
  const spd=v3len(flyVel);
  if(spd>0.1){flyFwd[0]=flyVel[0]/spd;flyFwd[1]=0;flyFwd[2]=flyVel[2]/spd;}
  else{flyFwd[0]=0;flyFwd[1]=0;flyFwd[2]=-1;}
  flyUp[0]=0;flyUp[1]=1;flyUp[2]=0;
  navCamAz=Math.atan2(cx,cz);navCamEl=0.5;navCamDist=3;
  fastForward=false;aimDir=null;
  const tNow=simTime;
  for(let i=0;i<6;i++){
    const p=planetData[i],b=0x100+i*16;
    p._origSp=p.sp;p._origPh=p.ph;
    p.oR*=2;
    const spKep=Math.sqrt(BH_GM)/Math.pow(p.oR,1.5);
    p.ph+=(p.sp-spKep)*tNow;
    p.sp=spKep;
    dv.setFloat32(b,p.oR,true);
    dv.setFloat32(b+4,p.ph,true);
    dv.setFloat32(b+8,p.sp,true);
  }
  {const p=planetData[6];
   p._origSp=p.sp;p._origPh=p.ph;
   p.oR*=2;
   const spKep=Math.sqrt(BH_GM)/Math.pow(p.oR,1.5);
   p.ph+=(p.sp-spKep)*tNow;
   p.sp=spKep;}
  flyMode=true;
  // Initialize orbital data tables (SOI, default orbit altitudes) after oR doubling
  initOrbitalData();
  // Set initial orbit state
  orbitState=ORBIT_STATE.FREE; orbitBody=-2; transferTarget=-2;
  orbitAltitude=0; altUpHeld=false; altDownHeld=false;
  transferBurnMag=0; targetOrbitAlt=-1; transferBurnDir[0]=0; transferBurnDir[1]=0; transferBurnDir[2]=0;
  if(!enemiesSpawned){spawnTestEnemies();enemiesSpawned=true;}
  missileState='idle';missileTargets.length=0;missiles.length=0;
  hudOverlay.classList.add('nav-active');
  flyNavGroup.classList.add('active');
  flyHudMode.classList.add('active');
  flyCrosshair.classList.add('active');
  flyHudSpeed.classList.add('active');
  flyHudAltEl.classList.add('active');
  flyNavGroup.appendChild(missileFireBtn);
  updateMissileUI();
  document.querySelector('.hud-readout-bl').innerHTML='<span class="readout-label">NAV CONTROLS</span><div class="readout-controls">CLICK BODY &mdash; ORBIT TARGET<br>UP/DOWN &mdash; ALTITUDE<br>SCROLL &mdash; ZOOM<br>DRAG &mdash; ORBIT CAM<br>RIGHT-CLICK &mdash; TARGET<br>C &mdash; CLEAR TARGETS<br>B &mdash; FAST FORWARD<br>L &mdash; LAGRANGE PTS<br>1 &mdash; CLOSE CAM<br>2 &mdash; FAR CAM<br>` &mdash; EXIT</div>';
}

function exitNavMode(){
  flyMode=false;
  fastForward=false;
  // Reset orbit state
  orbitState=ORBIT_STATE.FREE; orbitBody=-2; transferTarget=-2;
  orbitAltitude=0; altUpHeld=false; altDownHeld=false;
  transferBurnMag=0; targetOrbitAlt=-1;
  lagrangeVisible=false;
  for(let i=0;i<12;i++)lPointLabels[i].style.display='none';
  missileState='idle';missileTargets.length=0;missiles.length=0;
  for(let i=0;i<6;i++){detSlots[i].active=false;}
  for(let i=0;i<6;i++){
    const p=planetData[i],b=0x100+i*16;
    p.oR/=2;p.sp=p._origSp;p.ph=p._origPh;
    dv.setFloat32(b,p.oR,true);
    dv.setFloat32(b+4,p.ph,true);
    dv.setFloat32(b+8,p.sp,true);
  }
  {const p=planetData[6];p.oR/=2;p.sp=p._origSp;p.ph=p._origPh;}
  const dx=flyPos[0],dy=flyPos[1],dz=flyPos[2];
  camDist=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(camDist<5)camDist=120;
  camAz=Math.atan2(dx,dz);
  camEl=Math.asin(Math.max(-1,Math.min(1,dy/Math.max(camDist,0.001))));
  hudOverlay.classList.remove('nav-active');
  flyNavGroup.classList.remove('active');
  flyHudMode.classList.remove('active');
  flyBulletTime.classList.remove('active');
  flyCrosshair.classList.remove('active');
  flyHudSpeed.classList.remove('active');
  flyHudAltEl.classList.remove('active');
  hudOverlay.appendChild(missileFireBtn);
  missileFireBtn.className='missile-fire-btn';
  canvas.style.cursor='grab';
  document.querySelector('.hud-readout-bl').innerHTML='<span class="readout-label">HELM CONTROLS</span><div class="readout-controls">DRAG &mdash; ORBIT<br>SCROLL &mdash; ZOOM<br>&larr; / &rarr; &mdash; SPIN<br>R &mdash; RESET</div>';
}

function updateNav(simDt){
  if(!flyMode)return;
  // Leapfrog integration: half-step velocity
  const a1=computeGravAccel(flyPos);
  flyVel[0]+=0.5*a1[0]*simDt;
  flyVel[1]+=0.5*a1[1]*simDt;
  flyVel[2]+=0.5*a1[2]*simDt;
  // Position step
  flyPos[0]+=flyVel[0]*simDt;
  flyPos[1]+=flyVel[1]*simDt;
  flyPos[2]+=flyVel[2]*simDt;
  // Second half-step velocity
  const a2=computeGravAccel(flyPos);
  flyVel[0]+=0.5*a2[0]*simDt;
  flyVel[1]+=0.5*a2[1]*simDt;
  flyVel[2]+=0.5*a2[2]*simDt;
  // Transfer state: guidance correction + SOI capture check
  if(orbitState===ORBIT_STATE.TRANSFER){
    // Up/Down adjusts target orbit altitude during transfer
    const ALT_ADJ_RATE=12.0;
    const maxAlt=transferTarget>=100?LPOINT_SOI*0.8:getBodySOI(transferTarget)*0.8;
    if(altUpHeld) targetOrbitAlt=Math.min(targetOrbitAlt+ALT_ADJ_RATE*simDt, maxAlt);
    if(altDownHeld) targetOrbitAlt=Math.max(targetOrbitAlt-ALT_ADJ_RATE*simDt, 0.5);
    // Mid-course guidance: correct for multi-body perturbations
    const tPos=getBodyPosition(transferTarget);
    const toX=tPos[0]-flyPos[0], toZ=tPos[2]-flyPos[2];
    const tDist=Math.sqrt(toX*toX+toZ*toZ);
    if(tDist>0.5){
      const tdx=toX/tDist, tdz=toZ/tDist;
      const spd=Math.sqrt(flyVel[0]**2+flyVel[2]**2);
      if(spd>0.01){
        // How off-course are we? dot=1 means perfect heading, dot=-1 means opposite
        const vdx=flyVel[0]/spd, vdz=flyVel[2]/spd;
        const dot=vdx*tdx+vdz*tdz;
        const offCourse=Math.max(0,1-dot); // 0=on course, up to 2=going backwards
        const GUIDANCE_ACCEL=3.0;
        const corrForce=offCourse*GUIDANCE_ACCEL;
        flyVel[0]+=tdx*corrForce*simDt;
        flyVel[2]+=tdz*corrForce*simDt;
      }
    }
    checkSOICapture();
  }
  // Orbiting state: handle altitude adjustments
  if(orbitState===ORBIT_STATE.ORBITING){
    updateAltitude(simDt);
  }
  // Lock to ecliptic plane
  flyPos[1]=0; flyVel[1]=0;
  // Update forward direction from velocity
  const spd=v3len(flyVel);
  if(spd>0.1){
    flyFwd[0]=flyVel[0]/spd;flyFwd[1]=0;flyFwd[2]=flyVel[2]/spd;
  } else if(aimDir){
    flyFwd[0]=aimDir[0];flyFwd[1]=0;flyFwd[2]=aimDir[2];
  }
  flyUp[0]=0;flyUp[1]=1;flyUp[2]=0;
}
