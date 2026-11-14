import React from 'react';
import { render, cleanup, act, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm, aplicarInicioDeTurno } from './MapaFormContext';
import { montarContextoAdaptacao } from '../../core/adaptacaoTurno';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { calcularZenkai, novaTelemetriaZenkai } from '../../core/zenkai';

// Zenkai no encerramento do combate: pendencia por personagem com valor sugerido, detalhamento e campo editavel; Liberar aplica o valor
// (editado ou nao), Recusar descarta; opcao desligada aplica o sugerido; Descansar nao aplica nem zera com combate ativo.
// Usa o servico de gatilhos REAL (dispararEventoEmPersonagem) sobre o store simulado.

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

const TELE = { ...novaTelemetriaZenkai(), vidaMax: 100000, danoRecebido: 50000, turnos: 10, fadigaPico: 60, razaoSoma: 10, razaoTurnos: 10 };
const ficha = (overrides = {}, combate = {}) => ({
    iniciativa: 0,
    posicao: { x: 0, y: 0, z: 0 },
    acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
    vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
    poderes: [], inventario: [], passivas: [],
    combate: { fadigaTurnos: 0, fadigaPorTurno: 5, ...combate },
    ...overrides,
});
const comZenkai = (extra = {}) => ({ zenkaiLigado: true, zenkai: { ...TELE }, ganhosAntesDoCombate: { poderCalculado: 0, fatorPoder: 1 }, ...extra });
const ativo = () => ({ default: { ativo: true, rodada: 2, iniciadoEm: 1 } });
const SUGERIDO = calcularZenkai({ vida: { atual: 1 }, combate: { zenkaiLigado: true, zenkai: TELE } }).pct; // 3,25

