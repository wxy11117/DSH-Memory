import * as T from 'three';
import {group,box,ellipsoid,cylinder,rod,mesh,mat,canvasTexture} from './objects.js';

// One open coastline. Land continues inland beyond every camera view; sea is z < shoreline(x).
export function shoreline(x){return -6.7+x*.14+2.8*Math.tanh((x-8)/4.5)}
export function groundHeight(x,z){
  const d=z-shoreline(x);
  if(d<0)return -.37+Math.max(-1,d)*.2;
  return -.37+Math.min(1,d/3.4)*.20;
}
function coastMaterial(){const texture=canvasTexture((c,w,h)=>{c.fillStyle='#ffffff';c.fillRect(0,0,w,h);let seed=371;for(let i=0;i<6500;i++){seed=seed*16807%2147483647;const x=seed%w;seed=seed*16807%2147483647;const y=seed%h;c.fillStyle=i%3?'#a59e8220':'#ffffff44';c.fillRect(x,y,1,1)}},256);texture.wrapS=texture.wrapT=T.RepeatWrapping;return mat('#ffffff',{map:texture,vertexColors:true,roughness:1})}

export function makeCoast(parent){
  const coast=group(parent);coast.name='continuous-mainland';
  const positions=[],colors=[],uvs=[],indices=[],bands=[-1,0,.65,1.6,2.8,3.5,4.4,5.4,7,10,16,28,50,88,140,360,900],xs=[-400,-200,-120,...Array.from({length:181},(_,i)=>i-90),120,200,400],nx=xs.length-1;
  const wet=new T.Color('#c4b79b'),sand=new T.Color('#efdfbb'),dune=new T.Color('#dfd9b6'),grass=new T.Color('#b5c5a3');
  for(let i=0;i<=nx;i++){const x=xs[i];for(let j=0;j<bands.length;j++){const d=bands[j],z=shoreline(x)+d;positions.push(x,groundHeight(x,z),z);uvs.push(x/5,z/5);const color=wet.clone().lerp(sand,T.MathUtils.smoothstep(d,0,1.8));color.lerp(dune,T.MathUtils.smoothstep(d,2.9,4.1));color.lerp(grass,T.MathUtils.smoothstep(d,3.6+Math.sin(x*.7)*.18,5.6));color.multiplyScalar(.985+Math.sin(x*.67+z*.31)*.018);colors.push(color.r,color.g,color.b)}}
  const row=bands.length;for(let i=0;i<nx;i++)for(let j=0;j<row-1;j++){const a=i*row+j,b=a+1,c=a+row,d=c+1;indices.push(a,b,c,b,d,c)}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const terrain=mesh(coast,geometry,coastMaterial());terrain.castShadow=false;terrain.name='mainland-terrain';
  // A path into the mainland visually anchors the cottage to a larger neighbourhood.
  const pathPoints=[];for(let i=0;i<=48;i++){const z=5.7+i*.65,x=3.45+Math.sin((z-5.7)*.11)*2.2;pathPoints.push([x,z])}
  const pathPositions=[],pathIndices=[];pathPoints.forEach(([x,z],i)=>{for(const side of[-1,1])pathPositions.push(x+side*.74,groundHeight(x,z)+.016,z);if(i){const n=i*2;pathIndices.push(n-2,n-1,n,n-1,n+1,n)}});
  const pathGeometry=new T.BufferGeometry();pathGeometry.setAttribute('position',new T.Float32BufferAttribute(pathPositions,3));pathGeometry.setIndex(pathIndices);pathGeometry.computeVertexNormals();const path=mesh(coast,pathGeometry,mat('#d9cbb0',{side:T.DoubleSide,roughness:1}));path.castShadow=false;path.name='inland-path';
  // Planks lead from the balcony's outer edge down onto the dry sand.
  const boardwalk=group(coast);boardwalk.name='beach-boardwalk';for(let i=0;i<11;i++){const x=7.65+i*.25,z=-.65-i*.19,y=groundHeight(x,z)+.11;const plank=box(boardwalk,.32,.07,1.15,x,y,z,i%3?'#cdb995':'#dcc8a5',.012);plank.rotation.y=.67}
  for(const x of[8.3,9.7]){const z=-.65-(x-7.65)*.76,y=groundHeight(x,z);rod(boardwalk,[x,y,z+.6],[x,y+.5,z+.6],.028,'#a99473')}
  // Beach furniture stays on dry sand rather than in the surf.
  const umbrella=group(coast,11.6,groundHeight(11.6,.9),.9);rod(umbrella,[0,0,0],[0,1.75,0],.026,'#bda37d');
  const sectors=12;for(let i=0;i<sectors;i++){const a=i*Math.PI*2/sectors,b=(i+1)*Math.PI*2/sectors;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,1.94,0,Math.cos(a)*1.08,1.55,Math.sin(a)*1.08,Math.cos(b)*1.08,1.55,Math.sin(b)*1.08],3));g.computeVertexNormals();mesh(umbrella,g,mat(i%2?'#f4e9cf':'#a6c7cf',{side:T.DoubleSide}));rod(umbrella,[0,1.93,0],[Math.cos(a)*1.08,1.55,Math.sin(a)*1.08],.009,'#d3bd99')}
  const towel=box(coast,1.35,.025,.78,11.35,groundHeight(11.35,2.1)+.025,2.1,'#a9c4d1',.025);towel.rotation.y=.3;
  // Restrained dune grass, shells, and a few worn stones along the long shore.
  for(let i=0;i<48;i++){const x=-22+i*.9,d=3.7+(i%4)*.35,z=shoreline(x)+d;if(x>-6&&x<8&&z>-4.7)continue;const y=groundHeight(x,z);for(let k=0;k<4;k++){const a=k*2.4+i;rod(coast,[x,y,z],[x+Math.sin(a)*.12,y+.20+(k%2)*.09,z+Math.cos(a)*.12],.009,i%3?'#99ab83':'#b5b58e')}}
  for(let i=0;i<28;i++){const x=-20+i*1.27,d=.9+(i%5)*.37,z=shoreline(x)+d,y=groundHeight(x,z);const shell=ellipsoid(coast,x,y+.028,z,.055+(i%3)*.018,.025,.06,i%2?'#fff0d9':'#cebaa4');shell.rotation.y=i*1.7}
  for(const[x,z]of[[-10,shoreline(-10)+2.5],[-11.2,shoreline(-11.2)+2],[14,shoreline(14)+2.7]]){const y=groundHeight(x,z);ellipsoid(coast,x,y+.16,z,.55,.25,.36,'#b8b9aa');ellipsoid(coast,x+.45,y+.09,z+.2,.3,.16,.26,'#d4ceba')}
  return{group:coast,terrain,boardwalk,path};
}
