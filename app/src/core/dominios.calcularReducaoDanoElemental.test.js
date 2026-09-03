import { describe, it, expect } from 'vitest';
import { calcularReducaoDanoElemental } from './dominios';

// ---------------------------------------------------------------------------
// QA — core/dominios.js > calcularReducaoDanoElemental(nivelDefensor, nivelAtacante)
//
// Redução de DANO (não Fadiga — isso é getFracaoResistenciaElemental) baseada no Domínio
// RELATIVO entre defensor e atacante nesse elemento. A vantagem do defensor só existe na medida
// em que ele SUPERA o Domínio de quem golpeou — um golpe vindo de um Domínio igual ou maior
// atravessa sem nenhuma redução (0%). Teto de redução: 0.75 (75%) no caso extremo (defensor 10,
// atacante 0).
// ---------------------------------------------------------------------------

describe('core/dominios - calcularReducaoDanoElemental: sem vantagem (atacante >= defensor)', () => {
    it('defensor e atacante no mesmo nível -> 0% de redução, não importa o nível', () => {
        expect(calcularReducaoDanoElemental(5, 5)).toBe(0);
        expect(calcularReducaoDanoElemental(10, 10)).toBe(0);
        expect(calcularReducaoDanoElemental(0, 0)).toBe(0);
    });

    it('atacante com Domínio MAIOR que o defensor -> 0% de redução (o golpe atravessa por completo)', () => {
        expect(calcularReducaoDanoElemental(3, 7)).toBe(0);
        expect(calcularReducaoDanoElemental(0, 10)).toBe(0);
        expect(calcularReducaoDanoElemental(5, 5.5)).toBe(0);
    });
});

describe('core/dominios - calcularReducaoDanoElemental: vantagem real do defensor', () => {
    it('defensor no teto (10) contra atacante sem Domínio nenhum (0) -> redução MÁXIMA (75%)', () => {
        expect(calcularReducaoDanoElemental(10, 0)).toBeCloseTo(0.75, 6);
    });

    it('vantagem de metade da escala (defensor 5, atacante 0) -> metade da redução máxima (37.5%)', () => {
        expect(calcularReducaoDanoElemental(5, 0)).toBeCloseTo(0.375, 6);
    });

    it('vantagem parcial (defensor 8, atacante 3 -> vantagem de 5) produz a mesma redução que defensor 5 vs atacante 0 (só a DIFERENÇA importa, não os valores absolutos)', () => {
        const a = calcularReducaoDanoElemental(8, 3);
        const b = calcularReducaoDanoElemental(5, 0);
        expect(a).toBeCloseTo(b, 6);
        expect(a).toBeCloseTo(0.375, 6);
    });

    it('vantagem mínima (defensor 1, atacante 0) produz uma redução pequena, porém não-zero', () => {
        const r = calcularReducaoDanoElemental(1, 0);
        expect(r).toBeGreaterThan(0);
        expect(r).toBeCloseTo(0.075, 6); // 1/10 * 0.75
    });
});

describe('core/dominios - calcularReducaoDanoElemental: clamps e robustez', () => {
    it('níveis fora do intervalo [0,10] são clampados antes do cálculo (>10 vira 10, negativo vira 0)', () => {
        expect(calcularReducaoDanoElemental(999, 0)).toBeCloseTo(0.75, 6); // clampa pra 10
        expect(calcularReducaoDanoElemental(-5, 0)).toBe(0); // clampa pra 0 -> sem vantagem
        expect(calcularReducaoDanoElemental(10, -20)).toBeCloseTo(0.75, 6); // atacante clampado pra 0
    });

    it('valores não-numéricos (undefined/NaN/string inválida) caem no fallback 0 pra ambos os lados, sem lançar', () => {
        expect(() => calcularReducaoDanoElemental(undefined, undefined)).not.toThrow();
        expect(calcularReducaoDanoElemental(undefined, undefined)).toBe(0);
        expect(calcularReducaoDanoElemental('abc', 'xyz')).toBe(0);
        expect(calcularReducaoDanoElemental(null, null)).toBe(0);
    });

    it('a redução nunca ultrapassa 0.75, mesmo em combinações extremas', () => {
        const r = calcularReducaoDanoElemental(10, -999);
        expect(r).toBeLessThanOrEqual(0.75);
    });

    it('a redução nunca é negativa', () => {
        expect(calcularReducaoDanoElemental(0, 10)).toBeGreaterThanOrEqual(0);
        expect(calcularReducaoDanoElemental(-10, 10)).toBeGreaterThanOrEqual(0);
    });
});
