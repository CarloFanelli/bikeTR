// Controlli di struttura del codice dell'app: nessun file sorgente che importa un
// file da cui è importato a sua volta (anche attraverso altri file) e nessun file
// sorgente oltre 500 righe. Esce con codice 1 e nomina i file se ne trova.
//
// Uso: node scripts/check-structure.ts [cartella...]   (di default la cartella web/)

import fs from 'node:fs';
import path from 'node:path';

const MAX_LINES = 500;
const SOURCE = /\.(ts|vue|js|mjs)$/;
// `import/export … from '…'`, `import '…'` e `import('…')`. Un'espressione regolare
// basta per il codice dell'app ed evita di caricare il compilatore TypeScript,
// che da solo richiede secondi a ogni avvio.
const IMPORT = /\b(?:import|export)\s+[\w*{}\s,$]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g;
const RESOLVE_SUFFIXES = ['', '.ts'];
// Il JavaScript di oggi resta fuori dai controlli finché la nuova app non lo sostituisce.
const LEGACY = new Set([
  'activity.js', 'analysis.js', 'app.js', 'coach.js', 'constants.js', 'export.js',
  'predictions.js', 'strava.js', 'training.js', 'training_v2.js',
]);

const args = process.argv.slice(2);
const roots = (args.length ? args : [path.join(import.meta.dirname, '..')]).map((dir) => path.resolve(dir));
const posix = (from: string, file: string): string => path.relative(from, file).split(path.sep).join('/');
const rel = (file: string): string => posix(process.cwd(), file);

// File sorgente sotto la cartella, esclusi pacchetti installati e cartelle nascoste.
function sourceFiles(root: string, dir: string = root): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : sourceFiles(root, full);
    }
    return SOURCE.test(entry.name) && !LEGACY.has(posix(root, full)) ? [full] : [];
  });
}

// Nei componenti .vue gli import stanno nei blocchi <script>.
function scriptOf(file: string, text: string): string {
  if (!file.endsWith('.vue')) return text;
  return [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
}

// Import relativi (statici, re-export e dinamici) che puntano a file controllati.
function importsOf(file: string, text: string, files: Set<string>): string[] {
  return [...scriptOf(file, text).matchAll(IMPORT)]
    .map((m) => m[1] ?? m[2])
    .filter((spec) => spec.startsWith('.'))
    .map((spec) => RESOLVE_SUFFIXES.map((s) => path.resolve(path.dirname(file), spec + s)).find((f) => files.has(f)))
    .filter((f): f is string => f !== undefined);
}

// Un giro per ogni gruppo di file che si importano a vicenda, come elenco a→b→…→a.
function findCycles(graph: Map<string, string[]>): string[][] {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const visit = (file: string): void => {
    visiting.add(file);
    stack.push(file);
    for (const dep of graph.get(file) ?? []) {
      if (visiting.has(dep)) {
        const cycle = stack.slice(stack.indexOf(dep));
        const key = [...cycle].sort().join('\n');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push([...cycle, dep]);
        }
      } else if (!done.has(dep)) {
        visit(dep);
      }
    }
    stack.pop();
    visiting.delete(file);
    done.add(file);
  };
  for (const file of [...graph.keys()].sort()) if (!done.has(file)) visit(file);
  return cycles;
}

const lineCount = (text: string): number => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

const files = roots.flatMap((root) => sourceFiles(root));
const fileSet = new Set(files);
const graph = new Map<string, string[]>();
const problems: string[] = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  graph.set(file, importsOf(file, text, fileSet));
  const count = lineCount(text);
  if (count > MAX_LINES) problems.push(`${rel(file)}: ${count} righe, il limite è ${MAX_LINES}`);
}
for (const cycle of findCycles(graph)) {
  problems.push(`Import circolare: ${cycle.map(rel).join(' → ')}`);
}

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exitCode = 1;
} else {
  console.log(`Struttura in regola: ${files.length} file, nessun import circolare, nessuno oltre ${MAX_LINES} righe.`);
}
