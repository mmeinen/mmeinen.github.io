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

/* ---- Capital ship geometry (player) ---- */
/* Smooth wedge hull, bridge tower, wide-set nacelles, forward-swept wing plates.
   Bounding box: ~1.2 x 0.3 x 0.8. Distinct from Grunt's angular diamond silhouette.
   Engine nacelle rear faces have z < -0.35 for shader engine glow detection. */
function createCapitalShipGeometry(){
  const p=[],n=[],idx=[];
  let vi=0;

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

  function quad(v0,v1,v2,v3){
    tri(v0,v1,v2);
    tri(v0,v2,v3);
  }

  // === MAIN HULL: tapered wedge from rounded nose to wide stern ===
  // 7 longitudinal stations (z values) with varying half-widths (hx) and half-heights (hy)
  // Station layout: nose -> mid-fore -> shoulder -> mid -> waist -> stern-fore -> stern
  const stations = [
    { z: 0.40, hx: 0.02, hy: 0.015 },  // S0: nose tip (narrow)
    { z: 0.30, hx: 0.08, hy: 0.035 },  // S1: nose widening
    { z: 0.15, hx: 0.20, hy: 0.055 },  // S2: forward shoulder
    { z: 0.00, hx: 0.30, hy: 0.065 },  // S3: mid-hull (widest)
    { z:-0.10, hx: 0.32, hy: 0.060 },  // S4: aft of center
    { z:-0.25, hx: 0.28, hy: 0.050 },  // S5: stern-fore (tapering)
    { z:-0.40, hx: 0.22, hy: 0.040 }   // S6: stern
  ];

  // Build hull ring at each station: 8 vertices per ring (octagonal cross-section)
  // Angles: 0, 45, 90, 135, 180, 225, 270, 315 degrees
  const RING_N = 8;
  const rings = [];
  for (let si = 0; si < stations.length; si++) {
    const s = stations[si];
    const ring = [];
    for (let ri = 0; ri < RING_N; ri++) {
      const angle = (ri / RING_N) * Math.PI * 2;
      const x = Math.cos(angle) * s.hx;
      const y = Math.sin(angle) * s.hy;
      ring.push([x, y, s.z]);
    }
    rings.push(ring);
  }

  // Connect adjacent station rings with quads
  for (let si = 0; si < rings.length - 1; si++) {
    const r0 = rings[si], r1 = rings[si + 1];
    for (let ri = 0; ri < RING_N; ri++) {
      const ri2 = (ri + 1) % RING_N;
      quad(r0[ri], r0[ri2], r1[ri2], r1[ri]);
    }
  }

  // Close nose (fan from nose tip center to first ring)
  const noseCenter = [0, 0, stations[0].z + 0.02];
  for (let ri = 0; ri < RING_N; ri++) {
    const ri2 = (ri + 1) % RING_N;
    tri(noseCenter, rings[0][ri], rings[0][ri2]);
  }

  // Close stern (fan from stern center to last ring)
  const sternCenter = [0, 0, stations[stations.length - 1].z - 0.02];
  for (let ri = 0; ri < RING_N; ri++) {
    const ri2 = (ri + 1) % RING_N;
    tri(sternCenter, rings[rings.length - 1][ri2], rings[rings.length - 1][ri]);
  }

  // === BRIDGE / COMMAND TOWER ===
  // Raised section on top, centered at z=0.10 (30% from nose)
  const bW = 0.06, bH = 0.07, bD = 0.06; // half-dims
  const bCx = 0, bCy = 0.065 + bH, bCz = 0.10;  // center (sits on hull top)
  const bx0 = bCx - bW, bx1 = bCx + bW;
  const by0 = bCy - bH, by1 = bCy + bH;
  const bz0 = bCz - bD, bz1 = bCz + bD;
  // Front face
  quad([bx0,by0,bz1],[bx1,by0,bz1],[bx1,by1,bz1],[bx0,by1,bz1]);
  // Back face
  quad([bx1,by0,bz0],[bx0,by0,bz0],[bx0,by1,bz0],[bx1,by1,bz0]);
  // Right face
  quad([bx1,by0,bz1],[bx1,by0,bz0],[bx1,by1,bz0],[bx1,by1,bz1]);
  // Left face
  quad([bx0,by0,bz0],[bx0,by0,bz1],[bx0,by1,bz1],[bx0,by1,bz0]);
  // Top face
  quad([bx0,by1,bz1],[bx1,by1,bz1],[bx1,by1,bz0],[bx0,by1,bz0]);
  // Bottom face (flush with hull top)
  quad([bx0,by0,bz0],[bx1,by0,bz0],[bx1,by0,bz1],[bx0,by0,bz1]);

  // === ENGINE NACELLES ===
  // Two pods at rear, offset laterally 0.35 from centerline (wider than Grunt's 0.1)
  const nacW = 0.04, nacH = 0.03, nacD = 0.10;
  for (let side = -1; side <= 1; side += 2) {
    const cx = side * 0.35, cy = -0.01, cz = -0.32;
    const x0 = cx - nacW, x1 = cx + nacW;
    const y0 = cy - nacH, y1 = cy + nacH;
    const z0 = cz - nacD, z1 = cz + nacD; // z0 = -0.42, z1 = -0.22
    // Front face (+Z)
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);
    // Back face (-Z) -- ENGINE EXHAUST FACE (z0 = -0.42, well below -0.35 threshold)
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]);
    // Right face (+X)
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]);
    // Left face (-X)
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]);
    // Top face (+Y)
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]);
    // Bottom face (-Y)
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]);

    // Nacelle pylon connecting nacelle to hull
    const pyW = 0.015, pyH = 0.02;
    const pyX0 = cx - pyW, pyX1 = cx + pyW;
    const pyY0 = cy + nacH, pyY1 = 0.04; // from nacelle top to hull bottom
    const pyZ0 = cz - nacD * 0.5, pyZ1 = cz + nacD * 0.5;
    // Front face
    quad([pyX0,pyY0,pyZ1],[pyX1,pyY0,pyZ1],[pyX1,pyY1,pyZ1],[pyX0,pyY1,pyZ1]);
    // Back face
    quad([pyX1,pyY0,pyZ0],[pyX0,pyY0,pyZ0],[pyX0,pyY1,pyZ0],[pyX1,pyY1,pyZ0]);
  }

  // === FORWARD-SWEPT WING PLATES ===
  // Two angled panels extending forward from nacelle mounts, swept ~20 degrees
  for (let side = -1; side <= 1; side += 2) {
    // Wing root at nacelle outer edge, sweeps forward and outward
    const rootX = side * 0.32;
    const tipX = side * 0.60;
    const rootZ = -0.18;  // just forward of nacelle
    const tipZ = 0.05;    // sweeps forward past midship
    const wingY = 0.0;    // ecliptic plane
    const wingT = 0.008;  // wing thickness

    // Top surface
    quad(
      [rootX,      wingY + wingT, rootZ],
      [tipX,       wingY + wingT, tipZ],
      [tipX * 0.7, wingY + wingT, tipZ - 0.10],
      [rootX,      wingY + wingT, rootZ + 0.10]
    );
    // Bottom surface
    quad(
      [rootX,      wingY - wingT, rootZ + 0.10],
      [tipX * 0.7, wingY - wingT, tipZ - 0.10],
      [tipX,       wingY - wingT, tipZ],
      [rootX,      wingY - wingT, rootZ]
    );
    // Leading edge (front)
    quad(
      [rootX,      wingY + wingT, rootZ + 0.10],
      [tipX * 0.7, wingY + wingT, tipZ - 0.10],
      [tipX * 0.7, wingY - wingT, tipZ - 0.10],
      [rootX,      wingY - wingT, rootZ + 0.10]
    );
    // Trailing edge (back)
    quad(
      [tipX,  wingY + wingT, tipZ],
      [rootX, wingY + wingT, rootZ],
      [rootX, wingY - wingT, rootZ],
      [tipX,  wingY - wingT, tipZ]
    );
    // Wing tip
    tri(
      [tipX, wingY + wingT, tipZ],
      [tipX, wingY - wingT, tipZ],
      [tipX * 0.7, wingY + wingT, tipZ - 0.10]
    );
    tri(
      [tipX, wingY - wingT, tipZ],
      [tipX * 0.7, wingY - wingT, tipZ - 0.10],
      [tipX * 0.7, wingY + wingT, tipZ - 0.10]
    );
  }

  return{positions:new Float32Array(p),normals:new Float32Array(n),indices:new Uint16Array(idx)};
}

