import * as T from './theory.js';
import { chosenVoicing, suggestCapo, voicingMidi, GUITAR_TUNINGS, BASS_TUNINGS } from './guitar.js';
import { guitarDiagram, bassNeck } from './diagram.js';
import { INSTRUMENTS, IMAP, Player, previewChord, unlock, loadSamples } from './audio.js';
import { store, requestPersistence, isStandalone, makeExport, shareOrDownload, pickFile, parseImport } from './store.js';
import { $, $$, esc, uid, clamp, ICON, toast, undoToast, openSheet, renderSheet, closeSheet, currentSheet, askText, confirmBox, pct, confClass } from './ui.js';
import { importPage, importActions, resetImport } from './importer.js';

// ---------------------------------------------------------------- constantes
const SIGS = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 8], [7, 8], [9, 8], [12, 8]];
const PATTERNS = [
  { id: 'hold', label: 'Tenu', hint: 'une attaque par accord' },
  { id: 'bar', label: 'Chaque mesure', hint: 'réattaque à chaque mesure' },
  { id: 'beat', label: 'Chaque temps', hint: 'une attaque par temps' },
  { id: 'eighths', label: 'Croches', hint: 'aller-retour, style rock' },
];
const QGROUPS = [
  ['Triades', ['maj', 'm', '5', 'sus2', 'sus4', 'dim', 'aug']],
  ['Septièmes', ['7', 'maj7', 'm7', 'm7b5', 'dim7', '7sus4', 'mMaj7', '7#5']],
  ['Couleurs', ['6', 'm6', 'add9', 'madd9', '6/9']],
  ['Extensions', ['9', 'maj9', 'm9', '7b9', '7#9', 'm11', '13']],
];
const WHITE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK = { 1: ['C#', 'Db'], 3: ['D#', 'Eb'], 6: ['F#', 'Gb'], 8: ['G#', 'Ab'], 10: ['A#', 'Bb'] };
const PC_NAME = (p, acc) => (BLACK[p] ? BLACK[p][acc === 'b' ? 1 : 0] : T.pcName(p));

export const CONCERT_PRESETS = {
  guitar: { label: 'Guitare', guitar: true, bass: false, next: true, nextGuitar: true, nextBass: false },
  bass: { label: 'Basse', guitar: false, bass: true, next: true, nextGuitar: false, nextBass: true },
  both: { label: 'Guitare + basse', guitar: true, bass: true, next: true, nextGuitar: true, nextBass: false },
  names: { label: 'Noms seuls', guitar: false, bass: false, next: true, nextGuitar: false, nextBass: false },
};
const DEFAULT_SETTINGS = {
  notation: { editor: 'en', guitar: 'en', bass: 'fr' },
  guitarTuning: 'standard',
  bassTuning: 'standard',
  bassLabels: 'notes',
  lastBackup: 0,
  lastChange: 0,
  concert: { preset: 'both', ...CONCERT_PRESETS.both, section: true, pulse: true, tempo: true, nextRootMark: true, shortNeck: false },
};

export const S = {
  settings: structuredClone(DEFAULT_SETTINGS),
  progs: [],
  tab: 'compo',
  live: false,
  cur: null,
  sel: -1,
  play: null,
  concertIdx: 0,
  persist: '',
  seq: null,
  gfilter: 'mine',
  gsearch: '',
};

