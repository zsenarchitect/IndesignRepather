import { setSelectedFiles, getSelectedFiles, setFileVersions, getFileVersions, setConnectedInDesignVersion, getConnectedInDesignVersion, setStatus } from '../app';
import type { InddVersionInfo } from '../../core/indd-version';
import { createProgressBar } from '../components/progress';

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
}

function renderFileList(container: HTMLElement, files: string[], versions?: Record<string, InddVersionInfo | null>) {
  const listEl = container.querySelector('.file-list') as HTMLElement;
  if (!listEl) return;

  if (files.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  const fileRows = files.map((f) => {
    const ver = versions?.[f];
    const versionLabel = ver
      ? `<span style="color:#888;font-size:12px;margin-left:auto;white-space:nowrap;">InDesign ${ver.yearVersion} (v${ver.version})</span>`
      : '';
    return `<div class="file-item" style="display:flex;align-items:center;gap:8px;">${basename(f)}${versionLabel}</div>`;
  }).join('');

  // Show version span summary if versions detected
  let versionSummary = '';
  if (versions) {
    const years = new Set<string>();
    for (const f of files) {
      const ver = versions[f];
      if (ver) years.add(ver.yearVersion);
    }
    if (years.size > 1) {
      const sorted = Array.from(years).sort();
      versionSummary = `<div style="font-size:12px;color:#ffc107;margin-top:6px;">Files span versions: ${sorted.join(', ')}</div>`;
    }
  }

  listEl.innerHTML = `
    <div style="font-size:12px;color:#888;margin-bottom:6px;">${files.length} file${files.length === 1 ? '' : 's'} selected</div>
    ${fileRows}
    ${versionSummary}
  `;
}

function renderVersionWarning(container: HTMLElement) {
  // Remove existing warning
  const existing = container.querySelector('#version-warning-section');
  if (existing) existing.remove();

  const connectedVersion = getConnectedInDesignVersion();
  const versions = getFileVersions();
  const files = getSelectedFiles();

  if (!connectedVersion || files.length === 0) return;

  // Parse connected version year from version string like "20.0" -> "2025"
  const connectedMajor = parseInt(connectedVersion);
  const versionToYear: Record<number, string> = { 17: '2022', 18: '2023', 19: '2024', 20: '2025', 21: '2026' };
  const connectedYear = versionToYear[connectedMajor] || connectedVersion;

  const newerFiles: string[] = [];  // file version > connected version
  const olderFiles: string[] = [];  // file version < connected version
  let unknownCount = 0;
  let allMatch = true;

  for (const f of files) {
    const ver = versions[f];
    if (!ver) {
      unknownCount++;
      allMatch = false;
    } else {
      const fileMajor = parseInt(ver.version);
      if (fileMajor > connectedMajor) {
        newerFiles.push(f);
        allMatch = false;
      } else if (fileMajor < connectedMajor) {
        olderFiles.push(f);
        allMatch = false;
      }
    }
  }

  const warningEl = document.createElement('div');
  warningEl.id = 'version-warning-section';

  // Files NEWER than connected InDesign — cannot open without conversion
  if (newerFiles.length > 0) {
    const yearCounts: Record<string, number> = {};
    for (const f of newerFiles) {
      const ver = versions[f];
      if (ver) {
        yearCounts[ver.yearVersion] = (yearCounts[ver.yearVersion] || 0) + 1;
      }
    }
    const newestFileYear = Object.keys(yearCounts).sort().pop() || 'unknown';
    const yearSummary = Object.entries(yearCounts)
      .map(([year, count]) => `${count} file${count === 1 ? '' : 's'} from InDesign ${year}`)
      .join(', ');

    warningEl.innerHTML += `
      <div class="version-warning">
        <strong>Blocked:</strong> ${yearSummary}.
        These files were created in a newer InDesign version. They cannot be opened without conversion.
        Use InDesign ${newestFileYear} or newer.
      </div>
    `;
  }

  // Files OLDER than connected InDesign — will be upgraded
  if (olderFiles.length > 0) {
    const yearCounts: Record<string, number> = {};
    for (const f of olderFiles) {
      const ver = versions[f];
      if (ver) {
        yearCounts[ver.yearVersion] = (yearCounts[ver.yearVersion] || 0) + 1;
      }
    }
    const yearSummary = Object.entries(yearCounts)
      .map(([year, count]) => `${count} file${count === 1 ? '' : 's'} from InDesign ${year}`)
      .join(', ');

    warningEl.innerHTML += `
      <div class="version-warning">
        <strong>Warning:</strong> ${yearSummary}.
        Opening in InDesign ${connectedYear} will upgrade these files. This cannot be undone.
      </div>
    `;
  }

  if (allMatch) {
    warningEl.innerHTML = `
      <div class="version-ok">
        Version match -- safe to proceed. All files match InDesign ${connectedYear}.
      </div>
    `;
  }

  if (unknownCount > 0 && newerFiles.length === 0 && olderFiles.length === 0) {
    warningEl.innerHTML += `
      <div class="version-unknown">
        Version could not be detected for ${unknownCount} file${unknownCount === 1 ? '' : 's'}.
      </div>
    `;
  }

  // Insert after connection section
  const connSection = container.querySelector('.connection-section');
  if (connSection) {
    connSection.after(warningEl);
  }
}

export function init(container: HTMLElement) {
  container.innerHTML = `
    <div class="connection-section">
      <h3 class="connection-title">InDesign Connection</h3>
      <div class="connection-controls">
        <select id="indesign-version" class="version-select">
          <option value="">Detect Automatically</option>
          <option value="2026">InDesign 2026</option>
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

  // -- Progress bars --
  const connectProgress = createProgressBar();
  const scanProgress = createProgressBar();
  const versionProgress = createProgressBar();

  // Insert connect progress after connection controls
  const connControls = container.querySelector('.connection-controls');
  if (connControls) connControls.after(connectProgress.element);

  // Insert scan & version progress before file list
  const fileListEl = container.querySelector('.file-list') as HTMLElement;
  fileListEl.before(versionProgress.element);
  fileListEl.before(scanProgress.element);

  // Listen for folder scan progress from main process
  let folderScanListenerAttached = false;
  let folderScanCallback: ((data: { found: number }) => void) | null = null;
  if (!folderScanListenerAttached) {
    folderScanListenerAttached = true;
    window.api.onFolderScanProgress((data) => {
      folderScanCallback?.(data);
    });
  }

  async function detectAndShowVersions(files: string[]) {
    try {
      versionProgress.setIndeterminate(`Detecting file versions... (${files.length} file${files.length === 1 ? '' : 's'})`);
      const result = await window.api.detectFileVersions(files);
      versionProgress.hide();
      setFileVersions(result.data);
      renderFileList(container, files, result.data);
      renderVersionWarning(container);
    } catch {
      versionProgress.hide();
      // Version detection is best-effort
    }
  }

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
    const existingVersions = getFileVersions();
    const hasVersions = Object.keys(existingVersions).length > 0;
    renderFileList(container, existing, hasVersions ? existingVersions : undefined);
    showLinkSummary(existing);
    if (hasVersions) renderVersionWarning(container);
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
    connectProgress.setIndeterminate('Connecting to InDesign...');
    connectBtn.disabled = true;

    setStatus('Connecting to InDesign...');
    const result = await window.api.connectInDesign(version);
    if (result.data) {
      connectProgress.hide();
      setConnStatus('connected', `Connected (InDesign ${result.data.version})`);
      setConnectedInDesignVersion(result.data.version);
      setStatus(`Connected to InDesign ${result.data.version}`);
      renderVersionWarning(container);
      connectBtn.disabled = false;
    } else if (result.error) {
      const isNotRunning =
        result.error.includes('not running') ||
        result.error.includes('Operation unavailable');

      if (isNotRunning) {
        setConnStatus('none', 'Not running. Launching...');
        connectProgress.setIndeterminate('Launching InDesign...');
        const launchResult = await window.api.launchInDesign();
        if (launchResult.error) {
          connectProgress.hide();
          setConnStatus('none', launchResult.error);
          connectBtn.disabled = false;
          return;
        }
        // Retry connection after launch
        connectProgress.setIndeterminate('Connecting after launch...');
        const retry = await window.api.connectInDesign(version);
        if (retry.data) {
          setConnStatus('connected', `Connected (InDesign ${retry.data.version})`);
          setConnectedInDesignVersion(retry.data.version);
          renderVersionWarning(container);
        } else {
          setConnStatus('none', retry.error || 'Connection failed after launch');
        }
      } else {
        setConnStatus('none', result.error);
      }
      connectProgress.hide();
      connectBtn.disabled = false;
      setStatus('Ready');
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

  async function handleFilesSelected(files: string[]) {
    setSelectedFiles(files);
    setStatus(`${files.length} file${files.length === 1 ? '' : 's'} selected`);
    renderFileList(container, files);
    detectAndShowVersions(files);
    // Link summary requires InDesign COM — don't block on it
    showLinkSummary(files).catch(() => {});
  }

  // Pick individual files
  container.querySelector('#opt-pick-files')?.addEventListener('click', async () => {
    const files = await window.api.selectFiles();
    if (files.length > 0) {
      await handleFilesSelected(files);
    }
  });

  // Pick folder
  container.querySelector('#opt-pick-folder')?.addEventListener('click', async () => {
    summaryEl.textContent = '';
    setStatus('Scanning...');
    scanProgress.setIndeterminate('Scanning folder for .indd files...');
    folderScanCallback = (data) => {
      scanProgress.setIndeterminate(`Scanning... ${data.found} file${data.found === 1 ? '' : 's'} found`);
    };
    const files = await window.api.selectFolder();
    folderScanCallback = null;
    scanProgress.hide();
    if (files.length > 0) {
      await handleFilesSelected(files);
    } else {
      summaryEl.textContent = 'No .indd files found in the selected folder.';
    }
  });

  // Open documents from InDesign
  container.querySelector('#opt-open-docs')?.addEventListener('click', async () => {
    try {
      const docs = await window.api.getOpenDocuments();
      if (docs.length > 0) {
        const files = docs.map((d: any) => d.path);
        await handleFilesSelected(files);
      } else {
        renderFileList(container, []);
        summaryEl.textContent = 'No documents open in InDesign.';
      }
    } catch (err: any) {
      summaryEl.innerHTML =
        '<span style="color:#f44336;">Could not connect to InDesign. Make sure it is running.</span>';
    }
  });
}
