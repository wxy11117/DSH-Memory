// 海马体式记忆 v4 —— 照人类记忆的样子做，而不是照数据库的样子做。
//
// v1–v3 的问题是「像档案柜」：分层、到期、掷骰，都是离散的开关。
// 人的记忆是连续的：
//
//   1. 遗忘曲线（Ebbinghaus）：留存 R(t) = exp(-Δ / S)。不是「7 天后归零」，
//      而是第 1 天掉一半、第 3 天掉到两成——所以「模糊」是先发生的。
//   2. 间隔效应（spacing effect）：每次被成功想起，稳定性 S 乘以 1.6。
//      所以隔三差五被提起的事会越记越牢，一次都没被想起的事会很快散掉。
//   3. 提取诱发遗忘（RIF）：想起 A 的时候，同一类的竞争项会暂时变弱——
//      这就是「想起一件事，另一件反而想不起来了」。
//   4. 情绪唤醒（amygdala）：情绪强的事 S 更大；「第一次/最难忘」这类
//      闪光灯记忆再加一档。
//   5. 前瞻记忆（prospective）：答应过「到时候提醒你」的事，到点会自己冒出来。
//   6. 编码闸门（attention）：不是所有事都进记忆。流水账当场就不写。
//
// 分层仍然保留，但它不再是「存放位置」，而是**稳定性的档位**——
// 换句话说，层级是结果，不是原因。这正是人类记忆的样子。

export const TIER_ORDER = ['instant', 'short', 'long', 'permanent'];

export const TIER_LABEL = {
  instant: '瞬时记忆',
  short: '短期记忆',
  long: '长期记忆',
  permanent: '永久记忆'
};

/** 各层的稳定性门槛（小时）：S 落在哪个区间就叫哪一层。 */
export const TIER_BY_HOURS = [
  { tier: 'permanent', min: 720 },  // ≥ 30 天
  { tier: 'long', min: 72 },        // ≥ 3 天
  { tier: 'short', min: 4 },        // ≥ 4 小时
  { tier: 'instant', min: 0 }
];

/** 兼容旧调用：层的名义寿命（小时）。 */
export const TIER_TTL_HOURS = { instant: 4, short: 72, long: 720, permanent: null };

/** 注入条数上限 / 条目上限。 */
const TIER_INJECT = { instant: 5, short: 6, long: 8, permanent: 12 };
const TIER_CAP = { instant: 60, short: 150, long: 240, permanent: 400 };
const ARCHIVE_CAP = 600;
/** 「我认识的人」每轮最多几条：人是记忆的一等公民，不该和「吃」「看片」抢配额。 */
const PERSON_INJECT = 5;
/** 按话头检索的条数（替代按层配额发牌）。 */
const RETRIEVE_N = 8;
/** 检索里永远留几条「底子」：永久层里最重的，不管话题对不对都跟着。 */
const BASE_KEEP = 2;
/** 检索最少给几条：捞不到就拿「最清楚的那几条」补位，别答得像失忆。 */
const RETRIEVE_FLOOR = 4;
/** 「不能忘的」：钉住的关键事实每轮最多带几条（按重要度取，不占层的配额）。 */
const PIN_INJECT = 8;

/** 留存低于这个值算「想不起来了」：不再注入，到期清算时决定丢还是归档。 */
export const FORGET_THRESHOLD = 0.06;
/** 留存高于这个值仍算「清楚」，不值得当成「回忆」去回味。 */
export const CLEAR_THRESHOLD = 0.9;
/** 每次成功想起，稳定性乘这个数（间隔效应）。 */
const SPACING_GAIN = 1.6;
/** 每次被同类回忆压制，稳定性乘这个数（提取诱发遗忘）。 */
const RIF_SUPPRESS = 0.88;
/** 每天回忆几条。 */
export const RECALL_COUNT = 3;
/** 21 点之后才算「今天该回忆了」。 */
export const RECALL_HOUR = 21;

/**
 * 类别基线：基础稳定性（小时）、情绪敏感度。
 * 「流水类」S 很小，两三个小时就淡得只剩轮廓；约定类 S 极大，几乎不会忘。
 */
export const CATEGORIES = {
  daily: { label: '日常', baseHours: 3, tier: 'instant' },
  watch: { label: '看片', baseHours: 2, tier: 'instant' },
  food: { label: '吃', baseHours: 10, tier: 'short' },
  place: { label: '地方', baseHours: 12, tier: 'short' },
  event: { label: '事件', baseHours: 40, tier: 'long' },
  person: { label: '人', baseHours: 240, tier: 'long' },
  feeling: { label: '情绪', baseHours: 50, tier: 'long' },
  study: { label: '学习', baseHours: 80, tier: 'long' },
  promise: { label: '约定', baseHours: 8000, tier: 'permanent' },
  self: { label: '自我', baseHours: 20000, tier: 'permanent' },
  misc: { label: '杂项', baseHours: 20, tier: 'short' }
};

const CATEGORY_RULES = [
  { cat: 'promise', kw: ['答应', '约定', '说好', '别忘', '记住', '底线', '不许', '答应过', '承诺', '提醒我'] },
  { cat: 'self', kw: ['我是', '我喜欢', '我讨厌', '我怕', '我的性格', '我不喜欢', '我想要'] },
  { cat: 'study', kw: ['考试', '复习', '备考', '作业', '论文', '项目', '上课', '实习', '面试', '答辩', '报告'] },
  { cat: 'feeling', kw: ['难过', '开心', '高兴', '生气', '委屈', '累', '孤独', '舍不得', '感动', '焦虑', '紧张', '想哭'] },
  { cat: 'person', kw: ['妈妈', '爸爸', '爸妈', '家人', '老婆', '老公', '对象', '男朋友', '女朋友', '同学', '老师', '室友', '朋友', '老板', '同事', '客户', '主人', '姐姐', '哥哥', '妹妹', '弟弟', '阿姨', '叔叔', '闺蜜', '网友', '邻居', '过敏'] },
  { cat: 'food', kw: ['吃', '饭', '面', '火锅', '奶茶', '咖啡', '烧烤', '早饭', '午饭', '晚饭', '夜宵', '点外卖', '好吃'] },
  { cat: 'place', kw: ['去了', '逛', '旅行', '公园', '商场', '图书馆', '医院', '车站', '海边'] },
  { cat: 'watch', kw: ['刷到', '看了个视频', '刷视频', '刷抖音', '刷B站', '看片', '番剧', '短视频', '直播'] },
  { cat: 'event', kw: ['第一次', '头一次', '突然', '后来', '结果', '发生', '碰到', '遇到'] }
];

const SALIENCE_BOOST = [
  { re: /第一次|头一回|头一次|从没|再也没有/, add: 26, tag: '第一次', arousal: 0.6 },
  { re: /最(好|棒|开心|难忘|好吃)|特别|格外|非常|超级|印象(很)?深|难忘/, add: 22, tag: '特别', arousal: 0.5 },
  { re: /答应|约定|说好|别忘|记住|承诺|提醒/, add: 20, tag: '约定', arousal: 0.3 },
  { re: /难过|哭|委屈|舍不得|后悔|生气|害怕|心跳/, add: 16, tag: '情绪', arousal: 0.7 },
  { re: /\d{2,}|三天|两周|半年|一整(天|夜)/, add: 5, tag: '具体', arousal: 0 },
  { re: /一辈子|永远|以后都|从此/, add: 12, tag: '长期', arousal: 0.4 }
];

const SALIENCE_DECAY = [
  { re: /刷到|刷视频|刷抖音|刷B站|又看|随便看|顺手/, add: -14 },
  { re: /吃了(个|碗|份)?(饭|面|包子|外卖)/, add: -10 },
  { re: /没什么|还行|一般|照旧|老样子|日常/, add: -12 }
];

const STOP_BIGRAMS = new Set([
  '今天', '昨天', '明天', '后天', '早上', '中午', '晚上', '现在', '刚才', '时候',
  '一个', '什么', '怎么', '这个', '那个', '这样', '那样', '这些', '那些', '一样',
  '就是', '可以', '我们', '他们', '你们', '自己', '但是', '因为', '所以', '然后',
  '还是', '已经', '没有', '真的', '觉得', '感觉', '有点', '不是', '还有', '不过',
  '其实', '如果', '应该', '一点', '一下', '可能', '知道', '想不',
  // 时间词不进关系网：它们几乎出现在每一句话里，会把水波搅成一团（2026-10-28 实测：「今晚」成了最亮的词头）。
  '今晚', '昨晚', '今早', '明早', '前任', '凌晨', '半夜', '上午', '下午', '今年', '去年', '明年', '刚刚', '一直', '马上', '上次', '下次', '每天',
  // 泛用名词同样不进关系网：它们能拼进任何句子，会把语义归纳搅成「『东西』这类事发生过 3 次」（2026-10-29 实测）。
  '东西', '事儿', '事情', '地方', '样子', '方式', '玩意', '一类', '这类', '那次', '这次'
]);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function newId() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const HOUR = 60 * 60 * 1000;

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function agoText(ts, now = Date.now()) {
  const ms = Number(ts) || 0;
  if (!ms) return '';
  const diff = now - ms;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < HOUR) return `${Math.round(diff / 60000)} 分钟前`;
  if (diff < 24 * HOUR) return `${Math.round(diff / HOUR)} 小时前`;
  return `${Math.round(diff / (24 * HOUR))} 天前`;
}

