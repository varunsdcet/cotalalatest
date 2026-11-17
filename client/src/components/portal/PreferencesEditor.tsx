import { useEffect, useState } from "react";
import { getPreferenceMasterData, savePortalPreferences } from "@/lib/api";
import photoFallback from "@/pages/images/standard-real-estate-photography-4-1024x683.jpg";
import videoFallback from "@/pages/images/hdr.jpg";
import floorPlanImg from "@/pages/images/img-5.png";
import printSheetFallback from "@/pages/images/p-2.jpg";
import printTriFallback from "@/pages/images/brochure.png";
import printBookFallback from "@/pages/images/listing-magazine-1.jpeg";
import twilightImg from "@/pages/images/cotala-photos/twilight.jpg";
import twilightExtImg from "@/pages/images/cotala-photos/twilight-exterior-1.jpg";
import droneStillsImg from "@/pages/images/cotala-photos/sas-drone-stills-example.gif";
import hdrCloseImg from "@/pages/images/cotala-photos/hdr-1.jpg";
import panoImg from "@/pages/images/pano1.jpeg";
import panoTwoImg from "@/pages/images/pano2.jpeg";

type OptionItem = {
  id?: number | string;
  name?: string;
  frontendtitle?: string;
  productimage?: string;
  image?: string;
  image_url?: string;
  virtual_flag?: number;
};

const FALLBACK = {
  photography: [
    { id: "std", frontendtitle: "Standard Photos" },
    { id: "hdr", frontendtitle: "HDR Photos" },
    { id: "twilight", frontendtitle: "Twilight Exterior" },
    { id: "twilight-only", frontendtitle: "Twilight Exterior Only" },
    { id: "drone", frontendtitle: "Drone Stills" },
    { id: "std-tour", frontendtitle: "Standard + Tour", virtual_flag: 1 },
    { id: "hdr-tour", frontendtitle: "HDR + Tour", virtual_flag: 1 },
  ],
  extras: [
    { id: "vs", frontendtitle: "Virtual Staging" },
    { id: "slideshow", frontendtitle: "Photo Slideshow" },
    { id: "daynight", frontendtitle: "Day to Night Conversion" },
    { id: "sky", frontendtitle: "Blue Sky Replacement" },
    { id: "lot", frontendtitle: "Drone Lot Outlines" },
    { id: "pano", frontendtitle: "Drone 360° Panorama" },
  ],
  print: [
    { id: 19, frontendtitle: "Oversized Feature Sheets" },
    { id: 136, frontendtitle: "Oversized Trifold Brochure" },
    { id: 202, frontendtitle: "8-Page Listing Booklet" },
  ],
  floor: [
    { id: "floor", frontendtitle: "Standard Floorplan" },
    { id: "floor-mp", frontendtitle: "Standard Floorplan+Matterport" },
    { id: "mp", frontendtitle: "Matterport Only" },
    { id: "simple", frontendtitle: "Simplified Floorplan" },
    { id: "simple-mp", frontendtitle: "Simplified Floorplan + Matterport" },
  ],
  video: [
    { id: "cine", frontendtitle: "Cinematic Video" },
    { id: "drone-vid", frontendtitle: "Drone Video" },
  ],
};

function imageForOption(option: OptionItem, fallback: string) {
  const apiImage = option.productimage || option.image || option.image_url || "";
  if (apiImage && !/logo1\.png|logo\.png/i.test(apiImage)) return apiImage;
  const title = `${option.frontendtitle || ""} ${option.name || ""}`.toLowerCase();
  if (title.includes("trifold")) return printTriFallback;
  if (title.includes("booklet") || title.includes("magazine")) return printBookFallback;
  if (title.includes("feature sheet") || title.includes("oversized")) return printSheetFallback;
  if (title.includes("drone") && title.includes("video")) return droneStillsImg;
  if (title.includes("drone")) return droneStillsImg;
  if (title.includes("twilight") && title.includes("only")) return twilightExtImg;
  if (title.includes("twilight")) return twilightImg;
  if (title.includes("hdr")) return hdrCloseImg;
  if (title.includes("cinematic") || title.includes("video")) return videoFallback;
  if (title.includes("matterport") && title.includes("only")) return panoTwoImg;
  if (title.includes("matterport")) return panoImg;
  if (title.includes("floor")) return floorPlanImg;
  if (title.includes("tour") || title.includes("virtual")) return panoImg;
  if (title.includes("standard")) return photoFallback;
  return fallback;
}

