import { useState } from 'react';
import { useApi } from '../api.js';
import { SourceNote } from './Entry.jsx';

export default function Codes({ code, drafts }) {
  const [input, setInput] = useState(code || '');
  const { data, loading } = useApi(code ? `/dtc/${encodeURIComponent(code)}` : null);
  const showCauses = data?.causesStatus !== 'draft' || drafts;

  return (
    <div className="codes">
      <h1>Trouble codes</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); location.hash = '/codes/' + encodeURIComponent(input.trim().toUpperCase()); }}>
        <input className="vin" value={input} onChange={(e) => setInput(e.target.value)} placeholder="P0420" maxLength={5} spellCheck={false} />
        <button className="btn primary">Look up</button>
      </form>
      {loading && <p className="muted">…</p>}
      {data && !data.valid && <p className="warn">"{data.code}" isn't an OBD-II code. Format is a letter (P, B, C, U) and four characters, like P0301.</p>}
      {data?.valid && (
        <article className="panel code-card">
          <div className="code-big">{data.code}</div>
          <h2>{data.title || (data.generic ? 'Generic code not in the database yet' : 'Manufacturer-specific code')}</h2>
          <table className="spec"><tbody>{data.parts.map((p) => <tr key={p.label}><th>{p.label}</th><td>{p.value}</td></tr>)}</tbody></table>
          {!data.known && !data.generic && <p>This code means different things on different makes. Look it up in the factory info for the vehicle (pull up the vehicle, then the Factory info tab), and add what you find with its source.</p>}
          {data.title && <SourceNote sources={data.sources} note="Definition paraphrased from the standard." />}
          {data.causes && (showCauses ? (
            <div className="draft-block">
              <span className="badge red">Draft: needs citation</span>
              <div className="split">
                <div><h3>Common causes</h3><ul>{data.causes.map((c) => <li key={c}>{c}</li>)}</ul></div>
                <div><h3>Checks</h3><ul>{data.checks.map((c) => <li key={c}>{c}</li>)}</ul></div>
              </div>
            </div>
          ) : <p className="muted">Common causes and checks for this code exist as unsourced drafts. Turn on "Show unsourced drafts" to see them.</p>)}
        </article>
      )}
    </div>
  );
}
