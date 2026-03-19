import { getMappings, setMappings } from '../app';
import type { Mapping } from '../../shared/types';

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
              <td><input type="text" class="input-old" data-index="${i}" value="${escapeAttr(r.oldPath)}" placeholder="e.g. P:\\\\Old\\\\Server"></td>
              <td><button class="btn-folder btn-folder-old" data-index="${i}" title="Browse">&#128193;</button></td>
              <td><input type="text" class="input-new" data-index="${i}" value="${escapeAttr(r.newPath)}" placeholder="e.g. \\\\\\\\nas\\\\new\\\\path"></td>
              <td><button class="btn-folder btn-folder-new" data-index="${i}" title="Browse">&#128193;</button></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      <button id="btn-add-row" style="font-size:12px;margin-top:8px;">+ Add Row</button>
    `;

    attachListeners();
  }

  function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function saveAndUpdate() {
    // Filter to only valid mappings for save
    const validMappings = rows.filter((r) => r.oldPath.trim() && r.newPath.trim());
    setMappings(validMappings);
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

    // Text inputs
    container.querySelectorAll('.input-old').forEach((input) => {
      input.addEventListener('input', () => {
        const el = input as HTMLInputElement;
        const idx = parseInt(el.dataset.index || '0', 10);
        rows[idx].oldPath = el.value;
        saveAndUpdate();
      });
    });

    container.querySelectorAll('.input-new').forEach((input) => {
      input.addEventListener('input', () => {
        const el = input as HTMLInputElement;
        const idx = parseInt(el.dataset.index || '0', 10);
        rows[idx].newPath = el.value;
        saveAndUpdate();
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
  }

  render();
}
