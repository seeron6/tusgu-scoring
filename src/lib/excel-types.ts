// Allow either separate first/last OR a single full_name column
export const STUDENT_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "dob",
  "category",
  "centre",
  "teacher",
] as const;
export type StudentField = (typeof STUDENT_FIELDS)[number];

export type ImportMode = "skip" | "overwrite";

export const STUDENT_FIELD_LABELS: Record<StudentField, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  full_name: "Full Name (combined)",
  dob: "Date of Birth",
  category: "Category",
  centre: "Centre",
  teacher: "Teacher",
};
