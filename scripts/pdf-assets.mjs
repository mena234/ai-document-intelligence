import { cpSync, mkdirSync } from 'node:fs';
for (const name of ['cmaps', 'standard_fonts']) {
  mkdirSync('public/pdf-assets', { recursive: true });
  cpSync(`node_modules/pdfjs-dist/${name}`, `public/pdf-assets/${name}`, { recursive: true });
}
