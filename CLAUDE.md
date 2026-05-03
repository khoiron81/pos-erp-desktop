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

# Full build (renderer + copy + main)
npm run build:all

# Package unpacked app for local testing (no installer)
npm run pack

# Build Windows NSIS installer → release/
npm run dist

# Build installer and publish to GitHub Releases
npm run dist:publish

# Alternative full build via shell script
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
- Intercepts webpack module chunks to patch `printMultiColumnLabel()`, `printZPLLabel()`, and `printImageLabel()`
- Automatically detects Zebra printers by name (matches `zebra`, `zd`, `zdesigner`) and routes PNG images through the PNG→ZPL converter instead of HTML printing

Never modify the injection order or remove the `dom-ready` fallback — the frontend's webpack chunks must be patched before they initialize.

### Print Pipeline

There are two distinct print paths:

1. **HTML/Native path** (`PrinterManager`): Renders HTML in a hidden `BrowserWindow`, then calls `webContents.print()` with `silent: true` and `marginType: 'none'`. Used for receipts (`escpos-renderer.ts`) and non-Zebra labels (`label-renderer.ts`).

2. **Raw/Win32 path** (`raw-printer.ts`): Writes raw bytes (ZPL or ESC/POS) to a temp file, then runs an inline PowerShell script that compiles C# on the fly and calls `winspool.drv WritePrinter`. This bypasses all driver rendering. Used for Zebra label printers.

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
| `update:downloaded` | main→renderer | Update ready (event push) |
| `update:error` | main→renderer | Update error (event push) |

### Settings Store

`electron-store` v8 (pinned to v8 — v10+ is ESM-only and incompatible with CommonJS `require()`). Stored encrypted with key `aktech-pos-erp-2026`. File: `pos-erp-settings` in the OS AppData directory. The `api_endpoint` setting controls which backend server the frontend connects to (default: `https://pos.aktech.co.id`).

### Auto-Update

Uses `electron-updater` pointing to GitHub Releases on `AktechDigitalSolutions/pos-erp-desktop`. Auto-download is enabled; install happens on app quit. Only active in packaged production builds (`app.isPackaged`). Update checks run 5 seconds after startup and every 4 hours.

### CI/CD

`.github/workflows/build-windows.yml` checks out both this repo and the frontend repo (`khoiron81/pos-erp-frontend`) to build a full Windows NSIS installer and publish to GitHub Releases. Triggered by `v*` tags or manual dispatch.

## Key Files

| File | Purpose |
|---|---|
| `main/main.ts` | Entry point: window creation, `app://` protocol, IPC handler registration |
| `main/preload.ts` | `contextBridge` — exposes `window.electronAPI` to renderer |
| `main/printer/printer-manager.ts` | HTML→native print for receipts and non-Zebra labels |
| `main/printer/raw-printer.ts` | Win32 `WritePrinter` via PowerShell + inline C# |
| `main/printer/png-to-zpl.ts` | Base64 PNG → ZPL `^GFA` monochrome conversion |
| `main/printer/escpos-renderer.ts` | Generates thermal receipt HTML (58mm/80mm) |
| `main/printer/label-renderer.ts` | Generates multi-column barcode label HTML |
| `main/printer/types.ts` | `ReceiptData`, `LabelPrintData`, `PrintResult` interfaces |
| `main/store/settings-store.ts` | Encrypted electron-store CRUD |
| `main/tray/tray-manager.ts` | System tray icon + context menu |
| `main/updater/auto-updater.ts` | GitHub Releases auto-update wiring |
| `renderer/electron-printer-bridge.js` | Fake `window.qz` + webpack patching injected into renderer |
| `renderer/sw.js` | Service worker for offline-first caching |
| `fix-paths.js` | Post-build: rewrites absolute `/_next/` paths to relative `./` |
| `electron-builder.yml` | Installer config, file inclusion list, GitHub publish config |
| `tsconfig.json` | Compiles `main/**/*.ts` → `dist/`, CommonJS target |
