import type { MediaLayoutOption } from "@/lib/api";
import { previewStyle } from "./types";

type Props = {
  option: MediaLayoutOption & { url?: string; label?: string };
  checked: boolean;
  previewUrl?: string;
};

export function MediaRadioOption({ option, checked, previewUrl }: Props) {
  const imageSrc = previewUrl || option.image_url || option.url || "";
  const title = option.label || `Layout ${option.value}`;

  return (
    <div className={`media-pref-option ${checked ? "selected" : ""}`}>
      <div className="media-pref-option-label media-pref-option-label-readonly">
        <span className={`media-pref-radio-indicator ${checked ? "active" : ""}`} aria-hidden="true" />
        <div className="media-pref-option-body">
          {title ? <div className="media-pref-option-title">{title}</div> : null}
          <div className="media-pref-preview-wrap">
            {imageSrc ? (
              <img src={imageSrc} alt={title} className="media-pref-preview" style={previewStyle(option)} />
            ) : (
              <div className="media-pref-preview media-pref-preview-empty">No preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
