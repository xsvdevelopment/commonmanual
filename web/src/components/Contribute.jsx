import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { STATUS } from './Entry.jsx';

const THIS_YEAR = new Date().getFullYear() + 1;
const blankSpec = { name: '', value: '', unit: '', note: '', src: '' };
const blankSrc = { title: '', publisher: '', citation: '', url: '' };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const refs = (s) => String(s).split(/[^0-9]+/).filter(Boolean).map(Number);

// A step line can end in footnotes like "Torque to spec [2]".
function parseStep(line) {
  const m = line.match(/^(.*?)\s*((?:\[\d+\])+)\s*$/);
  return m ? { text: m[1], src: refs(m[2]) } : line;
}
const stepLine = (s) => (typeof s === 'string' ? s : s.text + (s.src ? s.src.map((k) => `[${k}]`).join('') : ''));

function fromEntry(e) {
  return {
    id: e.id, type: e.type, title: e.title, summary: e.summary || '', status: e.status,
    applies: e.applies.map((a) => ({ make: a.make, models: (a.models || []).join(', '), from: a.years[0], to: a.years[1], engine: a.engine || '' })),
    specs: (e.specs || []).map((s) => ({ ...blankSpec, ...s, src: (s.src || []).join(',') })),
    steps: (e.steps || []).map(stepLine).join('\n'),
    tools: (e.tools || []).join('\n'), parts: (e.parts || []).join('\n'), warnings: (e.warnings || []).join('\n'),
    tags: (e.tags || []).join(', '), body: e.body || '',
    sources: e.sources.length ? e.sources.map((s) => ({ ...blankSrc, ...s })) : [{ ...blankSrc }],
    photos: (e.photos || []).map((p) => ({ ...p, step: p.step ?? '' })),
    author: e.author || '', verifiedBy: e.verifiedBy || '',
  };
}

// Shrink a phone photo to at most 1600px on the long side, re-encoded as JPEG.
async function shrink(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
}

function toEntry(f) {
  const e = {
    id: f.id || slug(f.title), type: f.type, title: f.title.trim(), status: f.status,
    applies: f.applies.map((a) => ({
      make: a.make.trim().toUpperCase() || '*', years: [Number(a.from), Number(a.to)],
      ...(lines(a.models.replace(/,/g, '\n')).length && { models: lines(a.models.replace(/,/g, '\n')).map((m) => m.toUpperCase()) }),
      ...(a.engine.trim() && { engine: a.engine.trim() }),
    })),
    sources: f.sources.filter((s) => s.title.trim()).map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => String(v).trim()))),
  };
  if (f.summary.trim()) e.summary = f.summary.trim();
  const specs = f.specs.filter((s) => s.name.trim()).map((s) => {
    const o = { name: s.name.trim(), value: s.value.trim() };
    if (s.unit.trim()) o.unit = s.unit.trim();
    if (s.note.trim()) o.note = s.note.trim();
    if (refs(s.src).length) o.src = refs(s.src);
    return o;
  });
  if (specs.length) e.specs = specs;
  if (lines(f.steps).length) e.steps = lines(f.steps).map(parseStep);
  for (const k of ['tools', 'parts', 'warnings']) if (lines(f[k]).length) e[k] = lines(f[k]);
  if (f.tags.trim()) e.tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);
  if (f.body.trim()) e.body = f.body.trim();
  if (f.author.trim()) e.author = f.author.trim();
  if (f.verifiedBy.trim()) e.verifiedBy = f.verifiedBy.trim();
  if (f.photos.length) {
    e.photos = f.photos.map((p) => ({
      file: p.file, caption: p.caption.trim(), credit: p.credit.trim(),
      ...(String(p.step).trim() && { step: Number(p.step) }),
    }));
  }
  return e;
}

