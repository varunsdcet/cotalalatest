# Backend Spec — Feature Sheet PDF API (Node.js)

> **Frontend se ye file backend developer ko do.**  
> Alag server par Node.js se `POST /api/pdf3` banana hai.

---

## 1. Backend ko seedha kya bolna hai (copy-paste)

```
Humara React frontend Feature Sheet banata hai aur tumhe ye bhejta hai:

POST /api/pdf3
Content-Type: application/json

{
  "user_id": "123",
  "data": "<JSON STRING — andar printHtml + ICC profile + order hai>"
}

Tumhe karna hai:
1. `data` ko JSON.parse() karo
2. `printHtml` field se 2-page PDF banao (17.5 inch × 11.5 inch landscape, bleed ke saath)
3. `iccProfileBase64` decode karke PDF mein embed karo — profile name: "U.S. Web Coated (SWOP) v2"
4. Agar submitMode === "approve_proof_print" hai to order DB mein save karo (quantity, delivery, address)
5. Response:
   - approve flow: JSON { "success": true, "message": "Order submitted" }
   - download flow: PDF file (application/pdf) ya JSON { "url": "https://..." }

Frontend already poora HTML bhej raha hai — tumhe layout design nahi karna.
Sirf HTML → PDF + ICC + order save.

ICC file frontend repo mein hai:
client/public/color-profiles/us-web-coated-swop-v2.icc
(हर request में iccProfileBase64 भी आता है — wahi use karo)
```

---

## 2. API contract

### Endpoint

```
POST /api/pdf3
```

Alag server par ho to CORS enable karo — frontend origin allow karo.

### Request body

```json
{
  "user_id": "5",
  "data": "{\"schemaVersion\":2,\"builder\":\"feature_sheet_builder_4panel\",...}"
}
```

**Important:** `data` ek **string** hai, object nahi. Pehle parse karo:

```js
const inner = JSON.parse(req.body.data);
```

### Inner payload — important fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | `2` | Payload version |
| `builder` | `"feature_sheet_builder_4panel"` | Builder type |
| `submitMode` | string | `"approve_proof_print"` \| `"download_pdf"` \| `"preview"` |
| `printHtml` | string | **Poora HTML document** — isse PDF banao |
| `iccProfileBase64` | string | SWOP v2 ICC file (base64) |
| `iccProfileFilename` | string | `"U.S. Web Coated (SWOP) v2.icc"` |
| `printColorProfile` | string | `"U.S. Web Coated (SWOP) v2"` |
| `pdfRender` | object | Render instructions (sizes, CMYK, etc.) |
| `tour.tourId` | string | Listing / tour ID |
| `tour.listingAddress` | string | Property address |
| `order` / `proofOrder` | object | Quantity, delivery, shipping (approve par) |
| `panels` | object | `{ p1, p2, p3, p4, bgColor }` — fallback HTML |
| `output` | object | Page sizes in inches |

### `submitMode` behaviour

| Value | Frontend trigger | Backend should |
|-------|------------------|----------------|
| `approve_proof_print` | **Approve Proof & Submit** button | Save order + generate PDF + return JSON ack |
| `download_pdf` | Download PDF button (if enabled) | Return PDF bytes or download URL |
| `preview` | Future / debug | Optional PDF generation |

### `order` object (when user approves)

```json
{
  "quantity": 50,
  "deliveryMethod": "pickup",
  "shippingAddress": "",
  "courier": null,
  "approved": true
}
```

Ship case:

```json
{
  "quantity": 100,
  "deliveryMethod": "ship",
  "shippingAddress": "123 Main St, Vancouver BC",
  "courier": "standard",
  "approved": true
}
```

---

## 3. Print dimensions (exact)

| | Inches |
|--|--------|
| **Document size** (with bleed) | 17.5 × 11.5 landscape |
| **Trim / finished size** | 17 × 11 |
| **Bleed** | 0.25 each side |
| **Pages** | 2 |
| **CSS @page** | `size: 17.5in 11.5in; margin: 0` |

Sheet 1 = panels p1 + p2 (exterior)  
Sheet 2 = panels p3 + p4 (interior)

Frontend HTML already has bleed marks, trim marks, and panel scaling built in.

---

## 4. Node.js stack (recommended)

| Task | Library |
|------|---------|
| HTTP API | **Express** or **Fastify** |
| HTML → PDF | **Puppeteer** (headless Chrome) — best layout match |
| ICC embed in PDF | **pdf-lib** + manual OutputIntent, or **Ghostscript** CLI post-process |
| Image CMYK convert | **sharp** (with ICC) or Ghostscript |
| File storage | Local disk / **S3** / Azure Blob |
| DB (orders) | MySQL / PostgreSQL / MongoDB — your choice |

