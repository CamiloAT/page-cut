(() => {
  if (window.__pageCutGlobalLoaded) return;
  window.__pageCutGlobalLoaded = true;

  let currentGlobalShortcuts = [];

  function getModifiersFromEvent(e) {
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    if (e.metaKey) mods.push("Meta");
    return mods.join("+");
  }

  async function loadGlobalShortcuts() {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "getGlobalShortcuts" },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(resp);
            }
          }
        );
      });
      currentGlobalShortcuts = response?.shortcuts || [];
    } catch (e) {
      currentGlobalShortcuts = [];
    }
  }

  function handleKeydown(e) {
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.isContentEditable
    )
      return;

    const pressedKey = e.key.toUpperCase();
    const pressedMods = getModifiersFromEvent(e);

    const match = currentGlobalShortcuts.find(
      (s) => s.key === pressedKey && s.modifiers === pressedMods
    );

    if (match && match.url) {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: "navigateToUrl", url: match.url });
    }
  }

  document.addEventListener("keydown", handleKeydown, true);

  async function initWithRetry() {
    for (let i = 0; i < 5; i++) {
      try {
        await loadGlobalShortcuts();
        return;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  initWithRetry();

  setInterval(loadGlobalShortcuts, 3000);
})();
