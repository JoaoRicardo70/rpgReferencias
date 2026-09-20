import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const criados = [];

vi.mock('peerjs', () => {
    class Peer {
        constructor(id) {
            this.id = id;
            this.connections = {};
            this.handlers = {};
            this.destroyed = false;
            this.destroy = vi.fn(() => { this.destroyed = true; });
            criados.push(this);
        }
        on(ev, cb) { (this.handlers[ev] = this.handlers[ev] || []).push(cb); }
        emit(ev, ...args) { (this.handlers[ev] || []).forEach(h => h(...args)); }
        call() { return null; }
        reconnect() {}
    }
    return { default: Peer };
});

vi.mock('../core/iceServers', () => ({
    montarIceServers: () => [],
    temTurnConfigurado: () => false
}));

import { useVoiceChat } from '../hooks/useVoiceChat';

beforeEach(() => {
    criados.length = 0;
    localStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
            getUserMedia: vi.fn(() => Promise.reject(new Error('sem mic'))),
            enumerateDevices: vi.fn(() => Promise.resolve([]))
        }
    });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('useVoiceChat - troca de personagem recria a antena PeerJS', () => {
    it('cria o Peer com o ID normalizado na montagem', () => {
        renderHook(({ nome }) => useVoiceChat(nome, [], true), { initialProps: { nome: 'Heroi Teste' } });
        expect(criados.map(p => p.id)).toEqual(['anime-rpg-heroiteste']);
    });

    it('ao trocar de nome, destroi o Peer antigo e cria um NOVO com o ID novo', () => {
        const { rerender } = renderHook(({ nome }) => useVoiceChat(nome, [], true), { initialProps: { nome: 'Alice' } });
        act(() => { criados[0].emit('open', 'anime-rpg-alice'); });

        rerender({ nome: 'Bob Silva' });

        expect(criados.length).toBe(2);
        expect(criados[0].destroy).toHaveBeenCalledTimes(1);
        expect(criados[1].id).toBe('anime-rpg-bobsilva');
        expect(criados[1].destroy).not.toHaveBeenCalled();
    });

    it('a antena nova abre normalmente e o hook nao trava (sem erro e novo peer segue vivo)', () => {
        const { result, rerender } = renderHook(({ nome }) => useVoiceChat(nome, [], true), { initialProps: { nome: 'Alice' } });
        act(() => { criados[0].emit('open', 'anime-rpg-alice'); });
        rerender({ nome: 'Bob' });
        expect(() => act(() => { criados[1].emit('open', 'anime-rpg-bob'); })).not.toThrow();
        expect(criados[1].destroyed).toBe(false);
        expect(result.current.conexoes).toEqual([]);
        expect(criados.length).toBe(2);
    });

    it("'open' tardio do peer antigo (ja destruido) e ignorado", () => {
        const log = console.log;
        const { rerender } = renderHook(({ nome }) => useVoiceChat(nome, [], true), { initialProps: { nome: 'Alice' } });
        rerender({ nome: 'Bob' });
        log.mockClear();
        act(() => { criados[0].emit('open', 'anime-rpg-alice'); });
        expect(log.mock.calls.some(c => String(c[0]).includes('Ligação estabelecida'))).toBe(false);
        act(() => { criados[1].emit('open', 'anime-rpg-bob'); });
        expect(log.mock.calls.some(c => String(c[0]).includes('Ligação estabelecida'))).toBe(true);
    });

    it('trocar varias vezes cria um Peer por nome e destroi todos os anteriores', () => {
        const { rerender } = renderHook(({ nome }) => useVoiceChat(nome, [], true), { initialProps: { nome: 'A1' } });
        rerender({ nome: 'B2' });
        rerender({ nome: 'C3' });
        expect(criados.map(p => p.id)).toEqual(['anime-rpg-a1', 'anime-rpg-b2', 'anime-rpg-c3']);
        expect(criados[0].destroyed).toBe(true);
        expect(criados[1].destroyed).toBe(true);
        expect(criados[2].destroyed).toBe(false);
    });

    it('rerender com o mesmo nome (ou so mudando maiusculas/pontuacao) nao recria o Peer', () => {
        const { rerender } = renderHook(({ nome }) => useVoiceChat(nome, [], true), { initialProps: { nome: 'Alice' } });
        rerender({ nome: 'Alice' });
        rerender({ nome: 'ALICE!' });
        expect(criados.length).toBe(1);
        expect(criados[0].destroy).not.toHaveBeenCalled();
    });

    it('nome vazio nao cria Peer; ao receber um nome, cria', () => {
        const { rerender } = renderHook(({ nome }) => useVoiceChat(nome, [], true), { initialProps: { nome: '' } });
        expect(criados.length).toBe(0);
        rerender({ nome: 'Carlos' });
        expect(criados.map(p => p.id)).toEqual(['anime-rpg-carlos']);
    });

    it('unmount destroi o Peer atual', () => {
        const { unmount } = renderHook(({ nome }) => useVoiceChat(nome, [], true), { initialProps: { nome: 'Alice' } });
        unmount();
        expect(criados[0].destroy).toHaveBeenCalledTimes(1);
    });
});
