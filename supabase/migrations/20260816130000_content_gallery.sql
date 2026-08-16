create table if not exists public.content_gallery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  label text,
  media_type text not null check (media_type in ('image','video')),
  created_at timestamptz not null default now()
);

create index if not exists content_gallery_items_user_created_idx
  on public.content_gallery_items(user_id, created_at desc);

alter table public.content_gallery_items enable row level security;

drop policy if exists content_gallery_items_select_own on public.content_gallery_items;
create policy content_gallery_items_select_own on public.content_gallery_items
  for select to authenticated using (user_id = auth.uid());

drop policy if exists content_gallery_items_insert_own on public.content_gallery_items;
create policy content_gallery_items_insert_own on public.content_gallery_items
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists content_gallery_items_update_own on public.content_gallery_items;
create policy content_gallery_items_update_own on public.content_gallery_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists content_gallery_items_delete_own on public.content_gallery_items;
create policy content_gallery_items_delete_own on public.content_gallery_items
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on table public.content_gallery_items to authenticated;
grant all on table public.content_gallery_items to service_role;
