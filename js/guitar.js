// Recherche de positions de guitare jouables, doigtés, suggestion de capo.
import { chordInfo, mod12, transposeChord } from './theory.js';

export const GUITAR_TUNINGS = {
  standard: { label: 'Standard (E A D G B E)', midi: [40, 45, 50, 55, 59, 64] },
  dropD: { label: 'Drop D (D A D G B E)', midi: [38, 45, 50, 55, 59, 64] },
  halfDown: { label: '½ ton plus bas (E♭)', midi: [39, 44, 49, 54, 58, 63] },
  wholeDown: { label: '1 ton plus bas (D)', midi: [38, 43, 48, 53, 57, 62] },
  dropC: { label: 'Drop C (C G C F A D)', midi: [36, 43, 48, 53, 57, 62] },
};
export const BASS_TUNINGS = {
  standard: { label: 'Standard (E A D G)', midi: [28, 33, 38, 43] },
  dropD: { label: 'Drop D (D A D G)', midi: [26, 33, 38, 43] },
  halfDown: { label: '½ ton plus bas (E♭)', midi: [27, 32, 37, 42] },
  wholeDown: { label: '1 ton plus bas (D)', midi: [26, 31, 36, 41] },
  dropC: { label: 'Drop C (C G C F)', midi: [24, 31, 36, 41] },
};

const MAX_FRET = 15;

// Évalue un ensemble de frettes ; retourne null si injouable
function evaluate(frets, tuning, target) {
  const sounding = [];
  for (let s = 0; s < 6; s++) if (frets[s] >= 0) sounding.push(s);
  if (sounding.length < target.minStrings) return null;
  const low = sounding[0];
  const lowPc = mod12(tuning[low] + frets[low]);
  const bassOk = lowPc === target.bass;
  if (target.strictBass && !bassOk) return null;

  const present = new Set(sounding.map((s) => mod12(tuning[s] + frets[s])));
  for (const p of target.required) if (!present.has(p)) return null;

  // cordes étouffées : côté grave (ok), côté aigu (pénalité), au milieu (forte pénalité)
  const first = sounding[0];
  const last = sounding[sounding.length - 1];
  let interior = 0;
  for (let s = first; s <= last; s++) if (frets[s] < 0) interior++;
  if (interior > 1) return null;
  const trailing = 5 - last;

  const fretted = sounding.filter((s) => frets[s] > 0);
  let minF = 0,
    maxF = 0;
  if (fretted.length) {
    minF = Math.min(...fretted.map((s) => frets[s]));
    maxF = Math.max(...fretted.map((s) => frets[s]));
    if (maxF - minF > 3) return null;
  }

  // doigts / barré
  let barre = null;
  let fingersNeeded = fretted.length;
  if (fretted.length > 4) {
    const atMin = fretted.filter((s) => frets[s] === minF);
    if (atMin.length < 2) return null;
    const from = atMin[0];
    const to = atMin[atMin.length - 1];
    for (let s = from; s <= to; s++) if (frets[s] < minF) return null; // corde à vide ou étouffée sous le barré
    barre = { fret: minF, from, to };
    fingersNeeded = 1 + fretted.filter((s) => frets[s] > minF).length;
    if (fingersNeeded > 4) return null;
  }
  const fingers = assignFingers(frets, fretted, minF, barre);
  if (!fingers) return null;

  const opens = sounding.filter((s) => frets[s] === 0).length;
  const missingOpt = target.optional.filter((p) => !present.has(p)).length;
  let score = 0;
  score += minF * 0.55;
  score += fingersNeeded * 0.45;
  if (barre) score += 1.2 + (barre.to - barre.from < 3 ? 0.3 : 0);
  if (target.power) {
    score += sounding.length > 4 ? 1 : 0;
    score += low > 1 ? 1.5 : 0;
    score += sounding.length < 3 ? 0.6 : 0;
  } else {
    score += (6 - sounding.length) * 0.9;
    score += trailing * 1.2;
  }
  score += interior * 3;
  score += missingOpt * 0.7;
  score += (maxF - minF) * 0.35 + (maxF - minF === 3 ? 1.6 : 0);
  if (barre) {
    if (barre.from > low) score += 1.8; // barré partiel avec des notes graves au-dessus : peu naturel
    if (barre.from === low && barre.to === 5) score -= 0.8; // barré complet classique
  }
  if (opens && maxF <= 3) score -= 0.6 + opens * 0.15;
  if (opens && maxF >= 4) score += 1.2 + (minF > 4 ? 0.6 : 0); // cordes à vide loin du sillet : moins naturel
  if (!bassOk) score += 6;
  // doublure grave de la fondamentale/basse appréciée
  return {
    frets: frets.slice(),
    fingers,
    barre,
    score,
    bassOk,
    minFret: minF,
    maxFret: maxF,
    missing: [],
  };
}

