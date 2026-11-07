import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';

// QA - escudoAoLigar: ligar o Poder cria o escudo (com poderId), desligar remove; editor grava/limpa o campo.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    enviarParaFeed: vi.fn(),
}));

let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
const DOMO = { nome: 'Domo Gelido', valor: 1600, tipo: 'escudo' };
const poder = (extra = {}) => ({ id: 1, nome: 'Domo', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [], escudoAoLigar: DOMO, ...extra });

function montarStore({ poderes = [], escudos } = {}) {
    mockState = {
        minhaFicha: { poderes, ...(escudos ? { escudos } : {}) },
        meuNome: 'Heroi', isMestre: false,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    return render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('togglePoder - escudoAoLigar', () => {
    it('ligar cria o escudo ligado ao Poder; desligar remove so o dele', () => {
        montarStore({ poderes: [poder()], escudos: [{ id: 'm', nome: 'Manual', valor: 5, tipo: 'escudo' }] });
        act(() => { probe.togglePoder(1); });
        const doPoder = mockState.minhaFicha.escudos.filter(e => e.poderId === 1);
        expect(doPoder).toHaveLength(1);
        expect(doPoder[0]).toMatchObject({ nome: 'Domo Gelido', valor: 1600, tipo: 'escudo' });
        expect(mockState.minhaFicha.escudos).toHaveLength(2);
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.escudos.map(e => e.id)).toEqual(['m']);
    });
    it('Poder sem escudoAoLigar nao cria a chave escudos (ficha antiga)', () => {
        montarStore({ poderes: [poder({ escudoAoLigar: undefined })] });
        act(() => { probe.togglePoder(1); });
        expect('escudos' in mockState.minhaFicha).toBe(false);
    });
    it('religar renova o escudo cheio em vez de duplicar', () => {
        montarStore({ poderes: [poder()] });
        act(() => { probe.togglePoder(1); });
        mockState.minhaFicha.escudos[0].valor = 100;
        act(() => { probe.togglePoder(1); });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.escudos).toHaveLength(1);
        expect(mockState.minhaFicha.escudos[0].valor).toBe(1600);
    });
});

describe('editor - escudo ao ligar', () => {
    const criar = async (campos) => {
        act(() => { probe.setAbaAtual('poder'); probe.setNomePoder('Tec'); probe.setDescricaoPoder('d'); campos(); });
        await act(async () => { probe.salvarNovoPoder(); });
    };
    it('grava o escudo valido; vazio/invalido nao grava; limpar remove o campo', async () => {
        montarStore();
        await criar(() => { probe.setEscudoPoder({ nome: 'Barreira', valor: '300', tipo: 'vidaTemporaria' }); });
        expect(mockState.minhaFicha.poderes[0].escudoAoLigar).toEqual({ nome: 'Barreira', valor: 300, tipo: 'vidaTemporaria' });
        act(() => { probe.editarPoder(mockState.minhaFicha.poderes[0].id); });
        expect(probe.escudoPoder).toEqual({ nome: 'Barreira', valor: 300, tipo: 'vidaTemporaria' });
        act(() => { probe.setEscudoPoder({ nome: '', valor: '', tipo: 'escudo' }); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect('escudoAoLigar' in mockState.minhaFicha.poderes[0]).toBe(false);
    });
});
