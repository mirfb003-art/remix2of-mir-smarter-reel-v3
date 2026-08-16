-- Replace the position-number rotation cursor with the identity of the last
-- successfully published item. This keeps reordering independent from cursor state.
alter table public.recurring_schedules
  add column if not exists last_published_item_id uuid;

-- Preserve the current rotation point for existing Multiple schedules where
-- there is evidence that at least one run has completed. A schedule whose
-- current position is 1 after a completed run points back to the last item.
update public.recurring_schedules s
set last_published_item_id = (
  select i.id
  from public.recurring_schedule_items i
  where i.schedule_id = s.id
    and i.position = case
      when s.current_item_position > 1 then s.current_item_position - 1
      else (select max(i2.position) from public.recurring_schedule_items i2 where i2.schedule_id = s.id)
    end
  limit 1
)
where s.mode = 'multiple'
  and s.last_run_at is not null
  and s.current_item_position is not null
  and s.last_published_item_id is null;

alter table public.recurring_schedules
  drop constraint if exists recurring_schedules_last_published_item_fk;
alter table public.recurring_schedules
  add constraint recurring_schedules_last_published_item_fk
  foreign key (last_published_item_id)
  references public.recurring_schedule_items(id)
  on delete set null;

alter table public.recurring_schedules
  drop column if exists current_item_position;
