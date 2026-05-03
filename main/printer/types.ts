/*
POS ERP UMKM - Desktop Edition
Printer Type Definitions
*/

export interface PrinterInfo {
    name: string;
    displayName: string;
    isDefault: boolean;
    status: number;
}

export interface ReceiptData {
    receiptFooter?: string[];
    storeName: string;
    storeAddress?: string;
    storePhone?: string;
    invoiceNumber: string;
    cashierName: string;
    customerName?: string;
    items: Array<{
        name: string;
        quantity: number;
        unitName: string;
        unitPrice: number;
        discount: number;
        subtotal: number;
    }>;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paid: number;
    change: number;
    paymentMethod: string;
    notes?: string;
    date: string;
    paperSize?: '80mm' | '58mm';
    printerName?: string;
}

export interface LabelPrintData {
    productName: string;
    barcode: string;
    price: string;
    sku?: string;
    quantity: number;         // rows
    columns: number;          // labels per row
    labelWidthMm: number;
    labelHeightMm: number;
    showPrice: boolean;
    showBarcode: boolean;
    printerName: string;
}

export interface PrintResult {
    success: boolean;
    error?: string;
    labelsPrinted?: number;
}
