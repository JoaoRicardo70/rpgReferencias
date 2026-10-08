import { describe, it, expect } from 'vitest';
import { ELEMENTOS_SISTEMA, CATEGORIAS_ELEMENTO, chaveElemento, agruparElementosPorCategoria } from './elementos.js';
import { getPolaridadeElemento } from './polaridade.js';

describe('elementos do sistema', () => {
    it('ids únicos e todos (menos o Cinético) têm polaridade', () => {
        const ids = ELEMENTOS_SISTEMA.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        ELEMENTOS_SISTEMA.filter(e => e.id !== 'fisico').forEach(e => expect(getPolaridadeElemento(e.id), e.id).not.toBeNull());
        expect(getPolaridadeElemento('fisico')).toBeNull();
    });

    it('traz os elementos que faltavam', () => {
        ['terra', 'vento', 'solar', 'vacuo', 'ether', 'celestial', 'cosmos', 'vazio', 'madeira', 'tufao', 'magnetismo'].forEach(id =>
            expect(ELEMENTOS_SISTEMA.some(e => e.id === id), id).toBe(true));
        expect(ELEMENTOS_SISTEMA.length).toBeGreaterThanOrEqual(40);
    });

    it('chaveElemento ignora acento, prefixo Elemento e sufixo Verdadeiro', () => {
        expect(chaveElemento('Elemento Névoa')).toBe('nevoa');
        expect(chaveElemento('Agua Verdadeira')).toBe('agua');
        expect(chaveElemento('Vácuo')).toBe('vacuo');
        expect(chaveElemento(null)).toBe('');
    });

    it('agrupa na ordem das categorias e manda desconhecidos para Personalizados', () => {
        const g = agruparElementosPorCategoria([...ELEMENTOS_SISTEMA, { id: 'x', nome: 'X', icone: '?' }]);
        expect(g[0].titulo).toBe(CATEGORIAS_ELEMENTO[0]);
        expect(g[g.length - 1].titulo).toBe('Personalizados');
    });
});

describe('apelidos', () => {
    it('Éter e Treva casam com os ids ether e trevas', () => {
        expect(chaveElemento('Éter')).toBe('ether');
        expect(chaveElemento('Treva')).toBe('trevas');
    });
});
