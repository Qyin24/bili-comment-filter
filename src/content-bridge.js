/**
 * content-bridge.js — 运行在隔离世界（ISOLATED），也就是有 chrome.* 权限的那一层
 *
 * 职责：
 *   1. 读 chrome.storage，把配置写进 DOM，通知主世界更新
 *   2. 监听主世界回的命中统计，渲染右下角浮标、更新扩展徽标
 *   3. v2：渲染「命中明细面板」——展示被杀/可杀的每一条与原因，
 *      单条一键白名单（永久放行某个人），以及接口失效的橙色提醒
 *
 * 为什么用 DOM 元素传配置：
 *   主世界读不到 chrome.storage，隔离世界与主世界之间传对象最稳的方式
 *   是「写 DOM + 派发普通事件」，而不是往 CustomEvent.detail 里塞活对象。
 */
(() => {
  const NS = (globalThis.__BCF__ = globalThis.__BCF__ || {});
  if (NS.__bridgeInstalled) return;
  NS.__bridgeInstalled = true;

  const CONFIG_EL_ID = '__bcf-config';
  const EVT_CONFIG = '__bcf:config';
  const EVT_STATS = '__bcf:stats';
  const PILL_ID = '__bcf-pill';
  const PANEL_ID = '__bcf-panel';
  const STYLE_ID = '__bcf-style';

  const DEFAULT_SETTINGS = (NS.DEFAULT_SETTINGS || {});
  const resolveKeywords = NS.resolveKeywords || (() => []);

  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let lastStats = { at: 0, kw: 0, lv: 0, scanned: 0, degraded: false };
  let lastHits = [];
  let panelVisible = false;

  /** ── 配置下发 ───────────────────────────────────────────── */

  function ensureConfigEl() {
    let el = document.getElementById(CONFIG_EL_ID);
    if (el) return el;
    // document_start 时 head 可能还没建出来，退回到 documentElement
    const parent = document.head || document.documentElement;
    if (!parent) return null;
    el = document.createElement('script');
    el.type = 'application/json';
    el.id = CONFIG_EL_ID;
    parent.appendChild(el);
    return el;
  }

  /** 等级阈值归一：非法回退 1，恒在 0–6 */
  function clampLevel(v) {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(6, Math.max(0, n)) : 1;
  }

  /** 白名单归一：元素允许旧写法纯 mid 字符串，产出统一 {mid, uname} */
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

  function buildPageConfig(s) {
    return {
      enabled: s.enabled !== false,
      blockAtPrefix: s.blockAtPrefix !== false,
      keywordEnabled: s.keywordEnabled !== false,
      keywordsOnlyOnAt: s.keywordsOnlyOnAt !== false,
      keywordsInNested: s.keywordsInNested !== false,
      exemptSelf: s.exemptSelf !== false,
      exemptPinned: s.exemptPinned !== false,
      previewOnly: !!s.previewOnly,
      keywords: resolveKeywords(s),
      // ── v2 新增 ──
      // levelEnabled 默认关，所以用 !! 而不是 !== false（后者会把缺省当开）
      levelEnabled: !!s.levelEnabled,
      blockLevelUpTo: clampLevel(s.blockLevelUpTo),
      exemptUp: s.exemptUp !== false,
      exemptFollowed: s.exemptFollowed !== false,
      exemptVerified: s.exemptVerified !== false,
      userAllowlist: normalizeAllowlist(s.userAllowlist)
    };
  }

  function pushConfig() {
    const el = ensureConfigEl();
    if (!el) return;
    el.textContent = JSON.stringify(buildPageConfig(settings));
    document.dispatchEvent(new Event(EVT_CONFIG));
  }

  function loadAndPush() {
    try {
      chrome.storage.local.get(null, (stored) => {
        const s = Object.assign({}, DEFAULT_SETTINGS, stored || {});
        settings = s;
        // 首次安装补齐默认值
        try {
          chrome.storage.local.set(s);
        } catch {
          /* 忽略 */
        }
        pushConfig();
        syncPillVisibility();
      });
    } catch {
      pushConfig();
    }
  }

  /** ── 浮标 & 面板样式 ────────────────────────────────────── */

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const parent = document.head || document.documentElement;
    if (!parent) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${PILL_ID} {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 7px 12px;
  border-radius: 999px;
  background: rgba(24, 28, 38, 0.92);
  color: #e9edf7;
  border: 1px solid rgba(53, 192, 176, 0.24);
  font: 500 12px/1.35 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(6px);
  cursor: pointer;
  user-select: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
}
#${PILL_ID}.bcf-show {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
#${PILL_ID}:hover {
  background: rgba(32, 38, 52, 0.96);
}
#${PILL_ID} .bcf-shield {
  font-size: 13px;
  line-height: 1;
}
#${PILL_ID} .bcf-text {
  white-space: nowrap;
}
#${PILL_ID} .bcf-close {
  all: unset;
  cursor: pointer;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #9aa4b8;
  font-size: 13px;
  line-height: 1;
}
#${PILL_ID} .bcf-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}

