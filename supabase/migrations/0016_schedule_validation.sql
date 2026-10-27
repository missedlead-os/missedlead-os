-- Visit schedule validation (defense in depth; the API validates first).
-- Rejects past or far-future start times and unknown time zones, and keeps customers from
-- self-confirming a visit: only the matched provider or an operator may set status 'confirmed'.
-- Replaces upsert_request_schedule from 0001_mvp.sql; the signature, grants and audit triggers are unchanged.
create or replace function upsert_request_schedule(p_request_id uuid,p_starts_at timestamptz,p_time_zone text,p_status text) returns request_schedules language plpgsql security definer set search_path=public as $schedule$
declare v request_schedules;
begin
  if not can_access_request(p_request_id) or p_status not in('proposed','confirmed') then raise exception 'schedule forbidden'; end if;
  if p_time_zone is null or length(p_time_zone)>64 or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then raise exception 'schedule_time_zone_invalid'; end if;
  if p_starts_at is null or p_starts_at<=clock_timestamp() then raise exception 'schedule_in_past'; end if;
  if p_starts_at>clock_timestamp()+interval '365 days' then raise exception 'schedule_too_far'; end if;
  if p_status='confirmed' and not is_operator() and exists(select 1 from service_requests r where r.id=p_request_id and r.customer_id=auth.uid()) then
    raise exception 'schedule_confirmation_forbidden' using errcode='42501';
  end if;
  insert into request_schedules(request_id,starts_at,time_zone,status) values(p_request_id,p_starts_at,p_time_zone,p_status)
  on conflict(request_id) do update set starts_at=excluded.starts_at,time_zone=excluded.time_zone,status=excluded.status,updated_at=clock_timestamp()
  returning * into v;
  return v;
end;
$schedule$;
