/* 新枪、F35 扩展与双据点占领。全部使用本地资源。 */
(function(){
'use strict';
const T=window.THREE;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

class NewGunSystem{
  constructor(game){
    this.g=game;this.active=null;this.models={};this.reloadEnd=0;this.lastShot=0;this.ready=false;
    this.cfg={
      m4a1:{name:'M4A1',damage:32,rate:.1,mag:30,reserve:90,reload:2.1,auto:true,speed:300,range:180},
      vector:{name:'Vector',damage:24,rate:.055,mag:33,reserve:99,reload:1.8,auto:true,speed:280,range:130},
      m14:{name:'M14',damage:48,rate:.18,mag:20,reserve:60,reload:2.3,auto:false,speed:340,range:300},
      m700:{name:'M700',damage:110,rate:1.05,mag:5,reserve:25,reload:2.8,auto:false,speed:420,range:500}
    };
    for(const [k,c] of Object.entries(this.cfg)){c.ammo=c.mag;c.stock=c.reserve;}
    this.makeUI();
  }
  makeUI(){
    this.classic=[['rifle','MP5'],['akm','AKM'],['pistol','手枪'],['shotgun','霰弹枪'],['sniper','狙击枪']];
    const box=document.createElement('div');box.id='new-gun-bar';box.style.cssText='position:fixed;left:50%;top:112px;transform:translateX(-50%);display:none;gap:5px;z-index:24;pointer-events:auto;max-width:96vw;flex-wrap:wrap;justify-content:center';
    const style='padding:6px 8px;border:1px solid #7fa4b5;background:#10202ddd;color:#fff;border-radius:4px;font:700 11px sans-serif;touch-action:none;white-space:nowrap';
    for(const [i,[slug,name]] of this.classic.entries()){
      const b=document.createElement('button');b.dataset.classicgun=slug;b.textContent=(i+1)+' '+name;b.style.cssText=style;
      b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.equipClassic(slug);});box.appendChild(b);
    }
    for(const [i,k] of Object.keys(this.cfg).entries()){
      const b=document.createElement('button');b.dataset.newgun=k;b.textContent=(i+6)+' '+this.cfg[k].name;b.style.cssText=style;
      b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.equip(k);});box.appendChild(b);
    }
    document.body.appendChild(box);this.box=box;
  }
  equipClassic(slug){
    const g=this.g;if(g.player.dead||g.vehicleWar?.driving)return;
    this.deactivate();if(g.vehicleWar){g.vehicleWar.customWeapon=null;g.vehicleWar.updateHUD();}
    g.weapons.equip(slug);
  }
  async init(){await Promise.all(Object.keys(this.cfg).map(k=>this.g.assets.loadModel(k)));this.ready=true;}
  onLevel(){this.deactivate();this.active=null;this.reloadEnd=0;for(const m of Object.values(this.models))m.visible=false;this.box.style.display='none';}
  equip(k){
    const g=this.g;if(!this.ready||g.player.dead||g.vehicleWar?.driving)return;
    if(g.vehicleWar)g.vehicleWar.customWeapon=null;
    if(this.active===k){this.deactivate();return;}
    this.deactivate();this.active=k;this.reloadEnd=0;
    let m=this.models[k];
    if(!m){
      m=g.assets.instance(k);const box=new T.Box3().setFromObject(m),size=box.getSize(new T.Vector3()),scale=.95/Math.max(size.x,size.y,size.z,.001);
      m.scale.setScalar(scale);m.rotation.y+=Math.PI;m.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});g.rig.weaponCamera.add(m);this.models[k]=m;
    }
    m.visible=true;m.position.set(.31,-.29,-.72);m.rotation.x=.04;m.userData.baseZ=-.72;
    this.g.hud.announce(this.cfg[k].name,'左键射击 · R 换弹 · 再点武器按钮收起');this.updateHUD();
  }
  deactivate(){if(!this.active)return;const m=this.models[this.active];if(m)m.visible=false;this.active=null;this.reloadEnd=0;if(this.g.weapons.gun?.root)this.g.weapons.gun.root.visible=true;if(this.g.weapons.bobPivot)this.g.weapons.bobPivot.visible=true;if(this.g.weapons.recoilPivot)this.g.weapons.recoilPivot.visible=true;this.g.weapons.armsPivot.visible=true;}
  reload(){const c=this.cfg[this.active];if(!c||c.ammo>=c.mag||c.stock<=0||performance.now()<this.reloadEnd)return;this.reloadEnd=performance.now()+c.reload*1000;}
  finishReload(){const c=this.cfg[this.active];if(!c)return;const need=Math.min(c.mag-c.ammo,c.stock);c.ammo+=need;c.stock-=need;this.reloadEnd=0;}
  fire(t){
    const g=this.g,c=this.cfg[this.active];if(!c||g.player.dead||g.paused)return;
    const now=performance.now();if(this.reloadEnd){if(now>=this.reloadEnd)this.finishReload();else return;}
    if(t-this.lastShot<c.rate)return;if(c.ammo<=0){this.reload();return;}
    this.lastShot=t;c.ammo--;const cam=g.rig.camera,dir=cam.getWorldDirection(new T.Vector3()).normalize(),origin=cam.position.clone().addScaledVector(dir,.55);
    g.projectiles.fire({origin,dir,speed:c.speed,drop:0,damage:c.damage,range:c.range,impactForce:4,weapon:this.active,team:g.player.team,owner:g.player});
    g.effects.muzzleWorld(origin);g.rig.addShake(this.active==='m700'?.055:this.active==='m14'?.018:.008);g.soundRadar?.add(origin,'gun');
    const m=this.models[this.active];if(m)m.position.z=m.userData.baseZ+.035;
    if(c.ammo===0)this.reload();this.updateHUD();
  }
  updateHUD(){const c=this.cfg[this.active];if(!c)return;this.g.hud.ammo({bullets:c.ammo,reserve:c.stock,name:c.name,type:'special',fireMode:this.reloadEnd?'换弹中':c.auto?'全自动':'半自动',isReloading:!!this.reloadEnd});}
  handle(t){
    const g=this.g;if(g.player.dead||g.vehicleWar?.driving)return;
    for(const [i,k] of Object.keys(this.cfg).entries()){
      if(g.input.hit('Digit'+(i+6)))this.equip(k);
    }
    for(const [i,[slug]] of this.classic.entries())if(g.input.hit('Digit'+(i+1))){this.equipClassic(slug);return;}
    if(!this.active){this.box.style.display='none';return;}
    if(g.input.hit('KeyV')||g.input.hit('KeyG')){this.deactivate();return;}
    if(g.input.hit('KeyR'))this.reload();
    const c=this.cfg[this.active],trigger=c.auto?g.input.mouseDown(0):g.input.mouseHit(0);if(trigger)this.fire(t);
    if(this.reloadEnd&&performance.now()>=this.reloadEnd)this.finishReload();this.updateHUD();
  }
  tick(){
    const g=this.g,active=this.active&&!g.player.dead&&!g.vehicleWar?.driving&&!g.vehicleWar?.customWeapon;
    this.box.style.display=g.started&&!g.player.dead&&!g.vehicleWar?.driving?'flex':'none';this.box.style.top=g.mode==='conquest'?'145px':'112px';
    for(const b of this.box.querySelectorAll('button')){const selected=b.dataset.newgun?b.dataset.newgun===this.active:!this.active&&g.weapons.gun?.cfg?.slug===b.dataset.classicgun;b.style.borderColor=selected?'#ffe083':'#7fa4b5';b.style.background=selected?'#675221ee':'#10202ddd';b.setAttribute('aria-pressed',String(!!selected));}
    if(active){
      if(g.weapons.gun?.root)g.weapons.gun.root.visible=false;
      // 旧版武器管理器把 Arms / Bob / Recoil 分层，必须一起隐藏，否则旧枪会叠在新枪前。
      g.weapons.armsPivot.visible=false;if(g.weapons.bobPivot)g.weapons.bobPivot.visible=false;if(g.weapons.recoilPivot)g.weapons.recoilPivot.visible=false;
      const m=this.models[this.active];if(m){m.visible=true;m.position.z+=(m.userData.baseZ-m.position.z)*.25;}
    }else for(const m of Object.values(this.models))m.visible=false;
  }
}

