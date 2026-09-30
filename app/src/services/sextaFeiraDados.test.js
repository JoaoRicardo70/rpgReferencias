import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), push: vi.fn(), remove: vi.fn() }));
vi.mock('firebase/database', () => ({
    ref: vi.fn((db, caminho) => ({ caminho })),
    get: mocks.get, set: mocks.set, push: mocks.push, remove: mocks.remove,
    query: vi.fn((r, ...restr) => ({ ref: r, restr })),
    orderByKey: vi.fn(() => ({ t: 'orderByKey' })),
    startAt: vi.fn((v) => ({ t: 'startAt', v })),
    limitToLast: vi.fn((n) => ({ t: 'limitToLast', n })),
}));
vi.mock('./firebase-config', () => ({ db: { fake: true } }));

import * as dados from './sextaFeiraDados';
import { chaveFirebaseDoInstante } from '../core/sextaFeiraSessao';

// Snapshot falso com forEach/exists/val
function snap(filhos, valor) {
    const entradas = Object.entries(filhos || {});
    return {
        exists: () => entradas.length > 0,
        forEach: (fn) => { for (const [k, v] of entradas) fn({ key: k, val: () => v }); },
        val: () => (valor !== undefined ? valor : (entradas.length ? filhos : null)),
    };
}

beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
    mocks.push.mockResolvedValue({});
    mocks.set.mockResolvedValue();
    mocks.remove.mockResolvedValue();
});

describe('carregarEventosFeedDesde', () => {
    it('consulta feed_combate com orderByKey + startAt(desde-60s) + limitToLast(1500)', async () => {
        mocks.get.mockResolvedValue(snap({ k1: { tipo: 'a' }, k2: { tipo: 'b' } }));
        const desde = 1700000000000;
        const r = await dados.carregarEventosFeedDesde('M1', desde);
        expect(r).toEqual([{ chave: 'k1', evento: { tipo: 'a' } }, { chave: 'k2', evento: { tipo: 'b' } }]);
        const consulta = mocks.get.mock.calls[0][0];
        expect(consulta.ref.caminho).toBe('mesas/M1/feed_combate');
        expect(consulta.restr).toEqual([
            { t: 'orderByKey' },
            { t: 'startAt', v: chaveFirebaseDoInstante(desde - 60000) },
            { t: 'limitToLast', n: 1500 },
        ]);
    });
    it('sem snapshot devolve lista vazia', async () => {
        mocks.get.mockResolvedValue(snap({}));
        expect(await dados.carregarEventosFeedDesde('M1', 1)).toEqual([]);
    });
    it('sem mesaId nao consulta', async () => {
        expect(await dados.carregarEventosFeedDesde('', 1)).toEqual([]);
        expect(await dados.carregarEventosFeedDesde(null, 1)).toEqual([]);
        expect(mocks.get).not.toHaveBeenCalled();
    });
    it('propaga erro do banco', async () => {
        mocks.get.mockRejectedValue(new Error('PERMISSION_DENIED'));
        await expect(dados.carregarEventosFeedDesde('M1', 1)).rejects.toThrow('PERMISSION_DENIED');
    });
});

describe('carregarTranscricoesDesde', () => {
    const desde = 1700000000000;
    it('le o no novo e o legado e filtra timestamp >= desde', async () => {
        mocks.get.mockImplementation(async (c) => {
            if (c.ref.caminho === 'mesas/M1/sextaFeira/transcricoes') return snap({ a: { timestamp: desde + 5, texto: 'nova' }, b: { timestamp: desde - 1, texto: 'velha' } });
            if (c.ref.caminho === 'mesas/M1/sexta_feira_transcricao') return snap({ c: { timestamp: desde, texto: 'legado' }, d: null });
            throw new Error('caminho inesperado ' + c.ref.caminho);
        });
        const r = await dados.carregarTranscricoesDesde('M1', desde);
        expect(r.map(t => t.texto).sort()).toEqual(['legado', 'nova']);
        expect(mocks.get).toHaveBeenCalledTimes(2);
    });
    it('falha do no legado e ignorada', async () => {
        mocks.get.mockImplementation(async (c) => {
            if (c.ref.caminho.endsWith('sexta_feira_transcricao')) throw new Error('denied');
            return snap({ a: { timestamp: desde + 1, texto: 'ok' } });
        });
        const r = await dados.carregarTranscricoesDesde('M1', desde);
        expect(r).toHaveLength(1);
    });
    it('falha do no novo NAO e ignorada', async () => {
        mocks.get.mockImplementation(async (c) => {
            if (c.ref.caminho.endsWith('/transcricoes')) throw new Error('novo negado');
            return snap({});
        });
        await expect(dados.carregarTranscricoesDesde('M1', desde)).rejects.toThrow('novo negado');
    });
    it('sem mesaId devolve []', async () => {
        expect(await dados.carregarTranscricoesDesde(undefined, desde)).toEqual([]);
        expect(mocks.get).not.toHaveBeenCalled();
    });
    it('timestamp invalido e descartado', async () => {
        mocks.get.mockImplementation(async (c) => (c.ref.caminho.endsWith('/transcricoes') ? snap({ a: { timestamp: 'x', texto: 't' }, b: { texto: 'sem' } }) : snap({})));
        expect(await dados.carregarTranscricoesDesde('M1', desde)).toEqual([]);
    });
});

