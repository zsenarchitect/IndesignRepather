import { getSelectedFiles, getMappings, setMappings } from '../app';
import type { Mapping } from '../../shared/types';

let discoverListenerAttached = false;
let discoverProgressCallback: ((data: { found: number }) => void) | null = null;
let analyzeListenerAttached = false;
let analyzeProgressCallback: ((data: { currentFile: string; currentIndex: number; totalFiles: number }) => void) | null = null;

// Cache broken links from analysis so the scan can reuse them
let cachedBrokenLinks: { name: string; filePath: string }[] = [];

export function init(container: HTMLElement) {
  container.innerHTML = `
    <h2>Discover Mappings</h2>
    <p>Auto-discover where broken links should point. Optional — skip if you already know the path changes.</p>

    <div class="broken-link-section">
      <h3 style="font-size:14px;margin-bottom:8px;">Step A: Find Broken Links</h3>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <button id="btn-analyze">Scan Selected Files</button>
        <span id="analyze-status" style="font-size:13px;color:#888;"></span>
      </div>
      <div class="progress-bar hidden" id="analyze-progress-bar"><div class="progress-fill" id="analyze-progress-fill" style="width:0%"></div></div>
      <div id="analyze-current-file" class="hidden" style="font-size:12px;color:#666;margin-top:4px;"></div>
      <div id="analyze-results" class="hidden" style="margin-top:12px;"></div>
    </div>

    <div style="margin:12px 0;">
      <h3 style="font-size:14px;margin-bottom:8px;">Step B: Where to Search for New Locations</h3>
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

  // -- Broken Link Analysis --
  const analyzeBtn = container.querySelector('#btn-analyze') as HTMLButtonElement;
  const analyzeStatusEl = container.querySelector('#analyze-status') as HTMLElement;
  const analyzeProgressBar = container.querySelector('#analyze-progress-bar') as HTMLElement;
  const analyzeProgressFill = container.querySelector('#analyze-progress-fill') as HTMLElement;
  const analyzeCurrentFile = container.querySelector('#analyze-current-file') as HTMLElement;
  const analyzeResultsEl = container.querySelector('#analyze-results') as HTMLElement;

  // Listen for per-file progress (attach once)
  analyzeProgressCallback = (data) => {
    const pct = Math.round(((data.currentIndex + 1) / data.totalFiles) * 100);
    analyzeProgressFill.style.width = `${pct}%`;
    const fileName = data.currentFile.replace(/\\/g, '/').split('/').pop() || data.currentFile;
    analyzeCurrentFile.textContent = `Scanning file ${data.currentIndex + 1} of ${data.totalFiles}: ${fileName}`;
  };
  if (!analyzeListenerAttached) {
    analyzeListenerAttached = true;
    window.api.onAnalyzeProgress((data) => {
      analyzeProgressCallback?.(data);
    });
  }

  analyzeBtn.addEventListener('click', async () => {
    const files = getSelectedFiles();
    if (files.length === 0) {
      analyzeStatusEl.textContent = 'No files selected. Go back to Stage 1.';
      return;
    }

    analyzeBtn.disabled = true;
    analyzeStatusEl.textContent = 'Analyzing...';
    analyzeProgressBar.classList.remove('hidden');
    analyzeProgressFill.style.width = '0%';
    analyzeCurrentFile.classList.remove('hidden');
    analyzeCurrentFile.textContent = '';
    analyzeResultsEl.classList.add('hidden');

    try {
      const docs = await window.api.analyzeLinks(files);
      analyzeProgressBar.classList.add('hidden');
      analyzeCurrentFile.classList.add('hidden');

      // Collect per-file stats
      let totalBroken = 0;
      let filesWithBroken = 0;
      cachedBrokenLinks = [];

      const rows = docs.map((doc: any) => {
        const broken = doc.links.filter((l: any) => l.status === 'missing' || l.status === 'inaccessible');
        totalBroken += broken.length;
        if (broken.length > 0) filesWithBroken++;
        for (const l of broken) {
          cachedBrokenLinks.push({ name: l.name, filePath: l.filePath });
        }
        const docName = doc.name || doc.path.replace(/\\/g, '/').split('/').pop();
        if (broken.length === 0) {
          return `<div class="analyze-row analyze-row-ok">${docName} -- 0 broken links (all links OK)</div>`;
        }
        const brokenPaths = broken.map((l: any) => l.filePath || l.name).join('\n');
        const brokenDetails = broken.map((l: any) => {
          const path = l.filePath || 'unknown path';
          return `<div class="broken-link-detail">${l.name}<span class="broken-link-path">${path}</span></div>`;
        }).join('');
        return `<div class="analyze-row analyze-row-broken" title="${brokenPaths.replace(/"/g, '&quot;')}" style="cursor:pointer;" data-expandable>
          ${docName} -- ${broken.length} broken link${broken.length === 1 ? '' : 's'}
          <div class="broken-link-details hidden">${brokenDetails}</div>
        </div>`;
      });

      analyzeStatusEl.textContent = `${totalBroken} broken link${totalBroken === 1 ? '' : 's'} across ${filesWithBroken} file${filesWithBroken === 1 ? '' : 's'}`;

      analyzeResultsEl.innerHTML = rows.join('');

      // Click to expand/collapse broken link details
      analyzeResultsEl.querySelectorAll('[data-expandable]').forEach((row) => {
        row.addEventListener('click', () => {
          const details = row.querySelector('.broken-link-details');
          if (details) details.classList.toggle('hidden');
        });
      });
      analyzeResultsEl.classList.remove('hidden');
    } catch {
      analyzeStatusEl.textContent = 'Failed to analyze files. Is InDesign running?';
      analyzeProgressBar.classList.add('hidden');
      analyzeCurrentFile.classList.add('hidden');
    }
    analyzeBtn.disabled = false;
  });

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

    // Use cached broken links from analysis if available, otherwise analyze now
    let brokenLinks: { name: string; filePath: string }[] = [];
    if (cachedBrokenLinks.length > 0) {
      brokenLinks = cachedBrokenLinks;
    } else {
      const files = getSelectedFiles();
      try {
        const docs = await window.api.analyzeLinks(files);
        for (const doc of docs) {
          for (const link of doc.links) {
            if (link.status === 'missing' || link.status === 'inaccessible') {
              brokenLinks.push({ name: link.name, filePath: link.filePath });
            }
          }
        }
        cachedBrokenLinks = brokenLinks;
      } catch {
        scanStatus.textContent = 'Failed to analyze files. Is InDesign running?';
        scanBtn.disabled = false;
        cancelBtn.classList.add('hidden');
        progressBar.classList.add('hidden');
        fileCountEl.classList.add('hidden');
        return;
      }
    }

    if (brokenLinks.length === 0) {
      scanStatus.textContent = 'No broken links found — nothing to discover.';
      scanBtn.disabled = false;
      cancelBtn.classList.add('hidden');
      progressBar.classList.add('hidden');
      fileCountEl.classList.add('hidden');
      return;
    }

    // Listen for progress (only attach once to avoid accumulation)
    discoverProgressCallback = (data) => {
      if (scanCancelled) return;
      scanStatus.textContent = `Scanning... ${data.found} file${data.found === 1 ? '' : 's'} found`;
      fileCountEl.textContent = `${data.found} files scanned`;
      // Pulse the progress bar since we don't know total
      progressFill.style.width = '100%';
      progressFill.style.opacity = '0.5';
    };
    if (!discoverListenerAttached) {
      discoverListenerAttached = true;
      window.api.onDiscoverProgress((data) => {
        discoverProgressCallback?.(data);
      });
    }

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
