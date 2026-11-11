// Il pannello laterale delle spiegazioni: uno solo per tutta l'app. Ricorda chi l'ha
// aperto, per rimettergli il fuoco alla chiusura (anche quando l'etichetta è uscita dallo schermo).

import { reactive } from 'vue';
import type { Explanation } from '../core/explanations/types.ts';

export const infoPanel = reactive<{ topic: Explanation | null; opener: HTMLElement | null }>({
  topic: null,
  opener: null,
});

// Un pannello già aperto cambia contenuto; l'etichetta da cui tornare resta quella nuova.
export function openInfoPanel(topic: Explanation, opener: HTMLElement | null): void {
  Object.assign(infoPanel, { topic, opener });
}

export function closeInfoPanel({ restoreFocus = true } = {}): void {
  const { opener } = infoPanel;
  Object.assign(infoPanel, { topic: null, opener: null });
  if (restoreFocus && opener) {
    opener.scrollIntoView({ block: 'nearest' });
    opener.focus();
  }
}
