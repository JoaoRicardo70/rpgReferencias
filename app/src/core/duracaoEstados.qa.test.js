import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(),
    salvarDummie: vi.fn()
}));

import {
    normalizarDuracao, normalizarDuracaoSpec, sortearDuracao, descreverDuracaoSpec, rotuloDuracao,
    duracoesDaFicha, duracaoDe, listarDuracoes, somarDuracao, aplicarEstadoComDuracao, sincronizarDuracoes,
    limparDuracoes, definirDuracaoManual, removerEstadoComDuracao, passarTurnoDosEstados
} from './duracaoEstados';
import { normalizarAplicaEstados, resolverEstadosNoAlvo, juntarAplicados } from './estadosGolpe';
import { normalizarAcaoGatilho } from './gatilhos';
import { aplicarAcoesNoRascunho } from './gatilhosAplicar';
import { prepararItemImportado } from './importadorIA';
import { prepararTecnicaImportada } from './importadorTecnicas';
import { descreverExtrasProposta, normalizarPoder, normalizarMagia, normalizarItem } from './sextaFeiraCriacao';
import { estadoDoAlvoComEstados, gravarEstadosNoAlvo } from '../services/posGolpe';
import { salvarCamposPersonagem } from '../services/firebase-sync';

const rng = (v) => () => v;

describe('QA normalizarDuracao - sanitizacao', () => {
    it.each([
        [NaN, null], [Infinity, null], [-Infinity, null], [-1, null], [-0.5, null], [0, null], [0.9, null],
        [1, 1], [1.9, 1], [99, 99], [100, 99], [1e9, 99], ['1e9', 99], ['  5 ', 5], ['2,5', 2], ['2.5', 2],
        ['', null], ['   ', null], ['abc', null], ['0', null], ['-3', null], ['5 turnos', null],
        [null, null], [undefined, null], [true, null], [false, null], [{}, null], [() => 1, null],
    ])('normalizarDuracao(%j) = %j', (entrada, esperado) => {
        expect(normalizarDuracao(entrada)).toBe(esperado);
    });
});

describe('QA normalizarDuracaoSpec - dados', () => {
    it.each([
        ['0d6', null], ['1d0', null], ['999d999', null], ['1d6+abc', null], ['d6', null], ['1d', null], ['1d6+', null],
        ['1d6-1', null], ['1d6+100', null], ['21d6', null], ['20d6', '20d6'], ['1d101', null], ['1d100', '1d100'],
        ['1d6+99', '1d6+99'], ['1d6+0', '1d6'], [' 2D6 + 3 ', '2d6+3'], ['2D6', '2d6'], ['01d06', '1d6'],
        ['1d6 +2', '1d6+2'], ['1d6;drop', null], ['1d6d6', null],
        ['3', 3], [3, 3], ['150', 99], ['0', null], [0, null], [null, null], [undefined, null], [[], null], [{}, null], [true, null],
    ])('normalizarDuracaoSpec(%j) = %j', (entrada, esperado) => {
        expect(normalizarDuracaoSpec(entrada)).toBe(esperado);
    });
});

