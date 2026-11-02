import { TOOLS, formatFileSize, sanitizeFilename, MAX_OFFICE_FILE_SIZE_BYTES } from '../registry';
import { triggerBlobDownload } from '../services/imageService';

// Kept IN MEMORY ONLY as strictly required. Never written to localStorage or cookies.
let runtimePassphrase = '';
let currentAbortController: AbortController | null = null;
let isConverting = false;

function getServiceUrl(): string {
  // Configured via Vite env var or runtime fallback
  const envUrl = (import.meta as any).env?.VITE_OFFICE_SERVICE_URL;
  return (envUrl && envUrl.trim()) ? envUrl.trim() : 'http://localhost:8000';
}

export function renderOfficeToPdf(container: HTMLElement): void {
  const meta = TOOLS['office-to-pdf'];
  const defaultServiceUrl = getServiceUrl();

  container.innerHTML = `
    <div class="tool-header">
      <h2 class="tool-title">${meta.name}</h2>
      <p class="tool-tagline">${meta.tagline}</p>
    </div>

    <!-- Mandatory persistent notice -->
    <div class="notice-banner notice-server" role="alert">
      <span class="notice-icon">🔒</span>
      <span><strong>Notice:</strong> ${meta.persistentNotice}</span>
    </div>

    <!-- Passphrase & Service Config Panel -->
    <div class="card" style="margin-bottom: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
        <h3 style="font-size: 1rem; font-weight: 600;">Service Authorization &amp; Endpoint</h3>
        <span class="badge badge-info" id="office-conn-badge">Ready</span>
      </div>

      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
        Enter your service passphrase. It is kept in browser memory only and never saved to localStorage or baked into any bundle.
      </p>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;">
          <input
            type="password"
            id="office-passphrase"
            placeholder="Type authorization passphrase"
            value="${runtimePassphrase}"
            aria-label="Authorization Passphrase"
            style="flex: 1; min-width: 260px; padding: 0.5rem 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm);"
          />
          <button id="office-health-btn" class="btn btn-secondary">Check Connection</button>
        </div>

        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
          <span>Server URL:</span>
          <code id="office-url-display" style="background: var(--bg-primary); padding: 0.2rem 0.4rem; border-radius: 4px;">${defaultServiceUrl}</code>
        </div>
      </div>

      <div id="office-status-feedback" style="margin-top: 0.75rem; font-size: 0.85rem; display: none;"></div>
    </div>

    <!-- Cold Start Wakeup Notice -->
    <div id="office-coldstart-banner" class="notice-banner notice-warning" style="display: none; margin-bottom: 1.5rem;" role="status">
      <span class="notice-icon">⏳</span>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 0.95rem;">Waking up the server, this can take up to a minute...</div>
        <div id="office-coldstart-subtext" style="font-size: 0.8rem; margin-top: 0.2rem; opacity: 0.9;">Waiting for the container to start. Automatic retries in progress.</div>
      </div>
      <button id="office-cancel-btn" class="btn btn-danger btn-sm">Cancel</button>
    </div>

    <!-- Dropzone -->
    <div class="dropzone" id="office-dropzone" tabindex="0" role="button" aria-label="Drop Office documents here or click to browse">
      <div class="dropzone-icon">📊</div>
      <div class="dropzone-title">Drop Office document here or click to browse</div>
      <div class="dropzone-hint">Supports DOCX, DOC, PPTX, PPT, XLSX, XLS, ODT, ODS, ODP, RTF, TXT &bull; Max 25MB per file</div>
      <input type="file" id="office-file-input" class="dropzone-file-input" accept=".docx,.doc,.pptx,.ppt,.xlsx,.xls,.odt,.ods,.odp,.rtf,.txt" />
    </div>

    <div id="office-action-bar" class="card" style="display: none; margin-top: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div>
          <span id="office-file-summary" style="font-weight: 600;">1 document selected</span>
        </div>
        <div class="btn-group">
          <button id="office-clear-btn" class="btn btn-secondary">Clear</button>
          <button id="office-convert-btn" class="btn btn-primary">Convert to PDF</button>
        </div>
      </div>
    </div>

    <div id="office-result-area" class="file-list" style="margin-top: 1.25rem;"></div>
  `;

  setupOfficeToPdfEvents(container);
}

