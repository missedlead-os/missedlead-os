-- Unapplied: reuse request status; extend the existing visit status constraint.
alter table request_schedules drop constraint request_schedules_status_check;
alter table request_schedules add constraint request_schedules_status_check check(status in ('proposed','confirmed','cancelled'));

create function cancel_customer_request(p_request_id uuid,p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r service_requests; recipient uuid;
begin
  select * into r from service_requests where id=p_request_id for update;
  if r.id is null or r.customer_id<>auth.uid() or auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and role='customer') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if length(p_reason)>500 then raise exception 'reason_too_long'; end if;
  if r.workflow_status in ('completed','settled') or exists(select 1 from jobs where request_id=r.id and completed_at is not null) then raise exception 'completed_cannot_cancel'; end if;
  if r.workflow_status='cancelled' then return jsonb_build_object('requestId',r.id,'status','cancelled'); end if;
  update service_requests set workflow_status='cancelled',expanded_search=false where id=r.id;
  update request_schedules set status='cancelled',updated_at=clock_timestamp() where request_id=r.id and status in ('proposed','confirmed');
  for recipient in select provider_id from request_matches where request_id=r.id union select provider_id from jobs where request_id=r.id loop
    perform notify_user(recipient,r.id,'request_cancelled','Request cancelled','The customer cancelled this request and its visit.','request_cancelled:'||r.id||':'||recipient);
  end loop;
  perform append_audit('cancel_customer_request',r.id,'request',r.id::text,coalesce(p_reason,'customer cancellation'),gen_random_uuid()::text,'{}'::jsonb);
  return jsonb_build_object('requestId',r.id,'status','cancelled');
end $$;
revoke all on function cancel_customer_request(uuid,text) from public,anon;
grant execute on function cancel_customer_request(uuid,text) to authenticated;

-- Serialize schedule changes and matching with cancellation. Existing schedule
-- validation remains in upsert_request_schedule; direct cancelled writes stay private.
create function guard_cancelled_request() returns trigger language plpgsql security definer set search_path=public as $$
declare request_status text;
begin
  if tg_table_name='service_requests' then
    if old.workflow_status='cancelled' and new.workflow_status<>'cancelled' then raise exception 'request_cancelled'; end if;
  else
    select workflow_status into request_status from service_requests where id=new.request_id for update;
    if request_status='cancelled' and (tg_table_name='request_matches' or new.status<>'cancelled') then raise exception 'request_cancelled'; end if;
  end if;
  return new;
end $$;
revoke all on function guard_cancelled_request() from public,anon,authenticated;
create trigger cancelled_request_transition before update on service_requests for each row execute function guard_cancelled_request();
create trigger cancelled_request_schedule before insert or update on request_schedules for each row execute function guard_cancelled_request();
create trigger cancelled_request_match before insert or update on request_matches for each row execute function guard_cancelled_request();
