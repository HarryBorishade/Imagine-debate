CREATE FUNCTION pg_temp.expect_denied(command text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
  RAISE EXCEPTION 'Expected insufficient_privilege for %', command;
END $$;
CREATE FUNCTION pg_temp.expect_check(command text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command; EXCEPTION WHEN check_violation THEN RETURN; END;
  RAISE EXCEPTION 'Expected check_violation for %', command;
END $$;
DO $$ BEGIN
 IF has_function_privilege('anon','public.cleanup_stale_debates()','EXECUTE')
 OR has_function_privilege('authenticated','public.cleanup_stale_debates()','EXECUTE')
 OR has_function_privilege('anon','public.delete_debates_older_than_30_days()','EXECUTE')
 OR has_function_privilege('authenticated','public.delete_debates_older_than_30_days()','EXECUTE')
 OR NOT has_function_privilege('postgres','public.cleanup_stale_debates()','EXECUTE')
 OR NOT has_function_privilege('postgres','public.delete_debates_older_than_30_days()','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cleanup_stale_debates()','EXECUTE')
 OR NOT has_table_privilege('service_role','public.debates','INSERT')
 THEN RAISE EXCEPTION 'Unexpected effective privileges'; END IF;
END $$;
SET ROLE anon;
SELECT pg_temp.expect_denied('SELECT public.cleanup_stale_debates()');
SELECT pg_temp.expect_denied('SELECT public.delete_debates_older_than_30_days()');
SELECT pg_temp.expect_denied($sql$INSERT INTO public.debates(id,topic,created_by) VALUES ('5000','test','00000000-0000-0000-0000-000000000001')$sql$);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT pg_temp.expect_denied('SELECT public.cleanup_stale_debates()');
SELECT pg_temp.expect_denied('SELECT public.delete_debates_older_than_30_days()');
INSERT INTO public.debates(id,topic,description,time_per_turn,created_by,status,ranked)
VALUES ('1000','Test topic','Test description',120,'00000000-0000-0000-0000-000000000001','waiting',true);
SELECT pg_temp.expect_denied($sql$INSERT INTO public.debates(id,topic,created_by) VALUES ('1001','test','00000000-0000-0000-0000-000000000002')$sql$);
SELECT pg_temp.expect_denied($sql$INSERT INTO public.debates(id,topic,created_by,status) VALUES ('1001','test','00000000-0000-0000-0000-000000000001','completed')$sql$);
DO $$
DECLARE column_name text;
BEGIN
 FOREACH column_name IN ARRAY ARRAY['appraisal_status','appraisal_result','appraisal_error','rating_applied','started_at','for_player_id','against_player_id','winning_side','ended_reason'] LOOP
  PERFORM pg_temp.expect_denied(format('INSERT INTO public.debates(id,topic,created_by,%I) VALUES (%L,%L,%L,NULL)',column_name,'1001','test','00000000-0000-0000-0000-000000000001'));
 END LOOP;
END $$;
RESET ROLE;
SELECT 'PASS: browser roles, ownership, protected fields, server and scheduler privileges' AS result;