const gTun = () => (GUITAR_TUNINGS[S.settings.guitarTuning] || GUITAR_TUNINGS.standard).midi;
const bTun = () => (BASS_TUNINGS[S.settings.bassTuning] || BASS_TUNINGS.standard).midi;
const N = (area) => S.settings.notation[area] || 'en';
export const prog = () => S.progs.find((p) => p.id === S.cur);
const bpb = (p) => p.sig[0];
function accents(p) {
  const [n, d] = p.sig;
  if (d === 8 && n % 3 === 0) return Array.from({ length: n / 3 - 1 }, (_, i) => (i + 1) * 3);
  if (n === 5) return [3];
  if (n === 7) return [2, 4];
  return [];
}
const capoOf = (p) => (p.capoOff ? 0 : p.capo || 0);
export const cname = (ch, area = 'editor') => T.chordName(ch, N(area));
function keyOf(p) {
  if (p.key) return { key: p.key, auto: false };
  if (p.chords.length >= 2) {
    const k = T.suggestKey(p.chords);
    if (k) return { key: k, auto: true };
  }
  return { key: null, auto: true };
}
const totalBeats = (p) => p.chords.reduce((a, c) => a + c.beats, 0);
function fmtDur(p) {
  const sec = Math.round((totalBeats(p) * 60) / p.tempo);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
const isImported = (p) => p.origin === 'import';
function toVerify(p) {
  return p.chords.filter((c) => c.conf != null && c.conf < 0.6).length;
}
function meanConf(p) {
  const w = p.chords.filter((c) => c.conf != null);
  if (!w.length) return null;
  const tot = p.chords.reduce((a, c) => a + c.beats, 0);
  return p.chords.reduce((a, c) => a + (c.conf == null ? 1 : c.conf) * c.beats, 0) / tot;
}

// ---------------------------------------------------------------- persistance
let saveTimer = null;
const dirty = new Set();
export function touch(p = prog()) {
  if (!p) return;
  p.updated = Date.now();
  S.settings.lastChange = Date.now();
  S.seq = null;
  dirty.add(p.id);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
async function flush() {
  const ids = [...dirty];
  dirty.clear();
  for (const id of ids) {
    const p = S.progs.find((x) => x.id === id);
    if (p) await store.put(p);
  }
  await store.set('settings', S.settings);
}
function saveSettings() {
  store.set('settings', S.settings);
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

export function newProg(name = 'Nouvelle progression') {
  return {
    id: uid(),
    name,
    origin: 'compo',
    created: Date.now(),
    updated: Date.now(),
    tempo: 100,
    sig: [4, 4],
    instrument: 'piano',
    pattern: 'hold',
    loop: true,
    metronome: true,
    bassRoot: false,
    countIn: true,
    key: null,
    capo: 0,
    capoOff: false,
    chords: [],
  };
}

function normalizeProg(p) {
  const out = { ...newProg(), ...p };
  out.id = typeof p.id === 'string' ? p.id : uid();
  out.name = String(p.name || 'Sans titre').slice(0, 80);
  out.origin = p.origin === 'import' ? 'import' : 'compo';
  out.tempo = clamp(Math.round(Number(p.tempo)) || 100, 30, 300);
  out.sig = Array.isArray(p.sig) && SIGS.some((s) => s[0] === p.sig[0] && s[1] === p.sig[1]) ? p.sig : [4, 4];
  if (!IMAP[out.instrument]) out.instrument = 'piano';
  if (!PATTERNS.some((x) => x.id === out.pattern)) out.pattern = 'hold';
  out.capo = clamp(Number(p.capo) || 0, 0, 9);
  try {
    if (out.key) {
      T.parseNote(out.key.tonic);
      if (!T.SMAP[out.key.mode]) out.key = null;
    }
  } catch {
    out.key = null;
  }
  out.chords = (Array.isArray(p.chords) ? p.chords : [])
    .map((c) => {
      try {
        const ch = {
          id: typeof c.id === 'string' ? c.id : uid(),
          beats: clamp(Math.round(Number(c.beats) || 4), 1, 128),
          voicing: c.voicing && typeof c.voicing === 'object' ? c.voicing : {},
        };
        if (typeof c.section === 'string' && c.section) ch.section = c.section.slice(0, 40);
        if (typeof c.conf === 'number') ch.conf = clamp(c.conf, 0, 1);
        if (c.kind === 'custom') {
          const notes = c.notes.filter((n) => typeof n === 'string');
          notes.forEach(T.parseNote);
          if (!notes.length) return null;
          const bass = c.bass && notes.some((n) => T.pc(n) === T.pc(c.bass)) ? c.bass : notes[0];
          return { ...ch, kind: 'custom', notes, bass, name: String(c.name || '').slice(0, 30) };
        }
        T.parseNote(c.root);
        if (!T.QMAP[c.quality]) return null;
        if (c.bass) T.parseNote(c.bass);
        return { ...ch, kind: 'std', root: c.root, quality: c.quality, bass: c.bass || null };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (p.source && typeof p.source === 'object') out.source = p.source;
  return out;
}

export async function addProgression(p, open = true) {
  p = normalizeProg(p);
  S.progs.push(p);
  await store.put(p);
  S.settings.lastChange = Date.now();
  saveSettings();
  if (open) {
    S.cur = p.id;
    S.sel = -1;
    setTab('compo');
  }
  return p;
}

// ---------------------------------------------------------------- audio / lecture
function keysVoicing(info) {
  const bass = 40 + T.mod12(info.bassPc - 40);
  const pcs = [...new Set([...info.required, ...info.optional])];
  const upper = pcs.map((p) => 55 + T.mod12(p - 55)).sort((a, b) => a - b);
  return [bass, ...upper];
}
function chordAudio(ch, p) {
  const info = T.chordInfo(ch);
  const inst = IMAP[p.instrument] || IMAP.piano;
  let midis = null;
  if (inst.kind === 'guitar') {
    const cv = chosenVoicing(ch, capoOf(p), gTun());
    if (cv.voicing) midis = voicingMidi(cv.voicing, gTun(), capoOf(p));
  }
  if (!midis) midis = keysVoicing(info);
  return { midis, bass: 28 + T.mod12(info.bassPc - 28), beats: ch.beats };
}
function sequence() {
  const p = prog();
  if (!p) return { chords: [], tempo: 100, beatsPerBar: 4, accents: [] };
  if (!S.seq) {
    S.seq = {
      tempo: p.tempo,
      beatsPerBar: bpb(p),
      accents: accents(p),
      instrument: p.instrument,
      loop: p.loop,
      metronome: p.metronome,
      bassRoot: p.bassRoot,
      pattern: p.pattern,
      chords: p.chords.map((c) => chordAudio(c, p)),
    };
  }
  return S.seq;
}

const player = new Player({
  getSequence: sequence,
  onBeat: (e) => {
    S.play = e;
    if (S.live) updateConcertBeat(e);
    else if (S.tab === 'compo') updateEditorPlay();
  },
  onStop: () => {
    S.play = null;
    if (S.live) renderConcert();
    else if (S.tab === 'compo') {
      updateEditorPlay();
      setPlayButtons();
    }
  },
});

async function togglePlay(from = 0, countIn = false) {
  if (player.playing) {
    player.stop();
    setPlayButtons();
    return;
  }
  const p = prog();
  if (!p || !p.chords.length) return toast('Ajoute au moins un accord');
  try {
    setPlayButtons(true);
    await player.start({ fromIndex: from, countIn });
  } catch (e) {
    console.error(e);
    toast('Impossible de lancer le son : ' + e.message);
  }
  setPlayButtons();
}
function setPlayButtons(loading) {
  $$('[data-act="play"], [data-act="c-play"]').forEach((b) => {
    b.classList.toggle('on', !!player.playing);
    b.innerHTML = loading ? ICON.dots : player.playing ? ICON.stop : ICON.play;
  });
}
function preview(ch) {
  const p = prog();
  unlock();
  const a = chordAudio(ch, p || { instrument: 'piano', capo: 0 });
  previewChord(p ? p.instrument : 'piano', a.midis).catch((e) => toast(e.message));
}

// ---------------------------------------------------------------- navigation
export function setTab(tab) {
  if (S.live) exitLive(true);
  if (player.playing && tab !== S.tab) player.stop();
  S.tab = tab;
  window.scrollTo(0, 0);
  render();
}
export function render() {
  const view = $('#view');
  document.body.dataset.tab = S.tab;
  $$('.tabbar [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  if (S.live) return renderConcert();
  if (S.tab === 'gallery') view.innerHTML = S.importing ? importPage() : viewGallery();
  else if (S.tab === 'compo') view.innerHTML = viewCompo();
  else if (S.tab === 'concert') view.innerHTML = viewConcertSetup();
  setPlayButtons();
  if (S.tab === 'compo') updateEditorPlay();
}
function refresh() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}
export const app = { render, refresh, setTab, S, prog, cname, toast, addProgression, touch };

// ---------------------------------------------------------------- galerie
function cardHtml(p) {
  const mc = meanConf(p);
  const nv = toVerify(p);
  const tag = isImported(p)
    ? `<span class="tag imp">importé${mc != null ? ' · certitude ' + pct(mc) : ''}</span>${nv ? `<span class="tag warn">${nv} à vérifier</span>` : ''}`
    : '';
  const secs = [...new Set(p.chords.map((c) => c.section).filter(Boolean))];
  return `<div class="card" data-act="open" data-id="${p.id}">
    <div class="card-main">
      <div class="card-title">${esc(p.name)}</div>
      <div class="card-chords">${p.chords.length ? esc([...new Set(p.chords.map((c) => cname(c)))].slice(0, 10).join('  ')) : '<i>vide</i>'}</div>
      <div class="card-meta">${tag}<span>${p.sig.join('/')} · ${p.tempo} bpm · ${p.chords.length} accord${p.chords.length > 1 ? 's' : ''} · ${fmtDur(p)}${secs.length ? ' · ' + secs.length + ' sections' : ''}</span></div>
    </div>
    <button class="icon" data-act="card-menu" data-id="${p.id}" aria-label="Options">${ICON.more}</button>
  </div>`;
}
function viewGallery() {
  const mine = S.progs.filter((p) => !isImported(p));
  const imp = S.progs.filter(isImported);
  let list = S.gfilter === 'imported' ? imp : mine;
  const q = S.gsearch.trim().toLowerCase();
  if (q) list = S.progs.filter((p) => p.name.toLowerCase().includes(q));
  list = list.slice().sort((a, b) => b.updated - a.updated);
  const needBackup = S.progs.length && S.settings.lastChange > S.settings.lastBackup && Date.now() - S.settings.lastBackup > 14 * 864e5;
  const banners = [];
  if (!isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    banners.push(`<div class="banner warn"><b>Installe l'app</b> pour protéger tes données : bouton <b>Partager</b> de Safari → <b>Sur l'écran d'accueil</b>, puis ouvre-la depuis l'icône.</div>`);
  }
  if (needBackup) {
    const d = S.settings.lastBackup ? `depuis le ${new Date(S.settings.lastBackup).toLocaleDateString('fr-FR')}` : 'encore jamais';
    banners.push(`<div class="banner"><span>Pas de sauvegarde ${d}.</span><button class="btn small primary" data-act="backup">Sauvegarder</button></div>`);
  }
  return `<div class="page gallery">
  <header class="bar">
    <h1>Galerie</h1>
    <button class="icon" data-act="settings" aria-label="Réglages">${ICON.gear}</button>
  </header>
  ${banners.join('')}
  <div class="g-tools">
    <div class="searchbox">${ICON.search}<input type="search" placeholder="Rechercher" value="${esc(S.gsearch)}" data-input="gsearch" autocomplete="off"></div>
    ${q ? '' : `<div class="seg"><button class="${S.gfilter === 'mine' ? 'on' : ''}" data-act="gfilter" data-v="mine">Mes compos <small>${mine.length}</small></button><button class="${S.gfilter === 'imported' ? 'on' : ''}" data-act="gfilter" data-v="imported">Importés <small>${imp.length}</small></button></div>`}
  </div>
  <div class="cards">
    ${
      list.length
        ? list.map(cardHtml).join('')
        : q
          ? `<div class="empty"><p class="muted">Aucun résultat pour « ${esc(S.gsearch)} ».</p></div>`
          : S.gfilter === 'imported'
            ? `<div class="empty"><p>Aucun morceau importé.</p><p class="muted">Importe une grille (texte ou PDF Ultimate Guitar) et, si tu l'as, le fichier audio du morceau : l'app retrouve le rythme.</p><button class="btn primary" data-act="import-song">${ICON.wave}<span>Importer un morceau</span></button></div>`
            : `<div class="empty"><p>Aucune compo pour l'instant.</p><p class="muted">Crée ta première grille.</p></div>`
    }
  </div>
  <div class="fab-row">
    <button class="btn ghost" data-act="import-menu">Importer</button>
    <button class="btn primary big" data-act="new">${ICON.plus}<span>Nouvelle</span></button>
  </div>
</div>`;
}

function cardMenu(id) {
  const p = S.progs.find((x) => x.id === id);
  openSheet(
    () => `<h2>${esc(p.name)}</h2>
    <div class="menu">
      <button data-act="m-open" data-id="${id}">Ouvrir en compo</button>
      <button data-act="m-concert" data-id="${id}">Mode concert</button>
      <button data-act="m-rename" data-id="${id}">Renommer</button>
      <button data-act="m-dup" data-id="${id}">Dupliquer</button>
      <button data-act="m-move" data-id="${id}">${isImported(p) ? 'Ranger dans « Mes compos »' : 'Ranger dans « Importés »'}</button>
      <button data-act="m-export" data-id="${id}">Exporter (fichier)</button>
      <button class="danger" data-act="m-delete" data-id="${id}">Supprimer</button>
    </div>`
  );
}
async function renameProg(id) {
  const p = S.progs.find((x) => x.id === id);
  const v = await askText('Renommer', p.name);
  if (v) {
    p.name = v;
    touch(p);
    refresh();
  }
}
function dupProg(id) {
  const p = S.progs.find((x) => x.id === id);
  const c = structuredClone(p);
  c.id = uid();
  c.name = p.name + ' (copie)';
  c.created = c.updated = Date.now();
  c.chords.forEach((ch) => (ch.id = uid()));
  S.progs.push(c);
  touch(c);
  refresh();
  toast('Copie créée');
}
async function deleteProg(id) {
  const p = S.progs.find((x) => x.id === id);
  if (!(await confirmBox('Supprimer ?', `« ${esc(p.name)} » sera définitivement supprimée de cet appareil.`))) return;
  S.progs = S.progs.filter((x) => x.id !== id);
  await store.remove(id);
  if (S.cur === id) S.cur = null;
  render();
  toast('Progression supprimée');
}
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'progression';
async function exportProg(id) {
  await flush();
  const p = S.progs.find((x) => x.id === id);
  await shareOrDownload(makeExport([p]), `${slug(p.name)}.json`);
}
async function backupAll() {
  await flush();
  if (!S.progs.length) return toast('Rien à sauvegarder');
  const d = new Date().toISOString().slice(0, 10);
  const r = await shareOrDownload(makeExport(S.progs), `accords-sauvegarde-${d}.json`);
  if (r !== 'cancelled') {
    S.settings.lastBackup = Date.now();
    saveSettings();
    render();
    toast(r === 'shared' ? 'Sauvegarde prête — choisis « Enregistrer dans Fichiers »' : 'Fichier de sauvegarde créé');
  }
}
async function importFile() {
  const text = await pickFile();
  if (!text) return;
  let list;
  try {
    list = parseImport(text);
  } catch (e) {
    return toast(e.message, 4000);
  }
  let added = 0,
    skipped = 0;
  for (const raw of list) {
    const p = normalizeProg(raw);
    const ex = S.progs.find((x) => x.id === p.id);
    if (ex) {
      if (JSON.stringify(ex.chords) === JSON.stringify(p.chords) && ex.name === p.name) {
        skipped++;
        continue;
      }
      p.id = uid();
      p.name += ' (importée)';
    }
    S.progs.push(p);
    await store.put(p);
    added++;
  }
  render();
  toast(`${added} progression${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}${skipped ? ` · ${skipped} déjà présente${skipped > 1 ? 's' : ''}` : ''}`, 3500);
}

function settingsSheet() {
  openSheet(
    () => {
      const st = S.settings;
      const nsel = (area, label) => `<div class="field"><label>${label}</label><div class="seg">
      <button class="${st.notation[area] === 'en' ? 'on' : ''}" data-act="set-not" data-area="${area}" data-v="en">C D E</button>
      <button class="${st.notation[area] === 'fr' ? 'on' : ''}" data-act="set-not" data-area="${area}" data-v="fr">Do Ré Mi</button></div></div>`;
      return `<h2>Réglages</h2>
      <h3>Notation</h3>
      ${nsel('editor', 'Compo et galerie')}
      ${nsel('guitar', 'Concert : accords / guitare')}
      ${nsel('bass', 'Concert : basse')}
      <h3>Accordages</h3>
      <div class="field"><label>Guitare</label><select data-change="g-tun">${Object.entries(GUITAR_TUNINGS)
        .map(([k, v]) => `<option value="${k}" ${k === st.guitarTuning ? 'selected' : ''}>${v.label}</option>`)
        .join('')}</select></div>
      <div class="field"><label>Basse</label><select data-change="b-tun">${Object.entries(BASS_TUNINGS)
        .map(([k, v]) => `<option value="${k}" ${k === st.bassTuning ? 'selected' : ''}>${v.label}</option>`)
        .join('')}</select></div>
      <h3>Sauvegardes</h3>
      <p class="muted small">Dernière sauvegarde : <b>${st.lastBackup ? new Date(st.lastBackup).toLocaleString('fr-FR') : 'jamais'}</b>.
      Enregistre le fichier dans <b>Fichiers → iCloud Drive</b> : c'est ta vraie assurance contre la perte.
      Le même fichier sert à passer tes progressions du téléphone à l'ordinateur (et inversement) : chaque appareil a son propre stockage.</p>
      <div class="row"><button class="btn primary" data-act="backup">Tout sauvegarder</button><button class="btn" data-act="import-file">Importer un fichier</button></div>
      <h3>Stockage</h3>
      <p class="muted small">App installée : <b>${isStandalone() ? 'oui' : 'non (ouverte dans le navigateur)'}</b> · stockage persistant : <b>${esc(S.persist || '…')}</b> · ${S.progs.length} progression(s).</p>
      <p class="muted small">Sur iPhone, ne supprime pas l'icône de l'écran d'accueil : iOS effacerait aussi les données de l'app.</p>
      <h3>À propos</h3>
      <p class="muted small">Sons : FluidR3 GM (Frank Wen, CC BY 3.0). Analyse audio : Essentia.js (MTG-UPF, AGPL-3.0). Lecture PDF : pdf.js (Mozilla, Apache 2.0). Version ${window.APP_VERSION}.</p>`;
    },
    { tall: true }
  );
}

// ---------------------------------------------------------------- compo
function viewCompo() {
  const p = prog();
  if (!p) {
    const recent = S.progs.slice().sort((a, b) => b.updated - a.updated).slice(0, 5);
    return `<div class="page compo">
      <header class="bar"><h1>Compo</h1></header>
      <div class="empty big-empty">
        <p>Aucune progression ouverte.</p>
        <div class="row center"><button class="btn primary big" data-act="new">${ICON.plus}<span>Nouvelle</span></button></div>
        ${recent.length ? `<h3>Reprendre</h3><div class="cards">${recent.map(cardHtml).join('')}</div>` : ''}
      </div></div>`;
  }
  const { key, auto } = keyOf(p);
  const sugg = suggestCapo(p.chords, gTun());
  const capoNote =
    p.capo && !p.capoOff
      ? `<button class="chip on" data-act="capo-sheet">Capo ${p.capo}</button>`
      : sugg.fret
        ? `<button class="chip hint" data-act="capo-sheet">Capo ${sugg.fret} conseillé</button>`
        : `<button class="chip" data-act="capo-sheet">Sans capo</button>`;
  const perRow = bpb(p) * (bpb(p) >= 6 ? 2 : 4);
  const nv = toVerify(p);
  const mc = meanConf(p);
  let lastSec = null;
  const blocks = p.chords
    .map((c, i) => {
      let head = '';
      if (c.section && c.section !== lastSec) head = `<div class="sec-head" data-act="sec-rename" data-i="${i}">${esc(c.section)}</div>`;
      lastSec = c.section || lastSec;
      const cc = confClass(c.conf);
      const badge = c.conf != null && c.conf < 0.85 ? `<span class="blk-conf">${Math.round(c.conf * 100)}%</span>` : '';
      return `${head}<div class="blk ${i === S.sel ? 'sel' : ''} ${S.multi && S.multi.has(c.id) ? 'msel' : ''} ${key && !T.chordInKey(c, key) ? 'out' : ''} ${cc}" data-act="sel" data-i="${i}" style="--beats:${c.beats}">
        <span class="blk-name">${esc(cname(c))}</span><span class="blk-dur">${durLabel(c.beats, p)}</span>${badge}<span class="blk-prog"></span></div>`;
    })
    .join('');
  const hasPanel = S.multi ? true : S.sel >= 0 && p.chords[S.sel];
  return `<div class="page compo ${hasPanel ? 'has-sel' : ''} ${S.multi ? 'multi' : ''}">
  <header class="bar">
    <button class="icon" data-act="close-cur" aria-label="Fermer">${ICON.back}</button>
    <h1 class="title" data-act="rename-cur">${esc(p.name)}</h1>
    <button class="icon" data-act="prog-settings" aria-label="Réglages du morceau">${ICON.gear}</button>
  </header>
  <div class="transport">
    <button class="play" data-act="play" aria-label="Lecture">${ICON.play}</button>
    <button class="tbtn ${p.loop ? 'on' : ''}" data-act="loop" aria-label="Boucle">${ICON.loop}</button>
    <button class="tbtn tempo" data-act="tempo-sheet"><b>${p.tempo}</b><small>bpm</small></button>
    <button class="tbtn" data-act="sig-sheet"><b>${p.sig[0]}/${p.sig[1]}</b></button>
    <button class="tbtn inst" data-act="inst-sheet"><span>${esc(IMAP[p.instrument].label)}</span></button>
  </div>
  <div class="chips">
    <button class="chip ${key && !auto ? 'on' : ''}" data-act="key-sheet">Gamme : ${key ? T.keyName(key, N('editor')) + (auto ? ' <i>(suggérée)</i>' : '') : '—'}</button>
    ${capoNote}
    <button class="chip ${S.multi ? 'on' : ''}" data-act="multi">${S.multi ? 'Terminer la sélection' : 'Sélection multiple'}</button>
    ${mc != null ? `<button class="chip ${nv ? 'warn' : 'ok'}" data-act="next-verify">Certitude ${pct(mc)}${nv ? ` · ${nv} à vérifier` : ' ✓'}</button>` : ''}
  </div>
  <div class="compo-grid">
    <div class="compo-main">
      <div class="timeline" style="--per-row:${perRow}">
        ${blocks}
        <button class="blk add" data-act="add-chord" aria-label="Ajouter un accord">${ICON.plus}</button>
      </div>
      <div class="tl-meta muted small">${p.chords.length ? `${(totalBeats(p) / bpb(p)).toFixed(totalBeats(p) % bpb(p) ? 1 : 0)} mesures · ${fmtDur(p)} · appui long sur un accord pour le déplacer` : 'Touche + pour ajouter ton premier accord.'}</div>
    </div>
    <aside class="compo-side">${S.multi ? multiPanel(p) : S.sel >= 0 && p.chords[S.sel] ? selPanel(p, S.sel) : `<div class="side-hint muted small">Touche un accord pour le modifier.</div>`}</aside>
  </div>
</div>`;
}
function durLabel(beats, p) {
  const b = bpb(p);
  if (beats % b === 0) return `${beats / b} mes.`;
  return `${beats} t`;
}
function diagramBlock(ch, p, { small = false, notation = 'guitar' } = {}) {
  const capo = capoOf(p);
  const cv = chosenVoicing(ch, capo, gTun());
  const info = T.chordInfo(ch);
  let note = '';
  if (!cv.voicing) note = `<div class="dnote bad">Aucune position jouable à une main. Notes : ${info.tones.map((t) => T.displayNote(t.name, N(notation))).join(' · ')}</div>`;
  else if (!cv.complete) {
    const miss = (cv.voicing.missing || []).map((pc) => {
      const t = info.tones.find((x) => x.pc === pc);
      return t ? T.displayNote(t.name, N(notation)) : '';
    });
    const parts = [];
    if (miss.length) parts.push(`manque ${miss.join(', ')}`);
    if (!cv.voicing.bassOk) parts.push(`basse ${T.displayNote(info.bassName, N(notation))} pas au grave`);
    note = `<div class="dnote warn">Position incomplète${parts.length ? ' : ' + parts.join(' ; ') : ''}</div>`;
  }
  const shapeName = capo ? `<div class="shape">capo ${capo} · forme ${esc(T.chordName(cv.shape, N(notation)))}</div>` : '';
  return `<div class="diag ${small ? 'small' : ''}">${shapeName}${guitarDiagram(cv.voicing, { capo, fingers: !small })}${note}</div>`;
}
function selPanel(p, i) {
  const ch = p.chords[i];
  const cv = chosenVoicing(ch, capoOf(p), gTun());
  const info = T.chordInfo(ch);
  const b = bpb(p);
  const conf =
    ch.conf != null
      ? `<div class="conf-row ${confClass(ch.conf)}"><span>Certitude estimée : <b>${pct(ch.conf)}</b>${ch.conf < 0.6 ? ' — à vérifier' : ''}</span><button class="btn small" data-act="verify">${ICON.check}<span>Vérifié</span></button></div>`
      : '';
  return `<div class="selpanel">
    <button class="sp-close" data-act="sel-close" aria-label="Fermer">${ICON.close}</button>
    ${ch.section ? `<div class="sp-sec">${esc(ch.section)}</div>` : ''}
    <div class="sp-head">
      <div><div class="sp-name">${esc(cname(ch))}</div>
      <div class="muted small">${info.tones.map((t) => `${T.displayNote(t.name, N('editor'))}<sup>${t.label}</sup>`).join(' ')}</div></div>
      <button class="icon" data-act="preview-sel" aria-label="Écouter">${ICON.speaker}</button>
    </div>
    ${conf}
    <div class="sp-body">
      <div class="sp-diag">${diagramBlock(ch, p, { notation: 'editor' })}
        ${cv.voicings.length > 1 ? `<div class="pos"><button class="icon sm" data-act="vpos" data-d="-1">${ICON.left}</button><span>position ${cv.index + 1}/${cv.voicings.length}</span><button class="icon sm" data-act="vpos" data-d="1">${ICON.right}</button></div>` : ''}
      </div>
      <div class="sp-side">
        <label class="small muted">Durée</label>
        <div class="stepper"><button data-act="dur" data-d="-1">−</button><span><b>${ch.beats}</b> temps</span><button data-act="dur" data-d="1">+</button></div>
        <div class="quick">${[0.5, 1, 2, 4]
          .filter((m) => Number.isInteger(b * m))
          .map((m) => `<button class="${ch.beats === b * m ? 'on' : ''}" data-act="dur-set" data-v="${b * m}">${m === 0.5 ? '½' : m} mes.</button>`)
          .join('')}</div>
        <div class="sp-move"><button class="icon sm" data-act="move" data-d="-1" aria-label="Avancer">${ICON.left}</button><span class="small muted">déplacer</span><button class="icon sm" data-act="move" data-d="1" aria-label="Reculer">${ICON.right}</button></div>
      </div>
    </div>
    <div class="sp-actions">
      <button class="btn" data-act="edit-chord">Modifier</button>
      <button class="btn" data-act="dup-chord">Dupliquer</button>
      <button class="btn danger" data-act="del-chord">Supprimer</button>
    </div>
  </div>`;
}
// ---- sélection multiple
const selected = (p) => p.chords.filter((c) => S.multi.has(c.id));
function multiPanel(p) {
  const sel = selected(p);
  if (!sel.length)
    return `<div class="selpanel multipanel">
    <button class="sp-close" data-act="multi" aria-label="Terminer">${ICON.close}</button>
    <div class="sp-name">Sélection multiple</div>
    <p class="muted small">Touche les accords à modifier ensemble${matchMedia('(hover: hover)').matches ? ' (Maj + clic pour sélectionner une plage)' : ''}.</p>
    <div class="row tight"><button class="btn small" data-act="m-all">Tout sélectionner</button><button class="btn small ghost" data-act="multi">Terminer</button></div>
  </div>`;
  const b = bpb(p);
  const beats = [...new Set(sel.map((c) => c.beats))];
  const names = [...new Set(sel.map((c) => cname(c)))];
  const secs = [...new Set(sel.map((c) => c.section || '—'))];
  const anyConf = sel.some((c) => c.conf != null);
  return `<div class="selpanel multipanel">
    <button class="sp-close" data-act="multi" aria-label="Terminer">${ICON.close}</button>
    <div class="sp-head"><div><div class="sp-name">${sel.length} accord${sel.length > 1 ? 's' : ''}</div>
      <div class="muted small">${esc(names.slice(0, 8).join(' · '))}${names.length > 8 ? '…' : ''}${secs.length === 1 && secs[0] !== '—' ? ' · ' + esc(secs[0]) : ''}</div></div></div>
    <div class="row tight"><button class="btn small ghost" data-act="m-all">Tout</button><button class="btn small ghost" data-act="m-none">Aucun</button>${secs.length === 1 && secs[0] !== '—' ? `<button class="btn small ghost" data-act="m-sec">Toute la section</button>` : ''}</div>
    <label class="small muted">Durée ${beats.length === 1 ? `: <b>${beats[0]} temps</b>` : '(variable)'}</label>
    <div class="row tight">
      <div class="stepper"><button data-act="m-dur" data-d="-1">−</button><span>chacun</span><button data-act="m-dur" data-d="1">+</button></div>
      <div class="quick">${[0.5, 1, 2, 4].filter((m) => Number.isInteger(b * m)).map((m) => `<button class="${beats.length === 1 && beats[0] === b * m ? 'on' : ''}" data-act="m-dur-set" data-v="${b * m}">${m === 0.5 ? '½' : m} mes.</button>`).join('')}</div>
    </div>
    <div class="row tight"><span class="small muted">Transposer</span><button class="btn small" data-act="m-trans" data-d="-1">−½ ton</button><button class="btn small" data-act="m-trans" data-d="1">+½ ton</button></div>
    <div class="sp-actions wrap">
      <button class="btn" data-act="m-replace">Remplacer l’accord</button>
      <button class="btn" data-act="m-section">Section…</button>
      ${anyConf ? `<button class="btn" data-act="m-verify">${ICON.check}<span>Vérifiés</span></button>` : ''}
      <button class="btn" data-act="m-dup">Dupliquer</button>
      <button class="btn danger" data-act="m-del">Supprimer</button>
    </div>
  </div>`;
}

// garde l'accord sélectionné visible au-dessus du panneau (téléphone)
function keepSelVisible() {
  requestAnimationFrame(() => {
    const blk = $('.timeline .blk.sel');
    const panel = $('.compo-side .selpanel');
    if (!blk || !panel || getComputedStyle($('.compo-side')).position !== 'fixed') return;
    const r = blk.getBoundingClientRect();
    const top = panel.getBoundingClientRect().top;
    if (r.bottom > top - 10) window.scrollBy({ top: r.bottom - top + 24, behavior: 'smooth' });
    else if (r.top < 70) window.scrollBy({ top: r.top - 90, behavior: 'smooth' });
  });
}
function updateEditorPlay() {
  const e = S.play;
  $$('.timeline .blk[data-i]').forEach((el) => {
    const i = Number(el.dataset.i);
    const on = e && !e.countIn && e.chordIdx === i;
    el.classList.toggle('playing', !!on);
    const bar = $('.blk-prog', el);
    if (bar) bar.style.width = on ? `${((e.beatInChord + 1) / e.chordBeats) * 100}%` : '0';
    if (on && !el.dataset.seen) {
      el.dataset.seen = 1;
      const r = el.getBoundingClientRect();
      if (r.bottom > innerHeight - 90 || r.top < 60) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (!on) delete el.dataset.seen;
  });
}

// --- glisser-déposer (appui long)
let suppressClick = false;
function setupDrag() {
  let timer = null,
    drag = null,
    startX = 0,
    startY = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  document.addEventListener(
    'pointerdown',
    (e) => {
      const blk = e.target.closest('.timeline .blk[data-i]');
      if (!blk || S.tab !== 'compo' || S.live || S.multi) return;
      startX = e.clientX;
      startY = e.clientY;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        const r = blk.getBoundingClientRect();
        const ghost = blk.cloneNode(true);
        ghost.classList.add('ghost');
        ghost.style.width = r.width + 'px';
        ghost.style.height = r.height + 'px';
        document.body.appendChild(ghost);
        blk.classList.add('dragging');
        drag = { from: Number(blk.dataset.i), ghost, dx: startX - r.left, dy: startY - r.top, to: Number(blk.dataset.i) };
        moveGhost(startX, startY);
        if (navigator.vibrate) navigator.vibrate(15);
      }, 380);
    },
    { passive: true }
  );
  const moveGhost = (x, y) => {
    drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) scale(1.06)`;
    const blks = $$('.timeline .blk[data-i]');
    let best = null;
    blks.forEach((b) => {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2,
        cy = r.top + r.height / 2;
      const d = Math.hypot((x - cx) * 0.7, y - cy);
      if (!best || d < best.d) best = { d, i: Number(b.dataset.i), after: x > cx };
    });
    blks.forEach((b) => b.classList.remove('ins-before', 'ins-after'));
    if (best) {
      let to = best.i + (best.after ? 1 : 0);
      blks[best.i].classList.add(best.after ? 'ins-after' : 'ins-before');
      if (to > drag.from) to--;
      drag.to = to;
    }
  };
  document.addEventListener(
    'pointermove',
    (e) => {
      if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) cancel();
      if (drag) moveGhost(e.clientX, e.clientY);
    },
    { passive: true }
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (drag) e.preventDefault();
    },
    { passive: false }
  );
  const end = () => {
    cancel();
    if (!drag) return;
    const { from, to, ghost } = drag;
    ghost.remove();
    drag = null;
    const p = prog();
    if (p && to !== from) {
      const [c] = p.chords.splice(from, 1);
      p.chords.splice(to, 0, c);
      S.sel = to;
      touch(p);
    }
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 50);
    refresh();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.timeline')) e.preventDefault();
  });
}

