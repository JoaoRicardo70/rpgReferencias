import React from 'react';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaHologramaAcao } from './MapaCombate';
import { MapaControlesSuperiores } from './MapaGrelha';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarCamposPersonagem } from '../../services/firebase-sync';

// QA - removerTokenDoMapa / estouNoMapa (MapaFormContext), botoes da moldura e da barra superior, e CSS do token.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));
vi.mock('../../App', async () => {
    const { createContext } = await import('react');
    return { VoiceContext: createContext(null) };
});
vi.mock('./Tabuleiro3D', () => ({ default: () => null }));
vi.mock('./MapaMundi', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./MapaVoz', () => ({ MapaSessaoRP: () => null }));
vi.mock('../combat/DummieToken', () => ({ default: () => null }));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

const fichaBase = (extra = {}) => ({
    iniciativa: 0, posicoes: { default: { x: 2, y: 2, z: 0, cenaId: 'default' } },
    posicao: { x: 2, y: 2, z: 0, cenaId: 'default' },
    vida: { atual: 100 }, combate: {}, dominios: {}, poderes: [], inventario: [], passivas: [],
    ...extra,
});

function baseState(overrides = {}) {
    const minhaFicha = overrides.minhaFicha === undefined ? fichaBase() : overrides.minhaFicha;
    const resultado = { ficha: null };
    return {
        minhaFicha, meuNome: 'Heroi', personagens: {}, divisorPoderMesa: 1,
        // Imita o Immer: o callback muta uma copia (a ficha antiga da closure do componente continua intacta).
        resultado,
        updateFicha: vi.fn(function (cb) { const c = structuredClone(minhaFicha); cb(c); resultado.ficha = c; }),
        feedCombate: [], isMestre: false, mesaCriador: 'Mestre', dummies: {},
        alvoSelecionado: null, abaAtiva: 'mapa', entidadeInspecionada: null,
        setEntidadeInspecionada: vi.fn(),
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 }, outra: { nome: 'B', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...overrides,
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    mockUseStore(state);
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}

beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('removerTokenDoMapa - logica', () => {
    it('jogador remove o proprio token: confirma, apaga posicoes[cena] e posicao legada, salva campos', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.removerTokenDoMapa('Heroi'); });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(state.resultado.ficha.posicoes.default).toBeUndefined();
        expect(state.resultado.ficha.posicao).toBeUndefined();
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Heroi', { 'posicoes/default': null, posicao: null });
    });

    it('posicao legada de OUTRA cena nao e apagada nem enviada', () => {
        const minhaFicha = fichaBase({ posicao: { x: 1, y: 1, cenaId: 'outra' } });
        const state = baseState({ minhaFicha });
        montar(state);
        act(() => { probe.removerTokenDoMapa('Heroi'); });
        expect(state.resultado.ficha.posicoes.default).toBeUndefined();
        expect(state.resultado.ficha.posicao).toMatchObject({ cenaId: 'outra' });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Heroi', { 'posicoes/default': null });
    });

    it('posicoes de outras cenas permanecem', () => {
        const minhaFicha = fichaBase({ posicoes: { default: { x: 1, y: 1 }, outra: { x: 3, y: 3 } } });
        const state = baseState({ minhaFicha });
        montar(state);
        act(() => { probe.removerTokenDoMapa('Heroi'); });
        expect(state.resultado.ficha.posicoes.outra).toEqual({ x: 3, y: 3 });
    });

    it('ficha sem posicoes (so legada sem cenaId = default) tambem funciona sem lancar', () => {
        const minhaFicha = fichaBase({ posicoes: undefined, posicao: { x: 1, y: 1 } });
        const state = baseState({ minhaFicha });
        montar(state);
        expect(probe.estouNoMapa).toBe(true);
        expect(() => act(() => { probe.removerTokenDoMapa('Heroi'); })).not.toThrow();
        expect(state.resultado.ficha.posicao).toBeUndefined();
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Heroi', { 'posicoes/default': null, posicao: null });
    });

    it('confirm recusado: nada acontece', () => {
        window.confirm = vi.fn(() => false);
        const state = baseState();
        montar(state);
        act(() => { probe.removerTokenDoMapa('Heroi'); });
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(state.minhaFicha.posicoes.default).toBeDefined();
    });

    it('nao-Mestre tentando remover outro nome: no-op, sem confirm', () => {
        const state = baseState({ personagens: { Ana: fichaBase() } });
        montar(state);
        act(() => { probe.removerTokenDoMapa('Ana'); });
        expect(window.confirm).not.toHaveBeenCalled();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(state.updateFicha).not.toHaveBeenCalled();
    });

    it('nome vazio/undefined e no-op', () => {
        const state = baseState({ isMestre: true });
        montar(state);
        act(() => { probe.removerTokenDoMapa(undefined); probe.removerTokenDoMapa(''); });
        expect(window.confirm).not.toHaveBeenCalled();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    it('Mestre remove outro jogador: nao mexe na propria ficha, salva campos do outro (inclui posicao legada da cena)', () => {
        const state = baseState({ isMestre: true, mesaCriador: 'Heroi', personagens: { Ana: fichaBase() } });
        montar(state);
        act(() => { probe.removerTokenDoMapa('Ana'); });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toContain('Ana');
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(state.minhaFicha.posicoes.default).toBeDefined();
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { 'posicoes/default': null, posicao: null });
    });

    it('Mestre remove outro sem posicao legada: so posicoes/<cena>', () => {
        const state = baseState({ isMestre: true, mesaCriador: 'Heroi', personagens: { Ana: fichaBase({ posicao: undefined }) } });
        montar(state);
        act(() => { probe.removerTokenDoMapa('Ana'); });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { 'posicoes/default': null });
    });

    it('Mestre removendo o proprio token tambem usa updateFicha', () => {
        const state = baseState({ isMestre: true, mesaCriador: 'Heroi' });
        montar(state);
        act(() => { probe.removerTokenDoMapa('Heroi'); });
        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Heroi', expect.objectContaining({ 'posicoes/default': null }));
    });

    it('limpa a inspecao se o removido era o inspecionado; mantem se era outro', () => {
        const state = baseState({ entidadeInspecionada: { tipo: 'jogador', id: 'Heroi' } });
        montar(state);
        act(() => { probe.removerTokenDoMapa('Heroi'); });
        expect(state.setEntidadeInspecionada).toHaveBeenCalledWith(null);
        cleanup();
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        const s2 = baseState({ isMestre: true, mesaCriador: 'Heroi', personagens: { Ana: fichaBase() }, entidadeInspecionada: { tipo: 'jogador', id: 'Heroi' } });
        montar(s2);
        act(() => { probe.removerTokenDoMapa('Ana'); });
        expect(s2.setEntidadeInspecionada).not.toHaveBeenCalled();
    });

    it('limpa movimentoPendente', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.pedirMovimento(5, 6); });
        expect(probe.movimentoPendente).not.toBeNull();
        act(() => { probe.removerTokenDoMapa('Heroi'); });
        expect(probe.movimentoPendente).toBeNull();
    });
});

