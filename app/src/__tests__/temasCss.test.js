import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../css/styles.css'), 'utf8');
const bloco = (seletor) => {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = css.match(new RegExp(`(?:^|[\\s,}])${esc}\\s*\\{([^}]*)\\}`, 'm'));
    return m ? m[1] : null;
};

describe('CSS dos estilos visuais novos', () => {
    it.each(['medieval', 'moderno', 'futurista', 'mescla'])('body.theme-%s define --cor-primaria e --font-family', (t) => {
        const b = bloco(`body.theme-${t}`);
        expect(b, `bloco body.theme-${t}`).not.toBeNull();
        expect(b).toMatch(/--cor-primaria\s*:/);
        expect(b).toMatch(/--font-family\s*:/);
    });
    it('@import da linha 1 inclui as fontes dos estilos', () => {
        const linha1 = css.split(/\r?\n/)[0];
        expect(linha1).toMatch(/^@import/);
        ['Cinzel', 'EB+Garamond', 'Inter', 'Orbitron'].forEach(f => expect(linha1).toContain(f));
    });
    it('body.theme-futurista::after nao captura cliques (pointer-events: none)', () => {
        const b = bloco('body.theme-futurista::after');
        expect(b, 'bloco body.theme-futurista::after').not.toBeNull();
        expect(b).toMatch(/pointer-events\s*:\s*none/);
    });
});
