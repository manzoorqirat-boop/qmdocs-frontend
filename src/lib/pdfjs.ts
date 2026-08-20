// Lazy-loaded, self-hosted PDF.js. The legacy app pointed the worker at a
// cdnjs.cloudflare.com URL matched to the installed version by hand — a
// version-mismatch footgun and, in a validated system, an unnecessary
// runtime dependency on a third-party host (same reasoning as the fonts).
// Vite's `?url` import bundles the worker file locally instead. Dynamically
// imported so pdfjs-dist's ~1MB doesn't sit in the main bundle for the
// large majority of routes that never touch a PDF.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = workerUrl;
      return mod;
    });
  }
  return pdfjsPromise;
}
