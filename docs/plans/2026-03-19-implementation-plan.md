# InDesignRepather Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Electron + TypeScript desktop app that replaces the existing Python browser+server InDesign link repather, with auto-update distribution and an EnneadTabHome landing page.

**Architecture:** Single Electron app with TypeScript throughout. Main process handles InDesign COM automation via Node.js COM bridge. Renderer process shows a 5-stage wizard UI (plain HTML + TS, no framework). Auto-updates via electron-updater proxied through EnneadTabHome. Landing page is a Next.js sub-app in `web/` with its own Vercel project. Auth is handled by EnneadTabHome — no auth in this app.

**Tech Stack:** Electron 34, TypeScript, electron-vite, electron-builder (NSIS), electron-updater, electron-store, @sentry/electron, win32ole (COM bridge), Next.js 15 (landing page)

**Reference:** ContentCatalogRunner (`C:\Users\szhang\github\ennead-llp\ContentCatalogRunner`) uses the same pattern — copy its Electron scaffold, electron-builder.yml, release workflow, and electron-vite config as starting points.

---

## Phase 0: Project Scaffold

### Task 1: Initialize repo and Electron scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `electron.vite.config.ts`
- Create: `electron-builder.yml`
- Create: `.gitignore`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/renderer/index.html`

**Step 1: Initialize npm project**

```bash
cd C:/Users/szhang/github/ennead-llp/InDesignRepather
npm init -y
```

**Step 2: Install Electron dependencies**

```bash
npm install electron-updater electron-store @sentry/electron
npm install -D electron electron-builder electron-vite typescript @types/node vite
```

**Step 3: Create package.json with scripts**

Update `package.json`:
```json
{
  "name": "indesign-repather",
  "version": "0.1.0",
  "description": "Fix broken InDesign links when projects move",
  "author": "Ennead Architects",
  "private": true,
  "main": "dist/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "dist": "electron-vite build && electron-builder --win"
  }
}
```

**Step 4: Create electron.vite.config.ts**

Reference: `ContentCatalogRunner/electron.vite.config.ts`

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
      },
    },
  },
});
```

**Step 5: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": ".",
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*", "electron/**/*"]
}
```

**Step 6: Create electron-builder.yml**

Reference: `ContentCatalogRunner/electron-builder.yml`

```yaml
appId: com.ennead.indesign-repather
productName: InDesign Repather
directories:
  output: release
files:
  - dist/**/*
  - "!node_modules/.cache/**"
  - "!docs/**"
forceCodeSigning: false
win:
  target: nsis
  signAndEditExecutable: false
nsis:
  oneClick: true
  perMachine: false
  allowToChangeInstallationDirectory: false
asar: true
publish:
  provider: generic
  url: https://enneadtab.com/indesign-repather/releases
```

**Step 7: Create minimal electron/main.ts**

```typescript
import { app, BrowserWindow } from 'electron';
import { join } from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'InDesign Repather',
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../../src/renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
```

**Step 8: Create minimal electron/preload.ts**

```typescript
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
});
```

**Step 9: Create minimal src/renderer/index.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>InDesign Repather</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div id="app">
    <h1>InDesign Repather</h1>
    <p>Loading...</p>
  </div>
  <script src="./app.ts" type="module"></script>
</body>
</html>
```

**Step 10: Create .gitignore**

```
node_modules/
dist/
release/
*.exe
.env
```

**Step 11: Verify dev mode launches**

Run: `npm run dev`
Expected: Electron window opens showing "InDesign Repather / Loading..."

**Step 12: Commit**

```bash
git add -A
git commit -m "feat: initialize Electron scaffold with electron-vite"
```

---

## Phase 1: COM Bridge & Core Logic

### Task 2: Spike COM bridge and pick winner

**Files:**
- Create: `src/core/indesign-com.ts`
- Create: `src/shared/types.ts`

**Step 1: Install COM bridge candidates**

```bash
npm install win32ole
```

If `win32ole` fails to install or doesn't work, try:
```bash
npm install edge-js
```

**Step 2: Create shared types**

Create `src/shared/types.ts`:
```typescript
export interface Mapping {
  oldPath: string;
  newPath: string;
}

export interface LinkInfo {
  name: string;
  filePath: string;
  status: 'normal' | 'missing' | 'out-of-date' | 'embedded' | 'inaccessible';
  thumbnailPath?: string;
  newPath?: string;
  newPathExists?: boolean;
}

export interface DocumentInfo {
  name: string;
  path: string;
  links: LinkInfo[];
}

export interface RepathResult {
  document: string;
  totalLinks: number;
  repathedLinks: number;
  failedLinks: number;
  errors: string[];
}

export interface ProgressUpdate {
  stage: 'analyzing' | 'discovering' | 'repathing';
  currentFile: string;
  currentFileIndex: number;
  totalFiles: number;
  currentLink?: number;
  totalLinks?: number;
}

// InDesign COM status codes (Adobe's official 32-bit integer constants)
export const LINK_STATUS = {
  NORMAL: 1852797549,
  OUT_OF_DATE: 1819242340,
  MISSING: 1819109747,
  EMBEDDED: 1282237028,
  INACCESSIBLE: 1818848865,
} as const;

export const INTERACTION_LEVEL = {
  NEVER_INTERACT: 1852403060,
  INTERACT_WITH_ALL: 1852403553,
} as const;
```

