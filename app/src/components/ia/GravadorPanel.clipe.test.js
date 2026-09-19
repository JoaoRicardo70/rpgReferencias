/**
 * Testes do modo clipe / atalho Alt+C do GravadorPanel.
 * Mocks de midia no mesmo estilo de GravadorPanel.mediaRecorder.test.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';

const mockStoreState = { meuNome: 'Tester' };
vi.mock('../../stores/useStore', () => ({
    default: vi.fn((selector) => selector(mockStoreState)),
}));

const mockMontarClipe = vi.fn();
vi.mock('../../core/clipes', async (importOriginal) => {
    const original = await importOriginal();
    return { ...original, montarClipe: (...a) => mockMontarClipe(...a) };
});

class MockMediaRecorder {
    constructor(stream, options) {
        this.stream = stream;
        this.options = options;
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
        this.start = vi.fn(() => { this.state = 'recording'; });
        this.requestData = vi.fn();
        MockMediaRecorder.instances.push(this);
    }
    stop() {
        this.state = 'inactive';
        if (this.onstop) this.onstop();
    }
}
MockMediaRecorder.instances = [];

class MockAudioContext {
    constructor() { this.state = 'running'; }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 128, getByteFrequencyData: vi.fn() }; }
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ kind: 'audio' }] } }; }
    resume() {}
    close() { this.state = 'closed'; }
}
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

let rafSpy;
const userAgentOriginal = navigator.userAgent;

function definirUserAgent(ua) {
    Object.defineProperty(global.navigator, 'userAgent', { value: ua, configurable: true });
}

function instalar(mediaDevices) {
    MockMediaRecorder.instances = [];
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    global.MediaRecorder = MockMediaRecorder;
    window.MediaRecorder = MockMediaRecorder;
    global.AudioContext = MockAudioContext;
    window.AudioContext = MockAudioContext;
    global.MediaStream = MockMediaStream;
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);
    Object.defineProperty(global.navigator, 'mediaDevices', {
        value: mediaDevices || { getUserMedia: vi.fn(() => Promise.resolve(criarStreamAudio('mic'))) },
        configurable: true,
    });
}

async function montar() {
    const { default: GravadorPanel } = await import('./GravadorPanel.jsx');
    await act(async () => { render(React.createElement(GravadorPanel)); });
}

async function clicar(texto) {
    await act(async () => {
        fireEvent.click(screen.getByText(texto));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function altC(init = {}) {
    await act(async () => {
        fireEvent.keyDown(window, { key: 'c', altKey: true, ...init });
        // requestData espera 150ms reais
        await new Promise(r => setTimeout(r, 200));
    });
}

describe('GravadorPanel: modo clipe', () => {
    beforeEach(() => {
        instalar();
        mockMontarClipe.mockReset();
        mockStoreState.meuNome = 'Tester';
    });
    afterEach(() => {
        cleanup();
        rafSpy.mockRestore();
        definirUserAgent(userAgentOriginal);
        vi.clearAllMocks();
    });

    it('ATIVAR MODO CLIPE inicia o recorder com start(1000)', async () => {
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(MockMediaRecorder.instances[0].start).toHaveBeenCalledWith(1000);
        expect(screen.getByText(/Modo clipe ativo/)).toBeTruthy();
    });

    it('INICIAR GRAVACAO tambem usa start(1000)', async () => {
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(MockMediaRecorder.instances[0].start).toHaveBeenCalledWith(1000);
    });

    it('SALVAR CLIPE fica desabilitado ate ativar', async () => {
        await montar();
        const botao = screen.getByText('✂️ SALVAR CLIPE');
        expect(botao.disabled).toBe(true);
        await clicar('🎞️ ATIVAR MODO CLIPE');
        expect(screen.getByText('✂️ SALVAR CLIPE').disabled).toBe(false);
    });

    it('no modo clipe o botao vira DESATIVAR e parar NAO baixa nada', async () => {
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        const rec = MockMediaRecorder.instances[0];
        await act(async () => { rec.ondataavailable({ data: new Blob(['x']) }); });
        expect(screen.getByText('⏹ DESATIVAR MODO CLIPE')).toBeTruthy();
        await clicar('⏹ DESATIVAR MODO CLIPE');
        expect(global.URL.createObjectURL).not.toHaveBeenCalled();
        expect(screen.getByText(/Modo clipe desativado/)).toBeTruthy();
        expect(screen.getByText('🎞️ ATIVAR MODO CLIPE')).toBeTruthy();
    });

    it('na gravacao completa, parar ainda baixa', async () => {
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        const rec = MockMediaRecorder.instances[0];
        await act(async () => { rec.ondataavailable({ data: new Blob(['audio']) }); });
        await clicar('⏹ ENCERRAR E BAIXAR');
        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/Gravação salva no seu computador/)).toBeTruthy();
    });

    it('Alt+C com gravador ativo salva o clipe e loga', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 5, semCabecalho: false });
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        await altC();
        expect(mockMontarClipe).toHaveBeenCalledTimes(1);
        expect(mockMontarClipe.mock.calls[0][2]).toBe(60);
        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/✂️ Clipe de ~5s/)).toBeTruthy();
        expect(MockMediaRecorder.instances[0].requestData).toHaveBeenCalled();
    });

    it('Alt+C maiusculo tambem funciona; Ctrl+Alt+C nao', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 5, semCabecalho: false });
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        await altC({ ctrlKey: true });
        expect(mockMontarClipe).not.toHaveBeenCalled();
        await altC({ key: 'C' });
        expect(mockMontarClipe).toHaveBeenCalledTimes(1);
    });

    it('semCabecalho adiciona aviso', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 5, semCabecalho: true });
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        await altC();
        expect(screen.getByText(/não foi possível ler o cabeçalho/i)).toBeTruthy();
    });

    it('montarClipe null loga aviso de imagem insuficiente e nao baixa', async () => {
        mockMontarClipe.mockResolvedValue(null);
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        await altC();
        expect(screen.getByText(/Ainda não há imagem suficiente/)).toBeTruthy();
        expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('montarClipe que lanca loga erro e permite nova tentativa', async () => {
        mockMontarClipe.mockRejectedValueOnce(new Error('boom'));
        mockMontarClipe.mockResolvedValueOnce({ blob: new Blob(['x']), segundosReais: 2, semCabecalho: false });
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        await altC();
        expect(screen.getByText(/Erro ao salvar o clipe: boom/)).toBeTruthy();
        await altC();
        expect(screen.getByText(/Clipe de ~2s/)).toBeTruthy();
    });

    it('Alt+C nao faz nada quando nao esta gravando', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 5, semCabecalho: false });
        await montar();
        await altC();
        expect(mockMontarClipe).not.toHaveBeenCalled();
        expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('Alt+C nao faz nada depois de desativar', async () => {
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        await clicar('⏹ DESATIVAR MODO CLIPE');
        await altC();
        expect(mockMontarClipe).not.toHaveBeenCalled();
    });

    it('select de duracao tem 30/60/120/300/600 (padrao 60) e a escolha chega em montarClipe', async () => {
        mockMontarClipe.mockResolvedValue(null);
        await montar();
        const select = screen.getByLabelText('Duração:');
        expect(Array.from(select.options).map(o => o.value)).toEqual(['30', '60', '120', '300', '600']);
        expect(select.value).toBe('60');
        fireEvent.change(select, { target: { value: '300' } });
        await clicar('🎞️ ATIVAR MODO CLIPE');
        await altC();
        expect(mockMontarClipe.mock.calls[0][2]).toBe(300);
    });

    it('botao SALVAR CLIPE aciona o clipe', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 7, semCabecalho: false });
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        await act(async () => {
            fireEvent.click(screen.getByText('✂️ SALVAR CLIPE'));
            await new Promise(r => setTimeout(r, 200));
        });
        expect(screen.getByText(/Clipe de ~7s/)).toBeTruthy();
    });

    it('cabecalho do primeiro chunk e passado ao montarClipe (integracao com extrairCabecalhoWebm)', async () => {
        mockMontarClipe.mockResolvedValue(null);
        await montar();
        await clicar('🎞️ ATIVAR MODO CLIPE');
        await act(async () => { MockMediaRecorder.instances[0].ondataavailable({ data: new Blob([new Uint8Array(50)]) }); });
        await altC();
        expect(mockMontarClipe.mock.calls[0][0]).toHaveLength(1);
        expect(mockMontarClipe.mock.calls[0][4]).toBe('audio/webm');
    });
});

describe('GravadorPanel: Electron com captura de tela recusada', () => {
    afterEach(() => {
        cleanup();
        rafSpy.mockRestore();
        definirUserAgent(userAgentOriginal);
        vi.clearAllMocks();
    });

    it('menciona o app desktop desatualizado', async () => {
        instalar({
            getUserMedia: vi.fn(() => Promise.resolve(criarStreamAudio('mic'))),
            getDisplayMedia: vi.fn(() => Promise.reject(new Error('NotSupportedError'))),
        });
        definirUserAgent('Mozilla/5.0 Electron/30.0.0 Chrome/124');
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(screen.getByText(/versão antiga/)).toBeTruthy();
        expect(MockMediaRecorder.instances[0].options.mimeType).toBe('audio/webm');
    });

    it('fora do Electron mostra mensagem generica', async () => {
        instalar({
            getUserMedia: vi.fn(() => Promise.resolve(criarStreamAudio('mic'))),
            getDisplayMedia: vi.fn(() => Promise.reject(new Error('NotAllowedError'))),
        });
        definirUserAgent('Mozilla/5.0 Chrome/124');
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(screen.getByText(/Captura de tela não autorizada/)).toBeTruthy();
        expect(screen.queryByText(/versão antiga/)).toBeNull();
    });
});
