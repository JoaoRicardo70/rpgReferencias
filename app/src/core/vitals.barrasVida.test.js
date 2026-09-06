import { describe, it, expect } from 'vitest';
import {
    getNumBarrasVida,
    calcularBarrasVida,
    calcularBarrasVidaDummy,
    getTetoVida,
    aplicarEdicaoBarraVida,
} from './vitals.js';

// ---------------------------------------------------------------------------
// QA — Múltiplas Barras de Vida (core/vitals.js)
//
// getNumBarrasVida/calcularBarrasVida/calcularBarrasVidaDummy/getTetoVida/
// aplicarEdicaoBarraVida: a cada ponto de Vitalidade (o "p" de calcVitalScale)
// Vida ganha mais uma barra cheia. "atual" continua sendo um ÚNICO total
// guardado (0..totalMax); as barras são só DERIVADAS dele. A barra da FRENTE
// (índice 0) esvazia primeiro com dano, o excesso transborda pra próxima.
// ---------------------------------------------------------------------------

describe('core/vitals - getNumBarrasVida', () => {
    it('p=0 (sem escala/Vitalidade) -> 1 barra, igual ao comportamento antigo de barra única', () => {
        expect(getNumBarrasVida(0)).toBe(1);
    });

    it('p=1 -> 2 barras', () => {
        expect(getNumBarrasVida(1)).toBe(2);
    });

    it('p=3 -> 4 barras (1 barra a mais por ponto de Vitalidade)', () => {
        expect(getNumBarrasVida(3)).toBe(4);
    });

    it('p negativo é tratado como 0 -> mínimo de 1 barra (nunca 0 barras)', () => {
        expect(getNumBarrasVida(-5)).toBe(1);
    });

    it('p undefined/null/NaN cai no fallback de 0 -> 1 barra', () => {
        expect(getNumBarrasVida(undefined)).toBe(1);
        expect(getNumBarrasVida(null)).toBe(1);
        expect(getNumBarrasVida(NaN)).toBe(1);
    });

    it('p como string numérica é convertido corretamente (Number(p))', () => {
        expect(getNumBarrasVida('2')).toBe(3);
    });
});

describe('core/vitals - getTetoVida', () => {
    it('para chaves que não são "vida" (mana/aura/chakra/corpo/pv/pm), o teto é idêntico ao mxDisplay de uma barra só', () => {
        // base = 1e8 (9 dígitos), limite=9 para mana -> sem compressão -> mxDisplay = 1e8.
        expect(getTetoVida(100000000, 'mana')).toBe(100000000);
        expect(getTetoVida(100000000, 'pv')).toBe(getTetoVida(100000000, 'pv')); // idempotente
    });

    it('para "vida", o teto é a SOMA de todas as barras (mxDisplay * numBarras), não uma barra só', () => {
        // vida usa limite=8 dígitos; base=1e8 (9 dígitos) -> p=1 -> mxDisplay=floor(1e8/10)=1e7,
        // numBarras = getNumBarrasVida(1) = 2 -> teto = 2e7.
        expect(getTetoVida(100000000, 'vida')).toBe(20000000);
    });

    it('rawMx=0 -> teto 0 (calcVitalScale já retorna mxDisplay=0 nesse caso)', () => {
        expect(getTetoVida(0, 'vida')).toBe(0);
        expect(getTetoVida(0, 'mana')).toBe(0);
    });

    it('rawMx negativo é tratado como "sem máximo" (calcVitalScale: rawMx<=0) -> teto 0', () => {
        expect(getTetoVida(-100, 'vida')).toBe(0);
    });

    it('rawMx NaN -> teto 0, sem lançar', () => {
        expect(() => getTetoVida(NaN, 'vida')).not.toThrow();
        expect(getTetoVida(NaN, 'vida')).toBe(0);
    });

    it('rawMxParaEscala decide a escala/numBarras, mas rawMx continua sendo o numerador do mxDisplay', () => {
        // rawMx completo (com Formas) = 5e8 (9 dígitos, decidiria p=1 sozinho),
        // mas rawMxParaEscala (estável, sem Formas) = 1e7 (8 dígitos) -> p=0 -> 1 barra só.
        const teto = getTetoVida(500000000, 'vida', 10000000);
        // p=0 -> mxDisplay = floor(rawMx/1) = 500000000, numBarras=1 -> teto = 500000000.
        expect(teto).toBe(500000000);
    });
});

