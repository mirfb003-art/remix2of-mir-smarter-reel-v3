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

create index if not exists sample_captions_campaign_active_created_idx
  on public.sample_captions (campaign_id, is_active, created_at desc);

alter table public.sample_captions enable row level security;

drop policy if exists "sample captions are readable by owner" on public.sample_captions;
create policy "sample captions are readable by owner"
  on public.sample_captions for select
  using (user_id = auth.uid());

drop policy if exists "sample captions are insertable by owner" on public.sample_captions;
create policy "sample captions are insertable by owner"
  on public.sample_captions for insert
  with check (user_id = auth.uid());

drop policy if exists "sample captions are updateable by owner" on public.sample_captions;
create policy "sample captions are updateable by owner"
  on public.sample_captions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "sample captions are deletable by owner" on public.sample_captions;
create policy "sample captions are deletable by owner"
  on public.sample_captions for delete
  using (user_id = auth.uid());
