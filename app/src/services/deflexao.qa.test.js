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
const dm = (extra = {}) => ({ id: 'd1', nome: 'Alvo Treino', cenaId: 'c1', tipoDefesa: 'evasiva', valorDefesa: 60, hpAtual: 5_000_000, hpMax: 5_000_000, ...extra });

beforeEach(() => { gravar.mockClear(); gravar.mockImplementation(() => ({ textos: ['escudo absorveu'] })); });

describe('aplicarDanoDeflexao', () => {
    it('Dummie: grava a vida reduzida pelo dano devolvido (caminho do Reflexo: gravarVidaDoAlvo)', () => {
        const d = dm();
        const r = aplicarDanoDeflexao({ atacante: 'Alvo Treino', dano: 100, elemento: 'fogo', personagens: {}, dummies: { d1: d } });
        expect(r.ok).toBe(true);
        expect(r.final).toBe(100);
        expect(r.textos).toEqual(['escudo absorveu']);
        expect(gravar).toHaveBeenCalledTimes(1);
        const [id, alvo, novoHp, opc] = gravar.mock.calls[0];
        expect(id).toBe('d1');
        expect(alvo).toBe(d);
        expect(novoHp).toBe(Math.max(0, 5_000_000 - danoExibidoParaBruto(100)));
        expect(opc).toEqual({ elemento: 'fogo' });
    });
    it('Personagem atacante: id pj:Nome e passa pelas Reducoes do alvo (final <= dano)', () => {
        const r = aplicarDanoDeflexao({ atacante: 'Mago', dano: 1000, personagens: { Mago: pj() }, dummies: {} });
        expect(r.ok).toBe(true);
        expect(r.final).toBeLessThanOrEqual(1000);
        if (r.final > 0) expect(gravar.mock.calls[0][0]).toBe('pj:Mago');
    });
    it('vida nunca fica negativa (dano maior que a vida)', () => {
        aplicarDanoDeflexao({ atacante: 'Alvo Treino', dano: 1e12, personagens: {}, dummies: { d1: dm({ hpAtual: 10 }) } });
        expect(gravar.mock.calls[0][2]).toBe(0);
    });
    it('elemento ausente grava elemento null', () => {
        aplicarDanoDeflexao({ atacante: 'Alvo Treino', dano: 5, personagens: {}, dummies: { d1: dm() } });
        expect(gravar.mock.calls[0][3]).toEqual({ elemento: null });
    });
    it('falha fechada: atacante ausente/ambiguo/sem CA nao grava nada', () => {
        const ruim = [
            { atacante: 'Fantasma', personagens: {}, dummies: {} },
            { atacante: '', personagens: {}, dummies: { d1: dm() } },
            { atacante: undefined, personagens: { Mago: pj() } },
            { atacante: 'Alvo Treino', personagens: {}, dummies: { d1: dm(), d2: dm({ id: 'd2' }) } },
            { atacante: 'Alvo Treino', personagens: {}, dummies: { d1: dm({ valorDefesa: 0 }) } },
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
            const r = aplicarDanoDeflexao({ atacante: 'Alvo Treino', dano, personagens: {}, dummies: { d1: dm() } });
            expect(r).toEqual({ ok: true, final: 0, textos: [] });
        });
        expect(gravar).not.toHaveBeenCalled();
    });
    it('gravarVidaDoAlvo sem retorno nao quebra (textos vazios)', () => {
        gravar.mockImplementation(() => undefined);
        const r = aplicarDanoDeflexao({ atacante: 'Alvo Treino', dano: 10, personagens: {}, dummies: { d1: dm() } });
        expect(r).toMatchObject({ ok: true, final: 10, textos: [] });
    });
    it('PJ vence Dummie de mesmo nome', () => {
        aplicarDanoDeflexao({ atacante: 'Mago', dano: 10, personagens: { Mago: pj() }, dummies: { d1: dm({ nome: 'Mago' }) } });
        if (gravar.mock.calls.length) expect(gravar.mock.calls[0][0]).toBe('pj:Mago');
    });
    it('chamada sem argumentos obrigatorios nao lanca (mesa vazia = falha fechada)', () => {
        expect(aplicarDanoDeflexao({ atacante: 'Mago', dano: 1 }).ok).toBe(false);
    });
});
