/**
 * options.js — 设置页（清塘 v2）
 *
 * v1 能力：三档内置关键词列表（启用/停用/删除/恢复），每项标注原文样本与误判风险
 * v2 新增：
 *   - 等级屏蔽（开关 + Lv0–6 阈值）
 *   - 豁免组扩展（UP 本人 / 我关注的 / 认证号）
 *   - 用户白名单管理（添加走浮标面板，这里负责删）
 *   - 自定义词：可选档位 A/B + 正则声明（非法正则拒收）
 *   - 配置导出 / 导入（JSON，仅设置本身，不含账号与评论内容）
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
    'showPill',
    // ── v2 ──
    'levelEnabled',
    'exemptUp',
    'exemptFollowed',
    'exemptVerified'
  ];

  const BOOL_KEYS = SIMPLE_FIELDS;
  const THEME_VALUES = ['auto', 'dark', 'light'];

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
      if (!Array.isArray(settings.userAllowlist)) settings.userAllowlist = [];
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

  function hint(id, text, kind) {
    const el = $(id);
    if (!el) return;
    el.className = 'qt-hint' + (kind ? ' qt-hint--' + kind : '');
    el.textContent = text;
    if (text) {
      setTimeout(() => {
        if (el.textContent === text) {
          el.className = 'qt-hint';
          el.textContent = '';
        }
      }, kind === 'err' ? 5200 : 4200);
    }
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

  /** ── 渲染：自定义词（v2 元素为对象，兼容旧字符串存储）──── */

  function customDisplay(item) {
    if (typeof item === 'string') {
      return { text: item, tier: 'B', regex: false };
    }
    return {
      text: String((item && item.text) || ''),
      tier: item && item.tier === 'A' ? 'A' : 'B',
      regex: !!(item && item.regex)
    };
  }

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

    list.forEach((raw, idx) => {
      const item = customDisplay(raw);
      const row = document.createElement('div');
      row.className = 'qt-kw';

      const main = document.createElement('div');
      main.className = 'qt-kw__main';

      const top = document.createElement('div');
      top.className = 'qt-kw__top';

      const text = document.createElement('span');
      text.className = 'qt-kw__text';
      if (item.regex) {
        // 正则原样展示，不 lower
        text.textContent = '/' + item.text + '/i';
      } else {
        text.textContent = item.text;
      }

      const tag = document.createElement('span');
      tag.className = 'qt-tag ' + tierClass(item.tier);
      tag.textContent = item.tier === 'A' ? '自定义 · A 档' : '自定义 · B 档';
      top.appendChild(text);
      top.appendChild(tag);

      if (item.regex) {
        const rt = document.createElement('span');
        rt.className = 'qt-tag qt-tag--risk-mid';
        rt.textContent = '正则';
        top.appendChild(rt);
      }

      main.appendChild(top);

      const acts = document.createElement('div');
      acts.className = 'qt-kw__acts';

      const del = document.createElement('button');
      del.className = 'qt-mini qt-mini--danger';
      del.textContent = '删除';
      del.addEventListener('click', () => {
        const next = settings.customKeywords
          .slice()
          .filter((_, i) => i !== idx);
        save({ customKeywords: next }, true);
      });
      acts.appendChild(del);

      row.appendChild(main);
      row.appendChild(acts);
      box.appendChild(row);
    });
  }

  /** ── 渲染：用户白名单（v2）─────────────────────────────── */

  function renderAllowlist() {
    const box = $('allowList');
    if (!box) return;
    box.innerHTML = '';

    const list = settings.userAllowlist || [];
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'qt-empty';
      empty.textContent = '白名单为空——在浮标「命中明细」里点 🛡 可放行误伤的作者';
      box.appendChild(empty);
      return;
    }

    list.forEach((raw, idx) => {
      const mid = typeof raw === 'string' ? raw : String((raw && raw.mid) || '');
      const uname = raw && typeof raw === 'object' ? String(raw.uname || '') : '';

      const row = document.createElement('div');
      row.className = 'qt-kw';

      const main = document.createElement('div');
      main.className = 'qt-kw__main';

      const top = document.createElement('div');
      top.className = 'qt-kw__top';

      const text = document.createElement('span');
      text.className = 'qt-kw__text';
      text.textContent = uname || 'mid ' + mid;
      top.appendChild(text);

      const tag = document.createElement('span');
      tag.className = 'qt-tag qt-tag--A';
      tag.textContent = '放行';
      top.appendChild(tag);

      if (uname) {
        const idTag = document.createElement('span');
        idTag.className = 'qt-tag qt-tag--off';
        idTag.textContent = 'mid ' + mid;
        top.appendChild(idTag);
      }

      main.appendChild(top);

      const acts = document.createElement('div');
      acts.className = 'qt-kw__acts';

      const del = document.createElement('button');
      del.className = 'qt-mini qt-mini--danger';
      del.textContent = '移出';
      del.addEventListener('click', () => {
        const next = settings.userAllowlist.slice().filter((_, i) => i !== idx);
        save({ userAllowlist: next }, true);
      });
      acts.appendChild(del);

      row.appendChild(main);
      row.appendChild(acts);
      box.appendChild(row);
    });
  }

  /** ── 渲染：开关 + 等级 + 侧栏统计 ──────────────────────── */

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

    // v2：等级阈值
    const lvSel = $('blockLevelUpTo');
    if (lvSel) {
      const v = Number(settings.blockLevelUpTo);
      lvSel.value = String(Number.isFinite(v) ? Math.min(6, Math.max(0, Math.trunc(v))) : 1);
      lvSel.disabled = !settings.enabled || !settings.levelEnabled;
    }

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
    renderAllowlist();
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

  /** ── 事件绑定：开关 ────────────────────────────────────── */

  for (const f of SIMPLE_FIELDS) {
    const node = $(f);
    if (!node) continue;
    node.addEventListener('change', () => save({ [f]: node.checked }, true));
  }

  const lvSel = $('blockLevelUpTo');
  if (lvSel) {
    lvSel.addEventListener('change', () => {
      const v = Math.trunc(Number(lvSel.value));
      save({ blockLevelUpTo: Number.isFinite(v) ? Math.min(6, Math.max(0, v)) : 1 }, true);
    });
  }

  $('restoreBuiltin').addEventListener('click', () => {
    save({ keywordOverrides: {} }, true);
    hint('customHint', '已把全部内置词恢复为默认（A/B 档启用，C 档关闭）。', 'ok');
  });

  /** ── 事件绑定：自定义词（v2：档位 + 正则）─────────────── */

  function addCustom() {
    const input = $('customInput');
    if (!input) return;
    const raw = String(input.value || '').trim();

    if (!raw) {
      hint('customHint', '请输入要屏蔽的词。', 'err');
      return;
    }

    const tier = $('customTier') && $('customTier').value === 'A' ? 'A' : 'B';
    const regex = !!($('customRegex') && $('customRegex').checked);

    if (!regex && raw.length < 2) {
      hint('customHint', '太短了，容易误伤，建议至少 2 个字。', 'err');
      return;
    }

    if (regex) {
      try {
        new RegExp(raw, 'i');
      } catch (e) {
        hint('customHint', '正则不合法：' + (e && e.message ? e.message : '无法编译'), 'err');
        return;
      }
    }

    const lowered = raw.toLowerCase();
    const list = settings.customKeywords || [];
    const dupCustom = list.some((it) => {
      const d = customDisplay(it);
      return d.text.toLowerCase() === lowered;
    });
    if (dupCustom) {
      hint('customHint', '这个词已经在列表里了。', 'err');
      return;
    }

    const builtinHit = KEYWORDS.find((k) => k.text.toLowerCase() === lowered);
    if (builtinHit && !(settings.keywordOverrides[builtinHit.id] || {}).deleted) {
      hint('customHint', '这是内置词，请直接在上面启用或停用，不用重复添加。', 'err');
      return;
    }

    const entry = regex ? { text: raw, tier, regex: true } : { text: raw, tier };
    save({ customKeywords: list.concat([entry]) }, true);
    input.value = '';
    const extra = tier === 'A' ? 'A 档：无需 @ 也生效' : 'B 档：仅作用于带 @ 的评论';
    hint('customHint', `已添加「${raw}」（${extra}${regex ? ' · 正则' : ''}）。`, 'ok');
  }

  $('addCustom').addEventListener('click', addCustom);
  $('customInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustom();
  });

  /** ── 事件绑定：数据导入 / 导出（v2）────────────────────── */

  const EXPORT_KEYS = [
    ...BOOL_KEYS,
    'theme',
    'blockLevelUpTo',
    'keywordOverrides',
    'customKeywords',
    'userAllowlist'
  ];

  function currentVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return '0.0.0';
    }
  }

  function exportSettings() {
    const payload = {
      app: 'qingtang',
      version: currentVersion(),
      exportedAt: new Date().toISOString(),
      settings: {}
    };
    for (const k of EXPORT_KEYS) {
      if (settings[k] !== undefined) payload.settings[k] = settings[k];
    }
    const stamp = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fname =
      `qingtang-settings-v${payload.version}-` +
      `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.json`;

    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      hint('dataHint', '已导出 ' + fname, 'ok');
    } catch (e) {
      hint('dataHint', '导出失败：' + (e && e.message ? e.message : e), 'err');
    }
  }

  /** 逐键清洗：只认白名单键，类型不符直接丢 */
  function sanitizeImported(rawSettings) {
    const src = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    const out = {};
    for (const k of BOOL_KEYS) {
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

    if (Array.isArray(src.customKeywords)) {
      out.customKeywords = NS.normalizeCustomKeywords
        ? NS.normalizeCustomKeywords(src.customKeywords)
        : src.customKeywords.map((x) => (typeof x === 'string' ? x.trim() : x)).filter(Boolean);
    }

    if (Array.isArray(src.userAllowlist)) {
      const allow = [];
      for (const u of src.userAllowlist) {
        if (typeof u === 'string') {
          if (u.trim()) allow.push({ mid: u.trim(), uname: '' });
        } else if (u && u.mid !== undefined && u.mid !== null) {
          allow.push({ mid: String(u.mid), uname: String(u.uname || '') });
        }
      }
      out.userAllowlist = allow;
    }

    return out;
  }

  function importSettingsFromFile(file) {
    const reader = new FileReader();
    reader.onerror = () => hint('dataHint', '读取文件失败。', 'err');
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch {
        hint('dataHint', '不是合法的 JSON 文件。', 'err');
        return;
      }
      const candidate =
        data && data.settings && typeof data.settings === 'object'
          ? data.settings
          : data;
      const clean = sanitizeImported(candidate);
      const keys = Object.keys(clean);
      if (!keys.length) {
        hint('dataHint', '文件里没有可识别的清塘设置项，未做任何改动。', 'err');
        return;
      }
      save(clean, true);
      const appTag = data && data.app && data.app !== 'qingtang' ? '（注意：来源 app 标记不是 qingtang，已按字段尽力解析）' : '';
      hint('dataHint', `已导入 ${keys.length} 项设置${appTag}。刷新 B站 页面后生效。`, 'ok');
    };
    reader.readAsText(file, 'utf-8');
  }

  if ($('exportBtn')) $('exportBtn').addEventListener('click', exportSettings);
  if ($('importBtn'))
    $('importBtn').addEventListener('click', () => $('importFile').click());
  if ($('importFile'))
    $('importFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importSettingsFromFile(f);
      e.target.value = '';
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
