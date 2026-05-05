-- TUSGU Scoring — Supabase schema
-- Run this once in the Supabase SQL Editor (Database → SQL Editor → New query).
-- Idempotent: safe to re-run; existing rows are kept.

-- =============================================================
-- Tables
-- =============================================================

create table if not exists public.categories (
  id          bigserial primary key,
  name        text unique not null,
  description text,
  display_order integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.question_types (
  id                       bigserial primary key,
  name                     text unique not null,
  points_per_question      integer not null default 1,
  max_questions            integer not null default 100,
  display_order            integer not null default 0,
  -- Per-category overrides keyed by the first letter of the category name.
  -- e.g. {"A": 200, "B": 200} → categories starting with A or B use 200 instead of max_questions.
  category_max_overrides   jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now()
);

create table if not exists public.students (
  id                  bigserial primary key,
  -- Core identity
  student_code        text,           -- e.g. "SL-NP-MN-54-S00020"
  exam_code           text,           -- e.g. "VA3-039" (used as the printed barcode)
  barcode             text,           -- separate explicit barcode column if present
  full_name           text not null,
  dob                 date,
  gender              text,
  -- Categories per competition. `category` is the Visual / score-based
  -- category. listening_category and flash_category power their own
  -- separate live competitions.
  flash_category      text,
  -- Live competitions used to store a numeric position; now we store a
  -- direct trophy assignment per competition (FK to trophy_types). The
  -- position columns are kept for backwards compat / sorting.
  listening_position  integer,
  flash_position      integer,
  listening_trophy_id bigint,           -- references trophy_types(id)
  flash_trophy_id     bigint,           -- references trophy_types(id)
  ci_category         text,             -- per teacher: e.g. "Mid Career"
  franchisee_category text,             -- per centre: e.g. "Emerging"
  -- Categorization
  category            text,           -- "A1", "B2", "Z3"… freeform; ranking groups by this
  level               text,           -- "Basic", "Elementary A", etc
  listening_category  text,           -- "Novice", "Competent"…
  listening_code      text,           -- "LN-183"
  -- Logistics
  centre              text,
  teacher             text,           -- CI Name
  ci_code             text,
  tshirt_size         text,
  email               text,
  phone               text,
  report_time         text,
  comp_time           text,
  -- Misc
  deduction           text,           -- "Yes" / blank
  notes               text,
  extra               jsonb not null default '{}'::jsonb, -- catch-all for unknown columns
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_students_full_name on public.students (lower(full_name));
create index if not exists idx_students_student_code on public.students (student_code);
create index if not exists idx_students_exam_code on public.students (exam_code);
create index if not exists idx_students_barcode on public.students (barcode);
create index if not exists idx_students_category on public.students (category);
create index if not exists idx_students_centre on public.students (centre);

create table if not exists public.scores (
  id               bigserial primary key,
  student_id       bigint not null references public.students(id) on delete cascade,
  question_type_id bigint not null references public.question_types(id) on delete cascade,
  value            integer not null default 0,
  recorded_at      timestamptz not null default now(),
  recorded_by      text,
  unique (student_id, question_type_id)
);
create index if not exists idx_scores_student on public.scores (student_id);

create table if not exists public.trophy_types (
  id            bigserial primary key,
  name          text unique not null,
  icon          text,
  description   text,
  display_order integer not null default 0,
  -- Points awarded for a CI/Centre summary leaderboard.
  -- Defaults: GC 75, Champion 50, 1st RU 40, 2nd RU 30, 3rd RU 25, 4th RU 20, 5th RU 10, Merit 5.
  points        integer not null default 0
);

create table if not exists public.trophy_allocations (
  id              bigserial primary key,
  trophy_type_id  bigint not null references public.trophy_types(id) on delete cascade,
  category        text not null,           -- matches students.category / listening_category / flash_category
  competition     text not null default 'visual',  -- 'visual' | 'listening' | 'flash'
  quantity        integer not null default 0,
  unique (trophy_type_id, category, competition)
);

-- =============================================================
-- Default seed (only inserted if tables are empty)
-- =============================================================

-- Two question types: Addition/Subtraction (150 default, 200 for A/B/C/U/V/Y/Z)
-- and Multiplication/Division (100 default).
insert into public.question_types (name, points_per_question, max_questions, display_order, category_max_overrides)
select * from (values
  ('Addition / Subtraction',    1, 150, 1, '{"A":200,"B":200,"C":200,"U":200,"V":200,"Y":200,"Z":200}'::jsonb),
  ('Multiplication / Division', 1, 100, 2, '{"A":0,"B":0,"C":0,"U":0,"V":0,"Y":0,"Z":0}'::jsonb)
) as v(name, ppq, mq, ord, overrides)
where not exists (select 1 from public.question_types);

-- Trophies: Grand Champion → Champion → 1st-5th Runner Up → Merit (no participation).
insert into public.trophy_types (name, icon, description, display_order, points)
select * from (values
  ('Grand Champion',  '🏆', 'Top of the entire competition', 1, 75),
  ('Champion',        '🥇', 'Category winner',               2, 50),
  ('1st Runner Up',   '🥈', 'Second place',                  3, 40),
  ('2nd Runner Up',   '🥉', 'Third place',                   4, 30),
  ('3rd Runner Up',   '🎖️', 'Fourth place',                  5, 25),
  ('4th Runner Up',   '🎖️', 'Fifth place',                   6, 20),
  ('5th Runner Up',   '🎖️', 'Sixth place',                   7, 10),
  ('Merit',           '⭐', 'Honourable mention',            8,  5)
) as v(name, icon, description, ord, points)
where not exists (select 1 from public.trophy_types);

-- =============================================================
-- Row Level Security
-- =============================================================
-- Anyone (anon role) can read everything (so general users can search students).
-- Anyone with the anon key can also write — the app gates writes behind a
-- password modal at the UI layer. For stronger guarantees, switch to Supabase
-- Auth and replace the policies below with `auth.role() = 'authenticated'`.

alter table public.categories          enable row level security;
alter table public.question_types      enable row level security;
alter table public.students            enable row level security;
alter table public.scores              enable row level security;
alter table public.trophy_types        enable row level security;
alter table public.trophy_allocations  enable row level security;

do $$ begin
  -- categories
  drop policy if exists "anon read categories"  on public.categories;
  drop policy if exists "anon write categories" on public.categories;
  create policy "anon read categories"  on public.categories  for select using (true);
  create policy "anon write categories" on public.categories  for all    using (true) with check (true);

  -- question_types
  drop policy if exists "anon read qtypes"  on public.question_types;
  drop policy if exists "anon write qtypes" on public.question_types;
  create policy "anon read qtypes"  on public.question_types  for select using (true);
  create policy "anon write qtypes" on public.question_types  for all    using (true) with check (true);

  -- students
  drop policy if exists "anon read students"  on public.students;
  drop policy if exists "anon write students" on public.students;
  create policy "anon read students"  on public.students  for select using (true);
  create policy "anon write students" on public.students  for all    using (true) with check (true);

  -- scores
  drop policy if exists "anon read scores"  on public.scores;
  drop policy if exists "anon write scores" on public.scores;
  create policy "anon read scores"  on public.scores  for select using (true);
  create policy "anon write scores" on public.scores  for all    using (true) with check (true);

  -- trophy_types
  drop policy if exists "anon read ttypes"  on public.trophy_types;
  drop policy if exists "anon write ttypes" on public.trophy_types;
  create policy "anon read ttypes"  on public.trophy_types  for select using (true);
  create policy "anon write ttypes" on public.trophy_types  for all    using (true) with check (true);

  -- trophy_allocations
  drop policy if exists "anon read tallocs"  on public.trophy_allocations;
  drop policy if exists "anon write tallocs" on public.trophy_allocations;
  create policy "anon read tallocs"  on public.trophy_allocations  for select using (true);
  create policy "anon write tallocs" on public.trophy_allocations  for all    using (true) with check (true);
end $$;

-- =============================================================
-- Realtime (so multiple users see each other's edits live)
-- =============================================================
alter publication supabase_realtime add table public.students;
alter publication supabase_realtime add table public.scores;
alter publication supabase_realtime add table public.trophy_allocations;
alter publication supabase_realtime add table public.question_types;
alter publication supabase_realtime add table public.trophy_types;
