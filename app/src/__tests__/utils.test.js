import { describe, it, expect } from 'vitest';
import { contarDigitos, tratarUnico, pegarDoisPrimeirosDigitos, isFisico, isEnergia, migrarPassivasParaPoderes } from '../core/utils.js';

// ==========================================
// contarDigitos
// ==========================================
describe('contarDigitos', () => {
    it('returns correct digits for small numbers', () => {
        expect(contarDigitos(1)).toBe(1);
        expect(contarDigitos(9)).toBe(1);
        expect(contarDigitos(10)).toBe(2);
        expect(contarDigitos(99)).toBe(2);
        expect(contarDigitos(100)).toBe(3);
        expect(contarDigitos(999)).toBe(3);
    });

    it('returns correct digits for large numbers', () => {
        expect(contarDigitos(1000000)).toBe(7);
        expect(contarDigitos(100000000)).toBe(9);
        expect(contarDigitos(1e21)).toBe(22); // key bug fix test
        expect(contarDigitos(9.99e20)).toBe(21);
    });

    it('returns 1 for zero, negative, NaN, Infinity', () => {
        expect(contarDigitos(0)).toBe(1);
        expect(contarDigitos(-5)).toBe(1);
        expect(contarDigitos(NaN)).toBe(1);
        expect(contarDigitos(Infinity)).toBe(1);
        expect(contarDigitos(-Infinity)).toBe(1);
    });
});

// ==========================================
// tratarUnico
// ==========================================
describe('tratarUnico', () => {
    it('parses comma-separated multipliers', () => {
        expect(tratarUnico("2.0,3.0")).toEqual([2.0, 3.0]);
        expect(tratarUnico("1.5")).toEqual([1.5]);
    });

    it('handles whitespace around values', () => {
        expect(tratarUnico(" 2.0 , 3.0 ")).toEqual([2.0, 3.0]);
    });

    it('returns [1.0] for falsy/empty/invalid input', () => {
        expect(tratarUnico(null)).toEqual([1.0]);
        expect(tratarUnico(undefined)).toEqual([1.0]);
        expect(tratarUnico("")).toEqual([1.0]);
        expect(tratarUnico("abc")).toEqual([1.0]);
    });

    it('filters out non-numeric entries', () => {
        expect(tratarUnico("2.0,abc,3.0")).toEqual([2.0, 3.0]);
    });

    it('handles numeric input (not string)', () => {
        expect(tratarUnico(5)).toEqual([5]);
    });
});

// ==========================================
// pegarDoisPrimeirosDigitos
// ==========================================
describe('pegarDoisPrimeirosDigitos', () => {
    it('returns number itself for 1-2 digit numbers', () => {
        expect(pegarDoisPrimeirosDigitos(5)).toBe(5);
        expect(pegarDoisPrimeirosDigitos(42)).toBe(42);
        expect(pegarDoisPrimeirosDigitos(99)).toBe(99);
    });

    it('returns first two digits for larger numbers', () => {
        expect(pegarDoisPrimeirosDigitos(12345)).toBe(12);
        expect(pegarDoisPrimeirosDigitos(987654)).toBe(98);
        expect(pegarDoisPrimeirosDigitos(100000)).toBe(100); // special case: starts with 100
    });

    it('returns 100 for exact 100', () => {
        expect(pegarDoisPrimeirosDigitos(100)).toBe(100);
    });

    it('returns 0 for zero/falsy', () => {
        expect(pegarDoisPrimeirosDigitos(0)).toBe(0);
        expect(pegarDoisPrimeirosDigitos(null)).toBe(0);
        expect(pegarDoisPrimeirosDigitos(undefined)).toBe(0);
    });

    it('handles negative numbers (uses abs)', () => {
        expect(pegarDoisPrimeirosDigitos(-42)).toBe(42);
        expect(pegarDoisPrimeirosDigitos(-12345)).toBe(12);
    });
});

// ==========================================
// isFisico
// ==========================================
describe('isFisico', () => {
    it('returns true for all physical stats', () => {
        const fisicos = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaesp', 'carisma', 'stamina', 'constituicao'];
        fisicos.forEach(s => expect(isFisico(s)).toBe(true));
    });

    it('is case-insensitive', () => {
        expect(isFisico('FORCA')).toBe(true);
        expect(isFisico('Destreza')).toBe(true);
    });

    it('returns false for energy stats', () => {
        expect(isFisico('mana')).toBe(false);
        expect(isFisico('aura')).toBe(false);
        expect(isFisico('chakra')).toBe(false);
    });

    it('returns false for unknown stats', () => {
        expect(isFisico('vida')).toBe(false);
        expect(isFisico('xyz')).toBe(false);
    });
});

