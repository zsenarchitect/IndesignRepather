import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // File selection
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // InDesign COM
  getOpenDocuments: () => ipcRenderer.invoke('get-open-documents'),
  analyzeLinks: (filePaths: string[]) => ipcRenderer.invoke('analyze-links', filePaths),

  // Discover
  discoverMappings: (brokenLinks: { name: string; filePath: string }[], searchRoots: string[]) =>
    ipcRenderer.invoke('discover-mappings', brokenLinks, searchRoots),
  onDiscoverProgress: (callback: (data: { found: number }) => void) =>
    ipcRenderer.on('discover-progress', (_event, data) => callback(data)),

  // Preview & Execute
  previewRepath: (filePaths: string[], mappings: { oldPath: string; newPath: string }[]) =>
    ipcRenderer.invoke('preview-repath', filePaths, mappings),
  executeRepath: (filePaths: string[], mappings: { oldPath: string; newPath: string }[]) =>
    ipcRenderer.invoke('execute-repath', filePaths, mappings),
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

  // Utilities
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getThumbnail: (filePath: string) => ipcRenderer.invoke('get-thumbnail', filePath),
});
