import { describe, it, expect } from 'vitest';
import { limitarPosicao, posicaoInicial, lerPosicaoSalva, salvarPosicao, movimentoEhArrasto, MARGEM_FLUTUANTE } from './posicaoFlutuante';

const janela = { largura: 1000, altura: 800 };
const tam = { largura: 60, altura: 36 };
const fake = (init = {}) => {
    const m = { ...init };
    return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } };
};

describe('limitarPosicao', () => {
    it('mantém posição já dentro da janela', () => {
        expect(limitarPosicao({ x: 100, y: 200 }, janela, tam)).toEqual({ x: 100, y: 200 });
    });
    it('respeita a margem nos limites mínimos', () => {
        expect(limitarPosicao({ x: -50, y: -50 }, janela, tam)).toEqual({ x: MARGEM_FLUTUANTE, y: MARGEM_FLUTUANTE });
    });
    it('respeita a margem e o tamanho nos limites máximos', () => {
        expect(limitarPosicao({ x: 5000, y: 5000 }, janela, tam)).toEqual({ x: 1000 - 60 - 8, y: 800 - 36 - 8 });
    });
    it('topoReservado empurra pra baixo', () => {
        expect(limitarPosicao({ x: 10, y: 0 }, janela, tam, 60).y).toBe(68);
    });
    it('valores inválidos viram o mínimo', () => {
        expect(limitarPosicao({ x: NaN, y: 'abc' }, janela, tam)).toEqual({ x: 8, y: 8 });
        expect(limitarPosicao(null, janela, tam)).toEqual({ x: 8, y: 8 });
        expect(limitarPosicao(undefined, undefined)).toEqual({ x: 8, y: 8 });
    });
    it('janela menor que o botão não dá posição negativa', () => {
        expect(limitarPosicao({ x: 100, y: 100 }, { largura: 20, altura: 10 }, tam, 60)).toEqual({ x: 8, y: 68 });
    });
    it('arredonda', () => {
        expect(limitarPosicao({ x: 10.6, y: 20.4 }, janela, tam)).toEqual({ x: 11, y: 20 });
    });
    it('tamanho padrão é usado', () => {
        expect(limitarPosicao({ x: 9999, y: 9999 }, janela)).toEqual({ x: 932, y: 756 });
    });
});

describe('posicaoInicial', () => {
    it('borda esquerda, 40% da altura útil', () => {
        expect(posicaoInicial(janela, tam, 0)).toEqual({ x: 8, y: 320 });
        expect(posicaoInicial(janela, tam, 100)).toEqual({ x: 8, y: 380 });
    });
    it('janela inválida fica dentro dos limites', () => {
        expect(posicaoInicial(null, tam, 60)).toEqual({ x: 8, y: 68 });
    });
});

describe('lerPosicaoSalva / salvarPosicao', () => {
    it('ida e volta', () => {
        const s = fake();
        salvarPosicao('k', { x: 10, y: 20, extra: 1 }, s);
        expect(s.m.k).toBe('{"x":10,"y":20}');
        expect(lerPosicaoSalva('k', s)).toEqual({ x: 10, y: 20 });
    });
    it('sem valor → null', () => { expect(lerPosicaoSalva('k', fake())).toBeNull(); });
    it('JSON ruim → null', () => { expect(lerPosicaoSalva('k', fake({ k: '{ruim' }))).toBeNull(); });
    it('campos não numéricos → null', () => {
        expect(lerPosicaoSalva('k', fake({ k: '{"x":"1","y":2}' }))).toBeNull();
        expect(lerPosicaoSalva('k', fake({ k: '{"x":1}' }))).toBeNull();
        expect(lerPosicaoSalva('k', fake({ k: '5' }))).toBeNull();
    });
    it('storage que lança não quebra', () => {
        const ruim = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
        expect(lerPosicaoSalva('k', ruim)).toBeNull();
        expect(() => salvarPosicao('k', { x: 1, y: 2 }, ruim)).not.toThrow();
    });
    it('usa localStorage por padrão', () => {
        localStorage.clear();
        salvarPosicao('kk', { x: 3, y: 4 });
        expect(lerPosicaoSalva('kk')).toEqual({ x: 3, y: 4 });
    });
});

describe('movimentoEhArrasto', () => {
    it('limite 5 (exclusivo)', () => {
        expect(movimentoEhArrasto({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false);
        expect(movimentoEhArrasto({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true);
        expect(movimentoEhArrasto({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false);
        expect(movimentoEhArrasto({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe(true);
    });
    it('limite customizado e entradas nulas', () => {
        expect(movimentoEhArrasto({ x: 0, y: 0 }, { x: 2, y: 0 }, 1)).toBe(true);
        expect(movimentoEhArrasto(null, null)).toBe(false);
    });
});