describe('QA sortearDuracao / descrever / rotulo', () => {
    it('limites do dado com rng fixo', () => {
        expect(sortearDuracao('1d6', rng(0))).toBe(1);
        expect(sortearDuracao('1d6', rng(0.999999))).toBe(6);
        expect(sortearDuracao('2d6+3', rng(0))).toBe(5);
        expect(sortearDuracao('2d6+3', rng(0.999))).toBe(15);
        expect(sortearDuracao('1d1', rng(0.5))).toBe(1);
    });
    it('soma muito grande e limitada a 99', () => {
        expect(sortearDuracao('20d100+99', rng(0.999))).toBe(99);
    });
    it('spec invalido devolve null; numero devolve ele mesmo; rng nao e chamado', () => {
        const r = vi.fn(() => 0.5);
        expect(sortearDuracao('0d6', r)).toBeNull();
        expect(sortearDuracao('1d6+abc', r)).toBeNull();
        expect(sortearDuracao(null, r)).toBeNull();
        expect(sortearDuracao(0, r)).toBeNull();
        expect(sortearDuracao(7, r)).toBe(7);
        expect(sortearDuracao(500, r)).toBe(99);
        expect(r).not.toHaveBeenCalled();
    });
    it('rng chamado N vezes', () => {
        const r = vi.fn(() => 0);
        sortearDuracao('3d4', r);
        expect(r).toHaveBeenCalledTimes(3);
    });
    it('descrever e rotulo (singular/plural/vazio)', () => {
        expect(descreverDuracaoSpec(1)).toBe('1 turno');
        expect(descreverDuracaoSpec(2)).toBe('2 turnos');
        expect(descreverDuracaoSpec('1d12+1')).toBe('1d12+1 turnos');
        expect(descreverDuracaoSpec('0d6')).toBe('');
        expect(descreverDuracaoSpec(null)).toBe('');
        expect(rotuloDuracao(1)).toBe('⏳ 1 turno');
        expect(rotuloDuracao(500)).toBe('⏳ 99 turnos');
        expect(rotuloDuracao(0)).toBe('');
        expect(rotuloDuracao('x')).toBe('');
    });
});

describe('QA duracoesDaFicha - mapa com orfaos e lixo', () => {
    it('ignora orfaos (estado nao ativo), ids invalidos e valores invalidos', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 1 }], duracaoEstados: { lento: '3', queimado: 0, sangrando: 4, xyz: 2, criogenia: NaN } };
        expect(duracoesDaFicha(f)).toEqual({ lento: 3 });
        expect(duracaoDe(f, 'sangrando')).toBe(0);
        expect(duracaoDe(f, 'lento')).toBe(3);
    });
    it.each([[null], [undefined], [[]], ['x'], [5], [[3]]])('duracaoEstados bruto %j vira {}', (bruto) => {
        expect(duracoesDaFicha({ condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: bruto })).toEqual({});
    });
    it('ficha nula/indefinida nao quebra', () => {
        expect(duracoesDaFicha(null)).toEqual({});
        expect(duracoesDaFicha(undefined)).toEqual({});
        expect(listarDuracoes(null)).toEqual([]);
    });
    it('valores acima de 99 sao limpos na leitura', () => {
        expect(duracoesDaFicha({ condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 1e9 } })).toEqual({ lento: 99 });
    });
    it('listarDuracoes so devolve ativos com prazo, na ordem das condicoes', () => {
        const f = { condicoes: [{ id: 'queimado', stacks: 1 }, { id: 'lento', stacks: 1 }, { id: 'criogenia', stacks: 1 }], duracaoEstados: { lento: 2, queimado: 1, fantasma: 3 } };
        expect(listarDuracoes(f).map(x => [x.id, x.restantes])).toEqual([['queimado', 1], ['lento', 2]]);
    });
});

describe('QA somarDuracao - todas as combinacoes (renovar / permanente / prazo)', () => {
    it('estado novo: com prazo entra; sem prazo fica sem entrada', () => {
        expect(somarDuracao({}, 'lento', 3, false)).toEqual({ lento: 3 });
        expect(somarDuracao({}, 'lento', null, false)).toEqual({});
        expect(somarDuracao({}, 'lento', 0, false)).toEqual({});
        expect(somarDuracao({}, 'lento', 'abc', false)).toEqual({});
        expect(somarDuracao(undefined, 'lento', 2, false)).toEqual({ lento: 2 });
    });
    it('existente com prazo: renova para o MAIOR', () => {
        expect(somarDuracao({ lento: 2 }, 'lento', 5, true)).toEqual({ lento: 5 });
        expect(somarDuracao({ lento: 5 }, 'lento', 2, true)).toEqual({ lento: 5 });
        expect(somarDuracao({ lento: 4 }, 'lento', 4, true)).toEqual({ lento: 4 });
    });
    it('existente com prazo reaplicado permanente torna permanente', () => {
        expect(somarDuracao({ lento: 2 }, 'lento', null, true)).toEqual({});
        expect(somarDuracao({ lento: 2 }, 'lento', 0, true)).toEqual({});
    });
    it('existente permanente que recebe prazo continua permanente', () => {
        expect(somarDuracao({}, 'lento', 5, true)).toEqual({});
        expect(somarDuracao({ queimado: 1 }, 'lento', 5, true)).toEqual({ queimado: 1 });
    });
    it('existente permanente reaplicado permanente: nada', () => {
        expect(somarDuracao({}, 'lento', null, true)).toEqual({});
    });
    it('nao muta o mapa de entrada e preserva outros ids', () => {
        const m = Object.freeze({ lento: 2, queimado: 3 });
        expect(somarDuracao(m, 'lento', 9, true)).toEqual({ lento: 9, queimado: 3 });
        expect(m).toEqual({ lento: 2, queimado: 3 });
    });
    it('dado cru (string NdM) nao e aceito aqui: so turnos ja sorteados', () => {
        expect(somarDuracao({}, 'lento', '1d6', false)).toEqual({});
    });
});

