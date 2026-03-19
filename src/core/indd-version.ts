import { readFile } from 'fs/promises';

export interface InddVersionInfo {
  version: string;        // e.g., "20.0"
  yearVersion: string;    // e.g., "2025"
  raw: string;            // raw string found in header
}

export async function detectInddVersion(filePath: string): Promise<InddVersionInfo | null> {
  try {
    // Read first 4096 bytes — version info is in the header
    const fd = await import('fs').then(fs => fs.promises.open(filePath, 'r'));
    const buffer = Buffer.alloc(4096);
    await fd.read(buffer, 0, 4096, 0);
    await fd.close();

    // Convert to string and search for version patterns
    const headerStr = buffer.toString('latin1');

    // Look for "Adobe InDesign" followed by version info
    // Pattern: "Adobe InDesign CC 2024" or "Adobe InDesign 2025"
    const yearMatch = headerStr.match(/Adobe InDesign(?:\s+CC)?\s+(20\d{2})/);
    if (yearMatch) {
      const year = yearMatch[1];
      return {
        version: yearToMajorVersion(year),
        yearVersion: year,
        raw: yearMatch[0],
      };
    }

    // Fallback: look for version number pattern like "20.0" near "InDesign"
    const versionMatch = headerStr.match(/(\d{2}\.\d)/);
    if (versionMatch) {
      const major = versionMatch[1];
      return {
        version: major,
        yearVersion: majorVersionToYear(major),
        raw: `InDesign ${major}`,
      };
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
