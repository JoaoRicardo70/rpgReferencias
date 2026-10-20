import { describe, it, expect } from 'vitest';
import { resolverTipoAGastar, restaurarAcoes, criarAcoesIniciais } from './acoes.js';

const f = (p, b, r) => ({ bio: {}, acoes: { padrao: { max: 2, atual: p, extra: 0 }, bonus: { max: 2, atual: b, extra: 0 }, reacao: { max: 2, atual: r, extra: 0 } } });

describe('resolverTipoAGastar (Bonus -> Acao)', () => {
    it('Bonus com Bonus sobrando gasta Bonus', () => { expect(resolverTipoAGastar(f(2, 1, 2), 'bonus')).toBe('bonus'); });
    it('Bonus sem Bonus mas com Acao gasta Acao', () => { expect(resolverTipoAGastar(f(1, 0, 2), 'bonus')).toBe('padrao'); });
    it('sem Bonus e sem Acao continua bonus', () => { expect(resolverTipoAGastar(f(0, 0, 2), 'bonus')).toBe('bonus'); });
    it('outros tipos nao sao trocados, mesmo sem sobra', () => {
        expect(resolverTipoAGastar(f(0, 0, 0), 'padrao')).toBe('padrao');
        expect(resolverTipoAGastar(f(2, 0, 0), 'reacao')).toBe('reacao');
        expect(resolverTipoAGastar(f(2, 2, 2), 'xyz')).toBe('xyz');
    });
    it('ficha sem acoes usa o maximo base (Bonus disponivel)', () => {
        expect(resolverTipoAGastar({ bio: {} }, 'bonus')).toBe('bonus');
    });
});

describe('restaurarAcoes limpa reacoesPendentes', () => {
    it('zera a lista de pendencias e restaura as Acoes', () => {
        const ficha = { bio: {}, acoes: criarAcoesIniciais(), combate: { reacoesPendentes: [{ id: 'a', efeito: 'reduzir_dano' }], outro: 1 } };
        ficha.acoes.reacao.atual = 0;
        restaurarAcoes(ficha);
        expect(ficha.combate.reacoesPendentes).toEqual([]);
        expect(ficha.combate.outro).toBe(1);
        expect(ficha.acoes.reacao.atual).toBe(2);
    });
    it('nao cria combate nem lista quando nao existem', () => {
        const ficha = { bio: {}, acoes: criarAcoesIniciais() };
        restaurarAcoes(ficha);
        expect(ficha.combate).toBeUndefined();
        const f2 = { bio: {}, acoes: criarAcoesIniciais(), combate: {} };
        restaurarAcoes(f2);
        expect(f2.combate.reacoesPendentes).toBeUndefined();
    });
});
