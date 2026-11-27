import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarCenarioCompleto, aplicarDanoDireto } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA - Dano de dado proporcional a Vida no Mapa (core/danoProporcional.js):
//  * Zonas: so as marcadas zona.danoDeDados escalam (cada alvo pela PROPRIA Vida maxima),
//    antes da Disputa de Poder; zona criada a mao pelo Mestre mantem o dano digitado.
//  * aplicarDanoRapido 7o argumento `danoDeDado`.
//  * UI MapaMestreDanoRapido: checkbox "E rolagem de dado" e escala da mesa (cenario.pontosDanoVida).
// Unidades: hpMax/hpAtual brutos = exibido x 1000.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)) };
});

const FATOR = 1000;
let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

// Ficha com Vida maxima conhecida: vida.base 200.000.000 + divisores.vida 0,0001 = 200.000 exibido.
function fichaVida(poder, base = 200000000) {
    return {
        __poder: poder, iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
        vida: { base, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: base, regeneracao: 0 },
        divisores: { vida: 0.0001 },
        combate: {}, dominios: {}, poderes: [], inventario: [], passivas: [],
    };
}

function baseState(overrides = {}) {
    const minhaFicha = overrides.minhaFicha || fichaVida(1000);
    return {
        minhaFicha, meuNome: 'Mestre', personagens: {}, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre: true, mesaCriador: 'Mestre',
        alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
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

const jogador = (nome, ficha) => ({ id: nome, nome, ficha });
const textoFeed = () => enviarParaFeed.mock.calls.at(-1)[0].texto;
const textoMestreFeed = () => enviarParaFeed.mock.calls.at(-1)[0].textoMestre || '';
const feedContendo = (trecho) => enviarParaFeed.mock.calls.map(x => x[0]).find(e => (e.texto || '').includes(trecho));

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Zona - tick (avancarTurno > dispararEfeitoDaZona)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Zona - entrada (handleCellClick > processarEntradaNaZona)
// ---------------------------------------------------------------------------
describe('Zona (entrada) - dano de dado proporcional a Vida', () => {
    function estadoEntrada(marcada, extras = {}) {
        const zona = { id: 'z1', nome: 'Gelo', cenaId: 'default', conjurador: 'Conj', duracao: 3, danoOriginal: 35, x: 5, y: 5, z: 0, raio: 1, ...(marcada ? { danoDeDados: true } : {}) };
        return baseState({
            personagens: { Conj: { __poder: 1000 } },
            cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [zona] },
            ...extras,
        });
    }

    it('o proprio jogador entra em zona marcada: escala pela SUA Vida maxima (ficha real)', () => {
        const minhaFicha = { ...fichaVida(1000), posicao: undefined, posicoes: { default: { x: 0, y: 0, z: 0, cenaId: 'default' } } };
        montar(estadoEntrada(true, { minhaFicha, isMestre: false }));
        act(() => { probe.handleCellClick(5, 5); });
        // poder igual (x1): 35 x 1000 = 35.000 exibidos = 35.000.000 brutos
        expect(minhaFicha.vida.atual).toBe(200000000 - 35000 * FATOR);
    });
    it('o proprio jogador entra em zona NAO marcada: dano exato', () => {
        const minhaFicha = { ...fichaVida(1000), posicao: undefined, posicoes: { default: { x: 0, y: 0, z: 0, cenaId: 'default' } } };
        montar(estadoEntrada(false, { minhaFicha, isMestre: false }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(minhaFicha.vida.atual).toBe(200000000 - 35 * FATOR);
    });
});

// ---------------------------------------------------------------------------
// Dano Rapido - 7o argumento danoDeDado
// ---------------------------------------------------------------------------
describe('aplicarDanoRapido - 7o argumento danoDeDado', () => {
    it('true: alvo jogador (outra ficha) escala pela Vida da ficha dele', () => {
        const outro = fichaVida(1000);
        montar(baseState({ personagens: { Outro: outro } }));
        act(() => { probe.aplicarDanoRapido(jogador('Outro', outro), 35, null, null, 0, undefined, true); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Outro', 200000000 - 35000 * FATOR, expect.anything());
    });
    it('true: alvo e a ficha do proprio Mestre escala pela minhaFicha', () => {
        const minhaFicha = fichaVida(1000);
        montar(baseState({ minhaFicha }));
        act(() => { probe.aplicarDanoRapido(jogador('Mestre', minhaFicha), 35, null, null, 0, undefined, true); });
        expect(minhaFicha.vida.atual).toBe(200000000 - 35000 * FATOR);
    });
});

// ---------------------------------------------------------------------------
// UI - MapaMestreDanoRapido
// ---------------------------------------------------------------------------
describe('MapaMestreDanoRapido (UI) - rolagem de dado e escala da mesa', () => {
    function montarUI(cenarioExtra = {}) {
        const state = baseState({ minhaFicha: { ...fichaVida(1000), posicao: { x: 0, y: 0, z: 0, cenaId: 'default' } } });
        Object.assign(state.cenario, cenarioExtra);
        mockUseStore(state);
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);
    }
    const selectAlvo = () => screen.getAllByRole('combobox')[0];
    const checkbox = () => screen.getByLabelText(/É rolagem de dado/);
    const campoEscala = () => screen.getByPlaceholderText('200');

    it('o checkbox "E rolagem de dado" comeca desmarcado', () => {
        montarUI();
        expect(checkbox().checked).toBe(false);
    });
    it('o campo de escala mostra o padrao 200 como placeholder e "(atual: 200)"', () => {
        montarUI();
        expect(campoEscala()).toBeTruthy();
        expect(screen.getByText(/atual: 200/)).toBeTruthy();
    });
    it('com pontosDanoVida salvo no cenario, mostra o valor atual', () => {
        montarUI({ pontosDanoVida: 500 });
        expect(screen.getByText(/atual: 500/)).toBeTruthy();
        expect(screen.getByPlaceholderText('500')).toBeTruthy();
    });
    it('digitar 100 e sair do campo salva cenario.pontosDanoVida = 100 sem perder o resto do cenario', () => {
        montarUI();
        fireEvent.change(campoEscala(), { target: { value: '100' } });
        fireEvent.blur(campoEscala());
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.pontosDanoVida).toBe(100);
        expect(salvo.ativa).toBe('default');
        expect(salvo.lista.default.nome).toBe('Cena');
    });
    it('Enter no campo tambem confirma (dispara o blur)', () => {
        montarUI();
        const campo = campoEscala();
        campo.focus();
        fireEvent.change(campo, { target: { value: '300' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        expect(salvarCenarioCompleto.mock.calls[0][0].pontosDanoVida).toBe(300);
    });
    it('valores < 1 (0, 0.5, negativo) sao ignorados', () => {
        montarUI();
        for (const v of ['0', '0.5', '-10']) {
            fireEvent.change(campoEscala(), { target: { value: v } });
            fireEvent.blur(campoEscala());
        }
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('campo vazio ou texto invalido e ignorado', () => {
        montarUI();
        fireEvent.change(campoEscala(), { target: { value: '' } });
        fireEvent.blur(campoEscala());
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('valor igual ao atual nao salva de novo', () => {
        montarUI();
        fireEvent.change(campoEscala(), { target: { value: '200' } });
        fireEvent.blur(campoEscala());
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('1 e aceito (limite inferior)', () => {
        montarUI();
        fireEvent.change(campoEscala(), { target: { value: '1' } });
        fireEvent.blur(campoEscala());
        expect(salvarCenarioCompleto.mock.calls[0][0].pontosDanoVida).toBe(1);
    });
});
