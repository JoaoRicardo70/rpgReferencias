import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), push: vi.fn(), remove: vi.fn(), runTransaction: vi.fn() }));
vi.mock('firebase/database', () => ({
    ref: vi.fn((db, caminho) => ({ caminho })),
    get: mocks.get, set: mocks.set, push: mocks.push, remove: mocks.remove, runTransaction: mocks.runTransaction,
    query: vi.fn((r, ...restr) => ({ ref: r, restr })),
    orderByKey: vi.fn(() => ({ t: 'orderByKey' })),
    startAt: vi.fn((v) => ({ t: 'startAt', v })),
    limitToLast: vi.fn((n) => ({ t: 'limitToLast', n })),
}));
vi.mock('./firebase-config', () => ({ db: { fake: true } }));

import * as dados from './sextaFeiraDados';

const snapChaves = (chaves) => ({
    exists: () => chaves.length > 0,
    forEach: (fn) => { chaves.forEach(k => fn({ key: k })); },
});

beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
    mocks.push.mockResolvedValue({});
    mocks.remove.mockResolvedValue();
});

describe('anexarNaFicha', () => {
    it('usa runTransaction no caminho sanitizado e anexa ao valor atual', async () => {
        mocks.runTransaction.mockImplementation(async (r, fn) => ({ committed: true, resultado: fn([{ id: 1 }]) }));
        await dados.anexarNaFicha('M1', 'Joao.Silva#1', 'poderes', { id: 2, nome: 'X' });
        const [refArg, fn] = mocks.runTransaction.mock.calls[0];
        expect(refArg.caminho).toBe('mesas/M1/personagens/Joao_Silva_1/poderes');
        expect(fn([{ id: 1 }])).toEqual([{ id: 1 }, { id: 2, nome: 'X' }]);
    });
    it('lista ausente (null) e objeto RTDB viram array com o novo item', async () => {
        mocks.runTransaction.mockResolvedValue({ committed: true });
        await dados.anexarNaFicha('M1', 'Ana', 'inventario', { nome: 'Espada' });
        const fn = mocks.runTransaction.mock.calls[0][1];
        expect(fn(null)).toEqual([{ nome: 'Espada' }]);
        expect(fn({ 0: { a: 1 }, 1: null })).toEqual([{ a: 1 }, { nome: 'Espada' }]);
    });
    it('grava copia limpa do objeto (sem undefined/funcoes)', async () => {
        mocks.runTransaction.mockResolvedValue({ committed: true });
        await dados.anexarNaFicha('M1', 'Ana', 'ataquesElementais', { nome: 'X', lixo: undefined, f: () => 1 });
        const fn = mocks.runTransaction.mock.calls[0][1];
        expect(fn([])).toEqual([{ nome: 'X' }]);
    });
    it('lanca quando a transacao nao foi confirmada', async () => {
        mocks.runTransaction.mockResolvedValue({ committed: false });
        await expect(dados.anexarNaFicha('M1', 'Ana', 'poderes', { a: 1 })).rejects.toThrow(/não confirmou/);
        mocks.runTransaction.mockResolvedValue(undefined);
        await expect(dados.anexarNaFicha('M1', 'Ana', 'poderes', { a: 1 })).rejects.toThrow();
    });
    it('propaga erro do Firebase', async () => {
        mocks.runTransaction.mockRejectedValue(new Error('PERMISSION_DENIED'));
        await expect(dados.anexarNaFicha('M1', 'Ana', 'poderes', { a: 1 })).rejects.toThrow('PERMISSION_DENIED');
    });
    it.each([
        ['sem mesa', ['', 'Ana', 'poderes', { a: 1 }]],
        ['sem nome', ['M1', '', 'poderes', { a: 1 }]],
        ['sem campo', ['M1', 'Ana', '', { a: 1 }]],
        ['sem objeto', ['M1', 'Ana', 'poderes', null]],
    ])('argumentos insuficientes (%s) lancam sem chamar o banco', async (_n, args) => {
        await expect(dados.anexarNaFicha(...args)).rejects.toThrow(/insuficientes/);
        expect(mocks.runTransaction).not.toHaveBeenCalled();
    });
});

describe('enviarPendente', () => {
    it('faz push em pendentes com campos padronizados', async () => {
        const antes = Date.now();
        await dados.enviarPendente('M1', { tipo: 'poder', alvo: 'Ana', objeto: { nome: 'X' }, avisos: ['a'], solicitante: 'Ana' });
        const [r, valor] = mocks.push.mock.calls[0];
        expect(r.caminho).toBe('mesas/M1/sextaFeira/pendentes');
        expect(valor).toMatchObject({ tipo: 'poder', alvo: 'Ana', objeto: { nome: 'X' }, avisos: ['a'], solicitante: 'Ana' });
        expect(valor.em).toBeGreaterThanOrEqual(antes);
    });
    it('valores ausentes ganham padrao e solicitante e truncado a 60', async () => {
        await dados.enviarPendente('M1', { tipo: 'item', objeto: { nome: 'X' }, solicitante: 's'.repeat(100) });
        const valor = mocks.push.mock.calls[0][1];
        expect(valor.alvo).toBe('');
        expect(valor.avisos).toEqual([]);
        expect(valor.solicitante).toHaveLength(60);
    });
    it('rejeita sem objeto ou sem mesa', async () => {
        await expect(dados.enviarPendente('M1', { tipo: 'poder' })).rejects.toThrow(/insuficientes/);
        await expect(dados.enviarPendente('', { objeto: {} })).rejects.toThrow(/insuficientes/);
        expect(mocks.push).not.toHaveBeenCalled();
    });
});

