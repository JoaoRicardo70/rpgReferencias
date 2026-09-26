import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const peers = [];

vi.mock('peerjs', () => {
    class Peer {
        constructor() {
            this.connections = {};
            this.handlers = {};
            this.destroyed = false;
            this.calls = [];
            peers.push(this);
            // Abre a antena sozinha, como em useVoiceChat.gate.test.jsx.
            setTimeout(() => { (this.handlers.open || []).forEach(h => h('id-teste')); }, 0);
        }
        on(ev, cb) { (this.handlers[ev] = this.handlers[ev] || []).push(cb); }
        call(idFormatado) {
            const callHandlers = {};
            const pc = { iceConnectionState: 'new', oniceconnectionstatechange: null, getSenders: () => [] };
            const fakeCall = {
                peer: idFormatado,
                peerConnection: pc,
                on(ev, cb) { (callHandlers[ev] = callHandlers[ev] || []).push(cb); },
                _emit(ev, ...args) { (callHandlers[ev] || []).forEach(h => h(...args)); }
            };
            this.calls.push({ idFormatado, call: fakeCall, pc });
            return fakeCall;
        }
        destroy() { this.destroyed = true; }
        reconnect() {}
    }
    return { default: Peer };
});

vi.mock('../core/iceServers', () => ({
    montarIceServers: () => [],
    temTurnConfigurado: () => false
}));

import { useVoiceChat } from '../hooks/useVoiceChat';

function criarTrilha() {
    return { enabled: true, kind: 'audio', stop: vi.fn(), clone: () => ({ ...criarTrilha0(), clone: undefined }), applyConstraints: vi.fn(() => Promise.resolve()) };
}
function criarTrilha0() { return { enabled: true, kind: 'audio', stop: vi.fn() }; }

async function montar() {
    const hook = renderHook(() => useVoiceChat('Alice', ['Bob'], true));
    await waitFor(() => expect(hook.result.current.streamAnalisador).not.toBeNull());
    // Deixa o setTimeout(0) do 'open' do peer rodar antes de discar.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return hook;
}

beforeEach(() => {
    peers.length = 0;
    localStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const track = criarTrilha();
    const criarStream = () => ({ id: 's1', getAudioTracks: () => [track], getTracks: () => [track] });
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
            getUserMedia: vi.fn(() => Promise.resolve(criarStream())),
            enumerateDevices: vi.fn(() => Promise.resolve([]))
        }
    });

    vi.stubGlobal('MediaStream', class { constructor(tracks) { this.tracks = tracks; } getTracks() { return this.tracks; } });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useVoiceChat - visibilidade do estado ICE em conexoes[]', () => {
    it('grava iceState=failed na conexao correspondente quando oniceconnectionstatechange dispara "failed"', async () => {
        const { result } = await montar();

        act(() => { result.current.fazerChamada('Bob'); });
        expect(peers[0].calls.length).toBe(1);
        const { call, pc } = peers[0].calls[0];

        // O stream chega primeiro (SDP trocado) e cria a entrada em conexoes, antes do ICE confirmar a rota.
        act(() => { call._emit('stream', { id: 'remote-stream', active: true }); });
        await waitFor(() => expect(result.current.conexoes.find(c => c.id === 'anime-rpg-bob')).toBeTruthy());
        expect(result.current.conexoes.find(c => c.id === 'anime-rpg-bob').iceState).toBe('new');

        act(() => {
            pc.iceConnectionState = 'failed';
            pc.oniceconnectionstatechange();
        });

        await waitFor(() => {
            const conexao = result.current.conexoes.find(c => c.id === 'anime-rpg-bob');
            expect(conexao.iceState).toBe('failed');
        });
        expect(result.current.voiceStatus).toMatch(/^⚠️/);
    });

    it('grava iceState=connected quando o ICE conclui a negociacao', async () => {
        const { result } = await montar();

        act(() => { result.current.fazerChamada('Bob'); });
        const { call, pc } = peers[0].calls[0];
        act(() => { call._emit('stream', { id: 'remote-stream', active: true }); });
        await waitFor(() => expect(result.current.conexoes.find(c => c.id === 'anime-rpg-bob')).toBeTruthy());

        act(() => {
            pc.iceConnectionState = 'connected';
            pc.oniceconnectionstatechange();
        });

        await waitFor(() => {
            const conexao = result.current.conexoes.find(c => c.id === 'anime-rpg-bob');
            expect(conexao.iceState).toBe('connected');
        });
        expect(result.current.voiceStatus).toBe('Online na Taverna!');
    });

    it('trata "disconnected" preso como falha depois do tempo limite (alguns navegadores nunca chegam a "failed")', async () => {
        const { result } = await montar();

        vi.useFakeTimers();
        try {
            act(() => { result.current.fazerChamada('Bob'); });
            const { call, pc } = peers[0].calls[0];
            act(() => { call._emit('stream', { id: 'remote-stream', active: true }); });

            act(() => { pc.iceConnectionState = 'checking'; pc.oniceconnectionstatechange(); });
            act(() => { pc.iceConnectionState = 'disconnected'; pc.oniceconnectionstatechange(); });
            expect(result.current.conexoes.find(c => c.id === 'anime-rpg-bob').iceState).toBe('disconnected');

            act(() => { vi.advanceTimersByTime(12000); });

            const conexao = result.current.conexoes.find(c => c.id === 'anime-rpg-bob');
            expect(conexao.iceState).toBe('failed');
            expect(result.current.voiceStatus).toMatch(/^⚠️/);
        } finally {
            vi.useRealTimers();
        }
    });

    it('nao marca falha se o ICE conectar antes do tempo limite', async () => {
        const { result } = await montar();

        vi.useFakeTimers();
        try {
            act(() => { result.current.fazerChamada('Bob'); });
            const { call, pc } = peers[0].calls[0];
            act(() => { call._emit('stream', { id: 'remote-stream', active: true }); });
            act(() => { pc.iceConnectionState = 'connected'; pc.oniceconnectionstatechange(); });

            act(() => { vi.advanceTimersByTime(12000); });

            const conexao = result.current.conexoes.find(c => c.id === 'anime-rpg-bob');
            expect(conexao.iceState).toBe('connected');
            expect(result.current.voiceStatus).toBe('Online na Taverna!');
        } finally {
            vi.useRealTimers();
        }
    });

    it('cancela o cronometro de timeout se a chamada fechar antes de vencer', async () => {
        const { result } = await montar();

        vi.useFakeTimers();
        try {
            act(() => { result.current.fazerChamada('Bob'); });
            const { call } = peers[0].calls[0];
            // Precisa existir uma conexao de verdade antes do close: senao o timeout, mesmo não
            // cancelado, já não acharia nada pra marcar em conexoes e o teste passaria por acidente.
            act(() => { call._emit('stream', { id: 'remote-stream', active: true }); });
            expect(result.current.conexoes.find(c => c.id === 'anime-rpg-bob')).toBeTruthy();

            act(() => { call._emit('close'); });
            expect(result.current.conexoes.find(c => c.id === 'anime-rpg-bob')).toBeUndefined();

            // Se o cronômetro não tivesse sido cancelado, ele dispararia aqui e reescreveria o
            // voiceStatus com o aviso de falha de rede -- mesmo sem achar mais a conexão em si.
            expect(() => act(() => { vi.advanceTimersByTime(12000); })).not.toThrow();
            expect(result.current.voiceStatus).not.toMatch(/^⚠️/);
        } finally {
            vi.useRealTimers();
        }
    });
});
