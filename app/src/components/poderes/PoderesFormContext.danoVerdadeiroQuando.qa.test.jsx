import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';

// QA - editor de Poderes: caixinha "Dano Verdadeiro" (grava/limpa/recarrega o campo danoVerdadeiro) e o "quando" de multiplicador
// no formulario de efeitos (so em_combate e empunhando_arma; alvo e recusado com aviso).

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(ficha, extra = {}) {
    mockState = {
        minhaFicha: ficha, meuNome: 'Heroi', isMestre: true,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(), ...extra,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
let probe;
function Harness() { probe = usePoderesForm(); return null; }

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('Editor de Poderes: danoVerdadeiro', () => {
    it('comeca desmarcado e o poder criado sem marcar NAO ganha a chave', () => {
        montarStore({ poderes: [] });
        expect(probe.danoVerdadeiroPoder).toBe(false);
        act(() => { probe.setNomePoder('Golpe'); probe.setDescricaoPoder('texto'); });
        act(() => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        expect('danoVerdadeiro' in mockState.minhaFicha.poderes[0]).toBe(false);
    });
    it('marcado: o poder novo grava danoVerdadeiro === true', () => {
        montarStore({ poderes: [] });
        act(() => { probe.setNomePoder('Lamina'); probe.setDescricaoPoder('texto'); probe.setDanoVerdadeiroPoder(true); });
        act(() => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes[0].danoVerdadeiro).toBe(true);
    });
    it('editar um poder marcado carrega a caixinha; desmarcar e salvar REMOVE a chave', () => {
        montarStore({ poderes: [{ id: 5, nome: 'Lamina', categoria: 'habilidade', descricao: 'd', efeitos: [], efeitosPassivos: [], danoVerdadeiro: true }] }, { poderEditandoId: 5 });
        act(() => { probe.editarPoder(5); });
        expect(probe.danoVerdadeiroPoder).toBe(true);
        act(() => { probe.setDanoVerdadeiroPoder(false); });
        act(() => { probe.salvarNovoPoder(); });
        expect('danoVerdadeiro' in mockState.minhaFicha.poderes[0]).toBe(false);
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
    });
    it('editar um poder SEM a marca mostra desmarcado; marcar e salvar grava; editar de novo mantem', () => {
        montarStore({ poderes: [{ id: 5, nome: 'Comum', categoria: 'habilidade', descricao: 'd', efeitos: [], efeitosPassivos: [] }] }, { poderEditandoId: 5 });
        act(() => { probe.editarPoder(5); });
        expect(probe.danoVerdadeiroPoder).toBe(false);
        act(() => { probe.setDanoVerdadeiroPoder(true); });
        act(() => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes[0].danoVerdadeiro).toBe(true);
    });
    it('valores nao-boolean legados (ex.: "true" em texto) NAO deixam a caixinha marcada', () => {
        montarStore({ poderes: [{ id: 5, nome: 'X', categoria: 'habilidade', descricao: 'd', efeitos: [], efeitosPassivos: [], danoVerdadeiro: 'true' }] }, { poderEditandoId: 5 });
        act(() => { probe.editarPoder(5); });
        expect(probe.danoVerdadeiroPoder).toBe(false);
    });
});

describe('Editor de Poderes: quando em multiplicador', () => {
    const preparar = (atributo, propriedade, quando, valor = '2') => {
        act(() => { probe.setNomeEfeito('Efeito'); probe.setNovoAtr(atributo); probe.setNovoProp(propriedade); probe.setNovoVal(valor); probe.setNovoQuando(quando); });
        act(() => { probe.addEfeitoTemp(); });
    };
    it('mgeral em Forca com em_combate / empunhando_arma[:tipo] entra com o quando', () => {
        ['em_combate', 'empunhando_arma', 'empunhando_arma:espada'].forEach(q => {
            mockState = null; cleanup(); vi.clearAllMocks();
            montarStore({ poderes: [] });
            preparar('forca', 'mgeral', q);
            expect(mockState.setEfeitosTemp).toHaveBeenCalledWith([{ nome: 'Efeito', atributo: 'forca', propriedade: 'mgeral', valor: '2', quando: q }]);
        });
    });
    it('todas as propriedades de multiplicador aceitam o quando', () => {
        ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'].forEach(p => {
            cleanup(); vi.clearAllMocks();
            montarStore({ poderes: [] });
            preparar('poder_direto', p, 'em_combate');
            expect(mockState.setEfeitosTemp.mock.calls[0][0][0]).toMatchObject({ propriedade: p, quando: 'em_combate' });
        });
    });
    it('condicao de alvo em multiplicador e RECUSADA com aviso (nada e adicionado)', () => {
        montarStore({ poderes: [] });
        preparar('forca', 'mgeral', 'alvo_com_estado:surpreso');
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/Multiplicador só aceita/));
        expect(mockState.setEfeitosTemp).not.toHaveBeenCalled();
        preparar('forca', 'mgeral', 'alvo_vida_abaixo:40');
        expect(mockState.setEfeitosTemp).not.toHaveBeenCalled();
    });
    it('sem quando: efeito identico ao de antes (sem a chave quando)', () => {
        montarStore({ poderes: [] });
        preparar('forca', 'mgeral', '');
        expect(mockState.setEfeitosTemp).toHaveBeenCalledWith([{ nome: 'Efeito', atributo: 'forca', propriedade: 'mgeral', valor: '2' }]);
    });
    it('quando sobrando num atributo/propriedade que nao le a condicao continua ignorado (regra antiga)', () => {
        montarStore({ poderes: [] });
        preparar('forca', 'base', 'em_combate');
        expect(mockState.setEfeitosTemp).toHaveBeenCalledWith([{ nome: 'Efeito', atributo: 'forca', propriedade: 'base', valor: '2' }]);
    });
    it('atributo que le o quando + propriedade comum: todas as condicoes continuam validas (alvo ok em acerto)', () => {
        montarStore({ poderes: [] });
        preparar('acerto', 'base', 'alvo_com_estado:surpreso', '3');
        expect(mockState.setEfeitosTemp.mock.calls[0][0][0]).toMatchObject({ atributo: 'acerto', quando: 'alvo_com_estado:surpreso' });
    });
    it('multiplicador com condicao incompleta (sem estado) e recusado', () => {
        montarStore({ poderes: [] });
        preparar('forca', 'mgeral', 'alvo_com_estado:');
        expect(window.alert).toHaveBeenCalled();
        expect(mockState.setEfeitosTemp).not.toHaveBeenCalled();
    });
});
