import fs from 'node:fs';
import path from 'node:path';
import {parsePatchYaml, composeEntries} from './patch-parse.mjs';

// Only inspect package/profile configuration. Never open memory contents or
// include configuration values (which may contain credentials) in diagnostics.
export function installConflicts(profileDir, pluginDir, manifest) {
  const problems=[];
  const bundles=manifest.dsh?.profile?.bundles;
  if(Array.isArray(bundles)) {
    if(bundles.filter(name=>name==='dsh-hippocampus').length>1)problems.push('bundles 中重复登记了 dsh-hippocampus');
    if(bundles.some(name=>typeof name==='string'&&/hippocampus/i.test(name)&&name!=='dsh-hippocampus'))problems.push('此 profile 同时启用了其他 hippocampus 实例；请使用独立测试 profile');
  }
  const parse=text=>parsePatchYaml(text,{requireComplete:true});
  const layers=[parse(fs.readFileSync(path.join(pluginDir,'cordis.patch.yml'),'utf8'))];
  const overlays=[path.join(profileDir,'cordis.patch.yml')];
  if(path.basename(path.dirname(profileDir))==='profiles')overlays.push(path.join(profileDir,'..','..','cordis.patch.yml'));
  for(const file of overlays)if(fs.existsSync(file))layers.push(parse(fs.readFileSync(file,'utf8')));
  const {entries}=composeEntries(layers);
  const matches=[];
  function visit(rows){for(const row of rows){if(row?.name==='dsh-hippocampus'||row?.id==='hippocampus')matches.push(row);if(row?.group&&Array.isArray(row.config))visit(row.config);}}
  visit(entries);
  if(matches.length!==1)problems.push('补丁合成后不是唯一的 hippocampus 入口');
  for(const row of matches){
    const config=row.config||{};
    if(row.disabled===true||config.enabled===false)problems.push('现有补丁已停用 hippocampus，安装登记不能解除该设置');
    if(row.name!=='dsh-hippocampus')problems.push('hippocampus 入口已被另一个包占用');
    if(String(config.externalApi||'').trim())problems.push('现有配置启用了 externalApi 桥接；小屋预览版不支持直接继承，请使用独立测试 profile');
    if(config.homeDir&&typeof config.homeDir==='string'){
      const dir=path.resolve(config.homeDir);
      if(fs.existsSync(path.join(dir,'brain.json'))&&!fs.existsSync(path.join(dir,'spaces.json')))problems.push('homeDir 指向尚未建立空间登记的旧记忆库；先用 tools/migrate.mjs --from "<旧 brain.json>" --list 核对归属，再按 docs/MIGRATE-SPACES.md 复制到新目录并修改测试 homeDir。旧库无需删除');
    }
  }
  return [...new Set(problems)];
}
