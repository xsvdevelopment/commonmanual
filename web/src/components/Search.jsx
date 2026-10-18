import { useState } from 'react';
import { useApi, qs } from '../api.js';
import { EntryCard } from './Entry.jsx';

export default function Search({ q, drafts }) {
  const [input, setInput] = useState(q);
  const { data, loading } = useApi(q ? `/kb/search?${qs({ q, drafts: drafts ? 1 : '' })}` : null);
  return (
    <div>
      <h1>Search</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); location.hash = '/search?' + qs({ q: input }); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="firing order 302, cam phaser, bleed brakes…" autoFocus />
        <button className="btn primary">Search</button>
      </form>
      {loading && <p className="muted">Searching…</p>}
      {data && !data.length && <p className="muted">Nothing found{drafts ? '' : ' in cited entries. Unsourced drafts are hidden; switch them on at the top to include them'}.</p>}
      {data && <div className="cards">{data.map((e) => <EntryCard key={e.id} e={e} />)}</div>}
    </div>
  );
}
