import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm, aplicarInicioDeTurno } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { getPoderParaDisputa } from '../../core/disputaPoder';

// QA — Adaptação (por diferença de Poder) no início do turno (aplicarInicioDeTurno / avancarTurno / gravação em outro jogador / descansar).

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
    combate: { fadigaTurnos: 0, fadigaPorTurno: 5, ...combate },
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

const poderBase = () => getPoderParaDisputa(ficha(), 1);

describe('aplicarInicioDeTurno: Adaptação', () => {
    const ctx = (mult) => ({ oponente: { nome: 'Rival', poder: poderBase() * mult }, divisorPoderMesa: 1 });
    it('desligada: não registra nada', () => {
        const f = ficha({}, { adaptacaoLigada: false });
        const r = aplicarInicioDeTurno(f, false, 'Heroi', ctx(1.1));
        expect(f.combate.adaptacaoTurnos).toBeUndefined();
        expect(r.adaptacao).toBe('');
    });
    it('ligada com oponente 10% mais forte e fração 50: +5% e fator x1,05', () => {
        const f = ficha({}, { adaptacaoLigada: true, adaptacaoFracao: 50 });
        const r = aplicarInicioDeTurno(f, false, 'Heroi', ctx(1.1));
        expect(f.combate.adaptacaoFator).toBeCloseTo(1.05, 6);
        expect(f.combate.adaptacaoTurnos).toBe(1);
        expect(r.adaptacao).toContain('Adaptação');
        expect(f.combate.fadigaTurnos).toBe(1);
    });
    it('sem contexto/oponente: não registra e não quebra', () => {
        const f = ficha({}, { adaptacaoLigada: true });
        expect(() => aplicarInicioDeTurno(f, false, 'Heroi', null)).not.toThrow();
        expect(() => aplicarInicioDeTurno(f, false, 'Heroi', { oponente: null })).not.toThrow();
        expect(f.combate.adaptacaoTurnos).toBeUndefined();
    });
    it('dummie não adapta', () => {
        const f = ficha({}, { adaptacaoLigada: true });
        aplicarInicioDeTurno(f, true, 'Goblin', ctx(2));
        expect(f.combate.adaptacaoTurnos).toBeUndefined();
    });
    it('ficha antiga (campos legados) é ignorada', () => {
        const f = ficha({}, { municoAuto: true, municoTurnos: 3, municoPorTurno: 5 });
        expect(() => aplicarInicioDeTurno(f, false, 'Heroi', ctx(2))).not.toThrow();
        expect(f.combate.municoTurnos).toBe(3);
        expect(f.combate.adaptacaoTurnos).toBeUndefined();
    });
});

describe('avancarTurno: quem recebe o turno', () => {
    const comRival = (extraCombate = {}) => {
        const state = baseState({ dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 }, poderCalculado: poderBase() * 1.2 } } });
        state.minhaFicha.iniciativa = 10; Object.assign(state.minhaFicha.combate, { adaptacaoLigada: true, ...extraCombate });
        return state;
    };
    it('o turno chega para MIM: mede contra a entidade com Poder definido (+20% x 50% = +10%)', () => {
        const state = comRival();
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(1);
        expect(state.minhaFicha.combate.adaptacaoFator).toBeCloseTo(1.1, 4);
        expect(state.minhaFicha.combate.adaptacaoUltimo.oponenteNome).toBe('Filler');
        expect(firebaseSync.enviarParaFeed.mock.calls.some(([m]) => /Adaptação/.test(m.texto))).toBe(true);
    });
    it('oponente sem Poder definido é ignorado: nada registrado', () => {
        const state = comRival();
        delete state.dummies.filler.poderCalculado;
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBeUndefined();
    });
    it('desligada: não muda', () => {
        const state = comRival({ adaptacaoLigada: false });
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBeUndefined();
    });
    it('jogador REMOTO ligado: grava combate/adaptacao* em salvarCamposPersonagem, sem undefined, sem mutar o espelho', () => {
        const state = baseState({ personagens: { Vilao: ficha({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } }, { adaptacaoLigada: true }) } });
        // o Heroi (20) é mais forte? mesma ficha -> sem ganho, mas o turno conta
        montar(state);
        act(() => { probe.avancarTurno(); });
        const [nome, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Vilao');
        expect(campos['combate/adaptacaoTurnos']).toBe(1);
        expect(campos['combate/adaptacaoFator']).toBe(1);
        Object.values(campos).forEach(v => expect(v).not.toBeUndefined());
        expect(state.personagens.Vilao.combate.adaptacaoTurnos).toBeUndefined();
    });
    it('jogador remoto desligado: os caminhos NÃO são gravados', () => {
        const state = baseState({ personagens: { Vilao: ficha({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } }) } });
        montar(state);
        act(() => { probe.avancarTurno(); });
        const [, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(campos).not.toHaveProperty('combate/adaptacaoTurnos');
    });
});

describe('descansar (Mapa)', () => {
    it('converte a média em permanente via fimDeLuta e zera o fator', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const state = baseState();
        Object.assign(state.minhaFicha.combate, { adaptacaoLigada: true, adaptacaoFator: 1.3125, adaptacaoSoma: 30, adaptacaoTurnos: 2 });
        montar(state);
        act(() => { probe.descansar(); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 6);
        expect(state.minhaFicha.combate.adaptacaoFator).toBe(1);
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(0);
        expect(state.minhaFicha.combate.adaptacaoLigada).toBe(true);
    });
});
