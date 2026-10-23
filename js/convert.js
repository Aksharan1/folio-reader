/* =========================================================
   Convert — turns other e-book formats into EPUB on import,
   so the reader, search and highlights only ever deal with EPUB
   ========================================================= */

const FORMAT_OF = {
  epub: 'EPUB',
  mobi: 'MOBI', prc: 'MOBI', azw: 'AZW', azw3: 'AZW3', kf8: 'AZW3',
  fb2: 'FB2', fbz: 'FB2',
  pdf: 'PDF',
  docx: 'DOCX',
  html: 'HTML', htm: 'HTML', xhtml: 'HTML',
  md: 'Markdown', markdown: 'Markdown',
  txt: 'Text',
  cbz: 'CBZ', cbr: 'CBR', cbt: 'CBT', cb7: 'CB7',
};
const BOOK_ACCEPT = Object.keys(FORMAT_OF).map((e) => '.' + e).join(',') + ',.fb2.zip,application/epub+zip';
const CHUNK_CHARS = 60000;   // split long sections so pagination stays quick

function bookFormat(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.fb2.zip')) return 'FB2';
  return FORMAT_OF[n.slice(n.lastIndexOf('.') + 1)] || null;
}

function bookBaseName(name) {
  return String(name || 'Untitled').replace(/\.fb2\.zip$/i, '').replace(/\.[a-z0-9]{1,8}$/i, '').replace(/_+/g, ' ').trim() || 'Untitled';
}

/* an error whose message is meant for the reader, not the console */
function bookError(msg) {
  const e = new Error(msg);
  e.friendly = true;
  return e;
}

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plainLen = (html) => html.replace(/<[^>]*>/g, '').length;
const vendorUrl = (file) => new URL('vendor/' + file, document.baseURI).href;
const xmlDoc = (text) => new DOMParser().parseFromString(text, 'application/xml');
const kids = (el, name) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
const kid = (el, name) => kids(el, name)[0] || null;

function decodeText(bytes, declared) {
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (declared) try { return new TextDecoder(declared).decode(bytes); } catch (e) {}
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) {}
  return new TextDecoder('windows-1252').decode(bytes);
}

const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' };
const EXT_OF_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif', 'text/css': 'css' };

function sniffType(b) {
  if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  if (b[0] === 0x42 && b[1] === 0x4D) return 'image/bmp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 && b[8] === 0x61 && b[9] === 0x76) return 'image/avif';
  return '';
}

/* ---------- EPUB builder ----------
   book = { title, author, lang, description, css,
            sections: [{ title, body (HTML string) | doc (Document) }],
            toc: [{ label, section, depth }],
            resources: [{ path, data, type }],
            cover: { data, type } | null,
            comic: true for a book of page images, shown one picture per page,
            direction: 'rtl' or 'ltr' when the file says which way its pages turn } */

const BASE_CSS = `
.center, .subtitle, .image { text-align: center; }
.image img { max-width: 100%; }
.poem { margin: 1em 0 1em 2em; }
.stanza { margin: 0 0 1em; }
.stanza p, p.v { margin: 0; text-indent: 0; }
.epigraph { margin: 1em 0 1em 30%; font-style: italic; }
.text-author { text-align: right; }
table { border-collapse: collapse; }
td, th { border: 1px solid rgba(128,128,128,.4); padding: .2em .5em; vertical-align: top; }
pre { white-space: pre-wrap; }
`;

/* comics and scanned pages: one picture per section, which the reader fits to the screen */
const COMIC_CSS = '.page, .page img { margin: 0; padding: 0; } .page img { display: block; }';
const pictureSection = (path, n) => ({ title: 'Page ' + n, body: `<div class="page"><img src="${path}" alt="Page ${n}"/></div>` });

function sectionFile(i) {
  return 's' + String(i + 1).padStart(4, '0') + '.xhtml';
}

function toXhtml(sec, book) {
  let doc = sec.doc;
  if (!doc) {
    doc = document.implementation.createHTMLDocument(sec.title || book.title);
    doc.body.innerHTML = sec.body;
  }
  // nothing in a converted book may run or reach the network
  doc.querySelectorAll('script, iframe, object, embed, form, base, link, meta[http-equiv]').forEach((n) => n.remove());
  const head = doc.querySelector('head');
  if (head) {
    const style = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style');
    style.textContent = BASE_CSS + (book.css || '');
    head.prepend(style);
    if (!head.querySelector('title')) {
      const t = doc.createElementNS('http://www.w3.org/1999/xhtml', 'title');
      t.textContent = sec.title || book.title;
      head.prepend(t);
    }
  }
  return '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n' + new XMLSerializer().serializeToString(doc.documentElement);
}

function navXhtml(book) {
  let toc = (book.toc || []).filter((t) => t.label && t.section >= 0 && t.section < book.sections.length);
  if (!toc.length) toc = [{ label: book.sections[0].title || 'Start', section: 0, depth: 0 }];
  let out = '', depth = -1;
  for (const t of toc) {
    const d = Math.max(0, Math.min(t.depth || 0, depth + 1));
    if (d > depth) out += '<ol>'.repeat(d - depth);
    else out += '</li>' + '</ol></li>'.repeat(depth - d);
    out += `<li><a href="${sectionFile(t.section)}">${escXml(t.label.replace(/\s+/g, ' ').trim())}</a>`;
    depth = d;
  }
  out += '</li>' + '</ol></li>'.repeat(depth) + '</ol>';
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head>
<body><nav epub:type="toc">${out}</nav></body></html>`;
}

async function buildEpub(book) {
  if (!book.sections.length) throw bookError('No readable text was found in this file');
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');

  const manifest = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'];
  const spine = [];
  book.sections.forEach((sec, i) => {
    zip.file('OEBPS/' + sectionFile(i), toXhtml(sec, book));
    manifest.push(`<item id="s${i}" href="${sectionFile(i)}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="s${i}"/>`);
  });
  (book.resources || []).forEach((r, i) => {
    // pictures are compressed already; deflating them again only costs time
    const packed = /^image\/(jpeg|png|gif|webp|avif)$/.test(r.type || '');
    zip.file('OEBPS/' + r.path, r.data, packed ? { compression: 'STORE' } : undefined);
    manifest.push(`<item id="r${i}" href="${escXml(r.path)}" media-type="${escXml(r.type || 'application/octet-stream')}"/>`);
  });
  let coverMeta = '';
  if (book.cover && book.cover.data) {
    const type = book.cover.type || sniffType(book.cover.data) || 'image/jpeg';
    const path = 'cover.' + (EXT_OF_TYPE[type] || 'jpg');
    zip.file('OEBPS/' + path, book.cover.data);
    manifest.push(`<item id="cover" href="${path}" media-type="${type}" properties="cover-image"/>`);
    coverMeta = '<meta name="cover" content="cover"/>';
  }
  zip.file('OEBPS/nav.xhtml', navXhtml(book));

  const uid = 'folio-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${uid}</dc:identifier>
