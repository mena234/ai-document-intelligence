import { PDF_LIMITS, validatePages, type ExtractedPage } from './ingestion';
// Vite's ?url import returns the locally bundled asset URL.
// oxlint-disable-next-line import/default
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export async function extractPdf(
  file: File,
  progress: (label: string) => void,
  signal: AbortSignal,
) {
  if (!/\.pdf$/i.test(file.name))
    throw new Error('Only PDF files are supported.');
  if (!file.size || file.size > PDF_LIMITS.bytes)
    throw new Error('Choose a non-empty PDF smaller than 10 MB.');
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.slice(0, 1024)).includes('%PDF-'))
    throw new Error(
      'This file is not a valid PDF. Export it as PDF and try again.',
    );
  if (signal.aborted) throw new Error('Upload canceled.');
  progress('Opening PDF…');
  const pdfjs = await import('pdfjs-dist');
  if (typeof Worker === 'undefined')
    throw new Error(
      'PDF processing needs a modern browser with Web Workers enabled.',
    );
  const port = new Worker(workerUrl, { type: 'module' });
  const worker = pdfjs.PDFWorker.create({ port });
  const task = pdfjs.getDocument({
    data,
    worker,
    verbosity: 0,
    stopAtErrors: true,
    disableFontFace: true,
    enableXfa: false,
    cMapUrl: '/pdf-assets/cmaps/',
    standardFontDataUrl: '/pdf-assets/standard_fonts/',
    useWasm: false,
  });
  let timer: ReturnType<typeof setTimeout>;
  let abort = () => {};
  try {
    return await Promise.race([
      (async () => {
        const pdf = await task.promise;
        if (!pdf.numPages || pdf.numPages > PDF_LIMITS.pages)
          throw new Error(
            'PDFs must contain 1–25 pages. Split the document into smaller PDFs.',
          );
        const pages: ExtractedPage[] = [];
        let characters = 0;
        for (let page = 1; page <= pdf.numPages; page++) {
          if (signal.aborted) throw new Error('Upload canceled.');
          progress(`Reading page ${page} of ${pdf.numPages}…`);
          const source = await pdf.getPage(page);
          const content = await source.getTextContent();
          let text = '';
          for (const item of content.items)
            if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
          text = text.replace(/[ \t]+\n/g, '\n').trim();
          characters += text.length;
          if (characters > PDF_LIMITS.characters)
            throw new Error(
              'This PDF contains too much text for the demo. Split it into smaller PDFs.',
            );
          pages.push({ page, text });
          source.cleanup();
        }
        try {
          return validatePages(pages);
        } catch {
          throw new Error(
            'No readable text was found. Use OCR to make this scanned PDF searchable, then upload it again.',
          );
        }
      })(),
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error('Upload canceled.'));
        signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'This PDF took too long to process. Try a smaller or newly exported PDF.',
              ),
            ),
          45000,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error(
        'This PDF is password-protected. Save an unlocked copy and upload it again.',
      );
    if (
      error instanceof Error &&
      ['InvalidPDFException', 'UnknownErrorException'].includes(error.name)
    )
      throw new Error(
        'This PDF is damaged or uses an unsupported format. Export a fresh PDF and try again.',
      );
    throw error;
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener('abort', abort);
    void task.destroy().catch(() => {});
    worker.destroy();
    port.terminate();
  }
}
