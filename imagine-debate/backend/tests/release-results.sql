-- Exercise the actual recorded result and profile-permission migrations.
CREATE FUNCTION pg_temp.expect_invalid(command text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN raise_exception THEN RETURN; END;
 RAISE EXCEPTION 'Expected result validation to reject the command';
END $$;
CREATE FUNCTION pg_temp.expect_denied(command text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'Expected permission denied';
END $$;
DO $$ BEGIN
 IF has_function_privilege('anon','public.apply_debate_result(text,uuid,uuid,text,text,boolean)','EXECUTE')
 OR has_function_privilege('authenticated','public.apply_debate_result(text,uuid,uuid,text,text,boolean)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.apply_debate_result(text,uuid,uuid,text,text,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Result RPC grants are unsafe';
 END IF;
END $$;
SET ROLE anon;
SELECT pg_temp.expect_denied('SELECT * FROM public.profiles');
SELECT pg_temp.expect_denied($q$SELECT public.apply_debate_result('6000',NULL,NULL,'draw','ai_judged',true)$q$);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.profiles) <> 1 OR EXISTS(SELECT 1 FROM public.profiles WHERE private_note='private-two') THEN
  RAISE EXCEPTION 'Profile owner-only reads failed';
 END IF;
END $$;
SELECT pg_temp.expect_denied($q$UPDATE public.profiles SET rating=9999$q$);
SELECT pg_temp.expect_denied($q$SELECT public.apply_debate_result('6000',NULL,NULL,'draw','ai_judged',true)$q$);
RESET ROLE;
INSERT INTO public.debates(id,topic,status,for_player_id,against_player_id,ranked,format_version) VALUES
 ('6000','Ranked result','active','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',true,'classic_v1'),
 ('6001','Open result','active','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',false,'open_exchange_v1'),
 ('6002','Legacy forfeit','waiting',NULL,NULL,true,'classic_v1'),
 ('6003','Legacy judged disallowed','waiting',NULL,NULL,true,'classic_v1'),
 ('6004','Immediate forfeit','active','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',true,'classic_v1');
SET ROLE service_role;
SELECT pg_temp.expect_invalid($q$SELECT public.apply_debate_result('6000','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','for','ai_judged',true)$q$);
SELECT pg_temp.expect_invalid($q$SELECT public.apply_debate_result('6000','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','for','ai_judged',false)$q$);
SELECT pg_temp.expect_invalid($q$SELECT public.apply_debate_result('6000','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',NULL,'ai_judged',true)$q$);
SELECT pg_temp.expect_invalid($q$SELECT public.apply_debate_result('6000','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','for',NULL,true)$q$);
SELECT pg_temp.expect_invalid($q$SELECT public.apply_debate_result('6003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','for','ai_judged',true)$q$);
SELECT public.apply_debate_result('6000','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','for','ai_judged',true);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT (rating,wins,losses,draws) FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000001') IS DISTINCT FROM ROW(1016,1,0,0)
 OR (SELECT (rating,wins,losses,draws) FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000002') IS DISTINCT FROM ROW(984,0,1,0) THEN
  RAISE EXCEPTION 'Ranked result changed the wrong profile statistics';
 END IF;
END $$;
CREATE TEMP TABLE expected_profiles AS SELECT * FROM public.profiles;
SET ROLE service_role;
SELECT public.apply_debate_result('6000','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','for','ai_judged',true);
SELECT public.apply_debate_result('6001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','against','ai_judged',false);
RESET ROLE;
DO $$ BEGIN
 IF EXISTS((SELECT * FROM public.profiles EXCEPT SELECT * FROM expected_profiles) UNION ALL (SELECT * FROM expected_profiles EXCEPT SELECT * FROM public.profiles)) THEN
  RAISE EXCEPTION 'Repeated results or Open Exchange changed profile statistics';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.debates WHERE id='6001' AND rating_applied AND winning_side='against' AND status='completed') THEN
  RAISE EXCEPTION 'Open Exchange was not finalized';
 END IF;
END $$;
SET ROLE service_role;
SELECT public.apply_debate_result('6002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','draw','forfeit_disconnect',true);
SELECT public.apply_debate_result('6004','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','against','forfeit_left',true);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.debates WHERE id IN ('6000','6001','6002','6004') AND rating_applied AND status='completed') <> 4 THEN
  RAISE EXCEPTION 'A completion or forfeit was not finalized';
 END IF;
END $$;
SELECT 'PASS: result identity, NULL checks, ranked/unranked idempotency, both forfeits and profile privacy' AS result;
