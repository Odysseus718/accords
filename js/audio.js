// Moteur audio : échantillonneur (Web Audio) + séquenceur précis.

export const INSTRUMENTS = [
  { id: 'piano', label: 'Piano', dir: 'piano', kind: 'keys' },
  { id: 'rhodes', label: 'Piano électrique', dir: 'rhodes', kind: 'keys' },
  { id: 'acoustic', label: 'Guitare acoustique', dir: 'acoustic', kind: 'guitar' },
  { id: 'clean', label: 'Guitare électrique (clean)', dir: 'clean', kind: 'guitar' },
  { id: 'drive', label: 'Guitare saturée', dir: 'drive', kind: 'guitar' },
  { id: 'organ', label: 'Orgue', dir: 'organ', kind: 'sustain' },
  { id: 'pad', label: 'Nappe synthé', dir: 'pad', kind: 'sustain' },
  { id: 'strings', label: 'Cordes', dir: 'strings', kind: 'sustain' },
];
export const IMAP = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const midiName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
const CHORD_SAMPLES = [36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81];
const BASS_SAMPLES = [24, 27, 30, 33, 36, 39, 42, 45, 48];

let ctx = null;
let master, chordBus, bassBus, clickBus;
const buffers = {}; // dir -> Map(midi -> AudioBuffer)
const loading = {};

export function audioContext() {
  if (!ctx) {
    // Joue même si l'iPhone est en mode silencieux
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
    makeBuses();
  }
  return ctx;
}

function makeBuses() {
  chordBus = ctx.createGain();
  bassBus = ctx.createGain();
  clickBus = ctx.createGain();
  chordBus.connect(master);
  bassBus.connect(master);
  clickBus.connect(master);
  bassBus.gain.value = 0.9;
  clickBus.gain.value = 0.55;
}

// coupe net tout ce qui est programmé (fondu court) et repart sur des bus neufs
export function silenceAll() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [chordBus, bassBus, clickBus].forEach((b) => {
    try {
      b.gain.cancelScheduledValues(t);
      b.gain.setValueAtTime(b.gain.value, t);
      b.gain.linearRampToValueAtTime(0, t + 0.06);
      setTimeout(() => b.disconnect(), 200);
    } catch {}
  });
  makeBuses();
}

export async function unlock() {
  const c = audioContext();
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {}
  }
  // tampon silencieux : déverrouille l'audio iOS
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
}

export function loadSamples(dir) {
  if (buffers[dir]) return Promise.resolve(buffers[dir]);
  if (loading[dir]) return loading[dir];
  const c = audioContext();
  const list = dir === 'bass' ? BASS_SAMPLES : CHORD_SAMPLES;
  loading[dir] = Promise.all(
    list.map(async (m) => {
      const res = await fetch(`${dir}/${midiName(m)}.mp3`);
      if (!res.ok) throw new Error('échantillon manquant ' + dir + '/' + midiName(m));
      const data = await res.arrayBuffer();
      const buf = await new Promise((ok, ko) => c.decodeAudioData(data, ok, ko));
      return [m, buf];
    })
  ).then((pairs) => {
    buffers[dir] = new Map(pairs);
    delete loading[dir];
    return buffers[dir];
  });
  loading[dir].catch(() => delete loading[dir]);
  return loading[dir];
}

