// Théorie musicale : notes, orthographe, qualités d'accords, reconnaissance, gammes.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FR = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

export const mod12 = (n) => ((n % 12) + 12) % 12;

// Note = chaîne "C", "F#", "Bb", "Bbb", "F##"
export function parseNote(name) {
  const m = /^([A-G])(#{0,2}|b{0,2})$/.exec(name);
  if (!m) throw new Error('Note invalide : ' + name);
  const acc = m[2].startsWith('#') ? m[2].length : -m[2].length;
  return { letter: m[1], acc };
}
export function pc(name) {
  const n = parseNote(name);
  return mod12(LETTER_PC[n.letter] + n.acc);
}
function accStr(acc) {
  return acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc);
}
// note sur une lettre donnée qui sonne la classe de hauteur p
export function spellOnLetter(letter, p) {
  let acc = mod12(p - LETTER_PC[letter]);
  if (acc > 6) acc -= 12;
  if (Math.abs(acc) > 2) return null;
  return letter + accStr(acc);
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEFAULT_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export function pcName(p, pref = 'default') {
  p = mod12(p);
  if (pref === 'sharp') return SHARP_NAMES[p];
  if (pref === 'flat') return FLAT_NAMES[p];
  return DEFAULT_NAMES[p];
}

// Affichage : notation 'en' (C, F♯) ou 'fr' (Do, Fa♯)
export function displayNote(name, notation = 'en') {
  const { letter, acc } = parseNote(name);
  const base = notation === 'fr' ? FR[letter] : letter;
  const a = acc === 2 ? '𝄪' : acc === -2 ? '𝄫' : acc === 1 ? '♯' : acc === -1 ? '♭' : '';
  return base + a;
}
export function prettyAcc(s) {
  return s.replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/(?<=[A-G0-9)])bb/g, '𝄫').replace(/(?<=[A-G0-9(])b/g, '♭');
}

// ---------- Qualités d'accords ----------
// tones : [demi-tons, degré, optionnel?]
export const QUALITIES = [
  { id: 'maj', sym: '', label: 'Majeur', tones: [[0, 1], [4, 3], [7, 5]] },
  { id: 'm', sym: 'm', label: 'Mineur', tones: [[0, 1], [3, 3], [7, 5]] },
  { id: '5', sym: '5', label: 'Power chord', tones: [[0, 1], [7, 5]] },
  { id: '7', sym: '7', label: '7', tones: [[0, 1], [4, 3], [7, 5, 1], [10, 7]] },
  { id: 'maj7', sym: 'maj7', label: 'maj7', tones: [[0, 1], [4, 3], [7, 5, 1], [11, 7]] },
  { id: 'm7', sym: 'm7', label: 'm7', tones: [[0, 1], [3, 3], [7, 5, 1], [10, 7]] },
  { id: 'sus2', sym: 'sus2', label: 'sus2', tones: [[0, 1], [2, 2], [7, 5]] },
  { id: 'sus4', sym: 'sus4', label: 'sus4', tones: [[0, 1], [5, 4], [7, 5]] },
  { id: '7sus4', sym: '7sus4', label: '7sus4', tones: [[0, 1], [5, 4], [7, 5, 1], [10, 7]] },
  { id: 'add9', sym: 'add9', label: 'add9', tones: [[0, 1], [4, 3], [7, 5, 1], [2, 9]] },
  { id: 'madd9', sym: 'm(add9)', label: 'm(add9)', tones: [[0, 1], [3, 3], [7, 5, 1], [2, 9]] },
  { id: '6', sym: '6', label: '6', tones: [[0, 1], [4, 3], [7, 5, 1], [9, 6]] },
  { id: 'm6', sym: 'm6', label: 'm6', tones: [[0, 1], [3, 3], [7, 5, 1], [9, 6]] },
  { id: 'dim', sym: 'dim', label: 'dim', tones: [[0, 1], [3, 3], [6, 5]] },
  { id: 'dim7', sym: 'dim7', label: 'dim7', tones: [[0, 1], [3, 3], [6, 5], [9, 7]] },
  { id: 'm7b5', sym: 'm7b5', label: 'm7♭5 (ø)', tones: [[0, 1], [3, 3], [6, 5], [10, 7]] },
  { id: 'aug', sym: 'aug', label: 'aug (+)', tones: [[0, 1], [4, 3], [8, 5]] },
  { id: '7#5', sym: '7#5', label: '7♯5', tones: [[0, 1], [4, 3], [8, 5], [10, 7]] },
  { id: 'mMaj7', sym: 'm(maj7)', label: 'm(maj7)', tones: [[0, 1], [3, 3], [7, 5, 1], [11, 7]] },
  { id: '9', sym: '9', label: '9', tones: [[0, 1], [4, 3], [7, 5, 1], [10, 7], [2, 9]] },
  { id: 'maj9', sym: 'maj9', label: 'maj9', tones: [[0, 1], [4, 3], [7, 5, 1], [11, 7], [2, 9]] },
  { id: 'm9', sym: 'm9', label: 'm9', tones: [[0, 1], [3, 3], [7, 5, 1], [10, 7], [2, 9]] },
  { id: '7b9', sym: '7b9', label: '7♭9', tones: [[0, 1], [4, 3], [7, 5, 1], [10, 7], [1, 9]] },
  { id: '7#9', sym: '7#9', label: '7♯9', tones: [[0, 1], [4, 3], [7, 5, 1], [10, 7], [3, 9]] },
  { id: '6/9', sym: '6/9', label: '6/9', tones: [[0, 1], [4, 3], [7, 5, 1], [9, 6], [2, 9]] },
  { id: 'm11', sym: 'm11', label: 'm11', tones: [[0, 1], [3, 3], [7, 5, 1], [10, 7], [2, 9, 1], [5, 11]] },
  { id: '13', sym: '13', label: '13', tones: [[0, 1], [4, 3], [7, 5, 1], [10, 7], [2, 9, 1], [9, 13]] },
];
export const QMAP = Object.fromEntries(QUALITIES.map((q) => [q.id, q]));

