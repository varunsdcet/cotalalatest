/** Adobe / ISO CMYK profile for web-to-print (SWOP v2). */
export const PRINT_COLOR_PROFILE_NAME = "U.S. Web Coated (SWOP) v2";

export const PRINT_COLOR_PROFILE_FILENAME = "U.S. Web Coated (SWOP) v2.icc";

export const PRINT_COLOR_PROFILE_PUBLIC_PATH = "/color-profiles/us-web-coated-swop-v2.icc";

export const PRINT_COLOR_PROFILE_MIME = "application/vnd.iccprofile";

export type PrintColorProfilePayload = {
  name: string;
  filename: string;
  mimeType: string;
  iccBase64: string;
};

let cachedIccBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Fetch ICC bytes once; reuse for PDF API payloads. */
export async function loadPrintColorProfileIccBase64(): Promise<string> {
  if (cachedIccBase64) return cachedIccBase64;

  const res = await fetch(PRINT_COLOR_PROFILE_PUBLIC_PATH);
  if (!res.ok) {
    throw new Error(`Print color profile ICC not found (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  cachedIccBase64 = arrayBufferToBase64(buf);
  return cachedIccBase64;
}

export async function buildPrintColorProfilePayload(): Promise<PrintColorProfilePayload> {
  const iccBase64 = await loadPrintColorProfileIccBase64();
  return {
    name: PRINT_COLOR_PROFILE_NAME,
    filename: PRINT_COLOR_PROFILE_FILENAME,
    mimeType: PRINT_COLOR_PROFILE_MIME,
    iccBase64,
  };
}
