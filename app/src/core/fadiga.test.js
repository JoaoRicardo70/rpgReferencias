import { describe, it, expect } from 'vitest';
import { calcularGanhoFadigaDinamico, calcularFadigaAtual } from './fadiga';
import { getBuffs, getMaximo } from './attributes.js';
import { calcularPoderAtual } from './poder.js';

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

    // 🛡️ Resistência Elemental (core/dominios.js) — Domínio nível 1-10 no elemento do ÚLTIMO golpe
    // recebido (combate.ultimoElementoRecebido) desconta este fator especificamente.
    it('Domínio nível 10 ("Eterno") no elemento do último golpe recebido ZERA por completo o fator de vida perdida', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 0 },
            dominios: { Fogo: { nivel: 10 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('Domínio nível 5 no elemento do último golpe recebido desconta o fator de vida pela metade', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 0 },
            dominios: { Fogo: { nivel: 5 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        // fatorVida bruto=1 -> descontado 50% = 0.5 -> ganho = (0+0.5+0)/3*15 = 2.5.
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(2.5, 6);
    });

    it('Domínio treinado em elemento DIFERENTE do último golpe recebido não desconta nada', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 0 },
            dominios: { Agua: { nivel: 10 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('sem ultimoElementoRecebido definido, comportamento idêntico a antes da Resistência Elemental existir (sem desconto, mesmo com Domínios altos)', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 0 },
            dominios: { Fogo: { nivel: 10 } },
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('match de nome do Domínio é acento/caixa-insensível ("fogo" bate com "Fogo")', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 0 },
            dominios: { Fogo: { nivel: 10 } },
            combate: { ultimoElementoRecebido: 'fogo' },
        });
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
    it('é só combate.fadigaExtra — fadigaTurnos/fadigaPorTurno NÃO entram mais na soma (contador informativo, ver MapaFormContext.jsx)', () => {
        const ficha = { combate: { fadigaTurnos: 4, fadigaPorTurno: 5, fadigaExtra: 12.5 } };
        expect(calcularFadigaAtual(ficha)).toBeCloseTo(12.5, 6);
    });

    it('fadigaTurnos alto sozinho (sem fadigaExtra) não gera Fadiga nenhuma', () => {
        const ficha = { combate: { fadigaTurnos: 999, fadigaPorTurno: 50, fadigaExtra: 0 } };
        expect(calcularFadigaAtual(ficha)).toBe(0);
    });

    it('fadigaExtra sozinho (sem fadigaTurnos) é somado normalmente', () => {
        const ficha = { combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 7 } };
        expect(calcularFadigaAtual(ficha)).toBe(7);
    });

    it('clampa em 100 quando fadigaExtra ultrapassa o teto sozinho', () => {
        const ficha = { combate: { fadigaTurnos: 15, fadigaPorTurno: 5, fadigaExtra: 125 } };
        expect(calcularFadigaAtual(ficha)).toBe(100);
    });

    it('clampa em 0 (nunca fica negativo) mesmo com fadigaExtra negativo', () => {
        const ficha = { combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: -50 } };
        expect(calcularFadigaAtual(ficha)).toBe(0);
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
// ---------------------------------------------------------------------------
// QA — Maestria em Formas (forma.maestria, 0-100%) descontando getFatorFormasAtivas,
// e Supressão de Poder (ficha.supressaoPoder/limiteSupressao) escalando a severidade
// FINAL via getFatorPoderUsado. Ambos os fatores são NO-OPS para fichas legadas
// (sem `maestria` em nenhuma Forma e/ou supressaoPoder no default de 100).
// ---------------------------------------------------------------------------
describe('core/fadiga - Maestria em Formas (desconta getFatorFormasAtivas)', () => {
    // Ficha-base com uma Forma ATIVA em ficha.poderes (categoria='forma', ativa=true) cujo
    // mFormas satura o fator de Formas em 1 (mesma técnica do describe de getFatorFormasAtivas
    // acima: mFormas=2 no eixo vida, "atual" acompanhando o novo máximo pra isolar só esse
    // fator). Maestria é editada/lida DIRETO no objeto do poder (p.maestria) — não em nenhuma
    // sub-transformação aninhada (ver PoderesFormContext.jsx/PoderesSubComponents.jsx).
    function fichaComFormaAtiva(maestria) {
        const forma = { id: 'p1', nome: 'Forma X', categoria: 'forma', ativa: true };
        if (maestria !== undefined) forma.maestria = maestria;
        return fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [forma],
        });
    }

    it('maestria=100 na Forma ativa ZERA por completo a contribuição dela pro ganho de Fadiga (idêntico a nenhuma Forma ativa)', () => {
        const comMaestria100 = fichaComFormaAtiva(100);
        const semFormaNenhuma = fichaCheia(); // sem poderes/mFormas ativo nenhum

        const ganhoComMaestria = calcularGanhoFadigaDinamico(comMaestria100);
        const ganhoSemForma = calcularGanhoFadigaDinamico(semFormaNenhuma);

        expect(ganhoComMaestria).toBeCloseTo(0, 6);
        expect(ganhoComMaestria).toBeCloseTo(ganhoSemForma, 6);
    });

    it('maestria=50 produz EXATAMENTE metade do ganho de Fadiga de maestria=0 (desconto linear)', () => {
        const ganhoMaestria0 = calcularGanhoFadigaDinamico(fichaComFormaAtiva(0));
        const ganhoMaestria50 = calcularGanhoFadigaDinamico(fichaComFormaAtiva(50));

        // fatorFormas bruto satura em 1 -> sem maestria, ganho = (0+0+1)/3*15 = 5.
        expect(ganhoMaestria0).toBeCloseTo(5, 6);
        // com 50% de maestria, fatorFormas = 1 * (1-0.5) = 0.5 -> ganho = (0+0+0.5)/3*15 = 2.5.
        expect(ganhoMaestria50).toBeCloseTo(2.5, 6);
        expect(ganhoMaestria50).toBeCloseTo(ganhoMaestria0 / 2, 6);
    });

    it('maestria ausente (undefined) na Forma ativa se comporta IGUAL a maestria=0 (default documentado, sem desconto)', () => {
        const ganhoSemCampo = calcularGanhoFadigaDinamico(fichaComFormaAtiva(undefined));
        const ganhoZeroExplicito = calcularGanhoFadigaDinamico(fichaComFormaAtiva(0));
        expect(ganhoSemCampo).toBeCloseTo(ganhoZeroExplicito, 6);
        expect(ganhoSemCampo).toBeCloseTo(5, 6);
    });

    it('múltiplas Formas ativas simultâneas (dois poderes categoria=forma) com maestrias diferentes usam a MÉDIA SIMPLES, não o mínimo/máximo', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [
                { id: 'p1', categoria: 'forma', ativa: true, maestria: 100 },
                { id: 'p2', categoria: 'forma', ativa: true, maestria: 0 },
            ],
        });
        // média = (100+0)/2 = 50 -> mesmo resultado do teste de maestria=50 isolada acima.
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(2.5, 6);
    });

    it('maestria fora do intervalo [0,100] é clampada antes de aplicar o desconto (150 vira 100, -20 vira 0)', () => {
        const ganho150 = calcularGanhoFadigaDinamico(fichaComFormaAtiva(150));
        const ganho100 = calcularGanhoFadigaDinamico(fichaComFormaAtiva(100));
        expect(ganho150).toBeCloseTo(ganho100, 6);
        expect(ganho150).toBeCloseTo(0, 6);

        const ganhoNeg20 = calcularGanhoFadigaDinamico(fichaComFormaAtiva(-20));
        const ganho0 = calcularGanhoFadigaDinamico(fichaComFormaAtiva(0));
        expect(ganhoNeg20).toBeCloseTo(ganho0, 6);
        expect(ganhoNeg20).toBeCloseTo(5, 6);
    });

    it('Forma NÃO ativa (ativa=false) -> nenhum desconto de Maestria aplicado, mesmo com maestria definida', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: false, maestria: 100 }],
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('poder ativo mas categoria diferente de "forma" (habilidade/poder) -> maestria nele é ignorada pra este desconto', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [{ id: 'p1', categoria: 'habilidade', ativa: true, maestria: 100 }],
        });
        expect(() => calcularGanhoFadigaDinamico(ficha)).not.toThrow();
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('ficha sem poderes nenhum -> não lança, desconto de Maestria fica em 0', () => {
        const ficha = fichaCheia({ vida: { base: 1000000, atual: 2000000, mFormas: 2 } });
        delete ficha.poderes;
        expect(() => calcularGanhoFadigaDinamico(ficha)).not.toThrow();
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('Maestria em Item do Arsenal ou Ser Selado NÃO é lida — "Forma" de primeira classe com Maestria existe só em ficha.poderes[]', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            inventario: [{ id: 'i1', equipado: true, tipo: 'arma', maestria: 100 }],
            seresSelados: [{ id: 's1', ativo: true, maestria: 100 }],
        });
        // mFormas=2 continua contribuindo o fator cheio de Formas (soma até 1) porque nada em
        // poderes/categoria='forma' está ativo pra descontar — maestria em itens/seres não conta.
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('categoria em caixa mista ("Forma"/"FORMA") ainda é reconhecida (match case-insensitive)', () => {
        const ganhoMinuscula = calcularGanhoFadigaDinamico(fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: true, maestria: 100 }],
        }));
        const ganhoMaiuscula = calcularGanhoFadigaDinamico(fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [{ id: 'p1', categoria: 'FORMA', ativa: true, maestria: 100 }],
        }));
        const ganhoCapitalizada = calcularGanhoFadigaDinamico(fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [{ id: 'p1', categoria: 'Forma', ativa: true, maestria: 100 }],
        }));
        // As 3 variações de caixa devem ser tratadas de forma idêntica — maestria=100 zera o ganho.
        expect(ganhoMinuscula).toBeCloseTo(0, 6);
        expect(ganhoMaiuscula).toBeCloseTo(0, 6);
        expect(ganhoCapitalizada).toBeCloseTo(0, 6);
    });

    // ---------------------------------------------------------------------------
    // Regressão: mesmo depois da Maestria sair de FormasEditor.jsx (ver histórico deste arquivo),
    // uma Forma ATIVA de sub-transformação de ARMA/Ser Selado (ficha.inventario[]/seresSelados[]
    // com formaAtivaId/.formas[], lida por getBuffs em attributes.js) precisa CONTINUAR contribuindo
    // pro "bruto" de getFatorFormasAtivas — só não pode mais ser DESCONTADA por nenhuma Maestria
    // (limitação de escopo aceita/documentada, não um bug). O risco real que este teste protege
    // contra é o oposto: uma regressão que EXCLUÍSSE essas Formas do bruto por completo.
    // ---------------------------------------------------------------------------
    it('regressão: Forma ativa de uma ARMA do Arsenal (inventario[].formaAtivaId/.formas[]) ainda soma mFormas cheio no bruto — não foi excluída junto com a remoção da Maestria de FormasEditor.jsx', () => {
        const ficha = fichaCheia({
            inventario: [{
                id: 'i1', nome: 'Espada Bankai', equipado: true,
                formaAtivaId: 'fi1',
                formas: [{ id: 'fi1', nome: 'Forma Selada', efeitos: [{ atributo: 'forca', propriedade: 'mformas', valor: 3 }] }],
            }],
        });
        // Sem nenhuma Forma de Poder ativa (maestriaMedia=0, sem desconto) — se a Forma da arma
        // tivesse sido acidentalmente excluída do bruto, o ganho seria 0 (energia/vida cheias).
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('regressão: Forma ativa de um Ser Selado (seresSelados[].formaAtivaId/.formas[]) ainda soma mFormas cheio no bruto', () => {
        const ficha = fichaCheia({
            seresSelados: [{
                id: 's1', nome: 'Bijuu', ativo: true,
                formaAtivaId: 'fs1',
                formas: [{ id: 'fs1', nome: 'Modo Cauda', efeitos: [{ atributo: 'forca', propriedade: 'mformas', valor: 3 }] }],
            }],
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('interação documentada (não é bug NOVO desta sessão): uma Forma de Poder com maestria=100 ativa SIMULTANEAMENTE com uma Forma de arma no MESMO eixo aplica o desconto sobre o bruto COMBINADO (maestriaMedia é um único fator global, não por-fonte) — mesmo comportamento de "média global" que getMaestriaMediaFormasAtivas já tinha antes desta sessão, só mudou ONDE a maestria é lida', () => {
        const ficha = fichaCheia({
            inventario: [{
                id: 'i1', equipado: true, formaAtivaId: 'fi1',
                formas: [{ id: 'fi1', efeitos: [{ atributo: 'forca', propriedade: 'mformas', valor: 3 }] }],
            }],
            poderes: [{ id: 'p1', categoria: 'forma', ativa: true, maestria: 100 }],
        });
        // O fator de Formas combinado (arma + eixo "forca") satura em 1, e a média de Maestria das
        // Formas de Poder ativas (100, a única) desconta o bruto INTEIRO — não só a parte do poder.
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(0, 6);
    });
});

describe('core/fadiga - Supressão de Poder (escala a severidade FINAL via getFatorPoderUsado, com limiar de 80%)', () => {
    // Ficha-base com severidade > 0 vinda só de energia gasta (fatorEnergia=1, fatorVida=0,
    // fatorFormas=0) -> sem escala de Poder, ganho = (1+0+0)/3*15 = 5.
    function fichaComEnergiaGasta(extra = {}) {
        return fichaCheia({
            mana: { base: 1000000, atual: 0 },
            aura: { base: 1000000, atual: 0 },
            chakra: { base: 1000000, atual: 0 },
            corpo: { base: 1000000, atual: 0 },
            ...extra,
        });
    }

    it('supressaoPoder=100 (Poder totalmente liberado) não altera o ganho de Fadiga (igual ao comportamento pré-existente)', () => {
        const ficha = fichaComEnergiaGasta({ supressaoPoder: 100 });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('supressaoPoder ausente (undefined) também não altera o ganho de Fadiga (default = 100)', () => {
        const ficha = fichaComEnergiaGasta();
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });

    it('usando 80% do Poder OU MENOS não acumula NENHUMA Fadiga dinâmica (limiar novo — 0%, 50% e exatamente 80% todos zeram o ganho)', () => {
        expect(calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 0 }))).toBe(0);
        expect(calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 50 }))).toBe(0);
        expect(calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 80 }))).toBe(0);
    });

    it('acima de 80%, a Fadiga escala LINEARMENTE entre o limiar (80%, ganho 0) e 100% (ganho cheio) — supressaoPoder=90 produz EXATAMENTE metade do ganho de supressaoPoder=100', () => {
        // fatorPoder(100) = (100-80)/(100-80) = 1 -> ganho = 5*1 = 5.
        // fatorPoder(90)  = (90-80)/(100-80)  = 0.5 -> ganho = 5*0.5 = 2.5.
        const ganho100 = calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 100 }));
        const ganho90 = calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 90 }));
        expect(ganho100).toBeCloseTo(5, 6);
        expect(ganho90).toBeCloseTo(2.5, 6);
        expect(ganho90).toBeCloseTo(ganho100 / 2, 6);
    });

    it('supressaoPoder=0 com limiteSupressao=0 zera por completo o ganho de Fadiga dinâmica (já abaixo do limiar de 80%)', () => {
        const ficha = fichaComEnergiaGasta({ supressaoPoder: 0, limiteSupressao: 0 });
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('supressaoPoder abaixo de limiteSupressao é clampado PRA CIMA até o limite antes de calcular o fator (igual core/poder.js) — usando um limite ACIMA do limiar de 80% pra confirmar que o clamp participa da escala linear, não só do "zera"', () => {
        // sup=5, lim=90 -> sup vira 90 -> fator = (90-80)/20 = 0.5 -> ganho = 5 * 0.5 = 2.5.
        const ficha = fichaComEnergiaGasta({ supressaoPoder: 5, limiteSupressao: 90 });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(2.5, 6);

        // Paridade direta: o mesmo par sup/lim, passado por calcularPoderAtual (core/poder.js),
        // devolve "supressao" já clampada pro mesmo valor (90) que getFatorPoderUsado usa por
        // dentro — confirmando as duas leituras do "quanto de Poder está liberado" concordam.
        const { supressao } = calcularPoderAtual({ ...ficha, supressaoPoder: 5, limiteSupressao: 90 });
        expect(supressao).toBe(90);
    });

    it('supressaoPoder/limiteSupressao NaN (string inválida) caem no default 100/1, igual campo ausente', () => {
        const ficha = fichaComEnergiaGasta({ supressaoPoder: 'abc', limiteSupressao: 'xyz' });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(5, 6);
    });
});

