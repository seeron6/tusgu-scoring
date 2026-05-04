import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { LeaderboardRow, QuestionType } from "./types";
import { groupByTrophyAlphabetical } from "./ranking";

const NAVY: [number, number, number] = [27, 58, 107];
const TEXT: [number, number, number] = [31, 30, 27];
const MUTED: [number, number, number] = [122, 119, 112];
const BORDER: [number, number, number] = [232, 227, 215];
const BG_ALT: [number, number, number] = [250, 249, 245];

/**
 * jsPDF's built-in fonts (Helvetica/Times/Courier) don't carry emoji glyphs,
 * so any emoji in a string renders as garbled boxes. Strip them before they
 * hit the PDF — the text label still conveys the trophy.
 */
function stripEmoji(s: string): string {
  if (!s) return s;
  return s
    // Common emoji ranges + variation selector
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

export type PdfOptions = {
  hideScores?: boolean;
  title?: string;
  subtitle?: string;
};

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("TUSGU", 40, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Educational Services — Competition Portal", 80, 50);

  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 40, 90);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, 40, 108);
  }
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(40, 120, doc.internal.pageSize.getWidth() - 40, 120);
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${new Date().toLocaleString()}`, 40, h - 22);
    doc.text(`Page ${p} of ${pages}`, w - 40, h - 22, { align: "right" });
  }
}

export function leaderboardToPdf(
  rows: LeaderboardRow[],
  questionTypes: QuestionType[],
  opts: PdfOptions = {}
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const showScores = !opts.hideScores;
  header(doc, opts.title ?? "Leaderboard", opts.subtitle);

  const byCat = new Map<string, LeaderboardRow[]>();
  for (const r of rows) {
    const cat = r.student.category ?? "(uncategorised)";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(r);
  }
  const cats = Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let y = 140;
  for (const [cat, list] of cats) {
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage();
      y = 50;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(cat, 40, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`${list.length} students`, 100, y);
    y += 8;

    const head: string[] = ["#", "Name"];
    if (showScores) {
      for (const qt of questionTypes) head.push(qt.name);
      head.push("Total", "%");
    }
    head.push("Trophy", "DOB", "Age", "Centre", "Teacher");

    const body = list.map((r) => {
      const arr: (string | number)[] = [r.rank, r.student.full_name];
      if (showScores) {
        for (const qt of questionTypes) {
          const correct = r.scoresByType[qt.id] ?? 0;
          arr.push(correct * qt.points_per_question);
        }
        arr.push(r.totalScore, `${r.percentage.toFixed(1)}%`);
      }
      arr.push(
        r.trophy ? stripEmoji(r.trophy.name) : "—",
        r.student.dob ?? "",
        r.age ?? "",
        r.student.centre ?? "",
        r.student.teacher ?? ""
      );
      return arr;
    });

    autoTable(doc, {
      head: [head],
      body,
      startY: y,
      margin: { left: 40, right: 40 },
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 5,
        textColor: TEXT,
        lineColor: BORDER,
        lineWidth: 0.4,
      },
      headStyles: { fillColor: BG_ALT, textColor: MUTED, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 24, halign: "center", fontStyle: "bold" } },
    });
    // @ts-expect-error autoTable adds lastAutoTable to the doc
    y = (doc.lastAutoTable?.finalY ?? y) + 30;
  }

  footer(doc);
  return doc.output("arraybuffer") as ArrayBuffer;
}

export function awardsToPdf(rows: LeaderboardRow[], opts: PdfOptions = {}): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const showScores = !opts.hideScores;
  header(
    doc,
    opts.title ?? "Awards & Trophies",
    opts.subtitle ?? "Winners are listed alphabetically within each award."
  );

  const byCat = new Map<string, LeaderboardRow[]>();
  for (const r of rows) {
    const cat = r.student.category ?? "(uncategorised)";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(r);
  }
  const cats = Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let y = 145;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  for (const [cat, list] of cats) {
    if (y > pageH - 140) {
      doc.addPage();
      y = 50;
    }
    doc.setFillColor(...NAVY);
    doc.rect(40, y, pageW - 80, 26, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(cat.toUpperCase(), 52, y + 17);
    y += 38;

    const groups = groupByTrophyAlphabetical(list);
    let hasAnyTrophy = false;
    for (const g of groups) {
      if (!g.trophy || g.rows.length === 0) continue;
      hasAnyTrophy = true;
      if (y > pageH - 100) {
        doc.addPage();
        y = 50;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...NAVY);
      doc.text(stripEmoji(g.trophy.name), 50, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(
        `${g.rows.length} recipient${g.rows.length === 1 ? "" : "s"}`,
        pageW - 50,
        y,
        { align: "right" }
      );
      y += 8;

      const head = showScores
        ? [["Name", "DOB", "Centre", "Teacher", "Score"]]
        : [["Name", "DOB", "Centre", "Teacher"]];
      const body = g.rows.map((r) => {
        const base = [
          r.student.full_name,
          r.student.dob ?? "",
          r.student.centre ?? "",
          r.student.teacher ?? "",
        ];
        return showScores ? [...base, String(r.totalScore)] : base;
      });

      autoTable(doc, {
        head,
        body,
        startY: y,
        margin: { left: 50, right: 50 },
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: 5,
          textColor: TEXT,
          lineColor: BORDER,
          lineWidth: 0.4,
        },
        headStyles: { fillColor: BG_ALT, textColor: MUTED, fontStyle: "bold", fontSize: 7.5 },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        columnStyles: {
          0: { fontStyle: "bold" },
          ...(showScores ? { 4: { halign: "right", fontStyle: "bold" } } : {}),
        },
      });
      // @ts-expect-error autoTable adds lastAutoTable
      y = (doc.lastAutoTable?.finalY ?? y) + 22;
    }

    if (!hasAnyTrophy) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text("No trophies allocated for this category.", 50, y);
      y += 22;
    }
    y += 12;
  }

  footer(doc);
  return doc.output("arraybuffer") as ArrayBuffer;
}
