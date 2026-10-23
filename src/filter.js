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
