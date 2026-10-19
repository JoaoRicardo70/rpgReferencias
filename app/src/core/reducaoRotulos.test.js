import { describe, it, expect } from 'vitest';
import { rotuloAlvoReducao, descreverAlvosReducao } from './reducaoRotulos.js';

describe('rotuloAlvoReducao', () => {
    it('"todos" vira "Todo dano"', () => { expect(rotuloAlvoReducao('todos')).toBe('Todo dano'); });
    it('polaridades viram "Elemento X"', () => {
        expect(rotuloAlvoReducao('pol:yin')).toBe('Elemento Yin');
        expect(rotuloAlvoReducao('pol:yang')).toBe('Elemento Yang');
        expect(rotuloAlvoReducao('pol:neutro')).toBe('Elemento Neutro');
    });
    it('polaridade desconhecida devolve o texto original', () => {
        expect(rotuloAlvoReducao('pol:xyz')).toBe('pol:xyz');
    });
    it('elemento conhecido devolve o nome do elemento', () => {
        expect(rotuloAlvoReducao('Fogo')).toBe('Fogo');
    });
    it('elemento e comparado pela chave (sem acento/caixa)', () => {
        expect(rotuloAlvoReducao('agua')).toMatch(/^[ÁA]gua$/);
    });
    it('elemento desconhecido devolve o texto', () => { expect(rotuloAlvoReducao('Plasma')).toBe('Plasma'); });
    it('null/undefined viram string vazia', () => {
        expect(rotuloAlvoReducao(null)).toBe('');
        expect(rotuloAlvoReducao(undefined)).toBe('');
    });
});

describe('descreverAlvosReducao', () => {
    it('sem alvos vira "Todo dano"', () => {
        expect(descreverAlvosReducao({})).toBe('Todo dano');
        expect(descreverAlvosReducao(null)).toBe('Todo dano');
    });
    it('formato antigo (r.elemento)', () => { expect(descreverAlvosReducao({ elemento: 'Fogo' })).toBe('Fogo'); });
    it('varios alvos separados por virgula', () => {
        expect(descreverAlvosReducao({ elementos: ['Fogo', 'pol:yang'] })).toBe('Fogo, Elemento Yang');
    });
    it('lista vazia cai em r.elemento ou todos', () => {
        expect(descreverAlvosReducao({ elementos: [], elemento: 'todos' })).toBe('Todo dano');
    });
});
