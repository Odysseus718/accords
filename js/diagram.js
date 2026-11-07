// Rendu SVG : diagramme d'accord de guitare et manche de basse.
import { mod12, displayNote, pcName } from './theory.js';

// voicing : { frets:[6], fingers:[6], barre } (frettes relatives au capo)
export function guitarDiagram(voicing, { capo = 0, fingers = true, missing = [] } = {}) {
  if (!voicing) {
    return `<svg class="gdiag" viewBox="0 0 130 150" role="img" aria-label="aucune position">
      <rect x="20" y="28" width="90" height="88" rx="3" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 4"/>
      <text x="65" y="76" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">pas de position</text></svg>`;
  }
  const { frets } = voicing;
  const fretted = frets.filter((f) => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const start = maxF <= 4 ? 1 : minF;
  const rows = Math.max(4, maxF - start + 1);
  const X0 = 22,
    DX = 17.2,
    Y0 = 30,
    DY = 92 / rows;
  const W = X0 * 2 + DX * 5;
  const H = Y0 + DY * rows + (fingers ? 22 : 8);
  const sx = (s) => X0 + s * DX;
  let o = `<svg class="gdiag" viewBox="0 0 ${W} ${H}" role="img">`;
  // frettes
  for (let r = 0; r <= rows; r++) {
    const y = Y0 + r * DY;
    o += `<line x1="${sx(0)}" x2="${sx(5)}" y1="${y}" y2="${y}" stroke="currentColor" stroke-width="${r === 0 && start === 1 ? 0 : 1}" />`;
  }
  // sillet ou capo
  if (start === 1) {
    if (capo) o += `<rect x="${sx(0) - 5}" y="${Y0 - 6}" width="${DX * 5 + 10}" height="7" rx="3.5" class="capo"/>`;
    else o += `<rect x="${sx(0) - 0.5}" y="${Y0 - 5}" width="${DX * 5 + 1}" height="5" fill="currentColor"/>`;
  } else {
    o += `<text x="${sx(0) - 6}" y="${Y0 + DY * 0.5 + 4}" text-anchor="end" font-size="11" font-weight="700" fill="currentColor">${start}</text>`;
  }
  // cordes
  for (let s = 0; s < 6; s++) o += `<line x1="${sx(s)}" x2="${sx(s)}" y1="${Y0}" y2="${Y0 + rows * DY}" stroke="currentColor" stroke-width="1"/>`;
  // barré
  if (voicing.barre) {
    const b = voicing.barre;
    const y = Y0 + (b.fret - start + 0.5) * DY;
    o += `<rect x="${sx(b.from) - 6.5}" y="${y - 6.5}" width="${sx(b.to) - sx(b.from) + 13}" height="13" rx="6.5" class="dot"/>`;
  }
  // points, à vide, étouffées
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f < 0) {
      const x = sx(s),
        y = Y0 - 14;
      o += `<path d="M${x - 4.5} ${y - 4.5}L${x + 4.5} ${y + 4.5}M${x + 4.5} ${y - 4.5}L${x - 4.5} ${y + 4.5}" stroke="currentColor" stroke-width="1.6"/>`;
    } else if (f === 0) {
      o += `<circle cx="${sx(s)}" cy="${Y0 - 14}" r="5" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
    } else if (!(voicing.barre && f === voicing.barre.fret && s >= voicing.barre.from && s <= voicing.barre.to)) {
      o += `<circle cx="${sx(s)}" cy="${Y0 + (f - start + 0.5) * DY}" r="6.8" class="dot"/>`;
    }
  }
  // doigtés
  if (fingers && voicing.fingers) {
    for (let s = 0; s < 6; s++) {
      const fg = voicing.fingers[s];
      if (fg) o += `<text x="${sx(s)}" y="${Y0 + rows * DY + 16}" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${fg}</text>`;
    }
  }
  o += `</svg>`;
  return o;
}

// Manche de basse : toutes les notes de l'accord, fondamentale (et octaves) mise en avant
// tones : [{pc, name, label}] ; rootPc ; bassPc ; tuning : midi[4] (grave -> aigu)
export function bassNeck({ tones, rootPc, bassPc, tuning, notation = 'fr', labels = 'notes', frets = 12 }) {
  const strings = tuning.length;
  const OPEN = 26,
    FW = 29,
    SY = 27,
    TOP = 15;
  const W = OPEN + FW * frets + 6;
  const H = TOP + SY * (strings - 1) + 30;
  const byPc = new Map(tones.map((t) => [t.pc, t]));
  const ys = (i) => TOP + (strings - 1 - i) * SY; // corde grave en bas
  const xf = (f) => (f === 0 ? OPEN / 2 : OPEN + (f - 0.5) * FW);
  let o = `<svg class="bneck" viewBox="0 0 ${W} ${H}" role="img">`;
  // incrustations
  for (const f of [3, 5, 7, 9, 15]) if (f <= frets) o += `<circle cx="${OPEN + (f - 0.5) * FW}" cy="${TOP + ((strings - 1) * SY) / 2}" r="4" class="inlay"/>`;
  if (frets >= 12) {
    o += `<circle cx="${OPEN + 11.5 * FW}" cy="${TOP + SY * 0.5}" r="4" class="inlay"/><circle cx="${OPEN + 11.5 * FW}" cy="${TOP + SY * (strings - 1.5)}" r="4" class="inlay"/>`;
  }
  // frettes
  for (let f = 0; f <= frets; f++) {
    const x = OPEN + f * FW;
    o += `<line x1="${x}" x2="${x}" y1="${TOP - 4}" y2="${TOP + (strings - 1) * SY + 4}" stroke="currentColor" stroke-width="${f === 0 ? 4 : 1}" stroke-opacity="${f === 0 ? 1 : 0.45}"/>`;
  }
  // cordes
  for (let i = 0; i < strings; i++) o += `<line x1="${OPEN}" x2="${W - 6}" y1="${ys(i)}" y2="${ys(i)}" stroke="currentColor" stroke-width="${1 + (strings - 1 - i) * 0.35 + 0.3}" stroke-opacity=".7"/>`;
  // numéros de case
  for (const f of [3, 5, 7, 9, 12]) if (f <= frets) o += `<text x="${OPEN + (f - 0.5) * FW}" y="${H - 6}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".55">${f}</text>`;
  // notes
  for (let i = 0; i < strings; i++) {
    for (let f = 0; f <= frets; f++) {
      const p = mod12(tuning[i] + f);
      const t = byPc.get(p);
      if (!t) continue;
      const isRoot = p === rootPc;
      const isBass = p === bassPc && bassPc !== rootPc;
      const txt = labels === 'degrees' ? t.label : displayNote(t.name, notation);
      const fs = txt.length >= 4 ? 8.4 : txt.length === 3 ? 9.6 : 11.5;
      const cls = isRoot ? 'bn root' : isBass ? 'bn bassn' : 'bn';
      o += `<g class="${cls}"><circle cx="${xf(f)}" cy="${ys(i)}" r="${isRoot ? 13 : 12}"/><text x="${xf(f)}" y="${ys(i) + fs * 0.36}" text-anchor="middle" font-size="${fs}">${txt}</text></g>`;
    }
  }
  o += `</svg>`;
  return o;
}

// Nom des cordes à vide (pour affichage)
export function tuningNames(tuning, notation) {
  return tuning.map((m) => displayNote(pcName(m), notation));
}
