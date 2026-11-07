import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-structure.ts', import.meta.url));
const dirs: string[] = [];

// Una cartella temporanea con i file dati (percorso relativo → contenuto).
function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structure-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

function check(dir: string): { status: number | null; out: string } {
  const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  return { status: run.status, out: run.stdout + run.stderr };
}

const lines = (n: number): string => 'export const x = 1;\n'.repeat(n);

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

// Ogni test avvia Node: su un computer lento supera i 5 secondi predefiniti.
describe('controllo della struttura', { timeout: 20_000 }, () => {
  it('passa su file senza import circolari e sotto il limite', () => {
    const dir = project({
      'src/a.ts': "import { b } from './b.ts';\nexport const a = b;\n",
      'src/b.ts': 'export const b = 1;\n',
    });
    expect(check(dir).status).toBe(0);
  });

  it('fallisce su due file che si importano a vicenda, nominandoli', () => {
    const dir = project({
      'src/a.ts': "import { b } from './b.ts';\nexport const a = 1;\n",
      'src/b.ts': "import { a } from './a.ts';\nexport const b = 2;\n",
    });
    const { status, out } = check(dir);
    expect(status).toBe(1);
    expect(out).toContain('src/a.ts');
    expect(out).toContain('src/b.ts');
  });

  it('trova il giro anche attraverso altri file e componenti .vue', () => {
    const dir = project({
      'src/a.ts': "export { c } from './C.vue';\n",
      'src/C.vue': "<template><p /></template>\n<script setup lang=\"ts\">\nimport { b } from './b.ts';\n</script>\n",
      'src/b.ts': "export const b = () => import('./a.ts');\n",
    });
    const { status, out } = check(dir);
    expect(status).toBe(1);
    for (const file of ['src/a.ts', 'src/C.vue', 'src/b.ts']) expect(out).toContain(file);
  });

  it('accetta un file di 500 righe', () => {
    expect(check(project({ 'src/ok.ts': lines(500) })).status).toBe(0);
  });

  it('segnala per nome un file di 501 righe', () => {
    const { status, out } = check(project({ 'src/ok.ts': lines(500), 'src/long.ts': lines(501) }));
    expect(status).toBe(1);
    expect(out).toContain('src/long.ts');
    expect(out).not.toContain('src/ok.ts');
  });

  it('non conta pacchetti installati e file dati', () => {
    const dir = project({
      'node_modules/pkg/index.ts': lines(600),
      'data.json': lines(600),
      'src/a.ts': 'export const a = 1;\n',
    });
    expect(check(dir).status).toBe(0);
  });

  it('controlla anche i file JavaScript, ovunque siano', () => {
    const { status, out } = check(project({ 'app.js': lines(600), 'src/a.ts': 'export const a = 1;\n' }));
    expect(status).toBe(1);
    expect(out).toContain('app.js');
  });
});
