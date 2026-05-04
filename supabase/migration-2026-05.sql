-- Migration for the May 2026 batch of changes.
-- Idempotent: safe to re-run. Run once in the Supabase SQL Editor.

-- =============================================================
-- New columns
-- =============================================================
alter table public.students         add column if not exists gender text;
alter table public.question_types   add column if not exists category_max_overrides jsonb not null default '{}'::jsonb;
alter table public.trophy_types     add column if not exists points integer not null default 0;

-- =============================================================
-- Defaults for the per-category max_questions overrides.
-- Categories starting with A, B, C, U, V, Y, Z get 200 Add/Sub questions;
-- everything else gets the base 150.
-- =============================================================
update public.question_types
set max_questions = 150,
    category_max_overrides = '{"A":200,"B":200,"C":200,"U":200,"V":200,"Y":200,"Z":200}'::jsonb
where name = 'Addition / Subtraction'
  and category_max_overrides::text in ('{}', 'null');

-- =============================================================
-- Trophy point values per the new system.
-- Only writes if the row's points are still 0 (so manual edits stick).
-- =============================================================
update public.trophy_types set points = 75 where name = 'Grand Champion'  and points = 0;
update public.trophy_types set points = 50 where name = 'Champion'        and points = 0;
update public.trophy_types set points = 40 where name = '1st Runner Up'   and points = 0;
update public.trophy_types set points = 30 where name = '2nd Runner Up'   and points = 0;
update public.trophy_types set points = 25 where name = '3rd Runner Up'   and points = 0;
update public.trophy_types set points = 20 where name = '4th Runner Up'   and points = 0;
update public.trophy_types set points = 10 where name = '5th Runner Up'   and points = 0;
update public.trophy_types set points =  5 where name = 'Merit'           and points = 0;
