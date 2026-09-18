/**
 * Tests for GravadorPanel.jsx — MediaRecorder audioBitsPerSecond fix.
 *
 * Bug fixed: iniciarMediaRecorder() used to call `new MediaRecorder(stream, { mimeType:
 * 'audio/webm' })` with no explicit audioBitsPerSecond, so Chrome defaulted to 128kbps.
 * A full 20-minute auto-sliced chunk's base64 payload (~24.4MB) exceeded the Gemini API's
 * ~20MB inline-request-size limit, so every full-length chunk's transcription call failed.
 * The fix passes `audioBitsPerSecond: 32000`, keeping a 20-minute chunk's base64 payload
 * around ~6.3MB, safely under the limit.
 *
 * This test mocks getUserMedia, MediaRecorder and AudioContext (used only for the volume
 * visualizer) so the component can mount and "▶ INICIAR SESSÃO" can be clicked without
 * needing real browser media APIs, then asserts the exact options object passed to the
 * MediaRecorder constructor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for modules imported by GravadorPanel.jsx
// ---------------------------------------------------------------------------

vi.mock('firebase/storage', () => ({
    ref: vi.fn((storage, path) => ({ path })),
    uploadBytes: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/functions', () => ({
    httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({ data: { texto: '' } }))),
}));

vi.mock('../../services/firebase-config', () => ({
    storage: { __isMock: true },
    functions: { __isMock: true },
}));

vi.mock('../../stores/useStore', () => ({
    default: vi.fn((selector) => selector({
        cenario: { tavernaAtivos: [] },
        personagens: {},
        meuNome: 'Tester',
        minhaFicha: { bio: {} },
    })),
}));

vi.mock('./AIFormContext', () => ({
    useAIForm: () => ({
        capitulosPresente: [],
        capitulosFuturo: [],
        salvarNoRegistro: vi.fn(),
        loreFoco: 'presente',
    }),
}));

// ---------------------------------------------------------------------------
// Browser media API mocks
// ---------------------------------------------------------------------------

class MockMediaRecorder {
    constructor(stream, options) {
        MockMediaRecorder.instances.push({ stream, options });
        this.stream = stream;
        this.options = options;
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
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
    });

    afterEach(() => {
        rafSpy.mockRestore();
        vi.clearAllMocks();
    });

    it('calls MediaRecorder with mimeType "audio/webm" and audioBitsPerSecond 32000 on session start', async () => {
        const { default: GravadorPanel } = await import('./GravadorPanel.jsx');

        await act(async () => {
            render(React.createElement(GravadorPanel));
        });

        const startButton = screen.getByText('▶ INICIAR SESSÃO');

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
});