export function classify(text) {
  const s = String(text || '');
  let best = { cat: 'misc', hits: 0 };
  for (const rule of CATEGORY_RULES) {
    let hits = 0;
    for (const kw of rule.kw) if (s.includes(kw)) hits += 1;
    if (hits > best.hits) best = { cat: rule.cat, hits };
  }
  return best.cat;
}

export function valenceOf(text) {
  const s = String(text || '');
  if (/难过|哭|委屈|舍不得|后悔|生气|害怕|分手|吵架|失败/.test(s)) return 'bad';
  if (/开心|高兴|喜欢|好吃|好玩|很棒|舒服|感动|惊喜/.test(s)) return 'good';
  return 'neutral';
}

/** 情绪唤醒度 0–1：越强的事件记得越牢（扁桃体调制）。 */
export function arousalOf(text) {
  const s = String(text || '');
  let a = 0;
  for (const rule of SALIENCE_BOOST) if (rule.arousal && rule.re.test(s)) a = Math.max(a, rule.arousal);
  if (/[!！]{2,}/.test(s)) a = Math.max(a, 0.5);
  return clamp(a, 0, 1);
}

export function scoreMemory(text, category) {
  const s = String(text || '');
  const cat = CATEGORIES[category] ? category : classify(s);
  let score = CATEGORIES[cat].baseHours >= 720 ? 70 : 30;
  const tags = [];
  for (const rule of SALIENCE_BOOST) {
    if (rule.re.test(s)) {
      score += rule.add;
      if (rule.tag) tags.push(rule.tag);
    }
  }
  for (const rule of SALIENCE_DECAY) if (rule.re.test(s)) score += rule.add;
  if (s.length >= 40) score += 6;
  if (s.length <= 8) score -= 8;
  return { salience: clamp(Math.round(score), 0, 100), category: cat, valence: valenceOf(s), arousal: arousalOf(s), tags };
}

/** 初始稳定性（小时）：类别的底 × 重要度 × 情绪。 */
export function baseStability(category, salience, arousal = 0) {
  const cat = CATEGORIES[category] || CATEGORIES.misc;
  const s = clamp(salience == null ? 40 : salience, 0, 100);
  const a = clamp(arousal, 0, 1);
  let hours = cat.baseHours * (0.45 + (s / 100) * 1.25) * (1 + a * 0.65);
  // 情景类（吃、去过哪）至少能撑一天——「中午吃了一顿饭」不该下午就散。
  if (['food', 'place'].includes(category)) hours = Math.max(hours, 14);
  return clamp(hours, 0.5, 60000);
}

/** 由稳定性反推层级（层级是结果，不是原因）。 */
export function tierForStability(hours) {
  for (const row of TIER_BY_HOURS) if (hours >= row.min) return row.tier;
  return 'instant';
}

/** 兼容旧接口：由重要度给个层。 */
export function tierForSalience(salience) {
  const n = Number(salience) || 0;
  if (n >= 85) return 'permanent';
  if (n >= 58) return 'long';
  if (n >= 35) return 'short';
  return 'instant';
}

export function ensureBrain(st) {
  if (!st || typeof st !== 'object') return null;
  if (!st.brain || typeof st.brain !== 'object') st.brain = {};
  const b = st.brain;
  if (!Array.isArray(b.items)) b.items = [];
  if (!Array.isArray(b.archive)) b.archive = [];
  if (!b.recall || typeof b.recall !== 'object') b.recall = {};
  // 墓碑：删掉的东西必须留下「删过」这件事，否则合并时会被另一边的旧副本复活。
  if (!b.tombstones || typeof b.tombstones !== 'object') b.tombstones = {};
  return b;
}

function lastTouchOf(it) {
  return Math.max(Number(it.updatedAt) || 0, Number(it.lastRecalledAt) || 0, Number(it.createdAt) || 0) || Date.now();
}

/**
 * 留存强度 R（0–1）：遗忘曲线的现值。
 * 这是整套记忆里最核心的一个数——注入、回忆、遗忘都看它。
 */
export function retentionOf(it, now = Date.now()) {
  if (!it) return 0;
  const hours = Math.max(0.1, Number(it.stabilityHours) || baseStability(it.category, it.salience, it.arousal));
  const deltaH = Math.max(0, now - lastTouchOf(it)) / HOUR;
  const r = Math.exp(-deltaH / hours);
  return clamp(r, 0, 1);
}

/** 兼容旧名。 */
export function strengthOf(it, now = Date.now()) {
  return retentionOf(it, now);
}

function stabilize(it, gain = 1) {
  const base = Number(it.stabilityHours) || baseStability(it.category, it.salience, it.arousal);
  it.stabilityHours = clamp(base * gain, 0.5, 60000);
  it.tier = tierForStability(it.stabilityHours);
}

/**
 * 编码闸门：不是所有事都配进记忆。
 * 流水（刷视频、随便吃一顿）当场不写——人的海马体也不会为每帧画面开工。
 */
export function shouldEncode(text, category, salience, source) {
  if (CATEGORIES[category]?.baseHours >= 720) return true;
  // 只有「刷过去的」和「日常流水」会被当场挡掉；吃饭、去过哪、发生了什么都是情景记忆，该留。
  if (['daily', 'watch'].includes(category)) return Number(salience) >= 12;
  return true;
}

/**
 * 记一条。
 * @param {object} st 会话状态
 * @param {{text:string, tier?:string, salience?:number, category?:string, tags?:string[], source?:string, remindAt?:number, arousal?:number}} input
 */
export function remember(st, input = {}) {
  const b = ensureBrain(st);
  if (!b) return null;
  const text = String(input.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!text) return null;

  const scored = scoreMemory(text, input.category);
  const salience = input.salience == null ? scored.salience : clamp(input.salience, 0, 100);
  const category = CATEGORIES[input.category] ? input.category : scored.category;
  const arousal = input.arousal == null ? scored.arousal : clamp(input.arousal, 0, 1);
  if (!shouldEncode(text, category, salience, input.source)) return null;

  const now = Date.now();
  const tags = Array.from(new Set([
    ...(Array.isArray(input.tags) ? input.tags.map((t) => String(t).slice(0, 20)) : []),
    ...scored.tags
  ])).slice(0, 8);

  // 去重：相近 → 累加强度（复述巩固），而不是塞第二份。
  const head = text.slice(0, 20);
  const dup = b.items.find((i) => i && String(i.text || '').slice(0, 20) === head);
  if (dup) {
    dup.hits = (Number(dup.hits) || 1) + 1;
    dup.salience = Math.max(Number(dup.salience) || 0, salience);
    dup.updatedAt = now;
    stabilize(dup, 1 + (SPACING_GAIN - 1) * 0.5);
    if (tags.length) dup.tags = Array.from(new Set([...(dup.tags || []), ...tags])).slice(0, 8);
    learnWeb(b, dup, now);
    return dup;
  }

  const stabilityHours = input.tier && TIER_TTL_HOURS[input.tier] != null && input.tier !== 'instant'
    ? Math.max(baseStability(category, salience, arousal), TIER_TTL_HOURS[input.tier] * 0.5)
    : baseStability(category, salience, arousal);

  const item = {
    id: newId(),
    tier: tierForStability(stabilityHours),
    category,
    valence: scored.valence,
    arousal,
    sealed: false,
    text,
    salience,
    tags,
    source: String(input.source || 'chat').slice(0, 20),
    stabilityHours,
    createdAt: now,
    updatedAt: now,
    lastRecalledAt: 0,
    recallCount: 0,
    hits: 1,
    missCount: 0,
    remindAt: Number(input.remindAt) > 0 ? Number(input.remindAt) : null,
    remindedAt: null
  };
  b.items.push(item);
  learnWeb(b, item, now);
  enforceCap(b, item.tier);
  pruneCategoryNoise(b, category, now);
  return item;
}

function enforceCap(b, tier) {
  const cap = TIER_CAP[tier] || 200;
  const same = b.items.filter((i) => i && i.tier === tier);
  if (same.length <= cap) return 0;
  same.sort((x, y) => retentionOf(x) - retentionOf(y));
  const drop = new Set(same.slice(0, same.length - cap).map((i) => i.id));
  b.items = b.items.filter((i) => !drop.has(i.id));
  return drop.size;
}

function pruneCategoryNoise(b, category, now) {
  if (!['daily', 'watch'].includes(category)) return 0;
  const same = b.items.filter((i) => i && i.category === category);
  const cap = 20;
  if (same.length <= cap) return 0;
  same.sort((x, y) => retentionOf(y, now) - retentionOf(x, now));
  const keep = new Set(same.slice(0, cap).map((i) => i.id));
  const drop = same.filter((i) => !keep.has(i.id)).map((i) => i.id);
  b.items = b.items.filter((i) => !drop.includes(i.id));
  return drop.length;
}

