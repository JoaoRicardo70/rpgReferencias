import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// Escudos e Vida Temporaria no dano recebido pelo proprio personagem (Defesa > Receber Dano).

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

const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];
function receber(dano) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    act(() => { probe.sofrerDanoBruto(); });
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('Defesa - Receber Dano com escudos', () => {
    it('escudo absorve tudo: Vida intacta, escudo diminui, feed avisa', () => {
        const f = montar(fichaReal({ escudos: [{ id: 'a', nome: 'Domo', valor: 1600, tipo: 'escudo' }] }));
        receber(1000);
        expect(f.vida.atual).toBe(VIDA_BASE);
        expect(f.escudos[0].valor).toBe(600);
        expect(ultimoFeed().texto).toContain('Eu absorveu 1.000 (restam 600)');
    });
    it('a sobra vai para a Vida e o escudo zerado sai da ficha; escudo antes da vida temporaria', () => {
        const f = montar(fichaReal({ escudos: [
            { id: 'v', nome: 'Vida Falsa', valor: 100, tipo: 'vidaTemporaria' },
            { id: 'a', nome: 'Parede', valor: 300, tipo: 'escudo' },
        ] }));
        receber(1000);
        expect(f.escudos).toBeUndefined();
        expect(f.vida.atual).toBe(VIDA_BASE - 600 * FATOR);
    });
    it('sem escudos (ficha antiga): igual a antes, sem criar a chave', () => {
        const f = montar(fichaReal());
        receber(1000);
        expect(f.vida.atual).toBe(VIDA_BASE - 1000 * FATOR);
        expect('escudos' in f).toBe(false);
        expect(ultimoFeed().texto).not.toContain('absorveu');
    });
});
