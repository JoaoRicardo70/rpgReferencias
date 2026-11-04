import { describe, it, expect } from 'vitest';
import { bonusDeAtributo, reduzirComBonus, FORCA_BONUS_REDUCAO, MULTIPLICADOR_ATRIBUTO } from './utils.js';

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

describe('reduzirComBonus: valores de referência', () => {
    it('constantes', () => {
        expect(FORCA_BONUS_REDUCAO).toBe(3);
        expect(MULTIPLICADOR_ATRIBUTO).toBe(4);
    });
    it.each([
        [316005, 0, 22], [316005, 5, 27], [316005, 50, 31], [316005, 1, 24], [316005, 3, 26],
        [316005, -5, 17], [105, 0, 8], [105, 5, 13], [0, 5, 5], [0, 0, 0], [55, -50, -2],
    ])('reduzirComBonus(%s, %s) = %s', (base, bonus, esperado) => {
        expect(reduzirComBonus(base, bonus)).toBe(esperado);
    });
    it('sem bônus equivale a bonusDeAtributo', () => {
        [1, 5, 42, 105, 1000, 120000].forEach(v => expect(reduzirComBonus(v, 0)).toBe(bonusDeAtributo(v)));
    });
    it('bônus positivo equivale a redução de base*(1+3*bônus)', () => {
        [[1000, 5], [316005, 50], [105, 2]].forEach(([b, x]) => {
            expect(Math.abs(reduzirComBonus(b, x) - bonusDeAtributo(b * (1 + FORCA_BONUS_REDUCAO * x)))).toBeLessThanOrEqual(0);
        });
    });
});

describe('reduzirComBonus: proporcionalidade, simetria, monotonia', () => {
    it('o mesmo bônus soma o mesmo tanto para atributo fraco e forte', () => {
        for (const x of [1, 5, 10, 50]) {
            const fraco = reduzirComBonus(1000, x) - reduzirComBonus(1000, 0);
            const forte = reduzirComBonus(1e7, x) - reduzirComBonus(1e7, 0);
            expect(fraco).toBe(forte);
            expect(fraco).toBeGreaterThan(0);
        }
    });
    it('atributo alto não absorve o bônus: 316005 com +5 sobe de 22 para 27', () => {
        expect(reduzirComBonus(316005, 5) - reduzirComBonus(316005, 0)).toBe(5);
    });
    it('penalidade -x subtrai o mesmo que o buff +x soma (tolerância de 1 por arredondamento)', () => {
        for (const b of [0, 1000, 316005]) {
            for (const x of [1, 5, 50]) {
                const buff = reduzirComBonus(b, x) - reduzirComBonus(b, 0);
                const pen = reduzirComBonus(b, -x) - reduzirComBonus(b, 0);
                expect(Math.abs(pen + buff)).toBeLessThanOrEqual(1);
            }
        }
        expect(reduzirComBonus(0, -5)).toBe(-reduzirComBonus(0, 5));
        expect(reduzirComBonus(0, -50)).toBe(-reduzirComBonus(0, 50));
    });
    it('base 0 com bônus: só a parte do bônus conta; penalidade dá negativo', () => {
        expect(reduzirComBonus(0, 5)).toBe(5);
        expect(reduzirComBonus(0, -5)).toBe(-5);
        expect(reduzirComBonus(0, 0)).toBe(0);
    });
    it('monotonia no bônus (não decresce)', () => {
        for (const b of [0, 5, 105, 316005]) {
            let ant = reduzirComBonus(b, -200);
            for (let x = -199; x <= 200; x++) {
                const v = reduzirComBonus(b, x);
                expect(v).toBeGreaterThanOrEqual(ant);
                ant = v;
            }
        }
    });
    it('monotonia na base', () => {
        let ant = reduzirComBonus(0, 7);
        for (let b = 1; b <= 3000; b++) {
            const v = reduzirComBonus(b, 7);
            expect(v).toBeGreaterThanOrEqual(ant);
            ant = v;
        }
    });
});

describe('reduzirComBonus: entradas de borda', () => {
    const ok = (v) => Number.isFinite(v) && !Object.is(v, -0);
    it('0, NaN, undefined, null, string, objeto: sem NaN nem -0', () => {
        const entradas = [0, -0, NaN, undefined, null, '', 'abc', {}, [], 0.5, -0.5];
        for (const a of entradas) for (const b of entradas) expect(ok(reduzirComBonus(a, b))).toBe(true);
        expect(reduzirComBonus()).toBe(0);
        expect(Object.is(reduzirComBonus(0, 0), 0)).toBe(true);
    });
    it('strings numéricas são aceitas', () => {
        expect(reduzirComBonus('316005', '5')).toBe(27);
        expect(reduzirComBonus('55', '-50')).toBe(-2);
    });
    it('Infinity e -Infinity não geram NaN, Infinity nem -0', () => {
        for (const a of [Infinity, -Infinity, 0, 105]) for (const b of [Infinity, -Infinity, 0, 5]) {
            expect(ok(reduzirComBonus(a, b))).toBe(true);
        }
    });
    it('base negativa vale como 0 na parte base', () => {
        expect(reduzirComBonus(-100, 5)).toBe(reduzirComBonus(0, 5));
    });
    it('pode ser negativo e devolve inteiro', () => {
        expect(reduzirComBonus(55, -50)).toBeLessThan(0);
        [[1, 1], [37, 3], [316005, 7], [10, -4]].forEach(([a, b]) => expect(Number.isInteger(reduzirComBonus(a, b))).toBe(true));
    });
});
