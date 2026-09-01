import { describe, it, expect } from 'vitest';
import { calcularGanhoFadigaDinamico, calcularFadigaAtual } from './fadiga';
import { getBuffs, getMaximo } from './attributes.js';

// ---------------------------------------------------------------------------
// QA — Fadiga de Combate dinâmica (core/fadiga.js)
//
// calcularGanhoFadigaDinamico(ficha) soma 3 fatores independentes (0..1 cada):
//   1) getFatorEnergiaGasta — média de "1 - atual/max" em mana/aura/chakra/corpo
//   2) getFatorVidaPerdida  — "1 - vida.atual/vidaMax", clamped 0..1
//   3) getFatorFormasAtivas — soma de (mFormas_efetivo - 1) nos eixos
//      vida/mana/aura/chakra/corpo/status, clamped 0..1
// e multiplica a média dos 3 por PESO_MAX_DINAMICO (15).
//
// calcularFadigaAtual(ficha) = clamp(0,100, fadigaTurnos*fadigaPorTurno + fadigaExtra).
// ---------------------------------------------------------------------------

// Base "cheia" (100% de energia/vida, sem nenhuma Forma ativa): usada como esqueleto para os
// testes isolarem só o fator que estão de fato exercitando.
function fichaCheia(overrides = {}) {
    return {
        vida: { base: 1000000, atual: 1000000 },
        mana: { base: 1000000, atual: 1000000 },
        aura: { base: 1000000, atual: 1000000 },
        chakra: { base: 1000000, atual: 1000000 },
        corpo: { base: 1000000, atual: 1000000 },
        forca: { base: 1000000 },
        poderes: [],
        inventario: [],
        passivas: [],
        seresSelados: [],
        combate: {},
        ...overrides,
    };
}

