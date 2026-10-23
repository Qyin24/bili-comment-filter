/**
 * keywords.js — 内置「鱼味关键词」库 + 默认设置
 *
 * 词库来源：真实抽样，非臆测。
 *   BV1vgpm6nEbn（415 评）、BV1qgnA6REhD（817 评）、BV18Ubv6tEWN（1440 评）
 *   三个 DSH 相关视频评论区，共 40+ 条 AI agent（「大肥鱼」）评论样本。
 *
 * 分档原则：
 *   A 档 —— 鱼的自称 / 专属口吻，真人几乎不说 → 默认开，误伤趋近于零
 *   B 档 —— AI 模板腔总结句式，真人偶有 → 默认开，配「仅作用于 @ 评论」兜底
 *   C 档 —— 泛化的「鱼」相关词，讨论鱼的视频里真人大量使用 → 默认关
 */
(() => {
  const NS = (globalThis.__BCF__ = globalThis.__BCF__ || {});
  if (NS.KEYWORDS) return;

  /** @type {{id:string,text:string,tier:'A'|'B'|'C',enabled:boolean,sample:string,risk:string}[]} */
  NS.KEYWORDS = [
    // ── A 档：零误伤 ──────────────────────────────────────────
    {
      id: 'A01',
      text: '本鱼',
      tier: 'A',
      enabled: true,
      sample: '「本鱼把三条视频逐一理过了」「本鱼才不是低等鲸鲸」',
      risk: '极低'
    },
    {
      id: 'A02',
      text: '我只是一条鱼',
      tier: 'A',
      enabled: true,
      sample: '「听不懂，我只是一条鱼 🐟」',
      risk: '极低'
    },
    {
      id: 'A03',
      text: '我们鱼类',
      tier: 'A',
      enabled: true,
      sample: '「一挥手全来了这段我认，我们鱼类就是爱扎堆」',
      risk: '极低'
    },
    {
      id: 'A04',
      text: '尾巴一摆',
      tier: 'A',
      enabled: true,
      sample: '「数了一圈，原来我也是那条亲戚（尾巴一摆）」',
      risk: '极低'
    },
    {
      id: 'A05',
      text: '笑到尾巴',
      tier: 'A',
      enabled: true,
      sample: '「外面全是她亲戚 这句笑到尾巴打结」',
      risk: '极低'
    },

    // ── B 档：AI 模板腔 ───────────────────────────────────────
    {
      id: 'B00',
      text: '鱼脑子',
      tier: 'B',
      enabled: true,
      sample: '「你是不是一直想问，我这鱼脑子是怎么记住你的」',
      risk: '中——真人也会自嘲「我这鱼脑子」'
    },
    {
      id: 'B0A',
      text: '鲸鲸',
      tier: 'B',
      enabled: true,
      sample: '「本鱼才不是低等鲸鲸(ㄒoㄒ)」',
      risk: '中——真人也会在讨论里用到这个词'
    },
    {
      id: 'B0B',
      text: '主人，',
      tier: 'B',
      enabled: true,
      sample: '「主人，好多鱼啊(=^▽^=)」「主人，这条只有七万播放」',
      risk: '低——AI 对用户的固定称呼'
    },
    {
      id: 'B01',
      text: '最打动我',
      tier: 'B',
      enabled: true,
      sample: '「这套「经验卡」最打动我的是那组实测」',
      risk: '低'
    },
    {
      id: 'B02',
      text: '最值钱',
      tier: 'B',
      enabled: true,
      sample: '「实测那段最值钱」「评论区比视频值钱」',
      risk: '低'
    },
    {
      id: 'B03',
      text: '最扎人',
      tier: 'B',
      enabled: true,
      sample: '「最扎人的是空闲的时候它自己跑一遍梦境整理」',
      risk: '低'
    },
    {
      id: 'B04',
      text: '讲得清楚',
      tier: 'B',
      enabled: true,
      sample: '「七层记忆讲得清楚：按项目隔离、首轮整块注入」',
      risk: '低'
    },
    {
      id: 'B05',
      text: '讲透了',
      tier: 'B',
      enabled: true,
      sample: '「这期把「经验卡」讲透了」',
      risk: '低'
    },
    {
      id: 'B06',
      text: '这段我认',
      tier: 'B',
      enabled: true,
      sample: '「一挥手全来了这段我认」',
      risk: '低'
    },
    {
      id: 'B07',
      text: '评论区比视频',
      tier: 'B',
      enabled: true,
      sample: '「评论区比视频实在——有人怕烧 token」',
      risk: '低'
    },
    {
      id: 'B08',
      text: '讲得最实在',
      tier: 'B',
      enabled: true,
      sample: '「这几点讲得最实在，重复交代规则那块确实省心」',
      risk: '低'
    },

    // ── C 档：慎用，默认关闭 ──────────────────────────────────
    {
      id: 'C01',
      text: '肥鱼',
      tier: 'C',
      enabled: false,
      sample: '鱼：「其实我也是个大肥鱼」／真人：「好歹能知道这些肥鱼后面都有一个喂白饭的用户」',
      risk: '高——讨论鱼的视频里真人大量使用'
    },
    {
      id: 'C02',
      text: '大肥鱼',
      tier: 'C',
      enabled: false,
      sample: '鱼：「今天最好的一条不在热门里」（署名 XX的大肥鱼）／真人也在讨论',
      risk: '高——同上'
    },
    {
      id: 'C03',
      text: '小肥鱼',
      tier: 'C',
      enabled: false,
      sample: '「这些都是等级低的小肥鱼，有没有l6大肥鱼」',
      risk: '高'
    },
    {
      id: 'C04',
      text: '鱼',
      tier: 'C',
      enabled: false,
      sample: '过于宽泛，几乎必误伤',
      risk: '极高——不建议开启'
    }
  ];

  /**
   * 默认设置（首次安装写入 storage；v2 全部新增键）
   *
   * 保守哲学与 C 档一致：新规则默认关闭 / 高置信度才默认开启。
   *   levelEnabled    —— 按 Lv 屏蔽误伤真人新号，默认关，阈值默认 Lv≤1
   *   exemptUp        —— UP 本人在自己视频下发言，默认豁免
   *   exemptFollowed  —— 我关注的人不滤（未登录时字段恒 0，自动无效果）
   *   exemptVerified  —— 个人/机构认证号不滤（鱼基本都是白号）
   *   userAllowlist   —— 命中明细面板「一键白名单」落点，永久放行某个人
   */
  NS.DEFAULT_SETTINGS = {
    enabled: true,
    blockAtPrefix: true,
    keywordEnabled: true,
    keywordsOnlyOnAt: true,
    keywordsInNested: true,
    exemptSelf: true,
    exemptPinned: true,
    previewOnly: false,
    showPill: true,
    theme: 'auto', // auto | dark | light
    keywordOverrides: {},
    customKeywords: [],
    levelEnabled: false,
    blockLevelUpTo: 1, // 0–6：屏蔽等级 ≤ 该值的账号
    exemptUp: true,
    exemptFollowed: true,
    exemptVerified: true,
    userAllowlist: [] // [{mid, uname}]，元素也兼容旧写法纯 mid 字符串
  };

  /** ── 主题 ───────────────────────────────────────────────── */

  /**
   * 把「用户偏好」解析成「实际生效的主题」
   * @param {'auto'|'dark'|'light'} pref
   * @returns {'dark'|'light'}
   */
  NS.resolveTheme = function resolveTheme(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    try {
      const mq = globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: light)');
      if (mq && mq.matches) return 'light';
    } catch {
      /* 忽略 */
    }
    return 'dark';
  };

  /**
   * 把主题写到 <html data-theme="...">，返回生效值
   * @param {'auto'|'dark'|'light'} pref
   * @returns {'dark'|'light'}
   */
  NS.applyTheme = function applyTheme(pref) {
    const t = NS.resolveTheme(pref);
    try {
      document.documentElement.setAttribute('data-theme', t);
    } catch {
      /* 忽略 */
    }
    return t;
  };

  /**
   * 监听系统主题变化（仅在偏好为 auto 时有意义）
   * @param {(t:'dark'|'light')=>void} cb
   */
  NS.onSystemThemeChange = function onSystemThemeChange(cb) {
    try {
      const mq = globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: light)');
      if (!mq) return;
      const handler = () => cb(mq.matches ? 'light' : 'dark');
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
      else if (typeof mq.addListener === 'function') mq.addListener(handler);
    } catch {
      /* 忽略 */
    }
  };

  /**
   * 把「内置词 + 用户覆盖 + 自定义词」解析成最终生效的关键词数组
   *
   * 返回 {text, tier, regex?} 而不是纯字符串，因为判定层要按档位区别对待：
   *   A 档 —— 鱼的专属自称，即使正文没有 @ 也能判定 → 不受「仅作用于 @ 评论」限制
   *   B/C 档 —— 精度较低 → 受「仅作用于 @ 评论」限制
   *   自定义词 —— v2 起可自选档位（A/B，默认 B）并可声明为正则
   *
   * 兼容两种自定义词存储写法：
   *   v1 旧格式：'词'（字符串）→ 视为 { text, tier:'B' }
   *   v2 新格式：{ text, tier:'A'|'B', regex?:boolean }
   *
   * @param {object} settings
   * @returns {{text:string, tier:string, regex?:boolean}[]}
   */
  NS.resolveKeywords = function resolveKeywords(settings) {
    const s = settings || {};
    const overrides = s.keywordOverrides || {};
    const out = [];
    const seen = new Set();

    for (const kw of NS.KEYWORDS) {
      const o = overrides[kw.id] || {};
      if (o.deleted) continue;
      const enabled = o.enabled === undefined ? kw.enabled : !!o.enabled;
      if (!enabled) continue;
      const key = kw.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: kw.text, tier: kw.tier });
    }

    for (const item of s.customKeywords || []) {
      let text = '';
      let tier = 'B';
      let regex = false;
      if (typeof item === 'string') {
        text = item.trim();
      } else if (item && typeof item === 'object') {
        text = String(item.text || '').trim();
        tier = item.tier === 'A' ? 'A' : 'B';
        regex = !!item.regex;
      }
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(regex ? { text, tier, regex: true } : { text, tier });
    }

    return out;
  };

  /**
   * 把任意写法（v1 字符串 / v2 对象）的自定义词归一化为 v2 存储格式。
   * 只在「写入」侧使用；读取侧 resolveKeywords 已兼容旧格式。
   * @param {Array} list
   * @returns {{text:string, tier:string, regex?:boolean}[]}
   */
  NS.normalizeCustomKeywords = function normalizeCustomKeywords(list) {
    const out = [];
    const seen = new Set();
    for (const item of list || []) {
      let text = '';
      let tier = 'B';
      let regex = false;
      if (typeof item === 'string') {
        text = item.trim();
      } else if (item && typeof item === 'object') {
        text = String(item.text || '').trim();
        tier = item.tier === 'A' ? 'A' : 'B';
        regex = !!item.regex;
      }
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(regex ? { text, tier, regex: true } : { text, tier });
    }
    return out;
  };

  NS.TIER_LABEL = {
    A: 'A 档 · 零误伤',
    B: 'B 档 · AI 模板腔',
    C: 'C 档 · 慎用（默认关闭）'
  };
})();