// --- feuilles de réglage du morceau
function tempoSheet() {
  const p = prog();
  let taps = [];
  const sh = openSheet(
    () => `<h2>Tempo</h2>
    <div class="tempo-big"><button data-act="tempo" data-d="-5">−5</button><button data-act="tempo" data-d="-1">−</button><b>${p.tempo}</b><button data-act="tempo" data-d="1">+</button><button data-act="tempo" data-d="5">+5</button></div>
    <input type="range" min="30" max="260" value="${p.tempo}" data-input="tempo-range" class="range">
    <button class="btn wide" id="tap">Tap tempo (tape en rythme)</button>
    <p class="muted small">${p.sig[1] === 8 ? 'En x/8, le tempo compte les croches.' : 'Le tempo compte les noires.'}</p>`
  );
  sh.after = () => {
    const tap = $('#tap');
    if (!tap) return;
    tap.onpointerdown = () => {
      const now = performance.now();
      taps = taps.filter((t) => now - t < 2500);
      taps.push(now);
      if (taps.length >= 2) {
        const iv = [];
        for (let i = 1; i < taps.length; i++) iv.push(taps[i] - taps[i - 1]);
        const avg = iv.slice(-4).reduce((a, b) => a + b, 0) / Math.min(iv.length, 4);
        setTempo(Math.round(60000 / avg));
      }
    };
  };
  sh.after();
}
function setTempo(v) {
  const p = prog();
  p.tempo = clamp(v, 30, 260);
  touch(p);
  renderSheet();
  refresh();
}
function sigSheet() {
  const p = prog();
  openSheet(
    () => `<h2>Signature rythmique</h2>
    <div class="grid4">${SIGS.map((s) => `<button class="opt ${s[0] === p.sig[0] && s[1] === p.sig[1] ? 'on' : ''}" data-act="sig" data-v="${s.join('/')}">${s.join('/')}</button>`).join('')}</div>
    <p class="muted small">Les durées des accords sont conservées en temps.</p>`
  );
}
function instSheet() {
  const p = prog();
  openSheet(
    () => `<h2>Instrument</h2>
    <div class="list">${INSTRUMENTS.map((i) => `<button class="${p.instrument === i.id ? 'on' : ''}" data-act="inst" data-v="${i.id}">${esc(i.label)}</button>`).join('')}</div>
    <h3>Accompagnement</h3>
    <div class="list">${PATTERNS.map((x) => `<button class="${p.pattern === x.id ? 'on' : ''}" data-act="pattern" data-v="${x.id}">${x.label} <small class="muted">${x.hint}</small></button>`).join('')}</div>`
  );
}
const tog = (k, label, on, act = 'tog') => `<button class="tog ${on ? 'on' : ''}" data-act="${act}" data-k="${k}"><span>${label}</span><i></i></button>`;
function progSettingsSheet() {
  const p = prog();
  openSheet(
    () => `<h2>Réglages du morceau</h2>
    <div class="toggles">
      ${tog('loop', 'Lecture en boucle', p.loop)}
      ${tog('metronome', 'Clic de métronome', p.metronome)}
      ${tog('bassRoot', 'Basse sur la fondamentale', p.bassRoot)}
      ${tog('countIn', 'Décompte d’une mesure (concert)', p.countIn)}
    </div>
    <div class="row"><button class="btn" data-act="tempo-sheet">Tempo : ${p.tempo}</button><button class="btn" data-act="sig-sheet">Mesure : ${p.sig.join('/')}</button></div>
    <div class="row"><button class="btn" data-act="inst-sheet">${esc(IMAP[p.instrument].label)}</button><button class="btn" data-act="capo-sheet">Capo : ${p.capo || 'aucun'}</button></div>
    <div class="row"><button class="btn" data-act="key-sheet">Gamme</button><button class="btn" data-act="m-export" data-id="${p.id}">Exporter</button></div>
    ${p.source ? `<p class="muted small">Importé ${p.source.audio ? 'avec l’audio « ' + esc(p.source.audio) + ' »' : 'sans audio'} le ${new Date(p.created).toLocaleDateString('fr-FR')}.</p>` : ''}`
  );
}
function capoSheet() {
  const p = prog();
  const sugg = suggestCapo(p.chords, gTun());
  openSheet(
    () => `<h2>Capodastre</h2>
    ${sugg.fret ? `<p>Suggestion : <b>capo ${sugg.fret}</b> — positions plus ouvertes et plus simples.</p>` : `<p class="muted">Pas de capo particulièrement utile pour cette grille.</p>`}
    <div class="grid4">${[0, 1, 2, 3, 4, 5, 6, 7].map((f) => `<button class="opt ${(p.capo || 0) === f ? 'on' : ''} ${sugg.fret === f && f ? 'hint' : ''}" data-act="capo" data-v="${f}">${f ? 'Capo ' + f : 'Aucun'}</button>`).join('')}</div>
    <p class="muted small">En concert, un bouton permet de basculer « avec / sans capo » si tu n'en as pas ce jour-là : les diagrammes se recalculent.</p>`
  );
}
function keySheet() {
  const p = prog();
  const { key, auto } = keyOf(p);
  const st = { tonic: key ? key.tonic : 'C', mode: key ? key.mode : 'major', acc: key && T.keyAccPref(key) === 'flat' ? 'b' : '#' };
  const sh = openSheet(() => {
    const cur = p.key;
    return `<h2>Gamme du morceau</h2>
    <p class="muted small">Sert à proposer en priorité les accords de la gamme. Rien n'est interdit : les accords hors gamme restent toujours disponibles.</p>
    <div class="tog-row"><button class="opt ${!cur ? 'on' : ''}" data-act="key-auto">Automatique${auto && key ? ' (' + T.keyName(key, N('editor')) + ')' : ''}</button></div>
    <h3>Tonique</h3>
    ${rootGrid(st.tonic, st.acc, 'key-tonic', null)}
    <h3>Mode</h3>
    <div class="grid3">${T.SCALES.map((s) => `<button class="opt ${cur && cur.mode === s.id ? 'on' : ''}" data-act="key-mode" data-v="${s.id}">${s.label}</button>`).join('')}</div>
    ${cur ? `<p class="small">Gamme choisie : <b>${T.keyName(cur, N('editor'))}</b> — ${T.scaleNotes(cur).map((n) => T.displayNote(n, N('editor'))).join(' ')}</p>` : ''}`;
  });
  sh.st = st;
}
function rootGrid(selected, acc, act, keyForHighlight) {
  const inKey = keyForHighlight ? new Set(T.SMAP[keyForHighlight.mode].steps.map((s) => T.mod12(T.pc(keyForHighlight.tonic) + s))) : null;
  const selPc = selected ? T.pc(selected) : -1;
  const cells = [];
  for (let p = 0; p < 12; p++) {
    let name = PC_NAME(p, acc);
    if (keyForHighlight && inKey.has(p)) name = T.spellInKey(p, keyForHighlight);
    if (p === selPc && selected) name = selected;
    cells.push(`<button class="root ${BLACK[p] ? 'blk2' : ''} ${p === selPc ? 'on' : ''} ${inKey && inKey.has(p) ? 'ink' : ''}" data-act="${act}" data-v="${name}">${T.displayNote(name, N('editor'))}</button>`);
  }
  return `<div class="roots">${cells.join('')}</div>
  <div class="accsw"><span class="small muted">touches noires :</span><button class="${acc === '#' ? 'on' : ''}" data-act="acc" data-v="#">♯</button><button class="${acc === 'b' ? 'on' : ''}" data-act="acc" data-v="b">♭</button></div>`;
}

