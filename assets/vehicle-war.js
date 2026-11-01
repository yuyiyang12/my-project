/* 载具大战 + 手机声纹。仅使用本地资源，不依赖网络。 */
(function(){
'use strict';
const T=window.THREE;
// 主游戏使用较新的渲染器，本地辅助库创建的对象补齐新版阴影回调。
if(T&&T.Object3D){if(!T.Object3D.prototype.onBeforeShadow)T.Object3D.prototype.onBeforeShadow=function(){};if(!T.Object3D.prototype.onAfterShadow)T.Object3D.prototype.onAfterShadow=function(){};}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const now=()=>performance.now();

class SoundRadar{
  constructor(game){
    this.game=game;this.events=[];this.last=0;
    this.mobile=(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0);
    const box=document.createElement('div');box.id='sound-radar';box.innerHTML='<canvas width="180" height="180"></canvas><span>声纹</span>';
    document.body.appendChild(box);this.box=box;this.canvas=box.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
    box.style.display=this.mobile?'block':'none';
  }
  add(pos,type='gun'){
    if(!this.mobile||!pos||!this.game.player)return;
    const p=this.game.player.pos,d=Math.hypot(pos.x-p.x,pos.z-p.z);
    if(d<1.5||d>110)return;
    this.events.push({x:pos.x,z:pos.z,type,time:now(),distance:d});
    if(this.events.length>24)this.events.shift();
  }
  draw(){
    if(!this.mobile||!this.game.rig)return;
    const c=this.ctx,w=180,t=now();this.events=this.events.filter(e=>t-e.time<1600);
    c.clearRect(0,0,w,w);c.save();c.translate(90,90);
    c.strokeStyle='rgba(130,220,255,.28)';c.lineWidth=2;
    for(const r of [28,54,80]){c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();}
    c.fillStyle='#8fe8ff';c.beginPath();c.moveTo(0,-9);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();c.fill();
    const yaw=this.game.rig.yaw||0,p=this.game.player.pos;
    for(const e of this.events){
      const world=Math.atan2(e.x-p.x,-(e.z-p.z)),a=world+yaw;
      const age=(t-e.time)/1600,r=clamp(e.distance,10,80),x=Math.sin(a)*r,y=-Math.cos(a)*r;
      c.globalAlpha=1-age;c.strokeStyle=e.type==='boom'?'#ffb13b':e.type==='vehicle'?'#b48cff':'#ff5f57';
      c.lineWidth=e.type==='boom'?7:4;c.beginPath();c.arc(x,y,e.type==='boom'?12:8,-.8,.8);c.stroke();
      c.fillStyle=c.strokeStyle;c.font='bold 13px sans-serif';c.textAlign='center';c.fillText(e.type==='boom'?'爆':e.type==='vehicle'?'车':'枪',x,y-11);
    }
    c.restore();c.globalAlpha=1;
  }
}

class VehicleWarMode{
  constructor(game){
    this.g=game;this.root=new T.Group();this.root.name='VehicleWarRoot';game.world.add(this.root);
    this.vehicles=[];this.shells=[];this.infantryShots=[];this.c4s=[];this.customWeapon=null;this.c4Ammo=3;this.magnetAmmo=3;this.cooldown=0;this.wasDead=false;this.driving=null;this.driveFireT=0;this.exitT=0;this.heliUp=false;this.heliDown=false;
    this.ui=document.getElementById('vehicle-hud');this.ui.style.display='block';this.ui.classList.remove('driving');
    this.status=document.getElementById('vehicle-status');this.markers=document.getElementById('vehicle-markers');
    this.enterButton=document.createElement('button');this.enterButton.id='vehicle-enter';this.enterButton.textContent='上车';
    this.enterButton.style.cssText='position:absolute;left:50%;bottom:142px;transform:translateX(-50%);display:none;pointer-events:auto;padding:10px 24px;border:2px solid #ffe083;border-radius:8px;background:#152535e8;color:#fff;font:700 16px sans-serif;touch-action:none;z-index:30';
    if(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0){this.enterButton.style.left='26%';this.enterButton.style.transform='none';}
    this.enterButton.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.toggleVehicle();});this.ui.appendChild(this.enterButton);
    this.weaponBox=document.createElement('div');this.weaponBox.style.cssText='position:absolute;right:18px;bottom:145px;display:none;gap:9px;pointer-events:auto;z-index:30';this.ui.appendChild(this.weaponBox);this.weaponButtons=[];
    for(let i=0;i<2;i++){const b=document.createElement('button');b.id='vehicle-weapon-'+i;b.style.cssText='min-width:76px;padding:10px 12px;border:2px solid #8db7c9;border-radius:8px;background:#152535e8;color:#fff;font:700 13px sans-serif;touch-action:none';b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.selectVehicleWeapon(i);});this.weaponBox.appendChild(b);this.weaponButtons.push(b);}
    this.altitudeBox=document.createElement('div');this.altitudeBox.style.cssText='position:absolute;right:18px;bottom:205px;display:none;gap:8px;pointer-events:auto;z-index:30';this.ui.appendChild(this.altitudeBox);
    for(const [name,flag] of [['上升','heliUp'],['下降','heliDown']]){const b=document.createElement('button');b.id=flag==='heliUp'?'vehicle-heli-up':'vehicle-heli-down';b.textContent=name;b.style.cssText='padding:9px 15px;border:1px solid #8db7c9;border-radius:7px;background:#152535e8;color:#fff;font:700 13px sans-serif;touch-action:none';b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this[flag]=true;});for(const ev of ['pointerup','pointercancel','pointerleave'])b.addEventListener(ev,()=>this[flag]=false);this.altitudeBox.appendChild(b);}
    this.makeLargeMap();this.makeViewmodels();
  }
  async init(){
    await Promise.all(['tank_new','ifv2','helicopter','f35','howitzer','artillery_shell'].map(n=>this.g.assets.loadModel(n)));
    this.buildHowitzer();
    for(const team of [1,2]){this.spawnVehicle('tank',team);this.spawnVehicle('assault',team);this.spawnVehicle('helicopter',team);this.spawnVehicle('f35',team);}
    this.refreshCombatants();this.respawnSoldiers();this.updateHUD();
    this.g.minimap.update=()=>this.updateMinimap();this.updateMinimap();
  }
  v(x=0,y=0,z=0){return new this.g.player.pos.constructor(x,y,z);}
  makeLargeMap(){
    const g=this.g,l=g.level;
    // 载具地图不使用旧城镇的墙体和碰撞，避免出生点被高墙夹住。
    l.root.clear();l.solids.length=0;if(l.col?.solids)l.col.solids.length=0;
    const sky=new T.Mesh(new T.SphereGeometry(900,24,16),new T.MeshBasicMaterial({color:0x9dbfd2,side:T.BackSide,fog:false}));sky.name='VehicleSky';l.root.add(sky);
    const hemi=new T.HemisphereLight(0xd8ecff,0x756449,1.65),sun=new T.DirectionalLight(0xfff1d2,2.1);sun.position.set(-70,120,55);l.root.add(hemi,sun);
    const hills=[[-91,-45,10,21],[91,32,12,23],[-18,38,7,18],[20,-48,8,19],[-125,105,9,22],[125,-105,9,22],[-132,-112,8,22],[132,112,8,22],[-205,-175,9,25],[205,175,9,25],[-205,175,8,24],[205,-175,8,24]];
    const height=(x,z)=>{
      let h=0;for(const q of hills){const dx=x-q[0],dz=z-q[1];h+=q[2]*Math.exp(-(dx*dx+dz*dz)/(2*q[3]*q[3]));}
      const roadDist=Math.min(Math.abs(x+55),Math.abs(x-55));
      h*=clamp((roadDist-9)/15,0,1);h*=clamp((242-Math.abs(z))/24,0,1);return h;
    };
    const normalAt=(x,z)=>this.v(height(x-.15,z)-height(x+.15,z),.3,height(x,z-.15)-height(x,z+.15)).normalize();
    const intersectRay=(origin,dir,maxDist)=>{
      const step=.65;let prev=0;const count=Math.ceil(maxDist/step);
      for(let i=1;i<=count;i++){const t=Math.min(maxDist,i*step),y=origin.y+dir.y*t;
        if(y<=height(origin.x+dir.x*t,origin.z+dir.z*t)){let lo=prev,hi=t;
          for(let k=0;k<8;k++){const m=(lo+hi)/2,my=origin.y+dir.y*m;if(my<=height(origin.x+dir.x*m,origin.z+dir.z*m))hi=m;else lo=m;}
          const point=origin.clone().addScaledVector(dir,hi);return{point,distance:hi,normal:normalAt(point.x,point.z),object:l.terrainMesh};
        }prev=t;
      }return null;
    };
    l.terrain={heightAt:height,normalAt,intersectRay};
    const geo=new T.PlaneGeometry(520,520,130,130);geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position,colors=[];
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=height(x,z);pos.setY(i,h);const f=clamp(h/15,0,1);colors.push(.40+f*.12,.39+f*.10,.27+f*.05);}
    geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
    const ground=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:1}));
    ground.receiveShadow=true;ground.name='VehicleHills';l.root.add(ground);l.terrainMesh=ground;
    const roadMat=new T.MeshStandardMaterial({color:0x4c4b43,roughness:.96});
    for(const x of [-55,55]){const geoRoad=new T.PlaneGeometry(15,505,1,130);geoRoad.rotateX(-Math.PI/2);const rp=geoRoad.attributes.position;
      for(let i=0;i<rp.count;i++)rp.setY(i,height(x+rp.getX(i),rp.getZ(i))+.035);geoRoad.computeVertexNormals();
      const road=new T.Mesh(geoRoad,roadMat);road.receiveShadow=true;l.root.add(road);
    }
    const boxGeo=new T.BoxGeometry(1,1,1),mats=[new T.MeshStandardMaterial({color:0x6c725d,roughness:.9}),new T.MeshStandardMaterial({color:0x8a7655,roughness:.95})];
    const blocks=[[-90,-75,8,2,3],[-90,-25,7,1.6,3],[-90,35,8,2,3],[90,-75,8,2,3],[90,-20,7,1.6,3],[90,45,8,2,3],[-28,-95,6,1.5,2],[28,-95,6,1.5,2],[-28,95,6,1.5,2],[28,95,6,1.5,2]];
    blocks.forEach((b,i)=>{const[x,z,w,h,d]=b,y=height(x,z),m=new T.Mesh(boxGeo,mats[i%2]);m.position.set(x,y+h/2,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;l.root.add(m);l.solids.push(m);
      l.col?.solids?.push({min:{x:x-w/2,y,z:z-d/2},max:{x:x+w/2,y:y+h,z:z+d/2}});});
    l.root.updateMatrixWorld(true);l.boundary={center:[0,0],radius:254};l.portalPairs=[];
    l.spawns=[];for(const team of [1,2])for(const x of [-62,-48,48,62]){const z=team===1?152:-152;l.spawns.push({team,pos:[x,height(x,z),z],yaw:team===1?0:Math.PI});}
    l.coverPoints=blocks.map(b=>({pos:this.v(b[0],height(b[0],b[1]),b[1]),n:this.v(b[0]>0?-1:1,0,0),takenBy:null}));
    this.makeMapDecorations(l,height);
    const cell=2.5,R=250,n=Math.ceil(2*R/cell),blocked=new Uint8Array(n*n);
    for(let a=0;a<n;a++)for(let o=0;o<n;o++){const x=-R+(o+.5)*cell,z=-R+(a+.5)*cell;let no=Math.hypot(x,z)>248;
      if(!no)for(const q of l.col?.solids||[]){if(x>q.min.x-.5&&x<q.max.x+.5&&z>q.min.z-.5&&z<q.max.z+.5&&q.max.y>.45){no=true;break;}}blocked[a*n+o]=no?1:0;}
    l.nav={cell,n,R,blocked};if(g.portals){try{g.world.remove(g.portals.root);}catch(_){}g.portals=null;}l.portalEdges=null;
    this.terrainHeight=height;
  }
  makeMapDecorations(l,height){
    // 战场装饰：基地、据点掩体、集装箱、岗楼和岩石。主路与据点入口保持畅通。
    const boxGeo=new T.BoxGeometry(1,1,1),mats=new Map(),mat=color=>{if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color,roughness:.9,metalness:.04}));return mats.get(color);};
    const box=(x,z,w,h,d,color=0x777262,solid=true,yOff=0)=>{const y=height(x,z)+yOff,m=new T.Mesh(boxGeo,mat(color));m.position.set(x,y+h/2,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;l.root.add(m);if(solid){l.solids.push(m);l.col?.solids?.push({min:{x:x-w/2,y,z:z-d/2},max:{x:x+w/2,y:y+h,z:z+d/2}});}return m;};
    const hangar=(x,z,flip)=>{const c=flip?0x59645d:0x626a63;box(x-7,z,1,6,18,c);box(x+7,z,1,6,18,c);box(x,z+(flip?-8:8),14,6,1,c);box(x,z,15,.65,19,0x454c48,false,6);for(const dz of [-6,0,6])box(x,z+dz,14,.18,.25,0xb0a77b,false,6.7);};
    hangar(-20,132,false);hangar(-20,-132,true);
    for(const z of [-156,156]){box(-76,z,34,2.5,1,0x6d7164);box(76,z,34,2.5,1,0x6d7164);box(-93,z+(z>0?-8:8),1,2.5,17,0x6d7164);box(93,z+(z>0?-8:8),1,2.5,17,0x6d7164);}
    const tower=(x,z)=>{const y=height(x,z);for(const dx of [-1.5,1.5])for(const dz of [-1.5,1.5])box(x+dx,z+dz,.22,5,.22,0x514c40,false);box(x,z,4.2,.35,4.2,0x625c4c,false,5);box(x,z,3.5,1.4,3.5,0x596052,false,5.35);box(x,z,4.6,.25,4.6,0x3f463e,false,6.75);};
    for(const q of [[-78,116],[78,116],[-78,-116],[78,-116],[-48,63],[48,-63]])tower(...q);
    const container=(x,z,color,rot=false)=>box(x,z,rot?7:2.7,2.7,rot?2.7:7,color);
    for(const q of [[-15,94,0x596d72,false],[15,83,0x80634c,true],[-16,-88,0x6d7252,true],[17,-96,0x596d72,false],[-67,42,0x80634c,true],[67,-40,0x6d7252,true],[-43,-56,0x596d72,false],[44,60,0x80634c,false]])container(...q);
    // 三个据点的矮墙都留出正面和侧面入口，不把 AI 或玩家关在里面。
    for(const [x,z] of [[-24,18],[24,-18],[0,52]]){box(x-12,z,1,1.5,12,0x827b66);box(x+12,z,1,1.5,12,0x827b66);box(x-8,z+10,7,1.25,1,0x827b66);box(x+8,z+10,7,1.25,1,0x827b66);for(const dx of [-7,7])box(x+dx,z-10,5,1,1.2,0x706a58);}
    for(const [x,z] of [[-55,105],[55,105],[-55,-105],[55,-105],[-40,30],[40,-30]])for(let i=-2;i<=2;i++)box(x+i*1.15,z,1,.75,.65,0x8b8065,false);
    const rockGeo=new T.DodecahedronGeometry(1,0),rockMat=mat(0x716b5a);
    for(let i=0;i<42;i++){const x=Math.sin(i*91.17)*158,z=Math.sin(i*47.31+2)*158;if(Math.abs(Math.abs(x)-55)<13||Math.hypot(x,z)>169||[[-24,18],[24,-18],[0,52]].some(p=>Math.hypot(x-p[0],z-p[1])<18))continue;const r=1.2+(i%5)*.42,m=new T.Mesh(rockGeo,rockMat);m.position.set(x,height(x,z)+r*.42,z);m.scale.set(r,r*.65,r*.85);m.rotation.set(i*.3,i*.7,i*.17);m.castShadow=m.receiveShadow=true;l.root.add(m);}
    const trunkGeo=new T.CylinderGeometry(.12,.2,2.8,6),branchGeo=new T.CylinderGeometry(.055,.09,1.6,5),wood=mat(0x5d5140);
    for(let i=0;i<18;i++){const x=Math.sin(i*33.7+1)*145,z=Math.cos(i*51.2)*145;if(Math.abs(Math.abs(x)-55)<15)continue;const y=height(x,z),tr=new T.Mesh(trunkGeo,wood);tr.position.set(x,y+1.4,z);tr.rotation.z=(i%3-1)*.12;l.root.add(tr);const br=new T.Mesh(branchGeo,wood);br.position.set(x+.45,y+2.35,z);br.rotation.z=-.8;l.root.add(br);}
  }
  createC4Model(){
    const group=new T.Group(),bodyMat=new T.MeshStandardMaterial({color:0x394232,roughness:.72}),darkMat=new T.MeshStandardMaterial({color:0x171d1b,metalness:.35,roughness:.5});
    const body=new T.Mesh(new T.BoxGeometry(.32,.17,.105),darkMat);group.add(body);
    for(const x of [-.105,0,.105]){const block=new T.Mesh(new T.BoxGeometry(.09,.145,.09),bodyMat);block.position.set(x,0,.008);group.add(block);}
    const bandMat=new T.MeshStandardMaterial({color:0xc0a15a,roughness:.72});for(const x of [-.075,.075]){const band=new T.Mesh(new T.BoxGeometry(.026,.185,.122),bandMat);band.position.x=x;group.add(band);}
    const board=new T.Mesh(new T.BoxGeometry(.12,.076,.012),new T.MeshStandardMaterial({color:0x174d37,metalness:.25,roughness:.55}));board.position.set(.035,.008,.064);group.add(board);
    const screen=new T.Mesh(new T.BoxGeometry(.064,.033,.008),new T.MeshStandardMaterial({color:0x071b19,emissive:0x1a9b83,emissiveIntensity:.7}));screen.position.set(.025,.024,.074);group.add(screen);
    for(const x of [-.006,.014,.034]){const chip=new T.Mesh(new T.BoxGeometry(.012,.009,.006),darkMat);chip.position.set(x,-.018,.074);group.add(chip);}
    const lamp=new T.Mesh(new T.SphereGeometry(.012,10,8),new T.MeshBasicMaterial({color:0xff3020}));lamp.position.set(.077,.024,.077);group.add(lamp);group.userData.lamp=lamp;
    const wireColors=[0xe44332,0xf0c33c,0x4ea5e8];for(let i=0;i<3;i++){const curve=new T.CatmullRomCurve3([new T.Vector3(-.12+i*.025,.04,.058),new T.Vector3(-.08+i*.025,.085+i*.008,.085),new T.Vector3(-.02+i*.018,.055,.076)]),wire=new T.Mesh(new T.TubeGeometry(curve,10,.0045,6,false),new T.MeshStandardMaterial({color:wireColors[i],roughness:.5}));group.add(wire);}
    const antenna=new T.Mesh(new T.CylinderGeometry(.004,.006,.12,7),darkMat);antenna.position.set(-.13,.13,0);antenna.rotation.z=-.15;group.add(antenna);return group;
  }
  makeViewmodels(){
    this.c4View=this.createC4Model();this.c4Lamp=this.c4View.userData.lamp;
    this.c4View.scale.setScalar(.9);this.c4View.position.set(.28,-.24,-.9);this.c4View.rotation.set(-.08,-.18,-.04);this.c4View.visible=false;this.g.rig.weaponCamera.add(this.c4View);
    this.repairView=new T.Group();const toolMat=new T.MeshStandardMaterial({color:0x33434a,metalness:.55,roughness:.4});
    const toolBody=new T.Mesh(new T.BoxGeometry(.2,.17,.4),toolMat),toolGrip=new T.Mesh(new T.BoxGeometry(.09,.24,.12),toolMat),toolTip=new T.Mesh(new T.CylinderGeometry(.035,.055,.3,10),new T.MeshStandardMaterial({color:0x67d9ff,emissive:0x164c60,emissiveIntensity:1.2}));
    toolGrip.position.set(0,-.16,.08);toolGrip.rotation.x=-.25;toolTip.rotation.x=Math.PI/2;toolTip.position.set(0,.02,-.32);this.repairView.add(toolBody,toolGrip,toolTip);
    this.repairView.scale.setScalar(.58);this.repairView.position.set(.32,-.27,-.82);this.repairView.visible=false;this.g.rig.weaponCamera.add(this.repairView);
    this.repairBeam=new T.Line(new T.BufferGeometry().setFromPoints([this.v(),this.v()]),new T.LineBasicMaterial({color:0x62dcff,transparent:true,opacity:.9}));this.repairBeam.visible=false;this.root.add(this.repairBeam);this.repairTarget=null;this.repairFxT=0;
  }
  buildHowitzer(){
    this.howitzer=this.g.assets.instance('howitzer');this.howitzer.scale.setScalar(.78);
    this.howitzer.position.set(.43,-.43,-.78);this.howitzer.rotation.set(-.08,0,0);this.howitzer.visible=false;this.g.rig.weaponCamera.add(this.howitzer);
  }
  setCustom(kind){
    if(!['vehicle','conquest'].includes(this.g.mode))return;this.customWeapon=this.customWeapon===kind?null:kind;this.updateHUD();
  }
  updateHUD(){
    this.ui.classList.toggle('driving',!!this.driving);
    if(this.customWeapon==='c4')this.status.innerHTML='<b>U · C4 炸车兵</b><span>左键投掷 · 2 秒后爆炸 · 剩余 '+this.c4Ammo+' 个 · 靠近会炸伤自己</span>';
    else if(this.customWeapon==='howitzer')this.status.innerHTML='<b>I · 反载兵</b><span>'+(this.cooldown>0?'装填中 '+this.cooldown.toFixed(1)+' 秒':'反载炮已就绪 · 左键发射')+'</span>';
    else if(this.customWeapon==='magnetic')this.status.innerHTML='<b>P · 磁吸兵</b><span>左键投掷磁吸炸弹 · 吸附敌方载具后爆炸 · 剩余 '+this.magnetAmmo+' 个</span>';
    else if(this.customWeapon==='repair')this.status.innerHTML='<b>O · 维修兵</b><span>'+(this.repairTarget?'正在维修 '+this.repairTarget.name+' · '+Math.ceil(this.repairTarget.hp)+'/'+this.repairTarget.maxHp:'16 米内瞄准己方载具 · 按住左键 / 开火键维修')+'</span>';
    else if(this.driving){const v=this.driving,heli=v.kind==='helicopter',weapon=v.weapon==='mg'?'机枪':v.weapon==='missile'?'线控导弹':v.weapon==='antiinf'?'反步兵炮':v.weapon==='antivehicle'?'反载具炮':'主炮';this.status.innerHTML='<b>正在驾驶 '+v.name+' · '+weapon+'</b><span>'+(heli?'W/S 飞行 · A/D 转向 · Space/C 或按钮升降 · 1/2 切武器 · 12 发后充能 30 秒':v.kind==='f35'?'W/S 飞行 · A/D 转向 · 鼠标上抬爬升 · 持续抬满 1.5 秒筋斗 · 1/2 切武器':'W/S 前进倒车 · A/D 转向 · 鼠标左右/上下看 · 1/2 切武器 · E 下车')+'</span>';}
    else if(this.nearVehicle)this.status.innerHTML='<b>靠近'+this.nearVehicle.name+' · 按 E 上车</b><span>手机点击“上车” · 上车后 WASD 驾驶、左键开炮</span>';
    else this.status.innerHTML=this.g.mode==='conquest'?'<b>占领据点</b><span>按 A→B→C 顺序占领 · 每点 30 秒 · 守方无限兵力 · U C4 · I 反载 · O 维修 · P 磁吸</span>':'<b>步枪兵</b><span>U C4 · I 反载 · O 维修 · P 磁吸 · 靠近己方载具按 E 驾驶 · 先到 50 分</span>';
    document.querySelectorAll('[data-vclass]').forEach(b=>b.classList.toggle('active',b.dataset.vclass===this.customWeapon));this.refreshWeaponUI();
  }
  refreshWeaponUI(){
    const v=this.driving,show=!!v&&['tank','assault','helicopter','f35'].includes(v.kind);this.weaponBox.style.display=show?'flex':'none';this.altitudeBox.style.display=v&&(v.kind==='helicopter'||v.kind==='f35')?'flex':'none';
    if(!show)return;const labels=v.kind==='f35'?['1 机枪','2 线控导弹']:(v.kind==='tank'||v.kind==='assault')?['1 主炮','2 机枪']:['1 反步兵','2 反载具'],selected=(v.kind==='tank'||v.kind==='assault')?(v.weapon==='mg'?1:0):v.kind==='f35'?(v.weapon==='missile'?1:0):(v.weapon==='antivehicle'?1:0);
    this.weaponButtons.forEach((b,i)=>{b.textContent=labels[i];const active=i===selected;b.style.borderColor=active?'#ffe083':'#8db7c9';b.style.background=active?'#675221ee':'#152535e8';b.setAttribute('aria-pressed',String(active));});
  }
  selectVehicleWeapon(i){
    const v=this.driving;if(!v)return;if(v.kind==='tank'||v.kind==='assault')v.weapon=i===1?'mg':'cannon';else if(v.kind==='helicopter')v.weapon=i===1?'antivehicle':'antiinf';else if(v.kind==='f35')v.weapon=i===1?'missile':'mg';else return;
    this.driveFireT=Math.min(this.driveFireT,.12);this.refreshWeaponUI();this.updateHUD();
  }
  makeRotorTexture(){
    const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.translate(128,128);
    for(let i=0;i<3;i++){x.save();x.rotate(i*Math.PI*2/3);const g=x.createLinearGradient(0,0,122,0);g.addColorStop(0,'rgba(190,198,208,0)');g.addColorStop(.5,'rgba(190,198,208,.55)');g.addColorStop(1,'rgba(190,198,208,.05)');x.fillStyle=g;x.beginPath();x.moveTo(0,0);x.arc(0,0,122,-.17,.17);x.closePath();x.fill();x.restore();}
    x.fillStyle='rgba(110,116,126,.95)';x.beginPath();x.arc(0,0,11,0,Math.PI*2);x.fill();const texture=new T.CanvasTexture(c);texture.channel=0;texture.colorSpace='srgb';return texture;
  }
  addRotorSpin(model){
    const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),mat=new T.MeshBasicMaterial({map:this.makeRotorTexture(),transparent:true,opacity:.55,side:T.DoubleSide,depthWrite:false}),r=.5*Math.max(size.x,size.z);
    const mainRotor=new T.Mesh(new T.CircleGeometry(r*.99,48),mat);mainRotor.rotation.x=-Math.PI/2;mainRotor.position.set(center.x,box.max.y+size.y*.02,center.z);model.add(mainRotor);
    const tailRotor=new T.Mesh(new T.CircleGeometry(r*.16,32),mat);tailRotor.position.set(center.x,box.max.y-size.y*.22,box.min.z+size.z*.02);model.add(tailRotor);return{mainRotor,tailRotor};
  }
  spawnVehicle(kind,team){
    const asset=kind==='tank'?'tank_new':kind==='assault'?'ifv2':kind,model=this.g.assets.instance(asset),scale=kind==='tank'?5.6:kind==='assault'?4.8:kind==='f35'?8:4.4,rotor=kind==='helicopter'?this.addRotorSpin(model):null;model.scale.setScalar(scale);
    const object3D=new T.Group();object3D.name=kind+'_vehicle';object3D.add(model);const modelBox=new T.Box3().setFromObject(model);model.position.y-=modelBox.min.y;
    object3D.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    const ring=new T.Mesh(new T.RingGeometry(kind==='tank'?2.5:kind==='assault'?2:4,kind==='tank'?2.75:kind==='assault'?2.25:4.25,32),new T.MeshBasicMaterial({color:team===1?0x4aa8ff:0xffd33d,side:T.DoubleSide,transparent:true,opacity:.75}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.06;ring.scale.setScalar(1);ring.visible=kind!=='helicopter'&&kind!=='f35';object3D.add(ring);this.root.add(object3D);
    const lane=kind==='tank'?-55:kind==='assault'?55:kind==='f35'?25:0,z=team===1?(kind==='f35'?148:138):-(kind==='f35'?148:138);
    const label=document.createElement('div');label.className='vehicle-marker';this.markers.appendChild(label);
    const heli=kind==='helicopter',baseY=this.terrainHeight?this.terrainHeight(lane,z):0;
    const v={kind,team,name:kind==='tank'?'新型坦克':kind==='assault'?'步战车':kind==='f35'?'F35':'直升机',object3D,rotor,pos:this.v(lane,baseY,z),radius:kind==='tank'?2.6:kind==='assault'?2.3:kind==='f35'?4.8:4,height:kind==='tank'?3:kind==='assault'?2.8:kind==='f35'?2.8:5,
      hp:kind==='tank'?360:kind==='assault'?260:kind==='f35'?300:320,maxHp:kind==='tank'?360:kind==='assault'?260:kind==='f35'?300:320,points:kind==='tank'?3:kind==='assault'?2:4,speed:kind==='tank'?3:kind==='assault'?4.2:kind==='f35'?10:7,dead:false,respawnT:0,fireT:1+Math.random()*2,lane,label,kills:0,heading:team===1?0:Math.PI,driveSpeed:0,steer:0,weapon:kind==='helicopter'?'antiinf':kind==='f35'||kind==='assault'?'mg':'cannon',heat:0,overheatT:0,mgFireT:0,heliAmmo:12,rechargeT:0,verticalSpeed:0,loopAngle:0,loopBaseY:0,loopLatch:false,loopHold:0,aiDelay:10,aiSpeed:0,aiStrafe:0,aiPhase:Math.random()*Math.PI*2};
    v.onHit=(damage,point,head,owner)=>this.damageVehicle(v,Math.max(.2,damage*.04),owner);
    object3D.position.copy(v.pos);object3D.rotation.y=v.heading+Math.PI;this.vehicles.push(v);return v;
  }
  refreshCombatants(){this.g.projectiles.combatants=[...this.g.combatants,...this.vehicles];}
  respawnSoldiers(){
    for(const b of this.g.bots)b.respawn(this.g.level.spawnFor(b.team,this.g.enemiesOf(b.team)));
    this.g.spawnPlayer();
  }

  onHitVehicle(v,damage,owner){this.damageVehicle(v,damage,owner);}
  damageVehicle(v,damage,owner){
    if(v.dead||damage<=0)return;v.hp-=damage;
    if(v.hp<=0){v.hp=0;v.dead=true;v.respawnT=8;if(this.driving===v)this.exitVehicle();v.object3D.visible=false;v.label.style.display='none';
      this.g.effects.explosion(v.pos.clone().add(this.v(0,1.5,0)),8);this.g.soundRadar?.add(v.pos,'boom');
      const team=owner&&owner.team!==v.team?owner.team:(v.team===1?2:1);this.addScore(team,v.points,owner,v);
    }
  }
  addScore(team,points,owner,victim){
    if(this.g.matchOver)return;this.g.score[team]+=points;this.g.hud.teamScore(this.g.score[1],this.g.score[2]);
    this.g.hud.kill(owner?.name||'载具火力',victim.name+'  +'+points+' 分',false,team,victim.team);
    if(owner===this.g.player)this.g.hud.announce('摧毁 '+victim.name,'+'+points+' 分 · 目标 50 分');
    if(this.g.score[team]>=50)this.g._endMatch(team);
  }
  makeAimedShot(origin,viewOrigin,viewDir,speed,gravity=true,exclude=null){
    let distance=320;const hit=this.g.level.castRay(viewOrigin,viewDir,distance);if(hit&&Number.isFinite(hit.distance))distance=Math.min(distance,hit.distance);
    const raySphere=(center,radius)=>{const to=center.clone().sub(viewOrigin),along=to.dot(viewDir);if(along<=0||along>distance+radius)return;const perpendicular=to.addScaledVector(viewDir,-along).length();if(perpendicular>radius)return;const entry=Math.max(.1,along-Math.sqrt(Math.max(0,radius*radius-perpendicular*perpendicular)));if(entry<distance)distance=entry;};
    for(const v of this.vehicles)if(v!==exclude&&!v.dead&&v.team!==this.g.player.team)raySphere(v.pos.clone().add(this.v(0,v.height*.5,0)),Math.max(v.radius,v.height*.55));
    for(const c of this.g.combatants)if(c!==this.g.player&&!c.dead&&c.team!==this.g.player.team)raySphere(c.pos.clone().add(this.v(0,1,0)),.85);
    const target=viewOrigin.clone().addScaledVector(viewDir,distance),dir=target.clone().sub(origin).normalize(),shotDistance=target.distanceTo(origin);if(gravity)dir.y+=4.9*shotDistance/(speed*speed);dir.normalize();return{from:origin,dir,target,distance:shotDistance};
  }
  vehicleAim(v,speed,gravity=true){
    const cam=this.g.rig.camera;cam.updateMatrixWorld(true);const viewDir=cam.getWorldDirection(this.v()).normalize(),flat=this.v(viewDir.x,0,viewDir.z).normalize(),air=v.kind==='helicopter'||v.kind==='f35',origin=v.pos.clone().add(this.v(0,air?1.5:2.2,0)).addScaledVector(flat,air?4:3.5);return this.makeAimedShot(origin,cam.position,viewDir,speed,gravity,v);
  }
  fireShell(origin,dir,owner,speed,damage,radius=6){
    const mesh=this.g.assets.instance('artillery_shell');const box=new T.Box3().setFromObject(mesh),size=box.getSize(new T.Vector3());
    // 保留用户提供的炮弹模型；远处也能看清，不再缩成几个像素。
    mesh.scale.setScalar(1.35/Math.max(size.x,size.y,size.z,.001));mesh.position.copy(origin);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir);this.root.add(mesh);
    const trail=new T.Line(new T.BufferGeometry().setFromPoints([origin,origin]),new T.LineBasicMaterial({color:0xffbd55,transparent:true,opacity:.9,depthWrite:false}));trail.frustumCulled=false;this.root.add(trail);
    const tracer=new T.Mesh(new T.CylinderGeometry(.12,.22,5.5,8),new T.MeshBasicMaterial({color:0xffd25a,transparent:true,opacity:.95,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending}));tracer.frustumCulled=false;tracer.position.copy(origin);tracer.quaternion.copy(mesh.quaternion);this.root.add(tracer);
    this.shells.push({mesh,trail,tracer,trailPoints:[origin.clone()],pos:origin.clone(),vel:dir.clone().multiplyScalar(speed),owner,team:owner.team,damage,radius,life:7,guided:false,bomb:false});
    this.g.effects.muzzleWorld(origin);this.g.soundRadar?.add(origin,'gun');
  }
  fireInfantry(origin,dir,owner){
    const mesh=new T.Mesh(new T.CylinderGeometry(.075,.075,1.25,8),new T.MeshBasicMaterial({color:0x19b5fe,toneMapped:false}));mesh.position.copy(origin);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir);mesh.frustumCulled=false;this.root.add(mesh);
    const tracer=new T.Mesh(new T.CylinderGeometry(.06,.1,4,6),new T.MeshBasicMaterial({color:0x009dff,transparent:true,opacity:1,depthWrite:false,toneMapped:false,blending:T.NormalBlending}));tracer.frustumCulled=false;tracer.position.copy(origin);tracer.quaternion.copy(mesh.quaternion);this.root.add(tracer);
    this.infantryShots.push({mesh,tracer,pos:origin.clone(),vel:dir.clone().multiplyScalar(135),owner,team:owner.team,damage:42,life:1.35});this.g.effects.muzzleWorld(origin);this.g.soundRadar?.add(origin,'gun');
  }
  consumeHeliShot(v){v.heliAmmo=Math.max(0,v.heliAmmo-1);if(v.heliAmmo===0)v.rechargeT=30;}
  fireWireMissile(from,dir,owner){
    this.fireShell(from,dir,owner,82,180,10);const s=this.shells[this.shells.length-1];s.guided=true;s.bomb=true;s.life=12;s.mesh.scale.multiplyScalar(1.8);s.tracer.scale.set(1.8,1.8,1.8);this.driveFireT=1.4;
  }
  fireVehicleWeapon(v,shot){
    if(this.driveFireT>0)return;const g=this.g,heli=v.kind==='helicopter',dir=shot.dir||shot,from=shot.from||v.pos.clone().add(this.v(0,heli?.5:2.2,0)).addScaledVector(dir,heli?4:3.5);
    if(heli){
      if(v.rechargeT>0||v.heliAmmo<=0)return;
      if(v.weapon==='antiinf'){this.fireInfantry(from,dir,g.player);this.driveFireT=.12;}
      else{this.fireShell(from,dir,g.player,88,52,3.5);this.driveFireT=.25;g.rig.addShake(.025);}
      this.consumeHeliShot(v);return;
    }
    if(v.kind==='f35'){
      if(v.weapon==='missile'){this.fireWireMissile(from,dir,g.player);g.rig.addShake(.05);}
      else{g.projectiles.fire({origin:from,dir,speed:300,drop:0,damage:26,range:240,impactForce:3,weapon:'f35_mg',team:g.player.team,owner:g.player});g.effects.muzzleWorld(from);g.soundRadar?.add(from,'gun');this.driveFireT=.075;}return;
    }
    if((v.kind==='tank'||v.kind==='assault')&&v.weapon==='mg'){
      if(v.overheatT>0)return;g.projectiles.fire({origin:from,dir,speed:240,drop:0,damage:24,range:150,impactForce:3,weapon:'vehicle_mg',team:g.player.team,owner:g.player});g.effects.muzzleWorld(from);g.soundRadar?.add(from,'gun');this.driveFireT=.1;return;
    }
    this.fireShell(from,dir,g.player,v.kind==='tank'?62:72,v.kind==='tank'?190:110,6);this.driveFireT=v.kind==='tank'?1.5:1;g.rig.addShake(.08);
  }
  explode(p,owner,damage,radius,selfDamage=false,direct=null){
    this.g.effects.explosion(p,radius);this.g.soundRadar?.add(p,'boom');
    if(direct&&!direct.dead&&direct.team!==owner?.team)this.damageVehicle(direct,damage,owner);
    for(const v of this.vehicles){if(v===direct||v.dead||v.team===owner?.team)continue;const d=v.pos.distanceTo(p);if(d<radius+v.radius)this.damageVehicle(v,damage*clamp(1-d/(radius+v.radius),.2,1),owner);}
    for(const c of this.g.combatants){if(c.dead||(!selfDamage&&c.team===owner?.team)||(!selfDamage&&c===owner))continue;const d=c.pos.distanceTo(p);if(d>radius)continue;
      const amount=Math.floor(damage*.55*(1-d/radius));if(amount<=0)continue;
      if(c===this.g.player)c.damage?c.damage(amount,owner):c.onHit?.(amount,p,false,owner);else c.onHit?.(amount,p,false,owner);
    }
  }
  throwMagnetic(){
    if(this.magnetAmmo<=0)return;this.magnetAmmo--;const cam=this.g.rig.camera,dir=cam.getWorldDirection(this.v()),origin=cam.position.clone().addScaledVector(dir,.8),mesh=new T.Mesh(new T.SphereGeometry(.16,12,8),new T.MeshStandardMaterial({color:0x26343c,emissive:0x24c8ff,emissiveIntensity:1.2,metalness:.7}));mesh.position.copy(origin);this.root.add(mesh);this.c4s.push({mesh,pos:origin.clone(),vel:dir.multiplyScalar(16).add(this.v(0,4,0)),fuse:3,owner:this.g.player,magnetic:true,stuck:null});this.updateHUD();
  }
  throwC4(){
    if(this.c4Ammo<=0){this.g.hud.announce('C4 已用完','阵亡重生后补满 3 个');return;}
    this.c4Ammo--;const cam=this.g.rig.camera,dir=cam.getWorldDirection(this.v()),origin=cam.position.clone().addScaledVector(dir,.8);
    const mesh=this.createC4Model();mesh.scale.setScalar(1.15);mesh.position.copy(origin);this.root.add(mesh);
    this.c4s.push({mesh,pos:origin.clone(),vel:dir.multiplyScalar(13).add(this.v(0,5,0)),fuse:2,owner:this.g.player});this.updateHUD();
  }
  fireHowitzer(){
    if(this.cooldown>0)return;const cam=this.g.rig.camera,viewDir=cam.getWorldDirection(this.v()).normalize(),origin=cam.position.clone().addScaledVector(viewDir,1),shot=this.makeAimedShot(origin,cam.position,viewDir,72,true);
    this.fireShell(origin,shot.dir,this.g.player,72,100,9);this.cooldown=3;this.g.rig.addShake(.09);this.updateHUD();
  }
  updateCustom(dt){
    const g=this.g,input=g.input;
    if(input.hit('KeyU'))this.setCustom('c4');if(input.hit('KeyI'))this.setCustom('howitzer');if(input.hit('KeyO'))this.setCustom('repair');if(input.hit('KeyP'))this.setCustom('magnetic');
    if(/Digit[1-5]/.test(input.lastHit||''))this.customWeapon=null;
    for(const code of ['Digit1','Digit2','Digit3','Digit4','Digit5'])if(input.hit(code))this.customWeapon=null;
    const custom=!!this.customWeapon&&!g.player.dead&&!this.driving;
    this.c4View.visible=(this.customWeapon==='c4'||this.customWeapon==='magnetic')&&custom;this.howitzer.visible=this.customWeapon==='howitzer'&&custom;this.repairView.visible=this.customWeapon==='repair'&&custom;
    const hideForAim=!!g.weapons.gun?.isAiming&&g.weapons.gun.canAim;
    if(g.weapons.gun?.root)g.weapons.gun.root.visible=!custom&&!this.driving&&!hideForAim;
    g.weapons.armsPivot.visible=!custom&&!g.player.dead&&!this.driving&&!hideForAim;
    this.repairBeam.visible=false;
    if(custom&&this.customWeapon==='repair')this.updateRepair(dt);
    else if(custom&&input.mouseHit(0)){if(this.customWeapon==='c4')this.throwC4();else if(this.customWeapon==='magnetic')this.throwMagnetic();else this.fireHowitzer();}
    if(this.customWeapon==='c4')this.c4Lamp.material.color.setHex(Math.sin(now()*.015)>0?0xff3020:0x501000);
    if(this.customWeapon)g.hud.ammo({bullets:this.customWeapon==='c4'?this.c4Ammo:this.customWeapon==='magnetic'?this.magnetAmmo:this.customWeapon==='repair'?100:(this.cooldown>0?0:1),reserve:this.customWeapon==='c4'||this.customWeapon==='magnetic'?0:99,name:this.customWeapon==='c4'?'C4 炸车兵':this.customWeapon==='magnetic'?'磁吸炸弹':this.customWeapon==='repair'?'维修枪':'反载炮',type:'special',fireMode:'',isReloading:false});
  }
  nearestFriendlyVehicle(){
    let best=null,dist=7;for(const v of this.vehicles){if(v.dead||v.team!==this.g.player.team)continue;const d=Math.hypot(v.pos.x-this.g.player.pos.x,v.pos.z-this.g.player.pos.z);if(d<dist){dist=d;best=v;}}return best;
  }
  toggleVehicle(){if(this.driving)this.exitVehicle();else{const v=this.nearestFriendlyVehicle();if(v)this.enterVehicle(v);}}
  enterVehicle(v){
    if(this.driving||v.dead||v.team!==this.g.player.team)return;this.driving=v;this.customWeapon=null;this.driveFireT=.35;
    this._eyeY=this.g.player.eyeY;v.driveSpeed=0;v.steer=0;v.verticalSpeed=0;v.loopAngle=0;v.loopBaseY=0;v.loopLatch=false;v.loopHold=0;this.driveCam=null;this.drivePitch=this.g.rig.pitch||0;this.driveYaw=this.g.rig.yaw??v.heading;this.heliUp=this.heliDown=false;this.g.player.vel.set(0,0,0);this.g.player.pos.copy(v.pos);
    if(this.g.weapons.gun?.root)this.g.weapons.gun.root.visible=false;this.g.weapons.armsPivot.visible=false;
    this.g.touch?.root.classList.add('vehicle-driving');this.g.hud.announce('已登上'+v.name,'WASD 驾驶 · 左键开炮 · E 下车');this.updateHUD();
  }
  exitVehicle(){
    const v=this.driving;if(!v)return;const g=this.g,x=v.pos.x+5,z=v.pos.z,y=this.terrainHeight(x,z);
    g.player.pos.set(x,y,z);g.player.vel.set(0,0,0);this.driving=null;this.nearVehicle=null;this.heliUp=this.heliDown=false;this.exitT=.5;g.touch?.root.classList.remove('vehicle-driving');
    if(g.weapons.gun?.root)g.weapons.gun.root.visible=true;g.weapons.armsPivot.visible=!g.player.dead;this.enterButton.style.display='none';this.updateHUD();
  }
  updateDriving(dt){
    const g=this.g;this.driveFireT=Math.max(0,this.driveFireT-dt);this.exitT=Math.max(0,this.exitT-dt);
    this.nearVehicle=this.driving?null:this.nearestFriendlyVehicle();
    this.enterButton.style.display=this.driving||this.nearVehicle?'block':'none';this.enterButton.textContent=this.driving?'下车':'上车';
    if(g.input.hit('KeyE')&&this.exitT<=0)this.toggleVehicle();
    const v=this.driving;if(!v)return;if(v.dead||g.player.dead){this.exitVehicle();return;}
    if(g.input.hit('Digit1'))this.selectVehicleWeapon(0);if(g.input.hit('Digit2'))this.selectVehicleWeapon(1);
    const heli=v.kind==='helicopter',air=heli||v.kind==='f35';
    if(v.overheatT>0){v.overheatT=Math.max(0,v.overheatT-dt);if(v.overheatT===0)v.heat=0;}
    const mgTrigger=(v.kind==='tank'||v.kind==='assault')&&v.weapon==='mg'&&g.input.mouseDown(0)&&v.overheatT<=0;
    if(mgTrigger){v.heat=Math.min(30,v.heat+dt);if(v.heat>=30){v.overheatT=10;v.heat=30;}}
    else if(v.overheatT<=0)v.heat=Math.max(0,v.heat-4*dt);
    const yawTarget=g.rig.yaw??v.heading,yawDelta=Math.atan2(Math.sin(yawTarget-this.driveYaw),Math.cos(yawTarget-this.driveYaw));this.driveYaw+=yawDelta*(1-Math.exp(-10*dt));
    const pitchTarget=clamp(g.rig.pitch||0,-.5,.65);this.drivePitch+=(pitchTarget-this.drivePitch)*(1-Math.exp(-10*dt));
    const viewX=-Math.sin(this.driveYaw),viewZ=-Math.cos(this.driveYaw);
    let forward=(g.input.down('KeyW')?1:0)-(g.input.down('KeyS')?1:0),steer=(g.input.down('KeyA')?1:0)-(g.input.down('KeyD')?1:0);
    if(g.touch&&g.input.moveAxis){forward+=-(g.input.moveAxis.z||0);steer+=-(g.input.moveAxis.x||0);}
    forward=clamp(forward,-1,1);steer=clamp(steer,-1,1);
    const maxSpeed=v.kind==='tank'?10:v.kind==='f35'?30:heli?18:13,accel=v.kind==='tank'?6:air?10:8,target=forward*maxSpeed;
    v.driveSpeed+=clamp(target-v.driveSpeed,-accel*dt,accel*dt);v.steer+=clamp(steer-v.steer,-3.2*dt,3.2*dt);
    const speedRatio=Math.min(1,Math.abs(v.driveSpeed)/3),turnRate=v.kind==='tank'?.95:air?1.05:1.2;
    v.heading+=v.steer*turnRate*dt*(.35+.65*speedRatio)*(v.driveSpeed<-.2?-1:1);
    const fx=-Math.sin(v.heading),fz=-Math.cos(v.heading),nx=v.pos.x+fx*v.driveSpeed*dt,nz=v.pos.z+fz*v.driveSpeed*dt;let blocked=false;
    for(const q of g.level.col?.solids||[]){if((!air||v.pos.y<q.max.y+2)&&nx>q.min.x-v.radius&&nx<q.max.x+v.radius&&nz>q.min.z-v.radius&&nz<q.max.z+v.radius){blocked=true;break;}}
    for(const other of this.vehicles){if(other!==v&&!other.dead&&Math.hypot(nx-other.pos.x,nz-other.pos.z)<v.radius+other.radius&&(!air||Math.abs(v.pos.y-other.pos.y)<v.height+other.height)){blocked=true;break;}}
    if(!blocked){v.pos.x=nx;v.pos.z=nz;}else v.driveSpeed*=.15;
    const ground=this.terrainHeight(v.pos.x,v.pos.z);
    const f35=v.kind==='f35';
    if(f35&&pitchTarget<.45){v.loopLatch=false;v.loopHold=0;}
    if(f35&&!v.loopAngle&&!v.loopLatch&&pitchTarget>=.62&&v.driveSpeed>=12&&v.pos.y>ground+6){v.loopHold+=dt;if(v.loopHold>=1.5){v.loopAngle=.001;v.loopBaseY=v.pos.y;v.loopLatch=true;v.loopHold=0;g.hud.announce('F35 筋斗','持续抬满 1.5 秒触发 · 完成机动后可继续飞行');}}else if(f35&&!v.loopAngle)v.loopHold=0;
    if(f35&&v.loopAngle){
      v.loopAngle+=dt*1.7;v.pos.y=v.loopBaseY+14*(1-Math.cos(v.loopAngle));v.verticalSpeed=23.8*Math.sin(v.loopAngle);
      if(v.loopAngle>=Math.PI*2){v.loopAngle=0;v.pos.y=v.loopBaseY;v.verticalSpeed=0;}
    }else if(air){const up=clamp((g.input.down('Space')?1:0)-(g.input.down('KeyC')?1:0)+(this.heliUp?1:0)-(this.heliDown?1:0),-1,1),lift=f35?this.drivePitch*18:0;v.verticalSpeed+=clamp(up*8+lift-v.verticalSpeed,-16*dt,16*dt);v.pos.y=clamp(v.pos.y+v.verticalSpeed*dt,ground,ground+55);}
    else v.pos.y=ground;
    v.object3D.position.copy(v.pos);v.object3D.rotation.y=v.heading+Math.PI;v.object3D.rotation.x=f35?(v.loopAngle?-v.loopAngle:-this.drivePitch*.7):air?clamp(v.driveSpeed*.006,-.09,.09):0;v.object3D.rotation.z=air?-v.steer*(heli?.34:.24):0;
    g.player.pos.copy(v.pos);g.player.vel.set(0,0,0);g.player.grounded=true;
    const cam=g.rig.camera,distance=air?20:23,desired=v.pos.clone().add(this.v(-viewX*distance,air?10.5:11,-viewZ*distance));desired.y=Math.max(desired.y,this.terrainHeight(desired.x,desired.z)+2);
    if(!this.driveCam)this.driveCam=desired.clone();else this.driveCam.lerp(desired,1-Math.exp(-7*dt));
    cam.position.copy(this.driveCam);cam.lookAt(v.pos.x+viewX*10,v.pos.y+1.3+Math.sin(this.drivePitch)*20-(g.touch?3.5:0),v.pos.z+viewZ*10);cam.updateMatrixWorld(true);
    const continuous=air||((v.kind==='tank'||v.kind==='assault')&&v.weapon==='mg'),trigger=continuous&&!(v.kind==='f35'&&v.weapon==='missile')?g.input.mouseDown(0):g.input.mouseHit(0),speed=v.kind==='f35'?(v.weapon==='missile'?82:300):heli?(v.weapon==='antiinf'?135:88):((v.kind==='tank'||v.kind==='assault')&&v.weapon==='mg'?240:v.kind==='tank'?62:72),gravity=v.kind==='f35'?v.weapon==='missile':heli?v.weapon==='antivehicle':!((v.kind==='tank'||v.kind==='assault')&&v.weapon==='mg');if(trigger)this.fireVehicleWeapon(v,this.vehicleAim(v,speed,gravity));
    if(heli)g.hud.ammo({bullets:v.rechargeT>0?0:v.heliAmmo,reserve:12,name:v.name+(v.weapon==='antiinf'?'反步兵炮':'反载具炮'),type:'special',fireMode:v.rechargeT>0?'充能 '+v.rechargeT.toFixed(1)+' 秒':'12 发共用',isReloading:v.rechargeT>0});
    else if(v.kind==='f35')g.hud.ammo({bullets:1,reserve:v.weapon==='missile'?'导弹':'∞',name:'F35 '+(v.weapon==='missile'?'线控导弹':'机枪'),type:'special',fireMode:v.weapon==='missile'?'准星持续引导':'无冷却',isReloading:false});
    else if((v.kind==='tank'||v.kind==='assault')&&v.weapon==='mg')g.hud.ammo({bullets:v.overheatT>0?0:1,reserve:Math.max(0,Math.ceil(30-v.heat)),name:v.name+'机枪',type:'special',fireMode:v.overheatT>0?'过热冷却 '+v.overheatT.toFixed(1)+' 秒':'连续射击 '+v.heat.toFixed(1)+'/30 秒',isReloading:v.overheatT>0});
    else g.hud.ammo({bullets:this.driveFireT>0?0:1,reserve:99,name:v.name+'主炮',type:'special',fireMode:'',isReloading:false});
  }

  findRepairTarget(){
    const g=this.g,cam=g.rig.camera,dir=cam.getWorldDirection(this.v());let best=null,bestAlong=16;
    for(const v of this.vehicles){if(v.dead||v.team!==g.player.team)continue;const center=v.pos.clone().add(this.v(0,1.3,0)),to=center.clone().sub(cam.position),along=to.dot(dir);if(along<0||along>bestAlong)continue;
      const perpendicular=to.addScaledVector(dir,-along).length();if(perpendicular>v.radius+1.2)continue;if(!g.level.lineOfSight(cam.position,center,.3))continue;best=v;bestAlong=along;
    }return best;
  }
  updateRepair(dt){
    const g=this.g;this.repairTarget=this.findRepairTarget();this.repairFxT=Math.max(0,this.repairFxT-dt);
    if(!g.input.mouseDown(0)||!this.repairTarget)return;const v=this.repairTarget,cam=g.rig.camera,dir=cam.getWorldDirection(this.v()),from=cam.position.clone().addScaledVector(dir,.7),to=v.pos.clone().add(this.v(0,1.4,0));
    v.hp=Math.min(v.maxHp,v.hp+55*dt);this.repairBeam.geometry.setFromPoints([from,to]);this.repairBeam.geometry.computeBoundingSphere();this.repairBeam.visible=true;
    if(this.repairFxT<=0){g.effects.muzzleWorld(to);this.repairFxT=.16;}
  }
  resetVehicle(v){
    const z=v.team===1?(v.kind==='f35'?148:138):-(v.kind==='f35'?148:138),y=this.terrainHeight(v.lane,z);v.dead=false;v.hp=v.maxHp;v.pos.set(v.lane,y,z);v.heading=v.team===1?0:Math.PI;v.driveSpeed=0;v.steer=0;v.verticalSpeed=0;v.loopAngle=0;v.loopBaseY=0;v.loopLatch=false;v.loopHold=0;v.heat=0;v.overheatT=0;v.heliAmmo=12;v.rechargeT=0;v.weapon=v.kind==='helicopter'?'antiinf':v.kind==='f35'||v.kind==='assault'?'mg':'cannon';v.aiDelay=10;v.aiSpeed=0;v.aiStrafe=0;v.aiPhase=Math.random()*Math.PI*2;v.object3D.position.copy(v.pos);v.object3D.rotation.set(0,v.heading+Math.PI,0);v.object3D.visible=true;v.fireT=2;
  }
  updateVehicleTimers(dt){
    for(const v of this.vehicles){if(v.dead)continue;if(v.rotor){v.rotor.mainRotor.rotation.z+=dt*25;v.rotor.tailRotor.rotation.z+=dt*32;}if(v.rechargeT>0){v.rechargeT=Math.max(0,v.rechargeT-dt);if(v.rechargeT===0)v.heliAmmo=12;}}
  }
  updateHeliAI(v,target,dt){
    v.aiDelay=Math.max(0,(v.aiDelay??0)-dt);
    let ground=this.terrainHeight(v.pos.x,v.pos.z);
    // 出生后先停在地上 10 秒，玩家仍有时间上车；随后 AI 自主起飞。
    if(v.aiDelay>0){v.pos.y=ground;v.aiSpeed=0;v.aiStrafe=0;v.verticalSpeed=0;v.object3D.position.copy(v.pos);return;}
    const d=target?Math.hypot(target.pos.x-v.pos.x,target.pos.z-v.pos.z):60;
    const forward=d>58?7:d<28?-4:0,strafe=target&&d>=28&&d<=58?(v.team===1?3.2:-3.2):0;
    v.aiSpeed+=clamp(forward-v.aiSpeed,-4*dt,4*dt);v.aiStrafe+=clamp(strafe-v.aiStrafe,-4*dt,4*dt);
    const fx=-Math.sin(v.heading),fz=-Math.cos(v.heading),rx=Math.cos(v.heading),rz=-Math.sin(v.heading);
    let vx=fx*v.aiSpeed+rx*v.aiStrafe,vz=fz*v.aiSpeed+rz*v.aiStrafe;
    const r=Math.hypot(v.pos.x,v.pos.z);if(r>155){vx+=-v.pos.x/r*10;vz+=-v.pos.z/r*10;}
    const flightBlend=clamp((v.pos.y-ground)/4,0,1),nx=v.pos.x+vx*dt*flightBlend,nz=v.pos.z+vz*dt*flightBlend;
    if(Math.hypot(nx,nz)<167){v.pos.x=nx;v.pos.z=nz;}
    ground=this.terrainHeight(v.pos.x,v.pos.z);
    const desiredY=ground+11+Math.sin(now()/1600+v.aiPhase)*2;
    v.verticalSpeed+=clamp((desiredY-v.pos.y)*1.5-v.verticalSpeed,-8*dt,8*dt);
    v.pos.y=clamp(v.pos.y+v.verticalSpeed*dt,ground,ground+32);
    v.object3D.position.copy(v.pos);v.object3D.rotation.x=clamp(v.aiSpeed*.007,-.08,.08);v.object3D.rotation.z=clamp(-v.aiStrafe*.018,-.09,.09);
  }
  updateVehicles(dt){
    const enemies=this.vehicles.filter(v=>!v.dead);
    for(const v of this.vehicles){
      if(v.dead){v.respawnT-=dt;if(v.respawnT<=0)this.resetVehicle(v);continue;}
      if(v===this.driving){v.label.style.display='none';continue;}
      const heli=v.kind==='helicopter',air=heli||v.kind==='f35',targets=enemies.filter(e=>e.team!==v.team);let target=null,dist=1e9;
      for(const e of targets){const d=v.pos.distanceTo(e.pos);if(d<dist){dist=d;target=e;}}
      if(target){
        const dx=target.pos.x-v.pos.x,dz=target.pos.z-v.pos.z,d=Math.hypot(dx,dz)||1;v.heading=Math.atan2(-dx,-dz);v.object3D.rotation.y=v.heading+Math.PI;
        v.fireT-=dt;const from=v.pos.clone().add(this.v(0,heli?.5:2,0)),to=target.pos.clone().add(this.v(0,1.2,0));
        if(v.fireT<=0&&d<92&&this.g.level.lineOfSight(from,to,.5)&&(!heli||(v.rechargeT<=0&&v.heliAmmo>0))){
          const dir=to.sub(from).normalize();this.fireShell(from.addScaledVector(dir,3),dir,v,heli?70:v.kind==='tank'?48:58,heli?48:v.kind==='tank'?170:95,heli?4:5);v.fireT=heli?.65:v.kind==='tank'?4.2:2.8;if(heli)this.consumeHeliShot(v);
        }
      }
      // 地面载具仍原地停住；只有 AI 直升机会起飞和移动。
      if(air)this.updateHeliAI(v,target,dt);
      else{v.pos.y=this.g.level.groundAt(v.pos.x,v.pos.z,v.pos.y+3).y;v.object3D.position.copy(v.pos);}
      if(Math.floor(now()/1800)!==v.soundTick){v.soundTick=Math.floor(now()/1800);this.g.soundRadar?.add(v.pos,'vehicle');}
      this.updateMarker(v);
    }
  }

  updateMarker(v){
    if(v.dead)return;const p=v.pos.clone().add(this.v(0,v.height+1,0)).project(this.g.rig.camera),el=v.label;
    if(p.z>1||p.z<-1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1){el.style.display='none';return;}
    el.style.display='block';el.style.left=((p.x*.5+.5)*innerWidth)+'px';el.style.top=((-p.y*.5+.5)*innerHeight)+'px';
    el.className='vehicle-marker '+(v.team===1?'ally':'enemy');el.innerHTML=v.name+' <span>'+Math.ceil(v.hp)+'/'+v.maxHp+'</span><i><b style="width:'+(v.hp/v.maxHp*100)+'%"></b></i>';
  }

  updateInfantryShots(dt){
    for(let i=this.infantryShots.length-1;i>=0;i--){const s=this.infantryShots[i],old=s.pos.clone();s.life-=dt;s.pos.addScaledVector(s.vel,dt);s.mesh.position.copy(s.pos);const dir=s.vel.clone().normalize();s.tracer.position.copy(s.pos).addScaledVector(dir,-1.6);let hit=false;
      for(const c of this.g.combatants){if(c.dead||c.team===s.team)continue;const center=c.pos.clone().add(this.v(0,1,0)),seg=s.pos.clone().sub(old),len2=seg.lengthSq(),t=len2?clamp(center.clone().sub(old).dot(seg)/len2,0,1):0,closest=old.clone().addScaledVector(seg,t);if(closest.distanceTo(center)<1.05){const amount=Math.floor(s.damage);if(c===this.g.player)c.damage?c.damage(amount,s.owner):c.onHit?.(amount,s.pos,false,s.owner);else c.onHit?.(amount,s.pos,false,s.owner);this.g.effects.muzzleWorld(s.pos);hit=true;break;}}
      const ground=this.g.level.groundAt(s.pos.x,s.pos.z,old.y+2).y;if(s.pos.y<=ground+.03)hit=true;
      if(hit||s.life<=0){this.root.remove(s.mesh);this.root.remove(s.tracer);this.infantryShots.splice(i,1);}
    }
  }
  updateShells(dt){
    for(let i=this.shells.length-1;i>=0;i--){const s=this.shells[i],old=s.pos.clone();s.life-=dt;if(s.guided&&s.owner===this.g.player){const cam=this.g.rig.camera,dir=cam.getWorldDirection(this.v()),target=cam.position.clone().addScaledVector(dir,260),desired=target.sub(s.pos).normalize().multiplyScalar(s.vel.length());s.vel.lerp(desired,clamp(dt*5,0,1));}else s.vel.y-=9.8*dt;s.pos.addScaledVector(s.vel,dt);s.mesh.position.copy(s.pos);s.trailPoints.push(s.pos.clone());if(s.trailPoints.length>8)s.trailPoints.shift();s.trail.geometry.setFromPoints(s.trailPoints);s.trail.geometry.computeBoundingSphere();
      const dir=s.vel.clone().normalize();s.mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir);s.tracer.quaternion.copy(s.mesh.quaternion);s.tracer.position.copy(s.pos).addScaledVector(dir,-2.5);
      let hit=s.pos.y<=this.g.level.groundAt(s.pos.x,s.pos.z,old.y+2).y+.08,step=old.distanceTo(s.pos),direct=null;
      if(!hit&&step>0){const rayDir=s.pos.clone().sub(old).normalize();if(this.g.level.castRay(old,rayDir,step))hit=true;}
      if(!hit)for(const v of this.vehicles){if(v.dead||v.team===s.team)continue;const dx=v.pos.x-s.pos.x,dz=v.pos.z-s.pos.z;if(Math.hypot(dx,dz)<v.radius&&s.pos.y>v.pos.y-.2&&s.pos.y<v.pos.y+v.height){hit=true;direct=v;break;}}
      if(!hit)for(const c of this.g.combatants){if(c.dead||c.team===s.team)continue;if(c.pos.distanceTo(s.pos)<1.1){hit=true;break;}}
      if(hit||s.life<=0){this.root.remove(s.mesh);this.root.remove(s.trail);this.root.remove(s.tracer);this.shells.splice(i,1);if(hit)this.explode(s.pos,s.owner,s.damage,s.radius,false,direct);}
    }
    for(let i=this.c4s.length-1;i>=0;i--){const c=this.c4s[i];c.fuse-=dt;
      if(c.stuck){if(c.stuck.dead)c.stuck=null;else{c.pos.copy(c.stuck.pos).add(c.offset);c.mesh.position.copy(c.pos);}}
      if(!c.stuck){c.vel.y-=12*dt;c.pos.addScaledVector(c.vel,dt);c.mesh.position.copy(c.pos);c.mesh.rotation.x+=dt*5;
        if(c.magnetic)for(const v of this.vehicles){if(v.dead||v.team===c.owner.team)continue;if(v.pos.distanceTo(c.pos)<v.radius+1){c.stuck=v;c.offset=c.pos.clone().sub(v.pos);c.fuse=Math.min(c.fuse,1.5);break;}}
        const gy=this.g.level.groundAt(c.pos.x,c.pos.z,c.pos.y+2).y;if(c.pos.y<gy+.1){c.pos.y=gy+.1;c.vel.multiplyScalar(.25);c.vel.y=0;}}
      if(c.fuse<=0){this.root.remove(c.mesh);this.c4s.splice(i,1);this.explode(c.pos,c.owner,c.magnetic?360:480,c.magnetic?8:10,true);}
    }
  }
  updateMinimap(){
    const c=this.g.minimap.ctx,w=400,to=(v)=>200+v/250*185;c.clearRect(0,0,w,w);c.fillStyle='#252b27';c.fillRect(0,0,w,w);
    c.strokeStyle='#414b43';c.lineWidth=1;for(let i=40;i<400;i+=40){c.beginPath();c.moveTo(i,0);c.lineTo(i,400);c.stroke();c.beginPath();c.moveTo(0,i);c.lineTo(400,i);c.stroke();}
    c.fillStyle='#474b43';c.fillRect(to(-62),15,14,370);c.fillRect(to(48),15,14,370);
    c.fillStyle='#596048';for(const q of [[-91,-45,10,21],[91,32,12,23],[-18,38,7,18],[20,-48,8,19],[-94,78,7,17],[94,-80,7,17]]){c.beginPath();c.arc(to(q[0]),to(q[1]),q[3]/250*185,0,Math.PI*2);c.fill();}
    c.strokeStyle='#89966d';c.lineWidth=3;c.strokeRect(15,15,370,370);c.fillStyle='#c7d0ba';c.font='bold 18px sans-serif';c.textAlign='center';c.fillText('钢 铁 荒 原',200,28);
    for(const v of this.vehicles){if(v.dead)continue;c.fillStyle=v.team===1?'#62b5ff':'#ffd34d';c.fillRect(to(v.pos.x)-5,to(v.pos.z)-5,10,10);}
    for(const b of this.g.bots){if(b.dead)continue;c.fillStyle=b.team===1?'#72bce8':'#ed7770';c.beginPath();c.arc(to(b.pos.x),to(b.pos.z),3,0,Math.PI*2);c.fill();}
    const p=this.g.player.pos,x=to(p.x),y=to(p.z);c.save();c.translate(x,y);c.rotate(-this.g.rig.yaw);c.fillStyle='#7dff9a';c.beginPath();c.moveTo(0,-9);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();c.fill();c.restore();
  }
  update(dt){
    if(!['vehicle','conquest'].includes(this.g.mode)||this.g.paused)return;
    this.cooldown=Math.max(0,this.cooldown-dt);
    if(this.wasDead&&!this.g.player.dead){this.c4Ammo=3;this.magnetAmmo=3;this.cooldown=0;}this.wasDead=this.g.player.dead;
    this.updateVehicleTimers(dt);this.updateDriving(dt);this.updateCustom(dt);this.updateVehicles(dt);this.updateInfantryShots(dt);this.updateShells(dt);
    if((this._hudT=(this._hudT||0)+dt)>.2){this._hudT=0;this.updateHUD();this.updateMinimap();}
  }
  reset(){
    if(this.driving)this.exitVehicle();
    for(const s of this.shells){this.root.remove(s.mesh);this.root.remove(s.trail);this.root.remove(s.tracer);}for(const s of this.infantryShots){this.root.remove(s.mesh);this.root.remove(s.tracer);}for(const c of this.c4s)this.root.remove(c.mesh);this.shells=[];this.infantryShots=[];this.c4s=[];
    for(const v of this.vehicles)this.resetVehicle(v);
    this.c4Ammo=3;this.magnetAmmo=3;this.cooldown=0;this.refreshCombatants();this.updateHUD();
  }
  destroy(){
    if(this.driving)this.exitVehicle();this.enterButton.remove();
    for(const v of this.vehicles)v.label.remove();this.g.world.remove(this.root);this.g.rig.weaponCamera.remove(this.c4View);this.g.rig.weaponCamera.remove(this.repairView);this.root.remove(this.repairBeam);if(this.howitzer)this.g.rig.weaponCamera.remove(this.howitzer);
    this.ui.style.display='none';if(this.g.weapons.gun?.root)this.g.weapons.gun.root.visible=true;this.vehicles=[];
  }
}

