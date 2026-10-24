-- Runtime ACL patch only. Execute as the auth schema owner or an authorized
-- grantor. A role with USAGE but no grant option may only warn and skip this.
-- Do not rerun the standalone migration or change ownership/role attributes.
grant usage on schema auth to customize_stops_rpc;
