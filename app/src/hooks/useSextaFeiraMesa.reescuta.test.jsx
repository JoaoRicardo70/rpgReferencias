import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// Cada chamada a onValue fica registrada com o caminho, o callback de sucesso, o de erro e o unsub.
const chamadas = [];
vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    onValue: vi.fn((path, ok, err) => {
        const unsub = vi.fn();
        chamadas.push({ path, ok, err, unsub });
        return unsub;
    }),
    set: vi.fn(() => Promise.resolve()),
}));
vi.mock('../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));

import useSextaFeiraMesa from './useSextaFeiraMesa';
import useStore, { loreCapitulosPresentePadrao, loreCapitulosFuturoPadrao } from '../stores/useStore';

const pathCfg = (m) => `mesas/${m}/sextaFeira/config`;
const pathReg = (m) => `mesas/${m}/sextaFeira/registros`;
const doPath = (p) => chamadas.filter(c => c.path === p);
const snap = (v) => ({ val: () => v });

beforeEach(() => {
    vi.useFakeTimers();
    chamadas.length = 0;
    localStorage.clear();
    useStore.setState({
        mesaId: 'M1', isMestre: false, meuNome: 'Ana', sextaFeiraConfig: null, registrosCompartilhados: false,
        loreCapitulosPresente: loreCapitulosPresentePadrao, loreCapitulosFuturo: loreCapitulosFuturoPadrao,
    });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useSextaFeiraMesa - reescuta apos erro (15 s)', () => {
    it('config: erro nao reescuta antes de 15 s; depois de 15 s desinscreve a antiga e assina de novo', () => {
        renderHook(() => useSextaFeiraMesa());
        expect(doPath(pathCfg('M1'))).toHaveLength(1);
        const primeira = doPath(pathCfg('M1'))[0];
        act(() => primeira.err(new Error('permission_denied')));
        act(() => { vi.advanceTimersByTime(14999); });
        expect(doPath(pathCfg('M1'))).toHaveLength(1);
        expect(primeira.unsub).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(1); });
        expect(doPath(pathCfg('M1'))).toHaveLength(2);
        expect(primeira.unsub).toHaveBeenCalledTimes(1);
        expect(doPath(pathCfg('M1'))[1].unsub).not.toHaveBeenCalled();
    });
    it('config: nova assinatura funciona e novo erro agenda outra tentativa', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => doPath(pathCfg('M1'))[0].err(new Error('x')));
        act(() => { vi.advanceTimersByTime(15000); });
        const segunda = doPath(pathCfg('M1'))[1];
        act(() => segunda.ok(snap({ chaveGemini: 'k', modelo: 'm' })));
        expect(useStore.getState().sextaFeiraConfig).toEqual({ chaveGemini: 'k', modelo: 'm' });
        act(() => segunda.err(new Error('de novo')));
        act(() => { vi.advanceTimersByTime(15000); });
        expect(doPath(pathCfg('M1'))).toHaveLength(3);
    });
    it('config: sem erro nao reescuta nunca', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => { vi.advanceTimersByTime(120000); });
        expect(doPath(pathCfg('M1'))).toHaveLength(1);
    });
    it('config: unmount durante a espera cancela a reescuta', () => {
        const { unmount } = renderHook(() => useSextaFeiraMesa());
        act(() => doPath(pathCfg('M1'))[0].err(new Error('x')));
        unmount();
        act(() => { vi.advanceTimersByTime(60000); });
        expect(doPath(pathCfg('M1'))).toHaveLength(1);
    });
    it('registros: erro reescuta apos 15 s, desinscrevendo a antiga', () => {
        renderHook(() => useSextaFeiraMesa());
        expect(doPath(pathReg('M1'))).toHaveLength(1);
        const primeira = doPath(pathReg('M1'))[0];
        act(() => primeira.err(new Error('permission_denied')));
        act(() => { vi.advanceTimersByTime(14999); });
        expect(doPath(pathReg('M1'))).toHaveLength(1);
        act(() => { vi.advanceTimersByTime(1); });
        expect(doPath(pathReg('M1'))).toHaveLength(2);
        expect(primeira.unsub).toHaveBeenCalledTimes(1);
    });
    it('registros: a nova escuta aplica dados remotos', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => doPath(pathReg('M1'))[0].err(new Error('x')));
        act(() => { vi.advanceTimersByTime(15000); });
        act(() => doPath(pathReg('M1'))[1].ok(snap({
            presente: [{ id: 5, titulo: 'Remoto', arcos: [{ id: 51, titulo: 'A', texto: 't' }], tierList: [] }],
            futuro: [{ id: 6, titulo: 'F', arcos: [{ id: 61, titulo: 'FA', texto: 'f' }], tierList: [] }],
        })));
        expect(useStore.getState().registrosCompartilhados).toBe(true);
        expect(useStore.getState().loreCapitulosPresente[0].titulo).toBe('Remoto');
    });
    it('registros: unmount durante a espera cancela a reescuta', () => {
        const { unmount } = renderHook(() => useSextaFeiraMesa());
        act(() => doPath(pathReg('M1'))[0].err(new Error('x')));
        unmount();
        act(() => { vi.advanceTimersByTime(60000); });
        expect(doPath(pathReg('M1'))).toHaveLength(1);
    });
    it('erro de config nao dispara reescuta de registros e vice-versa', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => doPath(pathCfg('M1'))[0].err(new Error('x')));
        act(() => { vi.advanceTimersByTime(15000); });
        expect(doPath(pathCfg('M1'))).toHaveLength(2);
        expect(doPath(pathReg('M1'))).toHaveLength(1);
        act(() => doPath(pathReg('M1'))[0].err(new Error('y')));
        act(() => { vi.advanceTimersByTime(15000); });
        expect(doPath(pathReg('M1'))).toHaveLength(2);
        expect(doPath(pathCfg('M1'))).toHaveLength(2);
    });
});

describe('useSextaFeiraMesa - config ao trocar de mesa', () => {
    it('limpa a config da mesa anterior ao mudar mesaId e assina a nova', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => doPath(pathCfg('M1'))[0].ok(snap({ chaveGemini: 'k1' })));
        expect(useStore.getState().sextaFeiraConfig).toEqual({ chaveGemini: 'k1' });
        act(() => useStore.setState({ mesaId: 'M2' }));
        expect(useStore.getState().sextaFeiraConfig).toBeNull();
        expect(doPath(pathCfg('M1'))[0].unsub).toHaveBeenCalled();
        expect(doPath(pathCfg('M2'))).toHaveLength(1);
        act(() => doPath(pathCfg('M2'))[0].ok(snap({ chaveGemini: 'k2' })));
        expect(useStore.getState().sextaFeiraConfig).toEqual({ chaveGemini: 'k2' });
    });
    it('sair da mesa (mesaId vazio) limpa a config', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => doPath(pathCfg('M1'))[0].ok(snap({ chaveGemini: 'k1' })));
        act(() => useStore.setState({ mesaId: '' }));
        expect(useStore.getState().sextaFeiraConfig).toBeNull();
    });
    it('erro pendente da mesa anterior nao reescuta a mesa velha depois da troca', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => doPath(pathCfg('M1'))[0].err(new Error('x')));
        act(() => useStore.setState({ mesaId: 'M2' }));
        act(() => { vi.advanceTimersByTime(60000); });
        expect(doPath(pathCfg('M1'))).toHaveLength(1);
    });
});
