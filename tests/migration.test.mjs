import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readSource,planMigration,migrateSnapshot} from '../tools/memory-migration.mjs';
import {installConflicts} from '../tools/install-preflight.mjs';
import {mount,bind} from './helpers/room-host.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hp-migrate-test-'));
  t.after(()=>{
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
    assert.ok(path.basename(root).startsWith('hp-migrate-test-'));
    fs.rmSync(root,{recursive:true,force:true}); // This fixture creates only regular files/directories, never links.
  });
  return {root,source:path.join(root,'source.json'),target:path.join(root,'new-memory')};
}
const item=(id,text)=>({id,text,category:'self',tier:'permanent',pinned:true,stabilityHours:20000,salience:90,createdAt:Date.now(),updatedAt:Date.now()});
function brain(id='a',text='甲鱼喜欢青柠'){return {
  items:[{...item(id,text),revisions:2,oldText:'更早的内容'}],
  archive:[{...item(id+'-archive','封存的测试记录'),sealed:true,archivedAt:Date.now()}],
  recall:{date:'test',ids:[id]},persons:{tester:{name:'测试人物'}},
  web:{words:{青柠:{w:2}},edges:{'青柠|海风':{w:1}}},tombstones:{removed:42},
  semantic:[{id:'gist',text:'测试归纳'}],futureField:{kept:true},
}}
const write=(file,doc)=>fs.writeFileSync(file,JSON.stringify(doc,null,2));
function cli(args,env={}){
  const result=spawnSync(process.execPath,[path.join(ROOT,'tools/migrate.mjs'),...args,'--json'],{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,...env}});
  if(result.error)throw result.error;
  return {code:result.status,data:JSON.parse(result.stdout),err:result.stderr};
}

for(const wrapped of [true,false])test('migration preserves '+(wrapped?'plugin wrapper':'bridge sidecar')+' and backs up exact source bytes',t=>{
  const f=fixture(t),b=brain();
  const old={version:1,updatedAt:123,conversations:{legacy:wrapped?{brain:b,metadata:'keep'}:b}};
  fs.writeFileSync(f.source,'\uFEFF'+JSON.stringify(old,null,2));
  const before=fs.readFileSync(f.source),mtime=fs.statSync(f.source).mtimeMs;
  const result=cli(['--from',f.source,'--to',f.target,'--to-space','记忆空间1']);assert.equal(result.code,0,result.data.error);
  const after=JSON.parse(fs.readFileSync(path.join(f.target,'brain.json')));
  assert.deepEqual(after.conversations['记忆空间1'].brain,b);
  if(wrapped)assert.equal(after.conversations['记忆空间1'].metadata,'keep');
  assert.deepEqual(Object.keys(after.conversations),['记忆空间1']);
  assert.deepEqual(fs.readFileSync(f.source),before);assert.equal(fs.statSync(f.source).mtimeMs,mtime);
  assert.deepEqual(fs.readFileSync(result.data.backup),before);
  const registry=JSON.parse(fs.readFileSync(result.data.spacesFile));assert.deepEqual(registry.bindings,{});assert.deepEqual(Object.keys(registry.spaces),['记忆空间1']);
  assert.equal(result.data.copiedItems,1);assert.equal(result.data.copiedArchive,1);assert.equal(result.data.skippedItems,0);
  assert.equal(result.data.sessionBindingsCreated,0);
});

test('list and dry run never create output, backup or inferred home',t=>{
  const f=fixture(t);write(f.source,{version:1,conversations:{legacy:{brain:brain()}}});
  const inferred=path.join(f.root,'inferred'),env={DSH_HOME:inferred,HP_HOME:inferred};
  assert.equal(cli(['--from',f.source,'--list'],env).code,0);
  const out=path.join(f.root,'absent-parent','memory');
  const dry=cli(['--from',f.source,'--to',out,'--to-space','记忆空间1','--dry'],env);
  assert.equal(dry.code,0,dry.data.error);assert.equal(dry.data.dry,true);
  assert.deepEqual(fs.readdirSync(f.root),['source.json']);
  assert.equal(cli(['--from',f.source,'--to-space','记忆空间1'],env).code,1);
  assert.equal(fs.existsSync(inferred),false);
});

