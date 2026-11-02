import { TOOLS, formatFileSize, sanitizeFilename, parseSplitRange } from '../registry';
import {
  mergePdfs,
  modifyPdfPages,
  splitPdfByPages,
  getPdfPageCount,
  renderPdfThumbnails
} from '../services/pdfService';
import { triggerBlobDownload } from '../services/imageService';

interface PageItem {
  id: string;
  originalIndex: number;
  rotation: number;
  selected: boolean;
  thumbnailDataUrl?: string;
}

interface MergeDocItem {
  id: string;
  file: File;
  pageCount: number;
  buffer: ArrayBuffer;
}

let currentPdfBuffer: ArrayBuffer | null = null;
let currentPdfName: string = '';
let pageItems: PageItem[] = [];
let mergeList: MergeDocItem[] = [];
let activeMode: 'organize' | 'merge' = 'organize';

export function renderPdfTools(container: HTMLElement): void {
  const meta = TOOLS['pdf-tools'];
  container.innerHTML = `
    <div class="tool-header">
      <h2 class="tool-title">${meta.name}</h2>
      <p class="tool-tagline">${meta.tagline}</p>
    </div>

    <!-- Mode Selector -->
    <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem;">
      <button id="pdf-tab-organize" class="btn btn-primary">Page Organizer, Split &amp; Rotate</button>
      <button id="pdf-tab-merge" class="btn btn-secondary">Merge Multiple PDFs</button>
    </div>

    <!-- Dropzone -->
    <div class="dropzone" id="pdf-dropzone" tabindex="0" role="button" aria-label="Drop PDF files here or click to browse">
      <div class="dropzone-icon">📄</div>
      <div class="dropzone-title" id="pdf-dropzone-title">Drop PDF file here or click to browse</div>
      <div class="dropzone-hint" id="pdf-dropzone-hint">Supports Merge, Split, Rearrange, Rotate, and Extract &bull; Max 200MB per file</div>
      <input type="file" id="pdf-file-input" class="dropzone-file-input" multiple accept=".pdf" />
    </div>

    <div id="pdf-error-banner" class="notice-banner notice-warning" style="display: none; margin-top: 1rem;">
      <span class="notice-icon">⚠️</span>
      <span id="pdf-error-text"></span>
    </div>

    <!-- Organizer Workspace -->
    <div id="pdf-organizer-workspace" style="display: none; margin-top: 1.5rem;">
      <div class="card">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem;">
          <div>
            <h3 id="pdf-current-name" style="font-size: 1.1rem; font-weight: 600;">document.pdf</h3>
            <span id="pdf-page-count-badge" style="font-size: 0.85rem; color: var(--text-secondary);"></span>
          </div>
          <div class="btn-group">
            <button id="pdf-rotate-all-btn" class="btn btn-secondary btn-sm">Rotate All (+90°)</button>
            <button id="pdf-select-all-btn" class="btn btn-secondary btn-sm">Select All</button>
            <button id="pdf-deselect-btn" class="btn btn-secondary btn-sm">Deselect All</button>
            <button id="pdf-extract-btn" class="btn btn-secondary btn-sm">Extract Selected</button>
            <button id="pdf-save-btn" class="btn btn-primary btn-sm">Save &amp; Download PDF</button>
            <button id="pdf-close-btn" class="btn btn-danger btn-sm">Close</button>
          </div>
        </div>

        <!-- Range Split Bar -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
          <label for="pdf-split-input" style="font-size: 0.85rem; font-weight: 600;">Split by range:</label>
          <input
            type="text"
            id="pdf-split-input"
            placeholder="e.g. 1-3, 5, 8"
            style="padding: 0.35rem 0.6rem; font-size: 0.85rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 160px;"
          />
          <button id="pdf-split-btn" class="btn btn-secondary btn-sm">Split &amp; Download</button>
          <span id="pdf-split-error" style="font-size: 0.8rem; color: var(--accent-danger);"></span>
        </div>
      </div>

      <div id="pdf-thumbnail-grid" class="thumbnail-grid"></div>
    </div>

    <!-- Merge Workspace -->
    <div id="pdf-merge-workspace" style="display: none; margin-top: 1.5rem;">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
          <h3 style="font-size: 1.1rem; font-weight: 600;">PDF Documents to Merge</h3>
          <div class="btn-group">
            <button id="merge-clear-btn" class="btn btn-secondary btn-sm">Clear All</button>
            <button id="merge-execute-btn" class="btn btn-primary btn-sm">Merge &amp; Download PDF</button>
          </div>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
          Drag documents or use the Up/Down buttons to adjust the order of pages in the merged file.
        </p>
        <div id="merge-file-list" class="file-list"></div>
      </div>
    </div>
  `;

  setupPdfToolsEvents(container);
}

