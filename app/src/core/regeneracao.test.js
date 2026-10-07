import { describe, it, expect } from 'vitest';
import { getRegeneracaoManualPct, getRegeneracaoTotalPct, calcularCuraRegeneracao, limitarRegeneracaoPct } from './regeneracao.js';
import { aplicarRegeneracaoDeTurno } from './vitals.js';

describe('regeneração em porcentagem', () => {
    it('usa regeneracaoPct quando existe', () => {
        expect(getRegeneracaoManualPct({ regeneracaoPct: 5, regeneracao: 999 }, 1000)).toBe(5);
    });

    it('converte o valor absoluto antigo em % do teto enquanto não há regeneracaoPct', () => {
        expect(getRegeneracaoManualPct({ regeneracao: 50 }, 1000)).toBe(5);
        expect(getRegeneracaoManualPct({ regeneracao: 50 }, 0)).toBe(0);
        expect(getRegeneracaoManualPct(null, 1000)).toBe(0);
    });

    it('soma o bônus e limita a 100%', () => {
        expect(getRegeneracaoTotalPct({ regeneracaoPct: 5 }, 3, 1000)).toBe(8);
        expect(getRegeneracaoTotalPct({ regeneracaoPct: 90 }, 40, 1000)).toBe(100);
        expect(getRegeneracaoTotalPct({ regeneracaoPct: 5 }, -10, 1000)).toBe(5);
    });

    it('calcula a cura como % do teto', () => {
        expect(calcularCuraRegeneracao(2000, 10)).toBe(200);
        expect(calcularCuraRegeneracao(0, 10)).toBe(0);
        expect(limitarRegeneracaoPct(-3)).toBe(0);
        expect(limitarRegeneracaoPct('abc')).toBe(0);
    });
});

describe('aplicarRegeneracaoDeTurno em %', () => {
    it('cura 10% do máximo por turno e não passa do teto', () => {
        const ficha = { mana: { base: 1000000, mBase: 1, atual: 0, regeneracaoPct: 10 } };
        aplicarRegeneracaoDeTurno(ficha);
        const depois1 = ficha.mana.atual;
        expect(depois1).toBeGreaterThan(0);
        for (let i = 0; i < 30; i++) aplicarRegeneracaoDeTurno(ficha);
        const teto = depois1 * 10;
        expect(ficha.mana.atual).toBeLessThanOrEqual(teto * 1.0001);
        expect(ficha.mana.atual).toBeGreaterThan(depois1);
    });

    it('sem regeneração não cura', () => {
        const ficha = { mana: { base: 1000000, mBase: 1, atual: 0 } };
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.mana.atual).toBe(0);
    });
});
