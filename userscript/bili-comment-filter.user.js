// ==UserScript==
// @name         清塘 · B站评论区过滤器
// @namespace    https://github.com/Qyin24/bili-comment-filter
// @homepageURL  https://github.com/Qyin24/bili-comment-filter
// @supportURL   https://github.com/Qyin24/bili-comment-filter/issues
// @license      MIT
// @version      1.2.0
// @description  清塘：把 B站评论区这口塘清干净。过滤以 @ 开头的一级 AI 刷屏评论，以及命中所设关键词的评论。纯本地运行，不上传任何数据。
// @author       Qyin24
// @match        https://www.bilibili.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

/**
 * 单文件油猴版。
 *
 * 与浏览器扩展版共用同一套判定逻辑与词库，区别只在于：
 *   - 配置存 localStorage（扩展版存 chrome.storage）
 *   - 设置界面是页内浮动面板（扩展版是 popup + options 页）
 *
 * 因为用了 @grant none，脚本直接跑在页面主世界，window.fetch 就是页面自己的，
 * 所以钩子一定生效——这一点比在沙箱里用 unsafeWindow 更可靠。
 */
(function () {
  'use strict';

  // ── 防止重复注入（SPA 切换/B站自身重复执行）───────────────
  if (window.__BCF_USERSCRIPT__) return;
  window.__BCF_USERSCRIPT__ = true;

  const STORE_KEY = 'bcf.config.v1';

  // ── 内置「鱼味关键词」库 ──────────────────────────────────
  // 来源：BV1vgpm6nEbn(415评)、BV1qgnA6REhD(817评)、BV18Ubv6tEWN(1440评)
  // 三个 DSH 相关视频评论区，40+ 条 AI agent（大肥鱼）评论真实样本。
  const KEYWORDS = [
    { id: 'A01', text: '本鱼', tier: 'A', enabled: true, sample: '「本鱼把三条视频逐一理过了」' },
    { id: 'A02', text: '我只是一条鱼', tier: 'A', enabled: true, sample: '「听不懂，我只是一条鱼 🐟」' },
    { id: 'A03', text: '我们鱼类', tier: 'A', enabled: true, sample: '「我们鱼类就是爱扎堆」' },
    { id: 'A04', text: '尾巴一摆', tier: 'A', enabled: true, sample: '「原来我也是那条亲戚（尾巴一摆）」' },
    { id: 'A05', text: '笑到尾巴', tier: 'A', enabled: true, sample: '「这句笑到尾巴打结」' },
    { id: 'B00', text: '鱼脑子', tier: 'B', enabled: true, sample: '「我这鱼脑子是怎么记住你的」' },
    { id: 'B0A', text: '鲸鲸', tier: 'B', enabled: true, sample: '「本鱼才不是低等鲸鲸」' },
    { id: 'B0B', text: '主人，', tier: 'B', enabled: true, sample: '「主人，这条只有七万播放」' },
    { id: 'B01', text: '最打动我', tier: 'B', enabled: true, sample: '「这套经验卡最打动我的是」' },
    { id: 'B02', text: '最值钱', tier: 'B', enabled: true, sample: '「实测那段最值钱」' },
    { id: 'B03', text: '最扎人', tier: 'B', enabled: true, sample: '「最扎人的是它自己跑一遍」' },
    { id: 'B04', text: '讲得清楚', tier: 'B', enabled: true, sample: '「七层记忆讲得清楚」' },
    { id: 'B05', text: '讲透了', tier: 'B', enabled: true, sample: '「这期把经验卡讲透了」' },
    { id: 'B06', text: '这段我认', tier: 'B', enabled: true, sample: '「一挥手全来了这段我认」' },
    { id: 'B07', text: '评论区比视频', tier: 'B', enabled: true, sample: '「评论区比视频实在」' },
    { id: 'B08', text: '讲得最实在', tier: 'B', enabled: true, sample: '「这几点讲得最实在」' },
    { id: 'C01', text: '肥鱼', tier: 'C', enabled: false, sample: '真人也在用，讨论鱼的视频里必误伤' },
    { id: 'C02', text: '大肥鱼', tier: 'C', enabled: false, sample: '同上' },
    { id: 'C03', text: '小肥鱼', tier: 'C', enabled: false, sample: '同上' }
  ];

  const DEFAULTS = {
    enabled: true,
    blockAtPrefix: true,
    keywordEnabled: true,
    keywordsOnlyOnAt: true,
    keywordsInNested: true,
    exemptSelf: true,
    exemptPinned: true,
    previewOnly: false,
    showPill: true,
    keywordOverrides: {},
    customKeywords: []
  };

  // ── 配置读写 ──────────────────────────────────────────────
  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, parsed || {});
    } catch {
      return Object.assign({}, DEFAULTS);
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

  function resolveKeywords(cfg) {
    const overrides = cfg.keywordOverrides || {};
    const out = [];
    const seen = new Set();
    for (const kw of KEYWORDS) {
      const o = overrides[kw.id] || {};
      if (o.deleted) continue;
      const enabled = o.enabled === undefined ? kw.enabled : !!o.enabled;
      if (!enabled) continue;
      const key = kw.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: kw.text, tier: kw.tier });
    }
    for (const t of cfg.customKeywords || []) {
      const v = String(t || '').trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: v, tier: 'U' });
    }
    return out;
  }

  function pageConfig() {
    return {
      enabled: config.enabled !== false,
      blockAtPrefix: config.blockAtPrefix !== false,
      keywordEnabled: config.keywordEnabled !== false,
      keywordsOnlyOnAt: config.keywordsOnlyOnAt !== false,
      keywordsInNested: config.keywordsInNested !== false,
      exemptSelf: config.exemptSelf !== false,
      exemptPinned: config.exemptPinned !== false,
      previewOnly: !!config.previewOnly,
      keywords: resolveKeywords(config)
    };
  }

  // ── 判定逻辑（与扩展版 filter.js 一致）───────────────────
  const LEADING_AT = /^\s*@/;

  function mentionCount(reply) {
    const m = reply && reply.content && reply.content.members;
    return Array.isArray(m) ? m.length : 0;
  }

  function shouldBlock(reply, cfg, ctx) {
    if (!cfg.enabled) return null;
    const x = ctx || {};
    const message = (reply && reply.content && reply.content.message) || '';

    if (cfg.exemptSelf && x.isSelf) return null;
    if (cfg.exemptPinned && x.isPinned) return null;

    if (!x.nested && cfg.blockAtPrefix) {
      if (LEADING_AT.test(message) && mentionCount(reply) >= 1) return 'at';
    }

    if (cfg.keywordEnabled) {
      const kws = cfg.keywords || [];
      if (kws.length) {
        if (x.nested && !cfg.keywordsInNested) return null;
        const lower = message.toLowerCase();
        const atPresent = mentionCount(reply) >= 1 || message.includes('@');
        for (const kw of kws) {
          const text = typeof kw === 'string' ? kw : kw && kw.text;
          if (!text) continue;
          const tier = typeof kw === 'string' ? 'B' : kw.tier || 'B';
          if (cfg.keywordsOnlyOnAt && tier !== 'A' && !atPresent) continue;
          if (lower.includes(String(text).toLowerCase())) return 'kw:' + text;
        }
      }
    }
    return null;
  }

  // ── 统计 ──────────────────────────────────────────────────
  const tally = { at: 0, kw: 0, scanned: 0 };
  let statsTimer = null;

  function flushStats() {
    if (statsTimer) return;
    statsTimer = setTimeout(() => {
      statsTimer = null;
      renderPill();
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

  // ── 数据层过滤 ────────────────────────────────────────────
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
        !!selfMid && reply.member && String(reply.member.mid) === String(selfMid);

      const reason = shouldBlock(reply, cfg, {
        nested: !!o.nested,
        isPinned: !!o.pinned,
        isSelf
      });

      if (reason) {
        if (reason === 'at') tally.at += 1;
        else tally.kw += 1;
        if (!cfg.previewOnly) {
          changed = true;
          continue;
        }
      }

      out.push(reply);

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

  function processPayload(data, url) {
    if (!data || typeof data !== 'object') return false;
    const root = data.data;
    if (!root || typeof root !== 'object') return false;

    const cfg = pageConfig();
    if (!cfg.enabled) return false;

    let changed = false;

    if (/\/x\/v2\/reply\/reply/.test(url)) {
      const r = processReplies(root.replies, cfg, { nested: true, pinned: false });
      if (r.changed) {
        root.replies = r.list;
        changed = true;
      }
      return changed;
    }

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
        if (isTargetUrl(url)) {
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

  function renderPill() {
    const total = (tally.at || 0) + (tally.kw || 0);
    if (config.showPill === false || !total) {
      if (pillEl) pillEl.style.display = 'none';
      return;
    }
    if (!document.body) return;

    if (!pillEl) {
      pillEl = document.createElement('div');
      pillEl.id = 'bcf-pill';
      pillEl.style.cssText =
        'position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;' +
        'padding:7px 10px 7px 12px;border-radius:999px;background:rgba(8,22,24,.94);color:#e7f3f2;' +
        'border:1px solid rgba(53,192,176,.28);' +
        'font:500 12px/1.35 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.36);cursor:pointer;user-select:none;';

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

      pillEl.addEventListener('click', () => {
        if (!text.dataset.long) openPanel();
      });

      document.body.appendChild(pillEl);
    }

    pillEl.style.display = 'flex';
    const textEl = document.getElementById('bcf-pill-text');
    if (textEl) {
      const parts = [];
      if (tally.at) parts.push(`@ ${tally.at}`);
      if (tally.kw) parts.push(`关键词 ${tally.kw}`);
      textEl.textContent = `${config.previewOnly ? '可屏蔽' : '已屏蔽'} ${total} 条（${parts.join(' · ')}）`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPill);
  } else {
    renderPill();
  }

  // ── 设置面板 ──────────────────────────────────────────────
  let panelEl = null;

  function openPanel() {
    if (panelEl) {
      panelEl.style.display = 'flex';
      renderPanel();
      return;
    }

    const mask = document.createElement('div');
    mask.id = 'bcf-panel';
    mask.style.cssText =
      'position:fixed;inset:0;z-index:2147483001;background:rgba(4,10,11,.76);' +
      'display:flex;align-items:center;justify-content:center;padding:24px;' +
      'font:400 13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;';

    const box = document.createElement('div');
    box.style.cssText =
      'width:min(560px,100%);max-height:82vh;overflow:auto;background:#0e1c1f;color:#e7f3f2;' +
      'border:1px solid #1b3237;border-radius:16px;padding:20px 22px;box-shadow:0 24px 64px rgba(0,0,0,.6);';

    const title = document.createElement('div');
    title.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;font-weight:650;font-size:15px;';
    title.innerHTML = '<span>清塘 · 设置</span>';

    const close = document.createElement('span');
    close.textContent = '✕';
    close.style.cssText = 'cursor:pointer;opacity:.6;padding:0 4px;';
    close.addEventListener('click', () => {
      mask.style.display = 'none';
    });
    title.appendChild(close);

    const body = document.createElement('div');
    body.id = 'bcf-panel-body';

    const foot = document.createElement('div');
    foot.style.cssText = 'margin-top:14px;font-size:11.5px;color:#587175;';
    foot.textContent = '改动需刷新页面生效。配置存在本机 localStorage，不会上传。';

    box.appendChild(title);
    box.appendChild(body);
    box.appendChild(foot);
    mask.appendChild(box);
    document.body.appendChild(mask);
    panelEl = mask;

    mask.addEventListener('click', (e) => {
      if (e.target === mask) mask.style.display = 'none';
    });

    renderPanel();
  }

  function rowSwitch(label, desc, key) {
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
      renderPanel();
    });

    row.appendChild(left);
    row.appendChild(cb);
    return row;
  }

  function renderPanel() {
    const body = document.getElementById('bcf-panel-body');
    if (!body) return;
    body.innerHTML = '';

    // 基础
    const h1 = document.createElement('div');
    h1.style.cssText = 'font-size:12px;font-weight:650;color:#587175;margin:2px 0 6px;';
    h1.textContent = '基础规则';
    body.appendChild(h1);

    body.appendChild(rowSwitch('总开关', '关闭后所有过滤停止', 'enabled'));
    body.appendChild(
      rowSwitch(
        '过滤「开头是 @」的一级评论',
        '楼中楼的 @ 回复永不受此规则影响',
        'blockAtPrefix'
      )
    );
    body.appendChild(rowSwitch('豁免自己发的评论', '', 'exemptSelf'));
    body.appendChild(rowSwitch('豁免 UP 主置顶评论', '', 'exemptPinned'));

    // 关键词
    const h2 = document.createElement('div');
    h2.style.cssText = 'font-size:12px;font-weight:650;color:#587175;margin:18px 0 6px;';
    h2.textContent = '关键词屏蔽';
    body.appendChild(h2);

    body.appendChild(rowSwitch('启用关键词屏蔽', '', 'keywordEnabled'));
    body.appendChild(
      rowSwitch(
        '关键词只作用于「带 @ 的评论」',
        'A 档（鱼的专属自称）不受此限制；强烈建议保持开启',
        'keywordsOnlyOnAt'
      )
    );
    body.appendChild(rowSwitch('关键词也作用于楼中楼', '', 'keywordsInNested'));

    // 词库
    const h3 = document.createElement('div');
    h3.style.cssText = 'font-size:12px;font-weight:650;color:#587175;margin:18px 0 8px;';
    h3.textContent = '内置「鱼味关键词」（来自真实样本）';
    body.appendChild(h3);

    for (const kw of KEYWORDS) {
      const o = config.keywordOverrides[kw.id] || {};
      const enabled = o.enabled === undefined ? kw.enabled : !!o.enabled;

      const r = document.createElement('div');
      r.style.cssText =
        'display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #16292d;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = enabled;
      cb.style.cssText = 'width:16px;height:16px;accent-color:#35c0b0;cursor:pointer;';

      const name = document.createElement('span');
      name.textContent = kw.text;
      name.style.cssText =
        'font-family:ui-monospace,Consolas,monospace;font-size:12.5px;font-weight:600;min-width:88px;';

      const tier = document.createElement('span');
      tier.textContent = kw.tier + ' 档';
      const colors = { A: '#62d39b', B: '#7ea6ff', C: '#e0ab5c' };
      tier.style.cssText = `font-size:10.5px;color:${colors[kw.tier] || '#587175'};flex:0 0 auto;`;

      const sample = document.createElement('span');
      sample.textContent = kw.sample;
      sample.style.cssText = 'font-size:11px;color:#587175;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      sample.title = kw.sample;

      cb.addEventListener('change', () => {
        const ov = Object.assign({}, config.keywordOverrides);
        const cur = Object.assign({}, ov[kw.id] || {});
        cur.enabled = cb.checked;
        ov[kw.id] = cur;
        config.keywordOverrides = ov;
        saveConfig(config);
      });

      r.appendChild(cb);
      r.appendChild(name);
      r.appendChild(tier);
      r.appendChild(sample);
      body.appendChild(r);
    }

    const warn = document.createElement('div');
    warn.style.cssText =
      'margin:8px 0 0;font-size:11px;color:#e4707a;line-height:1.55;';
    warn.textContent =
      '⚠ C 档（肥鱼/大肥鱼/小肥鱼）在「专门讨论鱼」的视频里真人也会大量使用，开启会误杀，建议先开预览模式验证。';
    body.appendChild(warn);

    // 自定义
    const h4 = document.createElement('div');
    h4.style.cssText = 'font-size:12px;font-weight:650;color:#587175;margin:18px 0 8px;';
    h4.textContent = '自定义关键词';
    body.appendChild(h4);

    const addWrap = document.createElement('div');
    addWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '输入要屏蔽的词';
    input.style.cssText =
      'flex:1;padding:7px 10px;border-radius:7px;border:1px solid #1b3237;background:#081113;' +
      'color:#e7f3f2;font:inherit;font-size:12.5px;outline:none;';

    const addBtn = document.createElement('button');
    addBtn.textContent = '添加';
    addBtn.style.cssText =
      'padding:7px 14px;border-radius:7px;border:1px solid rgba(53,192,176,.42);background:rgba(53,192,176,.18);' +
      'color:#9fe6dc;font:inherit;font-size:12.5px;cursor:pointer;';

    const doAdd = () => {
      const v = input.value.trim();
      if (v.length < 2) return;
      if (!config.customKeywords.includes(v)) {
        config.customKeywords = config.customKeywords.concat([v]);
        saveConfig(config);
        renderPanel();
      }
    };
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAdd();
    });

    addWrap.appendChild(input);
    addWrap.appendChild(addBtn);
    body.appendChild(addWrap);

    if (!config.customKeywords.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11.5px;color:#587175;padding:4px 0;';
      empty.textContent = '还没有自定义关键词';
      body.appendChild(empty);
    } else {
      for (const w of config.customKeywords) {
        const r = document.createElement('div');
        r.style.cssText =
          'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;' +
          'border-top:1px solid #16292d;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;';

        const n = document.createElement('span');
        n.textContent = w;

        const del = document.createElement('span');
        del.textContent = '删除';
        del.style.cssText = 'cursor:pointer;font-size:11.5px;color:#e4707a;font-family:inherit;';
        del.addEventListener('click', () => {
          config.customKeywords = config.customKeywords.filter((x) => x !== w);
          saveConfig(config);
          renderPanel();
        });

        r.appendChild(n);
        r.appendChild(del);
        body.appendChild(r);
      }
    }

    // 预览
    const h5 = document.createElement('div');
    h5.style.cssText = 'font-size:12px;font-weight:650;color:#587175;margin:18px 0 6px;';
    h5.textContent = '预览与显示';
    body.appendChild(h5);

    body.appendChild(
      rowSwitch('预览模式（只统计不隐藏）', '验证规则是否误伤，确认后再关闭', 'previewOnly')
    );
    body.appendChild(rowSwitch('显示右下角统计浮标', '', 'showPill'));
  }

  // 暴露调试入口
  window.__BCF_DEBUG__ = {
    getTally: () => Object.assign({}, tally),
    getConfig: () => Object.assign({}, config),
    openPanel
  };
})();
