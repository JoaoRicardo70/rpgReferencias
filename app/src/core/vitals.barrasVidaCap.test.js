import { describe, it, expect } from 'vitest';
import {
    LIMIAR_BARRA_VIDA,
    MAX_BARRAS_VIDA_MONTADAS,
    calcularBarrasVida,
    calcularBarrasVidaDummy,
} from './vitals';

// ---------------------------------------------------------------------------
// QA — trava de render de montarBarrasVida (usada por calcularBarrasVida e
// calcularBarrasVidaDummy): Vida astronômica gera muito mais "barras lógicas"
// (numBarras) do que a tela pode montar individualmente sem travar — só as
// primeiras MAX_BARRAS_VIDA_MONTADAS-1 são montadas uma a uma, e a última
// AGREGA todo o resto. A soma dos "max" das barras montadas deve sempre bater
// com o total real (nunca infla/encolhe a Vida do personagem), e o dano deve
// continuar sendo consumido da barra da FRENTE (índice 0) primeiro.
// ---------------------------------------------------------------------------

describe('core/vitals - calcularBarrasVida: cap de render em MAX_BARRAS_VIDA_MONTADAS', () => {
    const rawMx = 500 * LIMIAR_BARRA_VIDA; // 500 barras lógicas, múltiplo exato do limiar (resto=0)

    it('numBarras real é 500, mas o array de barras é limitado a MAX_BARRAS_VIDA_MONTADAS (100)', () => {
        const { numBarras, barras } = calcularBarrasVida(rawMx, 'vida', rawMx);
        expect(numBarras).toBe(500);
        expect(barras.length).toBe(MAX_BARRAS_VIDA_MONTADAS);
        expect(barras.length).toBe(100);
    });

    it('cheio (atual == total): soma dos max == total, soma dos atual == atual (== total)', () => {
        const { totalMax, atual, barras } = calcularBarrasVida(rawMx, 'vida', rawMx);
        const somaMax = barras.reduce((s, b) => s + b.max, 0);
        const somaAtual = barras.reduce((s, b) => s + b.atual, 0);
        expect(totalMax).toBe(rawMx);
        expect(somaMax).toBe(rawMx);
        expect(atual).toBe(rawMx);
        expect(somaAtual).toBe(atual);
    });

    it('dano pela metade: soma dos max == total, soma dos atual == atual', () => {
        const atualTotal = rawMx / 2;
        const { totalMax, atual, barras } = calcularBarrasVida(rawMx, 'vida', atualTotal);
        const somaMax = barras.reduce((s, b) => s + b.max, 0);
        const somaAtual = barras.reduce((s, b) => s + b.atual, 0);
        expect(totalMax).toBe(rawMx);
        expect(somaMax).toBe(rawMx);
        expect(atual).toBe(atualTotal);
        expect(somaAtual).toBe(atual);
    });

    it('zerado (atual == 0): soma dos max == total, soma dos atual == 0', () => {
        const { totalMax, atual, barras } = calcularBarrasVida(rawMx, 'vida', 0);
        const somaMax = barras.reduce((s, b) => s + b.max, 0);
        const somaAtual = barras.reduce((s, b) => s + b.atual, 0);
        expect(totalMax).toBe(rawMx);
        expect(somaMax).toBe(rawMx);
        expect(atual).toBe(0);
        expect(somaAtual).toBe(0);
    });

    it('a barra da FRENTE (índice 0) leva dano primeiro: dano menor que 1 barra só afeta a barra 0', () => {
        const danoPequeno = LIMIAR_BARRA_VIDA / 2; // metade de uma única barra
        const atualTotal = rawMx - danoPequeno;
        const { barras } = calcularBarrasVida(rawMx, 'vida', atualTotal);

        expect(barras[0].atual).toBe(LIMIAR_BARRA_VIDA - danoPequeno);
        // todas as demais barras montadas continuam cheias (nenhum dano chegou nelas ainda).
        for (let i = 1; i < barras.length; i++) {
            expect(barras[i].atual).toBe(barras[i].max);
        }
    });

    it('com <= 100 barras lógicas, comportamento não muda: length == numBarras, sem agregação', () => {
        const rawMxPequeno = 50 * LIMIAR_BARRA_VIDA; // 50 barras, abaixo do cap
        const { numBarras, barras, totalMax } = calcularBarrasVida(rawMxPequeno, 'vida', rawMxPequeno);
        expect(numBarras).toBe(50);
        expect(barras.length).toBe(50);
        expect(barras.length).toBe(numBarras);
        const somaMax = barras.reduce((s, b) => s + b.max, 0);
        expect(somaMax).toBe(totalMax);
        expect(totalMax).toBe(rawMxPequeno);
    });

    it('exatamente no cap (100 barras lógicas): ainda sem agregação, length == 100 == numBarras', () => {
        const rawMxCap = MAX_BARRAS_VIDA_MONTADAS * LIMIAR_BARRA_VIDA;
        const { numBarras, barras } = calcularBarrasVida(rawMxCap, 'vida', rawMxCap);
        expect(numBarras).toBe(100);
        expect(barras.length).toBe(100);
    });
});

describe('core/vitals - calcularBarrasVidaDummy: mesmo cap de render aplicado a dummies/NPCs', () => {
    const hpMaxBruto = 500 * LIMIAR_BARRA_VIDA;

    it('numBarras real é 500, array de barras limitado a 100, soma dos max == hpMax configurado', () => {
        const { numBarras, totalMax, barras } = calcularBarrasVidaDummy(hpMaxBruto, hpMaxBruto);
        expect(numBarras).toBe(500);
        expect(barras.length).toBe(MAX_BARRAS_VIDA_MONTADAS);
        expect(totalMax).toBe(hpMaxBruto);
        const somaMax = barras.reduce((s, b) => s + b.max, 0);
        expect(somaMax).toBe(hpMaxBruto);
    });

    it('dano pela metade preserva soma dos atual == atual total', () => {
        const hpAtual = hpMaxBruto / 2;
        const { atual, barras } = calcularBarrasVidaDummy(hpMaxBruto, hpAtual);
        const somaAtual = barras.reduce((s, b) => s + b.atual, 0);
        expect(atual).toBe(hpAtual);
        expect(somaAtual).toBe(hpAtual);
    });

    it('sem cap (<= 100 barras lógicas): comportamento inalterado, length == numBarras', () => {
        const hpMaxPequeno = 10 * LIMIAR_BARRA_VIDA;
        const { numBarras, barras } = calcularBarrasVidaDummy(hpMaxPequeno, hpMaxPequeno);
        expect(numBarras).toBe(10);
        expect(barras.length).toBe(10);
    });
});
