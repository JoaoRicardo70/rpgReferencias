import { describe, it, expect } from 'vitest';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from './vitals';
import { getMaximo } from './attributes.js';

// ---------------------------------------------------------------------------
// QA — capturarMaximosAtuais / rescalarVitaisProporcional (core/vitals.js)
//
// Bug fix: ativar/desativar uma Forma/equipamento (togglePoder e ativarFormaPoder
// em PoderesFormContext.jsx, ativarFormaItem em ArsenalFormContext.jsx) rescala
// proporcionalmente ".atual" de cada vital quando o máximo calculado (getMaximo)
// muda. O bug: mesmo quando o máximo NÃO mudava (razão exatamente 1, ex.: uma
// Forma que nem afeta aquele vital), um "atual" fracionário (edição manual, conta
// anterior não-inteira) era arredondado pra baixo (Math.floor) e ia "vazando"
// energia a cada toggle. A correção: nunca reduzir "atual" quando o máximo NÃO
// encolheu (novoMax >= oldMax).
//
// Fixture: usa só ficha[vital] = {base, atual} — getMaximo (core/attributes.js)
// funciona com o mínimo, sem precisar de poderes/inventario/passivas (mesma
// técnica de core/fadiga.test.js > fichaCheia).
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

    it('vital sem máximo válido cai no fallback de 1 (nunca 0, evita divisão por zero na rescala)', () => {
        const ficha = { vida: {} }; // sem base -> getMaximo retorna 0
        const maximos = capturarMaximosAtuais(ficha, ['vida']);
        expect(maximos.vida).toBe(1);
    });
});

