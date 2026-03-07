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
// Thrust
let thrustPower=1.5;
const THRUST_MIN=0.2, THRUST_MAX=8.0;
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
let thrusting=false;

/* ---- Gravity & trajectory simulation ---- */
// Precomputed planet GMs (radius-cubed * constant)
const _planetGM=new Float32Array(6);
for(let i=0;i<6;i++){const pr=planetData[i].radius;_planetGM[i]=PLANET_GM_K*pr*pr*pr;}

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
  for(let i=0;i<6;i++){
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
  fastForward=false;thrustPower=5.0;aimDir=null;
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
  flyMode=true;
  missileState='idle';missileTargets.length=0;missiles.length=0;
  hudOverlay.classList.add('nav-active');
  flyNavGroup.classList.add('active');
  flyHudMode.classList.add('active');
  flyCrosshair.classList.add('active');
  flyHudSpeed.classList.add('active');
  thrustSlider.classList.add('active');
  flyNavGroup.appendChild(missileFireBtn);
  updateMissileUI();
  document.querySelector('.hud-readout-bl').innerHTML='<span class="readout-label">NAV CONTROLS</span><div class="readout-controls">SPACE &mdash; THRUST<br>SCROLL &mdash; POWER<br>DRAG &mdash; ORBIT CAM<br>RIGHT-CLICK &mdash; TARGET<br>C &mdash; CLEAR TARGETS<br>B &mdash; BULLET TIME<br>1 &mdash; CLOSE CAM<br>2 &mdash; FAR CAM<br>` &mdash; EXIT</div>';
}

function exitNavMode(){
  flyMode=false;
  fastForward=false;thrusting=false;
  missileState='idle';missileTargets.length=0;missiles.length=0;
  for(let i=0;i<6;i++){detSlots[i].active=false;}
  for(let i=0;i<6;i++){
    const p=planetData[i],b=0x100+i*16;
    p.oR/=2;p.sp=p._origSp;p.ph=p._origPh;
    dv.setFloat32(b,p.oR,true);
    dv.setFloat32(b+4,p.ph,true);
    dv.setFloat32(b+8,p.sp,true);
  }
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
  thrustSlider.classList.remove('active');
  hudOverlay.appendChild(missileFireBtn);
  missileFireBtn.className='missile-fire-btn';
  canvas.style.cursor='grab';
  document.querySelector('.hud-readout-bl').innerHTML='<span class="readout-label">HELM CONTROLS</span><div class="readout-controls">DRAG &mdash; ORBIT<br>SCROLL &mdash; ZOOM<br>&larr; / &rarr; &mdash; SPIN<br>R &mdash; RESET</div>';
}

function updateNav(simDt){
  if(!flyMode)return;
  const a1=computeGravAccel(flyPos);
  flyVel[0]+=0.5*a1[0]*simDt;
  flyVel[1]+=0.5*a1[1]*simDt;
  flyVel[2]+=0.5*a1[2]*simDt;
  flyPos[0]+=flyVel[0]*simDt;
  flyPos[1]+=flyVel[1]*simDt;
  flyPos[2]+=flyVel[2]*simDt;
  const a2=computeGravAccel(flyPos);
  flyVel[0]+=0.5*a2[0]*simDt;
  flyVel[1]+=0.5*a2[1]*simDt;
  flyVel[2]+=0.5*a2[2]*simDt;
  if(thrusting&&aimDir){
    flyVel[0]+=aimDir[0]*thrustPower*simDt;
    flyVel[2]+=aimDir[2]*thrustPower*simDt;
  }
  flyPos[1]=0; flyVel[1]=0;
  const spd=v3len(flyVel);
  if(spd>0.1){
    flyFwd[0]=flyVel[0]/spd;flyFwd[1]=0;flyFwd[2]=flyVel[2]/spd;
  } else if(aimDir){
    flyFwd[0]=aimDir[0];flyFwd[1]=0;flyFwd[2]=aimDir[2];
  }
  flyUp[0]=0;flyUp[1]=1;flyUp[2]=0;
}