describe('QA aplicarEstadoComDuracao na ficha', () => {
    it('encadeia renovar -> permanente -> prazo', () => {
        const f = {};
        aplicarEstadoComDuracao(f, 'lento', 1, 'A', 3);
        expect(f.duracaoEstados).toEqual({ lento: 3 });
        aplicarEstadoComDuracao(f, 'lento', 1, 'A', 2);
        expect(f.duracaoEstados).toEqual({ lento: 3 });
        aplicarEstadoComDuracao(f, 'lento', 1, 'A', 8);
        expect(f.duracaoEstados).toEqual({ lento: 8 });
        aplicarEstadoComDuracao(f, 'lento', 1, 'A', null);
        expect(f.duracaoEstados).toBeUndefined();
        aplicarEstadoComDuracao(f, 'lento', 1, 'A', 4);
        expect(f.duracaoEstados).toBeUndefined();
        expect(f.condicoes.find(c => c.id === 'lento').stacks).toBe(5);
    });
    it('stacks respeitam o teto de 6', () => {
        const f = {};
        for (let i = 0; i < 10; i++) aplicarEstadoComDuracao(f, 'lento', 2, '', 1);
        expect(f.condicoes.find(c => c.id === 'lento').stacks).toBe(6);
    });
    it('id invalido, ficha nula: nao grava nada nem quebra', () => {
        const f = {};
        aplicarEstadoComDuracao(f, 'inexistente', 1, '', 3);
        aplicarEstadoComDuracao(null, 'lento', 1, '', 3);
        expect(f).toEqual({});
    });
    it('duracao de OUTRO estado e preservada ao aplicar um novo', () => {
        const f = { condicoes: [{ id: 'queimado', stacks: 1 }], duracaoEstados: { queimado: 2 } };
        aplicarEstadoComDuracao(f, 'lento', 1, '', 5);
        expect(f.duracaoEstados).toEqual({ queimado: 2, lento: 5 });
    });
    it('limpa orfaos antigos ao regravar o mapa', () => {
        const f = { condicoes: [{ id: 'queimado', stacks: 1 }], duracaoEstados: { queimado: 2, sangrando: 9 } };
        aplicarEstadoComDuracao(f, 'lento', 1, '', 5);
        expect(f.duracaoEstados).toEqual({ queimado: 2, lento: 5 });
    });
});

