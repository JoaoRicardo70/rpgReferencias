import { describe, it, expect } from 'vitest';
import {
    getMargemCusto, limitarPercComoPoder, podeConjurarComoPoder, custoBrutoDeEnergia,
    fatorPoderPorCusto, somarCustosBrutos
} from './custoPoder.js';

const vital = (base, atual) => ({ base, nome: 'v', atual, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 });
const fichaBase = () => ({
    forca: vital(100), destreza: vital(80), vida: vital(1000), corpo: vital(500),
    mana: vital(1000, 1e9), aura: vital(1000, 1e9), chakra: vital(1000, 1e9),
    dano: { base: 0, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mPotencial: 1, mUnico: '1.0' },
    poderes: [], inventario: [], ataquesElementais: [], bio: {}, combate: {}
});

describe('custoPoder edge cases (negativos, NaN, invalidos)', () => {
    it('getMargemCusto ignora negativos, NaN e hab nula', () => {
        expect(getMargemCusto(null)).toEqual({ min: 0, max: 0 });
        expect(getMargemCusto({ custoPercentual: -5, custoPercentualMax: -1 })).toEqual({ min: 0, max: 0 });
        expect(getMargemCusto({ custoPercentual: 'abc', custoPercentualMax: NaN })).toEqual({ min: 0, max: 0 });
        expect(getMargemCusto({ custoPercentual: 10, custoPercentualMax: 5 })).toEqual({ min: 10, max: 10 });
        expect(getMargemCusto({ custoPercentual: Infinity })).toEqual({ min: 0, max: 0 });
        expect(getMargemCusto({ custoValor: '7', custoValorMax: '9' })).toEqual({ min: 7, max: 9 });
    });
    it('limitarPercComoPoder: NaN/undefined/vazio valem o maximo; fora da margem e limitado', () => {
        const h = { custoPercentual: 10, custoPercentualMax: 40 };
        expect(limitarPercComoPoder(h, NaN)).toBe(40);
        expect(limitarPercComoPoder(h, undefined)).toBe(40);
        expect(limitarPercComoPoder(h, '')).toBe(40);
        expect(limitarPercComoPoder(h, -50)).toBe(10);
        expect(limitarPercComoPoder(h, 1000)).toBe(40);
        expect(limitarPercComoPoder(h, Infinity)).toBe(40);
        expect(limitarPercComoPoder(h, '25')).toBe(25);
    });
    it('podeConjurarComoPoder tolera ficha/hab nulas', () => {
        expect(podeConjurarComoPoder(null, null)).toBe(false);
        expect(podeConjurarComoPoder({}, {})).toBe(false);
        expect(podeConjurarComoPoder({ combate: { conjuraComoPoder: true } }, undefined)).toBe(true);
    });
    it('custoBrutoDeEnergia devolve 0 para percentual negativo/NaN/ficha ou energia ausente', () => {
        const f = fichaBase();
        expect(custoBrutoDeEnergia(f, 'mana', -10)).toBe(0);
        expect(custoBrutoDeEnergia(f, 'mana', NaN)).toBe(0);
        expect(custoBrutoDeEnergia(f, 'mana', 0)).toBe(0);
        expect(custoBrutoDeEnergia(null, 'mana', 10)).toBe(0);
        expect(custoBrutoDeEnergia(f, 'inexistente', 10)).toBe(0);
        expect(custoBrutoDeEnergia(f, 'mana', 10)).toBeGreaterThan(0);
    });
    it('Reducao de Custo acima de 100%, negativa ou invalida nunca da negativo/NaN', () => {
        const f = fichaBase();
        f.mana.reducaoCusto = 500;
        expect(custoBrutoDeEnergia(f, 'mana', 10)).toBe(0);
        f.mana.reducaoCusto = 'x';
        const v = custoBrutoDeEnergia(f, 'mana', 10);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
        f.mana.reducaoCusto = -50;
        expect(Number.isFinite(custoBrutoDeEnergia(f, 'mana', 10))).toBe(true);
    });
    it('fatorPoderPorCusto vale 1 para entradas negativas/NaN/zero e nunca e menor que 1', () => {
        expect(fatorPoderPorCusto(1000, -5)).toBe(1);
        expect(fatorPoderPorCusto(1000, NaN)).toBe(1);
        expect(fatorPoderPorCusto(-1000, 50)).toBe(1);
        expect(fatorPoderPorCusto(NaN, 50)).toBe(1);
        expect(fatorPoderPorCusto(undefined, undefined)).toBe(1);
        expect(fatorPoderPorCusto(0, 50)).toBe(1);
        expect(fatorPoderPorCusto(1000, 600)).toBeGreaterThan(1);
    });
    it('somarCustosBrutos ignora NaN, textos e entradas nulas', () => {
        expect(somarCustosBrutos(null)).toBe(0);
        expect(somarCustosBrutos([null, undefined, { bruto: NaN }, { bruto: 'x' }, { bruto: 5 }, { bruto: '3' }])).toBe(8);
    });
});