test('explicit multiple-space mapping remains isolated after binding, prompting, dashboard and restart',async t=>{
  const f=fixture(t);write(f.source,{version:1,conversations:{oldA:{brain:brain('a','甲鱼喜欢青柠')},oldB:brain('b','乙鱼喜欢紫罗兰'),unselected:brain('c','未选择的旧空间')}});
  const sourceBytes=fs.readFileSync(f.source),mapFile=path.join(f.root,'map.json');
  write(mapFile,[{from:'oldA',to:'记忆空间1'},{from:'oldB',to:'记忆空间2'}]);
  const migrated=cli(['--from',f.source,'--map',mapFile,'--to',f.target]);assert.equal(migrated.code,0,migrated.data.error);
  assert.deepEqual(migrated.data.unselectedSpaces,['unselected']);
  assert.deepEqual(fs.readFileSync(migrated.data.backup),sourceBytes);
  const profile=path.join(f.root,'profile');fs.mkdirSync(profile);
  fs.writeFileSync(path.join(profile,'cordis.patch.yml'),'- id: hippocampus\n  config:\n    homeDir: '+JSON.stringify(f.target.replace(/\\/g,'/'))+'\n');
  assert.deepEqual(installConflicts(profile,ROOT,{dsh:{profile:{bundles:[]}}}),[]);
  let host=mount({homeDir:f.target});
  try{
    assert.equal((await host.call('fish-a','hp_list')).code,'SPACE_UNBOUND');
    await bind(host,'fish-a','记忆空间1');await bind(host,'fish-b','记忆空间2');
    assert.match(JSON.stringify(await host.call('fish-a','hp_list')),/青柠/);
    assert.doesNotMatch(JSON.stringify(await host.call('fish-a','hp_list')),/紫罗兰/);
    assert.equal((await host.call('fish-b','hp_get',{id:'a'})).ok,false);
    assert.match(host.render('fish-a'),/青柠/);assert.doesNotMatch(host.render('fish-a'),/紫罗兰|未选择/);
    assert.match(host.render('fish-b'),/紫罗兰/);assert.doesNotMatch(host.render('fish-b'),/青柠/);
    const panel=await host.call('fish-a','hp_dashboard'),url=new URL(panel.url);
    assert.equal(panel.space,'记忆空间1');assert.equal(panel.refreshIntervalMs,60000);
    const headers={'x-memory-access':new URLSearchParams(url.hash.slice(1)).get('access')};
    const response=await fetch(url.origin+'/api/dashboard?reveal=1',{headers});assert.equal(response.status,200);
    const view=await response.json();assert.equal(view.snapshot.total,1);assert.equal(view.space,'记忆空间1');
    assert.doesNotMatch(JSON.stringify(view),/紫罗兰|未选择/);
    await host.close();host=mount({homeDir:f.target});
    assert.equal((await host.call('fish-a','hp_list')).total,1);
    assert.equal((await host.call('fish-b','hp_list')).total,1);
    assert.deepEqual(fs.readFileSync(f.source),sourceBytes);
  }finally{await host.close()}
});

test('unselected source or duplicate destinations cannot silently mix fish',t=>{
  const f=fixture(t);write(f.source,{version:1,conversations:{a:brain(),b:brain('b','另一个空间')}});
  const source=readSource(f.source);
  assert.throws(()=>planMigration(source,{toSpace:'记忆空间1'}),/多个空间/);
  assert.throws(()=>planMigration(source,{fromSpace:'missing',toSpace:'记忆空间1'}),/不存在/);
  assert.throws(()=>planMigration(source,{fromSpace:'a'}),/--to-space/);
  for(const mapping of [[{from:'a',to:'x'},{from:'b',to:'x'}],[{from:'a',to:'x'},{from:'a',to:'y'}]])assert.throws(()=>planMigration(source,{mapping}),/重复/);
  assert.throws(()=>planMigration(source,{fromSpace:'a',toSpace:'__proto__'}),/空间名/);
  assert.equal(fs.existsSync(f.target),false);
});

test('existing target, including running data and empty directory, is never overwritten',t=>{
  const f=fixture(t);write(f.source,{version:1,conversations:{a:brain()}});fs.mkdirSync(f.target);
  const args=['--from',f.source,'--to',f.target,'--to-space','记忆空间1'];
  assert.equal(cli(args).code,1);assert.deepEqual(fs.readdirSync(f.target),[]);
  fs.writeFileSync(path.join(f.target,'room-preview.lock'),'live sentinel');
  fs.writeFileSync(path.join(f.target,'brain.json'),'existing private data');
  assert.equal(cli(args).code,1);assert.equal(fs.readFileSync(path.join(f.target,'brain.json'),'utf8'),'existing private data');
  assert.equal(fs.readFileSync(path.join(f.target,'room-preview.lock'),'utf8'),'live sentinel');
  assert.equal(cli([...args,'--mode','replace']).code,1);
});

test('malformed or future source fails without copying empty memory or leaking contents',t=>{
  const f=fixture(t),args=['--from',f.source,'--to',f.target,'--to-space','记忆空间1'];
  for(const value of ['{"sensitive phrase": BROKEN',JSON.stringify({version:2,conversations:{a:brain()}}),JSON.stringify({version:1,conversations:{a:{brain:null}}}),JSON.stringify({version:1,conversations:{a:{items:[null]}}})]){
    fs.writeFileSync(f.source,value);const result=cli(args);
    assert.equal(result.code,1);assert.doesNotMatch(result.data.error,/sensitive phrase/);
    assert.equal(fs.readFileSync(f.source,'utf8'),value);assert.equal(fs.existsSync(f.target),false);
  }
});

test('changing source aborts staged snapshot without exposing a partial destination',t=>{
  const f=fixture(t);write(f.source,{version:1,conversations:{a:brain()}});
  const source=readSource(f.source),plan=planMigration(source,{toSpace:'记忆空间1'});
  write(f.source,{version:1,conversations:{a:brain('new','测试中的并发写入')}});
  assert.throws(()=>migrateSnapshot(source,plan,f.target),/源文件在复制期间发生变化/);
  assert.equal(fs.existsSync(f.target),false);
  assert.match(fs.readFileSync(f.source,'utf8'),/并发写入/);
});

test('CLI refuses missing, repeated and unknown options',t=>{
  const f=fixture(t);write(f.source,{version:1,conversations:{a:brain()}});
  for(const args of [[],['--from'],['--from',f.source,'--to'],['--from',f.source,'--unknown'],['--from',f.source,'--from',f.source]])assert.equal(cli(args).code,2);
});
