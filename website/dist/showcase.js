/* Public synthetic showcase. No API requests, uploads, credentials or local memory. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const promptButton = $('#copy-dashboard-prompt');
  promptButton.addEventListener('click', async () => {
    const code = $('#dashboard-prompt');
    try {
      await navigator.clipboard.writeText(code.textContent);
      $('#copy-status').textContent = '已复制，在 DSH 对话里粘贴即可。';
      promptButton.textContent = '已复制 ✓';
    } catch {
      const range = document.createRange(); range.selectNodeContents(code);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      $('#copy-status').textContent = '已选中这句话，请手动复制。';
      promptButton.textContent = '已选中，请复制';
    }
  });
  const section = $('#dashboard');
  let initialized = false;
  function initialize() {
    if (initialized) return;
    initialized = true;
    try { start(); }
    catch (error) {
      $('#demo-selection').textContent = '交互演示暂时无法加载。下方仍可查看功能介绍与安装说明。';
      console.error('Memory showcase initialization failed:', error);
    }
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); initialize(); }
    }, { rootMargin: '180px' });
    observer.observe(section);
  } else initialize();
  function start() {
    const day = '2026-11-01'; // A fixed, explicitly synthetic demonstration day.
    let growth = 0, userPaused = false, state, view;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let allPaused = document.documentElement.classList.contains('motion-paused') || motion.matches;
    const el = (tag, text, className) => { const element=document.createElement(tag); if(text!==undefined)element.textContent=text; if(className)element.className=className;return element; };
    const tierNames={instant:'瞬时',short:'短期',long:'长期',permanent:'永久'};
    const colors={instant:'#a9b5a1',short:'#baa8c3',long:'#d6a17b',permanent:'#d7b86c'};
    function selectWord(word) {
      if (!word) return;
      $('#demo-word').value=word.id;
      const count=word.memoryIds?.length||0;
      $('#demo-selection').textContent=`${word.label} · ${count} 条关联示例 · 由近及远，逐层淡化`;
    }
    view=new MemoryNetwork.View($('#demo-network'),selectWord);
    // Keep the published renderer while connecting its motion preference to the site's switch.
    view.reducedMotion={get matches(){return allPaused||motion.matches;}};
    function syncMotion() {
      view.paused=allPaused||userPaused;view.dirty=true;
      $('#demo-pause').textContent=view.paused?'开启旋转':'暂停旋转';
      $('#demo-pause').setAttribute('aria-pressed',String(view.paused));
      $('#demo-pause').disabled=allPaused;
      $('#demo-pause').title=allPaused?'在页面顶部开启动态效果后可旋转':'暂停或开启图谱自动旋转';
    }
    function render() {
      state=MemoryDemo(day,true,growth);
      const s=state.snapshot;
      $('#demo-total').textContent=s.total;
      $('#demo-added').textContent=state.counts.added;
      $('#demo-recalled').textContent=state.counts.recalled;
      $('#demo-archived').textContent=state.counts.archived;
      const events=$('#demo-events');events.replaceChildren();
      for(const type of ['added','recalled','archived']) {
        const event=state.events.find(item=>item.type===type),memory=s.memories.find(item=>item.id===event?.memoryId);
        if(!event)continue;
        const li=el('li'),content=el('div');
        content.append(el('strong',event.label),el('p',memory?.text||'整理一段经历。'));
        li.append(el('i',undefined,'demo-event-dot'),content);events.append(li);
      }
      const layers=$('#demo-layers');layers.replaceChildren();
      for(const [key,value] of Object.entries(s.tiers)) {
        const row=el('div',undefined,'demo-layer'),track=el('i'),fill=el('b');
        fill.style.width=`${value/s.total*100}%`;fill.style.background=colors[key];track.append(fill);
        row.append(el('span',tierNames[key]),track,el('em',value));layers.append(row);
      }
      const select=$('#demo-word');select.replaceChildren();
      for(const node of s.graph.nodes){const option=el('option',node.label);option.value=node.id;select.append(option);}
      view.setData(s.graph.nodes,s.graph.edges,s.memories,'public-demo');
      selectWord(s.graph.nodes.find(node=>node.id===view.selected));
      $('#demo-graph-count').textContent=`${s.graph.nodes.length} 词 · ${s.graph.edges.length} 条连接`;
      $('#demo-grow').textContent=growth===4?'↺ 重新体验生长':'＋ 演示一条新记忆';
      syncMotion();
    }
    for(const button of document.querySelectorAll('[data-showcase-view]'))button.addEventListener('click',()=>{
      const network=button.dataset.showcaseView==='network';
      $('#showcase').classList.toggle('network-view',network);
      document.querySelectorAll('[data-showcase-view]').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));});
      requestAnimationFrame(()=>view.resize());
    });
    $('#demo-word').addEventListener('change',event=>view.select(event.target.value));
    $('#demo-reset').addEventListener('click',()=>view.reset());
    $('#demo-pause').addEventListener('click',()=>{userPaused=!userPaused;syncMotion();});
    $('#demo-grow').addEventListener('click',()=>{
      const previous=state.snapshot.graph.nodes.length;
      growth=growth===4?0:growth+1;render();
      $('#demo-growth-status').textContent=growth?`示例 ${growth}/4：新增 1 条记忆、${state.snapshot.graph.nodes.length-previous} 个词，连接已更新。`:'已回到初始示例，可以重新体验。';
    });
    window.addEventListener('memory-motion-change',event=>{allPaused=event.detail.paused;syncMotion();});
    motion.addEventListener('change',event=>{allPaused=event.matches;syncMotion();});
    for(const selector of ['#demo-word','#demo-reset','#demo-grow'])$(selector).disabled=false;
    render();
  }
})();
