// Écran « Importer un morceau » : grille (texte ou PDF) + audio facultatif → progression.
import * as T from './theory.js';
import { parseChart, pdfToText, titleFromFilename, toneVector } from './chart.js';
import { decodeToMono, analyze, cancelAnalysis } from './audio-import.js';
import { $, esc, ICON, toast, pct, confClass } from './ui.js';
import { S, app, newProg } from './app.js';

const SIGS = { '4/4': [4, 4], '3/4': [3, 4], '6/8': [6, 8] };
const GRID = { '4/4': 2, '3/4': 3, '6/8': 3 };

export function resetImport(start) {
  if (S.importing && S.importing.step === 'analyzing') cancelAnalysis();
  S.importing = start ? { step: 'input', title: '', text: '', audio: null, sig: '4/4', run: 0 } : null;
}

function parsed() {
  const im = S.importing;
  if (im._parsedFor !== im.text) {
    im._parsed = parseChart(im.text || '');
    im._parsedFor = im.text;
  }
  return im._parsed;
}
function parseSummary() {
  const im = S.importing;
  if (!im.text.trim()) return '<span class="muted">Colle la grille ou choisis un PDF.</span>';
  const r = parsed();
  if (!r.items.length) return '<span class="warn-t">Aucun accord reconnu dans ce texte.</span>';
  const uniq = [...new Set(r.items.map((i) => T.chordName(i.chord)))];
  return `<b>${r.items.length} accords</b> (${uniq.slice(0, 8).map(esc).join(' ')}${uniq.length > 8 ? '…' : ''}) · sections : ${r.sections.map((s) => esc(s.name)).join(', ')}${
    r.unknown.length ? `<br><span class="warn-t">Ignorés (illisibles) : ${[...new Set(r.unknown)].map(esc).join(', ')}</span>` : ''
  }`;
}

export function importPage() {
  const im = S.importing;
  const head = `<header class="bar"><button class="icon" data-act="imp-cancel" aria-label="Retour">${ICON.back}</button><h1 class="title">Importer un morceau</h1></header>`;
  if (im.step === 'analyzing') {
    const p = im.progress || { stage: 'préparation', p: 0 };
    const labels = { décodage: 'Lecture du fichier audio', chargement: 'Chargement de l’analyse', rythme: 'Détection du tempo et des temps', accordage: 'Mesure de l’accordage', harmonie: 'Analyse de l’harmonie', alignement: 'Placement des accords de la grille', préparation: 'Préparation' };
    return `<div class="page importer">${head}
      <div class="panel center-panel">
        <div class="spinner"></div>
        <p class="big-label">${labels[p.stage] || esc(p.stage)}…</p>
        <div class="progress"><i style="width:${Math.round(p.p * 100)}%"></i></div>
        <p class="muted small">Compte de 10 secondes à 1 minute selon la longueur du morceau. Laisse l'app ouverte.</p>
        <button class="btn ghost" data-act="imp-cancel">Annuler</button>
      </div></div>`;
  }
  if (im.step === 'result') return resultPage(head);
  const r = parsed();
  return `<div class="page importer">${head}
    <div class="imp-grid">
    <section class="panel">
      <h3>1 · Titre</h3>
      <input class="txt" data-input="imp-title" placeholder="Artiste – Titre" value="${esc(im.title)}" maxlength="80">
      <h3>2 · Grille d'accords</h3>
      <div class="row"><button class="btn" data-act="imp-pdf">Choisir un PDF</button><button class="btn ghost" data-act="imp-paste">Coller</button></div>
      <textarea class="txt area" data-input="imp-text" placeholder="[Verse]\nAm      F\nparoles...\n[Chorus]\nC G Am F (x2)" spellcheck="false" autocapitalize="off" autocorrect="off">${esc(im.text)}</textarea>
      <p class="small" id="imp-sum">${parseSummary()}</p>
    </section>
    <section class="panel">
      <h3>3 · Audio du morceau <small class="muted">(facultatif, pour le rythme)</small></h3>
      ${
        im.audio
          ? `<div class="filechip">${ICON.wave}<span>${esc(im.audio.name)}</span><button class="icon sm" data-act="imp-audio-clear" aria-label="Retirer">${ICON.close}</button></div>`
          : `<button class="btn wide" data-act="imp-audio">${ICON.wave}<span>Choisir le fichier audio</span></button>`
      }
      <p class="muted small">mp3, m4a, wav… L'audio sert à trouver le tempo et la durée de chaque accord ; il n'est pas conservé. Sans audio, chaque accord dure une mesure (à ajuster).</p>
      <h3>Mesure</h3>
      <div class="seg">${Object.keys(SIGS).map((k) => `<button class="${im.sig === k ? 'on' : ''}" data-act="imp-sig" data-v="${k}">${k}</button>`).join('')}</div>
      <div class="imp-go"><button class="btn primary big" data-act="imp-run" ${r.items.length ? '' : 'disabled'}>${im.audio ? 'Analyser' : 'Importer sans audio'}</button></div>
    </section>
    </div></div>`;
}