describe('core/vitals - calcularBarrasVida: happy path / numBarras=1 (paridade com o comportamento antigo de barra única)', () => {
    it('sem cruzar a fronteira de dígitos (p=0), retorna exatamente 1 barra com o mesmo atual/max de sempre', () => {
        // base pequena (100, 3 dígitos) -> p=0 -> 1 barra só.
        const r = calcularBarrasVida(100, 'vida', 80);
        expect(r.numBarras).toBe(1);
        expect(r.p).toBe(0);
        expect(r.mxDisplay).toBe(100);
        expect(r.totalMax).toBe(100);
        expect(r.atual).toBe(80);
        expect(r.barras).toEqual([{ atual: 80, max: 100 }]);
    });

    it('mana/aura/chakra/corpo/pv/pm NUNCA ganham mais de 1 barra, mesmo cruzando a fronteira de dígitos que daria múltiplas barras em "vida"', () => {
        ['mana', 'aura', 'chakra', 'corpo', 'pv', 'pm'].forEach((key) => {
            const r = calcularBarrasVida(100000000, key, 50000000);
            expect(r.numBarras).toBe(1);
            expect(r.barras.length).toBe(1);
        });
    });

    it('atualTotal ausente (undefined) -> assume o total cheio (todas as barras cheias)', () => {
        const r = calcularBarrasVida(100000000, 'vida', undefined);
        expect(r.numBarras).toBe(2);
        expect(r.atual).toBe(r.totalMax);
        expect(r.barras.every(b => b.atual === b.max)).toBe(true);
    });

    it('atualTotal null -> mesmo fallback: total cheio', () => {
        const r = calcularBarrasVida(100000000, 'vida', null);
        expect(r.atual).toBe(r.totalMax);
    });

    it('atualTotal string vazia -> mesmo fallback: total cheio', () => {
        const r = calcularBarrasVida(100000000, 'vida', '');
        expect(r.atual).toBe(r.totalMax);
    });

    it('atualTotal NaN (string não numérica) -> mesmo fallback: total cheio', () => {
        const r = calcularBarrasVida(100000000, 'vida', 'abacate');
        expect(r.atual).toBe(r.totalMax);
    });
});

describe('core/vitals - calcularBarrasVida: múltiplas barras, dano esvazia a FRENTE (índice 0) primeiro, com cascata', () => {
    // base=1e8 (9 dígitos) -> vida com limite 8 -> p=1 -> mxDisplay=1e7, numBarras=2, totalMax=2e7.
    it('dano parcial (dentro da 1ª barra): só a barra 0 é afetada, a barra 1 continua cheia', () => {
        const r = calcularBarrasVida(100000000, 'vida', 15000000); // dano total = 5e6
        expect(r.numBarras).toBe(2);
        expect(r.barras[0]).toEqual({ atual: 5000000, max: 10000000 }); // barra da frente já tomou o dano
        expect(r.barras[1]).toEqual({ atual: 10000000, max: 10000000 }); // barra de trás intacta
    });

    it('dano exatamente igual ao tamanho de 1 barra: barra 0 zera exatamente, barra 1 permanece cheia (limite exato, sem cascata)', () => {
        const r = calcularBarrasVida(100000000, 'vida', 10000000); // atual = exatamente 1 barra restante
        expect(r.barras[0]).toEqual({ atual: 0, max: 10000000 });
        expect(r.barras[1]).toEqual({ atual: 10000000, max: 10000000 });
    });

    it('dano que ultrapassa 1 barra transborda (cascata) para a barra seguinte', () => {
        const r = calcularBarrasVida(100000000, 'vida', 8000000); // total restante = 8e6, dano=12e6
        // barra 0 zerada (dano de 1e7 já esgota ela), sobra 2e6 de dano pra barra 1.
        expect(r.barras[0]).toEqual({ atual: 0, max: 10000000 });
        expect(r.barras[1]).toEqual({ atual: 8000000, max: 10000000 });
    });

    it('atual=0 (todas as barras vazias): "derrotado" continua sendo simplesmente atual<=0', () => {
        const r = calcularBarrasVida(100000000, 'vida', 0);
        expect(r.atual).toBe(0);
        expect(r.barras.every(b => b.atual === 0)).toBe(true);
    });

    it('3+ barras (cruzando 2 fronteiras de dígitos): cascata atravessa múltiplas barras corretamente', () => {
        // base com 10 dígitos -> p=2 (limite 8) -> numBarras=3, mxDisplay = floor(base/100).
        const base = 1000000000; // 10 dígitos -> p=2 -> mxDisplay=10000000, numBarras=3, totalMax=30000000
        const r = calcularBarrasVida(base, 'vida', 4000000); // dano total = 26000000
        expect(r.numBarras).toBe(3);
        expect(r.totalMax).toBe(30000000);
        // barra 0 (0..1e7 de dano) zera; barra 1 (1e7..2e7) zera; barra 2 recebe o resto (6e6 de dano)
        // restando 4e6.
        expect(r.barras[0]).toEqual({ atual: 0, max: 10000000 });
        expect(r.barras[1]).toEqual({ atual: 0, max: 10000000 });
        expect(r.barras[2]).toEqual({ atual: 4000000, max: 10000000 });
    });
});

