import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { getSettingsPreferences, saveSettingsPreferences } from "@/lib/api";
import photoFallback from "@/pages/images/standard-real-estate-photography-4-1024x683.jpg";
import videoFallback from "@/pages/images/hdr.jpg";
import floorPlanFallback from "@/pages/images/img-5.png";
import printFallback from "@/pages/images/p-2.jpg";
import { NoticeLine, SectionError, SectionLoading } from "./shared";
import { apiMessage, asArray, asRecord, asString, errorText, type Notice } from "./helpers";

type Option = { title: string; value: string; image: string };

type MultiKey = "photography" | "print_addons" | "floorplans_and_matterport" | "video" | "floorplan_options";

type Selected = {
  photography: string[];
  print_addons: string[];
  video: string[];
  video_orientation: string;
  floorplans_and_matterport: string[];
  floorplan_options: string[];
  media_options: { auto_upload_photos_to_mls: string; listing_webpage_visibility: string };
};

type Master = {
  photography: Option[];
  print_addons: Option[];
  video: Option[];
  video_orientation: Option[];
  floorplans_and_matterport: Option[];
  floorplan_options: Option[];
  auto_upload_photos_to_mls: Option[];
  listing_webpage_visibility: Option[];
};

const EMPTY_SELECTED: Selected = {
  photography: [],
  print_addons: [],
  video: [],
  video_orientation: "horizontal",
  floorplans_and_matterport: [],
  floorplan_options: [],
  media_options: { auto_upload_photos_to_mls: "yes", listing_webpage_visibility: "public" },
};

const DEFAULT_CHOICES = {
  video_orientation: [
    { title: "Horizontal", value: "horizontal", image: "" },
    { title: "Vertical (Best for Mobile)", value: "vertical", image: "" },
  ],
  auto_upload_photos_to_mls: [
    { title: "Yes", value: "yes", image: "" },
    { title: "No", value: "no", image: "" },
  ],
  listing_webpage_visibility: [
    { title: "Public", value: "public", image: "" },
    { title: "Hidden", value: "hidden", image: "" },
  ],
};

const CARD_GROUPS: Array<{ key: Exclude<MultiKey, "floorplan_options">; title: string; fallback: string }> = [
  { key: "photography", title: "Photography", fallback: photoFallback },
  { key: "print_addons", title: "Print Add-on", fallback: printFallback },
  { key: "floorplans_and_matterport", title: "Floorplans and Matterport", fallback: floorPlanFallback },
  { key: "video", title: "Video", fallback: videoFallback },
];

function readOptions(raw: unknown): Option[] {
  return asArray(raw)
    .map(asRecord)
    .filter((o) => asString(o.value))
    .map((o) => ({ title: asString(o.title) || asString(o.value), value: asString(o.value), image: asString(o.image) }));
}

function readStrings(raw: unknown) {
  return asArray(raw).map((v) => asString(v)).filter(Boolean);
}

function readSelected(raw: unknown): Selected {
  const s = asRecord(raw);
  const media = asRecord(s.media_options);
  return {
    photography: readStrings(s.photography),
    print_addons: readStrings(s.print_addons),
    video: readStrings(s.video),
    video_orientation: asString(s.video_orientation) || EMPTY_SELECTED.video_orientation,
    floorplans_and_matterport: readStrings(s.floorplans_and_matterport),
    floorplan_options: readStrings(s.floorplan_options),
    media_options: {
      auto_upload_photos_to_mls: asString(media.auto_upload_photos_to_mls) || EMPTY_SELECTED.media_options.auto_upload_photos_to_mls,
      listing_webpage_visibility: asString(media.listing_webpage_visibility) || EMPTY_SELECTED.media_options.listing_webpage_visibility,
    },
  };
}

