# Runs only against a new network-isolated container. No project secrets are used.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$migrations = Join-Path $root 'supabase\migrations'
$fixture = Join-Path $PSScriptRoot 'hardening-fixture.sql'
$baseChecks = Join-Path $PSScriptRoot 'hardening-permissions.sql'
$modeChecks = Join-Path $PSScriptRoot 'hardening-modes.sql'
$cleanup = Join-Path $migrations '20261121010000_cleanup_permissions.sql'
$creation = Join-Path $migrations '20261121010100_debate_creation_permissions.sql'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.121'
$container = 'imagine-hardening-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
function AssertExit($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" } }
function InvokeSql($database, $sql) { $sql | docker exec -i $container psql -U postgres -d $database -v ON_ERROR_STOP=1; AssertExit "SQL in $database" }
function InvokeFile($database, $path) { InvokeSql $database (Get-Content -LiteralPath $path -Raw) }
function WaitReady {
  for ($i=0; $i -lt 60; $i++) { docker exec $container pg_isready -U postgres 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { return }; Start-Sleep -Milliseconds 500 }
  throw 'Local test database did not become ready.'
}
try {
  docker run -d --rm --network none --name $container -e POSTGRES_PASSWORD=local-test-only $image | Out-Null
  AssertExit 'Starting test container'
  WaitReady
  docker exec -e PGPASSWORD=local-test-only $container psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET cron.use_background_workers = 'on';" | Out-Null
  AssertExit 'Configuring local cron'
  docker restart $container | Out-Null
  AssertExit 'Restarting test database'
  WaitReady
  docker exec -e PGPASSWORD=local-test-only $container psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION pg_cron;' | Out-Null
  AssertExit 'Enabling local cron'
  InvokeFile postgres $fixture
  InvokeSql postgres "SELECT cron.schedule('test-stale', '5 seconds', 'SELECT public.cleanup_stale_debates()'); SELECT cron.schedule('test-old', '5 seconds', 'SELECT public.delete_debates_older_than_30_days()');"
  InvokeFile postgres $cleanup
  InvokeFile postgres $creation
  InvokeFile postgres $baseChecks
  InvokeSql postgres 'TRUNCATE public.test_cleanup_runs;'
  $ran = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $count = docker exec $container psql -U postgres -d postgres -Atc "SELECT count(distinct name) FROM public.test_cleanup_runs WHERE name IN ('old','stale')"
    AssertExit 'Checking local cron'
    if ($count -eq '2') { $ran = $true; break }
  }
  if (-not $ran) { throw 'Both scheduled test jobs did not run.' }
  Write-Output 'PASS: both local pg_cron jobs ran after hardening.'
  InvokeSql postgres "CREATE ROLE test_cleanup_scheduler LOGIN; GRANT test_cleanup_scheduler TO postgres; GRANT USAGE ON SCHEMA cron TO test_cleanup_scheduler; GRANT EXECUTE ON FUNCTION public.cleanup_stale_debates() TO PUBLIC; SET ROLE test_cleanup_scheduler; SELECT cron.schedule('test-restricted', '5 seconds', 'SELECT public.cleanup_stale_debates()'); RESET ROLE;"
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $failedOutput = Get-Content -LiteralPath $cleanup -Raw | docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1 | Out-String
  $failedCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($failedCode -eq 0 -or $failedOutput -notmatch 'Cleanup permissions would block scheduled pg_cron job') { throw 'Expected scheduler-role safety check did not fail.' }
  $stillGranted = docker exec $container psql -U postgres -d postgres -Atc "SELECT has_function_privilege('test_cleanup_scheduler','public.cleanup_stale_debates()','EXECUTE')"
  AssertExit 'Checking rollback'
  if ($stillGranted -ne 't') { throw 'Expected transactional rollback did not restore the grant.' }
  Write-Output 'PASS: migration rejected a scheduler permission loss and rolled back.'
  docker exec $container createdb -U postgres hardening_mode_first
  AssertExit 'Creating local mode database'
  $authSql = 'CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid $$; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role; CREATE TABLE auth.users(id uuid primary key); CREATE TABLE public.profiles(id uuid primary key, username text); INSERT INTO auth.users(id) VALUES (''00000000-0000-0000-0000-000000000001''),(''00000000-0000-0000-0000-000000000002'');'
  InvokeSql hardening_mode_first $authSql
  InvokeFile hardening_mode_first $fixture
  InvokeFile hardening_mode_first (Join-Path $migrations '20261120120000_debate_modes.sql')
  InvokeFile hardening_mode_first (Join-Path $migrations '20261120130000_private_friends_and_invites.sql')
  InvokeFile hardening_mode_first $cleanup
  InvokeFile hardening_mode_first $creation
  InvokeFile hardening_mode_first $baseChecks
  InvokeFile hardening_mode_first $modeChecks
  Write-Output 'PASS: complete isolated PostgreSQL hardening regression suite.'
} finally {
  docker stop $container 2>$null | Out-Null
}