describe('core/vitals - calcularBarrasVida: clamp e robustez', () => {
    it('atualTotal excedendo o novo teto (ex.: perdeu uma barra por queda de Vitalidade) é clampado no totalMax', () => {
        const r = calcularBarrasVida(100000000, 'vida', 999999999);
        expect(r.atual).toBe(r.totalMax);
        expect(r.barras.every(b => b.atual === b.max)).toBe(true);
    });

    it('atualTotal negativo é clampado em 0 (nunca vida negativa)', () => {
        const r = calcularBarrasVida(100000000, 'vida', -500);
        expect(r.atual).toBe(0);
        expect(r.barras.every(b => b.atual === 0)).toBe(true);
    });

    it('rawMx=0 -> totalMax=0, atual=0, e ainda assim retorna numBarras>=1 barras com max=0 sem lançar', () => {
        expect(() => calcularBarrasVida(0, 'vida', 100)).not.toThrow();
        const r = calcularBarrasVida(0, 'vida', 100);
        expect(r.totalMax).toBe(0);
        expect(r.atual).toBe(0);
        expect(r.barras.length).toBe(r.numBarras);
        expect(r.barras.every(b => b.max === 0 && b.atual === 0)).toBe(true);
    });

    it('rawMx negativo não lança e se comporta como "sem máximo" (mesmo tratamento de calcVitalScale)', () => {
        expect(() => calcularBarrasVida(-100, 'vida', 50)).not.toThrow();
        const r = calcularBarrasVida(-100, 'vida', 50);
        expect(r.totalMax).toBe(0);
    });

    it('rawMx NaN não lança', () => {
        expect(() => calcularBarrasVida(NaN, 'vida', 50)).not.toThrow();
    });
});

describe('core/vitals - aplicarEdicaoBarraVida', () => {
    it('edita uma barra específica e recalcula o novo total somando as demais inalteradas', () => {
        const barras = [{ atual: 5000000, max: 10000000 }, { atual: 10000000, max: 10000000 }];
        const novoTotal = aplicarEdicaoBarraVida(barras, 10000000, 0, 8000000);
        expect(novoTotal).toBe(8000000 + 10000000);
    });

    it('clampa o novo valor editado no mxDisplay (não deixa uma barra exceder seu próprio máximo)', () => {
        const barras = [{ atual: 5000000, max: 10000000 }, { atual: 3000000, max: 10000000 }];
        const novoTotal = aplicarEdicaoBarraVida(barras, 10000000, 1, 99999999);
        expect(novoTotal).toBe(5000000 + 10000000); // barra 1 clampada em mxDisplay
    });

    it('clampa valores negativos em 0', () => {
        const barras = [{ atual: 5000000, max: 10000000 }, { atual: 3000000, max: 10000000 }];
        const novoTotal = aplicarEdicaoBarraVida(barras, 10000000, 0, -500);
        expect(novoTotal).toBe(0 + 3000000);
    });

    it('valor não numérico (NaN) é tratado como 0', () => {
        const barras = [{ atual: 5000000, max: 10000000 }];
        const novoTotal = aplicarEdicaoBarraVida(barras, 10000000, 0, 'não-numero');
        expect(novoTotal).toBe(0);
    });

    it('array de barras vazio/undefined não lança e retorna 0', () => {
        expect(() => aplicarEdicaoBarraVida([], 10000000, 0, 500)).not.toThrow();
        expect(aplicarEdicaoBarraVida([], 10000000, 0, 500)).toBe(0);
        expect(() => aplicarEdicaoBarraVida(undefined, 10000000, 0, 500)).not.toThrow();
        expect(aplicarEdicaoBarraVida(undefined, 10000000, 0, 500)).toBe(0);
    });

    it('índice fora do range simplesmente não edita nenhuma barra existente (soma tudo como estava)', () => {
        const barras = [{ atual: 5000000, max: 10000000 }, { atual: 3000000, max: 10000000 }];
        const novoTotal = aplicarEdicaoBarraVida(barras, 10000000, 99, 1000000);
        expect(novoTotal).toBe(5000000 + 3000000);
    });

    it('mxDisplay undefined/0 clampa qualquer edição em 0', () => {
        const barras = [{ atual: 0, max: 0 }];
        expect(aplicarEdicaoBarraVida(barras, 0, 0, 500)).toBe(0);
        expect(aplicarEdicaoBarraVida(barras, undefined, 0, 500)).toBe(0);
    });
});

