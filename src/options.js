/**
 * options.js — 设置页（清塘）
 *
 * 三档内置关键词列表：可启用 / 停用 / 删除 / 恢复
 * 每项标注原文样本与误判风险
 */
(() => {
  const NS = globalThis.__BCF__ || {};
  const KEYWORDS = NS.KEYWORDS || [];
  const DEFAULT_SETTINGS = NS.DEFAULT_SETTINGS || {};
  const TIER_LABEL = NS.TIER_LABEL || { A: 'A 档', B: 'B 档', C: 'C 档' };

  const SIMPLE_FIELDS = [
    'enabled',
    'blockAtPrefix',
    'exemptSelf',
    'exemptPinned',
    'keywordEnabled',
    'keywordsOnlyOnAt',
    'keywordsInNested',
    'previewOnly',
    'showPill'
  ];

  const $ = (id) => document.getElementById(id);

  let settings = Object.assign({}, DEFAULT_SETTINGS);

  /** ── 主题 ───────────────────────────────────────────────── */

  // 先用「跟随系统」猜一次，避免 storage 异步读回来之前闪一下深色
  if (NS.applyTheme) NS.applyTheme('auto');

  function currentThemePref() {
    const t = settings.theme;
    return t === 'light' || t === 'dark' ? t : 'auto';
  }

  function renderTheme() {
    const pref = currentThemePref();
    for (const btn of document.querySelectorAll('#themeSeg .qt-seg__btn')) {
      btn.classList.toggle('is-active', btn.dataset.themeValue === pref);
    }
    if (NS.applyTheme) NS.applyTheme(pref);
  }

  function initThemeWatcher() {
    if (!NS.onSystemThemeChange) return;
    NS.onSystemThemeChange(() => {
      // 只有「跟随系统」时才需要响应系统切换
      if (currentThemePref() === 'auto' && NS.applyTheme) NS.applyTheme('auto');
    });
  }

  /** ── 存取 ───────────────────────────────────────────────── */

  function load() {
    chrome.storage.local.get(null, (stored) => {
      settings = Object.assign({}, DEFAULT_SETTINGS, stored || {});
      if (!settings.keywordOverrides) settings.keywordOverrides = {};
      if (!Array.isArray(settings.customKeywords)) settings.customKeywords = [];
      renderAll();
    });
  }

  let saveTimer = null;
  function save(patch, immediate) {
    settings = Object.assign({}, settings, patch);
    const write = () => {
      chrome.storage.local.set(settings, () => flashSaved());
    };
    if (immediate) {
      clearTimeout(saveTimer);
      saveTimer = null;
      write();
    } else {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(write, 220);
    }
    renderAll();
  }

  function flashSaved() {
    const el = $('saveState');
    if (!el) return;
    el.classList.add('is-show');
    setTimeout(() => el.classList.remove('is-show'), 1200);
  }

  /** ── 风险等级 → 样式 ────────────────────────────────────── */

  function riskClass(risk) {
    const r = String(risk || '');
    if (r.includes('极高') || r.includes('高')) return 'qt-tag--risk-high';
    if (r.includes('低')) return 'qt-tag--risk-low';
    return 'qt-tag--risk-mid';
  }

  function tierClass(tier) {
    if (tier === 'A') return 'qt-tag--A';
    if (tier === 'C') return 'qt-tag--C';
    return 'qt-tag--B';
  }

  /** ── 内置词生效状态 ────────────────────────────────────── */

  function builtinState(kw) {
    const o = settings.keywordOverrides[kw.id] || {};
    if (o.deleted) return 'deleted';
    const enabled = o.enabled === undefined ? kw.enabled : !!o.enabled;
    return enabled ? 'on' : 'off';
  }

  /** ── 渲染：内置词 ──────────────────────────────────────── */

  function renderBuiltin() {
    const box = $('builtinList');
    if (!box) return;
    box.innerHTML = '';

    for (const tier of ['A', 'B', 'C']) {
      const items = KEYWORDS.filter((k) => k.tier === tier);
      if (!items.length) continue;

      const head = document.createElement('div');
      head.className = 'qt-kw-group';
      head.textContent = TIER_LABEL[tier] || tier;
      box.appendChild(head);

      if (tier === 'C') {
        const warn = document.createElement('div');
        warn.className = 'qt-warn';
        warn.textContent =
          'C 档默认关闭：这些词在「专门讨论鱼」的视频里真人也会大量使用，开启会误杀真人评论。建议先开「预览模式」验证。';
        box.appendChild(warn);
      }

      for (const kw of items) {
        box.appendChild(buildBuiltinRow(kw));
      }
    }
  }

  function buildBuiltinRow(kw) {
    const state = builtinState(kw);
    const row = document.createElement('div');
    row.className =
      'qt-kw' +
      (state === 'off' ? ' qt-kw--off' : '') +
      (state === 'deleted' ? ' qt-kw--deleted' : '');

    const main = document.createElement('div');
    main.className = 'qt-kw__main';

    const top = document.createElement('div');
    top.className = 'qt-kw__top';

    const text = document.createElement('span');
    text.className = 'qt-kw__text';
    text.textContent = kw.text;

    const tierTag = document.createElement('span');
    tierTag.className = 'qt-tag ' + tierClass(kw.tier);
    tierTag.textContent = kw.tier + ' 档';

    const riskTag = document.createElement('span');
    riskTag.className = 'qt-tag ' + riskClass(kw.risk);
    riskTag.textContent = '误伤 ' + kw.risk;

    top.appendChild(text);
    top.appendChild(tierTag);
    top.appendChild(riskTag);

    if (state === 'deleted') {
      const t = document.createElement('span');
      t.className = 'qt-tag qt-tag--risk-high';
      t.textContent = '已删除';
      top.appendChild(t);
    } else if (state === 'off') {
      const t = document.createElement('span');
      t.className = 'qt-tag qt-tag--off';
      t.textContent = '已停用';
      top.appendChild(t);
    }

    const sample = document.createElement('p');
    sample.className = 'qt-kw__sample';
    sample.textContent = kw.sample;

    main.appendChild(top);
    main.appendChild(sample);

    const acts = document.createElement('div');
    acts.className = 'qt-kw__acts';

    if (state === 'deleted') {
      const restore = document.createElement('button');
      restore.className = 'qt-mini';
      restore.textContent = '恢复';
      restore.addEventListener('click', () => {
        const o = Object.assign({}, settings.keywordOverrides);
        const cur = Object.assign({}, o[kw.id] || {});
        delete cur.deleted;
        if (cur.enabled === undefined) cur.enabled = kw.enabled;
        o[kw.id] = cur;
        save({ keywordOverrides: o }, true);
      });
      acts.appendChild(restore);
    } else {
      const toggle = document.createElement('button');
      toggle.className = 'qt-mini';
      toggle.textContent = state === 'on' ? '停用' : '启用';
      toggle.addEventListener('click', () => {
        const o = Object.assign({}, settings.keywordOverrides);
        const cur = Object.assign({}, o[kw.id] || {});
        cur.enabled = state !== 'on';
        o[kw.id] = cur;
        save({ keywordOverrides: o }, true);
      });

      const del = document.createElement('button');
      del.className = 'qt-mini qt-mini--danger';
      del.textContent = '删除';
      del.addEventListener('click', () => {
        const o = Object.assign({}, settings.keywordOverrides);
        const cur = Object.assign({}, o[kw.id] || {});
        cur.deleted = true;
        o[kw.id] = cur;
        save({ keywordOverrides: o }, true);
      });

      acts.appendChild(toggle);
      acts.appendChild(del);
    }

    row.appendChild(main);
    row.appendChild(acts);
    return row;
  }

  /** ── 渲染：自定义词 ────────────────────────────────────── */

  function renderCustom() {
    const box = $('customList');
    if (!box) return;
    box.innerHTML = '';

    const list = settings.customKeywords || [];
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'qt-empty';
      empty.textContent = '还没有自定义关键词';
      box.appendChild(empty);
      return;
    }

    for (const word of list) {
      const row = document.createElement('div');
      row.className = 'qt-kw';

      const main = document.createElement('div');
      main.className = 'qt-kw__main';

      const top = document.createElement('div');
      top.className = 'qt-kw__top';

      const text = document.createElement('span');
      text.className = 'qt-kw__text';
      text.textContent = word;

      const tag = document.createElement('span');
      tag.className = 'qt-tag qt-tag--B';
      tag.textContent = '自定义';

      top.appendChild(text);
      top.appendChild(tag);
      main.appendChild(top);

      const acts = document.createElement('div');
      acts.className = 'qt-kw__acts';

      const del = document.createElement('button');
      del.className = 'qt-mini qt-mini--danger';
      del.textContent = '删除';
      del.addEventListener('click', () => {
        const next = (settings.customKeywords || []).filter((w) => w !== word);
        save({ customKeywords: next }, true);
      });
      acts.appendChild(del);

      row.appendChild(main);
      row.appendChild(acts);
      box.appendChild(row);
    }
  }

  /** ── 渲染：开关 + 侧栏统计 ─────────────────────────────── */

  function renderSwitches() {
    for (const f of SIMPLE_FIELDS) {
      const node = $(f);
      if (!node) continue;
      node.checked = !!settings[f];
    }

    if ($('blockAtPrefix')) $('blockAtPrefix').disabled = !settings.enabled;
    if ($('keywordEnabled')) $('keywordEnabled').disabled = !settings.enabled;
    if ($('keywordsOnlyOnAt')) {
      $('keywordsOnlyOnAt').disabled = !settings.enabled || !settings.keywordEnabled;
    }
    if ($('keywordsInNested')) {
      $('keywordsInNested').disabled = !settings.enabled || !settings.keywordEnabled;
    }
    if ($('previewOnly')) $('previewOnly').disabled = !settings.enabled;

    // 侧栏统计
    const num = $('sideKwNum');
    if (num) {
      const list = NS.resolveKeywords ? NS.resolveKeywords(settings) : [];
      num.textContent = settings.keywordEnabled ? String(list.length) : '0';
    }
    const ver = $('sideVersion');
    if (ver) {
      try {
        ver.textContent = 'v' + chrome.runtime.getManifest().version;
      } catch {
        /* 忽略 */
      }
    }
  }

  function renderAll() {
    renderSwitches();
    renderBuiltin();
    renderCustom();
    renderTheme();
  }

  /** ── 侧栏导航高亮（滚动联动）──────────────────────────── */

  function initScrollSpy() {
    const links = Array.from(document.querySelectorAll('.qt-nav__item'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    const map = new Map();
    for (const a of links) {
      const id = (a.getAttribute('href') || '').slice(1);
      const section = document.getElementById(id);
      if (section) map.set(section, a);
    }

    const setActive = (a) => {
      for (const l of links) l.classList.toggle('is-active', l === a);
    };

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length) {
          const a = map.get(visible[0].target);
          if (a) setActive(a);
        }
      },
      {
        rootMargin: '-72px 0px -55% 0px',
        threshold: [0.05, 0.25, 0.5, 0.75]
      }
    );

    for (const section of map.keys()) io.observe(section);
  }

  /** ── 事件绑定 ──────────────────────────────────────────── */

  for (const f of SIMPLE_FIELDS) {
    const node = $(f);
    if (!node) continue;
    node.addEventListener('change', () => save({ [f]: node.checked }, true));
  }

  $('restoreBuiltin').addEventListener('click', () => {
    save({ keywordOverrides: {} }, true);
    const hint = $('customHint');
    if (hint) {
      hint.className = 'qt-hint qt-hint--ok';
      hint.textContent = '已把全部内置词恢复为默认（A/B 档启用，C 档关闭）。';
      setTimeout(() => {
        hint.className = 'qt-hint';
        hint.textContent = '';
      }, 3000);
    }
  });

  function addCustom() {
    const input = $('customInput');
    const hint = $('customHint');
    if (!input) return;
    const raw = String(input.value || '').trim();

    if (!raw) {
      hint.className = 'qt-hint qt-hint--err';
      hint.textContent = '请输入要屏蔽的词。';
      return;
    }
    if (raw.length < 2) {
      hint.className = 'qt-hint qt-hint--err';
      hint.textContent = '太短了，容易误伤，建议至少 2 个字。';
      return;
    }

    const list = settings.customKeywords || [];
    if (list.includes(raw)) {
      hint.className = 'qt-hint qt-hint--err';
      hint.textContent = '这个词已经在列表里了。';
      return;
    }

    const builtinHit = KEYWORDS.find((k) => k.text === raw);
    if (builtinHit && !(settings.keywordOverrides[builtinHit.id] || {}).deleted) {
      hint.className = 'qt-hint qt-hint--err';
      hint.textContent = '这是内置词，请直接在上面启用或停用，不用重复添加。';
      return;
    }

    save({ customKeywords: list.concat([raw]) }, true);
    input.value = '';
    hint.className = 'qt-hint qt-hint--ok';
    hint.textContent = `已添加「${raw}」。注意：非 A 档关键词只作用于带 @ 的评论。`;
    setTimeout(() => {
      hint.className = 'qt-hint';
      hint.textContent = '';
    }, 4200);
  }

  $('addCustom').addEventListener('click', addCustom);
  $('customInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustom();
  });

  // 主题分段控件
  const themeSeg = $('themeSeg');
  if (themeSeg) {
    themeSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('.qt-seg__btn');
      if (!btn) return;
      const v = btn.dataset.themeValue;
      if (!v) return;
      // 先立刻应用，避免等 storage 回调才变色
      settings = Object.assign({}, settings, { theme: v });
      renderTheme();
      save({ theme: v }, true);
    });
  }

  initScrollSpy();
  initThemeWatcher();
  load();
})();
