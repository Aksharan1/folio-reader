/* =========================================================
   DOM helpers, icons, generated covers, formatting
   ========================================================= */

/* h('div.card', { onclick, title }, child, 'text', ...) */
function h(spec, attrs, ...kids) {
  const [tag, ...classes] = spec.split('.');
  const n = document.createElement(tag || 'div');
  if (classes.length) n.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [p, pv] of Object.entries(v)) {
          if (p.startsWith('--')) n.style.setProperty(p, pv);
          else n.style[p] = pv;
        }
      }
      else if (k === 'class') n.className += (n.className ? ' ' : '') + v;
      else if (k in n && typeof v !== 'string') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
  }
  appendKids(n, kids);
  return n;
}

function appendKids(n, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) appendKids(n, k);
    else n.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
}

/* stroke icons, 24px grid */
const ICONS = {
  library:   '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  reading:   '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  heart:     '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  pen:       '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  user:      '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  settings:  '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  search:    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  minus:     '<path d="M5 12h14"/>',
  grid:      '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  rows:      '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  more:      '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  moreV:     '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  back:      '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  left:      '<path d="m15 18-6-6 6-6"/>',
  right:     '<path d="m9 18 6-6-6-6"/>',
  down:      '<path d="m6 9 6 6 6-6"/>',
  first:     '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
  last:      '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
  bookmark:  '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  toc:       '<path d="M3 6h18M3 12h12M3 18h15"/>',
  x:         '<path d="M18 6 6 18M6 6l12 12"/>',
  upload:    '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  trash:     '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  info:      '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  check:     '<path d="M20 6 9 17l-5-5"/>',
  clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  note:      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  copy:      '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  speaker:   '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  download:  '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>',
  sparkle:   '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  keyboard:  '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6M7 16h10"/>',
  menu:      '<path d="M4 6h16M4 12h16M4 18h16"/>',
  alignL:    '<path d="M3 6h18M3 10h12M3 14h18M3 18h10"/>',
  alignJ:    '<path d="M3 6h18M3 10h18M3 14h18M3 18h18"/>',
  alignC:    '<path d="M3 6h18M6 10h12M3 14h18M7 18h10"/>',
  alignO:    '<path d="M3 6h18M3 10h15M3 14h18M3 18h8"/><path d="M19 16v4" stroke-dasharray="1 2"/>',
  book:      '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20v-5"/>',
};

function icon(name, size) {
  const s = size || 18;
  const span = document.createElement('span');
  span.className = 'ic';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

/* brand mark: an open book */
function logoMark() {
  const span = document.createElement('span');
  span.className = 'logo-mark';
  span.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path fill="currentColor" opacity=".55" d="M12 6.5C10.3 5 7.7 4.2 4.5 4.2c-.8 0-1.5.7-1.5 1.5v11.6c0 .8.7 1.5 1.5 1.5 3 0 5.4.7 7.5 2.2z"/><path fill="currentColor" d="M12 6.5c1.7-1.5 4.3-2.3 7.5-2.3.8 0 1.5.7 1.5 1.5v11.6c0 .8-.7 1.5-1.5 1.5-3 0-5.4.7-7.5 2.2z"/></svg>';
  return span;
}

function iconButton(name, label, onclick, cls) {
  return h('button.icon-btn' + (cls ? '.' + cls : ''), { type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
}

/* ---------- theme surfaces ---------- */

const SURFACES = ['bg', 'surface', 'surface-2', 'surface-3', 'elev', 'line', 'line-strong'];

/* #rrggbb to [hue, saturation %, lightness %] */
function hexToHsl(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, s * 100, l * 100];
}

/* sets el's surface colours to its theme's base colours (from app.css) moved `lift`
   lightness points lighter or darker, for the brightness slider */
function liftSurfaces(el, lift) {
  const cs = getComputedStyle(el);
  for (const name of SURFACES) {
    const hsl = hexToHsl(cs.getPropertyValue('--base-' + name));
    if (!hsl) continue;
    const l = Math.max(0, Math.min(100, hsl[2] + lift));
    el.style.setProperty('--' + name, `hsl(${hsl[0].toFixed(1)} ${hsl[1].toFixed(1)}% ${l.toFixed(1)}%)`);
  }
}

/* any CSS colour as #rrggbb (by painting a pixel), or null if it isn't one */
function cssHex(color) {
  const ctx = cssHex.ctx || (cssHex.ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
  if (!color || !CSS.supports('color', color.trim())) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color.trim();
  ctx.fillRect(0, 0, 1, 1);
  return '#' + [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/* ---------- generated covers for books without artwork ---------- */

function hashStr(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

function generatedCover(title, author) {
  const hsh = hashStr((title || '') + '|' + (author || ''));
  const hue = hsh % 360;
  const hue2 = (hue + 28 + (hsh >> 9) % 40) % 360;
  const el = h('div.cover-gen', {
    style: { background: `linear-gradient(155deg, hsl(${hue} 42% 34%), hsl(${hue2} 48% 16%))` },
  },
    h('div.cg-rule'),
    h('div.cg-title', title || 'Untitled'),
    h('div.cg-author', author || ''),
  );
  return el;
}

/* ---------- formatting ---------- */

function fmtDuration(ms) {
  if (!ms || ms < 60000) return ms ? '<1m' : '0m';
  const m = Math.round(ms / 60000);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

function fmtAgo(t) {
  if (!t) return 'Never';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1048576) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function initials(name) {
  const parts = (name || '?').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/);
  return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
