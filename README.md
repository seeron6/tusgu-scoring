# TUSGU Scoring — Competition Portal

Static-site competition portal for **TUSGU Educational Services**. Students, scores, leaderboards, and trophies live in a Supabase database so multiple staff can edit in parallel. The frontend is Next.js exported as static HTML/JS and hosted on GitHub Pages.

- **Frontend:** Next.js 16 (static export), React 19, Tailwind v4
- **Backend:** Supabase (PostgreSQL + RLS + Realtime)
- **Hosting:** GitHub Pages, deployed on every push to `main`
- **Imports:** .xlsx, .xlsm, .xls, .csv — fully client-side
- **Barcode scanning:** in-browser via `@zxing/browser` (camera permission)

---

## Quick start

### 1. Create the Supabase project
1. Open https://app.supabase.com and create a project (any region, free tier is fine).
2. In the project, open **Database → SQL Editor → New query**.
3. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it. This creates all tables, default question types (Addition/Subtraction and Multiplication/Division, 100 questions each), default trophies (Grand Champion → Champion → 1st-5th Runner Up → Merit), RLS policies, and Realtime publication.
4. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Configure local dev
```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# Set NEXT_PUBLIC_APP_PASSWORD to whatever you want gating Scores/Leaderboard/etc.
npm install
npm run dev
# Open http://localhost:3000
```

### 3. Import the master list
1. Open **Students** in the app.
2. Click **Import**, drop your `.xlsm` (e.g. [`samples/NLC-2025-master-list.xlsm`](samples/NLC-2025-master-list.xlsm)).
3. The app picks the best sheet automatically (the one with the most matching columns), auto-maps Student Code, Exam Code, Student Fullname, Date of Birth, Visual 2025 Category, CI Name, Centre Name, etc. You can change the mapping or pick a different sheet before continuing.
4. **Continue → Import**.

### 4. Deploy to GitHub Pages
1. Create a GitHub repo and push the code:
   ```bash
   git remote add origin git@github.com:YOUR-USER/YOUR-REPO.git
   git push -u origin main
   ```
2. In the repo, open **Settings → Pages** and set **Source = GitHub Actions**.
3. In **Settings → Secrets and variables → Actions**, add these repository secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_PASSWORD` *(optional, defaults to `internalcomp26`)*
   - `NEXT_PUBLIC_BASE_PATH` *(optional, defaults to `/<repo>`)*
4. Push to `main`. The workflow at `.github/workflows/deploy.yml` builds and publishes to `https://<user>.github.io/<repo>/`.

If you later buy a domain, add it as a CNAME under **Settings → Pages**, then drop the `NEXT_PUBLIC_BASE_PATH` repo variable and rebuild.

---

## Pages

| Page | Public? | Purpose |
| --- | --- | --- |
| **Students** | Editing requires password | Roster — search by name, scan a barcode, smart .xlsm import. Columns auto-hide when no data is present. |
| **Scores** | Password-gated | Search or scan a student, enter scores per question type, save back to Supabase. Bulk import via Excel. |
| **Leaderboard** | Password-gated | Ranked by category → score → DOB (younger wins) → name. Filters by category / centre / teacher / score range. Export to xlsx or PDF. |
| **Awards** | Password-gated | Configure trophy types and per-category quantities. Preview winners and export an awards PDF. |
| **Setup** | Password-gated | Manage question types (defaults are 100-question Addition/Subtraction and Multiplication/Division). |
| **Sync** | Password-gated | Excel/PDF exports. (No Google Sheets — that needed a server-side service account.) |

The lock icon next to a nav item means the page needs the password. Once unlocked, the lock state persists for the browser session (sessionStorage).

---

## Smart import

The importer:
- Reads .xlsx, .xlsm (macros ignored), .xls, .csv.
- Inspects every sheet, scores them by how many "student-roster" headers they contain, and pre-selects the best one. Other sheets are still selectable from a dropdown.
- Auto-maps these column variants to the canonical schema:
  - `Student Code`, `Exam Code` (= barcode), `Barcode`
  - `Student Fullname`, `Full Name`, `Name`, or `First Name` + `Last Name`
  - `Date of Birth`, `DOB`, `Born` — supports `17-Nov-2012`, `28-Apr-2017`, `15/06/2018`, ISO dates, and Excel serials
  - `Visual 2025 Category`, `Category`, `Group`, `Class`, `Level`
  - `CI Name`, `Teacher`, `Tutor`
  - `Centre Name`, `Centre`, `School`, `Branch`
  - `Listening Category`, `Listening Code`
  - `T-Shirt Size`, `Email`, `Phone`, `Report Time`, `Comp Time`, `Deduction`
