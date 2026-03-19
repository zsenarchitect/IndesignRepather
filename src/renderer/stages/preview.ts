import { getSelectedFiles, getMappings, setPreviewResults, getPreviewResults } from '../app';
import type { DocumentInfo, LinkInfo } from '../../shared/types';

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
}

export async function init(container: HTMLElement) {
  const files = getSelectedFiles();
  const mappings = getMappings();

  container.innerHTML = `
    <h2>Preview</h2>
    <p>Reviewing link changes before execution...</p>
    <div id="preview-loading" style="color:#888;font-size:13px;">Loading preview...</div>
    <div id="preview-content" class="hidden"></div>
  `;

  const loadingEl = container.querySelector('#preview-loading') as HTMLElement;
  const contentEl = container.querySelector('#preview-content') as HTMLElement;

  let results: DocumentInfo[];
  try {
    results = await window.api.previewRepath(files, mappings);
    setPreviewResults(results);
  } catch {
    loadingEl.textContent = 'Failed to generate preview. Is InDesign running?';
    return;
  }

  loadingEl.classList.add('hidden');
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
      <span class="status-missing">${missing} missing</span>
      <span class="status-skip">${skipped} skipped</span>
    </div>
    <div id="preview-groups"></div>
    <div id="thumb-overlay" class="hidden" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:100;cursor:pointer;">
      <img id="thumb-overlay-img" style="max-width:80%;max-height:80%;border-radius:6px;">
    </div>
  `;

  const groupsEl = contentEl.querySelector('#preview-groups') as HTMLElement;

  for (const doc of results) {
    const docId = `doc-${Math.random().toString(36).slice(2, 8)}`;
    const groupHtml = `
      <div class="doc-group-header" style="cursor:pointer;" data-toggle="${docId}">
        ${basename(doc.name)} (${doc.links.length} links)
      </div>
      <div id="${docId}">
        <table class="link-table">
          <thead>
            <tr>
              <th style="width:56px;"></th>
              <th>Link</th>
              <th>Path Change</th>
              <th style="width:40px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${doc.links.map((link) => renderLinkRow(link)).join('')}
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

  // Load thumbnails async
  const thumbEls = contentEl.querySelectorAll('[data-thumb-path]');
  thumbEls.forEach(async (el) => {
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
  });

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
}

function renderLinkRow(link: LinkInfo): string {
  let statusIcon: string;
  let statusClass: string;
  let pathChange: string;

  if (link.newPath) {
    if (link.newPathExists) {
      statusIcon = '&#10003;';
      statusClass = 'status-ok';
    } else {
      statusIcon = '&#10007;';
      statusClass = 'status-missing';
    }
    pathChange = `
      <div style="font-size:12px;color:#888;word-break:break-all;">${link.filePath}</div>
      <div style="font-size:12px;color:#ccc;word-break:break-all;">-> ${link.newPath}</div>
    `;
  } else {
    statusIcon = '&mdash;';
    statusClass = 'status-skip';
    pathChange = '<span style="color:#666;font-size:12px;">no match</span>';
  }

  // Use the newPath if it exists (for thumbnail), otherwise try original
  const thumbPath = link.newPathExists ? link.newPath! : link.filePath;

  return `
    <tr>
      <td>
        <img class="thumb-missing" data-thumb-path="${escapeAttr(thumbPath)}" style="width:48px;height:48px;object-fit:cover;border-radius:3px;background:#2a2a2a;cursor:pointer;" src="">
      </td>
      <td style="font-size:13px;">${link.name}</td>
      <td>${pathChange}</td>
      <td class="${statusClass}" style="text-align:center;font-size:16px;">${statusIcon}</td>
    </tr>
  `;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
