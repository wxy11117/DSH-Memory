/** Real DSH tool execution pipeline + real Cordis, with synthetic Agent identities. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as plugin from '../lib/index.js';
const host=process.env.DSH_HOST_MODULES;if(!host)throw new Error('Set DSH_HOST_MODULES to an isolated official DSH runtime');
const load=name=>import(pathToFileURL(path.join(host,name,'lib/index.js')));
const {Context}=await load('cordis'),{default:Prompt}=await load('dsh-system-prompt'),{default:Tools}=await load('dsh-tools');
const {assembleContextFor,default:AgentRegistry,emitAgentEvent}=await load('dsh-agent');
const ctx=new Context(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp-room-cordis-'));
const prompt=await ctx.plugin(Prompt,{includeHarnessIdentity:false,includeRuntimeContext:false});
const runtime=await ctx.plugin(Tools,{mode:'native'});let memory;
const agents=await ctx.plugin(AgentRegistry);const detach=[];
try{
  memory=await ctx.plugin(plugin,{homeDir:dir,verbose:false});
  for(let i=0;i<3;i++){const fibers=[];ctx.registry.forEach(r=>fibers.push(...r.fibers));await Promise.all(fibers.map(f=>f.await()))}
  const messages=[];
  const agent=id=>({id,session:{id},ctx,status:'idle',followup(message){messages.push({id,message})}});
  const a=agent('fish-a'),b=agent('fish-b');let count=0;
  detach.push(ctx.get('agents').enter(a),ctx.get('agents').enter(b));
  const call=async(agent,name,args={})=>{const r=await ctx.get('tools').execute({callId:'check-'+(++count),agent,name,arguments:args,signal:new AbortController().signal});assert.equal(r.isError,false,JSON.stringify(r));return r.value};
  assert.equal((await call(a,'hp_list')).code,'SPACE_UNBOUND');
  const firstUse = await ctx.get('systemPrompt').assemble(assembleContextFor(a));
  assert.match(firstUse.sections.map(s=>s.text).join('\n'), /首次使用[\s\S]*hp_space/);
  let origin;
  for(const [fish,space]of [[a,'记忆空间1'],[b,'记忆空间2']]){
    const setup=await call(fish,'hp_space'),u=new URL(setup.setupUrl);origin=u.origin;
    const response=await fetch(origin+'/api/bind',{method:'POST',headers:{'content-type':'application/json','x-room-access':new URLSearchParams(u.hash.slice(1)).get('access')},body:JSON.stringify({space,confirm:true})});assert.equal(response.status,200);
  }
  await call(a,'hp_remember',{text:'我是一号鱼，我喜欢清晨海风。',category:'self'});
  await call(b,'hp_remember',{text:'我是二号鱼，我喜欢午夜星光。',category:'self'});
  const first=await ctx.get('systemPrompt').assemble(assembleContextFor(a)),second=await ctx.get('systemPrompt').assemble(assembleContextFor(b));
  const text=x=>x.sections.filter(s=>s.name==='hippocampus:memory').map(s=>s.text).join('\n');
  assert.match(text(first),/清晨海风/);assert.doesNotMatch(text(first),/午夜星光/);
  assert.doesNotMatch(text(first), /首次使用/);
  assert.match(text(second),/午夜星光/);assert.doesNotMatch(text(second),/清晨海风/);
  assert.equal((await call(a,'hp_room_action',{action:'light',on:true})).code,'ROOM_CLOSED');
  const link=await call(a,'hp_room'),ru=new URL(link.url),rh={'Content-Type':'application/json','x-room-access':new URLSearchParams(ru.hash.slice(1)).get('access')};
  const request=async(route,body)=>{const r=await fetch(ru.origin+'/api/room/'+route,{headers:rh,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200,await r.clone().text());return r.json()};
  assert.equal((await request('settings')).available,true,'declared optional agents service is connected');
  const client=await request('connect',{});
  await request('heartbeat',{clientId:client.id,runtime:{visible:true}});
  await request('life',{enabled:true,confirmCosts:true,intervalMinutes:15,dailyLimit:1});
  const deadline=Date.now()+19000;while(!messages.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
  assert.equal(messages.length,1,'actual timer dispatches one followup through the real registry, without calling any model');
  assert.equal(messages[0].id,a.id);const message=messages[0].message;assert.ok(message.id);
  emitAgentEvent(ctx,a,'agent/inbox/claimed',{message});
  assert.equal((await call(a,'hp_room_action',{vector:[1,6,1]})).ok,false,'claimed autonomous turn requires its run ID');
  const planned=await call(a,'hp_room_action',{vector:[1,6,1],runId:message.source.runId});assert.equal(planned.ok,true);
  assert.equal((await call(a,'hp_room_action',{vector:[1,6,2],runId:message.source.runId})).ok,false,'second action is refused');
  const claimed=await request('claim',{clientId:client.id});
  await request('result',{clientId:client.id,id:claimed.command.id,status:'completed',runtime:{visible:true},detail:'synthetic browser acknowledgment'});
  await request('life',{enabled:false});
  assert.equal((await call(a,'hp_room_life')).life.attempts,1);
  emitAgentEvent(ctx,a,'agent/inbox/claimed',{message:{id:'next-human-message',role:'user',content:[{type:'text',text:'查看记忆'}]}});
  assert.equal((await call(a,'hp_list')).total,1);
  console.log('PASS: real optional agents injection, official message factory, timer followup, claimed event and one-action permission; no model requests.');
  await memory.dispose();memory=null;await assert.rejects(fetch(origin+'/room/'));
  assert.equal(fs.existsSync(path.join(dir,'room-preview.lock')),false);
  memory=await ctx.plugin(plugin,{homeDir:dir,verbose:false,injectMode:'tool'});
  for(let i=0;i<3;i++){const fibers=[];ctx.registry.forEach(r=>fibers.push(...r.fibers));await Promise.all(fibers.map(f=>f.await()))}
  const toolBound=await ctx.get('systemPrompt').assemble(assembleContextFor(a));
  assert.equal(toolBound.sections.filter(s=>s.name.startsWith('hippocampus:')).map(s=>s.text).join(''),'');
  const toolNew=await ctx.get('systemPrompt').assemble(assembleContextFor(agent('new-fish')));
  assert.match(toolNew.sections.map(s=>s.text).join('\n'),/首次使用[\s\S]*hp_space/);
  assert.equal((await call(a,'hp_list')).total,1);
  console.log('PASS: official first-use prompt reaches unbound Agent and disappears after binding; tools.execute preserves identity; prompts isolate spaces; room closed feedback and disposal pass.');
}finally{for(const stop of detach)stop();if(memory)await memory.dispose();await agents.dispose();await runtime.dispose();await prompt.dispose()}
