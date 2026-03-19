import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getOpenDocuments: () => ipcRenderer.invoke('get-open-documents'),
  analyzeLinks: (filePaths: string[]) => ipcRenderer.invoke('analyze-links', filePaths),
  discoverMappings: (brokenLinks: string[], searchRoots: string[]) => ipcRenderer.invoke('discover-mappings', brokenLinks, searchRoots),
  previewRepath: (filePaths: string[], mappings: { oldPath: string; newPath: string }[]) => ipcRenderer.invoke('preview-repath', filePaths, mappings),
  executeRepath: (filePaths: string[], mappings: { oldPath: string; newPath: string }[]) => ipcRenderer.invoke('execute-repath', filePaths, mappings),
  loadMappings: () => ipcRenderer.invoke('load-mappings'),
  saveMappings: (mappings: { oldPath: string; newPath: string }[]) => ipcRenderer.invoke('save-mappings', mappings),
  onProgress: (callback: (data: any) => void) => ipcRenderer.on('repath-progress', (_event, data) => callback(data)),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
