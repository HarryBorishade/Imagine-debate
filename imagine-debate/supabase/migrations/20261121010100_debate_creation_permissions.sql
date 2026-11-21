BEGIN;
SET LOCAL lock_timeout = '5s';

REVOKE INSERT ON public.debates FROM PUBLIC, anon, authenticated;
GRANT INSERT (id, topic, description, time_per_turn, created_by, status, ranked)
  ON public.debates TO authenticated;

DO $$
DECLARE
  allowed_columns text[] := ARRAY[
    'id', 'topic', 'description', 'time_per_turn', 'created_by', 'status', 'ranked'
  ];
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.debates'::regclass
      AND attname = 'format_version' AND NOT attisdropped
  ) THEN
    EXECUTE 'GRANT INSERT (format_version) ON public.debates TO authenticated';
    allowed_columns := array_append(allowed_columns, 'format_version');
  END IF;

  IF has_any_column_privilege('anon', 'public.debates', 'INSERT')
      OR EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.debates'::regclass AND attnum > 0 AND NOT attisdropped
      AND attname <> ALL(allowed_columns)
      AND has_column_privilege('authenticated', attrelid, attnum, 'INSERT')
  ) THEN
    RAISE EXCEPTION 'Unexpected effective debate INSERT privileges';
  END IF;
END;
$$;
COMMIT;