describe('QA remover / limpar / sincronizar / manual', () => {
    it('removerEstadoComDuracao apaga o prazo so dele; remove todos os stacks', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 4 }, { id: 'queimado', stacks: 1 }], duracaoEstados: { lento: 3, queimado: 2 } };
        expect(removerEstadoComDuracao(f, 'lento')).toBe(true);
        expect(f.condicoes).toEqual([{ id: 'queimado', stacks: 1 }]);
        expect(f.duracaoEstados).toEqual({ queimado: 2 });
        expect(removerEstadoComDuracao(f, 'queimado')).toBe(true);
        expect(f.condicoes).toBeUndefined();
        expect(f.duracaoEstados).toBeUndefined();
    });
    it('remover estado ausente: false e nada muda', () => {
        const f = { condicoes: [{ id: 'queimado', stacks: 1 }], duracaoEstados: { queimado: 2 } };
        expect(removerEstadoComDuracao(f, 'lento')).toBe(false);
        expect(removerEstadoComDuracao(null, 'lento')).toBe(false);
        expect(f.duracaoEstados).toEqual({ queimado: 2 });
    });
    it('remover estado sem condicoes na ficha nao cria campos', () => {
        const f = {};
        expect(removerEstadoComDuracao(f, 'lento')).toBe(false);
        expect(f).toEqual({});
    });
    it('limparDuracoes', () => {
        const f = { duracaoEstados: { lento: 1 } };
        expect(limparDuracoes(f)).toBe(true);
        expect('duracaoEstados' in f).toBe(false);
        expect(limparDuracoes(f)).toBe(false);
        expect(limparDuracoes(null)).toBe(false);
    });
    it('sincronizarDuracoes: tira orfaos; sem mudanca devolve false', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 2, queimado: 3 } };
        expect(sincronizarDuracoes(f)).toBe(true);
        expect(f.duracaoEstados).toEqual({ lento: 2 });
        expect(sincronizarDuracoes(f)).toBe(false);
        const g = { duracaoEstados: { lento: 2 } };
        expect(sincronizarDuracoes(g)).toBe(true);
        expect(g.duracaoEstados).toBeUndefined();
        expect(sincronizarDuracoes({})).toBe(false);
        expect(sincronizarDuracoes(null)).toBe(false);
    });
    it('definirDuracaoManual: valores validos, vazios e invalidos', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }] };
        expect(definirDuracaoManual(f, 'lento', '7')).toBe(true);
        expect(f.duracaoEstados).toEqual({ lento: 7 });
        expect(definirDuracaoManual(f, 'lento', 7)).toBe(false);
        expect(definirDuracaoManual(f, 'lento', 1e9)).toBe(true);
        expect(f.duracaoEstados).toEqual({ lento: 99 });
        expect(definirDuracaoManual(f, 'lento', 'abc')).toBe(true); // invalido = permanente
        expect(f.duracaoEstados).toBeUndefined();
        expect(definirDuracaoManual(f, 'lento', '')).toBe(false);
        definirDuracaoManual(f, 'lento', 3);
        expect(definirDuracaoManual(f, 'lento', -4)).toBe(true);
        expect(f.duracaoEstados).toBeUndefined();
        definirDuracaoManual(f, 'lento', 3);
        expect(definirDuracaoManual(f, 'lento', 0)).toBe(true);
        expect(f.duracaoEstados).toBeUndefined();
    });
    it('definirDuracaoManual: estado nao ativo, id invalido, ficha nula', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }] };
        expect(definirDuracaoManual(f, 'queimado', 3)).toBe(false);
        expect(definirDuracaoManual(f, 'xyz', 3)).toBe(false);
        expect(definirDuracaoManual(null, 'lento', 3)).toBe(false);
        expect(f.duracaoEstados).toBeUndefined();
    });
});