### Minimum server requirements

- Node.js 18+
- Chromium (Puppeteer installs automatically)
- Optional: Ghostscript + ImageMagick for production CMYK pipeline

---

## 5. Node.js example — Express route

```js
// routes/pdf3.js
const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const router = express.Router();

router.post("/pdf3", async (req, res) => {
  try {
    const { user_id, data } = req.body;

    if (!user_id || !data) {
      return res.status(400).json({ success: false, message: "user_id and data required" });
    }

    let inner;
    try {
      inner = JSON.parse(data);
    } catch {
      return res.status(400).json({ success: false, message: "Invalid JSON in data field" });
    }

    const {
      submitMode,
      printHtml,
      iccProfileBase64,
      iccProfileFilename,
      tour,
      order,
      proofOrder,
    } = inner;

    if (!printHtml) {
      return res.status(400).json({ success: false, message: "printHtml missing" });
    }

    // --- Step 1: HTML → PDF (Puppeteer) ---
    const pdfBuffer = await htmlToPdf(printHtml);

    // --- Step 2: Embed ICC profile (SWOP v2) ---
    const iccBuffer = Buffer.from(iccProfileBase64, "base64");
    const finalPdf = await embedIccProfile(pdfBuffer, iccBuffer, iccProfileFilename);

    // --- Step 3: Save order if approved ---
    if (submitMode === "approve_proof_print") {
      await savePrintOrder({
        userId: user_id,
        tourId: tour?.tourId,
        address: tour?.listingAddress,
        order: order || proofOrder,
        pdfPath: await storePdf(finalPdf, tour?.tourId),
      });

      return res.json({
        success: true,
        message: "Order submitted to print successfully.",
      });
    }

    // --- Download flow: return PDF file ---
    const filename = `feature-sheet-${tour?.tourId || "listing"}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(finalPdf);

  } catch (err) {
    console.error("pdf3 error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "PDF generation failed",
    });
  }
});

