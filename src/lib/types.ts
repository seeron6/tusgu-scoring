export type Category = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
};

export type QuestionType = {
  id: number;
  name: string;
  points_per_question: number;
  max_questions: number;
  display_order: number;
  created_at: string;
};

export type Student = {
  id: number;
  first_name: string;
  last_name: string;
  dob: string;
  category_id: number;
  centre: string;
  teacher: string;
  created_at: string;
};

export type StudentWithCategory = Student & { category_name: string };

export type Score = {
  id: number;
  student_id: number;
  question_type_id: number;
  value: number;
  recorded_at: string;
};

export type TrophyType = {
  id: number;
  name: string;
  icon: string | null;
  description: string | null;
  display_order: number;
};

export type TrophyAllocation = {
  id: number;
  trophy_type_id: number;
  category_id: number;
  quantity: number;
};

export type LeaderboardRow = {
  rank: number;
  student: StudentWithCategory;
  age: number;
  scoresByType: Record<number, number>;
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  trophy: TrophyType | null;
};
