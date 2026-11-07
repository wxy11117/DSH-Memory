import {roomStorage} from './persistence.js';
import {icon} from './icons.js';
import {FOODS,RECIPES,KITCHEN_KEY,freshKitchen,validateKitchen,missingIngredients,useIngredients} from './kitchen-data.js';

const readyToEat=new Set(['milk','cheese','yogurt','apple','strawberry','juice','icecream']);
function foodArt(food){
  const shapes={
    milk:'<path d="M23 9h18v9l5 9v27H18V27l5-9Z" fill="#e8eee0"/><path d="M23 9h18v7H23Z" fill="#9bb6a6"/><rect x="21" y="31" width="22" height="15" rx="3" fill="#b5d1d4"/><path d="M28 36v6m4-6v6m4-6v6" stroke="#fff"/>',
    juice:'<path d="M25 8h14v10l7 8v27H18V26l7-8Z" fill="#ebbf78"/><path d="M25 8h14v8H25Z" fill="#b5c2a1"/><circle cx="32" cy="38" r="10" fill="#f6deb1"/><path d="M32 28v20m-10-10h20" stroke="#ecc58c"/>',
    eggs:'<path d="M14 41h36l-4 13H18Z" fill="#d6c6a9"/><ellipse cx="24" cy="32" rx="10" ry="14" fill="#f4e3c7"/><ellipse cx="41" cy="33" rx="9" ry="13" fill="#e8cfab"/>',
    cheese:'<path d="m12 35 31-16 10 18v16H12Z" fill="#e8c477"/><path d="m12 35 31-16 10 18Z" fill="#f4dc9d"/><g fill="#cda55f"><circle cx="23" cy="44" r="4"/><circle cx="42" cy="42" r="3"/><circle cx="35" cy="30" r="3"/></g>',
    yogurt:'<path d="M17 23h30l-4 30H21Z" fill="#b9d2dc"/><rect x="15" y="19" width="34" height="7" rx="3" fill="#f1e6cd"/><circle cx="32" cy="38" r="8" fill="#f5f0df"/><path d="M30 35q-5 4 2 8 7-5 1-8" fill="#91b1b5"/>',
    apple:'<path d="M32 22C14 10 8 32 19 49c6 9 12 3 13 3s10 5 15-4C59 28 47 12 32 22" fill="#d6917e"/><path d="m32 23 2-13" stroke="#8a7859" stroke-width="3"/><path d="M35 17q1-13 15-9-5 12-15 9" fill="#9ab18c"/><path d="M20 28q-4 7-1 12" stroke="#f3c6ad" stroke-width="3" fill="none"/>',
    strawberry:'<path d="M14 24q18-12 36 0 0 20-18 31Q15 44 14 24" fill="#d89390"/><path d="m14 24 10-13 8 8 8-8 10 13-13-3-5 7-5-7Z" fill="#9aaf87"/><g fill="#fae4bc"><ellipse cx="23" cy="31" rx="1.5" ry="3"/><ellipse cx="39" cy="32" rx="1.5" ry="3"/><ellipse cx="31" cy="43" rx="1.5" ry="3"/></g>',
    carrot:'<path d="M23 22q15-7 23 4L19 55Z" fill="#dfab77"/><path d="m31 23 3-16m3 17L47 9m-18 14L23 8" stroke="#98b08b" stroke-width="5" stroke-linecap="round"/><path d="m26 32 9 3m-13 7 7 2" stroke="#c38b5d"/>',
    greens:'<path d="M32 52C6 45 6 25 18 21c-5-15 12-21 19-10 16-4 23 7 15 17 15 19-7 25-20 24" fill="#adc198"/><path d="M31 53V16m0 20L18 27m13 15 13-13" stroke="#7d9b7a" stroke-width="3" fill="none"/>',
    fish:'<path d="M10 33Q25 9 43 28l12-12v34L43 38Q25 55 10 33" fill="#9dbdc8"/><path d="M23 23q8 11 0 22" stroke="#d8e4df" stroke-width="2" fill="none"/><circle cx="19" cy="31" r="3" fill="#496c7d"/><path d="m29 23 2-10 9 12" fill="#7f9eac"/>',
    shrimp:'<path d="M45 23C23 3 7 25 17 42c8 15 29 11 30-2L34 44C13 41 19 18 36 26l3 11 14-3Z" fill="#dda998"/><path d="m23 20 7 6m-13 2 8 4m-9 6 10-1m-6 9 10-5" stroke="#f8dfca" stroke-width="3"/><circle cx="42" cy="26" r="2" fill="#846d68"/>',
    icecream:'<path d="M17 30h30l-5 24H22Z" fill="#cebed8"/><path d="M14 31q0-17 18-17 18 0 18 17Z" fill="#f5e8cd"/><path d="M15 32h34" stroke="#af9fb9" stroke-width="4"/><path d="M26 42h12" stroke="#f8f4e8" stroke-width="4"/>',
  };
  return `<svg class="food-art" viewBox="0 0 64 64" aria-hidden="true">${shapes[food.id]}</svg>`;
}

