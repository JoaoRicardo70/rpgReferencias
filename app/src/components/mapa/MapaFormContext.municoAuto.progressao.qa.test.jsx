import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm, aplicarInicioDeTurno } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';

// QA — mUnico Crescente automático no início do turno (aplicarInicioDeTurno / avancarTurno / gravação em outro jogador).

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

const ficha = (overrides = {}, combate = {}) => ({
    iniciativa: 0,
    posicao: { x: 0, y: 0, z: 0 },
    acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
    vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
    poderes: [], inventario: [], passivas: [],
    combate: { fadigaTurnos: 0, fadigaPorTurno: 5, municoTurnos: 0, municoPorTurno: 5, ...combate },
    ...overrides,
});

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
function montar(state) { mockUseStore(state); return render(<MapaFormProvider><Harness /></MapaFormProvider>); }

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('aplicarInicioDeTurno: mUnico Crescente', () => {
    it('interruptor desligado (false) não incrementa', () => {
        const f = ficha({}, { municoAuto: false, municoTurnos: 4 });
        aplicarInicioDeTurno(f); expect(f.combate.municoTurnos).toBe(4);
    });
    it('ficha antiga sem municoAuto não quebra nem incrementa', () => {
        const f = ficha({}, {}); delete f.combate.municoAuto;
        expect(() => aplicarInicioDeTurno(f)).not.toThrow();
        expect(f.combate.municoTurnos).toBe(0);
    });
    it('ficha sem combate nenhum não quebra (combate é criado, sem municoTurnos)', () => {
        const f = ficha(); delete f.combate;
        expect(() => aplicarInicioDeTurno(f)).not.toThrow();
        expect(f.combate.municoTurnos).toBeUndefined();
    });
    it('ligado: +1 a cada início de turno (5 turnos = 5), em paralelo com fadigaTurnos', () => {
        const f = ficha({}, { municoAuto: true });
        for (let i = 0; i < 5; i++) aplicarInicioDeTurno(f);
        expect(f.combate.municoTurnos).toBe(5); expect(f.combate.fadigaTurnos).toBe(5);
    });
    it('ligado: parte do valor manual já existente (7 -> 8)', () => {
        const f = ficha({}, { municoAuto: true, municoTurnos: 7 });
        aplicarInicioDeTurno(f); expect(f.combate.municoTurnos).toBe(8);
    });
    it('taxa 0: ligado não incrementa', () => {
        const f = ficha({}, { municoAuto: true, municoPorTurno: 0 });
        aplicarInicioDeTurno(f); expect(f.combate.municoTurnos).toBe(0);
    });
    it('teto 9999', () => {
        const f = ficha({}, { municoAuto: true, municoTurnos: 9999 });
        aplicarInicioDeTurno(f); expect(f.combate.municoTurnos).toBe(9999);
        const g = ficha({}, { municoAuto: true, municoTurnos: 9998 });
        aplicarInicioDeTurno(g); aplicarInicioDeTurno(g); expect(g.combate.municoTurnos).toBe(9999);
    });
    it('dummie também roda a conta sem quebrar', () => {
        const f = ficha({}, { municoAuto: true });
        expect(() => aplicarInicioDeTurno(f, true, 'Goblin')).not.toThrow();
    });
});

describe('avancarTurno: quem recebe o turno', () => {
    it('o turno chega para MIM com auto ligado: +1 na minha ficha', () => {
        const state = baseState({ dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } } });
        state.minhaFicha.iniciativa = 10; state.minhaFicha.combate.municoAuto = true;
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.municoTurnos).toBe(1);
        // próxima volta da ordem: remonta com o turno de novo no filler (mesma ficha)
        cleanup();
        state.cenario = { ...state.cenario, turnoAtualIndex: 0 };
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.municoTurnos).toBe(2);
    });
    it('o turno chega para MIM com auto DESLIGADO: não muda', () => {
        const state = baseState({ dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } } });
        state.minhaFicha.iniciativa = 10;
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.municoTurnos).toBe(0);
    });
    it('turno de OUTRO jogador / de um dummie não conta na minha ficha, mesmo com auto ligado', () => {
        const state = baseState({ personagens: { Vilao: ficha({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } }) } });
        state.minhaFicha.combate.municoAuto = true; state.minhaFicha.combate.municoTurnos = 3;
        montar(state);
        act(() => { probe.avancarTurno(); }); // EU -> Vilao
        expect(state.minhaFicha.combate.municoTurnos).toBe(3);
        cleanup();
        const s2 = baseState({ dummies: { goblin: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 } } } });
        s2.minhaFicha.combate.municoAuto = true; s2.minhaFicha.combate.municoTurnos = 3;
        montar(s2);
        act(() => { probe.avancarTurno(); }); // EU -> Goblin
        expect(s2.minhaFicha.combate.municoTurnos).toBe(3);
    });
    it('jogador REMOTO com auto ligado: grava combate/municoTurnos (+1) em salvarCamposPersonagem, sem undefined', () => {
        const state = baseState({ personagens: { Vilao: ficha({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } }, { municoAuto: true, municoTurnos: 4 }) } });
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nome, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Vilao');
        expect(campos['combate/municoTurnos']).toBe(5);
        Object.values(campos).forEach(v => expect(v).not.toBeUndefined());
        // o espelho local do outro jogador não é mutado (só a escrita direta)
        expect(state.personagens.Vilao.combate.municoTurnos).toBe(4);
    });
    it('jogador remoto com auto desligado: o caminho NÃO é gravado', () => {
        const state = baseState({ personagens: { Vilao: ficha({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } }, { municoAuto: false, municoTurnos: 4 }) } });
        montar(state);
        act(() => { probe.avancarTurno(); });
        const [, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(campos).not.toHaveProperty('combate/municoTurnos');
    });
    it('jogador remoto ficha antiga (sem municoAuto, sem municoTurnos) não quebra e não grava o caminho', () => {
        const v = ficha({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } }); delete v.combate.municoTurnos; delete v.combate.municoPorTurno;
        const state = baseState({ personagens: { Vilao: v } });
        montar(state);
        expect(() => act(() => { probe.avancarTurno(); })).not.toThrow();
        const [, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(campos).not.toHaveProperty('combate/municoTurnos');
    });
    it('jogador remoto com taxa 0: grava o valor atual (inalterado), sem incremento', () => {
        const state = baseState({ personagens: { Vilao: ficha({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } }, { municoAuto: true, municoTurnos: 4, municoPorTurno: 0 }) } });
        montar(state);
        act(() => { probe.avancarTurno(); });
        const [, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(campos['combate/municoTurnos']).toBe(4);
    });
});

describe('descansar (Mapa)', () => {
    it('zera municoTurnos com auto ligado e com auto desligado', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        [true, false].forEach((auto) => {
            cleanup();
            const state = baseState();
            state.minhaFicha.combate.municoAuto = auto; state.minhaFicha.combate.municoTurnos = 9;
            montar(state);
            act(() => { probe.descansar(); });
            expect(state.minhaFicha.combate.municoTurnos).toBe(0);
            expect(state.minhaFicha.combate.municoAuto).toBe(auto);
        });
    });
});
