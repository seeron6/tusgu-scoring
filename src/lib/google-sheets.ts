import path from "path";
import fs from "fs";
import { google, sheets_v4 } from "googleapis";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "google-config.json");
const STATE_PATH = path.join(DATA_DIR, "google-state.json");

export type GoogleConfig = {
  serviceAccountJson: string | null;
  sheetId: string | null;
  studentsRange: string;
  leaderboardRange: string;
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
  studentsRange: "Students!A1:Z",
  leaderboardRange: "Leaderboard!A1",
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

export async function fetchSheetRows(range: string): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const cfg = readConfig();
  if (!cfg.sheetId) throw new Error("Sheet ID not configured");
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: cfg.sheetId, range });
  const values = res.data.values || [];
  if (values.length === 0) return { headers: [], rows: [] };
  const headers = values[0].map((h) => String(h ?? "").trim());
  const rows = values.slice(1).map((r) => {
    const o: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      o[h] = r[i] ?? "";
    });
    return o;
  });
  return { headers, rows };
}

export async function writeSheetGrid(range: string, header: string[], rows: (string | number)[][]) {
  const cfg = readConfig();
  if (!cfg.sheetId) throw new Error("Sheet ID not configured");
  const sheets = getSheetsClient();

  // Clear the target tab first (parse tab name from range)
  const tabName = range.includes("!") ? range.split("!")[0].replace(/^'|'$/g, "") : range;
  await sheets.spreadsheets.values
    .clear({ spreadsheetId: cfg.sheetId, range: tabName })
    .catch(async () => {
      // tab doesn't exist — create it
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: cfg.sheetId!,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      });
    });

  await sheets.spreadsheets.values.update({
    spreadsheetId: cfg.sheetId,
    range: `${tabName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] },
  });
}

export async function testConnection(): Promise<{ ok: boolean; title?: string; error?: string }> {
  try {
    const cfg = readConfig();
    if (!cfg.serviceAccountJson) return { ok: false, error: "Service account not configured" };
    if (!cfg.sheetId) return { ok: false, error: "Sheet ID not configured" };
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: cfg.sheetId });
    return { ok: true, title: meta.data.properties?.title ?? cfg.sheetId };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
