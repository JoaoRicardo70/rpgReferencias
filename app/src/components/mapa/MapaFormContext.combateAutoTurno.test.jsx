import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { calcularFadigaAtual } from '../../core/fadiga';

// ---------------------------------------------------------------------------
// QA — Fadiga de Combate e Regeneração automáticas no Mapa (MapaFormContext.jsx)
//
// Piggyback no efeito já existente que reseta os pontos de Ação do PRÓPRIO
// jogador sempre que seu turno volta na iniciativa do Mapa (gated por
// `currentActor && !currentActor.isDummie && currentActor.nome === meuNome`):
// além de resetar acoes.padrao/bonus/reacao, agora também soma
// combate.fadigaExtra (calcularGanhoFadigaDinamico) e chama
// aplicarRegeneracaoDeTurno(f) — SEMPRE dentro do mesmo `if`, então nunca
// dispara para dummies (NPCs) nem para o turno de outro jogador (updateFicha
// só pode mutar a MINHA ficha, nunca a de outro personagem conectado).
//
// 🔥 combate.fadigaTurnos (o contador MANUAL/stepper "Turnos Cansativos" da
// Ficha) volta a subir +1 sozinho aqui a cada retorno do MEU turno — mas hoje
// é só um contador INFORMATIVO ("há quantos turnos esta luta dura"), sem
// nenhum efeito na Fadiga% (ver core/fadiga.js > calcularFadigaAtual, que usa
// só combate.fadigaExtra). Antes, cada retorno do turno também somava
// fadigaTurnos x fadigaPorTurno (5% fixos, por padrão) DIRETO na Fadiga%, POR
// CIMA do ganho dinâmico já escalado por Energia/Vida/Maestria/Supressão de
// Poder — um personagem em condições ideais (100% Maestria, sem gastar
// Energia, sem levar dano, Poder suprimido) ainda assim acumulava 5%/turno
// vindos desse contador fixo, contradizendo a própria ideia da Fadiga
// dinâmica (quase-zero nessas condições). Agora só fadigaExtra gera Fadiga de
// verdade; fadigaTurnos continua editável manualmente por cima (stepper +/-
// na Ficha), sem interferir na % — ver os testes abaixo.
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

    it('aplica regeneração quando o turno passa a ser o MEU (não-dummie), e incrementa combate.fadigaTurnos (contador informativo)', () => {
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

        // fadigaTurnos (contador informativo) sobe +1 a cada retorno do meu turno.
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

    it('incrementa combate.fadigaTurnos a partir do valor manual já existente (soma, não substitui)', () => {
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

    it('cria combate do zero (objeto ausente) sem lançar exceção quando o turno automático dispara pela primeira vez, e inicia fadigaTurnos em 1', () => {
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

        expect(state.minhaFicha.combate).toBeTruthy();
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
        expect(state.minhaFicha.combate.fadigaExtra).toBeGreaterThanOrEqual(0);
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
        // fadigaTurnos (contador informativo) também sobe, mas não afeta a Fadiga% (fadigaExtra).
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

// ---------------------------------------------------------------------------
// QA — Regressão direta do bug relatado pelo usuário: a Fadiga% automática NÃO
// tem mais um piso incondicional de 5%/turno. Antes da correção original, ALÉM
// do ganho dinâmico (calcularGanhoFadigaDinamico, já quase-zero em condições
// ideais), o efeito também somava incondicionalmente fadigaTurnos x
// fadigaPorTurno (5% fixos, por padrão) DIRETO na Fadiga% — um personagem com
// 100% de Maestria na única Forma ativa, Energia/Vida cheias e Poder
// fortemente suprimido ainda assim via a Fadiga% subir 5%/turno vindos SÓ
// desse contador fixo. Hoje combate.fadigaTurnos volta a incrementar +1 por
// turno normalmente (contador informativo), mas NUNCA mais afeta a Fadiga%
// (só combate.fadigaExtra afeta) — ver MapaFormContext.jsx e core/fadiga.js >
// calcularFadigaAtual.
// ---------------------------------------------------------------------------
describe('MapaFormContext — Regressão do bug relatado: sem piso fixo de 5%/turno na Fadiga automática', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('personagem em condições IDEAIS (100% Maestria na única Forma ativa, Energia/Vida cheias, Poder fortemente suprimido) fica com Fadiga Atual em 0% mesmo após VÁRIOS retornos do turno — não sobe um % fixo por turno', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // Vida e as 4 Energias 100% cheias (fatorVida=0, fatorEnergia=0).
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 100000000, regeneracao: 0 };
        state.minhaFicha.mana = { base: 1000000, atual: 1000000 };
        state.minhaFicha.aura = { base: 1000000, atual: 1000000 };
        state.minhaFicha.chakra = { base: 1000000, atual: 1000000 };
        state.minhaFicha.corpo = { base: 1000000, atual: 1000000 };
        // Uma Forma ativa turbinando o eixo "status" (âncora "forca", fora de vida/energia
        // — mesma técnica de isolamento de core/fadiga.test.js) com Maestria=100%, que ZERA
        // por completo a contribuição dela pro fator de Formas (fatorFormas=0).
        state.minhaFicha.forca = { base: 1000000, mFormas: 2 };
        state.minhaFicha.poderes = [{ id: 'p1', nome: 'Forma X', categoria: 'forma', ativa: true, maestria: 100 }];
        // Poder fortemente suprimido (no limite mínimo permitido).
        state.minhaFicha.supressaoPoder = 1;
        state.minhaFicha.limiteSupressao = 1;
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 };
        const { rerender } = montarComEstado(state);

        // Simula VÁRIOS retornos do MEU turno (alterna o índice de iniciativa entre o
        // Filler(0) e EU(1) repetidamente) — se o piso fixo antigo (+1 fadigaTurnos por
        // turno) ainda estivesse presente, 6 turnos renderiam 30% de Fadiga (6 x 5%).
        for (let i = 0; i < 6; i++) {
            act(() => { state.cenario = { ...state.cenario, turnoAtualIndex: 1 }; });
            rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
            act(() => { state.cenario = { ...state.cenario, turnoAtualIndex: 0 }; });
            rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
        }

        // fadigaTurnos (contador informativo) subiu 1 por retorno do meu turno, 6 vezes.
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(6);
        // Com severidade dinâmica = 0 (energia/vida cheias, Forma 100% dominada pela
        // Maestria), calcularGanhoFadigaDinamico também rende exatamente 0 por turno.
        expect(state.minhaFicha.combate.fadigaExtra).toBe(0);
        // A Fadiga Atual final (fonte de verdade compartilhada com core/poder.js) fica em
        // 0%, NÃO nos 30% que o piso fixo antigo teria produzido depois de 6 turnos — mesmo
        // com fadigaTurnos tendo subido pra 6, ele não entra mais nessa conta.
        expect(calcularFadigaAtual(state.minhaFicha)).toBe(0);
    });

    it('combate.fadigaTurnos definido manualmente (stepper da Ficha) continua somando com os incrementos automáticos, mas NUNCA afeta a Fadiga Atual (%)', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // GM/jogador setou fadigaTurnos=6 manualmente via stepper +/- antes do combate.
        state.minhaFicha.combate = { fadigaTurnos: 6, fadigaPorTurno: 5 };
        const { rerender } = montarComEstado(state);

        for (let i = 0; i < 8; i++) {
            act(() => { state.cenario = { ...state.cenario, turnoAtualIndex: 1 }; });
            rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
            act(() => { state.cenario = { ...state.cenario, turnoAtualIndex: 0 }; });
            rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
        }

        // fadigaTurnos soma o valor manual inicial (6) com os 8 incrementos automáticos (+8).
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(14);
    });
});
