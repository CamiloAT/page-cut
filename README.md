# Page Cut

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4CAF50?logo=google&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)]()

Chrome extension that lets you assign custom shortcuts to elements on any web page, and create global shortcuts that navigate to URLs of your choice.

---

## Main Features

* **Per-page shortcuts:** Assign key combinations to specific elements on each website you visit.
* **Global shortcuts:** Create shortcuts that work from any page to navigate directly to a URL.
* **Visual picker:** Click any element on the page to capture its selector interactively.
* **Element scanner:** Scan all buttons, links, and inputs on the page with filters by element type.
* **Duplicate detection:** Avoid key conflicts between local and global shortcuts with real-time warnings.
* **Dark/Light mode:** Customizable theme with a toggle in the header.
* **Smart selector:** Generates robust CSS selectors with automatic collapsed menu recovery.

---

## Execution and Development Guide

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tu-usuario/page-cut.git
   cd page-cut
   ```

2. **Load in Chrome:**
   - Open `chrome://extensions/` in your browser.
   - Enable **"Developer mode"** (toggle in the top right corner).
   - Click **"Load unpacked"**.
   - Select the project root folder.

3. **Use the extension:**
   - Click the Page Cut icon in the toolbar to open the side panel.
   - Navigate to any web page and use the panel to add shortcuts.
   - Local shortcuts are saved per origin (domain).
   - Global shortcuts work from any page.

> **Note:** The extension requires `sidePanel`, `activeTab`, `scripting`, `storage`, `tabs` permissions and `<all_urls>` access to work correctly.

---

## Project Structure

```text
page-cut/
├── manifest.json              ← Extension Manifest V3
├── service-worker.js          ← Background service worker
├── content.js                 ← Web page content script injection
├── global-listener.js         ← Global listener for global shortcuts
├── icons/
│   ├── icon16.png             ← 16x16 icon (toolbar)
│   ├── icon48.png             ← 48x48 icon (extensions page)
│   └── icon128.png            ← 128x128 icon (welcome screen)
├── sidepanel/
│   ├── sidepanel.html         ← Side panel structure
│   ├── sidepanel.js           ← Main panel logic
│   ├── sidepanel.css          ← Styles (light/dark theme)
│   └── global.js              ← Global shortcuts logic
└── test-page.html             ← Test page
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Extension Manifest V3 |
| UI | HTML + CSS (Custom Properties, Dark/Light Theme) |
| Logic | Vanilla JavaScript (no dependencies) |
| Storage | chrome.storage.local |
| Background | Service Worker |
| Content Scripts | content.js + global-listener.js |

---

## Authors

| Name | GitHub |
|---|---|
| **Camilo Andres Arias Tenjo** | [@CamiloAT](https://github.com/CamiloAT) |

*Browser Extension Development*
