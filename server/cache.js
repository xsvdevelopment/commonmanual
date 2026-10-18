// Disk cache for upstream JSON. Fresh hits skip the network; when the network
// is down, a stale copy is served so the shop keeps working offline.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE_DIR } from './paths.js';

export async function cachedJson(url, { ttlHours = 168, headers = {} } = {}) {
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE_DIR, key + '.json');

  let stale = null;
  try {
    const stat = await fs.stat(file);
    const body = JSON.parse(await fs.readFile(file, 'utf8'));
    if (Date.now() - stat.mtimeMs < ttlHours * 3600_000) return body;
    stale = body;
  } catch {}

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    const body = await res.json();
    // A cache that can't be written (read-only disk) shouldn't fail the request.
    await fs.mkdir(CACHE_DIR, { recursive: true }).then(() => fs.writeFile(file, JSON.stringify(body))).catch(() => {});
    return body;
  } catch (err) {
    if (stale) return stale;
    throw err;
  }
}
