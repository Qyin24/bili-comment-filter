/**
 * main-world.js — 运行在页面主世界（world: "MAIN"）
 *
 * 职责：
 *   1. 钩住 window.fetch 与 XMLHttpRequest
 *   2. 只处理 B站评论接口的响应
 *   3. 在数据渲染进 DOM 之前把「鱼」从数组里摘掉 → 零闪动、无布局抖动
 *   4. 把命中计数回传给 content-bridge
 *
 * 为什么必须在主世界：
 *   MV3 的 declarativeNetRequest 只能改请求、改不了响应体。
 *   要在数据层过滤，必须活在被页面 JS 使用的那个环境里。
 *
 * 为什么不需要重算签名：
 *   我们只读取并改写「响应体」，请求参数（含 w_rid / wts 的 WBI 签名）原封不动，
 *   所以签名始终有效。
 */
(() => {
  const NS = (globalThis.__BCF__ = globalThis.__BCF__ || {});
  if (NS.__mainWorldInstalled) return;
  NS.__mainWorldInstalled = true;

  const CONFIG_EL_ID = '__bcf-config';
  const EVT_CONFIG = '__bcf:config';
  const EVT_STATS = '__bcf:stats';

  const DEFAULT_CONFIG = {
    enabled: true,
    blockAtPrefix: true,
    keywordEnabled: true,
    keywordsOnlyOnAt: true,
    keywordsInNested: true,
    exemptSelf: true,
    exemptPinned: true,
    previewOnly: false,
    keywords: [],
    // ── v2 新增 ──
    levelEnabled: false,
    blockLevelUpTo: 1,
    exemptUp: true,
    exemptFollowed: true,
    exemptVerified: true,
    userAllowlist: []
  };

  /** 命中计数（跨请求累计，用于浮标显示） */
  const tally = { at: 0, kw: 0, lv: 0, scanned: 0 };

  /**
   * 命中明细（仅内存，刷新即清，不落盘不上传）
   * 每条：{ rpid, mid, uname, excerpt, reason, level, blocked }
   */
  const hits = [];
  const HITS_MAX = 50;

  /** 接口结构自检：目标接口返回了却找不到任何评论数组 → 视为可能失效 */
  let degraded = false;
  let degradedWarned = false;

  let statsTimer = null;

  /** ── 配置读取 ───────────────────────────────────────────── */

  let config = Object.assign({}, DEFAULT_CONFIG);
  let configLoaded = false;

  function readConfigFromDom() {
    const el = document.getElementById(CONFIG_EL_ID);
    if (!el) return null;
    try {
      const raw = el.textContent || '';
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function applyConfigFromDom() {
    const c = readConfigFromDom();
    if (c && typeof c === 'object') {
      config = Object.assign({}, DEFAULT_CONFIG, c);
      configLoaded = true;
    }
  }

  applyConfigFromDom();
  document.addEventListener(EVT_CONFIG, applyConfigFromDom);

  /** ── 当前登录用户 mid（用于「豁免自己发的」）─────────────── */

  function getSelfMid() {
    try {
      const m = document.cookie.match(/(?:^|;\s*)DedeUserID=(\d+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  /** ── 统计回传 ───────────────────────────────────────────── */

  /** 真正写 DOM 属性并派发事件（stats + hits 两个通道） */
  function doFlushStats() {
    try {
      const payload = JSON.stringify({
        at: tally.at,
        kw: tally.kw,
        lv: tally.lv,
        scanned: tally.scanned,
        degraded
      });
      document.documentElement.setAttribute('data-bcf-stats', payload);
      // 命中明细：最多 HITS_MAX 条，字段已在写入侧截断
      document.documentElement.setAttribute(
        'data-bcf-hits',
        JSON.stringify(hits)
      );
      document.dispatchEvent(new Event(EVT_STATS));
    } catch {
      /* 忽略 */
    }
  }

  /**
   * 节流上报。
   * v1 这里 force 分支被两个 if 双重短路，等于死代码；v2 修正：
   * force=true 取消待发定时器并立即刷新。
   * @param {boolean} [force]
   */
  function flushStats(force) {
    if (force) {
      if (statsTimer) {
        clearTimeout(statsTimer);
        statsTimer = null;
      }
      doFlushStats();
      return;
    }
    if (statsTimer) return;
    statsTimer = setTimeout(() => {
      statsTimer = null;
      doFlushStats();
    }, 120);
  }

  /** ── 过滤主逻辑 ─────────────────────────────────────────── */

  const F = NS.filter;
  if (!F) return; // filter.js 未就绪则放弃（不该发生）

  /**
   * 记录一条命中摘要（供浮标明细面板排查误伤）。
   * 预览与拦截两种模式都记录——面板的意义正是「让你看清杀了谁」。
   * @param {object} reply
   * @param {string} reason 'at' | 'lv' | 'kw:xxx'
   * @param {object} cfg
   */
  function recordHit(reply, reason, cfg) {
    try {
      const msg = String((reply && reply.content && reply.content.message) || '');
      hits.unshift({
        rpid: String((reply && (reply.rpid_str || reply.rpid)) || ''),
        mid: F.authorMid(reply),
        uname: String((reply && reply.member && reply.member.uname) || '').slice(0, 12),
        excerpt: msg.slice(0, 40),
        reason,
        level: F.extractLevel(reply),
        blocked: !cfg.previewOnly
      });
      if (hits.length > HITS_MAX) hits.length = HITS_MAX;
    } catch {
      /* 忽略 */
    }
  }

  /**
   * 处理一组 reply
   * @returns {{list:any[], changed:boolean}}
   */
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

      const isSelf =
        !!selfMid &&
        reply.member &&
        String(reply.member.mid) === String(selfMid);
      const isUp = !!upMid && F.authorMid(reply) === upMid;

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

        // 预览模式：只统计，不隐藏
        if (!cfg.previewOnly) {
          changed = true;
          continue; // 丢弃这条
        }
      }

      out.push(reply);

      // 一级评论里内嵌的「楼中楼预览」也要处理
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

  /**
   * 处理整个响应体
   * @returns {boolean} 是否发生了改动
   */
  function processPayload(data, url) {
    // 兜底：万一首个响应来得比配置还早，这里补读一次
    if (!configLoaded) applyConfigFromDom();

    if (!data || typeof data !== 'object') return false;
    const root = data.data;
    if (!root || typeof root !== 'object') return false;

    const cfg = config;
    if (!cfg.enabled) return false;

    let changed = false;
    const isNestedApi = /\/x\/v2\/reply\/reply/.test(url);

    // ── 结构自检（v2）─────────────────────────────────────
    // code===0 却找不到任何已知评论数组 → B站大概率改版了，
    // 过滤会静默失效，这里至少让用户和 console 知道。
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

    // UP 主 mid（豁免 UP 本人用）；未登录响应也带这个字段
    const upMid = root.upper && root.upper.mid ? String(root.upper.mid) : '';

    if (isNestedApi) {
      // 楼中楼接口：全部按 nested 处理，结构规则不生效
      const r = processReplies(root.replies, cfg, { nested: true, pinned: false, upMid });
      if (r.changed) {
        root.replies = r.list;
        changed = true;
      }
      return changed;
    }

    // 一级评论接口
    if (!cfg.exemptPinned) {
      const r = processReplies(root.top_replies, cfg, { nested: false, pinned: true, upMid });
      if (r.changed) {
        root.top_replies = r.list;
        changed = true;
      }
    }

    for (const key of ['replies', 'hots']) {
      const r = processReplies(root[key], cfg, { nested: false, pinned: false, upMid });
      if (r.changed) {
        root[key] = r.list;
        changed = true;
      }
    }

    return changed;
  }

  /** 结构自检置位 + 一次性告警 */
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

  /** ── 目标 URL 判定 ──────────────────────────────────────── */

  // B站评论接口的几种形态。多列几个是为了抗改版：
  // 万一哪天 wbi/main 换成 main 或 lazy，仍然能接住。
  // 误匹配也无害——非评论接口没有 replies 数组，处理函数会直接空转。
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

  /** ── 钩子一：fetch ──────────────────────────────────────── */

  const origFetch = globalThis.fetch;
  if (typeof origFetch === 'function') {
    globalThis.fetch = function patchedFetch(input, init) {
      const url =
        typeof input === 'string'
          ? input
          : input && typeof input.url === 'string'
            ? input.url
            : '';

      if (!isTargetUrl(url)) {
        return origFetch.apply(this, arguments);
      }

      // v2 性能：配置已就绪且确认总开关关闭 → 不 clone、不读大响应体
      if (configLoaded && config.enabled === false) {
        return origFetch.apply(this, arguments);
      }

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

  /** ── 钩子二：XMLHttpRequest（兜底，B站当前主要用 fetch）─── */

  const XHR = globalThis.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;

    XHR.prototype.open = function patchedOpen(method, url) {
      try {
        this.__bcfUrl = String(url || '');
      } catch {
        /* 忽略 */
      }
      return origOpen.apply(this, arguments);
    };

    XHR.prototype.send = function patchedSend() {
      try {
        const url = this.__bcfUrl || '';
        if (isTargetUrl(url) && !(configLoaded && config.enabled === false)) {
          const xhr = this;
          xhr.addEventListener('readystatechange', () => {
            if (xhr.readyState !== 4) return;
            try {
              rewriteXhr(xhr, url);
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
  }

  function rewriteXhr(xhr, url) {
    if (xhr.__bcfDone) return;
    const rt = xhr.responseType;

    let text = null;
    try {
      if (rt === 'json') {
        text = JSON.stringify(xhr.response);
      } else if (!rt || rt === 'text') {
        const desc = Object.getOwnPropertyDescriptor(
          XHR.prototype,
          'responseText'
        );
        if (desc && typeof desc.get === 'function') {
          text = desc.get.call(xhr);
        }
      }
    } catch {
      return;
    }

    if (!text) {
      xhr.__bcfDone = true;
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      xhr.__bcfDone = true;
      return;
    }

    const changed = processPayload(data, url);
    flushStats();
    xhr.__bcfDone = true;

    if (!changed) return;

    const out = JSON.stringify(data);
    try {
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
    } catch {
      /* 忽略 */
    }
  }

  /** ── 对外暴露少量调试接口 ──────────────────────────────── */

  NS.debug = {
    getConfig: () => config,
    getTally: () => Object.assign({}, tally),
    getHits: () => hits.slice(),
    isDegraded: () => degraded,
    resetTally: () => {
      tally.at = 0;
      tally.kw = 0;
      tally.lv = 0;
      tally.scanned = 0;
      hits.length = 0;
      degraded = false;
      degradedWarned = false;
      flushStats(true);
    }
  };

  flushStats(true);
})();
