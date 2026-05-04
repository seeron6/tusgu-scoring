import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
 * Resolve max questions for a question type given a student's category.
 * Looks up the first letter of the category in `category_max_overrides`,
 * falling back to the question type's base max_questions.
 */
export function maxQuestionsFor(
  qt: { max_questions: number; category_max_overrides?: Record<string, number> | null },
  category: string | null | undefined
): number {
  if (!category) return qt.max_questions;
  const prefix = category.trim().charAt(0).toUpperCase();
  const overrides = qt.category_max_overrides ?? {};
  const v = overrides[prefix];
  return typeof v === "number" && v > 0 ? v : qt.max_questions;
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
