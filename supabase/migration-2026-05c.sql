-- May 2026c migration:
--   1. Split CI Category (per teacher) from Franchisee Category (per centre).
--   2. Replace numeric Listening / Flash positions with direct trophy
--      assignments (listening_trophy_id, flash_trophy_id).
--
-- Idempotent. Safe to re-run.

-- =============================================================
-- 1. ci_category
-- =============================================================
alter table public.students add column if not exists ci_category text;

-- Earlier import code stored "CI Category" sheet headers into
-- students.franchisee_category. Move that data into ci_category and clear
-- the source so re-imports with the new mapping don't blend the two.
update public.students
set ci_category = franchisee_category
where ci_category is null
  and franchisee_category is not null;

update public.students
set franchisee_category = null
where ci_category is not null
  and franchisee_category = ci_category;

-- =============================================================
-- 2. Direct trophy assignment for live competitions
-- =============================================================
alter table public.students
  add column if not exists listening_trophy_id bigint references public.trophy_types(id) on delete set null;

alter table public.students
  add column if not exists flash_trophy_id bigint references public.trophy_types(id) on delete set null;
