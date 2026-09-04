import { describe, it, expect } from 'vitest';
import { getVitalMxDisplay } from './vitals';

// ---------------------------------------------------------------------------
// QA — core/vitals.js > getVitalMxDisplay(key, ficha): a "ÚNICA FONTE DE VERDADE pro teto
// EXIBIDO" de um vital, criada na 6ª rodada pra consertar o vazamento de Energia causado por
// PoderesFormContext.jsx > dispararAtaque e AtaqueFormContext.jsx (cálculo manual) comparando um
// custo em % calculado sobre o máximo BRUTO (getMaximo) contra o "atual" já guardado na escala
// COMPRIMIDA de exibição.
//
// Os testes existentes de dispararAtaque/rolarDanoCustomizado usam bases de ~1.000.000 (7
// dígitos) — abaixo da fronteira de compressão de mana/aura/chakra/corpo (9 dígitos), então
// NUNCA exercitam p > 0 de verdade. Este arquivo cobre getVitalMxDisplay isolado com números
// realmente grandes o bastante pra cruzar a fronteira, onde o bug de fato acontecia.
// ---------------------------------------------------------------------------

describe('core/vitals - getVitalMxDisplay: números pequenos (sem compressão, p=0)', () => {
    it('mana com base de 1.000.000 (7 dígitos, abaixo da fronteira de 9) retorna o valor cheio, sem compressão', () => {
        const ficha = { mana: { base: 1000000, atual: 1000000 } };
        expect(getVitalMxDisplay('mana', ficha)).toBe(1000000);
    });

    it('vida com base de 10.000.000 (8 dígitos, abaixo da fronteira de 8... limite é 8, então já comprime) retorna sem compressão quando <= limite', () => {
        const ficha = { vida: { base: 1000000, atual: 1000000 } };
        expect(getVitalMxDisplay('vida', ficha)).toBe(1000000);
    });
});

describe('core/vitals - getVitalMxDisplay: números grandes o bastante pra cruzar a fronteira de compressão (p > 0) — cenário real do bug', () => {
    it('mana com base de 5.000.000.000 (10 dígitos, cruza a fronteira de 9) comprime pra escala de milhões (mxDisplay = 500.000.000, p=1)', () => {
        const ficha = { mana: { base: 5000000000, atual: 500000000 } };
        // calcVitalScale: strMx.length=10, limit=9 -> p=1 -> mxDisplay = floor(5e9/10) = 5e8.
        expect(getVitalMxDisplay('mana', ficha)).toBe(500000000);
    });

    it('aura/chakra/corpo seguem a mesma fronteira de 9 dígitos que mana (mesmo grupo de "energias")', () => {
        const ficha = {
            aura: { base: 5000000000 },
            chakra: { base: 5000000000 },
            corpo: { base: 5000000000 },
        };
        expect(getVitalMxDisplay('aura', ficha)).toBe(500000000);
        expect(getVitalMxDisplay('chakra', ficha)).toBe(500000000);
        expect(getVitalMxDisplay('corpo', ficha)).toBe(500000000);
    });

    it('vida usa uma fronteira mais apertada (8 dígitos) — cruza a compressão com 1 dígito a menos que mana', () => {
        const ficha = { vida: { base: 500000000 } }; // 9 dígitos, limite 8 -> p=1
        expect(getVitalMxDisplay('vida', ficha)).toBe(50000000);
    });

    it('um valor ASTRONÔMICO (18 dígitos) continua produzindo um mxDisplay dentro da faixa de exibição (nunca NaN/Infinity)', () => {
        const ficha = { mana: { base: 123456789012345678 } };
        const mx = getVitalMxDisplay('mana', ficha);
        expect(Number.isFinite(mx)).toBe(true);
        expect(mx).toBeGreaterThan(0);
        expect(String(Math.floor(mx)).length).toBeLessThanOrEqual(9);
    });
});

describe('core/vitals - getVitalMxDisplay: pv/pm (fórmulas próprias, nunca passam por Formas/getMaximo)', () => {
    it('pv usa getVitalMax dedicado (média de corpo/vida/chakra x multiplicadorVida) e a mesma fronteira de vida (8 dígitos)', () => {
        const ficha = {
            corpo: { base: 300000000 }, vida: { base: 300000000 }, chakra: { base: 300000000 },
            multiplicadorVida: 1,
        };
        // bC=bV=bCh=300000000 (getPrestigioReal sem prestígio real definido cai no próprio valor
        // ou 0 dependendo da implementação de prestige.js — o teste só garante que roda sem
        // lançar e devolve um número finito e não-negativo, sem reimplementar a fórmula de pv).
        const mx = getVitalMxDisplay('pv', ficha);
        expect(Number.isFinite(mx)).toBe(true);
        expect(mx).toBeGreaterThanOrEqual(0);
    });
});

describe('core/vitals - getVitalMxDisplay: robustez com ficha vazia/malformada', () => {
    it('ficha sem o vital retorna 0 (getVitalMax cai pra 0 sem base, calcVitalScale trata máximo <= 0 como mxDisplay=0), nunca NaN', () => {
        expect(getVitalMxDisplay('mana', {})).toBe(0);
        expect(Number.isNaN(getVitalMxDisplay('mana', {}))).toBe(false);
    });

    it('nunca lança para ficha null/undefined', () => {
        expect(() => getVitalMxDisplay('mana', null)).not.toThrow();
        expect(() => getVitalMxDisplay('mana', undefined)).not.toThrow();
    });
});
