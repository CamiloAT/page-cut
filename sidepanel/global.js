const globalList = document.getElementById("globalList");
const addGlobalBtn = document.getElementById("addGlobalBtn");
const globalShortcutCount = document.getElementById("globalShortcutCount");
const globalPickPanel = document.getElementById("globalPickPanel");
const backFromGlobalPick = document.getElementById("backFromGlobalPick");
const globalRecordBtn = document.getElementById("globalRecordBtn");
const globalAssignModal = document.getElementById("globalAssignModal");
const globalAssignBackdrop = document.getElementById("globalAssignBackdrop");
const closeGlobalAssignModal = document.getElementById("closeGlobalAssignModal");
const globalAssignKeyDisplay = document.getElementById("globalAssignKeyDisplay");
const globalAssignExtra = document.getElementById("globalAssignExtra");
const globalAssignUrl = document.getElementById("globalAssignUrl");
const globalAssignUrlError = document.getElementById("globalAssignUrlError");
const globalAssignLabel = document.getElementById("globalAssignLabel");
const globalAssignNewTab = document.getElementById("globalAssignNewTab");
const cancelGlobalAssign = document.getElementById("cancelGlobalAssign");
const confirmGlobalAssign = document.getElementById("confirmGlobalAssign");

let globalRecording = false;
let pendingGlobalShortcut = null;
let editingOriginal = null;
let cachedGlobalShortcuts = [];

function loadGlobalShortcuts() {
  chrome.runtime.sendMessage({ action: "getGlobalShortcuts" }, (response) => {
    const shortcuts = (response?.shortcuts || []).filter(s => s && s.key && s.modifiers);
    cachedGlobalShortcuts = shortcuts;
    globalShortcutCount.textContent = shortcuts.length > 0 ? `${shortcuts.length} shortcuts` : "Sin shortcuts aún";
    renderGlobalShortcuts(shortcuts);
  });
}

