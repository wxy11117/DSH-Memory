/** Installer -> official profile loader -> official boot and startup audit.
 * No real Desktop profile, chat or model is used. All data stays in this fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createPackageFixture} from './helpers/package-fixture.mjs';
const host=process.env.DSH_HOST_MODULES;if(!host)throw new Error('DSH_HOST_MODULES is required; startup verification must not silently skip');
const load=name=>import(pathToFileURL(path.join(host,name,'lib/index.js')));
const {boot,loadProfileDirectory,loadOverlayPatches,composeEntries,auditStartupEntries}=await load('dsh-app-boot');
const {default:Prompt}=await load('dsh-system-prompt'),{default:Tools}=await load('dsh-tools');
const fixture=createPackageFixture('hp-boot-'),profile=path.join(fixture.root,'profiles','web'),data=path.join(fixture.root,'memory');
const previousHome=process.env.DSH_HOME;process.env.DSH_HOME=fixture.root;
fs.mkdirSync(profile,{recursive:true});
const pkgFile=path.join(profile,'package.json');
fs.writeFileSync(pkgFile,JSON.stringify({name:'hp-isolated-trial',version:'1.0.0',private:true,dsh:{profile:{bundles:[]}}},null,2)+'\n');
const patchFile=path.join(profile,'cordis.patch.yml');
const template='# Your patch layer for this dsh profile\r\n# a top-level YAML array of loader patch entries\r\n[]\r\n';
fs.writeFileSync(patchFile,template);
const config=path.join(profile,'cordis.yml');fs.writeFileSync(config,'[]\n');
const installer=args=>{
  const r=spawnSync(process.execPath,[path.join(fixture.packageDir,'tools/install.mjs'),'--profile',profile,'--json',...args],{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,DSH_HOME:fixture.root}});
  assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);
};
let ctx;
try{
  installer(['--dry']);assert.equal(fs.existsSync(path.join(profile,'node_modules','dsh-hippocampus')),false);
  assert.equal(installer([]).ok,true);
  assert.equal(fs.readFileSync(patchFile,'utf8'),template,'installation must preserve the official empty template');
  assert.deepEqual(loadOverlayPatches('hp-trial',patchFile),[],'official loader agrees that [] means no overrides');
  const oldFile=path.join(fixture.root,'legacy-snapshot.json');
  const seed={id:'migrated-seed',text:'旧库中的隔离试验记忆。',category:'self',tier:'permanent',salience:90,stabilityHours:20000,pinned:true,createdAt:Date.now()};
  const oldBytes=Buffer.from(JSON.stringify({version:1,conversations:{legacy:{brain:{items:[seed],archive:[],tombstones:{removed:42}}}}}));fs.writeFileSync(oldFile,oldBytes);
  const migration=spawnSync(process.execPath,[path.join(fixture.packageDir,'tools/migrate.mjs'),'--from',oldFile,'--to',data,'--to-space','实验空间','--json'],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(migration.status,0,migration.stdout+migration.stderr);
  assert.deepEqual(fs.readFileSync(oldFile),oldBytes);
  fs.writeFileSync(patchFile,'- id: hippocampus\n  config:\n    homeDir: '+JSON.stringify(data)+'\n    verbose: false\n');
  assert.equal(installer(['--dry']).ok,true,'preflight accepts migrated registry without inventing session bindings');
  const loaded=loadProfileDirectory('hp-trial',profile,pkgFile,{userLayer:true});
  const layers=[...loaded.layers.map(l=>l.patches),loadOverlayPatches('hp-trial',path.join(profile,'cordis.patch.yml'))];
  const patches=layers.flat(),entries=composeEntries(layers);
  assert.equal(entries.filter(x=>x.name==='dsh-hippocampus').length,1);
  assert.equal(entries.find(x=>x.name==='dsh-hippocampus').config.homeDir,data,'verify the exact isolated data path before boot');
  async function start(){
    return boot('hp-local-trial',config,patches,async context=>{
      await context.plugin(Prompt,{includeHarnessIdentity:false,includeRuntimeContext:false});
      await context.plugin(Tools,{mode:'native'});
    },pathToFileURL(pkgFile).href);
  }
  ctx=await start();await auditStartupEntries(ctx,'hp-local-trial');
  const defs=ctx.get('tools').view().visible;
  assert.equal([...defs.keys()].filter(x=>x.startsWith('hp_')).length,22);
  const call=(name,args={})=>defs.get(name).execute(args,{agent:{id:'local-trial-fish'}});
  assert.equal((await call('hp_list')).code,'SPACE_UNBOUND');
  const setup=await call('hp_space'),u=new URL(setup.setupUrl);
  const bound=await fetch(u.origin+'/api/bind',{method:'POST',headers:{'content-type':'application/json','x-room-access':new URLSearchParams(u.hash.slice(1)).get('access')},body:JSON.stringify({space:'实验空间',confirm:true})});assert.equal(bound.status,200);
  assert.equal((await call('hp_get',{id:seed.id})).ok,true,'migrated memory is readable after explicit binding');
  assert.equal((await call('hp_remember',{text:'隔离试运行：喜欢清晨的海风。',category:'self',source:'test'})).ok,true);
  const dashboard=await call('hp_dashboard');assert.equal(dashboard.ok,true);
  assert.equal((await fetch(new URL(dashboard.url).origin)).status,200);
  await ctx.fiber.dispose();ctx=null;
  await assert.rejects(fetch(new URL(dashboard.url).origin));
  assert.ok(fs.existsSync(path.join(data,'brain.json')));
  ctx=await start();await auditStartupEntries(ctx,'hp-local-trial');
  assert.equal((await ctx.get('tools').view().visible.get('hp_list').execute({},{agent:{id:'local-trial-fish'}})).total,2);
  await ctx.fiber.dispose();ctx=null;
  // A damaged optional room save must not prevent memory/startup activation.
  fs.writeFileSync(path.join(data,'rooms.json'),'{broken fixture');
  ctx=await start();await auditStartupEntries(ctx,'hp-local-trial');
  const after=ctx.get('tools').view().visible;
  assert.equal((await after.get('hp_list').execute({},{agent:{id:'local-trial-fish'}})).total,2);
  assert.equal((await after.get('hp_room').execute({},{agent:{id:'local-trial-fish'}})).ok,false);
  await ctx.fiber.dispose();ctx=null;
  assert.equal(installer(['--uninstall']).ok,true);
  assert.equal(fs.existsSync(path.join(profile,'node_modules','dsh-hippocampus')),false);
  assert.ok(fs.existsSync(path.join(data,'brain.json')));
  assert.ok(fs.existsSync(path.join(fixture.packageDir,'lib/index.js')));
  console.log('PASS: official empty template install, legacy migration, official boot/startup audit, 22 tools, binding, memory write, panel, clean shutdown, restart restore, room-fault isolation and uninstall. No model calls.');
}finally{if(ctx)await ctx.fiber.dispose();fixture.close();if(previousHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;}
