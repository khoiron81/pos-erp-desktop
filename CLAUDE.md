# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**POS ERP UMKM - Desktop Edition** is a Windows desktop application wrapping a Next.js frontend in Electron. The Electron shell handles native printing, encrypted settings, system tray, and auto-update. The frontend (`../frontend/`) is a separate repository and is built independently into a static export placed in `renderer/`.

## Commands

```bash
# Install dependencies
npm install

# Compile TypeScript (main process only, outputs to dist/)
npm run build:main

# Run in development mode (compiles + launches Electron with DevTools)
npm run dev

# Build Next.js renderer from sibling frontend repo (requires ../frontend/)
npm run build:renderer   # runs: cd ../frontend && NEXT_PUBLIC_DESKTOP=true npx next build
npm run copy:renderer    # copies ../frontend/out/* → renderer/

# Download jsbarcode for offline label printing (must run after copy:renderer)
curl -fsSL https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js \
     -o renderer/jsbarcode.min.js

# Full build (renderer + copy + main)
npm run build:all

# Package unpacked app for local testing (no installer)
npm run pack

# Build Windows NSIS installer → release/
npm run dist

# Build installer and publish to GitHub Releases
npm run dist:publish

# Alternative full build via shell script (includes jsbarcode download)
bash scripts/build.sh --dist
```

There is no test suite and no linter configured in this repository.

## Architecture

### Two-Process Electron Model

**Main process** (`main/`) is TypeScript compiled to `dist/main/`. It handles all Node.js-level operations and communicates with the renderer via IPC.

**Renderer process** (`renderer/`) is a pre-built static Next.js export — never compiled from source in this repo. The renderer is served via a custom `app://` protocol registered in the main process, which allows absolute paths like `/_next/static/...` to resolve correctly from disk.

### Critical: Printer Bridge Injection

The frontend was originally built with QZ Tray for printing. The desktop app bypasses QZ Tray entirely by injecting `renderer/electron-printer-bridge.js` into the renderer on every navigation (`did-navigate` + `dom-ready` fallback). This script:
- Creates a fake `window.qz` object that transparently delegates all print calls to `window.electronAPI`
- Intercepts webpack module chunks to patch `printMultiColumnLabel()`, `printZPLLabel()`, and `printImageLabel()` — **detected by exported function names, not chunk IDs**, so it survives frontend rebuilds
- Automatically detects Zebra printers by name (matches `zebra`, `zd`, `zdesigner`) and routes PNG images through the PNG→ZPL converter instead of HTML printing
- Reads label config from `electronAPI.getSettings()` (the encrypted electron-store), not localStorage

Never modify the injection order or remove the `dom-ready` fallback — the frontend's webpack chunks must be patched before they initialize.

### Print Pipeline

There are two distinct print paths:

1. **HTML/Native path** (`PrinterManager`): Renders HTML in a hidden `BrowserWindow`, then calls `webContents.print()` with `silent: true` and `marginType: 'none'`. Used for receipts (`escpos-renderer.ts`) and non-Zebra labels (`label-renderer.ts`). Label HTML is written to a temp file in `renderer/` and loaded via `app://` so local assets (jsbarcode) resolve correctly.

2. **Raw/Win32 path** (`raw-printer.ts`): Writes raw bytes (ZPL or ESC/POS) to a temp file, then runs an inline PowerShell script that compiles C# on the fly and calls `winspool.drv WritePrinter`. Runs async (non-blocking). Used for Zebra label printers.

Label routing logic in `main.ts` `print:label` handler:
- If `data.isRaw` + `data.imageData` starts with `^XA` → raw ZPL → Win32 spooler
- If `data.isRaw` + `data.imageData` is base64 PNG + Zebra printer → `pngToZPL()` → Win32 spooler
- If `data.isRaw` + `data.imageData` is base64 PNG + non-Zebra → HTML `<img>` → native print
- If structured `LabelPrintData` → `PrinterManager.printLabel()` → HTML render → native print

### IPC Channel Reference

All channels use `ipcMain.handle` (request/response pattern via `ipcRenderer.invoke`):

| Channel | Direction | Purpose |
|---|---|---|
| `printer:list` | renderer→main | Returns array of installed printers |
| `print:receipt` | renderer→main | Print thermal receipt (raw ESC/POS or structured data) |
| `print:label` | renderer→main | Print barcode label (ZPL, PNG, or structured data) |
| `app:settings:get` | renderer→main | Get all settings from electron-store |
| `app:settings:set` | renderer→main | Update settings; applies `auto_start` registry entry |
| `app:version` | renderer→main | App version string |
| `app:platform` | renderer→main | `{ platform, arch }` |
| `app:toggle-fullscreen` | renderer→main | Toggle fullscreen |
| `app:toggle-kiosk` | renderer→main | Toggle kiosk mode |
| `app:quit` | renderer→main | Quit app |
| `app:reload` | renderer→main | Reload main window |
| `app:open-devtools` | renderer→main | Open Chrome DevTools |
| `update:install` | renderer→main | Trigger `quitAndInstall()` |
| `update:check` | renderer→main | Manual update check |
| `update:available` | main→renderer | Update found (event push) |
| `update:downloaded` | main→renderer | Update ready — renderer shows in-app banner |
| `update:error` | main→renderer | Update error (event push) |

