// Optional browser regression: Node 24+, local Chrome and installed frontend dependencies.
// All Auth/database/function requests use a local synthetic Supabase service.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const frontend = fileURLToPath(new URL('../', import.meta.url));
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(fn, label, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const result = await fn(); if (result) return result; } catch { /* local app starting */ } await sleep(150); }
  throw new Error(label);
}
async function listen(server) { await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve)); return server.address().port; }
const appraisal = { winner: 'for', summary: 'Synthetic saved verdict', scores: { for: { total: 80 }, against: { total: 70 } }, feedback: { for: 'Synthetic feedback', against: 'Synthetic feedback' } };
let attempts = 0, debateReads = 0, finalized = false, appProcess, chromeProcess, websocket;
const fake = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/auth/v1/user') { res.end(JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', user_metadata: {} })); return; }
  if (url.pathname === '/rest/v1/debates') {
    debateReads++;
    res.end(JSON.stringify({ id: '1234', topic: 'Synthetic outcome', format_version: 'classic_v1', appraisal_status: 'completed', appraisal_error: null, appraisal_result: appraisal, rating_applied: finalized, for_player_id: '00000000-0000-0000-0000-000000000001', against_player_id: '00000000-0000-0000-0000-000000000002', ended_reason: finalized ? 'ai_judged' : null, winning_side: finalized ? 'for' : null })); return;
  }
  if (url.pathname === '/functions/v1/judge-debate') {
    let body = ''; for await (const part of req) body += part;
    assert.deepEqual(JSON.parse(body), { debateId: '1234' });
    attempts++; finalized = attempts > 1;
    res.end(JSON.stringify({ success: true, cached: true, appraisal, ratingApplied: finalized, ...(finalized ? {} : { ratingError: 'Synthetic retry failure' }) })); return;
  }
  res.end('[]');
});
async function main() {
  await fs.access(chrome);
  const fakePort = await listen(fake);
  const reservation = http.createServer(); const appPort = await listen(reservation); await new Promise((resolve) => reservation.close(resolve));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'imagine-outcome-browser-'));
  appProcess = spawn(process.execPath, [path.join(frontend, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], { cwd: frontend, windowsHide: true, stdio: 'ignore', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fakePort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-public-only', NEXT_PUBLIC_GA_MEASUREMENT_ID: '' } });
  await wait(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}/`)).ok; } catch { return false; } }, 'Local frontend did not start');
  chromeProcess = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const debugPort = await wait(async () => { const value = await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8'); return Number(value.split('\n')[0]); }, 'Isolated Chrome did not start');
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  websocket = new WebSocket(targets.find((item) => item.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { websocket.onopen = resolve; websocket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  websocket.onmessage = (event) => { const message = JSON.parse(event.data); const entry = pending.get(message.id); if (entry) { pending.delete(message.id); if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result); } };
  const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); websocket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (value.exceptionDetails) throw new Error('Browser evaluation failed'); return value.result.value; };
  const session = { access_token: 'local-player-only', refresh_token: 'local-unused', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', user_metadata: {} } };
  await command('Page.enable'); await command('Runtime.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.port===${JSON.stringify(String(appPort))}) localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(session))});` });
  await command('Page.navigate', { url: `http://127.0.0.1:${appPort}/debate/1234/outcome` });
  await wait(() => evaluate("document.body.innerText.includes('FOR wins') && document.body.innerText.includes('Retry saving result')"), 'Saved outcome did not offer result recovery');
  await sleep(400);
  const settledReads = debateReads;
  await sleep(600);
  assert.ok(debateReads <= settledReads + 1, 'completed outcome repeatedly reloaded its own state');
  assert.equal(attempts, 0, 'page automatically rejudged a saved verdict');
  await evaluate("[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Retry saving result').click()");
  await wait(() => evaluate("document.body.innerText.includes('Synthetic retry failure') && document.body.innerText.includes('FOR wins')"), 'Retry failure hid the verdict or was not shown');
  await wait(() => evaluate("[...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Retry saving result'&&!x.disabled)"), 'Retry stayed disabled');
  await evaluate("[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Retry saving result').click()");
  await wait(() => attempts === 2 && evaluate("document.body.innerText.includes('FOR wins') && !document.body.innerText.includes('The result still needs to finish saving') && !document.body.innerText.includes('Synthetic retry failure')"), 'Successful finalization did not clear recovery status');
  assert.equal(attempts, 2);
  console.log('PASS: actual outcome UI preserved a saved verdict, displayed a failed retry, and recovered on the next retry using local services.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (websocket) websocket.close();
  if (chromeProcess) chromeProcess.kill();
  if (appProcess) appProcess.kill();
  await new Promise((resolve) => fake.close(resolve));
  setTimeout(() => process.exit(process.exitCode || 0), 500).unref();
});
