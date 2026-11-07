import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {apply} from '../../lib/index.js';

export function mount(options={}){
  const home=options.homeDir||fs.mkdtempSync(path.join(os.tmpdir(),'hp-room-'));
  const tools=new Map(),sections=[],disposers=[];
  const ctx={tools:{register(t){tools.set(t.name,t);return()=>tools.delete(t.name)}},
    inject(deps,fn){fn({systemPrompt:{section(s){sections.push(s);return()=>{}}}})},
    on(){return()=>{}},effect(fn){const close=fn();disposers.push(close);return close}};
  apply(ctx,{homeDir:home,verbose:false,...options});
  return{home,tools,sections,call:(id,name,args={})=>tools.get(name).execute(args,{agent:{id}}),
    render:id=>sections[0].text(id?{agent:{id}}:{}),close:()=>Promise.all(disposers.map(d=>d?.()))};
}
export async function api(link,route,body,extra={}){
  const url=new URL(link);const headers={'x-room-access':new URLSearchParams(url.hash.slice(1)).get('access'),'Content-Type':'application/json',...extra};
  const response=await fetch(url.origin+route,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  return{status:response.status,data:await response.json()};
}
export async function bind(host,id,space){const setup=await host.call(id,'hp_space');if(!setup.ok)throw new Error(setup.error);const result=await api(setup.setupUrl,'/api/bind',{space,confirm:true});if(result.status!==200)throw new Error(result.data.error);return result.data.url}
