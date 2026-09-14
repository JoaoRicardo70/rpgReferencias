import { describe, it, expect } from 'vitest';
import {
    LIMIAR_BARRA_VIDA,
    calcularBarrasVida,
    calcularBarrasVidaDummy,
    aplicarEdicaoBarraVida,
} from './vitals';

// ---------------------------------------------------------------------------
// QA (gap adicional) — Break Bars de Vida: casos-limite de entrada não cobertos por
// vitals.barrasVida.test.js (negativos, NaN/undefined/null, floats, totais gigantes com
// dezenas de barras, atual===total exato, atual muito acima do total). O INVARIANTE central
// testado em TODOS os casos: barras.reduce((s,b)=>s+b.max,0) === totalMax (a soma das barras
// nunca infla nem encolhe o total real, nem em condições de entrada "sujas").
// ---------------------------------------------------------------------------

function somaMax(info) {
    return info.barras.reduce((s, b) => s + b.max, 0);
}

function somaAtual(info) {
    return info.barras.reduce((s, b) => s + b.atual, 0);
}

describe('core/vitals - montarBarrasVida (via calcularBarrasVida/calcularBarrasVidaDummy): robustez de entrada', () => {
    it('total negativo -> clampa em 0, 1 barra de max=0, sem lançar', () => {
        const info = calcularBarrasVida(-500000000, 'vida', -50);
        expect(info.totalMax).toBe(0);
        expect(info.numBarras).toBe(1);
        expect(info.barras).toEqual([{ atual: 0, max: 0 }]);
        expect(somaMax(info)).toBe(info.totalMax);
    });

    it('total NaN -> tratado como 0 (Number(NaN)||0 === 0)', () => {
        const info = calcularBarrasVida(NaN, 'vida', NaN);
        expect(info.totalMax).toBe(0);
        expect(info.barras).toEqual([{ atual: 0, max: 0 }]);
        expect(somaMax(info)).toBe(info.totalMax);
    });

    it('total undefined/null -> tratado como 0, sem lançar', () => {
        expect(() => calcularBarrasVida(undefined, 'vida', undefined)).not.toThrow();
        expect(() => calcularBarrasVida(null, 'vida', null)).not.toThrow();
        const infoUndef = calcularBarrasVida(undefined, 'vida', undefined);
        const infoNull = calcularBarrasVida(null, 'vida', null);
        expect(infoUndef.totalMax).toBe(0);
        expect(infoNull.totalMax).toBe(0);
    });

    it('total fracionário (1.000.000.000,5): Number(total)||0 preserva a fração -- vitalidade ainda conta só o 1 bilhão completo, resto (a fração, na FRENTE) fica com a fração', () => {
        const info = calcularBarrasVida(1000000000.5, 'vida', 1000000000.5);
        expect(info.totalMax).toBe(1000000000.5);
        expect(info.numBarras).toBe(2);
        expect(info.barras[0]).toEqual({ atual: 0.5, max: 0.5 });
        expect(info.barras[1]).toEqual({ atual: 1000000000, max: 1000000000 });
        expect(somaMax(info)).toBeCloseTo(info.totalMax, 6);
    });

    // ⚠️ ACHADO DE PERFORMANCE (não corrigido -- fixaria o design de "1 barra por 1 bilhão",
    // fora do escopo desta sessão): totais bem grandes geram muitas barras, e
    // montarBarrasVida constrói um array O(numBarras) com um loop -- em magnitudes extremas
    // isso já estourou o timeout padrão de 5s do Vitest. Um personagem real com Vida bruta
    // ESTÁVEL nessa magnitude congelaria a aba ao tentar desenhar as Break Bars. Cobrindo aqui
    // com uma magnitude bem menor (1e10 -> 10 barras) para não estourar o timeout do teste, mas
    // o comportamento numérico (soma exata) já fica provado; ver nota no relatório de QA sobre o
    // risco de performance em totais maiores.
    it('total grande (1e10, 10 barras): soma das barras continua batendo EXATAMENTE com o total, sem estourar nem perder precisão', () => {
        const total = 1e10; // múltiplo exato de 1e9 -> 10 barras cheias, sem barra fantasma.
        const info = calcularBarrasVida(total, 'vida', total);
        expect(info.numBarras).toBe(10);
        expect(info.totalMax).toBe(total);
        expect(somaMax(info)).toBe(total);
        expect(info.barras[info.barras.length - 1]).toEqual({ atual: 1000000000, max: 1000000000 });
    });

    it('total grande e NÃO múltiplo exato (1e10 + 12345): a PRIMEIRA barra (a da frente) fica com o resto exato', () => {
        const total = 1e10 + 12345;
        const info = calcularBarrasVida(total, 'vida', total);
        expect(info.numBarras).toBe(11);
        expect(info.totalMax).toBe(total);
        expect(somaMax(info)).toBe(total);
        expect(info.barras[0]).toEqual({ atual: 12345, max: 12345 });
        expect(info.barras[info.barras.length - 1]).toEqual({ atual: 1000000000, max: 1000000000 });
    });

    it('[PERF] 1e6 barras (total=1e15) não deveria travar por minutos -- documenta o tempo real de montarBarrasVida numa magnitude extrema (timeout generoso de 20s só para este teste, não representativo de uso normal)', () => {
        const total = 1e15;
        const inicio = Date.now();
        const info = calcularBarrasVida(total, 'vida', total);
        const duracaoMs = Date.now() - inicio;
        expect(info.numBarras).toBe(1e6);
        expect(somaMax(info)).toBe(total);
        // Não é uma trava dura de performance (o app não tem SLA definido para isso) -- só
        // documenta a ordem de grandeza observada, para research futura caso vire um problema real.
        expect(duracaoMs).toBeLessThan(20000);
    }, 25000);

    it('atualTotal exatamente igual ao total: todas as barras ficam cheias (dano=0)', () => {
        const info = calcularBarrasVida(350000000, 'vida', 350000000);
        expect(info.atual).toBe(350000000);
        info.barras.forEach(b => expect(b.atual).toBe(b.max));
        expect(somaAtual(info)).toBe(info.totalMax);
    });

    it('atualTotal MUITO acima do total (ex.: 50x maior): clampa no total, nunca gera "dano negativo" nem ultrapassa 100% em nenhuma barra', () => {
        const info = calcularBarrasVida(150000000, 'vida', 150000000 * 50);
        expect(info.atual).toBe(150000000);
        expect(somaAtual(info)).toBe(info.totalMax);
        info.barras.forEach(b => expect(b.atual).toBeLessThanOrEqual(b.max));
    });

    it('atualTotal negativo E total negativo ao mesmo tempo: ambos clampam em 0 sem lançar', () => {
        expect(() => calcularBarrasVida(-100, 'vida', -100)).not.toThrow();
        const info = calcularBarrasVida(-100, 'vida', -100);
        expect(info.totalMax).toBe(0);
        expect(info.atual).toBe(0);
    });

    it('string numérica como total ainda funciona (Number(total) converte) -- robustez contra dado salvo como string', () => {
        const info = calcularBarrasVida('1500000000', 'vida', '1500000000');
        expect(info.totalMax).toBe(1500000000);
        expect(info.numBarras).toBe(2);
        expect(somaMax(info)).toBe(1500000000);
    });

    it('string não-numérica como total cai no fallback de 0, sem lançar', () => {
        expect(() => calcularBarrasVida('abc', 'vida', 'xyz')).not.toThrow();
        const info = calcularBarrasVida('abc', 'vida', 'xyz');
        expect(info.totalMax).toBe(0);
    });
});