describe('QA passarTurnoDosEstados', () => {
    it('varios estados expirando no mesmo turno, o resto desce 1, permanentes intactos', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 3 }, { id: 'queimado', stacks: 1 }, { id: 'sangrando', stacks: 2 }, { id: 'criogenia', stacks: 1 }], duracaoEstados: { lento: 1, queimado: 1, sangrando: 3 } };
        const r = passarTurnoDosEstados(f);
        expect(r.expirados.sort()).toEqual(['lento', 'queimado']);
        expect(r.textos).toHaveLength(2);
        expect(r.textos.join('|')).toContain('Lento terminou');
        expect(r.textos.join('|')).toContain('Queimado terminou');
        expect(r.mudou).toBe(true);
        expect(f.condicoes.map(c => c.id).sort()).toEqual(['criogenia', 'sangrando']);
        expect(f.duracaoEstados).toEqual({ sangrando: 2 });
    });
    it('todos expiram: condicoes e duracaoEstados somem', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 1 }], duracaoEstados: { lento: 1, queimado: 1 } };
        passarTurnoDosEstados(f);
        expect(f.condicoes).toBeUndefined();
        expect(f.duracaoEstados).toBeUndefined();
    });
    it('somente orfaos: nada expira, orfaos sao limpos, mudou=true', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { queimado: 1, xyz: 1 } };
        const r = passarTurnoDosEstados(f);
        expect(r).toEqual({ expirados: [], textos: [], mudou: true });
        expect(f.condicoes).toEqual([{ id: 'lento', stacks: 1 }]);
        expect(f.duracaoEstados).toBeUndefined();
    });
    it('orfao junto com ativo: ativo desce, orfao nao gera texto', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 2, queimado: 1 } };
        const r = passarTurnoDosEstados(f);
        expect(r.textos).toEqual([]);
        expect(f.duracaoEstados).toEqual({ lento: 1 });
    });
    it('sem duracaoEstados / ficha nula: regressao zero, nada gravado', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 2 }] };
        expect(passarTurnoDosEstados(f)).toEqual({ expirados: [], textos: [], mudou: false });
        expect(passarTurnoDosEstados(null)).toEqual({ expirados: [], textos: [], mudou: false });
        expect(passarTurnoDosEstados(undefined).mudou).toBe(false);
        expect(f).toEqual({ condicoes: [{ id: 'lento', stacks: 2 }] });
        expect('duracaoEstados' in f).toBe(false);
    });
    it('cru acima de 99 e lido como 99 e desce para 98', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 1e9 } };
        passarTurnoDosEstados(f);
        expect(f.duracaoEstados).toEqual({ lento: 98 });
    });
    it('N turnos exatos: expira no N-esimo', () => {
        const f = {};
        aplicarEstadoComDuracao(f, 'lento', 1, '', 3);
        expect(passarTurnoDosEstados(f).expirados).toEqual([]);
        expect(passarTurnoDosEstados(f).expirados).toEqual([]);
        expect(passarTurnoDosEstados(f).expirados).toEqual(['lento']);
        expect(f.condicoes).toBeUndefined();
    });
});

