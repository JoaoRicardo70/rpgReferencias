import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed, salvarDummie, aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — aplicarDanoRapido(): branch "AUTO" (Mestre aplicando Dano Rápido na PRÓPRIA
// ficha) gravando/limpando combate.ultimoElementoRecebido.
//
// MapaFerramentasMestre.danoRapido.test.jsx já cobre o threading do elemento pro
// branch "OUTRO JOGADOR" (aplicarElementoDireto) e MapaFormContext.descansarDanoRapido
// .test.jsx já cobre o branch AUTO para dano/Fadiga (sem elemento) — este arquivo
// preenche a lacuna documentada: o branch AUTO grava/limpa
// combate.ultimoElementoRecebido diretamente no draft do updateFicha LOCAL, sempre
// SOBRESCREVENDO o campo (nunca deixando um elemento antigo "grudado").
//
// Mesmo padrão de mock/fixture de MapaFormContext.descansarDanoRapido.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function fichaVidaLimpa(overrides = {}) {
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        mana: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        aura: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        chakra: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        corpo: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 }, carisma: { base: 1000000 },
        stamina: { base: 1000000 }, constituicao: { base: 1000000 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
        poderes: [], inventario: [], passivas: [],
        dominios: {},
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        ...overrides,
    };
}

function baseState(overrides = {}) {
    const minhaFicha = fichaVidaLimpa();
    return {
        minhaFicha,
        meuNome: 'Mestre',
        personagens: {},
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        feedCombate: [],
        isMestre: true,
        mesaCriador: 'Mestre',
        dummies: {},
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...overrides,
    };
}

let probe;
function Harness() {
    probe = useMapaForm();
    return null;
}

function montarComEstado(state) {
    mockUseStore(state);
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}

describe('MapaFormContext — aplicarDanoRapido(): branch AUTO grava combate.ultimoElementoRecebido', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('Mestre aplicando dano em SI MESMO com um elemento marcado grava esse elemento em combate.ultimoElementoRecebido, via updateFicha LOCAL', () => {
        const minhaFicha = fichaVidaLimpa();
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Fogo'); });

        expect(minhaFicha.combate.ultimoElementoRecebido).toBe('Fogo');
        // Branch AUTO nunca usa a escrita cross-player.
        expect(aplicarElementoDireto).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('golpe SEM elemento (undefined) LIMPA o campo, gravando null — nunca deixa "undefined" nem mantém o campo ausente', () => {
        const minhaFicha = fichaVidaLimpa();
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10); });

        expect(minhaFicha.combate.ultimoElementoRecebido).toBe(null);
    });

    it('REGRESSÃO — golpe elemental (Fogo) seguido de um golpe físico/não-marcado SOBRESCREVE ultimoElementoRecebido para null, não deixa o elemento antigo "grudado"', () => {
        const minhaFicha = fichaVidaLimpa();
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Fogo'); });
        expect(minhaFicha.combate.ultimoElementoRecebido).toBe('Fogo');

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10 /* sem elemento */); });
        expect(minhaFicha.combate.ultimoElementoRecebido).toBe(null);
    });

    it('golpe com um elemento DIFERENTE do anterior sobrescreve para o novo elemento (nunca acumula/combina)', () => {
        const minhaFicha = fichaVidaLimpa();
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Fogo'); });
        expect(minhaFicha.combate.ultimoElementoRecebido).toBe('Fogo');

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Gelo'); });
        expect(minhaFicha.combate.ultimoElementoRecebido).toBe('Gelo');
    });

    it('cria ficha.combate do zero (ausente) e ainda assim grava o elemento corretamente, sem lançar', () => {
        const minhaFicha = fichaVidaLimpa();
        delete minhaFicha.combate;
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        expect(() => {
            act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Raio'); });
        }).not.toThrow();

        expect(minhaFicha.combate.ultimoElementoRecebido).toBe('Raio');
    });

    it('um Domínio treinado (nível 10) no elemento marcado desconta a Fadiga gerada por ESTE golpe, refletindo a mesma leitura de ultimoElementoRecebido gravada', () => {
        const minhaFichaComDominio = fichaVidaLimpa({ dominios: { Fogo: { nivel: 10 } } });
        const stateComDominio = baseState({ minhaFicha: minhaFichaComDominio, updateFicha: vi.fn((callback) => callback(minhaFichaComDominio)) });
        montarComEstado(stateComDominio);
        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFichaComDominio, isDummie: false }, 300000, 'Fogo'); });
        const fadigaComDominio = minhaFichaComDominio.combate.fadigaExtra;

        cleanup();
        vi.clearAllMocks();

        const minhaFichaSemDominio = fichaVidaLimpa();
        const stateSemDominio = baseState({ minhaFicha: minhaFichaSemDominio, updateFicha: vi.fn((callback) => callback(minhaFichaSemDominio)) });
        montarComEstado(stateSemDominio);
        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFichaSemDominio, isDummie: false }, 300000, 'Fogo'); });
        const fadigaSemDominio = minhaFichaSemDominio.combate.fadigaExtra;

        expect(minhaFichaComDominio.combate.ultimoElementoRecebido).toBe('Fogo');
        expect(fadigaComDominio).toBeLessThan(fadigaSemDominio);
    });
});
