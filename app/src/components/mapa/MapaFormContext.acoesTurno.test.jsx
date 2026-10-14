import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}
function ficha(overrides = {}) {
    return {
        iniciativa: 0, posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
        poderes: [], inventario: [], passivas: [], combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...overrides,
    };
}
function baseState(overrides = {}) {
    const minhaFicha = ficha({ iniciativa: 20 });
    return {
        minhaFicha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre: false, mesaCriador: '', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...overrides,
    };
}
let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) { mockUseStore(state); probe = undefined; return render(<MapaFormProvider><Harness /></MapaFormProvider>); }

describe('MapaFormContext: camposDeInicioDeTurno grava acoes/<tipo>/max', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => { cleanup(); });

    it('ao passar o turno para OUTRO jogador (ficha antiga max 1) escreve max recalculado (2) e atual cheio', async () => {
        const fb = await import('../../services/firebase-sync');
        const outro = ficha({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } });
        const state = baseState({ personagens: { Vilao: outro } });
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(fb.salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nome, campos] = fb.salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Vilao');
        ['padrao', 'bonus', 'reacao'].forEach(t => {
            expect(campos[`acoes/${t}/max`]).toBe(2);
            expect(campos[`acoes/${t}/atual`]).toBe(2);
        });
    });

    it('max inclui efeito de item equipado do outro jogador (+1 Acao = 3/3/3)', async () => {
        const fb = await import('../../services/firebase-sync');
        const outro = ficha({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 },
            inventario: [{ equipado: true, efeitos: [{ nome: 'x', atributo: 'acao_padrao', propriedade: 'base', valor: 1 }] }] });
        montar(baseState({ personagens: { Vilao: outro } }));
        act(() => { probe.avancarTurno(); });
        const [, campos] = fb.salvarCamposPersonagem.mock.calls[0];
        expect(campos['acoes/padrao/max']).toBe(3);
        expect(campos['acoes/bonus/max']).toBe(3);
        expect(campos['acoes/reacao/max']).toBe(3);
    });
});
