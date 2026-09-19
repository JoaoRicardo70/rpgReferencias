/**
 * Tests for GravadorPanel.jsx — gravador local da sessão.
 *
 * O painel grava a tela do próprio app (getDisplayMedia, aba atual) e mixa num único
 * áudio o microfone + as vozes de todos os jogadores conectados na Sala de Rádio da
 * Party (VoiceContext). Ao encerrar, baixa o arquivo direto no computador de quem
 * gravou — nada vai para a nuvem (a transcrição na nuvem foi removida por exigir plano
 * pago do Firebase).
 *
 * Sem captura de tela (negada/indisponível) o gravador cai para somente áudio, com
 * `audioBitsPerSecond: 32000` explícito (Chrome usa 128kbps por padrão, o que gera
 * downloads desnecessariamente grandes para voz).
 *
 * getUserMedia, getDisplayMedia, MediaRecorder, MediaStream e AudioContext são mockados.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';
import { VoiceContext } from '../../hooks/VoiceContext';

const mockStoreState = { meuNome: 'Tester' };

vi.mock('../../stores/useStore', () => ({
    default: vi.fn((selector) => selector(mockStoreState)),
}));

// ---------------------------------------------------------------------------
// Browser media API mocks
// ---------------------------------------------------------------------------

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
        MockAudioContext.instances.push(this);
    }
    createAnalyser() {
        return { fftSize: 0, frequencyBinCount: 128, getByteFrequencyData: vi.fn() };
    }
    createMediaStreamSource(stream) {
        const fonte = { stream, connect: vi.fn(), disconnect: vi.fn() };
        this.fontes.push(fonte);
        return fonte;
    }
    createMediaStreamDestination() {
        return { stream: { getAudioTracks: () => [{ kind: 'audio' }] } };
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

function criarStreamAudio(id, trilhas) {
    const tracks = trilhas || [{ kind: 'audio', stop: vi.fn() }];
    return { id, getTracks: () => tracks, getAudioTracks: () => tracks };
}

function instalarMocksDeMidia() {
    MockMediaRecorder.instances = [];
    MockAudioContext.instances = [];

    // jsdom does not implement scrollIntoView (used by the logs auto-scroll effect)
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    global.MediaRecorder = MockMediaRecorder;
    window.MediaRecorder = MockMediaRecorder;
    global.AudioContext = MockAudioContext;
    window.AudioContext = MockAudioContext;
    global.MediaStream = MockMediaStream;

    // jsdom does not implement URL.createObjectURL/revokeObjectURL (used to trigger the local download)
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
}

// ---------------------------------------------------------------------------
// Modo somente áudio (sem captura de tela disponível)
// ---------------------------------------------------------------------------

describe('GravadorPanel — MediaRecorder audioBitsPerSecond (somente áudio)', () => {
    let getUserMediaMock;
    let rafSpy;

    beforeEach(() => {
        instalarMocksDeMidia();
        // Prevent the visualizer's recursive requestAnimationFrame loop from running in jsdom
        rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);

        getUserMediaMock = vi.fn(() => Promise.resolve(criarStreamAudio('mic')));
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: { getUserMedia: getUserMediaMock },
            configurable: true,
        });
    });

    afterEach(() => {
        cleanup();
        rafSpy.mockRestore();
        vi.clearAllMocks();
    });

    it('calls MediaRecorder with mimeType "audio/webm" and audioBitsPerSecond 32000 on session start', async () => {
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');

        await act(async () => {
            render(React.createElement(GravadorPanel));
        });

        await act(async () => {
            fireEvent.click(screen.getByText('▶ INICIAR GRAVAÇÃO'));
            // flush the async getUserMedia chain inside iniciarGravacao
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(getUserMediaMock).toHaveBeenCalled();
        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(MockMediaRecorder.instances[0].options).toMatchObject({
            mimeType: 'audio/webm',
            audioBitsPerSecond: 32000,
        });
    });

    it('triggers a local download (no network upload) when the recording stops', async () => {
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');

        await act(async () => {
            render(React.createElement(GravadorPanel));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('▶ INICIAR GRAVAÇÃO'));
            await Promise.resolve();
            await Promise.resolve();
        });

        const recorderInstance = MockMediaRecorder.instances[0];

        await act(async () => {
            recorderInstance.ondataavailable({ data: new Blob(['audio data'], { type: 'audio/webm' }) });
            fireEvent.click(screen.getByText('⏹ ENCERRAR E BAIXAR'));
        });

        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
        expect(screen.getByText(/Gravação salva no seu computador/)).toBeTruthy();
    });
});

describe('GravadorPanel — edge cases', () => {
    let rafSpy;
    let fakeTracks;

    beforeEach(() => {
        instalarMocksDeMidia();
        mockStoreState.meuNome = 'Tester';

        rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);

        fakeTracks = [{ kind: 'audio', stop: vi.fn() }, { kind: 'audio', stop: vi.fn() }];
        const fakeStream = criarStreamAudio('mic', fakeTracks);
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: { getUserMedia: vi.fn(() => Promise.resolve(fakeStream)) },
            configurable: true,
        });
    });

    afterEach(() => {
        cleanup();
        rafSpy.mockRestore();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    async function montarEIniciar() {
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');
        await act(async () => {
            render(React.createElement(GravadorPanel));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('▶ INICIAR GRAVAÇÃO'));
            await Promise.resolve();
            await Promise.resolve();
        });
        return MockMediaRecorder.instances[0];
    }

    it('builds the downloaded filename from a sanitized meuNome (no /, spaces, or other unsafe chars)', async () => {
        mockStoreState.meuNome = 'João Ricardo #1';

        let capturedDownload = null;
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName, ...rest) => {
            const el = originalCreateElement(tagName, ...rest);
            if (tagName === 'a') {
                // Intercept click instead of letting jsdom attempt a real navigation to the blob: URL.
                el.click = vi.fn(() => { capturedDownload = el.download; });
            }
            return el;
        });

        const recorderInstance = await montarEIniciar();

        await act(async () => {
            recorderInstance.ondataavailable({ data: new Blob(['audio data'], { type: 'audio/webm' }) });
            fireEvent.click(screen.getByText('⏹ ENCERRAR E BAIXAR'));
        });

        const nomeEsperado = 'Jo_o_Ricardo_1'; // sanitizarNomeArquivo: runs of non [a-zA-Z0-9_-] chars -> single "_"

        expect(capturedDownload).not.toBeNull();
        expect(capturedDownload).toMatch(
            new RegExp(`^gravacao_${nomeEsperado}_\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}\\.webm$`)
        );
        expect(capturedDownload).not.toMatch(/[/\s#]/);
    });

    it('does NOT call URL.createObjectURL and warns "Nada foi capturado" when no chunks were recorded', async () => {
        await montarEIniciar();

        // Stop immediately, without ondataavailable ever firing.
        await act(async () => {
            fireEvent.click(screen.getByText('⏹ ENCERRAR E BAIXAR'));
        });

        expect(global.URL.createObjectURL).not.toHaveBeenCalled();
        expect(screen.getByText(/Nada foi capturado/)).toBeTruthy();
    });

    it('stops every microphone track exactly once when recording is stopped', async () => {
        const recorderInstance = await montarEIniciar();

        await act(async () => {
            recorderInstance.ondataavailable({ data: new Blob(['audio data'], { type: 'audio/webm' }) });
            fireEvent.click(screen.getByText('⏹ ENCERRAR E BAIXAR'));
        });

        expect(fakeTracks).toHaveLength(2);
        fakeTracks.forEach((track) => {
            expect(track.stop).toHaveBeenCalledTimes(1);
        });
    });

    it('warns before leaving the tab while a recording is in progress (beforeunload)', async () => {
        await montarEIniciar();

        const event = new Event('beforeunload', { cancelable: true });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
        window.dispatchEvent(event);

        expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('does NOT warn before leaving the tab when no recording is in progress', async () => {
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');
        await act(async () => {
            render(React.createElement(GravadorPanel));
        });
        // Never clicked "INICIAR GRAVAÇÃO" — gravando stays false.

        const event = new Event('beforeunload', { cancelable: true });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
        window.dispatchEvent(event);

        expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('stops the microphone tracks when the panel is unmounted mid-recording', async () => {
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');
        let unmount;
        await act(async () => {
            ({ unmount } = render(React.createElement(GravadorPanel)));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('▶ INICIAR GRAVAÇÃO'));
            await Promise.resolve();
            await Promise.resolve();
        });

        await act(async () => { unmount(); });

        expect(fakeTracks).toHaveLength(2);
        fakeTracks.forEach((track) => {
            expect(track.stop).toHaveBeenCalledTimes(1);
        });
    });
});

// ---------------------------------------------------------------------------
// Tela do app + vozes da Sala de Rádio
// ---------------------------------------------------------------------------

describe('GravadorPanel — tela do app e vozes da Sala de Rádio', () => {
    let rafSpy;
    let getDisplayMediaMock;
    let getUserMediaMock;
    let telaTrack;

    beforeEach(() => {
        instalarMocksDeMidia();
        rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);

        telaTrack = { kind: 'video', stop: vi.fn(), getSettings: () => ({ displaySurface: 'browser' }) };
        getDisplayMediaMock = vi.fn(() => Promise.resolve({
            getTracks: () => [telaTrack],
            getVideoTracks: () => [telaTrack],
        }));
        getUserMediaMock = vi.fn(() => Promise.resolve(criarStreamAudio('micProprio')));
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: { getUserMedia: getUserMediaMock, getDisplayMedia: getDisplayMediaMock },
            configurable: true,
        });
    });

    afterEach(() => {
        cleanup();
        rafSpy.mockRestore();
        vi.clearAllMocks();
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
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
        return utils;
    }

    it('captures the current tab (video, no system audio) and records video/webm', async () => {
        await montar(null);

        expect(getDisplayMediaMock).toHaveBeenCalledWith(
            expect.objectContaining({ audio: false, preferCurrentTab: true })
        );
        const recorder = MockMediaRecorder.instances[0];
        expect(recorder.options).toMatchObject({ mimeType: 'video/webm' });
        expect(recorder.stream.getVideoTracks()).toHaveLength(1);
        expect(recorder.stream.getAudioTracks()).toHaveLength(1);
    });

    it('falls back to audio-only when screen capture is denied', async () => {
        getDisplayMediaMock.mockImplementation(() => Promise.reject(new Error('denied')));
        await montar(null);

        expect(MockMediaRecorder.instances[0].options).toMatchObject({
            mimeType: 'audio/webm',
            audioBitsPerSecond: 32000,
        });
        expect(screen.getByText(/gravando somente o áudio/)).toBeTruthy();
    });

    it('mixes the Sala de Rádio mic and every connected player into the recording', async () => {
        const voz = {
            meuStream: criarStreamAudio('meuMicRadio'),
            conexoes: [
                { id: 'anime-rpg-natsu', stream: criarStreamAudio('s1') },
                { id: 'anime-rpg-eliza', stream: criarStreamAudio('s2') },
            ],
        };
        await montar(voz);

        const capturados = MockAudioContext.instances[0].fontes.map(f => f.stream.id);
        expect(capturados).toEqual(expect.arrayContaining(['meuMicRadio', 's1', 's2']));
        expect(screen.getByText(/Captando voz: natsu/)).toBeTruthy();
        // Já está na Sala de Rádio: não abre um segundo microfone por conta própria.
        expect(getUserMediaMock).not.toHaveBeenCalled();
    });

    it('starts recording a player who joins the call mid-recording', async () => {
        const voz = { meuStream: criarStreamAudio('meuMicRadio'), conexoes: [] };
        const { rerender } = await montar(voz);
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');

        await act(async () => {
            rerender(
                React.createElement(
                    VoiceContext.Provider,
                    { value: { ...voz, conexoes: [{ id: 'anime-rpg-tardio', stream: criarStreamAudio('s9') }] } },
                    React.createElement(GravadorPanel)
                )
            );
        });

        expect(MockAudioContext.instances[0].fontes.map(f => f.stream.id)).toContain('s9');
    });

    it('never stops the Sala de Rádio mic stream when the recording ends', async () => {
        const trilhaRadio = { kind: 'audio', stop: vi.fn() };
        const voz = { meuStream: criarStreamAudio('meuMicRadio', [trilhaRadio]), conexoes: [] };
        await montar(voz);

        await act(async () => { fireEvent.click(screen.getByText('⏹ ENCERRAR E BAIXAR')); });

        expect(trilhaRadio.stop).not.toHaveBeenCalled();
        expect(telaTrack.stop).toHaveBeenCalled();
    });

    it('ignores a second click on "INICIAR" while the screen-share picker is still open', async () => {
        let liberarPicker;
        getDisplayMediaMock.mockImplementation(() => new Promise(resolve => { liberarPicker = resolve; }));
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');
        await act(async () => { render(React.createElement(GravadorPanel)); });

        const botao = screen.getByText('▶ INICIAR GRAVAÇÃO');
        await act(async () => { fireEvent.click(botao); fireEvent.click(botao); });
        expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            liberarPicker({ getTracks: () => [telaTrack], getVideoTracks: () => [telaTrack] });
            await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        });
        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(MockAudioContext.instances.filter(c => c.state !== 'closed').length).toBeLessThanOrEqual(2);
    });

    it('disconnects a player who leaves the call mid-recording', async () => {
        const voz = {
            meuStream: criarStreamAudio('meuMicRadio'),
            conexoes: [{ id: 'anime-rpg-saiu', stream: criarStreamAudio('s5') }],
        };
        const { rerender } = await montar(voz);
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');
        const fonteSaiu = MockAudioContext.instances[0].fontes.find(f => f.stream.id === 's5');

        await act(async () => {
            rerender(
                React.createElement(VoiceContext.Provider, { value: { ...voz, conexoes: [] } }, React.createElement(GravadorPanel))
            );
        });

        expect(fonteSaiu.disconnect).toHaveBeenCalled();
    });

    it('releases the screen capture when the microphone request fails', async () => {
        getUserMediaMock.mockImplementation(() => Promise.reject(new Error('mic negado')));
        await montar(null);

        expect(telaTrack.stop).toHaveBeenCalled();
        expect(MockMediaRecorder.instances).toHaveLength(0);
        expect(screen.getByText(/Erro ao iniciar a gravação: mic negado/)).toBeTruthy();
    });

    it('stops and downloads when the user ends screen sharing from the browser', async () => {
        await montar(null);
        const recorder = MockMediaRecorder.instances[0];

        await act(async () => {
            recorder.ondataavailable({ data: new Blob(['x'], { type: 'video/webm' }) });
            telaTrack.onended();
        });

        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(screen.getByText('▶ INICIAR GRAVAÇÃO')).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Casos de borda adicionais: permissões pendentes, fallbacks, parada dupla, vozes sem áudio
// ---------------------------------------------------------------------------

describe('GravadorPanel — casos de borda do fluxo de gravação', () => {
    let rafSpy;
    let getDisplayMediaMock;
    let getUserMediaMock;
    let telaTrack;
    let telaStream;
    let playSpy;
    let pauseSpy;

    beforeEach(() => {
        instalarMocksDeMidia();
        rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);
        playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
        pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

        telaTrack = { kind: 'video', stop: vi.fn(), getSettings: () => ({ displaySurface: 'browser' }) };
        telaStream = { getTracks: () => [telaTrack], getVideoTracks: () => [telaTrack] };
        getDisplayMediaMock = vi.fn(() => Promise.resolve(telaStream));
        getUserMediaMock = vi.fn(() => Promise.resolve(criarStreamAudio('micProprio')));
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: { getUserMedia: getUserMediaMock, getDisplayMedia: getDisplayMediaMock },
            configurable: true,
        });
        delete MockMediaRecorder.isTypeSupported;
    });

    afterEach(() => {
        cleanup();
        rafSpy.mockRestore();
        playSpy.mockRestore();
        pauseSpy.mockRestore();
        delete MockMediaRecorder.isTypeSupported;
        vi.clearAllMocks();
    });

    async function renderizar(valorVoz) {
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');
        let utils;
        await act(async () => {
            utils = render(
                React.createElement(VoiceContext.Provider, { value: valorVoz }, React.createElement(GravadorPanel))
            );
        });
        return utils;
    }

    async function clicarIniciar() {
        await act(async () => {
            fireEvent.click(screen.getByText('▶ INICIAR GRAVAÇÃO'));
            for (let i = 0; i < 5; i++) await Promise.resolve();
        });
    }

    it('falls back to audio-only and releases the screen when video/webm is not supported', async () => {
        MockMediaRecorder.isTypeSupported = vi.fn(() => false);
        await renderizar(null);
        await clicarIniciar();

        expect(MockMediaRecorder.instances).toHaveLength(1);
        const rec = MockMediaRecorder.instances[0];
        expect(rec.options).toMatchObject({ mimeType: 'audio/webm', audioBitsPerSecond: 32000 });
        expect(rec.stream.getVideoTracks()).toHaveLength(0);
        expect(telaTrack.stop).toHaveBeenCalled();
        expect(screen.getByText(/não grava vídeo webm/)).toBeTruthy();
    });

    it('records video when isTypeSupported reports video/webm as supported', async () => {
        MockMediaRecorder.isTypeSupported = vi.fn(() => true);
        await renderizar(null);
        await clicarIniciar();

        expect(MockMediaRecorder.isTypeSupported).toHaveBeenCalledWith('video/webm');
        expect(MockMediaRecorder.instances[0].options.mimeType).toBe('video/webm');
    });

    it('falls back to audio-only when getDisplayMedia does not exist in the browser', async () => {
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: { getUserMedia: getUserMediaMock },
            configurable: true,
        });
        await renderizar(null);
        await clicarIniciar();

        expect(MockMediaRecorder.instances[0].options.mimeType).toBe('audio/webm');
        expect(screen.getByText(/não permite capturar a tela/)).toBeTruthy();
    });

    it('warns when the user shares a whole screen/window instead of the tab', async () => {
        telaTrack.getSettings = () => ({ displaySurface: 'monitor' });
        await renderizar(null);
        await clicarIniciar();

        expect(screen.getByText(/compartilhou a tela\/janela inteira/)).toBeTruthy();
    });

    it('unmounting while the screen picker is pending does not leave a recorder running or leak the screen stream', async () => {
        let liberarPicker;
        getDisplayMediaMock.mockImplementation(() => new Promise(resolve => { liberarPicker = resolve; }));
        const { unmount } = await renderizar(null);

        await act(async () => { fireEvent.click(screen.getByText('▶ INICIAR GRAVAÇÃO')); });
        await act(async () => { unmount(); });
        await act(async () => {
            liberarPicker(telaStream);
            for (let i = 0; i < 6; i++) await Promise.resolve();
        });

        expect(MockMediaRecorder.instances).toHaveLength(0);
        expect(telaTrack.stop).toHaveBeenCalled();
        expect(MockAudioContext.instances.every(c => c.state === 'closed')).toBe(true);
    });

    it('unmounting while the microphone prompt is pending stops the late mic tracks and never starts a recorder', async () => {
        let liberarMic;
        const trilhaMic = { kind: 'audio', stop: vi.fn() };
        getUserMediaMock.mockImplementation(() => new Promise(resolve => { liberarMic = resolve; }));
        const { unmount } = await renderizar(null);

        await act(async () => {
            fireEvent.click(screen.getByText('▶ INICIAR GRAVAÇÃO'));
            for (let i = 0; i < 4; i++) await Promise.resolve();
        });
        await act(async () => { unmount(); });
        await act(async () => {
            liberarMic(criarStreamAudio('micTardio', [trilhaMic]));
            for (let i = 0; i < 6; i++) await Promise.resolve();
        });

        expect(MockMediaRecorder.instances).toHaveLength(0);
        expect(trilhaMic.stop).toHaveBeenCalled();
        expect(telaTrack.stop).toHaveBeenCalled();
        expect(MockAudioContext.instances.every(c => c.state === 'closed')).toBe(true);
    });

    it('unmounting mid-recording does not trigger a download (onstop is detached)', async () => {
        const { unmount } = await renderizar(null);
        await clicarIniciar();
        const rec = MockMediaRecorder.instances[0];
        rec.ondataavailable({ data: new Blob(['x'], { type: 'video/webm' }) });

        await act(async () => { unmount(); });

        expect(rec.state).toBe('inactive');
        expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('stopping twice (button + browser "stop sharing") downloads only once and does not throw', async () => {
        await renderizar(null);
        await clicarIniciar();
        const rec = MockMediaRecorder.instances[0];
        rec.ondataavailable({ data: new Blob(['x'], { type: 'video/webm' }) });

        await act(async () => {
            fireEvent.click(screen.getByText('⏹ ENCERRAR E BAIXAR'));
            telaTrack.onended();
        });

        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(screen.getByText('▶ INICIAR GRAVAÇÃO')).toBeTruthy();
    });

    it('can start a fresh recording after one has finished (resources are reusable)', async () => {
        await renderizar(null);
        await clicarIniciar();
        await act(async () => { fireEvent.click(screen.getByText('⏹ ENCERRAR E BAIXAR')); });
        await clicarIniciar();

        expect(MockMediaRecorder.instances).toHaveLength(2);
        expect(MockMediaRecorder.instances[1].state).toBe('recording');
    });

    it('skips remote streams without audio tracks and still records the others', async () => {
        const voz = {
            meuStream: criarStreamAudio('meuMicRadio'),
            conexoes: [
                { id: 'anime-rpg-mudo', stream: criarStreamAudio('sMudo', []) },
                { id: 'anime-rpg-ok', stream: criarStreamAudio('sOk') },
            ],
        };
        await renderizar(voz);
        await clicarIniciar();

        const capturados = MockAudioContext.instances[0].fontes.map(f => f.stream.id);
        expect(capturados).toContain('sOk');
        expect(capturados).not.toContain('sMudo');
        expect(MockMediaRecorder.instances).toHaveLength(1);
    });

    it('ignores connections whose stream is null/undefined', async () => {
        const voz = {
            meuStream: criarStreamAudio('meuMicRadio'),
            conexoes: [{ id: 'anime-rpg-a', stream: null }, { id: 'anime-rpg-b' }],
        };
        await renderizar(voz);
        await clicarIniciar();

        expect(MockAudioContext.instances[0].fontes.map(f => f.stream.id)).toEqual(['meuMicRadio']);
        expect(MockMediaRecorder.instances).toHaveLength(1);
    });

    it('handles a VoiceContext value with meuStream but no conexoes array', async () => {
        await renderizar({ meuStream: criarStreamAudio('meuMicRadio') });
        await clicarIniciar();

        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(screen.getByText(/0 jogador\(es\) conectado\(s\)/)).toBeTruthy();
    });

    it('opens its own mic and still records remote players when in the context but without meuStream', async () => {
        const voz = { meuStream: null, conexoes: [{ id: 'anime-rpg-x', stream: criarStreamAudio('sX') }] };
        await renderizar(voz);
        await clicarIniciar();

        expect(getUserMediaMock).toHaveBeenCalledTimes(1);
        const capturados = MockAudioContext.instances[0].fontes.map(f => f.stream.id);
        expect(capturados).toEqual(expect.arrayContaining(['micProprio', 'sX']));
    });

    it('does not connect the same stream twice on re-renders with identical connections', async () => {
        const voz = {
            meuStream: criarStreamAudio('meuMicRadio'),
            conexoes: [{ id: 'anime-rpg-x', stream: criarStreamAudio('sX') }],
        };
        const { rerender } = await renderizar(voz);
        await clicarIniciar();
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');

        await act(async () => {
            rerender(
                React.createElement(VoiceContext.Provider, { value: { ...voz, conexoes: [...voz.conexoes] } }, React.createElement(GravadorPanel))
            );
        });

        expect(MockAudioContext.instances[0].fontes.filter(f => f.stream.id === 'sX')).toHaveLength(1);
    });

    it('attaches a muted <audio> anchor per remote stream, and pauses it when the player leaves', async () => {
        const voz = {
            meuStream: criarStreamAudio('meuMicRadio'),
            conexoes: [{ id: 'anime-rpg-x', stream: criarStreamAudio('sX') }],
        };
        const { rerender } = await renderizar(voz);
        await clicarIniciar();
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');

        expect(playSpy).toHaveBeenCalledTimes(1); // only the remote stream, not the local mic
        pauseSpy.mockClear();

        await act(async () => {
            rerender(
                React.createElement(VoiceContext.Provider, { value: { ...voz, conexoes: [] } }, React.createElement(GravadorPanel))
            );
        });
        expect(pauseSpy).toHaveBeenCalledTimes(1);
    });

    it('survives an anchor play() promise that rejects (autoplay policy)', async () => {
        playSpy.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
        const voz = {
            meuStream: criarStreamAudio('meuMicRadio'),
            conexoes: [{ id: 'anime-rpg-x', stream: criarStreamAudio('sX') }],
        };
        await renderizar(voz);
        await clicarIniciar();

        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(MockAudioContext.instances[0].fontes.map(f => f.stream.id)).toContain('sX');
    });

    it('logs and continues when createMediaStreamSource throws for one remote stream', async () => {
        const original = MockAudioContext.prototype.createMediaStreamSource;
        MockAudioContext.prototype.createMediaStreamSource = function (stream) {
            if (stream.id === 'ruim') throw new Error('boom');
            return original.call(this, stream);
        };
        try {
            const voz = {
                meuStream: criarStreamAudio('meuMicRadio'),
                conexoes: [
                    { id: 'anime-rpg-ruim', stream: criarStreamAudio('ruim') },
                    { id: 'anime-rpg-bom', stream: criarStreamAudio('bom') },
                ],
            };
            await renderizar(voz);
            await clicarIniciar();

            // The failing stream is retried on every sync (initial + the gravando effect), so the log repeats.
            expect(screen.getAllByText(/Não foi possível captar ruim: boom/).length).toBeGreaterThanOrEqual(1);
            expect(MockAudioContext.instances[0].fontes.map(f => f.stream.id)).toContain('bom');
            expect(MockMediaRecorder.instances).toHaveLength(1);
        } finally {
            MockAudioContext.prototype.createMediaStreamSource = original;
        }
    });

    it('reports an error and releases the screen when the MediaRecorder constructor throws', async () => {
        const Original = global.MediaRecorder;
        const Lancador = function () { throw new Error('mime nao suportado'); };
        global.MediaRecorder = Lancador;
        window.MediaRecorder = Lancador;
        try {
            await renderizar(null);
            await clicarIniciar();

            expect(screen.getByText(/Erro ao iniciar a gravação: mime nao suportado/)).toBeTruthy();
            expect(telaTrack.stop).toHaveBeenCalled();
            expect(screen.getByText('▶ INICIAR GRAVAÇÃO')).toBeTruthy();
        } finally {
            global.MediaRecorder = Original;
            window.MediaRecorder = Original;
        }
    });

    // BUG conhecido (GravadorPanel.jsx, catch de iniciarGravacao): o visualizador ja foi
    // iniciado (AudioContext + loop de requestAnimationFrame) e o catch so chama
    // liberarRecursos(), nunca pararVisualizador(). O AudioContext do visualizador vaza.
    it('closes the visualizer AudioContext when starting fails after the visualizer was created', async () => {
        const Original = global.MediaRecorder;
        const Lancador = function () { throw new Error('falhou'); };
        global.MediaRecorder = Lancador;
        window.MediaRecorder = Lancador;
        try {
            await renderizar(null);
            await clicarIniciar();

            expect(MockAudioContext.instances.every(c => c.state === 'closed')).toBe(true);
        } finally {
            global.MediaRecorder = Original;
            window.MediaRecorder = Original;
        }
    });
});
