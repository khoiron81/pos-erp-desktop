/*
POS ERP UMKM - Desktop Edition
Auto-Updater — GitHub Releases based
*/

import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';

let mainWin: BrowserWindow | null = null;

export function initAutoUpdater(win: BrowserWindow | null): void {
    mainWin = win;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        log.info('[Updater] Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
        log.info(`[Updater] Update available: v${info.version}`);
        mainWin?.webContents.send('update:available', {
            version: info.version,
            releaseDate: info.releaseDate,
        });
    });

    autoUpdater.on('update-not-available', () => {
        log.info('[Updater] App is up to date');
    });

    autoUpdater.on('download-progress', (progress) => {
        log.info(`[Updater] Download: ${Math.round(progress.percent)}%`);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info(`[Updater] Update downloaded: v${info.version}`);
        // Notify renderer — it shows a non-blocking in-app banner (no modal OS dialog)
        mainWin?.webContents.send('update:downloaded', { version: info.version });
    });

    autoUpdater.on('error', (err) => {
        log.error('[Updater] Error:', err.message);
        mainWin?.webContents.send('update:error', err.message);
    });

    // Guard against double-registration (e.g. hot reload in dev)
    ipcMain.removeHandler('update:install');
    ipcMain.removeHandler('update:check');

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

    // Check on startup after 5 s, then every 4 h
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);

    setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
}
