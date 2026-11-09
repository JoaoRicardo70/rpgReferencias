import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed, salvarCamposPersonagem, aplicarDanoDireto, salvarFichaSilencioso } from '../../services/firebase-sync';

// QA: o Dano Rapido do Mestre conta como GOLPE (nivel normal) e dispara o evento `atingido` dos gatilhos de quem sofre:
// no proprio Mestre (updateFicha/Immer), em OUTRO jogador (services/danoAlvo) e nunca em Dummie.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')), salvarCenarioCompleto: vi.fn(() => Promise.resolve()),
    zerarIniciativaGlobal: vi.fn(), aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

const F = 1000;
const PC = 'ganhosPermanentes/poderCalculado';
let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

const gAting = (acoes, evento = { tipo: 'atingido' }) => ({ nome: 'Ating', evento, acoes });
const fichaCom = (gatilhos, extra = {}) => ({
    iniciativa: 0, posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
    vida: { base: 500000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: 500000, regeneracao: 0 },
    divisores: {}, combate: {}, dominios: {},
    poderes: gatilhos ? [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos }] : [], inventario: [], passivas: [], contadores: [], ...extra,
});

function estado(minhaFicha, personagens = {}, extra = {}) {
    return {
        minhaFicha, meuNome: 'Mestre', personagens, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre: true, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...extra,
    };
}
let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) { mockUseStore(state); return render(<MapaFormProvider><Harness /></MapaFormProvider>); }
const jogador = (nome, ficha) => ({ id: nome, nome, ficha, isDummie: false });
const camposGravados = () => Object.assign({}, ...salvarCamposPersonagem.mock.calls.map(c => c[1]));
const feedTexto = () => enviarParaFeed.mock.calls.map(c => c[0].texto).join(' | ');

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); });
afterEach(() => cleanup());

describe('Dano Rapido como golpe - meu personagem (Mestre)', () => {
    it('atingido com ganhoPermanente soma no meu poderCalculado e a Vida cai', () => {
        const eu = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 4 }])]);
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 100); });
        expect(eu.ganhosPermanentes.poderCalculado).toBe(4);
        expect(eu.vida.atual).toBe(500000 - 100 * F);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(feedTexto()).toContain('aplicou 100 de dano');
    });
    it('dois Danos Rapidos somam duas vezes', () => {
        const eu = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 4 }])]);
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 10); });
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 10); });
        expect(eu.ganhosPermanentes.poderCalculado).toBe(8);
    });
    it('gatilho danoEmSi NAO dispara atingido', () => {
        const eu = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 4 }], { tipo: 'danoEmSi' })]);
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 100); });
        expect(eu.ganhosPermanentes).toBeUndefined();
        expect(eu.vida.atual).toBe(500000 - 100 * F);
    });
    it('atingido exclusivo de critico nao dispara (golpe do Dano Rapido e normal)', () => {
        const eu = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 4 }], { tipo: 'atingido', nivel: 'critico' })]);
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 100); });
        expect(eu.ganhosPermanentes).toBeUndefined();
    });
    it('escudo absorvendo tudo nao dispara', () => {
        const eu = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 4 }])], { escudos: [{ id: 'e', nome: 'B', valor: 1e6, tipo: 'escudo' }] });
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 100); });
        expect(eu.ganhosPermanentes).toBeUndefined();
        expect(eu.vida.atual).toBe(500000);
    });
    it('imunidade total nao dispara', () => {
        const eu = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 4 }])], { combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } });
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 100); });
        expect(eu.ganhosPermanentes).toBeUndefined();
        expect(eu.vida.atual).toBe(500000);
    });
    it('dano 0 e ignorado (nada muda)', () => {
        const eu = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 4 }])]);
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 0); });
        expect(eu.ganhosPermanentes).toBeUndefined();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('gatilho atingido opcional com perguntar: recusar na pergunta nao dispara', () => {
        window.confirm = vi.fn(() => false);
        const g = { ...gAting([{ tipo: 'ganhoPermanente', valor: 4 }]), modo: 'opcional', perguntar: true, armado: true };
        const eu = fichaCom([g]);
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 100); });
        expect(eu.ganhosPermanentes).toBeUndefined();
    });
});

describe('Dano Rapido como golpe - outro jogador', () => {
    it('atingido com ganhoPermanente grava poderCalculado no jogador (e a vida), sem tocar a minha ficha', () => {
        const eu = fichaCom(null);
        const vilao = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 6 }])]);
        montar(estado(eu, { Vilao: vilao }));
        act(() => { probe.aplicarDanoRapido(jogador('Vilao', vilao), 100); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 500000 - 100 * F);
        expect(camposGravados()[PC]).toBe(6);
        expect(eu.ganhosPermanentes).toBeUndefined();
        expect(salvarCamposPersonagem.mock.calls.every(c => c[0] === 'Vilao')).toBe(true);
        expect(feedTexto()).toContain('🔔');
    });
    it('gatilho danoEmSi NAO dispara atingido no jogador', () => {
        const vilao = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 6 }], { tipo: 'danoEmSi' })]);
        montar(estado(fichaCom(null), { Vilao: vilao }));
        act(() => { probe.aplicarDanoRapido(jogador('Vilao', vilao), 100); });
        expect(camposGravados()[PC]).toBeUndefined();
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 500000 - 100 * F);
    });
    it('jogador com escudo absorvendo tudo: sem disparo', () => {
        const vilao = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 6 }])], { escudos: [{ id: 'e', nome: 'B', valor: 1e6, tipo: 'escudo' }] });
        montar(estado(fichaCom(null), { Vilao: vilao }));
        act(() => { probe.aplicarDanoRapido(jogador('Vilao', vilao), 100); });
        expect(camposGravados()[PC]).toBeUndefined();
    });
    it('jogador com Imunidade total: sem disparo', () => {
        const vilao = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 6 }])], { combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } });
        montar(estado(fichaCom(null), { Vilao: vilao }));
        act(() => { probe.aplicarDanoRapido(jogador('Vilao', vilao), 100); });
        expect(camposGravados()[PC]).toBeUndefined();
    });
    it('jogador sem gatilhos: so o fluxo de sempre', () => {
        const vilao = fichaCom(null);
        montar(estado(fichaCom(null), { Vilao: vilao }));
        act(() => { probe.aplicarDanoRapido(jogador('Vilao', vilao), 100); });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 500000 - 100 * F);
    });
});

describe('Dano Rapido - Dummie continua sem gatilhos', () => {
    it('Dummie so tem hpAtual reduzido; nenhuma gravacao de campos de personagem', () => {
        const eu = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 4 }])]);
        const dData = { nome: 'Boneco', cenaId: 'default', hpMax: 1000 * F, hpAtual: 1000 * F };
        montar(estado(eu, {}, { dummies: { d1: dData } }));
        act(() => { probe.aplicarDanoRapido({ id: 'd1', nome: 'Boneco', ficha: dData, isDummie: true }, 100); });
        expect(salvarDummie).toHaveBeenCalledWith('d1', expect.objectContaining({ hpAtual: 900 * F }));
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
        expect(eu.ganhosPermanentes).toBeUndefined();
        expect(feedTexto()).not.toContain('🔔');
    });
});

describe('Dano Rapido - guardas', () => {
    it('nao-Mestre nao aplica nada', () => {
        const vilao = fichaCom([gAting([{ tipo: 'ganhoPermanente', valor: 6 }])]);
        montar(estado(fichaCom(null), { Vilao: vilao }, { isMestre: false }));
        act(() => { probe.aplicarDanoRapido(jogador('Vilao', vilao), 100); });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
    });
});
