import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 4747;
const DEV = process.argv.includes('--dev');
const app = createApp({ readOnly: process.env.OPENBAY_READONLY === '1' });

if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({ configFile: path.join(ROOT, 'vite.config.js'), server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(dist)) {
    console.error('No build found. Run "npm run build" first, or "npm run dev".');
    process.exit(1);
  }
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Common Manual running at http://localhost:${PORT}`));
