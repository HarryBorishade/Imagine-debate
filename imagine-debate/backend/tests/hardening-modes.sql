SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
INSERT INTO public.debates(id,topic,description,ranked,format_version,time_per_turn,created_by,status)
VALUES ('1234','A classic topic',NULL,true,'classic_v1',120,'00000000-0000-0000-0000-000000000001','waiting');
INSERT INTO public.debates(id,topic,description,ranked,format_version,time_per_turn,created_by,status)
VALUES ('2345','An open topic','Synthetic',false,'open_exchange_v1',120,'00000000-0000-0000-0000-000000000001','waiting');
DO $$
BEGIN
 BEGIN
  INSERT INTO public.debates(id,topic,ranked,format_version,time_per_turn,created_by,status)
  VALUES ('3456','Invalid',true,'open_exchange_v1',120,'00000000-0000-0000-0000-000000000001','waiting');
 EXCEPTION WHEN check_violation THEN RETURN;
 END;
 RAISE EXCEPTION 'Ranked Open Exchange was accepted';
END $$;
RESET ROLE;
SET ROLE service_role;
INSERT INTO public.debates(id,topic,created_by,appraisal_status,rating_applied)
VALUES ('4567','Synthetic server insert','00000000-0000-0000-0000-000000000002','completed',true);
RESET ROLE;
SELECT 'PASS: both current app creation shapes, mode constraint and trusted service insert' AS result;
