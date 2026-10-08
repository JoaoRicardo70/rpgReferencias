import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - Reducao de Dano por POLARIDADE ('pol:yin|yang|neutro') em sofrerDanoBruto.
// Fogo = Yin, Vento = Yang (core/polaridade.js).

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

const GERAL20 = { id: 'a', nome: 'Armadura', percentual: 20, elemento: 'todos' };
const YIN30 = { id: 'b', nome: 'Guarda Yin', percentual: 30, elemento: 'pol:yin' };

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('DefesaFormContext.sofrerDanoBruto - reducao por polaridade', () => {
    it('Happy: 1000 de Fogo (Yin) com pol:yin 30% + geral 20% = 560 em sequencia', () => {
        const ficha = montar(fichaReal({ reducoesDano: [YIN30, GERAL20] }));
        receber(1000, 'Fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 560 * FATOR);
        const texto = ultimoFeed().texto;
        expect(texto).toContain('Recebeu 560 de dano');
        expect(texto).toMatch(/1000 → −30% Guarda Yin → 700 → −20% Armadura → 560/);
    });

    it('Vento (Yang): pol:yin nao vale, so a geral (800)', () => {
        const ficha = montar(fichaReal({ reducoesDano: [YIN30, GERAL20] }));
        receber(1000, 'Vento');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 800 * FATOR);
        expect(ultimoFeed().texto).not.toContain('Guarda Yin');
    });

    it('habilidade com ativa:false nao reduz (so a geral, 800)', () => {
        const ficha = montar(fichaReal({ reducoesDano: [{ ...YIN30, ativa: false }, GERAL20] }));
        receber(1000, 'Fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 800 * FATOR);
        expect(ultimoFeed().texto).not.toContain('Guarda Yin');
    });
});
