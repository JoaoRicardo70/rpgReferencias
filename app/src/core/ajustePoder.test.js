import { describe, it, expect } from 'vitest';
import { fatorDaPosicao, posicaoDoFator, fatorDoAjuste, entropiasComAjuste, aplicarAjusteNaFicha, rotuloDoFator, ID_AJUSTE_PODER, FATOR_MIN, FATOR_MAX } from './ajustePoder';
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
        expect(fatorDoAjuste({ entropias: entropiasComAjuste({}, 100000).length ? [entropiasComAjuste({}, 100000)[0]] : [] })).toBe(FATOR_MAX);
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
