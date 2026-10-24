import { Fragment, useState } from 'react';
import { Link, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { exportUrl, useFetch } from './api.js';

const when = t => t.replace('T', ' ');
const dash = v => v || '–';
const rowClass = r => (!r.pass_result ? 'none' : r.pass_result === 'OK' ? 'ok' : 'bad');
const devLink = r => `/device/${encodeURIComponent(r.serial_number || r.udid)}`;
const Err = ({ error }) => error && <div className="empty">Fehler: {error.message}</div>;

function Fields({ fields }) {
  return <dl>{fields.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{dash(v)}</dd></Fragment>)}</dl>;
}

function Table({ rows }) {
  if (!rows?.length) return <div className="empty">Keine Berichte gefunden. Setze <code>marmotReportServerURL</code> auf den Upload-Endpunkt oder lockere die Filter.</div>;
  return (
    <div className="scroll"><table>
      <thead><tr>{['Zeit (UTC)', 'Ergebnis', 'Seriennummer', 'Modell', 'OS', 'Build', 'Modus', 'SoC', 'UDID'].map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.id} className={rowClass(r)}>
          <td><Link to={`/submission/${r.id}`}>{when(r.received_at)}</Link></td>
          <td className={r.pass_result === 'OK' ? 'res-ok' : 'res-bad'}>{dash(r.pass_result)}</td>
          <td className="id">{r.serial_number || r.udid ? <Link to={devLink(r)}>{r.serial_number || r.udid}</Link> : '–'}</td>
          <td>{dash(r.model_number)}</td><td>{dash(r.os_version)}</td><td>{dash(r.build_version)}</td>
          <td>{dash(r.device_mode)}</td><td>{dash(r.soc)}</td><td className="id">{dash(r.udid)}</td>
        </tr>))}
      </tbody>
    </table></div>
  );
}

function Reports() {
  const [sp, setSp] = useSearchParams();
  const p = Object.fromEntries(sp);
  const { data, error } = useFetch('/submissions', p);
  const [q, setQ] = useState(p.q ?? '');
  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    if (k !== 'page') n.delete('page');
    setSp(n);
  };
  return (<>
    <form className="filters" onSubmit={e => { e.preventDefault(); set('q', q.trim()); }}>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Suche"
        placeholder="Seriennummer, UDID, ECID, IMEI, MAC suchen" />
      {data?.filters.map(f => (
        <select key={f.key} value={p[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} aria-label={f.label}>
          <option value="">{f.label}: alle</option>
          {f.options.map(o => <option key={o}>{o}</option>)}
        </select>))}
      <label>Von <input type="date" value={p.from ?? ''} onChange={e => set('from', e.target.value)} /></label>
      <label>Bis <input type="date" value={p.to ?? ''} onChange={e => set('to', e.target.value)} /></label>
      <button>Filtern</button>
      <button type="button" className="link" onClick={() => { setSp({}); setQ(''); }}>Zurücksetzen</button>
    </form>
    <Err error={error} />
    {data && (<>
      <p className="meta">{data.total} Berichte gefunden, {data.devices} Geräte insgesamt. Export:{' '}
        <a href={exportUrl('csv', p)}>CSV</a>, <a href={exportUrl('json', p)}>JSON</a></p>
      <Table rows={data.rows} />
      {data.pages > 1 && (
        <div className="pager">
          {data.page > 1 && <button className="link" onClick={() => set('page', data.page - 1)}>Zurück</button>}
          <span>Seite {data.page} von {data.pages}</span>
          {data.page < data.pages && <button className="link" onClick={() => set('page', data.page + 1)}>Weiter</button>}
        </div>)}
    </>)}
  </>);
}

function Devices() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const [text, setText] = useState(q);
  const { data, error } = useFetch('/devices', { q });
  return (<>
    <h1>Geräte</h1>
    <form className="filters" onSubmit={e => { e.preventDefault(); setSp(text.trim() ? { q: text.trim() } : {}); }}>
      <input type="search" value={text} onChange={e => setText(e.target.value)} aria-label="Suche"
        placeholder="Seriennummer, UDID, ECID, IMEI, MAC suchen" />
      <button>Suchen</button>
    </form>
    <Err error={error} />
    {data && (data.length ? (
      <div className="scroll"><table>
        <thead><tr>{['Gerät', 'Berichte', 'Davon OK', 'Zuletzt gesehen (UTC)', 'Letztes Ergebnis', 'Modell', 'OS', 'Name'].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{data.map(r => (
          <tr key={r.key} className={rowClass(r)}>
            <td className="id"><Link to={`/device/${encodeURIComponent(r.key)}`}>{r.key}</Link></td>
            <td>{r.n}</td><td>{r.ok ?? 0}</td><td>{when(r.last_seen)}</td>
            <td className={r.pass_result === 'OK' ? 'res-ok' : 'res-bad'}>{dash(r.pass_result)}</td>
            <td>{dash(r.model_number)}</td><td>{dash(r.os_version)}</td><td>{dash(r.device_name)}</td>
          </tr>))}
        </tbody>
      </table></div>
    ) : <div className="empty">Noch keine Geräte erfasst.</div>)}
  </>);
}

function Device() {
  const { key } = useParams();
  const { data, error } = useFetch('/device', { key });
  return (<>
    <h1>Gerät <span className="id">{key}</span></h1>
    <Err error={error} />
    {data && (<>
      <p className="meta">Werte aus dem letzten Bericht vom {when(data.last_seen)} UTC.</p>
      <Fields fields={data.fields} />
      <h1>Alle Berichte ({data.rows.length})</h1>
      <Table rows={data.rows} />
    </>)}
  </>);
}

function Submission() {
  const { id } = useParams();
  const { data: r, error } = useFetch(`/submissions/${id}`);
  return (<>
    <h1>Bericht {id}</h1>
    <Err error={error} />
    {r && (<>
      <Fields fields={[['Empfangen (UTC)', when(r.received_at)], ['Absender', r.remote_ip], ['Pfad', r.path]]} />
      <Fields fields={r.fields} />
      {(r.serial_number || r.udid) && <p><Link to={devLink(r)}>Alle Berichte dieses Geräts</Link></p>}
      <h1>Rohdaten</h1>
      <pre>{r.raw}</pre>
    </>)}
  </>);
}

export default function App() {
  return (<>
    <header>
      <Link className="brand" to="/">Marmot Reports</Link>
      <nav><NavLink to="/" end>Berichte</NavLink><NavLink to="/devices">Geräte</NavLink></nav>
    </header>
    <main>
      <Routes>
        <Route path="/" element={<Reports />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/device/:key" element={<Device />} />
        <Route path="/submission/:id" element={<Submission />} />
        <Route path="*" element={<div className="empty">Seite nicht gefunden.</div>} />
      </Routes>
    </main>
  </>);
}
