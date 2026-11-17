import type { CSSProperties } from "react";
import type { MediaBrandFile, MediaLayoutOption } from "@/lib/api";

export function brandFileEntries(
  brandFiles: Record<string, MediaBrandFile | string | undefined> | undefined,
): Array<[string, MediaBrandFile]> {
  if (!brandFiles) return [];
  return Object.entries(brandFiles).filter(
    (entry): entry is [string, MediaBrandFile] =>
      entry[0] !== "base_url" && typeof entry[1] === "object" && Boolean(entry[1]?.upload_field),
  );
}

export function previewStyle(option: MediaLayoutOption | MediaBrandFile): CSSProperties {
  const style: CSSProperties = { objectFit: "contain" };
  if (option.preview_width) style.maxWidth = `${option.preview_width}px`;
  if ("preview_height" in option && option.preview_height) style.maxHeight = `${option.preview_height}px`;
  if (!option.preview_width && !("preview_height" in option && option.preview_height)) {
    style.maxWidth = "300px";
  }
  return style;
}
