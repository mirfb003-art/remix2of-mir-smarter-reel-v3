create table if not exists public.sheet_mode_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  rows_per_run integer not null default 1 check (rows_per_run between 1 and 500),
  schedule_label text,
  selection_rule text not null default 'first_ready' check (selection_rule in ('first_ready','random_ready','highest_priority','lowest_priority','newest_created','oldest_created','round_robin','weighted_random','ai_smart_score')),
  after_publish_mark_status boolean not null default true,
  after_publish_save_post_id boolean not null default true,
  after_publish_save_time boolean not null default true,
  after_publish_save_url boolean not null default true,
  retry_failed boolean not null default true,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sheet_mode_sheets to authenticated;
grant all on public.sheet_mode_sheets to service_role;

create index if not exists sheet_mode_sheets_user_idx
  on public.sheet_mode_sheets(user_id, created_at desc);

create table if not exists public.sheet_mode_channel_targets (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.sheet_mode_sheets(id) on delete cascade,
  buffer_connection_id uuid not null references public.buffer_credentials(id) on delete restrict,
  channel_id uuid not null references public.channels(id) on delete restrict,
  channel_label text not null,
  platform text not null,
  is_active boolean not null default true,
  backfill_applied boolean not null default false,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (sheet_id, buffer_connection_id, channel_id)
);
grant select, insert, update, delete on public.sheet_mode_channel_targets to authenticated;
grant all on public.sheet_mode_channel_targets to service_role;

create index if not exists sheet_mode_channel_targets_sheet_idx
  on public.sheet_mode_channel_targets(sheet_id, is_active, added_at);

create table if not exists public.sheet_mode_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.sheet_mode_sheets(id) on delete cascade,
  position integer not null,
  caption text not null default '',
  video_url text not null default '',
  priority integer,
  weight integer,
  status text not null default 'pending' check (status in ('pending','partial','complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sheet_id, position)
);
grant select, insert, update, delete on public.sheet_mode_rows to authenticated;
grant all on public.sheet_mode_rows to service_role;

create index if not exists sheet_mode_rows_sheet_position_idx
  on public.sheet_mode_rows(sheet_id, position);

create table if not exists public.sheet_mode_row_channel_status (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references public.sheet_mode_rows(id) on delete cascade,
  channel_target_id uuid not null references public.sheet_mode_channel_targets(id) on delete cascade,
  status text not null default 'F' check (status in ('F','T')),
  published_post_id text,
  published_url text,
  published_at timestamptz,
  last_error text,
  last_attempt_at timestamptz,
  unique (row_id, channel_target_id)
);
grant select, insert, update, delete on public.sheet_mode_row_channel_status to authenticated;
grant all on public.sheet_mode_row_channel_status to service_role;

create index if not exists sheet_mode_row_channel_status_row_idx
  on public.sheet_mode_row_channel_status(row_id, channel_target_id);

alter table public.sheet_mode_sheets enable row level security;
alter table public.sheet_mode_channel_targets enable row level security;
alter table public.sheet_mode_rows enable row level security;
alter table public.sheet_mode_row_channel_status enable row level security;

create policy "sheet mode sheets owner" on public.sheet_mode_sheets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "sheet mode channel targets owner" on public.sheet_mode_channel_targets
  for all using (
    exists (
      select 1 from public.sheet_mode_sheets s
      where s.id = sheet_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.sheet_mode_sheets s
      where s.id = sheet_id and s.user_id = auth.uid()
    )
  );

create policy "sheet mode rows owner" on public.sheet_mode_rows
  for all using (
    exists (
      select 1 from public.sheet_mode_sheets s
      where s.id = sheet_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.sheet_mode_sheets s
      where s.id = sheet_id and s.user_id = auth.uid()
    )
  );

create policy "sheet mode row channel status owner" on public.sheet_mode_row_channel_status
  for all using (
    exists (
      select 1
      from public.sheet_mode_rows r
      join public.sheet_mode_sheets s on s.id = r.sheet_id
      join public.sheet_mode_channel_targets t on t.id = channel_target_id and t.sheet_id = s.id
      where r.id = row_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.sheet_mode_rows r
      join public.sheet_mode_sheets s on s.id = r.sheet_id
      join public.sheet_mode_channel_targets t on t.id = channel_target_id and t.sheet_id = s.id
      where r.id = row_id and s.user_id = auth.uid()
    )
  );

create trigger trg_sheet_mode_sheets_updated before update on public.sheet_mode_sheets
  for each row execute function public.set_updated_at();
create trigger trg_sheet_mode_rows_updated before update on public.sheet_mode_rows
  for each row execute function public.set_updated_at();