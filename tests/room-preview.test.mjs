import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('standalone preview exits and closes its local listener when its console input closes',{timeout:15000},async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const child=spawn(process.execPath,['tools/preview-room.mjs'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill()});
  let output='',url;
  await new Promise((resolve,reject)=>{
    child.on('error',reject);child.stdout.on('data',chunk=>{output+=chunk;const first=output.split(/\r?\n/).find(line=>line.startsWith('{"demo":true'));if(first)try{url=JSON.parse(first).url}catch{}if(url&&output.includes('独立演示已启动'))resolve()});
    child.on('exit',code=>{if(!url)reject(new Error('preview ended before readiness: '+code))});
  });
  const origin=new URL(url).origin;assert.equal((await fetch(origin+'/room/')).status,200);
  const exited=new Promise(resolve=>child.once('exit',resolve));child.stdin.end();assert.equal(await exited,0);
  await assert.rejects(fetch(origin+'/room/'));
});
