import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const peers = [];

vi.mock('peerjs', () => {
    class Peer {
        constructor() {
            this.connections = {};
            this.handlers = {};
            this.calls = [];
            peers.push(this);
            setTimeout(() => { (this.handlers.open || []).forEach(h => h('id-teste')); }, 0);
        }
        on(ev, cb) { (this.handlers[ev] = this.handlers[ev] || []).push(cb); }
        emit(ev, ...args) { (this.handlers[ev] || []).forEach(h => h(...args)); }
        call(idFormatado) {
            const fake = criarChamada(idFormatado);
            this.calls.push(fake);
            return fake;
        }
        destroy() {}
        reconnect() {}
    }
    return { default: Peer };
});

vi.mock('../core/iceServers', () => ({ montarIceServers: () => [], temTurnConfigurado: () => false }));

import { useVoiceChat } from '../hooks/useVoiceChat';

function criarChamada(peerId) {
    const handlers = {};
    const pc = { iceConnectionState: 'new', oniceconnectionstatechange: null, getSenders: () => [] };
    return {
        peer: peerId,
        peerConnection: pc,
        answer: vi.fn(),
        close: vi.fn(() => { (handlers.close || []).forEach(h => h()); }),
        on(ev, cb) { (handlers[ev] = handlers[ev] || []).push(cb); },
        _emit(ev, ...args) { (handlers[ev] || []).forEach(h => h(...args)); },
        pc
    };
}

const trilha = () => ({ enabled: true, kind: 'audio', stop: vi.fn(), clone: () => ({ enabled: true, kind: 'audio', stop: vi.fn() }), applyConstraints: vi.fn(() => Promise.resolve()) });

async function montar(inicial) {
    const hook = renderHook(({ ativos, presente }) => useVoiceChat('Zed', ativos, presente), { initialProps: inicial });
    await waitFor(() => expect(hook.result.current.streamAnalisador).not.toBeNull());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return hook;
}

