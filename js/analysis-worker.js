// Web Worker : analyse audio (Essentia, licence AGPL-3.0) + alignement de la grille.
self.exports = {};
importScripts('../vendor/essentia-wasm.umd.js', '../vendor/essentia.js-core.umd.min.js', 'analysis-core.js');

let essentia = null;
function ready() {
  const M = self.exports.EssentiaWASM;
  if (M.calledRun) return Promise.resolve(M);
  return new Promise((ok) => {
    const prev = M.onRuntimeInitialized;
    M.onRuntimeInitialized = () => {
      prev && prev();
      ok(M);
    };
  });
}

self.onmessage = async (e) => {
  const { signal, seq, grid } = e.data;
  const post = (stage, p) => self.postMessage({ type: 'progress', stage, p });
  try {
    post('chargement', 0.01);
    if (!essentia) essentia = new self.Essentia(await ready());
    const feat = self.AnalysisCore.extractFeatures(essentia, signal, post);
    const res = seq && seq.length ? self.AnalysisCore.align(feat, seq, { grid }) : null;
    self.postMessage({ type: 'done', features: { bpm: feat.bpm, tuning: feat.tuning, duration: feat.duration, beats: feat.beats.length }, result: res });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