// Attribution des doigts : notes triées (case, corde), doigts strictement croissants,
// coût = écart à "un doigt par case".
function assignFingers(frets, fretted, minF, barre) {
  const res = Array(6).fill(0);
  let notes = fretted.slice();
  let avail = [1, 2, 3, 4];
  if (barre) {
    for (let s = barre.from; s <= barre.to; s++) if (frets[s] === barre.fret) res[s] = 1;
    // les cordes hors du barré mais à la même case utilisent aussi le doigt 1 si à côté
    notes = notes.filter((s) => !(frets[s] === barre.fret && s >= barre.from && s <= barre.to));
    if (notes.some((s) => frets[s] === barre.fret)) return null;
    avail = [2, 3, 4];
  }
  notes.sort((a, b) => frets[a] - frets[b] || a - b);
  if (notes.length > avail.length) return null;
  let best = null;
  const choose = (start, picked) => {
    if (picked.length === notes.length) {
      let cost = 0;
      picked.forEach((f, i) => (cost += Math.abs(f - 1 - (frets[notes[i]] - minF))));
      if (!best || cost < best.cost) best = { cost, picked: picked.slice() };
      return;
    }
    for (let i = start; i < avail.length; i++) {
      picked.push(avail[i]);
      choose(i + 1, picked);
      picked.pop();
    }
  };
  choose(0, []);
  if (!best) return null;
  best.picked.forEach((f, i) => (res[notes[i]] = f));
  return res;
}

function search(tuning, target) {
  const allowed = new Set([...target.required, ...target.optional, target.bass]);
  const out = new Map();
  for (let start = 1; start <= MAX_FRET - 3; start++) {
    const opts = tuning.map((open) => {
      const o = [-1];
      if (allowed.has(mod12(open))) o.push(0);
      for (let f = start; f <= start + 3; f++) if (allowed.has(mod12(open + f))) o.push(f);
      return o;
    });
    const frets = Array(6).fill(-1);
    const rec = (s, muted) => {
      if (s === 6) {
        const key = frets.join(',');
        if (out.has(key)) return;
        const v = evaluate(frets, tuning, target);
        if (v) out.set(key, v);
        return;
      }
      for (const f of opts[s]) {
        const m = muted + (f < 0 ? 1 : 0);
        if (m > 6 - target.minStrings) continue;
        frets[s] = f;
        rec(s + 1, m);
      }
      frets[s] = -1;
    };
    rec(0, 0);
  }
  return [...out.values()].sort((a, b) => a.score - b.score);
}

function subsets(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [h, ...t] = arr;
  return [...subsets(t, k - 1).map((s) => [h, ...s]), ...subsets(t, k)];
}

const cache = new Map();

