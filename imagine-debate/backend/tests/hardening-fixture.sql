-- Synthetic pre-release schema. Run only in a disposable database.
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 username text, private_note text,
 rating integer NOT NULL DEFAULT 1000, wins integer NOT NULL DEFAULT 0,
 losses integer NOT NULL DEFAULT 0, draws integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000001','one@example.invalid'),
 ('00000000-0000-0000-0000-000000000002','two@example.invalid'),
 ('00000000-0000-0000-0000-000000000003','three@example.invalid');
INSERT INTO public.profiles(id,username,private_note) VALUES
 ('00000000-0000-0000-0000-000000000001','Alpha','private-one'),
 ('00000000-0000-0000-0000-000000000002','Beta','private-two'),
 ('00000000-0000-0000-0000-000000000003','Gamma','private-three');
CREATE TABLE public.debates (
 id text PRIMARY KEY, topic text NOT NULL, description text, time_per_turn integer,
 created_by uuid, status text DEFAULT 'waiting', ranked boolean NOT NULL DEFAULT true,
 appraisal_status text DEFAULT 'not_ready', appraisal_result jsonb, appraisal_error text,
 rating_applied boolean NOT NULL DEFAULT false, started_at timestamptz,
 for_player_id uuid, against_player_id uuid, winning_side text, ended_reason text
);
ALTER TABLE public.debates ENABLE ROW LEVEL SECURITY;
CREATE POLICY debates_insert_own ON public.debates FOR INSERT TO authenticated
 WITH CHECK (created_by=auth.uid() AND status='waiting' AND winning_side IS NULL
 AND rating_applied=false AND for_player_id IS NULL AND against_player_id IS NULL);
CREATE POLICY debates_select_participant ON public.debates FOR SELECT TO authenticated
 USING (created_by=auth.uid() OR for_player_id=auth.uid() OR against_player_id=auth.uid());
GRANT ALL ON public.debates TO anon, authenticated, service_role;
CREATE TABLE public.test_cleanup_runs(name text NOT NULL);
CREATE FUNCTION public.cleanup_stale_debates() RETURNS void LANGUAGE sql
 AS $$ INSERT INTO public.test_cleanup_runs VALUES ('stale') $$;
CREATE FUNCTION public.delete_debates_older_than_30_days() RETURNS void LANGUAGE sql SECURITY DEFINER
 AS $$ INSERT INTO public.test_cleanup_runs VALUES ('old') $$;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_debates() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_debates_older_than_30_days() TO anon, authenticated, service_role;
