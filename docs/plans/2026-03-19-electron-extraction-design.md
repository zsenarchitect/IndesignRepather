# InDesignRepather — Standalone Electron App Design

**Date:** 2026-03-19
**Status:** Approved
**Goal:** Extract InDesignRepather from EnneadTab-OS monorepo into a standalone Electron + TypeScript desktop app with auto-update distribution and an EnneadTabHome landing page.

---

## Motivation

1. **Isolation & distribution** — decouple from the EnneadTab-OS monorepo; own repo, own release cycle
2. **Better dev experience** — single TypeScript codebase (no Python dependency)
3. **Better UX** — native desktop app replaces fragile browser + localhost server pattern (no port conflicts, no firewall issues, native file dialogs)
4. **Auto-updates** — users always run the latest version without manual re-downloads

## Architecture

### Repo Structure

```
ennead-llp/InDesignRepather/     # New standalone repo
├── electron/
│   ├── main.ts                  # Window management, IPC handlers, auto-updater
│   ├── preload.ts               # Context bridge (renderer ↔ main IPC)
│   └── auth-window.ts           # Future: Ennead auth if needed
├── src/
│   ├── core/
│   │   ├── indesign-com.ts      # COM bridge to InDesign (connect, enumerate, repath)
│   │   ├── link-analyzer.ts     # Link status detection, parallel file existence checks
│   │   ├── repather.ts          # Repath logic (single function for any number of files)
│   │   └── discover.ts          # Auto-discover mappings via file search
│   ├── renderer/
│   │   ├── index.html           # Main UI entry
│   │   ├── app.ts               # Staged wizard UI logic
│   │   ├── stages/
│   │   │   ├── select-files.ts  # Stage 1: file/folder/open-doc selection
│   │   │   ├── discover.ts      # Stage 2: auto-discover mappings (optional)
│   │   │   ├── define-rules.ts  # Stage 3: mapping table editor
│   │   │   ├── preview.ts       # Stage 4: dry run with thumbnails
│   │   │   └── execute.ts       # Stage 5: progress + results
│   │   └── styles.css           # Ennead branding, monochrome only
│   └── shared/
│       └── types.ts             # Link, Document, Mapping, RepathResult interfaces
├── web/                         # Next.js landing page (own Vercel project)
│   ├── app/
│   │   ├── page.tsx             # Landing: download button, version, description
│   │   ├── changelog/page.tsx   # Version history
│   │   ├── guide/page.tsx       # Getting started with screenshots
│   │   └── releases/[...path]/route.ts  # GitHub Releases proxy (server-side GITHUB_TOKEN)
│   ├── next.config.js           # basePath: '/indesign-repather'
│   └── package.json
├── electron-builder.yml         # NSIS installer, auto-update config
├── tsconfig.json
├── package.json                 # Root workspace
└── .github/workflows/
    └── build-electron.yml       # Build .exe on push, publish to GitHub Releases
```

### Technology Stack

| Component | Technology |
|-----------|-----------|
| Desktop app | Electron |
| Language | TypeScript (entire codebase) |
| InDesign COM | `edge-js` or `win32ole` (spike both, pick winner) |
| UI | Plain HTML + TypeScript (no framework — single-page tool) |
| Persistence | `electron-store` (mappings, window bounds, preferences) |
| Error reporting | Sentry (`@sentry/electron`) |
| Auto-update | `electron-updater` via EnneadTabHome proxy |
| Landing page | Next.js (own Vercel project at `indesign-repather.vercel.app`) |
| Installer | NSIS via electron-builder |
| CI/CD | GitHub Actions |

---

