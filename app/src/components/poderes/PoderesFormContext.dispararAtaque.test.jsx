import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFirebaseImediato, uploadImagem } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — dispararAtaque() (PoderesFormContext.jsx): Overcharge de Técnicas Elementais
// escalado pelo Domínio (core/dominios.js).
//
// Regras exercitadas:
//   - poder.vertente contendo "elemental" (case-insensitive) + overchargeAtivo=true:
//     custo = poder.custoPercentual * calcularMultiplicadorOvercharge(ficha, elemento)
//     (2.0x no Domínio nível 0, 1.2x no nível 10), drenado de mana/aura/chakra, MAIS
//     Fadiga instantânea = calcularGanhoFadigaOvercharge(ficha, elemento) somada em
//     combate.fadigaExtra, dentro do MESMO updateFicha.
//   - Elemental SEM Overcharge: custo 0, nenhuma Fadiga, updateFicha nem é chamado.
//   - Poder NÃO-Elemental: completamente alheio ao Domínio/Overcharge — custo aplica
//     como poder.custoPercentual puro, nunca dobrado nem multiplicado pelo Domínio.
//
// Mesmo padrão de mock/harness de PoderesFormContext.maestria.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { poderes: [] },
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        efeitosTemp: [],
        setEfeitosTemp: vi.fn(),
        efeitosTempPassivos: [],
        setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null,
        setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = usePoderesForm();
    return null;
}

function montar(fichaOverrides = {}) {
    const minhaFicha = {
        poderes: [],
        mana: { base: 1000000, atual: 1000000 },
        aura: { base: 1000000, atual: 1000000 },
        chakra: { base: 1000000, atual: 1000000 },
        combate: { fadigaExtra: 0 },
        dominios: {},
        ...fichaOverrides,
    };
    montarStore({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
    render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
    return minhaFicha;
}

function poderElemental(overrides = {}) {
    return {
        id: 1, nome: 'Rajada de Fogo', vertente: 'Elemental', elemento: 'Fogo',
        custoPercentual: 10, dadosQtd: 2, dadosFaces: 6,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
});

afterEach(() => {
    cleanup();
});

describe('dispararAtaque — Elemental + Overcharge: custo escala pelo Domínio (2.0x no nível 0, 1.2x no nível 10)', () => {
    it('Domínio nível 0 (sem treino): custo drenado = custoPercentual * 2.0x (comportamento original)', () => {
        const ficha = montar({ dominios: {} });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderElemental()); });

        // custoFinalPerc = 10 * 2.0 = 20% -> drain = floor(1000000 * 0.20) = 200000.
        expect(ficha.mana.atual).toBe(800000);
        expect(ficha.aura.atual).toBe(800000);
        expect(ficha.chakra.atual).toBe(800000);
    });

    it('Domínio nível 10 ("Eterno"): custo drenado = custoPercentual * 1.2x (desconto máximo)', () => {
        const ficha = montar({ dominios: { Fogo: { nivel: 10 } } });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderElemental()); });

        // custoFinalPerc = 10 * 1.2 = 12% -> drain = floor(1000000 * 0.12) = 120000.
        expect(ficha.mana.atual).toBe(880000);
        expect(ficha.aura.atual).toBe(880000);
        expect(ficha.chakra.atual).toBe(880000);
    });

    it('Domínio nível 5 (meio do caminho): custo drenado = custoPercentual * 1.6x', () => {
        const ficha = montar({ dominios: { Fogo: { nivel: 5 } } });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderElemental()); });

        // custoFinalPerc = 10 * 1.6 = 16% -> drain = floor(1000000 * 0.16) = 160000.
        expect(ficha.mana.atual).toBe(840000);
    });

    it('chama salvarFichaSilencioso quando há custo/Fadiga aplicados', () => {
        montar({ dominios: {} });
        act(() => { probe.setOverchargeAtivo(true); });
        act(() => { probe.dispararAtaque(poderElemental()); });
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
});