/* ---- Swarm enemy geometry ---- */
/* Small dart/wedge shape. Narrow pointed nose, swept-back delta wings, no nacelles.
   ~30-40 tris. Bounding box ~0.4 x 0.05 x 0.25. */
function createSwarmGeometry(){
  const p=[],n=[],idx=[];
  let vi=0;
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
  function quad(v0,v1,v2,v3){ tri(v0,v1,v2); tri(v0,v2,v3); }

  // Dart/wedge shape: pointed nose, swept-back delta wings
  const nose=[0, 0, 0.20];
  const tail=[0, 0, -0.20];
  const midTop=[0, 0.025, -0.05];
  const midBot=[0, -0.025, -0.05];
  const wingR=[0.125, 0, -0.18];
  const wingL=[-0.125, 0, -0.18];
  const tailR=[0.03, 0, -0.20];
  const tailL=[-0.03, 0, -0.20];

  // Top surfaces
  tri(nose, midTop, wingR);
  tri(nose, wingL, midTop);
  // Bottom surfaces
  tri(nose, wingR, midBot);
  tri(nose, midBot, wingL);
  // Top rear panels
  tri(midTop, tailR, wingR);
  tri(midTop, wingL, tailL);
  // Bottom rear panels
  tri(midBot, wingR, tailR);
  tri(midBot, tailL, wingL);
  // Center top rear
  tri(midTop, tailL, tail);
  tri(midTop, tail, tailR);
  // Center bottom rear
  tri(midBot, tailR, tail);
  tri(midBot, tail, tailL);
  // Wing tips (thin triangles at edges)
  tri(wingR, tailR, [0.08, 0.01, -0.12]);
  tri(wingR, [0.08, -0.01, -0.12], tailR);
  tri(wingL, [-.08, 0.01, -0.12], tailL);
  tri(wingL, tailL, [-.08, -0.01, -0.12]);
  // Rear cap
  quad(tailR, tail, tailL, [0, 0, -0.19]);

  return{positions:new Float32Array(p),normals:new Float32Array(n),indices:new Uint16Array(idx)};
}

