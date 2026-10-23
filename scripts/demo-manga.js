// Draws the pages of a short demo manga, "Tidewatch", for the README screenshots.
// Runs in the app's page: drawMangaPage(n) resolves to { data: Uint8Array (JPEG), wide }.
// Everything is drawn with canvas shapes, so the screenshots need no outside artwork.

const MANGA_PAGES = 9;

function drawMangaPage(n) {
  const wide = n === 6;
  const W = wide ? 2000 : 1000, H = 1500;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = n * 7919 + 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  /* ---------- drawing kit ---------- */
  const ink = '#111';
  const paper = '#fdfdfb';
  const rect = (x, y, w, h, fill) => { g.fillStyle = fill; g.fillRect(x, y, w, h); };
  const line = (x1, y1, x2, y2, wdt = 2, col = ink) => { g.strokeStyle = col; g.lineWidth = wdt; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  const circle = (x, y, r, fill, stroke, wdt = 3) => {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = wdt; g.stroke(); }
  };
  const poly = (pts, fill, stroke, wdt = 3) => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = wdt; g.stroke(); }
  };
  /* a panel: clip to its box, draw, then ink the border */
  const panel = (x, y, w, h, draw) => {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    rect(x, y, w, h, paper);
    draw(x, y, w, h);
    g.restore();
    g.strokeStyle = ink; g.lineWidth = 7; g.strokeRect(x, y, w, h);
  };
  /* screentone: a grid of dots, bigger where `size(x, y)` says so */
  const tone = (x, y, w, h, step, size, col = ink) => {
    g.fillStyle = col;
    for (let yy = y; yy < y + h + step; yy += step) {
      for (let xx = x + ((yy / step) % 2 ? step / 2 : 0); xx < x + w + step; xx += step) {
        const r = size(xx, yy);
        if (r > 0.2) { g.beginPath(); g.arc(xx, yy, r, 0, Math.PI * 2); g.fill(); }
      }
    }
  };
  const speedLines = (cx, cy, r0, r1, count, wdt = 3) => {
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2, rr = r0 + rnd() * (r1 - r0) * 0.25;
      g.strokeStyle = ink; g.lineWidth = wdt * (0.4 + rnd());
      g.beginPath(); g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
  };
  const rain = (x, y, w, h, count, col = ink) => {
    for (let i = 0; i < count; i++) {
      const xx = x + rnd() * w, yy = y + rnd() * h, len = 30 + rnd() * 60;
      line(xx, yy, xx - len * 0.35, yy + len, 1.5 + rnd() * 1.5, col);
    }
  };
  const stars = (x, y, w, h, count) => {
    for (let i = 0; i < count; i++) circle(x + rnd() * w, y + rnd() * h, 0.8 + rnd() * 2.2, '#fff');
  };
  const sea = (x, y, w, h, rough, col = ink) => {
    for (let row = 0; row < 14; row++) {
      const yy = y + (row / 14) * h, amp = (6 + row * 2.2) * rough, len = 60 + row * 18;
      g.strokeStyle = col; g.lineWidth = 1.5 + row * 0.35;
      g.beginPath();
      for (let xx = x - len; xx < x + w + len; xx += len) {
        const off = (row % 2) * len / 2;
        g.moveTo(xx + off, yy);
        g.quadraticCurveTo(xx + off + len / 4, yy - amp, xx + off + len / 2, yy);
      }
      g.stroke();
    }
  };
  const wave = (x, y, w, h) => {
    // a breaking wave: a dark body curling over, foam along the crest and spray above it
    const crest = (t) => [x + w * (0.05 + t * 0.78), y + h * (0.62 - Math.sin(t * Math.PI * 0.92) * 0.55)];
    g.fillStyle = ink;
    g.beginPath(); g.moveTo(x, y + h);
    for (let i = 0; i <= 40; i++) { const [px, py] = crest(i / 40); g.lineTo(px, py); }
    g.quadraticCurveTo(x + w * 0.9, y + h * 0.18, x + w * 0.84, y + h * 0.42);
    g.quadraticCurveTo(x + w * 0.7, y + h * 0.3, x + w * 0.72, y + h * 0.55);
    g.quadraticCurveTo(x + w * 0.78, y + h * 0.8, x + w, y + h * 0.8);
    g.lineTo(x + w, y + h); g.closePath(); g.fill();
    // flow lines inside the wave follow its shape
    for (let k = 1; k <= 5; k++) {
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2.5;
      g.beginPath();
      for (let i = 0; i <= 30; i++) { const [px, py] = crest(0.1 + (i / 30) * 0.75); const yy = py + k * h * 0.07 + 6; i ? g.lineTo(px - k * 6, yy) : g.moveTo(px - k * 6, yy); }
      g.stroke();
    }
    // foam: a white ridge with claw-like fingers curling forward
    g.lineCap = 'round';
    g.strokeStyle = ink; g.lineWidth = 30;
    g.beginPath(); for (let i = 0; i <= 40; i++) { const [px, py] = crest(0.15 + i / 40 * 0.85); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 20; g.stroke();
    for (let i = 0; i < 9; i++) {
      const [px, py] = crest(0.45 + i * 0.065);
      g.strokeStyle = ink; g.lineWidth = 15;
      g.beginPath(); g.arc(px + 12, py - 4, 14 + i * 1.5, Math.PI * 1.1, Math.PI * 1.95); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke();
    }
    g.lineCap = 'butt';
    for (let i = 0; i < 40; i++) { const [px, py] = crest(0.35 + rnd() * 0.65); circle(px + (rnd() - 0.3) * 70, py - 20 - rnd() * 70, 2 + rnd() * 6, '#fff', ink, 1.5); }
  };
  const lighthouse = (x, base, s, lit) => {
    const tw = 70 * s, th = 330 * s;
    poly([[x - tw, base], [x + tw, base], [x + tw * 0.62, base - th], [x - tw * 0.62, base - th]], paper, ink, 4);
    for (let k = 1; k < 4; k++) {
      const y0 = base - (th / 4) * k, y1 = y0 + th / 8, w0 = tw - (tw * 0.38) * (k / 4), w1 = tw - (tw * 0.38) * ((k - 0.5) / 4);
      poly([[x - w1, y1], [x + w1, y1], [x + w0, y0], [x - w0, y0]], ink);
    }
    rect(x - tw * 0.75, base - th - 12 * s, tw * 1.5, 14 * s, ink);
    rect(x - tw * 0.45, base - th - 80 * s, tw * 0.9, 68 * s, lit ? '#fff' : '#555');
    g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(x - tw * 0.45, base - th - 80 * s, tw * 0.9, 68 * s);
    for (let k = 1; k < 3; k++) line(x - tw * 0.45 + (tw * 0.9 / 3) * k, base - th - 80 * s, x - tw * 0.45 + (tw * 0.9 / 3) * k, base - th - 12 * s, 2);
    poly([[x - tw * 0.6, base - th - 80 * s], [x + tw * 0.6, base - th - 80 * s], [x, base - th - 140 * s]], ink);
    return { lampX: x, lampY: base - th - 46 * s };
  };
  const beams = (x, y, len, spread, angle) => {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const side of [-1, 1]) {
      const a = angle + (side < 0 ? Math.PI : 0);
      const grd = g.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
      grd.addColorStop(0, 'rgba(255,255,255,.95)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + Math.cos(a - spread) * len, y + Math.sin(a - spread) * len);
      g.lineTo(x + Math.cos(a + spread) * len, y + Math.sin(a + spread) * len);
      g.closePath(); g.fill();
    }
    g.restore();
  };
  const cliff = (x, y, w, h, fill = ink) => {
    g.fillStyle = fill; g.beginPath(); g.moveTo(x, y + h);
    const steps = 9;
    for (let i = 0; i <= steps; i++) g.lineTo(x + (w / steps) * i, y + (i === 0 || i === steps ? h * 0.25 : rnd() * h * 0.2));
    g.lineTo(x + w, y + h); g.closePath(); g.fill();
  };
  const figure = (x, base, s, fill = ink) => {
    // a girl in a long coat seen from behind, hair and scarf blowing in the wind
    g.fillStyle = fill;
    rect(x - 16 * s, base - 58 * s, 11 * s, 58 * s, fill);
    rect(x + 5 * s, base - 58 * s, 11 * s, 58 * s, fill);
    g.beginPath();
    g.moveTo(x - 24 * s, base - 128 * s);
    g.quadraticCurveTo(x - 30 * s, base - 140 * s, x - 14 * s, base - 142 * s);
    g.lineTo(x + 14 * s, base - 142 * s);
    g.quadraticCurveTo(x + 30 * s, base - 140 * s, x + 24 * s, base - 128 * s);
    g.lineTo(x + 34 * s, base - 50 * s);
    g.quadraticCurveTo(x + 42 * s, base - 46 * s, x + 46 * s, base - 40 * s);
    g.lineTo(x - 38 * s, base - 44 * s);
    g.lineTo(x - 30 * s, base - 52 * s);
    g.closePath(); g.fill();
    circle(x, base - 160 * s, 17 * s, fill);
    g.beginPath();   // hair, swept to the right
    g.moveTo(x - 18 * s, base - 168 * s);
    g.quadraticCurveTo(x - 4 * s, base - 186 * s, x + 18 * s, base - 170 * s);
    g.quadraticCurveTo(x + 46 * s, base - 160 * s, x + 64 * s, base - 168 * s);
    g.quadraticCurveTo(x + 44 * s, base - 150 * s, x + 56 * s, base - 140 * s);
    g.quadraticCurveTo(x + 30 * s, base - 140 * s, x + 16 * s, base - 140 * s);
    g.lineTo(x - 18 * s, base - 146 * s);
    g.closePath(); g.fill();
    g.beginPath();   // scarf
    g.moveTo(x + 6 * s, base - 142 * s);
    g.quadraticCurveTo(x + 50 * s, base - 150 * s, x + 96 * s, base - 132 * s);
    g.lineTo(x + 84 * s, base - 126 * s);
    g.lineTo(x + 100 * s, base - 118 * s);
    g.quadraticCurveTo(x + 50 * s, base - 128 * s, x + 6 * s, base - 130 * s);
    g.closePath(); g.fill();
  };
  const eye = (x, y, s) => {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = paper; g.strokeStyle = ink; g.lineWidth = 8;
    g.beginPath(); g.moveTo(-200, 10); g.quadraticCurveTo(0, -150, 210, -10); g.quadraticCurveTo(0, 110, -200, 10); g.closePath(); g.fill(); g.stroke();
    g.save(); g.clip();
    circle(10, -10, 95, '#2a2a2a');
    tone(-90, -110, 200, 200, 7, (xx, yy) => 2.6 - Math.hypot(xx - 10, yy + 10) / 60);
    circle(10, -10, 45, ink);
    circle(-25, -45, 26, '#fff'); circle(45, 25, 11, '#fff');
    for (let i = 0; i < 40; i++) { const a = rnd() * Math.PI * 2; line(10 + Math.cos(a) * 50, -10 + Math.sin(a) * 50, 10 + Math.cos(a) * 92, -10 + Math.sin(a) * 92, 1.4, 'rgba(255,255,255,.45)'); }
    g.restore();
    g.lineWidth = 16; g.beginPath(); g.moveTo(-210, 5); g.quadraticCurveTo(0, -160, 220, -15); g.stroke();
    for (let i = 0; i < 6; i++) line(120 + i * 18, -95 + i * 13, 160 + i * 26, -135 + i * 10, 6);
    g.lineWidth = 14; g.beginPath(); g.moveTo(-170, -150); g.quadraticCurveTo(10, -215, 190, -165); g.stroke();
    g.restore();
  };
  /* lines of lettering that fit a width */
  const wrap = (text, size, maxW, italic) => {
    g.font = `${italic ? 'italic ' : ''}700 ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
    const out = [];
    let cur = '';
    for (const wd of text.toUpperCase().split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = wd; } else cur = t; }
    out.push(cur);
    return out;
  };
  const letter = (text, cx, cy, size, maxW, italic) => {
    const ls = wrap(text, size, maxW, italic);
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    ls.forEach((l, i) => g.fillText(l, cx, cy + (i - (ls.length - 1) / 2) * size * 1.18));
  };
  /* a speech balloon that grows to fit its words, with a tail pointing at the speaker */
  const bubble = (x, y, w, h, text, tx, ty, size = 32) => {
    const need = wrap(text, size, w * 0.66).length * size * 1.18 / 0.62 + 20;
    if (need > h) { y -= (need - h) / 2; h = need; }
    const cx = x + w / 2, cy = y + h / 2;
    if (tx !== undefined) poly([[cx - w * 0.08, cy], [cx + w * 0.08, cy], [tx, ty]], '#fff', ink, 4);
    g.beginPath(); g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    g.fillStyle = '#fff'; g.fill(); g.strokeStyle = ink; g.lineWidth = 4; g.stroke();
    if (tx !== undefined) poly([[cx - w * 0.06, cy + h * 0.3], [cx + w * 0.06, cy + h * 0.3], [tx, ty]], '#fff');
    letter(text, cx, cy, size, w * 0.66);
  };
  const box = (x, y, w, h, text, size = 30) => {
    rect(x, y, w, h, '#fff'); g.strokeStyle = ink; g.lineWidth = 4; g.strokeRect(x, y, w, h);
    letter(text, x + w / 2, y + h / 2, size, w - 40, true);
  };
  const sfx = (text, x, y, size, rot, white) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.font = `900 ${size}px "Yu Gothic UI", "Yu Gothic", "Meiryo", "Hiragino Sans", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = size * 0.16; g.strokeStyle = white ? ink : '#fff'; g.strokeText(text, 0, 0);
    g.fillStyle = white ? '#fff' : ink; g.fillText(text, 0, 0);
    g.restore();
  };
  const night = (x, y, w, h) => { rect(x, y, w, h, '#161616'); stars(x, y, w, h * 0.7, 60); };

  /* ---------- pages ---------- */
  rect(0, 0, W, H, paper);
  const M = 60, GAP = 24;

  if (n === 1) {
    // the cover, in colour
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d1b3d'); sky.addColorStop(0.55, '#3b4f8f'); sky.addColorStop(0.75, '#e48a5a'); sky.addColorStop(1, '#2a1a2e');
    rect(0, 0, W, H, sky);
    stars(0, 0, W, 600, 120);
    circle(760, 260, 110, '#fff6dc');
    circle(760, 260, 160, 'rgba(255,240,200,.12)');
    const lamp = lighthouse(330, 1180, 1.6, true);
    beams(lamp.lampX, lamp.lampY, 900, 0.09, -0.18);
    g.fillStyle = '#1b1029'; cliff(0, 1150, W, 400, '#1b1029');
    figure(640, 1185, 1.15, '#1b1029');
    for (let i = 0; i < 7; i++) {
      const bx = 520 + rnd() * 400, by = 420 + rnd() * 260, bs = 14 + rnd() * 14;
      g.strokeStyle = '#1b1029'; g.lineWidth = 4; g.beginPath(); g.moveTo(bx - bs, by); g.quadraticCurveTo(bx - bs / 2, by - bs / 2, bx, by); g.quadraticCurveTo(bx + bs / 2, by - bs / 2, bx + bs, by); g.stroke();
    }
    g.textAlign = 'center'; g.fillStyle = '#fff';
    g.font = '900 150px "Trebuchet MS", "Segoe UI", sans-serif';
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 24;
    g.fillText('TIDEWATCH', W / 2, 1360);
    g.shadowBlur = 0;
    g.font = '700 46px "Yu Gothic UI", "Meiryo", sans-serif';
    g.fillText('潮見の灯台', W / 2, 1430);
    rect(60, 60, 150, 70, '#e2483d');
    g.fillStyle = '#fff'; g.font = '800 40px "Trebuchet MS", sans-serif'; g.fillText('VOL. 1', 135, 108);
  } else if (n === 2) {
    panel(M, M, W - 2 * M, 820, (x, y, w, h) => {
      night(x, y, w, h);
      circle(x + w * 0.78, y + 170, 90, '#fff');
      tone(x, y, w, h, 12, (xx, yy) => 3.4 - Math.hypot(xx - (x + w * 0.78), yy - (y + 170)) / 120, '#3a3a3a');
      const lamp = lighthouse(x + w * 0.3, y + h - 90, 1.25, false);
      cliff(x, y + h - 130, w, 140);
      sea(x, y + h - 60, w, 60, 0.6);
      void lamp;
    });
    box(M + 30, M + 30, 420, 130, 'The light at Kurosaki point had been dark for thirty years.');
    panel(M, M + 820 + GAP, (W - 2 * M - GAP) * 0.55, 1500 - 2 * M - 820 - GAP, (x, y, w, h) => {
      sea(x, y + 80, w, h, 1.2);
      tone(x, y, w, 120, 10, () => 2.2);
    });
    panel(M + (W - 2 * M - GAP) * 0.55 + GAP, M + 820 + GAP, (W - 2 * M - GAP) * 0.45, 1500 - 2 * M - 820 - GAP, (x, y, w, h) => {
      tone(x, y, w, h, 9, (xx, yy) => 1.4 + (yy - y) / h * 2.4);
      figure(x + w * 0.45, y + h - 20, 2.2);
    });
    bubble(M + 40, 1110, 380, 170, 'Grandpa always said it would wake up.', M + 300, 1330);
  } else if (n === 3) {
    panel(M, M, W - 2 * M, 430, (x, y, w, h) => {
      rect(x, y, w, h, '#fff');
      speedLines(x + w / 2, y + h / 2, 160, 900, 140, 4);
      eye(x + w / 2, y + h / 2 + 10, 0.95);
    });
    sfx('ハッ', W - M - 110, M + 90, 110, 0.15);
    panel(M, M + 430 + GAP, (W - 2 * M - GAP) / 2, 560, (x, y, w, h) => {
      night(x, y, w, h);
      const l = lighthouse(x + w / 2, y + h - 40, 1.05, true);
      beams(l.lampX, l.lampY, 700, 0.05, -0.05);
      speedLines(l.lampX, l.lampY, 30, 160, 50, 2);
    });
    panel(M + (W - 2 * M - GAP) / 2 + GAP, M + 430 + GAP, (W - 2 * M - GAP) / 2, 560, (x, y, w, h) => {
      tone(x, y, w, h, 8, () => 1.6);
      rain(x, y, w, h, 140);
      figure(x + w * 0.5, y + h - 30, 1.7);
    });
    bubble(M + (W - 2 * M) / 2 + 60, M + 470, 340, 150, 'The lamp… it’s lit?!', M + (W - 2 * M) * 0.72, M + 640);
    panel(M, M + 990 + 2 * GAP, W - 2 * M, 1500 - 2 * M - 990 - 2 * GAP, (x, y, w, h) => {
      tone(x, y, w, h, 10, (xx) => 0.8 + (xx - x) / w * 2.6);
      wave(x + 60, y + 30, w - 120, h - 40);
    });
    sfx('ザザーッ', W - M - 220, 1380, 96, -0.08, true);
  } else if (n === 4) {
    panel(M, M, W - 2 * M, 700, (x, y, w, h) => {
      rect(x, y, w, h, '#1c1c1c');
      // lightning
      g.strokeStyle = '#fff'; g.lineWidth = 14; g.beginPath();
      let lx = x + w * 0.62, ly = y;
      g.moveTo(lx, ly);
      while (ly < y + h * 0.75) { lx += (rnd() - 0.5) * 120; ly += 60 + rnd() * 50; g.lineTo(lx, ly); }
      g.stroke();
      g.lineWidth = 4; g.stroke();
      rain(x, y, w, h, 260, '#bbb');
      cliff(x, y + h - 150, w, 160);
      lighthouse(x + w * 0.2, y + h - 110, 0.9, true);
    });
    sfx('ゴゴゴゴ', W / 2, M + 120, 120, -0.05, true);
    panel(M, M + 700 + GAP, (W - 2 * M - GAP) * 0.4, 1500 - 2 * M - 700 - GAP, (x, y, w, h) => {
      tone(x, y, w, h, 7, () => 2.4);
      speedLines(x + w / 2, y + h / 2, 60, 600, 90, 3);
      circle(x + w / 2, y + h / 2, 90, '#fff', ink, 6);
      letter('!', x + w / 2, y + h / 2, 150, 200);
    });
    panel(M + (W - 2 * M - GAP) * 0.4 + GAP, M + 700 + GAP, (W - 2 * M - GAP) * 0.6, 1500 - 2 * M - 700 - GAP, (x, y, w, h) => {
      sea(x, y + 120, w, h, 1.8);
      wave(x + w * 0.1, y + 40, w * 0.85, h * 0.55);
      rain(x, y, w, h, 120);
    });
    bubble(M + 360, M + 760, 420, 170, 'Someone is out there in this storm!', M + 520, M + 960);
  } else if (n === 5) {
    panel(M, M, W - 2 * M, 1500 - 2 * M, (x, y, w, h) => {
      rect(x, y, w, h, '#fff');
      speedLines(x + w * 0.5, y + h * 0.42, 220, 1400, 260, 5);
      circle(x + w * 0.5, y + h * 0.42, 210, '#fff', ink, 10);
      circle(x + w * 0.5, y + h * 0.42, 150, '#fff', ink, 4);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; line(x + w * 0.5 + Math.cos(a) * 150, y + h * 0.42 + Math.sin(a) * 150, x + w * 0.5 + Math.cos(a) * 210, y + h * 0.42 + Math.sin(a) * 210, 4); }
      tone(x, y + h * 0.72, w, h * 0.28, 9, (xx, yy) => (yy - y - h * 0.72) / 60);
      figure(x + w * 0.5, y + h - 40, 2.6);
    });
    sfx('カッ', W / 2, 1040, 180, 0, false);
    box(W - M - 380, M + 40, 340, 110, 'And the old lamp answered.', 30);
  } else if (n === 6) {
    // the double-page spread
    panel(M, M, W - 2 * M, H - 2 * M, (x, y, w, h) => {
      night(x, y, w, h);
      circle(x + w * 0.12, y + 160, 80, '#fff');
      tone(x, y + h * 0.66, w, h * 0.34, 12, () => 1.3, '#555');
      sea(x, y + h * 0.66, w, h * 0.34, 1.4, '#cfcfcf');
      const l = lighthouse(x + w * 0.24, y + h * 0.7, 1.9, true);
      beams(l.lampX, l.lampY, 1900, 0.06, 0.5);
      cliff(x, y + h * 0.68, w * 0.42, 220);
      // the boat, caught in the beam
      const bx = x + w * 0.66, by = y + h * 0.69;
      poly([[bx - 150, by], [bx + 150, by], [bx + 110, by + 60], [bx - 110, by + 60]], '#fff', ink, 5);
      line(bx, by, bx, by - 230, 8, '#fff');
      poly([[bx + 6, by - 220], [bx + 140, by - 40], [bx + 6, by - 40]], '#fff', ink, 5);
      wave(x + w * 0.74, y + h * 0.62, w * 0.28, h * 0.4);
    });
    box(W - M - 640, M + 40, 580, 120, 'For the first time in thirty years, the light reached the sea.', 30);
    sfx('ドォン', W * 0.5, H - 260, 150, -0.06, true);
  } else if (n === 7) {
    panel(M, M, (W - 2 * M - GAP) / 2, 620, (x, y, w, h) => {
      sea(x, y + 200, w, h, 1);
      const bx = x + w / 2, by = y + 330;
      poly([[bx - 120, by], [bx + 120, by], [bx + 90, by + 50], [bx - 90, by + 50]], ink);
      line(bx, by, bx, by - 190, 7);
      tone(x, y, w, 200, 10, () => 1.8);
    });
    panel(M + (W - 2 * M - GAP) / 2 + GAP, M, (W - 2 * M - GAP) / 2, 620, (x, y, w, h) => {
      tone(x, y, w, h, 8, () => 1.2);
      eye(x + w / 2, y + h / 2, 0.55);
    });
    bubble(M + 30, M + 440, 380, 150, 'They turned towards the light!', M + 220, M + 380);
    panel(M, M + 620 + GAP, W - 2 * M, 1500 - 2 * M - 620 - GAP, (x, y, w, h) => {
      night(x, y, w, h);
      cliff(x, y + h - 220, w, 240);
      figure(x + w * 0.35, y + h - 200, 2.4);
      const l = lighthouse(x + w * 0.75, y + h - 190, 1.4, true);
      beams(l.lampX, l.lampY, 800, 0.06, -0.12);
    });
    bubble(M + 80, M + 700, 420, 160, 'Grandpa… you were right.', M + 340, M + 980);
  } else if (n === 8) {
    panel(M, M, W - 2 * M, 560, (x, y, w, h) => {
      const sky = g.createLinearGradient(0, y, 0, y + h);
      sky.addColorStop(0, '#fff'); sky.addColorStop(1, '#ccc');
      rect(x, y, w, h, sky);
      tone(x, y, w, h, 11, (xx, yy) => 2.6 - (yy - y) / h * 2.6);
      circle(x + w * 0.5, y + h - 20, 120, '#fff', ink, 5);
      for (let i = 0; i < 14; i++) { const a = Math.PI + (i / 13) * Math.PI; line(x + w * 0.5 + Math.cos(a) * 140, y + h - 20 + Math.sin(a) * 140, x + w * 0.5 + Math.cos(a) * 260, y + h - 20 + Math.sin(a) * 260, 4); }
      sea(x, y + h - 40, w, 40, 0.3);
    });
    box(M + 30, M + 30, 360, 110, 'Morning.', 34);
    panel(M, M + 560 + GAP, W - 2 * M, 1500 - 2 * M - 560 - GAP, (x, y, w, h) => {
      tone(x, y, w, h, 12, () => 1);
      sea(x, y + h * 0.5, w, h * 0.5, 0.5);
      cliff(x, y + h * 0.55, w * 0.55, 200);
      lighthouse(x + w * 0.22, y + h * 0.6, 1.3, false);
      figure(x + w * 0.4, y + h * 0.58, 1.5);
      figure(x + w * 0.47, y + h * 0.58, 1.6);
    });
    bubble(W - M - 420, M + 640, 380, 160, 'So… who lit it?', W - M - 300, M + 900);
  } else {
    rect(0, 0, W, H, '#111');
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = '700 54px "Trebuchet MS", sans-serif';
    g.fillText('TO BE CONTINUED', W / 2, H / 2 - 20);
    g.font = '500 30px "Yu Gothic UI", "Meiryo", sans-serif';
    g.fillText('つづく', W / 2, H / 2 + 50);
  }

  return new Promise((res) => c.toBlob((b) => b.arrayBuffer().then((a) => res({ data: new Uint8Array(a), wide })), 'image/jpeg', 0.9));
}

/* the whole volume as a CBZ, with ComicInfo.xml marking it as right-to-left manga */
async function demoMangaCbz() {
  const zip = new JSZip();
  zip.file('ComicInfo.xml', '<?xml version="1.0"?><ComicInfo><Series>Tidewatch</Series><Volume>1</Volume><Writer>Folio Demo</Writer><LanguageISO>en</LanguageISO><Manga>YesAndRightToLeft</Manga></ComicInfo>');
  for (let n = 1; n <= MANGA_PAGES; n++) zip.file(`Tidewatch v01/${String(n).padStart(3, '0')}.jpg`, (await drawMangaPage(n)).data);
  return new File([await zip.generateAsync({ type: 'uint8array' })], 'Tidewatch v01.cbz');
}
