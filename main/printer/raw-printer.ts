/*
POS ERP UMKM - Desktop Edition
Raw Printer Utility — Sends raw bytes (ZPL/ESC-POS) directly to Windows Print Spooler
Uses PowerShell + Win32 WritePrinter API
*/

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Send raw data (ZPL, ESC/POS) directly to a Windows printer via the Print Spooler API.
 * This bypasses any driver rendering — the bytes go straight to the printer.
 */
export async function sendRawToPrinter(printerName: string, rawData: string | Buffer, dataType: string = 'RAW'): Promise<void> {
    const tmpDir = os.tmpdir();
    const psFile = path.join(tmpDir, `pos-print-${Date.now()}.ps1`);
    const dataFile = path.join(tmpDir, `pos-data-${Date.now()}.raw`);

    // Write the raw data to a file using Buffer to preserve binary data
    if (typeof rawData === 'string') {
        fs.writeFileSync(dataFile, Buffer.from(rawData, 'utf8'));
    } else {
        fs.writeFileSync(dataFile, rawData);
    }

    // Escape the printer name and file paths for PowerShell
    const escapedPrinter = printerName.replace(/'/g, "''");
    const escapedDataFile = dataFile.replace(/\\/g, '\\\\').replace(/'/g, "''");

    // Write PowerShell script
    const psScript = `
Add-Type @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrint
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendFile(string printerName, string filePath, string dataType)
    {
        IntPtr hPrinter = IntPtr.Zero;

        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("OpenPrinter failed: error " + Marshal.GetLastWin32Error());

        DOCINFOA di = new DOCINFOA();
        di.pDocName = "POS ERP Print";
        di.pDataType = dataType;

        try
        {
            if (StartDocPrinter(hPrinter, 1, di) <= 0)
                throw new Exception("StartDocPrinter failed: error " + Marshal.GetLastWin32Error());

            try
            {
                if (!StartPagePrinter(hPrinter))
                    throw new Exception("StartPagePrinter failed: error " + Marshal.GetLastWin32Error());

                try
                {
                    byte[] bytes = File.ReadAllBytes(filePath);
                    IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pBytes, bytes.Length);

                    int dwWritten;
                    bool ok = WritePrinter(hPrinter, pBytes, bytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pBytes);

                    if (!ok)
                        throw new Exception("WritePrinter failed: error " + Marshal.GetLastWin32Error());

                    Console.WriteLine("OK: " + dwWritten + "/" + bytes.Length + " bytes sent to " + printerName);
                }
                finally { EndPagePrinter(hPrinter); }
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally { ClosePrinter(hPrinter); }
    }
}
'@

[RawPrint]::SendFile('${escapedPrinter}', '${escapedDataFile}', '${dataType}')
`;

    fs.writeFileSync(psFile, psScript, 'utf8');

    try {
        const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, {
            timeout: 15000,
            windowsHide: true,
            encoding: 'utf8',
        });
        console.log('[RawPrinter]', output.trim());
    } catch (err: any) {
        const stderr = err.stderr?.toString() || err.message;
        throw new Error(`Raw print failed: ${stderr}`);
    } finally {
        try { fs.unlinkSync(psFile); } catch (_) {}
        try { fs.unlinkSync(dataFile); } catch (_) {}
    }
}
