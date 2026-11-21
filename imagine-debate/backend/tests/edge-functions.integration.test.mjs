import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../supabase/functions/', import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serviceKey = 'local-service-only';
const debate = { id: '1234', topic: 'Synthetic debate', created_by: '00000000-0000-0000-0000-000000000001', for_player_id: '00000000-0000-0000-0000-000000000001', against_player_id: '00000000-0000-0000-0000-000000000002', ranked: true, format_version: 'classic_v1', appraisal_status: 'completed', appraisal_result: { winner: 'for', summary: 'Cached synthetic verdict' } };

test('Edge Functions enforce identity, recover cached results, and retain reports on notification failure', { timeout: 60000 }, async (t) => {
  let failRatingOnce = true;
  let finalized = false;
  let finalizations = 0;
  const ratingCalls = [], reports = [], deletions = [];
  const fake = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/auth/v1/user') {
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      if (!['valid-player', 'valid-outsider'].includes(token)) { res.statusCode = 401; res.end(JSON.stringify({ message: 'Invalid test token' })); return; }
      res.end(JSON.stringify({ id: token === 'valid-player' ? '00000000-0000-0000-0000-000000000001' : '00000000-0000-0000-0000-000000000003', user_metadata: {} })); return;
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') {
      assert.equal(req.headers.authorization, `Bearer ${serviceKey}`);
      deletions.push(url.pathname.split('/').at(-1));
      res.end(JSON.stringify({ id: deletions.at(-1) })); return;
    }
    if (url.pathname === '/rest/v1/debates' && req.method === 'GET') { res.end(JSON.stringify(debate)); return; }
    if (url.pathname === '/rest/v1/profiles') { res.end(JSON.stringify([{ id: '00000000-0000-0000-0000-000000000001', username: 'Alpha' }, { id: '00000000-0000-0000-0000-000000000002', username: 'Beta' }])); return; }
    if (url.pathname === '/rest/v1/reports' && req.method === 'POST') {
      let body = ''; for await (const part of req) body += part;
      reports.push(JSON.parse(body));
      res.end(JSON.stringify({ id: reports.length, created_at: '2026-01-01T00:00:00Z' })); return;
    }
    if (url.pathname === '/rest/v1/rpc/apply_debate_result') {
      assert.equal(req.headers.authorization, `Bearer ${serviceKey}`);
      let body = ''; for await (const part of req) body += part;
      const args = JSON.parse(body); ratingCalls.push(args);
      assert.deepEqual(args, { p_debate_id: '1234', p_for_player_id: '00000000-0000-0000-0000-000000000001', p_against_player_id: '00000000-0000-0000-0000-000000000002', p_winning_side: 'for', p_ended_reason: 'ai_judged', p_ranked: true });
      if (failRatingOnce) { failRatingOnce = false; res.statusCode = 503; res.end(JSON.stringify({ message: 'Synthetic result-save failure' })); return; }
      if (!finalized) { finalizations++; finalized = true; }
      res.end('null'); return;
    }
    res.statusCode = 500; res.end(JSON.stringify({ message: 'Unexpected test request' }));
  });
  await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
  const fakeUrl = `http://127.0.0.1:${fake.address().port}`;
  const request = async (token, body) => {
    const response = await fetch('http://127.0.0.1:8000', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  async function withFunction(name, extra, run) {
    // Fail before sending requests if another local service owns this port.
    let available = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const reservation = http.createServer();
      try {
        await new Promise((resolve, reject) => reservation.once('error', reject).listen(8000, '0.0.0.0', resolve));
        await new Promise((resolve) => reservation.close(resolve));
        available = true;
        break;
      } catch (error) {
        if (error.code !== 'EADDRINUSE') throw error;
        // Windows may release the previous child process's listener shortly after exit.
        await sleep(75);
      }
    }
    assert.ok(available, 'Local port 8000 is occupied; stop the other service before running these tests.');
    let startError;
    const child = spawn('deno', ['run', '--cached-only', '--no-config', '--no-lock', '--allow-env', '--allow-net=127.0.0.1,0.0.0.0', fileURLToPath(new URL(`${name}/index.ts`, root))], {
      cwd: fileURLToPath(root),
      env: { ...process.env, SUPABASE_URL: fakeUrl, SUPABASE_ANON_KEY: 'local-public-only', SUPABASE_SERVICE_ROLE_KEY: serviceKey, GEMINI_API_KEY: 'local-unused', RESEND_API_KEY: '', REPORT_RECIPIENT: '', REPORT_FROM_EMAIL: '', ...extra },
      stdio: 'ignore',
    });
    child.once('error', (error) => { startError = error; });
    try {
      let ready = false;
      for (let i = 0; i < 80; i++) {
        if (startError || child.exitCode !== null) break;
        try { if ((await fetch('http://127.0.0.1:8000', { method: 'OPTIONS' })).ok) { ready = true; break; } } catch { /* local process starting */ }
        await sleep(100);
      }
      assert.ok(ready, `${name} did not start; cache its imports with deno check --no-lock first and ensure port 8000 is free`);
      await run();
    } finally {
      if (child.pid && child.exitCode === null) { child.kill(); await new Promise((resolve) => child.once('exit', resolve)); }
    }
  }
  try {
    await t.test('judge rejects unauthenticated, invalid and unrelated callers; cached retries repair a failed result', async () => {
      await withFunction('judge-debate', {}, async () => {
        for (const [token, status] of [[null, 401], ['invalid', 401], ['valid-outsider', 403]]) assert.equal((await request(token, { debateId: '1234' })).status, status);
        assert.equal(ratingCalls.length, 0);
        const first = await request('valid-player', { debateId: '1234', ranked: false, for_player_id: '00000000-0000-0000-0000-000000000003' });
        assert.equal(first.status, 200); assert.equal(first.body.cached, true); assert.equal(first.body.ratingApplied, false);
        const second = await request('valid-player', { debateId: '1234' });
        assert.equal(second.status, 200); assert.equal(second.body.ratingApplied, true);
        const repeated = await request(serviceKey, { debateId: '1234' });
        assert.equal(repeated.status, 200); assert.equal(repeated.body.ratingApplied, true);
        assert.equal(finalizations, 1); assert.equal(ratingCalls.length, 3);
      });
    });
    for (const emailConfigured of [false, true]) await t.test(`reports survive notification ${emailConfigured ? 'network denial' : 'missing configuration'}`, async () => {
      await withFunction('submit-report', emailConfigured ? { RESEND_API_KEY: 'local-unused', REPORT_RECIPIENT: 'owner@example.invalid', REPORT_FROM_EMAIL: 'app@example.invalid' } : {}, async () => {
        const body = { debateId: '1234', reason: 'Synthetic moderation report', reporter_id: '00000000-0000-0000-0000-000000000003' };
        const before = reports.length;
        for (const [token, status] of [[null, 401], ['invalid', 401], ['valid-outsider', 403]]) assert.equal((await request(token, body)).status, status);
        assert.equal(reports.length, before);
        const result = await request('valid-player', body);
        assert.equal(result.status, 200); assert.equal(result.body.success, true); assert.equal(result.body.emailSent, false);
        assert.equal(reports.length, before + 1); assert.equal(reports.at(-1).reporter_id, '00000000-0000-0000-0000-000000000001');
      });
    });
    await t.test('account deletion uses only the verified caller identity', async () => {
      await withFunction('delete-account', {}, async () => {
        for (const token of [null, 'invalid']) assert.equal((await request(token, { userId: '00000000-0000-0000-0000-000000000003' })).status, 401);
        assert.equal(deletions.length, 0);
        const result = await request('valid-player', { userId: '00000000-0000-0000-0000-000000000003' });
        assert.equal(result.status, 200); assert.equal(result.body.success, true); assert.deepEqual(deletions, ['00000000-0000-0000-0000-000000000001']);
      });
    });
  } finally { await new Promise((resolve) => fake.close(resolve)); }
});
