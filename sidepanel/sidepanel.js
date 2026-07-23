const pickBtn = document.getElementById("pickBtn");
const scanBtn = document.getElementById("scanBtn");
const scanStatus = document.getElementById("scanStatus");
const elementList = document.getElementById("elementList");
const elementToolbar = document.getElementById("elementToolbar");
const elementCount = document.getElementById("elementCount");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const filterChips = document.getElementById("filterChips");
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

const editModal = document.getElementById("editModal");
const editModalBackdrop = document.getElementById("editModalBackdrop");
const closeEditModalBtn = document.getElementById("closeEditModal");
const editSelectedElementDiv = document.getElementById("editSelectedElement");
const editKeyDisplay = document.getElementById("editKeyDisplay");
const editActionType = document.getElementById("editActionType");
const cancelEdit = document.getElementById("cancelEdit");
const confirmEdit = document.getElementById("confirmEdit");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");
const toggleResults = document.getElementById("toggleResults");

let currentOrigin = "";
let currentTabId = null;
let pendingPickedData = null;
let isRecording = false;
let keyRecording = false;
let recordedKeys = null;
let resultsVisible = true;

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

function toggleResultsPanel() {
  resultsVisible = !resultsVisible;
  if (resultsVisible) {
    elementToolbar.classList.remove("hidden");
    elementCount.classList.remove("hidden");
    elementList.style.display = "";
    toggleResults.classList.add("active");
    toggleResults.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg>`;
  } else {
    elementToolbar.classList.add("hidden");
    elementCount.classList.add("hidden");
    elementList.style.display = "none";
    toggleResults.classList.remove("active");
    toggleResults.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`;
  }
}

toggleResults.addEventListener("click", toggleResultsPanel);

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

let allElements = [];
let activeFilter = "all";

