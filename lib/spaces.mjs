import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore,atomicWriteJson} from './store.js';
const pools=globalThis[Symbol.for('dsh.hippocampus.room.stores.v1')]??=new Map();
export function spaceKey(value){
  if(typeof value!=='string'||value!==value.trim()||!value||value.length>40||/[\x00-\x1f\\/:]/.test(value)||['__proto__','constructor','prototype'].includes(value))throw new Error('空间名须为 1–40 字，不能含路径或控制字符');
  return value;
}
export function sessionId(context){
  const agent=context?.agent;
  const ids=[agent?.id,agent?.session?.id,agent?.session?.header?.id].filter(v=>typeof v==='string'&&v);
  if(!ids.length||ids.some(id=>id!==ids[0])||ids[0].length>240)throw Object.assign(new Error('当前调用缺少可信会话身份；请在 DSH 会话中调用 hp_room'),{code:'SESSION_REQUIRED'});
  return ids[0];
}
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw new Error(`存档暂不可读，保留原文件：${path.basename(file)}`)}}
export function acquireSpaceHub(dir,log=()=>{}){
  const key=process.platform==='win32'?path.resolve(dir).toLowerCase():path.resolve(dir);
  if(pools.has(key)){const hub=pools.get(key);hub.refs++;return hub}
  fs.mkdirSync(dir,{recursive:true});
  const lock=path.join(dir,'room-preview.lock'),nonce=randomUUID();
  const lockValue={pid:process.pid,nonce};
  function claim(){fs.writeFileSync(lock,JSON.stringify(lockValue),{flag:'wx'})}
  try{claim()}catch(e){
    if(e.code!=='EEXIST')throw e;
    const old=read(lock,{});let alive=true;
    if(!Number.isInteger(old.pid)||old.pid<=0)throw new Error('存储锁无效，请先检查 room-preview.lock');
    try{process.kill(old.pid,0)}catch(error){if(error.code==='ESRCH')alive=false;else throw error}
    if(alive)throw new Error('同一数据目录已有插件进程使用，请为另一实例选择独立目录');
    fs.unlinkSync(lock);claim();
  }
  const unlock=()=>{try{if(read(lock,{}).nonce===nonce)fs.unlinkSync(lock)}catch{}};
  try{
    const store=createStore({dir,log,strict:true});store.load();
    const file=path.join(dir,'spaces.json');
    let registry=read(file,{version:1,bindings:{},spaces:{}});
    if(registry.version!==1||!registry.bindings||!registry.spaces)throw new Error('空间绑定文件格式无效');
    for(const s of Object.keys(registry.spaces))spaceKey(s);
    for(const s of Object.values(registry.bindings))spaceKey(s);
    const hub={refs:1,store,dir,
      resolve(id){return Object.hasOwn(registry.bindings,id)?registry.bindings[id]:null},
      list(){return [...new Set([...Object.keys(registry.spaces),...Object.keys(store.doc.conversations)])].filter(s=>{try{spaceKey(s);return true}catch{return false}})},
      bind(id,space,expected){space=spaceKey(space);const current=hub.resolve(id);if(current!==expected)throw new Error('会话绑定已变化，请重新获取设置链接');
        const next=structuredClone(registry);Object.defineProperty(next.bindings,id,{value:space,enumerable:true,configurable:true,writable:true});Object.defineProperty(next.spaces,space,{value:{createdAt:next.spaces[space]?.createdAt||Date.now()},enumerable:true,configurable:true,writable:true});atomicWriteJson(file,next);registry=next;return space},
      release(){if(--hub.refs>0)return;store.flush();store.close();unlock();process.off('exit',unlock);pools.delete(key)},
    };
    process.once('exit',unlock);pools.set(key,hub);return hub;
  }catch(error){unlock();throw error}
}
