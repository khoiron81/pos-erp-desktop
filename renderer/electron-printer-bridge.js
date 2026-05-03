/**
 * Electron Printer Bridge
 * Overrides QZ Tray functions to use Electron's native printer API.
 * For Zebra label printers, generates native ZPL directly for optimal layout.
 */
(function () {
    'use strict';

    if (!window.electronAPI || !window.electronAPI.isElectron) return;
    if (window.__electronBridgeLoaded) return;
    window.__electronBridgeLoaded = true;

    console.log('[Bridge] Initializing Electron Printer Bridge...');

    // ── Helpers ───────────────────────────────────────────────
    // Reads from encrypted electron-store (canonical settings), falls back to localStorage
    async function getLabelConfig() {
        try {
            const settings = await window.electronAPI.getSettings();
            if (settings) {
                const sizeParts = (settings.label_size || '33x15').split('x').map(Number);
                return {
                    label_size_width:  sizeParts[0] || 33,
                    label_size_height: sizeParts[1] || 15,
                    label_columns:     settings.label_columns  || 3,
                    label_show_price:  settings.label_show_price  !== false,
                    label_show_barcode: settings.label_show_barcode !== false,
                };
            }
        } catch (e) {
            console.warn('[Bridge] getSettings failed, falling back to localStorage:', e);
        }
        try {
            const raw = localStorage.getItem('pos_printer_mapping');
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return {
            label_size_width: 33,
            label_size_height: 15,
            label_columns: 3,
            label_show_price: true,
            label_show_barcode: true,
        };
    }

    function isZebraPrinter(name) {
        const lc = (name || '').toLowerCase();
        return lc.includes('zebra') || lc.includes('zd') || lc.includes('zdesigner');
    }

    // ── Store last print request for ZPL generation ──────────
    window.__lastLabelPrintRequest = null;

    // ── Native ZPL generator ─────────────────────────────────
    function generateNativeZPL(labelData, printerOpts) {
        const DPI       = 203;
        const cols      = printerOpts.columns || labelData.columns || 3;
        const qty       = labelData.quantity || 1;
        const gapMm     = printerOpts.gapMm || 2;
        const widthMm   = printerOpts.labelWidthMm || 33;
        const heightMm  = printerOpts.labelHeightMm || 15;

        // mm → dots
        const cellW  = Math.round(widthMm / 25.4 * DPI);
        const cellH  = Math.round(heightMm / 25.4 * DPI);
        const gapD   = Math.round(gapMm / 25.4 * DPI);
        const totalW = cellW * cols + gapD * (cols - 1);

        // Layout: Product Name + Barcode + Code Number (bottom-aligned)
        const nameFontH  = Math.min(22, Math.round(cellH * 0.18));
        const nameFontW  = Math.round(nameFontH * 0.85);
        const bcHeight   = Math.round(cellH * 0.52);
        const bcCodeFontH = 18;
        const bcCodeFontW = 14;
        const bottomPad  = 1;
        const nameGap    = 2;

        const bcCodeH = bcCodeFontH + 2;
        const bcY     = cellH - bcHeight - bcCodeH - bottomPad;
        const nameY   = bcY - nameFontH - nameGap;

        const maxChars = widthMm <= 35 ? 20 : 28;
        let prodName = labelData.productName || '';
        if (prodName.length > maxChars) {
            prodName = prodName.substring(0, maxChars - 1) + '.';
        }

        let zpl = '';
        for (let row = 0; row < qty; row++) {
            zpl += '^XA\n';
            zpl += '^PW' + totalW + '\n';
            zpl += '^LL' + cellH + '\n';

            for (let col = 0; col < cols; col++) {
                const xOff = col * (cellW + gapD);

                zpl += '^FO' + xOff + ',' + nameY;
                zpl += '^A0N,' + nameFontH + ',' + nameFontW;
                zpl += '^FB' + cellW + ',1,0,C';
                zpl += '^FD' + prodName + '^FS\n';

                const barcodeStr = labelData.barcode || '';
                const bcXOff = xOff + 35;
                zpl += '^FO' + bcXOff + ',' + bcY;
                zpl += '^BY1\n';
                zpl += '^BCN,' + bcHeight + ',N,N,N\n';
                zpl += '^FD' + barcodeStr + '^FS\n';

                const codeY = bcY + bcHeight + 2;
                zpl += '^FO' + xOff + ',' + codeY;
                zpl += '^A0N,' + bcCodeFontH + ',' + bcCodeFontW;
                zpl += '^FB' + cellW + ',1,0,C';
                zpl += '^FD' + barcodeStr + '^FS\n';
            }

            zpl += '^XZ\n';
        }

        console.log('[ZPL] ' + qty + 'x' + cols + ', cell=' + cellW + 'x' + cellH +
                    ', nameH=' + nameFontH + ', bcH=' + bcHeight);
        return zpl;
    }

    // ── Try to extract product info from the print dialog DOM ──
    function extractProductFromDOM() {
        try {
            const dialog = document.querySelector('.fixed.inset-0.z-50');
            if (!dialog) return null;

            const infoSection = dialog.querySelector('.bg-gray-50, [class*="bg-gray-50"]');
            if (!infoSection) return null;

            const nameEl = infoSection.querySelector('.font-semibold, p.font-semibold');
            const name = nameEl ? nameEl.textContent.trim() : '';

            const priceEl = infoSection.querySelector('.text-blue-600, [class*="text-blue-600"]');
            const price = priceEl ? priceEl.textContent.trim() : '';

            const spans = infoSection.querySelectorAll('span');
            let barcode = '';
            for (const span of spans) {
                const text = span.textContent || '';
                if (text.startsWith('Barcode:')) {
                    barcode = text.replace('Barcode:', '').trim();
                } else if (text.startsWith('SKU:')) {
                    if (!barcode) barcode = text.replace('SKU:', '').trim();
                }
            }

            if (name && barcode) {
                return { productName: name, barcode: barcode, price: price };
            }
        } catch (e) {
            console.warn('[Bridge] DOM extraction failed:', e);
        }
        return null;
    }

    // ── Fake QZ Tray ─────────────────────────────────────────
    const fakeQZ = {
        __electronBridge: true,
        websocket: {
            isActive: () => true,
            connect:  () => Promise.resolve(true),
            disconnect: () => Promise.resolve(),
        },
        security: {
            setCertificatePromise: () => {},
            setSignaturePromise:   () => {},
            setSignatureAlgorithm: () => {},
        },
        printers: {
            find: async () => {
                try {
                    const printers = await window.electronAPI.getPrinters();
                    return printers.map(p => p.name);
                } catch (err) {
                    console.error('[Bridge] getPrinters error:', err);
                    return [];
                }
            },
        },
        configs: {
            create: (printerName, options) => ({
                printerName,
                options: options || {},
            }),
        },
        print: async (config, data) => {
            const printerName = config.printerName;
            // Always fetch fresh settings from electron-store
            const lc = await getLabelConfig();
            console.log('[Bridge] qz.print ->', printerName, 'items:', data.length);

            for (const item of data) {
                if (item.type === 'raw' && item.format === 'plain') {
                    // Raw text (ESC/POS or ZPL) → spooler via printReceipt
                    const result = await window.electronAPI.printReceipt({
                        rawData:     item.data,
                        printerName: printerName,
                        paperSize:   config.options?.paperSize || '80mm',
                        isRaw:       true,
                    });
                    if (!result.success) throw new Error(result.error || 'Print failed');

                } else if (item.type === 'raw' && (item.format === 'image' || item.format === 'base64')) {
                    // Image from canvas
                    if (isZebraPrinter(printerName)) {
                        const stored = window.__lastLabelPrintRequest;
                        const fromDOM = extractProductFromDOM();
                        const productInfo = stored || fromDOM;

                        if (productInfo && productInfo.barcode) {
                            console.log('[Bridge] Zebra detected -> native ZPL (data from ' + (stored ? 'stored' : 'DOM') + ')');
                            const zpl = generateNativeZPL(
                                {
                                    productName: productInfo.productName,
                                    barcode:     productInfo.barcode,
                                    price:       productInfo.price,
                                    quantity:    productInfo.quantity || 1,
                                    columns:     lc.label_columns || 3,
                                    showPrice:   lc.label_show_price !== false,
                                    showBarcode: lc.label_show_barcode !== false,
                                },
                                {
                                    printerName:   printerName,
                                    labelWidthMm:  lc.label_size_width || 33,
                                    labelHeightMm: lc.label_size_height || 15,
                                    columns:       lc.label_columns || 3,
                                }
                            );

                            // Use printLabel (not printReceipt) for label data
                            const result = await window.electronAPI.printLabel({
                                imageData:   zpl,
                                printerName: printerName,
                                isRaw:       true,
                            });
                            if (!result.success) throw new Error(result.error || 'ZPL print failed');
                            continue;
                        }
                        console.warn('[Bridge] Zebra but no product data found, falling back to image path');
                    }

                    // Non-Zebra or fallback: send image to label handler
                    const totalWidthMm = (lc.label_size_width || 33) * (lc.label_columns || 3) + 2 * ((lc.label_columns || 3) - 1);
                    const result = await window.electronAPI.printLabel({
                        imageData:            item.data,
                        printerName:          printerName,
                        language:             item.options?.language || 'ESCPOS',
                        isRaw:                true,
                        labelWidthMm:         totalWidthMm,
                        labelHeightMm:        lc.label_size_height || 15,
                        singleLabelWidthMm:   lc.label_size_width || 33,
                        columns:              lc.label_columns || 3,
                        sourceIsAtPrinterDpi: true,
                    });
                    if (!result.success) throw new Error(result.error || 'Label print failed');
                }
            }
        },
    };

    // ── Expose globally ──────────────────────────────────────
    window.qz = fakeQZ;

    // ── Webpack module patching ───────────────────────────────
    // Detect print-utility modules by exported function names, not by hardcoded chunk ID.
    // Chunk IDs change on every frontend rebuild; this approach is rebuild-safe.
    function patchModule(exports) {
        if (!exports || exports.__bridgePatched) return;
        const origMultiCol = exports.printMultiColumnLabel;
        const origZPL      = exports.printZPLLabel;
        const origImage    = exports.printImageLabel;

        if (!origMultiCol && !origZPL && !origImage) return;

        if (origMultiCol) {
            exports.printMultiColumnLabel = async function (labelData, printerOpts) {
                if (isZebraPrinter(printerOpts.printerName)) {
                    console.log('[Bridge] Intercepted printMultiColumnLabel -> native ZPL');
                    window.__lastLabelPrintRequest = {
                        productName: labelData.productName,
                        barcode:     labelData.barcode,
                        price:       labelData.price,
                        quantity:    labelData.quantity,
                        columns:     labelData.columns,
                        showPrice:   labelData.showPrice,
                        showBarcode: labelData.showBarcode,
                    };
                    const zpl = generateNativeZPL(labelData, printerOpts);
                    const cfg = fakeQZ.configs.create(printerOpts.printerName);
                    await fakeQZ.print(cfg, [{ type: 'raw', format: 'plain', data: zpl }]);
                    return;
                }
                return origMultiCol.call(this, labelData, printerOpts);
            };
        }

        if (origZPL) {
            exports.printZPLLabel = async function (labelData, printerOpts) {
                if (isZebraPrinter(printerOpts.printerName)) {
                    console.log('[Bridge] Intercepted printZPLLabel -> native ZPL');
                    const zpl = generateNativeZPL(labelData, printerOpts);
                    const cfg = fakeQZ.configs.create(printerOpts.printerName);
                    await fakeQZ.print(cfg, [{ type: 'raw', format: 'plain', data: zpl }]);
                    return;
                }
                return origZPL.call(this, labelData, printerOpts);
            };
        }

        if (origImage) {
            exports.printImageLabel = async function (labelData, printerOpts) {
                if (isZebraPrinter(printerOpts.printerName)) {
                    console.log('[Bridge] Intercepted printImageLabel -> native ZPL');
                    const zpl = generateNativeZPL(labelData, printerOpts);
                    const cfg = fakeQZ.configs.create(printerOpts.printerName);
                    await fakeQZ.print(cfg, [{ type: 'raw', format: 'plain', data: zpl }]);
                    return;
                }
                return origImage.call(this, labelData, printerOpts);
            };
        }

        exports.__bridgePatched = true;
        console.log('[Bridge] Patched qz-utils module for Zebra native ZPL');
    }

    // Intercept webpack chunk pushes — scan all modules in each chunk by content
    if (!self.webpackChunk_N_E) self.webpackChunk_N_E = [];
    const origPush = self.webpackChunk_N_E.push.bind(self.webpackChunk_N_E);
    self.webpackChunk_N_E.push = function (...args) {
        const result = origPush(...args);
        for (const arg of args) {
            if (!arg || !arg[1]) continue;
            for (const moduleId of Object.keys(arg[1])) {
                const origFactory = arg[1][moduleId];
                if (typeof origFactory !== 'function') continue;
                arg[1][moduleId] = function (module, exports, require) {
                    origFactory(module, exports, require);
                    // Only patch modules that export print utility functions
                    if (exports && (
                        typeof exports.printMultiColumnLabel === 'function' ||
                        typeof exports.printZPLLabel === 'function' ||
                        typeof exports.printImageLabel === 'function'
                    )) {
                        patchModule(exports);
                    }
                };
            }
        }
        return result;
    };

    console.log('[Bridge] Ready. QZ Tray bypassed -> Electron native printing.');
})();
