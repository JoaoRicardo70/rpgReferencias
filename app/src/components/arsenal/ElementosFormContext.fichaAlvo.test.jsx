import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementosFormProvider, useElementosForm } from './ElementosFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFichaAlvoSilencioso, enviarParaFeed } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — ElementosFormContext.jsx dentro/fora de um FichaAlvoProvider (Grimório da Entidade).
// Mesmo desenho de PoderesFormContext.fichaAlvo.test.jsx: lê/grava/salva na ficha ativa e o
// rascunho (elemEditandoId) é local no modo alvo. conjurarMagia no modo alvo não faz nada.
// ---------------------------------------------------------------------------

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

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { ataquesElementais: [{ id: 1, nome: 'Bola de Fogo', elemento: 'Fogo', equipado: false }] },
        personagens: { Outro: { ataquesElementais: [{ id: 9, nome: 'Raio do Outro', elemento: 'Raio', equipado: false }] } },
        meuNome: 'Heroi',
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        updateFichaAlvo: vi.fn((nome, cb) => cb(mockState.personagens[nome])),
        setAbaAtiva: vi.fn(),
        elemEditandoId: null,
        setElemEditandoId: vi.fn(),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = useElementosForm();
    return null;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { cleanup(); probe = undefined; vi.restoreAllMocks(); });

describe('ElementosFormContext FORA de FichaAlvoProvider — comportamento de sempre', () => {
    it('lê minhaFicha da store', () => {
        const state = montarStore();
        render(<ElementosFormProvider><Harness /></ElementosFormProvider>);
        expect(probe.minhaFicha).toBe(state.minhaFicha);
    });

    it('toggleEquiparElem grava via updateFicha e salva com salvarFichaSilencioso()', () => {
        const state = montarStore();
        render(<ElementosFormProvider><Harness /></ElementosFormProvider>);

        act(() => { probe.toggleEquiparElem(1); });

        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(state.updateFichaAlvo).not.toHaveBeenCalled();
        expect(state.minhaFicha.ataquesElementais[0].equipado).toBe(true);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });

    it('deletarElem remove a magia e salva com salvarFichaSilencioso()', () => {
        const state = montarStore();
        render(<ElementosFormProvider><Harness /></ElementosFormProvider>);

        act(() => { probe.deletarElem(1); });

        expect(state.minhaFicha.ataquesElementais).toEqual([]);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });

    it('editarElem usa setElemEditandoId da STORE', () => {
        const state = montarStore();
        render(<ElementosFormProvider><Harness /></ElementosFormProvider>);

        act(() => { probe.editarElem(1); });

        expect(state.setElemEditandoId).toHaveBeenCalledWith(1);
    });

    it('conjurarMagia continua mandando o aviso ao feed (nome = meuNome) e trocando a aba pra aba-ataque', () => {
        const state = montarStore();
        render(<ElementosFormProvider><Harness /></ElementosFormProvider>);

        act(() => { probe.conjurarMagia(state.minhaFicha.ataquesElementais[0]); });

        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'sistema', nome: 'Heroi' }));
        expect(state.setAbaAtiva).toHaveBeenCalledWith('aba-ataque');
    });

    it('conjurarMagia com Provider mirando o PRÓPRIO jogador também faz as duas coisas', () => {
        const state = montarStore();
        render(<FichaAlvoProvider nome="Heroi"><ElementosFormProvider><Harness /></ElementosFormProvider></FichaAlvoProvider>);

        act(() => { probe.conjurarMagia({ nome: 'x' }); });

        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(state.setAbaAtiva).toHaveBeenCalledWith('aba-ataque');
    });
});

describe('ElementosFormContext DENTRO de <FichaAlvoProvider nome="Outro"> — mira a ficha do Outro', () => {
    const montar = () => render(<FichaAlvoProvider nome="Outro"><ElementosFormProvider><Harness /></ElementosFormProvider></FichaAlvoProvider>);

    it('lê personagens.Outro (não minhaFicha)', () => {
        const state = montarStore();
        montar();
        expect(probe.minhaFicha).toBe(state.personagens.Outro);
        expect(probe.minhaFicha).not.toBe(state.minhaFicha);
    });

    it('toggleEquiparElem grava via updateFichaAlvo("Outro", fn), nunca updateFicha, e salva via salvarFichaAlvoSilencioso("Outro")', () => {
        const state = montarStore();
        montar();

        act(() => { probe.toggleEquiparElem(9); });

        expect(state.updateFichaAlvo).toHaveBeenCalledWith('Outro', expect.any(Function));
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(state.personagens.Outro.ataquesElementais[0].equipado).toBe(true);
        expect(state.minhaFicha.ataquesElementais[0].equipado).toBe(false);
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('deletarElem remove só da ficha do Outro e salva via salvarFichaAlvoSilencioso("Outro")', () => {
        const state = montarStore();
        montar();

        act(() => { probe.deletarElem(9); });

        expect(state.personagens.Outro.ataquesElementais).toEqual([]);
        expect(state.minhaFicha.ataquesElementais).toHaveLength(1);
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('salvarNovoElem grava no Outro e salva via salvarFichaAlvoSilencioso("Outro")', () => {
        const state = montarStore();
        montar();

        act(() => { probe.setNomeElem('Tempestade'); });
        act(() => { probe.salvarNovoElem(); });

        expect(state.personagens.Outro.ataquesElementais.map(m => m.nome)).toContain('Tempestade');
        expect(state.minhaFicha.ataquesElementais).toHaveLength(1);
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('editarElem mexe só no elemEditandoId LOCAL: muda no contexto, setter da store não é tocado', () => {
        const state = montarStore({ elemEditandoId: 555 });
        montar();
        expect(probe.elemEditandoId).toBeNull(); // não herda o da store

        act(() => { probe.editarElem(9); });

        expect(probe.elemEditandoId).toBe(9);
        expect(state.setElemEditandoId).not.toHaveBeenCalled();
    });

    it('conjurarMagia não faz nada: sem enviarParaFeed e sem setAbaAtiva', () => {
        const state = montarStore();
        montar();

        act(() => { probe.conjurarMagia(state.personagens.Outro.ataquesElementais[0]); });
        act(() => { probe.conjurarMagia(state.personagens.Outro.ataquesElementais[0], 50); });

        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(state.setAbaAtiva).not.toHaveBeenCalled();
    });
});
