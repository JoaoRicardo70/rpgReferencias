import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArsenalFormProvider, useArsenalForm } from './ArsenalFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { aplicarRegeneracaoDeTurno, getTetoExibidoComFator } from '../../core/vitals';
import { calcularFatorMultiplicadorForca } from '../../core/poder';

// ---------------------------------------------------------------------------
// QA — regressão: equipar/desequipar a arma pelo Arsenal (ArsenalFormContext.toggleEquiparItem)
// drenava Vida/Energias de personagens com Multiplicador de Força > 1 (o travamento de vitais
// clampava contra o teto SEM o fator). Mesmo harness de ArsenalFormContext.toggleEquiparItem.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { inventario: [] },
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        itemEditandoId: null,
        setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [],
        setEfeitosTempArsenal: vi.fn(),
        efeitosTempPassivosArsenal: [],
        setEfeitosTempPassivosArsenal: vi.fn(),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = useArsenalForm();
    return null;
}

function statBase(base, extra = {}) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, ...extra };
}
// Mesmo fixture de criarFichaMinima (core/vitals.test.js): fator 2 em vida.
function fichaComFator(extra = {}) {
    return {
        vida: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        mana: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        aura: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        chakra: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        corpo: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        forca: statBase(1000000), destreza: statBase(1000000), inteligencia: statBase(1000000),
        sabedoria: statBase(1000000), energiaEsp: statBase(1000000), carisma: statBase(1000000),
        stamina: statBase(1000000), constituicao: statBase(1000000),
        inventario: [{ id: 1, nome: 'Espada', tipo: 'arma', equipado: false, efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 10 }] }],
        ...extra,
    };
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('ArsenalFormContext — toggleEquiparItem() com Multiplicador de Força > 1', () => {
    it('equipar e desequipar a arma NÃO drena Vida/Energias que estavam cheias (teto com fator)', () => {
        const ficha = fichaComFator();
        expect(calcularFatorMultiplicadorForca(ficha, 'vida')).toBeGreaterThan(1);
        aplicarRegeneracaoDeTurno(ficha);
        const antes = {};
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => {
            antes[k] = ficha[k].atual;
            expect(antes[k]).toBe(getTetoExibidoComFator(k, ficha));
        });
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); });
        expect(ficha.inventario[0].equipado).toBe(true);
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => expect(ficha[k].atual).toBe(antes[k]));

        act(() => { probe.toggleEquiparItem(1); });
        expect(ficha.inventario[0].equipado).toBe(false);
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => expect(ficha[k].atual).toBe(antes[k]));
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(2);
    });

    it('trocar de arma (auto-desequipa a anterior) também não drena as barras cheias', () => {
        const ficha = fichaComFator();
        ficha.inventario.push({ id: 2, nome: 'Lança', tipo: 'arma', equipado: false, efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 5 }] });
        aplicarRegeneracaoDeTurno(ficha);
        const antes = { vida: ficha.vida.atual, mana: ficha.mana.atual };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); });
        act(() => { probe.toggleEquiparItem(2); });

        expect(ficha.inventario[0].equipado).toBe(false);
        expect(ficha.inventario[1].equipado).toBe(true);
        expect(ficha.vida.atual).toBe(antes.vida);
        expect(ficha.mana.atual).toBe(antes.mana);
    });
});
