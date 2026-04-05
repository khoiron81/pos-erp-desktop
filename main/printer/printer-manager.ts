/*
POS ERP UMKM - Desktop Edition
Printer Manager — Central hub for receipt + label printing

Uses Electron's native webContents.print() for receipts
and raw ESC/POS for label printers.
*/

import { BrowserWindow } from 'electron';
import type { ReceiptData, LabelPrintData } from './types';
import { renderReceiptHTML } from './escpos-renderer';
import { renderLabelHTML } from './label-renderer';

export class PrinterManager {

    // ============================================
    // RECEIPT PRINTING
    // ============================================

    /**
     * Print a receipt using Electron's native print system.
     * Renders receipt as HTML in a hidden window, then prints.
     */
    async printReceipt(parentWindow: BrowserWindow, data: ReceiptData): Promise<void> {
        const html = renderReceiptHTML(data);
        const printerName = data.printerName || '';

        // Create a hidden print window
        const printWindow = new BrowserWindow({
            show: false,
            width: data.paperSize === '58mm' ? 220 : 302, // ~58mm or ~80mm at 96 DPI
            height: 900,
            parent: parentWindow,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        return new Promise<void>((resolve, reject) => {
            printWindow.webContents.print(
                {
                    silent: true, // No dialog
                    printBackground: true,
                    deviceName: printerName || undefined,
                    margins: { marginType: 'none' },
                    pageSize: {
                        width: data.paperSize === '58mm' ? 58000 : 80000, // microns
                        height: 297000, // A4 height — printer auto-cuts
                    },
                },
                (success, failureReason) => {
                    printWindow.close();
                    if (success) {
                        resolve();
                    } else {
                        reject(new Error(failureReason || 'Print failed'));
                    }
                }
            );
        });
    }

    // ============================================
    // LABEL PRINTING
    // ============================================

    /**
     * Print barcode labels using Electron's native print.
     * Renders multi-column label rows as HTML, then prints.
     */
    async printLabel(parentWindow: BrowserWindow, data: LabelPrintData): Promise<void> {
        const html = renderLabelHTML(data);
        const columns = data.columns || 3;
        const gapMm = 2;
        const totalWidthMm = (data.labelWidthMm * columns) + (gapMm * (columns - 1));

        const printWindow = new BrowserWindow({
            show: false,
            width: Math.round(totalWidthMm * 3.78), // mm to px at 96 DPI
            height: Math.round(data.labelHeightMm * 3.78 * data.quantity),
            parent: parentWindow,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        // Wait for fonts & barcode rendering
        await new Promise((r) => setTimeout(r, 500));

        return new Promise<void>((resolve, reject) => {
            printWindow.webContents.print(
                {
                    silent: true,
                    printBackground: true,
                    deviceName: data.printerName || undefined,
                    margins: { marginType: 'none' },
                    scaleFactor: 100,
                    pageSize: {
                        width: Math.round(totalWidthMm * 1000), // microns
                        height: Math.round(data.labelHeightMm * 1000),
                    },
                },
                (success, failureReason) => {
                    printWindow.close();
                    console.log(`[PrinterManager] Label print result: ${success ? 'OK' : failureReason}`);
                    if (success) {
                        resolve();
                    } else {
                        reject(new Error(failureReason || 'Label print failed'));
                    }
                }
            );
        });
    }
}
