const globalList = document.getElementById("globalList");
const addGlobalBtn = document.getElementById("addGlobalBtn");

let globalRecording = false;
let pendingGlobalShortcut = null;

function loadGlobalShortcuts() {
  chrome.runtime.sendMessage({ action: "getGlobalShortcuts" }, (response) => {
    const shortcuts = response?.shortcuts || [];
    renderGlobalShortcuts(shortcuts);
  });
}

function renderGlobalShortcuts(shortcuts) {
  if (shortcuts.length === 0) {
    globalList.innerHTML = '<p class="empty-state">No hay shortcuts globales. Agregá uno con el botón de arriba.</p>';
    return;
  }

  let html = '<div class="global-table">';
  html += '<div class="global-row global-header-row"><div class="global-col-keys">Tecla</div><div class="global-col-label">Etiqueta</div><div class="global-col-url">URL</div><div class="global-col-actions"></div></div>';

  for (const s of shortcuts) {
    const keysHtml = buildKeysHtml(s.key, s.modifiers);
    html += `
      <div class="global-row">
        <div class="global-col-keys">${keysHtml}</div>
        <div class="global-col-label">${escapeHtml(s.label)}</div>
        <div class="global-col-url">${escapeHtml(s.url)}</div>
        <div class="global-col-actions">
          <button class="btn-icon btn-edit-global" data-key="${escapeAttr(s.key)}" data-modifiers="${escapeAttr(s.modifiers)}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-icon btn-delete-global" data-key="${escapeAttr(s.key)}" data-modifiers="${escapeAttr(s.modifiers)}" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  html += '</div>';
  globalList.innerHTML = html;

  globalList.querySelectorAll(".btn-edit-global").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const modifiers = btn.dataset.modifiers;
      const existing = shortcuts.find((s) => s.key === key && s.modifiers === modifiers);
      if (existing) openGlobalForm(existing);
    });
  });

  globalList.querySelectorAll(".btn-delete-global").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const modifiers = btn.dataset.modifiers;
      const existing = shortcuts.find((s) => s.key === key && s.modifiers === modifiers);
      if (!existing) return;
      if (!confirm(`Eliminar shortcut "${existing.label || existing.url}"?`)) return;
      deleteGlobalShortcut(existing);
    });
  });
}

function buildKeysHtml(key, modifiers) {
  const parts = modifiers ? modifiers.split("+") : [];
  parts.push(key);
  return parts.map((k) => `<span class="key">${escapeHtml(k)}</span>`).join('<span class="key-separator">+</span>');
}

addGlobalBtn.addEventListener("click", () => {
  openGlobalForm(null);
});

function cleanupGlobalKeyRecording() {
  if (globalRecording) {
    globalRecording = false;
    document.removeEventListener("keydown", onGlobalRecordKeydown, true);
  }
}

function onGlobalRecordKeydown(e) {
  if (!globalRecording) return;
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
  globalRecording = false;
  document.removeEventListener("keydown", onGlobalRecordKeydown, true);

  const keyDisplay = document.getElementById("globalKeyDisplay");
  const saveBtn = document.getElementById("globalSaveForm");
  if (!keyDisplay) return;

  keyDisplay.classList.remove("recording");

  pendingGlobalShortcut = pendingGlobalShortcut || {};
  pendingGlobalShortcut.key = key;
  pendingGlobalShortcut.modifiers = modifiers.join("+");

  keyDisplay.innerHTML = buildKeysHtml(key, modifiers.join("+"));

  if (saveBtn) {
    const urlInput = document.getElementById("globalUrlInput");
    const hasUrl = urlInput && urlInput.value.trim().startsWith("http");
    saveBtn.disabled = !hasUrl;
  }
}

function openGlobalForm(existing) {
  cleanupGlobalKeyRecording();

  pendingGlobalShortcut = existing ? { ...existing } : null;

  const formHtml = `
    <div class="global-form">
      <div class="global-form-step">
        <label class="form-label">Presioná la combinación de teclas:</label>
        <div class="global-key-display" id="globalKeyDisplay">
          ${existing ? buildKeysHtml(existing.key, existing.modifiers) : '<span class="key-placeholder">Esperando tecla...</span>'}
        </div>
        <button class="btn btn-secondary btn-full" id="globalRetryKey">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          Reintentar
        </button>
      </div>
      <div class="global-form-step">
        <label class="form-label" for="globalUrlInput">URL de destino:</label>
        <input type="url" class="form-input" id="globalUrlInput" placeholder="https://ejemplo.com" value="${existing ? escapeAttr(existing.url) : ''}">
      </div>
      <div class="global-form-step">
        <label class="form-label" for="globalLabelInput">Etiqueta (opcional):</label>
        <input type="text" class="form-input" id="globalLabelInput" placeholder="Mi shortcut" value="${existing ? escapeAttr(existing.label || '') : ''}">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="globalCancelForm">Cancelar</button>
        <button class="btn btn-primary" id="globalSaveForm" ${existing ? '' : 'disabled'}>Guardar</button>
      </div>
    </div>
  `;

  globalList.innerHTML = formHtml;

  const keyDisplay = document.getElementById("globalKeyDisplay");
  const retryBtn = document.getElementById("globalRetryKey");
  const urlInput = document.getElementById("globalUrlInput");
  const labelInput = document.getElementById("globalLabelInput");
  const saveBtn = document.getElementById("globalSaveForm");
  const cancelBtn = document.getElementById("globalCancelForm");

  function startKeyRecording() {
    globalRecording = true;
    keyDisplay.innerHTML = '<span class="key-placeholder">Escuchando...</span>';
    keyDisplay.classList.add("recording");
    document.addEventListener("keydown", onGlobalRecordKeydown, true);
  }

  retryBtn.addEventListener("click", startKeyRecording);
  urlInput.addEventListener("input", () => {
    const hasKey = pendingGlobalShortcut && pendingGlobalShortcut.key;
    const hasUrl = urlInput.value.trim().startsWith("http");
    saveBtn.disabled = !(hasKey && hasUrl);
  });

  saveBtn.addEventListener("click", () => {
    const url = urlInput.value.trim();
    if (!url.startsWith("http")) {
      showToast("URL inválida (debe empezar con http)");
      return;
    }

    const shortcut = {
      key: pendingGlobalShortcut.key,
      modifiers: pendingGlobalShortcut.modifiers,
      url: url,
      label: labelInput.value.trim() || url.replace(/^https?:\/\//, "").split("/")[0],
    };

    chrome.runtime.sendMessage({ action: "saveGlobalShortcut", shortcut }, () => {
      showToast("Guardado");
      loadGlobalShortcuts();
    });
  });

  cancelBtn.addEventListener("click", () => {
    cleanupGlobalKeyRecording();
    loadGlobalShortcuts();
  });

  if (!existing) {
    startKeyRecording();
  }
}

function deleteGlobalShortcut(shortcut) {
  chrome.runtime.sendMessage({
    action: "deleteGlobalShortcut",
    command: `${shortcut.key}|${shortcut.modifiers}`,
  }, () => {
    showToast("Eliminado");
    loadGlobalShortcuts();
  });
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  if (!toast || !toastMessage) return;
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
