import { describe, it, expect } from 'vitest';
import { registrarTurnoAdaptacao } from './adaptacao';
import { calcularPendencias, aplicarDecisao, fotografarGanhos } from './aprovacaoPermanente';

const rodar = () => {
    const f = { combate: { adaptacaoLigada: true, adaptacaoFracao: 50 }, ganhosPermanentes: { poderCalculado: 0.2, fatorPoder: 2 } };
    fotografarGanhos(f);
    const turnos = [[1000, 800], [1200, 900], [1200, 1050], [1100, 1125]];
    const gs = turnos.map(([o, p]) => registrarTurnoAdaptacao(f, { poderPortador: p, poderOponente: o, nomeOponente: 'X' }).gain);
    return { f, gs };
};

describe('matematica ponta a ponta (Poder Base 800, fracao 50%)', () => {
    it('ganhos por turno, soma e media', () => {
        const { f, gs } = rodar();
        expect(gs[0]).toBeCloseTo(12.5, 6);
        expect(gs[1]).toBeCloseTo(16.6667, 3);
        expect(gs[2]).toBeCloseTo(7.1429, 3);
        expect(gs[3]).toBeCloseTo(7.1429, 3); // repete o ganho anterior (portador supera)
        const p = calcularPendencias(f);
        expect(p.adaptacao.soma).toBeCloseTo(43.4524, 3);
        expect(p.adaptacao.turnos).toBe(4);
        expect(p.adaptacao.pct).toBeCloseTo(10.8631, 3);
        expect(p.derivados).toBeNull();
    });
    it('liberar: +0,090774 permanente (800 -> ~886,9), fator mantido', () => {
        const { f } = rodar();
        aplicarDecisao(f, 'liberar');
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.2 + 0.108631, 5);
        expect(800 * (1 + 0.108631)).toBeCloseTo(886.905, 1);
        expect(f.ganhosPermanentes.fatorPoder).toBe(2);
        expect(f.combate.ganhosAntesDoCombate).toBeUndefined();
    });
    it('liberar sem permanente previo: exatamente media/100', () => {
        const { f } = rodar();
        f.ganhosPermanentes = undefined; delete f.combate.ganhosAntesDoCombate;
        aplicarDecisao(f, 'liberar');
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.108631, 5);
    });
    it('recusar com derivados (aditivo e fator) + Adaptacao: volta a foto e zera tudo', () => {
        const { f } = rodar();
        f.ganhosPermanentes = { poderCalculado: 0.7, fatorPoder: 6 };
        const p = calcularPendencias(f);
        expect(p.derivados.poderCalculado).toBeCloseTo(0.5, 9);
        expect(p.derivados.fatorPoder).toBeCloseTo(3, 9);
        aplicarDecisao(f, 'recusar');
        expect(f.ganhosPermanentes).toEqual({ poderCalculado: 0.2, fatorPoder: 2 });
        expect(f.combate.adaptacaoSoma).toBe(0);
        expect(f.combate.adaptacaoFator).toBe(1);
        expect(f.combate.ganhosAntesDoCombate).toBeUndefined();
    });
    it('liberar com derivados + Adaptacao soma ambos', () => {
        const { f } = rodar();
        f.ganhosPermanentes = { poderCalculado: 0.7, fatorPoder: 6 };
        aplicarDecisao(f, 'liberar');
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.7 + 0.108631, 5);
        expect(f.ganhosPermanentes.fatorPoder).toBe(6);
    });
    it('personagem sem foto: recusar so zera Adaptacao; derivados ficam', () => {
        const { f } = rodar();
        delete f.combate.ganhosAntesDoCombate;
        f.ganhosPermanentes = { poderCalculado: 0.7, fatorPoder: 6 };
        expect(calcularPendencias(f).derivados).toBeNull();
        aplicarDecisao(f, 'recusar');
        expect(f.ganhosPermanentes).toEqual({ poderCalculado: 0.7, fatorPoder: 6 });
        expect(f.combate.adaptacaoTurnos).toBe(0);
    });
    it('decisoes mistas em varios personagens sao independentes', () => {
        const a = rodar().f, b = rodar().f;
        aplicarDecisao(a, 'liberar'); aplicarDecisao(b, 'recusar');
        expect(a.ganhosPermanentes.poderCalculado).toBeCloseTo(0.308631, 5);
        expect(b.ganhosPermanentes.poderCalculado).toBe(0.2);
    });
});
