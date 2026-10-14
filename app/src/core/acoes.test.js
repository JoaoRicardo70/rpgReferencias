import { describe, it, expect } from 'vitest';
import {
    ACOES_BASE, ACOES_MAXIMO, calcularMaximoAcoes, getAcoesExibicao, sincronizarAcoes, alternarAcao,
    restaurarAcoes, ajustarExtraManualAcao, acoesDessincronizadas, criarAcoesIniciais
} from './acoes.js';

const efeito = (atributo, valor) => ({ nome: 'x', atributo, propriedade: 'base', valor });
const comPassiva = (...efeitos) => ({ passivas: [{ efeitos }], bio: {} });

describe('calcularMaximoAcoes', () => {
    it('todo personagem tem 2 Ações, 2 Bônus e 2 Reações', () => {
        expect(calcularMaximoAcoes({ bio: {} })).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
        expect(ACOES_BASE).toBe(2);
    });

    it('+1 Ação também dá +1 Bônus e +1 Reação', () => {
        expect(calcularMaximoAcoes(comPassiva(efeito('acao_padrao', 1)))).toEqual({ padrao: 3, bonus: 3, reacao: 3 });
    });

    it('+1 Bônus ou +1 Reação NÃO dá Ação', () => {
        expect(calcularMaximoAcoes(comPassiva(efeito('acao_bonus', 1)))).toEqual({ padrao: 2, bonus: 3, reacao: 2 });
        expect(calcularMaximoAcoes(comPassiva(efeito('acao_reacao', 2)))).toEqual({ padrao: 2, bonus: 2, reacao: 4 });
    });

    it('o teto de cada uma é 5', () => {
        expect(calcularMaximoAcoes(comPassiva(efeito('acao_padrao', 9), efeito('acao_bonus', 9)))).toEqual({ padrao: 5, bonus: 5, reacao: 5 });
    });

    it('valores negativos, vazios ou inválidos não reduzem nem quebram', () => {
        expect(calcularMaximoAcoes(comPassiva(efeito('acao_padrao', -3), efeito('acao_bonus', 'abc')))).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
        expect(calcularMaximoAcoes(null)).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
    });

    it('efeitos GERAIS ou de outros atributos não dão Ação', () => {
        expect(calcularMaximoAcoes(comPassiva({ nome: 'g', atributo: 'geral', propriedade: 'base', valor: 50 }, efeito('forca', 5)))).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
    });

    it('o ajuste manual soma com a mesma regra', () => {
        const f = { bio: {}, acoes: { padrao: { extra: 1 }, bonus: { extra: 1 } } };
        expect(calcularMaximoAcoes(f)).toEqual({ padrao: 3, bonus: 4, reacao: 3 });
    });
});

describe('sincronizar, gastar e restaurar', () => {
    it('ficha antiga (max 1) sobe para 2 com as Ações novas já disponíveis', () => {
        const f = { bio: {}, acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 1 }, reacao: { max: 1, atual: 1 } } };
        expect(acoesDessincronizadas(f)).toBe(true);
        sincronizarAcoes(f);
        expect(f.acoes.padrao).toMatchObject({ max: 2, atual: 1 });
        expect(f.acoes.bonus).toMatchObject({ max: 2, atual: 2 });
        expect(acoesDessincronizadas(f)).toBe(false);
    });

    it('quando o máximo cai (ajuste manual removido), o atual é cortado', () => {
        const f = { bio: {}, acoes: { padrao: { max: 5, atual: 5, extra: 0 }, bonus: { max: 5, atual: 5, extra: 0 }, reacao: { max: 5, atual: 5, extra: 0 } } };
        sincronizarAcoes(f);
        expect(f.acoes.padrao).toMatchObject({ max: 2, atual: 2 });
    });

    it('ficha antiga com máximo digitado à mão (sem extra) não perde o que passava de 2', () => {
        const f = { bio: {}, acoes: { padrao: { max: 1, atual: 1 }, bonus: { max: 4, atual: 1 }, reacao: { max: 2, atual: 2 } } };
        sincronizarAcoes(f);
        expect(f.acoes.bonus).toMatchObject({ max: 4, atual: 1, extra: 2 });
        expect(f.acoes.padrao).toMatchObject({ max: 2, extra: 0 });
        sincronizarAcoes(f);
        expect(f.acoes.bonus.max).toBe(4);
    });

    it('cria as Ações quando a ficha não tem', () => {
        const f = { bio: {} };
        sincronizarAcoes(f);
        expect(f.acoes).toMatchObject({ padrao: { max: 2, atual: 2 }, bonus: { max: 2, atual: 2 }, reacao: { max: 2, atual: 2 } });
    });

    it('gastar e recuperar respeitam 0 e o máximo', () => {
        const f = { bio: {}, acoes: criarAcoesIniciais() };
        alternarAcao(f, 'padrao', true); alternarAcao(f, 'padrao', true); alternarAcao(f, 'padrao', true);
        expect(f.acoes.padrao.atual).toBe(0);
        alternarAcao(f, 'padrao', false); alternarAcao(f, 'padrao', false); alternarAcao(f, 'padrao', false);
        expect(f.acoes.padrao.atual).toBe(2);
        alternarAcao(f, 'invalido', true);
    });

    it('novo turno devolve tudo, já no máximo novo', () => {
        const f = { ...comPassiva(efeito('acao_padrao', 1)), acoes: { padrao: { max: 2, atual: 0 }, bonus: { max: 2, atual: 0 }, reacao: { max: 2, atual: 1 } } };
        restaurarAcoes(f);
        expect(f.acoes.padrao).toMatchObject({ max: 3, atual: 3 });
        expect(f.acoes.reacao).toMatchObject({ max: 3, atual: 3 });
    });

    it('getAcoesExibicao usa o máximo calculado e corta o atual', () => {
        const f = { bio: {}, acoes: { padrao: { max: 1, atual: 9 } } };
        const e = getAcoesExibicao(f);
        expect(e.padrao).toEqual({ max: 2, atual: 2 });
        expect(e.bonus).toEqual({ max: 2, atual: 2 });
    });
});

describe('ajustarExtraManualAcao', () => {
    it('soma e tira, nunca abaixo de 0', () => {
        const f = { bio: {}, acoes: criarAcoesIniciais() };
        ajustarExtraManualAcao(f, 'reacao', 1);
        expect(f.acoes.reacao).toMatchObject({ extra: 1, max: 3, atual: 3 });
        ajustarExtraManualAcao(f, 'reacao', -1); ajustarExtraManualAcao(f, 'reacao', -1);
        expect(f.acoes.reacao).toMatchObject({ extra: 0, max: 2 });
    });

    it('não passa do teto de 5', () => {
        const f = { bio: {}, acoes: criarAcoesIniciais() };
        for (let i = 0; i < 10; i++) ajustarExtraManualAcao(f, 'bonus', 1);
        expect(f.acoes.bonus.max).toBe(ACOES_MAXIMO);
        expect(f.acoes.bonus.extra).toBe(3);
    });

    it('cria a ficha de Ações se faltar', () => {
        const f = { bio: {} };
        ajustarExtraManualAcao(f, 'padrao', 1);
        expect(f.acoes.padrao.max).toBe(3);
        expect(f.acoes.bonus.max).toBe(3);
    });
});