function nearest(map, midi) {
  let best = null;
  for (const m of map.keys()) if (best === null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  return best;
}

// Joue une note échantillonnée
function playSample(dir, midi, when, dur, gain, bus, sustain) {
  const map = buffers[dir];
  if (!map) return;
  const sm = nearest(map, midi);
  const buf = map.get(sm);
  const rate = Math.pow(2, (midi - sm) / 12);
  const release = sustain ? 0.35 : 0.18;
  const segLen = (s, offset, length, fadeIn) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    src.connect(g).connect(bus);
    return { src, g };
  };
  const natural = buf.duration / rate - 0.05;
  if (!sustain || dur + release <= natural) {
    const { src, g } = segLen();
    const end = when + Math.min(dur, natural);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.005);
    g.gain.setValueAtTime(gain, end);
    g.gain.linearRampToValueAtTime(0, end + release);
    src.start(when);
    src.stop(end + release + 0.05);
    return;
  }
  // Son tenu : on enchaîne des segments du milieu de l'échantillon avec fondus enchaînés
  const xf = 0.4;
  const segOffset = 0.8;
  const segDur = (buf.duration - segOffset - 0.25) / rate; // durée réelle du segment
  const step = segDur - xf;
  const end = when + dur;
  // premier segment (attaque)
  {
    const { src, g } = segLen();
    const firstEnd = when + natural - xf;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    if (end <= firstEnd + xf) {
      g.gain.setValueAtTime(gain, end);
      g.gain.linearRampToValueAtTime(0, end + release);
      src.start(when);
      src.stop(end + release + 0.05);
      return;
    }
    g.gain.setValueAtTime(gain, firstEnd);
    g.gain.linearRampToValueAtTime(0, firstEnd + xf);
    src.start(when);
    src.stop(firstEnd + xf + 0.05);
    var t = firstEnd;
  }
  while (t < end) {
    const { src, g } = segLen();
    const segEnd = t + segDur;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + xf);
    src.start(t, segOffset);
    if (segEnd - xf >= end) {
      g.gain.setValueAtTime(gain, Math.max(end, t + xf));
      g.gain.linearRampToValueAtTime(0, Math.max(end, t + xf) + release);
      src.stop(Math.max(end, t + xf) + release + 0.05);
      break;
    }
    g.gain.setValueAtTime(gain, segEnd - xf);
    g.gain.linearRampToValueAtTime(0, segEnd);
    src.stop(segEnd + 0.05);
    t += step;
  }
}

function click(when, accent) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = accent === 2 ? 1760 : accent === 1 ? 1320 : 990;
  const v = accent === 2 ? 1 : accent === 1 ? 0.7 : 0.5;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(v, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  o.connect(g).connect(clickBus);
  o.start(when);
  o.stop(when + 0.08);
}

// Joue un accord (liste de hauteurs MIDI)
export function playChord(instrumentId, midis, when, dur, opts = {}) {
  const inst = IMAP[instrumentId] || IMAP.piano;
  const n = midis.length || 1;
  const gain = (inst.kind === 'sustain' ? 0.5 : 0.75) / Math.sqrt(n);
  const strum = inst.kind === 'guitar' ? (opts.up ? -0.014 : 0.014) : 0;
  const sorted = midis.slice().sort((a, b) => a - b);
  sorted.forEach((m, i) => {
    const off = strum >= 0 ? i * strum : (sorted.length - 1 - i) * -strum;
    playSample(inst.dir, m, when + off, Math.max(0.05, dur - off), gain * (opts.velocity || 1), chordBus, inst.kind === 'sustain');
  });
}
export function playBass(midi, when, dur) {
  playSample('bass', midi, when, dur, 0.9, bassBus, false);
}

export function previewChord(instrumentId, midis) {
  const c = audioContext();
  const inst = IMAP[instrumentId] || IMAP.piano;
  return loadSamples(inst.dir).then(() => playChord(instrumentId, midis, c.currentTime + 0.03, 1.6));
}

