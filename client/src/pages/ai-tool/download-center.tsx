import { useMemo, useState } from "react";
import { downloadPhotoFile, downloadPhotosResizedZip, downloadPhotosZip } from "./kit-download";
import { kitBtnSm, kitBtnXs } from "./kit-ui";

type Props = {
  tourId: string;
  photos: string[];
  floorplans: string[];
};

export default function DownloadCenter({ tourId, photos, floorplans }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [zipping, setZipping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<number | null>(null);
  const [customW, setCustomW] = useState("1920");
  const [customH, setCustomH] = useState("1080");

  const selectedUrls = useMemo(
    () => photos.filter((_, i) => selected.has(i)),
    [photos, selected],
  );

  const runZip = async (kind: string, fn: () => Promise<unknown>) => {
    setError(null);
    setZipping(kind);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setZipping(null);
    }
  };

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const allOn = selected.size === photos.length && photos.length > 0;
  const w = Math.min(8000, Math.max(200, Number(customW) || 1920));
  const h = Math.min(8000, Math.max(200, Number(customH) || 1080));

  return (
    <section id="photos" className="scroll-mt-44">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <h3 className="text-xl font-semibold mb-0">
          Photos <span className="text-sm font-mono text-white/40">{photos.length}</span>
        </h3>
        <p className="text-white/45 text-sm mb-0">Original · MLS unbranded · custom size</p>
      </div>

      {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {[
          {
            id: "original",
            title: "Original",
            hint: "Full uploaded size",
            action: () => runZip("original", () => downloadPhotosZip(photos, `listing_${tourId}_original.zip`)),
          },
          {
            id: "mls",
            title: "MLS",
            hint: "Unbranded listing photos",
            action: () => runZip("mls", () => downloadPhotosZip(photos, `listing_${tourId}_mls.zip`)),
          },
          {
            id: "custom",
            title: "Custom",
            hint: `Fit within ${w}×${h}`,
            action: () =>
              runZip("custom", () =>
                downloadPhotosResizedZip(photos, `listing_${tourId}_custom_${w}x${h}.zip`, w, h),
              ),
          },
        ].map((tile) => (
          <div key={tile.id} className="rounded-xl p-4" style={{ background: "#0b0b0c", border: "1px solid #1a1a1a" }}>
            <p className="font-semibold mb-1">{tile.title}</p>
            <p className="text-xs text-white/45 mb-3">{tile.hint}</p>
            {tile.id === "custom" ? (
              <div className="flex gap-2 mb-3">
                <input
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full rounded px-2 py-1.5 text-sm bg-black/40 border border-white/15 text-white"
                  placeholder="W"
                />
                <input
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full rounded px-2 py-1.5 text-sm bg-black/40 border border-white/15 text-white"
                  placeholder="H"
                />
              </div>
            ) : null}
            <button
              type="button"
              disabled={!photos.length || zipping !== null}
              onClick={() => void tile.action()}
              className={kitBtnSm}
            >
              {zipping === tile.id ? "Preparing…" : "Download all"}
            </button>
          </div>
        ))}
      </div>

      {floorplans.length > 0 ? (
        <div className="mb-6">
          <h4 className="text-base font-semibold mb-3">Floor plans</h4>
          <div className="flex flex-wrap gap-3">
            {floorplans.map((url, i) => (
              <a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer" className="block w-40">
                {/\.pdf($|\?)/i.test(url) ? (
                  <div className="aspect-[3/4] rounded bg-white/5 flex items-center justify-center text-sm text-white/60">
                    PDF {i + 1}
                  </div>
                ) : (
                  <img src={url} alt={`Floor plan ${i + 1}`} className="w-full aspect-[3/4] object-cover rounded" />
                )}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-white/55 text-sm mb-0">Individual photos</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-[11px] uppercase tracking-wide border border-white/30 text-white px-3 py-1.5 rounded"
            onClick={() => setSelected(allOn ? new Set() : new Set(photos.map((_, i) => i)))}
          >
            {allOn ? "Clear" : "Select all"}
          </button>
          <button
            type="button"
            disabled={!selectedUrls.length || zipping !== null}
            onClick={() =>
              void runZip("selected", () => downloadPhotosZip(selectedUrls, `listing_${tourId}_selected.zip`))
            }
            className={kitBtnSm}
          >
            {zipping === "selected" ? "Preparing…" : `Download selected (${selected.size})`}
          </button>
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="text-white/50">No photos for this listing yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {photos.map((url, idx) => {
            const on = selected.has(idx);
            return (
              <div key={`${url}-${idx}`} className="relative">
                <button
                  type="button"
                  className="block w-full p-0 border-0 rounded overflow-hidden"
                  style={{ outline: on ? "2px solid #B082F2" : "none" }}
                  onClick={() => toggle(idx)}
                >
                  <img src={url} alt={`#${idx + 1}`} className="w-full aspect-square object-cover" />
                </button>
                <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.7)" }}>
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  disabled={photoBusy === idx}
                  className={`absolute bottom-1 right-1 ${kitBtnXs}`}
                  onClick={() => {
                    setPhotoBusy(idx);
                    void downloadPhotoFile(url, `listing_${tourId}_${String(idx + 1).padStart(3, "0")}.jpg`).finally(
                      () => setPhotoBusy(null),
                    );
                  }}
                >
                  {photoBusy === idx ? "…" : "Save"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
