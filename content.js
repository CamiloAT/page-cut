(() => {
  if (window.__pageCutLoaded) return;
  window.__pageCutLoaded = true;

  let currentShortcuts = [];
  let pickMode = false;
  let pickOverlay = null;
  let pickHighlight = null;
  let pickInstructions = null;
  let keyRecording = false;

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

  function isSelectorUnique(selector) {
    if (selector.startsWith("text:")) {
      let textContent, parentSelector = null;
      selector = selector.replace(/\[href="[^"]+"\]/, "");

      if (selector.includes(" | parent:")) {
        const [textPart, parentPart] = selector.split(" | parent:");
        parentSelector = parentPart;
        const parts = textPart.split(":");
        textContent = parts.slice(2).join(":");
      } else {
        const parts = selector.split(":");
        textContent = parts.slice(2).join(":");
      }

      const tag = selector.split(":")[1];

      if (parentSelector) {
        const parentEl = document.querySelector(parentSelector);
        if (!parentEl) return false;
        const elements = parentEl.querySelectorAll(tag);
        let count = 0;
        for (const el of elements) {
          if (getVisibleText(el) === textContent) {
            count++;
            if (count > 1) return false;
          }
        }
        return count === 1;
      }

      const elements = document.querySelectorAll(tag);
      let count = 0;
      for (const el of elements) {
        if (getVisibleText(el) === textContent) {
          count++;
          if (count > 1) return false;
        }
      }
      return count === 1;
    }
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  function getVisibleText(el) {
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.trim();
        if (t) text += (text ? " " : "") + t;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const style = window.getComputedStyle(node);
        if (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
          if (node.tagName === "SPAN" || node.tagName === "LABEL" || node.tagName === "B" || node.tagName === "STRONG" || node.tagName === "EM") {
            const t = node.textContent.trim().replace(/\s+/g, " ");
            if (t) text += (text ? " " : "") + t;
          }
        }
      }
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function getFieldSelector(el) {
    if (el.id) return `#${el.id}`;

    const tag = el.tagName.toLowerCase();

    if (tag === "a" && el.href) {
      const href = el.getAttribute("href");
      if (href && href !== "#" && !href.startsWith("#")) {
        const hrefSelector = `a[href="${href}"]`;
        if (isSelectorUnique(hrefSelector)) return hrefSelector;
      }
      if (href && href.startsWith("#/") && href.length > 2) {
        const hrefSelector = `a[href="${href}"]`;
        if (isSelectorUnique(hrefSelector)) return hrefSelector;
      }
    }

    const routerlink = el.getAttribute("routerlink") || el.closest("[routerlink]")?.getAttribute("routerlink");
    if (routerlink) {
      const routerSelector = `[routerlink="${routerlink}"]`;
      if (isSelectorUnique(routerSelector)) return routerSelector;
    }

    const routerlinkactive = el.getAttribute("routerlinkactive") || el.closest("[routerlinkactive]")?.getAttribute("routerlinkactive");
    if (routerlinkactive) {
      const routerActiveSelector = `[routerlinkactive="${routerlinkactive}"]`;
      if (isSelectorUnique(routerActiveSelector)) return routerActiveSelector;
    }

    if (el.name) {
      const nameSelector = `${tag}[name="${CSS.escape(el.name)}"]`;
      if (isSelectorUnique(nameSelector)) return nameSelector;
    }

    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
      const ariaSelector = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
      if (isSelectorUnique(ariaSelector)) return ariaSelector;
    }

    const title = el.getAttribute("title");
    if (title) {
      const titleSelector = `${tag}[title="${CSS.escape(title)}"]`;
      if (isSelectorUnique(titleSelector)) return titleSelector;
    }

    const type = el.type || "";
    if (tag === "input" && type) {
      const typeSelector = `input[type="${type}"]`;
      if (isSelectorUnique(typeSelector)) return typeSelector;
    }

    const visibleText = getVisibleText(el);
    if (visibleText && visibleText.length > 0 && visibleText.length < 40) {
      let textSelector = `text:${tag}:${visibleText}`;
      if (tag === "a") {
        const href = el.getAttribute("href");
        if (href && href !== "#" && (href.startsWith("#/") || !href.startsWith("#"))) {
          textSelector = `text:${tag}:${visibleText}[href="${href}"]`;
          if (isSelectorUnique(textSelector)) return textSelector;
          textSelector = `text:${tag}:${visibleText}`;
        }
      }
      if (isSelectorUnique(textSelector)) return textSelector;

      const parent = el.parentElement;
      if (parent) {
        const parentSelector = getFieldSelector(parent);
        let withParent = `text:${tag}:${visibleText} | parent:${parentSelector}`;
        if (tag === "a") {
          const href = el.getAttribute("href");
          if (href && href !== "#" && (href.startsWith("#/") || !href.startsWith("#"))) {
            withParent = `text:${tag}:${visibleText}[href="${href}"] | parent:${parentSelector}`;
            if (isSelectorUnique(withParent)) return withParent;
            withParent = `text:${tag}:${visibleText} | parent:${parentSelector}`;
          }
        }
        if (isSelectorUnique(withParent)) return withParent;

        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === el.tagName
        );
        const idx = siblings.indexOf(el) + 1;
        return `${parentSelector} > ${tag}:nth-of-type(${idx})`;
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
            !c.startsWith("mantine-") &&
            !/^m_[a-f0-9]+$/i.test(c) &&
            c.length > 2
        )
        .slice(0, 3);
      if (stableClasses.length > 0) {
        const classSelector = `${tag}.${stableClasses.join(".")}`;
        if (isSelectorUnique(classSelector)) return classSelector;
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
    if (match.selector.startsWith("text:")) {
      let textContent, parentSelector = null, hrefFilter = null;

      let selectorStr = match.selector;
      if (selectorStr.includes(" | parent:")) {
        const [textPart, parentPart] = selectorStr.split(" | parent:");
        parentSelector = parentPart;
        selectorStr = textPart;
      }

      const hrefMatchInText = selectorStr.match(/\[href="([^"]+)"\]/);
      if (hrefMatchInText) {
        hrefFilter = hrefMatchInText[1];
        selectorStr = selectorStr.replace(/\[href="[^"]+"\]/, "");
      }

      const parts = selectorStr.split(":");
      textContent = parts.slice(2).join(":");

      if (parentSelector) {
        const parentEl = document.querySelector(parentSelector);
        if (parentEl) {
          const tag = match.selector.split(":")[1];
          const elements = parentEl.querySelectorAll(tag);
          for (const el of elements) {
            if (getVisibleText(el) === textContent || el.textContent?.trim().replace(/\s+/g, " ") === textContent) {
              if (hrefFilter) {
                const elHref = el.getAttribute("href");
                if (elHref && (elHref === hrefFilter || elHref.endsWith(hrefFilter) || hrefFilter.endsWith(elHref))) return el;
                continue;
              }
              return el;
            }
          }
        }
        return null;
      }

      const tag = match.selector.split(":")[1];
      const elements = document.querySelectorAll(tag);
      for (const el of elements) {
        if (getVisibleText(el) === textContent || el.textContent?.trim().replace(/\s+/g, " ") === textContent) {
          if (hrefFilter) {
            const elHref = el.getAttribute("href");
            if (elHref && (elHref === hrefFilter || elHref.endsWith(hrefFilter) || hrefFilter.endsWith(elHref))) return el;
            continue;
          }
          return el;
        }
      }
      return null;
    }

    if (match.selector.includes(":has-text(")) {
      const hasTextMatch = match.selector.match(/^(\w+):has-text\("(.+)"\)$/);
      if (hasTextMatch) {
        const tag = hasTextMatch[1];
        const text = hasTextMatch[2].replace(/\\(.)/g, "$1").replace(/\s+/g, " ");
        const elements = document.querySelectorAll(tag);
        for (const el of elements) {
          if (el.textContent?.trim().replace(/\s+/g, " ") === text) return el;
        }
      }
      return null;
    }

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

    if (match.selector.includes("[routerlinkactive=")) {
      const routerActiveMatch = match.selector.match(/\[routerlinkactive="([^"]+)"\]/);
      if (routerActiveMatch) {
        const allElements = document.querySelectorAll(`[routerlinkactive="${CSS.escape(routerActiveMatch[1])}"]`);
        if (allElements.length === 1) return allElements[0];
        if (allElements.length > 1 && match.text) {
          const normalizedText = match.text.replace(/\s+/g, " ");
          for (const el of allElements) {
            const t = getVisibleText(el);
            if (t === normalizedText || t.startsWith(normalizedText)) return el;
          }
        }
      }
    }

    if (match.selector.includes("[aria-label=")) {
      const ariaMatch = match.selector.match(/\[aria-label="([^"]+)"\]/);
      if (ariaMatch) {
        const tag = match.selector.split("[")[0] || "*";
        const el = document.querySelector(`${tag}[aria-label="${CSS.escape(ariaMatch[1])}"]`);
        if (el) return el;
      }
    }

    if (match.selector.includes("[name=")) {
      const nameMatch = match.selector.match(/\[name="([^"]+)"\]/);
      if (nameMatch) {
        const tag = match.selector.split("[")[0] || "*";
        const el = document.querySelector(`${tag}[name="${CSS.escape(nameMatch[1])}"]`);
        if (el) return el;
      }
    }

    if (match.selector.includes("[title=")) {
      const titleMatch = match.selector.match(/\[title="([^"]+)"\]/);
      if (titleMatch) {
        const tag = match.selector.split("[")[0] || "*";
        const el = document.querySelector(`${tag}[title="${CSS.escape(titleMatch[1])}"]`);
        if (el) return el;
      }
    }

    if (match.selector.includes("[type=")) {
      const typeMatch = match.selector.match(/\[type="([^"]+)"\]/);
      if (typeMatch) {
        const tag = match.selector.split("[")[0] || "input";
        const el = document.querySelector(`${tag}[type="${typeMatch[1]}"]`);
        if (el) return el;
      }
    }

    if (match.text && match.text.length > 0) {
      const normalizedText = match.text.replace(/\s+/g, " ");
      const tagMatch = match.selector.match(/^(\w+)/);
      const tag = tagMatch ? tagMatch[1] : null;
      if (tag) {
        const candidates = document.querySelectorAll(tag);
        let found = null;
        let count = 0;
        for (const el of candidates) {
          const t = getVisibleText(el);
          if (t && (t === normalizedText || t.startsWith(normalizedText))) {
            found = el;
            count++;
            if (count > 1) break;
          }
        }
        if (count === 1) return found;
      }
      const allLinks = document.querySelectorAll("a");
      let foundLink = null;
      let linkCount = 0;
      for (const link of allLinks) {
        const linkText = getVisibleText(link);
        if (linkText && (linkText === normalizedText || linkText.startsWith(normalizedText))) {
          foundLink = link;
          linkCount++;
          if (linkCount > 1) break;
        }
      }
      if (linkCount === 1) return foundLink;
      const allClickable = document.querySelectorAll("button, [role='button'], [role='menuitem']");
      let foundBtn = null;
      let btnCount = 0;
      for (const btn of allClickable) {
        const btnText = getVisibleText(btn);
        if (btnText && (btnText === normalizedText || btnText.startsWith(normalizedText))) {
          foundBtn = btn;
          btnCount++;
          if (btnCount > 1) break;
        }
      }
      if (btnCount === 1) return foundBtn;
    }

    if (match.href && match.href !== "#") {
      const allLinks = document.querySelectorAll("a[href]");
      for (const link of allLinks) {
        const linkHref = link.getAttribute("href");
        if (linkHref && (linkHref === match.href || linkHref.endsWith(match.href) || match.href.endsWith(linkHref))) {
          return link;
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
    if (parentLabel) return getVisibleText(parentLabel) || parentLabel.textContent.trim().replace(/\s+/g, " ");
    return (
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      getVisibleText(el).substring(0, 40) ||
      el.textContent?.trim().replace(/\s+/g, " ").substring(0, 40) ||
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

  function onPickKeydown(e) {
    if (e.key === "Escape") {
      stopPickMode();
      try {
        chrome.runtime.sendMessage({ action: "pickCancelled" });
      } catch (e) {}
    }
  }

  function startPickMode() {
    if (pickMode) return;
    pickMode = true;

    pickOverlay = document.createElement("div");
    pickOverlay.id = "page-cut-overlay";
    pickOverlay.tabIndex = -1;
    pickOverlay.style.cssText = `
      position:fixed; top:0; left:0; width:100vw; height:100vh;
      z-index:2147483646; background:rgba(45,58,45,0.12); cursor:crosshair; outline:none;
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

    if (document.activeElement) document.activeElement.blur();
    pickOverlay.focus();

    pickOverlay.addEventListener("mousemove", onPickMouseMove, true);
    pickOverlay.addEventListener("click", onPickClick, true);
    document.addEventListener("keydown", onPickKeydown, true);
  }

  function stopPickMode() {
    if (!pickMode) return;
    pickMode = false;

    if (document.activeElement) document.activeElement.blur();

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

  function findDeepestClickableChild(el) {
    if (!el.children || el.children.length === 0) return el;
    let current = el;
    while (current.children.length > 0) {
      current = current.lastElementChild;
    }
    return current;
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
      text: getVisibleText(el) || el.textContent?.trim().replace(/\s+/g, " ").substring(0, 40),
      tag: el.tagName.toLowerCase(),
      tagLabel: getElementTagLabel(el),
      href: el.getAttribute("href") || null,
    };

    stopPickMode();
    chrome.runtime.sendMessage({ action: "elementPicked", data });
  }

  function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    return true;
  }

  function findExpandTrigger(hiddenEl) {
    let current = hiddenEl.parentElement;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const isHidden = style.display === "none" || style.visibility === "hidden" ||
        style.height === "0px" || style.maxHeight === "0px" || style.overflow === "hidden" ||
        style.opacity === "0" || current.offsetHeight === 0;

      if (isHidden) {
        const prev = current.previousElementSibling;
        if (prev) {
          const link = prev.tagName === "A" ? prev : prev.querySelector("a[href]");
          if (link) return link;
          const btn = prev.querySelector("button, [role='button'], [class*='toggle'], [class*='menu']") || prev;
          return btn;
        }
        const parent = current.parentElement;
        if (parent) {
          const prevSibling = parent.previousElementSibling;
          if (prevSibling) {
            const link = prevSibling.tagName === "A" ? prevSibling : prevSibling.querySelector("a[href]");
            if (link) return link;
            return prevSibling;
          }
        }
      }
      current = current.parentElement;
    }

    current = hiddenEl;
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

  function expandParentMenuAndRetry(match, retryCount) {
    if (retryCount > 3) {
      let fallbackHref = match.href;
      if (!fallbackHref && match.selector.includes('href="')) {
        const hrefM = match.selector.match(/href="([^"]+)"/);
        if (hrefM) fallbackHref = hrefM[1];
      }
      if (fallbackHref && fallbackHref !== "#" && match.action === "click") {
        const allLinks = document.querySelectorAll("a[href]");
        for (const link of allLinks) {
          const linkHref = link.getAttribute("href");
          if (linkHref && (linkHref === fallbackHref || linkHref.endsWith(fallbackHref) || fallbackHref.endsWith(linkHref))) {
            window.location.href = link.href;
            return;
          }
        }
      }
      console.warn("Page Cut: no se encontró el elemento tras expandir:", match.selector);
      return;
    }

    let href = match.href;
    if (!href && match.selector.includes('href="')) {
      const hrefM = match.selector.match(/href="([^"]+)"/);
      if (hrefM) href = hrefM[1];
    }

    let text = match.text;
    if (!text && match.selector.startsWith("text:")) {
      let selectorStr = match.selector;
      if (selectorStr.includes(" | parent:")) {
        selectorStr = selectorStr.split(" | parent:")[0];
      }
      selectorStr = selectorStr.replace(/\[href="[^"]+"\]/, "");
      const parts = selectorStr.split(":");
      if (parts.length >= 3) text = parts.slice(2).join(":");
    }

    let parentMenuLink = null;

    if (href && href !== "#") {
      const allLinks = document.querySelectorAll("a[href]");
      for (const link of allLinks) {
        const linkHref = link.getAttribute("href") || "";
        if (linkHref && (linkHref === href || linkHref.endsWith(href) || href.endsWith(linkHref))) {
          parentMenuLink = link;
          break;
        }
      }
    }

    if (!parentMenuLink && text) {
      const allLinks = document.querySelectorAll("a[href]");
      for (const link of allLinks) {
        const linkText = getVisibleText(link) || link.textContent?.trim().replace(/\s+/g, " ");
        if (linkText && (linkText === text || linkText.startsWith(text) || text.startsWith(linkText))) {
          parentMenuLink = link;
          break;
        }
      }
    }

    if (!parentMenuLink) {
      console.warn("Page Cut: no se encontró el elemento:", match.selector);
      return;
    }

    let container = parentMenuLink.parentElement;
    while (container && container !== document.body) {
      const siblingLinks = container.querySelectorAll("a[href]");
      for (const sibLink of siblingLinks) {
        const sibHref = sibLink.getAttribute("href");
        if (sibHref === "#" || sibHref === "#/" || sibHref.endsWith("/")) {
          const toggler = sibLink.querySelector(".layout-submenu-toggler, [class*='toggler'], [class*='arrow'], i.material-icons:last-child");
          if (toggler) {
            sibLink.click();
            setTimeout(() => {
              executeAction(match, retryCount + 1);
            }, 400);
            return;
          }
          sibLink.click();
          setTimeout(() => {
            executeAction(match, retryCount + 1);
          }, 400);
          return;
        }
      }

      const trigger = findExpandTrigger(parentMenuLink);
      if (trigger) {
        trigger.click();
        setTimeout(() => {
          executeAction(match, retryCount + 1);
        }, 400);
        return;
      }

      container = container.parentElement;
    }

    console.warn("Page Cut: no se encontró el elemento:", match.selector);
  }

  function executeAction(match, retryCount) {
    retryCount = retryCount || 0;

    let navigateHref = null;
    if (match.href && match.action === "click") {
      navigateHref = match.href;
    } else if (match.selector.includes('href="') && match.action === "click") {
      const hrefMatch = match.selector.match(/href="([^"]+)"/);
      if (hrefMatch) navigateHref = hrefMatch[1];
    }

    if (navigateHref && navigateHref !== "#") {
      const allLinks = document.querySelectorAll("a[href]");
      for (const link of allLinks) {
        const linkHref = link.getAttribute("href");
        if (linkHref && navigateHref && (
          linkHref === navigateHref ||
          linkHref.endsWith(navigateHref) ||
          navigateHref.endsWith(linkHref)
        )) {
          const style = window.getComputedStyle(link);
          if (style.display !== "none" && link.offsetHeight > 0) {
            window.location.href = link.href;
            return;
          }
        }
      }
    }

    let el = findElementByStableSelector(match);
    if (!el) {
      if (navigateHref && navigateHref !== "#" && match.action === "click") {
        const resolvedUrl = new URL(navigateHref, window.location.href);
        window.location.href = resolvedUrl.href;
        return;
      }
      expandParentMenuAndRetry(match, retryCount);
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
        const clickTarget = findDeepestClickableChild(target);
        clickTarget.click();
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

  function onRecordKeydown(e) {
    if (!keyRecording) return;
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

    e.preventDefault();
    e.stopPropagation();

    const modifiers = [];
    if (e.ctrlKey) modifiers.push("Ctrl");
    if (e.shiftKey) modifiers.push("Shift");
    if (e.altKey) modifiers.push("Alt");
    if (e.metaKey) modifiers.push("Meta");

    if (modifiers.length === 0) return;

    const key = e.key.toUpperCase();
    keyRecording = false;
    document.removeEventListener("keydown", onRecordKeydown, true);

    try {
      chrome.runtime.sendMessage({
        action: "keyRecorded",
        key,
        modifiers: modifiers.join("+"),
      });
    } catch (e) {}
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startPickMode") {
      startPickMode();
      sendResponse({ success: true });
    }
    if (message.action === "stopPickMode") {
      if (pickMode) {
        stopPickMode();
      }
      sendResponse({ ok: true });
    }
    if (message.action === "startKeyRecording") {
      keyRecording = true;
      document.addEventListener("keydown", onRecordKeydown, true);
      sendResponse({ ok: true });
    }
    if (message.action === "stopKeyRecording") {
      keyRecording = false;
      document.removeEventListener("keydown", onRecordKeydown, true);
      sendResponse({ ok: true });
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
