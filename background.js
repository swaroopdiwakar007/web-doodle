// Toggles the drawing sheet in the active tab when the toolbar icon
// (or the Alt+Shift+D shortcut) is used.
// Works in Chrome, Edge, Brave (service worker) and Firefox (event page).

const ext = globalThis.browser || globalThis.chrome;

function quiet(p) {
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function setBadge(tabId, active) {
  quiet(ext.action.setBadgeText({ tabId, text: active ? 'ON' : '' }));
  quiet(ext.action.setBadgeBackgroundColor({ tabId, color: '#0a84ff' }));
}

ext.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) return;
  try {
    const results = await ext.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['translit.js', 'content.js'],
    });
    const res = results && results[0];
    setBadge(tab.id, !!(res && res.result));
  } catch (err) {
    // Browsers block extensions on internal pages (chrome://, about:, web stores…)
    console.warn('Page Sketch cannot run on this page:', err);
    quiet(ext.action.setBadgeText({ tabId: tab.id, text: '✕' }));
    quiet(ext.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#8e8e93' }));
    setTimeout(() => setBadge(tab.id, false), 1500);
  }
});

// The sheet can also be closed from inside the page (close button / Esc).
ext.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'pagesketch-state' && sender.tab) {
    setBadge(sender.tab.id, msg.active);
  }
});

// A navigation/reload wipes the sheet, so clear the badge too.
ext.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') setBadge(tabId, false);
});
