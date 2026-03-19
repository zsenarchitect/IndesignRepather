import { readFile } from 'fs/promises';

export interface InddVersionInfo {
  version: string;        // e.g., "20.0"
  yearVersion: string;    // e.g., "2025"
  raw: string;            // raw string found in header
}

export async function detectInddVersion(filePath: string): Promise<InddVersionInfo | null> {
  try {
    // Read first 8192 bytes — version info can appear later in the header
    const fd = await import('fs').then(fs => fs.promises.open(filePath, 'r'));
    const buffer = Buffer.alloc(8192);
    await fd.read(buffer, 0, 8192, 0);
    await fd.close();

    // Strategy 1: Search latin1 for "Adobe InDesign" year pattern
    const headerStr = buffer.toString('latin1');
    const yearMatch = headerStr.match(/Adobe InDesign(?:\s+CC)?\s+(20\d{2})/);
    if (yearMatch) {
      const year = yearMatch[1];
      return {
        version: yearToMajorVersion(year),
        yearVersion: year,
        raw: yearMatch[0],
      };
    }

    // Strategy 2: Search UTF-16LE encoded strings (InDesign uses these internally)
    const utf16Str = buffer.toString('utf16le');
    const utf16YearMatch = utf16Str.match(/Adobe InDesign(?:\s+CC)?\s+(20\d{2})/);
    if (utf16YearMatch) {
      const year = utf16YearMatch[1];
      return {
        version: yearToMajorVersion(year),
        yearVersion: year,
        raw: utf16YearMatch[0],
      };
    }

    // Strategy 3: Search for XMP metadata block with CreatorTool
    const xmpMatch = headerStr.match(/<xmp:CreatorTool>Adobe InDesign\s+([\d.]+)<\/xmp:CreatorTool>/);
    if (xmpMatch) {
      const ver = xmpMatch[1];
      const major = ver.split('.')[0];
      return {
        version: `${major}.${ver.split('.')[1] || '0'}`,
        yearVersion: majorVersionToYear(`${major}.0`),
        raw: `InDesign ${ver} (XMP)`,
      };
    }
    // Also check UTF-16LE for XMP
    const xmpMatchUtf16 = utf16Str.match(/<xmp:CreatorTool>Adobe InDesign\s+([\d.]+)<\/xmp:CreatorTool>/);
    if (xmpMatchUtf16) {
      const ver = xmpMatchUtf16[1];
      const major = ver.split('.')[0];
      return {
        version: `${major}.${ver.split('.')[1] || '0'}`,
        yearVersion: majorVersionToYear(`${major}.0`),
        raw: `InDesign ${ver} (XMP)`,
      };
    }

    // Strategy 4: Search for version number patterns like "21.2", "20.0", "19.0"
    // in both latin1 and UTF-16LE — match two-digit major versions in InDesign range
    const versionPatterns = [
      { str: headerStr, encoding: 'latin1' },
      { str: utf16Str, encoding: 'utf16le' },
    ];
    for (const { str, encoding } of versionPatterns) {
      const versionMatch = str.match(/(1[7-9]|2[0-9])\.\d/);
      if (versionMatch) {
        const major = versionMatch[0];
        return {
          version: major,
          yearVersion: majorVersionToYear(major),
          raw: `InDesign ${major} (${encoding} binary)`,
        };
      }
    }

    return null; // Could not detect
  } catch {
    return null;
  }
}

function yearToMajorVersion(year: string): string {
  const map: Record<string, string> = {
    '2022': '17.0',
    '2023': '18.0',
    '2024': '19.0',
    '2025': '20.0',
    '2026': '21.0',
  };
  return map[year] || 'unknown';
}

function majorVersionToYear(major: string): string {
  const num = parseInt(major);
  const map: Record<number, string> = {
    17: '2022',
    18: '2023',
    19: '2024',
    20: '2025',
    21: '2026',
  };
  return map[num] || 'unknown';
}

export function getMajorVersion(versionStr: string): number {
  return parseInt(versionStr);
}

export async function detectMultipleVersions(
  filePaths: string[]
): Promise<Map<string, InddVersionInfo | null>> {
  const results = new Map<string, InddVersionInfo | null>();
  await Promise.all(
    filePaths.map(async (fp) => {
      results.set(fp, await detectInddVersion(fp));
    })
  );
  return results;
}
