import { getSelectedFiles, getMappings, setSelectedFiles, setMappings, setPreviewResults } from '../app';
import type { RepathResult, ProgressUpdate } from '../../shared/types';

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
}

export async function init(container: HTMLElement) {
  const files = getSelectedFiles();
  const mappings = getMappings();

  container.innerHTML = `
    <h2>Executing</h2>
    <p>Repathing links in your InDesign documents...</p>

    <div style="margin:12px 0;">
      <div style="display:flex;justify-content:space-between;font-size:13px;color:#888;margin-bottom:4px;">
        <span id="overall-label">Starting...</span>
        <span id="overall-pct">0%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" id="overall-fill" style="width:0%"></div></div>
    </div>

    <div id="file-progress"></div>

    <div id="exec-summary" class="hidden"></div>

    <div id="exec-actions" class="hidden" style="margin-top:16px;">
      <button id="btn-new-session">New Session</button>
    </div>
  `;

  const overallLabel = container.querySelector('#overall-label') as HTMLElement;
  const overallPct = container.querySelector('#overall-pct') as HTMLElement;
  const overallFill = container.querySelector('#overall-fill') as HTMLElement;
  const fileProgressEl = container.querySelector('#file-progress') as HTMLElement;
  const summaryEl = container.querySelector('#exec-summary') as HTMLElement;
  const actionsEl = container.querySelector('#exec-actions') as HTMLElement;

  // Track per-file status
  const fileStatuses: Map<
    string,
    { label: HTMLElement; fill: HTMLElement; status: HTMLElement }
  > = new Map();

  // Create file progress rows
  for (const file of files) {
    const name = basename(file);
    const id = `fp-${Math.random().toString(36).slice(2, 8)}`;
    fileProgressEl.insertAdjacentHTML(
      'beforeend',
      `
      <div class="file-status" id="${id}">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${file}">${name}</span>
        <div class="progress-bar" style="width:120px;"><div class="progress-fill" id="${id}-fill" style="width:0%"></div></div>
        <span id="${id}-status" style="width:72px;text-align:right;font-size:12px;color:#666;">pending</span>
      </div>
    `
    );
    fileStatuses.set(file, {
      label: document.getElementById(id)!,
      fill: document.getElementById(`${id}-fill`)!,
      status: document.getElementById(`${id}-status`)!,
    });
  }

  // Listen for progress
  window.api.onProgress((data: ProgressUpdate) => {
    if (data.stage !== 'repathing') return;

    const pct = data.totalFiles > 0 ? Math.round(((data.currentFileIndex + 1) / data.totalFiles) * 100) : 0;
    overallLabel.textContent = `Processing ${basename(data.currentFile)}...`;
    overallPct.textContent = `${pct}%`;
    overallFill.style.width = `${pct}%`;

    // Update file row
    const entry = fileStatuses.get(data.currentFile);
    if (entry) {
      let filePct = 100;
      if (data.totalLinks && data.totalLinks > 0 && data.currentLink !== undefined) {
        filePct = Math.round(((data.currentLink + 1) / data.totalLinks) * 100);
      }
      entry.fill.style.width = `${filePct}%`;
      entry.status.textContent = 'processing';
      entry.status.style.color = '#e0e0e0';
    }

    // Mark previous files as done
    for (let i = 0; i < data.currentFileIndex; i++) {
      const prevEntry = fileStatuses.get(files[i]);
      if (prevEntry && prevEntry.status.textContent !== 'done') {
        prevEntry.fill.style.width = '100%';
        prevEntry.status.textContent = 'done';
        prevEntry.status.style.color = '#4caf50';
      }
    }
  });

  // Execute
  let results: RepathResult[];
  try {
    results = await window.api.executeRepath(files, mappings);
  } catch (err) {
    overallLabel.textContent = 'Execution failed';
    overallPct.textContent = '';
    summaryEl.innerHTML = `
      <div class="result-card">
        <h3 style="color:#f44336;">Error</h3>
        <p style="color:#ccc;">${err instanceof Error ? err.message : 'Unknown error occurred'}</p>
      </div>
    `;
    summaryEl.classList.remove('hidden');
    actionsEl.classList.remove('hidden');
    attachNewSession(container, actionsEl);
    return;
  }

  // Mark all as done
  for (const entry of fileStatuses.values()) {
    entry.fill.style.width = '100%';
    entry.status.textContent = 'done';
    entry.status.style.color = '#4caf50';
  }
  overallFill.style.width = '100%';
  overallPct.textContent = '100%';
  overallLabel.textContent = 'Complete';

  // Mark errors
  for (const r of results) {
    if (r.failedLinks > 0 || r.errors.length > 0) {
      const entry = fileStatuses.get(r.document);
      if (entry) {
        entry.status.textContent = 'error';
        entry.status.style.color = '#f44336';
      }
    }
  }

  // Summary
  const totalRepathed = results.reduce((sum, r) => sum + r.repathedLinks, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failedLinks, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  summaryEl.innerHTML = `
    <div class="result-card">
      <h3>Summary</h3>
      <div class="result-stats">
        <span class="status-ok">${totalRepathed} repathed</span>
        <span class="status-missing">${totalFailed} failed</span>
        <span>${totalErrors} error${totalErrors === 1 ? '' : 's'}</span>
      </div>
      ${
        totalErrors > 0
          ? `<div style="margin-top:12px;font-size:12px;color:#f44336;">${results
              .flatMap((r) => r.errors)
              .map((e) => `<div>${e}</div>`)
              .join('')}</div>`
          : ''
      }
    </div>
  `;
  summaryEl.classList.remove('hidden');
  actionsEl.classList.remove('hidden');
  attachNewSession(container, actionsEl);

  // Native notification
  try {
    new Notification('InDesign Repather', {
      body: `Done. ${totalRepathed} links repathed${totalFailed > 0 ? `, ${totalFailed} failed` : ''}.`,
    });
  } catch {
    // Notifications may not be available
  }
}

function attachNewSession(container: HTMLElement, actionsEl: HTMLElement) {
  actionsEl.querySelector('#btn-new-session')?.addEventListener('click', () => {
    setSelectedFiles([]);
    setMappings([]);
    setPreviewResults([]);

    // Navigate to stage 1 by clicking back until we're there
    // Use the showStage approach — dispatch a custom event
    container.dispatchEvent(new CustomEvent('reset-session', { bubbles: true }));
  });
}