/* ---- Bomber enemy geometry ---- */
/* Bulky wide hull. Broad rectangular fuselage, stubby wings, visible ordnance bay,
   heavy nacelles. ~60-80 tris. Bounding box ~0.5 x 0.12 x 0.4. */
function createBomberGeometry(){
  const p=[],n=[],idx=[];
  let vi=0;
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
  function quad(v0,v1,v2,v3){ tri(v0,v1,v2); tri(v0,v2,v3); }

  // === MAIN FUSELAGE: broad rectangular box ===
  const fhx=0.10, fhy=0.05, fz0=-0.22, fz1=0.22;
  // Nose taper
  const nhx=0.06, nhy=0.035;
  // Nose front face
  quad([-nhx,-nhy,fz1+0.03],[nhx,-nhy,fz1+0.03],[nhx,nhy,fz1+0.03],[-nhx,nhy,fz1+0.03]);
  // Nose to fuselage transition panels (4 trapezoids)
  quad([-nhx, nhy,fz1+0.03],[nhx, nhy,fz1+0.03],[fhx, fhy,fz1],[-fhx, fhy,fz1]); // top
  quad([-nhx,-nhy,fz1+0.03],[-fhx,-fhy,fz1],[fhx,-fhy,fz1],[nhx,-nhy,fz1+0.03]); // bot
  quad([nhx,-nhy,fz1+0.03],[nhx,nhy,fz1+0.03],[fhx,fhy,fz1],[fhx,-fhy,fz1]); // right
  quad([-nhx,nhy,fz1+0.03],[-nhx,-nhy,fz1+0.03],[-fhx,-fhy,fz1],[-fhx,fhy,fz1]); // left
  // Main fuselage box (6 faces)
  quad([-fhx,-fhy,fz1],[fhx,-fhy,fz1],[fhx,fhy,fz1],[-fhx,fhy,fz1]); // front
  quad([fhx,-fhy,fz0],[-fhx,-fhy,fz0],[-fhx,fhy,fz0],[fhx,fhy,fz0]); // back
  quad([fhx,-fhy,fz1],[fhx,-fhy,fz0],[fhx,fhy,fz0],[fhx,fhy,fz1]); // right
  quad([-fhx,-fhy,fz0],[-fhx,-fhy,fz1],[-fhx,fhy,fz1],[-fhx,fhy,fz0]); // left
  quad([-fhx,fhy,fz1],[fhx,fhy,fz1],[fhx,fhy,fz0],[-fhx,fhy,fz0]); // top
  quad([-fhx,-fhy,fz0],[fhx,-fhy,fz0],[fhx,-fhy,fz1],[-fhx,-fhy,fz1]); // bottom

  // === ORDNANCE BAY: recessed panel on underside ===
  const bay=0.06, bayD=0.015;
  quad([-bay,-fhy-bayD,-0.15],[bay,-fhy-bayD,-0.15],[bay,-fhy-bayD,0.10],[-bay,-fhy-bayD,0.10]); // bottom
  quad([-bay,-fhy,-0.15],[-bay,-fhy-bayD,-0.15],[-bay,-fhy-bayD,0.10],[-bay,-fhy,0.10]); // left wall
  quad([bay,-fhy-bayD,-0.15],[bay,-fhy,-0.15],[bay,-fhy,0.10],[bay,-fhy-bayD,0.10]); // right wall
  quad([-bay,-fhy-bayD,-0.15],[-bay,-fhy,-0.15],[bay,-fhy,-0.15],[bay,-fhy-bayD,-0.15]); // back wall
  quad([-bay,-fhy,0.10],[-bay,-fhy-bayD,0.10],[bay,-fhy-bayD,0.10],[bay,-fhy,0.10]); // front wall

  // === STUBBY WINGS ===
  for(let side=-1;side<=1;side+=2){
    const wx=side*0.20, wt=0.008;
    // Wing: flat quad from fuselage side outward
    quad([side*fhx, wt, -0.10],[wx, wt, -0.15],[wx,-wt,-0.15],[side*fhx,-wt,-0.10]);
    quad([side*fhx, wt, 0.05],[side*fhx,-wt, 0.05],[wx,-wt,-0.05],[wx, wt,-0.05]);
    // Wing top
    quad([side*fhx, wt, -0.10],[side*fhx, wt, 0.05],[wx, wt,-0.05],[wx, wt,-0.15]);
    // Wing bottom
    quad([side*fhx,-wt, 0.05],[side*fhx,-wt,-0.10],[wx,-wt,-0.15],[wx,-wt,-0.05]);
    // Wing tip
    quad([wx, wt,-0.15],[wx, wt,-0.05],[wx,-wt,-0.05],[wx,-wt,-0.15]);
  }

  // === HEAVY NACELLES ===
  const nacW=0.04, nacH=0.03, nacD=0.09;
  for(let side=-1;side<=1;side+=2){
    const cx=side*0.15, cy=0, cz=-0.15;
    const x0=cx-nacW, x1=cx+nacW, y0=cy-nacH, y1=cy+nacH, z0=cz-nacD, z1=cz+nacD;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]);
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]);
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]);
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]);
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]);
  }

  return{positions:new Float32Array(p),normals:new Float32Array(n),indices:new Uint16Array(idx)};
}

