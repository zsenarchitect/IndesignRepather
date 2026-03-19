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
    <div class="connection-section">
      <h3 class="connection-title">InDesign Connection</h3>
      <div class="connection-controls">
        <select id="indesign-version" class="version-select">
          <option value="">Detect Automatically</option>
          <option value="2025">InDesign 2025</option>
          <option value="2024">InDesign 2024</option>
          <option value="2023">InDesign 2023</option>
          <option value="2022">InDesign 2022</option>
        </select>
        <button id="btn-connect">Connect</button>
        <span id="connection-status" class="conn-status conn-status-none">Not connected</span>
      </div>
    </div>

    <h2>Select InDesign Documents</h2>
    <p>Select the InDesign documents with broken links. The app will help you update link paths to their new locations.</p>

    <div class="file-options">
      <div class="file-option" id="opt-pick-files" tabindex="0" role="button">
        <h3>Pick Documents</h3>
        <p>Select individual .indd files</p>
      </div>
      <div class="file-option" id="opt-pick-folder" tabindex="0" role="button">
        <h3>Pick Folder</h3>
        <p>Find all .indd files in a folder and subfolders</p>
      </div>
      <div class="file-option" id="opt-open-docs" tabindex="0" role="button">
        <h3>Open in InDesign</h3>
        <p>Grab currently open documents</p>
      </div>
    </div>

    <div class="file-list"></div>
    <div id="link-summary" style="margin-top:12px;font-size:13px;color:#888;"></div>
  `;

  const summaryEl = container.querySelector('#link-summary') as HTMLElement;

  async function showLinkSummary(files: string[]) {
    if (files.length === 0) {
      summaryEl.textContent = '';
      return;
    }
    summaryEl.textContent = 'Analyzing links...';
    try {
      const docs = await window.api.analyzeLinks(files);
      const totalLinks = docs.reduce((sum: number, d: any) => sum + d.links.length, 0);
      const brokenLinks = docs.reduce(
        (sum: number, d: any) => sum + d.links.filter((l: any) => l.status === 'missing').length,
        0
      );
      summaryEl.textContent = `${files.length} file${files.length === 1 ? '' : 's'}, ${totalLinks} link${totalLinks === 1 ? '' : 's'} (${brokenLinks} broken)`;
    } catch {
      summaryEl.textContent = 'Could not analyze links. Is InDesign running?';
    }
  }

  // Restore existing selection
  const existing = getSelectedFiles();
  if (existing.length > 0) {
    renderFileList(container, existing);
    showLinkSummary(existing);
  }

  // InDesign connection
  const versionSelect = container.querySelector('#indesign-version') as HTMLSelectElement;
  const connectBtn = container.querySelector('#btn-connect') as HTMLButtonElement;
  const connStatus = container.querySelector('#connection-status') as HTMLElement;

  function setConnStatus(state: 'none' | 'connecting' | 'connected', label: string) {
    connStatus.className = `conn-status conn-status-${state}`;
    connStatus.textContent = label;
  }

  connectBtn.addEventListener('click', async () => {
    const version = versionSelect.value || undefined;
    setConnStatus('connecting', 'Connecting...');
    connectBtn.disabled = true;

    const result = await window.api.connectInDesign(version);
    if (result.data) {
      setConnStatus('connected', `Connected (InDesign ${result.data.version})`);
      connectBtn.disabled = false;
    } else if (result.error) {
      const isNotRunning =
        result.error.includes('not running') ||
        result.error.includes('Operation unavailable');

      if (isNotRunning) {
        setConnStatus('none', 'Not running. Launching...');
        const launchResult = await window.api.launchInDesign();
        if (launchResult.error) {
          setConnStatus('none', launchResult.error);
          connectBtn.disabled = false;
          return;
        }
        // Retry connection after launch
        const retry = await window.api.connectInDesign(version);
        if (retry.data) {
          setConnStatus('connected', `Connected (InDesign ${retry.data.version})`);
        } else {
          setConnStatus('none', retry.error || 'Connection failed after launch');
        }
      } else {
        setConnStatus('none', result.error);
      }
      connectBtn.disabled = false;
    }
  });

  // Keyboard activation for file option cards
  container.querySelectorAll('.file-option').forEach((card) => {
    card.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        (card as HTMLElement).click();
      }
    });
  });

  // Pick individual files
  container.querySelector('#opt-pick-files')?.addEventListener('click', async () => {
    const files = await window.api.selectFiles();
    if (files.length > 0) {
      setSelectedFiles(files);
      renderFileList(container, files);
      showLinkSummary(files);
    }
  });

  // Pick folder
  container.querySelector('#opt-pick-folder')?.addEventListener('click', async () => {
    const files = await window.api.selectFolder();
    if (files.length > 0) {
      setSelectedFiles(files);
      renderFileList(container, files);
      showLinkSummary(files);
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
        showLinkSummary(files);
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
