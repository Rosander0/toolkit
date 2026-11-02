import { TOOLS, formatFileSize, getFileExtension } from '../registry';
import { convertImagesToPdf } from '../services/crossService';
import { triggerBlobDownload } from '../services/imageService';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

let imageQueue: ImageItem[] = [];
let isGenerating = false;

export function renderImagesToPdf(container: HTMLElement): void {
  const meta = TOOLS['images-to-pdf'];
  container.innerHTML = `
    <div class="tool-header">
      <h2 class="tool-title">${meta.name}</h2>
      <p class="tool-tagline">${meta.tagline}</p>
    </div>

    <div class="dropzone" id="i2p-dropzone" tabindex="0" role="button" aria-label="Drop images here or click to browse">
      <div class="dropzone-icon">📑</div>
      <div class="dropzone-title">Drop images here or click to browse</div>
      <div class="dropzone-hint">Supports PNG, JPG, WEBP, BMP, GIF, HEIC, TIFF &bull; Drag thumbnails to change page order</div>
      <input type="file" id="i2p-file-input" class="dropzone-file-input" multiple accept=".png,.jpg,.jpeg,.webp,.bmp,.gif,.heic,.tiff,.tif" />
    </div>

    <div id="i2p-error-banner" class="notice-banner notice-warning" style="display: none; margin-top: 1rem;">
      <span class="notice-icon">⚠️</span>
      <span id="i2p-error-text"></span>
    </div>

    <div id="i2p-action-bar" class="card" style="display: none; margin-top: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div>
          <span id="i2p-count-label" style="font-weight: 600; font-size: 1rem;">0 images selected</span>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">
            Drag cards or click ▲ / ▼ to set the page order in the generated PDF.
          </p>
        </div>
        <div class="btn-group">
          <button id="i2p-clear-btn" class="btn btn-secondary">Clear All</button>
          <button id="i2p-generate-btn" class="btn btn-primary">Generate PDF</button>
        </div>
      </div>

      <div id="i2p-progress-wrap" style="display: none; margin-top: 1rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.3rem;">
          <span id="i2p-progress-label">Generating PDF...</span>
          <span id="i2p-progress-pct">0%</span>
        </div>
        <div class="progress-bar-container">
          <div id="i2p-progress-bar" class="progress-bar-fill" style="width: 0%;"></div>
        </div>
      </div>
    </div>

    <div id="i2p-grid" class="thumbnail-grid" style="margin-top: 1.25rem;"></div>
  `;

  setupImagesToPdfEvents(container);
}