describe('core/vitals - calcularBarrasVidaDummy: mesmos casos-limite do lado dos dummies/NPCs', () => {
    it('hpMax negativo -> 1 barra de max=0', () => {
        const info = calcularBarrasVidaDummy(-100, -100);
        expect(info.totalMax).toBe(0);
        expect(info.barras).toEqual([{ atual: 0, max: 0 }]);
    });

    it('hpMax NaN/undefined -> tratado como 0 sem lançar', () => {
        expect(() => calcularBarrasVidaDummy(NaN, NaN)).not.toThrow();
        expect(() => calcularBarrasVidaDummy(undefined, undefined)).not.toThrow();
        expect(calcularBarrasVidaDummy(NaN, NaN).totalMax).toBe(0);
        expect(calcularBarrasVidaDummy(undefined, undefined).totalMax).toBe(0);
    });

    it('hpMax gigante (1e12) com hpAtual em cascata: invariante soma(max)===hpMax mantido', () => {
        const info = calcularBarrasVidaDummy(1e12, 1e12 - 250000000);
        expect(info.numBarras).toBe(1e3);
        const somaMaxTotal = info.barras.reduce((s, b) => s + b.max, 0);
        expect(somaMaxTotal).toBe(1e12);
        const somaAtualTotal = info.barras.reduce((s, b) => s + b.atual, 0);
        expect(somaAtualTotal).toBe(1e12 - 250000000);
    });

    it('hpAtual negativo (Mestre digita um valor inválido) clampa em 0 em todas as barras', () => {
        const info = calcularBarrasVidaDummy(150000000, -999);
        expect(info.atual).toBe(0);
        info.barras.forEach(b => expect(b.atual).toBe(0));
    });
});

