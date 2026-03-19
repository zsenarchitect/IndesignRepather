import { Mapping, RepathResult, ProgressUpdate } from '../shared/types';
import * as com from './indesign-com';
import { previewRepath, checkNewPathsExist } from './link-analyzer';

export async function executeRepath(
  filePaths: string[],
  mappings: Mapping[],
  onProgress: (update: ProgressUpdate) => void
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

      const docInfo = com.getDocumentLinks(filePath);
      const [previewed] = await checkNewPathsExist(
        previewRepath([docInfo], mappings)
      );

      result.totalLinks = previewed.links.length;
      const linksToRepath = previewed.links.filter((l) => l.newPath);

      for (let linkIdx = 0; linkIdx < linksToRepath.length; linkIdx++) {
        const link = linksToRepath[linkIdx];

        onProgress({
          stage: 'repathing',
          currentFile: filePath,
          currentFileIndex: fileIdx,
          totalFiles: filePaths.length,
          currentLink: linkIdx + 1,
          totalLinks: linksToRepath.length,
        });

        try {
          com.relinkAndSave(filePath, link.name, link.newPath!);
          result.repathedLinks++;
        } catch (e: any) {
          result.failedLinks++;
          result.errors.push(`${link.name}: ${String(e)}`);
        }
      }
    } catch (e: any) {
      result.errors.push(`Failed to process file: ${String(e)}`);
    }

    results.push(result);
  }

  return results;
}
