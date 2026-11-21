-- Catalog-only release audit. Run with a role that can see all policies and jobs.
-- Do not paste job commands, secret values, user rows, or report contents into chat.
BEGIN READ ONLY;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
       has_function_privilege('postgres',p.oid,'EXECUTE') AS postgres_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('apply_debate_result','check_debate_code','cleanup_stale_debates','delete_debates_older_than_30_days')
ORDER BY p.proname,arguments;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','debates','messages')
ORDER BY tablename,policyname;
SELECT grantee,table_name,column_name,privilege_type
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name IN ('profiles','debates')
  AND grantee IN ('PUBLIC','anon','authenticated','service_role')
ORDER BY table_name,grantee,column_name,privilege_type;
-- These final queries require the existing pg_cron extension. Roles with filtered
-- cron.job visibility cannot provide complete evidence; inspect that separately.
SELECT jobid,jobname,schedule,username,active,
 CASE WHEN command ~* 'delete_debates_older_than_30_days' THEN 'retention'
      WHEN command ~* 'cleanup_stale_debates' THEN 'stale' ELSE 'other' END AS purpose
FROM cron.job ORDER BY jobid;
SELECT j.jobname,d.status,d.start_time,d.end_time
FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
WHERE j.jobname IN ('cleanup-stale-debates','delete-debates-older-than-30-days')
ORDER BY d.start_time DESC LIMIT 20;
COMMIT;