describe('registrarTranscricao', () => {
    it('faz push no no novo com campos normalizados e truncados', async () => {
        const antes = Date.now();
        await dados.registrarTranscricao('M1', { autor: 'A'.repeat(100), texto: 'x'.repeat(2000), tipo: 'npc' });
        const [r, v] = mocks.push.mock.calls[0];
        expect(r.caminho).toBe('mesas/M1/sextaFeira/transcricoes');
        expect(v.autor).toHaveLength(60);
        expect(v.texto).toHaveLength(1000);
        expect(v.tipo).toBe('npc');
        expect(v.timestamp).toBeGreaterThanOrEqual(antes);
    });
    it('defaults: autor "?" e tipo "narrador"', async () => {
        await dados.registrarTranscricao('M1', { texto: 'oi' });
        expect(mocks.push.mock.calls[0][1]).toMatchObject({ autor: '?', tipo: 'narrador', texto: 'oi' });
    });
    it('sem texto ou mesa nao grava', async () => {
        await dados.registrarTranscricao('M1', { texto: '' });
        await dados.registrarTranscricao('M1', null);
        await dados.registrarTranscricao('', { texto: 'a' });
        expect(mocks.push).not.toHaveBeenCalled();
    });
});

describe('memorizarFato / apagarFato', () => {
    it('grava fato trimado e capado em 500', async () => {
        await dados.memorizarFato('M1', { texto: `  ${'y'.repeat(600)}  `, soMestre: 1, autor: 'Mestre' });
        const [r, v] = mocks.push.mock.calls[0];
        expect(r.caminho).toBe('mesas/M1/sextaFeira/memoria');
        expect(v.texto).toHaveLength(500);
        expect(v.soMestre).toBe(true);
        expect(v.autor).toBe('Mestre');
        expect(typeof v.em).toBe('number');
    });
    it('soMestre padrao false, autor vazio', async () => {
        await dados.memorizarFato('M1', { texto: 'a' });
        expect(mocks.push.mock.calls[0][1]).toMatchObject({ soMestre: false, autor: '' });
    });
    it('sem texto / sem mesa nao grava', async () => {
        await dados.memorizarFato('M1', { texto: '' });
        await dados.memorizarFato(null, { texto: 'a' });
        expect(mocks.push).not.toHaveBeenCalled();
    });
    it('apagarFato remove o caminho certo e ignora id vazio', async () => {
        await dados.apagarFato('M1', 'id9');
        expect(mocks.remove.mock.calls[0][0].caminho).toBe('mesas/M1/sextaFeira/memoria/id9');
        await dados.apagarFato('M1', '');
        await dados.apagarFato('', 'x');
        expect(mocks.remove).toHaveBeenCalledTimes(1);
    });
});

describe('lerUltimoResumoEm / gravarUltimoResumoEm', () => {
    it('le numero valido', async () => {
        mocks.get.mockResolvedValue({ val: () => 1700000000000 });
        expect(await dados.lerUltimoResumoEm('M1')).toBe(1700000000000);
        expect(mocks.get.mock.calls[0][0].caminho).toBe('mesas/M1/sextaFeira/sessoes/ultimoResumoEm');
    });
    it.each([[null], [0], [-5], ['abc'], [undefined]])('valor %s vira null', async (v) => {
        mocks.get.mockResolvedValue({ val: () => v });
        expect(await dados.lerUltimoResumoEm('M1')).toBeNull();
    });
    it('sem mesa devolve null sem consultar', async () => {
        expect(await dados.lerUltimoResumoEm('')).toBeNull();
        expect(mocks.get).not.toHaveBeenCalled();
    });
    it('gravar faz set no caminho', async () => {
        await dados.gravarUltimoResumoEm('M1', 123);
        expect(mocks.set).toHaveBeenCalledWith({ caminho: 'mesas/M1/sextaFeira/sessoes/ultimoResumoEm' }, 123);
        await dados.gravarUltimoResumoEm('', 1);
        expect(mocks.set).toHaveBeenCalledTimes(1);
    });
});