- Anything not mapped is stored on `students.extra` (JSONB) so no data is lost.
- Duplicate detection by Student Code OR Exam Code OR (full name + DOB). You choose Skip or Overwrite at preview.
- Columns with no data populated across the roster are hidden from the Students table automatically.

---

## Trophy hierarchy

Defaults seeded by `supabase/schema.sql`:

1. Grand Champion 🏆
2. Champion 🥇
3. 1st Runner Up 🥈
4. 2nd Runner Up 🥉
5. 3rd Runner Up 🎖️
6. 4th Runner Up 🎖️
7. 5th Runner Up 🎖️
8. Merit ⭐

No participation certificate. Add or rename trophies on the Awards → Configure tab.

Allocations are per-category (e.g. A1 gets 1 Grand Champion, 3 Champions, etc.). The "Apply to all" button copies the active category's quantities to every other category.

---

## Barcode scanning

Click the scan icon in the search bar (Students or Scores page). The app uses your camera and reads any 1-D / 2-D barcode supported by ZXing (Code 128, Code 39, EAN-13, QR, etc.). The decoded string is matched against `barcode`, `exam_code`, `student_code`, then `full_name`. So your Excel `Exam Code` (e.g. `VA3-039`) printed on a parent sticker becomes the barcode that opens that student's score page.

Camera access requires HTTPS — works on `localhost` and on the live GitHub Pages URL, but not on plain HTTP.

---

## Multi-user editing

Supabase Realtime is enabled for `students`, `scores`, `trophy_allocations`, `question_types`, and `trophy_types` (see schema). The current pages refresh on demand, but the Realtime channel is ready if you want live cursor / live update enhancements later — just subscribe in `src/lib/data.ts`.

The default RLS policies grant the anonymous role full read **and** write access. The password gate is purely client-side (UX). For stronger guarantees, switch the RLS policies in `supabase/schema.sql` to require `auth.role() = 'authenticated'` and have the app sign into a single Supabase user with the competition password.

---

## Project layout

```
src/
├── app/
│   ├── (app)/
│   │   ├── students/        Roster, smart .xlsm import, dynamic columns
│   │   ├── scores/          Per-student entry + barcode scanner + bulk import
│   │   ├── leaderboard/     Ranked view with filters and export
│   │   ├── awards/          Trophy types and per-category allocations
│   │   ├── setup/           Question types
│   │   ├── sync/            Excel/PDF exports
│   │   └── layout.tsx       Sidebar wrapper
│   ├── layout.tsx           AuthProvider + global Toaster
│   └── page.tsx             Redirects to /students
├── components/
│   ├── barcode-scanner.tsx  Camera + ZXing
│   ├── sidebar.tsx          Responsive nav with lock indicator
│   └── ui/                  Button, Input, Modal, …
├── lib/
│   ├── supabase.ts          Supabase client
│   ├── data.ts              CRUD helpers (students, scores, trophies, …)
│   ├── ranking.ts           Leaderboard sort + trophy assignment (in-memory)
│   ├── excel.ts             Workbook parsing + import preview + export builders
│   ├── pdf.ts               jsPDF leaderboard + awards reports
│   ├── auth-gate.tsx        Password gate context, ProtectedPage, PasswordModal
│   ├── excel-types.ts       Canonical student field list
│   ├── types.ts             Domain types + Supabase Database type
│   └── utils.ts             cn(), calculateAge, formatDate
supabase/
└── schema.sql               Tables, seeds, RLS, Realtime publication
samples/
└── NLC-2025-master-list.xlsm   Real .xlsm sample for the importer
.github/workflows/
└── deploy.yml               Build + deploy to GitHub Pages
```

---

## Common tasks

**Change the unlock password** — set `NEXT_PUBLIC_APP_PASSWORD` in `.env.local` (for dev) or as a repo secret (for the deployed site). Restart the dev server / re-run the deploy workflow.

**Wipe and reseed** — re-run `supabase/schema.sql`. It's idempotent: existing rows are kept, missing tables are created. To wipe data, run `truncate table public.students cascade;` etc. in the SQL editor first.

**Add a new column to students** — `alter table public.students add column my_col text;`. The smart importer doesn't know about it yet (just falls into `extra`), but you can extend `STUDENT_FIELDS` and `FIELD_HINTS` in [`src/lib/excel.ts`](src/lib/excel.ts) to map a header to it.

**Switch to a custom domain** — add the domain in **Settings → Pages → Custom domain**, drop the `NEXT_PUBLIC_BASE_PATH` env var so the site is served from `/`, and re-run the workflow.
