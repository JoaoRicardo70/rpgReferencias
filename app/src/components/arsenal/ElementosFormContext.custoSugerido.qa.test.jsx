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

let probe;
function Harness() { probe = useElementosForm(); return null; }
function montar(elemEditandoId = null) {
    const ficha = { ataquesElementais: [] };
    const state = {
        minhaFicha: ficha, personagens: {}, meuNome: 'Heroi', updateFicha: vi.fn((cb) => cb(ficha)), updateFichaAlvo: vi.fn(),
        setAbaAtiva: vi.fn(), elemEditandoId, setElemEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    render(<ElementosFormProvider><Harness /></ElementosFormProvider>);
}
const escolher = (nome) => act(() => { probe.selecionarElemento(nome); });

beforeEach(() => { window.alert = vi.fn(); });
afterEach(() => { cleanup(); probe = undefined; });

describe('ElementosFormContext.selecionarElemento - custo sugerido', () => {
    it('pre-preenche ao escolher categoria com sugestao', () => {
        montar();
        escolher('Magias de 3º Ciclo');
        expect(Number(probe.custoValor)).toBe(12);
        expect(probe.custoSugerido).toBe(12);
        escolher('Magias de 10º Ciclo');
        expect(Number(probe.custoValor)).toBe(20);
    });
    it('Kekkei Genkai 10 e Kekkei Touta 20', () => {
        montar();
        escolher('Elemento Madeira');
        expect(Number(probe.custoValor)).toBe(10);
        escolher('Elemento Velocidade');
        expect(Number(probe.custoValor)).toBe(20);
    });
    it('nao sobrescreve valor digitado pelo usuario ao escolher outra categoria com sugestao', () => {
        montar();
        escolher('Magias de 1º Ciclo');
        act(() => { probe.setCustoValor(33); });
        escolher('Magias de 2º Ciclo');
        // contrato: valor digitado pelo usuario nao deve ser perdido
        expect(Number(probe.custoValor)).toBe(33);
    });
    it('categoria sem sugestao limpa so se o valor ainda e o pre-preenchido', () => {
        montar();
        escolher('Magias de 1º Ciclo');
        escolher('Fogo');
        expect(Number(probe.custoValor)).toBe(0);
        expect(probe.custoSugerido).toBeNull();
    });
    it('categoria sem sugestao NAO limpa valor digitado pelo usuario', () => {
        montar();
        escolher('Magias de 1º Ciclo');
        act(() => { probe.setCustoValor(25); });
        escolher('Fogo');
        expect(Number(probe.custoValor)).toBe(25);
    });
    it('sem sugestao previa: escolher categoria sem sugestao mantem o digitado', () => {
        montar();
        act(() => { probe.setCustoValor(7); });
        escolher('Fogo');
        expect(Number(probe.custoValor)).toBe(7);
    });
    it('editando tecnica salva (elemEditandoId): nao mexe no custo', () => {
        montar('abc');
        act(() => { probe.setCustoValor(44); });
        escolher('Magias de 3º Ciclo');
        expect(Number(probe.custoValor)).toBe(44);
    });
});