scanBtn.addEventListener("click", async () => {
  if (!currentOrigin) {
    showToast("No se detectó la página actual");
    return;
  }
  scanBtn.disabled = true;
  scanStatus.textContent = "Escaneando...";
  resultsVisible = true;
  toggleResults.classList.remove("hidden");
  toggleResults.classList.add("active");
  toggleResults.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg>`;
  chrome.runtime.sendMessage({ action: "scanElements" }, (response) => {
    scanBtn.disabled = false;
    if (response?.error) {
      scanStatus.textContent = "Error al escanear";
      return;
    }
    allElements = response?.elements || [];
    scanStatus.textContent = "";
    buildFilterChips(allElements);
    applyFilters();
    elementToolbar.classList.remove("hidden");
    elementList.style.display = "";
  });
});

function buildFilterChips(elements) {
  const counts = {};
  elements.forEach((el) => {
    counts[el.tag] = (counts[el.tag] || 0) + 1;
  });
  const tags = Object.keys(counts).sort();

  let html = `<button class="chip active" data-filter="all">Todos <span class="chip-count">${elements.length}</span></button>`;
  tags.forEach((tag) => {
    const label = TAG_LABELS[tag] || tag;
    html += `<button class="chip" data-filter="${tag}">${label} <span class="chip-count">${counts[tag]}</span></button>`;
  });
  filterChips.innerHTML = html;

  filterChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      applyFilters();
    });
  });
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  let filtered = allElements;

  if (activeFilter !== "all") {
    filtered = filtered.filter((el) => el.tag === activeFilter);
  }

  if (query) {
    filtered = filtered.filter(
      (el) =>
        (el.text || "").toLowerCase().includes(query) ||
        el.selector.toLowerCase().includes(query) ||
        el.tag.toLowerCase().includes(query)
    );
  }

  elementCount.textContent = `${filtered.length} de ${allElements.length} elementos`;
  elementCount.classList.remove("hidden");
  renderElements(filtered);
}

searchInput.addEventListener("input", () => {
  clearSearch.classList.toggle("hidden", !searchInput.value);
  applyFilters();
});

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  clearSearch.classList.add("hidden");
  applyFilters();
  searchInput.focus();
});

const TAG_LABELS = {
  button: "Botón",
  a: "Enlace",
  input: "Input",
  select: "Select",
  summary: "Details",
  "[role=button]": "Role",
};

function getTagClass(tag) {
  if (tag === "button") return "tag-button";
  if (tag === "a") return "tag-a";
  if (tag === "input") return "tag-input";
  if (tag === "select") return "tag-select";
  if (tag === "summary") return "tag-summary";
  return "tag-other";
}

function renderElements(elements) {
  if (elements.length === 0) {
    elementList.innerHTML = '<p class="empty-state">No se encontraron elementos</p>';
    return;
  }
  elementList.innerHTML = elements
    .map(
      (el) => `
    <div class="element-card" data-selector="${escapeAttr(el.selector)}" data-text="${escapeAttr(el.text)}" data-tag="${el.tag}" data-href="${escapeAttr(el.href || '')}">
      <span class="element-tag ${getTagClass(el.tag)}">${TAG_LABELS[el.tag] || el.tag}</span>
      <div class="element-info">
        <div class="element-text">${escapeHtml(el.text) || "Sin texto"}</div>
      </div>
      <div class="element-actions">
        <button class="btn btn-primary btn-assign" style="padding:5px 8px;font-size:10px;">Asignar</button>
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
        href: card.dataset.href || null,
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
  keyRecording = true;
  assignModal.classList.remove("hidden");
  chrome.runtime.sendMessage({ action: "startKeyRecording" });
}

function closeAssignModal() {
  assignModal.classList.add("hidden");
  keyDisplay.classList.remove("recording");
  isRecording = false;
  keyRecording = false;
  pendingPickedData = null;
  recordedKeys = null;
  chrome.runtime.sendMessage({ action: "stopKeyRecording" });
}

modalBackdrop.addEventListener("click", closeAssignModal);
closeModalBtn.addEventListener("click", closeAssignModal);

let editingShortcut = null;
let editRecordedKeys = null;
let isEditRecording = false;

function openEditModal(shortcut) {
  editingShortcut = shortcut;
  editRecordedKeys = null;
  editSelectedElementDiv.innerHTML = `<strong>${shortcut.tagLabel || shortcut.tag}</strong> — ${escapeHtml(shortcut.text) || shortcut.selector}<br><span style="font-size:11px;color:var(--text-muted);">Tecla actual: ${shortcut.display}</span>`;
  editKeyDisplay.innerHTML = '<span class="key-placeholder">Presiona nueva combinación...</span>';
  editKeyDisplay.classList.add("recording");
  editActionType.checked = shortcut.action === "click";
  confirmEdit.disabled = true;
  isEditRecording = true;
  editModal.classList.remove("hidden");
  chrome.runtime.sendMessage({ action: "startKeyRecording" });
}

function closeEditModal() {
  editModal.classList.add("hidden");
  editKeyDisplay.classList.remove("recording");
  isEditRecording = false;
  editingShortcut = null;
  editRecordedKeys = null;
  chrome.runtime.sendMessage({ action: "stopKeyRecording" });
}

editModalBackdrop.addEventListener("click", closeEditModal);
closeEditModalBtn.addEventListener("click", closeEditModal);
cancelEdit.addEventListener("click", closeEditModal);

confirmEdit.addEventListener("click", () => {
  if (!editRecordedKeys || !editingShortcut) return;
  const newShortcut = {
    key: editRecordedKeys.key,
    modifiers: editRecordedKeys.modifiers,
    display: editRecordedKeys.display,
    selector: editingShortcut.selector,
    text: editingShortcut.text,
    tag: editingShortcut.tag,
    tagLabel: editingShortcut.tagLabel,
    href: editingShortcut.href || null,
    action: editActionType.checked ? "click" : "scroll",
  };

  chrome.runtime.sendMessage(
    { action: "deleteShortcut", url: currentOrigin, key: editingShortcut.key, modifiers: editingShortcut.modifiers },
    () => {
      chrome.runtime.sendMessage(
        { action: "saveShortcut", url: currentOrigin, shortcut: newShortcut },
        (response) => {
          if (response?.success) {
            showToast("Shortcut actualizado");
            closeEditModal();
            loadShortcuts();
          }
        }
      );
    }
  );
});
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

function renderKeyCombination(display, variant) {
  const variantClass = variant === "danger" ? " key-danger" : variant === "success" ? " key-success" : "";
  return `<div class="key-combination">${display.split(" + ").map((k) => `<span class="key${variantClass}">${k}</span>`).join('<span class="key-separator">+</span>')}</div>`;
}

document.addEventListener("keydown", (e) => {
  if (!isRecording && !isEditRecording) return;
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
    const display = [...modifiers, key].join(" + ");
    const targetDisplay = isEditRecording ? editKeyDisplay : keyDisplay;
    targetDisplay.classList.remove("recording");
    targetDisplay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
        ${renderKeyCombination(display, "danger")}
        <span style="color:var(--text-muted);font-size:11px;">Reservado por el navegador</span>
        <button class="btn-retry" data-edit="${isEditRecording ? 'true' : 'false'}">
          Reintentar
        </button>
      </div>`;
    targetDisplay.querySelector(".btn-retry").addEventListener("click", () => {
      if (isEditRecording) {
        editRecordedKeys = null;
        editKeyDisplay.classList.add("recording");
        editKeyDisplay.innerHTML = '<span class="key-placeholder">Presiona nueva combinación...</span>';
        confirmEdit.disabled = true;
      } else {
        isRecording = true;
        keyRecording = true;
        keyDisplay.classList.add("recording");
        keyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
        confirmAssign.disabled = true;
      }
      chrome.runtime.sendMessage({ action: "startKeyRecording" });
    });
    if (isEditRecording) confirmEdit.disabled = true;
    else confirmAssign.disabled = true;
    return;
  }

  const recorded = {
    key,
    modifiers: modifiers.join("+"),
    display: [...modifiers, key].join(" + "),
  };

  const targetDisplay = isEditRecording ? editKeyDisplay : keyDisplay;
  targetDisplay.classList.remove("recording");
  targetDisplay.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
      ${renderKeyCombination(recorded.display, "success")}
      <button class="btn-retry">
        Cambiar tecla
      </button>
    </div>`;
  targetDisplay.querySelector(".btn-retry").addEventListener("click", () => {
    if (isEditRecording) {
      editRecordedKeys = null;
      editKeyDisplay.classList.add("recording");
      editKeyDisplay.innerHTML = '<span class="key-placeholder">Presiona nueva combinación...</span>';
      confirmEdit.disabled = true;
    } else {
      isRecording = true;
      keyRecording = true;
      recordedKeys = null;
      keyDisplay.classList.add("recording");
      keyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
      confirmAssign.disabled = true;
    }
    chrome.runtime.sendMessage({ action: "startKeyRecording" });
  });

  if (isEditRecording) {
    editRecordedKeys = recorded;
    confirmEdit.disabled = false;
  } else {
    recordedKeys = recorded;
    confirmAssign.disabled = false;
  }
  isRecording = false;
  isEditRecording = false;
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
    href: pendingPickedData.href || null,
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
      <div class="shortcut-actions">
        <button class="btn-icon btn-test-shortcut" data-index="${i}" title="Probar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
        </button>
        <button class="btn-icon btn-edit-shortcut" data-index="${i}" title="Editar tecla">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon btn-delete-shortcut" data-key="${escapeAttr(s.key)}" data-modifiers="${escapeAttr(s.modifiers)}" title="Eliminar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
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

  shortcutList.querySelectorAll(".btn-edit-shortcut").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index);
      const shortcut = shortcuts[idx];
      openEditModal(shortcut);
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
  if (message.action === "keyRecorded" && isRecording) {
    const { key, modifiers } = message;
    const display = [...modifiers.split("+"), key].join(" + ");
    if (isReserved(key, modifiers)) {
      keyDisplay.classList.remove("recording");
      keyDisplay.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
          ${renderKeyCombination(display, "danger")}
          <span style="color:var(--text-muted);font-size:11px;">Reservado por el navegador</span>
          <button id="retryKeyBtn" class="btn-retry">
            Reintentar
          </button>
        </div>`;
      document.getElementById("retryKeyBtn").addEventListener("click", () => {
        isRecording = true;
        keyRecording = true;
        keyDisplay.classList.add("recording");
        keyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
        chrome.runtime.sendMessage({ action: "startKeyRecording" });
      });
      confirmAssign.disabled = true;
      isRecording = false;
      return;
    }
    recordedKeys = {
      key,
      modifiers,
      display,
    };
    keyDisplay.classList.remove("recording");
    keyDisplay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
        ${renderKeyCombination(display, "success")}
        <button id="retryKeyBtn" class="btn-retry">
          Cambiar tecla
        </button>
      </div>`;
    document.getElementById("retryKeyBtn").addEventListener("click", () => {
      isRecording = true;
      keyRecording = true;
      recordedKeys = null;
      keyDisplay.classList.add("recording");
      keyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
      confirmAssign.disabled = true;
      chrome.runtime.sendMessage({ action: "startKeyRecording" });
    });
    confirmAssign.disabled = false;
    isRecording = false;
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
