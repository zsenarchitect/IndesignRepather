/**
 * InDesign COM bridge via PowerShell subprocess.
 *
 * No native Node modules needed — uses PowerShell's built-in COM support
 * which is available on every Windows machine. Each function spawns a
 * short-lived PowerShell process, passes a script, and parses JSON output.
 *
 * This approach:
 * - Works in packaged Electron (no node-gyp, no native modules)
 * - Works on every Windows 10/11 machine out of the box
 * - Uses the same COM API as the original Python backend
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { DocumentInfo, LinkInfo } from '../shared/types';

const execFileAsync = promisify(execFile);

// Track connection state
let connectedVersion: string | null = null;
let connectedProgId: string | null = null;

// Path to dismiss-dialogs script (bundled with app)
import { join as joinPath, dirname } from 'path';
const dismissScriptPath = joinPath(dirname(__filename), 'dismiss-dialogs.ps1');

/**
 * Dismiss any InDesign dialog windows (Missing Fonts, Convert File, etc.)
 * Uses Win32 API to find and click OK/Cancel/Close on popup dialogs.
 */
export async function dismissDialogs(): Promise<number> {
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', dismissScriptPath,
    ], { timeout: 10000, windowsHide: true });
    const result = JSON.parse(stdout.trim());
    return result.dismissed || 0;
  } catch {
    return 0;
  }
}

/**
 * Execute a PowerShell script and return parsed JSON output.
 * Uses temp file + -File flag to avoid command-line escaping issues.
 */
