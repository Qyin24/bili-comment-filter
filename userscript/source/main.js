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

  const SCRIPT_VERSION = '__BCF_VERSION__';

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
