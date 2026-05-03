export const STUDENT_FIELDS = ["first_name", "last_name", "dob", "category", "centre", "teacher"] as const;
export type StudentField = (typeof STUDENT_FIELDS)[number];

export type ImportMode = "skip" | "overwrite";
