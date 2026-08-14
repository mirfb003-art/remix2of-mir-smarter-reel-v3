-- Part 1: per-campaign sample captions library
alter table public.campaigns
  add column if not exists use_sample_captions boolean not null default false,
  add column if not exists sample_caption_mode text not null default 'style_reference';

alter table public.campaigns
  drop constraint if exists campaigns_sample_caption_mode_check;

alter table public.campaigns
  add constraint campaigns_sample_caption_mode_check
  check (sample_caption_mode in ('style_reference', 'learning_seed'));

create table if not exists public.sample_captions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 4000),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.sample_captions to authenticated;
grant all on public.sample_captions to service_role;

create index if not exists sample_captions_campaign_active_created_idx
  on public.sample_captions (campaign_id, is_active, created_at desc);

alter table public.sample_captions enable row level security;

drop policy if exists "sample captions are readable by owner" on public.sample_captions;
create policy "sample captions are readable by owner"
  on public.sample_captions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "sample captions are insertable by owner" on public.sample_captions;
create policy "sample captions are insertable by owner"
  on public.sample_captions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "sample captions are updateable by owner" on public.sample_captions;
create policy "sample captions are updateable by owner"
  on public.sample_captions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "sample captions are deletable by owner" on public.sample_captions;
create policy "sample captions are deletable by owner"
  on public.sample_captions for delete to authenticated
  using (user_id = auth.uid());

-- Part 2: isolated 1 Reel Formula schedules
create table if not exists public.recurring_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  channel_id uuid not null references public.channels(id) on delete cascade,
  platform text not null check (lower(platform) in ('instagram', 'tiktok')),
  post_type text not null,
  media_url text not null check (char_length(media_url) between 1 and 2000),
  caption text not null default '',
  share_to_feed boolean not null default true,
  thumbnail_timestamp numeric(12,3) not null default 0 check (thumbnail_timestamp >= 0),
  privacy_level text,
  allow_comments boolean not null default true,
  allow_duet boolean not null default false,
  allow_stitch boolean not null default false,
  interval_hours integer not null check (interval_hours between 1 and 8760),
  start_at timestamptz,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_run_id uuid references public.runs(id) on delete set null,
  is_active boolean not null default true,
  last_error text,
  last_claimed_slot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_schedules_post_type_check check (
    (lower(platform) = 'instagram' and post_type in ('reel', 'story')) or
    (lower(platform) = 'tiktok' and post_type in ('video', 'story'))
  ),
  constraint recurring_schedules_privacy_check check (
    lower(platform) <> 'tiktok' or privacy_level in ('PUBLIC', 'MUTUAL_FOLLOWS', 'SELF_ONLY')
  )
);

grant select, insert, update, delete on public.recurring_schedules to authenticated;
grant all on public.recurring_schedules to service_role;

create index if not exists recurring_schedules_due_idx
  on public.recurring_schedules (is_active, next_run_at);
create index if not exists recurring_schedules_user_idx
  on public.recurring_schedules (user_id, created_at desc);
create unique index if not exists runs_formula_idempotency_idx
  on public.runs (user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.recurring_schedules enable row level security;

drop policy if exists "recurring schedules are readable by owner" on public.recurring_schedules;
create policy "recurring schedules are readable by owner"
  on public.recurring_schedules for select to authenticated using (user_id = auth.uid());
drop policy if exists "recurring schedules are insertable by owner" on public.recurring_schedules;
create policy "recurring schedules are insertable by owner"
  on public.recurring_schedules for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "recurring schedules are updateable by owner" on public.recurring_schedules;
create policy "recurring schedules are updateable by owner"
  on public.recurring_schedules for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "recurring schedules are deletable by owner" on public.recurring_schedules;
create policy "recurring schedules are deletable by owner"
  on public.recurring_schedules for delete to authenticated using (user_id = auth.uid());

create or replace function public.claim_recurring_schedule_slot(
  _schedule_id uuid,
  _slot_key text,
  _run_id uuid,
  _now timestamptz default now()
) returns boolean
language sql
security definer
set search_path = public
as $$
  update public.recurring_schedules
     set last_claimed_slot = _slot_key, last_run_id = _run_id, updated_at = _now
   where id = _schedule_id
     and is_active = true
     and (last_claimed_slot is distinct from _slot_key or last_run_id = _run_id)
  returning true;
$$;

revoke all on function public.claim_recurring_schedule_slot(uuid, text, uuid, timestamptz) from public;
grant execute on function public.claim_recurring_schedule_slot(uuid, text, uuid, timestamptz) to service_role;