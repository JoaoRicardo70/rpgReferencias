import React from 'react';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaVisao } from './MapaGrelha';
import useStore from '../../stores/useStore';
import { salvarDummie, salvarFichaSilencioso } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA - Confirmacao de movimento no Mapa: pedirMovimento / confirmarMovimento / cancelarMovimento
// (MapaFormContext.jsx) e a barra `.movimento-pendente` + celula `.map-cell--pendente` (MapaGrelha.jsx).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()),
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
vi.mock('./Tabuleiro3D', () => ({
    default: ({ moverJogador }) => <button data-testid="tab3d" onClick={() => moverJogador(7, 8)}>3D</button>,
}));
vi.mock('./MapaMundi', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./MapaVoz', () => ({ MapaSessaoRP: () => null }));
vi.mock('../combat/DummieToken', () => ({ default: () => null }));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function baseState(overrides = {}) {
    const minhaFicha = overrides.minhaFicha || {
        iniciativa: 0, posicoes: { default: { x: 2, y: 2, z: 0, cenaId: 'default' } },
        posicao: { x: 2, y: 2, z: 0, cenaId: 'default' },
        vida: { atual: 100 }, combate: {}, dominios: {}, poderes: [], inventario: [], passivas: [],
    };
    return {
        minhaFicha, meuNome: 'Heroi', personagens: {}, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre: false, mesaCriador: 'Mestre', dummies: {},
        alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
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

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('pedirMovimento / confirmarMovimento / cancelarMovimento (contexto)', () => {
    it('comeca sem destino pendente', () => {
        montar(baseState());
        expect(probe.movimentoPendente).toBeNull();
    });

    it('jogador: pedirMovimento so marca o destino e NAO move', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.pedirMovimento(5, 6); });
        expect(probe.movimentoPendente).toEqual({ x: 5, y: 6 });
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(state.minhaFicha.posicoes.default).toMatchObject({ x: 2, y: 2 });
    });

    it('confirmarMovimento move para o destino pendente e limpa o pendente', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.pedirMovimento(5, 6); });
        act(() => { probe.confirmarMovimento(); });
        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(state.minhaFicha.posicoes.default).toMatchObject({ x: 5, y: 6, cenaId: 'default' });
        expect(state.minhaFicha.posicao).toMatchObject({ x: 5, y: 6 });
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(probe.movimentoPendente).toBeNull();
    });

    it('cancelarMovimento descarta o destino sem mover', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.pedirMovimento(5, 6); });
        act(() => { probe.cancelarMovimento(); });
        expect(probe.movimentoPendente).toBeNull();
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(state.minhaFicha.posicoes.default).toMatchObject({ x: 2, y: 2 });
    });

    it('confirmarMovimento sem destino pendente nao move nada (nem lanca)', () => {
        const state = baseState();
        montar(state);
        expect(() => act(() => { probe.confirmarMovimento(); })).not.toThrow();
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(probe.movimentoPendente).toBeNull();
    });

    it('clicar na casa onde o jogador JA esta nao cria destino pendente e limpa o anterior', () => {
        montar(baseState());
        act(() => { probe.pedirMovimento(5, 6); });
        expect(probe.movimentoPendente).not.toBeNull();
        act(() => { probe.pedirMovimento(2, 2); });
        expect(probe.movimentoPendente).toBeNull();
    });

    it('pedir outro destino substitui o pendente anterior', () => {
        montar(baseState());
        act(() => { probe.pedirMovimento(5, 6); });
        act(() => { probe.pedirMovimento(9, 1); });
        expect(probe.movimentoPendente).toEqual({ x: 9, y: 1 });
    });

    it('coordenadas de borda (0,0) sao um destino valido, nao um falsy ignorado', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.pedirMovimento(0, 0); });
        expect(probe.movimentoPendente).toEqual({ x: 0, y: 0 });
        act(() => { probe.confirmarMovimento(); });
        expect(state.minhaFicha.posicoes.default).toMatchObject({ x: 0, y: 0 });
    });

    it('ficha sem posicoes ainda: qualquer casa vira pendente', () => {
        const minhaFicha = { iniciativa: 0, vida: { atual: 1 }, combate: {}, dominios: {}, poderes: [], inventario: [], passivas: [] };
        montar(baseState({ minhaFicha }));
        act(() => { probe.pedirMovimento(0, 0); });
        expect(probe.movimentoPendente).toEqual({ x: 0, y: 0 });
    });

    it('Mestre SEM alvo selecionado tambem precisa confirmar (move o proprio token)', () => {
        const state = baseState({ isMestre: true, mesaCriador: 'Heroi' });
        montar(state);
        act(() => { probe.pedirMovimento(4, 4); });
        expect(probe.movimentoPendente).toEqual({ x: 4, y: 4 });
        expect(state.updateFicha).not.toHaveBeenCalled();
    });

    it('Mestre COM dummie selecionado move direto, sem pendente', () => {
        const orc = { nome: 'Orc', cenaId: 'default', hpAtual: 10, posicao: { x: 0, y: 0, z: 0 } };
        const state = baseState({ isMestre: true, dummies: { orc }, alvoSelecionado: 'orc' });
        montar(state);
        act(() => { probe.pedirMovimento(4, 4); });
        expect(probe.movimentoPendente).toBeNull();
        expect(salvarDummie).toHaveBeenCalledWith('orc', expect.objectContaining({ posicao: { x: 4, y: 4, z: 0 } }));
        expect(state.updateFicha).not.toHaveBeenCalled();
    });

    it('Mestre com alvoSelecionado que NAO e dummie (id inexistente) cai no fluxo de confirmacao', () => {
        const state = baseState({ isMestre: true, dummies: {}, alvoSelecionado: 'fantasma' });
        montar(state);
        act(() => { probe.pedirMovimento(4, 4); });
        expect(probe.movimentoPendente).toEqual({ x: 4, y: 4 });
        expect(salvarDummie).not.toHaveBeenCalled();
    });

    it('jogador (nao Mestre) com alvoSelecionado de dummie ainda precisa confirmar e nao move o dummie', () => {
        const orc = { nome: 'Orc', cenaId: 'default', hpAtual: 10, posicao: { x: 0, y: 0, z: 0 } };
        montar(baseState({ isMestre: false, dummies: { orc }, alvoSelecionado: 'orc' }));
        act(() => { probe.pedirMovimento(4, 4); });
        expect(probe.movimentoPendente).toEqual({ x: 4, y: 4 });
        expect(salvarDummie).not.toHaveBeenCalled();
    });

    it('trocar de cena (cenaRenderId) invalida o destino pendente', () => {
        const state = baseState({
            cenario: { ativa: 'default', lista: { default: { nome: 'A', escala: 1.5 }, outra: { nome: 'B', escala: 1.5 } }, turnoAtualIndex: 0 },
        });
        const { rerender } = montar(state);
        act(() => { probe.pedirMovimento(5, 6); });
        expect(probe.movimentoPendente).not.toBeNull();

        mockUseStore({ ...state, cenario: { ...state.cenario, ativa: 'outra' } });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
        expect(probe.movimentoPendente).toBeNull();
    });

    it('trocar o alvoSelecionado invalida o destino pendente', () => {
        const orc = { nome: 'Orc', cenaId: 'default', hpAtual: 10, posicao: { x: 0, y: 0, z: 0 } };
        const state = baseState({ isMestre: true, dummies: { orc } });
        const { rerender } = montar(state);
        act(() => { probe.pedirMovimento(5, 6); });
        expect(probe.movimentoPendente).not.toBeNull();

        mockUseStore({ ...state, alvoSelecionado: 'orc' });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
        expect(probe.movimentoPendente).toBeNull();
    });

    it('handleCellClick continua movendo imediatamente (usado por confirmarMovimento)', () => {
        const state = baseState();
        montar(state);
        act(() => { probe.handleCellClick(3, 3); });
        expect(state.minhaFicha.posicoes.default).toMatchObject({ x: 3, y: 3 });
        expect(probe.movimentoPendente).toBeNull();
    });
});

