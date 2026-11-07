// Lecture d'une grille texte (Ultimate Guitar ou autre) : sections, accords, répétitions.
import { isChordToken, parseChordSymbol } from './theory.js';

const SECTION_FR = [
  [/^pre[- ]?chorus/i, 'Pré-refrain'],
  [/^post[- ]?chorus/i, 'Post-refrain'],
  [/^(chorus|refrain|hook)/i, 'Refrain'],
  [/^(verse|couplet)/i, 'Couplet'],
  [/^(bridge|pont)/i, 'Pont'],
  [/^intro/i, 'Intro'],
  [/^outro/i, 'Outro'],
  [/^(solo)/i, 'Solo'],
  [/^interlude/i, 'Interlude'],
  [/^(instrumental|inst)/i, 'Instrumental'],
  [/^(break|breakdown)/i, 'Break'],
  [/^(coda|ending|fin)/i, 'Fin'],
];
export function sectionName(raw) {
  const s = raw.trim();
  for (const [re, fr] of SECTION_FR) {
    if (re.test(s)) {
      const num = (s.match(/\d+/) || [''])[0];
      return fr + (num ? ' ' + num : '');
    }
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Renvoie { items:[{sym, chord, section, sectionIdx}], sections:[{name}], unknown:[sym] }
export function parseChart(text) {
  const items = [];
  const sections = [];
  const unknown = [];
  let sec = null;
  const lines = text.replace(/\r/g, '').split('\n');
  for (let raw of lines) {
    let line = raw.replace(/\[\/?ch\]/g, '').replace(/\[\/?tab\]/g, '').trim();
    if (!line) continue;
    const head = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (head) {
      sections.push({ name: sectionName(head[1]) });
      sec = sections.length - 1;
      line = head[2].trim();
      if (!line) continue;
    }
    let rep = 1;
    const mm = /\(?\s*[x×]\s*(\d+)\s*\)?\s*$|\(\s*(\d+)\s*[x×]\s*\)\s*$/i.exec(line);
    if (mm) {
      rep = parseInt(mm[1] || mm[2], 10) || 1;
      line = line.slice(0, mm.index).trim();
    }
    const toks = line.split(/[\s|]+/).filter((t) => t && t !== '-' && t !== '/' && t !== '%');
    if (!toks.length || !toks.every(isChordToken)) continue; // ligne de paroles ou de texte
    if (sec === null) {
      sections.push({ name: 'Début' });
      sec = 0;
    }
    for (let r = 0; r < rep; r++) {
      for (const t of toks) {
        const chord = parseChordSymbol(t);
        if (!chord) {
          if (!/^N\.?C\.?$/i.test(t)) unknown.push(t);
          continue;
        }
        const last = items[items.length - 1];
        if (last && last.sym === t && last.sectionIdx === sec) continue; // même accord répété = tenu
        items.push({ sym: t, chord, sectionIdx: sec });
      }
    }
  }
  // supprime les sections vides et renumérote
  const used = [...new Set(items.map((i) => i.sectionIdx))];
  const remap = new Map(used.map((s, k) => [s, k]));
  const secs = used.map((s) => ({ name: sections[s].name }));
  items.forEach((i) => {
    i.sectionIdx = remap.get(i.sectionIdx);
    i.section = secs[i.sectionIdx].name;
  });
  return { items, sections: secs, unknown };
}

// Texte d'un PDF (pdf.js chargé à la demande), lignes reconstituées par position
export async function pdfToText(file) {
  const pdfjs = await import('../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      let key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2);
      if (key === undefined) {
        key = y;
        rows.set(key, []);
      }
      rows.get(key).push({ x: it.transform[4], s: it.str });
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, parts]) => {
        parts.sort((a, b) => a.x - b.x);
        out.push(parts.map((x) => x.s).join(' ').replace(/\s+/g, ' ').trim());
      });
  }
  return out.join('\n');
}

export function titleFromFilename(name) {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*(chords|tab|tabs|accords)\s*$/i, '')
    .replace(/\s*\((official.*|audio|lyrics?|hd|remaster.*|live.*)\)\s*/gi, ' ')
    .replace(/\s+-\s+/g, ' – ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Gabarit harmonique d'un accord pour l'analyse : poids par classe de hauteur
import { chordInfo } from './theory.js';
export function toneVector(chord) {
  const info = chordInfo(chord);
  const v = new Array(12).fill(0);
  info.tones.forEach((t) => {
    const w = t.label === 'R' ? 1 : /3$/.test(t.label) ? 1 : /5$/.test(t.label) ? 0.8 : 0.7;
    v[t.pc] = Math.max(v[t.pc], w);
  });
  return { v, bass: info.bassPc };
}
