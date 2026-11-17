import { useState } from "react";
import { saveAs } from "file-saver";
import type { KitBrand, KitListing } from "./kit-cards";
import { orderedListingPhotos } from "./listing-photos";
import { pickRecorderMime } from "./reel";
import { DEFAULT_TRACK_ID, libraryTrackUrl } from "./reel-music";
import { recordListingReel } from "./reel";
import { fetchRealtorVoiceUrl, realtorScript } from "./slideshow";
import { kitBtnSm } from "./kit-ui";

type Props = {
  photos: string[];
  listing: KitListing;
  brand: KitBrand;
  tourId: string;
};

function videoExt(blob: Blob): string {
  return blob.type.startsWith("video/mp4") ? "mp4" : "webm";
}

export default function StoryStudio({ photos, listing, brand, tourId }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const exportStory = async () => {
    if (!photos.length) {
      setError("Add listing photos first.");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const ordered = orderedListingPhotos(photos).slice(0, 6);
      const script = realtorScript(listing, brand);
      const voiceGender = brand.gender === "male" ? "male" : "female";
      let voiceUrl: string | null = null;
      try {
        voiceUrl = await fetchRealtorVoiceUrl(script, voiceGender);
      } catch {
        voiceUrl = null;
      }
      let blob: Blob;
      try {
        blob = await recordListingReel({
          photos: ordered,
          listing,
          brand,
          voiceUrl,
          audioUrl: libraryTrackUrl(DEFAULT_TRACK_ID),
          look: "montage",
          orientation: "portrait",
          captions: true,
          onProgress: setProgress,
        });
      } catch {
        blob = await recordListingReel({
          photos: ordered,
          listing,
          brand,
          voiceUrl,
          audioUrl: null,
          look: "montage",
          orientation: "portrait",
          captions: true,
          onProgress: setProgress,
        });
      }
      if (url) URL.revokeObjectURL(url);
      const next = URL.createObjectURL(blob);
      setUrl(next);
      saveAs(blob, `${tourId}_story_reel.${videoExt(blob)}`);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export story video.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl p-4" style={{ background: "#0b0b0c", border: "1px solid #1a1a1a" }}>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <p className="text-sm font-semibold mb-0 text-white">Animated story reel</p>
        <p className="text-xs text-white/45 mb-0">9:16 · montage · voice + music</p>
      </div>
      {url ? (
        <video src={url} controls playsInline className="w-full max-w-[220px] rounded-lg mb-3 aspect-[9/16] bg-black" />
      ) : null}
      {busy ? (
        <div className="w-full max-w-xs h-1.5 bg-white/15 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-[#B082F2] transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-400 mb-2">{error}</p> : null}
      <button type="button" className={kitBtnSm} disabled={busy || !photos.length} onClick={() => void exportStory()}>
        {busy ? `Exporting ${progress}%…` : "Export story video"}
      </button>
      {!pickRecorderMime() ? (
        <p className="text-[11px] text-white/40 mt-2 mb-0">Chrome recommended for video export.</p>
      ) : null}
    </div>
  );
}