function titlesFor(options: Option[], values: string[]) {
  const titles = values.map((v) => options.find((o) => o.value === v)?.title || v);
  return titles.length ? titles.join(", ") : "None";
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function OptionCards({
  options,
  selected,
  fallback,
  onToggle,
}: {
  options: Option[];
  selected: string[];
  fallback: string;
  onToggle: (value: string) => void;
}) {
  if (!options.length) return <p className="small-muted">No options available.</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={active}
            className={`option-card-1 ma-option-card text-left ${active ? "active" : ""}`}
            onClick={() => onToggle(option.value)}
          >
            {/virtual tour/i.test(option.title) ? <span className="badge-tag">+ Virtual Tour</span> : null}
            <span className={`ma-check ${active ? "on" : ""}`} aria-hidden>
              {active ? <Check className="w-3 h-3" /> : null}
            </span>
            <img
              src={option.image || fallback}
              alt=""
              onError={(e) => {
                if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
              }}
            />
            <h6>{option.title}</h6>
          </button>
        );
      })}
    </div>
  );
}

function Chips({
  options,
  isActive,
  onPick,
  multi,
}: {
  options: Option[];
  isActive: (value: string) => boolean;
  onPick: (value: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap mb-3 photography" role={multi ? "group" : "radiogroup"}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role={multi ? "checkbox" : "radio"}
          aria-checked={isActive(o.value)}
          className={`btn ${isActive(o.value) ? "active" : ""}`}
          onClick={() => onPick(o.value)}
        >
          {o.title}
        </button>
      ))}
    </div>
  );
}

