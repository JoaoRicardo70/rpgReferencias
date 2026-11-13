import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import * as gatilhosEventos from '../../services/gatilhosEventos';
import { getPoderParaDisputa } from '../../core/disputaPoder';

// Combate iniciado explicitamente (cenario.combates[cena]): gate do avancarTurno, rodadas, iniciarCombate, encerrarCombate, ativarCena e lados (equipes).

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
    const minhaFicha = ficha({ iniciativa: 10 });
    return {
        minhaFicha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre: true, mesaCriador: '', dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...overrides,
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) { mockUseStore(state); return render(<MapaFormProvider><Harness /></MapaFormProvider>); }
const feeds = () => firebaseSync.enviarParaFeed.mock.calls.map(([m]) => m.texto);
const cenarioSalvo = () => { const c = firebaseSync.salvarCenarioCompleto.mock.calls; return c.length ? c[c.length - 1][0] : null; };
const ativo = (rodada = 1) => ({ default: { ativo: true, rodada, iniciadoEm: 1 } });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('avancarTurno exige combate ativo', () => {
    it('sem combate: avisa no Feed, não salva o cenário e não mexe na ficha', () => {
        const state = baseState();
        montar(state);
        expect(probe.combateAtivo).toBe(false);
        expect(probe.combateSemInicio).toBe(true);
        act(() => { probe.avancarTurno(); });
        expect(feeds()).toContain('⚠️ Inicie o combate primeiro');
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(state.updateFicha).not.toHaveBeenCalled();
    });
    it('Adaptação não registra turno sem combate ativo', () => {
        const state = baseState();
        state.minhaFicha.combate.adaptacaoLigada = true;
        state.dummies.filler.poderCalculado = getPoderParaDisputa(ficha(), 1) * 1.5;
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBeUndefined();
    });
    it('com combate ativo passa o turno e expõe a rodada', () => {
        const state = baseState({ cenario: { ativa: 'default', combates: ativo(3), lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 0 } });
        montar(state);
        expect(probe.combateAtivo).toBe(true);
        expect(probe.rodadaAtual).toBe(3);
        expect(probe.combateSemInicio).toBe(false);
        act(() => { probe.avancarTurno(); });
        expect(cenarioSalvo().turnoAtualIndex).toBe(1);
        expect(cenarioSalvo().combates.default.rodada).toBe(3);
    });
    it('rodada sobe quando o índice volta ao primeiro e o Feed anuncia', () => {
        // ordem: Filler (20), Heroi (10); turno atual = último (1) -> volta a 0
        const state = baseState({ cenario: { ativa: 'default', combates: ativo(1), lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 1 } });
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(cenarioSalvo().turnoAtualIndex).toBe(0);
        expect(cenarioSalvo().combates.default.rodada).toBe(2);
        expect(feeds()).toContain('🔁 RODADA 2');
    });
});