export function setTier(st, id, tier) {
  const b = ensureBrain(st);
  if (!b || !TIER_ORDER.includes(tier)) return null;
  const it = b.items.find((i) => i && i.id === id);
  if (!it) return null;
  const target = { instant: 3, short: 24, long: 240, permanent: 8760 }[tier];
  it.stabilityHours = target;
  it.updatedAt = Date.now();
  it.tier = tier;
  return it;
}

export function forget(st, id, now = Date.now()) {
  const b = ensureBrain(st);
  if (!b) return false;
  const before = b.items.length;
  b.items = b.items.filter((i) => i && i.id !== id);
  const dropped = b.items.length !== before;
  if (dropped) {
    // 墓碑：记下「这个 id 在某时刻被删了」。合并时晚于条目的墓碑说了算。
    b.tombstones[id] = now;
    // 归档里同 id 的也要抹掉，否则 merge 会把它从 archive 里再捡回来。
    b.archive = b.archive.filter((i) => i && i.id !== id);
  }
  return dropped;
}

export function pin(st, id, pinned = true) {
  const b = ensureBrain(st);
  if (!b) return null;
  const it = b.items.find((i) => i && i.id === id);
  if (!it) return null;
  it.pinned = !!pinned;
  it.updatedAt = Date.now();
  return it;
}

function normBrainForMerge(x) {
  if (!x || typeof x !== 'object') return { items: [], archive: [], recall: {}, web: { words: {}, edges: {} }, tombstones: {} };
  const keep = (l) => (Array.isArray(l) ? l.filter((i) => i && typeof i === 'object' && i.id) : []);
  const web = x.web && typeof x.web === 'object' ? x.web : {};
  return {
    items: keep(x.items),
    archive: keep(x.archive),
    recall: x.recall && typeof x.recall === 'object' ? x.recall : {},
    web: { words: web.words && typeof web.words === 'object' ? web.words : {}, edges: web.edges && typeof web.edges === 'object' ? web.edges : {} },
    tombstones: x.tombstones && typeof x.tombstones === 'object' ? x.tombstones : {}
  };
}

function mergeScoreOf(it) {
  // 顺序就是优先级：改过几次 > 最后改动时间 > 想起过几次 > 最后碰它
  return [
    Number(it?.reviseCount) || 0,
    Number(it?.updatedAt) || 0,
    Number(it?.hits) || 0,
    Number(it?.lastAt ?? it?.touchedAt ?? it?.createdAt) || 0
  ];
}

function mergePickNewer(x, y) {
  const sx = mergeScoreOf(x);
  const sy = mergeScoreOf(y);
  for (let i = 0; i < sx.length; i += 1) {
    if (sx[i] !== sy[i]) return sx[i] > sy[i] ? x : y;
  }
  return x;
}

function mergeOneItem(x, y) {
  const win = mergePickNewer(x, y);
  const out = { ...win };
  // 单调事实：任一边成立就永远成立，合并不能把它们抹掉。
  if (x.pinned || y.pinned) out.pinned = true;
  if (x.sealed || y.sealed) out.sealed = true;
  out.archivedAt = Math.max(Number(x.archivedAt) || 0, Number(y.archivedAt) || 0) || out.archivedAt;
  out.hits = Math.max(Number(x.hits) || 0, Number(y.hits) || 0) || out.hits;
  out.lastAt = Math.max(Number(x.lastAt) || 0, Number(y.lastAt) || 0) || out.lastAt;
  out.salience = Math.max(Number(x.salience) || 0, Number(y.salience) || 0) || out.salience;
  // 订正留痕取并集：同一条被两边各改过一次时，两份留痕都要在。
  const rx = Array.isArray(x.revisions) ? x.revisions : [];
  const ry = Array.isArray(y.revisions) ? y.revisions : [];
  if (rx.length || ry.length) {
    const seen = new Set();
    out.revisions = [...rx, ...ry]
      .filter((r) => r && r.at)
      .sort((m, n) => Number(m.at) - Number(n.at))
      .filter((r) => {
        if (seen.has(r.at)) return false;
        seen.add(r.at);
        return true;
      })
      .slice(-10);
  }
  return out;
}

/**
 * 合并两份 brain。原则：**合并的是「最新的语义状态」，不是「谁更响」。**
 * · 墓碑优先：删掉的条目不会被另一边的旧副本复活；
 * · 同 id 取「改得多、改得晚」的那份（旧副本不得盖掉新订正）；
 * · pinned / sealed / archivedAt 是单调事实，任一边有就保留；
 * · 归档与活条目互斥：已经在活条目里的，不再留在归档里。
 */
export function mergeBrains(a, b) {
  const A = normBrainForMerge(a);
  const B = normBrainForMerge(b);
  const tombstones = { ...A.tombstones };
  for (const [id, at] of Object.entries(B.tombstones)) tombstones[id] = Math.max(Number(tombstones[id]) || 0, Number(at) || 0);
  const isBuried = (it) => {
    const t = Number(tombstones[it.id]) || 0;
    if (!t) return false;
    const upd = Math.max(Number(it.updatedAt) || 0, Number(it.createdAt) || 0);
    return t >= upd;
  };
  const items = new Map();
  for (const it of [...A.items, ...B.items]) {
    if (isBuried(it)) continue;
    const cur = items.get(it.id);
    items.set(it.id, cur ? mergeOneItem(cur, it) : { ...it });
  }
  const archive = new Map();
  for (const it of [...A.archive, ...B.archive]) {
    if (isBuried(it)) continue;
    const cur = archive.get(it.id);
    archive.set(it.id, cur ? mergeOneItem(cur, it) : { ...it });
  }
  // 归档与活条目互斥，判定看「状态转换的时间」而不是谁在哪个数组里：
  // 归档时间晚于活条目的最后改动 → 它确实已经沉下去了，别因为另一边的旧副本又把它捞起来。
  for (const [id, live] of [...items]) {
    const arch = archive.get(id);
    if (!arch) continue;
    const liveAt = Math.max(Number(live.updatedAt) || 0, Number(live.createdAt) || 0);
    const archAt = Math.max(Number(arch.archivedAt) || 0, Number(arch.updatedAt) || 0);
    if (archAt >= liveAt) items.delete(id);
    else archive.delete(id);
  }
  const recall = String(A.recall?.date || '') >= String(B.recall?.date || '') ? A.recall : B.recall;
  const words = { ...A.web.words };
  for (const [w, v] of Object.entries(B.web.words)) {
    const cur = words[w];
    if (!cur || Number(v?.w) > Number(cur?.w)) words[w] = v;
  }
  const edges = { ...A.web.edges };
  for (const [k, v] of Object.entries(B.web.edges)) {
    const cur = edges[k];
    if (!cur || Number(v?.w) > Number(cur?.w)) edges[k] = v;
  }
  return { items: [...items.values()], archive: [...archive.values()], recall, web: { words, edges }, tombstones };
}

export function sealMemory(st, id, sealed = true) {
  const b = ensureBrain(st);
  if (!b) return null;
  const it = b.items.find((i) => i && i.id === id);
  if (!it) return null;
  it.sealed = !!sealed;
  it.updatedAt = Date.now();
  return it;
}

/** 提取诱发遗忘：想起一条，同类的其它条目暂时被压制。 */
export function retrievalInducedForgetting(st, item, now = Date.now(), factor = RIF_SUPPRESS) {
  const b = ensureBrain(st);
  if (!b || !item) return 0;
  let n = 0;
  for (const it of b.items) {
    if (it === item || !it || it.category !== item.category) continue;
    it.stabilityHours = clamp((Number(it.stabilityHours) || baseStability(it.category, it.salience, it.arousal)) * factor, 0.3, 60000);
    it.suppressedAt = now;
    n += 1;
  }
  return n;
}

/** 成功想起一次：稳定性 ×1.6（间隔效应），并压制同类竞争项。 */
export function reinforce(it, now = Date.now()) {
  if (!it) return;
  it.hits = (Number(it.hits) || 1) + 1;
  it.recallCount = (Number(it.recallCount) || 0) + 1;
  it.lastRecalledAt = now;
  it.updatedAt = now;
  it.missCount = 0;
  stabilize(it, SPACING_GAIN);
}

export function reclassify(st, now = Date.now()) {
  const b = ensureBrain(st);
  if (!b) return { updated: 0 };
  let updated = 0;
  for (const it of b.items) {
    if (!it || typeof it !== 'object') continue;
    if (!CATEGORIES[it.category]) { it.category = classify(it.text); updated += 1; }
    if (!Number.isFinite(Number(it.salience)) || Number(it.salience) <= 0) {
      it.salience = scoreMemory(it.text, it.category).salience;
      updated += 1;
    }
    if (!Number.isFinite(Number(it.stabilityHours))) {
      it.stabilityHours = baseStability(it.category, it.salience, it.arousal);
      updated += 1;
    }
    const tier = tierForStability(Number(it.stabilityHours));
    if (it.tier !== tier) { it.tier = tier; updated += 1; }
  }
  return { updated };
}

