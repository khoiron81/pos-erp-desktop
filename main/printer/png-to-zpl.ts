/*
POS ERP UMKM - Desktop Edition
PNG to ZPL Converter — Converts base64 PNG image to ZPL ^GFA commands
for direct raw printing to Zebra printers.

When sourceIsAtPrinterDpi is true, the source image is already at 203 DPI
and should NOT be resized. Otherwise, scales to match label dimensions.
*/

import { nativeImage } from 'electron';

const PRINTER_DPI = 203; // Standard Zebra DPI (8 dots/mm)

/**
 * Convert a base64 PNG image to ZPL ^GFA graphic field command.
 * @param base64Png - Base64 encoded PNG image
 * @param labelWidthMm - Physical label width in mm
 * @param labelHeightMm - Physical label height in mm
 * @param sourceIsAtPrinterDpi - If true, source is already at 203 DPI, skip resize
 */
export function pngToZPL(
    base64Png: string,
    labelWidthMm: number,
    labelHeightMm: number,
    sourceIsAtPrinterDpi: boolean = false
): string {
    // Decode the PNG using Electron's nativeImage
    const img = nativeImage.createFromDataURL('data:image/png;base64,' + base64Png);
    const origSize = img.getSize();

    // Calculate target pixel dimensions at printer DPI
    const targetWidth = Math.round(labelWidthMm / 25.4 * PRINTER_DPI);
    const targetHeight = Math.round(labelHeightMm / 25.4 * PRINTER_DPI);

    let finalImg = img;
    let width: number;
    let height: number;

    if (sourceIsAtPrinterDpi) {
        // Source is already at printer DPI — use as-is
        width = origSize.width;
        height = origSize.height;
        console.log(`[pngToZPL] Source already at printer DPI: ${width}x${height}px → using as-is for ${labelWidthMm}x${labelHeightMm}mm`);
    } else {
        // Source is at screen DPI — resize to printer DPI
        finalImg = img.resize({ width: targetWidth, height: targetHeight, quality: 'best' });
        const resizedSize = finalImg.getSize();
        width = resizedSize.width;
        height = resizedSize.height;
        console.log(`[pngToZPL] Source: ${origSize.width}x${origSize.height}px → Resized: ${width}x${height}px (${labelWidthMm}x${labelHeightMm}mm @${PRINTER_DPI}dpi)`);
    }

    const bitmap = finalImg.toBitmap(); // RGBA buffer

    // Convert to 1-bit monochrome (black = 1, white = 0)
    // ZPL ^GFA expects bytes where each bit is a pixel (MSB first)
    const bytesPerRow = Math.ceil(width / 8);
    const totalBytes = bytesPerRow * height;

    let hexData = '';

    for (let y = 0; y < height; y++) {
        for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const x = byteIdx * 8 + bit;
                if (x < width) {
                    const pixelOffset = (y * width + x) * 4; // RGBA
                    const r = bitmap[pixelOffset];
                    const g = bitmap[pixelOffset + 1];
                    const b = bitmap[pixelOffset + 2];
                    const a = bitmap[pixelOffset + 3];

                    // Convert to grayscale and threshold
                    const gray = (r * 0.299 + g * 0.587 + b * 0.114);
                    const isBlack = a > 128 && gray < 128;

                    if (isBlack) {
                        byte |= (1 << (7 - bit));
                    }
                }
            }
            hexData += byte.toString(16).padStart(2, '0').toUpperCase();
        }
    }

    // Build ZPL command with proper label configuration
    const printWidth = sourceIsAtPrinterDpi ? width : targetWidth;
    const labelLength = sourceIsAtPrinterDpi ? height : targetHeight;

    const zpl =
        `^XA\n` +
        `^PW${printWidth}\n` +         // Print width in dots
        `^LL${labelLength}\n` +         // Label length in dots
        `^LH0,0\n` +                    // Label home at origin
        `^FO0,0\n` +
        `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexData}\n` +
        `^XZ\n`;

    return zpl;
}
