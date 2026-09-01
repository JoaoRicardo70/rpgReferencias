import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Fadiga de Combate e Regeneração automáticas no Mapa (MapaFormContext.jsx)
//
// Piggyback no efeito já existente que reseta os pontos de Ação do PRÓPRIO
// jogador sempre que seu turno volta na iniciativa do Mapa (gated por
// `currentActor && !currentActor.isDummie && currentActor.nome === meuNome`):
// além de resetar acoes.padrao/bonus/reacao, agora também incrementa
// combate.fadigaTurnos em +1 e chama aplicarRegeneracaoDeTurno(f) — SEMPRE
// dentro do mesmo `if`, então nunca dispara para dummies (NPCs) nem para o
// turno de outro jogador (updateFicha só pode mutar a MINHA ficha, nunca a
// de outro personagem conectado).
//
// Mesmo padrão de mock de useStore/firebase-sync de
// MapaFormContext.apenasCriador.test.jsx; mesma leitura de fadiga de
// Marcados.fadigaCombate.test.jsx.
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

describe('MapaFormContext — Fadiga de Combate e Regeneração automáticas ao voltar o MEU turno', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('incrementa combate.fadigaTurnos em +1 e aplica regeneração quando o turno passa a ser o MEU (não-dummie)', () => {
        // Preenchedor (dummie) na posição 0 com iniciativa maior; EU (Heroi) na posição 1.
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10; // fico atrás do filler na ordem de iniciativa
        const { rerender } = montarComEstado(state);

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);

        act(() => {
            state.cenario = { ...state.cenario, turnoAtualIndex: 1 }; // index 1 -> EU (ordenado por iniciativa desc: Filler(20), Heroi(10))
        });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
        // Regeneração real de core/vitals.js aplicada: vida.atual(1) + regeneracao(5_000_000).
        expect(state.minhaFicha.vida.atual).toBe(5000001);
    });

    it('NÃO incrementa fadiga/regen quando o ator atual é um dummie (NPC), mesmo que EU esteja na lista de iniciativa', () => {
        // EU (Heroi) na posição 0 com iniciativa maior; um dummie na posição 1 (o alvo do turno).
        const state = baseState({ meuNome: 'Heroi', dummies: { goblin: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 } } } });
        state.minhaFicha.iniciativa = 20;
        const { rerender } = montarComEstado(state);

        act(() => {
            state.cenario = { ...state.cenario, turnoAtualIndex: 1 }; // index 1 -> Goblin (dummie)
        });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);
    });

    it('NÃO incrementa fadiga/regen NA MINHA ficha quando o ator atual é um jogador DIFERENTE de mim', () => {
        // EU (Heroi) na posição 0 com iniciativa maior; outro jogador ("Vilao") na posição 1.
        const outroJogador = fichaComVital({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } });
        const state = baseState({ meuNome: 'Heroi', personagens: { Vilao: outroJogador } });
        state.minhaFicha.iniciativa = 20;
        const { rerender } = montarComEstado(state);

        act(() => {
            state.cenario = { ...state.cenario, turnoAtualIndex: 1 }; // index 1 -> Vilao (outro jogador)
        });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);

        // updateFicha só pode mutar minhaFicha (a MINHA), então nem faz sentido a ficha do
        // Vilao mudar por essa via — a asserção principal é que a MINHA ficha não foi tocada.
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);
        // updateFicha (mock) não deve ter sido chamado nenhuma vez além do que já rodou no mount.
        expect(state.updateFicha).not.toHaveBeenCalled();
    });

    it('NÃO dispara na primeira renderização (turnoAtualIndex inicial já é o valor "atual", sem transição) mesmo se já for o meu turno', () => {
        const state = baseState({ meuNome: 'Heroi', dummies: { filler: { nome: 'Filler', iniciativa: 5, posicao: { x: 5, y: 5, z: 0 } } } });
        state.minhaFicha.iniciativa = 20; // EU já sou o índice 0 (maior iniciativa)
        state.cenario = { ...state.cenario, turnoAtualIndex: 0 }; // já nasce apontando pra mim, sem transição
        montarComEstado(state);

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);
        expect(state.updateFicha).not.toHaveBeenCalled();
    });

    it('incrementa fadigaTurnos a partir do valor já existente (não reseta para 1) e usa combate.fadigaPorTurno já carregado', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        state.minhaFicha.combate = { fadigaTurnos: 6, fadigaPorTurno: 5 };
        const { rerender } = montarComEstado(state);

        act(() => {
            state.cenario = { ...state.cenario, turnoAtualIndex: 1 };
        });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(7);
    });

    it('cria combate do zero (objeto ausente) sem lançar exceção quando o turno automático dispara pela primeira vez', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        delete state.minhaFicha.combate;
        const { rerender } = montarComEstado(state);

        expect(() => {
            act(() => {
                state.cenario = { ...state.cenario, turnoAtualIndex: 1 };
            });
            rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
        }).not.toThrow();

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// QA — Fadiga DINÂMICA (combate.fadigaExtra): calcularGanhoFadigaDinamico
// (core/fadiga.js) roda ANTES de aplicarRegeneracaoDeTurno no mesmo tick, pra
// refletir o quão gasto/ferido o personagem estava ENTRANDO no turno — não o
// estado já curado. Ver MapaFormContext.jsx:695-708.
// ---------------------------------------------------------------------------
describe('MapaFormContext — Fadiga DINÂMICA (fadigaExtra) acumula no retorno do turno, ANTES da Regeneração mascarar o desgaste', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('acumula combate.fadigaExtra > 0 e <= 15 num único tick para uma ficha com pouca vida/energia', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // Vida quase zerada (grande fator de "vida perdida") -- sem regeneração própria, pra o
        // valor do fator não mudar entre "antes" e "depois" do cálculo dinâmico.
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 };
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 };
        const { rerender } = montarComEstado(state);

        expect(state.minhaFicha.combate.fadigaExtra).toBe(0);

        act(() => {
            state.cenario = { ...state.cenario, turnoAtualIndex: 1 };
        });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);

        expect(state.minhaFicha.combate.fadigaExtra).toBeGreaterThan(0);
        expect(state.minhaFicha.combate.fadigaExtra).toBeLessThanOrEqual(15);
        // fadigaTurnos (contador manual/base) continua incrementando normalmente, sem relação.
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
    });

    it('reflete o déficit PRÉ-regeneração: mesmo quando a Regeneração cura o vital TOTALMENTE no mesmo tick, o ganho dinâmico não fica mascarado em 0', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // Vida bem baixa, MAS com regeneração enorme (>= o máximo calculado) -- se o cálculo
        // dinâmico rodasse DEPOIS da regeneração (ou lesse o estado pós-cura), o fator de "vida
        // perdida" cairia pra 0 e fadigaExtra ficaria zerado neste tick, o que seria o bug.
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 99999999 };
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 };
        const { rerender } = montarComEstado(state);

        act(() => {
            state.cenario = { ...state.cenario, turnoAtualIndex: 1 };
        });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);

        // A Regeneração realmente curou a vida cheia neste mesmo tick (comportamento herdado,
        // inalterado)...
        expect(state.minhaFicha.vida.atual).toBe(10000000); // máximo calculado (mxDisplay)
        // ...mas o ganho dinâmico já capturado ANTES da cura continua > 0 (não foi mascarado).
        expect(state.minhaFicha.combate.fadigaExtra).toBeGreaterThan(0);
    });

    it('uma ficha "de boa" (vida/energia cheias, sem Forma ativa) não ganha fadigaExtra nenhum no tick', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // "atual" cheio de verdade: getFatorVidaPerdida usa getMaximo(ficha,'vida') de
        // core/attributes.js diretamente (SEM a escala de exibição de calcVitalScale do
        // core/vitals.js) -- o máximo "cru" aqui é base(1e8) x mult(1) = 1e8.
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 100000000, regeneracao: 0 };
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 };
        const { rerender } = montarComEstado(state);

        act(() => {
            state.cenario = { ...state.cenario, turnoAtualIndex: 1 };
        });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);

        expect(state.minhaFicha.combate.fadigaExtra).toBe(0);
    });

    it('acumula fadigaExtra a partir do valor já existente (soma, não substitui) em ticks sucessivos', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 };
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 3 };
        const { rerender } = montarComEstado(state);

        act(() => {
            state.cenario = { ...state.cenario, turnoAtualIndex: 1 };
        });
        rerender(<MapaFormProvider><Harness /></MapaFormProvider>);

        expect(state.minhaFicha.combate.fadigaExtra).toBeGreaterThan(3);
    });
});
