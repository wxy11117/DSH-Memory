import * as T from 'three';
import {canvasTexture} from './objects.js';
import {computeSky,loadCatalog,readObserver,roomDate,starColor} from './astronomy-data.js';

export function createCelestialBackdrop(){
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(Math.atan(.64)*360/Math.PI,1,.1,100),geometry=new T.BufferGeometry();
  const map=canvasTexture((c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'#fff');g.addColorStop(.3,'#fff');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,w,h)},32);
  const points=new T.Points(geometry,new T.PointsMaterial({map,vertexColors:true,size:3,sizeAttenuation:false,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,opacity:.8}));points.frustumCulled=false;scene.add(points);let catalog,observer=readObserver(),key='',lastSky=null;
  function refresh(state,location){if(location)observer=location;if(!catalog)return;const date=roomDate(state),next=date.toISOString().slice(0,16)+':'+observer.latitude+':'+observer.longitude;if(next!==key){key=next;lastSky=computeSky(catalog,date,observer);const positions=[],colors=[];for(const s of lastSky.stars){if(s.alt<=0)continue;positions.push(s.vector[0]*50,s.vector[1]*50,-s.vector[2]*50);const color=new T.Color(starColor(s.bv)).multiplyScalar(Math.max(.14,1-s.mag*.13));colors.push(color.r,color.g,color.b)}geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeBoundingSphere()}
    points.visible=state.time==='night'&&lastSky.sun.altitude< -6;points.material.opacity=state.weather==='sunny'?.8:state.weather==='cloudy'?.22:.08;
  }
  return{points,ready:loadCatalog().then(c=>catalog=c).catch(error=>{console.warn('Star catalog unavailable:',error.message)}),refresh,get sky(){return lastSky},render(renderer,mainCamera,aspect){if(!points.visible)return;camera.aspect=aspect;camera.quaternion.copy(mainCamera.quaternion);camera.updateProjectionMatrix();renderer.render(scene,camera)}};
}
