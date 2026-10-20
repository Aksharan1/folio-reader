/* =========================================================
   Reader engine — epub.js powered, reflowable EPUB rendering
   ========================================================= */

const TONES = {
  light:    { name: 'Paper',    bg: b => `hsl(48, 10%, ${88 + b * 12}%)`, fg: '#1f1f1f', link: '#2b5b8a', sel: 'rgba(47,100,163,.25)', light: true },
  sepia:    { name: 'Sepia',    bg: b => `hsl(39, 56%, ${78 + b * 14}%)`, fg: '#3d2e1c', link: '#7f4421', sel: 'rgba(155,90,47,.25)', light: true },
  dark:     { name: 'Dusk',     bg: b => `hsl(30, 8%,  ${12 + b * 14}%)`, fg: '#cfc8bc', link: '#9fbcd8', sel: 'rgba(208,138,82,.35)' },
  midnight: { name: 'Midnight', bg: b => `hsl(228, 26%, ${8 + b * 8}%)`,  fg: '#d4d7e3', link: '#a3a9ff', sel: 'rgba(124,108,246,.38)' },
  charcoal: { name: 'Black',    bg: b => `hsl(30, 6%,  ${2 + b * 9}%)`,   fg: '#b7b0a4', link: '#8ea8c4', sel: 'rgba(236,231,223,.22)' },
};
const TONE_ORDER = ['light', 'sepia', 'dark', 'midnight', 'charcoal'];

/* highlight palette: fill is drawn inside the page, solid is used for UI accents */
const HL_COLORS = {
  yellow: { fill: 'rgba(245,200,66,.42)',  solid: '#f2c744' },
  green:  { fill: 'rgba(84,201,132,.36)',  solid: '#4fc985' },
  blue:   { fill: 'rgba(86,156,255,.36)',  solid: '#569cff' },
  pink:   { fill: 'rgba(240,98,146,.36)',  solid: '#f06292' },
  purple: { fill: 'rgba(124,108,246,.45)', solid: '#8b7dff' },
};
const HL_ORDER = ['yellow', 'green', 'blue', 'pink', 'purple'];

const FONTS = [
  { id: 'publisher',   name: 'Original',          css: null },
  { id: 'avenir',      name: 'Avenir',            css: "'Avenir','Avenir Next','Century Gothic','Futura',sans-serif" },
  { id: 'baskerville', name: 'Baskerville',       css: "'Baskerville','Baskerville Old Face',Palatino,Georgia,serif" },
  { id: 'cochin',      name: 'Cochin',            css: "'Cochin','Palatino Linotype',Palatino,Georgia,serif" },
  { id: 'georgia',     name: 'Georgia',           css: "Georgia,serif" },
  { id: 'times',       name: 'Times',             css: "'Times New Roman',Times,serif" },
  { id: 'century',     name: 'Century Gothic',    css: "'Century Gothic','Futura',sans-serif" },
  { id: 'palatino',    name: 'Palatino',          css: "'Palatino Linotype',Palatino,serif" },
  { id: 'courier',     name: 'Courier',           css: "'Courier New',Courier,monospace" },
  { id: 'sans',        name: 'Sans',              css: "'Segoe UI','Helvetica Neue',Arial,sans-serif" },
  { id: 'serif',       name: 'Serif',             css: "serif" },
];

const MARGINS = [
  { id: 0, name: 'Narrow', side: 28,  vert: 34, width: '46em' },
  { id: 1, name: 'Normal', side: 76,  vert: 48, width: '40em' },
  { id: 2, name: 'Wide',   side: 132, vert: 64, width: '32em' },
];
const LINE_SPACINGS = [
  { id: 0, name: 'Tight',   v: 1.42 },
  { id: 1, name: 'Normal',  v: 1.68 },
  { id: 2, name: 'Relaxed', v: 1.95 },
  { id: 3, name: 'Open',    v: 2.3 },
];
const ALIGNS = [
  { id: 'original', name: 'Original', css: null },
  { id: 'left',     name: 'Left',     css: 'left' },
  { id: 'block',    name: 'Block',    css: 'justify' },
  { id: 'center',   name: 'Center',   css: 'center' },
];

function defaultSettings() {
  return { tone: 'midnight', brightness: 0.5, font: 'georgia', fontSize: 100, margin: 1, lines: 1, align: 'original' };
}

class Reader {
  constructor() {
    this.library = null;
    this.record = null;
    this.book = null;
    this.frame = null;
    this.renderedSection = null;
    this.spineIndex = 0;
    this.htmlCache = new Map();
    this.toc = [];
    this.lens = [];
    this.totalLen = 1;
    this.settings = defaultSettings();
    this.lastSelection = '';
    this.opening = false;
  }

