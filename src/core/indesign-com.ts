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

/**
 * Execute a PowerShell script and return parsed JSON output.
 * Uses temp file + -File flag to avoid command-line escaping issues.
 */
async function runPS(script: string): Promise<any> {
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
      timeout: 60000,
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
  // Escape backslashes and quotes for PowerShell
  const escapedPath = filePath.replace(/'/g, "''");

  // Check version compatibility before opening
  if (fileVersion && connectedVersion) {
    const compat = checkVersionCompatibility(connectedVersion, fileVersion);
    if (!compat.compatible) {
      throw new Error(compat.message);
    }
  }

  const script = `
    try {
      $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('${progId}')
    } catch {
      $app = New-Object -ComObject '${progId}'
    }

    # Suppress dialogs IMMEDIATELY before any document operations
    try { $app.ScriptPreferences.UserInteractionLevel = 1852403060 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;", 1246973031) } catch {} }

    try {
      # Check if document is already open
      $doc = $null
      for ($i = 0; $i -lt $app.Documents.Count; $i++) {
        $d = $app.Documents.Item($i + 1)
        if ($d.FilePath -eq '${escapedPath}') {
          $doc = $d
          break
        }
      }

      if (-not $doc) {
        $doc = $app.Open('${escapedPath}', $true)
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
        path = '${escapedPath}'
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
 * Relink a specific link in a document and save.
 * Checks version compatibility BEFORE opening to prevent conversion dialogs.
 */
export async function relinkAndSave(
  filePath: string,
  linkName: string,
  newPath: string,
  fileVersion?: string
): Promise<void> {
  const progId = connectedProgId || 'InDesign.Application';
  const escapedFilePath = filePath.replace(/'/g, "''");
  const escapedLinkName = linkName.replace(/'/g, "''");
  const escapedNewPath = newPath.replace(/'/g, "''");

  // Check version compatibility before opening
  if (fileVersion && connectedVersion) {
    const compat = checkVersionCompatibility(connectedVersion, fileVersion);
    if (!compat.compatible) {
      throw new Error(compat.message);
    }
  }

  const script = `
    try {
      $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('${progId}')
    } catch {
      $app = New-Object -ComObject '${progId}'
    }

    # Suppress dialogs IMMEDIATELY before any document operations
    try { $app.ScriptPreferences.UserInteractionLevel = 1852403060 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;", 1246973031) } catch {} }

    try {
      # Find document
      $doc = $null
      for ($i = 0; $i -lt $app.Documents.Count; $i++) {
        $d = $app.Documents.Item($i + 1)
        if ($d.FilePath -eq '${escapedFilePath}') {
          $doc = $d
          break
        }
      }
      if (-not $doc) {
        $doc = $app.Open('${escapedFilePath}', $true)
      }

      # Find and relink
      for ($i = 0; $i -lt $doc.Links.Count; $i++) {
        $link = $doc.Links.Item($i + 1)
        if ("$($link.Name)" -eq '${escapedLinkName}') {
          try {
            $fso = New-Object -ComObject 'Scripting.FileSystemObject'
            $fileObj = $fso.GetFile('${escapedNewPath}')
            $link.Relink($fileObj)
          } catch {
            $link.Relink('${escapedNewPath}')
          }
          break
        }
      }

      $doc.Save()
      @{ success = $true } | ConvertTo-Json
    } finally {
      # Restore default interaction level
      try { $app.ScriptPreferences.UserInteractionLevel = 1699311169 } catch { try { $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;", 1246973031) } catch {} }
    }
  `;

  await runPS(script);
}

export function disconnect(): void {
  connectedVersion = null;
  connectedProgId = null;
}
