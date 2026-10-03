import { describe, it, expect } from 'vitest';
import { danoExibidoParaBruto, FATOR_EXIBICAO_VITAIS } from './vitals';

// danoExibidoParaBruto converte o dano (escala EXIBIDA, a do feed/tela) para a escala BRUTA da Vida
// (hpAtual de dummy e vida.atual de jogador): x FATOR_EXIBICAO_VITAIS, piso 0, teto Number.MAX_VALUE.

describe('danoExibidoParaBruto - caminho feliz', () => {
    it('multiplica o dano exibido por FATOR_EXIBICAO_VITAIS (1000)', () => {
        expect(FATOR_EXIBICAO_VITAIS).toBe(1000);
        expect(danoExibidoParaBruto(1)).toBe(1000);
        expect(danoExibidoParaBruto(110)).toBe(110000);
    });
    it('aceita decimais', () => {
        expect(danoExibidoParaBruto(0.5)).toBe(500);
        expect(danoExibidoParaBruto(2.5)).toBe(2500);
    });
    it('aceita valores muito grandes que ainda cabem em double', () => {
        expect(danoExibidoParaBruto(1e12)).toBe(1e15);
    });
    it('aceita numero em formato de texto', () => {
        expect(danoExibidoParaBruto('40')).toBe(40000);
    });
    it('subtrair o resultado de uma Vida bruta tira o numero exibido de Vida', () => {
        const hpBruto = 100 * FATOR_EXIBICAO_VITAIS;
        expect(hpBruto - danoExibidoParaBruto(40)).toBe(60 * FATOR_EXIBICAO_VITAIS);
    });
});

describe('danoExibidoParaBruto - bordas', () => {
    it('zero continua zero', () => {
        expect(danoExibidoParaBruto(0)).toBe(0);
    });
    it('dano negativo vira 0 (nunca cura por engano)', () => {
        expect(danoExibidoParaBruto(-50)).toBe(0);
        expect(danoExibidoParaBruto(-0.001)).toBe(0);
    });
    it('menos zero nao vaza como -0 negativo util', () => {
        expect(danoExibidoParaBruto(-0)).toBe(0);
    });
    it('dano minusculo continua positivo', () => {
        expect(danoExibidoParaBruto(1e-6)).toBeCloseTo(0.001, 10);
    });
    it('resultado que estoura o double (multiplicacao vira Infinity) devolve Number.MAX_VALUE', () => {
        expect(danoExibidoParaBruto(Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
        expect(danoExibidoParaBruto(1e306)).toBe(Number.MAX_VALUE);
    });
});

describe('danoExibidoParaBruto - entradas invalidas', () => {
    it('Infinity devolve Number.MAX_VALUE', () => {
        expect(danoExibidoParaBruto(Infinity)).toBe(Number.MAX_VALUE);
    });
    it('-Infinity vira 0', () => {
        expect(danoExibidoParaBruto(-Infinity)).toBe(0);
    });
    it('NaN, undefined, null e texto invalido viram 0', () => {
        expect(danoExibidoParaBruto(NaN)).toBe(0);
        expect(danoExibidoParaBruto(undefined)).toBe(0);
        expect(danoExibidoParaBruto(null)).toBe(0);
        expect(danoExibidoParaBruto('abc')).toBe(0);
        expect(danoExibidoParaBruto('')).toBe(0);
    });
    it('nunca devolve valor nao finito nem negativo', () => {
        [Infinity, -Infinity, NaN, -1, 0, 1, 1e308].forEach(v => {
            const r = danoExibidoParaBruto(v);
            expect(Number.isFinite(r)).toBe(true);
            expect(r).toBeGreaterThanOrEqual(0);
        });
    });
});