describe('dispararAtaque — Elemental + Overcharge: Fadiga instantânea escala pelo Domínio (10 no nível 0, 0 no nível 10)', () => {
    it('Domínio nível 0: soma o peso MÁXIMO (10) em combate.fadigaExtra', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderElemental()); });

        expect(ficha.combate.fadigaExtra).toBeCloseTo(10, 6);
    });

    it('Domínio nível 10 ("Eterno"): NÃO adiciona NENHUMA Fadiga (ganho = 0), fadigaExtra permanece no baseline', () => {
        const ficha = montar({ dominios: { Fogo: { nivel: 10 } }, combate: { fadigaExtra: 3 } });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderElemental()); });

        expect(ficha.combate.fadigaExtra).toBeCloseTo(3, 6);
    });

    it('a Fadiga é ACUMULADA (somada ao valor pré-existente), não substituída', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 20 } });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderElemental()); });

        expect(ficha.combate.fadigaExtra).toBeCloseTo(30, 6); // 20 + 10
    });

    it('cria ficha.combate do zero se ausente, sem lançar', () => {
        const ficha = montar({ dominios: {} });
        delete ficha.combate;
        act(() => { probe.setOverchargeAtivo(true); });

        expect(() => { act(() => { probe.dispararAtaque(poderElemental()); }); }).not.toThrow();
        expect(ficha.combate.fadigaExtra).toBeCloseTo(10, 6);
    });
});

describe('dispararAtaque — Elemental SEM Overcharge: sempre gratuito, sem Fadiga nenhuma', () => {
    it('custo ZERO — nenhuma energia (mana/aura/chakra) é drenada', () => {
        const ficha = montar({ dominios: {} }); // overchargeAtivo=false por padrão

        act(() => { probe.dispararAtaque(poderElemental()); });

        expect(ficha.mana.atual).toBe(1000000);
        expect(ficha.aura.atual).toBe(1000000);
        expect(ficha.chakra.atual).toBe(1000000);
    });

    it('nenhuma Fadiga é adicionada em combate.fadigaExtra', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 5 } });
        act(() => { probe.dispararAtaque(poderElemental()); });
        expect(ficha.combate.fadigaExtra).toBe(5);
    });

    it('updateFicha NEM É CHAMADO (nem custo nem Fadiga a aplicar)', () => {
        montar({ dominios: {} });
        act(() => { probe.dispararAtaque(poderElemental()); });
        expect(mockState.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('mesmo com Domínio nível 0 (pior caso hipotético do Overcharge), continua gratuito sem Overcharge ativo', () => {
        const ficha = montar({ dominios: {} });
        act(() => { probe.dispararAtaque(poderElemental({ elemento: 'Fogo' })); });
        expect(ficha.mana.atual).toBe(1000000);
    });
});

describe('dispararAtaque — Poder NÃO-Elemental: totalmente alheio ao Domínio/Overcharge', () => {
    function poderFisico(overrides = {}) {
        return {
            id: 2, nome: 'Golpe Físico', vertente: 'Físico', elemento: '',
            custoPercentual: 10, dadosQtd: 1, dadosFaces: 8,
            ...overrides,
        };
    }

    it('custo aplica como custoPercentual PURO (nunca dobrado/multiplicado pelo Domínio), mesmo com Overcharge ativo', () => {
        const ficha = montar({ dominios: {} });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderFisico()); });

        // custoFinalPerc permanece 10% (sem multiplicador de Overcharge) -> drain = 100000.
        expect(ficha.mana.atual).toBe(900000);
        expect(ficha.aura.atual).toBe(900000);
        expect(ficha.chakra.atual).toBe(900000);
    });

    it('o mesmo custo de 10% se aplica com Overcharge DESATIVADO — Poder físico não é "gratuito" como um Elemental sem Overcharge', () => {
        const ficha = montar({ dominios: {} }); // overchargeAtivo=false
        act(() => { probe.dispararAtaque(poderFisico()); });
        expect(ficha.mana.atual).toBe(900000);
    });

    it('Domínio nível 10 no elemento (mesmo que o poder tivesse algum) NÃO afeta o custo de um poder não-elemental', () => {
        const fichaBaixo = montar({ dominios: {} });
        act(() => { probe.dispararAtaque(poderFisico()); });
        const custoBaixo = 1000000 - fichaBaixo.mana.atual;

        cleanup();

        const fichaAlto = montar({ dominios: { Fogo: { nivel: 10 } } });
        act(() => { probe.dispararAtaque(poderFisico()); });
        const custoAlto = 1000000 - fichaAlto.mana.atual;

        expect(custoBaixo).toBe(custoAlto);
    });

    it('nenhuma Fadiga é adicionada em combate.fadigaExtra, mesmo com Overcharge ativo', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 5 } });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderFisico()); });

        expect(ficha.combate.fadigaExtra).toBe(5);
    });

    it('vertente vazia/ausente também é tratada como não-elemental (sem lançar)', () => {
        const ficha = montar({ dominios: {} });
        act(() => { probe.setOverchargeAtivo(true); });

        expect(() => { act(() => { probe.dispararAtaque(poderFisico({ vertente: undefined })); }); }).not.toThrow();
        expect(ficha.mana.atual).toBe(900000);
    });
});

