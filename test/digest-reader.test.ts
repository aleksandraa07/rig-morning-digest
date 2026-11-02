import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

// runs/ is read-only (AGENTS.md), so anything written goes to a temp dir.
function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

describe('readNight on the real night', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs and counts the one bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.rows).toHaveLength(5);
    expect(night!.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries per job', () => {
    const refresh = night!.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh.runs).toBe(4);
    expect(refresh.retries).toBe(3);
    expect(refresh.lastStatus).toBe('ok');
  });

  it('keeps the last error even when the job later succeeded', () => {
    const refresh = night!.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh.lastError).toBe('upstream 503');
  });

  it('marks a job that ended in fail', () => {
    const backup = night!.rows.find((r) => r.job === 'notes/backup')!;
    expect(backup.lastStatus).toBe('fail');
    expect(backup.lastError).toBe('quota exceeded');
    expect(backup.retries).toBe(0);
  });

  it('keeps a row whose owner is null', () => {
    const render = night!.rows.find((r) => r.job === 'digest/render')!;
    expect(render.owner).toBeNull();
    expect(render.runs).toBe(1);
  });

  it('keeps times exactly as the log wrote them, offset included', () => {
    const sync = night!.rows.find((r) => r.job === 'lane/sync')!;
    expect(sync.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(sync.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edges', () => {
  it('returns null when the night has no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('reads an empty file as a night where nothing ran', () => {
    const dir = tempRuns({ '2026-01-01.jsonl': '' });
    const night = readNight(dir, '2026-01-01')!;
    expect(night).not.toBeNull();
    expect(night.rows).toEqual([]);
    expect(night.badLines).toBe(0);
  });

  it('counts a bad line instead of throwing, and still renders the rest', () => {
    const dir = tempRuns({
      '2026-01-02.jsonl': [
        '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        'not json at all',
        '{"at":"2026-01-02T02:00:00+01:00","job":"a","status":"fail","owner":"x","error":"boom"}',
      ].join('\n'),
    });
    const night = readNight(dir, '2026-01-02')!;
    expect(night.badLines).toBe(1);
    expect(night.rows).toHaveLength(1);
    expect(night.rows[0]!.runs).toBe(2);
    expect(night.rows[0]!.lastStatus).toBe('fail');
  });

  it('counts a line that parses but is not a run line', () => {
    const dir = tempRuns({ '2026-01-03.jsonl': '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"maybe"}' });
    const night = readNight(dir, '2026-01-03')!;
    expect(night.badLines).toBe(1);
    expect(night.rows).toEqual([]);
  });

  it('orders first and last by time, not by file order', () => {
    const dir = tempRuns({
      '2026-01-04.jsonl': [
        '{"at":"2026-01-04T05:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        '{"at":"2026-01-04T01:00:00+01:00","job":"a","status":"retry","owner":"x","error":"late"}',
      ].join('\n'),
    });
    const row = readNight(dir, '2026-01-04')!.rows[0]!;
    expect(row.firstAt).toBe('2026-01-04T01:00:00+01:00');
    expect(row.lastAt).toBe('2026-01-04T05:00:00+01:00');
    expect(row.lastStatus).toBe('ok');
  });
});
