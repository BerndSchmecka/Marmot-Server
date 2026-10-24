// Marmot-Report-Server. Umgebungsvariablen (alle optional):
//   PORT=8080  HOST=127.0.0.1  BASE_PATH=marmot  INGEST_PATH=tools/reportDEVICE.php
//   MARMOT_DB=data/marmot.db  TRUST_PROXY=loopback  UI_USER / UI_PASS (Basic Auth, nie für den Upload)
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import busboy from 'busboy';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const trim = s => s.replace(/^\/+|\/+$/g, '');
const baseSeg = trim(process.env.BASE_PATH ?? 'marmot');
const BASE = baseSeg ? '/' + baseSeg : '';
const INGEST = `${BASE}/${trim(process.env.INGEST_PATH ?? 'tools/reportDEVICE.php')}`;
const PORT = +process.env.PORT || 8080, HOST = process.env.HOST || '127.0.0.1';
const PER_PAGE = 50, MAX_BODY = 256 * 1024;
const { UI_USER, UI_PASS } = process.env;

// Felder aus dem -F-Template des Tools
const FIELDS = ['PASS', 'SERIAL_NUMBER', 'MLB_SERIAL_NUMBER', 'MODEL_NUMBER', 'REGION_CODE', 'DEVICE_MODE',
  'NAND_SIZE', 'SYSTEM_PARTITION_SIZE', 'OS_VERSION', 'BUILD_VERSION', 'DEMO_BUNDLE', 'UDID', 'ECID', 'IMEI',
  'IMEI2', 'ICCID', 'SIM_STATUS', 'DEVICE_NAME', 'LOCALE', 'LANGUAGE', 'BASEBAND_VERSION',
  'BASEBAND_BOOTLOADER_VERSION', 'WIFI_ADDRESS', 'BT_ADDRESS', 'APP_NAME', 'APP_VERSION', 'RULE_VERSION', 'SOC',
  'BB_SERIAL_NUMBER', 'BB_GOLD_CERT_ID', 'BATTERY_CHARGE_LEVEL'];
const COL = Object.fromEntries(FIELDS.map(f => [f, f === 'PASS' ? 'pass_result' : f.toLowerCase()]));
const COLS = [...Object.values(COL), 'ecid_hex', 'ecid_dec'];
const EXPORT_COLS = ['id', 'received_at', 'remote_ip', ...COLS];
const SEARCH = ['serial_number', 'mlb_serial_number', 'udid', 'ecid', 'ecid_hex', 'ecid_dec', 'imei', 'imei2',
  'iccid', 'wifi_address', 'bt_address', 'bb_serial_number', 'device_name'];
const FILTERS = [['pass_result', 'Ergebnis'], ['os_version', 'OS'], ['build_version', 'Build'],
['device_mode', 'Modus'], ['soc', 'SoC'], ['model_number', 'Modell']];

