# Local only: a fresh network-isolated PostgreSQL container and synthetic users.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$migrations = Join-Path $root 'supabase\migrations'
$records = (Get-Content -LiteralPath (Join-Path $root 'supabase\release-migration-records.json') -Raw | ConvertFrom-Json).records
$fixture = Join-Path $PSScriptRoot 'hardening-fixture.sql'
$scheduler = Join-Path $migrations '20261121151618_verify_cleanup_scheduler_access.sql'
$social = Join-Path $migrations '20261121152000_private_friends_and_invites.sql'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.121'
$container = 'imagine-release-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
function AssertExit($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" } }
function InvokeSql($database, $sql) { $sql | docker exec -i $container psql -U postgres -d $database -v ON_ERROR_STOP=1; AssertExit "SQL in $database" }
function InvokeFile($database, $path) { InvokeSql $database (Get-Content -LiteralPath $path -Raw) }
function WaitReady {
  # TCP becomes ready only after the image's temporary initialization server exits.
  for ($i=0; $i -lt 90; $i++) { docker exec $container pg_isready -h 127.0.0.1 -U postgres 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { return }; Start-Sleep -Milliseconds 500 }
  throw 'Local test database did not become ready.'
}
try {
  docker run -d --rm --network none --name $container -e POSTGRES_PASSWORD=local-test-only $image | Out-Null
  AssertExit 'Starting local test container'
  WaitReady
  docker exec -e PGPASSWORD=local-test-only $container psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET cron.use_background_workers = 'on';" | Out-Null
  AssertExit 'Configuring local cron'
  docker restart $container | Out-Null
  AssertExit 'Restarting test database'
  WaitReady
  docker exec -e PGPASSWORD=local-test-only $container psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION pg_cron;' | Out-Null
  AssertExit 'Enabling local cron'
  InvokeFile postgres $fixture
  InvokeSql postgres "INSERT INTO public.debates(id,topic) VALUES ('9000','Legacy before format'); SELECT cron.schedule('test-stale', '5 seconds', 'SELECT public.cleanup_stale_debates()'); SELECT cron.schedule('test-old', '5 seconds', 'SELECT public.delete_debates_older_than_30_days()');"
  foreach ($record in $records) { InvokeFile postgres (Join-Path $migrations $record.file) }
  InvokeFile postgres $scheduler
  InvokeFile postgres (Join-Path $PSScriptRoot 'release-results.sql')
  InvokeSql postgres 'TRUNCATE public.test_cleanup_runs;'
  $ran = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $count = docker exec $container psql -U postgres -d postgres -Atc "SELECT count(distinct name) FROM public.test_cleanup_runs WHERE name IN ('old','stale')"
    AssertExit 'Checking local cron'
    if ($count -eq '2') { $ran = $true; break }
  }
  if (-not $ran) { throw 'Both scheduled local jobs did not run after hardening.' }
  Write-Output 'PASS: both local pg_cron jobs ran after hardening.'
  InvokeSql postgres "CREATE ROLE test_cleanup_scheduler LOGIN; GRANT test_cleanup_scheduler TO postgres; GRANT USAGE ON SCHEMA cron TO test_cleanup_scheduler; SET ROLE test_cleanup_scheduler; SELECT cron.schedule('test-restricted', '5 seconds', 'SELECT public.cleanup_stale_debates()'); RESET ROLE;"
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $failedOutput = Get-Content -LiteralPath $scheduler -Raw | docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1 | Out-String
  $failedCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($failedCode -eq 0 -or $failedOutput -notmatch 'Cleanup permissions would block scheduled pg_cron job') { throw 'Expected scheduler-role verification did not reject missing access.' }
  InvokeSql postgres "SET ROLE test_cleanup_scheduler; SELECT cron.unschedule('test-restricted'); RESET ROLE;"
  Write-Output 'PASS: pending verification rejected a scheduler role lacking EXECUTE.'
  InvokeFile postgres $social
  InvokeFile postgres (Join-Path $PSScriptRoot 'hardening-permissions.sql')
  InvokeFile postgres (Join-Path $PSScriptRoot 'hardening-modes.sql')
  InvokeSql postgres 'CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text);'
  InvokeFile postgres (Join-Path $root 'supabase\verification\release-security.sql') | Out-Null
  Write-Output 'PASS: read-only release audit SQL executed against the synthetic catalog.'
  docker exec $container createdb -U postgres social_test
  AssertExit 'Creating local social regression database'
  $authSql = 'CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid $$; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role; CREATE TABLE auth.users(id uuid primary key,email text);'
  InvokeSql social_test $authSql
  InvokeFile social_test (Join-Path $PSScriptRoot 'social-fixture.sql')
  InvokeFile social_test $social
  InvokeFile social_test (Join-Path $PSScriptRoot 'social-rls.sql')
  Write-Output 'PASS: full release permissions, results, profile privacy, scheduler and social regression suite.'
} finally {
  docker stop $container 2>$null | Out-Null
}
