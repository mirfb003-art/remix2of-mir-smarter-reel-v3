alter table public.campaigns add column if not exists channel_mode text not null default 'single' check (channel_mode in ('single', 'multi'));

create table if not exists public.campaign_channel_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  analysis_scope public.analysis_scope not null default 'last_n',
  analysis_n_value integer not null default 5 check (analysis_n_value between 1 and 500),
  analysis_custom_query text,
  is_active boolean not null default true,
  last_analysis_at timestamptz,
  last_refreshed_at timestamptz,
  last_published_at timestamptz,
  last_post_id uuid references public.published_posts(id) on delete set null,
  last_error text,
  learning_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, channel_id)
);

create index if not exists campaign_channel_targets_user_campaign_idx
  on public.campaign_channel_targets(user_id, campaign_id, is_active);

create table if not exists public.multi_channel_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  interval_hours integer not null check (interval_hours between 1 and 720),
  is_active boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id)
);

create index if not exists multi_channel_schedules_due_idx
  on public.multi_channel_schedules(is_active, next_run_at);

create table if not exists public.multi_channel_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  queue_item_id uuid not null references public.video_queue(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'processing' check (status in ('processing','complete','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  channel_count integer not null default 0,
  completed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists multi_channel_rounds_campaign_idx
  on public.multi_channel_rounds(campaign_id, started_at desc);

alter table public.campaign_channel_targets enable row level security;
alter table public.multi_channel_schedules enable row level security;
alter table public.multi_channel_rounds enable row level security;

create policy "campaign channel targets owner" on public.campaign_channel_targets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "multi channel schedules owner" on public.multi_channel_schedules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "multi channel rounds owner" on public.multi_channel_rounds
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.claim_multi_channel_schedule(_schedule_id uuid, _now timestamptz, _next_run_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed boolean;
begin
  update public.multi_channel_schedules
     set next_run_at = _next_run_at, last_run_at = _now, updated_at = now()
   where id = _schedule_id and is_active = true and next_run_at <= _now
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_multi_channel_schedule(uuid, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.claim_multi_channel_schedule(uuid, timestamptz, timestamptz) to service_role;

create or replace function public.claim_multi_channel_queue_item(_queue_item_id uuid, _campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed boolean;
begin
  update public.video_queue
     set status = 'processing', attempts = attempts + 1, error = null
   where id = _queue_item_id and campaign_id = _campaign_id and status = 'pending'
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_multi_channel_queue_item(uuid, uuid) from public, authenticated;
grant execute on function public.claim_multi_channel_queue_item(uuid, uuid) to service_role;