  mark(s) {
    if (window.__erDebug) {
      if (!window.__erStages) window.__erStages = [];
      window.__erStages.push(s);
    }
  }

  async open(record, settingsOverride) {
    this.record = record;
    this.settings = Object.assign(defaultSettings(), settingsOverride || {});
    if (!TONES[this.settings.tone]) this.settings.tone = defaultSettings().tone;
    if (this.book) { try { this.book.destroy(); } catch (e) {} }
    this.htmlCache = new Map();
    this.frame = null;
    this.renderedSection = null;
    this.lastSelection = '';
    this.mark('data');
    const buf = await this.library.dataOf(record.id);
    if (!buf) throw new Error('Book data missing for ' + record.id);
    const book = new ePub(buf);
    this.book = book;
    this.mark('open');
    const timed = new Promise((r) => { setTimeout(() => r(new Error('epub open timeout')), 30000); });
    const opened = await Promise.race([book.opened, timed]);
    if (opened instanceof Error) throw opened;
    // the contents load separately from the package; small books can open before they're ready
    try { await book.loaded.navigation; } catch (e) {}
    this.mark('opened');

    // Table of contents flattened with spine indexes
    this.toc = [];
    const walk = (list, depth, parentIndex) => {
      for (const e of list) {
        const sec = book.spine.get(e.href);
        const idx = sec ? sec.index : 0;
        if (parentIndex !== null && idx === parentIndex) continue;
        const lab = (e.label || '').replace(/\s+/g, ' ').trim().replace(/[;:]+$/, '');
        this.toc.push({ label: lab || 'Untitled', spineIndex: idx, depth });
        if (e.subitems) walk(e.subitems, depth + 1, idx);
      }
    };
    walk(book.navigation && book.navigation.toc ? book.navigation.toc : [], 0, null);
    this.mark('toc:' + this.toc.length);

    // Pre-render every spine item (cached): gives text lengths for global %
    this.lens = [];
    this.totalLen = 0;
    for (let i = 0; i < book.spine.length; i++) {
      const sec = book.spine.get(i);
      let html = '';
      try { html = await sec.render(book.load.bind(book)); } catch (err) { html = ''; }
      this.htmlCache.set(i, html);
      const len = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').length;
      this.lens.push(len);
      this.totalLen += len;
      this.mark('render' + i);
    }
    this.mark('prerender');
    record.totalChars = this.totalLen;

    const pos = record.pos || { spineIndex: 0, frac: 0 };
    await this.renderSection(pos.spineIndex, pos.frac);
    this.mark('rendered');
  }

  chapterName(i) {
    let best = null;
    for (const t of this.toc) {
      if (t.spineIndex > i) continue;
      if (!best || t.spineIndex > best.spineIndex || (t.spineIndex === best.spineIndex && t.depth < best.depth)) best = t;
    }
    return best ? best.label : 'Beginning';
  }

