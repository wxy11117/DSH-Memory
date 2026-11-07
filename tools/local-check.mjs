#!/usr/bin/env node
// Repeatable offline compatibility checks against the user's installed DSH.
// Never install into an existing profile, restart Desktop, or call an LLM.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createPackageFixture} from '../tests/helpers/package-fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);let asar;
if(args.length){if(args.length!==2||args[0]!=='--asar')throw new Error('用法：node tools/local-check.mjs [--asar <DSH resources/app.asar>]');asar=path.resolve(args[1]);}
else asar=[process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs','DSH Desktop','resources','app.asar'),process.env.ProgramFiles&&path.join(process.env.ProgramFiles,'DSH Desktop','resources','app.asar')].find(p=>p&&fs.existsSync(p));
if(!asar||!fs.existsSync(asar)){console.error('没有找到 DSH Desktop 的 app.asar。请用 --asar 指定安装位置；没有修改任何 profile。');process.exit(1);}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp-local-check-'));
const scratch=path.join(dir,'temporary');fs.mkdirSync(scratch);
const env={...process.env,DSH_HOME:path.join(dir,'harness'),TEMP:scratch,TMP:scratch,ELECTRON_NO_ASAR:'1',DSH_HIPPOCAMPUS_NODE:process.execPath};
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),checks=[];
const report={plugin:pkg.name,version:pkg.version,startedAt:new Date().toISOString(),asar,node:process.version,checks,ok:false,modelRequests:0,liveProfileModified:false};
const reportPath=path.join(dir,'report.json');
let fixture;
function run(name,argv,cwd=root){
  console.log('正在检查：'+name);
  const r=spawnSync(process.execPath,argv,{cwd,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
  const log=path.join(dir,name+'.log');fs.writeFileSync(log,(r.stdout||'')+(r.stderr||''));
  checks.push({name,ok:r.status===0,exitCode:r.status,log});
  if(r.status!==0)throw new Error(name+' 未通过。原因见 '+log+(r.error?'；'+r.error.message:''));
  console.log('通过：'+name);return r.stdout;
}
console.log('本机隔离自检：只读取 DSH 的程序依赖，不改现有配置、记忆或会话。');
console.log('报告目录：'+dir);
try{
  const extracted=path.join(dir,'host');
  run('extract-host',[path.join(root,'tools/asar-deps.mjs'),asar,extracted,'dsh-agent','dsh-tools','dsh-app-boot','dsh-system-prompt','dsh-llm','cordis','schemastery']);
  env.DSH_HOST_MODULES=path.join(extracted,'node_modules','@deepseek-ai');
  report.hostVersion=JSON.parse(fs.readFileSync(path.join(env.DSH_HOST_MODULES,'dsh-app-boot','package.json'))).version;
  fixture=createPackageFixture('hp-local-package-',root);
  const cwd=fixture.packageDir;
  const files=fs.readdirSync(path.join(cwd,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f);
  const unit=run('unit',['--test',...files],cwd);
  report.summary=unit.split(/\r?\n/).filter(line=>/tests |pass |fail |skipped /.test(line)).slice(-4);
  for(const name of ['real-host','real-loader','real-cordis','real-room','real-boot'])run(name,['--expose-internals','tests/'+name+'.mjs'],cwd);
  report.ok=true;
}catch(error){report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{
  try{fixture?.close();}catch(error){report.ok=false;report.cleanupError=error.message;process.exitCode=1;}
  report.finishedAt=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log((report.ok?'本机隔离自检全部通过。':'自检未全部通过，请勿据此升级现有环境。')+' 报告：'+reportPath);
  console.log('此结果验证安装器和宿主组件；不等同于已经替换日常 DSH 或验证所有第三方插件组合。');
}
