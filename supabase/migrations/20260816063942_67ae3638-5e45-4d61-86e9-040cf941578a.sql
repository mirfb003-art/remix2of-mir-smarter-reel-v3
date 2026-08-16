REVOKE ALL ON FUNCTION public.move_recurring_schedule_item(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_recurring_schedule_item(uuid, text) TO authenticated, service_role;
ALTER FUNCTION public.move_recurring_schedule_item(uuid, text) OWNER TO postgres;