// Un link nel pannello (un paper citato): il testo, l'indirizzo, una nota accanto e le
// frasi citate sotto.
export interface ExplanationLink {
  label: string;
  url: string;
  note?: string;
  quotes?: string[];
}

// Una spiegazione: il popover accanto all'etichetta e, se c'è `lead`, il pannello laterale.
export interface Explanation {
  title: string;
  // Il popover: al massimo due frasi.
  short: string;
  // L'apertura del pannello: al massimo tre frasi semplici. Senza, il popover non ha "Approfondisci".
  lead?: string[];
  // "Dettagli tecnici", chiusi all'apertura del pannello.
  technical?: string[];
  // Numeri mostrati nel pannello sotto le frasi: [nome, valore].
  rows?: [string, string][];
  // Link sotto le frasi, per esempio i paper su cui si basa un workout.
  links?: ExplanationLink[];
}
