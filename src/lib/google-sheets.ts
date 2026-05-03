import path from "path";
import fs from "fs";
import { google, sheets_v4 } from "googleapis";
import { cleanGrid, type ParsedRow } from "./excel";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "google-config.json");
const STATE_PATH = path.join(DATA_DIR, "google-state.json");

export type GoogleConfig = {
  serviceAccountJson: string | null;
  sheetId: string | null;
  /** Optional override; if blank we auto-detect the best students tab */
  studentsTab: string;
  /** Tab to push the leaderboard into (created if missing) */
  leaderboardTab: string;
  /** Tab to push the awards listing into (created if missing) */
  awardsTab: string;
  autoSyncMinutes: number;
};

export type GoogleState = {
  lastPullAt: string | null;
  lastPushAt: string | null;
  lastError: string | null;
};

const DEFAULT_CONFIG: GoogleConfig = {
  serviceAccountJson: null,
  sheetId: null,
  studentsTab: "",
  leaderboardTab: "Leaderboard",
  awardsTab: "Awards",
  autoSyncMinutes: 0,
};

const DEFAULT_STATE: GoogleState = { lastPullAt: null, lastPushAt: null, lastError: null };

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readConfig(): GoogleConfig {
  ensureDir();
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(c: Partial<GoogleConfig>) {
  ensureDir();
  const cur = readConfig();
  const next = { ...cur, ...c };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
}

export function readState(): GoogleState {
  ensureDir();
  if (!fs.existsSync(STATE_PATH)) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeState(s: Partial<GoogleState>) {
  ensureDir();
  const cur = readState();
  fs.writeFileSync(STATE_PATH, JSON.stringify({ ...cur, ...s }, null, 2));
}

/** Accepts either a raw ID or a full Google Sheets URL; returns the bare ID. */
export function extractSheetId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

export function getSheetsClient(): sheets_v4.Sheets {
  const cfg = readConfig();
  if (!cfg.serviceAccountJson) throw new Error("Service account JSON not configured");
  let creds;
  try {
    creds = JSON.parse(cfg.serviceAccountJson);
  } catch {
    throw new Error("Service account JSON is invalid");
  }
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/**
 * List all tabs and a small data sample for each.
 * Used by the UI for tab discovery / preview.
 */
export async function listTabs(sheetId: string): Promise<{ title: string; rows: number; columns: number }[]> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  return (meta.data.sheets ?? []).map((s) => ({
    title: s.properties?.title ?? "(untitled)",
    rows: s.properties?.gridProperties?.rowCount ?? 0,
    columns: s.properties?.gridProperties?.columnCount ?? 0,
  }));
}

/**
 * Score a tab on how "student-like" its content looks. Higher = better.
 * Returns 0 if the tab has no data we can use.
 */
function scoreTabContent(grid: unknown[][]): number {
  if (!grid || grid.length === 0) return 0;
  const flat = grid
    .slice(0, 12)
    .flat()
    .map((c) => String(c ?? "").toLowerCase());
  const keywords = ["name", "first", "last", "dob", "birth", "category", "centre", "school", "teacher"];
  let score = 0;
  for (const kw of keywords) {
    if (flat.some((c) => c.includes(kw))) score++;
  }
  return score;
}

/**
 * Pick the best tab for student data. If `preferredTab` is set and exists, use it.
 * Otherwise read the first cells of each tab and pick the highest-scoring one.
 */
export async function pickStudentTab(sheetId: string, preferredTab: string): Promise<string | null> {
  const tabs = await listTabs(sheetId);
  if (tabs.length === 0) return null;
  if (preferredTab) {
    const match = tabs.find((t) => t.title.toLowerCase() === preferredTab.toLowerCase());
    if (match) return match.title;
  }
  // Score each tab
  const sheets = getSheetsClient();
  const ranges = tabs.map((t) => `'${t.title.replace(/'/g, "''")}'!A1:Z25`);
  let best: { title: string; score: number } | null = null;
  // batchGet to be efficient
  try {
    const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId: sheetId, ranges });
    const valueRanges = res.data.valueRanges ?? [];
    valueRanges.forEach((vr, i) => {
      const grid = (vr.values as unknown[][]) ?? [];
      const score = scoreTabContent(grid);
      // Prefer tabs explicitly named like "students" / "registrations"
      const titleLower = tabs[i].title.toLowerCase();
      const titleBoost = /student|particip|register|enroll|roster/.test(titleLower) ? 5 : 0;
      const totalScore = score + titleBoost;
      if (!best || totalScore > best.score) {
        best = { title: tabs[i].title, score: totalScore };
      }
    });
  } catch {
    // fall through
  }
  if (!best) return tabs[0]?.title ?? null;
  // If even the best tab has no recognizable headers, still return first tab
  return (best as { title: string; score: number }).score > 0 ? (best as { title: string; score: number }).title : tabs[0]?.title ?? null;
}

/**
 * Read the chosen students tab, auto-detect the header row, and return cleaned rows.
 * Caller can then run the Excel import preview/commit pipeline on these rows.
 */
export async function fetchStudentsFromSheet(): Promise<{
  tab: string;
  headers: string[];
  rows: ParsedRow[];
} | null> {
  const cfg = readConfig();
  if (!cfg.sheetId) throw new Error("Sheet ID not configured");
  const tab = await pickStudentTab(cfg.sheetId, cfg.studentsTab);
  if (!tab) return null;
  const sheets = getSheetsClient();
  const range = `'${tab.replace(/'/g, "''")}'!A1:ZZ`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: cfg.sheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const grid = (res.data.values as unknown[][]) ?? [];
  const cleaned = cleanGrid(grid);
  return { tab, headers: cleaned.headers, rows: cleaned.rows };
}

export async function writeSheetGrid(tabName: string, header: string[], rows: (string | number)[][]) {
  const cfg = readConfig();
  if (!cfg.sheetId) throw new Error("Sheet ID not configured");
  const sheets = getSheetsClient();

  // Ensure the tab exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId: cfg.sheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === tabName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: cfg.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
  } else {
    await sheets.spreadsheets.values.clear({ spreadsheetId: cfg.sheetId, range: tabName });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: cfg.sheetId,
    range: `'${tabName.replace(/'/g, "''")}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] },
  });
}

export async function testConnection(): Promise<{ ok: boolean; title?: string; tabs?: string[]; error?: string }> {
  try {
    const cfg = readConfig();
    if (!cfg.serviceAccountJson) return { ok: false, error: "Service account not configured" };
    if (!cfg.sheetId) return { ok: false, error: "Sheet ID not configured" };
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: cfg.sheetId });
    return {
      ok: true,
      title: meta.data.properties?.title ?? cfg.sheetId,
      tabs: (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "(untitled)"),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    // Surface common access errors more helpfully
    if (msg.includes("permission") || msg.includes("403") || msg.includes("does not have")) {
      return {
        ok: false,
        error:
          "Permission denied. Share the Google Sheet with the service account email (Editor) and try again.",
      };
    }
    if (msg.includes("not found") || msg.includes("404")) {
      return { ok: false, error: "Sheet not found. Double-check the URL or ID." };
    }
    return { ok: false, error: msg };
  }
}
