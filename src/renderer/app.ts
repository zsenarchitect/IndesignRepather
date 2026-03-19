import type { Mapping, DocumentInfo, RepathResult, ProgressUpdate } from '../shared/types';
import { init as initSelectFiles } from './stages/select-files';
import { init as initDiscover } from './stages/discover';
import { init as initDefineRules } from './stages/define-rules';
import { init as initPreview } from './stages/preview';
import { init as initExecute } from './stages/execute';

declare global {
  interface Window {
    api: {
      selectFiles: () => Promise<string[]>;
      selectFolder: () => Promise<string[]>;
      selectFolderPath: () => Promise<string | null>;
      getOpenDocuments: () => Promise<{ name: string; path: string }[]>;
      analyzeLinks: (filePaths: string[]) => Promise<DocumentInfo[]>;
      discoverMappings: (
        brokenLinks: { name: string; filePath: string }[],
        searchRoots: string[]
      ) => Promise<{
        suggestedMappings: Mapping[];
        foundFiles: Record<string, string[]>;
        notFound: string[];
        totalScanned: number;
      }>;
      previewRepath: (filePaths: string[], mappings: Mapping[]) => Promise<DocumentInfo[]>;
      executeRepath: (filePaths: string[], mappings: Mapping[]) => Promise<RepathResult[]>;
      loadMappings: () => Promise<Mapping[]>;
      saveMappings: (mappings: Mapping[]) => Promise<void>;
      loadSearchRoots: () => Promise<string[]>;
      saveSearchRoots: (roots: string[]) => Promise<void>;
      onProgress: (callback: (data: ProgressUpdate) => void) => void;
      onDiscoverProgress: (callback: (data: { found: number }) => void) => void;
      getAppVersion: () => Promise<string>;
      getThumbnail: (filePath: string) => Promise<string | null>;
    };
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentStage = 1;
let selectedFiles: string[] = [];
let mappings: Mapping[] = [];
let previewResults: DocumentInfo[] = [];

// ---------------------------------------------------------------------------
// Stage navigation
// ---------------------------------------------------------------------------
function initStage(stage: number) {
  const container = document.getElementById(`stage-${stage}`);
  if (!container) return;

  switch (stage) {
    case 1:
      initSelectFiles(container);
      break;
    case 2:
      initDiscover(container);
      break;
    case 3:
      initDefineRules(container);
      break;
    case 4:
      initPreview(container);
      break;
    case 5:
      initExecute(container);
      break;
  }
}

function showStage(stage: number) {
  currentStage = stage;

  // Toggle visibility
  document.querySelectorAll('.stage-content').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`stage-${stage}`)?.classList.remove('hidden');

  // Update stage bar indicators
  document.querySelectorAll('.stage-bar .stage').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === stage);
    el.classList.toggle('completed', i + 1 < stage);
  });

  // Init stage content
  initStage(stage);

  // Update buttons
  const backBtn = document.getElementById('btn-back') as HTMLButtonElement;
  const nextBtn = document.getElementById('btn-next') as HTMLButtonElement;

  backBtn.classList.toggle('hidden', stage === 1);

  switch (stage) {
    case 1:
      nextBtn.textContent = 'Next';
      nextBtn.classList.remove('primary', 'hidden');
      nextBtn.disabled = selectedFiles.length === 0;
      break;
    case 2:
      nextBtn.textContent = 'Skip / Next';
      nextBtn.classList.remove('primary', 'hidden');
      nextBtn.disabled = false;
      break;
    case 3:
      nextBtn.textContent = 'Preview';
      nextBtn.classList.remove('hidden');
      nextBtn.classList.toggle('primary', mappings.length > 0);
      nextBtn.disabled = mappings.length === 0;
      break;
    case 4:
      nextBtn.textContent = 'Execute';
      nextBtn.classList.add('primary');
      nextBtn.classList.remove('hidden');
      nextBtn.disabled = false;
      break;
    case 5:
      nextBtn.classList.add('hidden');
      break;
  }
}

function canAdvance(from: number): boolean {
  switch (from) {
    case 1:
      return selectedFiles.length > 0;
    case 2:
      return true; // Discover is optional
    case 3:
      return mappings.length > 0;
    case 4:
      return true; // Triggers execution
    default:
      return false;
  }
}

function handleNext() {
  if (currentStage >= 5) return;

  // Stage 1 -> if no files, skip discover and go straight to rules
  if (currentStage === 1 && selectedFiles.length === 0) return;

  if (!canAdvance(currentStage)) return;

  // Stage 4 -> 5 triggers execution (stage content will handle it)
  showStage(currentStage + 1);
}

function handleBack() {
  if (currentStage > 1) {
    showStage(currentStage - 1);
  }
}

// ---------------------------------------------------------------------------
// Public API for stage content scripts
// ---------------------------------------------------------------------------
export function getSelectedFiles(): string[] {
  return selectedFiles;
}

export function setSelectedFiles(files: string[]) {
  selectedFiles = files;
  // Re-evaluate Next button state
  if (currentStage === 1) {
    const nextBtn = document.getElementById('btn-next') as HTMLButtonElement;
    nextBtn.disabled = files.length === 0;
  }
}

export function getMappings(): Mapping[] {
  return mappings;
}

export function setMappings(m: Mapping[]) {
  mappings = m;
  // Persist
  window.api.saveMappings(m);
  // Re-evaluate Next button state
  if (currentStage === 3) {
    const nextBtn = document.getElementById('btn-next') as HTMLButtonElement;
    nextBtn.disabled = m.length === 0;
    nextBtn.classList.toggle('primary', m.length > 0);
  }
}

export function getPreviewResults(): DocumentInfo[] {
  return previewResults;
}

export function setPreviewResults(results: DocumentInfo[]) {
  previewResults = results;
}

export function getCurrentStage(): number {
  return currentStage;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
document.getElementById('btn-next')?.addEventListener('click', handleNext);
document.getElementById('btn-back')?.addEventListener('click', handleBack);

// Load saved mappings on startup
window.api?.loadMappings().then((saved) => {
  if (saved && saved.length > 0) {
    mappings = saved;
  }
});

// Display app version in footer
window.api?.getAppVersion().then((v: string) => {
  const el = document.getElementById('app-version');
  if (el) el.textContent = `v${v}`;
});

// Listen for reset-session from execute stage "New Session" button
document.addEventListener('reset-session', () => {
  showStage(1);
});

// Start at stage 1
showStage(1);
