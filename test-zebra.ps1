$printerName = "ZDesigner ZD230-203dpi ZPL"
$zplData = "^XA^FO50,30^A0N,40,30^FDTest POS UMKM^FS^FO50,80^BCN,60,Y,N,N^FD1234567890^FS^XZ"

Write-Host "=== Raw ZPL Print Test ==="
Write-Host "Printer: $printerName"
Write-Host "ZPL: $zplData"
Write-Host ""

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

    public static string SendRaw(string printerName, string data)
    {
        IntPtr hPrinter = IntPtr.Zero;
        string log = "";

        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            return "FAIL: OpenPrinter error " + Marshal.GetLastWin32Error();
        }
        log += "OpenPrinter: OK\n";

        DOCINFOA di = new DOCINFOA();
        di.pDocName = "ZPL Raw Test";
        di.pDataType = "RAW";

        int docId = StartDocPrinter(hPrinter, 1, di);
        if (docId <= 0)
        {
            ClosePrinter(hPrinter);
            return log + "FAIL: StartDocPrinter error " + Marshal.GetLastWin32Error();
        }
        log += "StartDocPrinter: OK (docId=" + docId + ")\n";

        if (!StartPagePrinter(hPrinter))
        {
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return log + "FAIL: StartPagePrinter error " + Marshal.GetLastWin32Error();
        }
        log += "StartPagePrinter: OK\n";

        byte[] bytes = System.Text.Encoding.ASCII.GetBytes(data);
        IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pBytes, bytes.Length);

        int dwWritten;
        bool writeOK = WritePrinter(hPrinter, pBytes, bytes.Length, out dwWritten);
        Marshal.FreeCoTaskMem(pBytes);

        log += "WritePrinter: " + (writeOK ? "OK" : "FAIL") + " (" + dwWritten + "/" + bytes.Length + " bytes)\n";

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        log += writeOK ? "SUCCESS!" : "FAIL: WritePrinter error " + Marshal.GetLastWin32Error();
        return log;
    }
}
'@

$result = [RawPrint]::SendRaw($printerName, $zplData)
Write-Host $result
Write-Host ""
Write-Host "=== Done ==="