// Retourne { voicings:[...], complete:bool, note:string }
export function findVoicings(chord, tuning = GUITAR_TUNINGS.standard.midi) {
  const info = chordInfo(chord);
  const key = JSON.stringify([info.required, info.optional, info.bassPc, tuning]);
  if (cache.has(key)) return cache.get(key);
  const base = {
    required: info.required,
    optional: info.optional,
    bass: info.bassPc,
    minStrings: info.required.length + info.optional.length <= 2 ? 2 : 3,
    strictBass: true,
    power: chord.kind === 'std' && chord.quality === '5',
  };
  let result;
  let v = search(tuning, base);
  if (v.length) {
    result = { voicings: v.slice(0, 16), complete: true, note: '' };
  } else {
    // relâchement : on retire 1 puis 2 notes (jamais la basse)
    let found = null;
    for (let k = 1; k <= 2 && !found; k++) {
      const removable = info.required.filter((p) => p !== info.bassPc && p !== info.rootPc).concat(info.required.includes(info.rootPc) && info.rootPc !== info.bassPc ? [info.rootPc] : []);
      let cands = [];
      for (const drop of subsets(removable, k)) {
        const t = { ...base, required: info.required.filter((p) => !drop.includes(p)), optional: [...info.optional, ...drop] };
        const r = search(tuning, t).map((x) => ({ ...x, score: x.score + k * 2.5 + (drop.includes(info.rootPc) ? 2 : 0) }));
        cands = cands.concat(r);
      }
      if (cands.length) found = cands;
    }
    if (!found) {
      // dernier recours : la basse n'est plus forcément au grave
      const t = { ...base, strictBass: false };
      found = search(tuning, t);
    }
    if (found && found.length) {
      found.sort((a, b) => a.score - b.score);
      const seen = new Set();
      found = found.filter((x) => {
        const k = x.frets.join(',');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      found.forEach((x) => {
        const present = new Set(x.frets.map((f, s) => (f >= 0 ? mod12(tuning[s] + f) : null)).filter((p) => p !== null));
        x.missing = info.required.filter((p) => !present.has(p));
      });
      result = { voicings: found.slice(0, 16), complete: false, note: 'Position incomplète' };
    } else {
      result = { voicings: [], complete: false, note: 'Aucune position jouable à une main' };
    }
  }
  cache.set(key, result);
  return result;
}

// Voicing retenu pour un accord (choix utilisateur si toujours valide)
export function chosenVoicing(chord, capo, tuning) {
  const shape = capo ? transposeChord(chord, -capo) : chord;
  const r = findVoicings(shape, tuning);
  if (!r.voicings.length) return { ...r, voicing: null, index: -1, shape };
  let index = 0;
  const pref = chord.voicing && chord.voicing[capo || 0];
  if (pref) {
    const i = r.voicings.findIndex((v) => v.frets.join(',') === pref);
    if (i >= 0) index = i;
  }
  return { ...r, voicing: r.voicings[index], index, shape };
}

// Suggestion de capo : on cherche la case qui donne les positions les plus simples
export function suggestCapo(chords, tuning) {
  if (!chords.length) return { fret: 0, gain: 0 };
  const uniqChords = [];
  const seen = new Set();
  for (const c of chords) {
    const k = JSON.stringify([c.kind, c.root, c.quality, c.bass, c.notes]);
    if (!seen.has(k)) {
      seen.add(k);
      uniqChords.push(c);
    }
  }
  const total = (capo) =>
    uniqChords.reduce((acc, c) => {
      const r = findVoicings(capo ? transposeChord(c, -capo) : c, tuning);
      const v = r.voicings[0];
      return acc + (v ? v.score + (r.complete ? 0 : 4) : 20);
    }, 0);
  const t0 = total(0);
  let best = { fret: 0, score: t0 };
  for (let f = 1; f <= 7; f++) {
    const t = total(f);
    if (t < best.score) best = { fret: f, score: t };
  }
  const gain = (t0 - best.score) / uniqChords.length;
  if (best.fret && gain >= 0.9) return { fret: best.fret, gain };
  return { fret: 0, gain: 0 };
}

// Hauteurs MIDI réelles d'un voicing
export function voicingMidi(v, tuning, capo = 0) {
  return v.frets.map((f, s) => (f >= 0 ? tuning[s] + capo + f : null)).filter((m) => m !== null);
}
