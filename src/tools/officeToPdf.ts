import { TOOLS } from '../registry';

export function renderOfficeToPdf(container: HTMLElement): void {
  const meta = TOOLS['office-to-pdf'];
  container.innerHTML = `
    <div class="tool-header">
      <h2 class="tool-title">${meta.name}</h2>
      <p class="tool-tagline">${meta.tagline}</p>
    </div>

    <!-- Persistent notice required by specification -->
    <div class="notice-banner notice-server" role="alert">
      <span class="notice-icon">🔒</span>
      <span>${meta.persistentNotice}</span>
    </div>

    <!-- Passphrase & Service Config -->
    <div class="card" style="margin-bottom: 1.5rem;">
      <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">Authorization</h3>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
        Enter your service passphrase to authorize conversion requests. This passphrase remains in memory only and is never stored in localStorage or baked into any bundle.
      </p>
      <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;">
        <input
          type="password"
          id="office-passphrase-input"
          placeholder="Enter Office Service Passphrase"
          aria-label="Office Service Passphrase"
          style="flex: 1; min-width: 240px; padding: 0.5rem 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm);"
        />
        <button id="office-test-health-btn" class="btn btn-secondary">Check Service Health</button>
      </div>
      <div id="office-health-status" style="margin-top: 0.5rem; font-size: 0.85rem;"></div>
    </div>

    <div class="dropzone" id="office-dropzone" tabindex="0" role="button" aria-label="Drop Office documents here or click to browse">
      <div class="dropzone-icon">📊</div>
      <div class="dropzone-title">Drop Office documents here or click to browse</div>
      <div class="dropzone-hint">Supports DOCX, DOC, PPTX, PPT, XLSX, XLS, ODT, ODS, ODP, RTF, TXT &bull; Max 25MB per file</div>
      <input type="file" id="office-file-input" class="dropzone-file-input" accept=".docx,.doc,.pptx,.ppt,.xlsx,.xls,.odt,.ods,.odp,.rtf,.txt" />
    </div>

    <div id="office-file-list" class="file-list" style="margin-top: 1rem;"></div>
  `;
}