const NAT_SEMI = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 2, 11: 5, 13: 9 };
export function degreeLabel(semi, deg) {
  if (deg === 1) return 'R';
  let d = mod12(semi) - NAT_SEMI[deg];
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  if (deg === 7 && d === -2) return '𝄫7';
  return (d < 0 ? '♭'.repeat(-d) : '♯'.repeat(d)) + deg;
}

// Orthographie d'une note à partir d'une fondamentale et d'un intervalle (demi-tons, degré)
export function spellInterval(rootName, semi, deg) {
  const r = parseNote(rootName);
  const li = (LETTERS.indexOf(r.letter) + deg - 1) % 7;
  const target = mod12(pc(rootName) + semi);
  return spellOnLetter(LETTERS[li], target) || pcName(target);
}

// ---------- Objets accords ----------
// std   : { kind:'std', root:'A', quality:'m7', bass:null|'G' }
// custom: { kind:'custom', notes:['C','E','G','B'], bass:'C', name:'' }

export function chordInfo(ch) {
  // -> { tones:[{name, pc, label, optional}], bassName, bassPc, rootPc, rootName, required:[pc], optional:[pc] }
  if (ch.kind === 'custom') {
    const rec = recognize(ch.notes, ch.bass);
    const notes = ch.notes.map((n) => ({ name: n, pc: pc(n) }));
    const rootName = rec ? rec.root : ch.bass || ch.notes[0];
    const rootPc = pc(rootName);
    const tones = notes.map((n) => {
      let label = '';
      if (rec) {
        const t = QMAP[rec.quality].tones.find((t) => mod12(rootPc + t[0]) === n.pc);
        if (t) label = degreeLabel(t[0], t[1]);
      }
      if (!label) label = intervalLabel(mod12(n.pc - rootPc));
      return { ...n, label, optional: false };
    });
    const bassName = ch.bass || ch.notes[0];
    return {
      tones,
      rootName,
      rootPc,
      bassName,
      bassPc: pc(bassName),
      required: uniq(tones.map((t) => t.pc)),
      optional: [],
      recognized: rec,
    };
  }
  const q = QMAP[ch.quality];
  const rootPc = pc(ch.root);
  const tones = q.tones.map(([s, d, opt]) => ({
    name: spellInterval(ch.root, s, d),
    pc: mod12(rootPc + s),
    label: degreeLabel(s, d),
    optional: !!opt,
  }));
  const bassName = ch.bass || ch.root;
  const bassPc = pc(bassName);
  if (!tones.some((t) => t.pc === bassPc)) {
    tones.unshift({ name: bassName, pc: bassPc, label: intervalLabel(mod12(bassPc - rootPc)), optional: false, addedBass: true });
  }
  return {
    tones,
    rootName: ch.root,
    rootPc,
    bassName,
    bassPc,
    required: uniq(tones.filter((t) => !t.optional).map((t) => t.pc)),
    optional: uniq(tones.filter((t) => t.optional).map((t) => t.pc)),
  };
}
const uniq = (a) => [...new Set(a)];
function intervalLabel(s) {
  return ['R', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'][mod12(s)];
}

export function chordPcs(ch) {
  const i = chordInfo(ch);
  return uniq([...i.required, ...i.optional]);
}

function suffix(sym) {
  return prettyAcc(sym);
}

export function chordName(ch, notation = 'en') {
  if (ch.kind === 'custom') {
    if (ch.name && ch.name.trim()) return ch.name.trim();
    const rec = recognize(ch.notes, ch.bass);
    if (rec) return chordName({ kind: 'std', ...rec }, notation);
    return ch.notes.map((n) => displayNote(n, notation)).join('·');
  }
  const q = QMAP[ch.quality];
  let s = displayNote(ch.root, notation) + suffix(q.sym);
  if (ch.bass && pc(ch.bass) !== pc(ch.root)) s += '/' + displayNote(ch.bass, notation);
  return s;
}

// Reconnaissance d'un accord saisi note par note
export function recognize(notes, bass) {
  if (!notes || notes.length < 2) return null;
  const set = new Set(notes.map(pc));
  const bassPc = pc(bass || notes[0]);
  let best = null;
  for (const n of notes) {
    const r = pc(n);
    QUALITIES.forEach((q, qi) => {
      const all = q.tones.map((t) => mod12(r + t[0]));
      const req = q.tones.filter((t) => !t[2]).map((t) => mod12(r + t[0]));
      if (![...set].every((p) => all.includes(p))) return;
      if (!req.every((p) => set.has(p))) return;
      const omitted = all.length - set.size;
      let score = qi * 0.05 + omitted * 1.5 + (r === bassPc ? 0 : 3);
      if (!best || score < best.score) best = { score, root: n, quality: q.id };
    });
  }
  if (!best) return null;
  const bassName = bass || notes[0];
  return { root: best.root, quality: best.quality, bass: pc(bassName) === pc(best.root) ? null : bassName };
}

// Transposition d'un accord (pour le capo)
export function transposeName(name, semis, pref = 'default') {
  return pcName(pc(name) + semis, pref);
}
export function transposeChord(ch, semis) {
  if (ch.kind === 'custom') return { ...ch, notes: ch.notes.map((n) => transposeName(n, semis)), bass: ch.bass ? transposeName(ch.bass, semis) : null, name: '' };
  return { ...ch, root: transposeName(ch.root, semis), bass: ch.bass ? transposeName(ch.bass, semis) : null };
}

// ---------- Gammes ----------
export const SCALES = [
  { id: 'major', label: 'majeur', steps: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', label: 'mineur', steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'harmonic', label: 'mineur harmonique', steps: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'dorian', label: 'dorien', steps: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'mixolydian', label: 'mixolydien', steps: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'phrygian', label: 'phrygien', steps: [0, 1, 3, 5, 7, 8, 10] },
  { id: 'lydian', label: 'lydien', steps: [0, 2, 4, 6, 7, 9, 11] },
];
export const SMAP = Object.fromEntries(SCALES.map((s) => [s.id, s]));

// Tonique "conventionnelle" pour chaque pc selon le mode (majeur / mineur)
const MAJOR_TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
export function conventionalTonic(p, mode) {
  const minorish = ['minor', 'harmonic', 'dorian', 'phrygian'].includes(mode);
  return (minorish ? MINOR_TONICS : MAJOR_TONICS)[mod12(p)];
}

export function scaleNotes(key) {
  const s = SMAP[key.mode];
  const t = parseNote(key.tonic);
  const li = LETTERS.indexOf(t.letter);
  return s.steps.map((st, i) => spellOnLetter(LETTERS[(li + i) % 7], pc(key.tonic) + st) || pcName(pc(key.tonic) + st));
}
export function keyName(key, notation = 'en') {
  return displayNote(key.tonic, notation) + ' ' + SMAP[key.mode].label;
}
// Préférence dièses/bémols pour une tonalité
export function keyAccPref(key) {
  if (!key) return 'default';
  const notes = scaleNotes(key);
  if (notes.some((n) => n.includes('b'))) return 'flat';
  if (notes.some((n) => n.includes('#'))) return 'sharp';
  return 'default';
}
export function spellInKey(p, key) {
  if (!key) return pcName(p);
  const notes = scaleNotes(key);
  const found = notes.find((n) => pc(n) === mod12(p));
  if (found) return found;
  return pcName(p, keyAccPref(key) === 'flat' ? 'flat' : keyAccPref(key) === 'sharp' ? 'sharp' : 'default');
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
function roman(rootPc, tonicPc, qualityId, degIdx) {
  const diff = mod12(rootPc - tonicPc) - MAJOR_STEPS[degIdx];
  const acc = diff === -1 || diff === 11 ? '♭' : diff === 1 ? '♯' : '';
  const minorish = ['m', 'm7', 'dim', 'dim7', 'm7b5', 'm6', 'mMaj7', 'm9', 'madd9', 'm11'].includes(qualityId);
  let r = ROMAN[degIdx];
  if (minorish) r = r.toLowerCase();
  const suf = { dim: '°', dim7: '°7', m7b5: 'ø7', aug: '+', m7: '7', '7': '7', maj7: 'maj7', mMaj7: '(maj7)', '7#5': '+7' }[qualityId] || '';
  return acc + r + suf;
}

function qualityFromSemis(semis) {
  const key = semis.join(',');
  for (const q of QUALITIES) {
    if (q.tones.map((t) => t[0]).join(',') === key) return q.id;
  }
  return null;
}

// Accords diatoniques (triades et 7e)
export function diatonicChords(key, sevenths = false) {
  const notes = scaleNotes(key);
  const steps = SMAP[key.mode].steps;
  const tonicPc = pc(key.tonic);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const idx = sevenths ? [0, 2, 4, 6] : [0, 2, 4];
    const semis = idx.map((k) => mod12(steps[(i + k) % 7] - steps[i]));
    const q = qualityFromSemis(semis);
    if (!q) continue;
    const root = notes[i];
    out.push({ chord: { kind: 'std', root, quality: q, bass: null }, roman: roman(pc(root), tonicPc, q, i) });
  }
  return out;
}

// Emprunts / accords hors gamme fréquents (jamais bloquants, juste proposés)
export function borrowedChords(key) {
  const t = pc(key.tonic);
  const minorish = ['minor', 'harmonic', 'dorian', 'phrygian'].includes(key.mode);
  const pref = keyAccPref(key) === 'sharp' ? 'sharp' : 'flat';
  const mk = (semi, q, deg) => {
    const p = mod12(t + semi);
    const inKey = scaleNotes(key).find((n) => pc(n) === p);
    const letter = LETTERS[(LETTERS.indexOf(parseNote(key.tonic).letter) + deg) % 7];
    const root = inKey || spellOnLetter(letter, p) || pcName(p, pref);
    return { chord: { kind: 'std', root, quality: q, bass: null }, roman: roman(p, t, q, deg) };
  };
  if (!minorish) {
    return [mk(5, 'm', 3), mk(10, 'maj', 6), mk(8, 'maj', 5), mk(3, 'maj', 2), mk(2, '7', 1), mk(4, '7', 2), mk(9, '7', 5)];
  }
  return [mk(7, 'maj', 4), mk(7, '7', 4), mk(5, 'maj', 3), mk(1, 'maj', 1), mk(0, 'maj', 0), mk(11, 'dim7', 6)];
}

// ---------- Suggestion de gamme ----------
export function suggestKey(chords) {
  const items = chords
    .map((c) => {
      try {
        const info = chordInfo(c);
        return { c, info, pcs: [...info.required, ...info.optional], w: c.beats || 4 };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!items.length) return null;
  let best = null;
  for (const mode of ['major', 'minor']) {
    const steps = SMAP[mode].steps;
    for (let t = 0; t < 12; t++) {
      const set = new Set(steps.map((s) => mod12(t + s)));
      let score = 0;
      items.forEach((it, i) => {
        const inside = it.pcs.filter((p) => set.has(p)).length / it.pcs.length;
        score += it.w * inside;
        if (inside === 1) score += it.w * 0.5;
        if (it.info.rootPc === t) {
          const isMinor = it.pcs.includes(mod12(t + 3)) && !it.pcs.includes(mod12(t + 4));
          const match = mode === 'minor' ? isMinor : !isMinor;
          score += match ? it.w * 0.4 : 0;
          if (match && i === 0) score += 3;
          if (match && i === items.length - 1) score += 2;
        }
        // la dominante majeure (V) renforce la tonique
        if (it.info.rootPc === mod12(t + 7) && it.pcs.includes(mod12(t + 11))) score += it.w * 0.15;
      });
      const total = items.reduce((a, b) => a + b.w, 0);
      const fit = score / total;
      if (!best || fit > best.fit) best = { key: { tonic: conventionalTonic(t, mode), mode }, fit };
    }
  }
  return best.key;
}

export function chordInKey(ch, key) {
  if (!key) return true;
  const set = new Set(SMAP[key.mode].steps.map((s) => mod12(pc(key.tonic) + s)));
  return chordPcs(ch).every((p) => set.has(p));
}
