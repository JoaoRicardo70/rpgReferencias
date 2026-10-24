import { describe, it, expect } from 'vitest';
import { slugDoPlano, rotuloDoPlano } from './planos';

describe('slugDoPlano', () => {
    it.each([
        ['Plano da Água', 'plano-da-agua'],
        ['Plano do Éter', 'plano-do-eter'],
        ['Céus', 'ceus'],
        ['Inferno', 'inferno'],
        ['Terra 0 (Runeterra)', 'terra-0-runeterra'],
        ['Plano do Caos Inferior', 'plano-do-caos-inferior'],
    ])('%s -> %s', (entrada, esperado) => {
        expect(slugDoPlano(entrada)).toBe(esperado);
    });

    it('colapsa espacos/simbolos repetidos e remove hifens nas pontas', () => {
        expect(slugDoPlano('  --Plano   do  Fogo!! ')).toBe('plano-do-fogo');
        expect(slugDoPlano('(A)')).toBe('a');
    });

    it('vazio, null e undefined viram string vazia', () => {
        expect(slugDoPlano('')).toBe('');
        expect(slugDoPlano(null)).toBe('');
        expect(slugDoPlano(undefined)).toBe('');
        expect(slugDoPlano('!!!')).toBe('');
    });

    it('numeros sao convertidos; 0 vira string vazia (falsy)', () => {
        expect(slugDoPlano(42)).toBe('42');
        expect(slugDoPlano(0)).toBe('');
    });

    it('caracteres nao latinos sao descartados', () => {
        expect(slugDoPlano('火の Plano')).toBe('plano');
    });
});

describe('rotuloDoPlano', () => {
    it('quebra a linha antes do parentese', () => {
        expect(rotuloDoPlano('Terra 0 (Runeterra)')).toBe('Terra 0\n(Runeterra)');
    });
    it('nomes sem parentese ficam iguais', () => {
        expect(rotuloDoPlano('Plano do Fogo')).toBe('Plano do Fogo');
    });
    it('vazio/null/undefined viram string vazia', () => {
        expect(rotuloDoPlano('')).toBe('');
        expect(rotuloDoPlano(null)).toBe('');
        expect(rotuloDoPlano(undefined)).toBe('');
    });
    it('so troca a primeira ocorrencia de " ("', () => {
        expect(rotuloDoPlano('A (b) (c)')).toBe('A\n(b) (c)');
    });
});
