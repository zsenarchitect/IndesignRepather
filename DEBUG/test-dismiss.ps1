# Test: Find and dismiss InDesign dialog windows

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class WindowHelper {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hwnd, EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    public const uint WM_CLOSE = 0x0010;
    public const uint BM_CLICK = 0x00F5;

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static List<IntPtr> GetInDesignWindows() {
        var windows = new List<IntPtr>();
        var indesignPids = new HashSet<uint>();

        foreach (var proc in System.Diagnostics.Process.GetProcessesByName("InDesign")) {
            indesignPids.Add((uint)proc.Id);
        }

        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (indesignPids.Contains(pid) && IsWindowVisible(hWnd)) {
                windows.Add(hWnd);
            }
            return true;
        }, IntPtr.Zero);

        return windows;
    }

    public static string GetWindowTitle(IntPtr hWnd) {
        int len = GetWindowTextLength(hWnd);
        if (len == 0) return "";
        var sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }

    public static string GetWindowClass(IntPtr hWnd) {
        var sb = new StringBuilder(256);
        GetClassName(hWnd, sb, 256);
        return sb.ToString();
    }

    public static List<IntPtr> GetChildButtons(IntPtr parentHwnd) {
        var buttons = new List<IntPtr>();
        EnumChildWindows(parentHwnd, (hWnd, lParam) => {
            var cls = GetWindowClass(hWnd);
            if (cls == "Button") {
                buttons.Add(hWnd);
            }
            return true;
        }, IntPtr.Zero);
        return buttons;
    }
}
"@

Write-Host "Scanning for InDesign windows..."
$windows = [WindowHelper]::GetInDesignWindows()
Write-Host "Found $($windows.Count) visible InDesign windows:"

foreach ($hwnd in $windows) {
    $title = [WindowHelper]::GetWindowTitle($hwnd)
    $class = [WindowHelper]::GetWindowClass($hwnd)
    Write-Host "  Window: '$title' (class: $class, hwnd: $hwnd)"

    # Check for dialog-like windows (not the main InDesign window)
    $isDialog = ($class -ne "InDesign" -and $class -ne "indesign") -or
                ($title -match "Adobe|Creative Cloud|Update|Convert|Missing")

    if ($isDialog -and $title -ne "Adobe InDesign") {
        Write-Host "    -> DIALOG DETECTED"
        $buttons = [WindowHelper]::GetChildButtons($hwnd)
        foreach ($btn in $buttons) {
            $btnTitle = [WindowHelper]::GetWindowTitle($btn)
            Write-Host "      Button: '$btnTitle'"
        }
    }
}
