$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
$targetPath = [Console]::In.ReadToEnd()
$folderPath = [IO.Path]::GetDirectoryName($targetPath)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CapExplorer {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    public static extern void SHParseDisplayName(string name, IntPtr bind, out IntPtr pidl, uint mask, out uint attributes);
    [DllImport("shell32.dll", PreserveSig = false)]
    public static extern void SHOpenFolderAndSelectItems(IntPtr pidl, uint count, IntPtr items, uint flags);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
"@
$pidl = [IntPtr]::Zero
$attributes = [uint32]0
try {
    [CapExplorer]::SHParseDisplayName($targetPath, [IntPtr]::Zero, [ref]$pidl, 0, [ref]$attributes)
    [CapExplorer]::SHOpenFolderAndSelectItems($pidl, 0, [IntPtr]::Zero, 0)
} finally {
    if ($pidl -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeCoTaskMem($pidl) }
}
$shell = New-Object -ComObject Shell.Application
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    foreach ($window in $shell.Windows()) {
        if ($window.Document.Folder.Self.Path -ne $folderPath) { continue }
        $item = $window.Document.Folder.ParseName([IO.Path]::GetFileName($targetPath))
        $window.Document.SelectItem($item, 29)
        $hwnd = [IntPtr]$window.HWND
        if ([CapExplorer]::IsIconic($hwnd)) { [void][CapExplorer]::ShowWindow($hwnd, 9) }
        # Raise this Explorer window without leaving it permanently always-on-top.
        try { [void][CapExplorer]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 3) }
        finally { [void][CapExplorer]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 3) }
        [void][CapExplorer]::SetForegroundWindow($hwnd)
        exit 0
    }
    Start-Sleep -Milliseconds 100
}
throw 'Explorer did not expose the destination folder in time.'