export default function ServicePackageSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [master, setMaster] = useState<Master | null>(null);
  const [saved, setSaved] = useState<Selected>(EMPTY_SELECTED);
  const [draft, setDraft] = useState<Selected>(EMPTY_SELECTED);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getSettingsPreferences();
      if (!res.status) {
        setLoadError(apiMessage(res, "Unable to load your default service package."));
        return;
      }
      const data = asRecord(res.data);
      const m = asRecord(data.master_data);
      const media = asRecord(m.media_options);
      const orientation = readOptions(m.video_orientation);
      const mls = readOptions(media.auto_upload_photos_to_mls);
      const visibility = readOptions(media.listing_webpage_visibility);
      setMaster({
        photography: readOptions(m.photography),
        print_addons: readOptions(m.print_addons),
        video: readOptions(m.video),
        video_orientation: orientation.length ? orientation : DEFAULT_CHOICES.video_orientation,
        floorplans_and_matterport: readOptions(m.floorplans_and_matterport),
        floorplan_options: readOptions(m.floorplan_options),
        auto_upload_photos_to_mls: mls.length ? mls : DEFAULT_CHOICES.auto_upload_photos_to_mls,
        listing_webpage_visibility: visibility.length ? visibility : DEFAULT_CHOICES.listing_webpage_visibility,
      });
      const sel = readSelected(data.selected);
      setSaved(sel);
      setDraft(sel);
    } catch (err) {
      setLoadError(errorText(err, "Unable to load your default service package."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    if (!master) return [];
    const pick = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.title || v || "—";
    const video = titlesFor(master.video, saved.video);
    return [
      { label: "Photos", value: titlesFor(master.photography, saved.photography) },
      { label: "Floorplan", value: titlesFor(master.floorplans_and_matterport, saved.floorplans_and_matterport) },
      {
        label: "Video",
        value: saved.video.length ? `${video} (${pick(master.video_orientation, saved.video_orientation)})` : video,
      },
      { label: "Print Add-ons", value: titlesFor(master.print_addons, saved.print_addons) },
      { label: "Upload Media to MLS", value: pick(master.auto_upload_photos_to_mls, saved.media_options.auto_upload_photos_to_mls) },
      { label: "Listing Webpage Visibility", value: pick(master.listing_webpage_visibility, saved.media_options.listing_webpage_visibility) },
    ];
  }, [master, saved]);

  const toggleMulti = (key: MultiKey, value: string) => setDraft((d) => ({ ...d, [key]: toggle(d[key], value) }));

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await saveSettingsPreferences({
        photography: draft.photography,
        print_addons: draft.print_addons,
        video: draft.video,
        video_orientation: draft.video_orientation,
        floorplans_and_matterport: draft.floorplans_and_matterport,
        floorplan_options: draft.floorplan_options,
        media_options: { ...draft.media_options },
      });
      if (!res.status) {
        setNotice({ kind: "error", text: apiMessage(res, "Unable to save preferences.") });
        return;
      }
      const returned = asRecord(asRecord(res.data).selected);
      const next = Object.keys(returned).length ? readSelected(returned) : draft;
      setSaved(next);
      setDraft(next);
      setEditing(false);
      setNotice({ kind: "success", text: apiMessage(res, "Settings preferences saved") });
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err, "Unable to save preferences.") });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SectionLoading label="Loading service package…" />;
  if (loadError || !master) return <SectionError text={loadError || "No preference data."} onRetry={() => void load()} />;

  if (!editing) {
    return (
      <div>
        <h2>Default Service Package</h2>
        <p className="service-package-desc">
          The default services you want included when you create a new service order. These are completely customizable per service order.
        </p>
        <div className="mt-4">
          {summary.map((row) => (
            <div key={row.label} className="service-item">
              <span className="service-label">{row.label}</span>
              <span className="service-value">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="ma-service-actions mt-3">
          <NoticeLine notice={notice} />
          <button
            type="button"
            className="btn-edit"
            onClick={() => {
              setDraft(saved);
              setNotice(null);
              setEditing(true);
            }}
          >
            EDIT
          </button>
        </div>
        <hr className="ma-hr" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-2">Default Service Package</h2>
      <p className="service-package-desc mb-6">
        The default services you want included when you create a new service order. These are completely customizable per service order.
      </p>

      {CARD_GROUPS.map((group) => (
        <section key={group.key} className="mb-6">
          <h6 className="text-white mb-3">
            {group.title} &nbsp;&nbsp;&nbsp;<span className="text-grey text-sm">Select all that apply</span>
          </h6>
          <OptionCards
            options={master[group.key]}
            selected={draft[group.key]}
            fallback={group.fallback}
            onToggle={(value) => toggleMulti(group.key, value)}
          />
          {group.key === "floorplans_and_matterport" && master.floorplan_options.length ? (
            <>
              <h6 className="text-white mt-4 mb-2">Floorplan Options</h6>
              <Chips
                multi
                options={master.floorplan_options}
                isActive={(v) => draft.floorplan_options.includes(v)}
                onPick={(v) => toggleMulti("floorplan_options", v)}
              />
            </>
          ) : null}
          {group.key === "video" ? (
            <>
              <h6 className="text-white mt-4 mb-2">Orientation</h6>
              <Chips
                options={master.video_orientation}
                isActive={(v) => draft.video_orientation === v}
                onPick={(v) => setDraft((d) => ({ ...d, video_orientation: v }))}
              />
            </>
          ) : null}
          <hr className="ma-hr" />
        </section>
      ))}

      <section className="mb-6">
        <h6 className="text-white mb-3">Media Options</h6>
        <h6 className="text-white/50 mb-2 text-sm">Automatically Upload Photos to MLS</h6>
        <Chips
          options={master.auto_upload_photos_to_mls}
          isActive={(v) => draft.media_options.auto_upload_photos_to_mls === v}
          onPick={(v) => setDraft((d) => ({ ...d, media_options: { ...d.media_options, auto_upload_photos_to_mls: v } }))}
        />
        <h6 className="text-white/50 mb-2 mt-4 text-sm">Listing Webpage Visibility</h6>
        <Chips
          options={master.listing_webpage_visibility}
          isActive={(v) => draft.media_options.listing_webpage_visibility === v}
          onPick={(v) => setDraft((d) => ({ ...d, media_options: { ...d.media_options, listing_webpage_visibility: v } }))}
        />
      </section>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" className="btn-purple" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save Preferences"}
        </button>
        <button
          type="button"
          className="btn-outline-custom"
          disabled={saving}
          onClick={() => {
            setDraft(saved);
            setEditing(false);
            setNotice(null);
          }}
        >
          Cancel
        </button>
        <NoticeLine notice={notice} />
      </div>
    </div>
  );
}
