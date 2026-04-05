/*
POS ERP UMKM - Desktop Edition
Label Renderer — Generates print-ready HTML for barcode labels
Supports multi-column layout (e.g. 3 labels per row on 33x15mm paper)
*/

import type { LabelPrintData } from './types';

/**
 * Render barcode labels as HTML for Electron native printing.
 * Generates rows × columns layout with barcodes using JsBarcode CDN.
 */
export function renderLabelHTML(data: LabelPrintData): string {
    const columns = data.columns || 3;
    const rows = data.quantity || 1;
    const gapMm = 2;
    const totalWidthMm = (data.labelWidthMm * columns) + (gapMm * (columns - 1));
    const isSmall = data.labelHeightMm <= 20;

    // Generate label cell HTML
    const labelCell = `
        <div class="label-cell" style="width:${data.labelWidthMm}mm; height:${data.labelHeightMm}mm;">
            <div class="product-name">${escHtml(data.productName)}</div>
            ${data.showBarcode ? `<svg class="barcode" data-barcode="${escHtml(data.barcode)}"></svg>` : ''}
            ${data.showPrice ? `<div class="price">${escHtml(data.price)}</div>` : ''}
        </div>
    `;

    // Generate rows
    let rowsHTML = '';
    for (let r = 0; r < rows; r++) {
        rowsHTML += `<div class="label-row">`;
        for (let c = 0; c < columns; c++) {
            rowsHTML += labelCell;
            if (c < columns - 1) {
                rowsHTML += `<div class="gap" style="width:${gapMm}mm;"></div>`;
            }
        }
        rowsHTML += `</div>\n`;
    }

    const nameFontSize = isSmall ? 8 : 10;
    const priceFontSize = isSmall ? 7 : 9;
    const barcodeHeight = isSmall ? 25 : 35;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
@page {
    size: ${totalWidthMm}mm ${data.labelHeightMm}mm;
    margin: 0 !important;
}
@media print {
    html, body {
        width: ${totalWidthMm}mm !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
    }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: Arial, Helvetica, sans-serif;
    background: #fff;
    color: #000;
    width: ${totalWidthMm}mm;
}
.label-row {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    width: ${totalWidthMm}mm;
    height: ${data.labelHeightMm}mm;
    page-break-after: always;
    page-break-inside: avoid;
}
.label-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 0.5mm 0.3mm;
}
.gap {
    flex-shrink: 0;
}
.product-name {
    font-size: ${nameFontSize}pt;
    font-weight: bold;
    text-align: center;
    line-height: 1.15;
    max-height: ${isSmall ? 4.5 : 5.5}mm;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: ${data.labelWidthMm - 1}mm;
}
.barcode {
    display: block;
    max-width: ${data.labelWidthMm - 2}mm;
    height: ${barcodeHeight}px;
}
.price {
    font-size: ${priceFontSize}pt;
    font-weight: bold;
    text-align: center;
    line-height: 1;
}
</style>
</head>
<body>
${rowsHTML}
<script>
document.querySelectorAll('.barcode').forEach(function(svg) {
    try {
        JsBarcode(svg, svg.getAttribute('data-barcode'), {
            format: 'CODE128',
            width: 1,
            height: ${barcodeHeight},
            displayValue: true,
            fontSize: ${isSmall ? 7 : 10},
            margin: 0,
            textMargin: 1,
            font: 'monospace',
            background: '#FFFFFF',
            lineColor: '#000000',
        });
    } catch(e) {
        svg.textContent = svg.getAttribute('data-barcode');
    }
});
</script>
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
