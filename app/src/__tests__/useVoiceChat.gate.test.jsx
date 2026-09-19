import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('peerjs', () => {
    class Peer {
        constructor() {
            this.connections = {};
            this.handlers = {};
            this.destroyed = false;
            setTimeout(() => { (this.handlers.open || []).forEach(h => h('id-teste')); }, 0);
        }
        on(ev, cb) { (this.handlers[ev] = this.handlers[ev] || []).push(cb); }
        call() { return null; }
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
import { estadoPortao } from '../core/audioVoz';

const CHAVE = 'rpg_sensibilidade_voz_v2';

let LEVEL;
let track;
let track2;
let instancias;
let fila;
let agora;
let getUserMediaMock;

function criarTrilha() {
    return {
        enabled: true,
        kind: 'audio',
        stop: vi.fn(),
        clone: () => track2,
        applyConstraints: vi.fn(() => Promise.resolve())
    };
}

function rodarQuadros(n, passoMs = 16) {
    act(() => {
        for (let i = 0; i < n; i++) {
            agora += passoMs;
            const atuais = fila.splice(0, fila.length);
            atuais.forEach(f => f.cb());
        }
    });
}

async function montar() {
    const hook = renderHook(() => useVoiceChat('Heroi Teste', [], true));
    await waitFor(() => expect(hook.result.current.streamAnalisador).not.toBeNull());
    await waitFor(() => expect(instancias.length).toBeGreaterThan(0));
    return hook;
}

beforeEach(() => {
    localStorage.clear();
    LEVEL = 0;
    agora = 1000;
    fila = [];
    instancias = [];
    track = criarTrilha();
    track2 = { ...criarTrilha(), clone: undefined };
    Object.assign(estadoPortao, { ativo: false, aberto: false, piso: 0, limiar: 0 });

    const criarStream = () => ({ id: 's1', getAudioTracks: () => [track], getTracks: () => [track] });
    getUserMediaMock = vi.fn(() => Promise.resolve(criarStream()));
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: getUserMediaMock, enumerateDevices: vi.fn(() => Promise.resolve([])) }
    });

    vi.stubGlobal('MediaStream', class { constructor(tracks) { this.tracks = tracks; } getTracks() { return this.tracks; } });

    class FakeAudioContext {
        constructor() {
            this.sampleRate = 48000;
            this.state = 'running';
            instancias.push(this);
        }
        createMediaStreamSource() { return { connect: vi.fn() }; }
        createAnalyser() {
            return {
                fftSize: 0,
                smoothingTimeConstant: 0,
                frequencyBinCount: 128,
                getByteFrequencyData: (arr) => arr.fill(LEVEL)
            };
        }
        close() { this.state = 'closed'; return Promise.resolve(); }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    window.AudioContext = FakeAudioContext;

    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (cb) => { id += 1; fila.push({ id, cb }); return id; });
    vi.stubGlobal('cancelAnimationFrame', (i) => { fila = fila.filter(f => f.id !== i); });
    vi.spyOn(performance, 'now').mockImplementation(() => agora);
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useVoiceChat - noise gate', () => {
    it('(1) trilha segue o portao: silencio fecha, voz sustentada abre, silencio > 700ms fecha', async () => {
        const { result } = await montar();
        expect(result.current.supressorAtivo).toBe(true);
        expect(estadoPortao.ativo).toBe(true);

        rodarQuadros(10);
        expect(track.enabled).toBe(false);
        expect(estadoPortao.aberto).toBe(false);

        LEVEL = 150;
        rodarQuadros(2);
        expect(track.enabled).toBe(false); // ainda nao passou de 4 quadros
        rodarQuadros(4);
        expect(track.enabled).toBe(true);
        expect(estadoPortao.aberto).toBe(true);

        LEVEL = 0;
        rodarQuadros(10, 16); // ~160ms < 700ms: segura aberto
        expect(track.enabled).toBe(true);
        rodarQuadros(1, 800);
        expect(track.enabled).toBe(false);
        expect(estadoPortao.aberto).toBe(false);
    });

    it('(2) mute nao recria o AudioContext, mantem trilha desabilitada e desmutar retoma o portao', async () => {
        const { result } = await montar();
        const total = instancias.length;
        LEVEL = 150;
        rodarQuadros(6);
        expect(track.enabled).toBe(true);

        expect(() => act(() => { result.current.toggleMute(); })).not.toThrow();
        expect(result.current.mutado).toBe(true);
        expect(instancias.length).toBe(total);
        expect(instancias[0].state).toBe('running');
        expect(track.enabled).toBe(false);

        rodarQuadros(10);
        expect(track.enabled).toBe(false);

        act(() => { result.current.toggleMute(); });
        expect(result.current.mutado).toBe(false);
        expect(instancias.length).toBe(total);
        rodarQuadros(6);
        expect(track.enabled).toBe(true);

        LEVEL = 0;
        rodarQuadros(1, 800);
        expect(track.enabled).toBe(false);
    });

    it('(3) unmount fecha o AudioContext sem erro', async () => {
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { unmount } = await montar();
        rodarQuadros(3);
        expect(() => unmount()).not.toThrow();
        instancias.forEach(i => expect(i.state).toBe('closed'));
        expect(estadoPortao.ativo).toBe(false);
        expect(estadoPortao.aberto).toBe(false);
        expect(erro).not.toHaveBeenCalled();
    });

    it('(3b) unmount com contexto ja fechado tambem nao lanca', async () => {
        const { unmount } = await montar();
        instancias[0].state = 'closed';
        expect(() => unmount()).not.toThrow();
    });

    it('(4) desligar o supressor fecha o contexto, forca trilha aberta e religar recria o portao', async () => {
        const { result } = await montar();
        rodarQuadros(5);
        expect(track.enabled).toBe(false);
        const total = instancias.length;

        act(() => { result.current.setSupressorAtivo(false); });
        expect(instancias[0].state).toBe('closed');
        expect(estadoPortao.ativo).toBe(false);
        expect(track.enabled).toBe(true);
        expect(instancias.length).toBe(total);

        act(() => { result.current.setSupressorAtivo(true); });
        expect(instancias.length).toBe(total + 1);
        expect(instancias[total].state).toBe('running');
        expect(estadoPortao.ativo).toBe(true);
        rodarQuadros(3);
        expect(track.enabled).toBe(false);
    });

    it('(4b) desligar o supressor mutado nao reabre a trilha', async () => {
        const { result } = await montar();
        act(() => { result.current.toggleMute(); });
        expect(track.enabled).toBe(false);
        act(() => { result.current.setSupressorAtivo(false); });
        expect(track.enabled).toBe(false);
        expect(estadoPortao.ativo).toBe(false);
    });

    it('(5) applyConstraints reflete o estado do filtro', async () => {
        const { result } = await montar();
        act(() => { result.current.setSupressorAtivo(false); });
        expect(track.applyConstraints).toHaveBeenLastCalledWith({
            echoCancellation: true, noiseSuppression: false, autoGainControl: true, voiceIsolation: false
        });
        act(() => { result.current.setSupressorAtivo(true); });
        expect(track.applyConstraints).toHaveBeenLastCalledWith({
            echoCancellation: true, noiseSuppression: true, autoGainControl: false, voiceIsolation: true
        });
    });

    it('(5b) applyConstraints rejeitado nao gera erro', async () => {
        const { result } = await montar();
        track.applyConstraints = vi.fn(() => Promise.reject(new Error('nao suportado')));
        expect(() => act(() => { result.current.setSupressorAtivo(false); })).not.toThrow();
        await act(async () => { await Promise.resolve(); });
    });

    it('(6) getUserMedia pede AGC desligado e supressao ligada com o filtro ativo', async () => {
        await montar();
        expect(getUserMediaMock).toHaveBeenCalledTimes(1);
        const { audio } = getUserMediaMock.mock.calls[0][0];
        expect(audio.autoGainControl).toBe(false);
        expect(audio.noiseSuppression).toBe(true);
        expect(audio.echoCancellation).toBe(true);
    });

    it('(7) sensibilidade: padrao 30, persiste e sobe o limiar sem novo AudioContext', async () => {
        const { result } = await montar();
        expect(result.current.sensibilidadeVoz).toBe(30);
        rodarQuadros(3);
        expect(estadoPortao.limiar).toBeGreaterThanOrEqual(30);
        const total = instancias.length;

        act(() => { result.current.setSensibilidadeVoz(90); });
        expect(localStorage.getItem(CHAVE)).toBe('90');
        rodarQuadros(3);
        expect(estadoPortao.limiar).toBeGreaterThanOrEqual(90);
        expect(instancias.length).toBe(total);
        expect(instancias[0].state).toBe('running');
    });

    it('(7b) sensibilidade salva e lida do localStorage na montagem', async () => {
        localStorage.setItem(CHAVE, '75');
        const { result } = await montar();
        expect(result.current.sensibilidadeVoz).toBe(75);
    });

    it('(7c) sensibilidade alta impede que LEVEL=60 abra o portao', async () => {
        const { result } = await montar();
        act(() => { result.current.setSensibilidadeVoz(90); });
        LEVEL = 60;
        rodarQuadros(20);
        expect(track.enabled).toBe(false);
    });

    it('(8) estadoPortao.aberto e false enquanto mutado mesmo com portao aberto', async () => {
        const { result } = await montar();
        LEVEL = 150;
        rodarQuadros(6);
        expect(estadoPortao.aberto).toBe(true);

        act(() => { result.current.toggleMute(); });
        rodarQuadros(3);
        expect(estadoPortao.aberto).toBe(false);
        expect(track.enabled).toBe(false);

        act(() => { result.current.toggleMute(); });
        rodarQuadros(2);
        expect(estadoPortao.aberto).toBe(true);
    });
});
