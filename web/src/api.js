import { useEffect, useState } from 'react';

const API = import.meta.env.BASE_URL + 'api';
const qs = params => new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v)).toString();

export async function get(path, params) {
  const r = await fetch(`${API}${path}?${qs(params)}`);
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json();
}
export const exportUrl = (fmt, params) => `${API}/export.${fmt}?${qs(params)}`;

// Lädt Daten neu, sobald sich Pfad oder Parameter ändern; alte Daten bleiben bis zur Antwort sichtbar.
export function useFetch(path, params) {
  const [s, setS] = useState({});
  const key = `${path}?${qs(params)}`;
  useEffect(() => {
    let off = false;
    get(path, params).then(data => !off && setS({ data })).catch(error => !off && setS({ error }));
    return () => { off = true; };
  }, [key]);
  return s;
}
