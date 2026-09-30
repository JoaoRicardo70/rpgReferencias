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

function snap(filhos) {
    const entradas = Object.entries(filhos || {});
    return {
        exists: () => entradas.length > 0,
        forEach: (fn) => { for (const [k, v] of entradas) fn({ key: k, val: () => v }); },
        val: () => (entradas.length ? filhos : null),
    };
}
// N chaves ordenadas k01..kNN
const chaves = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${String(i + 1).padStart(3, '0')}`, { x: i }]));

beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
    mocks.push.mockResolvedValue({});
    mocks.set.mockResolvedValue();
    mocks.remove.mockResolvedValue();
    mocks.get.mockResolvedValue(snap({}));
});

describe('constantes', () => {
    it('limites de versoes e lixeira', () => {
        expect(dados.LIMITE_VERSOES_ARCO).toBe(20);
        expect(dados.LIMITE_LIXEIRA).toBe(30);
    });
});

describe('chaveVersaoArco', () => {
    it('junta foco_capitulo_arco', () => {
        expect(dados.chaveVersaoArco('presente', 1, 11)).toBe('presente_1_11');
    });
    it('sanitiza caracteres invalidos do Firebase (.#$[]/)', () => {
        const k = dados.chaveVersaoArco('pre.sen/te', '#1', '$[2]');
        expect(k).not.toMatch(/[.#$[\]/]/);
        expect(k.length).toBeGreaterThan(0);
    });
    it('e deterministica', () => {
        expect(dados.chaveVersaoArco('futuro', 5, 6)).toBe(dados.chaveVersaoArco('futuro', 5, 6));
        expect(dados.chaveVersaoArco('futuro', 5, 6)).not.toBe(dados.chaveVersaoArco('futuro', 5, 7));
    });
});

describe('salvarVersaoArco', () => {
    it('faz push em versoes/{chave} com o corpo normalizado', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1234);
        await dados.salvarVersaoArco('M1', 'presente_1_11', { texto: 'abc', titulo: 'Arco', autor: 'Ana', motivo: 'm' });
        expect(mocks.push).toHaveBeenCalledTimes(1);
        const [r, corpo] = mocks.push.mock.calls[0];
        expect(r.caminho).toBe('mesas/M1/sextaFeira/versoes/presente_1_11');
        expect(corpo).toEqual({ texto: 'abc', titulo: 'Arco', autor: 'Ana', motivo: 'm', em: 1234 });
        vi.restoreAllMocks();
    });
    it('trunca autor a 60 e usa strings vazias para campos ausentes; texto vazio e valido', async () => {
        await dados.salvarVersaoArco('M1', 'k', { texto: '', autor: 'a'.repeat(100) });
        const corpo = mocks.push.mock.calls[0][1];
        expect(corpo.texto).toBe('');
        expect(corpo.autor).toHaveLength(60);
        expect(corpo.titulo).toBe('');
        expect(corpo.motivo).toBe('');
    });
    it('poda para as ultimas 20 usando orderByKey: remove as mais antigas', async () => {
        mocks.get.mockResolvedValue(snap(chaves(23)));
        await dados.salvarVersaoArco('M1', 'k', { texto: 't' });
        const consulta = mocks.get.mock.calls[0][0];
        expect(consulta.ref.caminho).toBe('mesas/M1/sextaFeira/versoes/k');
        expect(consulta.restr).toEqual([{ t: 'orderByKey' }]);
        expect(mocks.remove).toHaveBeenCalledTimes(3);
        expect(mocks.remove.mock.calls.map(c => c[0].caminho)).toEqual([
            'mesas/M1/sextaFeira/versoes/k/k001', 'mesas/M1/sextaFeira/versoes/k/k002', 'mesas/M1/sextaFeira/versoes/k/k003',
        ]);
    });
    it('exatamente 20 ou menos: nao remove nada', async () => {
        mocks.get.mockResolvedValue(snap(chaves(20)));
        await dados.salvarVersaoArco('M1', 'k', { texto: 't' });
        expect(mocks.remove).not.toHaveBeenCalled();
    });
    it('21 versoes remove exatamente 1', async () => {
        mocks.get.mockResolvedValue(snap(chaves(21)));
        await dados.salvarVersaoArco('M1', 'k', { texto: 't' });
        expect(mocks.remove).toHaveBeenCalledTimes(1);
    });
    it('ignora quando falta mesa, chave, ou texto nao e string', async () => {
        await dados.salvarVersaoArco('', 'k', { texto: 't' });
        await dados.salvarVersaoArco('M1', '', { texto: 't' });
        await dados.salvarVersaoArco('M1', 'k', { texto: 5 });
        await dados.salvarVersaoArco('M1', 'k', { texto: undefined });
        expect(mocks.push).not.toHaveBeenCalled();
    });
    it('falha no push propaga o erro e nao poda', async () => {
        mocks.push.mockRejectedValue(new Error('PERMISSION_DENIED'));
        await expect(dados.salvarVersaoArco('M1', 'k', { texto: 't' })).rejects.toThrow('PERMISSION_DENIED');
        expect(mocks.get).not.toHaveBeenCalled();
    });
    it('falha na poda propaga o erro', async () => {
        mocks.get.mockRejectedValue(new Error('boom'));
        await expect(dados.salvarVersaoArco('M1', 'k', { texto: 't' })).rejects.toThrow('boom');
    });
});

describe('listarVersoesArco', () => {
    it('devolve da mais nova para a mais antiga, com id', async () => {
        mocks.get.mockResolvedValue(snap({
            a: { texto: 'um', em: 100 }, b: { texto: 'tres', em: 300 }, c: { texto: 'dois', em: 200 },
        }));
        const r = await dados.listarVersoesArco('M1', 'k');
        expect(r.map(v => v.id)).toEqual(['b', 'c', 'a']);
        expect(r[0]).toEqual({ id: 'b', texto: 'tres', em: 300 });
        expect(mocks.get.mock.calls[0][0].caminho).toBe('mesas/M1/sextaFeira/versoes/k');
    });
    it('filtra itens cujo texto nao e string (texto vazio continua valido)', async () => {
        mocks.get.mockResolvedValue(snap({
            a: { texto: 'ok', em: 1 }, b: { texto: 123, em: 2 }, c: { em: 3 }, d: { texto: null, em: 4 }, e: { texto: '', em: 5 },
        }));
        const r = await dados.listarVersoesArco('M1', 'k');
        expect(r.map(v => v.id)).toEqual(['e', 'a']);
    });
    it('em ausente/invalido conta como 0 (vai pro fim)', async () => {
        mocks.get.mockResolvedValue(snap({ a: { texto: 'x' }, b: { texto: 'y', em: 'abc' }, c: { texto: 'z', em: 5 } }));
        const r = await dados.listarVersoesArco('M1', 'k');
        expect(r[0].id).toBe('c');
    });
    it('sem dados: lista vazia; sem mesa/chave: nao consulta', async () => {
        expect(await dados.listarVersoesArco('M1', 'k')).toEqual([]);
        mocks.get.mockClear();
        expect(await dados.listarVersoesArco('', 'k')).toEqual([]);
        expect(await dados.listarVersoesArco('M1', '')).toEqual([]);
        expect(mocks.get).not.toHaveBeenCalled();
    });
    it('propaga erro do banco', async () => {
        mocks.get.mockRejectedValue(new Error('x'));
        await expect(dados.listarVersoesArco('M1', 'k')).rejects.toThrow('x');
    });
});

describe('guardarNaLixeira', () => {
    it('faz push em lixeira com dados clonados, sem campos undefined', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(99);
        await dados.guardarNaLixeira('M1', {
            tipo: 'arco', foco: 'presente', capituloId: 1, autor: 'Ana',
            dados: { id: 5, titulo: 'T', texto: 'x', lixo: undefined, aninhado: { a: 1, b: undefined } },
        });
        const [r, corpo] = mocks.push.mock.calls[0];
        expect(r.caminho).toBe('mesas/M1/sextaFeira/lixeira');
        expect(corpo).toEqual({ tipo: 'arco', foco: 'presente', capituloId: 1, dados: { id: 5, titulo: 'T', texto: 'x', aninhado: { a: 1 } }, autor: 'Ana', em: 99 });
        expect('lixo' in corpo.dados).toBe(false);
        vi.restoreAllMocks();
    });
    it('capituloId ausente vira null e autor e truncado a 60', async () => {
        await dados.guardarNaLixeira('M1', { tipo: 'capitulo', foco: 'futuro', dados: { id: 1 }, autor: 'z'.repeat(80) });
        const corpo = mocks.push.mock.calls[0][1];
        expect(corpo.capituloId).toBeNull();
        expect(corpo.autor).toHaveLength(60);
    });
    it('poda para os ultimos 30', async () => {
        mocks.get.mockResolvedValue(snap(chaves(33)));
        await dados.guardarNaLixeira('M1', { tipo: 'arco', foco: 'presente', dados: { id: 1 } });
        expect(mocks.get.mock.calls[0][0].ref.caminho).toBe('mesas/M1/sextaFeira/lixeira');
        expect(mocks.remove).toHaveBeenCalledTimes(3);
        expect(mocks.remove.mock.calls[0][0].caminho).toBe('mesas/M1/sextaFeira/lixeira/k001');
    });
    it('30 itens: nao poda', async () => {
        mocks.get.mockResolvedValue(snap(chaves(30)));
        await dados.guardarNaLixeira('M1', { tipo: 'arco', foco: 'presente', dados: { id: 1 } });
        expect(mocks.remove).not.toHaveBeenCalled();
    });
    it('sem mesa ou sem dados nao grava', async () => {
        await dados.guardarNaLixeira('', { tipo: 'arco', dados: { id: 1 } });
        await dados.guardarNaLixeira('M1', { tipo: 'arco' });
        await dados.guardarNaLixeira('M1', { tipo: 'arco', dados: null });
        expect(mocks.push).not.toHaveBeenCalled();
    });
    it('falha no push propaga (o chamador decide se apaga sem copia)', async () => {
        mocks.push.mockRejectedValue(new Error('negado'));
        await expect(dados.guardarNaLixeira('M1', { tipo: 'arco', dados: { id: 1 } })).rejects.toThrow('negado');
    });
});

describe('listarLixeira', () => {
    it('mais nova primeiro, com id, ignorando itens sem dados', async () => {
        mocks.get.mockResolvedValue(snap({
            a: { tipo: 'arco', dados: { id: 1 }, em: 10 },
            b: { tipo: 'capitulo', dados: { id: 2 }, em: 30 },
            c: { tipo: 'arco', em: 40 },
            d: { tipo: 'arco', dados: { id: 3 }, em: 20 },
        }));
        const r = await dados.listarLixeira('M1');
        expect(r.map(i => i.id)).toEqual(['b', 'd', 'a']);
        expect(mocks.get.mock.calls[0][0].caminho).toBe('mesas/M1/sextaFeira/lixeira');
    });
    it('vazia / sem mesa', async () => {
        expect(await dados.listarLixeira('M1')).toEqual([]);
        mocks.get.mockClear();
        expect(await dados.listarLixeira('')).toEqual([]);
        expect(mocks.get).not.toHaveBeenCalled();
    });
});

describe('removerDaLixeira', () => {
    it('remove o no lixeira/{id}', async () => {
        await dados.removerDaLixeira('M1', 'abc');
        expect(mocks.remove.mock.calls[0][0].caminho).toBe('mesas/M1/sextaFeira/lixeira/abc');
    });
    it('sem mesa ou id nao remove (e resolve)', async () => {
        await expect(dados.removerDaLixeira('', 'a')).resolves.toBeUndefined();
        await expect(dados.removerDaLixeira('M1', '')).resolves.toBeUndefined();
        await expect(dados.removerDaLixeira('M1', null)).resolves.toBeUndefined();
        expect(mocks.remove).not.toHaveBeenCalled();
    });
    it('propaga erro', async () => {
        mocks.remove.mockRejectedValue(new Error('r'));
        await expect(dados.removerDaLixeira('M1', 'a')).rejects.toThrow('r');
    });
});