describe('core/vitals - aplicarEdicaoBarraVida: casos-limite adicionais', () => {
    const barras = [{ atual: 100000000, max: 100000000 }, { atual: 30000000, max: 50000000 }];

    it('novoValor negativo clampa em 0 (já coberto o caso de 1 barra só; aqui com múltiplas barras)', () => {
        const total = aplicarEdicaoBarraVida(barras, 50000000, 1, -1000);
        expect(total).toBe(100000000); // barra 0 inalterada (100M) + barra 1 zerada
    });

    it('novoValor como string não-numérica cai no fallback de 0 (Number(novoValor)||0)', () => {
        const total = aplicarEdicaoBarraVida(barras, 50000000, 1, 'abc');
        expect(total).toBe(100000000);
    });

    it('novoValor NaN cai no fallback de 0', () => {
        const total = aplicarEdicaoBarraVida(barras, 50000000, 1, NaN);
        expect(total).toBe(100000000);
    });

    it('editar um índice que não existe no array: nenhuma barra corresponde a "i===indice", soma fica igual à soma original (edição "perdida", sem lançar)', () => {
        const total = aplicarEdicaoBarraVida(barras, 50000000, 99, 40000000);
        expect(total).toBe(130000000); // 100M + 30M, nenhuma barra bateu o índice 99
    });

    it('índice negativo: mesmo comportamento -- nenhuma barra corresponde, soma original preservada', () => {
        const total = aplicarEdicaoBarraVida(barras, 50000000, -1, 999999999);
        expect(total).toBe(130000000);
    });

    it('barras com um único elemento: editar o índice 0 funciona normalmente (regressão trivial, mas confirma que não depende de length>=2)', () => {
        const umaBarra = [{ atual: 40000000, max: 100000000 }];
        const total = aplicarEdicaoBarraVida(umaBarra, 100000000, 0, 75000000);
        expect(total).toBe(75000000);
    });

    it('array de barras vazio: reduce sobre [] retorna 0 (soma vazia), sem lançar', () => {
        expect(() => aplicarEdicaoBarraVida([], 50000000, 0, 40000000)).not.toThrow();
        expect(aplicarEdicaoBarraVida([], 50000000, 0, 40000000)).toBe(0);
    });

    it('barras undefined/null: cai no fallback "(barras || [])", sem lançar', () => {
        expect(() => aplicarEdicaoBarraVida(undefined, 50000000, 0, 40000000)).not.toThrow();
        expect(() => aplicarEdicaoBarraVida(null, 50000000, 0, 40000000)).not.toThrow();
        expect(aplicarEdicaoBarraVida(undefined, 50000000, 0, 40000000)).toBe(0);
    });

    it('mxDessaBarra (2º parâmetro) igual a 0 ou negativo: novoClamp cai em 0 independente do novoValor pedido', () => {
        const total = aplicarEdicaoBarraVida(barras, 0, 1, 999999999);
        expect(total).toBe(100000000); // barra 0 (100M) + barra 1 editada, mas clampada em 0
    });

    it('mxDessaBarra NaN/undefined: fallback "|| 0" também zera o clamp', () => {
        const totalNaN = aplicarEdicaoBarraVida(barras, NaN, 1, 999999999);
        const totalUndef = aplicarEdicaoBarraVida(barras, undefined, 1, 999999999);
        expect(totalNaN).toBe(100000000);
        expect(totalUndef).toBe(100000000);
    });

    it('barras com "atual" corrompido (string/NaN) nas barras NÃO editadas cai no fallback "(Number(b.atual)||0)" em vez de propagar NaN pra soma', () => {
        const barrasCorrompidas = [{ atual: 'lixo', max: 100000000 }, { atual: 30000000, max: 50000000 }];
        const total = aplicarEdicaoBarraVida(barrasCorrompidas, 50000000, 1, 40000000);
        expect(total).toBe(40000000); // barra 0 corrompida vira 0 + barra 1 editada (40M)
        expect(Number.isNaN(total)).toBe(false);
    });
});
