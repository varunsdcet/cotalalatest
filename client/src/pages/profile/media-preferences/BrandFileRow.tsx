import type { MediaBrandFile } from "@/lib/api";
import { previewStyle } from "./types";

type Props = {
  file: MediaBrandFile;
};

export function BrandFileRow({ file }: Props) {
  const imageSrc = file.url || "";

  return (
    <div className="media-pref-brand-row">
      <div className="media-pref-brand-copy">
        <div className="media-pref-brand-title">{file.label}</div>
        {file.description ? <div className="media-pref-brand-desc">{file.description}</div> : null}
      </div>
      <div className="media-pref-preview-wrap">
        {imageSrc ? (
          <img src={imageSrc} alt={file.label} className="media-pref-preview" style={previewStyle(file)} />
        ) : (
          <div className="media-pref-preview media-pref-preview-empty">No file</div>
        )}
      </div>
      {file.full_resolution_url ? (
        <div className="media-pref-brand-actions">
          <a href={file.full_resolution_url} target="_blank" rel="noopener noreferrer" className="media-pref-link">
            View full resolution
          </a>
        </div>
      ) : null}
    </div>
  );
}
