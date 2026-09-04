import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — dispararAtaque(): casos de FRONTEIRA da Maestria de Habilidades não cobertos ainda por
// PoderesFormContext.dispararAtaque.test.jsx (que já cobre 0 vs 100, 80 vs 80, e a soma com
// Overcharge). Aqui: maestriaRequerida = 100 (o teto exato do campo) em combinação com maestria
// também no teto (sem Fadiga) e maestria em 99 (a distância mínima possível > 0).
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

function habilidade(overrides = {}) {
    return {
        id: 3, nome: 'Golpe Estudado', categoria: 'habilidade', vertente: 'Físico', elemento: '',
        custoPercentual: 0, dadosQtd: 1, dadosFaces: 6,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
});

afterEach(() => cleanup());

describe('dispararAtaque — Maestria de Habilidades: fronteiras do requisito máximo (maestriaRequerida = 100)', () => {
    it('maestriaRequerida = 100 e maestria = 100 (ambos no teto exato): distância 0, nenhuma Fadiga', () => {
        const ficha = montar();
        act(() => { probe.dispararAtaque(habilidade({ maestria: 100, maestriaRequerida: 100 })); });
        expect(ficha.combate.fadigaExtra).toBe(0);
    });

    it('maestriaRequerida = 100 e maestria = 99 (a menor distância possível > 0): soma 1/100 do peso máximo (0.1)', () => {
        const ficha = montar();
        act(() => { probe.dispararAtaque(habilidade({ maestria: 99, maestriaRequerida: 100 })); });
        expect(ficha.combate.fadigaExtra).toBeCloseTo(0.1, 6);
    });

    it('maestriaRequerida = 100 e maestria ausente (undefined, tratada como 0): pior caso, soma o peso máximo (10)', () => {
        const ficha = montar();
        act(() => { probe.dispararAtaque(habilidade({ maestria: undefined, maestriaRequerida: 100 })); });
        expect(ficha.combate.fadigaExtra).toBeCloseTo(10, 6);
    });

    it('maestria acima de 100 (dado corrompido/legado) é clampada e nunca produz Fadiga negativa contra requisito 100', () => {
        const ficha = montar();
        act(() => { probe.dispararAtaque(habilidade({ maestria: 150, maestriaRequerida: 100 })); });
        expect(ficha.combate.fadigaExtra).toBe(0);
    });

    it('disparar a MESMA Habilidade abaixo do requisito duas vezes seguidas ACUMULA a Fadiga (não substitui)', () => {
        const ficha = montar();
        act(() => { probe.dispararAtaque(habilidade({ maestria: 50, maestriaRequerida: 100 })); }); // +5
        act(() => { probe.dispararAtaque(habilidade({ maestria: 50, maestriaRequerida: 100 })); }); // +5
        expect(ficha.combate.fadigaExtra).toBeCloseTo(10, 6);
    });
});
