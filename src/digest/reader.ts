import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, RunLine, RunStatus } from './types.js';

// Parse at the edge, trust the types after (styleguide). Everything below `parseLine` works on
// RunLine, never on unknown JSON.

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const line = value as Record<string, unknown>;
  const { at, job, status, owner, error } = line;

  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status as RunStatus)) return null;
  // `owner` may be absent or null; anything else present must be a string.
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;

  return {
    at,
    job,
    status: status as RunStatus,
    owner: typeof owner === 'string' ? owner : null,
    ...(error === undefined ? {} : { error }),
  };
}

/** Compare two log timestamps. Falls back to the string when one will not parse. */
function earlier(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a < b;
  return ta < tb;
}

function toRows(lines: RunLine[]): DigestRow[] {
  const byJob = new Map<string, RunLine[]>();
  for (const line of lines) {
    const found = byJob.get(line.job);
    if (found) found.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows: DigestRow[] = [];
  for (const [job, jobLines] of byJob) {
    // Sort by time rather than trusting file order, so first/last hold even on an out-of-order log.
    const ordered = [...jobLines].sort((a, b) => (earlier(a.at, b.at) ? -1 : 1));
    const last = ordered[ordered.length - 1]!;

    // The owner of the most recent line that named one. A job logged with `owner: null`
    // throughout keeps null, and the view shows an em dash (styleguide).
    const named = [...ordered].reverse().find((l) => l.owner !== null);
    // The error of the most recent line that carried one, which may be older than `last`
    // when a job failed and then succeeded.
    const failed = [...ordered].reverse().find((l) => l.error !== undefined);

    rows.push({
      job,
      owner: named?.owner ?? null,
      runs: ordered.length,
      retries: ordered.filter((l) => l.status === 'retry').length,
      lastStatus: last.status,
      lastError: failed?.error ?? null,
      firstAt: ordered[0]!.at,
      lastAt: last.at,
    });
  }

  // Sorted once, here, so the page and the JSON render the same order by construction (§ 2b).
  return rows.sort((a, b) => a.job.localeCompare(b.job));
}

/**
 * Reads `runsDir/<night>.jsonl`.
 *
 * Returns null when the night has no file, which the routes turn into a 404. An empty file is
 * a night where nothing ran, not a missing one: it reads as a Night with no rows.
 */
export function readNight(runsDir: string, night: string): Night | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const lines: RunLine[] = [];
  let badLines = 0;
  // A blank line is whitespace, not a broken record, so it is skipped rather than counted.
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) badLines++;
    else lines.push(line);
  }

  return { night, rows: toRows(lines), badLines };
}
