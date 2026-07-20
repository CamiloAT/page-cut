const pickBtn = document.getElementById("pickBtn");
const scanBtn = document.getElementById("scanBtn");
const scanStatus = document.getElementById("scanStatus");
const elementList = document.getElementById("elementList");
const shortcutList = document.getElementById("shortcutList");
const currentUrl = document.getElementById("currentUrl");
const shortcutCount = document.getElementById("shortcutCount");
const assignModal = document.getElementById("assignModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const closeModalBtn = document.getElementById("closeModal");
const selectedElementDiv = document.getElementById("selectedElement");
const keyDisplay = document.getElementById("keyDisplay");
const actionType = document.getElementById("actionType");
const cancelAssign = document.getElementById("cancelAssign");
const confirmAssign = document.getElementById("confirmAssign");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");

let currentOrigin = "";
let currentTabId = null;
let pendingPickedData = null;
let isRecording = false;
let recordedKeys = null;

async function updateCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  try {
    const url = new URL(tab.url);
    const newOrigin = url.origin;
    currentTabId = tab.id;

    if (newOrigin !== currentOrigin) {
      currentOrigin = newOrigin;
      currentUrl.textContent = url.hostname;
      currentUrl.title = url.href;
      loadShortcuts();
    }
  } catch {
    currentOrigin = "";
    currentUrl.textContent = "Navegador interno";
    currentUrl.title = "";
    shortcutList.innerHTML = '<p class="empty-state">No disponible en esta página</p>';
  }
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add("active");
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
  document.getElementById(`tab-${tabName}`).classList.remove("hidden");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

pickBtn.addEventListener("click", () => {
  if (!currentOrigin) {
    showToast("No se detectó la página actual");
    return;
  }
  scanStatus.textContent = "Mueve el mouse y haz clic en un elemento...";
  pickBtn.disabled = true;
  chrome.runtime.sendMessage({ action: "startPickMode" }, (response) => {
    if (response?.error) {
      scanStatus.textContent = "Error al iniciar pick mode";
      pickBtn.disabled = false;
    }
  });
});

scanBtn.addEventListener("click", async () => {
  if (!currentOrigin) {
    showToast("No se detectó la página actual");
    return;
  }
  scanBtn.disabled = true;
  scanStatus.textContent = "Escaneando...";
  chrome.runtime.sendMessage({ action: "scanElements" }, (response) => {
    scanBtn.disabled = false;
    if (response?.error) {
      scanStatus.textContent = "Error al escanear";
      return;
    }
    const elements = response?.elements || [];
    scanStatus.textContent = `${elements.length} elementos encontrados`;
    renderElements(elements);
  });
});

function renderElements(elements) {
  if (elements.length === 0) {
    elementList.innerHTML = '<p class="empty-state">No se encontraron elementos</p>';
    return;
  }
  elementList.innerHTML = elements
    .map(
      (el) => `
    <div class="element-card" data-selector="${escapeAttr(el.selector)}" data-text="${escapeAttr(el.text)}" data-tag="${el.tag}">
      <div class="element-icon">${el.tag.substring(0, 3)}</div>
      <div class="element-info">
        <div class="element-text">${escapeHtml(el.text) || "Sin texto"}</div>
        <div class="element-selector">${escapeHtml(el.selector)}</div>
      </div>
      <div class="element-actions">
        <button class="btn btn-primary btn-assign" style="padding:6px 10px;font-size:11px;">Asignar</button>
      </div>
    </div>`
    )
    .join("");

  elementList.querySelectorAll(".btn-assign").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".element-card");
      openAssignModal({
        selector: card.dataset.selector,
        text: card.dataset.text,
        tag: card.dataset.tag,
        tagLabel: card.dataset.tag,
      });
    });
  });
}

function openAssignModal(element) {
  pendingPickedData = element;
  recordedKeys = null;
  selectedElementDiv.innerHTML = `<strong>${element.tagLabel || element.tag}</strong> — ${escapeHtml(element.text) || element.selector}`;
  keyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
  keyDisplay.classList.add("recording");
  confirmAssign.disabled = true;
  isRecording = true;
  assignModal.classList.remove("hidden");
}

function closeAssignModal() {
  assignModal.classList.add("hidden");
  keyDisplay.classList.remove("recording");
  isRecording = false;
  pendingPickedData = null;
  recordedKeys = null;
}

modalBackdrop.addEventListener("click", closeAssignModal);
closeModalBtn.addEventListener("click", closeAssignModal);
cancelAssign.addEventListener("click", closeAssignModal);

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

