# Personal File Toolkit

A privacy-first, single-user personal file toolkit. All image and PDF operations execute 100% client-side in the browser using WebAssembly and Web Workers. Office document conversion is powered by a secure, containerized Gotenberg service with a hardened FastAPI gateway.

---

## Features

### 1. Image Converter (100% Client-Side)
* **Inputs:** PNG, JPG, WEBP, BMP, GIF, HEIC (experimental), TIFF.
* **Outputs:** PNG, JPG, WEBP, BMP.
* **Batch Conversion & ZIP:** Multi-file drag-and-drop with per-file progress tracking and instantaneous ZIP download using `fflate`.
* **White Background Flattening:** Converting transparent PNG/WEBP to JPG composites transparency over solid `#FFFFFF` with an upfront visible lossy warning.
* **Zero-Dependency BMP:** Custom 32-bit BGRA uncompressed BMP encoder.

### 2. PDF Tools (100% Client-Side)
* **Visual Thumbnail Grid:** High-fidelity page thumbnail rendering via `pdfjs-dist`.
* **Drag-to-Reorder:** Visual rearrangement of pages using native drag-and-drop.
* **Rotation:** Rotate individual pages (+90°) or rotate all pages at once.
* **Page Removal:** Selectively delete individual pages with live page count updates.
* **Page Extraction:** Select arbitrary pages with checkboxes and download a targeted PDF.
* **Split by Range:** Strict range parser supporting single pages and ranges (e.g. `1-3, 5, 8`), with strict input validation rejecting inverted (`3-1`), non-numeric (`abc`), or zero/negative page entries.
* **Merge Multiple PDFs:** Multi-document queue with Up/Down ordering and atomic merge using `pdf-lib`.

### 3. Cross Conversions (100% Client-Side)
* **Images &rarr; PDF:** Combine any sequence of images into a single multi-page PDF with draggable order control.
* **PDF &rarr; Images:** Extract PDF pages into high-resolution PNG or JPG images with selectable DPI (72 DPI, 150 DPI, 300 DPI) and ZIP packaging.

### 4. Office &rarr; PDF (Server-Side via Gotenberg)
* **Inputs:** DOCX, DOC, PPTX, PPT, XLSX, XLS, ODT, ODS, ODP, RTF, TXT.
* **Output:** PDF.
* **Privacy & Isolation:** Persistent notice displayed in the UI: *"Files are uploaded to a server for this tool only."*
* **In-Memory Passphrase:** Authorization passphrase is typed at runtime and kept strictly in browser JavaScript memory—never written to `localStorage`, `sessionStorage`, cookies, or baked into build assets.

---

## Architecture & Security Model

```
Browser (Vite + Vanilla TypeScript)
 ├── Image Converter (Canvas API, UTIF, heic2any) ──> 100% Local In-Browser
 ├── PDF Tools (pdf-lib, pdfjs-dist) ───────────────> 100% Local In-Browser
 ├── Cross Conversions (Images<->PDF, fflate) ───────> 100% Local In-Browser
 └── Office to PDF
      │ Authorization: Bearer <in-memory-passphrase>
      ▼
 Office Gateway (FastAPI in Docker container)
      ├── 1. Rate Limiting (per-IP sliding window)
      ├── 2. Passphrase Auth (constant-time verification)
      ├── 3. Size Enforcement (max 25MB before buffering)
      ├── 4. Concurrency Limit (max 2 parallel conversions)
      ├── 5. Extension Allowlist (.docx, .xlsx, .pptx, etc.)
      ├── 6. Metadata-only logging (NO filenames or contents)
      ▼
 Gotenberg v8.17.2 (127.0.0.1:3000 /forms/libreoffice/convert)
```

---

## Dependency Licenses

