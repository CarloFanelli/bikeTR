// I testi calcolati (consigli, piano, precisione dati) cominciano spesso con un emoji:
// le schermate lo mostrano come icona a linea, con un nome che dice cosa rappresenta.

export type IconName =
  | 'hard' | 'threshold' | 'moderate' | 'easy' | 'build' | 'rest' | 'recovery' | 'done' | 'skip' | 'rain'
  | 'ride' | 'run' | 'swim' | 'taper' | 'race' | 'recovery-week' | 'target' | 'trend-up' | 'trend-down'
  | 'steady' | 'power' | 'heart' | 'warning' | 'plan' | 'idea' | 'boost' | 'sleep' | 'legs' | 'down' | 'strength'
  | 'chart' | 'walk' | 'hike' | 'activity';

// Senza il selettore di variante (U+FE0F), che alcuni emoji hanno e altri no.
const ICONS: Record<string, IconName> = {
  '🔴': 'hard', '🟠': 'threshold', '🟡': 'moderate', '🟢': 'easy', '🔵': 'build', '🟦': 'build',
  '⬜': 'rest', '😌': 'recovery', '✓': 'done', '✅': 'done', '⏸': 'skip', '🌧': 'rain',
  '🚴': 'ride', '🚵': 'ride', '🏃': 'run', '🏊': 'swim', '🏁': 'taper', '🏆': 'race', '🔄': 'recovery-week',
  '🎯': 'target', '📈': 'trend-up', '📉': 'trend-down', '➡': 'steady', '🔋': 'power', '❤': 'heart',
  '⚠': 'warning', '📋': 'plan', '💡': 'idea', '🚀': 'boost', '🛌': 'sleep', '🦵': 'legs', '⬇': 'down',
  '💪': 'strength', '📊': 'chart', '🚶': 'walk', '🥾': 'hike',
};

// L'icona di un emoji da solo ("⏸️" → "skip"); null se non ne ha una.
export const emojiIcon = (emoji: string): IconName | null => ICONS[emoji.replace(/️/g, '')] ?? null;

// "🔴 Soglia" → icona "hard" e "Soglia". Un primo pezzo senza lettere né cifre è un
// simbolo: si toglie anche quando non ha un'icona. Un testo che comincia con una parola resta com'è.
export function splitEmoji(text: string): { icon: IconName | null; text: string } {
  const match = text.match(/^(\S+)\s+([\s\S]*)$/);
  if (!match || /[\p{L}\p{N}]/u.test(match[1])) return { icon: null, text };
  return { icon: emojiIcon(match[1]), text: match[2] };
}

// Un testo senza nessun emoji, anche in mezzo o in fondo ("possibile nuovo PR 🔥"): per i
// valori e le note che non hanno un posto per l'icona. Frecce come "→" e "↑" restano, e
// anche gli a capo dei testi su più righe.
export const withoutEmoji = (text: string): string =>
  text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/^[^\S\n]+|[^\S\n]+$/gm, '')
    .trim();
