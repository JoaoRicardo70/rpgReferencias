import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementosFormProvider, useElementosForm } from './ElementosFormContext';
import useStore from '../../stores/useStore';

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
function montar() {
    ficha = { ataquesElementais: [] };
    const state = {
        minhaFicha: ficha, personagens: {}, meuNome: 'Heroi', updateFicha: vi.fn((cb) => cb(ficha)), updateFichaAlvo: vi.fn(),
        setAbaAtiva: vi.fn(), elemEditandoId: null, setElemEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    render(<ElementosFormProvider><Harness /></ElementosFormProvider>);
}
const preencher = ({ elem = 'Fogo', qtd = 0, faces = 10, limite } = {}) => {
    act(() => {
        probe.setElemSelecionado(elem); probe.setNomeElem('Bola');
        probe.setDadosQtd(qtd); probe.setDadosFaces(faces);
        if (limite !== undefined) probe.setLimiteDados(limite);
    });
};

beforeEach(() => { window.alert = vi.fn(); });
afterEach(() => { cleanup(); probe = undefined; });

describe('ElementosFormContext.salvarNovoElem - limite de dados', () => {
    it('corta dados acima do limite do elemento (Fogo 50: 10d10 -> 5d10) e avisa', () => {
        montar(); preencher({ qtd: 10, faces: 10 });
        act(() => { probe.salvarNovoElem(); });
        expect(ficha.ataquesElementais).toHaveLength(1);
        expect(ficha.ataquesElementais[0]).toMatchObject({ dadosExtraQtd: 5, dadosExtraFaces: 10 });
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toMatch(/50/);
    });
    it('dentro do limite (exatamente 5d10): nao corta nem avisa', () => {
        montar(); preencher({ qtd: 5, faces: 10 });
        act(() => { probe.salvarNovoElem(); });
        expect(ficha.ataquesElementais[0].dadosExtraQtd).toBe(5);
        expect(window.alert).not.toHaveBeenCalled();
    });
    it('limiteDados proprio vira o teto e e gravado na magia', () => {
        montar(); preencher({ qtd: 20, faces: 10, limite: '120' });
        act(() => { probe.salvarNovoElem(); });
        expect(ficha.ataquesElementais[0]).toMatchObject({ dadosExtraQtd: 12, limiteDados: 120 });
    });
    it('sem limiteDados proprio grava undefined (usa o do elemento)', () => {
        montar(); preencher({ qtd: 1, faces: 10 });
        act(() => { probe.salvarNovoElem(); });
        expect(ficha.ataquesElementais[0].limiteDados).toBeUndefined();
    });
    it('elemento sem limite (Neutro) nao corta', () => {
        montar(); preencher({ elem: 'Neutro', qtd: 100, faces: 20 });
        act(() => { probe.salvarNovoElem(); });
        expect(ficha.ataquesElementais[0].dadosExtraQtd).toBe(100);
        expect(window.alert).not.toHaveBeenCalled();
    });
    it('limiteDados invalido (negativo) e ignorado', () => {
        montar(); preencher({ qtd: 10, faces: 10, limite: '-5' });
        act(() => { probe.salvarNovoElem(); });
        expect(ficha.ataquesElementais[0]).toMatchObject({ dadosExtraQtd: 5 });
        expect(ficha.ataquesElementais[0].limiteDados).toBeUndefined();
    });
    it('sem nome: alerta e nao grava', () => {
        montar();
        act(() => { probe.setNomeElem('  '); });
        act(() => { probe.salvarNovoElem(); });
        expect(ficha.ataquesElementais).toHaveLength(0);
        expect(window.alert).toHaveBeenCalled();
    });
});

describe('ElementosFormContext.injetarJsonDaIA - limite de dados', () => {
    it('corta danoQtd acima do limite do elemento da magia', () => {
        montar();
        act(() => { probe.injetarJsonDaIA(JSON.stringify({ ataquesElementais: [{ nome: 'Chama', elemento: 'Fogo', danoQtd: 10, danoFaces: 10 }] })); });
        expect(ficha.ataquesElementais).toHaveLength(1);
        expect(ficha.ataquesElementais[0]).toMatchObject({ dadosExtraQtd: 5, dadosExtraFaces: 10 });
    });
});
