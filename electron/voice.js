// Folio's natural voice, run in its own utility process so speaking never holds up the window.
// Kokoro-82M (Apache-2.0, github.com/hexgrad/kokoro) on ONNX Runtime: text is tidied, turned
// into phonemes by eSpeak NG (the phonemizer package), mapped to the model's symbols, and the
// model returns audio at 24 kHz. The text clean-up and phoneme fixes follow kokoro-js (Apache-2.0).
const ort = require('onnxruntime-node');
const { phonemize } = require('phonemizer');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const VOCAB = require('./kokoro-vocab.json');

const RATE = 24000;
const MAX_SYMBOLS = 500;          // the model takes 510 at most

let session = null;
let dir = null;
const styles = new Map();         // voice id → its style vectors (one per input length)

/* ---------- text → phonemes ---------- */

// years and times as people say them: 1817 → "18 17", 3:05 → "3 oh 5"
function splitNum(t) {
  if (t.includes('.')) return t;
  if (t.includes(':')) {
    const [h, m] = t.split(':').map(Number);
    return m === 0 ? `${h} o'clock` : m < 10 ? `${h} oh ${m}` : `${h} ${m}`;
  }
  const year = parseInt(t.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return t;
  const left = t.slice(0, 2), right = parseInt(t.slice(2, 4), 10), s = t.endsWith('s') ? 's' : '';
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${s}`;
    if (right < 10) return `${left} oh ${right}${s}`;
  }
  return `${left} ${right}${s}`;
}

function money(t) {
  const unit = t[0] === '$' ? 'dollar' : 'pound';
  if (isNaN(Number(t.slice(1)))) return `${t.slice(1)} ${unit}s`;
  if (!t.includes('.')) return `${t.slice(1)} ${unit}${t.slice(1) === '1' ? '' : 's'}`;
  const [whole, part] = t.slice(1).split('.');
  const coins = parseInt(part.padEnd(2, '0'), 10);
  const coin = t[0] === '$' ? (coins === 1 ? 'cent' : 'cents') : (coins === 1 ? 'penny' : 'pence');
  return `${whole} ${unit}${whole === '1' ? '' : 's'} and ${coins} ${coin}`;
}

const pointNum = (t) => { const [a, b] = t.split('.'); return `${a} point ${b.split('').join(' ')}`; };

function normalize(t) {
  return t
    .replace(/[‘’]/g, "'").replace(/«/g, '“').replace(/»/g, '”').replace(/[“”]/g, '"')
    .replace(/\(/g, '«').replace(/\)/g, '»')
    .replace(/[^\S \n]/g, ' ').replace(/ {2,}/g, ' ').replace(/(?<=\n) +(?=\n)/g, '')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor')
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister')
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss')
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
    .replace(/\betc\.(?! [A-Z])/gi, 'etc')
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, money)
    .replace(/\d*\.\d+/g, pointNum)
    .replace(/(?<=\d)-(?=\d)/g, ' to ')
    .replace(/(?<=\d)S/g, ' S')
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, 's')
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, '-'))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-')
    .trim();
}

const PUNCT = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCT_RUN = new RegExp(`(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+\\s*)+`, 'g');

/* punctuation is kept as it is (the model uses it for pauses); words become phonemes */
async function phonemes(text, british) {
  const t = normalize(text);
  const pieces = [];
  let at = 0;
  for (const m of t.matchAll(PUNCT_RUN)) {
    if (at < m.index) pieces.push({ word: true, text: t.slice(at, m.index) });
    if (m[0]) pieces.push({ word: false, text: m[0] });
    at = m.index + m[0].length;
  }
  if (at < t.length) pieces.push({ word: true, text: t.slice(at) });
  const out = (await Promise.all(pieces.map(async (p) => (p.word ? (await phonemize(p.text, british ? 'en' : 'en-us')).join(' ') : p.text)))).join('');
  let ps = out
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ').replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
  if (!british) ps = ps.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  return ps.trim();
}

/* long passages are cut at sentence ends, then at commas, so each fits the model */
function chunks(text) {
  const out = [];
  for (const sentence of text.match(/[^.!?…;]+[.!?…;]+["'”’)\]]*\s*|[^.!?…;]+$/g) || [text]) {
    if (sentence.length <= 220) { out.push(sentence); continue; }
    let cur = '';
    for (const part of sentence.split(/(?<=[,:—])\s+/)) {
      if (cur && cur.length + part.length > 220) { out.push(cur); cur = ''; }
      cur += (cur ? ' ' : '') + part;
    }
    if (cur) out.push(cur);
  }
  // join short sentences back up, so the voice keeps its flow
  const joined = [];
  for (const c of out.map((s) => s.trim()).filter(Boolean)) {
    if (joined.length && joined[joined.length - 1].length + c.length < 220) joined[joined.length - 1] += ' ' + c;
    else joined.push(c);
  }
  return joined;
}

/* ---------- phonemes → audio ---------- */

async function style(voice) {
  if (!styles.has(voice)) {
    if (!/^[a-z]{2}_[a-z]+$/.test(voice)) throw new Error('unknown voice');
    const buf = await readFile(join(dir, 'voices', voice + '.bin'));
    styles.set(voice, new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
  }
  return styles.get(voice);
}

async function speak(text, voice, speed) {
  const british = voice[0] === 'b';
  const vectors = await style(voice);
  const parts = [];
  for (const piece of chunks(text)) {
    const ps = (await phonemes(piece, british)).slice(0, MAX_SYMBOLS);
    const ids = [0];
    for (const ch of ps) if (VOCAB[ch] !== undefined) ids.push(VOCAB[ch]);
    ids.push(0);
    if (ids.length <= 2) continue;
    const at = 256 * Math.min(Math.max(ids.length - 2, 0), 509);
    const { waveform } = await session.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      style: new ort.Tensor('float32', vectors.slice(at, at + 256), [1, 256]),
      speed: new ort.Tensor('float32', new Float32Array([speed]), [1]),
    });
    parts.push(waveform.data);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const samples = new Float32Array(total);
  let o = 0;
  for (const p of parts) { samples.set(p, o); o += p.length; }
  return samples;
}

/* ---------- messages from the main process ---------- */

process.parentPort.on('message', async ({ data: msg }) => {
  const reply = (o) => process.parentPort.postMessage({ id: msg.id, ...o });
  try {
    if (msg.type === 'load') {
      if (!session || dir !== msg.dir) {
        dir = msg.dir;
        styles.clear();
        session = await ort.InferenceSession.create(join(dir, 'model.onnx'), { graphOptimizationLevel: 'all' });
      }
      reply({ ok: true });
    } else if (msg.type === 'speak') {
      const samples = await speak(String(msg.text || ''), msg.voice, Math.max(0.5, Math.min(2, Number(msg.speed) || 1)));
      reply({ ok: true, samples, rate: RATE });
    }
  } catch (e) {
    reply({ ok: false, error: String(e && e.message || e) });
  }
});
