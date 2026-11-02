import { TOOLS, formatFileSize, getFileExtension } from '../registry';
import {
  OutputImageFormat,
  ImageConversionResult,
  convertImageBatch,
  createZipFromResults,
  triggerBlobDownload
} from '../services/imageService';

let fileQueue: File[] = [];
let conversionResults: ImageConversionResult[] = [];
let isConverting = false;

export function renderImageConverter(container: HTMLElement): void {
  const meta = TOOLS['image-converter'];
  container.innerHTML = `
    <div class="tool-header">
      <h2 class="tool-title">${meta.name}</h2>
      <p class="tool-tagline">${meta.tagline}</p>
    </div>

    <div class="dropzone" id="img-dropzone" tabindex="0" role="button" aria-label="Drop images here or click to browse">
      <div class="dropzone-icon">🖼️</div>
      <div class="dropzone-title">Drop images here or click to browse</div>
      <div class="dropzone-hint">Supports PNG, JPG, WEBP, BMP, GIF, HEIC (experimental), TIFF &bull; Max 200MB per file</div>
      <input type="file" id="img-file-input" class="dropzone-file-input" multiple accept=".png,.jpg,.jpeg,.webp,.bmp,.gif,.heic,.tiff,.tif" />
    </div>

    <div id="img-lossy-warning" class="notice-banner notice-warning" style="display: none; margin-top: 1rem;">
      <span class="notice-icon">⚠️</span>
      <span><strong>Lossy Warning:</strong> Converting transparent PNG/WEBP to JPG flattens transparent areas onto a solid white background.</span>
    </div>

    <div id="img-heic-warning" class="notice-banner notice-info" style="display: none; margin-top: 1rem;">
      <span class="notice-icon">ℹ️</span>
      <span><strong>HEIC format:</strong> HEIC decoding runs client-side and is experimental. Larger files may take extra seconds.</span>
    </div>

    <div id="img-action-bar" class="card" style="display: none; margin-top: 1.5rem;">
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <label for="img-target-format" style="font-weight: 600; font-size: 0.9rem;">Convert all to:</label>
          <select id="img-target-format" style="padding: 0.4rem 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer;">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="webp">WEBP</option>
            <option value="bmp">BMP</option>
          </select>
          <span id="img-batch-summary" style="font-size: 0.85rem; color: var(--text-secondary);"></span>
        </div>
        <div class="btn-group">
          <button id="img-clear-btn" class="btn btn-secondary">Clear All</button>
          <button id="img-convert-btn" class="btn btn-primary">Convert Files</button>
          <button id="img-zip-btn" class="btn btn-primary" style="display: none;">Download ZIP</button>
        </div>
      </div>

      <div id="img-overall-progress" style="display: none; margin-top: 1rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.3rem;">
          <span id="img-progress-text">Processing...</span>
          <span id="img-progress-percent">0%</span>
        </div>
        <div class="progress-bar-container">
          <div id="img-progress-bar" class="progress-bar-fill" style="width: 0%;"></div>
        </div>
      </div>
    </div>

    <div id="img-file-list" class="file-list"></div>
  `;

  setupImageConverterEvents(container);
}

