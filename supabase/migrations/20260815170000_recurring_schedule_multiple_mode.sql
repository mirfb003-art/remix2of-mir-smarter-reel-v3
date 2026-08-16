-- Parts K/L: shared upload URLs are plain media URLs; recurring schedules gain optional rotation mode.
alter table public.recurring_schedules
  add column if not exists mode text not null default 'single',
  add column if not exists current_item_position integer not null default 1;

alter table public.recurring_schedules
  drop constraint if exists recurring_schedules_mode_check;
alter table public.recurring_schedules
  add constraint recurring_schedules_mode_check check (mode in ('single', 'multiple'));

create table if not exists public.recurring_schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.recurring_schedules(id) on delete cascade,
  position integer not null check (position >= 1),
  media_url text not null check (char_length(media_url) between 1 and 2000),
  caption text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, position)
);

create index if not exists recurring_schedule_items_schedule_idx
  on public.recurring_schedule_items(schedule_id, position);

alter table public.recurring_schedule_items enable row level security;
drop policy if exists "recurring schedule items are readable by owner" on public.recurring_schedule_items;
create policy "recurring schedule items are readable by owner" on public.recurring_schedule_items for select using (
  exists (select 1 from public.recurring_schedules s where s.id = schedule_id and s.user_id = auth.uid())
);
drop policy if exists "recurring schedule items are insertable by owner" on public.recurring_schedule_items;
create policy "recurring schedule items are insertable by owner" on public.recurring_schedule_items for insert with check (
  exists (select 1 from public.recurring_schedules s where s.id = schedule_id and s.user_id = auth.uid())
);
drop policy if exists "recurring schedule items are updateable by owner" on public.recurring_schedule_items;
create policy "recurring schedule items are updateable by owner" on public.recurring_schedule_items for update using (
  exists (select 1 from public.recurring_schedules s where s.id = schedule_id and s.user_id = auth.uid())
) with check (
  exists (select 1 from public.recurring_schedules s where s.id = schedule_id and s.user_id = auth.uid())
);
drop policy if exists "recurring schedule items are deletable by owner" on public.recurring_schedule_items;
create policy "recurring schedule items are deletable by owner" on public.recurring_schedule_items for delete using (
  exists (select 1 from public.recurring_schedules s where s.id = schedule_id and s.user_id = auth.uid())
);

create or replace function public.set_recurring_schedule_items_updated_at()
returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists recurring_schedule_items_updated_at on public.recurring_schedule_items;
create trigger recurring_schedule_items_updated_at before update on public.recurring_schedule_items for each row execute function public.set_recurring_schedule_items_updated_at();
