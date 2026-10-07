import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - sofrerDanoBruto aplica Reducoes de Dano em SEQUENCIA (core/reducaoDano.js):
// 100 de dano, Reducao 20% geral (-> 80) e Resistencia 30% a Fogo (-> 56).

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
const FOGO30 = { id: 'b', nome: 'Resistencia a Fogo', percentual: 30, elemento: 'fogo' };

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('DefesaFormContext.sofrerDanoBruto - reducao sequencial', () => {
    it('Happy: 20% geral + 30% Fogo sobre 100 de dano de Fogo = 56 (nao 50)', () => {
        const ficha = montar(fichaReal({ reducoesDano: [GERAL20, FOGO30] }));
        receber(100, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 56 * FATOR);
        const texto = ultimoFeed().texto;
        expect(texto).toContain('Recebeu 56 de dano');
        expect(texto).toMatch(/100 → −20% Armadura → 80 → −30% Resistencia a Fogo → 56/);
    });

    it('Resistencia de Fogo NAO vale contra dano fisico: so os 20% gerais (80)', () => {
        const ficha = montar(fichaReal({ reducoesDano: [GERAL20, FOGO30] }));
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 80 * FATOR);
        expect(ultimoFeed().texto).not.toContain('Resistencia a Fogo');
    });

    it('sem reducoes: dano integral e sem sequencia no texto', () => {
        const ficha = montar(fichaReal());
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 100 * FATOR);
        expect(ultimoFeed().texto).not.toContain('→');
    });

    it('Edge: reducao de 100% e imune (0 de dano)', () => {
        const ficha = montar(fichaReal({ reducoesDano: [{ id: 'x', nome: 'Imune', percentual: 100, elemento: 'todos' }] }));
        receber(100, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE);
        expect(ultimoFeed().texto).toContain('Recebeu 0 de dano');
    });

    it('Edge: percentual negativo (vulneravel -100%) dobra o dano', () => {
        const ficha = montar(fichaReal({ reducoesDano: [{ id: 'x', nome: 'Vuln', percentual: -100, elemento: 'todos' }] }));
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 200 * FATOR);
    });

    it('Edge: afinidade Resistente (50%) entra na sequencia depois da reducao geral (100 -> 80 -> 40)', () => {
        const ficha = montar(fichaReal({ reducoesDano: [GERAL20], afinidades: { resistencias: ['fogo'] } }));
        receber(100, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 40 * FATOR);
    });

    it('Edge: reducao com percentual 0 ou entrada nula e ignorada', () => {
        const ficha = montar(fichaReal({ reducoesDano: [null, { id: 'z', nome: 'Zero', percentual: 0, elemento: 'todos' }] }));
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 100 * FATOR);
    });

    it('Edge: efeito ativo reducao_dano entra na sequencia (Poder 50% + lista 20% = 40)', () => {
        const poder = { id: 'p1', nome: 'Barreira', ativa: true, efeitos: [{ atributo: 'reducao_dano', propriedade: 'base', valor: 50, nome: 'Barreira' }] };
        const ficha = montar(fichaReal({ reducoesDano: [GERAL20], poderes: [poder] }));
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 40 * FATOR);
    });

    it('Error: dano invalido (0) alerta e nao mexe na vida', () => {
        const ficha = montar(fichaReal({ reducoesDano: [GERAL20] }));
        act(() => { probe.setDanoRecebidoInc('0'); });
        act(() => { probe.sofrerDanoBruto(); });
        expect(window.alert).toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(ficha.vida.atual).toBe(VIDA_BASE);
    });
});