export function createKitchen(model,{goTo,say,toast,onChange=()=>{},onFocus=()=>{},onBlur=()=>{}}){
  let state;try{state=validateKitchen(JSON.parse(roomStorage.getItem(KITCHEN_KEY)))}catch{state=freshKitchen()}
  let tab='fridge',selected='milk',job=null,keepFridge=false,saveOK=true;
  const dialog=document.createElement('dialog');dialog.id='kitchen-dialog';dialog.className='kitchen-dialog';dialog.setAttribute('aria-labelledby','kitchen-title');
  dialog.innerHTML=`<header class="kitchen-header"><div><span class="eyebrow">DAYU'S LITTLE KITCHEN</span><h2 id="kitchen-title">阁楼里的烟火气</h2><p>做点好吃的，把日子过得暖一点。</p></div><button class="icon-button kitchen-close" aria-label="关闭小厨房">${icon('close')}</button></header><nav class="kitchen-tabs" role="tablist" aria-label="小厨房"><button role="tab" id="kitchen-tab-fridge" aria-controls="kitchen-fridge" data-kitchen-tab="fridge">${icon('fridge')}小冰箱</button><button role="tab" id="kitchen-tab-cook" aria-controls="kitchen-cook" data-kitchen-tab="cook">${icon('pot')}做份简餐</button><button role="tab" id="kitchen-tab-table" aria-controls="kitchen-table" data-kitchen-tab="table">${icon('plate')}餐具与餐桌</button></nav><div class="kitchen-scroll"><section id="kitchen-fridge" role="tabpanel" aria-labelledby="kitchen-tab-fridge"><div class="fridge-summary"><span>${icon('snow')}今天也装得满满的</span><small id="fridge-stock-total"></small></div><div id="fridge-food-list"></div><div id="food-detail" class="food-detail"></div><div class="fridge-controls"><button id="fridge-restock" class="soft-button">${icon('box')}补满冰箱</button><button id="fridge-peek" class="soft-button">收起清单，看看冰箱${icon('arrow')}</button></div><p class="kitchen-fineprint">取用和做菜会消耗食材；空了可以随时补满。</p></section><section id="kitchen-cook" role="tabpanel" aria-labelledby="kitchen-tab-cook" hidden><p class="kitchen-intro">选一道喜欢的，大肥鱼会走到料理台旁准备。</p><div id="kitchen-recipes"></div></section><section id="kitchen-table" role="tabpanel" aria-labelledby="kitchen-tab-table" hidden><div class="table-illustration">${icon('plate')}${icon('cup')}${icon('pot')}</div><h3>给海风也留一个位置</h3><p class="kitchen-intro">两只小碗、两只瓷盘、杯子、汤匙和木筷。<br>餐后把它们收好，桌面就清清爽爽。</p><div class="table-controls"><button id="table-set" class="primary-button">${icon('plate')}摆好两套餐具</button><button id="table-clear" class="soft-button">${icon('box')}收好餐具</button><button id="sink-rinse" class="soft-button">${icon('water')}打开水龙头</button></div><p id="table-note" class="kitchen-intro"></p></section></div><footer class="kitchen-footer"><div class="kitchen-progress" aria-hidden="true"><i></i></div><span id="kitchen-status" role="status" aria-live="polite"></span></footer>`;
  document.body.append(dialog);const $=s=>dialog.querySelector(s);dialog.insertBefore($('#food-detail'),$('.kitchen-footer'));
  function save(){try{roomStorage.setItem(KITCHEN_KEY,JSON.stringify(state));saveOK=true}catch{saveOK=false}sync()}
  function sync(){model.setStock(state.stock);model.setTable(state.tableSet,state.dish);onChange(state);render()}
  function status(){return job?.phase==='walking'?'大肥鱼正在走到'+(job.kind==='cook'?'料理台':'小冰箱')+'旁…':job?.phase==='cooking'?'咕嘟咕嘟，正在准备'+job.recipe.name+'…':!saveOK?'本次变化暂存在页面中，浏览器未允许保存。':state.meals?'已经一起做过 '+state.meals+' 份好吃的。':'食材和餐桌的变化会自动记住。'}
  function render(){
    $('#food-detail').hidden=tab!=='fridge';
    dialog.querySelectorAll('[data-kitchen-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.kitchenTab===tab)));for(const id of['fridge','cook','table'])$('#kitchen-'+id).hidden=id!==tab;
    $('#fridge-stock-total').textContent=FOODS.filter(f=>state.stock[f.id]>0).length+' 种食物';
    $('#fridge-food-list').innerHTML=[...new Set(FOODS.map(f=>f.group))].map(group=>`<h3 class="food-group-title">${group}</h3><div class="food-grid">${FOODS.filter(f=>f.group===group).map(f=>`<button class="food-tile" data-food="${f.id}" aria-pressed="${selected===f.id}" aria-label="${f.name}，剩余 ${state.stock[f.id]} ${f.unit}">${foodArt(f)}<b>${f.name}</b><small>${state.stock[f.id]?state.stock[f.id]+' '+f.unit:'吃完啦'}</small></button>`).join('')}</div>`).join('');
    const f=FOODS.find(f=>f.id===selected);$('#food-detail').innerHTML=`<span>${foodArt(f)}</span><div><b>${f.name}</b><small>${readyToEat.has(f.id)?'拿一点，陪大肥鱼享受下午茶。':'新鲜食材，留给一顿热乎乎的简餐。'}</small></div><button class="soft-button" id="food-take" ${job||!state.stock[f.id]?'disabled':''}>${readyToEat.has(f.id)?'取一份':'去做菜'}</button>`;
    $('#kitchen-recipes').innerHTML=RECIPES.map(r=>{const missing=missingIngredients(state,r);return `<article class="recipe-card"><span class="recipe-icon">${icon(r.icon)}</span><div><h3>${r.name}</h3><p>${r.description}</p><div class="recipe-ingredients">${Object.entries(r.ingredients).map(([id,n])=>`<span class="${state.stock[id]<n?'missing':''}">${FOODS.find(f=>f.id===id).name} × ${n}</span>`).join('')}</div><button class="primary-button" data-recipe="${r.id}" ${job||missing.length?'disabled':''}>${missing.length?'缺少：'+missing.join('、'):'做一份'}</button></div></article>`}).join('');
    $('#table-note').textContent=state.dish?'桌上有一份'+RECIPES.find(r=>r.id===state.dish).name+'，慢慢享用吧。':state.tableSet?'餐具已经摆好，等一道好吃的。':'餐具已收好，桌面清清爽爽。';
    $('#table-clear').disabled=!!job||!state.tableSet;$('#table-set').disabled=!!job||state.tableSet;$('#fridge-restock').disabled=!!job;$('#kitchen-status').textContent=status();dialog.classList.toggle('is-cooking',job?.phase==='cooking');
  }
  function setTab(name){tab=name;model.setFridge(tab==='fridge');render();$('.kitchen-scroll').scrollTop=0}
  function close(peek=false){keepFridge=peek;dialog.close()}
  function open(name='fridge',foodId){if(!['fridge','cook','table'].includes(name))name='fridge';if(FOODS.some(f=>f.id===foodId))selected=foodId;setTab(name);if(!dialog.open){onFocus(name);dialog.showModal()}else onFocus(name);if(foodId)dialog.querySelector(`[data-food="${selected}"]`)?.scrollIntoView({block:'nearest'})}
  function cancelPending(){if(job?.phase==='walking'){job=null;render()}}
  function start(kind,recipe=null){
    if(job)return false;const f=FOODS.find(f=>f.id===selected);if(kind==='cook'&&missingIngredients(state,recipe).length)return false;if(kind==='snack'&&(!readyToEat.has(f.id)||state.stock[f.id]<=0))return false;
    close();const pending={kind,recipe,food:f,phase:'walking'};
    // goTo wakes the character, so register this new job after cancelling its old walk.
    const accepted=goTo(kind==='cook'?'cook':'fridge',()=>{if(job!==pending)return;if(kind==='cook'){if(missingIngredients(state,recipe).length){job=null;render();toast('食材不够了，先补满冰箱吧。');return}pending.phase='cooking';pending.remaining=recipe.seconds;model.setCooking(true);render();say('系好小围裙，开始准备'+recipe.name+'。')}else{if(state.stock[f.id]>0){state.stock[f.id]--;state.snacks++;say('取了一份'+f.name+'，留一点甜甜的好心情。');toast(f.name+'已取出。')}job=null;save()}});
    if(!accepted)return false;job=pending;render();return true;
  }
  dialog.addEventListener('click',e=>{const target=e.target.closest('button');if(!target||target.disabled)return;
    if(target.matches('.kitchen-close'))close();else if(target.dataset.kitchenTab){setTab(target.dataset.kitchenTab);onFocus(tab)}
    else if(target.dataset.food){selected=target.dataset.food;render();dialog.querySelector(`[data-food="${selected}"]`)?.focus({preventScroll:true})}
    else if(target.dataset.recipe)start('cook',RECIPES.find(r=>r.id===target.dataset.recipe));
    else if(target.id==='food-take'){if(readyToEat.has(selected))start('snack');else{setTab('cook');onFocus('cook')}}
    else if(target.id==='fridge-restock'){state.stock=freshKitchen().stock;save();toast('小冰箱补满啦，十二种食物都准备好了。')}
    else if(target.id==='fridge-peek')close(true);
    else if(target.id==='table-set'){state.tableSet=true;save();say('两套餐具摆好啦，一起慢慢吃。')}
    else if(target.id==='table-clear'){state.tableSet=false;state.dish=null;save();say('餐具收好了，桌面也清清爽爽。')}
    else if(target.id==='sink-rinse'){model.rinse();toast('水流轻轻落下，一会儿就会自动关好。')}
  });
  dialog.addEventListener('close',()=>{if(!keepFridge)model.setFridge(false);onBlur(keepFridge);keepFridge=false});
  function cancelAll(){job=null;model.setCooking(false);render()}
  function execute(value){
    if(job)throw new Error('厨房正在忙，请等当前事项完成');
    if(value==='fridge'){open('fridge');return 'done'}
    if(value.startsWith('cook-')){const recipe=RECIPES.find(r=>r.id===value.slice(5));if(!recipe)throw new Error('食谱不存在');if(missingIngredients(state,recipe).length)throw new Error('食材不足，请先补充冰箱');return start('cook',recipe)?'moving':false}
    if(value.startsWith('snack-')){selected=value.slice(6);if(!state.stock[selected])throw new Error('这份食物已经吃完');return start('snack')?'moving':false}
    if(value==='restock')state.stock=freshKitchen().stock;
    else if(value==='table-set')state.tableSet=true;
    else if(value==='table-clear'){state.tableSet=false;state.dish=null}
    else if(value==='rinse')model.rinse();
    else throw new Error('厨房事项不存在');
    save();return 'done';
  }
  sync();return{open,close,cancelPending,cancelAll,execute,get state(){return structuredClone(state)},get busy(){return !!job},get job(){return job?{kind:job.kind,phase:job.phase,remaining:job.remaining}:null},
    update(dt){if(job?.phase!=='cooking')return;job.remaining=Math.max(0,job.remaining-dt);$('.kitchen-progress i').style.width=(1-job.remaining/job.recipe.seconds)*100+'%';if(job.remaining===0){const recipe=job.recipe;job=null;model.setCooking(false);if(!useIngredients(state,recipe)){render();toast('食材不够了，先补满冰箱吧。');return}state.meals++;state.dish=recipe.id;state.tableSet=true;save();say(recipe.name+'做好啦，已经端到小餐桌上。',6);toast('开饭啦：'+recipe.name+'。')}},
  };
}
