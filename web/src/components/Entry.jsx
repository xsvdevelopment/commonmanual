import { useApi } from '../api.js';

const TYPE_LABEL = { procedure: 'Procedure', spec: 'Specs', 'known-issue': 'Known issue', source: 'Source' };
export const STATUS = {
  draft: ['Draft: needs citation', 'red'],
  cited: ['Cited', 'amber'],
  'shop-verified': ['Shop-verified', 'green'],
  'factory-sourced': ['Factory-sourced', 'green'],
};

export const StatusBadge = ({ s }) => <span className={'badge ' + STATUS[s][1]}>{STATUS[s][0]}</span>;

const appliesText = (a) =>
  `${a.years[0]}–${a.years[1]} ${a.make === '*' ? 'most makes' : a.make}${a.models?.length ? ' ' + a.models.join(', ') : ''}${a.exclude?.length ? ' (not ' + a.exclude.join(', ') + ')' : ''}${a.engine ? ' · ' + a.engine : ''}`;

export function EntryCard({ e }) {
  return (
    <a className={'card entry-card' + (e.status === 'draft' ? ' is-draft' : '')} href={'#/entry/' + e.id}>
      <div className="badges"><span className="badge">{TYPE_LABEL[e.type]}</span><StatusBadge s={e.status} /></div>
      <h4>{e.title}</h4>
      {e.summary && <p>{e.summary}</p>}
      {e.applies.some((a) => a.engine) && <p className="muted mono small">{[...new Set(e.applies.map((a) => a.engine).filter(Boolean))].join(' / ')}</p>}
    </a>
  );
}

// Footnote refs: [1][2] linking to the numbered source list.
const Refs = ({ src }) =>
  src?.length ? <sup className="refs">{src.map((k) => <a key={k} href={`#src-${k}`} onClick={(ev) => { ev.preventDefault(); document.getElementById('src-' + k)?.scrollIntoView({ behavior: 'smooth' }); }}>[{k}]</a>)}</sup> : null;

export function SourceNote({ sources, note }) {
  return (
    <div className="source-note">
      <span className="src-label">Source</span>
      {sources.map((s) => (s.url ? <a key={s.title} href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : <span key={s.title}>{s.title}</span>))}
      {note && <span className="muted"> · {note}</span>}
    </div>
  );
}

// "4:32" -> seconds, for a link that opens the video at that moment.
const secs = (t) => t.split(':').reduce((a, b) => a * 60 + Number(b), 0);
export function videoLink(url, t) {
  const u = new URL(url);
  u.searchParams.set('t', `${secs(t)}s`);
  return u.toString();
}
function VideoAt({ sources, src, t }) {
  const v = (src || []).map((k) => sources[k - 1]).find((s) => s?.type === 'video');
  return v ? <a className="video-at" href={videoLink(v.url, t)} target="_blank" rel="noreferrer">▶ {t} · {v.creator}</a> : null;
}

const Photo = ({ p }) => (
  <figure className="photo">
    <a href={'/' + p.file} target="_blank" rel="noreferrer"><img src={'/' + p.file} alt={p.caption} loading="lazy" /></a>
    <figcaption>{p.caption} <span className="muted">· Photo: {p.credit}</span></figcaption>
  </figure>
);

export default function Entry({ id }) {
  const { data: e, error, loading } = useApi(`/kb/${encodeURIComponent(id)}`);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="warn">{error.message}</p>;
  const step = (s) => (typeof s === 'string' ? { text: s } : s);
  const photos = e.photos || [];

  return (
    <article className="entry">
      <div className="badges"><span className="badge">{TYPE_LABEL[e.type]}</span><StatusBadge s={e.status} /></div>
      <h1>{e.title}</h1>
      {e.status === 'draft' && (
        <div className="draft-banner">
          <strong>Unsourced draft.</strong> Nothing here is backed by a citation yet, so don't torque anything off it. Verify against a factory manual, then <a href={'#/add?id=' + e.id}>add the source</a> to promote it.
        </div>
      )}
      {e.summary && <p className="lede-sm">{e.summary}</p>}
      <ul className="applies">{e.applies.map((a, i) => <li key={i}>{appliesText(a)}</li>)}</ul>

      {e.warnings?.length > 0 && <div className="warnings">{e.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}</div>}

      {e.specs?.length > 0 && (
        <table className="spec big">
          <tbody>{e.specs.map((s, i) => (
            <tr key={i}><th>{s.name}</th><td><span className="val">{s.value}</span>{s.unit && <span className="unit"> {s.unit}</span>}<Refs src={s.src} />{s.note && <div className="note">{s.note}</div>}</td></tr>
          ))}</tbody>
        </table>
      )}

      {(e.tools?.length > 0 || e.parts?.length > 0) && (
        <div className="split">
          {e.tools?.length > 0 && <div><h3>Tools</h3><ul>{e.tools.map((t) => <li key={t}>{t}</li>)}</ul></div>}
          {e.parts?.length > 0 && <div><h3>Parts</h3><ul>{e.parts.map((t) => <li key={t}>{t}</li>)}</ul></div>}
        </div>
      )}

      {e.steps?.length > 0 && (
        <><h3>Steps</h3><ol className="steps">{e.steps.map(step).map((s, i) => (
          <li key={i}>
            {s.text}<Refs src={s.src} />
            {s.t && <VideoAt sources={e.sources} src={s.src} t={s.t} />}
            {s.warning && <p className="step-warn">⚠ {s.warning}</p>}
            {photos.filter((p) => p.step === i + 1).map((p) => <Photo key={p.file} p={p} />)}
          </li>
        ))}</ol></>
      )}

      {photos.some((p) => !p.step) && <><h3>Photos</h3><div className="photo-grid">{photos.filter((p) => !p.step).map((p) => <Photo key={p.file} p={p} />)}</div></>}

      {e.body && <div className="body">{e.body.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>}

      <h3>Sources</h3>
      {e.sources.length ? (
        <ol className="sources">
          {e.sources.map((s, i) => (
            <li key={i} id={'src-' + (i + 1)}>
              {s.type === 'video' && <span className="badge">▶ Video</span>}{' '}
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}
              {s.creator && <span className="muted">, by {s.creator}</span>}
              {s.publisher && <span className="muted">, {s.publisher}</span>}
              {s.citation && <span className="muted">, {s.citation}</span>}
            </li>
          ))}
        </ol>
      ) : <p className="warn">No sources yet.</p>}

      <p className="meta muted">
        {e.author && <>By {e.author}. </>}{e.verifiedBy && <>Verified by {e.verifiedBy}. </>}{e.updated && <>Updated {e.updated}. </>}
        File: <code>data/kb/{e.file}</code> · <a href={'#/add?id=' + e.id}>Improve this entry</a>
      </p>
    </article>
  );
}
