#!/usr/bin/env node
/** 0.3 preview: copy legacy spaces into a NEW offline directory with a complete source backup. */
import fs from 'node:fs';
import {readSource,listSource,parseJson,planMigration,migrateSnapshot} from './memory-migration.mjs';

const help=`用法（在插件解压目录执行，先正常退出使用旧库的程序）：
  node tools/migrate.mjs --from "<旧 brain.json>" --list
  node tools/migrate.mjs --from "<旧 brain.json>" --from-space "<旧空间>" --to "<尚不存在的新目录绝对路径>" --to-space "记忆空间1" --dry
  node tools/migrate.mjs --from "<旧 brain.json>" --from-space "<旧空间>" --to "<同一新目录>" --to-space "记忆空间1"
  node tools/migrate.mjs --from "<旧 brain.json>" --map "<空间映射.json>" --to "<新目录>" --dry

--map 格式：[{"from":"old-a","to":"记忆空间1"},{"from":"old-b","to":"记忆空间2"}]
可追加 --json 输出机器可读结果。源只有一个空间时可省略 --from-space。
只复制到尚不存在的新目录，保留完整原始备份、生成 spaces.json；不修改源、不改 profile、不绑定会话。
本预览不支持向现有库 merge/replace。迁移后按 docs/MIGRATE-SPACES.md 核对并选择绑定。`;

const argv=process.argv.slice(2),options={};
let usageError=false;
try{
  const values=new Set(['from','from-space','to','to-space','map','mode']);
  for(let i=0;i<argv.length;i++){
    const key=argv[i].replace(/^--/,'');
    if(argv[i]==='-h'||key==='help'){console.log(help);process.exit(0)}
    if(!argv[i].startsWith('--')||(!values.has(key)&&!['dry','list','json'].includes(key))||Object.hasOwn(options,key)){usageError=true;throw new Error('未知或重复参数；--help 查看用法')}
    if(values.has(key)){
      const value=argv[++i];if(!value||value.startsWith('--')){usageError=true;throw new Error('--'+key+' 缺少参数值')}
      options[key]=value;
    }else options[key]=true;
  }
  if(!options.from){usageError=true;throw new Error('缺少 --from；--help 查看用法')}
  if(options.mode&&options.mode!=='copy')throw new Error('本预览只允许 copy 到新目录；merge/replace 已停用，避免覆盖旧库或合并不同鱼。见 docs/MIGRATE-SPACES.md');
  const source=readSource(options.from);
  let result;
  if(options.list){
    result={ok:true,source:source.source,sha256:source.sha256,spaces:listSource(source)};
  }else{
    const mapping=options.map?parseJson(fs.readFileSync(options.map),'映射文件'):undefined;
    const plan=planMigration(source,{fromSpace:options['from-space'],toSpace:options['to-space'],mapping});
    result=migrateSnapshot(source,plan,options.to,{dry:!!options.dry});
  }
  if(options.json)console.log(JSON.stringify(result,null,2));
  else if(options.list){
    for(const row of result.spaces)console.log(`${row.space}：活记忆 ${row.items}，归档 ${row.archive}，关系网 ${row.words} 词 / ${row.edges} 边，墓碑 ${row.tombstones}`);
    console.log('请确认每个旧空间属于哪只鱼；不会自动猜测归属。');
  }else{
    for(const row of result.mappings)console.log(`${row.from} → ${row.to}：活记忆 ${row.items}，归档 ${row.archive}`);
    console.log(`${result.dry?'预演':'已复制'}：活记忆 ${result.copiedItems} 条，归档 ${result.copiedArchive} 条，跳过条目 ${result.skippedItems} 条。`);
    console.log(`未选择空间 ${result.unselectedSpaces.length} 个，仍完整保留在源文件${result.dry?'':'及原始备份'}中。`);
    console.log(result.dry?'--dry：未创建目录、备份或空间登记。':`完整源文件备份：${result.backup}\n结果报告：${result.target}/migration-report.json`);
    console.log('源文件未修改。目标未绑定任何会话；按 docs/MIGRATE-SPACES.md 设置测试 homeDir，再调用 hp_space 由用户确认。');
  }
}catch(error){
  if(options.json||argv.includes('--json'))console.log(JSON.stringify({ok:false,error:error.message}));
  else console.error('✗ '+error.message);
  process.exitCode=usageError?2:1;
}
