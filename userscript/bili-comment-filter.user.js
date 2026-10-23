// ==UserScript==
// @name         清塘 · B站评论区过滤器
// @namespace    https://github.com/Qyin24/bili-comment-filter
// @homepageURL  https://github.com/Qyin24/bili-comment-filter
// @supportURL   https://github.com/Qyin24/bili-comment-filter/issues
// @license      MIT
// @version      2.0.0
// @description  清塘：把 B站评论区这口塘清干净。过滤以 @ 开头的一级 AI 刷屏评论，以及命中所设关键词的评论。纯本地运行，不上传任何数据。
// @author       Qyin24
// @match        https://www.bilibili.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

/**
 * ⚠ 本文件是构建产物 —— 请勿直接编辑！
 * 由 build/build.js 自动生成（npm run build）：
 *   src/keywords.js（词库 / 默认设置，单源）
 *   src/filter.js（判定逻辑，单源）
 *   userscript/source/main.js（油猴专属 UI 与管线）
 * 要改逻辑/词库：改上述源码后重新 npm run build。
 */
/* ═════════════════ src/keywords.js（构建时内联 · 勿在此编辑） ═════════════════ */
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

/* ═════════════════ src/filter.js（构建时内联 · 勿在此编辑） ═════════════════ */
/**
 * filter.js — 判定逻辑（纯函数，零依赖）
 *
 * 刻意不依赖 chrome.* / DOM API，这样：
 *   1. 扩展与油猴脚本可以共用同一份逻辑（油猴版由构建脚本内联本文件）
 *   2. 可以单独在 Node 里跑单测
 *
 * 输入是 B站评论接口的原始 reply 对象，形如：
 *   {
 *     rpid,
 *     member: {
 *       mid, uname,
 *       is_followed,                 // 1 = 我关注的人（需登录，未登录恒 0）
 *       official_verify: { type },   // -1 无认证；0 个人认证；1 机构认证
 *       level_info: { current_level } // Lv0–Lv6，个别接口变体可能缺失
 *     },
 *     content: { message, members: [...] }
 *   }
 *
 * v2 规则一览（自上而下判定，任一命中即返回，放行返回 null）：
 *   豁免组 —— 用户白名单 / 自己 / 置顶 / UP 本人 / 我关注的 / 认证号
 *   规则一 —— 一级评论正文以 @ 开头且确实 @ 了人（楼中楼永不触发）
 *   规则二 —— 作者等级 ≤ 阈值（等级取不到 → 放行，绝不误杀未知）
 *   规则三 —— 关键词（字面包含 / 正则；A 档不受「仅作用于 @ 评论」限制）
 */
