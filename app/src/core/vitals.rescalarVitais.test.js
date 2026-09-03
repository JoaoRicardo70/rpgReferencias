import { describe, it, expect } from 'vitest';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from './vitals';
import { getMaximo } from './attributes.js';

// ---------------------------------------------------------------------------
// QA — capturarMaximosAtuais / rescalarVitaisProporcional (core/vitals.js)
//
// Bug fix (definitivo): ativar/desativar uma Forma/equipamento/Ser Selado (8+ call sites em
// PoderesFormContext.jsx, ArsenalFormContext.jsx, RelicarioPanel.jsx, FichaFormContext.jsx)
// trava ".atual" de cada vital quando o máximo calculado (getMaximo) muda.
//
// HISTÓRICO: a primeira versão fazia um RESCALE PROPORCIONAL (atual * novoMax/oldMax) pra
// preservar a % cheia/vazia — mas isso continuava "drenando" energia em vários cenários: um
// "atual" fracionário sendo arredondado pra baixo mesmo em toggles que não afetavam aquele vital
// (razão exatamente 1), e — o motivo real do bug persistir mesmo depois de corrigir o
// arredondamento — SEMPRE reduzia proporcionalmente o atual ao DESATIVAR qualquer Forma que
// tivesse aumentado o máximo (por design, não por bug de arredondamento).
//
// VERSÃO ATUAL: abandona o rescale proporcional por completo. Ativar OU desativar NUNCA reduz o
// valor ABSOLUTO de "atual" — a única coisa que pode acontecer é um CLAMP pra baixo, e só até o
// novo máximo, e só quando "atual" de fato ultrapassa esse novo teto.
//
// Fixture: usa só ficha[vital] = {base, atual} — getMaximo (core/attributes.js) funciona com o
// mínimo, sem precisar de poderes/inventario/passivas (mesma técnica de core/fadiga.test.js >
// fichaCheia).
// ---------------------------------------------------------------------------

function fichaVital(overrides = {}) {
    return {
        vida: { base: 1000000, atual: 1000000 },
        mana: { base: 1000000, atual: 1000000 },
        ...overrides,
    };
}

describe('core/vitals - capturarMaximosAtuais', () => {
    it('retorna um snapshot de getMaximo(ficha, vital) para cada vital pedido (default: os 5 principais)', () => {
        const ficha = fichaVital({
            aura: { base: 2000000, atual: 2000000 },
            chakra: { base: 3000000, atual: 3000000 },
            corpo: { base: 4000000, atual: 4000000 },
        });
        const maximos = capturarMaximosAtuais(ficha);
        expect(maximos.vida).toBe(getMaximo(ficha, 'vida'));
        expect(maximos.mana).toBe(getMaximo(ficha, 'mana'));
        expect(maximos.aura).toBe(getMaximo(ficha, 'aura'));
        expect(maximos.chakra).toBe(getMaximo(ficha, 'chakra'));
        expect(maximos.corpo).toBe(getMaximo(ficha, 'corpo'));
    });

    it('aceita uma lista customizada de vitais (não precisa ser os 5 padrão)', () => {
        const ficha = fichaVital();
        const maximos = capturarMaximosAtuais(ficha, ['mana']);
        expect(Object.keys(maximos)).toEqual(['mana']);
        expect(maximos.mana).toBe(getMaximo(ficha, 'mana'));
    });

    it('vital sem máximo válido cai no fallback de 1 (nunca 0)', () => {
        const ficha = { vida: {} }; // sem base -> getMaximo retorna 0
        const maximos = capturarMaximosAtuais(ficha, ['vida']);
        expect(maximos.vida).toBe(1);
    });
});

