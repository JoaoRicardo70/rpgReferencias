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
        setAcoesOrdemTurnoMapa: vi.fn(),
        acoesOrdemTurnoMapa: null,
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
            { id: 'filler', nome: 'Filler', iniciativa: 20, isDummie: true, chave: 'd:filler' },
            { id: 'Heroi', nome: 'Heroi', iniciativa: 10, isDummie: false, chave: 'p:Heroi' },
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

// ---------------------------------------------------------------------------
// QA — Ordem de turno MANUAL (reordenarTurno/adicionarAoTurno/removerDoTurno,
// core/turnos.js): registradas na store como acoesOrdemTurnoMapa (reordenar/
// adicionar/remover), do MESMO jeito que acaoAvancarTurnoMapa. Confere que
// salvarCenarioCompleto recebe ordemTurnoManual[cena] e um turnoAtualIndex
// que mantém quem está na vez, e que remover zera iniciativa (via
// zerarIniciativaGlobal para outros personagens).
// ---------------------------------------------------------------------------
describe('MapaFormContext — ordem de turno manual (reordenarTurno/adicionarAoTurno/removerDoTurno)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    function estadoComOrdemManual(overrides = {}) {
        const state = baseState({
            isMestre: true,
            dummies: {
                goblin: { nome: 'Goblin', iniciativa: 15, posicao: { x: 3, y: 3, z: 0 }, cenaId: 'default' },
            },
            personagens: {
                Aliado: { iniciativa: 5, posicoes: { default: { cenaId: 'default' } }, vida: { atual: 1 } },
            },
            ...overrides,
        });
        state.minhaFicha.iniciativa = 20; // Heroi(20) > Goblin(15) > Aliado(5), por iniciativa
        return state;
    }

    it('registra uma acoesOrdemTurnoMapa com reordenar/adicionar/remover ao montar', () => {
        const state = estadoComOrdemManual();
        montarComEstado(state);

        expect(state.setAcoesOrdemTurnoMapa).toHaveBeenCalledTimes(1);
        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        expect(typeof acoes.reordenar).toBe('function');
        expect(typeof acoes.adicionar).toBe('function');
        expect(typeof acoes.remover).toBe('function');
    });

    it('reordenar move a chave para o índice pedido e salva ordemTurnoManual[cena] com turnoAtualIndex que mantém quem está na vez', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = estadoComOrdemManual({ cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 } });
        montarComEstado(state);
        // ordemIniciativa por iniciativa: Heroi(20), goblin(15), Aliado(5) -> índice 0 = Heroi (da vez)

        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        await act(async () => { acoes.reordenar('p:Heroi', 2); }); // manda Heroi pro fim

        expect(firebaseSync.salvarCenarioCompleto).toHaveBeenCalled();
        const novoCenario = firebaseSync.salvarCenarioCompleto.mock.calls[firebaseSync.salvarCenarioCompleto.mock.calls.length - 1][0];
        expect(novoCenario.ordemTurnoManual.default).toEqual(['d:goblin', 'p:Aliado', 'p:Heroi']);
        // Heroi tinha a vez (índice 0) e continua com ela: agora está no índice 2.
        expect(novoCenario.turnoAtualIndex).toBe(2);
    });

    it('reordenar não faz nada (não salva) se quem chama não é Mestre', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = estadoComOrdemManual({ isMestre: false });
        montarComEstado(state);

        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        await act(async () => { acoes.reordenar('p:Heroi', 2); });

        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('adicionar um dummie fora da ordem (iniciativa 0) dá iniciativa 1 a ele, salva no dummie e grava a ordemTurnoManual', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = estadoComOrdemManual({
            dummies: {
                filler: { nome: 'Filler', iniciativa: 0, posicao: { x: 1, y: 1, z: 0 }, cenaId: 'default' },
            },
        });
        montarComEstado(state);
        // ordemIniciativa: só Heroi (20) -- Filler tem iniciativa 0, então fica de fora.

        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        await act(async () => { acoes.adicionar({ id: 'filler', isDummie: true }, 0); });

        expect(firebaseSync.salvarDummie).toHaveBeenCalledWith('filler', expect.objectContaining({ iniciativa: 1 }));
        expect(firebaseSync.salvarCenarioCompleto).toHaveBeenCalled();
        const novoCenario = firebaseSync.salvarCenarioCompleto.mock.calls[firebaseSync.salvarCenarioCompleto.mock.calls.length - 1][0];
        expect(novoCenario.ordemTurnoManual.default).toContain('d:filler');
    });

    it('adicionar um NPC (não Mestre, não o próprio) usa salvarCamposPersonagem para dar iniciativa 1', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = estadoComOrdemManual({
            personagens: {
                Aliado: { iniciativa: 0, posicoes: { default: { cenaId: 'default' } }, vida: { atual: 1 } },
            },
        });
        montarComEstado(state);

        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        await act(async () => { acoes.adicionar({ id: 'Aliado', isDummie: false }, 0); });

        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenCalledWith('Aliado', expect.objectContaining({ iniciativa: 1 }));
        expect(firebaseSync.salvarCenarioCompleto).toHaveBeenCalled();
    });

    it('remover quem está na vez tira a chave da ordemTurnoManual e passa a vez pro próximo que ainda está na ordem, zerando a iniciativa via zerarIniciativaGlobal', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = estadoComOrdemManual({ cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 1 } });
        montarComEstado(state);
        // ordemIniciativa: Heroi(20,0), goblin(15,1), Aliado(5,2) -- turnoAtualIndex=1 -> vez do goblin (dummie, sem zerarIniciativaGlobal)
        // Removendo o Aliado (não é quem está na vez) só tira ele da ordem.

        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        await act(async () => { acoes.remover({ id: 'Aliado', isDummie: false }); });

        expect(firebaseSync.zerarIniciativaGlobal).toHaveBeenCalledWith(['Aliado']);
        expect(firebaseSync.salvarCenarioCompleto).toHaveBeenCalled();
        const novoCenario = firebaseSync.salvarCenarioCompleto.mock.calls[firebaseSync.salvarCenarioCompleto.mock.calls.length - 1][0];
        expect(novoCenario.ordemTurnoManual.default).toEqual(['p:Heroi', 'd:goblin']);
        // O goblin (índice 1, da vez) continua na ordem, agora no índice 1 ainda.
        expect(novoCenario.turnoAtualIndex).toBe(1);
    });

    it('remover a MIM MESMO (meuNome) zera a própria iniciativa via updateFicha/setIniciativaInput, sem chamar zerarIniciativaGlobal', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = estadoComOrdemManual();
        montarComEstado(state);

        expect(state.minhaFicha.iniciativa).toBe(20);
        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        await act(async () => { acoes.remover({ id: 'Heroi', isDummie: false }); });

        expect(state.minhaFicha.iniciativa).toBe(0);
        expect(firebaseSync.zerarIniciativaGlobal).not.toHaveBeenCalled();
        expect(firebaseSync.salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('remover uma chave que não está na ordem (entidade inexistente) não salva nada', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = estadoComOrdemManual();
        montarComEstado(state);

        const acoes = state.setAcoesOrdemTurnoMapa.mock.calls[0][0];
        await act(async () => { acoes.remover({ id: 'fantasma', isDummie: true }); });

        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
});
