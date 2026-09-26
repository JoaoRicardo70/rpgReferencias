/**
 * Tests for GravadorPanel.jsx — áudio da página (música da Mesa de Som) na gravação.
 *
 * getDisplayMedia é pedido com `audio: true` e `preferCurrentTab: true` (a aba pré-selecionada já é a
 * do próprio app). Se a captura trouxer trilha de áudio, ela entra na mixagem e as vozes remotas ficam
 * com ganho 0 (já estão no áudio da página), a menos que o usuário esteja surdo (voz.surdo), quando
 * voltam a ganho 1. Sem áudio da página, ganho 1 e um log.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';
import { VoiceContext } from '../../hooks/VoiceContext';

const mockStoreState = { meuNome: 'Tester' };

vi.mock('../../stores/useStore', () => ({
    default: vi.fn((selector) => selector(mockStoreState)),
}));

class MockMediaRecorder {
    constructor(stream, options) {
        this.stream = stream;
        this.options = options;
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
        MockMediaRecorder.instances.push(this);
    }
    start() { this.state = 'recording'; }
    stop() {
        this.state = 'inactive';
        if (this.onstop) this.onstop();
    }
}
MockMediaRecorder.instances = [];

class MockAudioContext {
    constructor() {
        this.state = 'running';
        this.fontes = [];
        this.ganhos = [];
        this.destinos = [];
        MockAudioContext.instances.push(this);
    }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 128, getByteFrequencyData: vi.fn() }; }
    createMediaStreamSource(stream) {
        const fonte = { stream, connect: vi.fn(), disconnect: vi.fn() };
        this.fontes.push(fonte);
        return fonte;
    }
    createMediaStreamDestination() {
        const destino = { stream: { getAudioTracks: () => [{ kind: 'audio' }] } };
        this.destinos.push(destino);
        return destino;
    }
    createGain() {
        const ganho = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
        this.ganhos.push(ganho);
        return ganho;
    }
    resume() {}
    close() { this.state = 'closed'; }
}
MockAudioContext.instances = [];

class MockMediaStream {
    constructor(tracks) { this.tracks = tracks || []; }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
    getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
}

function criarStreamAudio(id) {
    const tracks = [{ kind: 'audio', stop: vi.fn() }];
    return { id, getTracks: () => tracks, getAudioTracks: () => tracks };
}

const userAgentOriginal = navigator.userAgent;
const definirUserAgent = (ua) => Object.defineProperty(global.navigator, 'userAgent', { value: ua, configurable: true });
const UA_ELECTRON = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Electron/28.0.0 Safari/537.36';

describe('GravadorPanel — áudio da página na gravação', () => {
    let rafSpy;
    let getDisplayMediaMock;
    let telaTrack;
    let audioTrack;
    let telaStream;

    beforeEach(() => {
        definirUserAgent(UA_ELECTRON);
        MockMediaRecorder.instances = [];
        MockAudioContext.instances = [];
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        global.MediaRecorder = MockMediaRecorder;
        window.MediaRecorder = MockMediaRecorder;
        global.AudioContext = MockAudioContext;
        window.AudioContext = MockAudioContext;
        global.MediaStream = MockMediaStream;
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
        rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);
        vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
        vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

        telaTrack = { kind: 'video', stop: vi.fn(), getSettings: () => ({ displaySurface: 'browser' }) };
        audioTrack = { kind: 'audio', stop: vi.fn() };
        telaStream = {
            getTracks: () => [telaTrack, audioTrack],
            getVideoTracks: () => [telaTrack],
            getAudioTracks: () => [audioTrack],
        };
        getDisplayMediaMock = vi.fn(() => Promise.resolve(telaStream));
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: {
                getUserMedia: vi.fn(() => Promise.resolve(criarStreamAudio('micProprio'))),
                getDisplayMedia: getDisplayMediaMock,
            },
            configurable: true,
        });
    });

    afterEach(() => {
        definirUserAgent(userAgentOriginal);
        cleanup();
        rafSpy.mockRestore();
        vi.restoreAllMocks();
    });

    const vozBase = () => ({
        meuStream: criarStreamAudio('meuMicRadio'),
        conexoes: [{ id: 'anime-rpg-natsu', stream: criarStreamAudio('s1') }],
    });

    async function montar(valorVoz) {
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');
        let utils;
        await act(async () => {
            utils = render(
                React.createElement(VoiceContext.Provider, { value: valorVoz }, React.createElement(GravadorPanel))
            );
        });
        await act(async () => {
            fireEvent.click(screen.getByText('▶ INICIAR GRAVAÇÃO'));
            for (let i = 0; i < 6; i++) await Promise.resolve();
        });
        return { ...utils, GravadorPanel };
    }

    const ctx = () => MockAudioContext.instances[0];
    const fontePagina = () => ctx().fontes.find(f => f.stream instanceof MockMediaStream);
    const fonteDe = (id) => ctx().fontes.find(f => f.stream.id === id);

    it('(a) no app desktop (Electron) pede getDisplayMedia com audio da aba', async () => {
        await montar(null);
        expect(getDisplayMediaMock).toHaveBeenCalledWith(expect.objectContaining({
            audio: true, preferCurrentTab: true
        }));
    });

    it('(a) no navegador comum também pede getDisplayMedia com audio da aba (aba pré-selecionada pelo preferCurrentTab)', async () => {
        definirUserAgent(userAgentOriginal);
        await montar(null);
        expect(getDisplayMediaMock).toHaveBeenCalledWith(expect.objectContaining({
            audio: true, preferCurrentTab: true
        }));
    });

    it('(c) no navegador comum (sem trilha de áudio, ex.: usuário escolheu janela/tela em vez de aba) não cria fonte da página, ganho fica 1 e loga o aviso orientando a escolher a aba', async () => {
        definirUserAgent(userAgentOriginal);
        telaStream = { getTracks: () => [telaTrack], getVideoTracks: () => [telaTrack], getAudioTracks: () => [] };
        await montar(vozBase());

        expect(fontePagina()).toBeUndefined();
        expect(ctx().ganhos[0].gain.value).toBe(1);
        expect(screen.getByText(/Sem áudio do app nesta captura: escolha a opção "Aba"/)).toBeTruthy();
        expect(MockMediaRecorder.instances).toHaveLength(1);
    });

    it('(b) cria fonte do áudio da tela, liga ao destino e zera o ganho das vozes remotas', async () => {
        await montar(vozBase());

        const fonte = fontePagina();
        expect(fonte).toBeDefined();
        expect(fonte.stream.getAudioTracks()).toEqual([audioTrack]);
        expect(fonte.connect).toHaveBeenCalledWith(ctx().destinos[0]);
        expect(ctx().ganhos).toHaveLength(1);
        expect(ctx().ganhos[0].connect).toHaveBeenCalledWith(ctx().destinos[0]);
        expect(ctx().ganhos[0].gain.value).toBe(0);
        expect(screen.getByText(/Áudio do app/)).toBeTruthy();
    });

    it('(b) vozes remotas passam pelo ganho, o microfone local vai direto ao destino', async () => {
        await montar(vozBase());

        expect(fonteDe('s1').connect).toHaveBeenCalledWith(ctx().ganhos[0]);
        expect(fonteDe('meuMicRadio').connect).toHaveBeenCalledWith(ctx().destinos[0]);
        expect(fonteDe('meuMicRadio').connect).not.toHaveBeenCalledWith(ctx().ganhos[0]);
    });

    it('(b) com voz.surdo true o ganho das remotas volta a 1', async () => {
        await montar({ ...vozBase(), surdo: true });
        expect(ctx().ganhos[0].gain.value).toBe(1);
    });

    it('(b) alternar surdo durante a gravação atualiza o ganho', async () => {
        const voz = vozBase();
        const { rerender, GravadorPanel } = await montar(voz);
        expect(ctx().ganhos[0].gain.value).toBe(0);

        await act(async () => {
            rerender(React.createElement(VoiceContext.Provider, { value: { ...voz, surdo: true } }, React.createElement(GravadorPanel)));
        });
        expect(ctx().ganhos[0].gain.value).toBe(1);

        await act(async () => {
            rerender(React.createElement(VoiceContext.Provider, { value: { ...voz, surdo: false } }, React.createElement(GravadorPanel)));
        });
        expect(ctx().ganhos[0].gain.value).toBe(0);
    });

    it('(c) no app desktop (Electron) sem trilha de áudio loga o aviso específico de instalar a versão mais recente (não o de escolher a aba)', async () => {
        telaStream = { getTracks: () => [telaTrack], getVideoTracks: () => [telaTrack], getAudioTracks: () => [] };
        await montar(vozBase());

        expect(fontePagina()).toBeUndefined();
        expect(ctx().ganhos[0].gain.value).toBe(1);
        expect(screen.getByText(/Sem áudio do app nesta captura: a música da Mesa de Som não vai na gravação \(no app desktop, instale a versão mais recente\)/)).toBeTruthy();
        expect(screen.queryByText(/escolha a opção "Aba"/)).toBeNull();
    });

    it('(c) captura sem trilhas de áudio mantém ganho 1 e registra o log "Sem áudio do app"', async () => {
        telaStream = { getTracks: () => [telaTrack], getVideoTracks: () => [telaTrack], getAudioTracks: () => [] };
        await montar(vozBase());

        expect(fontePagina()).toBeUndefined();
        expect(ctx().ganhos[0].gain.value).toBe(1);
        expect(screen.getByText(/Sem áudio do app/)).toBeTruthy();
        expect(screen.queryByText(/Áudio do app \(/)).toBeNull();
    });

    it('(c) stream sem getAudioTracks não quebra: ganho 1 e log "Sem áudio do app"', async () => {
        telaStream = { getTracks: () => [telaTrack], getVideoTracks: () => [telaTrack] };
        await montar(vozBase());

        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(ctx().ganhos[0].gain.value).toBe(1);
        expect(screen.getByText(/Sem áudio do app/)).toBeTruthy();
    });

    it('(c) sem captura de tela (negada) não loga "Sem áudio do app" e o ganho fica 1', async () => {
        getDisplayMediaMock.mockImplementation(() => Promise.reject(new Error('denied')));
        await montar(vozBase());

        expect(screen.queryByText(/Sem áudio do app/)).toBeNull();
        expect(ctx().ganhos[0].gain.value).toBe(1);
    });

    it('(d) ao encerrar a gravação a fonte do áudio da página é desconectada', async () => {
        await montar(vozBase());
        const fonte = fontePagina();
        expect(fonte.disconnect).not.toHaveBeenCalled();

        await act(async () => { fireEvent.click(screen.getByText('⏹ ENCERRAR E BAIXAR')); });

        expect(fonte.disconnect).toHaveBeenCalled();
    });

    it('(d) ao desmontar durante a gravação a fonte do áudio da página é desconectada', async () => {
        const { unmount } = await montar(vozBase());
        const fonte = fontePagina();

        await act(async () => { unmount(); });

        expect(fonte.disconnect).toHaveBeenCalled();
    });

    it('(d) se createMediaStreamSource falhar no áudio da página, registra aviso e segue com ganho 1', async () => {
        const original = MockAudioContext.prototype.createMediaStreamSource;
        MockAudioContext.prototype.createMediaStreamSource = function (stream) {
            if (stream instanceof MockMediaStream && stream.getAudioTracks()[0] === audioTrack) throw new Error('boom');
            return original.call(this, stream);
        };
        try {
            await montar(vozBase());
            expect(screen.getByText(/Não foi possível captar o áudio do app: boom/)).toBeTruthy();
            expect(ctx().ganhos[0].gain.value).toBe(1);
            expect(MockMediaRecorder.instances).toHaveLength(1);
        } finally {
            MockAudioContext.prototype.createMediaStreamSource = original;
        }
    });
});
