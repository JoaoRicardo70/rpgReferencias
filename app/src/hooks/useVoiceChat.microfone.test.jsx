import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('peerjs', () => {
    class Peer {
        constructor(id) {
            this.id = id;
            this.connections = {};
            this.destroy = vi.fn();
        }
        on() {}
        call() { return null; }
        reconnect() {}
    }
    return { default: Peer };
});

vi.mock('../core/iceServers', () => ({
    montarIceServers: () => [],
    temTurnConfigurado: () => false
}));

import { useVoiceChat } from './useVoiceChat';

function criarTrilha() {
    const t = {
        kind: 'audio',
        enabled: true,
        stop: vi.fn(),
        clones: [],
        clone: vi.fn(() => {
            const c = criarTrilha();
            t.clones.push(c);
            return c;
        })
    };
    return t;
}

function criarStream() {
    const trilha = criarTrilha();
    return {
        trilha,
        getTracks: () => [trilha],
        getAudioTracks: () => [trilha]
    };
}

// Promessa controlavel para simular o navegador demorando a abrir o microfone.
function pendente() {
    let resolver; let rejeitar;
    const promessa = new Promise((res, rej) => { resolver = res; rejeitar = rej; });
    return { promessa, resolver, rejeitar };
}

const esvaziar = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

let getUserMedia;
let enumerateDevices;

beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('MediaStream', class { constructor(trilhas = []) { this.trilhas = trilhas; } getTracks() { return this.trilhas; } getAudioTracks() { return this.trilhas; } });
    getUserMedia = vi.fn();
    enumerateDevices = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices } });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const montar = (presente = true) => renderHook(({ p }) => useVoiceChat('Alice', [], p), { initialProps: { p: presente } });

