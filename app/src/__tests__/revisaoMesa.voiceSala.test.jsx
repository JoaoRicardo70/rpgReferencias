import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const peers = [];
vi.mock('peerjs', () => {
    class Peer {
        constructor() {
            this.handlers = {};
            peers.push(this);
            setTimeout(() => { (this.handlers.open || []).forEach(h => h('id-teste')); }, 0);
        }
        on(ev, cb) { (this.handlers[ev] = this.handlers[ev] || []).push(cb); }
        call() { return null; }
        destroy() {}
        reconnect() {}
    }
    return { default: Peer };
});
vi.mock('../core/iceServers', () => ({ montarIceServers: () => [], temTurnConfigurado: () => false }));

import { useVoiceChat } from '../hooks/useVoiceChat';

const trilha = () => ({ enabled: true, kind: 'audio', stop: vi.fn(), clone: undefined, applyConstraints: vi.fn(() => Promise.resolve()) });
const chamada = (peer) => ({ peer, answer: vi.fn(), close: vi.fn(), on: vi.fn(), peerConnection: null });

beforeEach(() => {
    peers.length = 0;
    localStorage.clear();
    const t = trilha();
    const stream = { id: 's', getAudioTracks: () => [t], getTracks: () => [t] };
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn(() => Promise.resolve(stream)), enumerateDevices: vi.fn(() => Promise.resolve([])) },
    });
});

async function montar(ativos) {
    const hook = renderHook(({ a }) => useVoiceChat('Heroi Teste', a, true), { initialProps: { a: ativos } });
    await waitFor(() => expect(peers.length).toBeGreaterThan(0));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    return hook;
}
const disparar = (call) => act(() => { (peers[peers.length - 1].handlers.call || []).forEach(h => h(call)); });

describe('useVoiceChat - so atende quem esta na sala (tavernaAtivos)', () => {
    it('estranho: recusa (close), nao atende e nao entrega o microfone', async () => {
        await montar(['Amigo Um']);
        const c = chamada('anime-rpg-estranho');
        disparar(c);
        expect(c.close).toHaveBeenCalledTimes(1);
        expect(c.answer).not.toHaveBeenCalled();
    });
    it('membro da sala: atende com o stream local', async () => {
        await montar(['Amigo Um']);
        const c = chamada('anime-rpg-amigoum');
        disparar(c);
        await waitFor(() => expect(c.answer).toHaveBeenCalledTimes(1));
        expect(c.answer.mock.calls[0][0]).toBeTruthy();
        expect(c.close).not.toHaveBeenCalled();
    });
    it('sala vazia ou tavernaAtivos invalido: recusa todos sem lancar', async () => {
        await montar([]);
        const c = chamada('anime-rpg-amigoum');
        expect(() => disparar(c)).not.toThrow();
        expect(c.close).toHaveBeenCalled();
        expect(c.answer).not.toHaveBeenCalled();
        const h2 = await montar(null);
        const c2 = chamada('anime-rpg-amigoum');
        expect(() => disparar(c2)).not.toThrow();
        expect(c2.answer).not.toHaveBeenCalled();
        h2.unmount();
    });
    it('close que lanca nao propaga', async () => {
        await montar(['Amigo Um']);
        const c = chamada('anime-rpg-estranho');
        c.close = vi.fn(() => { throw new Error('ja fechada'); });
        expect(() => disparar(c)).not.toThrow();
        expect(c.answer).not.toHaveBeenCalled();
    });
    it('a sala atualizada vale na chamada seguinte (ref, sem recriar o peer)', async () => {
        const hook = await montar([]);
        const n = peers.length;
        hook.rerender({ a: ['Amigo Um'] });
        const c = chamada('anime-rpg-amigoum');
        disparar(c);
        await waitFor(() => expect(c.answer).toHaveBeenCalled());
        expect(peers.length).toBe(n);
    });
});
