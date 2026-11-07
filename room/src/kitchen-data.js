export const KITCHEN_KEY='dayu.kitchen.v1';
export const FOODS=[
  {id:'milk',name:'鲜牛奶',group:'奶蛋与乳品',amount:2,unit:'瓶',color:'#dce9df'},
  {id:'eggs',name:'新鲜鸡蛋',group:'奶蛋与乳品',amount:6,unit:'枚',color:'#ebd6b8'},
  {id:'cheese',name:'奶香芝士',group:'奶蛋与乳品',amount:3,unit:'份',color:'#e9c577'},
  {id:'yogurt',name:'原味酸奶',group:'奶蛋与乳品',amount:3,unit:'杯',color:'#c7dce7'},
  {id:'apple',name:'红苹果',group:'水果与饮品',amount:4,unit:'个',color:'#d58f7e'},
  {id:'strawberry',name:'草莓',group:'水果与饮品',amount:6,unit:'颗',color:'#db948f'},
  {id:'juice',name:'橙子果汁',group:'水果与饮品',amount:2,unit:'瓶',color:'#e9bc75'},
  {id:'carrot',name:'小胡萝卜',group:'蔬菜与海鲜',amount:4,unit:'根',color:'#deaa79'},
  {id:'greens',name:'嫩生菜',group:'蔬菜与海鲜',amount:3,unit:'份',color:'#a6bd91'},
  {id:'fish',name:'海鱼',group:'蔬菜与海鲜',amount:2,unit:'份',color:'#9bbbc6'},
  {id:'shrimp',name:'鲜虾',group:'蔬菜与海鲜',amount:4,unit:'只',color:'#dfa899'},
  {id:'icecream',name:'香草冰淇淋',group:'小小冷冻格',amount:3,unit:'杯',color:'#d8c8df'},
];
export const RECIPES=[
  {id:'berry',name:'莓果酸奶杯',description:'酸奶打底，放上刚洗好的草莓。',ingredients:{yogurt:1,strawberry:2},seconds:4,icon:'cup'},
  {id:'omelette',name:'奶香芝士煎蛋',description:'小火慢煎，留住软软的奶香。',ingredients:{eggs:2,cheese:1,milk:1},seconds:5,icon:'pan'},
  {id:'soup',name:'海湾蔬菜汤',description:'海鱼、鲜虾和蔬菜，一起咕嘟咕嘟。',ingredients:{fish:1,shrimp:2,carrot:1,greens:1},seconds:6,icon:'pot'},
];
export const KITCHEN_ITEMS=[
  {id:'loft-counter',x:-1.25,z:-3.25,w:2.8,d:1.02},
  {id:'loft-fridge',x:1.05,z:-3.2,w:1.14,d:1.06},
  // The door's swept area stays clear even while the refrigerator is closed.
  {id:'loft-fridge-door',x:1.4,z:-2.03,w:1.4,d:1.25},
  {id:'loft-dining',x:0,z:.3,w:2.55,d:1.05},
];
export const KITCHEN_SPOTS={fridge:{x:1.35,z:-.95},cook:{x:-.35,z:-1.8},table:{x:0,z:1.35}};
export function freshKitchen(){return{version:1,stock:Object.fromEntries(FOODS.map(f=>[f.id,f.amount])),meals:0,snacks:0,tableSet:true,dish:null}}
export function validateKitchen(value){const state=freshKitchen();if(!value||value.version!==1)return state;for(const f of FOODS){const n=value.stock?.[f.id];if(Number.isFinite(n))state.stock[f.id]=Math.max(0,Math.min(f.amount,Math.floor(n)))}for(const key of['meals','snacks'])if(Number.isSafeInteger(value[key])&&value[key]>=0)state[key]=value[key];state.tableSet=value.tableSet===true;state.dish=RECIPES.some(r=>r.id===value.dish)?value.dish:null;return state}
export function missingIngredients(state,recipe){return Object.entries(recipe.ingredients).filter(([id,n])=>(state.stock[id]??0)<n).map(([id])=>FOODS.find(f=>f.id===id).name)}
export function useIngredients(state,recipe){if(missingIngredients(state,recipe).length)return false;for(const[id,n]of Object.entries(recipe.ingredients))state.stock[id]-=n;return true}
