import { useEffect, useMemo, useState } from 'react';
import { api, useApi, qs, vehicleHref } from '../api.js';
import { EntryCard, SourceNote } from './Entry.jsx';

const TABS = [
  ['diagnose', 'Diagnose'], ['knowledge', 'Shop knowledge'], ['bulletins', 'TSBs'], ['problems', 'Known problems'], ['recalls', 'Recalls'],
  ['specs', 'Vehicle specs'], ['factory', 'Factory info'], ['jobs', 'Job lookup'],
];
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export default function Vehicle({ year, make, model, vin, q, drafts }) {
  const [tab, setTab] = useState('diagnose');
  const decoded = useApi(vin ? `/vin/${encodeURIComponent(vin)}` : null);
  const models = useApi(!model ? `/models?${qs({ year, make })}` : null);

  // After a VIN decode, narrow NHTSA's model list to the decoded model and auto-pick a lone match.
  const vinModel = decoded.data?.model;
  const choices = useMemo(() => {
    const all = models.data || [];
    if (!vinModel) return all;
    const hit = all.filter((m) => norm(m).startsWith(norm(vinModel)));
    return hit.length ? hit : all;
  }, [models.data, vinModel]);
  useEffect(() => {
    if (!model && vinModel && choices.length === 1) location.replace(vehicleHref(year, make, choices[0]) + '?' + qs({ vin }));
  }, [model, vinModel, choices]);

  return (
    <div className="vehicle">
      <div className="vhead">
        <div className="vtitle">
          <span className="vyear">{year}</span>
          <h1>{make} {model || <em className="muted">all models</em>}</h1>
          {vin && <code className="vinchip">{vin}</code>}
        </div>
        <a className="btn" href={`#/add?${qs({ year, make, model })}`}>+ Add knowledge for this vehicle</a>
      </div>

      {!model && (
        <div className="panel">
          <h3>{vinModel ? `VIN says ${vinModel}. Which one matches NHTSA's listing?` : 'Pick a model for recalls and owner complaints'}</h3>
          <div className="chips">
            {choices.map((m) => <a key={m} className="chip" href={vehicleHref(year, make, m) + (vin ? '?' + qs({ vin }) : '')}>{m}</a>)}
          </div>
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'diagnose' && (model ? <Diagnose year={year} make={make} model={model} vin={vin} q={q} /> : <NeedModel />)}
      {tab === 'knowledge' && <Knowledge year={year} make={make} model={model} drafts={drafts} />}
      {tab === 'bulletins' && (model ? <Bulletins year={year} make={make} model={model} /> : <NeedModel />)}
      {tab === 'problems' && (model ? <Problems year={year} make={make} model={model} /> : <NeedModel />)}
      {tab === 'recalls' && (model ? <Recalls year={year} make={make} model={model} /> : <NeedModel />)}
      {tab === 'specs' && <Specs year={year} make={make} model={model} decoded={decoded.data} />}
      {tab === 'factory' && <Factory make={make} />}
      {tab === 'jobs' && <Jobs year={year} make={make} model={model} />}
    </div>
  );
}

const NeedModel = () => <p className="muted panel">Pick a model above to load this.</p>;
const Loading = ({ what }) => <p className="muted">Loading {what}…</p>;
const Err = ({ e }) => <p className="warn">Couldn't load: {e.message}. If you're offline, anything viewed before is still cached.</p>;

function Knowledge({ year, make, model, drafts }) {
  const { data, error, loading } = useApi(`/kb?${qs({ year, make, model, drafts: drafts ? 1 : '' })}`);
  if (loading) return <Loading what="knowledge base" />;
  if (error) return <Err e={error} />;
  const specific = data.filter((e) => !e.generic);
  const generic = data.filter((e) => e.generic);
  return (
    <div>
      {!data.length && (
        <div className="empty">
          <p><strong>No cited entries for this vehicle yet.</strong></p>
          <p>Know something about it? <a href={`#/add?${qs({ year, make, model })}`}>Add it with a source</a>. {!drafts && 'Unsourced drafts are hidden; switch them on at the top to see the citation queue.'}</p>
        </div>
      )}
      {specific.length > 0 && <><h3 className="sect">For this vehicle</h3><div className="cards">{specific.map((e) => <EntryCard key={e.id} e={e} />)}</div></>}
      {generic.length > 0 && <><h3 className="sect">General procedures that apply</h3><div className="cards">{generic.map((e) => <EntryCard key={e.id} e={e} />)}</div></>}
    </div>
  );
}

function Problems({ year, make, model }) {
  const { data, error, loading } = useApi(`/vehicle/complaints?${qs({ year, make, model })}`);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('');
  if (loading) return <Loading what="owner complaints" />;
  if (error) return <Err e={error} />;
  const f = filter.toLowerCase();
  const max = data.byComponent[0]?.count || 1;
  return (
    <div>
      <p className="lede-sm"><strong>{data.total.toLocaleString()}</strong> owner complaints filed with NHTSA, grouped by component. The longest bars are this vehicle's pattern failures.</p>
      <input className="filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter complaint text (rattle, stall, leak…)" />
      <div className="bars">
        {data.byComponent.map((g) => {
          const reports = f ? g.reports.filter((r) => r.summary?.toLowerCase().includes(f)) : g.reports;
          if (f && !reports.length) return null;
          return (
            <div key={g.component} className="bar-row">
              <button className="bar" onClick={() => setOpen(open === g.component ? null : g.component)}>
                <span className="bar-label">{g.component}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(g.count / max) * 100}%` }} /></span>
                <span className="bar-n">{g.count}{g.crashes ? ` · ${g.crashes} crash` : ''}{g.fires ? ` · ${g.fires} fire` : ''}</span>
              </button>
              {open === g.component && (
                <ul className="reports">
                  {reports.map((r) => <li key={r.id}><span className="muted mono">{r.filed} · ODI {r.id}</span><p>{r.summary}</p></li>)}
                  {g.count > g.reports.length && <li className="muted">Showing the {g.reports.length} most recent of {g.count}.</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <SourceNote sources={[{ title: 'NHTSA Office of Defects Investigation, consumer complaints database', url: 'https://www.nhtsa.gov/recalls' }]} note="Owner reports, not verified diagnoses. Repeat reports show patterns." />
    </div>
  );
}

function Diagnose({ year, make, model, vin, q }) {
  const [input, setInput] = useState(q);
  useEffect(() => setInput(q), [q]);
  const { data, error, loading } = useApi(q ? `/diagnose?${qs({ year, make, model, q })}` : null);
  const submit = (e) => {
    e.preventDefault();
    if (input.trim()) location.hash = vehicleHref(year, make, model).slice(1) + '?' + qs({ vin, q: input.trim() });
  };

  return (
    <div className="diagnose">
      <form className="row" onSubmit={submit}>
        <input className="big-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="What's it doing? (rattles on cold start, P0016, stalls when warm, shudders at 40…)" autoFocus={!q} />
        <button className="btn primary">Search</button>
      </form>
      <p className="muted small">Searches every factory bulletin, recall, investigation, owner report and cited OpenBay entry for this vehicle. It finds documented records; it doesn't guess. Confirm with testing before replacing parts.</p>

      {loading && <Loading what={`every record for this ${model}`} />}
      {error && <Err e={error} />}
      {data && (
        <>
          <div className="understood">
            <span className="muted">Searched {data.counts.tsbs.toLocaleString()} bulletins, {data.counts.complaints.toLocaleString()} owner reports and {data.counts.recalls} recalls{data.vehicle.searched.length > 1 ? ` across ${data.vehicle.searched.join(', ')}` : ''} for:</span>
            {data.understood.codes.map((c) => <span key={c} className="chip sel">{c}</span>)}
            {data.understood.concepts.map((c) => <span key={c} className="chip">{c}</span>)}
          </div>

          {data.codes.filter((c) => c.valid).map((c) => (
            <a key={c.code} className="card link-card code-hit" href={'#/codes/' + c.code}>
              <span className="badge">Trouble code</span>
              <h4><span className="mono">{c.code}</span> {c.definitions[0]?.title || (c.makes.find((m) => m.make === make)?.definitions[0]?.title) || 'Manufacturer-specific code'}</h4>
            </a>
          ))}

          {data.knowledge.length > 0 && <><h3 className="sect">OpenBay knowledge</h3><div className="cards">{data.knowledge.map((e) => <EntryCard key={e.id} e={e} />)}</div></>}

          <h3 className="sect">Factory bulletins ({data.tsbs.length})</h3>
          {!data.tsbs.length && <p className="muted">No matching bulletins. Try other words for the symptom, or check the TSBs tab.</p>}
          <div className="recalls">
            {data.tsbs.map((t) => (
              <article key={t.id} className="recall tsb">
                <header><code>{t.number || 'Bulletin'}</code><span className="muted">{t.date}</span>{t.components.map((c) => <span key={c} className="badge">{c}</span>)}</header>
                <p>{t.summary}</p>
                {t.docs > 0 && <DocLinks kind="tsb" id={t.id} />}
              </article>
            ))}
          </div>

          {data.recalls.length > 0 && (
            <><h3 className="sect">Recalls</h3><div className="recalls">{data.recalls.map((r) => (
              <article key={r.campaign} className={'recall' + (r.parkIt ? ' park' : '')}>
                <header><code>{r.campaign}</code><span className="muted">{r.date}</span>{r.parkIt && <span className="badge red">PARK IT</span>}</header>
                <h4>{r.component}</h4><p>{r.summary}</p>{r.remedy && <p><strong>Remedy:</strong> {r.remedy}</p>}
              </article>
            ))}</div></>
          )}

          {data.investigations.length > 0 && (
            <><h3 className="sect">NHTSA investigations</h3><div className="recalls">{data.investigations.map((i) => (
              <article key={i.id} className="recall"><header><code>{i.id}</code><span className="muted">opened {i.opened}</span></header><h4>{i.subject}</h4><p>{i.summary}</p></article>
            ))}</div></>
          )}

          <h3 className="sect">Other owners ({data.owners.matched.toLocaleString()} of {data.owners.total.toLocaleString()} reports match)</h3>
          {data.owners.matched > 0 ? (
            <ul className="reports">{data.owners.examples.map((r) => <li key={r.id}><span className="muted mono">{r.filed} · ODI {r.id} · {r.components}</span><p>{r.summary}</p></li>)}</ul>
          ) : <p className="muted">No owner reports match.</p>}

          <SourceNote sources={[{ title: 'NHTSA bulletins, recalls, investigations and complaints', url: 'https://www.nhtsa.gov/recalls' }, { title: 'OpenBay knowledge base (cited entries)' }]} note="Owner reports are unverified; a large number describing the same thing shows a pattern." />
        </>
      )}
    </div>
  );
}

// Fetches a bulletin's PDF links on demand; most bulletins have one document.
function DocLinks({ kind, id }) {
  const [state, setState] = useState(null);
  if (!state) return <button className="btn small" onClick={() => { setState('loading'); api(`/bulletin-docs/${kind}/${encodeURIComponent(id)}`).then(setState).catch(() => setState([])); }}>Show documents</button>;
  if (state === 'loading') return <span className="muted">Loading…</span>;
  if (!state.length) return <span className="muted">No documents on file.</span>;
  return <span className="doclinks">{state.map((d) => <a key={d.url} className="btn small primary" href={d.url} target="_blank" rel="noreferrer">{d.label || 'Document'} (PDF)</a>)}</span>;
}

function Bulletins({ year, make, model }) {
  const { data, error, loading } = useApi(`/vehicle/bulletins?${qs({ year, make, model })}`);
  const [filter, setFilter] = useState('');
  const [comp, setComp] = useState('');
  const [limit, setLimit] = useState(60);
  if (loading) return <Loading what="service bulletins" />;
  if (error) return <Err e={error} />;
  const f = filter.toLowerCase();
  const comps = [...new Set(data.tsbs.flatMap((t) => t.components))].sort();
  const shown = data.tsbs.filter((t) => (!comp || t.components.includes(comp)) && (!f || `${t.number} ${t.summary}`.toLowerCase().includes(f)));
  return (
    <div>
      <p className="lede-sm"><strong>{data.tsbs.length}</strong> manufacturer bulletins (TSBs, special service messages, dealer communications) filed with NHTSA for this vehicle. Most link to the full factory document.</p>
      <div className="row filters">
        <input className="filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search bulletins (phaser, P0016, shudder, leak…)" />
        <select value={comp} onChange={(e) => setComp(e.target.value)}><option value="">All components</option>{comps.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <div className="recalls">
        {shown.length > 0 && (f || comp) && <p className="muted">{shown.length} match{shown.length === 1 ? '' : 'es'}</p>}
        {shown.slice(0, limit).map((t) => (
          <article key={t.id} className="recall tsb">
            <header><code>{t.number || 'Bulletin'}</code><span className="muted">{t.date}</span>{t.components.map((c) => <span key={c} className="badge">{c}</span>)}</header>
            <p>{t.summary}</p>
            {t.docs > 0 && <DocLinks kind="tsb" id={t.id} />}
          </article>
        ))}
        {!shown.length && <p className="muted">No bulletins match.</p>}
        {shown.length > limit && <button className="btn" onClick={() => setLimit(limit + 60)}>Show more ({shown.length - limit} left)</button>}
      </div>
      {data.investigations.length > 0 && (
        <>
          <h3 className="sect">NHTSA defect investigations</h3>
          <div className="recalls">
            {data.investigations.map((i) => (
              <article key={i.id} className="recall">
                <header><code>{i.id}</code><span className="muted">opened {i.opened}{i.closed ? ` · closed ${i.closed}` : ' · open'}</span>{i.recalls.map((r) => <span key={r} className="badge amber">Recall {r}</span>)}</header>
                <h4>{i.subject}</h4>
                <p>{i.summary}</p>
                <DocLinks kind="investigation" id={i.id} />
              </article>
            ))}
          </div>
        </>
      )}
      <SourceNote sources={[{ title: 'NHTSA manufacturer communications and defect investigations', url: 'https://www.nhtsa.gov/recalls' }]} note="Bulletin documents are the manufacturers' own, published by NHTSA under federal law." />
    </div>
  );
}

function Recalls({ year, make, model }) {
  const { data, error, loading } = useApi(`/vehicle/recalls?${qs({ year, make, model })}`);
  if (loading) return <Loading what="recalls" />;
  if (error) return <Err e={error} />;
  return (
    <div>
      {!data.length && <p className="muted">No recalls on file for this exact model name. Try a sibling listing (cab style, trim) from the model chips.</p>}
      <div className="recalls">
        {data.map((r) => (
          <article key={r.campaign} className={'recall' + (r.parkIt ? ' park' : '')}>
            <header><code>{r.campaign}</code><span className="muted">{r.date}</span>{r.parkIt && <span className="badge red">PARK IT: do not drive</span>}</header>
            <h4>{r.component}</h4>
            <p>{r.summary}</p>
            {r.consequence && <p><strong>Risk:</strong> {r.consequence}</p>}
            {r.remedy && <p><strong>Remedy:</strong> {r.remedy}</p>}
          </article>
        ))}
      </div>
      <SourceNote sources={[{ title: 'NHTSA recalls database', url: 'https://www.nhtsa.gov/recalls' }]} note="Recall repairs are free at the dealer. Check a specific VIN at nhtsa.gov/recalls." />
    </div>
  );
}

function Specs({ year, make, model, decoded }) {
  const cands = useApi(model ? `/vehicle/epa?${qs({ year, make, model })}` : null);
  const [pick, setPick] = useState('');
  const det = useApi(pick ? `/epa/${pick}` : null);
  return (
    <div className="specs-tab">
      {decoded && (
        <section className="panel">
          <h3>Decoded from VIN {decoded.vin}</h3>
          {decoded.warning && <p className="warn">{decoded.warning}</p>}
          <SpecTable rows={decoded.fields} />
          <SourceNote sources={[{ title: 'NHTSA vPIC VIN decoder', url: 'https://vpic.nhtsa.dot.gov/decoder/' }]} />
        </section>
      )}
      <section className="panel">
        <h3>Engine and drivetrain configurations</h3>
        {Number(year) < 1984 && <p className="muted">EPA configuration data starts with 1984. For older vehicles, check the shop knowledge tab and factory info.</p>}
        {!model && Number(year) >= 1984 && <p className="muted">Pick a model first.</p>}
        {cands.loading && <Loading what="EPA configurations" />}
        {cands.error && <Err e={cands.error} />}
        {cands.data && !cands.data.length && Number(year) >= 1984 && <p className="muted">No EPA match for this model name. Light-duty vehicles only; heavy-duty trucks over 8,500 lb GVWR aren't in EPA's data.</p>}
        {cands.data?.length > 0 && (
          <div className="chips">
            {cands.data.map((c) => <button key={c.id} className={'chip' + (pick === c.id ? ' sel' : '')} onClick={() => setPick(c.id)}><strong>{c.epaModel}</strong> {c.config}</button>)}
          </div>
        )}
        {det.data && <SpecTable rows={det.data.fields} />}
        {(cands.data?.length > 0) && <SourceNote sources={[{ title: 'US EPA / DOE fueleconomy.gov vehicle data', url: 'https://www.fueleconomy.gov/feg/ws/' }]} />}
      </section>
    </div>
  );
}

const SpecTable = ({ rows }) => (
  <table className="spec"><tbody>{rows.map((r) => <tr key={r.label}><th>{r.label}</th><td>{r.value}</td></tr>)}</tbody></table>
);

function Factory({ make }) {
  const { data, loading } = useApi(`/oem?${qs({ make })}`);
  if (loading || !data) return <Loading what="factory sources" />;
  return (
    <div>
      <p className="lede-sm">{data.note}</p>
      <div className="cards">
        {data.sites.map((s) => <a key={s.url} className="card link-card" href={s.url} target="_blank" rel="noreferrer"><span className="badge">Factory</span><h4>{s.name}</h4><span className="muted mono">{s.url.replace('https://', '')}</span></a>)}
        <a className="card link-card" href={data.directory.url} target="_blank" rel="noreferrer"><span className="badge">Directory</span><h4>{data.directory.title}</h4></a>
        {data.publicDomain.map((p) => <a key={p.url} className="card link-card" href={p.url} target="_blank" rel="noreferrer"><span className="badge green">Public domain</span><h4>{p.title}</h4><p>{p.detail}</p></a>)}
      </div>
      {!data.sites.length && <p className="muted">No factory site listed for {make} yet. NASTF's directory covers every automaker.</p>}
    </div>
  );
}

function Jobs({ year, make, model }) {
  const [job, setJob] = useState('');
  const v = [year, make, model].filter(Boolean).join(' ').toLowerCase();
  const term = `${v} ${job}`.trim();
  const enc = encodeURIComponent;
  const links = [
    ['Video walkthroughs', `https://www.youtube.com/results?search_query=${enc(term)}`],
    ['Forum threads', `https://www.google.com/search?q=${enc(term + ' forum')}`],
    ['Torque specs (search)', `https://www.google.com/search?q=${enc(term + ' torque specs')}`],
    ['Reddit r/MechanicAdvice', `https://www.reddit.com/r/MechanicAdvice/search/?q=${enc(term)}`],
    ['Public-domain manuals (Internet Archive)', `https://archive.org/search?query=${enc(`${year} ${make} ${model || ''} service manual`)}`],
  ];
  return (
    <div className="panel">
      <p className="lede-sm">Search outside sources for this job. These are leads, not facts: anything you confirm, bring back and add it with its source.</p>
      <input className="filter" value={job} onChange={(e) => setJob(e.target.value)} placeholder="What's the job? (water pump, cam phaser, blend door…)" />
      <div className="cards">
        {links.map(([label, href]) => <a key={label} className="card link-card" href={href} target="_blank" rel="noreferrer"><h4>{label}</h4><span className="muted">{term}</span></a>)}
      </div>
    </div>
  );
}
