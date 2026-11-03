import { describe, it, expect } from 'vitest';
import { bonusDeAtributo, MULTIPLICADOR_ATRIBUTO } from './utils.js';

describe('bonusDeAtributo: valores de referencia (round(MULTIPLICADOR_ATRIBUTO*log10(|v|)))', () => {
    const esperadoPor = (n) => Math.round(MULTIPLICADOR_ATRIBUTO * Math.log10(n));
    it.each([
        1, 2, 3, 5, 7, 10, 42, 50, 85, 99, 100, 350, 1000, 1500, 9999, 24000, 100000, 120000, 1000000,
    ])('valor %s => round(MULT*log10(v))', (v) => {
        expect(bonusDeAtributo(v)).toBe(esperadoPor(v));
    });
    it('ancoras literais das decisoes do usuario (multiplicador 4)', () => {
        expect(MULTIPLICADOR_ATRIBUTO).toBe(4);
        const literais = [[1, 0], [20, 5], [50, 7], [120, 8], [1000, 12], [100000, 20], [200000, 21], [1000000, 24]];
        for (const [v, e] of literais) expect(bonusDeAtributo(v)).toBe(e);
    });
    it('potencias de 10 valem MULTIPLICADOR_ATRIBUTO por dezena', () => {
        for (let k = 0; k <= 12; k++) expect(bonusDeAtributo(10 ** k)).toBe(MULTIPLICADOR_ATRIBUTO * k);
    });
    it('exemplos do enunciado: 50 => 7, 120 => 8, 100000 => 20', () => {
        expect(bonusDeAtributo(50)).toBe(7);
        expect(bonusDeAtributo(120)).toBe(8);
        expect(bonusDeAtributo(100000)).toBe(20);
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
    it('multiplicar por 10 soma exatamente MULTIPLICADOR_ATRIBUTO', () => {
        for (const v of [1, 3, 7, 42, 85, 350, 1234]) expect(bonusDeAtributo(v * 10)).toBe(bonusDeAtributo(v) + MULTIPLICADOR_ATRIBUTO);
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
        expect(bonusDeAtributo(-100)).toBe(8);
        expect(bonusDeAtributo(-50)).toBe(bonusDeAtributo(50));
        expect(bonusDeAtributo(-1)).toBe(0);
        expect(bonusDeAtributo(-0.5)).toBe(0);
    });
    it('string numerica funciona; nao numerica e vazia => 0', () => {
        expect(bonusDeAtributo('100')).toBe(8);
        expect(bonusDeAtributo(' 50 ')).toBe(7);
        expect(bonusDeAtributo('abc')).toBe(0);
        expect(bonusDeAtributo('')).toBe(0);
        expect(bonusDeAtributo('-100')).toBe(8);
    });
    it('Infinity e -Infinity valem o mesmo que Number.MAX_VALUE (finito)', () => {
        const max = bonusDeAtributo(Number.MAX_VALUE);
        expect(Number.isFinite(max)).toBe(true);
        expect(max).toBe(Math.round(MULTIPLICADOR_ATRIBUTO * Math.log10(Number.MAX_VALUE)));
        expect(bonusDeAtributo(Infinity)).toBe(max);
        expect(bonusDeAtributo(-Infinity)).toBe(max);
        expect(max).toBe(1233);
    });
    it('numeros enormes ficam finitos', () => {
        expect(bonusDeAtributo(1e300)).toBe(Math.round(MULTIPLICADOR_ATRIBUTO * 300));
        expect(Number.isFinite(bonusDeAtributo(1e308))).toBe(true);
    });
    it('booleanos => 0', () => {
        expect(bonusDeAtributo(true)).toBe(0);
        expect(bonusDeAtributo(false)).toBe(0);
    });
});
