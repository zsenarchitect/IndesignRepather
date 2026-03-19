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
 */
async function runPS(script: string): Promise<any> {
  const { stdout, stderr } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command', script,
  ], {
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024, // 10MB for large link lists
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
  // Try version-specific ProgIDs newest first, then generic fallback.
  // Registry confirms both InDesign.Application.2026 and .2025 exist.
  const script = `
    $app = $null
    $usedProgId = ''

    # Scan registry for all InDesign.Application.YYYY ProgIDs, try newest first
    $progIds = @()
    try {
      $progIds = Get-ChildItem 'HKLM:\\SOFTWARE\\Classes' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -match '^InDesign\\.Application\\.\\d{4}$' } |
        ForEach-Object { $_.PSChildName } |
        Sort-Object -Descending
    } catch {}

    # Add generic fallback
    $progIds += 'InDesign.Application'

    foreach ($progId in $progIds) {
      # Try GetActiveObject first (attaches to running instance)
      try {
        $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject($progId)
        $usedProgId = $progId
        break
      } catch {}
    }

    if (-not $app) {
      # Try New-Object with newest ProgID (connects to running or creates)
      foreach ($progId in $progIds) {
        try {
          $app = New-Object -ComObject $progId
          if ($app -and $app.Version) {
            $usedProgId = $progId
            break
          }
        } catch {}
      }
    }

    if (-not $app) {
      Write-Error 'InDesign is not running. Please launch InDesign first.'
      exit 1
    }

    try {
      $app.ScriptPreferences.UserInteractionLevel = 1852403060
      $ver = $app.Version
      @{ version = "$ver"; progId = $usedProgId } | ConvertTo-Json
    } catch {
      Write-Error "Connected but failed to read version: $($_.Exception.Message)"
      exit 1
    }
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
    $app.ScriptPreferences.UserInteractionLevel = 1852403060
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
    $app.ScriptPreferences.UserInteractionLevel = 1852403060

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
      $app.ScriptPreferences.UserInteractionLevel = 1699311169
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
    $app.ScriptPreferences.UserInteractionLevel = 1852403060

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
      $app.ScriptPreferences.UserInteractionLevel = 1699311169
    }
  `;

  await runPS(script);
}

export function disconnect(): void {
  connectedVersion = null;
  connectedProgId = null;
}
