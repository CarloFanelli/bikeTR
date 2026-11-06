// Come un risultato diventa JSON in tests/fixtures/load-expected.json: un'attività
// diventa "activity <id>" (il file resta leggibile) e un Set una lista.
export const replacer = (_key: string, v: unknown): unknown =>
  v instanceof Set ? [...v]
    : (v && typeof v === 'object' && 'start_date_local' in v && 'id' in v) ? `activity ${v.id}` : v;
