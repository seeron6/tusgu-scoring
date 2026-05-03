# TUSGU Scoring — Internal Competition Portal

Full-stack score management dashboard for **TUSGU Educational Services** mental math competitions. Built with Next.js, TypeScript, Tailwind, SQLite, and Google Sheets integration.

## Quick Start (Local)

Prerequisites: **Node.js 18+** (the app was built and tested on Node 24).

```bash
# 1. Install
npm install

# 2. Copy env template
cp .env.example .env.local
# Then edit .env.local and replace JWT_SECRET with a random 32+ byte string.

# 3. Run dev server
npm run dev
# App runs at http://localhost:3000
```

Default credentials:
- Username: `tusguscore`
- Password: `internalcomp26`

The SQLite database (`data/tusgu.db`), default question types (Addition / Subtraction / Multiplication / Division), and four trophy types (Gold / Silver / Bronze / Participation) are seeded automatically on first boot.

## Production

```bash
npm run build
npm run start
```

For real production use:
- Set a strong random `JWT_SECRET`
- Run behind HTTPS (a reverse proxy like Caddy / nginx)
- Change the admin password by setting `ADMIN_USERNAME` / `ADMIN_PASSWORD` *before first boot*

## Features

- **Login** — bcrypt-hashed credentials, JWT in httpOnly cookies, 5-attempt-per-minute rate limit, 30-minute idle timeout
- **Setup** — manage competition categories and question types (default points and max questions configurable)
- **Students** — manual CRUD, Excel import (drag-and-drop, auto column mapping, duplicate detection on name + DOB)
- **Scores** — per-student score entry by question type with live total + percentage; bulk Excel import with column mapping
- **Leaderboard** — canonical sort: **Category → Total Score (desc) → Date of Birth (desc, younger wins ties)**, multi-select filters by Category / Centre / Teacher / Score range, one-click trophy assignment
- **Awards** — trophy type manager with reorder, per-category quantity grid, "Apply to All Categories", live preview
- **Sync** — Excel re-import (skip / overwrite duplicates), Excel export (students / leaderboard / full multi-sheet workbook), bidirectional Google Sheets sync

## Security

- Passwords hashed with bcrypt (cost 12)
- JWT (HS256) tokens stored in httpOnly cookies, never in localStorage
- Middleware (`src/middleware.ts`) gates every non-public route
- Login endpoint rate-limited to 5/min/IP (sliding window)
- Strict security headers via `next.config.ts`: CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy
- All API input validated with Zod
- All SQL uses parameterized queries via `better-sqlite3`
- Sensitive files excluded from version control via `.gitignore` (`/data/`, `*.db`, `.env*`)

> **Note on PII column-level encryption.** The original spec called for AES-256 encryption of name/DOB/centre/teacher columns at rest. This MVP relies on filesystem permissions for the SQLite file (`data/tusgu.db`, mode 0600 directory) since the app is designed for an internal LAN deployment. To add transparent column encryption, swap `better-sqlite3` for SQLCipher and pass an encryption key on the `Database` constructor.

## Excel Import — date formats

Supported date formats for student DOB:
- `YYYY-MM-DD` (ISO, recommended)
- `DD/MM/YYYY` or `DD-MM-YYYY` (UK / AU)
- Native Excel date cells

`MM/DD/YYYY` (US format) is **not** auto-detected. Convert dates to ISO before importing.

## Google Sheets Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/), create or pick a project
2. Enable the **Google Sheets API** for that project
3. Create a **Service Account** (IAM & Admin → Service Accounts → New)
4. Generate a JSON key for the service account and download it
5. Share your Google Sheet with the service account email (find it in the JSON as `client_email`) — give **Editor** access
6. In the app: open **Sync**, paste the entire JSON key, paste the sheet URL or ID, set the ranges (defaults: `Students!A1:Z` and `Leaderboard!A1`), then **Save → Test Connection**
7. **Pull from Sheets** imports/merges student rows; **Push Leaderboard** writes the canonical leaderboard back

Auto-sync (in minutes) polls Pull on a timer while the Sync tab is open.

## Project Structure

```
src/
├── app/
│   ├── (app)/                  # auth-protected pages with sidebar
│   │   ├── setup/             # categories + question types
│   │   ├── students/          # CRUD + Excel import
│   │   ├── scores/            # per-student entry + bulk import
│   │   ├── leaderboard/       # ranked view + filters + trophy column
│   │   ├── awards/            # trophy types + per-category allocation
│   │   ├── sync/              # Excel + Google Sheets
│   │   └── layout.tsx
│   ├── api/                    # Next.js route handlers (REST)
│   ├── login/                  # public login page
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/                     # Button, Input, Modal, EmptyState, Skeleton
│   └── sidebar.tsx
├── lib/
│   ├── db.ts                   # SQLite connection + schema + seed
│   ├── auth.ts                 # JWT, cookies, bcrypt helpers
│   ├── rate-limit.ts           # in-memory sliding window
│   ├── ranking.ts              # canonical leaderboard sort + trophy assignment
│   ├── excel.ts                # XLSX parse + import preview/commit + workbook builders
│   ├── google-sheets.ts        # service account auth, fetch/write sheet ranges
│   └── types.ts
└── middleware.ts               # JWT validation for every protected route
```

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend:** Next.js Route Handlers, Node 18+ runtime
- **Database:** SQLite via `better-sqlite3`
- **Auth:** JWT via `jose` + bcrypt via `bcryptjs`
- **Validation:** Zod
- **Excel:** SheetJS (`xlsx`)
- **Sheets:** `googleapis` + `google-auth-library` (service-account auth)
- **State:** Local component state + `react-hot-toast` for notifications
- **Icons:** `lucide-react`
