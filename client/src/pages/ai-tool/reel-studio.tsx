import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Download } from "lucide-react";
import { saveAs } from "file-saver";
import type { KitBrand, KitListing } from "./kit-cards";
import { copyText, embedCodeFor } from "./kit-download";
import {
  drawReelScene,
  formatDuration,
  loadBeatsAndAssets,
  pickRecorderMime,
  planBeats,
  recordListingReel,
  reelDuration,
  reelSize,
  type LoadedBeat,
  type ReelAssets,
  type ReelLook,
  type ReelOrientation,
} from "./reel";
import { DEFAULT_TRACK_ID, MUSIC_LIBRARY, libraryTrackUrl } from "./reel-music";
import KitLoader from "./kit-loader";
import { kitBtnCircle, kitBtn } from "./kit-ui";
import { stopSpeechSynthesis, usePauseWhenHidden } from "./studio-playback";
import { fetchRealtorVoiceUrl, realtorScript, speakRealtor } from "./slideshow";

type Props = {
  photos: string[];
  listing: KitListing;
  brand: KitBrand;
  fileName: string;
  compact?: boolean;
  onEditPhoto?: (index: number) => void;
  active?: boolean;
};

export default function ReelStudio({ photos, listing, brand, fileName, compact, onEditPhoto, active = true }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const packRef = useRef<{ beats: LoadedBeat[]; assets: ReelAssets } | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [making, setMaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK_ID);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [look, setLook] = useState<ReelLook>("luxury");
  const [orientation, setOrientation] = useState<ReelOrientation>("portrait");
  const [captions, setCaptions] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopSpeakRef = useRef<(() => void) | null>(null);

  const size = reelSize(orientation);
  const planned = useMemo(() => planBeats(photos, listing, look), [photos, listing, look]);
  const duration = reelDuration(planned);
  const photoCount = planned.filter((b) => b.kind !== "contact").reduce((n, b) => n + b.urls.length, 0);
  const musicUrl = useMemo(() => {
    if (trackId === "custom") return customUrl;
    if (!trackId) return null;
    return libraryTrackUrl(trackId);
  }, [trackId, customUrl]);
  const style = useMemo(
    () => ({ look, orientation, captions }),
    [look, orientation, captions],
  );
  const styleRef = useRef(style);
  const listingRef = useRef(listing);
  const brandRef = useRef(brand);
  const sizeRef = useRef(size);
  styleRef.current = style;
  listingRef.current = listing;
  brandRef.current = brand;
  sizeRef.current = size;
  const script = useMemo(() => realtorScript(listing, brand), [listing, brand]);
  const voiceGender = brand.gender === "male" ? "male" : "female";

  const pauseAll = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    stopSpeakRef.current?.();
    stopSpeakRef.current = null;
    voiceAudioRef.current?.pause();
    voiceAudioRef.current = null;
    stopSpeechSynthesis();
    previewRef.current?.pause();
    previewRef.current = null;
    setPreviewing(null);
    audioRef.current?.pause();
  }, []);

  usePauseWhenHidden(sectionRef, pauseAll);

  useEffect(() => {
    if (!active) pauseAll();
  }, [active, pauseAll]);

  const paint = useCallback((t: number) => {
    const canvas = canvasRef.current;
    const pack = packRef.current;
    if (!canvas || !pack) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    drawReelScene(ctx, t, pack.beats, listingRef.current, brandRef.current, pack.assets, w, h, styleRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setPlaying(false);
    playingRef.current = false;
    clockRef.current = 0;
    setTime(0);
    const run = async () => {
      const pack = await loadBeatsAndAssets(photos, brand, listing);
      if (cancelled) return;
      packRef.current = pack;
      setReady(true);
      paint(0);
    };
    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
    // listing/brand captured via paint at play time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, brand.name, brand.headshot, brand.logo, brand.bg, brand.accent, listing.address, listing.price]);

  useEffect(() => {
    clockRef.current = 0;
    setTime(0);
    const id = requestAnimationFrame(() => paint(0));
    return () => cancelAnimationFrame(id);
  }, [look, paint]);

  useEffect(() => {
    const id = requestAnimationFrame(() => paint(clockRef.current));
    return () => cancelAnimationFrame(id);
  }, [orientation, captions, paint]);

  useEffect(() => {
    let cancelled = false;
    if (!voiceOn) {
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
      setVoiceUrl(null);
      return;
    }
    const run = async () => {
      const url = await fetchRealtorVoiceUrl(script, voiceGender);
      if (cancelled) return;
      setVoiceUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOn, script, voiceGender]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = voiceOn && voiceUrl ? 0.14 : 0.55;
    if (playing && musicUrl) {
      const len = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 36;
      try {
        audio.currentTime = clockRef.current % len;
      } catch {
        /* duration may be unknown yet */
      }
      void audio.play().catch(() => null);
    } else {
      audio.pause();
    }
  }, [playing, musicUrl, voiceOn, voiceUrl]);

  useEffect(() => {
    return () => pauseAll();
  }, [pauseAll]);

  useEffect(() => {
    const loop = (now: number) => {
      if (!playingRef.current) return;
      const dt = lastRef.current ? (now - lastRef.current) / 1000 : 0;
      lastRef.current = now;
      clockRef.current += dt;
      if (clockRef.current >= duration) {
        clockRef.current = duration;
        playingRef.current = false;
        setPlaying(false);
        setTime(duration);
        paint(duration - 0.001);
        stopSpeakRef.current?.();
        return;
      }
      setTime(clockRef.current);
      paint(clockRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    if (playing) {
      lastRef.current = 0;
      playingRef.current = true;
      rafRef.current = requestAnimationFrame(loop);
    } else {
      playingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      stopSpeakRef.current?.();
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, duration, paint]);

  const toggle = () => {
    if (!ready || making) return;
    if (videoUrl) {
      setVideoUrl(null);
    }
    if (clockRef.current >= duration - 0.05) {
      clockRef.current = 0;
      setTime(0);
    }
    setPlaying((p) => {
      const next = !p;
      if (next && voiceOn) {
        stopSpeakRef.current?.();
        if (voiceUrl) {
          const a = new Audio(voiceUrl);
          voiceAudioRef.current = a;
          a.currentTime = clockRef.current;
          void a.play().catch(() => {
            stopSpeakRef.current = speakRealtor(script, undefined, voiceGender);
          });
          stopSpeakRef.current = () => {
            a.pause();
            voiceAudioRef.current = null;
          };
        } else {
          stopSpeakRef.current = speakRealtor(script, undefined, voiceGender);
        }
      } else {
        stopSpeakRef.current?.();
      }
      return next;
    });
  };

  const seek = (next: number) => {
    clockRef.current = next;
    setTime(next);
    paint(next);
    const audio = audioRef.current;
    if (audio && musicUrl) {
      const len = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 36;
      try {
        audio.currentTime = next % len;
      } catch {
        /* ignore */
      }
    }
  };

  const stopPreview = () => {
    previewRef.current?.pause();
    previewRef.current = null;
    setPreviewing(null);
  };

  const previewTrack = (id: string) => {
    if (previewing === id) {
      stopPreview();
      return;
    }
    stopPreview();
    const url = id === "custom" ? customUrl : libraryTrackUrl(id);
    if (!url) return;
    const a = new Audio(url);
    a.volume = 0.7;
    a.onended = () => setPreviewing(null);
    void a.play().catch(() => setPreviewing(null));
    previewRef.current = a;
    setPreviewing(id);
  };

  const makeReel = async () => {
    setError(null);
    setMaking(true);
    pauseAll();
    setProgress(0);
    try {
      if (!pickRecorderMime()) throw new Error("This browser cannot record video. Use Chrome.");
      const blob = await recordListingReel({
        photos,
        listing,
        brand,
        audioUrl: musicUrl,
        voiceUrl: voiceOn ? voiceUrl : null,
        look,
        orientation,
        captions,
        onProgress: setProgress,
      });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      saveAs(blob, `${fileName}.${ext}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render reel");
    } finally {
      setMaking(false);
    }
  };

  const pct = duration ? (time / duration) * 100 : 0;
  const reelPageUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}${window.location.search}#reels`
      : "";
  const copyReel = async (kind: "url" | "embed") => {
    const value =
      kind === "url" ? reelPageUrl : embedCodeFor(reelPageUrl, listing.address || "Listing reel", "page");
    try {
      await copyText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((cur) => (cur === kind ? null : cur)), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section ref={sectionRef}>
      {!compact ? (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#E8A13D] border border-[#E8A13D]/40 rounded-full px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E8A13D]" />
              Ready
            </span>
            <span className="text-white/45 text-xs font-mono">
              {formatDuration(duration)} · {photoCount} photos · {orientation === "portrait" ? "9:16" : "16:9"} · 1080p · 60fps
            </span>
          </div>
          <h3 className="text-2xl font-semibold mb-1">Cinematic reel</h3>
          <p className="text-white/60 mb-0 text-sm max-w-xl">
            Listing photos in three layouts — Cinematic showing card, Luxury just-listed grid, and Montage polaroids.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}

      {photos.length === 0 ? (
        <p className="text-white/50">No photos on this listing to build a reel.</p>
      ) : (
        <div className="flex flex-wrap gap-8 items-start">
          <div className="relative" style={{ width: orientation === "portrait" ? 300 : 560, maxWidth: "100%" }}>
            <div
              className="relative mx-auto bg-black overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
              style={
                orientation === "portrait"
                  ? { width: 280, height: 498, borderRadius: 28, border: "8px solid #1a1a1a" }
                  : { width: "100%", aspectRatio: "16 / 9", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)" }
              }
            >
              {videoUrl ? (
                <video src={videoUrl} controls autoPlay playsInline className="w-full h-full object-cover" />
              ) : (
                <>
                  <canvas key={orientation} ref={canvasRef} width={size.w} height={size.h} className="w-full h-full" />
                  <button
                    type="button"
                    onClick={toggle}
                    className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors"
                    aria-label={playing ? "Pause reel" : "Play reel"}
                  >
                    {!playing ? (
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white">
                        <Play className="ml-0.5" fill="currentColor" />
                      </span>
                    ) : null}
                  </button>
                  {playing ? (
                    <button
                      type="button"
                      onClick={toggle}
                      className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/45 text-white flex items-center justify-center"
                      aria-label="Pause"
                    >
                      <Pause size={14} fill="currentColor" />
                    </button>
                  ) : null}
                </>
              )}
              {!ready && !videoUrl ? <KitLoader overlay /> : null}
              {making ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-white">
                  <p className="text-sm mb-2">Rendering reel</p>
                  <div className="w-40 h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-[#B082F2]" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-white/60 mt-2 mb-0">{progress}%</p>
                </div>
              ) : null}
            </div>
            {!videoUrl ? (
              <div className="mt-3 px-1">
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.05}
                  value={time}
                  onChange={(e) => {
                    setPlaying(false);
                    seek(Number(e.target.value));
                  }}
                  className="w-full accent-[#B082F2]"
                />
                <div className="flex justify-between text-[11px] font-mono text-white/45">
                  <span>{formatDuration(time)}</span>
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex-1 min-w-[240px] max-w-md">
            <p className="text-white font-medium mb-1">Just Listed</p>
            <p className="text-white/55 text-sm mb-4">
              {listing.address || "This listing"}
              {listing.price ? ` · ${listing.price}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(
                [
                  ["portrait", "9:16 Portrait"],
                  ["landscape", "16:9 Landscape"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setOrientation(id);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border"
                  style={{
                    borderColor: orientation === id ? "#B082F2" : "rgba(255,255,255,0.18)",
                    color: orientation === id ? "#fff" : "rgba(255,255,255,0.6)",
                    background: orientation === id ? "rgba(176,130,242,0.15)" : "transparent",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-1">
              {(
                [
                  ["cinematic", "Cinematic"],
                  ["luxury", "Luxury"],
                  ["montage", "Montage"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setLook(id);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border"
                  style={{
                    borderColor: look === id ? "#B082F2" : "rgba(255,255,255,0.18)",
                    color: look === id ? "#fff" : "rgba(255,255,255,0.6)",
                    background: look === id ? "rgba(176,130,242,0.15)" : "transparent",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mb-3">
              {look === "cinematic"
                ? "Showing card — hero photo + agent panel"
                : look === "luxury"
                  ? "Just Listed grid — navy header + photo slots"
                  : "Polaroid collage — stacked frames on cream"}
            </p>
            <label className="flex items-center gap-2 text-sm text-white/70 mb-2">
              <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
              Captions
            </label>
            <label className="flex items-center gap-2 text-sm text-white/70 mb-4">
              <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} />
              AI voiceover
            </label>
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-[13px] font-semibold mb-0">Music</p>
                <button
                  type="button"
                  className={`text-[13px] ${trackId ? "text-white/50" : "text-[#B082F2]"}`}
                  onClick={() => {
                    stopPreview();
                    setTrackId("");
                  }}
                >
                  No music
                </button>
              </div>
              <ul className="space-y-1 mb-2">
                {MUSIC_LIBRARY.map((t) => {
                  const selected = trackId === t.id;
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                      style={{
                        border: selected ? "1px solid #B082F2" : "1px solid rgba(255,255,255,0.1)",
                        background: selected ? "rgba(176,130,242,0.08)" : "transparent",
                      }}
                    >
                      <button
                        type="button"
                        aria-label={`${previewing === t.id ? "Pause" : "Preview"} ${t.title}`}
                        onClick={() => previewTrack(t.id)}
                        className={kitBtnCircle}
                      >
                        {previewing === t.id ? "❚❚" : "▶"}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left bg-transparent border-0 p-0"
                        onClick={() => {
                          stopPreview();
                          setTrackId(t.id);
                        }}
                      >
                        <div className="truncate text-[13px] font-medium text-white">{t.title}</div>
                        <div className="truncate text-[11px] text-white/45">
                          {t.mood} · {t.bpm} BPM
                        </div>
                      </button>
                      {selected ? <span className="text-[11px] text-[#B082F2]">✓</span> : null}
                    </li>
                  );
                })}
                {customUrl ? (
                  <li
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                    style={{
                      border: trackId === "custom" ? "1px solid #B082F2" : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => previewTrack("custom")}
                      className={kitBtnCircle}
                    >
                      {previewing === "custom" ? "❚❚" : "▶"}
                    </button>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left bg-transparent border-0 p-0 text-[13px]"
                      onClick={() => {
                        stopPreview();
                        setTrackId("custom");
                      }}
                    >
                      Your upload
                    </button>
                    {trackId === "custom" ? <span className="text-[11px] text-[#B082F2]">✓</span> : null}
                  </li>
                ) : null}
              </ul>
              <label className="block text-center rounded-lg border border-dashed border-white/20 px-2 py-2 text-[13px] text-white/50 cursor-pointer hover:border-[#B082F2]">
                ＋ Upload your own
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (customUrl) URL.revokeObjectURL(customUrl);
                    stopPreview();
                    setCustomUrl(URL.createObjectURL(file));
                    setTrackId("custom");
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="text-[11px] text-white/35 mt-1 mb-0">Use tracks you have the rights to.</p>
            </div>
            {musicUrl ? <audio ref={audioRef} src={musicUrl} loop hidden /> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggle}
                disabled={!ready || making}
                className="text-sm uppercase tracking-wide border border-white/30 text-white px-4 py-2 rounded-xl hover:bg-white/10 disabled:opacity-50"
              >
                {playing ? "Pause" : "Play preview"}
              </button>
              <button
                type="button"
                disabled={!photos.length || making}
                onClick={() => void makeReel()}
                className={kitBtn}
              >
                <Download size={14} />
                {making ? `Rendering ${progress}%` : "Download reel"}
              </button>
              <button
                type="button"
                onClick={() => void copyReel("url")}
                className="text-sm uppercase tracking-wide border border-white/30 text-white px-4 py-2 rounded-xl hover:bg-white/10"
              >
                {copied === "url" ? "Copied" : "Copy URL"}
              </button>
              <button
                type="button"
                onClick={() => void copyReel("embed")}
                className="text-sm uppercase tracking-wide border border-white/30 text-white px-4 py-2 rounded-xl hover:bg-white/10"
              >
                {copied === "embed" ? "Copied" : "Copy embed"}
              </button>
            </div>
            <p className="text-white/35 text-xs mt-3 mb-0">
              Preview is live. Download is 1080p · 60fps with parallax grade (Chrome recommended).
            </p>
            {onEditPhoto && photos.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs text-white/45 mb-2">Edit reel photos — tap a frame to swap</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.slice(0, 15).map((url, i) => (
                    <button
                      key={`${url}-${i}`}
                      type="button"
                      onClick={() => onEditPhoto(i)}
                      className="relative shrink-0 rounded overflow-hidden"
                      style={{ width: 52, height: 70, border: "1px solid rgba(255,255,255,0.2)" }}
                    >
                      <img src={url} alt={`Reel ${i + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 text-[9px] text-center" style={{ background: "rgba(0,0,0,0.65)" }}>
                        {i + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-4 h-1 bg-white/10 rounded-full overflow-hidden" aria-hidden>
              <div className="h-full bg-[#B082F2]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
