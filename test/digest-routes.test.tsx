import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// runs/ is read-only (AGENTS.md), so every night these tests need is built in a temp dir.
function appWithRuns(files: Record<string, string>) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(runsDir, name), body);
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

// Written out of job order on purpose: the routes must sort.
const GOOD = [
  '{"at":"2026-11-01T23:00:02+01:00","job":"b/second","status":"ok","owner":"rook"}',
  '{"at":"2026-11-01T23:00:01+01:00","job":"a/first","status":"fail","owner":null,"error":"boom"}',
].join('\n');

const BAD = `${GOOD}\nthis is not json\n`;

describe('GET /digest/:night', () => {
  it('200: renders a night that exists', async () => {
    const app = appWithRuns({ '2026-11-01.jsonl': GOOD });
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest · 2026-11-01');
    expect(html).toContain('boom');
    // owner: null renders as an em dash, never an empty cell (styleguide)
    expect(html).toContain('<td>—</td>');
    // sorted by job although the file lists b/second first
    expect(html.indexOf('a/first')).toBeGreaterThan(-1);
    expect(html.indexOf('a/first')).toBeLessThan(html.indexOf('b/second'));
  });

  it('404: a night with no file', async () => {
    const app = appWithRuns({ '2026-11-01.jsonl': GOOD });
    const res = await app.request('/digest/2026-11-02');
    expect(res.status).toBe(404);
  });

  it('empty night: 200 and says nothing ran', async () => {
    const app = appWithRuns({ '2026-11-01.jsonl': '' });
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('unreadable');
  });

  it('bad line: still 200, shows the good rows and the skipped count', async () => {
    const app = appWithRuns({ '2026-11-01.jsonl': BAD });
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/first');
    expect(html).toContain('b/second');
    expect(html).toContain('1 unreadable line skipped');
  });
});

describe('GET /api/digest/:night', () => {
  it('200: returns the rows, sorted by job, with no bad lines', async () => {
    const app = appWithRuns({ '2026-11-01.jsonl': GOOD });
    const res = await app.request('/api/digest/2026-11-01');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-11-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['a/first', 'b/second']);
    expect(body.rows[0]).toMatchObject({
      job: 'a/first',
      owner: null,
      runs: 1,
      lastStatus: 'fail',
      lastError: 'boom',
    });
  });

  it('404: a night with no file, as JSON naming the night', async () => {
    const app = appWithRuns({ '2026-11-01.jsonl': GOOD });
    const res = await app.request('/api/digest/2026-11-02');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no digest for this night', night: '2026-11-02' });
  });

  it('empty night: 200 with an empty rows array', async () => {
    const app = appWithRuns({ '2026-11-01.jsonl': '' });
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-11-01', rows: [], badLines: 0 });
  });

  it('bad line: still 200, good rows kept, badLines reported', async () => {
    const app = appWithRuns({ '2026-11-01.jsonl': BAD });
    const res = await app.request('/api/digest/2026-11-01');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a/first', 'b/second']);
  });
});
