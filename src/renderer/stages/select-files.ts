import { setSelectedFiles, getSelectedFiles } from '../app';

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
}

function renderFileList(container: HTMLElement, files: string[]) {
  const listEl = container.querySelector('.file-list') as HTMLElement;
  if (!listEl) return;

  if (files.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = `
    <div style="font-size:12px;color:#888;margin-bottom:6px;">${files.length} file${files.length === 1 ? '' : 's'} selected</div>
    ${files.map((f) => `<div class="file-item">${basename(f)}</div>`).join('')}
  `;
}

export function init(container: HTMLElement) {
  container.innerHTML = `
    <h2>Select InDesign Documents</h2>
    <p>Choose how to select your .indd files</p>

    <div class="file-options">
      <div class="file-option" id="opt-pick-files">
        <h3>Pick Documents</h3>
        <p>Select individual .indd files</p>
      </div>
      <div class="file-option" id="opt-pick-folder">
        <h3>Pick Folder</h3>
        <p>Recursively find .indd files in a folder</p>
      </div>
      <div class="file-option" id="opt-open-docs">
        <h3>Open in InDesign</h3>
        <p>Grab currently open documents</p>
      </div>
    </div>

    <div class="file-list"></div>
  `;

  // Restore existing selection
  const existing = getSelectedFiles();
  if (existing.length > 0) {
    renderFileList(container, existing);
  }

  // Pick individual files
  container.querySelector('#opt-pick-files')?.addEventListener('click', async () => {
    const files = await window.api.selectFiles();
    if (files.length > 0) {
      setSelectedFiles(files);
      renderFileList(container, files);
    }
  });

  // Pick folder
  container.querySelector('#opt-pick-folder')?.addEventListener('click', async () => {
    const files = await window.api.selectFolder();
    if (files.length > 0) {
      setSelectedFiles(files);
      renderFileList(container, files);
    }
  });

  // Open documents from InDesign
  container.querySelector('#opt-open-docs')?.addEventListener('click', async () => {
    try {
      const docs = await window.api.getOpenDocuments();
      if (docs.length > 0) {
        const files = docs.map((d) => d.path);
        setSelectedFiles(files);
        renderFileList(container, files);
      } else {
        renderFileList(container, []);
        const listEl = container.querySelector('.file-list') as HTMLElement;
        listEl.innerHTML = '<div style="color:#888;font-size:13px;">No documents open in InDesign</div>';
      }
    } catch (err) {
      const listEl = container.querySelector('.file-list') as HTMLElement;
      listEl.innerHTML =
        '<div style="color:#f44336;font-size:13px;">Could not connect to InDesign. Make sure it is running.</div>';
    }
  });
}
