import { getSelectedFiles, getMappings, setMappings } from '../app';
import type { Mapping } from '../../shared/types';

export function init(container: HTMLElement) {
  container.innerHTML = `
    <h2>Discover Mappings</h2>
    <p>Scan folders to auto-discover where broken links should point. This stage is optional.</p>

    <div style="margin:12px 0;">
      <h3 style="font-size:14px;margin-bottom:8px;">Search Roots</h3>
      <div id="search-roots-list" style="margin-bottom:8px;"></div>
      <button id="btn-add-root" style="font-size:12px;">Add Folder</button>
    </div>

    <div style="margin:16px 0;">
      <div style="display:flex;align-items:center;gap:12px;">
        <button id="btn-scan" disabled>Scan for Mappings</button>
        <button id="btn-cancel-scan" class="hidden" style="font-size:12px;">Cancel</button>
        <span id="scan-status" style="font-size:13px;color:#888;"></span>
      </div>
      <div class="progress-bar hidden" id="scan-progress-bar"><div class="progress-fill" id="scan-progress-fill" style="width:0%"></div></div>
      <div id="scan-file-count" class="hidden" style="font-size:12px;color:#666;margin-top:4px;"></div>
    </div>

    <div id="discover-results" class="hidden"></div>
  `;

  let searchRoots: string[] = [];
  let suggestedMappings: Mapping[] = [];

  const rootsListEl = container.querySelector('#search-roots-list') as HTMLElement;
  const scanBtn = container.querySelector('#btn-scan') as HTMLButtonElement;
  const cancelBtn = container.querySelector('#btn-cancel-scan') as HTMLButtonElement;
  const scanStatus = container.querySelector('#scan-status') as HTMLElement;
  const progressBar = container.querySelector('#scan-progress-bar') as HTMLElement;
  const progressFill = container.querySelector('#scan-progress-fill') as HTMLElement;
  const fileCountEl = container.querySelector('#scan-file-count') as HTMLElement;
  const resultsEl = container.querySelector('#discover-results') as HTMLElement;
  let scanCancelled = false;

  function renderRoots() {
    if (searchRoots.length === 0) {
      rootsListEl.innerHTML = '<div style="font-size:13px;color:#666;">No search roots added yet</div>';
      scanBtn.disabled = true;
      return;
    }
    rootsListEl.innerHTML = searchRoots
      .map(
        (r, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;color:#ccc;">
        <button class="remove-root" data-index="${i}" style="background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:2px 6px;">&#10005;</button>
        <span>${r}</span>
      </div>
    `
      )
      .join('');

    scanBtn.disabled = false;

    rootsListEl.querySelectorAll('.remove-root').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.index || '0', 10);
        searchRoots.splice(idx, 1);
        window.api.saveSearchRoots(searchRoots);
        renderRoots();
      });
    });
  }

  // Load saved roots
  window.api.loadSearchRoots().then((saved) => {
    if (saved && saved.length > 0) {
      searchRoots = saved;
    }
    renderRoots();
  });

  // Add folder
  container.querySelector('#btn-add-root')?.addEventListener('click', async () => {
    const folder = await window.api.selectFolderPath();
    if (folder && !searchRoots.includes(folder)) {
      searchRoots.push(folder);
      window.api.saveSearchRoots(searchRoots);
      renderRoots();
    }
  });

  // Cancel scan
  cancelBtn.addEventListener('click', () => {
    scanCancelled = true;
    cancelBtn.classList.add('hidden');
    scanStatus.textContent = 'Cancelled.';
    progressBar.classList.add('hidden');
    fileCountEl.classList.add('hidden');
    scanBtn.disabled = false;
  });

  // Scan
  scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    scanCancelled = false;
    cancelBtn.classList.remove('hidden');
    progressBar.classList.remove('hidden');
    progressFill.style.width = '0%';
    fileCountEl.classList.remove('hidden');
    fileCountEl.textContent = '0 files scanned';
    scanStatus.textContent = 'Scanning...';
    resultsEl.classList.add('hidden');

    // Collect broken links from selected files by analyzing them
    const files = getSelectedFiles();
    let brokenLinks: { name: string; filePath: string }[] = [];
    try {
      const docs = await window.api.analyzeLinks(files);
      for (const doc of docs) {
        for (const link of doc.links) {
          if (link.status === 'missing' || link.status === 'inaccessible') {
            brokenLinks.push({ name: link.name, filePath: link.filePath });
          }
        }
      }
    } catch {
      scanStatus.textContent = 'Failed to analyze files. Is InDesign running?';
      scanBtn.disabled = false;
      cancelBtn.classList.add('hidden');
      progressBar.classList.add('hidden');
      fileCountEl.classList.add('hidden');
      return;
    }

    if (brokenLinks.length === 0) {
      scanStatus.textContent = 'No broken links found — nothing to discover.';
      scanBtn.disabled = false;
      cancelBtn.classList.add('hidden');
      progressBar.classList.add('hidden');
      fileCountEl.classList.add('hidden');
      return;
    }

    // Listen for progress
    window.api.onDiscoverProgress((data) => {
      if (scanCancelled) return;
      scanStatus.textContent = `Scanning... ${data.found} file${data.found === 1 ? '' : 's'} found`;
      fileCountEl.textContent = `${data.found} files scanned`;
      // Pulse the progress bar since we don't know total
      progressFill.style.width = '100%';
      progressFill.style.opacity = '0.5';
    });

    try {
      const result = await window.api.discoverMappings(brokenLinks, searchRoots);
      cancelBtn.classList.add('hidden');
      progressBar.classList.add('hidden');
      fileCountEl.classList.add('hidden');
      if (scanCancelled) return;
      suggestedMappings = result.suggestedMappings;
      scanStatus.textContent = `Done. Scanned ${result.totalScanned} files, found ${suggestedMappings.length} mapping${suggestedMappings.length === 1 ? '' : 's'}.`;

      if (suggestedMappings.length > 0) {
        renderSuggestions();
      } else {
        resultsEl.innerHTML =
          '<p style="color:#888;margin-top:12px;">No mappings could be auto-discovered.</p>';
        resultsEl.classList.remove('hidden');
      }
    } catch {
      scanStatus.textContent = 'Scan failed.';
      cancelBtn.classList.add('hidden');
      progressBar.classList.add('hidden');
      fileCountEl.classList.add('hidden');
    }
    scanBtn.disabled = false;
  });

  function renderSuggestions() {
    resultsEl.innerHTML = `
      <h3 style="font-size:14px;margin-bottom:8px;">Suggested Mappings</h3>
      ${suggestedMappings
        .map(
          (m, i) => `
        <label style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;font-size:13px;color:#ccc;border-bottom:1px solid #222;cursor:pointer;">
          <input type="checkbox" checked data-index="${i}" style="margin-top:2px;">
          <div style="min-width:0;">
            <div style="color:#888;">${m.oldPath}</div>
            <div>-> ${m.newPath}</div>
          </div>
        </label>
      `
        )
        .join('')}
      <button id="btn-accept" style="margin-top:12px;">Accept Selected</button>
    `;
    resultsEl.classList.remove('hidden');

    resultsEl.querySelector('#btn-accept')?.addEventListener('click', () => {
      const existing = getMappings();
      const checkboxes = resultsEl.querySelectorAll('input[type="checkbox"]');
      const selected: Mapping[] = [];
      checkboxes.forEach((cb) => {
        const input = cb as HTMLInputElement;
        if (input.checked) {
          const idx = parseInt(input.dataset.index || '0', 10);
          selected.push(suggestedMappings[idx]);
        }
      });

      // Merge — avoid duplicates
      const merged = [...existing];
      for (const s of selected) {
        if (!merged.some((m) => m.oldPath === s.oldPath && m.newPath === s.newPath)) {
          merged.push(s);
        }
      }
      setMappings(merged);
      resultsEl.innerHTML = `<p style="color:#4caf50;font-size:13px;margin-top:12px;">Added ${selected.length} mapping${selected.length === 1 ? '' : 's'}.</p>`;
    });
  }
}