**Step 3: Create COM bridge module**

Create `src/core/indesign-com.ts`:
```typescript
import { DocumentInfo, LinkInfo, LINK_STATUS, INTERACTION_LEVEL } from '../shared/types';

// Attempt win32ole first, fall back to edge-js
let createCOMObject: (progId: string) => any;

try {
  const win32ole = require('win32ole');
  createCOMObject = (progId: string) => new win32ole.Object(progId);
} catch {
  throw new Error('No COM bridge available. Install win32ole: npm install win32ole');
}

let app: any = null;

export function connect(): { version: string } {
  try {
    app = createCOMObject('InDesign.Application');
  } catch (e: any) {
    const msg = String(e);
    if (msg.includes('Class not registered')) {
      throw new Error('InDesign is not installed or COM is not registered');
    }
    if (msg.includes('Operation unavailable')) {
      throw new Error('InDesign is not running. Please launch InDesign first.');
    }
    throw new Error(`Failed to connect to InDesign: ${msg}`);
  }

  const version = String(app.Version);
  return { version };
}

export function getOpenDocuments(): { name: string; path: string }[] {
  if (!app) throw new Error('Not connected to InDesign');

  const docs: { name: string; path: string }[] = [];
  const count = app.Documents.Count;
  for (let i = 0; i < count; i++) {
    const doc = app.Documents.Item(i);
    docs.push({
      name: String(doc.Name),
      path: String(doc.FilePath),
    });
  }
  return docs;
}

function mapLinkStatus(statusCode: number): LinkInfo['status'] {
  switch (statusCode) {
    case LINK_STATUS.NORMAL: return 'normal';
    case LINK_STATUS.OUT_OF_DATE: return 'out-of-date';
    case LINK_STATUS.MISSING: return 'missing';
    case LINK_STATUS.EMBEDDED: return 'embedded';
    case LINK_STATUS.INACCESSIBLE: return 'inaccessible';
    default: return 'missing';
  }
}

export function getDocumentLinks(filePath: string): DocumentInfo {
  if (!app) throw new Error('Not connected to InDesign');

  const originalLevel = app.ScriptPreferences.UserInteractionLevel;
  app.ScriptPreferences.UserInteractionLevel = INTERACTION_LEVEL.NEVER_INTERACT;

  try {
    const doc = app.Open(filePath, true);
    const links: LinkInfo[] = [];
    const count = doc.Links.Count;

    for (let i = 0; i < count; i++) {
      try {
        const link = doc.Links.Item(i);
        links.push({
          name: String(link.Name),
          filePath: String(link.FilePath),
          status: mapLinkStatus(Number(link.LinkStatus)),
        });
      } catch {
        // Skip inaccessible links
      }
    }

    return {
      name: String(doc.Name),
      path: filePath,
      links,
    };
  } finally {
    app.ScriptPreferences.UserInteractionLevel = originalLevel;
  }
}

export function relinkAndSave(
  filePath: string,
  linkName: string,
  newPath: string
): void {
  if (!app) throw new Error('Not connected to InDesign');

  const originalLevel = app.ScriptPreferences.UserInteractionLevel;
  app.ScriptPreferences.UserInteractionLevel = INTERACTION_LEVEL.NEVER_INTERACT;

  try {
    // Find the document (may already be open)
    let doc: any = null;
    const count = app.Documents.Count;
    for (let i = 0; i < count; i++) {
      const d = app.Documents.Item(i);
      if (String(d.FilePath) === filePath) {
        doc = d;
        break;
      }
    }
    if (!doc) {
      doc = app.Open(filePath, true);
    }

    // Find and relink
    const linkCount = doc.Links.Count;
    for (let i = 0; i < linkCount; i++) {
      const link = doc.Links.Item(i);
      if (String(link.Name) === linkName) {
        try {
          const fso = createCOMObject('Scripting.FileSystemObject');
          const fileObj = fso.GetFile(newPath);
          link.Relink(fileObj);
        } catch {
          // Fallback: pass string path directly
          link.Relink(newPath);
        }
        break;
      }
    }

    doc.Save();
  } finally {
    app.ScriptPreferences.UserInteractionLevel = originalLevel;
  }
}

export function disconnect(): void {
  app = null;
}
```

**Step 4: Test COM connection manually**

