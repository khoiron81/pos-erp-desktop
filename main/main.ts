/*
POS ERP UMKM - Desktop Edition
Material Store Edition

Developed by PT. Aktech Digital Solutions
Phone: 08112638350
Website: https://aktech.co.id
*/

import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import log from 'electron-log';
import { initSettingsStore, getSettings, setSettings, getSetting } from './store/settings-store';
import { PrinterManager } from './printer/printer-manager';
import { sendRawToPrinter } from './printer/raw-printer';
import { pngToZPL } from './printer/png-to-zpl';
import { initAutoUpdater } from './updater/auto-updater';
import { initTray, destroyTray } from './tray/tray-manager';

let mainWindow: BrowserWindow | null = null;
let printerManager: PrinterManager | null = null;

const isDev = !app.isPackaged;
const RENDERER_PATH = isDev
    ? path.join(__dirname, '..', '..', 'renderer')
    : path.join(process.resourcesPath, 'renderer');

// Register custom protocol scheme (must be done before app is ready)
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);

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

    // Load the static export via custom protocol
    mainWindow.loadURL('app://./index.html');

    // Inject Electron Printer Bridge to bypass QZ Tray
    // Must inject BEFORE any webpack chunks load, so use 'did-navigate'
    const bridgePath = path.join(RENDERER_PATH, 'electron-printer-bridge.js');
    let bridgeScript = '';
    if (fs.existsSync(bridgePath)) {
        bridgeScript = fs.readFileSync(bridgePath, 'utf8');
    }

    mainWindow.webContents.on('did-navigate', () => {
        if (bridgeScript) {
            mainWindow?.webContents.executeJavaScript(bridgeScript)
                .catch((err: any) => log.error('Bridge injection error:', err));
        }
    });

    // Also inject on dom-ready as fallback
    mainWindow.webContents.on('dom-ready', () => {
        if (bridgeScript) {
            mainWindow?.webContents.executeJavaScript(`
                if (!window.qz || !window.qz.__electronBridge) {
                    ${bridgeScript}
                }
            `).catch((err: any) => log.error('Bridge fallback injection error:', err));
        }
    });

    // Forward renderer bridge/ZPL messages to log file for production debugging
    mainWindow.webContents.on('console-message', (_event, level, message) => {
        if (message.includes('[Bridge]') || message.includes('[ZPL]')) {
            log.info(`[Renderer] ${message}`);
        }
    });

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
    printerManager = new PrinterManager(RENDERER_PATH);

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
        if (!mainWindow) {
            return { success: false, error: 'Window not available' };
        }
        try {
            if (data.isRaw && data.rawData) {
                // Raw ESC/POS data — send directly to printer via Win32 Spooler
                await sendRawToPrinter(data.printerName, data.rawData, 'RAW');
                return { success: true };
            } else if (printerManager) {
                // Inject receipt_footer from settings if caller didn't supply one
                if (!data.receiptFooter) {
                    data.receiptFooter = getSettings().receipt_footer;
                }
                await printerManager.printReceipt(mainWindow, data);
                return { success: true };
            }
            return { success: false, error: 'No print handler available' };
        } catch (err: any) {
            log.error('print:receipt error:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('print:label', async (_event, data) => {
        if (!mainWindow) {
            return { success: false, error: 'Window not available' };
        }
        try {
            if (data.isRaw && data.imageData) {
                // Check if this is a base64 PNG image or raw ZPL/ESC-POS text
                const isImageData = !data.imageData.startsWith('^XA') && !data.imageData.startsWith('\x1b');

                if (isImageData) {
                    const labelWidthMm = data.labelWidthMm || 103;
                    const labelHeightMm = data.labelHeightMm || 15;
                    const isZebra = data.printerName.toLowerCase().includes('zebra') ||
                                    data.printerName.toLowerCase().includes('zd') ||
                                    data.printerName.toLowerCase().includes('zdesigner');

                    if (isZebra) {
                        // Zebra printer: Convert PNG → ZPL ^GFA and send raw
                        const sourceIsAtPrinterDpi = data.sourceIsAtPrinterDpi || false;
                        console.log(`[print:label] PNG→ZPL mode → ${labelWidthMm}x${labelHeightMm}mm to ${data.printerName} (sourceAtDpi=${sourceIsAtPrinterDpi})`);
                        const zplData = pngToZPL(data.imageData, labelWidthMm, labelHeightMm, sourceIsAtPrinterDpi);
                        await sendRawToPrinter(data.printerName, zplData, 'RAW');
                        return { success: true };
                    } else {
                        // Non-Zebra: render image and print via driver
                        // Use higher DPI conversion for print-quality rendering
                        const DPI = 203; // Label printers typically 203 DPI
                        const pxWidth = Math.round(labelWidthMm / 25.4 * DPI);
                        const pxHeight = Math.round(labelHeightMm / 25.4 * DPI);
                        console.log(`[print:label] Image mode → ${labelWidthMm}x${labelHeightMm}mm (${pxWidth}x${pxHeight}px @${DPI}dpi) to ${data.printerName}`);

                        const printWindow = new BrowserWindow({
                            show: false,
                            width: pxWidth,
                            height: pxHeight,
                            parent: mainWindow,
                            webPreferences: { contextIsolation: true, nodeIntegration: false },
                        });

                        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
                            <style>
                                @page {
                                    size: ${labelWidthMm}mm ${labelHeightMm}mm;
                                    margin: 0 !important;
                                }
                                @media print {
                                    html, body {
                                        width: ${labelWidthMm}mm !important;
                                        height: ${labelHeightMm}mm !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                        overflow: hidden !important;
                                    }
                                }
                                * { margin: 0; padding: 0; box-sizing: border-box; }
                                html, body {
                                    background: #fff;
                                    width: ${labelWidthMm}mm;
                                    height: ${labelHeightMm}mm;
                                    overflow: hidden;
                                }
                                img {
                                    display: block;
                                    width: ${labelWidthMm}mm;
                                    height: ${labelHeightMm}mm;
                                    object-fit: fill;
                                }
                            </style>
                            </head><body><img src="data:image/png;base64,${data.imageData}"></body></html>`;

                        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
                        await new Promise(r => setTimeout(r, 800));

                        return new Promise((resolve) => {
                            printWindow.webContents.print(
                                {
                                    silent: true,
                                    printBackground: true,
                                    deviceName: data.printerName || undefined,
                                    margins: { marginType: 'none' },
                                    scaleFactor: 100,
                                    pageSize: {
                                        width: labelWidthMm * 1000,
                                        height: labelHeightMm * 1000,
                                    },
                                },
                                (success, failureReason) => {
                                    printWindow.close();
                                    console.log(`[print:label] Print result: ${success ? 'OK' : failureReason}`);
                                    resolve(success
                                        ? { success: true }
                                        : { success: false, error: failureReason || 'Label print failed' });
                                }
                            );
                        });
                    }
                } else {
                    // Raw ZPL/ESC-POS text — send directly via Win32 Spooler
                    console.log('[print:label] Raw mode → Win32 spooler to', data.printerName);
                    await sendRawToPrinter(data.printerName, data.imageData, 'RAW');
                    return { success: true };
                }
            } else if (printerManager) {
                // Structured LabelPrintData — use the PrinterManager
                await printerManager.printLabel(mainWindow, data);
                return { success: true };
            }
            return { success: false, error: 'No print handler available' };
        } catch (err: any) {
            log.error('print:label error:', err);
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
    // Initialize settings before anything else (needed for api_endpoint)
    initSettingsStore();

    // CORS interceptor — allows app:// renderer to call the API without webSecurity: false
    const apiEndpoint = getSetting('api_endpoint') || 'https://pos.aktech.co.id';
    try {
        const apiUrl = new URL(apiEndpoint);
        const corsUrls = [`${apiUrl.protocol}//${apiUrl.host}/*`];
        session.defaultSession.webRequest.onHeadersReceived({ urls: corsUrls }, (details, callback) => {
            const headers: Record<string, string[]> = { ...details.responseHeaders as any };
            headers['access-control-allow-origin'] = ['*'];
            headers['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, PATCH, OPTIONS'];
            headers['access-control-allow-headers'] = ['Content-Type, Authorization, X-Requested-With'];
            headers['access-control-allow-credentials'] = ['true'];
            callback({ responseHeaders: headers });
        });
    } catch {
        log.warn('[CORS] Invalid api_endpoint, skipping CORS interceptor');
    }

    // Register custom protocol to serve renderer files
    // This allows absolute paths like /_next/static/... to work correctly
    protocol.handle('app', (request) => {
        const requestUrl = new URL(request.url);
        let filePath = decodeURIComponent(requestUrl.pathname);
        
        // Remove leading slash on Windows
        if (filePath.startsWith('/')) {
            filePath = filePath.substring(1);
        }
        
        // Default to index.html
        if (!filePath || filePath === '') {
            filePath = 'index.html';
        }
        
        const fullPath = path.join(RENDERER_PATH, filePath);
        
        // Check if file exists
        if (fs.existsSync(fullPath)) {
            return net.fetch(url.pathToFileURL(fullPath).toString());
        }
        
        // If no extension, try .html
        if (!path.extname(filePath)) {
            const htmlPath = fullPath + '.html';
            if (fs.existsSync(htmlPath)) {
                return net.fetch(url.pathToFileURL(htmlPath).toString());
            }
        }
        
        // Fallback to index.html for SPA routing
        const indexPath = path.join(RENDERER_PATH, 'index.html');
        return net.fetch(url.pathToFileURL(indexPath).toString());
    });

    // Settings already initialized above; register IPC handlers
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

app.on('will-quit', () => {
    destroyTray();
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
