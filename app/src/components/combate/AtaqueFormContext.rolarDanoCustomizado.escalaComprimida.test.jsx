import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — rolarDanoCustomizado() (AtaqueFormContext.jsx): mesma regressão da 6ª rodada do
// vazamento de Energia, na cópia MANUAL do cálculo de custo (Cálculo Livre), agora com números
// realmente comprimidos (p > 0) — ver PoderesFormContext.dispararAtaque.escalaComprimida.test.jsx
// para o caso irmão em dispararAtaque.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 0, letalidade: 0, rolagem: '' })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { poderes: [], inventario: [] },
        meuNome: 'Heroi',
        personagens: {},
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        setAbaAtiva: vi.fn(),
        feedCombate: [],
        alvoSelecionado: null,
        dummies: {},
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = useAtaqueForm();
    return null;
}

function montarComprimida(fichaOverrides = {}) {
    const minhaFicha = {
        poderes: [], inventario: [], passivas: [], ataquesElementais: [],
        mana: { base: 5000000000, atual: 500000000 },   // 10 dígitos brutos -> comprime p=1, mxDisplay=500.000.000
        vida: { base: 1000000, atual: 1000000 },
        combate: {},
        hierarquia: {},
        ...fichaOverrides,
    };
    montarStore({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
    return minhaFicha;
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
});

afterEach(() => cleanup());

describe('rolarDanoCustomizado — REGRESSÃO 6ª rodada: custo % sobre o máximo EXIBIDO (comprimido), não sobre o bruto', () => {
    it('custo de 10% de Mana com o máximo comprimido drena 10% do mxDisplay (50.000.000), não do bruto (que zeraria o pool)', () => {
        const ficha = montarComprimida();

        act(() => { probe.rolarDanoCustomizado('10', 0, 'mana', 10); });

        // ANTES da correção: custoCalculado = floor(5.000.000.000 * 0.10) = 500.000.000 -> zerava
        // o pool inteiro. DEPOIS: custoCalculado = floor(500.000.000 * 0.10) = 50.000.000.
        expect(ficha.mana.atual).toBe(450000000);
    });

    it('custo de 100% drena o pool exibido inteiro até 0, nunca negativo', () => {
        const ficha = montarComprimida();
        act(() => { probe.rolarDanoCustomizado('10', 0, 'mana', 100); });
        expect(ficha.mana.atual).toBe(0);
    });

    it('energiaTipo="nenhum" (padrão) nunca debita energia nenhuma, mesmo em escala comprimida', () => {
        const ficha = montarComprimida();
        act(() => { probe.rolarDanoCustomizado('10', 0, 'nenhum', 50); });
        expect(ficha.mana.atual).toBe(500000000);
    });

    it('chama salvarFichaSilencioso e enviarParaFeed ao concluir', () => {
        montarComprimida();
        act(() => { probe.rolarDanoCustomizado('10', 0, 'mana', 10); });
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalled();
    });
});
