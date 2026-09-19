/**
 * Tests for GravadorPanel.jsx — a fully local audio recorder.
 *
 * GravadorPanel records the microphone with MediaRecorder and, on stop, downloads
 * the audio straight to the user's own computer (no Firebase Storage upload, no
 * cloud transcription call — the "Sexta-Feira" cloud transcription was removed
 * because it required a paid Firebase plan).
 *
 * `audioBitsPerSecond: 32000` is still set explicitly: without it Chrome defaults
 * to 128kbps, producing needlessly large local downloads for a voice-only
 * recording (32kbps is already plenty for speech).
 *
 * This test mocks getUserMedia, MediaRecorder and AudioContext (used only for the
 * volume visualizer) so the component can mount and "▶ INICIAR GRAVAÇÃO" can be
 * clicked without needing real browser media APIs, then asserts the exact options
 * object passed to the MediaRecorder constructor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';

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
    createAnalyser() {
        return { fftSize: 0, frequencyBinCount: 128, getByteFrequencyData: vi.fn() };
    }
    createMediaStreamSource() {
        return { connect: vi.fn() };
    }
    close() {}
}

describe('GravadorPanel — MediaRecorder audioBitsPerSecond', () => {
    let getUserMediaMock;
    let rafSpy;

    beforeEach(() => {
        MockMediaRecorder.instances = [];

        // jsdom does not implement scrollIntoView (used by the logs auto-scroll effect)
        window.HTMLElement.prototype.scrollIntoView = vi.fn();

        global.MediaRecorder = MockMediaRecorder;
        window.MediaRecorder = MockMediaRecorder;

        global.AudioContext = MockAudioContext;
        window.AudioContext = MockAudioContext;

        // Prevent the visualizer's recursive requestAnimationFrame loop from running in jsdom
        rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);

        const fakeStream = { getTracks: () => [{ stop: vi.fn() }] };
        getUserMediaMock = vi.fn(() => Promise.resolve(fakeStream));
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: { getUserMedia: getUserMediaMock },
            configurable: true,
        });

        // jsdom does not implement URL.createObjectURL/revokeObjectURL (used to trigger the local download)
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
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

        const startButton = screen.getByText('▶ INICIAR GRAVAÇÃO');

        await act(async () => {
            fireEvent.click(startButton);
            // flush the async getUserMedia().then chain inside iniciarGravacao
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(getUserMediaMock).toHaveBeenCalled();
        expect(MockMediaRecorder.instances).toHaveLength(1);

        const { options } = MockMediaRecorder.instances[0];
        expect(options).toMatchObject({
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
        // getByText throws if no matching node exists, so a successful call already proves it rendered
        expect(screen.getByText(/Gravação salva no seu computador/)).toBeTruthy();
    });
});

describe('GravadorPanel — edge cases', () => {
    let getUserMediaMock;
    let rafSpy;
    let fakeTracks;

    beforeEach(() => {
        MockMediaRecorder.instances = [];
        mockStoreState.meuNome = 'Tester';

        window.HTMLElement.prototype.scrollIntoView = vi.fn();

        global.MediaRecorder = MockMediaRecorder;
        window.MediaRecorder = MockMediaRecorder;

        global.AudioContext = MockAudioContext;
        window.AudioContext = MockAudioContext;

        rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);

        fakeTracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
        const fakeStream = { getTracks: () => fakeTracks };
        getUserMediaMock = vi.fn(() => Promise.resolve(fakeStream));
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: { getUserMedia: getUserMediaMock },
            configurable: true,
        });

        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
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

    it('does NOT call URL.createObjectURL and warns "Nenhum áudio foi capturado" when no chunks were recorded', async () => {
        const recorderInstance = await montarEIniciar();

        // Stop immediately, without ondataavailable ever firing.
        await act(async () => {
            fireEvent.click(screen.getByText('⏹ ENCERRAR E BAIXAR'));
        });

        expect(global.URL.createObjectURL).not.toHaveBeenCalled();
        expect(screen.getByText(/Nenhum áudio foi capturado/)).toBeTruthy();
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
