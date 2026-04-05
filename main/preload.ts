/*
POS ERP UMKM - Desktop Edition
Preload Script — Secure Bridge between Main and Renderer

contextBridge exposes a safe API to the renderer process.
No Node.js APIs leak to the frontend.
*/

import { contextBridge, ipcRenderer } from 'electron';

// ============================================
// EXPOSED API
// ============================================

contextBridge.exposeInMainWorld('electronAPI', {
    // --- Identity ---
    isElectron: true,

    // --- Printer ---
    getPrinters: (): Promise<any[]> =>
        ipcRenderer.invoke('printer:list'),

    printReceipt: (data: any): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('print:receipt', data),

    printLabel: (data: any): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('print:label', data),

    // --- Settings ---
    getSettings: (): Promise<any> =>
        ipcRenderer.invoke('app:settings:get'),

    setSettings: (settings: any): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('app:settings:set', settings),

    // --- App ---
    getVersion: (): Promise<string> =>
        ipcRenderer.invoke('app:version'),

    getPlatform: (): Promise<{ platform: string; arch: string }> =>
        ipcRenderer.invoke('app:platform'),

    toggleFullscreen: (): Promise<void> =>
        ipcRenderer.invoke('app:toggle-fullscreen'),

    toggleKiosk: (): Promise<void> =>
        ipcRenderer.invoke('app:toggle-kiosk'),

    quit: (): Promise<void> =>
        ipcRenderer.invoke('app:quit'),

    reload: (): Promise<void> =>
        ipcRenderer.invoke('app:reload'),

    openDevTools: (): Promise<void> =>
        ipcRenderer.invoke('app:open-devtools'),

    // --- Update Events ---
    onUpdateAvailable: (callback: (info: any) => void) => {
        ipcRenderer.on('update:available', (_e, info) => callback(info));
    },

    onUpdateDownloaded: (callback: (info: any) => void) => {
        ipcRenderer.on('update:downloaded', (_e, info) => callback(info));
    },

    onUpdateError: (callback: (err: string) => void) => {
        ipcRenderer.on('update:error', (_e, err) => callback(err));
    },

    installUpdate: (): Promise<void> =>
        ipcRenderer.invoke('update:install'),
});

// ============================================
// TYPE DECLARATIONS (for TypeScript in renderer)
// ============================================

export interface ElectronAPI {
    isElectron: true;
    getPrinters: () => Promise<Array<{
        name: string;
        displayName: string;
        isDefault: boolean;
        status: number;
    }>>;
    printReceipt: (data: any) => Promise<{ success: boolean; error?: string }>;
    printLabel: (data: any) => Promise<{ success: boolean; error?: string }>;
    getSettings: () => Promise<any>;
    setSettings: (settings: any) => Promise<{ success: boolean }>;
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<{ platform: string; arch: string }>;
    toggleFullscreen: () => Promise<void>;
    toggleKiosk: () => Promise<void>;
    quit: () => Promise<void>;
    reload: () => Promise<void>;
    openDevTools: () => Promise<void>;
    onUpdateAvailable: (callback: (info: any) => void) => void;
    onUpdateDownloaded: (callback: (info: any) => void) => void;
    onUpdateError: (callback: (err: string) => void) => void;
    installUpdate: () => Promise<void>;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}