describe('core/fadiga - Maestria como limiar DINÂMICO (substitui os 80% padrão quando há Forma ativa)', () => {
    // Ficha isolando o fator de Formas do "bruto" (nenhum mFormas>1 em nenhum eixo) — a Forma
    // ativa aqui só existe pra deslocar o LIMIAR (via sua Maestria), a severidade toda vem do
    // fator de energia gasta (fatorEnergia=1, fatorVida=0, fatorFormas=0 -> severidade=1/3).
    function fichaComFormaLimiar(maestria, supressaoPoder, fadigaPorUso) {
        const forma = { id: 'p1', categoria: 'forma', ativa: true, maestria };
        if (fadigaPorUso !== undefined) forma.fadigaPorUso = fadigaPorUso;
        return fichaCheia({
            mana: { base: 1000000, atual: 0 },
            aura: { base: 1000000, atual: 0 },
            chakra: { base: 1000000, atual: 0 },
            corpo: { base: 1000000, atual: 0 },
            poderes: [forma],
            supressaoPoder,
        });
    }
    // ganho "cheio" de referência (fatorPoder=1, peso padrão 15): severidade(1/3)*15 = 5.
    const GANHO_CHEIO_PADRAO = 5;

    it('Forma ativa com Maestria=60: Supressão EM 60% (igual à Maestria) ainda não gera Fadiga nenhuma', () => {
        expect(calcularGanhoFadigaDinamico(fichaComFormaLimiar(60, 60))).toBe(0);
    });

    it('Forma ativa com Maestria=60: Supressão abaixo de 60% também não gera Fadiga', () => {
        expect(calcularGanhoFadigaDinamico(fichaComFormaLimiar(60, 30))).toBe(0);
    });

    it('Forma ativa com Maestria=60: Supressão UM PONTO acima de 60% já gera Fadiga pequena, porém não-zero', () => {
        // fatorPoder = (61-60)/(100-60) = 1/40 = 0.025 -> ganho = 5 * 0.025 = 0.125.
        const ganho = calcularGanhoFadigaDinamico(fichaComFormaLimiar(60, 61));
        expect(ganho).toBeGreaterThan(0);
        expect(ganho).toBeCloseTo(GANHO_CHEIO_PADRAO * 0.025, 6);
    });

    it('Forma ativa com Maestria=60: Supressão a 100% (Poder liberado por completo) gera o ganho CHEIO, escalando a partir do novo limiar de 60% (não mais 80%)', () => {
        // fatorPoder = (100-60)/(100-60) = 1 -> ganho cheio.
        expect(calcularGanhoFadigaDinamico(fichaComFormaLimiar(60, 100))).toBeCloseTo(GANHO_CHEIO_PADRAO, 6);
    });

    it('Forma ativa com Maestria=100 (Forma perfeitamente dominada): NUNCA gera Fadiga por Poder, nem em Supressão=100', () => {
        expect(calcularGanhoFadigaDinamico(fichaComFormaLimiar(100, 100))).toBe(0);
    });

    it('Forma ativa com Maestria=0 (Forma nada dominada): QUALQUER Supressão acima de 0% já gera Fadiga — sem nenhuma margem livre', () => {
        // fatorPoder = (1-0)/(100-0) = 0.01 -> ganho = 5*0.01 = 0.05.
        const ganho = calcularGanhoFadigaDinamico(fichaComFormaLimiar(0, 1));
        expect(ganho).toBeGreaterThan(0);
        expect(ganho).toBeCloseTo(GANHO_CHEIO_PADRAO * 0.01, 6);
    });

    it('exemplos literais do pedido do usuário — Supressão 50% e Maestria 50% (igual), e Supressão 50% e Maestria 60% (Supressão menor) — nenhum dos dois gera Fadiga', () => {
        expect(calcularGanhoFadigaDinamico(fichaComFormaLimiar(50, 50))).toBe(0);
        expect(calcularGanhoFadigaDinamico(fichaComFormaLimiar(60, 50))).toBe(0);
    });

    it('exemplo do pedido — personagem lutando com 70% de Poder SEM nenhuma Forma ativa não gera Fadiga (usa o limiar padrão de 80%, 70 < 80)', () => {
        const ficha = fichaCheia({
            mana: { base: 1000000, atual: 0 },
            aura: { base: 1000000, atual: 0 },
            chakra: { base: 1000000, atual: 0 },
            corpo: { base: 1000000, atual: 0 },
            supressaoPoder: 70,
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('múltiplas Formas ativas com Maestrias diferentes usam a MÉDIA como limiar (40 e 80 -> limiar 60, igual ao teste de Maestria=60 isolada)', () => {
        const ficha = fichaCheia({
            mana: { base: 1000000, atual: 0 },
            aura: { base: 1000000, atual: 0 },
            chakra: { base: 1000000, atual: 0 },
            corpo: { base: 1000000, atual: 0 },
            poderes: [
                { id: 'p1', categoria: 'forma', ativa: true, maestria: 40 },
                { id: 'p2', categoria: 'forma', ativa: true, maestria: 80 },
            ],
            supressaoPoder: 60,
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('🥋 Fadiga por Uso (campo editável por Forma): sem o campo definido, usa o peso padrão de 15 — Forma com peso customizado de 30 gera o DOBRO de Fadiga acima do limiar', () => {
        const ganhoPadrao = calcularGanhoFadigaDinamico(fichaComFormaLimiar(50, 90));
        const ganhoCustom = calcularGanhoFadigaDinamico(fichaComFormaLimiar(50, 90, 30));
        // fatorPoder(90, limiar=50) = (90-50)/50 = 0.8 -> ganho padrão = 5*0.8/... na verdade
        // severidade=1/3, peso=15 -> ganho = (1/3)*15*0.8 = 4; com peso=30 -> (1/3)*30*0.8 = 8.
        expect(ganhoPadrao).toBeCloseTo(4, 6);
        expect(ganhoCustom).toBeCloseTo(8, 6);
        expect(ganhoCustom).toBeCloseTo(ganhoPadrao * 2, 6);
    });

    it('🥋 Fadiga por Uso com múltiplas Formas ativas usa a MÉDIA dos pesos (10 e 30 -> peso 20)', () => {
        const ficha = fichaCheia({
            mana: { base: 1000000, atual: 0 },
            aura: { base: 1000000, atual: 0 },
            chakra: { base: 1000000, atual: 0 },
            corpo: { base: 1000000, atual: 0 },
            poderes: [
                { id: 'p1', categoria: 'forma', ativa: true, maestria: 50, fadigaPorUso: 10 },
                { id: 'p2', categoria: 'forma', ativa: true, maestria: 50, fadigaPorUso: 30 },
            ],
            supressaoPoder: 90,
        });
        // fatorPoder=0.8, severidade=1/3, peso médio=20 -> ganho=(1/3)*20*0.8 ≈ 5.333.
        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo((1 / 3) * 20 * 0.8, 6);
    });
});

describe('core/fadiga - Regressão/compatibilidade retroativa: os 2 novos fatores são NO-OPS para fichas legadas', () => {
    it('ficha "legada" com energia/vida/mFormas realistas, SEM nenhum campo maestria e SEM supressaoPoder definido, produz exatamente severidade*15 sem qualquer desconto/escala', () => {
        // mFormas ativo no eixo "status" (forca) de propósito — assim ele contribui pro fator
        // de Formas sem contaminar o cálculo de "% gasto" de nenhuma energia/vida real (mesma
        // técnica de isolamento usada no describe de paridade mais abaixo neste arquivo).
        const ficha = fichaCheia({
            mana: { base: 1000000, atual: 250000 }, // 75% gasto
            aura: { base: 1000000, atual: 1000000 },
            chakra: { base: 1000000, atual: 1000000 },
            corpo: { base: 1000000, atual: 1000000 },
            vida: { base: 1000000, atual: 700000 }, // 30% perdida
            forca: { base: 1000000, mFormas: 1.4 }, // Forma leve ativa (status)
            poderes: [{ id: 'p1', nome: 'Forma Legada', categoria: 'forma', ativa: true /* sem maestria */ }],
            // supressaoPoder e limiteSupressao ausentes de propósito
        });

        const fatorEnergia = 0.75 / 4; // só mana gasta, as outras 3 cheias
        const fatorVida = 0.3;
        const fatorFormas = Math.min(1, Math.max(0, 0.4)); // mFormas=1.4 -> soma=0.4, sem desconto de maestria
        const severidadeEsperada = (fatorEnergia + fatorVida + fatorFormas) / 3;
        const ganhoEsperado = severidadeEsperada * 15; // sem fatorPoder (=1, default)

        expect(calcularGanhoFadigaDinamico(ficha)).toBeCloseTo(ganhoEsperado, 6);
    });
});

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

// ---------------------------------------------------------------------------
// QA — Change 1: limiar exato dos 80% (getFatorPoderUsado) — casos-limite bem em cima da
// fronteira, pra provar que a comparação é "<=" (zera em 80 inclusive) e não "<".
// ---------------------------------------------------------------------------
describe('core/fadiga - QA: Supressão de Poder, limite exato do limiar de 80% (boundary <= vs <)', () => {
    function fichaComEnergiaGasta(extra = {}) {
        return fichaCheia({
            mana: { base: 1000000, atual: 0 },
            aura: { base: 1000000, atual: 1000000 },
            chakra: { base: 1000000, atual: 1000000 },
            corpo: { base: 1000000, atual: 1000000 },
            ...extra,
        });
    }
    // fatorEnergia = 0.25/... na verdade (1-0)/4 = 0.25 -> severidade = 0.25/3 -> ganho pré-fator
    // de poder = (0.25/3)*15 = 1.25. Usado só como "ganho cheio" de referência pros testes abaixo.
    const GANHO_CHEIO = (0.25 / 3) * 15;

    it('supressaoPoder=79.9999 (uma fração abaixo do limiar) ainda zera o ganho por completo', () => {
        expect(calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 79.9999 }))).toBe(0);
    });

    it('supressaoPoder=80 EXATO zera o ganho (o limiar é inclusive — "<=", não "<")', () => {
        expect(calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 80 }))).toBe(0);
    });

    it('supressaoPoder=80.0001 (uma fração acima do limiar) já produz um ganho pequeno porém NÃO-zero, provando que o limiar é estritamente exclusivo acima de 80', () => {
        const ganho = calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 80.0001 }));
        expect(ganho).toBeGreaterThan(0);
        expect(ganho).toBeLessThan(0.001); // (0.0001/20) do ganho cheio -> extremamente pequeno
    });

    it('supressaoPoder=81 produz um ganho pequeno e nao-zero (fatorPoder = 1/20 = 0.05)', () => {
        const ganho = calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 81 }));
        expect(ganho).toBeGreaterThan(0);
        expect(ganho).toBeCloseTo(GANHO_CHEIO * 0.05, 6);
    });

    it('supressaoPoder=99 (bem perto de 100) produz um ganho próximo do máximo mas estritamente menor que ele (fatorPoder = 19/20 = 0.95)', () => {
        const ganho99 = calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 99 }));
        const ganho100 = calcularGanhoFadigaDinamico(fichaComEnergiaGasta({ supressaoPoder: 100 }));
        expect(ganho99).toBeCloseTo(GANHO_CHEIO * 0.95, 6);
        expect(ganho99).toBeLessThan(ganho100);
        expect(ganho100 - ganho99).toBeCloseTo(GANHO_CHEIO * 0.05, 6);
    });
});