async function runPS(script: string, timeoutMs = 120_000): Promise<any> {
  const { writeFile, unlink } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const { join: joinPath } = await import('path');
  const tmpFile = joinPath(tmpdir(), `indesign-repather-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);

  await writeFile(tmpFile, script, 'utf-8');

  try {
    const { stdout, stderr } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', tmpFile,
    ], {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });

    if (!stdout.trim()) {
      if (stderr.trim()) throw new Error(stderr.trim());
      return null;
    }

    try {
      return JSON.parse(stdout);
    } catch {
      throw new Error(stdout.trim() || stderr.trim() || 'Unknown PowerShell error');
    }
  } finally {
    unlink(tmpFile).catch(() => {});
  }
}

/**
 * Check if the connected InDesign version can open a file created in a given version.
 * Returns compatibility info including whether it's safe to open.
 */
export function checkVersionCompatibility(
  connectedVersion: string,
  fileVersion: string
): { compatible: boolean; message: string } {
  const connectedMajor = parseInt(connectedVersion);
  const fileMajor = parseInt(fileVersion);

  if (isNaN(connectedMajor) || isNaN(fileMajor)) {
    return { compatible: true, message: 'Could not determine version compatibility.' };
  }

  if (fileMajor > connectedMajor) {
    return {
      compatible: false,
      message: `File version ${fileVersion} is newer than connected InDesign ${connectedVersion}. Cannot open without conversion dialog.`,
    };
  }

  if (fileMajor < connectedMajor) {
    return {
      compatible: true,
      message: `File will be upgraded from ${fileVersion} to ${connectedVersion}. This cannot be undone.`,
    };
  }

  return { compatible: true, message: 'Versions match.' };
}

/**
 * Connect to InDesign and return version info.
 * Sets UserInteractionLevel to neverInteract immediately after creating COM object.
 */
export async function connect(_version?: string): Promise<{ version: string; bridge: string }> {
  // Now using temp file, so proper multi-line PowerShell is safe
  const script = `
$progIds = @(
    "InDesign.Application.2026",
    "InDesign.Application.2025",
    "InDesign.Application.2024",
    "InDesign.Application.2023",
    "InDesign.Application"
)

$app = $null
$usedProgId = ""

foreach ($p in $progIds) {
    try {
        $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject($p)
        $usedProgId = $p
        break
    } catch {}
}

if (-not $app) {
    foreach ($p in $progIds) {
        try {
            $test = New-Object -ComObject $p
            $v = $test.Version
            if ($v) {
                $app = $test
                $usedProgId = $p
                break
            }
        } catch {}
    }
}

if (-not $app) {
    Write-Error "InDesign is not running. Please launch InDesign first."
    exit 1
}

try { $app.ScriptPreferences.UserInteractionLevel = 1852403060 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;", 1246973031) } catch {} }
$ver = $app.Version
@{ version = "$ver"; progId = $usedProgId } | ConvertTo-Json
`;

  const result = await runPS(script);
  connectedVersion = result.version;
  connectedProgId = result.progId;
  return { version: result.version, bridge: 'powershell' };
}

export function isConnected(): boolean {
  return connectedVersion !== null;
}

export function getConnectedVersion(): string | null {
  return connectedVersion;
}

/**
 * Get list of currently open documents in InDesign.
 */
export async function getOpenDocuments(): Promise<{ name: string; path: string }[]> {
  const progId = connectedProgId || 'InDesign.Application';

  const script = `
    try {
      $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('${progId}')
    } catch {
      try {
        $app = New-Object -ComObject '${progId}'
      } catch {
        Write-Error 'Not connected to InDesign'
        exit 1
      }
    }
    try { $app.ScriptPreferences.UserInteractionLevel = 1852403060 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;", 1246973031) } catch {} }
    $docs = @()
    for ($i = 0; $i -lt $app.Documents.Count; $i++) {
      $doc = $app.Documents.Item($i + 1)
      $docs += @{ name = $doc.Name; path = $doc.FilePath }
    }
    $docs | ConvertTo-Json -Depth 2
  `;

  const result = await runPS(script);
  if (!result) return [];
  // PowerShell returns single object (not array) when count is 1
  return Array.isArray(result) ? result : [result];
}

/**
 * Get all links from a document. Opens the file if not already open.
 * Checks version compatibility BEFORE opening to prevent conversion dialogs.
 */
export async function getDocumentLinks(filePath: string, fileVersion?: string): Promise<DocumentInfo> {
  const progId = connectedProgId || 'InDesign.Application';

  // Check version compatibility before opening
  if (fileVersion && connectedVersion) {
    const compat = checkVersionCompatibility(connectedVersion, fileVersion);
    if (!compat.compatible) {
      throw new Error(compat.message);
    }
  }

  // Use PowerShell here-strings (@'...'@) for paths — no interpolation of $, backticks, etc.
  const script = `
$filePath = @'
${filePath}
'@

    try {
      $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('${progId}')
    } catch {
      $app = New-Object -ComObject '${progId}'
    }

    # Suppress dialogs IMMEDIATELY before any document operations
    try { $app.ScriptPreferences.UserInteractionLevel = 1852403060 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;", 1246973031) } catch {} }

    try {
      # Check if document is already open (case-insensitive)
      $doc = $null
      for ($i = 0; $i -lt $app.Documents.Count; $i++) {
        $d = $app.Documents.Item($i + 1)
        if ($d.FilePath -ieq $filePath) {
          $doc = $d
          break
        }
      }

      if (-not $doc) {
        $doc = $app.Open($filePath, $true)
      }

      $links = @()
      for ($i = 0; $i -lt $doc.Links.Count; $i++) {
        try {
          $link = $doc.Links.Item($i + 1)
          $statusCode = [int]$link.Status
          $status = switch ($statusCode) {
            1852797549 { 'normal' }
            1819242340 { 'out-of-date' }
            1819109747 { 'missing' }
            1282237028 { 'embedded' }
            1818848865 { 'inaccessible' }
            default { 'missing' }
          }
          $fp = "$($link.FilePath)"
          if ($fp -eq 'unknown') { $fp = '' }
          $links += @{
            name = "$($link.Name)"
            filePath = $fp
            status = $status
          }
        } catch {
          # Skip inaccessible links
        }
      }

      @{
        name = "$($doc.Name)"
        path = $filePath
        links = $links
      } | ConvertTo-Json -Depth 3
    } finally {
      # Restore default interaction level
      try { $app.ScriptPreferences.UserInteractionLevel = 1699311169 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;", 1246973031) } catch {} }
    }
  `;

  return await runPS(script);
}

/**
 * Relink multiple links in a document and save once.
 * Accepts an array of {linkName, newPath} pairs to batch all relinks into one
 * PowerShell process, saving once at the end instead of per-link.
 * Checks version compatibility BEFORE opening to prevent conversion dialogs.
 */
export async function relinkAndSave(
  filePath: string,
  links: { linkName: string; newPath: string }[],
  fileVersion?: string
): Promise<{ relinked: number; failed: string[] }> {
  const progId = connectedProgId || 'InDesign.Application';

  // Check version compatibility before opening
  if (fileVersion && connectedVersion) {
    const compat = checkVersionCompatibility(connectedVersion, fileVersion);
    if (!compat.compatible) {
      throw new Error(compat.message);
    }
  }

  // Build a JSON array of link operations, passed as a here-string to avoid
  // any PowerShell interpolation of $, backticks, etc. in file paths.
  const linksJson = JSON.stringify(links);

  const script = `
$filePath = @'
${filePath}
'@

$linksJson = @'
${linksJson}
'@

$linkOps = $linksJson | ConvertFrom-Json

    try {
      $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('${progId}')
    } catch {
      $app = New-Object -ComObject '${progId}'
    }

    # Suppress dialogs IMMEDIATELY before any document operations
    try { $app.ScriptPreferences.UserInteractionLevel = 1852403060 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;", 1246973031) } catch {} }

    try {
      # Find document (case-insensitive)
      $doc = $null
      for ($i = 0; $i -lt $app.Documents.Count; $i++) {
        $d = $app.Documents.Item($i + 1)
        if ($d.FilePath -ieq $filePath) {
          $doc = $d
          break
        }
      }
      if (-not $doc) {
        $doc = $app.Open($filePath, $true)
      }

      $relinked = 0
      $failed = @()

      foreach ($op in $linkOps) {
        $found = $false
        for ($i = 0; $i -lt $doc.Links.Count; $i++) {
          $link = $doc.Links.Item($i + 1)
          if ("$($link.Name)" -eq $op.linkName) {
            try {
              try {
                $fso = New-Object -ComObject 'Scripting.FileSystemObject'
                $fileObj = $fso.GetFile($op.newPath)
                $link.Relink($fileObj)
              } catch {
                $link.Relink($op.newPath)
              }
              $relinked++
            } catch {
              $failed += "$($op.linkName): $($_.Exception.Message)"
            }
            $found = $true
            break
          }
        }
        if (-not $found) {
          $failed += "$($op.linkName): link not found in document"
        }
      }

      $doc.Save()
      @{ relinked = $relinked; failed = $failed } | ConvertTo-Json -Depth 2
    } finally {
      # Restore default interaction level
      try { $app.ScriptPreferences.UserInteractionLevel = 1699311169 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;", 1246973031) } catch {} }
    }
  `;

  return await runPS(script);
}

/**
 * Reset InDesign's UserInteractionLevel to INTERACT_WITH_ALL.
 * Call this after a failed COM operation to ensure InDesign isn't stuck
 * in non-interactive mode (e.g. if a timeout killed the process mid-operation).
 */
export async function resetInteractionLevel(): Promise<void> {
  const progId = connectedProgId || 'InDesign.Application';
  const script = `
    try {
      $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('${progId}')
      try { $app.ScriptPreferences.UserInteractionLevel = 1699311169 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;", 1246973031) } catch {} }
      @{ reset = $true } | ConvertTo-Json
    } catch {
      @{ reset = $false; error = $_.Exception.Message } | ConvertTo-Json
    }
  `;
  try {
    await runPS(script, 10_000);
  } catch {
    // Best-effort — if this fails, InDesign may need manual restart
  }
}

export function disconnect(): void {
  connectedVersion = null;
  connectedProgId = null;
}
