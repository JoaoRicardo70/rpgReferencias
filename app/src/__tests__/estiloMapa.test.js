import { describe, it, expect } from 'vitest';
import {
    CHAVE_ESTILO_MAPA, ESTILO_CLASSICO, ESTILO_REALISTA, estiloMapaValido, lerEstiloMapa, gravarEstiloMapa,
    alternarEstiloMapa, SLUG_REALCE_POR_REGIAO, realceDaRegiao
} from '../core/estiloMapa';
import { ehChaveDePreferencia } from '../core/preferencias';

const armazem = (inicial = {}) => {
    const dados = { ...inicial };
    return { getItem: (k) => (k in dados ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); }, dados };
};

describe('estilo do Mapa da Terra 0', () => {
    it('só aceita "realista"; qualquer outra coisa vira o clássico', () => {
        expect(estiloMapaValido('realista')).toBe(ESTILO_REALISTA);
        expect(estiloMapaValido('classico')).toBe(ESTILO_CLASSICO);
        expect(estiloMapaValido(null)).toBe(ESTILO_CLASSICO);
        expect(estiloMapaValido('qualquer')).toBe(ESTILO_CLASSICO);
    });

    it('começa no clássico e lembra a escolha', () => {
        const a = armazem();
        expect(lerEstiloMapa(a)).toBe(ESTILO_CLASSICO);
        gravarEstiloMapa(a, ESTILO_REALISTA);
        expect(a.dados[CHAVE_ESTILO_MAPA]).toBe('realista');
        expect(lerEstiloMapa(a)).toBe(ESTILO_REALISTA);
    });

    it('não quebra sem armazenamento ou com armazenamento que lança erro', () => {
        const quebrado = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
        expect(lerEstiloMapa(quebrado)).toBe(ESTILO_CLASSICO);
        expect(() => gravarEstiloMapa(quebrado, ESTILO_REALISTA)).not.toThrow();
        expect(lerEstiloMapa(undefined)).toBe(ESTILO_CLASSICO);
    });

    it('alterna entre os dois estilos', () => {
        expect(alternarEstiloMapa(ESTILO_CLASSICO)).toBe(ESTILO_REALISTA);
        expect(alternarEstiloMapa(ESTILO_REALISTA)).toBe(ESTILO_CLASSICO);
    });

    it('a escolha acompanha a conta (preferência sincronizada)', () => {
        expect(ehChaveDePreferencia(CHAVE_ESTILO_MAPA)).toBe(true);
    });

    it('as dez regiões têm realce no estilo realista', () => {
        expect(Object.keys(SLUG_REALCE_POR_REGIAO)).toHaveLength(10);
        const realces = Object.fromEntries(Object.values(SLUG_REALCE_POR_REGIAO).map((s) => [s, `/hover-${s}.png`]));
        Object.keys(SLUG_REALCE_POR_REGIAO).forEach((nome) => {
            expect(realceDaRegiao(ESTILO_REALISTA, nome, '/classico.png', realces)).toMatch(/hover-/);
            expect(realceDaRegiao(ESTILO_CLASSICO, nome, '/classico.png', realces)).toBe('/classico.png');
        });
        expect(realceDaRegiao(ESTILO_REALISTA, 'Desconhecida', '/classico.png', realces)).toBeNull();
    });
});
