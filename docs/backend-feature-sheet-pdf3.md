# Feature Sheet PDF — Backend Guide (pdf3)

Frontend sends a **complete print HTML document** plus **U.S. Web Coated (SWOP) v2 ICC** so the server can return the **same PDF** as the in-app print preview.

## Endpoint

```
POST https://www.cotala.com/newcotala24/webapi2025dec/api/pdf3
Content-Type: application/json
```

## Request body (wrapper)

```json
{
  "user_id": "123",
  "data": "<stringified JSON — see inner payload below>"
}
```

`data` is **`JSON.stringify(innerPayload)`** — a string, not a nested object.

---

## Inner payload (what backend parses)

| Field | Purpose |
|-------|---------|
| `pdfRender` | **Read first** — render instructions |
| `printHtml` | Full 2-page HTML document (17.5×11.5 in per page, bleed + trim marks) |
| `iccProfileBase64` | SWOP v2 ICC file, base64 |
| `iccProfileFilename` | `U.S. Web Coated (SWOP) v2.icc` |
| `colorProfile` | Same ICC + name + mimeType |
| `printColorProfile` | `"U.S. Web Coated (SWOP) v2"` |
| `submitMode` | `approve_proof_print` \| `download_pdf` \| `preview` |
| `panels` | Raw panel HTML (fallback if `printHtml` unavailable) |
| `output` | Trim/doc sizes in inches |
| `order` / `proofOrder` | Quantity, delivery, shipping (on approve) |

### `pdfRender` block (from frontend)

```json
{
  "method": "html_to_pdf",
  "htmlField": "printHtml",
  "colorSpace": "CMYK",
  "embedIccInPdf": true,
  "convertImagesRgbToCmykUsingIcc": true,
  "outputIntentProfileName": "U.S. Web Coated (SWOP) v2",
  "iccFields": ["iccProfileBase64", "iccProfileFilename", "colorProfile.iccBase64"],
  "iccPublicUrl": "/color-profiles/us-web-coated-swop-v2.icc",
  "pageCount": 2,
  "documentSizeInches": { "width": 17.5, "height": 11.5 },
  "trimSizeInches": { "width": 17, "height": 11 },
  "bleedInches": 0.25,
  "safetyInches": 0.25,
  "marginsInches": 0,
  "recommendedDpi": 300,
  "cssPageSize": "@page{size:17.5in 11.5in;margin:0}"
}
```

---

## Backend steps (recommended)

1. Parse `data` JSON string into object.
2. Decode `iccProfileBase64` → binary `.icc` file.
3. Load `printHtml` into headless Chrome / wkhtmltopdf / Prince / similar at **exact inch size** (`@page size: 17.5in 11.5in; margin: 0`).
4. Convert embedded images (data URLs / https URLs) from sRGB → CMYK using **the same ICC**.
5. Embed ICC as PDF **OutputIntent** (SWOP Coated v2).
6. Return:
   - **`Content-Type: application/pdf`** with PDF bytes, **or**
   - JSON `{ "url": "https://..." }` / `{ "pdf_url": "..." }`

Do **not** rely on browser `window.print()` — that is client-only. Server uses **`printHtml`** only.

---

## Print layout (matches frontend)

| | Value |
|--|--------|
| Trim (finished) | 17" × 11" landscape |
| Document (+ bleed) | 17.5" × 11.5" |
| Bleed | 0.25" each side |
| Pages | 2 (Sheet 1: panels p1+p2, Sheet 2: p3+p4) |
| Panel design size | 556×748 px scaled to 8.5×11 in per half |

---

## ICC file

- Frontend ships: `client/public/color-profiles/us-web-coated-swop-v2.icc`
- Also sent as `iccProfileBase64` in every pdf3 request
- Profile name: **U.S. Web Coated (SWOP) v2**

---

## Example curl (structure only)

```bash
curl -X POST 'https://www.cotala.com/newcotala24/webapi2025dec/api/pdf3' \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "5",
    "data": "{\"schemaVersion\":2,\"builder\":\"feature_sheet_builder_4panel\",\"printHtml\":\"<!DOCTYPE html>...\",\"iccProfileBase64\":\"...\",\"pdfRender\":{\"method\":\"html_to_pdf\"}}"
  }' \
  --output feature-sheet.pdf
```

---

## Frontend triggers

| User action | `submitMode` | Response expected |
|-------------|--------------|-------------------|
| Approve Proof & Submit | `approve_proof_print` | Ack JSON or PDF (no download required on approve) |
| Download PDF (if enabled) | `download_pdf` | PDF file download |

---

## Source code (frontend)

- Payload builder: `client/src/lib/feature-sheet-pdf-payload.ts`
- Print HTML: `client/src/pages/listings/feature-sheet-builder/build-print-html.ts`
- ICC loader: `client/src/lib/print-color-profile.ts`
- API client: `client/src/lib/oversize-pdf-api.ts`
