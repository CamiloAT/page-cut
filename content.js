(() => {
  if (window.__pageCutLoaded) return;
  window.__pageCutLoaded = true;

  let currentShortcuts = [];

  async function loadShortcuts() {
    const url = window.location.origin;
    chrome.runtime.sendMessage(
      { action: "getShortcuts", url },
      (response) => {
        currentShortcuts = response?.shortcuts || [];
      }
    );
  }

  function findElementBySelector(selector) {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function executeAction(shortcut) {
    const el = findElementBySelector(shortcut.selector);
    if (!el) {
      console.warn("Page Cut: Elemento no encontrado:", shortcut.selector);
      return;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    if (shortcut.action === "click") {
      setTimeout(() => {
        el.click();
        el.focus();
      }, 300);
    }
  }

  function getModifiersFromEvent(e) {
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    if (e.metaKey) mods.push("Meta");
    return mods.join("+");
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      ) {
        return;
      }

      const pressedKey = e.key.toUpperCase();
      const pressedMods = getModifiersFromEvent(e);

      const match = currentShortcuts.find(
        (s) => s.key === pressedKey && s.modifiers === pressedMods
      );

      if (match) {
        e.preventDefault();
        e.stopPropagation();
        executeAction(match);
      }
    },
    true
  );

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "refreshShortcuts") {
      loadShortcuts();
      sendResponse({ ok: true });
    }
  });

  loadShortcuts();

  const observer = new MutationObserver(() => {
    loadShortcuts();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
