import { useState } from 'react';
import { api, useApi, qs, vehicleHref } from '../api.js';

const THIS_YEAR = new Date().getFullYear() + 1;
const YEARS = Array.from({ length: THIS_YEAR - 1959 }, (_, i) => THIS_YEAR - i);
const COMMON = ['CHEVROLET', 'FORD', 'DODGE', 'RAM', 'GMC', 'TOYOTA', 'HONDA', 'NISSAN', 'JEEP', 'CHRYSLER', 'HYUNDAI', 'KIA', 'SUBARU', 'VOLKSWAGEN', 'BUICK', 'CADILLAC', 'PONTIAC', 'PLYMOUTH', 'OLDSMOBILE', 'LINCOLN', 'MERCURY', 'MAZDA', 'BMW', 'MERCEDES-BENZ'];

export default function Home() {
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [typed, setTyped] = useState('');
  const [vin, setVin] = useState('');
  const [vinErr, setVinErr] = useState('');
  const [vinBusy, setVinBusy] = useState(false);

  const makes = useApi(year ? `/makes?${qs({ year })}` : null);
  const models = useApi(year && make ? `/models?${qs({ year, make })}` : null);

  const allMakes = makes.data || [];
  const common = COMMON.filter((m) => allMakes.includes(m));
  const rest = allMakes.filter((m) => !common.includes(m));

  const open = (m) => { location.hash = vehicleHref(year, make, m).slice(1); };

  async function decode(e) {
    e.preventDefault();
    const v = vin.trim().toUpperCase();
    if (!v) return;
    setVinBusy(true); setVinErr('');
    try {
      const d = await api(`/vin/${encodeURIComponent(v)}`);
      if (d.preStandard) setVinErr(d.warning);
      else if (!d.year || !d.make) setVinErr(d.warning || 'NHTSA could not decode that VIN.');
      else location.hash = vehicleHref(d.year, d.make.toUpperCase(), '').slice(1) + '?' + qs({ vin: v });
    } catch (err) { setVinErr(err.message); }
    setVinBusy(false);
  }

  return (
    <div className="home">
      <section className="hero">
        <h1>Pull up the car.</h1>
        <p className="lede">Recalls, owner-reported failures, factory specs and shop-written repair knowledge, 1960 to now. Free, open, and every fact footnoted.</p>
      </section>

      <section className="panel">
        <h2>By VIN</h2>
        <form className="row" onSubmit={decode}>
          <input className="vin" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="17-character VIN (1981+)" maxLength={17} spellCheck={false} />
          <button className="btn primary" disabled={vinBusy}>{vinBusy ? 'Decoding…' : 'Decode'}</button>
        </form>
        {vinErr && <p className="warn">{vinErr}</p>}
      </section>

      <section className="panel">
        <h2>By year, make, model</h2>
        <div className="picker">
          <div className="col">
            <h3>Year</h3>
            <div className="chips years">
              {YEARS.map((y) => (
                <button key={y} className={'chip' + (String(y) === year ? ' sel' : '')} onClick={() => { setYear(String(y)); setMake(''); setModel(''); }}>{y}</button>
              ))}
            </div>
          </div>
          <div className="col">
            <h3>Make</h3>
            {!year && <p className="muted">Pick a year.</p>}
            {makes.loading && <p className="muted">Loading makes…</p>}
            {makes.error && <p className="warn">{makes.error.message}</p>}
            {year && !makes.loading && (
              <>
                <div className="chips">
                  {common.map((m) => <button key={m} className={'chip' + (m === make ? ' sel' : '')} onClick={() => { setMake(m); setModel(''); }}>{m}</button>)}
                </div>
                {rest.length > 0 && (
                  <select value={rest.includes(make) ? make : ''} onChange={(e) => { setMake(e.target.value); setModel(''); }}>
                    <option value="">Other makes ({rest.length})…</option>
                    {rest.map((m) => <option key={m}>{m}</option>)}
                  </select>
                )}
              </>
            )}
          </div>
          <div className="col">
            <h3>Model</h3>
            {!make && <p className="muted">Pick a make.</p>}
            {models.loading && <p className="muted">Loading models…</p>}
            {make && !models.loading && (
              <>
                <div className="chips">
                  {(models.data || []).map((m) => <button key={m} className={'chip' + (m === model ? ' sel' : '')} onClick={() => open(m)}>{m}</button>)}
                </div>
                <form className="row" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) open(typed.trim().toUpperCase()); }}>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Not listed? Type the model" />
                  <button className="btn">Go</button>
                </form>
                <button className="link" onClick={() => open('')}>Skip: show everything for {year} {make}</button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="panel split">
        <div>
          <h2>Trouble code</h2>
          <form className="row" onSubmit={(e) => { e.preventDefault(); const c = e.target.code.value.trim(); if (c) location.hash = '/codes/' + encodeURIComponent(c.toUpperCase()); }}>
            <input name="code" placeholder="P0420" maxLength={5} spellCheck={false} />
            <button className="btn">Look up</button>
          </form>
        </div>
        <div>
          <h2>Search the knowledge base</h2>
          <form className="row" onSubmit={(e) => { e.preventDefault(); location.hash = '/search?' + qs({ q: e.target.q.value }); }}>
            <input name="q" placeholder="firing order 302, cam phaser, bleed brakes…" />
            <button className="btn">Search</button>
          </form>
        </div>
      </section>
    </div>
  );
}