  buildFrameHtml(spineIndex, frac, query, nth) {
    const s = this.settings;
    const tone = TONES[s.tone];
    const bg = tone.bg(s.brightness);
    const fg = tone.fg;
    const link = tone.link;
    const m = MARGINS[s.margin];
    const ls = LINE_SPACINGS[s.lines].v;
    const al = ALIGNS.find(a => a.id === s.align);
    const font = FONTS.find(f => f.id === s.font);

    const famDecl = font.css
      ? `body,p,div,span,li,dd,dt,blockquote,h1,h2,h3,h4,h5,h6,a,em,strong,b,i,code,pre,figcaption,th,td{font-family:${font.css} !important;}`
      : '';
    const alignDecl = al.css
      ? `body,p,div,li,dd,dt,blockquote,figcaption,h1,h2,h3,h4,h5,h6{text-align:${al.css} !important;}`
      : '';

    const hl = (this.record.annotations || []).filter(a => a.spineIndex === spineIndex && a.quote);
    const data = {
      highlights: hl.map(a => ({ q: a.quote, c: (HL_COLORS[a.color] || HL_COLORS.yellow).fill })),
      scrollTo: query || null,
      scrollNth: nth || 0,
      frac: (frac === null || frac === undefined) ? null : frac,
      dbg: (typeof window !== 'undefined' && window.__erDebug) ? 1 : 0,
    };
    /* tint search hits on the page they land on */
    if (query) data.highlights.push({ q: query, c: HL_COLORS.purple.fill });

    /* theme colours must win over the book's own stylesheet, including its !important rules
       on classed elements (body.calibre, p.txt…): the :not(#id) prefix lifts our specificity
       above any class selector. Inner backgrounds are cleared so the page colour shows through. */
    const R = ':root:not(#er-theme)';
    const css = `
${R}{background:${bg} !important;zoom:${s.fontSize / 100};scrollbar-width:none;}
${R} body{background:${bg} !important;color:${fg} !important;max-width:${m.width};margin:0 auto;padding:${m.vert}px min(${m.side}px, 6vw);}
${R} body *:not(mark){color:inherit !important;background-color:transparent !important;}
${R} body a, ${R} body a *{color:${link} !important;}
img{max-width:100%;height:auto;}
svg{max-width:100%;}
${famDecl}
${alignDecl}
body,p,li,dd,dt,blockquote,pre{line-height:${ls} !important;}
mark.erhl{color:inherit;border-radius:2px;}
::selection{background:${tone.sel};}
`;

    const js = `
(function(){
try{
  var d = JSON.parse(document.getElementById('er-data').textContent);
  var body = document.body || document.documentElement;

  function norm(t){ return t.replace(/\\s+/g,' ').trim(); }

  function mapFind(raw, q){
    var nq = norm(q);
    if (!nq.length) return null;
    var n2 = '', map = [], pend = false, i, cc;
    for (i = 0; i < raw.length; i++){
      cc = raw.charCodeAt(i);
      if (cc === 32 || cc === 10 || cc === 9 || cc === 13){ pend = true; continue; }
      if (pend && n2.length){ n2 += ' '; map.push(-1); }
      pend = false;
      n2 += raw.charAt(i); map.push(i);
    }
    var nl = n2.toLowerCase(), ql = nq.toLowerCase();
    var pos = nl.indexOf(ql);
    if (pos === -1) return null;
    var s = map[pos], e = map[pos + ql.length - 1];
    if (s === undefined || e === undefined || s < 0 || e < 0) return null;
    return [s, e + 1];
  }

  if (d.highlights && d.highlights.length){
    var targets = [], w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT), node;
    while ((node = w.nextNode())){
      if (node.nodeValue.length < 3) continue;
      for (var i = 0; i < d.highlights.length; i++){
        var r0 = mapFind(node.nodeValue, d.highlights[i].q);
        if (r0){ targets.push([node, r0[0], r0[1], d.highlights[i].c]); break; }
      }
    }
    for (var k = targets.length - 1; k >= 0; k--){
      var tn = targets[k][0], s0 = targets[k][1], e0 = targets[k][2];
      var full = tn.nodeValue;
      if (!tn.parentNode || s0 >= e0) continue;
      var before = full.slice(0, s0), mid = full.slice(s0, e0), after = full.slice(e0);
      var frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      var mk = document.createElement('mark'); mk.className = 'erhl'; mk.style.background = targets[k][3]; mk.textContent = mid;
      frag.appendChild(mk);
      if (after) frag.appendChild(document.createTextNode(after));
      tn.parentNode.replaceChild(frag, tn);
    }
  }

  function reEsc(s){
    var o = '';
    for (var i = 0; i < s.length; i++){ var c = s.charAt(i); o += ('.*+?^$()[]{}|\\\\'.indexOf(c) >= 0 ? '\\\\' : '') + c; }
    return o;
  }

  if (d.scrollTo){
    /* find the nth occurrence (search results count them in reading order) */
    var w2 = document.createTreeWalker(body, NodeFilter.SHOW_TEXT), n2, found = null, fs = 0, fe = 0, seen = 0;
    var re = new RegExp(reEsc(norm(d.scrollTo)).replace(/ /g, '\\\\s+'), 'gi');
    while (!found && (n2 = w2.nextNode())){
      re.lastIndex = 0;
      var mm;
      while ((mm = re.exec(n2.nodeValue))){
        if (seen === d.scrollNth){ found = n2; fs = mm.index; fe = mm.index + mm[0].length; break; }
        seen++;
        if (!mm[0].length) re.lastIndex++;
      }
    }
    if (!found){
      w2 = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      while ((n2 = w2.nextNode()) && !found){
        var r1 = mapFind(n2.nodeValue, d.scrollTo);
        if (r1){ found = n2; fs = r1[0]; fe = r1[1]; }
      }
    }
    if (found){
      var top = 0;
      try {
        var rg = new Range(found, fs, found, fe);
        top = rg.getBoundingClientRect().top;
        if (!top) { var el4 = found.parentElement || body; top = el4.getBoundingClientRect().top; }
      } catch(e2){
        var el2 = found.parentElement || body;
        top = el2.getBoundingClientRect().top;
      }
      var se2 = document.scrollingElement;
      se2.scrollTop = Math.max(0, Math.round(top - 24));
      if (d.dbg){ var de0 = document.getElementById('er-data'); if (de0) de0.setAttribute('data-dbg', (found ? '1' : '0') + '|' + Math.round(top) + '|' + Math.round(se2.scrollTop)); }
    }
  }

  /* page tops: cut pages between lines of text, so every page starts on a fresh line
     and nothing on one page is repeated on the next */
  function erPaginate(){
    var se0 = document.scrollingElement;
    var erVh = window.innerHeight;
    var erSh = se0.scrollHeight;
    var erTops = [0];
    if (erVh > 200 && erSh > erVh) {
      var erCand = [];
      var erScroll = se0.scrollTop;
      var erTw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var erRg = document.createRange(), erTn;
      while ((erTn = erTw.nextNode()) && erCand.length < 40000) {
        if (!erTn.nodeValue.trim()) continue;
        var ptag = erTn.parentNode && erTn.parentNode.tagName;
        if (ptag === 'SCRIPT' || ptag === 'STYLE' || ptag === 'TITLE') continue;
        erRg.selectNodeContents(erTn);
        var erRs = erRg.getClientRects();
        for (var ri = 0; ri < erRs.length; ri++) {
          if (erRs[ri].height > 1) erCand.push(Math.floor(erRs[ri].top + erScroll) - 1);
        }
      }
      /* pictures and rules can start a page too */
      var erMedia = document.body.querySelectorAll('img,svg,hr,table,figure,video');
      for (var ei = 0; ei < erMedia.length && ei < 2000; ei++) {
        var erR = erMedia[ei].getBoundingClientRect();
        if (erR.height > 1 && erR.width > 1) erCand.push(Math.floor(erR.top + erScroll) - 1);
      }
      erCand.sort(function(a, b){ return a - b; });
      /* room after the text, so the last page can also start on a line boundary */
      if (!document.getElementById('er-spacer')) {
        var erSp = document.createElement('div');
        erSp.id = 'er-spacer';
        erSp.style.height = erVh + 'px';
        document.body.appendChild(erSp);
      }
      var erLast = 0;
      while (erLast + erVh < erSh - 40) {
        var erLimit = erLast + erVh;
        var erPick = -1;
        for (var ec = 0; ec < erCand.length; ec++) {
          var cv = erCand[ec];
          if (cv > erLast + 60 && cv <= erLimit && cv > erPick) erPick = cv;
        }
        if (erPick < 0) erPick = erLimit;
        erTops.push(erPick);
        erLast = erPick;
      }
    }
    document.__erTops = erTops;
  }

  document.__erFrac = null;

  if (d.frac !== null && d.frac !== undefined){
    var se = document.scrollingElement;
    var vh0 = window.innerHeight;
    var sh0 = se.scrollHeight;
    var approx = [0];
    if (vh0 > 200 && sh0 > vh0) {
      for (var t0 = vh0; t0 <= sh0 - vh0; t0 += vh0) approx.push(t0);
      if (approx[approx.length - 1] < sh0 - vh0) approx.push(sh0 - vh0);
    }
    var erIdx = Math.round(d.frac * (approx.length - 1));
    if (erIdx < 0) erIdx = 0;
    if (erIdx > approx.length - 1) erIdx = approx.length - 1;
    se.scrollTop = approx[erIdx];
    document.__erFrac = d.frac;
  }

  window.addEventListener('load', function(){
    /* images and webfonts land after parse: cut the pages once, on the final layout */
    try {
      erPaginate();
      var tops = document.__erTops || [0];
      var se2 = document.scrollingElement;
      var fr = document.__erFrac;
      if (fr !== null && fr !== undefined) {
        var erIdx2 = Math.round(fr * (tops.length - 1));
        if (erIdx2 < 0) erIdx2 = 0;
        if (erIdx2 > tops.length - 1) erIdx2 = tops.length - 1;
        se2.scrollTop = tops[erIdx2];
      } else {
        var cur = se2.scrollTop;
        var maxT = Math.max(0, se2.scrollHeight - window.innerHeight);
        if (cur > maxT) cur = maxT;
        /* a search / highlight jump lands mid-page: snap back to the page that contains it */
        var snap = 0;
        for (var ti = 0; ti < tops.length; ti++) if (tops[ti] <= cur + 4) snap = tops[ti];
        se2.scrollTop = snap;
      }
    } catch (e2) {}
  });

  /* click in the gutter turns a page: right side = next, left side = previous */
  var erDown = null;
  document.addEventListener('mousedown', function(ev){
    try { erDown = { x: ev.clientX, y: ev.clientY, t: Date.now() }; } catch(e){}
  });
  document.addEventListener('dblclick', function(ev){ erDown = null; });

  function erPost(o){ try { parent.postMessage(JSON.stringify(o), '*'); } catch(e){} }

  document.addEventListener('mouseup', function(ev){
    var hasSel = false;
    try{
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0){
        var t = sel.toString();
        if (t && t.trim().length > 1) {
          hasSel = true;
          var rc = sel.getRangeAt(0).getBoundingClientRect();
          erPost({t:'sel', text:t.slice(0,4000), rect:{x:rc.left, y:rc.top, w:rc.width, h:rc.height}});
        }
      }
    }catch(e){}
    if (!hasSel) erPost({t:'selclear'});
    try {
      if (hasSel || !erDown || !ev || typeof ev.clientX !== 'number') return;
      if (Date.now() - erDown.t > 500) { erDown = null; return; }
      if (Math.abs(ev.clientX - erDown.x) > 10 || Math.abs(ev.clientY - erDown.y) > 10) { erDown = null; return; }
      var erW = window.innerWidth;
      var erDir = 0;
      if (ev.clientX > erW * 0.72) erDir = 1;
      else if (ev.clientX < erW * 0.12) erDir = -1;
      erDown = null;
      if (ev.target && ev.target.closest && ev.target.closest('a')) return;
      erPost(erDir ? {t:'turn', dir:erDir} : {t:'tap'});
    }catch(e2){}
  });

  /* the wheel turns pages instead of free-scrolling between them */
  var erWheelAt = 0;
  document.addEventListener('wheel', function(ev){
    try { ev.preventDefault(); } catch(e1){}
    if (Math.abs(ev.deltaY) < 8 || Date.now() - erWheelAt < 450) return;
    erWheelAt = Date.now();
    erPost({t:'turn', dir: ev.deltaY > 0 ? 1 : -1});
  }, { passive: false });

  /* hand every plain key to the app, so shortcuts work while the page has focus */
  document.addEventListener('keydown', function(ev){
    var k = ev && ev.key;
    var ctrl = ev.ctrlKey || ev.metaKey;
    var nav = { ArrowRight:1, ArrowLeft:1, ArrowUp:1, ArrowDown:1, ' ':1, PageUp:1, PageDown:1, Home:1, End:1 };
    if (nav[k] || (ctrl && (k === 'f' || k === 'F'))) { try { ev.preventDefault(); } catch(e1){} }
    else if (ctrl || ev.altKey) return;
    erPost({t:'key', key:k, ctrl:ctrl});
  });
}catch(e){ try { document.documentElement.setAttribute('data-ererr', String(e) + '|' + String(e.stack).slice(0,200)); } catch(e9){} }
})();
`;

    const json = JSON.stringify(data).replace(/</g, '\\u003c');    const headInject = `<style id="er-css">${css}</style><script type="application/json" id="er-data">${json}</script>`;
    const tailInject = `<script id="er-js">${js}<\/script>`;

    let html = this.htmlCache.get(spineIndex);
    const headClose = html.indexOf('</head>');
    if (headClose !== -1) html = html.slice(0, headClose) + headInject + html.slice(headClose);
    else html = headInject + html;
    const bodyClose = html.lastIndexOf('</body>');
    if (bodyClose !== -1) html = html.slice(0, bodyClose) + tailInject + html.slice(bodyClose);
    else html = html + tailInject;
    return html;
  }

