(() => {
  'use strict'
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)]
  const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e}
  const fmt=n=>Number(n||0).toLocaleString('zh-CN'), localDay=(at=Date.now())=>{const d=new Date(at);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  const time=at=>new Date(at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})
  const dateTime=at=>new Date(at).toLocaleString('zh-CN',{hour12:false})
  const tierNames={instant:'瞬时',short:'短期',long:'长期',permanent:'永久'}, tierColors={instant:'#91aaa1',short:'#b5a1c3',long:'#d9a079',permanent:'#d5b56f'}
  const categoryNames={daily:'日常',watch:'浏览',food:'饮食',place:'地点',event:'事件',feeling:'情绪',study:'学习',person:'人物',promise:'约定',self:'自我',misc:'其他'}
  const labels={added:'记下新记忆',recalled:'成功回忆',reinforced:'记忆强化',suppressed:'同类抑制',archived:'移入归档',restored:'重新唤起',forgotten:'自然淡出',deleted:'主动删除',revised:'订正记忆',consolidated:'归纳经历',pinned:'钉住记忆',unpinned:'取消钉住',sealed:'封存记忆',unsealed:'解除封存',tier_changed:'记忆层级变化',retrieved:'按话题检索',associated:'词语联想',injected:'准备上下文记忆',skipped:'编码门槛过滤',observed_added:'观察到新增',observed_removed:'观察到移除',observed_changed:'观察到内容变化'}
  const operations={remember:'记忆写入',forget:'主动删除',pin:'钉住设置',sealMemory:'封存设置',revise:'订正内容',setTier:'调整层级',sweep:'记忆清理',semanticize:'经历归纳',pickRecall:'主动回忆',maybeDailyRecall:'每日回忆',probe:'话题唤起',render:'整理上下文',stats:'统计时整理',list:'读取时整理',retrieve:'话题检索',ripple:'关系网联想',searchArchive:'归档检索','system-prompt':'宿主组装上下文','file-observer':'观察文件变化'}
  const params=new URLSearchParams(location.hash.slice(1)); let access=params.get('access')||''
  if(access){try{sessionStorage.setItem('memory-panel-access',access);history.replaceState(null,'',location.pathname+location.search)}catch{}}
  else{try{access=sessionStorage.getItem('memory-panel-access')||''}catch{}}
  let data=null, reveal=false, mode='live', imported=null, filter='all', memoryFilter='all', page='overview', requested=0, loading=false, graph=null, toastTimer=null
  let selectedSpace='', day=localDay(), showingDemo=false, demoGrowth=0,sourceEpoch=0
  $('#dayInput').value=day;$('#dayInput').max=localDay()
  const emptySnapshot=()=>({total:0,archived:0,semantic:0,pinned:0,sealed:0,tiers:{instant:0,short:0,long:0,permanent:0},avgRetention:0,words:0,edges:0,memories:[],graph:{nodes:[],edges:[]}})
  function notify(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3200)}
  function setNotice(text,kind=''){const box=$('#notice');box.className='notice'+(kind?' '+kind:'');box.querySelector('span').textContent=text;$('#reconnectButton').hidden=mode==='live'||!access}
  function currentMemory(id){return data?.snapshot.memories.find(m=>m.id===id)}
  function eventLabel(e){if(e.origin==='observation'){if(e.type==='recalled')return '观察到回忆时间更新';if(e.type==='reinforced')return '观察到稳定性增强';if(e.type==='suppressed')return '观察到稳定性下降';if(e.type==='archived')return '观察到移入归档';if(e.type==='restored')return '观察到恢复活跃'}return labels[e.type]||e.label||'记忆活动'}
  function eventGroup(e){if(['added','observed_added','skipped'].includes(e.type))return'new';if(['recalled','reinforced','retrieved','associated','restored','injected'].includes(e.type))return'recall';return'organize'}
  function textForMemory(id){const m=currentMemory(id);if(!m)return'原文已移除、封存或不在当前快照中';return reveal?(m.text||'暂无正文'):'记忆内容已隐藏'}
  function eventBody(e){if(e.type==='injected')return `为上下文准备了 ${fmt(e.chars)} 个字符；不代表模型已经采纳。`;if(['retrieved','associated'].includes(e.type))return `返回 ${fmt(e.count)} 条候选记忆；检索本身不等于强化。`;if(e.type==='skipped')return'内容未达到编码门槛，没有写入记忆库。';if(e.memoryId)return textForMemory(e.memoryId);return'已记录这次记忆操作。'}
  function empty(parent,title,body){const wrap=node('div','empty-state');wrap.append(node('div','empty-orbit'),node('strong','',title),node('p','',body));parent.append(wrap)}
  async function refresh(manual=false){
    if(loading&&!manual&&mode==='live')return
    const ticket=++requested
    if(mode==='demo'){data=MemoryDemo(day,reveal,demoGrowth);render();return}
    if(mode==='import'){data=importView(imported,reveal);render();return}
    if(!access){renderDisconnected();return}
    if(loading&&!manual)return
    loading=true
    try{
      const query=new URLSearchParams({day,reveal:reveal?'1':'0'});if(selectedSpace)query.set('space',selectedSpace)
      const response=await fetch('/api/dashboard?'+query,{headers:{'X-Memory-Access':access},cache:'no-store'})
      const value=await response.json();if(!response.ok)throw new Error(value.error||'连接失败')
      if(ticket!==requested)return
      if(value.demo){mode='demo';reveal=true;data=MemoryDemo(day,reveal,demoGrowth)}else{data=value;selectedSpace=value.space}
      render();if(manual)notify('数据已刷新')
    }catch(e){if(ticket===requested){setNotice('暂时无法连接：'+e.message+'。请保持面板启动进程运行。','error');$('#connection').textContent='连接已断开';$('#connection').className='connection offline';if(!data)renderDisconnected(true)}}
    finally{loading=false}
  }
  function renderDisconnected(keepNotice=false){
    data={day,mode:'disconnected',snapshot:emptySnapshot(),counts:{},events:[],days:[],spaces:[],eventCount:0,tracking:{startedAt:0},generatedAt:Date.now()}
    render();if(keepNotice)return
    setNotice('尚未连接。可从插件调用 hp_dashboard，或打开本地脑文件查看当前状态。也可以先体验演示。')
  }
  function setValue(selector,value,unit='条'){const el=$(selector);el.replaceChildren(document.createTextNode(fmt(value)),node('small','',unit))}
  function spark(id,values){const svg=$(id);svg.replaceChildren();if(!values.length)return;const max=Math.max(1,...values),p=document.createElementNS('http://www.w3.org/2000/svg','polyline');p.setAttribute('points',values.map((v,i)=>`${i*110/Math.max(1,values.length-1)},${32-v/max*27}`).join(' '));svg.append(p)}
  function render(){
    if(!data)return
    const s=data.snapshot,c=data.counts||{},isDemo=data.mode==='demo',isImport=data.mode==='import',off=data.mode==='disconnected'
    const connection=$('#connection');connection.replaceChildren(node('i'),document.createTextNode(isDemo?'演示模式':isImport?'本地文件快照':off?'尚未连接':data.mode==='observation'?'本机 · 文件观察':'本机 · 操作日志'));connection.className='connection'+(off?' offline':'')
    if(isDemo)setNotice('演示模式：全部记忆、数字与活动均为合成示例，不是你的真实运行记录。','demo')
    else if(isImport)setNotice('本地文件快照：只在浏览器内读取，不会上传。当前状态不能还原过去每天的活动。')
    else if(!off&&data.sourceError)setNotice(data.sourceError+'。保留上次可读状态；面板不会改动脑文件。','error')
    else if(!off&&data.tracking.error)setNotice('活动日志读取异常：'+data.tracking.error+'。记忆数据仍可查看。','error')
    else if(!off&&data.mode==='observation')setNotice('文件观察模式：记录面板运行期间发现的变化。时间是发现时间；不能推断每一次检索、强化原因或离线期间的全部操作。')
    else if(!off)setNotice('操作记录从接入后开始；日志不另存正文。上下文准备与检索，不等于模型实际使用了这些记忆。')
    $('#privacyButton').setAttribute('aria-pressed',String(reveal));$('#privacyButton span').textContent=reveal?'隐藏内容':'显示内容'
    $('#updatedAt').textContent=(isDemo?'演示刷新 ':isImport?'读取于 ':'更新于 ')+time(data.generatedAt)
    $('#navWords').textContent=fmt(s.words);$('#navTotal').textContent=fmt(s.total)
    setValue('#totalValue',s.total);setValue('#addedValue',(c.added||0)+(c.observed_added||0));setValue('#recallValue',c.recalled||0,'次');setValue('#archiveValue',c.archived||0)
    $('#totalFoot').textContent=`另有 ${fmt(s.archived)} 条归档`;$('#addedFoot').textContent=data.mode==='observation'?'按观察到的新增计数':'每条新增记忆计一次';$('#recallFoot').textContent=data.mode==='observation'?'观察到回忆时间更新':'按成功回忆条目次数计';$('#archiveFoot').textContent=`归纳活动 ${fmt(c.consolidated||0)} 次`
    const mini=$('#tiersMini');mini.replaceChildren();for(const [key,v]of Object.entries(s.tiers)){const bar=node('span');bar.style.height=(5+v/Math.max(1,s.total)*36)+'px';bar.style.background=tierColors[key]||'#819aac';mini.append(bar)}
    spark('#addedSpark',data.days.map(d=>d.added));spark('#recallSpark',data.days.map(d=>d.recalled))
    $('#eventCounter').textContent=fmt(data.eventCount);$('#dailySummary').textContent=data.eventCount?`记录 ${fmt(data.eventCount)} 次变化与操作 · ${(c.retrieved||0)} 次检索 · ${(c.injected||0)} 次上下文准备`:'这一天还没有已记录的活动'
    $('#timelineMode').textContent=data.mode==='observation'?'发现时间':isDemo?'合成活动示例':'操作发生时间'
    $('#trackingSince').textContent=data.tracking.startedAt?`记录起点：${dateTime(data.tracking.startedAt)}${data.truncated?' · 展示最近 1500 条':''}`:'未提供历史活动日志'
    const select=$('#spaceSelect'),prev=select.value;select.replaceChildren();for(const sp of data.spaces||[]){const option=node('option','',sp.label);option.value=sp.value;select.append(option)}if(!select.options.length)select.append(node('option','','默认记忆空间'));select.value=data.space||prev;select.disabled=['demo','disconnected'].includes(data.mode)
    renderTimeline();renderTrend();renderLayers();renderMemories();renderGraph()
    $('#exportButton').disabled=off;$('#footerStatus').textContent=isDemo?'当前为合成演示 · 不连接真实记忆':'内容留在本机 · 面板不修改记忆'
    setPage(page,false)
  }
  function renderTimeline(){
    const list=$('#timeline'),query=$('#searchInput').value.trim().toLowerCase(),scroll=list.scrollTop;list.replaceChildren()
    const rows=(data?.events||[]).filter(e=>(filter==='all'||eventGroup(e)===filter)&&(!query||(eventLabel(e)+' '+eventBody(e)).toLowerCase().includes(query)))
    if(!rows.length){empty(list,query||filter!=='all'?'没有符合条件的活动':'记忆的一天，从这里开始',data?.mode==='import'?'这是当前状态快照，不能由它推算出过去的操作。':'接入后的新增、回忆与整理会出现在这里。没有记录不代表插件过去没有运行。');return}
    for(const e of rows){const group=eventGroup(e),row=node('button','timeline-row');row.type='button';const symbol=node('span','event-symbol '+(group==='recall'?'recall':group==='organize'?'organize':'')+(['deleted','forgotten','observed_removed'].includes(e.type)?' delete':''),group==='new'?'+':group==='recall'?'↗':e.type==='archived'?'↓':'◇');const content=node('div','event-content'),title=node('div','event-title',eventLabel(e));title.append(node('span','event-type',categoryNames[e.category]||'系统活动'));content.append(title,node('div','event-body',eventBody(e)));const meta=node('div','event-meta');if(e.beforeS!=null&&e.afterS!=null)meta.append(node('span','',`S ${e.beforeS.toFixed(1)}h → ${e.afterS.toFixed(1)}h`));if(e.tier)meta.append(node('span','',tierNames[e.tier]||e.tier));if(e.origin==='observation')meta.append(node('span','observed','观察结果'));if(meta.children.length)content.append(meta);row.append(node('time','event-time',time(e.at)),symbol,content);row.addEventListener('click',()=>showEvent(e));list.append(row)}
    list.scrollTop=scroll
  }
  function renderTrend(){const chart=$('#trendChart');chart.replaceChildren();const max=Math.max(1,...(data.days||[]).map(d=>d.total));if(!data.days.length){empty(chart,'暂无活动历史','接入后按天累计');return}for(const d of data.days){const col=node('button','day-column'+(d.day===day?' current':''));col.setAttribute('aria-label',`${d.day}，${d.total} 次活动`);const space=node('span','bar-space'),bar=node('span','bar-fill');bar.style.height=(d.total/max*100)+'%';space.append(bar);col.append(node('strong','',d.total),space,node('span','',d.day.slice(5).replace('-','/')));col.addEventListener('click',()=>changeDay(d.day));chart.append(col)}}
  function renderLayers(){const list=$('#layerList');list.replaceChildren();const ranges={instant:'S < 4h',short:'4–72h',long:'72–720h',permanent:'≥ 720h'};for(const key of Object.keys(tierNames)){const row=node('div','layer-row'),name=node('span','layer-name'),dot=node('i'),track=node('div','layer-track'),bar=node('span');dot.style.background=tierColors[key];bar.style.background=tierColors[key];bar.style.width=(data.snapshot.tiers[key]/Math.max(1,data.snapshot.total)*100)+'%';name.append(dot,document.createTextNode(tierNames[key]));track.append(bar);row.append(name,track,node('strong','',data.snapshot.tiers[key]),node('small','',ranges[key]));list.append(row)}}
  function renderMemories(){const list=$('#memoryGrid'),query=$('#memorySearch').value.trim().toLowerCase();list.replaceChildren();const rows=(data?.snapshot.memories||[]).filter(m=>(memoryFilter==='all'||memoryFilter==='active'&&!m.archived||memoryFilter==='archive'&&m.archived||memoryFilter==='semantic'&&m.semantic||memoryFilter==='pinned'&&m.pinned)&&(!query||(m.text||'').toLowerCase().includes(query)));$('#memoryCount').textContent=`${rows.length} 条可查看记录 · 封存内容不展示 · 当前状态，不是所选日期的历史快照`;if(!rows.length){empty(list,'这里暂时没有匹配的记忆',reveal?'换个筛选条件试试。':'可先显示内容，再按正文搜索。');return}for(const m of rows){const card=node('button','memory-card');card.append(node('span','tag',`${categoryNames[m.category]||m.category} · ${m.archived?'归档':tierNames[m.tier]||m.tier}${m.pinned?' · 钉住':''}`),node('p','',reveal?m.text:'内容已隐藏，点击上方“显示内容”查看。'));const meta=node('div','card-meta');meta.append(node('span','',`稳定性 ${m.stability.toFixed(1)}h`),node('span','',`留存 ${Math.round(m.retention*100)}%`));const track=node('div','retention-track'),fill=node('span');fill.style.width=(Math.max(0,Math.min(1,m.retention))*100)+'%';track.append(fill);card.append(meta,track);card.addEventListener('click',()=>showMemory(m));list.append(card)}}
  function dialog(title,text,pairs=[],note=''){const body=$('#dialogBody');body.replaceChildren(node('h2','',title));if(text)body.append(node('div','detail-text',text));const dl=node('dl');for(const[k,v]of pairs)dl.append(node('dt','',k),node('dd','',v));body.append(dl);if(note)body.append(node('p','detail-note',note));if(!$('#detailsDialog').open)$('#detailsDialog').showModal()}
  function showEvent(e){const pairs=[['记录时间',dateTime(e.at)],['记录方式',e.origin==='observation'?'观察文件变化（不是完整操作记录）':'插件操作日志'],['触发方式',operations[e.operation]||'记忆操作']];if(e.intervalStart)pairs.push(['观察区间',`${dateTime(e.intervalStart)} 至 ${dateTime(e.at)}`]);if(e.beforeS!=null)pairs.push(['稳定性变化',`${e.beforeS.toFixed(2)}h → ${e.afterS.toFixed(2)}h`]);if(e.memoryId)pairs.push(['记忆编号',e.memoryId]);dialog(eventLabel(e),eventBody(e),pairs,'正文来自当前记忆库，而不是历史原文副本。删除或封存后不再展示；日志不会另存正文。');if(Array.isArray(e.memoryIds)&&e.memoryIds.length){const body=$('#dialogBody');body.append(node('p','','本次返回的候选记忆：'));for(const id of e.memoryIds.slice(0,20))body.append(node('p','detail-text',textForMemory(id)))}}
  function showMemory(m){dialog(m.semantic?'一条归纳记忆':'一段被记住的经历',reveal?m.text:'内容已隐藏。关闭详情后，点击“显示内容”查看。',[['分类',categoryNames[m.category]||m.category],['当前层级',tierNames[m.tier]||m.tier],['稳定性 S',m.stability.toFixed(2)+' 小时'],['当前留存率',Math.round(m.retention*100)+'%'],['首次记录',dateTime(m.createdAt)],['状态',m.archived?'已归档':m.pinned?'活跃 · 已钉住':'活跃']],'留存率是指数衰减模型的计算值，不等于内容的真实性或模型回答正确率。')}
  function setPage(next,resize=true){page=next;document.body.className='page-'+next;$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===next));$('#breadcrumb').textContent={overview:'每日概览',network:'词语关系网',memories:'记忆库'}[next];$('#pageTitle').textContent=next==='network'?'记忆，沿着连接生长。':next==='memories'?'那些留下来的事。':day===localDay()?'今天，记住了什么。':`${day.slice(5).replace('-',' 月 ')} 日的记忆足迹。`;$('#pageSubtitle').textContent=next==='network'?'从一个词出发，看看那些相互关联的经历。':next==='memories'?'查看当前保存的经历与归纳，不在这里修改记忆。':'从记下一件小事，到想起一段经历。看见记忆的每一步。';$('.memory-panel').hidden=next!=='memories';if(resize)requestAnimationFrame(()=>graph?.resize())}
  function changeDay(next){if(next>localDay())return;day=next;$('#dayInput').value=day;refresh()}
  function startDemo(){mode='demo';reveal=true;showingDemo=true;selectedSpace='';demoGrowth=0;sourceEpoch++;refresh()}
  function exportReport(){if(!data)return;const s=data.snapshot;const lines=[`# 大肥鱼记忆日报 · ${day}`,`数据模式：${data.mode==='demo'?'合成演示（非真实记录）':data.mode==='observation'?'文件变化观察':data.mode==='import'?'导入快照（无活动历史）':'插件操作日志'}`,`生成时间：${dateTime(data.generatedAt)}`,'',`已记录活动：${data.eventCount} 次`,`新增：${(data.counts.added||0)+(data.counts.observed_added||0)} 条；成功回忆/回忆时间更新：${data.counts.recalled||0} 次；归档：${data.counts.archived||0} 条`,'','## 当前状态（不是历史快照）',`活跃 ${s.total} 条；归档 ${s.archived} 条；归纳 ${s.semantic} 条；关系网 ${s.words} 词 / ${s.edges} 边`,'','## 活动统计',...Object.entries(data.counts).map(([k,v])=>`- ${labels[k]||k}：${v}`),'','说明：本日报只导出统计，不包含记忆正文、空间标识、词语标签或访问凭据。文件观察时间是发现时间，不能完整还原过去操作。'];const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=`记忆日报-${day}${data.mode==='demo'?'-演示':''}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('日报已导出，不含记忆正文')}

  // Read local JSON inside the browser only. No file content is sent to the service.
  function importView(doc,show){
    const key=selectedSpace||Object.keys(doc.conversations||{})[0]||'default',state=doc.conversations?.[key]||{},b=state.brain||state,items=Array.isArray(b.items)?b.items.filter(Boolean):[],archive=Array.isArray(b.archive)?b.archive.filter(Boolean):[],all=[...items,...archive].filter(m=>!m.sealed),now=Date.now(),s=emptySnapshot();s.total=items.length;s.archived=archive.length;s.sealed=items.filter(m=>m.sealed).length;s.semantic=items.filter(m=>m.semantic).length;s.pinned=items.filter(m=>m.pinned).length;for(const m of items)if(Object.hasOwn(s.tiers,m.tier))s.tiers[m.tier]++
    const retention=m=>Math.exp(-Math.max(0,now-Math.max(Number(m.createdAt)||0,Number(m.updatedAt)||0,Number(m.lastRecalledAt)||0))/3600000/Math.max(.1,Number(m.stabilityHours)||1))
    s.memories=all.slice(0,1600).map(m=>({id:String(m.id),text:show?String(m.text||''):'',category:m.category||'misc',tier:m.tier||'',stability:Number(m.stabilityHours)||0,importance:Number(m.salience)||0,retention:retention(m),pinned:!!m.pinned,semantic:!!m.semantic,archived:!items.includes(m),createdAt:Number(m.createdAt)||0,updatedAt:Number(m.updatedAt)||0}))
    const web=b.web||{},words=Object.keys(web.words||{});s.words=words.length;s.edges=Object.keys(web.edges||{}).length;s.avgRetention=items.length?items.reduce((a,m)=>a+retention(m),0)/items.length:0
    const allowed=words.filter(w=>all.some(m=>String(m.text||'').includes(w)||(m.tags||[]).includes(w)))
    const selected=allowed.sort((a,b)=>(Number(web.words[b]?.w)||0)-(Number(web.words[a]?.w)||0)||a.localeCompare(b)).slice(0,600),ids=new Map(selected.map(w=>[w,MemoryNetwork.wordKey(w)]))
    s.graph.nodes=selected.map((w,i)=>({id:ids.get(w),label:show?w:`词项 ${i+1}`,weight:Number(web.words[w]?.w)||0,kind:web.words[w]?.kind||'gram',memoryIds:all.filter(m=>String(m.text||'').includes(w)||(m.tags||[]).includes(w)).slice(0,25).map(m=>String(m.id))}))
    s.graph.edges=Object.entries(web.edges||{}).flatMap(([k,e])=>{const[a,b]=k.split('\u0001');return ids.has(a)&&ids.has(b)?[{source:ids.get(a),target:ids.get(b),weight:Number(e.w)||0}]:[]}).sort((a,b)=>b.weight-a.weight).slice(0,1800)
    s.graph.availableNodes=allowed.length;s.graph.nodeLimit=600;s.graph.edgeLimit=1800
    selectedSpace=key;return{version:1,day,mode:'import',generatedAt:now,reveal:show,space:key,spaces:Object.keys(doc.conversations).map((v,i)=>({value:v,label:show?v:`记忆空间 ${i+1}`})),tracking:{startedAt:0,retentionDays:0},snapshot:s,events:[],days:[],counts:{},eventCount:0}
  }

  const NetworkView = MemoryNetwork.View
  function selectWord(word){updateGraphStatus();const box=$('#wordDetails');box.replaceChildren();$('#wordSelect').value=word?.id||'';if(!word){box.append(node('span','tiny-dot mint'),document.createTextNode('点击一个词，作为新的联想起点。'));return}const linked=data.snapshot.memories.filter(m=>word.memoryIds.includes(m.id));box.append(node('strong','',word.label),document.createTextNode(` · 关联 ${linked.length} 条可查看记忆`));if(linked.length){const b=node('button','','查看关联 →');b.addEventListener('click',()=>{dialog(word.label+'的关联记忆',null,[], '连线表示共同出现，不代表因果、事实关系或人的神经连接。');const body=$('#dialogBody');for(const m of linked.slice(0,12)){const p=node('p','detail-text',reveal?m.text:'内容已隐藏');body.append(p)}});box.append(b)}}
  function updateGraphStatus(){
    if(!graph?.model)return
    const model=graph.model,word=graph.nodes.find(n=>n.id===model.rootId)
    $('#graphCoreName').textContent=word?.label||'等待记忆'
    $('#graphCoreReason').textContent=model.rootId===model.defaultRootId?'来自较重要的记忆':'当前选择的联想起点'
    const layerNames=['核心','一层','二层','三层','四层','五层','六层']
    $('#graphScope').textContent=word?model.counts.slice(1).map((n,i)=>`${layerNames[i+1]} ${n}`).join(' · ')+(model.omitted?` · 另有 ${model.omitted} 词未展开`:'')+(graph.stage?' · 扩展视图':''):'有了连接，就会慢慢展开'
    $('#expandBranches').disabled=!word||!model.omitted||graph.stage>=MemoryNetwork.profiles.length-1
    $('#expandBranches').textContent=graph.stage>=MemoryNetwork.profiles.length-1?'已到展示上限':'展开更多'
    $('#collapseBranches').hidden=graph.stage===0
    $('#growDemo').hidden=data.mode!=='demo';$('#growDemo').disabled=demoGrowth>=4;$('#growDemo').textContent=demoGrowth>=4?'生长演示完成':`演示生长${demoGrowth?' '+demoGrowth+'/4':''}`
    const change=graph.lastChange,status=$('#graphGrowth'),parts=[]
    if(change){
      if(change.addedNodes.length)parts.push(`新出现 ${change.addedNodes.length} 个词`)
      if(change.addedEdges.length)parts.push(`新出现 ${change.addedEdges.length} 条连接`)
      if(change.changedEdges.length)parts.push(`${change.changedEdges.length} 条连接强度变化`)
      if(change.removedNodes.length||change.removedEdges.length)parts.push(`退出当前数据 ${change.removedNodes.length} 词 / ${change.removedEdges.length} 连接`)
    }
    const prefix=data.mode==='demo'?'合成演示':data.mode==='import'?'文件快照':data.mode==='disconnected'?'尚未连接':'每 60 秒随数据更新'
    status.textContent=prefix+' · '+(parts.length?`${time(change.at)} ${parts.join(' · ')}`:data.mode==='demo'?'点击“演示生长”查看新分支':data.mode==='import'?'重新导入可更新，当前文件不会自动变化':'等待下一次关系变化')
    status.dataset.addedNodes=String(change?.addedNodes.length||0);status.dataset.addedEdges=String(change?.addedEdges.length||0)
    const note=$('#graphStats');note.textContent=`${fmt(data.snapshot.words)} 个词 · ${fmt(data.snapshot.edges)} 条连接 · 当前展开 ${model.nodes.length} 词 / ${data.snapshot.graph.nodes.length} 个候选词`
    $('#pauseGraph').textContent=graph.paused?'自动旋转':'暂停旋转'
    $('#pauseGraph').setAttribute('aria-pressed',String(!graph.paused))
  }
  function renderGraph(){const net=data.snapshot.graph;$('#graphEmpty').hidden=net.nodes.length>0;const select=$('#wordSelect');select.replaceChildren(node('option','','选择一个词语'));select.options[0].value='';for(const word of net.nodes){const option=node('option','',word.label);option.value=word.id;select.append(option)}if(!graph)graph=new NetworkView($('#networkCanvas'),selectWord);graph.setData(net.nodes,net.edges,data.snapshot.memories,`${data.mode}:${data.space||''}:${sourceEpoch}`);select.value=graph.selected||'';selectWord(net.nodes.find(n=>n.id===graph.selected)||null);$('#pauseGraph').textContent=graph.paused?'自动旋转':'暂停旋转'}

  $$('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)))
  $$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('selected',x===b));renderTimeline()}))
  $$('[data-memory]').forEach(b=>b.addEventListener('click',()=>{memoryFilter=b.dataset.memory;$$('[data-memory]').forEach(x=>x.classList.toggle('selected',x===b));renderMemories()}))
  $('#searchInput').addEventListener('input',renderTimeline);$('#memorySearch').addEventListener('input',renderMemories)
  $('#privacyButton').addEventListener('click',()=>{reveal=!reveal;refresh()});$('#refreshButton').addEventListener('click',()=>refresh(true));$('#exportButton').addEventListener('click',exportReport)
  $('#todayButton').addEventListener('click',()=>changeDay(localDay()));$('#dayInput').addEventListener('change',e=>{if(e.target.value)changeDay(e.target.value)})
  for(const[id,delta]of [['#prevDay',-1],['#nextDay',1]])$(id).addEventListener('click',()=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+delta);changeDay(localDay(d))})
  $('#spaceSelect').addEventListener('change',e=>{selectedSpace=e.target.value;refresh()});$('#demoButton').addEventListener('click',startDemo);$('#reconnectButton').addEventListener('click',()=>{mode='live';reveal=false;selectedSpace='';refresh()})
  $('#expandGraph').addEventListener('click',()=>setPage(page==='network'?'overview':'network'))
  $('#wordSelect').addEventListener('change',e=>graph?.select(e.target.value))
  $('#pauseGraph').addEventListener('click',()=>{if(graph){graph.togglePause();updateGraphStatus()}})
  $('#resetGraph').addEventListener('click',()=>graph?.reset())
  $('#rotateLeft').addEventListener('click',()=>graph?.rotate(-.3))
  $('#rotateRight').addEventListener('click',()=>graph?.rotate(.3))
  $('#expandBranches').addEventListener('click',()=>graph?.expand())
  $('#collapseBranches').addEventListener('click',()=>graph?.collapse())
  $('#growDemo').addEventListener('click',()=>{if(mode!=='demo'||demoGrowth>=4)return;demoGrowth++;refresh();notify('已加入一条合成示例记忆；没有写入真实记忆库')})
  $('#closeDialog').addEventListener('click',()=>$('#detailsDialog').close());$('#detailsDialog').addEventListener('click',e=>{if(e.target===$('#detailsDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}})
  $('#helpButton').addEventListener('click',()=>dialog('看见记忆，而不打扰记忆',null,[['从插件打开','对 DSH 说：请调用 hp_dashboard，打开记忆活动面板。'],['独立观察','运行 node tools/dashboard.mjs --home <记忆目录>。保持窗口运行，只观察文件变化。'],['打开文件','选择 brain.json，只在浏览器内解析，不上传。它是当前快照，不包含过去每天的完整活动。'],['两种计数','“当前活跃记忆”始终是当前状态；“当日新增/回忆/归档”只统计所选日期的已记录事件。'],['内容保护','默认隐藏正文。活动日志只存编号与操作元数据，不另存正文；封存内容不展示。'],['差序联想','默认从核心词按较强连接扩散三层；“展开更多”可逐步查看至六层、最多 600 词，扩展视图不改变引擎原有联想规则。词语分布于三维球层，同一分支聚在相近方向。拖动查看前后，滚轮缩放；点击或选择词语会重新居中并触发球面波纹。接入后每 60 秒读取新数据，新增词和连接会渐入；没有连通路径的词不强行连线，可从下拉框切换。变化提示比较两次返回的数据，不等于刚创建的记忆。'],['记录期限','插件活动日志默认保留 90 天。未记录的日期不会自动补写。']],'面板没有记忆写入或删除接口。它观察的是软件行为，并不能证明模型已经理解、采用记忆或具有人的心理活动。'))
  $('#importButton').addEventListener('click',()=>$('#fileInput').click());$('#fileInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>32*1024*1024)throw new Error('文件超过 32 MiB');const doc=JSON.parse(await file.text());if(!doc?.conversations||typeof doc.conversations!=='object'||Array.isArray(doc.conversations))throw new Error('文件需要包含 conversations 记忆空间');imported=doc;sourceEpoch++;selectedSpace=Object.keys(doc.conversations)[0]||'default';mode='import';reveal=false;refresh();notify('文件已在本地读取，没有上传')}catch(err){notify('读取失败：'+err.message)}e.target.value=''})
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mode==='live')refresh()})
  setInterval(()=>{if(!document.hidden&&mode==='live'&&access)refresh()},60_000)
  if(params.get('demo')==='1'||location.protocol==='file:')startDemo();else refresh()
})()