function installLayoutSizeControls(game){
  const touch=game.touch,panel=document.getElementById('layout-edit'),label=document.getElementById('layout-size-name');if(!touch||!panel||!label||panel.__sizeControls)return;panel.__sizeControls=true;
  let selected=null;const names={tjoy:'移动摇杆',fire:'开火',aim:'瞄准',jump:'跳跃',crouch:'蹲伏',reload:'换弹',swap:'换枪',grenade:'手雷',knife:'近战',tpause:'暂停'};
  const refresh=()=>{if(!selected){label.textContent='先点选一个按键';return;}const scale=parseFloat(selected.style.getPropertyValue('--ls'))||1,key=touch._key(selected);label.textContent=(names[key]||key)+' · '+Math.round(scale*100)+'%';};
  const select=el=>{if(!touch.editing||!el)return;if(selected)selected.classList.remove('layout-selected');selected=el;selected.classList.add('layout-selected');refresh();};
  for(const el of touch._editables()){el.addEventListener('touchstart',()=>select(el),{capture:true,passive:true});el.addEventListener('pointerdown',()=>select(el),{capture:true,passive:true});}
  const adjust=delta=>{if(!touch.editing||!selected)return;const scale=clamp((parseFloat(selected.style.getPropertyValue('--ls'))||1)+delta,.5,2.5),fixed=Math.round(scale*10)/10;selected.style.setProperty('--ls',String(fixed));selected.style.scale=String(fixed);touch._saveLayout();refresh();};
  for(const [id,delta] of [['btn-layout-smaller',-.1],['btn-layout-larger',.1]])document.getElementById(id)?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();adjust(delta);});
  const start=touch.startEdit.bind(touch);touch.startEdit=()=>{start();select(selected||touch.joyBase);};
  const reset=touch.resetLayout.bind(touch);touch.resetLayout=()=>{reset();refresh();};
}
function installPerformance(game){
  const mobile=!!game.touch||matchMedia('(pointer:coarse)').matches,r=game.renderer;
  let ratio=Math.min(devicePixelRatio||1,mobile?1.5:1.35),last=performance.now(),good=0;
  function apply(){
    r.setPixelRatio(ratio);r.setSize(innerWidth,innerHeight);r.shadowMap.enabled=!mobile;
    game.world.traverse(o=>{if(o.shadow?.mapSize){const size=mobile?512:Math.min(2048,o.shadow.mapSize.x);o.shadow.mapSize.set(size,size);if(o.shadow.map){o.shadow.map.dispose();o.shadow.map=null;}}});
    game.__renderQuality={ratio:+ratio.toFixed(2),shadows:r.shadowMap.enabled,targetFps:60};
  }
  game.__applyPerf=apply;apply();
  game.__perfTick=()=>{const t=performance.now();if(t-last<2500||document.hidden||game.paused)return;last=t;const fps=game._fps||0;
    if(fps<50){good=0;const next=Math.max(mobile?1.25:.7,ratio-.1);if(next!==ratio){ratio=next;apply();}}else if(fps>=58){good++;if(good>=3&&ratio<Math.min(devicePixelRatio||1,mobile?1.5:1.35)){ratio=Math.min(mobile?1.5:1.35,ratio+.05);good=0;apply();}}else good=0;
  };
}
function install(game){
  if(game.__vehiclePatch)return;game.__vehiclePatch=true;
  game.soundRadar=new SoundRadar(game);window.__soundRadar=game.soundRadar;installPerformance(game);installLayoutSizeControls(game);
  const load=game.loadLevel.bind(game);
  game.loadLevel=async function(map,mode){
    if(this.vehicleWar){this.vehicleWar.destroy();this.vehicleWar=null;}
    if(mode==='vehicle'||mode==='conquest'){
      await load('dust2','tdm');this.mode=mode;this.vehicleWar=mode==='conquest'&&window.ConquestMode?new window.ConquestMode(this):new VehicleWarMode(this);await this.vehicleWar.init();
      this.hud.setTeams(this.teams,1,mode==='conquest'?150:50);this.hud.teamScoreVisible?.(mode!=='conquest');this.hud.teamScore(0,0);
      const m=document.getElementById('mission');if(m)m.textContent=mode==='conquest'?'占领模式 · A→B→C 顺序占领 · 每点 30 秒 · 攻方 150 兵力 / 守方无限兵力':'载具大战 · 直升机/F35 +4 / 坦克 +3 / 步战车 +2 / 击杀 +1 · 先到 50 分';
      this.hud.bombShow(false);
    }else{await load(map,mode);const u=document.getElementById('vehicle-hud');if(u)u.style.display='none';}
    this.__applyPerf?.();
  };
  const input=game._handleWeaponInput.bind(game);game._handleWeaponInput=function(t){if(['vehicle','conquest'].includes(this.mode)&&(this.vehicleWar?.customWeapon||this.vehicleWar?.driving))return;input(t);};
  const death=game._onDeath.bind(game);game._onDeath=function(e,t,n){death(e,t,n);if(this.mode==='conquest')this.vehicleWar?.onDeath(e,t,n);if(this.mode==='vehicle'&&!this.matchOver){const team=this.score[1]>=50?1:this.score[2]>=50?2:0;if(team)this._endMatch(team);}};
  const restart=game._restartMatch.bind(game);game._restartMatch=function(){restart();if(['vehicle','conquest'].includes(this.mode))this.vehicleWar?.reset();};
  const lobby=game.backToLobby.bind(game);game.backToLobby=function(){if(this.vehicleWar){this.vehicleWar.destroy();this.vehicleWar=null;}lobby();};
  const loop=game.loop;game.loop=function(){loop();game.soundRadar.draw();game.__perfTick?.();};
  const botFire=game._botFired.bind(game);game._botFired=function(p){botFire(p);game.soundRadar.add(p,'gun');};
  const shot=game._resolveShot.bind(game);game._resolveShot=function(e,t){shot(e,t);game.soundRadar.add(this.player.pos,'gun');};
  const boom=game._explode.bind(game);game._explode=function(p,r){boom(p,r);game.soundRadar.add(p,'boom');};
  window.__vehicleInstall=game;
}
function boot(){if(window.__game){install(window.__game);}else setTimeout(boot,50);}
// 部署按钮本身就是一次用户点击，在这里直接请求全屏，安卓 Chrome 不需要再点第二次。
document.addEventListener('click',function(e){
  if(!e.target.closest('#play')||!(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0))return;
  const root=document.documentElement;
  const lock=()=>{try{const p=screen.orientation?.lock?.('landscape');if(p&&p.catch)p.catch(()=>{});}catch(_){}};
  try{const p=root.requestFullscreen?root.requestFullscreen({navigationUI:'hide'}):null;if(p&&p.then)p.then(lock).catch(()=>{});else lock();}catch(_){}
},true);
window.VehicleWarMode=VehicleWarMode;boot();
})();
