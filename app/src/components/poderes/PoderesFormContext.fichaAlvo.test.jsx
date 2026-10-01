import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import {
    salvarFichaSilencioso,
    salvarFirebaseImediato,
    salvarFichaAlvoSilencioso,
    salvarFichaAlvoImediato,
} from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — PoderesFormContext.jsx dentro/fora de um FichaAlvoProvider (Grimório da Entidade).
//
// Fora de Provider (ou mirando o próprio jogador): lê minhaFicha, grava via updateFicha e salva via
// salvarFichaSilencioso/salvarFirebaseImediato (inalterado). Dentro de <FichaAlvoProvider nome="Outro">:
// lê personagens.Outro, grava via updateFichaAlvo('Outro', fn) e salva via salvarFichaAlvo*('Outro').
// O rascunho do editor (efeitosTemp/poderEditandoId) fica LOCAL no modo alvo.
//
// Usa o FichaAlvoContext REAL (só a store e o firebase-sync são mockados).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { poderes: [{ id: 1, nome: 'Meu Poder', categoria: 'poder', ativa: false, efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 3 }] }] },
        personagens: { Outro: { poderes: [{ id: 7, nome: 'Poder do Outro', categoria: 'habilidade', ativa: false, efeitos: [{ atributo: 'agilidade', propriedade: 'base', valor: 9 }] }] } },
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        updateFichaAlvo: vi.fn((nome, cb) => cb(mockState.personagens[nome])),
        efeitosTemp: [{ nome: 'global' }],
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

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { cleanup(); probe = undefined; vi.restoreAllMocks(); });

describe('PoderesFormContext FORA de FichaAlvoProvider — comportamento de sempre', () => {
    it('lê minhaFicha da store e expõe meuNome', () => {
        const state = montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        expect(probe.minhaFicha).toBe(state.minhaFicha);
        expect(probe.meuNome).toBe('Heroi');
        expect(probe.minhaFicha.poderes.map(p => p.nome)).toEqual(['Meu Poder']);
    });

    it('togglePoder grava via updateFicha e salva com salvarFichaSilencioso()', () => {
        const state = montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.togglePoder(1); });

        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(state.updateFichaAlvo).not.toHaveBeenCalled();
        expect(state.minhaFicha.poderes[0].ativa).toBe(true);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });

    it('deletarPoder remove o poder e salva com salvarFichaSilencioso()', () => {
        const state = montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.deletarPoder(1); });

        expect(state.minhaFicha.poderes).toEqual([]);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });

    it('salvarNovoPoder salva com salvarFirebaseImediato() (sem nome de alvo)', async () => {
        const state = montarStore({ minhaFicha: { poderes: [] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.setNomePoder('Novo'); probe.setDescricaoPoder('desc'); });
        await act(async () => { probe.salvarNovoPoder(); });

        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(state.minhaFicha.poderes.map(p => p.nome)).toEqual(['Novo']);
        expect(salvarFirebaseImediato).toHaveBeenCalledTimes(1);
        expect(salvarFichaAlvoImediato).not.toHaveBeenCalled();
    });

    it('editarPoder usa os setters da STORE (rascunho global): setPoderEditandoId e setEfeitosTemp', () => {
        const state = montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(1); });

        expect(state.setPoderEditandoId).toHaveBeenCalledWith(1);
        expect(state.setEfeitosTemp).toHaveBeenCalledWith([{ atributo: 'forca', propriedade: 'base', valor: 3 }]);
        expect(probe.efeitosTemp).toBe(state.efeitosTemp);
    });

    it('Provider mirando o PRÓPRIO jogador também é o caminho de sempre', () => {
        const state = montarStore();
        render(<FichaAlvoProvider nome="Heroi"><PoderesFormProvider><Harness /></PoderesFormProvider></FichaAlvoProvider>);

        act(() => { probe.togglePoder(1); });

        expect(probe.minhaFicha).toBe(state.minhaFicha);
        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(state.updateFichaAlvo).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });
});

