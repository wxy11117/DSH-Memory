/* All names, memories and events here are synthetic demonstration data. */
globalThis.MemoryDemo = function(day, reveal = true, growthStep = 0) {
  const now = Date.now(), midnight = new Date(day + 'T00:00:00').getTime(), H = 3600000
  const samples = [
    ['我珍惜与朋友的约定，也在学习和日常中积累自己的经历。','self','我','约定','学习','日常'],
    ['去植物园看银杏，是亲近自然的一次经历。','place','自然','银杏','植物园'],
    ['日常喜欢雨天在窗边看书，听见雨声会觉得安静。','person','日常','雨天','看书','雨声'],
    ['今天学习了用图结构表达记忆与词语之间的联想。','study','学习','联想','记忆'],
    ['和朋友约定周六下午一起喝咖啡。','promise','约定','咖啡','周六','朋友'],
    ['在自然里散步，注意到了河边的落日。','event','自然','散步','落日'],
    ['和朋友约定，做完一个小项目就用火锅庆祝。','food','约定','朋友','火锅','项目'],
    ['听见钢琴与雨声，情绪慢慢变得安静。','feeling','情绪','钢琴','雨声','安静'],
    ['为了学习天文，周末在书店找了一本书。','study','学习','书店','天文'],
    ['一张旧照片勾起了海边旅行的记忆。','event','记忆','照片','旅行'],
    ['把去公园跑步，变成一个日常的小习惯。','daily','日常','公园','跑步'],
    ['亲近自然的时候，星空总让我想起露营。','event','自然','星空','露营'],
    ['日常的午后，有柠檬茶和阅读就很好。','food','日常','柠檬茶','阅读'],
    ['日常去散步，是我亲近自然的一种方式。','daily','日常','散步','自然'],
    ['我会留意自己的情绪，也珍惜安静的片刻。','self','我','情绪','安静'],
  ]
  const all = Array.from({length:60}, (_,i) => {
    const s=samples[i%samples.length], tier=i<9?'permanent':i<31?'long':i<45?'short':'instant'
    const S={permanent:4200,long:360,short:36,instant:3}[tier]
    return {id:'demo-'+i,text:reveal?s[0]:'',category:s[1],tier,stability:S,retention:Math.max(.08,.99-(i%17)*.041),importance:i===0?100:70,pinned:i<4,semantic:i>=20&&i<26,archived:i>=48,createdAt:now-(i+2)*H,updatedAt:now-i*H,_words:s.slice(2)}
  })
  const growthSamples=[
    ['和朋友喝咖啡时，约好一起去海边看日出。','event','朋友','咖啡','海边','日出'],
    ['在海边练习摄影，带上新买的胶片。','study','海边','摄影','胶片'],
    ['整理摄影作品，做成一本旅行相册。','event','摄影','相册','旅行'],
    ['想把相册作为礼物送给朋友。','promise','相册','礼物','朋友'],
  ]
  const added=growthSamples.slice(0,Math.max(0,Math.min(4,Math.floor(growthStep)))).map((s,i)=>({id:'demo-growth-'+i,text:reveal?s[0]:'',category:s[1],tier:'long',stability:240,retention:.98,importance:75,pinned:false,semantic:false,archived:false,createdAt:now,updatedAt:now,_words:s.slice(2)}))
  all.push(...added)
  const words=[...new Set(all.flatMap(m=>m._words))],categories=new Set(['约定','日常','学习','自然','情绪','记忆'])
  const nodes=words.map((word,i)=>({id:'word-'+i,label:reveal?word:`词项 ${i+1}`,weight:all.filter(m=>m._words.includes(word)).length,kind:categories.has(word)?'cat':word==='我'?'tag':'gram',memoryIds:all.filter(m=>m._words.includes(word)).map(m=>m.id)}))
  const ids=new Map(words.map((word,i)=>[word,'word-'+i])),pairs=new Map()
  // Every synthetic edge is supported by words in the same synthetic memory.
  for(const m of all)for(let i=0;i<m._words.length;i++)for(let j=i+1;j<m._words.length;j++){
    const [a,b]=[ids.get(m._words[i]),ids.get(m._words[j])].sort(),key=a+'|'+b
    if(!pairs.has(key))pairs.set(key,{source:a,target:b,weight:0})
    pairs.get(key).weight++
  }
  const edges=[...pairs.values()]
  const labels={added:'记下新记忆',recalled:'成功回忆',archived:'移入归档',revised:'订正记忆',consolidated:'归纳经历',retrieved:'按话题检索',injected:'准备上下文记忆',reinforced:'记忆强化'}
  const types=['added','added','retrieved','recalled','recalled','injected','added','revised','recalled','archived','consolidated','archived','reinforced','added','recalled','injected','archived','added','retrieved','recalled','recalled','archived','injected','retrieved']
  const events=types.map((type,i)=>({version:1,id:'event-'+i,at:midnight+(8+i*.39)*H,day,space:'demo',origin:'engine',operation:type==='injected'?'system-prompt':type==='recalled'?'pickRecall':type==='retrieved'?'retrieve':type==='archived'?'sweep':'remember',type,label:labels[type],memoryId:all[i%all.length].id,...(['recalled','reinforced'].includes(type)?{beforeS:36,afterS:57.6}:{}),...(type==='retrieved'?{count:3,memoryIds:all.slice(i,i+3).map(m=>m.id)}:{}),...(type==='injected'?{chars:1280}:{})})).reverse()
  const counts=Object.create(null);for(const e of events)counts[e.type]=(counts[e.type]||0)+1
  added.forEach((m,i)=>events.unshift({version:1,id:'event-growth-'+i,at:now+i,day,space:'demo',origin:'engine',operation:'remember',type:'added',label:'记下新记忆',memoryId:m.id}))
  counts.added=(counts.added||0)+added.length
  const days=Array.from({length:7},(_,i)=>{const d=new Date(midnight);d.setDate(d.getDate()-6+i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return {day:key,total:[14,21,17,29,19,34,24][i],added:[3,5,2,6,4,7,5][i],recalled:[4,5,4,8,3,9,6][i]}})
  days[6].total+=added.length;days[6].added+=added.length
  return {version:1,day,mode:'demo',generatedAt:now,reveal,space:'demo',spaces:[{value:'demo',label:'演示记忆空间'}],tracking:{startedAt:midnight-6*24*H,retentionDays:90,error:'',limited:false},sourceError:'',eventCount:events.length,counts,days,events,snapshot:{total:48+added.length,archived:12,semantic:6,pinned:4,sealed:0,tiers:{instant:3,short:14,long:22+added.length,permanent:9},avgRetention:.78,words:nodes.length,edges:edges.length,memories:all.map(({_words,...m})=>m),graph:{nodes,edges}}}
}
