-- Atomic position swap for authenticated schedule owners.
create or replace function public.move_recurring_schedule_item(_item_id uuid, _direction text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item_schedule uuid;
  item_position integer;
  neighbor_id uuid;
  neighbor_position integer;
begin
  if _direction not in ('up', 'down') then
    raise exception 'Invalid move direction';
  end if;

  select i.schedule_id, i.position
    into item_schedule, item_position
    from public.recurring_schedule_items i
    join public.recurring_schedules s on s.id = i.schedule_id
   where i.id = _item_id and s.user_id = auth.uid();

  if item_schedule is null then
    return false;
  end if;

  select i.id, i.position
    into neighbor_id, neighbor_position
    from public.recurring_schedule_items i
   where i.schedule_id = item_schedule
     and i.position = item_position + case when _direction = 'up' then -1 else 1 end;

  if neighbor_id is null then
    return true;
  end if;

  update public.recurring_schedule_items set position = -item_position where id = _item_id;
  update public.recurring_schedule_items set position = item_position where id = neighbor_id;
  update public.recurring_schedule_items set position = neighbor_position where id = _item_id;
  return true;
end;
$$;

revoke all on function public.move_recurring_schedule_item(uuid, text) from public;
grant execute on function public.move_recurring_schedule_item(uuid, text) to authenticated;
