chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("Side panel error:", error));
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    try {
      const url = new URL(tab.url);
      const data = await chrome.storage.local.get("shortcuts");
      const allShortcuts = data.shortcuts || {};
      const shortcuts = allShortcuts[url.origin] || [];
      if (shortcuts.length > 0) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
      }
    } catch (e) {}
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return;
    const url = new URL(tab.url);
    const data = await chrome.storage.local.get("shortcuts");
    const allShortcuts = data.shortcuts || {};
    const shortcuts = allShortcuts[url.origin] || [];
    if (shortcuts.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
    }
  } catch (e) {}
});

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (e) {}
}

function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startPickMode") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: "No active tab" });
        return;
      }
      await ensureContentScript(tabs[0].id);
      const response = await sendToTab(tabs[0].id, {
        action: "startPickMode",
      });
      sendResponse(response);
    });
    return true;
  }

  if (message.action === "stopPickMode") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) return;
      try {
        await sendToTab(tabs[0].id, { action: "stopPickMode" });
      } catch (e) {}
    });
    sendResponse({ ok: true });
    return true;
  }

  if (
    message.action === "elementPicked" ||
    message.action === "pickCancelled"
  ) {
    chrome.runtime.sendMessage(message);
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "scanElements") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: "No active tab" });
        return;
      }
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: scanPageElements,
        });
        sendResponse({ elements: results[0].result });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    });
    return true;
  }

  if (message.action === "saveShortcut") {
    const { url, shortcut } = message;
    chrome.storage.local.get("shortcuts", (data) => {
      const allShortcuts = data.shortcuts || {};
      if (!allShortcuts[url]) allShortcuts[url] = [];
      const idx = allShortcuts[url].findIndex(
        (s) => s.key === shortcut.key && s.modifiers === shortcut.modifiers
      );
      if (idx >= 0) {
        allShortcuts[url][idx] = shortcut;
      } else {
        allShortcuts[url].push(shortcut);
      }
      chrome.storage.local.set({ shortcuts: allShortcuts }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === "getShortcuts") {
    const { url } = message;
    chrome.storage.local.get("shortcuts", (data) => {
      const allShortcuts = data.shortcuts || {};
      sendResponse({ shortcuts: allShortcuts[url] || [] });
    });
    return true;
  }

  if (message.action === "deleteShortcut") {
    const { url, key, modifiers } = message;
    chrome.storage.local.get("shortcuts", (data) => {
      const allShortcuts = data.shortcuts || {};
      if (allShortcuts[url]) {
        allShortcuts[url] = allShortcuts[url].filter(
          (s) => !(s.key === key && s.modifiers === modifiers)
        );
        if (allShortcuts[url].length === 0) delete allShortcuts[url];
        chrome.storage.local.set({ shortcuts: allShortcuts }, () => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }
});

function scanPageElements() {
  const selectors =
    'button, a[href], input[type="submit"], input[type="button"], [role="button"], [onclick]';
  const elements = document.querySelectorAll(selectors);
  const results = [];
  elements.forEach((el, index) => {
    if (!el.offsetParent && el.tagName !== "BODY") return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    let selector = "";
    if (el.id) {
      selector = `#${el.id}`;
    } else {
      const parent = el.parentElement;
      const siblings = parent
        ? Array.from(parent.children).filter((c) => c.tagName === el.tagName)
        : [];
      const siblingIndex = siblings.indexOf(el);
      selector = parent
        ? `${parent.tagName.toLowerCase()} > ${el.tagName.toLowerCase()}:nth-of-type(${siblingIndex + 1})`
        : el.tagName.toLowerCase();
    }
    results.push({
      index,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || el.value || el.alt || el.title || "")
        .trim()
        .substring(0, 50),
      selector,
    });
  });
  return results;
}