(() => {
  const NS = (globalThis.__BCF__ = globalThis.__BCF__ || {});
  if (NS.filter) return;

  const LEADING_AT = /^\s*@/; // \s 含全角空格 U+3000

  /** 正则词只测试正文前若干字符，防灾难性回溯拖垮页面 */
  const REGEX_INPUT_MAX = 500;

  /**
   * 正文是否以 @ 开头
   * @param {string} message
   */
  function isLeadingAt(message) {
    return LEADING_AT.test(String(message || ''));
  }

  /**
   * 该评论被 @ 了多少人（来自接口的结构化字段，最可靠）
   * @param {object} reply
   */
  function mentionCount(reply) {
    const members = reply && reply.content && reply.content.members;
    return Array.isArray(members) ? members.length : 0;
  }

  /**
   * 正文里是否出现过 @ 字符（用于「关键词仅作用于 @ 评论」）
   * @param {string} message
   */
  function hasAtChar(message) {
    return String(message || '').includes('@');
  }

  /**
   * 作者 mid，字符串化；取不到返回空串
   * @param {object} reply
   */
  function authorMid(reply) {
    const m = reply && reply.member && reply.member.mid;
    return m === undefined || m === null ? '' : String(m);
  }

  /**
   * 作者的 B站账号等级（Lv0–Lv6）；字段缺失/非法一律返回 null（= 未知，放行）
   * @param {object} reply
   */
  function extractLevel(reply) {
    const lv =
      reply &&
      reply.member &&
      reply.member.level_info &&
      reply.member.level_info.current_level;
    return typeof lv === 'number' && Number.isFinite(lv) && lv >= 0 && lv <= 6
      ? lv
      : null;
  }

  /**
   * 是否为我关注的人（接口需登录才返回有效值，未登录恒 0 → false）
   * @param {object} reply
   */
  function isFollowed(reply) {
    const v = reply && reply.member && reply.member.is_followed;
    return Number(v) === 1;
  }

  /**
   * 是否为认证号（个人认证 type=0 / 机构认证 type=1；-1 与缺失视为未认证）
   * @param {object} reply
   */
  function isVerified(reply) {
    const ov = reply && reply.member && reply.member.official_verify;
    return !!(ov && typeof ov.type === 'number' && ov.type !== -1);
  }

  /** 正则词编译缓存：非法模式记为 null，避免每次重抛 */
  const regexCache = new Map();

  /**
   * 正则词匹配（'i' 忽略大小写）；非法正则回退为字面包含
   * @param {string} pattern
   * @param {string} message
   * @param {string} lower
   */
  function regexHit(pattern, message, lower) {
    let re = regexCache.get(pattern);
    if (re === undefined) {
      try {
        re = new RegExp(pattern, 'i');
      } catch {
        re = null;
      }
      regexCache.set(pattern, re);
    }
    if (!re) return lower.includes(pattern.toLowerCase());
    const input = message.length > REGEX_INPUT_MAX ? message.slice(0, REGEX_INPUT_MAX) : message;
    try {
      return re.test(input);
    } catch {
      return false;
    }
  }

  /**
   * 是否在用户白名单里（元素兼容旧写法：纯 mid 字符串 或 {mid, uname}）
   * @param {object} reply
   * @param {Array} allowlist
   */
  function inAllowlist(reply, allowlist) {
    if (!Array.isArray(allowlist) || !allowlist.length) return false;
    const mid = authorMid(reply);
    if (!mid) return false;
    for (const u of allowlist) {
      const um = typeof u === 'string' ? u : u && u.mid;
      if (um === undefined || um === null) continue;
      if (String(um) === mid) return true;
    }
    return false;
  }

  /**
   * 等级阈值归一化：非法值回退 1；结果恒在 0–6
   * @param {*} v
   */
  function normalizeThreshold(v) {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(6, Math.max(0, n)) : 1;
  }

  /**
   * 核心判定
   * @param {object} reply     B站 reply 对象
   * @param {object} cfg       有效配置
   * @param {object} [ctx]     { nested, isPinned, isSelf, isUp }
   * @returns {null|'at'|'lv'|string} null=放行；'at'=结构规则；'lv'=等级规则；'kw:xxx'=关键词
   */
  function shouldBlock(reply, cfg, ctx) {
    const c = cfg || {};
    const x = ctx || {};
    if (!c.enabled) return null;

    const message = (reply && reply.content && reply.content.message) || '';

    // ── 豁免组（自上而下，全部放行短路）─────────────────────
    // 一键白名单优先级最高：主人亲手放行的人，任何规则都不许动
    if (inAllowlist(reply, c.userAllowlist)) return null;
    if (c.exemptSelf && x.isSelf) return null;
    if (c.exemptPinned && x.isPinned) return null;
    if (c.exemptUp && x.isUp) return null;
    if (c.exemptFollowed && isFollowed(reply)) return null;
    if (c.exemptVerified && isVerified(reply)) return null;

    // ── 规则一：一级评论以 @ 开头 ─────────────────────────────
    // 楼中楼永不触发（真人回复全靠 @）
    if (!x.nested && c.blockAtPrefix) {
      if (isLeadingAt(message) && mentionCount(reply) >= 1) {
        return 'at';
      }
    }

    // ── 规则二：按账号等级屏蔽 ────────────────────────────────
    // 等级未知（字段缺失）一律放行。
    // 注意必须排在关键词块之前：关键词块内有 keywordsInNested 的
    // 提前 return，放它后面会被短路跳过。
    if (c.levelEnabled) {
      const lv = extractLevel(reply);
      if (lv !== null && lv <= normalizeThreshold(c.blockLevelUpTo)) {
        return 'lv';
      }
    }

    // ── 规则三：关键词 ────────────────────────────────────────
    if (c.keywordEnabled) {
      const kws = c.keywords || [];
      if (kws.length) {
        if (x.nested && !c.keywordsInNested) return null;

        const lower = message.toLowerCase();

        // 「仅作用于 @ 评论」：A 档（鱼的专属自称）不受此限制，其余档位受限
        const atPresent =
          mentionCount(reply) >= 1 || hasAtChar(message);

        for (const kw of kws) {
          // 兼容纯字符串与 {text,tier,regex} 两种写法
          const text = typeof kw === 'string' ? kw : kw && kw.text;
          if (!text) continue;
          const tier = typeof kw === 'string' ? 'B' : kw.tier || 'B';

          if (c.keywordsOnlyOnAt && tier !== 'A' && !atPresent) continue;

          if (kw && kw.regex) {
            if (regexHit(String(text), message, lower)) return 'kw:' + text;
          } else if (lower.includes(String(text).toLowerCase())) {
            return 'kw:' + text;
          }
        }
      }
    }

    return null;
  }

  NS.filter = {
    shouldBlock,
    isLeadingAt,
    mentionCount,
    hasAtChar,
    authorMid,
    extractLevel,
    isFollowed,
    isVerified,
    normalizeThreshold
  };
})();

/* ═════════════════ userscript/source/main.js（油猴专属） ═════════════════ */
/**
 * main.js — 油猴版专属主体（源码，勿直接改最终的 .user.js 产物）
 *
 * 由 build/build.js 与 src/keywords.js + src/filter.js 拼装生成
 * userscript/bili-comment-filter.user.js。三段依次执行：
 *   1. keywords.js → globalThis.__BCF__（词库 / 默认设置 / 归一化函数）
 *   2. filter.js   → __BCF__.filter（判定逻辑，纯函数）
 *   3. 本文件      → 钩子、localStorage 配置、浮标 + 面板 UI
 *
 * 与扩展版的行为差异（有意为之）：
 *   - 配置存 localStorage（键仍是 bcf.config.v1，v1 老用户零迁移）
 *   - 设置界面是页内浮动面板；点浮标直接打开，面板顶部就是「命中明细」
 *   - 面板固定深色（扩展版 popup/options 才做三态主题）
 *
 * 因为 @grant none，脚本就跑在页面主世界，window.fetch 即页面自己的，
 * 钩子必然生效——比沙箱里 unsafeWindow 更可靠。
 */
