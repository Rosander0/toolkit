import { TOOLS } from '../registry';
import { convertPdfToImages } from '../services/crossService';
import { renderPdfThumbnails } from '../services/pdfService';
import { triggerBlobDownload } from '../services/imageService';
import { zipSync } from 'fflate';

interface PageSelectionItem {
  index: number;
  selected: boolean;
  thumbUrl: string;
}

let activePdfBuffer: ArrayBuffer | null = null;
let activePdfName: string = '';
let pageList: PageSelectionItem[] = [];
let isExtracting = false;

export function renderPdfToImages(container: HTMLElement): void {
  const meta = TOOLS['pdf-to-images'];
  container.innerHTML = `
    <div class="tool-header">
      <h2 class="tool-title">${meta.name}</h2>
      <p class="tool-tagline">${meta.tagline}</p>
    </div>

    <div class="dropzone" id="p2i-dropzone" tabindex="0" role="button" aria-label="Drop PDF here or click to browse">
      <div class="dropzone-icon">🖼️</div>
      <div class="dropzone-title">Drop a PDF here or click to browse</div>
      <div class="dropzone-hint">Extract pages as PNG or JPG images with selectable DPI &bull; ZIP download</div>
      <input type="file" id="p2i-file-input" class="dropzone-file-input" accept=".pdf" />
    </div>

    <div id="p2i-error-banner" class="notice-banner notice-warning" style="display: none; margin-top: 1rem;">
      <span class="notice-icon">⚠️</span>
      <span id="p2i-error-text"></span>
    </div>

    <div id="p2i-workspace" style="display: none; margin-top: 1.5rem;">
      <div class="card">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;">
          <div>
            <h3 id="p2i-file-name" style="font-size: 1.1rem; font-weight: 600;">document.pdf</h3>
            <span id="p2i-meta-badge" style="font-size: 0.85rem; color: var(--text-secondary);"></span>
          </div>

          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 1rem;">
            <div>
              <label for="p2i-format" style="font-size: 0.8rem; font-weight: 600; display: block;">Format:</label>
              <select id="p2i-format" style="padding: 0.35rem 0.6rem; font-size: 0.85rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                <option value="png">PNG (Lossless)</option>
                <option value="jpg">JPG (Flattened white)</option>
              </select>
            </div>

            <div>
              <label for="p2i-dpi" style="font-size: 0.8rem; font-weight: 600; display: block;">DPI:</label>
              <select id="p2i-dpi" style="padding: 0.35rem 0.6rem; font-size: 0.85rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                <option value="72">72 DPI (Web)</option>
                <option value="150" selected>150 DPI (Standard)</option>
                <option value="300">300 DPI (High Print)</option>
              </select>
            </div>

            <div class="btn-group" style="margin-top: 1rem;">
              <button id="p2i-select-all" class="btn btn-secondary btn-sm">Select All</button>
              <button id="p2i-deselect-all" class="btn btn-secondary btn-sm">Deselect All</button>
              <button id="p2i-convert-btn" class="btn btn-primary btn-sm">Extract Images (ZIP)</button>
              <button id="p2i-clear-btn" class="btn btn-danger btn-sm">Clear</button>
            </div>
          </div>
        </div>

        <div id="p2i-progress-wrap" style="display: none; margin-top: 1rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.3rem;">
            <span id="p2i-progress-label">Rendering pages...</span>
            <span id="p2i-progress-pct">0%</span>
          </div>
          <div class="progress-bar-container">
            <div id="p2i-progress-bar" class="progress-bar-fill" style="width: 0%;"></div>
          </div>
        </div>
      </div>

      <div id="p2i-page-grid" class="thumbnail-grid" style="margin-top: 1.25rem;"></div>
    </div>
  `;

  setupPdfToImagesEvents(container);
}