/**
 * 清算：按遗忘曲线把已经淡到看不见的条目丢掉或归档。
 * 不再有「到期」这种硬边界——只有 R 掉到阈值以下。
 */
export function sweep(st, now = Date.now(), opts = {}) {
  const b = ensureBrain(st);
  const out = { forgotten: 0, archived: 0, kept: 0, promoted: 0 };
  if (!b) return out;
  reclassify(st, now);
  const keep = [];
  for (const it of b.items) {
    if (!it || !TIER_ORDER.includes(it.tier)) continue;
    // 钉住的关键事实不吃遗忘曲线：这是「保留策略」唯一的硬保证。
    if (it.pinned) {
      keep.push(it);
      continue;
    }
    const r = retentionOf(it, now);
    if (r >= FORGET_THRESHOLD) {
      keep.push(it);
      continue;
    }
    if (it.sealed || Number(it.stabilityHours) >= 72) {
      it.archivedAt = now;
      b.archive.push(it);
      out.archived += 1;
    } else {
      out.forgotten += 1;
    }
  }
  b.items = keep;
  // 稳定性上去了，层也就跟着上去——这是「巩固」的结果而不是开关。
  for (const it of b.items) {
    const tier = tierForStability(Number(it.stabilityHours) || 0);
    if (TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(it.tier)) {
      it.tier = tier;
      out.promoted += 1;
    }
  }
  if (b.archive.length > ARCHIVE_CAP) b.archive = b.archive.slice(-ARCHIVE_CAP);
  // 记够几件同类的事，就该熬出一条「懂的事」——巩固的最后一步。
  purgeNoiseWords(b);
  const sem = semanticize(st, now, opts);
  out.semantic = sem.created;
  out.semanticized = sem.archived;
  out.semanticKept = sem.reinforced;
  out.kept = b.items.length;
  return out;
}

export function byCategory(st, category, limit = 5) {
  const b = ensureBrain(st);
  if (!b) return [];
  return b.items
    .filter((i) => i && i.category === category && !i.sealed)
    .sort((x, y) => retentionOf(y) - retentionOf(x))
    .slice(0, limit);
}

/** 语义化的门限：同一类别里同一件事被记到这么多次，就该"懂事"而不只是"记事"。 */
export const SEMANTIC_MIN = 3;

function semanticText(cat, kw, n, latest) {
  const head = {
    food: `总绕不开「${kw}」——吃的事上反复出现 ${n} 次`,
    study: `「${kw}」反复出现 ${n} 次，像是一条主线`,
    feeling: `「${kw}」出现过 ${n} 次，情绪里绕不开它`,
    person: `「${kw}」被提到 ${n} 次，是常出现的人`,
    watch: `总刷到「${kw}」这一类，${n} 次`,
    place: `「${kw}」这地方去过 ${n} 次`,
    event: `「${kw}」这类事发生过 ${n} 次`,
    daily: `「${kw}」这种事反复了 ${n} 次`,
    misc: `「${kw}」出现过 ${n} 次`
  }[cat] || `「${kw}」出现过 ${n} 次`;
  return `${head}（最近一次：${String(latest).slice(0, 36)}）`;
}

/** 虚词：以它开头的 2-gram 多半是「了火/的时」这种碎片，不是词。 */
const STOP_CHARS = new Set('的了着过就也都又很太一这那个和跟吧呢啊嘛哦嗯我你他她它们在是有去到吗把被给对从向再还只里上面'.split(''));

/** 在同一类里找最"有共性"的那个词：出现次数最多、且不是停用词的 2-gram。 */
function commonTerm(items) {
  const df = new Map();
  for (const it of items) {
    const seen = new Set(
      [...bigrams(it.text)].filter(
        (g) => !STOP_BIGRAMS.has(g) && !/^\d+$/.test(g) && ![...g].some((ch) => STOP_CHARS.has(ch))
      )
    );
    for (const g of seen) df.set(g, (df.get(g) || 0) + 1);
  }
  const ranked = [...df.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b2) => b2[1] - a[1] || b2[0].length - a[0].length);
  return ranked.length ? ranked[0] : null;
}

/**
 * 语义化：把「三次吃火锅」熬成「他总绕不开火锅」。
 *
 * 这是人从「记事」到「懂事」的那一步：情景记忆（episodic）反复出现，
 * 就沉淀成一条语义记忆（semantic），原来的细节退到归档里当证据。
 * 同一条语义只生成一次（`semanticKey` 去重），之后每多一次提到只加 `hits`。
 */
export function semanticize(st, now = Date.now(), opts = {}) {
  const b = ensureBrain(st);
  const out = { created: 0, archived: 0, reinforced: 0 };
  if (!b) return out;
  const min = Number(opts.min) || SEMANTIC_MIN;
  const groups = new Map();
  for (const it of b.items) {
    if (!it || it.semantic || it.sealed) continue;
    if (['promise', 'self'].includes(it.category)) continue;
    const arr = groups.get(it.category) || [];
    arr.push(it);
    groups.set(it.category, arr);
  }
  for (const [cat, items] of groups) {
    if (items.length < min) continue;
    const term = commonTerm(items);
    if (!term) continue;
    const [kw, dfCount] = term;
    const key = `${cat}:${kw}`;
    const related = items.filter((it) => String(it.text).includes(kw));
    if (related.length < min) continue;
    const latest = related
      .slice()
      .sort((x, y) => (Number(y.createdAt) || 0) - (Number(x.createdAt) || 0))[0];
    const absorb = (parent) => {
      const drop = new Set(related.map((i) => i.id));
      for (const it of related) {
        it.archivedAt = now;
        it.semanticizedBy = parent.id;
        b.archive.push(it);
      }
      b.items = b.items.filter((i) => !drop.has(i.id));
      return drop.size;
    };
    const existing = b.items.find((i) => i && i.semanticKey === key);
    if (existing) {
      // 又聊到同一件事：不是再造一条，是把这条「懂的事」再夯实一遍。
      existing.hits = (Number(existing.hits) || 1) + 1;
      existing.updatedAt = now;
      existing.semN = (Number(existing.semN) || min) + related.length;
      existing.semLatest = latest.text;
      existing.text = semanticText(cat, kw, existing.semN, existing.semLatest);
      stabilize(existing, 1.15);
      out.archived += absorb(existing);
      out.reinforced += 1;
      continue;
    }
    const stability = clamp(baseStability(cat, 72, 0.25) * 2.5, 96, 60000);
    const item = {
      id: newId(),
      tier: tierForStability(stability),
      category: cat,
      semantic: true,
      semanticKey: key,
      semKw: kw,
      semN: related.length,
      semLatest: latest.text,
      valence: 'neutral',
      arousal: 0.2,
      sealed: false,
      text: semanticText(cat, kw, related.length, latest.text),
      salience: clamp(64 + related.length * 4, 0, 92),
      tags: ['归纳', kw],
      source: 'semantic',
      stabilityHours: stability,
      createdAt: now,
      updatedAt: now,
      lastRecalledAt: 0,
      recallCount: 0,
      hits: 1,
      missCount: 0,
      remindAt: null,
      remindedAt: null,
      derivesFrom: related.map((i) => i.id)
    };
    b.items.push(item);
    out.created += 1;
    // 原来的情景记忆退到归档：不是丢掉，是"不再天天占着提示词"。
    out.archived += absorb(item);
  }
  if (b.archive.length > ARCHIVE_CAP) b.archive = b.archive.slice(-ARCHIVE_CAP);
  return out;
}

/**
 * 挑几条「该想一想了」的旧事。
 * 人回想旧事的时候，想的往往不是最清楚的，而是**快要想不起来**的那些——
 * 所以权重偏向 R 偏低（但还没消失）的条目，这就是「合意困难」。
 */
export function pickRecall(st, n = RECALL_COUNT, now = Date.now(), opts = {}) {
  const b = ensureBrain(st);
  if (!b) return [];
  const wantCat = opts.category && CATEGORIES[opts.category] ? opts.category : null;
  const cand = b.items.filter((it) => {
    if (!it || it.sealed) return false;
    if (!['long', 'permanent'].includes(tierForStability(Number(it.stabilityHours) || 0))) return false;
    if (wantCat && it.category !== wantCat) return false;
    if (Number(it.lastRecalledAt) > now - 3 * 24 * HOUR) return false;
    const r = retentionOf(it, now);
    return r >= FORGET_THRESHOLD && r <= CLEAR_THRESHOLD;
  });
  if (!cand.length) return [];
  const scored = cand.map((it) => {
    const r = retentionOf(it, now);
    let w = (1 - r) * (0.5 + (Number(it.salience) || 40) / 100);
    if (it.category === 'permanent') w *= 0.6;
    return { it, w };
  });
  const picked = [];
  while (picked.length < n && scored.length) {
    const total = scored.reduce((s, x) => s + x.w, 0);
    let roll = (opts.rng || Math.random)() * total;
    let idx = 0;
    for (let i = 0; i < scored.length; i += 1) {
      roll -= scored[i].w;
      if (roll <= 0) { idx = i; break; }
      idx = i;
    }
    const chosen = scored.splice(idx, 1)[0];
    picked.push(chosen.it);
    // 同类的先降权，凑出「跨类别的一把回忆」
    for (const s of scored) if (s.it.category === chosen.it.category) s.w *= 0.35;
  }
  for (const it of picked) {
    reinforce(it, now);
    retrievalInducedForgetting(st, it, now);
  }
  b.recall = {
    date: todayStr(new Date(now)),
    at: now,
    ids: picked.map((i) => i.id),
    text: picked.map((i) => `[${CATEGORIES[i.category]?.label || '杂'}]${i.text}`).join('；').slice(0, 400)
  };
  return picked;
}