describe('QA estadosGolpe - normalizar / resolver / juntar', () => {
    it('normalizarAplicaEstados com duracoes invalidas nao descarta o estado, so o prazo', () => {
        const r = normalizarAplicaEstados([
            { id: 'lento', stacks: 1, duracao: '0d6' }, { id: 'queimado', stacks: 1, duracao: '1d0' },
            { id: 'sangrando', stacks: 1, duracao: '999d999' }, { id: 'criogenia', stacks: 1, duracao: '1d6+abc' },
            { id: 'imobilizado', stacks: 1, duracao: NaN }, { id: 'exausto', stacks: 1, duracao: -3 },
            { id: 'envenenado', stacks: 1, duracao: ' 2D6 + 1 ' }, { id: 'amedrontado', stacks: 1, duracao: 1e9 },
        ]);
        expect(r.map(e => e.id)).toEqual(['lento', 'queimado', 'sangrando', 'criogenia', 'imobilizado', 'exausto', 'envenenado', 'amedrontado']);
        expect(r.slice(0, 6).every(e => !('duracao' in e))).toBe(true);
        expect(r[6].duracao).toBe('2d6+1');
        expect(r[7].duracao).toBe(99);
    });
    it('estado fora dos 17 e descartado mesmo com duracao valida', () => {
        expect(normalizarAplicaEstados([{ id: 'congelado', stacks: 1, duracao: 3 }, { id: 'lento', stacks: 1, duracao: 3 }])).toEqual([{ id: 'lento', stacks: 1, duracao: 3 }]);
    });
    it('resolver: duracao com dado usa rng; lixo nao grava duracao', () => {
        const r = resolverEstadosNoAlvo([{ id: 'lento', stacks: 1, duracao: '2d6' }], null, { rng: rng(0) });
        expect(r.aplicados[0].duracao).toBe(2);
        const r2 = resolverEstadosNoAlvo([{ id: 'lento', stacks: 1, duracao: 'lixo' }], null, { rng: rng(0) });
        expect('duracao' in r2.aplicados[0]).toBe(false);
    });
    it('resolver: rng nao e chamado para quem resistiu', () => {
        const alvo = { forca: { base: 50000 } };
        const r = vi.fn(() => 0.5);
        resolverEstadosNoAlvo([{ id: 'lento', stacks: 1, duracao: '3d6', teste: { atributo: 'forca', cd: 5 } }], alvo, { rolar: () => 20, rng: r });
        expect(r).not.toHaveBeenCalled();
    });
    it('juntarAplicados com varias fontes', () => {
        expect(juntarAplicados([{ id: 'lento', stacks: 1, duracao: 2 }, { id: 'lento', stacks: 1, duracao: 5 }, { id: 'lento', stacks: 1, duracao: 3 }])).toEqual([{ id: 'lento', stacks: 3, duracao: 5 }]);
        expect(juntarAplicados([{ id: 'lento', stacks: 1 }, { id: 'lento', stacks: 1, duracao: 5 }])).toEqual([{ id: 'lento', stacks: 2 }]);
        expect(juntarAplicados([{ id: 'lento', stacks: 1, duracao: 5 }, { id: 'lento', stacks: 1 }, { id: 'lento', stacks: 1, duracao: 9 }])).toEqual([{ id: 'lento', stacks: 3 }]);
        expect(juntarAplicados([{ id: 'lento', stacks: 1, duracao: 5 }, { id: 'lento', stacks: 1, duracao: 9 }, { id: 'lento', stacks: 1 }])).toEqual([{ id: 'lento', stacks: 3 }]);
        expect(juntarAplicados([{ id: 'lento', stacks: 5, duracao: 99 }, { id: 'lento', stacks: 5, duracao: 99 }])).toEqual([{ id: 'lento', stacks: 6, duracao: 99 }]);
        expect(juntarAplicados([{ id: 'lento', stacks: 9, duracao: 4 }])).toEqual([{ id: 'lento', stacks: 6, duracao: 4 }]);
        expect(juntarAplicados([{ id: 'lento', stacks: 1, duracao: 1 }, { id: 'queimado', stacks: 1 }])).toEqual([{ id: 'lento', stacks: 1, duracao: 1 }, { id: 'queimado', stacks: 1 }]);
        expect(juntarAplicados([])).toEqual([]);
        expect(juntarAplicados(null)).toEqual([]);
    });
    it('juntarAplicados com duracao lixo trata como permanente', () => {
        expect(juntarAplicados([{ id: 'lento', stacks: 1, duracao: 'abc' }])).toEqual([{ id: 'lento', stacks: 1 }]);
        expect(juntarAplicados([{ id: 'lento', stacks: 1, duracao: 0 }, { id: 'lento', stacks: 1, duracao: 3 }])).toEqual([{ id: 'lento', stacks: 2 }]);
    });
    it('juntarAplicados nao muta a entrada', () => {
        const e = [{ id: 'lento', stacks: 1, duracao: 2 }, { id: 'lento', stacks: 1, duracao: 5 }];
        const copia = JSON.parse(JSON.stringify(e));
        juntarAplicados(e);
        expect(e).toEqual(copia);
    });
});

