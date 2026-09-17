import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed, salvarDummie, aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, aplicarElementoNivelDireto } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — aplicarDanoRapido(): 4º parâmetro `nivelDominioOverride` (override de Domínio
// 0-10 do Mestre no Dano Rápido, ver core/dominios.js > getFracaoResistenciaElemental).
//
// MapaFormContext.elementoAutoDano.test.jsx já cobre o branch AUTO pro campo IRMÃO
// combate.ultimoElementoRecebido — este arquivo cobre o threading do NOVO 4º
// parâmetro nos 3 branches (dummie: ignorado por completo; self/AUTO: grava
// ultimoElementoRecebidoNivel no draft local; outro jogador: chama
// aplicarElementoNivelDireto cross-player). Mesmo padrão de mock/fixture de
// MapaFormContext.elementoAutoDano.test.jsx / .descansarDanoRapido.test.jsx.
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
    aplicarElementoNivelDireto: vi.fn(),
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

describe('MapaFormContext — aplicarDanoRapido(): branch AUTO/self grava combate.ultimoElementoRecebidoNivel no draft local', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('Mestre aplicando dano em SI MESMO com elemento + override de Domínio grava os dois campos no draft local', () => {
        const minhaFicha = fichaVidaLimpa();
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Fogo', 7); });

        expect(minhaFicha.combate.ultimoElementoRecebido).toBe('Fogo');
        expect(minhaFicha.combate.ultimoElementoRecebidoNivel).toBe(7);
        expect(aplicarElementoNivelDireto).not.toHaveBeenCalled();
    });

    it('override=0 (Mestre zerando explicitamente) é gravado como 0, NUNCA convertido para null', () => {
        const minhaFicha = fichaVidaLimpa();
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Fogo', 0); });

        expect(minhaFicha.combate.ultimoElementoRecebidoNivel).toBe(0);
    });

    it('sem override (undefined) grava null — não deixa o campo ausente nem undefined', () => {
        const minhaFicha = fichaVidaLimpa();
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Fogo'); });

        expect(minhaFicha.combate.ultimoElementoRecebidoNivel).toBe(null);
    });

    it('override como string vazia ("", vindo do input HTML limpo) também grava null', () => {
        const minhaFicha = fichaVidaLimpa();
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Fogo', ''); });

        expect(minhaFicha.combate.ultimoElementoRecebidoNivel).toBe(null);
    });

    it('REGRESSÃO: um override anterior (7) é SOBRESCRITO por um golpe seguinte sem override (vira null) — nunca "gruda"', () => {
        const minhaFicha = fichaVidaLimpa();
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Fogo', 7); });
        expect(minhaFicha.combate.ultimoElementoRecebidoNivel).toBe(7);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 10, 'Gelo'); });
        expect(minhaFicha.combate.ultimoElementoRecebidoNivel).toBe(null);
    });

    it('um override alto (10) na PRÓPRIA ficha reduz a Fadiga gerada por este golpe, mesmo sem Domínio real algum registrado', () => {
        const minhaFichaComOverride = fichaVidaLimpa();
        const stateComOverride = baseState({ minhaFicha: minhaFichaComOverride, updateFicha: vi.fn((callback) => callback(minhaFichaComOverride)) });
        montarComEstado(stateComOverride);
        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFichaComOverride, isDummie: false }, 300000, 'Fogo', 10); });
        const fadigaComOverride = minhaFichaComOverride.combate.fadigaExtra;

        cleanup();
        vi.clearAllMocks();

        const minhaFichaSemOverride = fichaVidaLimpa();
        const stateSemOverride = baseState({ minhaFicha: minhaFichaSemOverride, updateFicha: vi.fn((callback) => callback(minhaFichaSemOverride)) });
        montarComEstado(stateSemOverride);
        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFichaSemOverride, isDummie: false }, 300000, 'Fogo'); });
        const fadigaSemOverride = minhaFichaSemOverride.combate.fadigaExtra;

        expect(fadigaComOverride).toBeLessThan(fadigaSemOverride);
    });
});

describe('MapaFormContext — aplicarDanoRapido(): branch OUTRO JOGADOR chama aplicarElementoNivelDireto (cross-player)', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('golpe com elemento + override em OUTRO jogador chama aplicarElementoNivelDireto(nome, nivel)', () => {
        const outroJogador = fichaVidaLimpa();
        const state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 10, 'Fogo', 6); });

        expect(aplicarElementoDireto).toHaveBeenCalledWith('Vilao', 'Fogo');
        expect(aplicarElementoNivelDireto).toHaveBeenCalledWith('Vilao', 6);
    });

    it('sem override, chama aplicarElementoNivelDireto com null (limpa cross-player)', () => {
        const outroJogador = fichaVidaLimpa();
        const state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 10, 'Fogo'); });

        expect(aplicarElementoNivelDireto).toHaveBeenCalledWith('Vilao', null);
    });

    it('override=0 explícito em OUTRO jogador é encaminhado como 0, não como null', () => {
        const outroJogador = fichaVidaLimpa();
        const state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 10, 'Fogo', 0); });

        expect(aplicarElementoNivelDireto).toHaveBeenCalledWith('Vilao', 0);
    });

    it('um override alto (10) reduz a Fadiga aplicada cross-player (aplicarFadigaDireta) pro mesmo dano', () => {
        const alvoComOverride = fichaVidaLimpa();
        let state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: alvoComOverride } });
        montarComEstado(state);
        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: alvoComOverride, isDummie: false }, 300000, 'Fogo', 10); });
        const fadigaComOverride = aplicarFadigaDireta.mock.calls[0][1];

        cleanup();
        vi.clearAllMocks();

        const alvoSemOverride = fichaVidaLimpa();
        state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: alvoSemOverride } });
        montarComEstado(state);
        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: alvoSemOverride, isDummie: false }, 300000, 'Fogo'); });
        const fadigaSemOverride = aplicarFadigaDireta.mock.calls[0][1];

        expect(fadigaComOverride).toBeLessThan(fadigaSemOverride);
    });
});

describe('MapaFormContext — aplicarDanoRapido(): branch DUMMIE ignora nivelDominioOverride por completo (dummies não têm Resistência Elemental)', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('aplicar dano com elemento+override num dummie nunca chama aplicarElementoNivelDireto/aplicarElementoDireto, e salvarDummie não grava nenhum campo de combate', () => {
        // 🔥 hpAtual bruto em escala realista (500.000) — o antigo "50" clamparia pra 0 depois da
        // correção de escala de aplicarDanoRapido (FATOR_EXIBICAO_VITAIS).
        const state = baseState({ isMestre: true, dummies: { goblin: { nome: 'Goblin', hpAtual: 500000, cenaId: 'default' } } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'goblin', nome: 'Goblin', ficha: state.dummies.goblin, isDummie: true }, 15, 'Fogo', 8); });

        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const dadosSalvos = salvarDummie.mock.calls[0][1];
        // 15 (dano exibido) * FATOR_EXIBICAO_VITAIS (1000) = 15.000 bruto subtraídos de 500.000.
        expect(dadosSalvos.hpAtual).toBe(485000); // 500000 - 15*1000
        expect(dadosSalvos.combate).toBeUndefined();
        expect(aplicarElementoNivelDireto).not.toHaveBeenCalled();
        expect(aplicarElementoDireto).not.toHaveBeenCalled();
    });
});
