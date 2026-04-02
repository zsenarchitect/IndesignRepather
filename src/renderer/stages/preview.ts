import { getSelectedFiles, getMappings, setPreviewResults, getPreviewResults, setSelectedFiles } from '../app';
import type { DocumentInfo, LinkInfo } from '../../shared/types';
import { createProgressBar } from '../components/progress';

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
}

export async function init(container: HTMLElement) {
  const files = getSelectedFiles();
  const mappings = getMappings();

  container.innerHTML = `
    <h2>Preview</h2>
    <p>Reviewing link changes before execution...</p>
    <div id="preview-loading-section"></div>
    <div id="preview-content" class="hidden"></div>
  `;

  const loadingSection = container.querySelector('#preview-loading-section') as HTMLElement;
  const contentEl = container.querySelector('#preview-content') as HTMLElement;

  const previewProgress = createProgressBar();
  loadingSection.appendChild(previewProgress.element);

  if (files.length > 1) {
    previewProgress.update(0, `Loading preview... (0 of ${files.length} files)`);
  } else {
    previewProgress.setIndeterminate('Loading preview...');
  }

  // Listen for per-file preview progress
  let previewProgressListenerAttached = false;
  let previewProgressCallback: ((data: { currentIndex: number; totalFiles: number; currentFile: string }) => void) | null = null;
  previewProgressCallback = (data) => {
    const pct = Math.round(((data.currentIndex + 1) / data.totalFiles) * 100);
    const fileName = data.currentFile.replace(/\\/g, '/').split('/').pop() || data.currentFile;
    previewProgress.update(pct, `Loading preview... file ${data.currentIndex + 1} of ${data.totalFiles}: ${fileName}`);
  };
  if (!previewProgressListenerAttached) {
    previewProgressListenerAttached = true;
    window.api.onPreviewProgress((data) => {
      previewProgressCallback?.(data);
    });
  }

  let results: DocumentInfo[];
  try {
    results = await window.api.previewRepath(files, mappings);
    setPreviewResults(results);
  } catch {
    previewProgress.hide();
    loadingSection.innerHTML = '<div style="color:#888;font-size:13px;">Failed to generate preview. Is InDesign running?</div>';
    return;
  }

  previewProgressCallback = null;
  previewProgress.hide();
  contentEl.classList.remove('hidden');

  // Compute summary
  let willRepath = 0;
  let exist = 0;
  let missing = 0;
  let skipped = 0;

  for (const doc of results) {
    for (const link of doc.links) {
      if (link.newPath) {
        willRepath++;
        if (link.newPathExists) exist++;
        else missing++;
      } else {
        skipped++;
      }
    }
  }

  contentEl.innerHTML = `
    <div class="summary-bar">
      <span>${willRepath} will repath</span>
      <span class="status-ok">${exist} exist</span>
      <span class="status-missing" title="The new path doesn't exist on disk yet">${missing} new path not found</span>
      <span class="status-skip">${skipped} skipped</span>
    </div>
    <div id="preview-filters" style="margin:8px 0;display:flex;gap:8px;">
      <button class="filter-btn active" data-filter="all" style="font-size:12px;padding:4px 12px;">All</button>
      <button class="filter-btn" data-filter="repathed" style="font-size:12px;padding:4px 12px;">Repathed</button>
      <button class="filter-btn" data-filter="missing" style="font-size:12px;padding:4px 12px;">New Path Not Found</button>
      <button class="filter-btn" data-filter="skipped" style="font-size:12px;padding:4px 12px;">Skipped</button>
    </div>
    <div id="preview-groups"></div>
    <div id="thumb-overlay" class="hidden" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:100;cursor:pointer;">
      <img id="thumb-overlay-img" style="max-width:80%;max-height:80%;border-radius:6px;">
    </div>
  `;

  const groupsEl = contentEl.querySelector('#preview-groups') as HTMLElement;

  // Track which files are included for execution
  const includedFiles = new Set(files);

  for (const doc of results) {
    const docId = `doc-${Math.random().toString(36).slice(2, 8)}`;
    const groupHtml = `
      <div class="doc-group-header" style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" checked class="doc-include-cb" data-doc-path="${escapeAttr(doc.path)}" title="Include this file in execution" style="cursor:pointer;">
        <span style="cursor:pointer;flex:1;" data-toggle="${docId}">${basename(doc.name)} (${doc.links.length} links)</span>
      </div>
      <div id="${docId}">
        <table class="link-table">
          <thead>
            <tr>
              <th style="width:56px;"></th>
              <th>Link</th>
              <th>Path Change</th>
              <th>Matched Rule</th>
              <th style="width:40px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${doc.links.map((link) => renderLinkRow(link, mappings)).join('')}
          </tbody>
        </table>
      </div>
    `;
    groupsEl.insertAdjacentHTML('beforeend', groupHtml);

    // Collapsible
    groupsEl.querySelector(`[data-toggle="${docId}"]`)?.addEventListener('click', () => {
      const el = document.getElementById(docId);
      if (el) el.classList.toggle('hidden');
    });
  }

  // File inclusion checkboxes — update selectedFiles when toggled
  groupsEl.querySelectorAll('.doc-include-cb').forEach((cb) => {
    cb.addEventListener('change', () => {
      const input = cb as HTMLInputElement;
      const docPath = input.dataset.docPath || '';
      if (input.checked) {
        includedFiles.add(docPath);
      } else {
        includedFiles.delete(docPath);
      }
      // Update selectedFiles so Execute stage only processes included files
      setSelectedFiles(Array.from(includedFiles));
    });
  });

  // Load thumbnails async
  const thumbEls = contentEl.querySelectorAll('[data-thumb-path]');
  Promise.all(Array.from(thumbEls).map(async (el) => {
    const path = (el as HTMLElement).dataset.thumbPath;
    if (!path) return;
    try {
      const dataUrl = await window.api.getThumbnail(path);
      if (dataUrl) {
        (el as HTMLImageElement).src = dataUrl;
        el.classList.remove('thumb-missing');
        el.classList.add('thumb');
      }
    } catch {
      // keep placeholder
    }
  }));

  // Thumbnail overlay (click to enlarge)
  const overlay = contentEl.querySelector('#thumb-overlay') as HTMLElement;
  const overlayImg = contentEl.querySelector('#thumb-overlay-img') as HTMLImageElement;

  contentEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('thumb') && target.tagName === 'IMG') {
      const src = (target as HTMLImageElement).src;
      if (src) {
        overlayImg.src = src;
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
      }
    }
  });

  overlay?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
  });

  // Filter buttons
  const filterBtns = contentEl.querySelectorAll('.filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = (btn as HTMLElement).dataset.filter;
      const rows = contentEl.querySelectorAll('[data-link-filter]');
      rows.forEach((row) => {
        const rowFilter = (row as HTMLElement).dataset.linkFilter;
        if (filter === 'all' || rowFilter === filter) {
          (row as HTMLElement).style.display = '';
        } else {
          (row as HTMLElement).style.display = 'none';
        }
      });
    });
  });
}