describe('useVoiceChat - ciclo de vida do microfone', () => {
    it('ao entrar na Taverna abre o microfone uma unica vez e guarda meuStream', async () => {
        const s = criarStream();
        getUserMedia.mockResolvedValue(s);
        const { result, rerender } = montar(true);
        await esvaziar();
        expect(getUserMedia).toHaveBeenCalledTimes(1);
        expect(result.current.meuStream).toBe(s);
        expect(result.current.voiceStatus).toBe('Online na Taverna!');
        rerender({ p: true });
        await esvaziar();
        expect(getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('sair da Taverna antes do getUserMedia resolver para as trilhas tardias e meuStream fica null', async () => {
        const d = pendente();
        getUserMedia.mockReturnValue(d.promessa);
        const { result, rerender } = montar(true);
        rerender({ p: false });
        const s = criarStream();
        await act(async () => { d.resolver(s); await d.promessa; });
        await esvaziar();
        expect(s.trilha.stop).toHaveBeenCalledTimes(1);
        expect(result.current.meuStream).toBeNull();
        expect(result.current.streamAnalisador).toBeNull();
        expect(result.current.voiceStatus).toBe('Fora da Taverna');
    });

    it('sair e voltar rapido: o primeiro stream (obsoleto) e parado e so o segundo e mantido', async () => {
        const d1 = pendente();
        const d2 = pendente();
        getUserMedia.mockReturnValueOnce(d1.promessa).mockReturnValueOnce(d2.promessa);
        const { result, rerender } = montar(true);
        rerender({ p: false });
        rerender({ p: true });
        expect(getUserMedia).toHaveBeenCalledTimes(2);
        const s1 = criarStream();
        const s2 = criarStream();
        await act(async () => { d1.resolver(s1); await d1.promessa; });
        await esvaziar();
        expect(s1.trilha.stop).toHaveBeenCalled();
        expect(result.current.meuStream).toBeNull();
        await act(async () => { d2.resolver(s2); await d2.promessa; });
        await esvaziar();
        expect(s2.trilha.stop).not.toHaveBeenCalled();
        expect(result.current.meuStream).toBe(s2);
    });

    it('desmontar o hook dentro da Taverna para as trilhas do microfone e do analisador', async () => {
        const s = criarStream();
        getUserMedia.mockResolvedValue(s);
        const { result, unmount } = montar(true);
        await esvaziar();
        const clone = s.trilha.clones[0];
        expect(result.current.streamAnalisador).toBeTruthy();
        unmount();
        expect(s.trilha.stop).toHaveBeenCalled();
        expect(clone.stop).toHaveBeenCalled();
    });

    it('desmontar antes do getUserMedia resolver descarta o stream tardio', async () => {
        const d = pendente();
        getUserMedia.mockReturnValue(d.promessa);
        const { unmount } = montar(true);
        unmount();
        const s = criarStream();
        await act(async () => { d.resolver(s); await d.promessa; });
        await esvaziar();
        expect(s.trilha.stop).toHaveBeenCalled();
    });

    it('getUserMedia rejeitado mostra Microfone Bloqueado! e permite tentar de novo ao reentrar', async () => {
        getUserMedia.mockRejectedValueOnce(new Error('negado'));
        const { result, rerender } = montar(true);
        await esvaziar();
        expect(result.current.voiceStatus).toBe('Microfone Bloqueado!');
        const s = criarStream();
        getUserMedia.mockResolvedValue(s);
        rerender({ p: false });
        rerender({ p: true });
        await esvaziar();
        expect(result.current.meuStream).toBe(s);
    });
});

describe('useVoiceChat - entrar mutado', () => {
    it('trilha principal nasce desligada e o clone do analisador fica ligado; desmutar liga a principal', async () => {
        const s = criarStream();
        getUserMedia.mockResolvedValue(s);
        const { result, rerender } = montar(false);
        act(() => { result.current.toggleMute(); });
        expect(result.current.mutado).toBe(true);
        rerender({ p: true });
        await esvaziar();
        expect(result.current.meuStream).toBe(s);
        expect(s.trilha.enabled).toBe(false);
        const trilhaAnalisador = result.current.streamAnalisador.getTracks()[0];
        expect(trilhaAnalisador).toBe(s.trilha.clones[0]);
        expect(trilhaAnalisador.enabled).toBe(true);
        act(() => { result.current.toggleMute(); });
        expect(result.current.mutado).toBe(false);
        expect(s.trilha.enabled).toBe(true);
    });

    it('sem mute a trilha principal segue ligada', async () => {
        const s = criarStream();
        getUserMedia.mockResolvedValue(s);
        montar(true);
        await esvaziar();
        expect(s.trilha.enabled).toBe(true);
    });
});

describe('useVoiceChat - trocarMicrofone', () => {
    it('mutado: nova trilha principal desligada, novo clone ligado e a trilha antiga parada', async () => {
        const s1 = criarStream();
        const s2 = criarStream();
        getUserMedia.mockResolvedValueOnce(s1).mockResolvedValueOnce(s2);
        const { result } = montar(true);
        await esvaziar();
        act(() => { result.current.toggleMute(); });
        await act(async () => { await result.current.trocarMicrofone('mic-2'); });
        expect(result.current.meuStream).toBe(s2);
        expect(s2.trilha.enabled).toBe(false);
        const novoClone = result.current.streamAnalisador.getTracks()[0];
        expect(novoClone).toBe(s2.trilha.clones[0]);
        expect(novoClone.enabled).toBe(true);
        expect(s1.trilha.stop).toHaveBeenCalled();
        expect(result.current.selectedMic).toBe('mic-2');
    });

    it('desmutado: nova trilha principal segue ligada', async () => {
        const s1 = criarStream();
        const s2 = criarStream();
        getUserMedia.mockResolvedValueOnce(s1).mockResolvedValueOnce(s2);
        const { result } = montar(true);
        await esvaziar();
        await act(async () => { await result.current.trocarMicrofone('mic-2'); });
        expect(s2.trilha.enabled).toBe(true);
    });

    it('se saiu da Taverna enquanto abria o microfone novo, descarta o stream', async () => {
        const s1 = criarStream();
        const d = pendente();
        getUserMedia.mockResolvedValueOnce(s1).mockReturnValueOnce(d.promessa);
        const { result, rerender } = montar(true);
        await esvaziar();
        let p;
        act(() => { p = result.current.trocarMicrofone('mic-2'); });
        rerender({ p: false });
        const s2 = criarStream();
        await act(async () => { d.resolver(s2); await p; });
        expect(s2.trilha.stop).toHaveBeenCalled();
        expect(result.current.meuStream).toBeNull();
    });

    it('getUserMedia falhando na troca nao quebra e mantem o stream atual', async () => {
        const s1 = criarStream();
        getUserMedia.mockResolvedValueOnce(s1).mockRejectedValueOnce(new Error('falhou'));
        const { result } = montar(true);
        await esvaziar();
        await act(async () => { await result.current.trocarMicrofone('mic-x'); });
        expect(result.current.meuStream).toBe(s1);
        expect(s1.trilha.stop).not.toHaveBeenCalled();
    });
});

describe('useVoiceChat - navegador sem microfone', () => {
    it('navigator.mediaDevices undefined: nao lanca e informa indisponibilidade', () => {
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
        let hook;
        expect(() => { hook = montar(true); }).not.toThrow();
        expect(hook.result.current.voiceStatus).toBe('Microfone indisponível neste navegador');
        expect(hook.result.current.meuStream).toBeNull();
    });

    it('getUserMedia nao e funcao: mesmo aviso', () => {
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
        const { result } = montar(true);
        expect(result.current.voiceStatus).toBe('Microfone indisponível neste navegador');
    });
});
