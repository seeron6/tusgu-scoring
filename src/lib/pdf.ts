import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { LeaderboardRow, QuestionType, TrophyType } from "./types";
import { groupByTrophyAlphabetical } from "./ranking";
import { formatStudentDob } from "./utils";

const NAVY: [number, number, number] = [27, 58, 107];
const TEXT: [number, number, number] = [31, 30, 27];
const MUTED: [number, number, number] = [122, 119, 112];
const BORDER: [number, number, number] = [232, 227, 215];
const BG_ALT: [number, number, number] = [250, 249, 245];

export type PdfOptions = {
  hideScores?: boolean;
  title?: string;
  subtitle?: string;
};

/**
 * jsPDF's built-in fonts (Helvetica/Times/Courier) don't carry emoji glyphs,
 * so any emoji in a string renders as garbled boxes. Strip them before they
 * hit the PDF — the text label still conveys the trophy.
 */
function stripEmoji(s: string): string {
  if (!s) return s;
  return s
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function header(doc: jsPDF, title: string, subtitle?: string) {
  // "TUSGU" + tagline on one line — measure the brand text so the tagline
  // never overlaps it (the bug that produced "TUSGUucational Services").
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("TUSGU", 40, 50);
  const tusguWidth = doc.getTextWidth("TUSGU");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Educational Services — Competition Portal", 40 + tusguWidth + 12, 50);

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

// =============================================================
// Leaderboard PDF — split by category, table is Rank/Name/Scores/Total/Trophy
// (full ranked listing). Used for the "Leaderboard with score" export.
// =============================================================

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
        r.trophy ? stripEmoji(r.trophy.name) : "-",
        formatStudentDob(r.student),
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

// =============================================================
// Awards PDF — by category, by trophy band, alphabetical within band.
// Only includes students who actually won a trophy (no participation row).
// Columns: Name, Trophy, Centre, Teacher [, Score].
// `withScores` adds a final Score column for the "with-scores" export option.
// =============================================================

export type AwardsPdfOptions = PdfOptions & {
  withScores?: boolean;
};

export function awardsToPdf(rows: LeaderboardRow[], opts: AwardsPdfOptions = {}): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const showScores = !!opts.withScores;
  header(
    doc,
    opts.title ?? "Awards & Trophies",
    opts.subtitle ?? (showScores
      ? "Winners listed alphabetically within each trophy band, with their scores."
      : "Winners listed alphabetically within each trophy band.")
  );

  // Drop everyone who isn't a winner BEFORE grouping so empty categories
  // don't leak through.
  const winners = rows.filter((r) => r.trophy != null);

  const byCat = new Map<string, LeaderboardRow[]>();
  for (const r of winners) {
    const cat = r.student.category ?? "(uncategorised)";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(r);
  }
  const cats = Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let y = 145;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  if (cats.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text("No trophy winners yet. Configure trophy quantities on the Awards page first.", 40, y);
    footer(doc);
    return doc.output("arraybuffer") as ArrayBuffer;
  }

  for (const [cat, list] of cats) {
    if (y > pageH - 140) {
      doc.addPage();
      y = 50;
    }
    // Category banner
    doc.setFillColor(...NAVY);
    doc.rect(40, y, pageW - 80, 26, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(cat.toUpperCase(), 52, y + 17);
    y += 38;

    // Group winners by trophy, sort each group alphabetically by full_name.
    // groupByTrophyAlphabetical already does this.
    const groups = groupByTrophyAlphabetical(list);

    // Build one autoTable per trophy band so the band heading sticks with its rows.
    for (const g of groups) {
      if (!g.trophy || g.rows.length === 0) continue;
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
        ? [["Name", "Trophy", "Centre", "Teacher", "Score"]]
        : [["Name", "Trophy", "Centre", "Teacher"]];
      const body = g.rows.map((r) => {
        const base: (string | number)[] = [
          r.student.full_name,
          stripEmoji(g.trophy!.name),
          r.student.centre ?? "",
          r.student.teacher ?? "",
        ];
        if (showScores) base.push(r.totalScore);
        return base;
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
        columnStyles: showScores
          ? { 0: { fontStyle: "bold" }, 4: { halign: "right", fontStyle: "bold" } }
          : { 0: { fontStyle: "bold" } },
      });
      // @ts-expect-error autoTable adds lastAutoTable
      y = (doc.lastAutoTable?.finalY ?? y) + 22;
    }

    y += 12;
  }

  footer(doc);
  return doc.output("arraybuffer") as ArrayBuffer;
}

// =============================================================
// Coaches / Centres PDF — leaderboard by teacher or by centre.
// =============================================================

export type CoachRow = {
  key: string;
  centres?: string[]; // teacher mode only
  studentCount: number;
  totalTrophies: number;
  totalPoints: number;
  trophyCounts: Record<number, number>; // trophy_type_id -> count
};

export function coachesToPdf(
  rows: CoachRow[],
  trophyTypes: TrophyType[],
  mode: "teachers" | "centres",
  opts: PdfOptions = {}
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const sortedTrophies = [...trophyTypes].sort((a, b) => a.display_order - b.display_order);
  const subjectLabel = mode === "teachers" ? "Teacher (CI)" : "Centre";
  header(
    doc,
    opts.title ?? (mode === "teachers" ? "Teacher (CI) Leaderboard" : "Centre Leaderboard"),
    opts.subtitle ?? "Ranked by total trophy points."
  );

  const head: string[] = ["#", subjectLabel];
  if (mode === "teachers") head.push("Centres");
  head.push("Students");
  for (const t of sortedTrophies) head.push(t.name.replace("Runner Up", "RU"));
  head.push("Trophies", "Points");

  const body = rows.map((r, i) => {
    const arr: (string | number)[] = [i + 1, r.key];
    if (mode === "teachers") arr.push((r.centres ?? []).join(", "));
    arr.push(r.studentCount);
    for (const t of sortedTrophies) arr.push(r.trophyCounts[t.id] ?? 0);
    arr.push(r.totalTrophies, r.totalPoints);
    return arr;
  });

  autoTable(doc, {
    head: [head],
    body,
    startY: 140,
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
    columnStyles: {
      0: { cellWidth: 24, halign: "center", fontStyle: "bold" },
    },
  });

  footer(doc);
  return doc.output("arraybuffer") as ArrayBuffer;
}

// =============================================================
// Students roster PDF — basic info or with scores.
// =============================================================

export type RosterPdfOptions = PdfOptions & {
  withScores?: boolean;
  questionTypes?: QuestionType[];
  scoresByStudent?: Map<number, Record<number, number>>;
};

export function studentsToPdf(
  students: import("./types").Student[],
  opts: RosterPdfOptions = {}
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  header(
    doc,
    opts.title ?? (opts.withScores ? "Student Roster with Scores" : "Student Roster"),
    opts.subtitle ?? `${students.length} students`
  );

  const head: string[] = ["#", "Name", "Code", "DOB", "Gender", "Category", "Centre", "Teacher"];
  if (opts.withScores && opts.questionTypes) {
    for (const qt of opts.questionTypes) head.push(qt.name);
    head.push("Total");
  }

  const body = students.map((s, i) => {
    const arr: (string | number)[] = [
      i + 1,
      s.full_name,
      s.student_code ?? s.exam_code ?? "",
      formatStudentDob(s),
      s.gender ?? "",
      s.category ?? "",
      s.centre ?? "",
      s.teacher ?? "",
    ];
    if (opts.withScores && opts.questionTypes && opts.scoresByStudent) {
      const scores = opts.scoresByStudent.get(s.id) ?? {};
      let total = 0;
      for (const qt of opts.questionTypes) {
        const correct = scores[qt.id] ?? 0;
        const pts = correct * qt.points_per_question;
        arr.push(pts);
        total += pts;
      }
      arr.push(total);
    }
    return arr;
  });

  autoTable(doc, {
    head: [head],
    body,
    startY: 140,
    margin: { left: 40, right: 40 },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 4,
      textColor: TEXT,
      lineColor: BORDER,
      lineWidth: 0.4,
    },
    headStyles: { fillColor: BG_ALT, textColor: MUTED, fontStyle: "bold", fontSize: 7.5 },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 22, halign: "center", fontStyle: "bold" } },
  });

  footer(doc);
  return doc.output("arraybuffer") as ArrayBuffer;
}