/* 接口结构自检失效态（v2） */
#${PILL_ID}.bcf-degraded {
  border-color: rgba(224, 161, 92, 0.65);
  color: #f2c185;
}
#${PILL_ID}.bcf-degraded:hover {
  background: rgba(52, 40, 22, 0.96);
}

/* 浅色主题下的浮标 */
#${PILL_ID}.bcf-light {
  background: rgba(255, 255, 255, 0.97);
  color: #10282a;
  border-color: rgba(18, 137, 124, 0.32);
  box-shadow: 0 8px 24px rgba(16, 40, 42, 0.16);
}
#${PILL_ID}.bcf-light:hover {
  background: #ffffff;
}
#${PILL_ID}.bcf-light .bcf-close {
  color: #7a9391;
}
#${PILL_ID}.bcf-light .bcf-close:hover {
  color: #10282a;
  background: rgba(16, 40, 42, 0.07);
}
#${PILL_ID}.bcf-light.bcf-degraded {
  color: #a9711c;
  border-color: rgba(169, 113, 28, 0.5);
}

/* ── 命中明细面板（v2）── */
#${PANEL_ID} {
  position: fixed;
  right: 18px;
  bottom: 52px;
  z-index: 2147483001;
  width: min(340px, 92vw);
  max-height: 46vh;
  overflow: auto;
  border-radius: 14px;
  background: rgba(14, 28, 31, 0.97);
  color: #e7f3f2;
  border: 1px solid rgba(53, 192, 176, 0.28);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  font: 400 12px/1.5 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
  transition: opacity 0.16s ease, transform 0.16s ease;
}
#${PANEL_ID}.bcf-show {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
#${PANEL_ID} .bcf-p-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 4px;
}
#${PANEL_ID} .bcf-p-title {
  font-weight: 650;
  font-size: 12.5px;
}
#${PANEL_ID} .bcf-p-x {
  all: unset;
  cursor: pointer;
  color: #7d989d;
  padding: 0 4px;
  border-radius: 6px;
}
#${PANEL_ID} .bcf-p-x:hover { color: #e7f3f2; background: rgba(255,255,255,.08); }
#${PANEL_ID} .bcf-p-sum {
  color: #7d989d;
  font-size: 11px;
  padding: 2px 12px 8px;
  border-bottom: 1px solid #1b3237;
}
#${PANEL_ID} .bcf-p-warn {
  color: #e8bd85;
  font-size: 11px;
  padding: 6px 12px;
  background: rgba(224, 161, 92, 0.09);
  border-bottom: 1px solid rgba(224, 161, 92, 0.22);
}
#${PANEL_ID} .bcf-hit {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 50, 55, 0.6);
}
#${PANEL_ID} .bcf-badge {
  flex: 0 0 auto;
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  margin-top: 1px;
  white-space: nowrap;
}
#${PANEL_ID} .bcf-badge--at { background: rgba(95, 168, 232, 0.16); color: #8fc0ee; }
#${PANEL_ID} .bcf-badge--lv { background: rgba(224, 161, 92, 0.16); color: #e8bd85; }
#${PANEL_ID} .bcf-badge--kw { background: rgba(53, 192, 176, 0.16); color: #7fd8cb; }
#${PANEL_ID} .bcf-hit-main { flex: 1; min-width: 0; }
#${PANEL_ID} .bcf-hit-name {
  font-weight: 600;
  color: #b9cfcd;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#${PANEL_ID} .bcf-hit-name small { font-weight: 400; color: #587175; margin-left: 6px; }
#${PANEL_ID} .bcf-hit-ex {
  display: block;
  color: #7d989d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#${PANEL_ID} .bcf-hit-allow {
  all: unset;
  cursor: pointer;
  flex: 0 0 auto;
  font-size: 13px;
  padding: 3px 7px;
  border-radius: 8px;
  color: #9aa4b8;
}
#${PANEL_ID} .bcf-hit-allow:hover { background: rgba(53, 192, 176, 0.16); color: #e9edf7; }
#${PANEL_ID} .bcf-hit-allow.is-on { color: #4fd8c7; }
#${PANEL_ID} .bcf-p-empty { color: #587175; font-size: 11.5px; padding: 12px; }
#${PANEL_ID} .bcf-p-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  position: sticky;
  bottom: 0;
  background: rgba(14, 28, 31, 0.97);
}
#${PANEL_ID} .bcf-p-link { color: #7fd8cb; cursor: pointer; }
#${PANEL_ID} .bcf-p-link:hover { text-decoration: underline; }
#${PANEL_ID} .bcf-p-note { color: #587175; font-size: 10.5px; }

