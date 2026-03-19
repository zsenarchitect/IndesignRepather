import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron';
import { join } from 'path';
import { readdir } from 'fs/promises';
import * as Sentry from '@sentry/electron/main';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import * as com from '../src/core/indesign-com';
import { previewRepath, checkNewPathsExist } from '../src/core/link-analyzer';
import { executeRepath } from '../src/core/repather';
import { discoverMappings } from '../src/core/discover';
import { detectMultipleVersions } from '../src/core/indd-version';
import type { Mapping } from '../src/shared/types';

// ---------------------------------------------------------------------------
// Sentry error reporting
// ---------------------------------------------------------------------------
Sentry.init({ dsn: process.env.SENTRY_DSN || '' });

// ---------------------------------------------------------------------------
// Persistent settings
// ---------------------------------------------------------------------------
const store = new Store<{
  mappings: Mapping[];
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  searchRoots: string[];
}>({
  defaults: {
    mappings: [],
    windowBounds: null,
    searchRoots: [],
  },
});

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const rawSaved = store.get('windowBounds');
  const saved =
    rawSaved &&
    rawSaved.width >= 400 &&
    rawSaved.height >= 300 &&
    rawSaved.width <= 4000 &&
    rawSaved.height <= 3000
      ? rawSaved
      : null;

  mainWindow = new BrowserWindow({
    width: saved?.width ?? 960,
    height: saved?.height ?? 700,
    x: saved?.x,
    y: saved?.y,
    icon: join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'InDesign Repather',
  });

  // Save window bounds on close
  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', bounds);
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function findInddFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(d: string) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        await walk(full);
      } else if (entry.name.toLowerCase().endsWith('.indd')) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

// File selection ----------------------------------------------------------
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select InDesign Documents',
    filters: [{ name: 'InDesign Documents', extensions: ['indd'] }],
    properties: ['openFile', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Folder Containing InDesign Documents',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return findInddFiles(result.filePaths[0]);
});

ipcMain.handle('select-folder-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
});

// InDesign COM ------------------------------------------------------------
ipcMain.handle('connect-indesign', (_event, version?: string) => {
  try {
    const result = com.connect(version);
    return { data: result };
  } catch (e: any) {
    return { error: String(e.message || e) };
  }
});

ipcMain.handle('launch-indesign', async () => {
  const { exec } = require('child_process');
  const { existsSync } = require('fs');
  const paths = [
    'C:\\Program Files\\Adobe\\Adobe InDesign 2025\\InDesign.exe',
    'C:\\Program Files\\Adobe\\Adobe InDesign 2024\\InDesign.exe',
    'C:\\Program Files\\Adobe\\Adobe InDesign 2023\\InDesign.exe',
    'C:\\Program Files\\Adobe\\Adobe InDesign CC 2022\\InDesign.exe',
  ];

  const found = paths.find((p: string) => existsSync(p));
  if (!found) return { error: 'InDesign not found. Please launch it manually.' };

  exec(`"${found}"`);
  // Wait for InDesign to initialize
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return { data: { launched: true, path: found } };
});

ipcMain.handle('get-open-documents', () => {
  try {
    com.connect();
    return { data: com.getOpenDocuments() };
  } catch (e: any) {
    return { error: String(e.message || e) };
  }
});

ipcMain.handle('analyze-links', async (_event, filePaths: string[]) => {
  try {
    com.connect();
    const results = [];
    for (let i = 0; i < filePaths.length; i++) {
      mainWindow?.webContents.send('analyze-progress', {
        currentFile: filePaths[i],
        currentIndex: i,
        totalFiles: filePaths.length,
      });
      results.push(com.getDocumentLinks(filePaths[i]));
    }
    return { data: results };
  } catch (e: any) {
    return { error: String(e.message || e) };
  }
});

// Discover ----------------------------------------------------------------
ipcMain.handle(
  'discover-mappings',
  async (_event, brokenLinks: { name: string; filePath: string }[], searchRoots: string[]) => {
    const result = await discoverMappings(brokenLinks, searchRoots, (found) => {
      mainWindow?.webContents.send('discover-progress', { found });
    });
    // Convert Map to plain object for IPC serialization
    return {
      suggestedMappings: result.suggestedMappings,
      foundFiles: Object.fromEntries(result.foundFiles),
      notFound: result.notFound,
      totalScanned: result.totalScanned,
    };
  }
);

// Preview & Execute -------------------------------------------------------
ipcMain.handle(
  'preview-repath',
  async (_event, filePaths: string[], mappings: Mapping[]) => {
    try {
      com.connect();
      const documents = filePaths.map((fp) => com.getDocumentLinks(fp));
      const previewed = previewRepath(documents, mappings);
      return { data: checkNewPathsExist(previewed) };
    } catch (e: any) {
      return { error: String(e.message || e) };
    }
  }
);

ipcMain.handle(
  'execute-repath',
  async (_event, filePaths: string[], mappings: Mapping[]) => {
    try {
      com.connect();
      const results = await executeRepath(filePaths, mappings, (update) => {
        mainWindow?.webContents.send('repath-progress', update);
        // Update taskbar progress
        if (mainWindow && update.totalFiles > 0) {
          const progress = (update.currentFileIndex + 1) / update.totalFiles;
          mainWindow.setProgressBar(progress);
        }
      });
      // Clear taskbar progress when done
      mainWindow?.setProgressBar(-1);
      return { data: results };
    } catch (e: any) {
      mainWindow?.setProgressBar(-1);
      return { error: String(e.message || e) };
    }
  }
);

// Persistence -------------------------------------------------------------
ipcMain.handle('load-mappings', () => store.get('mappings'));
ipcMain.handle('save-mappings', (_event, mappings: Mapping[]) => {
  store.set('mappings', mappings);
});

ipcMain.handle('load-search-roots', () => store.get('searchRoots'));
ipcMain.handle('save-search-roots', (_event, roots: string[]) => {
  store.set('searchRoots', roots);
});

// Export/Import rules -----------------------------------------------------
ipcMain.handle('export-rules', async (_event, data: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    defaultPath: 'indesign-repather-rules.json',
  });
  if (!result.canceled && result.filePath) {
    const { writeFile } = await import('fs/promises');
    await writeFile(result.filePath, data, 'utf-8');
  }
});

ipcMain.handle('import-rules', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const { readFile } = await import('fs/promises');
  return readFile(result.filePaths[0], 'utf-8');
});

// File version detection ---------------------------------------------------
ipcMain.handle('detect-file-versions', async (_event, filePaths: string[]) => {
  const results = await detectMultipleVersions(filePaths);
  // Convert Map to plain object for IPC
  const obj: Record<string, any> = {};
  for (const [path, info] of results) {
    obj[path] = info;
  }
  return { data: obj };
});

// Utilities ---------------------------------------------------------------
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-thumbnail', async (_event, filePath: string) => {
  try {
    const image = await nativeImage.createThumbnailFromPath(filePath, { width: 48, height: 48 });
    return image.toDataURL();
  } catch {
    return null;
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();

  // Auto-updater
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-downloaded', () => {
    if (!mainWindow) return;
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'A new version has been downloaded. Restart to apply the update.',
        buttons: ['Restart', 'Later'],
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