function toggleValue(list: Array<string | number>, id: string | number) {
  const key = String(id);
  return list.some((item) => String(item) === key)
    ? list.filter((item) => String(item) !== key)
    : [...list, id];
}

function OptionCards({
  options,
  selected,
  onToggle,
  fallback,
}: {
  options: OptionItem[];
  selected: Array<string | number>;
  onToggle: (id: string | number) => void;
  fallback: string;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {options.map((option) => {
        const id = option.id ?? option.name ?? "";
        const active = selected.some((item) => String(item) === String(id));
        const title = option.frontendtitle || option.name || "Service";
        const isTour = Boolean(option.virtual_flag) || /tour/i.test(title);
        return (
          <button
            key={String(id)}
            type="button"
            className={`option-card-1 relative text-left ${active ? "active" : ""}`}
            onClick={() => onToggle(id)}
          >
            {isTour ? <span className="badge-tag">+ Virtual Tour</span> : null}
            <img src={imageForOption(option, fallback)} alt={title} />
            <h6>{title}</h6>
          </button>
        );
      })}
    </div>
  );
}

function ChipRow({
  options,
  selected,
  onToggle,
}: {
  options: OptionItem[];
  selected: Array<string | number>;
  onToggle: (id: string | number) => void;
}) {
  return (
    <div className="flex flex-wrap mb-4 photography">
      {options.map((option) => {
        const id = option.id ?? option.name ?? "";
        const active = selected.some((item) => String(item) === String(id));
        return (
          <button
            key={String(id)}
            type="button"
            className={`btn ${active ? "active" : ""}`}
            onClick={() => onToggle(id)}
          >
            {option.frontendtitle || option.name}
          </button>
        );
      })}
    </div>
  );
}

