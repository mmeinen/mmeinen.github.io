/* ---- Missile state ---- */
const MAX_MISSILES=6;
const missileTargets=[]; // Array of {x, z} on ecliptic
let missileState='idle'; // 'idle'|'targeting'|'fired'|'cooldown'
let missileCooldownEnd=0;
const MISSILE_COOLDOWN=5.0;
const missiles=[]; // Active in-flight missiles
const MISSILE_TRAIL_LEN=60;
const MISSILE_TRAIL_INTERVAL=0.05;
const MISSILE_HALF=[0.03,0.008,0.008];
const MISSILE_COLOR=[0.85,0.35,0.15];
const MISSILE_THRUST=12.0;
const MISSILE_NAV_GAIN=3.0;
const MISSILE_DET_RADIUS=0.5;
const missileFireBtn=document.getElementById('missile-fire-btn');

function detonateMissile(m){
  const slot=detSlots.find(s=>!s.active);
  if(!slot)return;
  slot.pos[0]=m.pos[0];slot.pos[1]=m.pos[1];slot.pos[2]=m.pos[2];
  slot.startSimTime=simTime;
  slot.active=true;
  m.detonated=true;m.detSlot=slot;
}

function updateMissiles(simDt){
  if(!flyMode)return;
  if(missileState==='cooldown'&&simTime>=missileCooldownEnd){
    missileState='idle';
  }
  for(let i=missiles.length-1;i>=0;i--){
    const m=missiles[i];
    if(!m.alive)continue;
    const g=computeGravAccel(m.pos);
    let dx=m.targetPos[0]-m.pos[0], dz=m.targetPos[2]-m.pos[2];
    let dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<MISSILE_DET_RADIUS){detonateMissile(m);m.alive=false;continue;}
    if(m.pos[0]*m.pos[0]+m.pos[2]*m.pos[2]<4){m.alive=false;continue;}
    let losX=dx/(dist||1), losZ=dz/(dist||1);
    let vDotLos=m.vel[0]*losX+m.vel[2]*losZ;
    let crossX=m.vel[0]-vDotLos*losX, crossZ=m.vel[2]-vDotLos*losZ;
    let crossSpeed=Math.sqrt(crossX*crossX+crossZ*crossZ);
    let losRate=crossSpeed/(dist||1);
    let closingSpeed=Math.max(-vDotLos,1.0);
    let perpX=-losZ, perpZ=losX;
    let pnSign=(crossX*perpX+crossZ*perpZ)>0?-1:1;
    let pnMag=MISSILE_NAV_GAIN*closingSpeed*losRate;
    let ax=g[0]+MISSILE_THRUST*losX+pnSign*pnMag*perpX;
    let az=g[2]+MISSILE_THRUST*losZ+pnSign*pnMag*perpZ;
    m.vel[0]+=ax*simDt;m.vel[2]+=az*simDt;
    m.pos[0]+=m.vel[0]*simDt;m.pos[2]+=m.vel[2]*simDt;
    m.pos[1]=0;m.vel[1]=0;
    let spd=Math.sqrt(m.vel[0]*m.vel[0]+m.vel[2]*m.vel[2]);
    if(spd>0.01){m.fwd[0]=m.vel[0]/spd;m.fwd[1]=0;m.fwd[2]=m.vel[2]/spd;}
    m.trailTimer+=simDt;
    if(m.trailTimer>=MISSILE_TRAIL_INTERVAL){
      m.trailTimer=0;
      const idx=m.trailHead*3;
      m.trail[idx]=m.pos[0];m.trail[idx+1]=m.pos[1];m.trail[idx+2]=m.pos[2];
      m.trailHead=(m.trailHead+1)%MISSILE_TRAIL_LEN;
      if(m.trailCount<MISSILE_TRAIL_LEN)m.trailCount++;
    }
  }
  if(missileState==='fired'){
    const allDead=missiles.every(m=>!m.alive);
    if(allDead){
      const allExpired=missiles.every(m=>{
        if(!m.detonated)return true;
        return !m.detSlot||!m.detSlot.active;
      });
      if(allExpired){
        missileState='cooldown';
        missileCooldownEnd=simTime+MISSILE_COOLDOWN;
        missiles.length=0;
      }
    }
  }
}

function updateMissileUI(){
  if(!flyMode){missileFireBtn.className='missile-fire-btn';return;}
  if(missileState==='idle'){
    missileFireBtn.className='missile-fire-btn idle-hint';
    missileFireBtn.textContent='RIGHT-CLICK TO TARGET';
  }else if(missileState==='targeting'){
    missileFireBtn.className='missile-fire-btn active';
    missileFireBtn.textContent='FIRE SALVO ['+missileTargets.length+'/6]';
  }else if(missileState==='fired'){
    const alive=missiles.filter(m=>m.alive).length;
    missileFireBtn.className='missile-fire-btn in-flight';
    missileFireBtn.textContent='SALVO IN FLIGHT ['+alive+']';
  }else if(missileState==='cooldown'){
    const rem=Math.max(0,missileCooldownEnd-simTime);
    missileFireBtn.className='missile-fire-btn cooldown';
    missileFireBtn.textContent='COOLDOWN '+rem.toFixed(1)+'s';
  }
}
