import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ cbFicha: null, garantir: vi.fn() }));

vi.mock('../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('../services/backup-ficha', () => ({ garantirBackupDiario: h.garantir }));
vi.mock('../services/firebase-sync', () => ({
    iniciarListenerFichaPropria: vi.fn((nome, cb) => { h.cbFicha = cb; return () => {}; }),
    iniciarListenerPersonagens: vi.fn(() => () => {}),
    iniciarListenerFeed: vi.fn(() => () => {}),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    resetSincronizacaoFicha: vi.fn(),
    mesclarPersonagensRemotos: vi.fn((a, b) => b),
}));

import useFirebase from './useFirebase';
import useStore from '../stores/useStore';

const ficha = { vida: 10, bio: 'x', poderes: [], inventario: [], mana: 5 };

describe('useFirebase - backup diario na primeira leitura', () => {
    beforeEach(() => {
        h.cbFicha = null;
        h.garantir.mockReset().mockResolvedValue({ ok: true });
        useStore.setState({ mesaId: 'M1', meuNome: 'Ana', feedCombate: [] });
    });
    afterEach(() => cleanup());

    it('chama garantirBackupDiario(meuNome, dados) na primeira leitura com ficha', () => {
        renderHook(() => useFirebase());
        expect(h.cbFicha).toBeTypeOf('function');
        act(() => { h.cbFicha(ficha, true); });
        expect(h.garantir).toHaveBeenCalledTimes(1);
        expect(h.garantir).toHaveBeenCalledWith('Ana', ficha);
    });
    it('nao chama sem ficha (null)', () => {
        renderHook(() => useFirebase());
        act(() => { h.cbFicha(null, true); });
        expect(h.garantir).not.toHaveBeenCalled();
    });
    it('nao chama em leituras seguintes (primeiraCarga false)', () => {
        renderHook(() => useFirebase());
        act(() => { h.cbFicha(ficha, false); });
        expect(h.garantir).not.toHaveBeenCalled();
    });
    it('rejeicao do backup nao quebra o carregamento', () => {
        h.garantir.mockRejectedValue(new Error('x'));
        renderHook(() => useFirebase());
        expect(() => act(() => { h.cbFicha(ficha, true); })).not.toThrow();
    });
});
