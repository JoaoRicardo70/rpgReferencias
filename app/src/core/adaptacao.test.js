import { describe, it, expect } from 'vitest';
import {
    fatorAdaptacao, calcularGanhoAdaptacao, escolherOponente, registrarTurnoAdaptacao, converterAdaptacaoEmPermanente, zerarAdaptacao,
    getFracaoAdaptacao, mediaAdaptacao, LIMITE_ADAPTACAO_GANHO_PERC, LIMITE_ADAPTACAO_GANHO_PERC_MIN, LIMITE_ADAPTACAO_TOTAL_PERMANENTE,
} from './adaptacao.js';
import { LIMITE_GANHO_PERMANENTE, LIMITE_GANHO_PERC_MIN, LIMITE_TOTAL_GANHO_PERMANENTE } from './gatilhos.js';
import { calcularPoderAtual } from './poder.js';
import { poderDoOponenteMaisForte } from './adaptacaoTurno.js';

const ficha = (combate = {}) => ({ combate: { adaptacaoLigada: true, ...combate }, ganhosPermanentes: {} });

describe('limites iguais aos do ganhoPermanente percentual', () => {
    it('mesmos limites de core/gatilhos.js', () => {
        expect(LIMITE_ADAPTACAO_GANHO_PERC).toBe(LIMITE_GANHO_PERMANENTE);
        expect(LIMITE_ADAPTACAO_GANHO_PERC_MIN).toBe(LIMITE_GANHO_PERC_MIN);
        expect(LIMITE_ADAPTACAO_TOTAL_PERMANENTE).toBe(LIMITE_TOTAL_GANHO_PERMANENTE);
    });
});

describe('calcularGanhoAdaptacao', () => {
    it('oponente 10% mais forte com fração 50 -> +5%', () => {
        const r = calcularGanhoAdaptacao(100, 110, 50);
        expect(r.diferenca).toBeCloseTo(10, 9);
        expect(r.ganho).toBeCloseTo(5, 9);
    });
    it('portador igual ou mais forte -> 0', () => {
        expect(calcularGanhoAdaptacao(100, 100, 50).ganho).toBe(0);
        expect(calcularGanhoAdaptacao(100, 50, 50).ganho).toBe(0);
    });
    it('dados inválidos -> 0', () => {
        expect(calcularGanhoAdaptacao(0, 100, 50).ganho).toBe(0);
        expect(calcularGanhoAdaptacao(-5, 100, 50).ganho).toBe(0);
        expect(calcularGanhoAdaptacao(100, null, 50).ganho).toBe(0);
        expect(calcularGanhoAdaptacao(null, 100, 50).ganho).toBe(0);
        expect(calcularGanhoAdaptacao(100, NaN, 50).ganho).toBe(0);
    });
    it('fração é limitada a 0-100 e o ganho ao teto', () => {
        expect(calcularGanhoAdaptacao(100, 200, 500).ganho).toBeCloseTo(100, 9);
        expect(calcularGanhoAdaptacao(100, 200, -5).ganho).toBe(0);
        expect(calcularGanhoAdaptacao(1, 1e30, 100).ganho).toBe(LIMITE_ADAPTACAO_GANHO_PERC);
    });
});

describe('escolherOponente', () => {
    it('pega o mais forte e ignora sem Poder', () => {
        const r = escolherOponente([{ nome: 'A', poder: 10 }, { nome: 'B', poder: null }, { nome: 'C', poder: 30 }, { nome: 'D', poder: undefined }, { nome: 'E', poder: 20 }]);
        expect(r).toEqual({ nome: 'C', poder: 30 });
    });
    it('vazio -> null', () => { expect(escolherOponente([])).toBeNull(); expect(escolherOponente([{ nome: 'X', poder: null }])).toBeNull(); });
});