document.addEventListener("keydown", (e) => {
  if (!isRecording) return;
  e.preventDefault();
  e.stopPropagation();
  if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

  const modifiers = [];
  if (e.ctrlKey) modifiers.push("Ctrl");
  if (e.shiftKey) modifiers.push("Shift");
  if (e.altKey) modifiers.push("Alt");
  if (e.metaKey) modifiers.push("Meta");

  if (modifiers.length === 0) {
    showToast("Usá Ctrl, Shift o Alt como modificador");
    return;
  }

  const key = e.key.toUpperCase();

  if (isReserved(key, modifiers.join("+"))) {
    keyDisplay.classList.remove("recording");
    keyDisplay.innerHTML = `<span style="color:var(--danger);font-size:12px;">Atajo reservado por el navegador</span>`;
    confirmAssign.disabled = true;
    isRecording = false;
    return;
  }

  recordedKeys = {
    key,
    modifiers: modifiers.join("+"),
    display: [...modifiers, key].join(" + "),
  };

  keyDisplay.classList.remove("recording");
  keyDisplay.innerHTML = `<div class="key-combination">${recordedKeys.display.split(" + ").map((k) => `<span class="key">${k}</span>`).join("")}</div>`;
  confirmAssign.disabled = false;
  isRecording = false;
});

confirmAssign.addEventListener("click", () => {
  if (!recordedKeys || !pendingPickedData) return;
  const shortcut = {
    key: recordedKeys.key,
    modifiers: recordedKeys.modifiers,
    display: recordedKeys.display,
    selector: pendingPickedData.selector,
    text: pendingPickedData.text,
    tag: pendingPickedData.tag,
    tagLabel: pendingPickedData.tagLabel,
    action: actionType.checked ? "click" : "scroll",
  };
  chrome.runtime.sendMessage(
    { action: "saveShortcut", url: currentOrigin, shortcut },
    (response) => {
      if (response?.success) {
        showToast("Shortcut guardado");
        closeAssignModal();
        loadShortcuts();
        switchTab("shortcuts");
      }
    }
  );
});

function loadShortcuts() {
  if (!currentOrigin) {
    shortcutList.innerHTML = '<p class="empty-state">No disponible</p>';
    shortcutCount.textContent = "";
    return;
  }
  chrome.runtime.sendMessage(
    { action: "getShortcuts", url: currentOrigin },
    (response) => {
      const shortcuts = response?.shortcuts || [];
      renderShortcuts(shortcuts);
      shortcutCount.textContent = shortcuts.length > 0 ? `${shortcuts.length} shortcut${shortcuts.length > 1 ? "s" : ""}` : "";
    }
  );
}

function renderShortcuts(shortcuts) {
  if (shortcuts.length === 0) {
    shortcutList.innerHTML = '<p class="empty-state">No hay shortcuts en esta página</p>';
    return;
  }
  shortcutList.innerHTML = shortcuts
    .map(
      (s, i) => `
    <div class="shortcut-card">
      <div class="shortcut-info">
        <div class="shortcut-text">${escapeHtml(s.text) || s.tagLabel || s.tag}</div>
        <div class="shortcut-keys">
          ${s.display.split(" + ").map((k) => `<span class="key">${k}</span>`).join("")}
        </div>
        <div class="element-selector">${escapeHtml(s.selector)}</div>
      </div>
      <button class="btn-icon btn-test-shortcut" data-index="${i}" title="Probar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
      </button>
      <button class="btn-icon btn-delete-shortcut" data-key="${escapeAttr(s.key)}" data-modifiers="${escapeAttr(s.modifiers)}" title="Eliminar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>`
    )
    .join("");

  shortcutList.querySelectorAll(".btn-test-shortcut").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index);
      const shortcut = shortcuts[idx];
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "executeShortcut",
          shortcut,
        });
      });
      showToast("Ejecutando...");
    });
  });

  shortcutList.querySelectorAll(".btn-delete-shortcut").forEach((btn) => {
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage(
        {
          action: "deleteShortcut",
          url: currentOrigin,
          key: btn.dataset.key,
          modifiers: btn.dataset.modifiers,
        },
        () => {
          showToast("Eliminado");
          loadShortcuts();
        }
      );
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "elementPicked") {
    pickBtn.disabled = false;
    scanStatus.textContent = "";
    openAssignModal(message.data);
  }
  if (message.action === "pickCancelled") {
    pickBtn.disabled = false;
    scanStatus.textContent = "";
  }
  if (message.action === "tabUpdated") {
    updateCurrentTab();
  }
});

chrome.tabs.onActivated.addListener(() => {
  updateCurrentTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === currentTabId && changeInfo.status === "complete") {
    updateCurrentTab();
  }
});

function showToast(msg) {
  toastMessage.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2000);
}

function escapeHtml(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && scanStatus.textContent) {
    scanStatus.textContent = "";
    pickBtn.disabled = false;
    try {
      chrome.runtime.sendMessage({ action: "stopPickMode" });
    } catch (err) {}
  }
});

updateCurrentTab();
