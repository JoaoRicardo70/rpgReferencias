import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFichaAlvoSilencioso, enviarParaFeed } from '../../services/firebase-sync';

// QA - DefesaFormContext dentro/fora de um FichaAlvoProvider (Mestre vendo a Ficha de outro personagem na pagina 8):
// evasiva/resistencia/dano sofrido agem na ficha E assinam com o nome do ALVO.

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
    enviarParaFeed: vi.fn(),
}));
// CA identifica a ficha: cada uma carrega o proprio "caTeste".
vi.mock('../../core/engine', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, calcularCA: vi.fn((f) => f?.caTeste ?? 0) };
});
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn(() => null) };
});

const VIDA_BASE = 200000000;
const FATOR = 1000;
function fichaReal(caTeste) {
    return {
        caTeste,
        vida: { base: VIDA_BASE, atual: VIDA_BASE, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' },
        mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        afinidades: {}, inventario: [], poderes: [],
    };
}

let state;
function montarStore() {
    state = {
        minhaFicha: fichaReal(11),
        personagens: { Outro: fichaReal(77) },
        meuNome: 'Heroi', dummies: {}, feedCombate: [], divisorPoderMesa: 1, cenario: { zonas: [] },
        setAbaAtiva: vi.fn(),
        updateFicha: vi.fn((cb) => cb(state.minhaFicha)),
        updateFichaAlvo: vi.fn((nome, cb) => cb(state.personagens[nome])),
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    useStore.getState = () => state;
    return state;
}

let probe;
function Harness() { probe = useDefesaForm(); return null; }
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];
const receber = (dano) => {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    act(() => { probe.sofrerDanoBruto(); });
};

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); });
afterEach(() => { cleanup(); probe = undefined; });

describe('DefesaFormContext FORA de FichaAlvoProvider', () => {
    it('evasiva usa a minha CA e o meuNome; dano sofrido grava em minhaFicha e salva com salvarFichaSilencioso', () => {
        montarStore();
        render(<DefesaFormProvider><Harness /></DefesaFormProvider>);
        act(() => { probe.declararEvasiva(); });
        expect(ultimoFeed()).toMatchObject({ tipo: 'evasiva', nome: 'Heroi', total: 11 });
        receber(60);
        expect(state.minhaFicha.vida.atual).toBe(VIDA_BASE - 60 * FATOR);
        expect(state.updateFicha).toHaveBeenCalled();
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });
});

describe('DefesaFormContext DENTRO de FichaAlvoProvider mirando outro personagem', () => {
    const renderAlvo = () => render(<FichaAlvoProvider nome="Outro"><DefesaFormProvider><Harness /></DefesaFormProvider></FichaAlvoProvider>);

    it('declararEvasiva usa a CA DELE e o nome DELE', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.declararEvasiva(); });
        expect(ultimoFeed()).toMatchObject({ tipo: 'evasiva', nome: 'Outro', total: 77 });
        expect(state.setAbaAtiva).toHaveBeenCalledWith('aba-log');
    });

    it('declararResistencia usa a CA DELE e soma prof/bonus', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.setResProf(3); });
        act(() => { probe.setResBonus(2); });
        act(() => { probe.declararResistencia(); });
        expect(ultimoFeed()).toMatchObject({ tipo: 'resistencia', nome: 'Outro', total: 77 + 3 + 2 });
    });

    it('sofrerDanoBruto tira vida da ficha DELE (updateFichaAlvo), salva via salvarFichaAlvoSilencioso e assina com o nome DELE', () => {
        montarStore();
        renderAlvo();
        receber(60);
        expect(state.personagens.Outro.vida.atual).toBe(VIDA_BASE - 60 * FATOR);
        expect(state.minhaFicha.vida.atual).toBe(VIDA_BASE);
        expect(state.updateFichaAlvo).toHaveBeenCalledWith('Outro', expect.any(Function));
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(ultimoFeed().nome).toBe('Outro');
        expect(ultimoFeed().texto).toContain('Recebeu 60 de dano');
    });

    it('declararReducao nunca toca a minha ficha quando o alvo e outro', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.setRedPerc(50); });
        act(() => { probe.declararReducao(); });
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        if (enviarParaFeed.mock.calls.length) expect(ultimoFeed().nome).toBe('Outro');
        else expect(window.alert).toHaveBeenCalled();
    });
});