<dc:title>${escXml(book.title)}</dc:title>
${book.author ? `<dc:creator>${escXml(book.author)}</dc:creator>` : ''}
<dc:language>${escXml(book.lang || 'en')}</dc:language>
${book.description ? `<dc:description>${escXml(book.description)}</dc:description>` : ''}
<meta property="dcterms:modified">2000-01-01T00:00:00Z</meta>
${book.comic ? '<meta property="rendition:layout">pre-paginated</meta>' : ''}
${coverMeta}
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine${book.direction ? ` page-progression-direction="${book.direction}"` : ''}>
${spine.join('\n')}
</spine>
</package>`);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/epub+zip' });
}

/* ---------- blocks → sections ----------
   A block is { html, len, level? } where level marks a heading (1 = biggest).
   Headings at the top level that occurs at least twice start new sections and
   go in the contents; one level below them is listed but doesn't split. */

function markHeadings(blocks) {
  const counts = new Map();
  for (const b of blocks) if (b.level) counts.set(b.level, (counts.get(b.level) || 0) + 1);
  const levels = [...counts.keys()].sort((a, b) => a - b);
  if (!levels.length) return blocks;
  const top = levels.find((l) => counts.get(l) >= 2) || levels[0];
  for (const b of blocks) {
    if (!b.level || b.level > top + 1) continue;
    b.toc = [{ label: b.label, depth: b.level <= top ? 0 : 1 }];
    if (b.level <= top) b.br = true;
  }
  return blocks;
}

function blocksToSections(blocks) {
  const sections = [], toc = [];
  let cur = null;
  for (const b of blocks) {
    if (!cur || (b.br && cur.len) || cur.len > CHUNK_CHARS) {
      cur = { parts: [], len: 0, title: '' };
      sections.push(cur);
    }
    for (const t of b.toc || []) {
      toc.push({ label: t.label, depth: t.depth, section: sections.length - 1 });
      if (!cur.title) cur.title = t.label;
    }
    cur.parts.push(b.html);
    cur.len += b.len;
  }
  return { sections: sections.map((s) => ({ title: s.title, body: s.parts.join('\n') })), toc };
}

/* ---------- plain text ---------- */

const NUM_WORDS = new Set('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth last final'.split(' '));
const HEADING_WORDS = new Set('chapter book part volume letter act canto stave section'.split(' '));
const LONE_HEADINGS = /^(prologue|epilogue|preface|foreword|introduction|afterword|appendix|contents|table of contents|conclusion|dedication)[.:]?$/i;

function isTextHeading(line) {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (LONE_HEADINGS.test(t) || /^[IVXLC]+\.?$/.test(t)) return true;
  const m = t.match(/^([A-Za-z]+)\s+([^\s.:,]+)/);
  if (!m || !HEADING_WORDS.has(m[1].toLowerCase())) return false;
  const n = m[2];
  return /^\d+$/.test(n) || /^[IVXLC]+$/.test(n) || n.toLowerCase().split('-').every((w) => NUM_WORDS.has(w));
}

function textBlocks(text) {
  text = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  const lines = text.split('\n');
  let paras = text.split(/\n[ \t]*\n+/);
  // one paragraph per line, without blank lines in between
  if (paras.length < lines.length / 20) paras = lines;
  const blocks = [];
  for (const p of paras) {
    const ls = p.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!ls.length) continue;
    if (ls.length <= 3 && isTextHeading(ls[0])) {
      const label = ls.join(' ');
      blocks.push({ html: `<h2>${ls.map(escXml).join('<br/>')}</h2>`, len: label.length, level: 1, label });
      continue;
    }
    const verse = ls.length > 1 && Math.max(...ls.map((l) => l.length)) < 55;
    const html = verse ? ls.map(escXml).join('<br/>') : escXml(ls.join(' '));
    blocks.push({ html: `<p>${html}</p>`, len: html.length });
  }
  return blocks;
}

function fromText(bytes, name) {
  const { sections, toc } = blocksToSections(markHeadings(textBlocks(decodeText(bytes))));
  return { title: bookBaseName(name), sections, toc };
}

/* ---------- Markdown ---------- */

function mdInline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = escXml(s)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (m, alt) => alt ? `<em>${alt}</em>` : '')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (m, t, u) => /^(https?:|mailto:)/i.test(u) ? `<a href="${u}">${t}</a>` : t)
    .replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)(.+?)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)(.+?)_(?=[^\w]|$)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${escXml(codes[i])}</code>`);
}