function Photos({ f, setF, entryId }) {
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState('');
  const setP = (i, k) => (ev) => setF({ ...f, photos: f.photos.map((p, j) => (j === i ? { ...p, [k]: ev.target.value } : p)) });

  async function upload(ev) {
    const files = [...ev.target.files];
    ev.target.value = '';
    const added = [];
    for (const [n, file] of files.entries()) {
      setBusy(`Uploading ${n + 1} of ${files.length}…`);
      try {
        const blob = await shrink(file);
        const res = await fetch(`/api/media/${entryId}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error);
        added.push({ file: out.file, caption: '', credit: f.author, step: '' });
      } catch (err) { setBusy('Upload failed: ' + err.message); return; }
    }
    setF((cur) => ({ ...cur, photos: [...cur.photos, ...added] }));
    setBusy('');
  }

  return (
    <fieldset>
      <legend>Photos</legend>
      <p className="muted small">Your own photos only. Shots of the actual part, bolt locations, the gotcha. No screenshots from manuals or paid services.</p>
      <div className="photo-grid">
        {f.photos.map((p, i) => (
          <div key={p.file} className="photo-edit">
            <img src={'/' + p.file} alt={p.caption || 'uploaded photo'} />
            <input value={p.caption} onChange={setP(i, 'caption')} placeholder="Caption (what am I looking at?)" />
            <div className="row">
              <input value={p.credit} onChange={setP(i, 'credit')} placeholder="Photo by" />
              <input value={p.step} onChange={setP(i, 'step')} placeholder="Step #" className="srcbox" inputMode="numeric" />
            </div>
            <button type="button" className="link" onClick={() => setF({ ...f, photos: f.photos.filter((_, j) => j !== i) })}>remove</button>
          </div>
        ))}
      </div>
      {!entryId ? <p className="muted">Give the entry a title first.</p> : (
        <>
          <label className="check"><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /> I took these photos, and I release them under CC BY-SA 4.0 like the rest of OpenBay.</label>
          <label className={'btn' + (own ? '' : ' disabled')}>
            + Add photos
            <input type="file" accept="image/*" multiple hidden disabled={!own} onChange={upload} />
          </label>
          {busy && <span className="muted"> {busy}</span>}
        </>
      )}
    </fieldset>
  );
}

export default function Contribute({ query }) {
  const id = query.get('id');
  const [f, setF] = useState(() => ({
    id: '', type: 'procedure', title: '', summary: '', status: 'cited',
    applies: [{ make: query.get('make') || '', models: query.get('model') || '', from: query.get('year') || 1960, to: query.get('year') || THIS_YEAR - 1, engine: '' }],
    specs: [{ ...blankSpec }], steps: '', tools: '', parts: '', warnings: '', tags: '', body: '',
    sources: [{ ...blankSrc }], photos: [], author: '', verifiedBy: '',
  }));
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (id) api('/kb/' + encodeURIComponent(id)).then((e) => setF(fromEntry(e))).catch(() => {});
  }, [id]);

  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const setIn = (list, i, k) => (ev) => setF({ ...f, [list]: f[list].map((x, j) => (j === i ? { ...x, [k]: ev.target.value } : x)) });
  const add = (list, blank) => setF({ ...f, [list]: [...f[list], { ...blank }] });
  const del = (list, i) => setF({ ...f, [list]: f[list].filter((_, j) => j !== i) });

  async function submit(ev) {
    ev.preventDefault();
    try { setResult({ ok: await api(id ? '/kb' : '/kb?new=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toEntry(f)) }) }); }
    catch (err) { setResult({ errs: err.body?.errs || [err.message] }); }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  return (
    <form className="contribute" onSubmit={submit}>
      <h1>{id ? 'Improve entry' : 'Add knowledge'}</h1>
      <p className="lede-sm">Facts only. Every spec gets a footnote number pointing at a source below: a factory manual (with page), a public-domain manual, a TSB number, a parts maker's published spec. If you can't cite it yet, save it as a <strong>draft</strong>; it stays hidden until someone does.</p>

      <fieldset>
        <legend>What is it</legend>
        <div className="grid3">
          <label>Type<select value={f.type} onChange={set('type')}><option value="procedure">Procedure (how to do a job)</option><option value="spec">Specs (torque, capacities, gaps)</option><option value="known-issue">Known issue (pattern failure)</option><option value="source">Source (manual, reference)</option></select></label>
          <label>Status<select value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Your name or shop<input value={f.author} onChange={set('author')} placeholder="Skippy's Auto" /></label>
        </div>
        <label>Title<input value={f.title} onChange={set('title')} required placeholder="Water pump replacement, 5.3 Vortec" /></label>
        <label>One-line summary<input value={f.summary} onChange={set('summary')} /></label>
        {f.status === 'shop-verified' && <label>Verified by (shop name)<input value={f.verifiedBy} onChange={set('verifiedBy')} /></label>}
      </fieldset>

      <fieldset>
        <legend>Applies to</legend>
        {f.applies.map((a, i) => (
          <div key={i} className="grid5">
            <label>Make<input value={a.make} onChange={setIn('applies', i, 'make')} placeholder="CHEVROLET or * for any" /></label>
            <label>Models (comma list, blank = all)<input value={a.models} onChange={setIn('applies', i, 'models')} placeholder="SILVERADO, TAHOE" /></label>
            <label>From year<input type="number" value={a.from} onChange={setIn('applies', i, 'from')} /></label>
            <label>To year<input type="number" value={a.to} onChange={setIn('applies', i, 'to')} /></label>
            <label>Engine<input value={a.engine} onChange={setIn('applies', i, 'engine')} placeholder="5.3L V8" /></label>
            {f.applies.length > 1 && <button type="button" className="link" onClick={() => del('applies', i)}>remove</button>}
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => add('applies', { make: '', models: '', from: 1960, to: THIS_YEAR - 1, engine: '' })}>+ Another vehicle range</button>
      </fieldset>

      <fieldset>
        <legend>Sources (numbered: these are your footnotes)</legend>
        {f.sources.map((s, i) => (
          <div key={i} className="grid-src">
            <span className="src-num">[{i + 1}]</span>
            <label>Title<input value={s.title} onChange={setIn('sources', i, 'title')} placeholder="1972 Chevrolet Light Duty Truck Service Manual" /></label>
            <label>Publisher<input value={s.publisher} onChange={setIn('sources', i, 'publisher')} placeholder="Chevrolet Motor Division" /></label>
            <label>Page / section / TSB #<input value={s.citation} onChange={setIn('sources', i, 'citation')} placeholder="Sec. 6, p. 6-24" /></label>
            <label>Link<input value={s.url} onChange={setIn('sources', i, 'url')} placeholder="https://…" /></label>
            {f.sources.length > 1 && <button type="button" className="link" onClick={() => del('sources', i)}>remove</button>}
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => add('sources', blankSrc)}>+ Another source</button>
      </fieldset>

      <fieldset>
        <legend>Specs</legend>
        {f.specs.map((s, i) => (
          <div key={i} className="grid-spec">
            <input value={s.name} onChange={setIn('specs', i, 'name')} placeholder="Cylinder head bolts" />
            <input value={s.value} onChange={setIn('specs', i, 'value')} placeholder="65" />
            <input value={s.unit} onChange={setIn('specs', i, 'unit')} placeholder="ft-lb" />
            <input value={s.note} onChange={setIn('specs', i, 'note')} placeholder="note (sequence, oiled threads…)" />
            <input value={s.src} onChange={setIn('specs', i, 'src')} placeholder="src #" className="srcbox" />
            <button type="button" className="link" onClick={() => del('specs', i)}>×</button>
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => add('specs', blankSpec)}>+ Spec</button>
      </fieldset>

      <fieldset>
        <legend>The job</legend>
        <label>Steps, one per line. Every step needs a footnote: end the line with [1] (or [1][2]).<textarea rows={8} value={f.steps} onChange={set('steps')} /></label>
        <div className="grid3">
          <label>Tools (one per line)<textarea rows={4} value={f.tools} onChange={set('tools')} /></label>
          <label>Parts (one per line)<textarea rows={4} value={f.parts} onChange={set('parts')} /></label>
          <label>Warnings (one per line)<textarea rows={4} value={f.warnings} onChange={set('warnings')} /></label>
        </div>
        <label>Notes<textarea rows={4} value={f.body} onChange={set('body')} /></label>
        <label>Tags (comma list)<input value={f.tags} onChange={set('tags')} placeholder="water pump, cooling, vortec" /></label>
      </fieldset>

      <Photos f={f} setF={setF} entryId={f.id || slug(f.title)} />

      <button className="btn primary big">Save entry</button>

      {result?.errs && <div className="warn-box"><strong>Not saved. Fix these:</strong><ul>{result.errs.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {result?.ok && (
        <div className="ok-box">
          <strong>Saved to <code>data/kb/{result.ok.saved}</code>.</strong>
          <p>It's live in this copy of OpenBay now. To share it with every shop, commit that file and open a pull request on GitHub (see CONTRIBUTING.md).</p>
        </div>
      )}
    </form>
  );
}
