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
  Eye,
  Copy,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldHint } from "@/components/ui/input";
import { PageHeader } from "@/components/sidebar";

type GoogleConfig = {
  sheetId: string | null;
  studentsTab: string;
  leaderboardTab: string;
  awardsTab: string;
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
        description="Connect a Google Sheet for live two-way sync, or import/export Excel files manually."
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <GoogleSheetsCard />
        <ExcelCard />
      </div>
    </div>
  );
}

/* ───── Google Sheets ───── */

function GoogleSheetsCard() {
  const [config, setConfig] = useState<GoogleConfig | null>(null);
  const [serviceJson, setServiceJson] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [autoSync, setAutoSync] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [studentsTab, setStudentsTab] = useState("");
  const [leaderboardTab, setLeaderboardTab] = useState("Leaderboard");
  const [awardsTab, setAwardsTab] = useState("Awards");
  const [copied, setCopied] = useState(false);

  async function load() {
    const r = await fetch("/api/sync/google/config");
    const c: GoogleConfig = await r.json();
    setConfig(c);
    setSheetUrl(c.sheetId ?? "");
    setAutoSync(c.autoSyncMinutes);
    setStudentsTab(c.studentsTab);
    setLeaderboardTab(c.leaderboardTab);
    setAwardsTab(c.awardsTab);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        sheetUrlOrId: sheetUrl || null,
        autoSyncMinutes: autoSync,
        studentsTab,
        leaderboardTab,
        awardsTab,
      };
      if (serviceJson.trim()) body.serviceAccountJson = serviceJson;
      const r = await fetch("/api/sync/google/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return toast.error(d.error || "Save failed");
      toast.success("Saved");
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
      if (r.ok) toast.success(`Connected to "${d.title}"${d.tabs?.length ? ` · ${d.tabs.length} tabs` : ""}`);
      else toast.error(d.error || "Connection failed");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function dryRun() {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/google/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const d = await r.json();
      if (!r.ok) return toast.error(d.error || "Preview failed");
      toast.success(
        `"${d.tab}" · ${d.rowCount} rows: ${d.valid} new, ${d.duplicates} dup, ${d.invalid} invalid`,
        { duration: 6000 }
      );
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
      toast.success(
        `"${d.tab}": ${d.inserted} added · ${d.updated} updated · ${d.invalid} invalid`,
        { duration: 5000 }
      );
      load();
    } finally {
      setBusy(false);
    }
  }

  async function push(target: "leaderboard" | "awards") {
    setBusy(true);
    try {
      const params = new URLSearchParams({ target, trophies: "1" });
      const r = await fetch(`/api/sync/google/push?${params}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) return toast.error(d.error || "Push failed");
      toast.success(`Pushed ${d.rows} rows to "${d.tab}"`);
      load();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!config?.serviceAccountConfigured || autoSync <= 0) return;
    const id = setInterval(() => pull(), autoSync * 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.serviceAccountConfigured, autoSync]);

  const ready = !!(config?.serviceAccountConfigured && config?.sheetId);

  return (
    <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-[0_1px_2px_0_rgba(31,30,27,0.03)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#F0EDE5] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="w-[15px] h-[15px] text-[#7A7770]" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-[#1F1E1B]">Google Sheets</h2>
        </div>
        <StatusPill ready={ready} hasError={!!config?.state.lastError} />
      </div>

      <div className="p-6 space-y-5">
        {/* Status banner */}
        {config?.serviceAccountConfigured ? (
          <div className="rounded-lg bg-[#F4F1E8] border border-[#E5DECF] p-3.5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#1B3A6B] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-[#1F1E1B]">Service account active</div>
                {config.serviceAccountEmail && (
                  <div className="text-[11.5px] text-[#4A4843] mt-1 flex items-center gap-1.5 flex-wrap">
                    <Mail className="w-3 h-3 shrink-0" />
                    <code className="text-[11px] bg-white border border-[#E5DECF] rounded px-1.5 py-0.5 truncate max-w-full">
                      {config.serviceAccountEmail}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(config.serviceAccountEmail!);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="text-[#1B3A6B] hover:text-[#152d54] inline-flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
                <div className="text-[11px] text-[#7A7770] mt-1.5 leading-relaxed">
                  Share any Google Sheet with this email (Editor access). The sheet then appears here automatically — no
                  range or tab setup needed.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-[#FAF1E5] border border-[#F0DEB8] p-3.5">
            <div className="flex items-start gap-2.5">
              <XCircle className="w-4 h-4 text-[#B8651A] mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-[12.5px] font-semibold text-[#1F1E1B]">Not connected yet</div>
                <ol className="text-[11.5px] text-[#4A4843] mt-1.5 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>
                    In Google Cloud Console, enable the <strong>Sheets API</strong> and create a{" "}
                    <strong>Service Account</strong> with a JSON key.
                  </li>
                  <li>Paste the entire JSON key below and Save.</li>
                  <li>Share your target sheet with the service account email.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Service account JSON */}
        <div>
          <Label>
            Service Account JSON {config?.serviceAccountConfigured && <span className="text-[#7A7770] font-normal">(paste new to replace)</span>}
          </Label>
          <Textarea
            value={serviceJson}
            onChange={(e) => setServiceJson(e.target.value)}
            placeholder={`{ "type": "service_account", "client_email": "...", "private_key": "..." }`}
            rows={3}
            className="font-mono text-[11px]"
          />
        </div>

        {/* Sheet URL */}
        <div>
          <Label>Google Sheet URL or ID</Label>
          <Input
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…/edit"
          />
          <FieldHint>
            Paste any sheet URL — we&apos;ll extract the ID. The app will auto-detect the right tab and header row.
          </FieldHint>
        </div>

        {/* Advanced (collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="text-[11.5px] text-[#7A7770] hover:text-[#1F1E1B] inline-flex items-center gap-1"
          >
            {showAdvanced ? "▾" : "▸"} Advanced settings
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div>
                <Label>Students tab (optional)</Label>
                <Input value={studentsTab} onChange={(e) => setStudentsTab(e.target.value)} placeholder="Auto-detect" />
              </div>
              <div>
                <Label>Leaderboard tab</Label>
                <Input value={leaderboardTab} onChange={(e) => setLeaderboardTab(e.target.value)} />
              </div>
              <div>
                <Label>Awards tab</Label>
                <Input value={awardsTab} onChange={(e) => setAwardsTab(e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Label>Auto-sync (minutes, 0 = off)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  value={autoSync}
                  onChange={(e) => setAutoSync(parseInt(e.target.value || "0", 10))}
                />
                <FieldHint>While the Sync tab is open, pull from Sheets every N minutes.</FieldHint>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={busy}>
            <Save className="w-4 h-4" />
            Save settings
          </Button>
          <Button variant="outline" onClick={test} disabled={busy || !config?.serviceAccountConfigured}>
            <RefreshCcw className="w-4 h-4" />
            Test connection
          </Button>
        </div>

        {ready && (
          <div className="border-t border-[#F0EDE5] pt-5">
            <div className="text-[11px] uppercase tracking-wider text-[#7A7770] mb-3">Sync actions</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={dryRun} disabled={busy}>
                <Eye className="w-4 h-4" />
                Preview pull (dry-run)
              </Button>
              <Button variant="secondary" onClick={pull} disabled={busy}>
                <ArrowDownToLine className="w-4 h-4" />
                Pull students
              </Button>
              <Button variant="outline" onClick={() => push("leaderboard")} disabled={busy}>
                <ArrowUpFromLine className="w-4 h-4" />
                Push leaderboard
              </Button>
              <Button variant="outline" onClick={() => push("awards")} disabled={busy}>
                <ArrowUpFromLine className="w-4 h-4" />
                Push awards
              </Button>
            </div>
          </div>
        )}

        {config && (
          <div className="text-[11px] text-[#7A7770] grid grid-cols-2 gap-2 pt-4 border-t border-[#F0EDE5]">
            <div>
              <div className="uppercase tracking-wider text-[10px] text-[#A8A39B]">Last pull</div>
              <div>{config.state.lastPullAt ? new Date(config.state.lastPullAt).toLocaleString() : "Never"}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-[10px] text-[#A8A39B]">Last push</div>
              <div>{config.state.lastPushAt ? new Date(config.state.lastPushAt).toLocaleString() : "Never"}</div>
            </div>
            {config.state.lastError && (
              <div className="col-span-2 text-[#B8341A] text-[11.5px] bg-[#FAEEE9] border border-[#F2D5C9] rounded px-2.5 py-1.5">
                {config.state.lastError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ ready, hasError }: { ready: boolean; hasError: boolean }) {
  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#FAEEE9] text-[#B8341A] border border-[#F2D5C9]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#B8341A]" /> Error
      </span>
    );
  }
  if (ready) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#EEF4ED] text-[#5A8E54] border border-[#D5E5D2]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#5A8E54]" /> Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#F4F1E8] text-[#7A7770] border border-[#E5DECF]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#A8A39B]" /> Not connected
    </span>
  );
}

/* ───── Excel ───── */

function ExcelCard() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "overwrite">("skip");

  async function reimport(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r1 = await fetch("/api/students/import", { method: "POST", body: fd });
      const data = await r1.json();
      if (!r1.ok) return toast.error(data.error || "Failed to parse file");
      const r2 = await fetch("/api/students/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: data.rows, mapping: data.mapping, duplicateMode }),
      });
      const result = await r2.json();
      if (!r2.ok) return toast.error(result.error || "Import failed");
      toast.success(
        `${result.inserted} added · ${result.updated} updated · ${result.skipped} skipped · ${result.invalid} invalid`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E8E3D7] shadow-[0_1px_2px_0_rgba(31,30,27,0.03)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#F0EDE5] flex items-center gap-2">
        <FileSpreadsheet className="w-[15px] h-[15px] text-[#7A7770]" strokeWidth={1.75} />
        <h2 className="text-[13px] font-semibold text-[#1F1E1B]">Excel</h2>
      </div>
      <div className="p-6 space-y-6">
        <section>
          <div className="text-[10px] uppercase tracking-wider text-[#7A7770] mb-2">Re-import students</div>
          <div className="flex flex-wrap gap-3 text-[12.5px] mb-3 text-[#4A4843]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={duplicateMode === "skip"}
                onChange={() => setDuplicateMode("skip")}
                className="accent-[#1B3A6B]"
              />
              Skip duplicates
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={duplicateMode === "overwrite"}
                onChange={() => setDuplicateMode("overwrite")}
                className="accent-[#1B3A6B]"
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

        <hr className="border-[#F0EDE5]" />

        <section>
          <div className="text-[10px] uppercase tracking-wider text-[#7A7770] mb-3">Quick exports</div>
          <div className="grid grid-cols-1 gap-2">
            <Button variant="outline" onClick={() => window.open("/api/export/students", "_blank")}>
              <Download className="w-4 h-4" />
              Students (xlsx)
            </Button>
            <Button variant="outline" onClick={() => window.open("/api/export/leaderboard?trophies=1&format=xlsx", "_blank")}>
              <Download className="w-4 h-4" />
              Leaderboard (xlsx)
            </Button>
            <Button variant="outline" onClick={() => window.open("/api/export/awards?format=xlsx", "_blank")}>
              <Download className="w-4 h-4" />
              Awards (xlsx)
            </Button>
            <Button variant="outline" onClick={() => window.open("/api/export/full?trophies=1", "_blank")}>
              <Download className="w-4 h-4" />
              Full dataset (multi-sheet)
            </Button>
          </div>
          <FieldHint>
            For PDF, image, or Google-Sheets exports with options, use the Export menu on the Leaderboard or Awards page.
          </FieldHint>
        </section>
      </div>
    </div>
  );
}
