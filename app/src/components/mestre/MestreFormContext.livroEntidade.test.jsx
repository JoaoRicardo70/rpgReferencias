import React from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MestreFormProvider, useMestreForm } from './MestreFormContext';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../services/firebase-config', () => ({ db: { __isMock: true } }));
vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), apagarFicha: vi.fn(),
}));

const estado = {
    personagens: {}, isMestre: true, meuNome: 'Dono', userLogado: 'Dono',
    mesaId: 'MESA-X', mesaCriador: 'Dono', mesaMestres: {},
};

function montar() {
    return renderHook(() => useMestreForm(), { wrapper: ({ children }) => <MestreFormProvider>{children}</MestreFormProvider> });
}

beforeEach(() => {
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(estado) : estado));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('MestreFormContext > Livro da Entidade', () => {
    it('começa com o livro fechado e sem o antigo pedidoEmFoco', () => {
        const { result } = montar();
        expect(result.current.livroAberto).toBeNull();
        expect(result.current.pedidoEmFoco).toBeUndefined();
        expect(result.current.limparPedidoEmFoco).toBeUndefined();
    });
    it('abrirLivroEntidade abre o livro do personagem com pedidoId nulo', () => {
        const { result } = montar();
        act(() => result.current.abrirLivroEntidade('Ana'));
        expect(result.current.livroAberto).toEqual({ nome: 'Ana', pedidoId: null });
    });
    it('abrirLivroEntidade ignora nome vazio, nulo e indefinido', () => {
        const { result } = montar();
        act(() => result.current.abrirLivroEntidade(''));
        act(() => result.current.abrirLivroEntidade(null));
        act(() => result.current.abrirLivroEntidade(undefined));
        expect(result.current.livroAberto).toBeNull();
    });
    it('verPedidoNaFicha abre o livro já com o id do pedido', () => {
        const { result } = montar();
        act(() => result.current.verPedidoNaFicha('p1', 'Ana'));
        expect(result.current.livroAberto).toEqual({ nome: 'Ana', pedidoId: 'p1' });
    });
    it('verPedidoNaFicha ignora id ou nome vazios', () => {
        const { result } = montar();
        act(() => result.current.verPedidoNaFicha('', 'Ana'));
        act(() => result.current.verPedidoNaFicha('p1', ''));
        act(() => result.current.verPedidoNaFicha(undefined, undefined));
        expect(result.current.livroAberto).toBeNull();
    });
    it('verPedidoNaFicha com o livro aberto troca para o novo pedido', () => {
        const { result } = montar();
        act(() => result.current.abrirLivroEntidade('Ana'));
        act(() => result.current.verPedidoNaFicha('p2', 'Beto'));
        expect(result.current.livroAberto).toEqual({ nome: 'Beto', pedidoId: 'p2' });
    });
    it('abrirLivroEntidade depois de um pedido zera o pedidoId', () => {
        const { result } = montar();
        act(() => result.current.verPedidoNaFicha('p1', 'Ana'));
        act(() => result.current.abrirLivroEntidade('Ana'));
        expect(result.current.livroAberto.pedidoId).toBeNull();
    });
    it('fecharLivroEntidade fecha e é seguro chamar com o livro já fechado', () => {
        const { result } = montar();
        act(() => result.current.abrirLivroEntidade('Ana'));
        act(() => result.current.fecharLivroEntidade());
        expect(result.current.livroAberto).toBeNull();
        expect(() => act(() => result.current.fecharLivroEntidade())).not.toThrow();
    });
    it('as funções mantêm identidade estável entre renders', () => {
        const { result, rerender } = montar();
        const antes = [result.current.abrirLivroEntidade, result.current.verPedidoNaFicha, result.current.fecharLivroEntidade];
        act(() => result.current.abrirLivroEntidade('Ana'));
        rerender();
        const depois = [result.current.abrirLivroEntidade, result.current.verPedidoNaFicha, result.current.fecharLivroEntidade];
        depois.forEach((fn, i) => expect(fn).toBe(antes[i]));
    });
});
