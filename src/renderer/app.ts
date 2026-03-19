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
      getAppVersion: () => Promise<string>;
    };
  }
}

let currentStage = 1;

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
    nextBtn.classList.remove('hidden');
    nextBtn.disabled = false;
  } else if (stage === 5) {
    nextBtn.classList.add('hidden');
  } else {
    nextBtn.textContent = stage === 2 ? 'Skip / Next' : 'Next';
    nextBtn.classList.remove('primary', 'hidden');
    nextBtn.disabled = stage === 1;
  }
}

document.getElementById('btn-next')?.addEventListener('click', () => {
  if (currentStage < 5) showStage(currentStage + 1);
});

document.getElementById('btn-back')?.addEventListener('click', () => {
  if (currentStage > 1) showStage(currentStage - 1);
});

// Display app version in footer
window.api?.getAppVersion().then((v: string) => {
  const el = document.getElementById('app-version');
  if (el) el.textContent = `v${v}`;
});

// Initialize
showStage(1);

export {};