/* ---- Sniper enemy geometry ---- */
/* Long thin needle shape. Extremely elongated nose (precision barrel), minimal body,
   small stabilizer fins at rear. ~30-40 tris. Bounding box ~0.7 x 0.04 x 0.15. */
function createSniperGeometry(){
  const p=[],n=[],idx=[];
  let vi=0;
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
  function quad(v0,v1,v2,v3){ tri(v0,v1,v2); tri(v0,v2,v3); }

  // Long needle barrel
  const nose=[0, 0, 0.35];
  const barrelR=0.012;
  // Barrel: 4-sided prism from nose to body
  const bz1=0.10; // where barrel meets body
  quad([barrelR, barrelR, bz1],[-barrelR, barrelR, bz1],[-barrelR, barrelR, 0.30],[barrelR, barrelR, 0.30]); // top
  quad([-barrelR,-barrelR, bz1],[barrelR,-barrelR, bz1],[barrelR,-barrelR, 0.30],[-barrelR,-barrelR, 0.30]); // bot
  quad([barrelR,-barrelR, bz1],[barrelR, barrelR, bz1],[barrelR, barrelR, 0.30],[barrelR,-barrelR, 0.30]); // right
  quad([-barrelR, barrelR, bz1],[-barrelR,-barrelR, bz1],[-barrelR,-barrelR, 0.30],[-barrelR, barrelR, 0.30]); // left
  // Nose cone
  tri(nose, [barrelR, barrelR, 0.30], [barrelR,-barrelR, 0.30]);
  tri(nose, [-barrelR,-barrelR, 0.30], [-barrelR, barrelR, 0.30]);
  tri(nose, [-barrelR, barrelR, 0.30], [barrelR, barrelR, 0.30]);
  tri(nose, [barrelR,-barrelR, 0.30], [-barrelR,-barrelR, 0.30]);

  // Body: slightly wider section
  const bhx=0.025, bhy=0.020, bz0=-0.25;
  // Body box
  quad([-bhx,-bhy,bz1],[bhx,-bhy,bz1],[bhx,bhy,bz1],[-bhx,bhy,bz1]); // front
  quad([bhx,-bhy,bz0],[-bhx,-bhy,bz0],[-bhx,bhy,bz0],[bhx,bhy,bz0]); // back
  quad([bhx,-bhy,bz1],[bhx,-bhy,bz0],[bhx,bhy,bz0],[bhx,bhy,bz1]); // right
  quad([-bhx,-bhy,bz0],[-bhx,-bhy,bz1],[-bhx,bhy,bz1],[-bhx,bhy,bz0]); // left
  quad([-bhx,bhy,bz1],[bhx,bhy,bz1],[bhx,bhy,bz0],[-bhx,bhy,bz0]); // top
  quad([-bhx,-bhy,bz0],[bhx,-bhy,bz0],[bhx,-bhy,bz1],[-bhx,-bhy,bz1]); // bottom

  // Stabilizer fins (4 small fins at rear)
  const fLen=0.06, fH=0.04;
  // Top fin
  tri([0, bhy, -0.15], [0, bhy+fH, -0.25], [0, bhy, -0.25]);
  tri([0.003, bhy, -0.15], [0.003, bhy, -0.25], [0.003, bhy+fH, -0.25]);
  // Bottom fin
  tri([0, -bhy, -0.15], [0, -bhy, -0.25], [0, -bhy-fH, -0.25]);
  tri([0.003, -bhy, -0.15], [0.003, -bhy-fH, -0.25], [0.003, -bhy, -0.25]);
  // Right fin
  tri([bhx, 0, -0.15], [bhx, 0, -0.25], [bhx+fH, 0, -0.25]);
  tri([bhx, 0.003, -0.15], [bhx+fH, 0.003, -0.25], [bhx, 0.003, -0.25]);
  // Left fin
  tri([-bhx, 0, -0.15], [-bhx-fH, 0, -0.25], [-bhx, 0, -0.25]);
  tri([-bhx, 0.003, -0.15], [-bhx, 0.003, -0.25], [-bhx-fH, 0.003, -0.25]);

  return{positions:new Float32Array(p),normals:new Float32Array(n),indices:new Uint16Array(idx)};
}