export function maybeDailyRecall(st, now = Date.now(), opts = {}) {
  const hour = Number.isFinite(opts.hour) ? opts.hour : RECALL_HOUR;
  if (new Date(now).getHours() < hour) return [];
  const b = ensureBrain(st);
  if (!b) return [];
  if (b.recall?.date === todayStr(new Date(now))) return [];
  return pickRecall(st, opts.n ?? RECALL_COUNT, now, opts);
}

function bigrams(text) {
  const t = String(text || '').replace(/[\s\p{P}\p{S}]/gu, '');
  const out = new Set();
  for (let i = 0; i < t.length - 1; i += 1) out.add(t.slice(i, i + 2));
  return out;
}

/**
 * 「又看到那个东西，忽然想起来」。
 * 概率由重合度和当前留存共同决定：记得越牢的越容易被勾出来。
 */
export function probe(st, text, now = Date.now(), rng = Math.random) {
  const b = ensureBrain(st);
  if (!b) return [];
  const src = new Set([...bigrams(text)].filter((g) => !STOP_BIGRAMS.has(g)));
  if (src.size < 1) return [];
  const revived = [];
  const pool = [
    ...b.items.filter((i) => i && !i.sealed),
    ...b.archive.filter((i) => i && !i.sealed)
  ];
  for (const it of pool) {
    let shared = 0;
    for (const g of bigrams(it.text)) if (src.has(g)) shared += 1;
    if (shared < 1) continue;
    if (now - (Number(it.lastProbedAt) || 0) < 6 * HOUR) continue;
    it.lastProbedAt = now;
    const overlap = shared / Math.max(3, src.size);
    const r = retentionOf(it, now);
    const p = clamp(0.10 + overlap * 0.55 + r * 0.35, 0.08, 0.92);
    if (rng() >= p) {
      it.missCount = (Number(it.missCount) || 0) + 1;
      it.stabilityHours = clamp((Number(it.stabilityHours) || 3) * 0.92, 0.3, 60000);
      continue;
    }
    reinforce(it, now);
    if (!b.items.includes(it)) {
      b.items.push(it);
      b.archive = b.archive.filter((x) => x !== it);
    }
    revived.push(it);
  }
  if (revived.length) b.probe = { at: now, ids: revived.map((i) => i.id) };
  return revived;
}

/** 到点该提的事（前瞻记忆）：答应过「到时候提醒你」的，自己冒出来。 */
export function dueReminders(st, now = Date.now()) {
  const b = ensureBrain(st);
  if (!b) return [];
  return b.items.filter((it) => {
    if (!it || it.sealed || !it.remindAt) return false;
    const at = Number(it.remindAt);
    if (now < at) return false;
    if (now - at > 24 * HOUR) return false;
    return retentionOf(it, now) >= 0.1;
  });
}

/**
 * 按 id 或「开头十几个字」定位一条记忆。
 * 模糊命中超过一条就放弃——宁可让她说「我记不清是哪条」，也不能改错一条。
 */
