import { describe, it, expect } from 'vitest';
import {
    normalizarDuracao, normalizarDuracaoSpec, sortearDuracao, descreverDuracaoSpec, rotuloDuracao,
    duracoesDaFicha, duracaoDe, listarDuracoes, somarDuracao, aplicarEstadoComDuracao, sincronizarDuracoes,
    limparDuracoes, definirDuracaoManual, removerEstadoComDuracao, passarTurnoDosEstados
} from './duracaoEstados';

const fixo = (...valores) => { let i = 0; return () => valores[i++ % valores.length]; };

describe('duracaoEstados - sanitizacao', () => {
    it('normalizarDuracao: inteiro de 1 a 99, o resto vira null', () => {
        expect(normalizarDuracao(3)).toBe(3);
        expect(normalizarDuracao('4')).toBe(4);
        expect(normalizarDuracao(2.9)).toBe(2);
        expect(normalizarDuracao(500)).toBe(99);
        ['', null, undefined, 0, -3, 'abc', NaN, true, 0.5].forEach(v => expect(normalizarDuracao(v)).toBeNull());
    });
    it('normalizarDuracaoSpec aceita numero ou dado NdM(+K) em forma canonica', () => {
        expect(normalizarDuracaoSpec(2)).toBe(2);
        expect(normalizarDuracaoSpec('1d12+1')).toBe('1d12+1');
        expect(normalizarDuracaoSpec(' 1D10 ')).toBe('1d10');
        expect(normalizarDuracaoSpec('2d6 + 3')).toBe('2d6+3');
        expect(normalizarDuracaoSpec('0d6')).toBeNull();
        expect(normalizarDuracaoSpec('99d6')).toBeNull();
        expect(normalizarDuracaoSpec('1d6+500')).toBeNull();
        expect(normalizarDuracaoSpec('dado')).toBeNull();
        expect(normalizarDuracaoSpec({})).toBeNull();
    });
    it('sortearDuracao: numero direto, dado com rng injetado, limitado a 1..99', () => {
        expect(sortearDuracao(4)).toBe(4);
        expect(sortearDuracao('1d12+1', fixo(0.999))).toBe(13);
        expect(sortearDuracao('1d12+1', fixo(0))).toBe(2);
        expect(sortearDuracao('2d6', fixo(0, 0.999))).toBe(7);
        expect(sortearDuracao('20d100+99', fixo(0.999))).toBe(99);
        expect(sortearDuracao('lixo')).toBeNull();
    });
    it('textos em portugues', () => {
        expect(rotuloDuracao(1)).toBe('⏳ 1 turno');
        expect(rotuloDuracao(3)).toBe('⏳ 3 turnos');
        expect(rotuloDuracao(0)).toBe('');
        expect(descreverDuracaoSpec(1)).toBe('1 turno');
        expect(descreverDuracaoSpec('1d12+1')).toBe('1d12+1 turnos');
    });
    it('duracoesDaFicha so guarda estados validos e ativos, com turnos validos', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 2 }], duracaoEstados: { lento: 3, queimado: 0, imobilizado: 5, xx: 2 } };
        expect(duracoesDaFicha(f)).toEqual({ lento: 3 });
        expect(duracoesDaFicha({ duracaoEstados: [1] })).toEqual({});
        expect(duracoesDaFicha(null)).toEqual({});
        expect(duracaoDe(f, 'lento')).toBe(3);
        expect(duracaoDe(f, 'queimado')).toBe(0);
    });
    it('listarDuracoes entrega nome, icone e rotulo para a UI', () => {
        const f = { condicoes: [{ id: 'imobilizado', stacks: 1 }], duracaoEstados: { imobilizado: 1 } };
        expect(listarDuracoes(f)).toEqual([{ id: 'imobilizado', nome: 'Imobilizado', icone: '⛓️', restantes: 1, rotulo: '⏳ 1 turno' }]);
    });
});