(function () {
  'use strict';

  // ── 防止重复注入（SPA 切换/B站自身重复执行）───────────────
  if (window.__BCF_USERSCRIPT__) return;
  window.__BCF_USERSCRIPT__ = true;

  const SCRIPT_VERSION = '2.0.0';

  const NS = (globalThis.__BCF__ = globalThis.__BCF__ || {});
  const KEYWORDS = NS.KEYWORDS || [];
  const DEFAULT_SETTINGS = NS.DEFAULT_SETTINGS || {};
  const resolveKeywords = NS.resolveKeywords || (() => []);
  const normalizeCustomKeywords =
    NS.normalizeCustomKeywords || ((list) => (list || []).map((x) => (typeof x === 'string' ? x.trim() : x)).filter(Boolean));
  const F = NS.filter || {};

  const STORE_KEY = 'bcf.config.v1';

  // ── 配置读写 ──────────────────────────────────────────────
  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_SETTINGS, parsed || {});
    } catch {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
    } catch {
      /* 忽略 */
    }
  }

  let config = loadConfig();

  /** 等级阈值归一：非法回退 1，恒在 0–6 */
  function clampLevel(v) {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(6, Math.max(0, n)) : 1;
  }

  /** 白名单归一：兼容旧写法纯 mid 字符串 */
  function normalizeAllowlist(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const u of list) {
      if (typeof u === 'string') {
        if (u.trim()) out.push({ mid: u.trim(), uname: '' });
      } else if (u && u.mid !== undefined && u.mid !== null) {
        out.push({ mid: String(u.mid), uname: String(u.uname || '') });
      }
    }
    return out;
  }

  /** 把设置翻译成判定层要的 cfg（与扩展 content-bridge.buildPageConfig 同规则） */
  function pageConfig(s) {
    const c = s || config;
    return {
      enabled: c.enabled !== false,
      blockAtPrefix: c.blockAtPrefix !== false,
      keywordEnabled: c.keywordEnabled !== false,
      keywordsOnlyOnAt: c.keywordsOnlyOnAt !== false,
      keywordsInNested: c.keywordsInNested !== false,
      exemptSelf: c.exemptSelf !== false,
      exemptPinned: c.exemptPinned !== false,
      previewOnly: !!c.previewOnly,
      keywords: resolveKeywords(c),
      // ── v2 ──
      levelEnabled: !!c.levelEnabled,
      blockLevelUpTo: clampLevel(c.blockLevelUpTo),
      exemptUp: c.exemptUp !== false,
      exemptFollowed: c.exemptFollowed !== false,
      exemptVerified: c.exemptVerified !== false,
      userAllowlist: normalizeAllowlist(c.userAllowlist)
    };
  }

  // ── 统计 ──────────────────────────────────────────────────
  const tally = { at: 0, kw: 0, lv: 0, scanned: 0 };
  const hits = [];
  const HITS_MAX = 50;
  let degraded = false;
  let degradedWarned = false;
  let statsTimer = null;

  function flushStats(force) {
    if (force) {
      if (statsTimer) {
        clearTimeout(statsTimer);
        statsTimer = null;
      }
      renderPill();
      if (panelVisible) renderHits();
      return;
    }
    if (statsTimer) return;
    statsTimer = setTimeout(() => {
      statsTimer = null;
      renderPill();
      if (panelVisible) renderHits();
    }, 120);
  }

  function getSelfMid() {
    try {
      const m = document.cookie.match(/(?:^|;\s*)DedeUserID=(\d+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  /** 命中摘要（仅内存） */
  function recordHit(reply, reason, cfg) {
    try {
      const msg = String((reply && reply.content && reply.content.message) || '');
      hits.unshift({
        rpid: String((reply && (reply.rpid_str || reply.rpid)) || ''),
        mid: F.authorMid ? F.authorMid(reply) : String((reply && reply.member && reply.member.mid) || ''),
        uname: String((reply && reply.member && reply.member.uname) || '').slice(0, 12),
        excerpt: msg.slice(0, 40),
        reason,
        level: F.extractLevel ? F.extractLevel(reply) : null,
        blocked: !cfg.previewOnly
      });
      if (hits.length > HITS_MAX) hits.length = HITS_MAX;
    } catch {
      /* 忽略 */
    }
  }

  // ── 数据层过滤 ────────────────────────────────────────────
  function processReplies(list, cfg, opts) {
    if (!Array.isArray(list)) return { list, changed: false };
    const o = opts || {};
    const selfMid = cfg.exemptSelf ? getSelfMid() : null;
    const upMid = o.upMid ? String(o.upMid) : '';
    let changed = false;
    const out = [];

    for (const reply of list) {
      if (!reply || typeof reply !== 'object') {
        out.push(reply);
        continue;
      }
      tally.scanned += 1;
      const mid = reply.member ? String(reply.member.mid || '') : '';
      const isSelf = !!selfMid && mid === String(selfMid);
      const isUp = !!upMid && mid === upMid;

      const reason = F.shouldBlock(reply, cfg, {
        nested: !!o.nested,
        isPinned: !!o.pinned,
        isSelf,
        isUp
      });

      if (reason) {
        if (reason === 'at') tally.at += 1;
        else if (reason === 'lv') tally.lv += 1;
        else tally.kw += 1;

        recordHit(reply, reason, cfg);

        if (!cfg.previewOnly) {
          changed = true;
          continue;
        }
      }

      out.push(reply);

      if (Array.isArray(reply.replies) && reply.replies.length) {
        const sub = processReplies(reply.replies, cfg, { nested: true, pinned: false, upMid: o.upMid });
        if (sub.changed) {
          reply.replies = sub.list;
          changed = true;
        }
      }
    }
    return { list: out, changed };
  }

  function markDegraded(url) {
    degraded = true;
    if (!degradedWarned) {
      degradedWarned = true;
      try {
        console.warn('[清塘] B站评论接口结构变化，过滤可能已失效：', url);
      } catch {
        /* 忽略 */
      }
    }
  }

  function processPayload(data, url) {
    if (!data || typeof data !== 'object') return false;
    const root = data.data;
    if (!root || typeof root !== 'object') return false;

    const cfg = pageConfig();
    if (!cfg.enabled) return false;

    let changed = false;
    const isNestedApi = /\/x\/v2\/reply\/reply/.test(url);

    // 结构自检（v2）
    if (isNestedApi) {
      if (data.code === 0 && !Array.isArray(root.replies)) markDegraded(url);
    } else if (
      data.code === 0 &&
      !Array.isArray(root.replies) &&
      !Array.isArray(root.hots) &&
      !Array.isArray(root.top_replies)
    ) {
      markDegraded(url);
    }

    const upMid = root.upper && root.upper.mid ? String(root.upper.mid) : '';

    if (isNestedApi) {
      const r = processReplies(root.replies, cfg, { nested: true, pinned: false, upMid });
      if (r.changed) {
        root.replies = r.list;
        changed = true;
      }
      return changed;
    }

    if (!cfg.exemptPinned) {
      const r = processReplies(root.top_replies, cfg, { nested: false, pinned: true, upMid });
      if (r.changed) {
        root.top_replies = r.list;
        changed = true;
      }
    }
    for ( const key of ['replies', 'hots']) {
      const r = processReplies(root[key], cfg, { nested: false, pinned: false, upMid });
      if (r.changed) {
        root[key] = r.list;
        changed = true;
      }
    }
    return changed;
  }

  const TARGET_PATHS = [
    '/x/v2/reply/wbi/main',
    '/x/v2/reply/main',
    '/x/v2/reply/reply',
    '/x/v2/reply/lazy',
    '/x/v2/reply/hot'
  ];

  function isTargetUrl(url) {
    const u = String(url || '');
    if (!u) return false;
    return TARGET_PATHS.some((p) => u.includes(p));
  }

  // ── 钩 fetch ──────────────────────────────────────────────
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      const url =
        typeof input === 'string'
          ? input
          : input && typeof input.url === 'string'
            ? input.url
            : '';

      if (!isTargetUrl(url)) return origFetch.apply(this, arguments);
      // v2 性能：确认总开关关闭 → 不 clone 大响应体
      if (pageConfigDisabled()) return origFetch.apply(this, arguments);

      return origFetch.apply(this, arguments).then((res) => {
        try {
          if (!res || !res.ok) return res;
          return res
            .clone()
            .text()
            .then((text) => {
              let data;
              try {
                data = JSON.parse(text);
              } catch {
                return res;
              }
              const changed = processPayload(data, url);
              flushStats();
              if (!changed) return res;

              const headers = new Headers(res.headers);
              headers.delete('content-length');
              headers.delete('content-encoding');
              headers.set('content-type', 'application/json; charset=utf-8');
              return new Response(JSON.stringify(data), {
                status: res.status,
                statusText: res.statusText,
                headers
              });
            })
            .catch(() => res);
        } catch {
          return res;
        }
      });
    };
  }

  function pageConfigDisabled() {
    try {
      return config.enabled === false;
    } catch {
      return false;
    }
  }

  // ── 钩 XHR（兜底）────────────────────────────────────────
  try {
    const XHR = window.XMLHttpRequest;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try {
        this.__bcfUrl = String(url || '');
      } catch {
        /* 忽略 */
      }
      return origOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      try {
        const url = this.__bcfUrl || '';
        if (isTargetUrl(url) && !pageConfigDisabled()) {
          const xhr = this;
          xhr.addEventListener('readystatechange', () => {
            if (xhr.readyState !== 4 || xhr.__bcfDone) return;
            xhr.__bcfDone = true;
            try {
              const rt = xhr.responseType;
              let text = null;
              if (rt === 'json') text = JSON.stringify(xhr.response);
              else if (!rt || rt === 'text') text = xhr.responseText;
              if (!text) return;
              const data = JSON.parse(text);
              if (!processPayload(data, url)) return;
              const out = JSON.stringify(data);
              Object.defineProperty(xhr, 'responseText', {
                configurable: true,
                get() {
                  return out;
                }
              });
              if (rt === 'json') {
                Object.defineProperty(xhr, 'response', {
                  configurable: true,
                  get() {
                    return JSON.parse(out);
                  }
                });
              }
              flushStats();
            } catch {
              /* 忽略 */
            }
          });
        }
      } catch {
        /* 忽略 */
      }
      return origSend.apply(this, arguments);
    };
  } catch {
    /* 忽略 */
  }

  // ── 浮动统计条 ────────────────────────────────────────────
  let pillEl = null;

  const PILL_CSS =
    'position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;' +
    'padding:7px 10px 7px 12px;border-radius:999px;background:rgba(8,22,24,.94);color:#e7f3f2;' +
    'border:1px solid rgba(53,192,176,.28);' +
    'font:500 12px/1.35 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.36);cursor:pointer;user-select:none;';

  function renderPill() {
    const total = (tally.at || 0) + (tally.kw || 0) + (tally.lv || 0);
    if (config.showPill === false || (!total && !degraded)) {
      if (pillEl) pillEl.style.display = 'none';
      return;
    }
    if (!document.body) return;

    if (!pillEl) {
      pillEl = document.createElement('div');
      pillEl.id = 'bcf-pill';
      pillEl.style.cssText = PILL_CSS;
      pillEl.title = '清塘：查看命中明细与设置';

      const shield = document.createElement('span');
      shield.textContent = '🛡';

      const text = document.createElement('span');
      text.id = 'bcf-pill-text';

      const gear = document.createElement('span');
      gear.textContent = '⚙';
      gear.style.cssText = 'opacity:.6;margin-left:2px;';
      gear.title = '设置';

      pillEl.appendChild(shield);
      pillEl.appendChild(text);
      pillEl.appendChild(gear);

      pillEl.addEventListener('click', () => openPanel());

      document.body.appendChild(pillEl);
    }

    if (config.showPill === false) {
      pillEl.style.display = 'none';
      return;
    }
    pillEl.style.display = 'flex';
    const textEl = document.getElementById('bcf-pill-text');
    if (textEl) {
      const parts = [];
      if (tally.at) parts.push(`@ ${tally.at}`);
      if (tally.kw) parts.push(`关键词 ${tally.kw}`);
      if (tally.lv) parts.push(`Lv ${tally.lv}`);
      const countText = total
        ? `${config.previewOnly ? '可屏蔽' : '已屏蔽'} ${total} 条（${parts.join(' · ')}）`
        : '';
      textEl.textContent = degraded
        ? `⚠ 接口可能已改版${countText ? ' · ' + countText : ''}`
        : countText;
      pillEl.style.borderColor = degraded ? 'rgba(224,161,92,.65)' : 'rgba(53,192,176,.28)';
      pillEl.style.color = degraded ? '#f2c185' : '#e7f3f2';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPill);
  } else {
    renderPill();
  }

  // ── 面板（命中明细 + 全部设置）───────────────────────────
  let panelEl = null;
  let panelVisible = false;

  const BOX =
    'width:min(600px,100%);max-height:84vh;overflow:auto;background:#0e1c1f;color:#e7f3f2;' +
    'border:1px solid #1b3237;border-radius:16px;padding:20px 22px;box-shadow:0 24px 64px rgba(0,0,0,.6);' +
    'font:400 13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;';

  const H = 'font-size:12px;font-weight:650;color:#587175;margin:18px 0 6px;';

  function openPanel() {
    if (panelEl) {
      panelEl.style.display = 'flex';
      panelVisible = true;
      renderPanel();
      return;
    }

    const mask = document.createElement('div');
    mask.id = 'bcf-panel';
    mask.style.cssText =
      'position:fixed;inset:0;z-index:2147483001;background:rgba(4,10,11,.76);' +
      'display:flex;align-items:center;justify-content:center;padding:24px;';

    const box = document.createElement('div');
    box.style.cssText = BOX;

    const title = document.createElement('div');
    title.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;font-weight:650;font-size:15px;';
    const titleText = document.createElement('span');
    titleText.textContent = '清塘 · 命中明细与设置';
    title.appendChild(titleText);

    const close = document.createElement('span');
    close.textContent = '✕';
    close.style.cssText = 'cursor:pointer;opacity:.6;padding:0 4px;';
    close.addEventListener('click', closePanel);
    title.appendChild(close);

    const body = document.createElement('div');
    body.id = 'bcf-panel-body';

    const foot = document.createElement('div');
    foot.id = 'bcf-panel-foot';
    foot.style.cssText = 'margin-top:14px;font-size:11.5px;color:#587175;';

    box.appendChild(title);
    box.appendChild(body);
    box.appendChild(foot);
    mask.appendChild(box);
    document.body.appendChild(mask);
    panelEl = mask;

    mask.addEventListener('click', (e) => {
      if (e.target === mask) closePanel();
    });

    panelVisible = true;
    renderPanel();
  }

  function closePanel() {
    panelVisible = false;
    if (panelEl) panelEl.style.display = 'none';
  }

  function update(patch) {
    config = Object.assign({}, config, patch);
    saveConfig(config);
    renderPill();
  }

  function rowSwitch(label, desc, key, onInput) {
    const row = document.createElement('label');
    row.style.cssText =
      'display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:9px 0;cursor:pointer;' +
      'border-top:1px solid #16292d;';

    const left = document.createElement('span');
    left.style.cssText = 'flex:1;';
    left.textContent = label;
    if (desc) {
      const d = document.createElement('em');
      d.style.cssText = 'display:block;margin-top:3px;font-size:11.5px;color:#587175;font-style:normal;';
      d.textContent = desc;
      left.appendChild(d);
    }

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!config[key];
    cb.style.cssText = 'width:18px;height:18px;margin-top:2px;accent-color:#35c0b0;cursor:pointer;';
    cb.addEventListener('change', () => {
      config[key] = cb.checked;
      saveConfig(config);
      renderPill();
      if (onInput) onInput(cb.checked);
      renderPanel();
    });

    row.appendChild(left);
    row.appendChild(cb);
    return row;
  }

  function sectionHead(text) {
    const h = document.createElement('div');
    h.style.cssText = H;
    h.textContent = text;
    return h;
  }

  function reasonBadge(reason, level) {
    const span = document.createElement('span');
    let bg = 'rgba(53,192,176,.16)';
    let color = '#7fd8cb';
    let label = '';
    if (reason === 'at') {
      bg = 'rgba(95,168,232,.16)';
      color = '#8fc0ee';
      label = '@ 开头';
    } else if (reason === 'lv') {
      bg = 'rgba(224,161,92,.16)';
      color = '#e8bd85';
      label = level === null || level === undefined ? 'Lv ?' : 'Lv ' + level;
    } else {
      label = ('词·' + String(reason || '').replace(/^kw:/, '')).slice(0, 20);
    }
    span.textContent = label;
    span.style.cssText =
      `flex:0 0 auto;font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:999px;white-space:nowrap;background:${bg};color:${color};`;
    return span;
  }

  function isAllowed(mid) {
    if (!mid) return false;
    return normalizeAllowlist(config.userAllowlist).some((u) => u.mid === String(mid));
  }

  function toggleAllowlist(hit) {
    const mid = String((hit && hit.mid) || '');
    if (!mid) return;
    const list = normalizeAllowlist(config.userAllowlist);
    const had = list.some((u) => u.mid === mid);
    config.userAllowlist = had
      ? list.filter((u) => u.mid !== mid)
      : list.concat([{ mid, uname: String(hit.uname || '') }]);
    saveConfig(config);
    renderHits();
  }

  /** 面板顶部：命中明细（v2 误伤排查闭环） */
  function renderHits() {
    const box = document.getElementById('bcf-hits-box');
    if (!box) return;
    box.innerHTML = '';

    if (degraded) {
      const warn = document.createElement('div');
      warn.style.cssText =
        'font-size:11.5px;color:#e8bd85;background:rgba(224,161,92,.09);border:1px solid rgba(224,161,92,.24);' +
        'border-radius:8px;padding:7px 10px;margin-bottom:8px;';
      warn.textContent = '⚠ 评论接口结构和预期不符，过滤可能已失效。等作者更新，或检查是否 B站改版。';
      box.appendChild(warn);
    }

    if (!hits.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11.5px;color:#587175;padding:2px 0 8px;';
      empty.textContent = '本次浏览还没有命中记录。';
      box.appendChild(empty);
      return;
    }

    const total = tally.at + tally.kw + tally.lv;
    const sum = document.createElement('div');
    sum.style.cssText = 'font-size:11.5px;color:#587175;margin-bottom:8px;';
    sum.textContent =
      `${config.previewOnly ? '可屏蔽' : '已屏蔽'} ${total} 条（@ ${tally.at} · 关键词 ${tally.kw} · Lv ${tally.lv}）` +
      (hits.length < total ? ` · 显示最近 ${hits.length} 条` : '') +
      ' · 🛡 = 白名单放行此人';
    box.appendChild(sum);

    for (const hit of hits) {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-top:1px solid #16292d;';

      row.appendChild(reasonBadge(hit.reason, hit.level));

      const main = document.createElement('span');
      main.style.cssText = 'flex:1;min-width:0;';
      const name = document.createElement('span');
      name.style.cssText = 'display:block;color:#b9cfcd;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      name.textContent = (hit.uname || '匿名') + (hit.level === null || hit.level === undefined ? ' Lv?' : ' Lv' + hit.level);
      const ex = document.createElement('span');
      ex.style.cssText = 'display:block;color:#587175;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      ex.textContent = hit.excerpt || '（空正文）';
      ex.title = hit.excerpt || '';
      main.appendChild(name);
      main.appendChild(ex);

      const btn = document.createElement('button');
      btn.type = 'button';
      const on = isAllowed(hit.mid);
      btn.textContent = on ? '✓' : '🛡';
      btn.title = on ? '已在白名单，点击移除' : '加入白名单：此人的评论永远放行';
      btn.style.cssText =
        `all:unset;cursor:pointer;flex:0 0 auto;font-size:13px;padding:3px 7px;border-radius:8px;` +
        (on ? 'color:#4fd8c7;' : 'color:#9aa4b8;');
      btn.addEventListener('click', () => toggleAllowlist(hit));

      row.appendChild(main);
      row.appendChild(btn);
      box.appendChild(row);
    }
  }

  /** 白名单管理（面板底部小列表） */
  function renderAllowRows(body) {
    const list = normalizeAllowlist(config.userAllowlist);
    const box = document.createElement('div');
    box.style.cssText = 'margin-top:6px;';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11.5px;color:#587175;padding:4px 0;';
      empty.textContent = '白名单为空——在上方「命中明细」点 🛡 放行误伤的作者。';
      box.appendChild(empty);
    } else {
      for (const u of list) {
        const row = document.createElement('div');
        row.style.cssText =
          'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;' +
          'border-top:1px solid #16292d;font-size:12.5px;';
        const n = document.createElement('span');
        n.textContent = (u.uname || 'mid ' + u.mid) + (u.uname ? '（' + u.mid + '）' : '');
        const del = document.createElement('span');
        del.textContent = '移出';
        del.style.cssText = 'cursor:pointer;font-size:11.5px;color:#e4707a;';
        del.addEventListener('click', () => {
          config.userAllowlist = normalizeAllowlist(config.userAllowlist).filter((x) => x.mid !== u.mid);
          saveConfig(config);
          renderPanel();
        });
        row.appendChild(n);
        row.appendChild(del);
        box.appendChild(row);
      }
    }
    body.appendChild(box);
  }

  function renderPanel() {
    const body = document.getElementById('bcf-panel-body');
    if (!body) return;
    body.innerHTML = '';

    // 命中明细（置顶）
    body.appendChild(sectionHead('本次浏览 · 命中明细'));
    const hitsBox = document.createElement('div');
    hitsBox.id = 'bcf-hits-box';
    body.appendChild(hitsBox);
    renderHits();

    // 基础
    body.appendChild(sectionHead('基础规则'));
    body.appendChild(rowSwitch('总开关', '关闭后所有过滤停止', 'enabled'));
    body.appendChild(rowSwitch('过滤「开头是 @」的一级评论', '楼中楼的 @ 回复永不受此规则影响', 'blockAtPrefix'));

    // 等级与豁免（v2）
    body.appendChild(sectionHead('等级与豁免'));
    body.appendChild(
      rowSwitch('按 B站账号等级屏蔽', '默认关：低等级≠是鱼，建议先开预览模式验证；等级取不到一律放行', 'levelEnabled')
    );

    const lvRow = document.createElement('div');
    lvRow.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:9px 0;border-top:1px solid #16292d;';
    const lvLabel = document.createElement('span');
    lvLabel.textContent = '屏蔽等级不高于';
    const lvSel = document.createElement('select');
    for (let n = 0; n <= 6; n++) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = 'Lv' + n;
      lvSel.appendChild(opt);
    }
    lvSel.value = String(clampLevel(config.blockLevelUpTo));
    lvSel.style.cssText =
      'padding:6px 10px;border-radius:7px;border:1px solid #1b3237;background:#081113;color:#e7f3f2;' +
      'font:inherit;font-size:12.5px;outline:none;';
    lvSel.addEventListener('change', () => {
      update({ blockLevelUpTo: clampLevel(lvSel.value) });
    });
    lvRow.appendChild(lvLabel);
    lvRow.appendChild(lvSel);
    body.appendChild(lvRow);

    body.appendChild(rowSwitch('豁免 UP 主本人的评论', '', 'exemptUp'));
    body.appendChild(rowSwitch('豁免我关注的人', '需要 B站登录态，未登录自动无效果', 'exemptFollowed'));
    body.appendChild(rowSwitch('豁免认证账号', '个人/机构认证号几乎不会是 agent', 'exemptVerified'));
    body.appendChild(rowSwitch('豁免自己发的评论', '', 'exemptSelf'));
    body.appendChild(rowSwitch('豁免 UP 主置顶评论', '', 'exemptPinned'));

    body.appendChild(sectionHead('用户白名单'));
    renderAllowRows(body);

    // 关键词
    body.appendChild(sectionHead('关键词屏蔽'));
    body.appendChild(rowSwitch('启用关键词屏蔽', '', 'keywordEnabled'));
    body.appendChild(rowSwitch('关键词只作用于「带 @ 的评论」', 'A 档（鱼的专属自称）不受此限制；强烈建议保持开启', 'keywordsOnlyOnAt'));
    body.appendChild(rowSwitch('关键词也作用于楼中楼', '', 'keywordsInNested'));

    // 词库
    body.appendChild(sectionHead('内置「鱼味关键词」（来自真实样本）'));
    for (const kw of KEYWORDS) {
      const ov = (config.keywordOverrides || {})[kw.id] || {};
      const enabled = ov.enabled === undefined ? kw.enabled : !!ov.enabled;

      const r = document.createElement('div');
      r.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #16292d;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = enabled;
      cb.style.cssText = 'width:16px;height:16px;accent-color:#35c0b0;cursor:pointer;';

      const name = document.createElement('span');
      name.textContent = kw.text;
      name.style.cssText = 'font-family:ui-monospace,Consolas,monospace;font-size:12.5px;font-weight:600;min-width:88px;';

      const tier = document.createElement('span');
      tier.textContent = kw.tier + ' 档';
      const colors = { A: '#62d39b', B: '#7ea6ff', C: '#e0ab5c' };
      tier.style.cssText = `font-size:10.5px;color:${colors[kw.tier] || '#587175'};flex:0 0 auto;`;

      const sample = document.createElement('span');
      sample.textContent = kw.sample || '';
      sample.style.cssText = 'font-size:11px;color:#587175;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      sample.title = kw.sample || '';

      cb.addEventListener('change', () => {
        const o = Object.assign({}, config.keywordOverrides);
        const cur = Object.assign({}, o[kw.id] || {});
        cur.enabled = cb.checked;
        o[kw.id] = cur;
        update({ keywordOverrides: o });
      });

      r.appendChild(cb);
      r.appendChild(name);
      r.appendChild(tier);
      r.appendChild(sample);
      body.appendChild(r);
    }

    const warn = document.createElement('div');
    warn.style.cssText = 'margin:8px 0 0;font-size:11px;color:#e4707a;line-height:1.55;';
    warn.textContent =
      '⚠ C 档（肥鱼/大肥鱼/小肥鱼）在「专门讨论鱼」的视频里真人也会大量使用，开启会误杀，建议先开预览模式验证。';
    body.appendChild(warn);

    // 自定义词（v2：档位 + 正则）
    body.appendChild(sectionHead('自定义关键词'));

    const addWrap = document.createElement('div');
    addWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '输入要屏蔽的词或正则';
    input.style.cssText =
      'flex:1;min-width:150px;padding:7px 10px;border-radius:7px;border:1px solid #1b3237;background:#081113;' +
      'color:#e7f3f2;font:inherit;font-size:12.5px;outline:none;';

    const tierSel = document.createElement('select');
    tierSel.style.cssText =
      'padding:7px 8px;border-radius:7px;border:1px solid #1b3237;background:#081113;color:#e7f3f2;font:inherit;font-size:12px;outline:none;';
    for (const [v, t] of [
      ['B', 'B 档 · 仅 @ 评论'],
      ['A', 'A 档 · 无需 @']
    ]) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = t;
      tierSel.appendChild(opt);
    }

    const regexWrap = document.createElement('label');
    regexWrap.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#b9cfcd;cursor:pointer;';
    const regexCb = document.createElement('input');
    regexCb.type = 'checkbox';
    regexCb.style.cssText = 'accent-color:#35c0b0;';
    regexWrap.appendChild(regexCb);
    const regexText = document.createElement('span');
    regexText.textContent = '正则';
    regexWrap.appendChild(regexText);

    const addBtn = document.createElement('button');
    addBtn.textContent = '添加';
    addBtn.style.cssText =
      'padding:7px 14px;border-radius:7px;border:1px solid rgba(53,192,176,.42);background:rgba(53,192,176,.18);' +
      'color:#9fe6dc;font:inherit;font-size:12.5px;cursor:pointer;';

    const errHint = document.createElement('div');
    errHint.style.cssText = 'font-size:11px;color:#e4707a;min-height:14px;margin:-4px 0 4px;';

    const doAdd = () => {
      const raw = input.value.trim();
      if (!raw) {
        errHint.textContent = '请输入要屏蔽的词。';
        return;
      }
      const tier = tierSel.value === 'A' ? 'A' : 'B';
      const isRegex = regexCb.checked;
      if (!isRegex && raw.length < 2) {
        errHint.textContent = '太短了，容易误伤，建议至少 2 个字。';
        return;
      }
      if (isRegex) {
        try {
          new RegExp(raw, 'i');
        } catch (e) {
          errHint.textContent = '正则不合法：' + (e && e.message ? e.message : '');
          return;
        }
      }
      const list = normalizeCustomKeywords(config.customKeywords || []);
      const lowered = raw.toLowerCase();
      if (list.some((x) => x.text.toLowerCase() === lowered)) {
        errHint.textContent = '这个词已经在列表里了。';
        return;
      }
      const builtinHit = KEYWORDS.find((k) => k.text.toLowerCase() === lowered);
      if (builtinHit && !((config.keywordOverrides || {})[builtinHit.id] || {}).deleted) {
        errHint.textContent = '这是内置词，请直接在上方启用/停用。';
        return;
      }
      errHint.textContent = '';
      const entry = isRegex ? { text: raw, tier, regex: true } : { text: raw, tier };
      update({ customKeywords: list.concat([entry]) });
      input.value = '';
      renderPanel();
    };
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAdd();
    });

    addWrap.appendChild(input);
    addWrap.appendChild(tierSel);
    addWrap.appendChild(regexWrap);
    addWrap.appendChild(addBtn);
    body.appendChild(addWrap);
    body.appendChild(errHint);

    const customList = normalizeCustomKeywords(config.customKeywords || []);
    if (!customList.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11.5px;color:#587175;padding:4px 0;';
      empty.textContent = '还没有自定义关键词';
      body.appendChild(empty);
    } else {
      for (const item of customList) {
        const r = document.createElement('div');
        r.style.cssText =
          'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;' +
          'border-top:1px solid #16292d;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;';

        const left = document.createElement('span');
        left.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';
        const n = document.createElement('span');
        n.textContent = item.regex ? '/' + item.text + '/i' : item.text;
        n.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const tag = document.createElement('span');
        tag.textContent = '自定义 · ' + item.tier + ' 档' + (item.regex ? ' · 正则' : '');
        tag.style.cssText = 'font-size:10px;color:#587175;font-family:inherit;flex:0 0 auto;';
        left.appendChild(n);
        left.appendChild(tag);

        const del = document.createElement('span');
        del.textContent = '删除';
        del.style.cssText = 'cursor:pointer;font-size:11.5px;color:#e4707a;font-family:inherit;flex:0 0 auto;';
        del.addEventListener('click', () => {
          update({
            customKeywords: normalizeCustomKeywords(config.customKeywords || []).filter(
              (x) => !(x.text === item.text && x.regex === item.regex)
            )
          });
          renderPanel();
        });

        r.appendChild(left);
        r.appendChild(del);
        body.appendChild(r);
      }
    }

    // 预览与显示
    body.appendChild(sectionHead('预览与显示'));
    body.appendChild(rowSwitch('预览模式（只统计不隐藏）', '验证规则是否误伤，确认后再关闭', 'previewOnly'));
    body.appendChild(rowSwitch('显示右下角浮标', '点浮标打开本面板', 'showPill'));

    // 数据（v2：与扩展版互通同一 JSON 格式）
    body.appendChild(sectionHead('数据'));
    const dataRow = document.createElement('div');
    dataRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

    const btnBase =
      'padding:7px 14px;border-radius:7px;border:1px solid rgba(53,192,176,.42);background:rgba(53,192,176,.18);' +
      'color:#9fe6dc;font:inherit;font-size:12.5px;cursor:pointer;';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.textContent = '导出配置';
    exportBtn.style.cssText = btnBase;
    exportBtn.addEventListener('click', exportSettings);

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.textContent = '导入配置';
    importBtn.style.cssText = btnBase;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importSettingsFromFile(f);
      e.target.value = '';
    });
    importBtn.addEventListener('click', () => fileInput.click());

    dataRow.appendChild(exportBtn);
    dataRow.appendChild(importBtn);
    dataRow.appendChild(fileInput);
    body.appendChild(dataRow);

    const dataHint = document.createElement('div');
    dataHint.id = 'bcf-data-hint';
    dataHint.style.cssText = 'font-size:11px;color:#587175;min-height:15px;margin-top:4px;';
    body.appendChild(dataHint);

    // 页脚
    const foot = document.getElementById('bcf-panel-foot');
    if (foot) {
      foot.textContent =
        '改动需刷新页面生效 · 配置存本机 localStorage（键 ' + STORE_KEY + '），不上传 · 清塘 v' + SCRIPT_VERSION;
    }
  }

  /** 导出/导入：与扩展版同一 JSON 结构 {app:'qingtang', version, exportedAt, settings} */
  const EXPORT_KEYS = [
    'enabled', 'blockAtPrefix', 'keywordEnabled', 'keywordsOnlyOnAt', 'keywordsInNested',
    'exemptSelf', 'exemptPinned', 'previewOnly', 'showPill', 'theme',
    'levelEnabled', 'blockLevelUpTo', 'exemptUp', 'exemptFollowed', 'exemptVerified',
    'keywordOverrides', 'customKeywords', 'userAllowlist'
  ];
  const BOOL_SET = new Set([
    'enabled', 'blockAtPrefix', 'keywordEnabled', 'keywordsOnlyOnAt', 'keywordsInNested',
    'exemptSelf', 'exemptPinned', 'previewOnly', 'showPill',
    'levelEnabled', 'exemptUp', 'exemptFollowed', 'exemptVerified'
  ]);
  const THEME_VALUES = ['auto', 'dark', 'light'];

  function exportSettings() {
    const payload = {
      app: 'qingtang',
      version: SCRIPT_VERSION,
      exportedAt: new Date().toISOString(),
      settings: {}
    };
    for (const k of EXPORT_KEYS) {
      if (config[k] !== undefined) payload.settings[k] = config[k];
    }
    const stamp = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fname =
      `qingtang-settings-v${SCRIPT_VERSION}-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.json`;
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setHint('已导出 ' + fname);
    } catch (e) {
      setHint('导出失败：' + (e && e.message ? e.message : e));
    }
  }

  function sanitizeImported(rawSettings) {
    const src = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    const out = {};
    for (const k of BOOL_SET) {
      if (typeof src[k] === 'boolean') out[k] = src[k];
    }
    if (THEME_VALUES.includes(src.theme)) out.theme = src.theme;
    const lv = Math.trunc(Number(src.blockLevelUpTo));
    if (Number.isFinite(lv)) out.blockLevelUpTo = Math.min(6, Math.max(0, lv));

    if (src.keywordOverrides && typeof src.keywordOverrides === 'object' && !Array.isArray(src.keywordOverrides)) {
      const ov = {};
      for (const [id, v] of Object.entries(src.keywordOverrides)) {
        if (v && typeof v === 'object') {
          const entry = {};
          if (typeof v.enabled === 'boolean') entry.enabled = v.enabled;
          if (typeof v.deleted === 'boolean') entry.deleted = v.deleted;
          if (Object.keys(entry).length) ov[id] = entry;
        }
      }
      out.keywordOverrides = ov;
    }

    if (Array.isArray(src.customKeywords)) out.customKeywords = normalizeCustomKeywords(src.customKeywords);
    if (Array.isArray(src.userAllowlist)) out.userAllowlist = normalizeAllowlist(src.userAllowlist);

    return out;
  }

  function setHint(text) {
    const el = document.getElementById('bcf-data-hint');
    if (el) el.textContent = text;
  }

  function importSettingsFromFile(file) {
    const reader = new FileReader();
    reader.onerror = () => setHint('读取文件失败。');
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch {
        setHint('不是合法的 JSON 文件。');
        return;
      }
      const candidate = data && data.settings && typeof data.settings === 'object' ? data.settings : data;
      const clean = sanitizeImported(candidate);
      const keys = Object.keys(clean);
      if (!keys.length) {
        setHint('文件里没有可识别的清塘设置项，未做任何改动。');
        return;
      }
      update(clean);
      setHint(`已导入 ${keys.length} 项设置，刷新页面后生效。`);
      renderPanel();
    };
    reader.readAsText(file, 'utf-8');
  }

  // 暴露调试入口
  window.__BCF_DEBUG__ = {
    version: SCRIPT_VERSION,
    getTally: () => Object.assign({}, tally),
    getHits: () => hits.slice(),
    isDegraded: () => degraded,
    getConfig: () => Object.assign({}, config),
    openPanel
  };
})();

