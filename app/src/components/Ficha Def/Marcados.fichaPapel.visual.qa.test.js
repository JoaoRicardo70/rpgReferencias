import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// QA — regressão: a classe `grimorio-estilo-papel` foi renomeada para `ficha-papel` (Ficha Definitiva).
// Varre os arquivos de app/src e app/css; o próprio arquivo de teste é ignorado.

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(aqui, '..', '..');
const CSS = path.resolve(SRC, '..', 'css');
const ESTE = path.resolve(fileURLToPath(import.meta.url));
const EXT = new Set(['.js', '.jsx', '.css', '.html', '.json']);

function listar(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) return d.name === 'node_modules' ? [] : listar(p);
        return EXT.has(path.extname(d.name)) ? [p] : [];
    });
}

describe('classe grimorio-estilo-papel foi renomeada', () => {
    const arquivos = [...listar(SRC), ...listar(CSS)].filter(f => path.resolve(f) !== ESTE);

    it('a varredura encontra arquivos de src e do css', () => {
        expect(arquivos.length).toBeGreaterThan(50);
        expect(arquivos.some(f => f.endsWith('styles.css'))).toBe(true);
    });

    it('nenhuma referência a "grimorio-estilo-papel" em app/src e app/css', () => {
        const achados = arquivos.filter(f => fs.readFileSync(f, 'utf8').includes('grimorio-estilo-papel'));
        expect(achados).toEqual([]);
    });

    it('Marcados.jsx ainda injeta o <style> com .ficha-papel', () => {
        const src = fs.readFileSync(path.join(aqui, 'Marcados.jsx'), 'utf8');
        expect(src).toMatch(/<style>\{`[\s\S]*\.ficha-papel\s*\{[\s\S]*`\}<\/style>/);
        expect(src).toMatch(/\.ficha-papel \.def-box/);
        expect(src).toMatch(/\.ficha-papel button/);
    });

    it.each(['ClassificacaoPanel.jsx', 'CombateFichaPanel.jsx', 'PactosPanel.jsx', 'RelicarioPanel.jsx'])('%s usa className com "ficha-papel"', (arq) => {
        const src = fs.readFileSync(path.join(aqui, arq), 'utf8');
        expect(src).toMatch(/className="ficha-papel[ "]/);
    });
});
