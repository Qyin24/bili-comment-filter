/**
 * popup.js — 工具栏弹窗（清塘）
 * 只做快速开关，详细配置在 options 页
 */
(() => {
  const NS = globalThis.__BCF__ || {};
  const DEFAULT_SETTINGS = NS.DEFAULT_SETTINGS || {
    enabled: true,
    blockAtPrefix: true,
    keywordEnabled: true,
    keywordsOnlyOnAt: true,
    keywordsInNested: true,
    exemptSelf: true,
    exemptPinned: true,
    previewOnly: false,
    showPill: true,
    theme: 'auto',
    keywordOverrides: {},
    customKeywords: []
  };
  const resolveKeywords = NS.resolveKeywords || (() => []);

  const FIELDS = ['enabled', 'blockAtPrefix', 'keywordEnabled', 'previewOnly'];

  const THEME_CYCLE = ['auto', 'dark', 'light'];
  const THEME_META = {
    auto: { glyph: '◐', title: '切换外观：自动（跟随系统）' },
    dark: { glyph: '☾', title: '切换外观：深色' },
    light: { glyph: '☀', title: '切换外观：浅色' }
  };

  const el = {
    enabled: document.getElementById('enabled'),
    blockAtPrefix: document.getElementById('blockAtPrefix'),
    keywordEnabled: document.getElementById('keywordEnabled'),
    previewOnly: document.getElementById('previewOnly'),
    kwCount: document.getElementById('kwCount'),
    openOptions: document.getElementById('openOptions'),
    version: document.getElementById('version'),
    tip: document.getElementById('tip'),
    hero: document.getElementById('hero'),
    heroSub: document.getElementById('heroSub'),
    themeBtn: document.getElementById('themeBtn')
  };

  let settings = Object.assign({}, DEFAULT_SETTINGS);

  // 先用「跟随系统」猜一次，避免存读回来之前闪一下
  if (NS.applyTheme) NS.applyTheme('auto');

  function themePref() {
    const t = settings.theme;
    return t === 'light' || t === 'dark' ? t : 'auto';
  }

  function renderTheme() {
    const pref = themePref();
    const meta = THEME_META[pref] || THEME_META.auto;
    if (el.themeBtn) {
      el.themeBtn.textContent = meta.glyph;
      el.themeBtn.title = meta.title;
    }
    if (NS.applyTheme) NS.applyTheme(pref);
  }

  function load() {
    chrome.storage.local.get(null, (stored) => {
      settings = Object.assign({}, DEFAULT_SETTINGS, stored || {});
      render();
    });
  }

  function render() {
    for (const f of FIELDS) {
      if (el[f]) el[f].checked = !!settings[f];
    }

    // 依赖关系：总开关关掉后，子项禁用
    const off = !settings.enabled;
    if (el.blockAtPrefix) el.blockAtPrefix.disabled = off;
    if (el.keywordEnabled) el.keywordEnabled.disabled = off;
    if (el.previewOnly) el.previewOnly.disabled = off;

    // 主状态卡
    if (el.hero) el.hero.classList.toggle('is-off', off);
    const title = el.hero && el.hero.querySelector('.qt-hero__title');
    if (title) title.textContent = off ? '已停塘' : '清塘中';
    if (el.heroSub) {
      if (off) {
        el.heroSub.textContent = '所有过滤已停止';
      } else if (settings.previewOnly) {
        el.heroSub.textContent = '预览模式 · 只统计不隐藏';
      } else {
        el.heroSub.textContent = '正在过滤评论区';
      }
    }

    // 关键词计数
    const kws = resolveKeywords(settings);
    if (el.kwCount) {
      const customCount = (settings.customKeywords || []).length;
      el.kwCount.textContent = settings.keywordEnabled
        ? `生效 ${kws.length} 个关键词 · 含自定义 ${customCount} 个`
        : '关键词屏蔽已关闭';
    }

    // 底部提示
    if (el.tip) {
      if (settings.previewOnly) {
        el.tip.classList.add('is-warn');
        el.tip.innerHTML = '预览模式：<b>只统计不隐藏</b>，刷新页面查看命中数';
      } else {
        el.tip.classList.remove('is-warn');
        el.tip.innerHTML = '配置改动后需 <b>刷新页面</b> 生效';
      }
    }

    try {
      el.version.textContent = 'v' + chrome.runtime.getManifest().version;
    } catch {
      /* 忽略 */
    }

    renderTheme();
  }

  function save(patch) {
    settings = Object.assign({}, settings, patch);
    chrome.storage.local.set(settings, () => render());
  }

  for (const f of FIELDS) {
    const node = el[f];
    if (!node) continue;
    node.addEventListener('change', () => save({ [f]: node.checked }));
  }

  el.openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // 主题按钮：自动 → 深色 → 浅色 → 自动
  if (el.themeBtn) {
    el.themeBtn.addEventListener('click', () => {
      const cur = themePref();
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(cur) + 1) % THEME_CYCLE.length];
      settings = Object.assign({}, settings, { theme: next });
      renderTheme();
      chrome.storage.local.set(settings);
    });
  }

  // 跟随系统模式下，系统切换时同步
  if (NS.onSystemThemeChange) {
    NS.onSystemThemeChange(() => {
      if (themePref() === 'auto') renderTheme();
    });
  }

  load();
})();