async function htmlToPdf(html) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    // 17.5 × 11.5 inches at 96 DPI ≈ 1680 × 1104 px (Puppeteer uses inches directly)
    const pdfBuffer = await page.pdf({
      width: "17.5in",
      height: "11.5in",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true, // respects @page in HTML
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

async function embedIccProfile(pdfBuffer, iccBuffer, filename) {
  // TODO: Implement with pdf-lib OutputIntent or Ghostscript post-process.
  // Phase 1: return pdfBuffer as-is if ICC embed not ready yet.
  // Phase 2: embed iccBuffer as PDF OutputIntent (SWOP Coated v2).
  console.warn("ICC embed not implemented yet — returning RGB PDF");
  return pdfBuffer;
}

async function savePrintOrder({ userId, tourId, address, order, pdfPath }) {
  // TODO: INSERT into your orders table
  console.log("Save order:", { userId, tourId, address, order, pdfPath });
}

async function storePdf(buffer, tourId) {
  const dir = path.join(__dirname, "../storage/pdfs");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${tourId}-${Date.now()}.pdf`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

module.exports = router;
```

### Express app setup + CORS

```js
// server.js
const express = require("express");
const cors = require("cors");
const pdf3Router = require("./routes/pdf3");

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",           // Vite dev
    "https://your-frontend-domain.com" // production
  ],
}));
app.use(express.json({ limit: "50mb" })); // printHtml + images can be large

app.use("/api", pdf3Router);

app.listen(3001, () => console.log("PDF API on :3001"));
```

---

## 6. ICC profile — kaise use karein

Frontend har request mein bhejta hai:

```
iccProfileBase64  →  decode  →  Buffer  →  .icc file
printColorProfile →  "U.S. Web Coated (SWOP) v2"
```

### Phase 1 (quick start)

- Puppeteer se PDF banao
- ICC embed baad mein add karo
- Order save karo
- Frontend ko JSON success bhejo

### Phase 2 (production print)

1. Decode `iccProfileBase64` to temp file `swop-v2.icc`
2. Ghostscript se RGB PDF → CMYK PDF:

```bash
gs -dSAFER -dBATCH -dNOPAUSE -dNOCACHE \
  -sDEVICE=pdfwrite \
  -sColorConversionStrategy=CMYK \
  -sOutputICCProfile=swop-v2.icc \
  -sOutputFile=output-cmyk.pdf \
  input-rgb.pdf
```

3. Ya **sharp** se images pehle CMYK convert karo, phir PDF banao

---

## 7. Response formats

Frontend dono handle karta hai:

### A) Approve flow — JSON (preferred)

```json
{
  "success": true,
  "message": "Order submitted to print successfully."
}
```

Also accepted field names: `msg`, `message`

HTTP status: **200**

### B) Download flow — PDF binary

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="feature-sheet-R2888424.pdf"
<body = PDF bytes>
```

### C) Download flow — JSON with URL

```json
{
  "url": "https://your-cdn.com/pdfs/feature-sheet-123.pdf"
}
```

Also accepted: `pdf_url`, `file_url`

### Error response

```json
{
  "success": false,
  "message": "printHtml missing"
}
```

HTTP status: **400** or **500**

Frontend error message `message` field se dikhata hai.

---

## 8. Frontend URL change (alag server par)

Jab Node server ready ho, frontend mein URL update karo:

File: `client/src/lib/oversize-pdf-api.ts`

```ts
export const OVERSIZE_PDF3_API_URL =
  "https://YOUR-NODE-SERVER.com/api/pdf3";
```

Dev ke liye:

```ts
export const OVERSIZE_PDF3_API_URL =
  "http://localhost:3001/api/pdf3";
```

---

## 9. Frontend buttons — kya trigger hota hai

| Button | Backend call? | submitMode |
|--------|---------------|------------|
| **Generate Proof** | ❌ No — sirf browser mein JPG preview | — |
| **Approve Proof & Submit** | ✅ Yes — POST pdf3 | `approve_proof_print` |
| **Download PDF** (old oversize page) | ✅ Yes — POST pdf3 | (ICC added, may need printHtml later) |

**Generate Proof** ke liye backend kuch nahi karna.

**Approve** par frontend:
1. Background mein `pdf3` POST karta hai
2. User ko alert dikhata hai
3. Browser print tab kholta hai (local preview)

Asli print job = **tumhara PDF + order DB**.

---

## 10. Testing

### curl test

```bash
curl -X POST http://localhost:3001/api/pdf3 \
  -H "Content-Type: application/json" \
  -d '{"user_id":"5","data":"{\"schemaVersion\":2,\"submitMode\":\"download_pdf\",\"printHtml\":\"<!DOCTYPE html><html><body><h1>Test</h1></body></html>\",\"iccProfileBase64\":\"\"}"}' \
  --output test.pdf
```

### Real payload capture

1. Frontend chalao (`npm run dev`)
2. Feature Sheet Builder kholo
3. DevTools → Network → **Approve Proof & Submit**
4. `pdf3` request → **Copy as cURL** → backend dev ko do

---

## 11. Database — orders table (suggested)

```sql
CREATE TABLE feature_sheet_print_orders (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       VARCHAR(64) NOT NULL,
  tour_id       VARCHAR(64),
  listing_addr  VARCHAR(512),
  quantity      INT NOT NULL DEFAULT 50,
  delivery_method ENUM('pickup','ship') NOT NULL,
  shipping_address TEXT,
  courier       VARCHAR(32),
  pdf_path      VARCHAR(1024),
  icc_profile   VARCHAR(128) DEFAULT 'U.S. Web Coated (SWOP) v2',
  status        ENUM('pending','printing','shipped','done') DEFAULT 'pending',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 12. Checklist — backend ready hone par

- [ ] `POST /api/pdf3` accepts `{ user_id, data }`
- [ ] `JSON.parse(data)` works for large payloads (50mb body limit)
- [ ] `printHtml` → 2-page PDF at 17.5×11.5 in
- [ ] `iccProfileBase64` decoded and embedded (Phase 2)
- [ ] `approve_proof_print` saves order to DB
- [ ] CORS allows frontend origin
- [ ] Returns JSON on approve, PDF on download
- [ ] Frontend URL updated in `oversize-pdf-api.ts`
- [ ] Error messages in `{ message: "..." }` format

---

## 13. Files reference (frontend repo)

| File | Purpose |
|------|---------|
| `client/src/lib/feature-sheet-pdf-payload.ts` | Payload structure |
| `client/src/lib/oversize-pdf-api.ts` | API URL + fetch |
| `client/src/lib/print-color-profile.ts` | ICC loading |
| `client/public/color-profiles/us-web-coated-swop-v2.icc` | ICC file copy |
| `docs/backend-feature-sheet-pdf3.md` | Short English spec |

---

## 14. Questions? Contact frontend team with:

1. Node server URL (production + staging)
2. Sample `pdf3` response format you will use (JSON vs PDF bytes)
3. Max request size supported
4. Order ID returned or not on approve
