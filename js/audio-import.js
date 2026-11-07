// Côté page : décodage du fichier audio et pilotage du worker d'analyse.
export async function decodeToMono(file) {
  const data = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const tmp = new AC();
  let buf;
  try {
    buf = await new Promise((ok, ko) => tmp.decodeAudioData(data, ok, ko));
  } finally {
    tmp.close && tmp.close();
  }
  const SR = 44100;
  const len = Math.ceil(buf.duration * SR);
  const off = new OfflineAudioContext(1, len, SR);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

let current = null;
export function cancelAnalysis() {
  if (current) {
    current.terminate();
    current = null;
  }
}
export function analyze(signal, seq, grid, onProgress) {
  return new Promise((ok, ko) => {
    cancelAnalysis();
    const w = new Worker(new URL('./analysis-worker.js', import.meta.url));
    current = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress && onProgress(m.stage, m.p);
      else if (m.type === 'done') {
        w.terminate();
        ok(m);
      } else if (m.type === 'error') {
        w.terminate();
        ko(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      ko(new Error(e.message || "Erreur de l'analyse"));
    };
    w.postMessage({ signal, seq, grid }, [signal.buffer]);
  });
}
