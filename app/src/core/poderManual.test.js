import { describe, it, expect } from 'vitest';
import { lerPoderDigitado, escalarPoder, dummieComPoderManual, dummieSeguindoFicha } from './poderManual';

describe('lerPoderDigitado', () => {
    it('números simples, pt-BR e científica', () => {
        expect(lerPoderDigitado('1500')).toBe(1500);
        expect(lerPoderDigitado('1.000.000')).toBe(1000000);
        expect(lerPoderDigitado('1.000.000,5')).toBe(1000000.5);
        expect(lerPoderDigitado('1,5')).toBe(1.5);
        expect(lerPoderDigitado('1.5')).toBe(1.5);
        expect(lerPoderDigitado('1e10')).toBe(1e10);
        expect(lerPoderDigitado('  42  ')).toBe(42);
    });
    it('sufixos mil/k/mi/bi/tri em várias grafias', () => {
        expect(lerPoderDigitado('300k')).toBe(300000);
        expect(lerPoderDigitado('2 mil')).toBe(2000);
        expect(lerPoderDigitado('12 milhões')).toBe(12e6);
        expect(lerPoderDigitado('12 milhoes')).toBe(12e6);
        expect(lerPoderDigitado('50 bi')).toBe(50e9);
        expect(lerPoderDigitado('1,5 Bilhões')).toBe(1.5e9);
        expect(lerPoderDigitado('2 tri')).toBe(2e12);
        expect(lerPoderDigitado('3 T')).toBe(3e12);
    });
    it('recusa lixo, negativo e vazio', () => {
        ['', '   ', 'abc', '-5', '12 xyz', '1,2,3x', null, undefined, {}, '5 bi bi'].forEach(v => expect(lerPoderDigitado(v)).toBeNull());
        expect(lerPoderDigitado(-1)).toBeNull();
        expect(lerPoderDigitado(NaN)).toBeNull();
        expect(lerPoderDigitado(Infinity)).toBeNull();
    });
    it('aceita número JS não negativo', () => {
        expect(lerPoderDigitado(0)).toBe(0);
        expect(lerPoderDigitado(12.5)).toBe(12.5);
    });
});

describe('escalarPoder', () => {
    it('multiplica e arredonda a 2 casas', () => {
        expect(escalarPoder(1000, 2)).toBe(2000);
        expect(escalarPoder(1000, 1.25)).toBe(1250);
        expect(escalarPoder(1, 1 / 3)).toBe(0.33);
    });
    it('entradas inválidas dão null', () => {
        expect(escalarPoder(null, 2)).toBe(0);
        expect(escalarPoder(undefined, 2)).toBeNull();
        expect(escalarPoder('x', 2)).toBeNull();
        expect(escalarPoder(10, -1)).toBeNull();
        expect(escalarPoder(10, NaN)).toBeNull();
        expect(escalarPoder(-5, 2)).toBeNull();
    });
});

describe('dummieComPoderManual / dummieSeguindoFicha', () => {
    it('token de ficha de NPC: grava o Poder e desvincula', () => {
        const r = dummieComPoderManual({ nome: 'Boss #1', fichaOrigem: 'Boss', poderCalculado: 10 }, '50 bi');
        expect(r).toMatchObject({ poderCalculado: 50e9, poderDesvinculado: true, nome: 'Boss #1' });
    });
    it('token sem ficha de origem: só o Poder', () => {
        const r = dummieComPoderManual({ nome: 'Boneco' }, 123);
        expect(r.poderCalculado).toBe(123);
        expect('poderDesvinculado' in r).toBe(false);
    });
    it('valor inválido ou token nulo: null; não altera o original', () => {
        expect(dummieComPoderManual({ nome: 'x' }, 'abc')).toBeNull();
        expect(dummieComPoderManual(null, 5)).toBeNull();
        const d = { nome: 'x', fichaOrigem: 'B', poderCalculado: 1 };
        dummieComPoderManual(d, 9);
        expect(d.poderCalculado).toBe(1);
    });
    it('seguir a ficha tira o desvínculo; sem ficha de origem não faz nada', () => {
        expect(dummieSeguindoFicha({ nome: 'x', fichaOrigem: 'B', poderDesvinculado: true })).toEqual({ nome: 'x', fichaOrigem: 'B' });
        expect(dummieSeguindoFicha({ nome: 'x' })).toBeNull();
        expect(dummieSeguindoFicha(null)).toBeNull();
    });
});
