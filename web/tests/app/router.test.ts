import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../src/app/router.ts';

// Qui contano gli indirizzi, non le schermate: schermate vuote al posto di quelle vere.
vi.mock('../../src/screens/NotYetScreen.vue', () => ({ default: {} }));
vi.mock('../../src/screens/SettingsScreen.vue', () => ({ default: {} }));
vi.mock('../../src/screens/HomeScreen.vue', () => ({ default: {} }));
vi.mock('../../src/screens/TrainingScreen.vue', () => ({ default: {} }));
vi.mock('../../src/screens/AnalysisScreen.vue', () => ({ default: {} }));
vi.mock('../../src/screens/ActivitiesScreen.vue', () => ({ default: {} }));
vi.mock('../../src/screens/ActivityDetailScreen.vue', () => ({ default: {} }));

// Il percorso aperto per un indirizzo, dopo gli eventuali rimandi.
async function open(address: string) {
  const router = createAppRouter(createMemoryHistory());
  await router.push(address);
  return router.currentRoute.value;
}

describe('indirizzi della nuova app', () => {
  it.each([
    ['/home', 'home'],
    ['/allenamento', 'allenamento'],
    ['/analisi', 'analisi'],
    ['/attivita', 'attivita'],
    ['/coach', 'coach'],
    ['/impostazioni', 'impostazioni'],
  ])('%s apre la sua sezione', async (address, name) => {
    const route = await open(address);
    expect([route.path, route.name]).toEqual([address, name]);
  });

  it('il dettaglio di un\'attività ha il suo indirizzo', async () => {
    const route = await open('/attivita/1234567');
    expect([route.name, route.params.id]).toEqual(['attivita-dettaglio', '1234567']);
  });

  it.each(['/', '/hoem', '/attivita/1/altro', '/impostazioni/zone'])('%s, sconosciuto, apre Home', async (address) => {
    expect((await open(address)).path).toBe('/home');
  });
});