describe('estouNoMapa', () => {
    it('true com posicoes[cena]', () => {
        montar(baseState());
        expect(probe.estouNoMapa).toBe(true);
    });
    it('false sem posicoes nem posicao', () => {
        montar(baseState({ minhaFicha: fichaBase({ posicoes: undefined, posicao: undefined }) }));
        expect(probe.estouNoMapa).toBe(false);
    });
    it('false quando so ha posicao em outra cena', () => {
        montar(baseState({ minhaFicha: fichaBase({ posicoes: { outra: { x: 1, y: 1 } }, posicao: { x: 1, y: 1, cenaId: 'outra' } }) }));
        expect(probe.estouNoMapa).toBe(false);
    });
    it('false em ficha nula', () => {
        montar(baseState({ minhaFicha: null }));
        expect(probe.estouNoMapa).toBe(false);
    });
});

describe('Moldura - botao Sair/Remover do Mapa', () => {
    function moldura(state) {
        mockUseStore(state);
        return render(<MapaFormProvider><MapaHologramaAcao /></MapaFormProvider>);
    }
    const btn = (c) => c.querySelector('.moldura-remover-token');

    it('jogador inspecionando a si mesmo: "Sair do Mapa" e clique remove', () => {
        const state = baseState({ entidadeInspecionada: { tipo: 'jogador', id: 'Heroi' } });
        const { container } = moldura(state);
        expect(btn(container).textContent).toContain('🚪 Sair do Mapa');
        fireEvent.click(btn(container));
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Heroi', expect.any(Object));
    });
    it('Mestre inspecionando outro: "Remover do Mapa" e clique remove o outro', () => {
        const state = baseState({ isMestre: true, mesaCriador: 'Heroi', personagens: { Ana: fichaBase() }, entidadeInspecionada: { tipo: 'jogador', id: 'Ana' } });
        const { container } = moldura(state);
        expect(btn(container).textContent).toContain('🗑️ Remover do Mapa');
        fireEvent.click(btn(container));
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', expect.any(Object));
    });
    it('nao-Mestre inspecionando outro: sem botao', () => {
        const { container } = moldura(baseState({ personagens: { Ana: fichaBase() }, entidadeInspecionada: { tipo: 'jogador', id: 'Ana' } }));
        expect(btn(container)).toBeNull();
    });
    it('dummie (mesmo para Mestre): sem botao', () => {
        const dummies = { d1: { nome: 'Slime', hpAtual: 5, hpMax: 10, cenaId: 'default', visibilidadeHp: 'todos' } };
        const { container } = moldura(baseState({ isMestre: true, mesaCriador: 'Heroi', dummies, entidadeInspecionada: { tipo: 'dummie', id: 'd1' } }));
        expect(container.textContent).toContain('Slime');
        expect(btn(container)).toBeNull();
    });
    it('sem inspecao: sem botao', () => {
        const { container } = moldura(baseState());
        expect(btn(container)).toBeNull();
    });
});