describe('QA gatilho aplicarEstado com duracao', () => {
    it('normalizarAcaoGatilho: invalidas descartam so a duracao; estado fora dos 17 descarta a acao', () => {
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'lento', duracao: '0d6' })).toEqual({ tipo: 'aplicarEstado', estado: 'lento', stacks: 1 });
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'lento', duracao: -2 })).toEqual({ tipo: 'aplicarEstado', estado: 'lento', stacks: 1 });
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'lento', duracao: 1e9 }).duracao).toBe(99);
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'lento', duracao: ' 1D6 ' }).duracao).toBe('1d6');
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'congelado', duracao: 3 })).toBeNull();
    });
    it('aplicar com dado e rng fixo (min e max) e sem rng no contexto nao quebra', () => {
        const a = { tipo: 'aplicarEstado', estado: 'imobilizado', stacks: 1, duracao: '1d12+1', gatilhoNome: 'G' };
        const f1 = {}; aplicarAcoesNoRascunho(f1, [a], { rng: rng(0) });
        expect(f1.duracaoEstados).toEqual({ imobilizado: 2 });
        const f2 = {}; aplicarAcoesNoRascunho(f2, [a], { rng: rng(0.999999) });
        expect(f2.duracaoEstados).toEqual({ imobilizado: 13 });
        const f3 = {}; expect(() => aplicarAcoesNoRascunho(f3, [a], {})).not.toThrow();
        expect(f3.duracaoEstados.imobilizado).toBeGreaterThanOrEqual(2);
        expect(f3.duracaoEstados.imobilizado).toBeLessThanOrEqual(13);
    });
    it('reaplicar via gatilho: renova para o maior; sem duracao torna permanente e marca caminho', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 5 } };
        let r = aplicarAcoesNoRascunho(f, [{ tipo: 'aplicarEstado', estado: 'lento', stacks: 1, duracao: 2, gatilhoNome: 'G' }], {});
        expect(f.duracaoEstados).toEqual({ lento: 5 });
        expect(r.caminhos).not.toContain('duracaoEstados');
        r = aplicarAcoesNoRascunho(f, [{ tipo: 'aplicarEstado', estado: 'lento', stacks: 1, gatilhoNome: 'G' }], {});
        expect(f.duracaoEstados).toBeUndefined();
        expect(r.caminhos).toEqual(expect.arrayContaining(['condicoes', 'duracaoEstados']));
    });
    it('removerEstado de estado ausente nao mexe na duracao nem marca caminho', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 2 } };
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'removerEstado', estado: 'queimado', gatilhoNome: 'G' }], {});
        expect(f.duracaoEstados).toEqual({ lento: 2 });
        expect(r.caminhos).not.toContain('duracaoEstados');
    });
    it('limparCondicoes sem condicoes nao marca duracaoEstados', () => {
        const f = {};
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'limparCondicoes', gatilhoNome: 'G' }], {});
        expect(r.caminhos).not.toContain('duracaoEstados');
    });
});

describe('QA posGolpe - estados com prazo no alvo', () => {
    it('Dummie: devolve alvo com duracaoEstados; sem prazo nao cria a chave', () => {
        const alvo = { nome: 'B', condicoes: [] };
        const r = gravarEstadosNoAlvo('d1', alvo, [{ id: 'lento', stacks: 1, duracao: 3 }]);
        expect(r.duracaoEstados).toEqual({ lento: 3 });
        const r2 = gravarEstadosNoAlvo('d1', alvo, [{ id: 'lento', stacks: 1 }]);
        expect('duracaoEstados' in r2).toBe(false);
        expect(alvo.duracaoEstados).toBeUndefined();
    });
    it('Dummie com prazo velho + reaplicado permanente: chave removida sem mutar o original', () => {
        const alvo = { nome: 'B', condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 3 } };
        const r = gravarEstadosNoAlvo('d1', alvo, [{ id: 'lento', stacks: 1 }]);
        expect('duracaoEstados' in r).toBe(false);
        expect(alvo.duracaoEstados).toEqual({ lento: 3 });
    });
    it('personagem: grava duracaoEstados so se mudou (null apaga); sem prazo grava so condicoes', () => {
        salvarCamposPersonagem.mockClear();
        gravarEstadosNoAlvo('p', { isPersonagem: true, personagemNome: 'Rival', ficha: {} }, [{ id: 'lento', stacks: 1 }]);
        expect(Object.keys(salvarCamposPersonagem.mock.calls[0][1])).toEqual(['condicoes']);
        salvarCamposPersonagem.mockClear();
        gravarEstadosNoAlvo('p', { isPersonagem: true, personagemNome: 'Rival', ficha: {} }, [{ id: 'lento', stacks: 1, duracao: 2 }]);
        expect(salvarCamposPersonagem.mock.calls[0][1].duracaoEstados).toEqual({ lento: 2 });
        salvarCamposPersonagem.mockClear();
        gravarEstadosNoAlvo('p', { isPersonagem: true, personagemNome: 'Rival', ficha: { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 2 } } }, [{ id: 'lento', stacks: 1 }]);
        expect(salvarCamposPersonagem.mock.calls[0][1].duracaoEstados).toBeNull();
        salvarCamposPersonagem.mockClear();
        gravarEstadosNoAlvo('p', { isPersonagem: true, personagemNome: 'Rival', ficha: { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 5 } } }, [{ id: 'lento', stacks: 1, duracao: 2 }]);
        expect('duracaoEstados' in salvarCamposPersonagem.mock.calls[0][1]).toBe(false);
    });
    it('sem aplicados devolve o alvo e nao grava', () => {
        salvarCamposPersonagem.mockClear();
        const alvo = { isPersonagem: true, personagemNome: 'R', ficha: {} };
        expect(gravarEstadosNoAlvo('p', alvo, [])).toBe(alvo);
        expect(gravarEstadosNoAlvo('p', null, [{ id: 'lento', stacks: 1 }])).toBeNull();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('estadoDoAlvoComEstados: varias fontes do mesmo estado', () => {
        const r = estadoDoAlvoComEstados({ condicoes: undefined }, [{ id: 'lento', stacks: 1, duracao: 2 }, { id: 'lento', stacks: 1, duracao: 4 }], 'X');
        expect(r.duracaoEstados).toEqual({ lento: 4 });
        expect(r.condicoes.find(c => c.id === 'lento').stacks).toBe(2);
    });
});

