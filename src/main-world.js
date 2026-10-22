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
    keywords: []
  };

  /** 命中计数（跨请求累计，用于浮标显示） */
  const tally = { at: 0, kw: 0, scanned: 0 };
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

  function flushStats(force) {
    if (statsTimer && !force) return;
    if (statsTimer) return;
    statsTimer = setTimeout(() => {
      statsTimer = null;
      try {
        const payload = JSON.stringify({
          at: tally.at,
          kw: tally.kw,
          scanned: tally.scanned
        });
        document.documentElement.setAttribute('data-bcf-stats', payload);
        document.dispatchEvent(new Event(EVT_STATS));
      } catch {
        /* 忽略 */
      }
    }, 120);
  }

  /** ── 过滤主逻辑 ─────────────────────────────────────────── */

  const F = NS.filter;
  if (!F) return; // filter.js 未就绪则放弃（不该发生）

  /**
   * 处理一组 reply
   * @returns {{list:any[], changed:boolean}}
   */
  function processReplies(list, cfg, opts) {
    if (!Array.isArray(list)) return { list, changed: false };

    const o = opts || {};
    const selfMid = cfg.exemptSelf ? getSelfMid() : null;
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

      const reason = F.shouldBlock(reply, cfg, {
        nested: !!o.nested,
        isPinned: !!o.pinned,
        isSelf
      });

      if (reason) {
        if (reason === 'at') tally.at += 1;
        else tally.kw += 1;

        // 预览模式：只统计，不隐藏
        if (!cfg.previewOnly) {
          changed = true;
          continue; // 丢弃这条
        }
      }

      out.push(reply);

      // 一级评论里内嵌的「楼中楼预览」也要处理
      if (Array.isArray(reply.replies) && reply.replies.length) {
        const sub = processReplies(reply.replies, cfg, { nested: true, pinned: false });
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

    if (isNestedApi) {
      // 楼中楼接口：全部按 nested 处理，结构规则不生效
      const r = processReplies(root.replies, cfg, { nested: true, pinned: false });
      if (r.changed) {
        root.replies = r.list;
        changed = true;
      }
      return changed;
    }

    // 一级评论接口
    if (!cfg.exemptPinned) {
      const r = processReplies(root.top_replies, cfg, { nested: false, pinned: true });
      if (r.changed) {
        root.top_replies = r.list;
        changed = true;
      }
    }

    for (const key of ['replies', 'hots']) {
      const r = processReplies(root[key], cfg, { nested: false, pinned: false });
      if (r.changed) {
        root[key] = r.list;
        changed = true;
      }
    }

    return changed;
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
        if (isTargetUrl(url)) {
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
    resetTally: () => {
      tally.at = 0;
      tally.kw = 0;
      tally.scanned = 0;
      flushStats(true);
    }
  };

  flushStats(true);
})();