beforeEach(() => {
    peers.length = 0;
    localStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = trilha();
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
            getUserMedia: vi.fn(() => Promise.resolve({ id: 's1', getAudioTracks: () => [t], getTracks: () => [t] })),
            enumerateDevices: vi.fn(() => Promise.resolve([]))
        }
    });
    vi.stubGlobal('MediaStream', class { constructor(t2) { this.t = t2; } getTracks() { return this.t; } });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useVoiceChat - religação de chamadas mortas', () => {
    it('uma ligação nova do mesmo amigo substitui a antiga (ele saiu e voltou)', async () => {
        const { result } = await montar({ ativos: ['Amy'], presente: true });
        const peer = peers[0];

        const antiga = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', antiga); });
        const streamAntigo = { id: 'velho', active: true };
        act(() => { antiga._emit('stream', streamAntigo); });
        expect(result.current.conexoes.find(c => c.id === 'anime-rpg-amy').stream).toBe(streamAntigo);

        const nova = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', nova); });
        const streamNovo = { id: 'novo', active: true };
        act(() => { nova._emit('stream', streamNovo); });

        expect(antiga.close).toHaveBeenCalled();
        const lista = result.current.conexoes.filter(c => c.id === 'anime-rpg-amy');
        expect(lista).toHaveLength(1);
        expect(lista[0].stream).toBe(streamNovo);
    });

    it('o "close" atrasado da ligação antiga não derruba a nova', async () => {
        const { result } = await montar({ ativos: ['Amy'], presente: true });
        const peer = peers[0];
        const antiga = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', antiga); });
        const nova = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', nova); });
        act(() => { nova._emit('stream', { id: 'novo', active: true }); });

        act(() => { antiga._emit('close'); });

        expect(result.current.conexoes.find(c => c.id === 'anime-rpg-amy')).toBeTruthy();
    });

    it('close da ligação antiga não apaga chamadasEmAndamento da nova (não disca por cima)', async () => {
        const { result } = await montar({ ativos: ['Amy'], presente: true });
        const peer = peers[0];
        const antiga = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', antiga); });
        const nova = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', nova); }); // ainda negociando, sem stream

        act(() => { antiga._emit('close'); });
        act(() => { result.current.fazerChamada('Amy'); });

        expect(peer.calls).toHaveLength(0);
        expect(nova.close).not.toHaveBeenCalled();

        const streamNovo = { id: 'novo', active: true };
        act(() => { nova._emit('stream', streamNovo); });
        expect(result.current.conexoes.find(c => c.id === 'anime-rpg-amy').stream).toBe(streamNovo);
    });

    it('stream tardio da ligação antiga substituída é ignorado', async () => {
        const { result } = await montar({ ativos: ['Amy'], presente: true });
        const peer = peers[0];
        const antiga = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', antiga); });
        const nova = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', nova); });

        act(() => { antiga._emit('stream', { id: 'velho', active: true }); });

        expect(result.current.conexoes.filter(c => c.id === 'anime-rpg-amy')).toHaveLength(0);
    });

    it('sair da Sala da Party fecha as ligações abertas', async () => {
        const { result, rerender } = await montar({ ativos: ['Amy'], presente: true });
        const peer = peers[0];
        const chamada = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', chamada); });
        act(() => { chamada._emit('stream', { id: 's', active: true }); });
        expect(result.current.conexoes).toHaveLength(1);

        rerender({ ativos: ['Amy'], presente: false });

        await waitFor(() => expect(chamada.close).toHaveBeenCalled());
        expect(result.current.conexoes).toHaveLength(0);
    });

    it('derruba a ligação de um amigo que não está mais na sala', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { result, rerender } = await montar({ ativos: ['Amy'], presente: true });
        const peer = peers[0];
        const chamada = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', chamada); });
        act(() => { chamada._emit('stream', { id: 's', active: true }); });
        expect(result.current.conexoes).toHaveLength(1);

        rerender({ ativos: [], presente: true });
        act(() => { vi.advanceTimersByTime(4100); });

        expect(chamada.close).toHaveBeenCalled();
        expect(result.current.conexoes).toHaveLength(0);
    });

    it('refaz a ligação quando o ICE falha (o discador liga de novo no próximo ciclo)', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { result } = await montar({ ativos: ['Amy'], presente: true });
        const peer = peers[0];
        // "Zed" > "Amy": Zed é o lado que só atende; então a ligação vem de fora.
        const chamada = criarChamada('anime-rpg-amy');
        act(() => { peer.emit('call', chamada); });
        act(() => { chamada._emit('stream', { id: 's', active: true }); });
        act(() => { chamada.pc.iceConnectionState = 'failed'; });

        act(() => { vi.advanceTimersByTime(4100); });

        expect(chamada.close).toHaveBeenCalled();
        expect(result.current.conexoes).toHaveLength(0);
    });

    it('o lado que só atende liga sozinho depois de um tempo sem ligação', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        await montar({ ativos: ['Amy'], presente: true });
        const peer = peers[0];
        expect(peer.calls).toHaveLength(0);

        act(() => { vi.advanceTimersByTime(17000); });

        expect(peer.calls.length).toBeGreaterThanOrEqual(1);
        expect(peer.calls[0].peer).toBe('anime-rpg-amy');
    });

    it('ligação que nunca recebe áudio é descartada e liberada para nova tentativa', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { result } = await montar({ ativos: ['Zzz'], presente: true });
        const peer = peers[0];
        // "Zed" < "Zzz": Zed liga.
        act(() => { result.current.fazerChamada('Zzz'); });
        expect(peer.calls).toHaveLength(1);

        act(() => { vi.advanceTimersByTime(16000); });

        expect(peer.calls[0].close).toHaveBeenCalled();
        expect(peer.calls.length).toBeGreaterThanOrEqual(2);
    });
});
