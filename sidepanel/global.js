const globalList = document.getElementById("globalList");
const addGlobalBtn = document.getElementById("addGlobalBtn");

let globalRecording = false;
let pendingGlobalShortcut = null;
let cachedGlobalShortcuts = [];

function loadGlobalShortcuts() {
  chrome.runtime.sendMessage({ action: "getGlobalShortcuts" }, (response) => {
    const shortcuts = (response?.shortcuts || []).filter(s => s && s.key && s.modifiers);
    cachedGlobalShortcuts = shortcuts;
    renderGlobalShortcuts(shortcuts);
  });
}

function renderGlobalShortcuts(shortcuts) {
  if (shortcuts.length === 0) {
    globalList.innerHTML = '<p class="empty-state">No hay shortcuts globales. Agrega uno con el botón de arriba.</p>';
    return;
  }

  let html = '<div class="global-table">';
  html += '<div class="global-row global-header-row"><div class="global-col-keys">Tecla</div><div class="global-col-label">Etiqueta</div><div class="global-col-url">URL</div><div class="global-col-actions"></div></div>';

  for (const s of shortcuts) {
    const keysHtml = buildKeysHtml(s.key, s.modifiers);
    const newTabBadge = s.newTab ? '<span class="new-tab-badge" title="Abre en pestaña nueva">↗</span>' : '';
    html += `
      <div class="global-row">
        <div class="global-col-keys">${keysHtml}</div>
        <div class="global-col-label">${escapeHtml(s.label)}${newTabBadge}</div>
        <div class="global-col-url">${escapeHtml(s.url)}</div>
        <div class="global-col-actions">
          <button class="btn-icon btn-test-global" data-url="${escapeAttr(s.url)}" title="Probar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </button>
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

  globalList.querySelectorAll(".btn-test-global").forEach((btn) => {
    btn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.update(tabs[0].id, { url: btn.dataset.url });
        } else {
          chrome.tabs.create({ url: btn.dataset.url });
        }
      });
      showToast("Navegando...");
    });
  });

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
      showDeleteConfirmModal(existing, "global", () => {
        deleteGlobalShortcut(existing);
      });
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

  if (modifiers.length === 0) {
    showToast("Usa Ctrl, Shift o Alt como modificador");
    return;
  }

  const key = e.key.toUpperCase();
  const keyDisplay = document.getElementById("globalKeyDisplay");
  const saveBtn = document.getElementById("globalSaveForm");
  if (!keyDisplay) return;

  keyDisplay.classList.remove("recording");

  if (isReserved(key, modifiers.join("+"))) {
    const display = [...modifiers, key].join(" + ");
    globalRecording = false;
    document.removeEventListener("keydown", onGlobalRecordKeydown, true);
    keyDisplay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
        ${renderKeyCombination(display, "danger")}
        <span style="color:var(--text-muted);font-size:11px;">Reservado por el navegador</span>
        <button class="btn-retry" id="globalRetryKey">Reintentar</button>
      </div>`;
    document.getElementById("globalRetryKey").addEventListener("click", () => {
      globalRecording = true;
      keyDisplay.classList.add("recording");
      keyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
      document.addEventListener("keydown", onGlobalRecordKeydown, true);
    });
    pendingGlobalShortcut = pendingGlobalShortcut || {};
    delete pendingGlobalShortcut.key;
    delete pendingGlobalShortcut.modifiers;
    if (saveBtn) saveBtn.disabled = true;
    return;
  }

  const display = [...modifiers, key].join(" + ");
  globalRecording = false;
  document.removeEventListener("keydown", onGlobalRecordKeydown, true);

  const excludeKey = pendingGlobalShortcut && pendingGlobalShortcut.key ? pendingGlobalShortcut.key : null;
  const excludeMods = pendingGlobalShortcut && pendingGlobalShortcut.modifiers ? pendingGlobalShortcut.modifiers : null;
  const dupes = findDuplicateForGlobal(key, modifiers.join("+"), excludeKey, excludeMods);

  if (dupes.length > 0) {
    showDuplicateModal(dupes, () => {
      pendingGlobalShortcut = pendingGlobalShortcut || {};
      pendingGlobalShortcut.key = key;
      pendingGlobalShortcut.modifiers = modifiers.join("+");

      keyDisplay.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
          ${renderKeyCombination(display, "success")}
          <button class="btn-retry" id="globalRetryKey">Cambiar tecla</button>
        </div>`;
      document.getElementById("globalRetryKey").addEventListener("click", () => {
        globalRecording = true;
        keyDisplay.classList.add("recording");
        keyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
        globalFormExtra.classList.add("hidden");
        delete pendingGlobalShortcut.key;
        delete pendingGlobalShortcut.modifiers;
        if (saveBtn) saveBtn.disabled = true;
        document.addEventListener("keydown", onGlobalRecordKeydown, true);
      });

      globalFormExtra.classList.remove("hidden");
      if (saveBtn) {
        const urlInput = document.getElementById("globalUrlInput");
        const hasUrl = urlInput && urlInput.value.trim().startsWith("http");
        saveBtn.disabled = !hasUrl;
      }
    });
    return;
  }

  pendingGlobalShortcut = pendingGlobalShortcut || {};
  pendingGlobalShortcut.key = key;
  pendingGlobalShortcut.modifiers = modifiers.join("+");

  keyDisplay.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
      ${renderKeyCombination(display, "success")}
      <button class="btn-retry" id="globalRetryKey">Cambiar tecla</button>
    </div>`;
  document.getElementById("globalRetryKey").addEventListener("click", () => {
    globalRecording = true;
    keyDisplay.classList.add("recording");
    keyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
    globalFormExtra.classList.add("hidden");
    delete pendingGlobalShortcut.key;
    delete pendingGlobalShortcut.modifiers;
    if (saveBtn) saveBtn.disabled = true;
    document.addEventListener("keydown", onGlobalRecordKeydown, true);
  });

  globalFormExtra.classList.remove("hidden");
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
        <label class="form-label">Presiona la combinación de teclas:</label>
        <div class="global-key-display" id="globalKeyDisplay">
          ${existing ? buildKeysHtml(existing.key, existing.modifiers) : '<span class="key-placeholder">Presiona una combinación de teclas...</span>'}
        </div>
      </div>
      <div class="global-form-extra ${existing ? '' : 'hidden'}" id="globalFormExtra">
        <div class="global-form-step">
          <label class="form-label" for="globalUrlInput">URL de destino:</label>
          <input type="url" class="form-input" id="globalUrlInput" placeholder="https://ejemplo.com" value="${existing ? escapeAttr(existing.url) : ''}">
        </div>
        <div class="global-form-step">
          <label class="form-label" for="globalLabelInput">Etiqueta (opcional):</label>
          <input type="text" class="form-input" id="globalLabelInput" placeholder="Mi shortcut" value="${existing ? escapeAttr(existing.label || '') : ''}">
        </div>
        <label class="checkbox-label">
          <input type="checkbox" id="globalNewTab" ${existing && existing.newTab ? 'checked' : ''}>
          <span>Abrir en pestaña nueva</span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="globalCancelForm">Cancelar</button>
        <button class="btn btn-primary" id="globalSaveForm" ${existing ? '' : 'disabled'}>Guardar</button>
      </div>
    </div>
  `;

  globalList.innerHTML = formHtml;

  const keyDisplay = document.getElementById("globalKeyDisplay");
  const globalFormExtra = document.getElementById("globalFormExtra");
  const urlInput = document.getElementById("globalUrlInput");
  const labelInput = document.getElementById("globalLabelInput");
  const newTabCheckbox = document.getElementById("globalNewTab");
  const saveBtn = document.getElementById("globalSaveForm");
  const cancelBtn = document.getElementById("globalCancelForm");

  function startKeyRecording() {
    globalRecording = true;
    keyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
    keyDisplay.classList.add("recording");
    document.addEventListener("keydown", onGlobalRecordKeydown, true);
  }

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
      newTab: newTabCheckbox.checked,
    };

    const keyChanged = existing && (existing.key !== shortcut.key || existing.modifiers !== shortcut.modifiers);

    if (keyChanged) {
      chrome.runtime.sendMessage({
        action: "deleteGlobalShortcut",
        command: `${existing.key}|${existing.modifiers}`,
      }, () => {
        chrome.runtime.sendMessage({ action: "saveGlobalShortcut", shortcut }, () => {
          showToast("Guardado");
          loadGlobalShortcuts();
        });
      });
    } else {
      chrome.runtime.sendMessage({ action: "saveGlobalShortcut", shortcut }, () => {
        showToast("Guardado");
        loadGlobalShortcuts();
      });
    }
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

function showDeleteConfirmModal(shortcut, type, onConfirm) {
  const modal = document.getElementById("deleteModal");
  const backdrop = document.getElementById("deleteModalBackdrop");
  const closeBtn = document.getElementById("closeDeleteModal");
  const cancelBtn = document.getElementById("cancelDelete");
  const confirmBtn = document.getElementById("confirmDelete");
  const textEl = document.getElementById("deleteModalText");
  const detailEl = document.getElementById("deleteModalDetail");

  if (!modal || !backdrop || !closeBtn || !cancelBtn || !confirmBtn) return;

  const keysHtml = buildKeysHtml(shortcut.key, shortcut.modifiers);

  if (type === "global") {
    textEl.textContent = "¿Estás seguro de que quieres eliminar este shortcut global?";
    detailEl.innerHTML = `
      <div class="delete-detail-label">${escapeHtml(shortcut.label || shortcut.url)}</div>
      <div class="delete-detail-keys">${keysHtml}</div>
      <div class="delete-detail-url">${escapeHtml(shortcut.url)}</div>
    `;
  } else {
    textEl.textContent = "¿Estás seguro de que quieres eliminar este shortcut?";
    detailEl.innerHTML = `
      <div class="delete-detail-label">${escapeHtml(shortcut.text || shortcut.tagLabel || shortcut.tag)}</div>
      <div class="delete-detail-keys">${keysHtml}</div>
      <div class="delete-detail-selector">${escapeHtml(shortcut.selector)}</div>
    `;
  }

  modal.classList.remove("hidden");

  function close() {
    modal.classList.add("hidden");
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    const newConfirmBtn = document.getElementById("confirmDelete");
    newConfirmBtn.addEventListener("click", () => {});
  }

  backdrop.addEventListener("click", close, { once: true });
  closeBtn.addEventListener("click", close, { once: true });
  cancelBtn.addEventListener("click", close, { once: true });

  confirmBtn.addEventListener("click", () => {
    close();
    onConfirm();
  }, { once: true });
}

let cachedLocalShortcuts = [];

function findDuplicateForLocal(key, modifiers, excludeKey, excludeModifiers) {
  const dupes = [];
  for (const s of cachedGlobalShortcuts) {
    if (s.key === key && s.modifiers === modifiers) {
      if (!(excludeKey && excludeModifiers && s.key === excludeKey && s.modifiers === excludeModifiers)) {
        dupes.push({ type: "global", label: s.label || s.url, detail: s.url });
      }
    }
  }
  for (const s of cachedLocalShortcuts) {
    if (s.key === key && s.modifiers === modifiers) {
      if (!(excludeKey && excludeModifiers && s.key === excludeKey && s.modifiers === excludeModifiers)) {
        dupes.push({ type: "page", label: s.text || s.tagLabel || s.tag, detail: s.selector });
      }
    }
  }
  return dupes;
}

function findDuplicateForGlobal(key, modifiers, excludeKey, excludeModifiers) {
  const dupes = [];
  for (const s of cachedGlobalShortcuts) {
    if (s.key === key && s.modifiers === modifiers) {
      if (!(excludeKey && excludeModifiers && s.key === excludeKey && s.modifiers === excludeModifiers)) {
        dupes.push({ type: "global", label: s.label || s.url, detail: s.url });
      }
    }
  }
  for (const s of cachedLocalShortcuts) {
    if (s.key === key && s.modifiers === modifiers) {
      dupes.push({ type: "page", label: s.text || s.tagLabel || s.tag, detail: s.selector });
    }
  }
  return dupes;
}

function showDuplicateModal(dupes, onConfirm) {
  const modal = document.getElementById("duplicateModal");
  const backdrop = document.getElementById("duplicateModalBackdrop");
  const closeBtn = document.getElementById("closeDuplicateModal");
  const cancelBtn = document.getElementById("cancelDuplicate");
  const confirmBtn = document.getElementById("confirmDuplicate");
  const detailEl = document.getElementById("duplicateModalDetail");

  if (!modal || !backdrop || !closeBtn || !cancelBtn || !confirmBtn) return;

  let html = "";
  for (const d of dupes) {
    const typeLabel = d.type === "global" ? "Global" : "Esta página";
    html += `
      <div class="delete-detail-label">${escapeHtml(d.label)}</div>
      <div class="delete-detail-url" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:10px;font-weight:600;color:var(--text-secondary);">${typeLabel}:</span>
        <span style="font-family:'SF Mono',Monaco,monospace;font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.detail)}</span>
      </div>
    `;
  }
  detailEl.innerHTML = html;

  modal.classList.remove("hidden");

  function close() {
    modal.classList.add("hidden");
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    const newConfirmBtn = document.getElementById("confirmDuplicate");
    newConfirmBtn.addEventListener("click", () => {});
  }

  backdrop.addEventListener("click", close, { once: true });
  closeBtn.addEventListener("click", close, { once: true });
  cancelBtn.addEventListener("click", close, { once: true });

  confirmBtn.addEventListener("click", () => {
    close();
    onConfirm();
  }, { once: true });
}

chrome.tabs.onActivated.addListener(() => {
  updateCurrentTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    updateCurrentTab();
  }
});
