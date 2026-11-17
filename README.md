# cotalalatest

# Cotala Web

Agent portal for Cotala. Real-estate agents can manage listings, book services, build feature sheets, and handle print / design jobs from one place.

The live product talks to the existing Cotala backend at `cotala.com`. This repo is the web frontend (plus a small local Node server used only in development).

---

## What this app does

- **Login / register / forgot password** — agent authentication
- **Dashboard** — listings overview, upcoming services, knowledge-base cards
- **Listings** — listing list, details, feature listing copy, oversize feature sheets
- **Feature Sheet Builder** — print-ready 2-page feature sheets (layout, branding, proof, PDF)
- **Orders** — new appointment, seller flow, different-day flow, order history and details
- **Design Job** — design requests
- **Proof Review** — review print proofs
- **Profile** — account, branding, and service preferences
- **Chat support** — in-app assistant for booking, pricing, and listing help
- **AI Tool** — placeholder page (coming soon)

---

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TypeScript, Vite 7 |
| Styling | Tailwind CSS 4, Radix UI |
| Routing | Wouter |
| Data | TanStack Query |
| Hosting | Firebase Hosting (`cotalaweb`) |
| Local server | Express (dev / static serve only) |

Production API:

```
https://appslure.app/cotalacustomer/api/
```

---

## Requirements

- Node.js 20+
- npm 10+

---

## Setup

```bash
npm install
```

Start local development (Vite client + local server together):

```bash
npm run dev
```

Or run them separately:

```bash
npm run client    # Vite frontend
npm run server    # local Express server
```

App runs on **port 5000** by default.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Client + server together |
| `npm run client` | Vite only |
| `npm run server` | Local Express only |
| `npm run build` | Production build into `dist/` |
| `npm start` | Serve the production build |
| `npm run check` | TypeScript check |

---

## Project layout

```
client/                 Frontend (Vite root)
  public/               Static assets (favicon, ICC color profile)
  src/
    pages/              Screens (auth, dashboard, listings, orders, …)
    components/         Shared UI + chat widget
    lib/                API client, PDF helpers, chat, utilities
server/                 Local Express (no business APIs here)
shared/                 Shared types
docs/                   Backend PDF API notes for the print pipeline
```

The Vite `@` alias points at `client/src`.

---

## Main routes

| Path | Screen |
| --- | --- |
| `/login` `/register` `/forgot-password` | Auth |
| `/dashboard` | Home |
| `/listings` | Listings |
| `/listing-details` | Listing details |
| `/feature-listing` | Feature listing copy |
| `/feature-sheet` | Feature sheet selector |
| `/feature-sheet-builder` | Feature sheet editor |
| `/oversize-feature-sheets` | Oversize sheet order |
| `/new-appointment` | New order |
| `/orders` | Order history |
| `/design-job` | Design job |
| `/proof-review` | Proof review |
| `/profile` `/branding` `/preferences` | Account |
| `/ai-tool` | Marketing kit from listing photos |

---

## Feature sheets & print PDFs

The builder creates print HTML in the browser (17.5" × 11.5" landscape, bleed, SWOP ICC profile).

PDF generation is handled by a separate backend endpoint:

```
POST /api/pdf3
```

Contract and payload details are in:

- `docs/BACKEND-NODEJS-PDF3-SPEC.md`
- `docs/backend-feature-sheet-pdf3.md`

ICC profile used for print:

```
client/public/color-profiles/us-web-coated-swop-v2.icc
```

---

## Deploy (Firebase Hosting)

```bash
npm run build
firebase deploy --only hosting
```

`firebase.json` serves the `dist/` folder and rewrites all routes to `index.html` (SPA).

---

## Notes for handover

- Auth token and user id are stored in the browser (`cotala_token`, `cotala_user_id`, `cotala_user`).
- Listing and order data come from the Cotala web API, not from the local Express server.
- Chat / listing-copy helpers call an external language-model API. Treat those credentials as secrets and rotate them if this repo is shared.
- Do not commit `node_modules/` or `dist/`.
- `client/src 2/` is leftover duplicate source. It is not used by the build. Safe to ignore or delete.
