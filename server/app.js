import express from 'express';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';

const SITE_DIR = fileURLToPath(new URL('../site/', import.meta.url));

const wrap = (handler) => (req, res, next) => handler(req, res).catch(next);

export function createApp({ config, content, refresher }) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use(createAuth(config));

  app.get('/explainers/index.json', wrap(async (req, res) => {
    res.set('cache-control', 'no-store').json(await refresher.index());
  }));

  app.get('/explainers/:file', wrap(async (req, res) => {
    if (!/^\d+\.md$/.test(req.params.file)) return res.sendStatus(404);
    const body = await content.read(req.params.file);
    if (body == null) return res.sendStatus(404);
    res.set('cache-control', 'private, no-cache').type('text/markdown').send(body);
  }));

  app.get('/api/me', (req, res) => {
    res.json({ username: config.username, canRunWorkflow: Boolean(config.githubToken && config.contentRepo) });
  });

  app.post('/api/refresh', wrap(async (req, res) => {
    res.json(await refresher.refresh());
  }));

  app.get('/api/refresh', wrap(async (req, res) => {
    res.set('cache-control', 'no-store').json(await refresher.status());
  }));

  app.use(express.static(SITE_DIR, { index: 'index.html' }));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(502).json({ error: err.message });
  });

  return app;
}
