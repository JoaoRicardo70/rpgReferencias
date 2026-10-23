import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(),
    salvarFirebaseImediato: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
}));

import { ArsenalFormProvider, useArsenalForm } from './ArsenalFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { criarAcoesIniciais, getAcoesExibicao } from '../../core/acoes';

// QA - ArsenalFormContext.toggleEquiparItem + useGastarAcao: equipar item que eleva o Poder e foi marcado como
// Reacao cobra 1 Reacao; Acao Livre (padrao), item sem efeito de Poder e desequipar nao cobram.
const efeitoPoder = [{ atributo: 'forca', propriedade: 'base', valor: 5 }];
const item = (extra = {}) => ({ id: 1, nome: 'Anel', tipo: 'acessorio', equipado: false, efeitos: efeitoPoder, ...extra });

let probe;
function Harness() { probe = useArsenalForm(); return null; }
const ficha = () => useStore.getState().minhaFicha;
const reacoes = () => getAcoesExibicao(ficha()).reacao.atual;

function montar(inv, acoes) {
    useStore.setState({
        meuNome: 'Heroi', isMestre: true, avisosAcao: [],
        minhaFicha: { vida: { base: 100, atual: 100 }, acoes: acoes || criarAcoesIniciais(), combate: {}, inventario: inv },
    });
    render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);
}

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('toggleEquiparItem - cobranca de Reacao', () => {
    it('item de Poder marcado Reacao: equipar gasta 1 Reacao e equipa', () => {
        montar([item({ equiparAcao: 'reacao' })]);
        const antes = reacoes();
        expect(antes).toBeGreaterThan(0);
        act(() => { probe.toggleEquiparItem(1); });
        expect(reacoes()).toBe(antes - 1);
        expect(ficha().inventario[0].equipado).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('Acao Livre (ausente ou "livre") nao gasta Reacao', () => {
        montar([item()]);
        const antes = reacoes();
        act(() => { probe.toggleEquiparItem(1); });
        expect(reacoes()).toBe(antes);
        expect(ficha().inventario[0].equipado).toBe(true);
        act(() => { probe.toggleEquiparItem(1); }); // desequipa
        act(() => { useStore.getState().updateFicha(f => { f.inventario[0].equiparAcao = 'livre'; }); });
        act(() => { probe.toggleEquiparItem(1); });
        expect(ficha().inventario[0].equipado).toBe(true);
        expect(reacoes()).toBe(antes);
    });

    it('item marcado Reacao mas sem efeito de Poder nao cobra', () => {
        montar([item({ equiparAcao: 'reacao', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 0 }] })]);
        const antes = reacoes();
        act(() => { probe.toggleEquiparItem(1); });
        expect(reacoes()).toBe(antes);
        expect(ficha().inventario[0].equipado).toBe(true);
    });

    it('desequipar item marcado Reacao nao cobra', () => {
        montar([item({ equiparAcao: 'reacao', equipado: true })]);
        const antes = reacoes();
        act(() => { probe.toggleEquiparItem(1); });
        expect(reacoes()).toBe(antes);
        expect(ficha().inventario[0].equipado).toBe(false);
    });

    it('sem Reacao: pergunta; cancelar nao equipa nem gasta', () => {
        const acoes = criarAcoesIniciais(); acoes.reacao.atual = 0;
        montar([item({ equiparAcao: 'reacao' })], acoes);
        window.confirm.mockReturnValue(false);
        act(() => { probe.toggleEquiparItem(1); });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toMatch(/Sem Reação/);
        expect(ficha().inventario[0].equipado).toBe(false);
        expect(reacoes()).toBe(0);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('sem Reacao: confirmar equipa mesmo assim (Reacao segue em 0)', () => {
        const acoes = criarAcoesIniciais(); acoes.reacao.atual = 0;
        montar([item({ equiparAcao: 'reacao' })], acoes);
        act(() => { probe.toggleEquiparItem(1); });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(ficha().inventario[0].equipado).toBe(true);
        expect(reacoes()).toBe(0);
    });
});
