import { describe, it, expect } from 'vitest';
import { mesclarOverridesCompendio } from './compendioOverrides';

const ficha = (classes) => ({ compendioOverrides: { classes } });

describe('mesclarOverridesCompendio', () => {
    it('junta as substituições de todas as fichas (ícone do Mestre aparece pros outros)', () => {
        const r = mesclarOverridesCompendio({ Mestre: ficha({ c1: { nome: 'Saber', iconeUrl: 'saber.png' } }), Jogador: { compendioOverrides: {} } }, { compendioOverrides: {} });
        expect(r.classes.c1.iconeUrl).toBe('saber.png');
    });
    it('a ficha em uso vence as outras na mesma chave', () => {
        const r = mesclarOverridesCompendio({ A: ficha({ c1: { iconeUrl: 'a.png' } }) }, ficha({ c1: { iconeUrl: 'minha.png' } }));
        expect(r.classes.c1.iconeUrl).toBe('minha.png');
    });
    it('junta todas as seções', () => {
        const r = mesclarOverridesCompendio({ A: { compendioOverrides: { grands: { g: 1 }, condicoes: { d: 2 }, elementos: { e: 3 }, regras: { r: 4 } } } }, null);
        expect([r.grands.g, r.condicoes.d, r.elementos.e, r.regras.r]).toEqual([1, 2, 3, 4]);
    });
    it('aguenta nulos, valores inválidos e fichas sem substituições', () => {
        expect(mesclarOverridesCompendio(null, null)).toEqual({ classes: {}, grands: {}, condicoes: {}, elementos: {}, regras: {} });
        const r = mesclarOverridesCompendio({ a: null, b: 'x', c: { compendioOverrides: 'x' }, d: { compendioOverrides: { classes: [1] } } }, undefined);
        expect(r.classes).toEqual({});
    });
    it('não altera as fichas originais', () => {
        const a = ficha({ c1: { iconeUrl: 'a.png' } });
        mesclarOverridesCompendio({ a }, ficha({ c2: { iconeUrl: 'b.png' } }));
        expect(a.compendioOverrides.classes).toEqual({ c1: { iconeUrl: 'a.png' } });
    });
});
