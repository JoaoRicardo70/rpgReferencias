import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';

// QA - campos de Reacao (reacaoGatilho / reacaoEfeito / reacaoValor) de Poderes/Formas/Habilidades.
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
const criar = async (gatilho, efeito, valor, aba = 'habilidade') => {
    act(() => {
        probe.setAbaAtual(aba); probe.setNomePoder('Tecnica'); probe.setDescricaoPoder('desc'); probe.setTipoAcao('reacao');
        if (gatilho !== undefined) probe.setReacaoGatilho(gatilho);
        if (efeito !== undefined) probe.setReacaoEfeito(efeito);
        if (valor !== undefined) probe.setReacaoValor(valor);
    });
    await act(async () => { probe.salvarNovoPoder(); });
};
const base = (over = {}) => ({ id: 1, nome: 'A', categoria: 'poder', ativa: false, tipoAcao: 'reacao', efeitos: [], efeitosPassivos: [], ...over });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('PoderesFormContext - campos de Reacao', () => {
    it('estado inicial vazio', () => {
        montarStore();
        expect([probe.reacaoGatilho, probe.reacaoEfeito, probe.reacaoValor]).toEqual(['', '', '']);
    });

    it.each(['poder', 'habilidade', 'forma'])('criar na aba %s grava gatilho, efeito e valor', async (aba) => {
        montarStore();
        await criar('sempre', 'reduzir_dano', '50', aba);
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ tipoAcao: 'reacao', reacaoGatilho: 'sempre', reacaoEfeito: 'reduzir_dano', reacaoValor: 50 });
    });

    it('valor de reduzir_dano acima de 100 e limitado; negativo ou texto vira 0', async () => {
        montarStore();
        await criar('sempre', 'reduzir_dano', '250');
        await criar('sempre', 'reduzir_dano', '-5');
        await criar('sempre', 'aumentar_ca', 'abc');
        const p = mockState.minhaFicha.poderes;
        expect(p[0].reacaoValor).toBe(100);
        expect(p[1].reacaoValor).toBe(0);
        expect(p[2].reacaoValor).toBe(0);
    });

    it('gatilho e efeito invalidos sao normalizados para vazio', async () => {
        montarStore();
        await criar('quando_eu_quiser', 'explodir', '10');
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ reacaoGatilho: '', reacaoEfeito: '', reacaoValor: 10 });
    });

    it('sem preencher grava vazio', async () => {
        montarStore();
        await criar();
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ reacaoGatilho: '', reacaoEfeito: '', reacaoValor: 0 });
    });

    it('editarPoder carrega os 3 campos', () => {
        montarStore([base({ reacaoGatilho: 'acertou', reacaoEfeito: 'contra_ataque', reacaoValor: 7 })]);
        act(() => { probe.editarPoder(1); });
        expect(probe.reacaoGatilho).toBe('acertou');
        expect(probe.reacaoEfeito).toBe('contra_ataque');
        expect(probe.reacaoValor).toBe(7);
    });

    it('editarPoder de tecnica legada ou com lixo carrega vazio, sem herdar a anterior', () => {
        montarStore([
            base({ id: 1, reacaoGatilho: 'errou', reacaoEfeito: 'atacar_atacante', reacaoValor: 3 }),
            base({ id: 2 }),
            base({ id: 3, reacaoGatilho: 'xx', reacaoEfeito: 'yy' }),
        ]);
        act(() => { probe.editarPoder(1); });
        expect(probe.reacaoGatilho).toBe('errou');
        act(() => { probe.editarPoder(2); });
        expect([probe.reacaoGatilho, probe.reacaoEfeito, probe.reacaoValor]).toEqual(['', '', '']);
        act(() => { probe.editarPoder(1); });
        act(() => { probe.editarPoder(3); });
        expect([probe.reacaoGatilho, probe.reacaoEfeito]).toEqual(['', '']);
    });

    it('salvar a edicao atualiza os campos do mesmo poder (sem duplicar)', async () => {
        montarStore([base({ reacaoGatilho: 'errou', reacaoEfeito: 'atacar_atacante', reacaoValor: 0 })]);
        act(() => { probe.editarPoder(1); });
        act(() => { probe.setDescricaoPoder('desc'); probe.setReacaoGatilho('sempre'); probe.setReacaoEfeito('reduzir_dano'); probe.setReacaoValor('30'); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ id: 1, reacaoGatilho: 'sempre', reacaoEfeito: 'reduzir_dano', reacaoValor: 30 });
    });

    it('cancelarEdicaoPoder reseta os 3 campos', () => {
        montarStore([base({ reacaoGatilho: 'sempre', reacaoEfeito: 'reduzir_dano', reacaoValor: 50 })]);
        act(() => { probe.editarPoder(1); });
        expect(probe.reacaoValor).toBe(50);
        act(() => { probe.cancelarEdicaoPoder(); });
        expect([probe.reacaoGatilho, probe.reacaoEfeito, probe.reacaoValor]).toEqual(['', '', '']);
    });

    it('depois de salvar o formulario volta aos campos vazios', async () => {
        montarStore();
        await criar('sempre', 'reduzir_dano', '50');
        expect([probe.reacaoGatilho, probe.reacaoEfeito, probe.reacaoValor]).toEqual(['', '', '']);
    });
});
