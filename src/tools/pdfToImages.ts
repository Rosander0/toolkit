import { TOOLS } from '../registry';

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

    <div id="p2i-action-bar" class="card" style="display: none; margin-top: 1.5rem;">
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;">
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 1rem;">
          <div>
            <label for="p2i-format" style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.2rem;">Format:</label>
            <select id="p2i-format" style="padding: 0.4rem 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              <option value="png">PNG (Lossless)</option>
              <option value="jpg">JPG (Smaller)</option>
            </select>
          </div>
          <div>
            <label for="p2i-dpi" style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.2rem;">Resolution (DPI):</label>
            <select id="p2i-dpi" style="padding: 0.4rem 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              <option value="150" selected>150 DPI (Standard)</option>
              <option value="300">300 DPI (High Print)</option>
              <option value="72">72 DPI (Web)</option>
            </select>
          </div>
        </div>
        <div class="btn-group">
          <button id="p2i-clear-btn" class="btn btn-secondary">Clear</button>
          <button id="p2i-convert-btn" class="btn btn-primary">Extract Pages as Images (ZIP)</button>
        </div>
      </div>
    </div>

    <div id="p2i-page-selector" style="margin-top: 1rem;"></div>
  `;
}