Run with InDesign open:
```bash
npx tsx -e "const { connect } = require('./src/core/indesign-com'); console.log(connect());"
```
Expected: `{ version: "20.x" }` or similar

**Step 5: Commit**

```bash
git add src/core/indesign-com.ts src/shared/types.ts
git commit -m "feat: add InDesign COM bridge with connect, enumerate, and relink"
```

---

### Task 3: Link analyzer and parallel file checking

**Files:**
- Create: `src/core/link-analyzer.ts`

**Step 1: Create link analyzer**

```typescript
import { access } from 'fs/promises';
import { DocumentInfo, LinkInfo, Mapping } from '../shared/types';

export async function checkLinksExist(links: LinkInfo[]): Promise<LinkInfo[]> {
  const results = await Promise.all(
    links.map(async (link) => {
      if (link.status === 'embedded') return link;
      try {
        await access(link.filePath);
        return { ...link, status: link.status } as LinkInfo;
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
  const allLinks = documents.flatMap((doc) => doc.links);
  const linksWithNewPaths = allLinks.filter((l) => l.newPath);

  const existenceMap = new Map<string, boolean>();
  await Promise.all(
    linksWithNewPaths.map(async (link) => {
      if (!link.newPath || existenceMap.has(link.newPath)) return;
      try {
        await access(link.newPath);
        existenceMap.set(link.newPath, true);
      } catch {
        existenceMap.set(link.newPath, false);
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
```

**Step 2: Commit**

```bash
git add src/core/link-analyzer.ts
git commit -m "feat: add link analyzer with preview and parallel file checking"
```

---

### Task 4: Repather engine

**Files:**
- Create: `src/core/repather.ts`

**Step 1: Create unified repath engine**

```typescript
import { Mapping, DocumentInfo, RepathResult, ProgressUpdate } from '../shared/types';
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
      const docInfo = com.getDocumentLinks(filePath);
      const [previewed] = await checkNewPathsExist(
        previewRepath([docInfo], mappings)
      );

      result.totalLinks = previewed.links.length;

      for (let linkIdx = 0; linkIdx < previewed.links.length; linkIdx++) {
        const link = previewed.links[linkIdx];

        onProgress({
          stage: 'repathing',
          currentFile: filePath,
          currentFileIndex: fileIdx,
          totalFiles: filePaths.length,
          currentLink: linkIdx + 1,
          totalLinks: previewed.links.length,
        });

        if (!link.newPath) continue; // No mapping matched

        try {
          com.relinkAndSave(filePath, link.name, link.newPath);
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
```

**Step 2: Commit**

```bash
git add src/core/repather.ts
git commit -m "feat: add unified repath engine with progress reporting"
```

---

### Task 5: Auto-discover mappings

**Files:**
- Create: `src/core/discover.ts`

**Step 1: Create discover module**

```typescript
import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { Mapping } from '../shared/types';

interface DiscoverResult {
  suggestedMappings: Mapping[];
  foundFiles: Map<string, string[]>; // filename → array of found paths
  notFound: string[];
}

async function walkDir(
  dir: string,
  fileIndex: Map<string, string[]>,
  targetNames: Set<string>,
  onProgress?: (scanned: number) => void,
  scanned = { count: 0 }
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Skip inaccessible directories
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, fileIndex, targetNames, onProgress, scanned);
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
  brokenPaths: Map<string, string>, // filename → broken path
  foundPaths: Map<string, string[]> // filename → found paths
): Mapping[] {
  // Count prefix replacements: how many files share the same old→new prefix change
  const prefixCounts = new Map<string, { oldPrefix: string; newPrefix: string; count: number }>();

  for (const [filename, brokenPath] of brokenPaths) {
    const candidates = foundPaths.get(filename.toLowerCase());
    if (!candidates || candidates.length === 0) continue;

    // Use first candidate (most common case: file exists in one place)
    const foundPath = candidates[0];
    const brokenDir = brokenPath.substring(0, brokenPath.lastIndexOf('\\'));
    const foundDir = foundPath.substring(0, foundPath.lastIndexOf('\\'));

    if (brokenDir === foundDir) continue; // Same location, no mapping needed

    const key = `${brokenDir}|||${foundDir}`;
    const existing = prefixCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      prefixCounts.set(key, { oldPrefix: brokenDir, newPrefix: foundDir, count: 1 });
    }
  }

  // Sort by count descending — most common mappings first
  return Array.from(prefixCounts.values())
    .sort((a, b) => b.count - a.count)
    .map(({ oldPrefix, newPrefix }) => ({ oldPath: oldPrefix, newPath: newPrefix }));
}

export async function discoverMappings(
  brokenLinks: { name: string; filePath: string }[],
  searchRoots: string[],
  onProgress?: (found: number) => void
): Promise<DiscoverResult> {
  const targetNames = new Set(brokenLinks.map((l) => basename(l.filePath).toLowerCase()));
  const brokenPathMap = new Map(brokenLinks.map((l) => [basename(l.filePath).toLowerCase(), l.filePath]));

  const fileIndex = new Map<string, string[]>();
  for (const root of searchRoots) {
    await walkDir(root, fileIndex, targetNames, onProgress);
  }

  const notFound = Array.from(targetNames).filter((name) => !fileIndex.has(name));
  const suggestedMappings = extractCommonMappings(brokenPathMap, fileIndex);

  return { suggestedMappings, foundFiles: fileIndex, notFound };
}
```