describe('removerPendente', () => {
    it('remove o no; sem id e no-op', async () => {
        await dados.removerPendente('M1', 'p1');
        expect(mocks.remove.mock.calls[0][0].caminho).toBe('mesas/M1/sextaFeira/pendentes/p1');
        mocks.remove.mockClear();
        await dados.removerPendente('M1', '');
        expect(mocks.remove).not.toHaveBeenCalled();
    });
});

describe('registrarDecisao', () => {
    it('grava a decisao com campos truncados e poda para 50', async () => {
        const chaves = Array.from({ length: 53 }, (_, i) => `k${String(i).padStart(3, '0')}`);
        mocks.get.mockResolvedValue(snapChaves(chaves));
        await dados.registrarDecisao('M1', { solicitante: 'Ana', nomeCriacao: 'N'.repeat(300), tipo: 'poder', aprovado: 1, motivo: 'm'.repeat(500) });
        const [r, valor] = mocks.push.mock.calls[0];
        expect(r.caminho).toBe('mesas/M1/sextaFeira/decisoes');
        expect(valor).toMatchObject({ solicitante: 'Ana', tipo: 'poder', aprovado: true });
        expect(valor.nomeCriacao).toHaveLength(120);
        expect(valor.motivo).toHaveLength(300);
        expect(dados.LIMITE_DECISOES).toBe(50);
        const removidos = mocks.remove.mock.calls.map(c => c[0].caminho);
        expect(removidos).toEqual(['k000', 'k001', 'k002'].map(k => `mesas/M1/sextaFeira/decisoes/${k}`));
    });
    it('com 50 ou menos nao remove nada', async () => {
        mocks.get.mockResolvedValue(snapChaves(Array.from({ length: 50 }, (_, i) => `k${i}`)));
        await dados.registrarDecisao('M1', { solicitante: 'Ana', aprovado: false });
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.push.mock.calls[0][1]).toMatchObject({ aprovado: false, nomeCriacao: '', motivo: '', tipo: '' });
    });
    it('sem mesa: no-op', async () => {
        await dados.registrarDecisao('', { solicitante: 'Ana' });
        expect(mocks.push).not.toHaveBeenCalled();
    });
});

describe('reivindicarPendente', () => {
    const simular = (valorAtual, committed = true) => mocks.runTransaction.mockImplementation(async (r, fn) => {
        const retorno = fn(valorAtual);
        return { committed: committed && retorno === null };
    });
    it('devolve o pedido quando commitou e viu o valor; transacao devolve null (remove)', async () => {
        const pedido = { tipo: 'poder', alvo: 'Ana' };
        simular(pedido);
        const r = await dados.reivindicarPendente('M1', 'p1');
        expect(r).toEqual(pedido);
        expect(mocks.runTransaction.mock.calls[0][0].caminho).toBe('mesas/M1/sextaFeira/pendentes/p1');
    });
    it('null quando o pedido ja nao existe (valor visto null)', async () => {
        simular(null);
        expect(await dados.reivindicarPendente('M1', 'p1')).toBeNull();
    });
    it('null quando nao commitou, mesmo que tenha visto o valor', async () => {
        simular({ tipo: 'poder' }, false);
        expect(await dados.reivindicarPendente('M1', 'p1')).toBeNull();
    });
    it('duas reivindicacoes concorrentes: so a primeira leva o pedido', async () => {
        let banco = { tipo: 'poder' };
        mocks.runTransaction.mockImplementation(async (r, fn) => {
            const novo = fn(banco);
            banco = novo;
            return { committed: true };
        });
        const [a, b] = [await dados.reivindicarPendente('M1', 'p1'), await dados.reivindicarPendente('M1', 'p1')];
        expect(a).toEqual({ tipo: 'poder' });
        expect(b).toBeNull();
    });
    it('sem mesa/id: null sem chamar o banco', async () => {
        expect(await dados.reivindicarPendente('', 'p1')).toBeNull();
        expect(await dados.reivindicarPendente('M1', '')).toBeNull();
        expect(mocks.runTransaction).not.toHaveBeenCalled();
    });
    it('resultado indefinido: null', async () => {
        mocks.runTransaction.mockResolvedValue(undefined);
        expect(await dados.reivindicarPendente('M1', 'p1')).toBeNull();
    });
});
