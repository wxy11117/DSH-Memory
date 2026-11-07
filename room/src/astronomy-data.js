import {roomStorage} from './persistence.js';
import * as A from '../vendor/astronomy.js';

export const DEFAULT_OBSERVER={latitude:36.07,longitude:120.38,height:8};
export const OBSERVER_KEY='dayu.observatory.v1';
const RAD=Math.PI/180;
const NAMES={Sirius:'天狼星',Canopus:'老人星',Arcturus:'大角星',Vega:'织女星',Capella:'五车二',Rigel:'参宿七',Procyon:'南河三',Betelgeuse:'参宿四',Altair:'牛郎星',Aldebaran:'毕宿五',Antares:'心宿二',Spica:'角宿一',Pollux:'北河三',Fomalhaut:'北落师门',Deneb:'天津四',Regulus:'轩辕十四',Polaris:'北极星',Alpheratz:'壁宿二',Mirach:'奎宿九',Almach:'天大将军一',Dubhe:'天枢',Merak:'天璇',Phecda:'天玑',Megrez:'天权',Alioth:'玉衡',Mizar:'开阳',Alkaid:'摇光'};
export const starName=row=>NAMES[row[2]]||row[2];
export function validObserver(value){return !!value&&Number.isFinite(value.latitude)&&Math.abs(value.latitude)<=90&&Number.isFinite(value.longitude)&&Math.abs(value.longitude)<=180}
export function readObserver(){try{const v=JSON.parse(roomStorage.getItem(OBSERVER_KEY));if(validObserver(v))return{latitude:v.latitude,longitude:v.longitude,height:8}}catch{}return{...DEFAULT_OBSERVER}}
export function beijingInput(date=new Date()){return new Date(date.getTime()+8*3600000).toISOString().slice(0,16)}
export function parseBeijing(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('请填写完整日期与时间');const d=new Date(value+':00+08:00');if(!Number.isFinite(+d)||beijingInput(d)!==value||Number(value.slice(0,4))<2000||Number(value.slice(0,4))>2100)throw new Error('请选择 2000—2100 年内的有效时间');return d}
export function roomDate(state,now=new Date()){if(state.realTime)return now;const times={morning:'07:30',afternoon:'14:20',sunset:'18:10',night:'22:00'};return parseBeijing(beijingInput(now).slice(0,10)+'T'+times[state.time])}
let catalogPromise;
export function loadCatalog(){return catalogPromise??=fetch(new URL('../data/stars-hyg-v41.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('恒星星表加载失败');return r.json()}).then(c=>{if(!c.stars?.length)throw new Error('恒星星表为空');return c})}
export function starVector(row,date){const time=A.MakeTime(date),years=time.ut/365.25;const p=[row[6]+row[9]*years,row[7]+row[10]*years,row[8]+row[11]*years];const norm=Math.hypot(...p);return new A.Vector(p[0]/norm,p[1]/norm,p[2]/norm,time)}
export function horizontalVector(azimuth,altitude){const a=azimuth*RAD,h=altitude*RAD,c=Math.cos(h);return[Math.sin(a)*c,Math.sin(h),Math.cos(a)*c]}
export function computeSky(catalog,date,location=DEFAULT_OBSERVER,refraction='normal'){
  if(!validObserver(location)||!Number.isFinite(+date))throw new Error('无效的观测地点或时间');
  const observer=new A.Observer(location.latitude,location.longitude,location.height||0),rotation=A.Rotation_EQJ_HOR(date,observer);
  const stars=catalog.stars.map(row=>{const h=A.HorizonFromVector(A.RotateVector(rotation,starVector(row,date)),refraction);return{id:row[0],hip:row[1],name:starName(row),catalogName:row[2],mag:row[3],bv:row[4],con:row[5],az:h.lon,alt:h.lat,vector:horizontalVector(h.lon,h.lat)}});
  const solar=body=>{const e=A.Equator(body,date,observer,true,true);return A.Horizon(date,observer,e.ra,e.dec,refraction)};
  return{date,observer:location,stars,sun:solar('Sun'),moon:solar('Moon'),moonPhase:A.MoonPhase(date)};
}
export function projectSky(vector,az,alt,fov,width,height){
  const a=az*RAD,h=alt*RAD,forward=horizontalVector(az,alt),right=[Math.cos(a),0,-Math.sin(a)],up=[-Math.sin(a)*Math.sin(h),Math.cos(h),-Math.cos(a)*Math.sin(h)];
  const dot=b=>vector[0]*b[0]+vector[1]*b[1]+vector[2]*b[2],z=dot(forward);if(z<=0)return null;
  const scale=height/(2*Math.tan(fov*RAD/2));return{x:width/2+dot(right)*scale/z,y:height/2-dot(up)*scale/z};
}
export function starColor(bv){if(bv===null)return '#eef1ff';return bv<-.05?'#b7d8ff':bv<.35?'#deebff':bv<.75?'#fff2d8':bv<1.2?'#ffd7aa':'#ffba8e'}