function setupImageConverterEvents(container: HTMLElement): void {
  const fileInput = container.querySelector<HTMLInputElement>('#img-file-input')!;
  const dropzone = container.querySelector<HTMLElement>('#img-dropzone')!;
  const actionBar = container.querySelector<HTMLElement>('#img-action-bar')!;
  const formatSelect = container.querySelector<HTMLSelectElement>('#img-target-format')!;
  const convertBtn = container.querySelector<HTMLButtonElement>('#img-convert-btn')!;
  const zipBtn = container.querySelector<HTMLButtonElement>('#img-zip-btn')!;
  const clearBtn = container.querySelector<HTMLButtonElement>('#img-clear-btn')!;
  const lossyWarning = container.querySelector<HTMLElement>('#img-lossy-warning')!;
  const heicWarning = container.querySelector<HTMLElement>('#img-heic-warning')!;
  const fileList = container.querySelector<HTMLElement>('#img-file-list')!;
  const batchSummary = container.querySelector<HTMLElement>('#img-batch-summary')!;
  const overallProgress = container.querySelector<HTMLElement>('#img-overall-progress')!;
  const progressBar = container.querySelector<HTMLElement>('#img-progress-bar')!;
  const progressText = container.querySelector<HTMLElement>('#img-progress-text')!;
  const progressPercent = container.querySelector<HTMLElement>('#img-progress-percent')!;

  function updateWarnings(): void {
    const targetFormat = formatSelect.value as OutputImageFormat;
    const hasTransparentSources = fileQueue.some(f => {
      const ext = getFileExtension(f.name);
      return ext === 'png' || ext === 'webp' || ext === 'gif';
    });
    const hasHeic = fileQueue.some(f => getFileExtension(f.name) === 'heic');

    lossyWarning.style.display = (targetFormat === 'jpg' && hasTransparentSources) ? 'flex' : 'none';
    heicWarning.style.display = hasHeic ? 'flex' : 'none';
  }

  function renderFileList(): void {
    if (fileQueue.length === 0) {
      actionBar.style.display = 'none';
      lossyWarning.style.display = 'none';
      heicWarning.style.display = 'none';
      fileList.innerHTML = '';
      zipBtn.style.display = 'none';
      return;
    }

    actionBar.style.display = 'block';
    batchSummary.textContent = `(${fileQueue.length} ${fileQueue.length === 1 ? 'file' : 'files'})`;
    updateWarnings();

    fileList.innerHTML = '';
    fileQueue.forEach((file, index) => {
      const result = conversionResults[index];
      const item = document.createElement('div');
      item.className = 'file-item';
      item.id = `img-item-${index}`;

      let badgeHtml = '<span class="badge badge-info">Ready</span>';
      let actionHtml = `<button class="btn btn-secondary btn-sm" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" data-remove="${index}">Remove</button>`;

      if (result) {
        if (result.status === 'processing') {
          badgeHtml = '<span class="badge badge-warning">Processing...</span>';
          actionHtml = '';
        } else if (result.status === 'done') {
          badgeHtml = '<span class="badge badge-success">Done</span>';
          actionHtml = `<button class="btn btn-primary btn-sm" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" data-download="${index}">Download</button>`;
        } else if (result.status === 'error') {
          badgeHtml = `<span class="badge badge-danger" title="${result.error || 'Error'}">Failed</span>`;
          actionHtml = `<span style="font-size: 0.8rem; color: var(--accent-danger); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${result.error || 'Failed'}</span>`;
        }
      }

      item.innerHTML = `
        <div class="file-info">
          <span style="font-size: 1.25rem;">🖼️</span>
          <div style="min-width: 0;">
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-meta">${formatFileSize(file.size)}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          ${badgeHtml}
          ${actionHtml}
        </div>
      `;

      fileList.appendChild(item);
    });

    // Attach row button events
    fileList.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.remove!, 10);
        fileQueue.splice(idx, 1);
        conversionResults.splice(idx, 1);
        renderFileList();
      });
    });

    fileList.querySelectorAll<HTMLButtonElement>('[data-download]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.download!, 10);
        const res = conversionResults[idx];
        if (res && res.blob) {
          triggerBlobDownload(res.blob, res.outputFilename);
        }
      });
    });
  }

  function addFiles(newFiles: FileList | File[]): void {
    const validExts = TOOLS['image-converter'].supportedInputExtensions;
    for (let i = 0; i < newFiles.length; i++) {
      const f = newFiles[i];
      const ext = getFileExtension(f.name);
      if (validExts.includes(ext)) {
        fileQueue.push(f);
      } else {
        // Corrupt/wrong-extension file added to queue with immediate error result
        fileQueue.push(f);
        conversionResults[fileQueue.length - 1] = {
          file: f,
          outputFilename: f.name,
          status: 'error',
          error: `Unsupported image format (.${ext || 'unknown'})`
        };
      }
    }
    renderFileList();
  }

  // Dropzone drag-and-drop
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
      addFiles(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files) {
      addFiles(fileInput.files);
      fileInput.value = ''; // Reset for re-selection
    }
  });

  formatSelect.addEventListener('change', () => {
    updateWarnings();
  });

  clearBtn.addEventListener('click', () => {
    if (isConverting) return;
    fileQueue = [];
    conversionResults = [];
    overallProgress.style.display = 'none';
    renderFileList();
  });

  convertBtn.addEventListener('click', async () => {
    if (isConverting || fileQueue.length === 0) return;
    isConverting = true;
    convertBtn.disabled = true;
    clearBtn.disabled = true;
    zipBtn.style.display = 'none';
    overallProgress.style.display = 'block';

    const targetFormat = formatSelect.value as OutputImageFormat;

    try {
      conversionResults = await convertImageBatch(fileQueue, targetFormat, (done, total, currentItem) => {
        const pct = Math.round((done / total) * 100);
        progressBar.style.width = `${pct}%`;
        progressPercent.textContent = `${pct}%`;
        progressText.textContent = `Converting ${done} of ${total}: ${currentItem.file.name}...`;
        renderFileList();
      });

      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';
      progressText.textContent = 'Conversion complete!';

      const successful = conversionResults.filter(r => r.status === 'done');
      if (successful.length > 1) {
        zipBtn.style.display = 'inline-flex';
        // Auto trigger ZIP if multiple
        const { zipBlob, zipFilename } = await createZipFromResults(conversionResults);
        triggerBlobDownload(zipBlob, zipFilename);
      } else if (successful.length === 1 && successful[0].blob) {
        triggerBlobDownload(successful[0].blob, successful[0].outputFilename);
      }
    } catch (err: unknown) {
      console.error('Batch conversion error:', err);
      progressText.textContent = err instanceof Error ? err.message : 'Conversion failed';
    } finally {
      isConverting = false;
      convertBtn.disabled = false;
      clearBtn.disabled = false;
      renderFileList();
    }
  });

  zipBtn.addEventListener('click', async () => {
    try {
      const { zipBlob, zipFilename } = await createZipFromResults(conversionResults);
      triggerBlobDownload(zipBlob, zipFilename);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate ZIP');
    }
  });
}