function mdBlocks(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const push = (html, extra) => blocks.push(Object.assign({ html, len: plainLen(html) }, extra));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = line.match(/^\s*(```|~~~)/))) {
      const code = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(m[1]); i++) code.push(lines[i]);
      i++;
      push(`<pre><code>${escXml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      const label = m[2].replace(/[*_`]/g, '');
      push(`<h${m[1].length}>${mdInline(m[2])}</h${m[1].length}>`, { level: m[1].length, label });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { push('<hr/>'); i++; continue; }
    if (/^\s*>/.test(line)) {
      const q = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) q.push(lines[i].replace(/^\s*>\s?/, ''));
      push(`<blockquote><p>${mdInline(q.join(' '))}</p></blockquote>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      for (; i < lines.length && lines[i].trim(); i++) {
        const li = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)/);
        if (li) items.push(li[1]);
        else if (items.length) items[items.length - 1] += ' ' + lines[i].trim();
      }
      const tag = ordered ? 'ol' : 'ul';
      push(`<${tag}>${items.map((t) => `<li>${mdInline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*>)/.test(lines[i]); i++) para.push(lines[i].trim());
    push(`<p>${mdInline(para.join(' '))}</p>`);
  }
  return blocks;
}

function fromMarkdown(bytes, name) {
  const blocks = mdBlocks(decodeText(bytes));
  const first = blocks.find((b) => b.level === 1);
  const { sections, toc } = blocksToSections(markHeadings(blocks));
  return { title: (first && first.label) || bookBaseName(name), sections, toc };
}

/* ---------- HTML ---------- */

function fromHtml(bytes, name) {
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4096));
  const cs = head.match(/<meta[^>]+charset=["']?([\w-]+)/i);
  const doc = new DOMParser().parseFromString(decodeText(bytes, cs && cs[1]), 'text/html');
  // pages saved from the web point at files we don't have; inline (data:) images still work
  doc.querySelectorAll('img').forEach((img) => { if (!/^data:image\//i.test(img.getAttribute('src') || '')) img.remove(); });
  doc.querySelectorAll('a[href]').forEach((a) => { if (!/^(https?:|mailto:|#)/i.test(a.getAttribute('href'))) a.removeAttribute('href'); });

  const title = (doc.title || (doc.querySelector('h1') || {}).textContent || '').replace(/\s+/g, ' ').trim() || bookBaseName(name);
  const meta = doc.querySelector('meta[name="author" i]');
  const styles = Array.from(doc.querySelectorAll('style'));
  const book = { title, author: meta ? meta.getAttribute('content') : '', lang: doc.documentElement.getAttribute('lang') || '', sections: [], toc: [] };

  const makeDoc = (secTitle, nodes) => {
    const d = document.implementation.createHTMLDocument(secTitle);
    for (const s of styles) d.head.appendChild(d.importNode(s, true));
    for (const n of nodes) d.body.appendChild(d.importNode(n, true));
    return d;
  };

  // split at h1 (or h2) when those headings are siblings holding most of the text
  let heads = Array.from(doc.querySelectorAll('h1'));
  if (heads.length < 2) heads = Array.from(doc.querySelectorAll('h2'));
  const parent = heads.length >= 2 && heads[0].parentNode;
  const total = (doc.body.textContent || '').length;
  if (parent && heads.every((x) => x.parentNode === parent) && (parent.textContent || '').length >= total * 0.8) {
    let cur = { title: '', nodes: [] };
    const out = [cur];
    for (const n of Array.from(parent.childNodes)) {
      if (heads.includes(n) && cur.nodes.some((x) => (x.textContent || '').trim() || x.nodeName === 'IMG')) {
        cur = { title: '', nodes: [] };
        out.push(cur);
      }
      if (heads.includes(n)) {
        cur.title = n.textContent.replace(/\s+/g, ' ').trim();
        book.toc.push({ label: cur.title, depth: 0, section: out.length - 1 });
      }
      cur.nodes.push(n);
    }
    book.sections = out.map((s) => ({ title: s.title, doc: makeDoc(s.title || title, s.nodes) }));
  } else {
    book.sections = [{ title, doc: makeDoc(title, Array.from(doc.body.childNodes)) }];
  }
  return book;
}

/* ---------- FictionBook (FB2) ---------- */

const XLINK = 'http://www.w3.org/1999/xlink';

function fb2Href(el) {
  return el.getAttributeNS(XLINK, 'href') || el.getAttribute('l:href') || el.getAttribute('xlink:href') || el.getAttribute('href') || '';
}

async function fromFb2(bytes, name) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    const zip = await JSZip.loadAsync(bytes);
    const f = Object.values(zip.files).find((x) => /\.fb2$/i.test(x.name));
    if (!f) throw bookError('This archive doesn’t contain an FB2 book');
    bytes = await f.async('uint8array');
  }
  const prolog = new TextDecoder('windows-1252').decode(bytes.subarray(0, 200));
  const enc = prolog.match(/encoding=["']([\w-]+)/i);
  const xml = xmlDoc(decodeText(bytes, enc && enc[1]));
  const root = xml.documentElement;
  if (!root || root.localName !== 'FictionBook') throw bookError('This isn’t a valid FB2 book');

  const info = kid(kid(root, 'description'), 'title-info');
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const authors = kids(info, 'author').map((a) =>
    ['first-name', 'middle-name', 'last-name'].map((n) => text(kid(a, n))).filter(Boolean).join(' ') || text(kid(a, 'nickname'))).filter(Boolean);

  // images live in <binary> elements as base64
  const resources = [], imagePath = new Map();
  for (const b of kids(root, 'binary')) {
    const id = b.getAttribute('id');
    if (!id) continue;
    let data;
    try { data = Uint8Array.from(atob(b.textContent.replace(/\s+/g, '')), (c) => c.charCodeAt(0)); } catch (e) { continue; }
    const type = sniffType(data) || b.getAttribute('content-type') || 'image/jpeg';
    const path = 'images/i' + resources.length + '.' + (EXT_OF_TYPE[type] || 'jpg');
    resources.push({ path, data, type });
    imagePath.set(id, { path, data, type });
  }
  const img = (el) => {
    const r = imagePath.get(fb2Href(el).replace(/^#/, ''));
    return r ? `<img src="${r.path}" alt=""/>` : '';
  };
  const idAttr = (el) => (el.getAttribute('id') ? ` id="${escXml(el.getAttribute('id'))}"` : '');

  const inline = (el) => Array.from(el.childNodes).map((n) => {
    if (n.nodeType === 3) return escXml(n.nodeValue);
    if (n.nodeType !== 1) return '';
    const inner = () => inline(n);
    switch (n.localName) {
      case 'strong': return `<strong>${inner()}</strong>`;
      case 'emphasis': return `<em>${inner()}</em>`;
      case 'strikethrough': return `<s>${inner()}</s>`;
      case 'sub': return `<sub>${inner()}</sub>`;
      case 'sup': return `<sup>${inner()}</sup>`;
      case 'code': return `<code>${inner()}</code>`;
      case 'image': return img(n);
      case 'a': {
        const href = fb2Href(n);
        const body = n.getAttribute('type') === 'note' ? `<sup>${inner()}</sup>` : inner();
        return /^(#|https?:|mailto:)/i.test(href) ? `<a href="${escXml(href)}">${body}</a>` : body;
      }
      default: return inner();
    }
  }).join('');

  const block = (el, depth) => Array.from(el.children).map((n) => {
    switch (n.localName) {
      case 'section': return `<section${idAttr(n)}>${block(n, depth + 1)}</section>`;
      case 'title': {
        const lvl = Math.min(6, depth + 1);
        return `<h${lvl}${idAttr(n)}>${kids(n, 'p').map(inline).join('<br/>')}</h${lvl}>`;
      }
      case 'subtitle': return `<p class="subtitle"${idAttr(n)}><strong>${inline(n)}</strong></p>`;
      case 'p': return `<p${idAttr(n)}>${inline(n)}</p>`;
      case 'empty-line': return '<p>&#160;</p>';
      case 'image': return `<p class="image">${img(n)}</p>`;
      case 'poem': return `<div class="poem"${idAttr(n)}>${block(n, depth)}</div>`;
      case 'stanza': return `<div class="stanza">${block(n, depth)}</div>`;
      case 'v': return `<p class="v">${inline(n)}</p>`;
      case 'epigraph': return `<blockquote class="epigraph"${idAttr(n)}>${block(n, depth)}</blockquote>`;
      case 'cite': return `<blockquote${idAttr(n)}>${block(n, depth)}</blockquote>`;
      case 'text-author': return `<p class="text-author">${inline(n)}</p>`;
      case 'annotation': return `<div class="annotation">${block(n, depth)}</div>`;
      case 'table': return `<table>${kids(n, 'tr').map((tr) => `<tr>${Array.from(tr.children).map((c) =>
        `<${c.localName === 'th' ? 'th' : 'td'}>${inline(c)}</${c.localName === 'th' ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
      default: return '';
    }
  }).join('');
  const titleText = (sec) => kids(kid(sec, 'title'), 'p').map(text).join(' ').trim();

  const sections = [], toc = [];
  const bodies = kids(root, 'body');
  const main = bodies.find((b) => !b.getAttribute('name')) || bodies[0];
  if (main) {
    // descend through wrappers that hold a single section of chapters
    let prelude = '', container = main, depth = 0;
    const ownHtml = (el, d) => {
      const tmp = xml.createElementNS(el.namespaceURI, 'x');
      for (const c of Array.from(el.children)) if (c.localName !== 'section') tmp.appendChild(c.cloneNode(true));
      return block(tmp, d);
    };
    while (kids(container, 'section').length === 1 && kids(kids(container, 'section')[0], 'section').length > 1) {
      prelude += ownHtml(container, depth);
      container = kids(container, 'section')[0];
      depth++;
    }
    prelude += ownHtml(container, depth);
    if (prelude.replace(/<(?!img)[^>]*>|&#160;/g, '').trim()) sections.push({ title: '', body: prelude });
    for (const sec of kids(container, 'section')) {
      const label = titleText(sec);
      if (label) toc.push({ label, depth: 0, section: sections.length });
      for (const sub of kids(sec, 'section')) {
        const sl = titleText(sub);
        if (sl) toc.push({ label: sl, depth: 1, section: sections.length });
      }
      sections.push({ title: label, body: `<section${idAttr(sec)}>${block(sec, depth + 1)}</section>` });
    }
  }
  for (const b of bodies.filter((x) => x !== main)) {
    const label = text(kid(b, 'title')) || (b.getAttribute('name') === 'notes' ? 'Notes' : 'Appendix');
    toc.push({ label, depth: 0, section: sections.length });
    sections.push({ title: label, body: block(b, 0) });
  }

  // footnote links point at ids that may now live in another file
  const fileOfId = new Map();
  sections.forEach((s, i) => { for (const m of s.body.matchAll(/\sid="([^"]+)"/g)) fileOfId.set(m[1], sectionFile(i)); });
  sections.forEach((s, i) => {
    s.body = s.body.replace(/href="#([^"]+)"/g, (m, id) => {
      const f = fileOfId.get(id);
      return f && f !== sectionFile(i) ? `href="${f}#${id}"` : m;
    });
  });

  const coverImg = kid(kid(info, 'coverpage'), 'image');
  const cover = coverImg ? imagePath.get(fb2Href(coverImg).replace(/^#/, '')) : null;
  return {
    title: text(kid(info, 'book-title')) || bookBaseName(name),
    author: authors.join(', '),
    lang: text(kid(info, 'lang')),
    description: text(kid(info, 'annotation')),
    cover: cover ? { data: cover.data, type: cover.type } : null,
    resources, sections, toc,
  };
}

/* ---------- Word (DOCX) ---------- */

async function fromDocx(bytes, name) {
  const zip = await JSZip.loadAsync(bytes);
  const read = async (p) => { const f = zip.file(p); return f ? xmlDoc(await f.async('string')) : null; };
  const docXml = await read('word/document.xml');
  if (!docXml) throw bookError('This isn’t a Word document');
  const attr = (el, n) => (el ? el.getAttribute('w:' + n) : null);
  const on = (el) => !!el && !/^(0|false|off|none)$/i.test(attr(el, 'val') || '');

  const rels = new Map();
  const relXml = await read('word/_rels/document.xml.rels');
  if (relXml) for (const r of relXml.getElementsByTagName('Relationship')) rels.set(r.getAttribute('Id'), { target: r.getAttribute('Target'), external: r.getAttribute('TargetMode') === 'External' });

  // paragraph style → heading level (Heading 1…6, Title, or an outline level)
  const styleLevel = new Map();
  const stylesXml = await read('word/styles.xml');
  if (stylesXml) {
    const byId = new Map();
    for (const s of stylesXml.getElementsByTagName('w:style')) byId.set(attr(s, 'styleId'), s);
    const levelOf = (id, seen = 0) => {
      const s = byId.get(id);
      if (!s || seen > 10) return 0;
      const nm = attr(kid(s, 'name'), 'val') || '';
      let m = nm.match(/^heading\s*(\d)$/i);
      if (m) return Number(m[1]);
      if (/^title$/i.test(nm)) return -1;
      const ol = kid(kid(s, 'pPr'), 'outlineLvl');
      if (ol && Number(attr(ol, 'val')) < 9) return Number(attr(ol, 'val')) + 1;
      const based = kid(s, 'basedOn');
      return based ? levelOf(attr(based, 'val'), seen + 1) : 0;
    };
    for (const id of byId.keys()) styleLevel.set(id, levelOf(id));
  }

  const resources = [], imageByRel = new Map();
  const image = async (rid) => {
    if (imageByRel.has(rid)) return imageByRel.get(rid);
    let out = '';
    const rel = rels.get(rid);
    if (rel && !rel.external) {
      // targets are relative to word/, or absolute within the package
      const parts = [];
      for (const s of (rel.target.startsWith('/') ? rel.target.slice(1) : 'word/' + rel.target).split('/')) {
        if (s === '..') parts.pop();
        else if (s && s !== '.') parts.push(s);
      }
      const f = zip.file(parts.join('/'));
      const type = IMAGE_TYPES[(rel.target.split('.').pop() || '').toLowerCase()];
      if (f && type) {
        const p = 'images/' + resources.length + '.' + EXT_OF_TYPE[type];
        resources.push({ path: p, data: await f.async('uint8array'), type });
        out = `<img src="${p}" alt=""/>`;
      }
    }
    imageByRel.set(rid, out);
    return out;
  };

  const inline = async (el) => {
    let out = '';
    for (const n of Array.from(el.children)) {
      switch (n.localName) {
        case 'r': {
          const pr = kid(n, 'rPr');
          let t = '';
          for (const c of Array.from(n.children)) {
            if (c.localName === 't') t += escXml(c.textContent);
            else if (c.localName === 'tab') t += ' ';
            else if (c.localName === 'noBreakHyphen') t += '‑';
            else if ((c.localName === 'br' && attr(c, 'type') !== 'page') || c.localName === 'cr') t += '<br/>';
            else if (c.localName === 'drawing' || c.localName === 'pict') {
              const blip = c.getElementsByTagName('a:blip')[0];
              const vml = c.getElementsByTagName('v:imagedata')[0];
              const rid = blip ? blip.getAttribute('r:embed') : vml ? vml.getAttribute('r:id') : null;
              if (rid) t += await image(rid);
            }
          }
          if (!t) break;
          if (pr) {
            const va = attr(kid(pr, 'vertAlign'), 'val');
            if (va === 'superscript') t = `<sup>${t}</sup>`;
            else if (va === 'subscript') t = `<sub>${t}</sub>`;
            if (on(kid(pr, 'strike')) || on(kid(pr, 'dstrike'))) t = `<s>${t}</s>`;
            if (on(kid(pr, 'u'))) t = `<u>${t}</u>`;
            if (on(kid(pr, 'i'))) t = `<em>${t}</em>`;
            if (on(kid(pr, 'b'))) t = `<strong>${t}</strong>`;
          }
          out += t;
          break;
        }
        case 'hyperlink': {
          const rel = rels.get(n.getAttribute('r:id'));
          const inner = await inline(n);
          out += rel && rel.external && /^(https?:|mailto:)/i.test(rel.target) ? `<a href="${escXml(rel.target)}">${inner}</a>` : inner;
          break;
        }
        case 'ins': case 'smartTag': case 'fldSimple': case 'customXml': case 'sdtContent':
          out += await inline(n);
          break;
        case 'sdt':
          out += await inline(kid(n, 'sdtContent') || n);
          break;
        default:
      }
    }
    return out;
  };

  const blocks = [];
  let list = null;
  const flushList = () => {
    if (!list) return;
    const html = `<ul>${list.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    blocks.push({ html, len: plainLen(html) });
    list = null;
  };
  const paragraph = async (p) => {
    const pPr = kid(p, 'pPr');
    const html = await inline(p);
    if (!html.replace(/<br\/>/g, '').trim()) return null;
    const style = attr(kid(pPr, 'pStyle'), 'val');
    let level = styleLevel.get(style) || 0;
    const ol = kid(pPr, 'outlineLvl');
    if (!level && ol && Number(attr(ol, 'val')) < 9) level = Number(attr(ol, 'val')) + 1;
    const jc = attr(kid(pPr, 'jc'), 'val');
    const align = jc === 'center' ? ' class="center"' : jc === 'right' || jc === 'end' ? ' style="text-align:right"' : '';
    return { html, level, list: !!kid(pPr, 'numPr'), align };
  };
  const walk = async (container) => {
    for (const n of Array.from(container.children)) {
      if (n.localName === 'p') {
        const p = await paragraph(n);
        if (!p) continue;
        if (p.list && p.level <= 0) { (list = list || []).push(p.html); continue; }
        flushList();
        if (p.level === -1) blocks.push({ html: `<h1 class="center">${p.html}</h1>`, len: plainLen(p.html) });
        else if (p.level > 0) {
          const label = p.html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
          blocks.push({ html: `<h${Math.min(6, p.level)}>${p.html}</h${Math.min(6, p.level)}>`, len: label.length, level: p.level, label });
        } else blocks.push({ html: `<p${p.align}>${p.html}</p>`, len: plainLen(p.html) });
      } else if (n.localName === 'tbl') {
        flushList();
        let html = '<table>';
        for (const tr of kids(n, 'tr')) {
          html += '<tr>';
          for (const tc of kids(tr, 'tc')) {
            const cells = [];
            for (const p of kids(tc, 'p')) { const x = await paragraph(p); if (x) cells.push(x.html); }
            html += `<td>${cells.join('<br/>')}</td>`;
          }
          html += '</tr>';
        }
        blocks.push({ html: html + '</table>', len: plainLen(html) });
      } else if (n.localName === 'sdt') {
        await walk(kid(n, 'sdtContent') || n);
      }
    }
  };
  await walk(kid(docXml.documentElement, 'body'));
  flushList();

  const core = await read('docProps/core.xml');
  const meta = (tag) => { const el = core && core.getElementsByTagName(tag)[0]; return el ? el.textContent.trim() : ''; };
  const { sections, toc } = blocksToSections(markHeadings(blocks));
  return { title: meta('dc:title') || bookBaseName(name), author: meta('dc:creator'), lang: meta('dc:language'), resources, sections, toc };
}

/* ---------- Kindle (MOBI, AZW, AZW3) via foliate-js ---------- */

async function unzlib(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fromMobi(bytes, name) {
  const magic = new TextDecoder('latin1').decode(bytes.subarray(60, 68));
  if (magic !== 'BOOKMOBI') throw bookError(magic === 'TEXtREAd' ? 'Plain PalmDOC books aren’t supported' : 'This isn’t a Kindle book Folio can read (KFX isn’t supported)');
  const { MOBI } = await import(vendorUrl('foliate-mobi.js'));
  const mobi = new MOBI({ unzlib });
  const book = await mobi.open(new Blob([bytes]));
  if (mobi.headers.palmdoc.encryption) throw bookError('This book is DRM-protected, so it can’t be opened');

  // foliate hands out blob: URLs for images, styles and fonts; pack them into the EPUB
  const resources = [], local = new Map();
  const localize = async (text, prefix) => {
    for (const u of new Set(text.match(/blob:[^"')\s>]+/g) || [])) {
      if (!local.has(u)) {
        const id = 'r' + local.size;
        local.set(u, id);
        const blob = await (await fetch(u)).blob();
        let data = new Uint8Array(await blob.arrayBuffer());
        const type = sniffType(data) || blob.type || 'application/octet-stream';
        const file = id + '.' +(EXT_OF_TYPE[type] || type.split('/').pop().replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin');
        local.set(u, file);
        if (type === 'text/css') data = new TextEncoder().encode(await localize(new TextDecoder().decode(data), ''));
        resources.push({ path: 'res/' + file, data, type });
      }
      text = text.split(u).join(prefix + local.get(u));
    }
    return text;
  };

  const spineOf = new Map();
  book.sections.forEach((s, i) => { if (s.load) spineOf.set(i, spineOf.size); });
  const sections = [];
  for (const [i] of spineOf) {
    const s = book.sections[i];
    const text = await localize(await (await fetch(await s.load())).text(), 'res/');
    let doc = new DOMParser().parseFromString(text, 'application/xhtml+xml');
    if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(text, 'text/html');
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!/^(filepos|kindle):/i.test(href)) continue;
      let target = null;
      try { const r = await book.resolveHref(href); target = r ? spineOf.get(r.index) : null; } catch (e) {}
      if (target == null) a.removeAttribute('href');
      else a.setAttribute('href', sectionFile(target) + (href.startsWith('filepos:') ? '#filepos' + href.slice(8) : ''));
    }
    sections.push({ doc });
  }

  const toc = [];
  const walkToc = async (items, depth) => {
    for (const it of items || []) {
      try {
        const r = await book.resolveHref(it.href);
        const idx = r ? spineOf.get(r.index) : null;
        if (idx != null && it.label) toc.push({ label: it.label, depth, section: idx });
      } catch (e) {}
      if (depth < 2) await walkToc(it.subitems, depth + 1);
    }
  };
  await walkToc(book.toc, 0);

  const md = book.metadata || {};
  let cover = null;
  try {
    const blob = await book.getCover();
    if (blob) { const data = new Uint8Array(await blob.arrayBuffer()); cover = { data, type: sniffType(data) }; }
  } catch (e) {}
  const out = {
    title: md.title || bookBaseName(name),
    author: [].concat(md.author || []).join(', '),
    lang: [].concat(md.language || [])[0] || '',
    description: (md.description || '').replace(/<[^>]*>/g, ''),
    cover, resources, sections, toc,
  };
  try { book.destroy(); } catch (e) {}
  return out;
}

/* ---------- PDF (text reflowed into paragraphs) via pdf.js ---------- */

async function fromPdf(bytes, name) {
  const pdfjs = await import(vendorUrl('pdf.min.mjs'));
  pdfjs.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.min.mjs');
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (e) {
    throw bookError(e && e.name === 'PasswordException' ? 'This PDF is password-protected' : 'This PDF couldn’t be read');
  }

  // 1. text runs → lines, per page
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const lines = [];
    let cur = null;
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const [, , c, d, x, y] = it.transform;
      const size = Math.hypot(c, d) || it.height || 10;
      if (it.str.trim()) {
        if (cur && Math.abs(y - cur.y) < size * 0.5 && x > cur.right - size) {
          if (x - cur.right > size * 0.15 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += ' ';
          cur.text += it.str;
          cur.right = Math.max(cur.right, x + it.width);
          if (it.str.length > cur.main) { cur.size = size; cur.main = it.str.length; }
        } else {
          cur = { x, y, right: x + it.width, size, main: it.str.length, text: it.str };
          lines.push(cur);
        }
      }
      if (it.hasEOL) cur = null;
    }
    for (const l of lines) l.text = l.text.replace(/\s+/g, ' ').trim();
    pages.push(lines.filter((l) => l.text));
    page.cleanup();
  }
  const chars = pages.reduce((s, p) => s + p.reduce((t, l) => t + l.text.length, 0), 0);
  // scanned books, comics and manga have no text layer: keep each page as a picture instead
  if (chars < pdf.numPages * 25) {
    const out = await pdfPictures(pdf, name);
    await task.destroy();
    return out;
  }

  // 2. drop running headers, footers and page numbers: lines at the top or bottom of a page,
  //    set apart from the text by extra space, that are a number or repeat across pages
  const edgeKey = (t) => t.toLowerCase().replace(/\d+/g, '#');
  const edges = pages.map((p) => {
    const gaps = [];
    for (let i = 1; i < p.length; i++) { const g = p[i - 1].y - p[i].y; if (g > 0 && g < p[i].size * 3) gaps.push(g); }
    gaps.sort((a, b) => a - b);
    const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    const apart = (a, b) => !b || !typical || Math.abs(a.y - b.y) > typical * 1.4;
    const out = new Set();
    if (p.length && apart(p[0], p[1])) out.add(p[0]);
    if (p.length > 1 && apart(p[p.length - 1], p[p.length - 2])) out.add(p[p.length - 1]);
    return out;
  });
  const repeats = new Map();
  for (const e of edges) for (const l of e) repeats.set(edgeKey(l.text), (repeats.get(edgeKey(l.text)) || 0) + 1);
  pages.forEach((p, i) => {
    pages[i] = p.filter((l) => !(edges[i].has(l) && (/^(page\s*)?[\divxlc]+(\s*(of|\/)\s*\d+)?$/i.test(l.text) || (repeats.get(edgeKey(l.text)) >= 3 && l.text.length < 120))));
  });

  // 3. lines → paragraphs and headings
  const sizes = [];
  for (const p of pages) for (const l of p) sizes.push([Math.round(l.size * 2) / 2, l.text.length]);
  const bySize = new Map();
  for (const [s, n] of sizes) bySize.set(s, (bySize.get(s) || 0) + n);
  const bodySize = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const headingSizes = [...bySize.keys()].filter((s) => s > bodySize * 1.15).sort((a, b) => b - a);
  const isHeading = (l) => l.size > bodySize * 1.15 && l.text.length < 120;
  const ends = (t) => /[.!?:;"”’)\]]$/.test(t);
  const join = (a, b) => (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b) ? a.slice(0, -1) + b : a + ' ' + b);

  const paras = [];
  let para = null;
  pages.forEach((lines, pi) => {
    const bodyLines = lines.filter((l) => Math.abs(l.size - bodySize) < 1);
    const xs = new Map();
    for (const l of bodyLines) xs.set(Math.round(l.x), (xs.get(Math.round(l.x)) || 0) + 1);
    const left = xs.size ? Number([...xs.entries()].sort((a, b) => b[1] - a[1])[0][0]) : 0;
    const rights = bodyLines.map((l) => l.right).sort((a, b) => a - b);
    const right = rights.length ? rights[Math.floor(rights.length * 0.9)] : Infinity;
    const gaps = [];
    for (let i = 1; i < bodyLines.length; i++) { const g = bodyLines[i - 1].y - bodyLines[i].y; if (g > 0 && g < bodySize * 3) gaps.push(g); }
    gaps.sort((a, b) => a - b);
    const lineGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : bodySize * 1.3;

    lines.forEach((l, i) => {
      const prev = i ? lines[i - 1] : null;
      if (isHeading(l)) {
        if (para && para.heading && prev && Math.abs(para.size - l.size) < 1 && prev.y - l.y < l.size * 2.2) para.text += ' ' + l.text;
        else { para = { heading: true, size: l.size, text: l.text, page: pi }; paras.push(para); }
        return;
      }
      const indented = l.x > left + bodySize * 0.8;
      let fresh = !para || para.heading;
      if (!fresh && prev) {
        const gap = prev.y - l.y;
        fresh = gap > lineGap * 1.5 || (indented && prev.x <= left + 2) || (prev.right < right - bodySize * 3 && ends(prev.text)) || (gap < 0 && ends(prev.text));
      } else if (!fresh) {
        fresh = ends(para.text) && (indented || para.short);
      }
      if (fresh) { para = { text: l.text, page: pi }; paras.push(para); }
      else para.text = join(para.text, l.text);
      para.short = l.right < right - bodySize * 3;
    });
  });

  // 4. sections from the PDF outline, or from heading sizes when there isn't one
  const blocks = paras.map((p) => {
    if (!p.heading) return { html: `<p>${escXml(p.text)}</p>`, len: p.text.length, page: p.page };
    const lvl = Math.min(3, headingSizes.indexOf(Math.round(p.size * 2) / 2) + 1) || 3;
    return { html: `<h${lvl + 1}>${escXml(p.text)}</h${lvl + 1}>`, len: p.text.length, level: lvl, label: p.text, page: p.page };
  });
  const outline = [];
  try {
    const walk = async (items, depth) => {
      for (const it of items || []) {
        try {
          const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
          const ref = dest && dest[0];
          const page = typeof ref === 'number' ? ref : ref ? await pdf.getPageIndex(ref) : -1;
          if (page >= 0 && it.title) outline.push({ label: it.title, depth, page });
        } catch (e) {}
        if (depth < 1) await walk(it.items, depth + 1);
      }
    };
    await walk(await pdf.getOutline(), 0);
  } catch (e) {}
  if (outline.length >= 2) {
    outline.sort((a, b) => a.page - b.page);
    for (const o of outline) {
      const b = blocks.find((x) => x.page >= o.page);
      if (!b) continue;
      (b.toc = b.toc || []).push({ label: o.label, depth: o.depth });
      b.br = true;
    }
  } else markHeadings(blocks);
  const { sections, toc } = blocksToSections(blocks);

  // first page as the cover
  let cover = null;
  try {
    const p1 = await pdf.getPage(1);
    const vp = p1.getViewport({ scale: 600 / p1.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await p1.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (blob) cover = { data: new Uint8Array(await blob.arrayBuffer()), type: 'image/jpeg' };
  } catch (e) {}

  let info = {};
  try { info = (await pdf.getMetadata()).info || {}; } catch (e) {}
  await task.destroy();
  return { title: pdfTitle(info, name), author: (info.Author || '').trim(), cover, sections, toc };
}

/* the PDF's own title, unless it's one a program filled in */
function pdfTitle(info, name) {
  const t = (info.Title || '').trim();
  return !t || /^(untitled|microsoft word|document\d*$|about:blank$)|\.(docx?|pdf|indd|tex|jpe?g|tiff?)$/i.test(t) ? bookBaseName(name) : t;
}

/* every page of a PDF drawn as a picture, about as tall as a large screen */
async function pdfPictures(pdf, name) {
  const resources = [], sections = [];
  const canvas = document.createElement('canvas');
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(4, 1800 / base.height, 2400 / base.width) });
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    if (!blob) continue;
    const path = 'pages/p' + String(n).padStart(4, '0') + '.jpg';
    resources.push({ path, data: new Uint8Array(await blob.arrayBuffer()), type: 'image/jpeg' });
    sections.push(pictureSection(path, n));
  }
  if (!sections.length) throw bookError('This PDF couldn’t be read');
  let info = {};
  try { info = (await pdf.getMetadata()).info || {}; } catch (e) {}
  return {
    title: pdfTitle(info, name),
    author: (info.Author || '').trim(),
    cover: { data: resources[0].data, type: 'image/jpeg' },
    comic: true,
    css: COMIC_CSS,
    resources, sections, toc: [],
  };
}

/* ---------- comics and manga (CBZ, CBR, CBT): one picture per page ---------- */

/* a tar archive's files, as [{ name, data }] */
function untar(bytes) {
  const out = [];
  const str = (at, len) => new TextDecoder().decode(bytes.subarray(at, at + len)).replace(/\0[\s\S]*$/, '');
  let longName = '';
  for (let at = 0; at + 512 <= bytes.length;) {
    if (!bytes[at]) break;   // two empty blocks end the archive
    const size = parseInt(str(at + 124, 12).trim(), 8) || 0;
    const type = String.fromCharCode(bytes[at + 156]);
    const prefix = str(at + 257, 6) === 'ustar' ? str(at + 345, 155) : '';
    const data = bytes.subarray(at + 512, at + 512 + size);
    if (type === 'L') longName = new TextDecoder().decode(data).replace(/\0[\s\S]*$/, '');
    else {
      if (type === '0' || type === '\0') out.push({ name: longName || (prefix ? prefix + '/' : '') + str(at, 100), data });
      longName = '';
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

async function unrar(bytes) {
  const { createExtractorFromData } = await import(vendorUrl('unrar.js'));
  const wasmBinary = await (await fetch(vendorUrl('unrar.wasm'))).arrayBuffer();
  let files;
  try {
    const extractor = await createExtractorFromData({ wasmBinary, data: bytes.slice().buffer });
    files = [...extractor.extract().files];
  } catch (e) {
    throw bookError(/password/i.test(e && e.message) ? 'This comic is password-protected' : 'This RAR archive couldn’t be read');
  }
  return files.filter((f) => f.extraction).map((f) => ({ name: f.fileHeader.name, data: f.extraction }));
}

/* the files inside a comic archive, whatever its extension says it is */
async function comicFiles(bytes) {
  const magic = new TextDecoder('latin1').decode(bytes.subarray(0, 8));
  if (magic.startsWith('PK')) {
    const zip = await JSZip.loadAsync(bytes);
    const files = Object.values(zip.files).filter((f) => !f.dir);
    return Promise.all(files.map(async (f) => ({ name: f.name, data: await f.async('uint8array') })));
  }
  if (magic.startsWith('Rar!')) return unrar(bytes);
  if (magic.startsWith('7z\xBC\xAF')) throw bookError('7-Zip comics (CB7) aren’t supported yet. Re-pack it as a CBZ (a zip of the pages) to read it.');
  if (new TextDecoder('latin1').decode(bytes.subarray(257, 262)) === 'ustar') return untar(bytes);
  throw bookError('This doesn’t look like a comic archive');
}

/* ComicInfo.xml, the metadata file comic tools put next to the pages */
function comicInfo(text) {
  const root = xmlDoc(text).documentElement;
  const get = (n) => { const el = kid(root, n); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const manga = get('Manga');
  const series = get('Series');
  const number = get('Number'), volume = get('Volume');
  const numbered = series && (volume ? series + ' Vol. ' + volume : number ? series + ' #' + number : series);
  return {
    title: numbered ? (get('Title') && get('Title') !== series ? numbered + ': ' + get('Title') : numbered) : get('Title'),
    author: [...new Set([get('Writer'), get('Penciller')].join(',').split(',').map((s) => s.trim()).filter(Boolean))].join(', '),
    description: get('Summary'),
    lang: get('LanguageISO'),
    direction: /^yes/i.test(manga) ? (/lefttoright/i.test(manga) ? 'ltr' : 'rtl') : /^no$/i.test(manga) ? 'ltr' : '',
  };
}

async function fromComic(bytes, name) {
  const files = await comicFiles(bytes);
  const hidden = (n) => /(^|\/)(__MACOSX|\.)/.test(n) || /(^|\/)thumbs\.db$/i.test(n);
  const pages = files
    .filter((f) => !hidden(f.name) && IMAGE_TYPES[(f.name.split('.').pop() || '').toLowerCase()] && f.data.length)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  if (!pages.length) throw bookError('No pictures were found in this comic');
  const infoFile = files.find((f) => /(^|\/)comicinfo\.xml$/i.test(f.name));
  const info = infoFile ? comicInfo(decodeText(infoFile.data)) : {};

  const resources = [], sections = [], toc = [];
  let folder = null;
  pages.forEach((p, i) => {
    const type = sniffType(p.data) || IMAGE_TYPES[p.name.split('.').pop().toLowerCase()];
    const path = 'pages/p' + String(i + 1).padStart(4, '0') + '.' + (EXT_OF_TYPE[type] || 'jpg');
    resources.push({ path, data: p.data, type });
    sections.push(pictureSection(path, i + 1));
    // each folder in the archive is usually a chapter
    const dir = p.name.includes('/') ? p.name.slice(0, p.name.lastIndexOf('/')) : '';
    if (dir !== folder) {
      folder = dir;
      if (dir) toc.push({ label: dir.split('/').pop().replace(/_+/g, ' ').trim(), section: i, depth: 0 });
    }
  });
  return {
    title: info.title || bookBaseName(name),
    author: info.author || '',
    lang: info.lang || '',
    description: info.description || '',
    cover: { data: pages[0].data, type: resources[0].type },
    comic: true,
    direction: info.direction || '',
    css: COMIC_CSS,
    resources, sections, toc: toc.length > 1 ? toc : [],
  };
}

/* ---------- entry point ---------- */

const CONVERTERS = {
  MOBI: fromMobi, AZW: fromMobi, AZW3: fromMobi,
  FB2: fromFb2, PDF: fromPdf, DOCX: fromDocx,
  HTML: fromHtml, Markdown: fromMarkdown, Text: fromText,
  CBZ: fromComic, CBR: fromComic, CBT: fromComic, CB7: fromComic,
};

/* resolves to { bytes (an EPUB), format } */
async function convertToEpub(name, bytes) {
  const format = bookFormat(name) || 'EPUB';
  if (format === 'EPUB') return { bytes, format };
  const book = await CONVERTERS[format](bytes, name);
  book.title = (book.title || '').replace(/\s+/g, ' ').trim() || bookBaseName(name);
  return { bytes: await buildEpub(book), format };
}
