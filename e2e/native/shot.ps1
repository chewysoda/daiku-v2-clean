# Screenshot of the real app window, native browser pane included.
param([string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [StructLayout(LayoutKind.Sequential)] public struct R { public int L,T,Rt,B; }
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
[DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags); }
"@
$p = Get-Process daiku | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$r = New-Object W+R; [W]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$bmp = New-Object Drawing.Bitmap ($r.Rt-$r.L), ($r.B-$r.T)
$g = [Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc()
$ok = [W]::PrintWindow($p.MainWindowHandle, $dc, 2); $g.ReleaseHdc($dc)
$bmp.Save($Out); "printed=$ok $($bmp.Width)x$($bmp.Height)"
