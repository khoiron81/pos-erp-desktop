/*
POS ERP UMKM - Desktop Edition
Material Store Edition

Developed by PT. Aktech Digital Solutions
Phone: 08112638350
Website: https://aktech.co.id
*/

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import { initSettingsStore, getSettings, setSettings } from './store/settings-store';
import { PrinterManager } from './printer/printer-manager';
import { initAutoUpdater } from './updater/auto-updater';
import { initTray } from './tray/tray-manager';

let mainWindow: BrowserWindow | null = null;
let printerManager: PrinterManager | null = null;

const isDev = !app.isPackaged;
const RENDERER_PATH = isDev
    ? path.join(__dirname, '..', '..', 'renderer')
    : path.join(process.resourcesPath, 'renderer');

// ============================================
// WINDOW CREATION
// ============================================

function createMainWindow(): void {
    const settings = getSettings();

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'POS ERP UMKM - Material Store Edition',
        icon: path.join(__dirname, '..', '..', 'resources', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        autoHideMenuBar: true,
        show: false,
    });

    // Load the static export
    const indexPath = path.join(RENDERER_PATH, 'index.html');
    mainWindow.loadFile(indexPath);

    // Show when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();

        if (settings.kiosk_mode) {
            mainWindow?.setFullScreen(true);
        }
    });

    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Handle close to tray
    mainWindow.on('close', (e) => {
        const settings = getSettings();
        if (settings.minimize_to_tray && mainWindow) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // DevTools in development
    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

// ============================================
// IPC HANDLERS
// ============================================

function registerIPCHandlers(): void {
    printerManager = new PrinterManager();

    // --- Printer Handlers ---
    ipcMain.handle('printer:list', async () => {
        if (!mainWindow) return [];
        const printers = await mainWindow.webContents.getPrintersAsync();
        return printers.map((p) => ({
            name: p.name,
            displayName: p.displayName || p.name,
            isDefault: p.isDefault,
            status: p.status,
        }));
    });

    ipcMain.handle('print:receipt', async (_event, data) => {
        if (!mainWindow || !printerManager) {
            return { success: false, error: 'Window not available' };
        }
        try {
            await printerManager.printReceipt(mainWindow, data);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('print:label', async (_event, data) => {
        if (!mainWindow || !printerManager) {
            return { success: false, error: 'Window not available' };
        }
        try {
            await printerManager.printLabel(mainWindow, data);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // --- Settings Handlers ---
    ipcMain.handle('app:settings:get', () => {
        return getSettings();
    });

    ipcMain.handle('app:settings:set', (_event, settings) => {
        setSettings(settings);

        // Apply auto-start setting
        app.setLoginItemSettings({
            openAtLogin: settings.auto_start || false,
            path: app.getPath('exe'),
        });

        return { success: true };
    });

    // --- App Handlers ---
    ipcMain.handle('app:version', () => {
        return app.getVersion();
    });

    ipcMain.handle('app:platform', () => {
        return { platform: process.platform, arch: process.arch };
    });

    ipcMain.handle('app:toggle-fullscreen', () => {
        if (mainWindow) {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
    });

    ipcMain.handle('app:toggle-kiosk', () => {
        if (mainWindow) {
            mainWindow.setKiosk(!mainWindow.isKiosk());
        }
    });

    ipcMain.handle('app:quit', () => {
        app.quit();
    });

    ipcMain.handle('app:reload', () => {
        if (mainWindow) {
            mainWindow.reload();
        }
    });

    ipcMain.handle('app:open-devtools', () => {
        if (mainWindow) {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    });
}

// ============================================
// APP LIFECYCLE
// ============================================

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

app.whenReady().then(async () => {
    // Initialize
    initSettingsStore();
    registerIPCHandlers();

    // Create window
    createMainWindow();

    // System tray
    if (mainWindow) {
        initTray(mainWindow);
    }

    // Auto-updater (only in production)
    if (!isDev) {
        initAutoUpdater(mainWindow);
    }

    // macOS: re-create window on dock click
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        } else if (mainWindow && !mainWindow.isVisible()) {
            mainWindow.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle certificate errors for self-signed certs (dev)
app.on('certificate-error', (event, _webContents, _url, _error, _cert, callback) => {
    if (isDev) {
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});
