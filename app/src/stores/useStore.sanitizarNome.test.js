import { describe, it, expect } from 'vitest';
import { sanitizarNome } from './useStore';

describe('sanitizarNome - regressão', () => {
    it('números viram string', () => { expect(sanitizarNome(12)).toBe('12'); });
    it('null, undefined, "" e 0 dão string vazia', () => {
        expect(sanitizarNome(null)).toBe('');
        expect(sanitizarNome(undefined)).toBe('');
        expect(sanitizarNome('')).toBe('');
        expect(sanitizarNome(0)).toBe('');
    });
    it('troca . # $ [ ] / por _', () => {
        expect(sanitizarNome('a.b#c$d[e]f/g')).toBe('a_b_c_d_e_f_g');
        expect(/[.#$[\]/]/.test(sanitizarNome('.#$[]/'))).toBe(false);
    });
    it('faz trim e preserva acentos', () => { expect(sanitizarNome('  João  ')).toBe('João'); });
});