  async renderSection(spineIndex, frac, query, nth) {
    const book = this.book;
    if (spineIndex < 0 || spineIndex >= book.spine.length) return;

    /* same section, no search jump: scroll the live frame, never rebuild it */
    if (this.frame && this.renderedSection === spineIndex && !query && this.doc()) {
      this.spineIndex = spineIndex;
      const d = this.doc();
      const tops = this.pageTops();
      if (frac !== null && frac !== undefined) {
        const idx = Math.max(0, Math.min(tops.length - 1, Math.round(frac * (tops.length - 1))));
        d.scrollingElement.scrollTop = tops[idx];
      }
      this.record.pos = { spineIndex, frac: frac === null ? 0 : frac };
      if (this.library) {
        this.library.touch(this.record.id);
        this.library.saveRecord(this.record);
      }
      this.updateMask();
      return;
    }
    this.spineIndex = spineIndex;

    if (!this.htmlCache.has(spineIndex)) {
      const sec = book.spine.get(spineIndex);
      let html = '';
      try { html = await sec.render(book.load.bind(book)); } catch (err) { html = ''; }
      this.htmlCache.set(spineIndex, html);
    }

    const frame = document.createElement('iframe');
    frame.className = 'er-frame';
    frame.title = 'Book page';
    frame.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups');
    const loaded = new Promise((res) => { frame.addEventListener('load', res); });
    frame.srcdoc = this.buildFrameHtml(spineIndex, frac, query, nth);
    if (this.flipDir && !this.animateOff()) {
      const sign = this.flipDir > 0 ? 1 : -1;
      frame.style.transformOrigin = this.flipDir > 0 ? '0% 50%' : '100% 50%';
      frame.style.transform = 'rotateY(' + (sign * 68) + 'deg)';
      frame.style.opacity = '0.18';
    }

    let stage = document.querySelector('.read-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'read-stage';
      let read = document.querySelector('.screen-read');
      if (!read) { read = document.createElement('div'); read.className = 'screen-read'; document.body.appendChild(read); }
      read.appendChild(stage);
    }
    /* keep the old page on screen until the new one has laid out: no blank flash */
    const old = this.frame;
    if (old) frame.style.visibility = 'hidden';
    stage.appendChild(frame);
    this.frame = frame;
    this.renderedSection = spineIndex;
    this.record.pos = { spineIndex, frac: frac === null ? 0 : frac };
    if (this.library) {
      this.library.touch(this.record.id);
      this.library.saveRecord(this.record);
    }
    await loaded;
    frame.style.visibility = '';
    if (old && old.parentNode) old.parentNode.removeChild(old);
    this.updateMask();
  }