// ---------------------------------------------------------------------------
// QA — mais combinações do limiar dinâmico de Maestria (getLimiarSemFadiga), incluindo a
// interação com o fator de Formas (fatorFormas, que continua tendo seu PRÓPRIO desconto linear
// por Maestria, independente do limiar) quando as duas coisas se sobrepõem na mesma Forma ativa.
// ---------------------------------------------------------------------------
describe('core/fadiga - QA: limiar dinâmico de Maestria, combinações adicionais', () => {
    function fichaComForma(maestria, supressaoPoder) {
        return fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: true, maestria }],
            supressaoPoder,
        });
    }
    function fichaSemForma(supressaoPoder) {
        return fichaCheia({ supressaoPoder });
    }

    it('Maestria=100 (teto): Supressão a 100% ainda não gera Fadiga (limiar=100, faixa livre=0..100 inteira)', () => {
        expect(calcularGanhoFadigaDinamico(fichaComForma(100, 100))).toBe(0);
    });

    it('Maestria=1 (mínimo do range 1-100%) com Supressão=1 (igual à Maestria): ainda não gera Fadiga — fronteira mais apertada possível', () => {
        expect(calcularGanhoFadigaDinamico(fichaComForma(1, 1))).toBe(0);
    });

    it('Maestria=1 com Supressão=2 (um ponto acima): já gera Fadiga — o limiar de 1% é bem mais restritivo que os 80% padrão sem Forma', () => {
        const comForma = calcularGanhoFadigaDinamico(fichaComForma(1, 2));
        const semForma = calcularGanhoFadigaDinamico(fichaSemForma(2));
        // Sem Forma, Supressão=2 está bem abaixo do limiar padrão de 80% -> ganho=0. Com uma
        // Forma pouco dominada (Maestria=1) ativa, o limiar cai pra 1% e Supressão=2 já ultrapassa
        // -> ganho passa a ser MAIOR que zero, e maior que sem Forma nenhuma.
        expect(comForma).toBeGreaterThan(0);
        expect(comForma).toBeGreaterThan(semForma);
    });

    it('múltiplas Formas ativas com Maestrias diferentes: o limiar usa a Maestria MÉDIA das Formas ativas, não a de nenhuma Forma individual (40 e 80 -> limiar 60)', () => {
        const fichaDuasFormas = (supressaoPoder) => fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [
                { id: 'p1', categoria: 'forma', ativa: true, maestria: 40 },
                { id: 'p2', categoria: 'forma', ativa: true, maestria: 80 },
            ],
            supressaoPoder,
        });
        // Supressão == média(60): ainda dentro do limiar, sem Fadiga por Poder.
        expect(calcularGanhoFadigaDinamico(fichaDuasFormas(60))).toBe(0);
        // Supressão(61) > média(60): acima do limiar, já gera Fadiga (> 0).
        expect(calcularGanhoFadigaDinamico(fichaDuasFormas(61))).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// QA — Sanity check de interação entre as 3 mudanças da sessão (Change 1: limiar de 80% na
