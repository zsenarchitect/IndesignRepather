import { copyFile } from 'fs/promises';
import { Mapping, RepathResult, ProgressUpdate } from '../shared/types';
import * as com from './indesign-com';
import { previewRepath, checkNewPathsExist } from './link-analyzer';

export async function executeRepath(
  filePaths: string[],
  mappings: Mapping[],
  onProgress: (update: ProgressUpdate) => void,
  fileVersions?: Record<string, { version: string } | null>
): Promise<RepathResult[]> {
  const results: RepathResult[] = [];

  for (let fileIdx = 0; fileIdx < filePaths.length; fileIdx++) {
    const filePath = filePaths[fileIdx];
    const result: RepathResult = {
      document: filePath,
      totalLinks: 0,
      repathedLinks: 0,
      failedLinks: 0,
      errors: [],
    };

    try {
      onProgress({
        stage: 'analyzing',
        currentFile: filePath,
        currentFileIndex: fileIdx,
        totalFiles: filePaths.length,
      });

      // Create backup before modifying
      try {
        await copyFile(filePath, filePath + '.bak');
      } catch (backupErr: any) {
        result.errors.push(`Backup failed (proceeding anyway): ${backupErr.message}`);
      }

      const fileVersion = fileVersions?.[filePath]?.version;
      const docInfo = await com.getDocumentLinks(filePath, fileVersion);
      const [previewed] = await checkNewPathsExist(
        previewRepath([docInfo], mappings)
      );

      if (!previewed) {
        results.push(result);
        continue;
      }

      result.totalLinks = previewed.links.length;
      const linksToRepath = previewed.links.filter((l) => l.newPath);

      if (linksToRepath.length === 0) {
        results.push(result);
        continue;
      }

      onProgress({
        stage: 'repathing',
        currentFile: filePath,
        currentFileIndex: fileIdx,
        totalFiles: filePaths.length,
        currentLink: 0,
        totalLinks: linksToRepath.length,
      });

      // Batch all relinks for this document into one PowerShell process
      const linkOps = linksToRepath.map((l) => ({
        linkName: l.name,
        newPath: l.newPath!,
      }));

      try {
        const batchResult = await com.relinkAndSave(filePath, linkOps, fileVersion);
        result.repathedLinks = batchResult.relinked;
        result.failedLinks = linkOps.length - batchResult.relinked;
        if (batchResult.failed && batchResult.failed.length > 0) {
          result.errors.push(...batchResult.failed);
        }
      } catch (e: any) {
        result.failedLinks = linksToRepath.length;
        result.errors.push(`Batch relink failed: ${String(e)}`);
        // Reset InDesign interaction level in case timeout killed the process
        await com.resetInteractionLevel();
      }
    } catch (e: any) {
      result.errors.push(`Failed to process file: ${String(e)}`);
      await com.resetInteractionLevel();
    }

    results.push(result);
  }

  return results;
}