  /* Pages are cut at block boundaries, so the bottom of the viewport can show the start of
     the block the next page opens with. Cover that strip so nothing appears twice. */
  updateMask() {
    const stage = this.frame && this.frame.parentNode;
    if (!stage) return;
    let m = stage.querySelector('.page-mask');
    if (!m) { m = document.createElement('div'); m.className = 'page-mask'; stage.appendChild(m); }
    const d = this.doc();
    let px = 0;
    if (d && d.scrollingElement) {
      const cur = d.scrollingElement.scrollTop;
      const vh = d.defaultView.innerHeight;
      const next = this.pageTops().find((t) => t > cur + 4);
      if (next !== undefined && vh > 0) px = Math.max(0, vh - (next - cur)) * (this.frame.clientHeight / vh);
    }
    m.style.height = Math.round(px) + 'px';
    m.style.opacity = this.flipping ? '0' : '1';
  }

  /* rebuild the current page (after a settings or highlight change), keeping the position */
  async rerender() {
    if (!this.book) return;
    const pos = this.record.pos || { spineIndex: this.spineIndex, frac: 0 };
    this.renderedSection = null;
    await this.renderSection(pos.spineIndex, pos.frac);
  }

  animateOff() {
    return this.reducedMotion() || (this.library && this.library.prefs.animate === false);
  }

