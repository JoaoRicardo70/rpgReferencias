import { describe, it, expect } from 'vitest';
import {
    TIPOS_ACAO_TECNICA, normalizarTipoAcao, getRotuloAcaoTecnica, getTipoRastreado,
    tiposRastreadosDe, acoesEmFalta, gastarAcoes
} from './acoesTecnica.js';

const fichaComAcoes = (padrao, bonus, reacao) => ({
    acoes: {
        padrao: { max: 2, atual: padrao, extra: 0 },
        bonus: { max: 2, atual: bonus, extra: 0 },
        reacao: { max: 2, atual: reacao, extra: 0 }
    }
});

describe('normalizarTipoAcao', () => {
    it('aceita os ids conhecidos', () => {
        for (const id of ['acao', 'bonus', 'reacao', 'movimento', 'livre']) expect(normalizarTipoAcao(id)).toBe(id);
    });
    it('faz trim', () => { expect(normalizarTipoAcao('  reacao ')).toBe('reacao'); });
    it.each([undefined, null, '', 'padrao', 'ACAO', 'xyz', 42, {}, []])('valor invalido %j vira vazio', (v) => {
        expect(normalizarTipoAcao(v)).toBe('');
    });
});

describe('getRotuloAcaoTecnica', () => {
    it('devolve o rotulo de cada tipo', () => {
        expect(getRotuloAcaoTecnica('acao')).toBe('Ação');
        expect(getRotuloAcaoTecnica('bonus')).toBe('Ação Bônus');
        expect(getRotuloAcaoTecnica('reacao')).toBe('Reação');
        expect(getRotuloAcaoTecnica('movimento')).toBe('Movimento');
        expect(getRotuloAcaoTecnica('livre')).toBe('Ação Livre');
    });
    it('vazio/invalido/undefined devolve string vazia', () => {
        expect(getRotuloAcaoTecnica('')).toBe('');
        expect(getRotuloAcaoTecnica(undefined)).toBe('');
        expect(getRotuloAcaoTecnica('lixo')).toBe('');
    });
});

describe('getTipoRastreado', () => {
    it('acao->padrao, bonus->bonus, reacao->reacao', () => {
        expect(getTipoRastreado('acao')).toBe('padrao');
        expect(getTipoRastreado('bonus')).toBe('bonus');
        expect(getTipoRastreado('reacao')).toBe('reacao');
    });
    it('movimento, livre, vazio e invalido nao sao rastreados', () => {
        for (const v of ['movimento', 'livre', '', undefined, null, 'x']) expect(getTipoRastreado(v)).toBeNull();
    });
    it('TIPOS_ACAO_TECNICA tem so 3 tipos rastreados', () => {
        expect(TIPOS_ACAO_TECNICA.filter(t => t.rastreada).map(t => t.id)).toEqual(['acao', 'bonus', 'reacao']);
    });
});

describe('tiposRastreadosDe', () => {
    it('lista vazia, nula ou undefined devolve []', () => {
        expect(tiposRastreadosDe([])).toEqual([]);
        expect(tiposRastreadosDe(null)).toEqual([]);
        expect(tiposRastreadosDe(undefined)).toEqual([]);
    });
    it('ignora tecnicas sem tipo, Movimento, Livre e entradas nulas', () => {
        expect(tiposRastreadosDe([{}, { tipoAcao: 'movimento' }, { tipoAcao: 'livre' }, null, undefined, { tipoAcao: '' }])).toEqual([]);
    });
    it('nao duplica o mesmo tipo', () => {
        expect(tiposRastreadosDe([{ tipoAcao: 'acao' }, { tipoAcao: 'acao' }, { tipoAcao: 'reacao' }, { tipoAcao: 'reacao' }])).toEqual(['padrao', 'reacao']);
    });
    it('mistura os tres tipos na ordem de aparicao', () => {
        expect(tiposRastreadosDe([{ tipoAcao: 'bonus' }, { tipoAcao: 'acao' }, { tipoAcao: 'reacao' }])).toEqual(['bonus', 'padrao', 'reacao']);
    });
});

describe('acoesEmFalta', () => {
    it('sem tipos pedidos devolve []', () => {
        expect(acoesEmFalta(fichaComAcoes(0, 0, 0), [])).toEqual([]);
        expect(acoesEmFalta(fichaComAcoes(0, 0, 0), null)).toEqual([]);
        expect(acoesEmFalta(fichaComAcoes(0, 0, 0))).toEqual([]);
    });
    it('com Acao disponivel nao falta nada', () => {
        expect(acoesEmFalta(fichaComAcoes(1, 2, 2), ['padrao', 'bonus', 'reacao'])).toEqual([]);
    });
    it('atual 0 devolve o rotulo do tipo', () => {
        expect(acoesEmFalta(fichaComAcoes(0, 2, 0), ['padrao', 'bonus', 'reacao'])).toEqual(['Ação', 'Reação']);
    });
    it('so olha os tipos pedidos', () => {
        expect(acoesEmFalta(fichaComAcoes(0, 0, 0), ['bonus'])).toEqual(['Ação Bônus']);
    });
    it('ficha sem acoes usa o maximo base (2): nada em falta', () => {
        expect(acoesEmFalta({}, ['padrao', 'bonus', 'reacao'])).toEqual([]);
    });
    it('ficha nula nao quebra', () => {
        expect(acoesEmFalta(null, ['padrao'])).toEqual([]);
    });
    it('atual negativo gravado conta como em falta', () => {
        expect(acoesEmFalta(fichaComAcoes(-3, 2, 2), ['padrao'])).toEqual(['Ação']);
    });
});

describe('gastarAcoes', () => {
    it('desconta 1 de cada tipo pedido', () => {
        const f = fichaComAcoes(2, 2, 2);
        gastarAcoes(f, ['padrao', 'reacao']);
        expect(f.acoes.padrao.atual).toBe(1);
        expect(f.acoes.reacao.atual).toBe(1);
        expect(f.acoes.bonus.atual).toBe(2);
    });
    it('nunca fica abaixo de 0', () => {
        const f = fichaComAcoes(0, 1, 2);
        gastarAcoes(f, ['padrao', 'bonus']);
        gastarAcoes(f, ['bonus', 'padrao']);
        expect(f.acoes.padrao.atual).toBe(0);
        expect(f.acoes.bonus.atual).toBe(0);
    });
    it('ficha sem acoes cria a estrutura e desconta do maximo base', () => {
        const f = {};
        gastarAcoes(f, ['padrao']);
        expect(f.acoes.padrao.atual).toBe(1);
        expect(f.acoes.padrao.max).toBe(2);
        expect(f.acoes.bonus.atual).toBe(2);
    });
    it('lista vazia/nula nao muda nada', () => {
        const f = fichaComAcoes(2, 2, 2);
        const antes = JSON.stringify(f);
        gastarAcoes(f, []); gastarAcoes(f, null); gastarAcoes(f);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('ignora tipos desconhecidos', () => {
        const f = fichaComAcoes(2, 2, 2);
        gastarAcoes(f, ['movimento']);
        expect(f.acoes.padrao.atual).toBe(2);
    });
});
