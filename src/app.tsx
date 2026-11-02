import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Digest } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  // Only YYYY-MM-DD names a night, so anything else is a 404 and never reaches the filesystem
  // as a path. Both digest routes read through this, so they agree on what counts as a night
  // as well as on what a night contains.
  const nightOrNull = (name: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(name) ? readNight(config.runsDir, name) : null;

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = nightOrNull(c.req.param('night'));
    if (night === null) return c.notFound();
    return c.html(
      <Layout title={`digest ${night.night}`} lane={lane()}>
        <Digest night={night} />
      </Layout>,
    );
  });

  // The same Night the page renders, as it arrives from the reader: no re-sorting, no re-shaping.
  app.get('/api/digest/:night', (c) => {
    const name = c.req.param('night');
    const found = nightOrNull(name);
    return found ? c.json(found) : c.json({ error: 'no digest for this night', night: name }, 404);
  });

  return app;
}