  viewH() {
    if (!this.frame) return window.innerHeight;
    const h = this.frame.getBoundingClientRect().height;
    return h > 40 ? h : window.innerHeight;
  }

  doc() { return this.frame && this.frame.contentDocument; }

  metrics() {
    const d = this.doc();
    if (!d) return { page: 1, pages: 1, pct: 0, chapter: '' };
    const se = d.scrollingElement;
    const tops = this.pageTops();
    const pages = tops.length;
    let pi = 0;
    for (let i = 0; i < tops.length; i++) if (tops[i] <= se.scrollTop + 4) pi = i;
    const page = pi + 1;
    const frac = pages > 1 ? pi / (pages - 1) : 0;
    this.record.pos = { spineIndex: this.spineIndex, frac };
    let chars = 0;
    for (let i = 0; i < this.spineIndex; i++) chars += this.lens[i];
    chars += this.lens[this.spineIndex] * frac;
    /* the last page of the last section counts as finished */
    const atEnd = this.spineIndex === this.lens.length - 1 && page === pages;
    const pct = atEnd ? 100 : Math.min(100, Math.round((chars / this.totalLen) * 100));
    this.record.pct = pct;
    return { page, pages, pct, chars, chapter: this.chapterName(this.spineIndex) };
  }

  /* which page of the current section is showing (0-based) and how many there are */
  pageIndex() {
    const d = this.doc();
    if (!d) return { pi: 0, pages: 1 };
    const tops = this.pageTops();
    let pi = 0;
    for (let i = 0; i < tops.length; i++) if (tops[i] <= d.scrollingElement.scrollTop + 4) pi = i;
    return { pi, pages: tops.length };
  }

  scrollBy(dy) {
    const d = this.doc();
    const se = d.scrollingElement;
    const maxTop = Math.max(0, se.scrollHeight - this.viewH());
    const target = Math.max(0, Math.min(maxTop, se.scrollTop + dy));
    se.scrollTop = target;
    this.record.pos = { spineIndex: this.spineIndex, frac: maxTop ? target / maxTop : 0 };
    if (this.library) this.library.saveRecord(this.record);
    return target;
  }

