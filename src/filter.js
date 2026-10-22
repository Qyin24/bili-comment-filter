/**
 * filter.js — 判定逻辑（纯函数，零依赖）
 *
 * 刻意不依赖 chrome.* / DOM API，这样：
 *   1. 扩展与油猴脚本可以共用同一份逻辑
 *   2. 可以单独在 Node 里跑单测
 *
 * 输入是 B站评论接口的原始 reply 对象，形如：
 *   { rpid, member: {mid, uname}, content: {message, members: [...]} }
 */
(() => {
  const NS = (globalThis.__BCF__ = globalThis.__BCF__ || {});
  if (NS.filter) return;

  const LEADING_AT = /^\s*@/; // \s 含全角空格 U+3000

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
   * 核心判定
   * @param {object} reply     B站 reply 对象
   * @param {object} cfg       有效配置
   * @param {object} [ctx]     { nested:boolean, isPinned:boolean, isSelf:boolean }
   * @returns {null|'at'|string}  null=放行；'at'=结构规则命中；'kw:xxx'=关键词命中
   */
  function shouldBlock(reply, cfg, ctx) {
    const c = cfg || {};
    const x = ctx || {};
    if (!c.enabled) return null;

    const message = (reply && reply.content && reply.content.message) || '';

    // 豁免：自己发的 / UP主置顶
    if (c.exemptSelf && x.isSelf) return null;
    if (c.exemptPinned && x.isPinned) return null;

    // ── 规则一：一级评论以 @ 开头 ─────────────────────────────
    // 楼中楼永不触发（真人回复全靠 @）
    if (!x.nested && c.blockAtPrefix) {
      if (isLeadingAt(message) && mentionCount(reply) >= 1) {
        return 'at';
      }
    }

    // ── 规则二：关键词 ────────────────────────────────────────
    if (c.keywordEnabled) {
      const kws = c.keywords || [];
      if (kws.length) {
        if (x.nested && !c.keywordsInNested) return null;

        const lower = message.toLowerCase();

        // 「仅作用于 @ 评论」：A 档（鱼的专属自称）不受此限制，其余档位受限
        const atPresent =
          mentionCount(reply) >= 1 || hasAtChar(message);

        for (const kw of kws) {
          // 兼容纯字符串与 {text,tier} 两种写法
          const text = typeof kw === 'string' ? kw : kw && kw.text;
          if (!text) continue;
          const tier = typeof kw === 'string' ? 'B' : kw.tier || 'B';

          if (c.keywordsOnlyOnAt && tier !== 'A' && !atPresent) continue;

          if (lower.includes(String(text).toLowerCase())) return 'kw:' + text;
        }
      }
    }

    return null;
  }

  NS.filter = { shouldBlock, isLeadingAt, mentionCount, hasAtChar };
})();
