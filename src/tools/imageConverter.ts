import { TOOLS } from '../registry';

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
          <select id="img-target-format" style="padding: 0.4rem 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="webp">WEBP</option>
            <option value="bmp">BMP</option>
          </select>
        </div>
        <div class="btn-group">
          <button id="img-clear-btn" class="btn btn-secondary">Clear All</button>
          <button id="img-convert-btn" class="btn btn-primary">Convert &amp; Download ZIP</button>
        </div>
      </div>
    </div>

    <div id="img-file-list" class="file-list"></div>
  `;
}