**Step 2: Commit**

```bash
git add src/core/discover.ts
git commit -m "feat: add auto-discover mappings via recursive file search and prefix diffing"
```

---

## Phase 2: IPC Wiring & Persistence

### Task 6: Wire IPC handlers in main process

**Files:**
- Modify: `electron/main.ts`

**Step 1: Add IPC handlers**

Update `electron/main.ts` to register all IPC handlers:

```typescript
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { readdir, stat } from 'fs/promises';
import Store from 'electron-store';
import * as com from '../src/core/indesign-com';
import { previewRepath, checkNewPathsExist } from '../src/core/link-analyzer';
import { executeRepath } from '../src/core/repather';
import { discoverMappings } from '../src/core/discover';
import { Mapping } from '../src/shared/types';

const store = new Store<{
  mappings: Mapping[];
  windowBounds: { x: number; y: number; width: number; height: number };
  searchRoots: string[];
}>({
  defaults: {
    mappings: [],
    windowBounds: { x: 100, y: 100, width: 960, height: 700 },
    searchRoots: [],
  },
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const bounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    ...bounds,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'InDesign Repather',
  });

  mainWindow.on('close', () => {
    if (mainWindow) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../../src/renderer/index.html'));
  }
}

// --- IPC Handlers ---

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'InDesign Files', extensions: ['indd'] }],
    properties: ['openFile', 'multiSelections'],
  });
  return result.filePaths;
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  if (result.filePaths.length === 0) return [];

  // Recursively find .indd files
  const inddFiles: string[] = [];
  async function scan(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.name.toLowerCase().endsWith('.indd')) {
        inddFiles.push(fullPath);
      }
    }
  }
  await scan(result.filePaths[0]);
  return inddFiles;
});

ipcMain.handle('get-open-documents', () => {
  com.connect();
  return com.getOpenDocuments();
});

ipcMain.handle('analyze-links', async (_event, filePaths: string[]) => {
  com.connect();
  return filePaths.map((fp) => com.getDocumentLinks(fp));
});

ipcMain.handle('discover-mappings', async (_event, brokenLinks, searchRoots) => {
  return discoverMappings(brokenLinks, searchRoots, (found) => {
    mainWindow?.webContents.send('discover-progress', found);
  });
});

ipcMain.handle('preview-repath', async (_event, filePaths: string[], mappings: Mapping[]) => {
  com.connect();
  const docs = filePaths.map((fp) => com.getDocumentLinks(fp));
  const previewed = previewRepath(docs, mappings);
  return checkNewPathsExist(previewed);
});

ipcMain.handle('execute-repath', async (_event, filePaths: string[], mappings: Mapping[]) => {
  com.connect();
  return executeRepath(filePaths, mappings, (update) => {
    mainWindow?.webContents.send('repath-progress', update);
    if (mainWindow) {
      mainWindow.setProgressBar(
        (update.currentFileIndex + (update.currentLink ?? 0) / (update.totalLinks ?? 1)) / update.totalFiles
      );
    }
  });
});

ipcMain.handle('load-mappings', () => store.get('mappings'));
ipcMain.handle('save-mappings', (_event, mappings: Mapping[]) => store.set('mappings', mappings));
ipcMain.handle('load-search-roots', () => store.get('searchRoots'));
ipcMain.handle('save-search-roots', (_event, roots: string[]) => store.set('searchRoots', roots));

// --- App Lifecycle ---

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
```

**Step 2: Verify IPC works**

Run: `npm run dev`
Expected: App launches, no console errors. IPC handlers registered (test via DevTools console if needed).

**Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: wire IPC handlers for file selection, COM, discover, repath, and persistence"
```

---

## Phase 3: Renderer UI (5-Stage Wizard)

### Task 7: Wizard scaffold and stage navigation

**Files:**
- Create: `src/renderer/app.ts`
- Create: `src/renderer/styles.css`
- Modify: `src/renderer/index.html`

**Step 1: Create index.html with wizard structure**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>InDesign Repather</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <header>
    <h1>InDesign Repather</h1>
    <span class="brand">Ennead Architects</span>
  </header>

  <nav class="stage-bar">
    <div class="stage" data-stage="1">1. Files</div>
    <div class="stage" data-stage="2">2. Discover</div>
    <div class="stage" data-stage="3">3. Rules</div>
    <div class="stage" data-stage="4">4. Preview</div>
    <div class="stage" data-stage="5">5. Execute</div>
  </nav>

  <main>
    <section id="stage-1" class="stage-content"></section>
    <section id="stage-2" class="stage-content hidden"></section>
    <section id="stage-3" class="stage-content hidden"></section>
    <section id="stage-4" class="stage-content hidden"></section>
    <section id="stage-5" class="stage-content hidden"></section>
  </main>

  <footer>
    <button id="btn-back" class="hidden">Back</button>
    <span class="spacer"></span>
    <button id="btn-next" disabled>Next</button>
  </footer>

  <script src="./app.ts" type="module"></script>
</body>
</html>
```

**Step 2: Create styles.css**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #1a1a1a;
  color: #e0e0e0;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #222;
  border-bottom: 1px solid #333;
}

