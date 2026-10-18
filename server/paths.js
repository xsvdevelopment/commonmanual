import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo root is next to this file when run from source; in a bundled serverless
// function the data files sit in the task root (the working directory) instead.
const here = typeof import.meta.url === 'string' ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') : null;
const candidates = [
  here,
  process.env.LAMBDA_TASK_ROOT,
  process.cwd(),
].filter(Boolean);

export const ROOT = candidates.find((c) => fs.existsSync(path.join(c, 'data', 'oem-sites.json'))) || candidates[0];
export const DATA = path.join(ROOT, 'data');

// Serverless file systems are read-only except for the temp dir.
export const CACHE_DIR = process.env.OPENBAY_CACHE_DIR
  || (process.env.LAMBDA_TASK_ROOT ? path.join(os.tmpdir(), 'openbay-cache') : path.join(ROOT, '.cache'));
