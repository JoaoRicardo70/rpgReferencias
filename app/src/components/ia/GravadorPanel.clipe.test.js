/**
 * Testes do modo clipe / atalho Alt+C do GravadorPanel.
 * Mocks de midia no mesmo estilo de GravadorPanel.mediaRecorder.test.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { lerBufferLigado } from '../../core/estadoBuffer';
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
        localStorage.clear();
        instalar();
        mockMontarClipe.mockReset();
        mockStoreState.meuNome = 'Tester';
    });
    afterEach(() => {
        localStorage.clear();
        cleanup();
        rafSpy.mockRestore();
        definirUserAgent(userAgentOriginal);
        vi.clearAllMocks();
    });

    it('LIGAR BUFFER inicia o recorder com start(1000)', async () => {
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(MockMediaRecorder.instances[0].start).toHaveBeenCalledWith(1000);
        expect(screen.getByText(/Buffer ligado: guardando os últimos minutos/)).toBeTruthy();
    });

    it('INICIAR GRAVACAO tambem usa start(1000)', async () => {
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(MockMediaRecorder.instances[0].start).toHaveBeenCalledWith(1000);
    });

    it('SALVAR CLIPE AGORA fica desabilitado ate ligar', async () => {
        await montar();
        const botao = screen.getByText('✂️ SALVAR CLIPE AGORA');
        expect(botao.disabled).toBe(true);
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(screen.getByText('✂️ SALVAR CLIPE AGORA').disabled).toBe(false);
    });

    it('no modo clipe o botao vira DESLIGAR e parar NAO baixa nada', async () => {
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        const rec = MockMediaRecorder.instances[0];
        await act(async () => { rec.ondataavailable({ data: new Blob(['x']) }); });
        expect(screen.getByText('⏹ DESLIGAR BUFFER')).toBeTruthy();
        await clicar('⏹ DESLIGAR BUFFER');
        expect(global.URL.createObjectURL).not.toHaveBeenCalled();
        expect(screen.getByText(/Buffer de clipes desligado/)).toBeTruthy();
        expect(screen.getByText('🎞️ LIGAR BUFFER DE CLIPES')).toBeTruthy();
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
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
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
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await altC({ ctrlKey: true });
        expect(mockMontarClipe).not.toHaveBeenCalled();
        await altC({ key: 'C' });
        expect(mockMontarClipe).toHaveBeenCalledTimes(1);
    });

    it('semCabecalho adiciona aviso', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 5, semCabecalho: true });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await altC();
        expect(screen.getByText(/não foi possível ler o cabeçalho/i)).toBeTruthy();
    });

    it('montarClipe null loga aviso de imagem insuficiente e nao baixa', async () => {
        mockMontarClipe.mockResolvedValue(null);
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await altC();
        expect(screen.getByText(/Ainda não há imagem suficiente/)).toBeTruthy();
        expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('montarClipe que lanca loga erro e permite nova tentativa', async () => {
        mockMontarClipe.mockRejectedValueOnce(new Error('boom'));
        mockMontarClipe.mockResolvedValueOnce({ blob: new Blob(['x']), segundosReais: 2, semCabecalho: false });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
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
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await clicar('⏹ DESLIGAR BUFFER');
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
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await altC();
        expect(mockMontarClipe.mock.calls[0][2]).toBe(300);
    });

    it('botao SALVAR CLIPE AGORA aciona o clipe', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 7, semCabecalho: false });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await act(async () => {
            fireEvent.click(screen.getByText('✂️ SALVAR CLIPE AGORA'));
            await new Promise(r => setTimeout(r, 200));
        });
        expect(screen.getByText(/Clipe de ~7s/)).toBeTruthy();
    });

    it('cabecalho do primeiro chunk e passado ao montarClipe (integracao com extrairCabecalhoWebm)', async () => {
        mockMontarClipe.mockResolvedValue(null);
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await act(async () => { MockMediaRecorder.instances[0].ondataavailable({ data: new Blob([new Uint8Array(50)]) }); });
        await altC();
        expect(mockMontarClipe.mock.calls[0][0]).toHaveLength(1);
        expect(mockMontarClipe.mock.calls[0][4]).toBe('audio/webm');
    });
});

describe('GravadorPanel: buffer + gravacao da sessao, preferencias e auto-inicio', () => {
    beforeEach(() => {
        localStorage.clear();
        mockMontarClipe.mockReset();
        mockStoreState.meuNome = 'Tester';
    });
    afterEach(() => {
        vi.useRealTimers();
        localStorage.clear();
        cleanup();
        rafSpy.mockRestore();
        definirUserAgent(userAgentOriginal);
        vi.clearAllMocks();
    });

    function midia() {
        return {
            getUserMedia: vi.fn(() => Promise.resolve(criarStreamAudio('mic'))),
            getDisplayMedia: vi.fn(() => Promise.resolve({
                id: 'tela',
                getTracks: () => [],
                getVideoTracks: () => [{ kind: 'video', stop: vi.fn(), getSettings: () => ({ displaySurface: 'browser' }) }],
                getAudioTracks: () => [],
            })),
        };
    }

    it('(1) INICIAR GRAVACAO com buffer ligado cria um segundo recorder e o buffer continua', async () => {
        instalar(midia());
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(MockMediaRecorder.instances).toHaveLength(1);
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(MockMediaRecorder.instances).toHaveLength(2);
        const [buffer, sessao] = MockMediaRecorder.instances;
        expect(sessao.stream).toBe(buffer.stream);
        expect(sessao.start).toHaveBeenCalledWith(1000);
        expect(buffer.state).toBe('recording');
        expect(screen.getByText('⏹ ENCERRAR E BAIXAR')).toBeTruthy();
        expect(screen.getByText('⏹ DESLIGAR BUFFER').disabled).toBe(true);
    });

    it('(1) ENCERRAR E BAIXAR para so o segundo recorder, baixa seus chunks e mantem o buffer', async () => {
        instalar(midia());
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await clicar('▶ INICIAR GRAVAÇÃO');
        const [buffer, sessao] = MockMediaRecorder.instances;
        await act(async () => {
            buffer.ondataavailable({ data: new Blob(['buf']) });
            sessao.ondataavailable({ data: new Blob(['sessao']) });
        });
        await clicar('⏹ ENCERRAR E BAIXAR');
        expect(sessao.state).toBe('inactive');
        expect(buffer.state).toBe('recording');
        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(global.URL.createObjectURL.mock.calls[0][0].size).toBe('sessao'.length);
        expect(screen.getByText(/💾 Gravação salva/)).toBeTruthy();
        expect(screen.getByText(/● Buffer ligado/)).toBeTruthy();
        expect(screen.getByText('▶ INICIAR GRAVAÇÃO')).toBeTruthy();
        expect(screen.getByText('⏹ DESLIGAR BUFFER').disabled).toBe(false);
        expect(screen.getByText('✂️ SALVAR CLIPE AGORA').disabled).toBe(false);
    });

    it('(1) com a sessao extra ativa nao existe botao INICIAR (sem terceiro recorder)', async () => {
        instalar(midia());
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(screen.queryByText('▶ INICIAR GRAVAÇÃO')).toBeNull();
        expect(MockMediaRecorder.instances).toHaveLength(2);
    });

    it('(2) ligar/desligar na mao NAO altera a preferencia rpg_clipe_buffer_auto', async () => {
        instalar(midia());
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(localStorage.getItem('rpg_clipe_buffer_auto')).toBeNull();
        expect(screen.getByLabelText(/Ligar o buffer sozinho/).checked).toBe(false);
        await clicar('⏹ DESLIGAR BUFFER');
        expect(localStorage.getItem('rpg_clipe_buffer_auto')).toBeNull();
        expect(screen.getByText('○ Buffer desligado')).toBeTruthy();
    });

    it('(2) pref 1 salva permanece 1 apos ligar/desligar na mao', async () => {
        instalar(midia());
        localStorage.setItem('rpg_clipe_buffer_auto', '1');
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await clicar('⏹ DESLIGAR BUFFER');
        expect(localStorage.getItem('rpg_clipe_buffer_auto')).toBe('1');
        expect(screen.getByLabelText(/Ligar o buffer sozinho/).checked).toBe(true);
    });

    function tentarSair() {
        const ev = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(ev);
        return ev.defaultPrevented;
    }

    it('beforeunload NAO e bloqueado com so o buffer ligado', async () => {
        instalar(midia());
        await montar();
        expect(tentarSair()).toBe(false);
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(tentarSair()).toBe(false);
    });

    it('beforeunload e bloqueado durante a sessao (iniciada do zero) e liberado apos encerrar', async () => {
        instalar(midia());
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(tentarSair()).toBe(true);
        await clicar('⏹ ENCERRAR E BAIXAR');
        expect(tentarSair()).toBe(false);
    });

    it('beforeunload e bloqueado com a sessao extra sobre o buffer e liberado ao encerra-la', async () => {
        instalar(midia());
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(tentarSair()).toBe(true);
        await clicar('⏹ ENCERRAR E BAIXAR');
        expect(tentarSair()).toBe(false);
    });

    it('auto-inicio silencioso (buffer) nao bloqueia o fechamento do app', async () => {
        instalar(midia());
        definirUserAgent('Mozilla/5.0 Electron/30.0.0');
        localStorage.setItem('rpg_clipe_buffer_auto', '1');
        vi.useFakeTimers();
        await montar();
        await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(tentarSair()).toBe(false);
    });

    it('falha ao criar o segundo MediaRecorder loga erro, nao lanca e o buffer continua', async () => {
        instalar(midia());
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        const buffer = MockMediaRecorder.instances[0];
        class Quebrado { constructor() { throw new Error('sem recorder'); } }
        global.MediaRecorder = Quebrado;
        window.MediaRecorder = Quebrado;
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(screen.getByText(/❌ Erro ao iniciar a gravação da sessão: sem recorder/)).toBeTruthy();
        expect(buffer.state).toBe('recording');
        expect(screen.getByText('▶ INICIAR GRAVAÇÃO')).toBeTruthy();
        expect(screen.getByText('⏹ DESLIGAR BUFFER').disabled).toBe(false);
        expect(tentarSair()).toBe(false);
    });

    it('estadoBuffer global reflete o gravador ligado/desligado e limpa ao desmontar', async () => {
        instalar(midia());
        await montar();
        expect(lerBufferLigado()).toBe(false);
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(lerBufferLigado()).toBe(true);
        await clicar('⏹ DESLIGAR BUFFER');
        expect(lerBufferLigado()).toBe(false);
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(lerBufferLigado()).toBe(true);
        cleanup();
        expect(lerBufferLigado()).toBe(false);
    });

    it('(2) checkbox persiste a preferencia e reflete o valor salvo', async () => {
        instalar(midia());
        localStorage.setItem('rpg_clipe_buffer_auto', '1');
        await montar();
        const cb = screen.getByLabelText(/Ligar o buffer sozinho/);
        expect(cb.checked).toBe(true);
        fireEvent.click(cb);
        expect(localStorage.getItem('rpg_clipe_buffer_auto')).toBe('0');
        fireEvent.click(cb);
        expect(localStorage.getItem('rpg_clipe_buffer_auto')).toBe('1');
    });

    it('duracao do select persiste em rpg_clipe_duracao e e restaurada', async () => {
        instalar(midia());
        await montar();
        fireEvent.change(screen.getByLabelText('Duração:'), { target: { value: '120' } });
        expect(localStorage.getItem('rpg_clipe_duracao')).toBe('120');
        cleanup();
        await montar();
        expect(screen.getByLabelText('Duração:').value).toBe('120');
    });

    it('duracao salva invalida cai para 60', async () => {
        instalar(midia());
        localStorage.setItem('rpg_clipe_duracao', '77');
        await montar();
        expect(screen.getByLabelText('Duração:').value).toBe('60');
    });

    it('(3)(4) Electron + pref 1 liga o buffer em ~2500ms sem getUserMedia', async () => {
        const md = midia();
        instalar(md);
        definirUserAgent('Mozilla/5.0 Electron/30.0.0 Chrome/124');
        localStorage.setItem('rpg_clipe_buffer_auto', '1');
        vi.useFakeTimers();
        await montar();
        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
        expect(md.getDisplayMedia).not.toHaveBeenCalled();
        await act(async () => { await vi.advanceTimersByTimeAsync(700); });
        expect(md.getDisplayMedia).toHaveBeenCalledTimes(1);
        expect(md.getUserMedia).not.toHaveBeenCalled();
        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(MockMediaRecorder.instances[0].start).toHaveBeenCalledWith(1000);
        expect(screen.getByText(/● Buffer ligado/)).toBeTruthy();
        expect(screen.queryByText(/gravando só o seu microfone/)).toBeNull();
    });

    it('(3) UA nao-Electron com pref 1 nao inicia sozinho', async () => {
        const md = midia();
        instalar(md);
        definirUserAgent('Mozilla/5.0 Chrome/124');
        localStorage.setItem('rpg_clipe_buffer_auto', '1');
        vi.useFakeTimers();
        await montar();
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(md.getDisplayMedia).not.toHaveBeenCalled();
        expect(MockMediaRecorder.instances).toHaveLength(0);
        expect(screen.getByText('○ Buffer desligado')).toBeTruthy();
    });

    it.each([['0'], [null]])('(3) Electron com pref %s nao inicia sozinho', async (pref) => {
        const md = midia();
        instalar(md);
        definirUserAgent('Mozilla/5.0 Electron/30.0.0');
        if (pref !== null) localStorage.setItem('rpg_clipe_buffer_auto', pref);
        vi.useFakeTimers();
        await montar();
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(md.getDisplayMedia).not.toHaveBeenCalled();
        expect(MockMediaRecorder.instances).toHaveLength(0);
    });

    it('(3) desmontar antes dos 2500ms cancela o auto-inicio', async () => {
        const md = midia();
        instalar(md);
        definirUserAgent('Mozilla/5.0 Electron/30.0.0');
        localStorage.setItem('rpg_clipe_buffer_auto', '1');
        vi.useFakeTimers();
        await montar();
        cleanup();
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(md.getDisplayMedia).not.toHaveBeenCalled();
    });

    it('(4) clique manual fora da call ainda pede o proprio microfone', async () => {
        const md = midia();
        instalar(md);
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(md.getUserMedia).toHaveBeenCalledTimes(1);
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
