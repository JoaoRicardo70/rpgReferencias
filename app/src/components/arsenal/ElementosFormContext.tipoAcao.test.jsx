import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementosFormProvider, useElementosForm } from './ElementosFormContext';
import useStore from '../../stores/useStore';

// QA - campo "Ação gasta" (tipoAcao) da Técnica Elemental: grava, carrega na edição, reseta ao cancelar.
vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()), salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(), enviarParaFeed: vi.fn(),
}));

let probe; let ficha;
function Harness() { probe = useElementosForm(); return null; }
function montar(magias = [], elemEditandoId = null) {
    ficha = { ataquesElementais: magias };
    const state = {
        minhaFicha: ficha, personagens: {}, meuNome: 'Heroi', updateFicha: vi.fn((cb) => cb(ficha)), updateFichaAlvo: vi.fn(),
        setAbaAtiva: vi.fn(), elemEditandoId, setElemEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    render(<ElementosFormProvider><Harness /></ElementosFormProvider>);
}
const novaMagia = (tipoAcao) => {
    act(() => {
        probe.setElemSelecionado('Fogo'); probe.setNomeElem('Bola');
        if (tipoAcao !== undefined) probe.setTipoAcao(tipoAcao);
    });
    act(() => { probe.salvarNovoElem(); });
};

beforeEach(() => { window.alert = vi.fn(); });
afterEach(() => { cleanup(); probe = undefined; });

describe('ElementosFormContext - tipoAcao', () => {
    it('o estado inicial e vazio', () => {
        montar();
        expect(probe.tipoAcao).toBe('');
    });

    it.each(['acao', 'bonus', 'reacao', 'movimento', 'livre'])('salvarNovoElem grava tipoAcao "%s"', (tipo) => {
        montar(); novaMagia(tipo);
        expect(ficha.ataquesElementais).toHaveLength(1);
        expect(ficha.ataquesElementais[0].tipoAcao).toBe(tipo);
    });

    it('sem escolher nada grava string vazia (nao controla Acao)', () => {
        montar(); novaMagia();
        expect(ficha.ataquesElementais[0].tipoAcao).toBe('');
    });

    it('valor invalido e normalizado para vazio ao gravar', () => {
        montar(); novaMagia('padrao');
        expect(ficha.ataquesElementais[0].tipoAcao).toBe('');
    });

    it('editarElem carrega o tipoAcao da magia', () => {
        montar([{ id: 7, nome: 'Chama', elemento: 'Fogo', tipoAcao: 'reacao' }]);
        act(() => { probe.editarElem(7); });
        expect(probe.tipoAcao).toBe('reacao');
    });

    it('editarElem de magia legada (sem tipoAcao) ou com valor lixo carrega vazio', () => {
        montar([{ id: 1, nome: 'A', elemento: 'Fogo' }, { id: 2, nome: 'B', elemento: 'Fogo', tipoAcao: 'lixo' }]);
        act(() => { probe.setTipoAcao('bonus'); });
        act(() => { probe.editarElem(1); });
        expect(probe.tipoAcao).toBe('');
        act(() => { probe.setTipoAcao('bonus'); });
        act(() => { probe.editarElem(2); });
        expect(probe.tipoAcao).toBe('');
    });

    it('salvar uma edicao atualiza o tipoAcao da magia existente', () => {
        montar([{ id: 7, nome: 'Chama', elemento: 'Fogo', tipoAcao: 'reacao', equipado: true }], 7);
        act(() => { probe.editarElem(7); });
        act(() => { probe.setTipoAcao('bonus'); });
        act(() => { probe.salvarNovoElem(); });
        expect(ficha.ataquesElementais).toHaveLength(1);
        expect(ficha.ataquesElementais[0]).toMatchObject({ id: 7, tipoAcao: 'bonus' });
    });

    it('cancelarEdicaoElem reseta o tipoAcao', () => {
        montar();
        act(() => { probe.setTipoAcao('acao'); });
        expect(probe.tipoAcao).toBe('acao');
        act(() => { probe.cancelarEdicaoElem(); });
        expect(probe.tipoAcao).toBe('');
    });

    it('depois de salvar o formulario volta ao tipoAcao vazio', () => {
        montar(); novaMagia('livre');
        expect(probe.tipoAcao).toBe('');
    });
});