describe('MapaVisao - barra de confirmacao e celula pendente', () => {
    const celula = (container, x, y) => container.querySelector(`.map-cell[data-x="${x}"][data-y="${y}"]`);

    it('sem destino pendente nao mostra a barra', () => {
        mockUseStore(baseState());
        const { container } = render(<MapaFormProvider><MapaVisao /></MapaFormProvider>);
        expect(container.querySelector('.movimento-pendente')).toBeNull();
        expect(container.querySelector('.map-cell--pendente')).toBeNull();
    });

    it('clicar numa celula mostra a barra (alertdialog) com os botoes e marca a celula destino, sem mover', () => {
        const state = baseState();
        mockUseStore(state);
        const { container, getByRole, getByText } = render(<MapaFormProvider><MapaVisao /></MapaFormProvider>);

        fireEvent.click(celula(container, 5, 6));

        const barra = getByRole('alertdialog');
        expect(barra.classList.contains('movimento-pendente')).toBe(true);
        expect(barra.textContent).toContain('(5, 6)');
        expect(barra.textContent).toContain('Heroi');
        expect(getByText('✅ Ir para lá')).toBeTruthy();
        expect(getByText('✖ Ficar')).toBeTruthy();
        expect(container.querySelectorAll('.map-cell--pendente')).toHaveLength(1);
        expect(celula(container, 5, 6).classList.contains('map-cell--pendente')).toBe(true);
        expect(state.updateFicha).not.toHaveBeenCalled();
    });

    it('"Ir para lá" move, some com a barra e com a marca', () => {
        const state = baseState();
        mockUseStore(state);
        const { container, queryByRole, getByText } = render(<MapaFormProvider><MapaVisao /></MapaFormProvider>);

        fireEvent.click(celula(container, 5, 6));
        fireEvent.click(getByText('✅ Ir para lá'));

        expect(state.minhaFicha.posicoes.default).toMatchObject({ x: 5, y: 6 });
        expect(queryByRole('alertdialog')).toBeNull();
        expect(container.querySelector('.map-cell--pendente')).toBeNull();
    });

    it('"Ficar" cancela: nao move, some a barra e a marca', () => {
        const state = baseState();
        mockUseStore(state);
        const { container, queryByRole, getByText } = render(<MapaFormProvider><MapaVisao /></MapaFormProvider>);

        fireEvent.click(celula(container, 5, 6));
        fireEvent.click(getByText('✖ Ficar'));

        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(queryByRole('alertdialog')).toBeNull();
        expect(container.querySelector('.map-cell--pendente')).toBeNull();
    });

    it('clicar em outra celula move a marca para ela (so uma celula pendente por vez)', () => {
        mockUseStore(baseState());
        const { container } = render(<MapaFormProvider><MapaVisao /></MapaFormProvider>);
        fireEvent.click(celula(container, 5, 6));
        fireEvent.click(celula(container, 8, 9));
        expect(container.querySelectorAll('.map-cell--pendente')).toHaveLength(1);
        expect(celula(container, 8, 9).classList.contains('map-cell--pendente')).toBe(true);
        expect(celula(container, 5, 6).classList.contains('map-cell--pendente')).toBe(false);
    });

    it('clicar na propria casa nao abre a barra', () => {
        mockUseStore(baseState());
        const { container, queryByRole } = render(<MapaFormProvider><MapaVisao /></MapaFormProvider>);
        fireEvent.click(celula(container, 2, 2));
        expect(queryByRole('alertdialog')).toBeNull();
    });

    it('Mestre com dummie selecionado: clique na celula move direto, sem barra', () => {
        const orc = { nome: 'Orc', cenaId: 'default', hpAtual: 10, posicao: { x: 0, y: 0, z: 0 } };
        mockUseStore(baseState({ isMestre: true, dummies: { orc }, alvoSelecionado: 'orc' }));
        const { container, queryByRole } = render(<MapaFormProvider><MapaVisao /></MapaFormProvider>);
        fireEvent.click(celula(container, 5, 6));
        expect(queryByRole('alertdialog')).toBeNull();
        expect(salvarDummie).toHaveBeenCalledWith('orc', expect.objectContaining({ posicao: { x: 5, y: 6, z: 0 } }));
    });
});