function setupPdfToolsEvents(container: HTMLElement): void {
  const tabOrganize = container.querySelector<HTMLButtonElement>('#pdf-tab-organize')!;
  const tabMerge = container.querySelector<HTMLButtonElement>('#pdf-tab-merge')!;
  const dropzone = container.querySelector<HTMLElement>('#pdf-dropzone')!;
  const dropzoneTitle = container.querySelector<HTMLElement>('#pdf-dropzone-title')!;
  const fileInput = container.querySelector<HTMLInputElement>('#pdf-file-input')!;
  const organizerWs = container.querySelector<HTMLElement>('#pdf-organizer-workspace')!;
  const mergeWs = container.querySelector<HTMLElement>('#pdf-merge-workspace')!;
  const errorBanner = container.querySelector<HTMLElement>('#pdf-error-banner')!;
  const errorText = container.querySelector<HTMLElement>('#pdf-error-text')!;
  const currentNameEl = container.querySelector<HTMLElement>('#pdf-current-name')!;
  const pageCountBadge = container.querySelector<HTMLElement>('#pdf-page-count-badge')!;
  const thumbnailGrid = container.querySelector<HTMLElement>('#pdf-thumbnail-grid')!;
  const rotateAllBtn = container.querySelector<HTMLButtonElement>('#pdf-rotate-all-btn')!;
  const selectAllBtn = container.querySelector<HTMLButtonElement>('#pdf-select-all-btn')!;
  const deselectBtn = container.querySelector<HTMLButtonElement>('#pdf-deselect-btn')!;
  const extractBtn = container.querySelector<HTMLButtonElement>('#pdf-extract-btn')!;
  const saveBtn = container.querySelector<HTMLButtonElement>('#pdf-save-btn')!;
  const closeBtn = container.querySelector<HTMLButtonElement>('#pdf-close-btn')!;
  const splitInput = container.querySelector<HTMLInputElement>('#pdf-split-input')!;
  const splitBtn = container.querySelector<HTMLButtonElement>('#pdf-split-btn')!;
  const splitError = container.querySelector<HTMLElement>('#pdf-split-error')!;
  const mergeListEl = container.querySelector<HTMLElement>('#merge-file-list')!;
  const mergeClearBtn = container.querySelector<HTMLButtonElement>('#merge-clear-btn')!;
  const mergeExecuteBtn = container.querySelector<HTMLButtonElement>('#merge-execute-btn')!;

  function showError(msg: string): void {
    errorText.textContent = msg;
    errorBanner.style.display = 'flex';
  }

  function hideError(): void {
    errorBanner.style.display = 'none';
  }

  function setMode(mode: 'organize' | 'merge'): void {
    activeMode = mode;
    hideError();
    if (mode === 'organize') {
      tabOrganize.className = 'btn btn-primary';
      tabMerge.className = 'btn btn-secondary';
      dropzoneTitle.textContent = 'Drop a single PDF here or click to browse';
      mergeWs.style.display = 'none';
      if (currentPdfBuffer) organizerWs.style.display = 'block';
    } else {
      tabOrganize.className = 'btn btn-secondary';
      tabMerge.className = 'btn btn-primary';
      dropzoneTitle.textContent = 'Drop multiple PDF files here to merge';
      organizerWs.style.display = 'none';
      mergeWs.style.display = 'block';
      renderMergeList();
    }
  }

  tabOrganize.addEventListener('click', () => setMode('organize'));
  tabMerge.addEventListener('click', () => setMode('merge'));

  async function loadSinglePdf(file: File): Promise<void> {
    hideError();
    try {
      const buffer = await file.arrayBuffer();
      const count = await getPdfPageCount(buffer);
      currentPdfBuffer = buffer;
      currentPdfName = file.name;
      currentNameEl.textContent = file.name;
      pageCountBadge.textContent = `${count} pages (${formatFileSize(file.size)})`;

      thumbnailGrid.innerHTML = '<div style="padding: 2rem; color: var(--text-secondary);">Rendering page thumbnails...</div>';
      organizerWs.style.display = 'block';

      const thumbs = await renderPdfThumbnails(buffer);
      pageItems = thumbs.map((dataUrl, idx) => ({
        id: `page-${idx}`,
        originalIndex: idx,
        rotation: 0,
        selected: false,
        thumbnailDataUrl: dataUrl
      }));

      renderThumbnailGrid();
    } catch (err: unknown) {
      showError(`Failed to read PDF: ${err instanceof Error ? err.message : 'Corrupt PDF'}`);
      organizerWs.style.display = 'none';
      currentPdfBuffer = null;
    }
  }

  function renderThumbnailGrid(): void {
    thumbnailGrid.innerHTML = '';
    pageCountBadge.textContent = `${pageItems.length} active pages`;

    pageItems.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `page-card ${item.selected ? 'selected' : ''}`;
      card.draggable = true;
      card.dataset.index = index.toString();

      card.innerHTML = `
        <div class="page-card-header">
          <label style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer;">
            <input type="checkbox" class="page-checkbox" data-index="${index}" ${item.selected ? 'checked' : ''} />
            <span>Page ${item.originalIndex + 1}</span>
          </label>
          <span style="font-size: 0.75rem; color: var(--text-secondary);">${item.rotation ? `${item.rotation}°` : ''}</span>
        </div>
        <div class="page-thumb-container">
          <img src="${item.thumbnailDataUrl}" class="page-thumb-img" style="transform: rotate(${item.rotation}deg);" alt="Page ${item.originalIndex + 1}" />
        </div>
        <div class="page-card-actions">
          <button class="btn-icon btn-rotate" data-index="${index}" title="Rotate +90°">🔄 Rotate</button>
          <button class="btn-icon btn-icon-danger btn-delete" data-index="${index}" title="Remove page">🗑️ Remove</button>
        </div>
      `;

      // Drag and drop events for rearrangement
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', index.toString());
          e.dataTransfer.effectAllowed = 'move';
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        thumbnailGrid.querySelectorAll('.page-card').forEach(c => c.classList.remove('drag-over'));
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('drag-over');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const fromIndexStr = e.dataTransfer?.getData('text/plain');
        if (fromIndexStr !== undefined) {
          const fromIndex = parseInt(fromIndexStr, 10);
          const toIndex = index;
          if (fromIndex !== toIndex && fromIndex >= 0 && fromIndex < pageItems.length) {
            const [movedItem] = pageItems.splice(fromIndex, 1);
            pageItems.splice(toIndex, 0, movedItem);
            renderThumbnailGrid();
          }
        }
      });

      thumbnailGrid.appendChild(card);
    });

    // Checkbox toggle
    thumbnailGrid.querySelectorAll<HTMLInputElement>('.page-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.index!, 10);
        pageItems[idx].selected = cb.checked;
        renderThumbnailGrid();
      });
    });

    // Rotate per page
    thumbnailGrid.querySelectorAll<HTMLButtonElement>('.btn-rotate').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!, 10);
        pageItems[idx].rotation = (pageItems[idx].rotation + 90) % 360;
        renderThumbnailGrid();
      });
    });

    // Delete per page
    thumbnailGrid.querySelectorAll<HTMLButtonElement>('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!, 10);
        pageItems.splice(idx, 1);
        renderThumbnailGrid();
      });
    });
  }

  // Rotate all
  rotateAllBtn.addEventListener('click', () => {
    pageItems.forEach(item => {
      item.rotation = (item.rotation + 90) % 360;
    });
    renderThumbnailGrid();
  });

  selectAllBtn.addEventListener('click', () => {
    pageItems.forEach(item => { item.selected = true; });
    renderThumbnailGrid();
  });

  deselectBtn.addEventListener('click', () => {
    pageItems.forEach(item => { item.selected = false; });
    renderThumbnailGrid();
  });

  // Extract selected pages
  extractBtn.addEventListener('click', async () => {
    if (!currentPdfBuffer) return;
    const selected = pageItems.filter(p => p.selected);
    if (selected.length === 0) {
      alert('Please select at least one page to extract using the checkboxes.');
      return;
    }

    try {
      const pageConfigs = selected.map(p => ({
        originalIndex: p.originalIndex,
        rotation: p.rotation
      }));
      const modifiedBytes = await modifyPdfPages(currentPdfBuffer, pageConfigs);
      const blob = new Blob([modifiedBytes as unknown as BlobPart], { type: 'application/pdf' });
      triggerBlobDownload(blob, `extracted_${sanitizeFilename(currentPdfName)}`);
    } catch (err: unknown) {
      showError(`Extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  });

  // Save reorganized/modified PDF
  saveBtn.addEventListener('click', async () => {
    if (!currentPdfBuffer || pageItems.length === 0) {
      alert('Cannot save an empty PDF.');
      return;
    }

    try {
      const pageConfigs = pageItems.map(p => ({
        originalIndex: p.originalIndex,
        rotation: p.rotation
      }));
      const modifiedBytes = await modifyPdfPages(currentPdfBuffer, pageConfigs);
      const blob = new Blob([modifiedBytes as unknown as BlobPart], { type: 'application/pdf' });
      triggerBlobDownload(blob, `modified_${sanitizeFilename(currentPdfName)}`);
    } catch (err: unknown) {
      showError(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  });

  closeBtn.addEventListener('click', () => {
    currentPdfBuffer = null;
    currentPdfName = '';
    pageItems = [];
    organizerWs.style.display = 'none';
  });

  // Split range execution
  splitBtn.addEventListener('click', async () => {
    if (!currentPdfBuffer) return;
    splitError.textContent = '';
    const rawVal = splitInput.value.trim();

    try {
      const totalPages = await getPdfPageCount(currentPdfBuffer);
      const pagesToExtract = parseSplitRange(rawVal, totalPages);
      const splitBytes = await splitPdfByPages(currentPdfBuffer, pagesToExtract);
      const blob = new Blob([splitBytes as unknown as BlobPart], { type: 'application/pdf' });
      triggerBlobDownload(blob, `split_${sanitizeFilename(currentPdfName)}`);
    } catch (err: unknown) {
      splitError.textContent = err instanceof Error ? err.message : 'Invalid range';
    }
  });

  // Merge List Rendering
  function renderMergeList(): void {
    if (mergeList.length === 0) {
      mergeListEl.innerHTML = '<div style="color: var(--text-secondary); padding: 1rem 0;">No PDF files added yet. Drop PDFs to merge.</div>';
      return;
    }

    mergeListEl.innerHTML = '';
    mergeList.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'file-item';
      row.draggable = true;

      row.innerHTML = `
        <div class="file-info">
          <span style="font-size: 1.25rem;">📄</span>
          <div>
            <div class="file-name">${item.file.name}</div>
            <div class="file-meta">${item.pageCount} pages &bull; ${formatFileSize(item.file.size)}</div>
          </div>
        </div>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm merge-up-btn" data-index="${index}" ${index === 0 ? 'disabled' : ''}>▲ Up</button>
          <button class="btn btn-secondary btn-sm merge-down-btn" data-index="${index}" ${index === mergeList.length - 1 ? 'disabled' : ''}>▼ Down</button>
          <button class="btn btn-danger btn-sm merge-del-btn" data-index="${index}">Remove</button>
        </div>
      `;

      mergeListEl.appendChild(row);
    });

    mergeListEl.querySelectorAll<HTMLButtonElement>('.merge-up-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!, 10);
        if (idx > 0) {
          const temp = mergeList[idx];
          mergeList[idx] = mergeList[idx - 1];
          mergeList[idx - 1] = temp;
          renderMergeList();
        }
      });
    });

    mergeListEl.querySelectorAll<HTMLButtonElement>('.merge-down-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!, 10);
        if (idx < mergeList.length - 1) {
          const temp = mergeList[idx];
          mergeList[idx] = mergeList[idx + 1];
          mergeList[idx + 1] = temp;
          renderMergeList();
        }
      });
    });

    mergeListEl.querySelectorAll<HTMLButtonElement>('.merge-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!, 10);
        mergeList.splice(idx, 1);
        renderMergeList();
      });
    });
  }

  async function addFilesToMerge(files: FileList | File[]): Promise<void> {
    hideError();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        showError(`File "${file.name}" is not a PDF`);
        continue;
      }
      try {
        const buffer = await file.arrayBuffer();
        const pageCount = await getPdfPageCount(buffer);
        mergeList.push({
          id: `merge-${Date.now()}-${i}`,
          file,
          pageCount,
          buffer
        });
      } catch (err: unknown) {
        showError(`Could not read "${file.name}": ${err instanceof Error ? err.message : 'Corrupt file'}`);
      }
    }
    renderMergeList();
  }

  mergeClearBtn.addEventListener('click', () => {
    mergeList = [];
    renderMergeList();
  });

  mergeExecuteBtn.addEventListener('click', async () => {
    if (mergeList.length < 2) {
      alert('Please add at least 2 PDF documents to merge.');
      return;
    }

    try {
      const buffers = mergeList.map(m => m.buffer);
      const mergedBytes = await mergePdfs(buffers);
      const blob = new Blob([mergedBytes as unknown as BlobPart], { type: 'application/pdf' });
      triggerBlobDownload(blob, 'merged_document.pdf');
    } catch (err: unknown) {
      showError(`Merge failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
    if (e.dataTransfer && e.dataTransfer.files) {
      const files = e.dataTransfer.files;
      if (files.length > 1 || activeMode === 'merge') {
        setMode('merge');
        addFilesToMerge(files);
      } else if (files.length === 1) {
        loadSinglePdf(files[0]);
      }
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      const files = Array.from(fileInput.files);
      fileInput.value = '';
      if (files.length > 1 || activeMode === 'merge') {
        setMode('merge');
        addFilesToMerge(files);
      } else if (files.length === 1) {
        loadSinglePdf(files[0]);
      }
    }
  });
}