/* 面板浅色态 */
#${PANEL_ID}.bcf-light {
  background: #ffffff;
  border-color: rgba(18, 137, 124, 0.3);
  color: #10282a;
  box-shadow: 0 12px 36px rgba(16, 40, 42, 0.18);
}
#${PANEL_ID}.bcf-light .bcf-p-x { color: #7a9391; }
#${PANEL_ID}.bcf-light .bcf-p-x:hover { color: #10282a; background: rgba(16,40,42,.06); }
#${PANEL_ID}.bcf-light .bcf-p-sum { color: #5a7775; border-color: #e2edeb; }
#${PANEL_ID}.bcf-light .bcf-p-warn { color: #a9711c; background: rgba(169,113,28,.07); border-color: rgba(169,113,28,.24); }
#${PANEL_ID}.bcf-light .bcf-hit { border-color: rgba(211, 227, 224, 0.7); }
#${PANEL_ID}.bcf-light .bcf-hit-name { color: #2c4a48; }
#${PANEL_ID}.bcf-light .bcf-hit-name small { color: #7a9391; }
#${PANEL_ID}.bcf-light .bcf-hit-ex { color: #7a9391; }
#${PANEL_ID}.bcf-light .bcf-hit-allow { color: #7a9391; }
#${PANEL_ID}.bcf-light .bcf-hit-allow.is-on { color: #129387; }
#${PANEL_ID}.bcf-light .bcf-p-empty { color: #7a9391; }
#${PANEL_ID}.bcf-light .bcf-p-foot { background: #ffffff; }
#${PANEL_ID}.bcf-light .bcf-p-link { color: #0d7a6d; }
`;
    parent.appendChild(style);
  }

  /** ── 浮标渲染 ───────────────────────────────────────────── */

  function ensurePill() {
    let pill = document.getElementById(PILL_ID);
    if (pill) return pill;
    if (!document.body) return null;

    pill = document.createElement('div');
    pill.id = PILL_ID;
    pill.title = '点击查看命中明细';

    const shield = document.createElement('span');
    shield.className = 'bcf-shield';
    shield.textContent = '🛡';

    const text = document.createElement('span');
    text.className = 'bcf-text';
    text.textContent = '';

    const close = document.createElement('button');
    close.className = 'bcf-close';
    close.textContent = '×';
    close.title = '隐藏浮标';

    close.addEventListener('click', (e) => {
      e.stopPropagation();
      hidePillPermanently();
    });

    pill.addEventListener('click', () => {
      // v2：有内容 → 展开/收起明细面板；什么都没有 → 保持旧行为开设置
      if (lastHits.length || lastStats.degraded) {
        togglePanel();
      } else {
        openOptionsPage();
      }
    });

    pill.appendChild(shield);
    pill.appendChild(text);
    pill.appendChild(close);
    document.body.appendChild(pill);
    return pill;
  }

  function openOptionsPage() {
    try {
      chrome.runtime.sendMessage({ type: 'bcf:openOptions' });
    } catch {
      /* 忽略 */
    }
  }

  function hidePillPermanently() {
    try {
      chrome.storage.local.get(null, (stored) => {
        const s = Object.assign({}, DEFAULT_SETTINGS, stored || {}, {
          showPill: false
        });
        chrome.storage.local.set(s);
      });
    } catch {
      /* 忽略 */
    }
    const pill = document.getElementById(PILL_ID);
    if (pill) pill.classList.remove('bcf-show');
    closePanel();
  }

  function syncPillVisibility() {
    applyPillTheme();
    if (settings.showPill === false) {
      const pill = document.getElementById(PILL_ID);
      if (pill) pill.classList.remove('bcf-show');
      closePanel();
      return;
    }
    renderPill();
  }

  /** 浮标/面板跟随主题（auto 时跟随系统） */
  function applyPillTheme() {
    const resolve = NS.resolveTheme || (() => 'dark');
    const theme = resolve(settings.theme);
    const pill = document.getElementById(PILL_ID);
    if (pill) pill.classList.toggle('bcf-light', theme === 'light');
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.toggle('bcf-light', theme === 'light');
  }

  function renderPill() {
    const total = (lastStats.at || 0) + (lastStats.kw || 0) + (lastStats.lv || 0);
    const pill = document.getElementById(PILL_ID);

    if (!total && !lastStats.degraded) {
      if (pill) pill.classList.remove('bcf-show');
      if (pill) pill.classList.remove('bcf-degraded');
      return;
    }
    if (settings.showPill === false) return;

    ensureStyle();
    const el = ensurePill();
    if (!el) return;

    applyPillTheme();

    const text = el.querySelector('.bcf-text');
    if (text) {
      const parts = [];
      if (lastStats.at) parts.push(`@ ${lastStats.at}`);
      if (lastStats.kw) parts.push(`关键词 ${lastStats.kw}`);
      if (lastStats.lv) parts.push(`Lv ${lastStats.lv}`);
      const prefix = settings.previewOnly ? '可屏蔽' : '已屏蔽';
      const countText = total ? `${prefix} ${total} 条（${parts.join(' · ')}）` : '';
      text.textContent = lastStats.degraded
        ? `⚠ 接口可能已改版${countText ? ' · ' + countText : ''}`
        : countText;
    }
    el.classList.toggle('bcf-degraded', !!lastStats.degraded);
    el.classList.add('bcf-show');
  }

  /** ── 命中明细面板（v2）─────────────────────────────────── */

  function togglePanel() {
    if (panelVisible) closePanel();
    else openPanel();
  }

  function closePanel() {
    panelVisible = false;
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.remove('bcf-show');
  }

  function openPanel() {
    ensureStyle();
    const panel = ensurePanel();
    if (!panel) return;
    applyPillTheme();
    renderPanel();
    panelVisible = true;
    panel.classList.add('bcf-show');
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    if (!document.body) return null;

    panel = document.createElement('div');
    panel.id = PANEL_ID;

    const head = document.createElement('div');
    head.className = 'bcf-p-head';
    const title = document.createElement('span');
    title.className = 'bcf-p-title';
    title.textContent = '命中明细';
    const x = document.createElement('button');
    x.className = 'bcf-p-x';
    x.type = 'button';
    x.textContent = '✕';
    x.title = '关闭';
    x.addEventListener('click', closePanel);
    head.appendChild(title);
    head.appendChild(x);

    const body = document.createElement('div');
    body.id = PANEL_ID + '-body';

    const foot = document.createElement('div');
    foot.className = 'bcf-p-foot';
    const link = document.createElement('span');
    link.className = 'bcf-p-link';
    link.textContent = '⚙ 打开设置';
    link.addEventListener('click', openOptionsPage);
    const note = document.createElement('span');
    note.className = 'bcf-p-note';
    note.textContent = '明细仅存内存 · 改动需刷新页面';
    foot.appendChild(link);
    foot.appendChild(note);

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(foot);
    document.body.appendChild(panel);
    return panel;
  }

  /** 把 reason 编码翻译成徽章文案与样式 */
  function badgeFor(reason, level) {
    if (reason === 'at') return { cls: 'bcf-badge--at', label: '@ 开头' };
    if (reason === 'lv') {
      return { cls: 'bcf-badge--lv', label: level === null ? 'Lv ?' : `Lv ${level}` };
    }
    const word = String(reason || '').replace(/^kw:/, '');
    return { cls: 'bcf-badge--kw', label: `词·${word}`.slice(0, 20) };
  }

  function isAllowed(mid) {
    if (!mid) return false;
    const list = normalizeAllowlist(settings.userAllowlist);
    return list.some((u) => u.mid === String(mid));
  }

  /** 一键白名单：点 🛡 添加；再点取消（撤销加错） */
  function toggleAllowlistHit(hit) {
    const mid = String(hit && hit.mid || '');
    if (!mid) return;
    try {
      chrome.storage.local.get(null, (stored) => {
        const s = Object.assign({}, DEFAULT_SETTINGS, stored || {});
        const list = normalizeAllowlist(s.userAllowlist);
        const had = list.some((u) => u.mid === mid);
        s.userAllowlist = had
          ? list.filter((u) => u.mid !== mid)
          : list.concat([{ mid, uname: String(hit.uname || '') }]);
        chrome.storage.local.set(s);
      });
    } catch {
      /* 忽略 */
    }
  }

  function renderPanel() {
    const body = document.getElementById(PANEL_ID + '-body');
    if (!body) return;
    body.innerHTML = '';

    if (lastStats.degraded) {
      const warn = document.createElement('div');
      warn.className = 'bcf-p-warn';
      warn.textContent = '⚠ 评论接口结构和预期不符，过滤可能已失效。等作者更新，或检查是否 B站改版。';
      body.appendChild(warn);
    }

    if (!lastHits.length) {
      const empty = document.createElement('div');
      empty.className = 'bcf-p-empty';
      empty.textContent = '本次浏览还没有命中记录。';
      body.appendChild(empty);
      return;
    }

    const sum = document.createElement('div');
    sum.className = 'bcf-p-sum';
    // 总数以 tally 为准；hits 只是最近 HITS_MAX 条的滚动窗口
    const total = (lastStats.at || 0) + (lastStats.kw || 0) + (lastStats.lv || 0);
    const prefix = settings.previewOnly ? '可屏蔽' : '已屏蔽';
    const windowNote = total > lastHits.length ? `（显示最近 ${lastHits.length} 条）` : '';
    sum.textContent = `${prefix} ${total} 条${windowNote} · 🛡 = 白名单（放行此人）`;
    body.appendChild(sum);

    for (const hit of lastHits) {
      const row = document.createElement('div');
      row.className = 'bcf-hit';

      const badge = document.createElement('span');
      const b = badgeFor(hit.reason, hit.level);
      badge.className = 'bcf-badge ' + b.cls;
      badge.textContent = b.label;

      const main = document.createElement('span');
      main.className = 'bcf-hit-main';
      const name = document.createElement('span');
      name.className = 'bcf-hit-name';
      name.textContent = hit.uname || '匿名';
      const lvSmall = document.createElement('small');
      lvSmall.textContent = hit.level === null || hit.level === undefined ? 'Lv?' : `Lv${hit.level}`;
      name.appendChild(lvSmall);
      const ex = document.createElement('span');
      ex.className = 'bcf-hit-ex';
      ex.textContent = hit.excerpt || '（空正文）';
      ex.title = hit.excerpt || '';
      main.appendChild(name);
      main.appendChild(ex);

      const allow = document.createElement('button');
      allow.type = 'button';
      allow.className = 'bcf-hit-allow' + (isAllowed(hit.mid) ? ' is-on' : '');
      allow.textContent = isAllowed(hit.mid) ? '✓' : '🛡';
      allow.title = isAllowed(hit.mid) ? '已在白名单，点击移除' : '加入白名单：此人的评论永远放行';
      allow.addEventListener('click', () => {
        toggleAllowlistHit(hit);
      });

      row.appendChild(badge);
      row.appendChild(main);
      row.appendChild(allow);
      body.appendChild(row);
    }
  }

  /** ── 统计回传接收 ───────────────────────────────────────── */

  document.addEventListener(EVT_STATS, () => {
    try {
      const raw = document.documentElement.getAttribute('data-bcf-stats');
      if (!raw) return;
      const s = JSON.parse(raw);
      lastStats = {
        at: Number(s.at) || 0,
        kw: Number(s.kw) || 0,
        lv: Number(s.lv) || 0,
        scanned: Number(s.scanned) || 0,
        degraded: !!s.degraded
      };
      const hitsRaw = document.documentElement.getAttribute('data-bcf-hits');
      if (hitsRaw) {
        const parsed = JSON.parse(hitsRaw);
        lastHits = Array.isArray(parsed) ? parsed : [];
      } else {
        lastHits = [];
      }
      renderPill();
      if (panelVisible) renderPanel();
      reportBadge();
    } catch {
      /* 忽略 */
    }
  });

  let badgeTimer = null;
  function reportBadge() {
    if (badgeTimer) return;
    badgeTimer = setTimeout(() => {
      badgeTimer = null;
      const total = (lastStats.at || 0) + (lastStats.kw || 0) + (lastStats.lv || 0);
      try {
        chrome.runtime.sendMessage({
          type: 'bcf:badge',
          count: total,
          degraded: !!lastStats.degraded
        });
      } catch {
        /* 忽略 */
      }
    }, 400);
  }

  /** ── 存储变更监听 ───────────────────────────────────────── */

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      try {
        chrome.storage.local.get(null, (stored) => {
          settings = Object.assign({}, DEFAULT_SETTINGS, stored || {});
          pushConfig();
          syncPillVisibility();
          if (panelVisible) renderPanel();
        });
      } catch {
        /* 忽略 */
      }
    });
  } catch {
    /* 忽略 */
  }

  /** ── 启动 ───────────────────────────────────────────────── */

  loadAndPush();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureStyle();
      syncPillVisibility();
    });
  } else {
    ensureStyle();
    syncPillVisibility();
  }
})();
