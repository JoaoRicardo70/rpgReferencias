/**
 * QA — Regression tests for the performance refactor of app/src/core/attributes.js
 *
 * The refactor added an optional 4th parameter `buffsCache` to
 * getEfetivoBase / getMultiplicadorTotal / getMaximo, so that getMaximo() can
 * call getBuffs() ONCE and reuse the result instead of calling it twice
 * (once inside getEfetivoBase, once inside getMultiplicadorTotal).
 *
 * These tests prove the optimization is behavior-preserving: calling the
 * functions WITH a manually-computed buffsCache must produce EXACTLY the
 * same result as calling them WITHOUT it (letting them compute getBuffs()
 * internally), for a ficha with active poderes/passivas that generate
 * base/mbase/mgeral/mformas/mabs buffs.
 */
import { describe, it, expect } from 'vitest';
import { getBuffs, getEfetivoBase, getMultiplicadorTotal, getMaximo } from '../core/attributes.js';
import { fichaPadrao } from '../stores/useStore.js';

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Ficha with active poderes/passivas/items generating every kind of buff
// (base, mbase, mgeral, mformas, mabs) on the 'forca' stat, plus an energy
// stat ('mana') buffed via "todas_energias" so we can also validate energy math.
function buildBuffedFicha() {
    const ficha = deepClone(fichaPadrao);
    ficha.forca = { base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0' };
    ficha.mana = { base: 50000, atual: 999999, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0 };
    ficha.poderes = [{
        ativa: true,
        efeitos: [
            { propriedade: 'base', atributo: 'forca', valor: '500' },
            { propriedade: 'mbase', atributo: 'forca', valor: '2.0' },
            { propriedade: 'mgeral', atributo: 'geral', valor: '1.5' },
            { propriedade: 'mformas', atributo: 'forca', valor: '0.5' },
            { propriedade: 'mabs', atributo: 'forca', valor: '3.0' },
            { propriedade: 'mgeral', atributo: 'todas_energias', valor: '2.0' },
        ],
    }];
    ficha.passivas = [{
        nome: 'Passiva Teste',
        efeitos: [
            { propriedade: 'mbase', atributo: 'forca', valor: '1.0' },
            { propriedade: 'base', atributo: 'forca', valor: '250' },
        ],
    }];
    return ficha;
}

describe('perf refactor — attributes.js buffsCache equivalence', () => {
    describe('getEfetivoBase', () => {
        it('returns identical result with and without a manually-supplied buffsCache (buffed stat)', () => {
            const ficha = buildBuffedFicha();
            const buffs = getBuffs(ficha, 'forca', false, false);

            const semCache = getEfetivoBase(ficha, 'forca');
            const comCache = getEfetivoBase(ficha, 'forca', false, buffs);

            expect(comCache).toBe(semCache);
            expect(comCache).toBe(100000 + 500 + 250); // rawBase + buff.base contributions
        });

        it('returns identical result with and without cache for an unbuffed stat', () => {
            const ficha = deepClone(fichaPadrao);
            const buffs = getBuffs(ficha, 'destreza', false, false);

            expect(getEfetivoBase(ficha, 'destreza', false, buffs)).toBe(getEfetivoBase(ficha, 'destreza'));
        });
    });

    describe('getMultiplicadorTotal', () => {
        it('returns identical result with and without a manually-supplied buffsCache (buffed stat)', () => {
            const ficha = buildBuffedFicha();
            const buffs = getBuffs(ficha, 'forca', false, false);

            const semCache = getMultiplicadorTotal(ficha, 'forca');
            const comCache = getMultiplicadorTotal(ficha, 'forca', false, buffs);

            expect(comCache).toBe(semCache);
            // mBase: hasBuff -> (1.0 -> 0) + 2.0 (poder) + 1.0 (passiva) = 3.0
            // mGeral: hasBuff -> (1.0 -> 0) + 1.5 (poder, atributo "geral") = 1.5
            // mFormas: hasBuff -> (1.0 -> 0) + 0.5 = 0.5
            // mAbsoluto: hasBuff -> (1.0 -> 0) + 3.0 = 3.0
            expect(comCache).toBeCloseTo(3.0 * 1.5 * 0.5 * 3.0);
        });

        it('returns identical result with and without cache for an energy stat affected by "todas_energias"', () => {
            const ficha = buildBuffedFicha();
            const buffs = getBuffs(ficha, 'mana', false, false);

            const semCache = getMultiplicadorTotal(ficha, 'mana');
            const comCache = getMultiplicadorTotal(ficha, 'mana', false, buffs);

            expect(comCache).toBe(semCache);
        });

        it('returns identical result with and without cache for an unbuffed stat', () => {
            const ficha = deepClone(fichaPadrao);
            const buffs = getBuffs(ficha, 'sabedoria', false, false);

            expect(getMultiplicadorTotal(ficha, 'sabedoria', false, buffs)).toBe(getMultiplicadorTotal(ficha, 'sabedoria'));
        });
    });

    describe('getMaximo', () => {
        it('returns identical result with and without a manually-supplied buffsCache (buffed stat)', () => {
            const ficha = buildBuffedFicha();
            const buffs = getBuffs(ficha, 'forca', false, false);

            const semCache = getMaximo(ficha, 'forca');
            const comCache = getMaximo(ficha, 'forca', false, buffs);

            expect(comCache).toBe(semCache);

            const expectedBase = 100000 + 500 + 250;
            const expectedMult = 3.0 * 1.5 * 0.5 * 3.0;
            expect(comCache).toBe(Math.floor(expectedBase * expectedMult));
        });

        it('returns identical result with and without cache for an energy stat', () => {
            const ficha = buildBuffedFicha();
            const buffs = getBuffs(ficha, 'mana', false, false);

            expect(getMaximo(ficha, 'mana', false, buffs)).toBe(getMaximo(ficha, 'mana'));
        });

        it('returns identical result with and without cache for the default (unbuffed) ficha', () => {
            const ficha = deepClone(fichaPadrao);
            const buffs = getBuffs(ficha, 'forca', false, false);

            expect(getMaximo(ficha, 'forca', false, buffs)).toBe(getMaximo(ficha, 'forca'));
            expect(getMaximo(ficha, 'forca')).toBe(100000);
        });

        it('a stale/mismatched buffsCache changes the result — proves the cache is actually used, not ignored', () => {
            const ficha = buildBuffedFicha();
            const fakeBuffs = { base: 0, mbase: 1.0, mgeral: 1.0, mformas: 1.0, mabs: 1.0, munico: [], reducaoCusto: 0, _hasBuff: { mbase: false, mgeral: false, mformas: false, mabs: false } };

            const real = getMaximo(ficha, 'forca');
            const withFakeCache = getMaximo(ficha, 'forca', false, fakeBuffs);

            expect(withFakeCache).not.toBe(real);
            expect(withFakeCache).toBe(100000); // rawBase * 1.0 mult, ignoring the actual buffs
        });

        it('handles avoidLoop=true consistently with and without cache (furia berserker style recursion guard)', () => {
            const ficha = buildBuffedFicha();
            const buffs = getBuffs(ficha, 'forca', false, true);

            expect(getMaximo(ficha, 'forca', true, buffs)).toBe(getMaximo(ficha, 'forca', true));
        });
    });
});