describe('MapaControlesSuperiores - Sair do Mapa / dica', () => {
    function barra(state) {
        mockUseStore(state);
        return render(<MapaFormProvider><MapaControlesSuperiores /></MapaFormProvider>);
    }
    it('no mapa: botao "Sair do Mapa" e sem dica; clique remove', () => {
        const state = baseState();
        const { container } = barra(state);
        expect(screen.getByText('🚪 Sair do Mapa')).toBeTruthy();
        expect(container.querySelector('.mapa-entrar-dica')).toBeNull();
        fireEvent.click(screen.getByText('🚪 Sair do Mapa'));
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Heroi', expect.any(Object));
    });
    it('fora do mapa: mostra a dica "Clique numa casa" e nao o botao', () => {
        const { container } = barra(baseState({ minhaFicha: fichaBase({ posicoes: undefined, posicao: undefined }) }));
        expect(container.querySelector('.mapa-entrar-dica').textContent).toContain('📍 Clique numa casa');
        expect(screen.queryByText('🚪 Sair do Mapa')).toBeNull();
    });
});

describe('CSS - .player-token clicavel', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../css/styles.css'), 'utf8');
    const regras = [...css.matchAll(/(^|\})\s*([^{}]*)\{([^}]*)\}/g)]
        .filter(m => m[2].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(s => s.trim()).includes('.player-token'));
    it('existe regra .player-token', () => { expect(regras.length).toBeGreaterThan(0); });
    it('nenhuma regra .player-token usa pointer-events:none', () => {
        for (const r of regras) expect(r[3]).not.toMatch(/pointer-events\s*:\s*none/);
    });
});