function setupOfficeToPdfEvents(container: HTMLElement): void {
  const passphraseInput = container.querySelector<HTMLInputElement>('#office-passphrase')!;
  const healthBtn = container.querySelector<HTMLButtonElement>('#office-health-btn')!;
  const statusFeedback = container.querySelector<HTMLElement>('#office-status-feedback')!;
  const connBadge = container.querySelector<HTMLElement>('#office-conn-badge')!;
  const coldstartBanner = container.querySelector<HTMLElement>('#office-coldstart-banner')!;
  const coldstartSubtext = container.querySelector<HTMLElement>('#office-coldstart-subtext')!;
  const cancelBtn = container.querySelector<HTMLButtonElement>('#office-cancel-btn')!;
  const dropzone = container.querySelector<HTMLElement>('#office-dropzone')!;
  const fileInput = container.querySelector<HTMLInputElement>('#office-file-input')!;
  const actionBar = container.querySelector<HTMLElement>('#office-action-bar')!;
  const fileSummary = container.querySelector<HTMLElement>('#office-file-summary')!;
  const convertBtn = container.querySelector<HTMLButtonElement>('#office-convert-btn')!;
  const clearBtn = container.querySelector<HTMLButtonElement>('#office-clear-btn')!;
  const resultArea = container.querySelector<HTMLElement>('#office-result-area')!;

  let queuedFile: File | null = null;

  passphraseInput.addEventListener('input', () => {
    runtimePassphrase = passphraseInput.value;
  });

  healthBtn.addEventListener('click', async () => {
    statusFeedback.style.display = 'block';
    statusFeedback.style.color = 'var(--text-secondary)';
    statusFeedback.textContent = 'Pinging /health endpoint...';

    const serviceUrl = getServiceUrl();
    try {
      const resp = await fetch(`${serviceUrl}/health`, { method: 'GET' });
      if (resp.ok) {
        const data = await resp.json();
        connBadge.className = 'badge badge-success';
        connBadge.textContent = 'Online';
        statusFeedback.style.color = 'var(--accent-success)';
        statusFeedback.textContent = `Server reachable! Gotenberg status: ${data.gotenberg || 'ready'}`;
      } else {
        connBadge.className = 'badge badge-warning';
        connBadge.textContent = 'Degraded';
        statusFeedback.style.color = 'var(--accent-warning)';
        statusFeedback.textContent = `Server responded with HTTP ${resp.status}`;
      }
    } catch (err: unknown) {
      connBadge.className = 'badge badge-danger';
      connBadge.textContent = 'Unreachable';
      statusFeedback.style.color = 'var(--accent-danger)';
      statusFeedback.textContent = `Unable to connect to server at ${serviceUrl}. If using a free host (Render/HF), it may be waking up.`;
    }
  });

  function renderQueue(): void {
    if (!queuedFile) {
      actionBar.style.display = 'none';
      resultArea.innerHTML = '';
      return;
    }

    actionBar.style.display = 'block';
    fileSummary.textContent = `${queuedFile.name} (${formatFileSize(queuedFile.size)})`;
    resultArea.innerHTML = `
      <div class="file-item">
        <div class="file-info">
          <span style="font-size: 1.25rem;">📄</span>
          <div>
            <div class="file-name">${queuedFile.name}</div>
            <div class="file-meta">${formatFileSize(queuedFile.size)}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span class="badge badge-info" id="office-file-status">Ready</span>
          <div id="office-file-action"></div>
        </div>
      </div>
    `;
  }

  function handleFileSelection(files: FileList | File[]): void {
    if (files.length === 0) return;
    const file = files[0];

    // File size check: 25 MB
    if (file.size > MAX_OFFICE_FILE_SIZE_BYTES) {
      alert(`File size (${formatFileSize(file.size)}) exceeds the maximum 25 MB limit for Office documents.`);
      return;
    }

    queuedFile = file;
    renderQueue();
  }

  clearBtn.addEventListener('click', () => {
    if (isConverting) return;
    queuedFile = null;
    renderQueue();
  });

  cancelBtn.addEventListener('click', () => {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    coldstartBanner.style.display = 'none';
    isConverting = false;
    convertBtn.disabled = false;
    clearBtn.disabled = false;
    const fileStatus = container.querySelector<HTMLElement>('#office-file-status');
    if (fileStatus) {
      fileStatus.className = 'badge badge-warning';
      fileStatus.textContent = 'Cancelled';
    }
  });

  convertBtn.addEventListener('click', async () => {
    if (!queuedFile || isConverting) return;

    if (!runtimePassphrase.trim()) {
      alert('Please enter your service passphrase in the authorization box above before converting.');
      passphraseInput.focus();
      return;
    }

    isConverting = true;
    convertBtn.disabled = true;
    clearBtn.disabled = true;

    const fileStatus = container.querySelector<HTMLElement>('#office-file-status')!;
    const fileAction = container.querySelector<HTMLElement>('#office-file-action')!;
    fileStatus.className = 'badge badge-warning';
    fileStatus.textContent = 'Uploading...';
    fileAction.innerHTML = '';

    currentAbortController = new AbortController();
    const serviceUrl = getServiceUrl();

    // Cold start timer: if still in flight after 2 seconds, show cold-start wakeup banner
    const coldStartTimer = setTimeout(() => {
      coldstartBanner.style.display = 'flex';
      coldstartSubtext.textContent = 'Waiting for server response. Cold starts on free hosts may take up to a minute.';
    }, 2000);

    const formData = new FormData();
    formData.append('file', queuedFile, queuedFile.name);

    try {
      const resp = await fetch(`${serviceUrl}/convert`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${runtimePassphrase}`
        },
        body: formData,
        signal: currentAbortController.signal
      });

      clearTimeout(coldStartTimer);
      coldstartBanner.style.display = 'none';

      if (resp.ok) {
        fileStatus.className = 'badge badge-success';
        fileStatus.textContent = 'Converted!';

        const blob = await resp.blob();
        const baseName = queuedFile.name.replace(/\.[^/.]+$/, '');
        const outputName = `${sanitizeFilename(baseName)}.pdf`;

        fileAction.innerHTML = `
          <button class="btn btn-primary btn-sm" id="office-download-res-btn">Download PDF</button>
        `;
        container.querySelector<HTMLButtonElement>('#office-download-res-btn')?.addEventListener('click', () => {
          triggerBlobDownload(blob, outputName);
        });

        // Trigger automatic download
        triggerBlobDownload(blob, outputName);
      } else {
        fileStatus.className = 'badge badge-danger';
        fileStatus.textContent = 'Failed';

        let errMessage = `Error ${resp.status}`;
        try {
          const errData = await resp.json();
          if (errData && errData.error) errMessage = errData.error;
        } catch {
          // Non-JSON response
        }

        if (resp.status === 401) {
          errMessage = 'Passphrase rejected. Please check authorization passphrase.';
        } else if (resp.status === 413) {
          errMessage = 'File exceeds maximum size of 25MB.';
        } else if (resp.status === 503 || resp.status === 429) {
          errMessage = 'Server is currently busy. Please retry shortly.';
        } else if (resp.status === 504) {
          errMessage = 'Conversion timed out. The document may be corrupted or too complex.';
        }

        fileAction.innerHTML = `
          <span style="font-size: 0.8rem; color: var(--accent-danger);">${errMessage}</span>
        `;
      }
    } catch (err: unknown) {
      clearTimeout(coldStartTimer);
      coldstartBanner.style.display = 'none';

      if (err instanceof DOMException && err.name === 'AbortError') {
        fileStatus.className = 'badge badge-warning';
        fileStatus.textContent = 'Cancelled by user';
      } else {
        fileStatus.className = 'badge badge-danger';
        fileStatus.textContent = 'Unreachable';
        fileAction.innerHTML = `
          <span style="font-size: 0.8rem; color: var(--accent-danger);">
            Unable to connect to service at ${serviceUrl}. Server may be sleeping or down.
          </span>
        `;
      }
    } finally {
      isConverting = false;
      convertBtn.disabled = false;
      clearBtn.disabled = false;
      currentAbortController = null;
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
      handleFileSelection(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      const files = Array.from(fileInput.files);
      fileInput.value = '';
      handleFileSelection(files);
    }
  });
}
