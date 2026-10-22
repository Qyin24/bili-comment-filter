/**
 * content-bridge.js — 运行在隔离世界（ISOLATED），也就是有 chrome.* 权限的那一层
 *
 * 职责：
 *   1. 读 chrome.storage，把配置写进 DOM，通知主世界更新
 *   2. 监听主世界回的命中统计，渲染右下角浮标、更新扩展徽标
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
  const STYLE_ID = '__bcf-style';

  const DEFAULT_SETTINGS = (NS.DEFAULT_SETTINGS || {});
  const resolveKeywords = NS.resolveKeywords || (() => []);

  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let lastStats = { at: 0, kw: 0, scanned: 0 };

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
      keywords: resolveKeywords(s)
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

  /** ── 浮标样式 ───────────────────────────────────────────── */

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
    pill.title = '点击打开设置';

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
      try {
        chrome.runtime.sendMessage({ type: 'bcf:openOptions' });
      } catch {
        /* 忽略 */
      }
    });

    pill.appendChild(shield);
    pill.appendChild(text);
    pill.appendChild(close);
    document.body.appendChild(pill);
    return pill;
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
  }

  function syncPillVisibility() {
    applyPillTheme();
    if (settings.showPill === false) {
      const pill = document.getElementById(PILL_ID);
      if (pill) pill.classList.remove('bcf-show');
      return;
    }
    renderPill();
  }

  /** 浮标跟随主题（auto 时跟随系统） */
  function applyPillTheme() {
    const pill = document.getElementById(PILL_ID);
    if (!pill) return;
    const resolve = NS.resolveTheme || (() => 'dark');
    const theme = resolve(settings.theme);
    pill.classList.toggle('bcf-light', theme === 'light');
  }

  function renderPill() {
    const total = (lastStats.at || 0) + (lastStats.kw || 0);
    if (!total) {
      const pill = document.getElementById(PILL_ID);
      if (pill) pill.classList.remove('bcf-show');
      return;
    }
    if (settings.showPill === false) return;

    ensureStyle();
    const pill = ensurePill();
    if (!pill) return;

    applyPillTheme();

    const text = pill.querySelector('.bcf-text');
    if (text) {
      const parts = [];
      if (lastStats.at) parts.push(`@ ${lastStats.at}`);
      if (lastStats.kw) parts.push(`关键词 ${lastStats.kw}`);
      const prefix = settings.previewOnly ? '可屏蔽' : '已屏蔽';
      text.textContent = `${prefix} ${total} 条（${parts.join(' · ')}）`;
    }
    pill.classList.add('bcf-show');
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
        scanned: Number(s.scanned) || 0
      };
      renderPill();
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
      const total = (lastStats.at || 0) + (lastStats.kw || 0);
      try {
        chrome.runtime.sendMessage({ type: 'bcf:badge', count: total });
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
