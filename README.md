# POS ERP UMKM - Desktop App

Windows Desktop Application for POS ERP UMKM - Material Store Edition.

Built with **Electron** + **Next.js Static Export**.

## Features
- ✅ Offline-first (works without internet)
- ✅ Native printing (thermal receipt + barcode label)
- ✅ Auto-sync when online
- ✅ Barcode scanner support (USB HID)
- ✅ Auto-update from GitHub Releases
- ✅ System tray, kiosk mode, fullscreen

## Download & Install

1. Go to [Releases](../../releases)
2. Download `POS-ERP-UMKM-*-Setup.exe`
3. Run installer, follow the wizard
4. Done!

## Development

```bash
# Install dependencies
npm install

# Build renderer (from frontend/)
cd ../frontend && NEXT_PUBLIC_DESKTOP=true npx next build
cp -r out/* ../desktop-app/renderer/

# Run in dev mode
cd ../desktop-app
npm run dev

# Build Windows installer
bash scripts/build.sh --dist
```

## Architecture

```
Electron App
  ├── Main Process (Node.js)
  │   ├── Native Printer (receipt + label)
  │   ├── Settings Store (encrypted)
  │   ├── System Tray
  │   └── Auto-Updater (GitHub Releases)
  └── Renderer (Next.js Static Export)
      ├── Dexie.js (IndexedDB offline DB)
      └── API Client → Remote Server
```

## Tech Stack
- **Electron** 33.x
- **Next.js** 14 (Static Export)
- **TypeScript** 5.x
- **electron-store** (encrypted settings)
- **electron-updater** (GitHub Releases)
- **electron-builder** (NSIS installer)

---

**Developed by PT. Aktech Digital Solutions**
📞 08112638350 | 🌐 https://aktech.co.id