describe('PoderesFormContext DENTRO de <FichaAlvoProvider nome="Outro"> — mira a ficha do Outro', () => {
    const montar = () => render(<FichaAlvoProvider nome="Outro"><PoderesFormProvider><Harness /></PoderesFormProvider></FichaAlvoProvider>);

    it('lê personagens.Outro (não minhaFicha) e expõe o nome dele', () => {
        const state = montarStore();
        montar();
        expect(probe.minhaFicha).toBe(state.personagens.Outro);
        expect(probe.minhaFicha).not.toBe(state.minhaFicha);
        expect(probe.meuNome).toBe('Outro');
        expect(probe.minhaFicha.poderes.map(p => p.nome)).toEqual(['Poder do Outro']);
    });

    it('togglePoder grava via updateFichaAlvo("Outro", fn), nunca updateFicha, e salva via salvarFichaAlvoSilencioso("Outro")', () => {
        const state = montarStore();
        montar();

        act(() => { probe.togglePoder(7); });

        expect(state.updateFichaAlvo).toHaveBeenCalledTimes(1);
        expect(state.updateFichaAlvo).toHaveBeenCalledWith('Outro', expect.any(Function));
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(state.personagens.Outro.poderes[0].ativa).toBe(true);
        expect(state.minhaFicha.poderes[0].ativa).toBe(false);
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('deletarPoder remove só da ficha do Outro e salva via salvarFichaAlvoSilencioso("Outro")', () => {
        const state = montarStore();
        montar();

        act(() => { probe.deletarPoder(7); });

        expect(state.personagens.Outro.poderes).toEqual([]);
        expect(state.minhaFicha.poderes).toHaveLength(1);
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('salvarNovoPoder grava no Outro e salva via salvarFichaAlvoImediato("Outro") (não salvarFirebaseImediato)', async () => {
        const state = montarStore();
        montar();

        act(() => { probe.setNomePoder('Golpe Novo'); probe.setDescricaoPoder('desc'); });
        await act(async () => { probe.salvarNovoPoder(); });

        expect(state.updateFichaAlvo).toHaveBeenCalledWith('Outro', expect.any(Function));
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(state.personagens.Outro.poderes.map(p => p.nome)).toContain('Golpe Novo');
        expect(state.minhaFicha.poderes.map(p => p.nome)).toEqual(['Meu Poder']);
        expect(salvarFichaAlvoImediato).toHaveBeenCalledWith('Outro');
        expect(salvarFirebaseImediato).not.toHaveBeenCalled();
    });

    it('editarPoder mexe só no rascunho LOCAL: poderEditandoId/efeitosTemp mudam, setters da store não são tocados', () => {
        const state = montarStore();
        montar();
        expect(probe.efeitosTemp).toEqual([]); // não herda o efeitosTemp global da store
        expect(probe.poderEditandoId).toBeNull();

        act(() => { probe.editarPoder(7); });

        expect(probe.poderEditandoId).toBe(7);
        expect(probe.efeitosTemp).toEqual([{ atributo: 'agilidade', propriedade: 'base', valor: 9 }]);
        expect(state.setPoderEditandoId).not.toHaveBeenCalled();
        expect(state.setEfeitosTemp).not.toHaveBeenCalled();
        expect(state.setEfeitosTempPassivos).not.toHaveBeenCalled();
    });

    it('addEfeitoTemp (novo efeito do editor) grava no rascunho local, não na store', () => {
        const state = montarStore();
        montar();

        act(() => { probe.setNomeEfeito('x'); probe.setNovoVal('5'); });
        act(() => { probe.addEfeitoTemp(); });

        expect(probe.efeitosTemp).toHaveLength(1);
        expect(probe.efeitosTemp[0]).toMatchObject({ nome: 'x', valor: '5' });
        expect(state.setEfeitosTemp).not.toHaveBeenCalled();
    });

    it('o rascunho local de um Outro não vaza pro modo "eu": no modo normal continua valendo o da store', () => {
        const state = montarStore();
        montar();
        act(() => { probe.setNomeEfeito('x'); probe.setNovoVal('5'); });
        act(() => { probe.addEfeitoTemp(); });
        cleanup();

        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        expect(probe.efeitosTemp).toBe(state.efeitosTemp);
    });
});
