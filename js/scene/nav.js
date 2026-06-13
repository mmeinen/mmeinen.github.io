/* ---- Nav mode state ---- */
let flyMode=false;
const flyPos=new Float32Array(3);
const flyFwd=new Float32Array(3);
const flyUp=new Float32Array(3);
const flyVel=new Float32Array(3);
const SHIP_HALF=[5,1.5,3], SHIP_COLOR=[0.25,0.35,0.55]; // km -- player ship half-extents (~10 km total)
const FLY_SENSITIVITY=0.003;
// Abstract-unit gravity constants (used by abstract-unit callers: trajectory preview, resetCombat)
const BH_GM=400;
const PLANET_GM_K=50.0;
// km-scale gravity constants (from scale.js: BH_GM_KM, ORBIT_SCALE, BODY_SCALE)
// Planet GM at km scale: maintain same SOI proportions as abstract units
// _planetGM_km[i] = PLANET_GM_K * (radius * BODY_SCALE)^3 / ORBIT_SCALE^3
// This preserves the ratio planetGM/BH_GM (hence SOI fraction) at km scale.
const _PLANET_GM_K_KM = PLANET_GM_K * Math.pow(BODY_SCALE, 3) / Math.pow(ORBIT_SCALE, 3);
// Altitude thrust in km/s^2 (proportional to abstract ALT_THRUST=2.0)
const ALT_THRUST=2.0;
const ALT_THRUST_KM=ALT_THRUST*ORBIT_SCALE;
// Time scaling removed (Phase 10) -- simDtSec = dtSec always. Warp: Phase 14.
// Trajectory preview
const TRAJ_STEPS=100;
const TRAJ_SIM_DT=0.4;
const trajArray=new Float32Array(TRAJ_STEPS*3);
const previewArray=new Float32Array(TRAJ_STEPS*3);
// Nav camera (spherical orbit around ship)
let navCamAz=0, navCamEl=0.5;
let navCamDist=3;
// Nav camera distances in km (flyPos is km during flyMode)
const NAV_CAM_DIST_MIN=30, NAV_CAM_DIST_MAX=50000;
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
// Precomputed planet GMs -- abstract units (radius-cubed * constant)
const _planetGM=new Float32Array(5);
for(let i=0;i<5;i++){const pr=planetData[i].radius;_planetGM[i]=PLANET_GM_K*pr*pr*pr;}
// Precomputed planet GMs -- km scale
const _planetGM_km=new Float64Array(5);
for(let i=0;i<5;i++){const pr_km=planetData[i].radius*BODY_SCALE;_planetGM_km[i]=_PLANET_GM_K_KM*pr_km*pr_km*pr_km;}

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
  for(let i=0;i<5;i++){
    const b=0x070+i*12;
    dx=dv.getFloat32(b,true)-pos[0];dy=dv.getFloat32(b+4,true)-pos[1];dz=dv.getFloat32(b+8,true)-pos[2];
    r2=dx*dx+dy*dy+dz*dz;r=Math.sqrt(r2);r3=r2*r;
    if(r3>0.001){ax+=_planetGM[i]*dx/r3;ay+=_planetGM[i]*dy/r3;az+=_planetGM[i]*dz/r3;}
  }
  return [ax,ay,az];
}
// Gravity at arbitrary time (for trajectory prediction -- km scale)
function computeGravAccelAtTime(pos,time){
  let dx=-pos[0], dy=-pos[1], dz=-pos[2];
  let r2=dx*dx+dy*dy+dz*dz;
  let r=Math.sqrt(r2);
  let r3=r2*r;
  let ax=0,ay=0,az=0;
  if(r3>0.001){ax+=BH_GM_KM*dx/r3;ay+=BH_GM_KM*dy/r3;az+=BH_GM_KM*dz/r3;}
  for(let i=0;i<5;i++){
    const pp=planetPosKm(planetData[i],time);
    dx=pp[0]-pos[0];dy=pp[1]-pos[1];dz=pp[2]-pos[2];
    r2=dx*dx+dy*dy+dz*dz;r=Math.sqrt(r2);r3=r2*r;
    if(r3>0.001){ax+=_planetGM_km[i]*dx/r3;ay+=_planetGM_km[i]*dy/r3;az+=_planetGM_km[i]*dz/r3;}
  }
  return [ax,ay,az];
}
// km-scale gravity using planetPosKm (for nav physics when flyPos is in km)
function computeGravAccelKm(pos, time){
  let dx=-pos[0], dy=-pos[1], dz=-pos[2];
  let r2=dx*dx+dy*dy+dz*dz;
  let r=Math.sqrt(r2);
  let r3=r2*r;
  let ax=0,ay=0,az=0;
  if(r3>0.001){ax+=BH_GM_KM*dx/r3;ay+=BH_GM_KM*dy/r3;az+=BH_GM_KM*dz/r3;}
  for(let i=0;i<5;i++){
    const pp=planetPosKm(planetData[i],time);
    dx=pp[0]-pos[0];dy=pp[1]-pos[1];dz=pp[2]-pos[2];
    r2=dx*dx+dy*dy+dz*dz;r=Math.sqrt(r2);r3=r2*r;
    if(r3>0.001){ax+=_planetGM_km[i]*dx/r3;ay+=_planetGM_km[i]*dy/r3;az+=_planetGM_km[i]*dz/r3;}
  }
  return [ax,ay,az];
}
// km-scale gravity at arbitrary time (for km-scale trajectory prediction)
function computeGravAccelKmAtTime(pos,time){
  return computeGravAccelKm(pos,time);
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
    if(px*px+py*py+pz*pz<BH_RADIUS_KM*BH_RADIUS_KM){break;}
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
const LPOINT_SOI_KM = LPOINT_SOI * ORBIT_SCALE;
const LPOINT_DEFAULT_ALT = 1.0;
const LPOINT_DEFAULT_ALT_KM = LPOINT_DEFAULT_ALT * ORBIT_SCALE;
const LPOINT_ORBIT_GM = 0.5; // tiny effective GM for orbiting an L-point
const LPOINT_ORBIT_GM_KM = LPOINT_ORBIT_GM * Math.pow(ORBIT_SCALE, 3); // scale GM to km^3/s^2

/* ---- Orbit transfer and capture ---- */
function getLPointPosition(flatIndex) {
  // Get L-point world position from the lPointPositions array (set by render loop) -- abstract units
  return [lPointPositions[flatIndex*3], lPointPositions[flatIndex*3+1], lPointPositions[flatIndex*3+2]];
}
function getLPointPositionKm(flatIndex) {
  // Get L-point world position in km
  return [lPointPositions[flatIndex*3]*ORBIT_SCALE, lPointPositions[flatIndex*3+1]*ORBIT_SCALE, lPointPositions[flatIndex*3+2]*ORBIT_SCALE];
}

function getBodyPosition(bodyIndex) {
  // Returns current position of body in abstract units (for shader/HUD).
  // Planets 0-4: read from WASM memory (same source as shader uniforms).
  // BH: origin. L-points: from lPointPositions.
  if (bodyIndex >= 100) return getLPointPosition(bodyIndex - 100);
  if (bodyIndex === -1) return [0, 0, 0];
  if (bodyIndex >= 0 && bodyIndex < 5) {
    const b = 0x070 + bodyIndex * 12;
    return [dv.getFloat32(b, true), dv.getFloat32(b + 4, true), dv.getFloat32(b + 8, true)];
  }
  return planetPosAtTime(planetData[bodyIndex], simTime);
}

function getBodyPositionKm(bodyIndex, sTime) {
  // Returns current position of body in km (for nav physics where flyPos is km).
  if (bodyIndex >= 100) return getLPointPositionKm(bodyIndex - 100);
  if (bodyIndex === -1) return [0, 0, 0];
  return planetPosKm(planetData[bodyIndex], sTime);
}

function getBodyRadiusKm(bodyIndex) {
  // Returns body radius in km
  if (bodyIndex === -1) return BH_RADIUS_KM;
  return planetData[bodyIndex].radius * BODY_SCALE;
}

function getBodyGMKm(bodyIndex) {
  // Returns body GM in km^3/s^2
  if (bodyIndex === -1) return BH_GM_KM;
  return _planetGM_km[bodyIndex];
}

function initiateTransfer(targetIndex) {
  // Ignore if already orbiting or transferring to the same body
  if (targetIndex === orbitBody || targetIndex === transferTarget) return;
  transferTarget = targetIndex;
  orbitState = ORBIT_STATE.TRANSFER;

  // Get target orbit radius in km (distance from BH center)
  let targetR;
  if (targetIndex >= 100) {
    const lPos = getLPointPositionKm(targetIndex - 100);
    targetR = Math.sqrt(lPos[0] * lPos[0] + lPos[2] * lPos[2]);
  } else if (targetIndex === -1) {
    targetR = BH_RADIUS_KM; // BH capture radius in km
  } else {
    targetR = planetData[targetIndex].oR * ORBIT_SCALE;
  }

  // Current ship orbit radius in km (flyPos is km)
  const shipR = Math.sqrt(flyPos[0] ** 2 + flyPos[2] ** 2);

  // State-aware delta-v computation (km/s)
  let dv_burn;
  if (orbitBody >= -1 && orbitBody !== -2) {
    const hoh = computeHohmannDV(shipR, targetR, BH_GM_KM);
    dv_burn = hoh.dv;
  } else {
    const a_transfer = (shipR + targetR) / 2;
    const v_transfer = Math.sqrt(BH_GM_KM * (2 / shipR - 1 / a_transfer));
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
    const pr = Math.sqrt(flyPos[0] ** 2 + flyPos[2] ** 2) || 1;
    transferBurnDir[0] = -flyPos[2] / pr;
    transferBurnDir[1] = 0;
    transferBurnDir[2] = flyPos[0] / pr;
  }

  // Apply delta-v as instant velocity change (km/s)
  flyVel[0] += transferBurnDir[0] * dv_burn;
  flyVel[2] += transferBurnDir[2] * dv_burn;

  if (dv_burn < 0) {
    transferBurnDir[0] = -transferBurnDir[0];
    transferBurnDir[2] = -transferBurnDir[2];
  }

  transferBurnMag = Math.abs(dv_burn);

  // Initialize target orbit altitude in km
  if (targetIndex >= 100) {
    targetOrbitAlt = LPOINT_DEFAULT_ALT_KM;
  } else {
    targetOrbitAlt = getDefaultOrbitAlt(targetIndex);
  }

  // Clear orbit body (no longer orbiting)
  orbitBody = -2;
}

function checkSOICapture(sTime) {
  if (orbitState !== ORBIT_STATE.TRANSFER || transferTarget === -2) return;

  // All positions in km (flyPos is km)
  const targetPos = getBodyPositionKm(transferTarget, sTime);
  const dx = flyPos[0] - targetPos[0];
  const dz = flyPos[2] - targetPos[2];
  const dist = Math.sqrt(dx * dx + dz * dz);

  const bodyVel = getBodyVelocityKm(transferTarget, sTime);
  if (transferTarget >= 100) {
    // L-point capture: fixed SOI in km
    if (dist < LPOINT_SOI_KM) {
      const captureR = LPOINT_MARKER_RADIUS * ORBIT_SCALE + targetOrbitAlt;
      const angle = Math.atan2(dx, dz);
      flyPos[0] = targetPos[0] + captureR * Math.sin(angle);
      flyPos[2] = targetPos[2] + captureR * Math.cos(angle);
      circularizeOrbit(flyPos, flyVel, targetPos, LPOINT_ORBIT_GM_KM, bodyVel);
      orbitState = ORBIT_STATE.ORBITING;
      orbitBody = transferTarget;
      orbitAltitude = targetOrbitAlt;
      transferTarget = -2;
      transferBurnMag = 0;
    }
  } else {
    const soi = getBodySOI(transferTarget);
    if (dist < soi) {
      const bodyR = getBodyRadiusKm(transferTarget);
      const captureR = bodyR + targetOrbitAlt;
      const angle = Math.atan2(dx, dz);
      flyPos[0] = targetPos[0] + captureR * Math.sin(angle);
      flyPos[2] = targetPos[2] + captureR * Math.cos(angle);
      circularizeOrbit(flyPos, flyVel, targetPos, getBodyGMKm(transferTarget), bodyVel);
      orbitState = ORBIT_STATE.ORBITING;
      orbitBody = transferTarget;
      orbitAltitude = targetOrbitAlt;
      transferTarget = -2;
      transferBurnMag = 0;
    }
  }
}

function updateAltitude(simDt, sTime) {
  if (orbitState !== ORBIT_STATE.ORBITING || orbitBody === -2) return;

  // All positions/velocities in km (flyPos is km)
  const ALT_RATE = 8.0 * ORBIT_SCALE; // delta-v km/s per second
  let dvMag = 0;

  if (altUpHeld) dvMag = ALT_RATE * simDt;    // Prograde = raise orbit
  if (altDownHeld) dvMag = -ALT_RATE * simDt;  // Retrograde = lower orbit

  if (dvMag !== 0) {
    const bv = getBodyVelocityKm(orbitBody, sTime);
    const relVx = flyVel[0] - bv[0], relVz = flyVel[2] - bv[2];
    const relSpd = Math.sqrt(relVx * relVx + relVz * relVz);
    if (relSpd > 0.01) {
      flyVel[0] += (relVx / relSpd) * dvMag;
      flyVel[2] += (relVz / relSpd) * dvMag;
    }
  }

  // L-point orbiting: co-rotate with parent planet (km scale)
  if (orbitBody >= 100) {
    const fi = orbitBody - 100;
    const bodyPos = getLPointPositionKm(fi);
    const lpVel = getBodyVelocityKm(orbitBody, sTime);
    const dx = flyPos[0] - bodyPos[0];
    const dz = flyPos[2] - bodyPos[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    orbitAltitude = dist - LPOINT_MARKER_RADIUS * ORBIT_SCALE;

    circularizeOrbit(flyPos, flyVel, bodyPos, LPOINT_ORBIT_GM_KM, lpVel);

    if (orbitAltitude < 0) {
      const safeR = LPOINT_MARKER_RADIUS * ORBIT_SCALE + LPOINT_DEFAULT_ALT_KM;
      const angle = Math.atan2(dx, dz);
      flyPos[0] = bodyPos[0] + safeR * Math.sin(angle);
      flyPos[2] = bodyPos[2] + safeR * Math.cos(angle);
      circularizeOrbit(flyPos, flyVel, bodyPos, LPOINT_ORBIT_GM_KM, lpVel);
      orbitAltitude = LPOINT_DEFAULT_ALT_KM;
      if (typeof flyHudAltEl !== 'undefined' && flyHudAltEl) {
        flyHudAltEl.classList.add('warning');
        setTimeout(() => flyHudAltEl.classList.remove('warning'), 1000);
      }
    }

    if (dist > LPOINT_SOI_KM) {
      orbitState = ORBIT_STATE.FREE;
      orbitBody = -2;
    }
    return;
  }

  // Standard body orbiting (planets and BH) -- km scale
  const bodyPos = getBodyPositionKm(orbitBody, sTime);
  const dx = flyPos[0] - bodyPos[0];
  const dz = flyPos[2] - bodyPos[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const bodyRadius = getBodyRadiusKm(orbitBody);

  orbitAltitude = dist - bodyRadius;

  if (orbitAltitude < 0) {
    const defaultAlt = getDefaultOrbitAlt(orbitBody);
    const safeR = bodyRadius + defaultAlt;
    const angle = Math.atan2(dx, dz);
    flyPos[0] = bodyPos[0] + safeR * Math.sin(angle);
    flyPos[2] = bodyPos[2] + safeR * Math.cos(angle);
    circularizeOrbit(flyPos, flyVel, bodyPos, getBodyGMKm(orbitBody), getBodyVelocityKm(orbitBody, sTime));
    orbitAltitude = defaultAlt;
    if (typeof flyHudAltEl !== 'undefined' && flyHudAltEl) {
      flyHudAltEl.classList.add('warning');
      setTimeout(() => flyHudAltEl.classList.remove('warning'), 1000);
    }
  }

  if (dist > getBodySOI(orbitBody)) {
    orbitState = ORBIT_STATE.FREE;
    orbitBody = -2;
  }
}

function enterNavMode(){
  const cx=dv.getFloat32(0x030,true), cz=dv.getFloat32(0x038,true);
  // Convert camera position from abstract units to km
  flyPos[0]=cx*ORBIT_SCALE;flyPos[1]=0;flyPos[2]=cz*ORBIT_SCALE;
  // Compute orbital velocity in km/s using BH_GM_KM
  const r_km=Math.sqrt(flyPos[0]*flyPos[0]+flyPos[2]*flyPos[2]);
  const vorb_km=r_km>0.1?Math.sqrt(BH_GM_KM/r_km):0;
  const rx=flyPos[0]/(r_km||1), rz=flyPos[2]/(r_km||1);
  flyVel[0]=-rz*vorb_km;flyVel[1]=0;flyVel[2]=rx*vorb_km;
  const spd=v3len(flyVel);
  if(spd>0.1){flyFwd[0]=flyVel[0]/spd;flyFwd[1]=0;flyFwd[2]=flyVel[2]/spd;}
  else{flyFwd[0]=0;flyFwd[1]=0;flyFwd[2]=-1;}
  flyUp[0]=0;flyUp[1]=1;flyUp[2]=0;
  navCamAz=Math.atan2(cx,cz);navCamEl=0.5;navCamDist=NAV_CAM_DIST_MIN*2;
  aimDir=null;
  const tNow=simTime;
  // Recompute planet angular speeds to Keplerian values (using BH_GM_KM at km scale)
  // No oR doubling -- planetData.oR stays at its original abstract value
  for(let i=0;i<5;i++){
    const p=planetData[i],b=0x100+i*16;
    p._origSp=p.sp;p._origPh=p.ph;
    const oR_km=p.oR*ORBIT_SCALE;
    const spKep=Math.sqrt(BH_GM_KM)/Math.pow(oR_km,1.5);
    p.ph+=(p.sp-spKep)*tNow;
    p.sp=spKep;
    dv.setFloat32(b,p.oR,true);
    dv.setFloat32(b+4,p.ph,true);
    dv.setFloat32(b+8,p.sp,true);
  }
  flyMode=true;
  // Initialize orbital data tables (SOI, default orbit altitudes) -- now km-scale
  initOrbitalData();
  // Set initial orbit state
  orbitState=ORBIT_STATE.FREE; orbitBody=-2; transferTarget=-2;
  orbitAltitude=0; altUpHeld=false; altDownHeld=false;
  transferBurnMag=0; targetOrbitAlt=-1; transferBurnDir[0]=0; transferBurnDir[1]=0; transferBurnDir[2]=0;
  if(!enemiesSpawned){spawnTestEnemies();enemiesSpawned=true;if(typeof initShieldWall==='function')initShieldWall();}
  // VIEW-01: combat always on -- enable HUD immediately
  combatMode = true;
  canvas.style.cursor = 'crosshair';
  combatIndicatorEl.style.display = 'block';
  weaponIndicatorEl.style.display = 'block';
  tacMarkerContainer.style.display = 'block';
  for(let i=0;i<MAX_ENEMIES;i++) indicatorEls[i].classList.add('tac-hidden');
  clearLocks();for(let _mi=0;_mi<MAX_MISSILES_ACTIVE;_mi++){if(missile.alive[_mi])removeMissile(_mi);}
  hudOverlay.classList.add('nav-active');
  flyNavGroup.classList.add('active');
  flyHudMode.classList.add('active');
  flyCrosshair.classList.add('active');
  flyHudSpeed.classList.add('active');
  flyHudAltEl.classList.add('active');
  flyNavGroup.appendChild(missileFireBtn);
  updateMissileUI();
  document.querySelector('.hud-readout-bl').innerHTML='<span class="readout-label">NAV CONTROLS</span><div class="readout-controls">CLICK BODY &mdash; ORBIT TARGET<br>UP/DOWN &mdash; ALTITUDE<br>SCROLL &mdash; ZOOM<br>DRAG &mdash; ORBIT CAM<br>RIGHT-CLICK &mdash; FIRE SALVO<br>C &mdash; CLEAR LOCKS<br>1-4 &mdash; WEAPON SELECT<br>` &mdash; EXIT</div>';
}

function exitNavMode(){
  flyMode=false;
  if(typeof hideAllIndicators==='function')hideAllIndicators();
  // Reset orbit state
  orbitState=ORBIT_STATE.FREE; orbitBody=-2; transferTarget=-2;
  orbitAltitude=0; altUpHeld=false; altDownHeld=false;
  transferBurnMag=0; targetOrbitAlt=-1;
  // VIEW-02: lagrangeVisible is const false, no need to reset
  for(let i=0;i<12;i++)lPointLabels[i].style.display='none';
  clearLocks();for(let _mi=0;_mi<MAX_MISSILES_ACTIVE;_mi++){if(missile.alive[_mi])removeMissile(_mi);}
  for(let i=0;i<6;i++){detSlots[i].active=false;}
  // Restore original sp/ph (no oR change needed -- oR was never mutated)
  for(let i=0;i<5;i++){
    const p=planetData[i],b=0x100+i*16;
    p.sp=p._origSp;p.ph=p._origPh;
    dv.setFloat32(b,p.oR,true);
    dv.setFloat32(b+4,p.ph,true);
    dv.setFloat32(b+8,p.sp,true);
  }
  // Convert flyPos from km back to abstract units for camera restoration
  const dx=flyPos[0]/ORBIT_SCALE,dy=flyPos[1]/ORBIT_SCALE,dz=flyPos[2]/ORBIT_SCALE;
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

function updateNav(simDt, sTime){
  if(!flyMode)return;
  // flyPos/flyVel are in km; use km-scale gravity
  // Leapfrog integration: half-step velocity
  const a1=computeGravAccelKm(flyPos, sTime);
  flyVel[0]+=0.5*a1[0]*simDt;
  flyVel[1]+=0.5*a1[1]*simDt;
  flyVel[2]+=0.5*a1[2]*simDt;
  // Position step
  flyPos[0]+=flyVel[0]*simDt;
  flyPos[1]+=flyVel[1]*simDt;
  flyPos[2]+=flyVel[2]*simDt;
  // Second half-step velocity
  const a2=computeGravAccelKm(flyPos, sTime);
  flyVel[0]+=0.5*a2[0]*simDt;
  flyVel[1]+=0.5*a2[1]*simDt;
  flyVel[2]+=0.5*a2[2]*simDt;
  // Transfer state: guidance correction + SOI capture check
  if(orbitState===ORBIT_STATE.TRANSFER){
    // Up/Down adjusts target orbit altitude during transfer (km-scale rates)
    const ALT_ADJ_RATE=12.0*ORBIT_SCALE;
    const maxAlt=transferTarget>=100?LPOINT_SOI_KM*0.8:getBodySOI(transferTarget)*0.8;
    if(altUpHeld) targetOrbitAlt=Math.min(targetOrbitAlt+ALT_ADJ_RATE*simDt, maxAlt);
    if(altDownHeld) targetOrbitAlt=Math.max(targetOrbitAlt-ALT_ADJ_RATE*simDt, 5000);
    // Mid-course guidance: correct for multi-body perturbations (km-scale)
    const tPos=getBodyPositionKm(transferTarget, sTime);
    const toX=tPos[0]-flyPos[0], toZ=tPos[2]-flyPos[2];
    const tDist=Math.sqrt(toX*toX+toZ*toZ);
    if(tDist>500){
      const tdx=toX/tDist, tdz=toZ/tDist;
      const spd=Math.sqrt(flyVel[0]**2+flyVel[2]**2);
      if(spd>0.01){
        const vdx=flyVel[0]/spd, vdz=flyVel[2]/spd;
        const dot=vdx*tdx+vdz*tdz;
        const offCourse=Math.max(0,1-dot);
        const GUIDANCE_ACCEL=3.0*ORBIT_SCALE;
        const corrForce=offCourse*GUIDANCE_ACCEL;
        flyVel[0]+=tdx*corrForce*simDt;
        flyVel[2]+=tdz*corrForce*simDt;
      }
    }
    checkSOICapture(sTime);
  }
  // Orbiting state: handle altitude adjustments
  if(orbitState===ORBIT_STATE.ORBITING){
    updateAltitude(simDt, sTime);
  }
  // Lock to ecliptic plane
  flyPos[1]=0; flyVel[1]=0;

  // --- Player body protection (COLL-02) ---
  // Safety redirect: prevent player from entering any celestial body.
  // This is a last-resort catch after SOI capture and altitude management.
  // BH protection: 500 km safety margin outside event horizon
  const _bhDist2 = flyPos[0] * flyPos[0] + flyPos[2] * flyPos[2];
  const _bhSafe = BH_RADIUS_KM + 2500;
  if (_bhDist2 < _bhSafe * _bhSafe) {
    const _bhDist = Math.sqrt(_bhDist2);
    const _bAngle = Math.atan2(flyPos[0], flyPos[2]);
    flyPos[0] = _bhSafe * Math.sin(_bAngle);
    flyPos[2] = _bhSafe * Math.cos(_bAngle);
    // Circularize: set velocity to circular orbit at safe radius
    const _vorb = Math.sqrt(BH_GM_KM / _bhSafe);
    const _rx = flyPos[0] / _bhSafe, _rz = flyPos[2] / _bhSafe;
    flyVel[0] = -_rz * _vorb;
    flyVel[2] = _rx * _vorb;
  }
  // Planet protection: 200 km safety margin outside each planet surface
  for (let _p = 0; _p < 5; _p++) {
    const _bp = getBodyPositionKm(_p, sTime);
    const _br = getBodyRadiusKm(_p);
    const _safeR = _br + 1000;
    const _dx = flyPos[0] - _bp[0], _dz = flyPos[2] - _bp[2];
    const _d2 = _dx * _dx + _dz * _dz;
    if (_d2 < _safeR * _safeR) {
      const _dist = Math.sqrt(_d2);
      const _ang = Math.atan2(_dx, _dz);
      flyPos[0] = _bp[0] + _safeR * Math.sin(_ang);
      flyPos[2] = _bp[2] + _safeR * Math.cos(_ang);
      // Circularize around the planet
      const _gm = getBodyGMKm(_p);
      const _vOrb = Math.sqrt(_gm / _safeR);
      const _nrx = (flyPos[0] - _bp[0]) / _safeR;
      const _nrz = (flyPos[2] - _bp[2]) / _safeR;
      flyVel[0] = -_nrz * _vOrb;
      flyVel[2] = _nrx * _vOrb;
      break; // can only be inside one planet at a time
    }
  }

  // --- World boundary clamp (COLL-03 -- player) ---
  // Soft clamp: stop outward drift, preserve tangential velocity
  const _playerR2 = flyPos[0] * flyPos[0] + flyPos[2] * flyPos[2];
  if (_playerR2 > WORLD_BOUNDARY_KM * WORLD_BOUNDARY_KM) {
    const _playerR = Math.sqrt(_playerR2);
    const _nx = flyPos[0] / _playerR, _nz = flyPos[2] / _playerR;
    flyPos[0] = _nx * WORLD_BOUNDARY_KM;
    flyPos[2] = _nz * WORLD_BOUNDARY_KM;
    // Remove outward radial velocity (keep tangential)
    const _radV = flyVel[0] * _nx + flyVel[2] * _nz;
    if (_radV > 0) {
      flyVel[0] -= _radV * _nx;
      flyVel[2] -= _radV * _nz;
    }
  }

  // Update forward direction from velocity
  const spd=v3len(flyVel);
  if(spd>0.1){
    flyFwd[0]=flyVel[0]/spd;flyFwd[1]=0;flyFwd[2]=flyVel[2]/spd;
  } else if(aimDir){
    flyFwd[0]=aimDir[0];flyFwd[1]=0;flyFwd[2]=aimDir[2];
  }
  flyUp[0]=0;flyUp[1]=1;flyUp[2]=0;
}

/* ---- Reset Combat (restart from game over) ---- */
function resetCombat() {
  // Restore player state
  playerState.hp = playerState.maxHp;
  playerState.alive = true;
  playerState.deathPhase = 0;
  playerState.deathTimer = 0;
  // Zero stats but keep best scores
  playerState.stats.enemiesKilled = 0;
  playerState.stats.wavesSurvived = 1;
  playerState.stats.timeSurvived = 0;
  playerState.stats.damageDealt = 0;
  playerState.stats.shotsFired = 0;
  playerState.stats.shotsHit = 0;
  // Restore shields
  initShieldWall();
  // Camera: restore from deathCamSaved or defaults
  if (typeof deathCamSaved !== 'undefined') {
    navCamAz = deathCamSaved.az || Math.atan2(flyPos[0], flyPos[2]);
    navCamEl = 0.5;
    navCamDist = NAV_CAM_DIST_MIN * 2;
  } else {
    navCamAz = Math.atan2(flyPos[0], flyPos[2]);
    navCamEl = 0.5;
    navCamDist = NAV_CAM_DIST_MIN * 2;
  }
  // Clear all projectiles (also rebuild free slot list)
  projFreeSlots.length = 0;
  for (let i = MAX_PROJECTILES - 1; i >= 0; i--) {
    proj.alive[i] = 0;
    projFreeSlots.push(i);
  }
  projCount = 0;
  // Clear all missiles
  for (let i = 0; i < MAX_MISSILES_ACTIVE; i++) {
    if (missile.alive[i]) removeMissile(i);
  }
  clearLocks();
  // Clear all enemies
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (enemies.alive[i]) removeEnemy(i);
  }
  // Clear explosions (also rebuild free slot list)
  explosionFreeSlots.length = 0;
  for (let i = MAX_EXPLOSIONS - 1; i >= 0; i--) {
    explosion.alive[i] = 0;
    explosionFreeSlots.push(i);
  }
  explosionCount = 0;
  // Clear particles (also rebuild free slot list)
  particleFreeSlots.length = 0;
  for (let i = MAX_PARTICLES - 1; i >= 0; i--) {
    particle.alive[i] = 0;
    particleFreeSlots.push(i);
  }
  particleCount = 0;
  // Deactivate all detonation slots
  for (let i = 0; i < 6; i++) detSlots[i].active = false;
  // Reposition ship at current orbit body (km scale) or reset to a safe default orbit
  if (orbitBody >= 0 && orbitBody < 5) {
    const bp = getBodyPositionKm(orbitBody, simTime);
    const br = getBodyRadiusKm(orbitBody);
    const alt = getDefaultOrbitAlt(orbitBody);
    const angle = Math.atan2(flyPos[0] - bp[0], flyPos[2] - bp[2]);
    const r = br + alt;
    flyPos[0] = bp[0] + r * Math.sin(angle);
    flyPos[1] = 0;
    flyPos[2] = bp[2] + r * Math.cos(angle);
    circularizeOrbit(flyPos, flyVel, bp, getBodyGMKm(orbitBody), getBodyVelocityKm(orbitBody, simTime));
  } else {
    // Free orbit: compute circular orbit at current distance from BH (km)
    const dist = Math.sqrt(flyPos[0] * flyPos[0] + flyPos[2] * flyPos[2]);
    if (dist > 2000) {
      const vorb = Math.sqrt(BH_GM_KM / dist);
      const rx = flyPos[0] / dist, rz = flyPos[2] / dist;
      flyVel[0] = -rz * vorb; flyVel[1] = 0; flyVel[2] = rx * vorb;
    }
  }
  // Update forward direction from velocity
  const spd = v3len(flyVel);
  if (spd > 0.1) {
    flyFwd[0] = flyVel[0] / spd; flyFwd[1] = 0; flyFwd[2] = flyVel[2] / spd;
  }
  flyUp[0] = 0; flyUp[1] = 1; flyUp[2] = 0;
  // Reset wave system and re-spawn enemies
  if (typeof resetWaveSystem === 'function') resetWaveSystem();
  enemiesSpawned = false;
  spawnTestEnemies();
  // VIEW-01: combat always on -- reset weapon but keep combat active
  selectedWeapon = 0;
  combatMode = true;
  canvas.style.cursor = 'crosshair';
  combatIndicatorEl.style.display = 'block';
  weaponIndicatorEl.style.display = 'block';
  tacMarkerContainer.style.display = 'block';
  for(let i=0;i<MAX_ENEMIES;i++) indicatorEls[i].classList.add('tac-hidden');
  if (typeof tacTargets !== 'undefined') tacTargets.length = 0;
  // Reset vignette
  if (typeof vignetteEl !== 'undefined' && vignetteEl) {
    vignetteEl.style.setProperty('--vignette-alpha', '0');
  }
  // Reset HP bar
  if (typeof hpBarEl !== 'undefined' && hpBarEl) {
    hpBarEl.style.width = '100%';
    hpBarEl.className = 'hp-bar';
  }
  if (typeof hpTextEl !== 'undefined' && hpTextEl) {
    hpTextEl.textContent = playerState.maxHp;
  }
  // Reset bottom bar HP
  if (typeof hudHpFillEl !== 'undefined' && hudHpFillEl) {
    hudHpFillEl.style.width = '100%';
    hudHpFillEl.className = 'hud-hp-bar-fill';
  }
  if (typeof hudHpTextEl !== 'undefined' && hudHpTextEl) {
    hudHpTextEl.textContent = playerState.maxHp;
  }
  // Update missile UI
  updateMissileUI();
}