describe('duracaoEstados - definir / renovar', () => {
    it('estado novo com duracao entra com ela; sem duracao e permanente (regressao)', () => {
        const f = {};
        aplicarEstadoComDuracao(f, 'imobilizado', 1, 'Natsu', 1);
        expect(f.condicoes).toEqual([{ id: 'imobilizado', stacks: 1, fonte: 'Natsu' }]);
        expect(f.duracaoEstados).toEqual({ imobilizado: 1 });
        const g = {};
        aplicarEstadoComDuracao(g, 'lento', 2);
        expect(g.condicoes).toEqual([{ id: 'lento', stacks: 2 }]);
        expect(g.duracaoEstados).toBeUndefined();
    });
    it('reaplicar renova para o MAIOR entre o restante e o novo', () => {
        const f = {};
        aplicarEstadoComDuracao(f, 'criogenia', 1, '', 4);
        f.duracaoEstados.criogenia = 2;
        aplicarEstadoComDuracao(f, 'criogenia', 1, '', 1);
        expect(f.duracaoEstados.criogenia).toBe(2);
        expect(f.condicoes[0].stacks).toBe(2);
        aplicarEstadoComDuracao(f, 'criogenia', 1, '', 5);
        expect(f.duracaoEstados.criogenia).toBe(5);
    });
    it('reaplicar SEM duracao torna permanente; permanente que recebe prazo continua permanente', () => {
        const f = {};
        aplicarEstadoComDuracao(f, 'lento', 1, '', 3);
        aplicarEstadoComDuracao(f, 'lento', 1, '', null);
        expect(f.duracaoEstados).toBeUndefined();
        aplicarEstadoComDuracao(f, 'lento', 1, '', 3);
        expect(f.duracaoEstados).toBeUndefined();
    });
    it('somarDuracao nao muta e ignora duracao invalida', () => {
        const mapa = { lento: 2 };
        expect(somarDuracao(mapa, 'lento', 7, true)).toEqual({ lento: 7 });
        expect(somarDuracao(mapa, 'queimado', 'xx', false)).toEqual({ lento: 2 });
        expect(mapa).toEqual({ lento: 2 });
    });
    it('id invalido nao faz nada', () => {
        const f = {};
        aplicarEstadoComDuracao(f, 'inexistente', 1, '', 2);
        expect(f).toEqual({});
    });
    it('definirDuracaoManual edita, tira o prazo e ignora estado que nao esta na ficha', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }] };
        expect(definirDuracaoManual(f, 'lento', 4)).toBe(true);
        expect(f.duracaoEstados).toEqual({ lento: 4 });
        expect(definirDuracaoManual(f, 'lento', '4')).toBe(false);
        expect(definirDuracaoManual(f, 'lento', '')).toBe(true);
        expect(f.duracaoEstados).toBeUndefined();
        expect(definirDuracaoManual(f, 'queimado', 3)).toBe(false);
        expect(f.duracaoEstados).toBeUndefined();
    });
});

describe('duracaoEstados - remocao', () => {
    it('sincronizarDuracoes apaga o prazo de quem saiu a mao', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 3, queimado: 2 } };
        expect(sincronizarDuracoes(f)).toBe(true);
        expect(f.duracaoEstados).toEqual({ lento: 3 });
        f.condicoes = [];
        sincronizarDuracoes(f);
        expect(f.duracaoEstados).toBeUndefined();
        expect(sincronizarDuracoes(f)).toBe(false);
    });
    it('removerEstadoComDuracao tira todos os stacks e o prazo', () => {
        const f = { condicoes: [{ id: 'queimado', stacks: 4 }, { id: 'lento', stacks: 1 }], duracaoEstados: { queimado: 3, lento: 2 } };
        expect(removerEstadoComDuracao(f, 'queimado')).toBe(true);
        expect(f.condicoes).toEqual([{ id: 'lento', stacks: 1 }]);
        expect(f.duracaoEstados).toEqual({ lento: 2 });
        expect(removerEstadoComDuracao(f, 'queimado')).toBe(false);
        removerEstadoComDuracao(f, 'lento');
        expect(f.condicoes).toBeUndefined();
        expect(f.duracaoEstados).toBeUndefined();
    });
    it('limparDuracoes', () => {
        const f = { duracaoEstados: { lento: 1 } };
        expect(limparDuracoes(f)).toBe(true);
        expect(f.duracaoEstados).toBeUndefined();
        expect(limparDuracoes(f)).toBe(false);
    });
});

describe('duracaoEstados - passar o turno', () => {
    it('decrementa; ao chegar a 0 o estado sai por completo (todos os stacks) com mensagem', () => {
        const f = { condicoes: [{ id: 'imobilizado', stacks: 3 }, { id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 2 }], duracaoEstados: { imobilizado: 1, lento: 3 } };
        const r = passarTurnoDosEstados(f);
        expect(r.expirados).toEqual(['imobilizado']);
        expect(r.textos).toEqual(['⛓️ Imobilizado terminou']);
        expect(f.condicoes.map(c => c.id)).toEqual(['lento', 'queimado']);
        expect(f.duracaoEstados).toEqual({ lento: 2 });
        passarTurnoDosEstados(f);
        const fim = passarTurnoDosEstados(f);
        expect(fim.expirados).toEqual(['lento']);
        expect(f.condicoes).toEqual([{ id: 'queimado', stacks: 2 }]);
        expect(f.duracaoEstados).toBeUndefined();
    });
    it('regressao: ficha sem duracao nao muda nada', () => {
        const f = { condicoes: [{ id: 'queimado', stacks: 2 }] };
        const antes = JSON.stringify(f);
        const r = passarTurnoDosEstados(f);
        expect(r).toEqual({ expirados: [], textos: [], mudou: false });
        expect(JSON.stringify(f)).toBe(antes);
        expect(passarTurnoDosEstados({}).mudou).toBe(false);
    });
    it('prazo orfao (estado ja removido) e limpo sem mensagem', () => {
        const f = { condicoes: [], duracaoEstados: { lento: 2 } };
        const r = passarTurnoDosEstados(f);
        expect(r.textos).toEqual([]);
        expect(f.duracaoEstados).toBeUndefined();
    });
});
