// Canonical student fields the importer maps onto. Anything not in this list
// is preserved on the student record as `extra[<original column>]`.
export const STUDENT_FIELDS = [
  "student_code",
  "exam_code",
  "barcode",
  "full_name",
  "first_name",
  "last_name",
  "dob",
  "category",
  "level",
  "listening_category",
  "listening_code",
  "centre",
  "teacher",
  "ci_code",
  "tshirt_size",
  "email",
  "phone",
  "report_time",
  "comp_time",
  "deduction",
] as const;

export type StudentField = (typeof STUDENT_FIELDS)[number];

export type ImportMode = "skip" | "overwrite";

export const STUDENT_FIELD_LABELS: Record<StudentField, string> = {
  student_code: "Student Code",
  exam_code: "Exam Code (barcode)",
  barcode: "Barcode (alternate)",
  full_name: "Full Name",
  first_name: "First Name",
  last_name: "Last Name",
  dob: "Date of Birth",
  category: "Category",
  level: "Level",
  listening_category: "Listening Category",
  listening_code: "Listening Code",
  centre: "Centre",
  teacher: "Teacher (CI Name)",
  ci_code: "CI Code",
  tshirt_size: "T-Shirt Size",
  email: "Email",
  phone: "Phone",
  report_time: "Report Time",
  comp_time: "Comp Time",
  deduction: "Deduction",
};
