import { useCallback, useEffect, useMemo, useState } from "react";
import { getPortalMediaPreferences, type MediaPreferencesData } from "@/lib/api";
import { BrandFileRow } from "./BrandFileRow";
import { MediaRadioOption } from "./MediaRadioOption";
import { brandFileEntries } from "./types";
import "./media-preferences.css";

function readSelectedLayout(data: MediaPreferencesData | null) {
  const selected = data?.contact_card?.selected || "";
  if (selected) return selected;
  const layout = data?.contact_card?.layouts?.find((item) => item.selected);
  if (layout?.value) return layout.value;
  if (data?.contact_card?.custom_graphic?.selected) return data.contact_card.custom_graphic.value || "c";
  return "";
}

export default function MediaPreferences() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MediaPreferencesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getPortalMediaPreferences();
      if (!res.status || !res.data) {
        setError(res.msg || "Unable to load media preferences");
        return;
      }
      setData(res.data);
    } catch (err) {
      console.error(err);
      setError("Unable to load media preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const brandRows = useMemo(() => brandFileEntries(data?.brand_files), [data]);
  const selectedLayout = readSelectedLayout(data);
  const headerStyle =
    data?.style_and_colour?.headerStyle ||
    data?.style_and_colour?.header_style_options?.find((o) => o.selected)?.label ||
    "—";
  const colours = [
    ["Background", data?.style_and_colour?.bgColour],
    ["Text", data?.style_and_colour?.textColour],
    ["Accent", data?.style_and_colour?.accentColour],
    ["Accent Text", data?.style_and_colour?.accentTextcolour],
  ] as const;

  if (loading) {
    return <div className="text-white/70 py-8">Loading media preferences...</div>;
  }

  if (error && !data) {
    return <p className="media-pref-msg error">{error}</p>;
  }

  const customGraphic = data?.contact_card?.custom_graphic;

  return (
    <div className="media-pref-page">
      <h2>{data?.title || "Media Preferences"}</h2>
      <p className="service-package-desc mb-8">Your current media layouts, brand files, and colour styling on file.</p>

      <section className="media-pref-section">
        <h5>Style &amp; Colour</h5>
        <div className="media-pref-readonly-grid">
          <div>
            <div className="media-pref-readonly-label">Header Style</div>
            <div className="email-value">{headerStyle}</div>
          </div>
          {colours.map(([label, value]) => (
            <div key={label}>
              <div className="media-pref-readonly-label">{label}</div>
              <div className="media-pref-colour-readonly">
                {value ? <span className="media-pref-swatch" style={{ backgroundColor: value }} /> : null}
                <span className="email-value">{value || "—"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="media-pref-section">
        <h5>Brand Files</h5>
        <div className="media-pref-stack">
          {brandRows.length === 0 ? <div className="email-value">No brand files on file.</div> : null}
          {brandRows.map(([key, file]) => (
            <BrandFileRow key={key} file={file} />
          ))}
        </div>
      </section>

      <section className="media-pref-section">
        <h5>Contact Card Layout</h5>
        <div className="media-pref-stack">
          {(data?.contact_card?.layouts || []).map((layout) => (
            <MediaRadioOption
              key={layout.value}
              option={layout}
              checked={selectedLayout === layout.value}
              previewUrl={layout.image_url}
            />
          ))}
          {customGraphic ? (
            <MediaRadioOption
              option={{
                ...customGraphic,
                label: customGraphic.label || "Custom Graphic (JPG) @ 300 ppi",
                value: customGraphic.value || "c",
              }}
              checked={selectedLayout === (customGraphic.value || "c")}
              previewUrl={customGraphic.url}
            />
          ) : null}
        </div>
      </section>

      <section className="media-pref-section">
        <h5>Video Intro</h5>
        <div className="media-pref-stack">
          {data?.video_intro?.static ? <BrandFileRow file={data.video_intro.static} /> : null}
          {data?.video_intro?.animated ? (
            <div className="media-pref-readonly-block">
              <div className="media-pref-readonly-label">
                {data.video_intro.animated.label || "Video Intro - Animated"}
              </div>
              <div className="email-value">{data.video_intro.animated.value || "—"}</div>
            </div>
          ) : null}
        </div>
      </section>

      {error ? <p className="media-pref-msg error">{error}</p> : null}
    </div>
  );
}
