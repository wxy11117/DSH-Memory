import {icon} from './icons.js';

// This public room only opens an explicitly supplied local link. It never reads
// the memory API, scans ports, or persists/transmits the panel's access token.
export function parsePanelLink(value){
  const raw=String(value??'').trim();
  if(!raw)throw new Error('先把 AI 给你的完整面板链接粘贴到这里。');
  if(raw.length>512||!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/(?:index\.html)?#/.test(raw))throw new Error('请使用插件提供的 http://127.0.0.1:端口/ 本机链接。');
  let url;try{url=new URL(raw)}catch{throw new Error('链接格式不完整，请重新复制插件返回的完整链接。')}
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||!['/','/index.html'].includes(url.pathname))throw new Error('这里只接受插件返回的本机记忆面板链接。');
  const fragment=new URLSearchParams(url.hash.slice(1));
  if([...fragment.keys()].some(key=>key!=='access')||fragment.getAll('access').length!==1||!/^[-_a-zA-Z0-9]{24,128}$/.test(fragment.get('access')||''))throw new Error('链接需要包含完整的 #access= 后半段，请让 AI 重新提供链接。');
  return{href:url.href,origin:url.origin};
}

export function memoryPanelMarkup(){
  return `<div class="memory-welcome"><div class="memory-orbit" aria-hidden="true">${icon('sparkle')}<i></i><i></i><i></i></div><div><span class="eyebrow">A LITTLE WINDOW INTO MEMORY</span><h2>每一件记住的小事，<br/>都在这里。</h2><p>从小屋的电脑，走进你的记忆面板。</p></div></div>
    <div class="memory-features"><div>${icon('clock')}<b>今日动态</b><span>看看记忆发生了什么</span></div><div>${icon('book')}<b>记忆分层</b><span>看看哪些事留了下来</span></div><div>${icon('sparkle')}<b>词语联想</b><span>沿着线索，找回回忆</span></div></div>
    <section class="memory-connect" aria-label="添加插件面板入口"><div class="memory-connect-heading"><h3>我的插件面板</h3><span class="memory-link-status" id="memory-link-status">等待添加地址</span></div>
      <p class="memory-connect-description">在安装了记忆插件的电脑上，用 DSH 提供的链接打开。</p>
      <form id="memory-link-form" novalidate><label for="memory-link-input">插件面板的完整链接</label><div class="memory-input-row"><input id="memory-link-input" type="password" autocomplete="off" spellcheck="false" maxlength="512" placeholder="粘贴 hp_dashboard 返回的完整链接" aria-describedby="memory-link-feedback memory-privacy"/><button class="soft-button" type="submit">添加入口</button></div></form>
      <p id="memory-link-feedback" class="memory-link-feedback" role="status">链接只保留在当前小屋页面里。</p>
      <div class="memory-open-row"><a id="memory-panel-open" class="primary-button memory-open" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-disabled="true" tabindex="-1">${icon('monitor')}打开记忆面板${icon('arrow')}</a><button id="memory-link-clear" class="memory-clear" type="button" hidden>清除地址</button></div>
      <p class="memory-open-hint">面板会在新标签页打开，小屋留在这里等你。</p>
    </section>
    <details class="memory-help"><summary>第一次使用？让 AI 把地址交给你${icon('chevron')}</summary><ol><li>保持 DSH 和记忆插件运行。</li><li>在 DSH 中说：<blockquote>请调用 hp_dashboard，把记忆活动面板的完整链接给我。</blockquote></li><li>把完整链接粘贴到上方，添加后点击「打开记忆面板」。</li></ol><p>DSH 重启后，旧地址可能失效；重新获取并替换即可。请在运行插件的同一台电脑上打开。</p></details>
    <p class="memory-privacy" id="memory-privacy">${icon('check')}地址不会上传，也不会写入小屋存档。此入口不调用 AI、不读取记忆正文；面板仍按自己的规则更新。</p>`;
}

export function bindMemoryPanel(root,onChange=()=>{},options={}){
  const $=selector=>root.querySelector(selector);
  const input=$('#memory-link-input'),link=$('#memory-panel-open'),feedback=$('#memory-link-feedback'),badge=$('#memory-link-status'),clear=$('#memory-link-clear');
  let current=null;
  function render(){
    link.setAttribute('aria-disabled',String(!current));link.tabIndex=current?0:-1;clear.hidden=!!options.getUrl||!current;
    badge.textContent=current?(options.getUrl?'本空间已连接':'已添加本机入口'):'等待连接';badge.classList.toggle('is-set',!!current);
    if(current)link.href=current.href;else link.removeAttribute('href');
    onChange();
  }
  $('#memory-link-form').addEventListener('submit',event=>{
    event.preventDefault();
    try{
      current=parsePanelLink(input.value);input.value='';input.removeAttribute('aria-invalid');
      feedback.textContent=`入口已添加 · ${current.origin}。点击下方按钮查看；若打不开，请确认 DSH 正在运行或重新获取链接。`;feedback.classList.remove('is-error');render();link.focus();
    }catch(error){input.setAttribute('aria-invalid','true');feedback.textContent=error.message;feedback.classList.add('is-error');input.focus()}
  });
  link.addEventListener('click',event=>{if(!current){event.preventDefault();input.focus()}});
  clear.addEventListener('click',()=>{current=null;input.value='';input.removeAttribute('aria-invalid');feedback.textContent='地址已清除；可以添加新的插件面板入口。';feedback.classList.remove('is-error');render();input.focus()});
  if(options.getUrl){
    $('#memory-link-form').hidden=true;$('.memory-help').hidden=true;
    $('.memory-connect-description').textContent='已按当前小屋的记忆空间连接插件，点击即可查看。';
    $('#memory-privacy').textContent='面板每 60 秒读取本空间数据；本地查看和刷新不调用 AI。AI 理解聊天、调用工具仍按所用模型计费。';
    const retry=document.createElement('button');retry.className='soft-button';retry.textContent='重新连接';retry.hidden=true;feedback.after(retry);
    async function connect(){retry.hidden=true;feedback.textContent='正在连接本空间的记忆面板…';try{const result=await options.getUrl();current=parsePanelLink(result.url);render();feedback.textContent='当前空间：'+result.space+' · 每 60 秒更新一次';feedback.classList.remove('is-error')}catch(e){feedback.textContent=e.message;feedback.classList.add('is-error');retry.hidden=false}}
    retry.addEventListener('click',()=>void connect());queueMicrotask(connect);
  }
  return{get configured(){return!!current}};
}
