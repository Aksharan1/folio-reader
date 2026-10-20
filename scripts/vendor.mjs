// Refreshes vendor/ from node_modules: `npm run vendor`
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

copyFileSync('node_modules/epubjs/dist/epub.min.js', 'vendor/epub.min.js');
copyFileSync('node_modules/jszip/dist/jszip.min.js', 'vendor/jszip.min.js');
copyFileSync('node_modules/pdfjs-dist/build/pdf.min.mjs', 'vendor/pdf.min.mjs');
copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'vendor/pdf.worker.min.mjs');
// foliate-js ships unbundled; its MOBI/KF8 parser is a single dependency-free module
const { version } = JSON.parse(readFileSync('node_modules/foliate-js/package.json', 'utf8'));
writeFileSync('vendor/foliate-mobi.js',
  `// mobi.js from foliate-js ${version} (MIT, https://github.com/johnfactotum/foliate-js)\n` +
  readFileSync('node_modules/foliate-js/mobi.js', 'utf8'));
console.log('vendor/ updated');
