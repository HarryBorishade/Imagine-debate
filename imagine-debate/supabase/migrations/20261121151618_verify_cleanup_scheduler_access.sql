BEGIN;
SET LOCAL lock_timeout = '5s';

-- Verification only: keep existing schedules, commands and grants unchanged.
-- Commands may contain credentials, so never include them in error output.
DO $$
DECLARE
  job record;
  routine regprocedure;
  can_see_all_jobs boolean;
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.delete_debates_older_than_30_days()'::regprocedure,
    'public.cleanup_stale_debates()'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', routine, 'EXECUTE')
       OR has_function_privilege('authenticated', routine, 'EXECUTE')
       OR NOT has_function_privilege('postgres', routine, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected effective cleanup permissions for %', routine;
    END IF;
  END LOOP;

  IF to_regclass('cron.job') IS NOT NULL THEN
    SELECT r.rolsuper OR r.rolbypassrls OR NOT c.relrowsecurity
      INTO can_see_all_jobs
      FROM pg_roles r CROSS JOIN pg_class c
      WHERE r.rolname = current_user AND c.oid = 'cron.job'::regclass;
    IF NOT coalesce(can_see_all_jobs, false) THEN
      RAISE EXCEPTION 'Cannot verify all pg_cron jobs with the current role';
    END IF;
    FOR job IN EXECUTE $query$
      SELECT jobid, username,
        command ~* 'delete_debates_older_than_30_days' AS calls_old,
        command ~* 'cleanup_stale_debates' AS calls_stale
      FROM cron.job
      WHERE active AND command ~* '(delete_debates_older_than_30_days|cleanup_stale_debates)'
    $query$ LOOP
      IF (job.calls_old AND NOT has_function_privilege(job.username, 'public.delete_debates_older_than_30_days()', 'EXECUTE'))
         OR (job.calls_stale AND NOT has_function_privilege(job.username, 'public.cleanup_stale_debates()', 'EXECUTE')) THEN
        RAISE EXCEPTION 'Cleanup permissions would block scheduled pg_cron job % (role %)', job.jobid, job.username;
      END IF;
    END LOOP;
  END IF;
END;
$$;
COMMIT;
