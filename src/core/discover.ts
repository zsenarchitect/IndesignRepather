import { readdir } from 'fs/promises';
import { join, basename } from 'path';
import { Mapping } from '../shared/types';

export interface DiscoverResult {
  suggestedMappings: Mapping[];
  foundFiles: Map<string, string[]>;
  notFound: string[];
  totalScanned: number;
}

async function walkDir(
  dir: string,
  fileIndex: Map<string, string[]>,
  targetNames: Set<string>,
  onProgress?: (found: number) => void,
  scanned = { count: 0 },
  depth = 0,
  maxDepth = 15
): Promise<void> {
  if (depth >= maxDepth) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Skip inaccessible directories
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories and common non-content directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      await walkDir(fullPath, fileIndex, targetNames, onProgress, scanned, depth + 1, maxDepth);
    } else if (targetNames.has(entry.name.toLowerCase())) {
      const existing = fileIndex.get(entry.name.toLowerCase()) ?? [];
      existing.push(fullPath);
      fileIndex.set(entry.name.toLowerCase(), existing);
      scanned.count++;
      onProgress?.(scanned.count);
    }
  }
}

function extractCommonMappings(
  brokenPaths: Map<string, string>,
  foundPaths: Map<string, string[]>
): Mapping[] {
  const prefixCounts = new Map<string, { oldPrefix: string; newPrefix: string; count: number }>();

  for (const [filename, brokenPath] of brokenPaths) {
    const candidates = foundPaths.get(filename.toLowerCase());
    if (!candidates || candidates.length === 0) continue;

    const foundPath = candidates[0];
    const brokenDir = brokenPath.substring(0, brokenPath.lastIndexOf('\\'));
    const foundDir = foundPath.substring(0, foundPath.lastIndexOf('\\'));

    if (brokenDir.toLowerCase() === foundDir.toLowerCase()) continue;

    const key = `${brokenDir.toLowerCase()}|||${foundDir.toLowerCase()}`;
    const existing = prefixCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      prefixCounts.set(key, { oldPrefix: brokenDir, newPrefix: foundDir, count: 1 });
    }
  }

  return Array.from(prefixCounts.values())
    .sort((a, b) => b.count - a.count)
    .map(({ oldPrefix, newPrefix }) => ({ oldPath: oldPrefix, newPath: newPrefix }));
}

export async function discoverMappings(
  brokenLinks: { name: string; filePath: string }[],
  searchRoots: string[],
  onProgress?: (found: number) => void
): Promise<DiscoverResult> {
  const targetNames = new Set(
    brokenLinks.map((l) => basename(l.filePath).toLowerCase())
  );
  const brokenPathMap = new Map(
    brokenLinks.map((l) => [basename(l.filePath).toLowerCase(), l.filePath])
  );

  const fileIndex = new Map<string, string[]>();
  for (const root of searchRoots) {
    await walkDir(root, fileIndex, targetNames, onProgress);
  }

  const notFound = Array.from(targetNames).filter((name) => !fileIndex.has(name));
  const suggestedMappings = extractCommonMappings(brokenPathMap, fileIndex);

  let totalScanned = 0;
  for (const paths of fileIndex.values()) {
    totalScanned += paths.length;
  }

  return {
    suggestedMappings,
    foundFiles: fileIndex,
    notFound,
    totalScanned,
  };
}
