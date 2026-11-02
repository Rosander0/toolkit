import { TOOLS } from '../registry';

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
      <div class="dropzone-hint">Convert PNG, JPG, WEBP, BMP, GIF, HEIC, TIFF into a single PDF</div>
      <input type="file" id="i2p-file-input" class="dropzone-file-input" multiple accept=".png,.jpg,.jpeg,.webp,.bmp,.gif,.heic,.tiff,.tif" />
    </div>

    <div id="i2p-action-bar" class="card" style="display: none; margin-top: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <span id="i2p-count-label" style="font-weight: 600;">0 images selected</span>
        <div class="btn-group">
          <button id="i2p-clear-btn" class="btn btn-secondary">Clear All</button>
          <button id="i2p-generate-btn" class="btn btn-primary">Generate &amp; Download PDF</button>
        </div>
      </div>
    </div>

    <div id="i2p-grid" class="thumbnail-grid" style="margin-top: 1rem;"></div>
  `;
}
