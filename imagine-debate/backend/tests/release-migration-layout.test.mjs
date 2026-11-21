import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const supabase = new URL('../../supabase/', import.meta.url);
const migrations = new URL('migrations/', supabase);
const manifest = JSON.parse(await readFile(new URL('release-migration-records.json', supabase), 'utf8'));

test('reported applied migration records retain the exact supplied SQL', async () => {
  for (const record of manifest.records) {
    const sql = (await readFile(new URL(record.file, migrations), 'utf8')).replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(sql).digest('hex'), record.sha256_lf, record.file);
  }
});

test('the pending migration set contains no superseded drafts or duplicate versions', async () => {
  const names = (await readdir(migrations)).filter((name) => /^\d{14}_.*\.sql$/.test(name));
  const versions = names.map((name) => name.slice(0, 14));
  assert.equal(new Set(versions).size, versions.length, 'duplicate migration versions');
  for (const old of ['20261120120000', '20261120130000', '20261121010000', '20261121010100']) assert.ok(!versions.includes(old), `superseded draft ${old}`);
  const known = new Set([...manifest.records.map((record) => record.version), ...manifest.legacy_versions_requiring_remote_reconciliation]);
  const pending = versions.filter((version) => !known.has(version)).sort();
  assert.deepEqual(pending, manifest.pending_versions);
  const lastApplied = manifest.records.at(-1).version;
  for (const version of pending) assert.ok(version > lastApplied, `pending version ${version} predates reported production history`);
});