// --- résultat
function occurrences(im) {
  const res = im.result;
  const items = im._parsed.items;
  const occ = [];
  const count = {};
  res.segments.forEach((s) => {
    const it = items[s.i];
    let last = occ[occ.length - 1];
    if (!last || last.sectionIdx !== it.sectionIdx) {
      count[it.section] = (count[it.section] || 0) + 1;
      last = { sectionIdx: it.sectionIdx, name: it.section, n: count[it.section], segs: [] };
      occ.push(last);
    }
    last.segs.push(s);
  });
  occ.forEach((o) => (o.label = count[o.name] > 1 ? `${o.name} (${o.n})` : o.name));
  return occ;
}
const prefOf = (name) => (/b/.test(name.slice(1)) ? 'flat' : /#/.test(name) ? 'sharp' : 'default');
function transpose(ch, k) {
  if (!k) return ch;
  const tr = (n) => T.pcName(T.pc(n) + k, prefOf(n));
  if (ch.kind === 'custom') return { ...ch, notes: ch.notes.map(tr), bass: tr(ch.bass) };
  return { ...ch, root: tr(ch.root), bass: ch.bass ? tr(ch.bass) : null };
}
function resultPage(head) {
  const im = S.importing;
  const res = im.result;
  const occ = occurrences(im);
  if (!im.keep) im.keep = occ.map(() => true);
  const items = im._parsed.items;
  const hasAudio = !!res.audio;
  const tot = res.segments.reduce((a, s) => a + s.beats, 0);
  const nv = res.segments.filter((s) => s.conf != null && s.conf < 0.6).length;
  const sh = res.shift || 0;
  let trans = '';
  if (sh) {
    const up = sh <= 6 ? sh : sh - 12;
    const capoTxt = sh >= 1 && sh <= 7 ? `capo ${sh} avec les formes de la grille` : `la grille est ${up < 0 ? 'plus aiguë' : 'plus grave'} de ${Math.abs(up)} demi-ton(s) que le disque (accordage différent ?)`;
    trans = `<div class="banner warn"><div><b>La grille n'est pas à la hauteur du disque</b> : ${capoTxt}.</div>
      <div class="seg mt"><button class="${im.trans !== 'chart' ? 'on' : ''}" data-act="imp-trans" data-v="disc">Hauteur du disque${sh >= 1 && sh <= 7 ? ' + capo ' + sh : ''}</button><button class="${im.trans === 'chart' ? 'on' : ''}" data-act="imp-trans" data-v="chart">Comme la grille</button></div></div>`;
  }
  const k = im.trans === 'chart' ? 0 : sh;
  return `<div class="page importer">${head}
    <div class="panel res-sum">
      <div class="res-stats">
        ${hasAudio ? `<div><b>${Math.round(res.bpm)}</b><small>bpm</small></div><div class="${confClass(res.global)}"><b>${pct(res.global)}</b><small>certitude</small></div><div class="${nv ? 'c-low' : 'c-ok'}"><b>${nv}</b><small>à vérifier</small></div>` : `<div><b>${res.segments.length}</b><small>accords</small></div><div><b>—</b><small>pas d'audio</small></div>`}
      </div>
      <input class="txt" data-input="imp-title" placeholder="Titre" value="${esc(im.title)}" maxlength="80">
      ${hasAudio ? '<p class="muted small">Certitude estimée : les accords en orange ou rouge sont à vérifier à l’oreille. Tu pourras les corriger dans Compo.</p>' : '<p class="muted small">Sans audio : une mesure par accord et tempo à 100, à régler dans Compo.</p>'}
    </div>
    ${trans}
    <div class="row between"><h3>Sections à garder</h3><button class="btn small ghost" data-act="imp-all">${im.keep.every(Boolean) ? 'Tout décocher' : 'Tout cocher'}</button></div>
    <div class="occ-list">
      ${occ
        .map(
          (o, oi) => `<div class="occ ${im.keep[oi] ? '' : 'off'}">
        <button class="occ-head" data-act="imp-occ" data-i="${oi}"><span class="cbx">${im.keep[oi] ? ICON.check : ''}</span><b>${esc(o.label)}</b><small class="muted">${o.segs.length} accords${hasAudio ? ' · ' + Math.floor(o.segs[0].t / 60) + ':' + String(Math.round(o.segs[0].t % 60)).padStart(2, '0') : ''}</small></button>
        <div class="occ-chords">${o.segs
          .map((s) => `<span class="oc ${confClass(s.conf)}">${esc(T.chordName(transpose(items[s.i].chord, k)))}<small>${s.beats}</small></span>`)
          .join('')}</div></div>`
        )
        .join('')}
    </div>
    <p class="muted small">${tot} temps au total · les petits chiffres = durée en temps.</p>
    <div class="fab-row"><button class="btn ghost" data-act="imp-back">Modifier</button><button class="btn primary big" data-act="imp-create" ${im.keep.some(Boolean) ? '' : 'disabled'}>Créer la progression</button></div>
  </div>`;
}

async function run() {
  const im = S.importing;
  const r = parsed();
  if (!r.items.length) return;
  const runId = ++im.run;
  const bar = SIGS[im.sig][0];
  if (!im.audio) {
    im.result = { segments: r.items.map((it, i) => ({ i, beats: bar, conf: null, t: 0 })), global: null, shift: 0, bpm: 100, audio: null };
    im.step = 'result';
    im.keep = null;
    return app.render();
  }
  im.step = 'analyzing';
  im.progress = { stage: 'décodage', p: 0 };
  app.render();
  try {
    const signal = await decodeToMono(im.audio);
    if (runId !== im.run || im.step !== 'analyzing') return;
    const seq = r.items.map((it) => ({ ...toneVector(it.chord), section: it.sectionIdx }));
    let lastPaint = 0;
    const out = await analyze(signal, seq, GRID[im.sig], (stage, p) => {
      if (runId !== im.run) return;
      const changed = !im.progress || im.progress.stage !== stage;
      im.progress = { stage, p };
      const now = performance.now();
      if (changed) app.render();
      else if (now - lastPaint > 150) {
        lastPaint = now;
        const el = $('.progress i');
        if (el) el.style.width = Math.round(p * 100) + '%';
      }
    });
    if (runId !== im.run || im.step !== 'analyzing') return;
    if (!out.result || !out.result.segments.length) throw new Error("L'audio et la grille ne correspondent pas assez pour être alignés.");
    im.result = { ...out.result, audio: im.audio.name };
    im.step = 'result';
    im.keep = null;
    im.trans = 'disc';
    app.render();
  } catch (e) {
    if (runId !== im.run) return;
    console.error(e);
    im.step = 'input';
    app.render();
    toast("Analyse impossible : " + e.message + (/decode|format/i.test(e.message) ? ' (format audio non lu)' : ''), 6000);
  }
}

function create() {
  const im = S.importing;
  const res = im.result;
  const occ = occurrences(im);
  const items = im._parsed.items;
  const k = im.trans === 'chart' ? 0 : res.shift || 0;
  const p = newProg(im.title.trim() || 'Morceau importé');
  p.origin = 'import';
  p.sig = SIGS[im.sig];
  p.tempo = res.audio ? Math.round(res.bpm) : 100;
  p.instrument = 'clean';
  if (k >= 1 && k <= 7) p.capo = k;
  p.chords = [];
  occ.forEach((o, oi) => {
    if (!im.keep[oi]) return;
    o.segs.forEach((s) => {
      const ch = { ...transpose(items[s.i].chord, k), beats: s.beats, section: o.name, voicing: {} };
      if (s.conf != null) ch.conf = Math.round(s.conf * 100) / 100;
      p.chords.push(ch);
    });
  });
  p.source = { audio: res.audio || null, global: res.global, shift: res.shift || 0, analyzedAt: Date.now() };
  resetImport(false);
  app.addProgression(p, true).then(() => toast(res.audio ? 'Morceau importé — les accords colorés sont à vérifier' : 'Morceau importé — règle le tempo et les durées'));
}

function pickAudio() {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg';
    input.style.display = 'none';
    input.onchange = () => {
      const f = input.files && input.files[0];
      input.remove();
      ok(f || null);
    };
    document.body.appendChild(input);
    input.click();
  });
}
function pickPdf() {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf,.txt,text/plain';
    input.style.display = 'none';
    input.onchange = () => {
      const f = input.files && input.files[0];
      input.remove();
      ok(f || null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

export const importActions = {
  'imp-cancel': () => {
    resetImport(false);
    app.render();
  },
  'imp-back': () => {
    S.importing.step = 'input';
    app.render();
  },
  'imp-sig': (el) => {
    S.importing.sig = el.dataset.v;
    app.refresh();
  },
  'imp-audio': async () => {
    const f = await pickAudio();
    if (!f) return;
    S.importing.audio = f;
    if (!S.importing.title) S.importing.title = titleFromFilename(f.name);
    app.refresh();
  },
  'imp-audio-clear': () => {
    S.importing.audio = null;
    app.refresh();
  },
  'imp-pdf': async () => {
    const f = await pickPdf();
    if (!f) return;
    try {
      const text = /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? await pdfToText(f) : await f.text();
      S.importing.text = text;
      if (!S.importing.title) S.importing.title = titleFromFilename(f.name);
      app.refresh();
      const n = parsed().items.length;
      toast(n ? `${n} accords lus dans le fichier` : 'Aucun accord trouvé dans ce fichier', 3000);
    } catch (e) {
      console.error(e);
      toast('Lecture du PDF impossible : ' + e.message, 5000);
    }
  },
  'imp-paste': async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        S.importing.text = t;
        app.refresh();
      } else toast('Presse-papiers vide');
    } catch {
      toast('Colle le texte directement dans la zone (appui long → Coller)', 3500);
    }
  },
  'imp-run': run,
  'imp-trans': (el) => {
    S.importing.trans = el.dataset.v;
    app.refresh();
  },
  'imp-occ': (el) => {
    const i = Number(el.dataset.i);
    S.importing.keep[i] = !S.importing.keep[i];
    app.refresh();
  },
  'imp-all': () => {
    const k = S.importing.keep;
    const v = !k.every(Boolean);
    k.fill(v);
    app.refresh();
  },
  'imp-create': create,
  __input: (e) => {
    const k = e.target.dataset.input;
    if (!S.importing) return;
    if (k === 'imp-title') S.importing.title = e.target.value;
    else if (k === 'imp-text') {
      S.importing.text = e.target.value;
      clearTimeout(importActions._t);
      importActions._t = setTimeout(() => {
        const sum = $('#imp-sum');
        if (sum) sum.innerHTML = parseSummary();
        const go = $('[data-act="imp-run"]');
        if (go) go.disabled = !parsed().items.length;
      }, 200);
    }
  },
};
