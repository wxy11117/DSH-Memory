// Versioned categorical coordinates, not physical coordinates or embeddings.
export const CATALOG_VERSION = 1;
const entry = (vector, label, action, extra = {}) => Object.freeze({vector:Object.freeze(vector),label,...action,...extra});
export const ACTIONS = Object.freeze([
  entry([1,0,1],'回到一楼',{action:'view',value:'interior'}),
  entry([1,1,1],'去阳台看海',{action:'activity',value:'sea'}),
  entry([1,2,1],'上床休息',{action:'activity',value:'sleep'}),
  entry([1,3,1],'坐下喝茶',{action:'activity',value:'tea'}),
  entry([1,4,1],'去用电脑',{action:'activity',value:'computer'}),
  entry([1,4,2],'写电脑便签',{action:'note'},{requires:'text'}),
  entry([1,5,1],'喂小鱼',{action:'activity',value:'feed'}),
  entry([1,5,2],'给植物浇水',{action:'activity',value:'water'}),
  entry([1,6,1],'打开灯光',{action:'light',on:true}),
  entry([1,6,2],'关闭灯光',{action:'light',on:false}),
  entry([1,7,1],'晴天',{action:'weather',value:'sunny'}),
  entry([1,7,2],'多云',{action:'weather',value:'cloudy'}),
  entry([1,7,3],'小雨',{action:'weather',value:'rainy'}),
  entry([1,7,4],'飘雪',{action:'weather',value:'snowy'}),
  entry([1,8,1],'拉开窗帘',{action:'curtains',on:true}),
  entry([1,8,2],'拉上窗帘',{action:'curtains',on:false}),
  entry([2,0,1],'来到阁楼',{action:'view',value:'attic'}),
  entry([2,1,1],'打开冰箱清单',{action:'kitchen',value:'fridge'}),
  entry([2,1,2],'补满虚拟冰箱',{action:'kitchen',value:'restock'}),
  entry([2,1,3],'取一份牛奶',{action:'kitchen',value:'snack-milk'}),
  entry([2,1,4],'取一个苹果',{action:'kitchen',value:'snack-apple'}),
  entry([2,2,1],'制作莓果酸奶杯',{action:'kitchen',value:'cook-berry'}),
  entry([2,2,2],'制作奶香芝士煎蛋',{action:'kitchen',value:'cook-omelette'}),
  entry([2,2,3],'制作海湾蔬菜汤',{action:'kitchen',value:'cook-soup'}),
  entry([2,3,1],'摆好餐具',{action:'kitchen',value:'table-set'}),
  entry([2,3,2],'收好餐具',{action:'kitchen',value:'table-clear'}),
  entry([2,3,3],'水槽冲洗',{action:'kitchen',value:'rinse'}),
  entry([2,4,1],'打开望远镜看海',{action:'observe',value:'sea'}),
  entry([2,4,2],'打开望远镜看星空',{action:'observe',value:'sky'}),
]);
const GROUPS = {1:{0:'楼层',1:'看海',2:'休息',3:'喝茶',4:'电脑',5:'照料',6:'灯光',7:'天气',8:'窗帘'},2:{0:'楼层',1:'冰箱',2:'料理',3:'餐桌与水槽',4:'望远镜'}};
export function actionCatalog({floor,activity}={}) {
  if(floor!==undefined&&![1,2].includes(floor))throw new Error('楼层只支持 1（一楼）或 2（阁楼）');
  if(activity!==undefined&&(!Number.isInteger(activity)||floor===undefined||!Object.hasOwn(GROUPS[floor],activity)))throw new Error('请先选择有效楼层和活动编号');
  const rows=ACTIONS.filter(a=>(floor===undefined||a.vector[0]===floor)&&(activity===undefined||a.vector[1]===activity));
  return {version:CATALOG_VERSION,meaning:['楼层','活动','事项'],floors:[{id:1,name:'一楼',groups:GROUPS[1]},{id:2,name:'阁楼',groups:GROUPS[2]}],
    actions:floor===undefined?undefined:rows.map(({vector,label,requires})=>({vector,label,...(requires?{requires}:{})})),
    examples:floor===undefined?[{vector:[1,1,1],label:'去阳台看海'},{vector:[2,2,1],label:'制作莓果酸奶杯'}]:undefined};
}
export function resolveVector(input) {
  if(input.vector===undefined)return input;
  if(input.action!==undefined)throw new Error('vector 和 action 只能选择一种');
  if(input.vectorVersion!==undefined&&input.vectorVersion!==CATALOG_VERSION)throw new Error('动作目录版本不匹配，请调用 hp_room_catalog');
  if(!Array.isArray(input.vector)||input.vector.length!==3||!input.vector.every(Number.isInteger))throw new Error('vector 必须是三个整数：[楼层,活动,事项]');
  const item=ACTIONS.find(a=>a.vector.every((v,i)=>v===input.vector[i]));
  if(!item)throw new Error('这个动作编号不存在，请调用 hp_room_catalog 查询');
  if(Object.keys(input).some(k=>!['vector','vectorVersion','text','runId'].includes(k)))throw new Error('向量动作含有多余参数');
  if(item.requires==='text'&&typeof input.text!=='string')throw new Error('这个动作还需要 text');
  if(!item.requires&&input.text!==undefined)throw new Error('这个动作不需要 text');
  const {label,requires,...command}=item;
  return {...command,...(requires?{text:input.text}:{}),vector:[...item.vector],vectorVersion:CATALOG_VERSION};
}
