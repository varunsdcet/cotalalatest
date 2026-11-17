import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";
import { saveAs } from "file-saver";
import type { KitBrand, KitListing } from "./kit-cards";
import { formatDuration, loadReelImage } from "./reel";
import { DEFAULT_TRACK_ID, libraryTrackUrl } from "./reel-music";
import KitLoader from "./kit-loader";
import { kitBtn } from "./kit-ui";
import { stopSpeechSynthesis, usePauseWhenHidden } from "./studio-playback";
import {
  type SlideshowLook,
  drawSlideshowFrame,
  fetchRealtorVoiceUrl,
  realtorScript,
  recordSlideshow,
  slideshowDuration,
  slideshowPhotoLimit,
  slideshowSize,
  slideshowVoiceDelay,
  speakRealtor,
} from "./slideshow";

type Props = {
  photos: string[];
  listing: KitListing;
  brand: KitBrand;
  fileName: string;
  active?: boolean;
  onBrandGender?: (gender: "male" | "female") => void;
};

export default function SlideshowStudio({ photos, listing, brand, fileName, active = true, onBrandGender }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const stopSpeakRef = useRef<(() => void) | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const headshotRef = useRef<HTMLImageElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceUrlRef = useRef<string | null>(null);
  const voiceOnRef = useRef(true);
  const scriptRef = useRef("");
  const lookRef = useRef<SlideshowLook>("classic");
  const voiceGenderRef = useRef<"male" | "female">(brand.gender === "male" ? "male" : "female");
  const voiceArmedRef = useRef(false);

  const [script, setScript] = useState(() => realtorScript(listing, brand));
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [making, setMaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [look, setLook] = useState<SlideshowLook>("classic");
  const [voiceOn, setVoiceOn] = useState(true);
  const musicSrc = useMemo(() => libraryTrackUrl(DEFAULT_TRACK_ID), []);
  const voiceGender = brand.gender === "male" ? "male" : "female";
  const size = slideshowSize(look);
  const duration = useMemo(
    () => slideshowDuration(look, Math.min(photos.length, slideshowPhotoLimit(look))),
    [look, photos.length],
  );

  const pauseAll = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    voiceArmedRef.current = false;
    stopSpeakRef.current?.();
    stopSpeakRef.current = null;
    voiceAudioRef.current?.pause();
    voiceAudioRef.current = null;
    stopSpeechSynthesis();
    musicRef.current?.pause();
  }, []);

  usePauseWhenHidden(sectionRef, pauseAll);

  useEffect(() => {
    if (!active) pauseAll();
  }, [active, pauseAll]);

  const paint = (t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawSlideshowFrame(
      ctx,
      t,
      imagesRef.current,
      listing,
      brand,
      headshotRef.current,
      duration,
      size.w,
      size.h,
      logoRef.current,
      look,
    );
  };

  useEffect(() => {
    setScript(realtorScript(listing, brand));
  }, [listing.address, listing.price, listing.beds, listing.baths, listing.sqft, listing.description, brand.name]);

  useEffect(() => {
    voiceUrlRef.current = voiceUrl;
    voiceOnRef.current = voiceOn;
    scriptRef.current = script;
    lookRef.current = look;
    voiceGenderRef.current = voiceGender;
  }, [voiceUrl, voiceOn, script, look, voiceGender]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const run = async () => {
      const imgs = (await Promise.all(photos.slice(0, slideshowPhotoLimit(look)).map((u) => loadReelImage(u)))).filter(Boolean) as HTMLImageElement[];
      const [head, logo] = await Promise.all([
        brand.headshot ? loadReelImage(brand.headshot) : Promise.resolve(null),
        brand.logo ? loadReelImage(brand.logo) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      imagesRef.current = imgs;
      headshotRef.current = head;
      logoRef.current = logo;
      setReady(true);
      paint(0);
    };
    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      pauseAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, brand.headshot, brand.logo, look]);

  useEffect(() => {
    let cancelled = false;
    setVoiceReady(false);
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoiceUrl(null);
    if (!voiceOn) {
      setVoiceReady(true);
      return;
    }
    const run = async () => {
      const url = await fetchRealtorVoiceUrl(script, voiceGender);
      if (cancelled) return;
      setVoiceUrl(url);
      setVoiceReady(true);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, voiceGender, voiceOn]);

  useEffect(() => {
    return () => {
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    };
  }, [voiceUrl]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    audio.volume = voiceOn && voiceUrl ? 0.12 : 0.45;
    if (playing && musicOn) {
      try {
        const len = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 36;
        audio.currentTime = clockRef.current % len;
      } catch {
        /* duration unknown */
      }
      void audio.play().catch(() => null);
    } else {
      audio.pause();
    }
  }, [playing, musicOn, voiceUrl, voiceOn]);

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
        voiceArmedRef.current = false;
        setPlaying(false);
        setTime(duration);
        paint(duration - 0.001);
        stopSpeakRef.current?.();
        return;
      }
      setTime(clockRef.current);
      paint(clockRef.current);
      if (!voiceArmedRef.current && voiceOnRef.current) {
        const delay = slideshowVoiceDelay(lookRef.current);
        if (clockRef.current + 0.001 >= delay) {
          voiceArmedRef.current = true;
          const offset = Math.max(0, clockRef.current - delay);
          if (voiceUrlRef.current) {
            const a = new Audio(voiceUrlRef.current);
            voiceAudioRef.current = a;
            try {
              a.currentTime = offset;
            } catch {
              /* not seekable yet */
            }
            void a.play().catch(() => {
              stopSpeakRef.current = speakRealtor(scriptRef.current, undefined, voiceGenderRef.current);
            });
            stopSpeakRef.current = () => {
              a.pause();
              voiceAudioRef.current = null;
            };
          } else {
            stopSpeakRef.current = speakRealtor(scriptRef.current, undefined, voiceGenderRef.current);
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    if (playing) {
      lastRef.current = 0;
      playingRef.current = true;
      rafRef.current = requestAnimationFrame(loop);
    } else {
      playingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      voiceArmedRef.current = false;
      stopSpeakRef.current?.();
    }
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration, listing, brand, look]);

  const seek = (next: number) => {
    const t = Math.max(0, Math.min(duration, next));
    clockRef.current = t;
    setTime(t);
    paint(t);
    if (playingRef.current) {
      voiceArmedRef.current = false;
      stopSpeakRef.current?.();
      stopSpeakRef.current = null;
      voiceAudioRef.current?.pause();
      voiceAudioRef.current = null;
    }
  };

  const toggle = () => {
    if (!ready || making) return;
    if (clockRef.current >= duration - 0.05) {
      clockRef.current = 0;
      setTime(0);
    }
    setPlaying((p) => !p);
  };

  useEffect(() => {
    pauseAll();
    clockRef.current = 0;
    setTime(0);
  }, [look, pauseAll]);

  const make = async () => {
    setError(null);
    setMaking(true);
    pauseAll();
    setProgress(0);
    try {
      const blob = await recordSlideshow({
        photos,
        listing,
        brand,
        script,
        voiceUrl: voiceOn ? voiceUrl : null,
        music: musicOn,
        look,
        onProgress: setProgress,
      });
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      saveAs(blob, `${fileName}.${ext}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render slideshow");
    } finally {
      setMaking(false);
    }
  };

  return (
    <section id="slideshows" ref={sectionRef} className="scroll-mt-44">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#E8A13D] border border-[#E8A13D]/40 rounded-full px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8A13D]" />
            Ready
          </span>
          <span className="text-white/45 text-xs font-mono">
            {size.w}×{size.h} · 60fps · 20 Mbps
          </span>
        </div>
        <h3 className="text-2xl font-semibold mb-1">Slideshow</h3>
        <p className="text-white/60 mb-0 text-sm max-w-xl">
          Sharp listing photos in the Classic, Square, and Just listed layouts — same look as the reference videos.
        </p>
      </div>

      {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}

      {look !== "square" && !brand.headshot ? (
        <p className="text-amber-300/80 text-sm mb-3">Add a realtor headshot in Profile so the closing card is you.</p>
      ) : null}

      {photos.length === 0 ? (
        <p className="text-white/50">No photos on this listing to build a slideshow.</p>
      ) : (
        <div className="flex flex-wrap gap-8 items-start">
          <div className="relative" style={{ width: look === "square" ? 420 : 640, maxWidth: "100%" }}>
            <div
              className="relative bg-black overflow-hidden rounded-xl"
              style={{ aspectRatio: `${size.w} / ${size.h}`, border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <canvas ref={canvasRef} width={size.w} height={size.h} className="w-full h-full" />
              <button
                type="button"
                onClick={toggle}
                className="absolute inset-0 flex items-center justify-center"
                aria-label={playing ? "Pause" : "Play"}
              >
                {!playing ? (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white">
                    <Play className="ml-0.5" fill="currentColor" />
                  </span>
                ) : (
                  <span className="absolute top-3 left-3 h-8 w-8 rounded-full bg-black/45 text-white flex items-center justify-center">
                    <Pause size={14} fill="currentColor" />
                  </span>
                )}
              </button>
              {!ready ? <KitLoader overlay /> : null}
              {making ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-white">
                  <p className="text-sm mb-2">Rendering slideshow</p>
                  <div className="w-40 h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-[#B082F2]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-white/45 text-xs font-mono w-10">{formatDuration(time)}</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={time}
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 accent-[#B082F2]"
              />
              <span className="text-white/45 text-xs font-mono w-10 text-right">{formatDuration(duration)}</span>
            </div>
            <audio ref={musicRef} src={musicSrc} loop preload="auto" />
          </div>

          <div className="flex-1 min-w-[240px] max-w-md">
            <p className="text-white font-medium mb-2">Look</p>
            <div className="flex flex-wrap gap-2 mb-1">
              {(
                [
                  ["classic", "Classic"],
                  ["square", "Square"],
                  ["listed", "Just listed"],
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
            <p className="text-[11px] text-white/40 mb-4">
              {look === "classic"
                ? "Title card, full-bleed photos, frost stats bar, agent outro"
                : look === "square"
                  ? "Centered address overlay, logo badge, equal-housing mark"
                  : "Diagonal just listed, feature callouts, showing CTA, agent card"}
            </p>
            <label className="flex items-center gap-2 text-sm text-white/70 mb-2">
              <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} />
              AI voiceover (natural)
            </label>
            {voiceOn ? (
              <>
                <p className="text-white/50 text-sm mb-2">
                  {voiceReady && voiceUrl
                    ? `Natural ${voiceGender} voice ready.`
                    : voiceReady
                      ? `Using browser ${voiceGender} voice.`
                      : "Preparing a natural voice…"}
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-white/45">Voice</span>
                  {(["female", "male"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => onBrandGender?.(g)}
                      className={`text-xs uppercase tracking-wide px-3 py-1.5 rounded-lg border ${
                        voiceGender === g
                          ? "bg-white text-black border-white"
                          : "border-white/25 text-white/65 hover:border-white/50"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/15 text-white mb-3"
                />
              </>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-white/70 mb-3">
              <input type="checkbox" checked={musicOn} onChange={(e) => setMusicOn(e.target.checked)} />
              Music bed
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggle}
                disabled={!ready || making}
                className="text-sm uppercase tracking-wide border border-white/30 text-white px-4 py-2 rounded-xl hover:bg-white/10 disabled:opacity-50"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                disabled={!photos.length || making}
                onClick={() => void make()}
                className={kitBtn}
              >
                <Download size={14} />
                {making ? `Rendering ${progress}%` : "Download slideshow"}
              </button>
              {voiceOn ? (
                <button
                  type="button"
                  className="text-sm uppercase tracking-wide border border-white/30 text-white px-4 py-2 rounded-xl"
                  onClick={() => setScript(realtorScript(listing, brand))}
                >
                  Rewrite script
                </button>
              ) : null}
            </div>
            <p className="text-white/35 text-xs mt-3 mb-0">
              MP4/WebM at reference size and bitrate. Photos stay sharp — no grade, no karaoke captions.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