function findItem(b, input = {}) {
  if (!b) return null;
  const id = input.id || input.itemId;
  if (id) return b.items.find((i) => i && i.id === id) || null;
  const want = String(input.text || input.reviseOf || '').replace(/\s+/g, ' ').trim();
  if (!want) return null;
  const head = want.slice(0, 16);
  const hits = b.items.filter((i) => i && !i.sealed && String(i.text || '').includes(head));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * 改写一条记忆（订正，而不是删掉重写）。
 * 记忆的价值在连续性：写错了要能改，改过要留痕——否则「永久层」就是永久污染。
 */
export function revise(st, input = {}) {
  const b = ensureBrain(st);
  if (!b) return null;
  const now = Number(input.now) || Date.now();
  const target = findItem(b, input);
  if (!target) return null;
  const next = String(input.newText ?? input.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!next || next === target.text) return null;
  const note = String(input.note || '').slice(0, 120);
  if (!Array.isArray(target.revisions)) target.revisions = [];
  target.revisions.push({ at: now, text: target.text, note });
  if (target.revisions.length > 10) target.revisions = target.revisions.slice(-10);
  target.text = next;
  if (CATEGORIES[input.category]) target.category = input.category;
  if (input.salience != null) target.salience = clamp(Number(input.salience) || 0, 0, 100);
  target.updatedAt = now;
  target.reviseCount = (Number(target.reviseCount) || 0) + 1;
  // 改得动，说明这条还记得住：顺手巩固一次，别让「刚改完就淡了」。
  stabilize(target, 1 + (SPACING_GAIN - 1) * 0.5);
  learnWeb(b, target, now);
  return target;
}

/** 「我认识的人」：单独成块、单独配额。 */
export function personsOf(st, now = Date.now(), limit = PERSON_INJECT) {
  const b = ensureBrain(st);
  if (!b) return [];
  return b.items
    .filter((it) => it && !it.sealed && it.category === 'person' && retentionOf(it, now) >= FORGET_THRESHOLD)
    .sort((x, y) => (Number(y.salience) || 40) * retentionOf(y, now) - (Number(x.salience) || 40) * retentionOf(x, now))
    .slice(0, Math.max(1, limit));
}

/**
 * 检索（retrieval）而不是配额（quota）：按这一轮对方说的话捞，而不是按层各发几条。
 * 打分 = 话头重合 0.55 + 留存 0.25 + 重要度 0.20；没重合的只保留「底子」。
 */
export function retrieve(st, text, opts = {}) {
  const b = ensureBrain(st);
  if (!b) return [];
  const now = Number(opts.now) || Date.now();
  const exclude = opts.exclude instanceof Set ? opts.exclude : new Set();
  const n = Math.max(1, Math.min(20, Number(opts.n) || RETRIEVE_N));
  const category = opts.category && CATEGORIES[opts.category] ? opts.category : null;
  const src = new Set([...bigrams(String(text || ''))].filter((g) => !STOP_BIGRAMS.has(g)));
  const rows = [];
  for (const it of b.items) {
    if (!it || it.sealed || exclude.has(it.id)) continue;
    if (category && it.category !== category) continue;
    const r = retentionOf(it, now);
    if (r < FORGET_THRESHOLD) continue;
    let shared = 0;
    if (src.size) for (const g of bigrams(it.text)) if (src.has(g)) shared += 1;
    const overlap = src.size ? Math.min(1, shared / Math.max(3, src.size)) : 0;
    const sal = clamp(Number(it.salience) || 40, 0, 100) / 100;
    const isBase = !overlap && it.tier === 'permanent' && sal >= 0.7;
    if (!overlap && !isBase) continue;
    const score = overlap * 0.55 + r * 0.25 + sal * 0.2 + (it.semantic ? 0.05 : 0);
    rows.push({ item: it, score, base: isBase });
  }
  rows.sort((x, y) => y.score - x.score);
  // 一条只出一次；同类最多三条；「底子」最多 BASE_KEEP 条，免得长话题被永久层刷满。
  let baseLeft = BASE_KEEP;
  const out = [];
  const byCat = new Map();
  for (const row of rows) {
    if (row.base) {
      if (baseLeft <= 0) continue;
      baseLeft -= 1;
    }
    const c = row.item.category || 'misc';
    if ((byCat.get(c) || 0) >= 3) continue;
    byCat.set(c, (byCat.get(c) || 0) + 1);
    out.push(row);
    if (out.length >= n) break;
  }
  return out;
}

/** 一条记忆渲染成一行：清楚 / 模糊 / 提过几次 / 订正过几次 / 是不是归纳出来的。 */
function lineOfItem(it, now, extra = '') {
  const when = agoText(Number(it.createdAt) || 0, now);
  const cat = CATEGORIES[it.category]?.label;
  const r = retentionOf(it, now);
  const clarity = r >= 0.7 ? '' : r >= 0.4 ? '，记不太清了' : '，只剩个模糊的影子';
  const times = Number(it.hits) > 1 ? `，提过 ${it.hits} 次` : '';
  const fixed = Number(it.reviseCount) > 0 ? `，订正过 ${it.reviseCount} 次` : '';
  const origin = it.semantic ? '，是从几件小事里归纳出来的' : '';
  return `- ${cat ? `[${cat}] ` : ''}${it.text}（${when}记下${times}${fixed}${origin}${clarity}${extra}）`;
}

function tierSelection(b, tier, now) {
  const list = b.items.filter((i) => i && i.tier === tier && !i.sealed && retentionOf(i, now) >= FORGET_THRESHOLD);
  if (!list.length) return [];
  const scored = (it) => (Number(it.salience) || 40) * retentionOf(it, now);
  return list.sort((x, y) => scored(y) - scored(x)).slice(0, TIER_INJECT[tier] || 6);
}

function linesForTier(b, tier, now, skip = null) {
  const list = tierSelection(b, tier, now).filter((it) => !(skip && skip.has(it.id)));
  if (!list.length) return [];
  const out = [`【${TIER_LABEL[tier]}】`];
  for (const it of list) {
    const when = agoText(Number(it.createdAt) || 0, now);
    const cat = CATEGORIES[it.category]?.label;
    const r = retentionOf(it, now);
    // 人记得的事是按「清楚程度」说话的：清楚的说细节，模糊的只留个影子。
    const clarity = r >= 0.7 ? '' : r >= 0.4 ? '，记不太清了' : '，只剩个模糊的影子';
    const times = Number(it.hits) > 1 ? `，提过 ${it.hits} 次` : '';
    const origin = it.semantic ? '，是从几件小事里归纳出来的' : '';
    out.push(`- ${cat ? `[${cat}] ` : ''}${it.text}（${when}记下${times}${origin}${clarity}）`);
  }
  return out;
}

/** 渲染成提示词块。 */
export function render(st, now = Date.now(), opts = {}) {
  const b = ensureBrain(st);
  if (!b) return '';
  sweep(st, now);
  const lines = [];
  // 已经摆上去的条目，后面的块不再重复——记忆块最忌讳同一件事出现三遍。
  const shown = new Set();

  const due = dueReminders(st, now);
  if (due.length) {
    lines.push('【说好的事】');
    for (const it of due) {
      shown.add(it.id);
      const when = new Date(Number(it.remindAt)).toLocaleString('zh-CN', { hour12: false });
      lines.push(`- ${it.text}（说好 ${when}，到点了，可以主动提一句）`);
    }
  }

  // 钉住的关键事实每轮必带：不占层的配额，也不算检索——她不问也得知道。
  const pinned = b.items
    .filter((it) => it && it.pinned && !shown.has(it.id))
    .sort((x, y) => (Number(y.salience) || 0) - (Number(x.salience) || 0))
    .slice(0, PIN_INJECT);
  if (pinned.length) {
    lines.push('【不能忘的】');
    for (const it of pinned) {
      shown.add(it.id);
      lines.push(lineOfItem(it, now));
    }
  }

  // 人是一等公民：单独成块、单独配额，不跟「吃」「看片」抢位置。
  const people = personsOf(st, now).filter((it) => !shown.has(it.id));
  if (people.length) {
    lines.push('【我认识的人】');
    for (const it of people) {
      shown.add(it.id);
      lines.push(lineOfItem(it, now));
    }
  }

  // 「去年今天」这类按季候翻上来的旧事：单独成块，就不再在层里重复一遍。
  const otd = onThisDay(st, now);
  for (const row of otd) shown.add(row.item.id);

  if (opts.text) {
    // 检索优先：这一轮说什么就捞什么，不再按层配额各发几条。
    const rows = retrieve(st, opts.text, { n: RETRIEVE_N, exclude: shown, now });
    // 捞不满就补位：宁可多给两条「刚浮上来的」，也别让她答得像失忆。
    if (rows.length < RETRIEVE_FLOOR) {
      const have = new Set([...shown, ...rows.map((r) => r.item.id)]);
      for (const tier of ['permanent', 'long', 'short']) {
        for (const it of tierSelection(b, tier, now)) {
          if (rows.length >= RETRIEVE_FLOOR) break;
          if (have.has(it.id)) continue;
          have.add(it.id);
          rows.push({ item: it, score: 0, filler: true });
        }
        if (rows.length >= RETRIEVE_FLOOR) break;
      }
    }
    if (rows.length) {
      lines.push('【这会儿想起来的】');
      for (const row of rows) {
        shown.add(row.item.id);
        const note = row.base ? '，这条是底子上的' : row.filler ? '，这条是刚浮上来的' : '';
        lines.push(lineOfItem(row.item, now, note));
      }
    }
  } else {
    // 没有话头（巡检、纯定时唤醒）就退回按层发牌。
    for (const tier of TIER_ORDER) {
      const list = tierSelection(b, tier, now).filter((it) => !shown.has(it.id));
      if (!list.length) continue;
      lines.push(`【${TIER_LABEL[tier]}】`);
      for (const it of list) {
        shown.add(it.id);
        lines.push(lineOfItem(it, now));
      }
    }
  }

  // 归纳出来的「懂的事」单独摆一行：它是道理，不是事情。
  const sem = b.items
    .filter((it) => it && it.semantic && !it.sealed && !shown.has(it.id) && retentionOf(it, now) >= FORGET_THRESHOLD)
    .sort((x, y) => (Number(y.salience) || 0) - (Number(x.salience) || 0))
    .slice(0, 3);
  if (sem.length) {
    lines.push('【记下的道理】');
    for (const it of sem) {
      shown.add(it.id);
      lines.push(lineOfItem(it, now));
    }
  }

  // 顺着这一轮对方说的话，投一颗石子看能浮起什么（已经摆在上面的不再重复）。
  if (opts.text) {
    const rows = ripple(st, { text: opts.text, n: opts.rippleN, now, exclude: shown });
    const block = renderRipple(rows, now);
    if (block) lines.push(block);
  }

  const rec = b.recall;
  if (rec && rec.date === todayStr(new Date(now)) && Array.isArray(rec.ids) && rec.ids.length) {
    const items = rec.ids.map((id) => b.items.find((i) => i && i.id === id)).filter(Boolean);
    if (items.length) {
      lines.push('【今天想起的】');
      for (const it of items) {
        const cat = CATEGORIES[it.category]?.label;
        lines.push(`- ${cat ? `[${cat}] ` : ''}${it.text}（${agoText(Number(it.createdAt) || 0, now)}记下的，今天又想起来）`);
      }
      lines.push('（这些是你自己翻出来的旧事：可以接着聊；想留个记号，就再记一条新的。）');
    }
  }

  const pr = b.probe;
  if (pr && now - Number(pr.at || 0) < 10 * 60 * 1000) {
    const probed = (Array.isArray(pr.ids) ? pr.ids : []).map((id) => b.items.find((i) => i && i.id === id)).filter(Boolean);
    if (probed.length) {
      lines.push('【好像想起来了】');
      for (const it of probed) {
        const cat = CATEGORIES[it.category]?.label;
        lines.push(`- ${cat ? `[${cat}] ` : ''}${it.text}（刚才那句话让你想起了这个，模糊但确实有）`);
      }
      lines.push('（这类记忆是"被勾起来"的，不保证准确：可能记串了时间或人，别当成事实硬套。）');
    }
  }

  // 「去年今天」这类按季候翻上来的旧事：一年里只在这种日子出现几次。
  if (otd.length) {
    lines.push('【那年今日】');
    for (const row of otd) {
      const cat = CATEGORIES[row.item.category]?.label;
      lines.push(`- ${row.label}${cat ? `（${cat}）` : ''}：${row.item.text}`);
    }
    lines.push('（日期只按月日比，具体到哪天不一定准；想接就接一句，不想接就放着，别硬说"我记得那天"。）');
  }
  return lines.join('\n');
}

export function stats(st, now = Date.now()) {
  const b = ensureBrain(st);
  if (!b) return { total: 0, tiers: {}, categories: {}, sealed: 0, archived: 0, recall: null, due: 0, fading: 0 };
  sweep(st, now);
  const tiers = {};
  for (const t of TIER_ORDER) tiers[t] = b.items.filter((i) => i && i.tier === t).length;
  const categories = {};
  for (const it of b.items) {
    const c = it?.category || 'misc';
    categories[c] = (categories[c] || 0) + 1;
  }
  const rs = b.items.map((i) => retentionOf(i, now));
  return {
    total: b.items.length,
    tiers,
    categories,
    sealed: b.items.filter((i) => i && i.sealed).length,
    semantic: b.items.filter((i) => i && i.semantic).length,
    archived: b.archive.length,
    fading: b.items.filter((i) => retentionOf(i, now) < 0.3).length,
    avgRetention: rs.length ? Number((rs.reduce((a, b2) => a + b2, 0) / rs.length).toFixed(2)) : 0,
    due: dueReminders(st, now).length,
    web: webStats(st),
    recall: b.recall?.date ? { date: b.recall.date, count: Array.isArray(b.recall.ids) ? b.recall.ids.length : 0, text: b.recall.text || '' } : null
  };
}

export function list(st) {
  const b = ensureBrain(st);
  if (!b) return [];
  return [...b.items].sort((x, y) => TIER_ORDER.indexOf(x.tier) - TIER_ORDER.indexOf(y.tier));
}

/* ════════════════════════════════════════════════════════════════
 * 关系网：「差序格局」的水波纹
 *
 * 费孝通《乡土中国》：乡土社会的关系是「以己为中心，像石子投入水中，
 * 和别人所联系成的社会关系，不像团体中的分子一般大家立在一个平面上的，
 * 而是像水的波纹一般，一圈圈推出去，愈推愈远，也愈推愈薄」。
 *
 * 这套记忆借用这个形状：
 *   - 水面上的点是「词」（类别、标签、一句话里最跳的几个 2-gram）；
 *   - 两个词同一条记忆里出现过，就拴一道线，线的粗细随共现次数涨、随时间变细；
 *   - 回忆时从「此刻这句话里的词」投一颗石子，顺着线一圈圈扩散；
 *   - 第 1 圈最亲（基本是这件事本身），第 3 圈只剩个影子（往往是另一个情境）。
 * 不追求「全都知道」，只追求「顺着话头能摸出一两条来」——和真人的联想一样不可靠。
 * ════════════════════════════════════════════════════════════════ */

const WEB = {
  // 每一圈的权重：愈推愈远，愈推愈薄。
  ringWeight: [1, 0.55, 0.3, 0.16],
  ringLabel: ['正对', '一圈', '两圈', '三圈'],
  fanout: 6,               // 每个词最多顺几根线出去
  edgeCap: 4000,           // 线太多就删最细的
  edgeHalfLifeH: 30 * 24,  // 30 天不共现，线粗细减半
  wordHalfLifeH: 30 * 24,
  seedMax: 8,
  itemMax: 3
};

function webOf(b) {
  if (!b.web || typeof b.web !== 'object') b.web = { words: {}, edges: {} };
  if (!b.web.words) b.web.words = {};
  if (!b.web.edges) b.web.edges = {};
  return b.web;
}

/**
 * 一句话里能当「水面上的点」的词：类别词 + 标签 + 最跳的几个 2-gram。
 * @returns {string[]}
 */
export function wordsOf(text, opts = {}) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const out = [];
  const cat = opts.category && CATEGORIES[opts.category] ? opts.category : classify(s).category;
  const catLabel = CATEGORIES[cat]?.label;
  if (catLabel) out.push(catLabel);
  for (const t of Array.isArray(opts.tags) ? opts.tags : []) {
    const v = String(t || '').trim().slice(0, 12);
    if (v) out.push(v);
  }
  const freq = new Map();
  for (const g of bigrams(s)) {
    if (STOP_BIGRAMS.has(g) || /^\d+$/.test(g) || [...g].some((ch) => STOP_CHARS.has(ch))) continue;
    freq.set(g, (freq.get(g) || 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 4).map(([g]) => g);
  out.push(...top);
  return Array.from(new Set(out)).filter(Boolean).slice(0, WEB.seedMax);
}

function touchWord(web, word, now, kind = 'gram') {
  const cur = web.words[word];
  const decay = cur ? Math.exp(-Math.max(0, now - Number(cur.last || 0)) / (WEB.wordHalfLifeH * HOUR)) : 0;
  web.words[word] = {
    w: Number(((cur ? cur.w * decay : 0) + 1).toFixed(4)),
    last: now,
    kind: cur?.kind || kind,
    df: (Number(cur?.df) || 0) + 1
  };
}

function touchEdge(web, a, b2, now) {
  if (!a || !b2 || a === b2) return;
  const key = a < b2 ? `${a}\u0001${b2}` : `${b2}\u0001${a}`;
  const cur = web.edges[key];
  const decay = cur ? Math.exp(-Math.max(0, now - Number(cur.last || 0)) / (WEB.edgeHalfLifeH * HOUR)) : 0;
  web.edges[key] = { w: Number(((cur ? cur.w * decay : 0) + 1).toFixed(4)), last: now };
}

// 时间词、虚词、单字碎片都不该占据一个词头：它们太常见，连出来的边全是噪声。
function isNoiseWord(w) {
  if (!w) return true;
  if (STOP_BIGRAMS.has(w)) return true;
  if (w.length < 2) return true;
  if (/^\d+$/.test(w)) return true;
  return [...w].some((ch) => STOP_CHARS.has(ch));
}

function purgeNoiseWords(b) {
  const web = webOf(b);
  let removed = 0;
  for (const w of Object.keys(web.words)) {
    if (!isNoiseWord(w)) continue;
    delete web.words[w];
    removed += 1;
  }
  if (removed) {
    for (const k of Object.keys(web.edges)) {
      const [a, c] = k.split('\u0001');
      if (!web.words[a] || !web.words[c]) delete web.edges[k];
    }
  }
  return removed;
}

function pruneEdges(b) {
  const web = webOf(b);
  purgeNoiseWords(b);
  const keys = Object.keys(web.edges);
  if (keys.length <= WEB.edgeCap) return;
  keys.sort((x, y) => Number(web.edges[y].w) - Number(web.edges[x].w));
  const keep = new Set(keys.slice(0, WEB.edgeCap));
  for (const k of Object.keys(web.edges)) if (!keep.has(k)) delete web.edges[k];
}

/** 一条记忆记下来时，顺手在关系网上拴线。 */
function learnWeb(b, item, now) {
  if (!item) return;
  const web = webOf(b);
  const words = wordsOf(item.text, { category: item.category, tags: item.tags });
  const catLabel = CATEGORIES[item.category]?.label;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  for (const w of words) touchWord(web, w, now, w === catLabel ? 'cat' : tags.includes(w) ? 'tag' : 'gram');
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) touchEdge(web, words[i], words[j], now);
  }
  pruneEdges(b);
}

