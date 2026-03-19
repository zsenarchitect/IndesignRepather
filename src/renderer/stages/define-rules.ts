import { getMappings, setMappings } from '../app';
import type { Mapping } from '../../shared/types';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function init(container: HTMLElement) {
  let rows: Mapping[] = [...getMappings()];

  function render() {
    container.innerHTML = `
      <h2>Mapping Rules</h2>
      <p>Define path substitution rules. Old paths will be replaced with new paths in all links.</p>

      <table class="mapping-table">
        <thead>
          <tr>
            <th style="width:32px;"></th>
            <th>Old Path</th>
            <th style="width:36px;"></th>
            <th>New Path</th>
            <th style="width:36px;"></th>
          </tr>
        </thead>
        <tbody id="mapping-rows">
          ${rows
            .map(
              (r, i) => `
            <tr data-index="${i}">
              <td><button class="btn-remove" data-index="${i}" title="Remove">&#10005;</button></td>
              <td><input type="text" class="input-old" data-index="${i}" value="${escapeAttr(r.oldPath)}" placeholder="e.g., P:\\OldServer\\Graphics"></td>
              <td><button class="btn-folder btn-folder-old" data-index="${i}" title="Browse">&#128193;</button></td>
              <td><input type="text" class="input-new" data-index="${i}" value="${escapeAttr(r.newPath)}" placeholder="e.g., \\\\nas\\NewServer\\Graphics"></td>
              <td><button class="btn-folder btn-folder-new" data-index="${i}" title="Browse">&#128193;</button></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
        <button id="btn-add-row" style="font-size:12px;">+ Add Row</button>
        <button id="btn-export-rules" style="font-size:12px;">Export Rules</button>
        <button id="btn-import-rules" style="font-size:12px;">Import Rules</button>
        <span id="save-indicator-slot"></span>
      </div>

      <p style="margin-top:12px;font-size:12px;color:#666;">Rules are applied top to bottom. The first matching rule wins for each link.</p>
    `;

    attachListeners();
  }

  function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showSavedIndicator() {
    const slot = container.querySelector('#save-indicator-slot');
    if (!slot) return;
    // Remove any existing indicator
    slot.innerHTML = '';
    const savedIndicator = document.createElement('span');
    savedIndicator.textContent = 'Saved';
    savedIndicator.className = 'save-indicator';
    slot.appendChild(savedIndicator);
    setTimeout(() => {
      savedIndicator.classList.add('fade');
    }, 1000);
    setTimeout(() => {
      savedIndicator.remove();
    }, 1500);
  }

  function saveAndUpdate() {
    // Filter to only valid mappings for save
    const validMappings = rows.filter((r) => r.oldPath.trim() && r.newPath.trim());
    setMappings(validMappings);
    showSavedIndicator();
  }

  function debouncedSave() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      saveAndUpdate();
    }, 400);
  }

  function attachListeners() {
    // Remove buttons
    container.querySelectorAll('.btn-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.index || '0', 10);
        rows.splice(idx, 1);
        saveAndUpdate();
        render();
      });
    });

    // Text inputs — update data in-place without re-rendering, debounce save
    container.querySelectorAll('.input-old').forEach((input) => {
      input.addEventListener('input', () => {
        const el = input as HTMLInputElement;
        const idx = parseInt(el.dataset.index || '0', 10);
        rows[idx].oldPath = el.value;
        debouncedSave();
      });
    });

    container.querySelectorAll('.input-new').forEach((input) => {
      input.addEventListener('input', () => {
        const el = input as HTMLInputElement;
        const idx = parseInt(el.dataset.index || '0', 10);
        rows[idx].newPath = el.value;
        debouncedSave();
      });
    });

    // Folder picker for old path
    container.querySelectorAll('.btn-folder-old').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt((btn as HTMLElement).dataset.index || '0', 10);
        const folder = await window.api.selectFolderPath();
        if (folder) {
          rows[idx].oldPath = folder;
          saveAndUpdate();
          render();
        }
      });
    });

    // Folder picker for new path
    container.querySelectorAll('.btn-folder-new').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt((btn as HTMLElement).dataset.index || '0', 10);
        const folder = await window.api.selectFolderPath();
        if (folder) {
          rows[idx].newPath = folder;
          saveAndUpdate();
          render();
        }
      });
    });

    // Add row
    container.querySelector('#btn-add-row')?.addEventListener('click', () => {
      rows.push({ oldPath: '', newPath: '' });
      render();
    });

    // Export rules
    container.querySelector('#btn-export-rules')?.addEventListener('click', async () => {
      const validMappings = rows.filter((r) => r.oldPath.trim() && r.newPath.trim());
      if (validMappings.length === 0) return;
      await window.api.exportRules(JSON.stringify(validMappings, null, 2));
    });

    // Import rules
    container.querySelector('#btn-import-rules')?.addEventListener('click', async () => {
      const data = await window.api.importRules();
      if (!data) return;
      try {
        const imported: Mapping[] = JSON.parse(data);
        if (Array.isArray(imported) && imported.every((m) => typeof m.oldPath === 'string' && typeof m.newPath === 'string')) {
          rows = imported;
          saveAndUpdate();
          render();
        }
      } catch {
        // Invalid JSON — ignore
      }
    });
  }

  render();
}