const DB_PATH = process.env.MARMOT_DB ?? path.resolve('data/marmot.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL, remote_ip TEXT, path TEXT, raw TEXT,
  ${COLS.map(c => c + ' TEXT').join(', ')});
  CREATE INDEX IF NOT EXISTS i_serial ON submissions(serial_number);
  CREATE INDEX IF NOT EXISTS i_udid ON submissions(udid);
  CREATE INDEX IF NOT EXISTS i_time ON submissions(received_at);`);
const rows = (sql, ...a) => db.prepare(sql).all(...a);
const insertCols = ['received_at', 'remote_ip', 'path', 'raw', ...COLS];
const insert = db.prepare(`INSERT INTO submissions (${insertCols}) VALUES (${insertCols.map(c => '@' + c)})`);

const normalize = (f, v) => {
  v = (v ?? '').trim();
  if (!v) return null;
  if (f === 'IMEI' || f === 'IMEI2') return v.replace(/\s+/g, '');
  if (f === 'WIFI_ADDRESS' || f === 'BT_ADDRESS') return v.toLowerCase();
  return v;
};
const parseForm = (buf, headers) => new Promise(resolve => {
  const fields = {};
  try {
    const bb = busboy({ headers, limits: { fields: 200, files: 0 } });
    bb.on('field', (n, v) => { fields[n] = v; });
    bb.on('close', () => resolve(fields));
    bb.on('error', () => resolve(fields));
    bb.end(buf);
  } catch { resolve(fields); } // kein multipart/urlencoded: Rohdaten werden trotzdem gespeichert
});

const app = express();
app.disable('x-powered-by');
const tp = process.env.TRUST_PROXY ?? 'loopback';
app.set('trust proxy', /^\d+$/.test(tp) ? +tp : tp);

// ---- Ingest: fester Pfad, nur POST, ohne Login. Antwort-Body "INSERT SUCCESSFUL" erwartet das Tool.
app.post(INGEST, (req, res) => {
  const chunks = []; let size = 0, tooBig = false;
  req.on('data', c => { size += c.length; if (size > MAX_BODY) tooBig = true; else chunks.push(c); });
  req.on('end', async () => {
    res.type('text/plain');
    if (tooBig) return res.status(413).send('INSERT FAILED: body too large\n');
    const body = Buffer.concat(chunks);
    const f = await parseForm(body, req.headers);
    const row = Object.fromEntries(FIELDS.map(k => [COL[k], normalize(k, f[k])]));
    const ecid = f.ECID ?? '';
    row.ecid_hex = ecid.match(/0x[0-9a-fA-F]+/)?.[0] ?? null;
    row.ecid_dec = ecid.match(/^\s*(\d+)/)?.[1] ?? null;
    try {
      insert.run({
        received_at: new Date().toISOString().slice(0, 19), remote_ip: req.ip ?? null,
        path: req.originalUrl, raw: body.toString('utf8'), ...Object.fromEntries(COLS.map(c => [c, row[c] ?? null]))
      });
      res.send('INSERT SUCCESSFUL\n');
    } catch (e) { res.status(500).send(`INSERT FAILED: ${e.message}\n`); }
  });
});

// ---- ab hier alles hinter optionalem Basic Auth
const same = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
app.use((req, res, next) => {
  if (!UI_USER) return next();
  const m = /^Basic (.+)$/.exec(req.headers.authorization ?? '');
  const [u = '', ...p] = m ? Buffer.from(m[1], 'base64').toString().split(':') : [];
  if (m && same(u, UI_USER) && same(p.join(':'), UI_PASS ?? '')) return next();
  res.set('WWW-Authenticate', 'Basic realm="Marmot"').status(401).send('Login erforderlich');
});

const P = req => Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(Array.isArray(v) ? v[0] : v)]));
function where(p) {
  const c = [], a = [];
  if (p.q?.trim()) { c.push('(' + SEARCH.map(s => `${s} LIKE ?`).join(' OR ') + ')'); a.push(...SEARCH.map(() => `%${p.q.trim()}%`)); }
  for (const [f] of FILTERS) if (p[f]) { c.push(`${f} = ?`); a.push(p[f]); }
  if (p.from) { c.push('substr(received_at,1,10) >= ?'); a.push(p.from); }
  if (p.to) { c.push('substr(received_at,1,10) <= ?'); a.push(p.to); }
  return [c.length ? 'WHERE ' + c.join(' AND ') : '', a];
}
const fieldList = r => FIELDS.map(f => [f, r[COL[f]]]);

const api = express.Router();
api.get('/submissions', (req, res) => {
  const p = P(req), [w, a] = where(p);
  const total = db.prepare(`SELECT COUNT(*) n FROM submissions ${w}`).get(...a).n;
  const pages = Math.max(Math.ceil(total / PER_PAGE), 1);
  const page = Math.min(Math.max(parseInt(p.page) || 1, 1), pages);
  res.json({
    total, page, pages,
    rows: rows(`SELECT * FROM submissions ${w} ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`, ...a, PER_PAGE, (page - 1) * PER_PAGE),
    devices: db.prepare('SELECT COUNT(DISTINCT COALESCE(serial_number, udid)) n FROM submissions').get().n,
    filters: FILTERS.map(([key, label]) => ({
      key, label,
      options: rows(`SELECT DISTINCT ${key} v FROM submissions WHERE ${key} IS NOT NULL ORDER BY 1`).map(r => r.v)
    })),
  });
});
api.get('/devices', (req, res) => {
  const [w, a] = where({ q: P(req).q });
  res.json(rows(`SELECT COALESCE(serial_number, udid) AS key, COUNT(*) AS n, MAX(received_at) AS last_seen,
    SUM(pass_result = 'OK') AS ok, pass_result, os_version, model_number, device_name FROM submissions
    ${w} ${w ? 'AND' : 'WHERE'} COALESCE(serial_number, udid) IS NOT NULL GROUP BY key ORDER BY last_seen DESC`, ...a));
});
api.get('/device', (req, res) => {
  const list = rows('SELECT * FROM submissions WHERE COALESCE(serial_number, udid) = ? ORDER BY received_at DESC, id DESC', P(req).key ?? '');
  if (!list.length) return res.status(404).send('Gerät nicht gefunden');
  res.json({ key: P(req).key, rows: list, fields: fieldList(list[0]), last_seen: list[0].received_at });
});
api.get('/submissions/:id', (req, res) => {
  const [r] = rows('SELECT * FROM submissions WHERE id = ?', +req.params.id || 0);
  if (!r) return res.status(404).send('Bericht nicht gefunden');
  res.json({ ...r, fields: [...fieldList(r), ['ECID (hex)', r.ecid_hex], ['ECID (dezimal)', r.ecid_dec]] });
});
const exportRows = req => {
  const [w, a] = where(P(req));
  return rows(`SELECT ${EXPORT_COLS} FROM submissions ${w} ORDER BY received_at DESC, id DESC`, ...a);
};
api.get('/export.json', (req, res) => {
  res.attachment('marmot.json').type('application/json').send(JSON.stringify(exportRows(req), null, 1));
});
api.get('/export.csv', (req, res) => {
  const cell = v => { if (v == null) return ''; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  const out = [EXPORT_COLS.join(','), ...exportRows(req).map(r => EXPORT_COLS.map(c => cell(r[c])).join(','))];
  res.attachment('marmot.csv').type('text/csv; charset=utf-8').send(out.join('\n') + '\n');
});
app.use(`${BASE}/api`, api);

// ---- Web-UI (gebautes Vite-Projekt) mit SPA-Fallback
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
app.use(BASE || '/', express.static(dist, { index: false }));
app.use((req, res, next) => {
  const inUi = req.path === BASE || req.path.startsWith(BASE + '/');
  if (req.method !== 'GET' || !inUi || req.path === INGEST || req.path.startsWith(`${BASE}/api`)) return next();
  res.sendFile(path.join(dist, 'index.html'), err => err && next());
});

app.listen(PORT, HOST, () => console.log(`Marmot-Server: http://${HOST}:${PORT}${BASE}/  Upload: POST ${INGEST}`));