/** 水面有多大（调试/巡检用）。 */
export function webStats(st) {
  const b = ensureBrain(st);
  if (!b) return { words: 0, edges: 0, top: [] };
  const web = webOf(b);
  const top = Object.entries(web.words)
    .sort((a, b2) => Number(b2[1].w) - Number(a[1].w))
    .slice(0, 8)
    .map(([w, v]) => `${w}×${Number(v.w).toFixed(1)}`);
  return { words: Object.keys(web.words).length, edges: Object.keys(web.edges).length, top };
}

/**
 * 投一颗石子：从 seeds 出发按圈扩散，返回每个词的圈号与分数。
 * @returns {{word:string, ring:number, score:number}[]}
 */
export function spread(st, seeds, opts = {}) {
  const b = ensureBrain(st);
  if (!b) return [];
  const web = webOf(b);
  const rings = Math.max(1, Math.min(4, Number(opts.rings) || 3));
  const fanout = Number(opts.fanout) || WEB.fanout;

  const adj = new Map();
  for (const [key, e] of Object.entries(web.edges)) {
    const [a, b2] = key.split('\u0001');
    if (!a || !b2) continue;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b2)) adj.set(b2, []);
    adj.get(a).push({ to: b2, w: Number(e.w) || 0 });
    adj.get(b2).push({ to: a, w: Number(e.w) || 0 });
  }

  const scores = new Map();
  let frontier = [];
  for (const s of seeds) {
    if (!web.words[s]) continue;
    scores.set(s, { ring: 0, score: 1 });
    frontier.push(s);
  }
  if (!frontier.length) return [];

  for (let r = 0; r < rings && frontier.length; r++) {
    const next = [];
    for (const w of frontier) {
      const here = scores.get(w);
      if (!here || here.ring !== r) continue;
      const links = (adj.get(w) || []).slice().sort((x, y) => y.w - x.w).slice(0, fanout);
      for (const l of links) {
        // 线越粗，扩散得越有劲；但一圈总比下一圈近。
        const gain = here.score * WEB.ringWeight[Math.min(r + 1, WEB.ringWeight.length - 1)] *
          Math.min(1, 0.45 + l.w / 4);
        const old = scores.get(l.to);
        if (!old || gain > old.score) {
          scores.set(l.to, { ring: r + 1, score: gain });
          next.push(l.to);
        }
      }
    }
    frontier = next;
  }

  return [...scores.entries()]
    .map(([word, v]) => ({ word, ring: v.ring, score: Number(v.score.toFixed(4)) }))
    .sort((x, y) => y.score - x.score);
}

/**
 * 顺着此刻这句话，从水面上捞起几条记忆。
 * @param {object} st
 * @param {{text?:string, n?:number, rings?:number, now?:number}} opts
 * @returns {{item:object, ring:number, score:number, word:string}[]}
 */