## User Workflow — 5-Stage Wizard

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 1. Files │ →  │2. Discover│ →  │ 3. Rules │ →  │4. Preview│ →  │5. Execute│
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                 (optional)
```

### Stage 1: Select Files

Three methods to get InDesign files:
- **Pick Documents** — native `dialog.showOpenDialog()` with `.indd` filter, multi-select
- **Pick Folder** — native folder dialog, recursively finds all `.indd` files
- **Scan Open Documents** — COM query to grab documents currently open in InDesign

All three produce the same output: a list of `.indd` file paths.

### Stage 2: Discover Mappings (Optional, Skippable)

For users who don't know where files moved:

1. Collect all broken link filenames from selected documents
2. User provides 1+ search root folders (network drives, project folders)
3. App searches for matching filenames (Windows Search Index via `ISearchQueryHelper` COM, fallback to recursive `fs.readdir`)
4. Groups found files by **common prefix diff** — e.g., if 15 files all moved from `\\server\2024\Assets\*` to `\\server\2025\Assets\*`, that becomes one suggested mapping row
5. User reviews, checks/unchecks, edits suggestions
6. Accepted suggestions populate the Rules table (Stage 3)

**Edge cases:**
- Same filename in multiple locations → show all candidates, user picks
- Renamed files → no auto-match, stays in "not found" for manual handling
- Windows Search Index unavailable → recursive scan (slower but works)

Skip button goes directly to Stage 3 for users who know their mappings.

### Stage 3: Define Mapping Rules

Flex table of old → new folder mappings:

| | Old Path | New Path |
|---|----------|----------|
| ✕ | `\\server\2024\Assets` [📁] | `\\server\2025\Assets` [📁] |
| ✕ | `C:\Archive\Drawings` [📁] | `D:\Active\Drawings` [📁] |
| [+ Add Row] | | |

- [📁] buttons open native Windows folder picker
- Users can also paste/type paths directly (UNC paths, mapped drives)
- ✕ removes a row
- Mappings apply **top to bottom, first match wins** per link
- **Persisted across sessions** via `electron-store`
- Auto-discovered rules (Stage 2) and manually added rules are identical in the table

### Stage 4: Dry Run Preview (with Thumbnails)

Shows every link across all selected files with:

| Thumb | Link | Change | Status |
|-------|------|--------|--------|
| [48px preview] | `header_v3.jpg` | `\2024\` → `\2025\` | ✓ exists |
| [48px preview] | `floor_plan.png` | `\2024\` → `\2025\` | ✗ missing |
| [gray placeholder] | `logo.ai` | no match | — skipped |

**Thumbnails:**

| File type | Source |
|-----------|--------|
| JPG, PNG, GIF, BMP, WEBP | `nativeImage.createFromPath()` resized to 48x48 |
| AI, EPS, PSD | Windows Shell thumbnail (`IExtractImage` COM) |
| PDF | Shell thumbnail or `pdf.js` first page |
| Missing files | Gray placeholder with ✗ |
| Embedded links | Dimmed with "embedded" badge |

- Lazy-loaded (visible rows first)
- Cached in memory for session
- **Click to enlarge** → popover with ~300px preview, full path, file size, modified date

**Summary bar:** `38 will repath · ✓ 34 exist · ✗ 4 missing`

### Stage 5: Execute

- Per-file progress with link count
- Windows taskbar progress bar
- Cancel button to abort mid-batch
- Completion summary with native notification
- "New Session" button to restart at Stage 1

---

## COM Integration

6 core operations (mapped from existing Python `backend.py`):

| Operation | Implementation |
|-----------|---------------|
| Connect to InDesign | `edge.func()` or `win32ole.createObject('InDesign.Application.2025')` |
| Detect version | Windows registry scan via `regedit` npm package |
| Enumerate links | `doc.Links.Item(i)` COM iteration |
| Preview repath | Pure TypeScript string replacement (no COM needed) |
| Execute repath | `link.Relink(newPath)` COM call |
| Save document | `doc.Save()` COM call |

**Parallel file checking:** `Promise.all()` with `fs.access()` (replaces Python ThreadPoolExecutor).

### Core interfaces

```typescript
interface Mapping {
  oldPath: string
  newPath: string
}

interface LinkInfo {
  name: string
  filePath: string
  status: 'normal' | 'missing' | 'out-of-date' | 'embedded'
  thumbnailPath?: string
  newPath?: string        // populated during preview
  newPathExists?: boolean
}

interface DocumentInfo {
  name: string
  path: string
  links: LinkInfo[]
}

interface RepathResult {
  document: string
  totalLinks: number
  repathedLinks: number
  failedLinks: number
  errors: string[]
}
```

---

## Auto-Update & Distribution

```
Developer: npm version patch → git push --tags
    ↓
GitHub Actions (windows-latest):
    electron-builder --win --publish always
    ↓
GitHub Releases: .exe + latest.yml
    ↓
EnneadTabHome proxy: /indesign-repather/releases/*
    ↓
User's app: electron-updater checks on launch
    ↓
Silent download → "Restart to update" notification
```

| Component | Detail |
|-----------|--------|
| Installer | NSIS → `%LOCALAPPDATA%\InDesignRepather` |
| Update URL | `enneadtab.com/indesign-repather/releases/latest.yml` |
| Update proxy | EnneadTabHome API route with server-side `GITHUB_TOKEN` |
| Check frequency | Every app launch |
| Code signing | Optional (IT whitelist or EV cert) |

---

## Source Code Protection

- ASAR archive (opaque binary bundle)
- Optional `bytenode` V8 bytecode compilation
- Minification + tree-shaking before packaging
- Private repo — end users only get compiled `.exe`

## Error Reporting

- Sentry (`@sentry/electron`) for automatic crash reports
- Captures: stack traces, OS info, InDesign version, user actions before crash
- Both main process (COM failures) and renderer (UI errors)
- Optional "Report Issue" button in app for manual reports
- No sensitive data sent (file names can be stripped)

---

## Persistence

Stored in `%APPDATA%/InDesignRepather/config.json` via `electron-store`:

```json
{
  "mappings": [
    { "oldPath": "\\\\server\\2024\\Assets", "newPath": "\\\\server\\2025\\Assets" }
  ],
  "windowBounds": { "x": 100, "y": 100, "width": 900, "height": 700 },
  "lastUsedMode": "batch",
  "searchRoots": ["\\\\server\\Projects", "D:\\Archive"]
}
```

---

## EnneadTabHome Integration

Minimal — just rewrites in `next.config.js`:

```javascript
indesignRepather: {
  target: 'https://indesign-repather.vercel.app',
  rewrites: [
    { source: '/indesign-repather', destination: '/indesign-repather' },
    { source: '/indesign-repather/:path*', destination: '/indesign-repather/:path*' },
  ]
}
```

SSO protection disabled on the Vercel project (EnneadTabHome handles auth).

---

## Landing Page

Hosted at `indesign-repather.vercel.app`, accessed via `enneadtab.com/indesign-repather`.

Content:
- **Hero:** App name, one-line description, download button with version badge and file size
- **Getting Started:** 4-step guide with screenshots (select files → discover/define rules → preview → execute)
- **Changelog:** Version history
- **Requirements:** Windows 10/11, Adobe InDesign CC 2020+, network access

---

## What's NOT in v1

- LLM-based AI features (the discover feature is pure local file search + prefix diffing)
- macOS support (InDesign COM is Windows-only)
- Cloud sync of mappings (local persistence is sufficient)
- Named mapping presets (can add in v2 if users want saved configurations)
