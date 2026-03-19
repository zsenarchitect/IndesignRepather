# Auto-dismiss InDesign dialog windows
# This script finds and closes popup dialogs that block COM automation.
# It clicks "OK", "Cancel", "Close", "Don't Save", or sends WM_CLOSE.

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class DialogDismisser {
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

    public static string GetText(IntPtr hWnd) {
        int len = GetWindowTextLength(hWnd);
        if (len == 0) return "";
        var sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }

    public static string GetClass(IntPtr hWnd) {
        var sb = new StringBuilder(256);
        GetClassName(hWnd, sb, 256);
        return sb.ToString();
    }

    public static int DismissInDesignDialogs() {
        var dismissed = 0;
        var indesignPids = new HashSet<uint>();
        foreach (var proc in System.Diagnostics.Process.GetProcessesByName("InDesign")) {
            indesignPids.Add((uint)proc.Id);
        }

        var dialogs = new List<IntPtr>();
        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (indesignPids.Contains(pid) && IsWindowVisible(hWnd)) {
                var cls = GetClass(hWnd);
                // #32770 = standard Windows dialog class
                if (cls == "#32770") {
                    dialogs.Add(hWnd);
                }
            }
            return true;
        }, IntPtr.Zero);

        foreach (var dlg in dialogs) {
            var title = GetText(dlg);
            // Skip if it's a file dialog (Open/Save)
            if (title == "Open a File" || title == "Save As" || title == "Save") continue;

            // Find buttons and click the safest one
            var buttons = new List<KeyValuePair<IntPtr, string>>();
            EnumChildWindows(dlg, (hWnd, lParam) => {
                if (GetClass(hWnd) == "Button") {
                    buttons.Add(new KeyValuePair<IntPtr, string>(hWnd, GetText(hWnd)));
                }
                return true;
            }, IntPtr.Zero);

            // Priority: OK > Close > Cancel > Don't Save
            // These are safe dismissals that don't modify documents
            IntPtr targetBtn = IntPtr.Zero;
            string[] priorities = { "OK", "Close", "Cancel", "Don't Save", "No" };
            foreach (var prio in priorities) {
                foreach (var btn in buttons) {
                    if (btn.Value.Equals(prio, StringComparison.OrdinalIgnoreCase) ||
                        btn.Value.Contains(prio)) {
                        targetBtn = btn.Key;
                        break;
                    }
                }
                if (targetBtn != IntPtr.Zero) break;
            }

            if (targetBtn != IntPtr.Zero) {
                SendMessage(targetBtn, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
                dismissed++;
            } else {
                // No known button found — just close the dialog
                PostMessage(dlg, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                dismissed++;
            }
        }
        return dismissed;
    }
}
"@

$count = [DialogDismisser]::DismissInDesignDialogs()
@{ dismissed = $count } | ConvertTo-Json