describe('fatorAdaptacao e registro de turnos (exemplo do usuário)', () => {
    it('sem campos / legado -> 1', () => {
        expect(fatorAdaptacao(null)).toBe(1);
        expect(fatorAdaptacao({ combate: { municoAuto: true, municoTurnos: 5, municoPorTurno: 5 } })).toBe(1);
    });
    it('+5% depois +25% compõe ×1,3125 e a média permanente é 15%', () => {
        const f = ficha({ adaptacaoFracao: 50 });
        const r1 = registrarTurnoAdaptacao(f, { poderPortador: 100, poderOponente: 110, nomeOponente: 'Rival' });
        expect(r1.gain).toBeCloseTo(5, 9);
        expect(r1.texto).toContain('Rival');
        expect(fatorAdaptacao(f)).toBeCloseTo(1.05, 9);
        const r2 = registrarTurnoAdaptacao(f, { poderPortador: 100, poderOponente: 150, nomeOponente: 'Rival' });
        expect(r2.gain).toBeCloseTo(25, 9);
        expect(fatorAdaptacao(f)).toBeCloseTo(1.3125, 9);
        expect(f.combate.adaptacaoTurnos).toBe(2);
        expect(mediaAdaptacao(f)).toBeCloseTo(15, 9);
        expect(f.combate.adaptacaoUltimo.oponenteNome).toBe('Rival');
        const conv = converterAdaptacaoEmPermanente(f);
        expect(conv.percentual).toBeCloseTo(15, 9);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 9);
        expect(fatorAdaptacao(f)).toBe(1);
        expect(f.combate.adaptacaoTurnos).toBe(0);
        expect(f.combate.adaptacaoSoma).toBe(0);
        // segunda conversão não ganha nada
        expect(converterAdaptacaoEmPermanente(f)).toBeNull();
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 9);
    });
    it('soma ao permanente que já existe', () => {
        const f = ficha({ adaptacaoFracao: 100 });
        f.ganhosPermanentes.poderCalculado = 0.5;
        registrarTurnoAdaptacao(f, { poderPortador: 100, poderOponente: 120 });
        converterAdaptacaoEmPermanente(f);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.7, 9);
    });
    it('desligada, sem oponente ou portador desconhecido: nada é registrado', () => {
        const desl = ficha(); desl.combate.adaptacaoLigada = false;
        expect(registrarTurnoAdaptacao(desl, { poderPortador: 100, poderOponente: 200 })).toBeNull();
        const f = ficha();
        expect(registrarTurnoAdaptacao(f, { poderPortador: 100, poderOponente: null })).toBeNull();
        expect(registrarTurnoAdaptacao(f, { poderPortador: null, poderOponente: 200 })).toBeNull();
        expect(f.combate.adaptacaoTurnos).toBeUndefined();
    });
    it('portador mais forte: turno conta com ganho 0 (puxa a média para baixo)', () => {
        const f = ficha();
        registrarTurnoAdaptacao(f, { poderPortador: 100, poderOponente: 120 });
        const r = registrarTurnoAdaptacao(f, { poderPortador: 120, poderOponente: 100 });
        expect(r.gain).toBe(0);
        expect(f.combate.adaptacaoTurnos).toBe(2);
        expect(mediaAdaptacao(f)).toBeCloseTo(5, 9);
    });
    it('sem turnos ou média 0: não ganha nada mas zera', () => {
        const f = ficha({ adaptacaoFator: 1, adaptacaoSoma: 0, adaptacaoTurnos: 0 });
        expect(converterAdaptacaoEmPermanente(f)).toBeNull();
        expect(f.ganhosPermanentes.poderCalculado).toBeUndefined();
        const g = ficha();
        registrarTurnoAdaptacao(g, { poderPortador: 100, poderOponente: 90 });
        expect(converterAdaptacaoEmPermanente(g)).toBeNull();
        expect(g.combate.adaptacaoTurnos).toBe(0);
    });
    it('zerarAdaptacao zera sem converter', () => {
        const f = ficha();
        registrarTurnoAdaptacao(f, { poderPortador: 100, poderOponente: 120 });
        expect(zerarAdaptacao(f)).toBe(true);
        expect(fatorAdaptacao(f)).toBe(1);
        expect(f.ganhosPermanentes.poderCalculado).toBeUndefined();
        expect(zerarAdaptacao(f)).toBe(false);
    });
    it('fração ausente -> 50', () => { expect(getFracaoAdaptacao(ficha())).toBe(50); });
});

describe('integração com o Poder Calculado', () => {
    it('calcularPoderAtual aplica o fator F e fica >= sem ele', () => {
        const base = { combate: {}, vida: { base: 1e6 }, ascensaoBase: 1 };
        const sem = calcularPoderAtual(base, 1).poderExato;
        const com = calcularPoderAtual({ ...base, combate: { adaptacaoFator: 2 } }, 1).poderExato;
        expect(sem).toBeGreaterThan(0);
        expect(com / sem).toBeGreaterThan(1.9);
        expect(com / sem).toBeLessThan(2.1);
    });
});

describe('poderDoOponenteMaisForte', () => {
    it('ignora o próprio portador e dummies sem Poder, pega o mais forte', () => {
        const ordem = [
            { id: 'A', nome: 'A', isDummie: false, ficha: {} },
            { id: 'd1', nome: 'Dummie1', isDummie: true, ficha: {} },
            { id: 'd2', nome: 'Dummie2', isDummie: true, ficha: {} },
        ];
        const dummies = { d1: { poderCalculado: 500 }, d2: { poderCalculado: '' } };
        const r = poderDoOponenteMaisForte(ordem, 'A', { personagens: {}, dummies, meuNome: 'X' });
        expect(r).toEqual({ nome: 'Dummie1', poder: 500 });
    });
    it('sem ninguém válido -> null', () => {
        expect(poderDoOponenteMaisForte([{ id: 'A', nome: 'A', isDummie: false, ficha: {} }], 'A', { personagens: {}, dummies: {} })).toBeNull();
    });
});