function renderGlobalShortcuts(shortcuts) {
  if (shortcuts.length === 0) {
    globalList.innerHTML = '<p class="empty-state">Sin shortcuts aún</p>';
    return;
  }

  globalList.innerHTML = shortcuts
    .map(
      (s) => {
        const keysHtml = buildKeysHtml(s.key, s.modifiers);
        const newTabBadge = s.newTab ? '<span class="new-tab-badge" title="Abre en pestaña nueva">↗</span>' : '';
        return `
    <div class="shortcut-card">
      <div class="shortcut-info">
        <div class="shortcut-text">${escapeHtml(s.label)}${newTabBadge}</div>
        <div class="shortcut-keys">${keysHtml}</div>
        <div class="element-url">${escapeHtml(s.url)}</div>
      </div>
      <div class="shortcut-actions">
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
    )
    .join("");

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
      if (existing) openGlobalAssignModal(existing);
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
  showGlobalPickPanel();
});

backFromGlobalPick.addEventListener("click", () => {
  hideGlobalPickPanel();
});

function showGlobalPickPanel() {
  globalPickPanel.classList.remove("hidden");
  document.querySelector("#tab-global .page-header").classList.add("hidden");
  globalList.classList.add("hidden");
}

function hideGlobalPickPanel() {
  globalPickPanel.classList.add("hidden");
  document.querySelector("#tab-global .page-header").classList.remove("hidden");
  globalList.classList.remove("hidden");
}

globalRecordBtn.addEventListener("click", () => {
  openGlobalAssignModal(null);
});

function cleanupGlobalKeyRecording() {
  if (globalRecording) {
    globalRecording = false;
    document.removeEventListener("keydown", onGlobalRecordKeydown, true);
  }
}

function startGlobalKeyRecording() {
  cleanupGlobalKeyRecording();
  pendingGlobalShortcut = pendingGlobalShortcut || {};
  globalAssignKeyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
  globalAssignKeyDisplay.classList.add("recording");
  globalAssignExtra.classList.add("hidden");
  confirmGlobalAssign.disabled = true;
  globalRecording = true;
  document.addEventListener("keydown", onGlobalRecordKeydown, true);
}

function openGlobalAssignModal(existing) {
  cleanupGlobalKeyRecording();
  pendingGlobalShortcut = existing ? { ...existing } : null;
  editingOriginal = existing ? { ...existing } : null;

  globalAssignUrl.value = existing ? existing.url : "";
  globalAssignUrlError.classList.remove("visible");
  globalAssignUrl.classList.remove("error");
  globalAssignLabel.value = existing ? (existing.label || "") : "";
  globalAssignNewTab.checked = existing ? !!existing.newTab : false;

  if (existing) {
    globalAssignKeyDisplay.classList.remove("recording");
    const display = [...(existing.modifiers ? existing.modifiers.split("+") : []), existing.key].join(" + ");
    globalAssignKeyDisplay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
        ${renderKeyCombination(display, "success")}
        <button class="btn-retry" id="globalRetryKey">Cambiar tecla</button>
      </div>`;
    document.getElementById("globalRetryKey").addEventListener("click", () => {
      delete pendingGlobalShortcut.key;
      delete pendingGlobalShortcut.modifiers;
      confirmGlobalAssign.disabled = true;
      startGlobalKeyRecording();
    });
    globalAssignExtra.classList.remove("hidden");
    const hasUrl = globalAssignUrl.value.trim().startsWith("http");
    confirmGlobalAssign.disabled = !hasUrl;
  } else {
    globalAssignKeyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
    globalAssignKeyDisplay.classList.add("recording");
    globalAssignExtra.classList.add("hidden");
    confirmGlobalAssign.disabled = true;
    globalRecording = true;
    document.addEventListener("keydown", onGlobalRecordKeydown, true);
  }

  globalAssignModal.classList.remove("hidden");
}

function closeGlobalAssignModalFn() {
  cleanupGlobalKeyRecording();
  globalAssignModal.classList.add("hidden");
  globalAssignKeyDisplay.classList.remove("recording");
  globalAssignExtra.classList.add("hidden");
  confirmGlobalAssign.disabled = true;
  editingOriginal = null;
}

closeGlobalAssignModal.addEventListener("click", closeGlobalAssignModalFn);
globalAssignBackdrop.addEventListener("click", closeGlobalAssignModalFn);
cancelGlobalAssign.addEventListener("click", closeGlobalAssignModalFn);

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

  globalAssignKeyDisplay.classList.remove("recording");

  if (isReserved(key, modifiers.join("+"))) {
    const display = [...modifiers, key].join(" + ");
    globalRecording = false;
    document.removeEventListener("keydown", onGlobalRecordKeydown, true);
    globalAssignKeyDisplay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
        ${renderKeyCombination(display, "danger")}
        <span style="color:var(--text-muted);font-size:11px;">Reservado por el navegador</span>
        <button class="btn-retry" id="globalRetryKey">Reintentar</button>
      </div>`;
    document.getElementById("globalRetryKey").addEventListener("click", () => {
      globalRecording = true;
      globalAssignKeyDisplay.classList.add("recording");
      globalAssignKeyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
      document.addEventListener("keydown", onGlobalRecordKeydown, true);
    });
    pendingGlobalShortcut = pendingGlobalShortcut || {};
    delete pendingGlobalShortcut.key;
    delete pendingGlobalShortcut.modifiers;
    confirmGlobalAssign.disabled = true;
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

      globalAssignKeyDisplay.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
          ${renderKeyCombination(display, "success")}
          <button class="btn-retry" id="globalRetryKey">Cambiar tecla</button>
        </div>`;
      document.getElementById("globalRetryKey").addEventListener("click", () => {
        globalRecording = true;
        globalAssignKeyDisplay.classList.add("recording");
        globalAssignKeyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
        globalAssignExtra.classList.add("hidden");
        delete pendingGlobalShortcut.key;
        delete pendingGlobalShortcut.modifiers;
        confirmGlobalAssign.disabled = true;
        document.addEventListener("keydown", onGlobalRecordKeydown, true);
      });

      globalAssignExtra.classList.remove("hidden");
      const hasUrl = globalAssignUrl.value.trim().startsWith("http");
      confirmGlobalAssign.disabled = !hasUrl;
    }, () => {
      globalRecording = true;
      globalAssignKeyDisplay.classList.add("recording");
      globalAssignKeyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
      document.addEventListener("keydown", onGlobalRecordKeydown, true);
    });
    return;
  }

  pendingGlobalShortcut = pendingGlobalShortcut || {};
  pendingGlobalShortcut.key = key;
  pendingGlobalShortcut.modifiers = modifiers.join("+");

  globalAssignKeyDisplay.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;">
      ${renderKeyCombination(display, "success")}
      <button class="btn-retry" id="globalRetryKey">Cambiar tecla</button>
    </div>`;
  document.getElementById("globalRetryKey").addEventListener("click", () => {
    globalRecording = true;
    globalAssignKeyDisplay.classList.add("recording");
    globalAssignKeyDisplay.innerHTML = '<span class="key-placeholder">Presiona una combinación de teclas...</span>';
    globalAssignExtra.classList.add("hidden");
    delete pendingGlobalShortcut.key;
    delete pendingGlobalShortcut.modifiers;
    confirmGlobalAssign.disabled = true;
    document.addEventListener("keydown", onGlobalRecordKeydown, true);
  });

  globalAssignExtra.classList.remove("hidden");
  const hasUrl = globalAssignUrl.value.trim().startsWith("http");
  confirmGlobalAssign.disabled = !hasUrl;
}

globalAssignUrl.addEventListener("input", () => {
  const hasKey = pendingGlobalShortcut && pendingGlobalShortcut.key;
  const val = globalAssignUrl.value.trim();
  const hasUrl = val.startsWith("http");
  confirmGlobalAssign.disabled = !(hasKey && hasUrl);
  if (val.length === 0) {
    globalAssignUrl.classList.remove("error");
    globalAssignUrlError.classList.remove("visible");
  } else if (!hasUrl) {
    globalAssignUrl.classList.add("error");
    globalAssignUrlError.classList.add("visible");
  } else {
    globalAssignUrl.classList.remove("error");
    globalAssignUrlError.classList.remove("visible");
  }
});

confirmGlobalAssign.addEventListener("click", () => {
  const url = globalAssignUrl.value.trim();
  if (!url.startsWith("http")) {
    showToast("URL inválida (debe empezar con http)");
    return;
  }

  const shortcut = {
    key: pendingGlobalShortcut.key,
    modifiers: pendingGlobalShortcut.modifiers,
    url: url,
    label: globalAssignLabel.value.trim() || url.replace(/^https?:\/\//, "").split("/")[0],
    newTab: globalAssignNewTab.checked,
  };

  const existing = editingOriginal;
  const keyChanged = existing && (existing.key !== shortcut.key || existing.modifiers !== shortcut.modifiers);

  const toastMsg = existing ? "Actualizado" : "Guardado";
  if (existing) {
    if (keyChanged) {
      chrome.runtime.sendMessage({
        action: "deleteGlobalShortcut",
        command: `${existing.key}|${existing.modifiers}`,
      }, () => {
        chrome.runtime.sendMessage({ action: "saveGlobalShortcut", shortcut }, () => {
          showToast(toastMsg);
          closeGlobalAssignModalFn();
          hideGlobalPickPanel();
          loadGlobalShortcuts();
        });
      });
    } else {
      chrome.runtime.sendMessage({ action: "saveGlobalShortcut", shortcut }, () => {
        showToast(toastMsg);
        closeGlobalAssignModalFn();
        hideGlobalPickPanel();
        loadGlobalShortcuts();
      });
    }
  } else {
    chrome.runtime.sendMessage({ action: "saveGlobalShortcut", shortcut }, () => {
      showToast(toastMsg);
      closeGlobalAssignModalFn();
      hideGlobalPickPanel();
      loadGlobalShortcuts();
    });
  }
});

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

function showDuplicateModal(dupes, onConfirm, onCancel) {
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
  cancelBtn.addEventListener("click", () => {
    close();
    if (onCancel) onCancel();
  }, { once: true });

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

loadGlobalShortcuts();
