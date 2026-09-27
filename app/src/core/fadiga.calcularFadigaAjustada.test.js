import { describe, it, expect } from 'vitest';
import { calcularFadigaAjustada, calcularFadigaAtual } from './fadiga';

// ---------------------------------------------------------------------------
// QA — core/fadiga.js > calcularFadigaAjustada(ficha, delta)
//
// 👑 AJUSTE MANUAL DE FADIGA PELO MESTRE (aba Mestre > Sandbox da entidade):
// soma/subtrai `delta` pontos percentuais à Fadiga Atual EXIBIDA
// (calcularFadigaAtual, já clampada em 0-100) e devolve o novo
// combate.fadigaExtra, também clampado em 0-100. Parte do valor exibido, não
// do bruto, pra que "-5%" sempre reduza o número que o Mestre está vendo,
// mesmo que fadigaExtra tenha passado de 100 por acúmulo dinâmico.
// ---------------------------------------------------------------------------

function fichaComFadiga(fadigaExtra) {
    return { combate: { fadigaExtra } };
}

describe('core/fadiga.js — calcularFadigaAjustada(ficha, delta)', () => {
    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------
    it('soma um delta positivo à Fadiga Atual', () => {
        const ficha = fichaComFadiga(30);
        expect(calcularFadigaAjustada(ficha, 10)).toBe(40);
    });

    it('subtrai um delta negativo da Fadiga Atual', () => {
        const ficha = fichaComFadiga(30);
        expect(calcularFadigaAjustada(ficha, -10)).toBe(20);
    });

    it('delta = 0 devolve exatamente a Fadiga Atual, sem alterar nada', () => {
        const ficha = fichaComFadiga(42);
        expect(calcularFadigaAjustada(ficha, 0)).toBe(42);
    });

    it('aceita delta como string numérica (Number(delta) converte antes do clamp)', () => {
        const ficha = fichaComFadiga(30);
        expect(calcularFadigaAjustada(ficha, '10')).toBe(40);
        expect(calcularFadigaAjustada(ficha, '-5')).toBe(25);
    });

    // -----------------------------------------------------------------------
    // Clamp em 0-100
    // -----------------------------------------------------------------------
    it('clampa em 100 quando o delta positivo estoura o teto', () => {
        const ficha = fichaComFadiga(95);
        expect(calcularFadigaAjustada(ficha, 20)).toBe(100);
    });

    it('clampa em 0 quando o delta negativo estoura o piso', () => {
        const ficha = fichaComFadiga(5);
        expect(calcularFadigaAjustada(ficha, -20)).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Edge case: parte do valor EXIBIDO (já clampado), não do bruto acima de 100
    // -----------------------------------------------------------------------
    it('com combate.fadigaExtra > 100 (acúmulo dinâmico passou do teto), parte do valor EXIBIDO (100) — delta positivo continua clampado em 100, não soma em cima do bruto', () => {
        const ficha = fichaComFadiga(150);
        expect(calcularFadigaAtual(ficha)).toBe(100); // valor exibido já clampado
        expect(calcularFadigaAjustada(ficha, 10)).toBe(100);
    });

    it('com combate.fadigaExtra > 100, um delta negativo reduz a partir do valor EXIBIDO (100), não do bruto (150) — "-10" desce pra 90, não pra 140', () => {
        const ficha = fichaComFadiga(150);
        expect(calcularFadigaAjustada(ficha, -10)).toBe(90);
    });

    // -----------------------------------------------------------------------
    // delta não-finito: devolve a Fadiga Atual sem alterar
    // -----------------------------------------------------------------------
    it('delta = NaN devolve a Fadiga Atual inalterada', () => {
        const ficha = fichaComFadiga(30);
        expect(calcularFadigaAjustada(ficha, NaN)).toBe(30);
    });

    it('delta = undefined devolve a Fadiga Atual inalterada', () => {
        const ficha = fichaComFadiga(30);
        expect(calcularFadigaAjustada(ficha, undefined)).toBe(30);
    });

    it('delta = null devolve a Fadiga Atual inalterada (Number(null) é 0, valor finito — soma 0)', () => {
        // Number(null) === 0, que É finito -- este caso soma 0, não é o branch de "não-finito".
        const ficha = fichaComFadiga(30);
        expect(calcularFadigaAjustada(ficha, null)).toBe(30);
    });

    it('delta = Infinity devolve a Fadiga Atual inalterada (não estoura pra além de 100 silenciosamente)', () => {
        const ficha = fichaComFadiga(30);
        expect(calcularFadigaAjustada(ficha, Infinity)).toBe(30);
    });

    it('delta = -Infinity devolve a Fadiga Atual inalterada', () => {
        const ficha = fichaComFadiga(30);
        expect(calcularFadigaAjustada(ficha, -Infinity)).toBe(30);
    });

    it('delta = string não-numérica ("abc") devolve a Fadiga Atual inalterada', () => {
        const ficha = fichaComFadiga(30);
        expect(calcularFadigaAjustada(ficha, 'abc')).toBe(30);
    });

    // -----------------------------------------------------------------------
    // Edge cases de ficha
    // -----------------------------------------------------------------------
    it('ficha sem combate.fadigaExtra (Fadiga Atual = 0) soma normalmente a partir de 0', () => {
        expect(calcularFadigaAjustada({}, 15)).toBe(15);
    });

    it('ficha = null (Fadiga Atual = 0) não lança e soma normalmente a partir de 0', () => {
        expect(() => calcularFadigaAjustada(null, 15)).not.toThrow();
        expect(calcularFadigaAjustada(null, 15)).toBe(15);
    });

    it('ficha = null com delta negativo clampa em 0, não fica negativo', () => {
        expect(calcularFadigaAjustada(null, -15)).toBe(0);
    });

    it('ficha = undefined não lança', () => {
        expect(() => calcularFadigaAjustada(undefined, 10)).not.toThrow();
        expect(calcularFadigaAjustada(undefined, 10)).toBe(10);
    });
});