describe('dispararAtaque — matching de "elemental" na vertente é case-insensitive', () => {
    it('vertente "ELEMENTAL" (maiúscula) ainda é reconhecida e escala pelo Domínio', () => {
        const ficha = montar({ dominios: { Fogo: { nivel: 10 } } });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderElemental({ vertente: 'ELEMENTAL' })); });

        expect(ficha.mana.atual).toBe(880000); // 1.2x, igual ao teste de nível 10 acima
    });

    it('vertente "Elemental Composto" (contém "elemental" como substring) também é reconhecida', () => {
        const ficha = montar({ dominios: {} });
        act(() => { probe.setOverchargeAtivo(true); });

        act(() => { probe.dispararAtaque(poderElemental({ vertente: 'Elemental Composto' })); });

        expect(ficha.mana.atual).toBe(800000); // 2.0x, igual ao teste de nível 0
    });
});

describe('dispararAtaque — Maestria de Habilidades e Poderes: Fadiga extra ao usar abaixo do requisito (core/fadiga.js > calcularGanhoFadigaMaestriaInsuficiente)', () => {
    function habilidade(overrides = {}) {
        return {
            id: 3, nome: 'Golpe Estudado', categoria: 'habilidade', vertente: 'Físico', elemento: '',
            custoPercentual: 0, dadosQtd: 1, dadosFaces: 6,
            ...overrides,
        };
    }

    it('Maestria abaixo do requisito soma Fadiga instantânea proporcional à distância (0 vs 100 -> +10)', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque(habilidade({ maestria: 0, maestriaRequerida: 100 })); });
        expect(ficha.combate.fadigaExtra).toBeCloseTo(10, 6);
    });

    it('Maestria igual ou acima do requisito NÃO soma Fadiga nenhuma', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque(habilidade({ maestria: 80, maestriaRequerida: 80 })); });
        expect(ficha.combate.fadigaExtra).toBe(0);
    });

    it('sem maestriaRequerida definida (0/ausente) nunca soma Fadiga, mesmo com maestria baixa', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque(habilidade({ maestria: 0 })); });
        expect(ficha.combate.fadigaExtra).toBe(0);
    });

    // 🎓 Poderes ganharam a MESMA Maestria de Habilidades (pedido do usuário: paridade entre as
    // 3 categorias) — categoria "poder" agora gera Fadiga por Maestria insuficiente exatamente
    // como "habilidade"; só Formas ficam de fora (a Maestria delas afeta a Fadiga DINÂMICA
    // contínua enquanto ativas, ver core/fadiga.js > getFatorFormasAtivas, não este ganho
    // instantâneo por disparo).
    it('Poderes (categoria "poder") TAMBÉM geram Fadiga por Maestria insuficiente, igual Habilidades', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque({ ...habilidade({ maestria: 0, maestriaRequerida: 100 }), categoria: 'poder' }); });
        expect(ficha.combate.fadigaExtra).toBeCloseTo(10, 6);
    });

    it('Formas (categoria "forma") NUNCA geram Fadiga por Maestria neste disparo, mesmo com os campos presentes', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque({ ...habilidade({ maestria: 0, maestriaRequerida: 100 }), categoria: 'forma' }); });
        expect(ficha.combate.fadigaExtra).toBe(0);
    });

    it('a Fadiga por Maestria insuficiente SOMA com a Fadiga de Overcharge quando ambas se aplicam no mesmo disparo', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.setOverchargeAtivo(true); });
        act(() => {
            probe.dispararAtaque(habilidade({
                categoria: 'habilidade', vertente: 'Elemental', elemento: 'Fogo',
                custoPercentual: 10, maestria: 0, maestriaRequerida: 100,
            }));
        });
        // Overcharge nível 0 de Domínio: +10 (calcularGanhoFadigaOvercharge). Maestria 0 vs 100: +10.
        expect(ficha.combate.fadigaExtra).toBeCloseTo(20, 6);
    });

    it('drena energia (custoPercentual) mesmo quando a Fadiga por Maestria é o único motivo do updateFicha rodar', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque(habilidade({ custoPercentual: 0, maestria: 0, maestriaRequerida: 100 })); });
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(ficha.mana.atual).toBe(1000000); // custo 0 -> energia intocada
    });

    // ---------------------------------------------------------------------
    // QA — poder.maestria com valor não-numérico/garbage (string inválida ou null), traçado
    // END-TO-END através de dispararAtaque (não só na função pura calcularGanhoFadigaMaestriaInsuficiente
    // isoladamente, já coberta em core/fadiga.test.js) — confirma que o fallback `parseFloat(...)
    // || 0` blinda o disparo real e nunca deixa NaN vazar pra combate.fadigaExtra.
    // ---------------------------------------------------------------------
    it('poder.maestria = "abc" (string não-numérica) é tratado como 0 (parseFloat || 0) — soma a Fadiga máxima (10) contra um requisito de 100, sem NaN', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque(habilidade({ maestria: 'abc', maestriaRequerida: 100 })); });
        expect(ficha.combate.fadigaExtra).toBeCloseTo(10, 6);
        expect(Number.isNaN(ficha.combate.fadigaExtra)).toBe(false);
    });

    it('poder.maestria = null é tratado como 0 — mesmo resultado de "abc" ou de maestria=0 explícito, sem NaN', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque(habilidade({ maestria: null, maestriaRequerida: 100 })); });
        expect(ficha.combate.fadigaExtra).toBeCloseTo(10, 6);
        expect(Number.isNaN(ficha.combate.fadigaExtra)).toBe(false);
    });

    it('poder.maestriaRequerida = "xyz" (string não-numérica) é tratado como 0 (sem requisito real) — nunca soma Fadiga nem quebra o cálculo', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque(habilidade({ maestria: 0, maestriaRequerida: 'xyz' })); });
        expect(ficha.combate.fadigaExtra).toBe(0);
        expect(Number.isNaN(ficha.combate.fadigaExtra)).toBe(false);
    });

    it('categoria "poder" (não só "habilidade") também blinda contra maestria garbage sem gerar NaN', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.dispararAtaque({ ...habilidade({ maestria: 'garbage', maestriaRequerida: 50 }), categoria: 'poder' }); });
        expect(ficha.combate.fadigaExtra).toBeCloseTo(5, 6); // distancia 50 -> (50/100)*10 = 5
        expect(Number.isNaN(ficha.combate.fadigaExtra)).toBe(false);
    });

    // ---------------------------------------------------------------------
    // QA — Poder (categoria "poder") elemental + Overcharge + Maestria insuficiente ao mesmo
    // tempo: confirma que as DUAS fontes de Fadiga (Overcharge + Maestria) somam corretamente pra
    // uma categoria "poder", não só "habilidade" (já coberto acima em outro describe).
    // ---------------------------------------------------------------------
    it('categoria "poder" elemental + Overcharge ativo + maestria insuficiente: Fadiga de Overcharge e de Maestria SOMAM no mesmo disparo', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.setOverchargeAtivo(true); });
        act(() => {
            probe.dispararAtaque({
                id: 30, nome: 'Rajada Suprema', categoria: 'poder', vertente: 'Elemental', elemento: 'Fogo',
                custoPercentual: 10, dadosQtd: 1, dadosFaces: 6, maestria: 0, maestriaRequerida: 100,
            });
        });
        // Overcharge nível 0 de Domínio: +10 (calcularGanhoFadigaOvercharge). Maestria 0 vs 100: +10.
        expect(ficha.combate.fadigaExtra).toBeCloseTo(20, 6);
    });

    it('categoria "poder" elemental + Overcharge ativo + maestria JÁ suficiente: só a Fadiga de Overcharge é somada (Maestria contribui 0)', () => {
        const ficha = montar({ dominios: {}, combate: { fadigaExtra: 0 } });
        act(() => { probe.setOverchargeAtivo(true); });
        act(() => {
            probe.dispararAtaque({
                id: 31, nome: 'Rajada Dominada', categoria: 'poder', vertente: 'Elemental', elemento: 'Fogo',
                custoPercentual: 10, dadosQtd: 1, dadosFaces: 6, maestria: 100, maestriaRequerida: 100,
            });
        });
        expect(ficha.combate.fadigaExtra).toBeCloseTo(10, 6);
    });
});

describe('dispararAtaque — efeitos colaterais gerais (sempre executam, independente do ramo)', () => {
    it('sempre reseta poderPreparandoId e overchargeAtivo ao final, mesmo sem custo/Fadiga', () => {
        montar({ dominios: {} });
        act(() => { probe.setOverchargeAtivo(true); probe.setPoderPreparandoId(1); });

        act(() => { probe.dispararAtaque(poderElemental()); }); // sem Overcharge real disparado no ramo elemental... só que overchargeAtivo já true

        expect(probe.overchargeAtivo).toBe(false);
        expect(probe.poderPreparandoId).toBeNull();
    });

    it('sempre chama window.alert com um resumo do ataque', () => {
        montar({ dominios: {} });
        act(() => { probe.dispararAtaque(poderElemental({ nome: 'Chama Ardente' })); });
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('CHAMA ARDENTE');
    });
});
