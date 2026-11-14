import React from 'react';
import { render, cleanup, act, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';

// Aprovação dos ganhos permanentes ao encerrar o combate (Mestre/Co-Mestre): diálogo, foto no início, Descansar e permissões.
// Usa o serviço de gatilhos REAL (dispararEventoEmPersonagem) sobre o store simulado.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve(true)),
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
const ADAPT = { adaptacaoLigada: true, adaptacaoFator: 1.3125, adaptacaoSoma: 30, adaptacaoTurnos: 2 };
const FOTO0 = { ganhosAntesDoCombate: { poderCalculado: 0, fatorPoder: 1 } };
const ativo = () => ({ default: { ativo: true, rodada: 2, iniciadoEm: 1 } });

function baseState(overrides = {}) {
    const minhaFicha = ficha({ iniciativa: 10 }, { ...ADAPT, ...FOTO0 });
    return {
        minhaFicha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre: true, mesaCriador: '', dummies: {},
        alvoSelecionado: null, abaAtiva: 'mapa', setAcoesOrdemTurnoMapa: vi.fn(),
        cenario: { ativa: 'default', combates: ativo(), lista: { default: { nome: 'Cena' }, outra: { nome: 'Outra' } }, turnoAtualIndex: 0 },
        ...overrides,
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) { mockUseStore(state); return render(<MapaFormProvider><Harness /></MapaFormProvider>); }
const cenarioSalvo = () => { const c = firebaseSync.salvarCenarioCompleto.mock.calls; return c.length ? c[c.length - 1][0] : null; };
const camposSalvos = (nome) => firebaseSync.salvarCamposPersonagem.mock.calls.filter(([n]) => n === nome).map(([, c]) => c);
const botao = (nome) => screen.getByRole('button', { name: nome });

// Vilão (NPC remoto) com derivados do combate: +0,5 de Poder aditivo sobre a foto 0,2.
const vilaoComDerivados = () => ficha({ iniciativa: 5, isNPC: true, posicao: { x: 1, y: 1, z: 0 }, ganhosPermanentes: { poderCalculado: 0.7, fatorPoder: 1 } }, { ganhosAntesDoCombate: { poderCalculado: 0.2, fatorPoder: 1 } });

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('encerrarCombate com ganhos permanentes pendentes', () => {
    it('abre o diálogo SEM encerrar: lista a Adaptação (eu) e os derivados (outro) e nada é salvo ainda', () => {
        montar(baseState({ personagens: { Vilao: vilaoComDerivados() } }));
        act(() => { probe.encerrarCombate(); });
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByTestId('aprovacao-item-Heroi').textContent).toMatch(/média de \+15% em 2 turnos/);
        expect(screen.getByTestId('aprovacao-item-Vilao').textContent).toMatch(/\+50% \(derivados\)/);
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(firebaseSync.zerarIniciativaGlobal).not.toHaveBeenCalled();
    });
    it('liberar (pré-selecionado): converte a Adaptação, mantém os derivados e apaga a foto', () => {
        const state = baseState({ personagens: { Vilao: vilaoComDerivados() } });
        montar(state);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 6);
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(0);
        expect(state.minhaFicha.combate.ganhosAntesDoCombate).toBeUndefined();
        const c = camposSalvos('Vilao')[0];
        expect(c['combate/ganhosAntesDoCombate']).toBeNull();
        expect(c).not.toHaveProperty('ganhosPermanentes/poderCalculado');
        expect(cenarioSalvo().combates).toBeUndefined();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('recusar todos: volta ao Poder de antes (eu e outro) e grava os caminhos no Firebase do outro', () => {
        const state = baseState({ personagens: { Vilao: vilaoComDerivados() } });
        state.minhaFicha.ganhosPermanentes = { poderCalculado: 0.4, fatorPoder: 1 };
        state.minhaFicha.combate.ganhosAntesDoCombate = { poderCalculado: 0.1, fatorPoder: 1 };
        montar(state);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.click(botao('Recusar todos')); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1, 9);
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(0);
        const c = camposSalvos('Vilao')[0];
        expect(c['ganhosPermanentes/poderCalculado']).toBeCloseTo(0.2, 9);
        expect(c['combate/ganhosAntesDoCombate']).toBeNull();
        Object.values(c).forEach(v => expect(v).not.toBeUndefined());
        const textos = firebaseSync.enviarParaFeed.mock.calls.map(([m]) => m.texto);
        expect(textos.some(t => t.includes('Vilao') && t.includes('❌ o Mestre recusou os ganhos permanentes'))).toBe(true);
        expect(cenarioSalvo().combates).toBeUndefined();
    });
    it('decisão por personagem: libera um e recusa o outro', () => {
        const state = baseState({ personagens: { Vilao: vilaoComDerivados() } });
        montar(state);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.click(screen.getByTestId('aprovacao-item-Vilao').querySelector('input[value="recusar"]')); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 6);
        expect(camposSalvos('Vilao')[0]['ganhosPermanentes/poderCalculado']).toBeCloseTo(0.2, 9);
    });
    it('Cancelar NÃO encerra o combate nem mexe em ninguém', () => {
        const state = baseState({ personagens: { Vilao: vilaoComDerivados() } });
        montar(state);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.click(botao('Cancelar')); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(firebaseSync.zerarIniciativaGlobal).not.toHaveBeenCalled();
        expect(firebaseSync.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(2);
        expect(state.minhaFicha.iniciativa).toBe(10);
    });
    it('sem pendências: encerra direto (sem diálogo) e apaga a foto', () => {
        const state = baseState();
        Object.assign(state.minhaFicha.combate, { adaptacaoSoma: 0, adaptacaoTurnos: 0, adaptacaoFator: 1 });
        montar(state);
        act(() => { probe.encerrarCombate(); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(cenarioSalvo().combates).toBeUndefined();
        expect(state.minhaFicha.combate.ganhosAntesDoCombate).toBeUndefined();
    });
    it('opção DESLIGADA: sem diálogo, converte a Adaptação sozinho (como antes)', () => {
        const state = baseState({ personagens: { Vilao: vilaoComDerivados() } });
        state.cenario.aprovarGanhosPermanentes = false;
        montar(state);
        act(() => { probe.encerrarCombate(); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 6);
        expect(cenarioSalvo().combates).toBeUndefined();
    });
    it('o confirm existente recusado: nada acontece, nem diálogo', () => {
        window.confirm.mockReturnValue(false);
        montar(baseState());
        act(() => { probe.encerrarCombate(); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
});

describe('mutex e cenário fresco', () => {
    it('duas chamadas seguidas de encerrarCombate abrem UM diálogo só; Cancelar libera', () => {
        montar(baseState());
        act(() => { probe.encerrarCombate(); probe.encerrarCombate(); });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        act(() => { fireEvent.click(botao('Cancelar')); });
        act(() => { probe.encerrarCombate(); });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });
    it('Confirmar duplo encerra uma vez só', () => {
        montar(baseState());
        act(() => { probe.encerrarCombate(); });
        const b = botao('Confirmar e encerrar');
        act(() => { fireEvent.click(b); fireEvent.click(b); });
        expect(firebaseSync.zerarIniciativaGlobal).toHaveBeenCalledTimes(1);
    });
    it('troca de cena usa o cenário atual do store (edição com o diálogo aberto não é sobrescrita)', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.ativarCena('outra'); });
        state.cenario = { ...state.cenario, equipes: [{ id: 'x', nome: 'Nova' }] };
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(cenarioSalvo().equipes).toEqual([{ id: 'x', nome: 'Nova' }]);
        expect(cenarioSalvo().ativa).toBe('outra');
    });
});

describe('ativarCena (combate que sai)', () => {
    it('com pendências abre o diálogo; Cancelar não troca a cena', () => {
        montar(baseState());
        act(() => { probe.ativarCena('outra'); });
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
        act(() => { fireEvent.click(botao('Cancelar')); });
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('Recusar todos + confirmar: troca a cena e a Adaptação some sem converter', () => {
        const state = baseState();
        state.minhaFicha.posicoes = { default: { cenaId: 'default' } };
        montar(state);
        act(() => { probe.ativarCena('outra'); });
        act(() => { fireEvent.click(botao('Recusar todos')); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(cenarioSalvo().ativa).toBe('outra');
        expect(state.minhaFicha.ganhosPermanentes?.poderCalculado || 0).toBe(0);
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(0);
    });
    it('sem pendências troca direto', () => {
        const state = baseState();
        Object.assign(state.minhaFicha.combate, { adaptacaoSoma: 0, adaptacaoTurnos: 0, adaptacaoFator: 1 });
        montar(state);
        act(() => { probe.ativarCena('outra'); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(cenarioSalvo().ativa).toBe('outra');
    });
});

describe('foto do Poder ao iniciar o combate', () => {
    it('grava ganhosAntesDoCombate em mim (updateFicha) e no outro (salvarCamposPersonagem); dummies não', () => {
        const state = baseState({
            cenario: { ativa: 'default', lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 0 },
            dummies: { d1: { nome: 'Boneco', iniciativa: 3, posicao: { x: 5, y: 5, z: 0 } } },
            personagens: { Vilao: ficha({ iniciativa: 5, isNPC: true, posicao: { x: 1, y: 1, z: 0 }, ganhosPermanentes: { poderCalculado: 0.3, fatorPoder: 2 } }) },
        });
        delete state.minhaFicha.combate.ganhosAntesDoCombate;
        state.minhaFicha.ganhosPermanentes = { poderCalculado: 0.6, fatorPoder: 1.5 };
        montar(state);
        act(() => { probe.iniciarCombate(); });
        expect(state.minhaFicha.combate.ganhosAntesDoCombate).toEqual({ poderCalculado: 0.6, fatorPoder: 1.5 });
        expect(state.minhaFicha.ganhosPermanentes).toEqual({ poderCalculado: 0.6, fatorPoder: 1.5 });
        expect(camposSalvos('Vilao').some(c => JSON.stringify(c['combate/ganhosAntesDoCombate']) === JSON.stringify({ poderCalculado: 0.3, fatorPoder: 2 }))).toBe(true);
        expect(firebaseSync.salvarCamposPersonagem.mock.calls.some(([n]) => n === 'Boneco' || n === 'd1')).toBe(false);
    });
    it('sem ganhos: foto 0/1', () => {
        const state = baseState({ cenario: { ativa: 'default', lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 0 } });
        delete state.minhaFicha.combate.ganhosAntesDoCombate;
        montar(state);
        act(() => { probe.iniciarCombate(); });
        expect(state.minhaFicha.combate.ganhosAntesDoCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
});

describe('Descansar (fimDeLuta fora do encerramento do Mestre)', () => {
    it('opção ligada + combate ativo: NÃO converte, NÃO zera a Adaptação e mantém a foto', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.descansar(); });
        expect(state.minhaFicha.ganhosPermanentes?.poderCalculado || 0).toBe(0);
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(2);
        expect(state.minhaFicha.combate.adaptacaoFator).toBe(1.3125);
        expect(state.minhaFicha.combate.ganhosAntesDoCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
    it('opção ligada, sem combate ativo: zera a Adaptação SEM converter e apaga a foto', () => {
        const state = baseState();
        delete state.cenario.combates;
        montar(state);
        act(() => { probe.descansar(); });
        expect(state.minhaFicha.ganhosPermanentes?.poderCalculado || 0).toBe(0);
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(0);
        expect(state.minhaFicha.combate.ganhosAntesDoCombate).toBeUndefined();
    });
    it('opção desligada: converte como hoje', () => {
        const state = baseState();
        state.cenario.aprovarGanhosPermanentes = false;
        montar(state);
        act(() => { probe.descansar(); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 6);
        expect(state.minhaFicha.combate.adaptacaoFator).toBe(1);
        expect(state.minhaFicha.combate.ganhosAntesDoCombate).toBeUndefined();
    });
});

describe('permissões: só isMestre efetivo (Mestre/Co-Mestre; Modo Jogador e jogador não)', () => {
    it('encerrarCombate sem isMestre: nada acontece, nem diálogo nem confirm', () => {
        const state = baseState({ isMestre: false });
        montar(state);
        act(() => { probe.encerrarCombate(); });
        expect(window.confirm).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(2);
    });
    it('ativarCena sem isMestre: nada acontece', () => {
        montar(baseState({ isMestre: false, modoJogador: true }));
        act(() => { probe.ativarCena('outra'); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('interruptor (definirAprovarGanhos) sem isMestre não grava', () => {
        const state = baseState({ isMestre: false });
        montar(state);
        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        expect(acoes.definirAprovarGanhos(false)).toBe(false);
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('interruptor com isMestre (Mestre ou Co-Mestre): desligar grava false; ligar remove a chave', () => {
        const state = baseState();
        montar(state);
        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        expect(acoes.definirAprovarGanhos(false)).toBe(true);
        expect(cenarioSalvo().aprovarGanhosPermanentes).toBe(false);
        state.cenario = { ...state.cenario, aprovarGanhosPermanentes: false };
        expect(acoes.definirAprovarGanhos(true)).toBe(true);
        expect('aprovarGanhosPermanentes' in cenarioSalvo()).toBe(false);
    });
    it('o diálogo fecha sozinho se o Mestre entrar em Modo Jogador com ele aberto', () => {
        const state = baseState();
        const { rerender } = montar(state);
        act(() => { probe.encerrarCombate(); });
        expect(screen.getByRole('dialog')).toBeTruthy();
        mockUseStore({ ...state, isMestre: false });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
});