// --- feuille d'ajout / édition d'accord
function chordSheet(editIndex = -1) {
  const p = prog();
  const { key } = keyOf(p);
  const ex = editIndex >= 0 ? p.chords[editIndex] : null;
  const prevSec = ex ? ex.section : S.sel >= 0 && p.chords[S.sel] ? p.chords[S.sel].section : p.chords.length ? p.chords[p.chords.length - 1].section : '';
  const cs = {
    editIndex,
    mode: ex ? ex.kind : 'std',
    root: ex && ex.kind === 'std' ? ex.root : key ? key.tonic : 'C',
    quality: ex && ex.kind === 'std' ? ex.quality : 'maj',
    bass: ex && ex.kind === 'std' ? ex.bass : null,
    notes: ex && ex.kind === 'custom' ? ex.notes.slice() : [],
    cbass: ex && ex.kind === 'custom' ? ex.bass : null,
    name: ex && ex.kind === 'custom' ? ex.name || '' : '',
    beats: ex ? ex.beats : bpb(p),
    section: prevSec || '',
    acc: key && T.keyAccPref(key) === 'flat' ? 'b' : '#',
    sevenths: false,
    otherBass: false,
  };
  if (!ex && key && ['minor', 'harmonic', 'dorian', 'phrygian'].includes(key.mode)) cs.quality = 'm';
  const sh = openSheet(() => renderChordSheet(cs), { tall: true });
  sh.cs = cs;
  sh.after = bindChordInputs;
  bindChordInputs();
}
function csChord(cs) {
  if (cs.mode === 'custom') {
    if (!cs.notes.length) return null;
    return { kind: 'custom', notes: cs.notes, bass: cs.cbass && cs.notes.includes(cs.cbass) ? cs.cbass : cs.notes[0], name: cs.name };
  }
  return { kind: 'std', root: cs.root, quality: cs.quality, bass: cs.bass };
}
function renderChordSheet(cs) {
  const p = prog();
  const { key, auto } = keyOf(p);
  const ch = csChord(cs);
  let body = '';
  if (cs.mode === 'std') {
    let suggest = '';
    if (key) {
      const dia = T.diatonicChords(key, cs.sevenths);
      const bor = T.borrowedChords(key);
      const chip = (d) => {
        const same = cs.root === d.chord.root && cs.quality === d.chord.quality && !cs.bass;
        return `<button class="dchip ${same ? 'on' : ''}" data-act="cs-pick" data-root="${d.chord.root}" data-q="${d.chord.quality}"><small>${d.roman}</small><b>${esc(cname(d.chord))}</b></button>`;
      };
      suggest = `<div class="sugg"><div class="sugg-head"><span>Dans la gamme : <b>${T.keyName(key, N('editor'))}</b>${auto ? ' <i class="muted">(suggérée)</i>' : ''}</span>
      <button class="mini ${cs.sevenths ? 'on' : ''}" data-act="cs-7">7e</button></div>
      <div class="dchips">${dia.map(chip).join('')}</div>
      <div class="sugg-head"><span class="muted small">Hors gamme fréquents</span></div>
      <div class="dchips">${bor.map(chip).join('')}</div></div>`;
    }
    const info = T.chordInfo({ kind: 'std', root: cs.root, quality: cs.quality, bass: null });
    const bassBtns = info.tones
      .filter((t) => t.pc !== info.rootPc)
      .map((t) => `<button class="opt ${cs.bass && T.pc(cs.bass) === t.pc ? 'on' : ''}" data-act="cs-bass" data-v="${t.name}">${T.displayNote(t.name, N('editor'))}<small> ${t.label}</small></button>`)
      .join('');
    body = `${suggest}
    <h3>Fondamentale</h3>
    ${rootGrid(cs.root, cs.acc, 'cs-root', key)}
    <h3>Qualité</h3>
    ${QGROUPS.map(([g, ids]) => `<div class="qgroup"><span class="small muted">${g}</span><div class="quals">${ids.map((id) => `<button class="q ${cs.quality === id ? 'on' : ''}" data-act="cs-q" data-v="${id}">${esc(T.displayNote(cs.root, N('editor')) + T.prettyAcc(T.QMAP[id].sym))}</button>`).join('')}</div></div>`).join('')}
    <h3>Basse / renversement</h3>
    <div class="quals"><button class="opt ${!cs.bass ? 'on' : ''}" data-act="cs-bass" data-v="">Fondamentale</button>${bassBtns}<button class="opt ${cs.otherBass ? 'on' : ''}" data-act="cs-otherbass">Autre…</button></div>
    ${cs.otherBass ? `<div class="roots compact">${Array.from({ length: 12 }, (_, i) => PC_NAME(i, cs.acc)).map((n) => `<button class="root ${cs.bass && T.pc(cs.bass) === T.pc(n) ? 'on' : ''}" data-act="cs-bass" data-v="${n}">${T.displayNote(n, N('editor'))}</button>`).join('')}</div>` : ''}`;
  } else {
    const rec = cs.notes.length >= 2 ? T.recognize(cs.notes, cs.cbass || cs.notes[0]) : null;
    body = `<p class="muted small">Touche les notes de ton accord (ordre libre), puis choisis la note de basse.</p>
    ${keyboard(cs)}
    <div class="accsw"><span class="small muted">touches noires :</span><button class="${cs.acc === '#' ? 'on' : ''}" data-act="acc" data-v="#">♯</button><button class="${cs.acc === 'b' ? 'on' : ''}" data-act="acc" data-v="b">♭</button></div>
    ${cs.notes.length ? `<h3>Basse</h3><div class="quals">${cs.notes.map((n) => `<button class="opt ${(cs.cbass || cs.notes[0]) === n ? 'on' : ''}" data-act="cs-cbass" data-v="${n}">${T.displayNote(n, N('editor'))}</button>`).join('')}</div>` : ''}
    <p class="small">${cs.notes.length < 2 ? '' : rec ? `Reconnu : <b>${esc(T.chordName({ kind: 'std', ...rec }, N('editor')))}</b>` : 'Accord non répertorié — tu peux lui donner un nom :'}</p>
    <input class="txt" id="cs-name" placeholder="Nom personnalisé (facultatif)" value="${esc(cs.name)}" maxlength="30">`;
  }
  const b = bpb(p);
  const secs = [...new Set(p.chords.map((c) => c.section).filter(Boolean))];
  return `<div class="cs-head">
      <div class="seg"><button class="${cs.mode === 'std' ? 'on' : ''}" data-act="cs-mode" data-v="std">Répertoire</button><button class="${cs.mode === 'custom' ? 'on' : ''}" data-act="cs-mode" data-v="custom">Notes</button></div>
    </div>
    <div class="cs-preview">
      ${ch ? `<div class="cs-pv-name">${esc(cname(ch))}</div>${diagramBlock(ch, p, { small: true, notation: 'editor' })}<button class="icon" data-act="cs-listen" aria-label="Écouter">${ICON.speaker}</button>` : '<div class="muted">Choisis des notes</div>'}
    </div>
    ${body}
    ${cs.multi ? `<p class="muted small">Remplace les ${cs.multi} accords sélectionnés ; leurs durées et sections sont conservées.</p>` : `<h3>Durée</h3>
    <div class="row"><div class="stepper"><button data-act="cs-dur" data-d="-1">−</button><span><b>${cs.beats}</b> temps</span><button data-act="cs-dur" data-d="1">+</button></div>
    <div class="quick">${[1, 2, 4].map((m) => `<button class="${cs.beats === b * m ? 'on' : ''}" data-act="cs-dur-set" data-v="${b * m}">${m} mes.</button>`).join('')}</div></div>
    <h3>Section <small class="muted">(facultatif)</small></h3>
    <input class="txt" id="cs-section" list="sec-list" placeholder="Couplet, Refrain…" value="${esc(cs.section)}" maxlength="40">
    <datalist id="sec-list">${[...new Set([...secs, 'Intro', 'Couplet', 'Pré-refrain', 'Refrain', 'Pont', 'Solo', 'Outro'])].map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`}
    <div class="cs-foot"><button class="btn ghost" data-act="sheet-close">Annuler</button><button class="btn primary" data-act="cs-ok" ${ch ? '' : 'disabled'}>${cs.multi ? 'Remplacer' : cs.editIndex >= 0 ? 'Valider' : 'Ajouter'}</button></div>`;
}
function keyboard(cs) {
  const sel = new Set(cs.notes.map(T.pc));
  const whites = WHITE.map((n, i) => `<button class="wk ${sel.has(T.pc(n)) ? 'on' : ''}" data-act="cs-note" data-v="${n}" style="--i:${i}"><span>${T.displayNote(n, N('editor'))}</span></button>`).join('');
  const pos = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
  const blacks = Object.keys(BLACK)
    .map((p) => {
      const name = PC_NAME(Number(p), cs.acc);
      return `<button class="bk ${sel.has(Number(p)) ? 'on' : ''}" data-act="cs-note" data-v="${name}" style="--i:${pos[p]}"><span>${T.displayNote(name, N('editor'))}</span></button>`;
    })
    .join('');
  return `<div class="kbd">${whites}${blacks}</div>`;
}
function bindChordInputs() {
  const sh = currentSheet();
  if (!sh || !sh.cs) return;
  const inp = $('#cs-name');
  if (inp) {
    inp.oninput = () => {
      sh.cs.name = inp.value;
      const n = $('.cs-pv-name');
      const ch = csChord(sh.cs);
      if (n && ch) n.textContent = cname(ch);
    };
  }
  const sec = $('#cs-section');
  if (sec) sec.oninput = () => (sh.cs.section = sec.value);
}
function commitChord() {
  const cs = currentSheet().cs;
  const p = prog();
  const ch = csChord(cs);
  if (!ch) return;
  const section = cs.section.trim() || undefined;
  if (cs.multi) {
    p.chords = p.chords.map((c) => (S.multi.has(c.id) ? { ...ch, id: c.id, beats: c.beats, section: c.section, voicing: {} } : c));
  } else if (cs.editIndex >= 0) {
    const old = p.chords[cs.editIndex];
    const same = JSON.stringify([old.kind, old.root, old.quality, old.bass, old.notes]) === JSON.stringify([ch.kind, ch.root, ch.quality, ch.bass, ch.notes]);
    p.chords[cs.editIndex] = { ...ch, id: old.id, beats: cs.beats, voicing: same ? old.voicing : {}, section };
    S.sel = cs.editIndex;
  } else {
    const at = S.sel >= 0 ? S.sel + 1 : p.chords.length;
    p.chords.splice(at, 0, { ...ch, id: uid(), beats: cs.beats, voicing: {}, section });
    S.sel = at;
  }
  touch(p);
  closeSheet();
  refresh();
  requestAnimationFrame(() => {
    const el = $('.timeline .blk.sel');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

// ---------------------------------------------------------------- concert : préparation
function viewConcertSetup() {
  const p = prog();
  const c = S.settings.concert;
  const list = S.progs.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const sugg = p ? suggestCapo(p.chords, gTun()) : { fret: 0 };
  const capoTarget = p ? p.capo || sugg.fret : 0;
  return `<div class="page concert-setup">
  <header class="bar"><h1>Concert</h1></header>
  <div class="cs-grid">
  <section class="panel">
    <h3>Morceau</h3>
    ${
      list.length
        ? `<select class="songsel" data-change="concert-song"><option value="" ${p ? '' : 'selected'} disabled>Choisir un morceau…</option>${list
            .map((x) => `<option value="${x.id}" ${p && x.id === p.id ? 'selected' : ''}>${esc(x.name)}${isImported(x) ? ' (importé)' : ''}</option>`)
            .join('')}</select>`
        : `<p class="muted">Aucune progression : crée-en une dans Compo ou importe un morceau dans Galerie.</p>`
    }
    ${
      p
        ? `<div class="song-sum">
        <div class="ss-chords">${esc([...new Set(p.chords.map((x) => cname(x, 'guitar')))].join('  '))}</div>
        <div class="muted small">${p.tempo} bpm · ${p.sig.join('/')} · ${p.chords.length} accords · ${fmtDur(p)}${toVerify(p) ? ` · <span class="warn-t">${toVerify(p)} accord(s) à vérifier</span>` : ''}</div>
      </div>
      <div class="toggles">
        ${tog('countIn', 'Décompte d’une mesure', p.countIn)}
        ${tog('loop', 'Boucle', p.loop)}
        ${tog('metronome', 'Clic de métronome', p.metronome)}
        ${capoTarget ? tog('capoUse', `Capo ${capoTarget}${p.capo ? '' : ' (conseillé)'}`, !!capoOf(p), 'capo-use') : ''}
      </div>`
        : ''
    }
  </section>
  <section class="panel">
    <h3>Affichage</h3>
    <div class="presets">${Object.entries(CONCERT_PRESETS)
      .map(([k, v]) => `<button class="opt ${c.preset === k ? 'on' : ''}" data-act="c-preset" data-v="${k}">${v.label}</button>`)
      .join('')}<button class="opt ${c.preset === 'custom' ? 'on' : ''}" data-act="c-custom">Sur mesure</button></div>
    <div class="toggles ${c.preset === 'custom' ? '' : 'compact'}">
      <div class="tg-title">Accord en cours</div>
      ${tog('guitar', 'Diagramme guitare', c.guitar, 'c-tog')}
      ${tog('bass', 'Manche de basse', c.bass, 'c-tog')}
      ${c.bass ? tog('shortNeck', 'Manche court (cases 0 à 7, plus gros)', c.shortNeck, 'c-tog') + tog('nextRootMark', 'Repère vert : basse de l’accord suivant', c.nextRootMark, 'c-tog') : ''}
      <div class="tg-title">Accord suivant</div>
      ${tog('next', 'Afficher l’accord suivant', c.next, 'c-tog')}
      ${c.next ? tog('nextGuitar', 'Diagramme guitare (suivant)', c.nextGuitar, 'c-tog') + tog('nextBass', 'Manche de basse (suivant)', c.nextBass, 'c-tog') : ''}
      <div class="tg-title">Repères</div>
      ${tog('pulse', 'Pulsation (temps qui s’allument)', c.pulse, 'c-tog')}
      ${tog('tempo', 'Tempo affiché', c.tempo, 'c-tog')}
      ${tog('section', 'Nom de la section', c.section, 'c-tog')}
    </div>
  </section>
  </div>
  <div class="fab-row"><button class="btn primary big" data-act="go-live" ${p && p.chords.length ? '' : 'disabled'}>${ICON.stage}<span>Lancer le concert</span></button></div>
</div>`;
}

// ---------------------------------------------------------------- concert : scène
let wake = null;
async function keepAwake(on) {
  try {
    if (on) {
      if (!wake && 'wakeLock' in navigator) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => (wake = null));
      }
    } else if (wake) {
      await wake.release();
      wake = null;
    }
  } catch (e) {
    console.warn('wake lock', e);
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.live) keepAwake(true);
});
function goLive() {
  const p = prog();
  if (!p || !p.chords.length) return;
  S.live = true;
  S.concertIdx = clamp(S.concertIdx, 0, p.chords.length - 1);
  document.body.classList.add('in-concert');
  keepAwake(true);
  $('#view').innerHTML = '';
  renderConcert();
}
function exitLive(silent) {
  if (player.playing) player.stop();
  S.live = false;
  document.body.classList.remove('in-concert');
  $('#live').innerHTML = '';
  keepAwake(false);
  if (!silent) render();
}
function concertIdx() {
  const p = prog();
  if (S.play && S.play.chordIdx != null) return S.play.chordIdx;
  return clamp(S.concertIdx, 0, Math.max(0, p.chords.length - 1));
}
function liveLayout(c, wide) {
  const B = c.bass,
    Nx = c.next,
    NB = c.next && c.nextBass;
  let areas, cols, rows;
  const short = innerHeight < 600;
  if (wide && short && B) {
    // paysage sur téléphone : trois colonnes, la basse à droite
    if (Nx) {
      areas = NB ? "'cur next bass' 'cur next nbass'" : "'cur next bass'";
      cols = c.guitar || c.nextGuitar ? '1fr .75fr 1.5fr' : '.8fr .6fr 2fr';
      rows = NB ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)';
    } else {
      areas = "'cur bass'";
      cols = '1fr 1.6fr';
      rows = 'minmax(0,1fr)';
    }
  } else if (wide) {
    if (B && Nx) {
      areas = NB ? "'cur next' 'bass nbass'" : "'cur next' 'bass bass'";
      cols = NB ? '1.4fr 1fr' : '1.5fr 1fr';
      rows = 'minmax(0,1fr) auto';
    } else if (B) {
      areas = "'cur bass'";
      cols = '1fr 1.4fr';
      rows = 'minmax(0,1fr)';
    } else if (Nx) {
      areas = "'cur next'";
      cols = '1.5fr 1fr';
      rows = 'minmax(0,1fr)';
    } else {
      areas = "'cur'";
      cols = '1fr';
      rows = 'minmax(0,1fr)';
    }
  } else {
    const r = [Nx ? "'cur next'" : "'cur cur'"];
    const rr = ['minmax(130px,1fr)'];
    if (B) {
      r.push("'bass bass'");
      rr.push('auto');
    }
    if (NB) {
      r.push("'nbass nbass'");
      rr.push('auto');
    }
    areas = r.join(' ');
    cols = Nx ? '1.35fr 1fr' : '1fr 0';
    rows = rr.join(' ');
  }
  return `grid-template-areas:${areas};grid-template-columns:${cols};grid-template-rows:${rows}`;
}
function bassBlock(ch, compact, next) {
  const info = T.chordInfo(ch);
  const c = S.settings.concert;
  let nextRoot = null;
  if (next && !compact && c.nextRootMark) {
    const ni = T.chordInfo(next);
    nextRoot = { pc: ni.bassPc, name: ni.bassName };
  }
  const notes = info.tones.map((t) => `<span class="${t.pc === info.rootPc ? 'r' : ''}">${T.displayNote(t.name, N('bass'))}</span>`).join('');
  return `<div class="b-head"><span class="b-notes">${notes}</span>${info.bassPc !== info.rootPc ? `<span class="b-slash">basse : ${T.displayNote(info.bassName, N('bass'))}</span>` : ''}
    ${compact ? '' : `<button class="mini" data-act="bass-labels">${S.settings.bassLabels === 'notes' ? 'notes' : 'degrés'}</button>`}</div>
    ${bassNeck({ tones: info.tones, rootPc: info.rootPc, bassPc: info.bassPc, tuning: bTun(), notation: N('bass'), labels: S.settings.bassLabels, frets: c.shortNeck ? 7 : 12, nextRoot })}
    ${nextRoot && nextRoot.pc !== info.rootPc ? `<div class="b-legend"><i></i>basse suivante : ${T.displayNote(nextRoot.name, N('bass'))}</div>` : ''}`;
}
function renderConcert() {
  const p = prog();
  const el = $('#live');
  if (!el || !p) return;
  const c = S.settings.concert;
  const idx = concertIdx();
  const ch = p.chords[idx];
  const nextIdx = idx + 1 < p.chords.length ? idx + 1 : p.loop ? 0 : -1;
  const nx = nextIdx >= 0 && p.chords.length > 1 ? p.chords[nextIdx] : null;
  const b = bpb(p);
  const wide = innerWidth > innerHeight * 1.15 || innerWidth >= 1000;
  const sugg = suggestCapo(p.chords, gTun());
  const capoTarget = p.capo || sugg.fret;
  const showGuitarStuff = c.guitar || (c.next && c.nextGuitar);
  const capoBtn = capoTarget && showGuitarStuff ? `<button class="cbtn ${capoOf(p) ? 'on' : ''}" data-act="capo-toggle">${capoOf(p) ? `Capo ${capoOf(p)}` : `Sans capo`}</button>` : '';
  const namesOnly = !c.guitar && !c.bass;
  el.innerHTML = `<div class="concert ${namesOnly ? 'names-only' : ''} ${wide ? 'wide' : 'tall'} ${c.bass && c.next && c.nextBass ? 'two-necks' : ''}">
    <header class="c-top">
      <button class="cbtn icon" data-act="concert-exit" aria-label="Quitter">${ICON.close}</button>
      ${c.tempo ? `<div class="c-tempo"><b>${p.tempo}</b><small>bpm · ${p.sig.join('/')}</small></div>` : ''}
      ${c.pulse ? `<div class="c-beats" style="--n:${b}">${Array.from({ length: b }, (_, i) => `<i class="${i === 0 ? 'one' : accents(p).includes(i) ? 'acc' : ''}"></i>`).join('')}</div>` : '<div class="flex1"></div>'}
      ${c.section && ch && ch.section ? `<div class="c-sec">${esc(ch.section)}</div>` : ''}
      ${capoBtn}
    </header>
    <main class="c-stage" style="${liveLayout(c, wide)}">
      <section class="c-cur">
        ${ch ? `<div class="c-name">${esc(cname(ch, 'guitar'))}</div>
        <div class="c-left">${Array.from({ length: Math.min(ch.beats, 16) }, () => '<i></i>').join('')}</div>
        ${c.guitar ? diagramBlock(ch, p, { notation: 'guitar' }) : ''}` : '<div class="muted">Grille vide</div>'}
      </section>
      ${
        c.next
          ? `<section class="c-next">${
              nx
                ? `<div class="lbl">ensuite${nextIdx === 0 && idx !== 0 ? ' (début)' : ''}${c.section && nx.section && nx.section !== (ch && ch.section) ? ' · ' + esc(nx.section) : ''}</div><div class="n-name">${esc(cname(nx, 'guitar'))}</div>${c.nextGuitar ? diagramBlock(nx, p, { small: true, notation: 'guitar' }) : ''}`
                : `<div class="lbl">fin</div>`
            }</section>`
          : ''
      }
      ${c.bass && ch ? `<section class="c-bass">${bassBlock(ch, false, nx)}</section>` : ''}
      ${c.next && c.nextBass && nx ? `<section class="c-nbass"><div class="lbl">basse · ensuite</div>${bassBlock(nx, true)}</section>` : ''}
    </main>
    <footer class="c-ctrl">
      <button class="cbtn" data-act="c-step" data-d="-1" aria-label="Précédent" ${player.playing ? 'disabled' : ''}>${ICON.prev}</button>
      <button class="play big" data-act="c-play" aria-label="Lecture">${player.playing ? ICON.stop : ICON.play}</button>
      <button class="cbtn" data-act="c-step" data-d="1" aria-label="Suivant" ${player.playing ? 'disabled' : ''}>${ICON.next}</button>
      <button class="cbtn ${p.loop ? 'on' : ''}" data-act="loop" aria-label="Boucle">${ICON.loop}</button>
      <span class="c-pos">${p.chords.length ? `${idx + 1}/${p.chords.length}` : ''}</span>
    </footer>
  </div>`;
  el.dataset.idx = idx;
  if (S.play) paintBeat(S.play);
}
function paintBeat(e) {
  $$('#live .c-beats i').forEach((d, i) => d.classList.toggle('lit', i === e.beatInBar));
  const c = $('#live .concert');
  if (!c) return;
  c.classList.toggle('count', !!e.countIn);
  const pulse = $('#live .c-beats');
  if (pulse) {
    pulse.classList.remove('pulse');
    void pulse.offsetWidth;
    pulse.classList.add('pulse');
  }
  const cn = $('#live .c-name');
  if (e.countIn) {
    if (cn) cn.dataset.count = e.countIn;
  } else {
    if (cn) delete cn.dataset.count;
    $$('#live .c-left i').forEach((d, i) => d.classList.toggle('done', i <= e.beatInChord));
  }
}
function updateConcertBeat(e) {
  const el = $('#live');
  if (!el) return;
  if (!e.countIn && String(e.chordIdx) !== el.dataset.idx) {
    S.concertIdx = e.chordIdx;
    renderConcert();
  } else paintBeat(e);
}
let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => S.live && renderConcert(), 120);
});

