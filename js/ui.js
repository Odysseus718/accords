// Petits outils d'interface partagés : sélecteurs, échappement, toasts, feuilles, icônes.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/></svg>',
  dots: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>',
  loop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  stage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M10 8.5v5l4.5-2.5z" fill="currentColor"/><path d="M8 21h8"/></svg>',
  compo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="5" height="12" rx="1.5"/><rect x="10" y="6" width="11" height="12" rx="1.5"/><path d="M13.5 10v4M17.5 10v4"/></svg>',
  gallery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
export function undoToast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span><button id="undo">Annuler</button>`;
  t.classList.add('show');
  $('#undo').onclick = () => {
    undo();
    t.classList.remove('show');
  };
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 4500);
}

// ---- feuilles (panneaux du bas, centrés sur grand écran)
export let sheet = null;
export function openSheet(render, { onClose, tall = false } = {}) {
  closeSheet(true);
  const root = $('#sheet-root');
  root.innerHTML = `<div class="overlay" data-act="sheet-close"></div><div class="sheet ${tall ? 'tall' : ''}" role="dialog"><div class="grab"></div><button class="sheet-x" data-act="sheet-close" aria-label="Fermer">${ICON.close}</button><div class="sheet-body"></div></div>`;
  sheet = { render, onClose };
  renderSheet();
  requestAnimationFrame(() => root.classList.add('open'));
  return sheet;
}
export function renderSheet() {
  if (!sheet) return;
  const body = $('#sheet-root .sheet-body');
  const st = body.scrollTop;
  body.innerHTML = sheet.render();
  body.scrollTop = st;
  sheet.after && sheet.after();
}
export function closeSheet(immediate) {
  const root = $('#sheet-root');
  if (!sheet) return;
  const s = sheet;
  sheet = null;
  root.classList.remove('open');
  if (immediate) root.innerHTML = '';
  else setTimeout(() => !sheet && (root.innerHTML = ''), 220);
  s.onClose && s.onClose();
}
export const currentSheet = () => sheet;

export function askText(title, value, { placeholder = '', ok = 'OK' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(
      () => `<h2>${esc(title)}</h2>
      <input class="txt" id="ask-input" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="80" autocomplete="off">
      <div class="row end"><button class="btn ghost" data-act="sheet-close">Annuler</button><button class="btn primary" id="ask-ok">${esc(ok)}</button></div>`,
      { onClose: () => !done && resolve(null) }
    );
    const inp = $('#ask-input');
    setTimeout(() => {
      inp.focus();
      inp.select();
    }, 60);
    const submit = () => {
      done = true;
      const v = inp.value.trim();
      closeSheet();
      resolve(v);
    };
    $('#ask-ok').onclick = submit;
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') submit();
    };
  });
}
export function confirmBox(title, text, okLabel = 'Supprimer', danger = true) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(
      () => `<h2>${esc(title)}</h2><p class="muted">${text}</p>
      <div class="row end"><button class="btn ghost" data-act="sheet-close">Annuler</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cf-ok">${esc(okLabel)}</button></div>`,
      { onClose: () => !done && resolve(false) }
    );
    $('#cf-ok').onclick = () => {
      done = true;
      closeSheet();
      resolve(true);
    };
  });
}

export const pct = (x) => Math.round(100 * x) + ' %';
export const confClass = (c) => (c == null ? '' : c >= 0.85 ? 'c-ok' : c >= 0.6 ? 'c-mid' : 'c-low');
