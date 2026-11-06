// Ingressi di un caso del piano di allenamento (tests/fixtures/plan-cases.json) che non
// stanno scritti nel file: quali attività vede il caso e il profilo atleta del livello.
// Li usano sia la registrazione (record-plan.ts) sia i test, così vedono gli stessi dati.

interface Dated {
  type: string;
  start_date_local: string;
}

// `kind` è il nome di una delle settimane inventate di plan-cases.json (activitySets) o un
// filtro sulle uscite di rides.json; 'upToNow' tiene solo quelle già iniziate all'istante del caso.
export function caseActivities<T extends Dated>(kind: string, all: T[], now: string, sets: Record<string, T[]>): T[] {
  if (sets[kind]) return structuredClone(sets[kind]);
  if (kind === 'none') return [];
  if (kind === 'upToNow') return all.filter(a => Date.parse(a.start_date_local) <= Date.parse(now));
  if (kind === 'bikes') return all.filter(a => a.type.includes('Ride'));
  if (kind === 'nonBike') return all.filter(a => !a.type.includes('Ride'));
  return all;
}

// Del profilo atleta il piano usa solo il livello.
export const profileOf = (level: string | null) => (level ? { level: { key: level } } : null);
