import type { DigestRow, Night } from '../digest/types.js';

const DASH = '—';

/** Retries at or above this count get marked (plan.md § 2a). */
const RETRY_MARK = 3;

// Rows render in the order `readNight` returns them. No sorting here: the JSON endpoint
// renders the same array, and the two must never disagree (ADR 0001).
function marks(row: DigestRow): string[] {
  const found: string[] = [];
  if (row.retries >= RETRY_MARK) found.push(`${row.retries} retries`);
  if (row.lastStatus === 'fail') found.push('fail');
  return found;
}

function orDash(value: string | null): string {
  return value === null || value === '' ? DASH : value;
}

export function Digest({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last</th>
              <th>marked</th>
              <th>first</th>
              <th>last at</th>
              <th>last error</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => {
              const flagged = marks(row);
              return (
                <tr>
                  <td>{row.job}</td>
                  <td>{orDash(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{flagged.length > 0 ? <span class="warn">{flagged.join(' · ')}</span> : DASH}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td>{orDash(row.lastError)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {night.badLines > 0 ? (
        <p class="mute">
          {night.badLines} unreadable {night.badLines === 1 ? 'line' : 'lines'} skipped
        </p>
      ) : null}
    </>
  );
}