// ---------- Séquenceur ----------
// getState() -> { prog, events } où events = liste d'accords { midis, bass, beats }
export class Player {
  constructor({ getSequence, onBeat, onStop }) {
    this.getSequence = getSequence;
    this.onBeat = onBeat;
    this.onStop = onStop;
    this.playing = false;
    this.queue = [];
  }
  async start({ fromIndex = 0, countIn = false } = {}) {
    const c = audioContext();
    await unlock();
    const seq = this.getSequence();
    await Promise.all([loadSamples(IMAP[seq.instrument]?.dir || 'piano'), seq.bassRoot ? loadSamples('bass') : null]);
    this.stopNow(false);
    this.playing = true;
    this.chordIdx = Math.min(fromIndex, Math.max(0, seq.chords.length - 1));
    this.beatInChord = 0;
    this.globalBeat = 0;
    this.countIn = countIn ? seq.beatsPerBar : 0;
    this.countTotal = this.countIn;
    this.nextTime = c.currentTime + 0.12;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
    const loop = () => {
      if (!this.playing) return;
      this.flushVisual();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  tick() {
    if (!this.playing) return;
    const c = ctx;
    while (this.nextTime < c.currentTime + 0.15) {
      const seq = this.getSequence();
      const spb = 60 / seq.tempo;
      if (!seq.chords.length) {
        this.stop();
        return;
      }
      const bpb = seq.beatsPerBar;
      if (this.countIn > 0) {
        const k = this.countTotal - this.countIn;
        click(this.nextTime, k === 0 ? 2 : 0);
        this.queue.push({ time: this.nextTime, countIn: this.countIn, beatInBar: k, bpb, tempo: seq.tempo });
        this.countIn--;
        this.nextTime += spb;
        continue;
      }
      if (this.chordIdx >= seq.chords.length) {
        if (seq.loop) this.chordIdx = 0;
        else {
          const t = this.nextTime;
          this.queue.push({ time: t, end: true });
          this.playing = 'ending';
          clearInterval(this.timer);
          return;
        }
      }
      const ch = seq.chords[this.chordIdx];
      const beatInBar = this.globalBeat % bpb;
      if (seq.metronome) click(this.nextTime, beatInBar === 0 ? 2 : seq.accents.includes(beatInBar) ? 1 : 0);
      const remaining = ch.beats - this.beatInChord;
      const strike =
        this.beatInChord === 0 ||
        (seq.pattern === 'bar' && beatInBar === 0) ||
        seq.pattern === 'beat' ||
        (seq.pattern === 'eighths');
      if (strike && ch.midis.length) {
        let len;
        if (seq.pattern === 'beat' || seq.pattern === 'eighths') len = 1;
        else if (seq.pattern === 'bar') len = Math.min(remaining, bpb - beatInBar);
        else len = remaining;
        if (seq.pattern === 'eighths') {
          playChord(seq.instrument, ch.midis, this.nextTime, spb * 0.5 - 0.02, { velocity: beatInBar === 0 ? 1 : 0.85 });
          playChord(seq.instrument, ch.midis, this.nextTime + spb / 2, spb * 0.5 - 0.02, { up: true, velocity: 0.7 });
        } else {
          playChord(seq.instrument, ch.midis, this.nextTime, len * spb - 0.03, { velocity: beatInBar === 0 ? 1 : 0.85 });
        }
        if (seq.bassRoot && ch.bass != null) playBass(ch.bass, this.nextTime, len * spb - 0.03);
      }
      this.queue.push({ time: this.nextTime, chordIdx: this.chordIdx, beatInChord: this.beatInChord, beatInBar, bpb, chordBeats: ch.beats, tempo: seq.tempo });
      this.globalBeat++;
      this.beatInChord++;
      if (this.beatInChord >= ch.beats) {
        this.beatInChord = 0;
        this.chordIdx++;
      }
      this.nextTime += spb;
    }
  }
  flushVisual() {
    const now = ctx.currentTime;
    while (this.queue.length && this.queue[0].time <= now) {
      const e = this.queue.shift();
      if (e.end) {
        this.stop();
        return;
      }
      this.onBeat && this.onBeat(e);
    }
  }
  stopNow(notify = true) {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.queue = [];
    const was = this.playing;
    this.playing = false;
    if (was) silenceAll();
    if (was && notify && this.onStop) this.onStop();
  }
  stop() {
    this.stopNow(true);
  }
}
