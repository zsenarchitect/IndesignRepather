import { setSelectedFiles, getSelectedFiles, setFileVersions, getFileVersions, setConnectedInDesignVersion, getConnectedInDesignVersion } from '../app';
import type { InddVersionInfo } from '../../core/indd-version';

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

  const mismatched: string[] = [];
  let unknownCount = 0;
  let allMatch = true;

  for (const f of files) {
    const ver = versions[f];
    if (!ver) {
      unknownCount++;
      allMatch = false;
    } else if (ver.yearVersion !== connectedYear) {
      mismatched.push(f);
      allMatch = false;
    }
  }

  const warningEl = document.createElement('div');
  warningEl.id = 'version-warning-section';

  if (mismatched.length > 0) {
    // Group by year
    const yearCounts: Record<string, number> = {};
    for (const f of mismatched) {
      const ver = versions[f];
      if (ver) {
        yearCounts[ver.yearVersion] = (yearCounts[ver.yearVersion] || 0) + 1;
      }
    }
    const yearSummary = Object.entries(yearCounts)
      .map(([year, count]) => `${count} file${count === 1 ? '' : 's'} from InDesign ${year}`)
      .join(', ');

    warningEl.innerHTML = `
      <div class="version-warning">
        <strong>Warning:</strong> You are connected to InDesign ${connectedYear}, but ${yearSummary}.
        Opening and saving these files will upgrade them to ${connectedYear} format.
        This cannot be undone. Proceed only if this is intentional.
      </div>
    `;
  } else if (allMatch) {
    warningEl.innerHTML = `
      <div class="version-ok">
        Version match -- safe to proceed. All files match InDesign ${connectedYear}.
      </div>
    `;
  }

  if (unknownCount > 0 && mismatched.length === 0) {
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

  async function detectAndShowVersions(files: string[]) {
    try {
      const result = await window.api.detectFileVersions(files);
      setFileVersions(result.data);
      renderFileList(container, files, result.data);
      renderVersionWarning(container);
    } catch {
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
    connectBtn.disabled = true;

    const result = await window.api.connectInDesign(version);
    if (result.data) {
      setConnStatus('connected', `Connected (InDesign ${result.data.version})`);
      setConnectedInDesignVersion(result.data.version);
      renderVersionWarning(container);
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
          setConnectedInDesignVersion(retry.data.version);
          renderVersionWarning(container);
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

  async function handleFilesSelected(files: string[]) {
    setSelectedFiles(files);
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
    summaryEl.textContent = 'Scanning folder for .indd files...';
    const files = await window.api.selectFolder();
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
