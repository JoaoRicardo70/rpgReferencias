/**
 * Banner "sem captura de tela" e extensao dos arquivos de clipe (mp4/webm) do GravadorPanel.
 * Mocks de midia no mesmo estilo de GravadorPanel.clipe.test.js (montarClipe mockado).
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
let spyCriar;
let downloads;

function instalar({ comTela, tipos }) {
    MockMediaRecorder.instances = [];
    if (tipos) MockMediaRecorder.isTypeSupported = (t) => tipos.includes(t);
    else delete MockMediaRecorder.isTypeSupported;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    global.MediaRecorder = MockMediaRecorder;
    window.MediaRecorder = MockMediaRecorder;
    global.AudioContext = MockAudioContext;
    window.AudioContext = MockAudioContext;
    global.MediaStream = MockMediaStream;
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);

    const telaTrack = { kind: 'video', stop: vi.fn(), getSettings: () => ({ displaySurface: 'browser' }) };
    const mediaDevices = { getUserMedia: vi.fn(() => Promise.resolve(criarStreamAudio('mic'))) };
    if (comTela) {
        mediaDevices.getDisplayMedia = vi.fn(() => Promise.resolve({
            id: 'tela', getTracks: () => [telaTrack], getVideoTracks: () => [telaTrack], getAudioTracks: () => [],
        }));
    }
    Object.defineProperty(global.navigator, 'mediaDevices', { value: mediaDevices, configurable: true });

    // Captura o nome de cada arquivo baixado sem o jsdom tentar navegar.
    downloads = [];
    const original = document.createElement.bind(document);
    spyCriar = vi.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
        const el = original(tag, ...rest);
        if (tag === 'a') el.click = vi.fn(() => { downloads.push(el.download); });
        return el;
    });
    return { telaTrack };
}

async function montar() {
    const { default: GravadorPanel } = await import('./GravadorPanel.jsx');
    await act(async () => { render(React.createElement(GravadorPanel)); });
}

async function clicar(texto) {
    await act(async () => {
        fireEvent.click(screen.getByText(texto));
        for (let i = 0; i < 6; i++) await Promise.resolve();
    });
}

async function salvarClipe() {
    await act(async () => {
        fireEvent.click(screen.getByText('✂️ SALVAR CLIPE AGORA'));
        await new Promise(r => setTimeout(r, 200)); // requestData espera 150ms reais
    });
}

const MP4 = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';

describe('GravadorPanel: aviso "Sem captura de tela"', () => {
    beforeEach(() => { mockMontarClipe.mockReset(); mockStoreState.meuNome = 'Tester'; localStorage.clear(); });
    afterEach(() => {
        cleanup();
        rafSpy.mockRestore();
        spyCriar.mockRestore();
        vi.clearAllMocks();
        delete MockMediaRecorder.isTypeSupported;
    });

    it('nao aparece antes de gravar', async () => {
        instalar({ comTela: false });
        await montar();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(document.querySelector('.gravador-aviso')).toBeNull();
    });

    it('aparece (role=alert, classe .gravador-aviso) ao gravar sem getDisplayMedia', async () => {
        instalar({ comTela: false });
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        const aviso = screen.getByRole('alert');
        expect(aviso.classList.contains('gravador-aviso')).toBe(true);
        expect(aviso.textContent.trim().startsWith('⚠️ Sem captura de tela')).toBe(true);
        expect(aviso.textContent).toMatch(/só áudio/);
    });

    it('aparece tambem no modo buffer de clipes sem captura de tela', async () => {
        instalar({ comTela: false });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('aparece quando a captura de tela e recusada', async () => {
        instalar({ comTela: true });
        navigator.mediaDevices.getDisplayMedia = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('aparece quando o navegador nao grava video nem mp4 nem webm (tela e liberada)', async () => {
        const { telaTrack } = instalar({ comTela: true, tipos: [] });
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(telaTrack.stop).toHaveBeenCalled();
    });

    it('fica oculto quando a tela e capturada (mp4)', async () => {
        instalar({ comTela: true, tipos: [MP4, 'video/webm'] });
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(MockMediaRecorder.instances[0].stream.getVideoTracks()).toHaveLength(1);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('fica oculto quando a tela e capturada (webm)', async () => {
        instalar({ comTela: true });
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('some depois de parar a gravacao', async () => {
        instalar({ comTela: false });
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(screen.getByRole('alert')).toBeTruthy();
        await act(async () => {
            MockMediaRecorder.instances[0].ondataavailable({ data: new Blob(['x']) });
        });
        await clicar('⏹ ENCERRAR E BAIXAR');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('some depois de desligar o buffer', async () => {
        instalar({ comTela: false });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(screen.getByRole('alert')).toBeTruthy();
        await clicar('⏹ DESLIGAR BUFFER');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('nao reaparece numa segunda gravacao com tela apos uma sem tela', async () => {
        instalar({ comTela: false });
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        await clicar('⏹ ENCERRAR E BAIXAR');
        const telaTrack = { kind: 'video', stop: vi.fn(), getSettings: () => ({ displaySurface: 'browser' }) };
        navigator.mediaDevices.getDisplayMedia = vi.fn(() => Promise.resolve({
            getTracks: () => [telaTrack], getVideoTracks: () => [telaTrack],
        }));
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(MockMediaRecorder.instances).toHaveLength(2);
        expect(screen.queryByRole('alert')).toBeNull();
    });
});

describe('GravadorPanel: extensao dos arquivos de clipe e de gravacao', () => {
    beforeEach(() => { mockMontarClipe.mockReset(); mockStoreState.meuNome = 'Tester'; localStorage.clear(); });
    afterEach(() => {
        cleanup();
        rafSpy.mockRestore();
        spyCriar.mockRestore();
        vi.clearAllMocks();
        delete MockMediaRecorder.isTypeSupported;
    });

    const REGEX_CLIPE = (ext) => new RegExp(`^clipe_Tester_60s_\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}\\.${ext}$`);

    it('clipe termina em .mp4 quando o gravador escolheu mp4, e montarClipe recebe o tipo sem codecs', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 5, semCabecalho: false });
        instalar({ comTela: true, tipos: [MP4, 'video/webm'] });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        expect(MockMediaRecorder.instances[0].options.mimeType).toBe(MP4);
        await salvarClipe();
        expect(mockMontarClipe).toHaveBeenCalledTimes(1);
        expect(mockMontarClipe.mock.calls[0][4]).toBe('video/mp4');
        expect(downloads).toHaveLength(1);
        expect(downloads[0]).toMatch(REGEX_CLIPE('mp4'));
        expect(screen.getByText(/salvo no seu computador como "clipe_Tester_60s_.*\.mp4"/)).toBeTruthy();
    });

    it('clipe termina em .webm quando so webm e suportado', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 5, semCabecalho: false });
        instalar({ comTela: true, tipos: ['video/webm'] });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await salvarClipe();
        expect(mockMontarClipe.mock.calls[0][4]).toBe('video/webm');
        expect(downloads[0]).toMatch(REGEX_CLIPE('webm'));
    });

    it('clipe termina em .webm quando o construtor recusa mp4 e cai para webm', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 5, semCabecalho: false });
        instalar({ comTela: true, tipos: [MP4, 'video/webm'] });
        const Seletivo = class extends MockMediaRecorder {
            constructor(stream, options) {
                if (/mp4/.test(options.mimeType)) throw new Error('sem h264');
                super(stream, options);
            }
        };
        Seletivo.isTypeSupported = MockMediaRecorder.isTypeSupported;
        global.MediaRecorder = Seletivo;
        window.MediaRecorder = Seletivo;
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await salvarClipe();
        expect(downloads[0]).toMatch(REGEX_CLIPE('webm'));
    });

    it('somente audio com audio/mp4: clipe sai como .m4a (tipo audio/mp4)', async () => {
        mockMontarClipe.mockResolvedValue({ blob: new Blob(['x']), segundosReais: 5, semCabecalho: false });
        instalar({ comTela: false, tipos: ['audio/mp4;codecs=mp4a.40.2'] });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await salvarClipe();
        expect(mockMontarClipe.mock.calls[0][4]).toBe('audio/mp4');
        expect(downloads[0]).toMatch(REGEX_CLIPE('m4a'));
    });

    it('gravacao da sessao em mp4: nome gravacao_<nome>_<carimbo>.mp4 e Blob sem lista de codecs', async () => {
        instalar({ comTela: true, tipos: [MP4, 'video/webm'] });
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        await act(async () => { MockMediaRecorder.instances[0].ondataavailable({ data: new Blob(['x']) }); });
        await clicar('⏹ ENCERRAR E BAIXAR');
        expect(downloads).toHaveLength(1);
        expect(downloads[0]).toMatch(/^gravacao_Tester_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.mp4$/);
        expect(global.URL.createObjectURL.mock.calls[0][0].type).toBe('video/mp4');
    });

    it('gravacao somente audio ganha o sufixo _somente-audio antes da extensao', async () => {
        instalar({ comTela: false });
        await montar();
        await clicar('▶ INICIAR GRAVAÇÃO');
        await act(async () => { MockMediaRecorder.instances[0].ondataavailable({ data: new Blob(['x']) }); });
        await clicar('⏹ ENCERRAR E BAIXAR');
        expect(downloads[0]).toMatch(/^gravacao_Tester_.*_somente-audio\.webm$/);
    });

    it('sessao extra (buffer ja ligado) reaproveita o formato e a extensao do buffer (mp4)', async () => {
        instalar({ comTela: true, tipos: [MP4, 'video/webm'] });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await clicar('▶ INICIAR GRAVAÇÃO');
        expect(MockMediaRecorder.instances).toHaveLength(2);
        expect(MockMediaRecorder.instances[1].options.mimeType).toBe(MP4);
        await act(async () => { MockMediaRecorder.instances[1].ondataavailable({ data: new Blob(['x']) }); });
        await clicar('⏹ ENCERRAR E BAIXAR');
        expect(downloads[0]).toMatch(/^gravacao_Tester_.*\.mp4$/);
    });

    it('desligar o buffer libera o pipeline de video sem lancar (jsdom sem captureStream: pipeline nulo)', async () => {
        instalar({ comTela: true, tipos: [MP4] });
        await montar();
        await clicar('🎞️ LIGAR BUFFER DE CLIPES');
        await clicar('⏹ DESLIGAR BUFFER');
        expect(screen.getByText('🎞️ LIGAR BUFFER DE CLIPES')).toBeTruthy();
    });
});
