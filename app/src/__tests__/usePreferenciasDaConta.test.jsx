import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

vi.mock('../services/preferencias-sync', () => ({
    lerPreferenciasDaConta: vi.fn(),
    gravarPreferenciasDaConta: vi.fn(() => Promise.resolve(true)),
}));

import { lerPreferenciasDaConta, gravarPreferenciasDaConta } from '../services/preferencias-sync';
import { usePreferenciasDaConta } from '../hooks/usePreferenciasDaConta';

let recarregar;
beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    recarregar = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload: recarregar } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('usePreferenciasDaConta', () => {
    it('sem nome não faz nada', () => {
        renderHook(() => usePreferenciasDaConta(''));
        expect(lerPreferenciasDaConta).not.toHaveBeenCalled();
    });

    it('conta com preferências diferentes: aplica no aparelho e recarrega uma vez', async () => {
        lerPreferenciasDaConta.mockResolvedValue({ rpg_tema: 'cyber', rpg_atalhos: '{"x":1}' });
        renderHook(() => usePreferenciasDaConta('Ana'));
        await waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
        expect(localStorage.getItem('rpg_tema')).toBe('cyber');
        expect(localStorage.getItem('rpg_atalhos')).toBe('{"x":1}');
    });

    it('não recarrega de novo na mesma sessão (evita laço)', async () => {
        sessionStorage.setItem('rpg_prefs_recarregado', 'Ana');
        lerPreferenciasDaConta.mockResolvedValue({ rpg_tema: 'cyber' });
        renderHook(() => usePreferenciasDaConta('Ana'));
        await waitFor(() => expect(localStorage.getItem('rpg_tema')).toBe('cyber'));
        expect(recarregar).not.toHaveBeenCalled();
    });

    it('conta vazia: sobe o que o aparelho já tem', async () => {
        localStorage.setItem('rpg_tema', 'neon');
        lerPreferenciasDaConta.mockResolvedValue({});
        renderHook(() => usePreferenciasDaConta('Ana'));
        await waitFor(() => expect(gravarPreferenciasDaConta).toHaveBeenCalledWith('Ana', { rpg_tema: 'neon' }, []));
        expect(recarregar).not.toHaveBeenCalled();
    });

    it('conta igual ao aparelho: não grava nem recarrega', async () => {
        localStorage.setItem('rpg_tema', 'neon');
        lerPreferenciasDaConta.mockResolvedValue({ rpg_tema: 'neon' });
        renderHook(() => usePreferenciasDaConta('Ana'));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(gravarPreferenciasDaConta).not.toHaveBeenCalled();
        expect(recarregar).not.toHaveBeenCalled();
    });

    it('mudança depois do login é gravada na conta (na verificação periódica)', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        localStorage.setItem('rpg_tema', 'neon');
        lerPreferenciasDaConta.mockResolvedValue({ rpg_tema: 'neon' });
        renderHook(() => usePreferenciasDaConta('Ana'));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        localStorage.setItem('rpg_atalhos', '{"y":2}');
        await act(async () => { vi.advanceTimersByTime(5100); await Promise.resolve(); });
        expect(gravarPreferenciasDaConta).toHaveBeenCalledWith('Ana', { rpg_atalhos: '{"y":2}' }, []);
    });

    it('sem acesso à conta (null): não mexe em nada', async () => {
        localStorage.setItem('rpg_tema', 'neon');
        lerPreferenciasDaConta.mockResolvedValue(null);
        renderHook(() => usePreferenciasDaConta('Ana'));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(gravarPreferenciasDaConta).not.toHaveBeenCalled();
        expect(recarregar).not.toHaveBeenCalled();
    });
});
