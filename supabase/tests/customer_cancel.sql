-- Review/run only in a disposable database after 0017. Not applied by this task.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(8);
insert into profiles(id,role,display_name) values
 ('1c000000-0000-0000-0000-000000000001','customer','Cancel owner'),
 ('1c000000-0000-0000-0000-000000000002','customer','Other customer');
insert into service_requests(id,customer_id,description,service_address,workflow_status,safety_status) values
 ('1c000000-0000-0000-0000-000000000003','1c000000-0000-0000-0000-000000000001','Sink leak','Charlotte','matched','cleared'),
 ('1c000000-0000-0000-0000-000000000004','1c000000-0000-0000-0000-000000000001','Completed repair','Charlotte','completed','cleared');
insert into request_schedules(request_id,starts_at,time_zone,status) values('1c000000-0000-0000-0000-000000000003',now()+interval '2 days','America/New_York','confirmed');
set local role authenticated;
select set_config('request.jwt.claim.sub','1c000000-0000-0000-0000-000000000002',true);
select throws_ok($$select cancel_customer_request('1c000000-0000-0000-0000-000000000003')$$,'42501','forbidden','non-owner rejected');
select set_config('request.jwt.claim.sub','1c000000-0000-0000-0000-000000000001',true);
select is(cancel_customer_request('1c000000-0000-0000-0000-000000000003','Filed by mistake')->>'status','cancelled','owner cancels');
select is(cancel_customer_request('1c000000-0000-0000-0000-000000000003')->>'status','cancelled','repeat is idempotent');
select is((select workflow_status from service_requests where id='1c000000-0000-0000-0000-000000000003'),'cancelled','dashboard request cancelled');
select is((select status from request_schedules where request_id='1c000000-0000-0000-0000-000000000003'),'cancelled','visit cancelled');
select throws_ok($$select cancel_customer_request('1c000000-0000-0000-0000-000000000004')$$,'P0001','completed_cannot_cancel','completed rejected');
reset role;
select throws_ok($$update request_schedules set status='proposed' where request_id='1c000000-0000-0000-0000-000000000003'$$,'P0001','request_cancelled','reschedule rejected');
select throws_ok($$update service_requests set workflow_status='matched' where id='1c000000-0000-0000-0000-000000000003'$$,'P0001','request_cancelled','rematch rejected');
select * from finish();
rollback;
