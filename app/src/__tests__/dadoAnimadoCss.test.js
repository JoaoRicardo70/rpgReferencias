import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../css/styles.css'), 'utf8');

describe('CSS da animacao do dado', () => {
    it.each(['dado-cena', 'dado-medalhao', 'dado-rotulo'])('define a classe .%s', (c) => {
        expect(css).toMatch(new RegExp(`\\.${c}\\s*[{,.:\\s]`));
    });
    it('todo @keyframes dado-* referenciado em animation esta definido', () => {
        const definidos = new Set([...css.matchAll(/@keyframes\s+(dado-[\w-]+)/g)].map((m) => m[1]));
        const usados = new Set();
        for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
            for (const n of m[1].matchAll(/(?<![\w-])(dado-[\w-]+)/g)) usados.add(n[1]);
        }
        expect(usados.size).toBeGreaterThan(0);
        expect(definidos.size).toBeGreaterThan(0);
        const faltando = [...usados].filter((n) => !definidos.has(n));
        expect(faltando).toEqual([]);
    });
});