function baseState(overrides = {}) {
    const minhaFicha = ficha({ iniciativa: 10 }, comZenkai());
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
const camposSalvos = (nome) => firebaseSync.salvarCamposPersonagem.mock.calls.filter(([n]) => n === nome).map(([, c]) => c);
const botao = (nome) => screen.getByRole('button', { name: nome });
const feed = () => firebaseSync.enviarParaFeed.mock.calls.map(([m]) => m.texto);
const campoZenkai = (nome) => screen.getByLabelText(`Zenkai de ${nome} (%)`);

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('encerrarCombate com Zenkai', () => {
    it('sanity: o sugerido do cenario de teste e 3,25%', () => { expect(SUGERIDO).toBe(3.25); });

    it('o dialogo mostra o sugerido, o detalhamento por fator e um campo numerico editavel (sem encerrar ainda)', () => {
        montar(baseState());
        act(() => { probe.encerrarCombate(); });
        const item = screen.getByTestId('aprovacao-item-Heroi');
        expect(item.textContent).toMatch(/Zenkai sugerido: \+3,25%/);
        expect(item.textContent).toMatch(/Dano recebido/);
        expect(item.textContent).toMatch(/Fadiga acumulada/);
        expect(item.textContent).toMatch(/Oponente: fator ×1/);
        const campo = campoZenkai('Heroi');
        expect(campo.type).toBe('number');
        expect(campo.value).toBe('3.25');
        expect(campo.min).toBe('0'); expect(campo.max).toBe('100'); expect(campo.step).toBe('0.01');
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('Liberar sem editar aplica o sugerido, zera a telemetria e avisa no feed', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.0325, 9);
        expect(state.minhaFicha.combate.zenkai).toBeUndefined();
        expect(state.minhaFicha.combate.ganhosAntesDoCombate).toBeUndefined();
        expect(feed().some(t => t.startsWith('🔥 Heroi: Zenkai +3,25%'))).toBe(true);
    });

    it('Liberar com valor EDITADO aplica o editado (soma com o resto)', () => {
        const state = baseState();
        state.minhaFicha.ganhosPermanentes = { poderCalculado: 0.1 };
        montar(state);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.change(campoZenkai('Heroi'), { target: { value: '1.5' } }); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.115, 9);
        expect(feed().some(t => t.startsWith('🔥 Heroi: Zenkai +1,5%'))).toBe(true);
    });

    it('valor acima de 100 e preso a 100; campo vazio volta ao sugerido; 0 nao aplica', () => {
        const a = baseState();
        montar(a);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.change(campoZenkai('Heroi'), { target: { value: '500' } }); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(a.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(1, 9);
        cleanup(); vi.clearAllMocks();
        const b = baseState();
        montar(b);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.change(campoZenkai('Heroi'), { target: { value: '' } }); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(b.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.0325, 9);
        cleanup(); vi.clearAllMocks();
        const c = baseState();
        montar(c);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.change(campoZenkai('Heroi'), { target: { value: '0' } }); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(c.minhaFicha.ganhosPermanentes?.poderCalculado || 0).toBe(0);
        expect(c.minhaFicha.combate.zenkai).toBeUndefined();
    });

    it('Recusar descarta o Zenkai (mesmo com valor editado) e zera a telemetria', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.change(campoZenkai('Heroi'), { target: { value: '4' } }); });
        act(() => { fireEvent.click(screen.getByTestId('aprovacao-item-Heroi').querySelector('input[value="recusar"]')); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(state.minhaFicha.ganhosPermanentes?.poderCalculado || 0).toBe(0);
        expect(state.minhaFicha.combate.zenkai).toBeUndefined();
        expect(feed().some(t => t.includes('Zenkai recusado'))).toBe(true);
    });

    it('Liberar todos / Recusar todos valem para o Zenkai de cada personagem; o outro jogador grava os caminhos (null apaga)', () => {
        const vilao = ficha({ iniciativa: 5, isNPC: true, posicao: { x: 1, y: 1, z: 0 } }, comZenkai());
        const state = baseState({ personagens: { Vilao: vilao } });
        montar(state);
        act(() => { probe.encerrarCombate(); });
        expect(screen.getByTestId('aprovacao-zenkai-Vilao')).toBeTruthy();
        act(() => { fireEvent.click(botao('Recusar todos')); });
        act(() => { fireEvent.click(botao('Liberar todos')); });
        act(() => { fireEvent.change(campoZenkai('Vilao'), { target: { value: '2' } }); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.0325, 9);
        const c = camposSalvos('Vilao')[0];
        expect(c['ganhosPermanentes/poderCalculado']).toBeCloseTo(0.02, 9);
        expect(c['combate/zenkai']).toBeNull();
        Object.values(c).forEach(v => expect(v).not.toBeUndefined());
    });

    it('Recusar todos: ninguem ganha Zenkai', () => {
        const vilao = ficha({ iniciativa: 5, isNPC: true, posicao: { x: 1, y: 1, z: 0 } }, comZenkai());
        const state = baseState({ personagens: { Vilao: vilao } });
        montar(state);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.click(botao('Recusar todos')); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(state.minhaFicha.ganhosPermanentes?.poderCalculado || 0).toBe(0);
        const c = camposSalvos('Vilao')[0];
        expect(c['combate/zenkai']).toBeNull();
        expect(c['ganhosPermanentes/poderCalculado']).toBeUndefined();
    });

    it('Cancelar nao encerra, nao aplica e mantem a telemetria', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.encerrarCombate(); });
        act(() => { fireEvent.click(botao('Cancelar')); });
        expect(state.minhaFicha.combate.zenkai).toBeDefined();
        expect(state.minhaFicha.ganhosPermanentes).toBeUndefined();
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('Zenkai desligado ou sem turnos: nada a aprovar (encerra direto)', () => {
        const a = baseState();
        a.minhaFicha.combate.zenkaiLigado = false;
        montar(a);
        act(() => { probe.encerrarCombate(); });
        expect(screen.queryByRole('dialog')).toBeNull();
        cleanup(); vi.clearAllMocks();
        const b = baseState();
        b.minhaFicha.combate.zenkai = { ...novaTelemetriaZenkai() };
        montar(b);
        act(() => { probe.encerrarCombate(); });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opcao de aprovacao DESLIGADA: sem dialogo, aplica o sugerido automaticamente (sem ajuste)', () => {
        const state = baseState();
        state.cenario.aprovarGanhosPermanentes = false;
        montar(state);
        act(() => { probe.encerrarCombate(); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.0325, 9);
        expect(state.minhaFicha.combate.zenkai).toBeUndefined();
    });

    it('trocar a cena ativa tambem passa pela aprovacao do Zenkai', () => {
        const state = baseState();
        state.minhaFicha.posicoes = { default: { cenaId: 'default' } };
        montar(state);
        act(() => { probe.ativarCena('outra'); });
        expect(screen.getByTestId('aprovacao-zenkai-Heroi')).toBeTruthy();
        act(() => { fireEvent.change(campoZenkai('Heroi'), { target: { value: '1' } }); });
        act(() => { fireEvent.click(botao('Confirmar e encerrar')); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.01, 9);
    });
});

describe('Descansar com Zenkai', () => {
    it('combate ATIVO: nao aplica nem zera', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.descansar(); });
        expect(state.minhaFicha.ganhosPermanentes?.poderCalculado || 0).toBe(0);
        expect(state.minhaFicha.combate.zenkai).toBeDefined();
        expect(state.minhaFicha.combate.zenkai.turnos).toBe(10);
    });
    it('SEM combate ativo: zera sem aplicar', () => {
        const state = baseState();
        delete state.cenario.combates;
        montar(state);
        act(() => { probe.descansar(); });
        expect(state.minhaFicha.ganhosPermanentes?.poderCalculado || 0).toBe(0);
        expect(state.minhaFicha.combate.zenkai).toBeUndefined();
    });
    it('opcao desligada: aplica o sugerido (comportamento legado do fimDeLuta)', () => {
        const state = baseState();
        state.cenario.aprovarGanhosPermanentes = false;
        montar(state);
        act(() => { probe.descansar(); });
        expect(state.minhaFicha.ganhosPermanentes.poderCalculado).toBeCloseTo(0.0325, 9);
    });
});

