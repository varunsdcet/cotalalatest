import { useEffect, useMemo, useRef, useState } from "react";
import { copyText, downloadPhotoFile, embedCodeFor } from "./kit-download";
import type { KitBrand, KitListing } from "./kit-cards";
import { listingVideoCandidates, orderedListingPhotos, youtubeIdFrom } from "./listing-photos";
import { kitBtnSm } from "./kit-ui";
import { pickRecorderMime, type ReelLook } from "./reel";
import { DEFAULT_TRACK_ID, libraryTrackUrl } from "./reel-music";
import { recordListingReel } from "./reel";
import { fetchRealtorVoiceUrl, realtorScript } from "./slideshow";

const MIN_REAL_DURATION = 0.5;
const generatedUrlByTour = new Map<string, string>();
const generatingByTour = new Map<string, Promise<string>>();

type Props = {
  tourId: string;
  fileUrl?: string;
  youtubeUrl?: string;
  poster?: string;
  address?: string;
  photos?: string[];
  listing?: KitListing;
  brand?: KitBrand;
};

function probeVideoUrl(url: string, timeoutMs = 1800): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      video.remove();
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    video.onloadedmetadata = () => {
      const d = video.duration;
      finish(Number.isFinite(d) && d >= MIN_REAL_DURATION);
    };
    video.onerror = () => finish(false);
    video.src = url;
  });
}

async function firstWorkingVideo(urls: string[]): Promise<string> {
  if (!urls.length) return "";
  const ok = await Promise.all(urls.map((u) => probeVideoUrl(u)));
  const i = ok.findIndex(Boolean);
  return i >= 0 ? urls[i] : "";
}

async function blobIsPlayable(url: string, blob: Blob, timeoutMs = 6000): Promise<boolean> {
  if (blob.size < 8000) return false;
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = "position:fixed;left:-9999px;width:8px;height:8px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      resolve(ok);
    };
    const acceptIfReady = () => {
      const d = video.duration;
      if (Number.isFinite(d)) {
        finish(d >= MIN_REAL_DURATION);
        return;
      }
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish(true);
    };
    const timer = window.setTimeout(() => finish(blob.size >= 24_000), timeoutMs);
    video.onerror = () => finish(false);
    video.onloadedmetadata = acceptIfReady;
    video.oncanplay = () => {
      const d = video.duration;
      if (Number.isFinite(d)) finish(d >= MIN_REAL_DURATION);
      else finish(true);
    };
    video.src = url;
    void video.play().then(acceptIfReady).catch(() => null);
  });
}