// ---------------------------------------------------------------- actions
function importMenu() {
  openSheet(
    () => `<h2>Importer</h2>
    <div class="menu">
      <button data-act="import-song"><b>Un morceau</b><br><small class="muted">Grille (texte ou PDF Ultimate Guitar) + fichier audio facultatif pour retrouver le rythme</small></button>
      <button data-act="import-file"><b>Un fichier de sauvegarde</b><br><small class="muted">Fichier .json exporté depuis l'app (une progression ou toute la galerie)</small></button>
    </div>`
  );
}
const A = {
  'sheet-close': () => closeSheet(),
  tab: (el) => {
    if (S.tab === el.dataset.tab && el.dataset.tab === 'gallery' && S.importing) resetImport();
    setTab(el.dataset.tab);
  },
  settings: settingsSheet,
  'set-not': (el) => {
    S.settings.notation[el.dataset.area] = el.dataset.v;
    saveSettings();
    renderSheet();
    refresh();
  },
  new: async () => {
    const name = await askText('Nouvelle progression', '', { placeholder: 'Nom du morceau', ok: 'Créer' });
    if (name === null) return;
    const p = newProg(name || 'Nouvelle progression');
    S.progs.push(p);
    touch(p);
    S.cur = p.id;
    S.sel = -1;
    setTab('compo');
  },
  open: (el) => {
    S.multi = null;
    S.cur = el.dataset.id;
    S.sel = -1;
    setTab('compo');
  },
  gfilter: (el) => {
    S.gfilter = el.dataset.v;
    render();
  },
  'card-menu': (el, e) => {
    e.stopPropagation();
    cardMenu(el.dataset.id);
  },
  'm-open': (el) => {
    closeSheet(true);
    A.open(el);
  },
  'm-concert': (el) => {
    closeSheet(true);
    S.cur = el.dataset.id;
    S.concertIdx = 0;
    setTab('concert');
  },
  'm-rename': (el) => {
    closeSheet(true);
    renameProg(el.dataset.id);
  },
  'm-dup': (el) => {
    closeSheet();
    dupProg(el.dataset.id);
  },
  'm-move': (el) => {
    closeSheet();
    const p = S.progs.find((x) => x.id === el.dataset.id);
    p.origin = isImported(p) ? 'compo' : 'import';
    touch(p);
    refresh();
    toast(isImported(p) ? 'Rangé dans « Importés »' : 'Rangé dans « Mes compos »');
  },
  'm-export': (el) => {
    closeSheet();
    exportProg(el.dataset.id);
  },
  'm-delete': (el) => {
    closeSheet(true);
    deleteProg(el.dataset.id);
  },
  backup: () => {
    closeSheet();
    backupAll();
  },
  'import-menu': importMenu,
  'import-file': () => {
    closeSheet();
    importFile();
  },
  'import-song': () => {
    closeSheet(true);
    resetImport(true);
    if (S.tab !== 'gallery') setTab('gallery');
    else render();
  },
  'close-cur': () => {
    S.multi = null;
    if (player.playing) player.stop();
    S.cur = null;
    S.sel = -1;
    render();
  },
  'rename-cur': () => renameProg(S.cur),
  play: () => togglePlay(S.sel >= 0 ? S.sel : 0, false),
  loop: () => {
    const p = prog();
    p.loop = !p.loop;
    touch(p);
    if (S.live) renderConcert();
    else refresh();
  },
  'tempo-sheet': tempoSheet,
  tempo: (el) => setTempo(prog().tempo + Number(el.dataset.d)),
  'sig-sheet': sigSheet,
  sig: (el) => {
    const p = prog();
    p.sig = el.dataset.v.split('/').map(Number);
    touch(p);
    renderSheet();
    refresh();
  },
  'inst-sheet': instSheet,
  inst: (el) => {
    const p = prog();
    p.instrument = el.dataset.v;
    touch(p);
    renderSheet();
    refresh();
    unlock();
    loadSamples(IMAP[p.instrument].dir)
      .then(() => p.chords[0] && preview(p.chords[S.sel >= 0 ? S.sel : 0]))
      .catch((e) => toast(e.message));
  },
  pattern: (el) => {
    const p = prog();
    p.pattern = el.dataset.v;
    touch(p);
    renderSheet();
  },
  'prog-settings': progSettingsSheet,
  tog: (el) => {
    const p = prog();
    p[el.dataset.k] = !p[el.dataset.k];
    touch(p);
    renderSheet();
    refresh();
  },
  'capo-sheet': capoSheet,
  capo: (el) => {
    const p = prog();
    p.capo = Number(el.dataset.v);
    p.capoOff = false;
    touch(p);
    renderSheet();
    refresh();
  },
  'capo-use': () => {
    const p = prog();
    if (!p.capo) {
      p.capo = suggestCapo(p.chords, gTun()).fret;
      p.capoOff = false;
    } else p.capoOff = !p.capoOff;
    touch(p);
    refresh();
  },
  'capo-toggle': () => {
    A['capo-use']();
    const p = prog();
    renderConcert();
    toast(capoOf(p) ? `Capo ${capoOf(p)} : diagrammes transposés` : 'Sans capo : diagrammes en position réelle');
  },
  'key-sheet': keySheet,
  'key-auto': () => {
    const p = prog();
    p.key = null;
    touch(p);
    renderSheet();
    refresh();
  },
  'key-tonic': (el) => {
    const p = prog();
    const st = currentSheet().st;
    st.tonic = el.dataset.v;
    p.key = { tonic: st.tonic, mode: p.key ? p.key.mode : st.mode };
    touch(p);
    renderSheet();
    refresh();
  },
  'key-mode': (el) => {
    const p = prog();
    const st = currentSheet().st;
    p.key = { tonic: p.key ? p.key.tonic : st.tonic, mode: el.dataset.v };
    touch(p);
    renderSheet();
    refresh();
  },
  acc: (el) => {
    const sh = currentSheet();
    if (sh.cs) sh.cs.acc = el.dataset.v;
    else if (sh.st) sh.st.acc = el.dataset.v;
    renderSheet();
  },
  // concert
  'c-preset': (el) => {
    const c = S.settings.concert;
    Object.assign(c, CONCERT_PRESETS[el.dataset.v], { preset: el.dataset.v });
    delete c.label;
    saveSettings();
    refresh();
  },
  'c-custom': () => {
    S.settings.concert.preset = 'custom';
    saveSettings();
    refresh();
  },
  'c-tog': (el) => {
    const c = S.settings.concert;
    c[el.dataset.k] = !c[el.dataset.k];
    const match = Object.entries(CONCERT_PRESETS).find(([, v]) => ['guitar', 'bass', 'next', 'nextGuitar', 'nextBass'].every((k) => !!v[k] === !!c[k]));
    c.preset = match ? match[0] : 'custom';
    saveSettings();
    refresh();
  },
  'go-live': goLive,
  'concert-exit': () => exitLive(),
  'c-play': async () => {
    const p = prog();
    if (player.playing) {
      player.stop();
      renderConcert();
      return;
    }
    await togglePlay(concertIdx(), p.countIn);
    renderConcert();
  },
  'c-step': (el) => {
    const p = prog();
    if (!p.chords.length) return;
    S.concertIdx = (((concertIdx() + Number(el.dataset.d)) % p.chords.length) + p.chords.length) % p.chords.length;
    renderConcert();
  },
  'bass-labels': () => {
    S.settings.bassLabels = S.settings.bassLabels === 'notes' ? 'degrees' : 'notes';
    saveSettings();
    renderConcert();
  },
  // compo
  multi: () => {
    S.multi = S.multi ? null : new Set(S.sel >= 0 && prog().chords[S.sel] ? [prog().chords[S.sel].id] : []);
    S.sel = -1;
    S.lastMulti = null;
    refresh();
  },
  'm-all': () => {
    S.multi = new Set(prog().chords.map((c) => c.id));
    refresh();
  },
  'm-none': () => {
    S.multi = new Set();
    refresh();
  },
  'm-sec': () => {
    const p = prog();
    const sec = selected(p)[0].section;
    p.chords.forEach((c) => c.section === sec && S.multi.add(c.id));
    refresh();
  },
  'm-dur': (el) => {
    const p = prog();
    selected(p).forEach((c) => (c.beats = clamp(c.beats + Number(el.dataset.d), 1, 128)));
    touch(p);
    refresh();
  },
  'm-dur-set': (el) => {
    const p = prog();
    selected(p).forEach((c) => (c.beats = Number(el.dataset.v)));
    touch(p);
    refresh();
  },
  'm-trans': (el) => {
    const p = prog();
    const d = Number(el.dataset.d);
    p.chords = p.chords.map((c) => (S.multi.has(c.id) ? { ...T.transposeChord(c, d), voicing: {} } : c));
    touch(p);
    refresh();
  },
  'm-replace': () => {
    const p = prog();
    const first = p.chords.findIndex((c) => S.multi.has(c.id));
    chordSheet(first);
    const cs = currentSheet().cs;
    cs.editIndex = -1;
    cs.multi = S.multi.size;
    renderSheet();
  },
  'm-section': async () => {
    const p = prog();
    const secs = [...new Set(selected(p).map((c) => c.section).filter(Boolean))];
    const v = await askText('Section des accords sélectionnés', secs.length === 1 ? secs[0] : '', { placeholder: 'Couplet, Refrain… (vide = aucune)' });
    if (v === null) return;
    selected(p).forEach((c) => (v ? (c.section = v) : delete c.section));
    touch(p);
    refresh();
  },
  'm-verify': () => {
    const p = prog();
    selected(p).forEach((c) => delete c.conf);
    touch(p);
    refresh();
  },
  'm-dup': () => {
    const p = prog();
    const sel = selected(p);
    const last = p.chords.reduce((a, c, i) => (S.multi.has(c.id) ? i : a), -1);
    const copies = sel.map((c) => ({ ...structuredClone(c), id: uid() }));
    p.chords.splice(last + 1, 0, ...copies);
    S.multi = new Set(copies.map((c) => c.id));
    touch(p);
    refresh();
    toast(`${copies.length} accord(s) dupliqué(s) — la copie est sélectionnée`);
  },
  'm-del': () => {
    const p = prog();
    const before = structuredClone(p.chords);
    const n = S.multi.size;
    const ids = new Set(S.multi);
    p.chords = p.chords.filter((c) => !S.multi.has(c.id));
    S.multi = new Set();
    touch(p);
    refresh();
    undoToast(`${n} accord${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}`, () => {
      p.chords = before;
      S.multi = ids;
      touch(p);
      refresh();
    });
  },
  'sel-close': () => {
    S.sel = -1;
    refresh();
  },
  sel: (el, e) => {
    if (suppressClick) return;
    const i = Number(el.dataset.i);
    if (S.multi) {
      const p = prog();
      const id = p.chords[i].id;
      if (e && e.shiftKey && S.lastMulti != null) {
        const [a, z] = [Math.min(S.lastMulti, i), Math.max(S.lastMulti, i)];
        for (let k = a; k <= z; k++) S.multi.add(p.chords[k].id);
      } else if (S.multi.has(id)) S.multi.delete(id);
      else S.multi.add(id);
      S.lastMulti = i;
      refresh();
      return;
    }
    S.sel = S.sel === i ? -1 : i;
    refresh();
    keepSelVisible();
    if (S.sel >= 0 && !player.playing) preview(prog().chords[i]);
  },
  'sec-rename': async (el) => {
    const p = prog();
    const i = Number(el.dataset.i);
    const old = p.chords[i].section;
    const v = await askText('Nom de la section', old);
    if (v === null) return;
    for (let k = i; k < p.chords.length && p.chords[k].section === old; k++) p.chords[k].section = v || undefined;
    touch(p);
    refresh();
  },
  verify: () => {
    const p = prog();
    delete p.chords[S.sel].conf;
    touch(p);
    A['next-verify']();
  },
  'next-verify': () => {
    const p = prog();
    const start = S.sel;
    const n = p.chords.length;
    for (let k = 1; k <= n; k++) {
      const i = (start + k + n) % n;
      const c = p.chords[i];
      if (c.conf != null && c.conf < 0.6) {
        S.sel = i;
        refresh();
        requestAnimationFrame(() => {
          const el = $('.timeline .blk.sel');
          const panel = $('.compo-side .selpanel');
          if (!el) return;
          const r = el.getBoundingClientRect();
          const bottom = panel && getComputedStyle($('.compo-side')).position === 'fixed' ? panel.getBoundingClientRect().top : innerHeight;
          window.scrollBy({ top: r.top - (bottom - r.height) / 2, behavior: 'smooth' });
        });
        return;
      }
    }
    refresh();
    toast('Plus rien à vérifier');
  },
  'add-chord': () => chordSheet(-1),
  'edit-chord': () => chordSheet(S.sel),
  'dup-chord': () => {
    const p = prog();
    const c = structuredClone(p.chords[S.sel]);
    c.id = uid();
    p.chords.splice(S.sel + 1, 0, c);
    S.sel++;
    touch(p);
    refresh();
  },
  'del-chord': () => {
    const p = prog();
    const [removed] = p.chords.splice(S.sel, 1);
    const at = S.sel;
    S.sel = Math.min(S.sel, p.chords.length - 1);
    touch(p);
    refresh();
    undoToast(`${cname(removed)} supprimé`, () => {
      p.chords.splice(at, 0, removed);
      S.sel = at;
      touch(p);
      refresh();
    });
  },
  move: (el) => {
    const p = prog();
    const to = S.sel + Number(el.dataset.d);
    if (to < 0 || to >= p.chords.length) return;
    const [c] = p.chords.splice(S.sel, 1);
    p.chords.splice(to, 0, c);
    S.sel = to;
    touch(p);
    refresh();
  },
  dur: (el) => {
    const p = prog();
    const c = p.chords[S.sel];
    c.beats = clamp(c.beats + Number(el.dataset.d), 1, 128);
    touch(p);
    refresh();
  },
  'dur-set': (el) => {
    const p = prog();
    p.chords[S.sel].beats = Number(el.dataset.v);
    touch(p);
    refresh();
  },
  vpos: (el) => {
    const p = prog();
    const c = p.chords[S.sel];
    const capo = capoOf(p);
    const cv = chosenVoicing(c, capo, gTun());
    const i = (cv.index + Number(el.dataset.d) + cv.voicings.length) % cv.voicings.length;
    c.voicing = { ...(c.voicing || {}), [capo]: cv.voicings[i].frets.join(',') };
    touch(p);
    refresh();
    if (IMAP[p.instrument].kind === 'guitar') preview(c);
  },
  'preview-sel': () => preview(prog().chords[S.sel]),
  // feuille accord
  'cs-mode': (el) => {
    const cs = currentSheet().cs;
    if (cs.mode === el.dataset.v) return;
    if (el.dataset.v === 'custom' && !cs.notes.length) {
      const info = T.chordInfo({ kind: 'std', root: cs.root, quality: cs.quality, bass: cs.bass });
      cs.notes = info.tones.map((t) => t.name);
      cs.cbass = info.bassName;
    }
    cs.mode = el.dataset.v;
    renderSheet();
  },
  'cs-root': (el) => {
    const cs = currentSheet().cs;
    cs.root = el.dataset.v;
    cs.bass = null;
    renderSheet();
    preview(csChord(cs));
  },
  'cs-q': (el) => {
    const cs = currentSheet().cs;
    cs.quality = el.dataset.v;
    if (cs.bass) {
      const info = T.chordInfo({ kind: 'std', root: cs.root, quality: cs.quality, bass: null });
      if (!info.tones.some((t) => t.pc === T.pc(cs.bass)) && !cs.otherBass) cs.bass = null;
    }
    renderSheet();
    preview(csChord(cs));
  },
  'cs-pick': (el) => {
    const cs = currentSheet().cs;
    cs.root = el.dataset.root;
    cs.quality = el.dataset.q;
    cs.bass = null;
    renderSheet();
    preview(csChord(cs));
  },
  'cs-7': () => {
    currentSheet().cs.sevenths = !currentSheet().cs.sevenths;
    renderSheet();
  },
  'cs-bass': (el) => {
    const cs = currentSheet().cs;
    cs.bass = el.dataset.v && T.pc(el.dataset.v) !== T.pc(cs.root) ? el.dataset.v : null;
    if (!el.dataset.v) cs.otherBass = false;
    renderSheet();
    preview(csChord(cs));
  },
  'cs-otherbass': () => {
    currentSheet().cs.otherBass = !currentSheet().cs.otherBass;
    renderSheet();
  },
  'cs-note': (el) => {
    const cs = currentSheet().cs;
    const n = el.dataset.v;
    const i = cs.notes.findIndex((x) => T.pc(x) === T.pc(n));
    if (i >= 0) cs.notes.splice(i, 1);
    else {
      cs.notes.push(n);
      unlock();
      const p = prog();
      loadSamples(IMAP[p.instrument].dir)
        .then(() => previewChord(p.instrument, [60 + T.pc(n)]))
        .catch(() => {});
    }
    if (cs.cbass && !cs.notes.includes(cs.cbass)) cs.cbass = null;
    renderSheet();
  },
  'cs-cbass': (el) => {
    currentSheet().cs.cbass = el.dataset.v;
    renderSheet();
  },
  'cs-dur': (el) => {
    const cs = currentSheet().cs;
    cs.beats = clamp(cs.beats + Number(el.dataset.d), 1, 128);
    renderSheet();
  },
  'cs-dur-set': (el) => {
    currentSheet().cs.beats = Number(el.dataset.v);
    renderSheet();
  },
  'cs-listen': () => {
    const ch = csChord(currentSheet().cs);
    if (ch) preview(ch);
  },
  'cs-ok': commitChord,
  'update-app': () => {
    if (window.__swWaiting) window.__swWaiting.postMessage('skipWaiting');
    else location.reload();
  },
  ...importActions,
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el, e);
  }
});
document.addEventListener('change', (e) => {
  const k = e.target.dataset.change;
  if (k === 'g-tun') {
    S.settings.guitarTuning = e.target.value;
    S.seq = null;
    saveSettings();
    refresh();
  } else if (k === 'b-tun') {
    S.settings.bassTuning = e.target.value;
    saveSettings();
    refresh();
  } else if (k === 'concert-song') {
    if (player.playing) player.stop();
    S.cur = e.target.value;
    S.multi = null;
    S.sel = -1;
    S.concertIdx = 0;
    S.seq = null;
    refresh();
  } else if (importActions.__change) importActions.__change(e);
});
document.addEventListener('input', (e) => {
  const k = e.target.dataset.input;
  if (k === 'tempo-range') {
    const p = prog();
    p.tempo = Number(e.target.value);
    touch(p);
    const b = $('.tempo-big b');
    if (b) b.textContent = p.tempo;
    clearTimeout(A._tr);
    A._tr = setTimeout(refresh, 150);
  } else if (k === 'gsearch') {
    S.gsearch = e.target.value;
    clearTimeout(A._gs);
    A._gs = setTimeout(() => {
      const pos = e.target.selectionStart;
      render();
      const inp = $('[data-input="gsearch"]');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(pos, pos);
      }
    }, 120);
  } else if (importActions.__input) importActions.__input(e);
});

