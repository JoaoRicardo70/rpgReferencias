import { describe, it, expect } from 'vitest';
import { calcularReducaoFadigaPorRegeneracao } from './fadiga';

// ---------------------------------------------------------------------------
// QA — core/fadiga.js > calcularReducaoFadigaPorRegeneracao(fracoesCuradas)
//
// Pedido do usuário: Regenerações de Vida/Energia (ativas OU passivas, ver
// core/vitals.js > aplicarRegeneracaoDeTurno) devem retirar acúmulos de Fadiga durante o
// combate. Esta função é o cálculo puro do DESCONTO: recebe a lista de "quanto do teto
// exibido de cada vital foi recuperado neste turno" (0-1 por vital que de fato regenerou) e
// devolve quantos pontos percentuais de Fadiga descontar — a MÉDIA dessas frações vezes o peso
// máximo (10, mesma ordem de grandeza do peso de ganho PESO_MAX_DINAMICO_PADRAO=15).
// ---------------------------------------------------------------------------

describe('core/fadiga - calcularReducaoFadigaPorRegeneracao: sem cura nenhuma', () => {
    it('lista vazia não desconta nada', () => {
        expect(calcularReducaoFadigaPorRegeneracao([])).toBe(0);
    });

    it('null/undefined não lançam e não descontam nada', () => {
        expect(() => calcularReducaoFadigaPorRegeneracao(null)).not.toThrow();
        expect(calcularReducaoFadigaPorRegeneracao(null)).toBe(0);
        expect(calcularReducaoFadigaPorRegeneracao(undefined)).toBe(0);
    });

    it('todas as frações em 0 (regen configurada mas sem efeito real) não desconta nada', () => {
        expect(calcularReducaoFadigaPorRegeneracao([0, 0, 0])).toBe(0);
    });
});

describe('core/fadiga - calcularReducaoFadigaPorRegeneracao: desconto proporcional à cura', () => {
    it('curar um único vital do zero ao teto (fração 1) desconta o peso máximo inteiro (10)', () => {
        expect(calcularReducaoFadigaPorRegeneracao([1])).toBeCloseTo(10, 6);
    });

    it('curar metade do teto de um único vital (fração 0.5) desconta metade do peso máximo (5)', () => {
        expect(calcularReducaoFadigaPorRegeneracao([0.5])).toBeCloseTo(5, 6);
    });

    it('múltiplos vitais curados usam a MÉDIA das frações, não a soma', () => {
        // média de [1, 0] = 0.5 -> desconto = 5, não 10.
        expect(calcularReducaoFadigaPorRegeneracao([1, 0])).toBeCloseTo(5, 6);
        // média de [1, 1, 0, 0] = 0.5 -> desconto = 5.
        expect(calcularReducaoFadigaPorRegeneracao([1, 1, 0, 0])).toBeCloseTo(5, 6);
    });

    it('curar todos os vitais totalmente (todas frações 1) desconta o peso máximo inteiro, não mais que isso', () => {
        expect(calcularReducaoFadigaPorRegeneracao([1, 1, 1, 1, 1])).toBeCloseTo(10, 6);
    });
});

describe('core/fadiga - calcularReducaoFadigaPorRegeneracao: clamps e robustez', () => {
    it('frações acima de 1 (nunca deveriam ocorrer, mas por segurança) são clampadas antes da média', () => {
        expect(calcularReducaoFadigaPorRegeneracao([5])).toBeCloseTo(10, 6); // clampa em 1 antes de multiplicar
    });

    it('frações negativas são tratadas como 0, nunca aumentam a Fadiga', () => {
        expect(calcularReducaoFadigaPorRegeneracao([-1])).toBe(0);
        expect(calcularReducaoFadigaPorRegeneracao([-1, 1])).toBeCloseTo(5, 6); // média de [0, 1]
    });

    it('valores não numéricos (NaN/undefined dentro do array) são tratados como 0, nunca lançam', () => {
        expect(() => calcularReducaoFadigaPorRegeneracao([NaN, 1])).not.toThrow();
        expect(calcularReducaoFadigaPorRegeneracao([NaN, 1])).toBeCloseTo(5, 6);
    });

    it('nunca retorna um valor negativo, mesmo com entradas hostis', () => {
        const r = calcularReducaoFadigaPorRegeneracao([-999, -5, NaN]);
        expect(r).toBeGreaterThanOrEqual(0);
    });
});
