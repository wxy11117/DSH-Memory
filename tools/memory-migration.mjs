/** Offline snapshot migration. No store timers, merging, model calls or profile edits. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spaceKey} from '../lib/spaces.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const count=value=>Array.isArray(value)?value.length:object(value)?Object.keys(value).length:0;
export function parseJson(bytes,label){
  try{return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))}
  catch{throw new Error(label+' 不是有效 JSON；未写入目标，也不会自动修复或覆盖原文件')}
}
function brainOf(conv){
  if(!object(conv))throw new Error('源空间不是有效对象');
  const brain=Object.hasOwn(conv,'brain')?conv.brain:conv;
  if(!object(brain)||!['items','archive','web','tombstones'].some(key=>Object.hasOwn(brain,key)))throw new Error('源空间缺少可识别的记忆结构');
  for(const key of ['items','archive']){
    if(brain[key]===undefined)continue;
    if(!Array.isArray(brain[key])||brain[key].some(item=>!object(item)||typeof item.id!=='string'||!item.id||typeof item.text!=='string'))throw new Error('源空间的 '+key+' 结构异常；不会静默跳过条目');
  }
  for(const key of ['web','tombstones'])if(brain[key]!==undefined&&!object(brain[key]))throw new Error('源空间的 '+key+' 结构异常');
  for(const key of ['words','edges'])if(brain.web?.[key]!==undefined&&!object(brain.web[key]))throw new Error('源关系网结构异常');
  return brain;
}
export function summarizeBrain(brain){
  return {items:count(brain.items),archive:count(brain.archive),persons:count(brain.persons),
    words:count(brain.web?.words),edges:count(brain.web?.edges),tombstones:count(brain.tombstones)};
}
export function readSource(file){
  const source=fs.realpathSync(path.resolve(file)),bytes=fs.readFileSync(source),doc=parseJson(bytes,'源文件');
  if(!object(doc)||!object(doc.conversations)||!Object.keys(doc.conversations).length)throw new Error('源文件缺少非空 conversations，无法确定要迁移哪个空间');
  if(doc.version!==undefined&&doc.version!==1)throw new Error('暂只支持 version=1 的旧记忆库；未知版本不会自动转换');
  return {source,bytes,doc,sha256:digest(bytes)};
}
export function listSource(snapshot){
  return Object.entries(snapshot.doc.conversations).map(([space,conv])=>({space,...summarizeBrain(brainOf(conv))}));
}
export function planMigration(snapshot,{fromSpace,toSpace,mapping}={}){
  const keys=Object.keys(snapshot.doc.conversations);
  if(mapping!==undefined&&(fromSpace!==undefined||toSpace!==undefined))throw new Error('--map 不能与 --from-space / --to-space 同用');
  if(mapping===undefined){
    if(!toSpace)throw new Error('请用 --to-space 明确指定归属，不能自动导入共享 default 空间');
    if(fromSpace===undefined&&keys.length!==1)throw new Error('源里有多个空间，请先 --list，再用 --from-space 或 --map 明确对应关系');
    mapping=[{from:fromSpace??keys[0],to:toSpace}];
  }
  if(!Array.isArray(mapping)||!mapping.length)throw new Error('映射文件须为非空数组，每行包含 from 和 to');
  const sources=new Set(),targets=new Set(),conversations={},spaces={},rows=[];
  const now=Date.now();
  for(const row of mapping){
    if(!object(row)||typeof row.from!=='string'||Object.keys(row).some(k=>!['from','to'].includes(k)))throw new Error('映射行只接受 from 和 to 两个字段');
    const target=spaceKey(row.to);
    if(!Object.hasOwn(snapshot.doc.conversations,row.from))throw new Error('指定源空间不存在；请 --list 核对，不能创建空库冒充迁移成功');
    if(sources.has(row.from)||targets.has(target))throw new Error('映射重复：每个旧空间只能对应一个不同的新空间，不能自动合并不同鱼');
    sources.add(row.from);targets.add(target);
    const conv=snapshot.doc.conversations[row.from],brain=brainOf(conv);
    // Preserve every field; do not reclassify, merge, reinforce or sweep during migration.
    conversations[target]=Object.hasOwn(conv,'brain')?structuredClone(conv):{brain:structuredClone(brain)};
    spaces[target]={createdAt:now};
    rows.push({from:row.from,to:target,...summarizeBrain(brain)});
  }
  return {
    brain:{...structuredClone(snapshot.doc),version:1,updatedAt:now,conversations},
    registry:{version:1,bindings:{},spaces},
    report:{formatVersion:1,createdAt:now,sourceSha256:snapshot.sha256,mappings:rows,
      copiedItems:rows.reduce((n,r)=>n+r.items,0),copiedArchive:rows.reduce((n,r)=>n+r.archive,0),skippedItems:0,
      unselectedSpaces:keys.filter(key=>!sources.has(key)),sessionBindingsCreated:0,sourceModified:false},
  };
}
function assertNewTarget(target){
  if(!target||!path.isAbsolute(target))throw new Error('--to 必须是明确的新目录绝对路径；不会使用 HP_HOME / DSH_HOME 推测目标');
  try{fs.lstatSync(target);throw new Error('目标目录已存在（即使为空也不覆盖）；请选择新的目录，再核对后切换 homeDir')}
  catch(error){if(error.code!=='ENOENT')throw error}
}
function writeDurable(file,bytes){
  const fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
export function migrateSnapshot(snapshot,plan,target,{dry=false}={}){
  assertNewTarget(target);
  const output=path.resolve(target);
  const report={...plan.report,target:output,backup:path.join(output,'backups','source.json'),
    brainFile:path.join(output,'brain.json'),spacesFile:path.join(output,'spaces.json')};
  if(dry)return {ok:true,dry:true,...report};
  const parent=path.dirname(output);fs.mkdirSync(parent,{recursive:true});
  const stage=fs.mkdtempSync(path.join(parent,'.hp-migration-'));
  try{
    fs.mkdirSync(path.join(stage,'backups'));
    const files=new Map([
      ['brain.json',Buffer.from(JSON.stringify(plan.brain))],
      ['spaces.json',Buffer.from(JSON.stringify(plan.registry))],
      ['backups/source.json',snapshot.bytes],
      ['migration-report.json',Buffer.from(JSON.stringify(report,null,2)+'\n')],
    ]);
    for(const [name,bytes]of files)writeDurable(path.join(stage,name),bytes);
    for(const [name,bytes]of files)if(!fs.readFileSync(path.join(stage,name)).equals(bytes))throw new Error('写入后校验失败');
    if(!fs.readFileSync(snapshot.source).equals(snapshot.bytes))throw new Error('源文件在复制期间发生变化，请先正常退出使用旧库的程序，再重新迁移');
    assertNewTarget(output);
    // Publish the complete directory together. Interrupted staging is never the configured destination.
    fs.renameSync(stage,output);
    return {ok:true,dry:false,...report};
  }catch(error){
    // Keep staged files for diagnosis; never recursively delete a user path.
    throw new Error(error.message+'；未提交目标。临时快照保留于：'+stage);
  }
}
