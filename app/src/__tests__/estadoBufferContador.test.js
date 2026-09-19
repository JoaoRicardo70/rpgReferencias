import { describe, it, expect } from 'vitest';
import { definirBufferLigado, haCapturaEmAndamento, lerBufferLigado, registrarCapturaAtiva } from '../core/estadoBuffer';

describe('estadoBuffer: contagem de capturas (Gravador montado em mais de um lugar)', () => {
    it('duas capturas: o indicador só apaga quando as duas terminam', () => {
        const a = registrarCapturaAtiva();
        const b = registrarCapturaAtiva();
        expect(lerBufferLigado()).toBe(true);
        expect(haCapturaEmAndamento()).toBe(true);
        a();
        expect(lerBufferLigado()).toBe(true);
        b();
        expect(lerBufferLigado()).toBe(false);
        expect(haCapturaEmAndamento()).toBe(false);
    });

    it('desregistrar duas vezes não desconta duas capturas', () => {
        const a = registrarCapturaAtiva();
        const b = registrarCapturaAtiva();
        a();
        a();
        expect(haCapturaEmAndamento()).toBe(true);
        b();
        expect(haCapturaEmAndamento()).toBe(false);
    });

    it('o flag manual e as capturas se combinam', () => {
        definirBufferLigado(true);
        const a = registrarCapturaAtiva();
        definirBufferLigado(false);
        expect(lerBufferLigado()).toBe(true);
        a();
        expect(lerBufferLigado()).toBe(false);
    });
});
