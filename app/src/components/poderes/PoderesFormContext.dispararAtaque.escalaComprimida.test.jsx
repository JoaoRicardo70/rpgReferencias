import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — dispararAtaque() (PoderesFormContext.jsx): regressão dedicada da 6ª rodada do vazamento
// de Energia, com números REALMENTE comprimidos (p > 0).
//
// PoderesFormContext.dispararAtaque.test.jsx já cobre a lógica de Overcharge/Maestria com bases
// de 1.000.000 (7 dígitos) — abaixo da fronteira de compressão de mana/aura/chakra (9 dígitos,
// ver core/vitals.js > calcVitalScale), então nunca exercitam de fato p > 0. Este arquivo cobre
// exatamente o cenário em que o bug acontecia: um personagem já progredido, com o máximo bruto
// cruzando a fronteira de dígitos e "atual" guardado na escala JÁ COMPRIMIDA.
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
        setPoderEditandoId: vi.fn(),
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

// Máximo bruto de 5.000.000.000 (10 dígitos) cruza a fronteira de compressão de mana/aura/chakra
// (limite 9) -> calcVitalScale comprime p=1, mxDisplay = 500.000.000. "atual" é guardado JÁ nessa
// escala comprimida (mesma convenção real de capturarMaximosAtuais/rescalarVitaisProporcional).
function montarComprimida(fichaOverrides = {}) {
    const minhaFicha = {
        poderes: [],
        mana: { base: 5000000000, atual: 500000000 },
        aura: { base: 5000000000, atual: 500000000 },
        chakra: { base: 5000000000, atual: 500000000 },
        combate: { fadigaExtra: 0 },
        dominios: {},
        ...fichaOverrides,
    };
    montarStore({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
    render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
    return minhaFicha;
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
});

afterEach(() => cleanup());

describe('dispararAtaque — REGRESSÃO 6ª rodada: custo % calculado sobre o máximo EXIBIDO (comprimido), não sobre o bruto', () => {
    it('Habilidade não-elemental com custoPercentual=10% drena 10% do mxDisplay (50.000.000), NUNCA o máximo bruto (que teria drenado o pool inteiro)', () => {
        const ficha = montarComprimida();
        const poder = { id: 1, nome: 'Golpe Comprimido', categoria: 'poder', vertente: 'Físico', elemento: '', custoPercentual: 10, dadosQtd: 1, dadosFaces: 6 };

        act(() => { probe.dispararAtaque(poder); });

        // ANTES da correção: drain = floor(5.000.000.000 * 0.10) = 500.000.000 -> zerava o pool
        // inteiro (500.000.000 - 500.000.000 = 0). DEPOIS da correção: drain = floor(500.000.000
        // * 0.10) = 50.000.000 -> sobra 450.000.000.
        expect(ficha.mana.atual).toBe(450000000);
        expect(ficha.aura.atual).toBe(450000000);
        expect(ficha.chakra.atual).toBe(450000000);
    });

    it('custoPercentual=100% drena o pool exibido inteiro (450.000.000 -> 0), nunca fica negativo', () => {
        const ficha = montarComprimida();
        const poder = { id: 2, nome: 'Ultimate', categoria: 'poder', vertente: 'Físico', elemento: '', custoPercentual: 100, dadosQtd: 1, dadosFaces: 6 };

        act(() => { probe.dispararAtaque(poder); });

        expect(ficha.mana.atual).toBe(0);
        expect(ficha.aura.atual).toBe(0);
        expect(ficha.chakra.atual).toBe(0);
    });

    it('Elemental com Overcharge (custo x2 no Domínio nível 0): 10% * 2 = 20% do mxDisplay comprimido (100.000.000), não do bruto', () => {
        const ficha = montarComprimida({ dominios: {} });
        act(() => { probe.setOverchargeAtivo(true); });
        const poder = { id: 3, nome: 'Rajada Comprimida', categoria: 'poder', vertente: 'Elemental', elemento: 'Fogo', custoPercentual: 10, dadosQtd: 1, dadosFaces: 6 };

        act(() => { probe.dispararAtaque(poder); });

        // custoFinalPerc = 10 * 2.0 = 20% -> drain = floor(500.000.000 * 0.20) = 100.000.000.
        expect(ficha.mana.atual).toBe(400000000);
    });

    it('vitais com bases DIFERENTES (escalas diferentes) drenam cada um proporcional ao SEU PRÓPRIO mxDisplay, sem vazar entre si', () => {
        const ficha = montarComprimida({
            mana: { base: 5000000000, atual: 500000000 },   // p=1, mxDisplay=500.000.000
            aura: { base: 1000000, atual: 1000000 },         // sem compressão, mxDisplay=1.000.000
            chakra: { base: 5000000000, atual: 500000000 },
        });
        const poder = { id: 4, nome: 'Golpe Misto', categoria: 'poder', vertente: 'Físico', elemento: '', custoPercentual: 10, dadosQtd: 1, dadosFaces: 6 };

        act(() => { probe.dispararAtaque(poder); });

        expect(ficha.mana.atual).toBe(450000000);   // 10% de 500.000.000
        expect(ficha.aura.atual).toBe(900000);       // 10% de 1.000.000 (sem compressão)
        expect(ficha.chakra.atual).toBe(450000000);
    });

    it('chama salvarFichaSilencioso normalmente mesmo em escala comprimida', () => {
        montarComprimida();
        act(() => { probe.dispararAtaque({ id: 5, nome: 'X', categoria: 'poder', vertente: 'Físico', custoPercentual: 5, dadosQtd: 1, dadosFaces: 6 }); });
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
});
