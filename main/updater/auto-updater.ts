/*
POS ERP UMKM - Desktop Edition
Auto-Updater — GitHub Releases based
*/

import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';
import { ipcMain } from 'electron';

let mainWin: BrowserWindow | null = null;

export function initAutoUpdater(win: BrowserWindow | null): void {
    mainWin = win;

    // Configure
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
        console.log('🔍 Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
        console.log(`📦 Update available: v${info.version}`);
        if (mainWin) {
            mainWin.webContents.send('update:available', {
                version: info.version,
                releaseDate: info.releaseDate,
            });
        }
    });

    autoUpdater.on('update-not-available', () => {
        console.log('✅ App is up to date');
    });

    autoUpdater.on('download-progress', (progress) => {
        console.log(`⬇️ Download: ${Math.round(progress.percent)}%`);
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log(`✅ Update downloaded: v${info.version}`);
        if (mainWin) {
            mainWin.webContents.send('update:downloaded', {
                version: info.version,
            });
        }

        // Prompt user
        if (mainWin) {
            dialog.showMessageBox(mainWin, {
                type: 'info',
                title: 'Update Tersedia',
                message: `Versi ${info.version} telah diunduh.`,
                detail: 'Aplikasi akan restart untuk menginstall update.',
                buttons: ['Restart Sekarang', 'Nanti'],
                defaultId: 0,
            }).then((result) => {
                if (result.response === 0) {
                    autoUpdater.quitAndInstall(false, true);
                }
            });
        }
    });

    autoUpdater.on('error', (err) => {
        console.error('❌ Auto-updater error:', err.message);
        if (mainWin) {
            mainWin.webContents.send('update:error', err.message);
        }
    });

    // IPC handler for manual install
    ipcMain.handle('update:install', () => {
        autoUpdater.quitAndInstall(false, true);
    });

    ipcMain.handle('update:check', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return { available: !!result?.updateInfo };
        } catch (err: any) {
            return { available: false, error: err.message };
        }
    });

    // Check on startup (after 5 seconds)
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);

    // Check every 4 hours
    setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
}
