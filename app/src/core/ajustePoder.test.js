import { describe, it, expect } from 'vitest';
import { fatorDaPosicao, posicaoDoFator, fatorDoAjuste, entropiasComAjuste, aplicarAjusteNaFicha, rotuloDoFator, ID_AJUSTE_PODER, FATOR_MIN, FATOR_MAX, LIMITES_ABSOLUTOS, normalizarLimites, limitesDoAjuste } from './ajustePoder';
import { getPoderDiretoMultiplier } from './poder';
import { entropiasDaFicha } from './entropia';

describe('ajustePoder', () => {
    it('barra: extremos e ida-e-volta', () => {
        expect(fatorDaPosicao(0)).toBe(FATOR_MIN);
        expect(fatorDaPosicao(100)).toBe(FATOR_MAX);
        expect(fatorDaPosicao(-5)).toBe(FATOR_MIN);
        [0.5, 1, 2, 10, 50].forEach(f => expect(fatorDaPosicao(posicaoDoFator(f))).toBeCloseTo(f, 0));
        expect(posicaoDoFator('lixo')).toBeCloseTo(33.3, 1);
    });
    it('sem ajuste o fator é 1; com ajuste grava uma Entropia ativa de Poder (Direto) munico', () => {
        expect(fatorDoAjuste({})).toBe(1);
        const lista = entropiasComAjuste({}, 5);
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatchObject({ id: ID_AJUSTE_PODER, ativa: true });
        expect(lista[0].efeitos[0]).toMatchObject({ atributo: 'poder_direto', propriedade: 'munico', valor: 5 });
    });
    it('o ajuste entra no Poder Calculado (multiplicador munico)', () => {
        const ficha = {};
        aplicarAjusteNaFicha(ficha, 4);
        expect(fatorDoAjuste(ficha)).toBe(4);
        expect(getPoderDiretoMultiplier(ficha)).toBeCloseTo(4, 5);
    });
    it('mudar o ajuste substitui o anterior e preserva as outras Entropias', () => {
        const ficha = { entropias: [{ id: 'outra', nome: 'X', ativa: true, efeitos: [] }] };
        aplicarAjusteNaFicha(ficha, 3); aplicarAjusteNaFicha(ficha, 7);
        const ids = entropiasDaFicha(ficha).map(e => e.id);
        expect(ids).toEqual(['outra', ID_AJUSTE_PODER]);
        expect(fatorDoAjuste(ficha)).toBe(7);
    });
    it('voltar a ×1 remove a Entropia do ajuste', () => {
        const ficha = {};
        aplicarAjusteNaFicha(ficha, 3); aplicarAjusteNaFicha(ficha, 1);
        expect(entropiasDaFicha(ficha)).toHaveLength(0);
        expect(getPoderDiretoMultiplier(ficha)).toBe(1);
    });
    it('fatores inválidos/fora do limite são contidos', () => {
        expect(fatorDoAjuste({ entropias: entropiasComAjuste({}, 1e9) })).toBe(LIMITES_ABSOLUTOS.max);
        expect(entropiasComAjuste({}, 'abc')).toHaveLength(0);
        expect(rotuloDoFator(2.5)).toBe('×2,5');
    });
});

describe('ajustePoder - limite de Entropias', () => {
    it('com 12 Entropias já na ficha, o ajuste ainda cabe (e sobrevive à leitura)', () => {
        const ficha = { entropias: Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, nome: `E${i}`, ativa: false, efeitos: [] })) };
        aplicarAjusteNaFicha(ficha, 3);
        expect(fatorDoAjuste(ficha)).toBe(3);
        expect(entropiasDaFicha(ficha)).toHaveLength(12);
    });
});

describe('ajustePoder - alcance da barra editável', () => {
    it('limites inválidos caem no padrão; válidos são usados', () => {
        expect(limitesDoAjuste({})).toEqual({ min: 0.1, max: 100 });
        expect(limitesDoAjuste({ ajustePoderLimites: { min: 5, max: 2 } })).toEqual({ min: 0.1, max: 100 });
        expect(limitesDoAjuste({ ajustePoderLimites: { min: '0,5', max: '1000' } })).toEqual({ min: 0.5, max: 1000 });
        expect(normalizarLimites({ min: 0, max: 10 })).toBeNull();
        expect(normalizarLimites({ min: 1, max: 1e9 })).toBeNull();
    });
    it('a barra mapeia nos limites escolhidos', () => {
        const lim = { min: 1, max: 10000 };
        expect(fatorDaPosicao(0, lim)).toBe(1);
        expect(fatorDaPosicao(100, lim)).toBe(10000);
        expect(fatorDaPosicao(50, lim)).toBeCloseTo(100, 0);
        expect(posicaoDoFator(100, lim)).toBeCloseTo(50, 0);
        expect(posicaoDoFator(1e9, lim)).toBe(100);
    });
});
