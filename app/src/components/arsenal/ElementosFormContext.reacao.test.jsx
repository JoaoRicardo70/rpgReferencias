import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementosFormProvider, useElementosForm } from './ElementosFormContext';
import useStore from '../../stores/useStore';

// QA - campos de Reacao (reacaoGatilho / reacaoEfeito / reacaoValor) da Tecnica Elemental.
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
const novaMagia = (gatilho, efeito, valor) => {
    act(() => {
        probe.setElemSelecionado('Fogo'); probe.setNomeElem('Bola'); probe.setTipoAcao('reacao');
        if (gatilho !== undefined) probe.setReacaoGatilho(gatilho);
        if (efeito !== undefined) probe.setReacaoEfeito(efeito);
        if (valor !== undefined) probe.setReacaoValor(valor);
    });
    act(() => { probe.salvarNovoElem(); });
};
const vazio = () => [probe.reacaoGatilho, probe.reacaoEfeito, probe.reacaoValor];

beforeEach(() => { window.alert = vi.fn(); });
afterEach(() => { cleanup(); probe = undefined; });

describe('ElementosFormContext - campos de Reacao', () => {
    it('estado inicial vazio', () => {
        montar();
        expect(vazio()).toEqual(['', '', '']);
    });

    it('salvarNovoElem grava gatilho, efeito e valor normalizados', () => {
        montar(); novaMagia('acertou', 'reduzir_dano', '40');
        expect(ficha.ataquesElementais[0]).toMatchObject({ tipoAcao: 'reacao', reacaoGatilho: 'acertou', reacaoEfeito: 'reduzir_dano', reacaoValor: 40 });
    });

    it('valor acima de 100 em reduzir_dano e limitado; invalido vira 0', () => {
        montar(); novaMagia('sempre', 'reduzir_dano', '999');
        expect(ficha.ataquesElementais[0].reacaoValor).toBe(100);
        novaMagia('sempre', 'aumentar_ca', 'abc');
        expect(ficha.ataquesElementais[1].reacaoValor).toBe(0);
    });

    it('gatilho e efeito invalidos viram vazio; sem preencher grava vazio', () => {
        montar(); novaMagia('xx', 'yy', '5');
        expect(ficha.ataquesElementais[0]).toMatchObject({ reacaoGatilho: '', reacaoEfeito: '' });
        novaMagia();
        expect(ficha.ataquesElementais[1]).toMatchObject({ reacaoGatilho: '', reacaoEfeito: '', reacaoValor: 0 });
    });

    it('editarElem carrega os 3 campos', () => {
        montar([{ id: 7, nome: 'Chama', elemento: 'Fogo', tipoAcao: 'reacao', reacaoGatilho: 'aliado', reacaoEfeito: 'aumentar_ca', reacaoValor: 4 }]);
        act(() => { probe.editarElem(7); });
        expect(probe.reacaoGatilho).toBe('aliado');
        expect(probe.reacaoEfeito).toBe('aumentar_ca');
        expect(probe.reacaoValor).toBe(4);
    });

    it('editarElem de magia legada ou com lixo carrega vazio', () => {
        montar([{ id: 1, nome: 'A', elemento: 'Fogo' }, { id: 2, nome: 'B', elemento: 'Fogo', reacaoGatilho: 'lixo', reacaoEfeito: 'lixo' }]);
        act(() => { probe.setReacaoGatilho('sempre'); probe.setReacaoEfeito('reduzir_dano'); probe.setReacaoValor('9'); });
        act(() => { probe.editarElem(1); });
        expect(vazio()).toEqual(['', '', '']);
        act(() => { probe.setReacaoGatilho('sempre'); });
        act(() => { probe.editarElem(2); });
        expect(vazio()).toEqual(['', '', '']);
    });

    it('salvar uma edicao atualiza os campos da magia existente', () => {
        montar([{ id: 7, nome: 'Chama', elemento: 'Fogo', tipoAcao: 'reacao', reacaoGatilho: 'errou', reacaoEfeito: 'atacar_atacante', equipado: true }], 7);
        act(() => { probe.editarElem(7); });
        act(() => { probe.setReacaoGatilho('sempre'); probe.setReacaoEfeito('reduzir_dano'); probe.setReacaoValor('25'); });
        act(() => { probe.salvarNovoElem(); });
        expect(ficha.ataquesElementais).toHaveLength(1);
        expect(ficha.ataquesElementais[0]).toMatchObject({ id: 7, reacaoGatilho: 'sempre', reacaoEfeito: 'reduzir_dano', reacaoValor: 25 });
    });

    it('cancelarEdicaoElem reseta os 3 campos', () => {
        montar();
        act(() => { probe.setReacaoGatilho('sempre'); probe.setReacaoEfeito('reduzir_dano'); probe.setReacaoValor('50'); });
        expect(probe.reacaoValor).toBe('50');
        act(() => { probe.cancelarEdicaoElem(); });
        expect(vazio()).toEqual(['', '', '']);
    });

    it('depois de salvar o formulario volta aos campos vazios', () => {
        montar(); novaMagia('sempre', 'reduzir_dano', '50');
        expect(vazio()).toEqual(['', '', '']);
    });
});
