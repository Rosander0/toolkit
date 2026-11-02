import { ToolId, TOOLS } from './registry';

// Lazy loader registry for tools
const toolLoaders: Record<ToolId, () => Promise<{ render: (container: HTMLElement) => void }>> = {
  'image-converter': async () => {
    const mod = await import('./tools/imageConverter');
    return { render: mod.renderImageConverter };
  },
  'pdf-tools': async () => {
    const mod = await import('./tools/pdfTools');
    return { render: mod.renderPdfTools };
  },
  'images-to-pdf': async () => {
    const mod = await import('./tools/imagesToPdf');
    return { render: mod.renderImagesToPdf };
  },
  'pdf-to-images': async () => {
    const mod = await import('./tools/pdfToImages');
    return { render: mod.renderPdfToImages };
  },
  'office-to-pdf': async () => {
    const mod = await import('./tools/officeToPdf');
    return { render: mod.renderOfficeToPdf };
  }
};

const loadedTools = new Set<ToolId>();
let currentToolId: ToolId = 'image-converter';

async function switchTool(toolId: ToolId): Promise<void> {
  if (!TOOLS[toolId]) return;
  currentToolId = toolId;

  // Update tabs
  const tabs = document.querySelectorAll<HTMLButtonElement>('.nav-tab');
  tabs.forEach(tab => {
    const isActive = tab.dataset.tool === toolId;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Update views
  const views = document.querySelectorAll<HTMLElement>('.tool-view');
  views.forEach(view => {
    const isTarget = view.id === `view-${toolId}`;
    view.classList.toggle('active', isTarget);
  });

  // Lazy render tool view if not yet rendered
  const container = document.getElementById(`view-${toolId}`);
  if (container && !loadedTools.has(toolId)) {
    try {
      const loader = toolLoaders[toolId];
      if (loader) {
        const module = await loader();
        module.render(container);
        loadedTools.add(toolId);
      }
    } catch (err) {
      console.error(`Failed to load tool ${toolId}:`, err);
      container.innerHTML = `
        <div class="notice-banner notice-warning">
          <span>Failed to load module for ${TOOLS[toolId].name}. Please check console or refresh.</span>
        </div>
      `;
    }
  }

  // Update URL hash
  if (window.location.hash !== `#${toolId}`) {
    history.replaceState(null, '', `#${toolId}`);
  }
}

function initNav(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.nav-tab');
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      const toolId = tab.dataset.tool as ToolId;
      if (toolId) switchTool(toolId);
    });

    // Keyboard accessibility for tabs
    tab.addEventListener('keydown', (e: KeyboardEvent) => {
      let nextIndex = index;
      if (e.key === 'ArrowRight') {
        nextIndex = (index + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else {
        return;
      }
      e.preventDefault();
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    });
  });

  // Initial routing from hash
  const initialHash = window.location.hash.replace('#', '') as ToolId;
  if (initialHash && TOOLS[initialHash]) {
    switchTool(initialHash);
  } else {
    switchTool('image-converter');
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '') as ToolId;
    if (hash && TOOLS[hash] && hash !== currentToolId) {
      switchTool(hash);
    }
  });
}

// Global safety check for Web Workers and WASM under CSP
export function checkPlatformCapabilities(): { workers: boolean; wasm: boolean } {
  const capabilities = {
    workers: typeof Worker !== 'undefined',
    wasm: typeof WebAssembly !== 'undefined'
  };
  return capabilities;
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  const caps = checkPlatformCapabilities();
  if (!caps.workers || !caps.wasm) {
    console.warn('Browser capability warning:', caps);
  }
});

