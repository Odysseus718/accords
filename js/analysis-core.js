// Cœur de l'analyse audio : caractéristiques par temps (Essentia) + alignement d'une grille connue.
// Script "classique" (utilisé dans un Web Worker et testable sous Node).
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ caractéristiques
  // E : instance Essentia ; sig : Float32Array mono 44,1 kHz
  function extractFeatures(E, sig, progress) {
    const SR = 44100;
    progress && progress('rythme', 0.05);
    const r = E.RhythmExtractor2013(E.arrayToVector(sig), 208, 'multifeature', 40);
    const bpm = r.bpm;
    const ticks = Array.from(E.vectorToArray(r.ticks));
    progress && progress('accordage', 0.35);
    // accordage de l'enregistrement
    const tf = [];
    for (let i = 0; i + 4096 <= sig.length; i += SR) {
      const fr = E.arrayToVector(sig.subarray(i, i + 4096));
      const sp = E.Spectrum(E.Windowing(fr, true, 4096, 'blackmanharris62').frame, 4096).spectrum;
      const pk = E.SpectralPeaks(sp, 0, 3000, 60, 80, 'magnitude', SR);
      tf.push(E.TuningFrequency(pk.frequencies, pk.magnitudes, 1).tuningFrequency);
    }
    tf.sort((a, b) => a - b);
    const REF = tf.length ? tf[tf.length >> 1] : 440;
    // chroma par trame
    const FS = 8192, HOP = 2048;
    const frames = [];
    const total = Math.max(1, Math.floor((sig.length - FS) / HOP));
    let n = 0;
    const toC = (v) => {
      const a = E.vectorToArray(v);
      const o = new Array(12);
      for (let k = 0; k < 12; k++) o[(k + 9) % 12] = a[k];
      return o;
    };
    for (let i = 0; i + FS <= sig.length; i += HOP) {
      const fr = E.arrayToVector(sig.subarray(i, i + FS));
      const w = E.Windowing(fr, true, FS, 'blackmanharris62').frame;
      const sp = E.Spectrum(w, FS).spectrum;
      const pk = E.SpectralPeaks(sp, 0, 5000, 100, 40, 'magnitude', SR);
      const h = E.HPCP(pk.frequencies, pk.magnitudes, true, 500, 0, 5000, false, 40, false, 'unitMax', REF, SR, 12, 'squaredCosine', 1).hpcp;
      const pkb = E.SpectralPeaks(sp, 0, 260, 30, 35, 'magnitude', SR);
      const hb = E.HPCP(pkb.frequencies, pkb.magnitudes, false, 500, 0, 260, false, 35, false, 'unitMax', REF, SR, 12, 'squaredCosine', 1).hpcp;
      let e = 0;
      for (let k = i; k < i + FS; k += 8) e += sig[k] * sig[k];
      frames.push({ t: (i + FS / 2) / SR, c: toC(h), b: toC(hb), e });
      // libère la mémoire WASM
      [fr, w, sp, pk.frequencies, pk.magnitudes, h, pkb.frequencies, pkb.magnitudes, hb].forEach((x) => x && x.delete && x.delete());
      if (++n % 200 === 0 && progress) progress('harmonie', 0.35 + 0.6 * (n / total));
    }
    // moyenne par temps
    const beats = [];
    let f0 = 0;
    for (let k = 0; k < ticks.length - 1; k++) {
      const a = ticks[k], z = ticks[k + 1];
      while (f0 < frames.length && frames[f0].t < a) f0++;
      const c = new Array(12).fill(0), b = new Array(12).fill(0);
      let e = 0, cnt = 0;
      for (let j = f0; j < frames.length && frames[j].t < z; j++) {
        for (let q = 0; q < 12; q++) {
          c[q] += frames[j].c[q];
          b[q] += frames[j].b[q];
        }
        e += frames[j].e;
        cnt++;
      }
      const d = Math.max(1, cnt);
      beats.push({ t: a, c: c.map((x) => x / d), b: b.map((x) => x / d), e: e / d });
    }
    progress && progress('alignement', 0.96);
    return { bpm, tuning: REF, beats, duration: sig.length / SR };
  }

  // ------------------------------------------------------------------ alignement
  function cos(a, b) {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < 12; i++) {
      d += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return na && nb ? d / Math.sqrt(na * nb) : 0;
  }
  const argmax = (a) => {
    let m = 0;
    for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i;
    return m;
  };
  const rot = (v, s) => {
    const o = new Array(12);
    for (let k = 0; k < 12; k++) o[(k + s) % 12] = v[k];
    return o;
  };

  // gabarits de comparaison (pour la certitude) : maj, min, 7, m7 sur 12 fondamentales
  const ALT = [];
  for (let r = 0; r < 12; r++) {
    for (const q of [[0, 4, 7], [0, 3, 7], [0, 4, 7, 10], [0, 3, 7, 10]]) {
      const v = new Array(12).fill(0);
      q.forEach((s, i) => (v[(r + s) % 12] = i === 2 ? 0.8 : i === 3 ? 0.75 : 1));
      ALT.push({ v, pcs: q.map((s) => (r + s) % 12), root: r });
    }
  }

  // seq : [{v:[12], bass:pc, section:idx}] ; opts : { grid: 2 }
  function alignOnce(beats, seq, shift, A) {
    const T = beats.length, N = seq.length;
    const tm = seq.map((s) => ({ v: rot(s.v, shift), bass: (s.bass + shift) % 12 }));
    const bassTop = beats.map((b) => argmax(b.b));
    const em = (t, i) => cos(beats[t].c, tm[i].v) + (bassTop[t] === tm[i].bass ? 0.15 : 0);
    const FIL = 0.3, NEG = -1e9, S = N + 2;
    // fin de chaque section (pour les reprises non écrites)
    const secEnd = new Array(N);
    for (let i = N - 1; i >= 0; i--) secEnd[i] = i + 1 < N && seq[i + 1].section === seq[i].section ? secEnd[i + 1] : i;
    const isStart = seq.map((s, i) => i === 0 || seq[i - 1].section !== s.section);
    let score = new Float64Array(S).fill(NEG);
    score[0] = FIL;
    for (let i = 0; i < Math.min(3, N); i++) score[1 + i] = em(0, i) - 0.3 * i;
    const back = [];
    for (let t = 1; t < T; t++) {
      const ns = new Float64Array(S).fill(NEG);
      const bk = new Int32Array(S);
      const up = (j, val, frm) => {
        if (val > ns[j]) {
          ns[j] = val;
          bk[j] = frm;
        }
      };
      up(0, score[0] + FIL, 0);
      for (let i = 0; i < N; i++) {
        const j = i + 1;
        const e = em(t, i);
        up(j, score[j] + e, j);
        if (i === 0) up(j, score[0] + e - A, 0);
        if (i >= 1) up(j, score[j - 1] + e - A, j - 1);
        if (i >= 2) up(j, score[j - 2] + e - A - 0.8, j - 2);
        if (isStart[i]) up(j, score[secEnd[i] + 1] + e - A - 1.0, secEnd[i] + 1);
      }
      if (score[S - 1] >= score[N]) up(S - 1, score[S - 1] + FIL, S - 1);
      else up(S - 1, score[N] + FIL, N);
      score = ns;
      back.push(bk);
    }
    let s = argmax(score);
    const best = score[s];
    const path = new Int32Array(T);
    path[T - 1] = s;
    for (let t = T - 2; t >= 0; t--) {
      s = back[t][s];
      path[t] = s;
    }
    return { fit: best / T, path, em };
  }

  function align(feat, seq, opts) {
    opts = opts || {};
    const grid = opts.grid || 2;
    const beats = feat.beats;
    const N = seq.length;
    if (!N || beats.length < 4) return null;
    const A = 0.12;
    // transposition éventuelle de la grille (capo, accordage)
    const tries = [];
    for (let sh = 0; sh < 12; sh++) tries.push({ sh, r: alignOnce(beats, seq, sh, A) });
    tries.sort((a, b) => b.r.fit - a.r.fit);
    const shift = tries[0].sh;
    const shiftMargin = tries[0].r.fit - tries[1].r.fit;
    const { path, em } = tries[0].r;
    // segments (état, début, longueur)
    let segs = [];
    for (let t = 0; t < path.length; t++) {
      const st = path[t];
      if (segs.length && segs[segs.length - 1].st === st) segs[segs.length - 1].n++;
      else segs.push({ st, start: t, n: 1, jump: segs.length ? st - segs[segs.length - 1].st : 1 });
    }
    // on retire le remplissage du début et de la fin
    segs = segs.filter((g) => g.st > 0 && g.st <= N);
    if (!segs.length) return null;
    // calage sur la grille (demi-mesure en 4/4)
    const starts = segs.map((g) => g.start);
    let off = 0, bestCount = -1;
    for (let o = 0; o < grid; o++) {
      const c = starts.filter((s) => (s - o) % grid === 0).length;
      if (c > bestCount) {
        bestCount = c;
        off = o;
      }
    }
    const rawOnGrid = bestCount / starts.length;
    for (let k = 1; k < segs.length; k++) {
      const s = segs[k].start;
      const r = (((s - off) % grid) + grid) % grid;
      if (!r) continue;
      const left = s - r, right = s + (grid - r);
      const prev = segs[k - 1], cur = segs[k];
      const curEnd = cur.start + cur.n;
      const canLeft = left > prev.start;
      const canRight = right < curEnd;
      // choisir le côté qui colle le mieux à l'audio
      let gainLeft = -Infinity, gainRight = -Infinity;
      if (canLeft) {
        gainLeft = 0;
        for (let t = left; t < s; t++) gainLeft += em(t, cur.st - 1) - em(t, prev.st - 1);
      }
      if (canRight) {
        gainRight = 0;
        for (let t = s; t < right; t++) gainRight += em(t, prev.st - 1) - em(t, cur.st - 1);
      }
      if (!canLeft && !canRight) continue;
      const ns = gainLeft >= gainRight ? left : right;
      const delta = ns - s;
      prev.n += delta;
      cur.start = ns;
      cur.n -= delta;
      cur.snapped = true;
    }
    // certitude par segment : l'accord colle-t-il mieux que ses voisins de grille et que d'autres accords ?
    const out = segs.map((g, k) => {
      const i = g.st - 1;
      const v = rot(seq[i].v, shift);
      const pcsMine = new Set(v.map((x, q) => (x > 0 ? q : -1)).filter((q) => q >= 0));
      const nb = [];
      if (k > 0) nb.push(segs[k - 1].st - 1);
      if (k + 1 < segs.length) nb.push(segs[k + 1].st - 1);
      let fit = 0;
      const nbFit = nb.map(() => 0);
      const altSum = new Array(ALT.length).fill(0);
      for (let t = g.start; t < g.start + g.n; t++) {
        fit += em(t, i);
        nb.forEach((j, q) => (nbFit[q] += em(t, j)));
        const bt = argmax(beats[t].b);
        ALT.forEach((a, q) => (altSum[q] += cos(beats[t].c, a.v) + (bt === a.root ? 0.15 : 0)));
      }
      fit /= g.n;
      const nbMargin = nb.length ? fit - Math.max(...nbFit.map((x) => x / g.n)) : 0.1;
      let alt = -1;
      ALT.forEach((a, q) => {
        const overlap = a.pcs.filter((p) => pcsMine.has(p)).length;
        if (overlap >= Math.min(3, pcsMine.size)) return;
        alt = Math.max(alt, altSum[q] / g.n);
      });
      const altMargin = fit - alt;
      const x = 7 * Math.min(nbMargin, 0.25) + 2.5 * Math.min(altMargin, 0.2) + 4 * (fit - 0.7) + 0.2;
      let conf = 1 / (1 + Math.exp(-3 * x));
      if (g.n === 1) conf *= 0.6;
      if (g.jump < 0 || g.jump > 1) conf *= 0.85; // reprise ou saut dans la grille
      if (shift && shiftMargin < 0.02) conf *= 0.8;
      conf = Math.max(0.03, Math.min(0.98, conf));
      return { i, start: g.start, beats: g.n, t: beats[g.start].t, conf, fit, nbMargin, altMargin };
    });
    // lissage léger : un accord entouré d'accords très sûrs gagne un peu
    const total = out.reduce((a, s) => a + s.beats, 0);
    const global = out.reduce((a, s) => a + s.conf * s.beats, 0) / total;
    return { shift, shiftMargin, segments: out, global, onGrid: rawOnGrid, bpm: feat.bpm, tuning: feat.tuning };
  }

  root.AnalysisCore = { extractFeatures, align };
})(typeof self !== 'undefined' ? self : globalThis);
