import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  // The same Night the page renders, as it arrives from the reader: no re-sorting, no re-shaping.
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    // Only a date is a night; this keeps `:night` from reaching the filesystem as a path.
    const found = /^\d{4}-\d{2}-\d{2}$/.test(night) ? readNight(config.runsDir, night) : null;
    return found ? c.json(found) : c.json({ error: 'no digest for this night', night }, 404);
  });

  return app;
}
