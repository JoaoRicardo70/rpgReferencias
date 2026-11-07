import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';

// QA - montarEfeitoNovo (via addEfeitoTemp / addEfeitoPassivoTemp): imune_estado e resiste_estado exigem escopo valido.

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoSilencioso: vi.fn(), salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('x')),
}));

let probe; let state;
function Harness() { probe = usePoderesForm(); return null; }

function montar() {
    state = {
        minhaFicha: { poderes: [] }, personagens: {}, meuNome: 'Heroi', isMestre: false,
        updateFicha: vi.fn((cb) => cb(state.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(),
        efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
function preencher(atributo, escopo, quando = '') {
    act(() => { probe.setNovoAtr(atributo); });
    act(() => { probe.setNovoProp('base'); });
    act(() => { probe.setNomeEfeito('Imune'); });
    act(() => { probe.setNovoVal('1'); });
    act(() => { probe.setNovoEscopo(escopo); });
    act(() => { probe.setNovoQuando(quando); });
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('PoderesFormContext > efeito de estado', () => {
    it('imune_estado com estado valido entra com escopo normalizado', () => {
        montar();
        preencher('imune_estado', 'Queimado');
        act(() => { probe.addEfeitoTemp(); });
        expect(state.setEfeitosTemp).toHaveBeenCalledTimes(1);
        expect(state.setEfeitosTemp.mock.calls[0][0][0]).toMatchObject({ atributo: 'imune_estado', propriedade: 'base', escopo: 'queimado' });
    });
    it("resiste_estado com 'todos' entra", () => {
        montar();
        preencher('resiste_estado', 'todos');
        act(() => { probe.addEfeitoTemp(); });
        expect(state.setEfeitosTemp.mock.calls[0][0][0].escopo).toBe('todos');
    });
    it.each(['', 'inexistente', 'teste:percepcao', 'ataque'])('escopo %j e recusado com alerta e nada e adicionado', (escopo) => {
        montar();
        preencher('imune_estado', escopo);
        act(() => { probe.addEfeitoTemp(); });
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/estado/i));
        expect(state.setEfeitosTemp).not.toHaveBeenCalled();
    });
    it('vale tambem para o efeito passivo', () => {
        montar();
        act(() => { probe.setNovoAtrPassivo('imune_estado'); });
        act(() => { probe.setNovoPropPassivo('base'); });
        act(() => { probe.setNomeEfeitoPassivo('P'); });
        act(() => { probe.setNovoValPassivo('1'); });
        act(() => { probe.setNovoEscopoPassivo('lento'); });
        act(() => { probe.addEfeitoPassivoTemp(); });
        expect(state.setEfeitosTempPassivos.mock.calls[0][0][0]).toMatchObject({ atributo: 'imune_estado', escopo: 'lento' });
    });
    it('escopo sobrando de outro atributo nao vaza para efeitos comuns (forca)', () => {
        montar();
        preencher('forca', 'queimado');
        act(() => { probe.addEfeitoTemp(); });
        expect(state.setEfeitosTemp.mock.calls[0][0][0].escopo).toBeUndefined();
    });
    it('imune_surpresa antigo continua sem escopo', () => {
        montar();
        preencher('imune_surpresa', '');
        act(() => { probe.addEfeitoTemp(); });
        expect(state.setEfeitosTemp.mock.calls[0][0][0]).toMatchObject({ atributo: 'imune_surpresa' });
        expect(state.setEfeitosTemp.mock.calls[0][0][0].escopo).toBeUndefined();
    });
});
