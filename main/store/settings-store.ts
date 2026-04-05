/*
POS ERP UMKM - Desktop Edition
Settings Store — Persistent local settings using electron-store
*/

import Store from 'electron-store';

interface AppSettings {
    api_endpoint: string;
    printer_receipt: string;
    printer_label: string;
    paper_size: '80mm' | '58mm';
    label_size: '33x15' | '30x20' | '50x30';
    label_columns: number;
    label_show_price: boolean;
    label_show_barcode: boolean;
    auto_print_receipt: boolean;
    auto_start: boolean;
    kiosk_mode: boolean;
    minimize_to_tray: boolean;
    theme: 'light' | 'dark' | 'system';
}

const defaults: AppSettings = {
    api_endpoint: 'https://pos.aktech.co.id',
    printer_receipt: '',
    printer_label: '',
    paper_size: '80mm',
    label_size: '33x15',
    label_columns: 3,
    label_show_price: true,
    label_show_barcode: true,
    auto_print_receipt: true,
    auto_start: false,
    kiosk_mode: false,
    minimize_to_tray: false,
    theme: 'system',
};

let store: any;

export function initSettingsStore(): void {
    store = new (Store as any)({
        name: 'pos-erp-settings',
        defaults,
        encryptionKey: 'aktech-pos-erp-2026',
    });
}

export function getSettings(): AppSettings {
    if (!store) initSettingsStore();
    return store.store;
}

export function setSettings(updates: Partial<AppSettings>): void {
    if (!store) initSettingsStore();
    for (const [key, value] of Object.entries(updates)) {
        store.set(key as keyof AppSettings, value);
    }
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    if (!store) initSettingsStore();
    return store.get(key);
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    if (!store) initSettingsStore();
    store.set(key, value);
}