describe('iniciarCombate zera a telemetria do Zenkai', () => {
    it('minha ficha e a dos outros com Zenkai ligado (so eles); dummies e quem nao tem Zenkai ficam de fora', () => {
        const state = baseState({
            cenario: { ativa: 'default', lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 0 },
            dummies: { d1: { nome: 'Boneco', iniciativa: 3, posicao: { x: 5, y: 5, z: 0 } } },
            personagens: {
                Vilao: ficha({ iniciativa: 5, isNPC: true, posicao: { x: 1, y: 1, z: 0 } }, comZenkai()),
                Capanga: ficha({ iniciativa: 4, isNPC: true, posicao: { x: 2, y: 2, z: 0 } }, {}),
            },
        });
        montar(state);
        act(() => { probe.iniciarCombate(); });
        expect(state.minhaFicha.combate.zenkai.turnos).toBeLessThanOrEqual(1); // zerada e, no maximo, o 1o turno do primeiro da ordem
        expect(state.minhaFicha.combate.zenkai.danoRecebido).toBe(0);
        const v = camposSalvos('Vilao').find(c => c['combate/zenkai']);
        expect(v['combate/zenkai']).toMatchObject({ ativo: true, danoRecebido: 0, turnos: 0 });
        expect(camposSalvos('Capanga').some(c => 'combate/zenkai' in c)).toBe(false);
    });
});

describe('avancarTurno registra o turno do Zenkai', () => {
    it('o portador que comeca o turno conta 1 turno (so com Zenkai ligado)', () => {
        const state = baseState({ cenario: { ativa: 'default', combates: ativo(), lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 0 } });
        state.minhaFicha.combate.zenkai = { ...novaTelemetriaZenkai() };
        state.minhaFicha.posicao = { x: 0, y: 0, z: 0, cenaId: 'default' };
        montar(state);
        act(() => { probe.avancarTurno(); });
        // a ordem so tem o proprio personagem: ele recebe o turno
        expect(state.minhaFicha.combate.zenkai.turnos).toBe(1);
    });
});

