import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // File selection
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // InDesign connection
  connectInDesign: (version?: string) => ipcRenderer.invoke('connect-indesign', version),
  launchInDesign: () => ipcRenderer.invoke('launch-indesign'),

  // InDesign COM
  getOpenDocuments: async () => {
    const result = await ipcRenderer.invoke('get-open-documents');
    if (result?.error) throw new Error(result.error);
    return result?.data ?? result;
  },
  analyzeLinks: async (filePaths: string[]) => {
    const result = await ipcRenderer.invoke('analyze-links', filePaths);
    if (result?.error) throw new Error(result.error);
    return result?.data ?? result;
  },

  // Discover
  discoverMappings: (brokenLinks: { name: string; filePath: string }[], searchRoots: string[]) =>
    ipcRenderer.invoke('discover-mappings', brokenLinks, searchRoots),
  onDiscoverProgress: (callback: (data: { found: number }) => void) =>
    ipcRenderer.on('discover-progress', (_event, data) => callback(data)),

  // Preview & Execute
  previewRepath: async (filePaths: string[], mappings: { oldPath: string; newPath: string }[]) => {
    const result = await ipcRenderer.invoke('preview-repath', filePaths, mappings);
    if (result?.error) throw new Error(result.error);
    return result?.data ?? result;
  },
  executeRepath: async (filePaths: string[], mappings: { oldPath: string; newPath: string }[], fileVersions?: Record<string, { version: string } | null>) => {
    const result = await ipcRenderer.invoke('execute-repath', filePaths, mappings, fileVersions);
    if (result?.error) throw new Error(result.error);
    return result?.data ?? result;
  },
  onProgress: (callback: (data: any) => void) =>
    ipcRenderer.on('repath-progress', (_event, data) => callback(data)),

  // Persistence
  loadMappings: () => ipcRenderer.invoke('load-mappings'),
  saveMappings: (mappings: { oldPath: string; newPath: string }[]) =>
    ipcRenderer.invoke('save-mappings', mappings),
  loadSearchRoots: () => ipcRenderer.invoke('load-search-roots'),
  saveSearchRoots: (roots: string[]) => ipcRenderer.invoke('save-search-roots', roots),

  // Folder path (returns directory path, not .indd files)
  selectFolderPath: () => ipcRenderer.invoke('select-folder-path'),

  // Export/Import rules
  exportRules: (data: string) => ipcRenderer.invoke('export-rules', data),
  importRules: () => ipcRenderer.invoke('import-rules'),

  // Analyze progress
  onAnalyzeProgress: (callback: (data: any) => void) =>
    ipcRenderer.on('analyze-progress', (_event, data) => callback(data)),

  // Folder scan progress
  onFolderScanProgress: (callback: (data: { found: number }) => void) =>
    ipcRenderer.on('folder-scan-progress', (_event, data) => callback(data)),

  // Preview progress
  onPreviewProgress: (callback: (data: { currentIndex: number; totalFiles: number; currentFile: string }) => void) =>
    ipcRenderer.on('preview-progress', (_event, data) => callback(data)),

  // File version detection
  detectFileVersions: (filePaths: string[]) => ipcRenderer.invoke('detect-file-versions', filePaths),

  // Utilities
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getThumbnail: (filePath: string) => ipcRenderer.invoke('get-thumbnail', filePath),

  // Error reporting (renderer → main → ErrorDump)
  reportError: (opts: { error_message: string; stack_trace?: string; function_name?: string; context?: Record<string, unknown> }) =>
    ipcRenderer.invoke('report-error', opts),
});
