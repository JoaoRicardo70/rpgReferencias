import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useOuvidoSextaFeira } from './MapaVoz.jsx';

let instancias;

class FakeRecognition {
    constructor() { this.start = vi.fn(); this.abort = vi.fn(); instancias.push(this); }
}

describe('useOuvidoSextaFeira — não entra em laço de reinício', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        instancias = [];
        window.SpeechRecognition = FakeRecognition;
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
        delete window.SpeechRecognition;
    });

    it('não reinicia depois de um erro permanente (network, típico do app desktop)', () => {
        renderHook(() => useOuvidoSextaFeira('Tester', true, false));
        const rec = instancias[0];
        expect(rec.start).toHaveBeenCalledTimes(1);

        rec.onerror({ error: 'network' });
        rec.onend();
        vi.advanceTimersByTime(60000);

        expect(rec.start).toHaveBeenCalledTimes(1);
    });

    it('reinicia com pausa crescente (não imediatamente) quando o fim é normal', () => {
        renderHook(() => useOuvidoSextaFeira('Tester', true, false));
        const rec = instancias[0];

        rec.onend();
        expect(rec.start).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(500);
        expect(rec.start).toHaveBeenCalledTimes(2);

        rec.onend();
        vi.advanceTimersByTime(500);
        expect(rec.start).toHaveBeenCalledTimes(2); // segunda pausa é maior (1000ms)
        vi.advanceTimersByTime(500);
        expect(rec.start).toHaveBeenCalledTimes(3);
    });

    it('para de reiniciar após o limite de tentativas sem fala', () => {
        renderHook(() => useOuvidoSextaFeira('Tester', true, false));
        const rec = instancias[0];
        for (let i = 0; i < 40; i++) { rec.onend(); vi.advanceTimersByTime(20000); }
        expect(rec.start.mock.calls.length).toBeLessThanOrEqual(21);
    });

    it('silêncio longo (no-speech) não esgota o limite de reinícios', () => {
        renderHook(() => useOuvidoSextaFeira('Tester', true, false));
        const rec = instancias[0];
        for (let i = 0; i < 60; i++) { rec.onerror({ error: 'no-speech' }); rec.onend(); vi.advanceTimersByTime(600); }
        expect(rec.start.mock.calls.length).toBe(61);
    });

    it('não liga o reconhecimento quando o jogador está mutado ou fora da Sala', () => {
        renderHook(() => useOuvidoSextaFeira('Tester', true, true));
        renderHook(() => useOuvidoSextaFeira('Tester', false, false));
        expect(instancias).toHaveLength(0);
    });

    it('limpa o timer e aborta ao desmontar', () => {
        const { unmount } = renderHook(() => useOuvidoSextaFeira('Tester', true, false));
        const rec = instancias[0];
        rec.onend();
        unmount();
        vi.advanceTimersByTime(20000);
        expect(rec.abort).toHaveBeenCalled();
        expect(rec.start).toHaveBeenCalledTimes(1);
    });
});
