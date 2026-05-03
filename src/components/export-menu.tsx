"use client";
import * as React from "react";
import { Download, FileSpreadsheet, FileText, ImageIcon, Cloud, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Surface = "leaderboard" | "awards";
type Format = "xlsx" | "pdf" | "sheets" | "images";

export function ExportMenu({
  surface,
  filters,
  trophiesApplied,
  /** CSS selector for elements to capture as images. Each match becomes one PNG. */
  imageSelector,
}: {
  surface: Surface;
  filters?: Record<string, string | string[] | undefined>;
  trophiesApplied?: boolean;
  imageSelector?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [format, setFormat] = React.useState<Format>("xlsx");
  const [hideScores, setHideScores] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [imageFormat, setImageFormat] = React.useState<"png" | "jpeg">("png");

  function buildQuery() {
    const p = new URLSearchParams();
    if (trophiesApplied || surface === "awards") p.set("trophies", "1");
    if (hideScores) p.set("hide_scores", "1");
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v == null) continue;
        if (Array.isArray(v)) {
          if (v.length) p.set(k, v.join(","));
        } else if (v !== "") {
          p.set(k, String(v));
        }
      }
    }
    return p;
  }

  async function run() {
    setBusy(true);
    try {
      if (format === "xlsx" || format === "pdf") {
        const params = buildQuery();
        params.set("format", format);
        const url = `/api/export/${surface}?${params.toString()}`;
        triggerDownload(url);
        toast.success(`${format.toUpperCase()} download started`);
        setOpen(false);
      } else if (format === "sheets") {
        const params = buildQuery();
        params.set("target", surface === "awards" ? "awards" : "leaderboard");
        const r = await fetch(`/api/sync/google/push?${params.toString()}`, { method: "POST" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          toast.error(d.error || "Push failed");
          return;
        }
        toast.success(`Pushed ${d.rows ?? 0} rows to "${d.tab}"`);
        setOpen(false);
      } else if (format === "images") {
        if (!imageSelector) {
          toast.error("Image export not available on this page");
          return;
        }
        const els = document.querySelectorAll<HTMLElement>(imageSelector);
        if (els.length === 0) {
          toast.error("No content to capture");
          return;
        }
        // Lazy-load both libs only when needed
        const [{ default: html2canvas }, { default: JSZip }] = await Promise.all([
          import("html2canvas-pro"),
          import("jszip"),
        ]);
        const zip = new JSZip();
        for (const el of Array.from(els)) {
          const name =
            el.dataset.exportName?.replace(/[^A-Za-z0-9 _-]/g, "").trim() || `section-${els.length}`;
          const canvas = await html2canvas(el, {
            backgroundColor: "#FFFFFF",
            scale: 2,
            useCORS: true,
          });
          const blob: Blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("Canvas to blob failed"))),
              imageFormat === "png" ? "image/png" : "image/jpeg",
              imageFormat === "jpeg" ? 0.92 : undefined
            );
          });
          zip.file(`${name}.${imageFormat}`, blob);
        }
        const out = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(out);
        const a = document.createElement("a");
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 10);
        a.download = `tusgu-${surface}-images-${stamp}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`${els.length} image${els.length === 1 ? "" : "s"} exported`);
        setOpen(false);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  const formats: { id: Format; label: string; description: string; icon: React.ReactNode }[] = [
    { id: "xlsx", label: "Excel", description: ".xlsx workbook for spreadsheet apps", icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: "pdf", label: "PDF", description: "Print-ready document", icon: <FileText className="w-4 h-4" /> },
    { id: "sheets", label: "Google Sheets", description: "Push directly to your linked sheet", icon: <Cloud className="w-4 h-4" /> },
    { id: "images", label: "Images (ZIP)", description: imageSelector ? "One image per category, bundled as a ZIP" : "Not available on this page", icon: <ImageIcon className="w-4 h-4" /> },
  ];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className="w-3.5 h-3.5 -mr-1 opacity-60" />
      </Button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Export"
        description={surface === "awards" ? "Export the awards listing." : "Export the current leaderboard view."}
        width="max-w-lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={run} disabled={busy || (format === "images" && !imageSelector)}>
              {busy ? "Exporting…" : "Export"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {formats.map((f) => {
                const disabled = f.id === "images" && !imageSelector;
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setFormat(f.id)}
                    className={cn(
                      "text-left p-3 rounded-lg border transition-all",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      format === f.id
                        ? "border-[#1B3A6B] bg-[#F4F1E8] ring-[3px] ring-[#1B3A6B]/12"
                        : "border-[#E8E3D7] hover:border-[#D9D2BE] bg-white"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-[#1B3A6B]", format === f.id ? "" : "text-[#7A7770]")}>
                        {f.icon}
                      </span>
                      <span className="text-[13px] font-semibold text-[#1F1E1B]">{f.label}</span>
                    </div>
                    <div className="text-[11px] text-[#7A7770] leading-snug">{f.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#F0EDE5] pt-4 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideScores}
                onChange={(e) => setHideScores(e.target.checked)}
                className="mt-0.5 accent-[#1B3A6B]"
              />
              <span>
                <span className="text-[13px] font-medium text-[#1F1E1B] block">Hide individual scores</span>
                <span className="text-[11px] text-[#7A7770]">
                  Only show name, rank, and trophy. Useful for sharing outside staff.
                </span>
              </span>
            </label>

            {format === "images" && (
              <div>
                <Label>Image format</Label>
                <Select value={imageFormat} onChange={(e) => setImageFormat(e.target.value as "png" | "jpeg")}>
                  <option value="png">PNG (lossless, larger)</option>
                  <option value="jpeg">JPEG (smaller, slight compression)</option>
                </Select>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
}
