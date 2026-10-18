import { useState } from 'react';
import { useApi, qs } from '../api.js';

// "Listed by 3 independent datasets [1][2][4]". Datasets that copy one upstream count once.
function Corroboration({ src, lineages = src.length }) {
  const n = lineages;
  const label = n === 1
    ? (src.length > 1 ? `${src.length} datasets, likely one upstream` : 'Single source')
    : `Listed by ${n} independent datasets`;
  return (
    <span className={'corro ' + (n >= 3 ? 'strong' : n === 2 ? 'ok' : 'weak')} title={src.length > n ? 'Some of these datasets word most codes identically and likely copy the same upstream list, so they count once.' : undefined}>
      {label}
      <sup className="refs">{src.map((k) => <a key={k} href={`#code-src-${k}`} onClick={(e) => { e.preventDefault(); document.getElementById('code-src-' + k)?.scrollIntoView({ behavior: 'smooth' }); }}>[{k}]</a>)}</sup>
    </span>
  );
}

function Definitions({ list, sources }) {
  const [main, ...others] = list;
  return (
    <>
      <div className="def-main"><h2>{main.title}</h2><Corroboration src={main.src} lineages={main.lineages} /></div>
      {others.length > 0 && (
        <div className="def-others">
          <span className="badge amber">Other published wordings</span>
          <ul>{others.map((d) => <li key={d.title}>{d.title} <Corroboration src={d.src} lineages={d.lineages} /></li>)}</ul>
          <p className="muted small">Datasets disagree here. Sometimes SAE renamed the code between revisions, sometimes a dataset has an error. Trust the factory service info for the vehicle when it matters.</p>
        </div>
      )}
    </>
  );
}

export default function Codes({ code, drafts }) {
  const [input, setInput] = useState(code || '');
  const [query, setQuery] = useState('');
  const { data, loading } = useApi(code ? `/dtc/${encodeURIComponent(code)}` : null);
  const stats = useApi('/dtc');
  const found = useApi(query ? `/dtc?${qs({ q: query })}` : null);

  function submit(e) {
    e.preventDefault();
    const v = input.trim();
    if (/^[PBCU][0-9A-F]{4}$/i.test(v)) { setQuery(''); location.hash = '/codes/' + encodeURIComponent(v.toUpperCase()); }
    else setQuery(v);
  }

  return (
    <div className="codes">
      <h1>Trouble codes</h1>
      {stats.data && <p className="lede-sm">{stats.data.codes.toLocaleString()} codes: {stats.data.generic.toLocaleString()} generic, plus {stats.data.makeDefinitions.toLocaleString()} manufacturer-specific definitions across 30+ makes. Every definition shows which public datasets list it.</p>}
      <form className="row" onSubmit={submit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Code (P0420) or words (knock sensor, fuel pump relay…)" spellCheck={false} />
        <button className="btn primary">Look up</button>
      </form>

      {found.data && (
        <div className="panel code-results">
          <h3>{found.data.length >= 200 ? 'First 200 matches' : `${found.data.length} matches`} for "{query}"</h3>
          <table className="spec"><tbody>
            {found.data.map((r) => (
              <tr key={r.code}><th><a className="mono" href={'#/codes/' + r.code} onClick={() => setQuery('')}>{r.code}</a></th><td className="plain">{r.title}<span className="muted small"> · {r.scope === 'generic' ? 'generic' : r.scope}</span></td></tr>
            ))}
          </tbody></table>
        </div>
      )}

      {loading && <p className="muted">…</p>}
      {data && !data.valid && !query && <p className="warn">"{data.code}" isn't an OBD-II code. Format is a letter (P, B, C, U) and four characters, like P0301.</p>}
      {data?.valid && !query && (
        <article className="panel code-card">
          <div className="code-big">{data.code}</div>
          {data.definitions.length > 0 && <Definitions list={data.definitions} sources={data.sources} />}
          {!data.definitions.length && !data.makes.length && <h2>No published definition found yet</h2>}
          {!data.definitions.length && data.makes.length > 0 && <h2>Manufacturer-specific: depends on the make</h2>}

          <table className="spec"><tbody>{data.parts.map((p) => <tr key={p.label}><th>{p.label}</th><td>{p.value}</td></tr>)}</tbody></table>

          {data.makes.length > 0 && (
            <>
              <h3 className="sect">By manufacturer</h3>
              <table className="spec makes"><tbody>
                {data.makes.map((m) => (
                  <tr key={m.make}><th>{m.make}</th><td className="plain">{m.definitions.map((d) => <div key={d.title}>{d.title} <Corroboration src={d.src} lineages={d.lineages} /></div>)}</td></tr>
                ))}
              </tbody></table>
            </>
          )}

          {data.draft && (drafts ? (
            <div className="draft-block">
              <span className="badge red">Draft: needs citation</span>
              <div className="split">
                <div><h3>Common causes</h3><ul>{data.draft.causes.map((c) => <li key={c}>{c}</li>)}</ul></div>
                <div><h3>Checks</h3><ul>{data.draft.checks.map((c) => <li key={c}>{c}</li>)}</ul></div>
              </div>
            </div>
          ) : <p className="muted">Common causes and checks for this code exist as unsourced drafts. Turn on "Show unsourced drafts" to see them.</p>)}

          <h3 className="sect">Sources</h3>
          <ol className="sources">
            {data.sources.map((s, i) => (
              <li key={s.url} id={'code-src-' + (i + 1)}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> <span className="muted">· {s.license} · version {s.version} · {s.definitions.toLocaleString()} definitions</span></li>
            ))}
          </ol>
          <p className="muted small">Code structure (generic vs manufacturer, system, area) per <a href={data.structureSource.url} target="_blank" rel="noreferrer">{data.structureSource.title}</a>. None of the datasets documents its own upstream source; corroboration across independent datasets is the strength signal.</p>
        </article>
      )}
    </div>
  );
}