describe('core/fadiga - getFatorEnergiaGasta (via calcularGanhoFadigaDinamico isolado)', () => {
    it('100% de energia gasta (as 4 energias zeradas) satura o fator de energia em 1 (ganho = 15/3 = 5)', () => {
        const ficha = fichaCheia({
            mana: { base: 1000000, atual: 0 },
            aura: { base: 1000000, atual: 0 },
            chakra: { base: 1000000, atual: 0 },
            corpo: { base: 1000000, atual: 0 },
        });
        const ganho = calcularGanhoFadigaDinamico(ficha);
        expect(ganho).toBeCloseTo(5, 6); // (1 + 0 + 0) / 3 * 15
    });

    it('50% de energia gasta em todas as 4 energias produz fator 0.5 (ganho = 2.5)', () => {
        const ficha = fichaCheia({
            mana: { base: 1000000, atual: 500000 },
            aura: { base: 1000000, atual: 500000 },
            chakra: { base: 1000000, atual: 500000 },
            corpo: { base: 1000000, atual: 500000 },
        });
        const ganho = calcularGanhoFadigaDinamico(ficha);
        expect(ganho).toBeCloseTo(2.5, 6);
    });

    it('0% de energia gasta (todas as energias cheias) produz fator 0 (ganho = 0)', () => {
        const ficha = fichaCheia();
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('só uma das 4 energias presente/válida — a média considera só os pools com max > 0', () => {
        const ficha = fichaCheia({ mana: { base: 1000000, atual: 0 } });
        delete ficha.aura;
        delete ficha.chakra;
        delete ficha.corpo;
        const ganho = calcularGanhoFadigaDinamico(ficha);
        // Só "mana" conta (100% gasta) -> fatorEnergia = 1 -> ganho = 1/3 * 15 = 5.
        expect(ganho).toBeCloseTo(5, 6);
    });

    it('nenhum pool de energia com max válido (base=0 em todos) -> fator de energia = 0, sem lançar', () => {
        const ficha = fichaCheia({
            mana: { base: 0, atual: 0 },
            aura: { base: 0, atual: 0 },
            chakra: { base: 0, atual: 0 },
            corpo: { base: 0, atual: 0 },
        });
        expect(() => calcularGanhoFadigaDinamico(ficha)).not.toThrow();
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('energia.atual ausente (undefined) é tratado como pool cheio (fallback de segurança), não como 100% gasto', () => {
        const ficha = fichaCheia({ mana: { base: 1000000 } }); // sem "atual"
        delete ficha.aura;
        delete ficha.chakra;
        delete ficha.corpo;
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });
});

describe('core/fadiga - getFatorVidaPerdida (via calcularGanhoFadigaDinamico isolado)', () => {
    it('vida zerada (100% perdida) satura o fator de vida em 1 (ganho = 5)', () => {
        const ficha = fichaCheia({ vida: { base: 1000000, atual: 0 } });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('vida pela metade produz fator 0.5 (ganho = 2.5)', () => {
        const ficha = fichaCheia({ vida: { base: 1000000, atual: 500000 } });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(2.5, 6);
    });

    it('vida cheia produz fator 0 (ganho = 0)', () => {
        const ficha = fichaCheia();
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('sem objeto "vida" na ficha -> fator de vida = 0, sem lançar', () => {
        const ficha = fichaCheia();
        delete ficha.vida;
        expect(() => calcularGanhoFadigaDinamico(ficha)).not.toThrow();
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('vida com max <= 0 (base=0) -> fator de vida = 0', () => {
        const ficha = fichaCheia({ vida: { base: 0, atual: 0 } });
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });
});

describe('core/fadiga - getFatorFormasAtivas (via calcularGanhoFadigaDinamico isolado)', () => {
    it('mFormas exatamente 1 (Forma "cosmética", sem multiplicar nada) não gera desgaste nenhum', () => {
        const ficha = fichaCheia({ vida: { base: 1000000, atual: 1000000, mFormas: 1.0 } });
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('mFormas abaixo de 1 (ex.: 0.5, uma redução) não conta como desgaste (só soma quando v > 1)', () => {
        const ficha = fichaCheia({ vida: { base: 1000000, atual: 1000000, mFormas: 0.5 } });
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('mFormas=2 num único eixo (vida) contribui com (2-1)=1 de fator, saturando o fator de Formas em 1 (ganho=5)', () => {
        // mFormas também escala o MÁXIMO calculado do vital (getMaximo usa mFormas no
        // multiplicador) — "atual" é ajustado para acompanhar o novo máximo (2x a base) pra
        // isolar só o fator de Formas, sem introduzir um fator de "vida perdida" de tabela.
        const ficha = fichaCheia({ vida: { base: 1000000, atual: 2000000, mFormas: 2 } });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('mFormas muito alto (ex.: 50) num único eixo satura o fator de Formas em 1 — nunca ultrapassa o teto (ganho=5)', () => {
        const ficha = fichaCheia({ mana: { base: 1000000, atual: 50000000, mFormas: 50 } });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('mFormas ativo no eixo "status" usa a âncora "forca" (não um campo "status" literal)', () => {
        const ficha = fichaCheia({ forca: { base: 1000000, mFormas: 3 } });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('mFormas ativo em MÚLTIPLOS eixos simultaneamente satura o fator em 1 mesmo assim (clamp 0..1) — mesmo ganho de 1 eixo só', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            mana: { base: 1000000, atual: 2000000, mFormas: 2 },
            chakra: { base: 1000000, atual: 2000000, mFormas: 2 },
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });
});

describe('core/fadiga - calcularGanhoFadigaDinamico: combinação dos 3 fatores e clamp no teto de 15', () => {
    it('uma ficha "de boa" (energia cheia, vida cheia, sem Forma ativa) não ganha NADA de Fadiga dinâmica', () => {
        const ficha = fichaCheia();
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('pior caso (100% de energia gasta + 100% de vida perdida + Forma saturada) bate EXATAMENTE no teto de 15', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 0, mFormas: 5 },
            mana: { base: 1000000, atual: 0 },
            aura: { base: 1000000, atual: 0 },
            chakra: { base: 1000000, atual: 0 },
            corpo: { base: 1000000, atual: 0 },
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(15, 6);
    });

    it('nunca ultrapassa 15 mesmo com valores absurdos (mFormas gigantesco, energia negativa)', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: -999999999, mFormas: 99999 },
            mana: { base: 1000000, atual: -1 },
        });
        const ganho = calcularGanhoFadigaDinamico(ficha);
        expect(ganho).toBeLessThanOrEqual(15);
        expect(ganho).toBeGreaterThanOrEqual(0);
    });

    it('combinação parcial (só energia a 50% + vida cheia + sem Forma) soma pesos parciais corretamente', () => {
        const ficha = fichaCheia({
            mana: { base: 1000000, atual: 500000 },
            aura: { base: 1000000, atual: 500000 },
            chakra: { base: 1000000, atual: 500000 },
            corpo: { base: 1000000, atual: 500000 },
        });
        // fatorEnergia=0.5, fatorVida=0, fatorFormas=0 -> (0.5/3)*15 = 2.5
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(2.5, 6);
    });
});

describe('core/fadiga - calcularGanhoFadigaDinamico: robustez (try/catch)', () => {
    it('não lança e retorna 0 para ficha null/undefined', () => {
        expect(() => calcularGanhoFadigaDinamico(null)).not.toThrow();
        expect(calcularGanhoFadigaDinamico(null)).toBe(0);
        expect(() => calcularGanhoFadigaDinamico(undefined)).not.toThrow();
        expect(calcularGanhoFadigaDinamico(undefined)).toBe(0);
    });

    it('não lança e retorna 0 para uma ficha vazia ({})', () => {
        expect(calcularGanhoFadigaDinamico({})).toBe(0);
    });

    it('não lança com dados malformados (vida.atual como string não-numérica, mFormas como objeto)', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 'não-é-número' },
            mana: { base: 1000000, atual: 1000000, mFormas: {} },
        });
        expect(() => calcularGanhoFadigaDinamico(ficha)).not.toThrow();
        expect(Number.isFinite(calcularGanhoFadigaDinamico(ficha))).toBe(true);
    });
});

describe('core/fadiga - calcularFadigaAtual', () => {
    it('soma fadigaBase (fadigaTurnos x fadigaPorTurno) com fadigaExtra corretamente', () => {
        const ficha = { combate: { fadigaTurnos: 4, fadigaPorTurno: 5, fadigaExtra: 12.5 } };
        // base = 4*5 = 20 ; total = 20 + 12.5 = 32.5
        expect(calcularFadigaAtual(ficha)).toBeCloseTo(32.5, 6);
    });

    it('fadigaExtra sozinho (sem contador manual) também é somado', () => {
        const ficha = { combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 7 } };
        expect(calcularFadigaAtual(ficha)).toBe(7);
    });

    it('clampa em 100 quando a soma ultrapassa o teto', () => {
        const ficha = { combate: { fadigaTurnos: 15, fadigaPorTurno: 5, fadigaExtra: 50 } }; // 75+50=125
        expect(calcularFadigaAtual(ficha)).toBe(100);
    });

    it('clampa em 0 (nunca fica negativo) mesmo com fadigaExtra negativo', () => {
        const ficha = { combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: -50 } };
        expect(calcularFadigaAtual(ficha)).toBe(0);
    });

    it('fadigaPorTurno ausente usa o padrão de 5%/turno', () => {
        const ficha = { combate: { fadigaTurnos: 4 } };
        expect(calcularFadigaAtual(ficha)).toBe(20);
    });

    it('ficha sem "combate" nenhum não lança e retorna 0', () => {
        expect(() => calcularFadigaAtual({})).not.toThrow();
        expect(calcularFadigaAtual({})).toBe(0);
    });

    it('ficha totalmente undefined não lança e retorna 0', () => {
        expect(() => calcularFadigaAtual(undefined)).not.toThrow();
        expect(calcularFadigaAtual(undefined)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// QA — paridade REAL entre getFatorFormasAtivas (core/fadiga.js) e o pipeline
// de mFormas efetivo exposto por core/attributes.js (getBuffs), o MESMO
// pipeline que core/poder.js usa (getEfetivoMFormas/getGlobalMultipliers) —
// em vez de reimplementar a fórmula de fadiga.js, este bloco recalcula o
// mFormas efetivo por fora (usando só getBuffs, como poder.js faz) e confere
// que o ganho dinâmico bate com o valor esperado à mão.
// ---------------------------------------------------------------------------
describe('core/fadiga - getFatorFormasAtivas: paridade com o pipeline real de mFormas de core/attributes.js', () => {
    // Réplica independente de getEfetivoMFormas (core/poder.js) usando só getBuffs exportado
    // de core/attributes.js — usada para computar o valor ESPERADO por fora de fadiga.js.
    function mFormasEfetivoViaAttributes(ficha, anchor) {
        const s = ficha[anchor] || {};
        const b = getBuffs(ficha, anchor, true, false, true) || {};
        let v = parseFloat(s.mFormas) || 1.0;
        if (b._hasBuff && b._hasBuff.mformas) v = (v === 1.0 ? 0 : v) + b.mformas;
        return v;
    }

    // As duas próximas usam o eixo "status" (âncora "forca") de propósito: é o único eixo dos
    // 6 lidos por getFatorFormasAtivas que NÃO participa de getFatorEnergiaGasta/getFatorVidaPerdida
    // — assim um buff de mFormas ali não contamina os outros 2 fatores via getMaximo (que TAMBÉM
    // soma mFormas ao multiplicador do vital, o que mudaria o "% gasto" do próprio pool afetado
    // se o eixo escolhido fosse uma energia/vida real). Isola de verdade só o fator de Formas.
    it('um item equipado concedendo +mformas no eixo "status" (forca) é lido pela MESMA getBuffs que core/poder.js usa (ignorando poderes/passivas)', () => {
        const ficha = fichaCheia({
            inventario: [{ nome: 'Armadura Bankai', equipado: true, efeitos: [{ atributo: 'forca', propriedade: 'mformas', valor: 3 }] }],
        });

        // mFormas efetivo esperado no eixo status (forca): base(1.0, sem buff) -> 0 + 3 = 3.
        const mFormasEsperado = mFormasEfetivoViaAttributes(ficha, 'forca');
        expect(mFormasEsperado).toBe(3);

        // fatorFormas = clamp(0,1, soma(v-1)) = clamp(0,1, 2) = 1 -> ganho = (0+0+1)/3*15 = 5.
        const ganhoEsperado = ((mFormasEsperado - 1 > 1 ? 1 : mFormasEsperado - 1) / 3) * 15;
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(ganhoEsperado, 6);
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('um efeito de poder (ficha.poderes) NÃO conta pro desgaste de Formas — fadiga.js chama getBuffs com ignorarPoderes=true, igual core/poder.js faz para o multiplicador MFORMAS de Poder', () => {
        const ficha = fichaCheia({
            poderes: [{ nome: 'Modo Poder', ativa: true, efeitos: [{ atributo: 'forca', propriedade: 'mformas', valor: 5 }] }],
        });

        // getBuffs com ignorarPoderes=true não enxerga o efeito do poder -> mFormas efetivo continua 1.
        expect(mFormasEfetivoViaAttributes(ficha, 'forca')).toBe(1);
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('mFormas efetivo via getMaximo/getBuffs (attributes.js) usado como sanity check: um mFormas de base direto na ficha (sem buff) é lido igual pelos dois lados', () => {
        // "atual" acompanha o novo máximo (base x mFormas) pra isolar só o fator de Formas —
        // ver a mesma ressalva no describe de getFatorFormasAtivas acima.
        const ficha = fichaCheia({ vida: { base: 1000000, atual: 4000000, mFormas: 4 } });
        expect(mFormasEfetivoViaAttributes(ficha, 'vida')).toBe(4);
        // fatorFormas = clamp(0,1, 4-1=3) = 1 -> ganho = 5.
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
        // getMaximo (usado por getFatorVidaPerdida/getFatorEnergiaGasta) continua utilizável
        // normalmente na mesma ficha, sem qualquer interferência do mFormas de Forma.
        expect(getMaximo(ficha, 'vida')).toBeGreaterThan(0);
    });
});
