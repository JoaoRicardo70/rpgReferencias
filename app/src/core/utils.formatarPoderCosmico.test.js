import { describe, it, expect } from 'vitest';
import { formatarPoderCosmico } from './utils';

describe('formatarPoderCosmico - regressão: decimais, sinal e notação científica', () => {
    it('número com casas decimais usa só a parte inteira (12345678.5 -> 12,34 Milhões)', () => {
        expect(formatarPoderCosmico(12345678.5)).toBe('12,34 Milhões');
    });
    it('string decimal também ignora a fração', () => {
        expect(formatarPoderCosmico('12345678.5')).toBe('12,34 Milhões');
    });
    it('inteiros permanecem inalterados', () => {
        expect(formatarPoderCosmico(12345678)).toBe('12,34 Milhões');
        expect(formatarPoderCosmico(123456789012)).toBe('123,45 Bilhões');
        expect(formatarPoderCosmico(999999)).toBe('999.999');
    });
    it('notação científica (número e string)', () => {
        expect(formatarPoderCosmico(1e25)).toBe('10 Septilhões');
        expect(formatarPoderCosmico('1.5e10')).toBe('15 Bilhões');
    });
    it('valores negativos mantêm o sinal', () => {
        expect(formatarPoderCosmico(-50000000)).toBe('-50 Milhões');
    });
    it('zero e string vazia dão "0"', () => {
        expect(formatarPoderCosmico(0)).toBe('0');
        expect(formatarPoderCosmico('')).toBe('0');
    });
});
