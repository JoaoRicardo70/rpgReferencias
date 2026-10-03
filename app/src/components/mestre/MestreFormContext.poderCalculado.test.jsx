import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MestreFormProvider, useMestreForm } from './MestreFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA - injetarDummie(): campo "dPoder" (Poder Calculado) vira poderCalculado no dummie salvo.
// Mesmo harness de MestreFormContext.rescaleVitaisExibicao.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../services/firebase-config', () => ({ db: { __isMock: true } }));
vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    apagarFicha: vi.fn(),
}));

let mockState;
function montarStore() {
    mockState = { personagens: {}, isMestre: true, meuNome: 'Mestre', userLogado: 'Mestre', mesaId: 'MESA-X', mesaCriador: 'Mestre', mesaMestres: {} };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    useStore.getState = vi.fn(() => mockState);
}

let probe;
function Harness() { probe = useMestreForm(); return null; }

async function injetarComPoder(valor) {
    montarStore();
    render(<MestreFormProvider><Harness /></MestreFormProvider>);
    await act(async () => {
        probe.setDHp('100');
        probe.setDVit(0);
        if (valor !== undefined) probe.setDPoder(valor);
    });
    await act(async () => { probe.injetarDummie(); });
    return salvarDummie.mock.calls[0][1];
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('MestreFormContext - injetarDummie com Poder Calculado (dPoder)', () => {
    it('dPoder comeca vazio', async () => {
        montarStore();
        render(<MestreFormProvider><Harness /></MestreFormProvider>);
        expect(probe.dPoder).toBe('');
    });
    it('poder digitado vira poderCalculado numerico', async () => {
        const payload = await injetarComPoder('1500');
        expect(payload.poderCalculado).toBe(1500);
    });
    it('poder decimal e preservado', async () => {
        expect((await injetarComPoder('0.5')).poderCalculado).toBe(0.5);
    });
    it('poder 0 e valido e gravado', async () => {
        const payload = await injetarComPoder('0');
        expect(payload.poderCalculado).toBe(0);
    });
    it('poder negativo e limitado a 0', async () => {
        expect((await injetarComPoder('-30')).poderCalculado).toBe(0);
    });
    it.each([[''], ['   '], ['abc']])('poder vazio/invalido (%j) nao grava o campo', async (v) => {
        const payload = await injetarComPoder(v);
        expect('poderCalculado' in payload).toBe(false);
    });
    it('nao informar poder mantem o payload antigo (hp, defesa, posicao) sem poderCalculado', async () => {
        const payload = await injetarComPoder(undefined);
        expect('poderCalculado' in payload).toBe(false);
        expect(payload.hpMax).toBe(100000);
        expect(payload.posicao).toEqual({ x: 0, y: 0 });
    });
});