export function ripple(st, opts = {}) {
  const b = ensureBrain(st);
  if (!b) return [];
  const now = Number(opts.now) || Date.now();
  const web = webOf(b);
  let seeds = wordsOf(opts.text || '').filter((w) => web.words[w]);
  if (!seeds.length) {
    // 没有话头时，就从"最常被想到的"那几个词投石子——这也是她自己会走神的方向。
    seeds = Object.entries(web.words)
      .sort((a, b2) => Number(b2[1].w) - Number(a[1].w))
      .slice(0, 3)
      .map(([w]) => w);
  }
  if (!seeds.length) return [];
  const spreadWords = spread(st, seeds, { rings: Number(opts.rings) || 3 });
  const scoreOf = new Map(spreadWords.map((x) => [x.word, x]));

  const raw = [];
  const exclude = opts.exclude instanceof Set ? opts.exclude : null;
  for (const it of b.items) {
    if (!it || it.sealed) continue;
    if (exclude && exclude.has(it.id)) continue;
    const words = wordsOf(it.text, { category: it.category, tags: it.tags });
    let best = null;
    let bestKind = 'gram';
    for (const w of words) {
      const hit = scoreOf.get(w);
      if (!hit) continue;
      // 高频词（B站这种到处都挂着的标签）是枢纽不是特征：按词强开方衰减，
      // 否则任何一句话都会被最大的那个词头接走，联想永远只有一个答案。
      const eff = hit.score / Math.sqrt(1 + (Number(web.words[w]?.w) || 1));
      if (!best || eff > best.eff) {
        best = { ...hit, eff };
        bestKind = web.words[w]?.kind || 'gram';
      }
    }
    if (!best) continue;
    const kindWeight = bestKind === 'cat' ? 0.6 : 1;
    const r = retentionOf(it, now);
    const sal = clamp(Number(it.salience) || 0, 0, 100) / 100;
    raw.push({
      item: it,
      ring: best.ring,
      word: best.word,
      score: best.eff * kindWeight * (0.45 + r * 0.55) * (0.55 + sal * 0.45)
    });
  }
  raw.sort((x, y) => y.score - x.score);
  // 同一条只出一次；同类最多两条，别让一次联想被一件事刷满。
  const n = Math.max(1, Math.min(5, Number(opts.n) || WEB.itemMax));
  const out = [];
  const byCat = new Map();
  for (const row of raw) {
    const c = row.item.category || 'misc';
    if ((byCat.get(c) || 0) >= 2) continue;
    byCat.set(c, (byCat.get(c) || 0) + 1);
    out.push(row);
    if (out.length >= n) break;
  }
  return out;
}

/** 把一波涟漪渲染成几行字（给提示词用）。 */
export function renderRipple(rows, now = Date.now()) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const lines = ['【顺着话头想起来的】'];
  for (const row of rows) {
    const it = row.item;
    const cat = CATEGORIES[it.category]?.label;
    const when = agoText(Number(it.createdAt) || 0, now);
    const far = row.ring === 0
      ? '就在这句话上'
      : `隔着${WEB.ringLabel[Math.min(row.ring, WEB.ringLabel.length - 1)]}水面浮上来的`;
    lines.push(`- ${cat ? `[${cat}] ` : ''}${it.text}（${when}记下，${far}）`);
  }
  lines.push('（这些是顺着刚才那句话的联想，不保证对得上；接不上就别硬接。）');
  return lines.join('\n');
}

/* ───────────── 归档检索：把「黑洞」堵上 ───────────── */

function overlapScore(query, text) {
  const qs = new Set([...bigrams(String(query || ''))].filter((g) => !STOP_BIGRAMS.has(g)));
  if (!qs.size) return 0;
  const ts = new Set([...bigrams(String(text || ''))]);
  let hit = 0;
  for (const g of qs) if (ts.has(g)) hit += 1;
  return hit / qs.size;
}

/**
 * 在归档里翻旧事。语义化之后原件都进了 archive，这里是唯一能把细节找回来的入口。
 * @returns {{item:object, score:number, archivedAt:number}[]}
 */
export function searchArchive(st, opts = {}) {
  const b = ensureBrain(st);
  if (!b) return [];
  const q = String(opts.query || '').trim();
  const cat = opts.category && CATEGORIES[opts.category] ? opts.category : null;
  const n = Math.max(1, Math.min(20, Number(opts.n) || 5));
  const rows = [];
  for (const it of Array.isArray(b.archive) ? b.archive : []) {
    if (!it) continue;
    if (cat && it.category !== cat) continue;
    const score = q ? overlapScore(q, `${it.text} ${(it.tags || []).join(' ')}`) : 0.5;
    if (q && score <= 0) continue;
    rows.push({ item: it, score, archivedAt: Number(it.archivedAt) || 0 });
  }
  rows.sort((x, y) => y.score - x.score || y.archivedAt - x.archivedAt);
  return rows.slice(0, n);
}

/* ───────────── 「那年今日」：时间是很粗，但年月日够用 ───────────── */

/**
 * 去年今天、前年今天、或者整整一个月前的今天发生过什么。
 * 只按「月-日」比，不追求精确到几点——人回忆旧事本来就是按季候算的。
 * @returns {{item:object, label:string, yearsAgo:number}[]}
 */
export function onThisDay(st, now = Date.now()) {
  const b = ensureBrain(st);
  if (!b) return [];
  const d = new Date(now);
  const md = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const pool = [...b.items, ...(Array.isArray(b.archive) ? b.archive : [])].filter(Boolean);
  const out = [];
  for (const it of pool) {
    const created = new Date(Number(it.createdAt) || 0);
    if (Number.isNaN(created.getTime())) continue;
    const deltaDays = Math.round((now - created.getTime()) / (24 * HOUR));
    const sameMd = `${pad2(created.getMonth() + 1)}-${pad2(created.getDate())}` === md;
    const yearsAgo = d.getFullYear() - created.getFullYear();
    let label = '';
    if (sameMd && yearsAgo >= 1) label = `${yearsAgo} 年前的今天`;
    else if (deltaDays === 365) label = '整整一年前';
    else if (deltaDays === 30) label = '整整一个月前';
    else continue;
    out.push({ item: it, label, yearsAgo });
  }
  out.sort((x, y) => y.yearsAgo - x.yearsAgo);
  return out.slice(0, 3);
}

/**
 * 把整个记忆库渲染成人可读的 Markdown（给人看 / 导出带走 / 贴给别人）。
 * 只做「看」，不是存储格式——JSON 才是；层级分组与留存度都按当前时间现算。
 * @param {object} doc  记忆库文档（store.doc）：{ conversations: { [空间]: brain } }
 * @param {number} now
 * @returns {string}
 */
export function toMarkdown(doc, now = Date.now()) {
  const spaces = doc && doc.conversations && typeof doc.conversations === 'object' ? doc.conversations : {};
  const out = ['# 海马体记忆导出', '', `导出时间：${new Date(now).toLocaleString('zh-CN')}`, ''];
  const keys = Object.keys(spaces);
  if (!keys.length) {
    out.push('（记忆库是空的）');
    return out.join('\n') + '\n';
  }
  const ORDER = [['permanent', '永久'], ['long', '长期'], ['short', '短期'], ['instant', '瞬时']];
  // 存储形状是 conversations[空间] = { brain: {...} }（store.stateFor 返回的那层壳），
  // 也兼容直接传 brain 的用法。少剥这一层就会导出「0 条」——0.1.6 及以前就是这样。
  const brainOf = (k) => {
    const raw = spaces[k] || {};
    return raw.brain && typeof raw.brain === 'object' ? raw.brain : raw;
  };
  let totalItems = 0;
  let totalArchive = 0;
  for (const key of keys) {
    const b = brainOf(key);
    if (Array.isArray(b.items)) totalItems += b.items.length;
    if (Array.isArray(b.archive)) totalArchive += b.archive.length;
  }
  out.push(`合计 ${keys.length} 个空间 · 活记忆 ${totalItems} 条 · 归档 ${totalArchive} 条`, '');
  for (const key of keys) {
    const b = brainOf(key);
    const items = Array.isArray(b.items) ? b.items : [];
    const archive = Array.isArray(b.archive) ? b.archive : [];
    const persons = Array.isArray(b.persons) ? b.persons : [];
    const web = b.web && typeof b.web === 'object' ? b.web : null;
    const wordCount = web && web.words ? Object.keys(web.words).length : 0;
    const edgeCount = web && web.edges ? Object.keys(web.edges).length : 0;
    out.push(`## 空间：${key}`, '');
    out.push(`活记忆 ${items.length} 条 · 归档 ${archive.length} 条 · 人 ${persons.length} 个 · 关系网 ${wordCount} 词 / ${edgeCount} 边`, '');
    for (const [tier, label] of ORDER) {
      const group = items.filter((it) => (it.tier || 'instant') === tier);
      if (!group.length) continue;
      out.push(`### ${label}（${group.length}）`, '');
      for (const it of group) {
        const marks = [];
        if (it.category) marks.push(`[${it.category}]`);
        if (it.pinned) marks.push('钉住');
        if (it.sealed) marks.push('封存');
        if (it.semantic) marks.push('归纳');
        marks.push(`留存 ${Math.round(retentionOf(it, now) * 100)}%`);
        if (Number(it.hits) > 0) marks.push(`想起过 ${it.hits} 次`);
        if (Number(it.reviseCount) > 0) marks.push(`订正 ${it.reviseCount} 次`);
        if (it.createdAt) marks.push(new Date(Number(it.createdAt)).toLocaleDateString('zh-CN'));
        out.push(`- ${marks.join(' ')} ${oneLine(it.text)}`);
        if (it.oldText) out.push(`  - 订正前：${oneLine(it.oldText)}`);
      }
      out.push('');
    }
    if (archive.length) {
      out.push(`### 归档（${archive.length}）`, '', '> 不再主动注入，但按类检索仍可能翻出来——「忘了但又看见了」的那部分。', '');
      for (const it of archive.slice(-80)) {
        out.push(`- [${it.category || 'misc'}] ${oneLine(it.text)}`);
      }
      out.push('');
    }
  }
  return out.join('\n');
}

function oneLine(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}