function renderLinkRow(link: LinkInfo, mappings: import('../../shared/types').Mapping[]): string {
  let statusIcon: string;
  let statusClass: string;
  let pathChange: string;
  let filterType: string;
  let matchedRule = '';

  if (link.newPath) {
    if (link.newPathExists) {
      statusIcon = '&#10003;';
      statusClass = 'status-ok';
      filterType = 'repathed';
    } else {
      statusIcon = '&#10007;';
      statusClass = 'status-missing';
      filterType = 'missing';
      // Title attribute is added on the status cell below
    }
    pathChange = `
      <div style="font-size:12px;color:#888;word-break:break-all;">${escapeHtml(link.filePath)}</div>
      <div style="font-size:12px;color:#ccc;word-break:break-all;">-> ${escapeHtml(link.newPath)}</div>
    `;

    // Find which mapping rule matched
    const normalizedPath = link.filePath.toLowerCase().replace(/\//g, '\\');
    for (const m of mappings) {
      const normalizedOld = m.oldPath.toLowerCase().replace(/\//g, '\\');
      if (normalizedPath.startsWith(normalizedOld)) {
        matchedRule = `<span style="font-size:11px;color:#666;word-break:break-all;">${escapeHtml(m.oldPath)} -> ${escapeHtml(m.newPath)}</span>`;
        break;
      }
    }
  } else {
    statusIcon = '&mdash;';
    statusClass = 'status-skip';
    filterType = 'skipped';
    pathChange = '<span style="color:#666;font-size:12px;">no match</span>';
  }

  // Use the newPath if it exists (for thumbnail), otherwise try original
  const thumbPath = link.newPathExists ? link.newPath! : link.filePath;

  return `
    <tr data-link-filter="${filterType}">
      <td>
        <img class="thumb-missing" data-thumb-path="${escapeAttr(thumbPath)}" style="width:48px;height:48px;object-fit:cover;border-radius:3px;background:#2a2a2a;cursor:pointer;" src="">
      </td>
      <td style="font-size:13px;">${escapeHtml(link.name)}</td>
      <td>${pathChange}</td>
      <td>${matchedRule || '<span style="color:#666;font-size:11px;">&mdash;</span>'}</td>
      <td class="${statusClass}" style="text-align:center;font-size:16px;" ${filterType === 'missing' ? 'title="The new path doesn\'t exist on disk yet"' : ''}>${statusIcon}</td>
    </tr>
  `;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