function videoExtension(blob: Blob): string {
  const mime = blob.type || pickRecorderMime() || "video/webm";
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

const LOOKS: { id: ReelLook; label: string }[] = [
  { id: "cinematic", label: "Cinematic" },
  { id: "luxury", label: "Luxury" },
  { id: "montage", label: "Montage" },
];

function cacheKey(tourId: string, look: ReelLook) {
  return `${tourId}:${look}`;
}

async function generateListingFilm(
  tourId: string,
  photos: string[],
  listing: KitListing,
  brand: KitBrand,
  look: ReelLook,
  onProgress: (pct: number) => void,
  force = false,
): Promise<string> {
  const key = cacheKey(tourId, look);
  if (force) {
    const old = generatedUrlByTour.get(key);
    if (old) URL.revokeObjectURL(old);
    generatedUrlByTour.delete(key);
  }
  const cached = generatedUrlByTour.get(key);
  if (cached) return cached;
  const existing = generatingByTour.get(key);
  if (existing) return existing;

  const run = (async () => {
    const ordered = orderedListingPhotos(photos);
    const script = realtorScript(listing, brand);
    const voiceGender = brand.gender === "male" ? "male" : "female";
    let voiceUrl: string | null = null;
    try {
      voiceUrl = await fetchRealtorVoiceUrl(script, voiceGender);
    } catch {
      voiceUrl = null;
    }
    const audioUrl = libraryTrackUrl(DEFAULT_TRACK_ID);
    let blob: Blob;
    try {
      blob = await recordListingReel({
        photos: ordered,
        listing,
        brand,
        voiceUrl,
        audioUrl,
        look,
        orientation: "landscape",
        captions: true,
        onProgress,
      });
    } catch {
      blob = await recordListingReel({
        photos: ordered,
        listing,
        brand,
        voiceUrl,
        audioUrl: null,
        look,
        orientation: "landscape",
        captions: true,
        onProgress,
      });
    }
    const url = URL.createObjectURL(blob);
    const ok = await blobIsPlayable(url, blob);
    if (!ok) {
      URL.revokeObjectURL(url);
      throw new Error("Created video was empty. Refresh this page and try Create listing film.");
    }
    generatedUrlByTour.set(key, url);
    return url;
  })();

  generatingByTour.set(key, run);
  try {
    return await run;
  } finally {
    generatingByTour.delete(key);
  }
}

export default function ListingVideo({
  tourId,
  fileUrl,
  youtubeUrl,
  poster,
  address,
  photos = [],
  listing,
  brand,
}: Props) {
  const listingRef = useRef(listing);
  const brandRef = useRef(brand);
  const photosRef = useRef(photos);
  const tourIdRef = useRef(tourId);
  const blobExtRef = useRef("webm");
  listingRef.current = listing;
  brandRef.current = brand;
  photosRef.current = photos;
  tourIdRef.current = tourId;

  const [look, setLook] = useState<ReelLook>("cinematic");
  const [busy, setBusy] = useState<"dl" | "url" | "embed" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<"probe" | "play" | "make" | "empty">("probe");
  const [playUrl, setPlayUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [isGenerated, setIsGenerated] = useState(false);

  const ytId = youtubeIdFrom(youtubeUrl || fileUrl);
  const candidates = useMemo(() => listingVideoCandidates(tourId, fileUrl), [tourId, fileUrl]);
  const hasPhotos = photos.length > 0;
  const embedSrc = ytId && !playUrl ? `https://www.youtube.com/embed/${ytId}` : "";
  const isHostedUrl = Boolean(playUrl && !playUrl.startsWith("blob:"));
  const shareUrl = isHostedUrl ? playUrl : youtubeUrl || "";
  const embedCode = shareUrl ? embedCodeFor(shareUrl, address || "Listing video", "video") : "";
  const showYoutube = Boolean(ytId) && !playUrl && phase === "play";

  const startGenerate = (force = false) => {
    const shot = photosRef.current;
    const list = listingRef.current;
    const kit = brandRef.current;
    const generatedFor = tourId;
    if (!shot.length || !list || !kit) {
      setPhase("empty");
      setGenError(shot.length ? null : "Add listing photos and we'll build a premium film automatically.");
      return;
    }
    setPhase("make");
    if (force) setProgress(0);
    setGenError(null);
    void generateListingFilm(
      generatedFor,
      shot,
      list,
      kit,
      look,
      (pct) => {
        if (tourIdRef.current === generatedFor) setProgress(pct);
      },
      force,
    )
      .then((url) => {
        if (tourIdRef.current !== generatedFor) return;
        setPlayUrl(url);
        setIsGenerated(true);
        setProgress(100);
        setPhase("play");
      })
      .catch((err) => {
        if (tourIdRef.current !== generatedFor) return;
        setGenError(err instanceof Error ? err.message : "Could not build listing video.");
        setPhase("empty");
      });
  };

  useEffect(() => {
    let cancelled = false;
    const key = cacheKey(tourId, look);
    const cached = generatedUrlByTour.get(key);
    if (cached) {
      setPlayUrl(cached);
      setIsGenerated(true);
      setPhase("play");
      return;
    }

    setPlayUrl("");
    setIsGenerated(false);
    setGenError(null);
    setProgress(0);

    const inflight = generatingByTour.get(key);
    if (inflight) {
      setPhase("make");
      void inflight
        .then((url) => {
          if (cancelled) return;
          setPlayUrl(url);
          setIsGenerated(true);
          setPhase("play");
        })
        .catch((err) => {
          if (cancelled) return;
          setGenError(err instanceof Error ? err.message : "Could not build listing video.");
          setPhase("empty");
        });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      setPhase("probe");
      const found = await firstWorkingVideo(candidates);
      if (cancelled) return;
      if (found) {
        setPlayUrl(found);
        setIsGenerated(false);
        setPhase("play");
        return;
      }
      if (ytId) {
        setPhase("play");
        return;
      }
      const shot = photosRef.current;
      const list = listingRef.current;
      const kit = brandRef.current;
      if (!shot.length || !list || !kit) {
        setPhase("empty");
        return;
      }
      setPhase("make");
      try {
        const url = await generateListingFilm(tourId, shot, list, kit, look, (pct) => {
          if (!cancelled) setProgress(pct);
        });
        if (cancelled) return;
        setPlayUrl(url);
        setIsGenerated(true);
        setProgress(100);
        setPhase("play");
      } catch (err) {
        if (cancelled) return;
        setGenError(err instanceof Error ? err.message : "Could not build listing video.");
        setPhase("empty");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, fileUrl, ytId, hasPhotos, candidates.join("|"), look]);

  const run = async (kind: "dl" | "url" | "embed", fn: () => Promise<void>) => {
    setNote(null);
    setBusy(kind);
    try {
      await fn();
      if (kind !== "dl") setNote("Copied");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const count = playUrl || showYoutube ? "1" : phase === "make" || phase === "probe" ? "…" : "0";

  return (
    <section id="video" className="scroll-mt-44">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <h3 className="text-xl font-semibold mb-0">
          Video <span className="text-sm font-mono text-white/40">{count}</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {LOOKS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setLook(opt.id)}
              className={`text-[11px] uppercase tracking-wide px-2.5 py-1 rounded border ${
                look === opt.id
                  ? "border-[#B082F2] text-white bg-[#B082F2]/20"
                  : "border-white/25 text-white/60"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-white/45 text-sm mb-0 w-full sm:w-auto">
          {isGenerated ? `${look} film · 60fps · download` : "Listing walkthrough · download · embed"}
        </p>
      </div>

      {phase === "play" && (playUrl || showYoutube) ? (
        <div className="rounded-xl overflow-hidden" style={{ background: "#0b0b0c", border: "1px solid #1a1a1a" }}>
          <div className="bg-black aspect-video">
            {playUrl ? (
              <video
                key={playUrl}
                src={playUrl}
                poster={poster}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full object-contain"
              />
            ) : (
              <iframe
                src={embedSrc}
                title={address || "Listing video"}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            )}
          </div>
          <div className="p-4 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold mr-auto mb-0">
              {isGenerated ? "Cinematic listing film" : address || "Property video"}
            </p>
            {playUrl ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  const ext = blobExtRef.current;
                  void run("dl", async () => {
                    if (playUrl.startsWith("blob:")) {
                      const res = await fetch(playUrl);
                      const blob = await res.blob();
                      blobExtRef.current = videoExtension(blob);
                      await downloadPhotoFile(playUrl, `listing_${tourId}_video.${blobExtRef.current}`);
                    } else {
                      await downloadPhotoFile(playUrl, `listing_${tourId}_video.mp4`);
                    }
                  });
                }}
                className={kitBtnSm}
              >
                {busy === "dl" ? "Saving…" : "Download"}
              </button>
            ) : null}
            {hasPhotos && listing && brand && !isGenerated ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => startGenerate(true)}
                className="text-[11px] uppercase tracking-wide border border-white/30 text-white px-3 py-1.5 rounded"
              >
                Make film
              </button>
            ) : null}
            {youtubeUrl && !isGenerated ? (
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] uppercase tracking-wide border border-white/30 text-white px-3 py-1.5 rounded"
              >
                YouTube
              </a>
            ) : null}
            {shareUrl ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("url", () => copyText(shareUrl))}
                className="text-[11px] uppercase tracking-wide border border-white/30 text-white px-3 py-1.5 rounded disabled:opacity-50"
              >
                {busy === "url" ? "…" : "Copy URL"}
              </button>
            ) : null}
            {embedCode ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("embed", () => copyText(embedCode))}
                className="text-[11px] uppercase tracking-wide border border-white/30 text-white px-3 py-1.5 rounded disabled:opacity-50"
              >
                {busy === "embed" ? "…" : "Copy embed"}
              </button>
            ) : null}
            {isGenerated && !shareUrl ? (
              <span className="text-[11px] text-white/40">Download to share locally</span>
            ) : null}
            {note ? <span className="text-xs text-white/50">{note}</span> : null}
          </div>
        </div>
      ) : phase === "probe" || phase === "make" ? (
        <div className="rounded-xl overflow-hidden" style={{ background: "#0b0b0c", border: "1px solid #1a1a1a" }}>
          <div className="aspect-video flex flex-col items-center justify-center bg-black px-8">
            <p className="text-white text-sm mb-3">
              {phase === "probe" ? "Looking for listing video…" : "Creating a cinematic listing film…"}
            </p>
            <div className="w-56 h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#B082F2] transition-[width]"
                style={{ width: `${phase === "probe" ? 12 : progress}%` }}
              />
            </div>
            <p className="text-white/40 text-xs mt-2 mb-0">
              {phase === "probe" ? "Skipping empty stubs" : `${progress}% · cinematic reel · voice + music`}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-6" style={{ background: "#0b0b0c", border: "1px solid #1a1a1a" }}>
          <p className="text-white/60 mb-1">{genError || "No walkthrough video on this listing yet."}</p>
          <p className="text-white/40 text-sm mb-4">
            {hasPhotos
              ? "We'll build a cinematic film from this listing's photos."
              : "Add listing photos and we'll build a cinematic film automatically."}
          </p>
          {hasPhotos && listing && brand ? (
            <button type="button" className={kitBtnSm} onClick={() => startGenerate(true)}>
              Create listing film
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
