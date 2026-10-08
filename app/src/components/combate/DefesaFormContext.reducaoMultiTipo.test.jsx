import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - Habilidades de Reducao de Dano com VARIOS alvos (elementos[]), tipo passiva/ativa e elementos novos.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
}));
vi.mock('../../core/engine', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, calcularCA: vi.fn(() => 10) };
});
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn(() => null) };
});

const FATOR = 1000;
const VIDA_BASE = 200000000;
let probe;
function Harness() { probe = useDefesaForm(); return null; }

function fichaReal(extra = {}) {
    return {
        vida: { base: VIDA_BASE, atual: VIDA_BASE, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' },
        mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        afinidades: {}, inventario: [], poderes: [],
        ...extra,
    };
}

function montar(ficha) {
    const state = {
        minhaFicha: ficha, meuNome: 'Eu', personagens: {}, dummies: {}, feedCombate: [], divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(ficha)), setAbaAtiva: vi.fn(), cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<DefesaFormProvider><Harness /></DefesaFormProvider>);
    return ficha;
}

function receber(dano, elemento) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    if (elemento) act(() => { probe.setElementoInc(elemento); });
    act(() => { probe.sofrerDanoBruto(); });
}
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];

const PELE = { id: 'p', nome: 'Pele', percentual: 40, elementos: ['fogo', 'agua'] };

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('DefesaFormContext.sofrerDanoBruto - reducao multi-tipo', () => {
    it.each(['fogo', 'agua'])('(a) Pele 40%% [fogo, agua] reduz dano de %s (1000 -> 600)', (el) => {
        const ficha = montar(fichaReal({ reducoesDano: [PELE] }));
        receber(1000, el);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 600 * FATOR);
        expect(ultimoFeed().texto).toContain('Pele');
    });

    it('(a) Pele nao reduz dano de Terra (1000 integral)', () => {
        const ficha = montar(fichaReal({ reducoesDano: [PELE] }));
        receber(1000, 'terra');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 1000 * FATOR);
        expect(ultimoFeed().texto).not.toContain('Pele');
    });

    it('(a) Terra existe na lista de elementos da Defesa', () => {
        montar(fichaReal({ reducoesDano: [PELE] }));
        expect(probe.elementosDinamicos.some(e => e.id === 'terra')).toBe(true);
    });

    it('(b) passiva com ativa:false ainda reduz', () => {
        const ficha = montar(fichaReal({ reducoesDano: [{ ...PELE, tipo: 'passiva', ativa: false }] }));
        receber(1000, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 600 * FATOR);
    });

    it('(b) ativa com ativa:false nao reduz', () => {
        const ficha = montar(fichaReal({ reducoesDano: [{ ...PELE, tipo: 'ativa', ativa: false }] }));
        receber(1000, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 1000 * FATOR);
        expect(ultimoFeed().texto).not.toContain('Pele');
    });

    it('(c) elemento novo Madeira (Yang) com pol:yang reduz; Fogo (Yin) nao', () => {
        const yang = { id: 'y', nome: 'Guarda Yang', percentual: 50, elementos: ['pol:yang'] };
        const ficha = montar(fichaReal({ reducoesDano: [yang] }));
        expect(probe.elementosDinamicos.some(e => e.id === 'madeira')).toBe(true);
        receber(1000, 'madeira');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 500 * FATOR);
        expect(ultimoFeed().texto).toContain('Guarda Yang');
        cleanup();
        const f2 = montar(fichaReal({ reducoesDano: [yang] }));
        receber(1000, 'fogo');
        expect(f2.vida.atual).toBe(VIDA_BASE - 1000 * FATOR);
    });
});