class ConquestMode extends window.VehicleWarMode{
  constructor(game){
    super(game);this.tickets={1:150,2:Infinity};this.points=[];this.activeIndex=0;this.captureHud=null;this.deployUI=null;this.playerDeploying=false;
  }
  async init(){
    await Promise.all(['tank_new','ifv2','f35','howitzer','artillery_shell'].map(n=>this.g.assets.loadModel(n)));
    this.buildHowitzer();this.spawnVehicle('tank',1);this.spawnVehicle('f35',1);
    this.ensureSoldiers();this.makePoints();this.makeConquestUI();this.refreshCombatants();this.updateHUD();this.updateTickets();
    this.g.minimap.update=()=>this.updateMinimap();this.updateMinimap();
  }
  ensureSoldiers(){
    const g=this.g;
    for(const team of [1,2]){
      const target=team===g.player.team?23:24;let count=g.bots.filter(b=>b.team===team).length,i=count;
      while(count<target){g._spawnBot(team,i++);count++;}
    }
  }
  makePoints(){
    for(const [index,[id,x,z]] of [['A',-24,18],['B',24,-18],['C',0,52]].entries()){
      const y=this.terrainHeight(x,z),group=new T.Group();group.position.set(x,y,z);
      const pole=new T.Mesh(new T.CylinderGeometry(.09,.12,9,10),new T.MeshStandardMaterial({color:0xd9dee2,metalness:.7,roughness:.3}));pole.position.y=4.5;group.add(pole);
      const cloth=new T.Mesh(new T.PlaneGeometry(3.2,1.75),new T.MeshStandardMaterial({color:0x368cff,side:T.DoubleSide,roughness:.7}));cloth.position.set(1.6,8.15,0);group.add(cloth);
      const ring=new T.Mesh(new T.RingGeometry(8.7,9,64),new T.MeshBasicMaterial({color:0x47e48b,side:T.DoubleSide,transparent:true,opacity:.8}));ring.rotation.x=-Math.PI/2;ring.position.y=.08;group.add(ring);
      const zone=new T.Mesh(new T.CircleGeometry(9,64),new T.MeshBasicMaterial({color:0x47e48b,side:T.DoubleSide,transparent:true,opacity:.1,depthWrite:false}));zone.rotation.x=-Math.PI/2;zone.position.y=.06;group.add(zone);
      this.root.add(group);
      const marker=document.createElement('div');marker.style.cssText='position:absolute;transform:translate(-50%,-50%);width:38px;height:38px;border:3px solid #47e48b;border-radius:50%;display:grid;place-items:center;color:#47e48b;background:#07130dcc;font:900 22px sans-serif;text-shadow:0 1px 3px #000;pointer-events:none';marker.textContent=id;this.ui.appendChild(marker);
      group.visible=index===0;marker.style.display=index===0?'grid':'none';this.points.push({id,pos:this.v(x,y,z),group,cloth,ring,zone,marker,owner:2,progress:0,capturing:false,index});
    }
  }
  makeConquestUI(){
    const hud=document.createElement('div');hud.id='conquest-hud';hud.style.cssText='position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:25;pointer-events:none;text-align:center;color:#fff;font:700 13px sans-serif;text-shadow:0 1px 3px #000';
    hud.innerHTML='<div id="conquest-tickets" style="display:flex;gap:26px;justify-content:center;background:#08131ddd;border:1px solid #66889a66;border-radius:5px;padding:6px 14px"></div><div id="conquest-progress" style="margin-top:5px;color:#ffe084"></div>';document.body.appendChild(hud);this.captureHud=hud;
    const deploy=document.createElement('div');deploy.id='conquest-deploy';deploy.style.cssText='position:fixed;inset:0;z-index:70;display:none;place-items:center;background:#06101bea;color:#fff;pointer-events:auto;text-align:center;font-family:sans-serif';
    deploy.innerHTML='<div style="min-width:300px;padding:26px;border:1px solid #7294a6;background:#0d1c29;border-radius:8px"><div style="font-size:26px;font-weight:800;letter-spacing:4px">重新部署</div><p style="color:#b9cbd5">选择兵种后返回战场。名字与进度仍只保存在本机。</p><div id="deploy-classes" style="display:flex;gap:7px;justify-content:center;margin:14px 0"><button data-deploy-class="rifle">步枪兵</button><button data-deploy-class="c4">C4兵</button><button data-deploy-class="howitzer">反载兵</button><button data-deploy-class="repair">维修兵</button><button data-deploy-class="magnetic">磁吸兵</button></div><button id="deploy-now" style="padding:12px 40px;background:#dbe8df;border:0;border-radius:4px;font-weight:800">部署到己方基地</button><div id="deploy-tickets" style="margin-top:12px;color:#ffe084"></div></div>';
    document.body.appendChild(deploy);this.deployUI=deploy;this.deployClass='rifle';
    deploy.querySelectorAll('[data-deploy-class]').forEach(b=>{b.style.padding='8px';b.addEventListener('click',()=>{this.deployClass=b.dataset.deployClass;deploy.querySelectorAll('[data-deploy-class]').forEach(x=>x.style.outline=x===b?'2px solid #ffe083':'none');});});
    deploy.querySelector('#deploy-now').addEventListener('click',()=>this.deployPlayer());
  }
  onDeath(victim,killer,head){
    if(this.g.matchOver)return;const team=victim.team;if(team===1)this.tickets[1]=Math.max(0,this.tickets[1]-1);this.updateTickets();
    if(victim===this.g.player){
      this.playerDeploying=true;this.g.respawnT=999999;this.deployUI.style.display='grid';document.getElementById('death')?.classList.remove('on');
      this.deployUI.querySelector('#deploy-tickets').textContent='攻方 '+this.tickets[1]+' · 守方 ∞ 兵力';
    }else if(this.tickets[team]<=0){victim.respawnT=999999;}
    if(this.tickets[team]<=0)this.g._endMatch(team===1?2:1);
  }
  deployPlayer(){
    const g=this.g;if(!this.playerDeploying||this.tickets[g.player.team]<=0)return;
    this.playerDeploying=false;this.deployUI.style.display='none';g.respawnT=0;g.spawnPlayer();this.customWeapon=this.deployClass==='rifle'?null:this.deployClass;this.updateHUD();
  }
  updateTickets(){
    const el=this.captureHud?.querySelector('#conquest-tickets');if(el)el.innerHTML='<span style="color:#ff7b6e">攻方 '+this.tickets[1]+'</span><span style="color:#78aef5">守方 ∞</span>';
  }
  addScore(team,points,owner,victim){this.g.hud.kill(owner?.name||'载具火力',victim.name,false,team,victim.team);}
  update(dt){
    super.update(dt);if(this.g.paused||this.g.matchOver)return;this.updateSoldierSpacing(dt);this.updatePoints(dt);this.updateDeploymentBots(dt);
  }
  updateDeploymentBots(dt){
    this._think=(this._think||0)-dt;if(this._think>0)return;this._think=1;
    const p=this.points[this.activeIndex];if(!p)return;
    for(const [i,b] of this.g.bots.entries()){
      if(this.tickets[b.team]<=0){b.respawnT=999999;continue;}
      if(!b.dead&&!b.target){const angle=i*2.399963+(b.team===1?0:Math.PI),radius=3.5+(i%5)*1.25;b.destination=p.pos.clone().add(this.v(Math.cos(angle)*radius,0,Math.sin(angle)*radius));b.path=null;}
    }
  }
  updateSoldierSpacing(dt){
    const bs=this.g.bots.filter(b=>!b.dead),min=2.05;
    for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const a=bs[i],b=bs[j],dx=a.pos.x-b.pos.x,dz=a.pos.z-b.pos.z,d=Math.hypot(dx,dz);if(d<=.001||d>=min)continue;const push=Math.min((min-d)*.5,dt*2.2),nx=dx/d,nz=dz/d;a.pos.x+=nx*push;a.pos.z+=nz*push;b.pos.x-=nx*push;b.pos.z-=nz*push;a.model.position.copy(a.pos);b.model.position.copy(b.pos);}
  }
  updatePoints(dt){
    let status='';const active=this.points[this.activeIndex];
    for(const p of this.points){
      const unlocked=p.index<=this.activeIndex;p.group.visible=unlocked;p.capturing=false;
      if(p===active&&p.owner!==1){
        let attackers=0,defenders=0;
        for(const c of this.g.combatants){if(c.dead)continue;const d=Math.hypot(c.pos.x-p.pos.x,c.pos.z-p.pos.z);if(d<=9){if(c.team===1)attackers++;else defenders++;}}
        p.capturing=attackers>0&&defenders===0;
        if(p.capturing)p.progress=clamp(p.progress+dt/30,0,1);
        else if(defenders>0&&attackers===0)p.progress=clamp(p.progress-dt/20,0,1);
        if(p.progress>=1){p.owner=1;p.cloth.material.color.setHex(0xe43d35);this.activeIndex++;const next=this.points[this.activeIndex];if(next){next.group.visible=true;this.g.hud.announce(p.id+' 点已占领 · 解锁 '+next.id+' 点','旗帜已变红 · 前往下一个据点');}else this.g.hud.announce('C 点已被攻方占领','攻方获胜');}
      }
      const color=p.owner===this.g.player.team?'#47e48b':'#ef5349';p.ring.material.color.set(color);p.zone.material.color.set(color);p.marker.style.color=color;p.marker.style.borderColor=color;
      const screen=p.pos.clone().add(this.v(0,11,0)).project(this.g.rig.camera),visible=unlocked&&screen.z<1&&screen.z>-1&&Math.abs(screen.x)<1.1&&Math.abs(screen.y)<1.1;p.marker.style.display=visible?'grid':'none';if(visible){p.marker.style.left=((screen.x*.5+.5)*innerWidth)+'px';p.marker.style.top=((-screen.y*.5+.5)*innerHeight)+'px';}
      if(p.capturing||p===active&&p.progress>0)status=p.id+' '+Math.floor(p.progress*100)+'% · '+Math.ceil((1-p.progress)*30)+'秒';
    }
    this.captureHud.querySelector('#conquest-progress').textContent=status||(active?'当前目标 '+active.id:'全部据点已占领');
    if(this.points[2].owner===1)this.g._endMatch(1);
  }
  updateMinimap(){
    super.updateMinimap();const c=this.g.minimap.ctx,to=v=>200+v/175*185;
    for(const p of this.points){if(p.index>this.activeIndex)continue;c.fillStyle=p.owner===this.g.player.team?'#47e48b':'#ef5349';c.beginPath();c.arc(to(p.pos.x),to(p.pos.z),11,0,Math.PI*2);c.fill();c.fillStyle='#fff';c.font='bold 14px sans-serif';c.textAlign='center';c.fillText(p.id,to(p.pos.x),to(p.pos.z)+5);}
  }
  reset(){
    super.reset();this.tickets={1:150,2:Infinity};this.activeIndex=0;this.playerDeploying=false;this.deployUI.style.display='none';
    for(const p of this.points){p.owner=2;p.progress=0;p.cloth.material.color.setHex(0x368cff);p.group.visible=p.index===0;p.marker.style.display=p.index===0?'grid':'none';}this.updateTickets();
  }
  destroy(){this.captureHud?.remove();this.deployUI?.remove();for(const p of this.points)p.marker.remove();super.destroy();}
}

function install(game){
  if(game.__battlefieldExpansion)return;game.__battlefieldExpansion=true;
  const guns=new NewGunSystem(game);game.newGuns=guns;guns.init().catch(e=>console.error('新枪模型加载失败',e));
  const load=game.loadLevel.bind(game);game.loadLevel=async function(map,mode){await load(map,mode);this.newGuns?.onLevel();};
  const input=game._handleWeaponInput.bind(game);game._handleWeaponInput=function(t){this.newGuns?.handle(t);if(this.newGuns?.active)return;input(t);};
  const loop=game.loop;game.loop=function(){loop();game.newGuns?.tick();};
  window.__newGuns=guns;
}
function boot(){if(window.__game&&window.VehicleWarMode){window.ConquestMode=ConquestMode;install(window.__game);}else setTimeout(boot,50);}
window.NewGunSystem=NewGunSystem;boot();
})();