describe('core/vitals - rescalarVitaisProporcional: REGRESSÃO — razão 1 (máximo inalterado) nunca trunca "atual" fracionário pra baixo', () => {
    it('BUG CENTRAL: atual fracionário (79.5) com máximo INALTERADO permanece 79.5, não é arredondado pra 79', () => {
        // base=100 -> getMaximo=100 (sem multiplicadores). "atual" editado manualmente pra um
        // valor fracionário — cenário real: alguma conta anterior não-inteira deixou resíduo.
        const ficha = { vida: { base: 100, atual: 79.5 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        // Nada muda na ficha entre a captura e a rescala -> razão exatamente 1.
        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        expect(ficha.vida.atual).toBe(79.5);
    });

    it('mesmo repetindo o toggle várias vezes seguidas (razão 1 toda vez), "atual" fracionário nunca degrada', () => {
        const ficha = { vida: { base: 100, atual: 79.5 } };
        for (let i = 0; i < 5; i++) {
            const oldM = capturarMaximosAtuais(ficha, ['vida']);
            rescalarVitaisProporcional(ficha, oldM, ['vida']);
        }
        expect(ficha.vida.atual).toBe(79.5);
    });

    it('um "atual" já inteiro com máximo inalterado permanece idêntico (sem drenar nada)', () => {
        const ficha = { vida: { base: 100, atual: 42 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']);
        rescalarVitaisProporcional(ficha, oldM, ['vida']);
        expect(ficha.vida.atual).toBe(42);
    });
});

describe('core/vitals - rescalarVitaisProporcional: máximo AUMENTA (Forma ativando) — atual cresce proporcionalmente', () => {
    it('dobrar o máximo (mFormas=2) dobra "atual", preservando a fração cheia/vazia (50%)', () => {
        const ficha = { vida: { base: 100, atual: 50 } }; // 50% de 100
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        // Simula ativar uma Forma que dobra o máximo de vida.
        ficha.vida.mFormas = 2;

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        const novoMax = getMaximo(ficha, 'vida');
        expect(novoMax).toBe(200);
        expect(ficha.vida.atual).toBe(100); // 50 * (200/100) = 100
        expect(ficha.vida.atual / novoMax).toBeCloseTo(0.5, 6);
    });

    it('um aumento não-exato de máximo ainda preserva a fração aproximada (arredondando pra baixo)', () => {
        const ficha = { vida: { base: 100, atual: 33 } }; // 33%
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        ficha.vida.mFormas = 3; // máximo passa a 300

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        // 33 * (300/100) = 99 -> exato, sem arredondamento fracionário aqui.
        expect(ficha.vida.atual).toBe(99);
    });
});

describe('core/vitals - rescalarVitaisProporcional: máximo DIMINUI (Forma desativando) — atual encolhe proporcionalmente', () => {
    it('reduzir o máximo pela metade reduz "atual" pela metade, nunca deixando acima do novo máximo', () => {
        const ficha = { vida: { base: 100, atual: 150, mFormas: 2 } }; // máximo=200, atual=150 (75%)
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        ficha.vida.mFormas = 1; // desativa a Forma -> máximo volta a 100

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        const novoMax = getMaximo(ficha, 'vida');
        expect(novoMax).toBe(100);
        expect(ficha.vida.atual).toBe(75); // 150 * (100/200) = 75
        expect(ficha.vida.atual).toBeLessThanOrEqual(novoMax);
        expect(ficha.vida.atual / novoMax).toBeCloseTo(0.75, 6);
    });

    it('"atual" que já ultrapassava o NOVO máximo (edição manual anterior) é clampado no novo teto, nunca deixado acima dele', () => {
        const ficha = { vida: { base: 100, atual: 200, mFormas: 2 } }; // máximo antigo=200
        const oldM = capturarMaximosAtuais(ficha, ['vida']); // oldMax=200

        ficha.vida.mFormas = 1; // novo máximo=100
        // Simula "atual" tendo sido editado manualmente pra um valor MUITO acima do que a razão
        // de escala normal produziria (200 -> escala 0.5 -> 100, ainda no teto exato; usa 400
        // pra forçar realmente estourar o teto após a escala).
        ficha.vida.atual = 400;

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        const novoMax = getMaximo(ficha, 'vida'); // 100
        // 400 * (100/200) = 200, ainda acima do novo máximo (100) -> clamp final força = novoMax.
        expect(ficha.vida.atual).toBe(novoMax);
        expect(ficha.vida.atual).toBe(100);
    });
});

describe('core/vitals - rescalarVitaisProporcional: clamps finais (negativo/NaN/acima do máximo)', () => {
    it('"atual" negativo nunca sobrevive à rescala — clamp final força para o novo máximo', () => {
        const ficha = { vida: { base: 100, atual: -50 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']); // oldMax=100, razão=1

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        // novoAtual bruto = floor(-50*1) = -50 (negativo) -> clamp final: novoAtual = novoMax.
        expect(ficha.vida.atual).toBe(100);
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

    it('resultado nunca ultrapassa o novo máximo, mesmo em cenários de aumento agressivo de máximo', () => {
        const ficha = { vida: { base: 100, atual: 100 } };
        const oldM = capturarMaximosAtuais(ficha, ['vida']);

        ficha.vida.mFormas = 1000; // aumento absurdo de máximo

        rescalarVitaisProporcional(ficha, oldM, ['vida']);

        const novoMax = getMaximo(ficha, 'vida');
        expect(ficha.vida.atual).toBeLessThanOrEqual(novoMax);
        expect(ficha.vida.atual).toBe(100000); // 100 * (100000/100) = 100000, exatamente o teto
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

    it('rescala múltiplos vitais de forma independente na mesma chamada (um cresce, outro encolhe)', () => {
        const ficha = {
            vida: { base: 100, atual: 50 },
            mana: { base: 100, atual: 90, mFormas: 2 }, // máximo antigo=200
        };
        const oldM = capturarMaximosAtuais(ficha, ['vida', 'mana']); // vida=100, mana=200

        ficha.vida.mFormas = 2; // vida: máximo 100 -> 200 (cresce)
        ficha.mana.mFormas = 1; // mana: máximo 200 -> 100 (encolhe)

        rescalarVitaisProporcional(ficha, oldM, ['vida', 'mana']);

        expect(ficha.vida.atual).toBe(100); // 50 * (200/100)
        expect(ficha.mana.atual).toBe(45); // 90 * (100/200)
    });

    it('maximosAntigos ausente para um vital específico usa o fallback de 1 como oldMax (sem lançar)', () => {
        const ficha = { vida: { base: 100, atual: 50 } };
        expect(() => rescalarVitaisProporcional(ficha, {}, ['vida'])).not.toThrow();
        // oldMax cai no fallback (1) -> razão = novoMax/1 = 100 -> 50*100=5000, clampado no novoMax (100).
        expect(ficha.vida.atual).toBe(100);
    });
});