describe('carregarChat', () => {
    it('le array e filtra malformados', async () => {
        mocks.get.mockResolvedValue({ val: () => ({ mensagens: [{ role: 'user', texto: 'a' }, null, { role: 'ai' }, { texto: 'sem role' }, { role: 'ai', texto: 'b' }] }) });
        const r = await dados.carregarChat('M1', 'Ana');
        expect(r).toEqual([{ role: 'user', texto: 'a' }, { role: 'ai', texto: 'b' }]);
        expect(mocks.get.mock.calls[0][0].caminho).toBe('mesas/M1/sextaFeira/chats/Ana');
    });
    it('le objeto indexado (Firebase transforma arrays)', async () => {
        mocks.get.mockResolvedValue({ val: () => ({ mensagens: { 0: { role: 'user', texto: 'a' }, 2: { role: 'ai', texto: 'b' } } }) });
        expect(await dados.carregarChat('M1', 'Ana')).toHaveLength(2);
    });
    it('sem dados devolve null', async () => {
        mocks.get.mockResolvedValue({ val: () => null });
        expect(await dados.carregarChat('M1', 'Ana')).toBeNull();
        mocks.get.mockResolvedValue({ val: () => ({ atualizadoEm: 1 }) });
        expect(await dados.carregarChat('M1', 'Ana')).toBeNull();
    });
    it('sem mesa ou nome invalido nao consulta', async () => {
        expect(await dados.carregarChat('', 'Ana')).toBeNull();
        expect(await dados.carregarChat('M1', '')).toBeNull();
        expect(await dados.carregarChat('M1', null)).toBeNull();
        expect(mocks.get).not.toHaveBeenCalled();
    });
    it('sanitiza o nome no caminho (caracteres proibidos)', async () => {
        mocks.get.mockResolvedValue({ val: () => null });
        await dados.carregarChat('M1', 'A.b#c$d[e]f/g');
        const caminho = mocks.get.mock.calls[0][0].caminho;
        expect(caminho.startsWith('mesas/M1/sextaFeira/chats/')).toBe(true);
        expect(caminho.slice('mesas/M1/sextaFeira/chats/'.length)).not.toMatch(/[.#$[\]/]/);
    });
});

describe('salvarChat', () => {
    it('salva so as ultimas 60 mensagens', async () => {
        const msgs = Array.from({ length: 100 }, (_, i) => ({ role: 'user', texto: `m${i}` }));
        await dados.salvarChat('M1', 'Ana', msgs);
        const [r, v] = mocks.set.mock.calls[0];
        expect(r.caminho).toBe('mesas/M1/sextaFeira/chats/Ana');
        expect(v.mensagens).toHaveLength(60);
        expect(v.mensagens[0].texto).toBe('m40');
        expect(v.mensagens[59].texto).toBe('m99');
        expect(typeof v.atualizadoEm).toBe('number');
    });
    it('lista vazia/nula remove o no', async () => {
        await dados.salvarChat('M1', 'Ana', []);
        await dados.salvarChat('M1', 'Ana', null);
        expect(mocks.remove).toHaveBeenCalledTimes(2);
        expect(mocks.set).not.toHaveBeenCalled();
    });
    it('descarta campos undefined', async () => {
        await dados.salvarChat('M1', 'Ana', [{ role: 'ai', texto: 'x', destinoSugerido: undefined, tipo: 'resumo' }]);
        const m = mocks.set.mock.calls[0][1].mensagens[0];
        expect('destinoSugerido' in m).toBe(false);
        expect(m.tipo).toBe('resumo');
    });
    it('sem mesa/nome nao grava', async () => {
        await dados.salvarChat('', 'Ana', [{ role: 'user', texto: 'a' }]);
        await dados.salvarChat('M1', '', [{ role: 'user', texto: 'a' }]);
        expect(mocks.set).not.toHaveBeenCalled();
        expect(mocks.remove).not.toHaveBeenCalled();
    });
});
