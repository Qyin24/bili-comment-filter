/**
 * background.js — MV3 service worker
 *
 * 职责：
 *   1. 首次安装时补齐默认设置
 *   2. 接收内容脚本上报的命中数 → 更新工具栏徽标
 *   3. 处理「打开设置页」请求
 */

const DEFAULT_SETTINGS = {
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

const BADGE_COLOR = '#4a7dff';

async function ensureDefaults() {
  try {
    const stored = await chrome.storage.local.get(null);
    const merged = Object.assign({}, DEFAULT_SETTINGS, stored || {});
    await chrome.storage.local.set(merged);
  } catch (e) {
    console.warn('[BCF] 初始化默认设置失败', e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'bcf:badge') {
    const count = Math.max(0, Number(msg.count) || 0);
    const tabId = sender && sender.tab && sender.tab.id;
    try {
      if (typeof tabId === 'number') {
        chrome.action.setBadgeText({
          tabId,
          text: count > 0 ? (count > 999 ? '999+' : String(count)) : ''
        });
        chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
      } else {
        chrome.action.setBadgeText({
          text: count > 0 ? (count > 999 ? '999+' : String(count)) : ''
        });
        chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
      }
    } catch (e) {
      /* 标签页可能已关闭，忽略 */
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'bcf:openOptions') {
    try {
      chrome.runtime.openOptionsPage();
    } catch (e) {
      console.warn('[BCF] 打开设置页失败', e);
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
