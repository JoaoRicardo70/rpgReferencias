import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — MapaFormContext.jsx: Controle de Turnos publicado pra aba Mestre
// (resumoTurnoMapa/acaoAvancarTurnoMapa, ver useStore.js e
// MestreControleTurno.jsx). O MapaFormProvider registra UMA função estável
// (via ref, chamando sempre a versão mais recente de avancarTurno) e publica
// um resumo leve da ordem de iniciativa (id/nome/iniciativa/isDummie +
// turnoAtualIndex) só quando esses dados realmente mudam.
//
// Mesmo padrão de mock de MapaFormContext.combateAutoTurno.test.jsx: mocka
// '../../stores/useStore' (default) e '../../services/firebase-sync'.
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
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function fichaComVital(overrides = {}) {
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 5000000 },
        poderes: [],
        inventario: [],
        passivas: [],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...overrides,
    };
}

function baseState(overrides = {}) {
    const minhaFicha = fichaComVital({ iniciativa: 20 });
    return {
        minhaFicha,
        meuNome: 'Heroi',
        personagens: {},
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        feedCombate: [],
        isMestre: false,
        mesaCriador: '',
        dummies: {},
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        setAcaoAvancarTurnoMapa: vi.fn(),
        setResumoTurnoMapa: vi.fn(),
        acaoAvancarTurnoMapa: null,
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

describe('MapaFormContext — publica acaoAvancarTurnoMapa/resumoTurnoMapa na store pra aba Mestre', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('registra uma FUNÇÃO em setAcaoAvancarTurnoMapa ao montar', () => {
        const state = baseState({
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        montarComEstado(state);

        expect(state.setAcaoAvancarTurnoMapa).toHaveBeenCalledTimes(1);
        expect(typeof state.setAcaoAvancarTurnoMapa.mock.calls[0][0]).toBe('function');
    });

    it('chamar a função registrada produz o MESMO efeito que probe.avancarTurno() (salva o Cenário/turnoAtualIndex via salvarCenarioCompleto)', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = baseState({
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        montarComEstado(state);

        const acaoRegistrada = state.setAcaoAvancarTurnoMapa.mock.calls[0][0];

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);

        await act(async () => { acaoRegistrada(); });

        // Mesmo efeito de avancarTurno: reset/regeneração aplicados e o Cenário salvo.
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
        expect(state.minhaFicha.vida.atual).toBe(5000001);
        expect(firebaseSync.salvarCenarioCompleto).toHaveBeenCalled();
        const novoCenario = firebaseSync.salvarCenarioCompleto.mock.calls[
            firebaseSync.salvarCenarioCompleto.mock.calls.length - 1
        ][0];
        expect(novoCenario.turnoAtualIndex).toBe(1);
    });

    it('a função registrada SEMPRE chama a versão mais RECENTE de avancarTurno (via ref) — mesmo comportamento de probe.avancarTurno() após um re-render com estado novo', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = baseState({
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        const { rerender } = montarComEstado(state);

        // Só uma chamada de setAcaoAvancarTurnoMapa (efeito com deps [] -- não reescreve a cada render).
        act(() => { state.cenario = { ...state.cenario }; });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
        expect(state.setAcaoAvancarTurnoMapa).toHaveBeenCalledTimes(1);

        const acaoRegistrada = state.setAcaoAvancarTurnoMapa.mock.calls[0][0];
        await act(async () => { acaoRegistrada(); });

        expect(firebaseSync.salvarCenarioCompleto).toHaveBeenCalled();
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
    });

    it('publica resumoTurnoMapa com a ordem de iniciativa (id/nome/iniciativa/isDummie) e turnoAtualIndex ao montar', () => {
        const state = baseState({
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        montarComEstado(state);

        expect(state.setResumoTurnoMapa).toHaveBeenCalled();
        const ultimaChamada = state.setResumoTurnoMapa.mock.calls[state.setResumoTurnoMapa.mock.calls.length - 1][0];

        expect(ultimaChamada.turnoAtualIndex).toBe(0);
        expect(ultimaChamada.ordem).toEqual([
            { id: 'filler', nome: 'Filler', iniciativa: 20, isDummie: true },
            { id: 'Heroi', nome: 'Heroi', iniciativa: 10, isDummie: false },
        ]);
    });

    it('resumoTurnoMapa é republicado (turnoAtualIndex atualizado) depois de avançar o turno', async () => {
        const state = baseState({
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        const { rerender } = montarComEstado(state);

        await act(async () => { probe.avancarTurno(); }); // turnoAtualIndex 0(Filler) -> 1(Heroi)
        act(() => { state.cenario = { ...state.cenario, turnoAtualIndex: 1 }; });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);

        const ultimaChamada = state.setResumoTurnoMapa.mock.calls[state.setResumoTurnoMapa.mock.calls.length - 1][0];
        expect(ultimaChamada.turnoAtualIndex).toBe(1);
    });

    it('nenhum combatente na cena (ordemIniciativa vazia) publica resumoTurnoMapa com ordem: []', () => {
        const state = baseState({ dummies: {}, personagens: {} });
        delete state.minhaFicha.iniciativa; // sem iniciativa > 0 => fora da ordem
        montarComEstado(state);

        const ultimaChamada = state.setResumoTurnoMapa.mock.calls[state.setResumoTurnoMapa.mock.calls.length - 1][0];
        expect(ultimaChamada.ordem).toEqual([]);
    });

    it('desmontar limpa acaoAvancarTurnoMapa (chama setAcaoAvancarTurnoMapa(null)) só se a ação ainda registrada for a MESMA (evita apagar um registro mais novo)', () => {
        const state = baseState({
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        const { unmount } = montarComEstado(state);

        const acaoRegistrada = state.setAcaoAvancarTurnoMapa.mock.calls[0][0];
        // Simula o registro persistido na store real (o mock não muta storeState.acaoAvancarTurnoMapa sozinho).
        state.acaoAvancarTurnoMapa = acaoRegistrada;

        unmount();

        const ultimaChamada = state.setAcaoAvancarTurnoMapa.mock.calls[state.setAcaoAvancarTurnoMapa.mock.calls.length - 1];
        expect(ultimaChamada[0]).toBeNull();
    });

    it('desmontar NÃO limpa a ação se ela já foi substituída por outra mais recente na store (nunca apaga um registro alheio)', () => {
        const state = baseState({
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        const { unmount } = montarComEstado(state);

        // Uma ação DIFERENTE assumiu o lugar na store antes do unmount (ex.: outra instância montou).
        state.acaoAvancarTurnoMapa = () => {};

        unmount();

        // setAcaoAvancarTurnoMapa nunca foi chamado de novo com null -- só a chamada inicial de registro.
        expect(state.setAcaoAvancarTurnoMapa).toHaveBeenCalledTimes(1);
    });

    it('não lança quando a store não tem setAcaoAvancarTurnoMapa/setResumoTurnoMapa (mock parcial, defensivo)', () => {
        const state = baseState({ setAcaoAvancarTurnoMapa: undefined, setResumoTurnoMapa: undefined });
        expect(() => montarComEstado(state)).not.toThrow();
    });
});