export default function PreferencesEditor({ showSecurity = false }: { showSecurity?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photography, setPhotography] = useState<OptionItem[]>(FALLBACK.photography);
  const [extras, setExtras] = useState<OptionItem[]>(FALLBACK.extras);
  const [printAddons, setPrintAddons] = useState<OptionItem[]>(FALLBACK.print);
  const [floorplans, setFloorplans] = useState<OptionItem[]>(FALLBACK.floor);
  const [video, setVideo] = useState<OptionItem[]>(FALLBACK.video);
  const [selPhoto, setSelPhoto] = useState<Array<string | number>>([]);
  const [selExtras, setSelExtras] = useState<Array<string | number>>([]);
  const [selPrint, setSelPrint] = useState<Array<string | number>>([]);
  const [selFloor, setSelFloor] = useState<Array<string | number>>([]);
  const [selVideo, setSelVideo] = useState<Array<string | number>>([]);
  const [includeDecks, setIncludeDecks] = useState(false);
  const [orientation, setOrientation] = useState("horizontal");
  const [autoMls, setAutoMls] = useState("yes");
  const [visibility, setVisibility] = useState("public");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await getPreferenceMasterData();
        if (res.status && res.data) {
          const payload = res.data as {
            current?: {
              default_photography?: Array<string | number>;
              photography_extras?: Array<string | number>;
              print_addons?: Array<string | number>;
              floorplan_services?: Array<string | number>;
              property_types?: Array<string | number>;
              video_services?: Array<string | number>;
              floorplan_orientation?: string;
              auto_upload_mls?: string;
              unbranded_visibility?: string;
              login_security?: {
                recovery_email?: string;
                recovery_phone?: string;
                security_email_new_login?: number;
                security_sms_suspicious?: number;
              };
            };
            master?: {
              default_service_package?: {
                photography?: OptionItem[];
                photography_extras?: OptionItem[];
                print_addons?: OptionItem[];
                floorplans_and_matterport?: OptionItem[];
                video?: OptionItem[];
              };
            };
          };
          const pkg = payload.master?.default_service_package;
          if (pkg?.photography?.length) setPhotography(pkg.photography);
          if (pkg?.photography_extras?.length) setExtras(pkg.photography_extras);
          if (pkg?.print_addons?.length) setPrintAddons(pkg.print_addons);
          if (pkg?.floorplans_and_matterport?.length) setFloorplans(pkg.floorplans_and_matterport);
          if (pkg?.video?.length) setVideo(pkg.video);
          setSelPhoto(payload.current?.default_photography || []);
          setSelExtras(payload.current?.photography_extras || []);
          setSelPrint(payload.current?.print_addons || []);
          setSelFloor(payload.current?.floorplan_services || []);
          setSelVideo(payload.current?.video_services || []);
          setIncludeDecks((payload.current?.property_types || []).some((v) => String(v).includes("deck")));
          setOrientation(payload.current?.floorplan_orientation || "horizontal");
          setAutoMls(String(payload.current?.auto_upload_mls || "yes").toLowerCase() === "no" ? "no" : "yes");
          setVisibility(payload.current?.unbranded_visibility || "public");
          setRecoveryEmail(payload.current?.login_security?.recovery_email || "");
          setRecoveryPhone(payload.current?.login_security?.recovery_phone || "");
          setEmailAlerts(Boolean(payload.current?.login_security?.security_email_new_login ?? 1));
          setSmsAlerts(Boolean(payload.current?.login_security?.security_sms_suspicious ?? 1));
        }
      } catch (error) {
        console.warn("Preferences master data unavailable, using mockup catalog", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async (extra: Record<string, unknown> = {}) => {
    try {
      setSaving(true);
      const res = await savePortalPreferences({
        default_photography: selPhoto,
        photography_extras: selExtras,
        print_addons: selPrint,
        floorplan_services: selFloor,
        video_services: selVideo,
        property_types: includeDecks ? ["decks_patio_outbuildings"] : [],
        floorplan_orientation: orientation,
        auto_upload_mls: autoMls,
        unbranded_visibility: visibility,
        recovery_email: recoveryEmail,
        recovery_phone: recoveryPhone,
        security_email_new_login: emailAlerts,
        security_sms_suspicious: smsAlerts,
        ...extra,
      });
      if (res.status) alert("Preferences saved");
      else alert(res.msg || "Unable to save preferences");
    } catch (error) {
      console.error(error);
      alert("Unable to save preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-white/70 py-8">Loading preferences...</div>;
  }

  return (
    <div>
      <h2 className="mb-2">Default Service Package</h2>
      <p className="service-package-desc mb-6">
        The default services you want included when you create a new service order. These are completely customizable per service order.
      </p>

      <h6 className="text-white mb-3">
        Photography &nbsp;&nbsp;&nbsp;<span className="text-grey text-sm">Select all that apply</span>
      </h6>
      <OptionCards options={photography} selected={selPhoto} onToggle={(id) => setSelPhoto((p) => toggleValue(p, id))} fallback={photoFallback} />
      <div className="text-end mt-3 mb-4">
        <button type="button" className="btn-edit" disabled={saving} onClick={() => handleSave()}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <hr className="border-white/10 mb-6" />

      <h6 className="mb-3 mt-3 text-white">Photography Extras</h6>
      <ChipRow options={extras} selected={selExtras} onToggle={(id) => setSelExtras((p) => toggleValue(p, id))} />
      <hr className="border-white/10 mb-6" />

      <h6 className="text-white mb-3">
        Print Add-on &nbsp;&nbsp;&nbsp;<span className="text-grey text-sm">Select all that apply</span>
      </h6>
      <OptionCards options={printAddons} selected={selPrint} onToggle={(id) => setSelPrint((p) => toggleValue(p, id))} fallback={printSheetFallback} />
      <div className="text-end mt-3 mb-4">
        <button type="button" className="btn-edit" disabled={saving} onClick={() => handleSave()}>
          Save
        </button>
      </div>
      <hr className="border-white/10 mb-6" />

      <h6 className="text-white mb-3">
        Floorplans and Matterport &nbsp;&nbsp;&nbsp;<span className="text-grey text-sm">Select all that apply</span>
      </h6>
      <OptionCards options={floorplans} selected={selFloor} onToggle={(id) => setSelFloor((p) => toggleValue(p, id))} fallback={floorPlanImg} />
      <h6 className="text-white mt-4">Floorplan Options</h6>
      <div className="flex flex-wrap mb-3 photography">
        <button type="button" className={`btn ${includeDecks ? "active" : ""}`} onClick={() => setIncludeDecks((v) => !v)}>
          Include Decks/Patios/Outbuildings
        </button>
      </div>
      <div className="text-end mt-3 mb-4">
        <button type="button" className="btn-edit" disabled={saving} onClick={() => handleSave()}>
          Save
        </button>
      </div>
      <hr className="border-white/10 mb-6" />

      <h6 className="text-white mb-3">
        Video &nbsp;&nbsp;&nbsp;<span className="text-grey text-sm">Select all that apply</span>
      </h6>
      <OptionCards options={video} selected={selVideo} onToggle={(id) => setSelVideo((p) => toggleValue(p, id))} fallback={videoFallback} />
      <h6 className="text-white mt-4">Orientation</h6>
      <div className="flex flex-wrap mb-3 photography">
        <button type="button" className={`btn ${orientation === "horizontal" ? "active" : ""}`} onClick={() => setOrientation("horizontal")}>
          Horizontal
        </button>
        <button type="button" className={`btn ${orientation === "vertical" ? "active" : ""}`} onClick={() => setOrientation("vertical")}>
          Vertical (Best for Mobile)
        </button>
      </div>
      <div className="text-end mt-3 mb-4">
        <button type="button" className="btn-edit" disabled={saving} onClick={() => handleSave()}>
          Save
        </button>
      </div>
      <hr className="border-white/10 mb-6" />

      <h6 className="text-white mb-3">Media Options</h6>
      <h6 className="text-white/50 mb-3">Automatically Upload Photos to MLS</h6>
      <label className="mr-4">
        <input type="radio" checked={autoMls === "yes"} onChange={() => setAutoMls("yes")} /> Yes
      </label>
      <label>
        <input type="radio" checked={autoMls === "no"} onChange={() => setAutoMls("no")} /> No
      </label>
      <h6 className="text-white/50 mb-3 mt-4">Listing Webpage Visibility</h6>
      <label className="mr-4">
        <input type="radio" checked={visibility === "public"} onChange={() => setVisibility("public")} /> Public
      </label>
      <label>
        <input type="radio" checked={visibility === "hidden"} onChange={() => setVisibility("hidden")} /> Hidden
      </label>
      <div className="text-end mt-3 mb-4">
        <button type="button" className="btn-edit" disabled={saving} onClick={() => handleSave()}>
          Save
        </button>
      </div>

      {showSecurity && (
        <div className="dark-card mt-8">
          <h2 className="text-xl mb-4">Login & Security</h2>
          <div className="mb-4">
            <label className="form-label">Recovery Email</label>
            <input className="form-control custom-input w-full" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="form-label">Recovery Phone</label>
            <input className="form-control custom-input w-full" value={recoveryPhone} onChange={(e) => setRecoveryPhone(e.target.value)} />
          </div>
          <label className="block mb-2">
            <input type="checkbox" checked={emailAlerts} onChange={(e) => setEmailAlerts(e.target.checked)} /> Email alerts for new logins
          </label>
          <label className="block mb-4">
            <input type="checkbox" checked={smsAlerts} onChange={(e) => setSmsAlerts(e.target.checked)} /> SMS alerts for suspicious activity
          </label>
          <button type="button" className="btn-purple" disabled={saving} onClick={() => handleSave()}>
            Save Security
          </button>
        </div>
      )}
    </div>
  );
}
