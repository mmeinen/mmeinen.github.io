/* ---- Vector math helpers ---- */
function v3cross(o,a,b){o[0]=a[1]*b[2]-a[2]*b[1];o[1]=a[2]*b[0]-a[0]*b[2];o[2]=a[0]*b[1]-a[1]*b[0]}
function v3dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function v3len(a){return Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])}
function v3norm(o,a){const l=v3len(a)||1;o[0]=a[0]/l;o[1]=a[1]/l;o[2]=a[2]/l}
function v3scale(o,a,s){o[0]=a[0]*s;o[1]=a[1]*s;o[2]=a[2]*s}
function v3add(o,a,b){o[0]=a[0]+b[0];o[1]=a[1]+b[1];o[2]=a[2]+b[2]}
function rotateVecAroundAxis(out,v,axis,angle){
  const c=Math.cos(angle),s=Math.sin(angle),d=v3dot(axis,v);
  const cx=[0,0,0];v3cross(cx,axis,v);
  out[0]=v[0]*c+cx[0]*s+axis[0]*d*(1-c);
  out[1]=v[1]*c+cx[1]*s+axis[1]*d*(1-c);
  out[2]=v[2]*c+cx[2]*s+axis[2]*d*(1-c);
}

/* ---- Matrix math for ship rendering ---- */
function mat4Perspective(fovY,aspect,near,far,out){
  const f=1/Math.tan(fovY/2),nf=1/(near-far),o=out||new Float32Array(16);
  o[0]=f/aspect;o[1]=0;o[2]=0;o[3]=0;o[4]=0;o[5]=f;o[6]=0;o[7]=0;
  o[8]=0;o[9]=0;o[10]=(far+near)*nf;o[11]=-1;o[12]=0;o[13]=0;o[14]=2*far*near*nf;o[15]=0;
  return o;
}
function mat4LookAt(eye,center,up,out){
  const zx=eye[0]-center[0],zy=eye[1]-center[1],zz=eye[2]-center[2];
  const zl=Math.sqrt(zx*zx+zy*zy+zz*zz)||1;
  const fz=zx/zl,fy=zy/zl,fzz=zz/zl;
  let sx=up[1]*fzz-up[2]*fy,sy=up[2]*fz-up[0]*fzz,sz=up[0]*fy-up[1]*fz;
  const sl=Math.sqrt(sx*sx+sy*sy+sz*sz)||1;sx/=sl;sy/=sl;sz/=sl;
  const ux=fy*sz-fzz*sy,uy=fzz*sx-fz*sz,uz=fz*sy-fy*sx;
  const o=out||new Float32Array(16);
  o[0]=sx;o[1]=ux;o[2]=fz;o[3]=0;o[4]=sy;o[5]=uy;o[6]=fy;o[7]=0;
  o[8]=sz;o[9]=uz;o[10]=fzz;o[11]=0;
  o[12]=-(sx*eye[0]+sy*eye[1]+sz*eye[2]);o[13]=-(ux*eye[0]+uy*eye[1]+uz*eye[2]);
  o[14]=-(fz*eye[0]+fy*eye[1]+fzz*eye[2]);o[15]=1;
  return o;
}
function mat4Model(pos,fwd,up,right,out){
  const o=out||new Float32Array(16);
  o[0]=fwd[0];o[1]=fwd[1];o[2]=fwd[2];o[3]=0;o[4]=up[0];o[5]=up[1];o[6]=up[2];o[7]=0;
  o[8]=right[0];o[9]=right[1];o[10]=right[2];o[11]=0;o[12]=pos[0];o[13]=pos[1];o[14]=pos[2];o[15]=1;
  return o;
}
function mat4Mul(a,b,out){
  const o=out||new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++){
    let s=0;for(let k=0;k<4;k++)s+=a[r+k*4]*b[k+c*4];o[r+c*4]=s;
  }
  return o;
}
function mat3NormalFromMat4(m,out){
  const o=out||new Float32Array(9);
  o[0]=m[0];o[1]=m[1];o[2]=m[2];o[3]=m[4];o[4]=m[5];o[5]=m[6];o[6]=m[8];o[7]=m[9];o[8]=m[10];
  return o;
}

/* ---- Box geometry ---- */
function createBoxGeometry(hx,hy,hz){
  const p=[],n=[],idx=[];
  const faces=[
    {n:[0,0,1],  v:[[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz]]},
    {n:[0,0,-1], v:[[hx,-hy,-hz],[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz]]},
    {n:[1,0,0],  v:[[hx,-hy,hz],[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz]]},
    {n:[-1,0,0], v:[[-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz]]},
    {n:[0,1,0],  v:[[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz],[-hx,hy,-hz]]},
    {n:[0,-1,0], v:[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz]]}
  ];
  for(let i=0;i<6;i++){
    const f=faces[i],b=i*4;
    for(let j=0;j<4;j++){p.push(...f.v[j]);n.push(...f.n);}
    idx.push(b,b+1,b+2, b,b+2,b+3);
  }
  return{positions:new Float32Array(p),normals:new Float32Array(n),indices:new Uint16Array(idx)};
}

