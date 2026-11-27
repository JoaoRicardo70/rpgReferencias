import { describe, it, expect, beforeEach, vi } from 'vitest';

const gravar = vi.hoisted(() => vi.fn(() => ({ textos: ['escudo absorveu'] })));
vi.mock('./danoAlvo', () => ({ gravarVidaDoAlvo: gravar }));

import { aplicarDanoDeflexao } from './deflexao';
import { danoExibidoParaBruto } from '../core/vitals';

const pj = (extra = {}) => ({
    bio: {}, vida: { base: 1000000, atual: 1000000 },
    forca: { base: 500 }, destreza: { base: 500 }, inteligencia: { base: 500 }, sabedoria: { base: 500 },
    energiaEsp: { base: 500 }, carisma: { base: 500 }, stamina: { base: 500 }, constituicao: { base: 500 }, divisores: {}, ...extra,
});

beforeEach(() => { gravar.mockClear(); gravar.mockImplementation(() => ({ textos: ['escudo absorveu'] })); });

describe('aplicarDanoDeflexao', () => {
    it('Personagem atacante: id pj:Nome e passa pelas Reducoes do alvo (final <= dano)', () => {
        const r = aplicarDanoDeflexao({ atacante: 'Mago', dano: 1000, personagens: { Mago: pj() } });
        expect(r.ok).toBe(true);
        expect(r.final).toBeLessThanOrEqual(1000);
        if (r.final > 0) expect(gravar.mock.calls[0][0]).toBe('pj:Mago');
    });
    it('vida nunca fica negativa (dano maior que a vida)', () => {
        aplicarDanoDeflexao({ atacante: 'Mago', dano: 1e12, personagens: { Mago: pj() } });
        expect(gravar.mock.calls[0][2]).toBe(0);
    });
    it('elemento ausente grava elemento null', () => {
        aplicarDanoDeflexao({ atacante: 'Mago', dano: 5, personagens: { Mago: pj() } });
        expect(gravar.mock.calls[0][3]).toEqual({ elemento: null });
    });
    it('falha fechada: atacante ausente ou sem nome nao grava nada', () => {
        const ruim = [
            { atacante: 'Fantasma', personagens: {} },
            { atacante: '', personagens: { Mago: pj() } },
            { atacante: undefined, personagens: { Mago: pj() } },
        ];
        ruim.forEach((a) => {
            const r = aplicarDanoDeflexao({ dano: 50, ...a });
            expect(r.ok).toBe(false);
            expect(r.motivo).toMatch(/atacante/);
        });
        expect(gravar).not.toHaveBeenCalled();
    });
    it('dano 0, negativo, NaN ou texto = ok sem gravar', () => {
        [0, -10, NaN, 'abc', undefined, null].forEach((dano) => {
            const r = aplicarDanoDeflexao({ atacante: 'Mago', dano, personagens: { Mago: pj() } });
            expect(r).toEqual({ ok: true, final: 0, textos: [] });
        });
        expect(gravar).not.toHaveBeenCalled();
    });
    it('gravarVidaDoAlvo sem retorno nao quebra (textos vazios)', () => {
        gravar.mockImplementation(() => undefined);
        const r = aplicarDanoDeflexao({ atacante: 'Mago', dano: 10, personagens: { Mago: pj() } });
        expect(r).toMatchObject({ ok: true, final: 10, textos: [] });
    });
    it('chamada sem argumentos obrigatorios nao lanca (mesa vazia = falha fechada)', () => {
        expect(aplicarDanoDeflexao({ atacante: 'Mago', dano: 1 }).ok).toBe(false);
    });
});
