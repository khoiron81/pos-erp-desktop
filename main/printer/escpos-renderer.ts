/*
POS ERP UMKM - Desktop Edition
ESC/POS Receipt Renderer — Generates print-ready HTML for thermal receipts
*/

import type { ReceiptData } from './types';

/**
 * Render a thermal receipt as HTML string.
 * Designed for 80mm (302px) or 58mm (220px) thermal printers.
 * Uses monospace fonts and inline styles for universal compatibility.
 */
export function renderReceiptHTML(data: ReceiptData): string {
    const width = data.paperSize === '58mm' ? 32 : 48; // character width
    const pxWidth = data.paperSize === '58mm' ? 210 : 290;

    const line = '─'.repeat(width);
    const dblLine = '═'.repeat(width);

    const formatCurrency = (n: number) =>
        'Rp ' + n.toLocaleString('id-ID');

    const padRight = (text: string, len: number) =>
        text.length >= len ? text.substring(0, len) : text + ' '.repeat(len - text.length);

    const padLeft = (text: string, len: number) =>
        text.length >= len ? text.substring(0, len) : ' '.repeat(len - text.length) + text;

    // Build receipt lines
    let receipt = '';

    // Header
    receipt += `<div class="center bold">${escHtml(data.storeName)}</div>\n`;
    if (data.storeAddress) receipt += `<div class="center small">${escHtml(data.storeAddress)}</div>\n`;
    if (data.storePhone) receipt += `<div class="center small">Telp: ${escHtml(data.storePhone)}</div>\n`;
    receipt += `<div class="line">${dblLine}</div>\n`;

    // Invoice info
    receipt += `<div>No: ${escHtml(data.invoiceNumber)}</div>\n`;
    receipt += `<div>Tgl: ${data.date}</div>\n`;
    receipt += `<div>Kasir: ${escHtml(data.cashierName)}</div>\n`;
    if (data.customerName) receipt += `<div>Plgn: ${escHtml(data.customerName)}</div>\n`;
    receipt += `<div class="line">${line}</div>\n`;

    // Items
    for (const item of data.items) {
        receipt += `<div>${escHtml(item.name)}</div>\n`;
        const qtyLine = `  ${item.quantity} ${item.unitName} x ${formatCurrency(item.unitPrice)}`;
        const subtotalStr = formatCurrency(item.subtotal);
        receipt += `<div class="row"><span>${escHtml(qtyLine)}</span><span>${subtotalStr}</span></div>\n`;
        if (item.discount > 0) {
            receipt += `<div class="row discount"><span>  Diskon</span><span>-${formatCurrency(item.discount)}</span></div>\n`;
        }
    }

    receipt += `<div class="line">${line}</div>\n`;

    // Totals
    receipt += `<div class="row"><span>Subtotal</span><span>${formatCurrency(data.subtotal)}</span></div>\n`;
    if (data.discount > 0) {
        receipt += `<div class="row"><span>Diskon</span><span>-${formatCurrency(data.discount)}</span></div>\n`;
    }
    if (data.tax > 0) {
        receipt += `<div class="row"><span>Pajak</span><span>${formatCurrency(data.tax)}</span></div>\n`;
    }
    receipt += `<div class="line">${line}</div>\n`;
    receipt += `<div class="row bold total"><span>TOTAL</span><span>${formatCurrency(data.total)}</span></div>\n`;
    receipt += `<div class="line">${line}</div>\n`;
    receipt += `<div class="row"><span>Bayar (${data.paymentMethod})</span><span>${formatCurrency(data.paid)}</span></div>\n`;
    receipt += `<div class="row"><span>Kembalian</span><span>${formatCurrency(data.change)}</span></div>\n`;

    if (data.notes) {
        receipt += `<div class="line">${line}</div>\n`;
        receipt += `<div class="small">Catatan: ${escHtml(data.notes)}</div>\n`;
    }

    // Footer
    receipt += `<div class="line">${dblLine}</div>\n`;
    receipt += `<div class="center small">Terima kasih atas kunjungan Anda!</div>\n`;
    receipt += `<div class="center small">Barang yang sudah dibeli</div>\n`;
    receipt += `<div class="center small">tidak dapat dikembalikan</div>\n`;
    receipt += `<br><br><br>\n`; // Feed for auto-cut

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: 12px;
    line-height: 1.4;
    width: ${pxWidth}px;
    padding: 4px;
    color: #000;
    background: #fff;
}
.center { text-align: center; }
.bold { font-weight: bold; }
.small { font-size: 10px; }
.line { color: #888; }
.row {
    display: flex;
    justify-content: space-between;
}
.total { font-size: 14px; }
.discount { color: #666; font-size: 11px; }
</style>
</head>
<body>
${receipt}
</body>
</html>`;
}

function escHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
