import { useRoute, usePref, useApi, useOffline } from './api.js';
import Home from './components/Home.jsx';
import Vehicle from './components/Vehicle.jsx';
import Entry from './components/Entry.jsx';
import Codes from './components/Codes.jsx';
import Search from './components/Search.jsx';
import Contribute from './components/Contribute.jsx';
import Drafts from './components/Drafts.jsx';

export default function App() {
  const { parts, query } = useRoute();
  const [drafts, setDrafts] = usePref('openbay.drafts', false);
  const config = useApi('/config').data;
  const offline = useOffline();
  const [page, ...rest] = parts;

  let body;
  if (page === 'v') body = <Vehicle year={rest[0]} make={rest[1]} model={rest[2] === '_' ? '' : rest[2]} vin={query.get('vin')} q={query.get('q') || ''} drafts={drafts} />;
  else if (page === 'entry') body = <Entry id={rest[0]} />;
  else if (page === 'codes') body = <Codes code={rest[0]} drafts={drafts} />;
  else if (page === 'search') body = <Search q={query.get('q') || ''} drafts={drafts} />;
  else if (page === 'add') body = <Contribute query={query} readOnly={config?.readOnly} repo={config?.repo} />;
  else if (page === 'drafts') body = <Drafts />;
  else body = <Home />;

  return (
    <>
      <header className="top">
        <a className="brand" href="#/">
          <span className="brand-mark">CM</span>
          <span className="brand-name">Common Manual</span>
        </a>
        <nav>
          <a href="#/">Vehicle</a>
          <a href="#/codes">Codes</a>
          <a href="#/search">Search</a>
          <a href="#/add">Add knowledge</a>
          <a href="#/drafts">Citation queue</a>
        </nav>
        <label className={'draft-toggle' + (drafts ? ' on' : '')} title="Unsourced drafts are hidden unless this is on">
          <input type="checkbox" checked={drafts} onChange={(e) => setDrafts(e.target.checked)} />
          Show unsourced drafts
        </label>
      </header>
      {offline && (
        <div className="offline-bar" role="status">
          Offline. Showing what this device has saved; anything you haven't opened here before won't load.
        </div>
      )}
      {config?.readOnly && (
        <div className="preview-bar">
          Public preview. Browse everything; to add knowledge, <a href={config.repo} target="_blank" rel="noreferrer">grab it on GitHub</a> and run it yourself.
        </div>
      )}
      <main>{body}</main>
      <footer className="foot">
        Free and open source. Facts only, every one footnoted. <a href="#/add">Add what you know</a>.
        <br />Started by Cj Racki · <a href="https://github.com/xsvdevelopment" target="_blank" rel="noreferrer">XSV Development</a>
      </footer>
    </>
  );
}
