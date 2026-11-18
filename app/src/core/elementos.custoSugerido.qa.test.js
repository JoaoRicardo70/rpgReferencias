import { describe, it, expect } from 'vitest';
import { custoSugeridoDaCategoria, custoSugeridoPortao, CUSTO_SUGERIDO_FIXO, CUSTO_SUGERIDO_CICLO } from './elementos';

describe('custoSugeridoDaCategoria', () => {
    it('Magias de Ciclo 1o..9o = 10..18% e 10o = 20%', () => {
        for (let n = 1; n <= 9; n++) expect(custoSugeridoDaCategoria(`Magias de ${n}º Ciclo`, 'Magias de Ciclo')).toBe(9 + n);
        expect(custoSugeridoDaCategoria('Magias de 10º Ciclo', 'Magias de Ciclo')).toBe(20);
    });
    it('ciclo fora da faixa (0, 11) = null', () => {
        expect(custoSugeridoDaCategoria('Magias de 0º Ciclo')).toBeNull();
        expect(custoSugeridoDaCategoria('Magias de 11º Ciclo')).toBeNull();
    });
    it('Kekkei Genkai 10% e Kekkei Touta 20% pelo titulo do grupo', () => {
        expect(custoSugeridoDaCategoria('Elemento Madeira', 'Kekkei Genkai (Mutações Genéticas)')).toBe(10);
        expect(custoSugeridoDaCategoria('Elemento Poeira', 'Kekkei Touta (Seleção Sanguínea)')).toBe(20);
    });
    it('categorias sem sugestao = null (Truques, Arcanas/Negra, Ancestrais, elementos base, vazio)', () => {
        expect(custoSugeridoDaCategoria('Truques de Ciclo', 'Magias de Ciclo')).toBeNull();
        expect(custoSugeridoDaCategoria('Magias Arcanas/Negra de 3º Ciclo', 'Magias Arcanas e Negras')).toBeNull();
        expect(custoSugeridoDaCategoria('Magia de Sangue', 'Magias Ancestrais')).toBeNull();
        expect(custoSugeridoDaCategoria('Fogo', 'A Natureza Base')).toBeNull();
        expect(custoSugeridoDaCategoria('')).toBeNull();
        expect(custoSugeridoDaCategoria(undefined, undefined)).toBeNull();
        expect(custoSugeridoDaCategoria(null, null)).toBeNull();
    });
    it('tolera espacos nas pontas do nome', () => {
        expect(custoSugeridoDaCategoria('  Magias de 2º Ciclo  ')).toBe(11);
    });
});

describe('constantes guardadas', () => {
    it('funcao de Portoes: 10..50 (+5 por portao), 10o = 100, fora = null', () => {
        expect([1, 2, 3, 9].map(custoSugeridoPortao)).toEqual([10, 15, 20, 50]);
        expect(custoSugeridoPortao(10)).toBe(100);
        [0, -1, 11, NaN, undefined].forEach(n => expect(custoSugeridoPortao(n)).toBeNull());
    });
    it('Nen avancado 15% e demais fixos', () => {
        expect(CUSTO_SUGERIDO_FIXO.nenAvancado).toBe(15);
        expect(CUSTO_SUGERIDO_FIXO.decimoPortao).toBe(100);
        expect(Object.keys(CUSTO_SUGERIDO_CICLO)).toHaveLength(10);
    });
});
