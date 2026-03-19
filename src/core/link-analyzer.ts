import { access } from 'fs/promises';
import { DocumentInfo, LinkInfo, Mapping } from '../shared/types';

export async function checkLinksExist(links: LinkInfo[]): Promise<LinkInfo[]> {
  const results = await Promise.all(
    links.map(async (link) => {
      if (link.status === 'embedded') return link;
      if (!link.filePath) return { ...link, status: 'missing' as const };
      try {
        await access(link.filePath);
        return link;
      } catch {
        return { ...link, status: 'missing' as const };
      }
    })
  );
  return results;
}

export function previewRepath(
  documents: DocumentInfo[],
  mappings: Mapping[]
): DocumentInfo[] {
  return documents.map((doc) => ({
    ...doc,
    links: doc.links.map((link) => {
      if (link.status === 'embedded') return link;
      if (!link.filePath) return link;

      const normalizedPath = link.filePath.replace(/\//g, '\\');

      for (const mapping of mappings) {
        const normalizedOld = mapping.oldPath.replace(/\//g, '\\');
        const normalizedNew = mapping.newPath.replace(/\//g, '\\');

        if (normalizedPath.toLowerCase().startsWith(normalizedOld.toLowerCase())) {
          const newPath = normalizedNew + normalizedPath.slice(normalizedOld.length);
          return { ...link, newPath };
        }
      }

      return link; // No mapping matched
    }),
  }));
}

export async function checkNewPathsExist(
  documents: DocumentInfo[]
): Promise<DocumentInfo[]> {
  // Deduplicate paths to check
  const pathsToCheck = new Set<string>();
  for (const doc of documents) {
    for (const link of doc.links) {
      if (link.newPath) pathsToCheck.add(link.newPath);
    }
  }

  const existenceMap = new Map<string, boolean>();
  await Promise.all(
    Array.from(pathsToCheck).map(async (p) => {
      try {
        await access(p);
        existenceMap.set(p, true);
      } catch {
        existenceMap.set(p, false);
      }
    })
  );

  return documents.map((doc) => ({
    ...doc,
    links: doc.links.map((link) => {
      if (!link.newPath) return link;
      return { ...link, newPathExists: existenceMap.get(link.newPath) ?? false };
    }),
  }));
}
