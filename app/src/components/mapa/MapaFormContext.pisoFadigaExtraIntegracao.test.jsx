import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — regressão de integração do `pisoFadigaExtra` (core/vitals.js >
// aplicarRegeneracaoDeTurno) através do próprio avancarTurno de
// MapaFormContext.jsx (aplicarInicioDeTurno), SEM mockar core/vitals.js nem
// core/fadiga.js — exercita o wiring real entre os dois módulos, não só a
// função pura isolada (já coberta por vitals.regeneracaoBuffsFadiga.test.js >
// "pisoFadigaExtra"). Mesmo padrão de mock de useStore/firebase-sync de
// MapaFormContext.combateAutoTurno.test.jsx.
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

function baseState(minhaFicha, overrides = {}) {
    return {
        minhaFicha,
        meuNome: 'Heroi',
        personagens: {},
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        feedCombate: [],
        isMestre: false,
        mesaCriador: '',
        dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
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

async function passarMeuTurno(state, rerender) {
    // chama avancarTurno() (turnoAtualIndex 0(Filler) -> 1(EU), aplicando a conta de início de
    // turno direto), depois reseta o índice pra simular o próximo round recomeçando do Filler.
    // `await act(async ...)` flusha o microtask que libera a trava contra duplo-clique
    // (avancandoTurnoRef) antes da PRÓXIMA chamada de passarMeuTurno.
    await act(async () => { probe.avancarTurno(); });
    act(() => { state.cenario = { ...state.cenario, turnoAtualIndex: 0 }; });
    rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
}

describe('MapaFormContext — integração real do piso de Fadiga (pisoFadigaExtra) no avanço de turno', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => { cleanup(); });

    it('cura total no MESMO tick que gera ganho dinâmico nunca deixa fadigaExtra abaixo do ganho daquele turno', () => {
        const minhaFicha = {
            iniciativa: 10,
            posicao: { x: 0, y: 0, z: 0 },
            acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
            // Vida bem baixa, mas com regeneração enorme (cura pro teto no mesmo tick) —
            // exatamente o cenário que a 3ª correção (piso) existe pra proteger.
            vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 99999999 },
            poderes: [], inventario: [], passivas: [],
            combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        };
        const state = baseState(minhaFicha);
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        // A cura de fato aconteceu neste mesmo tick...
        // 🩸 Vida usa getTetoVida (Break Bars, core/vitals.js) -- o teto NUNCA é maior nem menor
        // que o bruto (base=1e8, exatamente o limiar) -- teto real de cura é o próprio 1e8.
        expect(minhaFicha.vida.atual).toBe(100000000); // teto real
        // ...mas o ganho dinâmico calculado ANTES da cura não pode ter sido mascarado a 0 pelo
        // desconto de Fadiga por Regeneração que roda logo em seguida, no mesmo updateFicha.
        expect(minhaFicha.combate.fadigaExtra).toBeGreaterThan(0);
    });

    // pv/pm ficam de fora tanto de ENERGIAS quanto de EIXOS_FORMAS/vida em core/fadiga.js — ou
    // seja, curar pv NUNCA contribui pro ganho dinâmico (calcularGanhoFadigaDinamico), só pro
    // desconto de Fadiga por Regeneração. Isso permite isolar "ganho deste turno = 0" (vida/
    // energia já cheias, sem Forma ativa) de "regeneração de fato aconteceu neste turno" (pv
    // curado do zero ao teto), sem os dois se contaminarem — o cenário mais direto pra provar
    // que o piso (=0 quando o ganho é 0) realmente deixa o desconto livre para comer fadiga
    // ACUMULADA de turnos anteriores.
    //
    // pv máximo = floor(((bCorpo + bVida + bChakra) / 3) * multiplicadorVida), onde cada b* usa
    // getPrestigioReal (core/prestige.js): floor(base/1e7) pra corpo/chakra (energia), floor(base/1e6)
    // pra vida. Com todos os 3 bases em 1e8: bCorpo=10, bVida=100, bChakra=10 -> pv = floor(120/3) = 40.
    function fichaGanhoZeroComPv(pvAtual, combateOverrides = {}) {
        const statCheio = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0' };
        return {
            iniciativa: 10,
            posicao: { x: 0, y: 0, z: 0 },
            acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
            // "atual" de vida/corpo/chakra fica de fora de propósito -- ambos os fatores (energia
            // gasta e vida perdida) tratam "atual" ausente/NaN como "no teto" (sem gasto/dano),
            // então o ganho dinâmico deste turno fica em exatamente 0.
            vida: { ...statCheio, regeneracao: 0 },
            corpo: { ...statCheio },
            chakra: { ...statCheio },
            multiplicadorVida: 1,
            pv: { atual: pvAtual, regeneracao: 40 },
            poderes: [], inventario: [], passivas: [],
            combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0, ...combateOverrides },
        };
    }

    it('ganho dinâmico deste turno em 0 (vida/energia cheias) -> piso=0 -> o desconto de Fadiga por Regeneração (via cura de pv) come a Fadiga ACUMULADA de turnos anteriores livremente', () => {
        const minhaFicha = fichaGanhoZeroComPv(0, { fadigaExtra: 20 });
        const state = baseState(minhaFicha);
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        // pv curado do zero (0) ao teto (40) -> fração=1.0 -> desconto = 1.0 * 10 = 10 pontos.
        // Ganho dinâmico deste turno = 0 (piso = 0) -> 20 - 10 = 10, exatamente, nada mascarado.
        expect(minhaFicha.pv.atual).toBe(40);
        expect(minhaFicha.combate.fadigaExtra).toBe(10);
    });

    it('em turnos sucessivos: o desconto só volta a agir quando HÁ cura nova naquele tick — depois que pv já está no teto, um segundo turno sem ganho E sem cura nova mantém a Fadiga estável, nunca some sozinha nem "acumula" desconto residual', async () => {
        const minhaFicha = fichaGanhoZeroComPv(0, { fadigaExtra: 40 });
        const state = baseState(minhaFicha);
        const { rerender } = montarComEstado(state);

        // Turno 1: pv cura do zero ao teto (fração=1.0) -> desconto de 10. 40 - 10 = 30.
        await passarMeuTurno(state, rerender);
        expect(minhaFicha.pv.atual).toBe(40);
        expect(minhaFicha.combate.fadigaExtra).toBe(30);

        // Turno 2: pv já está no teto (40) -> aplicarRegeneracaoDeTurno não tem mais nada pra
        // curar nele (atual < mxDisplay é falso) -> fracoesCuradas fica vazio -> SEM desconto
        // nenhum neste tick, mesmo com fadigaExtra ainda > 0. Ganho dinâmico continua 0.
        await passarMeuTurno(state, rerender);
        expect(minhaFicha.pv.atual).toBe(40);
        expect(minhaFicha.combate.fadigaExtra).toBe(30);
    });
});