/* ---- Grunt enemy geometry ---- */
function createGruntGeometry(){
  const p=[],n=[],idx=[];
  let vi=0; // vertex index counter

  // Helper: add a triangular face with flat-shading normal
  function tri(v0,v1,v2){
    const ax=v1[0]-v0[0],ay=v1[1]-v0[1],az=v1[2]-v0[2];
    const bx=v2[0]-v0[0],by=v2[1]-v0[1],bz=v2[2]-v0[2];
    let nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
    const l=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
    nx/=l; ny/=l; nz/=l;
    p.push(v0[0],v0[1],v0[2], v1[0],v1[1],v1[2], v2[0],v2[1],v2[2]);
    n.push(nx,ny,nz, nx,ny,nz, nx,ny,nz);
    idx.push(vi,vi+1,vi+2);
    vi+=3;
  }

  // Helper: add a quad as two triangles (v0-v1-v2, v0-v2-v3)
  function quad(v0,v1,v2,v3){
    tri(v0,v1,v2);
    tri(v0,v2,v3);
  }

  // === Key vertices (ship faces +Z forward, Y up) ===
  // Main fuselage diamond cross-section
  const nose  = [0, 0, 0.5];
  const tail  = [0, 0, -0.4];
  const sideR = [0.2, 0, -0.05];
  const sideL = [-0.2, 0, -0.05];
  const top   = [0, 0.08, -0.05];
  const bot   = [0, -0.08, -0.05];

  // Mid-body edge points (for faceting)
  const midTR = [0.1, 0.05, -0.05];
  const midTL = [-0.1, 0.05, -0.05];
  const midBR = [0.1, -0.05, -0.05];
  const midBL = [-0.1, -0.05, -0.05];

  // Rear edge points
  const rearTR = [0.08, 0.04, -0.4];
  const rearTL = [-0.08, 0.04, -0.4];
  const rearBR = [0.08, -0.04, -0.4];
  const rearBL = [-0.08, -0.04, -0.4];

  // --- FUSELAGE: nose to mid-body (8 triangular faces) ---
  // Top-right
  tri(nose, midTR, top);
  tri(nose, sideR, midTR);
  // Top-left
  tri(nose, top, midTL);
  tri(nose, midTL, sideL);
  // Bottom-right
  tri(nose, midBR, sideR);
  tri(nose, bot, midBR);
  // Bottom-left
  tri(nose, sideL, midBL);
  tri(nose, midBL, bot);

  // --- FUSELAGE: mid-body to tail (8 quads = 16 triangles) ---
  // Top-right panel
  quad(midTR, rearTR, rearTL, midTL); // top face
  quad(top, midTR, midTL, top); // degenerate, skip -- use proper panels
  // Right panels
  quad(sideR, rearBR, rearTR, midTR);
  // Left panels
  quad(midTL, rearTL, rearBL, sideL);
  // Bottom panels
  quad(midBR, rearBR, rearBL, midBL);
  // Top panels
  quad(top, midTR, rearTR, rearTL);
  quad(top, rearTL, midTL, top); // degenerate -- fix below

  // Connect top to sides properly
  quad(midTR, sideR, rearBR, rearTR); // already done above, skip overlap
  // Rear face (flat cap)
  quad(rearTR, rearBR, rearBL, rearTL);

  // --- ENGINE NACELLES (two angular boxes) ---
  const nacW=0.03, nacH=0.02, nacD=0.075;
  for(let side=-1;side<=1;side+=2){
    const cx=side*0.18, cy=0, cz=-0.3;
    const x0=cx-nacW, x1=cx+nacW, y0=cy-nacH, y1=cy+nacH, z0=cz-nacD, z1=cz+nacD;
    // 6 faces per nacelle box
    // Front face (+Z)
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);
    // Back face (-Z)
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]);
    // Right face (+X)
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]);
    // Left face (-X)
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]);
    // Top face (+Y)
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]);
    // Bottom face (-Y)
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]);
  }

  // --- DORSAL FIN (thin triangle on top) ---
  const finBase0 = [0, 0.08, -0.1];
  const finBase1 = [0, 0.08, -0.35];
  const finTip   = [0, 0.20, -0.25];
  // Right side
  tri(finBase0, finTip, finBase1);
  // Left side (reversed winding)
  tri(finBase1, finTip, finBase0);
  // Give the fin a slight width for visibility
  const finR0 = [0.005, 0.08, -0.1];
  const finR1 = [0.005, 0.08, -0.35];
  const finRT = [0.005, 0.20, -0.25];
  const finL0 = [-0.005, 0.08, -0.1];
  const finL1 = [-0.005, 0.08, -0.35];
  const finLT = [-0.005, 0.20, -0.25];
  // Right face
  tri(finR0, finRT, finR1);
  // Left face
  tri(finL1, finLT, finL0);
  // Front edge
  tri(finR0, finL0, finLT);
  tri(finR0, finLT, finRT);
  // Back edge
  tri(finR1, finRT, finLT);
  tri(finR1, finLT, finL1);

  // --- VENTRAL PLATE (angled plate underneath) ---
  const vpFL = [-0.12, -0.08, -0.05];
  const vpFR = [0.12, -0.08, -0.05];
  const vpBL = [-0.10, -0.12, -0.30];
  const vpBR = [0.10, -0.12, -0.30];
  // Bottom face
  quad(vpFL, vpFR, vpBR, vpBL);
  // Top face (visible from above)
  quad(vpBL, vpBR, vpFR, vpFL);

  return{positions:new Float32Array(p),normals:new Float32Array(n),indices:new Uint16Array(idx)};
}
