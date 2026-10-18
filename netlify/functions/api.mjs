// Hosted public preview: the same API as the local server, read-only.
import serverless from 'serverless-http';
import { createApp } from '../../server/app.js';

const inner = serverless(createApp({ readOnly: true }));
const FN = '/.netlify/functions/api';

// netlify.toml rewrites /api/* and /media/* to this function; map the function
// path back to the route the Express app expects.
export const handler = (event, context) => {
  const p = event.path || '';
  if (p.startsWith(FN)) {
    const rest = p.slice(FN.length) || '/';
    event.path = rest.startsWith('/media/') ? rest : '/api' + rest;
  }
  return inner(event, context);
};