| Package | Version | License | Usage |
| :--- | :--- | :--- | :--- |
| `pdf-lib` | `1.17.1` | MIT | PDF creation, merging, splitting, rotation |
| `pdfjs-dist` | `4.10.38` | Apache-2.0 | PDF page rendering to canvas thumbnails |
| `fflate` | `0.8.2` | MIT | High-speed, zero-dependency ZIP archive generation |
| `utif` | `3.1.0` | MIT | Fast TIFF image decoding |
| `heic2any` | `0.0.4` | MIT | Client-side HEIC to standard image conversion |
| `vite` | `6.2.0` | MIT | Frontend build tooling and development server |
| `typescript` | `5.8.2` | Apache-2.0 | Type checking and language services |
| `vitest` | `3.0.7` | MIT | Unit test harness |
| `@playwright/test` | `1.50.1` | Apache-2.0 | Browser end-to-end integration tests |
| `gotenberg` | `8.17.2` | MIT | Dockerized LibreOffice document conversion engine |
| `fastapi` | `0.115.11` | MIT | Python ASGI gateway application |
| `uvicorn` | `0.34.0` | BSD-3-Clause | ASGI production HTTP server |
| `httpx` | `0.28.1` | BSD-3-Clause | Async HTTP client for Gotenberg proxying |

---

## Hosting Analysis for the Office Service

Gotenberg runs headless LibreOffice, which requires sufficient memory to avoid Out-Of-Memory (OOM) kills when processing large slides or complex spreadsheets:

| Platform | Free Tier Specs | Docker Support | Idle / Sleep Behavior | Fit for Gotenberg |
| :--- | :--- | :--- | :--- | :--- |
| **Hugging Face Spaces** | **16 GB RAM**, 2 vCPUs, 50 GB disk ($0/mo) | Full (Docker SDK) | Sleeps after 48 hours of inactivity; instant wake on HTTP request | **Recommended (Best Free Tier)**: Ample memory prevents OOM issues entirely. |
| **Render** | 512 MB RAM, 0.1 vCPU ($0/mo) | Full (Dockerfile) | Sleeps after 15 min; 30–60s cold start | **Marginal**: 512 MB often triggers OOM crashes on LibreOffice conversions. |
| **Fly.io** | No permanent free tier ($6.70/mo for 1GB RAM) | Full | Suspends machine to disk | **Paid only**: Requires credit card pay-as-you-go. |

### Recommendation
* **Primary Recommendation (Free):** **Hugging Face Spaces (Docker SDK)**. With **16 GB RAM**, it provides 32x the memory of Render, eliminating all LibreOffice OOM crashes, and sleeps only after 48 hours of inactivity.
* **Cheapest Paid Dedicated Alternative:** **Render Starter ($7/mo for 1GB RAM)** or **Hetzner Cloud CX22 (~€3.79/mo for 4GB RAM)**.

---

## Deployment Steps

