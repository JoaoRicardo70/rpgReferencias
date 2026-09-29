import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Integração do 💪 Esforço de Poder (core/fadiga.js > calcularGanhoFadigaDinamico,
// { incluirEsforcoPoder }) nos DOIS caminhos reais de MapaFormContext.jsx que geram Fadiga:
//
//   1) INÍCIO DE TURNO (aplicarInicioDeTurno, via avancarTurno) — SEMPRE passa
//      { incluirEsforcoPoder: true }, pros 3 sub-caminhos (eu mesmo, outro jogador, dummie).
//      Este arquivo cobre o sub-caminho "outro jogador" (salvarCamposPersonagem).
//
//   2) DANO RÁPIDO do Mestre (aplicarDanoRapido) — chama calcularGanhoFadigaDinamico(f) SEM a
//      opção, de propósito (ver comentário em core/fadiga.js): cada golpe não deveria somar de
//      novo o "esforço de um turno inteiro" só por acertar o alvo.
//
// Mesmo padrão de mock/fixture de MapaFormContext.combateAutoTurno.test.jsx (turno) e
// MapaFormContext.reducaoDanoElemental.test.jsx (Dano Rápido).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
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

// Ficha DESCANSADA (Vida cheia, sem Forma ativa) — severidade dinâmica = 0. Só o "esforço de
// Poder" (piso de 0.2 x pesoMax quando incluirEsforcoPoder=true) pode gerar Fadiga aqui.
function fichaDescansada(overrides = {}) {
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 100000000, regeneracao: 0 },
        poderes: [],
        inventario: [],
        passivas: [],
        supressaoPoder: 100,
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        ...overrides,
    };
}

function baseState(overrides = {}) {
    const minhaFicha = fichaDescansada({ iniciativa: 20 });
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

describe('MapaFormContext — Integração: avancarTurno (INÍCIO DE TURNO) aplica o piso de 3% de Esforço de Poder a OUTRO jogador via salvarCamposPersonagem', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('Mestre passa o turno pra outro jogador descansado (Vida cheia, sem Forma) com Poder a 100%: salvarCamposPersonagem recebe "combate/fadigaExtra" = fadigaExtra anterior + 3', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const outroJogador = fichaDescansada({
            iniciativa: 10,
            posicao: { x: 2, y: 2, z: 0 },
            combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 5 }, // valor anterior != 0, pra provar que é SOMA
        });
        const state = baseState({ meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        state.minhaFicha.iniciativa = 20; // Mestre na posição 0, Vilao na posição 1
        montarComEstado(state);

        act(() => { probe.avancarTurno(); }); // turnoAtualIndex 0(Mestre) -> 1(Vilao)

        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nomeSalvo, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(nomeSalvo).toBe('Vilao');
        // 5 (anterior) + 3 (0.2 x pesoMax(15) x fatorPoder(1), severidade=0) = 8.
        expect(campos['combate/fadigaExtra']).toBeCloseTo(8, 10);
    });

    it('o mesmo jogador descansado, mas com Poder EM 80% (no limiar livre, não acima dele), NÃO recebe o piso de 3% — combate/fadigaExtra permanece igual ao anterior', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const outroJogador = fichaDescansada({
            iniciativa: 10,
            posicao: { x: 2, y: 2, z: 0 },
            supressaoPoder: 80,
            combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 5 },
        });
        const state = baseState({ meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        const [, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(campos['combate/fadigaExtra']).toBe(5);
    });
});

describe('MapaFormContext — Integração: Dano Rápido (aplicarDanoRapido) NÃO soma o piso de 3% de Esforço de Poder, mesmo com o alvo a 100% de Poder', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('BRANCH SELF: golpe pequeno num alvo descansado (Poder a 100%) gera uma Fadiga MINÚSCULA (só a fração de vida perdida pelo próprio golpe), bem abaixo do piso de 3 que o início de turno geraria na mesma ficha', () => {
        const minhaFicha = fichaDescansada({
            vida: { base: 1000000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000000, regeneracao: 0 },
        });
        const state = baseState({ minhaFicha, meuNome: 'Mestre', updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1, null); });

        // Dano de 1 (exibido) sobre uma Vida de 1 bilhão (bruto) mal arranha o fator de vida
        // perdida -- ganho real fica ordens de grandeza abaixo do piso de 3 do Esforço de Poder,
        // provando que o Dano Rápido nunca aplica esse piso (só severidade real, sem o +0.2 base).
        expect(minhaFicha.combate.fadigaExtra).toBeGreaterThan(0);
        expect(minhaFicha.combate.fadigaExtra).toBeLessThan(0.01);
    });

    it('BRANCH OUTRO JOGADOR: mesmo golpe pequeno num alvo descansado a 100% de Poder produz, via aplicarFadigaDireta, uma Fadiga igualmente minúscula (sem o piso de 3)', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const outroJogador = fichaDescansada({
            vida: { base: 1000000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000000, regeneracao: 0 },
        });
        const state = baseState({ meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 1, null); });

        expect(firebaseSync.aplicarFadigaDireta).toHaveBeenCalledTimes(1);
        const [nomeSalvo, novaFadigaExtra] = firebaseSync.aplicarFadigaDireta.mock.calls[0];
        expect(nomeSalvo).toBe('Vilao');
        expect(novaFadigaExtra).toBeGreaterThan(0);
        expect(novaFadigaExtra).toBeLessThan(0.01);
    });
});