header h1 { font-size: 16px; font-weight: 600; }
.brand { font-size: 12px; color: #888; }

.stage-bar {
  display: flex;
  gap: 0;
  background: #222;
  border-bottom: 1px solid #333;
}

.stage-bar .stage {
  flex: 1;
  text-align: center;
  padding: 8px;
  font-size: 13px;
  color: #666;
  border-bottom: 2px solid transparent;
}

.stage-bar .stage.active {
  color: #fff;
  border-bottom-color: #fff;
}

.stage-bar .stage.completed {
  color: #888;
}

main {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.stage-content { display: block; }
.stage-content.hidden { display: none; }

footer {
  display: flex;
  padding: 12px 20px;
  background: #222;
  border-top: 1px solid #333;
  gap: 12px;
}

.spacer { flex: 1; }

button {
  padding: 8px 20px;
  background: #333;
  color: #e0e0e0;
  border: 1px solid #555;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

button:hover { background: #444; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
button.primary { background: #fff; color: #000; border-color: #fff; }
button.primary:hover { background: #ddd; }

.hidden { display: none !important; }

/* Mapping table */
.mapping-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
.mapping-table th { text-align: left; padding: 8px; color: #888; font-size: 12px; border-bottom: 1px solid #333; }
.mapping-table td { padding: 6px 8px; border-bottom: 1px solid #222; }
.mapping-table input { width: 100%; background: #2a2a2a; border: 1px solid #444; color: #e0e0e0; padding: 6px 8px; border-radius: 3px; font-size: 13px; }
.mapping-table .btn-folder { padding: 4px 8px; font-size: 12px; }
.mapping-table .btn-remove { background: none; border: none; color: #666; cursor: pointer; font-size: 16px; padding: 4px; }
.mapping-table .btn-remove:hover { color: #ff4444; }

/* Link preview table */
.link-table { width: 100%; border-collapse: collapse; }
.link-table th { text-align: left; padding: 8px; color: #888; font-size: 12px; border-bottom: 1px solid #333; }
.link-table td { padding: 6px 8px; border-bottom: 1px solid #222; vertical-align: middle; }
.link-table .thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 3px; background: #2a2a2a; }
.link-table .thumb-missing { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: #2a2a2a; border-radius: 3px; color: #666; font-size: 18px; }

.status-ok { color: #4caf50; }
.status-missing { color: #f44336; }
.status-skip { color: #666; }

/* Progress */
.progress-bar { width: 100%; height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin: 8px 0; }
.progress-fill { height: 100%; background: #fff; transition: width 0.2s; }
.file-status { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; }

/* File selection */
.file-options { display: flex; gap: 16px; margin: 20px 0; }
.file-option { flex: 1; padding: 20px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; cursor: pointer; text-align: center; }
.file-option:hover { border-color: #888; }
.file-option h3 { font-size: 14px; margin-bottom: 6px; }
.file-option p { font-size: 12px; color: #888; }

.file-list { margin-top: 16px; }
.file-list .file-item { padding: 6px 12px; font-size: 13px; color: #ccc; }

.summary-bar { padding: 12px; background: #2a2a2a; border-radius: 4px; margin: 12px 0; font-size: 13px; display: flex; gap: 16px; }
```

**Step 3: Create app.ts with stage navigation**

```typescript
declare global {
  interface Window {
    api: {
      selectFiles: () => Promise<string[]>;
      selectFolder: () => Promise<string[]>;
      getOpenDocuments: () => Promise<{ name: string; path: string }[]>;
      analyzeLinks: (filePaths: string[]) => Promise<any[]>;
      discoverMappings: (brokenLinks: any[], searchRoots: string[]) => Promise<any>;
      previewRepath: (filePaths: string[], mappings: any[]) => Promise<any[]>;
      executeRepath: (filePaths: string[], mappings: any[]) => Promise<any[]>;
      loadMappings: () => Promise<any[]>;
      saveMappings: (mappings: any[]) => Promise<void>;
      onProgress: (callback: (data: any) => void) => void;
    };
  }
}

let currentStage = 1;
let selectedFiles: string[] = [];
let mappings: { oldPath: string; newPath: string }[] = [];
let previewResults: any[] = [];

function showStage(stage: number) {
  currentStage = stage;
  document.querySelectorAll('.stage-content').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`stage-${stage}`)?.classList.remove('hidden');

  document.querySelectorAll('.stage-bar .stage').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === stage);
    el.classList.toggle('completed', i + 1 < stage);
  });

  const backBtn = document.getElementById('btn-back') as HTMLButtonElement;
  const nextBtn = document.getElementById('btn-next') as HTMLButtonElement;

  backBtn.classList.toggle('hidden', stage === 1);

  if (stage === 4) {
    nextBtn.textContent = 'Execute';
    nextBtn.classList.add('primary');
  } else if (stage === 5) {
    nextBtn.classList.add('hidden');
  } else {
    nextBtn.textContent = stage === 2 ? 'Skip / Next' : 'Next';
    nextBtn.classList.remove('primary', 'hidden');
  }
}

document.getElementById('btn-next')?.addEventListener('click', () => {
  if (currentStage < 5) showStage(currentStage + 1);
});

document.getElementById('btn-back')?.addEventListener('click', () => {
  if (currentStage > 1) showStage(currentStage - 1);
});

// Initialize
showStage(1);
```

**Step 4: Verify wizard navigation**

Run: `npm run dev`
Expected: Dark-themed wizard with 5 stages, Back/Next navigation works.

**Step 5: Commit**

```bash
git add src/renderer/
git commit -m "feat: add wizard scaffold with 5-stage navigation and dark theme"
```

---

### Task 8: Stage 1 — File selection UI

**Files:**
- Create: `src/renderer/stages/select-files.ts`
- Modify: `src/renderer/app.ts`

**Step 1: Create select-files.ts**

```typescript
export function renderSelectFiles(container: HTMLElement, onFilesSelected: (files: string[]) => void) {
  container.innerHTML = `
    <h2>Select InDesign Documents</h2>
    <div class="file-options">
      <div class="file-option" id="opt-pick-files">
        <h3>Pick Documents</h3>
        <p>Select specific .indd files</p>
      </div>
      <div class="file-option" id="opt-pick-folder">
        <h3>Pick Folder</h3>
        <p>All .indd files in a folder</p>
      </div>
      <div class="file-option" id="opt-open-docs">
        <h3>Open in InDesign</h3>
        <p>Grab currently open documents</p>
      </div>
    </div>
    <div class="file-list" id="selected-files"></div>
  `;

  const fileListEl = container.querySelector('#selected-files')!;

  function updateFileList(files: string[]) {
    if (files.length === 0) {
      fileListEl.innerHTML = '<p style="color: #666">No files selected</p>';
      return;
    }
    fileListEl.innerHTML = files
      .map((f) => {
        const name = f.split('\\').pop() || f;
        return `<div class="file-item">${name}</div>`;
      })
      .join('');
    onFilesSelected(files);
  }

  container.querySelector('#opt-pick-files')?.addEventListener('click', async () => {
    const files = await window.api.selectFiles();
    updateFileList(files);
  });

  container.querySelector('#opt-pick-folder')?.addEventListener('click', async () => {
    const files = await window.api.selectFolder();
    updateFileList(files);
  });

  container.querySelector('#opt-open-docs')?.addEventListener('click', async () => {
    try {
      const docs = await window.api.getOpenDocuments();
      updateFileList(docs.map((d) => d.path));
    } catch (e: any) {
      fileListEl.innerHTML = `<p style="color: #f44336">${e.message || 'Failed to connect to InDesign'}</p>`;
    }
  });
}
```

**Step 2: Wire into app.ts**

Add import and call `renderSelectFiles` in the initialization.

**Step 3: Commit**

```bash
git add src/renderer/stages/select-files.ts src/renderer/app.ts
git commit -m "feat: add Stage 1 file selection with pick files, folder, and open docs"
```

---

### Task 9: Stage 2 — Discover mappings UI

**Files:**
- Create: `src/renderer/stages/discover.ts`

**Step 1: Create discover.ts UI**

Renders the discover interface: search root folder pickers, scan button, suggested mappings with checkboxes, accept button. Shows progress during scan. Skip button bypasses to Stage 3.

**Step 2: Commit**

```bash
git add src/renderer/stages/discover.ts
git commit -m "feat: add Stage 2 discover mappings UI with search roots and suggestions"
```

---

### Task 10: Stage 3 — Mapping rules table UI

**Files:**
- Create: `src/renderer/stages/define-rules.ts`

**Step 1: Create define-rules.ts**

Renders the mapping table with add/remove rows, folder picker buttons, text input for paths. Loads persisted mappings on init. Merges discovered mappings from Stage 2. Saves on every change.

**Step 2: Commit**

```bash
git add src/renderer/stages/define-rules.ts
git commit -m "feat: add Stage 3 mapping rules table with persistence and folder pickers"
```

---

### Task 11: Stage 4 — Preview with thumbnails

**Files:**
- Create: `src/renderer/stages/preview.ts`

**Step 1: Create preview.ts**

Calls `preview-repath` IPC. Renders link table grouped by document with:
- 48px thumbnail (native image for raster, placeholder for others)
- Link name, old→new path change, existence status
- Summary bar with counts
- Click-to-enlarge popover

**Step 2: Add thumbnail IPC handler**

Add to `electron/main.ts`:
```typescript
ipcMain.handle('get-thumbnail', async (_event, filePath: string) => {
  try {
    const img = nativeImage.createThumbnailFromPath(filePath, { width: 48, height: 48 });
    return img.toDataURL();
  } catch {
    return null; // Missing or unsupported format
  }
});
```

**Step 3: Commit**

```bash
git add src/renderer/stages/preview.ts electron/main.ts
git commit -m "feat: add Stage 4 preview with thumbnails, grouped by document"
```

---

### Task 12: Stage 5 — Execute with progress

**Files:**
- Create: `src/renderer/stages/execute.ts`

**Step 1: Create execute.ts**

Calls `execute-repath` IPC. Shows per-file progress bars, link counts, cancel button. Completion summary with "New Session" button. Listens to `repath-progress` events for real-time updates.

**Step 2: Commit**

```bash
git add src/renderer/stages/execute.ts
git commit -m "feat: add Stage 5 execute with progress bars and completion summary"
```

---

## Phase 4: Polish & Production

### Task 13: Version display in app

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

**Step 1: Expose app version via IPC**

Add to `electron/preload.ts`:
```typescript
getAppVersion: () => ipcRenderer.invoke('get-app-version'),
```

Add to `electron/main.ts`:
```typescript
ipcMain.handle('get-app-version', () => app.getVersion());
```

**Step 2: Display version in footer**

Update `src/renderer/index.html` footer to include a version span:
```html
<span id="app-version" class="version-label"></span>
```

On init in `app.ts`, fetch and display:
```typescript
window.api.getAppVersion().then((v: string) => {
  document.getElementById('app-version')!.textContent = `v${v}`;
});
```

The version comes from `package.json` version field, which is bumped via `npm version patch/minor/major` before each release. This gives tech support a concrete version to reference.

**Step 3: Commit**

```bash
git add electron/main.ts electron/preload.ts src/renderer/
git commit -m "feat: display app version in footer for tech support"
```

---

### Task 14: Generate app icon

**Files:**
- Create: `assets/icon.png` (256x256, used by electron-builder for .ico generation)
- Create: `assets/icon.svg` (source vector)
- Modify: `electron-builder.yml`

**Step 1: Generate icon**

Create an SVG icon representing link/chain + repair concept. Monochrome, professional, matches Ennead branding. Export to `assets/icon.png` at 256x256.

Electron-builder auto-generates `.ico` from the PNG.

**Step 2: Configure icon in electron-builder.yml**

Add to `electron-builder.yml`:
```yaml
win:
  icon: assets/icon.png
```

**Step 3: Reference icon in BrowserWindow**

Update `electron/main.ts`:
```typescript
mainWindow = new BrowserWindow({
  icon: join(__dirname, '../../assets/icon.png'),
  // ...existing options
});
```

**Step 4: Commit**

```bash
git add assets/ electron-builder.yml electron/main.ts
git commit -m "feat: add app icon for installer and window"
```

---

### Task 15: Sentry error reporting

**Files:**
- Modify: `electron/main.ts`
- Modify: `src/renderer/app.ts`

**Step 1: Initialize Sentry in main process**

Add to top of `electron/main.ts`:
```typescript
import * as Sentry from '@sentry/electron/main';
Sentry.init({ dsn: process.env.SENTRY_DSN || '' });
```

**Step 2: Initialize Sentry in renderer**

Add to top of `src/renderer/app.ts`:
```typescript
import * as Sentry from '@sentry/electron/renderer';
Sentry.init({});
```

**Step 3: Commit**

```bash
git add electron/main.ts src/renderer/app.ts
git commit -m "feat: add Sentry error reporting for main and renderer processes"
```

---

### Task 16: Auto-updater

**Files:**
- Modify: `electron/main.ts`

**Step 1: Add auto-update check on launch**

```typescript
import { autoUpdater } from 'electron-updater';

app.whenReady().then(() => {
  createWindow();
  autoUpdater.checkForUpdatesAndNotify();
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded. Restart to apply the update.',
    buttons: ['Restart', 'Later'],
  }).then((result) => {
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
});
```

**Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add auto-updater with restart prompt"
```

---

### Task 17: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create release.yml**

Reference: `ContentCatalogRunner/.github/workflows/release.yml`

```yaml
name: Release
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - name: Build Electron app
        run: npx electron-vite build
      - name: Package and publish
        run: npx electron-builder --win --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: release/*.exe
```

**Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release workflow for Windows builds"
```

---

## Phase 5: Landing Page & EnneadTabHome Integration

### Task 18: Next.js landing page

**Files:**
- Create: `web/package.json`
- Create: `web/next.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`
- Create: `web/app/guide/page.tsx`
- Create: `web/app/changelog/page.tsx`
- Create: `web/app/releases/[...path]/route.ts`

**Step 1: Initialize web/ sub-project**

```bash
cd web
npm init -y
npm install next react react-dom
npm install -D @types/node @types/react typescript
```

**Step 2: Create next.config.ts with basePath**

```typescript
import type { NextConfig } from 'next';

const config: NextConfig = {
  basePath: '/indesign-repather',
};

export default config;
```

**Step 3: Create landing page**

`web/app/page.tsx` — Hero section with download button (links to latest GitHub Release), one-line description, version badge, file size.

**Step 4: Create getting started guide**

`web/app/guide/page.tsx` — 5-step walkthrough with placeholder screenshot slots.

**Step 5: Create changelog**

`web/app/changelog/page.tsx` — Version history (starts with v0.1.0).

**Step 6: Create releases proxy**

`web/app/releases/[...path]/route.ts` — Proxies requests to GitHub Releases API using server-side `GITHUB_TOKEN`. This is how the auto-updater fetches `latest.yml` without embedding a PAT in the binary.

```typescript
import { NextRequest, NextResponse } from 'next/server';

const GITHUB_OWNER = 'ennead-llp';
const GITHUB_REPO = 'InDesignRepather';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${path.join('/')}`;

  const response = await fetch(githubUrl, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/octet-stream',
    },
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(response.body, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Disposition': response.headers.get('Content-Disposition') || '',
    },
  });
}
```

**Step 7: Commit**

```bash
git add web/
git commit -m "feat: add Next.js landing page with download, guide, changelog, and releases proxy"
```

---

### Task 19: EnneadTabHome proxy rewrites

**Files:**
- Modify: `C:\Users\szhang\github\ennead-llp\EnneadTabHome\next.config.js`

**Step 1: Add indesignRepather rewrite config**

Add to the sub-app config in `next.config.js`:
```javascript
indesignRepather: {
  target: 'https://indesign-repather.vercel.app',
  rewrites: [
    { source: '/indesign-repather', destination: '/indesign-repather' },
    { source: '/indesign-repather/:path*', destination: '/indesign-repather/:path*' },
  ]
}
```

**Step 2: Commit (in EnneadTabHome repo)**

```bash
cd C:/Users/szhang/github/ennead-llp/EnneadTabHome
git add next.config.js
git commit -m "feat: add proxy rewrites for InDesign Repather sub-app"
```

---

### Task 20: Create GitHub repo and first release

**Step 1: Initialize git in InDesignRepather**

```bash
cd C:/Users/szhang/github/ennead-llp/InDesignRepather
git init -b main
git add -A
git commit -m "feat: InDesign Repather v0.1.0 — standalone Electron app"
```

**Step 2: Create private repo on GitHub**

```bash
gh repo create ennead-llp/InDesignRepather --private --source=. --push
```

**Step 3: Create Vercel project for landing page**

Deploy `web/` directory as a Vercel project with:
- Root directory: `web`
- Framework: Next.js
- Environment variable: `GITHUB_TOKEN` (fine-grained PAT with contents:read on InDesignRepather)

**Step 4: Tag first release**

```bash
npm version 0.1.0
git push --tags
```

Expected: GitHub Actions builds `.exe` and publishes to Releases.

**Step 5: Verify auto-update proxy**

```bash
curl https://enneadtab.com/indesign-repather/releases/latest.yml
```

Expected: Returns YAML with version and download URL.

---

## Task Dependency Summary

```
Phase 0: Task 1 (scaffold)
Phase 1: Task 2 (COM spike) → Task 3 (analyzer) → Task 4 (repather) → Task 5 (discover)
Phase 2: Task 6 (IPC wiring) — depends on Phase 1
Phase 3: Task 7 (wizard) → Tasks 8-12 (stages) — depends on Task 6
Phase 4: Task 13 (version) → Task 14 (icon) → Task 15 (Sentry) → Task 16 (auto-update) → Task 17 (CI/CD)
Phase 5: Tasks 18-20 (landing page + proxy + deploy) — can run parallel to Phase 4
```

**Total: 20 tasks across 6 phases**