### Step 1: Deploy Office Service to Hugging Face Spaces (Recommended Free Option)
1. Go to [huggingface.co/spaces](https://huggingface.co/spaces) and click **Create new Space**.
2. Set Space Name (e.g. `file-toolkit-office`), License to `mit`, and select **Docker** as the Space SDK (Blank).
3. In your Space settings, go to **Variables and secrets**:
   * Add Secret: `SERVICE_PASSPHRASE` = `<your-chosen-strong-passphrase>`
   * Add Variable: `ALLOWED_ORIGIN` = `https://<your-site>.netlify.app,http://localhost:5173`
   * Add Variable: `MAX_CONCURRENT_CONVERSIONS` = `2`
   * Add Variable: `MAX_UPLOAD_SIZE_MB` = `25`
4. Push the contents of the `office-service/` folder to the Space Git repository:
   ```bash
   cd office-service
   git init
   git remote add space https://huggingface.co/spaces/<your-username>/file-toolkit-office
   git add .
   git commit -m "Deploy Gotenberg Office Gateway"
   git push space main
   ```
5. Note your public Space URL: `https://<your-username>-file-toolkit-office.hf.space`.

*(Alternative: Render Deployment)*
If deploying to Render, create a new **Web Service**, select **Docker**, set root directory to `office-service`, and set the same environment variables.

---

### Step 2: Deploy Frontend to Netlify
1. Push the repository to GitHub:
   ```bash
   git remote add origin https://github.com/<your-username>/personal-file-toolkit.git
   git branch -M main
   git push -u origin main
   ```
2. In [Netlify Dashboard](https://app.netlify.com/):
   * Click **Add new site** &rarr; **Import an existing project** &rarr; **GitHub**.
   * Select your repository.
   * Netlify automatically reads `netlify.toml`:
     * Build command: `npm run build`
     * Publish directory: `dist`
3. In Netlify Site Settings &rarr; **Environment variables**:
   * Set `VITE_OFFICE_SERVICE_URL` = `https://<your-office-service-url>`
4. In `netlify.toml`, ensure `connect-src` in the `Content-Security-Policy` header matches your service URL:
   ```toml
   Content-Security-Policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://<your-office-service-url>; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none';"
   ```
5. Click **Deploy Site**. Every subsequent `git push origin main` will auto-deploy!

---

## Netlify Limits & Production Dist Sizes

* Netlify recommended asset threshold: **< 10 MB per file**
* Netlify directory file threshold: **54,000 files**

### Final `dist/` Size Breakdown

| Asset File | Size | Gzip Size | Loading Behavior |
| :--- | :--- | :--- | :--- |
| `dist/index.html` | 3.45 kB | 1.09 kB | Initial Load |
| `dist/assets/index-BclZkWn9.css` | 8.10 kB | 2.22 kB | Initial Load |
| `dist/assets/index-DRl-GKYg.js` | 7.39 kB | 3.14 kB | Initial Load |
| **Total Initial Load** | **~18.9 kB** | **~6.45 kB** | **Instantaneous First Paint** |
| `dist/assets/imageConverter-*.js` | 7.69 kB | 2.74 kB | Lazy-loaded on Image tab |
| `dist/assets/imagesToPdf-*.js` | 6.99 kB | 2.53 kB | Lazy-loaded on Images &rarr; PDF tab |
| `dist/assets/pdfToImages-*.js` | 7.61 kB | 2.64 kB | Lazy-loaded on PDF &rarr; Images tab |
| `dist/assets/pdfTools-*.js` | 12.96 kB | 3.81 kB | Lazy-loaded on PDF Tools tab |
| `dist/assets/officeToPdf-*.js` | 9.46 kB | 3.27 kB | Lazy-loaded on Office tab |
| `dist/assets/fflate-*.js` | 8.84 kB | 4.47 kB | Lazy-loaded on ZIP creation |
| `dist/assets/utif-*.js` | 39.26 kB | 15.55 kB | Lazy-loaded on TIFF input |
| `dist/assets/pdfjs-*.js` | 334.08 kB | 98.28 kB | Lazy-loaded on PDF rendering |
| `dist/assets/pdflib-*.js` | 429.44 kB | 178.05 kB | Lazy-loaded on PDF editing |
| `dist/assets/heic-*.js` | 1,352.90 kB | 341.25 kB | Lazy-loaded on HEIC input |
| `dist/assets/pdf.worker.min-*.mjs` | 1,375.84 kB | 398.20 kB | Web Worker background thread |
| **Total `dist/` Directory Size** | **3.60 MB** | **~1.05 MB** | **Well within Netlify 10 MB limit** |

---

## Known Limitations

1. **Client-Side File Size Ceiling:** A 200 MB per-file threshold is enforced for image and PDF tools to prevent browser tab OOM crashes on mobile or resource-constrained devices.
2. **HEIC Decoding Speed:** HEIC decoding runs client-side via WASM; 48MP+ mobile photos can take 2–5 seconds per photo to decode.
3. **Office Cold Starts:** Free container hosts spin down on idle. First conversion after inactivity can take 30–60 seconds while the container initializes LibreOffice; the UI provides a progress notification and cancel button during this period.