describe('core/vitals - calcularBarrasVidaDummy: happy path / numBarras=1', () => {
    it('hpMax com poucos dígitos (sem cruzar a fronteira de 9) -> 1 barra só, mxPorBarra = hpMax', () => {
        const r = calcularBarrasVidaDummy(500, 300);
        expect(r.numBarras).toBe(1);
        expect(r.p).toBe(0);
        expect(r.mxPorBarra).toBe(500);
        expect(r.totalMax).toBe(500);
        expect(r.atual).toBe(300);
        expect(r.barras).toEqual([{ atual: 300, max: 500 }]);
    });

    it('hpAtualTotal ausente -> assume hpMax cheio', () => {
        const r = calcularBarrasVidaDummy(1000, undefined);
        expect(r.atual).toBe(1000);
        expect(r.barras[0].atual).toBe(1000);
    });

    it('hpMax=0 -> tudo zerado, sem lançar', () => {
        expect(() => calcularBarrasVidaDummy(0, 0)).not.toThrow();
        const r = calcularBarrasVidaDummy(0, 0);
        expect(r.totalMax).toBe(0);
        expect(r.numBarras).toBe(1); // getNumBarrasVida(0) = 1 mínimo
        expect(r.mxPorBarra).toBe(0);
        expect(r.barras).toEqual([{ atual: 0, max: 0 }]);
    });

    it('hpMax negativo é tratado como 0 (Math.max(0, ...))', () => {
        const r = calcularBarrasVidaDummy(-500, 100);
        expect(r.totalMax).toBe(0);
    });

    it('hpMax/hpAtual NaN não lançam', () => {
        expect(() => calcularBarrasVidaDummy(NaN, NaN)).not.toThrow();
        expect(() => calcularBarrasVidaDummy('abc', 'def')).not.toThrow();
    });
});

describe('core/vitals - calcularBarrasVidaDummy: múltiplas barras, REPARTE o hpMax literal (sem compressão) e cascata de dano igual a calcularBarrasVida', () => {
    it('hpMax com 9 dígitos (cruza a fronteira) ganha 2 barras, cada uma com metade EXATA do hpMax (sem escala 10^p)', () => {
        // 9 dígitos -> p = max(0, 9-8) = 1 -> numBarras=2. mxPorBarra = floor(1e8/2) = 5e7 (não 1e7!).
        const r = calcularBarrasVidaDummy(100000000, 100000000);
        expect(r.numBarras).toBe(2);
        expect(r.mxPorBarra).toBe(50000000);
        expect(r.totalMax).toBe(100000000); // o hpMax digitado pelo Mestre NUNCA é inflado/reduzido
        expect(r.barras).toEqual([{ atual: 50000000, max: 50000000 }, { atual: 50000000, max: 50000000 }]);
    });

    it('hpMax não divisível igualmente pelo número de barras usa Math.floor (nunca fracionário)', () => {
        const r = calcularBarrasVidaDummy(100000001, 100000001); // 9 dígitos -> 2 barras
        expect(r.mxPorBarra).toBe(Math.floor(100000001 / 2));
        expect(Number.isInteger(r.mxPorBarra)).toBe(true);
    });

    it('dano parcial esvazia a barra da FRENTE (índice 0) primeiro, com cascata pra barra seguinte', () => {
        const r = calcularBarrasVidaDummy(100000000, 60000000); // mxPorBarra=5e7, dano total=4e7
        expect(r.barras[0]).toEqual({ atual: 10000000, max: 50000000 });
        expect(r.barras[1]).toEqual({ atual: 50000000, max: 50000000 }); // intacta
    });

    it('dano que ultrapassa a 1ª barra transborda pra 2ª (cascata)', () => {
        const r = calcularBarrasVidaDummy(100000000, 20000000); // dano total=8e7
        expect(r.barras[0]).toEqual({ atual: 0, max: 50000000 });
        expect(r.barras[1]).toEqual({ atual: 20000000, max: 50000000 });
    });

    it('hpAtualTotal excedendo hpMax é clampado no hpMax (nunca overheal)', () => {
        const r = calcularBarrasVidaDummy(1000, 999999);
        expect(r.atual).toBe(1000);
    });

    it('hpAtualTotal negativo é clampado em 0', () => {
        const r = calcularBarrasVidaDummy(1000, -50);
        expect(r.atual).toBe(0);
        expect(r.barras.every(b => b.atual === 0)).toBe(true);
    });

    it('hpAtualTotal=0 com múltiplas barras: todas ficam vazias (derrotado)', () => {
        const r = calcularBarrasVidaDummy(100000000, 0);
        expect(r.atual).toBe(0);
        expect(r.barras.every(b => b.atual === 0)).toBe(true);
    });
});
