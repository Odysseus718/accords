// Stockage local : IndexedDB + demande de stockage persistant + export/import.

const DB_NAME = 'accords';
const DB_VERSION = 1;
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((ok, ko) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('progressions')) d.createObjectStore('progressions', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
  }
  return dbp;
}

function tx(store, mode, fn) {
  return db().then(
    (d) =>
      new Promise((ok, ko) => {
        const t = d.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        Promise.resolve(fn(s)).then((r) => (result = r));
        t.oncomplete = () => ok(result);
        t.onerror = () => ko(t.error);
        t.onabort = () => ko(t.error);
      })
  );
}
const req = (r) => new Promise((ok, ko) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => ko(r.error))));

export const store = {
  async all() {
    return tx('progressions', 'readonly', (s) => req(s.getAll()));
  },
  async put(p) {
    return tx('progressions', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(p))));
  },
  async remove(id) {
    return tx('progressions', 'readwrite', (s) => s.delete(id));
  },
  async get(k) {
    return tx('kv', 'readonly', (s) => req(s.get(k)));
  },
  async set(k, v) {
    return tx('kv', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(v)), k));
  },
};

export async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return 'indisponible';
    if (await navigator.storage.persisted()) return 'accordé';
    return (await navigator.storage.persist()) ? 'accordé' : 'refusé';
  } catch {
    return 'indisponible';
  }
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// ---------- Export / import ----------
export const FILE_TAG = 'accords-progressions';

export function makeExport(progressions) {
  return {
    format: FILE_TAG,
    version: 1,
    exportedAt: new Date().toISOString(),
    progressions,
  };
}

export async function shareOrDownload(obj, filename) {
  const text = JSON.stringify(obj, null, 1);
  const file = new File([text], filename, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export function pickFile() {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain';
    input.style.display = 'none';
    input.onchange = async () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return ok(null);
      ok(await f.text());
    };
    document.body.appendChild(input);
    input.click();
  });
}

export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas un fichier de progressions valide.");
  }
  let list = null;
  if (data && data.format === FILE_TAG && Array.isArray(data.progressions)) list = data.progressions;
  else if (data && Array.isArray(data.chords)) list = [data];
  if (!list) throw new Error("Ce fichier n'est pas un fichier de progressions valide.");
  return list.filter((p) => p && typeof p === 'object' && Array.isArray(p.chords));
}