### Settings Store

`electron-store` v8 (pinned to v8 — v10+ is ESM-only and incompatible with CommonJS `require()`). Stored encrypted with key `aktech-pos-erp-2026`. File: `pos-erp-settings` in the OS AppData directory. Key settings:

| Key | Type | Notes |
|---|---|---|
| `api_endpoint` | string | Backend URL; used to configure CORS interceptor on startup |
| `receipt_footer` | `string[]` | Configurable receipt footer lines; default is the "Terima kasih" message |
| `label_size` | `'33x15'\|'30x20'\|'50x30'` | Parsed as `WIDTHxHEIGHT` mm |
| `label_columns` | number | Labels per row |

### CORS & Security

`webSecurity` is **not** disabled. Instead, a `session.defaultSession.webRequest.onHeadersReceived` interceptor is registered at startup for the configured `api_endpoint` host, injecting CORS response headers. This allows the `app://` renderer to call the backend API without browser CORS errors. If you change `api_endpoint`, restart the app for the interceptor to update.

### Logging

`electron-log` writes to `%AppData%/POS ERP UMKM/logs/main.log` in production. Bridge/ZPL renderer messages are forwarded from renderer console to the log file. Use `log.info/warn/error` in main-process code.

### Auto-Update

Uses `electron-updater` pointing to GitHub Releases on `AktechDigitalSolutions/pos-erp-desktop`. Auto-download is enabled; install happens on app quit. Only active in packaged production builds (`app.isPackaged`). When a download completes, the `update:downloaded` event is sent to the renderer to display a non-blocking in-app notification (no OS modal dialog). IPC handlers are guarded with `removeHandler` before registration to prevent duplicate-handler errors on hot reload.

### CI/CD

`.github/workflows/build-windows.yml` builds a full Windows NSIS installer and publishes to GitHub Releases. Triggered by `v*` tags or manual dispatch. If `khoiron81/pos-erp-frontend` is a **private** repository, add a PAT as `secrets.GH_PAT` — `GITHUB_TOKEN` only accesses the current repo. The workflow also downloads `jsbarcode.min.js` into `renderer/` so label printing works offline.

## Key Files

| File | Purpose |
|---|---|
| `main/main.ts` | Entry point: window creation, `app://` protocol, CORS interceptor, IPC handler registration |
| `main/preload.ts` | `contextBridge` — exposes `window.electronAPI` to renderer |
| `main/printer/printer-manager.ts` | HTML→native print for receipts and non-Zebra labels; accepts `rendererPath` in constructor |
| `main/printer/raw-printer.ts` | Async Win32 `WritePrinter` via PowerShell + inline C# |
| `main/printer/png-to-zpl.ts` | Base64 PNG → ZPL `^GFA` monochrome conversion |
| `main/printer/escpos-renderer.ts` | Generates thermal receipt HTML (58mm/80mm); ASCII separators; configurable footer |
| `main/printer/label-renderer.ts` | Generates multi-column barcode label HTML; barcode height in mm; accepts `jsbarcodeScriptPath` option |
| `main/printer/types.ts` | `ReceiptData` (with `receiptFooter?`), `LabelPrintData`, `PrintResult` interfaces |
| `main/store/settings-store.ts` | Encrypted electron-store CRUD; includes `receipt_footer` setting |
| `main/tray/tray-manager.ts` | System tray icon + context menu; `destroyTray()` called on `will-quit` |
| `main/updater/auto-updater.ts` | GitHub Releases auto-update; no modal dialog; IPC double-registration guard |
| `renderer/electron-printer-bridge.js` | Fake `window.qz` + content-based webpack module patching; reads settings from `electronAPI` |
| `renderer/sw.js` | Cache-first service worker for offline-first POS usage |
| `renderer/jsbarcode.min.js` | Bundled JsBarcode — required for offline label printing; downloaded at build time |
| `fix-paths.js` | Post-build: rewrites absolute `/_next/` paths to relative `./` |
| `electron-builder.yml` | Installer config, file inclusion list, GitHub publish config |
| `tsconfig.json` | Compiles `main/**/*.ts` → `dist/`, CommonJS target |
