import { describe, it, expect } from 'vitest';
import { acoesEmFalta, gastarAcoes, substituicoesDeAcao, avisosDoGasto } from './acoesTecnica.js';

const fichaComAcoes = (padrao, bonus, reacao) => ({
    acoes: {
        padrao: { max: 2, atual: padrao, extra: 0 },
        bonus: { max: 2, atual: bonus, extra: 0 },
        reacao: { max: 2, atual: reacao, extra: 0 }
    }
});

describe('simulacao sequencial (Bonus por ultimo)', () => {
    it('1 Acao + 0 Bonus com [bonus, acao] falta uma, em qualquer ordem da lista', () => {
        const f = fichaComAcoes(1, 0, 2);
        expect(acoesEmFalta(f, ['bonus', 'padrao'])).toEqual(['Ação Bônus']);
        expect(acoesEmFalta(f, ['padrao', 'bonus'])).toEqual(['Ação Bônus']);
    });
    it('2 Acoes + 0 Bonus com [bonus, acao] nao falta nada', () => {
        expect(acoesEmFalta(fichaComAcoes(2, 0, 2), ['bonus', 'padrao'])).toEqual([]);
    });
    it('Bonus sozinha sem Bonus mas com Acao: nao falta', () => {
        expect(acoesEmFalta(fichaComAcoes(1, 0, 2), ['bonus'])).toEqual([]);
    });
    it('sem Bonus e sem Acao: falta a Bonus', () => {
        expect(acoesEmFalta(fichaComAcoes(0, 0, 2), ['bonus'])).toEqual(['Ação Bônus']);
    });
    it('lista vazia ou ausente nao falta nada', () => {
        expect(acoesEmFalta(fichaComAcoes(0, 0, 0), [])).toEqual([]);
        expect(acoesEmFalta(fichaComAcoes(0, 0, 0), undefined)).toEqual([]);
    });
    it('gastarAcoes: 1 Acao + 0 Bonus com [bonus, acao] deixa tudo em 0 e nunca negativo', () => {
        const f = fichaComAcoes(1, 0, 2);
        gastarAcoes(f, ['bonus', 'padrao']);
        expect(f.acoes.padrao.atual).toBe(0);
        expect(f.acoes.bonus.atual).toBe(0);
    });
    it('gastarAcoes: Bonus sem Bonus sobrando gasta uma Acao', () => {
        const f = fichaComAcoes(2, 0, 2);
        gastarAcoes(f, ['bonus']);
        expect(f.acoes.padrao.atual).toBe(1);
        expect(f.acoes.bonus.atual).toBe(0);
    });
    it('gastarAcoes: com tudo disponivel gasta uma de cada', () => {
        const f = fichaComAcoes(2, 2, 2);
        gastarAcoes(f, ['bonus', 'padrao', 'reacao']);
        expect(f.acoes).toMatchObject({ padrao: { atual: 1 }, bonus: { atual: 1 }, reacao: { atual: 1 } });
    });
    it('substituicoesDeAcao lista a Bonus paga com Acao, mas nao a que ficou sem nada', () => {
        expect(substituicoesDeAcao(fichaComAcoes(2, 0, 2), ['bonus'])).toEqual(['Ação Bônus']);
        expect(substituicoesDeAcao(fichaComAcoes(0, 0, 2), ['bonus'])).toEqual([]);
        expect(substituicoesDeAcao(fichaComAcoes(2, 2, 2), ['bonus'])).toEqual([]);
        expect(substituicoesDeAcao(fichaComAcoes(2, 2, 2), [])).toEqual([]);
    });
});

describe('avisosDoGasto', () => {
    it('gasto normal: "Gastou 1 X (restam N)"', () => {
        expect(avisosDoGasto(fichaComAcoes(2, 2, 2), ['reacao'])).toEqual([{ texto: 'Gastou 1 Reação (restam 1).', tipo: 'info' }]);
    });
    it('ultima Acao: avisa que acabaram', () => {
        expect(avisosDoGasto(fichaComAcoes(2, 2, 1), ['reacao'])).toEqual([
            { texto: 'Gastou 1 Reação (restam 0).', tipo: 'info' },
            { texto: 'Suas Reações acabaram.', tipo: 'alerta' }
        ]);
    });
    it('Bonus sem Bonus sobrando: avisa a substituicao', () => {
        const a = avisosDoGasto(fichaComAcoes(2, 0, 2), ['bonus']);
        expect(a).toEqual([{ texto: 'Sem Ação Bônus sobrando: usando 1 Ação no lugar (restam 1).', tipo: 'info' }]);
    });
    it('Bonus paga com a ultima Acao: avisa troca e que as Acoes acabaram', () => {
        const a = avisosDoGasto(fichaComAcoes(1, 0, 2), ['bonus']);
        expect(a.map(x => x.texto)).toEqual(['Sem Ação Bônus sobrando: usando 1 Ação no lugar (restam 0).', 'Suas Ações acabaram.']);
    });
    it('sem Acao nenhuma: "usado mesmo assim" como alerta', () => {
        expect(avisosDoGasto(fichaComAcoes(2, 2, 0), ['reacao'])).toEqual([{ texto: 'Sem Reação disponível: usado mesmo assim.', tipo: 'alerta' }]);
    });
    it('Bonus por ultimo: avisos vem na ordem simulada', () => {
        const a = avisosDoGasto(fichaComAcoes(2, 2, 2), ['bonus', 'padrao']);
        expect(a.map(x => x.texto)).toEqual(['Gastou 1 Ação (restam 1).', 'Gastou 1 Ação Bônus (restam 1).']);
    });
    it('lista vazia = sem avisos', () => { expect(avisosDoGasto(fichaComAcoes(2, 2, 2), [])).toEqual([]); });
});
