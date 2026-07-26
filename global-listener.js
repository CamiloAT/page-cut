(() => {
  if (window.__pageCutGlobalLoaded) return;
  window.__pageCutGlobalLoaded = true;

  let currentGlobalShortcuts = [];
  let alive = true;

  function getModifiersFromEvent(e) {
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    if (e.metaKey) mods.push("Meta");
    return mods.join("+");
  }

  function handleKeydown(e) {
    if (!alive) return;
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
      chrome.runtime.sendMessage({ action: "navigateToUrl", url: match.url, newTab: match.newTab });
    }
  }

  document.addEventListener("keydown", handleKeydown, true);

  function loadFromStorage() {
    if (!alive) return;
    try {
      chrome.storage.local.get("globalShortcuts", (data) => {
        if (!alive) return;
        const shortcuts = data.globalShortcuts || [];
        currentGlobalShortcuts = shortcuts.filter(s => s && s.key && s.modifiers);
      });
    } catch (e) {
      alive = false;
      clearInterval(pollId);
    }
  }

  loadFromStorage();
  const pollId = setInterval(() => {
    if (!alive) { clearInterval(pollId); return; }
    loadFromStorage();
  }, 3000);

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!alive) return;
      if (area === "local" && changes.globalShortcuts) {
        currentGlobalShortcuts = (changes.globalShortcuts.newValue || [])
          .filter(s => s && s.key && s.modifiers);
      }
    });
  } catch (e) {
    alive = false;
    clearInterval(pollId);
  }
})();