/* ---- Enemy Capital ship geometry ---- */
/* Large multi-section cruiser, DISTINCT from player's createCapitalShipGeometry().
   Hexagonal hull cross-section, prominent ventral hangar bay, dorsal antenna array,
   twin heavy turret mounts. 200-300 tris. Bounding box ~1.0 x 0.2 x 0.6. */
function createEnemyCapitalGeometry(){
  const p=[],n=[],idx=[];
  let vi=0;
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
  function quad(v0,v1,v2,v3){ tri(v0,v1,v2); tri(v0,v2,v3); }

  // === MAIN HULL: hexagonal cross-section, tapered from nose to stern ===
  // 8 longitudinal stations with hexagonal rings
  const stations = [
    { z: 0.50, hx: 0.02, hy: 0.01 },   // S0: sharp nose
    { z: 0.40, hx: 0.06, hy: 0.03 },   // S1: nose widening
    { z: 0.25, hx: 0.15, hy: 0.06 },   // S2: forward section
    { z: 0.10, hx: 0.25, hy: 0.08 },   // S3: forward shoulder
    { z:-0.05, hx: 0.30, hy: 0.10 },   // S4: midship (widest)
    { z:-0.20, hx: 0.28, hy: 0.09 },   // S5: aft section
    { z:-0.35, hx: 0.22, hy: 0.07 },   // S6: stern taper
    { z:-0.45, hx: 0.16, hy: 0.05 },   // S7: stern
  ];

  const RING_N = 6; // hexagonal
  const rings = [];
  for (let si = 0; si < stations.length; si++) {
    const s = stations[si];
    const ring = [];
    for (let ri = 0; ri < RING_N; ri++) {
      const angle = (ri / RING_N) * Math.PI * 2 + Math.PI / 6; // offset for flat-top hex
      const x = Math.cos(angle) * s.hx;
      const y = Math.sin(angle) * s.hy;
      ring.push([x, y, s.z]);
    }
    rings.push(ring);
  }

  // Connect adjacent station rings with quads
  for (let si = 0; si < rings.length - 1; si++) {
    const r0 = rings[si], r1 = rings[si + 1];
    for (let ri = 0; ri < RING_N; ri++) {
      const ri2 = (ri + 1) % RING_N;
      quad(r0[ri], r0[ri2], r1[ri2], r1[ri]);
    }
  }

  // Close nose (fan)
  const noseCenter = [0, 0, stations[0].z + 0.02];
  for (let ri = 0; ri < RING_N; ri++) {
    const ri2 = (ri + 1) % RING_N;
    tri(noseCenter, rings[0][ri], rings[0][ri2]);
  }

  // Close stern (fan)
  const sternCenter = [0, 0, stations[stations.length - 1].z - 0.02];
  for (let ri = 0; ri < RING_N; ri++) {
    const ri2 = (ri + 1) % RING_N;
    tri(sternCenter, rings[rings.length - 1][ri2], rings[rings.length - 1][ri]);
  }

  // === VENTRAL HANGAR BAY: large recessed section underneath ===
  const hbW=0.12, hbD=0.04, hbZ0=-0.25, hbZ1=0.10;
  const hbY = -stations[4].hy; // hull bottom at midship
  quad([-hbW, hbY-hbD, hbZ0],[hbW, hbY-hbD, hbZ0],[hbW, hbY-hbD, hbZ1],[-hbW, hbY-hbD, hbZ1]); // floor
  quad([-hbW, hbY, hbZ0],[-hbW, hbY-hbD, hbZ0],[-hbW, hbY-hbD, hbZ1],[-hbW, hbY, hbZ1]); // left
  quad([hbW, hbY-hbD, hbZ0],[hbW, hbY, hbZ0],[hbW, hbY, hbZ1],[hbW, hbY-hbD, hbZ1]); // right
  quad([-hbW, hbY-hbD, hbZ0],[-hbW, hbY, hbZ0],[hbW, hbY, hbZ0],[hbW, hbY-hbD, hbZ0]); // back
  quad([-hbW, hbY, hbZ1],[-hbW, hbY-hbD, hbZ1],[hbW, hbY-hbD, hbZ1],[hbW, hbY, hbZ1]); // front

  // === DORSAL ANTENNA ARRAY: 3 tall spikes on top ===
  const antY = stations[3].hy;
  for (let ai = 0; ai < 3; ai++) {
    const az = 0.15 - ai * 0.12;
    const ah = 0.06 + (ai === 1 ? 0.03 : 0); // middle antenna taller
    const aw = 0.008;
    // Spike: 4 triangular faces converging to a point
    tri([-aw, antY, az-aw], [aw, antY, az-aw], [0, antY+ah, az]);
    tri([aw, antY, az-aw], [aw, antY, az+aw], [0, antY+ah, az]);
    tri([aw, antY, az+aw], [-aw, antY, az+aw], [0, antY+ah, az]);
    tri([-aw, antY, az+aw], [-aw, antY, az-aw], [0, antY+ah, az]);
    // Base
    quad([-aw, antY, az-aw], [-aw, antY, az+aw], [aw, antY, az+aw], [aw, antY, az-aw]);
  }

  // === TWIN HEAVY TURRET MOUNTS: on dorsal surface ===
  for (let side = -1; side <= 1; side += 2) {
    const tx = side * 0.12, ty = stations[4].hy, tz = -0.05;
    const tw = 0.03, th = 0.025, td = 0.04;
    // Turret base box
    quad([tx-tw, ty, tz-td],[tx+tw, ty, tz-td],[tx+tw, ty+th, tz-td],[tx-tw, ty+th, tz-td]); // back
    quad([tx-tw, ty, tz+td],[tx-tw, ty+th, tz+td],[tx+tw, ty+th, tz+td],[tx+tw, ty, tz+td]); // front
    quad([tx+tw, ty, tz-td],[tx+tw, ty, tz+td],[tx+tw, ty+th, tz+td],[tx+tw, ty+th, tz-td]); // right
    quad([tx-tw, ty, tz+td],[tx-tw, ty, tz-td],[tx-tw, ty+th, tz-td],[tx-tw, ty+th, tz+td]); // left
    quad([tx-tw, ty+th, tz-td],[tx+tw, ty+th, tz-td],[tx+tw, ty+th, tz+td],[tx-tw, ty+th, tz+td]); // top
    // Twin barrels
    const bLen=0.08, bR=0.006;
    for (let b = -1; b <= 1; b += 2) {
      const bx = tx + b * 0.012, by = ty + th * 0.6;
      quad([bx-bR, by-bR, tz+td],[bx+bR, by-bR, tz+td],[bx+bR, by+bR, tz+td],[bx-bR, by+bR, tz+td]); // base
      tri([bx-bR, by-bR, tz+td],[bx+bR, by-bR, tz+td],[bx, by, tz+td+bLen]); // bottom
      tri([bx+bR, by+bR, tz+td],[bx-bR, by+bR, tz+td],[bx, by, tz+td+bLen]); // top
      tri([bx+bR, by-bR, tz+td],[bx+bR, by+bR, tz+td],[bx, by, tz+td+bLen]); // right
      tri([bx-bR, by+bR, tz+td],[bx-bR, by-bR, tz+td],[bx, by, tz+td+bLen]); // left
    }
  }

  // === ENGINE NACELLES: two heavy pods at stern ===
  const nacW=0.05, nacH=0.04, nacD=0.12;
  for (let side = -1; side <= 1; side += 2) {
    const cx = side * 0.22, cy = -0.01, cz = -0.35;
    const x0=cx-nacW, x1=cx+nacW, y0=cy-nacH, y1=cy+nacH, z0=cz-nacD, z1=cz+nacD;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]);
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]);
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]);
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]);
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]);
    // Pylon to hull
    const pyW=0.02, pyH=0.03;
    quad([cx-pyW, y1, cz-0.05],[cx+pyW, y1, cz-0.05],[cx+pyW, y1+pyH, cz-0.05],[cx-pyW, y1+pyH, cz-0.05]);
    quad([cx+pyW, y1, cz+0.05],[cx-pyW, y1, cz+0.05],[cx-pyW, y1+pyH, cz+0.05],[cx+pyW, y1+pyH, cz+0.05]);
  }

  // === LATERAL ARMOR PLATES: angular plates on sides ===
  for (let side = -1; side <= 1; side += 2) {
    const px = side * stations[4].hx;
    const pw = side * 0.04; // plate protrudes outward
    quad([px, 0.03, 0.05], [px+pw, 0.01, 0.05], [px+pw, 0.01, -0.20], [px, 0.03, -0.20]);
    quad([px+pw, 0.01, 0.05], [px, -0.03, 0.05], [px, -0.03, -0.20], [px+pw, 0.01, -0.20]);
  }

  return{positions:new Float32Array(p),normals:new Float32Array(n),indices:new Uint16Array(idx)};
}
