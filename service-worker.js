chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const url = new URL(tab.url);
    const shortcuts = await getShortcutsForUrl(url.origin);

    if (shortcuts && shortcuts.length > 0) {
      await chrome.scripting
        .executeScript({
          target: { tabId },
          files: ["content.js"],
        })
        .catch(() => {});
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (message.action === "executeAction") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) return;
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: executeShortcutAction,
        args: [message.selector, message.type],
      });
    });
    return true;
  }

  if (message.action === "saveShortcut") {
    const { url, shortcut } = message;
    const data = await chrome.storage.local.get("shortcuts");
    const allShortcuts = data.shortcuts || {};

    if (!allShortcuts[url]) {
      allShortcuts[url] = [];
    }

    const existingIndex = allShortcuts[url].findIndex(
      (s) => s.key === shortcut.key && s.modifiers === shortcut.modifiers
    );

    if (existingIndex >= 0) {
      allShortcuts[url][existingIndex] = shortcut;
    } else {
      allShortcuts[url].push(shortcut);
    }

    await chrome.storage.local.set({ shortcuts: allShortcuts });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "getShortcuts") {
    const { url } = message;
    const data = await chrome.storage.local.get("shortcuts");
    const allShortcuts = data.shortcuts || {};
    sendResponse({ shortcuts: allShortcuts[url] || [] });
    return true;
  }

  if (message.action === "deleteShortcut") {
    const { url, key, modifiers } = message;
    const data = await chrome.storage.local.get("shortcuts");
    const allShortcuts = data.shortcuts || {};

    if (allShortcuts[url]) {
      allShortcuts[url] = allShortcuts[url].filter(
        (s) => !(s.key === key && s.modifiers === modifiers)
      );
      if (allShortcuts[url].length === 0) {
        delete allShortcuts[url];
      }
      await chrome.storage.local.set({ shortcuts: allShortcuts });
    }
    sendResponse({ success: true });
    return true;
  }
});

async function getShortcutsForUrl(origin) {
  const data = await chrome.storage.local.get("shortcuts");
  const allShortcuts = data.shortcuts || {};
  return allShortcuts[origin] || [];
}

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
    } else if (el.name) {
      selector = `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    } else {
      const parent = el.parentElement;
      const siblings = parent
        ? Array.from(parent.children).filter((c) => c.tagName === el.tagName)
        : [];
      const siblingIndex = siblings.indexOf(el);
      selector = `${parent ? parent.tagName.toLowerCase() : ""} > ${el.tagName.toLowerCase()}:nth-of-type(${siblingIndex + 1})`;
    }

    results.push({
      index,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || el.value || el.alt || el.title || "").trim().substring(0, 50),
      selector,
      type: el.type || null,
      href: el.href || null,
    });
  });

  return results;
}

function executeShortcutAction(selector, type) {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn("Page Cut: Elemento no encontrado:", selector);
    return;
  }

  el.scrollIntoView({ behavior: "smooth", block: "center" });

  if (type === "click") {
    setTimeout(() => {
      el.click();
    }, 300);
  }
}
