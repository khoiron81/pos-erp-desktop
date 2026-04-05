/*
POS ERP UMKM - Desktop Edition
System Tray Manager
*/

import { app, Tray, Menu, BrowserWindow, nativeImage } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;

export function initTray(mainWindow: BrowserWindow): void {
    const iconPath = path.join(__dirname, '..', '..', 'resources', 'icon.png');

    // Create a 16x16 tray icon
    let icon: Electron.NativeImage;
    try {
        icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } catch {
        // Fallback: create a simple icon if file doesn't exist
        icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('POS ERP UMKM - Material Store');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Buka POS ERP',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            },
        },
        {
            label: 'Mode POS (Fullscreen)',
            click: () => {
                mainWindow.show();
                mainWindow.setFullScreen(true);
            },
        },
        { type: 'separator' },
        {
            label: `Versi ${app.getVersion()}`,
            enabled: false,
        },
        { type: 'separator' },
        {
            label: 'Keluar',
            click: () => {
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);

    // Double-click to show window
    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });
}

export function destroyTray(): void {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}