// ==========================================
// isEnergia
// ==========================================
describe('isEnergia', () => {
    it('returns true for all energy stats', () => {
        const energias = ['mana', 'aura', 'chakra', 'corpo'];
        energias.forEach(s => expect(isEnergia(s)).toBe(true));
    });

    it('is case-insensitive', () => {
        expect(isEnergia('MANA')).toBe(true);
        expect(isEnergia('Aura')).toBe(true);
    });

    it('returns false for physical stats', () => {
        expect(isEnergia('forca')).toBe(false);
        expect(isEnergia('destreza')).toBe(false);
    });

    it('returns false for vida and unknown', () => {
        expect(isEnergia('vida')).toBe(false);
        expect(isEnergia('xyz')).toBe(false);
    });
});

// ==========================================
// migrarPassivasParaPoderes
// ==========================================
describe('migrarPassivasParaPoderes', () => {
    it('retorna array vazio para entrada vazia, nula ou nao-array', () => {
        expect(migrarPassivasParaPoderes([])).toEqual([]);
        expect(migrarPassivasParaPoderes(null)).toEqual([]);
        expect(migrarPassivasParaPoderes(undefined)).toEqual([]);
        expect(migrarPassivasParaPoderes('nao e array')).toEqual([]);
    });

    it('converte uma passiva legada num poder categoria "habilidade", inativo, com os efeitos em efeitosPassivos', () => {
        const passivas = [{ nome: 'Instinto Superior', tipo: 'Habilidade', efeitos: [
            { nome: 'Bonus Dano', atributo: 'dano', propriedade: 'mgeral', valor: 50 },
            { nome: 'Bonus Status', atributo: 'todos_status', propriedade: 'mgeral', valor: 40 },
        ] }];

        const [migrado] = migrarPassivasParaPoderes(passivas);

        expect(migrado.nome).toBe('Instinto Superior');
        expect(migrado.categoria).toBe('habilidade');
        expect(migrado.ativa).toBe(false);
        expect(migrado.efeitos).toEqual([]);
        expect(migrado.efeitosPassivos).toEqual(passivas[0].efeitos);
        expect(typeof migrado.id).toBe('string');
        expect(migrado.id.length).toBeGreaterThan(0);
    });

    it('gera um id unico para cada item migrado, mesmo com nomes repetidos', () => {
        const passivas = [{ nome: 'A', efeitos: [] }, { nome: 'A', efeitos: [] }];
        const [a, b] = migrarPassivasParaPoderes(passivas);
        expect(a.id).not.toBe(b.id);
    });

    it('trata item sem nome ou sem efeitos sem lancar erro', () => {
        const [migrado] = migrarPassivasParaPoderes([{}]);
        expect(migrado.nome).toBe('Habilidade sem nome');
        expect(migrado.efeitosPassivos).toEqual([]);
    });

    it('trata efeitos malformados (nao-array) como efeitosPassivos vazio, sem lancar erro', () => {
        expect(migrarPassivasParaPoderes([{ nome: 'X', efeitos: 'nao e array' }])[0].efeitosPassivos).toEqual([]);
        expect(migrarPassivasParaPoderes([{ nome: 'Y', efeitos: { a: 1 } }])[0].efeitosPassivos).toEqual([]);
        expect(migrarPassivasParaPoderes([{ nome: 'Z', efeitos: null }])[0].efeitosPassivos).toEqual([]);
    });

    it('gera ids que nao colidem mesmo entre chamadas separadas no mesmo milissegundo', () => {
        // Regressao: o id antigo era só `legado_passiva_${Date.now()}_${i}`, que colide
        // se a função for chamada duas vezes com o mesmo índice dentro do mesmo ms
        // (ex: duas execuções de carregarDadosFicha em sequência rápida, antes do
        // persist-back salvar a ficha migrada e esvaziar ficha.passivas).
        const passivas = [{ nome: 'A', efeitos: [] }];
        const idsGerados = new Set();
        for (let i = 0; i < 200; i++) {
            idsGerados.add(migrarPassivasParaPoderes(passivas)[0].id);
        }
        expect(idsGerados.size).toBe(200);
    });
});
