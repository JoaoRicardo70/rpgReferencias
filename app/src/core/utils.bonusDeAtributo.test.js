import { describe, it, expect } from 'vitest';
import { bonusDeAtributo } from './utils.js';

describe('bonusDeAtributo: valores de referencia (round(10*log10(|v|)))', () => {
    it.each([
        [1, 0], [2, 3], [3, 5], [5, 7], [7, 8], [10, 10], [42, 16], [50, 17], [85, 19], [99, 20],
        [100, 20], [350, 25], [1000, 30], [1500, 32], [9999, 40], [24000, 44], [100000, 50],
        [120000, 51], [1000000, 60],
    ])('valor %s => %s', (v, esperado) => {
        expect(bonusDeAtributo(v)).toBe(esperado);
    });
    it('potencias de 10 valem 10 por dezena', () => {
        for (let k = 0; k <= 12; k++) expect(bonusDeAtributo(10 ** k)).toBe(10 * k);
    });
    it('exemplos do enunciado: 50 => 17, 120 => 21, 100000 => 50', () => {
        expect(bonusDeAtributo(50)).toBe(17);
        expect(bonusDeAtributo(120)).toBe(21);
        expect(bonusDeAtributo(100000)).toBe(50);
    });
});

describe('bonusDeAtributo: monotonia e continuidade', () => {
    it('nao decresce de 1 a 5000 e devolve inteiros', () => {
        let anterior = bonusDeAtributo(1);
        for (let v = 1; v <= 5000; v++) {
            const b = bonusDeAtributo(v);
            expect(Number.isInteger(b)).toBe(true);
            expect(b).toBeGreaterThanOrEqual(anterior);
            anterior = b;
        }
    });
    it('sem saltos: valores consecutivos diferem no maximo 1 a partir de 10', () => {
        for (let v = 10; v < 5000; v++) {
            expect(bonusDeAtributo(v + 1) - bonusDeAtributo(v)).toBeLessThanOrEqual(1);
        }
    });
    it('crescimento estrito entre potencias de 10 consecutivas', () => {
        for (let k = 0; k < 15; k++) expect(bonusDeAtributo(10 ** (k + 1))).toBeGreaterThan(bonusDeAtributo(10 ** k));
    });
    it('multiplicar por 10 soma exatamente 10', () => {
        for (const v of [1, 3, 7, 42, 85, 350, 1234]) expect(bonusDeAtributo(v * 10)).toBe(bonusDeAtributo(v) + 10);
    });
    it('sem divisao por 1000: 999 e 1000 diferem no maximo 1', () => {
        expect(bonusDeAtributo(1000) - bonusDeAtributo(999)).toBeLessThanOrEqual(1);
    });
});

describe('bonusDeAtributo: entradas de borda', () => {
    it('0 e valores abaixo de 1 => 0', () => {
        expect(bonusDeAtributo(0)).toBe(0);
        expect(bonusDeAtributo(-0)).toBe(0);
        expect(bonusDeAtributo(0.5)).toBe(0);
        expect(bonusDeAtributo(0.999)).toBe(0);
        expect(bonusDeAtributo(Number.MIN_VALUE)).toBe(0);
    });
    it('NaN, undefined, null, objeto, array e sem argumento => 0', () => {
        expect(bonusDeAtributo(NaN)).toBe(0);
        expect(bonusDeAtributo(undefined)).toBe(0);
        expect(bonusDeAtributo(null)).toBe(0);
        expect(bonusDeAtributo({})).toBe(0);
        expect(bonusDeAtributo([])).toBe(0);
        expect(bonusDeAtributo()).toBe(0);
    });
    it('nunca devolve -0', () => {
        for (const v of [0, -0, NaN, -0.5, null, 'x']) expect(Object.is(bonusDeAtributo(v), 0)).toBe(true);
    });
    it('negativo usa o valor absoluto', () => {
        expect(bonusDeAtributo(-100)).toBe(20);
        expect(bonusDeAtributo(-50)).toBe(bonusDeAtributo(50));
        expect(bonusDeAtributo(-1)).toBe(0);
        expect(bonusDeAtributo(-0.5)).toBe(0);
    });
    it('string numerica funciona; nao numerica e vazia => 0', () => {
        expect(bonusDeAtributo('100')).toBe(20);
        expect(bonusDeAtributo(' 50 ')).toBe(17);
        expect(bonusDeAtributo('abc')).toBe(0);
        expect(bonusDeAtributo('')).toBe(0);
        expect(bonusDeAtributo('-100')).toBe(20);
    });
    it('Infinity e -Infinity valem o mesmo que Number.MAX_VALUE (finito)', () => {
        const max = bonusDeAtributo(Number.MAX_VALUE);
        expect(Number.isFinite(max)).toBe(true);
        expect(max).toBe(Math.round(10 * Math.log10(Number.MAX_VALUE)));
        expect(bonusDeAtributo(Infinity)).toBe(max);
        expect(bonusDeAtributo(-Infinity)).toBe(max);
        expect(max).toBe(3083);
    });
    it('numeros enormes ficam finitos', () => {
        expect(bonusDeAtributo(1e300)).toBe(3000);
        expect(Number.isFinite(bonusDeAtributo(1e308))).toBe(true);
    });
    it('booleanos => 0', () => {
        expect(bonusDeAtributo(true)).toBe(0);
        expect(bonusDeAtributo(false)).toBe(0);
    });
});