function setupPdfToImagesEvents(container: HTMLElement): void {
  const dropzone = container.querySelector<HTMLElement>('#p2i-dropzone')!;
  const fileInput = container.querySelector<HTMLInputElement>('#p2i-file-input')!;
  const workspace = container.querySelector<HTMLElement>('#p2i-workspace')!;
  const fileNameEl = container.querySelector<HTMLElement>('#p2i-file-name')!;
  const metaBadge = container.querySelector<HTMLElement>('#p2i-meta-badge')!;
  const formatSelect = container.querySelector<HTMLSelectElement>('#p2i-format')!;
  const dpiSelect = container.querySelector<HTMLSelectElement>('#p2i-dpi')!;
  const selectAllBtn = container.querySelector<HTMLButtonElement>('#p2i-select-all')!;
  const deselectAllBtn = container.querySelector<HTMLButtonElement>('#p2i-deselect-all')!;
  const convertBtn = container.querySelector<HTMLButtonElement>('#p2i-convert-btn')!;
  const clearBtn = container.querySelector<HTMLButtonElement>('#p2i-clear-btn')!;
  const pageGrid = container.querySelector<HTMLElement>('#p2i-page-grid')!;
  const errorBanner = container.querySelector<HTMLElement>('#p2i-error-banner')!;
  const errorText = container.querySelector<HTMLElement>('#p2i-error-text')!;
  const progressWrap = container.querySelector<HTMLElement>('#p2i-progress-wrap')!;
  const progressBar = container.querySelector<HTMLElement>('#p2i-progress-bar')!;
  const progressLabel = container.querySelector<HTMLElement>('#p2i-progress-label')!;
  const progressPct = container.querySelector<HTMLElement>('#p2i-progress-pct')!;

  function showError(msg: string): void {
    errorText.textContent = msg;
    errorBanner.style.display = 'flex';
  }

  function hideError(): void {
    errorBanner.style.display = 'none';
  }

  function renderGrid(): void {
    pageGrid.innerHTML = '';
    const selectedCount = pageList.filter(p => p.selected).length;
    metaBadge.textContent = `${pageList.length} total pages &bull; ${selectedCount} selected for extraction`;

    pageList.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `page-card ${item.selected ? 'selected' : ''}`;

      card.innerHTML = `
        <div class="page-card-header">
          <label style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer;">
            <input type="checkbox" class="p2i-cb" data-index="${index}" ${item.selected ? 'checked' : ''} />
            <span>Page ${index + 1}</span>
          </label>
        </div>
        <div class="page-thumb-container">
          <img src="${item.thumbUrl}" class="page-thumb-img" alt="Page ${index + 1}" />
        </div>
      `;

      pageGrid.appendChild(card);
    });

    pageGrid.querySelectorAll<HTMLInputElement>('.p2i-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.index!, 10);
        pageList[idx].selected = cb.checked;
        renderGrid();
      });
    });
  }

  async function loadPdf(file: File): Promise<void> {
    hideError();
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showError('Selected file is not a PDF document.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      activePdfBuffer = buffer;
      activePdfName = file.name;
      fileNameEl.textContent = file.name;
      workspace.style.display = 'block';
      pageGrid.innerHTML = '<div style="padding: 2rem; color: var(--text-secondary);">Rendering page previews...</div>';

      const thumbs = await renderPdfThumbnails(buffer);
      pageList = thumbs.map((thumbUrl, index) => ({
        index,
        selected: true, // Default to all selected
        thumbUrl
      }));

      renderGrid();
    } catch (err: unknown) {
      showError(`Failed to load PDF: ${err instanceof Error ? err.message : 'Corrupt file'}`);
      workspace.style.display = 'none';
    }
  }

  selectAllBtn.addEventListener('click', () => {
    pageList.forEach(p => { p.selected = true; });
    renderGrid();
  });

  deselectAllBtn.addEventListener('click', () => {
    pageList.forEach(p => { p.selected = false; });
    renderGrid();
  });

  clearBtn.addEventListener('click', () => {
    if (isExtracting) return;
    activePdfBuffer = null;
    pageList = [];
    workspace.style.display = 'none';
    progressWrap.style.display = 'none';
  });

  convertBtn.addEventListener('click', async () => {
    if (isExtracting || !activePdfBuffer) return;
    const selectedPages = pageList.filter(p => p.selected).map(p => p.index);
    if (selectedPages.length === 0) {
      alert('Please select at least one page to extract.');
      return;
    }

    isExtracting = true;
    convertBtn.disabled = true;
    clearBtn.disabled = true;
    progressWrap.style.display = 'block';

    const format = formatSelect.value as 'png' | 'jpg';
    const dpi = parseInt(dpiSelect.value, 10);

    try {
      const imageItems = await convertPdfToImages(
        activePdfBuffer,
        {
          format,
          dpi,
          pageIndices: selectedPages
        },
        (done, total) => {
          const pct = Math.round((done / total) * 100);
          progressBar.style.width = `${pct}%`;
          progressPct.textContent = `${pct}%`;
          progressLabel.textContent = `Extracting page ${done} of ${total}...`;
        }
      );

      progressBar.style.width = '100%';
      progressPct.textContent = '100%';
      progressLabel.textContent = 'Packaging ZIP...';

      // Zip entries using fflate
      const zipEntries: Record<string, Uint8Array> = {};
      for (const img of imageItems) {
        zipEntries[img.filename] = new Uint8Array(await img.blob.arrayBuffer());
      }

      const zipped = zipSync(zipEntries, { level: 6 });
      const zipBlob = new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
      triggerBlobDownload(zipBlob, `extracted_${activePdfName.replace(/\.pdf$/i, '')}_images.zip`);
    } catch (err: unknown) {
      showError(`Extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      isExtracting = false;
      convertBtn.disabled = false;
      clearBtn.disabled = false;
    }
  });

  // Dropzone drag-drop
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      loadPdf(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      fileInput.value = '';
      loadPdf(file);
    }
  });
}
