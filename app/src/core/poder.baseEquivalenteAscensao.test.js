import { describe, it, expect } from 'vitest';
import { getBaseEquivalenteAscensao, calcularPoderAtual } from './poder';

// ==========================================================================
// getBaseEquivalenteAscensao — cada Ascensão Base manual acima de 1 tem que
// valer exatamente 100 de Prestígio de Base equivalente em cada categoria
// (na mesma escala de handleTabelaChange/getBasePFor), pra "resetar" o
// Prestígio ao subir a Ascensão Base nunca derrubar o Poder Calculado.
// ==========================================================================

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

function fichaBase({ ascensaoBase, vida, energia, statusAttr, statusPrestigioAplicado, divisores }) {
    const ficha = {
        ascensaoBase,
        multiplicadorForcaAscensao: 1,
        multiplicadorForcaPrestigio: 1,
        divisores: divisores || { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 1,
        supressaoPoder: 100,
        limiteSupressao: 1,
        statusPrestigioAplicado,
        vida: criarStat(vida),
        mana: criarStat(energia),
        aura: criarStat(energia),
        chakra: criarStat(energia),
        corpo: criarStat(energia),
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(statusAttr); });
    return ficha;
}

describe('core/poder - getBaseEquivalenteAscensao (função pura)', () => {
    it('retorna 0 quando ascensaoBase <= 1 (1, 0, negativo, ausente)', () => {
        const div = { vida: 1 };
        expect(getBaseEquivalenteAscensao({ ascensaoBase: 1, divisores: div }, 'vida')).toBe(0);
        expect(getBaseEquivalenteAscensao({ ascensaoBase: 0, divisores: div }, 'vida')).toBe(0);
        expect(getBaseEquivalenteAscensao({ ascensaoBase: -5, divisores: div }, 'vida')).toBe(0);
        expect(getBaseEquivalenteAscensao({ divisores: div }, 'vida')).toBe(0);
    });

    it('retorna 0 para chaves desconhecidas (ex: "forca")', () => {
        expect(getBaseEquivalenteAscensao({ ascensaoBase: 3 }, 'forca')).toBe(0);
        expect(getBaseEquivalenteAscensao({ ascensaoBase: 3 }, 'inexistente')).toBe(0);
    });

    it('retorna 0 para ficha null/undefined', () => {
        expect(getBaseEquivalenteAscensao(null, 'vida')).toBe(0);
        expect(getBaseEquivalenteAscensao(undefined, 'vida')).toBe(0);
    });

    it('divisor ausente/zero/negativo cai no fallback 1 (mesmo padrão de getBasePFor)', () => {
        const semDivisor = getBaseEquivalenteAscensao({ ascensaoBase: 2 }, 'vida');
        const divisorZero = getBaseEquivalenteAscensao({ ascensaoBase: 2, divisores: { vida: 0 } }, 'vida');
        const divisorUm = getBaseEquivalenteAscensao({ ascensaoBase: 2, divisores: { vida: 1 } }, 'vida');
        // niveisManuais=1, mult vida=1e6 => floor((1*100/1)*1e6) = 1e8
        expect(semDivisor).toBe(100000000);
        expect(divisorZero).toBe(100000000);
        expect(divisorUm).toBe(100000000);
    });

    it('calcula o valor correto por categoria (vida, mana/aura/chakra/corpo) em Ascensão Base 2; Status não soma (Ascender não tira dos atributos)', () => {
        const ficha = { ascensaoBase: 2, divisores: { vida: 1, mana: 1, aura: 1, chakra: 1, corpo: 1, status: 1 } };
        expect(getBaseEquivalenteAscensao(ficha, 'vida')).toBe(100 * 1000000);
        expect(getBaseEquivalenteAscensao(ficha, 'mana')).toBe(100 * 10000000);
        expect(getBaseEquivalenteAscensao(ficha, 'aura')).toBe(100 * 10000000);
        expect(getBaseEquivalenteAscensao(ficha, 'chakra')).toBe(100 * 10000000);
        expect(getBaseEquivalenteAscensao(ficha, 'corpo')).toBe(100 * 10000000);
        expect(getBaseEquivalenteAscensao(ficha, 'status')).toBe(0);
    });

    it('escala linearmente com o número de níveis manuais (ascensaoBase - 1)', () => {
        const ficha3 = { ascensaoBase: 4, divisores: { vida: 1 } }; // 3 níveis manuais
        expect(getBaseEquivalenteAscensao(ficha3, 'vida')).toBe(3 * 100 * 1000000);
    });

    it('respeita o divisor da categoria (divide o valor bruto antes de multiplicar)', () => {
        const ficha = { ascensaoBase: 2, divisores: { vida: 2 } };
        // niveisManuais=1: floor((100/2) * 1e6) = 50 * 1e6
        expect(getBaseEquivalenteAscensao(ficha, 'vida')).toBe(50000000);
    });
});

