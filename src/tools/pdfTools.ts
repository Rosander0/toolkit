import { TOOLS } from '../registry';

export function renderPdfTools(container: HTMLElement): void {
  const meta = TOOLS['pdf-tools'];
  container.innerHTML = `
    <div class="tool-header">
      <h2 class="tool-title">${meta.name}</h2>
      <p class="tool-tagline">${meta.tagline}</p>
    </div>

    <div class="dropzone" id="pdf-dropzone" tabindex="0" role="button" aria-label="Drop PDF files here or click to browse">
      <div class="dropzone-icon">📄</div>
      <div class="dropzone-title">Drop PDF file(s) here or click to browse</div>
      <div class="dropzone-hint">Supports Merge, Split, Rearrange, Rotate, and Extract &bull; Max 200MB per file</div>
      <input type="file" id="pdf-file-input" class="dropzone-file-input" multiple accept=".pdf" />
    </div>

    <div id="pdf-workspace" style="display: none; margin-top: 1.5rem;">
      <!-- Operations tabs: Merge vs Page Organizer -->
      <div class="btn-group" style="margin-bottom: 1rem;">
        <button id="pdf-mode-organize" class="btn btn-primary">Page Organizer &amp; Rotate</button>
        <button id="pdf-mode-split" class="btn btn-secondary">Split by Range</button>
        <button id="pdf-mode-merge" class="btn btn-secondary">Merge Multiple PDFs</button>
      </div>

      <div id="pdf-panel-content"></div>
    </div>
  `;
}
