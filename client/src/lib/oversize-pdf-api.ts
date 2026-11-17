import { getUserIdFromStorage } from "@/lib/api";
import { PRINT_COLOR_PROFILE_NAME } from "@/lib/print-color-profile";

/** Feature Sheet PDF service (Node.js — appslure.app). Override via VITE_PDF3_API_URL. */
export const OVERSIZE_PDF3_API_URL =
  import.meta.env.VITE_PDF3_API_URL ??
  (import.meta.env.PROD
    ? "https://www.appslure.app/api/pdf3"
    : "https://www.appslure.app/api/pdf3");

/** @deprecated Use PRINT_COLOR_PROFILE_NAME from print-color-profile.ts */
export const PRINT_COLOR_PROFILE = PRINT_COLOR_PROFILE_NAME;

export type Pdf3JsonResponse = {
  success?: boolean;
  message?: string;
  msg?: string;
  order_id?: string;
  pdf_url?: string;
  url?: string;
  file_url?: string;
  pdf_filename?: string;
};

export type PostPdf3Result =
  | { kind: "json"; data: Pdf3JsonResponse }
  | { kind: "pdf"; blob: Blob; filename?: string };

export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const m =
    /filename\*=UTF-8''([^;\n]+)|filename\*=([^;\n]+)|filename="([^"]+)"|filename=([^;\s]+)/i.exec(
      header,
    );
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? m[3] ?? m[4]).trim();
  try {
    return decodeURIComponent(raw.replace(/^"+|"+$/g, ""));
  } catch {
    return raw.replace(/^"+|"+$/g, "");
  }
}

/** Backend expects: { "user_id": "5", "data": "{...json string...}" } */
export function buildOversizePdfApiBody(innerPayload: Record<string, unknown>): {
  user_id: string;
  data: string;
} {
  const user_id = getUserIdFromStorage() ?? "";
  return {
    user_id,
    data: JSON.stringify(innerPayload),
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function postPdf3(
  innerPayload: Record<string, unknown>,
  userId?: string | number,
): Promise<PostPdf3Result> {
  const body = buildOversizePdfApiBody(innerPayload);
  if (userId != null && userId !== "") {
    body.user_id = String(userId);
  }

  const res = await fetch(OVERSIZE_PDF3_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      const err = (await res.json()) as Pdf3JsonResponse;
      throw new Error(err.message || err.msg || `PDF API failed (${res.status})`);
    }
    const errText = await res.text().catch(() => "");
    throw new Error(errText.trim().slice(0, 500) || `PDF API failed (${res.status})`);
  }

  if (contentType.includes("application/pdf")) {
    const blob = await res.blob();
    const fromHeader = parseContentDispositionFilename(res.headers.get("Content-Disposition"));
    return { kind: "pdf", blob, filename: fromHeader ?? undefined };
  }

  const data = (await res.json()) as Pdf3JsonResponse;
  if (data.success === false) {
    throw new Error(data.message || data.msg || "PDF API request failed");
  }
  return { kind: "json", data };
}

export async function downloadOversizePdfViaApi(
  innerPayload: Record<string, unknown>,
  tourId: string,
): Promise<void> {
  const result = await postPdf3(innerPayload);

  if (result.kind === "pdf") {
    downloadBlob(
      result.blob,
      result.filename?.trim() || `feature-sheet-${tourId || "listing"}.pdf`,
    );
    return;
  }

  const url =
    result.data.url ?? result.data.pdf_url ?? result.data.file_url ?? null;
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  throw new Error("Server returned JSON without a PDF URL or file.");
}

/** Approve-proof flow: POST to print API, return JSON ack (no browser download). */
export async function submitOversizePdfViaApi(
  innerPayload: Record<string, unknown>,
): Promise<Pdf3JsonResponse> {
  const result = await postPdf3(innerPayload);

  if (result.kind === "json") {
    return result.data;
  }

  await result.blob.arrayBuffer();
  return { success: true, message: "Print job submitted successfully." };
}