  pageTops() {
    const d = this.doc();
    const t = d && d.__erTops;
    if (Array.isArray(t) && t.length) return t;
    const se = d && d.scrollingElement;
    const vh = this.viewH();
    if (!se || vh < 40) return [0];
    const sh = se.scrollHeight;
    const out = [];
    for (let top = 0; top <= sh - vh && out.length < 500; top += vh) out.push(top);
    if (!out.length) out.push(0);
    if (out[out.length - 1] < sh - vh) out.push(sh - vh);
    return out;
  }

  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (err) { return false; }
  }

  shade() {
    const stage = document.querySelector('.read-stage');
    if (!stage) return null;
    let s = stage.querySelector('.read-shade');
    if (!s) { s = document.createElement('div'); s.className = 'read-shade'; stage.appendChild(s); }
    return s;
  }

  /* the page lifts off the spine, then the next one swings in */
  async flipOut(dir) {
    this.flipDir = dir;
    const f = this.frame;
    const sh = this.shade();
    if (!f || this.animateOff()) {
      if (sh) sh.style.opacity = '0';
      return;
    }
    this.flipping = true;
    const mask = f.parentNode && f.parentNode.querySelector('.page-mask');
    if (mask) mask.style.opacity = '0';
    const sign = dir > 0 ? -1 : 1;
    f.style.transformOrigin = dir > 0 ? '0% 50%' : '100% 50%';
    f.style.transition = 'transform 250ms cubic-bezier(.36,.06,.55,.95), opacity 250ms ease-in';
    f.style.transform = 'rotateY(' + (sign * 68) + 'deg)';
    f.style.opacity = '0.18';
    if (sh) { sh.style.transition = 'opacity 250ms ease-in'; sh.style.opacity = '0.55'; sh.style.transform = dir > 0 ? '' : 'scaleX(-1)'; }
    await this.sleep(250);
  }

  async flipIn(dir) {
    this.flipDir = 0;
    const f = this.frame;
    const sh = this.shade();
    if (!f) return;
    if (this.animateOff()) {
      f.style.transform = ''; f.style.opacity = ''; f.style.transition = '';
      if (sh) sh.style.opacity = '0';
      return;
    }
    const sign = dir > 0 ? 1 : -1;
    f.style.transition = 'none';
    f.style.transformOrigin = dir > 0 ? '0% 50%' : '100% 50%';
    f.style.transform = 'rotateY(' + (sign * 68) + 'deg)';
    f.style.opacity = '0.18';
    if (sh) { sh.style.opacity = '0.55'; sh.style.transform = dir > 0 ? '' : 'scaleX(-1)'; }
    await this.sleep(30);
    f.style.transition = 'transform 330ms cubic-bezier(.18,.72,.28,1), opacity 330ms ease-out';
    f.style.transform = 'rotateY(0deg)';
    f.style.opacity = '1';
    if (sh) { sh.style.transition = 'opacity 330ms ease-out'; sh.style.opacity = '0'; }
    await this.sleep(330);
    f.style.transition = '';
    f.style.transform = '';
    f.style.opacity = '';
    this.flipping = false;
  }

  async nextPage() {
    const tops = this.pageTops();
    const se = this.doc().scrollingElement;
    const cur = se.scrollTop;
    const maxTop = Math.max(0, se.scrollHeight - this.viewH());
    await this.flipOut(1);
    let moved = false;
    for (let i = 0; i < tops.length; i++) {
      if (tops[i] > cur + 8) {
        se.scrollTop = tops[i];
        this.record.frac = maxTop ? tops[i] / maxTop : 0;
        moved = true;
        break;
      }
    }
    if (!moved) {
      if (this.spineIndex + 1 < this.book.spine.length) await this.renderSection(this.spineIndex + 1, 0);
      else if (window.app) window.app.toast('You have reached the end of the book');
    }
    await this.flipIn(1);
    this.flipping = false;
    this.updateMask();
    this.record.pos = { spineIndex: this.spineIndex, frac: this.record.frac };
    if (this.library) {
      this.library.touch(this.record.id);
      this.library.saveRecord(this.record);
    }
  }

  async prevPage() {
    const tops = this.pageTops();
    const se = this.doc().scrollingElement;
    const cur = se.scrollTop;
    const maxTop = Math.max(0, se.scrollHeight - this.viewH());
    await this.flipOut(-1);
    let moved = false;
    for (let i = tops.length - 1; i >= 0; i--) {
      if (tops[i] < cur - 8) {
        se.scrollTop = tops[i];
        this.record.frac = maxTop ? tops[i] / maxTop : 0;
        moved = true;
        break;
      }
    }
    if (!moved) {
      if (this.spineIndex > 0) await this.renderSection(this.spineIndex - 1, 1);
      else if (window.app) window.app.toast('You are at the beginning of the book');
    }
    await this.flipIn(-1);
    this.flipping = false;
    this.updateMask();
    this.record.pos = { spineIndex: this.spineIndex, frac: this.record.frac };
    if (this.library) {
      this.library.touch(this.record.id);
      this.library.saveRecord(this.record);
    }
  }

  async goBeginning() { await this.renderSection(0, 0); }
  async goEnd() { await this.renderSection(this.book.spine.length - 1, 1); }

  async seekPercent(pct) {
    let target = (pct / 100) * this.totalLen, acc = 0;
    for (let i = 0; i < this.lens.length; i++) {
      if (acc + this.lens[i] >= target) {
        const frac = this.lens[i] ? (target - acc) / this.lens[i] : 0;
        await this.renderSection(i, Math.min(1, frac));
        return;
      }
      acc += this.lens[i];
    }
    await this.renderSection(this.lens.length - 1, 1);
  }

  jumpToc(entry) {
    this.renderSection(entry.spineIndex, 0);
  }

  /* returns { results: [{ spineIndex, chapter, before, match, after, pct }], capped } */
  async search(query) {
    const out = [];
    const q = query.trim().toLowerCase();
    const LIMIT = 200;
    if (!q) return { results: out, capped: false };
    let charsBefore = 0;
    for (let i = 0; i < this.book.spine.length && out.length < LIMIT; i++) {
      let html = this.htmlCache.get(i);
      if (!html) {
        const sec = this.book.spine.get(i);
        try { html = await sec.render(this.book.load.bind(this.book)); } catch (e) { continue; }
        this.htmlCache.set(i, html);
      }
      const text = html.replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      const low = text.toLowerCase();
      let from = 0, nth = 0;
      while (out.length < LIMIT) {
        const at = low.indexOf(q, from);
        if (at === -1) break;
        const a = Math.max(0, at - 60), b = Math.min(text.length, at + q.length + 70);
        out.push({
          spineIndex: i,
          nth: nth++,
          chapter: this.chapterName(i),
          before: (a > 0 ? '…' : '') + text.slice(a, at).trimStart(),
          match: text.slice(at, at + q.length),
          after: text.slice(at + q.length, b).trimEnd() + (b < text.length ? '…' : ''),
          pct: Math.round(((charsBefore + (this.lens[i] || 0) * (at / Math.max(1, text.length))) / this.totalLen) * 100),
        });
        from = at + q.length;
      }
      charsBefore += this.lens[i] || 0;
    }
    return { results: out, capped: out.length >= LIMIT };
  }

  addHighlight(color, note) {
    if (!this.lastSelection) return null;
    if (!this.record.annotations) this.record.annotations = [];
    const a = {
      id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      type: note ? 'note' : 'highlight',
      color: color || 'yellow',
      spineIndex: this.spineIndex,
      chapter: this.chapterName(this.spineIndex),
      pct: this.record.pct || 0,
      quote: this.lastSelection.replace(/\s+/g, ' ').trim(),
      note: note || '',
      time: Date.now(),
    };
    this.record.annotations.push(a);
    this.lastSelection = '';
    if (this.library) this.library.saveRecord(this.record);
    this.rerender();
    return a;
  }

  updateAnnotation(a, patch) {
    Object.assign(a, patch);
    if (patch.note !== undefined) a.type = a.note ? 'note' : 'highlight';
    if (this.library) this.library.saveRecord(this.record);
    if (this.book && patch.color) this.rerender();
  }

  removeAnnotation(a) {
    this.record.annotations = (this.record.annotations || []).filter((x) => x !== a);
    if (this.library) this.library.saveRecord(this.record);
    if (this.book) this.rerender();
  }

  /* bookmark on the page currently showing, if any */
  bookmarkHere() {
    const { pi, pages } = this.pageIndex();
    return (this.record.bookmarks || []).find((b) =>
      b.spineIndex === this.spineIndex && Math.round((b.frac || 0) * Math.max(0, pages - 1)) === pi) || null;
  }

  addBookmark() {
    const m = this.metrics();
    const bm = {
      type: 'bookmark',
      spineIndex: this.spineIndex,
      frac: this.record.pos.frac,
      label: this.chapterName(this.spineIndex),
      pct: m.pct,
      time: Date.now(),
    };
    if (!this.record.bookmarks) this.record.bookmarks = [];
    this.record.bookmarks.push(bm);
    if (this.library) this.library.saveRecord(this.record);
    return bm;
  }

  removeBookmark(bm) {
    this.record.bookmarks = (this.record.bookmarks || []).filter((b) => b !== bm);
    if (this.library) this.library.saveRecord(this.record);
  }

  /* returns true when a bookmark now exists on this page */
  toggleBookmark() {
    const here = this.bookmarkHere();
    if (here) { this.removeBookmark(here); return false; }
    this.addBookmark();
    return true;
  }
}
