CREATE TABLE public.debates (
 id text primary key, topic text not null, description text,
 time_per_turn integer, created_by uuid, status text default 'waiting',
 ranked boolean not null default true, appraisal_status text default 'not_ready',
 appraisal_result jsonb, appraisal_error text, rating_applied boolean default false,
 started_at timestamptz, for_player_id uuid, against_player_id uuid,
 winning_side text, ended_reason text
);
ALTER TABLE public.debates ENABLE ROW LEVEL SECURITY;
CREATE POLICY debates_insert_own ON public.debates FOR INSERT TO authenticated
 WITH CHECK (created_by=auth.uid() AND status='waiting' AND winning_side IS NULL
 AND rating_applied=false AND for_player_id IS NULL AND against_player_id IS NULL);
CREATE POLICY debates_select_participant ON public.debates FOR SELECT TO authenticated
 USING (created_by=auth.uid() OR for_player_id=auth.uid() OR against_player_id=auth.uid());
GRANT SELECT, INSERT ON public.debates TO anon, authenticated, service_role;
CREATE TABLE public.test_cleanup_runs (name text not null);
CREATE FUNCTION public.cleanup_stale_debates() RETURNS void LANGUAGE sql
 AS $$ INSERT INTO public.test_cleanup_runs VALUES ('stale') $$;
CREATE FUNCTION public.delete_debates_older_than_30_days() RETURNS void
 LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO public.test_cleanup_runs VALUES ('old') $$;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_debates() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_debates_older_than_30_days() TO anon, authenticated, service_role;
