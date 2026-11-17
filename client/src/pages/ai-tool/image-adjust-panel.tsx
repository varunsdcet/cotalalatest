import { useEffect, useState } from "react";
import { NEUTRAL_ADJUST, type DesignObject, type ImageAdjust, type Op } from "./kit-design";

type ImageFrame = Extract<DesignObject, { type: "image" }>;
type Channel = keyof ImageAdjust;

const SLIDERS: { key: Channel; label: string; min: number; max: number }[] = [
  { key: "brightness", label: "Brightness", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "hue", label: "Hue", min: -180, max: 180 },
  { key: "blur", label: "Blur", min: 0, max: 100 },
  { key: "radius", label: "Roundness", min: 0, max: 100 },
];

const PRESETS: { name: string; adjust: ImageAdjust }[] = [
  { name: "Original", adjust: NEUTRAL_ADJUST },
  { name: "Bright", adjust: { ...NEUTRAL_ADJUST, brightness: 14, contrast: 6, saturation: 6 } },
  { name: "Punch", adjust: { ...NEUTRAL_ADJUST, contrast: 24, saturation: 20 } },
  { name: "Warm", adjust: { ...NEUTRAL_ADJUST, hue: -8, saturation: 14, brightness: 6 } },
  { name: "Cool", adjust: { ...NEUTRAL_ADJUST, hue: 10, saturation: 6 } },
  { name: "B&W", adjust: { ...NEUTRAL_ADJUST, saturation: -100, contrast: 12 } },
];

export default function ImageAdjustPanel({
  frame,
  dispatch,
}: {
  frame: ImageFrame;
  dispatch: (label: string, ops: Op[]) => void;
}) {
  const saved = frame.adjust ?? NEUTRAL_ADJUST;
  const [draft, setDraft] = useState<ImageAdjust>(saved);

  useEffect(() => {
    setDraft(saved);
  }, [frame.id, saved.brightness, saved.contrast, saved.saturation, saved.hue, saved.blur, saved.radius]);

  const commit = (key: Channel) => {
    if (draft[key] === saved[key]) return;
    dispatch(`Adjusted image ${key}`, [{ op: "adjust_image", frameId: frame.id, [key]: draft[key] }]);
  };

  const applyAll = (label: string, adjust: ImageAdjust) => {
    setDraft(adjust);
    dispatch(label, [{ op: "adjust_image", frameId: frame.id, ...adjust }]);
  };

  return (
    <div className="mb-4 pb-3 border-b border-white/10">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-semibold mb-0">Edit image</p>
        <button type="button" className="text-[12px] text-[#B082F2]" onClick={() => applyAll("Reset image adjustments", NEUTRAL_ADJUST)}>
          Reset
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1 mb-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => applyAll(p.name === "Original" ? "Reset image adjustments" : `Applied ${p.name} look`, p.adjust)}
            className="rounded-md border border-white/15 px-1 py-1 text-[11px] text-white/70 hover:border-[#B082F2]"
          >
            {p.name}
          </button>
        ))}
      </div>
      {SLIDERS.map(({ key, label, min, max }) => (
        <label key={key} className="block text-[11px] text-white/50 mb-2">
          <span className="flex justify-between">
            {label}
            <span className="font-mono text-white/70">{draft[key]}</span>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            value={draft[key]}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
            onPointerUp={() => commit(key)}
            onBlur={() => commit(key)}
            className="w-full accent-[#B082F2]"
          />
        </label>
      ))}
    </div>
  );
}
