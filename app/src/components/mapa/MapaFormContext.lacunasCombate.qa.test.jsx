import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('u')), salvarCenarioCompleto: vi.fn(() => Promise.resolve(true)), zerarIniciativaGlobal: vi.fn(),
}));
vi.mock('../../services/gatilhosEventos', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, dispararEventoEmPersonagem: vi.fn(() => ({ textos: [], caminhos: [], chaves: [], disparou: false })) };
});

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}
const ficha = (combate = {}, extra = {}) => ({
    iniciativa: 10, posicao: { x: 0, y: 0, z: 0 },
    acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
    vida: { base: 1e8, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: 1, regeneracao: 0 },
    poderes: [], inventario: [], passivas: [], combate: { fadigaTurnos: 0, fadigaPorTurno: 5, ...combate }, ...extra,
});
function baseState(o = {}) {
    const minhaFicha = ficha();
    return {
        minhaFicha, meuNome: 'Heroi', personagens: {}, updateFicha: vi.fn((cb) => cb(minhaFicha)), feedCombate: [], isMestre: true,
        mesaCriador: '', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 0 }, ...o,
    };
}
let probe;
function Harness() { probe = useMapaForm(); return null; }
const montar = (s) => { mockUseStore(s); return render(<MapaFormProvider><Harness /></MapaFormProvider>); };
const cenarioSalvo = () => { const c = firebaseSync.salvarCenarioCompleto.mock.calls; return c.length ? c[c.length - 1][0] : null; };
const feeds = () => firebaseSync.enviarParaFeed.mock.calls.map(([m]) => m.texto);

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('lacunas do combate no contexto', () => {
    it('ordem de 1 combatente: cada passar turno sobe a rodada', () => {
        montar(baseState({ cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1, iniciadoEm: 1 } }, lista: { default: { nome: 'C' } }, turnoAtualIndex: 0 } }));
        act(() => { probe.avancarTurno(); });
        expect(cenarioSalvo().turnoAtualIndex).toBe(0);
        expect(cenarioSalvo().combates.default.rodada).toBe(2);
        expect(feeds()).toContain('🔁 RODADA 2');
    });
    it('encerrarCombate em cena sem combate não quebra', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar(baseState());
        expect(() => act(() => { probe.encerrarCombate(); })).not.toThrow();
    });
    it('jogador não consegue iniciar combate (sem salvar, sem feed)', () => {
        montar(baseState({ isMestre: false }));
        act(() => { probe.iniciarCombate(); });
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(feeds()).toHaveLength(0);
    });
    it('jogador não revela lado nem muda equipe de dummie', () => {
        montar(baseState({ isMestre: false, dummies: { d: { nome: 'D', iniciativa: 1, ladoOculto: true } } }));
        act(() => {
            expect(probe.alternarLadoOculto({ id: 'd', nome: 'D', isDummie: true })).toBeNull();
            expect(probe.definirEquipeDe({ id: 'd', nome: 'D', isDummie: true }, 'aliados')).toBe(false);
        });
        expect(firebaseSync.salvarDummie).not.toHaveBeenCalled();
        expect(feeds()).toHaveLength(0);
    });
    it('salvarEquipes([]) volta ao padrão: sem equipes e sem relações órfãs', () => {
        montar(baseState({ cenario: { ativa: 'default', lista: { default: { nome: 'C' } }, equipes: [{ id: 'a', nome: 'A' }, { id: 'b', nome: 'B' }], relacoes: { 'a|b': 'hostil' }, turnoAtualIndex: 0 } }));
        act(() => { probe.salvarEquipes([]); });
        const c = cenarioSalvo();
        expect(c.equipes || []).toHaveLength(0);
        expect(Object.keys(c.relacoes || {})).toHaveLength(0);
    });
});
