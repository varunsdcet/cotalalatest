import type { PrintColorProfilePayload } from "@/lib/print-color-profile";
import { PRINT_COLOR_PROFILE_PUBLIC_PATH } from "@/lib/print-color-profile";
import type { FeatureListingFinalSnapshot } from "@/pages/listings/feature-listing-preview";
import { PRINT_LAYOUT } from "@/pages/listings/feature-sheet-builder/defaults";
import type {
  FeatureSheetFormState,
  RenderedPanels,
} from "@/pages/listings/feature-sheet-builder/render-panels";
import type { ProofOrderState } from "@/pages/listings/feature-sheet-builder/types";

export type FeatureSheetSubmitMode = "preview" | "download_pdf" | "approve_proof_print";

/** Instructions for pdf3 backend — render `printHtml` and embed ICC as CMYK OutputIntent. */
export const FEATURE_SHEET_PDF_RENDER_SPEC = {
  method: "html_to_pdf",
  htmlField: "printHtml",
  colorSpace: "CMYK",
  embedIccInPdf: true,
  convertImagesRgbToCmykUsingIcc: true,
  outputIntentProfileName: "U.S. Web Coated (SWOP) v2",
  iccFields: ["iccProfileBase64", "iccProfileFilename", "colorProfile.iccBase64"],
  iccPublicUrl: PRINT_COLOR_PROFILE_PUBLIC_PATH,
  pageCount: 2,
  documentSizeInches: {
    width: PRINT_LAYOUT.docWidthIn,
    height: PRINT_LAYOUT.docHeightIn,
  },
  trimSizeInches: {
    width: PRINT_LAYOUT.finishWidthIn,
    height: PRINT_LAYOUT.finishHeightIn,
  },
  bleedInches: PRINT_LAYOUT.bleedIn,
  safetyInches: PRINT_LAYOUT.safetyIn,
  marginsInches: 0,
  recommendedDpi: 300,
  cssPageSize: `@page{size:${PRINT_LAYOUT.docWidthIn}in ${PRINT_LAYOUT.docHeightIn}in;margin:0}`,
  notes: [
    "Render printHtml in a headless browser or HTML→PDF engine at exact inch dimensions (17.5×11.5 per page).",
    "Decode iccProfileBase64 and embed as PDF OutputIntent (SWOP v2 coated).",
    "Convert embedded sRGB/data-URL images to CMYK using the same ICC before or during PDF generation.",
    "Do not strip bleed, trim marks, or panel scale transforms — HTML matches approved browser print layout.",
    "Return application/pdf binary, or JSON { url | pdf_url } for download.",
  ],
} as const;

export type FeatureSheetPdfPayloadOptions = {
  form: FeatureSheetFormState;
  panels: RenderedPanels;
  /** Server HTML — no window.print script. */
  printHtml: string;
  tourId: string;
  listingSnapshot: FeatureListingFinalSnapshot | null;
  colorProfile: PrintColorProfilePayload;
  submitMode?: FeatureSheetSubmitMode;
  proofOrder?: ProofOrderState;
};

export function buildFeatureSheetPdfPayload(
  options: FeatureSheetPdfPayloadOptions,
): Record<string, unknown> {
  const {
    form,
    panels,
    printHtml,
    tourId,
    listingSnapshot,
    colorProfile,
    submitMode = "preview",
    proofOrder,
  } = options;

  const approved = submitMode === "approve_proof_print";

  const orderBlock = proofOrder
    ? {
        quantity: proofOrder.quantity,
        deliveryMethod: proofOrder.deliveryMethod,
        shippingAddress: proofOrder.deliveryMethod === "ship" ? proofOrder.shippingAddress : "",
        courier: proofOrder.deliveryMethod === "ship" ? proofOrder.courier : null,
        approved,
      }
    : undefined;

  return {
    schemaVersion: 2,
    builder: "feature_sheet_builder_4panel",
    generatedAt: new Date().toISOString(),
    submitMode,

    /** Backend: read this block first. */
    pdfRender: FEATURE_SHEET_PDF_RENDER_SPEC,

    colorProfile,
    printColorProfile: colorProfile.name,
    iccProfileBase64: colorProfile.iccBase64,
    iccProfileFilename: colorProfile.filename,
    iccProfileUrl: FEATURE_SHEET_PDF_RENDER_SPEC.iccPublicUrl,

    /** Complete print document (2 pages, bleed + trim). Same layout as browser doPrint(). */
    printHtml,

    output: {
      type: "oversize_feature_sheet_pdf",
      mimeType: "application/pdf",
      pageSize: {
        widthInches: PRINT_LAYOUT.finishWidthIn,
        heightInches: PRINT_LAYOUT.finishHeightIn,
      },
      documentSize: {
        widthInches: PRINT_LAYOUT.docWidthIn,
        heightInches: PRINT_LAYOUT.docHeightIn,
      },
      bleedInches: PRINT_LAYOUT.bleedIn,
      safetyInches: PRINT_LAYOUT.safetyIn,
      refPanelPx: { width: PRINT_LAYOUT.refWidthPx, height: PRINT_LAYOUT.refHeightPx },
      totalPages: 2,
    },

    tour: { tourId, listingAddress: form.addr },

    theme: {
      colors: {
        pageBackground: form.bgColor,
        pageText: form.textColor,
        primary: form.primaryColor,
        accent: form.accentColor,
      },
      displayFont: form.displayFont,
    },

    panels: {
      p1: panels.p1,
      p2: panels.p2,
      p3: panels.p3,
      p4: panels.p4,
      bgColor: panels.bgColor,
    },

    form,
    listingSnapshot,
    order: orderBlock,
    proofOrder: orderBlock,

    images: {
      coverImage: form.images.hero ?? "",
      primaryImages: [
        form.images.il1,
        form.images.lb[1],
        form.images.lb[2],
        form.images.lb[3],
        form.images.rh,
        form.images.rg[1],
      ].filter((u): u is string => Boolean(u?.trim())),
      secondaryImages: Object.keys(form.images.rg)
        .map(Number)
        .sort((a, b) => a - b)
        .slice(1)
        .map((k) => form.images.rg[k])
        .filter((u): u is string => Boolean(u?.trim())),
    },
  };
}
