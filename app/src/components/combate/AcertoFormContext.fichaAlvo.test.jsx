import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcertoFormProvider, useAcertoForm } from './AcertoFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFichaAlvoSilencioso, enviarParaFeed } from '../../services/firebase-sync';

// QA - AcertoFormContext dentro/fora de um FichaAlvoProvider (Mestre vendo a Ficha de outro personagem na pagina 8).

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
    salvarCenarioCompleto: vi.fn(),
}));

function fichaBase(extra = {}) {
    return {
        forca: { base: 100 }, destreza: { base: 100 }, inteligencia: { base: 100 }, sabedoria: { base: 100 },
        energiaEsp: { base: 100 }, carisma: { base: 100 }, stamina: { base: 100 }, constituicao: { base: 100 },
        ascensaoBase: 1, inventario: [], poderes: [], ataquesElementais: [], proficienciaBase: 0, ...extra,
    };
}

let state;
function montarStore() {
    state = {
        minhaFicha: fichaBase({ proficienciaBase: 2, ataqueConfig: { vantagens: 1, desvantagens: 0 } }),
        personagens: { Outro: fichaBase({ proficienciaBase: 9, ataqueConfig: { vantagens: 3, desvantagens: 2 } }) },
        meuNome: 'Heroi', isMestre: true, dummies: {}, cenario: { ativa: 'default', lista: { default: { escala: 1.5, unidade: 'm' } } },
        alvoSelecionado: null, divisorPoderMesa: 1,
        setAbaAtiva: vi.fn(),
        updateFicha: vi.fn((cb) => cb(state.minhaFicha)),
        updateFichaAlvo: vi.fn((nome, cb) => cb(state.personagens[nome])),
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return state;
}

let probe;
function Harness() { probe = useAcertoForm(); return null; }
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => { cleanup(); probe = undefined; });

describe('AcertoFormContext FORA de FichaAlvoProvider', () => {
    it('le a minha ficha, rola com o meuNome e salva com salvarFichaSilencioso', () => {
        montarStore();
        render(<AcertoFormProvider><Harness /></AcertoFormProvider>);
        expect(probe.profGlobal).toBe(2);
        expect(probe.vantagens).toBe(1);
        act(() => { probe.changeVantagem({ target: { value: '4' } }); });
        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(state.minhaFicha.ataqueConfig.vantagens).toBe(4);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
        act(() => { probe.rolarAcerto(); });
        expect(ultimoFeed()).toMatchObject({ tipo: 'acerto', nome: 'Heroi' });
        expect(state.setAbaAtiva).toHaveBeenCalledWith('aba-log');
    });
});

describe('AcertoFormContext DENTRO de FichaAlvoProvider mirando outro personagem', () => {
    const renderAlvo = () => render(<FichaAlvoProvider nome="Outro"><AcertoFormProvider><Harness /></AcertoFormProvider></FichaAlvoProvider>);

    it('le proficiencia e vantagens da ficha DELE', () => {
        montarStore();
        renderAlvo();
        expect(probe.profGlobal).toBe(9);
        expect(probe.vantagens).toBe(3);
        expect(probe.desvantagens).toBe(2);
    });

    it('changeVantagem / changeDesvantagem gravam na ficha DELE e salvam via salvarFichaAlvoSilencioso("Outro")', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.changeVantagem({ target: { value: '7' } }); });
        act(() => { probe.changeDesvantagem({ target: { value: '5' } }); });
        expect(state.updateFichaAlvo).toHaveBeenCalledTimes(2);
        expect(state.updateFichaAlvo).toHaveBeenCalledWith('Outro', expect.any(Function));
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(state.personagens.Outro.ataqueConfig).toEqual({ vantagens: 7, desvantagens: 5 });
        expect(state.minhaFicha.ataqueConfig).toEqual({ vantagens: 1, desvantagens: 0 });
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledTimes(2);
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('changeVantagem com valor invalido grava 0', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.changeVantagem({ target: { value: 'abc' } }); });
        expect(state.personagens.Outro.ataqueConfig.vantagens).toBe(0);
    });

    it('rolarAcerto (rolagem livre) assina o feed com o nome DELE', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.rolarAcerto(); });
        const fe = ultimoFeed();
        expect(fe.tipo).toBe('acerto');
        expect(fe.nome).toBe('Outro');
        expect(state.setAbaAtiva).toHaveBeenCalledWith('aba-log');
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('rolar como outro e como eu mesmo produz feeds com nomes diferentes', () => {
        montarStore();
        const { unmount } = renderAlvo();
        act(() => { probe.rolarAcerto(); });
        const nomeAlvo = ultimoFeed().nome;
        unmount();
        render(<AcertoFormProvider><Harness /></AcertoFormProvider>);
        act(() => { probe.rolarAcerto(); });
        expect([nomeAlvo, ultimoFeed().nome]).toEqual(['Outro', 'Heroi']);
    });
});
