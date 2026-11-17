/** Royalty-free beds — same library as the GitHub media portal, synthesized in-browser. */

export type MusicRecipe = {
  notes: number[];
  bpm: number;
  step: number;
  decay: number;
  bass: number | null;
  lowpass: number;
  gain: number;
};

export type MusicTrack = {
  id: string;
  title: string;
  mood: string;
  bpm: number;
  recipe: MusicRecipe;
};

export const MUSIC_LIBRARY: MusicTrack[] = [
  {
    id: "uplift-major",
    title: "Uplift",
    mood: "Bright · upbeat",
    bpm: 120,
    recipe: { notes: [440, 554.37, 659.25, 880, 659.25, 554.37], bpm: 120, step: 1, decay: 6, bass: 110, lowpass: 6000, gain: 1.1 },
  },
  {
    id: "sunny-pop",
    title: "Sunny Pop",
    mood: "Energetic · social",
    bpm: 128,
    recipe: { notes: [523.25, 659.25, 783.99, 659.25, 587.33, 783.99, 987.77, 783.99], bpm: 128, step: 1, decay: 8, bass: 130.81, lowpass: 7000, gain: 1.15 },
  },
  {
    id: "warm-keys",
    title: "Warm Keys",
    mood: "Soft · welcoming",
    bpm: 92,
    recipe: { notes: [392, 493.88, 587.33, 493.88], bpm: 92, step: 2, decay: 3.2, bass: 98, lowpass: 3200, gain: 1.0 },
  },
  {
    id: "luxe-slow",
    title: "Luxe",
    mood: "Elegant · premium",
    bpm: 76,
    recipe: {
      notes: [196, 246.94, 293.66, 369.99, 293.66, 246.94, 220, 293.66],
      bpm: 76,
      step: 2,
      decay: 1.8,
      bass: 65.41,
      lowpass: 2200,
      gain: 0.88,
    },
  },
  {
    id: "cinematic-dusk",
    title: "Dusk",
    mood: "Cinematic · calm",
    bpm: 68,
    recipe: {
      notes: [174.61, 220, 261.63, 329.63, 261.63, 220],
      bpm: 68,
      step: 3,
      decay: 1.2,
      bass: 55,
      lowpass: 1600,
      gain: 0.85,
    },
  },
  {
    id: "clean-minimal",
    title: "Minimal",
    mood: "Modern · understated",
    bpm: 104,
    recipe: { notes: [587.33, 880, 587.33, 739.99], bpm: 104, step: 2, decay: 5, bass: 146.83, lowpass: 5000, gain: 1.0 },
  },
];

export const DEFAULT_TRACK_ID = "luxe-slow";

export function findTrack(id: string | null | undefined): MusicTrack | null {
  if (!id) return null;
  return MUSIC_LIBRARY.find((t) => t.id === id) ?? null;
}

const urlCache = new Map<string, string>();

function synthPcm(recipe: MusicRecipe, duration = 36, sampleRate = 44100): Float32Array {
  const n = Math.floor(sampleRate * duration);
  const out = new Float32Array(n);
  const stepSec = (60 / recipe.bpm / 2) * recipe.step;
  const cycle = recipe.notes.length * stepSec;
  const padNotes = [...new Set(recipe.notes.slice(0, 3).map((f) => f / 2))];
  const rc = 1 / (2 * Math.PI * Math.max(200, recipe.lowpass));
  const alpha = 1 / (1 + rc * sampleRate);
  let lp = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (let ni = 0; ni < recipe.notes.length; ni++) {
      const f = recipe.notes[ni];
      const offset = ni * stepSec;
      let ph = (t - offset) % cycle;
      if (ph < 0) ph += cycle;
      const env = (1 - Math.exp(-40 * ph)) * Math.exp(-Math.min(recipe.decay, 8) * ph);
      s += (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.004 * t) + 0.35 * Math.sin(2 * Math.PI * f * 2 * t)) * env * 0.28;
    }
    padNotes.forEach((f, pi) => {
      s += Math.sin(2 * Math.PI * f * t) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.08 * t + pi)) * 0.14;
    });
    if (recipe.bass != null) {
      const beat = 60 / recipe.bpm;
      const bt = t % beat;
      s += Math.sin(2 * Math.PI * recipe.bass * t) * (1 - Math.exp(-60 * bt)) * Math.exp(-2.2 * bt) * 0.42;
    }
    lp += alpha * (s - lp);
    const fadeIn = Math.min(1, t / 1.1);
    const fadeOut = t > duration - 2.5 ? Math.max(0, (duration - t) / 2.5) : 1;
    out[i] = Math.max(-0.85, Math.min(0.85, lp * recipe.gain * 0.7 * fadeIn * fadeOut));
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate = 44100): Blob {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function libraryTrackUrl(trackId: string): string {
  const hit = urlCache.get(trackId);
  if (hit) return hit;
  const track = findTrack(trackId);
  if (!track) return "";
  const url = URL.createObjectURL(encodeWav(synthPcm(track.recipe)));
  urlCache.set(trackId, url);
  return url;
}

async function decodeTrack(actx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    return await actx.decodeAudioData(data.slice(0));
  } catch {
    return null;
  }
}

export async function mixAudioTracks(
  videoStream: MediaStream,
  tracks: Array<{ url: string; volume: number; loop?: boolean; delay?: number }>,
): Promise<{ stream: MediaStream; stop: () => void; armDelayed: () => void }> {
  if (!tracks.length) {
    return {
      stream: videoStream,
      stop: () => videoStream.getTracks().forEach((t) => t.stop()),
      armDelayed: () => undefined,
    };
  }
  const actx = new AudioContext();
  if (actx.state === "suspended") await actx.resume();
  const dest = actx.createMediaStreamDestination();
  const keep = actx.createOscillator();
  const keepGain = actx.createGain();
  keepGain.gain.value = 0.0001;
  keep.connect(keepGain);
  keepGain.connect(dest);
  keep.start();

  const prepared: Array<{ buffer: AudioBuffer; volume: number; loop: boolean; delay: number }> = [];
  for (const track of tracks) {
    if (!track.url) continue;
    const buffer = await decodeTrack(actx, track.url);
    if (!buffer) continue;
    prepared.push({
      buffer,
      volume: track.volume,
      loop: Boolean(track.loop),
      delay: Math.max(0, track.delay || 0),
    });
  }

  const nodes: Array<AudioBufferSourceNode | OscillatorNode> = [keep];
  let armed = false;
  const stream = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  return {
    stream,
    stop: () => {
      for (const node of nodes) {
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
      }
      videoStream.getTracks().forEach((t) => t.stop());
      dest.stream.getTracks().forEach((t) => t.stop());
      void actx.close();
    },
    /** Start the mix when recording begins so voice delay lines up with the white intro. */
    armDelayed: () => {
      if (armed) return;
      armed = true;
      const t0 = actx.currentTime;
      for (const item of prepared) {
        const src = actx.createBufferSource();
        src.buffer = item.buffer;
        src.loop = item.loop;
        const gain = actx.createGain();
        gain.gain.value = item.volume;
        src.connect(gain);
        gain.connect(dest);
        src.start(t0 + item.delay);
        nodes.push(src);
      }
    },
  };
}

export async function mixReelAudio(
  videoStream: MediaStream,
  audioUrl: string,
): Promise<{ stream: MediaStream; stop: () => void }> {
  return mixAudioTracks(videoStream, [{ url: audioUrl, volume: 0.55, loop: true }]);
}