describe('QA importadores e Sexta-Feira', () => {
    it('Poder importado: duracao valida mantida; invalida so perde o prazo; estado fora dos 17 descartado', () => {
        const r = prepararItemImportado({ nome: 'X', aplicaEstados: [
            { id: 'imobilizado', stacks: 1, duracao: '1d6' }, { id: 'lento', stacks: 1, duracao: '0d6' },
            { id: 'congelado', stacks: 1, duracao: 3 }, { id: 'queimado', stacks: 1, duracao: 1e9 },
        ] });
        const e = r.objeto.aplicaEstados;
        expect(e.map(x => x.id)).toEqual(['imobilizado', 'lento', 'queimado']);
        expect(e[0].duracao).toBe('1d6');
        expect('duracao' in e[1]).toBe(false);
        expect(e[2].duracao).toBe(99);
    });
    it('Tecnica importada: so estado fora dos 17 => sem aplicaEstados', () => {
        const r = prepararTecnicaImportada({ nome: 'T', aplicaEstados: [{ id: 'congelado', stacks: 1, duracao: 3 }] }, { elementos: [], elementoPadrao: 'Neutro' });
        expect(r.objeto.aplicaEstados).toBeUndefined();
        expect(JSON.stringify(r.avisos)).toMatch(/descartad/);
    });
    it('Sexta-Feira normalizarPoder/Magia/Item mantem duracao numerica ou dado', () => {
        const base = { nome: 'N', aplicaEstados: [{ id: 'imobilizado', stacks: 1, duracao: '2' }, { id: 'lento', stacks: 1, duracao: '1d12+1' }, { id: 'queimado', stacks: 1, duracao: 'x' }, { id: 'fantasma', stacks: 1, duracao: '2' }] };
        for (const fn of [normalizarPoder, normalizarMagia, normalizarItem]) {
            const r = fn({ ...base, tipo: 'arma' });
            const lista = (r.objeto || r).aplicaEstados;
            expect(lista, fn.name).toBeTruthy();
            expect(lista.map(x => x.id)).toEqual(['imobilizado', 'lento', 'queimado']);
            expect(lista[0].duracao).toBe(2);
            expect(lista[1].duracao).toBe('1d12+1');
            expect('duracao' in lista[2]).toBe(false);
        }
    });
    it('descreverExtrasProposta: dado, teste + critico + prazo juntos, sem prazo nada extra', () => {
        const l = descreverExtrasProposta({ aplicaEstados: [
            { id: 'lento', stacks: 2, duracao: '1d12+1' },
            { id: 'queimado', stacks: 1, apenasCritico: true, teste: { atributo: 'forca', cd: 10 }, duracao: 3 },
            { id: 'criogenia', stacks: 1 },
        ] });
        expect(l[0]).toContain('por 1d12+1 turnos');
        expect(l[1]).toMatch(/só em crítico.*por 3 turnos/);
        expect(l[2]).not.toContain('por ');
    });
});
