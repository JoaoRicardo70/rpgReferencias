import { describe, it, expect, vi, beforeEach } from 'vitest';
import { iniciarListenerDivisorPoderMesa, salvarDivisorPoderMesa } from './firebase-sync';
import useStore from '../stores/useStore';
import { onValue, set } from 'firebase/database';

// ---------------------------------------------------------------------------
// QA — iniciarListenerDivisorPoderMesa / salvarDivisorPoderMesa (firebase-sync.js)
//
// Correção: quando o nó `mesas/{mesaId}/divisorPoderPadrao` nunca foi gravado
// com sucesso no Firebase (nó ausente/inválido), o listener NÃO deve mais
// sobrescrever o valor já carregado do cache local com o padrão "1" — só deve
// repassar ao callback um valor REAL vindo do Firebase (>0). A sincronização
// multiplayer normal (Firebase COM valor válido) precisa continuar funcionando
// exatamente como antes.
// ---------------------------------------------------------------------------

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
    push: vi.fn(() => Promise.resolve()),
    remove: vi.fn(),
    onValue: vi.fn(),
    onChildAdded: vi.fn(),
    onDisconnect: vi.fn(() => ({ remove: () => Promise.resolve() })),
    limitToLast: vi.fn(),
    query: vi.fn(),
}));

vi.mock('./firebase-config', () => ({
    db: {}, // Simula conexão ativa
}));

vi.mock('../stores/useStore', () => ({
    default: {
        getState: vi.fn(),
    },
    sanitizarNome: vi.fn((n) => n),
}));

describe('firebase-sync — iniciarListenerDivisorPoderMesa', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStore.getState.mockReturnValue({ mesaId: 'mesa1' });
    });

    it('quando o Firebase retorna um snapshot VÁLIDO (>0), o callback é chamado com o valor — sincronização multiplayer intacta', () => {
        onValue.mockImplementation((ref, cb) => { cb({ val: () => 3 }); return () => {}; });
        const callback = vi.fn();

        iniciarListenerDivisorPoderMesa(callback);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(3);
    });

    it('quando o snapshot é NULO (nó nunca foi gravado), o callback NÃO é chamado — não sobrescreve o cache local com "1"', () => {
        onValue.mockImplementation((ref, cb) => { cb({ val: () => null }); return () => {}; });
        const callback = vi.fn();

        iniciarListenerDivisorPoderMesa(callback);

        expect(callback).not.toHaveBeenCalled();
    });

    it('quando o snapshot é inválido (string não-numérica), o callback NÃO é chamado', () => {
        onValue.mockImplementation((ref, cb) => { cb({ val: () => 'lixo' }); return () => {}; });
        const callback = vi.fn();

        iniciarListenerDivisorPoderMesa(callback);

        expect(callback).not.toHaveBeenCalled();
    });

    it('quando o snapshot é 0 ou negativo, o callback NÃO é chamado (0/negativo não é um divisor válido)', () => {
        const callback = vi.fn();

        onValue.mockImplementation((ref, cb) => { cb({ val: () => 0 }); return () => {}; });
        iniciarListenerDivisorPoderMesa(callback);
        expect(callback).not.toHaveBeenCalled();

        vi.clearAllMocks();
        useStore.getState.mockReturnValue({ mesaId: 'mesa1' });
        onValue.mockImplementation((ref, cb) => { cb({ val: () => -2 }); return () => {}; });
        iniciarListenerDivisorPoderMesa(callback);
        expect(callback).not.toHaveBeenCalled();
    });

    it('sem mesaId, não registra listener nenhum (retorna unsubscribe vazio, onValue não é chamado)', () => {
        useStore.getState.mockReturnValue({ mesaId: '' });
        const callback = vi.fn();

        const unsub = iniciarListenerDivisorPoderMesa(callback);

        expect(onValue).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
        expect(typeof unsub).toBe('function');
    });
});

describe('firebase-sync — salvarDivisorPoderMesa', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStore.getState.mockReturnValue({ mesaId: 'mesa1' });
    });

    it('grava o valor no Firebase quando há mesa ativa', () => {
        salvarDivisorPoderMesa(5);
        expect(set).toHaveBeenCalledTimes(1);
        expect(set.mock.calls[0][1]).toBe(5);
    });

    it('falha silenciosa (catch) não lança erro não tratado quando o Firebase rejeita a escrita', async () => {
        set.mockReturnValueOnce(Promise.reject(new Error('permissão negada')));
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(() => salvarDivisorPoderMesa(5)).not.toThrow();
        // Aguarda o catch assíncrono resolver antes de terminar o teste.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
    });
});