describe('core/poder - calcularPoderAtual: reposição de Base ao subir Ascensão Base (regressão)', () => {
    it('A1+134 (antes de ascender) e A2+34 (depois de "resetar" o Prestígio) dão o MESMO Poder (ou o resetado é maior)', () => {
        const antesDeAscender = fichaBase({
            ascensaoBase: 1,
            vida: 134000000,        // 134 * 1e6
            energia: 1260000000,    // 126 * 1e7
            statusAttr: 130000,     // 130 * 1000
            statusPrestigioAplicado: 130,
        });

        const depoisDeAscender = fichaBase({
            ascensaoBase: 2,
            vida: 34000000,         // 34 * 1e6  (134 - 100)
            energia: 260000000,     // 26 * 1e7  (126 - 100)
            statusAttr: 130000,     // Ascender NÃO tira dos atributos o que o pool de Status já deu
            statusPrestigioAplicado: 30,
        });

        const poderAntes = calcularPoderAtual(antesDeAscender, 1).poderGlobal;
        const poderDepois = calcularPoderAtual(depoisDeAscender, 1).poderGlobal;

        expect(poderDepois).toBeGreaterThanOrEqual(poderAntes);
        // Neste cenário controlado (sem buffs/glob/mUnico) os dois pipelines deveriam
        // produzir exatamente o mesmo poderBase e a mesma Ascensão Geral Efetiva.
        expect(poderDepois).toBe(poderAntes);
    });

    it('A2 com Prestígio 0 em tudo é >= A1 com Prestígio 100 em tudo (bug antigo: caía pra ~20)', () => {
        const a1prestigio100 = fichaBase({
            ascensaoBase: 1,
            vida: 100000000,       // 100 * 1e6
            energia: 1000000000,   // 100 * 1e7
            statusAttr: 100000,    // 100 * 1000
            statusPrestigioAplicado: 100,
        });

        const a2prestigio0 = fichaBase({
            ascensaoBase: 2,
            vida: 0,
            energia: 0,
            statusAttr: 100000,    // atributos intactos ao Ascender
            statusPrestigioAplicado: 0,
        });

        const poderA1 = calcularPoderAtual(a1prestigio100, 1).poderGlobal;
        const poderA2 = calcularPoderAtual(a2prestigio0, 1).poderGlobal;

        expect(poderA2).toBeGreaterThanOrEqual(poderA1);
        // Não pode ter desabado pra uma ordem de grandeza muito menor (era o bug reportado).
        expect(poderA2).toBeGreaterThan(poderA1 * 0.5);
    });

    it('continuar ganhando Prestígio depois de ascender sempre soma poder (monotônico)', () => {
        const base = (vidaExtra) => fichaBase({
            ascensaoBase: 2,
            vida: 34000000 + vidaExtra,
            energia: 260000000,
            statusAttr: 30000,
            statusPrestigioAplicado: 30,
        });

        const poder0 = calcularPoderAtual(base(0), 1).poderGlobal;
        const poder1 = calcularPoderAtual(base(1000000), 1).poderGlobal;
        const poder2 = calcularPoderAtual(base(5000000), 1).poderGlobal;

        expect(poder1).toBeGreaterThan(poder0);
        expect(poder2).toBeGreaterThan(poder1);
    });

    it('ascensaoBase 1 nunca soma equivalente (mantém compatibilidade retroativa com fichas antigas)', () => {
        const ficha = fichaBase({
            ascensaoBase: 1,
            vida: 50000000,
            energia: 500000000,
            statusAttr: 50000,
            statusPrestigioAplicado: 50,
        });
        // Sem equivalente somado: getEfetivoBase(vida) já é o valor puro da ficha.
        expect(getBaseEquivalenteAscensao(ficha, 'vida')).toBe(0);
        expect(getBaseEquivalenteAscensao(ficha, 'status')).toBe(0);
        const { poderGlobal } = calcularPoderAtual(ficha, 1);
        expect(poderGlobal).toBeGreaterThan(0);
    });

    it('exemplo do usuário: A4 + 5 em tudo é MAIS FORTE que A3 + 95 em tudo', () => {
        const a3p95 = fichaBase({ ascensaoBase: 3, vida: 95000000, energia: 950000000, statusAttr: 95000, statusPrestigioAplicado: 95 });
        const a4p5 = fichaBase({ ascensaoBase: 4, vida: 5000000, energia: 50000000, statusAttr: 95000, statusPrestigioAplicado: 5 });
        expect(calcularPoderAtual(a4p5, 1).poderGlobal).toBeGreaterThan(calcularPoderAtual(a3p95, 1).poderGlobal);
    });

    it('Ascender (A1 + 100 em tudo -> A2 + 1 em tudo, atributos intactos) nunca diminui o Poder', () => {
        const antes = fichaBase({ ascensaoBase: 1, vida: 100000000, energia: 1000000000, statusAttr: 100000, statusPrestigioAplicado: 100 });
        const depois = fichaBase({ ascensaoBase: 2, vida: 1000000, energia: 10000000, statusAttr: 100000, statusPrestigioAplicado: 1 });
        expect(calcularPoderAtual(depois, 1).poderGlobal).toBeGreaterThanOrEqual(calcularPoderAtual(antes, 1).poderGlobal);
    });
});
