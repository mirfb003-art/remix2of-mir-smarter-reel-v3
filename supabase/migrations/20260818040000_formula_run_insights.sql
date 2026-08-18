-- Part FF: per-run Buffer post insights for 1 Reel Formula only.
create table if not exists public.formula_run_insights (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs(id) on delete cascade,
  recurring_schedule_id uuid not null references public.recurring_schedules(id) on delete cascade,
  buffer_post_id text not null,
  post_type text not null,
  metrics jsonb not null default '[]'::jsonb,
  metrics_updated_at timestamptz,
  last_synced_at timestamptz,
  sync_status text not null default 'pending',
  sync_attempts integer not null default 0,
  next_sync_due_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint formula_run_insights_post_type_check check (char_length(btrim(post_type)) between 1 and 64),
  constraint formula_run_insights_status_check check (sync_status in ('pending', 'synced', 'failed')),
  constraint formula_run_insights_attempts_check check (sync_attempts >= 0)
);

create index if not exists formula_run_insights_schedule_idx
  on public.formula_run_insights (recurring_schedule_id, created_at desc);
create index if not exists formula_run_insights_story_due_idx
  on public.formula_run_insights (next_sync_due_at)
  where post_type = 'story' and sync_status <> 'synced' and next_sync_due_at is not null;

alter table public.formula_run_insights enable row level security;

drop policy if exists "formula insights are readable by schedule owner" on public.formula_run_insights;
create policy "formula insights are readable by schedule owner"
  on public.formula_run_insights for select
  using (exists (
    select 1 from public.recurring_schedules s
    where s.id = recurring_schedule_id and s.user_id = auth.uid()
  ));

drop policy if exists "formula insights are updateable by schedule owner" on public.formula_run_insights;
create policy "formula insights are updateable by schedule owner"
  on public.formula_run_insights for update
  using (exists (
    select 1 from public.recurring_schedules s
    where s.id = recurring_schedule_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recurring_schedules s
    where s.id = recurring_schedule_id and s.user_id = auth.uid()
  ));

-- Atomically lease one due Story insight. The cron worker runs with service_role.
create or replace function public.claim_formula_run_insight(
  _insight_id uuid,
  _now timestamptz,
  _lease_until timestamptz
) returns boolean
language sql
security definer
set search_path = public
as $$
  update public.formula_run_insights
     set sync_attempts = sync_attempts + 1,
         next_sync_due_at = _lease_until
   where id = _insight_id
     and post_type = 'story'
     and sync_status <> 'synced'
     and next_sync_due_at is not null
     and next_sync_due_at <= _now
  returning true;
$$;

revoke all on function public.claim_formula_run_insight(uuid, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.claim_formula_run_insight(uuid, timestamptz, timestamptz) to service_role;
