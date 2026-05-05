-- Migration for Listening + Flash competitions and franchisee categories.
-- Idempotent. Run once in the Supabase SQL Editor (or apply via the
-- Database UI's "Run SQL" — it's safe to re-run).

-- =============================================================
-- New student fields
-- =============================================================
alter table public.students add column if not exists flash_category       text;
alter table public.students add column if not exists listening_position   integer;
alter table public.students add column if not exists flash_position       integer;
alter table public.students add column if not exists franchisee_category  text;

-- Indexes for the live-entry search workflow
create index if not exists idx_students_listening_category on public.students (listening_category);
create index if not exists idx_students_flash_category     on public.students (flash_category);

-- =============================================================
-- Trophy allocations now scope to a competition.
-- 'visual' = the existing score-based competition (Add/Sub + Mult/Div).
-- 'listening' / 'flash' = position-based competitions entered live.
-- =============================================================
alter table public.trophy_allocations add column if not exists competition text not null default 'visual';

-- Replace the (trophy_type_id, category) unique key with one that includes
-- competition so the same trophy/category combo can exist independently
-- for each competition.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'trophy_allocations_trophy_type_id_category_key'
       or conname = 'trophy_allocations_trophy_type_id_category_competition_key'
  ) then
    -- Drop both possible names so re-runs stay idempotent.
    alter table public.trophy_allocations
      drop constraint if exists trophy_allocations_trophy_type_id_category_key;
    alter table public.trophy_allocations
      drop constraint if exists trophy_allocations_trophy_type_id_category_competition_key;
  end if;
end $$;

alter table public.trophy_allocations
  add constraint trophy_allocations_trophy_type_id_category_competition_key
    unique (trophy_type_id, category, competition);
