import { describe, it, expect } from 'vitest';
import { modificadorDezena } from './utils';

describe('modificadorDezena', () => {
    it.each([
        [0, 0], [5, 5], [24, 24], [120, 12], [128000, 12], [20000, 20], [100, 10], [99, 99], [999, 99], [1, 1], [10, 10],
    ])('%s -> %s', (entrada, esperado) => {
        expect(modificadorDezena(entrada)).toBe(esperado);
    });
    it('negativos usam o valor absoluto', () => {
        expect(modificadorDezena(-120)).toBe(12);
        expect(modificadorDezena(-5)).toBe(5);
    });
    it('NaN, undefined, null, string invalida e Infinity viram 0', () => {
        expect(modificadorDezena(NaN)).toBe(0);
        expect(modificadorDezena(undefined)).toBe(0);
        expect(modificadorDezena(null)).toBe(0);
        expect(modificadorDezena('abc')).toBe(0);
        expect(modificadorDezena(Infinity)).toBe(0);
    });
    it('strings numericas e decimais', () => {
        expect(modificadorDezena('120')).toBe(12);
        expect(modificadorDezena(12.9)).toBe(12);
        expect(modificadorDezena(0.9)).toBe(0);
    });
    it('notacao exponencial (>= 1e21) usa os dois primeiros digitos', () => {
        expect(modificadorDezena(1e21)).toBe(1);
        expect(modificadorDezena('1e21')).toBe(1);
        expect(modificadorDezena(1.5e21)).toBe(15);
        expect(modificadorDezena(1.234e25)).toBe(12);
    });
});
