import * as T from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';
import {createShell,createFurniture,canvasTexture,mat,mesh,box,ellipsoid,cylinder,rod,group,plant} from './objects.js';
import {dimensions} from './core.js';
import {createPanorama,createOceanMaterial,addDistanceHaze} from './environment.js';
import {shoreline} from './coast.js';
import {createAmbience} from './ambience.js';
import {makeHouse,enrichInterior,ATTIC_Y} from './house.js';
import {makeHeater} from './heating.js';
import {createCelestialBackdrop} from './celestial.js';

const LIGHTS={morning:{bg:'#e9f1f1',sun:'#fff0c5',intensity:2.1,ambient:1.5,sea:'#66b6cd'},afternoon:{bg:'#eaf1f5',sun:'#fff0d5',intensity:2.25,ambient:1.65,sea:'#50a6c3'},sunset:{bg:'#eddfdb',sun:'#ffbe88',intensity:2.05,ambient:1.15,sea:'#a7a7c1'},night:{bg:'#243b55',sun:'#9bbbea',intensity:.85,ambient:.85,sea:'#3b647f'}};

export class RoomWorld{
  constructor(canvas,state){
    this.canvas=canvas;this.state=state;this.time=0;this.scene=new T.Scene();this.backgroundColor=new T.Color('#eaf1f5');this.scene.fog=new T.Fog('#eaf1f5',372,445);
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.autoClear=false;this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.94;
    this.viewMode="interior";this.camera=new T.OrthographicCamera(-10,10,7,-7,.1,900);this.defaultPosition=new T.Vector3(14,12,19);this.defaultTarget=new T.Vector3(.8,1.1,-.6);this.defaultPosition.sub(this.defaultTarget).setLength(350).add(this.defaultTarget);this.camera.position.copy(this.defaultPosition);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.target.copy(this.defaultTarget);this.controls.enableDamping=true;this.controls.dampingFactor=.07;this.controls.enablePan=false;this.controls.minZoom=.65;this.controls.maxZoom=1.65;this.controls.minPolarAngle=.64;this.controls.maxPolarAngle=1.24;this.controls.minAzimuthAngle=-.15;this.controls.maxAzimuthAngle=1.32;this.controls.rotateSpeed=.46;this.controls.zoomSpeed=.7;this.controls.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.DOLLY,RIGHT:T.MOUSE.ROTATE};
    this.hemi=new T.HemisphereLight('#d7eeff','#d6c5ad',2.4);this.scene.add(this.hemi);this.ambient=new T.AmbientLight('#fff4e4',.18);this.scene.add(this.ambient);
    this.sun=new T.DirectionalLight('#fff0d4',3);this.sun.position.set(-3,12,7);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-11,right:12,top:11,bottom:-10,near:1,far:35});this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.035;this.sun.shadow.radius=3;this.scene.add(this.sun);
    const fill=new T.DirectionalLight('#b0d3ed',.65);fill.position.set(8,6,-7);this.scene.add(fill);
    this.root=group(this.scene);this.lamps=[];this.shell=createShell(this.root,this.lamps);this.furniture=new Map();for(const item of state.furniture)this.furniture.set(item.id,createFurniture(this.root,item,this.lamps));
    this.contactTexture=canvasTexture((c,w,h)=>{const grad=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);grad.addColorStop(0,'rgba(40,65,83,.26)');grad.addColorStop(.45,'rgba(40,65,83,.16)');grad.addColorStop(1,'rgba(40,65,83,0)');c.fillStyle=grad;c.fillRect(0,0,w,h)},128);
    for(const item of state.furniture){if(item.passable)continue;const g=this.furniture.get(item.id);const s=mesh(g,new T.PlaneGeometry(item.w*1.3,item.d*1.3),new T.MeshBasicMaterial({map:this.contactTexture,transparent:true,depthWrite:false}),0,.018,0);s.rotation.x=-Math.PI/2;s.castShadow=false;s.raycast=()=>{}}
    this.house=makeHouse(this.scene,this.lamps);this.windowPanes=[];this.scene.traverse(o=>{if(o.userData.windowPane)this.windowPanes.push(o)});this.details=enrichInterior(this.root,this.furniture,this.shell);this.heater=makeHeater(this.root);
    for(const [id,g]of this.furniture){const action={shelf:"read",plant:"water",whale:"hug",aquarium:"feed"}[id];if(action)g.traverse(o=>{if(o.isMesh&&!o.userData.interaction)o.userData.interaction=action})}
    this.furniture.get("desk").userData.screen.userData.interaction="computer-screen";
    for(const l of this.lamps)l.traverse(o=>{if(o.isMesh)o.userData.interaction="lamp"});
    this.ambience=createAmbience(this.scene,this.house);this.makeLandscape();this.makeWeather();this.makeCharacter();this.assetsReady=Promise.all([this.assetsReady,this.backgroundReady,this.celestial.ready]).then(()=>this.refreshStars());
    this.marker=mesh(this.scene,new T.RingGeometry(.14,.18,40),new T.MeshBasicMaterial({color:'#91b9c7',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}),0,.25,0);this.marker.rotation.x=-Math.PI/2;this.marker.visible=false;this.marker.castShadow=false;
    this.selection=group(this.scene);this.selection.visible=false;this.raycaster=new T.Raycaster();this.pointer=new T.Vector2();this.floorPlane=new T.Plane(new T.Vector3(0,1,0),-.22);this.rayPoint=new T.Vector3();this.resize();this.setEnvironment(state,true);
  }
  async ready(){await this.assetsReady;this.render(0)}
  makeCharacter(){
    this.character=group(this.scene,.2,.25,.7);this.charVisual=group(this.character);const characterGeometry=new T.PlaneGeometry(1,1);characterGeometry.translate(0,.5,0);this.charSprite=new T.Mesh(characterGeometry,new T.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:true,toneMapped:false,side:T.DoubleSide}));this.charSprite.scale.set(1.8,1.8,1);this.charVisual.add(this.charSprite);
    this.charShadow=mesh(this.character,new T.PlaneGeometry(1.55,.9),new T.MeshBasicMaterial({map:this.contactTexture,transparent:true,depthWrite:false,opacity:.8}),0,.014,0);this.charShadow.rotation.x=-Math.PI/2;this.charShadow.castShadow=false;
    this.poses={};this.pose='idle';this.charFacing=1;const loader=new T.TextureLoader();
    this.assetsReady=Promise.all([loader.loadAsync('./assets/dayu.png'),loader.loadAsync('./assets/dayu-actions.png'),loader.loadAsync('./assets/dayu-walk.png')]).then(([base,atlas,walkAtlas])=>{
      for(const tex of[base,atlas,walkAtlas]){tex.colorSpace=T.SRGBColorSpace;tex.minFilter=T.LinearMipmapLinearFilter;tex.magFilter=T.LinearFilter;tex.anisotropy=8}
      this.poses.idle=base;const cells={walk:[0,.5],computer:[.5,.5],sleep:[0,0],tea:[.5,0]};for(const[name,[x,y]]of Object.entries(cells)){const tex=atlas.clone();tex.repeat.set(.5,.5);tex.offset.set(x,y);tex.needsUpdate=true;this.poses[name]=tex}this.walkFrames=[[0,.5],[.5,.5],[0,0],[.5,0]].map(([x,y])=>{const tex=walkAtlas.clone();tex.repeat.set(.5,.5);tex.offset.set(x,y);tex.needsUpdate=true;return tex});this.poses.walk=this.walkFrames[0];this.gaitDistance=0;this.gaitSpeed=0;this.displayFacing=1;this.lastWalkFrame=-1;this.setPose('idle');
    });
    const sleepTex=canvasTexture((c,w,h)=>{c.fillStyle='#7297b5';c.font='bold 90px Georgia';c.fillText('z',35,192);c.font='bold 120px Georgia';c.fillText('z',130,125);c.font='bold 145px Georgia';c.fillText('Z',270,70)},512,256);
    this.sleepZ=new T.Sprite(new T.SpriteMaterial({map:sleepTex,transparent:true,depthWrite:false,toneMapped:false}));this.sleepZ.scale.set(1.15,.58,1);this.sleepZ.position.set(.3,1.8,0);this.sleepZ.visible=false;this.character.add(this.sleepZ);
  }
  setPose(mode){if(!this.poses[mode])mode='idle';this.pose=mode;this.charSprite.material.map=this.poses[mode];this.charSprite.rotation.z=0;this.charSprite.material.needsUpdate=true;this.sleepZ.visible=mode==='sleep';this.charShadow.visible=mode!=='sleep'&&mode!=='computer';let scale=mode==='walk'?1.9:mode==='sleep'?1.9:mode==='computer'?1.55:mode==='tea'?1.6:1.8;this.baseCharScale=scale;this.charSprite.position.y=mode==='walk'?-.09:0;this.charSprite.scale.set(scale,scale,1);this.charVisual.position.y=0}
  setCharacter(x,z,y=.23){this.character.position.set(x,y,z)}
  setView(mode){
    this.kitchenView=null;this.controls.maxZoom=1.65;this.house.atticBeams.forEach(b=>b.visible=true);if(mode!=='attic')this.house.kitchen.setFridge(false);
    this.viewMode=mode;this.house.exterior.visible=mode!=='interior';this.house.roof.visible=mode==='exterior';this.house.attic.visible=mode==='attic';this.character.visible=mode!=='exterior';this.details.stairs.visible=mode==='interior';this.floorPlane.constant=mode==='attic'?-ATTIC_Y:-.24;
    this.controls.minAzimuthAngle=mode==='exterior'?-Infinity:-.15;this.controls.maxAzimuthAngle=mode==='exterior'?Infinity:1.32;this.controls.maxPolarAngle=mode==='exterior'?1.42:1.24;
    const poses={interior:[[14,12,19],[.8,1.1,-.6]],exterior:[[18,13,23],[.7,2.5,0]],attic:[[13,15,17],[0,5.1,0]]};const[p,t]=poses[mode];this.cameraMove={from:this.camera.position.clone(),to:new T.Vector3(...p).sub(new T.Vector3(...t)).setLength(350).add(new T.Vector3(...t)),targetFrom:this.controls.target.clone(),targetTo:new T.Vector3(...t),t:0};this.controls.enabled=false;this.camera.zoom=1;this.resize();
  }
  setScreen(source){
    if(!source?.canvas)return;const desk=this.furniture.get('desk'),screen=desk.userData.screen;
    if(this.screenCanvas!==source.canvas){this.screenMaterial?.map?.dispose();this.screenMaterial?.dispose();this.screenCanvas=source.canvas;const texture=new T.CanvasTexture(source.canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;this.screenMaterial=new T.MeshBasicMaterial({map:texture,toneMapped:false});screen.material=this.screenMaterial}
    this.screenMaterial.map.needsUpdate=true;this.screenMaterial.color.set(source.power?'#ffffff':'#53616b');this.screenPower=source.power;this.screenApp=source.app;this.screenRevision=source.revision;desk.userData.monitorLED.material.color.set(source.power?'#a2e2ce':'#627582');
  }
  focusKitchen(mode){
    if(this.viewMode!=='attic')return;if(!this.kitchenView)this.kitchenView={position:(this.cameraMove?.to||this.camera.position).clone(),target:(this.cameraMove?.targetTo||this.controls.target).clone(),zoom:this.cameraMove?.zoomTo??this.camera.zoom};
    this.house.atticBeams.forEach(b=>b.visible=false);
    const target=new T.Vector3(mode==='fridge'?.75:mode==='cook'?-.8:0,mode==='table'?4.95:5.25,mode==='table'?.3:-3.05),position=new T.Vector3(3.5,3.0,9).setLength(350).add(target);
    this.controls.maxZoom=3.1;this.cameraMove={from:this.camera.position.clone(),to:position,targetFrom:this.controls.target.clone(),targetTo:target,zoomFrom:this.camera.zoom,zoomTo:this.width<600?2.25:2.65,t:0};this.controls.enabled=false;
  }
  restoreKitchenView(keep=false){
    if(keep||!this.kitchenView)return;const v=this.kitchenView;this.kitchenView=null;this.house.atticBeams.forEach(b=>b.visible=true);this.cameraMove={from:this.camera.position.clone(),to:v.position,targetFrom:this.controls.target.clone(),targetTo:v.target,zoomFrom:this.camera.zoom,zoomTo:v.zoom,t:0};this.controls.enabled=false;
  }
  feedFish(){const tank=this.furniture.get('aquarium');if(!tank?.visible||tank.userData.aquarium.feeding>0)return false;const data=tank.userData.aquarium;data.feeding=6;data.food.visible=true;data.food.children.forEach((p,i)=>p.position.set(Math.sin(i*2.4)*.26,1.52+i*.006,Math.cos(i*2.4)*.15));return true}
  ringChime(){this.chimeImpulse=1.6}
  hugWhale(){this.hugTime=1.3}
  setMusicPlaying(value){this.musicPlaying=value;this.details.musicLED.material.color.set(value?'#ace6c7':'#7694a1')}
  animateLittleLife(dt,time){
    this.house.kitchen.update(dt,time);
    this.ambience.update(time);const tank=this.furniture.get('aquarium');
    if(tank){const d=tank.userData.aquarium;d.feeding=Math.max(0,d.feeding-dt);d.food.visible=d.feeding>0;d.food.children.forEach((p,i)=>{p.position.y=Math.max(.96,p.position.y-dt*(.065+i*.004));p.visible=d.feeding>i*.26});
      if(tank.visible){d.fish.forEach((f,i)=>{const a=time*(.52+i*.08)+i*2.1,radius=d.feeding>0?.23:.33;f.position.set(Math.sin(a)*radius,1.18+Math.sin(a*1.4+i)*.13+(d.feeding>0?.11:0),Math.cos(a)*.16);f.rotation.y=Math.atan2(-Math.sin(a)*.16,Math.cos(a)*radius);f.userData.tail.rotation.y=Math.sin(time*11+i)*.35});d.bubbles.forEach((b,i)=>{const progress=(time*.15+i/8)%1;b.position.set(-.42+Math.sin(time*2+i)*.014,.96+progress*.53,-.19)})}
    }
    if(this.chimeImpulse>0){this.chimeImpulse=Math.max(0,this.chimeImpulse-dt);this.details.chime.rotation.z+=Math.sin(time*15)*this.chimeImpulse*.12}
    const whale=this.furniture.get('whale');if(this.hugTime>0){this.hugTime=Math.max(0,this.hugTime-dt);const pulse=Math.sin((1.3-this.hugTime)*Math.PI*3)*this.hugTime*.05;whale.scale.set(1+pulse,1-pulse*.7,1+pulse)}else whale.scale.set(1,1,1);
  }
  makeLandscape(){
    const oceanGeom=new T.PlaneGeometry(560,560,80,80);oceanGeom.rotateX(-Math.PI/2);oceanGeom.translate(0,0,-80);
    this.oceanMaterial=createOceanMaterial();
    addDistanceHaze(this.house.coast.terrain,this.oceanMaterial.uniforms);addDistanceHaze(this.house.coast.path,this.oceanMaterial.uniforms);
    this.ocean=mesh(this.scene,oceanGeom,this.oceanMaterial,0,-.4,0);this.ocean.castShadow=false;this.ocean.receiveShadow=false;
    this.foam=group(this.scene);for(let k=0;k<3;k++){const points=[];for(let i=0;i<=220;i++){const x=-40+i*.4;points.push(new T.Vector3(x,-.34,shoreline(x)-.25-k*.52))}const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#fff9e9',transparent:true,opacity:.36-k*.06}));this.foam.add(line)}
    this.boats=[];for(let i=0;i<2;i++){
      const boat=group(this.scene,[1.5,5.4][i],-.3,shoreline([1.5,5.4][i])-[1.9,2.5][i]);const hull=ellipsoid(boat,0,0,0,.78,.2,.28,i===1?'#b99872':'#f0ead7');box(boat,1.25,.06,.4,0,.09,0,'#e1caa1',.06);rod(boat,[.05,.1,0],[.05,1.6,0],.025,'#d1b68e');
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([.02,.24,0,.02,1.53,0,-.74,.24,0],3));geo.computeVertexNormals();mesh(boat,geo,mat(i===1?'#d5a98c':'#faf4dc',{side:T.DoubleSide}));const sail2=new T.BufferGeometry();sail2.setAttribute('position',new T.Float32BufferAttribute([.12,.27,0,.12,1.28,0,.64,.27,0],3));sail2.computeVertexNormals();mesh(boat,sail2,mat('#c0d8dc',{side:T.DoubleSide}));boat.rotation.y=.2+i*.2;boat.userData.baseX=[1.5,5.4][i];boat.userData.seaward=[1.9,2.5][i];boat.userData.phase=i*2;boat.scale.setScalar(.8+i*.07);for(let r=0;r<3;r++){const wake=mesh(boat,new T.RingGeometry(.55+r*.15,.565+r*.15,48),new T.MeshBasicMaterial({color:"#edf7f3",transparent:true,opacity:.34-r*.07,side:T.DoubleSide,depthWrite:false}),0,-.11,0);wake.rotation.x=-Math.PI/2;wake.scale.y=.45;wake.castShadow=false}this.boats.push(boat);
    }
    // A few quiet details on the sand, clear of the balcony view.
    for(const[x,z,s]of[[-10,-7,.75],[12.8,.5,.65],[-13,-6,.5]]){
      const palm=group(this.scene,x,-.2,z);palm.scale.setScalar(s);const trunk=new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(.1,1.2,0),new T.Vector3(.35,2.4,0)]);mesh(palm,new T.TubeGeometry(trunk,15,.07,8,false),mat('#bda780'));for(let i=0;i<7;i++){const a=i*6.28/7;const leaf=ellipsoid(palm,.35+Math.sin(a)*.5,2.3,Math.cos(a)*.5,.17,.08,.7,'#8caf96');leaf.rotation.y=a;leaf.rotation.z=Math.sin(a)*.25}
    }
    this.clouds=[];for(let i=0;i<6;i++){const c=group(this.scene,-20+i*8,5.8+(i%2)*1.6,-24-(i%3)*4);for(let j=0;j<5;j++){const cl=ellipsoid(c,(j-2)*.56,Math.sin(j)*.25,0,.75,.34+(j%2)*.19,.4,mat('#fbfcf6',{transparent:true,opacity:.63,depthWrite:false}));cl.castShadow=false}c.userData.x=c.position.x;this.clouds.push(c)}
    this.celestial=createCelestialBackdrop();this.stars=this.celestial.points;
    this.clouds.forEach(c=>c.visible=false);
    this.backgroundReady=new T.TextureLoader().loadAsync('./assets/coast-panorama-v4.png').then(texture=>{
      this.skyTexture=texture;this.panorama=createPanorama(texture);
      const pmrem=new T.PMREMGenerator(this.renderer);this.glassEnvironment=pmrem.fromEquirectangular(texture);pmrem.dispose();
      for(const p of this.windowPanes){p.material.envMap=this.glassEnvironment.texture;p.material.needsUpdate=true}
      this.resize();this.setScreen();
    });
  }
  makeWeather(){
    this.weatherCount=450;this.weatherPositions=new Float32Array(this.weatherCount*3);this.weatherVel=[];
    for(let i=0;i<this.weatherCount;i++){this.weatherPositions[i*3]=(Math.random()-.5)*32;this.weatherPositions[i*3+1]=Math.random()*10;this.weatherPositions[i*3+2]=-4.4-Math.random()*16;this.weatherVel.push(.5+Math.random())}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(this.weatherPositions,3));const texture=canvasTexture((c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'#ffffff');g.addColorStop(.55,'#ffffffef');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,w,h)},32);
    this.snow=new T.Points(geo,new T.PointsMaterial({map:texture,color:'#fffef4',size:.075,transparent:true,opacity:.85,depthWrite:false}));this.scene.add(this.snow);
    const rainGeo=new T.BufferGeometry();rainGeo.setAttribute('position',new T.BufferAttribute(new Float32Array(this.weatherCount*6),3));this.rain=new T.LineSegments(rainGeo,new T.LineBasicMaterial({color:'#accbdc',transparent:true,opacity:.6,depthWrite:false}));this.scene.add(this.rain);
  }
  setEnvironment(state,immediate=false){
    this.state=state;this.environment=LIGHTS[state.time];this.targetBg=new T.Color(this.environment.bg);this.targetSea=new T.Color(this.environment.sea);this.targetSun=new T.Color(this.environment.sun);this.targetIntensity=this.environment.intensity;this.targetAmbient=this.environment.ambient;
    if(state.weather==='cloudy'||state.weather==='rainy'){this.targetBg.lerp(new T.Color(state.time==='night'?'#1b3047':'#c9d8e2'),.45);this.targetIntensity*=.62;this.targetSea.lerp(new T.Color('#91acbf'),.35)}
    if(state.weather==='snowy'){this.targetBg.lerp(new T.Color(state.time==='night'?'#496078':'#e7eef1'),.5);this.targetIntensity*=.7;this.targetSea.lerp(new T.Color('#b2c9d5'),.5)}
    this.snow.visible=state.weather==='snowy';this.rain.visible=state.weather==='rainy';this.stars.visible=state.time==='night';this.stars.material.opacity=state.weather==='sunny'?.85:.3;this.refreshStars();
    this.skyTint=new T.Color(state.time==='night'?'#4c628e':state.time==='sunset'?'#f4c2a2':state.weather==='rainy'?'#a8becf':state.weather==='snowy'?'#cad8e3':'#ffffff');
    this.targetDoor=state.balcony?-1.9:0;this.lampOn=state.lamps;for(const pane of this.windowPanes){pane.material.emissiveIntensity=this.lampOn?(state.time==='night'?.20:.025):0;pane.material.color.set(state.time==='night'?'#a4bacb':'#b9d6dc');pane.material.envMapIntensity=state.time==='night'?.2:.65}for(const l of this.lamps){l.userData.light.intensity=this.lampOn?(l.name==='porch-lantern'?2:4.5):0;if(l.userData.bulb)l.userData.bulb.material.emissiveIntensity=this.lampOn?2:.05}this.oceanMaterial.uniforms.uStorm.value=state.weather==='rainy'?1:0;
    for(const b of this.shell.bulbs)b.material.emissiveIntensity=this.lampOn?2:.25;
    if(immediate){this.backgroundColor.copy(this.targetBg);this.oceanMaterial.uniforms.uSea.value.copy(this.targetSea);this.sun.color.copy(this.targetSun);this.sun.intensity=this.targetIntensity;this.hemi.intensity=this.targetAmbient;this.shell.door.position.z=-2.44+this.targetDoor}
  }
  syncFurniture(){for(const item of this.state.furniture){const g=this.furniture.get(item.id);g.position.set(item.x,.2,item.z);g.rotation.y=item.rotation;g.visible=!item.stored}if(this.selectedId)this.select(this.selectedId)}
  select(id,valid=true){this.selectedId=id;this.selection.clear();this.selection.visible=!!id;if(!id)return;const item=this.state.furniture.find(i=>i.id===id);if(!item||item.stored){this.selection.visible=false;return}const[w,d]=dimensions(item);const pts=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[-w/2,-d/2]].map(([x,z])=>new T.Vector3(x,.27,z));const line=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:valid?'#6197b3':'#d48d82'}));this.selection.add(line);this.selection.position.set(item.x,0,item.z)}
  moveMarker(x,z){this.marker.position.set(x,this.viewMode==='attic'?ATTIC_Y+.02:.25,z);this.marker.visible=true;this.markerLife=1}
  resize(){const rect=this.canvas.parentElement.getBoundingClientRect();this.width=rect.width;this.height=rect.height;this.renderer.setSize(rect.width,rect.height,false);const aspect=rect.width/rect.height;const half=this.viewMode==='exterior'?Math.max(10.8,13/aspect):Math.max(7.2,8.3/aspect);this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();this.controls.update()}
  resetCamera(){this.setView(this.viewMode)}
  pick(clientX,clientY){const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const roots=this.viewMode==='exterior'?[this.house.exterior,this.house.yard]:this.viewMode==='attic'?[this.house.attic]:[this.root,this.character];const hit=this.raycaster.intersectObjects(roots,true).find(h=>this.isVisible(h.object)&&(h.object.userData.itemId||h.object.userData.balconyDoor||h.object.userData.interaction));const floor=this.raycaster.ray.intersectPlane(this.floorPlane,new T.Vector3());return{itemId:hit?.object.userData.itemId,door:!!hit?.object.userData.balconyDoor,interaction:hit?.object.userData.interaction,point:floor?{x:floor.x,z:floor.z}:null}}
  isVisible(o){while(o){if(!o.visible)return false;o=o.parent}return true}
  project(x,y,z){const v=new T.Vector3(x,y,z).project(this.camera);return{x:(v.x*.5+.5)*this.width,y:(-.5*v.y+.5)*this.height}}
  frame(dt,elapsed,moving=false){
    if(this.state.realTime&&Math.floor(elapsed/30)!==this.lastStarUpdate){this.lastStarUpdate=Math.floor(elapsed/30);this.refreshStars()}
    this.time=elapsed;const k=1-Math.exp(-dt*2.5);this.backgroundColor.lerp(this.targetBg,k);this.scene.fog.color.copy(this.backgroundColor);this.sun.color.lerp(this.targetSun,k);this.sun.intensity=T.MathUtils.lerp(this.sun.intensity,this.targetIntensity,k);this.hemi.intensity=T.MathUtils.lerp(this.hemi.intensity,this.targetAmbient,k);this.oceanMaterial.uniforms.uSea.value.lerp(this.targetSea,k);this.oceanMaterial.uniforms.uBg.value.copy(this.backgroundColor);this.oceanMaterial.uniforms.uTime.value=elapsed;
    this.shell.door.position.z=T.MathUtils.lerp(this.shell.door.position.z,-2.44+this.targetDoor,k*1.5);
    this.boats.forEach((b,i)=>{b.position.x=b.userData.baseX+Math.sin(elapsed*.026+i)*.65;b.position.z=shoreline(b.position.x)-b.userData.seaward;b.position.y=-.26+Math.sin(elapsed*.8+i*2)*.05;b.rotation.z=Math.sin(elapsed*.7+i)*.035});this.foam.children.forEach((f,i)=>{f.position.z=Math.sin(elapsed*.5+i)*.12;f.material.opacity=.23+Math.sin(elapsed*.65+i)*.12});
    this.clouds.forEach((c,i)=>{c.position.x=c.userData.x+Math.sin(elapsed*.013+i)*1.6});this.shell.curtains.forEach((c,i)=>c.rotation.z=Math.sin(elapsed*1.3+i)*.008*(this.state.balcony?1:.2));
    this.charSprite.rotation.y=Math.atan2(this.camera.position.x-this.controls.target.x,this.camera.position.z-this.controls.target.z);
    if(this.pose==='walk'){
      const phase=(this.gaitDistance/.96)%1,frame=Math.floor(phase*4),amount=Math.min(1,this.gaitSpeed/1.65);
      if(frame!==this.lastWalkFrame){this.charSprite.material.map=this.walkFrames[frame];this.lastWalkFrame=frame;this.displayFacing=this.charFacing}
      if(this.gaitSpeed<.5)this.displayFacing=this.charFacing;
      this.charVisual.position.y=Math.sin(phase*Math.PI*4)*.009*amount;this.charSprite.rotation.z=Math.sin(phase*Math.PI*2)*.009*amount;this.charSprite.scale.set(this.baseCharScale*this.displayFacing,this.baseCharScale,1);this.charShadow.scale.set(1,.96,1);this.charShadow.material.opacity=.77;
    }else{this.lastWalkFrame=-1;this.charVisual.position.y=0;this.charSprite.scale.y=this.baseCharScale*(1+Math.sin(elapsed*2)*.012);this.charSprite.rotation.z=this.pose==='computer'?Math.sin(elapsed*9)*.012:0;this.charShadow.scale.set(1,1,1);this.charShadow.material.opacity=.8}
    if(this.pose==='sleep'){this.sleepZ.position.y=1.28+Math.sin(elapsed*1.6)*.08;this.sleepZ.material.opacity=.6+Math.sin(elapsed*1.6)*.25}
    if(this.pose==='tea')this.charSprite.rotation.z=Math.sin(elapsed*1.6)*.025;

    if(this.cameraMove){const m=this.cameraMove;m.t=Math.min(1,m.t+dt*1.35);const e=m.t*m.t*(3-2*m.t);this.camera.position.lerpVectors(m.from,m.to,e);this.controls.target.lerpVectors(m.targetFrom,m.targetTo,e);if(m.zoomTo!==undefined){this.camera.zoom=T.MathUtils.lerp(m.zoomFrom,m.zoomTo,e);this.camera.updateProjectionMatrix()}if(m.t===1){this.cameraMove=null;this.controls.enabled=true;if(!this.kitchenView)this.controls.maxZoom=1.65}}
    this.shell.curtains.forEach((c,i)=>{const open=this.state.curtainsOpen!==false;c.scale.x=T.MathUtils.lerp(c.scale.x,open?1:3.7,k);c.position.x=T.MathUtils.lerp(c.position.x,open?(i?-1.17+5.49:-1.17):(i?3.0:.2),k)});
    this.details.chime.rotation.z=Math.sin(elapsed*2)*.055;this.animateLittleLife(dt,elapsed);
    if(this.waterBurst){this.waterBurst.life-=dt;for(let i=0;i<this.waterBurst.points.length;i++){const p=this.waterBurst.points[i];p.position.y-=dt*.65;p.material.opacity=Math.max(0,this.waterBurst.life/2)}if(this.waterBurst.life<0){this.clearWater()}}
    if(this.rain.visible||this.snow.visible){for(let i=0;i<this.weatherCount;i++){const n=i*3;this.weatherPositions[n+1]-=dt*this.weatherVel[i]*(this.rain.visible?7:.65);this.weatherPositions[n]+=dt*(this.rain.visible?-.6:Math.sin(elapsed*.8+i)*.2);if(this.weatherPositions[n+1]<-.35)this.weatherPositions[n+1]=10;const ra=this.rain.geometry.attributes.position.array;ra[i*6]=this.weatherPositions[n];ra[i*6+1]=this.weatherPositions[n+1];ra[i*6+2]=this.weatherPositions[n+2];ra[i*6+3]=this.weatherPositions[n]+.035;ra[i*6+4]=this.weatherPositions[n+1]+.32;ra[i*6+5]=this.weatherPositions[n+2]}this.snow.geometry.attributes.position.needsUpdate=true;this.rain.geometry.attributes.position.needsUpdate=true}
    if(this.marker.visible){this.markerLife-=dt*.8;this.marker.material.opacity=Math.max(0,this.markerLife);this.marker.scale.setScalar(1+(1-this.markerLife)*.7);if(this.markerLife<=0)this.marker.visible=false}
    this.controls.update();const cameraDistance=this.camera.position.distanceTo(this.controls.target);this.scene.fog.near=cameraDistance+22;this.scene.fog.far=cameraDistance+95;this.oceanMaterial.uniforms.uFocus.value.copy(this.controls.target);this.oceanMaterial.uniforms.uForward.value.subVectors(this.controls.target,this.camera.position).setY(0).normalize();if(this.panorama)this.panorama.update(this.camera,this.controls.target,this.width/this.height,this.skyTint,dt,elapsed);this.render();
  }
  waterPlant(item){if(this.waterBurst)this.clearWater();const g=group(this.scene,item.x,0,item.z),points=[];for(let i=0;i<18;i++){const p=ellipsoid(g,(Math.random()-.5)*.6,1.6+Math.random()*.8,(Math.random()-.5)*.6,.025,.05,.025,new T.MeshBasicMaterial({color:"#8bd5ef",transparent:true,opacity:.85}));p.castShadow=false;points.push(p)}this.waterBurst={group:g,points,life:2.2}}
  clearWater(){const burst=this.waterBurst;if(!burst)return;this.scene.remove(burst.group);for(const p of burst.points){p.geometry.dispose();p.material.dispose()}this.waterBurst=null}
  refreshStars(observer){this.celestial?.refresh(this.state,observer)}
  render(){this.renderer.setClearColor(this.backgroundColor);this.renderer.clear();if(this.panorama){this.renderer.render(this.panorama.scene,this.panorama.camera);this.renderer.clearDepth()}this.celestial?.render(this.renderer,this.camera,this.width/this.height);this.renderer.clearDepth();this.renderer.render(this.scene,this.camera)}
  capture(){this.render();return this.canvas.toDataURL('image/png')}
}