function setupImagesToPdfEvents(container: HTMLElement): void {
  const dropzone = container.querySelector<HTMLElement>('#i2p-dropzone')!;
  const fileInput = container.querySelector<HTMLInputElement>('#i2p-file-input')!;
  const actionBar = container.querySelector<HTMLElement>('#i2p-action-bar')!;
  const countLabel = container.querySelector<HTMLElement>('#i2p-count-label')!;
  const grid = container.querySelector<HTMLElement>('#i2p-grid')!;
  const generateBtn = container.querySelector<HTMLButtonElement>('#i2p-generate-btn')!;
  const clearBtn = container.querySelector<HTMLButtonElement>('#i2p-clear-btn')!;
  const errorBanner = container.querySelector<HTMLElement>('#i2p-error-banner')!;
  const errorText = container.querySelector<HTMLElement>('#i2p-error-text')!;
  const progressWrap = container.querySelector<HTMLElement>('#i2p-progress-wrap')!;
  const progressBar = container.querySelector<HTMLElement>('#i2p-progress-bar')!;
  const progressLabel = container.querySelector<HTMLElement>('#i2p-progress-label')!;
  const progressPct = container.querySelector<HTMLElement>('#i2p-progress-pct')!;

  function showError(msg: string): void {
    errorText.textContent = msg;
    errorBanner.style.display = 'flex';
  }

  function hideError(): void {
    errorBanner.style.display = 'none';
  }

  function renderGrid(): void {
    if (imageQueue.length === 0) {
      actionBar.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    actionBar.style.display = 'block';
    countLabel.textContent = `${imageQueue.length} ${imageQueue.length === 1 ? 'image' : 'images'} in PDF`;
    grid.innerHTML = '';

    imageQueue.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'page-card';
      card.draggable = true;
      card.dataset.index = index.toString();

      card.innerHTML = `
        <div class="page-card-header">
          <span>Page ${index + 1}</span>
          <span style="font-size: 0.75rem; color: var(--text-secondary);">${formatFileSize(item.file.size)}</span>
        </div>
        <div class="page-thumb-container">
          <img src="${item.previewUrl}" class="page-thumb-img" alt="Page ${index + 1}" />
        </div>
        <div style="font-size: 0.8rem; font-weight: 500; margin-bottom: 0.4rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;" title="${item.file.name}">
          ${item.file.name}
        </div>
        <div class="page-card-actions">
          <button class="btn-icon i2p-up" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Move Up">▲</button>
          <button class="btn-icon i2p-down" data-index="${index}" ${index === imageQueue.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
          <button class="btn-icon btn-icon-danger i2p-del" data-index="${index}" title="Remove image">🗑️</button>
        </div>
      `;

      // Drag reorder
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', index.toString());
          e.dataTransfer.effectAllowed = 'move';
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        grid.querySelectorAll('.page-card').forEach(c => c.classList.remove('drag-over'));
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
          if (fromIndex !== toIndex && fromIndex >= 0 && fromIndex < imageQueue.length) {
            const [movedItem] = imageQueue.splice(fromIndex, 1);
            imageQueue.splice(toIndex, 0, movedItem);
            renderGrid();
          }
        }
      });

      grid.appendChild(card);
    });

    // Attach card buttons
    grid.querySelectorAll<HTMLButtonElement>('.i2p-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!, 10);
        if (idx > 0) {
          const temp = imageQueue[idx];
          imageQueue[idx] = imageQueue[idx - 1];
          imageQueue[idx - 1] = temp;
          renderGrid();
        }
      });
    });

    grid.querySelectorAll<HTMLButtonElement>('.i2p-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!, 10);
        if (idx < imageQueue.length - 1) {
          const temp = imageQueue[idx];
          imageQueue[idx] = imageQueue[idx + 1];
          imageQueue[idx + 1] = temp;
          renderGrid();
        }
      });
    });

    grid.querySelectorAll<HTMLButtonElement>('.i2p-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!, 10);
        URL.revokeObjectURL(imageQueue[idx].previewUrl);
        imageQueue.splice(idx, 1);
        renderGrid();
      });
    });
  }

  function addImages(files: FileList | File[]): void {
    hideError();
    const validExts = TOOLS['images-to-pdf'].supportedInputExtensions;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = getFileExtension(file.name);
      if (!validExts.includes(ext)) {
        showError(`Unsupported image format: "${file.name}"`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      imageQueue.push({
        id: `img-${Date.now()}-${i}`,
        file,
        previewUrl
      });
    }

    renderGrid();
  }

  clearBtn.addEventListener('click', () => {
    if (isGenerating) return;
    imageQueue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    imageQueue = [];
    progressWrap.style.display = 'none';
    renderGrid();
  });

  generateBtn.addEventListener('click', async () => {
    if (isGenerating || imageQueue.length === 0) return;
    isGenerating = true;
    generateBtn.disabled = true;
    clearBtn.disabled = true;
    progressWrap.style.display = 'block';

    try {
      const files = imageQueue.map(item => item.file);
      const pdfBytes = await convertImagesToPdf(files, (curr, total) => {
        const pct = Math.round((curr / total) * 100);
        progressBar.style.width = `${pct}%`;
        progressPct.textContent = `${pct}%`;
        progressLabel.textContent = `Processing image ${curr} of ${total}...`;
      });

      progressBar.style.width = '100%';
      progressPct.textContent = '100%';
      progressLabel.textContent = 'PDF generated!';

      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      triggerBlobDownload(blob, 'combined_images.pdf');
    } catch (err: unknown) {
      showError(`PDF generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      isGenerating = false;
      generateBtn.disabled = false;
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
    if (e.dataTransfer && e.dataTransfer.files) {
      addImages(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      const files = Array.from(fileInput.files);
      fileInput.value = '';
      addImages(files);
    }
  });
}
