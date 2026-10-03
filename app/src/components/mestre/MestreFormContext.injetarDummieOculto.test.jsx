import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MestreFormProvider, useMestreForm } from './MestreFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, salvarCenarioCompleto } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA - injetarDummie(): dOculto agora tambem grava o id em cenario.tokensOcultos
// (a invisibilidade do Mapa e por id, nao pelo campo do proprio dummy).
// Mesmo harness de MestreFormContext.poderCalculado.test.jsx.
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
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()),
}));

let mockState;
function montarStore(cenario) {
    mockState = {
        personagens: {}, isMestre: true, meuNome: 'Mestre', userLogado: 'Mestre', mesaId: 'MESA-X', mesaCriador: 'Mestre', mesaMestres: {},
        ...(cenario !== undefined ? { cenario } : {}),
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    useStore.getState = vi.fn(() => mockState);
}

let probe;
function Harness() { probe = useMestreForm(); return null; }

async function injetar({ oculto, cenario } = {}) {
    montarStore(cenario);
    render(<MestreFormProvider><Harness /></MestreFormProvider>);
    await act(async () => {
        probe.setDNome('Sombra');
        probe.setDHp('100');
        probe.setDVit(0);
        if (oculto !== undefined) probe.setDOculto(oculto);
    });
    await act(async () => { probe.injetarDummie(); });
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('MestreFormContext.injetarDummie - entidade oculta', () => {
    it('com dOculto true chama salvarCenarioCompleto com o id do novo dummy em tokensOcultos', async () => {
        await injetar({ oculto: true, cenario: { ativa: 'default', tokensOcultos: ['antigo'] } });
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const idNovo = salvarDummie.mock.calls[0][0];
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        expect(salvarCenarioCompleto.mock.calls[0][0].tokensOcultos).toEqual(['antigo', idNovo]);
        expect(salvarCenarioCompleto.mock.calls[0][0].ativa).toBe('default');
    });
    it('funciona quando o cenario ainda nao tem tokensOcultos', async () => {
        await injetar({ oculto: true, cenario: { ativa: 'default' } });
        const idNovo = salvarDummie.mock.calls[0][0];
        expect(salvarCenarioCompleto.mock.calls[0][0].tokensOcultos).toEqual([idNovo]);
    });
    it('funciona quando o store nem tem cenario (undefined)', async () => {
        await injetar({ oculto: true });
        const idNovo = salvarDummie.mock.calls[0][0];
        expect(salvarCenarioCompleto.mock.calls[0][0].tokensOcultos).toEqual([idNovo]);
    });
    it('nao muta o cenario do store', async () => {
        const cenario = { ativa: 'default', tokensOcultos: ['antigo'] };
        await injetar({ oculto: true, cenario });
        expect(cenario.tokensOcultos).toEqual(['antigo']);
    });
    it('com dOculto false NAO chama salvarCenarioCompleto', async () => {
        await injetar({ oculto: false, cenario: { ativa: 'default' } });
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('dOculto padrao (nao mexido) NAO chama salvarCenarioCompleto', async () => {
        await injetar({ cenario: { ativa: 'default' } });
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('o dummy continua sendo salvo e o alerta menciona Invisivel', async () => {
        await injetar({ oculto: true, cenario: { ativa: 'default' } });
        expect(salvarDummie.mock.calls[0][1].nome).toBe('Sombra');
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Invisivel'));
    });
});
