import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';

// QA - campo "Ação gasta" (tipoAcao) de Poderes/Formas/Habilidades: grava, carrega na edicao, reseta ao cancelar.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
function montarStore(poderes = []) {
    mockState = {
        minhaFicha: { poderes }, meuNome: 'Heroi', isMestre: true,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
const criar = async (aba, tipoAcao) => {
    act(() => {
        probe.setAbaAtual(aba); probe.setNomePoder('Tecnica'); probe.setDescricaoPoder('desc');
        if (tipoAcao !== undefined) probe.setTipoAcao(tipoAcao);
    });
    await act(async () => { probe.salvarNovoPoder(); });
};

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('PoderesFormContext - tipoAcao', () => {
    it('estado inicial vazio', () => {
        montarStore();
        expect(probe.tipoAcao).toBe('');
    });

    it.each(['poder', 'habilidade', 'forma'])('criar na aba %s grava o tipoAcao escolhido', async (aba) => {
        montarStore();
        await criar(aba, 'reacao');
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        expect(mockState.minhaFicha.poderes[0].tipoAcao).toBe('reacao');
    });

    it.each(['acao', 'bonus', 'reacao', 'movimento', 'livre'])('grava "%s" como esta', async (tipo) => {
        montarStore();
        await criar('habilidade', tipo);
        expect(mockState.minhaFicha.poderes[0].tipoAcao).toBe(tipo);
    });

    it('sem escolher grava vazio; valor invalido tambem vira vazio', async () => {
        montarStore();
        await criar('habilidade');
        expect(mockState.minhaFicha.poderes[0].tipoAcao).toBe('');
        await criar('habilidade', 'padrao');
        expect(mockState.minhaFicha.poderes[1].tipoAcao).toBe('');
    });

    it('editarPoder carrega o tipoAcao existente', () => {
        montarStore([{ id: 1, nome: 'F', categoria: 'poder', ativa: false, tipoAcao: 'bonus', efeitos: [], efeitosPassivos: [] }]);
        act(() => { probe.editarPoder(1); });
        expect(probe.tipoAcao).toBe('bonus');
    });

    it('editarPoder de tecnica legada (sem tipoAcao) ou com lixo carrega vazio, sem herdar o anterior', () => {
        montarStore([
            { id: 1, nome: 'A', categoria: 'poder', ativa: false, tipoAcao: 'acao', efeitos: [], efeitosPassivos: [] },
            { id: 2, nome: 'B', categoria: 'poder', ativa: false, efeitos: [], efeitosPassivos: [] },
            { id: 3, nome: 'C', categoria: 'poder', ativa: false, tipoAcao: 'xx', efeitos: [], efeitosPassivos: [] },
        ]);
        act(() => { probe.editarPoder(1); });
        expect(probe.tipoAcao).toBe('acao');
        act(() => { probe.editarPoder(2); });
        expect(probe.tipoAcao).toBe('');
        act(() => { probe.editarPoder(1); });
        act(() => { probe.editarPoder(3); });
        expect(probe.tipoAcao).toBe('');
    });

    it('salvar a edicao atualiza o tipoAcao do mesmo poder (sem duplicar)', async () => {
        montarStore([{ id: 1, nome: 'A', categoria: 'poder', ativa: false, tipoAcao: 'acao', efeitos: [], efeitosPassivos: [] }]);
        act(() => { probe.editarPoder(1); });
        act(() => { probe.setDescricaoPoder('desc'); probe.setTipoAcao('livre'); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ id: 1, tipoAcao: 'livre' });
    });

    it('cancelarEdicaoPoder reseta o tipoAcao', () => {
        montarStore([{ id: 1, nome: 'A', categoria: 'poder', ativa: false, tipoAcao: 'reacao', efeitos: [], efeitosPassivos: [] }]);
        act(() => { probe.editarPoder(1); });
        expect(probe.tipoAcao).toBe('reacao');
        act(() => { probe.cancelarEdicaoPoder(); });
        expect(probe.tipoAcao).toBe('');
    });

    it('depois de salvar o formulario volta ao tipoAcao vazio', async () => {
        montarStore();
        await criar('poder', 'bonus');
        expect(probe.tipoAcao).toBe('');
    });
});
