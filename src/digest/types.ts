// The shape every part of the morning digest works against: § 1 produces it, § 2a renders it,
// § 2b serves it as JSON, § 2c counts it for the board.
//
// Committed before the reader so the four parts of § 2 can start against it.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of `runs/<night>.jsonl`, after it has been parsed and checked. */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  /** The log may carry `null`. Kept as null; the view shows an em dash (styleguide). */
  owner: string | null;
  error?: string;
};

/** One job's night, in one row. */
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** The error of the last line that carried one, or null. */
  lastError: string | null;
  /** Kept exactly as the log wrote them, offset included (styleguide: never convert to UTC). */
  firstAt: string;
  lastAt: string;
};

/**
 * One night, read.
 *
 * `rows` is sorted by job, once, here. The page and the JSON both render this array in the
 * order it arrives, so they cannot disagree about order (§ 2b, ADR 0001).
 *
 * `badLines` counts lines that did not parse. They are counted, never thrown: the night still
 * renders (§ 1).
 */
export type Night = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

/**
 * Reads one night from `runsDir`.
 *
 * Returns `null` when the night has no file at all, which the routes turn into a 404 (§ 2a).
 * An empty file is not missing: it reads as a Night with no rows, which renders as
 * "nothing ran".
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
