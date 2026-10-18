import { useApi } from '../api.js';

export default function Drafts() {
  const { data, loading } = useApi('/kb/drafts');
  return (
    <div>
      <h1>Citation queue</h1>
      <p className="lede-sm">These entries are written but not yet backed by a source, so they stay hidden from regular view. Pick one you can check against a factory manual, a public-domain manual or another published reference. Add the citation and footnote each spec, and it goes live.</p>
      {loading && <p className="muted">Loading…</p>}
      {data && !data.length && <p>Queue's empty. Everything is cited.</p>}
      <ul className="queue">
        {data?.map((d) => (
          <li key={d.id}>
            <a href={'#/entry/' + d.id}>{d.title}</a>
            <span className="muted"> · {d.type}</span>
            <a className="btn small" href={'#/add?id=' + d.id}>Cite it</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
