"use client";
import { useEffect, useRef, useState } from "react";
import {
  RefreshCcw,
  FileSpreadsheet,
  Cloud,
  CheckCircle2,
  XCircle,
  Save,
  Upload,
  Download,
  ArrowDownToLine,
  ArrowUpFromLine,
  Mail,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/sidebar";

type GoogleConfig = {
  sheetId: string | null;
  studentsRange: string;
  leaderboardRange: string;
  autoSyncMinutes: number;
  serviceAccountConfigured: boolean;
  serviceAccountEmail: string | null;
  state: { lastPullAt: string | null; lastPushAt: string | null; lastError: string | null };
};

export default function SyncPage() {
  return (
    <div>
      <PageHeader
        title="Sync"
        description="Live two-way connection with Google Sheets, plus Excel re-import and full export."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExcelCard />
        <GoogleSheetsCard />
      </div>
    </div>
  );
}

function ExcelCard() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "overwrite">("skip");

  async function reimport(file: File) {
    setBusy(true);
    try {
      // Stage 1: parse
      const fd = new FormData();
      fd.append("file", file);
      const r1 = await fetch("/api/students/import", { method: "POST", body: fd });
      const data = await r1.json();
      if (!r1.ok) {
        toast.error(data.error || "Failed to parse file");
        return;
      }
      // Stage 2: commit with chosen mode
      const r2 = await fetch("/api/students/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: data.rows, mapping: data.mapping, duplicateMode }),
      });
      const result = await r2.json();
      if (!r2.ok) {
        toast.error(result.error || "Import failed");
        return;
      }
      toast.success(`${result.inserted} added · ${result.updated} updated · ${result.skipped} skipped · ${result.invalid} invalid`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4 text-[#1B3A6B]" />
        <h2 className="text-sm font-semibold text-[#0F172A]">Excel</h2>
      </div>
      <div className="p-5 space-y-5">
        <section>
          <div className="text-xs uppercase tracking-wide text-[#64748B] mb-2">Re-import & merge students</div>
          <div className="flex flex-wrap gap-3 text-sm mb-3">
            <label className="flex items-center gap-2">
              <input type="radio" checked={duplicateMode === "skip"} onChange={() => setDuplicateMode("skip")} />
              Skip duplicates
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={duplicateMode === "overwrite"}
                onChange={() => setDuplicateMode("overwrite")}
              />
              Overwrite existing
            </label>
          </div>
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4" />
            {busy ? "Importing…" : "Choose Excel file"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) reimport(f);
              e.target.value = "";
            }}
          />
        </section>

        <hr className="border-[#E2E8F0]" />

        <section className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-[#64748B] mb-1">Export</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => window.open("/api/export/students", "_blank")}>
              <Download className="w-4 h-4" />
              Students
            </Button>
            <Button variant="outline" onClick={() => window.open("/api/export/leaderboard?trophies=1", "_blank")}>
              <Download className="w-4 h-4" />
              Leaderboard
            </Button>
            <Button variant="outline" onClick={() => window.open("/api/export/full?trophies=1", "_blank")} className="sm:col-span-2">
              <Download className="w-4 h-4" />
              Full Dataset (multi-sheet)
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function GoogleSheetsCard() {
  const [config, setConfig] = useState<GoogleConfig | null>(null);
  const [serviceJson, setServiceJson] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [studentsRange, setStudentsRange] = useState("");
  const [leaderboardRange, setLeaderboardRange] = useState("");
  const [autoSync, setAutoSync] = useState(0);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/sync/google/config");
    const c: GoogleConfig = await r.json();
    setConfig(c);
    setSheetId(c.sheetId ?? "");
    setStudentsRange(c.studentsRange);
    setLeaderboardRange(c.leaderboardRange);
    setAutoSync(c.autoSyncMinutes);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        sheetId: sheetId || null,
        studentsRange,
        leaderboardRange,
        autoSyncMinutes: autoSync,
      };
      if (serviceJson.trim()) body.serviceAccountJson = serviceJson;
      const r = await fetch("/api/sync/google/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return toast.error(d.error || "Save failed");
      toast.success("Settings saved");
      setServiceJson("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/google/test", { method: "POST" });
      const d = await r.json();
      if (r.ok) toast.success(`Connected to "${d.title}"`);
      else toast.error(d.error || "Connection failed");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function pull() {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/google/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ duplicateMode: "overwrite" }),
      });
      const d = await r.json();
      if (!r.ok) return toast.error(d.error || "Pull failed");
      toast.success(`${d.inserted} added · ${d.updated} updated · ${d.skipped} skipped · ${d.invalid} invalid`);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function push() {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/google/push?trophies=1", { method: "POST" });
      const d = await r.json();
      if (!r.ok) return toast.error(d.error || "Push failed");
      toast.success(`Pushed ${d.rows} rows to leaderboard`);
      load();
    } finally {
      setBusy(false);
    }
  }

  // Simple auto-sync polling
  useEffect(() => {
    if (!config?.serviceAccountConfigured || autoSync <= 0) return;
    const id = setInterval(() => {
      pull();
    }, autoSync * 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.serviceAccountConfigured, autoSync]);

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
        <Cloud className="w-4 h-4 text-[#1B3A6B]" />
        <h2 className="text-sm font-semibold text-[#0F172A]">Google Sheets</h2>
      </div>

      <div className="p-5 space-y-5">
        {config?.serviceAccountConfigured ? (
          <div className="rounded-md bg-green-50 border border-green-200 p-3 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] mt-0.5 shrink-0" />
            <div className="text-xs text-[#0F172A]">
              <div className="font-semibold">Service account configured</div>
              {config.serviceAccountEmail && (
                <div className="text-[#64748B] mt-0.5 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  <code className="text-[11px]">{config.serviceAccountEmail}</code>
                </div>
              )}
              <div className="text-[#64748B] mt-1">Share your Google Sheet with this email (Editor) before syncing.</div>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <XCircle className="w-4 h-4 text-[#D97706] mt-0.5 shrink-0" />
            <div className="text-xs text-[#0F172A]">
              <div className="font-semibold">Not connected</div>
              <div className="text-[#64748B] mt-1 leading-relaxed">
                Create a service account in Google Cloud (Sheets API enabled), download the JSON key, paste it below,
                then share your sheet with the service account email.
              </div>
            </div>
          </div>
        )}

        <div>
          <Label>Service Account JSON {config?.serviceAccountConfigured && "(paste new to replace)"}</Label>
          <textarea
            value={serviceJson}
            onChange={(e) => setServiceJson(e.target.value)}
            placeholder={'{ "type": "service_account", "project_id": "...", "client_email": "...", "private_key": "..." }'}
            rows={4}
            className="w-full rounded-md border border-[#E2E8F0] bg-white p-2 text-xs font-mono outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>

        <div>
          <Label>Sheet ID or URL</Label>
          <Input
            value={sheetId}
            onChange={(e) => setSheetId(extractSheetId(e.target.value))}
            placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Students range</Label>
            <Input value={studentsRange} onChange={(e) => setStudentsRange(e.target.value)} />
          </div>
          <div>
            <Label>Leaderboard range</Label>
            <Input value={leaderboardRange} onChange={(e) => setLeaderboardRange(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Auto-sync (minutes, 0 = off)</Label>
          <Input
            type="number"
            min={0}
            max={1440}
            value={autoSync}
            onChange={(e) => setAutoSync(parseInt(e.target.value || "0", 10))}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy}>
            <Save className="w-4 h-4" />
            Save
          </Button>
          <Button variant="outline" onClick={test} disabled={busy || !config?.serviceAccountConfigured}>
            <RefreshCcw className="w-4 h-4" />
            Test Connection
          </Button>
          <Button variant="secondary" onClick={pull} disabled={busy || !config?.serviceAccountConfigured}>
            <ArrowDownToLine className="w-4 h-4" />
            Pull from Sheets
          </Button>
          <Button variant="secondary" onClick={push} disabled={busy || !config?.serviceAccountConfigured}>
            <ArrowUpFromLine className="w-4 h-4" />
            Push Leaderboard
          </Button>
        </div>

        {config && (
          <div className="text-xs text-[#64748B] grid grid-cols-2 gap-2 pt-3 border-t border-[#E2E8F0]">
            <div>
              <div className="uppercase tracking-wider text-[10px]">Last pull</div>
              <div>{config.state.lastPullAt ? new Date(config.state.lastPullAt).toLocaleString() : "Never"}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-[10px]">Last push</div>
              <div>{config.state.lastPushAt ? new Date(config.state.lastPushAt).toLocaleString() : "Never"}</div>
            </div>
            {config.state.lastError && (
              <div className="col-span-2 text-[#DC2626]">Last error: {config.state.lastError}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function extractSheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return trimmed;
}