// Fadiga; Change 2: zero-rule de Maestria vs Supressão na Fadiga; Change 3: Poder Calculado
// contínuo por multiplicadorForcaPrestigio). Fadiga (core/fadiga.js) e Poder (core/poder.js)
// são calculados por caminhos de código totalmente independentes, mas ambos leem os MESMOS
// campos supressaoPoder/multiplicadorForcaPrestigio da mesma ficha — este teste confirma
// empiricamente que não há nenhuma interferência cruzada nem NaN/crash quando as 3 mudanças
// são exercitadas ao mesmo tempo na mesma ficha.
// ---------------------------------------------------------------------------
describe('core/fadiga + core/poder - QA: sanity check de interação entre as 3 mudanças combinadas numa mesma ficha', () => {
    it('Supressão=90 (> limiar 80% -> Change 1 permite Fadiga), Forma ativa com Maestria=50 (parcial, não 100% nem <= Supressão -> desconto linear normal do Change 2, não a zero-rule), e multiplicadorForcaPrestigio aumentado (Change 3) -> Fadiga e Poder calculados sem NaN/Infinity/crash, com valores coerentes', () => {
        const fichaBase = (multiplicadorForcaPrestigio) => ({
            ascensaoBase: 1,
            vida: { base: 1000000, atual: 500000, mFormas: 2 }, // 50% perdida + Forma ativa
            mana: { base: 10000000, atual: 5000000 },
            aura: { base: 10000000, atual: 10000000 },
            chakra: { base: 10000000, atual: 10000000 },
            corpo: { base: 10000000, atual: 10000000 },
            forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 },
            sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 }, carisma: { base: 1000000 },
            stamina: { base: 1000000 }, constituicao: { base: 1000000 },
            statusPrestigioAplicado: 600,
            divisores: {},
            divisorPoder: 0,
            poderes: [{ id: 'p1', categoria: 'forma', ativa: true, maestria: 50 }],
            supressaoPoder: 90,
            limiteSupressao: 1,
            multiplicadorForcaPrestigio,
            combate: {},
        });

        const fichaMultBaixo = fichaBase(1.0);
        const fichaMultAlto = fichaBase(1.2);

        // Fadiga: independe do multiplicadorForcaPrestigio -> deve produzir o MESMO ganho nos dois
        // casos (prova que Change 3 não vaza pro cálculo de Fadiga).
        const ganhoFadigaBaixo = calcularGanhoFadigaDinamico(fichaMultBaixo);
        const ganhoFadigaAlto = calcularGanhoFadigaDinamico(fichaMultAlto);
        expect(Number.isFinite(ganhoFadigaBaixo)).toBe(true);
        expect(Number.isFinite(ganhoFadigaAlto)).toBe(true);
        expect(ganhoFadigaBaixo).toBeGreaterThan(0); // Change 1 + Change 2 (parcial) permitem Fadiga > 0
        expect(ganhoFadigaBaixo).toBeCloseTo(ganhoFadigaAlto, 6);

        // Poder: sensível ao multiplicadorForcaPrestigio (Change 3) — resultado ainda finito, sem
        // NaN, e maior (ou igual) com o multiplicador maior.
        const poderBaixo = calcularPoderAtual(fichaMultBaixo, 1);
        const poderAlto = calcularPoderAtual(fichaMultAlto, 1);
        expect(Number.isFinite(poderBaixo.poderGlobal)).toBe(true);
        expect(Number.isFinite(poderAlto.poderGlobal)).toBe(true);
        expect(Number.isNaN(poderBaixo.poderGlobal)).toBe(false);
        expect(Number.isNaN(poderAlto.poderGlobal)).toBe(false);
        expect(poderAlto.poderGlobal).toBeGreaterThanOrEqual(poderBaixo.poderGlobal);
    });
});
