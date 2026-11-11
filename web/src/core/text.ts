// Il pezzo di un testo lungo che resta sulla pagina: al massimo `max` parole, tagliato
// alla fine dell'ultima frase che ci sta; senza una fine di frase, alla parola `max` con "…".
// Il testo intero va nel pannello delle spiegazioni.
export function clipWords(text: string, max: number): { visible: string; clipped: boolean } {
  const tokens = text.split(/(\s+)/);
  const wordCount = tokens.filter(t => t.trim()).length;
  if (wordCount <= max) return { visible: text, clipped: false };
  // Le prime `max` parole, con gli spazi originali fra di loro.
  let seen = 0;
  let end = 0;
  while (seen < max) {
    if (tokens[end].trim()) seen++;
    end++;
  }
  const head = tokens.slice(0, end).join('');
  // Una frase finisce con un segno a fine parola (non il punto di "3.5").
  const ends = [...head.matchAll(/[.!?](?=\s|$)/g)];
  const last = ends.at(-1)?.index;
  return { visible: last !== undefined ? head.slice(0, last + 1) : `${head}…`, clipped: true };
}