describe('iniciarCombate', () => {
    it('Mestre: salva combates.default {ativo, rodada 1}, turno 0, avisa no Feed e dispara inicioDeLuta só em quem tem ficha', () => {
        const state = baseState({ cenario: { ativa: 'default', lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 2 } });
        montar(state);
        let ok;
        act(() => { ok = probe.iniciarCombate(); });
        expect(ok).toBe(true);
        const c = cenarioSalvo();
        expect(c.combates.default).toMatchObject({ ativo: true, rodada: 1 });
        expect(typeof c.combates.default.iniciadoEm).toBe('number');
        expect(c.turnoAtualIndex).toBe(0);
        expect(feeds()).toContain('⚔️ COMBATE INICIADO — Rodada 1');
        const chamadas = gatilhosEventos.dispararEventoEmPersonagem.mock.calls;
        expect(chamadas).toEqual([['Heroi', { tipo: 'inicioDeLuta' }]]);
        // o primeiro da ordem (Filler, dummie) começa o turno
        expect(feeds()).toContain('🔄 É a vez de Filler agir!');
        expect(firebaseSync.salvarDummie).toHaveBeenCalledWith('filler', expect.any(Object));
    });
    it('duas chamadas seguidas iniciam UMA vez só (mutex)', () => {
        montar(baseState());
        let r1; let r2;
        act(() => { r1 = probe.iniciarCombate(); r2 = probe.iniciarCombate(); });
        expect(r1).toBe(true);
        expect(r2).toBe(false);
        expect(feeds().filter(t => t.includes('COMBATE INICIADO'))).toHaveLength(1);
        expect(gatilhosEventos.dispararEventoEmPersonagem.mock.calls.filter(([, ev]) => ev.tipo === 'inicioDeLuta')).toHaveLength(1);
        expect(firebaseSync.salvarCenarioCompleto).toHaveBeenCalledTimes(1);
    });
    it('texto do gatilho inicioDeLuta vai ao Feed', () => {
        gatilhosEventos.dispararEventoEmPersonagem.mockReturnValueOnce({ textos: ['Berserk ligado'], caminhos: [], chaves: [], disparou: true });
        montar(baseState());
        act(() => { probe.iniciarCombate(); });
        expect(feeds()).toContain('🔔 Heroi: Berserk ligado');
    });
    it('jogador (não Mestre) não inicia', () => {
        montar(baseState({ isMestre: false }));
        let ok;
        act(() => { ok = probe.iniciarCombate(); });
        expect(ok).toBe(false);
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('sem ninguém na ordem: avisa e não inicia', () => {
        montar(baseState({ dummies: {}, minhaFicha: ficha({ iniciativa: 0 }) }));
        let ok;
        act(() => { ok = probe.iniciarCombate(); });
        expect(ok).toBe(false);
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(feeds().some(t => t.includes('Ninguém está na ordem'))).toBe(true);
    });
    it('já ativo: não reinicia', () => {
        montar(baseState({ cenario: { ativa: 'default', combates: ativo(4), lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 1 } }));
        let ok;
        act(() => { ok = probe.iniciarCombate(); });
        expect(ok).toBe(false);
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('Adaptação do primeiro da ordem é medida ao iniciar (o combate já vai ficar ativo)', () => {
        const state = baseState({ dummies: {} });
        state.minhaFicha.combate.adaptacaoLigada = true;
        state.personagens = { Vilao: ficha({ iniciativa: 5, isNPC: true, posicao: { x: 1, y: 1, z: 0 } }) };
        montar(state);
        act(() => { probe.iniciarCombate(); });
        expect(state.minhaFicha.combate.adaptacaoTurnos).toBe(1);
    });
});

describe('encerrarCombate e ativarCena limpam o estado do combate', () => {
    beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
    afterEach(() => { vi.restoreAllMocks(); });
    it('encerrarCombate: remove combates.default e zera o turno', () => {
        montar(baseState({ cenario: { ativa: 'default', combates: ativo(2), lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 1 } }));
        act(() => { probe.encerrarCombate(); });
        const c = cenarioSalvo();
        expect(c.combates).toBeUndefined();
        expect(c.turnoAtualIndex).toBe(0);
    });
    it('ativarCena: o combate da cena que sai acaba, o das outras fica, turnoAtualIndex preservado', () => {
        const state = baseState({ cenario: { ativa: 'default', combates: { ...ativo(2), outra: { ativo: true, rodada: 7 } }, lista: { default: { nome: 'Cena' }, outra: { nome: 'Outra' } }, turnoAtualIndex: 1 } });
        montar(state);
        act(() => { probe.ativarCena('outra'); });
        const c = cenarioSalvo();
        expect(c.ativa).toBe('outra');
        expect(c.combates.default).toBeUndefined();
        expect(c.combates.outra.rodada).toBe(7);
        expect(c.turnoAtualIndex).toBe(1);
        expect(feeds().some(t => t.includes('foi encerrado pela troca de cena'))).toBe(true);
    });
    it('ativarCena para a mesma cena não mexe no combate', () => {
        montar(baseState({ cenario: { ativa: 'default', combates: ativo(2), lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 1 } }));
        act(() => { probe.ativarCena('default'); });
        expect(cenarioSalvo().combates.default.ativo).toBe(true);
    });
});

describe('ações de Mestre exigem isMestre', () => {
    it('encerrarCombate e ativarCena não fazem nada para jogador', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar(baseState({ isMestre: false, cenario: { ativa: 'default', combates: ativo(2), lista: { default: { nome: 'Cena' }, outra: { nome: 'O' } }, turnoAtualIndex: 1 } }));
        act(() => { probe.encerrarCombate(); probe.ativarCena('outra'); });
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(feeds()).toHaveLength(0);
        vi.restoreAllMocks();
    });
});

describe('lados / equipes no contexto', () => {
    it('expõe equipes e relações padrão', () => {
        montar(baseState());
        expect(probe.equipes.map(e => e.id)).toEqual(['aliados', 'inimigos', 'neutros']);
        expect(probe.relacoes).toEqual({});
    });
    it('definirEquipeDe: eu = updateFicha + debounce; outro jogador = salvarCamposPersonagem; dummie = salvarDummie', () => {
        const state = baseState({ personagens: { Aliado: ficha() } });
        montar(state);
        act(() => { probe.definirEquipeDe({ id: 'Heroi', nome: 'Heroi', isDummie: false }, 'neutros'); });
        expect(state.minhaFicha.combate.equipe).toBe('neutros');
        expect(firebaseSync.salvarFichaSilencioso).toHaveBeenCalled();
        act(() => { probe.definirEquipeDe({ id: 'Aliado', nome: 'Aliado', isDummie: false }, 'inimigos'); });
        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenCalledWith('Aliado', { 'combate/equipe': 'inimigos' });
        act(() => { probe.definirEquipeDe({ id: 'filler', nome: 'Filler', isDummie: true }, 'aliados'); });
        expect(firebaseSync.salvarDummie).toHaveBeenCalledWith('filler', expect.objectContaining({ nome: 'Filler', equipe: 'aliados' }));
        expect(feeds()).toContain('🔀 Aliado mudou de lado: Aliados → Inimigos');
    });
    it('lado oculto: a mudança NÃO é anunciada no Feed', () => {
        const state = baseState({ personagens: { Misterioso: ficha({}, { ladoOculto: true }) } });
        montar(state);
        act(() => { probe.definirEquipeDe({ id: 'Misterioso', nome: 'Misterioso', isDummie: false }, 'inimigos'); });
        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenCalledWith('Misterioso', { 'combate/equipe': 'inimigos' });
        expect(feeds().some(t => t.includes('mudou de lado'))).toBe(false);
    });
    it('equipe inexistente ou igual à atual: nada é gravado', () => {
        const state = baseState({ personagens: { Aliado: ficha() } });
        montar(state);
        let r1; let r2;
        act(() => { r1 = probe.definirEquipeDe({ id: 'Aliado', nome: 'Aliado', isDummie: false }, 'nao-existe'); });
        act(() => { r2 = probe.definirEquipeDe({ id: 'Aliado', nome: 'Aliado', isDummie: false }, 'aliados'); });
        expect(r1).toBe(false); expect(r2).toBe(false);
        expect(firebaseSync.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('alternarLadoOculto: oculta sem anunciar; revelar anuncia a equipe real; caminhos combate/ladoOculto', () => {
        const state = baseState({ personagens: { Misterioso: ficha({}, { equipe: 'inimigos' }) } });
        montar(state);
        let r;
        act(() => { r = probe.alternarLadoOculto({ id: 'Misterioso', nome: 'Misterioso', isDummie: false }); });
        expect(r).toBe(true);
        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenLastCalledWith('Misterioso', { 'combate/ladoOculto': true });
        expect(feeds().some(t => t.includes('revelado'))).toBe(false);
        state.personagens.Misterioso.combate.ladoOculto = true;
        act(() => { r = probe.alternarLadoOculto({ id: 'Misterioso', nome: 'Misterioso', isDummie: false }); });
        expect(r).toBe(false);
        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenLastCalledWith('Misterioso', { 'combate/ladoOculto': false });
        expect(feeds()).toContain('👁️ O lado de Misterioso foi revelado: 👹 Inimigos');
    });
    it('alternarLadoOculto em dummie grava ladoOculto no dummie', () => {
        montar(baseState());
        act(() => { probe.alternarLadoOculto({ id: 'filler', nome: 'Filler', isDummie: true }); });
        expect(firebaseSync.salvarDummie).toHaveBeenCalledWith('filler', expect.objectContaining({ ladoOculto: true }));
    });
    it('jogador (não Mestre) não altera lados, equipes nem relações', () => {
        const state = baseState({ isMestre: false, personagens: { Aliado: ficha() } });
        montar(state);
        act(() => {
            expect(probe.definirEquipeDe({ id: 'Aliado', nome: 'Aliado', isDummie: false }, 'inimigos')).toBe(false);
            expect(probe.alternarLadoOculto({ id: 'Aliado', nome: 'Aliado', isDummie: false })).toBeNull();
            expect(probe.salvarEquipes([{ nome: 'X' }])).toBeNull();
            expect(probe.salvarRelacoes({ 'a|b': 'hostil' })).toBeNull();
        });
        expect(firebaseSync.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('salvarEquipes sanea, poda relações órfãs e grava no cenário; lista vazia volta ao padrão', () => {
        montar(baseState({ cenario: { ativa: 'default', lista: { default: { nome: 'Cena' } }, relacoes: { 'a|b': 'hostil', 'a|zz': 'hostil' } } }));
        let salvo;
        act(() => { salvo = probe.salvarEquipes([{ id: 'a', nome: 'Time A' }, { id: 'b', nome: 'Time B', cor: 'xx' }, { nome: '' }]); });
        expect(salvo.map(e => e.id)).toEqual(['a', 'b']);
        expect(cenarioSalvo().equipes).toHaveLength(2);
        expect(cenarioSalvo().relacoes).toEqual({ 'a|b': 'hostil' });
        act(() => { probe.salvarEquipes([]); });
        expect(cenarioSalvo().equipes).toBeUndefined();
        expect(cenarioSalvo().relacoes).toBeUndefined();
    });
    it('salvarRelacoes só aceita pares de equipes existentes', () => {
        montar(baseState());
        let r;
        act(() => { r = probe.salvarRelacoes({ 'inimigos|neutros': 'hostil', 'x|y': 'hostil', 'aliados|neutros': 'amigos' }); });
        expect(r).toEqual({ 'inimigos|neutros': 'hostil' });
        expect(cenarioSalvo().relacoes).toEqual({ 'inimigos|neutros': 'hostil' });
    });
});