// raccourcis clavier (ordinateur)
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (currentSheet()) {
    if (e.key === 'Escape') closeSheet();
    return;
  }
  const p = prog();
  if (e.key === ' ') {
    e.preventDefault();
    if (S.live) A['c-play']();
    else if (S.tab === 'compo' && p) A.play();
  } else if (S.live && e.key === 'Escape') exitLive();
  else if (S.multi && e.key === 'Escape') A.multi();
  else if (S.live && !player.playing && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) A['c-step']({ dataset: { d: e.key === 'ArrowRight' ? 1 : -1 } });
  else if (S.tab === 'compo' && p && p.chords.length && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    S.sel = clamp((S.sel < 0 ? 0 : S.sel + (e.key === 'ArrowRight' ? 1 : -1)), 0, p.chords.length - 1);
    refresh();
  } else if (S.tab === 'compo' && p && S.sel >= 0 && (e.key === 'Delete' || e.key === 'Backspace')) A['del-chord']();
});

// ---------------------------------------------------------------- démarrage
async function init() {
  setupDrag();
  try {
    const s = await store.get('settings');
    if (s)
      S.settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...s,
        notation: { ...DEFAULT_SETTINGS.notation, ...(s.notation || {}) },
        concert: { ...DEFAULT_SETTINGS.concert, ...(s.concert || {}) },
      };
    S.progs = (await store.all()).map(normalizeProg);
    const last = await store.get('lastOpen');
    if (last && S.progs.some((p) => p.id === last)) S.cur = last;
  } catch (e) {
    console.error(e);
    toast('Erreur de lecture du stockage : ' + e.message, 6000);
  }
  if (!S.progs.length && !S.settings.seeded) {
    const demo = newProg('Exemple — à dupliquer ou supprimer');
    demo.tempo = 92;
    demo.chords = [
      ['A', 'm'],
      ['F', 'maj'],
      ['C', 'maj'],
      ['G', 'maj', 'B'],
    ].map(([root, quality, bass]) => ({ id: uid(), kind: 'std', root, quality, bass: bass || null, beats: 4, voicing: {} }));
    S.progs.push(demo);
    S.settings.seeded = true;
    await store.put(demo);
    saveSettings();
  }
  S.tab = S.cur ? 'compo' : 'gallery';
  render();
  S.persist = await requestPersistence();
}
// mémorise le morceau ouvert
let lastOpenSaved = null;
setInterval(() => {
  if (S.cur !== lastOpenSaved) {
    lastOpenSaved = S.cur;
    store.set('lastOpen', S.cur || '');
  }
}, 2000);

window.addEventListener('app-update-ready', () => {
  const b = document.createElement('div');
  b.className = 'update-bar';
  b.innerHTML = `<span>Nouvelle version disponible</span><button class="btn small primary" data-act="update-app">Mettre à jour</button>`;
  document.body.appendChild(b);
});

init();
