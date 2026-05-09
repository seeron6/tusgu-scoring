import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Student } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns true if the given input string is a 4-digit year (e.g. "2015").
 * Used by the importer to flag students whose source data only had a year.
 */
export function isYearOnlyDobInput(input: unknown): boolean {
  if (input == null) return false;
  const s = String(input).trim();
  return /^(19|20)\d{2}$/.test(s);
}

/**
 * The DB column is `date`, so year-only DOBs are still stored as YYYY-01-01.
 * The "this was originally year-only" hint lives on the student's `extra`
 * JSONB column under `dob_year_only`, set by the importer / edit modal.
 */
export function isStudentDobYearOnly(student: Pick<Student, "extra"> | null | undefined): boolean {
  if (!student) return false;
  const extra = student.extra as Record<string, unknown> | undefined;
  return extra?.dob_year_only === true;
}

/**
 * Calculate age from an ISO date string (YYYY-MM-DD).
 * Parses the components manually so we don't get bitten by JS treating
 * "YYYY-MM-DD" as UTC-midnight and shifting the date by one in local time.
 */
export function calculateAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!m) {
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    return calculateAgeFromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return calculateAgeFromYMD(Number(m[1]), Number(m[2]), Number(m[3]));
}

function calculateAgeFromYMD(y: number, mo: number, d: number): number | null {
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const monthDiff = now.getMonth() + 1 - mo;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age--;
  return age;
}

export function formatDate(dob: string | null | undefined): string {
  if (!dob) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (m) {
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const mo = parseInt(m[2], 10);
    return `${parseInt(m[3], 10)} ${monthNames[mo - 1] ?? m[2]} ${m[1]}`;
  }
  const d = new Date(dob);
  if (isNaN(d.getTime())) return dob;
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Format a student's DOB for display. Year-only entries (flagged via
 * `extra.dob_year_only`) render as "YOB 2015" so we don't pretend to know
 * the actual day. Everyone else renders as a normal full date.
 */
export function formatStudentDob(
  student: Pick<Student, "dob" | "extra"> | null | undefined
): string {
  if (!student?.dob) return "";
  if (isStudentDobYearOnly(student)) {
    const m = /^(\d{4})/.exec(student.dob);
    return m ? `YOB ${m[1]}` : `YOB ${student.dob}`;
  }
  return formatDate(student.dob);
}

/**
 * Resolve max questions for a question type given a student's category.
 *
 * Looks up the first letter of the category in `category_max_overrides`:
 *   - undefined / no entry → fall back to the question type's base max_questions
 *   - a positive number → use that override
 *   - 0 → this question type does NOT apply to this category (e.g.
 *     Multiplication / Division is skipped for A/B/C/U/V/Y/Z)
 */
export function maxQuestionsFor(
  qt: { max_questions: number; category_max_overrides?: Record<string, number> | null },
  category: string | null | undefined
): number {
  if (!category) return qt.max_questions;
  const prefix = category.trim().charAt(0).toUpperCase();
  const overrides = qt.category_max_overrides ?? {};
  const v = overrides[prefix];
  if (typeof v === "number") return Math.max(0, v); // 0 = "not applicable"
  return qt.max_questions;
}

export function isQuestionTypeApplicable(
  qt: { max_questions: number; category_max_overrides?: Record<string, number> | null },
  category: string | null | undefined
): boolean {
  return maxQuestionsFor(qt, category) > 0;
}

/** Like a useEffect but stable across re-renders for fetching once. */
export function once<T>(fn: () => T): () => T {
  let v: T | undefined;
  let done = false;
  return () => {
    if (!done) {
      v = fn();
      done = true;
    }
    return v as T;
  };
}
