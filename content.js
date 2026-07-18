(() => {
  if (window.__pageCutLoaded) return;
  window.__pageCutLoaded = true;

  let currentShortcuts = [];
  let pickMode = false;
  let pickOverlay = null;
  let pickHighlight = null;
  let pickInstructions = null;

  async function loadShortcuts() {
    chrome.runtime.sendMessage(
      { action: "getShortcuts", url: window.location.origin },
      (response) => {
        currentShortcuts = response?.shortcuts || [];
      }
    );
  }

  function getModifiersFromEvent(e) {
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    if (e.metaKey) mods.push("Meta");
    return mods.join("+");
  }

  function getFieldSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    if (el.className && typeof el.className === "string") {
      const classes = el.className.trim().split(/\s+/).slice(0, 3);
      if (classes.length > 0) {
        return `${el.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join("")}`;
      }
    }
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === el.tagName
      );
      const idx = siblings.indexOf(el) + 1;
      return `${getFieldSelector(parent)} > ${el.tagName.toLowerCase()}:nth-of-type(${idx})`;
    }
    return el.tagName.toLowerCase();
  }

  function getElementLabel(el) {
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent.trim();
    }
    const parentLabel = el.closest("label");
    if (parentLabel) return parentLabel.textContent.trim();
    return (
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      el.textContent?.trim().substring(0, 40) ||
      el.tagName.toLowerCase()
    );
  }

  function getElementTagLabel(el) {
    const tag = el.tagName.toLowerCase();
    const type = el.type || "";
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "input") return type || "input";
    if (tag === "select") return "select";
    if (tag === "textarea") return "textarea";
    return tag;
  }

  function startPickMode() {
    if (pickMode) return;
    pickMode = true;

    pickOverlay = document.createElement("div");
    pickOverlay.id = "page-cut-overlay";
    pickOverlay.style.cssText = `
      position:fixed; top:0; left:0; width:100vw; height:100vh;
      z-index:2147483646; background:rgba(45,58,45,0.12); cursor:crosshair;
    `;
    document.documentElement.appendChild(pickOverlay);

    pickHighlight = document.createElement("div");
    pickHighlight.id = "page-cut-highlight";
    pickHighlight.style.cssText = `
      position:fixed; pointer-events:none; z-index:2147483647;
      border:2px solid #5a9a54; background:rgba(168,213,162,0.2);
      border-radius:4px; transition:all 0.08s ease;
      display:none;
    `;
    document.documentElement.appendChild(pickHighlight);

    pickInstructions = document.createElement("div");
    pickInstructions.id = "page-cut-instructions";
    pickInstructions.style.cssText = `
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      z-index:2147483647; padding:10px 20px; background:#2d3a2d; color:#f5f7f0;
      border-radius:10px; font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      font-size:13px; box-shadow:0 4px 20px rgba(0,0,0,0.25);
      display:flex; align-items:center; gap:12px;
    `;
    pickInstructions.innerHTML = `
      <span style="color:#a8d5a2;font-weight:600;">Page Cut</span>
      <span>Haz clic en un botón o link</span>
      <span style="opacity:0.5">|</span>
      <span style="opacity:0.7">ESC para cancelar</span>
    `;
    document.documentElement.appendChild(pickInstructions);

    pickOverlay.addEventListener("mousemove", onPickMouseMove, true);
    pickOverlay.addEventListener("click", onPickClick, true);
    document.addEventListener("keydown", onPickKeydown, true);
  }

  function stopPickMode() {
    if (!pickMode) return;
    pickMode = false;

    if (pickOverlay) {
      pickOverlay.removeEventListener("mousemove", onPickMouseMove, true);
      pickOverlay.removeEventListener("click", onPickClick, true);
      pickOverlay.remove();
      pickOverlay = null;
    }
    if (pickHighlight) {
      pickHighlight.remove();
      pickHighlight = null;
    }
    if (pickInstructions) {
      pickInstructions.remove();
      pickInstructions = null;
    }
    document.removeEventListener("keydown", onPickKeydown, true);
  }

  function isClickable(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const onclick = el.hasAttribute("onclick");
    const cursor = window.getComputedStyle(el).cursor;

    if (tag === "a" && el.href) return true;
    if (tag === "button") return true;
    if (tag === "input") {
      const type = (el.type || "").toLowerCase();
      if (["button", "submit", "reset", "image"].includes(type)) return true;
    }
    if (role === "button" || role === "link" || role === "menuitem" || role === "tab" || role === "option") return true;
    if (onclick) return true;
    if (cursor === "pointer") return true;
    if (el.closest("a[href]")) return true;

    return false;
  }

  function findClickable(el) {
    if (isClickable(el)) return el;
    let current = el.parentElement;
    while (current && current !== document.body) {
      if (isClickable(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function onPickMouseMove(e) {
    if (!pickHighlight) return;
    pickOverlay.style.pointerEvents = "none";
    const raw = document.elementFromPoint(e.clientX, e.clientY);
    pickOverlay.style.pointerEvents = "";

    if (!raw || raw === pickOverlay || raw === pickInstructions) {
      pickHighlight.style.display = "none";
      return;
    }

    const el = findClickable(raw);
    if (!el) {
      pickHighlight.style.display = "none";
      return;
    }

    const rect = el.getBoundingClientRect();
    pickHighlight.style.display = "block";
    pickHighlight.style.left = rect.left - 2 + "px";
    pickHighlight.style.top = rect.top - 2 + "px";
    pickHighlight.style.width = rect.width + 4 + "px";
    pickHighlight.style.height = rect.height + 4 + "px";
  }

  function onPickClick(e) {
    e.preventDefault();
    e.stopPropagation();

    pickOverlay.style.pointerEvents = "none";
    const raw = document.elementFromPoint(e.clientX, e.clientY);
    pickOverlay.style.pointerEvents = "";

    if (!raw || raw === pickOverlay || raw === pickInstructions) return;

    const el = findClickable(raw);
    if (!el) return;

    const data = {
      selector: getFieldSelector(el),
      label: getElementLabel(el),
      tag: el.tagName.toLowerCase(),
      tagLabel: getElementTagLabel(el),
    };

    stopPickMode();
    chrome.runtime.sendMessage({ action: "elementPicked", data });
  }

  function onPickKeydown(e) {
    if (e.key === "Escape") {
      stopPickMode();
      chrome.runtime.sendMessage({ action: "pickCancelled" });
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startPickMode") {
      startPickMode();
      sendResponse({ success: true });
    }
    if (message.action === "refreshShortcuts") {
      loadShortcuts();
      sendResponse({ ok: true });
    }
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (pickMode) return;
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      )
        return;

      const pressedKey = e.key.toUpperCase();
      const pressedMods = getModifiersFromEvent(e);

      const match = currentShortcuts.find(
        (s) => s.key === pressedKey && s.modifiers === pressedMods
      );

      if (match) {
        e.preventDefault();
        e.stopPropagation();
        const el = document.querySelector(match.selector);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          if (match.action === "click") {
            setTimeout(() => el.click(), 300);
          }
        }
      }
    },
    true
  );

  loadShortcuts();
})();
