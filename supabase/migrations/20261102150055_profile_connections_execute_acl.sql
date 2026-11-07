-- REVIEWED CORRECTION PROPOSAL ONLY. Requires separate live approval for named project.
-- Original migration/source is immutable. No function bodies, data or schema change.
begin;
-- Reacquire only temporary function-owner capabilities; no schema CREATE is needed.
grant connection_rpc to current_user with inherit true, set true;
revoke all on function private.connection_mutate(uuid,text,uuid,integer,boolean,uuid[]) from public,anon,authenticated;
grant execute on function private.connection_mutate(uuid,text,uuid,integer,boolean,uuid[]) to authenticated;
revoke connection_rpc from current_user;
commit;
