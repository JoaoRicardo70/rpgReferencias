import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed, salvarCenarioCompleto, aplicarDanoDireto } from '../../services/firebase-sync';

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
        feedCombate: [], isMestre: true, mesaCriador: 'Mestre', dummies: {},
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

// Dummie com Vida maxima `vidaMax` (exibida). hpAtual padrao = cheio.
const dum = (vidaMax, extra = {}) => ({ nome: 'Alvo', cenaId: 'default', hpMax: vidaMax * FATOR, hpAtual: vidaMax * FATOR, ...extra });
const entidade = (id, d) => ({ id, nome: d.nome, ficha: d, isDummie: true });
const jogador = (nome, ficha) => ({ id: nome, nome, ficha, isDummie: false });
const textoFeed = () => enviarParaFeed.mock.calls.at(-1)[0].texto;
const textoMestreFeed = () => enviarParaFeed.mock.calls.at(-1)[0].textoMestre || '';
const hpSalvo = (id) => salvarDummie.mock.calls.filter(c => c[0] === id).at(-1)[1].hpAtual;
const feedContendo = (trecho) => enviarParaFeed.mock.calls.map(x => x[0]).find(e => (e.texto || '').includes(trecho));

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Zona - tick (avancarTurno > dispararEfeitoDaZona)
// ---------------------------------------------------------------------------
describe('Zona (tick) - dano de dado proporcional a Vida', () => {
    function estadoZona({ marcada, poderConjurador = 1000, dummies, danoOriginal = 35, cenarioExtra = {} }) {
        const zona = {
            id: 'z1', nome: 'Chamas', cenaId: 'cena_x', conjurador: 'Conj', duracao: 3, danoOriginal,
            x: 5, y: 5, z: 0, raio: 2, ...(marcada ? { danoDeDados: true } : {}),
        };
        const minhaFicha = { ...fichaVida(1000), posicao: { x: 50, y: 50, z: 0, cenaId: 'cena_x' } };
        return baseState({
            minhaFicha,
            personagens: { Conj: { __poder: poderConjurador } },
            dummies: {
                a: { nome: 'A', iniciativa: 20, cenaId: 'cena_x', hpAtual: 10 },
                conj: { nome: 'Conj', iniciativa: 10, cenaId: 'cena_x', hpAtual: 10 },
                ...dummies,
            },
            cenario: { ativa: 'cena_x', lista: { cena_x: { nome: 'X', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [zona], ...cenarioExtra },
        });
    }
    const alvo = (vidaMax, extra = {}) => dum(vidaMax, { cenaId: 'cena_x', iniciativa: 0, posicao: { x: 5, y: 6, z: 0 }, ...extra });

    it('zona marcada: 35 contra Vida 200.000 tira 35.000 (exemplo da regra)', () => {
        montar(estadoZona({ marcada: true, dummies: { alvo: alvo(200000) } }));
        act(() => { probe.avancarTurno(); });
        expect(hpSalvo('alvo')).toBe((200000 - 35000) * FATOR);
    });
    it('zona marcada: cada alvo escala pela PROPRIA Vida', () => {
        montar(estadoZona({ marcada: true, dummies: { chefe: alvo(200000, { nome: 'Chefe' }), rato: alvo(2000, { nome: 'Rato' }), mid: alvo(200, { nome: 'Mid' }) } }));
        act(() => { probe.avancarTurno(); });
        expect(hpSalvo('chefe')).toBe((200000 - 35000) * FATOR);
        expect(hpSalvo('rato')).toBe((2000 - 350) * FATOR);
        expect(hpSalvo('mid')).toBe((200 - 35) * FATOR);
    });
    it('zona NAO marcada (criada a mao): dano exato digitado, sem escala', () => {
        montar(estadoZona({ marcada: false, dummies: { alvo: alvo(200000) } }));
        act(() => { probe.avancarTurno(); });
        expect(hpSalvo('alvo')).toBe((200000 - 35) * FATOR);
        const e = feedContendo('castigou');
        expect(e.texto).toContain('castigou Alvo com 35 de Dano');
        expect(e.textoMestre || '').toBe('');
    });
    it('zona marcada + Disputa: escala primeiro, fator depois (35 x 1000 x 1,1 = 38.500)', () => {
        montar(estadoZona({ marcada: true, poderConjurador: 1100, dummies: { alvo: alvo(200000, { poderCalculado: 1000 }) } }));
        act(() => { probe.avancarTurno(); });
        expect(hpSalvo('alvo')).toBe((200000 - 38500) * FATOR);
        expect(feedContendo('castigou').textoMestre).toContain('Alvo: 38.500');
    });
    it('zona marcada sem Disputa: o texto publico nao traz o numero recalculado e o textoMestre traz o dano', () => {
        montar(estadoZona({ marcada: true, dummies: { alvo: alvo(200000) } }));
        act(() => { probe.avancarTurno(); });
        const e = feedContendo('castigou');
        // o publico so ve o dano NOMINAL da zona (a rolagem), nunca o valor recalculado pela Vida
        expect(e.texto).toContain('castigou Alvo com 35 de Dano');
        expect(e.texto).not.toMatch(/35[.]?000/);
        expect(e.textoMestre).toContain('Alvo: 35.000');
    });
    it('zona marcada: dummie sem hpMax (Vida desconhecida) recebe o dano como veio', () => {
        montar(estadoZona({ marcada: true, dummies: { alvo: { nome: 'Alvo', iniciativa: 0, cenaId: 'cena_x', hpAtual: 1000 * FATOR, posicao: { x: 5, y: 6, z: 0 } } } }));
        act(() => { probe.avancarTurno(); });
        expect(hpSalvo('alvo')).toBe((1000 - 35) * FATOR);
    });
    it('pontosDanoVida do cenario muda a escala da zona marcada', () => {
        montar(estadoZona({ marcada: true, dummies: { alvo: alvo(200000) }, cenarioExtra: { pontosDanoVida: 1000 } }));
        act(() => { probe.avancarTurno(); });
        expect(hpSalvo('alvo')).toBe((200000 - 7000) * FATOR);
    });
    it('pontosDanoVida nao afeta zona nao marcada', () => {
        montar(estadoZona({ marcada: false, dummies: { alvo: alvo(200000) }, cenarioExtra: { pontosDanoVida: 1 } }));
        act(() => { probe.avancarTurno(); });
        expect(hpSalvo('alvo')).toBe((200000 - 35) * FATOR);
    });
    it('zona marcada: dummie fora do raio nao e tocado', () => {
        montar(estadoZona({ marcada: true, dummies: { longe: alvo(200000, { posicao: { x: 40, y: 40, z: 0 } }) } }));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'longe')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Zona - entrada (handleCellClick > processarEntradaNaZona)
// ---------------------------------------------------------------------------
describe('Zona (entrada) - dano de dado proporcional a Vida', () => {
    function estadoEntrada(marcada, extras = {}) {
        const zona = { id: 'z1', nome: 'Gelo', cenaId: 'default', conjurador: 'Conj', duracao: 3, danoOriginal: 35, x: 5, y: 5, z: 0, raio: 1, ...(marcada ? { danoDeDados: true } : {}) };
        return baseState({
            personagens: { Conj: { __poder: 1000 } },
            cenario: { ativa: 'default', lista: { default: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [zona] },
            ...extras,
        });
    }
    const dummieFora = (vidaMax, extra = {}) => dum(vidaMax, { posicao: { x: 0, y: 0, z: 0 }, ...extra });

    it('zona marcada, dummie entra: 35 x (Vida/200); publico esconde numero, Mestre ve', () => {
        montar(estadoEntrada(true, { dummies: { alvo: dummieFora(200000) }, alvoSelecionado: 'alvo' }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(salvarDummie.mock.calls.filter(c => c[0] === 'alvo').map(c => c[1].hpAtual)).toContain((200000 - 35000) * FATOR);
        expect(textoFeed()).toBe('⚠️ Alvo pisou na área de [Gelo] e sofreu dano imediatamente!');
        expect(textoMestreFeed()).toContain('Dano após a Disputa de Poder: 35000');
    });
    it('zona marcada, outra Vida: usa a Vida do alvo que entrou (2.000 -> 350)', () => {
        montar(estadoEntrada(true, { dummies: { alvo: dummieFora(2000) }, alvoSelecionado: 'alvo' }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(salvarDummie.mock.calls.filter(c => c[0] === 'alvo').map(c => c[1].hpAtual)).toContain((2000 - 350) * FATOR);
    });
    it('zona NAO marcada: dummie entra e sofre os 35 exatos, com texto publico mostrando o numero', () => {
        montar(estadoEntrada(false, { dummies: { alvo: dummieFora(200000) }, alvoSelecionado: 'alvo' }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(salvarDummie.mock.calls.filter(c => c[0] === 'alvo').map(c => c[1].hpAtual)).toContain((200000 - 35) * FATOR);
        expect(textoFeed()).toContain('sofreu 35 de Dano');
    });
    it('zona marcada + Disputa (dummie 500): 35 x 1000 x 2 = 70.000', () => {
        montar(estadoEntrada(true, { dummies: { alvo: dummieFora(200000, { poderCalculado: 500 }) }, alvoSelecionado: 'alvo' }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(salvarDummie.mock.calls.filter(c => c[0] === 'alvo').map(c => c[1].hpAtual)).toContain((200000 - 70000) * FATOR);
    });
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
    it('true: 35 contra dummie de Vida 200.000 tira 35.000', () => {
        const orc = dum(200000, { nome: 'Orc' });
        montar(baseState({ dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 35, null, null, 0, undefined, true); });
        expect(hpSalvo('orc')).toBe((200000 - 35000) * FATOR);
    });
    it('false / omitido: dano exato digitado', () => {
        const orc = dum(200000, { nome: 'Orc' });
        montar(baseState({ dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 35, null, null, 0, undefined, false); });
        expect(hpSalvo('orc')).toBe((200000 - 35) * FATOR);
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 35); });
        expect(hpSalvo('orc')).toBe((200000 - 35) * FATOR);
        expect(textoFeed()).toBe('⚔️ O Mestre aplicou 35 de dano em Orc!');
    });
    it('true: o texto publico esconde os numeros e o textoMestre traz aplicado e digitado', () => {
        const orc = dum(200000, { nome: 'Orc' });
        montar(baseState({ dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 35, null, null, 0, undefined, true); });
        expect(textoFeed()).toBe('⚔️ O Mestre aplicou dano em Orc!');
        expect(textoFeed()).not.toMatch(/35/);
        expect(textoMestreFeed()).toContain('Aplicado: 35000');
        expect(textoMestreFeed()).toContain('digitado 35');
    });
    it('true com atacante: escala primeiro, Disputa depois (35 x 1000 x 1,1)', () => {
        const orc = dum(200000, { nome: 'Orc', poderCalculado: 1000 });
        const boss = { nome: 'Boss', poderCalculado: 1100 };
        montar(baseState({ dummies: { orc, boss } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 35, null, null, 0, entidade('boss', boss), true); });
        expect(hpSalvo('orc')).toBe((200000 - 38500) * FATOR);
        expect(textoMestreFeed()).toContain('Aplicado: 38500');
        expect(textoMestreFeed()).toContain('Disputa de Poder');
    });
    it('true com atacante que anula (alvo com dobro do Poder): so avisa, sem salvar', () => {
        const orc = dum(200000, { nome: 'Orc', poderCalculado: 2000 });
        const fraco = { nome: 'Fraco', poderCalculado: 1000 };
        montar(baseState({ dummies: { orc, fraco } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 35, null, null, 0, entidade('fraco', fraco), true); });
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(textoFeed()).toContain('não surtiu efeito');
    });
    it('true: dummie sem hpMax (Vida desconhecida) mantem o dano digitado', () => {
        const orc = { nome: 'Orc', cenaId: 'default', hpAtual: 200000 * FATOR };
        montar(baseState({ dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 35, null, null, 0, undefined, true); });
        expect(hpSalvo('orc')).toBe((200000 - 35) * FATOR);
        // mesmo assim o texto publico esconde o numero (houve pedido de dado)
        expect(textoFeed()).toBe('⚔️ O Mestre aplicou dano em Orc!');
    });
    it('true: pontosDanoVida do cenario (100) dobra o efeito', () => {
        const orc = dum(200000, { nome: 'Orc' });
        const state = baseState({ dummies: { orc } });
        state.cenario.pontosDanoVida = 100;
        montar(state);
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 35, null, null, 0, undefined, true); });
        expect(hpSalvo('orc')).toBe((200000 - 70000) * FATOR);
    });
    it('true: alvo jogador (outra ficha) escala pela Vida da ficha dele', () => {
        const outro = fichaVida(1000);
        montar(baseState({ personagens: { Outro: outro } }));
        act(() => { probe.aplicarDanoRapido(jogador('Outro', outro), 35, null, null, 0, undefined, true); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Outro', 200000000 - 35000 * FATOR);
    });
    it('true: alvo e a ficha do proprio Mestre escala pela minhaFicha', () => {
        const minhaFicha = fichaVida(1000);
        montar(baseState({ minhaFicha }));
        act(() => { probe.aplicarDanoRapido(jogador('Mestre', minhaFicha), 35, null, null, 0, undefined, true); });
        expect(minhaFicha.vida.atual).toBe(200000000 - 35000 * FATOR);
    });
    it('true: dano digitado 0 nao faz nada', () => {
        const orc = dum(200000, { nome: 'Orc' });
        montar(baseState({ dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 0, null, null, 0, undefined, true); });
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('true: nao-Mestre nao aplica nada', () => {
        const orc = dum(200000, { nome: 'Orc' });
        montar(baseState({ isMestre: false, dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 35, null, null, 0, undefined, true); });
        expect(salvarDummie).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// UI - MapaMestreDanoRapido
// ---------------------------------------------------------------------------
describe('MapaMestreDanoRapido (UI) - rolagem de dado e escala da mesa', () => {
    function montarUI(cenarioExtra = {}) {
        const dummies = { orc: dum(200000, { nome: 'Orc' }) };
        const state = baseState({ dummies, minhaFicha: { ...fichaVida(1000), posicao: { x: 0, y: 0, z: 0, cenaId: 'default' } } });
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
    it('desmarcado: Aplicar Dano tira o valor exato (padrao 10)', () => {
        montarUI();
        fireEvent.change(selectAlvo(), { target: { value: 'orc' } });
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));
        expect(hpSalvo('orc')).toBe((200000 - 10) * FATOR);
    });
    it('marcado: Aplicar Dano escala pela Vida do alvo (10 -> 10.000) e o publico nao mostra numeros', () => {
        montarUI();
        fireEvent.change(selectAlvo(), { target: { value: 'orc' } });
        fireEvent.click(checkbox());
        expect(checkbox().checked).toBe(true);
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));
        expect(hpSalvo('orc')).toBe((200000 - 10000) * FATOR);
        expect(textoFeed()).toBe('⚔️ O Mestre aplicou dano em Orc!');
        expect(textoMestreFeed()).toContain('Aplicado: 10000');
    });
    it('desmarcar de novo volta ao dano exato', () => {
        montarUI();
        fireEvent.change(selectAlvo(), { target: { value: 'orc' } });
        fireEvent.click(checkbox());
        fireEvent.click(checkbox());
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));
        expect(hpSalvo('orc')).toBe((200000 - 10) * FATOR);
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