describe('core/vitals - rescalarVitaisProporcional: máximo INALTERADO nunca trunca "atual" fracionário', () => {
    it('BUG CENTRAL (rodada 1): atual fracionário (79.5) com máximo INALTERADO permanece 79.5, não é arredondado pra 79', () => {
        const ficha = { vida: { base: 100, atual: 79.5 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']);
        rescalarVitaisProporcional(ficha, oldM, ['vida']);
        expect(ficha.vida.atual).toBe(79.5);
    });

    it('mesmo repetindo o toggle várias vezes seguidas, "atual" fracionário nunca degrada', () => {
        const ficha = { vida: { base: 100, atual: 79.5 } };
        for (let i = 0; i < 5; i++) {
            const oldM = capturarMaximosAtuais(ficha, ['vida']);
            rescalarVitaisProporcional(ficha, oldM, ['vida']);
        }
        expect(ficha.vida.atual).toBe(79.5);
    });

    it('um "atual" já inteiro com máximo inalterado permanece idêntico', () => {
        const ficha = { vida: { base: 100, atual: 42 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']);
        rescalarVitaisProporcional(ficha, oldM, ['vida']);
        expect(ficha.vida.atual).toBe(42);
    });
});

describe('core/vitals - rescalarVitaisProporcional: máximo AUMENTA (Forma ativando) — "atual" NUNCA muda (nem cresce, nem diminui)', () => {
    it('dobrar o máximo (mFormas=2) NÃO dobra "atual" — o valor absoluto continua exatamente o mesmo', () => {
        const ficha = { vida: { base: 100, atual: 50 } }; // 50% de 100
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        ficha.vida.mFormas = 2; // simula ativar uma Forma que dobra o máximo

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        const novoMax = getMaximo(ficha, 'vida');
        expect(novoMax).toBe(200);
        expect(ficha.vida.atual).toBe(50); // NÃO é 100 — o rescale proporcional foi removido
    });

    it('atual já no teto antigo tampouco "enche" o novo teto maior sozinho — continua no valor absoluto antigo', () => {
        const ficha = { vida: { base: 100, atual: 100 } }; // 100% cheio
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        ficha.vida.mFormas = 3; // máximo passa a 300

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        expect(getMaximo(ficha, 'vida')).toBe(300);
        expect(ficha.vida.atual).toBe(100); // continua 100, não vira 300
    });

    it('nunca gera valores fracionários novos por conta do aumento de máximo (atual não é multiplicado por nenhuma razão)', () => {
        const ficha = { vida: { base: 100, atual: 33 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']);
        ficha.vida.mFormas = 3;
        rescalarVitaisProporcional(ficha, oldM, ['vida']);
        expect(ficha.vida.atual).toBe(33);
    });
});

describe('core/vitals - rescalarVitaisProporcional: máximo DIMINUI (Forma desativando) — "atual" só é CLAMPADO se ultrapassar o novo teto, nunca reduzido além disso', () => {
    it('CICLO COMPLETO (regressão do bug relatado como "idêntico" após a 1ª correção): ativar uma Forma que dobra o máximo e depois desativar de volta faz "atual" terminar EXATAMENTE onde começou — nunca em metade', () => {
        const ficha = { vida: { base: 100, atual: 80, mFormas: 1 } };

        // Ativa (simulado): máximo 100 -> 200.
        let oldM = capturarMaximosAtuais(ficha, ['vida']);
        ficha.vida.mFormas = 2;
        rescalarVitaisProporcional(ficha, oldM, ['vida']);
        expect(ficha.vida.atual).toBe(80);
        expect(getMaximo(ficha, 'vida')).toBe(200);

        // Desativa: máximo 200 -> 100. atual(80) <= novoMax(100) -> não precisa clampar.
        oldM = capturarMaximosAtuais(ficha, ['vida']);
        ficha.vida.mFormas = 1;
        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        // Com o rescale proporcional antigo isto daria 40 (metade) — agora é 80, idêntico ao início.
        expect(ficha.vida.atual).toBe(80);
        expect(getMaximo(ficha, 'vida')).toBe(100);
    });

    it('"atual" que estava cheio no teto boostado É clampado pro novo teto mais baixo ao desativar (nunca fica acima do máximo)', () => {
        const ficha = { vida: { base: 100, atual: 200, mFormas: 2 } }; // cheio no teto boostado (200)
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        ficha.vida.mFormas = 1; // desativa -> novo máximo = 100

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        const novoMax = getMaximo(ficha, 'vida');
        expect(novoMax).toBe(100);
        expect(ficha.vida.atual).toBe(100); // clampado exatamente no novo teto, não em 200*0.5=100 coincidente aqui —
        // ver o próximo teste pra um caso onde o clamp e o antigo rescale proporcional dariam valores DIFERENTES.
    });

    it('"atual" PARCIALMENTE cheio no teto boostado NÃO é reduzido proporcionalmente ao desativar — só clampado se ultrapassar o novo teto', () => {
        const ficha = { vida: { base: 100, atual: 150, mFormas: 2 } }; // máximo=200, atual=150 (75%)
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        ficha.vida.mFormas = 1; // desativa -> novo máximo = 100

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        const novoMax = getMaximo(ficha, 'vida');
        expect(novoMax).toBe(100);
        // Rescale proporcional ANTIGO daria 150*(100/200)=75. Comportamento ATUAL: 150 ultrapassa o
        // novo teto (100) -> clampa exatamente em 100, não em 75.
        expect(ficha.vida.atual).toBe(100);
    });

    it('"atual" que NÃO ultrapassa o novo máximo mais baixo fica intocado, mesmo desativando uma Forma', () => {
        const ficha = { vida: { base: 100, atual: 60, mFormas: 2 } }; // máximo=200, atual=60 (30%)
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        ficha.vida.mFormas = 1; // novo máximo = 100

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        // 60 <= 100 (novo máximo) -> sem clamp nenhum, fica exatamente 60 (rescale proporcional
        // antigo daria 30).
        expect(ficha.vida.atual).toBe(60);
    });
});

describe('core/vitals - rescalarVitaisProporcional: clamps finais (negativo/NaN/acima do máximo)', () => {
    it('"atual" negativo nunca sobrevive à rescala — clampado pra 0 (não pro máximo)', () => {
        const ficha = { vida: { base: 100, atual: -50 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']);
        rescalarVitaisProporcional(ficha, oldM, ['vida']);
        expect(ficha.vida.atual).toBe(0);
        expect(ficha.vida.atual).toBeGreaterThanOrEqual(0);
    });

    it('"atual" ausente/NaN cai no fallback do novoMax (fallback de segurança, não erro)', () => {
        const ficha = { vida: { base: 100 } }; // sem "atual"
        const oldM = capturarMaximosAtuais(ficha, ['vida']);
        rescalarVitaisProporcional(ficha, oldM, ['vida']);
        expect(ficha.vida.atual).toBe(getMaximo(ficha, 'vida'));
    });

    it('"atual" como string não-numérica (NaN) também cai no fallback do novoMax', () => {
        const ficha = { vida: { base: 100, atual: 'não-é-número' } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']);
        rescalarVitaisProporcional(ficha, oldM, ['vida']);
        expect(ficha.vida.atual).toBe(getMaximo(ficha, 'vida'));
    });

    it('um aumento agressivo de máximo NÃO faz "atual" crescer junto — continua no valor absoluto de antes', () => {
        const ficha = { vida: { base: 100, atual: 100 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        ficha.vida.mFormas = 1000; // aumento absurdo de máximo

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        const novoMax = getMaximo(ficha, 'vida');
        expect(ficha.vida.atual).toBeLessThanOrEqual(novoMax);
        expect(ficha.vida.atual).toBe(100); // NÃO 100000 — sem rescale proporcional
    });
});

describe('core/vitals - rescalarVitaisProporcional: robustez e independência entre vitais', () => {
    it('não lança quando ficha ou maximosAntigos são null/undefined', () => {
        expect(() => rescalarVitaisProporcional(null, {})).not.toThrow();
        expect(() => rescalarVitaisProporcional({}, null)).not.toThrow();
        expect(() => rescalarVitaisProporcional(undefined, undefined)).not.toThrow();
    });

    it('pula um vital ausente na ficha (ex.: "mana" removido) sem afetar os demais', () => {
        const ficha = { vida: { base: 100, atual: 50 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida', 'mana']);

        expect(() => rescalarVitaisProporcional(ficha, oldM, ['vida', 'mana'])).not.toThrow();
        expect(ficha.mana).toBeUndefined();
        expect(ficha.vida.atual).toBe(50);
    });

    it('trata múltiplos vitais de forma independente na mesma chamada (um cresce de máximo, outro encolhe) — nenhum dos dois tem "atual" reduzido por conta disso', () => {
        const ficha = {
            vida: { base: 100, atual: 50 },
            mana: { base: 100, atual: 90, mFormas: 2 }, // máximo antigo=200
        };
        const oldM = capturarMaximosAtuais(ficha, ['vida', 'mana']); // vida=100, mana=200

        ficha.vida.mFormas = 2; // vida: máximo 100 -> 200 (cresce)
        ficha.mana.mFormas = 1; // mana: máximo 200 -> 100 (encolhe)

        rescalarVitaisProporcional(ficha, oldM, ['vida', 'mana']);

        expect(ficha.vida.atual).toBe(50); // sem crescer junto com o máximo
        expect(ficha.mana.atual).toBe(90); // 90 <= novo máximo (100) -> sem clamp nenhum
    });

    it('mana que ultrapassa o novo máximo mais baixo É clampada, mas exatamente no teto — não numa fração dele', () => {
        const ficha = { mana: { base: 100, atual: 150, mFormas: 2 } }; // máximo antigo=200
        const oldM = capturarMaximosAtuais(ficha, ['mana']);

        ficha.mana.mFormas = 1; // novo máximo=100 — atual(150) ultrapassa

        rescalarVitaisProporcional(ficha, oldM, ['mana']);

        expect(ficha.mana.atual).toBe(100); // clampado no teto, não em 150*0.5=75
    });

    it('maximosAntigos ausente/omitido não afeta o resultado — a função não depende mais dele pro cálculo', () => {
        const ficha = { vida: { base: 100, atual: 50 } };
        expect(() => rescalarVitaisProporcional(ficha, {}, ['vida'])).not.toThrow();
        // atual(50) <= novoMax(100) -> sem clamp, permanece 50 independente de maximosAntigos.
        expect(ficha.vida.atual).toBe(50);
    });
});