describe('aplicarInicioDeTurno + Zenkai (passos do turno)', () => {
    const fichaTurno = () => ficha({}, { zenkaiLigado: true, zenkai: { ...novaTelemetriaZenkai(), vidaMax: 100000, energiaBuffer: 0.3 }, fadigaExtra: 40 });
    it('fecha o gasto do turno anterior, conta o turno e mede o oponente (so com contexto = combate ativo)', () => {
        const f = fichaTurno();
        aplicarInicioDeTurno(f, false, 'Heroi', { oponente: { nome: 'Vilao', poder: 1e12 }, divisorPoderMesa: 1 });
        expect(f.combate.zenkai.energiaBuffer).toBe(0);
        expect(f.combate.zenkai.energiaContada).toBeCloseTo(0.3, 9);
        expect(f.combate.zenkai.turnos).toBe(1);
        expect(f.combate.zenkai.fadigaPico).toBeGreaterThanOrEqual(40);
        expect(f.combate.zenkai.razaoTurnos).toBe(1);
        expect(f.combate.zenkai.razaoSoma).toBeGreaterThan(0);
        expect(f.combate.zenkai.razaoSoma).toBeLessThanOrEqual(2);
    });
    it('sem oponente hostil: conta o turno mas nao registra razao', () => {
        const f = fichaTurno();
        aplicarInicioDeTurno(f, false, 'Heroi', { oponente: null, divisorPoderMesa: 1 });
        expect(f.combate.zenkai.turnos).toBe(1);
        expect(f.combate.zenkai.razaoTurnos).toBe(0);
    });
    it('sem contexto (sem combate ativo) e dummies: telemetria intacta', () => {
        const a = fichaTurno(); const antes = JSON.stringify(a.combate.zenkai);
        aplicarInicioDeTurno(a, false, 'Heroi', null);
        expect(JSON.stringify(a.combate.zenkai)).toBe(antes);
        const b = fichaTurno();
        aplicarInicioDeTurno(b, true, 'Boneco', { oponente: null });
        expect(JSON.stringify(b.combate.zenkai)).toBe(antes);
    });
    it('zenkaiReiniciar (1o turno do combate) abre a telemetria do zero', () => {
        const f = fichaTurno(); f.combate.zenkai.danoRecebido = 999;
        aplicarInicioDeTurno(f, false, 'Heroi', { oponente: null, zenkaiReiniciar: true });
        expect(f.combate.zenkai.danoRecebido).toBe(0);
        expect(f.combate.zenkai.turnos).toBe(1);
    });
    it('quem entrou depois (sem telemetria) ganha uma ao comecar o turno', () => {
        const f = ficha({}, { zenkaiLigado: true });
        aplicarInicioDeTurno(f, false, 'Heroi', { oponente: null });
        expect(f.combate.zenkai.turnos).toBe(1);
    });
    it('Zenkai desligado: nenhuma chave nova', () => {
        const f = ficha({}, {});
        aplicarInicioDeTurno(f, false, 'Heroi', { oponente: null });
        expect(f.combate.zenkai).toBeUndefined();
    });
    it('montarContextoAdaptacao: o Zenkai tambem pede a medicao do oponente; sem nenhum dos dois ligados, null', () => {
        const ordem = [{ id: 'Heroi', nome: 'Heroi', ficha: {} }];
        const estado = { personagens: {}, dummies: {}, meuNome: 'Heroi', cenario: {} };
        expect(montarContextoAdaptacao(ficha({}, {}), 'Heroi', ordem, estado)).toBeNull();
        const c = montarContextoAdaptacao(ficha({}, { zenkaiLigado: true }), 'Heroi', ordem, estado);
        expect(c).not.toBeNull();
        expect(c.oponente).toBeNull();
        expect(c.zenkaiReiniciar).toBeUndefined();
        expect(montarContextoAdaptacao(ficha({}, { zenkaiLigado: true }), 'Heroi', ordem, { ...estado, inicioDeCombate: true }).zenkaiReiniciar).toBe(true);
        // com cenaIdCombate e sem combate ativo: null
        expect(montarContextoAdaptacao(ficha({}, { zenkaiLigado: true }), 'Heroi', ordem, { ...estado, cenaIdCombate: 'default' })).toBeNull();
    });
});
