(() => {
  if (window.__pageCutLoaded) return;
  window.__pageCutLoaded = true;

  let currentShortcuts = [];
  let pickMode = false;
  let pickOverlay = null;
  let pickHighlight = null;
  let pickInstructions = null;

  const RESERVED_SHORTCUTS = [
    { key: "T", modifiers: "Ctrl" },
    { key: "W", modifiers: "Ctrl" },
    { key: "N", modifiers: "Ctrl" },
    { key: "Q", modifiers: "Ctrl" },
    { key: "P", modifiers: "Ctrl" },
    { key: "R", modifiers: "Ctrl" },
    { key: "J", modifiers: "Ctrl" },
    { key: "U", modifiers: "Ctrl" },
    { key: "D", modifiers: "Ctrl" },
    { key: "L", modifiers: "Ctrl" },
    { key: "H", modifiers: "Ctrl" },
    { key: "TAB", modifiers: "Ctrl" },
    { key: "TAB", modifiers: "Ctrl+Shift" },
    { key: "T", modifiers: "Ctrl+Shift" },
    { key: "N", modifiers: "Ctrl+Shift" },
    { key: "I", modifiers: "Ctrl+Shift" },
    { key: "J", modifiers: "Ctrl+Shift" },
    { key: "DELETE", modifiers: "Ctrl+Shift" },
  ];

  function isReserved(key, modifiers) {
    return RESERVED_SHORTCUTS.some(
      (s) => s.key === key && s.modifiers === modifiers
    );
  }

  async function loadShortcuts() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "getShortcuts", url: window.location.origin },
          resolve
        );
      });
      currentShortcuts = response?.shortcuts || [];
    } catch (e) {
      currentShortcuts = [];
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

  function getFieldSelector(el) {
    if (el.id) return `#${el.id}`;

    const tag = el.tagName.toLowerCase();

    if (tag === "a" && el.href) {
      const href = el.getAttribute("href");
      if (href) return `a[href="${href}"]`;
    }

    const routerlink = el.getAttribute("routerlink") || el.closest("[routerlink]")?.getAttribute("routerlink");
    if (routerlink) return `[routerlink="${routerlink}"]`;

    const routerlinkactive = el.getAttribute("routerlinkactive") || el.closest("[routerlinkactive]")?.getAttribute("routerlinkactive");
    if (routerlinkactive) return `[routerlinkactive="${routerlinkactive}"]`;

    if (el.name) return `${tag}[name="${CSS.escape(el.name)}"]`;

    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;

    const title = el.getAttribute("title");
    if (title) return `${tag}[title="${CSS.escape(title)}"]`;

    const text = el.textContent?.trim();
    if (text && text.length > 0 && text.length < 40) {
      const allSame = Array.from(document.querySelectorAll(tag)).filter(
        (e) => e.textContent?.trim() === text
      );
      if (allSame.length === 1) {
        return `${tag}:has-text("${CSS.escape(text)}")`;
      }
    }

    if (el.className && typeof el.className === "string") {
      const stableClasses = el.className
        .trim()
        .split(/\s+/)
        .filter(
          (c) =>
            !c.startsWith("ng-") &&
            !c.startsWith("_ng") &&
            !c.startsWith("cdk-") &&
            c.length > 2
        )
        .slice(0, 3);
      if (stableClasses.length > 0) {
        return `${tag}.${stableClasses.join(".")}`;
      }
    }

    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === el.tagName
      );
      const idx = siblings.indexOf(el) + 1;
      return `${getFieldSelector(parent)} > ${tag}:nth-of-type(${idx})`;
    }

    return tag;
  }

  function findElementByStableSelector(match) {
    if (match.selector.includes('href="')) {
      const hrefMatch = match.selector.match(/href="([^"]+)"/);
      if (hrefMatch) {
        const targetHref = hrefMatch[1];
        const allLinks = document.querySelectorAll("a[href]");
        for (const link of allLinks) {
          const linkHref = link.getAttribute("href");
          if (linkHref === targetHref) return link;
          try {
            const linkURL = new URL(link.href, window.location.href);
            const targetURL = new URL(targetHref, window.location.href);
            if (linkURL.pathname === targetURL.pathname && linkURL.hash === targetURL.hash) return link;
          } catch (e) {}
          if (linkHref && targetHref && linkHref.endsWith(targetHref.replace(/^\//, ""))) return link;
          if (linkHref && targetHref && linkHref.includes(targetHref.split("/").pop())) return link;
        }
      }
    }

    let el = null;
    try {
      el = document.querySelector(match.selector);
    } catch (e) {
      el = null;
    }
    if (el) return el;

    if (match.selector.includes("[routerlink=")) {
      const routerMatch = match.selector.match(/\[routerlink="([^"]+)"\]/);
      if (routerMatch) {
        const allRouterLinks = document.querySelectorAll("[routerlink]");
        for (const rl of allRouterLinks) {
          if (rl.getAttribute("routerlink") === routerMatch[1]) return rl;
        }
      }
    }

    if (match.text && match.text.length > 0) {
      const allLinks = document.querySelectorAll("a");
      for (const link of allLinks) {
        const linkText = link.textContent?.trim();
        if (linkText && (linkText === match.text || linkText.startsWith(match.text))) {
          return link;
        }
      }
      const allClickable = document.querySelectorAll("button, [role='button'], [role='menuitem']");
      for (const btn of allClickable) {
        const btnText = btn.textContent?.trim();
        if (btnText && (btnText === match.text || btnText.startsWith(match.text))) {
          return btn;
        }
      }
    }

    return null;
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
    if (!el) return null;
    if (isClickable(el)) return el;
    let current = el.parentElement;
    while (current && current !== document.body) {
      if (isClickable(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function findRealClickable(el) {
    if (!el) return null;
    const a = el.closest("a[href]");
    if (a) return a;
    const btn = el.closest("button");
    if (btn) return btn;
    const input = el.closest('input[type="submit"], input[type="button"], input[type="image"]');
    if (input) return input;
    if (isClickable(el)) return el;
    let current = el.parentElement;
    while (current && current !== document.body) {
      const innerA = current.querySelector("a[href]");
      if (innerA) return innerA;
      const innerBtn = current.querySelector("button");
      if (innerBtn) return innerBtn;
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

    const el = findRealClickable(raw);
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

    const el = findRealClickable(raw);
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

  function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    return true;
  }

  function findExpandTrigger(el) {
    let current = el.parentElement;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (style.height === "0px" || style.maxHeight === "0px" || style.overflow === "hidden") {
        const prev = current.previousElementSibling;
        if (prev) {
          const clickTarget = prev.querySelector("[role='button'], button, [class*='toggle'], [class*='expand'], [class*='menu']") || prev;
          if (isClickable(clickTarget) || clickTarget.tagName === "BUTTON" || clickTarget.getAttribute("role") === "button") {
            return clickTarget;
          }
        }
        const parentPrev = current.parentElement?.previousElementSibling;
        if (parentPrev) {
          return parentPrev;
        }
      }
      current = current.parentElement;
    }

    current = el;
    while (current && current !== document.body) {
      if (current.classList && (
        current.classList.contains("collapsed") ||
        current.classList.contains("menu-closed") ||
        current.getAttribute("aria-expanded") === "false"
      )) {
        const trigger = current.querySelector("[role='button'], button, [class*='toggle']") || current;
        return trigger;
      }
      current = current.parentElement;
    }

    return null;
  }

  function executeAction(match) {
    if (match.selector.includes('href="') && match.action === "click") {
      const hrefMatch = match.selector.match(/href="([^"]+)"/);
      if (hrefMatch) {
        const targetHref = hrefMatch[1];
        const allLinks = document.querySelectorAll("a[href]");
        for (const link of allLinks) {
          const linkHref = link.getAttribute("href");
          if (linkHref && targetHref && (
            linkHref === targetHref ||
            linkHref.endsWith(targetHref) ||
            targetHref.endsWith(linkHref)
          )) {
            window.location.href = link.href;
            return;
          }
        }
        try {
          window.location.href = targetHref;
          return;
        } catch (e) {}
      }
    }

    let el = findElementByStableSelector(match);
    if (!el) {
      console.warn("Page Cut: no se encontró el elemento:", match.selector);
      return;
    }

    const target = findRealClickable(el) || el;
    target.scrollIntoView({ behavior: "smooth", block: "center" });

    if (match.action === "click") {
      setTimeout(() => {
        if (target.tagName === "A" && target.href) {
          const href = target.getAttribute("href");
          if (href && href !== "#" && !href.startsWith("javascript:")) {
            window.location.href = target.href;
            return;
          }
        }

        const closestLink = target.closest("a[href]");
        if (closestLink) {
          const href = closestLink.getAttribute("href");
          if (href && href !== "#" && !href.startsWith("javascript:")) {
            window.location.href = closestLink.href;
            return;
          }
        }

        target.focus();
        target.click();
      }, 350);
    }
  }

  function handleKeydown(e) {
    if (pickMode) return;
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.isContentEditable
    )
      return;

    const pressedKey = e.key.toUpperCase();
    const pressedMods = getModifiersFromEvent(e);

    if (isReserved(pressedKey, pressedMods)) return;

    const match = currentShortcuts.find(
      (s) => s.key === pressedKey && s.modifiers === pressedMods
    );

    if (match) {
      e.preventDefault();
      e.stopPropagation();
      executeAction(match);
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
    if (message.action === "executeShortcut") {
      executeAction(message.shortcut);
      sendResponse({ ok: true });
    }
  });

  document.addEventListener("keydown", handleKeydown, true);

  setInterval(loadShortcuts, 3000);

  loadShortcuts();
})();
